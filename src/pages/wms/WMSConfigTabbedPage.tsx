// ============================================================================
// WMS Config — Tabbed Wrapper (Phase B consolidation 10 → 8 menu)
// Gộp Vật liệu + Kho hàng + Cài đặt kho vào 1 trang với inline tabs.
// ============================================================================

import { lazy, Suspense } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Tabs, Spin, Typography } from 'antd'
import { SettingOutlined } from '@ant-design/icons'

const WMSMaterialListPage = lazy(() => import('./materials/MaterialListPage'))
const WMSWarehouseListPage = lazy(() => import('./warehouses/WarehouseListPage'))
const WMSSettingsPage = lazy(() => import('./WMSSettingsPage'))

const { Title, Text } = Typography

const TAB_KEYS = ['materials', 'warehouses', 'settings'] as const
type TabKey = (typeof TAB_KEYS)[number]

const isTabKey = (v: string | null): v is TabKey =>
  !!v && (TAB_KEYS as readonly string[]).includes(v)

const TabFallback = () => (
  <div style={{ padding: 48, textAlign: 'center' }}>
    <Spin size="large" />
  </div>
)

const WMSConfigTabbedPage = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const rawTab = searchParams.get('tab')
  const activeKey: TabKey = isTabKey(rawTab) ? rawTab : 'materials'

  const handleChange = (key: string) => {
    const next = new URLSearchParams(searchParams)
    next.set('tab', key)
    setSearchParams(next, { replace: true })
  }

  return (
    <div style={{ padding: '12px 16px 0' }}>
      <div style={{ marginBottom: 12 }}>
        <Title level={4} style={{ margin: 0, color: '#1B4D3E' }}>
          <SettingOutlined style={{ marginRight: 8 }} />
          Cấu hình kho
        </Title>
        <Text type="secondary" style={{ fontSize: 12 }}>
          Vật liệu · Kho hàng · Cài đặt cảnh báo
        </Text>
      </div>

      <Tabs
        activeKey={activeKey}
        onChange={handleChange}
        destroyInactiveTabPane
        size="large"
        items={[
          {
            key: 'materials',
            label: 'Vật liệu',
            children: (
              <Suspense fallback={<TabFallback />}>
                <WMSMaterialListPage />
              </Suspense>
            ),
          },
          {
            key: 'warehouses',
            label: 'Kho hàng',
            children: (
              <Suspense fallback={<TabFallback />}>
                <WMSWarehouseListPage />
              </Suspense>
            ),
          },
          {
            key: 'settings',
            label: 'Cài đặt cảnh báo',
            children: (
              <Suspense fallback={<TabFallback />}>
                <WMSSettingsPage />
              </Suspense>
            ),
          },
        ]}
      />
    </div>
  )
}

export default WMSConfigTabbedPage
