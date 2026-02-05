// src/features/tasks/TaskViewPage.tsx
// ============================================================================
// v3: Uses shared useTaskPermissions hook instead of local permission function
// Employee same-department: can view + comment only
// ============================================================================

import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, Edit, Trash2, Calendar, User, Building, Flag, Clock, Lock, AlertTriangle, Users, Eye } from 'lucide-react'
import { Card } from '../../components/ui'
import { TaskStatusBadge } from './components/TaskStatusBadge'
import { TaskPriorityBadge } from './components/TaskPriorityBadge'
import { useTask, useDeleteTask } from './hooks/useTasks'
import { useState, useEffect, useMemo } from 'react'
import { useAuthStore } from '../../stores/authStore'

import { SubtasksList } from './components/SubtasksList'
import { ParentTaskInfo } from './components/ParentTaskInfo'
import subtaskService from '../../services/subtaskService'
import { AttachmentSection } from './components/AttachmentSection'
import { CommentSection } from './components/CommentSection'
import { ActivityTimeline } from './components/ActivityTimeline'
import TaskParticipantsSection from './components/TaskParticipantsSection'
import { useTaskPermissions, type TaskForPermission } from './utils/useTaskPermissions'

// ============ EVALUATION STATUS CONFIG ============
const EVALUATION_STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  none: { label: 'Chưa đánh giá', color: 'text-gray-600', bgColor: 'bg-gray-100' },
  pending_self_eval: { label: 'Chờ tự đánh giá', color: 'text-yellow-600', bgColor: 'bg-yellow-100' },
  pending_approval: { label: 'Chờ duyệt', color: 'text-blue-600', bgColor: 'bg-blue-100' },
  approved: { label: 'Đã duyệt', color: 'text-green-600', bgColor: 'bg-green-100' },
  rejected: { label: 'Từ chối', color: 'text-red-600', bgColor: 'bg-red-100' },
  revision_required: { label: 'Cần sửa', color: 'text-orange-600', bgColor: 'bg-orange-100' },
}

// ============ COMPONENT ============
export function TaskViewPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [showDelete, setShowDelete] = useState(false)
  const { user } = useAuthStore()

  const [isChildTask, setIsChildTask] = useState(false)
  const [, setCanHaveChildren] = useState(true)
  const [subtaskCount, setSubtaskCount] = useState(0)

  const { data: task, isLoading, error, refetch } = useTask(id || '')
  const deleteMutation = useDeleteTask()
  
  // ← Use shared permission hook
  const { getPermissions } = useTaskPermissions()

  useEffect(() => {
    const checkSubtaskInfo = async () => {
      if (!task || !id) return

      const t = task as any
      setIsChildTask(!!t.parent_task_id)

      if (!t.parent_task_id) {
        const result = await subtaskService.canHaveChildren(id)
        setCanHaveChildren(result.canCreate)
        const count = await subtaskService.getSubtaskCount(id)
        setSubtaskCount(count)
      } else {
        setCanHaveChildren(false)
      }
    }

    checkSubtaskInfo()
  }, [task, id])

  // Build TaskForPermission from loaded task
  const permissions = useMemo(() => {
    if (!task) return null
    const t = task as any
    const taskForPerm: TaskForPermission = {
      id: t.id,
      status: t.status || 'draft',
      evaluation_status: t.evaluation_status || null,
      assignee_id: t.assignee_id || t.assignee?.id || null,
      assigner_id: t.assigner_id || t.assigner?.id || null,
      department_id: t.department_id || t.department?.id || null,
      is_self_assigned: t.is_self_assigned || false,
      assigner_level: t.assigner_level || t.assigner?.position?.level || null,
    }
    return getPermissions(taskForPerm)
  }, [task, getPermissions])

  // Derived flags
  const isLocked = useMemo(() => {
    if (!task) return false
    const evalStatus = (task as any).evaluation_status || 'none'
    return evalStatus === 'pending_approval' || evalStatus === 'approved'
  }, [task])

  const lockMessage = useMemo(() => {
    if (!task) return ''
    const evalStatus = (task as any).evaluation_status || 'none'
    if (evalStatus === 'pending_approval') return 'Công việc đang chờ phê duyệt đánh giá'
    if (evalStatus === 'approved') return 'Công việc đã hoàn tất quy trình đánh giá'
    return ''
  }, [task])

  const formatDate = (dateString?: string | null) => {
    if (!dateString) return '-'
    try {
      return new Date(dateString).toLocaleString('vi-VN')
    } catch {
      return '-'
    }
  }

  const handleDelete = async () => {
    if (!id) return
    
    if (subtaskCount > 0) {
      alert(`Không thể xóa công việc này vì còn ${subtaskCount} công việc con.`)
      setShowDelete(false)
      return
    }

    try {
      await deleteMutation.mutateAsync(id)
      navigate('/tasks')
    } catch (error) {
      console.error('Delete error:', error)
    }
  }

  const handleSubtaskChange = () => {
    refetch()
  }

  if (isLoading) {
    return (
      <div className="p-4 md:p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 md:p-6">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded text-sm sm:text-base">
          Lỗi: {(error as Error).message}
        </div>
      </div>
    )
  }

  if (!task || !permissions) {
    return (
      <div className="p-4 md:p-6">
        <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded text-sm sm:text-base">
          Không tìm thấy công việc
        </div>
      </div>
    )
  }

  const t = task as any
  const taskTitle = t.title || t.name || 'Không có tiêu đề'
  const progress = t.progress || 0
  const evaluationStatus = t.evaluation_status || 'none'
  const evalConfig = EVALUATION_STATUS_CONFIG[evaluationStatus] || EVALUATION_STATUS_CONFIG.none

  // Check if this is "view only" mode (colleague's task)
  const isViewOnly = permissions.canView && !permissions.canEdit && !permissions.canChangeStatus

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      {/* ========== HEADER ========== */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 mb-4 sm:mb-6">
        <div className="flex items-start gap-3 sm:gap-4 min-w-0">
          <button onClick={() => navigate('/tasks')} className="p-2 hover:bg-gray-100 rounded-lg flex-shrink-0 mt-0.5">
            <ArrowLeft size={20} />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg sm:text-2xl font-bold text-gray-900 break-words">{taskTitle}</h1>
              {isChildTask && (
                <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full whitespace-nowrap">
                  Công việc con
                </span>
              )}
              {subtaskCount > 0 && (
                <span className="px-2 py-0.5 text-xs bg-purple-100 text-purple-700 rounded-full flex items-center gap-1 whitespace-nowrap">
                  <Users size={12} />
                  {subtaskCount} con
                </span>
              )}
              {isViewOnly && (
                <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded-full flex items-center gap-1 whitespace-nowrap">
                  <Eye size={12} />
                  Chỉ xem
                </span>
              )}
            </div>
            {t.code && <p className="text-gray-500 text-sm mt-0.5">Mã: {t.code}</p>}
          </div>
        </div>
        
        <div className="flex gap-2 ml-11 sm:ml-0">
          {permissions.canEdit ? (
            <Link
              to={`/tasks/${id}/edit`}
              className="flex items-center gap-1.5 px-3 sm:px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
            >
              <Edit size={16} /> Sửa
            </Link>
          ) : (
            <button
              disabled
              title={permissions.editDisabledReason}
              className="flex items-center gap-1.5 px-3 sm:px-4 py-2 bg-gray-300 text-gray-500 rounded-lg cursor-not-allowed text-sm"
            >
              <Lock size={16} /> Sửa
            </button>
          )}
          
          {permissions.canDelete ? (
            <button
              onClick={() => setShowDelete(true)}
              className="flex items-center gap-1.5 px-3 sm:px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm"
            >
              <Trash2 size={16} /> Xóa
            </button>
          ) : (
            <button
              disabled
              title={permissions.deleteDisabledReason}
              className="flex items-center gap-1.5 px-3 sm:px-4 py-2 bg-gray-300 text-gray-500 rounded-lg cursor-not-allowed text-sm"
            >
              <Lock size={16} /> Xóa
            </button>
          )}
        </div>
      </div>

      {/* ========== VIEW-ONLY BANNER (for colleagues) ========== */}
      {isViewOnly && (
        <div className="mb-4 sm:mb-6 bg-blue-50 border border-blue-200 rounded-lg p-3 sm:p-4 flex items-center gap-2 sm:gap-3">
          <Eye className="w-5 h-5 text-blue-600 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-blue-800">Chế độ xem</p>
            <p className="text-xs text-blue-600 mt-0.5">Đây là công việc của đồng nghiệp. Bạn có thể xem và bình luận.</p>
          </div>
        </div>
      )}

      {/* ========== LOCK BANNER ========== */}
      {isLocked && lockMessage && (
        <div className="mb-4 sm:mb-6 bg-yellow-50 border border-yellow-200 rounded-lg p-3 sm:p-4 flex items-center gap-2 sm:gap-3">
          <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-yellow-800">{lockMessage}</p>
            <p className="text-xs text-yellow-600 mt-0.5 sm:mt-1">Một số thao tác bị hạn chế.</p>
          </div>
        </div>
      )}

      {/* ========== PARENT TASK INFO ========== */}
      {isChildTask && t.parent_task_id && (
        <div className="mb-4 sm:mb-6">
          <ParentTaskInfo 
            parentTaskId={t.parent_task_id}
            currentTaskId={id || ''}
          />
        </div>
      )}

      {/* ========== CONTENT GRID ========== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Main Content - 2 columns */}
        <div className="lg:col-span-2 space-y-4 sm:space-y-6">
          {/* Status & Priority Badges */}
          <Card className="p-3 sm:p-4">
            <div className="flex flex-wrap gap-2 sm:gap-3">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className="text-xs sm:text-sm text-gray-500">Trạng thái:</span>
                <TaskStatusBadge status={t.status} />
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className="text-xs sm:text-sm text-gray-500">Ưu tiên:</span>
                <TaskPriorityBadge priority={t.priority} />
              </div>
              {evaluationStatus && evaluationStatus !== 'none' && (
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <span className="text-xs sm:text-sm text-gray-500">Đánh giá:</span>
                  <span className={`px-2 py-0.5 sm:py-1 rounded-full text-xs font-medium ${evalConfig.bgColor} ${evalConfig.color}`}>
                    {evalConfig.label}
                  </span>
                </div>
              )}
            </div>
          </Card>

          {/* Details Card */}
          <Card className="p-4 sm:p-6">
            <h2 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4 flex items-center gap-2">
              <Flag size={18} className="text-gray-400" />
              Chi tiết công việc
            </h2>
            
            <div className="space-y-3 sm:space-y-4">
              <div>
                <label className="text-xs sm:text-sm text-gray-500">Mô tả</label>
                <p className="mt-1 text-sm sm:text-base text-gray-700 whitespace-pre-wrap">
                  {t.description || 'Không có mô tả'}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 pt-3 sm:pt-4 border-t">
                <div className="flex items-start gap-2 sm:gap-3">
                  <Building size={16} className="text-gray-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <label className="text-xs sm:text-sm text-gray-500">Phòng ban</label>
                    <p className="font-medium text-sm sm:text-base">{t.department?.name || '-'}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2 sm:gap-3">
                  <User size={16} className="text-gray-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <label className="text-xs sm:text-sm text-gray-500">Người phụ trách</label>
                    <p className="font-medium text-sm sm:text-base">{t.assignee?.full_name || '-'}</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 pt-3 sm:pt-4 border-t">
                <div className="flex items-start gap-2 sm:gap-3">
                  <Calendar size={16} className="text-gray-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <label className="text-xs sm:text-sm text-gray-500">Ngày bắt đầu</label>
                    <p className="font-medium text-sm sm:text-base">{formatDate(t.start_date)}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2 sm:gap-3">
                  <Calendar size={16} className="text-red-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <label className="text-xs sm:text-sm text-gray-500">Hạn hoàn thành</label>
                    <p className="font-medium text-sm sm:text-base">{formatDate(t.due_date)}</p>
                  </div>
                </div>
              </div>

              {t.notes && (
                <div className="pt-3 sm:pt-4 border-t">
                  <label className="text-xs sm:text-sm text-gray-500">Ghi chú</label>
                  <p className="mt-1 text-sm sm:text-base text-gray-700 whitespace-pre-wrap bg-gray-50 p-2 sm:p-3 rounded-lg">
                    {t.notes}
                  </p>
                </div>
              )}
            </div>
          </Card>

          {/* Participants - only show if canView */}
          {id && (
            <TaskParticipantsSection
              taskId={id}
              taskAssigneeId={t.assignee_id}
              onParticipantChange={() => refetch()}
            />
          )}

          {/* Subtasks - only if canEdit for managing, always visible for viewing */}
          {!isChildTask && id && (
            <SubtasksList
              parentTaskId={id}
              parentTaskCode={t.code}
              parentDepartmentId={t.department_id}
              parentStartDate={t.start_date}
              parentDueDate={t.due_date}
              canEdit={permissions.canEdit}
              onSubtaskCreated={handleSubtaskChange}
              onSubtaskDeleted={handleSubtaskChange}
            />
          )}

          {/* Attachments - canEdit controls upload ability */}
          {id && (
            <AttachmentSection
              taskId={id}
              currentUserId={user?.employee_id || ''}
              canEdit={permissions.canAttach}
            />
          )}

          {/* Comments - use permissions.canComment */}
          {id && (
            <CommentSection
              taskId={id}
              currentUserId={user?.employee_id || ''}
              canComment={permissions.canComment}
            />
          )}

          {/* Activity - always visible */}
          {id && (
            <ActivityTimeline
              taskId={id}
              maxItems={10}
              showFilters={true}
            />
          )}
        </div>

        {/* ========== SIDEBAR ========== */}
        <div className="space-y-4 sm:space-y-6">
          {/* Progress Card */}
          <Card className="p-0 overflow-hidden">
            <div className="bg-gradient-to-r from-blue-500 to-blue-600 p-3 sm:p-4">
              <h2 className="text-white font-semibold text-sm sm:text-base">Tiến độ công việc</h2>
            </div>
            <div className="p-4">
              <div className="flex flex-col items-center py-2 sm:py-4">
                <div className="relative w-24 h-24 sm:w-32 sm:h-32">
                  <svg className="w-full h-full transform -rotate-90" viewBox="0 0 128 128">
                    <circle cx="64" cy="64" r="56" stroke="#e5e7eb" strokeWidth="12" fill="none" />
                    <circle
                      cx="64" cy="64" r="56"
                      stroke={progress >= 100 ? '#22c55e' : '#3b82f6'}
                      strokeWidth="12" fill="none" strokeLinecap="round"
                      strokeDasharray={`${(progress / 100) * 352} 352`}
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-2xl sm:text-3xl font-bold text-gray-800">{progress}%</span>
                  </div>
                </div>
                <p className="mt-2 sm:mt-3 text-xs sm:text-sm text-gray-500">
                  {progress === 0 && 'Chưa bắt đầu'}
                  {progress > 0 && progress < 100 && 'Đang thực hiện'}
                  {progress >= 100 && 'Hoàn thành'}
                </p>
                {subtaskCount > 0 && (
                  <p className="mt-1 text-xs text-blue-600">
                    (Tính từ {subtaskCount} công việc con)
                  </p>
                )}
              </div>
            </div>
          </Card>

          {/* Timeline Card */}
          <Card className="p-3 sm:p-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-2 sm:mb-3 flex items-center gap-2">
              <Clock size={16} />
              Thời gian
            </h2>
            <div className="space-y-2 sm:space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Ngày tạo</span>
                <span className="font-medium text-xs sm:text-sm">{formatDate(t.created_at)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Cập nhật</span>
                <span className="font-medium text-xs sm:text-sm">{formatDate(t.updated_at)}</span>
              </div>
              {t.completed_date && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Hoàn thành</span>
                  <span className="font-medium text-green-600 text-xs sm:text-sm">{formatDate(t.completed_date)}</span>
                </div>
              )}
            </div>
          </Card>

          {/* Quick Actions - only show if user has action permissions */}
          <Card className="p-3 sm:p-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-2 sm:mb-3">Thao tác nhanh</h2>
            <div className="space-y-2">
              {permissions.canMarkComplete || permissions.canPause ? (
                <>
                  {permissions.canMarkComplete && (
                    <button className="w-full px-3 py-2 text-left text-sm bg-green-50 text-green-700 rounded-lg hover:bg-green-100">
                      ✅ Đánh dấu hoàn thành
                    </button>
                  )}
                  {permissions.canPause && (
                    <button className="w-full px-3 py-2 text-left text-sm bg-yellow-50 text-yellow-700 rounded-lg hover:bg-yellow-100">
                      ⏸️ Tạm dừng công việc
                    </button>
                  )}
                  {permissions.canResume && (
                    <button className="w-full px-3 py-2 text-left text-sm bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100">
                      ▶️ Tiếp tục công việc
                    </button>
                  )}
                </>
              ) : isLocked ? (
                <div className="text-center py-3 sm:py-4">
                  <Lock className="w-6 h-6 sm:w-8 sm:h-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-xs sm:text-sm text-gray-500">
                    Đang trong quy trình đánh giá
                  </p>
                </div>
              ) : isViewOnly ? (
                <div className="text-center py-3 sm:py-4">
                  <Eye className="w-6 h-6 sm:w-8 sm:h-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-xs sm:text-sm text-gray-500">
                    Bạn đang xem công việc của đồng nghiệp
                  </p>
                </div>
              ) : (
                <div className="text-center py-3 sm:py-4">
                  <p className="text-xs sm:text-sm text-gray-500">
                    Không có thao tác khả dụng
                  </p>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* ========== DELETE DIALOG ========== */}
      {showDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-5 sm:p-6 max-w-sm w-full">
            <h3 className="text-lg font-semibold mb-2">Xác nhận xóa</h3>
            <p className="text-gray-500 mb-4 text-sm sm:text-base">Bạn có chắc muốn xóa "{taskTitle}"?</p>
            {subtaskCount > 0 && (
              <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-700 text-sm">
                ⚠️ Công việc này có {subtaskCount} công việc con.
              </div>
            )}
            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3">
              <button onClick={() => setShowDelete(false)} className="px-4 py-2 border rounded-lg text-sm sm:text-base">
                Hủy
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteMutation.isPending || subtaskCount > 0}
                className="px-4 py-2 bg-red-600 text-white rounded-lg disabled:opacity-50 text-sm sm:text-base"
              >
                {deleteMutation.isPending ? 'Đang xóa...' : 'Xóa'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default TaskViewPage