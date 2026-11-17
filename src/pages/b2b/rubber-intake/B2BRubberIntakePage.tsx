// ============================================================================
// B2B RUBBER INTAKE PAGE — Lý lịch mủ tích hợp B2B Thu mua (Desktop-first)
// File: src/pages/b2b/rubber-intake/B2BRubberIntakePage.tsx
// ============================================================================

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Typography, Card, Input, Button, Tag, Table, Statistic, Row, Col, Space,
  Empty, Segmented, Modal, InputNumber, message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  ReloadOutlined, SearchOutlined, FileSearchOutlined, FireOutlined,
  ApartmentOutlined, FilterOutlined,
} from '@ant-design/icons'
import { Layers, Truck } from 'lucide-react'
import {
  rubberIntakeB2BService,
  type B2BRubberIntake,
  type RubberIntakeFilter,
  type RubberIntakeStats,
  SOURCE_LABELS, STATUS_LABELS,
} from '../../../services/b2b/rubberIntakeB2BService'
import { RAW_RUBBER_TYPE_LABELS, type RawRubberType } from '../../../services/b2b/intakeManualEntryService'
import { B2BSectionTabs, INTAKE_TABS } from '../../../components/b2b/B2BSectionTabs'
import FacilityPicker from '../../../components/wms/FacilityPicker'
import { useActiveFacilities } from '../../../hooks/useActiveFacilities'
import { useFacilityFilter } from '../../../stores/facilityFilterStore'
import { TIER_LABELS, TIER_COLORS, TIER_ICONS } from '../../../services/b2b/partnerService'
import { fmtDate, fmtVndCompact, fmtVndNum, vndInputProps } from '../../../utils/format'
import { dichLoiHeThong } from '../../../utils/dichLoiHeThong'
import { stdPagination, LimitNotice } from '../../../components/common/tableDefaults'

const { Title, Text } = Typography

// Sổ tải một cục tối đa N phiếu (pageSize gửi service) — chạm trần thì báo
const LOAD_LIMIT = 200

// Màu Tag antd theo trạng thái (STATUS_COLORS của service là class Tailwind, không dùng cho Tag được)
const STATUS_TAG_COLOR: Record<string, string> = {
  draft: 'default',
  confirmed: 'success',
  settled: 'blue',
  cancelled: 'error',
}

const FACILITY_COLOR: Record<string, string> = {
  PD: 'green',
  TL: 'blue',
  LAO: 'volcano',
}

// Tấn 3 số lẻ CỐ ĐỊNH (cột monospace thẳng hàng) theo vi-VN — "12,345" chứ không "12.345" (dấu chấm
// ở VN là ngăn nghìn → đọc nhầm 12 nghìn tấn). format.ts chưa có tuỳ chọn số lẻ cố định nên giữ cục bộ.
const fmtTan = (kg: number) => (kg / 1000).toLocaleString('vi-VN', { minimumFractionDigits: 3, maximumFractionDigits: 3 })

const RAW_ICON: Record<string, string> = {
  mu_nuoc: '💧',
  mu_tap: '🪨',
  mu_dong: '🧊',
  mu_chen: '🥣',
  mu_to: '📄',
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function B2BRubberIntakePage() {
  const navigate = useNavigate()
  const [items, setItems] = useState<B2BRubberIntake[]>([])
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState<RubberIntakeStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [search, setSearch] = useState('')
  // Từ khoá sau debounce 300ms — fetchData chỉ phụ thuộc giá trị này (trước đây phụ thuộc `search`
  // nên mỗi phím gõ tải 2 lần: ngay lập tức + 300ms sau)
  const [searchDebounced, setSearchDebounced] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [sourceFilter, setSourceFilter] = useState('')
  const [dealFilter, setDealFilter] = useState<'all' | 'linked' | 'standalone'>('all')
  const [priceFilter, setPriceFilter] = useState<'all' | 'unpriced'>('all')
  // Nhà máy: FacilityPicker persist — nhớ lựa chọn qua các sổ (store 'wms-facility-filter'), khởi tạo
  // từ store để lần tải đầu đã đúng nhà máy (audit 17/11/2026: thủ kho TL phải chọn lại mỗi màn)
  const { currentFacilityId } = useFacilityFilter()
  const [facilityFilter, setFacilityFilter] = useState<string>(currentFacilityId ?? '')
  const [rawTypeFilter, setRawTypeFilter] = useState<RawRubberType | ''>('')
  const { data: facilities = [] } = useActiveFacilities()
  // View mode
  const [viewMode, setViewMode] = useState<'list' | 'llm'>('list')
  const [llmExpanded, setLlmExpanded] = useState<Record<string, boolean>>({})
  // Bulk apply price (chốt giá cuối ngày cho phiếu bộc phát)
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([])
  const [applyOpen, setApplyOpen] = useState(false)
  const [applyPriceVal, setApplyPriceVal] = useState<number | null>(null)
  const [applying, setApplying] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    const filter: RubberIntakeFilter = {
      search: searchDebounced || undefined,
      status: statusFilter || undefined,
      source_type: sourceFilter || undefined,
      facility_id: facilityFilter || undefined,
      raw_rubber_type: rawTypeFilter || undefined,
      has_deal: dealFilter === 'linked' ? true : dealFilter === 'standalone' ? false : undefined,
      unpriced: priceFilter === 'unpriced' ? true : undefined,
      pageSize: LOAD_LIMIT,
    }
    try {
      const [result, statsResult] = await Promise.all([
        rubberIntakeB2BService.getAll(filter),
        rubberIntakeB2BService.getStats({
          facility_id: facilityFilter || undefined,
          raw_rubber_type: rawTypeFilter || undefined,
        }),
      ])
      setItems(result.data)
      setTotal(result.total)
      setStats(statsResult)
    } catch (e: any) {
      setError(dichLoiHeThong(e, 'Lỗi không xác định khi tải lý lịch mủ'))
      setItems([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [searchDebounced, statusFilter, sourceFilter, dealFilter, priceFilter, facilityFilter, rawTypeFilter])

  useEffect(() => { fetchData() }, [fetchData])

  // Debounce search — chỉ cập nhật từ khoá; việc tải do effect fetchData ở trên lo (một lượt)
  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search), 300)
    return () => clearTimeout(t)
  }, [search])

  // Tự áp giá từ Phiếu Chốt Giá (PCG) cho phiếu bộc phát chưa chốt — không phải nhập tay.
  async function handleAutoPcgPrice() {
    setApplying(true)
    try {
      const ids = selectedRowKeys.length ? selectedRowKeys : undefined
      const r = await rubberIntakeB2BService.autoApplyPcgPrice(ids)
      if (r.applied > 0) message.success(`Đã áp giá từ PCG cho ${r.applied} phiếu` + (r.noDrc ? ` · ${r.noDrc} phiếu mủ nước chờ DRC` : ''))
      else if (r.noPcg > 0) message.warning(`Không có PCG khớp (đại lý + nhà máy + ngày). ${r.noDrc ? `${r.noDrc} phiếu chờ DRC.` : ''}`)
      else message.info('Không có phiếu nào cần áp giá')
      setSelectedRowKeys([])
      fetchData()
    } catch (e: any) {
      message.error(dichLoiHeThong(e, 'Áp giá từ PCG thất bại'))
    } finally {
      setApplying(false)
    }
  }

  async function handleApplyPrice() {
    if (!applyPriceVal || applyPriceVal <= 0) { message.warning('Nhập đơn giá hợp lệ'); return }
    setApplying(true)
    try {
      await rubberIntakeB2BService.applyPrice(selectedRowKeys, applyPriceVal)
      message.success(`Đã chốt giá ${selectedRowKeys.length} phiếu`)
      setApplyOpen(false)
      setSelectedRowKeys([])
      setApplyPriceVal(null)
      fetchData()
    } catch (e: any) {
      message.error(dichLoiHeThong(e, 'Chốt giá thất bại'))
    } finally {
      setApplying(false)
    }
  }

  // ── Columns ──
  const columns: ColumnsType<B2BRubberIntake> = useMemo(() => [
    {
      title: 'Ngày',
      dataIndex: 'intake_date',
      width: 100,
      render: (d: string) => (
        <span style={{ fontFamily: 'monospace' }}>
          {fmtDate(d)}
        </span>
      ),
      sorter: (a, b) => new Date(a.intake_date).getTime() - new Date(b.intake_date).getTime(),
      defaultSortOrder: 'descend',
    },
    {
      title: 'PNK',
      dataIndex: 'pnk_number',
      width: 70,
      align: 'center',
      render: (v) => v != null ? <Tag color="orange">#{v}</Tag> : <Text type="secondary">—</Text>,
    },
    {
      title: 'NM',
      dataIndex: 'facility',
      width: 56,
      align: 'center',
      render: (_, r) => r.facility ? <Tag color={FACILITY_COLOR[r.facility.code] || 'default'} style={{ margin: 0 }}>{r.facility.code}</Tag> : <Text type="secondary">—</Text>,
    },
    {
      title: 'Đại lý',
      width: 220,
      render: (_, r) => {
        if (r.partner) {
          return (
            <div>
              <div style={{ fontWeight: 600 }}>{r.partner.name}</div>
              <Text type="secondary" style={{ fontSize: 11 }}>{r.partner.code}</Text>
              {r.partner.tier && (() => {
                // Hạng đại lý: nhãn tiếng Việt + màu từ map chung (trước in mã thô 'diamond')
                const t = r.partner.tier as keyof typeof TIER_LABELS
                return (
                  <Tag style={{ marginLeft: 6, fontSize: 10 }} color={TIER_COLORS[t] || 'default'}>
                    {TIER_ICONS[t] || ''} {TIER_LABELS[t] || r.partner.tier}
                  </Tag>
                )
              })()}
            </div>
          )
        }
        if (r.supplier) {
          return (
            <div>
              <div>{r.supplier.name}</div>
              <Text type="secondary" style={{ fontSize: 11 }}>{r.supplier.code}</Text>
            </div>
          )
        }
        return <Text type="secondary">—</Text>
      },
    },
    {
      title: 'Loại mủ',
      dataIndex: 'raw_rubber_type',
      width: 110,
      render: (rt) => {
        if (!rt) return <Text type="secondary">—</Text>
        return (
          <Tag color={rt === 'mu_nuoc' ? 'blue' : 'orange'}>
            {RAW_ICON[rt] || ''} {RAW_RUBBER_TYPE_LABELS[rt as RawRubberType]}
          </Tag>
        )
      },
    },
    {
      title: 'Xe',
      dataIndex: 'vehicle_plate',
      width: 110,
      render: (v) => v ? (
        <span style={{ fontFamily: 'monospace', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <Truck size={12} /> {v}
        </span>
      ) : <Text type="secondary">—</Text>,
    },
    {
      title: 'ĐỐT',
      dataIndex: 'field_dot_reading',
      width: 70,
      align: 'right',
      render: (v) => v != null ? (
        <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#D97706' }}>
          <FireOutlined style={{ fontSize: 10, marginRight: 2 }} />{v}
        </span>
      ) : <Text type="secondary">—</Text>,
    },
    {
      title: 'DRC',
      dataIndex: 'drc_percent',
      width: 70,
      align: 'right',
      render: (v) => v != null ? (
        <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#15803D' }}>{v}%</span>
      ) : <Text type="secondary">—</Text>,
      sorter: (a, b) => (a.drc_percent || 0) - (b.drc_percent || 0),
    },
    {
      title: 'Net (T)',
      dataIndex: 'net_weight_kg',
      width: 90,
      align: 'right',
      render: (v) => v ? (
        <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{fmtTan(v)}</span>
      ) : <Text type="secondary">—</Text>,
      sorter: (a, b) => (a.net_weight_kg || 0) - (b.net_weight_kg || 0),
    },
    {
      title: 'Khô (T)',
      dataIndex: 'dry_weight_kg',
      width: 90,
      align: 'right',
      render: (v, r) => {
        const dry = v ?? (r.drc_percent != null && r.net_weight_kg ? r.net_weight_kg * r.drc_percent / 100 : null)
        if (dry == null) return <Text type="secondary">—</Text>
        return <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#0F766E' }}>{fmtTan(dry)}</span>
      },
      sorter: (a, b) => (a.dry_weight_kg || 0) - (b.dry_weight_kg || 0),
    },
    {
      title: 'Mã LLM',
      dataIndex: 'consolidation_code',
      width: 140,
      render: (v) => v ? (
        <Tag color="purple" style={{ fontSize: 11 }}>
          <Layers size={10} style={{ marginRight: 2, display: 'inline' }} /> {v}
        </Tag>
      ) : <Text type="secondary">—</Text>,
    },
    {
      title: 'Giá trị (₫)',
      dataIndex: 'total_amount',
      width: 120,
      align: 'right',
      render: (v, r) => {
        // Số ĐẦY ĐỦ (trước "12.3M" — chấm thập phân kiểu Mỹ + chữ M tiếng Anh)
        if (v) return <span style={{ fontFamily: 'monospace', color: '#92400E' }}>{fmtVndNum(v)}</span>
        if (!r.deal_id) return <Tag color="warning" style={{ margin: 0 }}>⏳ Chưa chốt giá</Tag>
        return <Text type="secondary">—</Text>
      },
      sorter: (a, b) => (a.total_amount || 0) - (b.total_amount || 0),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      width: 110,
      align: 'center',
      render: (s: string) => <Tag color={STATUS_TAG_COLOR[s] || 'default'}>{STATUS_LABELS[s] || s}</Tag>,
    },
  ], [])

  return (
    <div style={{ padding: 24 }}>
      {/* Section tabs */}
      <B2BSectionTabs tabs={INTAKE_TABS} active="intake-list" />

      {/* Header */}
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={3} style={{ margin: 0 }}>Nhập kho mủ</Title>
          <Text type="secondary">Lý lịch mủ chi tiết — gộp B2B Thu mua + đa nhà máy</Text>
        </Col>
        <Col>
          <Space>
            <Button type="primary" ghost loading={applying} onClick={handleAutoPcgPrice}
              title="Tự lấy giá từ Phiếu Chốt Giá khớp đại lý + nhà máy + ngày (không phải nhập tay)">
              💰 Áp giá từ PCG{selectedRowKeys.length ? ` (${selectedRowKeys.length})` : ''}
            </Button>
            <Button icon={<ReloadOutlined spin={loading} />} onClick={fetchData}>Làm mới</Button>
          </Space>
        </Col>
      </Row>

      {/* Stats */}
      {stats && (
        <Row gutter={12} style={{ marginBottom: 16 }}>
          <Col xs={12} sm={8} md={4}>
            <Card size="small" style={{ borderRadius: 12 }}>
              <Statistic title="Tổng phiếu" value={stats.total} valueStyle={{ fontSize: 22 }} />
            </Card>
          </Col>
          <Col xs={12} sm={8} md={4}>
            <Card size="small" style={{ borderRadius: 12 }}>
              <Statistic title="Liên kết Deal" value={stats.with_deal} valueStyle={{ color: '#1677ff', fontSize: 22 }} />
            </Card>
          </Col>
          <Col xs={12} sm={8} md={5}>
            <Card size="small" style={{ borderRadius: 12 }}>
              <Statistic title="KL tươi" value={stats.total_weight_kg / 1000} precision={1} suffix="T"
                groupSeparator="." decimalSeparator=","
                valueStyle={{ color: '#15803D', fontSize: 22 }} />
            </Card>
          </Col>
          <Col xs={12} sm={8} md={5}>
            <Card size="small" style={{ borderRadius: 12 }}>
              <Statistic title="KL khô" value={stats.total_dry_weight_kg / 1000} precision={1} suffix="T"
                groupSeparator="." decimalSeparator=","
                valueStyle={{ color: '#0F766E', fontSize: 22 }} />
            </Card>
          </Col>
          <Col xs={24} sm={16} md={6}>
            <Card size="small" style={{ borderRadius: 12 }}>
              <Statistic title="Giá trị" value={stats.total_amount} formatter={(v) => fmtVndCompact(Number(v))}
                valueStyle={{ color: '#D97706', fontSize: 22 }} />
            </Card>
          </Col>
        </Row>
      )}

      {/* Filters */}
      <Card size="small" style={{ borderRadius: 12, marginBottom: 12 }}
        title={<Space><FilterOutlined /><Text strong>Bộ lọc</Text></Space>}>
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Row gutter={12} align="middle">
            <Col flex="auto">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm mã lô, product code, invoice, biển xe, mã LLM..."
                prefix={<SearchOutlined />}
                allowClear
              />
            </Col>
            <Col>
              <Segmented<'list' | 'llm'>
                value={viewMode}
                onChange={(v) => setViewMode(v)}
                options={[
                  { label: <Space size={4}><FileSearchOutlined />Theo phiếu</Space>, value: 'list' },
                  { label: <Space size={4}><ApartmentOutlined />Theo LLM</Space>, value: 'llm' },
                ]}
              />
            </Col>
          </Row>

          {/* Facility + Raw type chips */}
          <Row gutter={12}>
            {facilities.length > 1 && (
              <Col flex="auto">
                <Space size={4} wrap>
                  <Text type="secondary" style={{ fontSize: 11 }}>NHÀ MÁY:</Text>
                  {/* FacilityPicker dùng chung: cache danh sách nhà máy + nhớ lựa chọn qua các sổ */}
                  <FacilityPicker
                    persist
                    size="small"
                    style={{ minWidth: 200 }}
                    onChange={(id) => setFacilityFilter(id ?? '')}
                  />
                </Space>
              </Col>
            )}
            <Col flex="auto">
              <Space size={4} wrap>
                <Text type="secondary" style={{ fontSize: 11 }}>LOẠI MỦ:</Text>
                <Tag.CheckableTag checked={rawTypeFilter === ''} onChange={() => setRawTypeFilter('')}>
                  Tất cả
                </Tag.CheckableTag>
                {(['mu_nuoc', 'mu_tap', 'mu_chen', 'mu_to'] as RawRubberType[]).map(rt => (
                  <Tag.CheckableTag
                    key={rt}
                    checked={rawTypeFilter === rt}
                    onChange={() => setRawTypeFilter(rawTypeFilter === rt ? '' : rt)}
                  >
                    {RAW_ICON[rt]} {RAW_RUBBER_TYPE_LABELS[rt]}
                  </Tag.CheckableTag>
                ))}
              </Space>
            </Col>
          </Row>

          {/* Status + Deal chips */}
          <Row gutter={12}>
            <Col>
              <Space size={4}>
                <Text type="secondary" style={{ fontSize: 11 }}>TT:</Text>
                {['', 'draft', 'confirmed', 'settled', 'cancelled'].map(s => (
                  <Tag.CheckableTag
                    key={s}
                    checked={statusFilter === s}
                    onChange={() => setStatusFilter(s)}
                  >
                    {s ? STATUS_LABELS[s] : 'Tất cả'}
                  </Tag.CheckableTag>
                ))}
              </Space>
            </Col>
            <Col>
              <Space size={4}>
                <Text type="secondary" style={{ fontSize: 11 }}>DEAL:</Text>
                {[
                  { key: 'all', label: 'Tất cả' },
                  { key: 'linked', label: '🔗 Có Deal' },
                  { key: 'standalone', label: '📦 Độc lập' },
                ].map(f => (
                  <Tag.CheckableTag
                    key={f.key}
                    checked={dealFilter === f.key}
                    onChange={() => setDealFilter(f.key as any)}
                  >
                    {f.label}
                  </Tag.CheckableTag>
                ))}
              </Space>
            </Col>
            <Col>
              <Space size={4}>
                <Text type="secondary" style={{ fontSize: 11 }}>GIÁ:</Text>
                {[
                  { key: 'all', label: 'Tất cả' },
                  { key: 'unpriced', label: '⏳ Chưa chốt giá' },
                ].map(f => (
                  <Tag.CheckableTag
                    key={f.key}
                    checked={priceFilter === f.key}
                    onChange={() => setPriceFilter(f.key as any)}
                  >
                    {f.label}
                  </Tag.CheckableTag>
                ))}
              </Space>
            </Col>
          </Row>
        </Space>
      </Card>

      {/* Error */}
      {error && (
        <Card style={{ marginBottom: 12, background: '#FEF2F2', borderColor: '#FECACA' }}>
          <Text type="danger" strong>Không tải được danh sách: </Text>
          <Text type="danger">{error}</Text>
          <Button size="small" icon={<ReloadOutlined />} onClick={fetchData} style={{ marginLeft: 8 }}>Thử lại</Button>
        </Card>
      )}

      <LimitNotice shown={items.length} limit={LOAD_LIMIT} what="phiếu" />

      {/* Body: list (Table) or grouped by LLM */}
      {viewMode === 'list' ? (
        <>
          {selectedRowKeys.length > 0 && (
            <div style={{ marginBottom: 8, padding: '8px 12px', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
              <Text strong>Đã chọn {selectedRowKeys.length} phiếu</Text>
              <Button type="primary" size="small" style={{ background: '#D97706', borderColor: '#D97706' }}
                onClick={() => { setApplyPriceVal(null); setApplyOpen(true) }}>
                Chốt giá hàng loạt
              </Button>
              <Button size="small" type="text" onClick={() => setSelectedRowKeys([])}>Bỏ chọn</Button>
            </div>
          )}
          <Card size="small" style={{ borderRadius: 12 }} styles={{ body: { padding: 0 } }}>
            <Table<B2BRubberIntake>
              dataSource={items}
              columns={columns}
              rowKey="id"
              loading={loading}
              size="small"
              rowSelection={{
                selectedRowKeys,
                onChange: (keys) => setSelectedRowKeys(keys as string[]),
                getCheckboxProps: (r) => ({ disabled: !!r.deal_id }), // chỉ chốt giá phiếu bộc phát (không thuộc deal)
              }}
              pagination={stdPagination(20)}
              scroll={{ x: 1500 }}
              onRow={(record) => ({
                onClick: () => navigate(`/b2b/rubber-intake/${record.id}`),
                style: { cursor: 'pointer' },
              })}
              locale={{
                emptyText: (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    // Lỗi tải ≠ trống: khi lỗi, khối đỏ phía trên đã báo — ở đây không nói "chưa có"
                    description={error ? 'Không tải được danh sách — xem thông báo lỗi phía trên' : 'Chưa có lý lịch mủ — tự tạo khi chấp nhận báo giá lô hoặc khi cân xong'}
                  />
                ),
              }}
            />
          </Card>
        </>
      ) : (
        <LlmGroupView
          items={items}
          expanded={llmExpanded}
          onToggle={(code) => setLlmExpanded(prev => ({ ...prev, [code]: !prev[code] }))}
          onClickItem={(id) => navigate(`/b2b/rubber-intake/${id}`)}
        />
      )}

      {/* Chốt giá hàng loạt cho phiếu bộc phát chưa chốt */}
      <Modal
        title="Chốt giá hàng loạt"
        open={applyOpen}
        onOk={handleApplyPrice}
        confirmLoading={applying}
        onCancel={() => setApplyOpen(false)}
        okText="Áp giá"
        cancelText="Huỷ"
      >
        <p style={{ color: '#64748B', fontSize: 13 }}>
          Áp <strong>1 đơn giá</strong> cho <strong>{selectedRowKeys.length}</strong> phiếu đã chọn.
          Thành tiền = KL khô × đơn giá (làm tròn nghìn). Phiếu draft sẽ chuyển sang <strong>Đã xác nhận</strong> và được cấp số PNK.
        </p>
        <Space align="center">
          <Text>Đơn giá (₫/kg khô):</Text>
          <InputNumber
            autoFocus
            value={applyPriceVal}
            onChange={(v) => setApplyPriceVal(v)}
            min={0}
            step={500}
            style={{ width: 200 }}
            {...vndInputProps}
          />
        </Space>
      </Modal>
    </div>
  )
}

// ============================================================================
// LLM GROUP VIEW — Tab "Theo LLM" gộp xe theo consolidation_code (giữ nguyên)
// ============================================================================

function LlmGroupView({
  items,
  expanded,
  onToggle,
  onClickItem,
}: {
  items: B2BRubberIntake[]
  expanded: Record<string, boolean>
  onToggle: (code: string) => void
  onClickItem: (id: string) => void
}) {
  const groups = new Map<string, B2BRubberIntake[]>()
  for (const item of items) {
    const code = item.consolidation_code || '__none__'
    if (!groups.has(code)) groups.set(code, [])
    groups.get(code)!.push(item)
  }
  const sortedKeys = [...groups.keys()].sort((a, b) => {
    if (a === '__none__') return 1
    if (b === '__none__') return -1
    return a.localeCompare(b)
  })

  if (sortedKeys.length === 0) {
    return (
      <Card style={{ borderRadius: 12, textAlign: 'center', padding: 48 }}>
        <Empty description="Chưa có mã LLM gộp xe" />
      </Card>
    )
  }

  return (
    <Space direction="vertical" size={8} style={{ width: '100%' }}>
      <Text type="secondary" style={{ fontSize: 12 }}>
        {groups.size} nhóm LLM • {items.length} phiếu
      </Text>
      {sortedKeys.map(code => {
        const groupItems = groups.get(code)!
        const isNone = code === '__none__'
        const totalNet = groupItems.reduce((s, x) => s + (x.net_weight_kg || 0), 0)
        const totalDry = groupItems.reduce((s, x) => s + (x.dry_weight_kg || 0), 0)
        const totalAmount = groupItems.reduce((s, x) => s + (x.total_amount || 0), 0)
        const isOpen = !!expanded[code]
        const partnerNames = [...new Set(groupItems.map(x => x.partner?.name).filter(Boolean))]

        return (
          <Card
            key={code}
            size="small"
            style={{ borderRadius: 12, cursor: 'pointer' }}
            styles={{ body: { padding: 0 } }}
          >
            <div
              onClick={() => onToggle(code)}
              style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <Space wrap size={6}>
                  {isNone ? (
                    <Text type="secondary" italic>Phiếu không gộp xe</Text>
                  ) : (
                    <Tag color="purple" style={{ margin: 0, fontWeight: 700 }}>
                      <Layers size={11} style={{ display: 'inline', marginRight: 4 }} /> {code}
                    </Tag>
                  )}
                  <Tag>{groupItems.length} phiếu</Tag>
                </Space>
                {partnerNames.length > 0 && (
                  <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
                    {partnerNames.slice(0, 3).join(', ')}{partnerNames.length > 3 ? ` +${partnerNames.length - 3}` : ''}
                  </div>
                )}
              </div>
              <Space size={16}>
                <Statistic title="Tươi" value={totalNet / 1000} precision={3} suffix="T"
                  groupSeparator="." decimalSeparator=","
                  valueStyle={{ fontSize: 14, color: '#15803D' }} />
                {totalDry > 0 && (
                  <Statistic title="Khô" value={totalDry / 1000} precision={3} suffix="T"
                    groupSeparator="." decimalSeparator=","
                    valueStyle={{ fontSize: 14, color: '#0F766E' }} />
                )}
                {totalAmount > 0 && (
                  <Statistic title="Giá trị" value={totalAmount} formatter={(v) => fmtVndCompact(Number(v))}
                    valueStyle={{ fontSize: 14, color: '#D97706' }} />
                )}
              </Space>
            </div>

            {isOpen && (
              <div style={{ borderTop: '1px solid #F1F5F9', padding: '8px 16px', background: '#FAFAFA' }}>
                {groupItems.map(item => (
                  <div
                    key={item.id}
                    onClick={(e) => { e.stopPropagation(); onClickItem(item.id) }}
                    style={{
                      padding: '8px 12px', background: '#fff', borderRadius: 6, marginBottom: 6,
                      display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
                    }}
                  >
                    <Space wrap size={6} style={{ flex: 1, minWidth: 0 }}>
                      {item.pnk_number != null && <Tag color="orange" style={{ margin: 0 }}>PNK #{item.pnk_number}</Tag>}
                      {item.vehicle_plate && (
                        <span style={{ fontSize: 12, fontFamily: 'monospace' }}>
                          <Truck size={10} style={{ display: 'inline', marginRight: 2 }} /> {item.vehicle_plate}
                        </span>
                      )}
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {fmtDate(item.intake_date)}
                      </Text>
                      {item.partner && <Text style={{ fontSize: 12, fontWeight: 600 }}>{item.partner.name}</Text>}
                    </Space>
                    <Space size={12}>
                      <span style={{ fontSize: 12, fontFamily: 'monospace' }}>
                        <strong>{fmtTan(item.net_weight_kg || 0)}</strong> T
                      </span>
                      {item.drc_percent != null && (
                        <span style={{ fontSize: 12, color: '#15803D', fontWeight: 600 }}>{item.drc_percent}%</span>
                      )}
                    </Space>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )
      })}
    </Space>
  )
}
