import { Home, Users, Calendar, DollarSign, Shield } from 'lucide-react'

interface TabBarProps {
  activeTab: number
  onTabChange: (tab: number) => void
}

const tabs = [
  { icon: Home, label: 'Home' },
  { icon: Calendar, label: 'Schedule' },
  { icon: Users, label: 'Clients' },
  { icon: DollarSign, label: 'Finances' },
  { icon: Shield, label: 'Safety' },
]

export function TabBar({ activeTab, onTabChange }: TabBarProps) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t safe-bottom"
      style={{
        backgroundColor: 'var(--bg-card)',
        borderColor: 'var(--border)',
      }}
    >
      <div className="flex items-center justify-around max-w-lg mx-auto">
        {tabs.map((tab, index) => {
          const Icon = tab.icon
          const isActive = activeTab === index
          return (
            <button
              key={tab.label}
              onClick={() => onTabChange(index)}
              className="flex flex-col items-center gap-0.5 py-2 px-3 min-w-[64px] transition-colors"
            >
              <Icon
                size={22}
                className={isActive ? 'text-purple-500' : ''}
                style={{ color: isActive ? undefined : 'var(--text-secondary)' }}
              />
              <span
                className={`text-[10px] font-medium ${isActive ? 'text-purple-500' : ''}`}
                style={{ color: isActive ? undefined : 'var(--text-secondary)' }}
              >
                {tab.label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
