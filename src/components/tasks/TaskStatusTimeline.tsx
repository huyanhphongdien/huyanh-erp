// src/components/tasks/TaskStatusTimeline.tsx
// Timeline hiển thị lịch sử thay đổi trạng thái task

import { useState, useEffect } from 'react'
import { taskHistoryService, type TaskStatusChange } from '../../services/taskHistoryService'
import { ChevronDown, ChevronUp, History, ArrowRight } from 'lucide-react'

// ============================================================
// STATUS LABELS & COLORS (Vietnamese)
// ============================================================

const STATUS_LABELS: Record<string, string> = {
  draft: 'Nháp',
  in_progress: 'Đang thực hiện',
  paused: 'Tạm dừng',
  finished: 'Hoàn thành',
  completed: 'Hoàn thành',
  cancelled: 'Đã hủy',
  overdue: 'Quá hạn',
  pending_review: 'Chờ duyệt',
  pending_approval: 'Chờ phê duyệt',
  approved: 'Đã duyệt',
  rejected: 'Từ chối',
}

function getStatusLabel(status: string): string {
  return STATUS_LABELS[status] || status
}

/**
 * Determine dot color based on transition direction:
 * - Green: forward progress (draft→in_progress, in_progress→finished, etc.)
 * - Red: cancel
 * - Yellow/amber: pause
 * - Blue: default/other
 */
function getDotColor(oldStatus: string | null, newStatus: string): string {
  if (newStatus === 'cancelled') return 'bg-red-500'
  if (newStatus === 'paused') return 'bg-amber-500'
  if (newStatus === 'finished' || newStatus === 'completed' || newStatus === 'approved') return 'bg-green-500'
  if (newStatus === 'in_progress') return 'bg-blue-500'
  if (newStatus === 'rejected') return 'bg-red-400'
  if (newStatus === 'overdue') return 'bg-red-500'
  return 'bg-gray-400'
}

function getBorderColor(oldStatus: string | null, newStatus: string): string {
  if (newStatus === 'cancelled') return 'border-red-200'
  if (newStatus === 'paused') return 'border-amber-200'
  if (newStatus === 'finished' || newStatus === 'completed' || newStatus === 'approved') return 'border-green-200'
  if (newStatus === 'in_progress') return 'border-blue-200'
  return 'border-gray-200'
}

function formatTimeAgo(dateString: string): string {
  try {
    const d = new Date(dateString)
    return d.toLocaleString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  } catch {
    return dateString
  }
}

// ============================================================
// COMPONENT
// ============================================================

interface TaskStatusTimelineProps {
  taskId: string
}

export default function TaskStatusTimeline({ taskId }: TaskStatusTimelineProps) {
  const [history, setHistory] = useState<TaskStatusChange[]>([])
  const [loading, setLoading] = useState(true)
  const [collapsed, setCollapsed] = useState(true)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        const data = await taskHistoryService.getHistory(taskId)
        if (!cancelled) setHistory(data)
      } catch (err) {
        console.error('Failed to load task status history:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [taskId])

  if (loading) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex items-center gap-2 text-gray-400 text-sm">
          <History className="w-4 h-4 animate-pulse" />
          <span>Đang tải lịch sử...</span>
        </div>
      </div>
    )
  }

  if (history.length === 0) {
    return null
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Header — click to toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-gray-500" />
          <span className="text-sm font-semibold text-gray-700">
            Lịch sử thay đổi
          </span>
          <span className="px-1.5 py-0.5 text-xs bg-gray-100 text-gray-500 rounded-full">
            {history.length}
          </span>
        </div>
        {collapsed ? (
          <ChevronDown className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronUp className="w-4 h-4 text-gray-400" />
        )}
      </button>

      {/* Timeline content */}
      {!collapsed && (
        <div className="px-4 pb-4">
          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-gray-200" />

            <div className="space-y-4">
              {history.map((item, index) => {
                const dotColor = getDotColor(item.old_status, item.new_status)
                const borderColor = getBorderColor(item.old_status, item.new_status)

                return (
                  <div key={item.id || index} className="relative flex gap-3">
                    {/* Dot */}
                    <div className={`relative z-10 w-4 h-4 rounded-full ${dotColor} border-2 border-white shadow-sm flex-shrink-0 mt-1`} />

                    {/* Content */}
                    <div className={`flex-1 bg-gray-50 border ${borderColor} rounded-lg p-3`}>
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        {item.old_status && (
                          <>
                            <span className="px-2 py-0.5 bg-gray-200 text-gray-700 rounded text-xs font-medium">
                              {getStatusLabel(item.old_status)}
                            </span>
                            <ArrowRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                          </>
                        )}
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          item.new_status === 'cancelled' ? 'bg-red-100 text-red-700' :
                          item.new_status === 'paused' ? 'bg-amber-100 text-amber-700' :
                          item.new_status === 'finished' || item.new_status === 'completed' || item.new_status === 'approved' ? 'bg-green-100 text-green-700' :
                          item.new_status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
                          item.new_status === 'rejected' ? 'bg-red-100 text-red-600' :
                          'bg-gray-200 text-gray-700'
                        }`}>
                          {getStatusLabel(item.new_status)}
                        </span>
                      </div>

                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                        <span>{formatTimeAgo(item.changed_at)}</span>
                        {item.changed_by_name && (
                          <span>bởi <strong className="text-gray-700 font-medium">{item.changed_by_name}</strong></span>
                        )}
                      </div>

                      {item.notes && (
                        <p className="mt-1.5 text-xs text-gray-600 bg-white border border-gray-100 rounded px-2 py-1.5">
                          {item.notes}
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
