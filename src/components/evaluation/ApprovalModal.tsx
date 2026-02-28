// ============================================================================
// PHASE 4.3.2: APPROVAL MODAL COMPONENT
// File: src/components/evaluation/ApprovalModal.tsx
// Huy Anh ERP System
// ============================================================================

import React, { useState, useEffect } from 'react';
import {
  type ApproveTaskInput,
  type RejectTaskInput,
  type RequestInfoInput,
  type SelfEvaluationWithRelations,
  type PendingApprovalItem,
  calculateRating,
} from '../../types/evaluation.types';
import { ScoreInput } from './ScoreInput';
import { RatingBadge, ScoreBadge, ProgressRing } from './RatingBadge';

// ============================================================================
// TYPES
// ============================================================================

type ApprovalMode = 'approve' | 'reject' | 'request_info' | 'view';

interface ApprovalModalProps {
  isOpen: boolean;
  onClose: () => void;
  
  // Data
  item: SelfEvaluationWithRelations | PendingApprovalItem | null;
  approverId: string;
  
  // Mode - determines which form to show
  initialMode?: ApprovalMode;
  
  // Callbacks
  onApprove?: (data: ApproveTaskInput) => Promise<void>;
  onReject?: (data: RejectTaskInput) => Promise<void>;
  onRequestInfo?: (data: RequestInfoInput) => Promise<void>;
  
  // State
  isLoading?: boolean;
  error?: string;
}

// Normalized item type - matches evaluation.types.ts schema
interface NormalizedItem {
  id: string;
  task_id: string;
  task_code: string;
  task_name: string;
  employee_id: string;
  employee_name: string;
  department_name: string;
  self_score: number | null;
  completion_percentage: number;
  quality_assessment?: string | null;
  achievements?: string | null;
  difficulties?: string | null;
  solutions?: string | null;
  recommendations?: string | null;
  submitted_at?: string | null;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const normalizeItem = (item: SelfEvaluationWithRelations | PendingApprovalItem): NormalizedItem => {
  if ('task_code' in item) {
    // PendingApprovalItem
    return {
      id: item.id,
      task_id: item.task_id,
      task_code: item.task_code,
      task_name: item.task_name,
      employee_id: item.employee_id,
      employee_name: item.employee_name,
      department_name: item.department_name,
      self_score: item.self_score,
      completion_percentage: item.completion_percentage,
      submitted_at: item.evaluation_date, // PendingApprovalItem uses evaluation_date
    };
  }
  
  // SelfEvaluationWithRelations - using correct property names from evaluation.types.ts
  return {
    id: item.id,
    task_id: item.task_id,
    task_code: item.task?.code || '',
    task_name: item.task?.name || item.task?.title || '',
    employee_id: item.employee_id,
    employee_name: item.employee?.full_name || '',
    department_name: item.employee?.department?.name || '',
    self_score: item.self_score,
    completion_percentage: item.completion_percentage,
    quality_assessment: item.quality_assessment,
    achievements: item.achievements,
    difficulties: item.difficulties,
    solutions: item.solutions,           // FIXED: was solutions_applied
    recommendations: item.recommendations,
    submitted_at: item.submitted_at,      // FIXED: was evaluation_date
  };
};

// ============================================================================
// COMPONENT
// ============================================================================

export const ApprovalModal: React.FC<ApprovalModalProps> = ({
  isOpen,
  onClose,
  item,
  approverId,
  initialMode = 'view',
  onApprove,
  onReject,
  onRequestInfo,
  isLoading = false,
  error,
}) => {
  // State
  const [mode, setMode] = useState<ApprovalMode>(initialMode);
  const [score, setScore] = useState<number | null>(null);
  const [comments, setComments] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [additionalRequest, setAdditionalRequest] = useState('');
  const [additionalDeadline, setAdditionalDeadline] = useState('');
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset form when item changes or modal opens
  useEffect(() => {
    if (isOpen && item) {
      setMode(initialMode);
      setScore(null);
      setComments('');
      setRejectionReason('');
      setAdditionalRequest('');
      setAdditionalDeadline('');
      setValidationErrors({});
    }
  }, [isOpen, item, initialMode]);

  // Don't render if not open or no item
  if (!isOpen || !item) return null;

  const normalized = normalizeItem(item);
  // const calculatedRating = score !== null ? calculateRating(score) : null;

  // Validate form based on mode
  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (mode === 'approve') {
      if (score === null) {
        errors.score = 'Vui lòng nhập điểm đánh giá';
      } else if (score < 0 || score > 100) {
        errors.score = 'Điểm phải từ 0 đến 100';
      }
    }

    if (mode === 'reject') {
      if (!rejectionReason.trim()) {
        errors.rejectionReason = 'Vui lòng nhập lý do từ chối';
      }
    }

    if (mode === 'request_info') {
      if (!additionalRequest.trim()) {
        errors.additionalRequest = 'Vui lòng nhập nội dung yêu cầu bổ sung';
      }
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Handle submit
  const handleSubmit = async () => {
    if (!validateForm()) return;

    setIsSubmitting(true);
    try {
      switch (mode) {
        case 'approve':
          if (onApprove && score !== null) {
            await onApprove({
              task_id: normalized.task_id,
              approver_id: approverId,
              score,
              comments: comments || undefined,
            });
          }
          break;

        case 'reject':
          if (onReject) {
            await onReject({
              task_id: normalized.task_id,
              approver_id: approverId,
              rejection_reason: rejectionReason,
              comments: comments || undefined,
            });
          }
          break;

        case 'request_info':
          if (onRequestInfo) {
            await onRequestInfo({
              task_id: normalized.task_id,
              approver_id: approverId,
              additional_request: additionalRequest,
              additional_deadline: additionalDeadline || undefined,
              comments: comments || undefined,
            });
          }
          break;
      }
      onClose();
    } catch (err) {
      console.error('Submit error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const loading = isLoading || isSubmitting;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              {mode === 'view' && 'Chi tiết tự đánh giá'}
              {mode === 'approve' && 'Phê duyệt công việc'}
              {mode === 'reject' && 'Từ chối công việc'}
              {mode === 'request_info' && 'Yêu cầu bổ sung thông tin'}
            </h2>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="px-6 py-4 overflow-y-auto max-h-[60vh]">
            {/* Error Message */}
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-red-700 text-sm">{error}</p>
              </div>
            )}

            {/* Task & Employee Info */}
            <div className="bg-gray-50 rounded-lg p-4 mb-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-500 mb-1">Công việc</p>
                  <p className="font-medium text-gray-900">{normalized.task_name}</p>
                  <p className="text-xs text-gray-500">{normalized.task_code}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Nhân viên</p>
                  <p className="font-medium text-gray-900">{normalized.employee_name}</p>
                  <p className="text-xs text-gray-500">{normalized.department_name}</p>
                </div>
              </div>
            </div>

            {/* Self-Evaluation Summary */}
            <div className="mb-6">
              <h3 className="text-sm font-medium text-gray-700 mb-3">Tự đánh giá của nhân viên</h3>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <ProgressRing percentage={normalized.completion_percentage} size={48} strokeWidth={4} />
                  <p className="text-xs text-gray-500 mt-2">Hoàn thành</p>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <ScoreBadge score={normalized.self_score} size="lg" />
                  <p className="text-xs text-gray-500 mt-2">Điểm tự ĐG</p>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <RatingBadge 
                    rating={normalized.self_score !== null ? calculateRating(normalized.self_score) : null} 
                    size="md" 
                  />
                  <p className="text-xs text-gray-500 mt-2">Xếp loại</p>
                </div>
              </div>

              {/* Additional details if available */}
              {normalized.quality_assessment && (
                <div className="mt-3 text-sm">
                  <span className="text-gray-500">Chất lượng:</span>
                  <span className="ml-2 font-medium">{normalized.quality_assessment}</span>
                </div>
              )}

              {normalized.achievements && (
                <div className="mt-3">
                  <p className="text-xs text-gray-500 mb-1">Kết quả đạt được:</p>
                  <p className="text-sm text-gray-700 bg-gray-50 p-2 rounded">{normalized.achievements}</p>
                </div>
              )}
              
              {normalized.difficulties && (
                <div className="mt-3">
                  <p className="text-xs text-gray-500 mb-1">Khó khăn gặp phải:</p>
                  <p className="text-sm text-gray-700 bg-gray-50 p-2 rounded">{normalized.difficulties}</p>
                </div>
              )}

              {normalized.solutions && (
                <div className="mt-3">
                  <p className="text-xs text-gray-500 mb-1">Giải pháp đã áp dụng:</p>
                  <p className="text-sm text-gray-700 bg-gray-50 p-2 rounded">{normalized.solutions}</p>
                </div>
              )}

              {normalized.recommendations && (
                <div className="mt-3">
                  <p className="text-xs text-gray-500 mb-1">Đề xuất, kiến nghị:</p>
                  <p className="text-sm text-gray-700 bg-gray-50 p-2 rounded">{normalized.recommendations}</p>
                </div>
              )}
            </div>

            {/* Mode-specific forms */}
            {mode === 'approve' && (
              <div className="space-y-4 border-t border-gray-200 pt-4">
                <h3 className="text-sm font-medium text-gray-700">Đánh giá của quản lý</h3>
                
                {/* Score Input */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Điểm đánh giá <span className="text-red-500">*</span>
                  </label>
                  <ScoreInput
                    value={score}
                    onChange={setScore}
                    showSlider
                    showRating
                    disabled={loading}
                    error={validationErrors.score}
                  />
                </div>

                {/* Comments */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Nhận xét
                  </label>
                  <textarea
                    value={comments}
                    onChange={(e) => setComments(e.target.value)}
                    disabled={loading}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                    placeholder="Nhận xét về kết quả công việc..."
                  />
                </div>
              </div>
            )}

            {mode === 'reject' && (
              <div className="space-y-4 border-t border-gray-200 pt-4">
                <h3 className="text-sm font-medium text-gray-700">Lý do từ chối</h3>
                
                {/* Rejection Reason */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Lý do <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    disabled={loading}
                    rows={3}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 ${
                      validationErrors.rejectionReason ? 'border-red-500' : 'border-gray-300'
                    }`}
                    placeholder="Nhập lý do từ chối đánh giá..."
                  />
                  {validationErrors.rejectionReason && (
                    <p className="mt-1 text-sm text-red-600">{validationErrors.rejectionReason}</p>
                  )}
                </div>

                {/* Additional Comments */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Ghi chú thêm
                  </label>
                  <textarea
                    value={comments}
                    onChange={(e) => setComments(e.target.value)}
                    disabled={loading}
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                    placeholder="Ghi chú thêm (tùy chọn)..."
                  />
                </div>
              </div>
            )}

            {mode === 'request_info' && (
              <div className="space-y-4 border-t border-gray-200 pt-4">
                <h3 className="text-sm font-medium text-gray-700">Yêu cầu bổ sung</h3>
                
                {/* Additional Request */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Nội dung yêu cầu <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={additionalRequest}
                    onChange={(e) => setAdditionalRequest(e.target.value)}
                    disabled={loading}
                    rows={3}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 ${
                      validationErrors.additionalRequest ? 'border-red-500' : 'border-gray-300'
                    }`}
                    placeholder="Mô tả thông tin cần bổ sung..."
                  />
                  {validationErrors.additionalRequest && (
                    <p className="mt-1 text-sm text-red-600">{validationErrors.additionalRequest}</p>
                  )}
                </div>

                {/* Deadline */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Hạn bổ sung
                  </label>
                  <input
                    type="date"
                    value={additionalDeadline}
                    onChange={(e) => setAdditionalDeadline(e.target.value)}
                    disabled={loading}
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                  />
                </div>

                {/* Comments */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Ghi chú thêm
                  </label>
                  <textarea
                    value={comments}
                    onChange={(e) => setComments(e.target.value)}
                    disabled={loading}
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                    placeholder="Ghi chú thêm (tùy chọn)..."
                  />
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
            {mode === 'view' ? (
              /* View mode - show action buttons */
              <div className="flex items-center justify-between">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Đóng
                </button>
                <div className="flex items-center gap-2">
                  {onRequestInfo && (
                    <button
                      onClick={() => setMode('request_info')}
                      className="px-4 py-2 text-orange-700 bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100"
                    >
                      Yêu cầu bổ sung
                    </button>
                  )}
                  {onReject && (
                    <button
                      onClick={() => setMode('reject')}
                      className="px-4 py-2 text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100"
                    >
                      Từ chối
                    </button>
                  )}
                  {onApprove && (
                    <button
                      onClick={() => setMode('approve')}
                      className="px-4 py-2 text-white bg-green-600 rounded-lg hover:bg-green-700"
                    >
                      Phê duyệt
                    </button>
                  )}
                </div>
              </div>
            ) : (
              /* Form mode - show submit/cancel */
              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={() => setMode('view')}
                  disabled={loading}
                  className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                >
                  Quay lại
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={loading}
                  className={`px-4 py-2 text-white rounded-lg disabled:opacity-50 flex items-center gap-2 ${
                    mode === 'approve' ? 'bg-green-600 hover:bg-green-700' :
                    mode === 'reject' ? 'bg-red-600 hover:bg-red-700' :
                    'bg-orange-600 hover:bg-orange-700'
                  }`}
                >
                  {loading && (
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  )}
                  {mode === 'approve' && 'Xác nhận phê duyệt'}
                  {mode === 'reject' && 'Xác nhận từ chối'}
                  {mode === 'request_info' && 'Gửi yêu cầu'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// EXPORTS
// ============================================================================

export default ApprovalModal;