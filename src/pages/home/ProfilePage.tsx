import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Plus, Trash2, Check } from 'lucide-react'
import { db, newId, bookingDurationFormatted, formatCurrency, CURRENCY_KEY, DEFAULT_CURRENCY } from '../../db'
import { Modal } from '../../components/Modal'
import { SectionLabel, FieldHint, FieldTextInput, fieldInputStyle } from '../../components/FormFields'
import { useLocalStorage } from '../../hooks/useSettings'

interface ProfilePageProps {
  isOpen: boolean
  onClose: () => void
}

export function ProfilePage({ isOpen, onClose }: ProfilePageProps) {
  // Profile fields
  const [workingName, setWorkingName] = useLocalStorage('profileWorkingName', '')
  const [workEmail, setWorkEmail] = useLocalStorage('profileWorkEmail', '')
  const [workPhone, setWorkPhone] = useLocalStorage('profileWorkPhone', '')
  const [website, setWebsite] = useLocalStorage('profileWebsite', '')
  const [tagline, setTagline] = useLocalStorage('profileTagline', '')
  const [currency, setCurrency] = useLocalStorage(CURRENCY_KEY, DEFAULT_CURRENCY)
  const [, setProfileSetupDone] = useLocalStorage('profileSetupDone', false)

  // Service rates
  const serviceRates = useLiveQuery(() => db.serviceRates.orderBy('sortOrder').toArray()) ?? []
  const [showAddRate, setShowAddRate] = useState(false)
  const [newRateName, setNewRateName] = useState('')
  const [newRateDuration, setNewRateDuration] = useState(1)
  const [newRateAmount, setNewRateAmount] = useState(0)

  // Default deposit
  const [depositType, setDepositType] = useLocalStorage<'percent' | 'flat'>('defaultDepositType', 'percent')
  const [depositPct, setDepositPct] = useLocalStorage('defaultDepositPercentage', 25)
  const [depositFlat, setDepositFlat] = useLocalStorage('defaultDepositFlat', 0)

  async function addRate() {
    if (!newRateName.trim() || newRateAmount <= 0) return
    const durationInMinutes = Math.round(newRateDuration * 60)
    await db.serviceRates.add({
      id: newId(),
      name: newRateName.trim(),
      duration: durationInMinutes,
      rate: newRateAmount,
      isActive: true,
      sortOrder: serviceRates.length,
    })
    setNewRateName('')
    setNewRateDuration(1)
    setNewRateAmount(0)
    setShowAddRate(false)
  }

  async function deleteRate(id: string) {
    await db.serviceRates.delete(id)
  }

  async function toggleRate(id: string, active: boolean) {
    await db.serviceRates.update(id, { isActive: active })
  }

  function handleClose() {
    setProfileSetupDone(true)
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Profile">
      <div className="px-4 py-2" style={{ backgroundColor: 'var(--bg-secondary)' }}>

        {/* Working Identity */}
        <SectionLabel label="Working Identity" />
        <FieldHint text="This info is for your reference only — it's never shared." />
        <div className="mt-2 space-y-0">
          <FieldTextInput label="Working Name" value={workingName} onChange={setWorkingName} placeholder="Your working name" />
          <FieldTextInput label="Email" value={workEmail} onChange={setWorkEmail} placeholder="Working email" />
          <FieldTextInput label="Phone" value={workPhone} onChange={setWorkPhone} placeholder="Working phone" />
          <FieldTextInput label="Website / Ad Link" value={website} onChange={setWebsite} placeholder="https://" />
          <FieldTextInput label="Tagline" value={tagline} onChange={setTagline} placeholder="Short bio or tagline" />
        </div>

        {/* Currency */}
        <SectionLabel label="Currency" />
        <div className="mb-3">
          <select
            value={currency}
            onChange={e => setCurrency(e.target.value)}
            className="w-full px-3 py-2.5 rounded-lg text-sm outline-none appearance-none"
            style={{
              ...fieldInputStyle,
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 12px center',
            }}
          >
            {SUPPORTED_CURRENCIES.map(c => (
              <option key={c.code} value={c.code}>{c.label}</option>
            ))}
          </select>
        </div>

        {/* Service Rates */}
        <SectionLabel label="Service Rates" />
        <FieldHint text="These appear as quick-select buttons when creating bookings." />
        <div className="mt-2 mb-3 space-y-2">
          {serviceRates.map(rate => (
            <div key={rate.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg"
              style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)' }}>
              <div className="flex-1">
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{rate.name}</p>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {bookingDurationFormatted(rate.duration)} — {formatCurrency(rate.rate)}
                </p>
              </div>
              <button type="button" onClick={() => toggleRate(rate.id, !rate.isActive)}
                className={`text-xs px-2 py-1 rounded ${rate.isActive ? 'bg-green-500/15 text-green-500' : 'bg-gray-500/15 text-gray-500'}`}>
                {rate.isActive ? 'Active' : 'Off'}
              </button>
              <button type="button" onClick={() => deleteRate(rate.id)} className="text-red-500 p-1">
                <Trash2 size={14} />
              </button>
            </div>
          ))}

          {showAddRate ? (
            <div className="rounded-xl p-3 space-y-2" style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)' }}>
              <input type="text" placeholder="Rate name (e.g. 1 Hour)"
                value={newRateName} onChange={e => setNewRateName(e.target.value)}
                className="w-full text-sm bg-transparent outline-none py-1"
                style={{ color: 'var(--text-primary)', borderBottom: '1px solid var(--border)', fontSize: '16px' }} />
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-[10px] uppercase block mb-1" style={{ color: 'var(--text-secondary)' }}>Duration (Hours)</label>
                  <input type="text" inputMode="decimal" placeholder="0"
                    value={newRateDuration > 0 ? String(newRateDuration) : ''}
                    onChange={e => { const raw = e.target.value.replace(/[^0-9.]/g, ''); if (raw === '' || raw === '.') { setNewRateDuration(0); return }; const val = parseFloat(raw); if (!isNaN(val)) setNewRateDuration(val) }}
                    className="w-full text-sm bg-transparent outline-none py-1"
                    style={{ color: 'var(--text-primary)', borderBottom: '1px solid var(--border)', fontSize: '16px' }} />
                </div>
                <div className="flex-1">
                  <label className="text-[10px] uppercase" style={{ color: 'var(--text-secondary)' }}>Rate ($)</label>
                  <input type="text" inputMode="decimal" placeholder="0"
                    value={newRateAmount > 0 ? newRateAmount.toLocaleString() : ''}
                    onChange={e => { const raw = e.target.value.replace(/[^0-9.]/g, ''); if (raw === '') { setNewRateAmount(0); return }; const v = parseFloat(raw); if (!isNaN(v)) setNewRateAmount(v) }}
                    className="w-full text-sm bg-transparent outline-none py-1 mt-3.5"
                    style={{ color: 'var(--text-primary)', borderBottom: '1px solid var(--border)', fontSize: '16px' }} />
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setShowAddRate(false)}
                  className="flex-1 py-2 rounded-lg text-sm" style={{ color: 'var(--text-secondary)' }}>Cancel</button>
                <button type="button" onClick={addRate} disabled={!newRateName.trim() || newRateAmount <= 0}
                  className="flex-1 py-2 rounded-lg text-sm font-bold text-white"
                  style={{ backgroundColor: newRateName.trim() && newRateAmount > 0 ? '#a855f7' : '#666' }}>Add Rate</button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setShowAddRate(true)}
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg text-sm font-medium active:opacity-80"
              style={{ backgroundColor: 'rgba(168,85,247,0.1)', color: '#a855f7' }}>
              <Plus size={16} /> Add Rate
            </button>
          )}
        </div>

        {/* Default Deposit */}
        <SectionLabel label="Default Deposit" />
        <div className="mb-3">
          <div className="flex rounded-lg overflow-hidden mb-3" style={{ border: '1px solid var(--border)' }}>
            <button
              onClick={() => setDepositType('percent')}
              className="flex-1 py-2 text-xs font-semibold transition-colors"
              style={{
                backgroundColor: depositType === 'percent' ? '#a855f7' : 'transparent',
                color: depositType === 'percent' ? '#fff' : 'var(--text-secondary)',
              }}
            >
              Percentage
            </button>
            <button
              onClick={() => setDepositType('flat')}
              className="flex-1 py-2 text-xs font-semibold transition-colors"
              style={{
                backgroundColor: depositType === 'flat' ? '#a855f7' : 'transparent',
                color: depositType === 'flat' ? '#fff' : 'var(--text-secondary)',
              }}
            >
              Flat Rate
            </button>
          </div>

          {depositType === 'percent' ? (
            <>
              <div className="flex items-center gap-2">
                <input type="text" inputMode="numeric"
                  value={depositPct > 0 ? String(depositPct) : ''}
                  onChange={e => { const raw = e.target.value.replace(/[^0-9]/g, ''); if (raw === '') { setDepositPct(0); return }; const val = parseInt(raw); if (!isNaN(val) && val <= 100) setDepositPct(val) }}
                  placeholder="0" className="w-20 px-3 py-2.5 rounded-lg text-sm outline-none"
                  style={fieldInputStyle} />
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>%</span>
              </div>
              <FieldHint text={`New bookings will auto-calculate ${depositPct}% of the base rate as deposit.`} />
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>$</span>
                <input type="text" inputMode="decimal"
                  value={depositFlat > 0 ? depositFlat.toLocaleString() : ''}
                  onChange={e => { const raw = e.target.value.replace(/[^0-9.]/g, ''); if (raw === '' || raw === '.') { setDepositFlat(0); return }; const val = parseFloat(raw); if (!isNaN(val)) setDepositFlat(val) }}
                  placeholder="0" className="w-28 px-3 py-2.5 rounded-lg text-sm outline-none"
                  style={fieldInputStyle} />
              </div>
              <FieldHint text={`New bookings will default to ${formatCurrency(depositFlat)} deposit.`} />
            </>
          )}
        </div>

        <div className="h-8" />
      </div>
    </Modal>
  )
}

const SUPPORTED_CURRENCIES: { code: string; label: string }[] = [
  { code: 'USD', label: 'USD — US Dollar ($)' },
  { code: 'CAD', label: 'CAD — Canadian Dollar ($)' },
  { code: 'AUD', label: 'AUD — Australian Dollar ($)' },
  { code: 'NZD', label: 'NZD — New Zealand Dollar ($)' },
  { code: 'GBP', label: 'GBP — British Pound (£)' },
  { code: 'EUR', label: 'EUR — Euro (€)' },
  { code: 'CHF', label: 'CHF — Swiss Franc (Fr)' },
  { code: 'SEK', label: 'SEK — Swedish Krona (kr)' },
  { code: 'NOK', label: 'NOK — Norwegian Krone (kr)' },
  { code: 'DKK', label: 'DKK — Danish Krone (kr)' },
  { code: 'JPY', label: 'JPY — Japanese Yen (¥)' },
  { code: 'HKD', label: 'HKD — Hong Kong Dollar ($)' },
  { code: 'SGD', label: 'SGD — Singapore Dollar ($)' },
  { code: 'THB', label: 'THB — Thai Baht (฿)' },
  { code: 'INR', label: 'INR — Indian Rupee (₹)' },
  { code: 'AED', label: 'AED — UAE Dirham (د.إ)' },
  { code: 'ZAR', label: 'ZAR — South African Rand (R)' },
  { code: 'BRL', label: 'BRL — Brazilian Real (R$)' },
  { code: 'MXN', label: 'MXN — Mexican Peso ($)' },
  { code: 'COP', label: 'COP — Colombian Peso ($)' },
  { code: 'ARS', label: 'ARS — Argentine Peso ($)' },
  { code: 'CLP', label: 'CLP — Chilean Peso ($)' },
]
