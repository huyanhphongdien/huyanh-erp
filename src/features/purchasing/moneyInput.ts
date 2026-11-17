// ============================================================================
// moneyInput — ô nhập tiền VND dạng <input type="text"> cho các màn kit tay (Tailwind) của module Mua hàng.
// Hiện CHẤM ngăn nghìn ngay khi gõ — cùng quy ước vndInputProps (utils/format) mà màn antd InputNumber dùng.
// (Đợt 3 audit UI 17/11/2026: ô tiền type="number" không có ngăn nghìn — gõ 150000000 phải tự đếm số 0.)
// Giữ được phần lẻ khi số gốc có lẻ (VAT làm tròn 2 số): 1234567.5 ⇄ "1.234.567,5".
// Quy ước Việt như vndInputProps.parser: CHẤM ngăn nghìn, MỘT dấu PHẨY luôn là thập phân. Chỉ khi có ≥ 2 phẩy
// (dán số kiểu en "150,000,000" / "1,234,567.5") mới coi phẩy là ngăn nghìn, chấm là thập phân.
// File: src/features/purchasing/moneyInput.ts
// ============================================================================

/** Chuỗi số thô ("1234567" | "1234567.5") → chữ hiển thị "1.234.567" | "1.234.567,5" */
export function vndRawToDisplay(raw: string): string {
  if (!raw) return ''
  const [i, f] = raw.split('.')
  return i.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (f !== undefined ? `,${f}` : '')
}

/** Chữ người dùng gõ/dán → chuỗi số thô (chấm thập phân, tối đa 2 số lẻ) */
export function vndTypedToRaw(typed: string): string {
  const s = (typed || '').replace(/[^0-9.,]/g, '')
  const commas = (s.match(/,/g) || []).length
  // ≥ 2 phẩy = kiểu en (phẩy ngăn nghìn). 0–1 phẩy = kiểu Việt: bỏ mọi chấm, phẩy → dấu thập phân.
  // Bản cũ đoán "1 phẩy + đúng 3 số = ngăn nghìn" → ô đang hiện "123,45" gõ thêm "6" thành 123.456 (×1000).
  // Không có phẩy thì chấm LUÔN là ngăn nghìn: ô tự chèn chấm khi gõ, "1.234" gõ thêm "5" phải ra 12345.
  const norm = commas > 1 ? s.replace(/,/g, '') : s.replace(/\./g, '').replace(',', '.')
  const [rawInt, ...rest] = norm.split('.')
  const i = rawInt.replace(/^0+(?=\d)/, '')
  return rest.length ? `${i}.${rest.join('').slice(0, 2)}` : i
}

/** Giá trị số trong state → chữ cho ô nhập (null/undefined → ''; 0 → "0") */
export function vndToInputText(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === '') return ''
  const n = Number(v)
  if (!Number.isFinite(n)) return ''
  return vndRawToDisplay(String(Math.round(n * 100) / 100)) // làm tròn 2 số lẻ: bỏ đuôi kiểu 0.30000000000000004
}

/** Chữ trong ô nhập → số (ô trống → undefined) */
export function vndInputToNumber(typed: string): number | undefined {
  const raw = vndTypedToRaw(typed)
  if (raw === '' || raw === '.') return undefined
  const n = Number(raw)
  return Number.isFinite(n) ? n : undefined
}
