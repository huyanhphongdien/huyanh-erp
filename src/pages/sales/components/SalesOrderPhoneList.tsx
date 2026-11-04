// ============================================================================
// SalesOrderPhoneList — Sổ đơn hàng bán ở khổ ĐIỆN THOẠI (≤ 640px): mỗi đơn một thẻ.
// File: src/pages/sales/components/SalesOrderPhoneList.tsx
//
// Vì sao có file này: bảng 20 cột của SalesOrderListPage rộng 2.200px, trên điện thoại
// chỉ thấy 3 cột đầu và chữ 10–11px (đo 04/11/2026 bằng Chrome DevTools, 390px). Thẻ giữ
// đúng những số người dùng cần khi cầm máy: số HĐ, khách, hàng, tấn (đặt/giao/thiếu), tiền,
// hạn giao/ETD, viên lô và bộ phận đang giữ. Chạm thẻ → mở panel chi tiết (full màn hình).
// Không có chọn nhiều dòng, sửa inline, ẩn/hiện cột — những việc đó làm trên máy tính.
// Dữ liệu, bộ lọc, phân trang vẫn do SalesOrderListPage nắm; file này chỉ vẽ.
// ============================================================================

import { Pagination, Skeleton, Tag } from 'antd'
import dayjs from 'dayjs'
import type { SalesOrder } from '../../../services/sales/salesTypes'
import { ORDER_STATUS_COLORS, ORDER_STATUS_LABELS, soDisplayCode } from '../../../services/sales/salesTypes'
import { fmtMoney, isVnd } from '../../../services/sales/salesMoney'
import { deliveredTons, remainingTons, type LotProgress } from '../../../services/logistics/dispatchService'
import type { OrderLotMoney } from '../../../services/sales/salesOrderPaymentService'
import LotChipStrip, { mergeLotAxes } from '../../../components/sales/LotChipStrip'
import { DispatchChips } from '../../../components/sales/LotProgressBadge'
import StagePill from '../../../components/common/StagePill'
import type { SalesStage } from '../../../services/sales/salesStages'

interface Props {
  orders: SalesOrder[]
  loading: boolean
  lotProgress: Record<string, LotProgress>
  lotPay: Record<string, OrderLotMoney>
  page: { current: number; pageSize: number; total: number; onChange: (page: number) => void }
  /** Chạm thẻ → mở chi tiết (panel trượt, full màn hình trên điện thoại). */
  onOpen: (order: SalesOrder) => void
  empty: React.ReactNode
}

const MONO = "'JetBrains Mono', Consolas, monospace"
const INK = '#111827'
const SUB = '#6b7280'
const BRAND = '#1B4D3E'

const tons = (n: number) => n.toLocaleString('vi-VN', { maximumFractionDigits: 2 })
const date = (d?: string | null) => (d ? dayjs(d).format('DD/MM') : '—')

/** Cờ từ mã nước ISO-2 (regional indicator) — không cần bảng tra như bản máy tính. */
function flag(cc?: string | null): string {
  const c = (cc || '').trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(c)) return ''
  return String.fromCodePoint(...[...c].map((ch) => 127397 + ch.charCodeAt(0)))
}

/** Viền trái: xanh = đã thanh toán · đỏ = quá hạn giao mà chưa xuất · xám = còn lại. */
function accent(o: SalesOrder): string {
  if (o.status === 'paid') return '#52c41a'
  if (o.status === 'cancelled') return '#d9d9d9'
  if (o.delivery_date && dayjs(o.delivery_date).isBefore(dayjs(), 'day')
    && !['shipped', 'delivered', 'invoiced', 'paid'].includes(o.status)) return '#f5222d'
  return '#e5e7eb'
}

function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 11, color: SUB, letterSpacing: 0.3, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, fontFamily: MONO, color: tone || INK, lineHeight: 1.25, whiteSpace: 'nowrap' }}>{value}</div>
    </div>
  )
}

function OrderCard({ o, p, money, onOpen }: { o: SalesOrder; p?: LotProgress; money?: OrderLotMoney; onOpen: () => void }) {
  const c = o.customer
  const cancelled = o.status === 'cancelled'
  const d = cancelled ? null : deliveredTons(o.quantity_tons, p, o.status)
  const rem = cancelled ? 0 : remainingTons(o.quantity_tons, p, o.status)
  const chips = p && p.contsTotal > 0 ? mergeLotAxes(p.deliveryByLot, money?.moneyByLot) : []
  const remaining = o.remaining_amount
    ?? ((o.total_value_usd || 0) - ((o as any).deposit_amount || 0) - ((o as any).discount_amount || 0) - ((o as any).bank_charges || 0))
  const total = isVnd(o.currency)
    ? fmtMoney(o.total_value_vnd, 'VND')
    : fmtMoney(o.total_value_usd, 'USD', { decimals: 0 })

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen() } }}
      style={{
        background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', borderLeft: `4px solid ${accent(o)}`,
        padding: '12px 14px', boxShadow: '0 1px 2px rgba(0,0,0,.04)', opacity: cancelled ? 0.6 : 1,
        cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
      }}
    >
      {/* Dòng 1: số HĐ + trạng thái */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 15, color: BRAND, lineHeight: 1.2 }}>{soDisplayCode(o)}</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: INK, lineHeight: 1.3, marginTop: 3, overflowWrap: 'anywhere' }}>
            {c ? `${flag(c.country)} ${c.short_name || c.name}`.trim() : <span style={{ color: SUB, fontWeight: 400 }}>Chưa có khách</span>}
          </div>
        </div>
        <Tag color={ORDER_STATUS_COLORS[o.status]} style={{ margin: 0, fontSize: 12, lineHeight: '22px', flexShrink: 0 }}>
          {ORDER_STATUS_LABELS[o.status] || o.status}
        </Tag>
      </div>

      {/* Loại hàng: tên hỗn hợp rất dài → tối đa 2 dòng */}
      {o.grade && (
        <div style={{
          fontSize: 12.5, color: '#374151', marginTop: 4, lineHeight: 1.35,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>
          {o.grade}
        </div>
      )}

      {/* Tấn: đặt · đã giao · còn thiếu */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 10,
        padding: '8px 10px', background: '#f6f8f7', borderRadius: 8,
      }}>
        <Stat label="SL (T)" value={o.quantity_tons != null ? tons(o.quantity_tons) : '—'} />
        <Stat label="Đã giao" value={d && d.tons ? `${tons(d.tons)}${d.estimated ? '~' : ''}` : '—'} tone={d && d.tons ? '#15803d' : SUB} />
        <Stat
          label="Còn thiếu"
          value={cancelled ? '—' : rem <= 0 ? 'Đủ' : tons(rem)}
          tone={cancelled ? SUB : rem <= 0 ? '#15803d' : '#dc2626'}
        />
      </div>

      {/* Tiền + mốc ngày */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 8, fontSize: 12.5, color: SUB }}>
        <span>Thành tiền <b style={{ fontFamily: MONO, color: BRAND }}>{total}</b></span>
        {remaining > 0 && <span>Còn lại <b style={{ fontFamily: MONO, color: '#1677ff' }}>{fmtMoney(remaining, 'USD', { decimals: 0 })}</b></span>}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 14px', marginTop: 4, fontSize: 12.5, color: SUB }}>
        <span>Hạn giao <b style={{ color: INK }}>{date(o.delivery_date)}</b></span>
        <span>ETD <b style={{ color: INK }}>{date(o.etd)}</b></span>
        {o.incoterm && <span><b style={{ color: INK }}>{o.incoterm}</b></span>}
        {o.booking_reference && <span>BKG <b style={{ color: INK, fontFamily: MONO }}>{o.booking_reference}</b></span>}
      </div>

      {/* Lô + bộ phận đang giữ */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', minWidth: 0 }}>
          {chips.length > 0 ? (
            <>
              <LotChipStrip lots={chips} size="s" />
              <span style={{ fontSize: 11, color: SUB, fontFamily: MONO }}>
                {p!.lotsDelivered}/{p!.lotsTotal} giao
                {money ? ` · ${money.lotsPaid}/${money.lotsTotal} thu` : ''}
              </span>
            </>
          ) : p && p.contsTotal > 0 ? (
            <span style={{ fontSize: 12, color: SUB }}>{p.contsDelivered}/{p.contsTotal} cont đã giao</span>
          ) : null}
          {p && p.dispatchOrders.length > 0 && <DispatchChips orders={p.dispatchOrders} />}
        </div>
        {!cancelled && (
          <StagePill stage={(o.current_stage as SalesStage) || 'sales'} stageStartedAt={o.stage_started_at} slaHours={o.stage_sla_hours} variant="compact" />
        )}
      </div>
    </div>
  )
}

export default function SalesOrderPhoneList({ orders, loading, lotProgress, lotPay, page, onOpen, empty }: Props) {
  if (loading && orders.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: 14 }}>
            <Skeleton active paragraph={{ rows: 3 }} title={{ width: '40%' }} />
          </div>
        ))}
      </div>
    )
  }
  if (!loading && orders.length === 0) {
    return <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb' }}>{empty}</div>
  }
  return (
    <div style={{ opacity: loading ? 0.6 : 1, transition: 'opacity .15s' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {orders.map((o) => (
          <OrderCard key={o.id} o={o} p={lotProgress[o.id]} money={lotPay[o.id]} onOpen={() => onOpen(o)} />
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 14, padding: '0 2px' }}>
        <span style={{ fontSize: 12.5, color: SUB }}>Tổng {page.total.toLocaleString('vi-VN')} đơn</span>
        <Pagination simple current={page.current} pageSize={page.pageSize} total={page.total} onChange={page.onChange} />
      </div>
    </div>
  )
}
