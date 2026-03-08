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

/** Extract TZID parameter from a property line like DTSTART;TZID=America/New_York:... */
function extractTZID(line: string): string | null {
  const m = line.match(/;TZID=([^:;]+)/i)
  return m ? m[1] : null
}

/** Convert a datetime in a named timezone to a local Date using Intl API */
function dateInTimezone(
  y: number, mo: number, d: number, h: number, mi: number, s: number,
  tzid: string,
): Date {
  try {
    // Start with a UTC guess where the numbers match the desired wall-clock time
    const guessUtc = Date.UTC(y, mo - 1, d, h, mi, s)
    // Ask what that UTC instant looks like in the target timezone
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tzid,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    }).formatToParts(new Date(guessUtc))
    const get = (type: string) => +(parts.find(p => p.type === type)?.value ?? 0)
    const tzH = get('hour') === 24 ? 0 : get('hour')
    const tzGuess = Date.UTC(get('year'), get('month') - 1, get('day'), tzH, get('minute'), get('second'))
    // The difference is the UTC offset for this timezone at this time
    return new Date(guessUtc - (tzGuess - guessUtc))
  } catch {
    // Invalid TZID — fall back to local time
    return new Date(y, mo - 1, d, h, mi, s)
  }
}

/** Parse an ICS datetime string (UTC, TZID-qualified, or local) → Date */
function parseICSDate(val: string, tzid?: string): Date | null {
  // Format: YYYYMMDDTHHMMSSZ (UTC) or YYYYMMDDTHHMMSS (local)
  // Also handle date-only: YYYYMMDD
  const clean = val.replace(/^.*[:=]/, '').trim()
  const m = clean.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?(Z)?$/)
  if (!m) return null

  const [, y, mo, d, h, mi, s, utc] = m
  const yn = +y, mon = +mo, dn = +d, hn = +(h ?? 0), min = +(mi ?? 0), sn = +(s ?? 0)

  if (utc || clean.endsWith('Z')) {
    return new Date(Date.UTC(yn, mon - 1, dn, hn, min, sn))
  }
  if (tzid) {
    return dateInTimezone(yn, mon, dn, hn, min, sn, tzid)
  }
  return new Date(yn, mon - 1, dn, hn, min, sn)
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
  let dtstartTzid = ''
  let dtendTzid = ''
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
      dtstartTzid = ''
      dtendTzid = ''
      duration = ''
      location = ''
      description = ''
      continue
    }

    if (upper === 'END:VEVENT') {
      if (inEvent && dtstart) {
        const start = parseICSDate(dtstart, dtstartTzid || undefined)
        if (start) {
          let durationMin = 60
          if (dtend) {
            const end = parseICSDate(dtend, dtendTzid || undefined)
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
    else if (upper.startsWith('DTSTART')) {
      dtstart = propValue(line)
      dtstartTzid = extractTZID(line) ?? ''
    }
    else if (upper.startsWith('DTEND')) {
      dtend = propValue(line)
      dtendTzid = extractTZID(line) ?? ''
    }
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

/** Match a name against client aliases. Returns matching client IDs.
 *  Requires exact match or full-word match to avoid false positives
 *  (e.g. "Jo" should not match "John"). */
export function matchClients(
  name: string,
  clients: { id: string; alias: string }[],
): string[] {
  if (!name) return []
  const lower = name.toLowerCase().trim()
  if (lower.length < 2) return []
  return clients
    .filter(c => {
      const alias = c.alias.toLowerCase().trim()
      // Exact match
      if (alias === lower) return true
      // Full alias appears as a whole word in the name (or vice versa)
      const longerContainsShorter = (longer: string, shorter: string) => {
        if (shorter.length < 3) return false
        const idx = longer.indexOf(shorter)
        if (idx === -1) return false
        const before = idx === 0 || /\W/.test(longer[idx - 1])
        const after = idx + shorter.length >= longer.length || /\W/.test(longer[idx + shorter.length])
        return before && after
      }
      return longerContainsShorter(lower, alias) || longerContainsShorter(alias, lower)
    })
    .map(c => c.id)
}
