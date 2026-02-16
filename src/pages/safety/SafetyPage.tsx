import { useLiveQuery } from 'dexie-react-hooks'
import {
  Plus, ShieldCheck, ShieldAlert, UserPlus, AlertTriangle,
  Phone, CheckCircle, XCircle, Clock
} from 'lucide-react'
import { useState } from 'react'
import { format } from 'date-fns'
import { db } from '../../db'
import { PageHeader } from '../../components/PageHeader'
import { Card } from '../../components/Card'
import { EmptyState } from '../../components/EmptyState'
import { SafetyContactEditor } from './SafetyContactEditor'
import { IncidentEditor } from './IncidentEditor'

export function SafetyPage() {
  const [tab, setTab] = useState<'checkins' | 'contacts' | 'incidents'>('checkins')
  const [showContactEditor, setShowContactEditor] = useState(false)
  const [showIncidentEditor, setShowIncidentEditor] = useState(false)

  const safetyChecks = useLiveQuery(() => db.safetyChecks.orderBy('scheduledTime').reverse().toArray()) ?? []
  const contacts = useLiveQuery(() => db.safetyContacts.toArray()) ?? []
  const incidents = useLiveQuery(() => db.incidents.orderBy('date').reverse().toArray()) ?? []

  const pendingChecks = safetyChecks.filter(c => c.status === 'pending')
  const overdueChecks = pendingChecks.filter(c => new Date(c.scheduledTime) < new Date())

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
              <button className="flex-1 py-2 px-3 rounded-lg bg-green-600 text-white font-semibold text-sm flex items-center justify-center gap-2">
                <CheckCircle size={16} /> I'm OK
              </button>
              <button className="flex-1 py-2 px-3 rounded-lg bg-red-600 text-white font-semibold text-sm flex items-center justify-center gap-2">
                <XCircle size={16} /> Not OK
              </button>
            </div>
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
                description="Safety check-ins will appear here when you have confirmed bookings"
              />
            ) : (
              <div className="space-y-2">
                {safetyChecks.slice(0, 20).map(check => (
                  <Card key={check.id}>
                    <div className="flex items-center gap-3">
                      {check.status === 'pending' ? (
                        <Clock size={20} className="text-orange-500 shrink-0" />
                      ) : check.status === 'checkedIn' ? (
                        <CheckCircle size={20} className="text-green-500 shrink-0" />
                      ) : (
                        <AlertTriangle size={20} className="text-red-500 shrink-0" />
                      )}
                      <div className="flex-1">
                        <p className="text-sm font-medium capitalize" style={{ color: 'var(--text-primary)' }}>
                          {check.status === 'checkedIn' ? 'Checked In' : check.status}
                        </p>
                        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                          {format(new Date(check.scheduledTime), 'MMM d, h:mm a')}
                        </p>
                      </div>
                    </div>
                  </Card>
                ))}
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
                        onClick={() => { if (confirm(`Remove ${contact.name}?`)) db.safetyContacts.delete(contact.id) }}
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
                          onClick={() => { if (confirm('Delete this incident?')) db.incidents.delete(incident.id) }}
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
                  </Card>
                ))}
              </div>
            )
          )}
        </div>
      </div>

      <SafetyContactEditor isOpen={showContactEditor} onClose={() => setShowContactEditor(false)} />
      <IncidentEditor isOpen={showIncidentEditor} onClose={() => setShowIncidentEditor(false)} />
    </div>
  )
}
