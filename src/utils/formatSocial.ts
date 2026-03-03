/** Trim and auto-prepend @ if missing (for Instagram, Twitter, Bluesky) */
export function formatHandle(value: string): string {
  const v = value.trim()
  if (!v) return ''
  return v.startsWith('@') ? v : `@${v}`
}

/** Trim and normalize OnlyFans URL → onlyfans.com/... */
export function formatOnlyFans(value: string): string {
  let v = value.trim()
  if (!v) return ''
  v = v.replace(/^https?:\/\//, '').replace(/^www\./, '')
  return v
}
