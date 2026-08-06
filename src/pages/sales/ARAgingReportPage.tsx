// ============================================================================
// CÔNG NỢ KHÁCH · THU TIỀN  (nâng từ A/R Aging — 2026-08-06, Pha 2)
// File: src/pages/sales/ARAgingReportPage.tsx
//
// Cockpit đòi nợ: gom theo KHÁCH (nợ to lên đầu) → bung từng ĐƠN → nút
// "Ghi nhận đã thu" ngay tại dòng (điền sẵn phần còn nợ). Ghi qua
// salesOrderPaymentService (Cách A: thu đủ → đơn tự 'paid' + rời cột Kanban).
//
// Tuổi nợ (aging) ẨN mặc định: 50/54 đơn thiếu ngày giao nên bucket không tin
// được → bật bằng công tắc "Hiện tuổi nợ (tạm tính)".
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
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { getSalesRole } from '../../services/sales/salesPermissionService'
import {
  salesOrderPaymentService, PAYMENT_TYPE_LABELS, type PaymentType,
} from '../../services/sales/salesOrderPaymentService'

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
  const [loading, setLoading] = useState(true)
  const [filterCurrency, setFilterCurrency] = useState<string>('all')
  const [scope, setScope] = useState<'delivered' | 'all'>('delivered')
  const [showAging, setShowAging] = useState(false)

  // Quick-pay modal state
  const [payOrder, setPayOrder] = useState<AROrder | null>(null)
  const [payAmount, setPayAmount] = useState<number>(0)
  const [payDate, setPayDate] = useState<dayjs.Dayjs>(dayjs())
  const [payType, setPayType] = useState<PaymentType>('final')
  const [payBankRef, setPayBankRef] = useState<string>('')
  const [paying, setPaying] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data: orders, error } = await supabase
        .from('sales_orders')
        .select(`
          id, code, contract_no, customer_id, quantity_tons, unit_price, total_value_usd, currency,
          payment_status, delivery_date, etd, confirmed_at, status, created_at,
          customer:sales_customers!customer_id(id, code, name, short_name, country),
          payments:sales_order_payments!sales_order_id(amount, payment_type, payment_date)
        `)
        .in('status', ['confirmed', 'producing', 'ready', 'packing', 'shipped', 'delivered', 'invoiced'])

      if (error) throw error

      const rows: RawOrder[] = []
      for (const o of (orders || [])) {
        const customer = Array.isArray(o.customer) ? o.customer[0] : o.customer
        if (!customer) continue
        const total = o.total_value_usd || (o.quantity_tons * o.unit_price) || 0
        const paymentList = Array.isArray(o.payments) ? o.payments : []
        const paid = paymentList
          .filter((p: any) => p.payment_type !== 'fee_offset')
          .reduce((s: number, p: any) => s + Number(p.amount || 0), 0)
        const outstanding = Math.max(0, total - paid)
        if (outstanding <= 0) continue
        rows.push({
          id: o.id,
          code: o.code,
          contractNo: o.contract_no || null,
          status: o.status,
          total,
          paid,
          outstanding,
          delivery_date: o.delivery_date,
          invoiceDate: o.delivery_date || o.etd || o.confirmed_at || o.created_at,
          custId: customer.id,
          customerName: customer.short_name || customer.name || '',
          customerCode: customer.code || '',
          country: customer.country,
          currency: o.currency || 'USD',
        })
      }
      setRawOrders(rows)
    } catch (e) {
      console.error('Công nợ khách load error:', e)
      message.error('Lỗi tải công nợ')
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // ── Gom theo khách (theo scope), tính aging ──
  const data = useMemo(() => {
    const now = Date.now()
    const inScope = rawOrders.filter((o) =>
      scope === 'all' ? true : DELIVERED_STATUSES.includes(o.status),
    )
    const map = new Map<string, ARRecord>()
    for (const o of inScope) {
      if (!map.has(o.custId)) {
        map.set(o.custId, {
          customer_id: o.custId,
          customer_name: o.customerName,
          customer_code: o.customerCode,
          country: o.country,
          currency: o.currency,
          total_amount: 0, paid_amount: 0, outstanding: 0,
          aging_0_30: 0, aging_31_60: 0, aging_61_90: 0, aging_90_plus: 0,
          order_count: 0, orders: [],
        })
      }
      const rec = map.get(o.custId)!
      rec.total_amount += o.total
      rec.paid_amount += o.paid
      rec.outstanding += o.outstanding
      rec.order_count++
      rec.orders.push(o)
      const days = o.invoiceDate ? Math.floor((now - new Date(o.invoiceDate).getTime()) / 86400000) : 0
      if (days <= 30) rec.aging_0_30 += o.outstanding
      else if (days <= 60) rec.aging_31_60 += o.outstanding
      else if (days <= 90) rec.aging_61_90 += o.outstanding
      else rec.aging_90_plus += o.outstanding
    }
    return Array.from(map.values()).sort((a, b) => b.outstanding - a.outstanding)
  }, [rawOrders, scope])

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
    customers: filtered.length,
    orders: filtered.reduce((s, d) => s + d.order_count, 0),
  }), [filtered])

  // Đếm đơn (trong scope) thiếu ngày giao → cảnh báo tuổi nợ không tin được
  const missingDelivery = useMemo(() => {
    const inScope = rawOrders.filter((o) => scope === 'all' ? true : DELIVERED_STATUSES.includes(o.status))
    return { missing: inScope.filter((o) => !o.delivery_date).length, total: inScope.length }
  }, [rawOrders, scope])

  // ── Mở modal ghi thu ──
  const openPay = (o: AROrder) => {
    setPayOrder(o)
    setPayAmount(Math.round(o.outstanding * 100) / 100)
    setPayDate(dayjs())
    setPayType('final')
    setPayBankRef('')
  }

  const submitPay = async () => {
    if (!payOrder) return
    if (!payAmount || payAmount <= 0) { message.error('Nhập số tiền đã thu'); return }
    setPaying(true)
    try {
      await salesOrderPaymentService.create({
        sales_order_id: payOrder.id,
        payment_date: payDate.format('YYYY-MM-DD'),
        amount: payAmount,
        currency: 'USD',
        payment_type: payType,
        bank_reference: payBankRef.trim() || null,
      })
      message.success(`Đã ghi nhận thu ${formatUSD(payAmount)} cho ${payOrder.contractNo || payOrder.code}`)
      setPayOrder(null)
      await load()
    } catch (e: any) {
      message.error(e?.message || 'Lỗi ghi nhận thu')
    } finally {
      setPaying(false)
    }
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
          <ClockCircleOutlined /> Hiện tuổi nợ (tạm tính)
        </Text>
        {missingDelivery.missing > 0 && (
          <Text type="warning" style={{ fontSize: 12 }}>
            ⚠ {missingDelivery.missing}/{missingDelivery.total} đơn chưa có ngày giao → tuổi nợ chưa đáng tin. Bổ sung ngày giao ở tab Tài chính để bật báo cáo tuổi nợ chuẩn.
          </Text>
        )}
      </div>

      {showAging && (
        <Alert
          type="info" showIcon style={{ marginBottom: 12, fontSize: 12 }}
          message="Tuổi nợ dưới đây TẠM TÍNH theo ngày giao/xuất/xác nhận (đơn thiếu ngày giao sẽ rơi về ngày tạo đơn nên có thể sai)."
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
          scroll={{ x: showAging ? 1200 : 850 }}
          size="small"
          expandable={{
            expandedRowRender: renderOrders,
            rowExpandable: (r) => r.orders.length > 0,
          }}
        />
      </Card>

      {/* Modal ghi nhận đã thu */}
      <Modal
        title={<span><DollarOutlined style={{ color: '#15803d' }} /> Ghi nhận đã thu — {payOrder?.contractNo || payOrder?.code}</span>}
        open={!!payOrder}
        onCancel={() => setPayOrder(null)}
        onOk={submitPay}
        confirmLoading={paying}
        okText="Xác nhận đã thu"
        cancelText="Hủy"
        okButtonProps={{ style: { background: '#15803d', borderColor: '#15803d' } }}
        destroyOnClose
      >
        {payOrder && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ background: '#fafafa', borderRadius: 8, padding: 10, fontSize: 13 }}>
              Đơn <strong>{payOrder.contractNo || payOrder.code}</strong>
              {payOrder.contractNo && <Text type="secondary" style={{ fontSize: 11 }}> ({payOrder.code})</Text>} · Còn nợ:{' '}
              <strong style={{ color: '#f5222d' }}>{formatUSD(payOrder.outstanding)}</strong>
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>Số tiền đã thu (USD)</div>
              <InputNumber
                value={payAmount}
                onChange={(v) => setPayAmount(Number(v) || 0)}
                min={0} step={100} style={{ width: '100%' }}
                formatter={(v) => `$ ${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                parser={(v) => Number((v || '').replace(/[$,\s]/g, ''))}
              />
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>Ngày tiền về</div>
                <DatePicker value={payDate} onChange={(d) => d && setPayDate(d)} format="DD/MM/YYYY" style={{ width: '100%' }} allowClear={false} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>Loại</div>
                <Select value={payType} onChange={(v) => setPayType(v)} style={{ width: '100%' }}
                  options={Object.entries(PAYMENT_TYPE_LABELS).map(([v, l]) => ({ value: v, label: l }))} />
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>Số tham chiếu NH (tùy chọn)</div>
              <input
                value={payBankRef}
                onChange={(e) => setPayBankRef(e.target.value)}
                placeholder="VD: MT103 ref / số UNC"
                style={{ width: '100%', padding: '4px 8px', border: '1px solid #d9d9d9', borderRadius: 6 }}
              />
            </div>
            {payAmount >= payOrder.outstanding && payOrder.outstanding > 0 && (
              <Alert type="success" showIcon style={{ fontSize: 12 }}
                message="Thu ĐỦ → đơn tự chuyển 'đã thu đủ' và rời cột 'Đã giao khách' trên Kanban." />
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
