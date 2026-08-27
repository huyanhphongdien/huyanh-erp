// ============================================================================
// VIÊN LÔ — ký hiệu DÙNG CHUNG cho tiến trình từng lô, mọi màn hình
// File: src/components/sales/LotChipStrip.tsx
//
// MỘT viên = MỘT lô. Hai trục đọc trên cùng một viên:
//   • THÂN viên (số lô)  = GIAO HÀNG
//   • MÁNG dưới          = TIỀN VỀ
// Thứ tự đó là bất biến, không màn nào được đảo. Mọi tooltip đọc 📦 trước 💵 sau.
//
//     ┌────┐ ┌────┐ ┌────┐
//     │ 1  │ │ 2  │ │ 3  │   ← thân: nét đứt=chưa đi · xanh dương=đang giao · lá=giao đủ
//     ├────┤ ├────┤ ├────┤
//     ▓▓▓▓▓  ▓▓░░░  ░░░░░    ← máng: phần xanh = tỉ lệ tiền đã thu
//     └────┘ └────┘ └────┘
//
// ⚠ VÌ SAO NÉT ĐỨT: xám và xanh lá lẫn nhau ở người mù màu deuteranopia. Nét đứt thì
//    không lẫn được. Đây là kênh dự phòng bắt buộc, đừng bỏ cho "sạch".
//
// ⚠ VÌ SAO THÂN VIÊN KHÔNG ĐỌC `lot_status`: cột đó là số chép xuống từ trạng thái hợp
//    đồng lúc backfill, đang trái chứng cứ ở 9/20 lô. Thân viên tính từ CONTAINER THẬT
//    (LotProgress.deliveryByLot). `lot_status` chỉ dùng để bật chấm đỏ cảnh báo.
//
// ⚠ VIÊN LUÔN XẾP THEO SỐ LÔ TĂNG DẦN, không bao giờ sắp lại theo trạng thái.
//    Vị trí chính là danh tính của lô — đó là thứ khiến người dùng nhớ được "lô nào".
// ============================================================================
import { Popover } from 'antd'
import type { LotProgressRow } from '../../services/logistics/dispatchService'
import type { LotMoneyRow } from '../../services/sales/salesOrderPaymentService'

export type LotChipSize = 'xs' | 's' | 'm'

const SIZES: Record<LotChipSize, { w: number; h: number; bar: number; fs: number; gap: number; radius: number }> = {
  xs: { w: 16, h: 16, bar: 3, fs: 9,  gap: 3, radius: 3 },
  s:  { w: 20, h: 18, bar: 3, fs: 10, gap: 3, radius: 4 },
  m:  { w: 26, h: 24, bar: 4, fs: 12, gap: 6, radius: 5 },
}

type ShipState = 'none' | 'partial' | 'full'

const SHIP: Record<ShipState, { bg: string; fg: string; bd: string; dashed: boolean; label: string }> = {
  none:    { bg: '#f1f5f9', fg: '#64748b', bd: '#c3ceda', dashed: true,  label: 'chưa đi' },
  partial: { bg: '#dbeafe', fg: '#1d4ed8', bd: '#60a5fa', dashed: false, label: 'đang giao' },
  full:    { bg: '#dcfce7', fg: '#15803d', bd: '#22c55e', dashed: false, label: 'giao xong' },
}

// Tương phản: PAID phải đọc được TRÊN NỀN TRACK — nó mang toàn bộ trục tiền.
// #16a34a trên #c3ceda chỉ đạt 2,07; #166534 đạt ngưỡng.
const TRACK = '#c3ceda'
const PAID = '#166534'
const OVER = '#c2410c'
const MISMATCH = '#dc2626'

const fmtUSD = (v: number): string =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v)

export interface LotChipData {
  lotNo: number
  /** Trục GIAO — từ container thật. */
  contsDelivered: number
  contsTotal: number
  netKgDelivered: number
  netKgTotal: number
  /**
   * Trục TIỀN. `undefined` = CHƯA TẢI XONG hoặc TẢI HỎNG — KHÁC HẲN với 0.
   * Gộp hai nghĩa đó lại là vẽ "chưa có trị giá lô" cho lô mà DB có value_usd,
   * đúng loại sai-mà-trông-hợp-lý như bug prorata đã gỡ.
   */
  valueUsd?: number
  paidUsd?: number
  /**
   * valueUsd đã CHỐT hay chỉ TẠM TÍNH. Số tạm tính = net/1000 × đơn giá, mà net_weight_kg
   * bị ghi đè mỗi lần gán container → con số đổi SAU khi hoá đơn đã phát. Hiện nó như số
   * chốt là mời người dùng đối chiếu công nợ với một con số biết tự đổi.
   */
  valueLocked?: boolean
  /** `lot_status` trái chứng cứ giao → chấm đỏ góc trên. */
  mismatch?: boolean
}

/** Ghép trục giao (dispatchService) với trục tiền (salesOrderPaymentService) theo số lô. */
export function mergeLotAxes(
  delivery: LotProgressRow[] | undefined,
  money: LotMoneyRow[] | undefined,
): LotChipData[] {
  const byLot = new Map<number, LotChipData>()
  for (const d of delivery || []) {
    byLot.set(d.lotNo, {
      lotNo: d.lotNo,
      contsDelivered: d.contsDelivered,
      contsTotal: d.contsTotal,
      netKgDelivered: d.netKgDelivered,
      netKgTotal: d.netKgTotal,
    })
  }
  for (const m of money || []) {
    const e = byLot.get(m.lotNo)
    if (e) {
      e.valueUsd = m.valueUsd; e.paidUsd = m.paidUsd; e.valueLocked = m.valueLocked
      e.mismatch = mismatchOf(m.lotStatus, e)
    }
    // Lô CHỈ có ở phía tiền (đã chốt trong sales_order_lots nhưng chưa gán container):
    // vẫn phải hiện, nếu không thì thu tiền xong lô đó biến mất khỏi dải.
    else byLot.set(m.lotNo, {
      lotNo: m.lotNo,
      contsDelivered: 0, contsTotal: 0, netKgDelivered: 0, netKgTotal: 0,
      valueUsd: m.valueUsd, paidUsd: m.paidUsd, valueLocked: m.valueLocked,
    })
  }
  return [...byLot.values()].sort((a, b) => a.lotNo - b.lotNo)
}

/**
 * `lot_status` là số NHẬP TAY/chép xuống lúc backfill; chứng cứ giao là container thật.
 * Trái nhau thì bật chấm đỏ. Cùng luật với cột status_mismatch của
 * v_sales_order_lot_payments — hai bên phải nói giống nhau.
 */
function mismatchOf(lotStatus: string | null | undefined, d: LotChipData): boolean {
  if (!lotStatus || d.contsTotal === 0) return false
  const st = shipStateOf(d)
  if (lotStatus === 'delivered' && st !== 'full') return true
  if ((lotStatus === 'planning' || lotStatus === 'packing') && st === 'full') return true
  if (lotStatus === 'shipped' && st === 'none') return true
  return false
}

function shipStateOf(d: LotChipData): ShipState {
  if (d.contsTotal === 0) return 'none'
  if (d.contsDelivered === 0) return 'none'
  return d.contsDelivered < d.contsTotal ? 'partial' : 'full'
}

function LotChip({ d, size }: { d: LotChipData; size: LotChipSize }) {
  const S = SIZES[size]
  const st = shipStateOf(d)
  const c = SHIP[st]

  // BA ca khác nhau, không được vẽ giống nhau:
  //   known=false → chưa tải xong / tải hỏng  → máng gạch chéo, không kết luận gì
  //   known && value<=0 → lô chưa chốt trị giá → máng xám trơn
  //   known && value>0  → có mẫu số           → máng vẽ tỉ lệ thật
  const known = d.valueUsd !== undefined
  const value = d.valueUsd ?? 0
  const paid = d.paidUsd ?? 0
  const pct = value > 0 ? Math.min(100, (paid / value) * 100) : 0
  const over = value > 0 && paid > value + 0.01

  const shipTxt = d.contsTotal > 0
    ? `${d.contsDelivered}/${d.contsTotal} cont` + (d.netKgTotal > 0
        ? ` (${(d.netKgDelivered / 1000).toFixed(1)}/${(d.netKgTotal / 1000).toFixed(1)} T)` : '')
    : 'chưa gán container'
  const moneyTxt = !known
    ? 'chưa tải được số tiền'
    : value > 0
      ? `${fmtUSD(paid)} / ${fmtUSD(value)} (${Math.round((paid / value) * 100)}%)`
      : 'lô chưa chốt trị giá'

  return (
    <Popover
      trigger={['hover', 'click']}   // điện thoại không có hover → phải bấm được
      content={
        <div style={{ fontSize: 12, lineHeight: 1.7, maxWidth: 260 }} onClick={(e) => e.stopPropagation()}>
          <div style={{ fontWeight: 700, marginBottom: 2 }}>Lô {d.lotNo}</div>
          <div>📦 Giao <b>{shipTxt}</b></div>
          <div>💵 Thu <b>{moneyTxt}</b></div>
          {known && value > 0 && !d.valueLocked && (
            <div style={{ color: '#8a5a05' }}>
              Trị giá <b>tạm tính</b> theo cân hiện tại — chưa chốt, sẽ đổi nếu gán lại container.
            </div>
          )}
          {over && <div style={{ color: OVER, fontWeight: 600 }}>⚠ Đã thu VƯỢT trị giá lô</div>}
          {d.mismatch && (
            <div style={{ color: MISMATCH, marginTop: 4 }}>
              ⚠ Ghi chú trạng thái của lô trái với chứng cứ giao hàng.
            </div>
          )}
        </div>
      }
    >
      <span
        style={{
          display: 'inline-flex', flexDirection: 'column', position: 'relative',
          verticalAlign: 'middle', flex: 'none', cursor: 'help',
          // Vùng chạm tối thiểu 24px CẢ HAI CHIỀU cho điện thoại — viên xs chỉ vẽ 16×19px,
          // thiếu chiều ngang thì chạm hụt sang thẻ bên cạnh.
          padding: `${Math.max(0, (24 - S.h - S.bar) / 2)}px ${Math.max(0, (24 - S.w) / 2)}px`,
        }}
        onClick={(e) => e.stopPropagation()}   // đừng mở đơn hàng bên dưới
      >
        <span
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            minWidth: S.w, height: S.h, padding: '0 3px',
            fontFamily: 'JetBrains Mono, monospace', fontSize: S.fs, fontWeight: 700, lineHeight: 1,
            background: c.bg, color: c.fg,
            border: `1px ${c.dashed ? 'dashed' : 'solid'} ${c.bd}`, borderBottom: 'none',
            borderRadius: `${S.radius}px ${S.radius}px 0 0`,
          }}
        >
          {d.lotNo}
        </span>
        <span
          style={{
            height: S.bar, overflow: 'hidden',
            borderRadius: `0 0 ${S.radius}px ${S.radius}px`,
            // Chưa biết → gạch chéo, để mắt không đọc nhầm thành "chưa thu đồng nào".
            background: known
              ? TRACK
              : `repeating-linear-gradient(45deg, ${TRACK} 0 2px, #eef2f6 2px 4px)`,
          }}
        >
          {known && (
            <span
              style={{
                display: 'block', height: '100%',
                // Sàn 2px: khoản thu dưới ~5% trị giá lô làm tròn về 0px và đọc ra
                // "chưa thu đồng nào" — sai hẳn nghĩa.
                width: over ? '100%' : pct > 0 ? `max(2px, ${pct}%)` : 0,
                background: over ? OVER : PAID,
              }}
            />
          )}
        </span>
        {d.mismatch && (
          <span
            style={{
              position: 'absolute', top: size === 'm' ? -2 : 1, right: -2,
              width: 5, height: 5, borderRadius: '50%', background: MISMATCH,
              boxShadow: '0 0 0 1.5px #fff',
            }}
          />
        )}
      </span>
    </Popover>
  )
}

/**
 * Dải viên lô. Tối đa 5 viên; từ viên thứ 6 gom thành viên `+n` KHÔNG có máng
 * (để không nói dối về tiền), bấm/di chuột mở danh sách đủ.
 */
export default function LotChipStrip({
  lots,
  size = 's',
  max = 5,
}: {
  lots: LotChipData[]
  size?: LotChipSize
  max?: number
}) {
  if (!lots || lots.length === 0) return null
  const S = SIZES[size]
  const shown = lots.slice(0, max)
  const rest = lots.slice(max)

  return (
    <span
      style={{ display: 'inline-flex', alignItems: 'flex-start', gap: S.gap, flexWrap: 'wrap' }}
      // ⚠ CHẶN Ở GỐC DẢI, không phải ở từng nội dung popover.
      // Portal của antd là con trong CÂY REACT, nên click bên trong overlay vẫn nổi lên
      // hàng của Table và onClick điều hướng của thẻ Kanban. Đặt lẻ ở div nội dung là hở
      // vành padding 12px của .ant-popover-inner, hở node title, hở mũi tên — trên điện
      // thoại chạm hụt một chút là nhảy sang trang đơn hàng.
      // stopPropagation của React không chặn listener native trên document, nên cơ chế
      // bấm-ra-ngoài-để-đóng của Popover vẫn chạy bình thường.
      onClick={(e) => e.stopPropagation()}
    >
      {shown.map((d) => <LotChip key={d.lotNo} d={d} size={size} />)}
      {rest.length > 0 && (
        <Popover
          trigger={['hover', 'click']}
          title={`${rest.length} lô nữa`}
          content={
            <span
              style={{ display: 'inline-flex', gap: SIZES.m.gap, flexWrap: 'wrap', maxWidth: 320 }}
              onClick={(e) => e.stopPropagation()}
            >
              {rest.map((d) => <LotChip key={d.lotNo} d={d} size="m" />)}
            </span>
          }
        >
          {/* Viên "+n" cố ý KHÔNG có máng (không nói dối về tiền của những lô nó đang giấu)
              và cố ý dùng viền CHẤM — không phải nét liền, vì nét liền trong từ vựng của
              file này nghĩa là "đã đi". Nó là nút gom, không phải một lô. */}
          <span
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              minWidth: S.w, height: S.h + S.bar, padding: '0 4px',
              fontFamily: 'JetBrains Mono, monospace', fontSize: S.fs, fontWeight: 600, lineHeight: 1,
              background: '#fff', color: '#6b7280', border: '1px dotted #94a3b8',
              borderRadius: S.radius, cursor: 'pointer', flex: 'none',
              // Cùng vùng chạm 24px như viên lô, và cùng đường canh đáy.
              margin: `${Math.max(0, (24 - S.h - S.bar) / 2)}px ${Math.max(0, (24 - S.w) / 2)}px`,
            }}
          >
            +{rest.length}
          </span>
        </Popover>
      )}
    </span>
  )
}
