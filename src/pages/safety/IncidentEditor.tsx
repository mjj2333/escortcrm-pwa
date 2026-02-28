import { useState, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Check } from 'lucide-react'
import { format } from 'date-fns'
import { db, newId } from '../../db'
import { Modal } from '../../components/Modal'
import { showToast } from '../../components/Toast'
import { SectionLabel, FieldSelect, FieldTextArea, FieldDate, fieldInputStyle } from '../../components/FormFields'
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

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setClientId('')
      setSeverity('medium')
      setDescription('')
      setActionTaken('')
      setDate(format(new Date(), 'yyyy-MM-dd'))
    }
  }, [isOpen])

  const isValid = description.trim().length > 0

  async function handleSave() {
    if (!isValid) return
    try {
      await db.incidents.add({
        id: newId(),
        clientId: clientId || undefined,
        date: new Date(date + 'T00:00:00'),
        severity,
        description: description.trim(),
        actionTaken: actionTaken.trim(),
      })
      showToast('Incident logged')
      onClose()
    } catch (err) {
      showToast(`Save failed: ${(err as Error).message}`)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Log Incident"
      actions={
        <button onClick={handleSave} disabled={!isValid}
          className={`p-2 ${isValid ? 'text-purple-500' : 'opacity-30'}`}>
          <Check size={20} />
        </button>
      }
    >
      <div className="px-4 py-2" style={{ backgroundColor: 'var(--bg-secondary)' }}>
        <SectionLabel label="Details" />
        <FieldSelect label="Severity" value={severity} options={severities} onChange={setSeverity}
          displayFn={(v: string) => v.charAt(0).toUpperCase() + v.slice(1)} />
        <FieldDate label="Date" value={date} onChange={setDate} />
        <div className="mb-3">
          <label className="text-xs font-semibold block mb-1" style={{ color: 'var(--text-primary)' }}>Client</label>
          <select value={clientId} onChange={e => setClientId(e.target.value)}
            className="w-full px-3 py-2.5 rounded-lg text-sm outline-none" style={fieldInputStyle}>
            <option value="">None</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.alias}</option>)}
          </select>
        </div>

        <SectionLabel label="Description" />
        <FieldTextArea label="What happened" value={description} onChange={setDescription}
          placeholder="Describe the incident..." hint="Be specific so you can reference this later." />

        <SectionLabel label="Action Taken" optional />
        <FieldTextArea label="What did you do" value={actionTaken} onChange={setActionTaken}
          placeholder="Steps taken, boundaries enforced..." />

        <div className="py-4">
          <button onClick={handleSave} disabled={!isValid}
            className={`w-full py-3 rounded-xl font-semibold text-sm ${
              isValid ? 'bg-purple-600 text-white active:bg-purple-700' : 'opacity-40 bg-purple-600 text-white'
            }`}>
            Log Incident
          </button>
        </div>
        <div className="h-8" />
      </div>
    </Modal>
  )
}
