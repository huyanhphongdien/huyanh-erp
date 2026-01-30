// ============================================================================
// EXTENSION APPROVAL TAB
// File: src/features/tasks/components/ExtensionApprovalTab.tsx
// Huy Anh ERP - Tab phê duyệt yêu cầu gia hạn
// ============================================================================

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Calendar,
  Clock,
  User,
  Building2,
  FileText,
  CheckCircle,
  XCircle,
  Loader2,
  ExternalLink,
  AlertTriangle,
  Download,
  Image,
  FileSpreadsheet,
  File,
  X,
  ZoomIn,
} from 'lucide-react';
import { useAuthStore } from '../../../stores/authStore';
import {
  usePendingExtensionRequests,
  usePendingExtensionRequestsForManager,
  useAllPendingExtensionRequests,
  useApproveExtensionRequest,
} from '../hooks/useExtensionRequests';
import type { ExtensionRequestWithDetails } from '../../../types/extensionRequest';

// ============================================================================
// TYPES
// ============================================================================

interface ExtensionApprovalTabProps {
  userLevel: number;
  userDepartmentId: string | null;
  onCountChange?: (count: number) => void;
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

// Kiểm tra file có phải là ảnh không
function isImageFile(fileName: string | null | undefined, url: string | null | undefined): boolean {
  const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'];
  
  // Kiểm tra từ tên file
  if (fileName) {
    const ext = fileName.split('.').pop()?.toLowerCase();
    if (ext && imageExtensions.includes(ext)) return true;
  }
  
  // Kiểm tra từ URL
  if (url) {
    const urlPath = url.split('?')[0]; // Remove query params
    const ext = urlPath.split('.').pop()?.toLowerCase();
    if (ext && imageExtensions.includes(ext)) return true;
  }
  
  return false;
}

// Lấy icon theo loại file
function getFileIcon(fileName: string | null | undefined) {
  if (!fileName) return <File size={16} className="text-gray-400" />;
  
  const ext = fileName.split('.').pop()?.toLowerCase();
  
  switch (ext) {
    case 'pdf':
      return <FileText size={16} className="text-red-500" />;
    case 'doc':
    case 'docx':
      return <FileText size={16} className="text-blue-500" />;
    case 'xls':
    case 'xlsx':
      return <FileSpreadsheet size={16} className="text-green-500" />;
    case 'jpg':
    case 'jpeg':
    case 'png':
    case 'gif':
    case 'webp':
      return <Image size={16} className="text-purple-500" />;
    default:
      return <File size={16} className="text-gray-400" />;
  }
}

function _getStatusBadge(status: string) {
  switch (status) {
    case 'pending':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-700 rounded-full">
          <Clock size={12} />
          Chờ duyệt
        </span>
      );
    case 'approved':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded-full">
          <CheckCircle size={12} />
          Đã duyệt
        </span>
      );
    case 'rejected':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 rounded-full">
          <XCircle size={12} />
          Từ chối
        </span>
      );
    default:
      return null;
  }
}

// ============================================================================
// IMAGE PREVIEW MODAL
// ============================================================================

interface ImagePreviewModalProps {
  imageUrl: string;
  fileName?: string;
  onClose: () => void;
}

function ImagePreviewModal({ imageUrl, fileName, onClose }: ImagePreviewModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div className="relative max-w-4xl max-h-[90vh] m-4" onClick={(e) => e.stopPropagation()}>
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute -top-10 right-0 p-2 text-white hover:text-gray-300 transition-colors"
        >
          <X size={24} />
        </button>
        
        {/* Image */}
        <img
          src={imageUrl}
          alt={fileName || 'Preview'}
          className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
        />
        
        {/* File name & download link */}
        <div className="absolute -bottom-10 left-0 right-0 flex items-center justify-between text-white text-sm">
          <span className="truncate">{fileName || 'Hình ảnh đính kèm'}</span>
          <a
            href={imageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-3 py-1 bg-white/20 rounded hover:bg-white/30 transition-colors"
          >
            <Download size={14} />
            Tải xuống
          </a>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// ATTACHMENT DISPLAY COMPONENT
// ============================================================================

interface AttachmentDisplayProps {
  url: string;
  fileName?: string | null;
}

function AttachmentDisplay({ url, fileName }: AttachmentDisplayProps) {
  const [showPreview, setShowPreview] = useState(false);
  const isImage = isImageFile(fileName, url);

  if (isImage) {
    return (
      <>
        {/* Image Thumbnail */}
        <div className="mb-3">
          <p className="text-xs text-gray-400 mb-2">File đính kèm:</p>
          <div 
            className="relative group cursor-pointer inline-block"
            onClick={() => setShowPreview(true)}
          >
            <img
              src={url}
              alt={fileName || 'Attachment'}
              className="max-w-[200px] max-h-[120px] object-cover rounded-lg border border-gray-200 shadow-sm"
            />
            {/* Hover overlay */}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
              <div className="flex items-center gap-1 text-white text-sm font-medium">
                <ZoomIn size={16} />
                Xem ảnh
              </div>
            </div>
          </div>
          {fileName && (
            <p className="text-xs text-gray-400 mt-1 truncate max-w-[200px]">{fileName}</p>
          )}
        </div>

        {/* Preview Modal */}
        {showPreview && (
          <ImagePreviewModal
            imageUrl={url}
            fileName={fileName || undefined}
            onClose={() => setShowPreview(false)}
          />
        )}
      </>
    );
  }

  // Non-image file - show download link
  return (
    <div className="mb-3">
      <p className="text-xs text-gray-400 mb-1">File đính kèm:</p>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-100 hover:border-gray-300 transition-colors"
      >
        {getFileIcon(fileName)}
        <span className="truncate max-w-[180px]">{fileName || 'File đính kèm'}</span>
        <ExternalLink size={14} className="text-gray-400 flex-shrink-0" />
      </a>
    </div>
  );
}

// ============================================================================
// APPROVAL CARD COMPONENT
// ============================================================================

interface ApprovalCardProps {
  request: ExtensionRequestWithDetails;
  onApprove: (id: string, comment?: string) => void;
  onReject: (id: string, comment?: string) => void;
  isProcessing: boolean;
}

function ApprovalCard({ request, onApprove, onReject, isProcessing }: ApprovalCardProps) {
  const [comment, setComment] = useState('');
  const [showActions, setShowActions] = useState(false);

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <Link
            to={`/tasks/${request.task_id}`}
            className="text-blue-600 hover:underline font-medium flex items-center gap-1"
          >
            {request.task_name}
            <ExternalLink size={14} />
          </Link>
          {request.task_code && (
            <p className="text-xs text-gray-400 mt-0.5">{request.task_code}</p>
          )}
        </div>
        <span className="text-xs text-gray-400">
          Lần {request.extension_number}/2
        </span>
      </div>

      {/* Info Grid */}
      <div className="grid grid-cols-2 gap-3 mb-3 text-sm">
        <div className="flex items-center gap-2 text-gray-600">
          <User size={14} className="text-gray-400" />
          <span>{request.requester_name}</span>
        </div>
        <div className="flex items-center gap-2 text-gray-600">
          <Building2 size={14} className="text-gray-400" />
          <span>{request.department_name || '-'}</span>
        </div>
      </div>

      {/* Date Change */}
      <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg mb-3">
        <div className="text-center">
          <p className="text-xs text-gray-400">Hạn cũ</p>
          <p className="font-medium text-gray-700">{formatDate(request.original_due_date)}</p>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="flex items-center gap-2">
            <div className="w-8 h-0.5 bg-gray-300" />
            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded">
              +{request.extension_days} ngày
            </span>
            <div className="w-8 h-0.5 bg-gray-300" />
          </div>
        </div>
        <div className="text-center">
          <p className="text-xs text-gray-400">Hạn mới</p>
          <p className="font-medium text-blue-600">{formatDate(request.requested_due_date)}</p>
        </div>
      </div>

      {/* Reason */}
      <div className="mb-3">
        <p className="text-xs text-gray-400 mb-1">Lý do:</p>
        <p className="text-sm text-gray-700 bg-gray-50 p-2 rounded">{request.reason}</p>
      </div>

      {/* Attachment - CẬP NHẬT: Dùng component mới */}
      {request.attachment_url && (
        <AttachmentDisplay
          url={request.attachment_url}
          fileName={request.attachment_name}
        />
      )}

      {/* Time */}
      <p className="text-xs text-gray-400 mb-3">
        <Clock size={12} className="inline mr-1" />
        Yêu cầu lúc: {formatDateTime(request.created_at)}
      </p>

      {/* Actions */}
      {!showActions ? (
        <div className="flex gap-2">
          <button
            onClick={() => setShowActions(true)}
            className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
          >
            Xem xét
          </button>
        </div>
      ) : (
        <div className="space-y-3 pt-3 border-t">
          {/* Comment input */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">
              Nhận xét (bắt buộc khi từ chối)
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Nhập nhận xét..."
              rows={2}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
            />
          </div>

          {/* Action buttons */}
          <div className="flex gap-2">
            <button
              onClick={() => setShowActions(false)}
              className="px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm"
              disabled={isProcessing}
            >
              Hủy
            </button>
            <button
              onClick={() => onReject(request.id, comment)}
              disabled={isProcessing}
              className="flex-1 px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isProcessing ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <XCircle size={16} />
              )}
              Từ chối
            </button>
            <button
              onClick={() => onApprove(request.id, comment)}
              disabled={isProcessing}
              className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isProcessing ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <CheckCircle size={16} />
              )}
              Duyệt
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function ExtensionApprovalTab({
  userLevel,
  userDepartmentId,
  onCountChange,
}: ExtensionApprovalTabProps) {
  const { user } = useAuthStore();
  const employeeId = user?.employee_id || '';
  const isExecutive = userLevel <= 3;

  // Fetch pending requests based on role
  const {
    data: pendingByApprover,
    isLoading: loadingByApprover,
  } = usePendingExtensionRequests(employeeId);

  const {
    data: pendingByDept,
    isLoading: loadingByDept,
  } = usePendingExtensionRequestsForManager(userDepartmentId || '');

  const {
    data: pendingAll,
    isLoading: loadingAll,
  } = useAllPendingExtensionRequests();

  // Mutation
  const approveMutation = useApproveExtensionRequest();

  // Determine which data to show
  let requests: ExtensionRequestWithDetails[] = [];
  let isLoading = false;

  if (isExecutive) {
    // Executive sees all pending requests
    requests = pendingAll || [];
    isLoading = loadingAll;
  } else if (userLevel <= 5) {
    // Manager sees requests in their department OR assigned to them
    const deptRequests = pendingByDept || [];
    const approverRequests = pendingByApprover || [];
    
    // Merge and deduplicate
    const merged = [...deptRequests];
    approverRequests.forEach((req) => {
      if (!merged.find((r) => r.id === req.id)) {
        merged.push(req);
      }
    });
    
    requests = merged;
    isLoading = loadingByApprover || loadingByDept;
  } else {
    // Employee - shouldn't see this tab but just in case
    requests = [];
  }

  // Notify parent of count change
  useEffect(() => {
    if (onCountChange) {
      onCountChange(requests.length);
    }
  }, [requests.length, onCountChange]);

  // Handle approve
  const handleApprove = async (requestId: string, comment?: string) => {
    try {
      await approveMutation.mutateAsync({
        id: requestId,
        status: 'approved',
        approver_id: employeeId,
        approver_comment: comment || undefined,
      });
    } catch (error) {
      console.error('Error approving:', error);
    }
  };

  // Handle reject
  const handleReject = async (requestId: string, comment?: string) => {
    if (!comment?.trim()) {
      alert('Vui lòng nhập lý do từ chối');
      return;
    }
    
    try {
      await approveMutation.mutateAsync({
        id: requestId,
        status: 'rejected',
        approver_id: employeeId,
        approver_comment: comment,
      });
    } catch (error) {
      console.error('Error rejecting:', error);
    }
  };

  // Loading
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        <span className="ml-3 text-gray-500">Đang tải...</span>
      </div>
    );
  }

  // Empty
  if (requests.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
          <Calendar className="w-8 h-8 text-gray-400" />
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-1">
          Không có yêu cầu gia hạn
        </h3>
        <p className="text-gray-500">
          Hiện tại không có yêu cầu gia hạn nào cần phê duyệt.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-gray-900">
          Yêu cầu gia hạn chờ duyệt ({requests.length})
        </h3>
      </div>

      {/* List */}
      <div className="grid gap-4 md:grid-cols-2">
        {requests.map((request) => (
          <ApprovalCard
            key={request.id}
            request={request}
            onApprove={handleApprove}
            onReject={handleReject}
            isProcessing={approveMutation.isPending}
          />
        ))}
      </div>
    </div>
  );
}

export default ExtensionApprovalTab;