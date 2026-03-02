import { useState, useEffect, useRef } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Send, Copy, Phone, Mail, MessageSquare } from 'lucide-react'
import { db, formatCurrency, bookingTotal, bookingDurationFormatted } from '../db'
import { fmtFullDayDate, fmtTime } from '../utils/dateFormat'
import { showToast } from './Toast'
import { contactMethodMeta, getContactValue, openChannel } from '../utils/contactChannel'
import { fieldInputStyle } from './FormFields'
import { lsKey } from '../hooks/useSettings'
import type { Booking, Client, ContactMethod, IncallVenue } from '../types'

const contactMethodIcons: Record<ContactMethod, typeof Phone> = {
  'Phone': Phone, 'Text': MessageSquare, 'Email': Mail, 'Telegram': Send,
  'Signal': MessageSquare, 'WhatsApp': Phone, 'Other': MessageSquare,
}

// ── Template types ──────────────────────────────────────────────

export type MessageTemplateType =
  | 'intro'
  | 'confirmation'
  | 'depositReminder'
  | 'screening'
  | 'cancellation'
  | 'thankYou'
  | 'directions'

interface TemplateConfig {
  key: MessageTemplateType
  label: string
  storageKey: string
  defaultText: string
  requiresBooking: boolean
}

const TEMPLATES: TemplateConfig[] = [
  {
    key: 'intro',
    label: 'Intro',
    storageKey: 'introTemplate',
    defaultText: 'Hi {client}! Thank you for your inquiry.\n\nHere is some information about my services:\n\n{rates}\n\nA deposit of {deposit} is required to confirm a booking.\n\nPlease let me know if you have any questions or would like to schedule a time.\n\n— {name}',
    requiresBooking: false,
  },
  {
    key: 'confirmation',
    label: 'Confirm',
    storageKey: 'tplConfirmation',
    defaultText: 'Hi {client}! Your booking on {date} at {time} is confirmed. See you then!\n\n— {name}',
    requiresBooking: true,
  },
  {
    key: 'depositReminder',
    label: 'Deposit',
    storageKey: 'tplDepositReminder',
    defaultText: 'Hi {client}, a deposit of {deposit} is needed to confirm your booking on {date} at {time}. Please let me know once sent!\n\n— {name}',
    requiresBooking: true,
  },
  {
    key: 'screening',
    label: 'Screening',
    storageKey: 'tplScreening',
    defaultText: 'Hi {client}, before we can meet I\'ll need to verify your identity. Please send a photo of your ID and a selfie, or provide references I can check. Thank you for understanding!\n\n— {name}',
    requiresBooking: false,
  },
  {
    key: 'cancellation',
    label: 'Cancel',
    storageKey: 'tplCancellation',
    defaultText: 'Hi {client}, I\'m sorry but I need to cancel our booking on {date} at {time}. I apologize for any inconvenience.\n\n— {name}',
    requiresBooking: true,
  },
  {
    key: 'thankYou',
    label: 'Thanks',
    storageKey: 'tplThankYou',
    defaultText: 'Hi {client}, thank you for our time together! I had a wonderful time and hope to see you again soon.\n\n— {name}',
    requiresBooking: false,
  },
  {
    key: 'directions',
    label: 'Directions',
    storageKey: 'directionsTemplate',
    defaultText: 'Hi! Here are the directions:\n\n📍 {address}\n\n{directions}\n\n— {name}',
    requiresBooking: true,
  },
]

// ── Placeholder resolution ──────────────────────────────────────

function loadTemplate(config: TemplateConfig): string {
  const raw = localStorage.getItem(lsKey(config.storageKey))
  if (!raw) return config.defaultText
  try { return JSON.parse(raw) } catch { return raw }
}

function resolveTemplatePlaceholders(
  template: string,
  client: Client,
  booking: Booking | null | undefined,
  venue: IncallVenue | null | undefined,
  totalPaid: number,
  serviceRates: { name: string; duration: number; rate: number }[],
): string {
  const workingName = localStorage.getItem(lsKey('profileWorkingName'))?.replace(/^"|"$/g, '') || ''
  const workEmail = localStorage.getItem(lsKey('profileWorkEmail'))?.replace(/^"|"$/g, '') || ''
  const workPhone = localStorage.getItem(lsKey('profileWorkPhone'))?.replace(/^"|"$/g, '') || ''
  const website = localStorage.getItem(lsKey('profileWebsite'))?.replace(/^"|"$/g, '') || ''

  // Deposit string
  let depositStr: string
  if (booking && booking.depositAmount > 0) {
    depositStr = formatCurrency(booking.depositAmount)
  } else {
    const depositType = localStorage.getItem(lsKey('defaultDepositType'))?.replace(/^"|"$/g, '') || 'percent'
    const depositPct = parseInt(localStorage.getItem(lsKey('defaultDepositPercentage'))?.replace(/^"|"$/g, '') || '25')
    const depositFlat = parseFloat(localStorage.getItem(lsKey('defaultDepositFlat'))?.replace(/^"|"$/g, '') || '0')
    if (depositType === 'flat' && depositFlat > 0) {
      depositStr = formatCurrency(depositFlat)
    } else if (depositPct > 0) {
      depositStr = `${depositPct}%`
    } else {
      depositStr = 'a deposit'
    }
  }

  // Rates string (for intro template)
  let ratesStr: string
  if (serviceRates.length > 0) {
    ratesStr = serviceRates
      .map(r => `• ${r.name} (${bookingDurationFormatted(r.duration)}) — ${formatCurrency(r.rate)}`)
      .join('\n')
  } else {
    ratesStr = 'Please inquire about rates.'
  }

  const total = booking ? bookingTotal(booking) : 0
  const balance = Math.max(0, total - totalPaid)

  // Use replacer functions to avoid $ corruption in replacement strings
  // (String.replace treats $&, $', $$ etc. specially in string replacements)
  const safe = (s: string) => () => s

  let result = template
    .replace(/\{client\}/g, safe(client.alias || 'there'))
    .replace(/\{name\}/g, safe(workingName))
    .replace(/\{email\}/g, safe(workEmail))
    .replace(/\{phone\}/g, safe(workPhone))
    .replace(/\{website\}/g, safe(website))
    .replace(/\{rates\}/g, safe(ratesStr))
    .replace(/\{deposit\}/g, safe(depositStr))
    .replace(/\{venue\}/g, safe(venue?.name || ''))
    .replace(/\{address\}/g, safe(venue?.address || ''))
    .replace(/\{directions\}/g, safe(venue?.directions || ''))

  if (booking) {
    result = result
      .replace(/\{date\}/g, safe(fmtFullDayDate(new Date(booking.dateTime))))
      .replace(/\{time\}/g, safe(fmtTime(new Date(booking.dateTime))))
      .replace(/\{duration\}/g, safe(bookingDurationFormatted(booking.duration)))
      .replace(/\{rate\}/g, safe(formatCurrency(total)))
      .replace(/\{balance\}/g, safe(formatCurrency(balance)))
  }

  return result
}

// ── Component ───────────────────────────────────────────────────

interface SendMessageSheetProps {
  isOpen: boolean
  onClose: () => void
  client: Client
  booking?: Booking | null
  venue?: IncallVenue | null
}

export function SendMessageSheet({ isOpen, onClose, client, booking, venue }: SendMessageSheetProps) {
  const hasBooking = !!booking
  const hasDirections = !!(venue?.directions && venue.directions.length > 0)

  // Filter templates based on context
  const availableTemplates = TEMPLATES.filter(t => {
    if (t.key === 'directions') return hasDirections
    if (t.requiresBooking) return hasBooking
    return true
  })

  const [selectedType, setSelectedType] = useState<MessageTemplateType>(availableTemplates[0]?.key ?? 'intro')
  const [message, setMessage] = useState('')
  const [sent, setSent] = useState(false)
  const prevOpenRef = useRef(false)

  // Service rates for intro template
  const serviceRates = useLiveQuery(() =>
    db.serviceRates.toArray().then(r => r.filter(s => s.isActive))
  ) ?? []

  // Total paid for balance calculation
  const totalPaid = useLiveQuery(
    () => booking
      ? db.payments.where('bookingId').equals(booking.id).toArray().then(ps => ps.reduce((s, p) => s + p.amount, 0))
      : Promise.resolve(0),
    [booking?.id]
  ) ?? 0

  // Reset when sheet opens
  useEffect(() => {
    const justOpened = isOpen && !prevOpenRef.current
    prevOpenRef.current = isOpen
    if (justOpened) {
      setSent(false)
      setSelectedType(availableTemplates[0]?.key ?? 'intro')
    }
  }, [isOpen])

  // Build message when template type changes
  useEffect(() => {
    if (!isOpen) return
    const config = TEMPLATES.find(t => t.key === selectedType)
    if (!config) return
    const template = loadTemplate(config)
    setMessage(resolveTemplatePlaceholders(template, client, booking, venue, totalPaid, serviceRates))
  }, [isOpen, selectedType, client.id, booking?.id, totalPaid, serviceRates.length])

  // Escape key to close — must be before early return to satisfy Rules of Hooks
  useEffect(() => {
    if (!isOpen) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const method = client.preferredContact
  const meta = contactMethodMeta[method]
  const MethodIcon = contactMethodIcons[method]
  const contactVal = getContactValue(client, method)

  function handleSend() {
    if (!message) return

    if (!contactVal) {
      navigator.clipboard.writeText(message).catch(() => {})
      showToast('No contact info for this method — message copied to clipboard')
      setSent(true)
      return
    }

    const result = openChannel(method, contactVal, message)
    if (result === 'copied') {
      showToast('Message copied — paste it into your conversation')
    } else {
      showToast(`Opening ${meta.label}...`)
    }
    setSent(true)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true"
      aria-label="Message Client">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div
        className="relative w-full max-w-lg rounded-t-2xl safe-bottom flex flex-col"
        style={{ backgroundColor: 'var(--bg-card)', maxHeight: '85vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
          <h3 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>Message Client</h3>
          <button onClick={onClose} className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {sent ? 'Done' : 'Cancel'}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {/* Template type pills — wrapping layout */}
          <div className="flex flex-wrap gap-2">
            {availableTemplates.map(t => (
              <button
                key={t.key}
                aria-pressed={selectedType === t.key}
                onClick={() => { setSelectedType(t.key); setSent(false) }}
                className="px-3 py-2.5 rounded-full text-xs font-semibold transition-colors"
                style={selectedType === t.key
                  ? { backgroundColor: '#a855f7', color: '#fff' }
                  : { backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }
                }
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Client + method header */}
          <div className="flex items-center gap-3 p-3 rounded-xl" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
              style={{ backgroundColor: '#a855f7' }}
            >
              {client.alias.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                {client.alias}
              </p>
              <div className="flex items-center gap-1.5">
                <MethodIcon size={12} style={{ color: meta.color }} />
                <span className="text-xs" style={{ color: meta.color }}>
                  via {meta.label}
                </span>
                {contactVal && (
                  <span className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                    · {contactVal}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Editable message */}
          <div>
            <p className="text-xs font-semibold uppercase mb-1.5" style={{ color: 'var(--text-secondary)' }}>Message</p>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              rows={10}
              className="w-full px-3 py-2.5 rounded-lg text-sm outline-none resize-none"
              style={{ ...fieldInputStyle, fontSize: '16px' }}
            />
            <p className="text-[10px] mt-1 px-1" style={{ color: 'var(--text-secondary)' }}>
              Templates can be customized in Profile settings.
            </p>
          </div>

          {/* No contact warning */}
          {!contactVal && (
            <p className="text-xs text-orange-500 px-1">
              No {meta.label.toLowerCase()} contact info on file — message will be copied to clipboard instead.
            </p>
          )}

          {/* Send button */}
          {!sent ? (
            <button
              onClick={handleSend}
              className="w-full py-3 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2"
              style={{ backgroundColor: meta.color }}
            >
              <Send size={15} />
              {contactVal ? `Send via ${meta.label}` : 'Copy to Clipboard'}
            </button>
          ) : (
            <div className="flex gap-3">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(message).catch(() => {})
                  showToast('Message copied')
                }}
                className="flex-1 py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
                style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
              >
                <Copy size={14} />
                Copy
              </button>
              <button
                onClick={handleSend}
                className="flex-1 py-3 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2"
                style={{ backgroundColor: meta.color }}
              >
                <Send size={14} />
                Resend
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/** Exported for ProfilePage template editors */
export { TEMPLATES }
