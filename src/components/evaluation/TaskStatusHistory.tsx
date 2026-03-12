// src/components/evaluation/TaskStatusHistory.tsx
// Component hiển thị lịch sử thay đổi trạng thái task

import { useQuery } from '@tanstack/react-query'
import { getTaskStatusHistory, getChangeTypeLabel, type TaskStatusHistory } from '../../services/taskStatusService'
import { formatDistanceToNow, format } from 'date-fns'
import { vi } from 'date-fns/locale'

interface TaskStatusHistoryProps {
  taskId: string
  showTitle?: boolean
  maxItems?: number
  compact?: boolean
}

// Status color mapping
const statusColors: Record<string, { bg: string; text: string; border: string }> = {
  new: { bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-300' },
  in_progress: { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-300' },
  pending_review: { bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-300' },
  completed: { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-300' },
  cancelled: { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-300' },
  on_hold: { bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-300' },
  overdue: { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-300' }
}

const statusLabels: Record<string, string> = {
  new: 'Mới tạo',
  in_progress: 'Đang thực hiện',
  pending_review: 'Chờ phê duyệt',
  completed: 'Hoàn thành',
  cancelled: 'Đã hủy',
  on_hold: 'Tạm dừng',
  overdue: 'Quá hạn'
}

const changeTypeIcons: Record<string, string> = {
  manual: '✏️',
  auto_due: '⏰',
  auto_overdue: '⚠️',
  approval: '✅',
  rejection: '❌',
  revision_request: '📝'
}

export function TaskStatusHistoryComponent({
  taskId,
  showTitle = true,
  maxItems,
  compact = false
}: TaskStatusHistoryProps) {
  const { data: history = [], isLoading, error } = useQuery({
    queryKey: ['task-status-history', taskId],
    queryFn: () => getTaskStatusHistory(taskId),
    enabled: !!taskId
  })

  const displayHistory = maxItems ? history.slice(0, maxItems) : history

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-red-500 text-sm py-4">
        Không thể tải lịch sử thay đổi
      </div>
    )
  }

  if (history.length === 0) {
    return (
      <div className="text-gray-500 text-sm py-4 text-center">
        Chưa có lịch sử thay đổi
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {showTitle && (
        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
          <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Lịch sử thay đổi trạng thái
        </h3>
      )}

      <div className="relative">
        <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200" />

        <div className="space-y-4">
          {displayHistory.map((item, index) => (
            <HistoryItem 
              key={item.id} 
              item={item} 
              isFirst={index === 0}
              isLast={index === displayHistory.length - 1}
              compact={compact}
            />
          ))}
        </div>
      </div>

      {maxItems && history.length > maxItems && (
        <div className="text-center pt-2">
          <span className="text-sm text-gray-500">
            ... và {history.length - maxItems} thay đổi khác
          </span>
        </div>
      )}
    </div>
  )
}

interface HistoryItemProps {
  item: TaskStatusHistory
  isFirst: boolean
  isLast: boolean
  compact: boolean
}

function HistoryItem({ item, isFirst, compact }: HistoryItemProps) {
  const newStatusColor = statusColors[item.new_status] || statusColors.new
  const oldStatusColor = item.old_status ? (statusColors[item.old_status] || statusColors.new) : null
  const changeTypeIcon = changeTypeIcons[item.change_type] || '📌'

  if (compact) {
    return (
      <div className="flex items-center gap-3 pl-8 relative">
        <div className={`absolute left-2.5 w-3 h-3 rounded-full ${newStatusColor.bg} ${newStatusColor.border} border-2`} />
        
        <div className="flex-1 flex items-center gap-2 text-sm">
          <span>{changeTypeIcon}</span>
          {oldStatusColor && (
            <>
              <span className={`px-1.5 py-0.5 rounded ${oldStatusColor.bg} ${oldStatusColor.text} text-xs`}>
                {statusLabels[item.old_status!] || item.old_status}
              </span>
              <span className="text-gray-400">→</span>
            </>
          )}
          <span className={`px-1.5 py-0.5 rounded ${newStatusColor.bg} ${newStatusColor.text} text-xs`}>
            {statusLabels[item.new_status] || item.new_status}
          </span>
          <span className="text-gray-400 text-xs">
            {formatDistanceToNow(new Date(item.created_at), { addSuffix: true, locale: vi })}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="relative pl-10">
      <div className={`absolute left-2 w-5 h-5 rounded-full flex items-center justify-center
        ${isFirst ? 'bg-blue-500 text-white' : `${newStatusColor.bg} ${newStatusColor.border} border-2`}`}
      >
        {isFirst && (
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        )}
      </div>

      <div className={`bg-white border rounded-lg p-3 ${isFirst ? 'border-blue-200 shadow-sm' : 'border-gray-200'}`}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-lg">{changeTypeIcon}</span>
            <span className="font-medium text-gray-900">
              {getChangeTypeLabel(item.change_type)}
            </span>
          </div>
          <span className="text-xs text-gray-500">
            {format(new Date(item.created_at), 'dd/MM/yyyy HH:mm', { locale: vi })}
          </span>
        </div>

        <div className="flex items-center gap-2 mb-2">
          {oldStatusColor && (
            <>
              <span className={`px-2 py-1 rounded text-sm ${oldStatusColor.bg} ${oldStatusColor.text}`}>
                {statusLabels[item.old_status!] || item.old_status}
                {item.old_progress !== null && ` (${item.old_progress}%)`}
              </span>
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </>
          )}
          <span className={`px-2 py-1 rounded text-sm ${newStatusColor.bg} ${newStatusColor.text}`}>
            {statusLabels[item.new_status] || item.new_status}
            {item.new_progress !== null && ` (${item.new_progress}%)`}
          </span>
        </div>

        {item.change_reason && (
          <div className="text-sm text-gray-600 bg-gray-50 rounded p-2 mt-2">
            <span className="font-medium">Lý do: </span>
            {item.change_reason}
          </div>
        )}

        {item.changed_by_employee && (
          <div className="text-xs text-gray-500 mt-2 flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            {item.changed_by_employee.full_name}
          </div>
        )}
      </div>
    </div>
  )
}

// Status Badge Component
interface StatusBadgeProps {
  status: string
  size?: 'sm' | 'md' | 'lg'
  showIcon?: boolean
}

export function StatusBadge({ status, size = 'md', showIcon = false }: StatusBadgeProps) {
  const colors = statusColors[status] || statusColors.new
  const sizeClasses = {
    sm: 'px-1.5 py-0.5 text-xs',
    md: 'px-2 py-1 text-sm',
    lg: 'px-3 py-1.5 text-base'
  }

  const icons: Record<string, string> = {
    new: '🆕',
    in_progress: '🔄',
    pending_review: '⏳',
    completed: '✅',
    cancelled: '❌',
    on_hold: '⏸️',
    overdue: '⚠️'
  }

  return (
    <span className={`${sizeClasses[size]} ${colors.bg} ${colors.text} rounded-full font-medium inline-flex items-center gap-1`}>
      {showIcon && <span>{icons[status]}</span>}
      {statusLabels[status] || status}
    </span>
  )
}

export default TaskStatusHistoryComponent