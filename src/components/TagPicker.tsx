import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { newId } from '../db'
import { lsKey } from '../hooks/useSettings'
import type { ClientTag } from '../types'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PRESET TAGS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const PRESET_TAGS: Omit<ClientTag, 'id'>[] = [
  { name: 'Generous', icon: '💎', color: '#22c55e' },
  { name: 'VIP', icon: '⭐', color: '#eab308' },
  { name: 'Regular', icon: '🔄', color: '#3b82f6' },
  { name: 'Boundary Issues', icon: '⚠️', color: '#ef4444' },
  { name: 'Always Late', icon: '🕐', color: '#f97316' },
  { name: 'No-Show Risk', icon: '🚫', color: '#ef4444' },
  { name: 'Easy-going', icon: '✅', color: '#22c55e' },
  { name: 'First Timer', icon: '👋', color: '#8b5cf6' },
  { name: 'Gift Giver', icon: '🎁', color: '#ec4899' },
  { name: 'Great Conversation', icon: '💬', color: '#06b6d4' },
  { name: 'Discreet', icon: '🔒', color: '#6b7280' },
  { name: 'Haggler', icon: '💰', color: '#f97316' },
  { name: 'Hygiene Issues', icon: '🧼', color: '#ef4444' },
  { name: 'No Photos', icon: '📸', color: '#6b7280' },
  { name: 'Dinner / Social', icon: '🥂', color: '#a855f7' },
  { name: 'Respectful', icon: '🤝', color: '#22c55e' },
  { name: 'High Maintenance', icon: '👑', color: '#eab308' },
  { name: 'Rough', icon: '🔴', color: '#ef4444' },
  { name: 'Nervous', icon: '😰', color: '#f97316' },
  { name: 'Fetish / Kink', icon: '🔗', color: '#8b5cf6' },
]

const TAG_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4',
  '#3b82f6', '#8b5cf6', '#a855f7', '#ec4899', '#6b7280',
]

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TAG PICKER COMPONENT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface TagPickerProps {
  selected: ClientTag[]
  onChange: (tags: ClientTag[]) => void
}

export function TagPicker({ selected, onChange }: TagPickerProps) {
  const [showPicker, setShowPicker] = useState(false)
  const [showCustom, setShowCustom] = useState(false)
  const [customName, setCustomName] = useState('')
  const [customIcon, setCustomIcon] = useState('')
  const [customColor, setCustomColor] = useState('#8b5cf6')

  function isSelected(name: string) {
    return selected.some(t => t.name === name)
  }

  function toggleTag(preset: Omit<ClientTag, 'id'>) {
    if (isSelected(preset.name)) {
      onChange(selected.filter(t => t.name !== preset.name))
    } else {
      onChange([...selected, { ...preset, id: newId() }])
    }
  }

  function addCustomTag() {
    const name = customName.trim()
    if (!name) return
    if (isSelected(name)) return
    const tag: ClientTag = {
      id: newId(),
      name,
      icon: customIcon.trim() || undefined,
      color: customColor,
    }
    onChange([...selected, tag])
    // Save to localStorage for reuse
    const saved = JSON.parse(localStorage.getItem(lsKey('customTags')) ?? '[]') as ClientTag[]
    if (!saved.some(t => t.name === name)) {
      saved.push(tag)
      localStorage.setItem(lsKey('customTags'), JSON.stringify(saved))
    }
    setCustomName('')
    setCustomIcon('')
    setShowCustom(false)
  }

  function removeTag(tagId: string) {
    onChange(selected.filter(t => t.id !== tagId))
  }

  // Merge preset + saved custom for the picker
  const allCustom = JSON.parse(localStorage.getItem(lsKey('customTags')) ?? '[]') as ClientTag[]

  return (
    <div>
      {/* Selected tags */}
      <div className="flex flex-wrap gap-1.5 mb-2">
        {selected.map(tag => (
          <span
            key={tag.id}
            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium"
            style={{ backgroundColor: `${tag.color}25`, color: tag.color }}
          >
            {tag.icon && <span>{tag.icon}</span>}
            {tag.name}
            <button onClick={() => removeTag(tag.id)} className="ml-0.5 opacity-70 hover:opacity-100">
              <X size={10} />
            </button>
          </span>
        ))}
        <button
          onClick={() => setShowPicker(!showPicker)}
          className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium"
          style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
        >
          <Plus size={10} /> Add Tag
        </button>
      </div>

      {/* Tag picker panel */}
      {showPicker && (
        <div
          className="rounded-xl p-3 mt-1"
          style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}
        >
          {/* Preset tags */}
          <p className="text-[10px] font-semibold uppercase mb-2" style={{ color: 'var(--text-secondary)' }}>
            Preset Tags
          </p>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {PRESET_TAGS.map(preset => {
              const sel = isSelected(preset.name)
              return (
                <button
                  key={preset.name}
                  onClick={() => toggleTag(preset)}
                  className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium transition-all"
                  style={{
                    backgroundColor: sel ? `${preset.color}35` : 'var(--bg-secondary)',
                    color: sel ? preset.color : 'var(--text-secondary)',
                    border: sel ? `1px solid ${preset.color}60` : '1px solid transparent',
                  }}
                >
                  {preset.icon && <span>{preset.icon}</span>}
                  {preset.name}
                </button>
              )
            })}
          </div>

          {/* Saved custom tags */}
          {allCustom.length > 0 && (
            <>
              <p className="text-[10px] font-semibold uppercase mb-2" style={{ color: 'var(--text-secondary)' }}>
                Your Custom Tags
              </p>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {allCustom.map(ct => {
                  const sel = isSelected(ct.name)
                  return (
                    <button
                      key={ct.id}
                      onClick={() => toggleTag(ct)}
                      className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium"
                      style={{
                        backgroundColor: sel ? `${ct.color}35` : 'var(--bg-secondary)',
                        color: sel ? ct.color : 'var(--text-secondary)',
                        border: sel ? `1px solid ${ct.color}60` : '1px solid transparent',
                      }}
                    >
                      {ct.icon && <span>{ct.icon}</span>}
                      {ct.name}
                    </button>
                  )
                })}
              </div>
            </>
          )}

          {/* Create custom tag */}
          {!showCustom ? (
            <button
              onClick={() => setShowCustom(true)}
              className="text-xs font-medium text-purple-500"
            >
              + Create Custom Tag
            </button>
          ) : (
            <div className="space-y-2 pt-1" style={{ borderTop: '1px solid var(--border)' }}>
              <p className="text-[10px] font-semibold uppercase pt-2" style={{ color: 'var(--text-secondary)' }}>
                New Custom Tag
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customIcon}
                  onChange={e => setCustomIcon(e.target.value)}
                  placeholder="Emoji"
                  className="w-12 text-center text-sm p-1.5 rounded-lg bg-transparent outline-none"
                  style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
                  maxLength={2}
                />
                <input
                  type="text"
                  value={customName}
                  onChange={e => setCustomName(e.target.value)}
                  placeholder="Tag name..."
                  className="flex-1 text-sm p-1.5 rounded-lg bg-transparent outline-none"
                  style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
                  maxLength={30}
                  onKeyDown={e => e.key === 'Enter' && addCustomTag()}
                />
              </div>
              <div className="flex gap-1.5">
                {TAG_COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => setCustomColor(c)}
                    className="w-6 h-6 rounded-full"
                    style={{
                      backgroundColor: c,
                      border: customColor === c ? '2px solid white' : '2px solid transparent',
                      boxShadow: customColor === c ? `0 0 0 2px ${c}` : 'none',
                    }}
                  />
                ))}
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={addCustomTag}
                  disabled={!customName.trim()}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg bg-purple-600 text-white disabled:opacity-40"
                >
                  Add
                </button>
                <button
                  onClick={() => { setShowCustom(false); setCustomName(''); setCustomIcon('') }}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Mini tag display (for booking rows)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function MiniTags({ tags, max = 2 }: { tags: ClientTag[]; max?: number }) {
  if (tags.length === 0) return null
  const shown = tags.slice(0, max)
  const extra = tags.length - max

  return (
    <div className="flex items-center gap-1 mt-0.5">
      {shown.map(tag => (
        <span
          key={tag.id}
          className="text-[9px] px-1.5 py-0.5 rounded-full font-medium leading-none"
          style={{ backgroundColor: `${tag.color}20`, color: tag.color }}
          title={tag.name}
        >
          {tag.icon ? tag.icon : tag.name}
        </span>
      ))}
      {extra > 0 && (
        <span className="text-[9px] font-medium" style={{ color: 'var(--text-secondary)' }}>
          +{extra}
        </span>
      )}
    </div>
  )
}
