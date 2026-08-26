// ============================================================================
// SỔ LÔ — mỗi dòng là 1 LÔ, không phải 1 hợp đồng  (2026-08-26)
// File: src/pages/sales/SalesLotLedgerPage.tsx
//
// VÌ SAO CÓ TRANG NÀY: mọi dạng xem của module bán hàng đều lấy HỢP ĐỒNG làm dòng,
// nên câu hỏi "lô nào đã thu tiền, nó thuộc hợp đồng nào" không có chỗ nào trả lời.
// Kanban có badge "x/y lô" nhưng đó là tiến độ GIAO, không phải tiền.
//
// Trang này lấy LÔ làm dòng, gom theo hợp đồng, cột tiền đi thẳng vào việc:
// trị giá lô / đã thu / còn nợ / trạng thái. Bấm "Ghi thu" ở dòng nào thì
// QuickPayModal mở với đúng lô đó chọn sẵn — tiền vào có lot_no ngay từ đầu.
//
// ⚠ Trang cố tình hiện CẢ hợp đồng CHƯA chia lô ở khối dưới. Nếu chỉ hiện lô thì
// tổng trên trang là ~$4,97M trong khi sổ đơn hàng là ~$15,7M — người xem sẽ tưởng
// mất tiền, trong khi thật ra 95 hợp đồng chưa ai gán lô cho container.
// ============================================================================

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Card, Table, Tag, Typography, Row, Col, Statistic, Input, Segmented,
  Button, Alert, Tooltip, Space, message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { DollarOutlined, InboxOutlined, WarningOutlined, ReloadOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import {
  salesLotService,
  type LotLedger, type SalesLotRow, type OrderWithoutLots, type LotPaymentStatus,
} from '../../services/sales/salesLotService'
import QuickPayModal, { type QuickPayTarget } from './components/QuickPayModal'
import { useAuthStore } from '../../stores/authStore'
import { getSalesRole } from '../../services/sales/salesPermissionService'

const { Title, Text } = Typography

const fmtUSD = (v: number | null | undefined): string =>
  v == null ? '—'
    : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v)

const fmtTon = (kg: number | null | undefined): string =>
  kg == null ? '—' : `${(kg / 1000).toLocaleString('vi-VN', { maximumFractionDigits: 3 })} T`

const PAY_TAG: Record<LotPaymentStatus, { color: string; label: string }> = {
  paid:    { color: 'green',  label: 'Đã thu đủ' },
  partial: { color: 'gold',   label: 'Thu 1 phần' },
  unpaid:  { color: 'red',    label: 'Chưa thu' },
  unknown: { color: 'default', label: 'Chưa có trị giá' },
}

const LOT_STATUS_LABEL: Record<string, string> = {
  planning: 'Kế hoạch', packing: 'Đang đóng', shipped: 'Đã đi',
  delivered: 'Đã giao', cancelled: 'Đã huỷ',
}

type PayFilter = 'all' | 'unpaid' | 'partial' | 'paid'

export default function SalesLotLedgerPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const salesRole = getSalesRole(user)
  const canPay = salesRole === 'accounting' || salesRole === 'admin'

  const [ledger, setLedger] = useState<LotLedger | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [payFilter, setPayFilter] = useState<PayFilter>('all')
  const [payTarget, setPayTarget] = useState<QuickPayTarget | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      setLedger(await salesLotService.getLedger())
    } catch (e: any) {
      // Không nuốt lỗi thành "không có dữ liệu" — đó là cách các trang cũ giấu sự cố.
      setErr(e?.message || 'Không tải được sổ lô')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const lots = useMemo(() => {
    let rows = ledger?.lots ?? []
    if (payFilter !== 'all') rows = rows.filter((l) => l.payment_status === payFilter)
    const kw = q.trim().toLowerCase()
    if (kw) {
      rows = rows.filter((l) =>
        (l.contract_no || '').toLowerCase().includes(kw)
        || (l.customer_name || '').toLowerCase().includes(kw)
        || (l.lot_label || '').toLowerCase().includes(kw)
        || (l.invoice_no || '').toLowerCase().includes(kw)
        || (l.bl_no || '').toLowerCase().includes(kw)
        || `lô ${l.lot_no}`.includes(kw),
      )
    }
    return rows
  }, [ledger, payFilter, q])

  const ordersNoLots = useMemo(() => {
    const kw = q.trim().toLowerCase()
    let rows = ledger?.ordersWithoutLots ?? []
    if (kw) {
      rows = rows.filter((o) =>
        (o.contract_no || '').toLowerCase().includes(kw)
        || (o.customer_name || '').toLowerCase().includes(kw),
      )
    }
    return rows
  }, [ledger, q])

  const t = ledger?.totals

  const lotCols: ColumnsType<SalesLotRow> = [
    {
      title: 'Hợp đồng', dataIndex: 'contract_no', width: 150, fixed: 'left',
      render: (v: string | null, r) => (
        <div>
          <a onClick={() => navigate(`/sales/orders/${r.sales_order_id}`)} style={{ fontWeight: 600 }}>
            {v || '(chưa có số HĐ)'}
          </a>
          <div style={{ fontSize: 11, color: '#6b7280' }}>{r.customer_name || '—'}</div>
        </div>
      ),
      sorter: (a, b) => (a.contract_no || '').localeCompare(b.contract_no || ''),
    },
    {
      title: 'Lô', dataIndex: 'lot_no', width: 92, align: 'center',
      render: (v: number, r) => (
        <div>
          <Tag color="blue" style={{ margin: 0, fontWeight: 700 }}>Lô {v}</Tag>
          {r.lot_label && <div style={{ fontSize: 10, color: '#6b7280' }}>{r.lot_label}</div>}
        </div>
      ),
      sorter: (a, b) => a.lot_no - b.lot_no,
    },
    {
      title: 'Trạng thái lô', dataIndex: 'lot_status', width: 110, align: 'center',
      render: (v: string) => <Tag>{LOT_STATUS_LABEL[v] || v}</Tag>,
    },
    {
      title: 'Khối lượng', dataIndex: 'net_weight_kg', width: 110, align: 'right',
      render: (v: number | null) => fmtTon(v),
      sorter: (a, b) => (a.net_weight_kg || 0) - (b.net_weight_kg || 0),
    },
    {
      title: 'Trị giá lô', dataIndex: 'value_usd', width: 130, align: 'right',
      render: (v: number | null) => (
        v == null || v <= 0
          ? <Tooltip title="Lô chưa có trị giá → không kết luận được đã thu đủ hay chưa. Sửa trong chi tiết đơn.">
              <Text type="warning"><WarningOutlined /> chưa có</Text>
            </Tooltip>
          : <strong>{fmtUSD(v)}</strong>
      ),
      sorter: (a, b) => (a.value_usd || 0) - (b.value_usd || 0),
    },
    {
      title: 'Đã thu', dataIndex: 'paid_usd', width: 120, align: 'right',
      render: (v: number, r) => (
        <div>
          <span style={{ color: v > 0 ? '#15803d' : '#9ca3af', fontWeight: v > 0 ? 600 : 400 }}>{fmtUSD(v)}</span>
          {r.payment_count > 0 && (
            <div style={{ fontSize: 10, color: '#6b7280' }}>
              {r.payment_count} lần{r.last_payment_date ? ` · ${r.last_payment_date}` : ''}
            </div>
          )}
        </div>
      ),
      sorter: (a, b) => a.paid_usd - b.paid_usd,
    },
    {
      title: 'Còn nợ', dataIndex: 'remaining_usd', width: 120, align: 'right',
      render: (v: number) => <span style={{ color: v > 0 ? '#dc2626' : '#15803d', fontWeight: 600 }}>{fmtUSD(v)}</span>,
      sorter: (a, b) => a.remaining_usd - b.remaining_usd,
    },
    {
      title: 'Thu tiền', dataIndex: 'payment_status', width: 118, align: 'center',
      render: (v: LotPaymentStatus) => <Tag color={PAY_TAG[v].color}>{PAY_TAG[v].label}</Tag>,
      filters: (Object.keys(PAY_TAG) as LotPaymentStatus[]).map((k) => ({ text: PAY_TAG[k].label, value: k })),
      onFilter: (val, r) => r.payment_status === val,
    },
    {
      title: 'Chứng từ', width: 150,
      render: (_, r) => (
        <div style={{ fontSize: 11, lineHeight: 1.5 }}>
          {r.invoice_no ? <div>INV: {r.invoice_no}</div> : null}
          {r.bl_no ? <div>B/L: {r.bl_no}</div> : null}
          {r.etd ? <div style={{ color: '#6b7280' }}>ETD: {r.etd}</div> : null}
          {!r.invoice_no && !r.bl_no && !r.etd ? <Text type="secondary">—</Text> : null}
        </div>
      ),
    },
    {
      title: '', width: 96, fixed: 'right',
      render: (_, r) => (
        canPay && r.remaining_usd > 0 ? (
          <Button
            size="small" type="primary" ghost icon={<DollarOutlined />}
            onClick={() => setPayTarget({
              id: r.sales_order_id,
              label: r.contract_no || '(chưa có số HĐ)',
              subLabel: `Lô ${r.lot_no}`,
              outstanding: r.remaining_usd,
              presetLotNo: r.lot_no,
            })}
          >
            Ghi thu
          </Button>
        ) : null
      ),
    },
  ]

  const noLotCols: ColumnsType<OrderWithoutLots> = [
    {
      title: 'Hợp đồng', dataIndex: 'contract_no', width: 160,
      render: (v: string | null, r) => (
        <div>
          <a onClick={() => navigate(`/sales/orders/${r.sales_order_id}`)} style={{ fontWeight: 600 }}>
            {v || '(chưa có số HĐ)'}
          </a>
          <div style={{ fontSize: 11, color: '#6b7280' }}>{r.customer_name || '—'}</div>
        </div>
      ),
    },
    { title: 'Trạng thái', dataIndex: 'order_status', width: 120, render: (v) => <Tag>{v || '—'}</Tag> },
    {
      title: 'Container', dataIndex: 'container_count', width: 110, align: 'right',
      render: (v: number) => v > 0
        ? <Tooltip title="Đã có container nhưng chưa gán số lô — vào trang Đóng gói để gán."><span>{v} cont</span></Tooltip>
        : <Text type="secondary">chưa có</Text>,
      sorter: (a, b) => a.container_count - b.container_count,
    },
    {
      title: 'Trị giá HĐ', dataIndex: 'total_value_usd', width: 130, align: 'right',
      render: (v: number | null) => fmtUSD(v),
      sorter: (a, b) => (a.total_value_usd || 0) - (b.total_value_usd || 0),
    },
    {
      title: 'Đã thu (mức HĐ)', dataIndex: 'actual_payment_amount', width: 140, align: 'right',
      render: (v: number | null) => <span style={{ color: (v || 0) > 0 ? '#15803d' : '#9ca3af' }}>{fmtUSD(v || 0)}</span>,
    },
    {
      title: '', width: 130,
      render: (_, r) => (
        <Button size="small" onClick={() => navigate(`/sales/orders/${r.sales_order_id}/packing`)}>
          Chia lô
        </Button>
      ),
    },
  ]

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Title level={4} style={{ margin: 0 }}>
          <InboxOutlined /> Sổ lô — thanh toán theo từng lô
        </Title>
        <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>Làm mới</Button>
      </div>

      {err && (
        <Alert
          type="error" showIcon style={{ marginBottom: 12 }}
          message="Không tải được sổ lô"
          description={err}
          action={<Button size="small" onClick={load}>Thử lại</Button>}
        />
      )}

      {/* KPI */}
      <Row gutter={12} style={{ marginBottom: 12 }}>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="Số lô" value={t?.lotCount ?? 0} />
            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
              {t?.lotsPaid ?? 0} đã thu · {t?.lotsPartial ?? 0} thu 1 phần · {t?.lotsUnpaid ?? 0} chưa thu
            </div>
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="Trị giá các lô" value={fmtUSD(t?.lotValueUsd ?? 0)} valueStyle={{ fontSize: 20 }} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic
              title="Đã thu theo lô" value={fmtUSD(t?.lotPaidUsd ?? 0)}
              valueStyle={{ fontSize: 20, color: '#15803d' }}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic
              title="Còn nợ theo lô" value={fmtUSD(t?.lotRemainingUsd ?? 0)}
              valueStyle={{ fontSize: 20, color: '#dc2626' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Hai khoản tiền KHÔNG nằm trong sổ lô — nói thẳng, đừng để người xem tự phát hiện */}
      {t && (t.unassignedPaidUsd > 0 || t.valueNotInLotsUsd > 0) && (
        <Alert
          type="info" showIcon style={{ marginBottom: 12 }}
          message="Phần sổ lô chưa với tới"
          description={
            <div style={{ fontSize: 13 }}>
              {t.valueNotInLotsUsd > 0 && (
                <div>
                  • <strong>{fmtUSD(t.valueNotInLotsUsd)}</strong> thuộc {ledger?.ordersWithoutLots.length} hợp đồng
                  {' '}<strong>chưa chia lô</strong> — xem bảng dưới, bấm "Chia lô" để gán số lô cho container.
                </div>
              )}
              {t.unassignedPaidUsd > 0 && (
                <div>
                  • <strong>{fmtUSD(t.unassignedPaidUsd)}</strong> đã thu nhưng <strong>chưa gắn số lô</strong>,
                  {' '}nên không quy được về lô nào. Sửa lại khoản thu trong tab Tài chính của đơn để gắn lô.
                </div>
              )}
            </div>
          }
        />
      )}

      <Card
        size="small"
        title={
          <Space wrap>
            <span>Lô ({lots.length})</span>
            <Segmented
              size="small"
              value={payFilter}
              onChange={(v) => setPayFilter(v as PayFilter)}
              options={[
                { label: 'Tất cả', value: 'all' },
                { label: 'Chưa thu', value: 'unpaid' },
                { label: 'Thu 1 phần', value: 'partial' },
                { label: 'Đã thu đủ', value: 'paid' },
              ]}
            />
            <Input.Search
              placeholder="Số HĐ, khách, INV, B/L…"
              allowClear
              size="small"
              style={{ width: 240 }}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </Space>
        }
        style={{ marginBottom: 12 }}
      >
        <Table<SalesLotRow>
          rowKey="lot_id"
          size="small"
          loading={loading}
          columns={lotCols}
          dataSource={lots}
          scroll={{ x: 1280 }}
          pagination={{ pageSize: 50, showSizeChanger: true, showTotal: (n) => `${n} lô` }}
          summary={(rows) => {
            const v = rows.reduce((s, r) => s + (r.value_usd || 0), 0)
            const p = rows.reduce((s, r) => s + r.paid_usd, 0)
            const rm = rows.reduce((s, r) => s + r.remaining_usd, 0)
            return (
              <Table.Summary fixed>
                <Table.Summary.Row style={{ background: '#fafafa', fontWeight: 700 }}>
                  <Table.Summary.Cell index={0} colSpan={4}>Cộng {rows.length} lô</Table.Summary.Cell>
                  <Table.Summary.Cell index={4} align="right">{fmtUSD(v)}</Table.Summary.Cell>
                  <Table.Summary.Cell index={5} align="right">
                    <span style={{ color: '#15803d' }}>{fmtUSD(p)}</span>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={6} align="right">
                    <span style={{ color: '#dc2626' }}>{fmtUSD(rm)}</span>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={7} colSpan={3} />
                </Table.Summary.Row>
              </Table.Summary>
            )
          }}
        />
      </Card>

      <Card
        size="small"
        title={<span>Hợp đồng chưa chia lô ({ordersNoLots.length}) — vẫn theo dõi ở mức hợp đồng</span>}
      >
        <Table<OrderWithoutLots>
          rowKey="sales_order_id"
          size="small"
          loading={loading}
          columns={noLotCols}
          dataSource={ordersNoLots}
          scroll={{ x: 860 }}
          pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (n) => `${n} hợp đồng` }}
        />
      </Card>

      <QuickPayModal
        target={payTarget}
        onClose={() => setPayTarget(null)}
        onDone={() => { setPayTarget(null); message.success('Đã ghi nhận thu tiền cho lô'); load() }}
      />
    </div>
  )
}
