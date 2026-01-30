// src/features/tasks/components/ParentTaskInfo.tsx
// ============================================================================
// PARENT TASK INFO COMPONENT
// Phase 4.4: Hiển thị thông tin công việc cha khi xem công việc con
// ============================================================================

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowUpRight,
  AlertTriangle,
  Users,
  ChevronDown,
  ChevronUp,
  Clock,
  CheckCircle,
  X,
  Loader2,
} from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { subtaskService } from '../../../services/subtaskService'

// ============================================================================
// STATUS CONFIG
// ============================================================================

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  draft: { label: 'Nháp', color: 'text-gray-600', bg: 'bg-gray-100' },
  in_progress: { label: 'Đang làm', color: 'text-blue-600', bg: 'bg-blue-100' },
  pending_review: { label: 'Chờ duyệt', color: 'text-yellow-600', bg: 'bg-yellow-100' },
  completed: { label: 'Hoàn thành', color: 'text-green-600', bg: 'bg-green-100' },
  cancelled: { label: 'Đã hủy', color: 'text-red-600', bg: 'bg-red-100' },
  on_hold: { label: 'Tạm dừng', color: 'text-orange-600', bg: 'bg-orange-100' },
}

// ============================================================================
// INTERFACES
// ============================================================================

interface ParentTask {
  id: string
  code?: string
  name: string
  status: string
  progress: number
  start_date?: string | null
  due_date?: string | null
}

interface ParentTaskInfoProps {
  parentTaskId: string
  currentTaskId: string
}

// ============================================================================
// FETCH FUNCTIONS
// ============================================================================

async function fetchParentTask(parentId: string): Promise<ParentTask | null> {
  const { data, error } = await supabase
    .from('tasks')
    .select('id, code, name, status, progress, start_date, due_date')
    .eq('id', parentId)
    .single()

  if (error) {
    console.error('Error fetching parent task:', error)
    return null
  }

  return data
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function ParentTaskInfo({ parentTaskId, currentTaskId }: ParentTaskInfoProps) {
  const [showSiblings, setShowSiblings] = useState(false)

  // Fetch parent task
  const { 
    data: parent, 
    isLoading: parentLoading 
  } = useQuery({
    queryKey: ['parent-task', parentTaskId],
    queryFn: () => fetchParentTask(parentTaskId),
    enabled: !!parentTaskId,
  })

  // Fetch siblings
  const { 
    data: siblings = [], 
    isLoading: siblingsLoading 
  } = useQuery({
    queryKey: ['siblings', currentTaskId],
    queryFn: () => subtaskService.getSiblings(currentTaskId),
    enabled: !!currentTaskId && showSiblings,
  })

  // Loading state
  if (parentLoading) {
    return (
      <div className="bg-blue-50 rounded-lg border border-blue-200 p-4">
        <div className="flex items-center gap-2 text-blue-600">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Đang tải thông tin công việc cha...</span>
        </div>
      </div>
    )
  }

  // No parent found
  if (!parent) {
    return (
      <div className="bg-yellow-50 rounded-lg border border-yellow-200 p-4">
        <div className="flex items-center gap-2 text-yellow-600">
          <AlertTriangle className="w-4 h-4" />
          <span className="text-sm">Không tìm thấy công việc cha</span>
        </div>
      </div>
    )
  }

  const parentStatus = STATUS_CONFIG[parent.status] || STATUS_CONFIG.draft

  return (
    <div className="bg-blue-50 rounded-lg border border-blue-200 overflow-hidden">
      {/* Header */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 text-xs text-blue-600 mb-1">
              <ArrowUpRight className="w-3 h-3" />
              <span>Thuộc công việc cha</span>
            </div>

            <div className="flex items-center gap-2">
              {parent.code && (
                <span className="text-xs text-gray-500 font-mono">{parent.code}</span>
              )}
              <Link
                to={`/tasks/${parent.id}`}
                className="font-medium text-gray-900 hover:text-blue-600"
              >
                {parent.name}
              </Link>
            </div>

            {/* Parent Status & Progress */}
            <div className="flex items-center gap-3 mt-2">
              <span className={`text-xs px-2 py-0.5 rounded-full ${parentStatus.bg} ${parentStatus.color}`}>
                {parentStatus.label}
              </span>
              <div className="flex items-center gap-2">
                <div className="w-16 h-1.5 bg-blue-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full"
                    style={{ width: `${parent.progress}%` }}
                  />
                </div>
                <span className="text-xs text-gray-500">{parent.progress}%</span>
              </div>
            </div>

            {/* Dates */}
            {(parent.start_date || parent.due_date) && (
              <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                {parent.start_date && (
                  <span>
                    Bắt đầu: {new Date(parent.start_date).toLocaleDateString('vi-VN')}
                  </span>
                )}
                {parent.due_date && (
                  <span>
                    Hạn: {new Date(parent.due_date).toLocaleDateString('vi-VN')}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* View Parent Button */}
          <Link
            to={`/tasks/${parent.id}`}
            className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200 transition-colors"
          >
            Xem cha
            <ArrowUpRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Warning: Cannot create children */}
        <div className="mt-3 p-2 bg-yellow-100 border border-yellow-200 rounded-lg">
          <div className="flex items-center gap-2 text-yellow-700">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span className="text-xs">
              Đây là công việc con. Không thể tạo thêm công việc con bên dưới.
            </span>
          </div>
        </div>

        {/* Siblings Toggle */}
        <button
          onClick={() => setShowSiblings(!showSiblings)}
          className="flex items-center gap-2 mt-3 text-sm text-blue-600 hover:text-blue-700"
        >
          <Users className="w-4 h-4" />
          Công việc anh em
          {showSiblings ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Siblings List */}
      {showSiblings && (
        <div className="border-t border-blue-200 bg-white">
          {siblingsLoading ? (
            <div className="p-4 text-center">
              <Loader2 className="w-4 h-4 animate-spin mx-auto text-gray-400" />
              <span className="text-xs text-gray-500 mt-1">Đang tải...</span>
            </div>
          ) : siblings.length === 0 ? (
            <div className="p-4 text-center text-sm text-gray-500">
              Không có công việc anh em
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {siblings.map((sibling) => {
                const sibStatus = STATUS_CONFIG[sibling.status] || STATUS_CONFIG.draft
                return (
                  <Link
                    key={sibling.id}
                    to={`/tasks/${sibling.id}`}
                    className="flex items-center justify-between p-3 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      {sibling.code && (
                        <span className="text-xs text-gray-400 font-mono">
                          {sibling.code}
                        </span>
                      )}
                      <span className="text-sm text-gray-700">
                        {sibling.title || sibling.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${sibStatus.bg} ${sibStatus.color}`}>
                        {sibStatus.label}
                      </span>
                      <span className="text-xs text-gray-500">
                        {sibling.progress}%
                      </span>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default ParentTaskInfo