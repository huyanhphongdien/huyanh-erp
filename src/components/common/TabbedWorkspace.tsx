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

  // ★ Quy tắc hiển thị:
  //   - Nếu URL hiện tại khớp với path của 1 tab → hiện tab đó, ẩn children
  //   - Nếu URL không khớp tab nào (user navigate sidebar sang trang khác) →
  //     ẩn toàn bộ tab content, chỉ hiện children (list/dashboard theo URL).
  //     Tabs vẫn giữ trong store — click vào tab bar sẽ focus lại.
  const matchingTab = tabs.find((t) => t.path === location.pathname)
  const effectiveActiveKey = matchingTab ? matchingTab.key : null

  // Keyboard shortcuts: Ctrl+W close tab, Ctrl+Tab next tab
  useEffect(() => {
    const onKeydown = (e: KeyboardEvent) => {
      if (!effectiveActiveKey) return
      // Ctrl/Cmd + W: close active tab
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'w') {
        e.preventDefault()
        closeTab(effectiveActiveKey)
      }
      // Ctrl/Cmd + Tab: next tab — click-through nên cũng navigate
      if ((e.ctrlKey || e.metaKey) && e.key === 'Tab') {
        e.preventDefault()
        const idx = tabs.findIndex((t) => t.key === effectiveActiveKey)
        if (idx < 0) return
        const nextIdx = (idx + 1) % tabs.length
        const nextTab = tabs[nextIdx]
        setActive(nextTab.key)
        navigate(nextTab.path)
      }
    }
    window.addEventListener('keydown', onKeydown)
    return () => window.removeEventListener('keydown', onKeydown)
  }, [effectiveActiveKey, tabs, closeTab, setActive, navigate])

  // Build tab items cho Ant Design Tabs — content để null, tự render bên dưới
  const tabItems: TabsProps['items'] = tabs.map((tab) => ({
    key: tab.key,
    label: <TabLabel tab={tab} onCloseOthers={closeOthers} onCloseAll={closeAll} />,
    children: null,
    closable: true,
  }))

  // Khi user click vào tab bar → cần navigate đến path của tab đó
  // (không chỉ setActive trong store — vì render logic dựa vào URL match)
  const handleChange = (key: string) => {
    const tab = tabs.find((t) => t.key === key)
    if (!tab) return
    setActive(key)
    navigate(tab.path)
  }

  const handleEdit: TabsProps['onEdit'] = (key, action) => {
    if (action === 'remove' && typeof key === 'string') {
      const wasActive = key === effectiveActiveKey
      closeTab(key)
      // Sau khi đóng, nếu tab bị đóng là tab đang xem → navigate sang
      // tab kế bên (nếu còn) hoặc về /wms (fallback)
      if (wasActive) {
        const remaining = tabs.filter((t) => t.key !== key)
        if (remaining.length > 0) {
          const idx = tabs.findIndex((t) => t.key === key)
          const next = remaining[Math.min(idx, remaining.length - 1)]
          navigate(next.path)
        }
      }
    }
  }

  // Nếu không có tab nào → chỉ render children (tab bar không hiển thị)
  if (tabs.length === 0) {
    return <>{children}</>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Tab bar */}
      <Tabs
        type="editable-card"
        hideAdd
        activeKey={effectiveActiveKey || undefined}
        onChange={handleChange}
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

      {/* Content area */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {matchingTab ? (
          // URL khớp 1 tab → render TẤT CẢ tabs, display:none cho inactive
          // (keep-alive: inactive tab vẫn mount để giữ state)
          tabs.map((tab) => (
            <TabContent
              key={tab.key}
              tab={tab}
              isActive={tab.key === matchingTab.key}
            />
          ))
        ) : (
          // URL không khớp tab nào → chỉ hiện children (list/dashboard theo URL)
          // Tabs vẫn giữ trong store, user click tab sẽ focus lại
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
