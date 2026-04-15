// ============================================================================
// FILE: src/pages/wms/weighbridge/WeighbridgeListPage.tsx
// MODULE: Kho Thành Phẩm (WMS) — Huy Anh Rubber ERP
// PHASE: P7 — Sprint 7C — Lịch sử can xe
// Rewrite: Tailwind -> Ant Design v6
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
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
  Spin,
  Row,
  Col,
  Statistic,
  DatePicker,
  Empty,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  ArrowLeftOutlined,
  ReloadOutlined,
  SearchOutlined,
  FilterOutlined,
  CarOutlined,
  CloseOutlined,
} from '@ant-design/icons'
import weighbridgeService from '../../../services/wms/weighbridgeService'
import { dealWmsService } from '../../../services/b2b/dealWmsService'
import type { ActiveDealForStockIn } from '../../../services/b2b/dealWmsService'
import type { WeighbridgeTicket, TicketType, WeighbridgeStatus, PaginatedResponse } from '../../../services/wms/wms.types'
import dayjs from 'dayjs'

const { Title, Text } = Typography

// ============================================================================
// CONSTANTS
// ============================================================================

const STATUS_TAG_CONFIG: Record<WeighbridgeStatus, { label: string; color: string }> = {
  weighing_gross: { label: 'Chờ cân L1', color: 'processing' },
  weighing_tare: { label: 'Chờ cân L2', color: 'warning' },
  completed: { label: 'Hoàn tất', color: 'success' },
  cancelled: { label: 'Đã hủy', color: 'error' },
}

const STATUS_OPTIONS = [
  { value: '', label: 'Tất cả' },
  { value: 'weighing_gross', label: 'Chờ cân L1' },
  { value: 'weighing_tare', label: 'Chờ cân L2' },
  { value: 'completed', label: 'Hoàn tất' },
  { value: 'cancelled', label: 'Đã hủy' },
]

const TYPE_OPTIONS = [
  { value: '', label: 'Tất cả' },
  { value: 'in', label: 'Xe vào' },
  { value: 'out', label: 'Xe ra' },
]

const MONO_FONT: React.CSSProperties = { fontFamily: "'JetBrains Mono', monospace" }
const PRIMARY_COLOR = '#1B4D3E'

// ============================================================================
// COMPONENT
// ============================================================================

export default function WeighbridgeListPage() {
  const navigate = useNavigate()
  const openTab = useOpenTab()

  // State
  const [data, setData] = useState<PaginatedResponse<WeighbridgeTicket> | null>(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const pageSize = 15

  // Filters
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  // Phase 4: Deal filter
  const [dealFilter, setDealFilter] = useState('')
  const [activeDeals, setActiveDeals] = useState<ActiveDealForStockIn[]>([])
  const [dealStockInIds, setDealStockInIds] = useState<string[] | null>(null)

  // Stats
  const [stats, setStats] = useState<{
    totalTickets: number
    completedToday: number
    inProgress: number
    totalNetWeight: number
  } | null>(null)

  // Phase 4: Load active deals for filter dropdown
  useEffect(() => {
    dealWmsService.getActiveDealsForStockIn().then(setActiveDeals).catch(() => {})
  }, [])

  // Phase 4: When deal filter changes, resolve stock_in_ids
  useEffect(() => {
    if (!dealFilter) {
      setDealStockInIds(null)
      return
    }
    const resolve = async () => {
      const stockIns = await dealWmsService.getStockInsByDeal(dealFilter)
      setDealStockInIds(stockIns.map(si => si.stock_in_id))
    }
    resolve().catch(() => setDealStockInIds([]))
  }, [dealFilter])

  // ============================================================================
  // DATA LOADING
  // ============================================================================

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const result = await weighbridgeService.getAll({
        page,
        pageSize,
        search: search || undefined,
        status: statusFilter || undefined,
        type: typeFilter || undefined,
        from_date: fromDate || undefined,
        to_date: toDate || undefined,
        ticket_type: (typeFilter as TicketType) || undefined,
      })
      setData(result)
    } catch (err) {
      console.error('Load weighbridge list error:', err)
    } finally {
      setLoading(false)
    }
  }, [page, search, statusFilter, typeFilter, fromDate, toDate])

  const loadStats = useCallback(async () => {
    try {
      const s = await weighbridgeService.getStats()
      setStats(s)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    loadStats()
  }, [])

  function handleSearch() {
    setPage(1)
    loadData()
  }

  function clearFilters() {
    setSearch('')
    setStatusFilter('')
    setTypeFilter('')
    setDealFilter('')
    setFromDate('')
    setToDate('')
    setPage(1)
  }

  const hasFilters = !!(search || statusFilter || typeFilter || dealFilter || fromDate || toDate)

  // ============================================================================
  // TABLE COLUMNS
  // ============================================================================

  // Filter data by deal if needed
  const filteredData = dealStockInIds
    ? data?.data.filter(t => t.reference_type === 'stock_in' && dealStockInIds.includes(t.reference_id || ''))
    : data?.data

  const columns: ColumnsType<WeighbridgeTicket> = [
    {
      title: 'Biển số',
      dataIndex: 'vehicle_plate',
      key: 'vehicle_plate',
      width: 130,
      render: (plate: string, record) => (
        <div>
          <Text strong style={{ fontSize: 14 }}>{plate}</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 12 }}>{record.code}</Text>
        </div>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status: WeighbridgeStatus) => {
        const cfg = STATUS_TAG_CONFIG[status]
        return <Tag color={cfg.color}>{cfg.label}</Tag>
      },
    },
    {
      title: 'Loại',
      dataIndex: 'ticket_type',
      key: 'ticket_type',
      width: 80,
      render: (type: TicketType) => (
        <Tag>{type === 'in' ? '📥 Vào' : '📤 Ra'}</Tag>
      ),
    },
    {
      title: 'Tài xế',
      dataIndex: 'driver_name',
      key: 'driver_name',
      width: 120,
      ellipsis: true,
      render: (name: string | undefined) => name || <Text type="secondary">—</Text>,
    },
    {
      title: 'Gross (kg)',
      dataIndex: 'gross_weight',
      key: 'gross_weight',
      width: 110,
      align: 'right',
      render: (w: number | null) => w != null
        ? <Text style={MONO_FONT}>{w.toLocaleString()}</Text>
        : <Text type="secondary">—</Text>,
    },
    {
      title: 'Tare (kg)',
      dataIndex: 'tare_weight',
      key: 'tare_weight',
      width: 110,
      align: 'right',
      render: (w: number | null) => w != null
        ? <Text style={MONO_FONT}>{w.toLocaleString()}</Text>
        : <Text type="secondary">—</Text>,
    },
    {
      title: 'NET (kg)',
      dataIndex: 'net_weight',
      key: 'net_weight',
      width: 120,
      align: 'right',
      render: (w: number | null) => w != null
        ? <Text strong style={{ ...MONO_FONT, color: '#15803D' }}>{w.toLocaleString()}</Text>
        : <Text type="secondary">—</Text>,
    },
    {
      title: 'Ngày tạo',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 140,
      render: (d: string) => (
        <div>
          <Text style={{ fontSize: 12 }}>{new Date(d).toLocaleDateString('vi-VN')}</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 12 }}>
            {new Date(d).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </div>
      ),
    },
  ]

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f5' }}>
      {/* Header */}
      <div style={{ background: PRIMARY_COLOR, padding: '16px', position: 'sticky', top: 0, zIndex: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/wms/weighbridge')}
            style={{ color: '#fff' }}
          />
          <div style={{ flex: 1 }}>
            <Title level={5} style={{ color: '#fff', margin: 0 }}>Lịch sử cân xe</Title>
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>
              {data ? `${data.total} phiếu` : 'Đang tải...'}
            </Text>
          </div>
          <Button
            type="text"
            icon={<ReloadOutlined spin={loading} />}
            onClick={() => { loadData(); loadStats() }}
            style={{ color: '#fff' }}
          />
        </div>
      </div>

      <div style={{ maxWidth: 960, margin: '0 auto', padding: '16px' }}>
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          {/* Stats cards */}
          {stats && (
            <Row gutter={[8, 8]}>
              <Col xs={12} sm={6}>
                <Card size="small" style={{ borderRadius: 12, textAlign: 'center' }}>
                  <Statistic
                    title={<Text type="secondary" style={{ fontSize: 11 }}>Đang cân</Text>}
                    value={stats.inProgress}
                    valueStyle={{ fontSize: 20, fontWeight: 700 }}
                  />
                </Card>
              </Col>
              <Col xs={12} sm={6}>
                <Card size="small" style={{ borderRadius: 12, textAlign: 'center' }}>
                  <Statistic
                    title={<Text type="secondary" style={{ fontSize: 11 }}>Hôm nay</Text>}
                    value={stats.completedToday}
                    valueStyle={{ fontSize: 20, fontWeight: 700, color: '#16A34A' }}
                  />
                </Card>
              </Col>
              <Col xs={12} sm={6}>
                <Card size="small" style={{ borderRadius: 12, textAlign: 'center' }}>
                  <Statistic
                    title={<Text type="secondary" style={{ fontSize: 11 }}>Tổng phiếu</Text>}
                    value={stats.totalTickets}
                    valueStyle={{ fontSize: 20, fontWeight: 700, color: '#2563EB' }}
                  />
                </Card>
              </Col>
              <Col xs={12} sm={6}>
                <Card size="small" style={{ borderRadius: 12, textAlign: 'center' }}>
                  <Statistic
                    title={<Text type="secondary" style={{ fontSize: 11 }}>Tấn nay</Text>}
                    value={stats.totalNetWeight >= 1000 ? stats.totalNetWeight / 1000 : stats.totalNetWeight}
                    precision={stats.totalNetWeight >= 1000 ? 1 : 0}
                    suffix={stats.totalNetWeight >= 1000 ? 't' : 'kg'}
                    valueStyle={{ fontSize: 20, fontWeight: 700, color: PRIMARY_COLOR, ...MONO_FONT }}
                  />
                </Card>
              </Col>
            </Row>
          )}

          {/* Search & Filter */}
          <Card size="small" style={{ borderRadius: 12 }}>
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <Input.Search
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onSearch={handleSearch}
                  placeholder="Tìm mã phiếu, biển số, tài xế..."
                  allowClear
                  size="large"
                  style={{ flex: 1 }}
                />
                <Button
                  size="large"
                  icon={<FilterOutlined />}
                  type={hasFilters ? 'primary' : 'default'}
                  onClick={() => setShowFilters(!showFilters)}
                  style={hasFilters ? { background: PRIMARY_COLOR, borderColor: PRIMARY_COLOR } : {}}
                >
                  Lọc
                </Button>
              </div>

              {/* Filter panel */}
              {showFilters && (
                <div>
                  <Row gutter={[12, 12]}>
                    <Col xs={12} sm={6}>
                      <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Trạng thái</Text>
                      <Select
                        value={statusFilter}
                        onChange={(v) => { setStatusFilter(v); setPage(1) }}
                        options={STATUS_OPTIONS}
                        style={{ width: '100%' }}
                      />
                    </Col>
                    <Col xs={12} sm={6}>
                      <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Loại</Text>
                      <Select
                        value={typeFilter}
                        onChange={(v) => { setTypeFilter(v); setPage(1) }}
                        options={TYPE_OPTIONS}
                        style={{ width: '100%' }}
                      />
                    </Col>
                    <Col xs={12} sm={6}>
                      <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Từ ngày</Text>
                      <DatePicker
                        value={fromDate ? dayjs(fromDate) : null}
                        onChange={(d) => { setFromDate(d ? d.format('YYYY-MM-DD') : ''); setPage(1) }}
                        style={{ width: '100%' }}
                        placeholder="Từ ngày"
                      />
                    </Col>
                    <Col xs={12} sm={6}>
                      <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Đến ngày</Text>
                      <DatePicker
                        value={toDate ? dayjs(toDate) : null}
                        onChange={(d) => { setToDate(d ? d.format('YYYY-MM-DD') : ''); setPage(1) }}
                        style={{ width: '100%' }}
                        placeholder="Đến ngày"
                      />
                    </Col>
                  </Row>

                  {/* Phase 4: Deal filter */}
                  {activeDeals.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Deal B2B</Text>
                      <Select
                        value={dealFilter}
                        onChange={(v) => { setDealFilter(v); setPage(1) }}
                        style={{ width: '100%' }}
                        allowClear
                        placeholder="Tất cả"
                        options={[
                          { value: '', label: 'Tất cả' },
                          ...activeDeals.map(d => ({
                            value: d.id,
                            label: `${d.deal_number} — ${d.partner_name}`,
                          })),
                        ]}
                      />
                    </div>
                  )}

                  {hasFilters && (
                    <Button
                      type="link"
                      danger
                      icon={<CloseOutlined />}
                      onClick={clearFilters}
                      style={{ marginTop: 8, padding: 0 }}
                    >
                      Xóa bộ lọc
                    </Button>
                  )}
                </div>
              )}
            </Space>
          </Card>

          {/* Table */}
          <Card size="small" style={{ borderRadius: 12 }} styles={{ body: { padding: 0 } }}>
            <Table
              columns={columns}
              dataSource={filteredData || []}
              rowKey="id"
              loading={loading}
              size="middle"
              scroll={{ x: 900 }}
              locale={{
                emptyText: (
                  <Empty
                    image={<CarOutlined style={{ fontSize: 48, color: '#d9d9d9' }} />}
                    description={
                      <div>
                        <Text type="secondary" strong>Chưa có phiếu cân nào</Text>
                        <br />
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {hasFilters ? 'Thử thay đổi bộ lọc' : 'Bắt đầu bằng cách tạo phiếu cân mới'}
                        </Text>
                      </div>
                    }
                  />
                ),
              }}
              pagination={{
                current: page,
                pageSize,
                total: data?.total || 0,
                showSizeChanger: false,
                showTotal: (total) => <Text type="secondary">{total} phiếu</Text>,
                onChange: (p) => setPage(p),
              }}
              onRow={(record) => ({
                onClick: () => {
                  if (record.status === 'completed' || record.status === 'cancelled') {
                    openTab({
                      key: `weighbridge-${record.id}`,
                      title: `Phiếu cân ${(record as any).code || record.id.slice(0, 8)}`,
                      componentId: 'weighbridge-detail',
                      props: { id: record.id },
                      path: `/wms/weighbridge/${record.id}`,
                    })
                  } else {
                    navigate('/wms/weighbridge')
                  }
                },
                style: { cursor: 'pointer' },
              })}
            />
          </Card>
        </Space>
      </div>
    </div>
  )
}
