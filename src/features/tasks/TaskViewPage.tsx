// src/features/tasks/TaskViewPage.tsx
// ============================================================================
// UPDATED: Tích hợp Activity Timeline (Phase 4.4) + Task Participants
// ============================================================================

import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, Edit, Trash2, Calendar, User, Building, Flag, Clock, Lock, AlertTriangle, Users } from 'lucide-react'
import { Card } from '../../components/ui'
import { TaskStatusBadge } from './components/TaskStatusBadge'
import { TaskPriorityBadge } from './components/TaskPriorityBadge'
import { useTask, useDeleteTask } from './hooks/useTasks'
import { useState, useEffect } from 'react'
import { useAuthStore } from '../../stores/authStore'

// Import subtask components
import { SubtasksList } from './components/SubtasksList'
import { ParentTaskInfo } from './components/ParentTaskInfo'
import subtaskService from '../../services/subtaskService'

// Import attachment component
import { AttachmentSection } from './components/AttachmentSection'

// Import comment component (Phase 4.4)
import { CommentSection } from './components/CommentSection'

// Import activity timeline (Phase 4.4)
import { ActivityTimeline } from './components/ActivityTimeline'

// *** IMPORT MỚI: Task Participants Section ***
import TaskParticipantsSection from './components/TaskParticipantsSection'

// ============ EVALUATION STATUS CONFIG ============
const EVALUATION_STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  none: { label: 'Chưa đánh giá', color: 'text-gray-600', bgColor: 'bg-gray-100' },
  pending_self_eval: { label: 'Chờ tự đánh giá', color: 'text-yellow-600', bgColor: 'bg-yellow-100' },
  pending_approval: { label: 'Chờ duyệt', color: 'text-blue-600', bgColor: 'bg-blue-100' },
  approved: { label: 'Đã duyệt', color: 'text-green-600', bgColor: 'bg-green-100' },
  rejected: { label: 'Từ chối', color: 'text-red-600', bgColor: 'bg-red-100' },
  revision_required: { label: 'Cần sửa', color: 'text-orange-600', bgColor: 'bg-orange-100' },
}

// ============ PERMISSION HELPER ============
interface TaskPermissions {
  canEdit: boolean
  canDelete: boolean
  editDisabledReason?: string
  deleteDisabledReason?: string
  isLocked: boolean
  lockMessage?: string
}

function getTaskPermissions(task: any, userRole?: string): TaskPermissions {
  const evaluationStatus = task?.evaluation_status || 'none'
  const taskStatus = task?.status || 'draft'
  
  const lockedStatuses = ['pending_approval', 'approved']
  // const isLocked = lockedStatuses.includes(evaluationStatus)
  
  if (evaluationStatus === 'pending_approval') {
    return {
      canEdit: false,
      canDelete: false,
      editDisabledReason: 'Công việc đang chờ phê duyệt, không thể sửa',
      deleteDisabledReason: 'Công việc đang chờ phê duyệt, không thể xóa',
      isLocked: true,
      lockMessage: 'Công việc đang chờ phê duyệt đánh giá',
    }
  }
  
  if (evaluationStatus === 'approved') {
    return {
      canEdit: false,
      canDelete: false,
      editDisabledReason: 'Công việc đã được duyệt, không thể sửa',
      deleteDisabledReason: 'Công việc đã được duyệt, không thể xóa',
      isLocked: true,
      lockMessage: 'Công việc đã hoàn tất quy trình đánh giá',
    }
  }
  
  if (taskStatus === 'cancelled') {
    return {
      canEdit: false,
      canDelete: userRole === 'admin',
      editDisabledReason: 'Công việc đã hủy, không thể sửa',
      deleteDisabledReason: userRole !== 'admin' ? 'Chỉ admin mới có thể xóa công việc đã hủy' : undefined,
      isLocked: false,
    }
  }
  
  return {
    canEdit: true,
    canDelete: true,
    isLocked: false,
  }
}

// ============ COMPONENT ============
export function TaskViewPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [showDelete, setShowDelete] = useState(false)
  const { user } = useAuthStore()

  // Subtask states
  const [isChildTask, setIsChildTask] = useState(false)
  const [, setCanHaveChildren] = useState(true)
  const [subtaskCount, setSubtaskCount] = useState(0)

  const { data: task, isLoading, error, refetch } = useTask(id || '')
  const deleteMutation = useDeleteTask()

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
      alert(`Không thể xóa công việc này vì còn ${subtaskCount} công việc con. Vui lòng xóa công việc con trước.`)
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

  // ========== LOADING STATE ==========
  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    )
  }

  // ========== ERROR STATE ==========
  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          Lỗi: {(error as Error).message}
        </div>
      </div>
    )
  }

  // ========== NOT FOUND STATE ==========
  if (!task) {
    return (
      <div className="p-6">
        <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded">
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
  
  const permissions = getTaskPermissions(t, user?.role)

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* ========== HEADER ========== */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/tasks')} className="p-2 hover:bg-gray-100 rounded-lg">
            <ArrowLeft size={20} />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-gray-900">{taskTitle}</h1>
              {isChildTask && (
                <span className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded-full">
                  Công việc con
                </span>
              )}
              {subtaskCount > 0 && (
                <span className="px-2 py-1 text-xs bg-purple-100 text-purple-700 rounded-full flex items-center gap-1">
                  <Users size={12} />
                  {subtaskCount} con
                </span>
              )}
            </div>
            {t.code && <p className="text-gray-500 text-sm">Mã: {t.code}</p>}
          </div>
        </div>
        
        <div className="flex gap-2">
          {permissions.canEdit ? (
            <Link
              to={`/tasks/${id}/edit`}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <Edit size={18} /> Sửa
            </Link>
          ) : (
            <button
              disabled
              title={permissions.editDisabledReason}
              className="flex items-center gap-2 px-4 py-2 bg-gray-300 text-gray-500 rounded-lg cursor-not-allowed"
            >
              <Lock size={18} /> Sửa
            </button>
          )}
          
          {permissions.canDelete ? (
            <button
              onClick={() => setShowDelete(true)}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
            >
              <Trash2 size={18} /> Xóa
            </button>
          ) : (
            <button
              disabled
              title={permissions.deleteDisabledReason}
              className="flex items-center gap-2 px-4 py-2 bg-gray-300 text-gray-500 rounded-lg cursor-not-allowed"
            >
              <Lock size={18} /> Xóa
            </button>
          )}
        </div>
      </div>

      {/* ========== LOCK BANNER ========== */}
      {permissions.isLocked && permissions.lockMessage && (
        <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-yellow-800">{permissions.lockMessage}</p>
            <p className="text-xs text-yellow-600 mt-1">Công việc đang trong quy trình đánh giá, một số thao tác bị hạn chế.</p>
          </div>
        </div>
      )}

      {/* ========== PARENT TASK INFO ========== */}
      {isChildTask && t.parent_task_id && (
        <div className="mb-6">
          <ParentTaskInfo 
            parentTaskId={t.parent_task_id}
            currentTaskId={id || ''}
          />
        </div>
      )}

      {/* ========== CONTENT GRID ========== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content - 2 columns */}
        <div className="lg:col-span-2 space-y-6">
          {/* Status & Priority Badges */}
          <Card className="p-4">
            <div className="flex flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">Trạng thái:</span>
                <TaskStatusBadge status={t.status} />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">Ưu tiên:</span>
                <TaskPriorityBadge priority={t.priority} />
              </div>
              {evaluationStatus && evaluationStatus !== 'none' && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">Đánh giá:</span>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${evalConfig.bgColor} ${evalConfig.color}`}>
                    {evalConfig.label}
                  </span>
                </div>
              )}
            </div>
          </Card>

          {/* Details Card */}
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Flag size={20} className="text-gray-400" />
              Chi tiết công việc
            </h2>
            
            <div className="space-y-4">
              <div>
                <label className="text-sm text-gray-500">Mô tả</label>
                <p className="mt-1 text-gray-700 whitespace-pre-wrap">
                  {t.description || 'Không có mô tả'}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t">
                <div className="flex items-start gap-3">
                  <Building size={18} className="text-gray-400 mt-0.5" />
                  <div>
                    <label className="text-sm text-gray-500">Phòng ban</label>
                    <p className="font-medium">{t.department?.name || '-'}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <User size={18} className="text-gray-400 mt-0.5" />
                  <div>
                    <label className="text-sm text-gray-500">Người phụ trách</label>
                    <p className="font-medium">{t.assignee?.full_name || '-'}</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t">
                <div className="flex items-start gap-3">
                  <Calendar size={18} className="text-gray-400 mt-0.5" />
                  <div>
                    <label className="text-sm text-gray-500">Ngày bắt đầu</label>
                    <p className="font-medium">{formatDate(t.start_date)}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Calendar size={18} className="text-red-400 mt-0.5" />
                  <div>
                    <label className="text-sm text-gray-500">Hạn hoàn thành</label>
                    <p className="font-medium">{formatDate(t.due_date)}</p>
                  </div>
                </div>
              </div>

              {t.notes && (
                <div className="pt-4 border-t">
                  <label className="text-sm text-gray-500">Ghi chú</label>
                  <p className="mt-1 text-gray-700 whitespace-pre-wrap bg-gray-50 p-3 rounded-lg">
                    {t.notes}
                  </p>
                </div>
              )}
            </div>
          </Card>

          {/* ========== NGƯỜI THAM GIA (MỚI) ========== */}
          {id && (
            <TaskParticipantsSection
              taskId={id}
              taskAssigneeId={t.assignee_id}
              onParticipantChange={() => refetch()}
            />
          )}

          {/* ========== SUBTASKS LIST ========== */}
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

          {/* ========== FILE ĐÍNH KÈM ========== */}
          {id && (
            <AttachmentSection
              taskId={id}
              currentUserId={user?.employee_id || ''}
              canEdit={permissions.canEdit}
            />
          )}

          {/* ========== BÌNH LUẬN ========== */}
          {id && (
            <CommentSection
              taskId={id}
              currentUserId={user?.employee_id || ''}
              canComment={true}
            />
          )}

          {/* ========== LỊCH SỬ HOẠT ĐỘNG ========== */}
          {id && (
            <ActivityTimeline
              taskId={id}
              maxItems={10}
              showFilters={true}
            />
          )}
        </div>

        {/* ========== SIDEBAR ========== */}
        <div className="space-y-6">
          {/* Progress Card */}
          <Card className="p-0 overflow-hidden">
            <div className="bg-gradient-to-r from-blue-500 to-blue-600 p-4">
              <h2 className="text-white font-semibold">Tiến độ công việc</h2>
            </div>
            <div className="p-4">
              <div className="flex flex-col items-center py-4">
                <div className="relative w-32 h-32">
                  <svg className="w-full h-full transform -rotate-90">
                    <circle
                      cx="64"
                      cy="64"
                      r="56"
                      stroke="#e5e7eb"
                      strokeWidth="12"
                      fill="none"
                    />
                    <circle
                      cx="64"
                      cy="64"
                      r="56"
                      stroke={progress >= 100 ? '#22c55e' : '#3b82f6'}
                      strokeWidth="12"
                      fill="none"
                      strokeLinecap="round"
                      strokeDasharray={`${(progress / 100) * 352} 352`}
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-3xl font-bold text-gray-800">{progress}%</span>
                  </div>
                </div>
                <p className="mt-3 text-sm text-gray-500">
                  {progress === 0 && 'Chưa bắt đầu'}
                  {progress > 0 && progress < 100 && 'Đang thực hiện'}
                  {progress >= 100 && 'Hoàn thành'}
                </p>
                {subtaskCount > 0 && (
                  <p className="mt-1 text-xs text-blue-600">
                    (Tính trung bình từ {subtaskCount} công việc con)
                  </p>
                )}
              </div>
            </div>
          </Card>

          {/* Timeline Card */}
          <Card className="p-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <Clock size={16} />
              Thời gian
            </h2>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Ngày tạo</span>
                <span className="font-medium">{formatDate(t.created_at)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Cập nhật</span>
                <span className="font-medium">{formatDate(t.updated_at)}</span>
              </div>
              {t.completed_date && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Hoàn thành</span>
                  <span className="font-medium text-green-600">{formatDate(t.completed_date)}</span>
                </div>
              )}
            </div>
          </Card>

          {/* Quick Actions */}
          <Card className="p-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Thao tác nhanh</h2>
            <div className="space-y-2">
              {!permissions.isLocked ? (
                <>
                  <button className="w-full px-3 py-2 text-left text-sm bg-green-50 text-green-700 rounded-lg hover:bg-green-100">
                    ✅ Đánh dấu hoàn thành
                  </button>
                  <button className="w-full px-3 py-2 text-left text-sm bg-yellow-50 text-yellow-700 rounded-lg hover:bg-yellow-100">
                    ⏸️ Tạm dừng công việc
                  </button>
                </>
              ) : (
                <div className="text-center py-4">
                  <Lock className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">
                    Công việc đang trong quy trình đánh giá
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    Một số thao tác bị hạn chế
                  </p>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* ========== DELETE DIALOG ========== */}
      {showDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-semibold mb-2">Xác nhận xóa</h3>
            <p className="text-gray-500 mb-4">Bạn có chắc muốn xóa "{taskTitle}"?</p>
            {subtaskCount > 0 && (
              <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-700 text-sm">
                ⚠️ Công việc này có {subtaskCount} công việc con. Vui lòng xóa công việc con trước.
              </div>
            )}
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowDelete(false)} className="px-4 py-2 border rounded-lg">
                Hủy
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteMutation.isPending || subtaskCount > 0}
                className="px-4 py-2 bg-red-600 text-white rounded-lg disabled:opacity-50"
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