// src/utils/exportExcel.ts
// Exports all app data as a styled multi-sheet Excel workbook.

import ExcelJS from 'exceljs'
import { db, bookingTotal } from '../db'
import type { Client, Booking, Transaction, BookingPayment, IncidentLog, JournalEntry, IncallVenue, SafetyContact, SafetyCheck } from '../types'

// ── Helpers ──────────────────────────────────────────────────────────────

function fmtDate(d: Date | string | undefined | null): string {
  if (!d) return ''
  const dt = typeof d === 'string' ? new Date(d) : d
  if (isNaN(dt.getTime())) return ''
  return dt.toLocaleDateString('en-CA') // YYYY-MM-DD
}

function fmtDateTime(d: Date | string | undefined | null): string {
  if (!d) return ''
  const dt = typeof d === 'string' ? new Date(d) : d
  if (isNaN(dt.getTime())) return ''
  return `${dt.toLocaleDateString('en-CA')} ${dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`
}

function durationLabel(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h > 0 && m > 0) return `${h}h ${m}m`
  if (h > 0) return `${h}h`
  return `${m}m`
}

// ── Styling ──────────────────────────────────────────────────────────────

const HEADER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7C3AED' } }
const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Arial' }
const BODY_FONT: Partial<ExcelJS.Font> = { size: 10, name: 'Arial' }
const MONEY_FMT = '$#,##0.00'
const THIN_BORDER: Partial<ExcelJS.Borders> = {
  bottom: { style: 'thin', color: { argb: 'FFD4D4D8' } },
}

function styleSheet(ws: ExcelJS.Worksheet, colCount: number) {
  // Header row
  const headerRow = ws.getRow(1)
  headerRow.font = HEADER_FONT
  headerRow.fill = HEADER_FILL
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' }
  headerRow.height = 28

  // Body rows
  ws.eachRow((row, idx) => {
    if (idx === 1) return
    row.font = BODY_FONT
    row.alignment = { vertical: 'middle', wrapText: true }
    row.border = THIN_BORDER
    // Alternate row shading
    if (idx % 2 === 0) {
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } }
    }
  })

  // Freeze header
  ws.views = [{ state: 'frozen', ySplit: 1, xSplit: 0, activeCell: 'A2' }]

  // Auto-filter
  if (ws.rowCount > 1) {
    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: ws.rowCount, column: colCount },
    }
  }
}

// ── Sheet builders ───────────────────────────────────────────────────────

function buildClientsSheet(wb: ExcelJS.Workbook, clients: Client[]) {
  const ws = wb.addWorksheet('Clients')
  ws.columns = [
    { header: 'Alias', key: 'alias', width: 18 },
    { header: 'Nickname', key: 'nickname', width: 18 },
    { header: 'Phone', key: 'phone', width: 16 },
    { header: 'Email', key: 'email', width: 24 },
    { header: 'Telegram', key: 'telegram', width: 18 },
    { header: 'Signal', key: 'signal', width: 16 },
    { header: 'WhatsApp', key: 'whatsapp', width: 16 },
    { header: 'Primary Contact', key: 'contact', width: 14 },
    { header: 'Secondary Contact', key: 'secondary', width: 14 },
    { header: 'Screening', key: 'screening', width: 13 },
    { header: 'Risk', key: 'risk', width: 13 },
    { header: 'Blacklisted', key: 'blocked', width: 11 },
    { header: 'Date Added', key: 'dateAdded', width: 12 },
    { header: 'Last Seen', key: 'lastSeen', width: 12 },
    { header: 'Tags', key: 'tags', width: 20 },
    { header: 'Notes', key: 'notes', width: 30 },
    { header: 'Preferences', key: 'preferences', width: 24 },
    { header: 'Boundaries', key: 'boundaries', width: 24 },
  ]
  for (const c of clients) {
    ws.addRow({
      alias: c.alias,
      nickname: c.nickname ?? '',
      phone: c.phone ?? '',
      email: c.email ?? '',
      telegram: c.telegram ?? '',
      signal: c.signal ?? '',
      whatsapp: c.whatsapp ?? '',
      contact: c.preferredContact,
      secondary: c.secondaryContact ?? '',
      screening: c.screeningStatus,
      risk: c.riskLevel,
      blocked: c.isBlocked ? 'Yes' : '',
      dateAdded: fmtDate(c.dateAdded),
      lastSeen: fmtDate(c.lastSeen),
      tags: c.tags?.map(t => t.name).join(', ') ?? '',
      notes: c.notes,
      preferences: c.preferences,
      boundaries: c.boundaries,
    })
  }
  styleSheet(ws, 14)
}

function buildBookingsSheet(
  wb: ExcelJS.Workbook,
  bookings: Booking[],
  clientMap: Map<string, string>,
) {
  const ws = wb.addWorksheet('Bookings')
  ws.columns = [
    { header: 'Date & Time', key: 'dateTime', width: 18 },
    { header: 'Client', key: 'client', width: 16 },
    { header: 'Duration', key: 'duration', width: 10 },
    { header: 'Status', key: 'status', width: 14 },
    { header: 'Location', key: 'location', width: 12 },
    { header: 'Address', key: 'address', width: 22 },
    { header: 'Base Rate', key: 'baseRate', width: 12 },
    { header: 'Extras', key: 'extras', width: 10 },
    { header: 'Travel Fee', key: 'travelFee', width: 11 },
    { header: 'Total', key: 'total', width: 12 },
    { header: 'Deposit', key: 'deposit', width: 10 },
    { header: 'Deposit Rcvd', key: 'depositRcvd', width: 12 },
    { header: 'Paid', key: 'paid', width: 8 },
    { header: 'Payment Method', key: 'method', width: 14 },
    { header: 'Notes', key: 'notes', width: 28 },
  ]
  // Sort bookings newest first
  const sorted = [...bookings].sort(
    (a, b) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime(),
  )
  for (const b of sorted) {
    const row = ws.addRow({
      dateTime: fmtDateTime(b.dateTime),
      client: (b.clientId && clientMap.get(b.clientId)) || '',
      duration: durationLabel(b.duration),
      status: b.status,
      location: b.locationType,
      address: b.locationAddress ?? '',
      baseRate: b.baseRate,
      extras: b.extras,
      travelFee: b.travelFee,
      total: bookingTotal(b),
      deposit: b.depositAmount,
      depositRcvd: b.depositReceived ? 'Yes' : '',
      paid: b.paymentReceived ? 'Yes' : '',
      method: b.paymentMethod ?? '',
      notes: b.notes,
    })
    // Money formatting
    for (const col of [7, 8, 9, 10, 11]) {
      row.getCell(col).numFmt = MONEY_FMT
    }
  }
  styleSheet(ws, 15)
}

function buildIncomeSheet(wb: ExcelJS.Workbook, transactions: Transaction[]) {
  const income = transactions
    .filter(t => t.type === 'income')
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  const ws = wb.addWorksheet('Income')
  ws.columns = [
    { header: 'Date', key: 'date', width: 12 },
    { header: 'Amount', key: 'amount', width: 12 },
    { header: 'Category', key: 'category', width: 12 },
    { header: 'Payment Method', key: 'method', width: 14 },
    { header: 'Notes', key: 'notes', width: 32 },
  ]
  for (const t of income) {
    const row = ws.addRow({
      date: fmtDate(t.date),
      amount: t.amount,
      category: t.category,
      method: t.paymentMethod ?? '',
      notes: t.notes,
    })
    row.getCell(2).numFmt = MONEY_FMT
  }

  // Totals row
  if (income.length > 0) {
    const dataEnd = income.length + 1
    const totRow = ws.addRow({ date: 'TOTAL', amount: null })
    totRow.getCell(2).value = { formula: `SUM(B2:B${dataEnd})` } as any
    totRow.getCell(2).numFmt = MONEY_FMT
    totRow.font = { ...BODY_FONT, bold: true }
  }

  styleSheet(ws, 5)
}

function buildExpensesSheet(wb: ExcelJS.Workbook, transactions: Transaction[]) {
  const expenses = transactions
    .filter(t => t.type === 'expense')
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  const ws = wb.addWorksheet('Expenses')
  ws.columns = [
    { header: 'Date', key: 'date', width: 12 },
    { header: 'Amount', key: 'amount', width: 12 },
    { header: 'Category', key: 'category', width: 12 },
    { header: 'Payment Method', key: 'method', width: 14 },
    { header: 'Notes', key: 'notes', width: 32 },
  ]
  for (const t of expenses) {
    const row = ws.addRow({
      date: fmtDate(t.date),
      amount: t.amount,
      category: t.category,
      method: t.paymentMethod ?? '',
      notes: t.notes,
    })
    row.getCell(2).numFmt = MONEY_FMT
  }

  if (expenses.length > 0) {
    const dataEnd = expenses.length + 1
    const totRow = ws.addRow({ date: 'TOTAL', amount: null })
    totRow.getCell(2).value = { formula: `SUM(B2:B${dataEnd})` } as any
    totRow.getCell(2).numFmt = MONEY_FMT
    totRow.font = { ...BODY_FONT, bold: true }
  }

  styleSheet(ws, 5)
}

function buildPaymentsSheet(
  wb: ExcelJS.Workbook,
  payments: BookingPayment[],
  clientMap: Map<string, string>,
  bookings: Booking[],
) {
  const bookingMap = new Map(bookings.map(b => [b.id, b]))

  const ws = wb.addWorksheet('Payments')
  ws.columns = [
    { header: 'Date', key: 'date', width: 12 },
    { header: 'Client', key: 'client', width: 16 },
    { header: 'Label', key: 'label', width: 12 },
    { header: 'Amount', key: 'amount', width: 12 },
    { header: 'Method', key: 'method', width: 14 },
    { header: 'Notes', key: 'notes', width: 28 },
  ]
  const sorted = [...payments].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  )
  for (const p of sorted) {
    const booking = bookingMap.get(p.bookingId)
    const clientAlias = booking?.clientId ? (clientMap.get(booking.clientId) ?? '') : ''
    const row = ws.addRow({
      date: fmtDate(p.date),
      client: clientAlias,
      label: p.label,
      amount: p.amount,
      method: p.method ?? '',
      notes: p.notes ?? '',
    })
    row.getCell(4).numFmt = MONEY_FMT
  }

  if (payments.length > 0) {
    const dataEnd = payments.length + 1
    const totRow = ws.addRow({ date: 'TOTAL', amount: null })
    totRow.getCell(4).value = { formula: `SUM(D2:D${dataEnd})` } as any
    totRow.getCell(4).numFmt = MONEY_FMT
    totRow.font = { ...BODY_FONT, bold: true }
  }

  styleSheet(ws, 6)
}

function buildIncidentsSheet(
  wb: ExcelJS.Workbook,
  incidents: IncidentLog[],
  clientMap: Map<string, string>,
) {
  if (incidents.length === 0) return
  const ws = wb.addWorksheet('Incidents')
  ws.columns = [
    { header: 'Date', key: 'date', width: 12 },
    { header: 'Client', key: 'client', width: 16 },
    { header: 'Severity', key: 'severity', width: 10 },
    { header: 'Description', key: 'description', width: 36 },
    { header: 'Action Taken', key: 'action', width: 30 },
  ]
  const sorted = [...incidents].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  )
  for (const i of sorted) {
    ws.addRow({
      date: fmtDate(i.date),
      client: (i.clientId && clientMap.get(i.clientId)) || '',
      severity: i.severity,
      description: i.description,
      action: i.actionTaken,
    })
  }
  styleSheet(ws, 5)
}

function buildJournalSheet(
  wb: ExcelJS.Workbook,
  entries: JournalEntry[],
  clientMap: Map<string, string>,
  bookings: Booking[],
) {
  if (entries.length === 0) return
  const bookingMap = new Map(bookings.map(b => [b.id, b]))

  const ws = wb.addWorksheet('Journal')
  ws.columns = [
    { header: 'Date', key: 'date', width: 12 },
    { header: 'Client', key: 'client', width: 16 },
    { header: 'Booking Date', key: 'bookingDate', width: 18 },
    { header: 'Tags', key: 'tags', width: 28 },
    { header: 'Actual Duration', key: 'duration', width: 14 },
    { header: 'Timing Notes', key: 'timingNotes', width: 24 },
    { header: 'Notes', key: 'notes', width: 36 },
  ]
  const sorted = [...entries].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  )
  for (const e of sorted) {
    const booking = bookingMap.get(e.bookingId)
    ws.addRow({
      date: fmtDate(e.date),
      client: (e.clientId && clientMap.get(e.clientId)) || '',
      bookingDate: booking ? fmtDateTime(booking.dateTime) : '',
      tags: e.tags?.join(', ') ?? '',
      duration: e.actualDuration ? durationLabel(e.actualDuration) : '',
      timingNotes: e.timingNotes ?? '',
      notes: e.notes,
    })
  }
  styleSheet(ws, 7)
}

function buildVenuesSheet(wb: ExcelJS.Workbook, venues: IncallVenue[]) {
  if (venues.length === 0) return
  const ws = wb.addWorksheet('Venues')
  ws.columns = [
    { header: 'Name', key: 'name', width: 18 },
    { header: 'Type', key: 'type', width: 12 },
    { header: 'City', key: 'city', width: 14 },
    { header: 'Address', key: 'address', width: 24 },
    { header: 'Access Method', key: 'access', width: 14 },
    { header: 'Cost/Hour', key: 'costHour', width: 11 },
    { header: 'Cost/Day', key: 'costDay', width: 10 },
    { header: 'Hotel Friendly', key: 'hotelFriendly', width: 13 },
    { header: 'Favorite', key: 'favorite', width: 9 },
    { header: 'Notes', key: 'notes', width: 30 },
  ]
  for (const v of venues) {
    const row = ws.addRow({
      name: v.name,
      type: v.venueType,
      city: v.city,
      address: v.address,
      access: v.accessMethod ?? '',
      costHour: v.costPerHour ?? '',
      costDay: v.costPerDay ?? '',
      hotelFriendly: v.hotelFriendly ? 'Yes' : '',
      favorite: v.isFavorite ? 'Yes' : '',
      notes: v.notes ?? '',
    })
    if (typeof v.costPerHour === 'number') row.getCell(6).numFmt = MONEY_FMT
    if (typeof v.costPerDay === 'number') row.getCell(7).numFmt = MONEY_FMT
  }
  styleSheet(ws, 10)
}

function buildSafetyContactsSheet(wb: ExcelJS.Workbook, contacts: SafetyContact[]) {
  if (contacts.length === 0) return
  const ws = wb.addWorksheet('Safety Contacts')
  ws.columns = [
    { header: 'Name', key: 'name', width: 18 },
    { header: 'Phone', key: 'phone', width: 16 },
    { header: 'Relationship', key: 'relationship', width: 16 },
    { header: 'Primary', key: 'primary', width: 9 },
    { header: 'Active', key: 'active', width: 9 },
  ]
  for (const c of contacts) {
    ws.addRow({
      name: c.name,
      phone: c.phone,
      relationship: c.relationship,
      primary: c.isPrimary ? 'Yes' : '',
      active: c.isActive ? 'Yes' : '',
    })
  }
  styleSheet(ws, 5)
}

function buildSafetyChecksSheet(
  wb: ExcelJS.Workbook,
  checks: SafetyCheck[],
  clientMap: Map<string, string>,
  bookings: Booking[],
  contactMap: Map<string, string>,
) {
  if (checks.length === 0) return
  const bookingMap = new Map(bookings.map(b => [b.id, b]))

  const ws = wb.addWorksheet('Safety Checks')
  ws.columns = [
    { header: 'Scheduled', key: 'scheduled', width: 18 },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'Checked In At', key: 'checkedIn', width: 18 },
    { header: 'Buffer (min)', key: 'buffer', width: 11 },
    { header: 'Safety Contact', key: 'contact', width: 16 },
    { header: 'Client', key: 'client', width: 16 },
    { header: 'Booking Date', key: 'bookingDate', width: 18 },
  ]
  const sorted = [...checks].sort(
    (a, b) => new Date(b.scheduledTime).getTime() - new Date(a.scheduledTime).getTime(),
  )
  for (const sc of sorted) {
    const booking = bookingMap.get(sc.bookingId)
    ws.addRow({
      scheduled: fmtDateTime(sc.scheduledTime),
      status: sc.status,
      checkedIn: fmtDateTime(sc.checkedInAt),
      buffer: sc.bufferMinutes,
      contact: (sc.safetyContactId && contactMap.get(sc.safetyContactId)) || '',
      client: booking?.clientId ? (clientMap.get(booking.clientId) ?? '') : '',
      bookingDate: booking ? fmtDateTime(booking.dateTime) : '',
    })
  }
  styleSheet(ws, 7)
}

// ── Main export ──────────────────────────────────────────────────────────

export async function exportAllToExcel(): Promise<void> {
  // Load all data
  const [clients, bookings, transactions, payments, incidents, journalEntries, incallVenues, safetyContacts, safetyChecks] = await Promise.all([
    db.clients.toArray(),
    db.bookings.toArray(),
    db.transactions.toArray(),
    db.payments.toArray(),
    db.incidents.toArray(),
    db.journalEntries.toArray(),
    db.incallVenues.toArray(),
    db.safetyContacts.toArray(),
    db.safetyChecks.toArray(),
  ])

  const clientMap = new Map(clients.map(c => [c.id, c.alias]))
  const contactMap = new Map(safetyContacts.map(c => [c.id, c.name]))

  const wb = new ExcelJS.Workbook()
  wb.creator = 'Companion'
  wb.created = new Date()

  buildClientsSheet(wb, clients)
  buildBookingsSheet(wb, bookings, clientMap)
  buildIncomeSheet(wb, transactions)
  buildExpensesSheet(wb, transactions)
  buildPaymentsSheet(wb, payments, clientMap, bookings)
  buildJournalSheet(wb, journalEntries, clientMap, bookings)
  buildVenuesSheet(wb, incallVenues)
  buildSafetyContactsSheet(wb, safetyContacts)
  buildSafetyChecksSheet(wb, safetyChecks, clientMap, bookings, contactMap)
  buildIncidentsSheet(wb, incidents, clientMap)

  // Generate and download
  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `companion-export-${new Date().toISOString().split('T')[0]}.xlsx`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
