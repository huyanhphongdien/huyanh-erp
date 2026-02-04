// ============================================================
// SHIFT OVERRIDE MODAL - Đổi ca đột xuất
// File: src/features/shift-assignments/ShiftOverrideModal.tsx
// ============================================================

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { shiftAssignmentService, shiftService } from '../../services';
import { Modal, Button } from '../../components/ui';
import { ArrowRightLeft, Trash2, AlertCircle } from 'lucide-react';

// ============================================================
// TYPES
// ============================================================

interface ShiftOverrideModalProps {
  isOpen: boolean;
  onClose: () => void;
  employeeId: string;
  employeeName: string;
  date: string;
  currentShift?: {
    id: string;
    shift_id: string;
    shift_name: string;
    assignment_type: string;
  } | null;
  currentUserId: string;
}

// ============================================================
// CONSTANTS
// ============================================================

const SHIFT_CATEGORY_LABELS: Record<string, string> = {
  short: 'Ca ngắn (8h)',
  long: 'Ca dài (12h)',
  admin: 'Hành chính',
};

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
  currentUserId,
}: ShiftOverrideModalProps) {
  const queryClient = useQueryClient();
  const [selectedShiftId, setSelectedShiftId] = useState('');
  const [notes, setNotes] = useState('');

  // Load available shifts
  const { data: shiftsData } = useQuery({
    queryKey: ['shifts-for-override'],
    queryFn: () => shiftService.getAll({ page: 1, pageSize: 50 }),
    enabled: isOpen,
  });

  const shifts = shiftsData?.data || [];

  // Group shifts by category
  const groupedShifts = shifts.reduce((acc, s: any) => {
    const cat = s.shift_category || 'other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(s);
    return acc;
  }, {} as Record<string, any[]>);

  // Override mutation
  const overrideMutation = useMutation({
    mutationFn: () =>
      shiftAssignmentService.overrideShift({
        employee_id: employeeId,
        date,
        new_shift_id: selectedShiftId,
        created_by: currentUserId,
        notes: notes || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shift-calendar'] });
      handleClose();
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: () => shiftAssignmentService.delete(currentShift!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shift-calendar'] });
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
    overrideMutation.mutate();
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

  const isLoading = overrideMutation.isPending || deleteMutation.isPending;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={currentShift ? 'Đổi ca đột xuất' : 'Phân ca'}
    >
      <div className="space-y-4">
        {/* Info */}
        <div className="bg-gray-50 rounded-lg p-3 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">Nhân viên</span>
            <span className="text-sm font-medium text-gray-900">{employeeName}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">Ngày</span>
            <span className="text-sm font-medium text-gray-900">{dateDisplay}</span>
          </div>
          {currentShift && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Ca hiện tại</span>
              <span className="text-sm font-medium text-blue-600">
                {currentShift.shift_name}
                {currentShift.assignment_type === 'override' && (
                  <span className="ml-1 text-xs text-yellow-600">(đã đổi)</span>
                )}
              </span>
            </div>
          )}
        </div>

        {/* Select new shift */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            <ArrowRightLeft size={14} className="inline mr-1" />
            {currentShift ? 'Chọn ca mới' : 'Chọn ca'}
          </label>
          <div className="space-y-3">
            {Object.entries(groupedShifts).map(([category, catShifts]) => (
              <div key={category}>
                <p className="text-xs font-medium text-gray-500 mb-1">
                  {SHIFT_CATEGORY_LABELS[category] || category}
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  {catShifts.map((s: any) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSelectedShiftId(s.id)}
                      disabled={currentShift?.shift_id === s.id}
                      className={`p-2 rounded-lg border text-left transition-all text-sm
                        ${selectedShiftId === s.id
                          ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                          : currentShift?.shift_id === s.id
                            ? 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed'
                            : 'border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50/50'
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

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Ghi chú (tùy chọn)
          </label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Lý do đổi ca..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
              focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* Error */}
        {overrideMutation.isError && (
          <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
            <AlertCircle size={16} />
            <span>Lỗi: {(overrideMutation.error as Error).message}</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between pt-2 border-t">
          <div>
            {currentShift && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDelete}
                disabled={isLoading}
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                <Trash2 size={14} className="mr-1" />
                Xóa ca
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleClose} disabled={isLoading}>
              Hủy
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!selectedShiftId || isLoading}
              isLoading={isLoading}
            >
              {currentShift ? 'Đổi ca' : 'Phân ca'}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export default ShiftOverrideModal;