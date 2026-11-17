// ============================================================================
// CASH FLOW + LC MANAGEMENT — Dòng tiền + Quản lý LC
// File: src/pages/sales/CashFlowPage.tsx
// ============================================================================

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Card, Table, Tag, Typography, Row, Col, Statistic, Tabs, Progress, Space, Badge,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  DollarOutlined, BankOutlined, ClockCircleOutlined,
  WarningOutlined, CheckCircleOutlined, CalendarOutlined,
} from '@ant-design/icons'
import { supabase } from '../../lib/supabase'
import { fmtUsd, fmtDate } from '../../utils/format'
import PageState from '../../components/common/PageState'
import { EnumTag } from '../../components/common/EnumTag'
import { PAYMENT_STATUS_LABELS, PAYMENT_STATUS_COLORS, soDisplayCode } from '../../services/sales/salesTypes'

const { Title, Text } = Typography

// ============================================================================
// TYPES
// ============================================================================

interface CashFlowMonth {
  month: string // "2026-04"
  label: string // "T4/2026"
  expected: number
  received: number
  gap: number
  order_count: number
}

interface LCRecord {
  id: string
  code: string
  contract_no: string | null
  customer_name: string
  lc_number: string
  lc_bank: string
  lc_amount: number
  lc_expiry_date: string
  currency: string
  status: string
  payment_status: string
  days_until_expiry: number
}

// ============================================================================
// HELPERS
// ============================================================================

// Định dạng: fmtUsd (0 số lẻ) / fmtDate — utils/format. Nhãn thanh toán: PAYMENT_STATUS_LABELS (salesTypes).

// ============================================================================
// COMPONENT
// ============================================================================

export default function CashFlowPage() {
  const navigate = useNavigate()
  const [cashFlow, setCashFlow] = useState<CashFlowMonth[]>([])
  const [lcRecords, setLcRecords] = useState<LCRecord[]>([])
  const [loading, setLoading] = useState(true)
  // Lỗi tải ≠ "không có L/C sắp hết hạn" — trước đây catch chỉ console.error, bảng trống giả
  const [loadError, setLoadError] = useState<unknown>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      // ═══ Cash Flow: dự báo tiền về theo tháng ═══
      const { data: orders, error: ordersErr } = await supabase
        .from('sales_orders')
        .select(`
          id, code, total_value_usd, actual_payment_amount, deposit_amount, payment_status,
          delivery_date, etd, payment_terms, currency, status,
          customer:sales_customers!customer_id(name, short_name)
        `)
        .in('status', ['confirmed', 'producing', 'ready', 'packing', 'shipped', 'delivered', 'invoiced', 'paid'])
      if (ordersErr) throw ordersErr

      const monthMap = new Map<string, CashFlowMonth>()

      // Generate 6 months
      const now = new Date()
      for (let i = -2; i <= 3; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        const label = `T${d.getMonth() + 1}/${d.getFullYear()}`
        monthMap.set(key, { month: key, label, expected: 0, received: 0, gap: 0, order_count: 0 })
      }

      for (const o of (orders || [])) {
        const totalValue = o.total_value_usd || 0
        const paidAmount = o.actual_payment_amount || 0

        // Determine expected payment month from delivery + payment terms
        const baseDate = o.delivery_date || o.etd
        if (!baseDate) continue

        const deliveryDate = new Date(baseDate)
        // Parse payment terms → days until expected payment
        const pt = (o.payment_terms || '').toLowerCase()
        let paymentDays = 30 // default
        if (pt.includes('at_sight') || pt.includes('sight')) paymentDays = 7
        else if (pt.includes('90')) paymentDays = 90
        else if (pt.includes('60')) paymentDays = 60
        else if (pt.includes('30')) paymentDays = 30
        else if (pt.includes('tt') || pt.includes('advance')) paymentDays = 7
        else if (pt.includes('cad') || pt.includes('dp')) paymentDays = 14

        const expectedPayDate = new Date(deliveryDate.getTime() + paymentDays * 86400000)
        const monthKey = `${expectedPayDate.getFullYear()}-${String(expectedPayDate.getMonth() + 1).padStart(2, '0')}`

        if (monthMap.has(monthKey)) {
          const m = monthMap.get(monthKey)!
          m.expected += totalValue
          if (o.payment_status === 'paid') m.received += totalValue
          else if (paidAmount > 0) m.received += paidAmount
          m.order_count++
        }
      }

      // Calculate gap
      const cfData = Array.from(monthMap.values()).sort((a, b) => a.month.localeCompare(b.month))
      cfData.forEach(m => { m.gap = m.expected - m.received })
      setCashFlow(cfData)

      // ═══ LC Management ═══
      const { data: lcOrders, error: lcErr } = await supabase
        .from('sales_orders')
        .select(`
          id, code, contract_no, lc_number, lc_bank, lc_amount, lc_expiry_date,
          currency, status, payment_status, total_value_usd,
          customer:sales_customers!customer_id(name, short_name)
        `)
        .not('lc_number', 'is', null)
        .neq('lc_number', '')
      if (lcErr) throw lcErr

      const lcData: LCRecord[] = (lcOrders || []).map((o: any) => {
        const customer = Array.isArray(o.customer) ? o.customer[0] : o.customer
        const expiry = o.lc_expiry_date ? new Date(o.lc_expiry_date) : null
        const daysUntil = expiry ? Math.ceil((expiry.getTime() - now.getTime()) / 86400000) : 999

        return {
          id: o.id,
          code: o.code,
          contract_no: o.contract_no ?? null,
          customer_name: customer?.short_name || customer?.name || '-',
          lc_number: o.lc_number,
          lc_bank: o.lc_bank || '-',
          lc_amount: o.lc_amount || o.total_value_usd || 0,
          lc_expiry_date: o.lc_expiry_date,
          currency: o.currency || 'USD',
          status: o.status,
          payment_status: o.payment_status || 'unpaid',
          days_until_expiry: daysUntil,
        }
      }).sort((a: LCRecord, b: LCRecord) => a.days_until_expiry - b.days_until_expiry)

      setLcRecords(lcData)
    } catch (e) {
      console.error('CashFlow load error:', e)
      setLoadError(e)
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Totals
  const cfTotals = useMemo(() => ({
    expected: cashFlow.reduce((s, m) => s + m.expected, 0),
    received: cashFlow.reduce((s, m) => s + m.received, 0),
    gap: cashFlow.reduce((s, m) => s + m.gap, 0),
  }), [cashFlow])

  const lcTotals = useMemo(() => ({
    active: lcRecords.filter(l => l.payment_status !== 'paid').length,
    expiring: lcRecords.filter(l => l.days_until_expiry <= 7 && l.days_until_expiry > 0).length,
    expired: lcRecords.filter(l => l.days_until_expiry <= 0).length,
    totalAmount: lcRecords.filter(l => l.payment_status !== 'paid').reduce((s, l) => s + l.lc_amount, 0),
  }), [lcRecords])

  // Cash Flow columns
  const cfColumns: ColumnsType<CashFlowMonth> = [
    { title: 'Tháng', dataIndex: 'label', key: 'label', width: 100, render: (v: string) => <Text strong>{v}</Text> },
    { title: 'Đơn hàng', dataIndex: 'order_count', key: 'orders', width: 80, align: 'center' },
    { title: 'Dự kiến thu', dataIndex: 'expected', key: 'expected', width: 130, align: 'right', render: (v: number) => <Text style={{ color: '#1890ff' }}>{fmtUsd(v)}</Text> },
    { title: 'Đã thu', dataIndex: 'received', key: 'received', width: 130, align: 'right', render: (v: number) => <Text type="success">{fmtUsd(v)}</Text> },
    { title: 'Chênh lệch', dataIndex: 'gap', key: 'gap', width: 130, align: 'right',
      render: (v: number) => <Text strong style={{ color: v > 0 ? '#f5222d' : '#52c41a' }}>{fmtUsd(v)}</Text> },
    { title: 'Thu nợ', key: 'progress', width: 120,
      render: (_, r) => {
        const pct = r.expected > 0 ? Math.round((r.received / r.expected) * 100) : 0
        return <Progress percent={Math.min(pct, 100)} size="small" strokeColor={pct >= 100 ? '#52c41a' : '#1890ff'} />
      },
    },
  ]

  // LC columns
  const lcColumns: ColumnsType<LCRecord> = [
    // Số HĐ (HA…) — số người dùng nhớ; đơn chưa có HĐ mới hiện mã SO nội bộ
    { title: 'Số HĐ', dataIndex: 'contract_no', key: 'code', width: 130, render: (_: unknown, r) => <Text strong>{soDisplayCode(r)}</Text> },
    { title: 'Khách hàng', dataIndex: 'customer_name', key: 'customer', width: 140 },
    { title: 'Số L/C', dataIndex: 'lc_number', key: 'lc', width: 150 },
    { title: 'Ngân hàng', dataIndex: 'lc_bank', key: 'bank', width: 130 },
    { title: 'Giá trị L/C', dataIndex: 'lc_amount', key: 'amount', width: 120, align: 'right', render: (v: number) => fmtUsd(v) },
    { title: 'Hết hạn', dataIndex: 'lc_expiry_date', key: 'expiry', width: 110, render: (v: string) => fmtDate(v) },
    { title: 'Còn lại', dataIndex: 'days_until_expiry', key: 'days', width: 100, align: 'center',
      render: (v: number) => {
        if (v <= 0) return <Tag color="red">Hết hạn</Tag>
        if (v <= 7) return <Tag color="orange">{v} ngày</Tag>
        if (v <= 30) return <Tag color="gold">{v} ngày</Tag>
        return <Tag color="green">{v} ngày</Tag>
      },
    },
    { title: 'Thanh toán', dataIndex: 'payment_status', key: 'pay', width: 160,
      render: (v: string) => <EnumTag value={v} labels={PAYMENT_STATUS_LABELS} colors={PAYMENT_STATUS_COLORS} />,
    },
  ]

  return (
    <div style={{ padding: 24 }}>
      <Title level={4} style={{ marginBottom: 24 }}>
        <DollarOutlined style={{ marginRight: 8 }} />
        Dòng tiền & Quản lý L/C
      </Title>

      {loadError && !loading ? (
        <PageState error={loadError} onRetry={load} />
      ) : (
      <Tabs defaultActiveKey="cashflow" items={[
        {
          key: 'cashflow',
          label: <span><CalendarOutlined /> Dòng tiền</span>,
          children: (
            <div>
              {/* KPI */}
              <Row gutter={16} style={{ marginBottom: 24 }}>
                <Col xs={24} sm={8}>
                  <Card size="small" style={{ borderRadius: 12, borderLeft: '4px solid #1890ff' }}>
                    <Statistic title="Tổng dự kiến thu" value={cfTotals.expected} prefix="$" precision={0} valueStyle={{ color: '#1890ff' }} />
                  </Card>
                </Col>
                <Col xs={24} sm={8}>
                  <Card size="small" style={{ borderRadius: 12, borderLeft: '4px solid #52c41a' }}>
                    <Statistic title="Đã thu" value={cfTotals.received} prefix="$" precision={0} valueStyle={{ color: '#52c41a' }} />
                  </Card>
                </Col>
                <Col xs={24} sm={8}>
                  <Card size="small" style={{ borderRadius: 12, borderLeft: '4px solid #f5222d' }}>
                    <Statistic title="Chưa thu" value={cfTotals.gap} prefix="$" precision={0} valueStyle={{ color: '#f5222d' }} />
                  </Card>
                </Col>
              </Row>

              <Card size="small" style={{ borderRadius: 12 }}>
                <Table columns={cfColumns} dataSource={cashFlow} rowKey="month" loading={loading} pagination={false} size="small" />
              </Card>
            </div>
          ),
        },
        {
          key: 'lc',
          label: (
            <span>
              <BankOutlined /> Quản lý L/C
              {lcTotals.expiring > 0 && <Badge count={lcTotals.expiring} offset={[8, -4]} style={{ backgroundColor: '#fa8c16' }} />}
              {lcTotals.expired > 0 && <Badge count={lcTotals.expired} offset={[8, -4]} style={{ backgroundColor: '#f5222d' }} />}
            </span>
          ),
          children: (
            <div>
              {/* KPI */}
              <Row gutter={16} style={{ marginBottom: 24 }}>
                <Col xs={12} sm={6}>
                  <Card size="small" style={{ borderRadius: 12 }}>
                    <Statistic title="L/C đang mở" value={lcTotals.active} valueStyle={{ color: '#1890ff' }} />
                  </Card>
                </Col>
                <Col xs={12} sm={6}>
                  <Card size="small" style={{ borderRadius: 12 }}>
                    <Statistic title="Tổng giá trị" value={lcTotals.totalAmount} prefix="$" precision={0} />
                  </Card>
                </Col>
                <Col xs={12} sm={6}>
                  <Card size="small" style={{ borderRadius: 12, borderLeft: '4px solid #fa8c16' }}>
                    <Statistic title="Sắp hết hạn (≤ 7 ngày)" value={lcTotals.expiring} suffix="L/C" valueStyle={{ color: '#fa8c16' }}
                      prefix={<WarningOutlined />} />
                  </Card>
                </Col>
                <Col xs={12} sm={6}>
                  <Card size="small" style={{ borderRadius: 12, borderLeft: '4px solid #f5222d' }}>
                    <Statistic title="Đã hết hạn" value={lcTotals.expired} suffix="L/C" valueStyle={{ color: '#f5222d' }}
                      prefix={<ClockCircleOutlined />} />
                  </Card>
                </Col>
              </Row>

              <Card size="small" style={{ borderRadius: 12 }}>
                <Table columns={lcColumns} dataSource={lcRecords} rowKey="id" loading={loading} pagination={false} size="small" scroll={{ x: 1000 }}
                  locale={{ emptyText: 'Chưa có đơn nào khai số L/C' }}
                  onRow={(r) => ({ onClick: () => navigate(`/sales/orders/${r.id}`), style: { cursor: 'pointer' } })} />
              </Card>
            </div>
          ),
        },
      ]} />
      )}
    </div>
  )
}
