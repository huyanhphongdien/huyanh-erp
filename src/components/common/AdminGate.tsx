// Chặn route chỉ cho Admin (dùng cho Module Vốn vay — dữ liệu tài chính nhạy cảm)
import type { ReactNode } from 'react'
import { Result } from 'antd'
import { useAuthStore } from '../../stores/authStore'

export default function AdminGate({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user)
  if (user?.role !== 'admin') {
    return <Result status="403" title="Chỉ dành cho Admin" subTitle="Bạn không có quyền xem nội dung này." />
  }
  return <>{children}</>
}
