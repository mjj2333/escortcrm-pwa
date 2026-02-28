import { useState, useEffect } from 'react'
import { Check } from 'lucide-react'
import { db, newId } from '../../db'
import { Modal } from '../../components/Modal'
import { showToast } from '../../components/Toast'
import { SectionLabel, FieldTextInput, FieldToggle } from '../../components/FormFields'
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
  const [isPrimary, setIsPrimary] = useState(contact?.isPrimary ?? false)

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setName(contact?.name ?? '')
      setPhone(contact?.phone ?? '')
      setIsPrimary(contact?.isPrimary ?? false)
    }
  }, [isOpen, contact])

  const isValid = name.trim().length > 0 && phone.trim().length > 0

  async function handleSave() {
    if (!isValid) return

    try {
      if (isEditing && contact) {
        if (isPrimary && !contact.isPrimary) {
          const existing = await db.safetyContacts.filter(c => c.isPrimary).toArray()
          for (const c of existing) {
            await db.safetyContacts.update(c.id, { isPrimary: false })
          }
        }
        await db.safetyContacts.update(contact.id, {
          name: name.trim(),
          phone: phone.trim(),
          isPrimary,
        })
        showToast('Contact updated')
      } else {
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
          relationship: '',
          isPrimary,
          isActive: true,
        })
        showToast('Contact added')
      }
      onClose()
    } catch (err) {
      showToast(`Save failed: ${(err as Error).message}`)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Edit Contact' : 'New Safety Contact'}
      actions={
        <button onClick={handleSave} disabled={!isValid}
          className={`p-2 ${isValid ? 'text-purple-500' : 'opacity-30'}`}>
          <Check size={20} />
        </button>
      }
    >
      <div className="px-4 py-2" style={{ backgroundColor: 'var(--bg-secondary)' }}>
        <SectionLabel label="Contact Info" />
        <FieldTextInput label="Name" value={name} onChange={setName} placeholder="Full name" required
          hint="Your safety contact's name." />
        <FieldTextInput label="Phone" value={phone} onChange={setPhone} placeholder="Phone number" type="tel" required
          hint="The number that will be contacted for safety check-ins." />

        <SectionLabel label="Settings" />
        <FieldToggle label="Primary Contact" value={isPrimary} onChange={setIsPrimary}
          hint="Primary contact receives all safety check-in alerts." />

        <div className="py-4">
          <button onClick={handleSave} disabled={!isValid}
            className={`w-full py-3 rounded-xl font-semibold text-sm ${
              isValid ? 'bg-purple-600 text-white active:bg-purple-700' : 'opacity-40 bg-purple-600 text-white'
            }`}>
            {isEditing ? 'Save Changes' : 'Add Contact'}
          </button>
        </div>
        <div className="h-8" />
      </div>
    </Modal>
  )
}
