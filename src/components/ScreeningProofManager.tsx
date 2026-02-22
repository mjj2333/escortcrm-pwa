import { useState, useRef, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Plus, X, FileText, Image, ZoomIn, Trash2, ChevronLeft, ChevronRight } from 'lucide-react'
import { format } from 'date-fns'
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
  const [thumbUrls, setThumbUrls] = useState<Map<string, string>>(new Map())
  const fileInput = useRef<HTMLInputElement>(null)

  // Generate object URLs for thumbnails
  useEffect(() => {
    const newUrls = new Map<string, string>()
    const toRevoke: string[] = []

    for (const doc of docs) {
      const existing = thumbUrls.get(doc.id)
      if (existing) {
        newUrls.set(doc.id, existing)
      } else if (doc.mimeType.startsWith('image/')) {
        const url = URL.createObjectURL(doc.data)
        newUrls.set(doc.id, url)
        toRevoke.push(url) // will be cleaned up on next cycle if removed
      }
    }

    // Revoke URLs for deleted docs
    thumbUrls.forEach((url, id) => {
      if (!newUrls.has(id)) URL.revokeObjectURL(url)
    })

    setThumbUrls(newUrls)

    return () => {
      // Cleanup on unmount
      newUrls.forEach(url => URL.revokeObjectURL(url))
    }
  }, [docs.map(d => d.id).join(',')])

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
      const doc: ScreeningDoc = {
        id: newId(),
        clientId,
        filename: file.name,
        mimeType: file.type,
        data: file,
        uploadedAt: new Date(),
      }
      await db.screeningDocs.add(doc)
    }
    showToast(`${files.length} file${files.length > 1 ? 's' : ''} added`)
    if (fileInput.current) fileInput.current.value = ''
  }

  async function handleDelete(doc: ScreeningDoc) {
    const url = thumbUrls.get(doc.id)
    if (url) URL.revokeObjectURL(url)
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
                {isImage(doc) && thumbUrls.has(doc.id) ? (
                  <img
                    src={thumbUrls.get(doc.id)}
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
        <div className="fixed inset-0 z-[200] flex flex-col" style={{ backgroundColor: 'rgba(0,0,0,0.95)' }}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 safe-top">
            <button onClick={() => setPreviewDoc(null)} className="text-white/80 active:text-white">
              <X size={24} />
            </button>
            <div className="text-center">
              <p className="text-white text-sm font-medium truncate max-w-[200px]">{previewDoc.filename}</p>
              <p className="text-white/50 text-[10px]">
                {format(new Date(previewDoc.uploadedAt), 'MMM d, yyyy')}
              </p>
            </div>
            {editable ? (
              <button
                onClick={() => handleDelete(previewDoc)}
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
                    className="absolute left-2 z-10 w-10 h-10 rounded-full flex items-center justify-center active:opacity-70"
                    style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}
                  >
                    <ChevronLeft size={20} className="text-white" />
                  </button>
                )}
                {docs.findIndex(d => d.id === previewDoc.id) < docs.length - 1 && (
                  <button
                    onClick={() => navigatePreview(1)}
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
