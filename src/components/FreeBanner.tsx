import { Sparkles } from 'lucide-react'
import { isActivated } from './paywallState'

/** @deprecated Renamed to FreeBanner. Kept for backward compatibility. */
export function TrialBanner({ onUpgrade }: { onUpgrade: () => void }) {
  return <FreeBanner onUpgrade={onUpgrade} />
}

export function FreeBanner({ onUpgrade }: { onUpgrade: () => void }) {
  if (isActivated()) return null

  return (
    <button
      onClick={onUpgrade}
      className="w-full px-4 text-center text-xs font-semibold flex items-center justify-center gap-1.5"
      style={{
        background: 'linear-gradient(90deg, #a855f7, #ec4899)',
        color: '#fff',
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 8px)',
        paddingBottom: '8px',
      }}
    >
      <Sparkles size={12} />
      Free plan — Upgrade to Pro for unlimited access
    </button>
  )
}
