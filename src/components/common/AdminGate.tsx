// Chặn route Module Tài chính — chỉ Admin / Ban giám đốc / Phòng kế toán.
import type { ReactNode } from 'react'
import { Result } from 'antd'
import { useAuthStore } from '../../stores/authStore'
import { isFinanceUser } from '../../lib/financeAccess'

export default function AdminGate({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user)
  if (!isFinanceUser(user)) {
    return <Result status="403" title="Chỉ dành cho Tài chính" subTitle="Chỉ Admin / Ban giám đốc / Phòng kế toán được xem nội dung này." />
  }
  return <>{children}</>
}
