// ============================================================================
// Production Progress Timeline — reusable component
// Phase 35 of B2B Intake v4
// ============================================================================
// Dùng trong ERP deal detail + Portal partner /deals/:id/production
// Reuse productionProgressService
// ============================================================================

import { useState, useEffect } from 'react'
import { Card, Steps, Typography, Tag, Spin, Space, Divider } from 'antd'
import { CheckCircleOutlined, ClockCircleOutlined, SyncOutlined } from '@ant-design/icons'
import { getTimeline, type ProductionTimeline } from '../../services/b2b/productionProgressService'
import { PURCHASE_TYPE_LABELS } from '../../services/b2b/dealService'
import PageState from '../common/PageState'
import { fmtDateTime } from '../../utils/format'

const { Text } = Typography

// Biểu tượng giữ như cũ, chữ lấy từ PURCHASE_TYPE_LABELS (trước đây ghi "Outright", "Walk-in"...)
const FLOW_ICON: Record<string, string> = {
  drc_after_production: '🅱️',
  outright: '🅰️',
  farmer_walkin: '🅲',
  standard: '📦',
}

export interface ProductionProgressProps {
  dealId: string
  /** Refresh every N seconds (0 = no auto refresh) */
  refreshInterval?: number
}

export default function ProductionProgress({ dealId, refreshInterval = 30 }: ProductionProgressProps) {
  const [timeline, setTimeline] = useState<ProductionTimeline | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)

  const load = async () => {
    try {
      const t = await getTimeline(dealId)
      setTimeline(t)
      setError(null)
    } catch (e: unknown) {
      setError(e)
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
  if (error) return <PageState error={error} onRetry={load} minHeight={120} />
  if (!timeline) return null

  const items = timeline.stages.map(s => ({
    title: s.label,
    description: (
      <Space direction="vertical" size={2}>
        {s.timestamp && (
          <Text type="secondary" style={{ fontSize: 12 }}>
            {fmtDateTime(s.timestamp)}
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

  const flowKey = (timeline.purchase_type || 'standard') as keyof typeof PURCHASE_TYPE_LABELS
  const flowLabel = `${FLOW_ICON[flowKey] || FLOW_ICON.standard} ${PURCHASE_TYPE_LABELS[flowKey] || PURCHASE_TYPE_LABELS.standard}`
  const currentStageLabel =
    timeline.stages.find(s => s.key === timeline.current_stage)?.label || timeline.current_stage

  return (
    <Card
      title={
        <Space>
          <Text strong>Tiến độ deal {timeline.deal_number}</Text>
          <Tag>{flowLabel}</Tag>
        </Space>
      }
      extra={
        refreshInterval > 0 && <Text type="secondary">Tự làm mới mỗi {refreshInterval} giây</Text>
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
        Bước hiện tại: <strong>{currentStageLabel}</strong>
      </Text>
    </Card>
  )
}
