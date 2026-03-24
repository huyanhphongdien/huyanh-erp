// ============================================================================
// FILE: src/pages/wms/AlertListPage.tsx
// MODULE: Kho Thành Phẩm (WMS) — Huy Anh Rubber ERP
// PHASE: P5 — Buoc 5.6: Danh sách canh bao
// REWRITE: Tailwind -> Ant Design v6
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Card,
  Tabs,
  Tag,
  Button,
  Space,
  Typography,
  Spin,
  Empty,
  List,
  Badge,
  Alert as AntAlert,
} from 'antd'
import {
  ArrowLeftOutlined,
  BellOutlined,
  ExclamationCircleOutlined,
  InboxOutlined,
  ClockCircleOutlined,
  ExperimentOutlined,
  ReloadOutlined,
  RightOutlined,
  CloseOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import { alertService, type StockAlert, type AlertType } from '../../services/wms/alertService'

const { Title, Text } = Typography

// ============================================================================
// TYPES
// ============================================================================

type TabKey = 'all' | 'stock' | 'expiry' | 'qc' | 'rubber'

interface TabDef {
  key: TabKey
  label: string
  icon: React.ReactNode
  types: AlertType[]
}

const TABS: TabDef[] = [
  { key: 'all', label: 'Tất cả', icon: <BellOutlined />, types: [] },
  { key: 'stock', label: 'Tồn kho', icon: <InboxOutlined />, types: ['low_stock', 'over_stock'] },
  { key: 'expiry', label: 'Hết hạn', icon: <ClockCircleOutlined />, types: ['expiring', 'expired'] },
  { key: 'qc', label: 'QC', icon: <ExperimentOutlined />, types: ['needs_recheck', 'needs_blend'] },
  {
    key: 'rubber',
    label: 'Cao su',
    icon: <WarningOutlined />,
    types: ['weight_loss_excessive', 'storage_too_long', 'contamination_detected'] as AlertType[],
  },
]

// ============================================================================
// COMPONENT
// ============================================================================

const AlertListPage = () => {
  const navigate = useNavigate()

  const [alerts, setAlerts] = useState<StockAlert[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [activeTab, setActiveTab] = useState<TabKey>('all')
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set())

  // --------------------------------------------------------------------------
  // DATA LOADING
  // --------------------------------------------------------------------------

  const loadAlerts = useCallback(async (showRefresh = false) => {
    try {
      if (showRefresh) setRefreshing(true)
      else setLoading(true)

      const data = await alertService.checkAllAlerts()
      setAlerts(data)
    } catch (err) {
      console.error('Load alerts error:', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    loadAlerts()
  }, [loadAlerts])

  // --------------------------------------------------------------------------
  // FILTER
  // --------------------------------------------------------------------------

  const tab = TABS.find(t => t.key === activeTab)!
  const filteredAlerts = alerts
    .filter(a => !dismissedIds.has(a.id))
    .filter(a => {
      if (activeTab === 'all') return true
      return tab.types.includes(a.type)
    })

  const tabCounts: Record<TabKey, number> = {
    all: alerts.filter(a => !dismissedIds.has(a.id)).length,
    stock: alerts.filter(a => !dismissedIds.has(a.id) && ['low_stock', 'over_stock'].includes(a.type)).length,
    expiry: alerts.filter(a => !dismissedIds.has(a.id) && ['expiring', 'expired'].includes(a.type)).length,
    qc: alerts.filter(a => !dismissedIds.has(a.id) && ['needs_recheck', 'needs_blend'].includes(a.type)).length,
    rubber: alerts.filter(a => !dismissedIds.has(a.id) && ['weight_loss_excessive', 'storage_too_long', 'contamination_detected'].includes(a.type)).length,
  }

  // --------------------------------------------------------------------------
  // DISMISS
  // --------------------------------------------------------------------------

  const handleDismiss = (alertId: string) => {
    setDismissedIds(prev => new Set([...prev, alertId]))
  }

  // --------------------------------------------------------------------------
  // HELPERS
  // --------------------------------------------------------------------------

  const getSeverityConfig = (severity: string) => {
    switch (severity) {
      case 'high': return { color: '#ff4d4f', borderColor: '#ff4d4f', tagColor: 'error', text: 'Cao' }
      case 'medium': return { color: '#faad14', borderColor: '#faad14', tagColor: 'warning', text: 'Trung bình' }
      case 'low': return { color: '#1677ff', borderColor: '#1677ff', tagColor: 'processing', text: 'Thấp' }
      default: return { color: '#d9d9d9', borderColor: '#d9d9d9', tagColor: 'default', text: '' }
    }
  }

  const getAlertTypeIcon = (type: AlertType) => {
    switch (type) {
      case 'low_stock': return <InboxOutlined style={{ color: '#ff4d4f' }} />
      case 'over_stock': return <InboxOutlined style={{ color: '#faad14' }} />
      case 'expiring': return <ClockCircleOutlined style={{ color: '#faad14' }} />
      case 'expired': return <ClockCircleOutlined style={{ color: '#ff4d4f' }} />
      case 'needs_recheck': return <ExperimentOutlined style={{ color: '#1677ff' }} />
      case 'needs_blend': return <ExperimentOutlined style={{ color: '#722ed1' }} />
      default: return <ExclamationCircleOutlined style={{ color: '#999' }} />
    }
  }

  // --------------------------------------------------------------------------
  // LOADING
  // --------------------------------------------------------------------------

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#F7F5F2' }}>
        <Spin size="large" />
        <Text type="secondary" style={{ marginTop: 12 }}>Đang kiểm tra cảnh báo...</Text>
      </div>
    )
  }

  // --------------------------------------------------------------------------
  // MAIN RENDER
  // --------------------------------------------------------------------------

  return (
    <div style={{ minHeight: '100vh', background: '#F7F5F2' }}>
      {/* Header */}
      <div style={{ background: '#1B4D3E', padding: '16px', color: '#fff' }}>
        <Space align="center">
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate(-1)}
            style={{ color: '#fff' }}
          />
          <div style={{ flex: 1 }}>
            <Title level={5} style={{ color: '#fff', margin: 0 }}>Cảnh báo</Title>
            <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>
              {tabCounts.all} cảnh báo đang hoạt động
            </Text>
          </div>
          <Button
            type="text"
            icon={<ReloadOutlined spin={refreshing} />}
            onClick={() => loadAlerts(true)}
            loading={refreshing}
            style={{ color: '#fff' }}
          />
        </Space>
      </div>

      {/* Tabs + Content */}
      <Tabs
        activeKey={activeTab}
        onChange={key => setActiveTab(key as TabKey)}
        style={{ padding: '0 16px' }}
        items={TABS.map(t => ({
          key: t.key,
          label: (
            <Badge count={tabCounts[t.key]} size="small" offset={[8, 0]}>
              <Space size={4}>
                {t.icon}
                <span>{t.label}</span>
              </Space>
            </Badge>
          ),
        }))}
      />

      <div style={{ padding: '0 16px 24px' }}>
        {filteredAlerts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '64px 0' }}>
            <div style={{
              width: 64, height: 64, borderRadius: '50%', background: '#f6ffed',
              display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px',
            }}>
              <BellOutlined style={{ fontSize: 28, color: '#52c41a' }} />
            </div>
            <Text strong>Không có cảnh báo nào</Text>
            <br />
            <Text type="secondary" style={{ fontSize: 12 }}>
              {activeTab === 'all' ? 'Tất cả hoạt động kho đều bình thường' : `Không có cảnh báo ${tab.label.toLowerCase()}`}
            </Text>
          </div>
        ) : (
          <List
            dataSource={filteredAlerts}
            renderItem={(alert) => {
              const sevConf = getSeverityConfig(alert.severity)

              return (
                <Card
                  key={alert.id}
                  size="small"
                  style={{
                    marginBottom: 8,
                    borderLeft: `4px solid ${sevConf.borderColor}`,
                    background: alert.severity === 'high' ? '#fff2f0'
                      : alert.severity === 'medium' ? '#fffbe6'
                      : '#f0f5ff',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{ marginTop: 2, flexShrink: 0 }}>
                      {getAlertTypeIcon(alert.type)}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Text strong style={{ fontSize: 13 }}>{alert.message}</Text>
                      {alert.detail && (
                        <div>
                          <Text type="secondary" style={{ fontSize: 12 }}>{alert.detail}</Text>
                        </div>
                      )}

                      <Space style={{ marginTop: 8 }}>
                        <Tag color={sevConf.tagColor}>{sevConf.text}</Tag>
                        {alert.material_id && (
                          <Button
                            type="link"
                            size="small"
                            onClick={() => navigate(`/wms/inventory/${alert.material_id}`)}
                            style={{ padding: 0, fontSize: 12, color: '#2D8B6E' }}
                          >
                            Xem chi tiết <RightOutlined />
                          </Button>
                        )}
                      </Space>
                    </div>

                    <Button
                      type="text"
                      size="small"
                      icon={<CloseOutlined />}
                      onClick={() => handleDismiss(alert.id)}
                      style={{ flexShrink: 0, color: '#999' }}
                    />
                  </div>
                </Card>
              )
            }}
          />
        )}
      </div>
    </div>
  )
}

export default AlertListPage
