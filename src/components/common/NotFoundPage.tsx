// ============================================================================
// NotFoundPage — route '*' (audit UI 17/11/2026, Đợt 3).
// Trước đó URL sai / bookmark cũ bị <Navigate to="/"> lặng lẽ đẩy về Tổng quan, người dùng tưởng "mất trang".
// Giờ nói rõ chuyện gì xảy ra, vẫn 1 cú bấm là về Tổng quan.
// File: src/components/common/NotFoundPage.tsx
// ============================================================================
import { useEffect } from 'react'
import { Button, Result } from 'antd'
import { useLocation, useNavigate } from 'react-router-dom'

export default function NotFoundPage() {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  // Rời trang 404 thì trả tiêu đề cũ — trang kế (vd /login, vỏ /m/*) không tự đặt tiêu đề sẽ khỏi mang chữ "Không tìm thấy"
  useEffect(() => {
    const truoc = document.title
    document.title = 'Không tìm thấy trang · Huy Anh ERP'
    return () => { document.title = truoc }
  }, [])

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: '#F0EDE8' }}>
      <Result
        status="404"
        title="Không tìm thấy trang này"
        subTitle={
          <>
            Đường dẫn <code style={{ wordBreak: 'break-all' }}>{pathname}</code> không có trong hệ thống —
            có thể link cũ đã đổi hoặc gõ nhầm địa chỉ.
          </>
        }
        extra={
          <Button type="primary" onClick={() => navigate('/', { replace: true })}>
            Về Tổng quan
          </Button>
        }
      />
    </div>
  )
}
