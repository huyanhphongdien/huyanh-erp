// ============================================================================
// TAB STORE — Multi-tab workspace state management
// File: src/stores/tabStore.ts
//
// Quản lý list tabs đang mở trong workspace (giống Chrome tabs / SSMS).
// Dùng cho feature Tabbed Workspace (Approach B — hybrid: list navigate,
// detail pages mở thành tab). Full plan: docs/TABBED_WORKSPACE_PLAN.md
//
// Scope pilot: chỉ module Kho (WMS) — các detail pages khác vẫn navigate
// bình thường cho đến khi user approve rollout.
// ============================================================================

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { ComponentType, ReactNode } from 'react'

// ============================================================================
// REGISTRY — Map tab componentId → React component
// ----------------------------------------------------------------------------
// Component thật không serialize được (function), nên persist store chỉ lưu
// string id. Mỗi detail page khi muốn mở tab phải đăng ký component của nó
// vào registry 1 lần (thường ở top-level module hoặc trước khi gọi openTab).
// ============================================================================

type TabComponent = ComponentType<any>

const componentRegistry = new Map<string, TabComponent>()

export function registerTabComponent(componentId: string, component: TabComponent): void {
  componentRegistry.set(componentId, component)
}

export function getTabComponent(componentId: string): TabComponent | null {
  return componentRegistry.get(componentId) || null
}

// ============================================================================
// TYPES
// ============================================================================

export interface OpenTab {
  /** Unique key: 'stock-in-<id>', 'sales-order-<id>' — trùng key = focus tab */
  key: string
  /** Hiển thị trên tab label */
  title: string
  /** ID của component đã đăng ký vào registry */
  componentId: string
  /** Props truyền vào component (must be JSON-serializable để persist qua F5) */
  props: Record<string, unknown>
  /** URL browser sẽ sync về khi tab này active */
  path: string
  /** Icon hiển thị bên trái title (optional, không persist) */
  icon?: ReactNode
  /** Timestamp lần cuối focus — cho LRU eviction */
  lastActiveAt: number
  /** Timestamp tạo tab — cho tie-break sort */
  openedAt: number
  /** Có unsaved changes không — cảnh báo khi close */
  dirty?: boolean
  /**
   * Key của tab parent (top-level) — nếu set thì tab này hiện ở row 2
   * (sub-tab bar) chỉ khi parent đang active. Dùng cho chat rooms
   * trực thuộc 'Chat Đại lý', sub-pages drill-down, v.v.
   */
  parentKey?: string
}

interface TabStoreState {
  tabs: OpenTab[]
  activeKey: string | null
}

interface TabStoreActions {
  /** Mở tab mới hoặc focus tab có cùng key */
  openTab: (tab: Omit<OpenTab, 'lastActiveAt' | 'openedAt'>) => void
  /** Đóng 1 tab */
  closeTab: (key: string) => void
  /** Đóng tất cả tab khác, giữ lại 1 tab */
  closeOthers: (keepKey: string) => void
  /** Đóng toàn bộ tab */
  closeAll: () => void
  /** Set active tab */
  setActive: (key: string) => void
  /** Đánh dấu tab có unsaved changes */
  setDirty: (key: string, dirty: boolean) => void
  /** Cập nhật title tab (VD: sau khi load data mới biết title thật) */
  setTitle: (key: string, title: string) => void
}

type TabStore = TabStoreState & TabStoreActions

// ============================================================================
// CONFIG
// ============================================================================

/** Max tabs trước khi trigger LRU eviction */
const MAX_TABS = 15

/** LocalStorage key */
const STORAGE_KEY = 'huyanh-erp-tabs-v1'

// ============================================================================
// STORE
// ============================================================================

export const useTabStore = create<TabStore>()(
  persist(
    (set) => ({
      tabs: [],
      activeKey: null,

      openTab: (input) => {
        const now = Date.now()
        set((state) => {
          const existing = state.tabs.find((t) => t.key === input.key)

          // Nếu đã có tab với key này → focus + cập nhật lastActiveAt
          if (existing) {
            return {
              tabs: state.tabs.map((t) =>
                t.key === input.key ? { ...t, lastActiveAt: now } : t,
              ),
              activeKey: input.key,
            }
          }

          // LRU eviction khi vượt quá MAX_TABS (đuổi tab ít dùng nhất)
          let tabs = [...state.tabs]
          if (tabs.length >= MAX_TABS) {
            // Sort theo lastActiveAt ascending, loại tab cũ nhất không dirty
            const candidates = [...tabs].sort((a, b) => a.lastActiveAt - b.lastActiveAt)
            const victim = candidates.find((t) => !t.dirty) || candidates[0]
            tabs = tabs.filter((t) => t.key !== victim.key)
          }

          const newTab: OpenTab = {
            ...input,
            lastActiveAt: now,
            openedAt: now,
          }

          return {
            tabs: [...tabs, newTab],
            activeKey: input.key,
          }
        })
      },

      closeTab: (key) => {
        set((state) => {
          // Nếu đóng tab parent → đóng luôn tất cả sub-tabs thuộc nó
          const tabs = state.tabs.filter((t) => t.key !== key && t.parentKey !== key)
          let activeKey = state.activeKey

          // Nếu đóng tab đang active (hoặc parent của active) → focus tab kế bên
          const closedKeys = state.tabs
            .filter((t) => t.key === key || t.parentKey === key)
            .map((t) => t.key)
          if (activeKey && closedKeys.includes(activeKey)) {
            const idx = state.tabs.findIndex((t) => t.key === key)
            if (tabs.length === 0) {
              activeKey = null
            } else if (idx < tabs.length) {
              activeKey = tabs[idx].key
            } else {
              activeKey = tabs[tabs.length - 1].key
            }
          }

          return { tabs, activeKey }
        })
      },

      closeOthers: (keepKey) => {
        set((state) => {
          const keepTab = state.tabs.find((t) => t.key === keepKey)
          if (!keepTab) return state
          return {
            tabs: [keepTab],
            activeKey: keepKey,
          }
        })
      },

      closeAll: () => {
        set({ tabs: [], activeKey: null })
      },

      setActive: (key) => {
        set((state) => ({
          tabs: state.tabs.map((t) =>
            t.key === key ? { ...t, lastActiveAt: Date.now() } : t,
          ),
          activeKey: key,
        }))
      },

      setDirty: (key, dirty) => {
        set((state) => ({
          tabs: state.tabs.map((t) => (t.key === key ? { ...t, dirty } : t)),
        }))
      },

      setTitle: (key, title) => {
        set((state) => ({
          tabs: state.tabs.map((t) => (t.key === key ? { ...t, title } : t)),
        }))
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      // Chỉ persist fields serializable — bỏ icon (ReactNode không serialize được)
      partialize: (state) => ({
        tabs: state.tabs.map(({ icon: _icon, ...rest }) => rest),
        activeKey: state.activeKey,
      }),
    },
  ),
)
