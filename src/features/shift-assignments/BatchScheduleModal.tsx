// ============================================================
// BATCH SCHEDULE MODAL - Phân ca hàng loạt (V2 + Team Rotation)
// File: src/features/shift-assignments/BatchScheduleModal.tsx
// ============================================================

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  shiftAssignmentService,
  shiftService,
  departmentService,
  employeeService,
  shiftTeamService,
} from '../../services';
import { Modal, Button } from '../../components/ui';
import {
  Users, Calendar, RotateCcw, Check, AlertCircle,
  ChevronDown, ChevronUp, Layers, Eye, UsersRound,
  Info,
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

type ScheduleMode = 'fixed' | 'rotation' | 'team_rotation';

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

function countAllDays(from: string, to: string): number {
  return getDateRange(from, to).length;
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
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [departmentId, setDepartmentId] = useState(preSelectedDepartmentId || '');
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);
  const [mode, setMode] = useState<ScheduleMode>('fixed');

  // Fixed mode
  const [fixedShiftId, setFixedShiftId] = useState('');

  // Rotation mode (xoay ca theo tuần)
  const [rotationPattern, setRotationPattern] = useState<PatternWeek[]>([
    { week_number: 1, shift_id: '' },
    { week_number: 2, shift_id: '' },
  ]);

  // Team rotation mode (2 đội xoay 3 ca ngắn)
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);
  const [teamRotationShifts, setTeamRotationShifts] = useState<string[]>(['', '', '']); // 3 ca ngắn IDs

  // Shared
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
      status: 'active',
    }),
    enabled: isOpen && !!departmentId && mode !== 'team_rotation',
  });

  const { data: shiftsData } = useQuery({
    queryKey: ['shifts-batch'],
    queryFn: () => shiftService.getAll({ page: 1, pageSize: 50 }),
    enabled: isOpen,
  });

  // Teams query — chỉ load khi mode = team_rotation
  const { data: teamsData, isLoading: teamsLoading } = useQuery({
    queryKey: ['shift-teams-batch'],
    queryFn: () => shiftTeamService.getTeamsWithCount(),
    enabled: isOpen && mode === 'team_rotation',
  });

  const departments = departmentsData?.data || [];
  const employees = employeesData?.data || [];
  const shifts = shiftsData?.data || [];
  const teams = teamsData || [];

  // Group shifts by category
  const shiftGroups = useMemo(() => {
    const groups: Record<string, any[]> = { short: [], long: [], admin: [] };
    shifts.forEach((s: any) => {
      const cat = s.shift_category || 'admin';
      if (groups[cat]) groups[cat].push(s);
    });
    return groups;
  }, [shifts]);

  // Short shifts only — cho team rotation
  const shortShifts = shiftGroups.short || [];

  // === MUTATIONS ===

  // Mutation cho fixed + rotation mode
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
      queryClient.invalidateQueries({ queryKey: ['shift-assignments'] });
      alert(
        `Phân ca hoàn tất!\n• Tạo mới: ${result.created} ngày\n• Bỏ qua: ${result.skipped} ngày\n• Ghi đè: ${result.overwritten} ngày`
      );
      handleClose();
    },
  });

  // Mutation cho team rotation mode
  const teamBatchMutation = useMutation({
    mutationFn: () => {
      // Map selectedTeamIds + teamRotationShifts → team_patterns
      // Đội 1 bắt đầu ca 1, Đội 2 bắt đầu ca 2
      const validShifts = teamRotationShifts.filter(Boolean);
      const team_patterns = selectedTeamIds.map((teamId, idx) => ({
        team_id: teamId,
        initial_shift_id: validShifts[idx % validShifts.length],
      }));

      return shiftAssignmentService.batchScheduleByTeams({
        department_id: departmentId,
        date_from: dateFrom,
        date_to: dateTo,
        team_patterns,
        swap_rule: {
          type: 'custom_weekday' as const,
          even_week_day: 3, // Thứ 4 tuần chẵn
          odd_week_day: 4,  // Thứ 5 tuần lẻ
        },
        overwrite_existing: overwriteExisting,
        created_by: currentUserId,
        notes: notes || undefined,
      });
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['shift-calendar'] });
      queryClient.invalidateQueries({ queryKey: ['shift-assignments'] });
      const detailStr = result.details
        .map(d => `  ${d.team_code}: ${d.created} ca`)
        .join('\n');
      alert(
        `Phân ca theo đội hoàn tất!\n• Tạo mới: ${result.created}\n• Bỏ qua: ${result.skipped}\n• Ghi đè: ${result.overwritten}\n\nChi tiết:\n${detailStr}`
      );
      handleClose();
    },
  });

  const mutationError = batchMutation.error || teamBatchMutation.error;

  // === HANDLERS ===
  const handleClose = () => {
    setStep(1);
    setDepartmentId(preSelectedDepartmentId || '');
    setSelectedEmployees([]);
    setMode('fixed');
    setFixedShiftId('');
    setRotationPattern([
      { week_number: 1, shift_id: '' },
      { week_number: 2, shift_id: '' },
    ]);
    setSelectedTeamIds([]);
    setTeamRotationShifts(['', '', '']);
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

  const toggleTeam = (teamId: string) => {
    setSelectedTeamIds(prev =>
      prev.includes(teamId)
        ? prev.filter(id => id !== teamId)
        : [...prev, teamId]
    );
  };

  const addRotationWeek = () => {
    setRotationPattern(prev => [
      ...prev,
      { week_number: prev.length + 1, shift_id: '' },
    ]);
  };

  const removeRotationWeek = (idx: number) => {
    if (rotationPattern.length <= 2) return;
    setRotationPattern(prev =>
      prev.filter((_, i) => i !== idx).map((p, i) => ({ ...p, week_number: i + 1 }))
    );
  };

  const updateRotationShift = (idx: number, shiftId: string) => {
    setRotationPattern(prev =>
      prev.map((p, i) => (i === idx ? { ...p, shift_id: shiftId } : p))
    );
  };

  const updateTeamRotationShift = (idx: number, shiftId: string) => {
    setTeamRotationShifts(prev => prev.map((s, i) => (i === idx ? shiftId : s)));
  };

  const handleConfirm = () => {
    if (mode === 'team_rotation') {
      teamBatchMutation.mutate();
    } else {
      batchMutation.mutate();
    }
  };

  // === VALIDATION ===
  const canGoStep2 =
    mode === 'team_rotation'
      ? selectedTeamIds.length >= 2
      : selectedEmployees.length > 0;

  const canGoStep3 =
    dateFrom &&
    dateTo &&
    dateTo >= dateFrom &&
    (
      (mode === 'fixed' && fixedShiftId) ||
      (mode === 'rotation' && rotationPattern.every(p => p.shift_id)) ||
      (mode === 'team_rotation' && teamRotationShifts.filter(Boolean).length >= 2)
    );

  // === PREVIEW STATS ===
  const workingDays =
    dateFrom && dateTo && dateTo >= dateFrom ? countWorkingDays(dateFrom, dateTo) : 0;
  const allDays =
    dateFrom && dateTo && dateTo >= dateFrom ? countAllDays(dateFrom, dateTo) : 0;

  const totalAssignments = (() => {
    if (mode === 'team_rotation') {
      // Team rotation: mỗi ngày mỗi đội có 1 ca, nhưng số NV phụ thuộc team size
      // Ước lượng: allDays × numberOfShiftsPerDay × avgTeamSize
      const teamCount = selectedTeamIds.length;
      const shiftsPerDay = Math.min(teamRotationShifts.filter(Boolean).length, teamCount);
      // Rough estimate — chính xác hơn cần query team members
      return allDays * shiftsPerDay * 10; // placeholder
    }
    return workingDays * selectedEmployees.length;
  })();

  const getShiftName = (id: string) => {
    const s = shifts.find((sh: any) => sh.id === id) as any;
    return s?.name || '—';
  };

  const getTeamName = (id: string) => {
    const t = teams.find((t: any) => t.id === id);
    return t?.name || '—';
  };

  const getTeamMemberCount = (id: string) => {
    const t = teams.find((t: any) => t.id === id);
    return t?.member_count || 0;
  };

  const isLoading = batchMutation.isPending || teamBatchMutation.isPending;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Phân ca hàng loạt" size="lg">
      <div className="space-y-4">
        {/* ── Stepper ── */}
        <div className="flex items-center gap-2 mb-4">
          {[
            { num: 1, label: mode === 'team_rotation' ? 'Chọn đội' : 'Chọn nhân viên' },
            { num: 2, label: 'Cấu hình ca' },
            { num: 3, label: 'Xác nhận' },
          ].map((s, i) => (
            <div key={s.num} className="flex items-center gap-2">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold
                  ${step >= s.num ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'}
                `}
              >
                {step > s.num ? <Check size={14} /> : s.num}
              </div>
              <span
                className={`text-xs ${step >= s.num ? 'text-blue-600 font-medium' : 'text-gray-400'}`}
              >
                {s.label}
              </span>
              {i < 2 && (
                <div className={`w-8 h-0.5 ${step > s.num ? 'bg-blue-400' : 'bg-gray-200'}`} />
              )}
            </div>
          ))}
        </div>

        {/* ═══════════ STEP 1: Chọn mode + NV/Đội ═══════════ */}
        {step === 1 && (
          <div className="space-y-3">
            {/* Mode picker — 3 buttons */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Kiểu phân ca</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setMode('fixed');
                    setSelectedTeamIds([]);
                  }}
                  className={`p-3 rounded-lg border text-left text-sm transition-all min-h-[72px]
                    ${mode === 'fixed'
                      ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                      : 'border-gray-200 active:bg-gray-50'
                    }
                  `}
                >
                  <Layers size={16} className="mb-1 text-blue-500" />
                  <span className="font-medium block text-xs">Cố định</span>
                  <span className="text-[10px] text-gray-500">1 ca mỗi ngày</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('rotation');
                    setSelectedTeamIds([]);
                  }}
                  className={`p-3 rounded-lg border text-left text-sm transition-all min-h-[72px]
                    ${mode === 'rotation'
                      ? 'border-purple-500 bg-purple-50 ring-2 ring-purple-200'
                      : 'border-gray-200 active:bg-gray-50'
                    }
                  `}
                >
                  <RotateCcw size={16} className="mb-1 text-purple-500" />
                  <span className="font-medium block text-xs">Xoay ca</span>
                  <span className="text-[10px] text-gray-500">Đổi ca theo tuần</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('team_rotation');
                    setSelectedEmployees([]);
                    setDepartmentId('');
                  }}
                  className={`p-3 rounded-lg border text-left text-sm transition-all min-h-[72px]
                    ${mode === 'team_rotation'
                      ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-200'
                      : 'border-gray-200 active:bg-gray-50'
                    }
                  `}
                >
                  <UsersRound size={16} className="mb-1 text-emerald-500" />
                  <span className="font-medium block text-xs">Theo đội</span>
                  <span className="text-[10px] text-gray-500">2 đội xoay 3 ca</span>
                </button>
              </div>
            </div>

            {/* ── Fixed / Rotation: chọn phòng ban + nhân viên ── */}
            {mode !== 'team_rotation' && (
              <>
                {/* Department filter */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phòng ban</label>
                  <select
                    value={departmentId}
                    onChange={(e) => {
                      setDepartmentId(e.target.value);
                      setSelectedEmployees([]);
                    }}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-[15px]
                      focus:ring-2 focus:ring-blue-500 min-h-[44px]"
                  >
                    <option value="">— Chọn phòng ban —</option>
                    {departments.map((d: any) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
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
                        className="text-xs text-blue-600 active:text-blue-800 min-h-[44px] flex items-center"
                      >
                        {selectedEmployees.length === employees.length
                          ? 'Bỏ chọn tất cả'
                          : 'Chọn tất cả'}
                      </button>
                    </div>

                    {empLoading ? (
                      <div className="text-sm text-gray-500 py-4 text-center">Đang tải...</div>
                    ) : employees.length === 0 ? (
                      <div className="text-sm text-gray-500 py-4 text-center">
                        Không có nhân viên nào
                      </div>
                    ) : (
                      <div className="max-h-60 overflow-y-auto border border-gray-200 rounded-lg divide-y">
                        {employees.map((emp: any) => (
                          <button
                            key={emp.id}
                            type="button"
                            onClick={() => toggleEmployee(emp.id)}
                            className={`flex items-center gap-3 px-3 py-2.5 w-full text-left min-h-[44px]
                              ${selectedEmployees.includes(emp.id)
                                ? 'bg-blue-50'
                                : 'active:bg-gray-50'
                              }
                            `}
                          >
                            <div
                              className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0
                                ${selectedEmployees.includes(emp.id)
                                  ? 'bg-blue-600 border-blue-600'
                                  : 'border-gray-300'
                                }
                              `}
                            >
                              {selectedEmployees.includes(emp.id) && (
                                <Check size={12} className="text-white" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <span className="text-sm font-medium text-gray-900">
                                {emp.full_name}
                              </span>
                              <span className="text-xs text-gray-500 ml-2">{emp.code}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {/* ── Team Rotation: chọn đội ── */}
            {mode === 'team_rotation' && (
              <div>
                <div className="flex items-center gap-2 p-3 bg-emerald-50 rounded-lg text-xs text-emerald-700 mb-3">
                  <Info size={14} className="flex-shrink-0" />
                  <span>
                    Chọn 2 đội để xoay ca. Mỗi đội sẽ được phân 1 trong 3 ca ngắn, đổi ca theo lịch
                    (T4 tuần chẵn / T5 tuần lẻ).
                  </span>
                </div>

                <label className="text-sm font-medium text-gray-700 mb-2 block">
                  <UsersRound size={14} className="inline mr-1" />
                  Chọn đội ({selectedTeamIds.length}/2)
                </label>

                {teamsLoading ? (
                  <div className="text-sm text-gray-500 py-4 text-center">Đang tải danh sách đội...</div>
                ) : teams.length === 0 ? (
                  <div className="text-sm text-gray-500 py-6 text-center space-y-2">
                    <UsersRound size={24} className="mx-auto text-gray-300" />
                    <p>Chưa có đội nào.</p>
                    <p className="text-xs text-gray-400">
                      Vào <strong>Quản lý đội</strong> để tạo Team A, Team B trước.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {teams.map((team: any) => {
                      const isSelected = selectedTeamIds.includes(team.id);
                      const memberCount = team.member_count || team.members_count || 0;
                      const disabled = !isSelected && selectedTeamIds.length >= 2;

                      return (
                        <button
                          key={team.id}
                          type="button"
                          onClick={() => !disabled && toggleTeam(team.id)}
                          disabled={disabled}
                          className={`flex items-center gap-3 px-4 py-3 w-full text-left rounded-lg border
                            transition-all min-h-[56px]
                            ${isSelected
                              ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-200'
                              : disabled
                                ? 'border-gray-100 bg-gray-50 opacity-50'
                                : 'border-gray-200 active:bg-gray-50'
                            }
                          `}
                        >
                          <div
                            className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0
                              ${isSelected ? 'bg-emerald-600 border-emerald-600' : 'border-gray-300'}
                            `}
                          >
                            {isSelected && <Check size={12} className="text-white" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-medium text-gray-900">
                              {team.team_name || team.name}
                            </span>
                            <span className="text-xs text-gray-500 ml-2">
                              {memberCount} thành viên
                            </span>
                          </div>
                          {isSelected && (
                            <span className="text-xs font-medium text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full">
                              Đội {selectedTeamIds.indexOf(team.id) + 1}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}

                {selectedTeamIds.length === 1 && (
                  <p className="text-xs text-amber-600 mt-2">⚠ Cần chọn thêm 1 đội nữa</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* ═══════════ STEP 2: Cấu hình ca ═══════════ */}
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
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-[15px]
                    focus:ring-2 focus:ring-blue-500 min-h-[44px]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Đến ngày</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  min={dateFrom}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-[15px]
                    focus:ring-2 focus:ring-blue-500 min-h-[44px]"
                />
              </div>
            </div>

            {/* Stats summary */}
            {workingDays > 0 && mode !== 'team_rotation' && (
              <p className="text-xs text-gray-500">
                {workingDays} ngày làm việc (bỏ CN) × {selectedEmployees.length} NV ={' '}
                <strong>{workingDays * selectedEmployees.length} phân ca</strong>
              </p>
            )}
            {allDays > 0 && mode === 'team_rotation' && (
              <p className="text-xs text-gray-500">
                {allDays} ngày × {selectedTeamIds.length} đội ={' '}
                <strong>phân ca tự động theo lịch xoay</strong>
              </p>
            )}

            {/* ── Fixed mode: select 1 shift ── */}
            {mode === 'fixed' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Chọn ca</label>
                <div className="space-y-2">
                  {Object.entries(shiftGroups).map(
                    ([cat, catShifts]) =>
                      catShifts.length > 0 && (
                        <div key={cat}>
                          <p className="text-xs font-medium text-gray-500 mb-1">
                            {cat === 'short'
                              ? 'Ca ngắn (8h)'
                              : cat === 'long'
                                ? 'Ca dài (12h)'
                                : 'Hành chính'}
                          </p>
                          <div className="grid grid-cols-3 gap-1.5">
                            {catShifts.map((s: any) => (
                              <button
                                key={s.id}
                                type="button"
                                onClick={() => setFixedShiftId(s.id)}
                                className={`p-2.5 rounded-lg border text-sm text-left transition-all min-h-[44px]
                                  ${fixedShiftId === s.id
                                    ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                                    : 'border-gray-200 active:bg-gray-50'
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
                  )}
                </div>
              </div>
            )}

            {/* ── Rotation mode: pattern by week ── */}
            {mode === 'rotation' && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700">Pattern xoay ca</label>
                  <button
                    type="button"
                    onClick={addRotationWeek}
                    className="text-xs text-blue-600 active:text-blue-800 min-h-[44px] flex items-center"
                  >
                    + Thêm tuần
                  </button>
                </div>
                <div className="space-y-2">
                  {rotationPattern.map((pw, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 w-14 shrink-0">
                        Tuần {pw.week_number}
                      </span>
                      <select
                        value={pw.shift_id}
                        onChange={(e) => updateRotationShift(idx, e.target.value)}
                        className="flex-1 px-2 py-2 border border-gray-300 rounded-lg text-[15px]
                          focus:ring-2 focus:ring-blue-500 min-h-[44px]"
                      >
                        <option value="">— Chọn ca —</option>
                        {Object.entries(shiftGroups).map(
                          ([cat, catShifts]) =>
                            catShifts.length > 0 && (
                              <optgroup
                                key={cat}
                                label={
                                  cat === 'short' ? 'Ca ngắn' : cat === 'long' ? 'Ca dài' : 'HC'
                                }
                              >
                                {catShifts.map((s: any) => (
                                  <option key={s.id} value={s.id}>
                                    {s.name} ({s.start_time?.substring(0, 5)}-
                                    {s.end_time?.substring(0, 5)})
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
                          className="text-red-400 active:text-red-600 p-2 min-h-[44px] min-w-[44px]
                            flex items-center justify-center"
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

            {/* ── Team Rotation mode: chọn 3 ca ngắn ── */}
            {mode === 'team_rotation' && (
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">
                  Chọn ca xoay (3 ca ngắn)
                </label>

                <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg text-xs text-blue-700 mb-3">
                  <Info size={14} className="flex-shrink-0" />
                  <span>
                    Chọn 3 ca ngắn theo thứ tự: Ca sáng → Ca chiều → Ca đêm. Hệ thống sẽ tự xoay
                    theo lịch đổi ca (T4 tuần chẵn / T5 tuần lẻ).
                  </span>
                </div>

                <div className="space-y-2">
                  {['Ca 1 (Sáng)', 'Ca 2 (Chiều)', 'Ca 3 (Đêm)'].map((label, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 w-20 shrink-0 font-medium">
                        {label}
                      </span>
                      <select
                        value={teamRotationShifts[idx]}
                        onChange={(e) => updateTeamRotationShift(idx, e.target.value)}
                        className="flex-1 px-2 py-2 border border-gray-300 rounded-lg text-[15px]
                          focus:ring-2 focus:ring-blue-500 min-h-[44px]"
                      >
                        <option value="">— Chọn ca —</option>
                        {shortShifts.map((s: any) => (
                          <option key={s.id} value={s.id}>
                            {s.name} ({s.start_time?.substring(0, 5)}-{s.end_time?.substring(0, 5)})
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>

                {shortShifts.length === 0 && (
                  <p className="text-xs text-amber-600 mt-2">
                    ⚠ Không tìm thấy ca ngắn (shift_category = 'short'). Kiểm tra lại bảng shifts.
                  </p>
                )}

                {/* Preview rotation pattern */}
                {teamRotationShifts.filter(Boolean).length >= 2 && selectedTeamIds.length === 2 && (
                  <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                    <p className="text-xs font-medium text-gray-600 mb-2">Mẫu xoay ca:</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                      <span className="font-medium text-gray-700">
                        {getTeamName(selectedTeamIds[0])}:
                      </span>
                      <span className="text-gray-600">
                        {getShiftName(teamRotationShifts[0])} → {getShiftName(teamRotationShifts[1])}
                        {teamRotationShifts[2] && ` → ${getShiftName(teamRotationShifts[2])}`}
                      </span>
                      <span className="font-medium text-gray-700">
                        {getTeamName(selectedTeamIds[1])}:
                      </span>
                      <span className="text-gray-600">
                        {getShiftName(teamRotationShifts[1])} →{' '}
                        {teamRotationShifts[2]
                          ? getShiftName(teamRotationShifts[2])
                          : getShiftName(teamRotationShifts[0])}
                        {teamRotationShifts[2] && ` → ${getShiftName(teamRotationShifts[0])}`}
                      </span>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1">
                      Đổi ca: T4 tuần chẵn / T5 tuần lẻ
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Options */}
            <div className="space-y-2 pt-2 border-t">
              <button
                type="button"
                onClick={() => setOverwriteExisting(!overwriteExisting)}
                className="flex items-center gap-2 min-h-[44px] w-full text-left"
              >
                <div
                  className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0
                    ${overwriteExisting ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}
                  `}
                >
                  {overwriteExisting && <Check size={12} className="text-white" />}
                </div>
                <span className="text-sm text-gray-700">Ghi đè lịch ca đã có</span>
              </button>
              {overwriteExisting && (
                <p className="text-xs text-amber-600 ml-7">
                  ⚠ Ca đã phân trong khoảng thời gian sẽ bị xóa và thay thế
                </p>
              )}
              <div>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ghi chú (tùy chọn)"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-[15px]
                    focus:ring-2 focus:ring-blue-500 min-h-[44px]"
                />
              </div>
            </div>
          </div>
        )}

        {/* ═══════════ STEP 3: Preview & Confirm ═══════════ */}
        {step === 3 && (
          <div className="space-y-3">
            <div className="bg-blue-50 rounded-lg p-4 space-y-2">
              <h4 className="text-sm font-semibold text-blue-800 flex items-center gap-1">
                <Eye size={14} />
                Xem trước phân ca
              </h4>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                {/* Common info */}
                <span className="text-gray-600">Kiểu phân ca:</span>
                <span className="font-medium">
                  {mode === 'fixed'
                    ? 'Cố định'
                    : mode === 'rotation'
                      ? 'Xoay ca'
                      : 'Theo đội'}
                </span>
                <span className="text-gray-600">Khoảng thời gian:</span>
                <span className="font-medium">
                  {formatDate(dateFrom)} → {formatDate(dateTo)}
                </span>

                {/* Mode-specific info */}
                {mode !== 'team_rotation' && (
                  <>
                    <span className="text-gray-600">Nhân viên:</span>
                    <span className="font-medium">{selectedEmployees.length} người</span>
                    <span className="text-gray-600">Ngày làm việc:</span>
                    <span className="font-medium">{workingDays} ngày (trừ CN)</span>
                  </>
                )}

                {mode === 'team_rotation' && (
                  <>
                    <span className="text-gray-600">Đội:</span>
                    <span className="font-medium">
                      {selectedTeamIds.map(id => getTeamName(id)).join(', ')}
                    </span>
                    <span className="text-gray-600">Số ngày:</span>
                    <span className="font-medium">{allDays} ngày</span>
                    <span className="text-gray-600">Tổng NV:</span>
                    <span className="font-medium">
                      {selectedTeamIds.reduce((sum, id) => sum + getTeamMemberCount(id), 0)} người
                    </span>
                  </>
                )}

                {mode === 'fixed' && (
                  <>
                    <span className="text-gray-600">Ca:</span>
                    <span className="font-medium">{getShiftName(fixedShiftId)}</span>
                  </>
                )}
                {mode === 'rotation' &&
                  rotationPattern.map((p, i) => (
                    <div key={i} className="col-span-2 flex items-center gap-2 text-xs">
                      <span className="text-gray-500">Tuần {p.week_number}:</span>
                      <span className="font-medium">{getShiftName(p.shift_id)}</span>
                    </div>
                  ))}
                {mode === 'team_rotation' && (
                  <>
                    <span className="text-gray-600">Ca xoay:</span>
                    <span className="font-medium text-xs">
                      {teamRotationShifts
                        .filter(Boolean)
                        .map(id => getShiftName(id))
                        .join(' → ')}
                    </span>
                  </>
                )}

                <span className="text-gray-600">Ghi đè:</span>
                <span
                  className={`font-medium ${overwriteExisting ? 'text-amber-600' : 'text-gray-700'}`}
                >
                  {overwriteExisting ? 'Có' : 'Không'}
                </span>

                {mode !== 'team_rotation' && (
                  <>
                    <span className="text-gray-600">Tổng phân ca:</span>
                    <span className="font-bold text-blue-700">
                      {workingDays * selectedEmployees.length} records
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Employee/Team list preview */}
            {mode !== 'team_rotation' && (
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
                    ))}
                </div>
              </div>
            )}

            {mode === 'team_rotation' && (
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1">Đội được chọn:</p>
                <div className="space-y-1.5">
                  {selectedTeamIds.map((teamId, idx) => (
                    <div
                      key={teamId}
                      className="flex items-center gap-2 p-2 bg-emerald-50 rounded-lg text-sm"
                    >
                      <span className="text-xs font-bold text-emerald-600 bg-emerald-100 w-6 h-6 rounded-full flex items-center justify-center">
                        {idx + 1}
                      </span>
                      <span className="font-medium text-gray-800">{getTeamName(teamId)}</span>
                      <span className="text-xs text-gray-500">
                        ({getTeamMemberCount(teamId)} thành viên)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(batchMutation.isError || teamBatchMutation.isError) && (
              <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
                <AlertCircle size={16} />
                <span>Lỗi: {(mutationError as Error)?.message || 'Đã xảy ra lỗi'}</span>
              </div>
            )}
          </div>
        )}

        {/* ═══════════ FOOTER ACTIONS ═══════════ */}
        <div className="flex items-center justify-between pt-3 border-t sticky bottom-0 bg-white pb-safe">
          <div>
            {step > 1 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStep((step - 1) as any)}
                disabled={isLoading}
              >
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
              <Button onClick={handleConfirm} disabled={isLoading} isLoading={isLoading}>
                <Check size={14} className="mr-1" />
                {mode === 'team_rotation' ? 'Phân ca theo đội' : 'Xác nhận phân ca'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

export default BatchScheduleModal;