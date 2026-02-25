import { useState, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Send, Copy, Phone, Mail, MessageSquare } from 'lucide-react'
import { db, formatCurrency, bookingDurationFormatted } from '../db'
import { showToast } from './Toast'
import { contactMethodMeta, getContactValue, openChannel } from '../utils/contactChannel'
import { fieldInputStyle } from './FormFields'
import type { Client, ContactMethod, ServiceRate } from '../types'

const contactMethodIcons: Record<ContactMethod, typeof Phone> = {
  'Phone': Phone, 'Text': MessageSquare, 'Email': Mail, 'Telegram': Send,
  'Signal': MessageSquare, 'WhatsApp': Phone, 'Other': MessageSquare,
}

function buildIntroMessage(client: Client, serviceRates: ServiceRate[]): string {
  const workingName = localStorage.getItem('profileWorkingName')?.replace(/^"|"$/g, '') || ''
  const workEmail = localStorage.getItem('profileWorkEmail')?.replace(/^"|"$/g, '') || ''
  const workPhone = localStorage.getItem('profileWorkPhone')?.replace(/^"|"$/g, '') || ''
  const website = localStorage.getItem('profileWebsite')?.replace(/^"|"$/g, '') || ''

  const raw = localStorage.getItem('introTemplate')
  const defaultTemplate = 'Hi {client}! Thank you for your inquiry.\n\nHere is some information about my services:\n\n{rates}\n\nA deposit of {deposit} is required to confirm a booking.\n\nPlease let me know if you have any questions or would like to schedule a time.\n\n— {name}'
  let template = defaultTemplate
  if (raw) {
    try { template = JSON.parse(raw) } catch { template = raw }
  }

  // Build rates string
  const activeRates = serviceRates.filter(r => r.isActive)
  let ratesStr: string
  if (activeRates.length > 0) {
    ratesStr = activeRates
      .map(r => `• ${r.name} (${bookingDurationFormatted(r.duration)}) — ${formatCurrency(r.rate)}`)
      .join('\n')
  } else {
    ratesStr = 'Please inquire about rates.'
  }

  // Build deposit string
  const depositType = localStorage.getItem('defaultDepositType')?.replace(/^"|"$/g, '') || 'percent'
  const depositPct = parseInt(localStorage.getItem('defaultDepositPercentage')?.replace(/^"|"$/g, '') || '25')
  const depositFlat = parseFloat(localStorage.getItem('defaultDepositFlat')?.replace(/^"|"$/g, '') || '0')

  let depositStr: string
  if (depositType === 'flat' && depositFlat > 0) {
    depositStr = formatCurrency(depositFlat)
  } else if (depositPct > 0) {
    depositStr = `${depositPct}%`
  } else {
    depositStr = 'a deposit'
  }

  return template
    .replace(/\{client\}/g, client.alias || 'there')
    .replace(/\{name\}/g, workingName)
    .replace(/\{email\}/g, workEmail)
    .replace(/\{phone\}/g, workPhone)
    .replace(/\{website\}/g, website)
    .replace(/\{rates\}/g, ratesStr)
    .replace(/\{deposit\}/g, depositStr)
}

interface SendIntroSheetProps {
  isOpen: boolean
  onClose: () => void
  client: Client
}

export function SendIntroSheet({ isOpen, onClose, client }: SendIntroSheetProps) {
  const serviceRates = useLiveQuery(() => db.serviceRates.toArray().then(r => r.filter(s => s.isActive))) ?? []
  const [message, setMessage] = useState('')
  const [sent, setSent] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setSent(false)
      setMessage(buildIntroMessage(client, serviceRates))
    }
  }, [isOpen, client.id, serviceRates])

  if (!isOpen) return null

  const method = client.preferredContact
  const meta = contactMethodMeta[method]
  const MethodIcon = contactMethodIcons[method]
  const contactVal = getContactValue(client, method)

  function handleSend() {
    if (!message) return

    if (!contactVal) {
      navigator.clipboard.writeText(message)
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
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        className="relative w-full max-w-lg rounded-t-2xl safe-bottom flex flex-col"
        style={{ backgroundColor: 'var(--bg-card)', maxHeight: '85vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
          <h3 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>Send Intro</h3>
          <button onClick={onClose} className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {sent ? 'Done' : 'Cancel'}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
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
                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
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
              rows={12}
              className="w-full px-3 py-2.5 rounded-lg text-sm outline-none resize-none"
              style={{ ...fieldInputStyle, fontSize: '16px' }}
            />
            <p className="text-[10px] mt-1 px-1" style={{ color: 'var(--text-secondary)' }}>
              Template can be customized in Profile settings.
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
                  navigator.clipboard.writeText(message)
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
