// ============================================================================
// APPROVALS PAGE - WITH PERMISSION FILTERING & EXTENSION REQUESTS
// File: src/pages/evaluations/ApprovalPage.tsx
// Huy Anh ERP System
// ============================================================================
// CẬP NHẬT v2:
// - Tab "Hoàn thành chưa tự đánh giá": hiển thị badge QUÁ HẠN đỏ
// - Task overdue nổi lên đầu danh sách
// - Nút phê duyệt nhanh đổi màu đỏ cho task quá hạn
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { usePermissions } from '../../hooks/usePermissions';
import {
  approvalService,
  type PendingEvaluation,
  type CompletedTaskWithoutEval,
  type ApprovalStats,
  type ApprovalPermissionContext,
} from '../../services/approvalService';
import {
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  AlertOctagon,
  User,
  Calendar,
  Star,
  ChevronRight,
  Shield,
  Ban,
  CalendarClock,
} from 'lucide-react';
import { ExtensionApprovalTab } from '../../features/tasks/components/ExtensionApprovalTab';
import { extensionService } from '../../services/extensionService';

// ============================================================================
// CONSTANTS
// ============================================================================

const RATING_LABELS: Record<string, string> = {
  excellent: 'Xuất sắc',
  good: 'Tốt',
  average: 'Trung bình',
  below_average: 'Cần cải thiện',
};

// ============================================================================
// TYPES
// ============================================================================

type TabType = 'pending' | 'no-self-evaluation' | 'extensions';

interface ApprovalModalData {
  type: 'approve' | 'reject' | 'revision' | 'quick-approve';
  item: PendingEvaluation | CompletedTaskWithoutEval;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getRatingLabel(rating: string | null): string {
  if (!rating) return '—';
  return RATING_LABELS[rating] || rating;
}

function getRatingBgColor(rating: string | null): string {
  if (!rating) return 'bg-gray-100 text-gray-600';
  const colors: Record<string, string> = {
    excellent: 'bg-green-100 text-green-700',
    good: 'bg-blue-100 text-blue-700',
    average: 'bg-yellow-100 text-yellow-700',
    below_average: 'bg-red-100 text-red-700',
  };
  return colors[rating] || 'bg-gray-100 text-gray-600';
}

function getScoreRating(score: number): string {
  if (score >= 90) return 'Xuất sắc';
  if (score >= 70) return 'Tốt';
  if (score >= 50) return 'Trung bình';
  return 'Cần cải thiện';
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/** Tính số ngày trễ so với due_date */
function calcDaysOverdue(dueDateStr: string | null): number {
  if (!dueDateStr) return 0;
  const due = new Date(dueDateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((today.getTime() - due.getTime()) / 86_400_000);
}

function PriorityBadge({ priority }: { priority: string }) {
  const colors: Record<string, string> = {
    low: 'bg-gray-100 text-gray-600',
    medium: 'bg-blue-100 text-blue-600',
    high: 'bg-orange-100 text-orange-600',
    urgent: 'bg-red-100 text-red-600',
  };
  const labels: Record<string, string> = {
    low: 'Thấp',
    medium: 'Trung bình',
    high: 'Cao',
    urgent: 'Khẩn cấp',
  };
  return (
    <span className={'px-2 py-1 text-xs font-medium rounded-full ' + (colors[priority] || 'bg-gray-100')}>
      {labels[priority] || priority}
    </span>
  );
}

// ============================================================================
// NO PERMISSION COMPONENT
// ============================================================================

function NoPermissionMessage() {
  const navigate = useNavigate();
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="text-center max-w-md">
        <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <Ban className="w-10 h-10 text-red-500" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Không có quyền truy cập</h2>
        <p className="text-gray-500 mb-6">
          Bạn không có quyền phê duyệt công việc. Chức năng này chỉ dành cho Quản lý (Trưởng phòng trở lên).
        </p>
        <button
          onClick={() => navigate('/my-tasks')}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Đi đến Công việc của tôi
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const ApprovalsPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { group, isAdmin } = usePermissions();

  const [activeTab, setActiveTab] = useState<TabType>('pending');
  const [pendingEvaluations, setPendingEvaluations] = useState<PendingEvaluation[]>([]);
  const [completedWithoutEval, setCompletedWithoutEval] = useState<CompletedTaskWithoutEval[]>([]);
  const [stats, setStats] = useState<ApprovalStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [extensionCount, setExtensionCount] = useState(0);

  const [modalData, setModalData] = useState<ApprovalModalData | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    score: 80,
    comments: '',
    rejection_reason: '',
    revision_request: '',
  });

  const permissionContext: ApprovalPermissionContext = {
    userLevel: user?.position_level || 6,
    userDepartmentId: user?.department_id || '',
    isAdmin: isAdmin,
  };

  const hasApprovalRights = isAdmin || group === 'executive' || group === 'manager';

  const fetchExtensionCount = useCallback(async () => {
    if (!user?.employee_id || !hasApprovalRights) return;
    try {
      const count = await extensionService.countPendingRequestsByRole(
        user.employee_id,
        user.position_level || 6,
        user.department_id || null
      );
      setExtensionCount(count);
    } catch {
      setExtensionCount(0);
    }
  }, [user?.employee_id, user?.position_level, user?.department_id, hasApprovalRights]);

  useEffect(() => {
    if (hasApprovalRights) {
      loadData();
      fetchExtensionCount();
    } else {
      setIsLoading(false);
    }
  }, [hasApprovalRights, fetchExtensionCount]);

  const loadData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const pendingResult = await approvalService.getPendingEvaluations(permissionContext);
      if (pendingResult.error) throw pendingResult.error;
      setPendingEvaluations(pendingResult.data);

      const completedResult = await approvalService.getCompletedWithoutEvaluation(permissionContext);
      if (completedResult.error) throw completedResult.error;
      setCompletedWithoutEval(completedResult.data);

      const statsResult = await approvalService.getApprovalStats(permissionContext);
      setStats(statsResult);
    } catch (err: any) {
      setError(err.message || 'Không thể tải dữ liệu');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefreshAll = () => { loadData(); fetchExtensionCount(); };
  const handleExtensionCountChange = (count: number) => setExtensionCount(count);

  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  const handleApprove = async () => {
    if (!modalData || !user?.employee_id) return;
    setIsSubmitting(true);
    try {
      const item = modalData.item as PendingEvaluation;
      const permCheck = await approvalService.checkApprovalPermission(item.task_id, permissionContext);
      if (!permCheck.canApprove) throw new Error(permCheck.reason || 'Không có quyền phê duyệt');
      const result = await approvalService.approve({
        self_evaluation_id: item.id,
        task_id: item.task_id,
        approver_id: user.employee_id,
        score: formData.score,
        comments: formData.comments,
      });
      if (!result.success) throw new Error(result.error?.message || 'Không thể phê duyệt');
      setSuccessMessage('Đã phê duyệt thành công!');
      setModalData(null); resetForm(); loadData();
    } catch (err: any) {
      setError(err.message || 'Không thể phê duyệt');
    } finally { setIsSubmitting(false); }
  };

  const handleReject = async () => {
    if (!modalData || !user?.employee_id || !formData.rejection_reason) return;
    setIsSubmitting(true);
    try {
      const item = modalData.item as PendingEvaluation;
      const permCheck = await approvalService.checkApprovalPermission(item.task_id, permissionContext);
      if (!permCheck.canApprove) throw new Error(permCheck.reason || 'Không có quyền từ chối');
      const result = await approvalService.reject({
        self_evaluation_id: item.id,
        task_id: item.task_id,
        approver_id: user.employee_id,
        rejection_reason: formData.rejection_reason,
        comments: formData.comments,
      });
      if (!result.success) throw new Error(result.error?.message);
      setSuccessMessage('Đã từ chối thành công!');
      setModalData(null); resetForm(); loadData();
    } catch (err: any) {
      setError(err.message);
    } finally { setIsSubmitting(false); }
  };

  const handleRequestRevision = async () => {
    if (!modalData || !user?.employee_id || !formData.revision_request) return;
    setIsSubmitting(true);
    try {
      const item = modalData.item as PendingEvaluation;
      const permCheck = await approvalService.checkApprovalPermission(item.task_id, permissionContext);
      if (!permCheck.canApprove) throw new Error(permCheck.reason);
      const result = await approvalService.requestRevision({
        self_evaluation_id: item.id,
        task_id: item.task_id,
        approver_id: user.employee_id,
        revision_request: formData.revision_request,
      });
      if (!result.success) throw new Error(result.error?.message);
      setSuccessMessage('Đã yêu cầu chỉnh sửa!');
      setModalData(null); resetForm(); loadData();
    } catch (err: any) {
      setError(err.message);
    } finally { setIsSubmitting(false); }
  };

  const handleQuickApprove = async () => {
    if (!modalData || !user?.employee_id) return;
    setIsSubmitting(true);
    try {
      const item = modalData.item as CompletedTaskWithoutEval;
      if (!item.assignee_id) throw new Error('Công việc chưa có người thực hiện');
      const permCheck = await approvalService.checkApprovalPermission(item.id, permissionContext);
      if (!permCheck.canApprove) throw new Error(permCheck.reason);
      const result = await approvalService.quickApprove({
        task_id: item.id,
        employee_id: item.assignee_id,
        approver_id: user.employee_id,
        score: formData.score,
        comments: formData.comments,
      });
      if (!result.success) throw new Error(result.error?.message);
      setSuccessMessage('Đã phê duyệt nhanh thành công!');
      setModalData(null); resetForm(); loadData();
    } catch (err: any) {
      setError(err.message);
    } finally { setIsSubmitting(false); }
  };

  const resetForm = () => setFormData({ score: 80, comments: '', rejection_reason: '', revision_request: '' });

  const openModal = (type: ApprovalModalData['type'], item: PendingEvaluation | CompletedTaskWithoutEval) => {
    if ('self_score' in item && item.self_score) {
      setFormData(prev => ({ ...prev, score: item.self_score! }));
    }
    setModalData({ type, item });
  };

  const getPendingCardClass = () => {
    const base = 'rounded-lg border-2 p-4';
    return stats && stats.pending_evaluations > 0 ? base + ' bg-orange-50 border-orange-200' : base + ' bg-white border-gray-100';
  };
  const getCompletedCardClass = () => {
    const base = 'rounded-lg border-2 p-4';
    return stats && stats.completed_without_eval > 0 ? base + ' bg-yellow-50 border-yellow-200' : base + ' bg-white border-gray-100';
  };
  const getExtensionCardClass = () => {
    const base = 'rounded-lg border-2 p-4';
    return extensionCount > 0 ? base + ' bg-purple-50 border-purple-200' : base + ' bg-white border-gray-100';
  };

  if (!hasApprovalRights) return <div className="p-6"><NoPermissionMessage /></div>;

  // Đếm task overdue trong tab để hiển thị số đỏ
  const overdueCount = completedWithoutEval.filter(t => (t as any).overdue_flagged).length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">Phê duyệt công việc</h1>
            <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full ${
              group === 'executive' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
            }`}>
              <Shield className="w-3 h-3" />
              {group === 'executive' ? 'Toàn công ty' : 'Phòng ban'}
            </span>
          </div>
          <p className="text-gray-500 mt-1">
            {group === 'executive'
              ? 'Xem xét và phê duyệt công việc của toàn bộ nhân viên'
              : 'Xem xét và phê duyệt công việc của nhân viên trong phòng ban'}
          </p>
        </div>
        <button
          onClick={handleRefreshAll}
          disabled={isLoading}
          className="inline-flex items-center gap-2 px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          Làm mới
        </button>
      </div>

      {/* Permission Notice */}
      {group === 'manager' && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
          <Shield className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-blue-800 font-medium">Phạm vi phê duyệt</p>
            <p className="text-blue-600 text-sm mt-1">
              Bạn chỉ có thể phê duyệt công việc trong phòng ban của mình.
              Công việc do Ban Giám đốc tạo sẽ được Ban Giám đốc phê duyệt.
            </p>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className={getPendingCardClass()}>
            <p className="text-sm text-gray-500">Chờ phê duyệt</p>
            <p className={'text-2xl font-bold ' + (stats.pending_evaluations > 0 ? 'text-orange-600' : 'text-gray-900')}>
              {stats.pending_evaluations}
            </p>
          </div>
          <div className={getCompletedCardClass()}>
            <p className="text-sm text-gray-500">Chưa tự đánh giá</p>
            <p className={'text-2xl font-bold ' + (stats.completed_without_eval > 0 ? 'text-yellow-600' : 'text-gray-900')}>
              {stats.completed_without_eval}
            </p>
            {/* Badge đếm task quá hạn trong stats card */}
            {overdueCount > 0 && (
              <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                <AlertOctagon className="w-3 h-3" />
                {overdueCount} quá hạn
              </p>
            )}
          </div>
          <div className={getExtensionCardClass()}>
            <p className="text-sm text-gray-500">Yêu cầu gia hạn</p>
            <p className={`text-2xl font-bold ${extensionCount > 0 ? 'text-purple-600' : 'text-gray-900'}`}>
              {extensionCount}
            </p>
          </div>
          <div className="rounded-lg border-2 p-4 bg-green-50 border-green-200">
            <p className="text-sm text-gray-500">Đã duyệt (tuần)</p>
            <p className="text-2xl font-bold text-green-600">{stats.approved_this_week}</p>
          </div>
          <div className="rounded-lg border-2 p-4 bg-white border-gray-100">
            <p className="text-sm text-gray-500">Từ chối (tuần)</p>
            <p className="text-2xl font-bold text-gray-900">{stats.rejected_this_week}</p>
          </div>
        </div>
      )}

      {/* Success Message */}
      {successMessage && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-green-500" />
          <p className="text-green-700">{successMessage}</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <XCircle className="w-5 h-5 text-red-500" />
          <p className="text-red-700">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto text-red-500 hover:text-red-700">✕</button>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-6">
          <button
            onClick={() => setActiveTab('pending')}
            className={'py-3 px-1 border-b-2 font-medium text-sm transition-colors ' +
              (activeTab === 'pending' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300')}
          >
            Chờ phê duyệt
            {pendingEvaluations.length > 0 && (
              <span className="ml-2 px-2 py-0.5 text-xs bg-orange-100 text-orange-700 rounded-full">
                {pendingEvaluations.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('no-self-evaluation')}
            className={'py-3 px-1 border-b-2 font-medium text-sm transition-colors ' +
              (activeTab === 'no-self-evaluation' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300')}
          >
            Hoàn thành chưa tự đánh giá
            {completedWithoutEval.length > 0 && (
              <span className={`ml-2 px-2 py-0.5 text-xs rounded-full ${
                overdueCount > 0 ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
              }`}>
                {completedWithoutEval.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('extensions')}
            className={'py-3 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-1.5 ' +
              (activeTab === 'extensions' ? 'border-purple-500 text-purple-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300')}
          >
            <CalendarClock className="w-4 h-4" />
            Yêu cầu gia hạn
            {extensionCount > 0 && (
              <span className="ml-1 px-2 py-0.5 text-xs bg-purple-100 text-purple-700 rounded-full">
                {extensionCount}
              </span>
            )}
          </button>
        </nav>
      </div>

      {/* Content */}
      {isLoading && activeTab !== 'extensions' ? (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-500">Đang tải...</span>
        </div>
      ) : (
        <>
          {/* Tab: Pending Evaluations */}
          {activeTab === 'pending' && (
            <div className="space-y-4">
              {pendingEvaluations.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-lg">
                  <CheckCircle className="w-12 h-12 text-green-300 mx-auto mb-3" />
                  <p className="text-gray-500">Không có đánh giá nào chờ phê duyệt</p>
                  {group === 'manager' && <p className="text-sm text-gray-400 mt-1">Trong phạm vi phòng ban của bạn</p>}
                </div>
              ) : (
                pendingEvaluations.map((item) => (
                  <div key={item.id} className="bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                    <div className="p-4">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                        <div className="flex-1">
                          <h3 className="font-medium text-gray-900">{item.task?.name || 'Công việc không xác định'}</h3>
                          <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-gray-500">
                            <span className="flex items-center gap-1"><User className="w-4 h-4" />{item.employee?.full_name}</span>
                            {item.task?.priority && <PriorityBadge priority={item.task.priority} />}
                            {item.task?.assigner && (
                              <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">Giao bởi: {item.task.assigner.full_name}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="text-right">
                            <p className="text-xs text-gray-500">Điểm tự chấm</p>
                            <p className="text-xl font-bold text-blue-600">{item.self_score}</p>
                          </div>
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${getRatingBgColor(item.quality_assessment)}`}>
                            {getRatingLabel(item.quality_assessment)}
                          </span>
                        </div>
                      </div>
                      {item.achievements && (
                        <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                          <p className="text-xs text-gray-500 mb-1">Thành tựu đạt được</p>
                          <p className="text-sm text-gray-700">{item.achievements}</p>
                        </div>
                      )}
                      <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-gray-500">
                        {item.task?.due_date && (
                          <span className="flex items-center gap-1"><Calendar className="w-4 h-4" />Hạn: {formatDate(item.task.due_date)}</span>
                        )}
                        <span className="flex items-center gap-1"><Clock className="w-4 h-4" />Đánh giá: {formatDate(item.created_at)}</span>
                      </div>
                      <div className="mt-4 flex flex-wrap items-center gap-2 pt-3 border-t">
                        <button onClick={() => openModal('approve', item)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-white bg-green-600 rounded-lg hover:bg-green-700">
                          <CheckCircle className="w-4 h-4" />Phê duyệt
                        </button>
                        <button onClick={() => openModal('revision', item)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-orange-700 bg-orange-100 rounded-lg hover:bg-orange-200">
                          <RefreshCw className="w-4 h-4" />Yêu cầu sửa
                        </button>
                        <button onClick={() => openModal('reject', item)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-700 bg-red-100 rounded-lg hover:bg-red-200">
                          <XCircle className="w-4 h-4" />Từ chối
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* ================================================================
              Tab: Completed Without Evaluation
              CẬP NHẬT: Hiển thị badge QUÁ HẠN + viền đỏ cho task overdue
              ================================================================ */}
          {activeTab === 'no-self-evaluation' && (
            <div className="space-y-4">
              {/* Banner tổng kết nếu có task quá hạn */}
              {overdueCount > 0 && (
                <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  <AlertOctagon className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>
                    Có <strong>{overdueCount}</strong> công việc đã quá hạn, nhân viên chưa cập nhật tiến độ.
                    Hiển thị ở đầu danh sách để ưu tiên xử lý.
                  </span>
                </div>
              )}

              {completedWithoutEval.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-lg">
                  <CheckCircle className="w-12 h-12 text-green-300 mx-auto mb-3" />
                  <p className="text-gray-500">Không có công việc hoàn thành nào chưa tự đánh giá</p>
                  {group === 'manager' && <p className="text-sm text-gray-400 mt-1">Trong phạm vi phòng ban của bạn</p>}
                </div>
              ) : (
                completedWithoutEval.map((item) => {
                  const isOverdue = (item as any).overdue_flagged === true;
                  const daysOverdue = isOverdue ? calcDaysOverdue(item.due_date) : 0;

                  return (
                    <div
                      key={item.id}
                      className={`bg-white rounded-lg border shadow-sm hover:shadow-md transition-shadow ${
                        isOverdue ? 'border-red-300' : 'border-yellow-200'
                      }`}
                    >
                      {/* Thanh đỏ trên cùng cho task quá hạn */}
                      {isOverdue && (
                        <div className="h-1 bg-red-500 rounded-t-lg" />
                      )}

                      <div className="p-4">
                        {/* Header */}
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-medium text-gray-900">{item.name}</h3>
                              {/* BADGE QUÁ HẠN */}
                              {isOverdue && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold bg-red-100 text-red-700 rounded-full border border-red-200">
                                  <AlertOctagon className="w-3 h-3" />
                                  Quá hạn
                                </span>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-gray-500">
                              <span className="flex items-center gap-1">
                                <User className="w-4 h-4" />
                                {item.assignee?.full_name || 'Chưa giao'}
                              </span>
                              {item.priority && <PriorityBadge priority={item.priority} />}
                              {item.assigner && (
                                <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">
                                  Giao bởi: {item.assigner.full_name}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Status badge */}
                          <div className="shrink-0">
                            {isOverdue ? (
                              <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-700 rounded-full border border-red-200">
                                Quá hạn · Chưa tự đánh giá
                              </span>
                            ) : (
                              <span className="px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-700 rounded-full">
                                Chưa tự đánh giá
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Task dates */}
                        <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-gray-500">
                          {item.due_date && (
                            <span className={`flex items-center gap-1 ${isOverdue ? 'text-red-600 font-medium' : ''}`}>
                              <Calendar className="w-4 h-4" />
                              Hạn: {formatDate(item.due_date)}
                              {isOverdue && daysOverdue > 0 && (
                                <span className="text-xs text-red-500 ml-1 font-normal">
                                  (trễ {daysOverdue} ngày)
                                </span>
                              )}
                            </span>
                          )}
                          {item.completed_date && (
                            <span className="flex items-center gap-1">
                              <CheckCircle className="w-4 h-4" />
                              Hoàn thành: {formatDate(item.completed_date)}
                            </span>
                          )}
                        </div>

                        {/* Notice */}
                        <div className={`mt-3 p-2.5 rounded-lg text-sm flex items-start gap-2 ${
                          isOverdue ? 'bg-red-50 text-red-700 border border-red-100' : 'bg-yellow-50 text-yellow-700'
                        }`}>
                          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                          <span>
                            {isOverdue
                              ? 'Công việc đã quá hạn, nhân viên chưa cập nhật tiến độ và chưa tự đánh giá. Bạn có thể phê duyệt nhanh.'
                              : 'Nhân viên chưa tự đánh giá. Bạn có thể phê duyệt nhanh hoặc chờ nhân viên tự đánh giá.'}
                          </span>
                        </div>

                        {/* Actions */}
                        <div className="mt-4 flex flex-wrap items-center gap-2 pt-3 border-t">
                          <button
                            onClick={() => openModal('quick-approve', item)}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-white rounded-lg ${
                              isOverdue ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'
                            }`}
                          >
                            <Star className="w-4 h-4" />
                            Phê duyệt nhanh
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* Tab: Extension Requests */}
          {activeTab === 'extensions' && (
            <ExtensionApprovalTab
              userLevel={user?.position_level || 6}
              userDepartmentId={user?.department_id || null}
              onCountChange={handleExtensionCountChange}
            />
          )}
        </>
      )}

      {/* Modal */}
      {modalData && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/50" onClick={() => { setModalData(null); resetForm(); }} />
            <div className="relative bg-white rounded-xl shadow-xl max-w-lg w-full p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  {modalData.type === 'approve' && <><CheckCircle className="w-5 h-5 text-green-500" />Phê duyệt đánh giá</>}
                  {modalData.type === 'reject' && <><XCircle className="w-5 h-5 text-red-500" />Từ chối đánh giá</>}
                  {modalData.type === 'revision' && <><RefreshCw className="w-5 h-5 text-orange-500" />Yêu cầu chỉnh sửa</>}
                  {modalData.type === 'quick-approve' && <><Star className="w-5 h-5 text-blue-500" />Phê duyệt nhanh</>}
                </h3>
                <button onClick={() => { setModalData(null); resetForm(); }} className="text-gray-400 hover:text-gray-600">✕</button>
              </div>

              <div className="bg-gray-50 rounded-lg p-4 mb-6">
                <p className="text-sm text-gray-500">Công việc</p>
                <p className="font-medium text-gray-900">
                  {'task' in modalData.item && modalData.item.task
                    ? modalData.item.task.name
                    : 'name' in modalData.item
                      ? modalData.item.name
                      : '—'}
                </p>
                {'employee' in modalData.item && modalData.item.employee && (
                  <div className="mt-2">
                    <p className="text-sm text-gray-500">Nhân viên thực hiện</p>
                    <p className="text-gray-900">{modalData.item.employee.full_name}</p>
                  </div>
                )}
                {'assignee' in modalData.item && modalData.item.assignee && (
                  <div className="mt-2">
                    <p className="text-sm text-gray-500">Nhân viên thực hiện</p>
                    <p className="text-gray-900">{modalData.item.assignee.full_name}</p>
                  </div>
                )}
                {'self_score' in modalData.item && modalData.item.self_score && (
                  <div className="mt-3 pt-3 border-t">
                    <p className="text-xs text-gray-500 mb-2">Thông tin tự đánh giá</p>
                    <div className="flex items-center gap-4">
                      <div>
                        <p className="text-sm text-gray-500">Điểm tự chấm</p>
                        <p className="text-xl font-bold text-blue-600">{modalData.item.self_score}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Xếp loại</p>
                        <p className="font-medium">{getRatingLabel(modalData.item.quality_assessment)}</p>
                      </div>
                    </div>
                  </div>
                )}
                {modalData.type === 'quick-approve' && (
                  <div className="mt-3 pt-3 border-t">
                    <div className="flex items-start gap-2 text-sm text-yellow-700 bg-yellow-50 p-2 rounded">
                      <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <p>Phê duyệt nhanh sẽ bỏ qua bước tự đánh giá của nhân viên. Điểm sẽ do quản lý chấm trực tiếp.</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                {(modalData.type === 'approve' || modalData.type === 'quick-approve') && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Điểm đánh giá <span className="text-red-500">*</span>
                    </label>
                    <div className="flex items-center gap-4">
                      <input type="range" min="0" max="100" value={formData.score}
                        onChange={(e) => setFormData(prev => ({ ...prev, score: Number(e.target.value) }))}
                        className="flex-1" />
                      <div className="flex items-center gap-2">
                        <input type="number" min="0" max="100" value={formData.score}
                          onChange={(e) => setFormData(prev => ({ ...prev, score: Number(e.target.value) }))}
                          className="w-20 px-3 py-2 border border-gray-300 rounded-lg text-center" />
                        <span className="text-gray-500">/100</span>
                      </div>
                    </div>
                    <p className="mt-1 text-sm text-gray-500">Xếp loại: <span className="font-medium">{getScoreRating(formData.score)}</span></p>
                  </div>
                )}
                {(modalData.type === 'approve' || modalData.type === 'reject' || modalData.type === 'quick-approve') && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Nhận xét</label>
                    <textarea value={formData.comments}
                      onChange={(e) => setFormData(prev => ({ ...prev, comments: e.target.value }))}
                      rows={3} placeholder="Nhận xét về công việc..."
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
                  </div>
                )}
                {modalData.type === 'reject' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Lý do từ chối <span className="text-red-500">*</span>
                    </label>
                    <textarea value={formData.rejection_reason}
                      onChange={(e) => setFormData(prev => ({ ...prev, rejection_reason: e.target.value }))}
                      rows={3} placeholder="Nêu rõ lý do từ chối..."
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" required />
                  </div>
                )}
                {modalData.type === 'revision' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Yêu cầu chỉnh sửa <span className="text-red-500">*</span>
                    </label>
                    <textarea value={formData.revision_request}
                      onChange={(e) => setFormData(prev => ({ ...prev, revision_request: e.target.value }))}
                      rows={3} placeholder="Mô tả những điều cần chỉnh sửa..."
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" required />
                    <p className="mt-1 text-xs text-gray-500">Nhân viên sẽ nhận được thông báo và cần cập nhật lại tự đánh giá</p>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t">
                <button onClick={() => { setModalData(null); resetForm(); }} disabled={isSubmitting}
                  className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
                  Hủy
                </button>
                {modalData.type === 'approve' && (
                  <button onClick={handleApprove} disabled={isSubmitting}
                    className="inline-flex items-center gap-2 px-4 py-2 text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50">
                    {isSubmitting ? <><RefreshCw className="w-4 h-4 animate-spin" />Đang xử lý...</> : <><CheckCircle className="w-4 h-4" />Phê duyệt</>}
                  </button>
                )}
                {modalData.type === 'reject' && (
                  <button onClick={handleReject} disabled={isSubmitting || !formData.rejection_reason}
                    className="inline-flex items-center gap-2 px-4 py-2 text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50">
                    {isSubmitting ? <><RefreshCw className="w-4 h-4 animate-spin" />Đang xử lý...</> : <><XCircle className="w-4 h-4" />Từ chối</>}
                  </button>
                )}
                {modalData.type === 'revision' && (
                  <button onClick={handleRequestRevision} disabled={isSubmitting || !formData.revision_request}
                    className="inline-flex items-center gap-2 px-4 py-2 text-white bg-orange-600 rounded-lg hover:bg-orange-700 disabled:opacity-50">
                    {isSubmitting ? <><RefreshCw className="w-4 h-4 animate-spin" />Đang xử lý...</> : <><RefreshCw className="w-4 h-4" />Yêu cầu sửa</>}
                  </button>
                )}
                {modalData.type === 'quick-approve' && (
                  <button onClick={handleQuickApprove} disabled={isSubmitting}
                    className="inline-flex items-center gap-2 px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                    {isSubmitting ? <><RefreshCw className="w-4 h-4 animate-spin" />Đang xử lý...</> : <><Star className="w-4 h-4" />Phê duyệt nhanh</>}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ApprovalsPage;