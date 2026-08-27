// ============================================================================
// CÔNG NỢ KHÁCH · THU TIỀN  (nâng từ A/R Aging — 2026-08-06, Pha 2)
// File: src/pages/sales/ARAgingReportPage.tsx
//
// Cockpit đòi nợ: gom theo KHÁCH (nợ to lên đầu) → bung từng ĐƠN → nút
// "Ghi nhận đã thu" ngay tại dòng (điền sẵn phần còn nợ). Ghi qua
// salesOrderPaymentService (Cách A: thu đủ → đơn tự 'paid' + rời cột Kanban).
//
// TỪ 27/08/2026 (Đợt 8) — trang KHÔNG còn tự tính công thức nào:
//   • Mẫu số nằm trong view v_ar_aging_rows, đọc qua arAgingService. Mẫu số phải thu là
//     TRỊ GIÁ HỢP ĐỒNG; phần chưa chốt vào lô được hoà giải bằng PHÉP TRỪ (một dòng
//     'residual' đứng riêng), tuyệt đối không chia prorata xuống lô.
//   • Bung được xuống tận từng LÔ: khách → đơn → lô / phần dư.
//   • Tuổi nợ giờ BẬT mặc định. Bản cũ ẩn nó vì mốc là chuỗi dự phòng
//     delivery_date → etd → confirmed_at → created_at, mà ngày TẠO ĐƠN thì không phải
//     ngày giao — 90% tiền trong nhóm ">90 ngày" là do đó mà ra. Nay mốc lấy từ lệnh
//     điều động thật, và nợ không có mốc nằm ở cột riêng "Chưa có mốc".
//
// ⚠ Đây là TUỔI KỂ TỪ NGÀY GIAO, KHÔNG phải "quá hạn". Hệ thống không có ngày đến hạn
// ở bất kỳ đâu — đừng đổi nhãn thành "quá hạn", đó là bịa ra một mốc không tồn tại.
// ============================================================================

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Card, Table, Tag, Typography, Row, Col, Statistic, Select, Progress,
  Button, Modal, InputNumber, DatePicker, Segmented, Switch, message, Alert, Tooltip,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  ClockCircleOutlined, DollarOutlined, TeamOutlined, FileTextOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { useAuthStore } from '../../stores/authStore'
import { getSalesRole } from '../../services/sales/salesPermissionService'
import QuickPayModal, { type QuickPayTarget } from './components/QuickPayModal'
import { arAgingService, type ArAgingRow } from '../../services/sales/arAgingService'

const { Title, Text } = Typography

// ============================================================================
// TYPES
// ============================================================================

interface AROrder {
  id: string
  code: string
  contractNo: string | null
  status: string
  total: number
  paid: number
  outstanding: number
  delivery_date: string | null
  invoiceDate: string | null
}

interface RawOrder extends AROrder {
  custId: string
  customerName: string
  customerCode: string
  country: string | null
  currency: string
}

interface ARRecord {
  customer_id: string
  customer_name: string
  customer_code: string
  country: string | null
  currency: string
  total_amount: number
  paid_amount: number
  outstanding: number
  aging_0_30: number
  aging_31_60: number
  aging_61_90: number
  aging_90_plus: number
  /** Nợ KHÔNG có ngày giao — không được xếp vào bucket nào. */
  aging_no_anchor: number
  order_count: number
  orders: AROrder[]
}

// ============================================================================
// HELPERS
// ============================================================================

const formatUSD = (v: number): string =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v)

// status "đã giao/xuất trở đi" — khớp cột "Đã giao khách" trên Kanban
const DELIVERED_STATUSES = ['shipped', 'delivered', 'invoiced']

const STATUS_LABELS: Record<string, string> = {
  confirmed: 'Đã xác nhận', producing: 'Đang SX', ready: 'Sẵn sàng',
  packing: 'Đóng gói', shipped: 'Đã xuất', delivered: 'Đã giao', invoiced: 'Đã xuất HĐ',
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function ARAgingReportPage() {
  const user = useAuthStore((s) => s.user)
  const role = getSalesRole(user)
  const canCollect = role === 'accounting' || role === 'admin'

  const [rawOrders, setRawOrders] = useState<RawOrder[]>([])
  /** Dòng công nợ gốc (lô / dư / đơn) — B3 sẽ bung ra bảng con. */
  const [arRows, setArRows] = useState<ArAgingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filterCurrency, setFilterCurrency] = useState<string>('all')
  const [scope, setScope] = useState<'delivered' | 'all'>('delivered')
  // Bật MẶC ĐỊNH từ 27/08/2026: mốc tuổi giờ lấy từ lệnh điều động thật, và phần không
  // có mốc đã có cột riêng thay vì bị nhét bừa vào một nhóm.
  const [showAging, setShowAging] = useState(true)

  // Quick-pay modal (dùng chung QuickPayModal)
  const [payTarget, setPayTarget] = useState<QuickPayTarget | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // Mẫu số KHÔNG còn tính ở đây. Nó nằm trong v_ar_aging_rows, và trang chỉ cuộn
      // các dòng đó lên mức đơn để hiển thị. Xem arAgingService.ts.
      const { rows: arRows, customers } = await arAgingService.listRows()
      setArRows(arRows)

      // Cuộn lên mức ĐƠN: một đơn có thể gồm nhiều dòng lô + một dòng dư.
      const byOrder = new Map<string, RawOrder>()
      for (const r of arRows) {
        const customer = customers[r.customerId]
        if (!customer) continue
        let rec = byOrder.get(r.salesOrderId)
        if (!rec) {
          rec = {
            id: r.salesOrderId,
            code: r.orderCode,
            contractNo: r.contractNo,
            status: r.orderStatus,
            total: 0, paid: 0, outstanding: 0,
            delivery_date: null,
            invoiceDate: null,
            custId: r.customerId,
            customerName: customer.name,
            customerCode: customer.code,
            country: customer.country,
            currency: r.currency,
          }
          byOrder.set(r.salesOrderId, rec)
        }
        rec.total += r.rowValueUsd
        rec.paid += r.rowPaidUsd
        // ⚠ KHÔNG kẹp Math.max(0, …). Dòng 'residual' có thể ÂM khi hàng giao VƯỢT hợp
        // đồng (cân thật hơn khối lượng danh nghĩa lúc ký) — 2 đơn đang như vậy. Kẹp về 0
        // là nuốt mất khoản khách thực sự nợ thêm.
        rec.outstanding += r.rowOutstandingUsd
        // Mốc tuổi của ĐƠN = khoản nợ GIÀ NHẤT trong đơn. Không dùng chuỗi dự phòng
        // etd/confirmed_at/created_at nữa: ngày tạo đơn không phải ngày giao hàng, và
        // chính nó đẩy 90% tiền vào bucket "trên 90 ngày" một cách giả tạo.
        if (r.anchorDate && (!rec.invoiceDate || r.anchorDate < rec.invoiceDate)) {
          rec.invoiceDate = r.anchorDate
          rec.delivery_date = r.anchorDate
        }
      }
      setRawOrders([...byOrder.values()])
    } catch (e) {
      console.error('Công nợ khách load error:', e)
      message.error('Lỗi tải công nợ')
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // ── Gom theo khách (theo scope), tính aging ──
  const data = useMemo(() => {
    const inScope = (status: string) => scope === 'all' || DELIVERED_STATUSES.includes(status)
    const map = new Map<string, ARRecord>()

    // 1) Khung theo khách + danh sách đơn để bung.
    for (const o of rawOrders) {
      if (!inScope(o.status)) continue
      if (!map.has(o.custId)) {
        map.set(o.custId, {
          customer_id: o.custId,
          customer_name: o.customerName,
          customer_code: o.customerCode,
          country: o.country,
          currency: o.currency,
          total_amount: 0, paid_amount: 0, outstanding: 0,
          aging_0_30: 0, aging_31_60: 0, aging_61_90: 0, aging_90_plus: 0,
          aging_no_anchor: 0,
          order_count: 0, orders: [],
        })
      }
      const rec = map.get(o.custId)!
      rec.order_count++
      rec.orders.push(o)
    }

    // 2) Tiền và tuổi lấy từ DÒNG công nợ, KHÔNG phải từ đơn. Một đơn có thể vừa có lô
    //    đã giao (có mốc, có tuổi) vừa có phần chưa chốt lô (chưa phát hoá đơn, không có
    //    mốc) — hai phần đó thuộc hai cột khác nhau, gom ở mức đơn là trộn mất.
    for (const r of arRows) {
      if (!inScope(r.orderStatus)) continue
      const rec = map.get(r.customerId)
      if (!rec) continue
      rec.total_amount += r.rowValueUsd
      rec.paid_amount += r.rowPaidUsd
      rec.outstanding += r.rowOutstandingUsd
      if (r.agingBucket === 'd0_30') rec.aging_0_30 += r.rowOutstandingUsd
      else if (r.agingBucket === 'd31_60') rec.aging_31_60 += r.rowOutstandingUsd
      else if (r.agingBucket === 'd61_90') rec.aging_61_90 += r.rowOutstandingUsd
      else if (r.agingBucket === 'd90_plus') rec.aging_90_plus += r.rowOutstandingUsd
      else rec.aging_no_anchor += r.rowOutstandingUsd
    }
    return Array.from(map.values()).sort((a, b) => b.outstanding - a.outstanding)
  }, [rawOrders, arRows, scope])

  /** Dòng công nợ gom theo đơn. Thứ tự: lô tăng dần → phần dư → cả đơn. */
  const rowsByOrder = useMemo(() => {
    const m = new Map<string, ArAgingRow[]>()
    for (const r of arRows) {
      const list = m.get(r.salesOrderId)
      if (list) list.push(r)
      else m.set(r.salesOrderId, [r])
    }
    const rank = (k: ArAgingRow['rowKind']) => (k === 'lot' ? 0 : k === 'residual' ? 1 : 2)
    for (const list of m.values()) {
      list.sort((a, b) => rank(a.rowKind) - rank(b.rowKind) || (a.lotNo ?? 0) - (b.lotNo ?? 0))
    }
    return m
  }, [arRows])

  const filtered = useMemo(() => {
    if (filterCurrency === 'all') return data
    return data.filter((d) => d.currency === filterCurrency)
  }, [data, filterCurrency])

  const totals = useMemo(() => ({
    outstanding: filtered.reduce((s, d) => s + d.outstanding, 0),
    aging_0_30: filtered.reduce((s, d) => s + d.aging_0_30, 0),
    aging_31_60: filtered.reduce((s, d) => s + d.aging_31_60, 0),
    aging_61_90: filtered.reduce((s, d) => s + d.aging_61_90, 0),
    aging_90_plus: filtered.reduce((s, d) => s + d.aging_90_plus, 0),
    aging_no_anchor: filtered.reduce((s, d) => s + d.aging_no_anchor, 0),
    customers: filtered.length,
    orders: filtered.reduce((s, d) => s + d.order_count, 0),
  }), [filtered])

  // Đếm đơn (trong scope) thiếu ngày giao → cảnh báo tuổi nợ không tin được
  const missingDelivery = useMemo(() => {
    const inScope = rawOrders.filter((o) => scope === 'all' ? true : DELIVERED_STATUSES.includes(o.status))
    return { missing: inScope.filter((o) => !o.delivery_date).length, total: inScope.length }
  }, [rawOrders, scope])

  // ── Mở modal ghi thu (số HĐ lên đầu) ──
  const openPay = (o: AROrder) => setPayTarget({
    id: o.id,
    label: o.contractNo || o.code,
    subLabel: o.contractNo ? o.code : undefined,
    outstanding: o.outstanding,
  })

  // ── Bảng cháu: các dòng công nợ THẬT của 1 đơn (lô / phần dư / cả đơn) ──
  const renderArRows = (orderId: string) => {
    const rows = rowsByOrder.get(orderId) || []
    const cols: ColumnsType<ArAgingRow> = [
      {
        title: 'Khoản nợ', key: 'kind', width: 210,
        render: (_, r) => {
          if (r.rowKind === 'lot') {
            return (
              <span>
                <Tag color="geekblue" style={{ marginRight: 6 }}>Lô {r.lotNo}</Tag>
                <Text type="secondary" style={{ fontSize: 11 }}>{r.lotLabel || ''}</Text>
              </span>
            )
          }
          if (r.rowKind === 'order') return <Tag>Cả đơn — chưa chia lô</Tag>
          // Dòng dư: HAI nghĩa trái ngược nhau, tuyệt đối không dùng chung một nhãn.
          return r.rowValueUsd < 0
            ? <Tooltip title="Hàng đã giao có trị giá LỚN HƠN mặt hợp đồng — cân thật nặng hơn khối lượng danh nghĩa lúc ký. Khách nợ THÊM khoản này.">
                <Tag color="orange">Giao vượt HĐ</Tag>
              </Tooltip>
            : <Tooltip title="Phần trị giá hợp đồng chưa được chốt vào lô nào. Chưa phát hành hoá đơn nên KHÔNG tính tuổi.">
                <Tag color="gold">Chưa chốt lô</Tag>
              </Tooltip>
        },
      },
      {
        title: 'Giao', key: 'ship', width: 110, align: 'center',
        render: (_, r) => r.containerCount > 0
          ? <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>
              {r.containersDelivered}/{r.containerCount} cont
            </span>
          : <Text type="secondary" style={{ fontSize: 12 }}>—</Text>,
      },
      {
        title: 'Trị giá', dataIndex: 'rowValueUsd', key: 'v', align: 'right',
        render: (v: number) => <span style={{ color: v < 0 ? '#c2410c' : undefined }}>{formatUSD(v)}</span>,
      },
      {
        title: 'Đã thu', key: 'p', align: 'right',
        render: (_, r) => (
          <span>
            <Text type={r.rowPaidUsd > 0 ? 'success' : 'secondary'}>{formatUSD(r.rowPaidUsd)}</Text>
            {r.rowKind === 'residual' && r.rowPaidUsd > 0 && (
              <Tooltip title="Tiền đã thu nhưng CHƯA gắn số lô. Ghi thu kèm số lô thì khoản này sẽ về đúng lô.">
                <Tag color="purple" style={{ marginLeft: 6 }}>chưa gắn lô</Tag>
              </Tooltip>
            )}
          </span>
        ),
      },
      {
        title: 'Còn nợ', dataIndex: 'rowOutstandingUsd', key: 'o', align: 'right',
        render: (v: number) => <Text strong style={{ color: v < 0 ? '#c2410c' : '#f5222d' }}>{formatUSD(v)}</Text>,
      },
      {
        title: '', key: 'act', align: 'right', width: 130,
        // Ghi thu ĐÚNG LÔ ngay tại dòng lô — đây là đường ngắn nhất để tiền vào kèm số lô,
        // ngắn hơn hẳn việc mở đơn rồi tự chọn lô trong danh sách.
        render: (_, r) => canCollect && r.rowKind === 'lot' && r.rowOutstandingUsd > 0
          ? <Button size="small" icon={<DollarOutlined />}
              onClick={() => setPayTarget({
                id: r.salesOrderId,
                label: r.contractNo || r.orderCode,
                subLabel: `Lô ${r.lotNo}`,
                outstanding: r.rowOutstandingUsd,
                presetLotNo: r.lotNo,
              })}>Ghi thu lô {r.lotNo}</Button>
          : null,
      },
    ]
    return <Table columns={cols} dataSource={rows} rowKey={(r) => `${r.salesOrderId}-${r.rowKind}-${r.lotNo ?? 'x'}`}
      pagination={false} size="small" showHeader />
  }

  // ── Bảng con: đơn của 1 khách ──
  const renderOrders = (rec: ARRecord) => {
    const orderCols: ColumnsType<AROrder> = [
      { title: 'Số HĐ', key: 'contract', width: 180, render: (_, o) => (
        <div>
          <Text strong style={{ fontSize: 13 }}>{o.contractNo || o.code}</Text>
          {o.contractNo && <><br /><Text type="secondary" style={{ fontSize: 10 }}>{o.code}</Text></>}
        </div>
      ) },
      { title: 'Trạng thái', dataIndex: 'status', key: 'status', width: 110,
        render: (v: string) => <Tag>{STATUS_LABELS[v] || v}</Tag> },
      { title: 'Tổng', dataIndex: 'total', key: 'total', align: 'right', render: (v) => formatUSD(v) },
      { title: 'Đã thu', dataIndex: 'paid', key: 'paid', align: 'right', render: (v) => <Text type="success">{formatUSD(v)}</Text> },
      { title: 'Còn nợ', dataIndex: 'outstanding', key: 'out', align: 'right', render: (v) => <Text strong style={{ color: '#f5222d' }}>{formatUSD(v)}</Text> },
      { title: '', key: 'act', align: 'right', width: 150,
        render: (_, o) => canCollect
          ? <Button type="primary" size="small" icon={<DollarOutlined />} style={{ background: '#15803d', borderColor: '#15803d' }} onClick={() => openPay(o)}>Ghi nhận đã thu</Button>
          : <Tooltip title="Chỉ Kế toán/Admin ghi thu"><span style={{ color: '#bbb', fontSize: 12 }}>—</span></Tooltip> },
    ]
    return (
      <Table
        columns={orderCols}
        dataSource={rec.orders.slice().sort((a, b) => b.outstanding - a.outstanding)}
        rowKey="id" pagination={false} size="small" showHeader
        expandable={{
          // Chỉ đơn ĐÃ CHIA LÔ mới có gì để bung. Đơn chưa chia lô đúng một dòng,
          // bung ra chỉ để nhìn lại chính con số vừa đọc.
          rowExpandable: (o) => (rowsByOrder.get(o.id)?.length || 0) > 1,
          expandedRowRender: (o) => renderArRows(o.id),
        }}
      />
    )
  }

  // ── Cột bảng khách ──
  const baseCols: ColumnsType<ARRecord> = [
    { title: 'Khách hàng', key: 'customer', width: 200, fixed: 'left',
      render: (_, r) => (
        <div>
          <Text strong style={{ fontSize: 13 }}>{r.customer_name}</Text><br />
          <Text type="secondary" style={{ fontSize: 11 }}>{r.customer_code} • {r.country || '-'}</Text>
        </div>
      ) },
    { title: 'Đơn', dataIndex: 'order_count', key: 'orders', width: 60, align: 'center' },
    { title: 'Tổng giá trị', dataIndex: 'total_amount', key: 'total', width: 120, align: 'right', render: (v: number) => formatUSD(v) },
    { title: 'Đã thu', dataIndex: 'paid_amount', key: 'paid', width: 110, align: 'right', render: (v: number) => <Text type="success">{formatUSD(v)}</Text> },
    { title: 'Còn nợ', dataIndex: 'outstanding', key: 'outstanding', width: 130, align: 'right',
      defaultSortOrder: 'descend', sorter: (a, b) => a.outstanding - b.outstanding,
      render: (v: number) => <Text strong style={{ color: '#f5222d', fontSize: 14 }}>{formatUSD(v)}</Text> },
    { title: 'Thu nợ', key: 'progress', width: 110,
      render: (_, r) => {
        const pct = r.total_amount > 0 ? Math.round((r.paid_amount / r.total_amount) * 100) : 0
        return <Progress percent={pct} size="small" strokeColor={pct >= 100 ? '#52c41a' : pct >= 50 ? '#1890ff' : '#f5222d'} />
      } },
  ]

  const agingCols: ColumnsType<ARRecord> = [
    { title: '0-30 ngày', dataIndex: 'aging_0_30', key: 'a1', width: 100, align: 'right', render: (v: number) => v > 0 ? <Tag color="green">{formatUSD(v)}</Tag> : '-' },
    { title: '31-60', dataIndex: 'aging_31_60', key: 'a2', width: 100, align: 'right', render: (v: number) => v > 0 ? <Tag color="gold">{formatUSD(v)}</Tag> : '-' },
    { title: '61-90', dataIndex: 'aging_61_90', key: 'a3', width: 100, align: 'right', render: (v: number) => v > 0 ? <Tag color="orange">{formatUSD(v)}</Tag> : '-' },
    { title: '> 90', dataIndex: 'aging_90_plus', key: 'a4', width: 100, align: 'right', render: (v: number) => v > 0 ? <Tag color="red">{formatUSD(v)}</Tag> : '-' },
    // ⚠ CỘT THỨ NĂM BẮT BUỘC. Nợ không có ngày giao thì không thuộc bucket nào — nhét
    // nó vào "0-30" (mặc định days=0 của bản cũ) hay vào ">90" đều là bịa. Đây cũng là
    // danh sách việc phải làm: bổ sung ngày giao cho những đơn này.
    {
      title: <Tooltip title="Nợ chưa có ngày giao nào để bắt đầu đếm — chưa xếp được vào nhóm tuổi. Phần lớn là đơn cũ không có container và không có ngày giao/ngày xuất.">
        <span style={{ cursor: 'help' }}>Chưa có mốc</span>
      </Tooltip>,
      dataIndex: 'aging_no_anchor', key: 'a5', width: 110, align: 'right',
      render: (v: number) => v > 0 ? <Tag>{formatUSD(v)}</Tag> : '-',
    },
  ]

  const columns = showAging ? [...baseCols, ...agingCols] : baseCols

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>
            <DollarOutlined style={{ marginRight: 8, color: '#f5222d' }} />
            Công nợ khách · Thu tiền
          </Title>
          <Text type="secondary">Khách nào còn nợ bao nhiêu — bung ra ghi nhận tiền về ngay tại dòng</Text>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Segmented
            value={scope}
            onChange={(v) => setScope(v as 'delivered' | 'all')}
            options={[
              { label: 'Đã giao', value: 'delivered' },
              { label: 'Tất cả đơn còn nợ', value: 'all' },
            ]}
          />
          <Select value={filterCurrency} onChange={setFilterCurrency} style={{ width: 130 }}
            options={[
              { value: 'all', label: 'Tất cả tiền tệ' },
              { value: 'USD', label: 'USD' },
              { value: 'EUR', label: 'EUR' },
            ]}
          />
        </div>
      </div>

      {/* KPI cốt lõi (bằng ĐÔ, không phụ thuộc tuổi nợ) */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={8}>
          <Card size="small" style={{ borderRadius: 12, borderLeft: '4px solid #f5222d' }}>
            <Statistic title="Tổng CÒN PHẢI THU" value={totals.outstanding} prefix="$" precision={0}
              valueStyle={{ color: '#f5222d', fontSize: 24 }} />
          </Card>
        </Col>
        <Col xs={12} sm={8}>
          <Card size="small" style={{ borderRadius: 12, borderLeft: '4px solid #1890ff' }}>
            <Statistic title="Số khách còn nợ" value={totals.customers} prefix={<TeamOutlined />}
              valueStyle={{ fontSize: 22 }} />
          </Card>
        </Col>
        <Col xs={12} sm={8}>
          <Card size="small" style={{ borderRadius: 12, borderLeft: '4px solid #722ed1' }}>
            <Statistic title="Số đơn còn nợ" value={totals.orders} prefix={<FileTextOutlined />}
              valueStyle={{ fontSize: 22 }} />
          </Card>
        </Col>
      </Row>

      {/* Công tắc tuổi nợ + cảnh báo data thiếu */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <Switch checked={showAging} onChange={setShowAging} />
        <Text style={{ fontSize: 13 }}>
          <ClockCircleOutlined /> Hiện tuổi kể từ ngày giao
        </Text>
        {missingDelivery.missing > 0 && (
          <Text type="secondary" style={{ fontSize: 12 }}>
            {missingDelivery.missing}/{missingDelivery.total} đơn chưa có ngày giao — phần tiền đó nằm ở cột <strong>Chưa có mốc</strong>, không bị nhét vào nhóm tuổi nào.
          </Text>
        )}
      </div>

      {showAging && (
        <Alert
          type="info" showIcon style={{ marginBottom: 12, fontSize: 12 }}
          message={
            <span>
              Đây là <strong>tuổi kể từ ngày giao</strong>, <strong>không phải "quá hạn"</strong> — hệ thống chưa lưu ngày đến hạn thanh toán ở đâu cả.
              {' '}Mốc đếm lấy từ lệnh điều động đã phát hành (lô đã đi trọn tính theo chuyến cuối, lô đang đi dở tính theo chuyến ĐẦU để nợ không tự trẻ lại).
              {' '}Nợ không có mốc nào nằm riêng ở cột <strong>Chưa có mốc</strong>.
            </span>
          }
        />
      )}

      {!canCollect && (
        <Alert type="info" showIcon style={{ marginBottom: 12, fontSize: 12 }}
          message="Bạn đang ở chế độ xem. Chỉ Kế toán/Admin mới ghi nhận được tiền về." />
      )}

      {/* Bảng khách — bung ra từng đơn */}
      <Card size="small" style={{ borderRadius: 12 }}>
        <Table
          columns={columns}
          dataSource={filtered}
          rowKey="customer_id"
          loading={loading}
          pagination={false}
          scroll={{ x: showAging ? 1330 : 850 }}   /* +110 cho cột "Chưa có mốc", +20 đệm */
          size="small"
          expandable={{
            expandedRowRender: renderOrders,
            rowExpandable: (r) => r.orders.length > 0,
          }}
        />
      </Card>

      {/* Modal ghi nhận đã thu (dùng chung với kéo-thả Kanban) */}
      <QuickPayModal
        target={payTarget}
        onClose={() => setPayTarget(null)}
        onDone={() => { setPayTarget(null); load() }}
      />
    </div>
  )
}
