import { useLiveQuery } from 'dexie-react-hooks'
import {
  Plus, ShieldCheck, ShieldAlert, UserPlus, AlertTriangle,
  Phone, CheckCircle, XCircle, Clock, Siren, Edit2, Ban, Download
} from 'lucide-react'
import { useState } from 'react'
import { fmtDateAndTime, fmtMediumDate } from '../../utils/dateFormat'
import { db } from '../../db'
import { PageHeader } from '../../components/PageHeader'
import { Card } from '../../components/Card'
import { EmptyState } from '../../components/EmptyState'
import { SafetyContactEditor } from './SafetyContactEditor'
import { IncidentEditor } from './IncidentEditor'
import { SafetyCheckEditor } from './SafetyCheckEditor'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { showToast, showUndoToast } from '../../components/Toast'
import { SafetyPageSkeleton } from '../../components/Skeleton'
import type { SafetyCheckStatus, SafetyCheck } from '../../types'

const statusLabel: Record<SafetyCheckStatus, string> = {
  'pending': 'Pending',
  'checkedIn': 'Checked In',
  'overdue': 'Overdue',
  'alert': 'Alert Sent',
}

const statusIcon: Record<SafetyCheckStatus, React.ReactNode> = {
  'pending': <Clock size={18} className="text-orange-500" />,
  'checkedIn': <CheckCircle size={18} className="text-green-500" />,
  'overdue': <AlertTriangle size={18} className="text-red-500" />,
  'alert': <Siren size={18} className="text-red-500" />,
}

const statusColor: Record<SafetyCheckStatus, string> = {
  'pending': '#f59e0b',
  'checkedIn': '#22c55e',
  'overdue': '#ef4444',
  'alert': '#ef4444',
}

export function SafetyPage() {
  const [tab, setTab] = useState<'checkins' | 'contacts' | 'incidents' | 'blacklist'>('checkins')
  const [showContactEditor, setShowContactEditor] = useState(false)
  const [showIncidentEditor, setShowIncidentEditor] = useState(false)
  const [editingCheck, setEditingCheck] = useState<SafetyCheck | null>(null)
  const [blacklistConfirm, setBlacklistConfirm] = useState<{ clientId: string; alias: string } | null>(null)
  

  const safetyChecks = useLiveQuery(() => db.safetyChecks.orderBy('scheduledTime').reverse().toArray())
  const bookings = useLiveQuery(() => db.bookings.toArray()) ?? []
  const clients = useLiveQuery(() => db.clients.toArray()) ?? []
  const contacts = useLiveQuery(() => db.safetyContacts.toArray()) ?? []
  const incidents = useLiveQuery(() => db.incidents.orderBy('date').reverse().toArray()) ?? []
  if (safetyChecks === undefined) return <SafetyPageSkeleton />

  const pendingChecks = safetyChecks.filter(c => c.status === 'pending' || c.status === 'overdue')
  const overdueChecks = safetyChecks.filter(c => c.status === 'overdue')
  const blacklistedClients = clients.filter(c => c.isBlocked)

  const bookingFor = (id: string) => bookings.find(b => b.id === id)
  const clientFor = (id?: string) => clients.find(c => c.id === id)
  const contactFor = (id?: string) => contacts.find(c => c.id === id)
  const primaryContact = contacts.find(c => c.isPrimary) ?? contacts[0]

  async function checkIn(checkId: string) {
    await db.safetyChecks.update(checkId, {
      status: 'checkedIn' as SafetyCheckStatus,
      checkedInAt: new Date(),
    })
    showToast('Checked in safely')
  }

  async function checkInAll() {
    for (const c of pendingChecks) {
      await db.safetyChecks.update(c.id, {
        status: 'checkedIn' as SafetyCheckStatus,
        checkedInAt: new Date(),
      })
    }
    showToast(`${pendingChecks.length} check-in${pendingChecks.length > 1 ? 's' : ''} confirmed`)
  }

  // Build the sms: URI — iOS wants sms:[phone]&body=[text], Android wants sms:[phone]?body=[text].
  // The & separator works on both modern iOS and Android; ? only works on Android.
  function smsHref(phone: string, body: string): string {
    return `sms:${phone}&body=${encodeURIComponent(body)}`
  }

  function buildAlertMessage(check: SafetyCheck): string {
    const booking = bookingFor(check.bookingId)
    const client = booking?.clientId ? clientFor(booking.clientId) : undefined
    const parts: string[] = ['⚠️ SAFETY ALERT — I need help. Please check on me immediately.']
    if (client) parts.push(`Client: ${client.alias}`)
    if (booking?.locationAddress) parts.push(`Location: ${booking.locationAddress}`)
    else if (booking?.locationType) parts.push(`Location type: ${booking.locationType}`)
    if (booking?.dateTime) parts.push(`Scheduled: ${fmtDateAndTime(new Date(booking.dateTime))}`)
    return parts.join('\n')
  }

  async function sendAlert(checkId: string) {
    const check = safetyChecks!.find(c => c.id === checkId)
    if (!check) return

    await db.safetyChecks.update(checkId, { status: 'alert' as SafetyCheckStatus })

    // Use the contact assigned to this specific check, fall back to primary
    const alertContact = contactFor(check.safetyContactId) ?? primaryContact
    if (alertContact) {
      const body = buildAlertMessage(check)
      // Use <a> click instead of window.open — works in PWA standalone mode
      const a = document.createElement('a')
      a.href = smsHref(alertContact.phone, body)
      a.click()
      showToast(`SMS opened — tap Send to alert ${alertContact.name}`, 'error')
    } else {
      showToast('Alert status set — add a safety contact to enable SMS', 'error')
    }
  }

  async function sendAlertAll() {
    for (const c of pendingChecks) {
      await db.safetyChecks.update(c.id, { status: 'alert' as SafetyCheckStatus })
    }

    // Deduplicate contacts across all pending checks — notify each unique contact once
    const contactsToNotify = new Map<string, { phone: string; name: string; checks: typeof pendingChecks }>()
    for (const check of pendingChecks) {
      const contact = contactFor(check.safetyContactId) ?? primaryContact
      if (!contact) continue
      if (!contactsToNotify.has(contact.id)) {
        contactsToNotify.set(contact.id, { phone: contact.phone, name: contact.name, checks: [] })
      }
      contactsToNotify.get(contact.id)!.checks.push(check)
    }

    if (contactsToNotify.size === 0) {
      showToast('Alert status set — add a safety contact to enable SMS', 'error')
      return
    }

    // Open one SMS per unique contact, each with their relevant check details
    contactsToNotify.forEach(({ phone, checks }) => {
      const lines = ['⚠️ SAFETY ALERT — I need help. Please check on me immediately.']
      checks.forEach(check => {
        const booking = bookingFor(check.bookingId)
        const client = booking?.clientId ? clientFor(booking.clientId) : undefined
        if (client) lines.push(`• Client: ${client.alias}`)
        if (booking?.locationAddress) lines.push(`  Location: ${booking.locationAddress}`)
      })
      const a = document.createElement('a')
      a.href = smsHref(phone, lines.join('\n'))
      a.click()
    })

    const names = [...contactsToNotify.values()].map(c => c.name).join(', ')
    showToast(`SMS opened — tap Send to alert ${names}`, 'error')
  }

  const tabs = [
    { id: 'checkins' as const, label: 'Check-ins', count: pendingChecks.length },
    { id: 'contacts' as const, label: 'Contacts', count: contacts.length },
    { id: 'incidents' as const, label: 'Incidents', count: incidents.length },
    { id: 'blacklist' as const, label: 'Blacklist', count: blacklistedClients.length },
  ]

  async function exportBlacklist() {
    const rows = blacklistedClients.map(c => ({
      Name: c.alias,
      Phone: c.phone ?? '',
      Email: c.email ?? '',
      'Risk Level': c.riskLevel,
      'Date Added': c.dateAdded ? new Date(c.dateAdded).toISOString().slice(0, 10) : '',
    }))
    // Simple CSV export
    if (rows.length === 0) { showToast('No blacklisted clients to export'); return }
    const headers = Object.keys(rows[0])
    const csv = [
      headers.join(','),
      ...rows.map(r => headers.map(h => `"${String((r as any)[h]).replace(/"/g, '""')}"`).join(','))
    ].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `blacklist-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    showToast(`Exported ${rows.length} blacklisted client${rows.length !== 1 ? 's' : ''}`)
  }

  return (
    <div className="pb-20">
      <div>
      <PageHeader title="Safety">
        {tab === 'contacts' && (
          <button onClick={() => setShowContactEditor(true)} className="p-2 rounded-lg text-purple-500">
            <Plus size={20} />
          </button>
        )}
        {tab === 'incidents' && (
          <button onClick={() => setShowIncidentEditor(true)} className="p-2 rounded-lg text-purple-500">
            <Plus size={20} />
          </button>
        )}
        {tab === 'blacklist' && blacklistedClients.length > 0 && (
          <button onClick={exportBlacklist} className="p-2 rounded-lg" style={{ color: 'var(--text-secondary)' }}>
            <Download size={18} />
          </button>
        )}
      </PageHeader>
      </div>

      <div className="max-w-lg mx-auto">
        {/* Overdue Banner */}
        {overdueChecks.length > 0 && (
          <div className="mx-4 mt-3 rounded-xl p-4" style={{ backgroundColor: 'rgba(239,68,68,0.15)' }}>
            <div className="flex items-center gap-2 mb-3">
              <ShieldAlert size={20} className="text-red-500" />
              <span className="font-bold text-sm text-red-500">
                {overdueChecks.length} OVERDUE CHECK-IN{overdueChecks.length > 1 ? 'S' : ''}
              </span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={checkInAll}
                className="flex-1 py-2 px-3 rounded-lg bg-green-600 text-white font-semibold text-sm flex items-center justify-center gap-2"
              >
                <CheckCircle size={16} /> I'm OK
              </button>
              <button
                onClick={sendAlertAll}
                className="flex-1 py-2 px-3 rounded-lg bg-red-600 text-white font-semibold text-sm flex items-center justify-center gap-2"
              >
                <XCircle size={16} /> Not OK
              </button>
            </div>
            {primaryContact && (
              <p className="text-[10px] text-red-400 text-center mt-2">
                "Not OK" opens your SMS app pre-filled — tap Send to alert {primaryContact.name}
              </p>
            )}
            {!primaryContact && (
              <p className="text-[10px] text-red-400 text-center mt-2">
                Add a safety contact to enable emergency alerts
              </p>
            )}
          </div>
        )}

        {/* Tab Selector */}
        <div className="flex gap-1 mx-4 mt-3 p-1 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)' }}>
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 py-2 px-3 rounded-md text-xs font-medium transition-colors ${
                tab === t.id ? 'bg-purple-600 text-white' : ''
              }`}
              style={tab !== t.id ? { color: 'var(--text-secondary)' } : {}}
            >
              {t.label} {t.count > 0 && `(${t.count})`}
            </button>
          ))}
        </div>

        <div className="px-4 py-3">
          {tab === 'checkins' && (
            safetyChecks.length === 0 ? (
              <EmptyState
                icon={<ShieldCheck size={40} />}
                title="No check-ins"
                description="Safety check-ins are created automatically when bookings with safety enabled go In Progress"
              />
            ) : (
              <div className="space-y-2">
                {safetyChecks.slice(0, 30).map(check => {
                  const booking = bookingFor(check.bookingId)
                  const client = booking?.clientId ? clientFor(booking.clientId) : undefined
                  const contact = contactFor(check.safetyContactId)
                  const isPending = check.status === 'pending' || check.status === 'overdue'

                  return (
                    <Card key={check.id}>
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 shrink-0">{statusIcon[check.status]}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span
                              className="text-xs font-bold uppercase px-1.5 py-0.5 rounded"
                              style={{
                                backgroundColor: `${statusColor[check.status]}20`,
                                color: statusColor[check.status],
                              }}
                            >
                              {statusLabel[check.status]}
                            </span>
                            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                              {fmtDateAndTime(new Date(check.scheduledTime))}
                            </span>
                            <button
                              onClick={() => setEditingCheck(check)}
                              className="ml-auto p-1 rounded opacity-50 active:opacity-100"
                              style={{ color: 'var(--text-secondary)' }}
                              aria-label="Edit safety check"
                            >
                              <Edit2 size={13} />
                            </button>
                          </div>
                          {client && (
                            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                              {client.alias}
                            </p>
                          )}
                          {booking && (
                            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                              Booking: {fmtDateAndTime(new Date(booking.dateTime))} · {booking.locationType}
                            </p>
                          )}
                          {contact && (
                            <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                              Contact: {contact.name}
                            </p>
                          )}
                          {check.checkedInAt && (
                            <p className="text-[10px] mt-0.5 text-green-500">
                              Checked in at {fmtDateAndTime(new Date(check.checkedInAt))}
                            </p>
                          )}
                          {/* Actions for pending/overdue */}
                          {isPending && (
                            <div className="flex gap-2 mt-2 flex-wrap">
                              <button
                                onClick={() => checkIn(check.id)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-600 text-white"
                              >
                                <CheckCircle size={12} /> I'm Safe
                              </button>
                              <button
                                onClick={() => sendAlert(check.id)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-600 text-white"
                              >
                                <Siren size={12} /> Send Alert
                              </button>
                              {(contactFor(check.safetyContactId) ?? primaryContact) && (
                                <a
                                  href={`tel:${(contactFor(check.safetyContactId) ?? primaryContact)!.phone}`}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
                                  style={{ backgroundColor: '#16a34a' }}
                                >
                                  <Phone size={12} /> Call {(contactFor(check.safetyContactId) ?? primaryContact)!.name}
                                </a>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </Card>
                  )
                })}
              </div>
            )
          )}

          {tab === 'contacts' && (
            contacts.length === 0 ? (
              <EmptyState
                icon={<UserPlus size={40} />}
                title="No safety contacts"
                description="Add a trusted contact who will receive your check-in messages"
              />
            ) : (
              <div className="space-y-2">
                {contacts.map(contact => (
                  <Card key={contact.id}>
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: 'rgba(168,85,247,0.15)' }}
                      >
                        <span className="text-sm font-bold text-purple-500">
                          {contact.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                            {contact.name}
                          </p>
                          {contact.isPrimary && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-500 font-medium">
                              Primary
                            </span>
                          )}
                        </div>
                        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                          {contact.phone}
                        </p>
                      </div>
                    <div className="flex items-center gap-2">
                      <a href={`tel:${contact.phone}`}>
                        <Phone size={18} className="text-green-500" />
                      </a>
                      <button
                        onClick={async () => {
                          const snap = await db.safetyContacts.get(contact.id)
                          await db.safetyContacts.delete(contact.id)
                          showUndoToast(`Removed ${contact.name}`, async () => {
                            if (snap) await db.safetyContacts.put(snap)
                          })
                        }}
                        className="p-1"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        <XCircle size={16} />
                      </button>
                    </div>
                    </div>
                  </Card>
                ))}
              </div>
            )
          )}

          {tab === 'incidents' && (
            incidents.length === 0 ? (
              <EmptyState
                icon={<AlertTriangle size={40} />}
                title="No incidents"
                description="Incident logs will appear here if you record any"
              />
            ) : (
              <div className="space-y-2">
                {incidents.map(incident => {
                  const linkedClient = incident.clientId ? clientFor(incident.clientId) : undefined
                  const isBlacklisted = linkedClient?.isBlocked
                  return (
                    <Card key={incident.id}>
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-xs font-semibold capitalize ${
                          incident.severity === 'critical' || incident.severity === 'high'
                            ? 'text-red-500'
                            : incident.severity === 'medium' ? 'text-orange-500' : 'text-yellow-500'
                        }`}>
                          {incident.severity} severity
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                            {fmtMediumDate(new Date(incident.date))}
                          </span>
                          <button
                            onClick={async () => {
                              const snap = await db.incidents.get(incident.id)
                              await db.incidents.delete(incident.id)
                              showUndoToast('Incident deleted', async () => {
                                if (snap) await db.incidents.put(snap)
                              })
                            }}
                            className="p-1"
                            style={{ color: 'var(--text-secondary)' }}
                          >
                            <XCircle size={14} />
                          </button>
                        </div>
                      </div>
                      <p className="text-sm" style={{ color: 'var(--text-primary)', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {incident.description}
                      </p>
                      {linkedClient && (
                        <div className="flex items-center justify-between mt-2">
                          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                            Client: {linkedClient.alias}
                          </p>
                          {isBlacklisted ? (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-500/15 text-red-500">
                              Blacklisted
                            </span>
                          ) : (
                            <button
                              onClick={() => setBlacklistConfirm({ clientId: linkedClient.id, alias: linkedClient.alias })}
                              className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full active:opacity-70"
                              style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444' }}
                            >
                              <Ban size={10} /> Blacklist
                            </button>
                          )}
                        </div>
                      )}
                      {incident.actionTaken && (
                        <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                          Action: {incident.actionTaken}
                        </p>
                      )}
                    </Card>
                  )
                })}
              </div>
            )
          )}

          {tab === 'blacklist' && (
            blacklistedClients.length === 0 ? (
              <EmptyState
                icon={<Ban size={40} />}
                title="No blacklisted clients"
                description="Clients you blacklist will appear here"
              />
            ) : (
              <div className="space-y-2">
                {blacklistedClients.map(client => {
                  const clientIncidents = incidents.filter(i => i.clientId === client.id)
                  return (
                    <Card key={client.id}>
                      <div className="flex items-center gap-3">
                        <div
                          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: 'rgba(239,68,68,0.15)' }}
                        >
                          <span className="text-sm font-bold text-red-500">
                            {client.alias.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                            {client.alias}
                          </p>
                          <div className="flex items-center gap-2 flex-wrap">
                            {client.phone && (
                              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{client.phone}</p>
                            )}
                            {clientIncidents.length > 0 && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-500 font-medium">
                                {clientIncidents.length} incident{clientIncidents.length !== 1 ? 's' : ''}
                              </span>
                            )}
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                              client.riskLevel === 'High Risk' ? 'bg-red-500/15 text-red-500'
                                : client.riskLevel === 'Medium Risk' ? 'bg-orange-500/15 text-orange-500'
                                : 'bg-gray-500/15 text-gray-400'
                            }`}>
                              {client.riskLevel}
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={async () => {
                            await db.clients.update(client.id, { isBlocked: false })
                            showUndoToast(`${client.alias} removed from blacklist`, async () => {
                              await db.clients.update(client.id, { isBlocked: true })
                            })
                          }}
                          className="text-[10px] font-semibold px-2.5 py-1 rounded-full flex-shrink-0 active:opacity-70"
                          style={{ backgroundColor: 'rgba(34,197,94,0.1)', color: '#22c55e' }}
                        >
                          Remove
                        </button>
                      </div>
                    </Card>
                  )
                })}
              </div>
            )
          )}
        </div>
      </div>

      <SafetyContactEditor isOpen={showContactEditor} onClose={() => setShowContactEditor(false)} />
      <IncidentEditor isOpen={showIncidentEditor} onClose={() => setShowIncidentEditor(false)} />
      {editingCheck && (
        <SafetyCheckEditor
          isOpen={!!editingCheck}
          onClose={() => setEditingCheck(null)}
          check={editingCheck}
        />
      )}
      <ConfirmDialog
        isOpen={!!blacklistConfirm}
        title="Blacklist Client"
        message={`Add ${blacklistConfirm?.alias ?? 'this client'} to your blacklist? They will be hidden from your main client list and cannot be booked.`}
        confirmLabel="Blacklist"
        onConfirm={async () => {
          if (blacklistConfirm) {
            await db.clients.update(blacklistConfirm.clientId, { isBlocked: true })
            showToast(`${blacklistConfirm.alias} blacklisted`)
          }
          setBlacklistConfirm(null)
        }}
        onCancel={() => setBlacklistConfirm(null)}
      />
    </div>
  )
}
