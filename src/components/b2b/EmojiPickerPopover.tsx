// ============================================================================
// EMOJI PICKER POPOVER — Bộ chọn emoji inline
// File: src/components/b2b/EmojiPickerPopover.tsx
// ============================================================================

import { useState } from 'react'
import { Popover, Tabs } from 'antd'

// ============================================
// EMOJI DATA
// ============================================

const EMOJI_CATEGORIES = [
  {
    key: 'smileys',
    label: '😊',
    title: 'Cảm xúc',
    emojis: [
      '😀', '😃', '😄', '😁', '😆', '🤣', '😂', '😊',
      '😇', '🙂', '😉', '😌', '😍', '🥰', '😘', '😗',
      '🤩', '😋', '😛', '😜', '🤪', '😝', '🤗', '🤭',
      '🤔', '🤫', '🤥', '😶', '😐', '😑', '😬', '🙄',
      '😯', '😧', '😮', '😲', '🥱', '😴', '🤤', '😪',
      '😵', '🤯', '🤠', '🥳', '🥸', '😎', '🤓', '😤',
      '😭', '😢', '😥', '😰', '😨', '😱', '😡', '🤬',
    ],
  },
  {
    key: 'gestures',
    label: '👍',
    title: 'Cử chỉ',
    emojis: [
      '👍', '👎', '👌', '🤌', '✌️', '🤞', '🤟', '🤘',
      '🤙', '👈', '👉', '👆', '👇', '☝️', '✋', '🤚',
      '🖐️', '🖖', '👋', '🤝', '🙏', '✍️', '💪', '🦾',
      '👏', '🙌', '👐', '🤲', '🫶', '❤️', '🧡', '💛',
      '💚', '💙', '💜', '🖤', '🤎', '💔', '💕', '💯',
    ],
  },
  {
    key: 'objects',
    label: '🌱',
    title: 'Đối tượng',
    emojis: [
      '🌱', '🌿', '🍃', '🪵', '🌳', '🏭', '🚛', '📦',
      '💰', '💵', '💴', '📊', '📈', '📉', '📋', '📝',
      '📄', '📑', '🗂️', '📁', '✅', '❌', '⚠️', 'ℹ️',
      '🔔', '📣', '📢', '🎯', '⭐', '🏆', '🎉', '🎊',
      '📱', '💻', '⌚', '📸', '🔑', '🔒', '🔓', '⚡',
    ],
  },
]

// ============================================
// TYPES
// ============================================

interface EmojiPickerPopoverProps {
  onSelect: (emoji: string) => void
  children: React.ReactNode
}

// ============================================
// COMPONENT
// ============================================

const EmojiPickerPopover = ({ onSelect, children }: EmojiPickerPopoverProps) => {
  const [open, setOpen] = useState(false)

  const handleSelect = (emoji: string) => {
    onSelect(emoji)
    // Don't close immediately so user can pick multiple
  }

  const content = (
    <div style={{ width: 320 }}>
      <Tabs
        size="small"
        items={EMOJI_CATEGORIES.map((cat) => ({
          key: cat.key,
          label: <span style={{ fontSize: 18 }}>{cat.label}</span>,
          children: (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(8, 1fr)',
                gap: 2,
                maxHeight: 240,
                overflowY: 'auto',
                padding: '4px 0',
              }}
            >
              {cat.emojis.map((emoji) => (
                <div
                  key={emoji}
                  onClick={() => handleSelect(emoji)}
                  style={{
                    fontSize: 22,
                    width: 36,
                    height: 36,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 8,
                    cursor: 'pointer',
                    transition: 'background-color 0.15s',
                    userSelect: 'none',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#f0f0f0'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent'
                  }}
                >
                  {emoji}
                </div>
              ))}
            </div>
          ),
        }))}
        tabBarStyle={{ marginBottom: 8 }}
      />
    </div>
  )

  return (
    <Popover
      content={content}
      trigger="click"
      open={open}
      onOpenChange={setOpen}
      placement="topLeft"
      arrow={false}
      styles={{ content: { borderRadius: 16, padding: '8px 12px' } }}
    >
      {children}
    </Popover>
  )
}

export default EmojiPickerPopover
