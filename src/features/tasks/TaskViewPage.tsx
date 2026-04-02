// src/features/tasks/TaskViewPage.tsx
// ============================================================================
// v5: Phase 2 — Full Redesign
// Phase 1: ✅ Assigner, formatDate, Quick Actions handler, Countdown
// Phase 2: ✅ Breadcrumb dự án/phase, bỏ sidebar → 1 cột, sticky bottom bar
// ============================================================================

import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft, Edit, Trash2, Calendar, User, UserCog, Building, Flag, Clock,
  Lock, AlertTriangle, Users, Eye, Loader2, CheckCircle, PauseCircle,
  PlayCircle, FolderKanban, ChevronRight, Award,
} from 'lucide-react'
import { Card } from '../../components/ui'
import { TaskStatusBadge } from './components/TaskStatusBadge'
import { TaskPriorityBadge } from './components/TaskPriorityBadge'
import { useTask, useDeleteTask } from './hooks/useTasks'
import { useState, useEffect, useMemo } from 'react'
import { useAuthStore } from '../../stores/authStore'
import { supabase } from '../../lib/supabase'
import TaskChecklist from '../../components/tasks/TaskChecklist'
import TaskStatusTimeline from '../../components/tasks/TaskStatusTimeline'
import QuickEvalModal from '../../components/tasks/QuickEvalModal'
import { message } from 'antd'

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

// ============ FORMAT HELPERS ============

function formatDateOnly(dateString?: string | null): string {
  if (!dateString) return '-'
  try {
    const d = dateString.includes('T') ? dateString.split('T')[0] : dateString
    return new Date(d + 'T00:00:00').toLocaleDateString('vi-VN', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    })
  } catch { return '-' }
}

function formatDateTime(dateString?: string | null): string {
  if (!dateString) return '-'
  try {
    return new Date(dateString).toLocaleString('vi-VN', {
      hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric',
    })
  } catch { return '-' }
}

// ============ COUNTDOWN ============
function DueCountdown({ dueDate, status }: { dueDate?: string | null; status?: string }) {
  if (!dueDate || status === 'finished' || status === 'cancelled') {
    return <span className="text-gray-400 text-sm">-</span>
  }
  const due = new Date(dueDate)
  due.setHours(23, 59, 59, 999)
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

  if (diffDays < 0) return (
    <span className="inline-flex items-center gap-1 text-red-600 font-semibold text-sm">
      <AlertTriangle className="w-3.5 h-3.5" />Quá {Math.abs(diffDays)} ngày
    </span>
  )
  if (diffDays === 0) return <span className="text-amber-600 font-semibold text-sm">Hôm nay</span>
  if (diffDays <= 3) return <span className="text-amber-500 font-medium text-sm">Còn {diffDays} ngày</span>
  return <span className="text-green-600 text-sm">Còn {diffDays} ngày</span>
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
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [showQuickEval, setShowQuickEval] = useState(false)

  const { data: task, isLoading, error, refetch } = useTask(id || '')
  const deleteMutation = useDeleteTask()
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

  // ============ QUICK ACTION HANDLERS ============

  const handleMarkComplete = async () => {
    if (!id) return
    setActionLoading('complete')
    try {
      const t = task as any
      const isAssignee = user?.employee_id === t?.assignee_id || user?.employee_id === t?.assignee?.id

      const isRecurring = t?.task_source === 'recurring'
      const isProject = t?.task_source === 'project'

      // ★ Task dự án: bắt buộc phải có ảnh minh chứng
      if (isProject) {
        const { count: evidenceCount } = await supabase
          .from('task_checklist_items')
          .select('id', { count: 'exact', head: true })
          .eq('task_id', id)
          .eq('requires_evidence', true)
          .is('evidence_url', null)
        if (evidenceCount && evidenceCount > 0) {
          message.warning(`Còn ${evidenceCount} bước chưa có ảnh minh chứng. Vui lòng upload trước khi hoàn thành.`)
          setActionLoading(null)
          return
        }
        // Kiểm tra có ít nhất 1 evidence trong toàn task
        const { count: totalEvidence } = await supabase
          .from('task_checklist_items')
          .select('id', { count: 'exact', head: true })
          .eq('task_id', id)
          .not('evidence_url', 'is', null)
        if (!totalEvidence || totalEvidence === 0) {
          message.warning('Công việc dự án bắt buộc phải có ít nhất 1 ảnh minh chứng.')
          setActionLoading(null)
          return
        }
      }

      if (isRecurring) {
        // ★ Recurring: auto-complete + 80 điểm, KHÔNG popup
        const { error } = await supabase.from('tasks').update({
          status: 'finished', progress: 100,
          completed_date: new Date().toISOString().split('T')[0],
          self_score: 100, final_score: 80,
          evaluation_status: 'approved',
        }).eq('id', id)
        if (error) throw error
        if (t?.parent_task_id) await subtaskService.recalculateParent(t.parent_task_id)
        await refetch()
        message.success('Hoàn thành! (Tự động 80 điểm)')
      } else if (isAssignee) {
        setShowQuickEval(true)
        message.info('Vui lòng đánh giá để hoàn thành công việc.')
      } else {
        // Người khác: update finished luôn
        const { error } = await supabase.from('tasks').update({
          status: 'finished', progress: 100,
          completed_date: new Date().toISOString().split('T')[0],
        }).eq('id', id)
        if (error) throw error
        if (t?.parent_task_id) {
          await subtaskService.recalculateParent(t.parent_task_id)
        }
        await refetch()
        message.success('Công việc đã hoàn thành!')
      }
    } catch (err) {
      console.error('Mark complete failed:', err)
      alert('Không thể cập nhật trạng thái')
    } finally { setActionLoading(null) }
  }

  const handlePause = async () => {
    if (!id) return
    setActionLoading('pause')
    try {
      const { error } = await supabase.from('tasks').update({ status: 'paused' }).eq('id', id)
      if (error) throw error
      const t = task as any
      if (t?.parent_task_id) {
        await subtaskService.recalculateParent(t.parent_task_id)
      }
      await refetch()
    } catch (err) { alert('Không thể tạm dừng') }
    finally { setActionLoading(null) }
  }

  const handleResume = async () => {
    if (!id) return
    setActionLoading('resume')
    try {
      const { error } = await supabase.from('tasks').update({ status: 'in_progress' }).eq('id', id)
      if (error) throw error
      const t = task as any
      if (t?.parent_task_id) {
        await subtaskService.recalculateParent(t.parent_task_id)
      }
      await refetch()
    } catch (err) { alert('Không thể tiếp tục') }
    finally { setActionLoading(null) }
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
    } catch (error) { console.error('Delete error:', error) }
  }

  const handleSubtaskChange = () => { refetch() }

  // ============ LOADING / ERROR STATES ============

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

  // Normalize relations (useTasks hook đã normalize, nhưng safe-guard)
  const assigner = Array.isArray(t.assigner) ? t.assigner[0] : t.assigner
  const assignee = Array.isArray(t.assignee) ? t.assignee[0] : t.assignee
  const department = Array.isArray(t.department) ? t.department[0] : t.department
  const project = Array.isArray(t.project) ? t.project[0] : t.project
  const phase = Array.isArray(t.phase) ? t.phase[0] : t.phase

  const isViewOnly = permissions.canView && !permissions.canEdit && !permissions.canChangeStatus
  const hasQuickActions = permissions.canMarkComplete || permissions.canPause || permissions.canResume

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto pb-24 sm:pb-6">
      {/* ========== HEADER ========== */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 mb-4 sm:mb-6">
        <div className="flex items-start gap-3 sm:gap-4 min-w-0">
          <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-lg flex-shrink-0 mt-0.5">
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
                  <Users size={12} />{subtaskCount} con
                </span>
              )}
              {isViewOnly && (
                <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded-full flex items-center gap-1 whitespace-nowrap">
                  <Eye size={12} />Chỉ xem
                </span>
              )}
            </div>
            {t.code && <p className="text-gray-500 text-sm mt-0.5">Mã: {t.code}</p>}
          </div>
        </div>

        <div className="flex gap-2 ml-11 sm:ml-0">
          {permissions.canEdit ? (
            <Link to={`/tasks/${id}/edit`} className="flex items-center gap-1.5 px-3 sm:px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">
              <Edit size={16} /> Sửa
            </Link>
          ) : (
            <button disabled title={permissions.editDisabledReason} className="flex items-center gap-1.5 px-3 sm:px-4 py-2 bg-gray-300 text-gray-500 rounded-lg cursor-not-allowed text-sm">
              <Lock size={16} /> Sửa
            </button>
          )}
          {permissions.canDelete ? (
            <button onClick={() => setShowDelete(true)} className="flex items-center gap-1.5 px-3 sm:px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm">
              <Trash2 size={16} /> Xóa
            </button>
          ) : (
            <button disabled title={permissions.deleteDisabledReason} className="flex items-center gap-1.5 px-3 sm:px-4 py-2 bg-gray-300 text-gray-500 rounded-lg cursor-not-allowed text-sm">
              <Lock size={16} /> Xóa
            </button>
          )}
        </div>
      </div>

      {/* ========== BREADCRUMB DỰ ÁN (MỚI Phase 2) ========== */}
      {(project || phase) && (
        <div className="mb-4 sm:mb-5 flex items-center gap-1.5 text-sm bg-gray-50 border border-gray-200 px-3 py-2.5 rounded-lg overflow-x-auto">
          <FolderKanban className="w-4 h-4 text-emerald-700 flex-shrink-0" />
          {project && (
            <Link
              to={`/projects/${project.id}`}
              className="text-emerald-700 hover:text-emerald-800 hover:underline font-medium whitespace-nowrap"
            >
              {project.code} — {project.name}
            </Link>
          )}
          {phase && (
            <>
              <ChevronRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
              <span className="text-gray-600 whitespace-nowrap">{phase.name}</span>
            </>
          )}
          <ChevronRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
          <span className="text-gray-800 font-medium whitespace-nowrap">{t.code}</span>
        </div>
      )}

      {/* ========== BANNERS ========== */}
      {isViewOnly && (
        <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-3 sm:p-4 flex items-center gap-2 sm:gap-3">
          <Eye className="w-5 h-5 text-blue-600 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-blue-800">Chế độ xem</p>
            <p className="text-xs text-blue-600 mt-0.5">Đây là công việc của đồng nghiệp. Bạn có thể xem và bình luận.</p>
          </div>
        </div>
      )}

      {isLocked && lockMessage && (
        <div className="mb-4 bg-yellow-50 border border-yellow-200 rounded-lg p-3 sm:p-4 flex items-center gap-2 sm:gap-3">
          <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-yellow-800">{lockMessage}</p>
            <p className="text-xs text-yellow-600 mt-0.5">Một số thao tác bị hạn chế.</p>
          </div>
        </div>
      )}

      {/* ========== PARENT TASK INFO ========== */}
      {isChildTask && t.parent_task_id && (
        <div className="mb-4">
          <ParentTaskInfo parentTaskId={t.parent_task_id} currentTaskId={id || ''} />
        </div>
      )}

      {/* ========== SINGLE COLUMN LAYOUT (Phase 2 redesign) ========== */}
      <div className="space-y-4 sm:space-y-5">

        {/* Status + Progress Card (thay cho sidebar progress ring) */}
        <Card className="p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-4">
            <TaskStatusBadge status={t.status} />
            <TaskPriorityBadge priority={t.priority} />
            {evaluationStatus && evaluationStatus !== 'none' && (
              <span className={`px-2 py-0.5 sm:py-1 rounded-full text-xs font-medium ${evalConfig.bgColor} ${evalConfig.color}`}>
                {evalConfig.label}
              </span>
            )}
          </div>

          {/* Progress bar inline */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500 w-12 flex-shrink-0">Tiến độ</span>
            <div className="flex-1 h-3 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={`h-3 rounded-full transition-all duration-500 ${
                  progress >= 100 ? 'bg-green-500' : progress >= 50 ? 'bg-blue-500' : progress > 0 ? 'bg-amber-500' : 'bg-gray-300'
                }`}
                style={{ width: `${Math.min(progress, 100)}%` }}
              />
            </div>
            <span className={`text-sm font-bold w-10 text-right ${
              progress >= 100 ? 'text-green-600' : 'text-gray-700'
            }`}>
              {progress}%
            </span>
          </div>
          {subtaskCount > 0 && (
            <p className="mt-1.5 text-xs text-blue-600 text-right">
              (Tính từ {subtaskCount} công việc con)
            </p>
          )}

          {/* Quick Actions inline — desktop only */}
          {hasQuickActions && !isLocked && (
            <div className="hidden sm:flex items-center gap-2 mt-4 pt-4 border-t border-gray-100">
              {permissions.canMarkComplete && (
                <button onClick={handleMarkComplete} disabled={!!actionLoading}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-green-700 bg-green-50 hover:bg-green-100 rounded-lg transition-colors disabled:opacity-50">
                  {actionLoading === 'complete' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                  Hoàn thành
                </button>
              )}
              {permissions.canPause && (
                <button onClick={handlePause} disabled={!!actionLoading}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-yellow-700 bg-yellow-50 hover:bg-yellow-100 rounded-lg transition-colors disabled:opacity-50">
                  {actionLoading === 'pause' ? <Loader2 className="w-4 h-4 animate-spin" /> : <PauseCircle className="w-4 h-4" />}
                  Tạm dừng
                </button>
              )}
              {permissions.canResume && (
                <button onClick={handleResume} disabled={!!actionLoading}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors disabled:opacity-50">
                  {actionLoading === 'resume' ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
                  Tiếp tục
                </button>
              )}
            </div>
          )}
        </Card>

        {/* Info Grid — 3x2 */}
        <Card className="p-4 sm:p-5">
          <h2 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4 flex items-center gap-2">
            <Flag size={18} className="text-gray-400" />
            Chi tiết
          </h2>

          {/* Row 1: Người giao + Người phụ trách + Phòng ban */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            <div className="flex items-start gap-2.5">
              <UserCog size={16} className="text-blue-400 mt-0.5 flex-shrink-0" />
              <div>
                <label className="text-xs text-gray-500">Người giao việc</label>
                <p className="font-medium text-sm">
                  {assigner?.full_name || '-'}
                  {t.is_self_assigned && (
                    <span className="ml-1.5 px-1.5 py-0.5 text-[10px] bg-gray-100 text-gray-500 rounded font-normal">
                      Tự giao
                    </span>
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <User size={16} className="text-green-500 mt-0.5 flex-shrink-0" />
              <div>
                <label className="text-xs text-gray-500">Người phụ trách</label>
                <p className="font-medium text-sm">{assignee?.full_name || '-'}</p>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <Building size={16} className="text-gray-400 mt-0.5 flex-shrink-0" />
              <div>
                <label className="text-xs text-gray-500">Phòng ban</label>
                <p className="font-medium text-sm">{department?.name || '-'}</p>
              </div>
            </div>
          </div>

          {/* Row 2: Bắt đầu + Hạn + Còn lại */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 pt-3 sm:pt-4 mt-3 sm:mt-4 border-t border-gray-100">
            <div className="flex items-start gap-2.5">
              <Calendar size={16} className="text-gray-400 mt-0.5 flex-shrink-0" />
              <div>
                <label className="text-xs text-gray-500">Ngày bắt đầu</label>
                <p className="font-medium text-sm">{formatDateOnly(t.start_date)}</p>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <Calendar size={16} className="text-red-400 mt-0.5 flex-shrink-0" />
              <div>
                <label className="text-xs text-gray-500">Hạn hoàn thành</label>
                <p className="font-medium text-sm">{formatDateOnly(t.due_date)}</p>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <Clock size={16} className="text-amber-400 mt-0.5 flex-shrink-0" />
              <div>
                <label className="text-xs text-gray-500">Thời hạn</label>
                <div className="mt-0.5">
                  <DueCountdown dueDate={t.due_date} status={t.status} />
                </div>
              </div>
            </div>
          </div>

          {/* ★ Đánh giá chi tiết */}
          {(t.evaluation_status && t.evaluation_status !== 'none') && (
            <div className="pt-3 mt-3 border-t border-gray-100">
              <div className="flex items-center gap-2 mb-2">
                <Award size={14} className="text-amber-500" />
                <span className="text-xs font-semibold text-gray-700">Đánh giá</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  t.evaluation_status === 'approved' ? 'bg-green-100 text-green-700' :
                  t.evaluation_status === 'pending_approval' ? 'bg-amber-100 text-amber-700' :
                  'bg-gray-100 text-gray-600'
                }`}>
                  {t.evaluation_status === 'approved' ? 'Đã duyệt' :
                   t.evaluation_status === 'pending_approval' ? 'Chờ duyệt' :
                   t.evaluation_status === 'pending_self_eval' ? 'Chờ tự ĐG' : t.evaluation_status}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                {t.task_source && (
                  <div className="bg-gray-50 rounded-lg p-2">
                    <span className="text-gray-400">Loại</span>
                    <p className="font-semibold text-gray-700">{
                      t.task_source === 'assigned' ? 'QL giao' :
                      t.task_source === 'project' ? 'Dự án' :
                      t.task_source === 'recurring' ? 'Định kỳ' :
                      t.task_source === 'self' ? 'Tự giao' : t.task_source
                    }</p>
                  </div>
                )}
                {t.self_score != null && (
                  <div className="bg-blue-50 rounded-lg p-2">
                    <span className="text-gray-400">NV tự chấm</span>
                    <p className="font-bold text-blue-600">{t.self_score} điểm</p>
                  </div>
                )}
                {t.final_score != null && (
                  <div className="bg-green-50 rounded-lg p-2">
                    <span className="text-gray-400">Điểm cuối</span>
                    <p className="font-bold text-green-600">{t.final_score} điểm</p>
                  </div>
                )}
                {t.final_score != null && (
                  <div className={`rounded-lg p-2 ${
                    t.final_score >= 90 ? 'bg-emerald-50' :
                    t.final_score >= 75 ? 'bg-blue-50' :
                    t.final_score >= 60 ? 'bg-amber-50' : 'bg-red-50'
                  }`}>
                    <span className="text-gray-400">Hạng</span>
                    <p className={`font-bold ${
                      t.final_score >= 90 ? 'text-emerald-600' :
                      t.final_score >= 75 ? 'text-blue-600' :
                      t.final_score >= 60 ? 'text-amber-600' : 'text-red-600'
                    }`}>{
                      t.final_score >= 90 ? 'A' :
                      t.final_score >= 75 ? 'B' :
                      t.final_score >= 60 ? 'C' :
                      t.final_score >= 40 ? 'D' : 'F'
                    }</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Timestamps nhỏ ở footer */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 pt-3 mt-3 border-t border-gray-100 text-xs text-gray-400">
            <span>Tạo: {formatDateTime(t.created_at)}</span>
            <span>Cập nhật: {formatDateTime(t.updated_at)}</span>
            {t.completed_date && (
              <span className="text-green-500">Hoàn thành: {formatDateOnly(t.completed_date)}</span>
            )}
          </div>
        </Card>

        {/* Mô tả */}
        {t.description && (
          <Card className="p-4 sm:p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Mô tả</h3>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{t.description}</p>
          </Card>
        )}

        {/* Checklist */}
        <TaskChecklist
          taskId={t.id}
          readonly={t.status === 'finished' || t.status === 'cancelled'}
          userId={user?.employee_id || undefined}
          onProgressChange={async (percent: number) => {
            try {
              const roundedPercent = Math.round(percent)

              // Update progress in DB
              await supabase.from('tasks').update({
                progress: roundedPercent,
                updated_at: new Date().toISOString(),
              }).eq('id', t.id)

              // Auto-complete when 100%
              if (roundedPercent >= 100 && t.status === 'in_progress') {
                const isRecurring = t.task_source === 'recurring'
                const isProject2 = t.task_source === 'project'
                const isAssignee2 = user?.employee_id === t.assignee_id || user?.employee_id === t.assignee?.id

                // ★ Project: check evidence trước
                if (isProject2) {
                  const { count: noEvidence } = await supabase.from('task_checklist_items')
                    .select('id', { count: 'exact', head: true })
                    .eq('task_id', t.id).not('evidence_url', 'is', null)
                  if (!noEvidence || noEvidence === 0) {
                    message.warning('Công việc dự án cần ít nhất 1 ảnh minh chứng trước khi hoàn thành.')
                    refetch()
                    return
                  }
                }

                if (isRecurring) {
                  // ★ Recurring: auto-complete + 80 điểm, KHÔNG popup
                  const autoScore = 80
                  await supabase.from('tasks').update({
                    status: 'finished', progress: 100,
                    completed_date: new Date().toISOString(),
                    self_score: 100, final_score: autoScore,
                    evaluation_status: 'approved',
                  }).eq('id', t.id)
                  message.success('Hoàn thành! (Tự động 80 điểm)')
                } else if (isAssignee2) {
                  setShowQuickEval(true)
                  message.info('Checklist hoàn tất! Vui lòng đánh giá để hoàn thành.')
                } else {
                  await supabase.from('tasks').update({
                    status: 'finished', progress: 100,
                    completed_date: new Date().toISOString(),
                  }).eq('id', t.id)
                  message.success('Công việc đã hoàn thành!')
                }
              }

              // Auto-sync parent progress if this is a subtask
              if (t.parent_task_id) {
                await subtaskService.recalculateParent(t.parent_task_id)
              }
              refetch()
            } catch (err) { console.error('Update progress failed:', err) }
          }}
        />

        {/* Ghi chú */}
        {t.notes && (
          <Card className="p-4 sm:p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Ghi chú</h3>
            <p className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 p-3 rounded-lg">{t.notes}</p>
          </Card>
        )}

        {/* Participants */}
        {id && (
          <TaskParticipantsSection
            taskId={id}
            taskAssigneeId={t.assignee_id}
            onParticipantChange={() => refetch()}
          />
        )}

        {/* Subtasks */}
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

        {/* Attachments */}
        {id && (
          <AttachmentSection
            taskId={id}
            currentUserId={user?.employee_id || ''}
            canEdit={permissions.canAttach}
          />
        )}

        {/* Comments */}
        {id && (
          <CommentSection
            taskId={id}
            currentUserId={user?.employee_id || ''}
            canComment={permissions.canComment}
          />
        )}

        {/* Lịch sử thay đổi trạng thái */}
        {id && (
          <TaskStatusTimeline taskId={id} />
        )}

        {/* Activity */}
        {id && (
          <ActivityTimeline taskId={id} maxItems={10} showFilters={true} />
        )}
      </div>

      {/* ========== STICKY BOTTOM BAR — Mobile only (Phase 2) ========== */}
      {hasQuickActions && !isLocked && !isViewOnly && (
        <div className="sm:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-3 flex items-center gap-2 z-40 safe-area-pb shadow-lg">
          {permissions.canMarkComplete && (
            <button onClick={handleMarkComplete} disabled={!!actionLoading}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors disabled:opacity-50">
              {actionLoading === 'complete' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              Hoàn thành
            </button>
          )}
          {permissions.canPause && (
            <button onClick={handlePause} disabled={!!actionLoading}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-medium text-yellow-700 bg-yellow-50 hover:bg-yellow-100 border border-yellow-200 rounded-lg transition-colors disabled:opacity-50">
              {actionLoading === 'pause' ? <Loader2 className="w-4 h-4 animate-spin" /> : <PauseCircle className="w-4 h-4" />}
              Tạm dừng
            </button>
          )}
          {permissions.canResume && (
            <button onClick={handleResume} disabled={!!actionLoading}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50">
              {actionLoading === 'resume' ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
              Tiếp tục
            </button>
          )}
        </div>
      )}

      {/* ========== QUICK EVAL MODAL ========== */}
      <QuickEvalModal
        open={showQuickEval}
        onClose={() => setShowQuickEval(false)}
        task={task ? { id: t.id, code: t.code, name: taskTitle } : null}
        onSuccess={() => refetch()}
      />

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
              <button onClick={() => setShowDelete(false)} className="px-4 py-2 border rounded-lg text-sm sm:text-base">Hủy</button>
              <button onClick={handleDelete} disabled={deleteMutation.isPending || subtaskCount > 0}
                className="px-4 py-2 bg-red-600 text-white rounded-lg disabled:opacity-50 text-sm sm:text-base">
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