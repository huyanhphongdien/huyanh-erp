// ============================================================================
// dichLoiAuth — dịch lỗi tiếng Anh của Supabase Auth (đăng nhập / quên mật khẩu / đổi mật khẩu / đăng ký)
// sang câu tiếng Việt (audit UI 17/11/2026, Đợt 3). Trước đó gõ sai mật khẩu là hiện nguyên văn
// 'Invalid login credentials' — lỗi MỌI người dùng nhà máy đều gặp.
// Không nhận ra thì rơi về dichLoiHeThong (mất mạng, hết phiên…) rồi tới câu gốc `fallback`.
// authStore hiện vẫn lưu e.message gốc — màn hiển thị (LoginPage…) bọc qua hàm này.
// File: src/utils/dichLoiAuth.ts
// ============================================================================
import { dichLoiHeThong } from './dichLoiHeThong'

export function dichLoiAuth(e: unknown, fallback = 'Đăng nhập thất bại — thử lại hoặc liên hệ IT (nội bộ 100)'): string {
  if (!e) return ''
  const m = typeof e === 'string' ? e : String((e as { message?: unknown })?.message ?? '')
  const ml = m.toLowerCase()

  if (ml.includes('invalid login credentials') || ml.includes('invalid email or password')) return 'Sai email hoặc mật khẩu'
  if (ml.includes('email not confirmed')) return 'Tài khoản chưa được kích hoạt — liên hệ phòng HCNS'
  if (ml.includes('user not found')) return 'Không tìm thấy tài khoản với email này'
  if (ml.includes('banned')) return 'Tài khoản đã bị khoá — liên hệ IT (nội bộ 100)'
  if (ml.includes('rate limit') || ml.includes('too many requests') || ml.includes('for security purposes'))
    return 'Thử quá nhiều lần — đợi ít phút rồi thử lại'
  if (ml.includes('should be different from the old password')) return 'Mật khẩu mới phải khác mật khẩu cũ'
  if (ml.includes('password should be') || ml.includes('password must') || ml.includes('weak password'))
    return 'Mật khẩu chưa đủ mạnh — xem yêu cầu mật khẩu rồi thử lại'
  if (ml.includes('already registered') || ml.includes('already been registered')) return 'Email này đã có tài khoản'
  if (ml.includes('unable to validate email') || ml.includes('invalid format')) return 'Email không đúng định dạng'
  if (ml.includes('signups not allowed') || ml.includes('signup is disabled'))
    return 'Không tự đăng ký được — liên hệ phòng HCNS để được cấp tài khoản'

  // Lỗi hệ thống chung (mất mạng, hết phiên…) hoặc câu đã là tiếng Việt (authStore tự đặt) → giữ nguyên
  return dichLoiHeThong(e, fallback)
}

export default dichLoiAuth
