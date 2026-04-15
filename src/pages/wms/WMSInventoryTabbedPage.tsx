// ============================================================================
// WMS Inventory — Tabbed Wrapper (Phase A consolidation)
// Gộp Tồn kho + NVL Dashboard + Cảnh báo + Kiểm kê vào 1 trang với inline tabs.
// ============================================================================

import { lazy, Suspense } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Tabs, Spin } from 'antd'

const InventoryDashboard = lazy(() => import('./InventoryDashboard'))
const NVLDashboardPage = lazy(() => import('./NVLDashboardPage'))
const AlertListPage = lazy(() => import('./AlertListPage'))
const StockCheckPage = lazy(() => import('./StockCheckPage'))

const TAB_KEYS = ['overview', 'nvl', 'alerts', 'stock-check'] as const
type TabKey = (typeof TAB_KEYS)[number]

const isTabKey = (v: string | null): v is TabKey =>
  !!v && (TAB_KEYS as readonly string[]).includes(v)

const TabFallback = () => (
  <div style={{ padding: 48, textAlign: 'center' }}>
    <Spin size="large" />
  </div>
)

const WMSInventoryTabbedPage = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const rawTab = searchParams.get('tab')
  const activeKey: TabKey = isTabKey(rawTab) ? rawTab : 'overview'

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
          key: 'overview',
          label: 'Tồn kho',
          children: (
            <Suspense fallback={<TabFallback />}>
              <InventoryDashboard />
            </Suspense>
          ),
        },
        {
          key: 'nvl',
          label: 'Bãi NVL',
          children: (
            <Suspense fallback={<TabFallback />}>
              <NVLDashboardPage />
            </Suspense>
          ),
        },
        {
          key: 'alerts',
          label: 'Cảnh báo',
          children: (
            <Suspense fallback={<TabFallback />}>
              <AlertListPage />
            </Suspense>
          ),
        },
        {
          key: 'stock-check',
          label: 'Kiểm kê',
          children: (
            <Suspense fallback={<TabFallback />}>
              <StockCheckPage />
            </Suspense>
          ),
        },
      ]}
    />
  )
}

export default WMSInventoryTabbedPage
