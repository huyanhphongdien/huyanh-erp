// src/features/tasks/components/TaskStatusBadge.tsx
// Component hiển thị badge trạng thái công việc

import React from 'react'

interface TaskStatusBadgeProps {
  status: string
}

// Config cho các trạng thái
const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  // Trạng thái mới (workflow giao việc)
  draft: { 
    label: 'Bản nháp', 
    color: 'text-gray-700', 
    bg: 'bg-gray-100 border border-gray-300' 
  },
  in_progress: { 
    label: 'Đang thực hiện', 
    color: 'text-blue-700', 
    bg: 'bg-blue-100' 
  },
  paused: { 
    label: 'Tạm dừng', 
    color: 'text-yellow-700', 
    bg: 'bg-yellow-100' 
  },
  finished: { 
    label: 'Hoàn thành', 
    color: 'text-green-700', 
    bg: 'bg-green-100' 
  },
  cancelled: { 
    label: 'Đã hủy', 
    color: 'text-red-700', 
    bg: 'bg-red-100' 
  },

  // Trạng thái cũ (backward compatibility)
  pending: { 
    label: 'Chờ xử lý', 
    color: 'text-gray-700', 
    bg: 'bg-gray-100' 
  },
  new: { 
    label: 'Mới', 
    color: 'text-purple-700', 
    bg: 'bg-purple-100' 
  },
  completed: { 
    label: 'Hoàn thành', 
    color: 'text-green-700', 
    bg: 'bg-green-100' 
  },
  pending_review: { 
    label: 'Chờ đánh giá', 
    color: 'text-orange-700', 
    bg: 'bg-orange-100' 
  },
  on_hold: { 
    label: 'Tạm dừng', 
    color: 'text-yellow-700', 
    bg: 'bg-yellow-100' 
  },
}

export function TaskStatusBadge({ status }: TaskStatusBadgeProps) {
  const config = STATUS_CONFIG[status]

  if (!config) {
    // Fallback cho status không xác định
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-600">
        <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
        {status}
      </span>
    )
  }

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full ${config.bg} ${config.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${
        status === 'draft' ? 'bg-gray-400' :
        status === 'in_progress' ? 'bg-blue-500' :
        status === 'paused' || status === 'on_hold' ? 'bg-yellow-500' :
        status === 'finished' || status === 'completed' ? 'bg-green-500' :
        status === 'cancelled' ? 'bg-red-500' :
        status === 'pending_review' ? 'bg-orange-500' :
        'bg-gray-400'
      }`} />
      {config.label}
    </span>
  )
}

export default TaskStatusBadge