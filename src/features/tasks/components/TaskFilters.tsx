// ============================================================================
// TASK FILTERS COMPONENT
// File: src/features/tasks/components/TaskFilters.tsx
// Huy Anh ERP System
// ============================================================================
// FIXED: Khớp với database constraints thực tế
// Status: draft, in_progress, paused, finished, cancelled
// Priority: low, medium, high, urgent
// UPDATED: Thêm prop disableDepartmentFilter cho phân quyền
// ============================================================================

import React, { useState, useEffect } from 'react';
import { Search, Filter, X, ChevronDown, ChevronUp, Lock } from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

export interface TaskFiltersValue {
  search: string;
  status: string[];
  priority: string[];
  assignee_id: string | null;
  department_id: string | null;
  due_date_from: string | null;
  due_date_to: string | null;
  created_date_from: string | null;
  created_date_to: string | null;
  tags: string[];
  task_source: string[];
}

export interface TaskFiltersProps {
  value: TaskFiltersValue;
  onChange: (filters: TaskFiltersValue) => void;
  employees?: Array<{ id: string; full_name: string }>;
  departments?: Array<{ id: string; name: string }>;
  availableTags?: string[];
  isLoading?: boolean;
  compact?: boolean;
  className?: string;
  // NEW: Disable department filter cho Manager/Employee
  disableDepartmentFilter?: boolean;
}

// ============================================================================
// CONSTANTS - KHỚP VỚI DATABASE CONSTRAINTS
// ============================================================================

export const DEFAULT_FILTERS: TaskFiltersValue = {
  search: '',
  status: [],
  priority: [],
  assignee_id: null,
  department_id: null,
  due_date_from: null,
  due_date_to: null,
  created_date_from: null,
  created_date_to: null,
  task_source: [],
  tags: [],
};

// ✅ STATUS_OPTIONS - Khớp với constraint: draft, in_progress, paused, finished, cancelled
const STATUS_OPTIONS = [
  { value: 'draft', label: 'Nháp', color: 'bg-gray-100 text-gray-600' },
  { value: 'in_progress', label: 'Đang thực hiện', color: 'bg-blue-100 text-blue-700' },
  { value: 'paused', label: 'Tạm dừng', color: 'bg-yellow-100 text-yellow-700' },
  { value: 'finished', label: 'Hoàn thành', color: 'bg-green-100 text-green-700' },
  { value: 'cancelled', label: 'Đã hủy', color: 'bg-red-100 text-red-700' },
];

// ✅ PRIORITY_OPTIONS - Khớp với constraint: low, medium, high, urgent
const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Thấp', color: 'bg-gray-100 text-gray-700' },
  { value: 'medium', label: 'Trung bình', color: 'bg-blue-100 text-blue-700' },
  { value: 'high', label: 'Cao', color: 'bg-orange-100 text-orange-700' },
  { value: 'urgent', label: 'Khẩn cấp', color: 'bg-red-100 text-red-700' },
];

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const TaskFilters: React.FC<TaskFiltersProps> = ({
  value = DEFAULT_FILTERS,
  onChange,
  employees = [],
  departments = [],
  availableTags = [],
  isLoading = false,
  compact = false,
  className = '',
  disableDepartmentFilter = false, // NEW
}) => {
  // Ensure value has all required properties
  const safeValue: TaskFiltersValue = {
    search: value?.search ?? '',
    status: value?.status ?? [],
    priority: value?.priority ?? [],
    assignee_id: value?.assignee_id ?? null,
    department_id: value?.department_id ?? null,
    due_date_from: value?.due_date_from ?? null,
    due_date_to: value?.due_date_to ?? null,
    created_date_from: value?.created_date_from ?? null,
    created_date_to: value?.created_date_to ?? null,
    tags: value?.tags ?? [],
    task_source: value?.task_source ?? [],
  };

  const [isExpanded, setIsExpanded] = useState(!compact);
  const [localSearch, setLocalSearch] = useState(safeValue.search);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (localSearch !== safeValue.search) {
        console.log('🔍 [TaskFilters] Search changed:', localSearch);
        onChange({ ...safeValue, search: localSearch });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [localSearch]);

  // Sync local search with value
  useEffect(() => {
    setLocalSearch(safeValue.search);
  }, [safeValue.search]);

  // Count active filters
  const activeFilterCount = [
    safeValue.status.length > 0,
    safeValue.priority.length > 0,
    safeValue.assignee_id,
    // Không đếm department nếu đang bị disable
    !disableDepartmentFilter && safeValue.department_id,
    safeValue.due_date_from || safeValue.due_date_to,
    safeValue.created_date_from || safeValue.created_date_to,
    safeValue.tags.length > 0,
  ].filter(Boolean).length;

  // Handle multi-select toggle
  const toggleArrayValue = (key: 'status' | 'priority' | 'tags', val: string) => {
    const current = safeValue[key];
    const updated = current.includes(val)
      ? current.filter(v => v !== val)
      : [...current, val];
    console.log(`🔄 [TaskFilters] Toggle ${key}:`, val, '→', updated);
    onChange({ ...safeValue, [key]: updated });
  };

  // Handle single value change
  const handleChange = (key: keyof TaskFiltersValue, val: any) => {
    console.log(`📝 [TaskFilters] Change ${key}:`, val);
    onChange({ ...safeValue, [key]: val || null });
  };

  // Clear all filters
  const clearFilters = () => {
    console.log('🗑️ [TaskFilters] Clear all filters');
    onChange(DEFAULT_FILTERS);
    setLocalSearch('');
  };

  // Check if any filter is active
  const hasActiveFilters = activeFilterCount > 0 || safeValue.search;

  return (
    <div className={`bg-white rounded-lg border border-gray-200 ${className}`}>
      {/* Search bar + Toggle */}
      <div className="p-4 flex flex-col sm:flex-row gap-3">
        {/* Search Input */}
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            placeholder="Tìm kiếm công việc..."
            disabled={isLoading}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          {localSearch && (
            <button
              onClick={() => { setLocalSearch(''); onChange({ ...safeValue, search: '' }); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Filter Toggle + Clear */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className={`
              flex items-center gap-2 px-4 py-2.5 rounded-lg border transition-colors
              ${isExpanded 
                ? 'bg-blue-50 border-blue-200 text-blue-700' 
                : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
              }
            `}
          >
            <Filter size={18} />
            <span>Bộ lọc</span>
            {activeFilterCount > 0 && (
              <span className="px-1.5 py-0.5 text-xs font-medium bg-blue-600 text-white rounded-full">
                {activeFilterCount}
              </span>
            )}
            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 px-3 py-2.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            >
              <X size={16} />
              <span className="hidden sm:inline">Xóa lọc</span>
            </button>
          )}
        </div>
      </div>

      {/* Expanded Filters */}
      {isExpanded && (
        <div className="px-4 pb-4 border-t border-gray-100 pt-4 space-y-4">
          {/* Row 1: Status & Priority */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Status */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Trạng thái
              </label>
              <div className="flex flex-wrap gap-2">
                {STATUS_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => toggleArrayValue('status', option.value)}
                    className={`
                      px-3 py-1.5 text-sm rounded-full transition-all
                      ${safeValue.status.includes(option.value)
                        ? `${option.color} ring-2 ring-offset-1 ring-blue-500`
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }
                    `}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Priority */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Mức độ ưu tiên
              </label>
              <div className="flex flex-wrap gap-2">
                {PRIORITY_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => toggleArrayValue('priority', option.value)}
                    className={`
                      px-3 py-1.5 text-sm rounded-full transition-all
                      ${safeValue.priority.includes(option.value)
                        ? `${option.color} ring-2 ring-offset-1 ring-blue-500`
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }
                    `}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Row 2: Department & Assignee */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Department - CÓ THỂ BỊ DISABLE */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Phòng ban
                {disableDepartmentFilter && (
                  <span className="ml-2 inline-flex items-center gap-1 text-xs text-blue-600 font-normal">
                    <Lock size={12} />
                    Giới hạn theo quyền
                  </span>
                )}
              </label>
              <select
                value={safeValue.department_id || ''}
                onChange={(e) => handleChange('department_id', e.target.value)}
                disabled={disableDepartmentFilter}
                className={`
                  w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500
                  ${disableDepartmentFilter 
                    ? 'bg-gray-100 text-gray-500 cursor-not-allowed' 
                    : 'bg-white'
                  }
                `}
              >
                <option value="">Tất cả phòng ban</option>
                {departments.map((dept) => (
                  <option key={dept.id} value={dept.id}>{dept.name}</option>
                ))}
              </select>
              {disableDepartmentFilter && (
                <p className="mt-1 text-xs text-gray-500">
                  Bạn chỉ xem được công việc trong phòng ban của mình
                </p>
              )}
            </div>

            {/* Assignee */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Người thực hiện
              </label>
              <select
                value={safeValue.assignee_id || ''}
                onChange={(e) => handleChange('assignee_id', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">Tất cả nhân viên</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>{emp.full_name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Row 3: Date Ranges */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Due Date Range */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Ngày hết hạn
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={safeValue.due_date_from || ''}
                  onChange={(e) => handleChange('due_date_from', e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-gray-400">→</span>
                <input
                  type="date"
                  value={safeValue.due_date_to || ''}
                  onChange={(e) => handleChange('due_date_to', e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Created Date Range */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Ngày tạo
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={safeValue.created_date_from || ''}
                  onChange={(e) => handleChange('created_date_from', e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-gray-400">→</span>
                <input
                  type="date"
                  value={safeValue.created_date_to || ''}
                  onChange={(e) => handleChange('created_date_to', e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Row 4: Tags (if available) */}
          {availableTags.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Nhãn (Tags)
              </label>
              <div className="flex flex-wrap gap-2">
                {availableTags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => toggleArrayValue('tags', tag)}
                    className={`
                      px-3 py-1.5 text-sm rounded-full transition-all
                      ${safeValue.tags.includes(tag)
                        ? 'bg-blue-100 text-blue-700 ring-2 ring-offset-1 ring-blue-500'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }
                    `}
                  >
                    #{tag}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Quick Filters */}
          <div className="pt-3 border-t border-gray-100">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Lọc nhanh
            </label>
            <div className="flex flex-wrap gap-2">
              <QuickFilterButton
                label="Quá hạn"
                icon="⚠️"
                active={false}
                onClick={() => {
                  // Quá hạn = due_date < today (không bao gồm hôm nay)
                  const today = new Date();
                  const yesterday = new Date(today);
                  yesterday.setDate(today.getDate() - 1);
                  const yesterdayStr = yesterday.toISOString().split('T')[0];
                  
                  onChange({ 
                    ...DEFAULT_FILTERS,
                    due_date_to: yesterdayStr,
                    // Loại bỏ các status đã hoàn thành
                    status: ['draft', 'in_progress', 'paused'],
                  });
                }}
              />
              <QuickFilterButton
                label="Đến hạn hôm nay"
                icon="📅"
                active={false}
                onClick={() => {
                  const today = new Date().toISOString().split('T')[0];
                  onChange({ ...DEFAULT_FILTERS, due_date_from: today, due_date_to: today });
                }}
              />
              <QuickFilterButton
                label="Tuần này"
                icon="📆"
                active={false}
                onClick={() => {
                  const today = new Date();
                  const startOfWeek = new Date(today);
                  startOfWeek.setDate(today.getDate() - today.getDay() + 1);
                  const endOfWeek = new Date(startOfWeek);
                  endOfWeek.setDate(startOfWeek.getDate() + 6);
                  onChange({ 
                    ...DEFAULT_FILTERS, 
                    due_date_from: startOfWeek.toISOString().split('T')[0],
                    due_date_to: endOfWeek.toISOString().split('T')[0],
                  });
                }}
              />
              <QuickFilterButton
                label="Đang thực hiện"
                icon="🔄"
                active={safeValue.status.includes('in_progress')}
                onClick={() => onChange({ ...DEFAULT_FILTERS, status: ['in_progress'] })}
              />
              <QuickFilterButton
                label="Ưu tiên cao"
                icon="🔥"
                active={safeValue.priority.includes('high') || safeValue.priority.includes('urgent')}
                onClick={() => onChange({ ...DEFAULT_FILTERS, priority: ['high', 'urgent'] })}
              />
            </div>
            {/* ★ Filter theo loại công việc */}
            <div className="flex flex-wrap gap-1.5 mt-2">
              {[
                { value: 'assigned', label: 'Được giao', icon: '📋' },
                { value: 'project', label: 'Dự án', icon: '📁' },
                { value: 'recurring', label: 'Định kỳ', icon: '🔁' },
                { value: 'self', label: 'Tự giao', icon: '✍️' },
              ].map(s => (
                <QuickFilterButton
                  key={s.value}
                  label={s.label}
                  icon={s.icon}
                  active={safeValue.task_source.includes(s.value)}
                  onClick={() => onChange({
                    ...DEFAULT_FILTERS,
                    task_source: safeValue.task_source.includes(s.value) ? [] : [s.value],
                  })}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Active Filters Summary (when collapsed) */}
      {!isExpanded && hasActiveFilters && (
        <div className="px-4 pb-3 flex flex-wrap gap-2">
          {safeValue.status.map((s) => (
            <FilterTag 
              key={s} 
              label={STATUS_OPTIONS.find(o => o.value === s)?.label || s}
              onRemove={() => toggleArrayValue('status', s)}
            />
          ))}
          {safeValue.priority.map((p) => (
            <FilterTag 
              key={p} 
              label={PRIORITY_OPTIONS.find(o => o.value === p)?.label || p}
              onRemove={() => toggleArrayValue('priority', p)}
            />
          ))}
          {/* Chỉ hiện department tag nếu không bị disable */}
          {!disableDepartmentFilter && safeValue.department_id && (
            <FilterTag 
              label={departments.find(d => d.id === safeValue.department_id)?.name || 'Phòng ban'}
              onRemove={() => handleChange('department_id', null)}
            />
          )}
          {safeValue.assignee_id && (
            <FilterTag 
              label={employees.find(e => e.id === safeValue.assignee_id)?.full_name || 'Nhân viên'}
              onRemove={() => handleChange('assignee_id', null)}
            />
          )}
          {(safeValue.due_date_from || safeValue.due_date_to) && (
            <FilterTag 
              label={`Hạn: ${safeValue.due_date_from || '...'} → ${safeValue.due_date_to || '...'}`}
              onRemove={() => onChange({ ...safeValue, due_date_from: null, due_date_to: null })}
            />
          )}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// SUB COMPONENTS
// ============================================================================

interface QuickFilterButtonProps {
  label: string;
  icon: string;
  active: boolean;
  onClick: () => void;
}

function QuickFilterButton({ label, icon, active, onClick }: QuickFilterButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`
        flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-all
        ${active
          ? 'bg-blue-600 text-white'
          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
        }
      `}
    >
      <span>{icon}</span>
      <span>{label}</span>
    </button>
  );
}

interface FilterTagProps {
  label: string;
  onRemove: () => void;
}

function FilterTag({ label, onRemove }: FilterTagProps) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded-full">
      {label}
      <button onClick={onRemove} className="hover:text-blue-900">
        <X size={12} />
      </button>
    </span>
  );
}

// ============================================================================
// EXPORTS
// ============================================================================

export default TaskFilters;