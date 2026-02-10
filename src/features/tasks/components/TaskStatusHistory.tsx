// ============================================================================
// TASK STATUS HISTORY COMPONENT
// File: src/features/tasks/components/TaskStatusHistory.tsx
// Huy Anh ERP System
// ============================================================================

import React from 'react';

// ============================================================================
// TYPES
// ============================================================================

export interface StatusHistoryEntry {
  id: string;
  task_id: string;
  from_status: string | null;
  to_status: string;
  changed_by: string;
  changed_by_employee?: {
    id: string;
    full_name: string;
  };
  reason?: string;
  created_at: string;
}

export interface TaskStatusHistoryProps {
  history: StatusHistoryEntry[];
  isLoading?: boolean;
  className?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const STATUS_LABELS: Record<string, string> = {
  not_started: 'Chưa bắt đầu',
  in_progress: 'Đang thực hiện',
  completed: 'Hoàn thành',
  pending_evaluation: 'Chờ đánh giá',
  evaluated: 'Đã đánh giá',
  approved: 'Đã duyệt',
  rejected: 'Bị từ chối',
  revision_requested: 'Yêu cầu sửa',
  cancelled: 'Đã hủy',
  on_hold: 'Tạm dừng',
};

const STATUS_COLORS: Record<string, string> = {
  not_started: 'bg-gray-100 text-gray-700',
  in_progress: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  pending_evaluation: 'bg-yellow-100 text-yellow-700',
  evaluated: 'bg-indigo-100 text-indigo-700',
  approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
  revision_requested: 'bg-orange-100 text-orange-700',
  cancelled: 'bg-gray-200 text-gray-600',
  on_hold: 'bg-purple-100 text-purple-700',
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getStatusLabel(status: string | null): string {
  if (!status) return 'Mới tạo';
  return STATUS_LABELS[status] || status;
}

function getStatusColor(status: string): string {
  return STATUS_COLORS[status] || 'bg-gray-100 text-gray-600';
}

function formatDateTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Vừa xong';
  if (diffMins < 60) return `${diffMins} phút trước`;
  if (diffHours < 24) return `${diffHours} giờ trước`;
  if (diffDays < 7) return `${diffDays} ngày trước`;
  return formatDateTime(dateStr);
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const TaskStatusHistory: React.FC<TaskStatusHistoryProps> = ({
  history,
  isLoading = false,
  className = '',
}) => {
  if (isLoading) {
    return (
      <div className={`animate-pulse space-y-4 ${className}`}>
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex gap-4">
            <div className="w-3 h-3 bg-gray-200 rounded-full mt-1.5" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-gray-200 rounded w-3/4" />
              <div className="h-3 bg-gray-200 rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className={`text-center py-8 text-gray-500 ${className}`}>
        <p>Chưa có lịch sử thay đổi</p>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      {/* Timeline line */}
      <div className="absolute left-1.5 top-2 bottom-2 w-0.5 bg-gray-200" />

      {/* Entries */}
      <div className="space-y-6">
        {history.map((entry, index) => (
          <div key={entry.id} className="relative flex gap-4">
            {/* Timeline dot */}
            <div
              className={`
                relative z-10 w-3 h-3 rounded-full mt-1.5 ring-4 ring-white
                ${index === 0 ? 'bg-blue-500' : 'bg-gray-300'}
              `}
            />

            {/* Content */}
            <div className="flex-1 min-w-0">
              {/* Status change */}
              <div className="flex items-center gap-2 flex-wrap">
                {entry.from_status && (
                  <>
                    <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${getStatusColor(entry.from_status)}`}>
                      {getStatusLabel(entry.from_status)}
                    </span>
                    <span className="text-gray-400">→</span>
                  </>
                )}
                <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${getStatusColor(entry.to_status)}`}>
                  {getStatusLabel(entry.to_status)}
                </span>
              </div>

              {/* Meta info */}
              <div className="mt-1 flex items-center gap-2 text-sm text-gray-500">
                <span className="font-medium">
                  {entry.changed_by_employee?.full_name || 'Hệ thống'}
                </span>
                <span>•</span>
                <span title={formatDateTime(entry.created_at)}>
                  {getTimeAgo(entry.created_at)}
                </span>
              </div>

              {/* Reason */}
              {entry.reason && (
                <p className="mt-2 text-sm text-gray-600 bg-gray-50 rounded p-2">
                  {entry.reason}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ============================================================================
// COMPACT VARIANT
// ============================================================================

export const TaskStatusHistoryCompact: React.FC<{
  history: StatusHistoryEntry[];
  maxItems?: number;
  className?: string;
}> = ({ history, maxItems = 3, className = '' }) => {
  const recentHistory = history.slice(0, maxItems);
  const hiddenCount = history.length - maxItems;

  if (history.length === 0) {
    return (
      <p className={`text-sm text-gray-400 ${className}`}>
        Chưa có lịch sử
      </p>
    );
  }

  return (
    <div className={`space-y-2 ${className}`}>
      {recentHistory.map((entry) => (
        <div key={entry.id} className="flex items-center gap-2 text-sm">
          <span className={`px-1.5 py-0.5 text-xs rounded ${getStatusColor(entry.to_status)}`}>
            {getStatusLabel(entry.to_status)}
          </span>
          <span className="text-gray-400 text-xs">
            {getTimeAgo(entry.created_at)}
          </span>
        </div>
      ))}
      {hiddenCount > 0 && (
        <p className="text-xs text-gray-400">
          +{hiddenCount} thay đổi khác
        </p>
      )}
    </div>
  );
};

export default TaskStatusHistory;