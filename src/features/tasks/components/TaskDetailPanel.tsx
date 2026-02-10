// ============================================================================
// TASK DETAIL PANEL COMPONENT
// File: src/features/tasks/components/TaskDetailPanel.tsx
// Huy Anh ERP System
// ============================================================================

import React, { useState } from 'react';
import { X, Edit2, Trash2, Clock, Calendar, User, Tag, Flag } from 'lucide-react';
import { TaskStatusHistory, type StatusHistoryEntry } from './TaskStatusHistory';
import { ParticipantList, type Participant } from './ParticipantList';

// ============================================================================
// TYPES
// ============================================================================

export interface TaskDetail {
  id: string;
  name: string;
  description?: string;
  status: string;
  priority: string;
  progress: number;
  due_date?: string;
  estimated_hours?: number;
  actual_hours?: number;
  created_at: string;
  updated_at?: string;
  completed_at?: string;
  assignee?: {
    id: string;
    full_name: string;
  };
  creator?: {
    id: string;
    full_name: string;
  };
  department?: {
    id: string;
    name: string;
  };
  tags?: string[];
  participants?: Participant[];
  status_history?: StatusHistoryEntry[];
}

export interface TaskDetailPanelProps {
  task: TaskDetail;
  onEdit?: () => void;
  onDelete?: () => void;
  onClose?: () => void;
  isLoading?: boolean;
  className?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  not_started: { label: 'Chưa bắt đầu', color: 'bg-gray-100 text-gray-700' },
  in_progress: { label: 'Đang thực hiện', color: 'bg-blue-100 text-blue-700' },
  completed: { label: 'Hoàn thành', color: 'bg-green-100 text-green-700' },
  pending_evaluation: { label: 'Chờ đánh giá', color: 'bg-yellow-100 text-yellow-700' },
  approved: { label: 'Đã duyệt', color: 'bg-emerald-100 text-emerald-700' },
  rejected: { label: 'Từ chối', color: 'bg-red-100 text-red-700' },
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  low: { label: 'Thấp', color: 'text-gray-600', icon: '↓' },
  medium: { label: 'Trung bình', color: 'text-blue-600', icon: '→' },
  high: { label: 'Cao', color: 'text-orange-600', icon: '↑' },
  urgent: { label: 'Khẩn cấp', color: 'text-red-600', icon: '⚡' },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getProgressColor(progress: number): string {
  if (progress >= 100) return 'bg-green-500';
  if (progress >= 70) return 'bg-blue-500';
  if (progress >= 40) return 'bg-yellow-500';
  return 'bg-gray-400';
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const TaskDetailPanel: React.FC<TaskDetailPanelProps> = ({
  task,
  onEdit,
  onDelete,
  onClose,
  isLoading = false,
  className = '',
}) => {
  const [activeTab, setActiveTab] = useState<'detail' | 'history' | 'participants'>('detail');

  const statusConfig = STATUS_CONFIG[task.status] || { label: task.status, color: 'bg-gray-100' };
  const priorityConfig = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium;

  if (isLoading) {
    return (
      <div className={`bg-white rounded-lg shadow-lg p-6 ${className}`}>
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-3/4" />
          <div className="h-4 bg-gray-200 rounded w-1/2" />
          <div className="h-20 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg shadow-lg overflow-hidden ${className}`}>
      {/* Header */}
      <div className="p-4 border-b bg-gray-50">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-gray-900 truncate">
              {task.name}
            </h2>
            <div className="flex items-center gap-2 mt-1">
              <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${statusConfig.color}`}>
                {statusConfig.label}
              </span>
              <span className={`flex items-center gap-1 text-sm ${priorityConfig.color}`}>
                <span>{priorityConfig.icon}</span>
                {priorityConfig.label}
              </span>
            </div>
          </div>
          
          {/* Actions */}
          <div className="flex items-center gap-1">
            {onEdit && (
              <button
                onClick={onEdit}
                className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                title="Chỉnh sửa"
              >
                <Edit2 size={18} />
              </button>
            )}
            {onDelete && (
              <button
                onClick={onDelete}
                className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg"
                title="Xóa"
              >
                <Trash2 size={18} />
              </button>
            )}
            {onClose && (
              <button
                onClick={onClose}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
                title="Đóng"
              >
                <X size={18} />
              </button>
            )}
          </div>
        </div>

        {/* Progress */}
        <div className="mt-3">
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="text-gray-500">Tiến độ</span>
            <span className="font-medium">{task.progress}%</span>
          </div>
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${getProgressColor(task.progress)}`}
              style={{ width: `${task.progress}%` }}
            />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b">
        <button
          onClick={() => setActiveTab('detail')}
          className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'detail'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Chi tiết
        </button>
        <button
          onClick={() => setActiveTab('participants')}
          className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'participants'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Người tham gia
          {task.participants && task.participants.length > 0 && (
            <span className="ml-1 px-1.5 py-0.5 text-xs bg-gray-200 rounded-full">
              {task.participants.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'history'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Lịch sử
        </button>
      </div>

      {/* Content */}
      <div className="p-4 max-h-96 overflow-y-auto">
        {/* Detail Tab */}
        {activeTab === 'detail' && (
          <div className="space-y-4">
            {/* Description */}
            {task.description && (
              <div>
                <h4 className="text-sm font-medium text-gray-500 mb-1">Mô tả</h4>
                <p className="text-gray-700 whitespace-pre-wrap">{task.description}</p>
              </div>
            )}

            {/* Meta Grid */}
            <div className="grid grid-cols-2 gap-4">
              {/* Assignee */}
              {task.assignee && (
                <div className="flex items-center gap-2">
                  <User size={16} className="text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-500">Người thực hiện</p>
                    <p className="text-sm font-medium">{task.assignee.full_name}</p>
                  </div>
                </div>
              )}

              {/* Due Date */}
              {task.due_date && (
                <div className="flex items-center gap-2">
                  <Calendar size={16} className="text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-500">Hạn hoàn thành</p>
                    <p className="text-sm font-medium">{formatDate(task.due_date)}</p>
                  </div>
                </div>
              )}

              {/* Estimated Hours */}
              {task.estimated_hours && (
                <div className="flex items-center gap-2">
                  <Clock size={16} className="text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-500">Thời gian ước tính</p>
                    <p className="text-sm font-medium">{task.estimated_hours} giờ</p>
                  </div>
                </div>
              )}

              {/* Department */}
              {task.department && (
                <div className="flex items-center gap-2">
                  <Flag size={16} className="text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-500">Phòng ban</p>
                    <p className="text-sm font-medium">{task.department.name}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Tags */}
            {task.tags && task.tags.length > 0 && (
              <div>
                <div className="flex items-center gap-1 text-sm text-gray-500 mb-2">
                  <Tag size={14} />
                  <span>Nhãn</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {task.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Timestamps */}
            <div className="pt-3 border-t text-xs text-gray-400 space-y-1">
              <p>Tạo lúc: {formatDateTime(task.created_at)}</p>
              {task.updated_at && <p>Cập nhật: {formatDateTime(task.updated_at)}</p>}
              {task.completed_at && <p>Hoàn thành: {formatDateTime(task.completed_at)}</p>}
            </div>
          </div>
        )}

        {/* Participants Tab */}
        {activeTab === 'participants' && (
          <ParticipantList
            participants={task.participants || []}
            showRole
            canEdit={false}
          />
        )}

        {/* History Tab */}
        {activeTab === 'history' && (
          <TaskStatusHistory history={task.status_history || []} />
        )}
      </div>
    </div>
  );
};

// ============================================================================
// MODAL VARIANT
// ============================================================================

export const TaskDetailModal: React.FC<{
  isOpen: boolean;
  task: TaskDetail | null;
  onClose: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}> = ({ isOpen, task, onClose, onEdit, onDelete }) => {
  if (!isOpen || !task) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/50" onClick={onClose} />
        <div className="relative w-full max-w-2xl">
          <TaskDetailPanel
            task={task}
            onEdit={onEdit}
            onDelete={onDelete}
            onClose={onClose}
          />
        </div>
      </div>
    </div>
  );
};

export default TaskDetailPanel;