import { useLiveQuery } from 'dexie-react-hooks'
import { useState, useMemo } from 'react'
import { ArrowLeft, TrendingUp, TrendingDown } from 'lucide-react'
import {
  format, subMonths, startOfMonth, getDay, getHours,
  eachMonthOfInterval
} from 'date-fns'
import { db, formatCurrency, formatNumber } from '../../db'
import { Card } from '../../components/Card'

const TABS = ['Overview', 'Timing', 'Clients', 'Trends'] as const
type Tab = typeof TABS[number]

interface AnalyticsPageProps {
  onBack: () => void
}

export function AnalyticsPage({ onBack }: AnalyticsPageProps) {
  const [tab, setTab] = useState<Tab>('Overview')
  const bookings = useLiveQuery(() => db.bookings.toArray()) ?? []
  const clients = useLiveQuery(() => db.clients.toArray()) ?? []
  const transactions = useLiveQuery(() => db.transactions.orderBy('date').reverse().toArray()) ?? []

  return (
    <div className="pb-20">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b backdrop-blur-xl header-frosted"
        style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-3 px-4 py-3 max-w-lg mx-auto">
          <button onClick={onBack} className="flex items-center gap-1 text-purple-500">
            <ArrowLeft size={18} />
            <span className="text-sm">Back</span>
          </button>
          <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Analytics</h1>
        </div>
        {/* Tab bar */}
        <div className="flex px-4 pb-2 max-w-lg mx-auto">
          <div className="flex rounded-xl overflow-hidden w-full" style={{ backgroundColor: 'var(--bg-secondary)' }}>
            {TABS.map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 py-2 text-xs font-medium transition-colors ${
                  tab === t ? 'bg-purple-600 text-white' : ''
                }`}
                style={tab !== t ? { color: 'var(--text-secondary)' } : {}}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="px-4 py-3 max-w-lg mx-auto space-y-4">
        {tab === 'Overview' && <OverviewTab bookings={bookings} clients={clients} transactions={transactions} />}
        {tab === 'Timing' && <TimingTab bookings={bookings} transactions={transactions} />}
        {tab === 'Clients' && <ClientsTab clients={clients} bookings={bookings} transactions={transactions} />}
        {tab === 'Trends' && <TrendsTab transactions={transactions} bookings={bookings} />}
      </div>
    </div>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// OVERVIEW TAB
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function OverviewTab({ bookings, clients, transactions }: {
  bookings: any[]; clients: any[]; transactions: any[]
}) {
  const completed = bookings.filter(b => b.status === 'Completed')
  const totalRevenue = transactions.filter(t => t.type === 'income').reduce((s: number, t: any) => s + t.amount, 0)
  const totalExpenses = transactions.filter(t => t.type === 'expense').reduce((s: number, t: any) => s + t.amount, 0)
  const avgBooking = completed.length > 0
    ? Math.round(completed.reduce((s: number, b: any) => {
        return s + transactions.filter((t: any) => t.bookingId === b.id && t.type === 'income').reduce((ts: number, t: any) => ts + t.amount, 0)
      }, 0) / completed.length)
    : 0
  const avgDuration = completed.length > 0
    ? Math.round(completed.reduce((s: number, b: any) => s + b.duration, 0) / completed.length)
    : 0
  const nonCancelled = bookings.filter(b => !['To Be Confirmed', 'Screening'].includes(b.status))
  const completionRate = nonCancelled.length > 0
    ? Math.round((completed.length / nonCancelled.length) * 100)
    : 0

  // Status breakdown
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    bookings.forEach(b => { counts[b.status] = (counts[b.status] ?? 0) + 1 })
    return Object.entries(counts).sort((a, b) => b[1] - a[1])
  }, [bookings])

  return (
    <>
      {/* Key Metrics */}
      <div className="grid grid-cols-2 gap-3">
        <MetricCard label="Total Revenue" value={formatCurrency(totalRevenue)} color="#22c55e" />
        <MetricCard label="Net Profit" value={formatCurrency(totalRevenue - totalExpenses)} color="#3b82f6" />
        <MetricCard label="Completed" value={formatNumber(completed.length)} color="#a855f7" />
        <MetricCard label="Active Clients" value={formatNumber(clients.filter(c => !c.isBlocked).length)} color="#f97316" />
      </div>

      {/* Averages */}
      <Card>
        <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Averages</p>
        <div className="grid grid-cols-3 gap-2">
          <div className="text-center p-2 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)' }}>
            <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{formatCurrency(avgBooking)}</p>
            <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>Per Booking</p>
          </div>
          <div className="text-center p-2 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)' }}>
            <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{avgDuration}m</p>
            <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>Duration</p>
          </div>
          <div className="text-center p-2 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)' }}>
            <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{completionRate}%</p>
            <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>Completion</p>
          </div>
        </div>
      </Card>

      {/* Booking Status Breakdown */}
      {statusCounts.length > 0 && (
        <Card>
          <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Booking Status</p>
          <div className="space-y-2">
            {statusCounts.map(([status, count]) => (
              <div key={status} className="flex items-center justify-between">
                <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{status}</span>
                <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>{count}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Client Overview */}
      <Card>
        <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Client Overview</p>
        <div className="grid grid-cols-4 gap-1">
          {[
            { label: 'Total', count: clients.length, color: '#3b82f6' },
            { label: 'Screened', count: clients.filter((c: any) => c.screeningStatus === 'Screened').length, color: '#22c55e' },
            { label: 'Repeat', count: clients.filter((c: any) => bookings.filter((b: any) => b.clientId === c.id && b.status === 'Completed').length >= 2).length, color: '#a855f7' },
            { label: 'Blocked', count: clients.filter((c: any) => c.isBlocked).length, color: '#ef4444' },
          ].map(s => (
            <div key={s.label} className="text-center py-2">
              <p className="text-lg font-bold" style={{ color: s.color }}>{s.count}</p>
              <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>{s.label}</p>
            </div>
          ))}
        </div>
      </Card>
    </>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TIMING TAB - HEATMAP
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DISPLAY_HOURS = Array.from({ length: 16 }, (_, i) => i + 8) // 8am - 11pm

function TimingTab({ bookings, transactions }: { bookings: any[]; transactions: any[] }) {
  const completed = bookings.filter(b => b.status === 'Completed')

  // Build 7x24 heatmap
  const heatmap = useMemo(() => {
    const data = Array.from({ length: 7 }, () => Array(24).fill(0))
    completed.forEach(b => {
      const dt = new Date(b.dateTime)
      const day = getDay(dt) // 0=Sun
      const hour = getHours(dt)
      data[day][hour]++
    })
    return data
  }, [completed])

  const maxCount = Math.max(1, ...heatmap.flat())

  // Best day/time
  const dayTotals = heatmap.map(d => d.reduce((a, b) => a + b, 0))
  const bestDayIdx = dayTotals.indexOf(Math.max(...dayTotals))
  const hourTotals = Array(24).fill(0)
  heatmap.forEach(d => d.forEach((c, h) => { hourTotals[h] += c }))
  const bestHourIdx = hourTotals.indexOf(Math.max(...hourTotals))

  function heatColor(count: number): string {
    if (count === 0) return 'var(--bg-secondary)'
    const intensity = count / maxCount
    const alpha = 0.15 + intensity * 0.85
    return `rgba(168,85,247,${alpha})`
  }

  function fmtHour(h: number): string {
    if (h === 0) return '12a'
    if (h < 12) return `${h}a`
    if (h === 12) return '12p'
    return `${h - 12}p`
  }

  // Day of week revenue chart
  const dayRevenue = useMemo(() => {
    const data = Array(7).fill(0)
    completed.forEach(b => {
      const day = getDay(new Date(b.dateTime))
      data[day] += transactions.filter((t: any) => t.bookingId === b.id && t.type === 'income').reduce((s: number, t: any) => s + t.amount, 0)
    })
    return data
  }, [completed, transactions])
  const maxDayRev = Math.max(1, ...dayRevenue)

  return (
    <>
      {/* Peak Times */}
      <Card>
        <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Peak Times</p>
        <div className="flex gap-4">
          <div className="flex-1">
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Best Day</p>
            <p className="text-xl font-bold text-purple-500">{dayTotals[bestDayIdx] > 0 ? DAYS[bestDayIdx] : 'N/A'}</p>
          </div>
          <div className="w-px" style={{ backgroundColor: 'var(--border)' }} />
          <div className="flex-1">
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Best Hours</p>
            <p className="text-xl font-bold text-purple-500">
              {hourTotals[bestHourIdx] > 0 ? `${fmtHour(bestHourIdx)} - ${fmtHour((bestHourIdx + 2) % 24)}` : 'N/A'}
            </p>
          </div>
        </div>
      </Card>

      {/* Heatmap */}
      <Card>
        <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Booking Heatmap</p>
        <p className="text-[10px] mb-3" style={{ color: 'var(--text-secondary)' }}>Darker = more bookings</p>

        <div className="overflow-x-auto -mx-3">
          <div className="min-w-[420px] px-3">
            {/* Hour labels */}
            <div className="flex gap-[2px] mb-[2px]">
              <div className="w-8 shrink-0" />
              {DISPLAY_HOURS.map(h => (
                <div key={h} className="flex-1 text-center">
                  <span className="text-[8px]" style={{ color: 'var(--text-secondary)' }}>{fmtHour(h)}</span>
                </div>
              ))}
            </div>
            {/* Day rows */}
            {DAYS.map((day, dayIdx) => (
              <div key={day} className="flex gap-[2px] mb-[2px]">
                <div className="w-8 shrink-0 flex items-center">
                  <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>{day}</span>
                </div>
                {DISPLAY_HOURS.map(hour => {
                  const count = heatmap[dayIdx][hour]
                  return (
                    <div
                      key={hour}
                      className="flex-1 aspect-square rounded-[3px] flex items-center justify-center"
                      style={{ backgroundColor: heatColor(count), minHeight: '20px' }}
                    >
                      {count > 0 && (
                        <span className="text-[8px] font-bold"
                          style={{ color: count > maxCount * 0.5 ? 'white' : 'var(--text-primary)' }}
                        >
                          {count}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            ))}
            {/* Legend */}
            <div className="flex items-center justify-center gap-2 mt-2">
              <span className="text-[9px]" style={{ color: 'var(--text-secondary)' }}>Less</span>
              {[0, 0.25, 0.5, 0.75, 1].map((intensity, i) => (
                <div
                  key={i}
                  className="w-4 h-4 rounded-[3px]"
                  style={{ backgroundColor: intensity === 0 ? 'var(--bg-secondary)' : `rgba(168,85,247,${0.15 + intensity * 0.85})` }}
                />
              ))}
              <span className="text-[9px]" style={{ color: 'var(--text-secondary)' }}>More</span>
            </div>
          </div>
        </div>
      </Card>

      {/* Revenue by Day */}
      <Card>
        <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Revenue by Day</p>
        <div className="flex items-end gap-2 h-32">
          {DAYS.map((day, i) => (
            <div key={day} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
              <span className="text-[9px] font-medium" style={{ color: 'var(--text-secondary)' }}>
                {dayRevenue[i] > 0 ? formatCurrency(dayRevenue[i]) : ''}
              </span>
              <div
                className="w-full rounded-t transition-all"
                style={{
                  height: `${Math.max(2, (dayRevenue[i] / maxDayRev) * 100)}%`,
                  background: dayRevenue[i] > 0 ? 'linear-gradient(to top, rgba(168,85,247,0.4), rgba(168,85,247,0.8))' : 'var(--bg-secondary)',
                  minHeight: '4px',
                }}
              />
              <span className="text-[9px]" style={{ color: 'var(--text-secondary)' }}>{day}</span>
            </div>
          ))}
        </div>
      </Card>
    </>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CLIENTS TAB
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function ClientsTab({ clients, bookings, transactions }: { clients: any[]; bookings: any[]; transactions: any[] }) {
  const clientStats = useMemo(() => {
    return clients.map(c => {
      const cb = bookings.filter((b: any) => b.clientId === c.id)
      const completed = cb.filter((b: any) => b.status === 'Completed')
      const cancelled = cb.filter((b: any) => b.status === 'Cancelled' || b.status === 'No Show')
      const revenue = completed.reduce((s: number, b: any) => {
        return s + transactions.filter((t: any) => t.bookingId === b.id && t.type === 'income').reduce((ts: number, t: any) => ts + t.amount, 0)
      }, 0)
      const cancelRate = cb.length > 0 ? Math.round((cancelled.length / cb.length) * 100) : 0
      return { client: c, bookingCount: completed.length, revenue, cancelRate, totalBookings: cb.length }
    }).filter(s => s.totalBookings > 0)
  }, [clients, bookings, transactions])

  const topClients = [...clientStats].sort((a, b) => b.revenue - a.revenue).slice(0, 10)
  const unreliable = clientStats.filter(s => s.cancelRate >= 30 && s.totalBookings >= 2).sort((a, b) => b.cancelRate - a.cancelRate)

  // Client sources
  const sources = useMemo(() => {
    const counts: Record<string, number> = {}
    clients.forEach((c: any) => {
      if (c.referenceSource) counts[c.referenceSource] = (counts[c.referenceSource] ?? 0) + 1
    })
    return Object.entries(counts).sort((a, b) => b[1] - a[1])
  }, [clients])

  return (
    <>
      {/* Top Clients */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Top Clients by Revenue</p>
          <span className="text-sm">⭐</span>
        </div>
        {topClients.length === 0 ? (
          <p className="text-sm text-center py-4" style={{ color: 'var(--text-secondary)' }}>No completed bookings yet</p>
        ) : (
          <div className="space-y-2">
            {topClients.map((item, i) => (
              <div key={item.client.id} className="flex items-center gap-3">
                <span className="text-xs w-5 text-center" style={{ color: 'var(--text-secondary)' }}>#{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{item.client.alias}</p>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{item.bookingCount} bookings</p>
                </div>
                <span className="text-sm font-semibold text-green-500">{formatCurrency(item.revenue)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Reliability Concerns */}
      {unreliable.length > 0 && (
        <Card>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Reliability Concerns</p>
            <span className="text-sm">⚠️</span>
          </div>
          <p className="text-[10px] mb-3" style={{ color: 'var(--text-secondary)' }}>30%+ cancellation / no-show rate</p>
          <div className="space-y-2">
            {unreliable.map(item => (
              <div key={item.client.id} className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{item.client.alias}</p>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{item.bookingCount} completed, {item.cancelRate}% cancel</p>
                </div>
                <span className="text-sm font-bold text-orange-500">{item.cancelRate}%</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Client Sources */}
      {sources.length > 0 && (
        <Card>
          <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Client Sources</p>
          <div className="space-y-2">
            {sources.map(([source, count]) => (
              <div key={source} className="flex items-center justify-between">
                <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{source}</span>
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{count}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TRENDS TAB
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function TrendsTab({ transactions, bookings }: { transactions: any[]; bookings: any[] }) {
  const monthly = useMemo(() => {
    const now = new Date()
    const start = subMonths(startOfMonth(now), 11)
    const months = eachMonthOfInterval({ start, end: now })

    return months.map(m => {
      const mTxns = transactions.filter((t: any) => {
        const td = new Date(t.date)
        return td.getFullYear() === m.getFullYear() && td.getMonth() === m.getMonth()
      })
      const income = mTxns.filter((t: any) => t.type === 'income').reduce((s: number, t: any) => s + t.amount, 0)
      const expenses = mTxns.filter((t: any) => t.type === 'expense').reduce((s: number, t: any) => s + t.amount, 0)
      const bCount = bookings.filter((b: any) => {
        const bd = new Date(b.dateTime)
        return bd.getFullYear() === m.getFullYear() && bd.getMonth() === m.getMonth() && b.status === 'Completed'
      }).length
      return { month: m, label: format(m, 'MMM'), income, expenses, bookings: bCount }
    })
  }, [transactions, bookings])

  const currentMonth = monthly[monthly.length - 1]
  const prevMonth = monthly.length >= 2 ? monthly[monthly.length - 2] : null
  const momChange = prevMonth && prevMonth.income > 0
    ? Math.round(((currentMonth.income - prevMonth.income) / prevMonth.income) * 100)
    : 0

  const maxIncome = Math.max(1, ...monthly.map(m => m.income))
  const maxBookings = Math.max(1, ...monthly.map(m => m.bookings))

  return (
    <>
      {/* Month over Month */}
      <Card>
        <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Month over Month</p>
        <div className="flex gap-4">
          <div className="flex-1">
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>This Month</p>
            <p className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{formatCurrency(currentMonth.income)}</p>
          </div>
          <div className="w-px" style={{ backgroundColor: 'var(--border)' }} />
          <div className="flex-1">
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>vs Last Month</p>
            <div className="flex items-center gap-1">
              {momChange >= 0 ? (
                <TrendingUp size={18} className="text-green-500" />
              ) : (
                <TrendingDown size={18} className="text-red-500" />
              )}
              <span className={`text-xl font-bold ${momChange >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {Math.abs(momChange)}%
              </span>
            </div>
          </div>
        </div>
      </Card>

      {/* 12-Month Income Trend (area chart with line) */}
      <Card>
        <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>12-Month Income Trend</p>
        {monthly.every(m => m.income === 0) ? (
          <p className="text-sm text-center py-4" style={{ color: 'var(--text-secondary)' }}>No data available</p>
        ) : (
          <div className="relative h-36">
            {/* SVG area chart */}
            <svg viewBox="0 0 300 120" className="w-full h-full" preserveAspectRatio="none">
              {/* Area fill */}
              <path
                d={buildAreaPath(monthly.map(m => m.income / maxIncome), 300, 120)}
                fill="rgba(34,197,94,0.1)"
              />
              {/* Line */}
              <path
                d={buildLinePath(monthly.map(m => m.income / maxIncome), 300, 120)}
                fill="none"
                stroke="#22c55e"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* Dots */}
              {monthly.map((m, i) => {
                const x = (i / Math.max(1, monthly.length - 1)) * 300
                const y = 120 - (m.income / maxIncome) * 110 - 5
                return m.income > 0 ? (
                  <circle key={i} cx={x} cy={y} r="3" fill="#22c55e" />
                ) : null
              })}
            </svg>
          </div>
        )}
        {/* Month labels */}
        <div className="flex mt-1">
          {monthly.map((m, i) => (
            <div key={i} className="flex-1 text-center">
              {(monthly.length <= 6 || i % 2 === 0) && (
                <span className="text-[8px]" style={{ color: 'var(--text-secondary)' }}>{m.label}</span>
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* Booking Volume */}
      <Card>
        <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Booking Volume</p>
        <div className="flex items-end gap-1 h-28">
          {monthly.map((m, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
              {m.bookings > 0 && (
                <span className="text-[8px] font-medium" style={{ color: 'var(--text-secondary)' }}>{m.bookings}</span>
              )}
              <div
                className="w-full rounded-t"
                style={{
                  height: `${Math.max(2, (m.bookings / maxBookings) * 100)}%`,
                  background: m.bookings > 0
                    ? 'linear-gradient(to top, rgba(168,85,247,0.4), rgba(168,85,247,0.8))'
                    : 'var(--bg-secondary)',
                  minHeight: '3px',
                }}
              />
              <span className="text-[8px]" style={{ color: 'var(--text-secondary)' }}>{m.label}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Monthly Breakdown Table */}
      <Card>
        <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Monthly Breakdown</p>
        <div className="space-y-2">
          {[...monthly].reverse().slice(0, 6).map(m => (
            <div key={m.label + m.month.getFullYear()} className="flex items-center justify-between py-1"
              style={{ borderBottom: '1px solid var(--border)' }}
            >
              <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
                {format(m.month, 'MMM yyyy')}
              </span>
              <div className="text-right">
                <p className="text-sm font-medium text-green-500">{formatCurrency(m.income)}</p>
                <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>{m.bookings} bookings</p>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HELPERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function MetricCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="p-3 rounded-xl border" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
      <p className="text-lg font-bold" style={{ color }}>{value}</p>
      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{label}</p>
    </div>
  )
}

function buildLinePath(values: number[], w: number, h: number): string {
  if (values.length === 0) return ''
  const margin = 5
  return values.map((v, i) => {
    const x = values.length === 1 ? w / 2 : (i / (values.length - 1)) * w
    const y = h - v * (h - margin * 2) - margin
    return `${i === 0 ? 'M' : 'L'} ${x} ${y}`
  }).join(' ')
}

function buildAreaPath(values: number[], w: number, h: number): string {
  if (values.length === 0) return ''
  const margin = 5
  const line = values.map((v, i) => {
    const x = values.length === 1 ? w / 2 : (i / (values.length - 1)) * w
    const y = h - v * (h - margin * 2) - margin
    return `${x} ${y}`
  }).join(' L ')
  const lastX = values.length === 1 ? w / 2 : w
  const firstX = values.length === 1 ? w / 2 : 0
  return `M ${firstX} ${h} L ${line} L ${lastX} ${h} Z`
}
