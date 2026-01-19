// src/features/tasks/components/TaskStatusBadge.tsx
// LƯU Ý: Đường dẫn từ components/ lên 3 cấp
import { Badge } from '../../../components/ui'
import type { TaskStatus } from '../../../types'
 
interface TaskStatusBadgeProps {
  status: TaskStatus
}
 
const statusConfig: Record<TaskStatus, { 
  label: string
  variant: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'secondary' 
}> = {
  new: { label: 'Mới', variant: 'info' },
  in_progress: { label: 'Đang làm', variant: 'warning' },
  pending_review: { label: 'Chờ duyệt', variant: 'secondary' },
  completed: { label: 'Hoàn thành', variant: 'success' },
  cancelled: { label: 'Đã hủy', variant: 'danger' },
  on_hold: { label: 'Tạm dừng', variant: 'default' },
}
 
export function TaskStatusBadge({ status }: TaskStatusBadgeProps) {
  const config = statusConfig[status]
  return <Badge variant={config.variant}>{config.label}</Badge>
}
