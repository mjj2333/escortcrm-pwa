import { useState } from 'react'
import { Check } from 'lucide-react'
import { db, newId } from '../../db'
import { Modal, FormSection, FormInput, FormToggle } from '../../components/Modal'
import type { SafetyContact } from '../../types'

interface SafetyContactEditorProps {
  isOpen: boolean
  onClose: () => void
  contact?: SafetyContact
}

export function SafetyContactEditor({ isOpen, onClose, contact }: SafetyContactEditorProps) {
  const isEditing = !!contact
  const [name, setName] = useState(contact?.name ?? '')
  const [phone, setPhone] = useState(contact?.phone ?? '')
  const [relationship, setRelationship] = useState(contact?.relationship ?? '')
  const [isPrimary, setIsPrimary] = useState(contact?.isPrimary ?? false)

  const isValid = name.trim().length > 0 && phone.trim().length > 0

  async function handleSave() {
    if (!isValid) return

    if (isEditing && contact) {
      await db.safetyContacts.update(contact.id, {
        name: name.trim(),
        phone: phone.trim(),
        relationship: relationship.trim(),
        isPrimary,
      })
    } else {
      // If marking as primary, unset existing primary
      if (isPrimary) {
        const existing = await db.safetyContacts.filter(c => c.isPrimary).toArray()
        for (const c of existing) {
          await db.safetyContacts.update(c.id, { isPrimary: false })
        }
      }
      await db.safetyContacts.add({
        id: newId(),
        name: name.trim(),
        phone: phone.trim(),
        relationship: relationship.trim(),
        isPrimary,
        isActive: true,
      })
    }
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Edit Contact' : 'New Safety Contact'}
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
        <FormSection title="Contact Info">
          <FormInput label="Name" value={name} onChange={setName} placeholder="Full name" required />
          <FormInput label="Phone" value={phone} onChange={setPhone} placeholder="Phone number" type="tel" required />
          <FormInput label="Relationship" value={relationship} onChange={setRelationship} placeholder="e.g. Friend, Sister" />
        </FormSection>

        <FormSection title="Settings" footer="Primary contact receives all safety check-in alerts">
          <FormToggle label="Primary Contact" value={isPrimary} onChange={setIsPrimary} />
        </FormSection>

        <div className="px-4 py-4">
          <button
            onClick={handleSave}
            disabled={!isValid}
            className={`w-full py-3 rounded-xl font-semibold text-sm ${
              isValid ? 'bg-purple-600 text-white active:bg-purple-700' : 'opacity-40 bg-purple-600 text-white'
            }`}
          >
            {isEditing ? 'Save Changes' : 'Add Contact'}
          </button>
        </div>
        <div className="h-8" />
      </div>
    </Modal>
  )
}
