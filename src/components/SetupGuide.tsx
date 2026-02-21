import { useState, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft, Check, Plus, Trash2, User, Phone as PhoneIcon, MessageSquare, UserCheck, Mail, Cake, CalendarDays, Share2, ShieldCheck, Heart, ShieldAlert, FileText } from 'lucide-react'
import { format, startOfDay } from 'date-fns'
import { db, newId, createClient, createBooking, bookingDurationFormatted, recordBookingPayment, formatCurrency } from '../db'
import { checkBookingConflict, adjustAvailabilityForBooking } from '../utils/availability'
import type {
  ContactMethod, ScreeningStatus, RiskLevel, LocationType,
  BookingStatus, PaymentMethod, RecurrencePattern, ClientTag
} from '../types'
import { useLocalStorage } from '../hooks/useSettings'
import { RiskLevelBar } from '../components/RiskLevelBar'
import { ScreeningStatusBar } from '../components/ScreeningStatusBar'
import { TagPicker } from '../components/TagPicker'
import {
  SectionLabel, FieldHint, FieldTextInput, FieldTextArea,
  FieldCurrency, FieldSelect, FieldToggle, FieldDateTime, FieldDate, fieldInputStyle
} from '../components/FormFields'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TYPES & CONSTANTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const STEPS = [
  { key: 'rates', title: 'Service Rates', icon: '💰', color: '#a855f7' },
  { key: 'client', title: 'First Client', icon: '👤', color: '#8b5cf6' },
  { key: 'booking', title: 'First Booking', icon: '📅', color: '#22c55e' },
  { key: 'availability', title: 'Availability', icon: '🟢', color: '#14b8a6' },
] as const

interface SetupGuideProps {
  onComplete: () => void
  onTabChange: (tab: number) => void
}

function GuidanceCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-xl p-4 mb-4"
      style={{ backgroundColor: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.2)' }}>
      <p className="text-sm font-bold mb-1" style={{ color: '#a855f7' }}>{title}</p>
      <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{description}</p>
    </div>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// STEP 1: SERVICE RATES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function RatesStep({ onNext }: { onNext: () => void }) {
  const rates = useLiveQuery(() => db.serviceRates.orderBy('sortOrder').toArray()) ?? []
  const [name, setName] = useState('')
  const [duration, setDuration] = useState(60)
  const [unit, setUnit] = useState<'min' | 'hr'>('hr')
  const [rate, setRate] = useState(0)
  const [showForm, setShowForm] = useState(rates.length === 0)

  useEffect(() => { if (rates.length === 0) setShowForm(true) }, [rates.length])

  async function addRate() {
    if (!name.trim() || rate <= 0) return
    const durationMins = unit === 'hr' ? Math.round(duration * 60) : duration
    await db.serviceRates.add({ id: newId(), name: name.trim(), duration: durationMins, rate, isActive: true, sortOrder: rates.length })
    setName(''); setDuration(unit === 'hr' ? 1 : 60); setRate(0); setShowForm(false)
  }

  return (
    <div>
      <GuidanceCard title="Set your service rates"
        description="These are the services you offer with their duration and price. When you create bookings later, you'll be able to tap these to quickly fill in the rate and duration. Add at least one to continue." />

      {rates.length > 0 && (
        <div className="mb-4 space-y-2">
          {rates.map(r => (
            <div key={r.id} className="flex items-center justify-between px-3 py-2.5 rounded-lg"
              style={{ backgroundColor: 'var(--bg-secondary)' }}>
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{r.name}</p>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{bookingDurationFormatted(r.duration)} — {formatCurrency(r.rate)}</p>
              </div>
              <button type="button" onClick={() => db.serviceRates.delete(r.id)} className="text-red-500 p-1.5"><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      )}

      {showForm ? (
        <div className="rounded-xl p-4 mb-4" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
          <FieldTextInput label="Rate Name" value={name} onChange={setName} placeholder="e.g. Quick Visit, 1 Hour, Dinner Date"
            hint="A descriptive name for this service option." required />
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs font-semibold block mb-1" style={{ color: 'var(--text-primary)' }}>Duration</label>
              <div className="flex rounded-lg overflow-hidden mb-2" style={{ border: '2px solid var(--border)' }}>
                <button type="button" onClick={() => { setUnit('min'); setDuration(prev => prev < 10 ? Math.round(prev * 60) : prev) }}
                  className="flex-1 py-2 text-xs font-bold text-center"
                  style={{ backgroundColor: unit === 'min' ? '#a855f7' : 'transparent', color: unit === 'min' ? '#fff' : 'var(--text-secondary)', WebkitTapHighlightColor: 'transparent' }}>Min</button>
                <button type="button" onClick={() => { setUnit('hr'); setDuration(prev => prev > 10 ? Math.round((prev / 60) * 10) / 10 : prev) }}
                  className="flex-1 py-2 text-xs font-bold text-center"
                  style={{ backgroundColor: unit === 'hr' ? '#a855f7' : 'transparent', color: unit === 'hr' ? '#fff' : 'var(--text-secondary)', WebkitTapHighlightColor: 'transparent' }}>Hr</button>
              </div>
              <input type="text" inputMode="decimal" value={duration > 0 ? String(duration) : ''}
                onChange={e => { const raw = e.target.value.replace(/[^0-9.]/g, ''); if (raw === '') { setDuration(0); return }; const v = parseFloat(raw); if (!isNaN(v)) setDuration(v) }}
                placeholder="1" className="w-full px-3 py-2.5 rounded-lg text-sm outline-none" style={fieldInputStyle} />
              <FieldHint text="How long this session lasts." />
            </div>
            <div className="flex-1">
              <FieldCurrency label="Rate" value={rate} onChange={setRate} hint="Your price for this service." />
            </div>
          </div>
          <div className="flex gap-2 mt-2">
            <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-2 rounded-lg text-sm" style={{ color: 'var(--text-secondary)' }}>Cancel</button>
            <button type="button" onClick={addRate} disabled={!name.trim() || rate <= 0}
              className="flex-1 py-2 rounded-lg text-sm font-bold text-white"
              style={{ backgroundColor: name.trim() && rate > 0 ? '#a855f7' : '#666' }}>Add Rate</button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setShowForm(true)}
          className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-medium mb-4 active:opacity-80"
          style={{ backgroundColor: 'rgba(168,85,247,0.1)', color: '#a855f7' }}><Plus size={16} /> Add Another Rate</button>
      )}

      <button type="button" onClick={onNext} disabled={rates.length === 0}
        className="w-full py-3.5 rounded-xl font-bold text-sm text-white active:opacity-80"
        style={{ backgroundColor: rates.length > 0 ? '#a855f7' : '#555' }}>
        {rates.length > 0 ? 'Next — Add Your First Client' : 'Add at least one rate to continue'}
      </button>
    </div>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// STEP 2: FIRST CLIENT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const contactMethods: ContactMethod[] = ['Phone', 'Text', 'Email', 'Telegram', 'Signal', 'WhatsApp', 'Other']

function ClientStep({ onNext, setCreatedClientId }: { onNext: () => void; setCreatedClientId: (id: string) => void }) {
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
  const [birthday, setBirthday] = useState('')
  const [clientSince, setClientSince] = useState('')
  const [tags, setTags] = useState<ClientTag[]>([])
  const [requiresSafetyCheck, setRequiresSafetyCheck] = useState(true)
  const [showOptional, setShowOptional] = useState(false)

  async function save() {
    if (!alias.trim()) return
    const newClient = createClient({
      alias: alias.trim(), realName: realName.trim() || undefined, phone: phone.trim() || undefined,
      email: email.trim() || undefined, preferredContact, screeningStatus, riskLevel,
      notes: notes.trim(), preferences: preferences.trim(), boundaries: boundaries.trim(),
      referenceSource: referenceSource.trim() || undefined, verificationNotes: verificationNotes.trim() || undefined,
      tags, requiresSafetyCheck, birthday: birthday ? new Date(birthday) : undefined,
      clientSince: clientSince ? new Date(clientSince) : undefined,
    })
    await db.clients.add(newClient)
    setCreatedClientId(newClient.id)
    onNext()
  }

  return (
    <div>
      <GuidanceCard title="Add your first client"
        description="Only the alias is required — everything else can be added now or later. We'll explain what each field is for." />

      <SectionLabel label="Basic Info" />
      <FieldTextInput label="Alias" value={alias} onChange={setAlias} placeholder="e.g. James W." required
        hint="A name or nickname you use to identify this client. This is the only required field." icon={<User size={12} />} />
      <FieldTextInput label="Phone" value={phone} onChange={setPhone} placeholder="Phone number" type="tel"
        hint="Enables one-tap calling and texting from their profile." icon={<PhoneIcon size={12} />} />
      <FieldSelect label="Preferred Contact" value={preferredContact} options={contactMethods} onChange={setPreferredContact}
        hint="How this client prefers to be reached. Shows on their profile for quick reference." icon={<MessageSquare size={12} />} />
      {/* Screening Status */}
      <SectionLabel label="Screening" />
      <div className="mb-3">
        <ScreeningStatusBar value={screeningStatus} onChange={setScreeningStatus} />
        <FieldHint text="Slide or tap to set. Declined → Pending → Verified." />
      </div>

      <SectionLabel label="Risk Level" />
      <div className="mb-3">
        <RiskLevelBar value={riskLevel} onChange={setRiskLevel} />
        <FieldHint text="Slide to set risk level. Unknown means not yet assessed." />
      </div>

      <SectionLabel label="Tags" optional />
      <div className="mb-3"><TagPicker selected={tags} onChange={setTags} /></div>

      <FieldToggle label="Requires Safety Check-In" value={requiresSafetyCheck} onChange={setRequiresSafetyCheck}
        hint="When enabled, bookings with this client will prompt you to check in with your safety contact." />

      <button type="button" onClick={() => setShowOptional(!showOptional)}
        className="flex items-center gap-2 mb-4 text-xs font-semibold active:opacity-70" style={{ color: '#a855f7' }}>
        {showOptional ? <ChevronLeft size={14} /> : <Plus size={14} />}
        {showOptional ? 'Hide' : 'Show'} additional fields
      </button>

      {showOptional && (
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
            placeholder="e.g. Website, friend, Twitter" hint="How you found this client or how they found you." icon={<Share2 size={12} />} />
          <FieldTextArea label="Verification Notes" value={verificationNotes} onChange={setVerificationNotes}
            placeholder="e.g. Verified via references, ID checked" hint="Notes about their screening or verification process." icon={<ShieldCheck size={12} />} />
          <SectionLabel label="Preferences & Boundaries" optional />
          <FieldTextArea label="Preferences" value={preferences} onChange={setPreferences}
            placeholder="Things they like, special requests..." hint="Shows on booking details for reference." icon={<Heart size={12} />} />
          <FieldTextArea label="Boundaries" value={boundaries} onChange={setBoundaries}
            placeholder="Limits, things to avoid..." hint="Shows prominently on booking details." icon={<ShieldAlert size={12} />} />
          <SectionLabel label="Notes" optional />
          <FieldTextArea label="Notes" value={notes} onChange={setNotes} placeholder="Any other details..." icon={<FileText size={12} />} />
        </>
      )}

      <button type="button" onClick={save} disabled={!alias.trim()}
        className="w-full py-3.5 rounded-xl font-bold text-sm text-white active:opacity-80"
        style={{ backgroundColor: alias.trim() ? '#a855f7' : '#555' }}>
        {alias.trim() ? 'Save Client — Next Step' : 'Enter an alias to continue'}
      </button>
    </div>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// STEP 3: FIRST BOOKING
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const locationTypes: LocationType[] = ['Incall', 'Outcall', 'Travel', 'Virtual']
const bookingStatuses: BookingStatus[] = ['Inquiry', 'Screening', 'Pending Deposit', 'Confirmed', 'In Progress', 'Completed']
const paymentMethods: PaymentMethod[] = ['Cash', 'e-Transfer', 'Crypto', 'Venmo', 'Cash App', 'Zelle', 'Gift Card', 'Other']
const recurrenceOptions: RecurrencePattern[] = ['none', 'weekly', 'biweekly', 'monthly']

function BookingStep({ onNext, createdClientId }: { onNext: () => void; createdClientId: string }) {
  const clients = useLiveQuery(() => db.clients.filter(c => !c.isBlocked).sortBy('alias')) ?? []
  const rates = useLiveQuery(() => db.serviceRates.filter(r => r.isActive).sortBy('sortOrder')) ?? []
  const [defaultDepositPct] = useLocalStorage('defaultDepositPercentage', 25)

  const [clientId, setClientId] = useState(createdClientId)
  const [dateTime, setDateTime] = useState(format(new Date(), "yyyy-MM-dd'T'HH:mm"))
  const [duration, setDuration] = useState(60)
  const [durationUnit, setDurationUnit] = useState<'min' | 'hr'>('min')
  const [customDuration, setCustomDuration] = useState(false)
  const [locationType, setLocationType] = useState<LocationType>('Incall')
  const [locationAddress, setLocationAddress] = useState('')
  const [locationNotes, setLocationNotes] = useState('')
  const [status, setStatus] = useState<BookingStatus>('Confirmed')
  const [baseRate, setBaseRate] = useState(0)
  const [extras, setExtras] = useState(0)
  const [travelFee, setTravelFee] = useState(0)
  const [depositAmount, setDepositAmount] = useState(0)
  const [depositReceived, setDepositReceived] = useState(false)
  const [depositMethod, setDepositMethod] = useState<PaymentMethod | ''>('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | ''>('')
  const [notes, setNotes] = useState('')
  const [requiresSafetyCheck, setRequiresSafetyCheck] = useState(true)
  const [recurrence, setRecurrence] = useState<RecurrencePattern>('none')
  const [showOptional, setShowOptional] = useState(false)
  const [userEditedDeposit, setUserEditedDeposit] = useState(false)
  const [conflictWarning, setConflictWarning] = useState<{ reason: string; dayStatus: string; isDoubleBook: boolean } | null>(null)

  useEffect(() => { if (rates.length > 0 && baseRate === 0) { setBaseRate(rates[0].rate); setDuration(rates[0].duration); setDepositAmount(Math.round(rates[0].rate * defaultDepositPct / 100)) } }, [rates.length])
  useEffect(() => { if (!userEditedDeposit && baseRate > 0) setDepositAmount(Math.round(baseRate * defaultDepositPct / 100)) }, [baseRate, defaultDepositPct, userEditedDeposit])
  useEffect(() => { const c = clients.find(c => c.id === clientId); if (c) setRequiresSafetyCheck(c.riskLevel === 'High Risk' || c.riskLevel === 'Unknown') }, [clientId, clients])

  function selectRate(dur: number, r: number) { setDuration(dur); setBaseRate(r); setCustomDuration(false) }
  const total = baseRate + extras + ((locationType === 'Outcall' || locationType === 'Travel') ? travelFee : 0)
  const selectedClient = clients.find(c => c.id === clientId)
  const durationFmt = (mins: number) => { const h = Math.floor(mins / 60); const m = mins % 60; if (h > 0 && m > 0) return `${h}h ${m}m`; if (h > 0) return `${h}h`; return `${m}m` }

  async function handleSave() {
    const dt = new Date(dateTime)
    const conflict = await checkBookingConflict(dt, duration)
    if (conflict.hasConflict) { setConflictWarning({ reason: conflict.reason, dayStatus: conflict.dayStatus ?? '', isDoubleBook: conflict.isDoubleBook ?? false }); return }
    await doSave(false)
  }

  async function doSave(overrideAvailability: boolean) {
    const dt = new Date(dateTime)
    const finalTravelFee = (locationType === 'Outcall' || locationType === 'Travel') ? travelFee : 0
    const newBooking = createBooking({ clientId: clientId || undefined, dateTime: dt, duration, locationType,
      locationAddress: locationAddress.trim() || undefined, locationNotes: locationNotes.trim() || undefined,
      status, baseRate, extras, travelFee: finalTravelFee, depositAmount, depositReceived,
      depositMethod: depositMethod || undefined, paymentMethod: paymentMethod || undefined,
      notes: notes.trim(), requiresSafetyCheck, recurrence,
      // Set timestamps when creating with an advanced status
      ...(status === 'Confirmed' || status === 'In Progress' || status === 'Completed' ? { confirmedAt: new Date() } : {}),
      ...(status === 'Completed' ? { completedAt: new Date() } : {}),
    })
    await db.bookings.add(newBooking)
    // If deposit marked as received, record through payment ledger (matches BookingEditor)
    if (depositReceived && depositAmount > 0) {
      const selectedClient = clients.find(c => c.id === clientId)
      await recordBookingPayment({
        bookingId: newBooking.id,
        amount: depositAmount,
        method: paymentMethod || undefined,
        label: 'Deposit',
        clientAlias: selectedClient?.alias,
      })
    }
    if (overrideAvailability) await adjustAvailabilityForBooking(dt, duration, newBooking.id)
    setConflictWarning(null); onNext()
  }

  return (
    <div>
      <GuidanceCard title="Create your first booking"
        description="We've pre-filled the client you just created and your first service rate. Adjust anything you like." />

      <SectionLabel label="Client" />
      <div className="mb-3">
        <select value={clientId} onChange={e => setClientId(e.target.value)}
          className="w-full px-3 py-2.5 rounded-lg text-sm outline-none" style={fieldInputStyle}>
          <option value="">No client (anonymous)</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.alias}</option>)}
        </select>
      </div>

      <FieldDateTime label="Date & Time" value={dateTime} onChange={setDateTime} />

      <SectionLabel label="Duration" />
      <div className="flex rounded-xl overflow-hidden mb-3" style={{ border: '2px solid var(--border)' }}>
        <button type="button" onClick={() => setDurationUnit('min')} className="flex-1 py-2.5 text-sm font-bold text-center active:opacity-80"
          style={{ backgroundColor: durationUnit === 'min' ? '#a855f7' : 'transparent', color: durationUnit === 'min' ? '#fff' : 'var(--text-secondary)', WebkitTapHighlightColor: 'transparent' }}>Minutes</button>
        <button type="button" onClick={() => setDurationUnit('hr')} className="flex-1 py-2.5 text-sm font-bold text-center active:opacity-80"
          style={{ backgroundColor: durationUnit === 'hr' ? '#a855f7' : 'transparent', color: durationUnit === 'hr' ? '#fff' : 'var(--text-secondary)', WebkitTapHighlightColor: 'transparent' }}>Hours</button>
      </div>

      {rates.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {rates.map(r => (
            <button key={r.id} type="button" onClick={() => selectRate(r.duration, r.rate)}
              className={`px-3 py-2 rounded-lg text-sm font-medium ${duration === r.duration && baseRate === r.rate && !customDuration ? 'bg-purple-500/20 text-purple-500' : ''}`}
              style={duration !== r.duration || baseRate !== r.rate || customDuration ? { backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' } : {}}>
              <div className="font-bold">{durationUnit === 'hr' ? (r.duration >= 60 ? `${Math.round((r.duration / 60) * 10) / 10}h` : `${r.duration}m`) : durationFmt(r.duration)}</div>
              <div className="text-xs opacity-70">{formatCurrency(r.rate)}</div>
            </button>
          ))}
          <button type="button" onClick={() => setCustomDuration(true)}
            className={`px-3 py-2 rounded-lg text-sm font-medium ${customDuration ? 'bg-purple-500/20 text-purple-500' : ''}`}
            style={!customDuration ? { backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' } : {}}>Custom</button>
        </div>
      )}

      {(customDuration || rates.length === 0) && (
        <div className="flex items-center gap-3 mt-2 mb-3">
          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{durationUnit === 'hr' ? 'Hours' : 'Minutes'}</span>
          <input type="text" inputMode="decimal"
            value={(() => { if (duration === 0) return ''; if (durationUnit === 'hr') return String(Math.round((duration / 60) * 10) / 10); return String(duration) })()}
            onChange={e => { const raw = e.target.value.replace(/[^0-9.]/g, ''); if (raw === '' || raw === '.') { setDuration(0); return }; const val = parseFloat(raw); if (!isNaN(val)) setDuration(durationUnit === 'hr' ? Math.round(val * 60) : Math.round(val)) }}
            placeholder="0" className="flex-1 px-3 py-2.5 rounded-lg text-sm outline-none" style={fieldInputStyle} />
        </div>
      )}

      <SectionLabel label="Pricing" />
      <div className="flex gap-3">
        <div className="flex-1"><FieldCurrency label="Base Rate" value={baseRate} onChange={setBaseRate} /></div>
        <div className="flex-1"><FieldCurrency label="Extras" value={extras} onChange={setExtras} /></div>
      </div>

      <SectionLabel label="Location" />
      <FieldSelect label="Type" value={locationType} options={locationTypes} onChange={setLocationType}
        hint="Incall = your place. Outcall = their place. Travel = out of town. Virtual = online." />
      {(locationType === 'Outcall' || locationType === 'Travel') && (
        <>
          <FieldTextInput label="Address" value={locationAddress} onChange={setLocationAddress} placeholder="Hotel name, address, etc." />
          <FieldCurrency label="Travel Fee" value={travelFee} onChange={setTravelFee} />
        </>
      )}
      <FieldTextInput label="Location Notes" value={locationNotes} onChange={setLocationNotes} placeholder="Room number, parking info, gate code..." />

      {total > 0 && (
        <div className="flex items-center justify-between mb-3 px-3 py-2.5 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)' }}>
          <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Total</span>
          <span className="text-lg font-bold text-green-500">{formatCurrency(total)}</span>
        </div>
      )}

      <SectionLabel label="Deposit" />
      <div className="flex gap-3">
        <div className="flex-1"><FieldCurrency label="Amount" value={depositAmount} onChange={v => { setDepositAmount(v); setUserEditedDeposit(true) }}
          hint={`Auto-calculated at ${defaultDepositPct}% of base rate.`} /></div>
        <div className="flex-1"><FieldSelect label="Deposit Method" value={depositMethod || '' as PaymentMethod}
          options={['', ...paymentMethods] as PaymentMethod[]} onChange={v => setDepositMethod(v || '')}
          displayFn={(v: string) => v || 'Not set'} /></div>
      </div>
      {depositAmount > 0 && <FieldToggle label="Deposit Received?" value={depositReceived} onChange={setDepositReceived} />}

      <SectionLabel label="Status & Payment" />
      <FieldSelect label="Booking Status" value={status} options={bookingStatuses} onChange={setStatus} />
      <FieldSelect label="Payment Method" value={paymentMethod || '' as PaymentMethod}
        options={['', ...paymentMethods] as PaymentMethod[]} onChange={v => setPaymentMethod(v || '')}
        displayFn={(v: string) => v || 'Not set'} />

      <button type="button" onClick={() => setShowOptional(!showOptional)}
        className="flex items-center gap-2 mb-4 text-xs font-semibold active:opacity-70" style={{ color: '#a855f7' }}>
        {showOptional ? <ChevronLeft size={14} /> : <Plus size={14} />}
        {showOptional ? 'Hide' : 'Show'} additional options
      </button>

      {showOptional && (
        <>
          <SectionLabel label="Safety" />
          <FieldToggle label="Safety Check-In" value={requiresSafetyCheck}
            onChange={v => { if (!v && selectedClient && (selectedClient.riskLevel === 'High Risk' || selectedClient.riskLevel === 'Unknown')) return; setRequiresSafetyCheck(v) }}
            disabled={!!selectedClient && (selectedClient.riskLevel === 'High Risk' || selectedClient.riskLevel === 'Unknown')}
            hint={selectedClient && (selectedClient.riskLevel === 'High Risk' || selectedClient.riskLevel === 'Unknown')
              ? 'Required for unknown or high-risk clients.' : 'Get a reminder to check in with your safety contact.'} />
          <SectionLabel label="Repeat" />
          <FieldSelect label="Recurrence" value={recurrence} options={recurrenceOptions} onChange={setRecurrence}
            displayFn={(v: string) => v === 'none' ? 'None' : v === 'weekly' ? 'Weekly' : v === 'biweekly' ? 'Every 2 Weeks' : 'Monthly'} />
          <SectionLabel label="Notes" />
          <FieldTextArea label="Booking Notes" value={notes} onChange={setNotes} placeholder="Special instructions, room number..." />
        </>
      )}

      <button type="button" onClick={handleSave} className="w-full py-3.5 rounded-xl font-bold text-sm text-white active:opacity-80"
        style={{ backgroundColor: '#a855f7' }}>Save Booking — Last Step</button>

      {conflictWarning && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center px-6" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
          onClick={() => setConflictWarning(null)}>
          <div className="w-full max-w-sm rounded-2xl p-6" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
            onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-base mb-2" style={{ color: 'var(--text-primary)' }}>
              {conflictWarning.isDoubleBook ? '⚠️ Double Booking' : '⚠️ Availability Conflict'}</h3>
            <p className="text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>{conflictWarning.reason}</p>
            {!conflictWarning.isDoubleBook && <p className="text-xs mb-5" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>If you continue, this day will be set to <strong style={{ color: '#f97316' }}>Limited</strong> and only this booking's time slot will be open.</p>}
            {conflictWarning.isDoubleBook && <p className="text-xs mb-5" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>This booking will overlap with another appointment.</p>}
            <div className="flex gap-3">
              <button type="button" onClick={() => setConflictWarning(null)} className="flex-1 py-3 rounded-xl text-sm font-semibold"
                style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>Go Back</button>
              <button type="button" onClick={() => doSave(!conflictWarning.isDoubleBook)} className="flex-1 py-3 rounded-xl text-sm font-semibold text-white"
                style={{ background: conflictWarning.isDoubleBook ? 'linear-gradient(135deg, #ef4444, #dc2626)' : 'linear-gradient(135deg, #f97316, #ef4444)' }}>Book Anyway</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// STEP 4: AVAILABILITY
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function AvailabilityStep({ onComplete }: { onComplete: () => void }) {
  const [status, setStatus] = useState<'Available' | 'Limited' | 'Busy' | 'Off'>('Available')
  const [startTime, setStartTime] = useState('10:00')
  const [endTime, setEndTime] = useState('22:00')
  const [saved, setSaved] = useState(false)

  async function save() {
    const today = startOfDay(new Date())
    const existing = await db.availability.where('date').equals(today).first()
    const record = { status, startTime: status === 'Available' ? startTime : undefined, endTime: status === 'Available' ? endTime : undefined }
    if (existing) await db.availability.update(existing.id, record)
    else await db.availability.add({ id: newId(), date: today, ...record })
    setSaved(true)
  }

  return (
    <div>
      <GuidanceCard title="Set today's availability"
        description="This appears on the calendar and helps you track your schedule. You can set availability for any day by tapping the colored dot below the selected date on the Schedule tab." />

      <SectionLabel label="Status" />
      <div className="grid grid-cols-2 gap-2 mb-4">
        {([
          { s: 'Available' as const, color: '#22c55e', desc: 'Open for bookings with set hours' },
          { s: 'Limited' as const, color: '#f97316', desc: 'Selective — only specific windows' },
          { s: 'Busy' as const, color: '#ef4444', desc: 'Fully booked or blocked' },
          { s: 'Off' as const, color: '#6b7280', desc: 'Not working today' },
        ]).map(item => (
          <button key={item.s} type="button" onClick={() => setStatus(item.s)}
            className="flex items-center gap-2.5 p-3 rounded-xl border active:scale-[0.97] transition-transform"
            style={{ backgroundColor: status === item.s ? `${item.color}15` : 'var(--bg-secondary)',
              borderColor: status === item.s ? item.color : 'var(--border)',
              borderWidth: status === item.s ? '2px' : '1px', WebkitTapHighlightColor: 'transparent' }}>
            <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
            <div className="text-left">
              <span className="text-sm font-semibold block" style={{ color: 'var(--text-primary)' }}>{item.s}</span>
              <span className="text-[10px] block" style={{ color: 'var(--text-secondary)' }}>{item.desc}</span>
            </div>
          </button>
        ))}
      </div>

      {status === 'Available' && (
        <>
          <SectionLabel label="Working Hours" />
          <div className="flex items-center gap-3 mb-3">
            <div className="flex-1">
              <label className="text-[10px] uppercase block mb-1" style={{ color: 'var(--text-secondary)' }}>From</label>
              <input type="time" value={startTime} step="1800" onChange={e => setStartTime(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg text-sm font-medium" style={fieldInputStyle} />
            </div>
            <span className="text-sm mt-4" style={{ color: 'var(--text-secondary)' }}>→</span>
            <div className="flex-1">
              <label className="text-[10px] uppercase block mb-1" style={{ color: 'var(--text-secondary)' }}>Until</label>
              <input type="time" value={endTime} step="1800" onChange={e => setEndTime(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg text-sm font-medium" style={fieldInputStyle} />
            </div>
          </div>
          <FieldHint text="Booking outside these hours triggers a conflict warning." />
        </>
      )}

      {!saved ? (
        <button type="button" onClick={save} className="w-full py-3.5 rounded-xl font-bold text-sm text-white active:opacity-80 mb-3 mt-4"
          style={{ backgroundColor: '#a855f7' }}>Set Today's Availability</button>
      ) : (
        <div className="text-center mb-4 mt-4">
          <div className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-green-500/15 text-green-500 font-bold text-sm mb-4">
            <Check size={18} /> Saved!</div>
        </div>
      )}

      <div className="rounded-xl p-4 mb-4" style={{ backgroundColor: 'var(--bg-secondary)' }}>
        <p className="text-xs font-bold mb-2" style={{ color: 'var(--text-primary)' }}>💡 Good to know</p>
        <ul className="text-xs space-y-1.5" style={{ color: 'var(--text-secondary)' }}>
          <li>• Colored dots appear on calendar days showing your status</li>
          <li>• Tap the dot below a selected day to change that day's availability</li>
          <li>• Booking on an Off/Busy day shows a warning — you can override it</li>
          <li>• Overriding auto-sets the day to Limited with just that time slot open</li>
          <li>• Your status and hours show on the Home dashboard</li>
        </ul>
      </div>

      <button type="button" onClick={onComplete} className="w-full py-3.5 rounded-xl font-bold text-sm text-white active:opacity-80"
        style={{ backgroundColor: '#22c55e' }}>✨ Finish Setup — Start Using Companion</button>
    </div>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MAIN SETUP GUIDE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function SetupGuide({ onComplete, onTabChange }: SetupGuideProps) {
  const [stepIdx, setStepIdx] = useState(0)
  const [createdClientId, setCreatedClientId] = useState('')

  function handleNext() {
    if (stepIdx < STEPS.length - 1) {
      const nextKey = STEPS[stepIdx + 1].key
      if (nextKey === 'booking' || nextKey === 'availability') onTabChange(2)
      if (nextKey === 'client') onTabChange(1)
      setStepIdx(stepIdx + 1)
    }
  }

  const step = STEPS[stepIdx]

  return (
    <div className="fixed inset-0 flex flex-col" style={{ backgroundColor: 'var(--bg-primary)', zIndex: 100 }}>
      <div className="px-4 pt-4 pb-2 shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">{step.icon}</span>
            <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{step.title}</h2>
          </div>
          <button type="button" onClick={onComplete} className="text-xs px-3 py-1.5 rounded-full active:opacity-70"
            style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>Skip Setup</button>
        </div>
        <div className="flex gap-2">
          {STEPS.map((s, i) => (
            <div key={s.key} className="flex-1 h-1.5 rounded-full transition-all"
              style={{ backgroundColor: i <= stepIdx ? s.color : 'var(--border)' }} />
          ))}
        </div>
        <p className="text-[10px] mt-1.5 text-center" style={{ color: 'var(--text-secondary)' }}>Step {stepIdx + 1} of {STEPS.length}</p>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-8">
        {step.key === 'rates' && <RatesStep onNext={handleNext} />}
        {step.key === 'client' && <ClientStep onNext={handleNext} setCreatedClientId={setCreatedClientId} />}
        {step.key === 'booking' && <BookingStep onNext={handleNext} createdClientId={createdClientId} />}
        {step.key === 'availability' && <AvailabilityStep onComplete={onComplete} />}
      </div>
    </div>
  )
}
