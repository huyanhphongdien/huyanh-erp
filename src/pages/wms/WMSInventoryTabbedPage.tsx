// ============================================================================
// WMS Inventory — Tabbed Wrapper (Phase A consolidation)
// Gộp Tồn kho + NVL Dashboard + Cảnh báo + Kiểm kê vào 1 trang với inline tabs.
// ============================================================================

import { lazy, Suspense } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Tabs, Spin, Row, Col, Typography, Space } from 'antd'
import FacilityPicker from '../../components/wms/FacilityPicker'
import { useFacilityFilter } from '../../stores/facilityFilterStore'
import { useActiveFacilities } from '../../hooks/useActiveFacilities'

const InventoryDashboard = lazy(() => import('./InventoryDashboard'))
const NVLDashboardPage = lazy(() => import('./NVLDashboardPage'))
const AlertListPage = lazy(() => import('./AlertListPage'))
const StockCheckPage = lazy(() => import('./StockCheckPage'))

const { Text } = Typography

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
  const { currentFacilityId, setCurrentFacilityId } = useFacilityFilter()
  const { data: facilities = [] } = useActiveFacilities()
  const currentFacility = facilities.find(f => f.id === currentFacilityId)

  const handleChange = (key: string) => {
    const next = new URLSearchParams(searchParams)
    next.set('tab', key)
    setSearchParams(next, { replace: true })
  }

  return (
    <div style={{ padding: '12px 16px 0' }}>
      {/* Facility selector — global filter cho module Kho */}
      <Row justify="space-between" align="middle" style={{ marginBottom: 8 }}>
        <Col>
          <Space size={8}>
            <Text strong style={{ fontSize: 13, color: '#1B4D3E' }}>🏭 Nhà máy:</Text>
            <FacilityPicker
              value={currentFacilityId}
              onChange={setCurrentFacilityId}
              allowAll
              size="middle"
              style={{ width: 240 }}
            />
            {currentFacility && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                Đang xem dữ liệu của <strong>{currentFacility.name}</strong>
              </Text>
            )}
            {!currentFacilityId && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                Đang xem <strong>tất cả 3 nhà máy</strong>
              </Text>
            )}
          </Space>
        </Col>
      </Row>

    <Tabs
      activeKey={activeKey}
      onChange={handleChange}
      destroyInactiveTabPane
      size="large"
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
    </div>
  )
}

export default WMSInventoryTabbedPage
