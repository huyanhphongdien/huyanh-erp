// ============================================================================
// TABBED WORKSPACE — Shell UI cho multi-tab workspace
// File: src/components/common/TabbedWorkspace.tsx
//
// Render:
//   1. Thanh tab bar phía trên (Ant Design Tabs type='editable-card')
//   2. Content area bên dưới — mount TẤT CẢ tabs đang mở, dùng display:none
//      để ẩn inactive (keep-alive pattern)
//   3. Nếu không có tab nào → render children (fallback navigate bình thường
//      cho list pages và các trang chưa convert sang tab)
//
// Cấu trúc này cho phép:
// - Detail pages mở thành tab, giữ state khi switch
// - List pages và dashboard vẫn navigate như cũ (render trong children)
// - Mobile: ẩn tab bar khi viewport < 768px (fallback navigate)
// ============================================================================

import { useEffect, type ReactNode } from 'react'
import { Tabs, Dropdown, type TabsProps, type MenuProps } from 'antd'
import { CloseOutlined } from '@ant-design/icons'
import { useNavigate, useLocation } from 'react-router-dom'
import { useTabStore, type OpenTab } from '../../stores/tabStore'
import { TabContent } from './TabContent'

interface TabbedWorkspaceProps {
  /** Fallback content khi không có tab nào mở (list pages, dashboard...) */
  children: ReactNode
}

export default function TabbedWorkspace({ children }: TabbedWorkspaceProps) {
  const tabs = useTabStore((s) => s.tabs)
  const activeKey = useTabStore((s) => s.activeKey)
  const setActive = useTabStore((s) => s.setActive)
  const closeTab = useTabStore((s) => s.closeTab)
  const closeOthers = useTabStore((s) => s.closeOthers)
  const closeAll = useTabStore((s) => s.closeAll)
  const navigate = useNavigate()
  const location = useLocation()

  // Khi active tab đổi, sync URL về browser address bar
  // để user có thể copy link / back/forward hoạt động hợp lý
  useEffect(() => {
    if (!activeKey) return
    const active = tabs.find((t) => t.key === activeKey)
    if (active && active.path && active.path !== location.pathname) {
      navigate(active.path, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey])

  // Keyboard shortcuts: Ctrl+W close tab, Ctrl+Tab next tab
  useEffect(() => {
    const onKeydown = (e: KeyboardEvent) => {
      if (!activeKey) return
      // Ctrl/Cmd + W: close active tab
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'w') {
        e.preventDefault()
        closeTab(activeKey)
      }
      // Ctrl/Cmd + Tab: next tab
      if ((e.ctrlKey || e.metaKey) && e.key === 'Tab') {
        e.preventDefault()
        const idx = tabs.findIndex((t) => t.key === activeKey)
        if (idx < 0) return
        const nextIdx = (idx + 1) % tabs.length
        setActive(tabs[nextIdx].key)
      }
    }
    window.addEventListener('keydown', onKeydown)
    return () => window.removeEventListener('keydown', onKeydown)
  }, [activeKey, tabs, closeTab, setActive])

  // Build tab items cho Ant Design Tabs
  // Content là empty — chúng ta tự render bên dưới để giữ mount state
  const tabItems: TabsProps['items'] = tabs.map((tab) => ({
    key: tab.key,
    label: <TabLabel tab={tab} onCloseOthers={closeOthers} onCloseAll={closeAll} />,
    children: null,
    closable: true,
  }))

  const handleEdit: TabsProps['onEdit'] = (key, action) => {
    if (action === 'remove' && typeof key === 'string') {
      closeTab(key)
    }
  }

  // Nếu không có tab nào → chỉ render children (fallback navigation mode)
  if (tabs.length === 0) {
    return <>{children}</>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Tab bar */}
      <Tabs
        type="editable-card"
        hideAdd
        activeKey={activeKey || undefined}
        onChange={setActive}
        onEdit={handleEdit}
        items={tabItems}
        size="small"
        style={{
          marginBottom: 0,
          padding: '4px 8px 0 8px',
          background: '#fafafa',
          borderBottom: '1px solid #e8e8e8',
        }}
      />

      {/* Content area — render TẤT CẢ tabs, display:none cho inactive */}
      {/* Thêm wrapper cho children (nếu user navigate đến list page khi có tab) */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {tabs.map((tab) => (
          <TabContent key={tab.key} tab={tab} isActive={tab.key === activeKey} />
        ))}
        {/* Fallback: khi user navigate sang URL không khớp tab nào, hiện children */}
        {!tabs.some((t) => t.path === location.pathname) && (
          <div style={{ position: 'absolute', inset: 0, overflow: 'auto' }}>
            {children}
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// TAB LABEL — Hiển thị title + dirty indicator + context menu
// ============================================================================

interface TabLabelProps {
  tab: OpenTab
  onCloseOthers: (key: string) => void
  onCloseAll: () => void
}

function TabLabel({ tab, onCloseOthers, onCloseAll }: TabLabelProps) {
  const menuItems: MenuProps['items'] = [
    {
      key: 'close-others',
      label: 'Đóng các tab khác',
      icon: <CloseOutlined />,
      onClick: () => onCloseOthers(tab.key),
    },
    {
      key: 'close-all',
      label: 'Đóng tất cả',
      icon: <CloseOutlined />,
      danger: true,
      onClick: () => onCloseAll(),
    },
  ]

  return (
    <Dropdown menu={{ items: menuItems }} trigger={['contextMenu']}>
      <span style={{ userSelect: 'none' }}>
        {tab.dirty && <span style={{ color: '#faad14', marginRight: 4 }}>●</span>}
        {tab.title}
      </span>
    </Dropdown>
  )
}
