// ============================================================================
// B2B SECTION TABS — Shared tab nav for grouped pages (post-menu-consolidation)
// File: src/components/b2b/B2BSectionTabs.tsx
// ============================================================================
//
// Mục đích: gom nhóm các page liên quan thành 1 menu sidebar duy nhất + tab
// điều hướng ở đầu page. User không phải scroll sidebar dài.
//
// Sử dụng: render ở đầu page (sau breadcrumb, trước content) với prop active.
// Component sẽ navigate qua React Router khi user click tab khác.
// ============================================================================

import { useNavigate, useLocation } from 'react-router-dom'
import { Tabs, Badge } from 'antd'

export interface SectionTab {
  key: string
  label: string
  path: string
  icon?: React.ReactNode
  badge?: number | string | null
}

interface Props {
  tabs: SectionTab[]
  /** Override active key. Mặc định auto-detect từ location.pathname. */
  active?: string
}

export function B2BSectionTabs({ tabs, active }: Props) {
  const navigate = useNavigate()
  const location = useLocation()

  // Auto-detect active: exact match first, else startsWith match
  const detectedActive = active ?? (() => {
    const exact = tabs.find(t => t.path === location.pathname)
    if (exact) return exact.key
    const prefix = tabs.find(t => location.pathname.startsWith(t.path))
    return prefix?.key ?? tabs[0]?.key
  })()

  const items = tabs.map(t => ({
    key: t.key,
    label: (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        {t.icon}
        <span>{t.label}</span>
        {t.badge != null && t.badge !== 0 && (
          <Badge
            count={t.badge}
            size="small"
            style={{ backgroundColor: '#1B4D3E' }}
          />
        )}
      </span>
    ),
  }))

  return (
    <Tabs
      activeKey={detectedActive}
      onChange={(key) => {
        const tab = tabs.find(t => t.key === key)
        if (tab) navigate(tab.path)
      }}
      items={items}
      size="middle"
      style={{ marginBottom: 16 }}
      tabBarStyle={{ marginBottom: 0 }}
    />
  )
}

// ============================================================================
// PREDEFINED TAB SETS (single source of truth)
// ============================================================================

export const INTAKE_TABS: SectionTab[] = [
  { key: 'intake-list',   label: 'Phiếu nhập (Lý lịch)', path: '/b2b/rubber-intake' },
  { key: 'weighbridge',   label: 'Phiếu cân (đa NM)',    path: '/wms/weighbridge/list' },
  { key: 'manual-entry',  label: 'Nhập tay phiếu cân',   path: '/b2b/intake-manual' },
]

// Section "Mua hàng" — ẩn Nhu cầu mua + Đấu giá (2026-05), chỉ còn Deals.
// Route /b2b/demands, /b2b/auctions vẫn giữ (chỉ ẩn khỏi menu/tab) để bật lại dễ.
export const MUA_HANG_TABS: SectionTab[] = [
  { key: 'deals',    label: 'Deals',       path: '/b2b/deals' },
]

export const PARTNER_TABS: SectionTab[] = [
  { key: 'partner-list',        label: 'Danh sách đại lý', path: '/b2b/partners' },
  { key: 'partner-requests',    label: 'Chờ duyệt',        path: '/b2b/partners/requests' },
  { key: 'partner-assignments', label: 'Phân công NV',     path: '/b2b/partners/assignments' },
  { key: 'partner-bonuses',     label: 'Thưởng đại lý',    path: '/b2b/bonuses' },
]

export const LEDGER_TABS: SectionTab[] = [
  { key: 'ledger-overview', label: 'Sổ công nợ', path: '/b2b/ledger' },
  { key: 'ledger-report',   label: 'Báo cáo',    path: '/b2b/reports' },
]

export const SETTLEMENT_TABS: SectionTab[] = [
  { key: 'settlement-list', label: 'Quyết toán',   path: '/b2b/settlements' },
]

export const DASHBOARD_TABS: SectionTab[] = [
  { key: 'dashboard',  label: 'Tổng quan',  path: '/b2b' },
  { key: 'stats',      label: 'Thống kê',   path: '/b2b/stats' },
  { key: 'analytics',  label: 'Phân tích',  path: '/b2b/analytics' },
]
