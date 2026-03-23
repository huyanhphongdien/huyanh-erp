// src/features/tasks/components/TaskForm.tsx
// ============================================================================
// TASK FORM - UPDATED v4 (BẮT BUỘC NGÀY BẮT ĐẦU + HẠN HOÀN THÀNH)
// Huy Anh ERP System
// ============================================================================

import { useState, useEffect } from 'react'
import {
  Calendar,
  User,
  Building,
  Flag,
  FileText,
  Clock,
  Loader2,
  AlertCircle,
  Plus,
  X,
  Lock,
} from 'lucide-react'

// ============================================================================
// TYPES
// ============================================================================

export interface TaskFormData {
  name: string
  description: string
  department_id: string
  assignee_id: string
  priority: string
  start_date: string
  due_date: string
  notes: string
  initial_progress: number
  parent_task_id: string
  tags: string[]
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
  department_id: string | null
}

interface CurrentUser {
  employee_id?: string | null
  department_id?: string | null
  department_name?: string | null
  full_name?: string
}

interface TaskFormProps {
  mode?: 'create' | 'edit'
  task?: any
  departments?: Department[]
  employees?: Employee[]
  parentTasks?: any[]
  onSubmit: (data: TaskFormData) => void
  onCancel: () => void
  isLoading?: boolean
  isSelfMode?: boolean
  initialData?: { department_id?: string; assignee_id?: string; name?: string; description?: string; priority?: string; due_date?: string }
  currentUser?: CurrentUser | null
  isDepartmentLocked?: boolean
}

// ============================================================================
// PRIORITY CONFIG
// ============================================================================

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Thấp', color: 'text-gray-600' },
  { value: 'medium', label: 'Trung bình', color: 'text-yellow-600' },
  { value: 'high', label: 'Cao', color: 'text-orange-600' },
  { value: 'urgent', label: 'Khẩn cấp', color: 'text-red-600' },
]

// ============================================================================
// MAIN COMPONENT - TaskForm
// ============================================================================

export function TaskForm({ 
  mode = 'create',
  task, 
  departments = [],
  employees = [],
  onSubmit, 
  onCancel, 
  isLoading = false,
  isSelfMode = false,
  initialData,
  currentUser,
  isDepartmentLocked = false,
}: TaskFormProps) {
  const [formData, setFormData] = useState<TaskFormData>({
    name: initialData?.name || '',
    description: initialData?.description || '',
    department_id: initialData?.department_id || '',
    assignee_id: initialData?.assignee_id || '',
    priority: (initialData?.priority as any) || 'medium',
    start_date: '',
    due_date: initialData?.due_date || '',
    notes: '',
    initial_progress: 0,
    parent_task_id: '',
    tags: [],
  })
  const [error, setError] = useState('')
  // Track which date fields have been touched/submitted for showing error state
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    if (task) {
      setFormData({
        name: task.name || task.title || '',
        description: task.description || '',
        department_id: task.department_id || '',
        assignee_id: task.assignee_id || '',
        priority: task.priority || 'medium',
        start_date: task.start_date ? task.start_date.split('T')[0] : '',
        due_date: task.due_date ? task.due_date.split('T')[0] : '',
        notes: task.notes || '',
        initial_progress: task.progress || 0,
        parent_task_id: task.parent_task_id || '',
        tags: task.tags || [],
      })
    }
  }, [task])

  useEffect(() => {
    if (mode === 'create' && initialData) {
      setFormData(prev => ({
        ...prev,
        name: initialData.name || prev.name,
        description: initialData.description || prev.description,
        priority: (initialData.priority as any) || prev.priority,
        due_date: initialData.due_date || prev.due_date,
        department_id: initialData.department_id || prev.department_id,
        assignee_id: initialData.assignee_id || prev.assignee_id,
      }))
    }
  }, [isSelfMode, isDepartmentLocked, initialData, mode])

  const filteredEmployees = formData.department_id
    ? employees.filter(e => e.department_id === formData.department_id)
    : (isDepartmentLocked ? employees : [])

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
    // Clear lỗi khi user bắt đầu điền
    if (error) setError('')

    if (name === 'department_id' && !isSelfMode && !isDepartmentLocked) {
      setFormData(prev => ({ ...prev, assignee_id: '', [name]: value }))
      return
    }
  }

  // Validate form — bắt buộc start_date + due_date
  const validate = (): boolean => {
    if (!formData.name.trim()) {
      setError('Vui lòng nhập tên công việc')
      return false
    }
    if (!formData.start_date) {
      setError('Vui lòng chọn ngày bắt đầu')
      return false
    }
    if (!formData.due_date) {
      setError('Vui lòng chọn hạn hoàn thành')
      return false
    }
    if (new Date(formData.start_date) > new Date(formData.due_date)) {
      setError('Ngày bắt đầu phải trước hạn hoàn thành')
      return false
    }
    setError('')
    return true
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (!validate()) return
    onSubmit(formData)
  }

  const getCurrentDepartmentName = (): string => {
    if (currentUser?.department_name) return currentUser.department_name
    const dept = departments.find(d => d.id === formData.department_id)
    return dept?.name || 'Chưa chọn phòng ban'
  }

  // Helper: class cho date input — đỏ nếu bị bỏ trống sau khi submit
  const dateInputClass = (fieldEmpty: boolean) =>
    `w-full px-3 py-2 border rounded-lg focus:ring-2 focus:border-blue-500 transition-colors ${
      submitted && fieldEmpty
        ? 'border-red-400 bg-red-50 focus:ring-red-300'
        : 'border-gray-300 focus:ring-blue-500'
    }`

  // Tính số ngày giữa 2 mốc
  const dayCount =
    formData.start_date && formData.due_date &&
    new Date(formData.due_date) > new Date(formData.start_date)
      ? Math.ceil(
          (new Date(formData.due_date).getTime() - new Date(formData.start_date).getTime()) /
          (1000 * 60 * 60 * 24)
        )
      : null

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="p-6 space-y-6">

        {/* Error Display */}
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <span className="text-sm text-red-600">{error}</span>
          </div>
        )}

        {/* Section 1: Thông tin cơ bản */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide border-b pb-2">
            Thông tin công việc
          </h3>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <FileText className="w-4 h-4 inline mr-1" />
              Tên công việc <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="Nhập tên công việc"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Mô tả</label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              placeholder="Mô tả chi tiết công việc"
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
            />
          </div>
        </div>

        {/* Section 2: Phân công */}
        {!isSelfMode && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide border-b pb-2">
              Phân công
            </h3>

            <div className="grid grid-cols-2 gap-4">
              {/* Phòng ban */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Building className="w-4 h-4 inline mr-1" />
                  Phòng ban
                  {isDepartmentLocked && (
                    <span title="Đã khóa">
                      <Lock className="w-3 h-3 inline ml-1 text-blue-500" />
                    </span>
                  )}
                </label>

                {isDepartmentLocked ? (
                  <div className="w-full px-3 py-2 border border-blue-200 rounded-lg bg-blue-50 text-blue-700 font-medium flex items-center gap-2">
                    <Building className="w-4 h-4" />
                    {getCurrentDepartmentName()}
                    <span className="ml-auto text-xs text-blue-500">(Cố định)</span>
                  </div>
                ) : (
                  <select
                    name="department_id"
                    value={formData.department_id}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                  >
                    <option value="">-- Chọn phòng ban --</option>
                    {departments.map(dept => (
                      <option key={dept.id} value={dept.id}>{dept.name}</option>
                    ))}
                  </select>
                )}

                {isDepartmentLocked && (
                  <p className="text-xs text-blue-500 mt-1">
                    Bạn chỉ có thể phân công trong phòng ban của mình
                  </p>
                )}
              </div>

              {/* Người phụ trách */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <User className="w-4 h-4 inline mr-1" />
                  Người phụ trách
                </label>
                <select
                  name="assignee_id"
                  value={formData.assignee_id}
                  onChange={handleChange}
                  disabled={!isDepartmentLocked && !formData.department_id}
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                    !isDepartmentLocked && !formData.department_id
                      ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'
                      : 'bg-white border-gray-300'
                  }`}
                >
                  <option value="">
                    {!isDepartmentLocked && !formData.department_id
                      ? '-- Chọn phòng ban trước --'
                      : '-- Chọn người phụ trách --'}
                  </option>
                  {filteredEmployees.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.full_name} {emp.code ? `(${emp.code})` : ''}
                    </option>
                  ))}
                </select>

                {!isDepartmentLocked && !formData.department_id && (
                  <p className="text-xs text-gray-500 mt-1">
                    Vui lòng chọn phòng ban để xem danh sách nhân viên
                  </p>
                )}
                {(formData.department_id || isDepartmentLocked) && filteredEmployees.length === 0 && (
                  <p className="text-xs text-orange-500 mt-1">Không có nhân viên trong phòng ban này</p>
                )}
                {(formData.department_id || isDepartmentLocked) && filteredEmployees.length > 0 && (
                  <p className="text-xs text-gray-500 mt-1">
                    {filteredEmployees.length} nhân viên trong phòng ban
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Self mode info */}
        {isSelfMode && currentUser && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide border-b pb-2">
              Phân công
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Building className="w-4 h-4 inline mr-1" />Phòng ban
                </label>
                <div className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-700">
                  {currentUser.department_name || 'Chưa có phòng ban'}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <User className="w-4 h-4 inline mr-1" />Người phụ trách
                </label>
                <div className="w-full px-3 py-2 border border-green-200 rounded-lg bg-green-50 text-green-700 font-medium">
                  {currentUser.full_name || 'Bạn'} (Bạn)
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Section 3: Thời gian & Ưu tiên — ngày BẮT BUỘC */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide border-b pb-2">
            Thời gian & Ưu tiên
          </h3>

          <div className="grid grid-cols-3 gap-4">
            {/* Độ ưu tiên */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <Flag className="w-4 h-4 inline mr-1" />
                Độ ưu tiên
              </label>
              <select
                name="priority"
                value={formData.priority}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
              >
                {PRIORITY_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            {/* Ngày bắt đầu — BẮT BUỘC */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <Calendar className="w-4 h-4 inline mr-1" />
                Ngày bắt đầu <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                name="start_date"
                value={formData.start_date}
                onChange={handleChange}
                className={dateInputClass(!formData.start_date)}
              />
              {submitted && !formData.start_date && (
                <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> Bắt buộc nhập
                </p>
              )}
            </div>

            {/* Hạn hoàn thành — BẮT BUỘC */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <Clock className="w-4 h-4 inline mr-1" />
                Hạn hoàn thành <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                name="due_date"
                value={formData.due_date}
                onChange={handleChange}
                min={formData.start_date || undefined}
                className={dateInputClass(!formData.due_date)}
              />
              {submitted && !formData.due_date && (
                <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> Bắt buộc nhập
                </p>
              )}
            </div>
          </div>

          {/* Hiển thị số ngày khi đã chọn cả 2 */}
          {dayCount && (
            <div className="flex items-center gap-1.5 text-xs text-blue-600 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
              <Calendar className="w-3.5 h-3.5" />
              Thời gian thực hiện: <span className="font-semibold">{dayCount} ngày</span>
            </div>
          )}
        </div>

        {/* Section 4: Ghi chú */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide border-b pb-2">
            Ghi chú
          </h3>
          <textarea
            name="notes"
            value={formData.notes}
            onChange={handleChange}
            placeholder="Ghi chú thêm (tùy chọn)"
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 px-6 py-4 border-t bg-gray-50 rounded-b-lg">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
          disabled={isLoading}
        >
          Hủy
        </button>
        <button
          type="submit"
          disabled={isLoading || !formData.name.trim()}
          className={`px-6 py-2 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors ${
            isSelfMode
              ? 'bg-green-600 hover:bg-green-700'
              : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
          {isLoading
            ? 'Đang lưu...'
            : mode === 'edit'
              ? 'Cập nhật'
              : isSelfMode ? 'Tạo việc cá nhân' : 'Tạo công việc'}
        </button>
      </div>
    </form>
  )
}

// ============================================================================
// QUICK TASK FORM
// ============================================================================

interface QuickTaskFormProps {
  onSubmit: (data: { name: string; priority: string; due_date: string }) => void
  onCancel?: () => void
  isLoading?: boolean
  placeholder?: string
}

export function QuickTaskForm({
  onSubmit,
  onCancel,
  isLoading = false,
  placeholder = 'Tên công việc mới...',
}: QuickTaskFormProps) {
  const [name, setName] = useState('')
  const [priority, setPriority] = useState('medium')
  const [dueDate, setDueDate] = useState('')
  const [showOptions, setShowOptions] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    onSubmit({ name: name.trim(), priority, due_date: dueDate })
    setName('')
    setPriority('medium')
    setDueDate('')
    setShowOptions(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(e) }
    if (e.key === 'Escape') onCancel?.()
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-lg border border-gray-200 p-3">
      <div className="flex items-center gap-2">
        <Plus className="w-5 h-5 text-gray-400 flex-shrink-0" />
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setShowOptions(true)}
          placeholder={placeholder}
          className="flex-1 px-2 py-1.5 text-sm border-0 focus:ring-0 focus:outline-none"
          autoFocus
          disabled={isLoading}
        />
        {name.trim() && (
          <button
            type="submit"
            disabled={isLoading}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4" />Thêm</>}
          </button>
        )}
        {onCancel && (
          <button type="button" onClick={onCancel} className="p-1.5 text-gray-400 hover:text-gray-600 rounded">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {showOptions && name.trim() && (
        <div className="flex items-center gap-3 mt-2 pt-2 border-t">
          <div className="flex items-center gap-1">
            <Flag className="w-4 h-4 text-gray-400" />
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="text-xs border-0 bg-gray-100 rounded px-2 py-1 focus:ring-1 focus:ring-blue-500"
            >
              {PRIORITY_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1">
            <Calendar className="w-4 h-4 text-gray-400" />
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="text-xs border-0 bg-gray-100 rounded px-2 py-1 focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>
      )}
    </form>
  )
}

export default TaskForm