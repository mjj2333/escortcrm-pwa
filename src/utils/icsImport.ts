// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ICS (iCalendar) file parser for importing calendar events
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface ParsedEvent {
  uid: string
  summary: string
  start: Date
  durationMin: number
  location: string
  description: string
}

/** Unfold RFC 5545 continuation lines (lines starting with space or tab) */
function unfold(raw: string): string {
  return raw.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '')
}

/** Unescape RFC 5545 special characters */
function icsUnescape(text: string): string {
  return text
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
}

/** Parse an ICS datetime string (UTC or local) → Date */
function parseICSDate(val: string): Date | null {
  // Format: YYYYMMDDTHHMMSSZ (UTC) or YYYYMMDDTHHMMSS (local)
  // Also handle date-only: YYYYMMDD
  const clean = val.replace(/^.*[:=]/, '').trim() // strip TZID= or VALUE= prefixes
  const m = clean.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?(Z)?$/)
  if (!m) return null

  const [, y, mo, d, h, mi, s, utc] = m
  if (utc || clean.endsWith('Z')) {
    return new Date(Date.UTC(+y, +mo - 1, +d, +(h ?? 0), +(mi ?? 0), +(s ?? 0)))
  }
  return new Date(+y, +mo - 1, +d, +(h ?? 0), +(mi ?? 0), +(s ?? 0))
}

/** Parse an ICS DURATION value (e.g., PT1H30M) → minutes */
function parseDuration(val: string): number {
  const m = val.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
  if (!m) return 60
  const days = +(m[1] ?? 0)
  const hours = +(m[2] ?? 0)
  const mins = +(m[3] ?? 0)
  return days * 1440 + hours * 60 + mins
}

/** Extract the value part from an ICS property line (handles params like TZID) */
function propValue(line: string): string {
  const colonIdx = line.indexOf(':')
  return colonIdx >= 0 ? line.slice(colonIdx + 1) : line
}

/** Parse an ICS file string → array of ParsedEvent */
export function parseICS(raw: string): ParsedEvent[] {
  const unfolded = unfold(raw)
  const lines = unfolded.split(/\r?\n/)
  const events: ParsedEvent[] = []

  let inEvent = false
  let uid = ''
  let summary = ''
  let dtstart = ''
  let dtend = ''
  let duration = ''
  let location = ''
  let description = ''

  for (const line of lines) {
    const upper = line.toUpperCase()

    if (upper === 'BEGIN:VEVENT') {
      inEvent = true
      uid = ''
      summary = ''
      dtstart = ''
      dtend = ''
      duration = ''
      location = ''
      description = ''
      continue
    }

    if (upper === 'END:VEVENT') {
      if (inEvent && dtstart) {
        const start = parseICSDate(dtstart)
        if (start) {
          let durationMin = 60
          if (dtend) {
            const end = parseICSDate(dtend)
            if (end) durationMin = Math.round((end.getTime() - start.getTime()) / 60000)
          } else if (duration) {
            durationMin = parseDuration(duration)
          }
          if (durationMin <= 0) durationMin = 60

          events.push({
            uid: uid || crypto.randomUUID(),
            summary: icsUnescape(summary),
            start,
            durationMin,
            location: icsUnescape(location),
            description: icsUnescape(description),
          })
        }
      }
      inEvent = false
      continue
    }

    if (!inEvent) continue

    if (upper.startsWith('UID')) uid = propValue(line)
    else if (upper.startsWith('SUMMARY')) summary = propValue(line)
    else if (upper.startsWith('DTSTART')) dtstart = propValue(line)
    else if (upper.startsWith('DTEND')) dtend = propValue(line)
    else if (upper.startsWith('DURATION')) duration = propValue(line)
    else if (upper.startsWith('LOCATION')) location = propValue(line)
    else if (upper.startsWith('DESCRIPTION')) description = propValue(line)
  }

  return events
}

/** Extract a potential client name from an ICS summary */
export function extractClientName(summary: string): string {
  // Strip common prefixes used by calendar apps and our own export format
  const prefixes = [
    /^Booking\s*[—–-]\s*/i,
    /^Appointment\s+with\s+/i,
    /^Meeting\s+with\s+/i,
    /^Session\s+with\s+/i,
    /^Call\s+with\s+/i,
  ]
  let name = summary.trim()
  for (const re of prefixes) {
    name = name.replace(re, '')
  }
  return name.trim()
}

/** Match a name against client aliases. Returns matching client IDs. */
export function matchClients(
  name: string,
  clients: { id: string; alias: string }[],
): string[] {
  if (!name) return []
  const lower = name.toLowerCase()
  return clients
    .filter(c => c.alias.toLowerCase().includes(lower) || lower.includes(c.alias.toLowerCase()))
    .map(c => c.id)
}
