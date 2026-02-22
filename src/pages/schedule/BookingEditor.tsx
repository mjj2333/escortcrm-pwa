import { useState, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Check, ChevronRight, User, UserPlus, Search, AlertTriangle, Plus, ChevronLeft } from 'lucide-react'
import { format } from 'date-fns'
import { db, createBooking, createClient, formatCurrency, recordBookingPayment, completeBookingPayment } from '../../db'
import { Modal } from '../../components/Modal'
import { showToast } from '../../components/Toast'
import { SectionLabel, FieldTextInput, FieldTextArea, FieldSelect, FieldToggle, FieldCurrency, FieldDateTime, fieldInputStyle } from '../../components/FormFields'
import { VerifiedBadge } from '../../components/VerifiedBadge'
import { useLocalStorage } from '../../hooks/useSettings'
import { checkBookingConflict, adjustAvailabilityForBooking } from '../../utils/availability'
import type {
  Booking, BookingStatus, LocationType, PaymentMethod, ContactMethod, ScreeningStatus, ScreeningMethod,
  RecurrencePattern
} from '../../types'

const bookingStatuses: BookingStatus[] = ['To Be Confirmed', 'Pending Deposit', 'Confirmed', 'Completed', 'Cancelled', 'No Show']
const locationTypes: LocationType[] = ['Incall', 'Outcall', 'Travel', 'Virtual']
const paymentMethods: PaymentMethod[] = ['Cash', 'e-Transfer', 'Crypto', 'Venmo', 'Cash App', 'Zelle', 'Gift Card', 'Other']
const recurrenceOptions: RecurrencePattern[] = ['none', 'weekly', 'biweekly', 'monthly']
const contactMethods: ContactMethod[] = ['Phone', 'Text', 'Email', 'Telegram', 'Signal', 'WhatsApp', 'Other']
const screeningMethods: ScreeningMethod[] = ['ID', 'LinkedIn', 'Provider Reference', 'Employment', 'Phone', 'Deposit', 'Other']

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
  const [defaultDepositType] = useLocalStorage<'percent' | 'flat'>('defaultDepositType', 'percent')
  const [defaultDepositFlat] = useLocalStorage('defaultDepositFlat', 0)

  // Core fields
  const [clientId, setClientId] = useState(booking?.clientId ?? preselectedClientId ?? rebookFrom?.clientId ?? '')
  const [dateTime, setDateTime] = useState(booking?.dateTime ? format(new Date(booking.dateTime), "yyyy-MM-dd'T'HH:mm") : format(new Date(), "yyyy-MM-dd'T'HH:mm"))
  const [duration, setDuration] = useState(booking?.duration ?? rebookFrom?.duration ?? 60)
  const [customDuration, setCustomDuration] = useState(false)
  const [locationType, setLocationType] = useState<LocationType>(booking?.locationType ?? rebookFrom?.locationType ?? 'Incall')
  const [locationAddress, setLocationAddress] = useState(booking?.locationAddress ?? rebookFrom?.locationAddress ?? '')
  const [locationNotes, setLocationNotes] = useState(booking?.locationNotes ?? rebookFrom?.locationNotes ?? '')
  const [status, setStatus] = useState<BookingStatus>(booking?.status ?? 'To Be Confirmed')
  const [baseRate, setBaseRate] = useState(booking?.baseRate ?? rebookFrom?.baseRate ?? 0)
  const [extras, setExtras] = useState(booking?.extras ?? rebookFrom?.extras ?? 0)
  const [travelFee, setTravelFee] = useState(booking?.travelFee ?? rebookFrom?.travelFee ?? 0)
  const [depositAmount, setDepositAmount] = useState(booking?.depositAmount ?? rebookFrom?.depositAmount ?? 0)
  const [depositReceived, setDepositReceived] = useState(booking?.depositReceived ?? false)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | ''>(booking?.paymentMethod ?? rebookFrom?.paymentMethod ?? '')
  const [notes, setNotes] = useState(booking?.notes ?? '')
  const [requiresSafetyCheck, setRequiresSafetyCheck] = useState(booking?.requiresSafetyCheck ?? rebookFrom?.requiresSafetyCheck ?? true)
  const [recurrence, setRecurrence] = useState<RecurrencePattern>(booking?.recurrence ?? rebookFrom?.recurrence ?? 'none')

  // UI state
  const [showClientPicker, setShowClientPicker] = useState(false)
  const [clientSearch, setClientSearch] = useState('')
  const [userEditedDeposit, setUserEditedDeposit] = useState(isEditing || !!rebookFrom)
  const [showOptional, setShowOptional] = useState(false)

  // Inline new client state
  const [showNewClient, setShowNewClient] = useState(false)
  const [newClientAlias, setNewClientAlias] = useState('')
  const [newClientPrimary, setNewClientPrimary] = useState<ContactMethod>('Text')
  const [newClientSecondary, setNewClientSecondary] = useState<ContactMethod | ''>('')
  const [newClientPhone, setNewClientPhone] = useState('')
  const [newClientEmail, setNewClientEmail] = useState('')
  const [newClientTelegram, setNewClientTelegram] = useState('')
  const [newClientSignal, setNewClientSignal] = useState('')
  const [newClientWhatsapp, setNewClientWhatsapp] = useState('')
  const [newClientScreening, setNewClientScreening] = useState<ScreeningStatus>('Unscreened')
  const [newClientScreeningMethod, setNewClientScreeningMethod] = useState<ScreeningMethod | ''>('')
  const [newClientPreferences, setNewClientPreferences] = useState('')
  const [newClientBoundaries, setNewClientBoundaries] = useState('')
  const [newClientNotes, setNewClientNotes] = useState('')

  // Availability conflict
  const [conflictWarning, setConflictWarning] = useState<{ reason: string; dayStatus: string; isDoubleBook: boolean } | null>(null)

  // Reset form state when modal opens (matches ClientEditor, TransactionEditor, etc.)
  useEffect(() => {
    if (isOpen) {
      setClientId(booking?.clientId ?? preselectedClientId ?? rebookFrom?.clientId ?? '')
      setDateTime(booking?.dateTime ? format(new Date(booking.dateTime), "yyyy-MM-dd'T'HH:mm") : format(new Date(), "yyyy-MM-dd'T'HH:mm"))
      setDuration(booking?.duration ?? rebookFrom?.duration ?? 60)
      setCustomDuration(false)
      setLocationType(booking?.locationType ?? rebookFrom?.locationType ?? 'Incall')
      setLocationAddress(booking?.locationAddress ?? rebookFrom?.locationAddress ?? '')
      setLocationNotes(booking?.locationNotes ?? rebookFrom?.locationNotes ?? '')
      setStatus(booking?.status ?? 'To Be Confirmed')
      setBaseRate(booking?.baseRate ?? rebookFrom?.baseRate ?? 0)
      setExtras(booking?.extras ?? rebookFrom?.extras ?? 0)
      setTravelFee(booking?.travelFee ?? rebookFrom?.travelFee ?? 0)
      setDepositAmount(booking?.depositAmount ?? rebookFrom?.depositAmount ?? 0)
      setDepositReceived(booking?.depositReceived ?? false)
      setPaymentMethod(booking?.paymentMethod ?? rebookFrom?.paymentMethod ?? '')
      setNotes(booking?.notes ?? '')
      setRequiresSafetyCheck(booking?.requiresSafetyCheck ?? rebookFrom?.requiresSafetyCheck ?? true)
      setRecurrence(booking?.recurrence ?? rebookFrom?.recurrence ?? 'none')
      setShowClientPicker(false)
      setClientSearch('')
      setUserEditedDeposit(!!booking || !!rebookFrom)
      setShowOptional(false)
      setShowNewClient(false)
      setNewClientAlias('')
      setNewClientPhone('')
      setNewClientContact('Text')
      setNewClientScreening('Unscreened')
      setShowNewClientDetails(false)
      setNewClientPreferences('')
      setNewClientBoundaries('')
      setNewClientNotes('')
      setConflictWarning(null)
    }
  }, [isOpen, booking, rebookFrom, preselectedClientId])

  const selectedClient = clients.find(c => c.id === clientId)
  const total = baseRate + extras + ((locationType === 'Outcall' || locationType === 'Travel') ? travelFee : 0)
  const clientIsScreened = selectedClient?.screeningStatus === 'Screened'
  const isValid = clientId && baseRate > 0 && (isEditing || clientIsScreened)

  // Filter client list
  const filteredClients = clients.filter(c =>
    !clientSearch || c.alias.toLowerCase().includes(clientSearch.toLowerCase())
  )

  // Auto-set safety check based on client risk
  useEffect(() => {
    if (selectedClient && !isEditing) {
      const forceOn = selectedClient.riskLevel === 'High Risk' || selectedClient.riskLevel === 'Unknown'
      setRequiresSafetyCheck(forceOn)
    }
  }, [clientId, selectedClient])

  // Auto-calculate deposit when rate changes
  useEffect(() => {
    if (!isEditing && !userEditedDeposit) {
      if (defaultDepositType === 'flat') {
        setDepositAmount(defaultDepositFlat)
      } else if (baseRate > 0) {
        setDepositAmount(Math.round(baseRate * defaultDepositPct / 100))
      }
    }
  }, [baseRate, defaultDepositPct, defaultDepositType, defaultDepositFlat, isEditing, userEditedDeposit])

  async function createNewClientInline() {
    if (!newClientAlias.trim()) return
    const newClient = createClient({
      alias: newClientAlias.trim(),
      phone: newClientPhone.trim() || undefined,
      email: newClientEmail.trim() || undefined,
      telegram: newClientTelegram.trim() || undefined,
      signal: newClientSignal.trim() || undefined,
      whatsapp: newClientWhatsapp.trim() || undefined,
      preferredContact: newClientPrimary,
      secondaryContact: newClientSecondary || undefined,
      screeningStatus: newClientScreening,
      screeningMethod: newClientScreeningMethod || undefined,
      preferences: newClientPreferences.trim(),
      boundaries: newClientBoundaries.trim(),
      notes: newClientNotes.trim(),
    })
    await db.clients.add(newClient)
    setClientId(newClient.id)
    setShowNewClient(false)
    setShowClientPicker(false)
    setNewClientAlias('')
    setNewClientPhone('')
    setNewClientEmail('')
    setNewClientTelegram('')
    setNewClientSignal('')
    setNewClientWhatsapp('')
    setNewClientPrimary('Text')
    setNewClientSecondary('')
    setNewClientScreeningMethod('')
    setNewClientPreferences('')
    setNewClientBoundaries('')
    setNewClientNotes('')
  }

  function selectServiceRate(rateDuration: number, rate: number) {
    setDuration(rateDuration)
    setBaseRate(rate)
    setCustomDuration(false)
  }

  async function handleSave() {
    if (!isValid) return
    const dt = new Date(dateTime)

    const conflict = await checkBookingConflict(dt, duration, booking?.id)
    if (conflict.hasConflict) {
      setConflictWarning({
        reason: conflict.reason,
        dayStatus: conflict.dayStatus ?? '',
        isDoubleBook: conflict.isDoubleBook ?? false,
      })
      return
    }

    await saveBooking()
  }

  async function saveBooking(overrideAvailability = false) {
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
        paymentMethod: paymentMethod || undefined,
        notes: notes.trim(),
        requiresSafetyCheck,
        recurrence,
        // Set timestamps when status changes
        ...(status === 'Confirmed' && booking.status !== 'Confirmed' && !booking.confirmedAt ? { confirmedAt: new Date() } : {}),
        ...(status === 'Completed' && booking.status !== 'Completed' ? { completedAt: new Date() } : {}),
        ...(status === 'Cancelled' && booking.status !== 'Cancelled' ? { cancelledAt: new Date() } : {}),
        ...(status === 'No Show' && booking.status !== 'No Show' ? { cancelledAt: new Date() } : {}),
      })

      // Side effects when status changes via editor
      if (status !== booking.status) {
        if (status === 'Completed') {
          const updatedBooking = await db.bookings.get(booking.id)
          if (updatedBooking) {
            await completeBookingPayment(updatedBooking, selectedClient?.alias)
          }
          if (clientId) {
            await db.clients.update(clientId, { lastSeen: new Date() })
          }
        }
        // Escalate client risk level on No Show (matches BookingDetail & SwipeableBookingRow logic)
        if (status === 'No Show' && clientId) {
          const clientBookings = await db.bookings.where('clientId').equals(clientId).toArray()
          const noShows = clientBookings.filter(b => b.status === 'No Show').length
          const currentClient = await db.clients.get(clientId)
          if (currentClient) {
            let riskLevel = currentClient.riskLevel
            if (noShows >= 2) riskLevel = 'High Risk'
            else if (noShows >= 1 && (riskLevel === 'Unknown' || riskLevel === 'Low Risk')) riskLevel = 'Medium Risk'
            await db.clients.update(clientId, { riskLevel })
          }
        }
      }

      if (overrideAvailability) {
        await adjustAvailabilityForBooking(dt, duration, booking.id)
      }
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
        paymentMethod: paymentMethod || undefined,
        notes: notes.trim(),
        requiresSafetyCheck,
        recurrence,
        // Set timestamps when creating with an advanced status
        ...(status === 'Confirmed' || status === 'In Progress' || status === 'Completed' ? { confirmedAt: new Date() } : {}),
        ...(status === 'Completed' ? { completedAt: new Date() } : {}),
      })
      await db.bookings.add(newBooking)

      // If deposit marked as received at creation, record it through the payment ledger
      if (depositReceived && depositAmount > 0) {
        await recordBookingPayment({
          bookingId: newBooking.id,
          amount: depositAmount,
          method: paymentMethod || undefined,
          label: 'Deposit',
          clientAlias: selectedClient?.alias,
        })
      }

      // Side effects when creating with an advanced status
      if (status === 'Completed') {
        const updatedBooking = await db.bookings.get(newBooking.id)
        if (updatedBooking) {
          await completeBookingPayment(updatedBooking, selectedClient?.alias)
        }
        if (clientId) {
          await db.clients.update(clientId, { lastSeen: new Date() })
        }
      }

      if (overrideAvailability) {
        await adjustAvailabilityForBooking(dt, duration, newBooking.id)
      }
    }

    setConflictWarning(null)
    showToast(isEditing ? 'Booking updated' : 'Booking created')
    onClose()
  }


  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Edit Booking' : 'New Booking'}
      actions={
        <button onClick={handleSave} disabled={!isValid}
          className={`p-1 ${isValid ? 'text-purple-500' : 'opacity-30'}`}>
          <Check size={20} />
        </button>
      }
    >
      <div className="px-4 py-2" style={{ backgroundColor: 'var(--bg-secondary)' }}>
        {/* ━━━ Client ━━━ */}
        <SectionLabel label="Client" />
        <div className="mb-3">
          <button
            type="button"
            onClick={() => setShowClientPicker(!showClientPicker)}
            className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-left"
            style={fieldInputStyle}
          >
            {selectedClient ? (
              <>
                <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                  style={{ backgroundColor: 'rgba(168,85,247,0.15)' }}>
                  <span className="text-[10px] font-bold text-purple-500">
                    {selectedClient.alias.charAt(0).toUpperCase()}
                  </span>
                </div>
                <span className="text-sm font-medium flex-1" style={{ color: 'var(--text-primary)' }}>
                  {selectedClient.alias}<VerifiedBadge client={selectedClient} size={13} />
                </span>
                <ChevronRight size={16} style={{ color: 'var(--text-secondary)' }} />
              </>
            ) : (
              <>
                <User size={16} style={{ color: 'var(--text-secondary)' }} />
                <span className="text-sm flex-1" style={{ color: 'var(--text-secondary)' }}>
                  Select Client
                </span>
                <ChevronRight size={16} style={{ color: 'var(--text-secondary)' }} />
              </>
            )}
          </button>

          {/* Inline client picker */}
          {showClientPicker && (
            <div className="mt-1 rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)', backgroundColor: 'var(--bg-primary)' }}>
              {/* Search bar */}
              <div className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: '1px solid var(--border)' }}>
                <Search size={14} style={{ color: 'var(--text-secondary)' }} />
                <input type="text" placeholder="Search or type new name..."
                  value={clientSearch} onChange={e => setClientSearch(e.target.value)}
                  className="flex-1 bg-transparent text-sm outline-none"
                  style={{ color: 'var(--text-primary)', fontSize: '16px' }} />
              </div>

              {/* Client list */}
              <div className="max-h-40 overflow-y-auto">
                {filteredClients.map(c => (
                  <button key={c.id}
                    onClick={() => { setClientId(c.id); setShowClientPicker(false); setClientSearch('') }}
                    className="flex items-center gap-2 px-3 py-2.5 w-full text-left active:bg-white/5"
                    style={{ borderTop: '1px solid var(--border)' }}>
                    <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                      style={{ backgroundColor: 'rgba(168,85,247,0.15)' }}>
                      <span className="text-[10px] font-bold text-purple-500">{c.alias.charAt(0).toUpperCase()}</span>
                    </div>
                    <span className="text-sm flex-1" style={{ color: 'var(--text-primary)' }}>
                      {c.alias}<VerifiedBadge client={c} size={12} />
                    </span>
                    {c.screeningStatus !== 'Screened' && (
                      <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full"
                        style={{ backgroundColor: 'rgba(249,115,22,0.15)', color: '#f59e0b' }}>
                        {c.screeningStatus}
                      </span>
                    )}
                    {c.riskLevel === 'High Risk' && <span className="text-xs">⚠️</span>}
                    {c.id === clientId && <Check size={14} className="text-purple-500" />}
                  </button>
                ))}
              </div>

              {/* New Client button */}
              <button
                onClick={() => {
                  setShowNewClient(true)
                  if (clientSearch.trim() && !filteredClients.length) setNewClientAlias(clientSearch.trim())
                }}
                className="flex items-center gap-2 px-3 py-3 w-full text-left text-purple-500 font-medium text-sm"
                style={{ borderTop: '1px solid var(--border)' }}>
                <UserPlus size={16} /> New Client{clientSearch.trim() && !filteredClients.length ? `: "${clientSearch.trim()}"` : ''}
              </button>

              {/* Inline new client form */}
              {showNewClient && (
                <div className="px-3 py-3 space-y-2" style={{ borderTop: '1px solid var(--border)', backgroundColor: 'rgba(168,85,247,0.03)' }}>
                  <p className="text-xs font-semibold uppercase" style={{ color: 'var(--text-secondary)' }}>New Client</p>

                  {/* Name */}
                  <input type="text" placeholder="Name *"
                    value={newClientAlias} onChange={e => setNewClientAlias(e.target.value)}
                    className="w-full text-sm bg-transparent outline-none pb-1"
                    style={{ color: 'var(--text-primary)', borderBottom: '1px solid var(--border)', fontSize: '16px' }}
                    autoFocus />

                  {/* Primary Contact */}
                  <div>
                    <label className="text-[10px] font-medium" style={{ color: 'var(--text-secondary)' }}>Primary Contact</label>
                    <select value={newClientPrimary}
                      onChange={e => { const v = e.target.value as ContactMethod; setNewClientPrimary(v); if (v === newClientSecondary) setNewClientSecondary('') }}
                      className="w-full text-sm bg-transparent outline-none py-1"
                      style={{ color: 'var(--text-primary)', borderBottom: '1px solid var(--border)', fontSize: '16px' }}>
                      {contactMethods.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                    {(() => {
                      const cfg: Record<string, { val: string; set: (v: string) => void; ph: string; type: string }> = {
                        Phone: { val: newClientPhone, set: setNewClientPhone, ph: 'Phone number', type: 'tel' },
                        Text: { val: newClientPhone, set: setNewClientPhone, ph: 'Phone number', type: 'tel' },
                        Email: { val: newClientEmail, set: setNewClientEmail, ph: 'Email address', type: 'email' },
                        Telegram: { val: newClientTelegram, set: setNewClientTelegram, ph: '@username or phone', type: 'text' },
                        Signal: { val: newClientSignal, set: setNewClientSignal, ph: 'Signal number', type: 'tel' },
                        WhatsApp: { val: newClientWhatsapp, set: setNewClientWhatsapp, ph: 'WhatsApp number', type: 'tel' },
                      }
                      const c = cfg[newClientPrimary]
                      if (!c) return null
                      return <input type={c.type} placeholder={c.ph} value={c.val} onChange={e => c.set(e.target.value)}
                        className="w-full text-sm bg-transparent outline-none pb-1 mt-1"
                        style={{ color: 'var(--text-primary)', borderBottom: '1px solid var(--border)', fontSize: '16px' }} />
                    })()}
                  </div>

                  {/* Secondary Contact */}
                  <div>
                    <label className="text-[10px] font-medium" style={{ color: 'var(--text-secondary)' }}>Secondary Contact <span style={{ opacity: 0.5 }}>(optional)</span></label>
                    <select value={newClientSecondary}
                      onChange={e => setNewClientSecondary(e.target.value as ContactMethod | '')}
                      className="w-full text-sm bg-transparent outline-none py-1"
                      style={{ color: 'var(--text-primary)', borderBottom: '1px solid var(--border)', fontSize: '16px' }}>
                      <option value="">— None —</option>
                      {contactMethods.filter(m => m !== newClientPrimary).map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                    {(() => {
                      if (!newClientSecondary) return null
                      const cfg: Record<string, { val: string; set: (v: string) => void; ph: string; type: string }> = {
                        Phone: { val: newClientPhone, set: setNewClientPhone, ph: 'Phone number', type: 'tel' },
                        Text: { val: newClientPhone, set: setNewClientPhone, ph: 'Phone number', type: 'tel' },
                        Email: { val: newClientEmail, set: setNewClientEmail, ph: 'Email address', type: 'email' },
                        Telegram: { val: newClientTelegram, set: setNewClientTelegram, ph: '@username or phone', type: 'text' },
                        Signal: { val: newClientSignal, set: setNewClientSignal, ph: 'Signal number', type: 'tel' },
                        WhatsApp: { val: newClientWhatsapp, set: setNewClientWhatsapp, ph: 'WhatsApp number', type: 'tel' },
                      }
                      const c = cfg[newClientSecondary]
                      if (!c) return null
                      return <input type={c.type} placeholder={c.ph} value={c.val} onChange={e => c.set(e.target.value)}
                        className="w-full text-sm bg-transparent outline-none pb-1 mt-1"
                        style={{ color: 'var(--text-primary)', borderBottom: '1px solid var(--border)', fontSize: '16px' }} />
                    })()}
                  </div>

                  {/* Screening — status + method side by side */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-medium" style={{ color: 'var(--text-secondary)' }}>Screening</label>
                      <select value={newClientScreening} onChange={e => setNewClientScreening(e.target.value as ScreeningStatus)}
                        className="w-full text-sm bg-transparent outline-none py-1"
                        style={{ color: 'var(--text-primary)', borderBottom: '1px solid var(--border)', fontSize: '16px' }}>
                        {(['Unscreened', 'In Progress', 'Screened'] as ScreeningStatus[]).map(s => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-medium" style={{ color: 'var(--text-secondary)' }}>Method</label>
                      <select value={newClientScreeningMethod} onChange={e => setNewClientScreeningMethod(e.target.value as ScreeningMethod | '')}
                        className="w-full text-sm bg-transparent outline-none py-1"
                        style={{ color: 'var(--text-primary)', borderBottom: '1px solid var(--border)', fontSize: '16px' }}>
                        <option value="">—</option>
                        {screeningMethods.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Preferences & Boundaries */}
                  <textarea placeholder="Preferences (likes, requests...)"
                    value={newClientPreferences} onChange={e => setNewClientPreferences(e.target.value)}
                    rows={2} className="w-full text-sm bg-transparent outline-none resize-none pb-1"
                    style={{ color: 'var(--text-primary)', borderBottom: '1px solid var(--border)' }} />
                  <textarea placeholder="Boundaries (hard limits...)"
                    value={newClientBoundaries} onChange={e => setNewClientBoundaries(e.target.value)}
                    rows={2} className="w-full text-sm bg-transparent outline-none resize-none pb-1"
                    style={{ color: 'var(--text-primary)', borderBottom: '1px solid var(--border)' }} />
                  <textarea placeholder="Notes"
                    value={newClientNotes} onChange={e => setNewClientNotes(e.target.value)}
                    rows={2} className="w-full text-sm bg-transparent outline-none resize-none pb-1"
                    style={{ color: 'var(--text-primary)', borderBottom: '1px solid var(--border)' }} />

                  <div className="flex gap-2 pt-1">
                    <button onClick={() => { setShowNewClient(false); setNewClientAlias(''); setNewClientPhone('') }}
                      className="flex-1 py-2 rounded-lg text-sm" style={{ color: 'var(--text-secondary)' }}>Cancel</button>
                    <button onClick={createNewClientInline} disabled={!newClientAlias.trim()}
                      className={`flex-1 py-2 rounded-lg text-sm font-semibold ${newClientAlias.trim() ? 'bg-purple-600 text-white' : 'opacity-40 bg-purple-600 text-white'}`}>
                      Create & Select
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Unscreened client warning */}
        {!isEditing && selectedClient && !clientIsScreened && (
          <div className="flex items-center gap-2.5 p-3 rounded-xl mb-2"
            style={{ backgroundColor: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.2)' }}>
            <AlertTriangle size={16} className="text-orange-500 shrink-0" />
            <div className="flex-1">
              <p className="text-xs font-semibold text-orange-500">Screening required</p>
              <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                Go to Clients → {selectedClient.alias} → set Screening to "Screened" before creating a booking.
              </p>
            </div>
          </div>
        )}

        {/* ━━━ Date & Time ━━━ */}
        <FieldDateTime label="Date & Time" value={dateTime} onChange={setDateTime} />

        {/* ━━━ Duration ━━━ */}
        <SectionLabel label="Duration" />

        {/* Service rate quick-select buttons */}
        {serviceRates.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {serviceRates.map(rate => (
              <button key={rate.id} type="button"
                onClick={() => selectServiceRate(rate.duration, rate.rate)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  duration === rate.duration && !customDuration ? 'bg-purple-500/20 text-purple-500' : ''
                }`}
                style={duration !== rate.duration || customDuration
                  ? { backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)' } : {}}>
                <div className="font-bold">
                  {`${Math.round((rate.duration / 60) * 100) / 100}h`}
                </div>
                <div className="text-xs opacity-70">{formatCurrency(rate.rate)}</div>
              </button>
            ))}
            <button type="button" onClick={() => setCustomDuration(true)}
              className={`px-3 py-2 rounded-lg text-sm font-medium ${customDuration ? 'bg-purple-500/20 text-purple-500' : ''}`}
              style={!customDuration ? { backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)' } : {}}>
              Custom</button>
          </div>
        )}

        {/* Custom / manual duration input */}
        {(customDuration || serviceRates.length === 0) && (
          <div className="flex items-center gap-3 mb-3">
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Hours</span>
            <input type="text" inputMode="decimal"
              value={duration === 0 ? '' : String(Math.round((duration / 60) * 100) / 100)}
              onChange={e => {
                const raw = e.target.value.replace(/[^0-9.]/g, '')
                if (raw === '' || raw === '.') { setDuration(0); return }
                const val = parseFloat(raw)
                if (!isNaN(val)) setDuration(Math.round(val * 60))
              }}
              placeholder="0" className="flex-1 px-3 py-2.5 rounded-lg text-sm outline-none"
              style={fieldInputStyle} />
          </div>
        )}

        {/* ━━━ Pricing ━━━ */}
        <SectionLabel label="Pricing" />
        <div className="flex gap-3">
          <div className="flex-1"><FieldCurrency label="Base Rate" value={baseRate} onChange={setBaseRate} /></div>
          <div className="flex-1"><FieldCurrency label="Extras" value={extras} onChange={setExtras} /></div>
        </div>

        {/* ━━━ Location ━━━ */}
        <SectionLabel label="Location" />
        <FieldSelect label="Type" value={locationType} options={locationTypes} onChange={setLocationType}
          hint="Incall = your place. Outcall = their place. Travel = out of town. Virtual = online." />
        {(locationType === 'Outcall' || locationType === 'Travel') && (
          <>
            <FieldTextInput label="Address" value={locationAddress} onChange={setLocationAddress} placeholder="Address" />
            <FieldCurrency label="Travel Fee" value={travelFee} onChange={setTravelFee} />
          </>
        )}
        <FieldTextInput label="Location Notes" value={locationNotes} onChange={setLocationNotes}
          placeholder="Room number, parking info, gate code..." />

        {/* Total */}
        {total > 0 && (
          <div className="flex items-center justify-between mb-3 px-3 py-2.5 rounded-lg" style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)' }}>
            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Total</span>
            <span className="text-lg font-bold text-green-500">{formatCurrency(total)}</span>
          </div>
        )}

        {/* ━━━ Deposit ━━━ */}
        <SectionLabel label="Deposit" />
        <FieldCurrency label="Deposit Amount" value={depositAmount}
          onChange={v => { setDepositAmount(v); setUserEditedDeposit(true) }}
          hint={defaultDepositType === 'flat' ? `Default flat deposit.` : `Auto-calculated at ${defaultDepositPct}% of base rate.`} />
        {depositAmount > 0 && !isEditing && (
          <FieldToggle label="Deposit Received" value={depositReceived} onChange={setDepositReceived}
            hint="Manage deposit payments from the booking detail page after creation." />
        )}

        {/* ━━━ Status ━━━ */}
        <SectionLabel label="Status & Payment" />
        <FieldSelect label="Booking Status" value={status} options={bookingStatuses} onChange={setStatus}
          hint="Track the booking through its lifecycle." />
        <FieldSelect label="Payment Method" value={paymentMethod || '' as PaymentMethod}
          options={['', ...paymentMethods] as PaymentMethod[]}
          onChange={v => setPaymentMethod(v || '')}
          displayFn={(v: string) => v || 'Not set'} />

        {/* ━━━ Optional ━━━ */}
        <button type="button" onClick={() => setShowOptional(!showOptional)}
          className="flex items-center gap-2 mb-3 mt-2 text-xs font-semibold active:opacity-70"
          style={{ color: '#a855f7' }}>
          {showOptional ? <ChevronLeft size={14} /> : <Plus size={14} />}
          {showOptional ? 'Hide' : 'Show'} additional options
        </button>

        {showOptional && (
          <>
            <SectionLabel label="Safety" />
            <FieldToggle label="Safety Check-In" value={requiresSafetyCheck}
              onChange={v => {
                if (!v && selectedClient) {
                  const forceOn = selectedClient.riskLevel === 'High Risk' || selectedClient.riskLevel === 'Unknown'
                  if (forceOn) return
                }
                setRequiresSafetyCheck(v)
              }}
              disabled={!!selectedClient && (selectedClient.riskLevel === 'High Risk' || selectedClient.riskLevel === 'Unknown')}
              hint={selectedClient && (selectedClient.riskLevel === 'High Risk' || selectedClient.riskLevel === 'Unknown')
                ? 'Required for unknown or high-risk clients.'
                : 'Get a reminder to check in with your safety contact.'} />

            <SectionLabel label="Repeat" />
            <FieldSelect label="Recurrence" value={recurrence} options={recurrenceOptions} onChange={setRecurrence}
              displayFn={(v: string) => v === 'none' ? 'None' : v === 'weekly' ? 'Weekly' : v === 'biweekly' ? 'Every 2 Weeks' : 'Monthly'}
              hint="A new booking will auto-create when this one completes." />

            <SectionLabel label="Notes" />
            <FieldTextArea label="Notes" value={notes} onChange={setNotes} placeholder="Booking notes..." />
          </>
        )}

        {/* Save Button */}
        <div className="py-4">
          <button onClick={handleSave} disabled={!isValid}
            className={`w-full py-3 rounded-xl font-semibold text-sm transition-colors ${
              isValid ? 'bg-purple-600 text-white active:bg-purple-700' : 'opacity-40 bg-purple-600 text-white'
            }`}>
            {isEditing ? 'Save Changes' : 'Create Booking'}
          </button>
        </div>
        <div className="h-8" />
      </div>

      {/* Availability Conflict Warning */}
      {conflictWarning && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-6"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)' }} onClick={() => setConflictWarning(null)}>
          <div className="w-full max-w-sm rounded-2xl p-6"
            style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{ backgroundColor: conflictWarning.isDoubleBook ? 'rgba(239,68,68,0.15)' : 'rgba(249,115,22,0.15)' }}>
                <AlertTriangle size={20} style={{ color: conflictWarning.isDoubleBook ? '#ef4444' : '#f97316' }} />
              </div>
              <h3 className="font-bold text-base" style={{ color: 'var(--text-primary)' }}>
                {conflictWarning.isDoubleBook ? 'Double Booking' : 'Availability Conflict'}
              </h3>
            </div>
            <p className="text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>{conflictWarning.reason}</p>
            {!conflictWarning.isDoubleBook && (
              <p className="text-xs mb-5" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
                If you continue, this day will be set to <strong style={{ color: '#f97316' }}>Limited</strong> and
                only this booking's time slot will be open.
              </p>
            )}
            {conflictWarning.isDoubleBook && (
              <p className="text-xs mb-5" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
                This booking will overlap with another appointment. Are you sure you want to proceed?
              </p>
            )}
            <div className="flex gap-3">
              <button onClick={() => setConflictWarning(null)}
                className="flex-1 py-3 rounded-xl text-sm font-semibold"
                style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>Go Back</button>
              <button onClick={() => saveBooking(!conflictWarning.isDoubleBook)}
                className="flex-1 py-3 rounded-xl text-sm font-semibold text-white"
                style={{ background: conflictWarning.isDoubleBook
                  ? 'linear-gradient(135deg, #ef4444, #dc2626)'
                  : 'linear-gradient(135deg, #f97316, #ef4444)' }}>
                Book Anyway</button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}
