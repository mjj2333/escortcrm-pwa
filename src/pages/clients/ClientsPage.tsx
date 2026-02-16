import { useLiveQuery } from 'dexie-react-hooks'
import { Plus, Search, UserX, Pin, ArrowDownUp } from 'lucide-react'
import { useState, useRef, useCallback } from 'react'
import { db } from '../../db'
import { PageHeader } from '../../components/PageHeader'
import { StatusBadge } from '../../components/StatusBadge'
import { MiniTags } from '../../components/TagPicker'
import { EmptyState } from '../../components/EmptyState'
import { ClientEditor } from './ClientEditor'
import { screeningStatusColors, riskLevelColors } from '../../types'
import type { Client } from '../../types'

import { ImportExportModal } from '../../components/ImportExport'

interface ClientsPageProps {
  onOpenClient: (clientId: string) => void
}

export function ClientsPage({ onOpenClient }: ClientsPageProps) {
  const [search, setSearch] = useState('')
  const [showEditor, setShowEditor] = useState(false)
  const [showImportExport, setShowImportExport] = useState(false)
  const [showBlocked, setShowBlocked] = useState(false)
  const [pinnedToast, setPinnedToast] = useState<{ id: string; pinned: boolean } | null>(null)
  const clients = useLiveQuery(() => db.clients.orderBy('alias').toArray()) ?? []

  const blockedCount = clients.filter(c => c.isBlocked).length

  const filtered = clients
    .filter(c => showBlocked ? c.isBlocked : !c.isBlocked)
    .filter(c =>
      !search || c.alias.toLowerCase().includes(search.toLowerCase()) ||
      c.realName?.toLowerCase().includes(search.toLowerCase()) ||
      c.phone?.includes(search)
    )
    .sort((a, b) => {
      if (!showBlocked && a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1
      return a.alias.localeCompare(b.alias)
    })

  const togglePin = useCallback(async (clientId: string) => {
    const client = clients.find(c => c.id === clientId)
    if (!client) return
    const newPinned = !client.isPinned
    await db.clients.update(clientId, { isPinned: newPinned })
    if (navigator.vibrate) navigator.vibrate(30)
    setPinnedToast({ id: clientId, pinned: newPinned })
    setTimeout(() => setPinnedToast(null), 1500)
  }, [clients])

  return (
    <div className="pb-20">
      <PageHeader title="Clients">
        <button onClick={() => setShowImportExport(true)} className="p-2 rounded-lg" style={{ color: 'var(--text-secondary)' }}>
          <ArrowDownUp size={18} />
        </button>
        <button onClick={() => setShowEditor(true)} className="p-2 rounded-lg text-purple-500">
          <Plus size={20} />
        </button>
      </PageHeader>

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

        {/* Active / Blocked filter */}
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
              Blocked ({blockedCount})
            </button>
          </div>
        )}
      </div>

      <div className="px-4 py-3 max-w-lg mx-auto">
        {filtered.length === 0 ? (
          <EmptyState
            icon={<UserX size={40} />}
            title={showBlocked ? 'No blocked clients' : search ? 'No matches' : 'No clients yet'}
            description={showBlocked ? 'Blocked clients will appear here' : search ? `No clients match "${search}"` : 'Add your first client to get started'}
          />
        ) : (
          <div className="space-y-2">
            {filtered.map(client => (
              <ClientRow
                key={client.id}
                client={client}
                onOpen={() => onOpenClient(client.id)}
                onTogglePin={() => togglePin(client.id)}
                showPinToast={pinnedToast?.id === client.id}
                pinToastValue={pinnedToast?.pinned ?? false}
              />
            ))}
          </div>
        )}
      </div>

      <ClientEditor isOpen={showEditor} onClose={() => setShowEditor(false)} />
      <ImportExportModal isOpen={showImportExport} onClose={() => setShowImportExport(false)} initialTab="clients" />
    </div>
  )
}

function ClientRow({ client, onOpen, onTogglePin, showPinToast, pinToastValue }: {
  client: Client; onOpen: () => void; onTogglePin: () => void
  showPinToast: boolean; pinToastValue: boolean
}) {
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const didLongPress = useRef(false)
  const startPos = useRef({ x: 0, y: 0 })

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
    if (!didLongPress.current) onOpen()
  }

  function handlePointerCancel() {
    if (longPressTimer.current) clearTimeout(longPressTimer.current)
  }

  return (
    <div
      className="flex items-center gap-3 p-3 rounded-xl border cursor-pointer active:scale-[0.98] transition-transform select-none relative"
      style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', touchAction: 'pan-y' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onContextMenu={e => e.preventDefault()}
    >
      <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
        style={{ backgroundColor: 'rgba(168,85,247,0.15)' }}>
        <span className="text-sm font-bold text-purple-500">{client.alias.charAt(0).toUpperCase()}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {client.isPinned && <Pin size={11} className="text-purple-400 shrink-0" />}
          <p className="font-medium text-sm truncate" style={{ color: 'var(--text-primary)' }}>
            {client.realName ?? client.alias}
          </p>
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

      {showPinToast && (
        <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/70 z-10">
          <div className="flex items-center gap-2">
            <Pin size={16} className="text-purple-400" />
            <span className="text-sm font-semibold text-white">{pinToastValue ? 'Pinned' : 'Unpinned'}</span>
          </div>
        </div>
      )}
    </div>
  )
}
