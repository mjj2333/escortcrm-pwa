import { Lightbulb, X } from 'lucide-react'
import { useLocalStorage, lsKey } from '../hooks/useSettings'
import { isBiometricEnabled } from '../hooks/useBiometric'
import { daysSinceBackup } from '../hooks/useBackupReminder'

interface Tip {
  id: string
  text: string
  skipIf?: () => boolean
}

const tips: Tip[] = [
  {
    id: 'stealth',
    text: 'Triple-tap Home to disguise the app as a calculator. Enable in Settings \u2192 Stealth Mode.',
    skipIf: () => {
      try {
        const raw = localStorage.getItem(lsKey('stealthEnabled'))
        return raw ? JSON.parse(raw) === true : false
      } catch { return false }
    },
  },
  {
    id: 'duress',
    text: 'Set a duress PIN that silently erases all data if entered on the lock screen. Configure in Settings \u2192 Security.',
    skipIf: () => {
      const raw = localStorage.getItem(lsKey('duressPin'))
      return raw ? raw.replace(/^"|"$/g, '') !== '' : false
    },
  },
  {
    id: 'ics',
    text: 'Export any booking to your phone\'s calendar with one tap from the booking detail screen.',
  },
  {
    id: 'checklist',
    text: 'Each booking has a prep checklist. Customize the default items in Settings.',
  },
  {
    id: 'journal',
    text: 'After completing a session, add private notes and tags in the Session Journal.',
  },
  {
    id: 'swipe',
    text: 'Swipe any booking left for quick actions \u2014 complete, cancel, or mark as no-show.',
  },
  {
    id: 'biometric',
    text: 'Unlock with Face ID or fingerprint instead of your PIN. Enable in Settings \u2192 Security.',
    skipIf: () => isBiometricEnabled(),
  },
  {
    id: 'backup',
    text: 'Back up your data regularly from Settings \u2192 Backup & Restore.',
    skipIf: () => {
      const days = daysSinceBackup()
      return days !== null && days < 14
    },
  },
]

export function DidYouKnowTip() {
  const [dismissedTips, setDismissedTips] = useLocalStorage<string[]>('dismissedTips', [])

  // Find the first tip that isn't dismissed and isn't skipped
  const activeTip = tips.find(t =>
    !dismissedTips.includes(t.id) && (!t.skipIf || !t.skipIf())
  )

  if (!activeTip) return null

  function dismiss() {
    setDismissedTips(prev => [...prev, activeTip!.id])
  }

  return (
    <div
      className="mx-4 mt-3 rounded-2xl p-4"
      style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}
    >
      <div className="flex items-start gap-3">
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5"
          style={{ backgroundColor: 'rgba(234,179,8,0.15)' }}
        >
          <Lightbulb size={16} style={{ color: '#eab308' }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold mb-1" style={{ color: '#eab308' }}>Did you know?</p>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--text-primary)' }}>
            {activeTip.text}
          </p>
        </div>
        <button
          onClick={dismiss}
          className="p-1 shrink-0"
          style={{ color: 'var(--text-secondary)' }}
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}
