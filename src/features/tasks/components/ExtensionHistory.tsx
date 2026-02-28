// ============================================================================
// EXTENSION HISTORY COMPONENT
// File: src/features/tasks/components/ExtensionHistory.tsx
// Huy Anh ERP - Hiển thị lịch sử gia hạn của task
// ============================================================================

import { 
  Clock, 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  Calendar,
  User,
  MessageSquare,
  Download,
  Loader2,
} from 'lucide-react';
import { useTaskExtensionHistory, useTaskPendingExtension } from '../hooks/useExtensionRequests';
import type { ExtensionHistory as ExtensionHistoryType } from '../../../types/extensionRequest';

// ============================================================================
// TYPES
// ============================================================================

interface ExtensionHistoryProps {
  taskId: string;
}

// ============================================================================
// HELPERS
// ============================================================================

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('vi-VN');
}

function formatDateTime(dateString: string): string {
  return new Date(dateString).toLocaleString('vi-VN');
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'approved':
      return <CheckCircle className="w-5 h-5 text-green-500" />;
    case 'rejected':
      return <XCircle className="w-5 h-5 text-red-500" />;
    case 'pending':
      return <Clock className="w-5 h-5 text-yellow-500" />;
    case 'cancelled':
      return <AlertCircle className="w-5 h-5 text-gray-400" />;
    default:
      return <Clock className="w-5 h-5 text-gray-400" />;
  }
}

function getStatusText(status: string) {
  switch (status) {
    case 'approved':
      return 'Đã duyệt';
    case 'rejected':
      return 'Từ chối';
    case 'pending':
      return 'Chờ duyệt';
    case 'cancelled':
      return 'Đã hủy';
    default:
      return status;
  }
}

function getStatusBgColor(status: string) {
  switch (status) {
    case 'approved':
      return 'bg-green-50 border-green-200';
    case 'rejected':
      return 'bg-red-50 border-red-200';
    case 'pending':
      return 'bg-yellow-50 border-yellow-200';
    case 'cancelled':
      return 'bg-gray-50 border-gray-200';
    default:
      return 'bg-gray-50 border-gray-200';
  }
}

// ============================================================================
// HISTORY ITEM COMPONENT
// ============================================================================

interface HistoryItemProps {
  item: ExtensionHistoryType;
  isLast: boolean;
}

function HistoryItem({ item, isLast }: HistoryItemProps) {
  return (
    <div className="relative pl-8">
      {/* Timeline line */}
      {!isLast && (
        <div className="absolute left-[9px] top-6 w-0.5 h-full bg-gray-200" />
      )}
      
      {/* Timeline dot */}
      <div className="absolute left-0 top-1">
        {getStatusIcon(item.status)}
      </div>

      {/* Content */}
      <div className={`p-3 rounded-lg border ${getStatusBgColor(item.status)} mb-3`}>
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <span className={`text-sm font-medium ${
            item.status === 'approved' ? 'text-green-700' :
            item.status === 'rejected' ? 'text-red-700' :
            item.status === 'pending' ? 'text-yellow-700' :
            'text-gray-700'
          }`}>
            Lần {item.extension_number}: {getStatusText(item.status)}
          </span>
          <span className="text-xs text-gray-400">
            {formatDateTime(item.created_at)}
          </span>
        </div>

        {/* Date change */}
        <div className="flex items-center gap-2 text-sm mb-2">
          <Calendar size={14} className="text-gray-400" />
          <span className="text-gray-600">
            {formatDate(item.original_due_date)}
          </span>
          <span className="text-gray-400">→</span>
          <span className="font-medium text-gray-900">
            {formatDate(item.requested_due_date)}
          </span>
          <span className={`text-xs px-1.5 py-0.5 rounded ${
            item.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
          }`}>
            +{item.extension_days} ngày
          </span>
        </div>

        {/* Requester */}
        <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
          <User size={14} className="text-gray-400" />
          <span>Yêu cầu bởi: {item.requester_name}</span>
        </div>

        {/* Reason */}
        <div className="text-sm text-gray-600 mb-2">
          <span className="text-gray-400">Lý do: </span>
          {item.reason}
        </div>

        {/* Approver info */}
        {item.status !== 'pending' && item.status !== 'cancelled' && (
          <div className="pt-2 border-t border-gray-200 mt-2">
            {item.approver_name && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <User size={14} className="text-gray-400" />
                <span>
                  {item.status === 'approved' ? 'Duyệt bởi: ' : 'Từ chối bởi: '}
                  {item.approver_name}
                </span>
              </div>
            )}
            {item.approver_comment && (
              <div className="flex items-start gap-2 text-sm text-gray-600 mt-1">
                <MessageSquare size={14} className="text-gray-400 mt-0.5" />
                <span>{item.approver_comment}</span>
              </div>
            )}
            {item.approved_at && (
              <div className="text-xs text-gray-400 mt-1">
                {formatDateTime(item.approved_at)}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function ExtensionHistory({ taskId }: ExtensionHistoryProps) {
  const { data: history, isLoading, error } = useTaskExtensionHistory(taskId);
  const { data: pendingRequest } = useTaskPendingExtension(taskId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
        <span className="ml-2 text-gray-500">Đang tải...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-6 text-red-500">
        Không thể tải lịch sử gia hạn
      </div>
    );
  }

  if (!history || history.length === 0) {
    return (
      <div className="text-center py-6 text-gray-500">
        <Calendar className="w-8 h-8 mx-auto mb-2 text-gray-300" />
        <p>Chưa có yêu cầu gia hạn nào</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Pending notice */}
      {pendingRequest && (
        <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg mb-4">
          <div className="flex items-center gap-2 text-yellow-700">
            <Clock className="w-4 h-4" />
            <span className="font-medium">Có yêu cầu đang chờ duyệt</span>
          </div>
        </div>
      )}

      {/* History timeline */}
      <div className="relative">
        {history.map((item, index) => (
          <HistoryItem
            key={item.id}
            item={item}
            isLast={index === history.length - 1}
          />
        ))}
      </div>

      {/* Extension count */}
      <div className="text-center pt-3 border-t">
        <span className="text-sm text-gray-500">
          Đã gia hạn: {history.filter(h => h.status === 'approved').length}/2 lần
        </span>
      </div>
    </div>
  );
}

// ============================================================================
// COMPACT VERSION (for sidebar/summary)
// ============================================================================

interface ExtensionHistoryCompactProps {
  taskId: string;
}

export function ExtensionHistoryCompact({ taskId }: ExtensionHistoryCompactProps) {
  const { data: history, isLoading } = useTaskExtensionHistory(taskId);
  const { data: pendingRequest } = useTaskPendingExtension(taskId);

  if (isLoading) {
    return <Loader2 className="w-4 h-4 animate-spin text-gray-400" />;
  }

  const approvedCount = history?.filter(h => h.status === 'approved').length || 0;

  return (
    <div className="flex items-center gap-2 text-sm">
      <Calendar size={14} className="text-gray-400" />
      <span className="text-gray-600">
        Gia hạn: {approvedCount}/2
      </span>
      {pendingRequest && (
        <span className="px-1.5 py-0.5 text-xs bg-yellow-100 text-yellow-700 rounded">
          Chờ duyệt
        </span>
      )}
    </div>
  );
}

export default ExtensionHistory;