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
import { soDisplayCode } from '../../../services/sales/salesTypes'

export interface KanbanOrder {
  id: string
  code: string
  contract_no: string | null
  customer_short: string
  grade: string
  quantity_tons: number | null
  status: string           // cần để kẹp "đã giao xong" khi tính Còn thiếu
  total_value_usd: number | null
  payment_status: string | null       // unpaid | partial | paid — tiền về
  actual_payment_amount: number | null // USD đã thu thực tế
  delivery_date: string | null
  etd: string | null
  current_stage: SalesStage
  stage_started_at: string | null
  stage_sla_hours: number | null
  current_owner_name: string | null
}

interface KanbanCardProps {
  order: KanbanOrder
  onDragStart: (orderId: string) => void
  onDragEnd: () => void
  lp?: LotProgress
  lotPay?: OrderLotMoney   // thu tiền theo lô
}

export default function KanbanCard({ order, onDragStart, onDragEnd, lp, lotPay }: KanbanCardProps) {
  const navigate = useNavigate()

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
        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 2px 6px rgba(0,0,0,0.1)' }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.04)' }}
    >
      {/* Top row: code + value */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#111111', fontFamily: 'JetBrains Mono, monospace' }}>
          {soDisplayCode(order)}
        </span>
        {order.total_value_usd != null && (
          <span style={{ fontSize: 10, color: '#6b7280' }}>
            ${(order.total_value_usd / 1000).toFixed(0)}K
          </span>
        )}
      </div>

      {/* Customer + grade */}
      <div style={{ fontSize: 12, color: '#374151', marginBottom: 4 }}>
        <strong>{order.customer_short}</strong>
        {order.grade && <span style={{ marginLeft: 6, color: '#6b7280' }}>· {order.grade}</span>}
      </div>

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
            ? <span style={{ fontSize: 10, fontWeight: 700, color: '#dc2626', flex: 'none' }}>còn thiếu {rem.toFixed(2)}T</span>
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
          const [color, txtBase] = b === 'paid'    ? ['#15803d', 'Đã thu tiền']
                                : b === 'partial' ? ['#1d4ed8', 'Thu 1 phần']
                                :                   ['#b45309', 'Chưa thu tiền']
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
              ? `ETD ${Math.abs(daysToETD)}d trước`
              : daysToETD === 0
                ? 'ETD hôm nay'
                : `ETD ${daysToETD}d`}
          </span>
        )}
      </div>
    </div>
  )
}
