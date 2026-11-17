// ============================================================================
// BLEND LIST PAGE — Ant Design
// File: src/pages/wms/blending/BlendListPage.tsx
// Module: Kho Thành Phẩm (WMS) - Huy Anh Rubber ERP
// ============================================================================

import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOpenTab } from '../../../hooks/useOpenTab'
import {
  Card,
  Table,
  Tag,
  Button,
  Space,
  Input,
  Select,
  Typography,
  Row,
  Col,
  Statistic,
} from 'antd'
import {
  PlusOutlined,
  ReloadOutlined,
  ExperimentOutlined,
  BulbOutlined,
} from '@ant-design/icons'
import blendingService from '../../../services/wms/blendingService'
import { useDebounce } from '../../../hooks/useDebounce'
import GradeBadge from '../../../components/wms/GradeBadge'
import PageState from '../../../components/common/PageState'
import { stdPagination } from '../../../components/common/tableDefaults'
import { dichLoiHeThong } from '../../../utils/dichLoiHeThong'
import { fmtDate, fmtKg } from '../../../utils/format'
import type { BlendOrder, BlendStatus } from '../../../services/wms/wms.types'
import {
  BLEND_STATUS_LABELS,
  BLEND_STATUS_COLORS,
} from '../../../services/wms/wms.types'

const { Title, Text } = Typography

// ============================================================================
// COMPONENT
// ============================================================================

const BlendListPage = () => {
  const navigate = useNavigate()
  const openTab = useOpenTab()

  const [orders, setOrders] = useState<BlendOrder[]>([])
  const [totalOrders, setTotalOrders] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchText, setSearchText] = useState('')
  const searchDebounced = useDebounce(searchText, 400) // gõ xong 400ms mới bắn query
  const [filterStatus, setFilterStatus] = useState<string | undefined>(undefined)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  // Thẻ "Đang trộn"/"Hoàn thành" đếm trên SERVER (mọi lệnh khớp ô tìm), không đếm trang đang xem.
  const [statusCounts, setStatusCounts] = useState<{ inProgress: number; completed: number } | null>(null)
  // Chỉ nhận kết quả của lần tải MỚI NHẤT — lần cũ về sau không được đè lên.
  const reqRef = useRef(0)

  // Load data
  const loadOrders = useCallback(async () => {
    const my = ++reqRef.current
    setLoading(true)
    setError(null)
    try {
      const search = searchDebounced.trim() || undefined
      const [result, ip, done] = await Promise.all([
        blendingService.getAll({ page, pageSize, status: filterStatus, search }),
        blendingService.getAll({ page: 1, pageSize: 1, status: 'in_progress', search }),
        blendingService.getAll({ page: 1, pageSize: 1, status: 'completed', search }),
      ])
      if (my !== reqRef.current) return
      setOrders(result.data)
      setTotalOrders(result.total)
      setStatusCounts({ inProgress: ip.total, completed: done.total })
    } catch (err: any) {
      if (my !== reqRef.current) return
      console.error('Load blend list error:', err)
      setError(dichLoiHeThong(err, 'Không tải được danh sách lệnh phối trộn'))
    } finally {
      if (my === reqRef.current) setLoading(false)
    }
  }, [filterStatus, searchDebounced, page, pageSize])

  useEffect(() => {
    loadOrders()
  }, [loadOrders])

  // Summary stats (đếm server — xem statusCounts)
  const inProgress = statusCounts?.inProgress ?? 0
  const completed = statusCounts?.completed ?? 0

  // Table columns
  const columns = [
    {
      title: 'Mã lệnh',
      dataIndex: 'code',
      key: 'code',
      render: (code: string) => (
        <Text strong style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13 }}>
          {code}
        </Text>
      ),
    },
    {
      title: 'Grade mục tiêu',
      dataIndex: 'target_grade',
      key: 'target_grade',
      render: (v: string | null) => <GradeBadge grade={v} size="small" />,
    },
    {
      title: 'DRC mục tiêu',
      dataIndex: 'target_drc',
      key: 'target_drc',
      align: 'right' as const,
      render: (v: number) => (
        <Text style={{ fontFamily: "'JetBrains Mono', monospace" }}>
          {v ? `${v}%` : '—'}
        </Text>
      ),
    },
    {
      title: 'SL mục tiêu (kg)',
      dataIndex: 'target_quantity_kg',
      key: 'target_quantity_kg',
      align: 'right' as const,
      render: (v: number) => (
        <Text style={{ fontFamily: "'JetBrains Mono', monospace" }}>
          {fmtKg(v, 2)}
        </Text>
      ),
    },
    {
      title: 'DRC mô phỏng',
      dataIndex: 'simulated_drc',
      key: 'simulated_drc',
      align: 'right' as const,
      render: (v: number | null) => v != null ? (
        <Text style={{ fontFamily: "'JetBrains Mono', monospace", color: '#1B4D3E' }}>
          {v}%
        </Text>
      ) : '—',
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      render: (status: BlendStatus) => (
        <Tag color={BLEND_STATUS_COLORS[status] || 'default'}>
          {BLEND_STATUS_LABELS[status] || status}
        </Tag>
      ),
    },
    {
      title: 'Ngày',
      key: 'date',
      render: (_: any, r: BlendOrder) => (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {fmtDate(r.created_at)}
        </Text>
      ),
    },
  ]

  const statusOptions = [
    { value: 'all', label: 'Tất cả' },
    ...Object.entries(BLEND_STATUS_LABELS).map(([value, label]) => ({ value, label })),
  ]

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
        <Col>
          <Title level={4} style={{ margin: 0, color: '#1B4D3E' }}>
            <ExperimentOutlined style={{ marginRight: 8 }} />
            Lệnh phối trộn
          </Title>
        </Col>
        <Col>
          <Space>
            <Button icon={<BulbOutlined />} onClick={() => navigate('/wms/blending/suggest')}>
              Gợi ý phối trộn
            </Button>
            <Button icon={<ReloadOutlined />} onClick={loadOrders} loading={loading}>
              Làm mới
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => navigate('/wms/blending/new')}
            >
              Tạo lệnh trộn
            </Button>
          </Space>
        </Col>
      </Row>

      {/* Summary */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={8}>
          <Card styles={{ body: { padding: 12 } }}>
            <Statistic title="Tổng" value={totalOrders} valueStyle={{ fontSize: 20, fontFamily: "'JetBrains Mono'" }} />
          </Card>
        </Col>
        <Col xs={8}>
          <Card styles={{ body: { padding: 12 } }}>
            <Statistic title="Đang trộn" value={inProgress} valueStyle={{ fontSize: 20, color: '#1890ff' }} />
          </Card>
        </Col>
        <Col xs={8}>
          <Card styles={{ body: { padding: 12 } }}>
            <Statistic title="Hoàn thành" value={completed} valueStyle={{ fontSize: 20, color: '#16A34A' }} />
          </Card>
        </Col>
      </Row>

      {/* Filter + Table */}
      <Card
        styles={{ body: { padding: 0 } }}
        title={
          <Space>
            <Input.Search
              placeholder="Tìm mã lệnh..."
              value={searchText}
              onChange={e => { setSearchText(e.target.value); setPage(1) }}
              allowClear
              style={{ width: 250 }}
              size="small"
            />
            <Select
              value={filterStatus || 'all'}
              onChange={v => { setFilterStatus(v === 'all' ? undefined : v); setPage(1) }}
              size="small"
              style={{ width: 140 }}
              options={statusOptions}
            />
          </Space>
        }
      >
        {/* Lỗi tải → khối lỗi + Thử lại, không để bảng hiện "trống" giả */}
        {error ? (
          <PageState error={error} onRetry={loadOrders} />
        ) : (
        <Table
          dataSource={orders}
          columns={columns}
          rowKey="id"
          loading={loading}
          size="small"
          pagination={stdPagination(20, {
            current: page,
            pageSize,
            total: totalOrders,
            onChange: (p, ps) => { setPage(p); setPageSize(ps) },
          })}
          onRow={(record) => ({
            onClick: () => openTab({
              key: `blend-${record.id}`,
              title: `Lệnh trộn ${(record as any).code || record.id.slice(0, 8)}`,
              componentId: 'blend-detail',
              props: { id: record.id },
              path: `/wms/blending/${record.id}`,
            }),
            style: { cursor: 'pointer' },
          })}
        />
        )}
      </Card>
    </div>
  )
}

export default BlendListPage
