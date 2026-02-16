import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  ArrowLeft, Edit, Phone, MessageSquare, Mail, Copy, Check,
  UserX, Pin, PinOff, Gift, Heart, ChevronRight, Shield,
  ThumbsUp, ShieldAlert, StickyNote
} from 'lucide-react'
import { format } from 'date-fns'
import { db, formatCurrency, bookingTotal, bookingDurationFormatted } from '../../db'
import { StatusBadge } from '../../components/StatusBadge'
import { RiskLevelBar } from '../../components/RiskLevelBar'
import { Card } from '../../components/Card'
import { ClientEditor } from './ClientEditor'
import { screeningStatusColors, riskLevelColors } from '../../types'

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
  const [showEditor, setShowEditor] = useState(false)
  const [copiedField, setCopiedField] = useState<string | null>(null)

  if (!client) return null

  const completedBookings = bookings
    .filter(b => b.status === 'Completed')
    .sort((a, b) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime())

  const upcomingBookings = bookings
    .filter(b => new Date(b.dateTime) > new Date() && b.status !== 'Cancelled' && b.status !== 'Completed')
    .sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime())

  const noShowCount = bookings.filter(b => b.status === 'No Show').length
  const totalRevenue = completedBookings.reduce((sum, b) => sum + bookingTotal(b), 0)

  function copyToClipboard(text: string, field: string) {
    navigator.clipboard.writeText(text)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 1500)
  }

  async function togglePin() {
    await db.clients.update(clientId, { isPinned: !client!.isPinned })
  }

  async function toggleBlock() {
    if (!client!.isBlocked && !confirm('Block this client? They will be hidden from your main list.')) return
    await db.clients.update(clientId, { isBlocked: !client!.isBlocked })
    if (!client!.isBlocked) onBack()
  }

  return (
    <div className="pb-20">
      {/* Header */}
      <header
        className="sticky top-0 z-30 border-b backdrop-blur-xl"
        style={{
          backgroundColor: 'color-mix(in srgb, var(--bg-primary) 85%, transparent)',
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

        {/* Contact with Quick Actions */}
        <Card>
          <p className="text-xs font-semibold uppercase mb-2" style={{ color: 'var(--text-secondary)' }}>Contact</p>
          {client.phone && (
            <div className="py-2">
              <div className="flex items-center gap-3 mb-2">
                <Phone size={14} style={{ color: 'var(--text-secondary)' }} />
                <span className="text-sm flex-1" style={{ color: 'var(--text-primary)' }}>{client.phone}</span>
              </div>
              <div className="flex gap-2">
                <a
                  href={`tel:${client.phone}`}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-green-500/15 text-green-500"
                >
                  <Phone size={12} /> Call
                </a>
                <a
                  href={`sms:${client.phone}`}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-blue-500/15 text-blue-500"
                >
                  <MessageSquare size={12} /> Text
                </a>
                <button
                  onClick={() => copyToClipboard(client.phone!, 'phone')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium"
                  style={{ backgroundColor: 'var(--bg-secondary)', color: copiedField === 'phone' ? '#22c55e' : 'var(--text-secondary)' }}
                >
                  {copiedField === 'phone' ? <Check size={12} /> : <Copy size={12} />}
                  {copiedField === 'phone' ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
          )}
          {client.email && (
            <div className="py-2">
              <div className="flex items-center gap-3 mb-2">
                <Mail size={14} style={{ color: 'var(--text-secondary)' }} />
                <span className="text-sm flex-1" style={{ color: 'var(--text-primary)' }}>{client.email}</span>
              </div>
              <div className="flex gap-2">
                <a
                  href={`mailto:${client.email}`}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-blue-500/15 text-blue-500"
                >
                  <Mail size={12} /> Email
                </a>
                <button
                  onClick={() => copyToClipboard(client.email!, 'email')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium"
                  style={{ backgroundColor: 'var(--bg-secondary)', color: copiedField === 'email' ? '#22c55e' : 'var(--text-secondary)' }}
                >
                  {copiedField === 'email' ? <Check size={12} /> : <Copy size={12} />}
                  {copiedField === 'email' ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
          )}
          <div className="flex items-center gap-3 py-1.5">
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Preferred:</span>
            <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{client.preferredContact}</span>
          </div>
        </Card>

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
          <p className="text-xs font-semibold uppercase mb-2" style={{ color: 'var(--text-secondary)' }}>Screening</p>
          <div className="flex items-center justify-between py-1.5">
            <span className="text-sm" style={{ color: 'var(--text-primary)' }}>Status</span>
            <StatusBadge text={client.screeningStatus} color={screeningStatusColors[client.screeningStatus]} />
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
        {completedBookings.length > 0 && (
          <Card>
            <p className="text-xs font-semibold uppercase mb-2" style={{ color: 'var(--text-secondary)' }}>
              History ({completedBookings.length})
            </p>
            {completedBookings.slice(0, 10).map(b => (
              <button
                key={b.id}
                onClick={() => onOpenBooking(b.id)}
                className="flex items-center justify-between py-2 w-full text-left"
              >
                <div>
                  <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
                    {format(new Date(b.dateTime), 'MMM d, yyyy')}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {bookingDurationFormatted(b.duration)} · {b.locationType}
                  </p>
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
        </Card>
      </div>

      <ClientEditor isOpen={showEditor} onClose={() => setShowEditor(false)} client={client} />
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
