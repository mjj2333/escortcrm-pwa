import { useState, useEffect } from 'react'
import { Check } from 'lucide-react'
import { format } from 'date-fns'
import { db, newId } from '../../db'
import { Modal } from '../../components/Modal'
import { showToast } from '../../components/Toast'
import { SectionLabel, FieldTextInput, FieldDate, FieldTextArea } from '../../components/FormFields'
import type { Tour } from '../../types'

interface TourEditorProps {
  isOpen: boolean
  onClose: () => void
  tour?: Tour
}

export function TourEditor({ isOpen, onClose, tour }: TourEditorProps) {
  const isEditing = !!tour
  const [name, setName] = useState('')
  const [city, setCity] = useState('')
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (isOpen) {
      if (tour) {
        setName(tour.name)
        setCity(tour.city)
        setStartDate(format(new Date(tour.startDate), 'yyyy-MM-dd'))
        setEndDate(format(new Date(tour.endDate), 'yyyy-MM-dd'))
        setNotes(tour.notes ?? '')
      } else {
        setName('')
        setCity('')
        setStartDate(format(new Date(), 'yyyy-MM-dd'))
        setEndDate(format(new Date(), 'yyyy-MM-dd'))
        setNotes('')
      }
      setSaving(false)
    }
  }, [isOpen, tour])

  const isValid = name.trim().length > 0 && city.trim().length > 0

  async function handleSave() {
    if (!isValid || saving) return
    setSaving(true)
    const now = new Date()
    try {
      if (isEditing && tour) {
        await db.tours.update(tour.id, {
          name: name.trim(),
          city: city.trim(),
          startDate: new Date(startDate + 'T00:00:00'),
          endDate: new Date(endDate + 'T00:00:00'),
          notes: notes.trim() || undefined,
          updatedAt: now,
        })
        showToast('Tour updated')
      } else {
        await db.tours.add({
          id: newId(),
          name: name.trim(),
          city: city.trim(),
          startDate: new Date(startDate + 'T00:00:00'),
          endDate: new Date(endDate + 'T00:00:00'),
          notes: notes.trim() || undefined,
          isArchived: false,
          createdAt: now,
          updatedAt: now,
        })
        showToast('Tour created')
      }
      onClose()
    } catch {
      showToast('Failed to save tour', 'error')
      setSaving(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Edit Tour' : 'New Tour'}
      actions={
        <button onClick={handleSave} disabled={!isValid || saving}
          className={`p-2 ${isValid && !saving ? 'text-purple-500' : 'opacity-30'}`}
          aria-label="Save tour">
          <Check size={20} />
        </button>
      }
    >
      <form onSubmit={e => { e.preventDefault(); handleSave() }} className="px-4 py-2" style={{ backgroundColor: 'var(--bg-secondary)' }}>
        <SectionLabel label="Details" />
        <FieldTextInput label="Tour Name" value={name} onChange={setName} placeholder="Vancouver Feb 2026" required />
        <FieldTextInput label="City" value={city} onChange={setCity} placeholder="Vancouver" required />
        <FieldDate label="Start Date" value={startDate} onChange={setStartDate} />
        <FieldDate label="End Date" value={endDate} onChange={setEndDate} />

        <SectionLabel label="Notes" optional />
        <FieldTextArea label="Notes" value={notes} onChange={setNotes} placeholder="Travel plans, accommodation details..." />

        <div className="py-4">
          <button type="submit" disabled={!isValid || saving}
            className={`w-full py-3 rounded-xl font-semibold text-sm ${
              isValid && !saving ? 'bg-purple-600 text-white active:bg-purple-700' : 'opacity-40 bg-purple-600 text-white'
            }`}>
            {saving ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Tour'}
          </button>
        </div>
        <div className="h-8" />
      </form>
    </Modal>
  )
}
