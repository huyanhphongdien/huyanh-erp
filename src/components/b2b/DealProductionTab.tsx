// ============================================================================
// DEAL PRODUCTION TAB — Tab San xuat trong DealDetailPage
// File: src/components/b2b/DealProductionTab.tsx
// Phase: 4.8 — Lien ket B2B Deals voi WMS Production Orders
// ============================================================================

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Row,
  Col,
  Statistic,
  Table,
  Tag,
  Button,
  Spin,
  Empty,
  Typography,
  Space,
} from 'antd'
import {
  ToolOutlined,
  CheckCircleOutlined,
  SyncOutlined,
  PlusOutlined,
} from '@ant-design/icons'
import {
  dealProductionService,
  DealProductionSummary,
  DealProductionOverview,
} from '../../services/b2b/dealProductionService'
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

const STATUS_COLORS: Record<string, string> = {
  draft: 'default',
  scheduled: 'cyan',
  in_progress: 'blue',
  completed: 'green',
  cancelled: 'red',
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Nháp',
  scheduled: 'Đã lên lịch',
  in_progress: 'Đang SX',
  completed: 'Hoàn thành',
  cancelled: 'Đã hủy',
}

// ============================================
// COMPONENT
// ============================================

interface DealProductionTabProps {
  dealId: string
}

const DealProductionTab = ({ dealId }: DealProductionTabProps) => {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [orders, setOrders] = useState<DealProductionSummary[]>([])
  const [overview, setOverview] = useState<DealProductionOverview | null>(null)

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true)
        const [orderList, overviewData] = await Promise.all([
          dealProductionService.getProductionOrdersByDeal(dealId),
          dealProductionService.getProductionOverview(dealId),
        ])
        setOrders(orderList)
        setOverview(overviewData)
      } catch (error) {
        console.error('Load DealProductionTab error:', error)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [dealId])

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 48 }}><Spin /></div>
  }

  if (!overview || orders.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Empty description="Chưa có lệnh sản xuất nào liên kết với Deal này" />
        <Button
          type="primary"
          icon={<PlusOutlined />}
          style={{ marginTop: 16, backgroundColor: '#1B4D3E', borderColor: '#1B4D3E' }}
          onClick={() => navigate(`/wms/production/new?deal_id=${dealId}`)}
        >
          Tạo lệnh SX
        </Button>
      </div>
    )
  }

  const columns = [
    {
      title: 'Mã lệnh',
      dataIndex: 'code',
      render: (code: string, record: DealProductionSummary) => (
        <a onClick={() => navigate(`/wms/production/${record.production_order_id}`)}>
          {code}
        </a>
      ),
    },
    {
      title: 'Grade',
      dataIndex: 'target_grade',
      render: (grade: string) => <Tag>{grade}</Tag>,
    },
    {
      title: 'SL mục tiêu',
      dataIndex: 'target_quantity',
      align: 'right' as const,
      render: (v: number) => `${v.toLocaleString()} kg`,
    },
    {
      title: 'SL thực tế',
      dataIndex: 'actual_quantity',
      align: 'right' as const,
      render: (v: number | null) => v != null ? `${v.toLocaleString()} kg` : '-',
    },
    {
      title: 'Công đoạn',
      dataIndex: 'stage_current',
      align: 'center' as const,
      render: (stage: number, record: DealProductionSummary) => {
        if (record.status === 'completed') return <Tag color="green">5/5</Tag>
        if (record.status === 'draft') return <Tag>0/5</Tag>
        return <Tag color="blue">{stage}/5</Tag>
      },
    },
    {
      title: 'Yield',
      dataIndex: 'yield_percent',
      align: 'right' as const,
      render: (v: number | null) => v != null ? `${v}%` : '-',
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
      title: 'Ngày tạo',
      dataIndex: 'created_at',
      render: (d: string) => formatDate(d),
    },
  ]

  return (
    <div>
      {/* Overview Stats */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={6}>
          <Statistic
            title="Lệnh SX"
            value={overview.total_orders}
            prefix={<ToolOutlined />}
          />
        </Col>
        <Col xs={12} sm={6}>
          <Statistic
            title="Đang SX"
            value={overview.in_progress}
            prefix={<SyncOutlined />}
            valueStyle={{ color: '#1890ff' }}
          />
        </Col>
        <Col xs={12} sm={6}>
          <Statistic
            title="Hoàn thành"
            value={overview.completed}
            prefix={<CheckCircleOutlined />}
            valueStyle={{ color: '#52c41a' }}
          />
        </Col>
        <Col xs={12} sm={6}>
          <Statistic
            title="Sản lượng"
            value={(overview.total_output_kg / 1000).toFixed(1)}
            suffix="tấn"
            valueStyle={{ color: '#1B4D3E' }}
          />
        </Col>
      </Row>

      {/* Header with action button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Text strong style={{ fontSize: 15 }}>
          <ToolOutlined style={{ marginRight: 8 }} />
          Lệnh sản xuất
        </Text>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          size="small"
          style={{ backgroundColor: '#1B4D3E', borderColor: '#1B4D3E' }}
          onClick={() => navigate(`/wms/production/new?deal_id=${dealId}`)}
        >
          Tạo lệnh SX
        </Button>
      </div>

      {/* Production Orders Table */}
      <Table
        dataSource={orders}
        rowKey="production_order_id"
        columns={columns}
        size="small"
        pagination={false}
        onRow={(record) => ({
          style: { cursor: 'pointer' },
          onClick: () => navigate(`/wms/production/${record.production_order_id}`),
        })}
      />
    </div>
  )
}

export default DealProductionTab
