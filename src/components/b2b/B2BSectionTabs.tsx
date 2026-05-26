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

  return (
    <div className="flex flex-wrap gap-1 mb-4 border-b border-gray-200">
      {tabs.map(t => {
        const isActive = t.key === detectedActive
        return (
          <button
            key={t.key}
            onClick={() => navigate(t.path)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px flex items-center gap-2 transition-colors min-h-[44px] ${
              isActive
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
            }`}
          >
            {t.icon}
            {t.label}
            {t.badge != null && t.badge !== 0 && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'
              }`}>
                {t.badge}
              </span>
            )}
          </button>
        )
      })}
    </div>
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

// Section "Mua hàng" — 3 kênh sourcing chính
export const MUA_HANG_TABS: SectionTab[] = [
  { key: 'demands',  label: 'Nhu cầu mua', path: '/b2b/demands' },
  { key: 'deals',    label: 'Deals',       path: '/b2b/deals' },
  { key: 'auctions', label: 'Đấu giá',     path: '/b2b/auctions' },
]

export const PARTNER_TABS: SectionTab[] = [
  { key: 'partner-list',     label: 'Danh sách đại lý', path: '/b2b/partners' },
  { key: 'partner-requests', label: 'Chờ duyệt',        path: '/b2b/partners/requests' },
  { key: 'partner-bonuses',  label: 'Thưởng đại lý',    path: '/b2b/bonuses' },
]

export const LEDGER_TABS: SectionTab[] = [
  { key: 'ledger-overview', label: 'Sổ công nợ', path: '/b2b/ledger' },
  { key: 'ledger-report',   label: 'Báo cáo',    path: '/b2b/reports' },
]

export const SETTLEMENT_TABS: SectionTab[] = [
  { key: 'settlement-list', label: 'Quyết toán',   path: '/b2b/settlements' },
  { key: 'dispute-list',    label: 'Khiếu nại DRC', path: '/b2b/disputes' },
]

export const DASHBOARD_TABS: SectionTab[] = [
  { key: 'dashboard',  label: 'Tổng quan',  path: '/b2b' },
  { key: 'analytics',  label: 'Phân tích',  path: '/b2b/analytics' },
]
