import { useState, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Check, ChevronRight, User, UserPlus, Search, ChevronDown, ChevronUp } from 'lucide-react'
import { format } from 'date-fns'
import { db, createBooking, createClient } from '../../db'
import { Modal, FormSection, FormInput, FormSelect, FormToggle, FormCurrency, FormRow } from '../../components/Modal'
import { useLocalStorage } from '../../hooks/useSettings'
import type {
  Booking, BookingStatus, LocationType, PaymentMethod, ContactMethod, ScreeningStatus,
  RecurrencePattern
} from '../../types'

const bookingStatuses: BookingStatus[] = ['Inquiry', 'Screening', 'Pending Deposit', 'Confirmed', 'In Progress', 'Completed', 'Cancelled', 'No Show']
const locationTypes: LocationType[] = ['Incall', 'Outcall', 'Travel', 'Virtual']
const paymentMethods: PaymentMethod[] = ['Cash', 'e-Transfer', 'Crypto', 'Venmo', 'Cash App', 'Zelle', 'Gift Card', 'Other']
const recurrenceOptions: RecurrencePattern[] = ['none', 'weekly', 'biweekly', 'monthly']

interface BookingEditorProps {
  isOpen: boolean
  onClose: () => void
  booking?: Booking
  preselectedClientId?: string
  rebookFrom?: Booking
}

export function BookingEditor({ isOpen, onClose, booking, preselectedClientId, rebookFrom }: BookingEditorProps) {
  const isEditing = !!booking
  const clients = useLiveQuery(() => db.clients.filter(c => !c.isBlocked).sortBy('alias')) ?? []
  const serviceRates = useLiveQuery(() => db.serviceRates.filter(r => r.isActive).sortBy('sortOrder')) ?? []
  const [defaultDepositPct] = useLocalStorage('defaultDepositPercentage', 25)

  // Form state
  const [clientId, setClientId] = useState(booking?.clientId ?? rebookFrom?.clientId ?? preselectedClientId ?? '')
  const [dateTime, setDateTime] = useState(
    format(booking?.dateTime ? new Date(booking.dateTime) : new Date(), "yyyy-MM-dd'T'HH:mm")
  )
  const [duration, setDuration] = useState(booking?.duration ?? rebookFrom?.duration ?? 60)
  const [customDuration, setCustomDuration] = useState(false)
  const [locationType, setLocationType] = useState<LocationType>(booking?.locationType ?? rebookFrom?.locationType ?? 'Incall')
  const [locationAddress, setLocationAddress] = useState(booking?.locationAddress ?? rebookFrom?.locationAddress ?? '')
  const [locationNotes, setLocationNotes] = useState(booking?.locationNotes ?? rebookFrom?.locationNotes ?? '')
  const [status, setStatus] = useState<BookingStatus>(booking?.status ?? 'Inquiry')
  const [baseRate, setBaseRate] = useState(booking?.baseRate ?? rebookFrom?.baseRate ?? 0)
  const [extras, setExtras] = useState(booking?.extras ?? rebookFrom?.extras ?? 0)
  const [travelFee, setTravelFee] = useState(booking?.travelFee ?? rebookFrom?.travelFee ?? 0)
  const [depositAmount, setDepositAmount] = useState(booking?.depositAmount ?? rebookFrom?.depositAmount ?? 0)
  const [depositReceived, setDepositReceived] = useState(booking?.depositReceived ?? false)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | ''>(booking?.paymentMethod ?? rebookFrom?.paymentMethod ?? '')
  const [notes, setNotes] = useState(booking?.notes ?? '')
  const [requiresSafetyCheck, setRequiresSafetyCheck] = useState(booking?.requiresSafetyCheck ?? true)
  const [recurrence, setRecurrence] = useState<RecurrencePattern>(booking?.recurrence ?? 'none')

  const [showClientPicker, setShowClientPicker] = useState(false)
  const [clientSearch, setClientSearch] = useState('')
  const [userEditedDeposit, setUserEditedDeposit] = useState(isEditing || !!rebookFrom)

  // Inline new client state
  const [showNewClient, setShowNewClient] = useState(false)
  const [newClientAlias, setNewClientAlias] = useState('')
  const [newClientPhone, setNewClientPhone] = useState('')
  const [newClientContact, setNewClientContact] = useState<ContactMethod>('Text')
  const [newClientScreening, setNewClientScreening] = useState<ScreeningStatus>('Pending')
  const [showNewClientDetails, setShowNewClientDetails] = useState(false)
  const [newClientPreferences, setNewClientPreferences] = useState('')
  const [newClientBoundaries, setNewClientBoundaries] = useState('')
  const [newClientNotes, setNewClientNotes] = useState('')

  const selectedClient = clients.find(c => c.id === clientId)
  const total = baseRate + extras + travelFee
  const isValid = clientId && baseRate > 0

  // Filter client list
  const filteredClients = clients.filter(c =>
    !clientSearch || c.alias.toLowerCase().includes(clientSearch.toLowerCase())
  )

  // Auto-set safety check based on client risk
  useEffect(() => {
    if (selectedClient && !isEditing) {
      // High Risk or Unknown = forced on, Low/Medium = off by default
      const forceOn = selectedClient.riskLevel === 'High Risk' || selectedClient.riskLevel === 'Unknown'
      setRequiresSafetyCheck(forceOn)
    }
  }, [clientId, selectedClient])

  // Auto-calculate deposit when rate changes
  useEffect(() => {
    if (!isEditing && !userEditedDeposit && baseRate > 0) {
      setDepositAmount(Math.round(baseRate * defaultDepositPct / 100))
    }
  }, [baseRate, defaultDepositPct, isEditing, userEditedDeposit])

  async function createNewClientInline() {
    if (!newClientAlias.trim()) return
    const newClient = createClient({
      alias: newClientAlias.trim(),
      phone: newClientPhone.trim() || undefined,
      preferredContact: newClientContact,
      screeningStatus: newClientScreening,
      preferences: newClientPreferences.trim(),
      boundaries: newClientBoundaries.trim(),
      notes: newClientNotes.trim(),
    })
    await db.clients.add(newClient)
    setClientId(newClient.id)
    setShowNewClient(false)
    setShowClientPicker(false)
    // Reset inline form
    setNewClientAlias('')
    setNewClientPhone('')
    setNewClientPreferences('')
    setNewClientBoundaries('')
    setNewClientNotes('')
    setShowNewClientDetails(false)
  }

  function selectServiceRate(rateDuration: number, rate: number) {
    setDuration(rateDuration)
    setBaseRate(rate)
    setCustomDuration(false)
  }

  async function handleSave() {
    if (!isValid) return
    const dt = new Date(dateTime)
    const finalTravelFee = (locationType === 'Outcall' || locationType === 'Travel') ? travelFee : 0

    if (isEditing && booking) {
      await db.bookings.update(booking.id, {
        clientId,
        dateTime: dt,
        duration,
        locationType,
        locationAddress: locationAddress.trim() || undefined,
        locationNotes: locationNotes.trim() || undefined,
        status,
        baseRate,
        extras,
        travelFee: finalTravelFee,
        depositAmount,
        depositReceived,
        paymentMethod: paymentMethod || undefined,
        notes: notes.trim(),
        requiresSafetyCheck,
        recurrence,
      })
    } else {
      const newBooking = createBooking({
        clientId,
        dateTime: dt,
        duration,
        locationType,
        locationAddress: locationAddress.trim() || undefined,
        locationNotes: locationNotes.trim() || undefined,
        status,
        baseRate,
        extras,
        travelFee: finalTravelFee,
        depositAmount,
        depositReceived,
        paymentMethod: paymentMethod || undefined,
        notes: notes.trim(),
        requiresSafetyCheck,
        recurrence,
      })
      await db.bookings.add(newBooking)
    }

    onClose()
  }

  const durationFormatted = (mins: number) => {
    const h = Math.floor(mins / 60)
    const m = mins % 60
    if (h > 0 && m > 0) return `${h}h ${m}m`
    if (h > 0) return `${h}h`
    return `${m}m`
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Edit Booking' : 'New Booking'}
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
        {/* Client */}
        <FormSection title="Client">
          <FormRow onClick={() => setShowClientPicker(!showClientPicker)}>
            {selectedClient ? (
              <div className="flex items-center gap-2 w-full">
                <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                  style={{ backgroundColor: 'rgba(168,85,247,0.15)' }}>
                  <span className="text-xs font-bold text-purple-500">
                    {selectedClient.alias.charAt(0).toUpperCase()}
                  </span>
                </div>
                <span className="text-sm font-medium flex-1" style={{ color: 'var(--text-primary)' }}>
                  {selectedClient.alias}
                </span>
                <ChevronRight size={16} style={{ color: 'var(--text-secondary)' }} />
              </div>
            ) : (
              <div className="flex items-center gap-2 w-full">
                <User size={16} style={{ color: 'var(--text-secondary)' }} />
                <span className="text-sm flex-1" style={{ color: 'var(--text-secondary)' }}>
                  Select Client
                </span>
                <ChevronRight size={16} style={{ color: 'var(--text-secondary)' }} />
              </div>
            )}
          </FormRow>

          {/* Inline client picker */}
          {showClientPicker && (
            <div>
              {/* Search bar */}
              <div className="flex items-center gap-2 px-4 py-2" style={{ borderTop: '1px solid var(--border)' }}>
                <Search size={14} style={{ color: 'var(--text-secondary)' }} />
                <input
                  type="text"
                  placeholder="Search or type new name..."
                  value={clientSearch}
                  onChange={e => setClientSearch(e.target.value)}
                  className="flex-1 bg-transparent text-sm outline-none"
                  style={{ color: 'var(--text-primary)' }}
                />
              </div>

              {/* Client list */}
              <div className="max-h-40 overflow-y-auto">
                {filteredClients.map(c => (
                  <button
                    key={c.id}
                    onClick={() => { setClientId(c.id); setShowClientPicker(false); setClientSearch('') }}
                    className="flex items-center gap-2 px-4 py-2.5 w-full text-left active:bg-white/5"
                    style={{ borderTop: '1px solid var(--border)' }}
                  >
                    <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                      style={{ backgroundColor: 'rgba(168,85,247,0.15)' }}>
                      <span className="text-[10px] font-bold text-purple-500">
                        {c.alias.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <span className="text-sm flex-1" style={{ color: 'var(--text-primary)' }}>
                      {c.alias}
                    </span>
                    {c.riskLevel === 'High Risk' && <span className="text-xs">⚠️</span>}
                    {c.id === clientId && <Check size={14} className="text-purple-500" />}
                  </button>
                ))}
              </div>

              {/* New Client button */}
              <button
                onClick={() => {
                  setShowNewClient(true)
                  // Pre-fill alias from search text
                  if (clientSearch.trim() && !filteredClients.length) {
                    setNewClientAlias(clientSearch.trim())
                  }
                }}
                className="flex items-center gap-2 px-4 py-3 w-full text-left text-purple-500 font-medium text-sm"
                style={{ borderTop: '1px solid var(--border)' }}
              >
                <UserPlus size={16} /> New Client{clientSearch.trim() && !filteredClients.length ? `: "${clientSearch.trim()}"` : ''}
              </button>

              {/* Inline new client form */}
              {showNewClient && (
                <div className="px-4 py-3 space-y-3" style={{ borderTop: '1px solid var(--border)', backgroundColor: 'rgba(168,85,247,0.03)' }}>
                  <p className="text-xs font-semibold uppercase" style={{ color: 'var(--text-secondary)' }}>Quick Add Client</p>
                  <input
                    type="text"
                    placeholder="Alias / Display Name *"
                    value={newClientAlias}
                    onChange={e => setNewClientAlias(e.target.value)}
                    className="w-full text-sm bg-transparent outline-none pb-1"
                    style={{ color: 'var(--text-primary)', borderBottom: '1px solid var(--border)' }}
                    autoFocus
                  />
                  <input
                    type="tel"
                    placeholder="Phone number"
                    value={newClientPhone}
                    onChange={e => setNewClientPhone(e.target.value)}
                    className="w-full text-sm bg-transparent outline-none pb-1"
                    style={{ color: 'var(--text-primary)', borderBottom: '1px solid var(--border)' }}
                  />
                  <div className="flex items-center gap-3">
                    <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Contact:</span>
                    <select
                      value={newClientContact}
                      onChange={e => setNewClientContact(e.target.value as ContactMethod)}
                      className="text-sm bg-transparent outline-none appearance-none"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {(['Phone', 'Text', 'Email', 'Telegram', 'Signal', 'WhatsApp'] as ContactMethod[]).map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                    <span className="text-xs ml-auto" style={{ color: 'var(--text-secondary)' }}>Screening:</span>
                    <select
                      value={newClientScreening}
                      onChange={e => setNewClientScreening(e.target.value as ScreeningStatus)}
                      className="text-sm bg-transparent outline-none appearance-none"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {(['Pending', 'In Progress', 'Verified', 'Declined'] as ScreeningStatus[]).map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>

                  {/* Expandable details */}
                  <button
                    onClick={() => setShowNewClientDetails(!showNewClientDetails)}
                    className="flex items-center gap-1 text-xs text-purple-500 font-medium"
                  >
                    {showNewClientDetails ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    {showNewClientDetails ? 'Hide Details' : 'All Details'}
                  </button>

                  {showNewClientDetails && (
                    <div className="space-y-2">
                      <textarea
                        placeholder="Preferences (likes, requests...)"
                        value={newClientPreferences}
                        onChange={e => setNewClientPreferences(e.target.value)}
                        rows={2}
                        className="w-full text-sm bg-transparent outline-none resize-none pb-1"
                        style={{ color: 'var(--text-primary)', borderBottom: '1px solid var(--border)' }}
                      />
                      <textarea
                        placeholder="Boundaries (hard limits...)"
                        value={newClientBoundaries}
                        onChange={e => setNewClientBoundaries(e.target.value)}
                        rows={2}
                        className="w-full text-sm bg-transparent outline-none resize-none pb-1"
                        style={{ color: 'var(--text-primary)', borderBottom: '1px solid var(--border)' }}
                      />
                      <textarea
                        placeholder="Notes"
                        value={newClientNotes}
                        onChange={e => setNewClientNotes(e.target.value)}
                        rows={2}
                        className="w-full text-sm bg-transparent outline-none resize-none pb-1"
                        style={{ color: 'var(--text-primary)', borderBottom: '1px solid var(--border)' }}
                      />
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button
                      onClick={() => { setShowNewClient(false); setNewClientAlias(''); setNewClientPhone('') }}
                      className="flex-1 py-2 rounded-lg text-sm"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={createNewClientInline}
                      disabled={!newClientAlias.trim()}
                      className={`flex-1 py-2 rounded-lg text-sm font-semibold ${
                        newClientAlias.trim() ? 'bg-purple-600 text-white' : 'opacity-40 bg-purple-600 text-white'
                      }`}
                    >
                      Create & Select
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </FormSection>

        {/* Date & Time */}
        <FormSection title="Date & Time">
          <div className="px-4 py-3">
            <input
              type="datetime-local"
              value={dateTime}
              onChange={e => setDateTime(e.target.value)}
              className="w-full text-sm bg-transparent outline-none"
              style={{ color: 'var(--text-primary)', colorScheme: 'dark' }}
            />
          </div>
        </FormSection>

        {/* Duration */}
        <FormSection title="Duration">
          {serviceRates.length > 0 && (
            <div className="px-4 py-3">
              <div className="flex flex-wrap gap-2">
                {serviceRates.map(rate => (
                  <button
                    key={rate.id}
                    onClick={() => selectServiceRate(rate.duration, rate.rate)}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      duration === rate.duration && !customDuration
                        ? 'bg-purple-500/20 text-purple-500'
                        : ''
                    }`}
                    style={
                      duration !== rate.duration || customDuration
                        ? { backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }
                        : {}
                    }
                  >
                    <div className="font-bold">{durationFormatted(rate.duration)}</div>
                    <div className="text-xs opacity-70">${rate.rate}</div>
                  </button>
                ))}
                <button
                  onClick={() => setCustomDuration(true)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium ${
                    customDuration ? 'bg-purple-500/20 text-purple-500' : ''
                  }`}
                  style={!customDuration ? { backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' } : {}}
                >
                  Custom
                </button>
              </div>
            </div>
          )}
          {(customDuration || serviceRates.length === 0) && (
            <div className="flex items-center gap-3 px-4 py-3">
              <span className="text-sm" style={{ color: 'var(--text-primary)' }}>Minutes</span>
              <input
                type="number"
                inputMode="numeric"
                value={duration}
                onChange={e => setDuration(parseInt(e.target.value) || 0)}
                className="flex-1 text-sm text-right bg-transparent outline-none"
                style={{ color: 'var(--text-primary)' }}
              />
            </div>
          )}
        </FormSection>

        {/* Location */}
        <FormSection title="Location">
          <FormSelect label="Type" value={locationType} options={locationTypes} onChange={setLocationType} />
          {(locationType === 'Outcall' || locationType === 'Travel') && (
            <FormInput label="Address" value={locationAddress} onChange={setLocationAddress} placeholder="Address" />
          )}
          <FormInput label="Notes" value={locationNotes} onChange={setLocationNotes} placeholder="Location notes" />
        </FormSection>

        {/* Pricing */}
        <FormSection title="Pricing">
          <FormCurrency label="Base Rate" value={baseRate} onChange={setBaseRate} />
          <FormCurrency label="Extras" value={extras} onChange={setExtras} />
          {(locationType === 'Outcall' || locationType === 'Travel') && (
            <FormCurrency label="Travel Fee" value={travelFee} onChange={setTravelFee} />
          )}
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Total</span>
            <span className="text-sm font-bold text-green-500">${total}</span>
          </div>
        </FormSection>

        {/* Deposit */}
        <FormSection title="Deposit">
          <FormCurrency
            label="Amount"
            value={depositAmount}
            onChange={v => { setDepositAmount(v); setUserEditedDeposit(true) }}
          />
          {depositAmount > 0 && (
            <FormToggle label="Deposit Received" value={depositReceived} onChange={setDepositReceived} />
          )}
        </FormSection>

        {/* Status */}
        <FormSection title="Status">
          <FormSelect label="Status" value={status} options={bookingStatuses} onChange={setStatus} />
          <FormSelect
            label="Payment"
            value={paymentMethod || 'Cash'}
            options={paymentMethods}
            onChange={v => setPaymentMethod(v)}
          />
        </FormSection>

        {/* Safety */}
        <FormSection title="Safety" footer={
          selectedClient && (selectedClient.riskLevel === 'High Risk' || selectedClient.riskLevel === 'Unknown')
            ? 'Required for unknown or high-risk clients'
            : undefined
        }>
          <FormToggle
            label="Safety Check-In"
            value={requiresSafetyCheck}
            onChange={v => {
              // Don't allow disabling for high risk / unknown clients
              if (!v && selectedClient) {
                const forceOn = selectedClient.riskLevel === 'High Risk'
                  || selectedClient.riskLevel === 'Unknown'
                if (forceOn) return
              }
              setRequiresSafetyCheck(v)
            }}
          />
        </FormSection>

        {/* Recurrence */}
        <FormSection title="Repeat" footer={recurrence !== 'none' ? 'A new booking will auto-create when this one completes' : undefined}>
          <FormSelect
            label="Recurrence"
            value={recurrence}
            options={recurrenceOptions}
            onChange={v => setRecurrence(v as RecurrencePattern)}
            displayFn={(v: string) => v === 'none' ? 'None' : v === 'weekly' ? 'Weekly' : v === 'biweekly' ? 'Every 2 Weeks' : 'Monthly'}
          />
        </FormSection>

        {/* Notes */}
        <FormSection title="Notes">
          <FormInput label="Notes" value={notes} onChange={setNotes} placeholder="Booking notes..." multiline />
        </FormSection>

        {/* Save Button */}
        <div className="px-4 py-4">
          <button
            onClick={handleSave}
            disabled={!isValid}
            className={`w-full py-3 rounded-xl font-semibold text-sm transition-colors ${
              isValid
                ? 'bg-purple-600 text-white active:bg-purple-700'
                : 'opacity-40 bg-purple-600 text-white'
            }`}
          >
            {isEditing ? 'Save Changes' : 'Create Booking'}
          </button>
        </div>

        <div className="h-8" />
      </div>
    </Modal>
  )
}
