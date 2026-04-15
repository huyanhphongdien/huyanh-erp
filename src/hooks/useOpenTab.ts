// ============================================================================
// useOpenTab — Hook tiện dụng để mở tab từ bất kỳ component nào
// File: src/hooks/useOpenTab.ts
//
// Sử dụng:
//   const openTab = useOpenTab()
//   openTab({
//     key: `stock-in-${id}`,
//     title: `Phiếu nhập ${code}`,
//     componentId: 'stock-in-detail',
//     props: { id },
//     path: `/wms/stock-in/${id}`,
//   })
//
// Component tương ứng phải đã registerTabComponent('stock-in-detail', ...)
// trước khi hook được gọi (thường ở top-level module của page).
//
// Mobile fallback: nếu viewport < 768px, dùng navigate() thông thường
// thay vì mở tab — mobile không có không gian cho tab bar.
// ============================================================================

import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTabStore, type OpenTab } from '../stores/tabStore'

export type OpenTabInput = Omit<OpenTab, 'lastActiveAt' | 'openedAt' | 'dirty'>

/** Viewport threshold để quyết định mobile mode */
const MOBILE_BREAKPOINT = 768

function isMobile(): boolean {
  if (typeof window === 'undefined') return false
  return window.innerWidth < MOBILE_BREAKPOINT
}

/**
 * Hook chính để mở tab. Fallback về navigate() trên mobile.
 */
export function useOpenTab() {
  const addTab = useTabStore((s) => s.openTab)
  const navigate = useNavigate()

  return useCallback(
    (input: OpenTabInput) => {
      if (isMobile()) {
        navigate(input.path)
        return
      }
      // Thêm tab vào store + navigate URL sang path của tab đó. Bắt buộc
      // phải navigate vì TabbedWorkspace render theo location.pathname —
      // nếu URL không khớp tab.path, tab content sẽ không hiện.
      addTab(input)
      navigate(input.path)
    },
    [addTab, navigate],
  )
}

/**
 * Hook để đóng tab hiện tại (dùng trong component detail để tự close sau khi save)
 */
export function useCloseCurrentTab() {
  const activeKey = useTabStore((s) => s.activeKey)
  const closeTab = useTabStore((s) => s.closeTab)

  return useCallback(() => {
    if (activeKey) closeTab(activeKey)
  }, [activeKey, closeTab])
}

/**
 * Hook để đánh dấu tab hiện tại là dirty (có unsaved changes)
 */
export function useMarkTabDirty() {
  const activeKey = useTabStore((s) => s.activeKey)
  const setDirty = useTabStore((s) => s.setDirty)

  return useCallback(
    (dirty: boolean) => {
      if (activeKey) setDirty(activeKey, dirty)
    },
    [activeKey, setDirty],
  )
}

/**
 * Hook để cập nhật title của tab hiện tại (sau khi load data biết title thật)
 */
export function useSetTabTitle() {
  const activeKey = useTabStore((s) => s.activeKey)
  const setTitle = useTabStore((s) => s.setTitle)

  return useCallback(
    (title: string) => {
      if (activeKey) setTitle(activeKey, title)
    },
    [activeKey, setTitle],
  )
}
