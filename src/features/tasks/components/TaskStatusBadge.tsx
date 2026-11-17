// src/features/tasks/components/TaskStatusBadge.tsx
// Component hiển thị badge trạng thái công việc
// Nhãn + màu đọc từ TASK_STATUS_LABELS/COLORS (types/index.ts) qua taskUi — KHÔNG chép map ở đây.
// (Bản chép cũ đã lệch: "Đang thực hiện"/"Chờ đánh giá"/"Bản nháp" trong khi mọi nơi khác
//  ghi "Đang làm"/"Chờ duyệt"/"Nháp" — audit 17/11/2026.)

import { taskStatusLabel, taskStatusTone } from '../taskUi'

interface TaskStatusBadgeProps {
  status: string
}

// Mã cũ đã rời hệ status hiện hành — chỉ để đọc dữ liệu cũ
const LEGACY_LABELS: Record<string, string> = {
  pending: 'Chờ xử lý',
}

export function TaskStatusBadge({ status }: TaskStatusBadgeProps) {
  const tone = taskStatusTone(status)
  const label = LEGACY_LABELS[status] ?? taskStatusLabel(status)

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full ${tone.bg} ${tone.text}${status === 'draft' ? ` border ${tone.border}` : ''}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${tone.dot}`} />
      {label}
    </span>
  )
}

export default TaskStatusBadge
