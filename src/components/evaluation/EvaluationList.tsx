// ============================================================================
// PHASE 4.3.2: EVALUATION LIST COMPONENT
// File: src/components/evaluation/EvaluationList.tsx
// Huy Anh ERP System
// ============================================================================
// Hiển thị danh sách các đánh giá mà nhân viên đã nhận từ manager
// ============================================================================

import React, { useState, useMemo } from 'react';
import {
  type EvaluationWithRelations,
  type RatingLevel,
  RATING_LEVELS,
} from '../../types/evaluation.types';
import { RatingBadge, ScoreBadge } from './RatingBadge';

// ============================================================================
// TYPES
// ============================================================================

interface EvaluationListProps {
  evaluations: EvaluationWithRelations[];
  isLoading?: boolean;
  error?: string;
  
  // Actions
  onView?: (evaluation: EvaluationWithRelations) => void;
  
  // Options
  showTask?: boolean;
  showEvaluator?: boolean;
  emptyMessage?: string;
  title?: string;
}

type SortField = 'created_at' | 'score' | 'rating';
type SortOrder = 'asc' | 'desc';

// ============================================================================
// COMPONENT
// ============================================================================

export const EvaluationList: React.FC<EvaluationListProps> = ({
  evaluations,
  isLoading = false,
  error,
  onView,
  showTask = true,
  showEvaluator = true,
  emptyMessage = 'Chưa có đánh giá nào',
  title = 'Đánh giá đã nhận',
}) => {
  // State
  const [filterRating, setFilterRating] = useState<RatingLevel | 'all'>('all');
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [searchTerm, setSearchTerm] = useState('');

  // Filter and sort
  const filteredEvaluations = useMemo(() => {
    let result = [...evaluations];

    // Filter by rating
    if (filterRating !== 'all') {
      result = result.filter(e => e.rating === filterRating);
    }

    // Filter by search
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(e =>
        e.task?.name?.toLowerCase().includes(term) ||
        e.task?.code?.toLowerCase().includes(term) ||
        e.evaluator?.full_name?.toLowerCase().includes(term) ||
        e.content?.toLowerCase().includes(term)
      );
    }

    // Sort
    result.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'created_at':
          comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
        case 'score':
          comparison = a.score - b.score;
          break;
        case 'rating':
          comparison = (a.rating || '').localeCompare(b.rating || '');
          break;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [evaluations, filterRating, sortField, sortOrder, searchTerm]);

  // Calculate stats
  const stats = useMemo(() => {
    if (evaluations.length === 0) return null;
    
    const totalScore = evaluations.reduce((sum, e) => sum + e.score, 0);
    const avgScore = Math.round(totalScore / evaluations.length);
    
    const ratingCounts: Record<string, number> = {};
    evaluations.forEach(e => {
      if (e.rating) {
        ratingCounts[e.rating] = (ratingCounts[e.rating] || 0) + 1;
      }
    });

    return {
      total: evaluations.length,
      avgScore,
      ratingCounts,
    };
  }, [evaluations]);

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
      return <span className="text-gray-300 ml-1">↕</span>;
    }
    return <span className="text-blue-600 ml-1">{sortOrder === 'asc' ? '↑' : '↓'}</span>;
  };

  // Loading
  if (isLoading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-8">
        <div className="flex items-center justify-center gap-3 text-gray-500">
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span>Đang tải...</span>
        </div>
      </div>
    );
  }

  // Error
  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-700">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats Summary */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
            <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
            <div className="text-sm text-gray-500">Tổng đánh giá</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">{stats.avgScore}</div>
            <div className="text-sm text-gray-500">Điểm trung bình</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
            <div className="text-2xl font-bold text-green-600">
              {stats.ratingCounts['Xuất sắc'] || 0}
            </div>
            <div className="text-sm text-gray-500">Xuất sắc</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
            <div className="text-2xl font-bold text-cyan-600">
              {stats.ratingCounts['Tốt'] || 0}
            </div>
            <div className="text-sm text-gray-500">Tốt</div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="bg-white rounded-lg border border-gray-200">
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        </div>

        {/* Filters */}
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Search */}
            <div className="flex-1">
              <input
                type="text"
                placeholder="Tìm kiếm theo công việc, nội dung..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
              />
            </div>

            {/* Rating filter */}
            <select
              value={filterRating}
              onChange={(e) => setFilterRating(e.target.value as RatingLevel | 'all')}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
            >
              <option value="all">Tất cả xếp loại</option>
              {Object.values(RATING_LEVELS).map((rating) => (
                <option key={rating} value={rating}>{rating}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Results count */}
        <div className="px-4 py-2 text-sm text-gray-500 border-b border-gray-100">
          Hiển thị {filteredEvaluations.length} / {evaluations.length} đánh giá
        </div>

        {/* Empty state */}
        {filteredEvaluations.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-gray-400 text-5xl mb-3">📊</div>
            <p className="text-gray-500">{emptyMessage}</p>
          </div>
        ) : (
          /* Table */
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {showTask && (
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Công việc
                    </th>
                  )}
                  <th
                    className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('score')}
                  >
                    Điểm <SortIcon field="score" />
                  </th>
                  <th
                    className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('rating')}
                  >
                    Xếp loại <SortIcon field="rating" />
                  </th>
                  {showEvaluator && (
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Người đánh giá
                    </th>
                  )}
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Nhận xét
                  </th>
                  <th
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('created_at')}
                  >
                    Ngày <SortIcon field="created_at" />
                  </th>
                  {onView && (
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Thao tác
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredEvaluations.map((evaluation) => (
                  <tr key={evaluation.id} className="hover:bg-gray-50">
                    {/* Task */}
                    {showTask && (
                      <td className="px-4 py-3">
                        <div>
                          <div className="font-medium text-gray-900 text-sm">
                            {evaluation.task?.name || evaluation.task?.title || '—'}
                          </div>
                          {evaluation.task?.code && (
                            <div className="text-xs text-gray-500">{evaluation.task.code}</div>
                          )}
                        </div>
                      </td>
                    )}

                    {/* Score */}
                    <td className="px-4 py-3">
                      <div className="flex justify-center">
                        <ScoreBadge score={evaluation.score} size="md" />
                      </div>
                    </td>

                    {/* Rating */}
                    <td className="px-4 py-3">
                      <div className="flex justify-center">
                        <RatingBadge rating={evaluation.rating} size="sm" />
                      </div>
                    </td>

                    {/* Evaluator */}
                    {showEvaluator && (
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {evaluation.evaluator?.full_name || '—'}
                      </td>
                    )}

                    {/* Content */}
                    <td className="px-4 py-3">
                      <p className="text-sm text-gray-600 max-w-xs truncate">
                        {evaluation.content || '—'}
                      </p>
                    </td>

                    {/* Date */}
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {new Date(evaluation.created_at).toLocaleDateString('vi-VN')}
                    </td>

                    {/* Actions */}
                    {onView && (
                      <td className="px-4 py-3">
                        <div className="flex justify-end">
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
    </div>
  );
};

// ============================================================================
// EVALUATION CARD - Dạng card cho mobile
// ============================================================================

interface EvaluationCardProps {
  evaluation: EvaluationWithRelations;
  onView?: () => void;
  showTask?: boolean;
}

export const EvaluationCard: React.FC<EvaluationCardProps> = ({
  evaluation,
  onView,
  showTask = true,
}) => {
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
          <p className="text-xs text-gray-500">
            {new Date(evaluation.created_at).toLocaleDateString('vi-VN')}
          </p>
        </div>
        <RatingBadge rating={evaluation.rating} size="sm" />
      </div>

      {/* Score */}
      <div className="flex items-center justify-between py-2 border-y border-gray-100">
        <span className="text-sm text-gray-500">Điểm đánh giá</span>
        <ScoreBadge score={evaluation.score} size="md" />
      </div>

      {/* Evaluator */}
      {evaluation.evaluator && (
        <div className="text-sm">
          <span className="text-gray-500">Người đánh giá:</span>
          <span className="ml-2 font-medium">{evaluation.evaluator.full_name}</span>
        </div>
      )}

      {/* Content */}
      {evaluation.content && (
        <div>
          <p className="text-xs text-gray-500 mb-1">Nhận xét:</p>
          <p className="text-sm text-gray-700 line-clamp-2">{evaluation.content}</p>
        </div>
      )}

      {/* Actions */}
      {onView && (
        <button
          onClick={onView}
          className="w-full px-3 py-1.5 text-sm text-blue-600 bg-blue-50 rounded hover:bg-blue-100"
        >
          Xem chi tiết
        </button>
      )}
    </div>
  );
};

// ============================================================================
// EXPORTS
// ============================================================================

export default EvaluationList;