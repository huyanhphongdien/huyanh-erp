// ============================================================================
// ResetPasswordPage — đặt mật khẩu mới từ link email khôi phục. Route /reset-password (authStore.forgotPassword
// gửi redirectTo tới đây). Trước 17/11/2026 route này KHÔNG có → link trong email rơi vào trang 404.
//  • KHÔNG bọc PublicRoute: phiên khôi phục làm isAuthenticated = true → PublicRoute đẩy về '/' trước khi kịp đặt.
//  • Link Supabase: <origin>/reset-password#access_token=…&type=recovery (hết hạn / đã dùng: #error_code=otp_expired…).
//    supabase-js (detectSessionInUrl) tự nhận token rồi XOÁ hash sau một lượt gọi mạng → đọc hash NGAY lúc nạp module
//    (App.tsx import TĨNH trang này — đừng đổi sang lazy) + nghe sự kiện PASSWORD_RECOVERY làm đường thứ hai.
//  • Chỉ phiên KHÔI PHỤC mới được đặt (phiên đăng nhập thường đổi mật khẩu ở Cài đặt tài khoản — bắt nhập mật khẩu
//    hiện tại). Đánh dấu theo user id trong sessionStorage để tải lại trang giữa chừng vẫn đặt được.
// File: src/features/auth/ResetPasswordPage.tsx
// ============================================================================
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, App, Button, Card, Form, Input, Result, Spin } from 'antd'
import { isAuthRetryableFetchError } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import { dichLoiAuth } from '../../utils/dichLoiAuth'
import { laLoiMang } from '../../utils/dichLoiHeThong'
import { validatePasswordStrength } from '../../services/userSettingsService'
import logoImg from '../../assets/logo.png'

const hashLucNap = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.hash.replace(/^#/, ''))
const TOKEN_KHOI_PHUC = hashLucNap.get('type') === 'recovery' ? hashLucNap.get('access_token') : null
const LINK_LOI = !!(hashLucNap.get('error_code') || hashLucNap.get('error_description'))

const KEY = 'erp_pw_recovery_uid'   // sessionStorage: user id của phiên khôi phục đang mở ở tab này
const ghiDau = (uid: string | null) => {
  try { if (uid) sessionStorage.setItem(KEY, uid); else sessionStorage.removeItem(KEY) } catch { /* trình duyệt chặn storage */ }
}
const docDau = (): string | null => {
  try { return sessionStorage.getItem(KEY) } catch { return null }
}

type Buoc = 'kiem' | 'nhap' | 'het_han' | 'mat_mang'

export function ResetPasswordPage() {
  const navigate = useNavigate()
  const { message } = App.useApp()
  const [buoc, setBuoc] = useState<Buoc>('kiem')
  const [email, setEmail] = useState('')
  const [luu, setLuu] = useState(false)
  const [loi, setLoi] = useState<string | null>(null)

  useEffect(() => {
    const truoc = document.title
    document.title = 'Đặt lại mật khẩu · Huy Anh ERP'
    return () => { document.title = truoc }
  }, [])

  useEffect(() => {
    let huy = false
    if (LINK_LOI) ghiDau(null)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== 'PASSWORD_RECOVERY' || !session) return
      ghiDau(session.user.id)
      if (!huy) { setEmail(session.user.email || ''); setBuoc('nhap') }
    })
    ;(async () => {
      const { error: loiLink } = await supabase.auth.initialize()   // kết quả xử lý token trên URL (đã chạy lúc nạp app)
      const { data: { session } } = await supabase.auth.getSession()
      if (huy) return
      const laKhoiPhuc = !!session && !LINK_LOI &&
        ((!!TOKEN_KHOI_PHUC && session.access_token === TOKEN_KHOI_PHUC) || docDau() === session.user.id)
      if (laKhoiPhuc) { ghiDau(session!.user.id); setEmail(session!.user.email || ''); setBuoc('nhap'); return }
      // Mất mạng lúc đổi token → hash còn nguyên, tải lại trang là dùng tiếp được (đừng báo nhầm "hết hạn")
      setBuoc(TOKEN_KHOI_PHUC && loiLink && (isAuthRetryableFetchError(loiLink) || laLoiMang(loiLink)) ? 'mat_mang' : 'het_han')
    })().catch((e) => { if (!huy) setBuoc(laLoiMang(e) ? 'mat_mang' : 'het_han') })
    return () => { huy = true; subscription.unsubscribe() }
  }, [])

  async function datMatKhau({ matKhau }: { matKhau: string }) {
    setLuu(true); setLoi(null)
    try {
      const { error } = await supabase.auth.updateUser({ password: matKhau })
      if (error) throw error
      ghiDau(null)
      message.success('Đã đặt mật khẩu mới — lần sau đăng nhập bằng mật khẩu này')
      navigate('/', { replace: true })
    } catch (e) {
      setLoi(dichLoiAuth(e, 'Không đặt được mật khẩu mới — thử lại'))
    } finally {
      setLuu(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <h1 className="text-2xl font-bold text-primary flex items-center justify-center gap-2 mb-6">
          <img src={logoImg} alt="Cao su Huy Anh" className="h-10 w-auto object-contain" />
          <span>Huy Anh ERP</span>
        </h1>

        {buoc === 'kiem' && (
          <div className="flex flex-col items-center gap-3 py-6 text-gray-500">
            <Spin />
            <span>Đang kiểm tra link…</span>
          </div>
        )}

        {buoc === 'het_han' && (
          <Result
            status="warning"
            title="Link đặt lại mật khẩu đã hết hạn hoặc không hợp lệ"
            subTitle="Link trong email chỉ dùng được một lần và có hạn. Liên hệ IT (nội bộ 100) để được gửi link mới."
            extra={<Button type="primary" onClick={() => navigate('/login', { replace: true })}>Về trang đăng nhập</Button>}
          />
        )}

        {buoc === 'mat_mang' && (
          <Result
            status="warning"
            title="Không kết nối được máy chủ"
            subTitle="Kiểm tra Internet/WiFi rồi tải lại trang — link vẫn dùng được nếu chưa hết hạn."
            extra={<Button type="primary" onClick={() => window.location.reload()}>Tải lại trang</Button>}
          />
        )}

        {buoc === 'nhap' && (
          <>
            <h2 className="text-lg font-semibold text-gray-800 mb-1">Đặt mật khẩu mới</h2>
            {email && <p className="text-sm text-gray-500 mb-4">Tài khoản: <b>{email}</b></p>}
            <Form layout="vertical" requiredMark={false} disabled={luu} onFinish={datMatKhau}>
              <Form.Item
                name="matKhau"
                label="Mật khẩu mới"
                extra="Ít nhất 8 ký tự, có chữ hoa, chữ thường, số và ký tự đặc biệt"
                hasFeedback
                rules={[
                  { required: true, message: 'Nhập mật khẩu mới' },
                  {
                    validator: (_, v: string | undefined) => {
                      if (!v) return Promise.resolve()
                      const r = validatePasswordStrength(v)   // cùng luật với Đổi mật khẩu ở Cài đặt tài khoản
                      return r.isValid ? Promise.resolve() : Promise.reject(new Error(r.errors.join(' · ')))
                    },
                  },
                ]}
              >
                <Input.Password autoComplete="new-password" autoFocus />
              </Form.Item>
              <Form.Item
                name="nhapLai"
                label="Nhập lại mật khẩu mới"
                dependencies={['matKhau']}
                hasFeedback
                rules={[
                  { required: true, message: 'Nhập lại mật khẩu mới' },
                  ({ getFieldValue }) => ({
                    validator: (_, v: string | undefined) =>
                      !v || v === getFieldValue('matKhau') ? Promise.resolve() : Promise.reject(new Error('Hai lần nhập không khớp')),
                  }),
                ]}
              >
                <Input.Password autoComplete="new-password" />
              </Form.Item>
              {loi && <Alert type="error" showIcon title={loi} className="mb-4" />}
              <Button type="primary" htmlType="submit" block loading={luu}>Lưu mật khẩu mới</Button>
            </Form>
          </>
        )}
      </Card>
    </div>
  )
}

export default ResetPasswordPage
