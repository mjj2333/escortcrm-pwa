import { useState, useEffect } from 'react'
import { Sparkles, Trash2 } from 'lucide-react'
import { isSampleDataActive, clearSampleData, SAMPLE_DATA_EVENT } from '../data/sampleData'

export function SampleDataBanner() {
  const [visible, setVisible] = useState(isSampleDataActive())
  const [clearing, setClearing] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  // Re-check when sample data is seeded or cleared
  useEffect(() => {
    function onSampleDataChange() {
      setVisible(isSampleDataActive())
      setShowConfirm(false)
    }
    window.addEventListener(SAMPLE_DATA_EVENT, onSampleDataChange)
    return () => window.removeEventListener(SAMPLE_DATA_EVENT, onSampleDataChange)
  }, [])

  if (!visible) return null

  async function handleClear() {
    setClearing(true)
    try {
      await clearSampleData()
      setVisible(false)
    } catch {
      // Keep banner visible so user can retry
    }
    setClearing(false)
  }

  return (
    <>
      <div
        className="mx-4 mb-3 rounded-xl p-3 flex items-center gap-3"
        style={{
          background: 'linear-gradient(135deg, rgba(168,85,247,0.12), rgba(236,72,153,0.12))',
          border: '1px solid rgba(168,85,247,0.2)',
        }}
      >
        <Sparkles size={18} style={{ color: '#a855f7', flexShrink: 0 }} />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold" style={{ color: '#c084fc' }}>
            Exploring with sample data
          </p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            Tap around to see how everything works
          </p>
        </div>
        <button
          onClick={() => setShowConfirm(true)}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold shrink-0"
          style={{
            background: 'rgba(168,85,247,0.15)',
            color: '#c084fc',
            border: '1px solid rgba(168,85,247,0.25)',
          }}
        >
          Clear
        </button>
      </div>

      {/* Confirm dialog */}
      {showConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-6"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          onClick={() => setShowConfirm(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl p-6"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{ backgroundColor: 'rgba(168,85,247,0.15)' }}>
                <Trash2 size={20} style={{ color: '#a855f7' }} />
              </div>
              <h3 className="font-bold text-base" style={{ color: 'var(--text-primary)' }}>
                Clear sample data?
              </h3>
            </div>
            <p className="text-sm mb-5" style={{ color: 'var(--text-secondary)' }}>
              This removes all sample clients, bookings, and transactions so you can start fresh with your own data.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 py-3 rounded-xl text-sm font-semibold"
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                }}
              >
                Keep exploring
              </button>
              <button
                onClick={handleClear}
                disabled={clearing}
                className="flex-1 py-3 rounded-xl text-sm font-semibold text-white"
                style={{
                  background: 'linear-gradient(135deg, #a855f7, #ec4899)',
                  opacity: clearing ? 0.6 : 1,
                }}
              >
                {clearing ? 'Clearing...' : 'Clear & start fresh'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
