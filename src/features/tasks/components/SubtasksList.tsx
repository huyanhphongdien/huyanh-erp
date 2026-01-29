// src/features/tasks/components/SubtasksList.tsx
// ============================================================================
// SUBTASKS LIST COMPONENT
// Phase 4.4: Hiển thị và quản lý công việc con
// ============================================================================
// UPDATE: Thêm Phòng ban (kế thừa từ cha) và Người phụ trách
// ============================================================================

import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  CheckCircle,
  Clock,
  AlertTriangle,
  Loader2,
  Calendar,
  User,
  X,
  Info,
  Building,
} from 'lucide-react'
import { 
  subtaskService, 
  SubtaskItem, 
  SubtaskSummary, 
  CreateSubtaskInput,
} from '../../../services/subtaskService'
import { supabase } from '../../../lib/supabase'

// ============================================================================
// STATUS CONFIG
// ============================================================================

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  draft: { label: 'Nháp', color: 'text-gray-600', bg: 'bg-gray-100', icon: Clock },
  in_progress: { label: 'Đang làm', color: 'text-blue-600', bg: 'bg-blue-100', icon: Clock },
  pending_review: { label: 'Chờ duyệt', color: 'text-yellow-600', bg: 'bg-yellow-100', icon: AlertCircle },
  completed: { label: 'Hoàn thành', color: 'text-green-600', bg: 'bg-green-100', icon: CheckCircle },
  cancelled: { label: 'Đã hủy', color: 'text-red-600', bg: 'bg-red-100', icon: X },
  on_hold: { label: 'Tạm dừng', color: 'text-orange-600', bg: 'bg-orange-100', icon: AlertTriangle },
}

const PRIORITY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  low: { label: 'Thấp', color: 'text-gray-600', bg: 'bg-gray-100' },
  medium: { label: 'Trung bình', color: 'text-yellow-600', bg: 'bg-yellow-100' },
  high: { label: 'Cao', color: 'text-orange-600', bg: 'bg-orange-100' },
  urgent: { label: 'Khẩn cấp', color: 'text-red-600', bg: 'bg-red-100' },
}

// ============================================================================
// TYPES
// ============================================================================

interface Department {
  id: string
  code: string
  name: string
}

interface Employee {
  id: string
  code: string
  full_name: string
  department_id: string | null
}

// ============================================================================
// COMPONENT PROPS
// ============================================================================

interface SubtasksListProps {
  parentTaskId: string
  parentTaskCode?: string
  parentDepartmentId?: string | null  // Phòng ban của cha
  parentStartDate?: string | null
  parentDueDate?: string | null
  canEdit?: boolean
  onSubtaskCreated?: () => void
  onSubtaskDeleted?: () => void
}

// ============================================================================
// FETCH FUNCTIONS
// ============================================================================

async function fetchDepartments(): Promise<Department[]> {
  const { data, error } = await supabase
    .from('departments')
    .select('id, code, name')
    .order('name')
  
  if (error) throw error
  return data || []
}

async function fetchEmployees(departmentId?: string | null): Promise<Employee[]> {
  let query = supabase
    .from('employees')
    .select('id, code, full_name, department_id')
    .eq('status', 'active')
    .order('full_name')
  
  // Lọc theo phòng ban nếu có
  if (departmentId) {
    query = query.eq('department_id', departmentId)
  }
  
  const { data, error } = await query
  if (error) throw error
  return data || []
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function SubtasksList({
  parentTaskId,
  parentTaskCode,
  parentDepartmentId,
  parentStartDate: propStartDate,
  parentDueDate: propDueDate,
  canEdit = true,
  onSubtaskCreated,
  onSubtaskDeleted,
}: SubtasksListProps) {
  const queryClient = useQueryClient()
  
  // State
  const [expanded, setExpanded] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  // ========== FETCH DATE CONSTRAINTS ==========
  const { data: dateConstraints } = useQuery({
    queryKey: ['date-constraints', parentTaskId],
    queryFn: () => subtaskService.getDateConstraints(parentTaskId),
    enabled: !!parentTaskId,
  })

  // Ưu tiên props, fallback về fetched data
  const parentStartDate = propStartDate || dateConstraints?.minStartDate || null
  const parentDueDate = propDueDate || dateConstraints?.maxDueDate || null

  // ========== QUERIES ==========
  
  const { 
    data: subtasks = [], 
    isLoading,
  } = useQuery({
    queryKey: ['subtasks', parentTaskId],
    queryFn: () => subtaskService.getSubtasks(parentTaskId),
    enabled: !!parentTaskId,
  })

  const { data: summary } = useQuery({
    queryKey: ['subtasks-summary', parentTaskId],
    queryFn: () => subtaskService.getSubtaskSummary(parentTaskId),
    enabled: !!parentTaskId,
  })

  // ========== MUTATIONS ==========
  
  const createMutation = useMutation({
    mutationFn: (input: CreateSubtaskInput) => subtaskService.createSubtask(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subtasks', parentTaskId] })
      queryClient.invalidateQueries({ queryKey: ['subtasks-summary', parentTaskId] })
      queryClient.invalidateQueries({ queryKey: ['task', parentTaskId] })
      setShowAddForm(false)
      onSubtaskCreated?.()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (taskId: string) => subtaskService.deleteTask(taskId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subtasks', parentTaskId] })
      queryClient.invalidateQueries({ queryKey: ['subtasks-summary', parentTaskId] })
      queryClient.invalidateQueries({ queryKey: ['task', parentTaskId] })
      setDeleteId(null)
      onSubtaskDeleted?.()
    },
  })

  // ========== HELPERS ==========
  
  const formatDate = (date?: string | null) => {
    if (!date) return '-'
    return new Date(date).toLocaleDateString('vi-VN')
  }

  const getTaskDisplayName = (task: SubtaskItem) => {
    return task.title || task.name || 'Không có tiêu đề'
  }

  // ========== RENDER ==========
  
  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between p-4 bg-purple-50 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
            <span className="text-purple-600 font-semibold text-sm">
              {subtasks.length}
            </span>
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">Công việc con</h3>
            {summary && summary.total > 0 && (
              <p className="text-xs text-gray-500">
                {summary.completed}/{summary.total} hoàn thành
                {summary.overdue > 0 && (
                  <span className="text-red-500 ml-2">
                    • {summary.overdue} quá hạn
                  </span>
                )}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                setShowAddForm(true)
                setExpanded(true)
              }}
              className="flex items-center gap-1 px-3 py-1.5 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Thêm con
            </button>
          )}
          {expanded ? (
            <ChevronUp className="w-5 h-5 text-gray-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-400" />
          )}
        </div>
      </div>

      {/* Content */}
      {expanded && (
        <div className="divide-y divide-gray-100">
          {/* Summary Stats */}
          {summary && summary.total > 0 && (
            <div className="px-4 py-3 bg-gray-50 grid grid-cols-4 gap-4 text-center text-sm">
              <div>
                <div className="text-lg font-semibold text-gray-900">{summary.total}</div>
                <div className="text-xs text-gray-500">Tổng số</div>
              </div>
              <div>
                <div className="text-lg font-semibold text-green-600">{summary.completed}</div>
                <div className="text-xs text-gray-500">Hoàn thành</div>
              </div>
              <div>
                <div className="text-lg font-semibold text-blue-600">{summary.inProgress}</div>
                <div className="text-xs text-gray-500">Đang làm</div>
              </div>
              <div>
                <div className="text-lg font-semibold text-red-600">{summary.overdue}</div>
                <div className="text-xs text-gray-500">Quá hạn</div>
              </div>
            </div>
          )}

          {/* Add Form */}
          {showAddForm && (
            <AddSubtaskForm
              parentTaskId={parentTaskId}
              parentDepartmentId={parentDepartmentId}
              parentStartDate={parentStartDate}
              parentDueDate={parentDueDate}
              isLoading={createMutation.isPending}
              error={createMutation.error?.message}
              onSubmit={(data) => createMutation.mutate(data)}
              onCancel={() => {
                setShowAddForm(false)
                createMutation.reset()
              }}
            />
          )}

          {/* Loading */}
          {isLoading && (
            <div className="p-8 text-center">
              <Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-400" />
              <p className="text-sm text-gray-500 mt-2">Đang tải...</p>
            </div>
          )}

          {/* Empty State */}
          {!isLoading && subtasks.length === 0 && !showAddForm && (
            <div className="p-8 text-center">
              <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <Plus className="w-6 h-6 text-gray-400" />
              </div>
              <p className="text-gray-500">Chưa có công việc con</p>
              {canEdit && (
                <button
                  onClick={() => setShowAddForm(true)}
                  className="mt-3 text-sm text-purple-600 hover:text-purple-700"
                >
                  + Thêm công việc con đầu tiên
                </button>
              )}
            </div>
          )}

          {/* Subtask List */}
          {!isLoading && subtasks.length > 0 && (
            <div className="divide-y divide-gray-100">
              {subtasks.map((task) => {
                const status = STATUS_CONFIG[task.status] || STATUS_CONFIG.draft
                const priority = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium
                const StatusIcon = status.icon
                
                const isOverdue = task.due_date && 
                  new Date(task.due_date) < new Date() && 
                  task.status !== 'completed' && 
                  task.status !== 'cancelled'

                const violatesParentDueDate = parentDueDate && task.due_date && 
                  new Date(task.due_date) > new Date(parentDueDate)

                return (
                  <div
                    key={task.id}
                    className={`p-4 hover:bg-gray-50 transition-colors ${
                      violatesParentDueDate ? 'bg-red-50' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          {task.code && (
                            <span className="text-xs text-gray-400 font-mono">
                              {task.code}
                            </span>
                          )}
                          <Link
                            to={`/tasks/${task.id}`}
                            className="font-medium text-gray-900 hover:text-blue-600 truncate"
                          >
                            {getTaskDisplayName(task)}
                          </Link>
                          {violatesParentDueDate && (
                            <span className="text-xs text-red-600 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              Vượt hạn cha!
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
                          {task.assignee && (
                            <span className="flex items-center gap-1">
                              <User className="w-3 h-3" />
                              {task.assignee.full_name}
                            </span>
                          )}
                          {task.department && (
                            <span className="flex items-center gap-1">
                              <Building className="w-3 h-3" />
                              {task.department.name}
                            </span>
                          )}
                          {task.due_date && (
                            <span className={`flex items-center gap-1 ${isOverdue ? 'text-red-500' : ''}`}>
                              <Calendar className="w-3 h-3" />
                              {formatDate(task.due_date)}
                              {isOverdue && ' (Quá hạn)'}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                          <div className="w-20 h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                task.progress >= 100
                                  ? 'bg-green-500'
                                  : task.progress >= 50
                                  ? 'bg-blue-500'
                                  : 'bg-gray-400'
                              }`}
                              style={{ width: `${Math.min(task.progress, 100)}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-500 w-8">
                            {task.progress}%
                          </span>
                        </div>

                        <span
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs ${status.bg} ${status.color}`}
                        >
                          <StatusIcon className="w-3 h-3" />
                          {status.label}
                        </span>

                        <span
                          className={`px-2 py-1 rounded-full text-xs ${priority.bg} ${priority.color}`}
                        >
                          {priority.label}
                        </span>

                        {canEdit && (
                          <button
                            onClick={() => setDeleteId(task.id)}
                            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                            title="Xóa"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteId && (
        <DeleteConfirmModal
          taskName={subtasks.find((t) => t.id === deleteId)?.name || ''}
          isLoading={deleteMutation.isPending}
          error={deleteMutation.error?.message}
          onConfirm={() => deleteMutation.mutate(deleteId)}
          onCancel={() => {
            setDeleteId(null)
            deleteMutation.reset()
          }}
        />
      )}
    </div>
  )
}

// ============================================================================
// ADD SUBTASK FORM - Updated với Phòng ban và Người phụ trách
// ============================================================================

interface AddSubtaskFormProps {
  parentTaskId: string
  parentDepartmentId?: string | null
  parentStartDate?: string | null
  parentDueDate?: string | null
  isLoading: boolean
  error?: string
  onSubmit: (data: CreateSubtaskInput) => void
  onCancel: () => void
}

function AddSubtaskForm({
  parentTaskId,
  parentDepartmentId,
  parentStartDate,
  parentDueDate,
  isLoading,
  error,
  onSubmit,
  onCancel,
}: AddSubtaskFormProps) {
  // Form state
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('medium')
  const [startDate, setStartDate] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [departmentId, setDepartmentId] = useState(parentDepartmentId || '')
  const [assigneeId, setAssigneeId] = useState('')
  const [validationError, setValidationError] = useState('')

  // Fetch departments
  const { data: departmentsData } = useQuery({
    queryKey: ['departments'],
    queryFn: fetchDepartments,
  })
  const departments = Array.isArray(departmentsData) ? departmentsData : []

  // Fetch employees (filtered by selected department)
  const { data: employeesData, isLoading: loadingEmployees } = useQuery({
    queryKey: ['employees', departmentId],
    queryFn: () => fetchEmployees(departmentId || null),
    enabled: true, // Always fetch, filter if departmentId exists
  })
  const employees = Array.isArray(employeesData) ? employeesData : []

  // Set default department from parent
  useEffect(() => {
    if (parentDepartmentId && !departmentId) {
      setDepartmentId(parentDepartmentId)
    }
  }, [parentDepartmentId])

  // Reset assignee when department changes
  useEffect(() => {
    setAssigneeId('')
  }, [departmentId])

  // Format helpers
  const formatDateVN = (date: string | null | undefined) => {
    if (!date) return ''
    return new Date(date).toLocaleDateString('vi-VN')
  }

  const formatDateForInput = (date: string | null | undefined) => {
    if (!date) return ''
    const d = new Date(date)
    return d.toISOString().split('T')[0]
  }

  // Validate dates
  useEffect(() => {
    let error = ''
    
    if (startDate && parentStartDate) {
      const childStart = new Date(startDate)
      const parentStart = new Date(parentStartDate)
      childStart.setHours(0, 0, 0, 0)
      parentStart.setHours(0, 0, 0, 0)
      
      if (childStart < parentStart) {
        error = `Ngày bắt đầu không được trước ${formatDateVN(parentStartDate)} (ngày bắt đầu của công việc cha)`
      }
    }
    
    if (dueDate && parentDueDate) {
      const childDue = new Date(dueDate)
      const parentDue = new Date(parentDueDate)
      childDue.setHours(0, 0, 0, 0)
      parentDue.setHours(0, 0, 0, 0)
      
      if (childDue > parentDue) {
        error = `Hạn hoàn thành không được sau ${formatDateVN(parentDueDate)} (hạn của công việc cha)`
      }
    }

    if (startDate && dueDate) {
      const start = new Date(startDate)
      const due = new Date(dueDate)
      start.setHours(0, 0, 0, 0)
      due.setHours(0, 0, 0, 0)
      
      if (start > due) {
        error = 'Ngày bắt đầu phải trước hoặc bằng hạn hoàn thành'
      }
    }
    
    setValidationError(error)
  }, [startDate, dueDate, parentStartDate, parentDueDate])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!name.trim()) {
      setValidationError('Vui lòng nhập tên công việc')
      return
    }

    if (validationError) return

    onSubmit({
      parent_task_id: parentTaskId,
      name: name.trim(),
      description: description.trim() || undefined,
      priority,
      start_date: startDate || undefined,
      due_date: dueDate || undefined,
      department_id: departmentId || undefined,
      assignee_id: assigneeId || undefined,
    })
  }

  // Filter employees for dropdown
  const filteredEmployees = departmentId 
    ? employees.filter(e => e.department_id === departmentId)
    : employees

  return (
    <form onSubmit={handleSubmit} className="p-4 bg-purple-50 border-b border-purple-100">
      <h4 className="font-medium text-gray-900 mb-3">Thêm công việc con</h4>

      {/* Error Display */}
      {(error || validationError) && (
        <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
          <span className="text-sm text-red-600">{error || validationError}</span>
        </div>
      )}

      {/* Date constraints info */}
      <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex items-start gap-2">
          <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-blue-700">
            <strong className="block mb-1">⚠️ Ràng buộc ngày với công việc cha:</strong>
            <ul className="list-disc list-inside space-y-1">
              {parentStartDate ? (
                <li>Ngày bắt đầu: <strong>≥ {formatDateVN(parentStartDate)}</strong></li>
              ) : (
                <li>Ngày bắt đầu: <span className="text-gray-500">Không giới hạn</span></li>
              )}
              {parentDueDate ? (
                <li>Hạn hoàn thành: <strong>≤ {formatDateVN(parentDueDate)}</strong></li>
              ) : (
                <li>Hạn hoàn thành: <span className="text-gray-500">Không giới hạn</span></li>
              )}
            </ul>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {/* Row 1: Name */}
        <div>
          <label className="block text-xs text-gray-500 mb-1">
            Tên công việc <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nhập tên công việc con"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            autoFocus
          />
        </div>

        {/* Row 2: Description */}
        <div>
          <label className="block text-xs text-gray-500 mb-1">Mô tả</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Mô tả công việc (tùy chọn)"
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 resize-none"
          />
        </div>

        {/* Row 3: Department & Assignee */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              <Building className="w-3 h-3 inline mr-1" />
              Phòng ban
              {parentDepartmentId && (
                <span className="text-purple-500 ml-1">(kế thừa từ cha)</span>
              )}
            </label>
            <select
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            >
              <option value="">-- Chọn phòng ban --</option>
              {departments.map((dept) => (
                <option key={dept.id} value={dept.id}>
                  {dept.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              <User className="w-3 h-3 inline mr-1" />
              Người phụ trách
            </label>
            <select
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              disabled={loadingEmployees}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 disabled:bg-gray-100"
            >
              <option value="">-- Chọn người phụ trách --</option>
              {filteredEmployees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.full_name} ({emp.code})
                </option>
              ))}
            </select>
            {departmentId && filteredEmployees.length === 0 && !loadingEmployees && (
              <p className="text-xs text-orange-500 mt-1">
                Không có nhân viên trong phòng ban này
              </p>
            )}
          </div>
        </div>

        {/* Row 4: Priority & Dates */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Độ ưu tiên</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            >
              <option value="low">Thấp</option>
              <option value="medium">Trung bình</option>
              <option value="high">Cao</option>
              <option value="urgent">Khẩn cấp</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Ngày bắt đầu
              {parentStartDate && (
                <span className="text-blue-500 ml-1 text-[10px]">(≥ {formatDateVN(parentStartDate)})</span>
              )}
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              min={parentStartDate ? formatDateForInput(parentStartDate) : undefined}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 ${
                validationError.includes('bắt đầu') ? 'border-red-500 bg-red-50' : 'border-gray-300'
              }`}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Hạn hoàn thành
              {parentDueDate && (
                <span className="text-blue-500 ml-1 text-[10px]">(≤ {formatDateVN(parentDueDate)})</span>
              )}
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              max={parentDueDate ? formatDateForInput(parentDueDate) : undefined}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 ${
                validationError.includes('Hạn hoàn thành') ? 'border-red-500 bg-red-50' : 'border-gray-300'
              }`}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
            disabled={isLoading}
          >
            Hủy
          </button>
          <button
            type="submit"
            disabled={isLoading || !name.trim() || !!validationError}
            className="px-4 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            {isLoading ? 'Đang tạo...' : 'Tạo công việc con'}
          </button>
        </div>
      </div>
    </form>
  )
}

// ============================================================================
// DELETE CONFIRM MODAL
// ============================================================================

interface DeleteConfirmModalProps {
  taskName: string
  isLoading: boolean
  error?: string
  onConfirm: () => void
  onCancel: () => void
}

function DeleteConfirmModal({
  taskName,
  isLoading,
  error,
  onConfirm,
  onCancel,
}: DeleteConfirmModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-5 h-5 text-red-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-900">Xóa công việc con</h3>
            <p className="mt-2 text-sm text-gray-500">
              Bạn có chắc chắn muốn xóa công việc <strong>"{taskName}"</strong>?
              Hành động này không thể hoàn tác.
            </p>

            {error && (
              <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                <span className="text-sm text-red-600">{error}</span>
              </div>
            )}

            <div className="mt-4 flex justify-end gap-3">
              <button
                onClick={onCancel}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
                disabled={isLoading}
              >
                Hủy
              </button>
              <button
                onClick={onConfirm}
                disabled={isLoading}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
              >
                {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                {isLoading ? 'Đang xóa...' : 'Xóa'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default SubtasksList