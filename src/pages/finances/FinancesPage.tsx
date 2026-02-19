import { useLiveQuery } from 'dexie-react-hooks'
import {
  Plus, ArrowUpCircle, ArrowDownCircle, Trash2, Target,
  Percent, ChevronRight, AlertCircle, Search, X, Check, BarChart3, ArrowDownUp
} from 'lucide-react'
import { useState, useMemo } from 'react'
import {
  format, startOfMonth, startOfWeek, startOfYear, startOfQuarter,
  eachDayOfInterval, eachMonthOfInterval, isSameDay, isSameMonth,
  differenceInDays, endOfMonth, endOfWeek, endOfQuarter
} from 'date-fns'
import { db, formatCurrency, bookingTotal } from '../../db'
import { PageHeader } from '../../components/PageHeader'
import { Card } from '../../components/Card'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Modal } from '../../components/Modal'
import { SectionLabel, FieldHint, FieldTextInput, fieldInputStyle } from '../../components/FormFields'
import { ImportExportModal } from '../../components/ImportExport'
import { TransactionEditor } from './TransactionEditor'
import { useLocalStorage } from '../../hooks/useSettings'

type TimePeriod = 'Week' | 'Month' | 'Quarter' | 'Year' | 'All'

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

export function FinancesPage({ onOpenAnalytics }: { onOpenAnalytics?: () => void }) {
  const [period, setPeriod] = useState<TimePeriod>('Month')
  const [showEditor, setShowEditor] = useState(false)
  const [showGoalEditor, setShowGoalEditor] = useState(false)
  const [showTaxSettings, setShowTaxSettings] = useState(false)
  const [showAllTransactions, setShowAllTransactions] = useState(false)
  const [showImportExport, setShowImportExport] = useState(false)

  const allTransactions = useLiveQuery(() => db.transactions.orderBy('date').reverse().toArray()) ?? []
  const allBookings = useLiveQuery(() => db.bookings.toArray()) ?? []
  const clients = useLiveQuery(() => db.clients.toArray()) ?? []

  // Settings
  const [taxRate] = useLocalStorage('taxRate', 25)
  const [setAsideRate] = useLocalStorage('setAsideRate', 30)
  const [goalName] = useLocalStorage('goalName', '')
  const [goalTarget] = useLocalStorage('goalTarget', 0)
  const [goalPeriod] = useLocalStorage<'weekly' | 'monthly' | 'quarterly'>('goalPeriod', 'monthly')

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
  const avgBooking = bookingTxns.length > 0
    ? Math.round(bookingTxns.reduce((s, t) => s + t.amount, 0) / bookingTxns.length)
    : 0
  const estimatedTax = netIncome > 0 ? Math.round(netIncome * taxRate / 100) : 0
  const suggestedSetAside = totalIncome > 0 ? Math.round(totalIncome * setAsideRate / 100) : 0

  // Goal
  const hasGoal = goalName.length > 0 && goalTarget > 0
  const goalStart = goalPeriod === 'weekly'
    ? startOfWeek(new Date(), { weekStartsOn: 1 })
    : goalPeriod === 'quarterly' ? startOfQuarter(new Date()) : startOfMonth(new Date())
  const goalEnd = goalPeriod === 'weekly'
    ? endOfWeek(new Date(), { weekStartsOn: 1 })
    : goalPeriod === 'quarterly' ? endOfQuarter(new Date()) : endOfMonth(new Date())
  const goalIncome = allTransactions
    .filter(t => t.type === 'income' && new Date(t.date) >= goalStart)
    .reduce((s, t) => s + t.amount, 0)
  const goalProgress = goalTarget > 0 ? Math.min(1, goalIncome / goalTarget) : 0
  const goalRemaining = Math.max(0, goalTarget - goalIncome)
  const goalDaysLeft = Math.max(0, differenceInDays(goalEnd, new Date()))

  // Outstanding balances
  const outstanding = allBookings.filter(b =>
    !['Cancelled', 'Completed', 'No Show'].includes(b.status) && !b.paymentReceived
  )
  const totalOutstanding = outstanding.reduce((s, b) => s + bookingTotal(b), 0)

  // Chart data
  const chartData = useMemo(() => {
    if (filtered.length === 0) return []
    const useDaily = period === 'Week' || period === 'Month'
    const now = new Date()
    // For "All", start from earliest transaction instead of year 2000
    const chartStart = period === 'All' && filtered.length > 0
      ? startOfMonth(new Date(filtered[filtered.length - 1].date))
      : startDate
    const intervals = useDaily
      ? eachDayOfInterval({ start: chartStart, end: now })
      : eachMonthOfInterval({ start: chartStart, end: now })

    return intervals.map(d => {
      const match = filtered.filter(t =>
        useDaily ? isSameDay(new Date(t.date), d) : isSameMonth(new Date(t.date), d)
      )
      return {
        date: d,
        label: useDaily ? format(d, 'd') : format(d, 'MMM'),
        income: match.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0),
        expense: match.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0),
      }
    })
  }, [filtered, period, startDate.getTime()])

  const chartMax = Math.max(1, ...chartData.map(d => Math.max(d.income, d.expense)))

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

  return (
    <div className="pb-20">
      <PageHeader title="Finances">
        <button onClick={() => setShowEditor(true)} className="p-2 rounded-lg text-purple-500">
          <Plus size={20} />
        </button>
      </PageHeader>

      <div className="px-4 py-3 max-w-lg mx-auto space-y-4">
        {/* Period Selector */}
        <div className="flex rounded-xl overflow-hidden" style={{ backgroundColor: 'var(--bg-secondary)' }}>
          {(['Week', 'Month', 'Quarter', 'Year', 'All'] as TimePeriod[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`flex-1 py-2 text-xs font-medium transition-colors ${
                period === p ? 'bg-purple-600 text-white' : ''
              }`}
              style={period !== p ? { color: 'var(--text-secondary)' } : {}}
            >
              {p}
            </button>
          ))}
        </div>

        {/* Goal Progress */}
        {hasGoal ? (
          <Card onClick={() => setShowGoalEditor(true)}>
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{goalName}</p>
                <p className="text-xs capitalize" style={{ color: 'var(--text-secondary)' }}>{goalPeriod} goal</p>
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
            <Target size={16} /> Set an Income Goal
          </button>
        )}

        {/* Stats Grid */}
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

        {/* Tax Estimate */}
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

        {/* Income vs Expenses Chart */}
        {chartData.length > 0 && (
          <Card>
            <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Income vs Expenses</p>
            <div className="relative" style={{ height: '160px' }}>
              {/* Zero axis line */}
              <div
                className="absolute left-0 right-0"
                style={{ top: '50%', height: '1px', backgroundColor: 'var(--border)' }}
              />

              {/* Bars container */}
              <div className="flex items-center h-full justify-center" style={{ gap: chartData.length > 20 ? '1px' : '3px' }}>
                {chartData.map((d, i) => (
                  <div
                    key={i}
                    className="flex flex-col h-full relative"
                    style={{
                      width: chartData.length <= 6
                        ? '40px'
                        : chartData.length <= 14
                          ? '24px'
                          : undefined,
                      flex: chartData.length > 14 ? '1' : undefined,
                      maxWidth: '48px',
                    }}
                  >
                    {/* Top half — income grows up from center */}
                    <div className="flex-1 flex items-end justify-center">
                      <div
                        className="w-full rounded-t"
                        style={{
                          height: chartMax > 0 && d.income > 0
                            ? `${Math.max(4, (d.income / chartMax) * 100)}%`
                            : '0',
                          backgroundColor: 'rgba(34,197,94,0.6)',
                        }}
                      />
                    </div>
                    {/* Bottom half — expense grows down from center */}
                    <div className="flex-1 flex items-start justify-center">
                      <div
                        className="w-full rounded-b"
                        style={{
                          height: chartMax > 0 && d.expense > 0
                            ? `${Math.max(4, (d.expense / chartMax) * 100)}%`
                            : '0',
                          backgroundColor: 'rgba(239,68,68,0.5)',
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {/* Labels */}
            <div className="flex mt-1 justify-center" style={{ gap: chartData.length > 20 ? '1px' : '3px' }}>
              {chartData.map((d, i) => (
                <div
                  key={i}
                  className="text-center"
                  style={{
                    width: chartData.length <= 6
                      ? '40px'
                      : chartData.length <= 14
                        ? '24px'
                        : undefined,
                    flex: chartData.length > 14 ? '1' : undefined,
                    maxWidth: '48px',
                  }}
                >
                  {(chartData.length <= 14 || i % Math.ceil(chartData.length / 8) === 0) && (
                    <span className="text-[9px]" style={{ color: 'var(--text-secondary)' }}>{d.label}</span>
                  )}
                </div>
              ))}
            </div>
            {/* Legend */}
            <div className="flex items-center justify-center gap-4 mt-2">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-sm bg-green-500/60" />
                <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>Income</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-sm bg-red-500/50" />
                <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>Expenses</span>
              </div>
            </div>
            {/* Full Analytics link */}
            {onOpenAnalytics && (
              <button
                onClick={onOpenAnalytics}
                className="flex items-center justify-center gap-2 w-full mt-3 pt-3 text-xs font-semibold text-green-500 active:opacity-70"
                style={{ borderTop: '1px solid var(--border)' }}
              >
                <BarChart3 size={14} /> Full Analytics
              </button>
            )}
          </Card>
        )}

        {/* Expense Breakdown */}
        {expenseBreakdown.length > 0 && (
          <Card>
            <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Top Expenses</p>
            <div className="space-y-2.5">
              {expenseBreakdown.map(item => (
                <div key={item.category}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm capitalize" style={{ color: 'var(--text-primary)' }}>{item.category}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{item.pct}%</span>
                      <span className="text-sm font-medium text-red-500">{formatCurrency(item.amount)}</span>
                    </div>
                  </div>
                  <div className="w-full h-1.5 rounded-full" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                    <div
                      className="h-full rounded-full bg-red-500/50"
                      style={{ width: `${item.pct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Outstanding Balances */}
        {outstanding.length > 0 && (
          <Card>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <AlertCircle size={16} className="text-orange-500" />
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Outstanding Balances</p>
              </div>
              <span className="text-sm font-bold text-orange-500">{formatCurrency(totalOutstanding)}</span>
            </div>
            <div className="space-y-2">
              {outstanding.slice(0, 5).map(b => {
                const client = clients.find(c => c.id === b.clientId)
                return (
                  <div key={b.id} className="flex items-center justify-between">
                    <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
                      {client?.alias ?? 'Unknown'}
                    </span>
                    <span className="text-sm text-orange-500">{formatCurrency(bookingTotal(b))}</span>
                  </div>
                )
              })}
              {outstanding.length > 5 && (
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  + {outstanding.length - 5} more
                </p>
              )}
            </div>
          </Card>
        )}

        {/* Recent Transactions */}
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
                      {format(new Date(t.date), 'MMM d')}
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
      </div>

      {/* Modals */}
      <TransactionEditor isOpen={showEditor} onClose={() => setShowEditor(false)} />
      <GoalEditor isOpen={showGoalEditor} onClose={() => setShowGoalEditor(false)} />
      <TaxSettingsEditor isOpen={showTaxSettings} onClose={() => setShowTaxSettings(false)} />
      <AllTransactionsModal isOpen={showAllTransactions} onClose={() => setShowAllTransactions(false)} />
      <ImportExportModal isOpen={showImportExport} onClose={() => setShowImportExport(false)} initialTab="transactions" />
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
// GOAL EDITOR
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function GoalEditor({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [goalName, setGoalName] = useLocalStorage('goalName', '')
  const [goalTarget, setGoalTarget] = useLocalStorage('goalTarget', 0)
  const [goalPeriod, setGoalPeriod] = useLocalStorage<'weekly' | 'monthly' | 'quarterly'>('goalPeriod', 'monthly')
  const [name, setName] = useState(goalName)
  const [target, setTarget] = useState(goalTarget.toString())
  const [period, setPeriod] = useState(goalPeriod)

  // Sync when opening
  const [wasOpen, setWasOpen] = useState(false)
  if (isOpen && !wasOpen) {
    setName(goalName)
    setTarget(goalTarget > 0 ? goalTarget.toString() : '')
    setPeriod(goalPeriod)
  }
  if (isOpen !== wasOpen) setWasOpen(isOpen)

  function save() {
    setGoalName(name.trim())
    setGoalTarget(parseInt(target) || 0)
    setGoalPeriod(period)
    onClose()
  }

  function remove() {
    setGoalName('')
    setGoalTarget(0)
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Income Goal"
      actions={
        <button onClick={save} className="p-1 text-purple-500">
          <Check size={20} />
        </button>
      }
    >
      <div className="px-4 py-2" style={{ backgroundColor: 'var(--bg-secondary)' }}>
        <SectionLabel label="Goal Details" />
        <FieldTextInput label="Name" value={name} onChange={setName} placeholder="e.g. Monthly Income" />
        <div className="mb-3">
          <label className="text-xs font-semibold block mb-1" style={{ color: 'var(--text-primary)' }}>Target ($)</label>
          <input type="text" inputMode="numeric"
            value={target} onChange={e => setTarget(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder="5000" className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
            style={fieldInputStyle} />
        </div>
        <div className="mb-3">
          <label className="text-xs font-semibold block mb-1" style={{ color: 'var(--text-primary)' }}>Period</label>
          <div className="flex gap-2">
            {(['weekly', 'monthly', 'quarterly'] as const).map(p => (
              <button key={p} type="button" onClick={() => setPeriod(p)}
                className={`flex-1 py-2.5 rounded-lg text-sm font-bold text-center ${period === p ? 'bg-purple-600 text-white' : ''}`}
                style={period !== p ? { backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)', border: '1px solid var(--border)' } : { WebkitTapHighlightColor: 'transparent' }}>
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="py-4 space-y-3">
          <button onClick={save}
            className="w-full py-3 rounded-xl font-semibold text-sm bg-purple-600 text-white active:bg-purple-700">
            Save Goal
          </button>
          {goalName.length > 0 && (
            <button onClick={remove} className="w-full py-2 text-sm text-red-500 font-medium">
              Delete Goal
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
        <button onClick={save} className="p-1 text-purple-500">
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
  const [deleteTxnId, setDeleteTxnId] = useState<string | null>(null)

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
          <div className="flex rounded-xl overflow-hidden mb-3" style={{ backgroundColor: 'var(--bg-primary)' }}>
            {(['all', 'income', 'expense'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilterType(f)}
                className={`flex-1 py-2 text-xs font-medium capitalize transition-colors ${
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
            <Search size={14} style={{ color: 'var(--text-secondary)' }} />
            <input
              type="text"
              placeholder="Search transactions..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 bg-transparent text-sm outline-none"
              style={{ color: 'var(--text-primary)' }}
            />
            {search && (
              <button onClick={() => setSearch('')}>
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
                    {format(new Date(t.date), 'MMM d, yyyy')}
                    {t.paymentMethod ? ` · ${t.paymentMethod}` : ''}
                    {t.notes ? ` · ${t.notes.slice(0, 30)}` : ''}
                  </p>
                </div>
                <p className={`text-sm font-semibold ${t.type === 'income' ? 'text-green-500' : 'text-red-500'}`}>
                  {t.type === 'income' ? '+' : '-'}{formatCurrency(t.amount)}
                </p>
                <button
                  onClick={() => setDeleteTxnId(t.id)}
                  className="p-1 opacity-40 active:opacity-100"
                  style={{ color: 'var(--text-secondary)' }}
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
    <ConfirmDialog
      isOpen={!!deleteTxnId}
      title="Delete Transaction"
      message="Delete this transaction? This cannot be undone."
      confirmLabel="Delete"
      onConfirm={() => { if (deleteTxnId) db.transactions.delete(deleteTxnId); setDeleteTxnId(null) }}
      onCancel={() => setDeleteTxnId(null)}
    />
    </>
  )
}
