// ============================================================
// SHIFT OVERRIDE MODAL - Đổi ca / Thêm ca đột xuất
// File: src/features/shift-assignments/ShiftOverrideModal.tsx
// ============================================================
// V2: Hỗ trợ 2 hành động khi click ô đã có ca:
//   ① Đổi ca (override) — thay ca hiện tại bằng ca khác
//   ② Thêm ca (add) — thêm ca thứ 2 trong cùng ngày
// ============================================================

import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { shiftAssignmentService, shiftService } from '../../services';
import { Modal, Button } from '../../components/ui';
import {
  ArrowRightLeft,
  Plus,
  Trash2,
  AlertCircle,
  Clock,
  Info,
} from 'lucide-react';

// ============================================================
// TYPES
// ============================================================

type ActionMode = 'assign' | 'override' | 'add';

interface ExistingShift {
  id: string;
  shift_id: string;
  shift_name: string;
  assignment_type: string;
  start_time?: string;
  end_time?: string;
}

interface ShiftOverrideModalProps {
  isOpen: boolean;
  onClose: () => void;
  employeeId: string;
  employeeName: string;
  date: string;
  /** Ca hiện tại (nếu ô đã có ca) — có thể là 1 object hoặc array nếu đã có 2 ca */
  currentShift?: ExistingShift | null;
  /** Tất cả ca đã phân trong ngày này cho NV (dùng khi đã có 2 ca) */
  allShiftsOnDate?: ExistingShift[];
  currentUserId: string;
  /** Số ca tối đa/ngày — mặc định 2 */
  maxShiftsPerDay?: number;
}

// ============================================================
// CONSTANTS
// ============================================================

const SHIFT_CATEGORY_LABELS: Record<string, string> = {
  short: 'Ca ngắn (8h)',
  long: 'Ca dài (12h)',
  admin: 'Hành chính',
};

const ACTION_CONFIG = {
  assign: {
    title: 'Phân ca',
    icon: Clock,
    color: 'blue',
    buttonText: 'Phân ca',
  },
  override: {
    title: 'Đổi ca đột xuất',
    icon: ArrowRightLeft,
    color: 'amber',
    buttonText: 'Đổi ca',
  },
  add: {
    title: 'Thêm ca trong ngày',
    icon: Plus,
    color: 'green',
    buttonText: 'Thêm ca',
  },
} as const;

// ============================================================
// COMPONENT
// ============================================================

export function ShiftOverrideModal({
  isOpen,
  onClose,
  employeeId,
  employeeName,
  date,
  currentShift,
  allShiftsOnDate = [],
  currentUserId,
  maxShiftsPerDay = 2,
}: ShiftOverrideModalProps) {
  const queryClient = useQueryClient();
  const [actionMode, setActionMode] = useState<ActionMode>('assign');
  const [selectedShiftId, setSelectedShiftId] = useState('');
  const [notes, setNotes] = useState('');

  // Tính toán trạng thái
  const existingShiftIds = useMemo(() => {
    const ids = new Set<string>();
    if (currentShift?.shift_id) ids.add(currentShift.shift_id);
    allShiftsOnDate.forEach((s) => ids.add(s.shift_id));
    return ids;
  }, [currentShift, allShiftsOnDate]);

  const totalExistingShifts = existingShiftIds.size;
  const canAddMore = totalExistingShifts < maxShiftsPerDay;
  const hasCurrentShift = !!currentShift;

  // Set default action mode khi mở modal
  useEffect(() => {
    if (isOpen) {
      if (!hasCurrentShift) {
        setActionMode('assign');
      } else {
        // Mặc định "Đổi ca", user có thể chuyển sang "Thêm ca"
        setActionMode('override');
      }
      setSelectedShiftId('');
      setNotes('');
    }
  }, [isOpen, hasCurrentShift]);

  // Load available shifts
  const { data: shiftsData } = useQuery({
    queryKey: ['shifts-for-override'],
    queryFn: () => shiftService.getAll({ page: 1, pageSize: 50 }),
    enabled: isOpen,
  });

  const shifts = shiftsData?.data || [];

  // Group shifts by category
  const groupedShifts = useMemo(() => {
    return shifts.reduce((acc: Record<string, any[]>, s: any) => {
      const cat = s.shift_category || 'other';
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(s);
      return acc;
    }, {});
  }, [shifts]);

  // Filter shifts dựa theo mode
  const filteredGroupedShifts = useMemo(() => {
    const result: Record<string, any[]> = {};
    for (const [cat, catShifts] of Object.entries(groupedShifts)) {
      const filtered = catShifts.filter((s: any) => {
        if (actionMode === 'override') {
          // Đổi ca: ẩn ca đang chọn (currentShift)
          return s.id !== currentShift?.shift_id;
        }
        if (actionMode === 'add') {
          // Thêm ca: ẩn tất cả ca đã có trong ngày
          return !existingShiftIds.has(s.id);
        }
        // Phân ca mới: hiện tất cả
        return true;
      });
      if (filtered.length > 0) {
        result[cat] = filtered;
      }
    }
    return result;
  }, [groupedShifts, actionMode, currentShift, existingShiftIds]);

  // ── Mutations ──

  // Override (đổi ca): xóa ca cũ + insert ca mới
  const overrideMutation = useMutation({
    mutationFn: async () => {
      return shiftAssignmentService.overrideShift({
        employee_id: employeeId,
        date,
        new_shift_id: selectedShiftId,
        created_by: currentUserId,
        notes: notes || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shift-calendar'] });
      queryClient.invalidateQueries({ queryKey: ['shift-assignments'] });
      handleClose();
    },
  });

  // Add (thêm ca): insert thêm 1 record mới, KHÔNG xóa ca cũ
  const addMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from('shift_assignments')
        .insert({
          employee_id: employeeId,
          shift_id: selectedShiftId,
          date,
          assignment_type: 'scheduled',
          created_by: currentUserId,
          notes: notes || `Thêm ca`,
        })
        .select('*')
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shift-calendar'] });
      queryClient.invalidateQueries({ queryKey: ['shift-assignments'] });
      handleClose();
    },
  });

  // Assign (phân ca mới cho ô trống)
  const assignMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from('shift_assignments')
        .insert({
          employee_id: employeeId,
          shift_id: selectedShiftId,
          date,
          assignment_type: 'scheduled',
          created_by: currentUserId,
          notes: notes || null,
        })
        .select('*')
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shift-calendar'] });
      queryClient.invalidateQueries({ queryKey: ['shift-assignments'] });
      handleClose();
    },
  });

  // Delete ca
  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!currentShift?.id) throw new Error('Không có ca để xóa');
      return shiftAssignmentService.delete(currentShift.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shift-calendar'] });
      queryClient.invalidateQueries({ queryKey: ['shift-assignments'] });
      handleClose();
    },
  });

  const handleClose = () => {
    setSelectedShiftId('');
    setNotes('');
    onClose();
  };

  const handleSubmit = () => {
    if (!selectedShiftId) return;

    switch (actionMode) {
      case 'override':
        overrideMutation.mutate();
        break;
      case 'add':
        addMutation.mutate();
        break;
      case 'assign':
        assignMutation.mutate();
        break;
    }
  };

  const handleDelete = () => {
    if (!currentShift?.id) return;
    if (window.confirm('Xóa ca đã phân cho nhân viên này?')) {
      deleteMutation.mutate();
    }
  };

  // Format date display
  const dateObj = new Date(date + 'T00:00:00');
  const dayNames = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
  const dateDisplay = `${dayNames[dateObj.getDay()]}, ${dateObj.toLocaleDateString('vi-VN')}`;

  const isLoading =
    overrideMutation.isPending ||
    addMutation.isPending ||
    assignMutation.isPending ||
    deleteMutation.isPending;

  const mutationError =
    overrideMutation.error || addMutation.error || assignMutation.error || deleteMutation.error;

  const activeConfig = ACTION_CONFIG[actionMode];

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={activeConfig.title}>
      <div className="space-y-4">
        {/* ── Thông tin nhân viên + ngày ── */}
        <div className="bg-gray-50 rounded-xl p-3 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">Nhân viên</span>
            <span className="text-sm font-medium text-gray-900">{employeeName}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">Ngày</span>
            <span className="text-sm font-medium text-gray-900">{dateDisplay}</span>
          </div>

          {/* Hiển thị tất cả ca đã phân trong ngày */}
          {totalExistingShifts > 0 && (
            <div className="flex items-start justify-between">
              <span className="text-sm text-gray-500">
                Ca hiện tại ({totalExistingShifts}/{maxShiftsPerDay})
              </span>
              <div className="text-right space-y-0.5">
                {currentShift && (
                  <div className="text-sm font-medium text-blue-600">
                    {currentShift.shift_name}
                    {currentShift.start_time && currentShift.end_time && (
                      <span className="text-xs text-gray-400 ml-1">
                        ({currentShift.start_time.substring(0, 5)}-
                        {currentShift.end_time.substring(0, 5)})
                      </span>
                    )}
                    {currentShift.assignment_type === 'override' && (
                      <span className="ml-1 text-xs text-yellow-600">(đã đổi)</span>
                    )}
                  </div>
                )}
                {/* Hiển thị các ca khác nếu có */}
                {allShiftsOnDate
                  .filter((s) => s.id !== currentShift?.id)
                  .map((s) => (
                    <div key={s.id} className="text-sm font-medium text-green-600">
                      {s.shift_name}
                      {s.start_time && s.end_time && (
                        <span className="text-xs text-gray-400 ml-1">
                          ({s.start_time.substring(0, 5)}-{s.end_time.substring(0, 5)})
                        </span>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Chọn hành động (chỉ hiện khi ô đã có ca) ── */}
        {hasCurrentShift && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Hành động</label>
            <div className="grid grid-cols-2 gap-2">
              {/* Nút Đổi ca */}
              <button
                type="button"
                onClick={() => {
                  setActionMode('override');
                  setSelectedShiftId('');
                }}
                className={`flex items-center justify-center gap-2 p-3 rounded-xl border-2 
                  transition-all text-sm font-medium min-h-[48px]
                  ${
                    actionMode === 'override'
                      ? 'border-amber-500 bg-amber-50 text-amber-700 ring-2 ring-amber-200'
                      : 'border-gray-200 bg-white text-gray-600 active:bg-gray-50'
                  }
                `}
              >
                <ArrowRightLeft size={18} />
                <span>Đổi ca</span>
              </button>

              {/* Nút Thêm ca */}
              <button
                type="button"
                onClick={() => {
                  if (canAddMore) {
                    setActionMode('add');
                    setSelectedShiftId('');
                  }
                }}
                disabled={!canAddMore}
                className={`flex items-center justify-center gap-2 p-3 rounded-xl border-2 
                  transition-all text-sm font-medium min-h-[48px]
                  ${
                    !canAddMore
                      ? 'border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed'
                      : actionMode === 'add'
                        ? 'border-green-500 bg-green-50 text-green-700 ring-2 ring-green-200'
                        : 'border-gray-200 bg-white text-gray-600 active:bg-gray-50'
                  }
                `}
              >
                <Plus size={18} />
                <span>Thêm ca</span>
                {!canAddMore && (
                  <span className="text-[10px] text-gray-400">(đủ {maxShiftsPerDay} ca)</span>
                )}
              </button>
            </div>

            {/* Hint */}
            {actionMode === 'override' && (
              <p className="mt-1.5 text-xs text-amber-600 flex items-start gap-1">
                <Info size={12} className="mt-0.5 shrink-0" />
                Thay thế ca "{currentShift?.shift_name}" bằng ca khác
              </p>
            )}
            {actionMode === 'add' && (
              <p className="mt-1.5 text-xs text-green-600 flex items-start gap-1">
                <Info size={12} className="mt-0.5 shrink-0" />
                Thêm 1 ca mới bên cạnh ca đã có (cho cùng ngày)
              </p>
            )}
          </div>
        )}

        {/* ── Chọn ca ── */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            <activeConfig.icon size={14} className="inline mr-1" />
            {actionMode === 'override'
              ? 'Chọn ca thay thế'
              : actionMode === 'add'
                ? 'Chọn ca thêm'
                : 'Chọn ca'}
          </label>
          <div className="space-y-3 max-h-[240px] overflow-y-auto">
            {Object.keys(filteredGroupedShifts).length === 0 && (
              <div className="text-center py-4 text-sm text-gray-400">
                Không còn ca nào có thể chọn
              </div>
            )}
            {Object.entries(filteredGroupedShifts).map(([category, catShifts]) => (
              <div key={category}>
                <p className="text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wide">
                  {SHIFT_CATEGORY_LABELS[category] || category}
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  {catShifts.map((s: any) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSelectedShiftId(s.id)}
                      className={`p-2.5 rounded-xl border-2 text-left transition-all text-sm min-h-[48px]
                        ${
                          selectedShiftId === s.id
                            ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                            : 'border-gray-200 bg-white active:bg-blue-50/50 active:border-blue-300'
                        }
                      `}
                    >
                      <span className="font-medium block">{s.name}</span>
                      <span className="text-xs text-gray-500">
                        {s.start_time?.substring(0, 5)} - {s.end_time?.substring(0, 5)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Ghi chú ── */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Ghi chú (tùy chọn)
          </label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={
              actionMode === 'override'
                ? 'Lý do đổi ca...'
                : actionMode === 'add'
                  ? 'Lý do thêm ca...'
                  : 'Ghi chú...'
            }
            className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-[15px]
              focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* ── Error ── */}
        {mutationError && (
          <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-xl text-sm">
            <AlertCircle size={16} className="shrink-0" />
            <span>Lỗi: {(mutationError as Error).message}</span>
          </div>
        )}

        {/* ── Actions ── */}
        <div className="flex items-center justify-between pt-3 border-t sticky bottom-0 bg-white pb-safe">
          <div>
            {hasCurrentShift && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDelete}
                disabled={isLoading}
                className="text-red-600 active:text-red-700 active:bg-red-50 min-h-[44px]"
              >
                <Trash2 size={14} className="mr-1" />
                Xóa ca
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleClose}
              disabled={isLoading}
              className="min-h-[44px]"
            >
              Hủy
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!selectedShiftId || isLoading}
              isLoading={isLoading}
              className="min-h-[44px]"
            >
              {activeConfig.buttonText}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export default ShiftOverrideModal;