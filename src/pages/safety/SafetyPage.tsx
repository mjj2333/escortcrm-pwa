import { useLiveQuery } from 'dexie-react-hooks'
import {
  Plus, ShieldCheck, ShieldAlert, UserPlus, AlertTriangle,
  Phone, CheckCircle, XCircle, Clock, Siren
} from 'lucide-react'
import { useState } from 'react'
import { format } from 'date-fns'
import { db } from '../../db'
import { PageHeader } from '../../components/PageHeader'
import { Card } from '../../components/Card'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { EmptyState } from '../../components/EmptyState'
import { SafetyContactEditor } from './SafetyContactEditor'
import { IncidentEditor } from './IncidentEditor'
import { showToast } from '../../components/Toast'
import type { SafetyCheckStatus } from '../../types'

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
  const [tab, setTab] = useState<'checkins' | 'contacts' | 'incidents'>('checkins')
  const [showContactEditor, setShowContactEditor] = useState(false)
  const [showIncidentEditor, setShowIncidentEditor] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'contact' | 'incident'; id: string; name: string } | null>(null)

  const safetyChecks = useLiveQuery(() => db.safetyChecks.orderBy('scheduledTime').reverse().toArray()) ?? []
  const bookings = useLiveQuery(() => db.bookings.toArray()) ?? []
  const clients = useLiveQuery(() => db.clients.toArray()) ?? []
  const contacts = useLiveQuery(() => db.safetyContacts.toArray()) ?? []
  const incidents = useLiveQuery(() => db.incidents.orderBy('date').reverse().toArray()) ?? []

  const pendingChecks = safetyChecks.filter(c => c.status === 'pending' || c.status === 'overdue')
  const overdueChecks = safetyChecks.filter(c => c.status === 'overdue')

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

  async function sendAlert(checkId: string) {
    await db.safetyChecks.update(checkId, {
      status: 'alert' as SafetyCheckStatus,
    })
    // Open SMS/call to primary contact
    if (primaryContact) {
      const booking = bookingFor(safetyChecks.find(c => c.id === checkId)?.bookingId ?? '')
      const clientName = booking?.clientId ? clientFor(booking.clientId)?.alias : 'Unknown'
      const smsBody = encodeURIComponent(
        `SAFETY ALERT: I need help. My last check-in was missed. Client: ${clientName}. Please check on me.`
      )
      window.open(`sms:${primaryContact.phone}?body=${smsBody}`, '_blank')
    }
    showToast('Alert status set', 'error')
  }

  async function sendAlertAll() {
    for (const c of pendingChecks) {
      await db.safetyChecks.update(c.id, { status: 'alert' as SafetyCheckStatus })
    }
    if (primaryContact) {
      const smsBody = encodeURIComponent(
        `SAFETY ALERT: I need help. I have ${pendingChecks.length} missed check-in(s). Please check on me immediately.`
      )
      window.open(`sms:${primaryContact.phone}?body=${smsBody}`, '_blank')
    }
    showToast('Alert sent to emergency contact', 'error')
  }

  const tabs = [
    { id: 'checkins' as const, label: 'Check-ins', count: pendingChecks.length },
    { id: 'contacts' as const, label: 'Contacts', count: contacts.length },
    { id: 'incidents' as const, label: 'Incidents', count: incidents.length },
  ]

  return (
    <div className="pb-20">
      <PageHeader title="Safety">
        <button
          onClick={() => {
            if (tab === 'contacts') setShowContactEditor(true)
            else if (tab === 'incidents') setShowIncidentEditor(true)
          }}
          className="p-2 rounded-lg text-purple-500"
        >
          <Plus size={20} />
        </button>
      </PageHeader>

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
                "Not OK" will text {primaryContact.name} ({primaryContact.phone})
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
                tab === t.id ? 'bg-purple-500 text-white' : ''
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
                              {format(new Date(check.scheduledTime), 'MMM d, h:mm a')}
                            </span>
                          </div>
                          {client && (
                            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                              {client.alias}
                            </p>
                          )}
                          {booking && (
                            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                              Booking: {format(new Date(booking.dateTime), 'h:mm a')} · {booking.locationType}
                            </p>
                          )}
                          {contact && (
                            <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                              Contact: {contact.name}
                            </p>
                          )}
                          {check.checkedInAt && (
                            <p className="text-[10px] mt-0.5 text-green-500">
                              Checked in at {format(new Date(check.checkedInAt), 'h:mm a')}
                            </p>
                          )}
                          {/* Actions for pending/overdue */}
                          {isPending && (
                            <div className="flex gap-2 mt-2">
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
                          {contact.phone} · {contact.relationship}
                        </p>
                      </div>
                    <div className="flex items-center gap-2">
                      <a href={`tel:${contact.phone}`}>
                        <Phone size={18} className="text-green-500" />
                      </a>
                      <button
                        onClick={() => setDeleteTarget({ type: 'contact', id: contact.id, name: contact.name })}
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
                {incidents.map(incident => (
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
                          {format(new Date(incident.date), 'MMM d, yyyy')}
                        </span>
                        <button
                          onClick={() => setDeleteTarget({ type: 'incident', id: incident.id, name: 'this incident' })}
                          className="p-1"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          <XCircle size={14} />
                        </button>
                      </div>
                    </div>
                    <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
                      {incident.description}
                    </p>
                    {incident.clientId && clientFor(incident.clientId) && (
                      <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                        Client: {clientFor(incident.clientId)!.alias}
                      </p>
                    )}
                    {incident.actionTaken && (
                      <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                        Action: {incident.actionTaken}
                      </p>
                    )}
                  </Card>
                ))}
              </div>
            )
          )}
        </div>
      </div>

      <SafetyContactEditor isOpen={showContactEditor} onClose={() => setShowContactEditor(false)} />
      <IncidentEditor isOpen={showIncidentEditor} onClose={() => setShowIncidentEditor(false)} />
      <ConfirmDialog
        isOpen={!!deleteTarget}
        title={deleteTarget?.type === 'contact' ? 'Remove Contact' : 'Delete Incident'}
        message={deleteTarget?.type === 'contact'
          ? `Remove ${deleteTarget?.name ?? ''}?`
          : 'Delete this incident log?'}
        confirmLabel="Delete"
        onConfirm={async () => {
          if (deleteTarget?.type === 'contact') await db.safetyContacts.delete(deleteTarget.id)
          else if (deleteTarget?.type === 'incident') await db.incidents.delete(deleteTarget!.id)
          setDeleteTarget(null)
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
