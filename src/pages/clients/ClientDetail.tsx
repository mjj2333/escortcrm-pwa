import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  ArrowLeft, Edit, Phone, MessageSquare, Mail, Copy, Check,
  UserX, Pin, PinOff, Gift, Heart, ChevronRight, Shield,
  ThumbsUp, ShieldAlert, StickyNote, Plus, RotateCcw, Trash2
} from 'lucide-react'
import { format } from 'date-fns'
import { db, formatCurrency, bookingTotal, bookingDurationFormatted } from '../../db'
import { StatusBadge } from '../../components/StatusBadge'
import { RiskLevelBar } from '../../components/RiskLevelBar'
import { ScreeningStatusBar } from '../../components/ScreeningStatusBar'
import { Card } from '../../components/Card'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { ClientEditor } from './ClientEditor'
import { BookingEditor } from '../schedule/BookingEditor'
import { screeningStatusColors, riskLevelColors, bookingStatusColors } from '../../types'

interface ClientDetailProps {
  clientId: string
  onBack: () => void
  onOpenBooking: (bookingId: string) => void
}

export function ClientDetail({ clientId, onBack, onOpenBooking }: ClientDetailProps) {
  const client = useLiveQuery(() => db.clients.get(clientId))
  const bookings = useLiveQuery(() =>
    db.bookings.where('clientId').equals(clientId).toArray()
  ) ?? []
  const allPayments = useLiveQuery(async () => {
    const bIds = (await db.bookings.where('clientId').equals(clientId).toArray()).map(b => b.id)
    if (bIds.length === 0) return []
    return db.payments.where('bookingId').anyOf(bIds).toArray()
  }, [clientId]) ?? []
  const [showEditor, setShowEditor] = useState(false)
  const [showBookingEditor, setShowBookingEditor] = useState(false)
  const [showRebook, setShowRebook] = useState(false)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [showBlockConfirm, setShowBlockConfirm] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  if (!client) return null

  const completedBookings = bookings
    .filter(b => b.status === 'Completed')
    .sort((a, b) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime())

  const lastCompletedBooking = completedBookings[0] ?? undefined

  // All terminal bookings for history display (Completed + Cancelled + No Show)
  const pastBookings = bookings
    .filter(b => b.status === 'Completed' || b.status === 'Cancelled' || b.status === 'No Show')
    .sort((a, b) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime())

  const upcomingBookings = bookings
    .filter(b => new Date(b.dateTime) > new Date() && b.status !== 'Cancelled' && b.status !== 'Completed')
    .sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime())

  const noShowCount = bookings.filter(b => b.status === 'No Show').length
  const totalRevenue = completedBookings.reduce((sum, b) => sum + bookingTotal(b), 0)

  // Outstanding balance: sum of (total - paid) for non-cancelled bookings
  const activeBookings = bookings.filter(b => b.status !== 'Cancelled' && b.status !== 'No Show')
  const outstandingBalance = activeBookings.reduce((sum, b) => {
    const bTotal = bookingTotal(b)
    const bPaid = allPayments.filter(p => p.bookingId === b.id).reduce((s, p) => s + p.amount, 0)
    const owing = bTotal - bPaid
    return sum + (owing > 0 ? owing : 0)
  }, 0)

  function copyToClipboard(text: string, field: string) {
    navigator.clipboard.writeText(text)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 1500)
  }

  async function togglePin() {
    await db.clients.update(clientId, { isPinned: !client!.isPinned })
  }

  async function toggleBlock() {
    if (!client!.isBlocked) {
      setShowBlockConfirm(true)
      return
    }
    await db.clients.update(clientId, { isBlocked: false })
  }

  async function confirmBlock() {
    await db.clients.update(clientId, { isBlocked: true })
    setShowBlockConfirm(false)
    onBack()
  }

  async function confirmDelete() {
    // Delete all bookings for this client
    await db.bookings.where('clientId').equals(clientId).delete()
    // Delete the client
    await db.clients.delete(clientId)
    setShowDeleteConfirm(false)
    onBack()
  }

  return (
    <div className="pb-20">
      {/* Header */}
      <header
        className="sticky top-0 z-30 border-b backdrop-blur-xl header-frosted"
        style={{
          borderColor: 'var(--border)',
        }}
      >
        <div className="flex items-center justify-between px-4 h-12 max-w-lg mx-auto">
          <button onClick={onBack} className="flex items-center gap-1 text-purple-500">
            <ArrowLeft size={18} />
            <span className="text-sm">Back</span>
          </button>
          <div className="flex items-center gap-2">
            <button onClick={togglePin} className="p-2" style={{ color: client.isPinned ? '#a855f7' : 'var(--text-secondary)' }}>
              {client.isPinned ? <PinOff size={18} /> : <Pin size={18} />}
            </button>
            <button onClick={() => setShowEditor(true)} className="p-2 text-purple-500">
              <Edit size={18} />
            </button>
          </div>
        </div>
      </header>

      <div className="px-4 py-4 max-w-lg mx-auto space-y-4">
        {/* Profile Header */}
        <div className="flex flex-col items-center py-4">
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center mb-3"
            style={{ backgroundColor: 'rgba(168,85,247,0.15)' }}
          >
            <span className="text-2xl font-bold text-purple-500">
              {client.alias.slice(0, 2).toUpperCase()}
            </span>
          </div>
          <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
            {client.realName ?? client.alias}
          </h2>
          {client.realName && client.realName !== client.alias && (
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>({client.alias})</p>
          )}
          <div className="flex items-center gap-2 mt-2">
            <StatusBadge text={client.screeningStatus} color={screeningStatusColors[client.screeningStatus]} size="md" />
            {client.riskLevel !== 'Unknown' && (
              <StatusBadge text={client.riskLevel} color={riskLevelColors[client.riskLevel]} size="md" />
            )}
          </div>

          {/* Quick Contact Actions */}
          <ContactActionBar client={client} />
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center">
            <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{completedBookings.length}</p>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Bookings</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-green-500">{formatCurrency(totalRevenue)}</p>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Revenue</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
              {client.lastSeen ? format(new Date(client.lastSeen), 'MMM d') : '—'}
            </p>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Last Seen</p>
          </div>
        </div>

        {/* Outstanding Balance */}
        {outstandingBalance > 0 && (
          <Card>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase" style={{ color: 'var(--text-secondary)' }}>Outstanding Balance</p>
                <p className="text-lg font-bold text-orange-500 mt-0.5">{formatCurrency(outstandingBalance)}</p>
              </div>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-orange-500/15 text-orange-500">
                {activeBookings.filter(b => {
                  const bTotal = bookingTotal(b)
                  const bPaid = allPayments.filter(p => p.bookingId === b.id).reduce((s, p) => s + p.amount, 0)
                  return bTotal - bPaid > 0
                }).length} booking{activeBookings.filter(b => {
                  const bTotal = bookingTotal(b)
                  const bPaid = allPayments.filter(p => p.bookingId === b.id).reduce((s, p) => s + p.amount, 0)
                  return bTotal - bPaid > 0
                }).length !== 1 ? 's' : ''}
              </span>
            </div>
          </Card>
        )}

        {/* Tags */}
        {client.tags.length > 0 && (
          <Card>
            <p className="text-xs font-semibold uppercase mb-2" style={{ color: 'var(--text-secondary)' }}>Tags</p>
            <div className="flex flex-wrap gap-2">
              {client.tags.map(tag => (
                <span
                  key={tag.id}
                  className="text-xs px-2.5 py-1 rounded-full font-medium"
                  style={{ backgroundColor: `${tag.color}25`, color: tag.color }}
                >
                  {tag.icon && <span className="mr-1">{tag.icon}</span>}
                  {tag.name}
                </span>
              ))}
            </div>
          </Card>
        )}

        {/* Important Dates */}
        {(client.birthday || client.clientSince) && (
          <Card>
            <p className="text-xs font-semibold uppercase mb-2" style={{ color: 'var(--text-secondary)' }}>Important Dates</p>
            {client.birthday && (
              <div className="flex items-center gap-3 py-1.5">
                <Gift size={16} className="text-pink-500" />
                <span className="text-sm flex-1" style={{ color: 'var(--text-primary)' }}>Birthday</span>
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  {format(new Date(client.birthday), 'MMM d')}
                </span>
              </div>
            )}
            {client.clientSince && (
              <div className="flex items-center gap-3 py-1.5">
                <Heart size={16} className="text-purple-500" />
                <span className="text-sm flex-1" style={{ color: 'var(--text-primary)' }}>Client Since</span>
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  {format(new Date(client.clientSince), 'MMM d, yyyy')}
                </span>
              </div>
            )}
          </Card>
        )}

        {/* Contact Info */}
        {(client.phone || client.email) && (
          <Card>
            <p className="text-xs font-semibold uppercase mb-2" style={{ color: 'var(--text-secondary)' }}>Contact</p>
            {client.phone && (
              <div className="flex items-center gap-3 py-1.5">
                <Phone size={14} style={{ color: 'var(--text-secondary)' }} />
                <span className="text-sm flex-1" style={{ color: 'var(--text-primary)' }}>{client.phone}</span>
                <button
                  onClick={() => copyToClipboard(client.phone!, 'phone')}
                  className="p-1.5 rounded-lg"
                  style={{ color: copiedField === 'phone' ? '#22c55e' : 'var(--text-secondary)' }}
                >
                  {copiedField === 'phone' ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
            )}
            {client.email && (
              <div className="flex items-center gap-3 py-1.5">
                <Mail size={14} style={{ color: 'var(--text-secondary)' }} />
                <span className="text-sm flex-1" style={{ color: 'var(--text-primary)' }}>{client.email}</span>
                <button
                  onClick={() => copyToClipboard(client.email!, 'email')}
                  className="p-1.5 rounded-lg"
                  style={{ color: copiedField === 'email' ? '#22c55e' : 'var(--text-secondary)' }}
                >
                  {copiedField === 'email' ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
            )}
            <div className="flex items-center gap-3 py-1.5">
              <MessageSquare size={14} style={{ color: 'var(--text-secondary)' }} />
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Preferred:</span>
              <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{client.preferredContact}</span>
            </div>
          </Card>
        )}

        {/* Preferences & Boundaries */}
        {(client.preferences || client.boundaries) && (
          <Card>
            <p className="text-xs font-semibold uppercase mb-3" style={{ color: 'var(--text-secondary)' }}>
              Preferences & Boundaries
            </p>
            {client.preferences && (
              <div className="flex gap-3 py-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{ backgroundColor: 'rgba(34,197,94,0.12)' }}>
                  <ThumbsUp size={15} style={{ color: '#22c55e' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: '#22c55e' }}>Likes & Preferences</p>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--text-primary)' }}>{client.preferences}</p>
                </div>
              </div>
            )}
            {client.preferences && client.boundaries && (
              <div className="my-1" style={{ borderTop: '1px solid var(--border)' }} />
            )}
            {client.boundaries && (
              <div className="flex gap-3 py-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{ backgroundColor: 'rgba(239,68,68,0.12)' }}>
                  <ShieldAlert size={15} style={{ color: '#ef4444' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: '#ef4444' }}>Boundaries — Do Not Cross</p>
                  <p className="text-sm leading-relaxed" style={{ color: '#f87171' }}>{client.boundaries}</p>
                </div>
              </div>
            )}
          </Card>
        )}

        {/* Screening & Risk */}
        <Card>
          {/* Interactive Screening Bar */}
          <div className="py-2">
            <ScreeningStatusBar
              value={client.screeningStatus}
              onChange={async (status) => {
                await db.clients.update(client.id, { screeningStatus: status })
              }}
            />
          </div>
          {noShowCount > 0 && (
            <div className="flex items-center justify-between py-1.5">
              <span className="text-sm flex items-center gap-2 text-red-500">
                <UserX size={14} /> No-Shows
              </span>
              <span className="text-sm font-bold text-red-500">{noShowCount}</span>
            </div>
          )}

          {/* Interactive Risk Level Bar */}
          <div className="py-3">
            <RiskLevelBar
              value={client.riskLevel}
              onChange={async (level) => {
                // Update risk level
                await db.clients.update(client.id, { riskLevel: level })
                // Auto-set safety check-in: High Risk / Unknown = on, Low / Medium = off
                const shouldRequireSafety = level === 'High Risk' || level === 'Unknown'
                await db.clients.update(client.id, { requiresSafetyCheck: shouldRequireSafety })
              }}
            />
          </div>

          {/* Safety Check-In Required Toggle */}
          <div className="flex items-center justify-between py-2" style={{ borderTop: '1px solid var(--border)' }}>
            <span className="text-sm flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <Shield size={14} className="text-blue-500" /> Safety Check-In
            </span>
            {(() => {
              const forcedOn = client.riskLevel === 'High Risk' || client.riskLevel === 'Unknown'
              return (
                <div className="flex items-center gap-2">
                  {forcedOn && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-500 font-medium">Required</span>
                  )}
                  <button
                    onClick={() => {
                      if (forcedOn) return
                      db.clients.update(client.id, {
                        requiresSafetyCheck: !client.requiresSafetyCheck
                      })
                    }}
                    className={`w-10 h-6 rounded-full relative transition-colors ${
                      (client.requiresSafetyCheck || forcedOn)
                        ? 'bg-green-500'
                        : 'bg-zinc-600'
                    } ${forcedOn ? 'opacity-60' : ''}`}
                  >
                    <div
                      className="w-4 h-4 rounded-full bg-white absolute top-1 transition-transform"
                      style={{
                        transform: (client.requiresSafetyCheck || forcedOn)
                          ? 'translateX(20px)' : 'translateX(4px)'
                      }}
                    />
                  </button>
                </div>
              )
            })()}
          </div>
          {client.referenceSource && (
            <div className="flex items-center justify-between py-1.5">
              <span className="text-sm" style={{ color: 'var(--text-primary)' }}>Reference</span>
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{client.referenceSource}</span>
            </div>
          )}
          {client.verificationNotes && (
            <div className="py-1.5">
              <p className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>Verification Notes</p>
              <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{client.verificationNotes}</p>
            </div>
          )}
        </Card>

        {/* Quick Booking Actions — Items 7 + 12 */}
        <div className="flex gap-2">
          <button
            onClick={() => setShowBookingEditor(true)}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white active:opacity-80"
            style={{ backgroundColor: '#a855f7' }}
          >
            <Plus size={16} /> New Booking
          </button>
          {lastCompletedBooking && (
            <button
              onClick={() => setShowRebook(true)}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold active:opacity-80"
              style={{ backgroundColor: 'rgba(168,85,247,0.15)', color: '#a855f7' }}
            >
              <RotateCcw size={14} /> Rebook
            </button>
          )}
        </div>

        {/* Upcoming Bookings */}
        {upcomingBookings.length > 0 && (
          <Card>
            <p className="text-xs font-semibold uppercase mb-2" style={{ color: 'var(--text-secondary)' }}>Upcoming</p>
            {upcomingBookings.map(b => (
              <button
                key={b.id}
                onClick={() => onOpenBooking(b.id)}
                className="flex items-center justify-between py-2 w-full text-left"
              >
                <div>
                  <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
                    {format(new Date(b.dateTime), 'EEE, MMM d · h:mm a')}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {bookingDurationFormatted(b.duration)} · {b.locationType}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge text={b.status} color={bookingStatusColors[b.status]} />
                  <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    {formatCurrency(bookingTotal(b))}
                  </span>
                  <ChevronRight size={14} style={{ color: 'var(--text-secondary)' }} />
                </div>
              </button>
            ))}
          </Card>
        )}

        {/* Booking History */}
        {pastBookings.length > 0 && (
          <Card>
            <p className="text-xs font-semibold uppercase mb-2" style={{ color: 'var(--text-secondary)' }}>
              History ({pastBookings.length})
            </p>
            {pastBookings.slice(0, 10).map(b => (
              <button
                key={b.id}
                onClick={() => onOpenBooking(b.id)}
                className="flex items-center justify-between py-2 w-full text-left"
              >
                <div>
                  <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
                    {format(new Date(b.dateTime), 'MMM d, yyyy')}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {bookingDurationFormatted(b.duration)} · {b.locationType}
                    </p>
                    {b.status !== 'Completed' && (
                      <StatusBadge text={b.status} color={bookingStatusColors[b.status]} />
                    )}
                  </div>
                </div>
                <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  {formatCurrency(bookingTotal(b))}
                </span>
              </button>
            ))}
          </Card>
        )}

        {/* Notes */}
        {client.notes && (
          <Card>
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                style={{ backgroundColor: 'rgba(168,85,247,0.12)' }}>
                <StickyNote size={15} style={{ color: '#a855f7' }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-secondary)' }}>Notes</p>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--text-primary)' }}>{client.notes}</p>
              </div>
            </div>
          </Card>
        )}

        {/* Actions */}
        <Card>
          <button
            onClick={toggleBlock}
            className={`w-full py-2 text-sm font-medium text-center ${client.isBlocked ? 'text-green-500' : 'text-red-500'}`}
          >
            {client.isBlocked ? 'Unblock Client' : 'Block Client'}
          </button>
          <div style={{ borderTop: '1px solid var(--border)' }} />
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="w-full py-2 text-sm font-medium text-center flex items-center justify-center gap-2"
            style={{ color: '#ef4444' }}
          >
            <Trash2 size={14} /> Delete Client
          </button>
        </Card>
      </div>

      <ConfirmDialog
        isOpen={showBlockConfirm}
        title="Block Client"
        message="Block this client? They will be hidden from your main list."
        confirmLabel="Block"
        onConfirm={confirmBlock}
        onCancel={() => setShowBlockConfirm(false)}
      />
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="Delete Client"
        message={`Permanently delete ${client.alias} and all ${bookings.length} associated booking${bookings.length !== 1 ? 's' : ''}? This cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
      <ClientEditor isOpen={showEditor} onClose={() => setShowEditor(false)} client={client} />
      <BookingEditor isOpen={showBookingEditor} onClose={() => setShowBookingEditor(false)} preselectedClientId={clientId} />
      {lastCompletedBooking && (
        <BookingEditor isOpen={showRebook} onClose={() => setShowRebook(false)} rebookFrom={lastCompletedBooking} />
      )}
    </div>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Contact Action Bar
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { Client } from '../../types'

function cleanPhone(phone: string): string {
  return phone.replace(/[^\d+]/g, '')
}

function ContactActionBar({ client }: { client: Client }) {
  const phone = client.phone ? cleanPhone(client.phone) : null
  const pref = client.preferredContact

  type Action = { label: string; icon: React.ReactNode; href: string; bg: string; fg: string; preferred?: boolean }
  const actions: Action[] = []

  if (phone) {
    actions.push({
      label: 'Call',
      icon: <Phone size={18} />,
      href: `tel:${phone}`,
      bg: 'rgba(34,197,94,0.15)', fg: '#22c55e',
      preferred: pref === 'Phone',
    })
    actions.push({
      label: 'Text',
      icon: <MessageSquare size={18} />,
      href: `sms:${phone}`,
      bg: 'rgba(59,130,246,0.15)', fg: '#3b82f6',
      preferred: pref === 'Text',
    })
    actions.push({
      label: 'WhatsApp',
      icon: <span className="text-xs font-bold">WA</span>,
      href: `https://wa.me/${phone.replace(/^\+/, '')}`,
      bg: 'rgba(37,211,102,0.15)', fg: '#25d366',
      preferred: pref === 'WhatsApp',
    })
    actions.push({
      label: 'Telegram',
      icon: <span className="text-xs font-bold">TG</span>,
      href: `https://t.me/${phone}`,
      bg: 'rgba(0,136,204,0.15)', fg: '#0088cc',
      preferred: pref === 'Telegram',
    })
    actions.push({
      label: 'Signal',
      icon: <span className="text-xs font-bold">SG</span>,
      href: `https://signal.me/#p/${phone}`,
      bg: 'rgba(59,120,246,0.15)', fg: '#3a76f0',
      preferred: pref === 'Signal',
    })
  }

  if (client.email) {
    actions.push({
      label: 'Email',
      icon: <Mail size={18} />,
      href: `mailto:${client.email}`,
      bg: 'rgba(168,85,247,0.15)', fg: '#a855f7',
      preferred: pref === 'Email',
    })
  }

  if (actions.length === 0) return null

  // Sort: preferred first, then keep order
  const sorted = [...actions].sort((a, b) => {
    if (a.preferred && !b.preferred) return -1
    if (!a.preferred && b.preferred) return 1
    return 0
  })

  return (
    <div className="flex justify-center gap-3 mt-3 flex-wrap">
      {sorted.map(a => (
        <a
          key={a.label}
          href={a.href}
          className="flex flex-col items-center gap-1"
          style={{ textDecoration: 'none' }}
          onClick={e => e.stopPropagation()}
        >
          <div
            className="w-11 h-11 rounded-full flex items-center justify-center"
            style={{
              backgroundColor: a.bg,
              color: a.fg,
              border: a.preferred ? `2px solid ${a.fg}` : '2px solid transparent',
              boxShadow: a.preferred ? `0 0 8px ${a.fg}40` : 'none',
            }}
          >
            {a.icon}
          </div>
          <span className="text-[10px]" style={{ color: a.preferred ? a.fg : 'var(--text-secondary)' }}>
            {a.label}
          </span>
          {a.preferred && (
            <span className="text-[8px] font-semibold" style={{ color: a.fg, marginTop: '-2px' }}>
              PREFERRED
            </span>
          )}
        </a>
      ))}
    </div>
  )
}
