// ============================================================================
// dateVN — ngày tháng theo GIỜ VIỆT NAM, không bao giờ đi qua toISOString().
// Audit 17/11/2026 bắt được 2 bug thật do toISOString() (UTC): Báo cáo mua mủ
// bấm ‹ › đứng yên, Đơn công tác ghi chấm công lệch −1 ngày. Luật (đã ghi
// CLAUDE.md): cộng/trừ/so sánh NGÀY ở client chỉ dùng các hàm này hoặc
// dayjs(...).format('YYYY-MM-DD') — CẤM `toISOString().slice(0, 10)`.
// File: src/utils/dateVN.ts (Đợt 2 audit UI)
// ============================================================================

/** 'YYYY-MM-DD' của một Date theo giờ máy (giờ VN với người dùng ERP). */
export function toDateStrVN(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 'YYYY-MM-DD' hôm nay theo giờ máy — cùng công thức todayLocal của khoCommon. */
export function todayVN(): string {
  return toDateStrVN(new Date())
}

/** Cộng/trừ `delta` NGÀY trên chuỗi 'YYYY-MM-DD', thuần lịch, không dính múi giờ. */
export function addDaysStr(dateStr: string, delta: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, (m || 1) - 1, d || 1)
  dt.setDate(dt.getDate() + delta)
  return toDateStrVN(dt)
}

/**
 * Mốc đầu / cuối một NGÀY VN ('YYYY-MM-DD') để lọc cột timestamptz qua PostgREST. DB chạy giờ UTC: chuỗi
 * không offset như `${d}T00:00:00` bị hiểu là 0h UTC = 7h sáng VN → bản ghi tạo 0h–7h lọt sang ngày hôm trước.
 * Giá trị không phải 'YYYY-MM-DD' (đã là timestamp) giữ nguyên.
 */
const isDayStr = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s)
export function vnDayStartTs(day: string): string {
  return isDayStr(day) ? `${day}T00:00:00+07:00` : day
}
export function vnDayEndTs(day: string): string {
  return isDayStr(day) ? `${day}T23:59:59.999+07:00` : day
}

/** Duyệt từng ngày [from..to] (chuỗi 'YYYY-MM-DD', bao cả hai đầu) — thay vòng lặp toISOString. */
export function eachDayStr(from: string, to: string): string[] {
  const out: string[] = []
  let cur = from
  let guard = 0
  while (cur <= to && guard < 1000) { out.push(cur); cur = addDaysStr(cur, 1); guard++ }
  return out
}
