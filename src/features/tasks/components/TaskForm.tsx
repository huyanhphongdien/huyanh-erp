// src/features/tasks/components/TaskForm.tsx
// ============================================================================
// TASK FORM - UPDATED v3 (WITH DEPARTMENT LOCK FOR MANAGER)
// Huy Anh ERP System
// ============================================================================
// CẬP NHẬT v3:
// - Thêm prop isDepartmentLocked: Khóa dropdown phòng ban cho Manager
// - Khi isDepartmentLocked=true: Dropdown phòng ban hiển thị read-only
// - Hỗ trợ isSelfMode: Nhân viên tạo công việc cá nhân
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
// TYPES - Export để TaskCreatePage sử dụng
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
  // Hidden fields (không hiển thị trên form nhưng giữ trong data)
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
  task?: any // Existing task for edit mode
  departments?: Department[]
  employees?: Employee[]
  parentTasks?: any[] // Không sử dụng nữa nhưng giữ để backward compatible
  onSubmit: (data: TaskFormData) => void
  onCancel: () => void
  isLoading?: boolean
  // ========== PROPS MỚI CHO SELF MODE ==========
  isSelfMode?: boolean // Chế độ tự giao việc cho nhân viên
  initialData?: { department_id?: string; assignee_id?: string } // Dữ liệu ban đầu
  currentUser?: CurrentUser | null // Thông tin user hiện tại
  // ========== PROPS MỚI CHO PERMISSION ==========
  isDepartmentLocked?: boolean // Khóa dropdown phòng ban (cho Manager)
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
  // Props mới
  isSelfMode = false,
  initialData,
  currentUser,
  isDepartmentLocked = false,
}: TaskFormProps) {
  // Form state
  const [formData, setFormData] = useState<TaskFormData>({
    name: '',
    description: '',
    department_id: initialData?.department_id || '',
    assignee_id: initialData?.assignee_id || '',
    priority: 'medium',
    start_date: '',
    due_date: '',
    notes: '',
    // Hidden fields
    initial_progress: 0,
    parent_task_id: '',
    tags: [],
  })
  const [error, setError] = useState('')

  // Initialize form with existing task data (for edit mode)
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

  // Set initial data khi isSelfMode hoặc isDepartmentLocked
  useEffect(() => {
    if (mode === 'create' && initialData) {
      setFormData(prev => ({
        ...prev,
        department_id: initialData.department_id || prev.department_id,
        assignee_id: initialData.assignee_id || prev.assignee_id,
      }))
    }
  }, [isSelfMode, isDepartmentLocked, initialData, mode])

  // Filter employees by selected department
  // - isDepartmentLocked: employees đã được filter từ TaskCreatePage
  // - Không lock: phải chọn phòng ban trước mới hiển thị nhân viên
  const filteredEmployees = formData.department_id
    ? employees.filter(e => e.department_id === formData.department_id)
    : (isDepartmentLocked ? employees : [])  // Chưa chọn phòng ban → mảng rỗng

  // Handle input change
  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))

    // Reset assignee when department changes (chỉ khi không phải selfMode và không bị lock)
    if (name === 'department_id' && !isSelfMode && !isDepartmentLocked) {
      setFormData(prev => ({ ...prev, assignee_id: '' }))
    }
  }

  // Validate form
  const validate = (): boolean => {
    if (!formData.name.trim()) {
      setError('Vui lòng nhập tên công việc')
      return false
    }

    if (formData.start_date && formData.due_date) {
      if (new Date(formData.start_date) > new Date(formData.due_date)) {
        setError('Ngày bắt đầu phải trước hạn hoàn thành')
        return false
      }
    }

    setError('')
    return true
  }

  // Handle submit
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validate()) return

    onSubmit(formData)
  }

  // ========== HELPER: Lấy tên phòng ban hiện tại ==========
  const getCurrentDepartmentName = (): string => {
    if (currentUser?.department_name) {
      return currentUser.department_name
    }
    const dept = departments.find(d => d.id === formData.department_id)
    return dept?.name || 'Chưa chọn phòng ban'
  }

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

          {/* Tên công việc */}
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

          {/* Mô tả */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Mô tả
            </label>
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
        {/* ========== ẨN HOÀN TOÀN KHI SELF MODE ========== */}
        {!isSelfMode && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide border-b pb-2">
              Phân công
            </h3>

            <div className="grid grid-cols-2 gap-4">
              {/* ========== PHÒNG BAN ========== */}
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
                  // ========== LOCKED: Hiển thị read-only ==========
                  <div className="w-full px-3 py-2 border border-blue-200 rounded-lg bg-blue-50 text-blue-700 font-medium flex items-center gap-2">
                    <Building className="w-4 h-4" />
                    {getCurrentDepartmentName()}
                    <span className="ml-auto text-xs text-blue-500">(Cố định)</span>
                  </div>
                ) : (
                  // ========== UNLOCKED: Dropdown bình thường ==========
                  <select
                    name="department_id"
                    value={formData.department_id}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                  >
                    <option value="">-- Chọn phòng ban --</option>
                    {departments.map(dept => (
                      <option key={dept.id} value={dept.id}>
                        {dept.name}
                      </option>
                    ))}
                  </select>
                )}
                
                {/* Hint cho Manager */}
                {isDepartmentLocked && (
                  <p className="text-xs text-blue-500 mt-1">
                    Bạn chỉ có thể phân công trong phòng ban của mình
                  </p>
                )}
              </div>

              {/* ========== NGƯỜI PHỤ TRÁCH ========== */}
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
                
                {/* Hint: Chưa chọn phòng ban */}
                {!isDepartmentLocked && !formData.department_id && (
                  <p className="text-xs text-gray-500 mt-1">
                    Vui lòng chọn phòng ban để xem danh sách nhân viên
                  </p>
                )}
                
                {/* Warning: Không có nhân viên */}
                {(formData.department_id || isDepartmentLocked) && filteredEmployees.length === 0 && (
                  <p className="text-xs text-orange-500 mt-1">
                    Không có nhân viên trong phòng ban này
                  </p>
                )}
                
                {/* Hint: Số nhân viên */}
                {(formData.department_id || isDepartmentLocked) && filteredEmployees.length > 0 && (
                  <p className="text-xs text-gray-500 mt-1">
                    {filteredEmployees.length} nhân viên trong phòng ban
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ========== HIỂN THỊ THÔNG TIN KHI SELF MODE ========== */}
        {isSelfMode && currentUser && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide border-b pb-2">
              Phân công
            </h3>

            <div className="grid grid-cols-2 gap-4">
              {/* Phòng ban - Read only */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Building className="w-4 h-4 inline mr-1" />
                  Phòng ban
                </label>
                <div className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-700">
                  {currentUser.department_name || 'Chưa có phòng ban'}
                </div>
              </div>

              {/* Người phụ trách - Read only */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <User className="w-4 h-4 inline mr-1" />
                  Người phụ trách
                </label>
                <div className="w-full px-3 py-2 border border-green-200 rounded-lg bg-green-50 text-green-700 font-medium">
                  {currentUser.full_name || 'Bạn'} (Bạn)
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Section 3: Thời gian & Ưu tiên */}
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
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Ngày bắt đầu */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <Calendar className="w-4 h-4 inline mr-1" />
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

            {/* Hạn hoàn thành */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <Clock className="w-4 h-4 inline mr-1" />
                Hạn hoàn thành
              </label>
              <input
                type="date"
                name="due_date"
                value={formData.due_date}
                onChange={handleChange}
                min={formData.start_date || undefined}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Section 4: Ghi chú */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide border-b pb-2">
            Ghi chú
          </h3>

          <div>
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
            : (mode === 'edit' 
                ? 'Cập nhật' 
                : (isSelfMode ? 'Tạo việc cá nhân' : 'Tạo công việc')
              )
          }
        </button>
      </div>
    </form>
  )
}

// ============================================================================
// QUICK TASK FORM - Compact form for quick task creation
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

    onSubmit({
      name: name.trim(),
      priority,
      due_date: dueDate,
    })

    // Reset form
    setName('')
    setPriority('medium')
    setDueDate('')
    setShowOptions(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
    if (e.key === 'Escape') {
      onCancel?.()
    }
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
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Plus className="w-4 h-4" />
                Thêm
              </>
            )}
          </button>
        )}
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Quick Options */}
      {showOptions && name.trim() && (
        <div className="flex items-center gap-3 mt-2 pt-2 border-t">
          {/* Priority */}
          <div className="flex items-center gap-1">
            <Flag className="w-4 h-4 text-gray-400" />
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="text-xs border-0 bg-gray-100 rounded px-2 py-1 focus:ring-1 focus:ring-blue-500"
            >
              {PRIORITY_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Due Date */}
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

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

export default TaskForm