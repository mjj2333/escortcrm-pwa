export function formatPhone(value: string): string {
  const hasPlus = value.startsWith('+')
  const digits = value.replace(/\D/g, '')
  if (digits.length === 0) return hasPlus ? '+' : ''

  // International: starts with + or has country code (more than 10 digits)
  if (hasPlus || digits.length > 10) {
    return '+' + digits
  }

  // North American 10-digit formatting
  if (digits.length <= 3) return `(${digits}`
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`
}
