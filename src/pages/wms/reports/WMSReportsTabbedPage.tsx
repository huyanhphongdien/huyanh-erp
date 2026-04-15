// ============================================================================
// WMS Reports — Tabbed Wrapper (Phase A consolidation)
// Gộp 5 trang báo cáo vào 1 trang với inline tabs, URL sync qua ?tab=<name>.
// ============================================================================

import { lazy, Suspense } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Tabs, Spin } from 'antd'

const WMSReportDashboardPage = lazy(() => import('./WMSReportDashboardPage'))
const StockMovementReportPage = lazy(() => import('./StockMovementReportPage'))
const SupplierQualityReportPage = lazy(() => import('./SupplierQualityReportPage'))
const InventoryValueReportPage = lazy(() => import('./InventoryValueReportPage'))
const SupplierScoringPage = lazy(() => import('./SupplierScoringPage'))

const TAB_KEYS = [
  'dashboard',
  'stock-movement',
  'supplier-quality',
  'inventory-value',
  'supplier-scoring',
] as const
type TabKey = (typeof TAB_KEYS)[number]

const isTabKey = (v: string | null): v is TabKey =>
  !!v && (TAB_KEYS as readonly string[]).includes(v)

const TabFallback = () => (
  <div style={{ padding: 48, textAlign: 'center' }}>
    <Spin size="large" />
  </div>
)

const WMSReportsTabbedPage = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const rawTab = searchParams.get('tab')
  const activeKey: TabKey = isTabKey(rawTab) ? rawTab : 'dashboard'

  const handleChange = (key: string) => {
    const next = new URLSearchParams(searchParams)
    next.set('tab', key)
    setSearchParams(next, { replace: true })
  }

  return (
    <Tabs
      activeKey={activeKey}
      onChange={handleChange}
      destroyInactiveTabPane
      size="large"
      style={{ padding: '0 16px' }}
      items={[
        {
          key: 'dashboard',
          label: 'Dashboard',
          children: (
            <Suspense fallback={<TabFallback />}>
              <WMSReportDashboardPage />
            </Suspense>
          ),
        },
        {
          key: 'stock-movement',
          label: 'Xuất Nhập Tồn',
          children: (
            <Suspense fallback={<TabFallback />}>
              <StockMovementReportPage />
            </Suspense>
          ),
        },
        {
          key: 'supplier-quality',
          label: 'Chất lượng NCC',
          children: (
            <Suspense fallback={<TabFallback />}>
              <SupplierQualityReportPage />
            </Suspense>
          ),
        },
        {
          key: 'inventory-value',
          label: 'Giá trị tồn',
          children: (
            <Suspense fallback={<TabFallback />}>
              <InventoryValueReportPage />
            </Suspense>
          ),
        },
        {
          key: 'supplier-scoring',
          label: 'Chấm điểm NCC',
          children: (
            <Suspense fallback={<TabFallback />}>
              <SupplierScoringPage />
            </Suspense>
          ),
        },
      ]}
    />
  )
}

export default WMSReportsTabbedPage
