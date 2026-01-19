// src/features/tasks/components/TaskPriorityBadge.tsx
import { Badge } from '../../../components/ui'
import type { TaskPriority } from '../../../types'
 
interface TaskPriorityBadgeProps {
  priority: TaskPriority
}
 
const priorityConfig: Record<TaskPriority, { 
  label: string
  variant: 'default' | 'success' | 'warning' | 'danger' | 'info' 
}> = {
  low: { label: 'Thấp', variant: 'default' },
  medium: { label: 'Trung bình', variant: 'info' },
  high: { label: 'Cao', variant: 'warning' },
  urgent: { label: 'Khẩn cấp', variant: 'danger' },
}
 
export function TaskPriorityBadge({ priority }: TaskPriorityBadgeProps) {
  const config = priorityConfig[priority]
  return <Badge variant={config.variant}>{config.label}</Badge>
}
