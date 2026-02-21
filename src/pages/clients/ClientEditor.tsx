import { useState, useEffect } from 'react'
import { Check, Plus, ChevronLeft, User, Phone as PhoneIcon, MessageSquare, UserCheck, Mail, Cake, CalendarDays, Share2, ShieldCheck, Heart, ShieldAlert, FileText } from 'lucide-react'
import { db, createClient } from '../../db'
import { Modal } from '../../components/Modal'
import { showToast } from '../../components/Toast'
import { SectionLabel, FieldHint, FieldTextInput, FieldTextArea, FieldSelect, FieldDate } from '../../components/FormFields'
import { RiskLevelBar } from '../../components/RiskLevelBar'
import { ScreeningStatusBar } from '../../components/ScreeningStatusBar'
import { TagPicker } from '../../components/TagPicker'
import type { Client, ClientTag, ContactMethod, ScreeningStatus, RiskLevel } from '../../types'

const contactMethods: ContactMethod[] = ['Phone', 'Text', 'Email', 'Telegram', 'Signal', 'WhatsApp', 'Other']

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
        birthday: birthday ? new Date(birthday + 'T00:00:00') : undefined,
        clientSince: clientSince ? new Date(clientSince + 'T00:00:00') : undefined,
      })
      showToast('Client updated')
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
        birthday: birthday ? new Date(birthday + 'T00:00:00') : undefined,
        clientSince: clientSince ? new Date(clientSince + 'T00:00:00') : undefined,
      })
      await db.clients.add(newClient)
      showToast('Client added')
      onClose(newClient.id)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => onClose()}
      title={isEditing ? 'Edit Client' : 'New Client'}
      actions={
        <button onClick={handleSave} disabled={!isValid}
          className={`p-1 ${isValid ? 'text-purple-500' : 'opacity-30'}`}>
          <Check size={20} />
        </button>
      }
    >
      <div className="px-4 py-2" style={{ backgroundColor: 'var(--bg-secondary)' }}>
        {/* Basic Info */}
        <SectionLabel label="Basic Info" />
        <FieldTextInput label="Alias" value={alias} onChange={setAlias} placeholder="Display name" required
          hint="A name or nickname you use to identify this client." icon={<User size={12} />} />
        <FieldTextInput label="Phone" value={phone} onChange={setPhone} placeholder="Phone number" type="tel"
          hint="Enables one-tap calling and texting from their profile." icon={<PhoneIcon size={12} />} />
        <FieldSelect label="Preferred Contact" value={preferredContact} options={contactMethods} onChange={setPreferredContact}
          hint="How this client prefers to be reached." icon={<MessageSquare size={12} />} />
        {/* Screening Status */}
        <SectionLabel label="Screening" />
        <div className="mb-3">
          <ScreeningStatusBar value={screeningStatus} onChange={setScreeningStatus} />
          <FieldHint text="Slide or tap to set. Declined → Pending → Verified." />
        </div>

        {/* Risk Level Bar */}
        <SectionLabel label="Risk Level" />
        <div className="mb-3">
          <RiskLevelBar value={riskLevel} onChange={setRiskLevel} />
          <FieldHint text="Slide to set risk level. Unknown means not yet assessed." />
        </div>

        {/* Tags */}
        <SectionLabel label="Tags" optional />
        <div className="mb-3">
          <TagPicker selected={tags} onChange={setTags} />
        </div>

        {/* Toggle all details */}
        <button
          type="button"
          onClick={() => setShowAllDetails(!showAllDetails)}
          className="flex items-center gap-2 mb-4 text-xs font-semibold active:opacity-70"
          style={{ color: '#a855f7' }}
        >
          {showAllDetails ? <ChevronLeft size={14} /> : <Plus size={14} />}
          {showAllDetails ? 'Hide Details' : 'All Details'}
        </button>

        {showAllDetails && (
          <>
            <SectionLabel label="Identity" optional />
            <FieldTextInput label="Real Name" value={realName} onChange={setRealName} placeholder="Legal name"
              hint="Their legal name, if verified. Only visible to you." icon={<UserCheck size={12} />} />
            <FieldTextInput label="Email" value={email} onChange={setEmail} placeholder="Email" type="email"
              hint="Enables one-tap email from their profile." icon={<Mail size={12} />} />

            <SectionLabel label="Dates" optional />
            <FieldDate label="Birthday" value={birthday} onChange={setBirthday}
              hint="Get a reminder on the home page when their birthday is coming up." icon={<Cake size={12} />} />
            <FieldDate label="Client Since" value={clientSince} onChange={setClientSince}
              hint="When you first started seeing this client." icon={<CalendarDays size={12} />} />

            <SectionLabel label="Screening Details" optional />
            <FieldTextInput label="Referral Source" value={referenceSource} onChange={setReferenceSource}
              placeholder="How they found you"
              hint="Website, friend, Twitter, etc." icon={<Share2 size={12} />} />
            <FieldTextArea label="Verification Notes" value={verificationNotes} onChange={setVerificationNotes}
              placeholder="ID, references..."
              hint="Notes about their screening or verification process." icon={<ShieldCheck size={12} />} />

            <SectionLabel label="Preferences & Boundaries" optional />
            <FieldTextArea label="Preferences" value={preferences} onChange={setPreferences}
              placeholder="Likes, requests..."
              hint="Things to remember. Shows on booking details." icon={<Heart size={12} />} />
            <FieldTextArea label="Boundaries" value={boundaries} onChange={setBoundaries}
              placeholder="Hard limits, boundaries..."
              hint="Shows prominently on booking details." icon={<ShieldAlert size={12} />} />

            <SectionLabel label="Notes" optional />
            <FieldTextArea label="Notes" value={notes} onChange={setNotes}
              placeholder="General notes..."
              hint="Visible on their profile." icon={<FileText size={12} />} />
          </>
        )}

        {/* Save button */}
        <div className="py-4">
          <button onClick={handleSave} disabled={!isValid}
            className={`w-full py-3 rounded-xl font-semibold text-sm ${
              isValid ? 'bg-purple-600 text-white active:bg-purple-700' : 'opacity-40 bg-purple-600 text-white'
            }`}>
            {isEditing ? 'Save Changes' : 'Create Client'}
          </button>
        </div>
        <div className="h-8" />
      </div>
    </Modal>
  )
}
