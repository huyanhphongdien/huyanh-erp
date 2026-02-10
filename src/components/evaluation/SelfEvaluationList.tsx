// ============================================================================
// PHASE 4.3.2: SELF EVALUATION LIST COMPONENT
// File: src/components/evaluation/SelfEvaluationList.tsx
// Huy Anh ERP System
// ============================================================================

import React, { useState, useMemo } from 'react';
import {
  type SelfEvaluationWithRelations,
  type SelfEvaluationStatus,
  SELF_EVALUATION_STATUS_LABELS,
  calculateRating,
} from '../../types/evaluation.types';
import { RatingBadge, ScoreBadge, ProgressRing } from './RatingBadge';
import { EvaluationStatusBadge } from './StatusBadge';

// ============================================================================
// TYPES
// ============================================================================

interface SelfEvaluationListProps {
  evaluations: SelfEvaluationWithRelations[];
  isLoading?: boolean;
  error?: string;
  
  // Actions
  onView?: (evaluation: SelfEvaluationWithRelations) => void;
  onEdit?: (evaluation: SelfEvaluationWithRelations) => void;
  onDelete?: (evaluation: SelfEvaluationWithRelations) => void;
  
  // Options
  showTask?: boolean;
  showActions?: boolean;
  emptyMessage?: string;
}

// FIXED: use submitted_at instead of evaluation_date
type SortField = 'submitted_at' | 'self_score' | 'status' | 'completion_percentage';
type SortOrder = 'asc' | 'desc';

// ============================================================================
// COMPONENT
// ============================================================================

export const SelfEvaluationList: React.FC<SelfEvaluationListProps> = ({
  evaluations,
  isLoading = false,
  error,
  onView,
  onEdit,
  onDelete,
  showTask = true,
  showActions = true,
  emptyMessage = 'Chưa có tự đánh giá nào',
}) => {
  // Filter & Sort state - FIXED: default to submitted_at
  const [filterStatus, setFilterStatus] = useState<SelfEvaluationStatus | 'all'>('all');
  const [sortField, setSortField] = useState<SortField>('submitted_at');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [searchTerm, setSearchTerm] = useState('');

  // Filter and sort evaluations - FIXED: use submitted_at
  const filteredEvaluations = useMemo(() => {
    let result = [...evaluations];

    // Filter by status
    if (filterStatus !== 'all') {
      result = result.filter(e => e.status === filterStatus);
    }

    // Filter by search term
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(e => 
        e.task?.name?.toLowerCase().includes(term) ||
        e.task?.code?.toLowerCase().includes(term) ||
        e.difficulties?.toLowerCase().includes(term)
      );
    }

    // Sort - FIXED: use submitted_at or created_at
    result.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'submitted_at':
          const dateA = a.submitted_at || a.created_at;
          const dateB = b.submitted_at || b.created_at;
          comparison = new Date(dateA).getTime() - new Date(dateB).getTime();
          break;
        case 'self_score':
          comparison = (a.self_score || 0) - (b.self_score || 0);
          break;
        case 'completion_percentage':
          comparison = a.completion_percentage - b.completion_percentage;
          break;
        case 'status':
          comparison = a.status.localeCompare(b.status);
          break;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [evaluations, filterStatus, sortField, sortOrder, searchTerm]);

  // Handle sort
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  // Sort indicator
  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return <span className="text-gray-300">↕</span>;
    }
    return <span className="text-blue-600">{sortOrder === 'asc' ? '↑' : '↓'}</span>;
  };

  // Can edit check
  const canEdit = (evaluation: SelfEvaluationWithRelations): boolean => {
    return evaluation.status === 'pending' || evaluation.status === 'revision_requested';
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex items-center gap-3 text-gray-500">
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span>Đang tải...</span>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-700">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search */}
        <div className="flex-1">
          <input
            type="text"
            placeholder="Tìm kiếm theo tên công việc..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* Status filter */}
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as SelfEvaluationStatus | 'all')}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="all">Tất cả trạng thái</option>
          {Object.entries(SELF_EVALUATION_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      {/* Results count */}
      <div className="text-sm text-gray-500">
        Hiển thị {filteredEvaluations.length} / {evaluations.length} đánh giá
      </div>

      {/* Empty state */}
      {filteredEvaluations.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <div className="text-gray-400 text-4xl mb-3">📋</div>
          <p className="text-gray-500">{emptyMessage}</p>
        </div>
      ) : (
        /* Table */
        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {showTask && (
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Công việc
                  </th>
                )}
                <th 
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('submitted_at')}
                >
                  <span className="flex items-center gap-1">
                    Ngày gửi
                    <SortIcon field="submitted_at" />
                  </span>
                </th>
                <th 
                  className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('completion_percentage')}
                >
                  <span className="flex items-center justify-center gap-1">
                    Hoàn thành
                    <SortIcon field="completion_percentage" />
                  </span>
                </th>
                <th 
                  className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('self_score')}
                >
                  <span className="flex items-center justify-center gap-1">
                    Điểm / Xếp loại
                    <SortIcon field="self_score" />
                  </span>
                </th>
                <th 
                  className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('status')}
                >
                  <span className="flex items-center justify-center gap-1">
                    Trạng thái
                    <SortIcon field="status" />
                  </span>
                </th>
                {showActions && (
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Thao tác
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredEvaluations.map((evaluation) => (
                <tr key={evaluation.id} className="hover:bg-gray-50">
                  {/* Task info */}
                  {showTask && (
                    <td className="px-4 py-3">
                      <div>
                        <div className="font-medium text-gray-900">
                          {evaluation.task?.name || evaluation.task?.title || '—'}
                        </div>
                        {evaluation.task?.code && (
                          <div className="text-xs text-gray-500">
                            {evaluation.task.code}
                          </div>
                        )}
                      </div>
                    </td>
                  )}

                  {/* Submitted date - FIXED: use submitted_at */}
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {evaluation.submitted_at 
                      ? new Date(evaluation.submitted_at).toLocaleDateString('vi-VN')
                      : new Date(evaluation.created_at).toLocaleDateString('vi-VN')
                    }
                  </td>

                  {/* Completion percentage */}
                  <td className="px-4 py-3">
                    <div className="flex justify-center">
                      <ProgressRing 
                        percentage={evaluation.completion_percentage} 
                        size={40}
                        strokeWidth={4}
                      />
                    </div>
                  </td>

                  {/* Score & Rating - FIXED: calculate rating from score */}
                  <td className="px-4 py-3">
                    <div className="flex flex-col items-center gap-1">
                      <ScoreBadge score={evaluation.self_score} size="md" />
                      {evaluation.self_score !== null && (
                        <RatingBadge rating={calculateRating(evaluation.self_score)} size="sm" />
                      )}
                    </div>
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3">
                    <div className="flex justify-center">
                      <EvaluationStatusBadge status={evaluation.status} size="sm" />
                    </div>
                  </td>

                  {/* Actions */}
                  {showActions && (
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        {onView && (
                          <button
                            onClick={() => onView(evaluation)}
                            className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded"
                            title="Xem chi tiết"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          </button>
                        )}
                        {onEdit && canEdit(evaluation) && (
                          <button
                            onClick={() => onEdit(evaluation)}
                            className="p-1.5 text-gray-500 hover:text-amber-600 hover:bg-amber-50 rounded"
                            title="Chỉnh sửa"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                        )}
                        {onDelete && canEdit(evaluation) && (
                          <button
                            onClick={() => onDelete(evaluation)}
                            className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded"
                            title="Xóa"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// SELF EVALUATION CARD - Dạng card cho mobile
// ============================================================================

interface SelfEvaluationCardProps {
  evaluation: SelfEvaluationWithRelations;
  onView?: () => void;
  onEdit?: () => void;
  showTask?: boolean;
}

export const SelfEvaluationCard: React.FC<SelfEvaluationCardProps> = ({
  evaluation,
  onView,
  onEdit,
  showTask = true,
}) => {
  const canEdit = evaluation.status === 'pending' || evaluation.status === 'revision_requested';

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex-1">
          {showTask && (
            <h4 className="font-medium text-gray-900">
              {evaluation.task?.name || evaluation.task?.title || 'Công việc'}
            </h4>
          )}
          {/* FIXED: use submitted_at */}
          <p className="text-sm text-gray-500">
            {evaluation.submitted_at 
              ? new Date(evaluation.submitted_at).toLocaleDateString('vi-VN')
              : new Date(evaluation.created_at).toLocaleDateString('vi-VN')
            }
          </p>
        </div>
        <EvaluationStatusBadge status={evaluation.status} size="sm" />
      </div>

      {/* Stats */}
      <div className="flex items-center justify-between py-2 border-y border-gray-100">
        <div className="flex items-center gap-2">
          <ProgressRing percentage={evaluation.completion_percentage} size={36} strokeWidth={3} />
          <span className="text-sm text-gray-600">Hoàn thành</span>
        </div>
        <div className="flex items-center gap-2">
          <ScoreBadge score={evaluation.self_score} size="sm" />
          {evaluation.self_score !== null && (
            <RatingBadge rating={calculateRating(evaluation.self_score)} size="sm" />
          )}
        </div>
      </div>

      {/* Quality */}
      {evaluation.quality_assessment && (
        <div className="text-sm">
          <span className="text-gray-500">Chất lượng:</span>
          <span className="ml-2 font-medium">{evaluation.quality_assessment}</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-2">
        {onView && (
          <button
            onClick={onView}
            className="flex-1 px-3 py-1.5 text-sm text-blue-600 bg-blue-50 rounded hover:bg-blue-100"
          >
            Xem chi tiết
          </button>
        )}
        {onEdit && canEdit && (
          <button
            onClick={onEdit}
            className="flex-1 px-3 py-1.5 text-sm text-amber-600 bg-amber-50 rounded hover:bg-amber-100"
          >
            Chỉnh sửa
          </button>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// EXPORTS
// ============================================================================

export default SelfEvaluationList;