import { useState } from 'react'
import { RotateCcw, Database, MessageSquare, Users, Share2, Download } from 'lucide-react'
import { db } from '../../db'
import { seedSampleData, clearSampleData } from '../../data/sampleData'
import { Modal } from '../../components/Modal'
import { SectionLabel, FieldToggle } from '../../components/FormFields'
import { PinLock } from '../../components/PinLock'
import { showToast } from '../../components/Toast'
import {
  initFieldEncryption,
  reWrapMasterKey,
  disableFieldEncryption,
  isFieldEncryptionReady,
} from '../../db/fieldCrypto'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { BackupRestoreModal, createBackup } from '../../components/BackupRestore'
import { AdminPanel } from '../../components/AdminPanel'
import { getActivation, isActivated, isBetaTester } from '../../components/Paywall'
import { usePlanLimits, isPro } from '../../components/planLimits'
import { ProBadge } from '../../components/ProGate'
import { useLocalStorage } from '../../hooks/useSettings'
import {
  BACKUP_REMINDER_INTERVAL_KEY, DEFAULT_REMINDER_INTERVAL,
  daysSinceBackup, LAST_BACKUP_KEY, recordBackupTimestamp,
} from '../../hooks/useBackupReminder'
import {
  isBiometricEnabled, registerBiometric, clearBiometric,
  reWrapBiometricPin, useBiometricAvailable,
} from '../../hooks/useBiometric'

interface SettingsPageProps {
  onClose: () => void
  onRestartTour: () => void
  onShowPaywall: () => void
}

export function SettingsPage({ onClose, onRestartTour, onShowPaywall }: SettingsPageProps) {
  const planLimits = usePlanLimits()
  const [darkMode, setDarkMode] = useLocalStorage('darkMode', true)
  const [oledBlack, setOledBlack] = useLocalStorage('oledBlack', true)
  const [pinEnabled, setPinEnabled] = useLocalStorage('pinEnabled', false)
  const [, setPinCode] = useLocalStorage('pinCode', '')
  const [remindersEnabled, setRemindersEnabled] = useLocalStorage('remindersEnabled', false)
  const [backupReminderDays, setBackupReminderDays] = useLocalStorage(BACKUP_REMINDER_INTERVAL_KEY, DEFAULT_REMINDER_INTERVAL)
  const daysSince = daysSinceBackup()

  // PIN setup
  const [showPinSetup, setShowPinSetup] = useState(false)
  const [showBackup, setShowBackup] = useState(false)
  const [biometricOn, setBiometricOn] = useState(() => isBiometricEnabled())
  const biometricAvailable = useBiometricAvailable()
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [showSampleConfirm, setShowSampleConfirm] = useState(false)
  const [showAdmin, setShowAdmin] = useState(false)
  const [versionTaps, setVersionTaps] = useState(0)

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

  const [resetting, setResetting] = useState(false)
  const [shareFallback, setShareFallback] = useState<{
    json: string; filename: string; email: string
  } | null>(null)

  /** Try to share a File via Web Share API. Returns true on success. */
  async function tryWebShare(file: File): Promise<boolean> {
    if (!navigator.share) return false

    // Some Android browsers reject application/json but accept octet-stream
    const candidates = [file]
    if (file.type === 'application/json') {
      candidates.push(new File([file], file.name, { type: 'application/octet-stream' }))
    }

    for (const f of candidates) {
      if (!navigator.canShare?.({ files: [f] })) continue
      try {
        // NOTE: omit `text` — some Android email apps show text OR files, not both
        await navigator.share({ files: [f] })
        return true
      } catch (err) {
        if ((err as Error).name === 'AbortError') throw err // user cancelled — propagate
        console.warn('[reset] Web Share failed for MIME', f.type, err)
      }
    }
    return false
  }

  /** Download a JSON string as a file (best-effort on mobile). */
  function downloadJsonFile(json: string, filename: string) {
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  /** Wipe database and reload. */
  async function executeWipe() {
    await db.delete()
    const preserveKeys = ['_cstate_v2', '_cstate_rv', LAST_BACKUP_KEY, BACKUP_REMINDER_INTERVAL_KEY]
    const saved = preserveKeys.map(k => [k, localStorage.getItem(k)] as const)
    localStorage.clear()
    for (const [k, v] of saved) {
      if (v !== null) localStorage.setItem(k, v)
    }
    window.location.reload()
  }

  async function resetAllData() {
    setResetting(true)
    setShowResetConfirm(false)

    try {
      // 1. Create backup
      const payload = await createBackup()
      const json = JSON.stringify(payload, null, 2)
      const date = new Date().toISOString().split('T')[0]
      const filename = `companion-backup-${date}.json`
      const file = new File([json], filename, { type: 'application/json' })

      // 2. Get email from profile
      const raw = localStorage.getItem('profileWorkEmail')
      const email = raw ? raw.replace(/^"|"$/g, '') : ''

      // 3. Try Web Share API — the only mobile path that actually attaches files
      try {
        const shared = await tryWebShare(file)
        if (shared) {
          recordBackupTimestamp()
          showToast('Backup shared — wiping data...')
          await new Promise(r => setTimeout(r, 500))
          await executeWipe()
          return
        }
      } catch (err) {
        // AbortError = user cancelled the share sheet
        if ((err as Error).name === 'AbortError') {
          setResetting(false)
          showToast('Reset cancelled')
          return
        }
      }

      // 4. Web Share unavailable or failed — show manual share/download modal
      //    Do NOT auto-download + mailto (mailto can't attach files)
      setShareFallback({ json, filename, email })
      setResetting(false)

    } catch (err) {
      setResetting(false)
      showToast(`Reset failed: ${(err as Error).message}`)
    }
  }

  /** Called from share-fallback modal after user has saved the backup. */
  async function proceedWithWipeAfterManualSave() {
    setShareFallback(null)
    setResetting(true)
    try {
      recordBackupTimestamp()
      showToast('Wiping data...')
      await new Promise(r => setTimeout(r, 500))
      await executeWipe()
    } catch (err) {
      setResetting(false)
      showToast(`Reset failed: ${(err as Error).message}`)
    }
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
          <button type="button" onClick={() => isPro() ? setShowBackup(true) : onShowPaywall()}
            className="flex items-center gap-3 w-full py-2.5 mb-1 active:opacity-70">
            <Database size={16} style={{ color: '#a855f7' }} />
            <span className="text-sm font-medium text-purple-500">Backup & Restore</span>
            <ProBadge />
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
              <>
                <div className="flex items-center justify-between py-1">
                  <span className="text-sm" style={{ color: 'var(--text-primary)' }}>Plan</span>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                    Free
                  </span>
                </div>
                <div className="flex items-center justify-between py-1">
                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Clients</span>
                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{planLimits.clientCount} / {planLimits.clientLimit}</span>
                </div>
                <div className="flex items-center justify-between py-1">
                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Bookings this month</span>
                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{planLimits.bookingCount} / {planLimits.bookingLimit}</span>
                </div>
                <button onClick={onShowPaywall}
                  className="w-full mt-2 py-2 rounded-lg text-xs font-semibold text-white"
                  style={{ background: 'linear-gradient(135deg, #a855f7, #ec4899)' }}>
                  Upgrade to Pro
                </button>
              </>
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
              disabled={resetting}
              className="w-full py-3 rounded-xl text-sm font-semibold text-red-500 border border-red-500/30 disabled:opacity-50">
              {resetting ? 'Backing up & resetting...' : 'Reset All Data'}
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
        message="A full backup will be created and you'll be able to share or download it before wiping. This cannot be undone."
        confirmLabel="Backup & Erase"
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

      {/* Share Fallback — shown when Web Share API unavailable/failed */}
      {shareFallback && (
        <Modal isOpen onClose={() => { setShareFallback(null); setResetting(false) }}>
          <div className="p-5 space-y-4">
            <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
              Save Your Backup
            </h2>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Your backup is ready. Save it before erasing — choose one option below:
            </p>

            <div className="space-y-2.5">
              {/* Try Share again (some devices fail canShare but share works) */}
              <button
                type="button"
                onClick={async () => {
                  const file = new File(
                    [shareFallback.json], shareFallback.filename,
                    { type: 'application/octet-stream' },
                  )
                  if (navigator.share) {
                    try {
                      await navigator.share({ files: [file] })
                      proceedWithWipeAfterManualSave()
                      return
                    } catch { /* fall through */ }
                  }
                  showToast('Share not available — use Download instead')
                }}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold text-white"
                style={{ backgroundColor: 'var(--purple)' }}
              >
                <Share2 size={16} /> Share to Email / Drive
              </button>

              <button
                type="button"
                onClick={() => {
                  downloadJsonFile(shareFallback.json, shareFallback.filename)
                  showToast(`Saved ${shareFallback.filename}`)
                }}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold"
                style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
              >
                <Download size={16} /> Download File
              </button>
            </div>

            {shareFallback.email && (
              <p className="text-xs text-center" style={{ color: 'var(--text-tertiary)' }}>
                Email on file: {shareFallback.email}
              </p>
            )}

            <div className="pt-2 flex gap-3">
              <button
                type="button"
                onClick={() => { setShareFallback(null); setResetting(false) }}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium"
                style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={proceedWithWipeAfterManualSave}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-red-500 border border-red-500/30"
              >
                Continue Reset
              </button>
            </div>

            <p className="text-xs text-center" style={{ color: 'var(--text-tertiary)' }}>
              ⚠️ Make sure your backup is saved before continuing
            </p>
          </div>
        </Modal>
      )}
    </>
  )
}
