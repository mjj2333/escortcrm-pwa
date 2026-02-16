import type { ReactNode } from 'react'

interface EmptyStateProps {
  icon: ReactNode
  title: string
  description: string
  action?: ReactNode
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
      <div className="mb-4 opacity-40">
        {icon}
      </div>
      <h3 className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
        {title}
      </h3>
      <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
        {description}
      </p>
      {action}
    </div>
  )
}
