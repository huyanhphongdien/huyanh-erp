// ============================================================================
// ACTIVITY TIMELINE COMPONENT - FIXED
// File: src/features/tasks/components/ActivityTimeline.tsx
// Huy Anh ERP System - Phase 4.4: Activity Timeline
// ============================================================================

import React, { useState, useEffect } from 'react';
import {
  History,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Filter,
  Clock,
} from 'lucide-react';
import {
  taskActivityService,
  type TaskActivity,
  type TaskActivityAction,
  ACTION_CONFIG,
  formatRelativeTime,
  generateActivityDescription,
} from '../../../services/taskActivityService';

// ============================================================================
// TYPES
// ============================================================================

interface ActivityTimelineProps {
  taskId: string;
  maxItems?: number;
  showFilters?: boolean;
}

// ============================================================================
// ACTIVITY ITEM COMPONENT
// ============================================================================

function ActivityItem({ activity }: { activity: TaskActivity }) {
  const config = ACTION_CONFIG[activity.action] || {
    label: activity.action,
    icon: '📌',
    color: 'text-gray-600',
    bgColor: 'bg-gray-100',
  };

  const actorName = activity.actor?.full_name || 'Hệ thống';
  const description = generateActivityDescription(activity);

  return (
    <div className="flex gap-3 group">
      {/* Timeline dot */}
      <div className="flex flex-col items-center">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${config.bgColor}`}>
          {config.icon}
        </div>
        <div className="w-0.5 bg-gray-200 flex-1 mt-2 group-last:hidden"></div>
      </div>

      {/* Content */}
      <div className="flex-1 pb-6 group-last:pb-0">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            {/* Actor + Action */}
            <p className="text-sm">
              <span className="font-medium text-gray-900">{actorName}</span>
              {' '}
              <span className={config.color}>{description}</span>
            </p>

            {/* Details preview */}
            {activity.details?.content_preview && (
              <p className="mt-1 text-xs text-gray-500 italic line-clamp-2">
                "{activity.details.content_preview}..."
              </p>
            )}

            {/* File info */}
            {activity.details?.file_name && (
              <p className="mt-1 text-xs text-gray-500 flex items-center gap-1">
                📄 {activity.details.file_name}
                {activity.details.file_size && (
                  <span className="text-gray-400">
                    ({taskActivityService.formatFileSize(activity.details.file_size)})
                  </span>
                )}
              </p>
            )}

            {/* Comments from approval */}
            {activity.details?.comments && activity.action === 'approved' && (
              <p className="mt-1 text-xs text-gray-500 italic">
                "{activity.details.comments}"
              </p>
            )}
          </div>

          {/* Time */}
          <span className="text-xs text-gray-400 whitespace-nowrap flex items-center gap-1">
            <Clock size={12} />
            {formatRelativeTime(activity.created_at)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// FILTER CHIPS
// ============================================================================

const FILTER_OPTIONS: { value: TaskActivityAction | 'all'; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'status_changed', label: 'Trạng thái' },
  { value: 'progress_updated', label: 'Tiến độ' },
  { value: 'assigned', label: 'Giao việc' },
  { value: 'comment_added', label: 'Bình luận' },
  { value: 'attachment_added', label: 'File' },
  { value: 'approved', label: 'Phê duyệt' },
];

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function ActivityTimeline({
  taskId,
  maxItems = 10,
  showFilters = true,
}: ActivityTimelineProps) {
  // State
  const [activities, setActivities] = useState<TaskActivity[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Filter state
  const [activeFilter, setActiveFilter] = useState<TaskActivityAction | 'all'>('all');

  // Pagination
  const [offset, setOffset] = useState(0);
  const hasMore = activities.length < total;

  // ========== FETCH ACTIVITIES ==========
  const fetchActivities = async (reset = false) => {
    if (reset) {
      setLoading(true);
      setOffset(0);
    } else {
      setLoadingMore(true);
    }
    setError(null);

    const currentOffset = reset ? 0 : offset;

    const filters: any = {
      task_id: taskId,
      limit: maxItems,
      offset: currentOffset,
    };

    // Apply action filter
    if (activeFilter !== 'all') {
      // Group related actions
      if (activeFilter === 'approved') {
        filters.actions = ['approved', 'rejected', 'revision_requested'];
      } else if (activeFilter === 'assigned') {
        filters.actions = ['assigned', 'unassigned'];
      } else if (activeFilter === 'comment_added') {
        filters.actions = ['comment_added', 'comment_edited', 'comment_deleted'];
      } else if (activeFilter === 'attachment_added') {
        filters.actions = ['attachment_added', 'attachment_deleted'];
      } else {
        filters.actions = [activeFilter];
      }
    }

    const { data, total: totalCount, error: fetchError } = await taskActivityService.getActivities(filters);

    if (fetchError) {
      setError(fetchError.message);
    } else {
      if (reset) {
        setActivities(data);
      } else {
        setActivities(prev => [...prev, ...data]);
      }
      setTotal(totalCount);
      setOffset(currentOffset + data.length);
    }

    setLoading(false);
    setLoadingMore(false);
  };

  // Initial fetch
  useEffect(() => {
    if (taskId) {
      fetchActivities(true);
    }
  }, [taskId, activeFilter]);

  // ========== HANDLERS ==========

  const handleLoadMore = () => {
    if (!loadingMore && hasMore) {
      fetchActivities(false);
    }
  };

  const handleRefresh = (e: React.MouseEvent) => {
    e.stopPropagation();
    fetchActivities(true);
  };

  const handleFilterChange = (filter: TaskActivityAction | 'all') => {
    setActiveFilter(filter);
  };

  const handleToggleCollapse = () => {
    setIsCollapsed(!isCollapsed);
  };

  // ========== RENDER ==========

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Header - FIXED: Sử dụng div thay vì button, tách riêng các nút */}
      <div className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors">
        {/* Left side - clickable to toggle */}
        <div 
          onClick={handleToggleCollapse}
          className="flex items-center gap-2 flex-1 cursor-pointer"
        >
          <History className="w-5 h-5 text-indigo-600" />
          <h3 className="font-semibold text-gray-900">Lịch sử hoạt động</h3>
          {total > 0 && (
            <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-xs font-medium rounded-full">
              {total}
            </span>
          )}
        </div>
        
        {/* Right side - buttons */}
        <div className="flex items-center gap-2">
          {/* Refresh button */}
          <button
            onClick={handleRefresh}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
            title="Làm mới"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          
          {/* Toggle button */}
          <button
            onClick={handleToggleCollapse}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
          >
            {isCollapsed ? (
              <ChevronDown className="w-5 h-5" />
            ) : (
              <ChevronUp className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>

      {/* Content */}
      {!isCollapsed && (
        <div className="px-4 pb-4">
          {/* Filters */}
          {showFilters && (
            <div className="mb-4 flex items-center gap-2 flex-wrap">
              <Filter size={14} className="text-gray-400" />
              {FILTER_OPTIONS.map(option => (
                <button
                  key={option.value}
                  onClick={() => handleFilterChange(option.value)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-full transition-colors ${
                    activeFilter === option.value
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Loading state */}
          {loading ? (
            <div className="py-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
              <p className="mt-2 text-sm text-gray-500">Đang tải lịch sử...</p>
            </div>
          ) : activities.length === 0 ? (
            <div className="py-8 text-center">
              <History className="w-12 h-12 text-gray-300 mx-auto mb-2" />
              <p className="text-gray-500">Chưa có hoạt động nào</p>
              {activeFilter !== 'all' && (
                <button
                  onClick={() => setActiveFilter('all')}
                  className="mt-2 text-sm text-indigo-600 hover:text-indigo-700"
                >
                  Xem tất cả hoạt động
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Activities list */}
              <div className="space-y-0">
                {activities.map(activity => (
                  <ActivityItem key={activity.id} activity={activity} />
                ))}
              </div>

              {/* Load more */}
              {hasMore && (
                <div className="mt-4 text-center">
                  <button
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                    className="px-4 py-2 text-sm text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg disabled:opacity-50"
                  >
                    {loadingMore ? (
                      <span className="flex items-center gap-2">
                        <RefreshCw size={14} className="animate-spin" />
                        Đang tải...
                      </span>
                    ) : (
                      `Xem thêm (còn ${total - activities.length})`
                    )}
                  </button>
                </div>
              )}

              {/* Summary */}
              {!hasMore && activities.length > 0 && (
                <p className="mt-4 text-center text-xs text-gray-400">
                  Đã hiển thị tất cả {total} hoạt động
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default ActivityTimeline;