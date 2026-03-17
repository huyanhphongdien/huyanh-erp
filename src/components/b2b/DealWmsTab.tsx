// ============================================================================
// DEAL WMS TAB — Tab Nhập kho trong DealDetailPage
// File: src/components/b2b/DealWmsTab.tsx
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
  Divider,
  Spin,
  Empty,
  Typography,
} from 'antd'
import {
  InboxOutlined,
  CarOutlined,
  ExperimentOutlined,
  DashboardOutlined,
} from '@ant-design/icons'
import {
  dealWmsService,
  DealStockInSummary,
  DealWeighbridgeSummary,
  DealWmsOverview,
} from '../../services/b2b/dealWmsService'
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

const formatWeight = (kg: number): string => {
  if (kg >= 1000) return `${(kg / 1000).toFixed(1)} T`
  return `${kg.toLocaleString()} kg`
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'default',
  confirmed: 'green',
  cancelled: 'red',
  pending: 'orange',
  in_progress: 'blue',
  completed: 'green',
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Nháp',
  confirmed: 'Đã xác nhận',
  cancelled: 'Đã hủy',
  pending: 'Chờ cân',
  in_progress: 'Đang cân',
  completed: 'Hoàn thành',
}

// ============================================
// COMPONENT
// ============================================

interface DealWmsTabProps {
  dealId: string
}

const DealWmsTab = ({ dealId }: DealWmsTabProps) => {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [stockIns, setStockIns] = useState<DealStockInSummary[]>([])
  const [weighbridges, setWeighbridges] = useState<DealWeighbridgeSummary[]>([])
  const [overview, setOverview] = useState<DealWmsOverview | null>(null)

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true)
        const [sis, wbs, ov] = await Promise.all([
          dealWmsService.getStockInsByDeal(dealId),
          dealWmsService.getWeighbridgeByDeal(dealId),
          dealWmsService.getDealWmsOverview(dealId),
        ])
        setStockIns(sis)
        setWeighbridges(wbs)
        setOverview(ov)
      } catch (error) {
        console.error('Load DealWmsTab error:', error)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [dealId])

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 48 }}><Spin /></div>
  }

  if (!overview || (stockIns.length === 0 && weighbridges.length === 0)) {
    return <Empty description="Chưa có phiếu nhập kho nào liên kết với Deal này" />
  }

  return (
    <div>
      {/* Overview Stats */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={6}>
          <Statistic
            title="Phiếu nhập"
            value={overview.stock_in_count}
            prefix={<InboxOutlined />}
          />
        </Col>
        <Col xs={12} sm={6}>
          <Statistic
            title="Đã nhận"
            value={(overview.total_received_kg / 1000).toFixed(1)}
            suffix="tấn"
            valueStyle={{ color: '#1B4D3E' }}
          />
        </Col>
        <Col xs={12} sm={6}>
          <Statistic
            title="Lô hàng"
            value={overview.batch_count}
            prefix={<ExperimentOutlined />}
          />
        </Col>
        <Col xs={12} sm={6}>
          <Statistic
            title="Phiếu cân"
            value={overview.weighbridge_count}
            prefix={<DashboardOutlined />}
          />
        </Col>
      </Row>

      {/* Stock-In Table */}
      <Text strong style={{ fontSize: 15, marginBottom: 12, display: 'block' }}>
        <InboxOutlined style={{ marginRight: 8 }} />
        Phiếu nhập kho
      </Text>
      <Table
        dataSource={stockIns}
        rowKey="stock_in_id"
        columns={[
          {
            title: 'Mã phiếu',
            dataIndex: 'code',
            render: (code: string, record: DealStockInSummary) => (
              <a onClick={() => navigate(`/wms/stock-in/${record.stock_in_id}`)}>
                {code}
              </a>
            ),
          },
          {
            title: 'Kho',
            dataIndex: 'warehouse_name',
          },
          {
            title: 'Trọng lượng',
            dataIndex: 'total_weight',
            align: 'right' as const,
            render: (v: number) => formatWeight(v),
          },
          {
            title: 'Trạng thái',
            dataIndex: 'status',
            render: (s: string) => (
              <Tag color={STATUS_COLORS[s] || 'default'}>
                {STATUS_LABELS[s] || s}
              </Tag>
            ),
          },
          {
            title: 'Ngày xác nhận',
            dataIndex: 'confirmed_at',
            render: (d: string | null) => formatDate(d),
          },
        ]}
        size="small"
        pagination={false}
        style={{ marginBottom: 24 }}
      />

      {/* Weighbridge Table */}
      {weighbridges.length > 0 && (
        <>
          <Divider />
          <Text strong style={{ fontSize: 15, marginBottom: 12, display: 'block' }}>
            <CarOutlined style={{ marginRight: 8 }} />
            Phiếu cân xe
          </Text>
          <Table
            dataSource={weighbridges}
            rowKey="ticket_id"
            columns={[
              {
                title: 'Mã cân',
                dataIndex: 'code',
              },
              {
                title: 'Biển số xe',
                dataIndex: 'vehicle_plate',
              },
              {
                title: 'Tịnh (kg)',
                dataIndex: 'net_weight',
                align: 'right' as const,
                render: (v: number | null) => v ? v.toLocaleString() : '-',
              },
              {
                title: 'Trạng thái',
                dataIndex: 'status',
                render: (s: string) => (
                  <Tag color={STATUS_COLORS[s] || 'default'}>
                    {STATUS_LABELS[s] || s}
                  </Tag>
                ),
              },
              {
                title: 'Hoàn thành',
                dataIndex: 'completed_at',
                render: (d: string | null) => formatDate(d),
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

export default DealWmsTab
