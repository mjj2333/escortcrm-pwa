import { useState, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  ChevronLeft, Check, Plus, Trash2
} from 'lucide-react'
import { format, startOfDay } from 'date-fns'
import { db, newId, bookingDurationFormatted } from '../db'
import type {
  ContactMethod, ScreeningStatus, RiskLevel, LocationType,
  BookingStatus, PaymentMethod, RecurrencePattern, ClientTag
} from '../types'
import { useLocalStorage } from '../hooks/useSettings'

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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FIELD HINT COMPONENT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function FieldHint({ text, required }: { text: string; required?: boolean }) {
  return (
    <p className="text-[11px] mt-0.5 px-1 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
      {required && <span className="text-purple-400 font-bold">Required · </span>}
      {text}
    </p>
  )
}

function SectionLabel({ label, optional }: { label: string; optional?: boolean }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
        {label}
      </span>
      {optional && (
        <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
          optional
        </span>
      )}
    </div>
  )
}

function GuidanceCard({ title, description }: { title: string; description: string }) {
  return (
    <div
      className="rounded-xl p-4 mb-4"
      style={{ backgroundColor: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.2)' }}
    >
      <p className="text-sm font-bold mb-1" style={{ color: '#a855f7' }}>{title}</p>
      <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{description}</p>
    </div>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// INPUT HELPERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function TextInput({ label, value, onChange, placeholder, hint, required }:
  { label: string; value: string; onChange: (v: string) => void; placeholder?: string; hint?: string; required?: boolean }
) {
  return (
    <div className="mb-3">
      <label className="text-xs font-semibold block mb-1" style={{ color: 'var(--text-primary)' }}>
        {label} {required && <span className="text-purple-400">*</span>}
      </label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
        style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)', fontSize: '16px' }}
      />
      {hint && <FieldHint text={hint} required={required} />}
    </div>
  )
}

function TextAreaInput({ label, value, onChange, placeholder, hint }:
  { label: string; value: string; onChange: (v: string) => void; placeholder?: string; hint?: string }
) {
  return (
    <div className="mb-3">
      <label className="text-xs font-semibold block mb-1" style={{ color: 'var(--text-primary)' }}>
        {label}
      </label>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={2}
        className="w-full px-3 py-2.5 rounded-lg text-sm outline-none resize-none"
        style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)', fontSize: '16px' }}
      />
      {hint && <FieldHint text={hint} />}
    </div>
  )
}

function NumberInput({ label, value, onChange, placeholder, hint, prefix }:
  { label: string; value: number; onChange: (v: number) => void; placeholder?: string; hint?: string; prefix?: string }
) {
  return (
    <div className="mb-3">
      <label className="text-xs font-semibold block mb-1" style={{ color: 'var(--text-primary)' }}>
        {label}
      </label>
      <div className="flex items-center gap-1">
        {prefix && <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{prefix}</span>}
        <input
          type="text"
          inputMode="decimal"
          value={value > 0 ? String(value) : ''}
          onChange={e => {
            const raw = e.target.value.replace(/[^0-9.]/g, '')
            if (raw === '' || raw === '.') { onChange(0); return }
            const v = parseFloat(raw)
            if (!isNaN(v)) onChange(v)
          }}
          placeholder={placeholder ?? '0'}
          className="flex-1 px-3 py-2.5 rounded-lg text-sm outline-none"
          style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)', fontSize: '16px' }}
        />
      </div>
      {hint && <FieldHint text={hint} />}
    </div>
  )
}

function SelectInput<T extends string>({ label, value, options, onChange, hint, displayFn }:
  { label: string; value: T; options: T[]; onChange: (v: T) => void; hint?: string; displayFn?: (v: T) => string }
) {
  return (
    <div className="mb-3">
      <label className="text-xs font-semibold block mb-1" style={{ color: 'var(--text-primary)' }}>{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value as T)}
        className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
        style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)', fontSize: '16px' }}
      >
        {options.map(o => (
          <option key={o} value={o}>{displayFn ? displayFn(o) : o}</option>
        ))}
      </select>
      {hint && <FieldHint text={hint} />}
    </div>
  )
}

function ToggleInput({ label, value, onChange, hint }:
  { label: string; value: boolean; onChange: (v: boolean) => void; hint?: string }
) {
  return (
    <div className="mb-3">
      <button
        type="button"
        onClick={() => onChange(!value)}
        className="flex items-center justify-between w-full"
      >
        <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{label}</span>
        <div
          className="w-10 h-6 rounded-full p-0.5 transition-colors"
          style={{ backgroundColor: value ? '#a855f7' : 'var(--border)' }}
        >
          <div
            className="w-5 h-5 rounded-full bg-white transition-transform"
            style={{ transform: value ? 'translateX(16px)' : 'translateX(0)' }}
          />
        </div>
      </button>
      {hint && <FieldHint text={hint} />}
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

  async function addRate() {
    if (!name.trim() || rate <= 0) return
    const durationMins = unit === 'hr' ? Math.round(duration * 60) : duration
    await db.serviceRates.add({
      id: newId(), name: name.trim(), duration: durationMins,
      rate, isActive: true, sortOrder: rates.length,
    })
    setName('')
    setDuration(unit === 'hr' ? 1 : 60)
    setRate(0)
    setShowForm(false)
  }

  async function removeRate(id: string) {
    await db.serviceRates.delete(id)
  }

  return (
    <div>
      <GuidanceCard
        title="Set your service rates"
        description="These are the services you offer with their duration and price. When you create bookings later, you'll be able to tap these to quickly fill in the rate and duration. Add at least one to continue."
      />

      {/* Existing rates */}
      {rates.length > 0 && (
        <div className="mb-4 space-y-2">
          {rates.map(r => (
            <div
              key={r.id}
              className="flex items-center justify-between px-3 py-2.5 rounded-lg"
              style={{ backgroundColor: 'var(--bg-secondary)' }}
            >
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{r.name}</p>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {bookingDurationFormatted(r.duration)} — ${r.rate}
                </p>
              </div>
              <button onClick={() => removeRate(r.id)} className="text-red-500 p-1.5"><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      )}

      {/* Add rate form */}
      {showForm ? (
        <div
          className="rounded-xl p-4 mb-4"
          style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
        >
          <TextInput
            label="Rate Name"
            value={name}
            onChange={setName}
            placeholder="e.g. Quick Visit, 1 Hour, Dinner Date"
            hint="A descriptive name for this service option."
            required
          />
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs font-semibold block mb-1" style={{ color: 'var(--text-primary)' }}>Duration</label>
              <div className="flex gap-2 mb-1">
                <div
                  className="flex rounded-lg overflow-hidden flex-1"
                  style={{ border: '2px solid var(--border)' }}
                >
                  <button
                    type="button"
                    onClick={() => { setUnit('min'); setDuration(prev => prev < 10 ? Math.round(prev * 60) : prev) }}
                    className="flex-1 py-2 text-xs font-bold text-center"
                    style={{ backgroundColor: unit === 'min' ? '#a855f7' : 'transparent', color: unit === 'min' ? '#fff' : 'var(--text-secondary)' }}
                  >Min</button>
                  <button
                    type="button"
                    onClick={() => { setUnit('hr'); setDuration(prev => prev > 10 ? Math.round((prev / 60) * 10) / 10 : prev) }}
                    className="flex-1 py-2 text-xs font-bold text-center"
                    style={{ backgroundColor: unit === 'hr' ? '#a855f7' : 'transparent', color: unit === 'hr' ? '#fff' : 'var(--text-secondary)' }}
                  >Hr</button>
                </div>
              </div>
              <input
                type="text"
                inputMode="decimal"
                value={duration > 0 ? String(duration) : ''}
                onChange={e => {
                  const raw = e.target.value.replace(/[^0-9.]/g, '')
                  if (raw === '') { setDuration(0); return }
                  const v = parseFloat(raw)
                  if (!isNaN(v)) setDuration(v)
                }}
                placeholder="1"
                className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)', fontSize: '16px' }}
              />
              <FieldHint text="How long this session lasts." />
            </div>
            <div className="flex-1">
              <NumberInput label="Rate ($)" value={rate} onChange={setRate} hint="Your price for this service." />
            </div>
          </div>
          <div className="flex gap-2 mt-2">
            <button onClick={() => setShowForm(false)} className="flex-1 py-2 rounded-lg text-sm" style={{ color: 'var(--text-secondary)' }}>Cancel</button>
            <button
              onClick={addRate}
              disabled={!name.trim() || rate <= 0}
              className="flex-1 py-2 rounded-lg text-sm font-bold text-white"
              style={{ backgroundColor: name.trim() && rate > 0 ? '#a855f7' : '#666' }}
            >Add Rate</button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-medium mb-4 active:opacity-80"
          style={{ backgroundColor: 'rgba(168,85,247,0.1)', color: '#a855f7' }}
        >
          <Plus size={16} /> Add Another Rate
        </button>
      )}

      <button
        onClick={onNext}
        disabled={rates.length === 0}
        className="w-full py-3.5 rounded-xl font-bold text-sm text-white active:opacity-80"
        style={{ backgroundColor: rates.length > 0 ? '#a855f7' : '#555' }}
      >
        {rates.length > 0 ? 'Next — Add Your First Client' : 'Add at least one rate to continue'}
      </button>
    </div>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// STEP 2: FIRST CLIENT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const contactMethods: ContactMethod[] = ['Phone', 'Text', 'Email', 'Telegram', 'Signal', 'WhatsApp', 'Other']
const screeningStatuses: ScreeningStatus[] = ['Pending', 'In Progress', 'Verified', 'Declined']
const riskLevels: RiskLevel[] = ['Unknown', 'Low Risk', 'Medium Risk', 'High Risk']

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
  const [showOptional, setShowOptional] = useState(false)

  async function save() {
    if (!alias.trim()) return
    const id = newId()
    await db.clients.add({
      id, alias: alias.trim(), realName: realName.trim() || undefined,
      phone: phone.trim() || undefined, email: email.trim() || undefined,
      preferredContact, screeningStatus, riskLevel, isBlocked: false,
      notes: notes.trim(), preferences: preferences.trim(), boundaries: boundaries.trim(),
      referenceSource: referenceSource.trim() || undefined,
      verificationNotes: verificationNotes.trim() || undefined,
      dateAdded: new Date(), tags: [] as ClientTag[], isPinned: false,
      requiresSafetyCheck: false,
      birthday: birthday ? new Date(birthday) : undefined,
    })
    setCreatedClientId(id)
    onNext()
  }

  return (
    <div>
      <GuidanceCard
        title="Add your first client"
        description="Only the alias is required — everything else can be added now or later. We'll explain what each field is for."
      />

      <SectionLabel label="Basic Info" />
      <TextInput label="Alias" value={alias} onChange={setAlias} placeholder="e.g. James W." required
        hint="A name or nickname you use to identify this client. This is the only required field." />
      <TextInput label="Real Name" value={realName} onChange={setRealName} placeholder="Optional"
        hint="Their legal name, if you've verified it. Only visible to you." />
      <TextInput label="Phone" value={phone} onChange={setPhone} placeholder="Optional"
        hint="Enables one-tap calling and texting from their profile." />
      <TextInput label="Email" value={email} onChange={setEmail} placeholder="Optional"
        hint="Enables one-tap email from their profile." />

      <SectionLabel label="Contact & Screening" />
      <SelectInput label="Preferred Contact" value={preferredContact} options={contactMethods} onChange={setPreferredContact}
        hint="How this client prefers to be reached. Shows on their profile for quick reference." />
      <SelectInput label="Screening Status" value={screeningStatus} options={screeningStatuses} onChange={setScreeningStatus}
        hint="Track where they are in your screening process. Pending → In Progress → Verified or Declined." />
      <SelectInput label="Risk Level" value={riskLevel} options={riskLevels} onChange={setRiskLevel}
        hint="Your assessment of this client. Auto-adjusts to High Risk after 2+ no-shows." />

      {/* Show optional fields */}
      <button
        onClick={() => setShowOptional(!showOptional)}
        className="flex items-center gap-2 mb-4 text-xs font-semibold active:opacity-70"
        style={{ color: '#a855f7' }}
      >
        {showOptional ? <ChevronLeft size={14} /> : <Plus size={14} />}
        {showOptional ? 'Hide' : 'Show'} additional fields
      </button>

      {showOptional && (
        <>
          <SectionLabel label="Preferences & Boundaries" optional />
          <TextAreaInput label="Preferences" value={preferences} onChange={setPreferences}
            placeholder="Things they like, special requests..."
            hint="Likes, requests, or things to remember. Shows on booking details for reference." />
          <TextAreaInput label="Boundaries" value={boundaries} onChange={setBoundaries}
            placeholder="Limits, things to avoid..."
            hint="Hard limits or things to avoid. Shows prominently on booking details." />

          <SectionLabel label="Details" optional />
          <TextAreaInput label="Notes" value={notes} onChange={setNotes}
            placeholder="Any other details..."
            hint="General notes visible on their profile." />
          <TextInput label="Referral Source" value={referenceSource} onChange={setReferenceSource}
            placeholder="e.g. Website, friend, Twitter"
            hint="How you found this client or how they found you." />
          <TextInput label="Verification Notes" value={verificationNotes} onChange={setVerificationNotes}
            placeholder="e.g. Verified via references"
            hint="Notes about their screening or verification process." />
          <div className="mb-3">
            <label className="text-xs font-semibold block mb-1" style={{ color: 'var(--text-primary)' }}>Birthday</label>
            <input
              type="date"
              value={birthday}
              onChange={e => setBirthday(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
              style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)', fontSize: '16px' }}
            />
            <FieldHint text="Get a reminder on the home page when their birthday is coming up." />
          </div>
        </>
      )}

      <button
        onClick={save}
        disabled={!alias.trim()}
        className="w-full py-3.5 rounded-xl font-bold text-sm text-white active:opacity-80"
        style={{ backgroundColor: alias.trim() ? '#a855f7' : '#555' }}
      >
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
  const [duration, setDuration] = useState(rates.length > 0 ? rates[0].duration : 60)
  const [locationType, setLocationType] = useState<LocationType>('Incall')
  const [locationAddress, setLocationAddress] = useState('')
  const [status, setStatus] = useState<BookingStatus>('Confirmed')
  const [baseRate, setBaseRate] = useState(rates.length > 0 ? rates[0].rate : 0)
  const [extras, setExtras] = useState(0)
  const [travelFee, setTravelFee] = useState(0)
  const [depositAmount, setDepositAmount] = useState(0)
  const [depositReceived, setDepositReceived] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | ''>('')
  const [notes, setNotes] = useState('')
  const [requiresSafetyCheck, setRequiresSafetyCheck] = useState(true)
  const [recurrence, setRecurrence] = useState<RecurrencePattern>('none')
  const [showOptional, setShowOptional] = useState(false)

  // Auto-fill from first rate on load
  useEffect(() => {
    if (rates.length > 0 && baseRate === 0) {
      setBaseRate(rates[0].rate)
      setDuration(rates[0].duration)
      setDepositAmount(Math.round(rates[0].rate * defaultDepositPct / 100))
    }
  }, [rates.length])

  function selectRate(dur: number, r: number) {
    setDuration(dur)
    setBaseRate(r)
    setDepositAmount(Math.round(r * defaultDepositPct / 100))
  }

  const total = baseRate + extras + travelFee

  async function save() {
    const dt = new Date(dateTime)
    await db.bookings.add({
      id: newId(), clientId: clientId || undefined, dateTime: dt,
      duration, locationType, locationAddress: locationAddress.trim() || undefined,
      status, baseRate, extras, travelFee,
      depositAmount, depositReceived, paymentMethod: paymentMethod || undefined,
      paymentReceived: false, notes: notes.trim(),
      createdAt: new Date(), requiresSafetyCheck,
      safetyCheckMinutesAfter: 30, recurrence,
    })
    onNext()
  }

  return (
    <div>
      <GuidanceCard
        title="Create your first booking"
        description="This is where the magic happens. We've pre-filled the client you just created and your first service rate. Adjust anything you like."
      />

      <SectionLabel label="Client & Time" />
      <div className="mb-3">
        <label className="text-xs font-semibold block mb-1" style={{ color: 'var(--text-primary)' }}>Client</label>
        <select
          value={clientId}
          onChange={e => setClientId(e.target.value)}
          className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
          style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)', fontSize: '16px' }}
        >
          <option value="">No client (anonymous)</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.alias}</option>)}
        </select>
        <FieldHint text="Link this booking to a client, or leave blank for an anonymous booking." />
      </div>

      <div className="mb-3">
        <label className="text-xs font-semibold block mb-1" style={{ color: 'var(--text-primary)' }}>Date & Time</label>
        <input
          type="datetime-local"
          value={dateTime}
          onChange={e => setDateTime(e.target.value)}
          className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
          style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)', fontSize: '16px' }}
        />
        <FieldHint text="When the booking starts." />
      </div>

      <SectionLabel label="Service & Duration" />
      {rates.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {rates.map(r => (
            <button
              key={r.id}
              type="button"
              onClick={() => selectRate(r.duration, r.rate)}
              className={`px-3 py-2 rounded-lg text-sm font-medium ${
                duration === r.duration && baseRate === r.rate ? 'bg-purple-500/20 text-purple-500' : ''
              }`}
              style={duration !== r.duration || baseRate !== r.rate
                ? { backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' } : {}
              }
            >
              <div className="font-bold">{bookingDurationFormatted(r.duration)}</div>
              <div className="text-xs opacity-70">${r.rate}</div>
            </button>
          ))}
        </div>
      )}
      <FieldHint text="Tap a service rate to auto-fill duration and price, or set them manually below." />

      <div className="flex gap-3 mt-2">
        <div className="flex-1">
          <NumberInput label="Base Rate ($)" value={baseRate} onChange={v => { setBaseRate(v); setDepositAmount(Math.round(v * defaultDepositPct / 100)) }}
            hint="The base price for this session." />
        </div>
        <div className="flex-1">
          <NumberInput label="Extras ($)" value={extras} onChange={setExtras}
            hint="Add-ons or special requests on top of the base rate." />
        </div>
      </div>

      <SectionLabel label="Location" />
      <SelectInput label="Type" value={locationType} options={locationTypes} onChange={setLocationType}
        hint="Incall = your place. Outcall = their place. Travel = out of town. Virtual = online." />
      {(locationType === 'Outcall' || locationType === 'Travel') && (
        <>
          <TextInput label="Address" value={locationAddress} onChange={setLocationAddress}
            placeholder="Hotel name, address, etc."
            hint="Where you're going. Only visible to you." />
          {locationType === 'Travel' && (
            <NumberInput label="Travel Fee ($)" value={travelFee} onChange={setTravelFee}
              hint="Extra charge for travel time and expenses." />
          )}
        </>
      )}

      <SectionLabel label="Status & Payment" />
      <SelectInput label="Booking Status" value={status} options={bookingStatuses} onChange={setStatus}
        hint="Where this booking is in the pipeline. Inquiry → Screening → Pending Deposit → Confirmed → In Progress → Completed." />
      <div className="flex gap-3">
        <div className="flex-1">
          <NumberInput label="Deposit ($)" value={depositAmount} onChange={setDepositAmount}
            hint={`Auto-calculated at ${defaultDepositPct}% of base rate. Adjust in Settings.`} />
        </div>
        <div className="flex-1">
          <SelectInput label="Payment Method" value={paymentMethod || '' as PaymentMethod} options={['', ...paymentMethods] as PaymentMethod[]} onChange={v => setPaymentMethod(v || '')}
            displayFn={v => v || 'Not set'}
            hint="How the client will pay." />
        </div>
      </div>
      <ToggleInput label="Deposit Received?" value={depositReceived} onChange={setDepositReceived}
        hint="Toggle on when the deposit has been collected." />

      {/* Optional fields */}
      <button
        onClick={() => setShowOptional(!showOptional)}
        className="flex items-center gap-2 mb-4 text-xs font-semibold active:opacity-70"
        style={{ color: '#a855f7' }}
      >
        {showOptional ? <ChevronLeft size={14} /> : <Plus size={14} />}
        {showOptional ? 'Hide' : 'Show'} additional options
      </button>

      {showOptional && (
        <>
          <TextAreaInput label="Notes" value={notes} onChange={setNotes}
            placeholder="Special instructions, room number..."
            hint="Private notes about this booking." />
          <ToggleInput label="Safety Check-In" value={requiresSafetyCheck} onChange={setRequiresSafetyCheck}
            hint="Get a reminder to check in with your safety contact after this booking." />
          <SelectInput label="Recurrence" value={recurrence} options={recurrenceOptions} onChange={setRecurrence}
            displayFn={v => v === 'none' ? 'One-time' : v.charAt(0).toUpperCase() + v.slice(1)}
            hint="Set up a repeating booking — weekly, biweekly, or monthly." />
        </>
      )}

      {total > 0 && (
        <div className="flex items-center justify-between mb-4 px-1">
          <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Total</span>
          <span className="text-lg font-bold text-green-500">${total}</span>
        </div>
      )}

      <button
        onClick={save}
        className="w-full py-3.5 rounded-xl font-bold text-sm text-white active:opacity-80"
        style={{ backgroundColor: '#a855f7' }}
      >
        Save Booking — Last Step
      </button>
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
    const record = {
      status,
      startTime: status === 'Available' ? startTime : undefined,
      endTime: status === 'Available' ? endTime : undefined,
    }
    if (existing) {
      await db.availability.update(existing.id, record)
    } else {
      await db.availability.add({ id: newId(), date: today, ...record })
    }
    setSaved(true)
  }

  return (
    <div>
      <GuidanceCard
        title="Set today's availability"
        description="This appears on the calendar and helps you track your schedule. You can set availability for any day by tapping it on the Schedule tab."
      />

      <SectionLabel label="Status" />
      <div className="grid grid-cols-2 gap-2 mb-4">
        {([
          { s: 'Available' as const, color: '#22c55e', desc: 'Open for bookings with set hours' },
          { s: 'Limited' as const, color: '#f97316', desc: 'Selective — only specific windows' },
          { s: 'Busy' as const, color: '#ef4444', desc: 'Fully booked or blocked' },
          { s: 'Off' as const, color: '#6b7280', desc: 'Not working today' },
        ]).map(item => (
          <button
            key={item.s}
            type="button"
            onClick={() => setStatus(item.s)}
            className="flex items-center gap-2.5 p-3 rounded-xl border active:scale-[0.97] transition-transform"
            style={{
              backgroundColor: status === item.s ? `${item.color}15` : 'var(--bg-secondary)',
              borderColor: status === item.s ? item.color : 'var(--border)',
              borderWidth: status === item.s ? '2px' : '1px',
            }}
          >
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
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1">
              <label className="text-[10px] uppercase block mb-1" style={{ color: 'var(--text-secondary)' }}>From</label>
              <input
                type="time"
                value={startTime}
                onChange={e => setStartTime(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg text-sm font-medium"
                style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)', fontSize: '16px' }}
              />
            </div>
            <span className="text-sm mt-4" style={{ color: 'var(--text-secondary)' }}>→</span>
            <div className="flex-1">
              <label className="text-[10px] uppercase block mb-1" style={{ color: 'var(--text-secondary)' }}>Until</label>
              <input
                type="time"
                value={endTime}
                onChange={e => setEndTime(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg text-sm font-medium"
                style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)', fontSize: '16px' }}
              />
            </div>
          </div>
          <FieldHint text="If you book outside these hours, you'll get a conflict warning. The day auto-adjusts to Limited with just that booking's slot open." />
        </>
      )}

      {!saved ? (
        <button
          onClick={save}
          className="w-full py-3.5 rounded-xl font-bold text-sm text-white active:opacity-80 mb-3"
          style={{ backgroundColor: '#a855f7' }}
        >
          Set Today's Availability
        </button>
      ) : (
        <div className="text-center mb-4">
          <div className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-green-500/15 text-green-500 font-bold text-sm mb-4">
            <Check size={18} /> Saved!
          </div>
        </div>
      )}

      <div
        className="rounded-xl p-4 mb-4"
        style={{ backgroundColor: 'var(--bg-secondary)' }}
      >
        <p className="text-xs font-bold mb-2" style={{ color: 'var(--text-primary)' }}>💡 Good to know</p>
        <ul className="text-xs space-y-1.5" style={{ color: 'var(--text-secondary)' }}>
          <li>• Colored dots appear on calendar days showing your status</li>
          <li>• Booking on an Off/Busy day shows a warning — you can override it</li>
          <li>• Overriding auto-sets the day to Limited with just that time slot open</li>
          <li>• Your today's status and hours show on the Home dashboard</li>
        </ul>
      </div>

      <button
        onClick={onComplete}
        className="w-full py-3.5 rounded-xl font-bold text-sm text-white active:opacity-80"
        style={{ backgroundColor: '#22c55e' }}
      >
        ✨ Finish Setup — Start Using Companion
      </button>
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
      // Switch to the right tab for visual context
      if (STEPS[stepIdx + 1].key === 'booking') onTabChange(2)
      if (STEPS[stepIdx + 1].key === 'availability') onTabChange(2)
      if (STEPS[stepIdx + 1].key === 'client') onTabChange(1)
      setStepIdx(stepIdx + 1)
    }
  }

  const step = STEPS[stepIdx]

  return (
    <div className="fixed inset-0 flex flex-col" style={{ backgroundColor: 'var(--bg-primary)', zIndex: 100 }}>
      {/* Header */}
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">{step.icon}</span>
            <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{step.title}</h2>
          </div>
          <button
            onClick={onComplete}
            className="text-xs px-3 py-1.5 rounded-full active:opacity-70"
            style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
          >
            Skip Setup
          </button>
        </div>

        {/* Step indicators */}
        <div className="flex gap-2">
          {STEPS.map((s, i) => (
            <div
              key={s.key}
              className="flex-1 h-1.5 rounded-full transition-all"
              style={{
                backgroundColor: i <= stepIdx ? s.color : 'var(--border)',
              }}
            />
          ))}
        </div>
        <p className="text-[10px] mt-1.5 text-center" style={{ color: 'var(--text-secondary)' }}>
          Step {stepIdx + 1} of {STEPS.length}
        </p>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 pb-8">
        {step.key === 'rates' && <RatesStep onNext={handleNext} />}
        {step.key === 'client' && <ClientStep onNext={handleNext} setCreatedClientId={setCreatedClientId} />}
        {step.key === 'booking' && <BookingStep onNext={handleNext} createdClientId={createdClientId} />}
        {step.key === 'availability' && <AvailabilityStep onComplete={onComplete} />}
      </div>
    </div>
  )
}
