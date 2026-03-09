import { useLiveQuery } from 'dexie-react-hooks'
import {
  Plus, ArrowUpCircle, ArrowDownCircle, Trash2, Target,
  Percent, ChevronRight, AlertCircle, Search, X, Check, ArrowDownUp,
  Settings2, CreditCard, MapPin, TrendingUp, TrendingDown, Edit2
} from 'lucide-react'
import { useState, useMemo } from 'react'
import {
  startOfMonth, startOfWeek, startOfYear, startOfQuarter,
  subMonths, subWeeks, getDay, getHours, eachMonthOfInterval,
  differenceInDays, endOfMonth, endOfWeek, endOfQuarter, endOfYear,
  startOfDay, endOfDay, parseISO
} from 'date-fns'
import { fmtShortMonth, fmtShortDate, fmtMediumDate } from '../../utils/dateFormat'
import { db, formatCurrency, bookingTotal, removeBookingPayment } from '../../db'
import { PageHeader } from '../../components/PageHeader'
import { Card } from '../../components/Card'
import { Modal } from '../../components/Modal'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { SectionLabel, FieldHint, fieldInputStyle } from '../../components/FormFields'
import { ImportExportModal } from '../../components/ImportExport'
import { TransactionEditor } from './TransactionEditor'
import { TourEditor } from './TourEditor'
import { StatusBadge } from '../../components/StatusBadge'
import { bookingStatusColors } from '../../types'
import { useLocalStorage } from '../../hooks/useSettings'
import { showToast, showUndoToast } from '../../components/Toast'
import { FinancesPageSkeleton } from '../../components/Skeleton'
import type { Transaction, LocationType, PaymentMethod } from '../../types'

type TimePeriod = 'Week' | 'Month' | 'Quarter' | 'Year' | 'All' | 'Custom'

// Card visibility — user can toggle which sections appear
type CardKey =
  // Financial
  | 'goal' | 'stats' | 'tax' | 'bookingTypes' | 'paymentMethods' | 'expenses' | 'outstanding' | 'transactions' | 'tours'
  // Trends
  | 'monthOverMonth' | 'weekOverWeek' | 'incomeTrend' | 'bookingVolume' | 'monthlyBreakdown'
  // Timing
  | 'peakTimes' | 'heatmap' | 'revenueByDay'
  // Clients
  | 'retention' | 'repeatRevenue' | 'topClients' | 'clientLTV' | 'reliability' | 'clientSources'

interface CardGroup { label: string; keys: CardKey[] }
const CARD_GROUPS: CardGroup[] = [
  { label: '💰 Financial', keys: ['goal', 'stats', 'tax', 'bookingTypes', 'paymentMethods', 'expenses', 'outstanding', 'transactions', 'tours'] },
  { label: '📈 Trends', keys: ['monthOverMonth', 'weekOverWeek', 'incomeTrend', 'bookingVolume', 'monthlyBreakdown'] },
  { label: '🕐 Timing', keys: ['peakTimes', 'heatmap', 'revenueByDay'] },
  { label: '👥 Clients', keys: ['retention', 'repeatRevenue', 'topClients', 'clientLTV', 'reliability', 'clientSources'] },
]
const CARD_LABELS: Record<CardKey, string> = {
  goal: 'Income Goal', stats: 'Summary Stats', tax: 'Tax Estimate',
  bookingTypes: 'Revenue by Booking Type', paymentMethods: 'Payment Methods',
  expenses: 'Top Expenses', outstanding: 'Outstanding Balances', transactions: 'Recent Transactions',
  monthOverMonth: 'Month over Month', weekOverWeek: 'Week over Week', incomeTrend: '12-Month Income Trend',
  bookingVolume: 'Booking Volume', monthlyBreakdown: 'Monthly Breakdown',
  peakTimes: 'Peak Times', heatmap: 'Booking Heatmap', revenueByDay: 'Revenue by Day of Week',
  retention: 'Client Retention', repeatRevenue: 'Repeat vs One-time Revenue',
  topClients: 'Top Clients by Revenue', clientLTV: 'Client Lifetime Value', reliability: 'Reliability Concerns', clientSources: 'Client Sources',
  tours: 'Tours',
}
const ALL_CARDS: CardKey[] = CARD_GROUPS.flatMap(g => g.keys)
const DEFAULT_VISIBLE: CardKey[] = [
  'goal', 'stats', 'tax', 'bookingTypes', 'paymentMethods', 'expenses', 'outstanding', 'transactions',
  'monthOverMonth', 'weekOverWeek', 'incomeTrend', 'tours',
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

function periodStart(p: TimePeriod, customFrom?: string): Date {
  switch (p) {
    case 'Week': return startOfWeek(new Date(), { weekStartsOn: 1 })
    case 'Month': return startOfMonth(new Date())
    case 'Quarter': return startOfQuarter(new Date())
    case 'Year': return startOfYear(new Date())
    case 'Custom': return customFrom ? startOfDay(parseISO(customFrom)) : new Date(2000, 0, 1)
    case 'All': return new Date(2000, 0, 1)
  }
}

function periodEnd(p: TimePeriod, customTo?: string): Date {
  switch (p) {
    case 'Custom': return customTo ? endOfDay(parseISO(customTo)) : new Date()
    default: return new Date()
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MAIN FINANCES PAGE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function FinancesPage({ onOpenBooking, onOpenTour }: { onOpenBooking?: (bookingId: string) => void; onOpenTour?: (tourId: string) => void }) {
  const [period, setPeriod] = useState<TimePeriod>('Month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [showEditor, setShowEditor] = useState(false)
  const [editingTransaction, setEditingTransaction] = useState<Transaction | undefined>(undefined)
  const [showGoalEditor, setShowGoalEditor] = useState(false)
  const [showTaxSettings, setShowTaxSettings] = useState(false)
  const [showAllTransactions, setShowAllTransactions] = useState(false)
  const [showImportExport, setShowImportExport] = useState(false)
  const [showCardSettings, setShowCardSettings] = useState(false)
  const [showTourEditor, setShowTourEditor] = useState(false)
  const [visibleCards, setVisibleCards] = useLocalStorage<CardKey[]>('financeCards_v2', DEFAULT_VISIBLE)
  const [hintDismissed, setHintDismissed] = useLocalStorage('financeHintDismissed', false)
  const isCardVisible = (key: CardKey) => visibleCards.includes(key)

  const rawTransactions = useLiveQuery(() => db.transactions.orderBy('date').reverse().toArray())
  const rawBookings = useLiveQuery(() => db.bookings.toArray())
  const rawClients = useLiveQuery(() => db.clients.toArray())
  const rawPayments = useLiveQuery(() => db.payments.toArray())
  const rawTours = useLiveQuery(() => db.tours.toArray())
  const allTransactions = rawTransactions ?? []
  const allBookings = rawBookings ?? []
  const clients = rawClients ?? []
  const allPayments = rawPayments ?? []
  const allTours = rawTours ?? []
  // Settings — stored in localStorage intentionally: these are user preferences
  // (display settings), not user data, so they don't need to be in IndexedDB.
  const [taxRate] = useLocalStorage('taxRate', 25)
  const [setAsideRate] = useLocalStorage('setAsideRate', 30)
  // Goal targets — stored in localStorage intentionally: these are user preferences
  // for income targets per period, not transactional data.
  const [goalWeekly] = useLocalStorage('goalWeekly', 0)
  const [goalMonthly] = useLocalStorage('goalMonthly', 0)
  const [goalQuarterly] = useLocalStorage('goalQuarterly', 0)
  const [goalYearly] = useLocalStorage('goalYearly', 0)

  // Filtered by period
  const startDate = periodStart(period, customFrom)
  const endDate = periodEnd(period, customTo)
  const filtered = useMemo(
    () => allTransactions.filter(t => {
      const td = new Date(t.date)
      return td >= startDate && td <= endDate
    }),
    [allTransactions, startDate.getTime(), endDate.getTime()]
  )

  // Bookings filtered by period (used by timing/heatmap/client analytics)
  const filteredBookings = useMemo(
    () => allBookings.filter(b => {
      const bd = new Date(b.dateTime)
      return bd >= startDate && bd <= endDate
    }),
    [allBookings, startDate.getTime(), endDate.getTime()]
  )

  // ── Pre-built lookup Maps (avoids O(n²) nested filtering) ──
  const incomeByBookingId = useMemo(() => {
    const map = new Map<string, number>()
    for (const t of filtered) {
      // Exclude tips and cancellation fees to match canonical getBookingTotalPaid
      if (t.type === 'income' && t.bookingId && t.category === 'booking') {
        map.set(t.bookingId, (map.get(t.bookingId) ?? 0) + t.amount)
      }
    }
    return map
  }, [filtered])

  const paymentsByBookingId = useMemo(() => {
    const map = new Map<string, number>()
    for (const p of allPayments) {
      if (p.label !== 'Tip' && p.label !== 'Cancellation Fee') {
        map.set(p.bookingId, (map.get(p.bookingId) ?? 0) + p.amount)
      }
    }
    return map
  }, [allPayments])

  const bookingsByClientId = useMemo(() => {
    const map = new Map<string, typeof filteredBookings>()
    for (const b of filteredBookings) {
      const arr = map.get(b.clientId ?? '')
      if (arr) arr.push(b)
      else map.set(b.clientId ?? '', [b])
    }
    return map
  }, [filteredBookings])

  const clientMap = useMemo(() => {
    const map = new Map<string, (typeof clients)[0]>()
    for (const c of clients) map.set(c.id, c)
    return map
  }, [clients])

  // Stats — single pass over filtered transactions
  const { totalIncome, totalExpenses, netIncome, avgBooking, estimatedTax, suggestedSetAside } = useMemo(() => {
    let income = 0, expenses = 0, bookingTotal = 0
    const bookingIds = new Set<string>()
    let manualBookings = 0
    for (const t of filtered) {
      if (t.type === 'income') income += t.amount
      else if (t.type === 'expense') expenses += t.amount
      if (t.category === 'booking') {
        bookingTotal += t.amount
        if (t.bookingId) bookingIds.add(t.bookingId)
        else manualBookings++
      }
    }
    const net = income - expenses
    const count = bookingIds.size + manualBookings
    return {
      totalIncome: income,
      totalExpenses: expenses,
      netIncome: net,
      bookingCount: count,
      avgBooking: count > 0 ? Math.round(bookingTotal / count) : 0,
      estimatedTax: net > 0 ? Math.round(net * taxRate / 100) : 0,
      suggestedSetAside: income > 0 ? Math.round(income * setAsideRate / 100) : 0,
    }
  }, [filtered, taxRate, setAsideRate])

  // Goal — tied to the active period tab
  // On 'All' period, we show the monthly goal with a note about timeframe
  const goalPeriodForDisplay = period === 'All' ? 'Month' : period === 'Custom' ? 'Month' : period
  const goalTarget = goalPeriodForDisplay === 'Week' ? goalWeekly
    : goalPeriodForDisplay === 'Month' ? goalMonthly
    : goalPeriodForDisplay === 'Quarter' ? goalQuarterly
    : goalPeriodForDisplay === 'Year' ? goalYearly : 0
  const hasGoal = goalTarget > 0
  const goalIncome = totalIncome
  const goalProgress = goalTarget > 0 ? Math.min(1, goalIncome / goalTarget) : 0
  const goalRemaining = Math.max(0, goalTarget - goalIncome)
  const goalEnd = goalPeriodForDisplay === 'Week' ? endOfWeek(new Date(), { weekStartsOn: 1 })
    : goalPeriodForDisplay === 'Quarter' ? endOfQuarter(new Date())
    : goalPeriodForDisplay === 'Year' ? endOfYear(new Date()) : endOfMonth(new Date())
  const goalDaysLeft = Math.max(0, differenceInDays(goalEnd, new Date()))
  const goalIsAllPeriod = period === 'All' || period === 'Custom'

  // Outstanding balances — use payment ledger for accurate amounts (only Pending Deposit+ stages)
  const bookingsWithBalance = useMemo(() => allBookings
    .filter(b => b.status === 'Pending Deposit' || b.status === 'Confirmed' || b.status === 'In Progress' || b.status === 'Completed')
    .map(b => {
      const total = bookingTotal(b)
      const paid = paymentsByBookingId.get(b.id) ?? 0
      const owing = total - paid
      return { booking: b, owing, client: clientMap.get(b.clientId ?? '') }
    })
    .filter(x => x.owing > 0)
    .sort((a, b) => b.owing - a.owing),
  [allBookings, paymentsByBookingId, clientMap])
  const totalOutstanding = useMemo(() => bookingsWithBalance.reduce((s, x) => s + x.owing, 0), [bookingsWithBalance])

  // Expense breakdown — show all categories; group smallest into "Other" if more than 7
  const expenseBreakdown = useMemo(() => {
    const expenses = filtered.filter(t => t.type === 'expense')
    const total = expenses.reduce((s, t) => s + t.amount, 0)
    if (total === 0) return []
    const grouped: Record<string, number> = {}
    expenses.forEach(t => { grouped[t.category] = (grouped[t.category] ?? 0) + t.amount })
    const sorted = Object.entries(grouped)
      .map(([cat, amt]) => ({ category: cat, amount: amt, pct: Math.round((amt / total) * 100) }))
      .sort((a, b) => b.amount - a.amount)
    if (sorted.length <= 7) return sorted
    // Group the smallest categories (beyond the top 6) into "Other"
    const top = sorted.slice(0, 6)
    const rest = sorted.slice(6)
    const otherAmount = rest.reduce((s, d) => s + d.amount, 0)
    top.push({ category: 'other', amount: otherAmount, pct: Math.round((otherAmount / total) * 100) })
    return top
  }, [filtered])

  // Revenue by booking type (Incall/Outcall/Travel/Virtual)
  const bookingTypeBreakdown = useMemo(() => {
    const completedInPeriod = filteredBookings.filter(b => b.status === 'Completed')
    if (completedInPeriod.length === 0) return []
    const grouped: Record<string, { count: number; revenue: number }> = {}
    completedInPeriod.forEach(b => {
      const type = b.locationType || 'Other'
      if (!grouped[type]) grouped[type] = { count: 0, revenue: 0 }
      grouped[type].count++
      grouped[type].revenue += incomeByBookingId.get(b.id) ?? 0
    })
    return Object.entries(grouped)
      .map(([type, data]) => ({ type: type as LocationType, ...data }))
      .sort((a, b) => b.revenue - a.revenue)
  }, [filteredBookings, incomeByBookingId])

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

  // ── Analytics computations (filtered by selected period) ──

  const completedBookings = useMemo(() => filteredBookings.filter(b => b.status === 'Completed'), [filteredBookings])

  // Timing: heatmap + peak times (filtered by period)
  const heatmap = useMemo(() => {
    const data = Array.from({ length: 7 }, () => Array(24).fill(0))
    completedBookings.forEach(b => {
      const dt = new Date(b.dateTime)
      data[getDay(dt)][getHours(dt)]++
    })
    return data
  }, [completedBookings])

  const { heatmapMax, dayTotals, bestDayIdx, hourTotals, bestHourIdx } = useMemo(() => {
    const dTotals = heatmap.map(d => d.reduce((a: number, b: number) => a + b, 0))
    const hTotals = Array(24).fill(0) as number[]
    heatmap.forEach(d => d.forEach((c: number, h: number) => { hTotals[h] += c }))
    return {
      heatmapMax: Math.max(1, ...heatmap.flat()),
      dayTotals: dTotals,
      bestDayIdx: dTotals.indexOf(Math.max(...dTotals)),
      hourTotals: hTotals,
      bestHourIdx: hTotals.indexOf(Math.max(...hTotals)),
    }
  }, [heatmap])

  const dayRevenue = useMemo(() => {
    const data = Array(7).fill(0) as number[]
    completedBookings.forEach(b => {
      const day = getDay(new Date(b.dateTime))
      data[day] += incomeByBookingId.get(b.id) ?? 0
    })
    return data
  }, [completedBookings, incomeByBookingId])
  const maxDayRev = useMemo(() => Math.max(1, ...dayRevenue), [dayRevenue])

  // Trends: 12-month data (pre-bucket by YYYY-MM to avoid O(months × items))
  const monthly = useMemo(() => {
    const txnByMonth = new Map<string, { income: number; expenses: number }>()
    for (const t of allTransactions) {
      const td = new Date(t.date)
      const key = `${td.getFullYear()}-${td.getMonth()}`
      const bucket = txnByMonth.get(key) ?? { income: 0, expenses: 0 }
      if (t.type === 'income') bucket.income += t.amount
      else if (t.type === 'expense') bucket.expenses += t.amount
      txnByMonth.set(key, bucket)
    }
    const bCountByMonth = new Map<string, number>()
    for (const b of allBookings) {
      if (b.status !== 'Completed') continue
      const bd = new Date(b.dateTime)
      const key = `${bd.getFullYear()}-${bd.getMonth()}`
      bCountByMonth.set(key, (bCountByMonth.get(key) ?? 0) + 1)
    }
    const now = new Date()
    const start = subMonths(startOfMonth(now), 11)
    const months = eachMonthOfInterval({ start, end: now })
    return months.map(m => {
      const key = `${m.getFullYear()}-${m.getMonth()}`
      const bucket = txnByMonth.get(key) ?? { income: 0, expenses: 0 }
      return { month: m, label: fmtShortMonth(m), income: bucket.income, expenses: bucket.expenses, bookings: bCountByMonth.get(key) ?? 0 }
    })
  }, [allTransactions, allBookings])

  const { currentMonth, momChange, maxMonthlyIncome, maxMonthlyBookings } = useMemo(() => {
    const cur = monthly[monthly.length - 1]
    const prev = monthly.length >= 2 ? monthly[monthly.length - 2] : null
    return {
      currentMonth: cur,
      momChange: prev && prev.income > 0
        ? Math.round(((cur.income - prev.income) / prev.income) * 100)
        : null,
      maxMonthlyIncome: Math.max(1, ...monthly.map(m => m.income)),
      maxMonthlyBookings: Math.max(1, ...monthly.map(m => m.bookings)),
    }
  }, [monthly])

  // Week over Week — single pass
  const { wowCurrentIncome, wowChange } = useMemo(() => {
    const currentStart = startOfWeek(new Date(), { weekStartsOn: 1 }).getTime()
    const prevStart = subWeeks(new Date(currentStart), 1).getTime()
    let current = 0, prev = 0
    for (const t of allTransactions) {
      if (t.type !== 'income') continue
      const td = new Date(t.date).getTime()
      if (td >= currentStart) current += t.amount
      else if (td >= prevStart) prev += t.amount
    }
    return {
      wowCurrentIncome: current,
      wowChange: prev > 0 ? Math.round(((current - prev) / prev) * 100) : null,
    }
  }, [allTransactions])

  // Client analytics (filtered by period)
  const clientStats = useMemo(() => {
    return clients.map(c => {
      const cb = bookingsByClientId.get(c.id) ?? []
      const completed = cb.filter(b => b.status === 'Completed')
      const cancelled = cb.filter(b => b.status === 'Cancelled' || b.status === 'No Show')
      const revenue = completed.reduce((s, b) => s + (incomeByBookingId.get(b.id) ?? 0), 0)
      const cancelRate = cb.length > 0 ? Math.round((cancelled.length / cb.length) * 100) : 0
      return { client: c, bookingCount: completed.length, revenue, cancelRate, totalBookings: cb.length }
    }).filter(s => s.totalBookings > 0)
  }, [clients, bookingsByClientId, incomeByBookingId])

  const topClients = useMemo(() => [...clientStats].sort((a, b) => b.revenue - a.revenue).slice(0, 10), [clientStats])
  const unreliableClients = useMemo(() => clientStats.filter(s => s.cancelRate >= 30 && s.totalBookings >= 2).sort((a, b) => b.cancelRate - a.cancelRate), [clientStats])

  // Client Lifetime Value — all-time revenue per client (ignores period filter)
  const clientLTV = useMemo(() => {
    const bookingClientMap = new Map<string, string>()
    const completedByClient = new Map<string, number>()
    for (const b of allBookings) {
      if (b.clientId) bookingClientMap.set(b.id, b.clientId)
      if (b.clientId && b.status === 'Completed') {
        completedByClient.set(b.clientId, (completedByClient.get(b.clientId) ?? 0) + 1)
      }
    }
    const ltvMap = new Map<string, number>()
    for (const t of allTransactions) {
      if (t.type === 'income' && t.bookingId && t.category === 'booking') {
        const cid = bookingClientMap.get(t.bookingId)
        if (cid) ltvMap.set(cid, (ltvMap.get(cid) ?? 0) + t.amount)
      }
    }
    return [...ltvMap.entries()]
      .map(([clientId, revenue]) => ({
        client: clientMap.get(clientId),
        revenue,
        bookingCount: completedByClient.get(clientId) ?? 0,
      }))
      .filter(x => x.client && x.revenue > 0)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10)
  }, [allTransactions, allBookings, clientMap])

  const retentionMetrics = useMemo(() => {
    // Build per-client completed booking count in one pass
    const completedCountByClient = new Map<string, number>()
    const earliestByClient = new Map<string, number>()
    for (const b of completedBookings) {
      if (!b.clientId) continue
      const cid = b.clientId
      completedCountByClient.set(cid, (completedCountByClient.get(cid) ?? 0) + 1)
      const dt = new Date(b.dateTime).getTime()
      const prev = earliestByClient.get(cid)
      if (prev === undefined || dt < prev) earliestByClient.set(cid, dt)
    }

    const totalWithBookings = completedCountByClient.size
    const repeatClients = clients.filter(c => (completedCountByClient.get(c.id) ?? 0) >= 2)
    const oneTimeClients = clients.filter(c => (completedCountByClient.get(c.id) ?? 0) === 1)
    const repeatRate = totalWithBookings > 0 ? Math.round((repeatClients.length / totalWithBookings) * 100) : 0
    const avgBookingsPerRepeat = repeatClients.length > 0
      ? Math.round(repeatClients.reduce((s, c) => s + (completedCountByClient.get(c.id) ?? 0), 0) / repeatClients.length * 10) / 10
      : 0
    // New vs returning this month
    const mStart = startOfMonth(new Date()).getTime()
    const thisMonthClients = new Set(completedBookings.filter(b => new Date(b.dateTime).getTime() >= mStart).map(b => b.clientId))
    let newThisMonth = 0, returningThisMonth = 0
    thisMonthClients.forEach(cid => {
      if ((earliestByClient.get(cid ?? '') ?? Infinity) < mStart) returningThisMonth++
      else newThisMonth++
    })
    // Avg revenue per client — use incomeByBookingId Map
    const revOf = (cs: typeof clients) => {
      if (cs.length === 0) return 0
      let total = 0
      for (const c of cs) {
        const cBookings = bookingsByClientId.get(c.id) ?? []
        for (const b of cBookings) {
          if (b.status === 'Completed') total += incomeByBookingId.get(b.id) ?? 0
        }
      }
      return Math.round(total / cs.length)
    }
    return {
      repeatCount: repeatClients.length, oneTimeCount: oneTimeClients.length, repeatRate, avgBookingsPerRepeat,
      newThisMonth, returningThisMonth, avgRepeatRevenue: revOf(repeatClients), avgOneTimeRevenue: revOf(oneTimeClients),
    }
  }, [clients, completedBookings, bookingsByClientId, incomeByBookingId])

  // Tour financial summaries — pre-computed so we don't scan all bookings/transactions per-tour in JSX
  const tourSummaries = useMemo(() => {
    const activeTours = allTours.filter(t => !t.isArchived)
    if (activeTours.length === 0) return []

    // Build per-tour booking ID sets in one pass
    const bookingIdsByTour = new Map<string, Set<string>>()
    for (const b of allBookings) {
      if (!b.tourId) continue
      const set = bookingIdsByTour.get(b.tourId)
      if (set) set.add(b.id)
      else bookingIdsByTour.set(b.tourId, new Set([b.id]))
    }

    // Aggregate transaction income/expenses per tour in one pass
    const txnIncomeByTour = new Map<string, number>()
    const txnExpensesByTour = new Map<string, number>()
    for (const t of allTransactions) {
      if (!t.tourId) continue
      if (t.type === 'income') {
        // Only count non-booking income (booking income comes from payments)
        const tourBIds = bookingIdsByTour.get(t.tourId)
        if (!t.bookingId || !tourBIds?.has(t.bookingId)) {
          txnIncomeByTour.set(t.tourId, (txnIncomeByTour.get(t.tourId) ?? 0) + t.amount)
        }
      } else if (t.type === 'expense') {
        txnExpensesByTour.set(t.tourId, (txnExpensesByTour.get(t.tourId) ?? 0) + t.amount)
      }
    }

    // Aggregate booking payments per tour in one pass
    // Invert bookingIdsByTour to a bookingId → tourId lookup for O(1) access
    const bookingToTour = new Map<string, string>()
    for (const [tourId, bIds] of bookingIdsByTour) {
      for (const bid of bIds) bookingToTour.set(bid, tourId)
    }
    const bookingPaymentByTour = new Map<string, number>()
    for (const p of allPayments) {
      if (p.label === 'Tip' || p.label === 'Cancellation Fee') continue
      const tourId = bookingToTour.get(p.bookingId)
      if (tourId) {
        bookingPaymentByTour.set(tourId, (bookingPaymentByTour.get(tourId) ?? 0) + p.amount)
      }
    }

    return activeTours
      .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())
      .map(tour => {
        const bookingIncome = bookingPaymentByTour.get(tour.id) ?? 0
        const nonBookingIncome = txnIncomeByTour.get(tour.id) ?? 0
        const expenses = txnExpensesByTour.get(tour.id) ?? 0
        return { tour, income: bookingIncome + nonBookingIncome, expenses, net: bookingIncome + nonBookingIncome - expenses }
      })
  }, [allTours, allBookings, allTransactions, allPayments])

  const clientSourceCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    clients.forEach(c => { if (c.referenceSource) counts[c.referenceSource] = (counts[c.referenceSource] ?? 0) + 1 })
    return Object.entries(counts).sort((a, b) => b[1] - a[1])
  }, [clients])

  if (rawTransactions === undefined || rawBookings === undefined || rawClients === undefined || rawPayments === undefined) return <FinancesPageSkeleton />

  return (
    <div className="pb-20">
      <PageHeader title="Finances">
        <button type="button" onClick={() => setShowCardSettings(true)} className="p-2 rounded-lg" style={{ color: 'var(--text-secondary)' }} aria-label="Customize reports">
          <Settings2 size={18} />
        </button>
        <button type="button" onClick={() => setShowEditor(true)} className="p-2 rounded-lg text-purple-500" aria-label="Add transaction">
          <Plus size={20} />
        </button>
      </PageHeader>

      <div className="px-4 py-3 max-w-lg mx-auto space-y-4">
        {/* Period Selector */}
        <div className="flex gap-1 p-1 rounded-lg overflow-x-auto" style={{ backgroundColor: 'var(--bg-secondary)' }}>
          {(['Week', 'Month', 'Quarter', 'Year', 'All', 'Custom'] as TimePeriod[]).map(p => (
            <button type="button"
              key={p}
              onClick={() => setPeriod(p)}
              aria-pressed={period === p}
              className={`flex-1 py-2 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                period === p ? 'bg-purple-600 text-white' : ''
              }`}
              style={{ ...period !== p ? { color: 'var(--text-secondary)' } : {}, minWidth: '3rem' }}
            >
              {p}
            </button>
          ))}
        </div>

        {/* Custom date range inputs */}
        {period === 'Custom' && (
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>From</label>
              <input
                type="date"
                value={customFrom}
                onChange={e => { setCustomFrom(e.target.value); if (customTo && e.target.value > customTo) setCustomTo(e.target.value) }}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={fieldInputStyle}
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>To</label>
              <input
                type="date"
                value={customTo}
                onChange={e => { setCustomTo(e.target.value); if (customFrom && e.target.value < customFrom) setCustomFrom(e.target.value) }}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={fieldInputStyle}
              />
            </div>
            {(customFrom || customTo) && (
              <button type="button"
                onClick={() => { setCustomFrom(''); setCustomTo('') }}
                className="p-2 rounded-lg"
                style={{ color: 'var(--text-secondary)' }}
                aria-label="Clear date range"
              >
                <X size={16} />
              </button>
            )}
          </div>
        )}

        {/* Customization hint — shown once */}
        {!hintDismissed && (
          <button type="button"
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

        {/* Goal Progress — hidden on All/Custom since there's no matching period */}
        {isCardVisible('goal') && !goalIsAllPeriod && (hasGoal ? (
          <Card onClick={() => setShowGoalEditor(true)}>
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{goalPeriodForDisplay}ly Income Goal</p>
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
          <button type="button"
            onClick={() => setShowGoalEditor(true)}
            className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-medium text-purple-500"
            style={{ backgroundColor: 'rgba(168,85,247,0.1)' }}
          >
            <Target size={16} /> Set {goalPeriodForDisplay}ly Income Goal
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
              <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>(based on net income)</p>
            </div>
            <div className="w-px" style={{ backgroundColor: 'var(--border)' }} />
            <div className="flex-1">
              <p className="text-xs mb-0.5" style={{ color: 'var(--text-secondary)' }}>Set Aside ({setAsideRate}%)</p>
              <p className="text-lg font-bold text-blue-500">{formatCurrency(suggestedSetAside)}</p>
              <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>(based on gross income)</p>
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
                  <button type="button"
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

        {/* Recent Transactions (filtered by period) */}
        {isCardVisible('transactions') && (
        <Card>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Recent Transactions</p>
            <button type="button"
              onClick={() => setShowAllTransactions(true)}
              className="text-xs text-purple-500 font-medium"
            >
              See All
            </button>
          </div>
          {filtered.length === 0 ? (
            <p className="text-sm text-center py-4" style={{ color: 'var(--text-secondary)' }}>
              No transactions yet
            </p>
          ) : (
            <div className="space-y-2">
              {filtered.slice(0, 5).map(t => (
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
          <button type="button"
            onClick={() => setShowImportExport(true)}
            className="flex items-center justify-center gap-2 w-full mt-3 pt-3 text-xs font-semibold active:opacity-70"
            style={{ borderTop: '1px solid var(--border)', color: '#a855f7' }}
          >
            <ArrowDownUp size={14} /> Import / Export
          </button>
        </Card>
        )}

        {/* Tours */}
        {isCardVisible('tours') && (
        <Card>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Tours</p>
            <button type="button"
              onClick={() => setShowTourEditor(true)}
              className="flex items-center gap-1 text-xs text-purple-500 font-medium"
            >
              <Plus size={12} /> New
            </button>
          </div>
          {tourSummaries.length === 0 ? (
            <p className="text-sm text-center py-4" style={{ color: 'var(--text-secondary)' }}>
              No tours yet. Create one when traveling for work.
            </p>
          ) : (
            <div className="space-y-2">
              {tourSummaries.map(({ tour, net }) => (
                <button type="button" key={tour.id}
                  onClick={() => onOpenTour?.(tour.id)}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left active:opacity-70"
                  style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{tour.name}</p>
                    <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                      <MapPin size={10} className="inline mr-0.5" style={{ verticalAlign: '-1px' }} />{tour.city} · {fmtShortDate(new Date(tour.startDate))} — {fmtShortDate(new Date(tour.endDate))}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-sm font-semibold ${net >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {net >= 0 ? '+' : ''}{formatCurrency(net)}
                    </span>
                    <ChevronRight size={14} style={{ color: 'var(--text-secondary)' }} />
                  </div>
                </button>
              ))}
            </div>
          )}
        </Card>
        )}

        {/* ── TRENDS ── */}

        {/* Month over Month — always shows month-level comparison, but labels context for shorter periods */}
        {isCardVisible('monthOverMonth') && (
          <Card>
            <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Month over Month</p>
            {(period === 'Week' || period === 'Custom') && (
              <p className="text-[10px] mb-2" style={{ color: 'var(--text-secondary)' }}>
                Comparing full calendar months (not limited to {period === 'Week' ? 'weekly' : 'custom'} period)
              </p>
            )}
            <div className="flex gap-4">
              <div className="flex-1">
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>This Month</p>
                <p className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{formatCurrency(currentMonth.income)}</p>
              </div>
              <div className="w-px" style={{ backgroundColor: 'var(--border)' }} />
              <div className="flex-1">
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>vs Last Month</p>
                <div className="flex items-center gap-1">
                  {momChange === null
                    ? <span className="text-xl font-bold" style={{ color: 'var(--text-secondary)' }}>N/A</span>
                    : <>
                        {momChange >= 0 ? <TrendingUp size={18} className="text-green-500" /> : <TrendingDown size={18} className="text-red-500" />}
                        <span className={`text-xl font-bold ${momChange >= 0 ? 'text-green-500' : 'text-red-500'}`}>{Math.abs(momChange)}%</span>
                      </>
                  }
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Week over Week */}
        {isCardVisible('weekOverWeek') && (
          <Card>
            <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Week over Week</p>
            {period !== 'Week' && (
              <p className="text-[10px] mb-2" style={{ color: 'var(--text-secondary)' }}>
                Comparing full calendar weeks (not limited to {period.toLowerCase()} period)
              </p>
            )}
            <div className="flex gap-4">
              <div className="flex-1">
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>This Week</p>
                <p className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{formatCurrency(wowCurrentIncome)}</p>
              </div>
              <div className="w-px" style={{ backgroundColor: 'var(--border)' }} />
              <div className="flex-1">
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>vs Last Week</p>
                <div className="flex items-center gap-1">
                  {wowChange === null
                    ? <span className="text-xl font-bold" style={{ color: 'var(--text-secondary)' }}>N/A</span>
                    : <>
                        {wowChange >= 0 ? <TrendingUp size={18} className="text-green-500" /> : <TrendingDown size={18} className="text-red-500" />}
                        <span className={`text-xl font-bold ${wowChange >= 0 ? 'text-green-500' : 'text-red-500'}`}>{Math.abs(wowChange)}%</span>
                      </>
                  }
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

        {/* Client Lifetime Value */}
        {isCardVisible('clientLTV') && clientLTV.length > 0 && (
          <Card>
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Client Lifetime Value</p>
              <span className="text-sm">👑</span>
            </div>
            <p className="text-[10px] mb-3" style={{ color: 'var(--text-secondary)' }}>All-time revenue (ignores period filter)</p>
            <div className="space-y-2">
              {clientLTV.map((item, i) => {
                const c = item.client!
                const since = c.clientSince ?? c.dateAdded
                const monthsAgo = since ? Math.max(1, Math.round(differenceInDays(new Date(), new Date(since)) / 30)) : null
                return (
                  <div key={c.id} className="flex items-center gap-3">
                    <span className="text-xs w-5 text-center" style={{ color: 'var(--text-secondary)' }}>#{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{c.alias}</p>
                      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        {item.bookingCount} booking{item.bookingCount !== 1 ? 's' : ''}
                        {monthsAgo !== null ? ` · ${monthsAgo}mo` : ''}
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-green-500">{formatCurrency(item.revenue)}</span>
                  </div>
                )
              })}
            </div>
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
                  <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{count.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </Card>
        )}

      </div>

      {/* Modals */}
      <TransactionEditor
        isOpen={showEditor}
        onClose={() => { setShowEditor(false); setEditingTransaction(undefined) }}
        transaction={editingTransaction}
      />
      <TourEditor isOpen={showTourEditor} onClose={() => setShowTourEditor(false)} />
      <GoalEditor isOpen={showGoalEditor} onClose={() => setShowGoalEditor(false)} />
      <TaxSettingsEditor isOpen={showTaxSettings} onClose={() => setShowTaxSettings(false)} />
      <AllTransactionsModal isOpen={showAllTransactions} onClose={() => setShowAllTransactions(false)} transactions={allTransactions} />
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
                <button type="button"
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
                    <button type="button"
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
          <button type="button"
            onClick={() => onChange([...ALL_CARDS])}
            className="flex-1 py-2.5 rounded-lg text-sm font-medium"
            style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
          >
            Show All
          </button>
          <button type="button"
            onClick={() => onChange([...DEFAULT_VISIBLE])}
            className="flex-1 py-2.5 rounded-lg text-sm font-medium"
            style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
          >
            Defaults
          </button>
          <button type="button"
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
  // Goal targets — stored in localStorage intentionally: these are user
  // preferences (income targets), not transactional data.
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
        <button type="button" onClick={save} className="p-2 text-purple-500" aria-label="Save goals">
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
                value={f.value ? Number(f.value).toLocaleString() : ''}
                onChange={e => f.set(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="0"
                className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                style={fieldInputStyle} />
            </div>
          ))}
        </div>

        <div className="py-4 space-y-3">
          <button type="button" onClick={save}
            className="w-full py-3 rounded-xl font-semibold text-sm bg-purple-600 text-white active:bg-purple-700">
            Save Goals
          </button>
          {hasAny && (
            <button type="button" onClick={clearAll} className="w-full py-2 text-sm text-red-500 font-medium">
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
  // Tax/savings rates — stored in localStorage intentionally: these are user
  // preferences (rate settings), not transactional data.
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
        <button type="button" onClick={save} className="p-2 text-purple-500" aria-label="Save tax settings">
          <Check size={20} />
        </button>
      }
    >
      <div className="px-4 py-2" style={{ backgroundColor: 'var(--bg-secondary)' }}>
        <SectionLabel label="Tax Rate" />
        <div className="mb-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm" style={{ color: 'var(--text-primary)' }}>Estimated Tax Rate</span>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={0}
                max={100}
                value={taxRate}
                onChange={e => {
                  const v = parseInt(e.target.value) || 0
                  setTaxRate(Math.max(0, Math.min(100, v)))
                }}
                className="w-14 text-right text-sm font-medium px-1.5 py-0.5 rounded outline-none"
                style={{ ...fieldInputStyle, color: 'var(--text-primary)' }}
                aria-label="Tax rate percentage"
              />
              <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>%</span>
            </div>
          </div>
          <input type="range" min={0} max={60} step={1} value={Math.min(60, taxRate)}
            onChange={e => setTaxRate(parseInt(e.target.value))}
            aria-label="Estimated tax rate slider"
            className="w-full accent-purple-500" />
          <FieldHint text="Your estimated tax bracket. Used to calculate how much tax you might owe. Use the text input for values above 60%." />
        </div>

        <SectionLabel label="Savings" />
        <div className="mb-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm" style={{ color: 'var(--text-primary)' }}>Set Aside Percentage</span>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={0}
                max={100}
                value={setAsideRate}
                onChange={e => {
                  const v = parseInt(e.target.value) || 0
                  setSetAsideRate(Math.max(0, Math.min(100, v)))
                }}
                className="w-14 text-right text-sm font-medium px-1.5 py-0.5 rounded outline-none"
                style={{ ...fieldInputStyle, color: 'var(--text-primary)' }}
                aria-label="Set aside percentage"
              />
              <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>%</span>
            </div>
          </div>
          <input type="range" min={0} max={60} step={1} value={Math.min(60, setAsideRate)}
            onChange={e => setSetAsideRate(parseInt(e.target.value))}
            aria-label="Set aside percentage slider"
            className="w-full accent-purple-500" />
          <FieldHint text="Set aside slightly more than your tax rate to cover self-employment tax. Use the text input for values above 60%." />
        </div>

        <div className="py-4">
          <button type="button" onClick={save}
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

function AllTransactionsModal({ isOpen, onClose, transactions }: { isOpen: boolean; onClose: () => void; transactions: Transaction[] }) {
  const allTransactions = transactions
  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense'>('all')
  const [search, setSearch] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDeleteTxn, setConfirmDeleteTxn] = useState<Transaction | null>(null)
  const [editingTxn, setEditingTxn] = useState<Transaction | undefined>(undefined)
  const [showEditModal, setShowEditModal] = useState(false)
  // Windowed rendering: render in batches with "Show more"
  const [renderLimit, setRenderLimit] = useState(30)

  // Reset render limit when filters change
  const searchKey = `${filterType}:${search}`
  const [prevSearchKey, setPrevSearchKey] = useState(searchKey)
  if (searchKey !== prevSearchKey) { setRenderLimit(30); setPrevSearchKey(searchKey) }

  // Extended search: match category, notes, amount (formatted), date, payment method
  const filtered = allTransactions
    .filter(t => filterType === 'all' || t.type === filterType)
    .filter(t => {
      if (!search) return true
      const s = search.toLowerCase()
      return (
        t.category.toLowerCase().includes(s) ||
        (t.notes ?? '').toLowerCase().includes(s) ||
        formatCurrency(t.amount).toLowerCase().includes(s) ||
        t.amount.toString().includes(s) ||
        fmtMediumDate(new Date(t.date)).toLowerCase().includes(s) ||
        (t.paymentMethod ?? '').toLowerCase().includes(s)
      )
    })

  const visibleItems = filtered.slice(0, renderLimit)
  const hasMore = filtered.length > renderLimit

  async function handleDelete(t: Transaction) {
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
        await db.transaction('rw', [db.transactions, db.payments, db.bookings], async () => {
          if (txnSnap) await db.transactions.put(txnSnap)
          if (paySnap) {
            await db.payments.put(paySnap)
            // Re-sync booking payment booleans and status
            const booking = await db.bookings.get(paySnap.bookingId)
            if (booking) {
              const allPayments = await db.payments.where('bookingId').equals(paySnap.bookingId).toArray()
              const allPaid = allPayments.filter(p => p.label !== 'Tip' && p.label !== 'Cancellation Fee').reduce((s, p) => s + p.amount, 0)
              const depositPaid = allPayments.filter(p => p.label === 'Deposit').reduce((s, p) => s + p.amount, 0)
              const updates: Record<string, unknown> = {
                paymentReceived: allPaid >= bookingTotal(booking),
                depositReceived: depositPaid >= booking.depositAmount,
              }
              // Restore status if deposit was removed and booking was downgraded
              if (paySnap.label === 'Deposit' && depositPaid >= booking.depositAmount
                && booking.status === 'Pending Deposit' && booking.depositAmount > 0) {
                updates.status = 'Confirmed'
                updates.confirmedAt = new Date()
              }
              await db.bookings.update(paySnap.bookingId, updates)
            }
          }
        })
      })
    } catch (err) {
      showToast(`Delete failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <>
    <Modal isOpen={isOpen} onClose={onClose} title="All Transactions">
      <div style={{ backgroundColor: 'var(--bg-secondary)' }}>
        {/* Filter */}
        <div className="px-4 pt-3 pb-2">
          <div className="flex gap-1 p-1 rounded-lg mb-3" style={{ backgroundColor: 'var(--bg-primary)' }}>
            {(['all', 'income', 'expense'] as const).map(f => (
              <button type="button"
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
              <button type="button" onClick={() => setSearch('')} className="p-1" aria-label="Clear search">
                <X size={14} style={{ color: 'var(--text-secondary)' }} />
              </button>
            )}
          </div>
        </div>

        {/* Transaction list (windowed — renders in batches) */}
        <div className="px-4 py-2 space-y-1">
          {filtered.length === 0 ? (
            <p className="text-sm text-center py-8" style={{ color: 'var(--text-secondary)' }}>
              No transactions found
            </p>
          ) : (
            <>
            {visibleItems.map(t => (
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
                <button type="button"
                  className="flex-1 min-w-0 text-left"
                  onClick={() => { setEditingTxn(t); setShowEditModal(true) }}
                >
                  <p className="text-sm font-medium capitalize truncate" style={{ color: 'var(--text-primary)' }}>
                    {t.category}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {fmtMediumDate(new Date(t.date))}
                    {t.paymentMethod ? ` · ${t.paymentMethod}` : ''}
                    {t.notes ? ` · ${t.notes.slice(0, 30)}${t.notes.length > 30 ? '…' : ''}` : ''}
                  </p>
                </button>
                <p className={`text-sm font-semibold ${t.type === 'income' ? 'text-green-500' : 'text-red-500'}`}>
                  {t.type === 'income' ? '+' : '-'}{formatCurrency(t.amount)}
                </p>
                <button type="button"
                  onClick={() => { setEditingTxn(t); setShowEditModal(true) }}
                  className="p-1 opacity-40 active:opacity-100"
                  style={{ color: 'var(--text-secondary)' }}
                  aria-label={`Edit ${t.category} transaction`}
                >
                  <Edit2 size={14} />
                </button>
                <button type="button"
                  disabled={deletingId === t.id}
                  onClick={() => setConfirmDeleteTxn(t)}
                  className="p-1 opacity-40 active:opacity-100"
                  style={{ color: 'var(--text-secondary)' }}
                  aria-label={`Delete ${t.category} transaction`}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            {hasMore && (
              <button type="button"
                onClick={() => setRenderLimit(prev => prev + 30)}
                className="w-full py-3 text-center text-sm font-medium text-purple-500 active:opacity-70"
              >
                Show more ({filtered.length - renderLimit} remaining)
              </button>
            )}
            </>
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
    {/* Confirm dialog for transaction deletion */}
    <ConfirmDialog
      isOpen={!!confirmDeleteTxn}
      title="Delete Transaction"
      message={confirmDeleteTxn ? `Delete this ${confirmDeleteTxn.type} of ${formatCurrency(confirmDeleteTxn.amount)}?` : ''}
      confirmLabel="Delete"
      onConfirm={() => { if (confirmDeleteTxn) handleDelete(confirmDeleteTxn); setConfirmDeleteTxn(null) }}
      onCancel={() => setConfirmDeleteTxn(null)}
    />
    {/* Edit transaction modal */}
    <TransactionEditor
      isOpen={showEditModal}
      onClose={() => { setShowEditModal(false); setEditingTxn(undefined) }}
      transaction={editingTxn}
    />
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
