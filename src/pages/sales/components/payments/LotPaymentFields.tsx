// ============================================================================
// LotPaymentFields — phần DÙNG CHUNG của 2 cửa ghi khoản thu đơn bán:
//   • PaymentHistorySection (tab Tài chính — modal Thêm/Sửa khoản thu)
//   • QuickPayModal (Công nợ khách, Sổ lô, kéo-thả Kanban)
// Audit 17/11/2026: hai màn chép tay oldestUnpaidLot + bộ options chọn lô, và đã LỆCH mặc
// định loại khoản thu (một bên deposit/installment, một bên luôn 'final'). Sửa luật ở ĐÂY.
// ⚠ KHÔNG chia đều tiền cho các lô: chia ĐỀU chính là prorata đội tên khác (CLAUDE.md).
//   Muốn rải nhiều lô thì ghi nhiều dòng thu.
// File: src/pages/sales/components/payments/LotPaymentFields.tsx
// ============================================================================
import { Select, Tag } from 'antd'
import type {
  OrderPaymentBreakdown, PaymentType, LotPayStatus,
} from '../../../../services/sales/salesOrderPaymentService'
import { fmtUsd } from '../../../../utils/format'

/** Nhãn + màu trạng thái thu tiền của MỘT lô (Tag antd). */
export const LOT_PAY_STATUS_TAG: Record<LotPayStatus, { color: string; label: string }> = {
  paid: { color: 'green', label: 'đã thu đủ' },
  partial: { color: 'gold', label: 'thu một phần' },
  unpaid: { color: 'red', label: 'chưa thu' },
}

/**
 * Lô còn nợ CŨ NHẤT (số lô nhỏ nhất còn dư) — mặc định hợp lý nhất khi tiền về mà người nhập
 * không nói rõ lô: khách trả theo thứ tự lô, và waterfall lấp lô cũ trước.
 * Trả null khi đơn chưa chia lô hoặc mọi lô đã thu đủ.
 */
export function oldestUnpaidLot(b?: OrderPaymentBreakdown | null): number | null {
  if (!b?.hasLots) return null
  const owing = b.lots
    .filter((l) => l.lotValue - l.paidAmount > 0.01)
    .sort((a, c) => a.lotNo - c.lotNo)
  return owing.length ? owing[0].lotNo : null
}

/** Còn nợ của một lô (không âm, làm tròn cent); null nếu không có lô đó. */
export function lotOutstanding(b: OrderPaymentBreakdown | null | undefined, lotNo: number | null | undefined): number | null {
  if (lotNo == null || !b) return null
  const row = b.lots.find((l) => l.lotNo === lotNo)
  return row ? Math.max(0, Math.round((row.lotValue - row.paidAmount) * 100) / 100) : null
}

/**
 * Loại khoản thu MẶC ĐỊNH — MỘT luật cho cả 2 cửa ghi thu (chỉ là gợi ý ban đầu; người nhập đã
 * đổi tay thì giữ lựa chọn của họ):
 *  • đơn đã thu đủ (còn nợ cả đơn ≤ 0)        → 'other'       (khoản thêm: điều chỉnh / thu vượt)
 *  • số tiền nhập ≥ phần còn nợ của CẢ ĐƠN     → 'final'       (tất toán)
 *  • chưa thu đồng nào + không gắn lô         → 'deposit'     (cọc trước khi chia lô / giao hàng)
 *  • còn lại (trả theo lô, trả dần)           → 'installment'
 */
export function defaultPaymentType(o: {
  totalPaid: number
  orderOutstanding: number
  amount?: number | null
  lotNo?: number | null
}): PaymentType {
  if (o.orderOutstanding <= 0.01) return 'other'
  if (o.amount != null && o.amount > 0 && o.amount >= o.orderOutstanding - 0.01) return 'final'
  if (o.totalPaid <= 0 && o.lotNo == null) return 'deposit'
  return 'installment'
}

/**
 * Ô "Thu cho lô nào?" dùng chung. Dùng được trực tiếp (value/onChange) hoặc bọc trong
 * <Form.Item name="lot_no"> (Form.Item tự truyền value/onChange).
 * ⚠ Ô này LUÔN hiện, kể cả đơn chưa chia lô (80/89 đơn công nợ chưa chia lô — ẩn đi thì không ai
 * hình thành thói quen ghi thu kèm lô). Đơn chưa chia lô: khoá ô + chỉ đường đi chia, VẪN CHO LƯU.
 */
export function LotSelect({ breakdown, value, onChange, onGotoPacking }: {
  breakdown: OrderPaymentBreakdown | null
  value?: number | null
  onChange?: (v: number | null) => void
  /** Có truyền → hiện link "Chia lô ngay ↗" khi đơn chưa chia lô. */
  onGotoPacking?: () => void
}) {
  if (!breakdown?.hasLots) {
    return (
      <>
        <Select style={{ width: '100%' }} disabled placeholder="Đơn này chưa chia lô" />
        <div style={{ fontSize: 11, color: '#8a5a05', marginTop: 3 }}>
          Đơn chưa chia lô nên khoản thu chỉ ghi được ở mức cả đơn.{' '}
          {onGotoPacking && <a onClick={onGotoPacking}>Chia lô ngay ↗</a>}
        </div>
      </>
    )
  }
  const v = value ?? null
  return (
    <>
      <Select
        value={v}
        onChange={(x) => onChange?.(x ?? null)}
        style={{ width: '100%' }}
        options={[
          ...breakdown.lots.map((l) => ({
            value: l.lotNo,
            label: (
              <span>Lô {l.lotNo} — trị giá {fmtUsd(l.lotValue, 2)} · còn nợ <b>{fmtUsd(Math.max(0, l.lotValue - l.paidAmount), 2)}</b>{' '}
                <Tag color={LOT_PAY_STATUS_TAG[l.status].color} style={{ marginInlineEnd: 0 }}>{LOT_PAY_STATUS_TAG[l.status].label}</Tag></span>
            ),
          })),
          // "Cả đơn" XUỐNG CUỐI: vẫn là lựa chọn hợp lệ (tiền gộp nhiều lô, cọc trước khi chia lô…),
          // chỉ thôi làm mặc định.
          {
            value: null,
            label: <span style={{ color: '#8a5a05' }}>Cả đơn — chưa quy được về lô (còn nợ {fmtUsd(breakdown.totalValue - breakdown.totalPaid, 2)})</span>,
          },
        ]}
      />
      <div style={{ fontSize: 11, color: '#999', marginTop: 3 }}>
        {v == null
          ? '⚠ Khoản này sẽ KHÔNG gắn được vào lô nào — báo cáo công nợ sẽ xếp nó vào phần "chưa gắn lô".'
          : 'Mặc định chọn lô còn nợ cũ nhất — đổi được nếu khách trả cho lô khác.'}
      </div>
    </>
  )
}
