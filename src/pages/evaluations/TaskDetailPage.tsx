// ============================================================================
// TASK DETAIL PAGE - UPDATED WITH PARTICIPANTS SECTION (RESPONSIVE)
// File: src/pages/evaluations/TaskDetailPage.tsx
// Huy Anh ERP System
// ============================================================================
// CẬP NHẬT: Fix mobile header che tên công việc
//   - Giảm spacing trên mobile (mb-2 thay vì mb-3/4)
//   - break-words cho tên dài
//   - Compact "Quay lại" button
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Edit,
  Trash2,
  Clock,
  Calendar,
  Building2,
  User,
  Users,
  Flag,
  CheckCircle,
  XCircle,
  AlertCircle,
  Pause,
  Play,
  FileText,
  Star,
  TrendingUp,
  RefreshCw,
  MessageSquare,
  Award,
  Lock,
  Loader2,
} from 'lucide-react';

import { useAuthStore } from '../../stores/authStore';
import { supabase } from '../../lib/supabase';
import {
  getTaskPermissions,
  getTaskLockMessage,
  getEvaluationStatusColor,
  getEvaluationStatusLabel,
  type TaskPermissions,
  type UserRole,
} from '../../features/tasks/utils/taskPermissions';

import TaskParticipantsSection from '../../features/tasks/components/TaskParticipantsSection';

// ============================================================================
// TYPES
// ============================================================================

interface TaskDetail {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  department_id?: string | null;
  assigner_id?: string | null;
  assignee_id?: string | null;
  start_date?: string | null;
  due_date?: string | null;
  completed_date?: string | null;
  status: string;
  priority: string;
  progress: number;
  notes?: string | null;
  is_self_assigned?: boolean;
  evaluation_status?: string | null;
  created_at?: string;
  updated_at?: string;
  department?: { id: string; code: string; name: string } | null;
  assigner?: { id: string; code: string; full_name: string } | null;
  assignee?: { id: string; code: string; full_name: string } | null;
  parent_task?: { id: string; code: string; name: string } | null;
}

interface SelfEvaluation {
  id: string;
  task_id: string;
  employee_id: string;
  score: number;
  rating: string;
  achievements?: string | null;
  challenges?: string | null;
  improvements?: string | null;
  comments?: string | null;
  status: string;
  submitted_at?: string;
  employee?: { full_name: string } | null;
}

interface Approval {
  id: string;
  self_evaluation_id: string;
  approver_id: string;
  score?: number | null;
  rating?: string | null;
  comments?: string | null;
  decision: string;
  approved_at?: string;
  approver?: { full_name: string } | null;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  draft: { label: 'Nháp', color: 'text-gray-600', bgColor: 'bg-gray-100' },
  in_progress: { label: 'Đang làm', color: 'text-blue-600', bgColor: 'bg-blue-100' },
  paused: { label: 'Tạm dừng', color: 'text-yellow-600', bgColor: 'bg-yellow-100' },
  finished: { label: 'Hoàn thành', color: 'text-green-600', bgColor: 'bg-green-100' },
  cancelled: { label: 'Đã hủy', color: 'text-red-600', bgColor: 'bg-red-100' },
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  low: { label: 'Thấp', color: 'text-gray-600', bgColor: 'bg-gray-100' },
  medium: { label: 'Trung bình', color: 'text-blue-600', bgColor: 'bg-blue-100' },
  high: { label: 'Cao', color: 'text-orange-600', bgColor: 'bg-orange-100' },
  urgent: { label: 'Khẩn cấp', color: 'text-red-600', bgColor: 'bg-red-100' },
};

const RATING_CONFIG: Record<string, { label: string; color: string }> = {
  A: { label: 'Xuất sắc', color: 'text-green-600' },
  B: { label: 'Tốt', color: 'text-blue-600' },
  C: { label: 'Đạt', color: 'text-yellow-600' },
  D: { label: 'Cần cải thiện', color: 'text-orange-600' },
  F: { label: 'Không đạt', color: 'text-red-600' },
};

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.draft;
  return (
    <span className={`inline-flex items-center px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-xs sm:text-sm font-medium ${config.bgColor} ${config.color}`}>
      <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-current mr-1.5 sm:mr-2" />
      {config.label}
    </span>
  );
};

const PriorityBadge: React.FC<{ priority: string }> = ({ priority }) => {
  const config = PRIORITY_CONFIG[priority] || PRIORITY_CONFIG.medium;
  return (
    <span className={`inline-flex items-center px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-xs sm:text-sm font-medium ${config.bgColor} ${config.color}`}>
      <Flag className="w-3 h-3 mr-1" />
      {config.label}
    </span>
  );
};

const ProgressCircle: React.FC<{ progress: number; size?: number }> = ({ progress, size = 120 }) => {
  const radius = (size - 12) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;
  
  const getProgressColor = (p: number) => {
    if (p >= 100) return '#22c55e';
    if (p >= 75) return '#3b82f6';
    if (p >= 50) return '#f59e0b';
    return '#ef4444';
  };

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg className="transform -rotate-90" width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={radius} stroke="#e5e7eb" strokeWidth="8" fill="none" />
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          stroke={getProgressColor(progress)} strokeWidth="8" fill="none"
          strokeDasharray={circumference} strokeDashoffset={strokeDashoffset}
          strokeLinecap="round" className="transition-all duration-500"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl sm:text-2xl font-bold" style={{ color: getProgressColor(progress) }}>{progress}%</span>
        <span className="text-[10px] sm:text-xs text-gray-500">Hoàn thành</span>
      </div>
    </div>
  );
};

const InfoRow: React.FC<{ icon: React.ReactNode; label: string; value: React.ReactNode }> = ({ icon, label, value }) => (
  <div className="flex items-start gap-2 sm:gap-3 py-2.5 sm:py-3 border-b border-gray-100 last:border-0">
    <div className="flex-shrink-0 w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-gray-100 flex items-center justify-center text-gray-500">{icon}</div>
    <div className="flex-1 min-w-0">
      <p className="text-xs sm:text-sm text-gray-500">{label}</p>
      <div className="text-xs sm:text-sm font-medium text-gray-900 mt-0.5">{value || '-'}</div>
    </div>
  </div>
);

const LockBanner: React.FC<{ message: string }> = ({ message }) => (
  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 sm:p-4 flex items-start sm:items-center gap-2 sm:gap-3">
    <Lock className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-600 flex-shrink-0 mt-0.5 sm:mt-0" />
    <div>
      <p className="text-xs sm:text-sm font-medium text-yellow-800">{message}</p>
      <p className="text-[10px] sm:text-xs text-yellow-600 mt-0.5 sm:mt-1">Công việc đang trong quy trình đánh giá, một số thao tác bị hạn chế.</p>
    </div>
  </div>
);

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  confirmColor?: 'red' | 'blue' | 'green';
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  confirmText = 'Xác nhận',
  cancelText = 'Hủy',
  confirmColor = 'blue',
  onConfirm,
  onCancel,
  loading = false,
}) => {
  if (!isOpen) return null;

  const colorClasses = {
    red: 'bg-red-600 hover:bg-red-700',
    blue: 'bg-blue-600 hover:bg-blue-700',
    green: 'bg-green-600 hover:bg-green-700',
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-end sm:items-center justify-center p-4">
        <div className="fixed inset-0 bg-black bg-opacity-30" onClick={onCancel} />
        <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full p-4 sm:p-6">
          <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-2">{title}</h3>
          <p className="text-sm text-gray-600 mb-4 sm:mb-6">{message}</p>
          <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3 sm:justify-end">
            <button
              onClick={onCancel}
              disabled={loading}
              className="px-4 py-2.5 sm:py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              {cancelText}
            </button>
            <button
              onClick={onConfirm}
              disabled={loading}
              className={`px-4 py-2.5 sm:py-2 text-sm font-medium text-white rounded-lg transition-colors flex items-center justify-center gap-2 ${colorClasses[confirmColor]}`}
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const TaskDetailPage: React.FC = () => {
  const params = useParams<{ taskId?: string; id?: string }>();
  const taskId = params.taskId || params.id;
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [task, setTask] = useState<TaskDetail | null>(null);
  const [selfEvaluation, setSelfEvaluation] = useState<SelfEvaluation | null>(null);
  const [approval, setApproval] = useState<Approval | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<TaskPermissions | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchTaskDetail = useCallback(async () => {
    if (!taskId) return;
    setLoading(true);
    setError(null);

    try {
      const { data: taskData, error: taskError } = await supabase
        .from('tasks')
        .select(`
          *,
          department:departments(id, code, name),
          assigner:employees!tasks_assigner_id_fkey(id, code, full_name),
          assignee:employees!tasks_assignee_id_fkey(id, code, full_name),
          parent_task:tasks!tasks_parent_task_id_fkey(id, code, name)
        `)
        .eq('id', taskId)
        .single();

      if (taskError) throw taskError;
      if (!taskData) throw new Error('Không tìm thấy công việc');
      setTask(taskData);

      if (user) {
        const perms = getTaskPermissions(
          taskData,
          (user.role as UserRole) || 'employee',
          user.department_id,
          undefined,
          user.role === 'admin'
        );
        setPermissions(perms);
      }

      const { data: evalData } = await supabase
        .from('task_self_evaluations')
        .select(`*, employee:employees(full_name)`)
        .eq('task_id', taskId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (evalData) {
        setSelfEvaluation(evalData);

        const { data: approvalData } = await supabase
          .from('task_approvals')
          .select(`*, approver:employees(full_name)`)
          .eq('self_evaluation_id', evalData.id)
          .single();

        if (approvalData) {
          setApproval(approvalData);
        }
      }
    } catch (err: any) {
      console.error('Error fetching task:', err);
      setError(err.message || 'Có lỗi xảy ra khi tải dữ liệu');
    } finally {
      setLoading(false);
    }
  }, [taskId, user]);

  useEffect(() => {
    fetchTaskDetail();
  }, [fetchTaskDetail]);

  // Action handlers
  const handleEdit = () => {
    if (task && permissions?.canEdit) {
      navigate(`/tasks/${task.id}/edit`);
    }
  };

  const handleDelete = async () => {
    if (!task || !permissions?.canDelete) return;
    setActionLoading(true);
    try {
      const { error } = await supabase.from('tasks').delete().eq('id', task.id);
      if (error) throw error;
      navigate('/tasks', { replace: true });
    } catch (err: any) {
      alert('Có lỗi xảy ra khi xóa công việc: ' + err.message);
    } finally {
      setActionLoading(false);
      setShowDeleteDialog(false);
    }
  };

  const handleCancel = async () => {
    if (!task || !permissions?.canCancel) return;
    setActionLoading(true);
    try {
      const { error } = await supabase.from('tasks').update({ status: 'cancelled' }).eq('id', task.id);
      if (error) throw error;
      await fetchTaskDetail();
    } catch (err: any) {
      alert('Có lỗi xảy ra khi hủy công việc: ' + err.message);
    } finally {
      setActionLoading(false);
      setShowCancelDialog(false);
    }
  };

  const handleSelfEvaluate = () => {
    if (task) navigate(`/my-tasks?tab=awaiting_eval&taskId=${task.id}`);
  };

  const handleApprove = () => {
    if (task) navigate(`/approvals?taskId=${task.id}`);
  };

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-2" />
          <p className="text-gray-500">Đang tải...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !task) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] px-4">
        <AlertCircle className="w-10 h-10 sm:w-12 sm:h-12 text-red-500 mb-3 sm:mb-4" />
        <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-2 text-center">{error || 'Không tìm thấy công việc'}</h2>
        <button onClick={() => navigate(-1)} className="text-blue-600 hover:underline text-sm sm:text-base">Quay lại</button>
      </div>
    );
  }

  const lockMessage = getTaskLockMessage(task);

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6">
      {/* ══════════════════════════════════════════════════════
          HEADER - Compact on mobile to prevent top bar overlap
          ══════════════════════════════════════════════════════ */}
      <div className="mb-3 md:mb-6">
        {/* Back button - compact on mobile */}
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-gray-500 active:text-gray-900 mb-2 sm:mb-3 text-xs sm:text-sm py-1"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Quay lại</span>
        </button>

        <div className="flex flex-col gap-2 md:gap-4">
          {/* Title & Badges */}
          <div className="flex-1 min-w-0">
            {/* ✅ FIX: Tên công việc TRƯỚC badges trên mobile để không bị che */}
            <h1 className="text-base sm:text-xl md:text-2xl font-bold text-gray-900 break-words leading-tight mb-1.5 sm:mb-2">
              {task.name}
            </h1>
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
              <span className="text-[11px] sm:text-sm text-gray-400 font-mono">{task.code}</span>
              <StatusBadge status={task.status} />
              <PriorityBadge priority={task.priority} />
              {task.evaluation_status && task.evaluation_status !== 'none' && (
                <span className={`px-2 py-0.5 sm:py-1 rounded text-[10px] sm:text-xs font-medium ${getEvaluationStatusColor(task.evaluation_status)}`}>
                  {getEvaluationStatusLabel(task.evaluation_status)}
                </span>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-1.5 sm:gap-2">
            <button onClick={fetchTaskDetail} className="flex items-center gap-1.5 px-2.5 sm:px-4 py-2 text-xs sm:text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg active:bg-gray-50 transition-colors">
              <RefreshCw className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">Làm mới</span>
            </button>

            {permissions?.canEdit ? (
              <button onClick={handleEdit} className="flex items-center gap-1.5 px-2.5 sm:px-4 py-2 text-xs sm:text-sm font-medium text-white bg-blue-600 rounded-lg active:bg-blue-700 transition-colors">
                <Edit className="w-3.5 h-3.5 sm:w-4 sm:h-4" />Sửa
              </button>
            ) : (
              <button disabled title={permissions?.editDisabledReason || 'Không có quyền sửa'} className="flex items-center gap-1.5 px-2.5 sm:px-4 py-2 text-xs sm:text-sm font-medium text-gray-400 bg-gray-100 rounded-lg cursor-not-allowed">
                <Lock className="w-3.5 h-3.5 sm:w-4 sm:h-4" />Sửa
              </button>
            )}

            {permissions?.canDelete ? (
              <button onClick={() => setShowDeleteDialog(true)} className="flex items-center gap-1.5 px-2.5 sm:px-4 py-2 text-xs sm:text-sm font-medium text-white bg-red-600 rounded-lg active:bg-red-700 transition-colors">
                <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />Xóa
              </button>
            ) : (
              <button disabled title={permissions?.deleteDisabledReason || 'Không có quyền xóa'} className="flex items-center gap-1.5 px-2.5 sm:px-4 py-2 text-xs sm:text-sm font-medium text-gray-400 bg-gray-100 rounded-lg cursor-not-allowed">
                <Lock className="w-3.5 h-3.5 sm:w-4 sm:h-4" />Xóa
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Lock Banner */}
      {lockMessage && <div className="mb-4 md:mb-6"><LockBanner message={lockMessage} /></div>}

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        {/* Left Column */}
        <div className="lg:col-span-2 space-y-4 md:space-y-6">
          {/* Description */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 md:p-6">
            <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4 flex items-center gap-2">
              <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />Chi tiết công việc
            </h2>
            <div className="prose prose-sm max-w-none text-gray-600 text-sm">
              {task.description || <span className="text-gray-400 italic">Chưa có mô tả</span>}
            </div>
          </div>

          {/* Task Info Grid */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 md:p-6">
            <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4 flex items-center gap-2">
              <Users className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />Thông tin phân công
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 md:gap-x-8">
              <InfoRow icon={<Building2 className="w-4 h-4" />} label="Phòng ban" value={task.department?.name} />
              <InfoRow icon={<User className="w-4 h-4" />} label="Người giao" value={task.assigner?.full_name} />
              <InfoRow icon={<User className="w-4 h-4" />} label="Người thực hiện" value={task.assignee?.full_name} />
              <InfoRow icon={<Calendar className="w-4 h-4" />} label="Ngày bắt đầu" value={task.start_date ? new Date(task.start_date).toLocaleDateString('vi-VN') : null} />
              <InfoRow icon={<Calendar className="w-4 h-4" />} label="Hạn hoàn thành" value={task.due_date ? new Date(task.due_date).toLocaleString('vi-VN') : null} />
              <InfoRow icon={<CheckCircle className="w-4 h-4" />} label="Ngày hoàn thành" value={task.completed_date ? new Date(task.completed_date).toLocaleString('vi-VN') : null} />
            </div>
          </div>

          {/* Participants Section */}
          <TaskParticipantsSection
            taskId={task.id}
            taskAssigneeId={task.assignee_id}
            onParticipantChange={fetchTaskDetail}
          />

          {/* Self Evaluation */}
          {selfEvaluation && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 md:p-6">
              <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4 flex items-center gap-2">
                <Star className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-500" />Tự đánh giá
              </h2>
              <div className="space-y-3 sm:space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                  <div className="flex-1">
                    <p className="text-xs sm:text-sm text-gray-500">Điểm tự đánh giá</p>
                    <p className="text-xl sm:text-2xl font-bold text-blue-600">{selfEvaluation.score}/100</p>
                  </div>
                  <div className="flex-1">
                    <p className="text-xs sm:text-sm text-gray-500">Xếp loại</p>
                    <p className={`text-lg sm:text-xl font-bold ${RATING_CONFIG[selfEvaluation.rating]?.color || 'text-gray-600'}`}>
                      {selfEvaluation.rating} - {RATING_CONFIG[selfEvaluation.rating]?.label || selfEvaluation.rating}
                    </p>
                  </div>
                </div>
                {selfEvaluation.achievements && (
                  <div>
                    <p className="text-xs sm:text-sm font-medium text-gray-700 mb-1">Thành tựu đạt được</p>
                    <p className="text-xs sm:text-sm text-gray-600 bg-gray-50 p-2.5 sm:p-3 rounded-lg">{selfEvaluation.achievements}</p>
                  </div>
                )}
                {selfEvaluation.challenges && (
                  <div>
                    <p className="text-xs sm:text-sm font-medium text-gray-700 mb-1">Khó khăn gặp phải</p>
                    <p className="text-xs sm:text-sm text-gray-600 bg-gray-50 p-2.5 sm:p-3 rounded-lg">{selfEvaluation.challenges}</p>
                  </div>
                )}
                {selfEvaluation.comments && (
                  <div>
                    <p className="text-xs sm:text-sm font-medium text-gray-700 mb-1">Nhận xét</p>
                    <p className="text-xs sm:text-sm text-gray-600 bg-gray-50 p-2.5 sm:p-3 rounded-lg">{selfEvaluation.comments}</p>
                  </div>
                )}
                <div className="text-[10px] sm:text-xs text-gray-400 pt-2">
                  Gửi bởi: {selfEvaluation.employee?.full_name} · {selfEvaluation.submitted_at && new Date(selfEvaluation.submitted_at).toLocaleString('vi-VN')}
                </div>
              </div>
            </div>
          )}

          {/* Approval */}
          {approval && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 md:p-6">
              <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4 flex items-center gap-2">
                <Award className="w-4 h-4 sm:w-5 sm:h-5 text-green-500" />Kết quả phê duyệt
              </h2>
              <div className="space-y-3 sm:space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                  {approval.score !== null && (
                    <div className="flex-1">
                      <p className="text-xs sm:text-sm text-gray-500">Điểm duyệt</p>
                      <p className="text-xl sm:text-2xl font-bold text-green-600">{approval.score}/100</p>
                    </div>
                  )}
                  {approval.rating && (
                    <div className="flex-1">
                      <p className="text-xs sm:text-sm text-gray-500">Xếp loại cuối</p>
                      <p className={`text-lg sm:text-xl font-bold ${RATING_CONFIG[approval.rating]?.color || 'text-gray-600'}`}>
                        {approval.rating} - {RATING_CONFIG[approval.rating]?.label || approval.rating}
                      </p>
                    </div>
                  )}
                  <div className="flex-1">
                    <p className="text-xs sm:text-sm text-gray-500">Quyết định</p>
                    <span className={`inline-flex items-center px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-xs sm:text-sm font-medium ${
                      approval.decision === 'approved' ? 'bg-green-100 text-green-800' :
                      approval.decision === 'rejected' ? 'bg-red-100 text-red-800' :
                      'bg-yellow-100 text-yellow-800'
                    }`}>
                      {approval.decision === 'approved' ? 'Đã duyệt' :
                       approval.decision === 'rejected' ? 'Từ chối' : 'Yêu cầu sửa'}
                    </span>
                  </div>
                </div>
                {approval.comments && (
                  <div>
                    <p className="text-xs sm:text-sm font-medium text-gray-700 mb-1">Nhận xét của người duyệt</p>
                    <p className="text-xs sm:text-sm text-gray-600 bg-green-50 p-2.5 sm:p-3 rounded-lg">{approval.comments}</p>
                  </div>
                )}
                <div className="text-[10px] sm:text-xs text-gray-400 pt-2">
                  Duyệt bởi: {approval.approver?.full_name} · {approval.approved_at && new Date(approval.approved_at).toLocaleString('vi-VN')}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column */}
        <div className="space-y-4 md:space-y-6">
          {/* Progress - responsive circle size */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 md:p-6">
            <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-blue-500" />Tiến độ công việc
            </h3>
            <div className="flex justify-center py-2 sm:py-4">
              {/* Responsive: smaller on mobile */}
              <div className="block sm:hidden">
                <ProgressCircle progress={task.progress} size={100} />
              </div>
              <div className="hidden sm:block">
                <ProgressCircle progress={task.progress} size={120} />
              </div>
            </div>
          </div>

          {/* Timeline */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 md:p-6">
            <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4 flex items-center gap-2">
              <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />Thời gian
            </h3>
            <div className="space-y-2 sm:space-y-3 text-xs sm:text-sm">
              <div className="flex justify-between gap-2">
                <span className="text-gray-500">Ngày tạo</span>
                <span className="font-medium text-right">{task.created_at ? new Date(task.created_at).toLocaleString('vi-VN') : '-'}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-gray-500">Cập nhật</span>
                <span className="font-medium text-right">{task.updated_at ? new Date(task.updated_at).toLocaleString('vi-VN') : '-'}</span>
              </div>
              {task.completed_date && (
                <div className="flex justify-between gap-2">
                  <span className="text-gray-500">Hoàn thành</span>
                  <span className="font-medium text-green-600 text-right">{new Date(task.completed_date).toLocaleString('vi-VN')}</span>
                </div>
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 md:p-6">
            <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4">Thao tác nhanh</h3>
            <div className="space-y-2">
              {permissions?.canSelfEvaluate && (
                <button onClick={handleSelfEvaluate} className="w-full flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 sm:py-3 text-left text-xs sm:text-sm font-medium text-blue-700 bg-blue-50 active:bg-blue-100 rounded-lg transition-colors">
                  <Star className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />Tự đánh giá công việc
                </button>
              )}
              {permissions?.canApprove && (
                <button onClick={handleApprove} className="w-full flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 sm:py-3 text-left text-xs sm:text-sm font-medium text-green-700 bg-green-50 active:bg-green-100 rounded-lg transition-colors">
                  <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />Phê duyệt đánh giá
                </button>
              )}
              {permissions?.canMarkComplete && (
                <button className="w-full flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 sm:py-3 text-left text-xs sm:text-sm font-medium text-green-700 bg-green-50 active:bg-green-100 rounded-lg transition-colors">
                  <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />Đánh dấu hoàn thành
                </button>
              )}
              {permissions?.canPause && (
                <button className="w-full flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 sm:py-3 text-left text-xs sm:text-sm font-medium text-yellow-700 bg-yellow-50 active:bg-yellow-100 rounded-lg transition-colors">
                  <Pause className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />Tạm dừng công việc
                </button>
              )}
              {permissions?.canResume && (
                <button className="w-full flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 sm:py-3 text-left text-xs sm:text-sm font-medium text-blue-700 bg-blue-50 active:bg-blue-100 rounded-lg transition-colors">
                  <Play className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />Tiếp tục công việc
                </button>
              )}
              {permissions?.canCancel && (
                <button onClick={() => setShowCancelDialog(true)} className="w-full flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 sm:py-3 text-left text-xs sm:text-sm font-medium text-red-700 bg-red-50 active:bg-red-100 rounded-lg transition-colors">
                  <XCircle className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />Hủy công việc
                </button>
              )}
              {!permissions?.canSelfEvaluate && !permissions?.canApprove && !permissions?.canMarkComplete && !permissions?.canPause && !permissions?.canResume && !permissions?.canCancel && (
                <p className="text-xs sm:text-sm text-gray-500 text-center py-3 sm:py-4">Không có thao tác nào khả dụng</p>
              )}
            </div>
          </div>

          {/* Notes */}
          {task.notes && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 md:p-6">
              <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4 flex items-center gap-2">
                <MessageSquare className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />Ghi chú
              </h3>
              <p className="text-xs sm:text-sm text-gray-600">{task.notes}</p>
            </div>
          )}
        </div>
      </div>

      {/* Dialogs */}
      <ConfirmDialog
        isOpen={showDeleteDialog}
        title="Xác nhận xóa công việc"
        message={`Bạn có chắc chắn muốn xóa công việc "${task.name}"? Hành động này không thể hoàn tác.`}
        confirmText="Xóa"
        confirmColor="red"
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteDialog(false)}
        loading={actionLoading}
      />
      <ConfirmDialog
        isOpen={showCancelDialog}
        title="Xác nhận hủy công việc"
        message={`Bạn có chắc chắn muốn hủy công việc "${task.name}"? Công việc sẽ chuyển sang trạng thái "Đã hủy".`}
        confirmText="Hủy công việc"
        confirmColor="red"
        onConfirm={handleCancel}
        onCancel={() => setShowCancelDialog(false)}
        loading={actionLoading}
      />
    </div>
  );
};

export default TaskDetailPage;