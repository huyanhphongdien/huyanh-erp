// ============================================================================
// KanbanCard — single order card in Kanban board
// File: src/pages/sales/components/KanbanCard.tsx
// ============================================================================

import { useMemo } from 'react'
import { Tooltip } from 'antd'
import { useNavigate } from 'react-router-dom'
import {
  type SalesStage,
  getSLAStatus,
  formatDwell,
  SLA_PILL_COLORS,
  paymentBucket,
} from '../../../services/sales/salesStages'
import { remainingTons, type LotProgress } from '../../../services/logistics/dispatchService'
import LotProgressBadge, { DispatchChips } from '../../../components/sales/LotProgressBadge'
import LotChipStrip, { mergeLotAxes } from '../../../components/sales/LotChipStrip'
import type { OrderLotMoney } from '../../../services/sales/salesOrderPaymentService'
import { soDisplayCode, PAYMENT_STATUS_LABELS } from '../../../services/sales/salesTypes'
import { fmtMoney, isVnd } from '../../../services/sales/salesMoney'
import { fmtDate, fmtNum } from '../../../utils/format'
import { palette } from '../../../theme/palette'

export interface KanbanOrder {
  id: string
  code: string
  contract_no: string | null
  /** Tên NGẮN người mua (partyShortName) */
  customer_short: string
  grade: string
  quantity_tons: number | null
  status: string           // cần để kẹp "đã giao xong" khi tính Còn thiếu
  total_value_usd: number | null
  /** Tuỳ chọn: có thì thẻ hiện tiền theo ĐÚNG đồng tiền của đơn (đơn VNĐ không gắn "$"). */
  currency?: string | null
  total_value_vnd?: number | null
  payment_status: string | null       // unpaid | partial | paid — tiền về
  actual_payment_amount: number | null // USD đã thu thực tế
  delivery_date: string | null
  etd: string | null
  current_stage: SalesStage
  stage_started_at: string | null
  stage_sla_hours: number | null
  current_owner_name: string | null

  // ── Các bên của đơn + họ HĐ (sales_family_parties_p1, 17/11/2026) — vắng khi chưa migration ──
  /** Tên đầy đủ người mua — tooltip "Người mua … → Người nhận hàng …" */
  customer_name?: string | null
  /** Người nhận hàng RIÊNG (khác người mua), tên ngắn qua partyShortName. Vắng/null = giao thẳng cho người mua. */
  receiver_short?: string | null
  receiver_name?: string | null
  /** Đơn GỐC (đợt mua tiếp) — null với HĐ mới */
  parent_order_id?: string | null
  /** Số HĐ của đơn gốc (chỉ đợt con) */
  parent_contract_no?: string | null
  parent_contract_date?: string | null
  /** Số đợt (trigger cấp; gốc = null ≙ đợt 1) */
  continuation_seq?: number | null
  /** Số đơn CẢ HỌ đang có trên bảng (gốc tính đợt 1) — trang đếm bằng useMemo; gốc ≥ 2 mới vẽ dòng ⧉ */
  family_size?: number
  /** Ngày ký HĐ gốc — tooltip dòng ⧉ */
  family_contract_date?: string | null
}

interface KanbanCardProps {
  order: KanbanOrder
  onDragStart: (orderId: string) => void
  onDragEnd: () => void
  lp?: LotProgress
  lotPay?: OrderLotMoney   // thu tiền theo lô
  /** "Soi HĐ": 'focus' = thẻ thuộc họ đang soi (vành thương hiệu) · 'dim' = thẻ khác (mờ) */
  familyHighlight?: 'focus' | 'dim' | null
  /** Bấm dòng ⧉ → soi cả HĐ (truyền id ĐƠN GỐC) */
  onFamilyClick?: (rootId: string) => void
}

// Bóng thẻ thường / khi rê chuột. Soi HĐ thêm vành 2px màu thương hiệu bằng box-shadow — KHÔNG đụng viền
// trái (viền trái là màu SLA).
const SHADOW = '0 1px 2px rgba(0,0,0,0.04)'
const SHADOW_HOVER = '0 2px 6px rgba(0,0,0,0.1)'
/** Khoảng trắng KHÔNG ngắt dòng (U+00A0) — giữ "·" dính với grade */
const NBSP = String.fromCharCode(0xa0)

export default function KanbanCard({ order, onDragStart, onDragEnd, lp, lotPay, familyHighlight, onFamilyClick }: KanbanCardProps) {
  const navigate = useNavigate()

  // ── Họ HĐ: đợt con LUÔN thuộc họ ≥ 2 đơn (nó + gốc); gốc chỉ vẽ khi có đợt đang chạy ──
  const isChild = !!order.parent_order_id
  const familyRootId = order.parent_order_id || order.id
  const familySize = Math.max(order.family_size ?? 1, isChild ? 2 : 1)
  const family = (() => {
    if (!isChild && familySize < 2) return null
    const rootNo = isChild ? (order.parent_contract_no || '') : soDisplayCode(order)
    const signed = order.family_contract_date ?? order.parent_contract_date ?? null
    const who = [order.customer_short !== '—' ? order.customer_short : '', signed ? `ký ${fmtDate(signed)}` : '']
      .filter(Boolean).join(', ')
    const label = isChild
      ? `⧉ Đợt ${order.continuation_seq ?? '?'}${rootNo ? ` · HĐ ${rootNo}` : ''}`
      : `⧉ HĐ gốc · ${familySize} đợt`
    const tip = isChild
      ? `Mua tiếp theo HĐ ${rootNo || 'gốc'}${who ? ` (${who})` : ''} — không ký HĐ mới. HĐ có ${familySize} đợt đang chạy. Bấm để soi cả HĐ.`
      : `HĐ gốc ${rootNo}${who ? ` (${who})` : ''} — có ${familySize} đợt đang chạy, kể cả HĐ này. Mỗi đợt là một đơn riêng (tiền, lô, công nợ riêng). Bấm để soi cả HĐ.`
    return { label, tip }
  })()
  const ring = familyHighlight === 'focus' ? `0 0 0 2px ${palette.brand}, ` : ''
  const partiesTip = order.receiver_short
    ? `Người mua (đứng tên HĐ, trả tiền, công nợ): ${order.customer_name || order.customer_short} → Người nhận hàng: ${order.receiver_name || order.receiver_short}`
    : null

  // Ghép hai trục theo số lô. Đơn chưa chia lô → mảng rỗng → rơi về badge cũ theo container.
  const chipLots = useMemo(
    () => mergeLotAxes(lp?.deliveryByLot, lotPay?.moneyByLot),
    [lp?.deliveryByLot, lotPay?.moneyByLot],
  )

  const elapsedHours = order.stage_started_at
    ? (Date.now() - new Date(order.stage_started_at).getTime()) / (1000 * 3600)
    : null
  const slaStatus = getSLAStatus(order.stage_started_at, order.stage_sla_hours, order.current_stage)
  const slaColors = SLA_PILL_COLORS[slaStatus]

  const etdLabel = order.etd || order.delivery_date
  const daysToETD = etdLabel
    ? Math.ceil((new Date(etdLabel).getTime() - Date.now()) / (1000 * 3600 * 24))
    : null

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', order.id)
    e.currentTarget.classList.add('dragging')
    onDragStart(order.id)
  }

  const handleDragEnd = (e: React.DragEvent) => {
    e.currentTarget.classList.remove('dragging')
    onDragEnd()
  }

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onClick={() => navigate(`/sales/orders/${order.id}`)}
      style={{
        background: '#ffffff',
        border: `1px solid ${slaColors.fg}40`,
        borderLeft: `3px solid ${slaColors.fg}`,
        borderRadius: 8,
        padding: '10px 12px',
        marginBottom: 8,
        cursor: 'grab',
        userSelect: 'none',
        transition: 'all 0.15s',
        boxShadow: ring + SHADOW,
        opacity: familyHighlight === 'dim' ? 0.35 : 1,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = ring + SHADOW_HOVER }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = ring + SHADOW }}
    >
      {/* Top row: code + value */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#111111', fontFamily: 'JetBrains Mono, monospace' }}>
          {soDisplayCode(order)}
        </span>
        {(isVnd(order.currency) ? order.total_value_vnd != null : order.total_value_usd != null) && (
          <span style={{ fontSize: 10, color: '#6b7280' }}>
            {isVnd(order.currency)
              ? fmtMoney(order.total_value_vnd, 'VND', { compact: true })
              : fmtMoney(order.total_value_usd, 'USD', { compact: true })}
          </span>
        )}
      </div>

      {/* Dòng 2: NGƯỜI MUA → người nhận · grade. "→ người nhận" chỉ khi đơn có người nhận riêng (4 đơn
          Jintong mua thẳng vẫn y như cũ); chữ xám, tối đa ~90px rồi cắt "…", tooltip ghi đủ tên hai bên. */}
      {(() => {
        const line = (
          <div style={{ fontSize: 12, color: '#374151', marginBottom: 4, lineHeight: 1.35 }}>
            <strong>{order.customer_short}</strong>
            {/* Khoảng trắng thường (không dùng margin): xuống dòng thì không thụt đầu dòng */}
            {order.receiver_short && <>{' '}<span style={{
              color: '#6b7280', display: 'inline-block', maxWidth: 90,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'bottom',
            }}>
              → {order.receiver_short}
            </span></>}
            {/* "·" dính với grade (khoảng trắng không ngắt) — cột hẹp xuống dòng thì không để "·" mồ côi */}
            {order.grade && <span style={{ marginLeft: 6, color: '#6b7280' }}>{`·${NBSP}${order.grade}`}</span>}
          </div>
        )
        return partiesTip ? <Tooltip title={partiesTip}>{line}</Tooltip> : line
      })()}

      {/* Dòng 3 (họ HĐ ≥ 2 đơn): "⧉ Đợt 3 · HĐ HA20260302" / "⧉ HĐ gốc · 3 đợt". Màu thương hiệu (không dùng
          màu trạng thái), 1 dòng cắt "…". Bấm được theo mẫu chấm tiền: Tooltip hover+click + stopPropagation
          (cả thẻ là vùng kéo/bấm mở đơn; điện thoại không có hover). */}
      {family && (
        <Tooltip title={family.tip} trigger={['hover', 'click']}>
          <div
            role="button"
            tabIndex={0}
            aria-label={`${family.label} — soi cả HĐ`}
            onClick={(e) => { e.stopPropagation(); onFamilyClick?.(familyRootId) }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onFamilyClick?.(familyRootId) }
            }}
            style={{
              fontSize: 10.5, fontWeight: 600, color: palette.brand, marginBottom: 4, lineHeight: 1.4,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer',
            }}
          >
            {family.label}
          </div>
        </Tooltip>
      )}

      {/* Owner */}
      {order.current_owner_name && (
        <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>
          👤 {order.current_owner_name}
        </div>
      )}

      {/* ─── DÒNG LÔ ───────────────────────────────────────────────────────────
          Dải viên lô THAY hai badge cũ (`📦 x/y lô` và `💵 x/y lô đã thu`). Ít thứ
          hơn trên thẻ mà nói được nhiều hơn: mỗi viên là một lô, thân = giao, máng = tiền.
          Thẻ ở cột hẹp nhất 180px; 4 viên cỡ xs + khoảng cách ≈ 73px, còn dư chỗ.

          Pill tiền cấp ĐƠN co thành một chấm 8px: nó chỉ còn nhiệm vụ nói "đơn này đã tới
          khâu thu chưa", chi tiết đã nằm ở máng từng viên. Tiết kiệm ~62px. */}
      <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {/* Dải viên `flex: 1 1 0` để LUÔN ở lại dòng 1 và tự wrap viên bên trong.
            Nếu để nó co giãn tự nhiên thì ở cột hẹp nhất (180px, tức lòng thẻ 134px) dải
            4 viên + "còn thiếu 403.20T" + chấm = 172px → tràn dòng, và khi tràn thì
            marginLeft:auto được giải theo TỪNG DÒNG nên chữ dán mép phải dòng 2, zigzag. */}
        <span style={{ flex: '1 1 0', minWidth: 0, display: 'inline-flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
          {chipLots.length > 0
            ? <LotChipStrip lots={chipLots} size="xs" />
            : lp && lp.contsTotal > 0 && <LotProgressBadge p={lp} small showDispatch={false} />}

          {/* Container CHƯA gán lô không nằm trong bất kỳ viên nào — Bảng đã cảnh báo,
              thẻ Kanban cũng phải, nếu không HA20260075 nhìn như đã giao xong 1/1 lô
              trong khi còn 15 cont chưa chia. */}
          {chipLots.length > 0 && lp && lp.contsNoLot > 0 && (
            <Tooltip title={`${lp.contsNoLot} container chưa gán lô — không nằm trong dải viên bên trái.`}>
              <span style={{ fontSize: 9.5, fontWeight: 700, color: '#dc2626', cursor: 'help' }}>
                ⚠+{lp.contsNoLot}
              </span>
            </Tooltip>
          )}
        </span>

        {(() => {
          const rem = remainingTons(order.quantity_tons, lp, order.status)
          return rem > 0
            ? <span style={{ fontSize: 10, fontWeight: 700, color: '#dc2626', flex: 'none' }}>còn thiếu {fmtNum(rem, 2)}T</span>
            : <span style={{ fontSize: 10, fontWeight: 600, color: '#15803d', flex: 'none' }}>đủ hàng</span>
        })()}

        {/* Tiền cấp ĐƠN — dùng chung paymentBucket() với KPI/lọc ở KanbanPage.
            Co thành chấm để nhường chỗ cho dải viên, nhưng phải bấm được: điện thoại
            không có hover, mà trigger mặc định của Tooltip là hover — chạm vào là
            điều hướng sang trang đơn thay vì đọc được nghĩa của chấm. */}
        {(() => {
          const b = paymentBucket(order)
          if (b === 'none') return null
          let ring = false
          // Nhãn dùng chung PAYMENT_STATUS_LABELS (salesTypes) — cùng chữ với Sổ lô / Dòng tiền
          const color = b === 'paid' ? '#15803d' : b === 'partial' ? '#1d4ed8' : '#b45309'
          const txtBase = PAYMENT_STATUS_LABELS[b]
          let txt = txtBase
          // Đơn ĐÃ có tiền về nhưng KHÔNG đồng nào gắn số lô: máng của mọi viên đều rỗng
          // trong khi chấm này lại xanh — hai thứ cạnh nhau nói ngược nhau.
          // ⚠ Phải kiểm paidUsd của TỪNG lô, KHÔNG dùng lotsPaid: lotsPaid là số lô đã thu
          // ĐỦ. Đơn thu 60% một lô có lotsPaid = 0 nhưng tiền RÕ RÀNG đã gắn lô — dùng
          // lotsPaid là tố oan.
          const noLotMoney = !!lotPay && lotPay.lotsTotal > 0
            && lotPay.moneyByLot.every((l) => l.paidUsd <= 0)
          if (b !== 'unpaid' && noLotMoney) {
            txt = `${txt} — nhưng chưa đồng nào gắn số lô, không quy được về lô nào`
            // Giữ NGUYÊN màu chấm (KPI vẫn đếm đơn này là đã thu), đánh dấu bằng vành
            // ngoài. Đổi màu sang hổ phách sẽ làm nó lẫn với "chưa thu tiền".
            ring = true
          }
          return (
            <Tooltip title={txt} trigger={['hover', 'click']}>
              <span
                onClick={(e) => e.stopPropagation()}
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 24, height: 24, flex: 'none', cursor: 'help', margin: '-8px 0',
                }}
              >
                <span style={{
                  width: 8, height: 8, borderRadius: '50%', background: color,
                  boxShadow: ring ? '0 0 0 2px #fff, 0 0 0 3.5px #b45309' : undefined,
                }} />
              </span>
            </Tooltip>
          )
        })()}
      </div>

      {/* Lối nhảy sang LỆNH ĐIỀU ĐỘNG — trước Đợt 4 nằm trong LotProgressBadge; dải viên
          không có nó, nên phải giữ riêng ở đây, nếu không đơn có lô sẽ MẤT hẳn lối này. */}
      {lp && lp.dispatchOrders.length > 0 && (
        <div style={{ marginTop: 4 }}>
          <DispatchChips orders={lp.dispatchOrders} small />
        </div>
      )}

      {/* Footer: dwell + ETD countdown */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
        <span style={{ fontSize: 10, color: slaColors.fg, fontWeight: 500 }}>
          ⏱ {formatDwell(elapsedHours)}
          {slaStatus === 'overdue' && ' QUÁ SLA'}
          {slaStatus === 'at_risk' && ' (cận)'}
        </span>
        {etdLabel && daysToETD !== null && (
          <span style={{
            fontSize: 10,
            color: daysToETD < 0 ? '#ff5b4f' : daysToETD < 7 ? '#f59e0b' : '#6b7280',
            fontWeight: 500,
          }}>
            {daysToETD < 0
              ? `ETD qua ${Math.abs(daysToETD)} ngày`
              : daysToETD === 0
                ? 'ETD hôm nay'
                : `ETD còn ${daysToETD} ngày`}
          </span>
        )}
      </div>
    </div>
  )
}
