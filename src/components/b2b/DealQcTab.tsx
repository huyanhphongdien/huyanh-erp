// ============================================================================
// DEAL QC TAB — Tab QC trong DealDetailPage
// File: src/components/b2b/DealQcTab.tsx
// Phase: 4.5
// ============================================================================

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Table,
  Tag,
  Spin,
  Empty,
  Button,
  Typography,
} from 'antd'
import { ExperimentOutlined } from '@ant-design/icons'
import {
  dealWmsService,
  DealBatchSummary,
} from '../../services/b2b/dealWmsService'
import { Deal } from '../../services/b2b/dealService'
import DrcVarianceCard from './DrcVarianceCard'
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

  return (
    <div>
      {/* DRC Variance Analysis Card */}
      <DrcVarianceCard deal={deal} />

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
                width: 220,
                render: (_: any, record: DealBatchSummary) => {
                  const isPending = !record.qc_status || record.qc_status === 'pending'
                  return (
                    <Button.Group>
                      <Button
                        size="small"
                        type={isPending ? 'primary' : 'default'}
                        icon={<ExperimentOutlined />}
                        onClick={() => navigate(`/wms/qc?tab=quick-scan&batch=${encodeURIComponent(record.batch_no)}`)}
                        style={isPending ? { background: '#B45309', borderColor: '#B45309' } : undefined}
                      >
                        {isPending ? 'Nhập QC' : 'Sửa QC'}
                      </Button>
                      <Button
                        size="small"
                        onClick={() => navigate(`/wms/qc/batch/${record.batch_id}`)}
                      >
                        Lịch sử
                      </Button>
                    </Button.Group>
                  )
                },
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
