// ============================================================================
// CHAT ATTACHMENT MENU — Menu đính kèm phía Nhà máy (Factory side)
// File: src/components/b2b/ChatAttachmentMenu.tsx
// Gồm: Ảnh/Video, Chụp ảnh, Tài liệu, Phiếu chốt mủ
// ============================================================================

import { useRef } from 'react'
import { Popover } from 'antd'
import {
  FileImageOutlined,
  CameraOutlined,
  FileTextOutlined,
  AuditOutlined,
} from '@ant-design/icons'

// ============================================
// TYPES
// ============================================

export type AttachmentMenuAction = 'image' | 'camera' | 'document' | 'booking'

interface ChatAttachmentMenuProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (action: AttachmentMenuAction) => void
  onFilesSelected: (files: File[], type: 'image' | 'document') => void
  children: React.ReactNode
}

// ============================================
// MENU ITEMS CONFIG
// ============================================

const MENU_ITEMS: {
  key: AttachmentMenuAction
  label: string
  icon: React.ReactNode
  color: string
  bgColor: string
}[] = [
  {
    key: 'image',
    label: 'Ảnh / Video',
    icon: <FileImageOutlined style={{ fontSize: 20 }} />,
    color: '#fff',
    bgColor: '#8B5CF6',
  },
  {
    key: 'camera',
    label: 'Chụp ảnh',
    icon: <CameraOutlined style={{ fontSize: 20 }} />,
    color: '#fff',
    bgColor: '#10B981',
  },
  {
    key: 'document',
    label: 'Tài liệu',
    icon: <FileTextOutlined style={{ fontSize: 20 }} />,
    color: '#fff',
    bgColor: '#EF4444',
  },
  {
    key: 'booking',
    label: 'Phiếu chốt mủ',
    icon: <AuditOutlined style={{ fontSize: 20 }} />,
    color: '#fff',
    bgColor: '#F59E0B',
  },
]

// ============================================
// COMPONENT
// ============================================

const ChatAttachmentMenu = ({
  open,
  onOpenChange,
  onSelect,
  onFilesSelected,
  children,
}: ChatAttachmentMenuProps) => {
  const imageInputRef = useRef<HTMLInputElement>(null)
  const documentInputRef = useRef<HTMLInputElement>(null)

  const handleItemClick = (action: AttachmentMenuAction) => {
    onOpenChange(false)

    switch (action) {
      case 'image':
        imageInputRef.current?.click()
        break
      case 'camera':
        // Open camera via file input with capture
        imageInputRef.current?.setAttribute('capture', 'environment')
        imageInputRef.current?.click()
        // Remove capture attr after click so next image pick is gallery
        setTimeout(() => imageInputRef.current?.removeAttribute('capture'), 100)
        break
      case 'document':
        documentInputRef.current?.click()
        break
      case 'booking':
        onSelect('booking')
        break
    }
  }

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length > 0) {
      onFilesSelected(files, 'image')
    }
    e.target.value = ''
  }

  const handleDocumentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length > 0) {
      onFilesSelected(files, 'document')
    }
    e.target.value = ''
  }

  const menuContent = (
    <div style={{ padding: 4 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {MENU_ITEMS.map((item) => (
          <div
            key={item.key}
            onClick={() => handleItemClick(item.key)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '10px 16px',
              borderRadius: 12,
              cursor: 'pointer',
              transition: 'background-color 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#f5f5f5'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent'
            }}
          >
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                backgroundColor: item.bgColor,
                color: item.color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {item.icon}
            </div>
            <span style={{ fontSize: 14, fontWeight: 500, color: '#333' }}>
              {item.label}
            </span>
          </div>
        ))}
      </div>

      {/* Hidden file inputs */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        style={{ display: 'none' }}
        onChange={handleImageChange}
      />
      <input
        ref={documentInputRef}
        type="file"
        accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
        multiple
        style={{ display: 'none' }}
        onChange={handleDocumentChange}
      />
    </div>
  )

  return (
    <Popover
      content={menuContent}
      trigger="click"
      open={open}
      onOpenChange={onOpenChange}
      placement="topLeft"
      arrow={false}
      styles={{ content: { borderRadius: 16, padding: 4 } }}
    >
      {children}
    </Popover>
  )
}

export default ChatAttachmentMenu
