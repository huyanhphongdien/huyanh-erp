// ============================================================================
// PRODUCTION LIST PAGE — Ant Design
// File: src/pages/wms/production/ProductionListPage.tsx
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
  SearchOutlined,
} from '@ant-design/icons'
import productionService from '../../../services/wms/productionService'
import { useDebounce } from '../../../hooks/useDebounce'
import GradeBadge from '../../../components/wms/GradeBadge'
import PageState from '../../../components/common/PageState'
import { stdPagination } from '../../../components/common/tableDefaults'
import { dichLoiHeThong } from '../../../utils/dichLoiHeThong'
import { fmtDate, fmtKg, fmtPct } from '../../../utils/format'
import type { ProductionOrder, ProductionStatus } from '../../../services/wms/wms.types'
import {
  PRODUCTION_STATUS_LABELS,
  PRODUCTION_STATUS_COLORS,
  STAGE_NAMES,
} from '../../../services/wms/wms.types'

const { Title, Text } = Typography

// ============================================================================
// COMPONENT
// ============================================================================

const ProductionListPage = () => {
  const navigate = useNavigate()
  const openTab = useOpenTab()

  const [orders, setOrders] = useState<ProductionOrder[]>([])
  const [totalOrders, setTotalOrders] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchText, setSearchText] = useState('')
  const searchDebounced = useDebounce(searchText, 400) // gõ xong 400ms mới bắn query
  const [filterStatus, setFilterStatus] = useState<string | undefined>(undefined)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  // Thẻ "Tổng"/"Đang SX"/"Hoàn thành" đếm trên SERVER (mọi lệnh khớp ô tìm), không đếm 20 dòng của
  // trang đang xem — trước đây sang trang 2 là số đổi theo trang (audit 17/11/2026).
  // Cả 3 thẻ CÙNG một cơ sở: theo ô tìm, BỎ lọc trạng thái (trước đây "Tổng" lấy total của bảng nên
  // chọn lọc "Hoàn thành" thì Tổng = Hoàn thành, còn "Đang SX" vẫn đếm theo ô tìm).
  const [statusCounts, setStatusCounts] = useState<{ all: number; inProgress: number; completed: number } | null>(null)
  // Chỉ nhận kết quả của lần tải MỚI NHẤT — lần cũ về sau không được đè lên.
  const reqRef = useRef(0)

  // Load data
  const loadOrders = useCallback(async () => {
    const my = ++reqRef.current
    setLoading(true)
    setError(null)
    try {
      const search = searchDebounced.trim() || undefined
      const [result, all, ip, done] = await Promise.all([
        productionService.getAll({ page, pageSize, status: filterStatus, search }),
        // Đang lọc trạng thái → đếm riêng tổng theo ô tìm; không lọc thì total của bảng chính là số đó
        filterStatus ? productionService.getAll({ page: 1, pageSize: 1, search }) : null,
        productionService.getAll({ page: 1, pageSize: 1, status: 'in_progress', search }),
        productionService.getAll({ page: 1, pageSize: 1, status: 'completed', search }),
      ])
      if (my !== reqRef.current) return
      setOrders(result.data)
      setTotalOrders(result.total)
      setStatusCounts({ all: all ? all.total : result.total, inProgress: ip.total, completed: done.total })
    } catch (err: any) {
      if (my !== reqRef.current) return
      console.error('Load production list error:', err)
      setStatusCounts(null) // lỗi → thẻ hiện '—', không giữ số của lần tìm trước
      setError(dichLoiHeThong(err, 'Không tải được danh sách lệnh sản xuất'))
    } finally {
      if (my === reqRef.current) setLoading(false)
    }
  }, [filterStatus, searchDebounced, page, pageSize])

  useEffect(() => {
    loadOrders()
  }, [loadOrders])

  // Summary stats — Hiệu suất TB vẫn tính trên trang đang xem (service chưa có tổng hợp server), nên thẻ ghi rõ phạm vi.
  // Chưa có số (đang tải lần đầu / lỗi) → '—', không vẽ 0 như thật.
  const tongLenh: number | string = statusCounts?.all ?? '—'
  const inProgress: number | string = statusCounts?.inProgress ?? '—'
  const completed: number | string = statusCounts?.completed ?? '—'
  const yieldValues = orders.filter(o => o.yield_percent != null).map(o => o.yield_percent!)
  const avgYield = yieldValues.length > 0
    ? Math.round(yieldValues.reduce((s, v) => s + v, 0) / yieldValues.length * 10) / 10
    : 0

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
      title: 'Grade',
      dataIndex: 'target_grade',
      key: 'target_grade',
      render: (v: string | null) => <GradeBadge grade={v} size="small" />,
    },
    {
      title: 'SL mục tiêu (kg)',
      dataIndex: 'target_quantity',
      key: 'target_quantity',
      align: 'right' as const,
      render: (v: number) => (
        <Text style={{ fontFamily: "'JetBrains Mono', monospace" }}>
          {fmtKg(v, 2)}
        </Text>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      render: (status: ProductionStatus) => (
        <Tag color={PRODUCTION_STATUS_COLORS[status] || 'default'}>
          {PRODUCTION_STATUS_LABELS[status] || status}
        </Tag>
      ),
    },
    {
      title: 'Công đoạn',
      key: 'stage',
      render: (_: any, r: ProductionOrder) => {
        if (!r.stage_current) return <Text type="secondary">—</Text>
        return (
          <Tag color="blue">
            {r.stage_current}/5 · {STAGE_NAMES[r.stage_current] || ''}
          </Tag>
        )
      },
    },
    {
      // production_facilities = DÂY CHUYỀN sản xuất, không phải 3 nhà máy PĐ/TL/Lào (bảng facilities)
      title: 'Dây chuyền',
      key: 'facility',
      render: (_: any, r: ProductionOrder) => r.facility?.name || '—',
    },
    {
      title: 'Ngày',
      key: 'date',
      render: (_: any, r: ProductionOrder) => {
        const d = r.scheduled_start_date || r.created_at
        return (
          <Text type="secondary" style={{ fontSize: 12 }}>
            {fmtDate(d)}
          </Text>
        )
      },
    },
    {
      title: 'Hiệu suất %',
      dataIndex: 'yield_percent',
      key: 'yield_percent',
      align: 'right' as const,
      render: (v: number | null) => v != null ? (
        <Text style={{ fontFamily: "'JetBrains Mono', monospace", color: v >= 90 ? '#16A34A' : v >= 80 ? '#E8A838' : '#DC2626' }}>
          {fmtPct(v, 1)}
        </Text>
      ) : '—',
    },
  ]

  const statusOptions = [
    { value: 'all', label: 'Tất cả' },
    ...Object.entries(PRODUCTION_STATUS_LABELS).map(([value, label]) => ({ value, label })),
  ]

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
        <Col>
          <Title level={4} style={{ margin: 0, color: '#1B4D3E' }}>
            <ExperimentOutlined style={{ marginRight: 8 }} />
            Lệnh sản xuất
          </Title>
        </Col>
        <Col>
          <Space>
            <Button icon={<ReloadOutlined />} onClick={loadOrders} loading={loading}>
              Làm mới
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => navigate('/wms/production/new')}
            >
              Tạo lệnh SX
            </Button>
          </Space>
        </Col>
      </Row>

      {/* Summary */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={6}>
          <Card bodyStyle={{ padding: 12 }}>
            <Statistic title="Tổng" value={tongLenh} valueStyle={{ fontSize: 20, fontFamily: "'JetBrains Mono'" }} />
          </Card>
        </Col>
        <Col xs={6}>
          <Card bodyStyle={{ padding: 12 }}>
            <Statistic title="Đang SX" value={inProgress} valueStyle={{ fontSize: 20, color: '#1890ff' }} />
          </Card>
        </Col>
        <Col xs={6}>
          <Card bodyStyle={{ padding: 12 }}>
            <Statistic title="Hoàn thành" value={completed} valueStyle={{ fontSize: 20, color: '#16A34A' }} />
          </Card>
        </Col>
        <Col xs={6}>
          <Card bodyStyle={{ padding: 12 }}>
            <Statistic title="Hiệu suất TB (trang này)" value={avgYield} suffix="%" valueStyle={{ fontSize: 20, color: '#1B4D3E' }} />
          </Card>
        </Col>
      </Row>

      {/* Filter + Table */}
      <Card
        bodyStyle={{ padding: 0 }}
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
              key: `production-${record.id}`,
              title: `Lệnh SX ${(record as any).code || record.id.slice(0, 8)}`,
              componentId: 'production-detail',
              props: { id: record.id },
              path: `/wms/production/${record.id}`,
            }),
            style: { cursor: 'pointer' },
          })}
        />
        )}
      </Card>
    </div>
  )
}

export default ProductionListPage
