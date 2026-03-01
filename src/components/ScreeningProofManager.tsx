import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Plus, X, FileText, ZoomIn, Trash2, ChevronLeft, ChevronRight } from 'lucide-react'
import { fmtMediumDate } from '../utils/dateFormat'
import { db, newId } from '../db'
import { showToast } from './Toast'
import type { ScreeningDoc } from '../types'

interface ScreeningProofManagerProps {
  clientId: string
  editable?: boolean
}

export function ScreeningProofManager({ clientId, editable = false }: ScreeningProofManagerProps) {
  const docs = useLiveQuery(
    () => db.screeningDocs.where('clientId').equals(clientId).reverse().sortBy('uploadedAt'),
    [clientId]
  ) ?? []

  const [previewDoc, setPreviewDoc] = useState<ScreeningDoc | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const thumbUrlsRef = useRef(new Map<string, string>())
  const [, forceRender] = useState(0)
  const fileInput = useRef<HTMLInputElement>(null)

  const docIdKey = useMemo(() => docs.map(d => d.id).join(','), [docs])

  // Generate object URLs for thumbnails
  useEffect(() => {
    const prev = thumbUrlsRef.current
    const next = new Map<string, string>()

    for (const doc of docs) {
      const existing = prev.get(doc.id)
      if (existing) {
        next.set(doc.id, existing)
      } else if (doc.mimeType.startsWith('image/')) {
        next.set(doc.id, URL.createObjectURL(doc.data))
      }
    }

    // Revoke URLs only for removed docs
    for (const [id, url] of prev) {
      if (!next.has(id)) URL.revokeObjectURL(url)
    }

    thumbUrlsRef.current = next
    forceRender(n => n + 1)

    return () => {
      // Revoke all on unmount
      for (const url of thumbUrlsRef.current.values()) URL.revokeObjectURL(url)
    }
  }, [docIdKey])

  const getThumbUrl = useCallback((id: string) => thumbUrlsRef.current.get(id), [docIdKey])

  // Generate preview URL
  useEffect(() => {
    if (previewDoc) {
      const url = URL.createObjectURL(previewDoc.data)
      setPreviewUrl(url)
      return () => URL.revokeObjectURL(url)
    } else {
      setPreviewUrl(null)
    }
  }, [previewDoc])

  async function handleUpload(files: FileList | null) {
    if (!files) return
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
        showToast('Only images and PDFs are supported')
        continue
      }
      if (file.size > 10 * 1024 * 1024) {
        showToast('File too large (10 MB max)')
        continue
      }
      try {
        const doc: ScreeningDoc = {
          id: newId(),
          clientId,
          filename: file.name,
          mimeType: file.type,
          data: file,
          uploadedAt: new Date(),
        }
        await db.screeningDocs.add(doc)
      } catch {
        showToast(`Failed to upload ${file.name}`, 'error')
        continue
      }
    }
    showToast(`${files.length} file${files.length > 1 ? 's' : ''} added`)
    if (fileInput.current) fileInput.current.value = ''
  }

  async function handleDelete(doc: ScreeningDoc) {
    const url = thumbUrlsRef.current.get(doc.id)
    if (url) { URL.revokeObjectURL(url); thumbUrlsRef.current.delete(doc.id) }
    await db.screeningDocs.delete(doc.id)
    if (previewDoc?.id === doc.id) setPreviewDoc(null)
    showToast('Document removed')
  }

  function navigatePreview(direction: -1 | 1) {
    if (!previewDoc) return
    const idx = docs.findIndex(d => d.id === previewDoc.id)
    const next = docs[idx + direction]
    if (next) setPreviewDoc(next)
  }

  // Keyboard navigation for preview (Escape to close, arrows to navigate)
  useEffect(() => {
    if (!previewDoc) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setPreviewDoc(null)
      else if (e.key === 'ArrowLeft') navigatePreview(-1)
      else if (e.key === 'ArrowRight') navigatePreview(1)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [previewDoc, docs])

  const isImage = (doc: ScreeningDoc) => doc.mimeType.startsWith('image/')

  if (docs.length === 0 && !editable) return null

  return (
    <>
      <div className={editable ? '' : 'pt-2 mt-1'} style={!editable ? { borderTop: '1px solid var(--border)' } : undefined}>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
            Screening Documents {docs.length > 0 && `(${docs.length})`}
          </p>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
          {/* Upload button */}
          {editable && (
            <button
              onClick={() => fileInput.current?.click()}
              className="shrink-0 w-20 h-20 rounded-xl flex flex-col items-center justify-center gap-1 active:opacity-70"
              style={{ border: '2px dashed var(--border)', color: 'var(--text-secondary)' }}
            >
              <Plus size={18} />
              <span className="text-[9px] font-medium">Add</span>
            </button>
          )}

          {/* Thumbnails */}
          {docs.map(doc => (
            <div key={doc.id} className="relative shrink-0 group">
              <button
                onClick={() => setPreviewDoc(doc)}
                className="w-20 h-20 rounded-xl overflow-hidden flex items-center justify-center active:opacity-70"
                style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)' }}
              >
                {isImage(doc) && getThumbUrl(doc.id) ? (
                  <img
                    src={getThumbUrl(doc.id)}
                    alt={doc.filename}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
                    <FileText size={22} />
                    <span className="text-[8px] font-medium">PDF</span>
                  </div>
                )}
                {/* Zoom overlay hint */}
                <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
                  style={{ backgroundColor: 'rgba(0,0,0,0.3)' }}>
                  <ZoomIn size={16} className="text-white" />
                </div>
              </button>

              {/* Delete badge */}
              {editable && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(doc) }}
                  aria-label={`Delete ${doc.filename}`}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center bg-red-500 text-white shadow-md active:opacity-70"
                >
                  <X size={10} />
                </button>
              )}
            </div>
          ))}

          {docs.length === 0 && !editable && (
            <p className="text-xs py-2" style={{ color: 'var(--text-secondary)' }}>
              No screening documents uploaded.
            </p>
          )}
        </div>

        {/* Hidden file input */}
        {editable && (
          <input
            ref={fileInput}
            type="file"
            accept="image/*,application/pdf"
            multiple
            className="hidden"
            onChange={e => handleUpload(e.target.files)}
          />
        )}
      </div>

      {/* Full-screen preview overlay */}
      {previewDoc && previewUrl && (
        <div className="fixed inset-0 z-[200] flex flex-col" role="dialog" aria-modal="true" aria-label="Document preview"
          style={{ backgroundColor: 'rgba(0,0,0,0.95)' }}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 safe-top">
            <button onClick={() => setPreviewDoc(null)} className="text-white/80 active:text-white" aria-label="Close preview">
              <X size={24} />
            </button>
            <div className="text-center">
              <p className="text-white text-sm font-medium truncate max-w-[200px]">{previewDoc.filename}</p>
              <p className="text-white/50 text-[10px]">
                {fmtMediumDate(new Date(previewDoc.uploadedAt))}
              </p>
            </div>
            {editable ? (
              <button
                onClick={() => handleDelete(previewDoc)}
                aria-label="Delete document"
                className="text-red-400 active:text-red-300"
              >
                <Trash2 size={20} />
              </button>
            ) : (
              <div className="w-6" />
            )}
          </div>

          {/* Content */}
          <div className="flex-1 flex items-center justify-center px-4 overflow-auto relative">
            {/* Nav arrows */}
            {docs.length > 1 && (
              <>
                {docs.findIndex(d => d.id === previewDoc.id) > 0 && (
                  <button
                    onClick={() => navigatePreview(-1)}
                    aria-label="Previous document"
                    className="absolute left-2 z-10 w-10 h-10 rounded-full flex items-center justify-center active:opacity-70"
                    style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}
                  >
                    <ChevronLeft size={20} className="text-white" />
                  </button>
                )}
                {docs.findIndex(d => d.id === previewDoc.id) < docs.length - 1 && (
                  <button
                    onClick={() => navigatePreview(1)}
                    aria-label="Next document"
                    className="absolute right-2 z-10 w-10 h-10 rounded-full flex items-center justify-center active:opacity-70"
                    style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}
                  >
                    <ChevronRight size={20} className="text-white" />
                  </button>
                )}
              </>
            )}

            {isImage(previewDoc) ? (
              <img
                src={previewUrl}
                alt={previewDoc.filename}
                className="max-w-full max-h-full object-contain rounded-lg"
                style={{ touchAction: 'pinch-zoom' }}
              />
            ) : (
              <iframe
                src={previewUrl}
                title={previewDoc.filename}
                className="w-full h-full rounded-lg"
                style={{ backgroundColor: 'white' }}
              />
            )}
          </div>

          {/* Counter */}
          {docs.length > 1 && (
            <div className="text-center py-3 safe-bottom">
              <span className="text-white/50 text-xs">
                {docs.findIndex(d => d.id === previewDoc.id) + 1} of {docs.length}
              </span>
            </div>
          )}
        </div>
      )}
    </>
  )
}
