import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { ReactNode } from 'react'

interface CollapsibleCardProps {
  label: string
  id: string
  expanded: Set<string>
  toggle: (id: string) => void
  children: ReactNode
  badge?: ReactNode
  preview?: ReactNode
}

export function CollapsibleCard({ label, id, expanded, toggle, children, badge, preview }: CollapsibleCardProps) {
  const isOpen = expanded.has(id)
  return (
    <div className="rounded-xl overflow-hidden" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      <button
        onClick={() => toggle(id)}
        className="flex items-center justify-between w-full px-3 py-2.5 active:opacity-70"
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <p className="text-xs font-semibold uppercase" style={{ color: 'var(--text-secondary)' }}>{label}</p>
          {badge}
        </div>
        {!isOpen && preview && <div className="flex-shrink-0 ml-2">{preview}</div>}
        <ChevronDown
          size={14}
          className="ml-1 shrink-0 transition-transform"
          style={{ color: 'var(--text-secondary)', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
        />
      </button>
      {isOpen && (
        <div className="px-3 pb-3" style={{ borderTop: '1px solid var(--border)' }}>
          {children}
        </div>
      )}
    </div>
  )
}

/** Hook helper for accordion expand/collapse state. 
 *  Pass `defaultOpen` to pre-expand sections. */
export function useAccordion(defaultOpen: string[] = []) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(defaultOpen))
  const toggle = (key: string) => setExpanded(prev => {
    const next = new Set(prev)
    next.has(key) ? next.delete(key) : next.add(key)
    return next
  })
  return { expanded, toggle }
}
