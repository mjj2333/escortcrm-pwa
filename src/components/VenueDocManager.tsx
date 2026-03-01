import { useState, useRef, useEffect, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Plus, X, FileText, Trash2, ChevronLeft, ChevronRight } from 'lucide-react'
import { db, newId } from '../db'
import { showToast } from './Toast'
import type { VenueDoc } from '../types'

interface VenueDocManagerProps {
  venueId: string
  editable?: boolean
}

export function VenueDocManager({ venueId, editable = false }: VenueDocManagerProps) {
  const docs = useLiveQuery(
    () => db.venueDocs.where('venueId').equals(venueId).reverse().sortBy('uploadedAt'),
    [venueId]
  ) ?? []

  const [previewDoc, setPreviewDoc] = useState<VenueDoc | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const thumbUrlsRef = useRef(new Map<string, string>())
  const [, forceRender] = useState(0)
  const fileInput = useRef<HTMLInputElement>(null)

  const docIdKey = useMemo(() => docs.map(d => d.id).join(), [docs])

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
  }, [docIdKey])

  // Revoke all blob URLs on unmount only
  useEffect(() => {
    return () => { for (const url of thumbUrlsRef.current.values()) URL.revokeObjectURL(url) }
  }, [])

  useEffect(() => {
    if (previewDoc) {
      const url = URL.createObjectURL(previewDoc.data)
      setPreviewUrl(url)
      return () => URL.revokeObjectURL(url)
    }
    setPreviewUrl(null)
  }, [previewDoc])

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files) return
    let uploaded = 0
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
        showToast('Only images and PDFs are supported')
        continue
      }
      if (file.size > 10 * 1024 * 1024) {
        showToast(`${file.name} exceeds 10 MB limit`)
        continue
      }
      await db.venueDocs.add({
        id: newId(),
        venueId,
        filename: file.name,
        mimeType: file.type,
        data: file,
        uploadedAt: new Date(),
      })
      uploaded++
    }
    e.target.value = ''
    if (uploaded > 0) showToast(`${uploaded} file${uploaded > 1 ? 's' : ''} uploaded`)
  }

  async function handleDelete(docId: string) {
    await db.venueDocs.delete(docId)
    if (previewDoc?.id === docId) setPreviewDoc(null)
    showToast('Document deleted')
  }

  const previewIdx = previewDoc ? docs.findIndex(d => d.id === previewDoc.id) : -1

  if (!editable && docs.length === 0) return null

  return (
    <>
      <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {docs.map(doc => (
          <button
            key={doc.id}
            onClick={() => setPreviewDoc(doc)}
            className="relative shrink-0 w-16 h-16 rounded-lg overflow-hidden"
            style={{ border: '1px solid var(--border)' }}
          >
            {doc.mimeType.startsWith('image/') && thumbUrlsRef.current.get(doc.id) ? (
              <img src={thumbUrlsRef.current.get(doc.id)} className="w-full h-full object-cover" alt="" />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center gap-0.5" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                <FileText size={16} style={{ color: 'var(--text-secondary)' }} />
                <span className="text-[8px] px-1 truncate w-full text-center" style={{ color: 'var(--text-secondary)' }}>
                  {doc.filename.split('.').pop()?.toUpperCase()}
                </span>
              </div>
            )}
            {editable && (
              <button
                onClick={e => { e.stopPropagation(); handleDelete(doc.id) }}
                className="absolute -top-0.5 -right-0.5 w-5 h-5 rounded-full bg-red-500 flex items-center justify-center"
              >
                <X size={10} className="text-white" />
              </button>
            )}
          </button>
        ))}
        {editable && (
          <button
            onClick={() => fileInput.current?.click()}
            className="shrink-0 w-16 h-16 rounded-lg flex items-center justify-center"
            style={{ border: '2px dashed var(--border)' }}
          >
            <Plus size={20} style={{ color: 'var(--text-secondary)' }} />
          </button>
        )}
        <input
          ref={fileInput}
          type="file"
          accept="image/*,.pdf"
          multiple
          onChange={handleFiles}
          className="hidden"
        />
      </div>

      {/* Full-screen preview */}
      {previewDoc && previewUrl && (
        <div className="fixed inset-0 z-[60] flex flex-col" style={{ backgroundColor: 'rgba(0,0,0,0.95)' }}>
          <div className="flex items-center justify-between px-4 py-3 shrink-0">
            <button onClick={() => setPreviewDoc(null)} style={{ color: '#fff' }}>
              <X size={22} />
            </button>
            <span className="text-xs text-white/60">
              {previewIdx + 1} of {docs.length}
            </span>
            {editable && (
              <button onClick={() => handleDelete(previewDoc.id)}>
                <Trash2 size={18} className="text-red-400" />
              </button>
            )}
          </div>
          <div className="flex-1 flex items-center justify-center overflow-auto p-4">
            {previewDoc.mimeType.startsWith('image/') ? (
              <img src={previewUrl} className="max-w-full max-h-full object-contain" alt="" />
            ) : (
              <iframe src={previewUrl} className="w-full h-full rounded-lg bg-white" title={previewDoc.filename} />
            )}
          </div>
          {docs.length > 1 && (
            <div className="flex justify-between px-8 pb-6">
              <button
                onClick={() => setPreviewDoc(docs[(previewIdx - 1 + docs.length) % docs.length])}
                className="p-3 rounded-full bg-white/10"
              >
                <ChevronLeft size={20} className="text-white" />
              </button>
              <button
                onClick={() => setPreviewDoc(docs[(previewIdx + 1) % docs.length])}
                className="p-3 rounded-full bg-white/10"
              >
                <ChevronRight size={20} className="text-white" />
              </button>
            </div>
          )}
        </div>
      )}
    </>
  )
}
