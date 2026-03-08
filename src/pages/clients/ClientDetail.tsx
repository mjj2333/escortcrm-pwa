import { useState, useEffect, useMemo, useRef } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  ArrowLeft, Edit, Phone, MessageSquare, Mail, Copy, Check,
  Pin, PinOff, Gift, Heart, ChevronRight, Shield,
  ThumbsUp, ShieldAlert, Plus, RotateCcw, Trash2, Merge,
  MapPin, Send, StickyNote, UserCheck
} from 'lucide-react'
import { fmtShortDate, fmtMediumDate, fmtShortDayDate, fmtTime } from '../../utils/dateFormat'
import { computeClientInterval } from '../../utils/followUpReminders'
import { db, formatCurrency, bookingTotal, bookingDurationFormatted, downgradeBookingsOnUnscreen, advanceBookingsOnScreen } from '../../db'
import { StatusBadge } from '../../components/StatusBadge'
import { RiskLevelBar } from '../../components/RiskLevelBar'
import { VerifiedBadge } from '../../components/VerifiedBadge'
import { Card } from '../../components/Card'
import { CollapsibleCard, useAccordion } from '../../components/CollapsibleCard'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { showToast, showUndoToast } from '../../components/Toast'
import { ClientEditor } from './ClientEditor'
import { BookingEditor } from '../schedule/BookingEditor'
import { ClientMergeModal } from './ClientMergeModal'
import { JournalLog } from '../../components/JournalLog'
import { SendMessageSheet } from '../../components/SendMessageSheet'
import { JournalEntryEditor } from '../../components/JournalEntryEditor'
import { ScreeningProofManager } from '../../components/ScreeningProofManager'
import { ProGate } from '../../components/ProGate'
import { isPro } from '../../components/planLimits'
import { screeningStatusColors, riskLevelColors, bookingStatusColors } from '../../types'
import type { Client, ScreeningStatus, Booking, JournalEntry } from '../../types'

interface ClientDetailProps {
  clientId: string
  onBack: () => void
  onOpenBooking: (bookingId: string) => void
  onShowPaywall?: () => void
}

export function ClientDetail({ clientId, onBack, onOpenBooking, onShowPaywall }: ClientDetailProps) {
  const client = useLiveQuery(() => db.clients.get(clientId), [clientId])
  const { bookings, allPayments } = useLiveQuery(async () => {
    const bks = await db.bookings.where('clientId').equals(clientId).toArray()
    const bIds = bks.map(b => b.id)
    const pays = bIds.length > 0
      ? await db.payments.where('bookingId').anyOf(bIds).toArray()
      : []
    return { bookings: bks, allPayments: pays }
  }, [clientId]) ?? { bookings: [], allPayments: [] }
  const [showEditor, setShowEditor] = useState(false)
  const [showBookingEditor, setShowBookingEditor] = useState(false)
  const [showRebook, setShowRebook] = useState(false)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const copyTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(copyTimerRef.current), [])
  const [showBlockConfirm, setShowBlockConfirm] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showMerge, setShowMerge] = useState(false)
  const [showMessageSheet, setShowMessageSheet] = useState(false)
  const [historyLimit, setHistoryLimit] = useState(10)
  useEffect(() => { setHistoryLimit(10) }, [clientId])
  const [journalEditEntry, setJournalEditEntry] = useState<{ entry?: JournalEntry; booking?: Booking } | null>(null)
  const [showNewActivity, setShowNewActivity] = useState(false)
  const [showUnblockConfirm, setShowUnblockConfirm] = useState(false)
  const { expanded, toggle } = useAccordion()

  // Allow Dexie time to resolve before showing "not found"
  const [settled, setSettled] = useState(false)
  useEffect(() => {
    setSettled(false)
    const timer = setTimeout(() => setSettled(true), 300)
    return () => clearTimeout(timer)
  }, [clientId])

  const completedBookings = useMemo(() => bookings
    .filter(b => b.status === 'Completed')
    .sort((a, b) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime()), [bookings])

  const lastCompletedBooking = completedBookings[0] ?? undefined

  // All terminal bookings for history display (Completed + Cancelled + No Show)
  const pastBookings = useMemo(() => bookings
    .filter(b => b.status === 'Completed' || b.status === 'Cancelled' || b.status === 'No Show')
    .sort((a, b) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime()), [bookings])

  const [detailNow, setDetailNow] = useState(() => new Date())
  useEffect(() => {
    const interval = setInterval(() => setDetailNow(new Date()), 60_000)
    return () => clearInterval(interval)
  }, [])
  const upcomingBookings = useMemo(() => bookings
    .filter(b => new Date(b.dateTime) > detailNow && b.status !== 'Cancelled' && b.status !== 'Completed' && b.status !== 'No Show')
    .sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime()), [bookings, detailNow])

  // Pre-build payment lookup to avoid O(n*m) nested filters
  const paymentsByBookingId = useMemo(() => {
    const map = new Map<string, number>()
    for (const p of allPayments) {
      if (p.label === 'Tip') continue
      map.set(p.bookingId, (map.get(p.bookingId) ?? 0) + p.amount)
    }
    return map
  }, [allPayments])

  const noShowCount = useMemo(() => bookings.filter(b => b.status === 'No Show').length, [bookings])
  const completedIds = useMemo(() => new Set(completedBookings.map(b => b.id)), [completedBookings])
  const totalRevenue = useMemo(() => allPayments
    .filter(p => completedIds.has(p.bookingId) && p.label !== 'Tip')
    .reduce((sum, p) => sum + p.amount, 0), [allPayments, completedIds])

  // Outstanding balance: sum of (total - paid) for Pending Deposit+ bookings
  const activeBookings = useMemo(() => bookings.filter(b => b.status === 'Pending Deposit' || b.status === 'Confirmed' || b.status === 'In Progress' || b.status === 'Completed'), [bookings])
  const outstandingBalance = useMemo(() => activeBookings.reduce((sum, b) => {
    const bTotal = bookingTotal(b)
    const bPaid = paymentsByBookingId.get(b.id) ?? 0
    const owing = bTotal - bPaid
    return sum + (owing > 0 ? owing : 0)
  }, 0), [activeBookings, paymentsByBookingId])

  // Visit frequency indicator
  const visitInterval = useMemo(() =>
    client ? computeClientInterval(completedBookings, client.lastSeen, detailNow) : null,
    [completedBookings, client?.lastSeen, detailNow])

  if (!client) {
    if (!settled) return null
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center" style={{ minHeight: '60vh' }}>
        <h2 className="text-lg font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Client not found</h2>
        <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>This client may have been deleted.</p>
        <button type="button"
          onClick={onBack}
          className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-purple-600 active:scale-[0.97]"
        >
          Go back
        </button>
      </div>
    )
  }

  function copyToClipboard(text: string, field: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedField(field)
    }).catch(() => {
      setCopiedField(field) // Still show visual feedback; clipboard may fail in insecure contexts
    })
    clearTimeout(copyTimerRef.current)
    copyTimerRef.current = setTimeout(() => setCopiedField(null), 1500)
  }

  async function togglePin() {
    if (!client) return
    await db.clients.update(clientId, { isPinned: !client.isPinned })
  }

  async function toggleBlock() {
    if (!client) return
    if (!client.isBlocked) {
      setShowBlockConfirm(true)
      return
    }
    setShowUnblockConfirm(true)
  }

  async function confirmUnblock() {
    await db.clients.update(clientId, { isBlocked: false })
    setShowUnblockConfirm(false)
  }

  async function confirmBlock() {
    await db.clients.update(clientId, { isBlocked: true })
    setShowBlockConfirm(false)
    onBack()
    showUndoToast(`Blocked ${client?.alias ?? 'client'}`, async () => {
      await db.clients.update(clientId, { isBlocked: false })
    })
  }

  async function confirmDelete() {
    if (deleting) return
    setDeleting(true)
    try {
      // Snapshot everything before deletion for undo
      const clientSnap = await db.clients.get(clientId)
      const bookingSnaps = await db.bookings.where('clientId').equals(clientId).toArray()
      const bookingIds = bookingSnaps.map(b => b.id)
      const paymentSnaps = bookingIds.length ? await db.payments.where('bookingId').anyOf(bookingIds).toArray() : []
      const txnSnaps = bookingIds.length ? await db.transactions.where('bookingId').anyOf(bookingIds).toArray() : []
      const checkSnaps = bookingIds.length ? await db.safetyChecks.where('bookingId').anyOf(bookingIds).toArray() : []
      const incidentSnaps = await db.incidents.where('clientId').equals(clientId).toArray()
      const journalSnaps = await db.journalEntries.where('clientId').equals(clientId).toArray()
      const screeningDocSnaps = await db.screeningDocs.where('clientId').equals(clientId).toArray()

      // Snapshot checklist items before delete
      const checklistSnaps = bookingIds.length ? await db.bookingChecklist.where('bookingId').anyOf(bookingIds).toArray() : []

      // Execute cascade delete atomically
      await db.transaction('rw', [db.clients, db.bookings, db.payments, db.transactions, db.safetyChecks, db.incidents, db.journalEntries, db.screeningDocs, db.bookingChecklist], async () => {
        for (const bid of bookingIds) {
          await db.payments.where('bookingId').equals(bid).delete()
          await db.transactions.where('bookingId').equals(bid).delete()
          await db.safetyChecks.where('bookingId').equals(bid).delete()
          await db.bookingChecklist.where('bookingId').equals(bid).delete()
        }
        await db.bookings.where('clientId').equals(clientId).delete()
        await db.incidents.where('clientId').equals(clientId).delete()
        await db.journalEntries.where('clientId').equals(clientId).delete()
        await db.screeningDocs.where('clientId').equals(clientId).delete()
        await db.clients.delete(clientId)
      })
      setShowDeleteConfirm(false)
      onBack()

      const alias = clientSnap?.alias ?? 'Client'
      showUndoToast(`Deleted ${alias}`, async () => {
        await db.transaction('rw', [db.clients, db.bookings, db.payments, db.transactions, db.safetyChecks, db.incidents, db.journalEntries, db.screeningDocs, db.bookingChecklist], async () => {
          if (clientSnap) await db.clients.put(clientSnap)
          if (bookingSnaps.length) await db.bookings.bulkPut(bookingSnaps)
          if (paymentSnaps.length) await db.payments.bulkPut(paymentSnaps)
          if (txnSnaps.length) await db.transactions.bulkPut(txnSnaps)
          if (checkSnaps.length) await db.safetyChecks.bulkPut(checkSnaps)
          if (incidentSnaps.length) await db.incidents.bulkPut(incidentSnaps)
          if (journalSnaps.length) await db.journalEntries.bulkPut(journalSnaps)
          if (screeningDocSnaps.length) await db.screeningDocs.bulkPut(screeningDocSnaps)
          if (checklistSnaps.length) await db.bookingChecklist.bulkPut(checklistSnaps)
        })
      })
    } catch (err) {
      showToast(`Delete failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
      setDeleting(false)
    }
  }

  return (
    <div className="pb-20">
      {/* Header */}
      <header
        className="sticky top-0 z-30 border-b backdrop-blur-xl header-frosted"
        style={{ borderColor: 'var(--border)', paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="flex items-center justify-between px-4 h-12 max-w-lg mx-auto">
          <button type="button" onClick={onBack} className="flex items-center gap-1 text-purple-500">
            <ArrowLeft size={18} />
            <span className="text-sm">Back</span>
          </button>
          <div className="flex items-center gap-2">
            <button type="button" onClick={togglePin} className="p-2" style={{ color: client.isPinned ? '#a855f7' : 'var(--text-secondary)' }}
              aria-label={client.isPinned ? 'Unpin client' : 'Pin client'}>
              {client.isPinned ? <PinOff size={18} /> : <Pin size={18} />}
            </button>
            <button type="button" onClick={() => setShowEditor(true)} className="p-2 text-purple-500"
              aria-label="Edit client">
              <Edit size={18} />
            </button>
          </div>
        </div>
      </header>

      <div className="px-4 py-4 max-w-lg mx-auto space-y-3">

        {/* ── COMPACT PROFILE HEADER ── */}
        <div className="flex items-start gap-3">
          <div className="w-14 h-14 rounded-full flex items-center justify-center shrink-0"
            style={{ backgroundColor: 'rgba(168,85,247,0.15)' }}>
            <span className="text-lg font-bold text-purple-500">{client.alias.slice(0, 2).toUpperCase()}</span>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold truncate" style={{ color: 'var(--text-primary)' }}>
              {client.nickname ?? client.alias}<VerifiedBadge client={client} size={16} />
            </h2>
            {client.nickname && client.nickname !== client.alias && (
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>({client.alias})</p>
            )}
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              <StatusBadge text={client.screeningStatus} color={screeningStatusColors[client.screeningStatus]} size="sm" />
              {client.riskLevel !== 'Unknown' && (
                <StatusBadge text={client.riskLevel} color={riskLevelColors[client.riskLevel]} size="sm" />
              )}
              {noShowCount > 0 && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-500">
                  {noShowCount} no-show{noShowCount !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Inline contact/address summary */}
        <div className="space-y-0.5 -mt-1 min-w-0">
          {client.phone && (
            <p className="text-xs flex items-center gap-1.5 min-w-0" style={{ color: 'var(--text-secondary)' }}>
              <Phone size={11} className="shrink-0" /> <span className="truncate">{client.phone}</span>
            </p>
          )}
          {client.email && (
            <p className="text-xs flex items-center gap-1.5 min-w-0" style={{ color: 'var(--text-secondary)' }}>
              <Mail size={11} className="shrink-0" /> <span className="truncate">{client.email}</span>
            </p>
          )}
          {client.address && (
            <p className="text-xs flex items-center gap-1.5 min-w-0" style={{ color: 'var(--text-secondary)' }}>
              <MapPin size={11} className="shrink-0" /> <span className="truncate">{client.address}</span>
            </p>
          )}
        </div>

        {/* Contact Action Bar */}
        <ContactActionBar client={client} />

        {/* Compact Stats Row */}
        <div className="flex items-center justify-between px-3 py-2.5 rounded-xl" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <div className="text-center flex-1">
            <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{completedBookings.length}</p>
            <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>Bookings</p>
          </div>
          <div className="w-px h-8" style={{ backgroundColor: 'var(--border)' }} />
          <div className="text-center flex-1">
            <p className="text-lg font-bold text-green-500">{formatCurrency(totalRevenue)}</p>
            <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>Revenue</p>
          </div>
          <div className="w-px h-8" style={{ backgroundColor: 'var(--border)' }} />
          <div className="text-center flex-1">
            <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
              {client.lastSeen ? fmtShortDate(new Date(client.lastSeen)) : '—'}
            </p>
            <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>Last Seen</p>
          </div>
        </div>

        {/* Visit Frequency */}
        {visitInterval && (
          <div className="flex items-center justify-center gap-1.5 -mt-1 mb-1">
            <UserCheck size={12} style={{ color: visitInterval.daysOverdue > 0 ? '#f97316' : 'var(--text-secondary)' }} />
            <p className="text-[11px]" style={{ color: visitInterval.daysOverdue > 0 ? '#f97316' : 'var(--text-secondary)' }}>
              Usually every ~{visitInterval.avgIntervalDays}d
              {visitInterval.daysOverdue > 0
                ? ` · ${visitInterval.daysOverdue}d overdue`
                : ` · next in ~${Math.abs(visitInterval.daysOverdue)}d`
              }
            </p>
          </div>
        )}

        {/* Outstanding Balance */}
        {outstandingBalance > 0 && (
          <Card>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase" style={{ color: 'var(--text-secondary)' }}>Outstanding Balance</p>
                <p className="text-lg font-bold text-orange-500 mt-0.5">{formatCurrency(outstandingBalance)}</p>
              </div>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-orange-500/15 text-orange-500">
                {(() => {
                  const count = activeBookings.filter(b => bookingTotal(b) - (paymentsByBookingId.get(b.id) ?? 0) > 0).length
                  return `${count} booking${count !== 1 ? 's' : ''}`
                })()}
              </span>
            </div>
          </Card>
        )}

        {/* ── SCREENING & RISK (always visible, interactive) ── */}
        <Card>
          <div className="flex items-center justify-between py-1">
            <span className="text-sm" style={{ color: 'var(--text-primary)' }}>Screening</span>
            <div className="flex items-center gap-2">
              {client.screeningMethod && (
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                  {client.screeningMethod}
                </span>
              )}
              <select
                value={client.screeningStatus}
                onChange={(e) => {
                  const newStatus = e.target.value as ScreeningStatus
                  const cid = client.id
                  const oldStatus = client.screeningStatus

                  // Run in a detached async context so React re-renders can't kill it
                  ;(async () => {
                    await db.clients.update(cid, { screeningStatus: newStatus })
                    await advanceBookingsOnScreen(cid, oldStatus, newStatus)
                    await downgradeBookingsOnUnscreen(cid, oldStatus, newStatus)
                  })().catch(() => showToast('Failed to update screening status'))
                }}
                className="text-sm font-semibold rounded-lg px-2 py-1 outline-none"
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  color: client.screeningStatus === 'Screened' ? '#22c55e' : client.screeningStatus === 'In Progress' ? '#3b82f6' : '#f59e0b',
                  border: 'none',
                }}
              >
                <option value="Unscreened">Unscreened</option>
                <option value="In Progress">In Progress</option>
                <option value="Screened">Screened</option>
              </select>
            </div>
          </div>

          {isPro() && <ScreeningProofManager clientId={clientId} />}

          <div className="py-2">
            <RiskLevelBar
              value={client.riskLevel}
              onChange={async (level) => {
                const wasForced = client.riskLevel === 'High Risk' || client.riskLevel === 'Unknown'
                const willForce = level === 'High Risk' || level === 'Unknown'
                const update: Partial<Pick<typeof client, 'riskLevel' | 'requiresSafetyCheck'>> = { riskLevel: level }
                // Auto-enable when entering forced tier; auto-disable only when leaving forced tier
                if (willForce) update.requiresSafetyCheck = true
                else if (wasForced) update.requiresSafetyCheck = false
                await db.clients.update(clientId, update)
              }}
            />
          </div>

          <div className="flex items-center justify-between py-1.5" style={{ borderTop: '1px solid var(--border)' }}>
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
                  <button type="button"
                    role="switch"
                    aria-checked={client.requiresSafetyCheck || forcedOn}
                    aria-label="Safety check-in"
                    onClick={async () => {
                      if (forcedOn) return
                      try {
                        await db.clients.update(clientId, { requiresSafetyCheck: !client.requiresSafetyCheck })
                      } catch {
                        showToast('Failed to update safety check setting')
                      }
                    }}
                    className={`w-10 h-6 rounded-full relative transition-colors ${
                      (client.requiresSafetyCheck || forcedOn) ? 'bg-green-500' : ''
                    } ${forcedOn ? 'opacity-60' : ''}`}
                    style={!(client.requiresSafetyCheck || forcedOn) ? { backgroundColor: 'var(--border)' } : undefined}
                  >
                    <div className="w-4 h-4 rounded-full bg-white absolute top-1 transition-transform"
                      style={{ transform: (client.requiresSafetyCheck || forcedOn) ? 'translateX(20px)' : 'translateX(4px)' }} />
                  </button>
                </div>
              )
            })()}
          </div>
        </Card>

        {/* ── BOOKING ACTIONS (always visible) ── */}
        {client.screeningStatus === 'Screened' ? (
          <div className="flex gap-2">
            <button type="button"
              onClick={() => setShowBookingEditor(true)}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white active:opacity-80 bg-purple-600"
            >
              <Plus size={16} /> New Booking
            </button>
            {lastCompletedBooking && (
              <button type="button"
                onClick={() => setShowRebook(true)}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold active:opacity-80"
                style={{ backgroundColor: 'rgba(168,85,247,0.15)', color: '#c084fc' }}
              >
                <RotateCcw size={14} /> Rebook
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2.5 p-3 rounded-xl"
            style={{ backgroundColor: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.15)' }}>
            <Shield size={16} className="text-orange-500 shrink-0" />
            <div className="flex-1">
              <p className="text-xs font-semibold text-orange-500">Screening required to book</p>
              <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                Set screening to Screened above to enable booking.
              </p>
            </div>
          </div>
        )}

        {/* Message Client */}
        <button type="button"
          onClick={() => setShowMessageSheet(true)}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold active:opacity-80"
          style={{ backgroundColor: 'rgba(59,130,246,0.12)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.2)' }}
        >
          <Send size={14} /> Message Client
        </button>

        {/* Upcoming Bookings (always visible if present) */}
        {upcomingBookings.length > 0 && (
          <Card>
            <p className="text-xs font-semibold uppercase mb-2" style={{ color: 'var(--text-secondary)' }}>Upcoming</p>
            {upcomingBookings.map(b => (
              <button type="button" key={b.id} onClick={() => onOpenBooking(b.id)}
                className="flex items-center justify-between py-2 w-full text-left">
                <div>
                  <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
                    {`${fmtShortDayDate(new Date(b.dateTime))} · ${fmtTime(new Date(b.dateTime))}`}
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

        {/* ══════════════════════════════════════════ */}
        {/* COLLAPSIBLE SECTIONS                      */}
        {/* ══════════════════════════════════════════ */}

        {/* Contact Details */}
        {(client.phone || client.email || client.telegram || client.signal || client.whatsapp) && (
          <CollapsibleCard label="Contact Details" id="contact" expanded={expanded} toggle={toggle}
            badge={<span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(168,85,247,0.15)', color: '#c084fc' }}>
              Pref: {client.preferredContact}
            </span>}>
            {client.secondaryContact && (
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full mb-2 inline-block"
                style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                Secondary: {client.secondaryContact}
              </span>
            )}
            {client.phone && <CopyRow icon={<Phone size={14} />} text={client.phone} field="phone" copiedField={copiedField} onCopy={copyToClipboard} />}
            {client.email && <CopyRow icon={<Mail size={14} />} text={client.email} field="email" copiedField={copiedField} onCopy={copyToClipboard} />}
            {client.telegram && <CopyRow icon={<span className="text-[10px] font-bold w-[14px] text-center">TG</span>} text={client.telegram} field="telegram" copiedField={copiedField} onCopy={copyToClipboard} />}
            {client.signal && <CopyRow icon={<span className="text-[10px] font-bold w-[14px] text-center">SG</span>} text={client.signal} field="signal" copiedField={copiedField} onCopy={copyToClipboard} />}
            {client.whatsapp && <CopyRow icon={<span className="text-[10px] font-bold w-[14px] text-center">WA</span>} text={client.whatsapp} field="whatsapp" copiedField={copiedField} onCopy={copyToClipboard} />}
          </CollapsibleCard>
        )}

        {/* Tags */}
        {client.tags.length > 0 && (
          <CollapsibleCard label="Tags" id="tags" expanded={expanded} toggle={toggle}
            preview={<div className="flex gap-1 flex-wrap">{client.tags.slice(0, 3).map(t => (
              <span key={t.id} className="text-[10px] px-1.5 py-0.5 rounded-full truncate max-w-[120px]" style={{ backgroundColor: `${t.color}25`, color: t.color }}>
                {t.icon}{t.name}
              </span>
            ))}{client.tags.length > 3 && <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>+{client.tags.length - 3}</span>}</div>}>
            <div className="flex flex-wrap gap-2">
              {client.tags.map(tag => (
                <span key={tag.id} className="text-xs px-2.5 py-1 rounded-full font-medium"
                  style={{ backgroundColor: `${tag.color}25`, color: tag.color }}>
                  {tag.icon && <span className="mr-1">{tag.icon}</span>}{tag.name}
                </span>
              ))}
            </div>
          </CollapsibleCard>
        )}

        {/* Dates & Details */}
        {(client.birthday || client.clientSince || client.referenceSource || client.verificationNotes) && (
          <CollapsibleCard label="Dates & Details" id="dates" expanded={expanded} toggle={toggle}>
            {client.birthday && (
              <div className="flex items-center gap-3 py-1.5">
                <Gift size={16} className="text-pink-500" />
                <span className="text-sm flex-1" style={{ color: 'var(--text-primary)' }}>Birthday</span>
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{fmtShortDate(new Date(client.birthday))}</span>
              </div>
            )}
            {client.clientSince && (
              <div className="flex items-center gap-3 py-1.5">
                <Heart size={16} className="text-purple-500" />
                <span className="text-sm flex-1" style={{ color: 'var(--text-primary)' }}>Client Since</span>
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{fmtMediumDate(new Date(client.clientSince))}</span>
              </div>
            )}
            {client.referenceSource && (
              <div className="flex items-center justify-between gap-3 py-1.5">
                <span className="text-sm shrink-0" style={{ color: 'var(--text-primary)' }}>Reference</span>
                <span className="text-sm truncate" style={{ color: 'var(--text-secondary)' }}>{client.referenceSource}</span>
              </div>
            )}
            {client.verificationNotes && (
              <div className="py-1.5">
                <p className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>Verification Notes</p>
                <p className="text-sm" style={{ color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>{client.verificationNotes}</p>
              </div>
            )}
          </CollapsibleCard>
        )}

        {/* Preferences & Boundaries */}
        {(client.preferences || client.boundaries) && (
          <CollapsibleCard label="Preferences & Boundaries" id="prefs" expanded={expanded} toggle={toggle}>
            {client.preferences && (
              <div className="flex gap-3 py-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{ backgroundColor: 'rgba(34,197,94,0.12)' }}>
                  <ThumbsUp size={15} style={{ color: '#22c55e' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: '#22c55e' }}>Likes & Preferences</p>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>{client.preferences}</p>
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
                  <p className="text-sm leading-relaxed" style={{ color: '#ef4444', whiteSpace: 'pre-wrap' }}>{client.boundaries}</p>
                </div>
              </div>
            )}
          </CollapsibleCard>
        )}

        {/* General Notes */}
        {client.notes && (
          <CollapsibleCard label="General Notes" id="notes" expanded={expanded} toggle={toggle}>
            <div className="flex gap-3 py-2">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                style={{ backgroundColor: 'rgba(168,85,247,0.12)' }}>
                <StickyNote size={15} style={{ color: '#a855f7' }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>{client.notes}</p>
              </div>
            </div>
          </CollapsibleCard>
        )}

        {/* Booking History */}
        {pastBookings.length > 0 && (
          <CollapsibleCard label={`History (${pastBookings.length})`} id="history" expanded={expanded} toggle={toggle}>
            {pastBookings.slice(0, historyLimit).map(b => (
              <button type="button" key={b.id} onClick={() => onOpenBooking(b.id)}
                className="flex items-center justify-between py-2 w-full text-left">
                <div>
                  <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{fmtMediumDate(new Date(b.dateTime))} · {fmtTime(new Date(b.dateTime))}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {bookingDurationFormatted(b.duration)} · {b.locationType}
                    </p>
                    {b.status !== 'Completed' && <StatusBadge text={b.status} color={bookingStatusColors[b.status]} />}
                  </div>
                </div>
                <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{formatCurrency(bookingTotal(b))}</span>
              </button>
            ))}
            {pastBookings.length > historyLimit && (
              <button type="button"
                onClick={() => setHistoryLimit(l => l + 50)}
                className="w-full text-center py-2 text-xs font-medium text-purple-500"
              >
                Show more ({pastBookings.length - historyLimit} remaining)
              </button>
            )}
          </CollapsibleCard>
        )}

        {/* Activity */}
        <CollapsibleCard label="Activity" id="journal" expanded={expanded} toggle={toggle}
          badge={isPro() ? (
            <button type="button"
              onClick={(e) => { e.stopPropagation(); setShowNewActivity(true) }}
              className="text-[10px] font-medium text-purple-500 active:opacity-70 ml-auto"
            >
              + Add
            </button>
          ) : undefined}>
          {isPro() ? (
            <JournalLog
              clientId={clientId}
              onEditEntry={(entry, booking) => setJournalEditEntry({ entry, booking })}
            />
          ) : (
            <ProGate feature="Activity Log" onUpgrade={onShowPaywall} inline />
          )}
        </CollapsibleCard>

        {/* Actions */}
        <CollapsibleCard label="Actions" id="actions" expanded={expanded} toggle={toggle}>
          <button type="button" onClick={toggleBlock}
            className={`w-full py-2 text-sm font-medium text-center ${client.isBlocked ? 'text-green-500' : 'text-red-500'}`}>
            {client.isBlocked ? 'Remove from Blacklist' : 'Blacklist Client'}
          </button>
          <div style={{ borderTop: '1px solid var(--border)' }} />
          <button type="button" onClick={() => setShowMerge(true)}
            className="w-full py-2 text-sm font-medium text-center flex items-center justify-center gap-2"
            style={{ color: '#a855f7' }}>
            <Merge size={14} /> Merge with Duplicate
          </button>
          <div style={{ borderTop: '1px solid var(--border)' }} />
          <button type="button" onClick={() => setShowDeleteConfirm(true)}
            aria-label="Delete client"
            className="w-full py-2 text-sm font-medium text-center flex items-center justify-center gap-2"
            style={{ color: '#ef4444' }}>
            <Trash2 size={14} /> Delete Client
          </button>
        </CollapsibleCard>
      </div>

      <ConfirmDialog
        isOpen={showBlockConfirm}
        title="Blacklist Client"
        message="Add this client to your blacklist? They will be hidden from your main client list and cannot be booked."
        confirmLabel="Blacklist"
        onConfirm={confirmBlock}
        onCancel={() => setShowBlockConfirm(false)}
      />
      <ConfirmDialog
        isOpen={showUnblockConfirm}
        title="Remove from Blacklist"
        message="Remove this client from your blacklist? They will appear in your main client list again."
        confirmLabel="Remove"
        onConfirm={confirmUnblock}
        onCancel={() => setShowUnblockConfirm(false)}
      />
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="Delete Client"
        message={`Delete ${client.alias} and all ${bookings.length} associated booking${bookings.length !== 1 ? 's' : ''}? You can undo this briefly after.`}
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
      <ClientEditor isOpen={showEditor} onClose={() => setShowEditor(false)} client={client} />
      <BookingEditor isOpen={showBookingEditor} onClose={() => setShowBookingEditor(false)} preselectedClientId={clientId} />
      <ClientMergeModal
        isOpen={showMerge}
        onClose={() => setShowMerge(false)}
        sourceClient={client}
        onMergeComplete={() => { setShowMerge(false); onBack() }}
      />
      {lastCompletedBooking && (
        <BookingEditor isOpen={showRebook} onClose={() => setShowRebook(false)} rebookFrom={lastCompletedBooking} />
      )}
      {journalEditEntry && (
        <JournalEntryEditor
          isOpen={!!journalEditEntry}
          onClose={() => setJournalEditEntry(null)}
          booking={journalEditEntry.booking}
          clientId={clientId}
          clientAlias={client.alias}
          existingEntry={journalEditEntry.entry}
        />
      )}
      <JournalEntryEditor
        isOpen={showNewActivity}
        onClose={() => setShowNewActivity(false)}
        clientId={clientId}
        clientAlias={client.alias}
      />
      <SendMessageSheet
        isOpen={showMessageSheet}
        onClose={() => setShowMessageSheet(false)}
        client={client}
      />
    </div>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Copy Row
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function CopyRow({ icon, text, field, copiedField, onCopy }: {
  icon: React.ReactNode
  text: string
  field: string
  copiedField: string | null
  onCopy: (text: string, field: string) => void
}) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span style={{ color: 'var(--text-secondary)' }}>{icon}</span>
      <span className="text-sm flex-1" style={{ color: 'var(--text-primary)' }}>{text}</span>
      <button type="button" onClick={() => onCopy(text, field)} className="p-1.5 rounded-lg"
        aria-label={`Copy ${field}`}
        style={{ color: copiedField === field ? '#22c55e' : 'var(--text-secondary)' }}>
        {copiedField === field ? <Check size={14} /> : <Copy size={14} />}
      </button>
    </div>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Contact Action Bar
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function cleanPhone(phone: string): string {
  return phone.replace(/[^\d+]/g, '')
}

function ContactActionBar({ client }: { client: Client }) {
  const phone = client.phone ? cleanPhone(client.phone) : null
  const pref = client.preferredContact

  type Action = { label: string; icon: React.ReactNode; href: string; bg: string; fg: string; preferred?: boolean; fallback?: boolean }
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
  }

  // WhatsApp — use dedicated field, fall back to phone
  const waNumber = client.whatsapp ? cleanPhone(client.whatsapp) : phone
  const waFallback = !client.whatsapp && !!phone
  if (waNumber) {
    actions.push({
      label: 'WhatsApp',
      icon: <span className="text-xs font-bold">WA</span>,
      href: `https://wa.me/${waNumber.replace(/^\+/, '')}`,
      bg: 'rgba(37,211,102,0.15)', fg: '#25d366',
      preferred: pref === 'WhatsApp',
      fallback: waFallback,
    })
  }

  // Telegram — use dedicated field, fall back to phone via tg://resolve?phone=
  const tgHandle = client.telegram || null
  const tgFallback = !client.telegram && !!phone
  const tgLink = tgHandle
    ? (tgHandle.startsWith('@') ? `https://t.me/${tgHandle.slice(1)}` : `https://t.me/${tgHandle}`)
    : phone ? `tg://resolve?phone=${phone.replace(/\D/g, '')}` : null
  if (tgLink) {
    actions.push({
      label: 'Telegram',
      icon: <span className="text-xs font-bold">TG</span>,
      href: tgLink,
      bg: 'rgba(0,136,204,0.15)', fg: '#0088cc',
      preferred: pref === 'Telegram',
      fallback: tgFallback,
    })
  }

  // Signal — use dedicated field, fall back to phone
  const sigNumber = client.signal ? cleanPhone(client.signal) : phone
  const sgFallback = !client.signal && !!phone
  if (sigNumber) {
    actions.push({
      label: 'Signal',
      icon: <span className="text-xs font-bold">SG</span>,
      href: `https://signal.me/#p/${sigNumber}`,
      bg: 'rgba(59,120,246,0.15)', fg: '#3a76f0',
      preferred: pref === 'Signal',
      fallback: sgFallback,
    })
  }

  if (client.email) {
    actions.push({
      label: 'Email',
      icon: <Mail size={18} />,
      href: `mailto:${client.email}`,
      bg: 'rgba(168,85,247,0.15)', fg: '#c084fc',
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
          aria-label={a.label}
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
              opacity: a.fallback ? 0.5 : 1,
            }}
          >
            {a.icon}
          </div>
          <span className="text-[10px]" style={{ color: a.preferred ? a.fg : 'var(--text-secondary)', opacity: a.fallback ? 0.5 : 1 }}>
            {a.label}
          </span>
          {a.preferred && !a.fallback && (
            <span className="text-[8px] font-semibold" style={{ color: a.fg, marginTop: '-2px' }}>
              PREFERRED
            </span>
          )}
          {a.fallback && (
            <span className="text-[8px]" style={{ color: 'var(--text-secondary)', marginTop: '-2px' }}>
              via phone
            </span>
          )}
        </a>
      ))}
    </div>
  )
}
