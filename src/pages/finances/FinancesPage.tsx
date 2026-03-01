import { useLiveQuery } from 'dexie-react-hooks'
import {
  Plus, ArrowUpCircle, ArrowDownCircle, Trash2, Target,
  Percent, ChevronRight, AlertCircle, Search, X, Check, ArrowDownUp,
  Settings2, CreditCard, MapPin, TrendingUp, TrendingDown
} from 'lucide-react'
import { useState, useMemo } from 'react'
import {
  startOfMonth, startOfWeek, startOfYear, startOfQuarter,
  subMonths, getDay, getHours, eachMonthOfInterval,
  differenceInDays, endOfMonth, endOfWeek, endOfQuarter, endOfYear
} from 'date-fns'
import { fmtShortMonth, fmtShortDate, fmtMediumDate } from '../../utils/dateFormat'
import { db, formatCurrency, bookingTotal, removeBookingPayment } from '../../db'
import { PageHeader } from '../../components/PageHeader'
import { Card } from '../../components/Card'
import { Modal } from '../../components/Modal'
import { SectionLabel, FieldHint, fieldInputStyle } from '../../components/FormFields'
import { ImportExportModal } from '../../components/ImportExport'
import { TransactionEditor } from './TransactionEditor'
import { StatusBadge } from '../../components/StatusBadge'
import { bookingStatusColors } from '../../types'
import { useLocalStorage } from '../../hooks/useSettings'
import { showToast, showUndoToast } from '../../components/Toast'
import { FinancesPageSkeleton } from '../../components/Skeleton'
import type { LocationType, PaymentMethod } from '../../types'

type TimePeriod = 'Week' | 'Month' | 'Quarter' | 'Year' | 'All'

// Card visibility — user can toggle which sections appear
type CardKey =
  // Financial
  | 'goal' | 'stats' | 'tax' | 'bookingTypes' | 'paymentMethods' | 'expenses' | 'outstanding' | 'transactions'
  // Trends
  | 'monthOverMonth' | 'incomeTrend' | 'bookingVolume' | 'monthlyBreakdown'
  // Timing
  | 'peakTimes' | 'heatmap' | 'revenueByDay'
  // Clients
  | 'retention' | 'repeatRevenue' | 'topClients' | 'reliability' | 'clientSources'

interface CardGroup { label: string; keys: CardKey[] }
const CARD_GROUPS: CardGroup[] = [
  { label: '💰 Financial', keys: ['goal', 'stats', 'tax', 'bookingTypes', 'paymentMethods', 'expenses', 'outstanding', 'transactions'] },
  { label: '📈 Trends', keys: ['monthOverMonth', 'incomeTrend', 'bookingVolume', 'monthlyBreakdown'] },
  { label: '🕐 Timing', keys: ['peakTimes', 'heatmap', 'revenueByDay'] },
  { label: '👥 Clients', keys: ['retention', 'repeatRevenue', 'topClients', 'reliability', 'clientSources'] },
]
const CARD_LABELS: Record<CardKey, string> = {
  goal: 'Income Goal', stats: 'Summary Stats', tax: 'Tax Estimate',
  bookingTypes: 'Revenue by Booking Type', paymentMethods: 'Payment Methods',
  expenses: 'Top Expenses', outstanding: 'Outstanding Balances', transactions: 'Recent Transactions',
  monthOverMonth: 'Month over Month', incomeTrend: '12-Month Income Trend',
  bookingVolume: 'Booking Volume', monthlyBreakdown: 'Monthly Breakdown',
  peakTimes: 'Peak Times', heatmap: 'Booking Heatmap', revenueByDay: 'Revenue by Day of Week',
  retention: 'Client Retention', repeatRevenue: 'Repeat vs One-time Revenue',
  topClients: 'Top Clients by Revenue', reliability: 'Reliability Concerns', clientSources: 'Client Sources',
}
const ALL_CARDS: CardKey[] = CARD_GROUPS.flatMap(g => g.keys)
const DEFAULT_VISIBLE: CardKey[] = [
  'goal', 'stats', 'tax', 'bookingTypes', 'paymentMethods', 'expenses', 'outstanding', 'transactions',
  'monthOverMonth', 'incomeTrend',
]

// Location type display config
const LOCATION_COLORS: Record<string, string> = {
  Incall: '#a855f7',
  Outcall: '#3b82f6',
  Travel: '#f97316',
  Virtual: '#22c55e',
}

// Payment method display config
const PAYMENT_COLORS: Record<string, string> = {
  Cash: '#22c55e',
  'e-Transfer': '#3b82f6',
  Crypto: '#f97316',
  Venmo: '#6366f1',
  'Cash App': '#10b981',
  Zelle: '#8b5cf6',
  'Gift Card': '#ec4899',
  Other: '#6b7280',
}

const EXPENSE_COLORS = ['#ef4444', '#f97316', '#eab308', '#6366f1', '#ec4899', '#14b8a6', '#8b5cf6']

// Timing constants
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DISPLAY_HOURS = Array.from({ length: 16 }, (_, i) => i + 8) // 8am–11pm

function periodStart(p: TimePeriod): Date {
  switch (p) {
    case 'Week': return startOfWeek(new Date(), { weekStartsOn: 1 })
    case 'Month': return startOfMonth(new Date())
    case 'Quarter': return startOfQuarter(new Date())
    case 'Year': return startOfYear(new Date())
    case 'All': return new Date(2000, 0, 1)
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MAIN FINANCES PAGE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function FinancesPage({ onOpenBooking }: { onOpenBooking?: (bookingId: string) => void }) {
  const [period, setPeriod] = useState<TimePeriod>('Month')
  const [showEditor, setShowEditor] = useState(false)
  const [showGoalEditor, setShowGoalEditor] = useState(false)
  const [showTaxSettings, setShowTaxSettings] = useState(false)
  const [showAllTransactions, setShowAllTransactions] = useState(false)
  const [showImportExport, setShowImportExport] = useState(false)
  const [showCardSettings, setShowCardSettings] = useState(false)
  const [visibleCards, setVisibleCards] = useLocalStorage<CardKey[]>('financeCards_v2', DEFAULT_VISIBLE)
  const [hintDismissed, setHintDismissed] = useLocalStorage('financeHintDismissed', false)
  const isCardVisible = (key: CardKey) => visibleCards.includes(key)

  const rawTransactions = useLiveQuery(() => db.transactions.orderBy('date').reverse().toArray())
  const rawBookings = useLiveQuery(() => db.bookings.toArray())
  const rawClients = useLiveQuery(() => db.clients.toArray())
  const rawPayments = useLiveQuery(() => db.payments.toArray())
  const allTransactions = rawTransactions ?? []
  const allBookings = rawBookings ?? []
  const clients = rawClients ?? []
  const allPayments = rawPayments ?? []
  // Settings
  const [taxRate] = useLocalStorage('taxRate', 25)
  const [setAsideRate] = useLocalStorage('setAsideRate', 30)
  const [goalWeekly] = useLocalStorage('goalWeekly', 0)
  const [goalMonthly] = useLocalStorage('goalMonthly', 0)
  const [goalQuarterly] = useLocalStorage('goalQuarterly', 0)
  const [goalYearly] = useLocalStorage('goalYearly', 0)

  // Filtered by period
  const startDate = periodStart(period)
  const filtered = useMemo(
    () => allTransactions.filter(t => new Date(t.date) >= startDate),
    [allTransactions, startDate.getTime()]
  )

  // Stats
  const totalIncome = filtered.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const totalExpenses = filtered.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  const netIncome = totalIncome - totalExpenses
  const bookingTxns = filtered.filter(t => t.category === 'booking')
  const uniqueBookingIds = new Set(bookingTxns.map(t => t.bookingId).filter(Boolean))
  const manualBookingTxns = bookingTxns.filter(t => !t.bookingId).length
  const bookingCount = uniqueBookingIds.size + manualBookingTxns
  const avgBooking = bookingCount > 0
    ? Math.round(bookingTxns.reduce((s, t) => s + t.amount, 0) / bookingCount)
    : 0
  const estimatedTax = netIncome > 0 ? Math.round(netIncome * taxRate / 100) : 0
  const suggestedSetAside = totalIncome > 0 ? Math.round(totalIncome * setAsideRate / 100) : 0

  // Goal — tied to the active period tab
  const goalTarget = period === 'Week' ? goalWeekly
    : period === 'Month' ? goalMonthly
    : period === 'Quarter' ? goalQuarterly
    : period === 'Year' ? goalYearly : 0
  const hasGoal = goalTarget > 0 && period !== 'All'
  const goalIncome = totalIncome
  const goalProgress = goalTarget > 0 ? Math.min(1, goalIncome / goalTarget) : 0
  const goalRemaining = Math.max(0, goalTarget - goalIncome)
  const goalEnd = period === 'Week' ? endOfWeek(new Date(), { weekStartsOn: 1 })
    : period === 'Quarter' ? endOfQuarter(new Date())
    : period === 'Year' ? endOfYear(new Date()) : endOfMonth(new Date())
  const goalDaysLeft = Math.max(0, differenceInDays(goalEnd, new Date()))

  // Outstanding balances — use payment ledger for accurate amounts (only Pending Deposit+ stages)
  const bookingsWithBalance = allBookings
    .filter(b => b.status === 'Pending Deposit' || b.status === 'Confirmed' || b.status === 'In Progress' || b.status === 'Completed')
    .map(b => {
      const total = bookingTotal(b)
      const paid = allPayments.filter(p => p.bookingId === b.id).reduce((s, p) => s + p.amount, 0)
      const owing = total - paid
      return { booking: b, owing, client: clients.find(c => c.id === b.clientId) }
    })
    .filter(x => x.owing > 0)
    .sort((a, b) => b.owing - a.owing)
  const totalOutstanding = bookingsWithBalance.reduce((s, x) => s + x.owing, 0)

  // Expense breakdown
  const expenseBreakdown = useMemo(() => {
    const expenses = filtered.filter(t => t.type === 'expense')
    const total = expenses.reduce((s, t) => s + t.amount, 0)
    if (total === 0) return []
    const grouped: Record<string, number> = {}
    expenses.forEach(t => { grouped[t.category] = (grouped[t.category] ?? 0) + t.amount })
    return Object.entries(grouped)
      .map(([cat, amt]) => ({ category: cat, amount: amt, pct: Math.round((amt / total) * 100) }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5)
  }, [filtered])

  // Revenue by booking type (Incall/Outcall/Travel/Virtual)
  const bookingTypeBreakdown = useMemo(() => {
    const completedInPeriod = allBookings.filter(b =>
      b.status === 'Completed' && new Date(b.dateTime) >= startDate
    )
    if (completedInPeriod.length === 0) return []
    const grouped: Record<string, { count: number; revenue: number }> = {}
    completedInPeriod.forEach(b => {
      const type = b.locationType || 'Other'
      if (!grouped[type]) grouped[type] = { count: 0, revenue: 0 }
      grouped[type].count++
      // Revenue from transaction ledger
      const rev = filtered
        .filter(t => t.bookingId === b.id && t.type === 'income')
        .reduce((s, t) => s + t.amount, 0)
      // Fallback to booking total if no transactions linked
      grouped[type].revenue += rev > 0 ? rev : bookingTotal(b)
    })
    return Object.entries(grouped)
      .map(([type, data]) => ({ type: type as LocationType, ...data }))
      .sort((a, b) => b.revenue - a.revenue)
  }, [allBookings, filtered, startDate.getTime()])

  // Payment method breakdown (income only)
  const paymentMethodBreakdown = useMemo(() => {
    const incomeWithMethod = filtered.filter(t => t.type === 'income' && t.paymentMethod)
    if (incomeWithMethod.length === 0) return []
    const total = incomeWithMethod.reduce((s, t) => s + t.amount, 0)
    const grouped: Record<string, { count: number; amount: number }> = {}
    incomeWithMethod.forEach(t => {
      const method = t.paymentMethod!
      if (!grouped[method]) grouped[method] = { count: 0, amount: 0 }
      grouped[method].count++
      grouped[method].amount += t.amount
    })
    return Object.entries(grouped)
      .map(([method, data]) => ({
        method: method as PaymentMethod,
        ...data,
        pct: Math.round((data.amount / total) * 100),
      }))
      .sort((a, b) => b.amount - a.amount)
  }, [filtered])

  // ── Analytics computations (all-time, not period-filtered) ──

  const completedBookings = useMemo(() => allBookings.filter(b => b.status === 'Completed'), [allBookings])

  // Timing: heatmap + peak times
  const heatmap = useMemo(() => {
    const data = Array.from({ length: 7 }, () => Array(24).fill(0))
    completedBookings.forEach(b => {
      const dt = new Date(b.dateTime)
      data[getDay(dt)][getHours(dt)]++
    })
    return data
  }, [completedBookings])

  const heatmapMax = Math.max(1, ...heatmap.flat())
  const dayTotals = heatmap.map(d => d.reduce((a: number, b: number) => a + b, 0))
  const bestDayIdx = dayTotals.indexOf(Math.max(...dayTotals))
  const hourTotals = Array(24).fill(0) as number[]
  heatmap.forEach(d => d.forEach((c: number, h: number) => { hourTotals[h] += c }))
  const bestHourIdx = hourTotals.indexOf(Math.max(...hourTotals))

  const dayRevenue = useMemo(() => {
    const data = Array(7).fill(0) as number[]
    completedBookings.forEach(b => {
      const day = getDay(new Date(b.dateTime))
      data[day] += allTransactions.filter(t => t.bookingId === b.id && t.type === 'income').reduce((s, t) => s + t.amount, 0)
    })
    return data
  }, [completedBookings, allTransactions])
  const maxDayRev = Math.max(1, ...dayRevenue)

  // Trends: 12-month data
  const monthly = useMemo(() => {
    const now = new Date()
    const start = subMonths(startOfMonth(now), 11)
    const months = eachMonthOfInterval({ start, end: now })
    return months.map(m => {
      const mTxns = allTransactions.filter(t => {
        const td = new Date(t.date)
        return td.getFullYear() === m.getFullYear() && td.getMonth() === m.getMonth()
      })
      const income = mTxns.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
      const expenses = mTxns.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
      const bCount = allBookings.filter(b => {
        const bd = new Date(b.dateTime)
        return bd.getFullYear() === m.getFullYear() && bd.getMonth() === m.getMonth() && b.status === 'Completed'
      }).length
      return { month: m, label: fmtShortMonth(m), income, expenses, bookings: bCount }
    })
  }, [allTransactions, allBookings])

  const currentMonth = monthly[monthly.length - 1]
  const prevMonth = monthly.length >= 2 ? monthly[monthly.length - 2] : null
  const momChange = prevMonth && prevMonth.income > 0
    ? Math.round(((currentMonth.income - prevMonth.income) / prevMonth.income) * 100)
    : 0
  const maxMonthlyIncome = Math.max(1, ...monthly.map(m => m.income))
  const maxMonthlyBookings = Math.max(1, ...monthly.map(m => m.bookings))

  // Client analytics
  const clientStats = useMemo(() => {
    return clients.map(c => {
      const cb = allBookings.filter(b => b.clientId === c.id)
      const completed = cb.filter(b => b.status === 'Completed')
      const cancelled = cb.filter(b => b.status === 'Cancelled' || b.status === 'No Show')
      const revenue = completed.reduce((s, b) =>
        s + allTransactions.filter(t => t.bookingId === b.id && t.type === 'income').reduce((ts, t) => ts + t.amount, 0), 0)
      const cancelRate = cb.length > 0 ? Math.round((cancelled.length / cb.length) * 100) : 0
      return { client: c, bookingCount: completed.length, revenue, cancelRate, totalBookings: cb.length }
    }).filter(s => s.totalBookings > 0)
  }, [clients, allBookings, allTransactions])

  const topClients = useMemo(() => [...clientStats].sort((a, b) => b.revenue - a.revenue).slice(0, 10), [clientStats])
  const unreliableClients = useMemo(() => clientStats.filter(s => s.cancelRate >= 30 && s.totalBookings >= 2).sort((a, b) => b.cancelRate - a.cancelRate), [clientStats])

  const retentionMetrics = useMemo(() => {
    const clientsWithCompleted = new Set(completedBookings.map(b => b.clientId))
    const totalWithBookings = clientsWithCompleted.size
    const repeatClients = clients.filter(c => completedBookings.filter(b => b.clientId === c.id).length >= 2)
    const oneTimeClients = clients.filter(c => completedBookings.filter(b => b.clientId === c.id).length === 1)
    const repeatRate = totalWithBookings > 0 ? Math.round((repeatClients.length / totalWithBookings) * 100) : 0
    const avgBookingsPerRepeat = repeatClients.length > 0
      ? Math.round(repeatClients.reduce((s, c) => s + completedBookings.filter(b => b.clientId === c.id).length, 0) / repeatClients.length * 10) / 10
      : 0
    // New vs returning this month
    const mStart = startOfMonth(new Date())
    const thisMonthClients = new Set(completedBookings.filter(b => new Date(b.dateTime) >= mStart).map(b => b.clientId))
    let newThisMonth = 0, returningThisMonth = 0
    thisMonthClients.forEach(cid => {
      if (completedBookings.some(b => b.clientId === cid && new Date(b.dateTime) < mStart)) returningThisMonth++
      else newThisMonth++
    })
    // Avg revenue comparison
    const revOf = (cs: typeof clients) => cs.length > 0 ? Math.round(cs.reduce((s, c) =>
      s + allTransactions.filter(t => completedBookings.some(b => b.id === t.bookingId && b.clientId === c.id) && t.type === 'income').reduce((ts, t) => ts + t.amount, 0), 0
    ) / cs.length) : 0
    return {
      repeatCount: repeatClients.length, oneTimeCount: oneTimeClients.length, repeatRate, avgBookingsPerRepeat,
      newThisMonth, returningThisMonth, avgRepeatRevenue: revOf(repeatClients), avgOneTimeRevenue: revOf(oneTimeClients),
    }
  }, [clients, completedBookings, allTransactions])

  const clientSourceCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    clients.forEach(c => { if ((c as any).referenceSource) counts[(c as any).referenceSource] = (counts[(c as any).referenceSource] ?? 0) + 1 })
    return Object.entries(counts).sort((a, b) => b[1] - a[1])
  }, [clients])

  if (rawTransactions === undefined || rawBookings === undefined || rawClients === undefined || rawPayments === undefined) return <FinancesPageSkeleton />

  return (
    <div className="pb-20">
      <PageHeader title="Finances">
        <button onClick={() => setShowCardSettings(true)} className="p-2 rounded-lg" style={{ color: 'var(--text-secondary)' }} aria-label="Customize reports">
          <Settings2 size={18} />
        </button>
        <button onClick={() => setShowEditor(true)} className="p-2 rounded-lg text-purple-500" aria-label="Add transaction">
          <Plus size={20} />
        </button>
      </PageHeader>

      <div className="px-4 py-3 max-w-lg mx-auto space-y-4">
        {/* Period Selector */}
        <div className="flex gap-1 p-1 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)' }}>
          {(['Week', 'Month', 'Quarter', 'Year', 'All'] as TimePeriod[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              aria-pressed={period === p}
              className={`flex-1 py-2 rounded-md text-xs font-medium transition-colors ${
                period === p ? 'bg-purple-600 text-white' : ''
              }`}
              style={period !== p ? { color: 'var(--text-secondary)' } : {}}
            >
              {p}
            </button>
          ))}
        </div>

        {/* Customization hint — shown once */}
        {!hintDismissed && (
          <button
            onClick={() => { setHintDismissed(true); setShowCardSettings(true) }}
            className="flex items-center gap-3 w-full p-3 rounded-xl text-left active:opacity-70"
            style={{ backgroundColor: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.2)' }}
          >
            <Settings2 size={16} className="text-purple-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-purple-500">Customize your dashboard</p>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                Tap here to choose which reports appear — including trends, timing heatmaps, and client analytics.
              </p>
            </div>
            <X size={14} className="shrink-0" style={{ color: 'var(--text-secondary)' }} onClick={e => { e.stopPropagation(); setHintDismissed(true) }} />
          </button>
        )}

        {/* Goal Progress */}
        {isCardVisible('goal') && period !== 'All' && (hasGoal ? (
          <Card onClick={() => setShowGoalEditor(true)}>
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{period}ly Income Goal</p>
              </div>
              {goalProgress >= 1 ? (
                <span className="text-lg">✅</span>
              ) : (
                <ChevronRight size={16} style={{ color: 'var(--text-secondary)' }} />
              )}
            </div>
            <div className="w-full h-2.5 rounded-full mb-3" style={{ backgroundColor: 'var(--bg-secondary)' }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${goalProgress * 100}%`,
                  backgroundColor: goalProgress >= 1 ? '#22c55e' : '#a855f7',
                }}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{formatCurrency(goalIncome)}</p>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>of {formatCurrency(goalTarget)}</p>
              </div>
              <div className="text-right">
                <p className={`text-lg font-bold ${goalProgress >= 1 ? 'text-green-500' : ''}`}
                  style={goalProgress < 1 ? { color: 'var(--text-primary)' } : {}}
                >
                  {Math.round(goalProgress * 100)}%
                </p>
                {goalProgress < 1 && goalRemaining > 0 && (
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {formatCurrency(goalRemaining)} to go
                  </p>
                )}
              </div>
            </div>
            {goalProgress < 1 && goalDaysLeft > 0 && (
              <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                {goalDaysLeft} days left · Need {formatCurrency(Math.round(goalRemaining / goalDaysLeft))}/day
              </p>
            )}
          </Card>
        ) : (
          <button
            onClick={() => setShowGoalEditor(true)}
            className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-medium text-purple-500"
            style={{ backgroundColor: 'rgba(168,85,247,0.1)' }}
          >
            <Target size={16} /> Set {period}ly Income Goal
          </button>
        ))}

        {/* Stats Grid */}
        {isCardVisible('stats') && (
        <>
        <div className="grid grid-cols-2 gap-3">
          <StatCard icon={<ArrowDownCircle size={18} />} color="#22c55e" label="Income" value={formatCurrency(totalIncome)} />
          <StatCard icon={<ArrowUpCircle size={18} />} color="#ef4444" label="Expenses" value={formatCurrency(totalExpenses)} />
          <StatCard
            icon={<span className="text-base">=</span>}
            color={netIncome >= 0 ? '#3b82f6' : '#f97316'}
            label="Net"
            value={formatCurrency(netIncome)}
          />
          <StatCard icon={<span className="text-sm">📊</span>} color="#a855f7" label="Avg Booking" value={formatCurrency(avgBooking)} />
        </div>
        </>
        )}

        {/* Tax Estimate */}
        {isCardVisible('tax') && (
        <Card onClick={() => setShowTaxSettings(true)}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Percent size={16} className="text-orange-500" />
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Tax Estimate</p>
            </div>
            <ChevronRight size={16} style={{ color: 'var(--text-secondary)' }} />
          </div>
          <div className="flex gap-4">
            <div className="flex-1">
              <p className="text-xs mb-0.5" style={{ color: 'var(--text-secondary)' }}>Est. Tax Owed</p>
              <p className="text-lg font-bold text-orange-500">{formatCurrency(estimatedTax)}</p>
            </div>
            <div className="w-px" style={{ backgroundColor: 'var(--border)' }} />
            <div className="flex-1">
              <p className="text-xs mb-0.5" style={{ color: 'var(--text-secondary)' }}>Set Aside ({setAsideRate}%)</p>
              <p className="text-lg font-bold text-blue-500">{formatCurrency(suggestedSetAside)}</p>
            </div>
          </div>
        </Card>
        )}

        {/* Revenue by Booking Type */}
        {isCardVisible('bookingTypes') && bookingTypeBreakdown.length > 0 && (() => {
          const totalTypeRevenue = bookingTypeBreakdown.reduce((s, d) => s + d.revenue, 0)
          return (
          <Card>
            <div className="flex items-center gap-2 mb-3">
              <MapPin size={16} className="text-purple-500" />
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Revenue by Booking Type</p>
            </div>
            <div className="flex items-center gap-4">
              {/* Donut */}
              <DonutChart
                slices={bookingTypeBreakdown.map(d => ({
                  value: d.revenue,
                  color: LOCATION_COLORS[d.type] ?? '#6b7280',
                }))}
                centerLabel={formatCurrency(totalTypeRevenue)}
                centerSub="total"
              />
              {/* Legend */}
              <div className="flex-1 space-y-2">
                {bookingTypeBreakdown.map(item => (
                  <div key={item.type} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: LOCATION_COLORS[item.type] ?? '#6b7280' }} />
                      <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{item.type}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-medium text-green-500">{formatCurrency(item.revenue)}</span>
                      <span className="text-xs ml-1" style={{ color: 'var(--text-secondary)' }}>({item.count})</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {/* Per-booking averages */}
            <div className="flex gap-2 mt-3 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
              {bookingTypeBreakdown.map(item => (
                <div key={item.type} className="flex-1 text-center p-1.5 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                  <p className="text-xs font-bold" style={{ color: LOCATION_COLORS[item.type] ?? '#6b7280' }}>
                    {formatCurrency(Math.round(item.revenue / item.count))}
                  </p>
                  <p className="text-[9px]" style={{ color: 'var(--text-secondary)' }}>avg/{item.type.toLowerCase()}</p>
                </div>
              ))}
            </div>
          </Card>
          )
        })()}

        {/* Payment Methods */}
        {isCardVisible('paymentMethods') && paymentMethodBreakdown.length > 0 && (() => {
          const totalPaymentIncome = paymentMethodBreakdown.reduce((s, d) => s + d.amount, 0)
          return (
          <Card>
            <div className="flex items-center gap-2 mb-3">
              <CreditCard size={16} className="text-blue-500" />
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Payment Methods</p>
            </div>
            <div className="flex items-center gap-4">
              {/* Donut */}
              <DonutChart
                slices={paymentMethodBreakdown.map(d => ({
                  value: d.amount,
                  color: PAYMENT_COLORS[d.method] ?? '#6b7280',
                }))}
                centerLabel={formatCurrency(totalPaymentIncome)}
                centerSub="income"
              />
              {/* Legend */}
              <div className="flex-1 space-y-2">
                {paymentMethodBreakdown.map(item => (
                  <div key={item.method} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: PAYMENT_COLORS[item.method] ?? '#6b7280' }} />
                      <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{item.method}</span>
                      <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>{item.pct}%</span>
                    </div>
                    <span className="text-sm font-medium text-green-500">{formatCurrency(item.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>
          )
        })()}

        {/* Expense Breakdown */}
        {isCardVisible('expenses') && expenseBreakdown.length > 0 && (() => {
          const totalExpenseAmount = expenseBreakdown.reduce((s, d) => s + d.amount, 0)
          return (
          <Card>
            <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Top Expenses</p>
            <div className="flex items-center gap-4">
              {/* Donut */}
              <DonutChart
                slices={expenseBreakdown.map((d, i) => ({
                  value: d.amount,
                  color: EXPENSE_COLORS[i % EXPENSE_COLORS.length],
                }))}
                centerLabel={formatCurrency(totalExpenseAmount)}
                centerSub="spent"
              />
              {/* Legend */}
              <div className="flex-1 space-y-2">
                {expenseBreakdown.map((item, i) => (
                  <div key={item.category} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: EXPENSE_COLORS[i % EXPENSE_COLORS.length] }} />
                      <span className="text-sm capitalize" style={{ color: 'var(--text-primary)' }}>{item.category}</span>
                      <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>{item.pct}%</span>
                    </div>
                    <span className="text-sm font-medium text-red-500">{formatCurrency(item.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>
          )
        })()}

        {/* Outstanding Balances */}
        {isCardVisible('outstanding') && bookingsWithBalance.length > 0 && (
          <Card>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <AlertCircle size={16} className="text-orange-500" />
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Outstanding Balances</p>
              </div>
              <span className="text-sm font-bold text-orange-500">{formatCurrency(totalOutstanding)}</span>
            </div>
            <div className="space-y-2">
              {bookingsWithBalance.slice(0, 5).map(({ booking, owing, client }) => (
                  <button
                    key={booking.id}
                    className="flex items-center justify-between w-full text-left active:opacity-70"
                    onClick={() => onOpenBooking?.(booking.id)}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
                        {client?.alias ?? 'Unknown'}
                      </span>
                      <StatusBadge text={booking.status} color={bookingStatusColors[booking.status]} />
                    </div>
                    <span className="text-sm text-orange-500">{formatCurrency(owing)}</span>
                  </button>
              ))}
              {bookingsWithBalance.length > 5 && (
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  + {bookingsWithBalance.length - 5} more
                </p>
              )}
            </div>
          </Card>
        )}

        {/* Recent Transactions */}
        {isCardVisible('transactions') && (
        <Card>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Recent Transactions</p>
            <button
              onClick={() => setShowAllTransactions(true)}
              className="text-xs text-purple-500 font-medium"
            >
              See All
            </button>
          </div>
          {allTransactions.length === 0 ? (
            <p className="text-sm text-center py-4" style={{ color: 'var(--text-secondary)' }}>
              No transactions yet
            </p>
          ) : (
            <div className="space-y-2">
              {allTransactions.slice(0, 5).map(t => (
                <div key={t.id} className="flex items-center gap-3">
                  {t.type === 'income' ? (
                    <ArrowDownCircle size={18} className="text-green-500 shrink-0" />
                  ) : (
                    <ArrowUpCircle size={18} className="text-red-500 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm capitalize truncate" style={{ color: 'var(--text-primary)' }}>{t.category}</p>
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {fmtShortDate(new Date(t.date))}
                      {t.paymentMethod ? ` · ${t.paymentMethod}` : ''}
                    </p>
                  </div>
                  <p className={`text-sm font-medium ${t.type === 'income' ? 'text-green-500' : 'text-red-500'}`}>
                    {t.type === 'income' ? '+' : '-'}{formatCurrency(t.amount)}
                  </p>
                </div>
              ))}
            </div>
          )}
          {/* Import / Export link */}
          <button
            onClick={() => setShowImportExport(true)}
            className="flex items-center justify-center gap-2 w-full mt-3 pt-3 text-xs font-semibold active:opacity-70"
            style={{ borderTop: '1px solid var(--border)', color: '#a855f7' }}
          >
            <ArrowDownUp size={14} /> Import / Export
          </button>
        </Card>
        )}

        {/* ── TRENDS ── */}

        {/* Month over Month */}
        {isCardVisible('monthOverMonth') && (
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
                  {momChange >= 0 ? <TrendingUp size={18} className="text-green-500" /> : <TrendingDown size={18} className="text-red-500" />}
                  <span className={`text-xl font-bold ${momChange >= 0 ? 'text-green-500' : 'text-red-500'}`}>{Math.abs(momChange)}%</span>
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* 12-Month Income Trend */}
        {isCardVisible('incomeTrend') && (
          <Card>
            <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>12-Month Income Trend</p>
            {monthly.every(m => m.income === 0) ? (
              <p className="text-sm text-center py-4" style={{ color: 'var(--text-secondary)' }}>No data available</p>
            ) : (
              <div className="relative h-36">
                <svg viewBox="0 0 300 120" className="w-full h-full" preserveAspectRatio="none">
                  <path d={buildAreaPath(monthly.map(m => m.income / maxMonthlyIncome), 300, 120)} fill="rgba(34,197,94,0.1)" />
                  <path d={buildLinePath(monthly.map(m => m.income / maxMonthlyIncome), 300, 120)} fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  {monthly.map((m, i) => {
                    const x = (i / Math.max(1, monthly.length - 1)) * 300
                    const y = 120 - (m.income / maxMonthlyIncome) * 110 - 5
                    return m.income > 0 ? <circle key={i} cx={x} cy={y} r="3" fill="#22c55e" /> : null
                  })}
                </svg>
              </div>
            )}
            <div className="flex mt-1">
              {monthly.map((m, i) => (
                <div key={i} className="flex-1 text-center">
                  {(monthly.length <= 6 || i % 2 === 0) && <span className="text-[8px]" style={{ color: 'var(--text-secondary)' }}>{m.label}</span>}
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Booking Volume */}
        {isCardVisible('bookingVolume') && (
          <Card>
            <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Booking Volume</p>
            <div className="flex items-end gap-1 h-28">
              {monthly.map((m, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                  {m.bookings > 0 && <span className="text-[8px] font-medium" style={{ color: 'var(--text-secondary)' }}>{m.bookings}</span>}
                  <div className="w-full rounded-t" style={{
                    height: `${Math.max(2, (m.bookings / maxMonthlyBookings) * 100)}%`,
                    background: m.bookings > 0 ? 'linear-gradient(to top, rgba(168,85,247,0.4), rgba(168,85,247,0.8))' : 'var(--bg-secondary)',
                    minHeight: '3px',
                  }} />
                  <span className="text-[8px]" style={{ color: 'var(--text-secondary)' }}>{m.label}</span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Monthly Breakdown */}
        {isCardVisible('monthlyBreakdown') && (
          <Card>
            <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Monthly Breakdown</p>
            <div className="space-y-2">
              {[...monthly].reverse().slice(0, 6).map(m => (
                <div key={m.label + m.month.getFullYear()} className="flex items-center justify-between py-1" style={{ borderBottom: '1px solid var(--border)' }}>
                  <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{`${fmtShortMonth(m.month)} ${m.month.getFullYear()}`}</span>
                  <div className="text-right">
                    <p className="text-sm font-medium text-green-500">{formatCurrency(m.income)}</p>
                    <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>{m.bookings} bookings</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* ── TIMING ── */}

        {/* Peak Times */}
        {isCardVisible('peakTimes') && (
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
                <p className="text-xl font-bold text-purple-500">{hourTotals[bestHourIdx] > 0 ? `${fmtHour(bestHourIdx)} – ${fmtHour((bestHourIdx + 2) % 24)}` : 'N/A'}</p>
              </div>
            </div>
          </Card>
        )}

        {/* Booking Heatmap */}
        {isCardVisible('heatmap') && (
          <Card>
            <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Booking Heatmap</p>
            <p className="text-[10px] mb-3" style={{ color: 'var(--text-secondary)' }}>Darker = more bookings</p>
            <div className="overflow-x-auto -mx-3">
              <div className="min-w-[420px] px-3">
                <div className="flex gap-[2px] mb-[2px]">
                  <div className="w-8 shrink-0" />
                  {DISPLAY_HOURS.map(h => <div key={h} className="flex-1 text-center"><span className="text-[8px]" style={{ color: 'var(--text-secondary)' }}>{fmtHour(h)}</span></div>)}
                </div>
                {DAYS.map((day, dayIdx) => (
                  <div key={day} className="flex gap-[2px] mb-[2px]">
                    <div className="w-8 shrink-0 flex items-center"><span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>{day}</span></div>
                    {DISPLAY_HOURS.map(hour => {
                      const count = heatmap[dayIdx][hour] as number
                      return (
                        <div key={hour} className="flex-1 aspect-square rounded-[3px] flex items-center justify-center"
                          style={{ backgroundColor: count === 0 ? 'var(--bg-secondary)' : `rgba(168,85,247,${0.15 + (count / heatmapMax) * 0.85})`, minHeight: '20px' }}>
                          {count > 0 && <span className="text-[8px] font-bold" style={{ color: count > heatmapMax * 0.5 ? 'white' : 'var(--text-primary)' }}>{count}</span>}
                        </div>
                      )
                    })}
                  </div>
                ))}
                <div className="flex items-center justify-center gap-2 mt-2">
                  <span className="text-[9px]" style={{ color: 'var(--text-secondary)' }}>Less</span>
                  {[0, 0.25, 0.5, 0.75, 1].map((intensity, i) => (
                    <div key={i} className="w-4 h-4 rounded-[3px]" style={{ backgroundColor: intensity === 0 ? 'var(--bg-secondary)' : `rgba(168,85,247,${0.15 + intensity * 0.85})` }} />
                  ))}
                  <span className="text-[9px]" style={{ color: 'var(--text-secondary)' }}>More</span>
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Revenue by Day of Week */}
        {isCardVisible('revenueByDay') && (
          <Card>
            <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Revenue by Day of Week</p>
            <div className="flex items-end gap-2 h-32">
              {DAYS.map((day, i) => (
                <div key={day} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                  <span className="text-[9px] font-medium" style={{ color: 'var(--text-secondary)' }}>{dayRevenue[i] > 0 ? formatCurrency(dayRevenue[i]) : ''}</span>
                  <div className="w-full rounded-t transition-all" style={{
                    height: `${Math.max(2, (dayRevenue[i] / maxDayRev) * 100)}%`,
                    background: dayRevenue[i] > 0 ? 'linear-gradient(to top, rgba(168,85,247,0.4), rgba(168,85,247,0.8))' : 'var(--bg-secondary)',
                    minHeight: '4px',
                  }} />
                  <span className="text-[9px]" style={{ color: 'var(--text-secondary)' }}>{day}</span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* ── CLIENTS ── */}

        {/* Client Retention */}
        {isCardVisible('retention') && (
          <Card>
            <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Client Retention</p>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="text-center p-2.5 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                <p className="text-2xl font-bold text-purple-500">{retentionMetrics.repeatRate}%</p>
                <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>Repeat Client Rate</p>
              </div>
              <div className="text-center p-2.5 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{retentionMetrics.avgBookingsPerRepeat}</p>
                <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>Avg Bookings / Repeat</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-2.5 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)' }}>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-purple-500" /><span className="text-xs" style={{ color: 'var(--text-primary)' }}>Repeat</span></div>
                  <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{retentionMetrics.repeatCount}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: 'var(--border)' }} /><span className="text-xs" style={{ color: 'var(--text-primary)' }}>One-time</span></div>
                  <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{retentionMetrics.oneTimeCount}</span>
                </div>
              </div>
              <div className="w-px h-10" style={{ backgroundColor: 'var(--border)' }} />
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-green-500" /><span className="text-xs" style={{ color: 'var(--text-primary)' }}>Returning</span></div>
                  <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{retentionMetrics.returningThisMonth}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-blue-500" /><span className="text-xs" style={{ color: 'var(--text-primary)' }}>New</span></div>
                  <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{retentionMetrics.newThisMonth}</span>
                </div>
              </div>
            </div>
            <p className="text-[10px] mt-1.5 text-center" style={{ color: 'var(--text-secondary)' }}>This month: new vs returning clients</p>
          </Card>
        )}

        {/* Repeat vs One-time Revenue */}
        {isCardVisible('repeatRevenue') && (retentionMetrics.avgRepeatRevenue > 0 || retentionMetrics.avgOneTimeRevenue > 0) && (
          <Card>
            <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Avg Revenue per Client</p>
            <div className="flex gap-3">
              <div className="flex-1 text-center p-3 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                <p className="text-lg font-bold text-purple-500">{formatCurrency(retentionMetrics.avgRepeatRevenue)}</p>
                <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>Repeat Clients</p>
              </div>
              <div className="flex-1 text-center p-3 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                <p className="text-lg font-bold" style={{ color: 'var(--text-secondary)' }}>{formatCurrency(retentionMetrics.avgOneTimeRevenue)}</p>
                <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>One-time Clients</p>
              </div>
            </div>
            {retentionMetrics.avgRepeatRevenue > retentionMetrics.avgOneTimeRevenue && retentionMetrics.avgOneTimeRevenue > 0 && (
              <p className="text-[10px] mt-2 text-center text-purple-500">
                Repeat clients bring {Math.round(retentionMetrics.avgRepeatRevenue / retentionMetrics.avgOneTimeRevenue)}× more revenue on average
              </p>
            )}
          </Card>
        )}

        {/* Top Clients */}
        {isCardVisible('topClients') && (
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
        )}

        {/* Reliability Concerns */}
        {isCardVisible('reliability') && unreliableClients.length > 0 && (
          <Card>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Reliability Concerns</p>
              <span className="text-sm">⚠️</span>
            </div>
            <p className="text-[10px] mb-3" style={{ color: 'var(--text-secondary)' }}>30%+ cancellation / no-show rate</p>
            <div className="space-y-2">
              {unreliableClients.map(item => (
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
        {isCardVisible('clientSources') && clientSourceCounts.length > 0 && (
          <Card>
            <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Client Sources</p>
            <div className="space-y-2">
              {clientSourceCounts.map(([source, count]) => (
                <div key={source} className="flex items-center justify-between">
                  <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{source}</span>
                  <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{count}</span>
                </div>
              ))}
            </div>
          </Card>
        )}

      </div>

      {/* Modals */}
      <TransactionEditor isOpen={showEditor} onClose={() => setShowEditor(false)} />
      <GoalEditor isOpen={showGoalEditor} onClose={() => setShowGoalEditor(false)} />
      <TaxSettingsEditor isOpen={showTaxSettings} onClose={() => setShowTaxSettings(false)} />
      <AllTransactionsModal isOpen={showAllTransactions} onClose={() => setShowAllTransactions(false)} />
      <ImportExportModal isOpen={showImportExport} onClose={() => setShowImportExport(false)} initialTab="transactions" />
      <CardSettingsModal
        isOpen={showCardSettings}
        onClose={() => setShowCardSettings(false)}
        visible={visibleCards}
        onChange={setVisibleCards}
      />
    </div>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// STAT CARD
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function StatCard({ icon, color, label, value }: {
  icon: React.ReactNode; color: string; label: string; value: string
}) {
  return (
    <div
      className="p-3 rounded-xl border"
      style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
    >
      <div style={{ color }} className="mb-2">{icon}</div>
      <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{value}</p>
      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{label}</p>
    </div>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DONUT CHART — reusable SVG pie/donut
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function DonutChart({ slices, centerLabel, centerSub, size = 110, stroke = 20 }: {
  slices: { value: number; color: string }[]
  centerLabel: string
  centerSub?: string
  size?: number
  stroke?: number
}) {
  const total = slices.reduce((s, d) => s + d.value, 0)
  if (total === 0) return null

  const r = (size - stroke) / 2
  const cx = size / 2
  const cy = size / 2
  const circumference = 2 * Math.PI * r

  let accumulated = 0
  const arcs = slices.map(s => {
    const pct = s.value / total
    const offset = circumference * (1 - accumulated) + circumference * 0.25 // start at top
    accumulated += pct
    return {
      ...s,
      dashArray: `${circumference * pct} ${circumference * (1 - pct)}`,
      dashOffset: offset,
    }
  })

  return (
    <div className="shrink-0 relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Background ring */}
        <circle cx={cx} cy={cy} r={r} fill="none"
          stroke="var(--bg-secondary)" strokeWidth={stroke} />
        {/* Slices */}
        {arcs.map((arc, i) => (
          <circle
            key={i}
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke={arc.color}
            strokeWidth={stroke}
            strokeDasharray={arc.dashArray}
            strokeDashoffset={arc.dashOffset}
            strokeLinecap="butt"
            style={{ transition: 'stroke-dasharray 0.4s ease, stroke-dashoffset 0.4s ease' }}
          />
        ))}
      </svg>
      {/* Center text */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xs font-bold" style={{ color: 'var(--text-primary)', lineHeight: 1.2 }}>
          {centerLabel}
        </span>
        {centerSub && (
          <span className="text-[9px]" style={{ color: 'var(--text-secondary)' }}>{centerSub}</span>
        )}
      </div>
    </div>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CARD SETTINGS — toggle visible report cards
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function CardSettingsModal({ isOpen, onClose, visible, onChange }: {
  isOpen: boolean
  onClose: () => void
  visible: CardKey[]
  onChange: (v: CardKey[]) => void
}) {
  function toggle(key: CardKey) {
    if (visible.includes(key)) {
      onChange(visible.filter(k => k !== key))
    } else {
      onChange([...visible, key])
    }
  }

  function toggleGroup(group: CardGroup) {
    const allOn = group.keys.every(k => visible.includes(k))
    if (allOn) {
      onChange(visible.filter(k => !group.keys.includes(k)))
    } else {
      onChange([...new Set([...visible, ...group.keys])])
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Customize Reports">
      <div className="px-4 py-3" style={{ backgroundColor: 'var(--bg-secondary)' }}>
        <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>
          Choose which cards appear on your dashboard. Changes save automatically.
        </p>
        <div className="space-y-4">
          {CARD_GROUPS.map(group => {
            const groupOn = group.keys.filter(k => visible.includes(k)).length
            return (
              <div key={group.label}>
                <button
                  onClick={() => toggleGroup(group)}
                  className="flex items-center justify-between w-full mb-1.5"
                >
                  <span className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>{group.label}</span>
                  <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                    {groupOn}/{group.keys.length}
                  </span>
                </button>
                <div className="space-y-0.5">
                  {group.keys.map(key => (
                    <button
                      key={key}
                      onClick={() => toggle(key)}
                      role="checkbox"
                      aria-checked={visible.includes(key)}
                      className="flex items-center gap-3 w-full p-2.5 rounded-lg active:opacity-70"
                      style={{ backgroundColor: 'var(--bg-primary)' }}
                    >
                      <div
                        className="w-5 h-5 rounded flex items-center justify-center shrink-0"
                        style={{
                          backgroundColor: visible.includes(key) ? '#a855f7' : 'transparent',
                          border: visible.includes(key) ? 'none' : '2px solid var(--border)',
                        }}
                      >
                        {visible.includes(key) && <Check size={12} className="text-white" strokeWidth={3} />}
                      </div>
                      <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
                        {CARD_LABELS[key]}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
        <div className="flex gap-2 mt-4 pb-4">
          <button
            onClick={() => onChange([...ALL_CARDS])}
            className="flex-1 py-2.5 rounded-lg text-sm font-medium"
            style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
          >
            Show All
          </button>
          <button
            onClick={() => onChange([...DEFAULT_VISIBLE])}
            className="flex-1 py-2.5 rounded-lg text-sm font-medium"
            style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
          >
            Defaults
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-purple-600 text-white"
          >
            Done
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GOAL EDITOR
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function GoalEditor({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [storedWeekly, setStoredWeekly] = useLocalStorage('goalWeekly', 0)
  const [storedMonthly, setStoredMonthly] = useLocalStorage('goalMonthly', 0)
  const [storedQuarterly, setStoredQuarterly] = useLocalStorage('goalQuarterly', 0)
  const [storedYearly, setStoredYearly] = useLocalStorage('goalYearly', 0)

  const [weekly, setWeekly] = useState('')
  const [monthly, setMonthly] = useState('')
  const [quarterly, setQuarterly] = useState('')
  const [yearly, setYearly] = useState('')

  // Sync when opening
  const [wasOpen, setWasOpen] = useState(false)
  if (isOpen && !wasOpen) {
    setWeekly(storedWeekly > 0 ? storedWeekly.toString() : '')
    setMonthly(storedMonthly > 0 ? storedMonthly.toString() : '')
    setQuarterly(storedQuarterly > 0 ? storedQuarterly.toString() : '')
    setYearly(storedYearly > 0 ? storedYearly.toString() : '')
  }
  if (isOpen !== wasOpen) setWasOpen(isOpen)

  function save() {
    setStoredWeekly(parseInt(weekly) || 0)
    setStoredMonthly(parseInt(monthly) || 0)
    setStoredQuarterly(parseInt(quarterly) || 0)
    setStoredYearly(parseInt(yearly) || 0)
    onClose()
  }

  function clearAll() {
    setStoredWeekly(0)
    setStoredMonthly(0)
    setStoredQuarterly(0)
    setStoredYearly(0)
    onClose()
  }

  const hasAny = storedWeekly > 0 || storedMonthly > 0 || storedQuarterly > 0 || storedYearly > 0

  const fields = [
    { label: 'Weekly', id: 'goal-weekly', value: weekly, set: setWeekly },
    { label: 'Monthly', id: 'goal-monthly', value: monthly, set: setMonthly },
    { label: 'Quarterly', id: 'goal-quarterly', value: quarterly, set: setQuarterly },
    { label: 'Yearly', id: 'goal-yearly', value: yearly, set: setYearly },
  ]

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Income Goals"
      actions={
        <button onClick={save} className="p-2 text-purple-500" aria-label="Save goals">
          <Check size={20} />
        </button>
      }
    >
      <div className="px-4 py-2" style={{ backgroundColor: 'var(--bg-secondary)' }}>
        <FieldHint text="Set a target for any period. The matching goal appears when you switch tabs on the Finances page." />
        <div className="space-y-3 mt-3">
          {fields.map(f => (
            <div key={f.label}>
              <label htmlFor={f.id} className="text-xs font-semibold block mb-1" style={{ color: 'var(--text-primary)' }}>{f.label}</label>
              <input type="text" inputMode="numeric"
                id={f.id}
                value={f.value}
                onChange={e => f.set(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="0"
                className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                style={fieldInputStyle} />
            </div>
          ))}
        </div>

        <div className="py-4 space-y-3">
          <button onClick={save}
            className="w-full py-3 rounded-xl font-semibold text-sm bg-purple-600 text-white active:bg-purple-700">
            Save Goals
          </button>
          {hasAny && (
            <button onClick={clearAll} className="w-full py-2 text-sm text-red-500 font-medium">
              Clear All Goals
            </button>
          )}
        </div>
        <div className="h-8" />
      </div>
    </Modal>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TAX SETTINGS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function TaxSettingsEditor({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [storedTaxRate, setStoredTaxRate] = useLocalStorage('taxRate', 25)
  const [storedSetAside, setStoredSetAside] = useLocalStorage('setAsideRate', 30)
  const [taxRate, setTaxRate] = useState(storedTaxRate)
  const [setAsideRate, setSetAsideRate] = useState(storedSetAside)

  const [wasOpen, setWasOpen] = useState(false)
  if (isOpen && !wasOpen) { setTaxRate(storedTaxRate); setSetAsideRate(storedSetAside) }
  if (isOpen !== wasOpen) setWasOpen(isOpen)

  function save() {
    setStoredTaxRate(taxRate)
    setStoredSetAside(setAsideRate)
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Tax Settings"
      actions={
        <button onClick={save} className="p-2 text-purple-500" aria-label="Save tax settings">
          <Check size={20} />
        </button>
      }
    >
      <div className="px-4 py-2" style={{ backgroundColor: 'var(--bg-secondary)' }}>
        <SectionLabel label="Tax Rate" />
        <div className="mb-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm" style={{ color: 'var(--text-primary)' }}>Estimated Tax Rate</span>
            <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>{taxRate}%</span>
          </div>
          <input type="range" min={0} max={50} step={1} value={taxRate}
            onChange={e => setTaxRate(parseInt(e.target.value))}
            aria-label="Estimated tax rate"
            className="w-full accent-purple-500" />
          <FieldHint text="Your estimated tax bracket. Used to calculate how much tax you might owe." />
        </div>

        <SectionLabel label="Savings" />
        <div className="mb-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm" style={{ color: 'var(--text-primary)' }}>Set Aside Percentage</span>
            <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>{setAsideRate}%</span>
          </div>
          <input type="range" min={0} max={50} step={1} value={setAsideRate}
            onChange={e => setSetAsideRate(parseInt(e.target.value))}
            aria-label="Set aside percentage"
            className="w-full accent-purple-500" />
          <FieldHint text="Set aside slightly more than your tax rate to cover self-employment tax." />
        </div>

        <div className="py-4">
          <button onClick={save}
            className="w-full py-3 rounded-xl font-semibold text-sm bg-purple-600 text-white active:bg-purple-700">
            Save Settings
          </button>
        </div>
        <div className="h-8" />
      </div>
    </Modal>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ALL TRANSACTIONS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function AllTransactionsModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const allTransactions = useLiveQuery(() => db.transactions.orderBy('date').reverse().toArray()) ?? []
  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense'>('all')
  const [search, setSearch] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const filtered = allTransactions
    .filter(t => filterType === 'all' || t.type === filterType)
    .filter(t => !search ||
      t.category.toLowerCase().includes(search.toLowerCase()) ||
      (t.notes ?? '').toLowerCase().includes(search.toLowerCase())
    )

  return (
    <>
    <Modal isOpen={isOpen} onClose={onClose} title="All Transactions">
      <div style={{ backgroundColor: 'var(--bg-secondary)' }}>
        {/* Filter */}
        <div className="px-4 pt-3 pb-2">
          <div className="flex gap-1 p-1 rounded-lg mb-3" style={{ backgroundColor: 'var(--bg-primary)' }}>
            {(['all', 'income', 'expense'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilterType(f)}
                aria-pressed={filterType === f}
                className={`flex-1 py-2 rounded-md text-xs font-medium capitalize transition-colors ${
                  filterType === f ? 'bg-purple-600 text-white' : ''
                }`}
                style={filterType !== f ? { color: 'var(--text-secondary)' } : {}}
              >
                {f === 'all' ? 'All' : f === 'income' ? 'Income' : 'Expenses'}
              </button>
            ))}
          </div>
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-lg"
            style={{ backgroundColor: 'var(--bg-primary)' }}
          >
            <Search size={16} style={{ color: 'var(--text-secondary)' }} />
            <input
              type="text"
              placeholder="Search transactions..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 bg-transparent text-sm outline-none"
              style={{ color: 'var(--text-primary)', fontSize: '16px' }}
            />
            {search && (
              <button onClick={() => setSearch('')} className="p-1" aria-label="Clear search">
                <X size={14} style={{ color: 'var(--text-secondary)' }} />
              </button>
            )}
          </div>
        </div>

        {/* Transaction list */}
        <div className="px-4 py-2 space-y-1">
          {filtered.length === 0 ? (
            <p className="text-sm text-center py-8" style={{ color: 'var(--text-secondary)' }}>
              No transactions found
            </p>
          ) : (
            filtered.map(t => (
              <div
                key={t.id}
                className="flex items-center gap-3 p-2.5 rounded-lg"
                style={{ backgroundColor: 'var(--bg-primary)' }}
              >
                {t.type === 'income' ? (
                  <ArrowDownCircle size={18} className="text-green-500 shrink-0" />
                ) : (
                  <ArrowUpCircle size={18} className="text-red-500 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium capitalize truncate" style={{ color: 'var(--text-primary)' }}>
                    {t.category}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {fmtMediumDate(new Date(t.date))}
                    {t.paymentMethod ? ` · ${t.paymentMethod}` : ''}
                    {t.notes ? ` · ${t.notes.slice(0, 30)}` : ''}
                  </p>
                </div>
                <p className={`text-sm font-semibold ${t.type === 'income' ? 'text-green-500' : 'text-red-500'}`}>
                  {t.type === 'income' ? '+' : '-'}{formatCurrency(t.amount)}
                </p>
                <button
                  disabled={deletingId === t.id}
                  onClick={async () => {
                    if (deletingId) return
                    setDeletingId(t.id)
                    try {
                      // Snapshot for undo
                      const txnSnap = await db.transactions.get(t.id)
                      const paySnap = txnSnap?.paymentId ? await db.payments.get(txnSnap.paymentId) : undefined

                      if (txnSnap?.paymentId) {
                        await removeBookingPayment(txnSnap.paymentId)
                        const stillExists = await db.transactions.get(t.id)
                        if (stillExists) await db.transactions.delete(t.id)
                      } else {
                        await db.transactions.delete(t.id)
                      }

                      showUndoToast('Transaction deleted', async () => {
                        if (txnSnap) await db.transactions.put(txnSnap)
                        if (paySnap) {
                          await db.payments.put(paySnap)
                          // Re-sync booking payment booleans
                          const booking = await db.bookings.get(paySnap.bookingId)
                          if (booking) {
                            const allPaid = (await db.payments.where('bookingId').equals(paySnap.bookingId).toArray())
                              .reduce((s, p) => s + p.amount, 0)
                            const depositPaid = (await db.payments.where('bookingId').equals(paySnap.bookingId).filter(p => p.label === 'Deposit').toArray())
                              .reduce((s, p) => s + p.amount, 0)
                            await db.bookings.update(paySnap.bookingId, {
                              paymentReceived: allPaid >= bookingTotal(booking),
                              depositReceived: depositPaid >= booking.depositAmount,
                            })
                          }
                        }
                      })
                    } catch (err) {
                      showToast(`Delete failed: ${(err as Error).message}`)
                    } finally {
                      setDeletingId(null)
                    }
                  }}
                  className="p-1 opacity-40 active:opacity-100"
                  style={{ color: 'var(--text-secondary)' }}
                  aria-label={`Delete ${t.category} transaction`}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Summary */}
        {filtered.length > 0 && (
          <div className="px-4 py-3 mt-2" style={{ borderTop: '1px solid var(--border)' }}>
            <div className="flex justify-between text-sm">
              <span style={{ color: 'var(--text-secondary)' }}>{filtered.length} transactions</span>
              <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                Net: {formatCurrency(
                  filtered.reduce((s, t) => s + (t.type === 'income' ? t.amount : -t.amount), 0)
                )}
              </span>
            </div>
          </div>
        )}
        <div className="h-8" />
      </div>
    </Modal>
    </>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SVG CHART HELPERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function fmtHour(h: number): string {
  if (h === 0) return '12a'
  if (h < 12) return `${h}a`
  if (h === 12) return '12p'
  return `${h - 12}p`
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
