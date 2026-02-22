// src/utils/exportExcel.ts
// Exports all app data as a styled multi-sheet Excel workbook.

import ExcelJS from 'exceljs'
import { db, bookingTotal } from '../db'
import type { Client, Booking, Transaction, BookingPayment, IncidentLog } from '../types'

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
    { header: 'Real Name', key: 'realName', width: 18 },
    { header: 'Phone', key: 'phone', width: 16 },
    { header: 'Email', key: 'email', width: 24 },
    { header: 'Telegram', key: 'telegram', width: 18 },
    { header: 'Signal', key: 'signal', width: 16 },
    { header: 'WhatsApp', key: 'whatsapp', width: 16 },
    { header: 'Primary Contact', key: 'contact', width: 14 },
    { header: 'Secondary Contact', key: 'secondary', width: 14 },
    { header: 'Screening', key: 'screening', width: 13 },
    { header: 'Risk', key: 'risk', width: 13 },
    { header: 'Blocked', key: 'blocked', width: 9 },
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
      realName: c.realName ?? '',
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

// ── Main export ──────────────────────────────────────────────────────────

export async function exportAllToExcel(): Promise<void> {
  // Load all data
  const [clients, bookings, transactions, payments, incidents] = await Promise.all([
    db.clients.toArray(),
    db.bookings.toArray(),
    db.transactions.toArray(),
    db.payments.toArray(),
    db.incidents.toArray(),
  ])

  const clientMap = new Map(clients.map(c => [c.id, c.alias]))

  const wb = new ExcelJS.Workbook()
  wb.creator = 'Companion'
  wb.created = new Date()

  buildClientsSheet(wb, clients)
  buildBookingsSheet(wb, bookings, clientMap)
  buildIncomeSheet(wb, transactions)
  buildExpensesSheet(wb, transactions)
  buildPaymentsSheet(wb, payments, clientMap, bookings)
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
