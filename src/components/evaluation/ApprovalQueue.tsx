// ============================================================================
// PHASE 4.3.2: APPROVAL QUEUE COMPONENT
// File: src/components/evaluation/ApprovalQueue.tsx
// Huy Anh ERP System
// ============================================================================

import React, { useState, useMemo } from 'react';
import {
  type PendingApprovalItem,
  type SelfEvaluationWithRelations,
} from '../../types/evaluation.types';
import { ScoreBadge, ProgressRing } from './RatingBadge';
import { EvaluationStatusBadge } from './StatusBadge';

// ============================================================================
// TYPES
// ============================================================================

interface ApprovalQueueProps {
  // Data - có thể dùng PendingApprovalItem hoặc SelfEvaluationWithRelations
  items: (PendingApprovalItem | SelfEvaluationWithRelations)[];
  isLoading?: boolean;
  error?: string;
  
  // Actions
  onApprove?: (item: PendingApprovalItem | SelfEvaluationWithRelations) => void;
  onReject?: (item: PendingApprovalItem | SelfEvaluationWithRelations) => void;
  onRequestInfo?: (item: PendingApprovalItem | SelfEvaluationWithRelations) => void;
  onViewDetail?: (item: PendingApprovalItem | SelfEvaluationWithRelations) => void;
  
  // Options
  title?: string;
  emptyMessage?: string;
  showDepartmentFilter?: boolean;
  departments?: { id: string; name: string }[];
}

type SortField = 'date' | 'score' | 'employee' | 'task';
type SortOrder = 'asc' | 'desc';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

// Normalize item to common format
const normalizeItem = (item: PendingApprovalItem | SelfEvaluationWithRelations) => {
  // Check if it's PendingApprovalItem
  if ('task_code' in item) {
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
      status: item.status,
    };
  }
  
  // It's SelfEvaluationWithRelations - FIXED: use submitted_at
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
    submitted_at: item.submitted_at || item.created_at, // FIXED: was evaluation_date
    status: item.status,
  };
};

// ============================================================================
// COMPONENT
// ============================================================================

export const ApprovalQueue: React.FC<ApprovalQueueProps> = ({
  items,
  isLoading = false,
  error,
  onApprove,
  onReject,
  onRequestInfo,
  onViewDetail,
  title = 'Công việc chờ duyệt',
  emptyMessage = 'Không có công việc nào chờ duyệt',
  showDepartmentFilter = true,
  departments = [],
}) => {
  // State
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDepartment, setFilterDepartment] = useState<string>('all');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

  // Normalize all items
  const normalizedItems = useMemo(() => items.map(normalizeItem), [items]);

  // Get unique departments from items if not provided
  const availableDepartments = useMemo(() => {
    if (departments.length > 0) return departments;
    
    const deptSet = new Map<string, string>();
    normalizedItems.forEach(item => {
      if (item.department_name && !deptSet.has(item.department_name)) {
        deptSet.set(item.department_name, item.department_name);
      }
    });
    return Array.from(deptSet.entries()).map(([id, name]) => ({ id, name }));
  }, [normalizedItems, departments]);

  // Filter and sort
  const filteredItems = useMemo(() => {
    let result = [...normalizedItems];

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(item =>
        item.task_name.toLowerCase().includes(term) ||
        item.task_code.toLowerCase().includes(term) ||
        item.employee_name.toLowerCase().includes(term)
      );
    }

    // Department filter
    if (filterDepartment !== 'all') {
      result = result.filter(item => item.department_name === filterDepartment);
    }

    // Sort - FIXED: use submitted_at
    result.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'date':
          comparison = new Date(a.submitted_at || '').getTime() - new Date(b.submitted_at || '').getTime();
          break;
        case 'score':
          comparison = (a.self_score || 0) - (b.self_score || 0);
          break;
        case 'employee':
          comparison = a.employee_name.localeCompare(b.employee_name);
          break;
        case 'task':
          comparison = a.task_name.localeCompare(b.task_name);
          break;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [normalizedItems, searchTerm, filterDepartment, sortField, sortOrder]);

  // Handle sort
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  // Handle select all
  const handleSelectAll = () => {
    if (selectedItems.size === filteredItems.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(filteredItems.map(item => item.id)));
    }
  };

  // Handle select item
  const handleSelectItem = (id: string) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedItems(newSelected);
  };

  // Find original item by id
  const findOriginalItem = (id: string) => {
    return items.find(item => item.id === id);
  };

  // Sort indicator
  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return <span className="text-gray-300 ml-1">↕</span>;
    }
    return <span className="text-blue-600 ml-1">{sortOrder === 'asc' ? '↑' : '↓'}</span>;
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-8">
        <div className="flex items-center justify-center gap-3 text-gray-500">
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span>Đang tải danh sách...</span>
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
    <div className="bg-white rounded-lg border border-gray-200">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            {title}
            <span className="ml-2 text-sm font-normal text-gray-500">
              ({filteredItems.length} công việc)
            </span>
          </h2>
        </div>
      </div>

      {/* Filters */}
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search */}
          <div className="flex-1">
            <input
              type="text"
              placeholder="Tìm kiếm theo tên công việc, nhân viên..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
            />
          </div>

          {/* Department filter */}
          {showDepartmentFilter && availableDepartments.length > 0 && (
            <select
              value={filterDepartment}
              onChange={(e) => setFilterDepartment(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
            >
              <option value="all">Tất cả phòng ban</option>
              {availableDepartments.map((dept) => (
                <option key={dept.id} value={dept.name}>{dept.name}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Bulk actions */}
      {selectedItems.size > 0 && (
        <div className="px-4 py-2 bg-blue-50 border-b border-blue-100 flex items-center gap-3">
          <span className="text-sm text-blue-700">
            Đã chọn {selectedItems.size} công việc
          </span>
          <button
            onClick={() => setSelectedItems(new Set())}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            Bỏ chọn
          </button>
        </div>
      )}

      {/* Empty state */}
      {filteredItems.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-gray-400 text-5xl mb-3">✓</div>
          <p className="text-gray-500">{emptyMessage}</p>
        </div>
      ) : (
        /* Table */
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={selectedItems.size === filteredItems.length && filteredItems.length > 0}
                    onChange={handleSelectAll}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </th>
                <th 
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('task')}
                >
                  Công việc <SortIcon field="task" />
                </th>
                <th 
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('employee')}
                >
                  Nhân viên <SortIcon field="employee" />
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Hoàn thành
                </th>
                <th 
                  className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('score')}
                >
                  Điểm tự ĐG <SortIcon field="score" />
                </th>
                <th 
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('date')}
                >
                  Ngày gửi <SortIcon field="date" />
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Thao tác
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredItems.map((item) => {
                const originalItem = findOriginalItem(item.id);
                return (
                  <tr key={item.id} className={`hover:bg-gray-50 ${selectedItems.has(item.id) ? 'bg-blue-50' : ''}`}>
                    {/* Checkbox */}
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedItems.has(item.id)}
                        onChange={() => handleSelectItem(item.id)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </td>

                    {/* Task */}
                    <td className="px-4 py-3">
                      <div>
                        <div className="font-medium text-gray-900 text-sm">
                          {item.task_name}
                        </div>
                        <div className="text-xs text-gray-500">
                          {item.task_code}
                        </div>
                      </div>
                    </td>

                    {/* Employee */}
                    <td className="px-4 py-3">
                      <div>
                        <div className="text-sm text-gray-900">{item.employee_name}</div>
                        <div className="text-xs text-gray-500">{item.department_name}</div>
                      </div>
                    </td>

                    {/* Completion */}
                    <td className="px-4 py-3">
                      <div className="flex justify-center">
                        <ProgressRing percentage={item.completion_percentage} size={36} strokeWidth={3} />
                      </div>
                    </td>

                    {/* Self Score */}
                    <td className="px-4 py-3">
                      <div className="flex justify-center">
                        <ScoreBadge score={item.self_score} size="sm" />
                      </div>
                    </td>

                    {/* Date - FIXED: use submitted_at */}
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {item.submitted_at ? new Date(item.submitted_at).toLocaleDateString('vi-VN') : '—'}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {onViewDetail && originalItem && (
                          <button
                            onClick={() => onViewDetail(originalItem)}
                            className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded"
                            title="Xem chi tiết"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          </button>
                        )}
                        {onApprove && originalItem && (
                          <button
                            onClick={() => onApprove(originalItem)}
                            className="p-1.5 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded"
                            title="Phê duyệt"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          </button>
                        )}
                        {onRequestInfo && originalItem && (
                          <button
                            onClick={() => onRequestInfo(originalItem)}
                            className="p-1.5 text-gray-500 hover:text-orange-600 hover:bg-orange-50 rounded"
                            title="Yêu cầu bổ sung"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </button>
                        )}
                        {onReject && originalItem && (
                          <button
                            onClick={() => onReject(originalItem)}
                            className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded"
                            title="Từ chối"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// APPROVAL QUEUE CARD - Dạng card cho mobile/compact view
// ============================================================================

interface ApprovalQueueCardProps {
  item: PendingApprovalItem | SelfEvaluationWithRelations;
  onApprove?: () => void;
  onReject?: () => void;
  onRequestInfo?: () => void;
  onViewDetail?: () => void;
}

export const ApprovalQueueCard: React.FC<ApprovalQueueCardProps> = ({
  item,
  onApprove,
  onReject,
  onRequestInfo,
  onViewDetail,
}) => {
  const normalized = normalizeItem(item);

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-gray-900 truncate">
            {normalized.task_name}
          </h4>
          <p className="text-xs text-gray-500">{normalized.task_code}</p>
        </div>
        <EvaluationStatusBadge status={normalized.status} size="sm" />
      </div>

      {/* Employee info */}
      <div className="flex items-center gap-2 text-sm">
        <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center text-gray-600 font-medium">
          {normalized.employee_name.charAt(0)}
        </div>
        <div>
          <div className="font-medium text-gray-900">{normalized.employee_name}</div>
          <div className="text-xs text-gray-500">{normalized.department_name}</div>
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center justify-between py-2 border-y border-gray-100">
        <div className="flex items-center gap-2">
          <ProgressRing percentage={normalized.completion_percentage} size={32} strokeWidth={3} />
          <span className="text-xs text-gray-500">Hoàn thành</span>
        </div>
        <div className="text-right">
          <ScoreBadge score={normalized.self_score} size="sm" />
          <div className="text-xs text-gray-500 mt-1">Điểm tự ĐG</div>
        </div>
      </div>

      {/* Date - FIXED: use submitted_at */}
      <div className="text-xs text-gray-500">
        Gửi ngày: {normalized.submitted_at ? new Date(normalized.submitted_at).toLocaleDateString('vi-VN') : '—'}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-2">
        {onViewDetail && (
          <button
            onClick={onViewDetail}
            className="flex-1 px-3 py-1.5 text-sm text-gray-600 bg-gray-100 rounded hover:bg-gray-200"
          >
            Chi tiết
          </button>
        )}
        {onApprove && (
          <button
            onClick={onApprove}
            className="flex-1 px-3 py-1.5 text-sm text-white bg-green-600 rounded hover:bg-green-700"
          >
            Duyệt
          </button>
        )}
        {onReject && (
          <button
            onClick={onReject}
            className="px-3 py-1.5 text-sm text-red-600 bg-red-50 rounded hover:bg-red-100"
          >
            Từ chối
          </button>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// EXPORTS
// ============================================================================

export default ApprovalQueue;