import { useState, useEffect } from 'react'
import { Check } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { format } from 'date-fns'
import { db } from '../../db'
import { Modal } from '../../components/Modal'
import { SectionLabel, FieldHint, fieldInputStyle } from '../../components/FormFields'
import type { SafetyCheck } from '../../types'

interface SafetyCheckEditorProps {
  isOpen: boolean
  onClose: () => void
  check: SafetyCheck
}

const BUFFER_OPTIONS = [15, 30, 45, 60, 90, 120] as const

function toDateTimeLocal(d: Date): string {
  // format expected by <input type="datetime-local">: YYYY-MM-DDTHH:mm
  const dt = d instanceof Date ? d : new Date(d)
  return format(dt, "yyyy-MM-dd'T'HH:mm")
}

export function SafetyCheckEditor({ isOpen, onClose, check }: SafetyCheckEditorProps) {
  const contacts = useLiveQuery(() => db.safetyContacts.filter(c => c.isActive).toArray()) ?? []

  const [scheduledTime, setScheduledTime] = useState('')
  const [bufferMinutes, setBufferMinutes] = useState(check.bufferMinutes)
  const [safetyContactId, setSafetyContactId] = useState<string>(check.safetyContactId ?? '')

  useEffect(() => {
    if (isOpen) {
      setScheduledTime(toDateTimeLocal(new Date(check.scheduledTime)))
      setBufferMinutes(check.bufferMinutes)
      setSafetyContactId(check.safetyContactId ?? '')
    }
  }, [isOpen, check])

  const isValid = scheduledTime.length > 0 && bufferMinutes > 0

  async function handleSave() {
    if (!isValid) return
    await db.safetyChecks.update(check.id, {
      scheduledTime: new Date(scheduledTime),
      bufferMinutes,
      safetyContactId: safetyContactId || undefined,
    })
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Edit Safety Check"
      actions={
        <button
          onClick={handleSave}
          disabled={!isValid}
          className={`p-2 ${isValid ? 'text-purple-500' : 'opacity-30'}`}
        >
          <Check size={20} />
        </button>
      }
    >
      <div className="px-4 py-2" style={{ backgroundColor: 'var(--bg-secondary)' }}>
        {/* Scheduled time */}
        <SectionLabel label="Schedule" />
        <div className="mb-3">
          <label className="text-xs font-semibold block mb-1" style={{ color: 'var(--text-primary)' }}>
            Check-in Time
          </label>
          <input
            type="datetime-local"
            value={scheduledTime}
            onChange={e => setScheduledTime(e.target.value)}
            className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
            style={{ ...fieldInputStyle, fontSize: '16px' }}
          />
          <FieldHint text="When you expect to check in. The app marks this overdue if missed." />
        </div>

        {/* Buffer */}
        <div className="mb-3">
          <label className="text-xs font-semibold block mb-1" style={{ color: 'var(--text-primary)' }}>
            Grace Period
          </label>
          <div className="flex flex-wrap gap-2">
            {BUFFER_OPTIONS.map(mins => (
              <button
                key={mins}
                type="button"
                onClick={() => setBufferMinutes(mins)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                style={{
                  backgroundColor: bufferMinutes === mins ? '#a855f7' : 'var(--bg-primary)',
                  color: bufferMinutes === mins ? '#fff' : 'var(--text-secondary)',
                  border: `1px solid ${bufferMinutes === mins ? '#a855f7' : 'var(--border)'}`,
                }}
              >
                {mins < 60 ? `${mins} min` : `${mins / 60} hr`}
              </button>
            ))}
          </div>
          <FieldHint text="How long after the scheduled time before the check is marked overdue." />
        </div>

        {/* Safety contact */}
        <SectionLabel label="Assigned Contact" />
        <div className="mb-3">
          {contacts.length === 0 ? (
            <p className="text-xs py-2" style={{ color: 'var(--text-secondary)' }}>
              No active safety contacts — add one in the Contacts tab.
            </p>
          ) : (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setSafetyContactId('')}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-left"
                style={{
                  backgroundColor: safetyContactId === '' ? 'rgba(168,85,247,0.12)' : 'var(--bg-primary)',
                  border: `1px solid ${safetyContactId === '' ? '#a855f7' : 'var(--border)'}`,
                  color: safetyContactId === '' ? '#a855f7' : 'var(--text-secondary)',
                }}
              >
                <span className="font-medium">None (use primary contact)</span>
              </button>
              {contacts.map(c => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSafetyContactId(c.id)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-left"
                  style={{
                    backgroundColor: safetyContactId === c.id ? 'rgba(168,85,247,0.12)' : 'var(--bg-primary)',
                    border: `1px solid ${safetyContactId === c.id ? '#a855f7' : 'var(--border)'}`,
                  }}
                >
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                    style={{ backgroundColor: 'rgba(168,85,247,0.15)' }}
                  >
                    <span className="text-xs font-bold text-purple-500">
                      {c.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                      {c.name}
                      {c.isPrimary && (
                        <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-500 font-medium">
                          Primary
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] truncate" style={{ color: 'var(--text-secondary)' }}>
                      {c.phone}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
          <FieldHint text="This contact is notified if you send a safety alert for this check-in." />
        </div>

        <div className="py-4">
          <button
            onClick={handleSave}
            disabled={!isValid}
            className={`w-full py-3 rounded-xl font-semibold text-sm ${
              isValid ? 'bg-purple-600 text-white active:bg-purple-700' : 'opacity-40 bg-purple-600 text-white'
            }`}
          >
            Save Changes
          </button>
        </div>
        <div className="h-8" />
      </div>
    </Modal>
  )
}
