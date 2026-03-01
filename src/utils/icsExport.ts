import type { Booking, IncallVenue } from '../types'
import type { Client } from '../types'
import { bookingTotal, bookingDurationFormatted, formatCurrency } from '../db'

/** Format a Date to ICS UTC datetime: YYYYMMDDTHHMMSSZ */
function toICSDate(d: Date): string {
  const dt = new Date(d)
  const y = dt.getUTCFullYear()
  const mo = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const day = String(dt.getUTCDate()).padStart(2, '0')
  const h = String(dt.getUTCHours()).padStart(2, '0')
  const mi = String(dt.getUTCMinutes()).padStart(2, '0')
  const s = String(dt.getUTCSeconds()).padStart(2, '0')
  return `${y}${mo}${day}T${h}${mi}${s}Z`
}

/** Escape special chars per RFC 5545 */
function icsEscape(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
}

/** Fold lines longer than 75 octets per RFC 5545 */
function foldLine(line: string): string {
  const parts: string[] = []
  let remaining = line
  while (remaining.length > 75) {
    parts.push(remaining.slice(0, 75))
    remaining = ' ' + remaining.slice(75)
  }
  parts.push(remaining)
  return parts.join('\r\n')
}

/** Generate an ICS VCALENDAR string for a booking */
export function generateICS(booking: Booking, client?: Client, venue?: IncallVenue): string {
  const start = new Date(booking.dateTime)
  const end = new Date(start.getTime() + booking.duration * 60000)
  const now = new Date()

  const summary = client ? `Booking \u2014 ${client.alias}` : 'Booking'
  const location = venue?.address || booking.locationAddress || ''

  const descParts: string[] = []
  descParts.push(`Duration: ${bookingDurationFormatted(booking.duration)}`)
  descParts.push(`Type: ${booking.locationType}`)
  descParts.push(`Total: ${formatCurrency(bookingTotal(booking))}`)
  if (booking.notes) descParts.push(`Notes: ${booking.notes}`)
  const description = descParts.join('\\n')

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Companion//Booking//EN',
    'BEGIN:VEVENT',
    foldLine(`UID:${booking.id}@companion`),
    foldLine(`DTSTAMP:${toICSDate(now)}`),
    foldLine(`DTSTART:${toICSDate(start)}`),
    foldLine(`DTEND:${toICSDate(end)}`),
    foldLine(`SUMMARY:${icsEscape(summary)}`),
    ...(location ? [foldLine(`LOCATION:${icsEscape(location)}`)] : []),
    foldLine(`DESCRIPTION:${icsEscape(description)}`),
    'END:VEVENT',
    'END:VCALENDAR',
  ]

  return lines.join('\r\n')
}

/** Download an ICS file for a booking */
export function downloadICS(booking: Booking, client?: Client, venue?: IncallVenue): void {
  const ics = generateICS(booking, client, venue)
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `booking-${booking.id.slice(0, 8)}.ics`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
