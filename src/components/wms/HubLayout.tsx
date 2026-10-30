// ============================================================================
// HubLayout — thanh tab ngang cho một "hub" của module Kho (route layout, không đụng từng trang).
// Menu trái chỉ còn 1 mục cho mỗi hub; các trang con chuyển bằng tab này. Tab cuộn ngang trên
// màn hẹp, mỗi tab ≥ 40px để chạm được.
// File: src/components/wms/HubLayout.tsx
// ============================================================================
import { Link, Outlet, useLocation } from 'react-router-dom'

interface HubTab { to: string; label: string; end?: boolean; also?: string[] }
interface Hub { title: string; mobile?: string; tabs: HubTab[] }

const HUBS: Record<string, Hub> = {
  nvl: {
    title: 'Kho nguyên liệu mủ', mobile: '/m/kho',
    tabs: [
      { to: '/wms/nvl', label: 'Tổng quan', end: true, also: ['/wms/nvl/lo'] },
      { to: '/wms/nvl/nhap', label: 'Nhập từ phiếu cân' },
      { to: '/wms/nvl/xuat', label: 'Xuất sản xuất' },
      { to: '/wms/nvl/can-lai', label: 'Cân lại / DRC' },
      { to: '/wms/nvl/kiem-ke', label: 'Kiểm kê' },
      { to: '/wms/nvl/can-doi', label: 'Cân đối & hao hụt' },
      { to: '/wms/nvl/doi-chieu', label: 'Đối chiếu giấy–máy' },
      { to: '/wms/nvl/ton-dau', label: 'Tồn đầu' },
    ],
  },
  chen: {
    title: 'Hàng chèn', mobile: '/m/kho/chen',
    tabs: [
      { to: '/wms/chen', label: 'Phiếu theo ca', end: true, also: ['/wms/chen/phieu'] },
      { to: '/wms/chen/ton', label: 'Kho chèn' },
    ],
  },
  kho: {
    title: 'Kho vật tư (ngoài menu)',
    tabs: [
      { to: '/wms/vat-tu', label: 'Tồn kho', end: true, also: ['/wms/inventory'] },
      { to: '/wms/stock-in', label: 'Nhập kho' },
      { to: '/wms/stock-out', label: 'Xuất kho' },
      { to: '/wms/transfer', label: 'Chuyển kho NM' },
    ],
  },
}

const hit = (path: string, to: string, end?: boolean, also?: string[]) =>
  (end ? path === to : path === to || path.startsWith(to + '/')) || (also ?? []).some((p) => path === p || path.startsWith(p + '/'))

export default function HubLayout({ hub }: { hub: keyof typeof HUBS }) {
  const h = HUBS[hub]
  const { pathname } = useLocation()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <nav aria-label={h.title} style={{ position: 'sticky', top: 0, zIndex: 5, background: '#FFFFFF', borderBottom: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px' }}>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#6B7280', whiteSpace: 'nowrap', paddingRight: 4 }}>{h.title}</span>
        <div style={{ display: 'flex', gap: 4, overflowX: 'auto', flex: 1, minWidth: 0, scrollbarWidth: 'none' }}>
          {h.tabs.map((t) => {
            const on = hit(pathname, t.to, t.end, t.also)
            return (
              <Link key={t.to} to={t.to} aria-current={on ? 'page' : undefined}
                style={{ display: 'inline-flex', alignItems: 'center', minHeight: 40, padding: '0 14px', borderRadius: 999, whiteSpace: 'nowrap', textDecoration: 'none', fontSize: 13.5, fontWeight: on ? 700 : 500, color: on ? '#FFFFFF' : '#1F2937', background: on ? '#1B4D3E' : '#F3F4F6', border: on ? '1px solid #1B4D3E' : '1px solid #E5E7EB' }}>
                {t.label}
              </Link>
            )
          })}
        </div>
        {h.mobile && <Link to={h.mobile} style={{ fontSize: 12, fontWeight: 600, color: '#1B4D3E', whiteSpace: 'nowrap', textDecoration: 'none', padding: '0 4px' }}>Bản điện thoại ›</Link>}
      </nav>
      <div style={{ flex: 1, minHeight: 0 }}><Outlet /></div>
    </div>
  )
}
