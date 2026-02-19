import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  children?: ReactNode
}

export function PageHeader({ title, children }: PageHeaderProps) {
  return (
    <header
      className="sticky top-0 z-30 border-b backdrop-blur-xl header-frosted"
      style={{
        borderColor: 'var(--border)',
      }}
    >
      <div className="flex items-center justify-between px-4 h-12 max-w-lg mx-auto">
        <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
          {title}
        </h1>
        <div className="flex items-center gap-2">
          {children}
        </div>
      </div>
    </header>
  )
}
