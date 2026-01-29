// src/features/tasks/TaskEditPage.tsx
// ============================================================================
// UPDATED: 
// - Tích hợp phân quyền theo Position Level (EXECUTIVE/MANAGER/EMPLOYEE)
// - EXECUTIVE: Sửa tất cả
// - MANAGER: Sửa trong phòng ban, KHÔNG sửa task do Executive tạo
// - EMPLOYEE: KHÔNG sửa
// ============================================================================

import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Save, Loader2, Lock, AlertTriangle, AlertCircle, Users, Shield } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { taskStatusService } from '../../services/taskStatusService'
import subtaskService from '../../services/subtaskService'
import { useAuthStore } from '../../stores/authStore'
import {
  getTaskPermissions,
  getPermissionGroup,
  type TaskForPermission,
} from './utils/taskPermissions'

// ============================================================================
// TYPES
// ============================================================================

interface Task {
  id: string
  code?: string
  name: string
  title?: string
  description?: string | null
  department_id?: string | null
  assigner_id?: string | null
  assignee_id?: string | null
  project_id?: string | null
  parent_task_id?: string | null
  start_date?: string | null
  due_date?: string | null
  completed_date?: string | null
  status: string
  priority: string
  progress: number
  notes?: string | null
  is_self_assigned?: boolean
  evaluation_status?: string | null
  created_at?: string
  updated_at?: string
  department?: { id: string; name: string } | null
  assigner?: { id: string; full_name: string; position_id?: string } | null
  assignee?: { id: string; full_name: string } | null
  // Thêm assigner_level
  assigner_level?: number | null
}

interface Department {
  id: string
  code?: string
  name: string
}

interface Employee {
  id: string
  code?: string
  full_name: string
  department_id?: string
}

// ============================================================================
// STATUS & PRIORITY CONFIG
// ============================================================================

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Bản nháp' },
  { value: 'in_progress', label: 'Đang thực hiện' },
  { value: 'on_hold', label: 'Tạm dừng' },
  { value: 'completed', label: 'Hoàn thành' },
  { value: 'cancelled', label: 'Đã hủy' },
]

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Thấp' },
  { value: 'medium', label: 'Trung bình' },
  { value: 'high', label: 'Cao' },
  { value: 'urgent', label: 'Khẩn cấp' },
]

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function TaskEditPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuthStore()

  // State
  const [task, setTask] = useState<Task | null>(null)
  const [departments, setDepartments] = useState<Department[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  
  // Permission state
  const [userPositionLevel, setUserPositionLevel] = useState<number>(6)
  const [editPermission, setEditPermission] = useState<{ canEdit: boolean; reason?: string }>({ canEdit: true })
  
  // Subtask info
  const [subtaskCount, setSubtaskCount] = useState(0)
  const [isParentTask, setIsParentTask] = useState(false)
  const [statusChangeWarning, setStatusChangeWarning] = useState<string | null>(null)

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    department_id: '',
    assignee_id: '',
    start_date: '',
    due_date: '',
    status: 'in_progress',
    priority: 'medium',
    progress: 0,
    notes: '',
  })

  const [originalStatus, setOriginalStatus] = useState('')

  // ============================================================================
  // DATA FETCHING
  // ============================================================================

  useEffect(() => {
    const fetchData = async () => {
      if (!id) {
        setError('Không có ID công việc')
        setLoading(false)
        return
      }

      try {
        console.log('🔍 [TaskEditPage] Fetching task:', id)

        // 1. Fetch user's position level
        let posLevel = 6
        if (user?.position_id) {
          const { data: posData } = await supabase
            .from('positions')
            .select('level')
            .eq('id', user.position_id)
            .maybeSingle()
          posLevel = posData?.level || 6
        }
        setUserPositionLevel(posLevel)
        console.log('🔐 [TaskEditPage] User position level:', posLevel)

        // 2. Fetch task with assigner's position_id
        const { data: taskData, error: taskError } = await supabase
          .from('tasks')
          .select(`
            *,
            department:departments(id, name),
            assigner:employees!tasks_assigner_id_fkey(id, full_name, position_id),
            assignee:employees!tasks_assignee_id_fkey(id, full_name)
          `)
          .eq('id', id)
          .single()

        if (taskError) {
          console.error('❌ [TaskEditPage] Task error:', taskError)
          throw new Error('Không tìm thấy công việc')
        }

        console.log('✅ [TaskEditPage] Task loaded:', taskData)

        // 3. Fetch assigner's position level
        let assignerLevel: number | null = null
        if (taskData.assigner?.position_id) {
          const { data: assignerPosData } = await supabase
            .from('positions')
            .select('level')
            .eq('id', taskData.assigner.position_id)
            .maybeSingle()
          assignerLevel = assignerPosData?.level || null
        }
        
        // Enrich task với assigner_level
        const enrichedTask: Task = {
          ...taskData,
          assigner_level: assignerLevel,
        }

        console.log('🔐 [TaskEditPage] Assigner level:', assignerLevel)

        // 4. CHECK PERMISSIONS using getTaskPermissions
        const taskForPerm: TaskForPermission = {
          id: enrichedTask.id,
          status: enrichedTask.status,
          evaluation_status: enrichedTask.evaluation_status,
          assignee_id: enrichedTask.assignee_id,
          assigner_id: enrichedTask.assigner_id,
          department_id: enrichedTask.department_id,
          is_self_assigned: enrichedTask.is_self_assigned,
          assigner_level: assignerLevel,
        }

        const permissions = getTaskPermissions(
          taskForPerm,
          user?.employee_id || null,
          (user?.role as any) || 'employee',
          user?.department_id || null,
          posLevel
        )

        console.log('🔐 [TaskEditPage] Permissions:', permissions)

        setEditPermission({
          canEdit: permissions.canEdit,
          reason: permissions.editDisabledReason,
        })
        
        // 5. CHECK IF PARENT TASK
        const count = await subtaskService.getSubtaskCount(id)
        setSubtaskCount(count)
        setIsParentTask(count > 0)

        // 6. Fetch departments & employees
        const { data: deptData } = await supabase
          .from('departments')
          .select('id, code, name')
          .order('name')

        const { data: empData } = await supabase
          .from('employees')
          .select('id, code, full_name, department_id')
          .order('full_name')

        setTask(enrichedTask)
        setDepartments(deptData || [])
        setEmployees(empData || [])

        // Set form data từ task
        const currentStatus = taskData.status || 'in_progress'
        setOriginalStatus(currentStatus)
        
        setFormData({
          name: taskData.name || '',
          description: taskData.description || '',
          department_id: taskData.department_id || '',
          assignee_id: taskData.assignee_id || '',
          start_date: taskData.start_date ? taskData.start_date.split('T')[0] : '',
          due_date: taskData.due_date ? taskData.due_date.split('T')[0] : '',
          status: currentStatus,
          priority: taskData.priority || 'medium',
          progress: taskData.progress || 0,
          notes: taskData.notes || '',
        })

      } catch (err: any) {
        console.error('❌ [TaskEditPage] Error:', err)
        setError(err.message || 'Có lỗi xảy ra')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [id, user])

  // ============================================================================
  // HANDLERS
  // ============================================================================

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value, type } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? parseInt(value) || 0 : value,
    }))
  }

  // Handle status change with cascade warning
  const handleStatusChange = async (newStatus: string) => {
    setFormData(prev => ({ ...prev, status: newStatus }))
    setStatusChangeWarning(null)

    // Nếu là công việc cha và đang đổi status
    if (isParentTask && newStatus !== originalStatus) {
      const validation = await taskStatusService.canChangeStatus(id!, newStatus)
      
      if (!validation.canChange) {
        setError(validation.reason || 'Không thể thay đổi trạng thái')
        setFormData(prev => ({ ...prev, status: originalStatus }))
        return
      }

      if (validation.warnings && validation.warnings.length > 0) {
        setStatusChangeWarning(validation.warnings.join('\n'))
      }
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!id) return
    
    // Double-check permission before submit
    if (!editPermission.canEdit) {
      setError(editPermission.reason || 'Không có quyền chỉnh sửa công việc này')
      return
    }

    setSaving(true)
    setError(null)
    setWarning(null)

    try {
      console.log('💾 [TaskEditPage] Saving:', formData)

      // Kiểm tra status change cho công việc cha
      const statusChanged = formData.status !== originalStatus
      
      if (statusChanged && isParentTask) {
        // Sử dụng taskStatusService.changeTaskStatus để handle cascade
        const result = await taskStatusService.changeTaskStatus(id, formData.status)
        
        if (!result.success) {
          throw new Error(result.error || 'Không thể thay đổi trạng thái')
        }

        if (result.warnings && result.warnings.length > 0) {
          setWarning(result.warnings.join('\n'))
        }

        if (result.cascadedChildren && result.cascadedChildren > 0) {
          console.log(`✅ Đã cascade ${result.cascadedChildren} công việc con`)
        }
      }

      // Update các field khác (không bao gồm status nếu đã xử lý riêng)
      const updateData: Record<string, any> = {
        name: formData.name,
        description: formData.description || null,
        department_id: formData.department_id || null,
        assignee_id: formData.assignee_id || null,
        start_date: formData.start_date || null,
        due_date: formData.due_date || null,
        priority: formData.priority,
        progress: formData.progress,
        notes: formData.notes || null,
        updated_at: new Date().toISOString(),
      }

      // Nếu status chưa được xử lý bởi cascade logic
      if (!statusChanged || !isParentTask) {
        updateData.status = formData.status
        
        // Auto set completed_date khi status = completed và progress = 100
        if (formData.status === 'completed' && formData.progress >= 100) {
          updateData.completed_date = new Date().toISOString()
        }
      }

      const { error: updateError } = await supabase
        .from('tasks')
        .update(updateData)
        .eq('id', id)

      if (updateError) {
        console.error('❌ [TaskEditPage] Update error:', updateError)
        throw updateError
      }

      console.log('✅ [TaskEditPage] Saved successfully')
      navigate('/tasks')
    } catch (err: any) {
      console.error('❌ [TaskEditPage] Error:', err)
      setError(err.message || 'Không thể cập nhật công việc')
    } finally {
      setSaving(false)
    }
  }

  // ============================================================================
  // PERMISSION DISPLAY HELPERS
  // ============================================================================

  const userGroup = getPermissionGroup(userPositionLevel)
  const permissionLabel = user?.role === 'admin' ? 'Admin' 
    : userGroup === 'executive' ? 'Ban Giám đốc'
    : userGroup === 'manager' ? 'Quản lý'
    : 'Nhân viên'
  
  const permissionBadgeColor = user?.role === 'admin' ? 'bg-red-100 text-red-700'
    : userGroup === 'executive' ? 'bg-purple-100 text-purple-700'
    : userGroup === 'manager' ? 'bg-blue-100 text-blue-700'
    : 'bg-gray-100 text-gray-700'

  // ============================================================================
  // RENDER - LOADING
  // ============================================================================

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="flex items-center gap-3 text-gray-500">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Đang tải...</span>
          </div>
        </div>
      </div>
    )
  }

  // ============================================================================
  // RENDER - NOT EDITABLE (LOCKED)
  // ============================================================================

  if (!editPermission.canEdit) {
    return (
      <div className="p-6">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="flex items-center gap-4 mb-6">
            <button
              onClick={() => navigate(-1)}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-gray-900">Không thể chỉnh sửa</h1>
                <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full ${permissionBadgeColor}`}>
                  <Shield className="w-3 h-3" />
                  {permissionLabel}
                </span>
              </div>
              {task && (
                <p className="text-sm text-gray-500">
                  {task.code} - {task.name}
                </p>
              )}
            </div>
          </div>

          {/* Lock Message */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0">
                <Lock className="w-8 h-8 text-yellow-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-yellow-800 mb-2">
                  Công việc bị khóa chỉnh sửa
                </h3>
                <p className="text-yellow-700 mb-4">
                  {editPermission.reason}
                </p>
                
                {/* Show current evaluation status */}
                {task?.evaluation_status && task.evaluation_status !== 'none' && (
                  <div className="bg-yellow-100 rounded-lg p-3 mb-4">
                    <p className="text-sm text-yellow-800">
                      <strong>Trạng thái đánh giá:</strong>{' '}
                      {task.evaluation_status === 'pending_approval' && 'Chờ phê duyệt'}
                      {task.evaluation_status === 'approved' && 'Đã duyệt'}
                      {task.evaluation_status === 'rejected' && 'Đã từ chối'}
                    </p>
                  </div>
                )}

                {/* Show assigner info if task created by Executive */}
                {task?.assigner_level && task.assigner_level <= 3 && userGroup === 'manager' && (
                  <div className="bg-purple-50 rounded-lg p-3 mb-4">
                    <p className="text-sm text-purple-800">
                      <strong>Người giao:</strong> {task.assigner?.full_name || 'Ban Giám đốc'} (Level {task.assigner_level})
                    </p>
                    <p className="text-xs text-purple-600 mt-1">
                      Quản lý không được phép sửa công việc do Ban Giám đốc tạo.
                    </p>
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={() => navigate(`/tasks/${id}`)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Xem chi tiết
                  </button>
                  <button
                    onClick={() => navigate('/tasks')}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    Quay lại danh sách
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ============================================================================
  // RENDER - ERROR / NOT FOUND
  // ============================================================================

  if (!task) {
    return (
      <div className="p-6">
        <div className="max-w-2xl mx-auto">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-yellow-700">
            <p className="font-medium">Không tìm thấy công việc</p>
            <p className="text-sm mt-1">{error || 'Công việc không tồn tại hoặc đã bị xóa.'}</p>
          </div>
          <button
            onClick={() => navigate('/tasks')}
            className="mt-4 flex items-center gap-2 text-blue-600 hover:text-blue-800"
          >
            <ArrowLeft className="w-4 h-4" />
            Quay lại danh sách
          </button>
        </div>
      </div>
    )
  }

  // ============================================================================
  // RENDER - FORM
  // ============================================================================

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate('/tasks')}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold text-gray-900">Sửa công việc</h1>
            <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full ${permissionBadgeColor}`}>
              <Shield className="w-3 h-3" />
              {permissionLabel}
            </span>
            {isParentTask && (
              <span className="px-2 py-1 text-xs bg-purple-100 text-purple-700 rounded-full flex items-center gap-1">
                <Users className="w-3 h-3" />
                Có {subtaskCount} con
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500">
            {task.code} - {task.name}
          </p>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 flex items-start gap-2">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div className="whitespace-pre-line">{error}</div>
        </div>
      )}

      {/* Warning Alert */}
      {warning && (
        <div className="mb-4 bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-yellow-700 flex items-start gap-2">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div className="whitespace-pre-line">{warning}</div>
        </div>
      )}

      {/* Parent Task Warning */}
      {isParentTask && (
        <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start gap-2 text-blue-700">
            <Users className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Công việc cha với {subtaskCount} công việc con</p>
              <p className="text-sm mt-1">
                • Tiến độ và trạng thái được tính tự động từ các công việc con<br/>
                • Thay đổi trạng thái "Tạm dừng" hoặc "Đã hủy" sẽ áp dụng cho tất cả công việc con
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Status Change Warning */}
      {statusChangeWarning && (
        <div className="mb-4 bg-orange-50 border border-orange-200 rounded-lg p-4 text-orange-700 flex items-start gap-2">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Cảnh báo cascade</p>
            <p className="text-sm whitespace-pre-line mt-1">{statusChangeWarning}</p>
          </div>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="max-w-4xl">
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
          
          {/* Section: Thông tin cơ bản */}
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Thông tin cơ bản</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* Tên công việc */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tên công việc <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Nhập tên công việc"
                />
              </div>

              {/* Mô tả */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Mô tả
                </label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Mô tả chi tiết công việc"
                />
              </div>

              {/* Phòng ban */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Phòng ban
                </label>
                <select
                  name="department_id"
                  value={formData.department_id}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">-- Chọn phòng ban --</option>
                  {departments.map((dept) => (
                    <option key={dept.id} value={dept.id}>
                      {dept.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Người thực hiện */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Người thực hiện
                </label>
                <select
                  name="assignee_id"
                  value={formData.assignee_id}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">-- Chọn người thực hiện --</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.full_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Section: Thời gian */}
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Thời gian</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* Ngày bắt đầu */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Ngày bắt đầu
                </label>
                <input
                  type="date"
                  name="start_date"
                  value={formData.start_date}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* Ngày hết hạn */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Ngày hết hạn
                </label>
                <input
                  type="date"
                  name="due_date"
                  value={formData.due_date}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Section: Trạng thái & Ưu tiên */}
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Trạng thái & Ưu tiên</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              
              {/* Trạng thái */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Trạng thái
                  {isParentTask && (
                    <span className="text-xs text-blue-600 ml-1">(có ảnh hưởng con)</span>
                  )}
                </label>
                <select
                  name="status"
                  value={formData.status}
                  onChange={(e) => handleStatusChange(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Độ ưu tiên */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Độ ưu tiên
                </label>
                <select
                  name="priority"
                  value={formData.priority}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {PRIORITY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Tiến độ */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tiến độ (%)
                  {isParentTask && (
                    <span className="text-xs text-blue-600 ml-1">(tự động từ con)</span>
                  )}
                </label>
                <input
                  type="number"
                  name="progress"
                  value={formData.progress}
                  onChange={handleChange}
                  min={0}
                  max={100}
                  disabled={isParentTask}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                />
              </div>
            </div>
            
            {/* Progress bar preview */}
            <div className="mt-3">
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${
                    formData.progress >= 100 ? 'bg-green-500' : 'bg-blue-500'
                  }`}
                  style={{ width: `${Math.min(formData.progress, 100)}%` }}
                />
              </div>
            </div>
          </div>

          {/* Section: Ghi chú */}
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Ghi chú</h2>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Ghi chú thêm..."
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={() => navigate('/tasks')}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Lưu thay đổi
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}

export default TaskEditPage