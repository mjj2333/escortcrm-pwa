import { useState, useRef } from 'react'
import { Database, MessageSquare, Users, Plus, X } from 'lucide-react'
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
import { useLocalStorage, lsKey } from '../../hooks/useSettings'
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
  onShowPaywall: () => void
}

export function SettingsPage({ onClose, onShowPaywall }: SettingsPageProps) {
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
  const [showBiometricVerify, setShowBiometricVerify] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [showSampleConfirm, setShowSampleConfirm] = useState(false)
  const [showAdmin, setShowAdmin] = useState(false)
  const [versionTaps, setVersionTaps] = useState(0)
  const versionTapTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const [defaultChecklistItems, setDefaultChecklistItems] = useLocalStorage<string[]>('defaultChecklistItems', ['Confirm venue', 'Check screening', 'Pack bag', 'Charge phone'])
  const [newChecklistItem, setNewChecklistItem] = useState('')
  const [duressPin, setDuressPin] = useLocalStorage('duressPin', '')
  const [showDuressSetup, setShowDuressSetup] = useState(false)
  const [showDuressRemove, setShowDuressRemove] = useState(false)
  const [stealthEnabled, setStealthEnabled] = useLocalStorage('stealthEnabled', false)

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
      try {
        // Decrypt all data before disabling PIN — only clear state on success
        await disableFieldEncryption()
        clearBiometric()
        setBiometricOn(false)
        setPinEnabled(false)
        setPinCode('')
      } catch (err) {
        showToast('Failed to disable encryption — PIN kept enabled', 'error')
      }
    }
  }

  const [resetting, setResetting] = useState(false)

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
      const raw = localStorage.getItem(lsKey('profileWorkEmail'))
      const email = raw ? raw.replace(/^"|"$/g, '') : ''

      // 3. Try Web Share API (works great on mobile — lets user pick email app)
      let shared = false
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({
            title: 'Companion Backup',
            text: `Companion data backup — ${date}`,
            files: [file],
          })
          shared = true
        } catch (err) {
          // User cancelled share — fall through to download+mailto
          if ((err as Error).name === 'AbortError') {
            setResetting(false)
            showToast('Reset cancelled')
            return
          }
        }
      }

      // 4. Fallback: download file + open mailto
      if (!shared) {
        // Download backup file
        const blob = new Blob([json], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)

        // Open mailto with instructions
        if (email) {
          const subject = encodeURIComponent(`Companion Backup — ${date}`)
          const body = encodeURIComponent(
            `Your Companion data backup is attached.\n\nFile: ${filename}\nDate: ${date}\n\nIMPORTANT: Attach the downloaded backup file (${filename}) to this email before sending.`
          )
          window.open(`mailto:${email}?subject=${subject}&body=${body}`, '_blank')
          showToast('Backup downloaded — attach it to the email')
        } else {
          showToast('Backup downloaded (no email set in Profile)')
        }

        // Brief pause so user sees the download / mailto
        await new Promise(r => setTimeout(r, 1500))
      }

      recordBackupTimestamp()

      // 5. Wipe everything
      await db.delete()
      const preserveKeys = [
        '_cstate_v2', '_cstate_rv', lsKey(LAST_BACKUP_KEY), lsKey(BACKUP_REMINDER_INTERVAL_KEY),
        lsKey('darkMode'), lsKey('oledBlack'), lsKey('currency'), lsKey('installDismissed'),
      ]
      const saved = preserveKeys.map(k => [k, localStorage.getItem(k)] as const)
      localStorage.clear()
      for (const [k, v] of saved) {
        if (v !== null) localStorage.setItem(k, v)
      }
      window.location.reload()
    } catch (err) {
      setResetting(false)
      showToast(`Reset failed: ${(err as Error).message}`)
    }
  }

  async function restoreSampleData() {
    try {
      // Clear existing data first, then reset flag so seed function proceeds
      await clearSampleData()
      localStorage.removeItem('companion_sample_data')
      await seedSampleData()
      setShowSampleConfirm(false)
      showToast('Sample data restored')
    } catch (err) {
      showToast(`Restore failed: ${(err as Error).message}`)
    }
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
                  // We need the plaintext PIN to register — verify existing PIN
                  setShowBiometricVerify(true)
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

          {/* Duress PIN */}
          {pinEnabled && (
            <div className="mb-3">
              <div className="flex items-center justify-between py-2">
                <div>
                  <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Duress PIN</span>
                  {duressPin && (
                    <span className="ml-2 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-500/15 text-red-500">Active</span>
                  )}
                </div>
                {duressPin ? (
                  <button
                    onClick={() => setShowDuressRemove(true)}
                    className="text-xs font-medium text-red-500 active:opacity-70"
                  >
                    Remove
                  </button>
                ) : (
                  <button
                    onClick={() => setShowDuressSetup(true)}
                    className="text-xs font-medium text-purple-500 active:opacity-70"
                  >
                    Set Up
                  </button>
                )}
              </div>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                Entering this PIN on the lock screen will permanently erase all data.
              </p>
            </div>
          )}

          {/* Stealth Mode */}
          {pinEnabled && (
            <FieldToggle
              label="Stealth Mode"
              value={stealthEnabled}
              onChange={setStealthEnabled}
              hint="Triple-tap Home to disguise as a calculator. Enter your PIN + = to return."
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
            if (val && !('Notification' in window)) {
              showToast('Notifications are not supported in this browser', 'error')
              return
            }
            if (val && 'Notification' in window && Notification.permission === 'default') {
              Notification.requestPermission().then(p => {
                setRemindersEnabled(p === 'granted')
                if (p !== 'granted') showToast('Notification permission denied', 'error')
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
                  aria-pressed={backupReminderDays === days}
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

          {/* Default Checklist */}
          <SectionLabel label="Default Checklist" />
          <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
            Items auto-added to new booking checklists.
          </p>
          <div className="space-y-1 mb-2">
            {defaultChecklistItems.map((item, i) => (
              <div key={i} className="flex items-center gap-2 py-1.5 px-2 rounded-lg" style={{ backgroundColor: 'var(--bg-primary)' }}>
                <span className="flex-1 text-sm" style={{ color: 'var(--text-primary)' }}>{item}</span>
                <button
                  onClick={() => setDefaultChecklistItems(prev => prev.filter((_, idx) => idx !== i))}
                  className="p-1"
                  style={{ color: 'var(--text-secondary)' }}
                  aria-label={`Remove ${item}`}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 mb-3">
            <input
              type="text"
              value={newChecklistItem}
              onChange={e => setNewChecklistItem(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && newChecklistItem.trim()) {
                  setDefaultChecklistItems(prev => [...prev, newChecklistItem.trim()])
                  setNewChecklistItem('')
                }
              }}
              placeholder="Add default item..."
              className="flex-1 text-sm py-1.5 px-2 rounded-lg border-0 outline-none"
              style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '16px' }}
            />
            <button
              onClick={() => {
                if (newChecklistItem.trim()) {
                  setDefaultChecklistItems(prev => [...prev, newChecklistItem.trim()])
                  setNewChecklistItem('')
                }
              }}
              disabled={!newChecklistItem.trim()}
              className="p-1.5 rounded-lg disabled:opacity-30"
              style={{ backgroundColor: 'rgba(168,85,247,0.1)' }}
              aria-label="Add checklist item"
            >
              <Plus size={16} className="text-purple-500" />
            </button>
          </div>

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
                    <span className="text-xs font-mono truncate max-w-[180px]" style={{ color: 'var(--text-secondary)' }}>{getActivation().email}</span>
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
                  <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: 'rgba(168,85,247,0.15)', color: '#c084fc' }}>
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
                  clearTimeout(versionTapTimer.current)
                  const next = versionTaps + 1
                  if (next >= 7) {
                    setVersionTaps(0)
                    setShowAdmin(true)
                  } else {
                    setVersionTaps(next)
                    versionTapTimer.current = setTimeout(() => setVersionTaps(0), 3000)
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
            try {
              if (isFieldEncryptionReady()) {
                await reWrapMasterKey(plaintextPin)
                // If biometric re-wrap fails, clear biometric so stale PIN can't desync
                try { await reWrapBiometricPin(plaintextPin) } catch {
                  clearBiometric()
                  setBiometricOn(false)
                  showToast('Biometric cleared — re-enable after PIN change', 'info')
                }
              } else {
                await initFieldEncryption(plaintextPin)
              }
              setPinCode(hash)
              setPinEnabled(true)
            } catch (err) {
              showToast('Failed to update encryption — PIN not changed', 'error')
            }
          }}
        />
      )}

      {/* Biometric PIN Verify Overlay */}
      {showBiometricVerify && (
        <PinLock
          correctPin={localStorage.getItem(lsKey('pinCode'))?.replace(/^"|"$/g, '') || ''}
          isSetup={false}
          onCancel={() => setShowBiometricVerify(false)}
          onUnlock={async (plaintextPin) => {
            setShowBiometricVerify(false)
            const ok = await registerBiometric(plaintextPin)
            setBiometricOn(ok)
            if (!ok) clearBiometric()
          }}
        />
      )}

      <BackupRestoreModal isOpen={showBackup} onClose={() => setShowBackup(false)} />
      <AdminPanel isOpen={showAdmin} onClose={() => setShowAdmin(false)} />
      <ConfirmDialog
        isOpen={showResetConfirm}
        title="Reset All Data"
        message={(() => {
          const raw = localStorage.getItem(lsKey('profileWorkEmail'))
          const email = raw ? raw.replace(/^"|"$/g, '') : ''
          return email
            ? `A full backup will be created and sent to ${email} before wiping. This cannot be undone.`
            : 'A backup file will be downloaded before wiping. Set an email in Profile to have it emailed automatically. This cannot be undone.'
        })()}
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

      {/* Duress PIN Setup */}
      {showDuressSetup && (
        <PinLock
          correctPin=""
          isSetup
          onCancel={() => setShowDuressSetup(false)}
          onUnlock={() => setShowDuressSetup(false)}
          onSetPin={async (hash) => {
            const mainPinHash = localStorage.getItem(lsKey('pinCode'))?.replace(/^"|"$/g, '') || ''
            if (hash === mainPinHash) {
              showToast('Duress PIN must differ from your main PIN')
              setShowDuressSetup(false)
              return
            }
            setDuressPin(hash)
            setShowDuressSetup(false)
            showToast('Duress PIN set')
          }}
        />
      )}

      {/* Remove Duress PIN Confirm */}
      <ConfirmDialog
        isOpen={showDuressRemove}
        title="Remove Duress PIN"
        message="Remove the duress PIN? The emergency data wipe feature will be disabled."
        confirmLabel="Remove"
        onConfirm={() => { setDuressPin(''); setShowDuressRemove(false); showToast('Duress PIN removed') }}
        onCancel={() => setShowDuressRemove(false)}
      />
    </>
  )
}
