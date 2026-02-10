// ============================================================================
// TASK ACTIONS COMPONENT
// File: src/features/tasks/TaskActions.tsx
// Huy Anh ERP System
// ============================================================================
// PHÂN QUYỀN:
// - EXECUTIVE (Level 1-3): Full quyền
// - MANAGER (Level 4-5): Chỉ trong phòng ban, KHÔNG sửa/xóa task do Executive tạo
// - EMPLOYEE (Level 6+): KHÔNG sửa/xóa, chỉ xem
// ============================================================================

import React, { useState } from 'react';
import {
  Eye,
  Edit3,
  Trash2,
  Send,
  Undo2,
  MoreVertical,
  Loader2,
  AlertTriangle,
  X,
} from 'lucide-react';
import { taskService } from '../../services/taskService';
import {
  getTaskPermissions,
  type TaskForPermission,
  type UserRole,
} from './utils/taskPermissions';

// ============================================================================
// STATUS CONFIG (inline để tránh import lỗi)
// ============================================================================

const TASK_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; description?: string }> = {
  draft: { label: 'Bản nháp', color: 'text-gray-600', bg: 'bg-gray-100', description: 'Công việc chưa được giao' },
  in_progress: { label: 'Đang làm', color: 'text-blue-600', bg: 'bg-blue-100', description: 'Đang thực hiện' },
  completed: { label: 'Hoàn thành', color: 'text-green-600', bg: 'bg-green-100', description: 'Đã hoàn thành' },
  on_hold: { label: 'Tạm dừng', color: 'text-yellow-600', bg: 'bg-yellow-100', description: 'Tạm dừng' },
  cancelled: { label: 'Đã hủy', color: 'text-red-600', bg: 'bg-red-100', description: 'Đã hủy' },
};

// ============================================================================
// TYPES
// ============================================================================

export interface TaskActionsProps {
  taskId: string;
  taskStatus: string;
  taskProgress: number;
  taskName: string;
  assigneeId?: string;        // ID của người được giao việc
  assignerId?: string;        // ID của người giao việc
  taskDepartmentId?: string;  // ID phòng ban của task
  assignerLevel?: number | null; // Level của người giao việc
  evaluationStatus?: string | null;
  isSelfAssigned?: boolean;
  hasAssignee: boolean;
  currentUserId: string;      // ID của người đang thao tác (assigner)
  currentUserRole: string;
  currentUserDepartmentId?: string;
  currentUserPositionLevel?: number;
  onView?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onAssigned?: () => void;    // Callback sau khi giao việc thành công
  onUnassigned?: () => void;  // Callback sau khi hủy giao việc thành công
  compact?: boolean;          // Hiển thị compact mode (dropdown)
}

interface ConfirmDialogState {
  isOpen: boolean;
  action: 'assign' | 'unassign' | 'delete' | null;
  title: string;
  message: string;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const TaskActions: React.FC<TaskActionsProps> = ({
  taskId,
  taskStatus,
  taskProgress,
  taskName,
  assigneeId,
  assignerId,
  taskDepartmentId,
  assignerLevel,
  evaluationStatus,
  isSelfAssigned,
  hasAssignee,
  currentUserId,
  currentUserRole,
  currentUserDepartmentId,
  currentUserPositionLevel,
  onView,
  onEdit,
  onDelete,
  onAssigned,
  onUnassigned,
  compact = false,
}) => {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>({
    isOpen: false,
    action: null,
    title: '',
    message: '',
  });

  // ============================================
  // PERMISSION CHECK
  // ============================================

  const taskForPerm: TaskForPermission = {
    id: taskId,
    status: taskStatus,
    evaluation_status: evaluationStatus,
    assignee_id: assigneeId,
    assigner_id: assignerId,
    department_id: taskDepartmentId,
    is_self_assigned: isSelfAssigned,
    assigner_level: assignerLevel,
  };

  // FIX: Updated getTaskPermissions call to match new signature
  // New signature: (task, userRole, userDeptId, userLevel?, isAdmin?)
  const permissions = getTaskPermissions(
    taskForPerm,
    currentUserRole as UserRole,
    currentUserDepartmentId,
    currentUserPositionLevel,
    currentUserRole === 'admin'
  );

  // ============================================
  // DERIVED FLAGS
  // ============================================

  const isDraft = taskStatus === 'draft';
  const isInProgress = taskStatus === 'in_progress';
  const canAssign = isDraft && hasAssignee && permissions.canAssign;
  const canUnassign = isInProgress && taskProgress === 0 && permissions.canAssign;
  const canEdit = permissions.canEdit;
  const canDelete = permissions.canDelete;

  // ============================================
  // HANDLERS
  // ============================================

  const handleAssign = async () => {
    if (!assigneeId) {
      setError('Chưa có người được giao việc');
      return;
    }

    setLoading('assign');
    setError(null);
    
    try {
      await taskService.assignTask(taskId, assigneeId, currentUserId);
      setConfirmDialog({ isOpen: false, action: null, title: '', message: '' });
      onAssigned?.();
    } catch (err: any) {
      setError(err.message || 'Có lỗi khi giao việc');
    } finally {
      setLoading(null);
    }
  };

  const handleUnassign = async () => {
    setLoading('unassign');
    setError(null);
    
    try {
      if (typeof (taskService as any).unassignTask === 'function') {
        await (taskService as any).unassignTask(taskId, currentUserId, 'Hủy giao việc từ danh sách');
      } else {
        await taskService.updateStatus(taskId, 'draft');
      }
      setConfirmDialog({ isOpen: false, action: null, title: '', message: '' });
      onUnassigned?.();
    } catch (err: any) {
      setError(err.message || 'Có lỗi khi hủy giao việc');
    } finally {
      setLoading(null);
    }
  };

  const openConfirmDialog = (action: 'assign' | 'unassign' | 'delete') => {
    const configs = {
      assign: {
        title: 'Xác nhận giao việc',
        message: `Bạn có chắc muốn giao công việc "${taskName}" cho nhân viên? Sau khi giao, nhân viên sẽ thấy công việc này trong danh sách của họ.`,
      },
      unassign: {
        title: 'Xác nhận hủy giao việc',
        message: `Bạn có chắc muốn hủy giao công việc "${taskName}"? Công việc sẽ trở về trạng thái Bản nháp.`,
      },
      delete: {
        title: 'Xác nhận xóa',
        message: `Bạn có chắc muốn xóa công việc "${taskName}"? Hành động này không thể hoàn tác.`,
      },
    };

    setConfirmDialog({
      isOpen: true,
      action,
      ...configs[action],
    });
    setShowDropdown(false);
  };

  const handleConfirm = () => {
    switch (confirmDialog.action) {
      case 'assign':
        handleAssign();
        break;
      case 'unassign':
        handleUnassign();
        break;
      case 'delete':
        onDelete?.();
        setConfirmDialog({ isOpen: false, action: null, title: '', message: '' });
        break;
    }
  };

  // ============================================
  // RENDER - COMPACT MODE (Dropdown)
  // ============================================

  if (compact) {
    return (
      <div className="relative">
        <button
          onClick={() => setShowDropdown(!showDropdown)}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
        >
          <MoreVertical className="w-4 h-4" />
        </button>

        {showDropdown && (
          <>
            {/* Backdrop */}
            <div 
              className="fixed inset-0 z-10" 
              onClick={() => setShowDropdown(false)}
            />
            
            {/* Dropdown Menu */}
            <div className="absolute right-0 top-8 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20">
              {/* Xem */}
              {onView && (
                <button
                  onClick={() => { onView(); setShowDropdown(false); }}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                >
                  <Eye className="w-4 h-4 text-gray-500" />
                  Xem chi tiết
                </button>
              )}

              {/* Chỉnh sửa */}
              {onEdit && canEdit && (
                <button
                  onClick={() => { onEdit(); setShowDropdown(false); }}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                >
                  <Edit3 className="w-4 h-4 text-blue-500" />
                  Chỉnh sửa
                </button>
              )}

              {/* Chỉnh sửa (disabled) */}
              {onEdit && !canEdit && (
                <button
                  disabled
                  className="w-full px-4 py-2 text-left text-sm text-gray-400 cursor-not-allowed flex items-center gap-2"
                  title={permissions.editDisabledReason}
                >
                  <Edit3 className="w-4 h-4" />
                  Chỉnh sửa
                </button>
              )}

              {/* Divider */}
              {(canAssign || canUnassign) && <hr className="my-1" />}

              {/* Giao việc */}
              {canAssign && (
                <button
                  onClick={() => openConfirmDialog('assign')}
                  disabled={loading === 'assign'}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-green-50 flex items-center gap-2 text-green-700"
                >
                  {loading === 'assign' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  Giao việc
                </button>
              )}

              {/* Hủy giao việc */}
              {canUnassign && (
                <button
                  onClick={() => openConfirmDialog('unassign')}
                  disabled={loading === 'unassign'}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-yellow-50 flex items-center gap-2 text-yellow-700"
                >
                  {loading === 'unassign' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Undo2 className="w-4 h-4" />
                  )}
                  Hủy giao việc
                </button>
              )}

              {/* Divider */}
              {(canDelete || (onDelete && isDraft)) && <hr className="my-1" />}

              {/* Xóa */}
              {onDelete && canDelete && isDraft && (
                <button
                  onClick={() => openConfirmDialog('delete')}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-red-50 flex items-center gap-2 text-red-600"
                >
                  <Trash2 className="w-4 h-4" />
                  Xóa
                </button>
              )}

              {/* Xóa (disabled) */}
              {onDelete && !canDelete && isDraft && (
                <button
                  disabled
                  className="w-full px-4 py-2 text-left text-sm text-gray-400 cursor-not-allowed flex items-center gap-2"
                  title={permissions.deleteDisabledReason}
                >
                  <Trash2 className="w-4 h-4" />
                  Xóa
                </button>
              )}
            </div>
          </>
        )}

        {/* Confirm Dialog */}
        {confirmDialog.isOpen && (
          <ConfirmDialog
            title={confirmDialog.title}
            message={confirmDialog.message}
            loading={loading !== null}
            error={error}
            onConfirm={handleConfirm}
            onCancel={() => setConfirmDialog({ isOpen: false, action: null, title: '', message: '' })}
            confirmText={confirmDialog.action === 'delete' ? 'Xóa' : 'Xác nhận'}
            confirmVariant={confirmDialog.action === 'delete' ? 'danger' : 'primary'}
          />
        )}
      </div>
    );
  }

  // ============================================
  // RENDER - FULL MODE (Inline Buttons)
  // ============================================

  return (
    <div className="flex items-center gap-2">
      {/* Nút Xem */}
      {onView && (
        <button
          onClick={onView}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700"
          title="Xem chi tiết"
        >
          <Eye className="w-4 h-4" />
        </button>
      )}

      {/* Nút Chỉnh sửa */}
      {onEdit && canEdit && (
        <button
          onClick={onEdit}
          className="p-1.5 rounded-lg hover:bg-blue-100 text-blue-500 hover:text-blue-700"
          title="Chỉnh sửa"
        >
          <Edit3 className="w-4 h-4" />
        </button>
      )}

      {/* Nút Chỉnh sửa (disabled) */}
      {onEdit && !canEdit && (
        <button
          disabled
          className="p-1.5 rounded-lg text-gray-300 cursor-not-allowed"
          title={permissions.editDisabledReason || 'Không có quyền sửa'}
        >
          <Edit3 className="w-4 h-4" />
        </button>
      )}

      {/* Nút Giao việc - CHỈ hiển thị khi task ở draft */}
      {canAssign && (
        <button
          onClick={() => openConfirmDialog('assign')}
          disabled={loading === 'assign'}
          className="px-3 py-1.5 rounded-lg bg-green-500 hover:bg-green-600 text-white text-sm font-medium flex items-center gap-1.5 disabled:opacity-50"
          title="Giao việc cho nhân viên"
        >
          {loading === 'assign' ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
          Giao việc
        </button>
      )}

      {/* Nút Hủy giao - CHỈ hiển thị khi task đang in_progress và chưa có tiến độ */}
      {canUnassign && (
        <button
          onClick={() => openConfirmDialog('unassign')}
          disabled={loading === 'unassign'}
          className="px-3 py-1.5 rounded-lg bg-yellow-500 hover:bg-yellow-600 text-white text-sm font-medium flex items-center gap-1.5 disabled:opacity-50"
          title="Hủy giao việc"
        >
          {loading === 'unassign' ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Undo2 className="w-4 h-4" />
          )}
          Hủy giao
        </button>
      )}

      {/* Nút Xóa - CHỈ hiển thị khi task ở draft */}
      {onDelete && canDelete && isDraft && (
        <button
          onClick={() => openConfirmDialog('delete')}
          className="p-1.5 rounded-lg hover:bg-red-100 text-red-500 hover:text-red-700"
          title="Xóa công việc"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )}

      {/* Nút Xóa (disabled) */}
      {onDelete && !canDelete && isDraft && (
        <button
          disabled
          className="p-1.5 rounded-lg text-gray-300 cursor-not-allowed"
          title={permissions.deleteDisabledReason || 'Không có quyền xóa'}
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )}

      {/* Error Toast */}
      {error && (
        <div className="fixed bottom-4 right-4 bg-red-100 border border-red-300 text-red-700 px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 z-50">
          <AlertTriangle className="w-5 h-5" />
          <span>{error}</span>
          <button 
            onClick={() => setError(null)}
            className="ml-2 text-red-500 hover:text-red-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Confirm Dialog */}
      {confirmDialog.isOpen && (
        <ConfirmDialog
          title={confirmDialog.title}
          message={confirmDialog.message}
          loading={loading !== null}
          error={error}
          onConfirm={handleConfirm}
          onCancel={() => setConfirmDialog({ isOpen: false, action: null, title: '', message: '' })}
          confirmText={confirmDialog.action === 'delete' ? 'Xóa' : 'Xác nhận'}
          confirmVariant={confirmDialog.action === 'delete' ? 'danger' : 'primary'}
        />
      )}
    </div>
  );
};

// ============================================================================
// CONFIRM DIALOG COMPONENT
// ============================================================================

interface ConfirmDialogProps {
  title: string;
  message: string;
  loading?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
  confirmText?: string;
  confirmVariant?: 'primary' | 'danger';
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  title,
  message,
  loading,
  error,
  onConfirm,
  onCancel,
  confirmText = 'Xác nhận',
  confirmVariant = 'primary',
}) => {
  const confirmButtonClass = confirmVariant === 'danger'
    ? 'bg-red-500 hover:bg-red-600 text-white'
    : 'bg-blue-500 hover:bg-blue-600 text-white';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        </div>

        {/* Body */}
        <div className="px-6 py-4">
          <p className="text-gray-600">{message}</p>
          
          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 disabled:opacity-50"
          >
            Hủy
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`px-4 py-2 rounded-lg ${confirmButtonClass} disabled:opacity-50 flex items-center gap-2`}
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// TASK STATUS BADGE COMPONENT
// ============================================================================

export interface TaskStatusBadgeProps {
  status: string;
  showDraft?: boolean;
}

export const TaskStatusBadge: React.FC<TaskStatusBadgeProps> = ({ 
  status, 
  showDraft = true 
}) => {
  const config = TASK_STATUS_CONFIG[status];
  
  if (!config) {
    return (
      <span className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-600">
        {status}
      </span>
    );
  }

  if (status === 'draft' && !showDraft) {
    return null;
  }

  return (
    <span 
      className={`px-2 py-1 text-xs rounded-full ${config.bg} ${config.color}`}
      title={config.description}
    >
      {config.label}
    </span>
  );
};

// ============================================================================
// ASSIGN TASK BUTTON - Standalone component
// ============================================================================

export interface AssignTaskButtonProps {
  taskId: string;
  taskStatus: string;
  taskName: string;
  assigneeId?: string;
  assignerId?: string;
  taskDepartmentId?: string;
  assignerLevel?: number | null;
  hasAssignee: boolean;
  currentUserId: string;
  currentUserRole?: string;
  currentUserDepartmentId?: string;
  currentUserPositionLevel?: number;
  onAssigned?: () => void;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'primary' | 'outline';
}

export const AssignTaskButton: React.FC<AssignTaskButtonProps> = ({
  taskId,
  taskStatus,
  taskName,
  assigneeId,
  assignerId,
  taskDepartmentId,
  assignerLevel,
  hasAssignee,
  currentUserId,
  currentUserRole = 'employee',
  currentUserDepartmentId,
  currentUserPositionLevel = 6,
  onAssigned,
  size = 'md',
  variant = 'primary',
}) => {
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Permission check
  const taskForPerm: TaskForPermission = {
    id: taskId,
    status: taskStatus,
    assigner_id: assignerId,
    department_id: taskDepartmentId,
    assigner_level: assignerLevel,
  };

  // FIX: Updated getTaskPermissions call to match new signature
  const permissions = getTaskPermissions(
    taskForPerm,
    currentUserRole as UserRole,
    currentUserDepartmentId,
    currentUserPositionLevel,
    currentUserRole === 'admin'
  );

  // Chỉ hiển thị khi task ở draft, có assignee, và có quyền assign
  if (taskStatus !== 'draft' || !hasAssignee || !permissions.canAssign) {
    return null;
  }

  const handleAssign = async () => {
    if (!assigneeId) {
      setError('Chưa có người được giao việc');
      return;
    }

    setLoading(true);
    setError(null);
    
    try {
      await taskService.assignTask(taskId, assigneeId, currentUserId);
      setShowConfirm(false);
      onAssigned?.();
    } catch (err: any) {
      setError(err.message || 'Có lỗi khi giao việc');
    } finally {
      setLoading(false);
    }
  };

  const sizeClasses = {
    sm: 'px-2 py-1 text-xs',
    md: 'px-3 py-1.5 text-sm',
    lg: 'px-4 py-2 text-base',
  };

  const variantClasses = {
    primary: 'bg-green-500 hover:bg-green-600 text-white',
    outline: 'border border-green-500 text-green-600 hover:bg-green-50',
  };

  return (
    <>
      <button
        onClick={() => setShowConfirm(true)}
        disabled={loading}
        className={`rounded-lg font-medium flex items-center gap-1.5 disabled:opacity-50 ${sizeClasses[size]} ${variantClasses[variant]}`}
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Send className="w-4 h-4" />
        )}
        Giao việc
      </button>

      {showConfirm && (
        <ConfirmDialog
          title="Xác nhận giao việc"
          message={`Bạn có chắc muốn giao công việc "${taskName}" cho nhân viên?`}
          loading={loading}
          error={error}
          onConfirm={handleAssign}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </>
  );
};

export default TaskActions;