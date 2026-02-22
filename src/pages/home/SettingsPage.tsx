import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Plus, Trash2, RotateCcw, Database, MessageSquare, Users } from 'lucide-react'
import { db, newId, bookingDurationFormatted, formatCurrency, CURRENCY_KEY, DEFAULT_CURRENCY } from '../../db'
import { seedSampleData, clearSampleData } from '../../data/sampleData'
import { Modal } from '../../components/Modal'
import { SectionLabel, FieldHint, FieldToggle, fieldInputStyle } from '../../components/FormFields'
import { PinLock } from '../../components/PinLock'
import {
  initFieldEncryption,
  reWrapMasterKey,
  disableFieldEncryption,
  isFieldEncryptionReady,
} from '../../db/fieldCrypto'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { BackupRestoreModal } from '../../components/BackupRestore'
import { AdminPanel } from '../../components/AdminPanel'
import { getActivation, isActivated, getTrialDaysRemaining, isBetaTester } from '../../components/Paywall'
import { useLocalStorage } from '../../hooks/useSettings'
import {
  BACKUP_REMINDER_INTERVAL_KEY, DEFAULT_REMINDER_INTERVAL,
  daysSinceBackup, LAST_BACKUP_KEY,
} from '../../hooks/useBackupReminder'
import {
  isBiometricEnabled, registerBiometric, clearBiometric,
  reWrapBiometricPin, useBiometricAvailable,
} from '../../hooks/useBiometric'

interface SettingsPageProps {
  onClose: () => void
  onRestartTour: () => void
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

export function SettingsPage({ onClose, onRestartTour }: SettingsPageProps) {
  const serviceRates = useLiveQuery(() => db.serviceRates.orderBy('sortOrder').toArray()) ?? []
  const [depositPct, setDepositPct] = useLocalStorage('defaultDepositPercentage', 25)
  const [depositType, setDepositType] = useLocalStorage<'percent' | 'flat'>('defaultDepositType', 'percent')
  const [depositFlat, setDepositFlat] = useLocalStorage('defaultDepositFlat', 0)
  const [darkMode, setDarkMode] = useLocalStorage('darkMode', true)
  const [oledBlack, setOledBlack] = useLocalStorage('oledBlack', true)
  const [pinEnabled, setPinEnabled] = useLocalStorage('pinEnabled', false)
  const [, setPinCode] = useLocalStorage('pinCode', '')
  const [remindersEnabled, setRemindersEnabled] = useLocalStorage('remindersEnabled', false)
  const [currency, setCurrency] = useLocalStorage(CURRENCY_KEY, DEFAULT_CURRENCY)
  const [backupReminderDays, setBackupReminderDays] = useLocalStorage(BACKUP_REMINDER_INTERVAL_KEY, DEFAULT_REMINDER_INTERVAL)
  const daysSince = daysSinceBackup()

  // New rate form
  const [showAddRate, setShowAddRate] = useState(false)
  const [newRateName, setNewRateName] = useState('')
  const [newRateDuration, setNewRateDuration] = useState(1)
  const [newRateAmount, setNewRateAmount] = useState(0)

  // PIN setup
  const [showPinSetup, setShowPinSetup] = useState(false)
  const [showBackup, setShowBackup] = useState(false)
  const [biometricOn, setBiometricOn] = useState(() => isBiometricEnabled())
  const biometricAvailable = useBiometricAvailable()
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [showSampleConfirm, setShowSampleConfirm] = useState(false)
  const [showAdmin, setShowAdmin] = useState(false)
  const [versionTaps, setVersionTaps] = useState(0)

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

  function handleDarkModeChange(value: boolean) {
    setDarkMode(value)
    document.documentElement.classList.toggle('dark', value)
    // If turning dark off, also remove OLED
    if (!value) {
      document.documentElement.classList.remove('oled-black')
    } else if (oledBlack) {
      document.documentElement.classList.add('oled-black')
    }
  }

  function handleOledBlackChange(value: boolean) {
    setOledBlack(value)
    document.documentElement.classList.toggle('oled-black', value)
  }

  async function handlePinToggle(value: boolean) {
    if (value) {
      setShowPinSetup(true)
    } else {
      // Decrypt all data before disabling PIN
      await disableFieldEncryption()
      clearBiometric()
      setBiometricOn(false)
      setPinEnabled(false)
      setPinCode('')
    }
  }

  async function resetAllData() {
    await db.delete()
    // Clear all localStorage EXCEPT activation/trial keys
    const preserveKeys = ['_cstate_v2', '_cstate_rv', LAST_BACKUP_KEY, BACKUP_REMINDER_INTERVAL_KEY]
    const saved = preserveKeys.map(k => [k, localStorage.getItem(k)] as const)
    localStorage.clear()
    for (const [k, v] of saved) {
      if (v !== null) localStorage.setItem(k, v)
    }
    window.location.reload()
  }

  async function restoreSampleData() {
    // Clear existing data first, then reset flag so seed function proceeds
    await clearSampleData()
    localStorage.removeItem('companion_sample_data')
    await seedSampleData()
    setShowSampleConfirm(false)
  }

  return (
    <>
      <Modal isOpen={true} onClose={onClose} title="Settings">
        <div className="px-4 py-2" style={{ backgroundColor: 'var(--bg-secondary)' }}>
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
                      value={newRateAmount > 0 ? String(newRateAmount) : ''}
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
                    value={depositFlat > 0 ? String(depositFlat) : ''}
                    onChange={e => { const raw = e.target.value.replace(/[^0-9.]/g, ''); if (raw === '' || raw === '.') { setDepositFlat(0); return }; const val = parseFloat(raw); if (!isNaN(val)) setDepositFlat(val) }}
                    placeholder="0" className="w-28 px-3 py-2.5 rounded-lg text-sm outline-none"
                    style={fieldInputStyle} />
                </div>
                <FieldHint text={`New bookings will default to ${formatCurrency(depositFlat)} deposit.`} />
              </>
            )}
          </div>

          {/* Security */}
          <SectionLabel label="Security" />
          <FieldToggle label="PIN Lock" value={pinEnabled} onChange={handlePinToggle}
            hint={pinEnabled ? 'PIN required each time you open the app.' : 'Protect the app with a 4-digit PIN.'} />
          {pinEnabled && (
            <button type="button" onClick={() => setShowPinSetup(true)}
              className="text-sm text-purple-500 font-medium mb-3 active:opacity-70">
              Change PIN
            </button>
          )}
          {pinEnabled && biometricAvailable && (
            <FieldToggle
              label="Biometric Unlock"
              value={biometricOn}
              onChange={async (val) => {
                if (val) {
                  // We need the plaintext PIN to register — trigger PIN setup flow
                  // which calls onSetPin with plaintextPin
                  setShowPinSetup(true)
                } else {
                  clearBiometric()
                  setBiometricOn(false)
                }
              }}
              hint={biometricOn
                ? 'Face ID / Touch ID unlocks the app. PIN remains as fallback.'
                : 'Use Face ID, Touch ID, or fingerprint instead of your PIN.'}
            />
          )}

          {/* Appearance */}
          <SectionLabel label="Appearance" />
          <FieldToggle label="Dark Mode" value={darkMode} onChange={handleDarkModeChange} />
          {darkMode && (
            <FieldToggle label="True Black (OLED)" value={oledBlack} onChange={handleOledBlackChange} />
          )}

          {/* Currency */}
          <SectionLabel label="Currency" />
          <div className="mb-3">
            <label className="text-xs font-semibold block mb-1" style={{ color: 'var(--text-primary)' }}>Display Currency</label>
            <select
              value={currency}
              onChange={e => setCurrency(e.target.value)}
              className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
              style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)', fontSize: '16px' }}
            >
              {SUPPORTED_CURRENCIES.map(({ code, label }) => (
                <option key={code} value={code}>{label}</option>
              ))}
            </select>
            <p className="text-xs mt-1.5" style={{ color: 'var(--text-secondary)' }}>
              Number formatting follows your device's language settings.
            </p>
          </div>

          {/* Notifications */}
          <SectionLabel label="Notifications" />
          <FieldToggle label="Booking Reminders" value={remindersEnabled} onChange={(val) => {
            if (val && 'Notification' in window && Notification.permission === 'default') {
              Notification.requestPermission().then(p => {
                setRemindersEnabled(p === 'granted')
              })
            } else {
              setRemindersEnabled(val)
            }
          }}
            hint={remindersEnabled ? "You'll get alerts 1 hour and 15 minutes before bookings, plus birthday reminders." : 'Enable push notification reminders for upcoming bookings.'} />
          {remindersEnabled && 'Notification' in window && Notification.permission === 'denied' && (
            <p className="text-xs text-red-400 mb-3">
              Notifications are blocked by your browser. Enable them in your browser settings.
            </p>
          )}

          {/* Data */}
          <SectionLabel label="Data" />
          <button type="button" onClick={() => setShowBackup(true)}
            className="flex items-center gap-3 w-full py-2.5 mb-1 active:opacity-70">
            <Database size={16} style={{ color: '#a855f7' }} />
            <span className="text-sm font-medium text-purple-500">Backup & Restore</span>
          </button>
          {/* Last backup status */}
          <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
            {daysSince === null
              ? 'Never backed up'
              : daysSince === 0
                ? 'Last backup: today'
                : `Last backup: ${daysSince} day${daysSince !== 1 ? 's' : ''} ago`}
          </p>
          {/* Backup reminder interval */}
          <div className="mb-3">
            <label className="text-xs font-semibold block mb-1.5" style={{ color: 'var(--text-primary)' }}>
              Backup Reminder
            </label>
            <div className="flex gap-2 flex-wrap">
              {([7, 14, 30, 0] as const).map(days => (
                <button
                  key={days}
                  type="button"
                  onClick={() => setBackupReminderDays(days)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                  style={{
                    backgroundColor: backupReminderDays === days ? '#a855f7' : 'var(--bg-primary)',
                    color: backupReminderDays === days ? '#fff' : 'var(--text-secondary)',
                    border: `1px solid ${backupReminderDays === days ? '#a855f7' : 'var(--border)'}`,
                  }}
                >
                  {days === 0 ? 'Off' : days === 7 ? 'Weekly' : days === 14 ? 'Every 2 weeks' : 'Monthly'}
                </button>
              ))}
            </div>
            <p className="text-xs mt-1.5" style={{ color: 'var(--text-secondary)' }}>
              A reminder appears on the home screen when a backup is due.
            </p>
          </div>
          <button type="button" onClick={() => setShowSampleConfirm(true)}
            className="flex items-center gap-3 w-full py-2.5 mb-3 active:opacity-70">
            <Users size={16} style={{ color: '#a855f7' }} />
            <span className="text-sm font-medium text-purple-500">Load Sample Data</span>
          </button>

          {/* Help */}
          <SectionLabel label="Help" />
          <button type="button" onClick={onRestartTour}
            className="flex items-center gap-3 w-full py-2.5 mb-3 active:opacity-70">
            <RotateCcw size={16} className="text-purple-500" />
            <span className="text-sm font-medium text-purple-500">Restart Welcome & Setup Guide</span>
          </button>

          {/* Subscription */}
          <SectionLabel label="Subscription" />
          <div className="mb-3 rounded-lg px-3 py-2.5" style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)' }}>
            {isActivated() ? (
              <>
                <div className="flex items-center justify-between py-1">
                  <span className="text-sm" style={{ color: 'var(--text-primary)' }}>Plan</span>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-500">
                    {getActivation().plan === 'lifetime' ? '✨ Lifetime' : 'Pro Monthly'}
                  </span>
                </div>
                {getActivation().email && (
                  <div className="flex items-center justify-between py-1">
                    <span className="text-sm" style={{ color: 'var(--text-primary)' }}>Account</span>
                    <span className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>{getActivation().email}</span>
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center justify-between py-1">
                <span className="text-sm" style={{ color: 'var(--text-primary)' }}>Plan</span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-500">
                  Free Trial — {getTrialDaysRemaining()} day{getTrialDaysRemaining() !== 1 ? 's' : ''} left
                </span>
              </div>
            )}
          </div>

          {/* Beta Feedback */}
          {isBetaTester() && (
            <>
              <SectionLabel label="Beta Program" />
              <div className="mb-3 rounded-lg px-3 py-2.5" style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)' }}>
                {getActivation().betaExpiresAt && (
                  <div className="flex items-center justify-between py-1">
                    <span className="text-sm" style={{ color: 'var(--text-primary)' }}>Access expires</span>
                    <span className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>
                      {new Date(getActivation().betaExpiresAt!).toLocaleDateString()}
                    </span>
                  </div>
                )}
                <a href="https://grand-horse-8a068e.netlify.app/feedback.html" target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-between py-1" style={{ textDecoration: 'none' }}>
                  <div className="flex items-center gap-3">
                    <MessageSquare size={16} style={{ color: '#a855f7' }} />
                    <span className="text-sm" style={{ color: 'var(--text-primary)' }}>Share Feedback</span>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: 'rgba(168,85,247,0.15)', color: '#a855f7' }}>
                    Beta Tester ✨
                  </span>
                </a>
              </div>
            </>
          )}

          {/* About */}
          <SectionLabel label="About" />
          <div className="mb-3 rounded-lg px-3 py-2.5" style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between py-1">
              <span className="text-sm" style={{ color: 'var(--text-primary)' }}>Version</span>
              <button
                onClick={() => {
                  const next = versionTaps + 1
                  setVersionTaps(next)
                  if (next >= 7) {
                    setVersionTaps(0)
                    setShowAdmin(true)
                  }
                }}
                className="text-sm select-none"
                style={{ color: 'var(--text-secondary)', WebkitUserSelect: 'none' }}
              >
                1.0.0
              </button>
            </div>
          </div>

          {/* Danger Zone */}
          <div className="py-4">
            <button type="button" onClick={() => setShowResetConfirm(true)}
              className="w-full py-3 rounded-xl text-sm font-semibold text-red-500 border border-red-500/30">
              Reset All Data
            </button>
          </div>

          <div className="h-8" />
        </div>
      </Modal>

      {/* PIN Setup Overlay */}
      {showPinSetup && (
        <PinLock
          correctPin=""
          isSetup
          onCancel={() => setShowPinSetup(false)}
          onUnlock={() => setShowPinSetup(false)}
          onSetPin={async (hash, plaintextPin) => {
            setPinCode(hash)
            setPinEnabled(true)
            if (isFieldEncryptionReady()) {
              await reWrapMasterKey(plaintextPin)
              await reWrapBiometricPin(plaintextPin)
            } else {
              await initFieldEncryption(plaintextPin)
            }
            // If biometric toggle is queued, register the credential now
            if (biometricAvailable && biometricOn && !isBiometricEnabled()) {
              const ok = await registerBiometric(plaintextPin)
              setBiometricOn(ok)
              if (!ok) clearBiometric()
            }
          }}
        />
      )}

      <BackupRestoreModal isOpen={showBackup} onClose={() => setShowBackup(false)} />
      <AdminPanel isOpen={showAdmin} onClose={() => setShowAdmin(false)} />
      <ConfirmDialog
        isOpen={showResetConfirm}
        title="Reset All Data"
        message="This will permanently delete ALL your data. This cannot be undone."
        confirmLabel="Erase Everything"
        onConfirm={resetAllData}
        onCancel={() => setShowResetConfirm(false)}
      />
      <ConfirmDialog
        isOpen={showSampleConfirm}
        title="Load Sample Data"
        message="This will clear all existing data and load sample clients, bookings, and transactions. This cannot be undone."
        confirmLabel="Load Samples"
        onConfirm={restoreSampleData}
        onCancel={() => setShowSampleConfirm(false)}
      />
    </>
  )
}
