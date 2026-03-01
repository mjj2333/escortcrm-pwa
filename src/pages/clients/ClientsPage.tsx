import { useLiveQuery } from 'dexie-react-hooks'
import { Plus, Search, UserX, Pin, ArrowDownUp } from 'lucide-react'
import { useState, useRef, useCallback } from 'react'
import { db } from '../../db'
import { PageHeader } from '../../components/PageHeader'
import { StatusBadge } from '../../components/StatusBadge'
import { MiniTags } from '../../components/TagPicker'
import { VerifiedBadge } from '../../components/VerifiedBadge'
import { EmptyState } from '../../components/EmptyState'
import { ClientEditor } from './ClientEditor'
import { screeningStatusColors, riskLevelColors } from '../../types'
import { ClientsPageSkeleton } from '../../components/Skeleton'
import { usePlanLimits, isPro } from '../../components/planLimits'
import type { Client } from '../../types'

import { ImportExportModal } from '../../components/ImportExport'

type SortMode = 'az' | 'recent' | 'newest'

interface ClientsPageProps {
  onOpenClient: (clientId: string) => void
}

export function ClientsPage({ onOpenClient }: ClientsPageProps) {
  const [search, setSearch] = useState('')
  const [showEditor, setShowEditor] = useState(false)
  const [showImportExport, setShowImportExport] = useState(false)
  const [showBlocked, setShowBlocked] = useState(false)
  const [sortMode, setSortMode] = useState<SortMode>('az')
  const [pinnedToast, setPinnedToast] = useState<{ id: string; pinned: boolean } | null>(null)
  const [renderLimit, setRenderLimit] = useState(50)
  const limits = usePlanLimits()
  const clients = useLiveQuery(() => db.clients.orderBy('alias').toArray())

  const fireClient = useCallback(async (clientId: string) => {
    await db.clients.update(clientId, { isBlocked: true })
  }, [])

  const togglePin = useCallback(async (clientId: string) => {
    const client = await db.clients.get(clientId)
    if (!client) return
    const newPinned = !client.isPinned
    await db.clients.update(clientId, { isPinned: newPinned })
    if (navigator.vibrate) navigator.vibrate(30)
    setPinnedToast({ id: clientId, pinned: newPinned })
    setTimeout(() => setPinnedToast(null), 1500)
  }, [])

  if (clients === undefined) return <ClientsPageSkeleton />

  const blockedCount = clients.filter(c => c.isBlocked).length

  const filtered = clients
    .filter(c => showBlocked ? c.isBlocked : !c.isBlocked)
    .filter(c =>
      !search || c.alias.toLowerCase().includes(search.toLowerCase()) ||
      c.nickname?.toLowerCase().includes(search.toLowerCase()) ||
      c.phone?.includes(search)
    )
    .sort((a, b) => {
      if (!showBlocked && a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1
      switch (sortMode) {
        case 'recent': {
          const aTime = a.lastSeen ? new Date(a.lastSeen).getTime() : 0
          const bTime = b.lastSeen ? new Date(b.lastSeen).getTime() : 0
          if (aTime !== bTime) return bTime - aTime
          return a.alias.localeCompare(b.alias)
        }
        case 'newest': {
          const aTime = a.dateAdded ? new Date(a.dateAdded).getTime() : 0
          const bTime = b.dateAdded ? new Date(b.dateAdded).getTime() : 0
          if (aTime !== bTime) return bTime - aTime
          return a.alias.localeCompare(b.alias)
        }
        default:
          return a.alias.localeCompare(b.alias)
      }
    })


  return (
    <div className="pb-20">
      <PageHeader title="Clients">
        {isPro() && (
          <button onClick={() => setShowImportExport(true)} className="p-2 rounded-lg" style={{ color: 'var(--text-secondary)' }}>
            <ArrowDownUp size={18} />
          </button>
        )}
        <button onClick={() => setShowEditor(true)}
          className={`p-2 rounded-lg ${limits.canAddClient ? 'text-purple-500' : ''}`}
          style={!limits.canAddClient ? { color: 'var(--text-secondary)', opacity: 0.5 } : {}}>
          <Plus size={20} />
        </button>
      </PageHeader>

      {!limits.isPro && (
        <div className="px-4 pt-2 pb-1">
          <p className="text-[10px] text-center" style={{ color: 'var(--text-secondary)' }}>
            {limits.clientCount} / {limits.clientLimit} clients on free plan
          </p>
        </div>
      )}

      <div className="px-4 pt-3">
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)' }}>
          <Search size={16} style={{ color: 'var(--text-secondary)' }} />
          <input
            type="text" placeholder="Search clients..." value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: 'var(--text-primary)' }}
          />
        </div>

        {/* Active / Blacklisted filter */}
        {blockedCount > 0 && (
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => setShowBlocked(false)}
              className="text-xs font-semibold px-3 py-1.5 rounded-full"
              style={{
                backgroundColor: !showBlocked ? '#a855f7' : 'var(--bg-secondary)',
                color: !showBlocked ? '#fff' : 'var(--text-secondary)',
              }}
            >
              Active ({clients.filter(c => !c.isBlocked).length})
            </button>
            <button
              onClick={() => setShowBlocked(true)}
              className="text-xs font-semibold px-3 py-1.5 rounded-full"
              style={{
                backgroundColor: showBlocked ? '#ef4444' : 'var(--bg-secondary)',
                color: showBlocked ? '#fff' : 'var(--text-secondary)',
              }}
            >
              Blacklisted ({blockedCount})
            </button>
          </div>
        )}

        {/* Sort options */}
        <div className="flex gap-2 mt-2">
          {([['az', 'A–Z'], ['recent', 'Last Seen'], ['newest', 'Newest']] as [SortMode, string][]).map(([mode, label]) => (
            <button
              key={mode}
              onClick={() => setSortMode(mode)}
              className="text-[10px] font-semibold px-2.5 py-2 rounded-full"
              style={{
                backgroundColor: sortMode === mode ? 'var(--bg-card)' : 'transparent',
                color: sortMode === mode ? 'var(--text-primary)' : 'var(--text-secondary)',
                border: sortMode === mode ? '1px solid var(--border)' : '1px solid transparent',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 py-3 max-w-lg mx-auto">
        {filtered.length === 0 ? (
          <EmptyState
            icon={<UserX size={40} />}
            title={showBlocked ? 'No blacklisted clients' : search ? 'No matches' : 'No clients yet'}
            description={showBlocked ? 'Blacklisted clients will appear here' : search ? `No clients match "${search}"` : 'Add your first client to get started'}
          />
        ) : (
          <div className="space-y-2">
            {filtered.slice(0, renderLimit).map(client => (
              <ClientRow
                key={client.id}
                client={client}
                onOpen={() => onOpenClient(client.id)}
                onTogglePin={() => togglePin(client.id)}
                onFire={() => fireClient(client.id)}
                showPinToast={pinnedToast?.id === client.id}
                pinToastValue={pinnedToast?.pinned ?? false}
              />
            ))}
            {filtered.length > renderLimit && (
              <button
                onClick={() => setRenderLimit(l => l + 50)}
                className="w-full py-3 text-sm font-medium rounded-xl active:scale-[0.98]"
                style={{ color: 'var(--text-secondary)', backgroundColor: 'var(--bg-secondary)' }}
              >
                Show more ({filtered.length - renderLimit} remaining)
              </button>
            )}
          </div>
        )}
      </div>

      <ClientEditor isOpen={showEditor} onClose={() => setShowEditor(false)} />
      <ImportExportModal isOpen={showImportExport} onClose={() => setShowImportExport(false)} initialTab="clients" />
    </div>
  )
}

function ClientRow({ client, onOpen, onTogglePin, onFire, showPinToast, pinToastValue }: {
  client: Client; onOpen: () => void; onTogglePin: () => void; onFire: () => void
  showPinToast: boolean; pinToastValue: boolean
}) {
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const didLongPress = useRef(false)
  const startPos = useRef({ x: 0, y: 0 })

  // 🔥 Easter egg: 6 rapid taps on avatar
  const tapCount = useRef(0)
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [isBurning, setIsBurning] = useState(false)
  const [burnPhase, setBurnPhase] = useState(0) // 0=idle, 1=flames, 2=text, 3=collapse

  function handleAvatarTap(e: React.PointerEvent) {
    e.stopPropagation()
    if (isBurning) return

    tapCount.current += 1
    if (tapTimer.current) clearTimeout(tapTimer.current)
    tapTimer.current = setTimeout(() => { tapCount.current = 0 }, 3000)

    if (tapCount.current >= 6) {
      tapCount.current = 0
      if (tapTimer.current) clearTimeout(tapTimer.current)
      triggerFire()
    }
  }

  function triggerFire() {
    setIsBurning(true)
    setBurnPhase(1)
    setTimeout(() => setBurnPhase(2), 1800)
    setTimeout(() => setBurnPhase(3), 4500)
    setTimeout(() => {
      onFire()
    }, 6000)
  }

  function handlePointerDown(e: React.PointerEvent) {
    didLongPress.current = false
    startPos.current = { x: e.clientX, y: e.clientY }
    longPressTimer.current = setTimeout(() => {
      didLongPress.current = true
      onTogglePin()
    }, 500)
  }

  function handlePointerMove(e: React.PointerEvent) {
    const dx = Math.abs(e.clientX - startPos.current.x)
    const dy = Math.abs(e.clientY - startPos.current.y)
    if (dx > 10 || dy > 10) {
      if (longPressTimer.current) clearTimeout(longPressTimer.current)
    }
  }

  function handlePointerUp() {
    if (longPressTimer.current) clearTimeout(longPressTimer.current)
    if (!didLongPress.current && !isBurning) onOpen()
  }

  function handlePointerCancel() {
    if (longPressTimer.current) clearTimeout(longPressTimer.current)
  }

  return (
    <div
      className="flex items-center gap-3 p-3 rounded-xl border cursor-pointer active:scale-[0.98] transition-transform select-none relative overflow-hidden"
      style={{
        backgroundColor: 'var(--bg-card)',
        borderColor: isBurning ? 'transparent' : 'var(--border)',
        touchAction: 'pan-y',
        animation: burnPhase === 3 ? 'fireCollapse 1.5s ease-in forwards' : undefined,
      }}
      onPointerDown={isBurning ? undefined : handlePointerDown}
      onPointerMove={isBurning ? undefined : handlePointerMove}
      onPointerUp={isBurning ? undefined : handlePointerUp}
      onPointerCancel={isBurning ? undefined : handlePointerCancel}
      onContextMenu={e => e.preventDefault()}
    >
      {/* Avatar — secret tap target */}
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 relative z-20"
        style={{ backgroundColor: 'rgba(168,85,247,0.15)' }}
        onPointerDown={e => e.stopPropagation()}
        onPointerUp={handleAvatarTap}
      >
        <span className="text-sm font-bold text-purple-500">{client.alias.charAt(0).toUpperCase()}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {client.isPinned && <Pin size={11} className="text-purple-400 shrink-0" />}
          <p className="font-medium text-sm truncate" style={{ color: 'var(--text-primary)' }}>
            {client.alias}<VerifiedBadge client={client} size={13} />
          </p>
          {client.nickname && client.nickname !== client.alias && (
            <span className="text-[10px] shrink-0" style={{ color: 'var(--text-secondary)' }}>
              ({client.nickname})
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <StatusBadge text={client.screeningStatus} color={screeningStatusColors[client.screeningStatus]} />
          {client.riskLevel !== 'Unknown' && (
            <StatusBadge text={client.riskLevel} color={riskLevelColors[client.riskLevel]} />
          )}
          {client.tags.length > 0 && <MiniTags tags={client.tags} max={3} />}
        </div>
      </div>
      {client.riskLevel === 'High Risk' && <span className="text-red-500 text-sm">⚠️</span>}

      {/* Pin toast */}
      {showPinToast && (
        <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/70 z-10">
          <div className="flex items-center gap-2">
            <Pin size={16} className="text-purple-400" />
            <span className="text-sm font-semibold text-white">{pinToastValue ? 'Pinned' : 'Unpinned'}</span>
          </div>
        </div>
      )}

      {/* 🔥 Fire animation overlay */}
      {isBurning && (
        <>
          {/* Flames from bottom */}
          <div className="absolute inset-0 z-30 pointer-events-none" style={{ animation: 'fireRise 4s ease-in forwards' }}>
            <div className="absolute bottom-0 left-0 right-0" style={{ height: '200%' }}>
              {/* Multiple flame layers for depth */}
              <div className="absolute inset-0" style={{
                background: 'linear-gradient(to top, #ff4500 0%, #ff6a00 20%, #ff8c00 40%, #ffa500 55%, #ffcc00 70%, transparent 100%)',
                animation: 'flameFlicker 0.25s infinite alternate',
                opacity: 0.9,
              }} />
              <div className="absolute inset-0" style={{
                background: 'linear-gradient(to top, #ff2200 0%, #ff4500 25%, #ff6a00 45%, transparent 80%)',
                animation: 'flameFlicker2 0.35s infinite alternate',
                opacity: 0.7,
              }} />
              {/* Ember particles */}
              <div className="absolute w-2 h-2 rounded-full" style={{
                backgroundColor: '#ffcc00', left: '20%', bottom: '60%', boxShadow: '0 0 6px #ff6a00',
                animation: 'emberFloat 1.5s ease-out infinite',
              }} />
              <div className="absolute w-1.5 h-1.5 rounded-full" style={{
                backgroundColor: '#ff8c00', left: '55%', bottom: '50%', boxShadow: '0 0 4px #ff4500',
                animation: 'emberFloat 1.2s 0.3s ease-out infinite',
              }} />
              <div className="absolute w-1 h-1 rounded-full" style={{
                backgroundColor: '#ffdd00', left: '75%', bottom: '55%', boxShadow: '0 0 5px #ff6a00',
                animation: 'emberFloat 1.8s 0.5s ease-out infinite',
              }} />
            </div>
          </div>

          {/* Darkening overlay */}
          <div className="absolute inset-0 z-30 pointer-events-none rounded-xl"
            style={{
              background: burnPhase >= 2
                ? 'radial-gradient(ellipse at center, rgba(0,0,0,0.85) 0%, rgba(20,0,0,0.95) 100%)'
                : 'transparent',
              transition: 'background 0.8s ease-in',
            }}
          />

          {/* FIRED text */}
          {burnPhase >= 2 && (
            <div className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none">
              <div style={{ animation: 'fireTextSlam 0.7s cubic-bezier(0.17, 0.67, 0.35, 1.3) forwards' }}>
                <p className="text-2xl font-black tracking-wider text-center" style={{
                  color: '#ff4500',
                  textShadow: '0 0 20px #ff6a00, 0 0 40px #ff4500, 0 0 60px #ff2200, 0 2px 4px rgba(0,0,0,0.8)',
                  animation: 'fireTextGlow 0.5s infinite alternate',
                }}>
                  FIRED
                </p>
                <p className="text-center text-xs mt-1 font-semibold" style={{
                  color: '#ffcc00',
                  textShadow: '0 0 10px #ff8c00',
                  animation: 'fadeIn 0.5s 0.4s both',
                }}>
                  🔥🔥🔥
                </p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// 🔥 Fire animation keyframes — injected once
const fireStyleId = 'fire-easter-egg-styles'
if (typeof document !== 'undefined' && !document.getElementById(fireStyleId)) {
  const style = document.createElement('style')
  style.id = fireStyleId
  style.textContent = `
    @keyframes fireRise {
      0% { transform: translateY(100%); }
      30% { transform: translateY(40%); }
      60% { transform: translateY(10%); }
      100% { transform: translateY(-10%); }
    }
    @keyframes flameFlicker {
      0% { transform: scaleX(1) scaleY(1); }
      100% { transform: scaleX(1.03) scaleY(1.02); }
    }
    @keyframes flameFlicker2 {
      0% { transform: scaleX(1.02) skewX(-1deg); }
      100% { transform: scaleX(0.98) skewX(1deg); }
    }
    @keyframes emberFloat {
      0% { transform: translateY(0) scale(1); opacity: 1; }
      100% { transform: translateY(-50px) scale(0); opacity: 0; }
    }
    @keyframes fireTextSlam {
      0% { transform: scale(3); opacity: 0; }
      50% { transform: scale(0.85); opacity: 1; }
      70% { transform: scale(1.05); opacity: 1; }
      100% { transform: scale(1); opacity: 1; }
    }
    @keyframes fireTextGlow {
      0% { text-shadow: 0 0 20px #ff6a00, 0 0 40px #ff4500, 0 0 60px #ff2200, 0 2px 4px rgba(0,0,0,0.8); }
      100% { text-shadow: 0 0 30px #ffcc00, 0 0 50px #ff6a00, 0 0 70px #ff4500, 0 2px 4px rgba(0,0,0,0.8); }
    }
    @keyframes fireCollapse {
      0% { transform: scaleY(1); opacity: 1; max-height: 100px; margin-bottom: 8px; }
      60% { transform: scaleY(0.6); opacity: 0.6; }
      100% { transform: scaleY(0); opacity: 0; max-height: 0; margin-bottom: 0; padding: 0; overflow: hidden; }
    }
    @keyframes fadeIn {
      0% { opacity: 0; }
      100% { opacity: 1; }
    }
  `
  document.head.appendChild(style)
}
