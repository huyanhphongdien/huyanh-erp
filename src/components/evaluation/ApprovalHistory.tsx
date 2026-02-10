// ============================================================================
// PHASE 4.3.2: APPROVAL HISTORY COMPONENT
// File: src/components/evaluation/ApprovalHistory.tsx
// Huy Anh ERP System
// ============================================================================
// Hiển thị lịch sử các phê duyệt đã thực hiện (cho manager)
// ============================================================================

import React, { useState, useMemo } from 'react';
import {
  type ApprovalWithRelations,
  type ApprovalAction,
  APPROVAL_ACTION_LABELS,
} from '../../types/evaluation.types';
import { ApprovalActionBadge } from './StatusBadge';
import { ScoreBadge } from './RatingBadge';

// ============================================================================
// TYPES
// ============================================================================

interface ApprovalHistoryProps {
  approvals: ApprovalWithRelations[];
  isLoading?: boolean;
  error?: string;
  
  // Actions
  onView?: (approval: ApprovalWithRelations) => void;
  
  // Options
  showTask?: boolean;
  showApprover?: boolean;
  title?: string;
  emptyMessage?: string;
}

type SortField = 'created_at' | 'action' | 'approver' | 'task';
type SortOrder = 'asc' | 'desc';

// ============================================================================
// COMPONENT
// ============================================================================

export const ApprovalHistory: React.FC<ApprovalHistoryProps> = ({
  approvals,
  isLoading = false,
  error,
  onView,
  showTask = true,
  showApprover = true,
  title = 'Lịch sử phê duyệt',
  emptyMessage = 'Chưa có lịch sử phê duyệt',
}) => {
  // State
  const [filterAction, setFilterAction] = useState<ApprovalAction | 'all'>('all');
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [searchTerm, setSearchTerm] = useState('');

  // Filter and sort
  const filteredApprovals = useMemo(() => {
    let result = [...approvals];

    // Filter by action
    if (filterAction !== 'all') {
      result = result.filter(a => a.action === filterAction);
    }

    // Filter by search
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(a =>
        a.task?.name?.toLowerCase().includes(term) ||
        a.task?.code?.toLowerCase().includes(term) ||
        a.approver?.full_name?.toLowerCase().includes(term) ||
        a.comments?.toLowerCase().includes(term)
      );
    }

    // Sort
    result.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'created_at':
          comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
        case 'action':
          comparison = (a.action || '').localeCompare(b.action || '');
          break;
        case 'approver':
          comparison = (a.approver?.full_name || '').localeCompare(b.approver?.full_name || '');
          break;
        case 'task':
          comparison = (a.task?.name || '').localeCompare(b.task?.name || '');
          break;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [approvals, filterAction, sortField, sortOrder, searchTerm]);

  // Calculate stats
  const stats = useMemo(() => {
    if (approvals.length === 0) return null;
    
    const actionCounts: Record<string, number> = {
      approve: 0,
      reject: 0,
      request_info: 0,
    };
    
    approvals.forEach(a => {
      if (a.action && actionCounts[a.action] !== undefined) {
        actionCounts[a.action]++;
      }
    });

    return {
      total: approvals.length,
      actionCounts,
    };
  }, [approvals]);

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
            <div className="text-sm text-gray-500">Tổng phê duyệt</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
            <div className="text-2xl font-bold text-green-600">{stats.actionCounts.approve}</div>
            <div className="text-sm text-gray-500">Đã duyệt</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
            <div className="text-2xl font-bold text-red-600">{stats.actionCounts.reject}</div>
            <div className="text-sm text-gray-500">Từ chối</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
            <div className="text-2xl font-bold text-orange-600">{stats.actionCounts.request_info}</div>
            <div className="text-sm text-gray-500">Yêu cầu bổ sung</div>
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
                placeholder="Tìm kiếm theo công việc, người phê duyệt..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
              />
            </div>

            {/* Action filter */}
            <select
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value as ApprovalAction | 'all')}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
            >
              <option value="all">Tất cả hành động</option>
              {Object.entries(APPROVAL_ACTION_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Results count */}
        <div className="px-4 py-2 text-sm text-gray-500 border-b border-gray-100">
          Hiển thị {filteredApprovals.length} / {approvals.length} phê duyệt
        </div>

        {/* Empty state */}
        {filteredApprovals.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-gray-400 text-5xl mb-3">📋</div>
            <p className="text-gray-500">{emptyMessage}</p>
          </div>
        ) : (
          /* Table */
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {showTask && (
                    <th
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                      onClick={() => handleSort('task')}
                    >
                      Công việc <SortIcon field="task" />
                    </th>
                  )}
                  {showApprover && (
                    <th
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                      onClick={() => handleSort('approver')}
                    >
                      Người phê duyệt <SortIcon field="approver" />
                    </th>
                  )}
                  <th
                    className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('action')}
                  >
                    Hành động <SortIcon field="action" />
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Điểm
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Ghi chú
                  </th>
                  <th
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('created_at')}
                  >
                    Thời gian <SortIcon field="created_at" />
                  </th>
                  {onView && (
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Thao tác
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredApprovals.map((approval) => (
                  <tr key={approval.id} className="hover:bg-gray-50">
                    {/* Task */}
                    {showTask && (
                      <td className="px-4 py-3">
                        <div>
                          <div className="font-medium text-gray-900 text-sm">
                            {approval.task?.name || '—'}
                          </div>
                          {approval.task?.code && (
                            <div className="text-xs text-gray-500">{approval.task.code}</div>
                          )}
                        </div>
                      </td>
                    )}

                    {/* Approver */}
                    {showApprover && (
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-medium text-sm">
                            {approval.approver?.full_name?.charAt(0) || '?'}
                          </div>
                          <div>
                            <div className="text-sm text-gray-900">
                              {approval.approver?.full_name || '—'}
                            </div>
                            {approval.approver?.position && (
                              <div className="text-xs text-gray-500">
                                {approval.approver.position.name}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    )}

                    {/* Action */}
                    <td className="px-4 py-3">
                      <div className="flex justify-center">
                        <ApprovalActionBadge action={approval.action} size="sm" />
                      </div>
                    </td>

                    {/* Score */}
                    <td className="px-4 py-3">
                      <div className="flex justify-center">
                        {approval.action === 'approve' && approval.score !== null ? (
                          <ScoreBadge score={approval.score} size="sm" />
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </div>
                    </td>

                    {/* Comments */}
                    <td className="px-4 py-3">
                      <p className="text-sm text-gray-600 max-w-xs truncate">
                        {approval.comments || approval.rejection_reason || approval.additional_request || '—'}
                      </p>
                    </td>

                    {/* Date */}
                    <td className="px-4 py-3 text-sm text-gray-600">
                      <div>{new Date(approval.created_at).toLocaleDateString('vi-VN')}</div>
                      <div className="text-xs text-gray-400">
                        {new Date(approval.created_at).toLocaleTimeString('vi-VN', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </td>

                    {/* Actions */}
                    {onView && (
                      <td className="px-4 py-3">
                        <div className="flex justify-end">
                          <button
                            onClick={() => onView(approval)}
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
// APPROVAL HISTORY CARD - Dạng card cho mobile
// ============================================================================

interface ApprovalHistoryCardProps {
  approval: ApprovalWithRelations;
  onView?: () => void;
  showTask?: boolean;
}

export const ApprovalHistoryCard: React.FC<ApprovalHistoryCardProps> = ({
  approval,
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
              {approval.task?.name || 'Công việc'}
            </h4>
          )}
          <p className="text-xs text-gray-500">
            {new Date(approval.created_at).toLocaleString('vi-VN')}
          </p>
        </div>
        <ApprovalActionBadge action={approval.action} size="sm" />
      </div>

      {/* Approver info */}
      {approval.approver && (
        <div className="flex items-center gap-2 text-sm">
          <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-medium">
            {approval.approver.full_name?.charAt(0) || '?'}
          </div>
          <div>
            <div className="font-medium text-gray-900">{approval.approver.full_name}</div>
            {approval.approver.position && (
              <div className="text-xs text-gray-500">{approval.approver.position.name}</div>
            )}
          </div>
        </div>
      )}

      {/* Score (if approved) */}
      {approval.action === 'approve' && approval.score !== null && (
        <div className="flex items-center justify-between py-2 border-y border-gray-100">
          <span className="text-sm text-gray-500">Điểm đánh giá</span>
          <ScoreBadge score={approval.score} size="md" />
        </div>
      )}

      {/* Comments */}
      {(approval.comments || approval.rejection_reason || approval.additional_request) && (
        <div>
          <p className="text-xs text-gray-500 mb-1">
            {approval.action === 'reject' ? 'Lý do từ chối:' :
             approval.action === 'request_info' ? 'Yêu cầu bổ sung:' : 'Ghi chú:'}
          </p>
          <p className="text-sm text-gray-700 line-clamp-2">
            {approval.comments || approval.rejection_reason || approval.additional_request}
          </p>
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

export default ApprovalHistory;