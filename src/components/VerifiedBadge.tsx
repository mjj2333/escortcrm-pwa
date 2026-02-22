import type { Client } from '../types'

/** Small verified checkmark shown inline next to client names */
export function VerifiedBadge({ client, size = 14 }: { client?: Client | null; size?: number }) {
  if (!client || client.screeningStatus !== 'Verified') return null
  return (
    <span
      title="Verified"
      className="inline-flex items-center justify-center shrink-0"
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: '#22c55e',
        marginLeft: '3px',
        verticalAlign: 'middle',
      }}
    >
      <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 12 12" fill="none">
        <path d="M2.5 6.5L5 9L9.5 3.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  )
}
