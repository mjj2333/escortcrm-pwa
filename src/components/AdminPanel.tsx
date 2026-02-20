import { useState, useCallback } from 'react'
import { Shield, Plus, Copy, Trash2, Check, Loader, Lock, RefreshCw, Calendar } from 'lucide-react'
import type { GiftCodeRecord } from '../../netlify/functions/admin-gift-codes'

const ADMIN_ENDPOINT = '/.netlify/functions/admin-gift-codes'

interface AdminPanelProps {
  isOpen: boolean
  onClose: () => void
}

export function AdminPanel({ isOpen, onClose }: AdminPanelProps) {
  const [password, setPassword] = useState('')
  const [authed, setAuthed] = useState(false)
  const [authError, setAuthError] = useState('')
  const [authLoading, setAuthLoading] = useState(false)

  const [codes, setCodes] = useState<GiftCodeRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Generate form
  const [showGenerate, setShowGenerate] = useState(false)
  const [genLabel, setGenLabel] = useState('')
  const [genExpiry, setGenExpiry] = useState('')
  const [generating, setGenerating] = useState(false)
  const [newCode, setNewCode] = useState<{ plaintext: string; record: GiftCodeRecord } | null>(null)

  // Copy feedback
  const [copiedId, setCopiedId] = useState<string | null>(null)

  async function callAdmin(body: object) {
    const res = await fetch(ADMIN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, password }),
    })
    return res.json()
  }

  async function handleAuth() {
    if (!password.trim()) return
    setAuthLoading(true)
    setAuthError('')
    try {
      const data = await callAdmin({ action: 'list' })
      if (data.error === 'Invalid password') {
        setAuthError('Incorrect password')
      } else if (data.codes) {
        setAuthed(true)
        setCodes(data.codes)
      } else {
        setAuthError('Could not connect to admin')
      }
    } catch {
      setAuthError('Network error')
    }
    setAuthLoading(false)
  }

  const loadCodes = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await callAdmin({ action: 'list' })
      if (data.codes) setCodes(data.codes)
      else setError(data.error ?? 'Failed to load')
    } catch {
      setError('Network error')
    }
    setLoading(false)
  }, [password])

  async function handleGenerate() {
    setGenerating(true)
    setError('')
    try {
      const data = await callAdmin({
        action: 'generate',
        label: genLabel || 'Gift code',
        ...(genExpiry ? { expiresAt: new Date(genExpiry).toISOString() } : {}),
      })
      if (data.code) {
        setNewCode({ plaintext: data.code, record: data.record })
        setCodes(prev => [data.record, ...prev])
        setShowGenerate(false)
        setGenLabel('')
        setGenExpiry('')
      } else {
        setError(data.error ?? 'Failed to generate')
      }
    } catch {
      setError('Network error')
    }
    setGenerating(false)
  }

  async function handleRevoke(id: string) {
    try {
      const data = await callAdmin({ action: 'revoke', id })
      if (data.success) {
        setCodes(prev => prev.map(c => c.id === id ? { ...c, revoked: true } : c))
      } else {
        setError(data.error ?? 'Failed to revoke')
      }
    } catch {
      setError('Network error')
    }
  }

  function copyToClipboard(text: string, id: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
    })
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div
        className="relative w-full max-w-lg rounded-t-2xl sm:rounded-2xl overflow-hidden"
        style={{ backgroundColor: 'var(--bg-card)', maxHeight: '90vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2">
            <Shield size={18} style={{ color: '#a855f7' }} />
            <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Admin — Gift Codes</h2>
          </div>
          <button onClick={onClose} style={{ color: 'var(--text-secondary)' }}>✕</button>
        </div>

        <div className="overflow-y-auto p-4 space-y-4" style={{ maxHeight: 'calc(90vh - 64px)' }}>

          {/* Auth gate */}
          {!authed ? (
            <div className="space-y-3">
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Enter your admin password to manage gift codes.
              </p>
              <div className="flex items-center gap-2 rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                <Lock size={14} className="ml-3 shrink-0" style={{ color: 'var(--text-secondary)' }} />
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAuth()}
                  placeholder="Admin password..."
                  className="flex-1 px-2 py-2.5 text-sm outline-none bg-transparent"
                  style={{ color: 'var(--text-primary)' }}
                />
              </div>
              {authError && <p className="text-xs text-red-500">{authError}</p>}
              <button
                onClick={handleAuth}
                disabled={authLoading || !password.trim()}
                className="w-full py-2.5 rounded-lg text-sm font-semibold text-white bg-purple-600 disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {authLoading ? <><Loader size={14} className="animate-spin" /> Verifying...</> : 'Unlock'}
              </button>
            </div>
          ) : (
            <>
              {/* New code revealed */}
              {newCode && (
                <div className="rounded-xl p-4 space-y-2" style={{ backgroundColor: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.3)' }}>
                  <p className="text-xs font-semibold text-green-500">✓ Code generated — copy it now, it won't be shown again</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-sm font-mono font-bold" style={{ color: 'var(--text-primary)' }}>
                      {newCode.plaintext}
                    </code>
                    <button
                      onClick={() => copyToClipboard(newCode.plaintext, 'new')}
                      className="p-1.5 rounded-lg"
                      style={{ backgroundColor: 'rgba(34,197,94,0.15)' }}
                    >
                      {copiedId === 'new' ? <Check size={14} className="text-green-500" /> : <Copy size={14} className="text-green-500" />}
                    </button>
                  </div>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{newCode.record.label}</p>
                  <button onClick={() => setNewCode(null)} className="text-xs text-green-600">Dismiss</button>
                </div>
              )}

              {/* Error */}
              {error && <p className="text-xs text-red-500">{error}</p>}

              {/* Actions */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowGenerate(!showGenerate)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white bg-purple-600"
                >
                  <Plus size={14} /> New Code
                </button>
                <button
                  onClick={loadCodes}
                  disabled={loading}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium"
                  style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
                >
                  <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
                </button>
              </div>

              {/* Generate form */}
              {showGenerate && (
                <div className="rounded-xl p-4 space-y-3" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                  <p className="text-xs font-semibold uppercase" style={{ color: 'var(--text-secondary)' }}>Generate New Code</p>
                  <input
                    type="text"
                    value={genLabel}
                    onChange={e => setGenLabel(e.target.value)}
                    placeholder="Label (e.g. Beta tester — Jane)"
                    className="w-full px-3 py-2 text-sm rounded-lg outline-none"
                    style={{ backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                  />
                  <div className="flex items-center gap-2">
                    <Calendar size={14} style={{ color: 'var(--text-secondary)' }} />
                    <input
                      type="date"
                      value={genExpiry}
                      onChange={e => setGenExpiry(e.target.value)}
                      className="flex-1 px-3 py-2 text-sm rounded-lg outline-none"
                      style={{ backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                    />
                    <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Expiry (optional)</span>
                  </div>
                  <button
                    onClick={handleGenerate}
                    disabled={generating}
                    className="w-full py-2.5 rounded-lg text-sm font-semibold text-white bg-purple-600 disabled:opacity-40 flex items-center justify-center gap-2"
                  >
                    {generating ? <><Loader size={14} className="animate-spin" /> Generating...</> : 'Generate Code'}
                  </button>
                </div>
              )}

              {/* Code list */}
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase" style={{ color: 'var(--text-secondary)' }}>
                  {codes.length} code{codes.length !== 1 ? 's' : ''}
                </p>
                {codes.length === 0 && !loading && (
                  <p className="text-sm text-center py-4" style={{ color: 'var(--text-secondary)' }}>No codes yet</p>
                )}
                {codes.map(code => (
                  <div
                    key={code.id}
                    className="rounded-xl p-3"
                    style={{
                      backgroundColor: 'var(--bg-secondary)',
                      opacity: code.revoked ? 0.5 : 1,
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                          {code.label}
                        </p>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                          Created {new Date(code.createdAt).toLocaleDateString()}
                          {code.expiresAt && ` · Expires ${new Date(code.expiresAt).toLocaleDateString()}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {code.revoked ? (
                          <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>
                            Revoked
                          </span>
                        ) : (
                          <button
                            onClick={() => handleRevoke(code.id)}
                            className="p-1.5 rounded-lg"
                            style={{ backgroundColor: 'rgba(239,68,68,0.1)' }}
                            title="Revoke code"
                          >
                            <Trash2 size={13} style={{ color: '#ef4444' }} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
