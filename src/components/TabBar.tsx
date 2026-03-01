import { memo, useRef, useCallback } from 'react'
import { Home, Users, Calendar, DollarSign, Shield } from 'lucide-react'
import { isPro } from './planLimits'

interface TabBarProps {
  activeTab: number
  onTabChange: (tab: number) => void
  onStealthTrigger?: () => void
}

const tabs = [
  { icon: Home, label: 'Home' },
  { icon: Calendar, label: 'Schedule' },
  { icon: Users, label: 'Clients' },
  { icon: DollarSign, label: 'Finances', proOnly: true },
  { icon: Shield, label: 'Safety' },
]

export const TabBar = memo(function TabBar({ activeTab, onTabChange, onStealthTrigger }: TabBarProps) {
  const pro = isPro()
  const homeTaps = useRef<number[]>([])

  const handleHomeTap = useCallback(() => {
    if (!onStealthTrigger) {
      onTabChange(0)
      return
    }
    const now = Date.now()
    homeTaps.current = [...homeTaps.current.filter(t => now - t < 800), now]
    if (homeTaps.current.length >= 3) {
      homeTaps.current = []
      onStealthTrigger()
    } else {
      onTabChange(0)
    }
  }, [onStealthTrigger, onTabChange])

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
              onClick={index === 0 ? handleHomeTap : () => onTabChange(index)}
              className="flex flex-col items-center gap-0.5 py-2 px-3 min-w-[64px] transition-colors relative"
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
              {tab.proOnly && !pro && (
                <span
                  className="absolute top-1.5 right-2 w-2 h-2 rounded-full"
                  style={{ background: 'linear-gradient(135deg, #a855f7, #ec4899)' }}
                />
              )}
            </button>
          )
        })}
      </div>
    </nav>
  )
})
