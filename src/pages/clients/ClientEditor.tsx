import { useState, useEffect } from 'react'
import {
  Check, ThumbsUp, ShieldAlert, StickyNote,
  User, Phone, MessageCircle, ShieldCheck,
  IdCard, Mail, Globe, ClipboardCheck, Cake, CalendarDays
} from 'lucide-react'
import { db, createClient } from '../../db'
import { Modal, FormSection, FormInput, FormSelect } from '../../components/Modal'
import { RiskLevelBar } from '../../components/RiskLevelBar'
import { TagPicker } from '../../components/TagPicker'
import type { Client, ClientTag, ContactMethod, ScreeningStatus, RiskLevel } from '../../types'

const contactMethods: ContactMethod[] = ['Phone', 'Text', 'Email', 'Telegram', 'Signal', 'WhatsApp', 'Other']
const screeningStatuses: ScreeningStatus[] = ['Pending', 'In Progress', 'Verified', 'Declined']

interface ClientEditorProps {
  isOpen: boolean
  onClose: (createdClientId?: string) => void
  client?: Client // if editing
}

export function ClientEditor({ isOpen, onClose, client }: ClientEditorProps) {
  const isEditing = !!client

  const [alias, setAlias] = useState('')
  const [realName, setRealName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [preferredContact, setPreferredContact] = useState<ContactMethod>('Text')
  const [screeningStatus, setScreeningStatus] = useState<ScreeningStatus>('Pending')
  const [riskLevel, setRiskLevel] = useState<RiskLevel>('Unknown')
  const [notes, setNotes] = useState('')
  const [preferences, setPreferences] = useState('')
  const [boundaries, setBoundaries] = useState('')
  const [referenceSource, setReferenceSource] = useState('')
  const [verificationNotes, setVerificationNotes] = useState('')
  const [tags, setTags] = useState<ClientTag[]>([])
  const [birthday, setBirthday] = useState('')
  const [clientSince, setClientSince] = useState('')
  const [showAllDetails, setShowAllDetails] = useState(false)

  // Reset form state when modal opens
  useEffect(() => {
    if (isOpen) {
      setAlias(client?.alias ?? '')
      setRealName(client?.realName ?? '')
      setPhone(client?.phone ?? '')
      setEmail(client?.email ?? '')
      setPreferredContact(client?.preferredContact ?? 'Text')
      setScreeningStatus(client?.screeningStatus ?? 'Pending')
      setRiskLevel(client?.riskLevel ?? 'Unknown')
      setNotes(client?.notes ?? '')
      setPreferences(client?.preferences ?? '')
      setBoundaries(client?.boundaries ?? '')
      setReferenceSource(client?.referenceSource ?? '')
      setVerificationNotes(client?.verificationNotes ?? '')
      setTags(client?.tags ?? [])
      setBirthday(client?.birthday ? new Date(client.birthday).toISOString().split('T')[0] : '')
      setClientSince(client?.clientSince ? new Date(client.clientSince).toISOString().split('T')[0] : '')
      setShowAllDetails(!!client)
    }
  }, [isOpen, client])

  const isValid = alias.trim().length > 0

  async function handleSave() {
    if (!isValid) return

    if (isEditing && client) {
      await db.clients.update(client.id, {
        alias: alias.trim(),
        realName: realName.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        preferredContact,
        screeningStatus,
        riskLevel,
        notes: notes.trim(),
        preferences: preferences.trim(),
        boundaries: boundaries.trim(),
        referenceSource: referenceSource.trim() || undefined,
        verificationNotes: verificationNotes.trim() || undefined,
        tags,
        birthday: birthday ? new Date(birthday) : undefined,
        clientSince: clientSince ? new Date(clientSince) : undefined,
      })
      onClose()
    } else {
      const newClient = createClient({
        alias: alias.trim(),
        realName: realName.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        preferredContact,
        screeningStatus,
        riskLevel,
        notes: notes.trim(),
        preferences: preferences.trim(),
        boundaries: boundaries.trim(),
        referenceSource: referenceSource.trim() || undefined,
        verificationNotes: verificationNotes.trim() || undefined,
        tags,
        birthday: birthday ? new Date(birthday) : undefined,
        clientSince: clientSince ? new Date(clientSince) : undefined,
      })
      await db.clients.add(newClient)
      onClose(newClient.id) // pass back the new ID
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => onClose()}
      title={isEditing ? 'Edit Client' : 'New Client'}
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
        {/* Basic Info */}
        <FormSection title="Basic Info">
          <FormInput label={<span className="flex items-center gap-1.5"><User size={13} style={{ color: '#a855f7' }} /> Alias</span>} value={alias} onChange={setAlias} placeholder="Display name" required />
          <FormInput label={<span className="flex items-center gap-1.5"><Phone size={13} style={{ color: '#3b82f6' }} /> Phone</span>} value={phone} onChange={setPhone} placeholder="Phone number" type="tel" />
          <FormSelect label={<span className="flex items-center gap-1.5"><MessageCircle size={13} style={{ color: '#f97316' }} /> Contact</span>} value={preferredContact} options={contactMethods} onChange={setPreferredContact} />
          <FormSelect label={<span className="flex items-center gap-1.5"><ShieldCheck size={13} style={{ color: '#eab308' }} /> Screening</span>} value={screeningStatus} options={screeningStatuses} onChange={setScreeningStatus} />
        </FormSection>

        {/* Risk Level Bar — always visible */}
        <div className="px-4 py-3">
          <RiskLevelBar value={riskLevel} onChange={setRiskLevel} />
        </div>

        {/* Tags */}
        <div className="px-4 py-3">
          <p className="text-xs font-semibold uppercase mb-2" style={{ color: 'var(--text-secondary)' }}>Tags</p>
          <TagPicker selected={tags} onChange={setTags} />
        </div>

        {/* Toggle all details */}
        <div className="px-4 py-2">
          <button
            onClick={() => setShowAllDetails(!showAllDetails)}
            className="text-sm text-purple-500 font-medium"
          >
            {showAllDetails ? 'Hide Details' : 'All Details ▸'}
          </button>
        </div>

        {showAllDetails && (
          <>
            <FormSection title="Identity">
              <FormInput label={<span className="flex items-center gap-1.5"><IdCard size={13} style={{ color: '#8b5cf6' }} /> Real Name</span>} value={realName} onChange={setRealName} placeholder="Legal name" />
              <FormInput label={<span className="flex items-center gap-1.5"><Mail size={13} style={{ color: '#3b82f6' }} /> Email</span>} value={email} onChange={setEmail} placeholder="Email" type="email" />
            </FormSection>

            <FormSection title="Dates">
              <FormInput label={<span className="flex items-center gap-1.5"><Cake size={13} style={{ color: '#ec4899' }} /> Birthday</span>} value={birthday} onChange={setBirthday} type="date" />
              <FormInput label={<span className="flex items-center gap-1.5"><CalendarDays size={13} style={{ color: '#a855f7' }} /> Client Since</span>} value={clientSince} onChange={setClientSince} type="date" />
            </FormSection>

            <FormSection title="Screening Details">
              <FormInput label={<span className="flex items-center gap-1.5"><Globe size={13} style={{ color: '#22c55e' }} /> Reference</span>} value={referenceSource} onChange={setReferenceSource} placeholder="How they found you" />
              <FormInput label={<span className="flex items-center gap-1.5"><ClipboardCheck size={13} style={{ color: '#eab308' }} /> Verification</span>} value={verificationNotes} onChange={setVerificationNotes} placeholder="ID, references..." multiline />
            </FormSection>

            <FormSection title="Preferences & Boundaries">
              <FormInput label={<span className="flex items-center gap-1.5"><ThumbsUp size={13} style={{ color: '#22c55e' }} /> Preferences</span>} value={preferences} onChange={setPreferences} placeholder="Likes, requests..." multiline />
              <FormInput label={<span className="flex items-center gap-1.5"><ShieldAlert size={13} style={{ color: '#ef4444' }} /> Boundaries</span>} value={boundaries} onChange={setBoundaries} placeholder="Hard limits, boundaries..." multiline />
            </FormSection>

            <FormSection title="Notes">
              <FormInput label={<span className="flex items-center gap-1.5"><StickyNote size={13} style={{ color: '#a855f7' }} /> Notes</span>} value={notes} onChange={setNotes} placeholder="General notes..." multiline />
            </FormSection>
          </>
        )}

        {/* Save button */}
        <div className="px-4 py-4">
          <button
            onClick={handleSave}
            disabled={!isValid}
            className={`w-full py-3 rounded-xl font-semibold text-sm ${
              isValid ? 'bg-purple-600 text-white active:bg-purple-700' : 'opacity-40 bg-purple-600 text-white'
            }`}
          >
            {isEditing ? 'Save Changes' : 'Create Client'}
          </button>
        </div>
        <div className="h-8" />
      </div>
    </Modal>
  )
}
