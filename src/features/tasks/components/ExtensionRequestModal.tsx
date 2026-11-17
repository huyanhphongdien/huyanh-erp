// ============================================================================
// EXTENSION REQUEST MODAL
// File: src/features/tasks/components/ExtensionRequestModal.tsx
// Huy Anh ERP - Modal xin gia hạn công việc
// ============================================================================

import { useState, useEffect } from 'react';
import { X, Calendar, Upload, Loader2, AlertTriangle, CheckCircle, User } from 'lucide-react';
import { useAuthStore } from '../../../stores/authStore';
import {
  useCanRequestExtension,
  useExtensionApprover,
  useCreateExtensionRequest,
  useCreateAndAutoApproveExtension,
  useUploadExtensionAttachment,
} from '../hooks/useExtensionRequests';
import { fmtDate } from '../../../utils/format';
import { dichLoiHeThong } from '../../../utils/dichLoiHeThong';
import { dayOf } from '../../../services/taskScoring';

// ============================================================================
// TYPES
// ============================================================================

interface ExtensionRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: {
    id: string;
    name: string;
    code?: string;
    due_date: string;
  };
  onSuccess?: () => void;
}

// ============================================================================
// HELPERS
// ============================================================================

const formatDate = fmtDate;

function calculateDays(fromDate: string, toDate: string): number {
  const from = new Date(fromDate);
  const to = new Date(toDate);
  return Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

// ============================================================================
// COMPONENT
// ============================================================================

export function ExtensionRequestModal({
  isOpen,
  onClose,
  task,
  onSuccess,
}: ExtensionRequestModalProps) {
  const { user } = useAuthStore();
  const employeeId = user?.employee_id || '';
  const userLevel = user?.position_level || 6;

  // Form state
  const [requestedDate, setRequestedDate] = useState('');
  const [reason, setReason] = useState('');
  const [attachment, setAttachment] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Queries
  const { data: canRequestData, isLoading: checkingEligibility } = useCanRequestExtension(
    task.id,
    employeeId
  );
  const { data: approverData, isLoading: loadingApprover } = useExtensionApprover(employeeId);

  // Mutations
  const createMutation = useCreateExtensionRequest();
  const autoApproveMutation = useCreateAndAutoApproveExtension();
  const uploadMutation = useUploadExtensionAttachment();

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setRequestedDate('');
      setReason('');
      setAttachment(null);
      setError(null);
    }
  }, [isOpen]);

  // Ngày lịch VN của hạn hiện tại. due_date là timestamptz: cắt 10 ký tự (`slice(0, 10)`) ra ngày UTC — hạn lưu giờ thật
  // từ 17h UTC (= từ 0h hôm sau giờ VN) bị lùi 1 ngày, ô chọn cho phép chọn ngày TRƯỚC hạn thật.
  const dueDay = dayOf(task.due_date);

  // Calculate extension days (so ngày lịch với ngày lịch — cùng mốc với `min` của ô chọn)
  const extensionDays = requestedDate
    ? calculateDays(dueDay || task.due_date, requestedDate)
    : 0;

  // Check if self-approve (Executive)
  const isSelfApprove = approverData?.approval_type === 'self';

  // Handle file change
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        setError('File không được vượt quá 10MB');
        return;
      }
      setAttachment(file);
      setError(null);
    }
  };

  // Handle submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!requestedDate) {
      setError('Vui lòng chọn ngày gia hạn');
      return;
    }

    if (extensionDays <= 0) {
      setError('Ngày gia hạn phải sau hạn hiện tại');
      return;
    }

    if (!reason.trim()) {
      setError('Vui lòng nhập lý do xin gia hạn');
      return;
    }

    if (reason.trim().length < 10) {
      setError('Lý do phải có ít nhất 10 ký tự');
      return;
    }

    if (!approverData) {
      setError('Không xác định được người phê duyệt');
      return;
    }

    try {
      // Upload attachment if exists
      let attachmentUrl: string | null = null;
      let attachmentName: string | null = null;

      if (attachment) {
        const uploadResult = await uploadMutation.mutateAsync({
          file: attachment,
          requesterId: employeeId,
        });
        attachmentUrl = uploadResult.url;
        attachmentName = uploadResult.name;
      }

      // Prepare input
      const input = {
        task_id: task.id,
        requester_id: employeeId,
        requester_level: userLevel,
        original_due_date: task.due_date,
        requested_due_date: requestedDate,
        reason: reason.trim(),
        attachment_url: attachmentUrl,
        attachment_name: attachmentName,
        approver_id: approverData.approver_id,
        extension_number: (canRequestData?.current_count || 0) + 1,
      };

      // Submit
      if (isSelfApprove) {
        await autoApproveMutation.mutateAsync(input);
      } else {
        await createMutation.mutateAsync(input);
      }

      // Success
      onSuccess?.();
      onClose();
    } catch (err: any) {
      setError(dichLoiHeThong(err, 'Gửi yêu cầu gia hạn thất bại'));
    }
  };

  // Loading state
  const isLoading =
    checkingEligibility ||
    loadingApprover ||
    createMutation.isPending ||
    autoApproveMutation.isPending ||
    uploadMutation.isPending;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              📅 Xin gia hạn công việc
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {task.code && `${task.code} - `}{task.name}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {/* Check eligibility */}
          {checkingEligibility ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
              <span className="ml-2 text-gray-500">Đang kiểm tra...</span>
            </div>
          ) : canRequestData && !canRequestData.can_request ? (
            <div className="py-8">
              <div className="flex flex-col items-center text-center">
                <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-3">
                  <AlertTriangle className="w-6 h-6 text-red-600" />
                </div>
                <h3 className="font-medium text-gray-900 mb-1">
                  Không thể xin gia hạn
                </h3>
                <p className="text-gray-500">{canRequestData.reason}</p>
                <p className="text-sm text-gray-400 mt-2">
                  Đã gia hạn: {canRequestData.current_count}/{canRequestData.max_count} lần
                </p>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Current due date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Hạn hiện tại
                </label>
                <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-700">
                  {formatDate(task.due_date)}
                </div>
              </div>

              {/* Requested due date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Hạn mới yêu cầu <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="date"
                    value={requestedDate}
                    onChange={(e) => setRequestedDate(e.target.value)}
                    min={dueDay ?? undefined /* ô date chỉ nhận 'YYYY-MM-DD' — ngày lịch VN qua dayOf (taskScoring) */}
                    className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>
                {extensionDays > 0 && (
                  <p className="text-sm text-blue-600 mt-1">
                    + {extensionDays} ngày so với hạn hiện tại
                  </p>
                )}
              </div>

              {/* Reason */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Lý do xin gia hạn <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Nhập lý do chi tiết..."
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                  required
                />
                <p className="text-xs text-gray-400 mt-1">
                  Tối thiểu 10 ký tự ({reason.length}/10)
                </p>
              </div>

              {/* Attachment */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  File đính kèm (tùy chọn)
                </label>
                <div className="relative">
                  <input
                    type="file"
                    onChange={handleFileChange}
                    className="hidden"
                    id="extension-attachment"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                  />
                  <label
                    htmlFor="extension-attachment"
                    className="flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
                  >
                    <Upload size={20} className="text-gray-400" />
                    <span className="text-gray-600">
                      {attachment ? attachment.name : 'Chọn file minh chứng'}
                    </span>
                  </label>
                </div>
                {attachment && (
                  <div className="flex items-center justify-between mt-2 px-3 py-2 bg-blue-50 rounded-lg">
                    <span className="text-sm text-blue-700 truncate">
                      {attachment.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => setAttachment(null)}
                      className="text-blue-600 hover:text-blue-800"
                    >
                      <X size={16} />
                    </button>
                  </div>
                )}
                <p className="text-xs text-gray-400 mt-1">
                  PDF, Word, Excel, Hình ảnh. Tối đa 10MB.
                </p>
              </div>

              {/* Approver info */}
              {approverData && (
                <div className="p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <User size={16} className="text-gray-400" />
                    <span className="text-sm text-gray-600">
                      {isSelfApprove ? (
                        <span className="text-green-600 font-medium">
                          Tự động duyệt (Ban Giám đốc)
                        </span>
                      ) : (
                        <>
                          Người phê duyệt:{' '}
                          <span className="font-medium text-gray-900">
                            {approverData.approver_name}
                          </span>
                        </>
                      )}
                    </span>
                  </div>
                </div>
              )}

              {/* Extension count info */}
              {canRequestData && (
                <div className="text-sm text-gray-500">
                  Số lần đã gia hạn: {canRequestData.current_count}/{canRequestData.max_count}
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  {error}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  disabled={isLoading}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isLoading || !canRequestData?.can_request}
                  className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isLoading ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      Đang xử lý...
                    </>
                  ) : isSelfApprove ? (
                    <>
                      <CheckCircle size={18} />
                      Gia hạn ngay
                    </>
                  ) : (
                    'Gửi yêu cầu'
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default ExtensionRequestModal;