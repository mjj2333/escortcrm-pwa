import { useState, useEffect, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  X, Plus, ArrowLeft, Star, Copy, Check, MapPin, Phone, Mail, User,
  Key, Globe, DollarSign, Edit, Trash2, Archive, ArchiveRestore,
  Search, Building2, Hotel, Home, Warehouse, HelpCircle, FileText,
} from 'lucide-react'
import { format } from 'date-fns'
import { db, newId, formatCurrency } from '../../db'
import { Card } from '../../components/Card'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { SectionLabel, FieldTextInput, FieldSelect, FieldCurrency, FieldHint, fieldInputStyle } from '../../components/FormFields'
import { VenueDocManager } from '../../components/VenueDocManager'
import { showToast } from '../../components/Toast'
import type { IncallVenue, VenueType, AccessMethod } from '../../types'
import { venueTypeColors } from '../../types'

const venueTypes: VenueType[] = ['Apartment', 'Hotel', 'Studio', 'Airbnb', 'Other']
const accessMethods: AccessMethod[] = ['Key Cafe', 'Lockbox', 'Front Desk', 'Doorman', 'Code', 'Key Handoff', 'App', 'Other']
const venueTypeIcons: Record<VenueType, typeof Building2> = {
  'Apartment': Building2, 'Hotel': Hotel, 'Studio': Warehouse, 'Airbnb': Home, 'Other': HelpCircle,
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MAIN PAGE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface IncallBookPageProps {
  isOpen: boolean
  onClose: () => void
}

type Screen = { view: 'list' } | { view: 'detail'; venueId: string } | { view: 'editor'; venueId?: string }

export function IncallBookPage({ isOpen, onClose }: IncallBookPageProps) {
  const [screen, setScreen] = useState<Screen>({ view: 'list' })
  const [search, setSearch] = useState('')
  const [showArchived, setShowArchived] = useState(false)

  const venues = useLiveQuery(() => db.incallVenues.toArray()) ?? []

  useEffect(() => {
    if (isOpen) {
      setScreen({ view: 'list' })
      setSearch('')
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  if (!isOpen) return null

  const filtered = venues
    .filter(v => showArchived ? v.isArchived : !v.isArchived)
    .filter(v => {
      if (!search) return true
      const q = search.toLowerCase()
      return v.name.toLowerCase().includes(q) ||
        v.city.toLowerCase().includes(q) ||
        v.address.toLowerCase().includes(q) ||
        (v.venueType.toLowerCase().includes(q))
    })

  const grouped = filtered
    .sort((a, b) => {
      if (a.isFavorite && !b.isFavorite) return -1
      if (!a.isFavorite && b.isFavorite) return 1
      return a.name.localeCompare(b.name)
    })
    .reduce<Record<string, IncallVenue[]>>((acc, v) => {
      const city = v.city || 'No City'
      ;(acc[city] ??= []).push(v)
      return acc
    }, {})

  const cities = Object.keys(grouped).sort()
  const activeCount = venues.filter(v => !v.isArchived).length
  const archivedCount = venues.filter(v => v.isArchived).length

  function handleBack() {
    if (screen.view === 'editor' && screen.venueId) {
      setScreen({ view: 'detail', venueId: screen.venueId })
    } else if (screen.view !== 'list') {
      setScreen({ view: 'list' })
    } else {
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col">
      <div className="absolute inset-0 bg-black/60" onClick={screen.view === 'list' ? onClose : undefined} />

      <div
        className="relative mt-8 flex-1 flex flex-col rounded-t-2xl overflow-hidden animate-slide-up"
        style={{ backgroundColor: 'var(--bg-primary)' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 border-b shrink-0"
          style={{ borderColor: 'var(--border)' }}
        >
          <button onClick={handleBack} className="p-1" style={{ color: 'var(--text-secondary)' }}>
            {screen.view === 'list' ? <X size={20} /> : <ArrowLeft size={20} />}
          </button>
          <h2 className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>
            {screen.view === 'list' ? 'Incall Book' : screen.view === 'detail' ? 'Venue Details' : (screen.view === 'editor' && screen.venueId ? 'Edit Venue' : 'New Venue')}
          </h2>
          <div className="w-7">
            {screen.view === 'list' && (
              <button onClick={() => setScreen({ view: 'editor' })} className="p-1 text-purple-500">
                <Plus size={20} />
              </button>
            )}
            {screen.view === 'detail' && (
              <button onClick={() => setScreen({ view: 'editor', venueId: (screen as any).venueId })} className="p-1 text-purple-500">
                <Edit size={18} />
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {screen.view === 'list' && (
            <VenueList
              cities={cities}
              grouped={grouped}
              search={search}
              onSearchChange={setSearch}
              activeCount={activeCount}
              archivedCount={archivedCount}
              showArchived={showArchived}
              onToggleArchived={() => setShowArchived(!showArchived)}
              onOpen={(id) => setScreen({ view: 'detail', venueId: id })}
              onNew={() => setScreen({ view: 'editor' })}
            />
          )}
          {screen.view === 'detail' && (
            <VenueDetail
              venueId={screen.venueId}
              onEdit={() => setScreen({ view: 'editor', venueId: screen.venueId })}
              onBack={() => setScreen({ view: 'list' })}
            />
          )}
          {screen.view === 'editor' && (
            <VenueEditor
              venueId={screen.venueId}
              onSave={(id) => setScreen({ view: 'detail', venueId: id })}
              onCancel={handleBack}
            />
          )}
        </div>
      </div>

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        .animate-slide-up {
          animation: slideUp 0.3s ease-out;
        }
      `}</style>
    </div>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// VENUE LIST
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function VenueList({ cities, grouped, search, onSearchChange, activeCount, archivedCount, showArchived, onToggleArchived, onOpen, onNew }: {
  cities: string[]
  grouped: Record<string, IncallVenue[]>
  search: string
  onSearchChange: (s: string) => void
  activeCount: number
  archivedCount: number
  showArchived: boolean
  onToggleArchived: () => void
  onOpen: (id: string) => void
  onNew: () => void
}) {
  return (
    <div className="p-4 space-y-3">
      {/* Search */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <Search size={16} style={{ color: 'var(--text-secondary)' }} />
        <input
          type="text"
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          placeholder="Search venues..."
          className="flex-1 bg-transparent text-sm outline-none"
          style={{ color: 'var(--text-primary)', fontSize: '16px' }}
        />
        {search && (
          <button onClick={() => onSearchChange('')}>
            <X size={14} style={{ color: 'var(--text-secondary)' }} />
          </button>
        )}
      </div>

      {/* Active/Archived toggle */}
      {archivedCount > 0 && (
        <div className="flex gap-2">
          <button
            onClick={() => showArchived && onToggleArchived()}
            className="text-xs font-medium px-3 py-1 rounded-full"
            style={{
              backgroundColor: !showArchived ? 'rgba(168,85,247,0.15)' : 'transparent',
              color: !showArchived ? '#a855f7' : 'var(--text-secondary)',
              border: '1px solid ' + (!showArchived ? 'rgba(168,85,247,0.3)' : 'var(--border)'),
            }}
          >
            Active ({activeCount})
          </button>
          <button
            onClick={() => !showArchived && onToggleArchived()}
            className="text-xs font-medium px-3 py-1 rounded-full"
            style={{
              backgroundColor: showArchived ? 'rgba(168,85,247,0.15)' : 'transparent',
              color: showArchived ? '#a855f7' : 'var(--text-secondary)',
              border: '1px solid ' + (showArchived ? 'rgba(168,85,247,0.3)' : 'var(--border)'),
            }}
          >
            Archived ({archivedCount})
          </button>
        </div>
      )}

      {/* Grouped list */}
      {cities.length === 0 ? (
        <div className="text-center py-12">
          <Building2 size={40} className="mx-auto mb-3" style={{ color: 'var(--text-secondary)', opacity: 0.4 }} />
          <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
            {search ? 'No venues match your search' : 'No venues yet'}
          </p>
          {!search && (
            <button onClick={onNew} className="text-sm font-medium text-purple-500 mt-2">
              + Add your first venue
            </button>
          )}
        </div>
      ) : (
        cities.map(city => (
          <div key={city}>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-1.5 px-1" style={{ color: 'var(--text-secondary)' }}>
              {city}
            </p>
            <div className="space-y-2">
              {grouped[city].map(v => {
                const Icon = venueTypeIcons[v.venueType] ?? Building2
                return (
                  <button
                    key={v.id}
                    onClick={() => onOpen(v.id)}
                    className="w-full text-left rounded-xl p-3 active:opacity-70 transition-opacity"
                    style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}
                  >
                    <div className="flex items-start gap-3">
                      {/* Icon */}
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                        style={{ backgroundColor: `${venueTypeColors[v.venueType]}20` }}
                      >
                        <Icon size={18} style={{ color: venueTypeColors[v.venueType] }} />
                      </div>
                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                            {v.name}
                          </span>
                          {v.isFavorite && <Star size={12} fill="#f59e0b" stroke="#f59e0b" />}
                          {v.hotelFriendly && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-green-500/15 text-green-500">
                              FRIENDLY
                            </span>
                          )}
                        </div>
                        <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                          {v.address}
                        </p>
                        <div className="flex items-center gap-3 mt-1">
                          <span
                            className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                            style={{ backgroundColor: `${venueTypeColors[v.venueType]}15`, color: venueTypeColors[v.venueType] }}
                          >
                            {v.venueType}
                          </span>
                          {(v.costPerHour || v.costPerDay) && (
                            <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                              {v.costPerHour ? `${formatCurrency(v.costPerHour)}/hr` : ''}
                              {v.costPerHour && v.costPerDay ? ' · ' : ''}
                              {v.costPerDay ? `${formatCurrency(v.costPerDay)}/day` : ''}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        ))
      )}
    </div>
  )
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// VENUE DETAIL
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function VenueDetail({ venueId, onEdit, onBack }: { venueId: string; onEdit: () => void; onBack: () => void }) {
  const venue = useLiveQuery(() => db.incallVenues.get(venueId), [venueId])
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  if (!venue) return null

  function copyText(text: string, field: string) {
    navigator.clipboard.writeText(text)
    setCopiedField(field)
    showToast('Copied to clipboard')
    setTimeout(() => setCopiedField(null), 2000)
  }

  async function toggleFavorite() {
    await db.incallVenues.update(venueId, { isFavorite: !venue!.isFavorite })
  }

  async function toggleArchive() {
    await db.incallVenues.update(venueId, { isArchived: !venue!.isArchived, updatedAt: new Date() })
    showToast(venue!.isArchived ? 'Venue restored' : 'Venue archived')
    if (!venue!.isArchived) onBack()
  }

  async function handleDelete() {
    await db.venueDocs.where('venueId').equals(venueId).delete()
    // Clear venueId from any bookings referencing this venue
    const allBookings = await db.bookings.toArray()
    for (const b of allBookings) {
      if (b.venueId === venueId) {
        await db.bookings.update(b.id, { venueId: undefined })
      }
    }
    await db.incallVenues.delete(venueId)
    showToast('Venue deleted')
    onBack()
  }

  const Icon = venueTypeIcons[venue.venueType] ?? Building2

  return (
    <div className="p-4 space-y-3">
      {/* Header card */}
      <Card>
        <div className="flex items-start gap-3">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
            style={{ backgroundColor: `${venueTypeColors[venue.venueType]}20` }}
          >
            <Icon size={22} style={{ color: venueTypeColors[venue.venueType] }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{venue.name}</h3>
              <button onClick={toggleFavorite} className="shrink-0">
                <Star size={16} fill={venue.isFavorite ? '#f59e0b' : 'none'} stroke={venue.isFavorite ? '#f59e0b' : 'var(--text-secondary)'} />
              </button>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                style={{ backgroundColor: `${venueTypeColors[venue.venueType]}15`, color: venueTypeColors[venue.venueType] }}>
                {venue.venueType}
              </span>
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{venue.city}</span>
              {venue.hotelFriendly && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-green-500/15 text-green-500">
                  FRIENDLY
                </span>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Address */}
      <Card>
        <CopyRow icon={<MapPin size={14} />} label="Address" text={venue.address}
          copied={copiedField === 'address'} onCopy={() => copyText(venue.address, 'address')} />
      </Card>

      {/* Directions — prominent copy button */}
      {venue.directions && (
        <Card>
          <div className="flex items-start justify-between gap-2 mb-2">
            <p className="text-xs font-semibold uppercase" style={{ color: 'var(--text-secondary)' }}>
              Directions for Client
            </p>
            <button
              onClick={() => copyText(venue.directions!, 'directions')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold shrink-0"
              style={{
                backgroundColor: copiedField === 'directions' ? 'rgba(34,197,94,0.15)' : 'rgba(168,85,247,0.15)',
                color: copiedField === 'directions' ? '#22c55e' : '#a855f7',
              }}
            >
              {copiedField === 'directions' ? <Check size={12} /> : <Copy size={12} />}
              {copiedField === 'directions' ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>
            {venue.directions}
          </p>
        </Card>
      )}

      {/* Access Info */}
      {(venue.accessMethod || venue.accessNotes) && (
        <Card>
          <p className="text-xs font-semibold uppercase mb-2" style={{ color: 'var(--text-secondary)' }}>Access</p>
          {venue.accessMethod && (
            <div className="flex items-center gap-2 mb-1">
              <Key size={14} style={{ color: 'var(--text-secondary)' }} />
              <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{venue.accessMethod}</span>
            </div>
          )}
          {venue.accessNotes && (
            <p className="text-sm whitespace-pre-wrap mt-1" style={{ color: 'var(--text-primary)' }}>
              {venue.accessNotes}
            </p>
          )}
        </Card>
      )}

      {/* Booking Info */}
      {(venue.bookingApp || venue.bookingNotes) && (
        <Card>
          <p className="text-xs font-semibold uppercase mb-2" style={{ color: 'var(--text-secondary)' }}>Booking</p>
          {venue.bookingApp && (
            <div className="flex items-center gap-2 mb-1">
              <Globe size={14} style={{ color: 'var(--text-secondary)' }} />
              <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{venue.bookingApp}</span>
            </div>
          )}
          {venue.bookingNotes && (
            <p className="text-sm whitespace-pre-wrap mt-1" style={{ color: 'var(--text-primary)' }}>
              {venue.bookingNotes}
            </p>
          )}
        </Card>
      )}

      {/* Contact */}
      {(venue.contactName || venue.contactPhone || venue.contactEmail) && (
        <Card>
          <p className="text-xs font-semibold uppercase mb-2" style={{ color: 'var(--text-secondary)' }}>Contact</p>
          {venue.contactName && (
            <CopyRow icon={<User size={14} />} label="Name" text={venue.contactName}
              copied={copiedField === 'contactName'} onCopy={() => copyText(venue.contactName!, 'contactName')} />
          )}
          {venue.contactPhone && (
            <CopyRow icon={<Phone size={14} />} label="Phone" text={venue.contactPhone}
              copied={copiedField === 'contactPhone'} onCopy={() => copyText(venue.contactPhone!, 'contactPhone')} />
          )}
          {venue.contactEmail && (
            <CopyRow icon={<Mail size={14} />} label="Email" text={venue.contactEmail}
              copied={copiedField === 'contactEmail'} onCopy={() => copyText(venue.contactEmail!, 'contactEmail')} />
          )}
        </Card>
      )}

      {/* Costs */}
      {(venue.costPerHour || venue.costPerDay || venue.costNotes) && (
        <Card>
          <p className="text-xs font-semibold uppercase mb-2" style={{ color: 'var(--text-secondary)' }}>Costs</p>
          <div className="flex gap-4">
            {venue.costPerHour != null && venue.costPerHour > 0 && (
              <div>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Per Hour</p>
                <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{formatCurrency(venue.costPerHour)}</p>
              </div>
            )}
            {venue.costPerDay != null && venue.costPerDay > 0 && (
              <div>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Per Day</p>
                <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{formatCurrency(venue.costPerDay)}</p>
              </div>
            )}
          </div>
          {venue.costNotes && (
            <p className="text-xs mt-2 whitespace-pre-wrap" style={{ color: 'var(--text-secondary)' }}>
              {venue.costNotes}
            </p>
          )}
        </Card>
      )}

      {/* Notes */}
      {venue.notes && (
        <Card>
          <p className="text-xs font-semibold uppercase mb-2" style={{ color: 'var(--text-secondary)' }}>Notes</p>
          <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>{venue.notes}</p>
        </Card>
      )}

      {/* Documents */}
      <Card>
        <p className="text-xs font-semibold uppercase mb-2" style={{ color: 'var(--text-secondary)' }}>
          Documents
        </p>
        <VenueDocManager venueId={venueId} editable />
      </Card>

      {/* Meta */}
      <Card>
        <div className="flex justify-between text-xs" style={{ color: 'var(--text-secondary)' }}>
          <span>Added {format(new Date(venue.createdAt), 'MMM d, yyyy')}</span>
          <span>Updated {format(new Date(venue.updatedAt), 'MMM d, yyyy')}</span>
        </div>
      </Card>

      {/* Actions */}
      <Card>
        <button onClick={onEdit} className="flex items-center gap-3 py-3 w-full text-left">
          <Edit size={18} className="text-purple-500" />
          <span className="text-sm font-medium text-purple-500">Edit Venue</span>
        </button>
        <div style={{ borderTop: '1px solid var(--border)' }} />
        <button onClick={toggleArchive} className="flex items-center gap-3 py-3 w-full text-left">
          {venue.isArchived
            ? <><ArchiveRestore size={18} style={{ color: 'var(--text-secondary)' }} /><span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Restore from Archive</span></>
            : <><Archive size={18} style={{ color: 'var(--text-secondary)' }} /><span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Archive Venue</span></>
          }
        </button>
        <div style={{ borderTop: '1px solid var(--border)' }} />
        <button onClick={() => setConfirmDelete(true)} className="flex items-center gap-3 py-3 w-full text-left">
          <Trash2 size={18} className="text-red-500" />
          <span className="text-sm font-medium text-red-500">Delete Venue</span>
        </button>
      </Card>

      <ConfirmDialog
        isOpen={confirmDelete}
        title="Delete Venue"
        message={`Permanently delete "${venue.name}" and all attached documents?`}
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  )
}

function CopyRow({ icon, label, text, copied, onCopy }: {
  icon: React.ReactNode; label: string; text: string; copied: boolean; onCopy: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <div className="flex items-center gap-2 min-w-0">
        <span style={{ color: 'var(--text-secondary)' }}>{icon}</span>
        <span className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>{text}</span>
      </div>
      <button onClick={onCopy} className="shrink-0 p-1.5 rounded-lg active:bg-white/10">
        {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} style={{ color: 'var(--text-secondary)' }} />}
      </button>
    </div>
  )
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// VENUE EDITOR
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function VenueEditor({ venueId, onSave, onCancel }: { venueId?: string; onSave: (id: string) => void; onCancel: () => void }) {
  const existing = useLiveQuery(() => venueId ? db.incallVenues.get(venueId) : undefined, [venueId])

  const [name, setName] = useState('')
  const [venueType, setVenueType] = useState<VenueType>('Apartment')
  const [city, setCity] = useState('')
  const [address, setAddress] = useState('')
  const [directions, setDirections] = useState('')
  const [contactName, setContactName] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [accessMethod, setAccessMethod] = useState<AccessMethod | ''>('')
  const [accessNotes, setAccessNotes] = useState('')
  const [bookingApp, setBookingApp] = useState('')
  const [bookingNotes, setBookingNotes] = useState('')
  const [costPerHour, setCostPerHour] = useState(0)
  const [costPerDay, setCostPerDay] = useState(0)
  const [costNotes, setCostNotes] = useState('')
  const [hotelFriendly, setHotelFriendly] = useState(false)
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (existing) {
      setName(existing.name)
      setVenueType(existing.venueType)
      setCity(existing.city)
      setAddress(existing.address)
      setDirections(existing.directions ?? '')
      setContactName(existing.contactName ?? '')
      setContactPhone(existing.contactPhone ?? '')
      setContactEmail(existing.contactEmail ?? '')
      setAccessMethod(existing.accessMethod ?? '')
      setAccessNotes(existing.accessNotes ?? '')
      setBookingApp(existing.bookingApp ?? '')
      setBookingNotes(existing.bookingNotes ?? '')
      setCostPerHour(existing.costPerHour ?? 0)
      setCostPerDay(existing.costPerDay ?? 0)
      setCostNotes(existing.costNotes ?? '')
      setHotelFriendly(existing.hotelFriendly ?? false)
      setNotes(existing.notes ?? '')
    }
  }, [existing])

  async function handleSave() {
    if (!name.trim() || !city.trim()) {
      showToast('Name and city are required')
      return
    }

    const data = {
      name: name.trim(),
      venueType,
      city: city.trim(),
      address: address.trim(),
      directions: directions.trim() || undefined,
      contactName: contactName.trim() || undefined,
      contactPhone: contactPhone.trim() || undefined,
      contactEmail: contactEmail.trim() || undefined,
      accessMethod: accessMethod || undefined,
      accessNotes: accessNotes.trim() || undefined,
      bookingApp: bookingApp.trim() || undefined,
      bookingNotes: bookingNotes.trim() || undefined,
      costPerHour: costPerHour || undefined,
      costPerDay: costPerDay || undefined,
      costNotes: costNotes.trim() || undefined,
      hotelFriendly: hotelFriendly || undefined,
      notes: notes.trim() || undefined,
      updatedAt: new Date(),
    }

    if (venueId && existing) {
      await db.incallVenues.update(venueId, data)
      showToast('Venue updated')
      onSave(venueId)
    } else {
      const id = newId()
      await db.incallVenues.add({
        id,
        ...data,
        isFavorite: false,
        isArchived: false,
        createdAt: new Date(),
      } as IncallVenue)
      showToast('Venue added')
      onSave(id)
    }
  }

  return (
    <div className="p-4 pb-8 space-y-1">
      <SectionLabel label="Basic Info" />
      <FieldTextInput label="Name *" value={name} onChange={setName} placeholder="e.g. Downtown Studio" />
      <FieldSelect label="Type" value={venueType} options={venueTypes} onChange={v => setVenueType(v as VenueType)} />
      <FieldTextInput label="City *" value={city} onChange={setCity} placeholder="e.g. Vancouver" />
      <FieldTextInput label="Address" value={address} onChange={setAddress} placeholder="Full street address" />

      {/* Hotel friendly toggle */}
      {venueType === 'Hotel' && (
        <button
          onClick={() => setHotelFriendly(!hotelFriendly)}
          className="flex items-center gap-3 w-full py-2.5 px-3 rounded-lg mb-1"
          style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}
        >
          <div
            className="w-5 h-5 rounded flex items-center justify-center"
            style={{
              backgroundColor: hotelFriendly ? '#22c55e' : 'transparent',
              border: hotelFriendly ? 'none' : '2px solid var(--border)',
            }}
          >
            {hotelFriendly && <Check size={14} className="text-white" />}
          </div>
          <span className="text-sm" style={{ color: 'var(--text-primary)' }}>Provider-friendly hotel</span>
        </button>
      )}

      <SectionLabel label="Directions for Client" />
      <FieldHint>These can be quickly copied and sent to the client from the venue detail page.</FieldHint>
      <textarea
        value={directions}
        onChange={e => setDirections(e.target.value)}
        placeholder="e.g. Enter through the lobby, take elevator to 4th floor, unit 402. Buzzer code: #4402"
        rows={4}
        className="w-full px-3 py-2.5 rounded-lg text-sm outline-none resize-none mb-1"
        style={{ ...fieldInputStyle, fontSize: '16px' }}
      />

      <SectionLabel label="Access" />
      <FieldSelect label="Method" value={accessMethod} options={['', ...accessMethods]} onChange={v => setAccessMethod(v as AccessMethod | '')}
        displayFn={v => v || 'Select method...'} />
      <textarea
        value={accessNotes}
        onChange={e => setAccessNotes(e.target.value)}
        placeholder="Key cafe code, lockbox combo, app login details, special instructions..."
        rows={3}
        className="w-full px-3 py-2.5 rounded-lg text-sm outline-none resize-none mb-1"
        style={{ ...fieldInputStyle, fontSize: '16px' }}
      />

      <SectionLabel label="Booking Platform" />
      <FieldTextInput label="App / Platform" value={bookingApp} onChange={setBookingApp} placeholder="e.g. Airbnb, Hotels.com, direct" />
      <textarea
        value={bookingNotes}
        onChange={e => setBookingNotes(e.target.value)}
        placeholder="Login credentials, how to book, account notes..."
        rows={3}
        className="w-full px-3 py-2.5 rounded-lg text-sm outline-none resize-none mb-1"
        style={{ ...fieldInputStyle, fontSize: '16px' }}
      />

      <SectionLabel label="Contact Person" />
      <FieldTextInput label="Name" value={contactName} onChange={setContactName} placeholder="Landlord, front desk, host..." />
      <FieldTextInput label="Phone" value={contactPhone} onChange={setContactPhone} placeholder="Phone number" />
      <FieldTextInput label="Email" value={contactEmail} onChange={setContactEmail} placeholder="Email" />

      <SectionLabel label="Costs" />
      <div className="flex gap-3">
        <div className="flex-1">
          <FieldCurrency label="Per Hour" value={costPerHour} onChange={setCostPerHour} />
        </div>
        <div className="flex-1">
          <FieldCurrency label="Per Day" value={costPerDay} onChange={setCostPerDay} />
        </div>
      </div>
      <FieldTextInput label="Cost Notes" value={costNotes} onChange={setCostNotes} placeholder="Payment terms, cleaning fees..." />

      <SectionLabel label="Notes" />
      <textarea
        value={notes}
        onChange={e => setNotes(e.target.value)}
        placeholder="Any other notes about this venue..."
        rows={3}
        className="w-full px-3 py-2.5 rounded-lg text-sm outline-none resize-none mb-1"
        style={{ ...fieldInputStyle, fontSize: '16px' }}
      />

      {/* Save / Cancel */}
      <div className="flex gap-3 pt-4">
        <button
          onClick={onCancel}
          className="flex-1 py-3 rounded-xl text-sm font-semibold"
          style={{ backgroundColor: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          className="flex-1 py-3 rounded-xl text-sm font-semibold text-white"
          style={{ backgroundColor: '#a855f7' }}
        >
          {venueId ? 'Save Changes' : 'Add Venue'}
        </button>
      </div>
    </div>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// VENUE PICKER (for BookingEditor)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function VenuePicker({ isOpen, onClose, onSelect }: {
  isOpen: boolean
  onClose: () => void
  onSelect: (venue: IncallVenue) => void
}) {
  const venues = useLiveQuery(() => db.incallVenues.toArray()) ?? []
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (isOpen) setSearch('')
  }, [isOpen])

  if (!isOpen) return null

  // Filter non-archived venues (Dexie boolean indexing is tricky, filter here)
  const active = venues.filter(v => !v.isArchived)
  const filtered = active.filter(v => {
    if (!search) return true
    const q = search.toLowerCase()
    return v.name.toLowerCase().includes(q) || v.city.toLowerCase().includes(q) || v.address.toLowerCase().includes(q)
  }).sort((a, b) => {
    if (a.isFavorite && !b.isFavorite) return -1
    if (!a.isFavorite && b.isFavorite) return 1
    return a.name.localeCompare(b.name)
  })

  const grouped = filtered.reduce<Record<string, IncallVenue[]>>((acc, v) => {
    const city = v.city || 'No City'
    ;(acc[city] ??= []).push(v)
    return acc
  }, {})
  const cities = Object.keys(grouped).sort()

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        className="relative w-full max-w-lg rounded-t-2xl safe-bottom"
        style={{ backgroundColor: 'var(--bg-card)', maxHeight: '70vh', display: 'flex', flexDirection: 'column' }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
          <h3 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>Choose Venue</h3>
          <button onClick={onClose} className="text-sm" style={{ color: 'var(--text-secondary)' }}>Cancel</button>
        </div>

        <div className="px-4 py-2 shrink-0">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ backgroundColor: 'var(--bg-base)', border: '1px solid var(--border)' }}>
            <Search size={14} style={{ color: 'var(--text-secondary)' }} />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search venues..."
              className="flex-1 bg-transparent text-sm outline-none"
              style={{ color: 'var(--text-primary)', fontSize: '16px' }}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {cities.length === 0 ? (
            <p className="text-center text-sm py-8" style={{ color: 'var(--text-secondary)' }}>
              {active.length === 0 ? 'No venues in your Incall Book yet' : 'No venues match'}
            </p>
          ) : (
            cities.map(city => (
              <div key={city} className="mb-3">
                <p className="text-[10px] font-bold uppercase tracking-wider mb-1 px-1" style={{ color: 'var(--text-secondary)' }}>
                  {city}
                </p>
                {grouped[city].map(v => {
                  const Icon = venueTypeIcons[v.venueType] ?? Building2
                  return (
                    <button
                      key={v.id}
                      onClick={() => { onSelect(v); onClose() }}
                      className="w-full text-left flex items-center gap-3 py-2.5 px-2 rounded-lg active:bg-white/5"
                    >
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                        style={{ backgroundColor: `${venueTypeColors[v.venueType]}20` }}
                      >
                        <Icon size={14} style={{ color: venueTypeColors[v.venueType] }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{v.name}</span>
                          {v.isFavorite && <Star size={10} fill="#f59e0b" stroke="#f59e0b" />}
                        </div>
                        <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{v.address}</p>
                      </div>
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
