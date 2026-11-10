// ============================================================================
// Đọc số tiền bằng chữ (tiếng Việt) — dùng chung cho mọi phiếu in có "Số tiền bằng chữ"
// File: src/utils/readVietnameseNumber.ts
// Nguồn gốc: PaymentRequestPrintPage (đề nghị thanh toán mủ); tách ra để đề nghị thanh toán
// chi phí xe in cùng một cách đọc. Số âm đọc phần tuyệt đối (người gọi tự ghi "nộp lại").
// ============================================================================

export function readVietnameseNumber(num: number): string {
  const n0 = Math.abs(Math.round(num || 0))
  if (n0 <= 0) return 'Không'
  const ds = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín']
  const readTriple = (n: number, full: boolean): string => {
    const tr = Math.floor(n / 100)
    const ch = Math.floor((n % 100) / 10)
    const dv = n % 10
    let s = ''
    if (full || tr > 0) s += ds[tr] + ' trăm'
    if (ch === 0) {
      if (dv > 0) s += (s ? ' lẻ ' : '') + ds[dv]
    } else {
      s += (s ? ' ' : '') + (ch === 1 ? 'mười' : ds[ch] + ' mươi')
      if (dv === 1 && ch > 1) s += ' mốt'
      else if (dv === 5 && ch > 0) s += ' lăm'
      else if (dv > 0) s += ' ' + ds[dv]
    }
    return s.trim()
  }
  const units = ['', ' nghìn', ' triệu', ' tỷ']
  const groups: number[] = []
  let n = n0
  while (n > 0) { groups.push(n % 1000); n = Math.floor(n / 1000) }
  let out = ''
  for (let i = groups.length - 1; i >= 0; i--) {
    if (groups[i] === 0) continue   // bỏ nhóm 0 (gồm nhóm đơn vị cuối → hết "không trăm" thừa)
    out += (out ? ' ' : '') + readTriple(groups[i], i < groups.length - 1) + units[i]
  }
  out = out.trim().replace(/\s+/g, ' ')
  return out.charAt(0).toUpperCase() + out.slice(1)
}
