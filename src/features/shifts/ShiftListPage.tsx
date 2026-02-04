// ============================================================
// SHIFT LIST PAGE - Quản lý ca làm việc
// File: src/features/shifts/ShiftListPage.tsx
// ============================================================

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { shiftService } from '../../services';
import { Card, Button, Modal, ConfirmDialog } from '../../components/ui';
import { ShiftForm } from './ShiftForm';
import { DepartmentShiftConfig } from './DepartmentShiftConfig';
import { 
  Plus, Pencil, Trash2, Timer, Building2, 
  Sun, Moon, Sunrise, Clock, Search, Filter
} from 'lucide-react';

// ============================================================
// TYPES
// ============================================================

interface Shift {
  id: string;
  code: string;
  name: string;
  shift_category: 'short' | 'long' | 'admin';
  start_time: string;
  end_time: string;
  crosses_midnight: boolean;
  standard_hours: number;
  break_minutes: number;
  late_threshold_minutes: number;
  early_leave_threshold_minutes: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ============================================================
// CONSTANTS
// ============================================================

const CATEGORY_LABELS: Record<string, string> = {
  short: 'Ca ngắn (8h)',
  long: 'Ca dài (12h)',
  admin: 'Hành chính',
};

const CATEGORY_COLORS: Record<string, string> = {
  short: 'bg-blue-100 text-blue-800',
  long: 'bg-purple-100 text-purple-800',
  admin: 'bg-green-100 text-green-800',
};

const SHIFT_ICONS: Record<string, React.ReactNode> = {
  SHORT_1: <Sunrise size={16} className="text-orange-500" />,
  SHORT_2: <Sun size={16} className="text-yellow-500" />,
  SHORT_3: <Moon size={16} className="text-indigo-500" />,
  LONG_DAY: <Sun size={16} className="text-amber-500" />,
  LONG_NIGHT: <Moon size={16} className="text-purple-500" />,
  ADMIN_PROD: <Clock size={16} className="text-emerald-500" />,
  ADMIN_OFFICE: <Clock size={16} className="text-teal-500" />,
};

// ============================================================
// HELPER
// ============================================================

function formatTime(timeStr: string): string {
  if (!timeStr) return '-';
  // timeStr = 'HH:MM:SS' or 'HH:MM'
  return timeStr.substring(0, 5);
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export function ShiftListPage() {
  const queryClient = useQueryClient();
  
  // State
  const [activeTab, setActiveTab] = useState<'shifts' | 'config'>('shifts');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Query
  const { data: shifts, isLoading } = useQuery({
    queryKey: ['shifts', search, categoryFilter],
    queryFn: () => shiftService.getAll({ 
      page: 1, 
      pageSize: 50, 
      search: search || undefined,
      category: categoryFilter !== 'all' ? categoryFilter : undefined 
    }),
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: shiftService.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shifts'] });
      setDeleteId(null);
    },
  });

  // Handlers
  const handleCreate = () => {
    setSelectedShift(null);
    setIsModalOpen(true);
  };

  const handleEdit = (shift: Shift) => {
    setSelectedShift(shift);
    setIsModalOpen(true);
  };

  const handleFormSuccess = () => {
    setIsModalOpen(false);
    setSelectedShift(null);
    queryClient.invalidateQueries({ queryKey: ['shifts'] });
  };

  // Filter shifts
  const filteredShifts = (shifts?.data || []).filter(s => {
    if (search) {
      const q = search.toLowerCase();
      return s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q);
    }
    return true;
  });

  // Group by category
  const grouped = {
    short: filteredShifts.filter(s => s.shift_category === 'short'),
    long: filteredShifts.filter(s => s.shift_category === 'long'),
    admin: filteredShifts.filter(s => s.shift_category === 'admin'),
  };

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Quản lý ca làm việc</h1>
          <p className="text-sm text-gray-500 mt-1">
            Thiết lập ca và cấu hình phòng ban
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit">
        <button
          onClick={() => setActiveTab('shifts')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
            activeTab === 'shifts'
              ? 'bg-white text-blue-600 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Timer size={16} />
          Danh sách ca
        </button>
        <button
          onClick={() => setActiveTab('config')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
            activeTab === 'config'
              ? 'bg-white text-blue-600 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Building2 size={16} />
          Cấu hình phòng ban
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'shifts' ? (
        <>
          {/* Toolbar */}
          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <div className="relative flex-1 max-w-md">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Tìm theo tên, mã ca..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            
            <div className="flex gap-2">
              <select
                value={categoryFilter}
                onChange={e => setCategoryFilter(e.target.value)}
                className="px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">Tất cả loại</option>
                <option value="short">Ca ngắn (8h)</option>
                <option value="long">Ca dài (12h)</option>
                <option value="admin">Hành chính</option>
              </select>

              <button
                onClick={handleCreate}
                className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                <Plus size={16} />
                Thêm ca
              </button>
            </div>
          </div>

          {/* Shift Cards by Category */}
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="animate-pulse bg-white rounded-xl p-6 border">
                  <div className="h-5 bg-gray-200 rounded w-32 mb-4" />
                  <div className="space-y-3">
                    <div className="h-16 bg-gray-100 rounded" />
                    <div className="h-16 bg-gray-100 rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-6">
              {(categoryFilter === 'all' 
                ? (['short', 'long', 'admin'] as const) 
                : [categoryFilter as 'short' | 'long' | 'admin']
              ).map(cat => {
                const catShifts = grouped[cat];
                if (catShifts.length === 0) return null;

                return (
                  <div key={cat} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    {/* Category Header */}
                    <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
                      <div className="flex items-center gap-3">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${CATEGORY_COLORS[cat]}`}>
                          {CATEGORY_LABELS[cat]}
                        </span>
                        <span className="text-sm text-gray-500">
                          {catShifts.length} ca
                        </span>
                      </div>
                    </div>

                    {/* Shift Items */}
                    <div className="divide-y divide-gray-100">
                      {catShifts.map(shift => (
                        <div 
                          key={shift.id} 
                          className="px-6 py-4 flex items-center gap-4 hover:bg-gray-50/50 transition-colors"
                        >
                          {/* Icon */}
                          <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
                            {SHIFT_ICONS[shift.code] || <Clock size={16} className="text-gray-400" />}
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h3 className="font-medium text-gray-900">{shift.name}</h3>
                              <span className="text-xs text-gray-400 font-mono">{shift.code}</span>
                              {shift.crosses_midnight && (
                                <span className="px-1.5 py-0.5 bg-indigo-50 text-indigo-600 text-xs rounded font-medium">
                                  Qua đêm
                                </span>
                              )}
                              {!shift.is_active && (
                                <span className="px-1.5 py-0.5 bg-red-50 text-red-600 text-xs rounded font-medium">
                                  Tắt
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                              <span>
                                🕐 {formatTime(shift.start_time)} - {formatTime(shift.end_time)}
                              </span>
                              <span>⏱️ {shift.standard_hours}h chuẩn</span>
                              <span>☕ Nghỉ {shift.break_minutes} phút</span>
                              <span className="hidden md:inline">
                                ⏰ Trễ &gt;{shift.late_threshold_minutes}′ | Sớm &gt;{shift.early_leave_threshold_minutes}′
                              </span>
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button
                              onClick={() => handleEdit(shift)}
                              className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              title="Sửa"
                            >
                              <Pencil size={16} />
                            </button>
                            <button
                              onClick={() => setDeleteId(shift.id)}
                              className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Xóa"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}

              {filteredShifts.length === 0 && (
                <div className="text-center py-12 bg-white rounded-xl border">
                  <Timer size={48} className="mx-auto text-gray-300 mb-3" />
                  <p className="text-gray-500">Không tìm thấy ca làm việc nào</p>
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <DepartmentShiftConfig />
      )}

      {/* Shift Form Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setSelectedShift(null); }}
        title={selectedShift ? 'Sửa ca làm việc' : 'Thêm ca làm việc'}
        size="lg"
      >
        <ShiftForm
          initialData={selectedShift}
          onSuccess={handleFormSuccess}
          onCancel={() => { setIsModalOpen(false); setSelectedShift(null); }}
        />
      </Modal>

      {/* Confirm Delete */}
      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && deleteMutation.mutate(deleteId)}
        title="Xóa ca làm việc"
        message="Bạn có chắc muốn xóa ca này? Hành động này không thể hoàn tác. Các phân ca đang sử dụng ca này sẽ bị ảnh hưởng."
        confirmText="Xóa"
        isLoading={deleteMutation.isPending}
        variant="danger"
      />
    </div>
  );
}

export default ShiftListPage;