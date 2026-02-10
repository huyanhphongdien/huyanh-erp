// src/features/tasks/components/SubtaskBadge.tsx
// ============================================================================
// SUBTASK BADGE - Hiển thị số lượng công việc con trên danh sách
// ============================================================================

import { useQuery } from '@tanstack/react-query'
import { GitBranch, Loader2 } from 'lucide-react'
import { supabase } from '../../../lib/supabase'

// ============================================================================
// TYPES
// ============================================================================

interface SubtaskBadgeProps {
  taskId: string
  showZero?: boolean  // Có hiển thị khi không có subtask không
  size?: 'sm' | 'md'
}

interface SubtaskCountResult {
  total: number
  completed: number
}

// ============================================================================
// FETCH FUNCTION
// ============================================================================

async function fetchSubtaskCount(taskId: string): Promise<SubtaskCountResult> {
  const { data, error } = await supabase
    .from('tasks')
    .select('id, status')
    .eq('parent_task_id', taskId)

  if (error) throw error

  const tasks = data || []
  return {
    total: tasks.length,
    completed: tasks.filter(t => t.status === 'completed').length,
  }
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function SubtaskBadge({ 
  taskId, 
  showZero = false,
  size = 'sm' 
}: SubtaskBadgeProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['subtask-count', taskId],
    queryFn: () => fetchSubtaskCount(taskId),
    enabled: !!taskId,
    staleTime: 30000, // Cache 30 seconds
  })

  // Don't show anything if no subtasks and showZero is false
  if (!isLoading && (!data || data.total === 0) && !showZero) {
    return null
  }

  // Size classes
  const sizeClasses = size === 'sm' 
    ? 'text-xs px-1.5 py-0.5 gap-1' 
    : 'text-sm px-2 py-1 gap-1.5'

  const iconSize = size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'

  // Loading state
  if (isLoading) {
    return (
      <span className={`inline-flex items-center ${sizeClasses} bg-gray-100 text-gray-400 rounded-full`}>
        <Loader2 className={`${iconSize} animate-spin`} />
      </span>
    )
  }

  // No subtasks
  if (!data || data.total === 0) {
    return (
      <span className={`inline-flex items-center ${sizeClasses} bg-gray-100 text-gray-400 rounded-full`}>
        <GitBranch className={iconSize} />
        <span>0</span>
      </span>
    )
  }

  // Calculate color based on completion
  const completionRate = data.completed / data.total
  let bgColor = 'bg-purple-100'
  let textColor = 'text-purple-700'
  
  if (completionRate === 1) {
    bgColor = 'bg-green-100'
    textColor = 'text-green-700'
  } else if (completionRate >= 0.5) {
    bgColor = 'bg-blue-100'
    textColor = 'text-blue-700'
  }

  return (
    <span 
      className={`inline-flex items-center ${sizeClasses} ${bgColor} ${textColor} rounded-full font-medium`}
      title={`${data.completed}/${data.total} công việc con hoàn thành`}
    >
      <GitBranch className={iconSize} />
      <span>{data.completed}/{data.total}</span>
    </span>
  )
}

// ============================================================================
// INLINE BADGE - For table/list views (simpler, no query)
// ============================================================================

interface SubtaskBadgeInlineProps {
  subtaskCount?: number
  completedCount?: number
  size?: 'sm' | 'md'
}

export function SubtaskBadgeInline({ 
  subtaskCount = 0, 
  completedCount = 0,
  size = 'sm' 
}: SubtaskBadgeInlineProps) {
  if (subtaskCount === 0) return null

  // Size classes
  const sizeClasses = size === 'sm' 
    ? 'text-xs px-1.5 py-0.5 gap-1' 
    : 'text-sm px-2 py-1 gap-1.5'

  const iconSize = size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'

  // Calculate color
  const completionRate = completedCount / subtaskCount
  let bgColor = 'bg-purple-100'
  let textColor = 'text-purple-700'
  
  if (completionRate === 1) {
    bgColor = 'bg-green-100'
    textColor = 'text-green-700'
  } else if (completionRate >= 0.5) {
    bgColor = 'bg-blue-100'
    textColor = 'text-blue-700'
  }

  return (
    <span 
      className={`inline-flex items-center ${sizeClasses} ${bgColor} ${textColor} rounded-full font-medium`}
      title={`${completedCount}/${subtaskCount} công việc con hoàn thành`}
    >
      <GitBranch className={iconSize} />
      <span>{completedCount}/{subtaskCount}</span>
    </span>
  )
}

export default SubtaskBadge