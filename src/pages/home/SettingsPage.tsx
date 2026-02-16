import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Plus, Trash2, RotateCcw, Database } from 'lucide-react'
import { db, newId } from '../../db'
import { Modal, FormSection, FormToggle } from '../../components/Modal'
import { PinLock } from '../../components/PinLock'
import { BackupRestoreModal } from '../../components/BackupRestore'
import { getActivation, isActivated, getTrialDaysRemaining } from '../../components/Paywall'
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
  const [newRateAmount, setNewRateAmount] = useState(0)

  // PIN setup
  const [showPinSetup, setShowPinSetup] = useState(false)
  const [showBackup, setShowBackup] = useState(false)

  async function addRate() {
    if (!newRateName.trim() || newRateAmount <= 0) return
    await db.serviceRates.add({
      id: newId(),
      name: newRateName.trim(),
      duration: newRateDuration,
      rate: newRateAmount,
      isActive: true,
      sortOrder: serviceRates.length,
    })
    setNewRateName('')
    setNewRateDuration(60)
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
  }

  function handlePinToggle(value: boolean) {
    if (value) {
      setShowPinSetup(true)
    } else {
      setPinEnabled(false)
      setPinCode('')
    }
  }

  async function resetAllData() {
    if (confirm('This will permanently delete ALL your data. Are you sure?')) {
      await db.delete()
      window.location.reload()
    }
  }

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title="Settings">
        <div style={{ backgroundColor: 'var(--bg-secondary)' }}>
          {/* Service Rates */}
          <FormSection title="Service Rates" footer="These appear as quick-select buttons when creating bookings">
            {serviceRates.map(rate => (
              <div key={rate.id} className="flex items-center gap-3 px-4 py-3" style={{ borderColor: 'var(--border)' }}>
                <div className="flex-1">
                  <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    {rate.name}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {rate.duration}min — ${rate.rate}
                  </p>
                </div>
                <button
                  onClick={() => toggleRate(rate.id, !rate.isActive)}
                  className={`text-xs px-2 py-1 rounded ${
                    rate.isActive ? 'bg-green-500/15 text-green-500' : 'bg-gray-500/15 text-gray-500'
                  }`}
                >
                  {rate.isActive ? 'Active' : 'Off'}
                </button>
                <button onClick={() => deleteRate(rate.id)} className="text-red-500 p-1">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}

            {showAddRate ? (
              <div className="px-4 py-3 space-y-2">
                <input
                  type="text"
                  placeholder="Rate name (e.g. 1 Hour)"
                  value={newRateName}
                  onChange={e => setNewRateName(e.target.value)}
                  className="w-full text-sm bg-transparent outline-none py-1"
                  style={{ color: 'var(--text-primary)', borderBottom: '1px solid var(--border)' }}
                />
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="text-[10px] uppercase" style={{ color: 'var(--text-secondary)' }}>Minutes</label>
                    <input
                      type="number"
                      value={newRateDuration}
                      onChange={e => setNewRateDuration(parseInt(e.target.value) || 0)}
                      className="w-full text-sm bg-transparent outline-none py-1"
                      style={{ color: 'var(--text-primary)', borderBottom: '1px solid var(--border)' }}
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-[10px] uppercase" style={{ color: 'var(--text-secondary)' }}>Rate ($)</label>
                    <input
                      type="number"
                      value={newRateAmount || ''}
                      onChange={e => setNewRateAmount(parseInt(e.target.value) || 0)}
                      className="w-full text-sm bg-transparent outline-none py-1"
                      style={{ color: 'var(--text-primary)', borderBottom: '1px solid var(--border)' }}
                    />
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => setShowAddRate(false)}
                    className="flex-1 py-2 rounded-lg text-sm"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={addRate}
                    className="flex-1 py-2 rounded-lg text-sm bg-purple-600 text-white font-medium"
                  >
                    Add
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowAddRate(true)}
                className="flex items-center gap-2 px-4 py-3 w-full text-purple-500 text-sm font-medium"
              >
                <Plus size={16} /> Add Service Rate
              </button>
            )}
          </FormSection>

          {/* Deposit */}
          <FormSection title="Default Deposit" footer={`New bookings will auto-calculate ${depositPct}% of the base rate as deposit`}>
            <div className="flex items-center gap-3 px-4 py-3">
              <span className="text-sm" style={{ color: 'var(--text-primary)' }}>Percentage</span>
              <div className="flex-1 flex items-center justify-end gap-1">
                <input
                  type="number"
                  inputMode="numeric"
                  value={depositPct}
                  onChange={e => setDepositPct(parseInt(e.target.value) || 0)}
                  min={0}
                  max={100}
                  className="w-16 text-sm text-right bg-transparent outline-none"
                  style={{ color: 'var(--text-primary)' }}
                />
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>%</span>
              </div>
            </div>
          </FormSection>

          {/* Security */}
          <FormSection title="Security" footer={pinEnabled ? 'PIN required each time you open the app' : ''}>
            <FormToggle label="PIN Lock" value={pinEnabled} onChange={handlePinToggle} />
            {pinEnabled && (
              <button
                onClick={() => setShowPinSetup(true)}
                className="flex items-center gap-3 px-4 py-3 w-full text-purple-500 text-sm font-medium"
              >
                Change PIN
              </button>
            )}
          </FormSection>

          {/* Appearance */}
          <FormSection title="Appearance">
            <FormToggle label="Dark Mode" value={darkMode} onChange={handleDarkModeChange} />
            {darkMode && (
              <FormToggle label="True Black (OLED)" value={oledBlack} onChange={setOledBlack} />
            )}
          </FormSection>

          {/* Notifications */}
          <FormSection title="Notifications" footer={remindersEnabled ? 'You\'ll get alerts 1 hour and 15 minutes before bookings, plus birthday reminders' : ''}>
            <FormToggle label="Booking Reminders" value={remindersEnabled} onChange={(val) => {
              if (val && 'Notification' in window && Notification.permission === 'default') {
                Notification.requestPermission().then(p => {
                  setRemindersEnabled(p === 'granted')
                })
              } else {
                setRemindersEnabled(val)
              }
            }} />
            {remindersEnabled && 'Notification' in window && Notification.permission === 'denied' && (
              <p className="px-4 pb-2 text-xs text-red-400">
                Notifications are blocked by your browser. Enable them in your browser settings.
              </p>
            )}
          </FormSection>

          {/* Backup & Restore */}
          <FormSection title="Data">
            <button
              onClick={() => setShowBackup(true)}
              className="flex items-center gap-3 px-4 py-3 w-full text-left"
            >
              <Database size={16} style={{ color: '#a855f7' }} />
              <span className="text-sm font-medium text-purple-500">Backup & Restore</span>
            </button>
          </FormSection>

          {/* Help */}
          <FormSection title="Help">
            <button
              onClick={onRestartTour}
              className="flex items-center gap-3 px-4 py-3 w-full text-left"
            >
              <RotateCcw size={16} className="text-purple-500" />
              <span className="text-sm font-medium text-purple-500">Restart Feature Tour</span>
            </button>
          </FormSection>

          {/* Subscription */}
          <FormSection title="Subscription">
            {isActivated() ? (
              <>
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm" style={{ color: 'var(--text-primary)' }}>Plan</span>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-500">
                    {getActivation().plan === 'lifetime' ? '✨ Lifetime' : 'Pro Monthly'}
                  </span>
                </div>
                {getActivation().licenseKey && (
                  <div className="flex items-center justify-between px-4 py-3">
                    <span className="text-sm" style={{ color: 'var(--text-primary)' }}>License</span>
                    <span className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>
                      {getActivation().licenseKey!.slice(0, 8)}...
                    </span>
                  </div>
                )}
              </>
            ) : (
              <div className="px-4 py-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm" style={{ color: 'var(--text-primary)' }}>Plan</span>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-500">
                    Free Trial — {getTrialDaysRemaining()} day{getTrialDaysRemaining() !== 1 ? 's' : ''} left
                  </span>
                </div>
              </div>
            )}
          </FormSection>

          {/* About */}
          <FormSection title="About">
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-sm" style={{ color: 'var(--text-primary)' }}>Version</span>
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>1.0.0</span>
            </div>
          </FormSection>

          {/* Danger Zone */}
          <div className="px-4 py-4">
            <button
              onClick={resetAllData}
              className="w-full py-3 rounded-xl text-sm font-semibold text-red-500 border border-red-500/30"
            >
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
          onSetPin={(pin) => {
            setPinCode(pin)
            setPinEnabled(true)
          }}
        />
      )}

      <BackupRestoreModal isOpen={showBackup} onClose={() => setShowBackup(false)} />
    </>
  )
}
