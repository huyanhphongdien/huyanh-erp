// src/features/tasks/TaskListPage.tsx
// ============================================================================
// RESPONSIVE UPDATE:
// - Header: stacked on mobile, flex-wrap
// - Table: hidden on mobile, card view on mobile
// - Filters: compact on mobile
// - Pagination: responsive
// - Action buttons: compact, wrapped
// - Department notice: compact on mobile
// ============================================================================

import { useState, useEffect, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { 
  Plus, Eye, Edit, Trash2, RefreshCw, Send, Loader2, CheckCircle, 
  List, BarChart3, AlertTriangle, Clock, Shield, Building2 
} from 'lucide-react'
import { TaskFilters, TaskFiltersValue, DEFAULT_FILTERS } from './components/TaskFilters'
import { TaskStatusBadge } from './components/TaskStatusBadge'
import { TaskPriorityBadge } from './components/TaskPriorityBadge'
import { SubtaskBadge } from './components/SubtaskBadge'
import { TaskOverviewTab } from './components/TaskOverviewTab'
import { useTasks, useDeleteTask } from './hooks/useTasks'
import { useDepartments } from '../departments/hooks/useDepartments'
import { useEmployees } from '../employees/hooks/useEmployees'
import { useAuthStore } from '../../stores/authStore'
import { taskService } from '../../services/taskService'
import { useTaskPermissions } from './utils/useTaskPermissions'
import type { TaskForPermission } from './utils/taskPermissions'

// ============ TAB TYPES ============
type TabType = 'list' | 'overview'

const TABS = [
  { id: 'list' as TabType, label: 'Danh sách', icon: <List className="w-4 h-4" /> },
  { id: 'overview' as TabType, label: 'Tổng quan', icon: <BarChart3 className="w-4 h-4" /> },
]

// ============ HELPER FUNCTIONS ============

const COMPLETED_STATUSES = ['finished', 'cancelled']

function isTaskOverdue(task: any): boolean {
  if (!task.due_date) return false
  if (COMPLETED_STATUSES.includes(task.status)) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const dueDate = new Date(task.due_date)
  dueDate.setHours(0, 0, 0, 0)
  return dueDate < today
}

function isTaskDueToday(task: any): boolean {
  if (!task.due_date) return false
  if (COMPLETED_STATUSES.includes(task.status)) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const dueDate = new Date(task.due_date)
  dueDate.setHours(0, 0, 0, 0)
  return dueDate.getTime() === today.getTime()
}

function getDaysOverdue(dueDate: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(dueDate)
  due.setHours(0, 0, 0, 0)
  return Math.ceil((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24))
}

function toTaskForPermission(task: any): TaskForPermission {
  let assignerLevel: number | null = null
  
  if (task.assigner_level != null) {
    assignerLevel = task.assigner_level
  } else if (task.assigner?.position?.level != null) {
    assignerLevel = task.assigner.position.level
  } else if (Array.isArray(task.assigner?.position) && task.assigner.position[0]?.level != null) {
    assignerLevel = task.assigner.position[0].level
  }
  
  return {
    id: task.id,
    status: task.status,
    evaluation_status: task.evaluation_status || null,
    assignee_id: task.assignee_id || task.assignee?.id || null,
    assigner_id: task.assigner_id || task.assigner?.id || null,
    department_id: task.department_id || task.department?.id || null,
    is_self_assigned: task.is_self_assigned || false,
    assigner_level: assignerLevel,
  }
}

// ============ COMPONENT ============
export function TaskListPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = (searchParams.get('tab') as TabType) || 'list'

  const [page, setPage] = useState(1)
  const [filter, setFilter] = useState<TaskFiltersValue>(DEFAULT_FILTERS)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [assigningTaskId, setAssigningTaskId] = useState<string | null>(null)
  const [assignError, setAssignError] = useState<string | null>(null)
  const [assignSuccess, setAssignSuccess] = useState<string | null>(null)

  const { user } = useAuthStore()

  const { 
    isLoading: permissionLoading,
    userGroup, 
    userLevel,
    userDepartmentId,
    isExecutive, 
    isManager, 
    isEmployee,
    isAdmin,
    getPermissions,
    canAssignTo,
  } = useTaskPermissions()

  const effectiveDepartmentFilter = useMemo(() => {
    if (isAdmin || isExecutive) {
      return filter.department_id || undefined
    }
    if (userDepartmentId) {
      return userDepartmentId
    }
    return filter.department_id || undefined
  }, [isAdmin, isExecutive, userDepartmentId, filter.department_id])

  const apiFilter = useMemo(() => {
    const result: Record<string, any> = {}
    
    if (filter.search?.trim()) result.search = filter.search.trim()
    if (filter.status?.length > 0) result.status = filter.status
    if (filter.priority?.length > 0) result.priority = filter.priority
    if (filter.assignee_id) result.assignee_id = filter.assignee_id
    if (effectiveDepartmentFilter) result.department_id = effectiveDepartmentFilter
    if (filter.due_date_from) result.due_date_from = filter.due_date_from
    if (filter.due_date_to) result.due_date_to = filter.due_date_to
    if (filter.created_date_from) result.created_date_from = filter.created_date_from
    if (filter.created_date_to) result.created_date_to = filter.created_date_to

    return result
  }, [filter, effectiveDepartmentFilter])

  const { 
    data: tasksData, 
    isLoading, 
    isFetching,
    error, 
    refetch 
  } = useTasks(page, 10, permissionLoading ? undefined : apiFilter)
  
  const { data: departmentsData } = useDepartments()
  const { data: employeesData } = useEmployees()
  const deleteMutation = useDeleteTask()

  const userDepartmentName = useMemo(() => {
    if (!userDepartmentId || !departmentsData?.data) return ''
    const dept = (departmentsData.data as any[]).find(d => d.id === userDepartmentId)
    return dept?.name || ''
  }, [userDepartmentId, departmentsData])

  useEffect(() => {
    if (assignSuccess) {
      const timer = setTimeout(() => setAssignSuccess(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [assignSuccess])

  const formatDate = (dateString?: string | null) => {
    if (!dateString) return '-'
    try {
      return new Date(dateString).toLocaleDateString('vi-VN')
    } catch {
      return '-'
    }
  }

  const getTaskTitle = (task: any) => task.title || task.name || 'Không có tiêu đề'

  const canAssignTask = (task: any): boolean => {
    if (task.status !== 'draft') return false
    if (!task.assignee_id) return false
    
    if (isEmployee) {
      const isOwnTask = task.is_self_assigned && task.assigner_id === user?.employee_id
      return isOwnTask
    }
    
    const assigneeDepId = task.assignee?.department_id || task.department_id
    const { canAssign } = canAssignTo(assigneeDepId)
    return canAssign
  }

  const handleAssignTask = async (task: any) => {
    if (!task.assignee_id) {
      setAssignError('Công việc chưa có người phụ trách')
      return
    }
    if (!user?.employee_id) {
      setAssignError('Không xác định được người dùng')
      return
    }

    if (isEmployee) {
      const isOwnTask = task.is_self_assigned && task.assigner_id === user.employee_id
      if (!isOwnTask) {
        setAssignError('Bạn chỉ có thể giao việc cho công việc do mình tạo')
        return
      }
    } else {
      const assigneeDepId = task.assignee?.department_id || task.department_id
      const { canAssign, reason } = canAssignTo(assigneeDepId)
      if (!canAssign) {
        setAssignError(reason || 'Bạn không có quyền giao việc này')
        return
      }
    }

    const confirmMessage = task.is_self_assigned 
      ? `Xác nhận bắt đầu công việc "${getTaskTitle(task)}"?`
      : `Giao công việc "${getTaskTitle(task)}" cho nhân viên?`
    
    if (!window.confirm(confirmMessage)) return

    setAssigningTaskId(task.id)
    setAssignError(null)
    setAssignSuccess(null)

    try {
      await taskService.assignTask(task.id, task.assignee_id, user.employee_id)
      const successMessage = task.is_self_assigned
        ? `Đã bắt đầu công việc "${getTaskTitle(task)}"!`
        : `Đã giao việc "${getTaskTitle(task)}" thành công!`
      setAssignSuccess(successMessage)
      refetch()
    } catch (err: any) {
      setAssignError(err.message || 'Có lỗi khi giao việc')
    } finally {
      setAssigningTaskId(null)
    }
  }

  const handleDeleteTask = (task: any) => {
    const taskForPerm = toTaskForPermission(task)
    const permissions = getPermissions(taskForPerm)
    
    if (!permissions.canDelete) {
      setAssignError(permissions.deleteDisabledReason || 'Bạn không có quyền xóa')
      return
    }
    setDeleteId(task.id)
  }

  const tasks = tasksData?.data || []
  const totalPages = tasksData?.totalPages || 1
  const total = tasksData?.total || 0
  
  const departments = Array.isArray(departmentsData?.data) ? departmentsData.data : []
  const allEmployees = Array.isArray(employeesData?.data) ? employeesData.data : []

  const filteredEmployees = useMemo(() => {
    if (isAdmin || isExecutive) return allEmployees
    if (userDepartmentId) {
      return allEmployees.filter((emp: any) => emp.department_id === userDepartmentId)
    }
    return allEmployees
  }, [allEmployees, isAdmin, isExecutive, userDepartmentId])

  const overdueCount = useMemo(() => tasks.filter(isTaskOverdue).length, [tasks])
  const dueTodayCount = useMemo(() => tasks.filter(isTaskDueToday).length, [tasks])

  const activeFilterCount = [
    filter.search,
    filter.status?.length > 0,
    filter.priority?.length > 0,
    filter.assignee_id,
    (isAdmin || isExecutive) && filter.department_id,
    filter.due_date_from || filter.due_date_to,
    filter.created_date_from || filter.created_date_to,
  ].filter(Boolean).length

  const permissionLabel = isAdmin ? 'Admin' : isExecutive ? 'Ban Giám đốc' : isManager ? 'Quản lý' : 'Nhân viên'
  const permissionBadgeColor = isAdmin ? 'bg-red-100 text-red-700' 
    : isExecutive ? 'bg-purple-100 text-purple-700'
    : isManager ? 'bg-blue-100 text-blue-700'
    : 'bg-gray-100 text-gray-700'

  const canViewAllDepartments = isAdmin || isExecutive

  if (error) {
    return (
      <div className="p-4 md:p-6">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded text-sm sm:text-base">
          Lỗi: {(error as Error).message}
        </div>
      </div>
    )
  }

  if (permissionLoading) {
    return (
      <div className="p-4 md:p-6">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          <span className="ml-3 text-gray-500">Đang tải quyền hạn...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-4 sm:mb-6">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Quản lý công việc</h1>
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 sm:py-1 text-xs font-medium rounded-full ${permissionBadgeColor}`}>
              <Shield className="w-3 h-3" />
              {permissionLabel} (L{userLevel})
            </span>
          </div>
          {activeTab === 'list' && (
            <p className="text-sm text-gray-600 mt-1">
              Tổng: {total} công việc
              {overdueCount > 0 && <span className="ml-2 text-red-600">({overdueCount} quá hạn)</span>}
              {dueTodayCount > 0 && <span className="ml-2 text-amber-600">({dueTodayCount} đến hạn)</span>}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          {activeTab === 'list' && (
            <>
              <button
                onClick={() => refetch()}
                disabled={isFetching}
                className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg disabled:opacity-50"
                title="Làm mới"
              >
                <RefreshCw size={20} className={isFetching ? 'animate-spin' : ''} />
              </button>
              
              {isEmployee ? (
                <Link
                  to="/tasks/create?mode=self"
                  className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm sm:text-base"
                >
                  <Plus size={18} />
                  <span className="hidden xs:inline">Tạo việc</span>
                  <span className="xs:hidden">Tạo</span>
                </Link>
              ) : (
                <Link
                  to="/tasks/create"
                  className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm sm:text-base"
                >
                  <Plus size={18} />
                  <span className="hidden sm:inline">Tạo công việc</span>
                  <span className="sm:hidden">Tạo</span>
                </Link>
              )}
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-4 sm:mb-6 border-b border-gray-200">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setSearchParams({ tab: tab.id })}
            className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2.5 sm:py-3 font-medium text-sm border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' ? (
        <TaskOverviewTab
          userDepartmentId={canViewAllDepartments ? undefined : (userDepartmentId ?? undefined)}
          canViewAllDepartments={canViewAllDepartments}
        />
      ) : (
        <>
          {/* Alerts */}
          {assignSuccess && (
            <div className="mb-3 sm:mb-4 p-3 sm:p-4 bg-green-100 border border-green-300 text-green-700 rounded-lg flex justify-between items-start gap-2">
              <div className="flex items-center gap-2 text-sm sm:text-base">
                <CheckCircle size={18} className="flex-shrink-0" />
                <span>{assignSuccess}</span>
              </div>
              <button onClick={() => setAssignSuccess(null)} className="text-green-500 hover:text-green-700 text-xl leading-none flex-shrink-0">×</button>
            </div>
          )}

          {assignError && (
            <div className="mb-3 sm:mb-4 p-3 sm:p-4 bg-red-100 border border-red-300 text-red-700 rounded-lg flex justify-between items-start gap-2 text-sm sm:text-base">
              <span>{assignError}</span>
              <button onClick={() => setAssignError(null)} className="text-red-500 hover:text-red-700 text-xl leading-none flex-shrink-0">×</button>
            </div>
          )}

          {/* Department restriction notice */}
          {(isManager || isEmployee) && !isAdmin && userDepartmentName && (
            <div className={`mb-3 sm:mb-4 p-3 sm:p-4 rounded-lg flex items-start gap-2 sm:gap-3 ${
              isManager ? 'bg-blue-50 border border-blue-200' : 'bg-green-50 border border-green-200'
            }`}>
              <Building2 className={`w-5 h-5 mt-0.5 flex-shrink-0 ${isManager ? 'text-blue-500' : 'text-green-500'}`} />
              <div className="min-w-0">
                <p className={`font-medium text-sm sm:text-base ${isManager ? 'text-blue-800' : 'text-green-800'}`}>
                  Phạm vi: {userDepartmentName}
                </p>
                <p className={`text-xs sm:text-sm mt-0.5 sm:mt-1 ${isManager ? 'text-blue-600' : 'text-green-600'}`}>
                  {isManager 
                    ? 'Bạn chỉ thao tác được công việc trong phòng ban.'
                    : 'Bạn có thể xem công việc trong phòng ban và tạo công việc cá nhân.'}
                </p>
              </div>
            </div>
          )}

          {/* Filters */}
          <TaskFilters
            value={filter}
            onChange={(newFilter) => {
              setFilter(newFilter)
              setPage(1)
            }}
            departments={departments as any}
            employees={filteredEmployees as any}
            disableDepartmentFilter={!canViewAllDepartments}
          />

          {/* ========== DESKTOP TABLE (hidden on mobile) ========== */}
          <div className="hidden md:block bg-white rounded-lg shadow overflow-hidden mt-4">
            {isLoading ? (
              <div className="p-8 text-center">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto" />
                <p className="mt-2 text-gray-500">Đang tải...</p>
              </div>
            ) : tasks.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                {activeFilterCount > 0 ? 'Không tìm thấy công việc nào' : 'Không có công việc nào'}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tên</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phòng ban</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Người PT</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Trạng thái</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ưu tiên</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Hạn</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tiến độ</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {tasks.map((task: any) => {
                      const overdue = isTaskOverdue(task)
                      const dueToday = isTaskDueToday(task)
                      const daysOverdue = overdue ? getDaysOverdue(task.due_date) : 0
                      const taskForPerm = toTaskForPermission(task)
                      const permissions = getPermissions(taskForPerm)
                      const showAssignButton = canAssignTask(task)
                      const canDeleteTask = isEmployee 
                        ? (task.status === 'draft' && task.assigner_id === user?.employee_id)
                        : (task.status === 'draft' && permissions.canDelete)
                      const rowBgClass = overdue ? 'bg-red-50/50' : dueToday ? 'bg-amber-50/50' : ''
                      
                      return (
                        <tr key={task.id} className={`hover:bg-gray-50 ${rowBgClass}`}>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Link to={`/tasks/${task.id}`} className="text-blue-600 hover:underline font-medium">
                                {getTaskTitle(task)}
                              </Link>
                              <SubtaskBadge taskId={task.id} />
                              {task.is_self_assigned && (
                                <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded-full">
                                  Tự giao
                                </span>
                              )}
                              {overdue && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 rounded-full">
                                  <AlertTriangle size={12} />Quá hạn
                                </span>
                              )}
                              {dueToday && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 rounded-full">
                                  <Clock size={12} />Hôm nay
                                </span>
                              )}
                            </div>
                            {task.code && <p className="text-xs text-gray-400 mt-0.5">{task.code}</p>}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500">{task.department?.name || '-'}</td>
                          <td className="px-4 py-3 text-sm text-gray-500">{task.assignee?.full_name || '-'}</td>
                          <td className="px-4 py-3"><TaskStatusBadge status={task.status} /></td>
                          <td className="px-4 py-3"><TaskPriorityBadge priority={task.priority} /></td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col">
                              <span className={`text-sm ${
                                overdue ? 'text-red-600 font-semibold' : dueToday ? 'text-amber-600 font-semibold' : 'text-gray-500'
                              }`}>
                                {formatDate(task.due_date)}
                              </span>
                              {overdue && <span className="text-xs text-red-500 mt-0.5">{daysOverdue} ngày trước</span>}
                              {dueToday && <span className="text-xs text-amber-500 mt-0.5">Deadline hôm nay</span>}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className={`w-16 rounded-full h-2 ${overdue ? 'bg-red-200' : dueToday ? 'bg-amber-200' : 'bg-gray-200'}`}>
                                <div 
                                  className={`h-2 rounded-full ${overdue ? 'bg-red-500' : dueToday ? 'bg-amber-500' : 'bg-blue-600'}`}
                                  style={{ width: `${Math.min(task.progress || 0, 100)}%` }}
                                />
                              </div>
                              <span className={`text-sm ${overdue ? 'text-red-600' : dueToday ? 'text-amber-600' : 'text-gray-500'}`}>
                                {task.progress || 0}%
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex justify-end items-center gap-1">
                              <Link to={`/tasks/${task.id}`} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded" title="Xem chi tiết">
                                <Eye size={18} />
                              </Link>
                              {permissions.canEdit ? (
                                <Link to={`/tasks/${task.id}/edit`} className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded" title="Chỉnh sửa">
                                  <Edit size={18} />
                                </Link>
                              ) : (
                                <button disabled className="p-1.5 text-gray-300 cursor-not-allowed rounded" title={permissions.editDisabledReason || 'Không có quyền sửa'}>
                                  <Edit size={18} />
                                </button>
                              )}
                              {showAssignButton && (
                                <button
                                  onClick={() => handleAssignTask(task)}
                                  disabled={assigningTaskId === task.id}
                                  className="ml-1 px-2.5 py-1 rounded bg-green-500 hover:bg-green-600 text-white text-xs font-medium flex items-center gap-1 disabled:opacity-50"
                                  title={task.is_self_assigned ? 'Bắt đầu' : 'Giao việc'}
                                >
                                  {assigningTaskId === task.id ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                                  {task.is_self_assigned ? 'Bắt đầu' : 'Giao việc'}
                                </button>
                              )}
                              {canDeleteTask ? (
                                <button onClick={() => handleDeleteTask(task)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded" title="Xóa">
                                  <Trash2 size={18} />
                                </button>
                              ) : task.status === 'draft' && (
                                <button disabled className="p-1.5 text-gray-300 cursor-not-allowed rounded" title={permissions.deleteDisabledReason || 'Không có quyền xóa'}>
                                  <Trash2 size={18} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ========== MOBILE CARD VIEW (shown only on mobile) ========== */}
          <div className="md:hidden mt-4 space-y-3">
            {isLoading ? (
              <div className="p-8 text-center bg-white rounded-lg shadow">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto" />
                <p className="mt-2 text-gray-500 text-sm">Đang tải...</p>
              </div>
            ) : tasks.length === 0 ? (
              <div className="p-8 text-center text-gray-500 bg-white rounded-lg shadow text-sm">
                {activeFilterCount > 0 ? 'Không tìm thấy công việc nào' : 'Không có công việc nào'}
              </div>
            ) : (
              tasks.map((task: any) => {
                const overdue = isTaskOverdue(task)
                const dueToday = isTaskDueToday(task)
                const daysOverdue = overdue ? getDaysOverdue(task.due_date) : 0
                const taskForPerm = toTaskForPermission(task)
                const permissions = getPermissions(taskForPerm)
                const showAssignButton = canAssignTask(task)
                const canDeleteTask = isEmployee 
                  ? (task.status === 'draft' && task.assigner_id === user?.employee_id)
                  : (task.status === 'draft' && permissions.canDelete)
                
                return (
                  <div 
                    key={task.id} 
                    className={`bg-white rounded-lg shadow-sm border p-4 ${
                      overdue ? 'border-red-200 bg-red-50/30' : dueToday ? 'border-amber-200 bg-amber-50/30' : 'border-gray-200'
                    }`}
                  >
                    {/* Task name & badges */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="min-w-0 flex-1">
                        <Link to={`/tasks/${task.id}`} className="text-blue-600 hover:underline font-medium text-sm line-clamp-2">
                          {getTaskTitle(task)}
                        </Link>
                        {task.code && <p className="text-xs text-gray-400 mt-0.5">{task.code}</p>}
                      </div>
                      <div className="flex-shrink-0">
                        <TaskPriorityBadge priority={task.priority} />
                      </div>
                    </div>

                    {/* Badges row */}
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      <TaskStatusBadge status={task.status} />
                      <SubtaskBadge taskId={task.id} />
                      {task.is_self_assigned && (
                        <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded-full">
                          Tự giao
                        </span>
                      )}
                      {overdue && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 rounded-full">
                          <AlertTriangle size={10} />Quá {daysOverdue} ngày
                        </span>
                      )}
                      {dueToday && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 rounded-full">
                          <Clock size={10} />Hôm nay
                        </span>
                      )}
                    </div>

                    {/* Info grid */}
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-gray-500 mb-3">
                      <div>
                        <span className="text-gray-400">Phòng ban:</span>
                        <span className="ml-1 text-gray-700">{task.department?.name || '-'}</span>
                      </div>
                      <div>
                        <span className="text-gray-400">Người PT:</span>
                        <span className="ml-1 text-gray-700">{task.assignee?.full_name || '-'}</span>
                      </div>
                      <div>
                        <span className="text-gray-400">Hạn:</span>
                        <span className={`ml-1 ${overdue ? 'text-red-600 font-medium' : dueToday ? 'text-amber-600 font-medium' : 'text-gray-700'}`}>
                          {formatDate(task.due_date)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-gray-400">Tiến độ:</span>
                        <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                          <div 
                            className={`h-1.5 rounded-full ${overdue ? 'bg-red-500' : dueToday ? 'bg-amber-500' : 'bg-blue-600'}`}
                            style={{ width: `${Math.min(task.progress || 0, 100)}%` }}
                          />
                        </div>
                        <span className="text-gray-700 font-medium">{task.progress || 0}%</span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5 pt-2 border-t border-gray-100">
                      <Link 
                        to={`/tasks/${task.id}`} 
                        className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg"
                      >
                        <Eye size={14} />
                        Xem
                      </Link>
                      {permissions.canEdit && (
                        <Link 
                          to={`/tasks/${task.id}/edit`} 
                          className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-lg"
                        >
                          <Edit size={14} />
                          Sửa
                        </Link>
                      )}
                      {showAssignButton && (
                        <button
                          onClick={() => handleAssignTask(task)}
                          disabled={assigningTaskId === task.id}
                          className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg bg-green-500 hover:bg-green-600 text-white text-xs font-medium disabled:opacity-50"
                        >
                          {assigningTaskId === task.id ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                          {task.is_self_assigned ? 'Bắt đầu' : 'Giao việc'}
                        </button>
                      )}
                      {canDeleteTask && (
                        <button 
                          onClick={() => handleDeleteTask(task)} 
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-between items-center mt-4">
              <span className="text-sm text-gray-500">Trang {page}/{totalPages}</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 border rounded text-sm disabled:opacity-50 hover:bg-gray-50"
                >
                  Trước
                </button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1.5 border rounded text-sm disabled:opacity-50 hover:bg-gray-50"
                >
                  Sau
                </button>
              </div>
            </div>
          )}

          {/* Delete Dialog */}
          {deleteId && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-lg p-5 sm:p-6 max-w-sm w-full">
                <h3 className="text-lg font-semibold mb-3 sm:mb-4">Xác nhận xóa?</h3>
                <p className="text-gray-600 mb-4 text-sm sm:text-base">Bạn có chắc muốn xóa công việc này?</p>
                <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3">
                  <button onClick={() => setDeleteId(null)} className="px-4 py-2 border rounded hover:bg-gray-50 text-sm sm:text-base">
                    Hủy
                  </button>
                  <button
                    onClick={async () => {
                      await deleteMutation.mutateAsync(deleteId)
                      setDeleteId(null)
                    }}
                    disabled={deleteMutation.isPending}
                    className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 text-sm sm:text-base"
                  >
                    {deleteMutation.isPending ? 'Đang xóa...' : 'Xóa'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}