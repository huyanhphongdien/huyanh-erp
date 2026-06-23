// ============================================================================
// TÀI CHÍNH — Thanh tab cụm "Vay vốn" (gom 6 màn hình vào 1 mục menu)
// File: src/pages/finance/FinanceLendingTabs.tsx
// Tự nhận tab đang mở theo URL; chuyển tab = điều hướng route (giữ deep-link/focus).
// ============================================================================
import { Tabs } from 'antd'
import { useNavigate, useLocation } from 'react-router-dom'

const ITEMS = [
  { key: '/finance/overview', label: '📊 Tổng quan' },
  { key: '/finance/credit-lines', label: '💳 Hạn mức' },
  { key: '/finance/loans', label: '🏦 Khoản vay' },
  { key: '/finance/interest', label: '％ Lịch lãi' },
  { key: '/finance/collaterals', label: '🛡 Tài sản ĐB' },
  { key: '/finance/deposits', label: '👛 Tiền gửi' },
]

export default function FinanceLendingTabs() {
  const navigate = useNavigate()
  const loc = useLocation()
  const active = ITEMS.find((i) => loc.pathname.startsWith(i.key))?.key || ITEMS[0].key
  return (
    <Tabs activeKey={active} onChange={(k) => navigate(k)} size="small"
      items={ITEMS.map((i) => ({ key: i.key, label: i.label }))}
      style={{ marginBottom: 8 }} tabBarStyle={{ marginBottom: 4 }} />
  )
}
