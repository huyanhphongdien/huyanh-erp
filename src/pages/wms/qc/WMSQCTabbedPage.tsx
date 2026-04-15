// ============================================================================
// WMS QC — Tabbed Wrapper (Phase A consolidation)
// Gộp 4 trang QC vào 1 trang với inline tabs, URL sync qua ?tab=<name>.
// ============================================================================

import { lazy, Suspense } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Tabs, Spin } from 'antd'

const QCDashboardPage = lazy(() => import('./QCDashboardPage'))
const QCRecheckPage = lazy(() => import('./QCRecheckPage'))
const QCQuickScanPage = lazy(() => import('./QCQuickScanPage'))
const QCStandardsConfigPage = lazy(() => import('./QCStandardsConfigPage'))

const TAB_KEYS = ['dashboard', 'recheck', 'quick-scan', 'standards'] as const
type TabKey = (typeof TAB_KEYS)[number]

const isTabKey = (v: string | null): v is TabKey =>
  !!v && (TAB_KEYS as readonly string[]).includes(v)

const TabFallback = () => (
  <div style={{ padding: 48, textAlign: 'center' }}>
    <Spin size="large" />
  </div>
)

const WMSQCTabbedPage = () => {
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
              <QCDashboardPage />
            </Suspense>
          ),
        },
        {
          key: 'recheck',
          label: 'Recheck',
          children: (
            <Suspense fallback={<TabFallback />}>
              <QCRecheckPage />
            </Suspense>
          ),
        },
        {
          key: 'quick-scan',
          label: 'Quick Scan',
          children: (
            <Suspense fallback={<TabFallback />}>
              <QCQuickScanPage />
            </Suspense>
          ),
        },
        {
          key: 'standards',
          label: 'Tiêu chuẩn',
          children: (
            <Suspense fallback={<TabFallback />}>
              <QCStandardsConfigPage />
            </Suspense>
          ),
        },
      ]}
    />
  )
}

export default WMSQCTabbedPage
