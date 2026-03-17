// ============================================================================
// DEAL QC TAB — Tab QC trong DealDetailPage
// File: src/components/b2b/DealQcTab.tsx
// Phase: 4.5
// ============================================================================

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Row,
  Col,
  Statistic,
  Table,
  Tag,
  Card,
  Spin,
  Empty,
  Button,
  Typography,
} from 'antd'
import {
  ExperimentOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
} from '@ant-design/icons'
import {
  dealWmsService,
  DealBatchSummary,
} from '../../services/b2b/dealWmsService'
import { Deal } from '../../services/b2b/dealService'
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'

const { Text } = Typography

// ============================================
// HELPERS
// ============================================

const formatDate = (dateStr: string | null): string => {
  if (!dateStr) return '-'
  return format(new Date(dateStr), 'dd/MM/yyyy', { locale: vi })
}

const QC_STATUS_COLORS: Record<string, string> = {
  passed: 'green',
  warning: 'orange',
  failed: 'red',
  pending: 'default',
}

const QC_STATUS_LABELS: Record<string, string> = {
  passed: 'Đạt',
  warning: 'Cảnh báo',
  failed: 'Không đạt',
  pending: 'Chờ kiểm tra',
}

// ============================================
// COMPONENT
// ============================================

interface DealQcTabProps {
  dealId: string
  deal: Deal
}

const DealQcTab = ({ dealId, deal }: DealQcTabProps) => {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [batches, setBatches] = useState<DealBatchSummary[]>([])

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true)
        const data = await dealWmsService.getBatchesByDeal(dealId)
        setBatches(data)
      } catch (error) {
        console.error('Load DealQcTab error:', error)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [dealId])

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 48 }}><Spin /></div>
  }

  const expectedDrc = deal.quantity_kg && deal.unit_price
    ? (deal as any).expected_drc
    : null
  const actualDrc = deal.actual_drc
  const drcDiff = actualDrc && expectedDrc
    ? actualDrc - expectedDrc
    : null

  return (
    <div>
      {/* DRC Comparison Card */}
      <Card
        size="small"
        style={{ marginBottom: 24, background: '#fafafa', borderRadius: 8 }}
      >
        <Row gutter={24}>
          <Col xs={8}>
            <Statistic
              title="DRC dự kiến"
              value={expectedDrc ?? '-'}
              suffix={expectedDrc ? '%' : ''}
              valueStyle={{ color: '#666' }}
            />
          </Col>
          <Col xs={8}>
            <Statistic
              title="DRC thực tế (QC)"
              value={actualDrc ?? '-'}
              suffix={actualDrc ? '%' : ''}
              valueStyle={{
                color: actualDrc
                  ? (expectedDrc && actualDrc >= expectedDrc ? '#52c41a' : '#cf1322')
                  : '#999',
              }}
            />
          </Col>
          <Col xs={8}>
            <Statistic
              title="Chênh lệch"
              value={drcDiff !== null ? Math.abs(drcDiff).toFixed(1) : '-'}
              suffix={drcDiff !== null ? '%' : ''}
              prefix={drcDiff !== null ? (drcDiff >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />) : undefined}
              valueStyle={{
                color: drcDiff !== null
                  ? (drcDiff >= 0 ? '#52c41a' : '#cf1322')
                  : '#999',
              }}
            />
          </Col>
        </Row>
      </Card>

      {/* QC Status Summary */}
      {deal.qc_status && deal.qc_status !== 'pending' && (
        <div style={{ marginBottom: 16 }}>
          <Text>Trạng thái QC tổng hợp: </Text>
          <Tag color={QC_STATUS_COLORS[deal.qc_status] || 'default'} style={{ fontSize: 14 }}>
            {QC_STATUS_LABELS[deal.qc_status] || deal.qc_status}
          </Tag>
        </div>
      )}

      {/* Batches Table */}
      {batches.length === 0 ? (
        <Empty description="Chưa có batch QC nào" />
      ) : (
        <>
          <Text strong style={{ fontSize: 15, marginBottom: 12, display: 'block' }}>
            <ExperimentOutlined style={{ marginRight: 8 }} />
            Danh sách Batches ({batches.length})
          </Text>
          <Table
            dataSource={batches}
            rowKey="batch_id"
            columns={[
              {
                title: 'Batch',
                dataIndex: 'batch_no',
                render: (v: string) => <Text strong>{v}</Text>,
              },
              {
                title: 'Vật liệu',
                dataIndex: 'material_name',
              },
              {
                title: 'DRC ban đầu',
                dataIndex: 'initial_drc',
                align: 'right' as const,
                render: (v: number | null) => v ? `${v}%` : '-',
              },
              {
                title: 'DRC hiện tại',
                dataIndex: 'latest_drc',
                align: 'right' as const,
                render: (v: number | null) => v ? (
                  <Text strong style={{ color: '#1B4D3E' }}>{v}%</Text>
                ) : '-',
              },
              {
                title: 'Trạng thái QC',
                dataIndex: 'qc_status',
                render: (s: string) => (
                  <Tag color={QC_STATUS_COLORS[s] || 'default'}>
                    {QC_STATUS_LABELS[s] || s}
                  </Tag>
                ),
              },
              {
                title: 'SL còn (kg)',
                dataIndex: 'quantity_remaining',
                align: 'right' as const,
                render: (v: number) => v ? v.toLocaleString() : '-',
              },
              {
                title: 'Ngày nhận',
                dataIndex: 'received_date',
                render: (d: string) => formatDate(d),
              },
              {
                title: '',
                width: 100,
                render: (_: any, record: DealBatchSummary) => (
                  <Button
                    size="small"
                    type="link"
                    onClick={() => navigate(`/wms/qc/history/${record.batch_id}`)}
                  >
                    Lịch sử QC
                  </Button>
                ),
              },
            ]}
            size="small"
            pagination={false}
          />
        </>
      )}
    </div>
  )
}

export default DealQcTab
