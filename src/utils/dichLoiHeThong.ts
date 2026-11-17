// ============================================================================
// dichLoiHeThong — dịch LỚP LỖI CHUNG của Supabase/PostgREST/mạng sang câu tiếng Việt
// hành động được, TRƯỚC khi rơi về fallback. Nhân từ mẫu dichLoiNhapKho (rawStockService).
// Dùng ở MỌI call-site đang đổ thẳng e.message ra người dùng:
//   message.error(dichLoiHeThong(e, 'Lưu thất bại'))
// Lỗi nghiệp vụ có mã riêng (THIEU_DRC, VUOT_TON…) vẫn dịch ở service của module đó;
// hàm này chỉ lo tầng hệ thống: trùng khoá, mất mạng, hết phiên, không có quyền…
// File: src/utils/dichLoiHeThong.ts (Đợt 2 audit UI 17/11/2026)
// ============================================================================

type LoiBat = { code?: string; message?: string; details?: string; hint?: string }

function rut(e: unknown): LoiBat {
  if (!e) return {}
  if (typeof e === 'string') return { message: e }
  const o = e as Record<string, unknown>
  return {
    code: typeof o.code === 'string' ? o.code : undefined,
    message: typeof o.message === 'string' ? o.message : String(e),
    details: typeof o.details === 'string' ? o.details : undefined,
  }
}

/** true nếu là lỗi mất mạng / không gọi được server (đáng hiện nút "Thử lại"). */
export function laLoiMang(e: unknown): boolean {
  const { message } = rut(e)
  const m = (message || '').toLowerCase()
  return m.includes('failed to fetch') || m.includes('networkerror') || m.includes('load failed') ||
    m.includes('network request failed') || m.includes('fetch failed') || m.includes('err_network') ||
    m.includes('err_internet')
}

/**
 * Dịch lỗi hệ thống sang tiếng Việt. `fallback` là câu gốc của màn hình
 * (vd "Lưu thất bại"); khi không nhận diện được lớp lỗi, trả `fallback` kèm
 * message gốc rút gọn trong ngoặc để còn lần ra khi báo lỗi.
 */
export function dichLoiHeThong(e: unknown, fallback = 'Thao tác thất bại'): string {
  const { code, message } = rut(e)
  const m = message || ''
  const ml = m.toLowerCase()

  if (laLoiMang(e)) return 'Mất kết nối mạng — kiểm tra Internet/WiFi rồi thử lại'
  if (ml.includes('jwt') || ml.includes('token') && ml.includes('expired') || code === 'PGRST301' && ml.includes('jwt'))
    return 'Phiên đăng nhập đã hết hạn — đăng nhập lại giúp'
  if (code === '42501' || code === 'PGRST301' || ml.includes('row-level security') || ml.includes('permission denied'))
    return 'Tài khoản của bạn không có quyền làm thao tác này'
  if (code === '23505' || ml.includes('duplicate key')) return 'Dữ liệu bị trùng (mã/số này đã có rồi) — kiểm tra lại'
  if (code === '23503' || ml.includes('foreign key')) return 'Dữ liệu đang được nơi khác tham chiếu — không xoá/sửa kiểu này được'
  if (code === '23502' || ml.includes('not-null')) return 'Thiếu trường bắt buộc — điền đủ rồi thử lại'
  if (code === '23514' || ml.includes('check constraint')) return 'Giá trị không hợp lệ theo luật của sổ — kiểm tra lại số liệu'
  if (code === 'PGRST116' || ml.includes('0 rows')) return 'Không tìm thấy dữ liệu — có thể đã bị xoá hoặc đổi, tải lại trang'
  if (code === '57014' || ml.includes('timeout') || ml.includes('timed out')) return 'Server trả lời quá chậm — thử lại sau ít phút'
  if (code === 'PGRST204' || ml.includes('schema cache')) return 'Hệ thống vừa cập nhật cấu trúc — bấm tải lại trang (Ctrl+R); còn lỗi thì báo IT'

  // Lỗi đã là tiếng Việt (service nghiệp vụ dịch rồi) → giữ nguyên
  if (/[àáảãạăâđèéẻẽẹêìíỉĩịòóỏõọôơùúủũụưỳýỷỹỵ]/i.test(m)) return m

  const got = m && m !== 'undefined' ? ` (${m.slice(0, 120)})` : ''
  return `${fallback}${got}`
}
