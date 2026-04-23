// ============================================================================
// Production Progress Timeline — reusable component
// Phase 35 of B2B Intake v4
// ============================================================================
// Dùng trong ERP deal detail + Portal partner /deals/:id/production
// Reuse productionProgressService
// ============================================================================

import { useState, useEffect } from 'react'
import { Card, Steps, Typography, Tag, Spin, Alert, Space, Divider } from 'antd'
import { CheckCircleOutlined, ClockCircleOutlined, SyncOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { getTimeline, type ProductionTimeline } from '../../services/b2b/productionProgressService'

const { Text } = Typography

export interface ProductionProgressProps {
  dealId: string
  /** Refresh every N seconds (0 = no auto refresh) */
  refreshInterval?: number
}

export default function ProductionProgress({ dealId, refreshInterval = 30 }: ProductionProgressProps) {
  const [timeline, setTimeline] = useState<ProductionTimeline | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    try {
      const t = await getTimeline(dealId)
      setTimeline(t)
      setError(null)
    } catch (e: any) {
      setError(e.message || 'Load failed')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    if (refreshInterval > 0) {
      const itv = setInterval(load, refreshInterval * 1000)
      return () => clearInterval(itv)
    }
  }, [dealId, refreshInterval])

  if (loading) return <Spin />
  if (error) return <Alert type="error" message={error} />
  if (!timeline) return null

  const items = timeline.stages.map(s => ({
    title: s.label,
    description: (
      <Space direction="vertical" size={2}>
        {s.timestamp && (
          <Text type="secondary" style={{ fontSize: 12 }}>
            {dayjs(s.timestamp).format('DD/MM HH:mm')}
          </Text>
        )}
        {s.note && <Tag color="blue" style={{ fontSize: 11 }}>{s.note}</Tag>}
      </Space>
    ),
    status: s.status === 'done' ? 'finish' :
            s.status === 'current' ? 'process' :
            s.status === 'skipped' ? 'error' : 'wait',
    icon: s.status === 'done' ? <CheckCircleOutlined /> :
          s.status === 'current' ? <SyncOutlined spin /> :
          <ClockCircleOutlined />,
  }))

  const flowLabel =
    timeline.purchase_type === 'drc_after_production' ? '🅱️ DRC-after (đại lý)' :
    timeline.purchase_type === 'outright' ? '🅰️ Outright (mua đứt)' :
    timeline.purchase_type === 'farmer_walkin' ? '🅲 Walk-in (hộ nông dân)' :
    '📦 Standard'

  return (
    <Card
      title={
        <Space>
          <Text strong>Tiến độ deal {timeline.deal_number}</Text>
          <Tag>{flowLabel}</Tag>
        </Space>
      }
      extra={
        refreshInterval > 0 && <Text type="secondary">Auto refresh {refreshInterval}s</Text>
      }
    >
      <Steps
        direction="vertical"
        current={timeline.stages.findIndex(s => s.status === 'current')}
        items={items as any}
        size="small"
      />
      <Divider />
      <Text type="secondary" style={{ fontSize: 12 }}>
        Stage hiện tại: <strong>{timeline.current_stage}</strong>
      </Text>
    </Card>
  )
}
