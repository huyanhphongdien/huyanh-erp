// Chặn route chỉ cho Admin (dùng cho Module Vốn vay — dữ liệu tài chính nhạy cảm)
import type { ReactNode } from 'react'
import { Result } from 'antd'
import { useAuthStore } from '../../stores/authStore'

// Phải KHỚP ADMIN_EMAILS trong Sidebar.tsx — tránh "thấy menu nhưng bị chặn route".
const ADMIN_EMAILS = ['minhld@huyanhrubber.com']

export default function AdminGate({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user)
  const isAdmin = user?.role === 'admin' || ADMIN_EMAILS.includes((user?.email || '').toLowerCase())
  if (!isAdmin) {
    return <Result status="403" title="Chỉ dành cho Admin" subTitle="Bạn không có quyền xem nội dung này." />
  }
  return <>{children}</>
}
