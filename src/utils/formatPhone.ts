export function formatPhone(value: string): string {
  // Separate extension before stripping non-digits
  const extMatch = value.match(/(?:ext\.?|x)\s*(\d+)\s*$/i)
  const ext = extMatch ? ` ext ${extMatch[1]}` : ''
  const base = extMatch ? value.slice(0, extMatch.index) : value

  const hasPlus = base.startsWith('+')
  const digits = base.replace(/\D/g, '')
  if (digits.length === 0) return hasPlus ? '+' : ''

  // +1 with 10 digits = North American with country code — strip the +1
  if (hasPlus && digits.length === 11 && digits.startsWith('1')) {
    const na = digits.slice(1)
    return `(${na.slice(0, 3)}) ${na.slice(3, 6)}-${na.slice(6, 10)}${ext}`
  }

  // International: starts with + or has country code (more than 10 digits)
  if (hasPlus || digits.length > 10) {
    return '+' + digits + ext
  }

  // North American 10-digit formatting
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}${ext}`
  }

  // Short or non-standard numbers — return as-is with extension
  return digits + ext
}
