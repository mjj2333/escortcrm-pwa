import { useState, useEffect } from 'react'
import { Check, User, UserCheck, ShieldCheck, Heart, ShieldAlert, Share2, Cake, CalendarDays, MapPin } from 'lucide-react'
import { db, createClient } from '../../db'
import { Modal } from '../../components/Modal'
import { showToast } from '../../components/Toast'
import { SectionLabel, FieldHint, FieldTextInput, FieldTextArea, FieldDate, fieldInputStyle } from '../../components/FormFields'
import { RiskLevelBar } from '../../components/RiskLevelBar'
import { TagPicker } from '../../components/TagPicker'
import { ScreeningProofManager } from '../../components/ScreeningProofManager'
import { isPro, canAddClient } from '../../components/planLimits'
import type { Client, ClientTag, ContactMethod, ScreeningStatus, ScreeningMethod, RiskLevel } from '../../types'

const contactMethods: ContactMethod[] = ['Phone', 'Text', 'Email', 'Telegram', 'Signal', 'WhatsApp', 'Other']
const screeningStatuses: ScreeningStatus[] = ['Unscreened', 'In Progress', 'Screened']
const screeningMethods: ScreeningMethod[] = ['ID', 'LinkedIn', 'Provider Reference', 'Employment', 'Phone', 'Deposit', 'Other']

function contactFieldConfig(method: ContactMethod): { field: 'phone' | 'email' | 'telegram' | 'signal' | 'whatsapp' | null; placeholder: string; type: string } {
  switch (method) {
    case 'Phone': return { field: 'phone', placeholder: 'Phone number', type: 'tel' }
    case 'Text': return { field: 'phone', placeholder: 'Phone number', type: 'tel' }
    case 'Email': return { field: 'email', placeholder: 'Email address', type: 'email' }
    case 'Telegram': return { field: 'telegram', placeholder: '@username or phone', type: 'text' }
    case 'Signal': return { field: 'signal', placeholder: 'Signal number', type: 'tel' }
    case 'WhatsApp': return { field: 'whatsapp', placeholder: 'WhatsApp number', type: 'tel' }
    case 'Other': return { field: null, placeholder: '', type: 'text' }
  }
}

function toLocalDateStr(d: Date): string {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

interface ClientEditorProps {
  isOpen: boolean
  onClose: (createdClientId?: string) => void
  client?: Client
}

export function ClientEditor({ isOpen, onClose, client }: ClientEditorProps) {
  const isEditing = !!client

  // Basic
  const [alias, setAlias] = useState('')
  const [nickname, setNickname] = useState('')
  const [birthday, setBirthday] = useState('')
  const [clientSince, setClientSince] = useState('')

  // Contact
  const [primaryContact, setPrimaryContact] = useState<ContactMethod>('Text')
  const [secondaryContact, setSecondaryContact] = useState<ContactMethod | ''>('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [telegram, setTelegram] = useState('')
  const [signal, setSignal] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [address, setAddress] = useState('')

  // Screening
  const [screeningStatus, setScreeningStatus] = useState<ScreeningStatus>('Unscreened')
  const [screeningMethod, setScreeningMethod] = useState<ScreeningMethod | ''>('')
  const [riskLevel, setRiskLevel] = useState<RiskLevel>('Unknown')

  // Details
  const [preferences, setPreferences] = useState('')
  const [boundaries, setBoundaries] = useState('')
  const [referenceSource, setReferenceSource] = useState('')
  const [verificationNotes, setVerificationNotes] = useState('')
  const [tags, setTags] = useState<ClientTag[]>([])

  const fieldMap: Record<string, { value: string; set: (v: string) => void }> = {
    phone: { value: phone, set: setPhone },
    email: { value: email, set: setEmail },
    telegram: { value: telegram, set: setTelegram },
    signal: { value: signal, set: setSignal },
    whatsapp: { value: whatsapp, set: setWhatsapp },
  }

  useEffect(() => {
    if (isOpen) {
      setAlias(client?.alias ?? '')
      setNickname(client?.nickname ?? '')
      setPrimaryContact(client?.preferredContact ?? 'Text')
      setSecondaryContact(client?.secondaryContact ?? '')
      setPhone(client?.phone ?? '')
      setEmail(client?.email ?? '')
      setTelegram(client?.telegram ?? '')
      setSignal(client?.signal ?? '')
      setWhatsapp(client?.whatsapp ?? '')
      setAddress(client?.address ?? '')
      setScreeningStatus(client?.screeningStatus ?? 'Unscreened')
      setScreeningMethod(client?.screeningMethod ?? '')
      setRiskLevel(client?.riskLevel ?? 'Unknown')
      setPreferences(client?.preferences ?? '')
      setBoundaries(client?.boundaries ?? '')
      setReferenceSource(client?.referenceSource ?? '')
      setVerificationNotes(client?.verificationNotes ?? '')
      setTags(client?.tags ?? [])
      setBirthday(client?.birthday ? toLocalDateStr(new Date(client.birthday)) : '')
      setClientSince(client?.clientSince ? toLocalDateStr(new Date(client.clientSince)) : '')
    }
  }, [isOpen, client])

  const isValid = alias.trim().length > 0

  async function handleSave() {
    if (!isValid) return

    const data = {
      alias: alias.trim(),
      nickname: nickname.trim() || undefined,
      phone: phone.trim() || undefined,
      email: email.trim() || undefined,
      telegram: telegram.trim() || undefined,
      signal: signal.trim() || undefined,
      whatsapp: whatsapp.trim() || undefined,
      address: address.trim() || undefined,
      preferredContact: primaryContact,
      secondaryContact: secondaryContact || undefined,
      screeningStatus,
      screeningMethod: screeningMethod || undefined,
      riskLevel,
      preferences: preferences.trim(),
      boundaries: boundaries.trim(),
      referenceSource: referenceSource.trim() || undefined,
      verificationNotes: verificationNotes.trim() || undefined,
      tags,
      birthday: birthday ? new Date(birthday + 'T00:00:00') : undefined,
      clientSince: clientSince ? new Date(clientSince + 'T00:00:00') : undefined,
    }

    if (isEditing && client) {
      await db.clients.update(client.id, data)
      showToast('Client updated')
      onClose()
    } else {
      if (!await canAddClient()) {
        showToast('Free plan limit reached — upgrade to add more clients')
        return
      }
      const newClient = createClient(data)
      await db.clients.add(newClient)
      showToast('Client added')
      onClose(newClient.id)
    }
  }

  function ContactInput({ method }: { method: ContactMethod }) {
    const config = contactFieldConfig(method)
    if (!config.field) return null
    const f = fieldMap[config.field]
    return (
      <div className="mb-2">
        <input
          type={config.type}
          value={f.value}
          onChange={e => f.set(e.target.value)}
          placeholder={config.placeholder}
          className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
          style={{ ...fieldInputStyle, fontSize: '16px' }}
        />
      </div>
    )
  }

  const primaryField = contactFieldConfig(primaryContact).field
  const secondaryField = secondaryContact ? contactFieldConfig(secondaryContact as ContactMethod).field : null

  const allContactFields: { key: string; label: string; placeholder: string; type: string }[] = [
    { key: 'phone', label: 'Phone', placeholder: 'Phone number', type: 'tel' },
    { key: 'email', label: 'Email', placeholder: 'Email address', type: 'email' },
    { key: 'telegram', label: 'Telegram', placeholder: '@username or phone', type: 'text' },
    { key: 'signal', label: 'Signal', placeholder: 'Signal number', type: 'tel' },
    { key: 'whatsapp', label: 'WhatsApp', placeholder: 'WhatsApp number', type: 'tel' },
  ].filter(f => f.key !== primaryField && f.key !== secondaryField)

  const secondaryOptions = ['', ...contactMethods.filter(m => m !== primaryContact)]

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

        {/* ━━━ Basic Info ━━━ */}
        <SectionLabel label="Basic Info" />
        <FieldTextInput label="Name" value={alias} onChange={setAlias} placeholder="Name" required
          icon={<User size={12} />} />
        <FieldTextInput label="Nickname or Preferred Name" value={nickname} onChange={setNickname}
          placeholder="Optional" icon={<UserCheck size={12} />} />
        <div className="grid grid-cols-2 gap-2 mb-2">
          <FieldDate label="Birthday" value={birthday} onChange={setBirthday} icon={<Cake size={12} />} />
          <FieldDate label="Client Since" value={clientSince} onChange={setClientSince} icon={<CalendarDays size={12} />} />
        </div>
        <FieldTextInput label="Address" value={address} onChange={setAddress}
          placeholder="Physical address (for outcalls)" icon={<MapPin size={12} />} />

        {/* ━━━ Contact ━━━ */}
        <SectionLabel label="Contact" />
        <div className="mb-1">
          <label className="text-[11px] font-medium block mb-1" style={{ color: 'var(--text-secondary)' }}>Primary Contact</label>
          <select
            value={primaryContact}
            onChange={e => {
              const v = e.target.value as ContactMethod
              setPrimaryContact(v)
              if (v === secondaryContact) setSecondaryContact('')
            }}
            className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
            style={{ ...fieldInputStyle, fontSize: '16px' }}
          >
            {contactMethods.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <ContactInput method={primaryContact} />

        <div className="mb-1 mt-3">
          <label className="text-[11px] font-medium block mb-1" style={{ color: 'var(--text-secondary)' }}>
            Secondary Contact <span style={{ opacity: 0.5 }}>(optional)</span>
          </label>
          <select
            value={secondaryContact}
            onChange={e => setSecondaryContact(e.target.value as ContactMethod | '')}
            className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
            style={{ ...fieldInputStyle, fontSize: '16px' }}
          >
            {secondaryOptions.map(m => <option key={m} value={m}>{m || '— None —'}</option>)}
          </select>
        </div>
        {secondaryContact && <ContactInput method={secondaryContact as ContactMethod} />}

        {/* ━━━ Screening ━━━ */}
        <SectionLabel label="Screening" />
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div>
            <label className="text-[11px] font-medium block mb-1" style={{ color: 'var(--text-secondary)' }}>Status</label>
            <select value={screeningStatus} onChange={e => setScreeningStatus(e.target.value as ScreeningStatus)}
              className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
              style={{ ...fieldInputStyle, fontSize: '16px' }}>
              {screeningStatuses.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-medium block mb-1" style={{ color: 'var(--text-secondary)' }}>Method</label>
            <select value={screeningMethod} onChange={e => setScreeningMethod(e.target.value as ScreeningMethod | '')}
              className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
              style={{ ...fieldInputStyle, fontSize: '16px' }}>
              <option value="">—</option>
              {screeningMethods.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>

        {/* Screening proof uploads — only for existing Pro clients */}
        {isEditing && client && isPro() && (
          <div className="mb-3">
            <ScreeningProofManager clientId={client.id} editable />
          </div>
        )}

        {/* ━━━ Risk Level ━━━ */}
        <SectionLabel label="Risk Level" />
        <div className="mb-3">
          <RiskLevelBar value={riskLevel} onChange={setRiskLevel} />
        </div>

        {/* ━━━ Tags ━━━ */}
        <SectionLabel label="Tags" optional />
        <div className="mb-3">
          <TagPicker selected={tags} onChange={setTags} />
        </div>

        {/* ━━━ Preferences & Boundaries ━━━ */}
        <SectionLabel label="Preferences & Boundaries" optional />
        <FieldTextArea label="Preferences" value={preferences} onChange={setPreferences}
          placeholder="Likes, requests..." icon={<Heart size={12} />} />
        <FieldTextArea label="Boundaries" value={boundaries} onChange={setBoundaries}
          placeholder="Hard limits, boundaries..." icon={<ShieldAlert size={12} />} />

        {/* ━━━ Screening & Referral ━━━ */}
        <SectionLabel label="Screening & Referral" optional />
        <FieldTextInput label="Referral Source" value={referenceSource} onChange={setReferenceSource}
          placeholder="How they found you" icon={<Share2 size={12} />} />
        <FieldTextArea label="Verification Notes" value={verificationNotes} onChange={setVerificationNotes}
          placeholder="ID details, references..." icon={<ShieldCheck size={12} />} />

        {/* ━━━ Other Contact Methods ━━━ */}
        {allContactFields.length > 0 && (
          <>
            <SectionLabel label="Other Contact Methods" optional />
            <FieldHint text="Primary/secondary values are synced automatically." />
            {allContactFields.map(f => {
              const fm = fieldMap[f.key]
              return (
                <div key={f.key} className="mb-2">
                  <label className="text-[11px] font-medium block mb-1" style={{ color: 'var(--text-secondary)' }}>{f.label}</label>
                  <input
                    type={f.type}
                    value={fm.value}
                    onChange={e => fm.set(e.target.value)}
                    placeholder={f.placeholder}
                    className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                    style={{ ...fieldInputStyle, fontSize: '16px' }}
                  />
                </div>
              )
            })}
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
