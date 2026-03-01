import { useState, useEffect, useRef } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Trash2, Plus } from 'lucide-react'
import { db, newId } from '../db'
import { useLocalStorage } from '../hooks/useSettings'

const DEFAULT_ITEMS = ['Confirm venue', 'Check screening', 'Pack bag', 'Charge phone']

interface BookingChecklistProps {
  bookingId: string
}

export function BookingChecklist({ bookingId }: BookingChecklistProps) {
  const items = useLiveQuery(
    () => db.bookingChecklist.where('bookingId').equals(bookingId).sortBy('sortOrder'),
    [bookingId]
  )
  const [defaultItems] = useLocalStorage<string[]>('defaultChecklistItems', DEFAULT_ITEMS)
  const [newText, setNewText] = useState('')
  const populated = useRef(false)

  // Auto-populate on first render when no items exist
  useEffect(() => {
    if (items && items.length === 0 && !populated.current) {
      populated.current = true
      const toAdd = defaultItems.length > 0 ? defaultItems : DEFAULT_ITEMS
      Promise.all(
        toAdd.map((text, i) =>
          db.bookingChecklist.add({
            id: newId(),
            bookingId,
            text,
            completed: false,
            sortOrder: i,
          })
        )
      ).catch(() => {})
    }
  }, [items, bookingId, defaultItems])

  if (!items) return null

  async function toggleItem(id: string, completed: boolean) {
    await db.bookingChecklist.update(id, { completed: !completed })
  }

  async function addItem() {
    const text = newText.trim()
    if (!text) return
    const maxOrder = items!.reduce((max, it) => Math.max(max, it.sortOrder), -1)
    await db.bookingChecklist.add({
      id: newId(),
      bookingId,
      text,
      completed: false,
      sortOrder: maxOrder + 1,
    })
    setNewText('')
  }

  async function deleteItem(id: string) {
    await db.bookingChecklist.delete(id)
  }

  const completed = items.filter(i => i.completed).length

  return (
    <div className="pt-1">
      {/* Completion badge */}
      {items.length > 0 && (
        <div className="flex items-center justify-end mb-2">
          <span
            className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
            style={{
              backgroundColor: completed === items.length ? 'rgba(34,197,94,0.15)' : 'rgba(168,85,247,0.15)',
              color: completed === items.length ? '#22c55e' : '#a855f7',
            }}
          >
            {completed}/{items.length}
          </span>
        </div>
      )}

      {/* Checklist items */}
      <div className="space-y-1">
        {items.map(item => (
          <div key={item.id} className="flex items-center gap-2 py-1.5 group">
            <button
              onClick={() => toggleItem(item.id, item.completed)}
              className="w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors"
              style={{
                borderColor: item.completed ? '#22c55e' : 'var(--border)',
                backgroundColor: item.completed ? '#22c55e' : 'transparent',
              }}
            >
              {item.completed && (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2.5 6L5 8.5L9.5 3.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
            <span
              className="flex-1 text-sm"
              style={{
                color: item.completed ? 'var(--text-secondary)' : 'var(--text-primary)',
                textDecoration: item.completed ? 'line-through' : 'none',
              }}
            >
              {item.text}
            </span>
            <button
              onClick={() => deleteItem(item.id)}
              className="p-1 opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ color: 'var(--text-secondary)' }}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>

      {/* Add item */}
      <div className="flex items-center gap-2 mt-2">
        <input
          type="text"
          value={newText}
          onChange={e => setNewText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') addItem() }}
          placeholder="Add item..."
          className="flex-1 text-sm py-1.5 px-2 rounded-lg border-0 outline-none"
          style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)' }}
        />
        <button
          onClick={addItem}
          disabled={!newText.trim()}
          className="p-1.5 rounded-lg disabled:opacity-30"
          style={{ backgroundColor: 'rgba(168,85,247,0.1)' }}
        >
          <Plus size={16} className="text-purple-500" />
        </button>
      </div>
    </div>
  )
}

/** Returns the completed/total count for a booking's checklist */
export function useChecklistCount(bookingId: string) {
  return useLiveQuery(async () => {
    const items = await db.bookingChecklist.where('bookingId').equals(bookingId).toArray()
    if (items.length === 0) return null
    return { completed: items.filter(i => i.completed).length, total: items.length }
  }, [bookingId])
}
