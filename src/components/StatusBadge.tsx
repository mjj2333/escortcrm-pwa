interface StatusBadgeProps {
  text: string
  color: string
  icon?: React.ReactNode
  size?: 'sm' | 'md'
}

const colorMap: Record<string, { bg: string; text: string }> = {
  purple: { bg: 'rgba(168,85,247,0.15)', text: '#c084fc' },
  blue: { bg: 'rgba(59,130,246,0.15)', text: '#3b82f6' },
  orange: { bg: 'rgba(249,115,22,0.15)', text: '#f97316' },
  green: { bg: 'rgba(34,197,94,0.15)', text: '#22c55e' },
  teal: { bg: 'rgba(20,184,166,0.15)', text: '#14b8a6' },
  red: { bg: 'rgba(239,68,68,0.15)', text: '#ef4444' },
  gray: { bg: 'rgba(107,114,128,0.15)', text: '#6b7280' },
  pink: { bg: 'rgba(236,72,153,0.15)', text: '#ec4899' },
}

export function StatusBadge({ text, color, icon, size = 'sm' }: StatusBadgeProps) {
  const colors = colorMap[color] ?? colorMap.gray

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium ${
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-3 py-1 text-xs'
      }`}
      style={{ backgroundColor: colors.bg, color: colors.text }}
    >
      {icon}
      {text}
    </span>
  )
}
