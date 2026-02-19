import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Plus, Trash2, RotateCcw, Database, MessageSquare } from 'lucide-react'
import { db, newId, bookingDurationFormatted } from '../../db'
import { Modal, FormSection, FormToggle } from '../../components/Modal'
import { PinLock } from '../../components/PinLock'
import { BackupRestoreModal } from '../../components/BackupRestore'
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
                    {bookingDurationFormatted(rate.duration)} — ${rate.rate}
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
                    <label className="text-[10px] uppercase block mb-1" style={{ color: 'var(--text-secondary)' }}>Duration</label>
                    <div
                      className="flex rounded-lg overflow-hidden mb-2"
                      style={{ border: '2px solid var(--border)' }}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          if (newRateUnit === 'hr') {
                            setNewRateUnit('min')
                            setNewRateDuration(Math.round(newRateDuration * 60))
                          }
                        }}
                        className="flex-1 py-1.5 text-xs font-bold text-center"
                        style={{
                          backgroundColor: newRateUnit === 'min' ? '#a855f7' : 'transparent',
                          color: newRateUnit === 'min' ? '#fff' : 'var(--text-secondary)',
                        }}
                      >
                        Min
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (newRateUnit === 'min') {
                            setNewRateUnit('hr')
                            setNewRateDuration(Math.round((newRateDuration / 60) * 10) / 10)
                          }
                        }}
                        className="flex-1 py-1.5 text-xs font-bold text-center"
                        style={{
                          backgroundColor: newRateUnit === 'hr' ? '#a855f7' : 'transparent',
                          color: newRateUnit === 'hr' ? '#fff' : 'var(--text-secondary)',
                        }}
                      >
                        Hr
                      </button>
                    </div>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="0"
                      value={newRateDuration > 0 ? String(newRateDuration) : ''}
                      onChange={e => {
                        const raw = e.target.value.replace(/[^0-9.]/g, '')
                        if (raw === '' || raw === '.') { setNewRateDuration(0); return }
                        const val = parseFloat(raw)
                        if (!isNaN(val)) setNewRateDuration(val)
                      }}
                      className="w-full text-sm bg-transparent outline-none py-1"
                      style={{ color: 'var(--text-primary)', borderBottom: '1px solid var(--border)', fontSize: '16px' }}
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-[10px] uppercase" style={{ color: 'var(--text-secondary)' }}>Rate ($)</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="0"
                      value={newRateAmount > 0 ? String(newRateAmount) : ''}
                      onChange={e => {
                        const raw = e.target.value.replace(/[^0-9.]/g, '')
                        if (raw === '' || raw === '.') { setNewRateAmount(0); return }
                        const val = parseFloat(raw)
                        if (!isNaN(val)) setNewRateAmount(val)
                      }}
                      className="w-full text-sm bg-transparent outline-none py-1"
                      style={{ color: 'var(--text-primary)', borderBottom: '1px solid var(--border)', fontSize: '16px' }}
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
                  type="text"
                  inputMode="numeric"
                  value={depositPct > 0 ? String(depositPct) : ''}
                  onChange={e => {
                    const raw = e.target.value.replace(/[^0-9]/g, '')
                    if (raw === '') { setDepositPct(0); return }
                    const val = parseInt(raw)
                    if (!isNaN(val) && val <= 100) setDepositPct(val)
                  }}
                  placeholder="0"
                  className="w-16 text-sm text-right bg-transparent outline-none"
                  style={{ color: 'var(--text-primary)', fontSize: '16px' }}
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
              <span className="text-sm font-medium text-purple-500">Restart Welcome &amp; Setup Guide</span>
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
                {getActivation().email && (
                  <div className="flex items-center justify-between px-4 py-3">
                    <span className="text-sm" style={{ color: 'var(--text-primary)' }}>Account</span>
                    <span className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>
                      {getActivation().email}
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

          {/* Beta Feedback — only visible to gift code users */}
          {isBetaTester() && (
            <FormSection title="Beta Program">
              {getActivation().betaExpiresAt && (
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm" style={{ color: 'var(--text-primary)' }}>Access expires</span>
                  <span className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>
                    {new Date(getActivation().betaExpiresAt!).toLocaleDateString()}
                  </span>
                </div>
              )}
              <a
                href="https://grand-horse-8a068e.netlify.app/feedback.html"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between px-4 py-3"
                style={{ textDecoration: 'none' }}
              >
                <div className="flex items-center gap-3">
                  <MessageSquare size={16} style={{ color: '#a855f7' }} />
                  <span className="text-sm" style={{ color: 'var(--text-primary)' }}>Share Feedback</span>
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: 'rgba(168,85,247,0.15)', color: '#a855f7' }}>
                  Beta Tester ✨
                </span>
              </a>
            </FormSection>
          )}

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
