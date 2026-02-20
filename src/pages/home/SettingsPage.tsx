import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Plus, Trash2, RotateCcw, Database, MessageSquare } from 'lucide-react'
import { db, newId, bookingDurationFormatted } from '../../db'
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

interface SettingsPageProps {
  isOpen: boolean
  onClose: () => void
  onRestartTour: () => void
}

export function SettingsPage({ isOpen, onClose, onRestartTour }: SettingsPageProps) {
  const serviceRates = useLiveQuery(() => db.serviceRates.orderBy('sortOrder').toArray()) ?? []
  const [depositPct, setDepositPct] = useLocalStorage('defaultDepositPercentage', 25)
  const [darkMode, setDarkMode] = useLocalStorage('darkMode', true)
  const [oledBlack, setOledBlack] = useLocalStorage('oledBlack', true)
  const [pinEnabled, setPinEnabled] = useLocalStorage('pinEnabled', false)
  const [, setPinCode] = useLocalStorage('pinCode', '')
  const [remindersEnabled, setRemindersEnabled] = useLocalStorage('remindersEnabled', false)

  // New rate form
  const [showAddRate, setShowAddRate] = useState(false)
  const [newRateName, setNewRateName] = useState('')
  const [newRateDuration, setNewRateDuration] = useState(60)
  const [newRateUnit, setNewRateUnit] = useState<'min' | 'hr'>('min')
  const [newRateAmount, setNewRateAmount] = useState(0)

  // PIN setup
  const [showPinSetup, setShowPinSetup] = useState(false)
  const [showBackup, setShowBackup] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [showAdmin, setShowAdmin] = useState(false)
  const [versionTaps, setVersionTaps] = useState(0)

  async function addRate() {
    if (!newRateName.trim() || newRateAmount <= 0) return
    const durationInMinutes = newRateUnit === 'hr' ? Math.round(newRateDuration * 60) : newRateDuration
    await db.serviceRates.add({
      id: newId(),
      name: newRateName.trim(),
      duration: durationInMinutes,
      rate: newRateAmount,
      isActive: true,
      sortOrder: serviceRates.length,
    })
    setNewRateName('')
    setNewRateDuration(60)
    setNewRateUnit('min')
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
      setPinEnabled(false)
      setPinCode('')
    }
  }

  async function resetAllData() {
    await db.delete()
    window.location.reload()
  }

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title="Settings">
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
                    {bookingDurationFormatted(rate.duration)} — ${rate.rate}
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
                    <label className="text-[10px] uppercase block mb-1" style={{ color: 'var(--text-secondary)' }}>Duration</label>
                    <div className="flex rounded-lg overflow-hidden mb-2" style={{ border: '2px solid var(--border)' }}>
                      <button type="button"
                        onClick={() => { if (newRateUnit === 'hr') { setNewRateUnit('min'); setNewRateDuration(Math.round(newRateDuration * 60)) } }}
                        className="flex-1 py-1.5 text-xs font-bold text-center"
                        style={{ backgroundColor: newRateUnit === 'min' ? '#a855f7' : 'transparent', color: newRateUnit === 'min' ? '#fff' : 'var(--text-secondary)', WebkitTapHighlightColor: 'transparent' }}>Min</button>
                      <button type="button"
                        onClick={() => { if (newRateUnit === 'min') { setNewRateUnit('hr'); setNewRateDuration(Math.round((newRateDuration / 60) * 10) / 10) } }}
                        className="flex-1 py-1.5 text-xs font-bold text-center"
                        style={{ backgroundColor: newRateUnit === 'hr' ? '#a855f7' : 'transparent', color: newRateUnit === 'hr' ? '#fff' : 'var(--text-secondary)', WebkitTapHighlightColor: 'transparent' }}>Hr</button>
                    </div>
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
            <label className="text-xs font-semibold block mb-1" style={{ color: 'var(--text-primary)' }}>Percentage</label>
            <div className="flex items-center gap-2">
              <input type="text" inputMode="numeric"
                value={depositPct > 0 ? String(depositPct) : ''}
                onChange={e => { const raw = e.target.value.replace(/[^0-9]/g, ''); if (raw === '') { setDepositPct(0); return }; const val = parseInt(raw); if (!isNaN(val) && val <= 100) setDepositPct(val) }}
                placeholder="0" className="w-20 px-3 py-2.5 rounded-lg text-sm outline-none"
                style={fieldInputStyle} />
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>%</span>
            </div>
            <FieldHint text={`New bookings will auto-calculate ${depositPct}% of the base rate as deposit.`} />
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

          {/* Appearance */}
          <SectionLabel label="Appearance" />
          <FieldToggle label="Dark Mode" value={darkMode} onChange={handleDarkModeChange} />
          {darkMode && (
            <FieldToggle label="True Black (OLED)" value={oledBlack} onChange={handleOledBlackChange} />
          )}

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
            className="flex items-center gap-3 w-full py-2.5 mb-3 active:opacity-70">
            <Database size={16} style={{ color: '#a855f7' }} />
            <span className="text-sm font-medium text-purple-500">Backup & Restore</span>
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
          onUnlock={() => setShowPinSetup(false)}
          onSetPin={async (hash, plaintextPin) => {
            setPinCode(hash)
            setPinEnabled(true)
            if (isFieldEncryptionReady()) {
              // PIN change — just re-wrap the master key
              await reWrapMasterKey(plaintextPin)
            } else {
              // First-time setup or re-enable — generate key + encrypt data
              await initFieldEncryption(plaintextPin)
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
    </>
  )
}
