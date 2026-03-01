/**
 * Locale-aware date formatting helpers using Intl.DateTimeFormat.
 * Falls back gracefully to English if the browser locale isn't supported.
 */

const locale = navigator.language || 'en-US'

function fmtDate(d: Date, options: Intl.DateTimeFormatOptions): string {
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString(locale, options)
}

function fmtTimeStr(d: Date, options: Intl.DateTimeFormatOptions): string {
  if (isNaN(d.getTime())) return ''
  return d.toLocaleTimeString(locale, options)
}

/** "Feb 28" */
export function fmtShortDate(d: Date): string {
  return fmtDate(d, { month: 'short', day: 'numeric' })
}

/** "Feb 28, 2026" */
export function fmtMediumDate(d: Date): string {
  return fmtDate(d, { month: 'short', day: 'numeric', year: 'numeric' })
}

/** "February 2026" */
export function fmtMonthYear(d: Date): string {
  return fmtDate(d, { month: 'long', year: 'numeric' })
}

/** "February" */
export function fmtMonth(d: Date): string {
  return fmtDate(d, { month: 'long' })
}

/** "Feb" */
export function fmtShortMonth(d: Date): string {
  return fmtDate(d, { month: 'short' })
}

/** "Friday, February 28" */
export function fmtFullDayDate(d: Date): string {
  return fmtDate(d, { weekday: 'long', month: 'long', day: 'numeric' })
}

/** "Friday, February 28, 2026" */
export function fmtFullDayDateYear(d: Date): string {
  return fmtDate(d, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

/** "Fri, Feb 28" */
export function fmtShortDayDate(d: Date): string {
  return fmtDate(d, { weekday: 'short', month: 'short', day: 'numeric' })
}

/** "Friday" */
export function fmtWeekday(d: Date): string {
  return fmtDate(d, { weekday: 'long' })
}

/** "2:30 PM" */
export function fmtTime(d: Date): string {
  return fmtTimeStr(d, { hour: 'numeric', minute: '2-digit' })
}

/** "Feb 28, 2:30 PM" */
export function fmtDateAndTime(d: Date): string {
  return `${fmtShortDate(d)}, ${fmtTime(d)}`
}

/** "Feb 28, 2026 · 2:30 PM" */
export function fmtFullDateAndTime(d: Date): string {
  return `${fmtMediumDate(d)} · ${fmtTime(d)}`
}
