import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Check } from 'lucide-react'
import { format } from 'date-fns'
import { db, newId } from '../../db'
import { Modal, FormSection, FormInput, FormSelect } from '../../components/Modal'
import type { IncidentSeverity } from '../../types'

const severities: IncidentSeverity[] = ['low', 'medium', 'high', 'critical']

interface IncidentEditorProps {
  isOpen: boolean
  onClose: () => void
}

export function IncidentEditor({ isOpen, onClose }: IncidentEditorProps) {
  const clients = useLiveQuery(() => db.clients.orderBy('alias').toArray()) ?? []
  const [clientId, setClientId] = useState('')
  const [severity, setSeverity] = useState<IncidentSeverity>('medium')
  const [description, setDescription] = useState('')
  const [actionTaken, setActionTaken] = useState('')
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))

  const isValid = description.trim().length > 0

  async function handleSave() {
    if (!isValid) return
    await db.incidents.add({
      id: newId(),
      clientId: clientId || undefined,
      date: new Date(date),
      severity,
      description: description.trim(),
      actionTaken: actionTaken.trim(),
    })
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Log Incident"
      actions={
        <button
          onClick={handleSave}
          disabled={!isValid}
          className={`p-1 ${isValid ? 'text-purple-500' : 'opacity-30'}`}
        >
          <Check size={20} />
        </button>
      }
    >
      <div style={{ backgroundColor: 'var(--bg-secondary)' }}>
        <FormSection title="Details">
          <FormSelect label="Severity" value={severity} options={severities} onChange={setSeverity} />
          <div className="flex items-center gap-3 px-4 py-3">
            <span className="text-sm" style={{ color: 'var(--text-primary)' }}>Date</span>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="flex-1 text-sm text-right bg-transparent outline-none"
              style={{ color: 'var(--text-primary)', colorScheme: 'dark' }}
            />
          </div>
          <div className="flex items-center gap-3 px-4 py-3">
            <span className="text-sm" style={{ color: 'var(--text-primary)' }}>Client</span>
            <select
              value={clientId}
              onChange={e => setClientId(e.target.value)}
              className="flex-1 text-sm text-right bg-transparent outline-none appearance-none cursor-pointer"
              style={{ color: 'var(--text-secondary)' }}
            >
              <option value="">None</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>{c.alias}</option>
              ))}
            </select>
          </div>
        </FormSection>

        <FormSection title="Description">
          <FormInput label="" value={description} onChange={setDescription} placeholder="What happened..." multiline />
        </FormSection>

        <FormSection title="Action Taken">
          <FormInput label="" value={actionTaken} onChange={setActionTaken} placeholder="What did you do..." multiline />
        </FormSection>

        <div className="px-4 py-4">
          <button
            onClick={handleSave}
            disabled={!isValid}
            className={`w-full py-3 rounded-xl font-semibold text-sm ${
              isValid ? 'bg-purple-600 text-white active:bg-purple-700' : 'opacity-40 bg-purple-600 text-white'
            }`}
          >
            Log Incident
          </button>
        </div>
        <div className="h-8" />
      </div>
    </Modal>
  )
}
