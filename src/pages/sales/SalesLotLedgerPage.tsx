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
  Button, Alert, Tooltip, Space, message, Modal, InputNumber,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { DollarOutlined, InboxOutlined, WarningOutlined, ReloadOutlined } from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  salesLotService,
  type LotLedger, type SalesLotRow, type OrderWithoutLots, type LotPaymentStatus,
  type LotDeliveryState,
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

/**
 * Trục GIAO — màu và nhãn. Tính từ chứng cứ container, KHÔNG từ `lot_status`.
 * `lot_status` là số nhập tay/chép xuống lúc backfill và đang trái chứng cứ ở 9/20 lô;
 * tô màu tiến độ bằng nó là gần một nửa số dòng sai màu ngay ngày đầu.
 */
const DELIVERY_TAG: Record<LotDeliveryState, { color: string; label: string; bar: string }> = {
  full:    { color: 'green',   label: 'Giao đủ',  bar: '#22c55e' },
  partial: { color: 'blue',    label: 'Giao dở',  bar: '#3b82f6' },
  none:    { color: 'default', label: 'Chưa đi',  bar: '#d1d5db' },
}

const LOT_STATUS_LABEL: Record<string, string> = {
  planning: 'Kế hoạch', packing: 'Đang đóng', shipped: 'Đã đi',
  delivered: 'Đã giao', cancelled: 'Đã huỷ',
}

/**
 * Bộ lọc nhanh. Trộn hai trục vào một dải nút là cố ý: người dùng đến trang này với
 * đúng một câu hỏi tại một thời điểm ("lô nào chưa thu" HAY "lô nào đang kẹt"),
 * không phải hai câu cùng lúc. Hai dải Segmented sẽ tốn chỗ mà không ai dùng chéo.
 */
type PayFilter =
  | 'all' | 'unpaid' | 'partial' | 'paid'
  | 'shipped_unpaid' | 'not_shipped' | 'mismatch' | 'unpriced'

export default function SalesLotLedgerPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const salesRole = getSalesRole(user)
  const canPay = salesRole === 'accounting' || salesRole === 'admin'

  // Lọc theo 1 hợp đồng, đến từ link "ghi thu theo lô ↗" ở trang Theo dõi lô hàng.
  // Không đọc tham số này thì link đó là lời hứa suông — bấm xong ra trang không lọc gì.
  const [searchParams, setSearchParams] = useSearchParams()
  const orderFilter = searchParams.get('order')

  const [ledger, setLedger] = useState<LotLedger | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [payFilter, setPayFilter] = useState<PayFilter>('all')
  const [payTarget, setPayTarget] = useState<QuickPayTarget | null>(null)
  // Lô đang được CHỐT trị giá. Đây là nơi DUY NHẤT trong app tạo dòng sales_order_lots
  // cho lô sinh ra từ trang Đóng gói — trang đó chỉ ghi lot_no lên container.
  const [priceTarget, setPriceTarget] = useState<SalesLotRow | null>(null)
  const [priceValue, setPriceValue] = useState<number | null>(null)
  const [pricing, setPricing] = useState(false)

  const confirmPrice = async () => {
    if (!priceTarget) return
    // ⚠ Ô nhập là controlled và HIỆN SẴN số tạm tính, nhưng priceValue chỉ được set trong
    // onChange. Nếu chỉ đọc priceValue thì người dùng mở modal, thấy đúng số mình muốn,
    // bấm Chốt và bị báo "Nhập trị giá lô" — từ chối chính con số nó đang hiện.
    // Đây là đường dùng PHỔ BIẾN NHẤT (số tạm tính thường đúng bằng số trên Invoice).
    const v = priceValue ?? priceTarget.value_est_usd ?? null
    if (!v || v <= 0) {
      message.error('Nhập trị giá lô theo đúng chứng từ đã phát cho khách')
      return
    }
    setPricing(true)
    try {
      // Lô đã có dòng thì UPDATE; chưa có mới INSERT. Gate theo has_lot_row chứ không theo
      // value_source: lô có dòng nhưng value_usd NULL cũng ra value_source='invoice', và
      // INSERT khi đó vi phạm uq_sales_order_lots.
      if (priceTarget.has_lot_row && priceTarget.lot_id) {
        await salesLotService.updateLot(priceTarget.lot_id, { value_usd: v })
      } else {
        await salesLotService.createLot(priceTarget.sales_order_id, priceTarget.lot_no, {
          value_usd: v,
          // KHÔNG lưu net_kg_total vào net_weight_kg: đó là số ĐỘNG, bị ghi đè mỗi lần gán
          // container. Cột net_weight_kg của lô là số CHỐT — để trống còn hơn chốt sai.
          unit_price_usd: priceTarget.unit_price_usd,
        })
      }
      message.success(`Đã chốt trị giá lô ${priceTarget.lot_no} — ${fmtUSD(v)}`)
      setPriceTarget(null)
      setPriceValue(null)
      load()
    } catch (e: any) {
      // Hai tab, hoặc bảng đã cũ: người khác vừa chốt lô này xong.
      if (e?.code === '23505') {
        message.warning('Lô này vừa được người khác chốt trị giá. Đang tải lại.')
        setPriceTarget(null); setPriceValue(null); load()
      } else {
        message.error(e?.message || 'Không chốt được trị giá lô')
      }
    } finally {
      setPricing(false)
    }
  }

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
    if (orderFilter) rows = rows.filter((l) => l.sales_order_id === orderFilter)
    if (payFilter === 'shipped_unpaid') {
      // Hàng đã sang khách mà tiền chưa về — rủi ro thật, không phải cảnh báo hình thức.
      rows = rows.filter((l) => l.delivery_state === 'full' && l.payment_status !== 'paid')
    } else if (payFilter === 'not_shipped') {
      rows = rows.filter((l) => l.delivery_state === 'none')
    } else if (payFilter === 'mismatch') {
      rows = rows.filter((l) => l.status_mismatch)
    } else if (payFilter === 'unpriced') {
      // Lô có container nhưng chưa ai chốt trị giá — tiền thu vào đây không có mẫu số tin được.
      rows = rows.filter((l) => !l.has_lot_row)
    } else if (payFilter !== 'all') {
      rows = rows.filter((l) => l.payment_status === payFilter)
    }
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
  }, [ledger, payFilter, q, orderFilter])

  const ordersNoLots = useMemo(() => {
    const kw = q.trim().toLowerCase()
    let rows = ledger?.ordersWithoutLots ?? []
    // PHẢI lọc theo orderFilter ở đây nữa. Thiếu chỗ này thì link "ghi thu theo lô" từ
    // trang Theo dõi lô hàng dẫn tới bảng lô rỗng + 95 hợp đồng không lọc — mà 65/71 đơn
    // hiện chưa chia lô, kể cả đơn DUY NHẤT đang có tiền.
    if (orderFilter) rows = rows.filter((o) => o.sales_order_id === orderFilter)
    if (kw) {
      rows = rows.filter((o) =>
        (o.contract_no || '').toLowerCase().includes(kw)
        || (o.customer_name || '').toLowerCase().includes(kw),
      )
    }
    return rows
  }, [ledger, q, orderFilter])

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
      // Trục GIAO — tính từ CHỨNG CỨ (container + dòng lệnh xe), không đọc lot_status.
      title: 'Giao hàng', dataIndex: 'delivery_state', width: 168,
      render: (v: LotDeliveryState, r) => {
        // Lô có container nhưng chưa nhập số bành → net_kg_total = 0. Nếu để thanh rơi
        // về 0% thì dòng đó hiện "Giao đủ · 5/5 cont" cạnh một thanh trống — tự mâu thuẫn.
        // Rơi về tỉ lệ CONTAINER trong trường hợp đó.
        const pct = r.net_kg_total > 0
          ? (r.net_kg_delivered / r.net_kg_total) * 100
          : r.container_count > 0
            ? (r.containers_delivered / r.container_count) * 100
            : 0
        const c = DELIVERY_TAG[v]
        return (
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 3 }}>
              <Tag color={c.color} style={{ margin: 0 }}>{c.label}</Tag>
              <span style={{ fontSize: 11, color: '#6b7280', fontVariantNumeric: 'tabular-nums' }}>
                {r.containers_delivered}/{r.container_count} cont
              </span>
              {r.status_mismatch && (
                <Tooltip
                  title={`Bảng ghi "${LOT_STATUS_LABEL[r.lot_status] || r.lot_status}" nhưng chứng cứ giao nói khác (${r.containers_delivered}/${r.container_count} cont đã đi). Cột "Ghi chú trạng thái" là số nhập tay, không phải chứng cứ.`}
                >
                  <span style={{ color: '#dc2626', fontWeight: 700, cursor: 'help' }}>⚠</span>
                </Tooltip>
              )}
            </div>
            <div style={{ height: 4, borderRadius: 2, background: '#e5e7eb', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.min(100, pct)}%`, background: c.bar, borderRadius: 2 }} />
            </div>
            <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
              {r.net_kg_total > 0
                ? `${fmtTon(r.net_kg_delivered)} / ${fmtTon(r.net_kg_total)}`
                : 'chưa nhập số bành'}
            </div>
          </div>
        )
      },
      filters: (Object.keys(DELIVERY_TAG) as LotDeliveryState[]).map((k) => ({ text: DELIVERY_TAG[k].label, value: k })),
      onFilter: (val, r) => r.delivery_state === val,
      sorter: (a, b) => {
        const ra = a.net_kg_total > 0 ? a.net_kg_delivered / a.net_kg_total : -1
        const rb = b.net_kg_total > 0 ? b.net_kg_delivered / b.net_kg_total : -1
        return ra - rb
      },
    },
    {
      // Số NHẬP TAY, giữ lại để đối chiếu — không dùng để kết luận tiến độ.
      title: 'Ghi chú trạng thái', dataIndex: 'lot_status', width: 118, align: 'center',
      render: (v: string, r) => (
        <Tag color={r.status_mismatch ? 'red' : undefined} style={{ margin: 0 }}>
          {LOT_STATUS_LABEL[v] || v}
        </Tag>
      ),
    },
    {
      title: 'KL chốt', dataIndex: 'net_weight_kg', width: 100, align: 'right',
      render: (v: number | null) => fmtTon(v),
      sorter: (a, b) => (a.net_weight_kg || 0) - (b.net_weight_kg || 0),
    },
    {
      title: 'Trị giá lô', dataIndex: 'value_usd', width: 150, align: 'right',
      render: (v: number | null, r) => {
        // ĐÃ CHỐT — đây là số dùng làm mẫu số thật.
        if (r.value_source === 'lot') return <strong>{fmtUSD(v)}</strong>

        // TẠM TÍNH — lô có container nhưng chưa ai chốt trị giá. KHÔNG được hiện như số
        // chốt: net_weight_kg bị ghi đè mỗi lần gán cont nên con số này đổi SAU khi hoá
        // đơn đã phát. Hệ thống cố tình KHÔNG tự chốt hộ.
        if (r.value_source === 'invoice') {
          return (
            <div>
              <Tooltip title="Số TẠM TÍNH theo công thức hoá đơn (tấn × đơn giá). Chưa chốt nên có thể đổi khi gán thêm container. Bấm Chốt để ghi lại theo đúng chứng từ.">
                <Text type="warning" style={{ fontStyle: 'italic' }}>≈ {fmtUSD(r.value_est_usd)}</Text>
              </Tooltip>
              {canPay && (
                <div>
                  <Button size="small" type="link" style={{ padding: 0, height: 18, fontSize: 11 }}
                    onClick={() => setPriceTarget(r)}>
                    Chốt trị giá
                  </Button>
                </div>
              )}
            </div>
          )
        }

        return (
          <Tooltip title="Lô chưa có trị giá và cũng chưa tính tạm được (thiếu đơn giá hoặc khối lượng) → không kết luận được đã thu đủ hay chưa.">
            <Text type="warning"><WarningOutlined /> chưa có</Text>
          </Tooltip>
        )
      },
      sorter: (a, b) => (a.value_usd ?? a.value_est_usd ?? 0) - (b.value_usd ?? b.value_est_usd ?? 0),
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
      title: '', width: 200,
      render: (_, r) => (
        <Space size={4}>
          <Button size="small" onClick={() => navigate(`/sales/orders/${r.sales_order_id}/packing`)}>
            Chia lô
          </Button>
          {/* Đợt 5 khoá ô sửa tiền ở tab Tài chính và trang Theo dõi lô hàng. Nếu đơn chưa
              chia lô mà ở đây cũng không ghi thu được thì việc ghi tiền BỊ CHẶN HẲN —
              65/71 đơn hiện chưa chia lô, kể cả đơn duy nhất đang có tiền. */}
          {canPay && (
            <Button
              size="small" type="primary" ghost icon={<DollarOutlined />}
              onClick={() => setPayTarget({
                id: r.sales_order_id,
                label: r.contract_no || '(chưa có số HĐ)',
                subLabel: 'cả đơn — chưa chia lô',
                outstanding: Math.max(0, (r.total_value_usd || 0) - (r.actual_payment_amount || 0)),
              })}
            >
              Ghi thu
            </Button>
          )}
        </Space>
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
            <Statistic
              title="Đã giao"
              value={t && t.netKgTotal > 0 ? `${((t.netKgDelivered / t.netKgTotal) * 100).toFixed(1)}%` : '—'}
              valueStyle={{ fontSize: 20, color: '#1d4ed8' }}
            />
            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
              {fmtTon(t?.netKgDelivered)} / {fmtTon(t?.netKgTotal)} · {t?.containersDelivered ?? 0}/{t?.containersTotal ?? 0} cont
            </div>
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic
              title="Đã thu theo lô" value={fmtUSD(t?.lotPaidUsd ?? 0)}
              valueStyle={{ fontSize: 20, color: '#15803d' }}
            />
            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
              trên {fmtUSD(t?.lotValueUsd ?? 0)} trị giá lô
            </div>
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic
              title="Còn nợ theo lô" value={fmtUSD(t?.lotRemainingUsd ?? 0)}
              valueStyle={{ fontSize: 20, color: '#dc2626' }}
            />
            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
              {t?.lotsDelivered ?? 0} lô đã giao đủ · {t?.lotsNotShipped ?? 0} lô chưa đi
            </div>
          </Card>
        </Col>
      </Row>

      {/* Đang lọc theo 1 hợp đồng — phải nói rõ, nếu không người dùng tưởng cả sổ chỉ có
          từng này lô và các con số tổng bên trên là sai. */}
      {orderFilter && (
        <Alert
          type="info" showIcon style={{ marginBottom: 12 }}
          message={
            <span>
              Đang lọc theo <strong>1 hợp đồng</strong> ({lots.length} lô).
              {' '}Các chỉ số phía trên vẫn tính trên <strong>toàn bộ</strong> sổ lô.
            </span>
          }
          action={
            <Button size="small" onClick={() => { searchParams.delete('order'); setSearchParams(searchParams, { replace: true }) }}>
              Xem tất cả
            </Button>
          }
        />
      )}

      {/* ⚠ ĐỪNG THÊM LẠI BANNER GIẢI THÍCH Ở ĐÂY.
          Trước 28/08/2026 chỗ này có hai khối Alert dài: một khối giảng về lô lệch trạng
          thái, một khối liệt kê 4 lý do tổng trang không bằng sổ đơn hàng. Nội dung đúng,
          nhưng đó là việc của người viết phần mềm chứ không phải của người bán hàng —
          đọc xong họ cũng không làm gì khác đi.

          Tín hiệu vẫn còn nguyên, chỉ gọn hơn:
            • số lô lệch  → viên lọc "Lệch trạng thái (n)" ngay dưới, bấm là ra đúng danh sách
            • từng dòng lệch → chấm đỏ ở cột Lô và cột Ghi chú trạng thái
            • các khoản tiền ngoài sổ lô → cột và dòng tổng của chính bảng

          Phần giải thích đầy đủ (vì sao không tự sửa, bốn nguồn chênh lệch, con số đo được)
          nằm ở docs/SO_LO_DOI_CHIEU.html. */}

      <Card
        size="small"
        title={<span>Lô ({lots.length})</span>}
        style={{ marginBottom: 12 }}
      >
        {/* Dải lọc nằm trong THÂN card, không phải title. Title của antd Card là
            overflow:hidden + nowrap — 7 nút ở đó thì cửa sổ hẹp cắt mất đúng hai nút
            "Chưa đi" và "Lệch trạng thái", mà từ 28/08/2026 viên "Lệch trạng thái (n)"
            là chỗ DUY NHẤT báo có lô lệch (banner giải thích đã gỡ). Cắt mất nó là
            mất luôn tín hiệu. */}
        <Space wrap style={{ marginBottom: 10 }}>
          <Segmented
            size="small"
            value={payFilter}
            onChange={(v) => setPayFilter(v as PayFilter)}
            options={[
              { label: 'Tất cả', value: 'all' },
              { label: `Đã giao, chưa thu${t ? ` (${t.lotsDeliveredUnpaid})` : ''}`, value: 'shipped_unpaid' },
              { label: 'Chưa thu', value: 'unpaid' },
              { label: 'Thu 1 phần', value: 'partial' },
              { label: 'Đã thu đủ', value: 'paid' },
              { label: `Chưa đi${t ? ` (${t.lotsNotShipped})` : ''}`, value: 'not_shipped' },
              { label: `Lệch trạng thái${t ? ` (${t.lotsMismatch})` : ''}`, value: 'mismatch' },
              { label: `Chưa chốt giá${t ? ` (${t.lotsUnpriced})` : ''}`, value: 'unpriced' },
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
        <Table<SalesLotRow>
          rowKey="lot_key"   // lot_id có thể NULL với lô chưa chốt trị giá
          size="small"
          loading={loading}
          columns={lotCols}
          dataSource={lots}
          scroll={{ x: 1400 }}
          pagination={{ pageSize: 50, showSizeChanger: true, showTotal: (n) => `${n} lô` }}
          summary={(rows) => {
            // 11 cột: 0 HĐ · 1 Lô · 2 Giao hàng · 3 Ghi chú · 4 KL chốt · 5 Trị giá
            //         6 Đã thu · 7 Còn nợ · 8 Thu tiền · 9 Chứng từ · 10 (nút)
            // Mẫu số HIỆU DỤNG (chốt → nếu chưa chốt thì tạm tính), y hệt mẫu số mà
            // remaining_usd của view đang dùng. Chỉ cộng value_usd thì lô chưa chốt vào
            // "còn nợ" mà không vào "trị giá" → Σ còn nợ vượt Σ trị giá. Đúng bất biến
            // mà migration p7 đã phải vá một lần.
            const v = rows.reduce((s, r) => s + (r.value_usd ?? r.value_est_usd ?? 0), 0)
            const vEstimated = rows.some((r) => r.value_usd == null && (r.value_est_usd ?? 0) > 0)
            const p = rows.reduce((s, r) => s + r.paid_usd, 0)
            const rm = rows.reduce((s, r) => s + r.remaining_usd, 0)
            const kgD = rows.reduce((s, r) => s + r.net_kg_delivered, 0)
            const kgT = rows.reduce((s, r) => s + r.net_kg_total, 0)
            const cD = rows.reduce((s, r) => s + r.containers_delivered, 0)
            const cT = rows.reduce((s, r) => s + r.container_count, 0)
            return (
              <Table.Summary fixed>
                {/* Mỗi cột MỘT ô, không gộp colSpan. Cột 0 fixed left và cột 10 fixed right;
                    gộp ô đè lên chúng thì khi cuộn ngang (scroll.x 1400 > laptop 1366 nên
                    LUÔN có cuộn) dòng tổng mất pin, trôi lệch khỏi phần thân bảng. */}
                <Table.Summary.Row style={{ background: '#fafafa', fontWeight: 700 }}>
                  <Table.Summary.Cell index={0}>Cộng {rows.length} lô</Table.Summary.Cell>
                  <Table.Summary.Cell index={1} />
                  <Table.Summary.Cell index={2}>
                    <span style={{ color: '#1d4ed8' }}>{fmtTon(kgD)} / {fmtTon(kgT)}</span>
                    <div style={{ fontSize: 10, fontWeight: 400, color: '#6b7280' }}>{cD}/{cT} cont</div>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={3} />
                  <Table.Summary.Cell index={4} />
                  <Table.Summary.Cell index={5} align="right">
                    {fmtUSD(v)}
                    {vEstimated && (
                      <Tooltip title="Có lô chưa chốt trị giá — tổng này gồm cả số tạm tính (net/1000 × đơn giá) và sẽ đổi nếu gán lại container.">
                        <span style={{ color: '#8a5a05', cursor: 'help' }}> ~</span>
                      </Tooltip>
                    )}
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={6} align="right">
                    <span style={{ color: '#15803d' }}>{fmtUSD(p)}</span>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={7} align="right">
                    <span style={{ color: '#dc2626' }}>{fmtUSD(rm)}</span>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={8} />
                  <Table.Summary.Cell index={9} />
                  <Table.Summary.Cell index={10} />
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

      <Modal
        title={priceTarget ? `Chốt trị giá — ${priceTarget.contract_no || ''} lô ${priceTarget.lot_no}` : ''}
        open={!!priceTarget}
        onCancel={() => { setPriceTarget(null); setPriceValue(null) }}
        onOk={confirmPrice}
        confirmLoading={pricing}
        okText="Chốt trị giá"
        cancelText="Huỷ"
        destroyOnClose
      >
        {priceTarget && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Giữ đúng MỘT câu — đây là lúc người dùng sắp gõ con số thành sổ, họ cần biết
                gõ số nào. Phần cơ chế (vì sao số tạm tính có thể đã đổi) nằm ở
                docs/SO_LO_DOI_CHIEU.html, không thuộc về màn hình. */}
            <Alert
              type="warning" showIcon
              message="Nhập đúng số trên Commercial Invoice đã phát cho khách"
              description={
                <span style={{ fontSize: 13 }}>
                  Số gợi ý <strong>{fmtUSD(priceTarget.value_est_usd)}</strong> là tạm tính, có thể khác chứng từ.
                </span>
              }
            />
            <div style={{ fontSize: 13, color: '#6b7280' }}>
              {priceTarget.containers_delivered}/{priceTarget.container_count} container đã giao ·
              {' '}{fmtTon(priceTarget.net_kg_total)} · đơn giá{' '}
              {priceTarget.unit_price_usd ? fmtUSD(priceTarget.unit_price_usd) + '/tấn' : '—'}
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>Trị giá lô (USD)</div>
              {/* min 0,01 chứ KHÔNG phải 0: value_usd = 0 không phải NULL, nên view
                  COALESCE ra 0 → "chưa kết luận được", còn phía TS lại rơi về số tạm tính
                  và dám kết luận "đã thu đủ" — hai bên nói khác nhau về cùng một lô.
                  Chốt bằng 0 là vô nghĩa; muốn bỏ chốt thì xoá, đừng nhập 0. */}
              <InputNumber
                autoFocus
                style={{ width: '100%' }}
                min={0.01}
                step={100}
                value={priceValue ?? priceTarget.value_est_usd ?? undefined}
                onChange={(v) => setPriceValue(v as number | null)}
                formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                parser={(v) => Number((v || '').replace(/,/g, ''))}
              />
            </div>
          </div>
        )}
      </Modal>

      <QuickPayModal
        target={payTarget}
        onClose={() => setPayTarget(null)}
        onDone={() => { setPayTarget(null); message.success('Đã ghi nhận thu tiền cho lô'); load() }}
      />
    </div>
  )
}
