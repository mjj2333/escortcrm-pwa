import { useState, useRef } from 'react'
import { Upload, X, FileSpreadsheet, FileText, CheckCircle, AlertCircle } from 'lucide-react'
import { db, newId } from '../db'
import type { Client, Transaction, ClientTag, ContactMethod, ScreeningStatus, RiskLevel, TransactionType, TransactionCategory, PaymentMethod } from '../types'

// Lazy-load exceljs to avoid bloating initial bundle
let ExcelJS: typeof import('exceljs') | null = null
async function getExcelJS() {
  if (!ExcelJS) ExcelJS = await import('exceljs')
  return ExcelJS
}

type DataType = 'clients' | 'bookings' | 'transactions'
type Format = 'csv' | 'xlsx'

interface ImportExportProps {
  isOpen: boolean
  onClose: () => void
  initialTab?: DataType
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// EXPORT HELPERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function fmtDate(d?: Date | null): string {
  if (!d) return ''
  const dt = d instanceof Date ? d : new Date(d)
  return isNaN(dt.getTime()) ? '' : dt.toISOString().split('T')[0]
}

function fmtDateTime(d?: Date | null): string {
  if (!d) return ''
  const dt = d instanceof Date ? d : new Date(d)
  return isNaN(dt.getTime()) ? '' : dt.toISOString()
}

function tagsToString(tags: ClientTag[]): string {
  return tags.map(t => `${t.icon ?? ''}${t.name}`).join('; ')
}

async function exportClients(format: Format) {
  const clients = await db.clients.toArray()
  const rows = clients.map(c => ({
    Alias: c.alias,
    'Real Name': c.realName ?? '',
    Phone: c.phone ?? '',
    Email: c.email ?? '',
    'Preferred Contact': c.preferredContact,
    'Screening Status': c.screeningStatus,
    'Risk Level': c.riskLevel,
    Blocked: c.isBlocked ? 'Yes' : 'No',
    Preferences: c.preferences,
    Boundaries: c.boundaries,
    Notes: c.notes,
    Tags: tagsToString(c.tags),
    'Reference Source': c.referenceSource ?? '',
    'Verification Notes': c.verificationNotes ?? '',
    'Date Added': fmtDate(c.dateAdded),
    'Last Seen': fmtDate(c.lastSeen),
    Birthday: fmtDate(c.birthday),
    'Client Since': fmtDate(c.clientSince),
    Pinned: c.isPinned ? 'Yes' : 'No',
  }))
  downloadSheet(rows, 'clients', format)
}

async function exportBookings(format: Format) {
  const bookings = await db.bookings.toArray()
  const clients = await db.clients.toArray()
  const clientMap = Object.fromEntries(clients.map(c => [c.id, c.alias]))

  const rows = bookings.map(b => ({
    Client: clientMap[b.clientId ?? ''] ?? '',
    'Date/Time': fmtDateTime(b.dateTime),
    'Duration (min)': b.duration,
    Status: b.status,
    'Location Type': b.locationType,
    'Location Address': b.locationAddress ?? '',
    'Base Rate': b.baseRate,
    Extras: b.extras,
    'Travel Fee': b.travelFee,
    Total: b.baseRate + b.extras + b.travelFee,
    'Deposit Amount': b.depositAmount,
    'Deposit Received': b.depositReceived ? 'Yes' : 'No',
    'Deposit Method': b.depositMethod ?? '',
    'Payment Method': b.paymentMethod ?? '',
    'Payment Received': b.paymentReceived ? 'Yes' : 'No',
    Notes: b.notes,
    'Created At': fmtDateTime(b.createdAt),
    'Confirmed At': fmtDateTime(b.confirmedAt),
    'Completed At': fmtDateTime(b.completedAt),
    'Cancelled At': fmtDateTime(b.cancelledAt),
    'Cancellation Reason': b.cancellationReason ?? '',
  }))
  downloadSheet(rows, 'bookings', format)
}

async function exportTransactions(format: Format) {
  const transactions = await db.transactions.toArray()
  const bookings = await db.bookings.toArray()
  const clients = await db.clients.toArray()
  const clientMap = Object.fromEntries(clients.map(c => [c.id, c.alias]))
  const bookingMap = Object.fromEntries(bookings.map(b => [b.id, b]))

  const rows = transactions.map(t => {
    const booking = t.bookingId ? bookingMap[t.bookingId] : undefined
    const clientAlias = booking?.clientId ? clientMap[booking.clientId] ?? '' : ''
    return {
      Date: fmtDate(t.date),
      Type: t.type,
      Category: t.category,
      Amount: t.amount,
      'Payment Method': t.paymentMethod ?? '',
      Notes: t.notes,
      Client: clientAlias,
      'Booking Date': booking ? fmtDateTime(booking.dateTime) : '',
    }
  })
  downloadSheet(rows, 'transactions', format)
}

async function downloadSheet(rows: Record<string, unknown>[], name: string, format: Format) {
  if (rows.length === 0) return
  const headers = Object.keys(rows[0])

  if (format === 'csv') {
    const escape = (v: unknown) => {
      const s = String(v ?? '')
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
    }
    const lines = [headers.map(escape).join(',')]
    for (const row of rows) lines.push(headers.map(h => escape(row[h])).join(','))
    downloadBlob(new Blob([lines.join('\n')], { type: 'text/csv' }), `${name}.csv`)
  } else {
    const { Workbook } = await getExcelJS()
    const wb = new Workbook()
    const ws = wb.addWorksheet(name)
    ws.columns = headers.map(h => ({
      header: h,
      key: h,
      width: Math.min(Math.max(h.length + 2, ...rows.slice(0, 50).map(r => String(r[h] ?? '').length + 2)), 40),
    }))
    // Bold header row
    ws.getRow(1).font = { bold: true }
    for (const row of rows) ws.addRow(row)
    const buf = await wb.xlsx.writeBuffer()
    downloadBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${name}.xlsx`)
  }
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// IMPORT HELPERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function parseDate(val: unknown): Date | undefined {
  if (!val) return undefined
  const d = new Date(val as string)
  return isNaN(d.getTime()) ? undefined : d
}

function parseTags(val: unknown): ClientTag[] {
  if (!val || typeof val !== 'string') return []
  return val.split(';').map(s => s.trim()).filter(Boolean).map(s => {
    // Check if first char is emoji
    const match = s.match(/^(\p{Emoji_Presentation}|\p{Extended_Pictographic})\s*/u)
    const icon = match ? match[1] : undefined
    const name = match ? s.slice(match[0].length) : s
    return { id: newId(), name, icon, color: '#8b5cf6' }
  })
}

function yesNo(val: unknown): boolean {
  if (!val) return false
  return String(val).toLowerCase().trim() === 'yes'
}

// ─── Enum validation for imported data ──────────────────────────────────────
// Ensures imported values match the allowed union types. Falls back to defaults
// for invalid values rather than storing garbage that breaks badge colors, etc.

const VALID_CONTACT_METHODS: ContactMethod[] = ['Phone', 'Text', 'Email', 'Telegram', 'Signal', 'WhatsApp', 'Other']
const VALID_SCREENING_STATUSES: ScreeningStatus[] = ['Pending', 'In Progress', 'Verified', 'Declined']
const VALID_RISK_LEVELS: RiskLevel[] = ['Unknown', 'Low Risk', 'Medium Risk', 'High Risk']
const VALID_TRANSACTION_TYPES: TransactionType[] = ['income', 'expense']
const VALID_TRANSACTION_CATEGORIES: TransactionCategory[] = ['booking', 'tip', 'gift', 'supplies', 'travel', 'advertising', 'clothing', 'health', 'rent', 'phone', 'other']
const VALID_PAYMENT_METHODS: PaymentMethod[] = ['Cash', 'e-Transfer', 'Crypto', 'Venmo', 'Cash App', 'Zelle', 'Gift Card', 'Other']

function validateEnum<T extends string>(value: string, allowed: T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback
}

async function importClients(rows: Record<string, unknown>[]): Promise<number> {
  let count = 0
  for (const row of rows) {
    const alias = String(row['Alias'] ?? row['alias'] ?? '').trim()
    if (!alias) continue

    const client: Client = {
      id: newId(),
      alias,
      realName: String(row['Real Name'] ?? row['realName'] ?? '').trim() || undefined,
      phone: String(row['Phone'] ?? row['phone'] ?? '').trim() || undefined,
      email: String(row['Email'] ?? row['email'] ?? '').trim() || undefined,
      preferredContact: validateEnum(String(row['Preferred Contact'] ?? row['preferredContact'] ?? 'Text'), VALID_CONTACT_METHODS, 'Text'),
      screeningStatus: validateEnum(String(row['Screening Status'] ?? row['screeningStatus'] ?? 'Pending'), VALID_SCREENING_STATUSES, 'Pending'),
      riskLevel: validateEnum(String(row['Risk Level'] ?? row['riskLevel'] ?? 'Unknown'), VALID_RISK_LEVELS, 'Unknown'),
      isBlocked: yesNo(row['Blocked'] ?? row['isBlocked']),
      preferences: String(row['Preferences'] ?? row['preferences'] ?? ''),
      boundaries: String(row['Boundaries'] ?? row['boundaries'] ?? ''),
      notes: String(row['Notes'] ?? row['notes'] ?? ''),
      tags: parseTags(row['Tags'] ?? row['tags']),
      referenceSource: String(row['Reference Source'] ?? row['referenceSource'] ?? '').trim() || undefined,
      verificationNotes: String(row['Verification Notes'] ?? row['verificationNotes'] ?? '').trim() || undefined,
      dateAdded: parseDate(row['Date Added'] ?? row['dateAdded']) ?? new Date(),
      lastSeen: parseDate(row['Last Seen'] ?? row['lastSeen']),
      birthday: parseDate(row['Birthday'] ?? row['birthday']),
      clientSince: parseDate(row['Client Since'] ?? row['clientSince']),
      isPinned: yesNo(row['Pinned'] ?? row['isPinned']),
      requiresSafetyCheck: false,
    }
    await db.clients.add(client)
    count++
  }
  return count
}

async function importTransactions(rows: Record<string, unknown>[]): Promise<number> {
  let count = 0
  for (const row of rows) {
    const amount = Number(row['Amount'] ?? row['amount'] ?? 0)
    if (!amount) continue

    const t: Transaction = {
      id: newId(),
      amount,
      type: validateEnum(String(row['Type'] ?? row['type'] ?? 'income'), VALID_TRANSACTION_TYPES, 'income'),
      category: validateEnum(String(row['Category'] ?? row['category'] ?? 'other'), VALID_TRANSACTION_CATEGORIES, 'other'),
      paymentMethod: (() => {
        const raw = String(row['Payment Method'] ?? row['paymentMethod'] ?? '').trim()
        return raw ? validateEnum(raw, VALID_PAYMENT_METHODS, 'Other') : undefined
      })(),
      date: parseDate(row['Date'] ?? row['date']) ?? new Date(),
      notes: String(row['Notes'] ?? row['notes'] ?? ''),
      bookingId: undefined,
    }
    await db.transactions.add(t)
    count++
  }
  return count
}

async function readFile(file: File): Promise<Record<string, unknown>[]> {
  const buf = await file.arrayBuffer()

  if (file.name.endsWith('.csv') || file.name.endsWith('.tsv')) {
    const text = new TextDecoder().decode(buf)
    return parseCSV(text)
  }

  // xlsx via exceljs
  const { Workbook } = await getExcelJS()
  const wb = new Workbook()
  await wb.xlsx.load(buf)
  const ws = wb.worksheets[0]
  if (!ws || ws.rowCount < 2) return []

  const headerRow = ws.getRow(1)
  const headers: string[] = []
  headerRow.eachCell((cell, colNum) => {
    headers[colNum] = String(cell.value ?? '')
  })

  const rows: Record<string, unknown>[] = []
  for (let i = 2; i <= ws.rowCount; i++) {
    const row = ws.getRow(i)
    const obj: Record<string, unknown> = {}
    let hasData = false
    row.eachCell((cell, colNum) => {
      if (headers[colNum]) {
        obj[headers[colNum]] = cell.value
        hasData = true
      }
    })
    if (hasData) rows.push(obj)
  }
  return rows
}

function parseCSV(text: string): Record<string, unknown>[] {
  const lines: string[][] = []
  let current: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (ch === '"') inQuotes = false
      else field += ch
    } else {
      if (ch === '"') inQuotes = true
      else if (ch === ',') { current.push(field); field = '' }
      else if (ch === '\n' || (ch === '\r' && text[i + 1] === '\n')) {
        current.push(field); field = ''
        if (current.some(c => c.trim())) lines.push(current)
        current = []
        if (ch === '\r') i++
      } else field += ch
    }
  }
  current.push(field)
  if (current.some(c => c.trim())) lines.push(current)

  if (lines.length < 2) return []
  const headers = lines[0]
  return lines.slice(1).map(row => {
    const obj: Record<string, unknown> = {}
    headers.forEach((h, i) => { obj[h.trim()] = row[i]?.trim() ?? '' })
    return obj
  })
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// COMPONENT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function ImportExportModal({ isOpen, onClose, initialTab = 'clients' }: ImportExportProps) {
  const [dataType, setDataType] = useState<DataType>(initialTab)
  const [status, setStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const [importing, setImporting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  if (!isOpen) return null

  const dataTypes: { key: DataType; label: string }[] = [
    { key: 'clients', label: 'Clients' },
    { key: 'bookings', label: 'Bookings' },
    { key: 'transactions', label: 'Finances' },
  ]

  async function handleExport(format: Format) {
    try {
      setStatus(null)
      if (dataType === 'clients') await exportClients(format)
      else if (dataType === 'bookings') await exportBookings(format)
      else await exportTransactions(format)
      setStatus({ type: 'success', msg: `Exported ${dataType} as ${format.toUpperCase()}` })
    } catch (err) {
      setStatus({ type: 'error', msg: `Export failed: ${(err as Error).message}` })
    }
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    setStatus(null)

    try {
      const rows = await readFile(file)
      if (rows.length === 0) {
        setStatus({ type: 'error', msg: 'File is empty or has no data rows' })
        setImporting(false)
        return
      }

      let count = 0
      if (dataType === 'clients') {
        count = await importClients(rows)
      } else if (dataType === 'transactions') {
        count = await importTransactions(rows)
      } else {
        setStatus({ type: 'error', msg: 'Booking import not yet supported — use client and finance import' })
        setImporting(false)
        return
      }

      setStatus({ type: 'success', msg: `Imported ${count} ${dataType} from ${file.name}` })
    } catch (err) {
      setStatus({ type: 'error', msg: `Import failed: ${(err as Error).message}` })
    }

    setImporting(false)
    // Reset file input
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        className="relative w-full max-w-lg rounded-t-2xl sm:rounded-2xl overflow-hidden"
        style={{ backgroundColor: 'var(--bg-card)', maxHeight: '85vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Import / Export</h2>
          <button onClick={onClose} className="p-1" style={{ color: 'var(--text-secondary)' }}>
            <X size={20} />
          </button>
        </div>

        <div className="p-4 overflow-y-auto" style={{ maxHeight: 'calc(85vh - 60px)' }}>
          {/* Data type selector */}
          <div
            className="flex rounded-xl overflow-hidden mb-5"
            style={{ backgroundColor: 'var(--bg-secondary)' }}
          >
            {dataTypes.map(dt => (
              <button
                key={dt.key}
                onClick={() => { setDataType(dt.key); setStatus(null) }}
                className="flex-1 py-2 text-xs font-semibold transition-colors"
                style={{
                  backgroundColor: dataType === dt.key ? '#a855f7' : 'transparent',
                  color: dataType === dt.key ? '#fff' : 'var(--text-secondary)',
                }}
              >
                {dt.label}
              </button>
            ))}
          </div>

          {/* Export section */}
          <div className="mb-5">
            <p className="text-xs font-semibold uppercase mb-3" style={{ color: 'var(--text-secondary)' }}>
              Export {dataType}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => handleExport('csv')}
                className="flex items-center justify-center gap-2 p-3 rounded-xl border transition-colors active:scale-[0.98]"
                style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              >
                <FileText size={18} style={{ color: '#22c55e' }} />
                <div className="text-left">
                  <p className="text-sm font-semibold">CSV</p>
                  <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>Universal format</p>
                </div>
              </button>
              <button
                onClick={() => handleExport('xlsx')}
                className="flex items-center justify-center gap-2 p-3 rounded-xl border transition-colors active:scale-[0.98]"
                style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              >
                <FileSpreadsheet size={18} style={{ color: '#3b82f6' }} />
                <div className="text-left">
                  <p className="text-sm font-semibold">Excel</p>
                  <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>.xlsx format</p>
                </div>
              </button>
            </div>
          </div>

          {/* Import section */}
          <div className="mb-4">
            <p className="text-xs font-semibold uppercase mb-3" style={{ color: 'var(--text-secondary)' }}>
              Import {dataType}
            </p>
            {dataType === 'bookings' ? (
              <p className="text-xs p-3 rounded-xl" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                Booking import is not available — bookings have complex relationships with clients. Import clients and finances separately.
              </p>
            ) : (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={importing}
                  className="w-full flex items-center justify-center gap-2 p-4 rounded-xl border-2 border-dashed transition-colors active:scale-[0.98]"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                >
                  <Upload size={20} />
                  <span className="text-sm font-medium">
                    {importing ? 'Importing...' : 'Choose CSV or Excel file'}
                  </span>
                </button>
                <p className="text-[10px] mt-2 text-center" style={{ color: 'var(--text-secondary)' }}>
                  First row must be column headers. Use "Export" to see the expected format.
                </p>
              </>
            )}
          </div>

          {/* Status message */}
          {status && (
            <div
              className="flex items-center gap-2 p-3 rounded-xl text-sm"
              style={{
                backgroundColor: status.type === 'success' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                color: status.type === 'success' ? '#22c55e' : '#ef4444',
              }}
            >
              {status.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
              {status.msg}
            </div>
          )}

          {/* Column reference */}
          <details className="mt-4">
            <summary className="text-xs font-medium cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
              Column reference for imports
            </summary>
            <div className="mt-2 text-[10px] space-y-1 p-3 rounded-xl" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
              {dataType === 'clients' && (
                <>
                  <p><strong style={{ color: 'var(--text-primary)' }}>Required:</strong> Alias</p>
                  <p><strong style={{ color: 'var(--text-primary)' }}>Optional:</strong> Real Name, Phone, Email, Preferred Contact (Phone/Text/Email/Telegram/Signal/WhatsApp), Screening Status (Pending/In Progress/Verified/Declined), Risk Level (Unknown/Low/Medium/High Risk), Notes, Preferences, Boundaries, Tags (semicolon-separated), Reference Source, Date Added, Birthday, Blocked (Yes/No)</p>
                </>
              )}
              {dataType === 'transactions' && (
                <>
                  <p><strong style={{ color: 'var(--text-primary)' }}>Required:</strong> Amount</p>
                  <p><strong style={{ color: 'var(--text-primary)' }}>Optional:</strong> Date, Type (income/expense), Category (booking/tip/gift/supplies/travel/advertising/clothing/health/rent/phone/other), Payment Method, Notes</p>
                </>
              )}
              {dataType === 'bookings' && (
                <p>Export-only. Bookings can be exported for record-keeping but not imported.</p>
              )}
            </div>
          </details>
        </div>

        {/* Safe area padding */}
        <div className="h-6" />
      </div>
    </div>
  )
}
