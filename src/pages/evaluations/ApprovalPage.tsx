// ============================================================================
// APPROVALS PAGE - WITH PERMISSION FILTERING & EXTENSION REQUESTS
// File: src/pages/evaluations/ApprovalPage.tsx
// Huy Anh ERP System
// ============================================================================
// Trang phê duyệt công việc cho Manager với filter theo quyền:
// - EXECUTIVE: Duyệt tất cả
// - MANAGER: Chỉ duyệt task trong phòng ban, không duyệt task do EXECUTIVE tạo
// - EMPLOYEE: Không có quyền duyệt (redirect hoặc hiện thông báo)
// 
// *** THÊM MỚI: Tab "Yêu cầu gia hạn" ***
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
  User,
  Calendar,
  Star,
  ChevronRight,
  Shield,
  Ban,
  CalendarClock, // *** THÊM MỚI ***
} from 'lucide-react';
// *** IMPORT MỚI ***
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

// *** CẬP NHẬT: Thêm 'extensions' ***
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
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Không có quyền truy cập
        </h2>
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
  
  // State
  const [activeTab, setActiveTab] = useState<TabType>('pending');
  const [pendingEvaluations, setPendingEvaluations] = useState<PendingEvaluation[]>([]);
  const [completedWithoutEval, setCompletedWithoutEval] = useState<CompletedTaskWithoutEval[]>([]);
  const [stats, setStats] = useState<ApprovalStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  
  // *** STATE MỚI: Đếm yêu cầu gia hạn ***
  const [extensionCount, setExtensionCount] = useState(0);

  // Modal state
  const [modalData, setModalData] = useState<ApprovalModalData | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    score: 80,
    comments: '',
    rejection_reason: '',
    revision_request: '',
  });

  // Build permission context
  const permissionContext: ApprovalPermissionContext = {
    userLevel: user?.position_level || 6,
    userDepartmentId: user?.department_id || '',
    isAdmin: isAdmin,
  };

  // Check if user has approval rights
  const hasApprovalRights = isAdmin || group === 'executive' || group === 'manager';

  // *** FETCH EXTENSION COUNT ***
  const fetchExtensionCount = useCallback(async () => {
    if (!user?.employee_id || !hasApprovalRights) return;
    
    try {
      const count = await extensionService.countPendingRequestsByRole(
        user.employee_id,
        user.position_level || 6,
        user.department_id || null
      );
      setExtensionCount(count);
    } catch (error) {
      console.error('Error fetching extension count:', error);
      setExtensionCount(0);
    }
  }, [user?.employee_id, user?.position_level, user?.department_id, hasApprovalRights]);

  // Load data
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
      // Pass permission context to filter results
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

  // *** HANDLER: Refresh all data ***
  const handleRefreshAll = () => {
    loadData();
    fetchExtensionCount();
  };

  // *** HANDLER: Khi extension count thay đổi từ ExtensionApprovalTab ***
  const handleExtensionCountChange = (count: number) => {
    setExtensionCount(count);
  };

  // Clear success message
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  // Handle approve
  const handleApprove = async () => {
    if (!modalData || !user?.employee_id) return;

    setIsSubmitting(true);
    try {
      const item = modalData.item as PendingEvaluation;
      
      // Double check permission before action
      const permCheck = await approvalService.checkApprovalPermission(item.task_id, permissionContext);
      if (!permCheck.canApprove) {
        throw new Error(permCheck.reason || 'Không có quyền phê duyệt');
      }

      const result = await approvalService.approve({
        self_evaluation_id: item.id,
        task_id: item.task_id,
        approver_id: user.employee_id,
        score: formData.score,
        comments: formData.comments,
      });

      if (!result.success) throw new Error(result.error?.message || 'Không thể phê duyệt');

      setSuccessMessage('Đã phê duyệt thành công!');
      setModalData(null);
      resetForm();
      loadData();
    } catch (err: any) {
      setError(err.message || 'Không thể phê duyệt');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle reject
  const handleReject = async () => {
    if (!modalData || !user?.employee_id || !formData.rejection_reason) return;

    setIsSubmitting(true);
    try {
      const item = modalData.item as PendingEvaluation;
      
      // Double check permission
      const permCheck = await approvalService.checkApprovalPermission(item.task_id, permissionContext);
      if (!permCheck.canApprove) {
        throw new Error(permCheck.reason || 'Không có quyền từ chối');
      }

      const result = await approvalService.reject({
        self_evaluation_id: item.id,
        task_id: item.task_id,
        approver_id: user.employee_id,
        rejection_reason: formData.rejection_reason,
        comments: formData.comments,
      });

      if (!result.success) throw new Error(result.error?.message || 'Không thể từ chối');

      setSuccessMessage('Đã từ chối thành công!');
      setModalData(null);
      resetForm();
      loadData();
    } catch (err: any) {
      setError(err.message || 'Không thể từ chối');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle request revision
  const handleRequestRevision = async () => {
    if (!modalData || !user?.employee_id || !formData.revision_request) return;

    setIsSubmitting(true);
    try {
      const item = modalData.item as PendingEvaluation;
      
      // Double check permission
      const permCheck = await approvalService.checkApprovalPermission(item.task_id, permissionContext);
      if (!permCheck.canApprove) {
        throw new Error(permCheck.reason || 'Không có quyền yêu cầu chỉnh sửa');
      }

      const result = await approvalService.requestRevision({
        self_evaluation_id: item.id,
        task_id: item.task_id,
        approver_id: user.employee_id,
        revision_request: formData.revision_request,
      });

      if (!result.success) throw new Error(result.error?.message || 'Không thể yêu cầu chỉnh sửa');

      setSuccessMessage('Đã yêu cầu chỉnh sửa!');
      setModalData(null);
      resetForm();
      loadData();
    } catch (err: any) {
      setError(err.message || 'Không thể yêu cầu chỉnh sửa');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle quick approve
  const handleQuickApprove = async () => {
    if (!modalData || !user?.employee_id) return;

    setIsSubmitting(true);
    try {
      const item = modalData.item as CompletedTaskWithoutEval;
      if (!item.assignee_id) {
        throw new Error('Công việc chưa có người thực hiện');
      }
      
      // Double check permission
      const permCheck = await approvalService.checkApprovalPermission(item.id, permissionContext);
      if (!permCheck.canApprove) {
        throw new Error(permCheck.reason || 'Không có quyền phê duyệt nhanh');
      }
      
      const result = await approvalService.quickApprove({
        task_id: item.id,
        employee_id: item.assignee_id,
        approver_id: user.employee_id,
        score: formData.score,
        comments: formData.comments,
      });

      if (!result.success) throw new Error(result.error?.message || 'Không thể phê duyệt nhanh');

      setSuccessMessage('Đã phê duyệt nhanh thành công!');
      setModalData(null);
      resetForm();
      loadData();
    } catch (err: any) {
      setError(err.message || 'Không thể phê duyệt nhanh');
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormData({
      score: 80,
      comments: '',
      rejection_reason: '',
      revision_request: '',
    });
  };

  const openModal = (type: ApprovalModalData['type'], item: PendingEvaluation | CompletedTaskWithoutEval) => {
    if ('self_score' in item && item.self_score) {
      setFormData(prev => ({ ...prev, score: item.self_score! }));
    }
    setModalData({ type, item });
  };

  // Get className for stats cards
  const getPendingCardClass = () => {
    const base = 'rounded-lg border-2 p-4';
    if (stats && stats.pending_evaluations > 0) {
      return base + ' bg-orange-50 border-orange-200';
    }
    return base + ' bg-white border-gray-100';
  };

  const getCompletedCardClass = () => {
    const base = 'rounded-lg border-2 p-4';
    if (stats && stats.completed_without_eval > 0) {
      return base + ' bg-yellow-50 border-yellow-200';
    }
    return base + ' bg-white border-gray-100';
  };

  // *** MỚI: Get className cho extension card ***
  const getExtensionCardClass = () => {
    const base = 'rounded-lg border-2 p-4';
    if (extensionCount > 0) {
      return base + ' bg-purple-50 border-purple-200';
    }
    return base + ' bg-white border-gray-100';
  };

  // Check permission before rendering
  if (!hasApprovalRights) {
    return (
      <div className="p-6">
        <NoPermissionMessage />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">Phê duyệt công việc</h1>
            {/* Permission badge */}
            <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full ${
              group === 'executive' 
                ? 'bg-purple-100 text-purple-700' 
                : 'bg-blue-100 text-blue-700'
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

      {/* Permission Notice for Manager */}
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

      {/* Stats Cards - CẬP NHẬT: Thêm card gia hạn */}
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
          </div>
          {/* *** CARD MỚI: Yêu cầu gia hạn *** */}
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
          <button 
            onClick={() => setError(null)}
            className="ml-auto text-red-500 hover:text-red-700"
          >
            ✕
          </button>
        </div>
      )}

      {/* Tabs - CẬP NHẬT: Thêm tab gia hạn */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-6">
          <button
            onClick={() => setActiveTab('pending')}
            className={'py-3 px-1 border-b-2 font-medium text-sm transition-colors ' + 
              (activeTab === 'pending'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              )}
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
              (activeTab === 'no-self-evaluation'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              )}
          >
            Hoàn thành chưa tự đánh giá
            {completedWithoutEval.length > 0 && (
              <span className="ml-2 px-2 py-0.5 text-xs bg-yellow-100 text-yellow-700 rounded-full">
                {completedWithoutEval.length}
              </span>
            )}
          </button>
          {/* *** TAB MỚI: Yêu cầu gia hạn *** */}
          <button
            onClick={() => setActiveTab('extensions')}
            className={'py-3 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-1.5 ' +
              (activeTab === 'extensions'
                ? 'border-purple-500 text-purple-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              )}
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
                  <p className="text-sm text-gray-400 mt-1">
                    {group === 'manager' && 'Trong phạm vi phòng ban của bạn'}
                  </p>
                </div>
              ) : (
                pendingEvaluations.map((item) => (
                  <div
                    key={item.id}
                    className="bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-shadow"
                  >
                    <div className="p-4">
                      {/* Header */}
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                        <div className="flex-1">
                          <h3 className="font-medium text-gray-900">
                            {item.task?.name || 'Công việc không xác định'}
                          </h3>
                          <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-gray-500">
                            <span className="flex items-center gap-1">
                              <User className="w-4 h-4" />
                              {item.employee?.full_name}
                            </span>
                            {item.task?.priority && (
                              <PriorityBadge priority={item.task.priority} />
                            )}
                            {/* Show assigner info */}
                            {item.task?.assigner && (
                              <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">
                                Giao bởi: {item.task.assigner.full_name}
                              </span>
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

                      {/* Self evaluation content */}
                      {item.achievements && (
                        <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                          <p className="text-xs text-gray-500 mb-1">Thành tựu đạt được</p>
                          <p className="text-sm text-gray-700">{item.achievements}</p>
                        </div>
                      )}

                      {/* Task info */}
                      <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-gray-500">
                        {item.task?.due_date && (
                          <span className="flex items-center gap-1">
                            <Calendar className="w-4 h-4" />
                            Hạn: {formatDate(item.task.due_date)}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Clock className="w-4 h-4" />
                          Đánh giá: {formatDate(item.created_at)}
                        </span>
                      </div>

                      {/* Actions */}
                      <div className="mt-4 flex flex-wrap items-center gap-2 pt-3 border-t">
                        <button
                          onClick={() => openModal('approve', item)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-white bg-green-600 rounded-lg hover:bg-green-700"
                        >
                          <CheckCircle className="w-4 h-4" />
                          Phê duyệt
                        </button>
                        <button
                          onClick={() => openModal('revision', item)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-orange-700 bg-orange-100 rounded-lg hover:bg-orange-200"
                        >
                          <RefreshCw className="w-4 h-4" />
                          Yêu cầu sửa
                        </button>
                        <button
                          onClick={() => openModal('reject', item)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-700 bg-red-100 rounded-lg hover:bg-red-200"
                        >
                          <XCircle className="w-4 h-4" />
                          Từ chối
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Tab: Completed Without Evaluation */}
          {activeTab === 'no-self-evaluation' && (
            <div className="space-y-4">
              {completedWithoutEval.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-lg">
                  <CheckCircle className="w-12 h-12 text-green-300 mx-auto mb-3" />
                  <p className="text-gray-500">Không có công việc hoàn thành nào chưa tự đánh giá</p>
                  <p className="text-sm text-gray-400 mt-1">
                    {group === 'manager' && 'Trong phạm vi phòng ban của bạn'}
                  </p>
                </div>
              ) : (
                completedWithoutEval.map((item) => (
                  <div
                    key={item.id}
                    className="bg-white rounded-lg border border-yellow-200 shadow-sm hover:shadow-md transition-shadow"
                  >
                    <div className="p-4">
                      {/* Header */}
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                        <div className="flex-1">
                          <h3 className="font-medium text-gray-900">{item.name}</h3>
                          <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-gray-500">
                            <span className="flex items-center gap-1">
                              <User className="w-4 h-4" />
                              {item.assignee?.full_name || 'Chưa giao'}
                            </span>
                            {item.priority && (
                              <PriorityBadge priority={item.priority} />
                            )}
                            {/* Show assigner info */}
                            {item.assigner && (
                              <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">
                                Giao bởi: {item.assigner.full_name}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-700 rounded-full">
                            Chưa tự đánh giá
                          </span>
                        </div>
                      </div>

                      {/* Task info */}
                      <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-gray-500">
                        {item.due_date && (
                          <span className="flex items-center gap-1">
                            <Calendar className="w-4 h-4" />
                            Hạn: {formatDate(item.due_date)}
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
                      <div className="mt-3 p-2 bg-yellow-50 rounded-lg text-sm text-yellow-700 flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                        <span>Nhân viên chưa tự đánh giá. Bạn có thể phê duyệt nhanh hoặc chờ nhân viên tự đánh giá.</span>
                      </div>

                      {/* Actions */}
                      <div className="mt-4 flex flex-wrap items-center gap-2 pt-3 border-t">
                        <button
                          onClick={() => openModal('quick-approve', item)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                        >
                          <Star className="w-4 h-4" />
                          Phê duyệt nhanh
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* *** TAB MỚI: Yêu cầu gia hạn *** */}
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
              {/* Modal Header */}
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  {modalData.type === 'approve' && <><CheckCircle className="w-5 h-5 text-green-500" /> Phê duyệt đánh giá</>}
                  {modalData.type === 'reject' && <><XCircle className="w-5 h-5 text-red-500" /> Từ chối đánh giá</>}
                  {modalData.type === 'revision' && <><RefreshCw className="w-5 h-5 text-orange-500" /> Yêu cầu chỉnh sửa</>}
                  {modalData.type === 'quick-approve' && <><Star className="w-5 h-5 text-blue-500" /> Phê duyệt nhanh</>}
                </h3>
                <button
                  onClick={() => { setModalData(null); resetForm(); }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>

              {/* Task Info */}
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
                
                {/* Quick approve notice */}
                {modalData.type === 'quick-approve' && (
                  <div className="mt-3 pt-3 border-t">
                    <div className="flex items-start gap-2 text-sm text-yellow-700 bg-yellow-50 p-2 rounded">
                      <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <p>Phê duyệt nhanh sẽ bỏ qua bước tự đánh giá của nhân viên. Điểm sẽ do quản lý chấm trực tiếp.</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Form */}
              <div className="space-y-4">
                {/* Score - for approve and quick-approve */}
                {(modalData.type === 'approve' || modalData.type === 'quick-approve') && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Điểm đánh giá <span className="text-red-500">*</span>
                    </label>
                    <div className="flex items-center gap-4">
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={formData.score}
                        onChange={(e) => setFormData(prev => ({ ...prev, score: Number(e.target.value) }))}
                        className="flex-1"
                      />
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={formData.score}
                          onChange={(e) => setFormData(prev => ({ ...prev, score: Number(e.target.value) }))}
                          className="w-20 px-3 py-2 border border-gray-300 rounded-lg text-center"
                        />
                        <span className="text-gray-500">/100</span>
                      </div>
                    </div>
                    <p className="mt-1 text-sm text-gray-500">
                      Xếp loại: <span className="font-medium">{getScoreRating(formData.score)}</span>
                    </p>
                  </div>
                )}

                {/* Comments */}
                {(modalData.type === 'approve' || modalData.type === 'reject' || modalData.type === 'quick-approve') && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Nhận xét
                    </label>
                    <textarea
                      value={formData.comments}
                      onChange={(e) => setFormData(prev => ({ ...prev, comments: e.target.value }))}
                      rows={3}
                      placeholder="Nhận xét về công việc..."
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                )}

                {/* Rejection reason */}
                {modalData.type === 'reject' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Lý do từ chối <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      value={formData.rejection_reason}
                      onChange={(e) => setFormData(prev => ({ ...prev, rejection_reason: e.target.value }))}
                      rows={3}
                      placeholder="Nêu rõ lý do từ chối..."
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                )}

                {/* Revision request */}
                {modalData.type === 'revision' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Yêu cầu chỉnh sửa <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      value={formData.revision_request}
                      onChange={(e) => setFormData(prev => ({ ...prev, revision_request: e.target.value }))}
                      rows={3}
                      placeholder="Mô tả những điều cần chỉnh sửa trong tự đánh giá..."
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      required
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Nhân viên sẽ nhận được thông báo và cần cập nhật lại tự đánh giá
                    </p>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t">
                <button
                  onClick={() => { setModalData(null); resetForm(); }}
                  disabled={isSubmitting}
                  className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Hủy
                </button>
                
                {modalData.type === 'approve' && (
                  <button
                    onClick={handleApprove}
                    disabled={isSubmitting}
                    className="inline-flex items-center gap-2 px-4 py-2 text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Đang xử lý...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-4 h-4" />
                        Phê duyệt
                      </>
                    )}
                  </button>
                )}
                
                {modalData.type === 'reject' && (
                  <button
                    onClick={handleReject}
                    disabled={isSubmitting || !formData.rejection_reason}
                    className="inline-flex items-center gap-2 px-4 py-2 text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Đang xử lý...
                      </>
                    ) : (
                      <>
                        <XCircle className="w-4 h-4" />
                        Từ chối
                      </>
                    )}
                  </button>
                )}
                
                {modalData.type === 'revision' && (
                  <button
                    onClick={handleRequestRevision}
                    disabled={isSubmitting || !formData.revision_request}
                    className="inline-flex items-center gap-2 px-4 py-2 text-white bg-orange-600 rounded-lg hover:bg-orange-700 disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Đang xử lý...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-4 h-4" />
                        Yêu cầu sửa
                      </>
                    )}
                  </button>
                )}
                
                {modalData.type === 'quick-approve' && (
                  <button
                    onClick={handleQuickApprove}
                    disabled={isSubmitting}
                    className="inline-flex items-center gap-2 px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Đang xử lý...
                      </>
                    ) : (
                      <>
                        <Star className="w-4 h-4" />
                        Phê duyệt nhanh
                      </>
                    )}
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