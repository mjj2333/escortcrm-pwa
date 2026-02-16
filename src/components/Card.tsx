import type { ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  className?: string
  onClick?: () => void
}

export function Card({ children, className = '', onClick }: CardProps) {
  return (
    <div
      className={`rounded-xl border p-4 ${onClick ? 'cursor-pointer active:scale-[0.98] transition-transform' : ''} ${className}`}
      style={{
        backgroundColor: 'var(--bg-card)',
        borderColor: 'var(--border)',
      }}
      onClick={onClick}
    >
      {children}
    </div>
  )
}

interface CardHeaderProps {
  title: string
  icon?: ReactNode
  action?: ReactNode
}

export function CardHeader({ title, icon, action }: CardHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        {icon}
        <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
          {title}
        </h3>
      </div>
      {action}
    </div>
  )
}
