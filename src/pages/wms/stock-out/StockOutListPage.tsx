// ============================================================================
// STOCK OUT LIST PAGE — AdvancedDataTable (cùng khuôn Sổ nhập kho / Sổ chuyển kho)
// File: src/pages/wms/stock-out/StockOutListPage.tsx
// Đợt 3 audit UI (17/11/2026): bỏ bảng tự viết (tải cứng 100 phiếu rồi im lặng mất phiếu 101,
// KPI cộng trên dữ liệu cụt + không theo nhà máy, không Xuất Excel, lỗi tải hiện "chưa có phiếu")
// → AdvancedDataTable: lọc cột, khoảng ngày, Xuất Excel, khối lỗi + Thử lại, báo chạm trần tải.
// ============================================================================

import React, { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Tag, Typography, Button, Space, Card, Row, Col, Statistic } from 'antd'
import { PlusOutlined, ExportOutlined } from '@ant-design/icons'
import { supabase } from '../../../lib/supabase'
import AdvancedDataTable, { type ColumnDef } from '../../../components/common/AdvancedDataTable'
import { useOpenTab } from '../../../hooks/useOpenTab'
import { useFacilityFilter } from '../../../stores/facilityFilterStore'
import { useActiveWarehouses } from '../../../hooks/useActiveWarehouses'
import FacilityPicker from '../../../components/wms/FacilityPicker'
import GradeBadge from '../../../components/wms/GradeBadge'
import type { RubberGrade } from '../../../services/wms/wms.types'
import { RUBBER_GRADE_LABELS } from '../../../services/wms/wms.types'
import { fmtDate, fmtNum, fmtKg } from '../../../utils/format'
import {
  STOCK_OUT_STATUS_LABELS, STOCK_OUT_STATUS_COLORS,
  STOCK_OUT_REASON_LABELS, STOCK_OUT_REASON_COLORS,
} from './stockOutLabels'

const { Text } = Typography
const PRIMARY = '#1B4D3E'
const monoStyle: React.CSSProperties = { fontFamily: "'JetBrains Mono', monospace" }

/** Trần tải một lần. Chạm trần → AdvancedDataTable báo "đang hiện N phiếu gần nhất" (loadLimit). */
const LOAD_LIMIT = 500

// ============================================================================
// TYPES
// ============================================================================

interface WarehouseRef {
  id: string
  code: string
  name: string
}

interface StockOutOrder {
  id: string
  code: string
  type: string
  warehouse_id: string
  warehouse?: WarehouseRef
  reason: string
  customer_name?: string | null
  customer_order_ref?: string | null
  total_quantity?: number | null
  total_weight?: number | null
  status: 'draft' | 'picking' | 'picked' | 'confirmed' | 'cancelled'
  notes?: string | null
  created_by?: string | null
  confirmed_by?: string | null
  confirmed_at?: string | null
  created_at: string
  updated_at: string
  svr_grade?: RubberGrade | null
}

// ============================================================================
// CONSTANTS
// ============================================================================

const TYPE_LABELS: Record<string, string> = { raw: 'NVL', finished: 'TP' }
const TYPE_COLORS: Record<string, string> = { raw: 'orange', finished: 'green' }

// S3: Parse notes để detect phiếu xuất tự động sinh từ phiếu cân.
// Format: "Từ phiếu cân CX-YYYYMMDD-NNN · 51K-12345"
const extractWeighbridgeCode = (notes: string | null | undefined): string | null => {
  if (!notes) return null
  const match = notes.match(/phiếu cân\s+(CX-[\w-]+)/i)
  return match ? match[1] : null
}

const toOptions = (labels: Record<string, string>) =>
  Object.entries(labels).map(([value, label]) => ({ value, label }))

// ============================================================================
// COMPONENT
// ============================================================================

const StockOutListPage: React.FC = () => {
  const navigate = useNavigate()
  const openTab = useOpenTab()

  // F2: Facility filter (multi-facility) — đọc từ store global
  const { currentFacilityId, setCurrentFacilityId } = useFacilityFilter()
  const { data: warehouses = [] } = useActiveWarehouses()

  // Giữ select riêng của trang (có svr_grade — STOCK_OUT_LIST_SELECT của service chưa có cột này)
  const { data: orders = [], isLoading, error, refetch } = useQuery({
    queryKey: ['stock-out-orders-all'],
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from('stock_out_orders')
        .select(`
          id, code, type, warehouse_id,
          reason, customer_name, customer_order_ref,
          total_quantity, total_weight, status, notes,
          created_by, confirmed_by, confirmed_at,
          created_at, updated_at, svr_grade,
          warehouse:warehouses(id, code, name)
        `)
        .order('created_at', { ascending: false })
        .limit(LOAD_LIMIT)
      if (err) throw err
      return (data || []) as unknown as StockOutOrder[]
    },
    staleTime: 60000,
    // Bản cũ tải lại mỗi lần mở sổ — giữ hành vi đó: xác nhận/huỷ ở tab chi tiết xong quay lại là thấy ngay
    refetchOnMount: 'always',
  })

  // F2: Lọc theo nhà máy qua kho (warehouse_id → facility_id)
  const filteredOrders = useMemo(() => {
    if (!currentFacilityId) return orders
    const whIds = new Set(
      warehouses.filter(w => (w as any).facility_id === currentFacilityId).map(w => w.id),
    )
    return orders.filter(o => whIds.has(o.warehouse_id))
  }, [orders, currentFacilityId, warehouses])

  // KPI — tính trên dữ liệu ĐÃ lọc nhà máy (trước: cộng trên 100 phiếu thô, bỏ qua bộ lọc)
  const kpi = useMemo(() => {
    const confirmed = filteredOrders.filter(o => o.status === 'confirmed')
    return {
      total: filteredOrders.length,
      draft: filteredOrders.filter(o => o.status === 'draft').length,
      picking: filteredOrders.filter(o => o.status === 'picking' || o.status === 'picked').length,
      confirmed: confirmed.length,
      confirmedQty: confirmed.reduce((sum, o) => sum + (o.total_quantity || 0), 0),
      confirmedWeight: confirmed.reduce((sum, o) => sum + (o.total_weight || 0), 0),
    }
  }, [filteredOrders])

  const openDetail = (record: StockOutOrder) => {
    openTab({
      key: `stock-out-${record.id}`,
      title: `Phiếu ${record.code || record.id.slice(0, 8)}`,
      componentId: 'stock-out-detail',
      props: { id: record.id },
      path: `/wms/stock-out/${record.id}`,
    })
  }

  // ============================================================================
  // TABLE COLUMNS
  // ============================================================================
  const columns: ColumnDef<StockOutOrder>[] = [
    { key: 'code', title: 'Mã phiếu', dataIndex: 'code', width: 170, sortable: true,
      render: (v) => <Text strong style={{ ...monoStyle, color: PRIMARY }}>{v}</Text> },
    { key: 'type', title: 'Loại', dataIndex: 'type', width: 80,
      filterType: 'select', filterOptions: toOptions(TYPE_LABELS),
      render: (v) => <Tag color={TYPE_COLORS[v] || 'default'}>{TYPE_LABELS[v] || v || '—'}</Tag>,
      exportRender: (v) => TYPE_LABELS[v] || v || '' },
    { key: 'status', title: 'Trạng thái', dataIndex: 'status', width: 130,
      filterType: 'select', filterOptions: toOptions(STOCK_OUT_STATUS_LABELS),
      render: (v) => <Tag color={STOCK_OUT_STATUS_COLORS[v] || 'default'}>{STOCK_OUT_STATUS_LABELS[v] || v}</Tag>,
      exportRender: (v) => STOCK_OUT_STATUS_LABELS[v] || v },
    { key: 'warehouse', title: 'Kho', dataIndex: ['warehouse', 'name'], width: 150,
      render: (_, r) => r.warehouse?.name || r.warehouse?.code || '—',
      exportRender: (_, r) => r.warehouse?.name || r.warehouse?.code || '' },
    { key: 'reason', title: 'Lý do', dataIndex: 'reason', width: 190,
      filterType: 'select', filterOptions: toOptions(STOCK_OUT_REASON_LABELS),
      render: (v, r) => {
        const ticketCode = extractWeighbridgeCode(r.notes)
        return (
          <Space size={4} wrap>
            <Tag color={STOCK_OUT_REASON_COLORS[v] || 'default'}>{STOCK_OUT_REASON_LABELS[v] || v}</Tag>
            {ticketCode && <Tag color="cyan" style={{ margin: 0 }}>⚖ {ticketCode}</Tag>}
          </Space>
        )
      },
      exportRender: (v, r) => {
        const ticketCode = extractWeighbridgeCode(r.notes)
        const label = STOCK_OUT_REASON_LABELS[v] || v
        return ticketCode ? `${label} (${ticketCode})` : label
      },
    },
    { key: 'svr_grade', title: 'Grade', dataIndex: 'svr_grade', width: 100,
      filterType: 'select', filterOptions: toOptions(RUBBER_GRADE_LABELS),
      render: (v) => <GradeBadge grade={v} size="small" />,
      exportRender: (v) => (v ? RUBBER_GRADE_LABELS[v as RubberGrade] || v : '') },
    { key: 'customer', title: 'Khách hàng', dataIndex: 'customer_name', width: 170,
      render: (_, r) => r.customer_name ? (
        <div>
          <Text>{r.customer_name}</Text>
          {r.customer_order_ref && (
            <div><Text type="secondary" style={{ ...monoStyle, fontSize: 12 }}>{r.customer_order_ref}</Text></div>
          )}
        </div>
      ) : <Text type="secondary">—</Text>,
      exportRender: (_, r) => [r.customer_name, r.customer_order_ref].filter(Boolean).join(' · ') },
    { key: 'total_quantity', title: 'Số lượng', dataIndex: 'total_quantity', width: 100, align: 'right', sortable: true,
      summary: 'sum',
      render: (v) => <Text strong style={monoStyle}>{fmtNum(v)}</Text>,
      exportRender: (v) => (v == null ? '' : Number(v)) },
    { key: 'total_weight', title: 'Trọng lượng (kg)', dataIndex: 'total_weight', width: 140, align: 'right', sortable: true,
      summary: 'sum',
      render: (v) => <Text style={monoStyle}>{fmtKg(v)}</Text>,
      exportRender: (v) => (v == null ? '' : Number(v)) },
    { key: 'created_at', title: 'Ngày tạo', dataIndex: 'created_at', width: 110, sortable: true,
      render: (v) => <Text type="secondary">{fmtDate(v)}</Text>,
      exportRender: (v) => (v ? fmtDate(v) : '') },
    { key: 'notes', title: 'Ghi chú', dataIndex: 'notes', width: 220, ellipsis: true,
      render: (v) => v ? <Text type="secondary">{v}</Text> : '—',
      exportRender: (v) => v || '' },
  ]

  // ============================================================================
  // RENDER
  // ============================================================================
  const kpiCards: { title: string; value: number; color: string; suffix?: string; isKg?: boolean }[] = [
    { title: 'Tổng phiếu', value: kpi.total, color: '#262626' },
    { title: 'Nháp', value: kpi.draft, color: '#8c8c8c' },
    { title: 'Đang xử lý', value: kpi.picking, color: '#1890ff' },
    { title: 'Đã xuất kho', value: kpi.confirmed, color: PRIMARY },
    { title: 'SL đã xuất', value: kpi.confirmedQty, color: PRIMARY, suffix: 'bành' },
    { title: 'KL đã xuất', value: kpi.confirmedWeight, color: '#2D8B6E', suffix: 'kg', isKg: true },
  ]
  // Tải lỗi mà chưa có dữ liệu → KPI hiện '—' (không vẽ 0 như thật); lỗi + Thử lại hiện ở khối bảng bên dưới
  const kpiChuaCoSo = !!error && orders.length === 0

  return (
    <div style={{ padding: 24, maxWidth: 1600, margin: '0 auto' }}>
      {/* Header — route /wms/vat-tu đã rút khỏi menu 30/10 nên bỏ nút "Quay lại" trỏ về đó */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <Space size={12} align="center" wrap>
          <Text strong style={{ fontSize: 18, color: PRIMARY }}>
            <ExportOutlined style={{ marginRight: 8 }} />Phiếu xuất kho
          </Text>
          <Text type="secondary" style={{ fontSize: 13 }}>NVL & Thành phẩm · 🏭</Text>
          <FacilityPicker
            value={currentFacilityId}
            onChange={setCurrentFacilityId}
            allowAll
            size="middle"
            style={{ width: 220 }}
          />
        </Space>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/wms/stock-out/new')} style={{ background: PRIMARY }}>
          Tạo phiếu xuất
        </Button>
      </div>

      {/* KPI — trên dữ liệu đã lọc nhà máy */}
      <Row gutter={[12, 12]} style={{ marginBottom: 8 }}>
        {kpiCards.map(c => (
          <Col xs={12} sm={8} md={4} key={c.title}>
            <Card size="small" style={{ borderRadius: 10 }}>
              <Statistic
                title={c.title}
                value={c.value}
                suffix={kpiChuaCoSo ? undefined : c.suffix}
                loading={isLoading && orders.length === 0}
                valueStyle={{ ...monoStyle, color: kpiChuaCoSo ? undefined : c.color }}
                formatter={(val) => (kpiChuaCoSo ? '—' : c.isKg ? fmtKg(Number(val)) : fmtNum(Number(val)))}
              />
            </Card>
          </Col>
        ))}
      </Row>
      {orders.length >= LOAD_LIMIT && (
        <Text type="secondary" style={{ display: 'block', fontSize: 12, marginBottom: 8 }}>
          Số liệu trên tính theo {fmtNum(LOAD_LIMIT)} phiếu gần nhất đã tải.
        </Text>
      )}

      <div style={{ marginTop: 8 }}>
        <AdvancedDataTable<StockOutOrder>
          columns={columns}
          dataSource={filteredOrders}
          rowKey="id"
          loading={isLoading}
          error={error}
          loadLimit={LOAD_LIMIT}
          title="Phiếu xuất kho"
          dateRangeField="created_at"
          onRefresh={() => refetch()}
          onRowClick={openDetail}
          exportFileName="Phieu_Xuat_Kho"
          pageSize={50}
          emptyText="Chưa có phiếu xuất kho nào"
        />
      </div>
    </div>
  )
}

export default StockOutListPage
