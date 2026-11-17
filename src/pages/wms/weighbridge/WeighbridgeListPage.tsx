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
  Result,
  message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  ArrowLeftOutlined,
  ReloadOutlined,
  SearchOutlined,
  FilterOutlined,
  CarOutlined,
  CloseOutlined,
  WarningOutlined,
  DownloadOutlined,
} from '@ant-design/icons'
import weighbridgeService from '../../../services/wms/weighbridgeService'
import { dealWmsService } from '../../../services/b2b/dealWmsService'
import FacilityPicker from '../../../components/wms/FacilityPicker'
import { useFacilityFilter } from '../../../stores/facilityFilterStore'
import { useDebounce } from '../../../hooks/useDebounce'
import type { ActiveDealForStockIn } from '../../../services/b2b/dealWmsService'
import type { WeighbridgeTicket, TicketType, WeighbridgeStatus, PaginatedResponse } from '../../../services/wms/wms.types'
import { ticketTypeLabel } from '../../../services/wms/wms.types'
import dayjs from 'dayjs'
import { B2BSectionTabs, INTAKE_TABS } from '../../../components/b2b/B2BSectionTabs'
import { useIsB2BPurchaser } from '../../../hooks/useIsB2BPurchaser'
import { dichLoiHeThong } from '../../../utils/dichLoiHeThong'
import { addDaysStr, todayVN } from '../../../utils/dateVN'
import { fmtDate, fmtNum, fmtTime } from '../../../utils/format'
import { LimitNotice } from '../../../components/common/tableDefaults'
import { WEIGHBRIDGE_STATUS_LABELS, WEIGHBRIDGE_STATUS_COLORS } from './weighbridgeLabels'
import { xuatExcelBaoCao } from '../reports/wmsReportExcel'

// Màu tag theo facility code — giống convention multi-facility các nơi khác
const FACILITY_TAG_COLOR: Record<string, string> = {
  PD: 'green',
  TL: 'blue',
  LAO: 'volcano',
}

const { Title, Text } = Typography

// ============================================================================
// CONSTANTS
// ============================================================================

// Một nguồn nhãn với Chi tiết phiếu cân (trước: sổ 'Chờ cân L1', chi tiết 'Chờ cân lần 1')
const STATUS_TAG_CONFIG: Record<WeighbridgeStatus, { label: string; color: string }> = Object.fromEntries(
  (Object.keys(WEIGHBRIDGE_STATUS_LABELS) as WeighbridgeStatus[]).map(s => [s, { label: WEIGHBRIDGE_STATUS_LABELS[s], color: WEIGHBRIDGE_STATUS_COLORS[s] }]),
) as Record<WeighbridgeStatus, { label: string; color: string }>

const STATUS_OPTIONS = [
  { value: '', label: 'Tất cả' },
  ...(Object.keys(WEIGHBRIDGE_STATUS_LABELS) as WeighbridgeStatus[]).map(s => ({ value: s, label: WEIGHBRIDGE_STATUS_LABELS[s] })),
]

/** Lọc theo Deal: phiếu khớp deal rải trên nhiều trang server → tải 1 cửa sổ N phiếu gần nhất
 *  (vẫn theo mọi bộ lọc khác) rồi lọc + phân trang tại client. Trước đây lọc trong 15 dòng của
 *  trang đang xem mà chân bảng vẫn báo tổng cũ → màn trống nhưng ghi "312 phiếu". */
const DEAL_WINDOW = 500
/** Xuất Excel: PostgREST trả tối đa 1.000 dòng/lần — vượt thì báo người dùng lọc thêm */
const EXPORT_LIMIT = 1000

const TYPE_OPTIONS = [
  { value: '', label: 'Tất cả' },
  { value: 'in', label: 'Xe vào' },
  { value: 'out', label: 'Xe ra' },
  { value: 'gate', label: 'Cổng' },
  { value: 'fetch', label: 'Đi lấy mủ' },
  { value: 'retail', label: 'Mủ lẻ' },
]

const MONO_FONT: React.CSSProperties = { fontFamily: "'JetBrains Mono', monospace" }
const PRIMARY_COLOR = '#1B4D3E'

// ============================================================================
// COMPONENT
// ============================================================================

export default function WeighbridgeListPage() {
  const navigate = useNavigate()
  const openTab = useOpenTab()
  const isB2BPurchaser = useIsB2BPurchaser()

  // State
  const [data, setData] = useState<PaginatedResponse<WeighbridgeTicket> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const pageSize = 15

  // Filters
  const [search, setSearch] = useState('')
  // Query chỉ bắn sau khi NGỪNG gõ 400ms — trước đây mỗi phím gõ 1 lượt getAll (audit 17/11/2026)
  const searchDebounced = useDebounce(search, 400)
  const [statusFilter, setStatusFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  // Máy tính trạm cân/kế toán: thanh lọc hiện sẵn (trước ẩn sau nút "Lọc" — ngày nào cũng phải mở)
  const [showFilters, setShowFilters] = useState(true)
  const [exporting, setExporting] = useState(false)

  // Phase 4: Deal filter
  const [dealFilter, setDealFilter] = useState('')
  const [activeDeals, setActiveDeals] = useState<ActiveDealForStockIn[]>([])
  const [dealStockInIds, setDealStockInIds] = useState<string[] | null>(null)

  // F2 multi-facility filter — đọc/ghi store dùng chung (nhớ lựa chọn qua màn, localStorage)
  const { currentFacilityId, setCurrentFacilityId } = useFacilityFilter()
  const facilityFilter = currentFacilityId ?? ''

  // Stats
  const [stats, setStats] = useState<{
    totalTickets: number
    completedToday: number
    inProgress: number
    totalNetWeight: number
  } | null>(null)
  const [facilityStats, setFacilityStats] = useState<Array<{
    facility_id: string | null
    facility_code: string
    facility_name: string
    completedToday: number
    inProgress: number
    totalNetWeight: number
  }>>([])

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

  // Đang lọc theo Deal → tải cửa sổ DEAL_WINDOW phiếu (trang 1) rồi lọc/phân trang client
  const dealMode = dealStockInIds !== null
  const serverPage = dealMode ? 1 : page
  const serverPageSize = dealMode ? DEAL_WINDOW : pageSize

  // Bộ lọc server hiện tại — dùng chung cho bảng và Xuất Excel
  const buildFilter = useCallback(() => ({
    search: searchDebounced || undefined,
    status: statusFilter || undefined,
    type: typeFilter || undefined,
    from_date: fromDate || undefined,
    to_date: toDate || undefined,
    ticket_type: (typeFilter as TicketType) || undefined,
    facility_id: facilityFilter || undefined,
  }), [searchDebounced, statusFilter, typeFilter, fromDate, toDate, facilityFilter])

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await weighbridgeService.getAll({
        page: serverPage,
        pageSize: serverPageSize,
        ...buildFilter(),
      })
      setData(result)
    } catch (err: any) {
      console.error('Load weighbridge list error:', err)
      setError(dichLoiHeThong(err, 'Không tải được danh sách phiếu cân'))
    } finally {
      setLoading(false)
    }
  }, [serverPage, serverPageSize, buildFilter])

  const loadStats = useCallback(async () => {
    try {
      const [s, byFacility] = await Promise.all([
        weighbridgeService.getStats(undefined, undefined, facilityFilter || undefined),
        weighbridgeService.getStatsByFacility(),
      ])
      setStats(s)
      setFacilityStats(byFacility)
    } catch { /* ignore */ }
  }, [facilityFilter])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    loadStats()
  }, [loadStats])

  function handleSearch() {
    // Effect [loadData] tự chạy khi page / searchDebounced đổi; chỉ gọi tay khi chắc
    // chắn không có gì sắp đổi (Enter để tìm lại y nguyên) — hết gọi đôi mỗi lần Enter.
    setPage(1)
    if (page === 1 && search === searchDebounced) loadData()
  }

  // Chip ngày nhanh — việc "xem phiếu hôm nay / 7 ngày" mỗi sáng
  function setQuickRange(days: 0 | 6) {
    const today = todayVN()
    setFromDate(days === 0 ? today : addDaysStr(today, -days))
    setToDate(today)
    setPage(1)
  }

  function clearFilters() {
    setSearch('')
    setStatusFilter('')
    setTypeFilter('')
    setDealFilter('')
    setCurrentFacilityId(undefined)
    setFromDate('')
    setToDate('')
    setPage(1)
  }

  const hasFilters = !!(search || statusFilter || typeFilter || dealFilter || facilityFilter || fromDate || toDate)

  // ============================================================================
  // TABLE COLUMNS
  // ============================================================================

  // Lọc theo Deal (client, trên cửa sổ DEAL_WINDOW phiếu — xem dealMode ở trên)
  const filteredData = dealStockInIds
    ? data?.data.filter(t => t.reference_type === 'stock_in' && dealStockInIds.includes(t.reference_id || ''))
    : data?.data
  const shownTotal = dealMode ? (filteredData?.length || 0) : (data?.total || 0)

  // Xuất Excel theo ĐÚNG bộ lọc đang chọn (không chỉ 15 dòng của trang)
  async function handleExportExcel() {
    setExporting(true)
    try {
      const res = await weighbridgeService.getAll({ page: 1, pageSize: EXPORT_LIMIT, ...buildFilter() })
      const rows = dealStockInIds
        ? res.data.filter(t => t.reference_type === 'stock_in' && dealStockInIds.includes(t.reference_id || ''))
        : res.data
      await xuatExcelBaoCao('lich-su-can-xe', [{
        name: 'Phiếu cân',
        title: 'Lịch sử cân xe',
        columns: [
          { title: 'Mã phiếu', align: 'left' },
          { title: 'Nhà máy' },
          { title: 'Biển số', align: 'left' },
          { title: 'Tài xế', align: 'left' },
          { title: 'Loại' },
          { title: 'Trạng thái' },
          { title: 'Xe + hàng (kg)', summary: 'sum' },
          { title: 'Xe rỗng (kg)', summary: 'sum' },
          { title: 'KL hàng (kg)', summary: 'sum' },
          { title: 'Ngày tạo' },
          { title: 'Giờ' },
        ],
        rows: rows.map(t => [
          t.code,
          t.facility?.code || '',
          t.vehicle_plate,
          t.driver_name || '',
          ticketTypeLabel(t.ticket_type, 'short'),
          WEIGHBRIDGE_STATUS_LABELS[t.status] || t.status,
          t.gross_weight ?? '',
          t.tare_weight ?? '',
          t.net_weight ?? '',
          fmtDate(t.created_at),
          fmtTime(t.created_at),
        ]),
      }])
      if (res.total > res.data.length) {
        message.warning(`Chỉ xuất ${fmtNum(res.data.length)} / ${fmtNum(res.total)} phiếu gần nhất — lọc theo ngày để xuất đủ`)
      }
    } catch (err) {
      message.error(dichLoiHeThong(err, 'Xuất Excel thất bại'))
    } finally {
      setExporting(false)
    }
  }

  const columns: ColumnsType<WeighbridgeTicket> = [
    {
      title: 'NM',
      dataIndex: 'facility',
      key: 'facility',
      width: 70,
      render: (_: any, record) => {
        const code = record.facility?.code || (record.facility_id ? '—' : '?')
        const color = FACILITY_TAG_COLOR[code] || 'default'
        return <Tag color={color} style={{ fontWeight: 600, margin: 0 }}>{code}</Tag>
      },
    },
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
        const cfg = STATUS_TAG_CONFIG[status] || { label: status || '—', color: 'default' }
        return <Tag color={cfg.color}>{cfg.label}</Tag>
      },
    },
    {
      title: 'Loại',
      dataIndex: 'ticket_type',
      key: 'ticket_type',
      width: 80,
      render: (type: TicketType) => (
        <Tag>{ticketTypeLabel(type, 'short')}</Tag>
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
      // Nhãn tiếng Việt khớp app cân + phiếu in (trước: Gross / Tare / NET)
      title: 'Xe + hàng (kg)',
      dataIndex: 'gross_weight',
      key: 'gross_weight',
      width: 120,
      align: 'right',
      render: (w: number | null) => w != null
        ? <Text style={MONO_FONT}>{w.toLocaleString('vi-VN')}</Text>
        : <Text type="secondary">—</Text>,
    },
    {
      title: 'Xe rỗng (kg)',
      dataIndex: 'tare_weight',
      key: 'tare_weight',
      width: 110,
      align: 'right',
      render: (w: number | null) => w != null
        ? <Text style={MONO_FONT}>{w.toLocaleString('vi-VN')}</Text>
        : <Text type="secondary">—</Text>,
    },
    {
      title: 'KL hàng (kg)',
      dataIndex: 'net_weight',
      key: 'net_weight',
      width: 120,
      align: 'right',
      render: (w: number | null) => w != null
        ? <Text strong style={{ ...MONO_FONT, color: '#15803D' }}>{w.toLocaleString('vi-VN')}</Text>
        : <Text type="secondary">—</Text>,
    },
    {
      title: 'Ngày tạo',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 140,
      render: (d: string) => (
        <div>
          <Text style={{ fontSize: 12 }}>{fmtDate(d)}</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 12 }}>
            {fmtTime(d)}
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
        {/* (Đã bỏ nút ← trỏ về /wms/weighbridge — chính là trang này từ khi cân chuyển sang app Trạm cân) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <Title level={5} style={{ color: '#fff', margin: 0 }}>Lịch sử cân xe</Title>
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>
              {data ? `${fmtNum(shownTotal)} phiếu` : 'Đang tải...'}
            </Text>
          </div>
          <Button
            icon={<DownloadOutlined />}
            onClick={handleExportExcel}
            loading={exporting}
            disabled={!!error}
            ghost
          >
            Xuất Excel
          </Button>
          <Button
            type="text"
            icon={<ReloadOutlined spin={loading} />}
            onClick={() => { loadData(); loadStats() }}
            style={{ color: '#fff' }}
            title="Tải lại"
          />
        </div>
      </div>

      <div style={{ padding: '16px 24px' }}>
        {/* B2B Section Tabs — chỉ render cho B2B Thu Mua */}
        {isB2BPurchaser && (
          <B2BSectionTabs tabs={INTAKE_TABS} active="weighbridge" />
        )}
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
                    suffix={stats.totalNetWeight >= 1000 ? 't' : 'kg'}
                    // Số vi-VN (antd mặc định ngăn nghìn bằng dấu phẩy → "1,234.5" lệch cả hệ)
                    formatter={(v) => fmtNum(Number(v), stats.totalNetWeight >= 1000 ? 1 : 0)}
                    valueStyle={{ fontSize: 20, fontWeight: 700, color: PRIMARY_COLOR, ...MONO_FONT }}
                  />
                </Card>
              </Col>
            </Row>
          )}

          {/* F2 multi-facility — break-down hôm nay theo nhà máy */}
          {facilityStats.length > 0 && (
            <Card size="small" style={{ borderRadius: 12 }} title={
              <Space>
                <Text strong>Hôm nay theo nhà máy</Text>
                <Text type="secondary" style={{ fontSize: 12 }}>{dayjs().format('DD/MM/YYYY')}</Text>
              </Space>
            }>
              <Row gutter={[8, 8]}>
                {facilityStats.map(fs => {
                  const tons = fs.totalNetWeight / 1000
                  const isActive = facilityFilter === fs.facility_id
                  return (
                    <Col xs={12} sm={8} lg={6} key={fs.facility_id || 'null'}>
                      <Card
                        size="small"
                        hoverable
                        onClick={() => {
                          if (fs.facility_id) {
                            setCurrentFacilityId(isActive ? undefined : fs.facility_id)
                            setPage(1)
                          }
                        }}
                        style={{
                          borderRadius: 10,
                          cursor: fs.facility_id ? 'pointer' : 'default',
                          borderColor: isActive ? PRIMARY_COLOR : undefined,
                          borderWidth: isActive ? 2 : 1,
                          background: isActive ? '#F0F9F4' : '#fff',
                        }}
                      >
                        <Space direction="vertical" size={2} style={{ width: '100%' }}>
                          <Space>
                            <Tag
                              color={FACILITY_TAG_COLOR[fs.facility_code] || 'default'}
                              style={{ margin: 0, fontWeight: 600 }}
                            >
                              {fs.facility_code}
                            </Tag>
                            <Text style={{ fontSize: 12 }} ellipsis>{fs.facility_name}</Text>
                          </Space>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 4 }}>
                            <Text style={{ fontSize: 11, color: '#666' }}>Tấn nay</Text>
                            <Text strong style={{ ...MONO_FONT, fontSize: 16, color: PRIMARY_COLOR }}>
                              {tons >= 1 ? fmtNum(tons, 1) + 't' : fmtNum(fs.totalNetWeight) + 'kg'}
                            </Text>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#888' }}>
                            <span>{fs.completedToday} xe</span>
                            {fs.inProgress > 0 && <Tag color="processing" style={{ margin: 0, fontSize: 10 }}>{fs.inProgress} đang cân</Tag>}
                          </div>
                        </Space>
                      </Card>
                    </Col>
                  )
                })}
              </Row>
              <div style={{ marginTop: 8, fontSize: 11, color: '#999' }}>
                💡 Bấm thẻ để lọc danh sách theo nhà máy. Bấm lại để bỏ lọc.
              </div>
            </Card>
          )}

          {/* Search & Filter */}
          <Card size="small" style={{ borderRadius: 12 }}>
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <Input.Search
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1) }}
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
                      <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Nhà máy</Text>
                      <FacilityPicker
                        value={currentFacilityId}
                        onChange={(id) => { setCurrentFacilityId(id); setPage(1) }}
                        allowAll
                        style={{ width: '100%' }}
                      />
                    </Col>
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
                    <Col xs={24} sm={6}>
                      <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Nhanh</Text>
                      <Space size={6}>
                        <Button size="middle" onClick={() => setQuickRange(0)}>Hôm nay</Button>
                        <Button size="middle" onClick={() => setQuickRange(6)}>7 ngày</Button>
                      </Space>
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
            {error ? (
              <Result
                icon={<WarningOutlined style={{ color: '#ff4d4f' }} />}
                title="Không tải được danh sách phiếu cân"
                subTitle={error}
                extra={
                  <Button
                    type="primary"
                    icon={<ReloadOutlined />}
                    onClick={() => { loadData(); loadStats() }}
                    style={{ background: PRIMARY_COLOR, borderColor: PRIMARY_COLOR }}
                  >
                    Thử lại
                  </Button>
                }
              />
            ) : (
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
                        <Text type="secondary" strong>{hasFilters ? 'Không có phiếu cân khớp bộ lọc' : 'Chưa có phiếu cân nào'}</Text>
                        <br />
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {hasFilters ? 'Thử thay đổi bộ lọc' : 'Phiếu cân được tạo ở app Trạm cân (can.huyanhrubber.vn)'}
                        </Text>
                      </div>
                    }
                  />
                ),
              }}
              pagination={{
                current: page,
                pageSize,
                // Lọc Deal: phân trang client trên dòng đã lọc → tổng đúng với bảng
                total: shownTotal,
                showSizeChanger: false,
                showTotal: (total) => <Text type="secondary">{fmtNum(total)} phiếu</Text>,
                onChange: (p) => setPage(p),
              }}
              onRow={(record) => ({
                // Mọi trạng thái đều mở chi tiết. Trước đây phiếu đang cân điều hướng về
                // /wms/weighbridge — chính trang này (cân đã chuyển sang app Trạm cân) → bấm không có gì xảy ra.
                onClick: () => {
                  openTab({
                    key: `weighbridge-${record.id}`,
                    title: `Phiếu cân ${(record as any).code || record.id.slice(0, 8)}`,
                    componentId: 'weighbridge-detail',
                    props: { id: record.id },
                    path: `/wms/weighbridge/${record.id}`,
                  })
                },
                style: { cursor: 'pointer' },
              })}
            />
            )}
            {dealMode && !error && data && (
              <div style={{ padding: '0 12px' }}>
                <LimitNotice shown={data.data.length} limit={DEAL_WINDOW} what="phiếu" />
              </div>
            )}
          </Card>
        </Space>
      </div>
    </div>
  )
}
