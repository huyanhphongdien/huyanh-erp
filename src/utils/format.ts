// ============================================================================
// format — MỘT module định dạng số / tiền / ngày cho toàn ERP (Đợt 3 audit UI, 17/11/2026).
// Trước đó: 483 formatter định nghĩa cục bộ trong 260 file, đã lệch nhau (VND 4 ký hiệu ₫/đ/VNĐ/VND,
// USD lúc 0 lúc 2 số lẻ, "tỷ" dấu chấm/phẩy ngược nhau, ô trống lúc '—' lúc '0' lúc '–').
// LUẬT (đã ghi CLAUDE.md):
//   • null/undefined → DASH '—' (duy nhất). Số 0 LUÔN in "0".
//   • Số và VND: 'vi-VN' (1.234.567). USD: 'en-US' ($1,234) — bảng/thẻ 0 số lẻ, chứng từ in 2 số lẻ.
//   • VND có ký hiệu → ' ₫' (không 'đ', 'VNĐ', 'VND'). ⚠ 'đ' nghĩa là ĐIỂM (chấm công việc) thì giữ nguyên.
//   • Ngày: 'DD/MM/YYYY'. Ngày-giờ: 'DD/MM HH:mm' (thêm /YYYY khi khác năm nay), không in giây.
//   • kg: KHÔNG làm tròn (owner chốt 31/10/2026) — giữ số lẻ khi có.
// salesMoney.ts vẫn là nguồn NGHIỆP VỤ đồng tiền của đơn bán (isVnd, priceUnitLabel, orderTotals…);
// file này re-export fmtMoney / vndInputProps của nó để màn khác import một chỗ.
// ============================================================================
import dayjs from 'dayjs'

export { fmtMoney, vndInputProps, isVnd } from '../services/sales/salesMoney'
export { todayVN as todayLocal } from './dateVN'

export const DASH = '—'

const isNil = (v: unknown): v is null | undefined => v === null || v === undefined || (typeof v === 'number' && Number.isNaN(v))
const toNum = (v: number | string): number => (typeof v === 'string' ? Number(v) : v)

/** Số vi-VN: fmtNum(1234567.5, 1) → "1.234.567,5". `d` = số lẻ TỐI ĐA (không ép thêm 0). */
export function fmtNum(v: number | string | null | undefined, d = 0): string {
  if (isNil(v) || v === '') return DASH
  const n = toNum(v as number | string)
  if (Number.isNaN(n)) return DASH
  return n.toLocaleString('vi-VN', { maximumFractionDigits: d, minimumFractionDigits: 0 })
}

/** Số có dấu +/−: dùng cho chênh lệch, hao hụt. */
export function fmtSigned(v: number | null | undefined, d = 0): string {
  if (isNil(v)) return DASH
  return (v > 0 ? '+' : '') + fmtKg(v, d)
}

/** kg — KHÔNG làm tròn (owner 31/10/2026): giữ tối đa max(d,1) số lẻ khi có. Mặc định 3: kg tính tiền (tươi × DRC),
 *  net cont (n × 33,33) có 2–3 số lẻ — mặc định 1 từng in 169,98 kg thành "170". */
export function fmtKg(v: number | null | undefined, d = 3): string {
  if (isNil(v)) return DASH
  return v.toLocaleString('vi-VN', { maximumFractionDigits: Math.max(d, 1), minimumFractionDigits: 0 })
}

/** VND có ký hiệu: 1234567 → "1.234.567 ₫" (làm tròn đồng). */
export function fmtVnd(v: number | string | null | undefined): string {
  if (isNil(v) || v === '') return DASH
  const n = toNum(v as number | string)
  if (Number.isNaN(n)) return DASH
  return `${Math.round(n).toLocaleString('vi-VN')} ₫`
}

/** VND KHÔNG ký hiệu (khi tiêu đề cột đã ghi đơn vị ₫): 1234567 → "1.234.567". */
export function fmtVndNum(v: number | string | null | undefined): string {
  if (isNil(v) || v === '') return DASH
  const n = toNum(v as number | string)
  if (Number.isNaN(n)) return DASH
  return Math.round(n).toLocaleString('vi-VN')
}

/** VND rút gọn: ≥1 tỷ → "9,33 tỷ" · ≥1 triệu → "350,5 tr" · nhỏ hơn → "12.000 ₫". */
export function fmtVndCompact(v: number | null | undefined): string {
  if (isNil(v)) return DASH
  const a = Math.abs(v)
  if (a >= 1e9) return `${(v / 1e9).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} tỷ`
  if (a >= 1e6) return `${(v / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} tr`
  return fmtVnd(v)
}

/** "tỷ" luôn quy theo tỷ (cột tài chính): 9330000000 → "9,33 tỷ". */
export function fmtTy(v: number | null | undefined, d = 2): string {
  if (isNil(v)) return DASH
  return `${(v / 1e9).toLocaleString('vi-VN', { maximumFractionDigits: d })} tỷ`
}

/** USD: bảng/thẻ 0 số lẻ ("$1,234"), chứng từ/số dư cần cent thì d=2 ("$1,234.56"). */
export function fmtUsd(v: number | string | null | undefined, d = 0): string {
  if (isNil(v) || v === '') return DASH
  const n = toNum(v as number | string)
  if (Number.isNaN(n)) return DASH
  const s = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
  return `${n < 0 ? '−' : ''}$${s}`
}

/** Phần trăm — v ĐÃ ở đơn vị % (12.5 → "12,5%"). */
export function fmtPct(v: number | null | undefined, d = 1): string {
  if (isNil(v)) return DASH
  return `${v.toLocaleString('vi-VN', { maximumFractionDigits: d, minimumFractionDigits: 0 })}%`
}

type DateIn = string | number | Date | dayjs.Dayjs | null | undefined
const asDay = (v: DateIn) => (v === null || v === undefined || v === '' ? null : dayjs(v as any))

/** 'DD/MM/YYYY'. Chuỗi 'YYYY-MM-DD' hiểu là ngày lịch (không lệch múi giờ). */
export function fmtDate(v: DateIn): string {
  const d = asDay(v)
  return d && d.isValid() ? d.format('DD/MM/YYYY') : DASH
}

/** 'DD/MM' — cột hẹp / màn điện thoại. */
export function fmtDateShort(v: DateIn): string {
  const d = asDay(v)
  return d && d.isValid() ? d.format('DD/MM') : DASH
}

/** 'DD/MM HH:mm' (thêm /YYYY khi khác năm nay) — chuẩn ngày-giờ toàn hệ, không in giây. */
export function fmtDateTime(v: DateIn): string {
  const d = asDay(v)
  if (!d || !d.isValid()) return DASH
  return d.format(d.year() === dayjs().year() ? 'DD/MM HH:mm' : 'DD/MM/YYYY HH:mm')
}

/** 'HH:mm' */
export function fmtTime(v: DateIn): string {
  const d = asDay(v)
  return d && d.isValid() ? d.format('HH:mm') : DASH
}

/** Ô nhập tiền USD (antd InputNumber): phẩy ngăn nghìn, CHẤM thập phân — giữ cent.
 *  (Ô VND dùng vndInputProps: chấm ngăn nghìn.) */
export const usdInputProps = {
  formatter: (v: string | number | undefined) => {
    if (v === undefined || v === null || v === '') return ''
    const [i, f] = String(v).split('.')
    return i.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (f !== undefined ? `.${f}` : '')
  },
  // ô trống → null (không ép 0: xoá hạn mức tín dụng từng lưu thành $0)
  parser: (v: string | undefined) => {
    const s = (v ?? '').replace(/[^\d.-]/g, '')
    if (s === '' || s === '-') return '' as unknown as number
    const n = Number(s)
    return (Number.isFinite(n) ? n : '') as unknown as number
  },
  step: 0.01,
}
