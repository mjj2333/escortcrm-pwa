// ClientMergeModal — merge two client records into one.
//
// Flow:
//   1. User arrives with a "source" client (the one they want to discard).
//   2. They search for and select the "target" client (the one to keep).
//   3. For each field that differs, they choose which value to keep.
//   4. On confirm: all bookings/incidents re-pointed to target, source deleted.

import { useState, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Search, ArrowRight, Check, ChevronDown, ChevronUp } from 'lucide-react'
import { format } from 'date-fns'
import { db } from '../../db'
import { Modal } from '../../components/Modal'
import { showToast } from '../../components/Toast'
import type { Client, ClientTag } from '../../types'

interface ClientMergeModalProps {
  isOpen: boolean
  onClose: () => void
  sourceClient: Client          // the client being viewed / "discarded"
  onMergeComplete: () => void   // navigate away after source is deleted
}

// ── Merge helpers ─────────────────────────────────────────

function fmtDate(d?: Date | null): string {
  if (!d) return '—'
  const dt = d instanceof Date ? d : new Date(d)
  return isNaN(dt.getTime()) ? '—' : format(dt, 'MMM d, yyyy')
}

function dedupeTags(a: ClientTag[], b: ClientTag[]): ClientTag[] {
  const seen = new Set(a.map(t => t.name.toLowerCase()))
  const merged = [...a]
  for (const t of b) {
    if (!seen.has(t.name.toLowerCase())) {
      seen.add(t.name.toLowerCase())
      merged.push(t)
    }
  }
  return merged
}

type FieldChoice = 'source' | 'target'

interface MergeField {
  key: string
  label: string
  sourceVal: string
  targetVal: string
  default: FieldChoice
}

function buildMergeFields(source: Client, target: Client): MergeField[] {
  const fields: MergeField[] = []

  function add(key: string, label: string, sv: string, tv: string, def: FieldChoice) {
    if (sv !== tv) fields.push({ key, label, sourceVal: sv, targetVal: tv, default: def })
  }

  add('alias', 'Alias', source.alias, target.alias, 'target')
  add('realName', 'Real Name', source.realName ?? '—', target.realName ?? '—', target.realName ? 'target' : 'source')
  add('phone', 'Phone', source.phone ?? '—', target.phone ?? '—', target.phone ? 'target' : 'source')
  add('email', 'Email', source.email ?? '—', target.email ?? '—', target.email ? 'target' : 'source')
  add('preferredContact', 'Preferred Contact', source.preferredContact, target.preferredContact, 'target')
  add('screeningStatus', 'Screening', source.screeningStatus, target.screeningStatus,
    // prefer more advanced screening
    (['Screened', 'In Progress', 'Unscreened'] as const).indexOf(source.screeningStatus) <
    (['Screened', 'In Progress', 'Unscreened'] as const).indexOf(target.screeningStatus)
      ? 'source' : 'target')
  add('riskLevel', 'Risk Level', source.riskLevel, target.riskLevel,
    // prefer higher risk level (safer to err high)
    (['High Risk', 'Medium Risk', 'Low Risk', 'Unknown'] as const).indexOf(source.riskLevel) <
    (['High Risk', 'Medium Risk', 'Low Risk', 'Unknown'] as const).indexOf(target.riskLevel)
      ? 'source' : 'target')
  add('notes', 'Notes', source.notes || '—', target.notes || '—', target.notes ? 'target' : 'source')
  add('preferences', 'Preferences', source.preferences || '—', target.preferences || '—', target.preferences ? 'target' : 'source')
  add('boundaries', 'Boundaries', source.boundaries || '—', target.boundaries || '—', target.boundaries ? 'target' : 'source')
  add('referenceSource', 'Reference Source', source.referenceSource ?? '—', target.referenceSource ?? '—', target.referenceSource ? 'target' : 'source')
  add('verificationNotes', 'Verification Notes', source.verificationNotes ?? '—', target.verificationNotes ?? '—', target.verificationNotes ? 'target' : 'source')
  add('birthday', 'Birthday', fmtDate(source.birthday), fmtDate(target.birthday), target.birthday ? 'target' : 'source')
  add('clientSince', 'Client Since', fmtDate(source.clientSince), fmtDate(target.clientSince),
    // prefer earliest clientSince
    source.clientSince && target.clientSince && new Date(source.clientSince) < new Date(target.clientSince)
      ? 'source' : 'target')

  return fields
}

// ── Component ─────────────────────────────────────────────

export function ClientMergeModal({ isOpen, onClose, sourceClient, onMergeComplete }: ClientMergeModalProps) {
  const [step, setStep] = useState<'pick' | 'review'>('pick')
  const [search, setSearch] = useState('')
  const [targetClient, setTargetClient] = useState<Client | null>(null)
  const [choices, setChoices] = useState<Record<string, FieldChoice>>({})
  const [showAllFields, setShowAllFields] = useState(false)
  const [working, setWorking] = useState(false)

  const allClients = useLiveQuery(() => db.clients.toArray()) ?? []

  const searchResults = useMemo(() => {
    if (!search.trim()) return []
    const q = search.toLowerCase()
    return allClients
      .filter(c => c.id !== sourceClient.id)
      .filter(c =>
        c.alias.toLowerCase().includes(q) ||
        c.realName?.toLowerCase().includes(q) ||
        c.phone?.includes(q)
      )
      .slice(0, 8)
  }, [allClients, search, sourceClient.id])

  const mergeFields = useMemo(() => {
    if (!targetClient) return []
    return buildMergeFields(sourceClient, targetClient)
  }, [sourceClient, targetClient])

  // Count related records
  const sourceBookingCount = useLiveQuery(
    () => targetClient ? db.bookings.where('clientId').equals(sourceClient.id).count() : Promise.resolve(0),
    [targetClient, sourceClient.id]
  ) ?? 0
  const sourceIncidentCount = useLiveQuery(
    () => targetClient ? db.incidents.where('clientId').equals(sourceClient.id).count() : Promise.resolve(0),
    [targetClient, sourceClient.id]
  ) ?? 0

  function handleSelectTarget(client: Client) {
    setTargetClient(client)
    // Initialise choices to defaults
    const fields = buildMergeFields(sourceClient, client)
    const initial: Record<string, FieldChoice> = {}
    fields.forEach(f => { initial[f.key] = f.default })
    setChoices(initial)
    setSearch('')
    setStep('review')
  }

  function resolveField<K extends keyof Client>(key: K): Client[K] {
    if (!targetClient) return sourceClient[key]
    const pick = choices[key] ?? 'target'
    return pick === 'source' ? sourceClient[key] : targetClient[key]
  }

  async function executeMerge() {
    if (!targetClient) return
    setWorking(true)

    try {
      // 1. Build merged client record (keep target.id)
      const merged: Partial<Client> = {
        alias:             resolveField('alias'),
        realName:          resolveField('realName'),
        phone:             resolveField('phone'),
        email:             resolveField('email'),
        preferredContact:  resolveField('preferredContact'),
        screeningStatus:   resolveField('screeningStatus'),
        riskLevel:         resolveField('riskLevel'),
        isBlocked:         sourceClient.isBlocked || targetClient.isBlocked, // either blocked → blocked
        notes:             resolveField('notes'),
        preferences:       resolveField('preferences'),
        boundaries:        resolveField('boundaries'),
        referenceSource:   resolveField('referenceSource'),
        verificationNotes: resolveField('verificationNotes'),
        birthday:          resolveField('birthday'),
        clientSince:       resolveField('clientSince'),
        // Always use earliest dateAdded
        dateAdded: sourceClient.dateAdded && targetClient.dateAdded
          ? new Date(Math.min(new Date(sourceClient.dateAdded).getTime(), new Date(targetClient.dateAdded).getTime()))
          : targetClient.dateAdded ?? sourceClient.dateAdded,
        // Always use most recent lastSeen
        lastSeen: sourceClient.lastSeen && targetClient.lastSeen
          ? new Date(Math.max(new Date(sourceClient.lastSeen).getTime(), new Date(targetClient.lastSeen).getTime()))
          : sourceClient.lastSeen ?? targetClient.lastSeen,
        // Tags: merge both
        tags: dedupeTags(targetClient.tags, sourceClient.tags),
        // Prefer pinned or safety check if either has it
        isPinned: sourceClient.isPinned || targetClient.isPinned,
        requiresSafetyCheck: sourceClient.requiresSafetyCheck || targetClient.requiresSafetyCheck,
      }

      // 2. Re-point bookings from source → target
      const sourceBookings = await db.bookings.where('clientId').equals(sourceClient.id).toArray()
      for (const b of sourceBookings) {
        await db.bookings.update(b.id, { clientId: targetClient.id })
      }

      // 3. Re-point incidents from source → target
      const sourceIncidents = await db.incidents.where('clientId').equals(sourceClient.id).toArray()
      for (const inc of sourceIncidents) {
        await db.incidents.update(inc.id, { clientId: targetClient.id })
      }

      // 4. Apply merged fields to target
      await db.clients.update(targetClient.id, merged)

      // 5. Delete source
      await db.clients.delete(sourceClient.id)

      showToast(`Merged into ${targetClient.alias}`)
      onMergeComplete()
    } catch (err) {
      showToast(`Merge failed: ${(err as Error).message}`, 'error')
      setWorking(false)
    }
  }

  // Reset on close
  function handleClose() {
    setStep('pick')
    setSearch('')
    setTargetClient(null)
    setChoices({})
    setShowAllFields(false)
    setWorking(false)
    onClose()
  }

  const diffFields = mergeFields
  const visibleFields = showAllFields ? diffFields : diffFields.slice(0, 5)

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={step === 'pick' ? 'Merge Client' : 'Review Merge'}
      actions={
        step === 'review' && targetClient ? (
          <button
            onClick={executeMerge}
            disabled={working}
            className={`p-1 ${working ? 'opacity-40' : 'text-purple-500'}`}
          >
            <Check size={20} />
          </button>
        ) : undefined
      }
    >
      <div className="px-4 py-3" style={{ backgroundColor: 'var(--bg-secondary)' }}>

        {step === 'pick' && (
          <>
            {/* Source client summary */}
            <div className="mb-4 p-3 rounded-xl" style={{ backgroundColor: 'var(--bg-primary)' }}>
              <p className="text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>Merging from</p>
              <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{sourceClient.alias}</p>
              {sourceClient.phone && (
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{sourceClient.phone}</p>
              )}
            </div>

            <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>
              Search for the client to keep
            </p>

            {/* Search */}
            <div
              className="flex items-center gap-2 px-3 py-2.5 rounded-lg mb-3"
              style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)' }}
            >
              <Search size={15} style={{ color: 'var(--text-secondary)' }} />
              <input
                type="text"
                placeholder="Name, phone, or real name…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="flex-1 bg-transparent text-sm outline-none"
                style={{ color: 'var(--text-primary)', fontSize: '16px' }}
                autoFocus
              />
            </div>

            {searchResults.length > 0 && (
              <div className="space-y-2">
                {searchResults.map(c => (
                  <button
                    key={c.id}
                    onClick={() => handleSelectTarget(c)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl text-left active:scale-[0.98] transition-transform"
                    style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)' }}
                  >
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                      style={{ backgroundColor: 'rgba(168,85,247,0.15)' }}
                    >
                      <span className="text-sm font-bold text-purple-500">
                        {c.alias.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{c.alias}</p>
                      <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                        {[c.realName, c.phone].filter(Boolean).join(' · ') || c.screeningStatus}
                      </p>
                    </div>
                    <ArrowRight size={16} style={{ color: 'var(--text-secondary)' }} />
                  </button>
                ))}
              </div>
            )}

            {search.trim() && searchResults.length === 0 && (
              <p className="text-sm text-center py-4" style={{ color: 'var(--text-secondary)' }}>
                No clients match "{search}"
              </p>
            )}

            {!search.trim() && (
              <p className="text-xs text-center py-4" style={{ color: 'var(--text-secondary)' }}>
                The selected client's bookings and records will be transferred to the one you keep.
              </p>
            )}
          </>
        )}

        {step === 'review' && targetClient && (
          <>
            {/* Transfer summary */}
            <div
              className="mb-4 p-3 rounded-xl flex items-center gap-3"
              style={{ backgroundColor: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.2)' }}
            >
              <div className="flex-1 text-center">
                <p className="text-xs font-semibold mb-0.5" style={{ color: 'var(--text-secondary)' }}>Discard</p>
                <p className="text-sm font-bold text-red-400">{sourceClient.alias}</p>
              </div>
              <ArrowRight size={18} style={{ color: '#a855f7', flexShrink: 0 }} />
              <div className="flex-1 text-center">
                <p className="text-xs font-semibold mb-0.5" style={{ color: 'var(--text-secondary)' }}>Keep</p>
                <p className="text-sm font-bold text-purple-400">{targetClient.alias}</p>
              </div>
            </div>

            {/* Transfer counts */}
            {(sourceBookingCount > 0 || sourceIncidentCount > 0) && (
              <div className="flex gap-2 mb-4">
                {sourceBookingCount > 0 && (
                  <div className="flex-1 text-center py-2 rounded-lg"
                    style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)' }}>
                    <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{sourceBookingCount}</p>
                    <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>booking{sourceBookingCount !== 1 ? 's' : ''} transferred</p>
                  </div>
                )}
                {sourceIncidentCount > 0 && (
                  <div className="flex-1 text-center py-2 rounded-lg"
                    style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)' }}>
                    <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{sourceIncidentCount}</p>
                    <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>incident{sourceIncidentCount !== 1 ? 's' : ''} transferred</p>
                  </div>
                )}
              </div>
            )}

            {/* Auto-merged fields note */}
            <p className="text-[10px] mb-3" style={{ color: 'var(--text-secondary)' }}>
              Tags combined · Earliest date added kept · Most recent last seen kept · If either is blocked, merged record stays blocked
            </p>

            {/* Field-by-field choices */}
            {diffFields.length === 0 ? (
              <p className="text-sm text-center py-3 mb-3" style={{ color: 'var(--text-secondary)' }}>
                No conflicting fields — all data will be merged automatically.
              </p>
            ) : (
              <>
                <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>
                  {diffFields.length} conflicting field{diffFields.length !== 1 ? 's' : ''} — choose which to keep
                </p>
                <div className="space-y-2 mb-2">
                  {visibleFields.map(field => (
                    <FieldChooser
                      key={field.key}
                      field={field}
                      choice={choices[field.key] ?? field.default}
                      onChange={c => setChoices(prev => ({ ...prev, [field.key]: c }))}
                    />
                  ))}
                </div>
                {diffFields.length > 5 && (
                  <button
                    onClick={() => setShowAllFields(v => !v)}
                    className="flex items-center gap-1 text-xs mb-3 active:opacity-70"
                    style={{ color: '#a855f7' }}
                  >
                    {showAllFields ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    {showAllFields ? 'Show less' : `Show ${diffFields.length - 5} more fields`}
                  </button>
                )}
              </>
            )}

            {/* Action buttons */}
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => setStep('pick')}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium border"
                style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              >
                Back
              </button>
              <button
                onClick={executeMerge}
                disabled={working}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold text-white ${working ? 'opacity-40' : 'active:opacity-90'}`}
                style={{ backgroundColor: '#a855f7' }}
              >
                {working ? 'Merging…' : 'Merge Clients'}
              </button>
            </div>
          </>
        )}

        <div className="h-6" />
      </div>
    </Modal>
  )
}

// ── FieldChooser sub-component ────────────────────────────

function FieldChooser({ field, choice, onChange }: {
  field: MergeField
  choice: FieldChoice
  onChange: (c: FieldChoice) => void
}) {
  return (
    <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
      <p className="text-[10px] font-semibold px-3 pt-2 pb-1 uppercase" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>
        {field.label}
      </p>
      <div className="grid grid-cols-2" style={{ backgroundColor: 'var(--bg-primary)' }}>
        {(['source', 'target'] as const).map(side => {
          const val = side === 'source' ? field.sourceVal : field.targetVal
          const isChosen = choice === side
          return (
            <button
              key={side}
              onClick={() => onChange(side)}
              className="px-3 pb-2.5 pt-1.5 text-left transition-colors"
              style={{
                backgroundColor: isChosen ? 'rgba(168,85,247,0.12)' : 'transparent',
                borderTop: isChosen ? '2px solid #a855f7' : '2px solid transparent',
              }}
            >
              <p className="text-[10px] font-medium mb-0.5"
                style={{ color: isChosen ? '#a855f7' : 'var(--text-secondary)' }}>
                {side === 'source' ? 'Discard' : 'Keep'} {isChosen ? '✓' : ''}
              </p>
              <p className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                {val}
              </p>
            </button>
          )
        })}
      </div>
    </div>
  )
}
