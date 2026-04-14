// ============================================================================
// A/R AGING REPORT — Báo cáo nợ phải thu theo tuổi nợ
// File: src/pages/sales/ARAgingReportPage.tsx
// ============================================================================

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Card, Table, Tag, Typography, Row, Col, Statistic, Select, Progress, Space,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  DollarOutlined, ClockCircleOutlined, ExclamationCircleOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons'
import { supabase } from '../../lib/supabase'

const { Title, Text } = Typography

// ============================================================================
// TYPES
// ============================================================================

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
  oldest_invoice_date: string | null
}

// ============================================================================
// HELPERS
// ============================================================================

const formatUSD = (v: number): string =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v)

function getAgingColor(days: number): string {
  if (days <= 30) return '#52c41a'
  if (days <= 60) return '#faad14'
  if (days <= 90) return '#fa8c16'
  return '#f5222d'
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function ARAgingReportPage() {
  const [data, setData] = useState<ARRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [filterCurrency, setFilterCurrency] = useState<string>('all')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // V2: Lấy đơn từ confirmed trở đi (kể cả chưa shipped — kế toán cần thấy
      // đơn nào còn nợ ngay từ lúc xác nhận). Loại draft/cancelled/paid.
      const { data: orders, error } = await supabase
        .from('sales_orders')
        .select(`
          id, code, customer_id, quantity_tons, unit_price, total_value_usd, currency,
          payment_status, delivery_date, etd, confirmed_at, status, created_at,
          customer:sales_customers!customer_id(id, code, name, short_name, country),
          payments:sales_order_payments!sales_order_id(amount, payment_type, payment_date)
        `)
        .in('status', ['confirmed','producing','ready','packing','shipped','delivered','invoiced'])

      if (error) throw error

      // Group by customer
      const customerMap = new Map<string, ARRecord>()
      const now = new Date()

      for (const o of (orders || [])) {
        const customer = Array.isArray(o.customer) ? o.customer[0] : o.customer
        if (!customer) continue

        const custId = customer.id
        const totalValue = o.total_value_usd || (o.quantity_tons * o.unit_price) || 0
        // V2: tính paid từ bảng sales_order_payments (loại fee_offset)
        const paymentList = Array.isArray(o.payments) ? o.payments : []
        const paidAmount = paymentList
          .filter((p: any) => p.payment_type !== 'fee_offset')
          .reduce((s: number, p: any) => s + Number(p.amount || 0), 0)
        const outstanding = Math.max(0, totalValue - paidAmount)
        if (outstanding <= 0) continue

        // Calculate days since invoice/delivery
        const invoiceDate = o.delivery_date || o.etd || o.confirmed_at || o.created_at
        const daysSince = invoiceDate ? Math.floor((now.getTime() - new Date(invoiceDate).getTime()) / 86400000) : 0

        if (!customerMap.has(custId)) {
          customerMap.set(custId, {
            customer_id: custId,
            customer_name: customer.short_name || customer.name || '',
            customer_code: customer.code || '',
            country: customer.country,
            currency: o.currency || 'USD',
            total_amount: 0,
            paid_amount: 0,
            outstanding: 0,
            aging_0_30: 0,
            aging_31_60: 0,
            aging_61_90: 0,
            aging_90_plus: 0,
            order_count: 0,
            oldest_invoice_date: null,
          })
        }

        const rec = customerMap.get(custId)!
        rec.total_amount += totalValue
        rec.paid_amount += paidAmount
        rec.outstanding += outstanding
        rec.order_count++

        if (daysSince <= 30) rec.aging_0_30 += outstanding
        else if (daysSince <= 60) rec.aging_31_60 += outstanding
        else if (daysSince <= 90) rec.aging_61_90 += outstanding
        else rec.aging_90_plus += outstanding

        if (!rec.oldest_invoice_date || invoiceDate < rec.oldest_invoice_date) {
          rec.oldest_invoice_date = invoiceDate
        }
      }

      setData(Array.from(customerMap.values()).sort((a, b) => b.outstanding - a.outstanding))
    } catch (e) {
      console.error('AR Aging load error:', e)
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Filter
  const filtered = useMemo(() => {
    if (filterCurrency === 'all') return data
    return data.filter(d => d.currency === filterCurrency)
  }, [data, filterCurrency])

  // Totals
  const totals = useMemo(() => ({
    outstanding: filtered.reduce((s, d) => s + d.outstanding, 0),
    aging_0_30: filtered.reduce((s, d) => s + d.aging_0_30, 0),
    aging_31_60: filtered.reduce((s, d) => s + d.aging_31_60, 0),
    aging_61_90: filtered.reduce((s, d) => s + d.aging_61_90, 0),
    aging_90_plus: filtered.reduce((s, d) => s + d.aging_90_plus, 0),
    customers: filtered.length,
    orders: filtered.reduce((s, d) => s + d.order_count, 0),
  }), [filtered])

  // Columns
  const columns: ColumnsType<ARRecord> = [
    {
      title: 'Khách hàng',
      key: 'customer',
      width: 180,
      fixed: 'left',
      render: (_, r) => (
        <div>
          <Text strong style={{ fontSize: 13 }}>{r.customer_name}</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 11 }}>{r.customer_code} • {r.country || '-'}</Text>
        </div>
      ),
    },
    {
      title: 'Đơn hàng',
      dataIndex: 'order_count',
      key: 'orders',
      width: 70,
      align: 'center',
    },
    {
      title: 'Tổng giá trị',
      dataIndex: 'total_amount',
      key: 'total',
      width: 120,
      align: 'right',
      render: (v: number) => formatUSD(v),
    },
    {
      title: 'Đã thu',
      dataIndex: 'paid_amount',
      key: 'paid',
      width: 110,
      align: 'right',
      render: (v: number) => <Text type="success">{formatUSD(v)}</Text>,
    },
    {
      title: 'Còn nợ',
      dataIndex: 'outstanding',
      key: 'outstanding',
      width: 120,
      align: 'right',
      render: (v: number) => <Text strong style={{ color: '#f5222d' }}>{formatUSD(v)}</Text>,
    },
    {
      title: '0-30 ngày',
      dataIndex: 'aging_0_30',
      key: 'aging_0_30',
      width: 110,
      align: 'right',
      render: (v: number) => v > 0 ? <Tag color="green">{formatUSD(v)}</Tag> : '-',
    },
    {
      title: '31-60 ngày',
      dataIndex: 'aging_31_60',
      key: 'aging_31_60',
      width: 110,
      align: 'right',
      render: (v: number) => v > 0 ? <Tag color="gold">{formatUSD(v)}</Tag> : '-',
    },
    {
      title: '61-90 ngày',
      dataIndex: 'aging_61_90',
      key: 'aging_61_90',
      width: 110,
      align: 'right',
      render: (v: number) => v > 0 ? <Tag color="orange">{formatUSD(v)}</Tag> : '-',
    },
    {
      title: '> 90 ngày',
      dataIndex: 'aging_90_plus',
      key: 'aging_90_plus',
      width: 110,
      align: 'right',
      render: (v: number) => v > 0 ? <Tag color="red">{formatUSD(v)}</Tag> : '-',
    },
    {
      title: 'Thu nợ',
      key: 'progress',
      width: 100,
      render: (_, r) => {
        const pct = r.total_amount > 0 ? Math.round((r.paid_amount / r.total_amount) * 100) : 0
        return <Progress percent={pct} size="small" strokeColor={pct >= 100 ? '#52c41a' : pct >= 50 ? '#1890ff' : '#f5222d'} />
      },
    },
  ]

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>
            <ClockCircleOutlined style={{ marginRight: 8 }} />
            Báo cáo Nợ phải thu (A/R Aging)
          </Title>
          <Text type="secondary">Phân tích công nợ theo tuổi nợ</Text>
        </div>
        <Select value={filterCurrency} onChange={setFilterCurrency} style={{ width: 150 }}
          options={[
            { value: 'all', label: 'Tất cả tiền tệ' },
            { value: 'USD', label: 'USD' },
            { value: 'EUR', label: 'EUR' },
          ]}
        />
      </div>

      {/* KPI Cards */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={8} md={5}>
          <Card size="small" style={{ borderRadius: 12, borderLeft: '4px solid #f5222d' }}>
            <Statistic title="Tổng nợ phải thu" value={totals.outstanding} prefix="$" precision={0}
              valueStyle={{ color: '#f5222d', fontSize: 20 }} />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={5}>
          <Card size="small" style={{ borderRadius: 12, borderLeft: '4px solid #52c41a' }}>
            <Statistic title="0-30 ngày" value={totals.aging_0_30} prefix="$" precision={0}
              valueStyle={{ color: '#52c41a', fontSize: 18 }} />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={5}>
          <Card size="small" style={{ borderRadius: 12, borderLeft: '4px solid #faad14' }}>
            <Statistic title="31-60 ngày" value={totals.aging_31_60} prefix="$" precision={0}
              valueStyle={{ color: '#faad14', fontSize: 18 }} />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={5}>
          <Card size="small" style={{ borderRadius: 12, borderLeft: '4px solid #fa8c16' }}>
            <Statistic title="61-90 ngày" value={totals.aging_61_90} prefix="$" precision={0}
              valueStyle={{ color: '#fa8c16', fontSize: 18 }} />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={4}>
          <Card size="small" style={{ borderRadius: 12, borderLeft: '4px solid #f5222d' }}>
            <Statistic title="> 90 ngày" value={totals.aging_90_plus} prefix="$" precision={0}
              valueStyle={{ color: '#f5222d', fontSize: 18 }} />
          </Card>
        </Col>
      </Row>

      {/* Aging Distribution Bar */}
      {totals.outstanding > 0 && (
        <Card size="small" style={{ marginBottom: 24, borderRadius: 12 }}>
          <Text strong style={{ fontSize: 13, marginBottom: 8, display: 'block' }}>Phân bố tuổi nợ</Text>
          <div style={{ display: 'flex', height: 24, borderRadius: 6, overflow: 'hidden' }}>
            {[
              { value: totals.aging_0_30, color: '#52c41a', label: '0-30' },
              { value: totals.aging_31_60, color: '#faad14', label: '31-60' },
              { value: totals.aging_61_90, color: '#fa8c16', label: '61-90' },
              { value: totals.aging_90_plus, color: '#f5222d', label: '>90' },
            ].map((seg, i) => {
              const pct = totals.outstanding > 0 ? (seg.value / totals.outstanding) * 100 : 0
              if (pct <= 0) return null
              return (
                <div key={i} style={{ width: `${pct}%`, background: seg.color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, fontWeight: 600, minWidth: pct > 5 ? 40 : 0 }}>
                  {pct > 8 ? `${seg.label} (${pct.toFixed(0)}%)` : ''}
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* Table */}
      <Card size="small" style={{ borderRadius: 12 }}>
        <Table
          columns={columns}
          dataSource={filtered}
          rowKey="customer_id"
          loading={loading}
          pagination={false}
          scroll={{ x: 1200 }}
          size="small"
          summary={() => filtered.length > 0 ? (
            <Table.Summary fixed>
              <Table.Summary.Row style={{ background: '#fafafa', fontWeight: 600 }}>
                <Table.Summary.Cell index={0}>Tổng ({totals.customers} KH)</Table.Summary.Cell>
                <Table.Summary.Cell index={1} align="center">{totals.orders}</Table.Summary.Cell>
                <Table.Summary.Cell index={2} align="right">{formatUSD(filtered.reduce((s, d) => s + d.total_amount, 0))}</Table.Summary.Cell>
                <Table.Summary.Cell index={3} align="right">{formatUSD(filtered.reduce((s, d) => s + d.paid_amount, 0))}</Table.Summary.Cell>
                <Table.Summary.Cell index={4} align="right"><Text strong style={{ color: '#f5222d' }}>{formatUSD(totals.outstanding)}</Text></Table.Summary.Cell>
                <Table.Summary.Cell index={5} align="right">{formatUSD(totals.aging_0_30)}</Table.Summary.Cell>
                <Table.Summary.Cell index={6} align="right">{formatUSD(totals.aging_31_60)}</Table.Summary.Cell>
                <Table.Summary.Cell index={7} align="right">{formatUSD(totals.aging_61_90)}</Table.Summary.Cell>
                <Table.Summary.Cell index={8} align="right">{formatUSD(totals.aging_90_plus)}</Table.Summary.Cell>
                <Table.Summary.Cell index={9}></Table.Summary.Cell>
              </Table.Summary.Row>
            </Table.Summary>
          ) : undefined}
        />
      </Card>
    </div>
  )
}
