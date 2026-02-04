// ============================================================
// BATCH SCHEDULE MODAL - Phân ca hàng loạt
// File: src/features/shift-assignments/BatchScheduleModal.tsx
// ============================================================

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  shiftAssignmentService,
  shiftService,
  departmentService,
  employeeService,
} from '../../services';
import { Modal, Button } from '../../components/ui';
import {
  Users, Calendar, RotateCcw, Check, AlertCircle,
  ChevronDown, ChevronUp, Layers, Eye,
} from 'lucide-react';

// ============================================================
// TYPES
// ============================================================

interface BatchScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserId: string;
  preSelectedDepartmentId?: string;
}

type ScheduleMode = 'fixed' | 'rotation';

interface PatternWeek {
  week_number: number;
  shift_id: string;
}

// ============================================================
// HELPERS
// ============================================================

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('vi-VN');
}

function getDateRange(from: string, to: string): string[] {
  const dates: string[] = [];
  const start = new Date(from + 'T00:00:00');
  const end = new Date(to + 'T00:00:00');
  const current = new Date(start);
  while (current <= end) {
    dates.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

function countWorkingDays(from: string, to: string): number {
  const dates = getDateRange(from, to);
  return dates.filter(d => new Date(d + 'T00:00:00').getDay() !== 0).length;
}

// ============================================================
// COMPONENT
// ============================================================

export function BatchScheduleModal({
  isOpen,
  onClose,
  currentUserId,
  preSelectedDepartmentId,
}: BatchScheduleModalProps) {
  const queryClient = useQueryClient();

  // === STATE ===
  const [step, setStep] = useState<1 | 2 | 3>(1); // 1: chọn NV, 2: cấu hình, 3: preview
  const [departmentId, setDepartmentId] = useState(preSelectedDepartmentId || '');
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);
  const [mode, setMode] = useState<ScheduleMode>('fixed');
  const [fixedShiftId, setFixedShiftId] = useState('');
  const [rotationPattern, setRotationPattern] = useState<PatternWeek[]>([
    { week_number: 1, shift_id: '' },
    { week_number: 2, shift_id: '' },
  ]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [overwriteExisting, setOverwriteExisting] = useState(false);
  const [notes, setNotes] = useState('');

  // === QUERIES ===
  const { data: departmentsData } = useQuery({
    queryKey: ['departments-batch'],
    queryFn: () => departmentService.getAll({ page: 1, pageSize: 50, status: 'active' }),
    enabled: isOpen,
  });

  const { data: employeesData, isLoading: empLoading } = useQuery({
    queryKey: ['employees-batch', departmentId],
    queryFn: () => employeeService.getAll({ 
      page: 1, pageSize: 100, 
      department_id: departmentId || undefined,
      status: 'active' 
    }),
    enabled: isOpen && !!departmentId,
  });

  const { data: shiftsData } = useQuery({
    queryKey: ['shifts-batch'],
    queryFn: () => shiftService.getAll({ page: 1, pageSize: 50 }),
    enabled: isOpen,
  });

  const departments = departmentsData?.data || [];
  const employees = employeesData?.data || [];
  const shifts = shiftsData?.data || [];

  // Group shifts by category
  const shiftGroups = useMemo(() => {
    const groups: Record<string, any[]> = { short: [], long: [], admin: [] };
    shifts.forEach((s: any) => {
      const cat = s.shift_category || 'admin';
      if (groups[cat]) groups[cat].push(s);
    });
    return groups;
  }, [shifts]);

  // === MUTATION ===
  const batchMutation = useMutation({
    mutationFn: () => {
      const pattern: PatternWeek[] = mode === 'fixed'
        ? [{ week_number: 1, shift_id: fixedShiftId }]
        : rotationPattern.filter(p => p.shift_id);

      return shiftAssignmentService.batchSchedule({
        employee_ids: selectedEmployees,
        date_from: dateFrom,
        date_to: dateTo,
        pattern,
        overwrite_existing: overwriteExisting,
        created_by: currentUserId,
        notes: notes || undefined,
      });
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['shift-calendar'] });
      alert(
        `Phân ca hoàn tất!\n• Tạo mới: ${result.created} ngày\n• Bỏ qua: ${result.skipped} ngày\n• Ghi đè: ${result.overwritten} ngày`
      );
      handleClose();
    },
  });

  // === HANDLERS ===
  const handleClose = () => {
    setStep(1);
    setSelectedEmployees([]);
    setMode('fixed');
    setFixedShiftId('');
    setRotationPattern([
      { week_number: 1, shift_id: '' },
      { week_number: 2, shift_id: '' },
    ]);
    setDateFrom('');
    setDateTo('');
    setOverwriteExisting(false);
    setNotes('');
    onClose();
  };

  const toggleEmployee = (empId: string) => {
    setSelectedEmployees(prev =>
      prev.includes(empId)
        ? prev.filter(id => id !== empId)
        : [...prev, empId]
    );
  };

  const selectAll = () => {
    if (selectedEmployees.length === employees.length) {
      setSelectedEmployees([]);
    } else {
      setSelectedEmployees(employees.map((e: any) => e.id));
    }
  };

  const addRotationWeek = () => {
    setRotationPattern(prev => [
      ...prev,
      { week_number: prev.length + 1, shift_id: '' },
    ]);
  };

  const removeRotationWeek = (idx: number) => {
    if (rotationPattern.length <= 2) return;
    setRotationPattern(prev => prev.filter((_, i) => i !== idx).map((p, i) => ({ ...p, week_number: i + 1 })));
  };

  const updateRotationShift = (idx: number, shiftId: string) => {
    setRotationPattern(prev => prev.map((p, i) => i === idx ? { ...p, shift_id: shiftId } : p));
  };

  // === VALIDATION ===
  const canGoStep2 = selectedEmployees.length > 0;
  const canGoStep3 = dateFrom && dateTo && dateTo >= dateFrom && (
    (mode === 'fixed' && fixedShiftId) ||
    (mode === 'rotation' && rotationPattern.every(p => p.shift_id))
  );

  // === PREVIEW ===
  const workingDays = dateFrom && dateTo && dateTo >= dateFrom
    ? countWorkingDays(dateFrom, dateTo)
    : 0;
  const totalAssignments = workingDays * selectedEmployees.length;

  const getShiftName = (id: string) => {
    const s = shifts.find((s: any) => s.id === id) as any;
    return s?.name || '—';
  };

  const isLoading = batchMutation.isPending;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Phân ca hàng loạt"
      size="lg"
    >
      <div className="space-y-4">
        {/* Stepper */}
        <div className="flex items-center gap-2 mb-4">
          {[
            { num: 1, label: 'Chọn nhân viên' },
            { num: 2, label: 'Cấu hình ca' },
            { num: 3, label: 'Xác nhận' },
          ].map((s, i) => (
            <div key={s.num} className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold
                ${step >= s.num ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'}
              `}>
                {step > s.num ? <Check size={14} /> : s.num}
              </div>
              <span className={`text-xs ${step >= s.num ? 'text-blue-600 font-medium' : 'text-gray-400'}`}>
                {s.label}
              </span>
              {i < 2 && <div className={`w-8 h-0.5 ${step > s.num ? 'bg-blue-400' : 'bg-gray-200'}`} />}
            </div>
          ))}
        </div>

        {/* ============ STEP 1: Chọn nhân viên ============ */}
        {step === 1 && (
          <div className="space-y-3">
            {/* Department filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phòng ban</label>
              <select
                value={departmentId}
                onChange={(e) => {
                  setDepartmentId(e.target.value);
                  setSelectedEmployees([]);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              >
                <option value="">— Chọn phòng ban —</option>
                {departments.map((d: any) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>

            {/* Employee list */}
            {departmentId && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700">
                    <Users size={14} className="inline mr-1" />
                    Nhân viên ({selectedEmployees.length}/{employees.length})
                  </label>
                  <button
                    type="button"
                    onClick={selectAll}
                    className="text-xs text-blue-600 hover:text-blue-800"
                  >
                    {selectedEmployees.length === employees.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
                  </button>
                </div>

                {empLoading ? (
                  <div className="text-sm text-gray-500 py-4 text-center">Đang tải...</div>
                ) : employees.length === 0 ? (
                  <div className="text-sm text-gray-500 py-4 text-center">Không có nhân viên nào</div>
                ) : (
                  <div className="max-h-60 overflow-y-auto border border-gray-200 rounded-lg divide-y">
                    {employees.map((emp: any) => (
                      <label
                        key={emp.id}
                        className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50
                          ${selectedEmployees.includes(emp.id) ? 'bg-blue-50' : ''}
                        `}
                      >
                        <input
                          type="checkbox"
                          checked={selectedEmployees.includes(emp.id)}
                          onChange={() => toggleEmployee(emp.id)}
                          className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                        />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium text-gray-900">{emp.full_name}</span>
                          <span className="text-xs text-gray-500 ml-2">{emp.code}</span>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ============ STEP 2: Cấu hình ca ============ */}
        {step === 2 && (
          <div className="space-y-4">
            {/* Date range */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Calendar size={14} className="inline mr-1" />
                  Từ ngày
                </label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Đến ngày</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  min={dateFrom}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {workingDays > 0 && (
              <p className="text-xs text-gray-500">
                {workingDays} ngày làm việc (bỏ Chủ nhật) × {selectedEmployees.length} NV = <strong>{totalAssignments} phân ca</strong>
              </p>
            )}

            {/* Mode select */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Kiểu phân ca</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setMode('fixed')}
                  className={`p-3 rounded-lg border text-left text-sm transition-all
                    ${mode === 'fixed'
                      ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                      : 'border-gray-200 hover:border-blue-300'
                    }
                  `}
                >
                  <Layers size={16} className="mb-1 text-blue-500" />
                  <span className="font-medium block">Cố định 1 ca</span>
                  <span className="text-xs text-gray-500">Cùng ca mỗi ngày</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMode('rotation')}
                  className={`p-3 rounded-lg border text-left text-sm transition-all
                    ${mode === 'rotation'
                      ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                      : 'border-gray-200 hover:border-blue-300'
                    }
                  `}
                >
                  <RotateCcw size={16} className="mb-1 text-purple-500" />
                  <span className="font-medium block">Xoay ca</span>
                  <span className="text-xs text-gray-500">Đổi ca theo tuần</span>
                </button>
              </div>
            </div>

            {/* Fixed mode: select 1 shift */}
            {mode === 'fixed' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Chọn ca</label>
                <div className="space-y-2">
                  {Object.entries(shiftGroups).map(([cat, catShifts]) => (
                    catShifts.length > 0 && (
                      <div key={cat}>
                        <p className="text-xs font-medium text-gray-500 mb-1">
                          {cat === 'short' ? 'Ca ngắn (8h)' : cat === 'long' ? 'Ca dài (12h)' : 'Hành chính'}
                        </p>
                        <div className="grid grid-cols-3 gap-1.5">
                          {catShifts.map((s: any) => (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => setFixedShiftId(s.id)}
                              className={`p-2 rounded-lg border text-sm text-left transition-all
                                ${fixedShiftId === s.id
                                  ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                                  : 'border-gray-200 hover:border-blue-300'
                                }
                              `}
                            >
                              <span className="font-medium block text-xs">{s.name}</span>
                              <span className="text-[10px] text-gray-500">
                                {s.start_time?.substring(0, 5)}-{s.end_time?.substring(0, 5)}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )
                  ))}
                </div>
              </div>
            )}

            {/* Rotation mode: pattern by week */}
            {mode === 'rotation' && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700">Pattern xoay ca</label>
                  <button
                    type="button"
                    onClick={addRotationWeek}
                    className="text-xs text-blue-600 hover:text-blue-800"
                  >
                    + Thêm tuần
                  </button>
                </div>
                <div className="space-y-2">
                  {rotationPattern.map((pw, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 w-14 shrink-0">Tuần {pw.week_number}</span>
                      <select
                        value={pw.shift_id}
                        onChange={(e) => updateRotationShift(idx, e.target.value)}
                        className="flex-1 px-2 py-1.5 border border-gray-300 rounded-lg text-sm
                          focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">— Chọn ca —</option>
                        {Object.entries(shiftGroups).map(([cat, catShifts]) =>
                          catShifts.length > 0 && (
                            <optgroup
                              key={cat}
                              label={cat === 'short' ? 'Ca ngắn' : cat === 'long' ? 'Ca dài' : 'HC'}
                            >
                              {catShifts.map((s: any) => (
                                <option key={s.id} value={s.id}>
                                  {s.name} ({s.start_time?.substring(0, 5)}-{s.end_time?.substring(0, 5)})
                                </option>
                              ))}
                            </optgroup>
                          )
                        )}
                      </select>
                      {rotationPattern.length > 2 && (
                        <button
                          type="button"
                          onClick={() => removeRotationWeek(idx)}
                          className="text-red-400 hover:text-red-600 p-1"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  Pattern lặp lại sau {rotationPattern.length} tuần
                </p>
              </div>
            )}

            {/* Options */}
            <div className="space-y-2 pt-2 border-t">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={overwriteExisting}
                  onChange={(e) => setOverwriteExisting(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Ghi đè lịch ca đã có</span>
              </label>
              {overwriteExisting && (
                <p className="text-xs text-amber-600 ml-6">
                  ⚠ Ca đã phân trong khoảng thời gian sẽ bị xóa và thay thế
                </p>
              )}
              <div>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ghi chú (tùy chọn)"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                    focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
        )}

        {/* ============ STEP 3: Preview & Confirm ============ */}
        {step === 3 && (
          <div className="space-y-3">
            <div className="bg-blue-50 rounded-lg p-4 space-y-2">
              <h4 className="text-sm font-semibold text-blue-800 flex items-center gap-1">
                <Eye size={14} />
                Xem trước phân ca
              </h4>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <span className="text-gray-600">Nhân viên:</span>
                <span className="font-medium">{selectedEmployees.length} người</span>
                <span className="text-gray-600">Khoảng thời gian:</span>
                <span className="font-medium">{formatDate(dateFrom)} → {formatDate(dateTo)}</span>
                <span className="text-gray-600">Ngày làm việc:</span>
                <span className="font-medium">{workingDays} ngày (trừ CN)</span>
                <span className="text-gray-600">Kiểu phân ca:</span>
                <span className="font-medium">{mode === 'fixed' ? 'Cố định' : 'Xoay ca'}</span>
                {mode === 'fixed' && (
                  <>
                    <span className="text-gray-600">Ca:</span>
                    <span className="font-medium">{getShiftName(fixedShiftId)}</span>
                  </>
                )}
                {mode === 'rotation' && rotationPattern.map((p, i) => (
                  <div key={i} className="col-span-2 flex items-center gap-2 text-xs">
                    <span className="text-gray-500">Tuần {p.week_number}:</span>
                    <span className="font-medium">{getShiftName(p.shift_id)}</span>
                  </div>
                ))}
                <span className="text-gray-600">Ghi đè:</span>
                <span className={`font-medium ${overwriteExisting ? 'text-amber-600' : 'text-gray-700'}`}>
                  {overwriteExisting ? 'Có' : 'Không'}
                </span>
                <span className="text-gray-600">Tổng phân ca:</span>
                <span className="font-bold text-blue-700">{totalAssignments} records</span>
              </div>
            </div>

            {/* Employee list preview */}
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Danh sách nhân viên:</p>
              <div className="max-h-32 overflow-y-auto text-xs text-gray-600 bg-gray-50 rounded-lg p-2 space-y-0.5">
                {employees
                  .filter((e: any) => selectedEmployees.includes(e.id))
                  .map((e: any) => (
                    <div key={e.id} className="flex items-center gap-1">
                      <Check size={10} className="text-green-500" />
                      <span>{e.full_name}</span>
                      <span className="text-gray-400">({e.code})</span>
                    </div>
                  ))
                }
              </div>
            </div>

            {batchMutation.isError && (
              <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
                <AlertCircle size={16} />
                <span>Lỗi: {(batchMutation.error as Error).message}</span>
              </div>
            )}
          </div>
        )}

        {/* ============ FOOTER ACTIONS ============ */}
        <div className="flex items-center justify-between pt-3 border-t">
          <div>
            {step > 1 && (
              <Button variant="outline" size="sm" onClick={() => setStep((step - 1) as any)} disabled={isLoading}>
                <ChevronUp size={14} className="mr-1 rotate-[-90deg]" />
                Quay lại
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleClose} disabled={isLoading}>
              Hủy
            </Button>
            {step < 3 ? (
              <Button
                onClick={() => setStep((step + 1) as any)}
                disabled={step === 1 ? !canGoStep2 : !canGoStep3}
              >
                Tiếp theo
                <ChevronDown size={14} className="ml-1 rotate-[-90deg]" />
              </Button>
            ) : (
              <Button
                onClick={() => batchMutation.mutate()}
                disabled={isLoading}
                isLoading={isLoading}
              >
                <Check size={14} className="mr-1" />
                Xác nhận phân ca
              </Button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

export default BatchScheduleModal;