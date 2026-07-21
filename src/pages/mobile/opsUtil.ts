// Tiện ích định dạng cho App Ops (tên, giờ, ngày — theo giờ VN, tiếng Việt).
export function firstName(full?: string | null): string {
  if (!full) return 'bạn'
  const p = full.trim().split(/\s+/)
  return p[p.length - 1] || full
}
export function hhmm(iso?: string | null): string {
  if (!iso) return '--:--'
  try {
    return new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' })
  } catch { return '--:--' }
}
// "HH:MM:SS" (time_of_day / shift start_time) → "HH:MM"
export function clock(t?: string | null): string {
  if (!t) return '--:--'
  return t.slice(0, 5)
}
const WD = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7']
export function weekdayVi(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return WD[d.getDay()] || ''
}
export function ddmm(dateStr: string): string {
  const [, m, d] = dateStr.split('-')
  return `${d}/${m}`
}
export function minutesVi(mins?: number | null): string {
  if (!mins || mins <= 0) return '0 phút'
  const h = Math.floor(mins / 60), m = mins % 60
  if (h && m) return `${h}h${m}′`
  if (h) return `${h} giờ`
  return `${m} phút`
}
