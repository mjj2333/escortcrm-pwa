// Skeleton primitives and page-level skeleton layouts.
//
// Usage:
//   const clients = useLiveQuery(() => db.clients.toArray())  // keep undefined
//   if (clients === undefined) return <ClientsPageSkeleton />
//   const list = clients ?? []

interface SkeletonProps {
  className?: string
  style?: React.CSSProperties
}

// ── Primitives ────────────────────────────────────────────

/** A single shimmer block. Width/height set via className or style. */
export function Sk({ className = '', style }: SkeletonProps) {
  return <div className={`skeleton ${className}`} style={style} />
}

/** A full-width card shell matching the Card component. */
export function SkCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-2xl p-4"
      style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}
    >
      {children}
    </div>
  )
}

// ── Shared row skeletons ──────────────────────────────────

/** Client list row skeleton */
export function SkClientRow() {
  return (
    <SkCard>
      <div className="flex items-center gap-3">
        <Sk className="w-10 h-10 rounded-full shrink-0" />
        <div className="flex-1 space-y-2">
          <Sk className="h-3.5 w-2/5" />
          <Sk className="h-3 w-1/3" />
        </div>
        <Sk className="h-5 w-16 rounded-full" />
      </div>
    </SkCard>
  )
}

/** Booking list row skeleton */
export function SkBookingRow() {
  return (
    <SkCard>
      <div className="flex items-start gap-3">
        <Sk className="w-10 h-10 rounded-xl shrink-0" />
        <div className="flex-1 space-y-2">
          <Sk className="h-3.5 w-1/3" />
          <Sk className="h-3 w-1/2" />
          <Sk className="h-3 w-2/5" />
        </div>
        <Sk className="h-5 w-20 rounded-full" />
      </div>
    </SkCard>
  )
}

/** Finance transaction row skeleton */
export function SkTransactionRow() {
  return (
    <SkCard>
      <div className="flex items-center gap-3">
        <Sk className="w-9 h-9 rounded-xl shrink-0" />
        <div className="flex-1 space-y-2">
          <Sk className="h-3.5 w-2/5" />
          <Sk className="h-3 w-1/4" />
        </div>
        <Sk className="h-4 w-16" />
      </div>
    </SkCard>
  )
}

/** Safety check row skeleton */
export function SkSafetyRow() {
  return (
    <SkCard>
      <div className="flex items-start gap-3">
        <Sk className="w-5 h-5 rounded-full shrink-0 mt-0.5" />
        <div className="flex-1 space-y-2">
          <div className="flex gap-2">
            <Sk className="h-4 w-16 rounded" />
            <Sk className="h-4 w-24" />
          </div>
          <Sk className="h-3 w-1/3" />
          <Sk className="h-3 w-2/5" />
        </div>
      </div>
    </SkCard>
  )
}

// ── Stat card skeleton (used on HomePage and FinancesPage) ─

export function SkStatCard() {
  return (
    <SkCard>
      <Sk className="h-3 w-1/2 mb-3" />
      <Sk className="h-7 w-2/3 mb-1" />
      <Sk className="h-3 w-1/3" />
    </SkCard>
  )
}

// ── Page-level skeletons ──────────────────────────────────

/** Standard page header skeleton (title + optional action) */
function SkHeader({ hasAction = true }: { hasAction?: boolean }) {
  return (
    <div
      className="sticky top-0 z-30 px-4 flex items-center justify-between border-b"
      style={{ height: 56, backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border)' }}
    >
      <Sk className="h-5 w-24" />
      {hasAction && <Sk className="h-8 w-8 rounded-lg" />}
    </div>
  )
}

export function HomePageSkeleton() {
  return (
    <div className="pb-20">
      <SkHeader />
      <div className="px-4 py-4 space-y-4 max-w-lg mx-auto">
        {/* Stats row */}
        <div className="grid grid-cols-2 gap-3">
          <SkStatCard />
          <SkStatCard />
        </div>
        {/* Section heading */}
        <Sk className="h-4 w-32 mt-2" />
        {/* Booking rows */}
        <div className="space-y-2">
          <SkBookingRow />
          <SkBookingRow />
          <SkBookingRow />
        </div>
        {/* Section heading */}
        <Sk className="h-4 w-28" />
        <div className="space-y-2">
          <SkClientRow />
          <SkClientRow />
        </div>
      </div>
    </div>
  )
}

export function ClientsPageSkeleton() {
  return (
    <div className="pb-20">
      <SkHeader />
      {/* Search bar */}
      <div className="px-4 pt-3">
        <Sk className="h-10 w-full rounded-lg mb-3" />
      </div>
      <div className="px-4 space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkClientRow key={i} />
        ))}
      </div>
    </div>
  )
}

export function SchedulePageSkeleton() {
  return (
    <div className="pb-20">
      <SkHeader />
      {/* View toggle + date nav */}
      <div className="px-4 pt-3 flex gap-2 mb-3">
        <Sk className="h-9 flex-1 rounded-lg" />
        <Sk className="h-9 flex-1 rounded-lg" />
      </div>
      <div className="px-4 space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <SkBookingRow key={i} />
        ))}
      </div>
    </div>
  )
}

export function FinancesPageSkeleton() {
  return (
    <div className="pb-20">
      <SkHeader />
      {/* Summary stats */}
      <div className="px-4 pt-3 grid grid-cols-3 gap-2 mb-4">
        <SkStatCard />
        <SkStatCard />
        <SkStatCard />
      </div>
      {/* Period selector */}
      <div className="px-4 mb-3">
        <Sk className="h-9 w-full rounded-lg" />
      </div>
      {/* Transaction rows */}
      <div className="px-4 space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <SkTransactionRow key={i} />
        ))}
      </div>
    </div>
  )
}

export function SafetyPageSkeleton() {
  return (
    <div className="pb-20">
      <SkHeader />
      {/* Tab strip */}
      <div className="mx-4 mt-3 mb-3">
        <Sk className="h-9 w-full rounded-lg" />
      </div>
      <div className="px-4 space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkSafetyRow key={i} />
        ))}
      </div>
    </div>
  )
}
