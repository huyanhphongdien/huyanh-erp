// ============================================================
// SHIFT CALENDAR PAGE V3.2 — Lịch phân ca (Fixed Team Filter + Safe Array)
// File: src/features/shift-assignments/ShiftCalendarPage.tsx
// V3.2 fixes:
//   ① Teams dropdown filter theo departmentId (không load all)
//   ② Filter đội dựa trên shift_team_members (employee→team)
//   ③ Giữ nguyên toàn bộ UI/UX cũ
//   ④ FIX: Tất cả .map() đều safe — không crash khi API trả null
// ============================================================

import { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  shiftAssignmentService,
  departmentService,
} from '../../services';
import { shiftTeamService } from '../../services/shiftTeamService';
import { ShiftCell } from './ShiftCell';
import type { DayAssignment } from './ShiftCell';
import { BatchScheduleModal } from './BatchScheduleModal';
import { ShiftOverrideModal } from './ShiftOverrideModal';
import { useAuthStore } from '../../stores/authStore';
import {
  CalendarDays, ChevronLeft, ChevronRight,
  Users, Layers, BarChart3, Building2,
} from 'lucide-react';

// ============================================================
// CONSTANTS
// ============================================================

const SUNDAY_OFF_DEPT_CODES = ['HAP-KT', 'HAP-RD'];

type ViewMode = 'week' | 'month';
type TeamFilter = 'all' | string;

interface OverrideTarget {
  employeeId: string;
  employeeName: string;
  date: string;
  currentShift: {
    id: string;
    shift_id: string;
    shift_name: string;
    assignment_type: string;
  } | null;
}

// ============================================================
// HELPER: đảm bảo luôn trả về array
// ============================================================
function ensureArray<T>(val: any): T[] {
  if (Array.isArray(val)) return val;
  if (val?.data && Array.isArray(val.data)) return val.data;
  return [];
}

// ============================================================
// DATE HELPERS
// ============================================================

function getToday(): string {
  return new Date().toISOString().split('T')[0];
}

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function formatDateVN(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getFirstOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

const DAY_LABELS_SHORT = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

// ============================================================
// HELPER: rút gọn tên VN cho mobile (Nguyễn Văn An → NV An)
// ============================================================
function shortName(fullName: string): string {
  if (!fullName) return '?';
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 2) return fullName;
  const initials = parts.slice(0, -1).map(p => p.charAt(0)).join('');
  return `${initials} ${parts[parts.length - 1]}`;
}

// ============================================================
// COMPONENT
// ============================================================

export function ShiftCalendarPage() {
  const { user } = useAuthStore();
  const currentUserId = user?.employee_id || '';

  // ── View state ──
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [departmentId, setDepartmentId] = useState<string>('');
  const [teamFilter, setTeamFilter] = useState<TeamFilter>('all');
  const [showStats, setShowStats] = useState(false);
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [overrideTarget, setOverrideTarget] = useState<OverrideTarget | null>(null);

  // ── Date range ──
  const { dateFrom, dateTo, dates } = useMemo(() => {
    if (viewMode === 'week') {
      const monday = getMonday(currentDate);
      const d: Date[] = [];
      for (let i = 0; i < 7; i++) d.push(addDays(monday, i));
      return {
        dateFrom: formatDate(d[0]),
        dateTo: formatDate(d[6]),
        dates: d,
      };
    } else {
      const first = getFirstOfMonth(currentDate);
      const monday = getMonday(first);
      const d: Date[] = [];
      for (let i = 0; i < 42; i++) {
        const day = addDays(monday, i);
        d.push(day);
        if (i >= 28 && day.getMonth() !== currentDate.getMonth() && day.getDay() === 1) break;
      }
      return {
        dateFrom: formatDate(d[0]),
        dateTo: formatDate(d[d.length - 1]),
        dates: d,
      };
    }
  }, [viewMode, currentDate]);

  // ── Queries ──
  // ★ FIX V3.2: Dùng ensureArray() cho tất cả queries
  const { data: departments = [] } = useQuery({
    queryKey: ['departments-list'],
    queryFn: () => departmentService.getAll({ page: 1, pageSize: 50 }),
    select: (res: any) => ensureArray(res),
    staleTime: 5 * 60 * 1000,
  });

  // ★ FIX 1: Teams query phụ thuộc departmentId
  const { data: teams = [] } = useQuery({
    queryKey: ['shift-teams-dept', departmentId],
    queryFn: () => shiftTeamService.getTeams(departmentId || undefined),
    select: (res: any) => ensureArray(res),
    staleTime: 2 * 60 * 1000,
  });

  // ★ FIX 2: Query team members → build map employee_id → team_id
  const { data: employeeTeamMap = new Map<string, string>() } = useQuery({
    queryKey: ['shift-team-members-map', departmentId, (teams || []).map((t: any) => t.id).join(',')],
    queryFn: async () => {
      const map = new Map<string, string>();
      if (!teams || teams.length === 0) return map;

      for (const team of teams as any[]) {
        try {
          const members = await shiftTeamService.getTeamMembers(team.id);
          ensureArray(members).forEach((m: any) => {
            const empId = m.employee_id || m.id;
            if (empId) map.set(empId, team.id);
          });
        } catch {
          // Skip this team nếu lỗi
        }
      }
      return map;
    },
    enabled: (teams || []).length > 0,
    staleTime: 2 * 60 * 1000,
  });

  const {
    data: calendarData = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['shift-calendar', departmentId, dateFrom, dateTo],
    queryFn: () =>
      shiftAssignmentService.getCalendarView({
        department_id: departmentId || undefined,
        date_from: dateFrom,
        date_to: dateTo,
      }),
    select: (res: any) => ensureArray(res),
    staleTime: 30 * 1000,
  });

  // ★ FIX 3: Filter by team dựa trên employee membership
  const filteredCalendar = useMemo(() => {
    const safeData = ensureArray(calendarData);
    if (teamFilter === 'all') return safeData;

    return safeData.filter((emp: any) => {
      const empTeamId = employeeTeamMap.get(emp.employee_id);
      return empTeamId === teamFilter;
    });
  }, [calendarData, teamFilter, employeeTeamMap]);

  // ── Navigate ──
  const goToday = useCallback(() => setCurrentDate(new Date()), []);
  const goPrev = useCallback(
    () => setCurrentDate((d) => addDays(d, viewMode === 'week' ? -7 : -30)),
    [viewMode]
  );
  const goNext = useCallback(
    () => setCurrentDate((d) => addDays(d, viewMode === 'week' ? 7 : 30)),
    [viewMode]
  );

  // ── Stats ──
  const stats = useMemo(() => {
    const today = getToday();
    let totalEmployees = 0;
    let totalAssigned = 0;
    let overrides = 0;
    let teamACells = 0;
    let teamBCells = 0;

    const teamCodeMap = new Map<string, string>();
    ensureArray(teams).forEach((t: any) => {
      teamCodeMap.set(t.id, t.code || '');
    });

    for (const emp of filteredCalendar as any[]) {
      totalEmployees++;
      const empTeamId = employeeTeamMap.get(emp.employee_id);
      const empTeamCode = empTeamId ? (teamCodeMap.get(empTeamId) || '') : '';

      for (const d of dates) {
        const dateStr = formatDate(d);
        const isSunday = d.getDay() === 0;
        const isSundayOff = isSunday && SUNDAY_OFF_DEPT_CODES.includes(emp.department_code);
        if (isSundayOff) continue;

        const dayAssigns: DayAssignment[] = emp.assignments?.[dateStr] || [];
        const arr = Array.isArray(dayAssigns) ? dayAssigns : dayAssigns ? [dayAssigns] : [];

        for (const a of arr) {
          totalAssigned++;
          if (a.is_override) overrides++;
          if (empTeamCode.includes('A') || empTeamCode === 'TEAM_A') teamACells++;
          if (empTeamCode.includes('B') || empTeamCode === 'TEAM_B') teamBCells++;
        }
      }
    }

    return { totalEmployees, totalAssigned, overrides, teamACells, teamBCells };
  }, [filteredCalendar, dates, employeeTeamMap, teams]);

  // ── Header label ──
  const headerLabel = useMemo(() => {
    if (viewMode === 'week') {
      return `${formatDateVN(dates[0])} — ${formatDateVN(dates[dates.length - 1])}`;
    }
    const months = [
      'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
      'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12',
    ];
    return `${months[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
  }, [viewMode, dates, currentDate]);

  // ── Handle cell click ──
  const handleCellClick = useCallback(
    (emp: any, dateStr: string, assignmentIndex?: number) => {
      const rawAssigns = emp.assignments?.[dateStr];
      const arr: DayAssignment[] = Array.isArray(rawAssigns)
        ? rawAssigns
        : rawAssigns
          ? [rawAssigns]
          : [];
      const targetAssign = assignmentIndex !== undefined ? arr[assignmentIndex] : arr[0] || null;

      setOverrideTarget({
        employeeId: emp.employee_id,
        employeeName: emp.full_name,
        date: dateStr,
        currentShift: targetAssign
          ? {
              id: targetAssign.id,
              shift_id: targetAssign.shift_id,
              shift_name: targetAssign.shift_name,
              assignment_type: targetAssign.assignment_type,
            }
          : null,
      });
    },
    []
  );

  // ── Permission check ──
  const posLevel = user?.position_level ?? 99;
  const isManagerOrAbove = posLevel <= 5;
  const readonly = !isManagerOrAbove;
  const todayStr = getToday();

  // ★ Reset teamFilter khi đổi phòng ban
  const handleDepartmentChange = useCallback((newDeptId: string) => {
    setDepartmentId(newDeptId);
    setTeamFilter('all');
  }, []);

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* ═══════════ HEADER ═══════════ */}
      <div className="bg-white border-b px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarDays size={20} className="text-blue-600" />
            <h1 className="text-base font-bold text-gray-900">Lịch phân ca</h1>
          </div>
          {isManagerOrAbove && (
            <button
              onClick={() => setIsBatchModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium active:bg-blue-700 min-h-[44px]"
            >
              <Layers size={14} />
              <span className="hidden sm:inline">Phân ca hàng loạt</span>
              <span className="sm:hidden">Phân ca</span>
            </button>
          )}
        </div>

        {/* ── Filters ── */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <Building2 size={14} className="text-gray-400" />
            <select
              value={departmentId}
              onChange={(e) => handleDepartmentChange(e.target.value)}
              className="text-sm border rounded-lg px-2 py-1.5 min-h-[36px] bg-white"
            >
              <option value="">Tất cả phòng ban</option>
              {ensureArray(departments).map((dept: any) => (
                <option key={dept.id} value={dept.id}>
                  {dept.name}
                </option>
              ))}
            </select>
          </div>

          {/* ★ FIX: Team dropdown dùng team.id làm value (UUID) */}
          {ensureArray(teams).length > 0 && (
            <div className="flex items-center gap-1.5">
              <Users size={14} className="text-gray-400" />
              <select
                value={teamFilter}
                onChange={(e) => setTeamFilter(e.target.value)}
                className="text-sm border rounded-lg px-2 py-1.5 min-h-[36px] bg-white"
              >
                <option value="all">Tất cả đội</option>
                {ensureArray(teams).map((team: any) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex border rounded-lg overflow-hidden ml-auto">
            <button
              onClick={() => setViewMode('week')}
              className={`px-3 py-1.5 text-xs font-medium min-h-[36px] ${
                viewMode === 'week'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-600 active:bg-gray-100'
              }`}
            >
              Tuần
            </button>
            <button
              onClick={() => setViewMode('month')}
              className={`px-3 py-1.5 text-xs font-medium min-h-[36px] ${
                viewMode === 'month'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-600 active:bg-gray-100'
              }`}
            >
              Tháng
            </button>
          </div>
        </div>

        {/* ── Navigation ── */}
        <div className="mt-2 flex items-center justify-between">
          <button
            onClick={goPrev}
            className="p-2 rounded-lg active:bg-gray-100 min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <ChevronLeft size={18} className="text-gray-600" />
          </button>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-800">{headerLabel}</span>
            <button
              onClick={goToday}
              className="text-xs px-2 py-1 bg-gray-100 rounded text-gray-600 active:bg-gray-200"
            >
              Hôm nay
            </button>
          </div>
          <button
            onClick={goNext}
            className="p-2 rounded-lg active:bg-gray-100 min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <ChevronRight size={18} className="text-gray-600" />
          </button>
        </div>

        {/* ── Stats toggle ── */}
        <button
          onClick={() => setShowStats(!showStats)}
          className="mt-2 flex items-center gap-1 text-xs text-gray-500 active:text-blue-600"
        >
          <BarChart3 size={12} />
          {showStats ? 'Ẩn thống kê' : 'Xem thống kê'}
        </button>

        {showStats && (
          <div className="mt-2 grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
            <div className="bg-blue-50 rounded-lg px-3 py-2">
              <span className="text-blue-600 font-bold">{stats.totalEmployees}</span>
              <span className="text-blue-500 ml-1">nhân viên</span>
            </div>
            <div className="bg-green-50 rounded-lg px-3 py-2">
              <span className="text-green-600 font-bold">{stats.totalAssigned}</span>
              <span className="text-green-500 ml-1">ca đã phân</span>
            </div>
            <div className="bg-amber-50 rounded-lg px-3 py-2">
              <span className="text-amber-600 font-bold">{stats.overrides}</span>
              <span className="text-amber-500 ml-1">đổi ca</span>
            </div>
            {(stats.teamACells > 0 || stats.teamBCells > 0) && (
              <>
                <div className="bg-blue-50 rounded-lg px-3 py-2 border-l-2 border-blue-500">
                  <span className="text-blue-600 font-bold">{stats.teamACells}</span>
                  <span className="text-blue-500 ml-1">Đội A</span>
                </div>
                <div className="bg-rose-50 rounded-lg px-3 py-2 border-l-2 border-rose-500">
                  <span className="text-rose-600 font-bold">{stats.teamBCells}</span>
                  <span className="text-rose-500 ml-1">Đội B</span>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* ═══════════ CALENDAR TABLE ═══════════ */}
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-2 text-gray-400">
            <div className="w-6 h-6 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin" />
            <span className="text-sm">Đang tải lịch...</span>
          </div>
        </div>
      ) : filteredCalendar.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-gray-400">
            <Users size={40} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">Chưa có nhân viên nào</p>
            <p className="text-xs">Chọn phòng ban hoặc điều chỉnh bộ lọc</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-auto scrollbar-hide">
          <table className="w-full border-collapse min-w-[600px]">
            {/* ── Header ── */}
            <thead className="sticky top-0 z-10 bg-white">
              <tr>
                <th className="p-1.5 text-left text-[11px] font-semibold text-gray-500 w-[140px] sm:w-[180px] min-w-[120px] border-b sticky left-0 bg-white z-20">
                  Nhân viên
                </th>
                {dates.map((d) => {
                  const dayIdx = (d.getDay() + 6) % 7;
                  const isSunday = d.getDay() === 0;
                  const isToday = formatDate(d) === todayStr;
                  const isCurrentMonth = d.getMonth() === currentDate.getMonth();

                  return (
                    <th
                      key={formatDate(d)}
                      className={`p-1 text-center text-[10px] font-medium border-b min-w-[52px]
                        ${isSunday ? 'text-red-500' : 'text-gray-500'}
                        ${isToday ? 'bg-blue-50' : ''}
                        ${viewMode === 'month' && !isCurrentMonth ? 'opacity-40' : ''}
                      `}
                    >
                      <div>{DAY_LABELS_SHORT[dayIdx]}</div>
                      <div className={`text-[11px] font-semibold ${isToday ? 'text-blue-600' : ''}`}>
                        {d.getDate()}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>

            {/* ── Body ── */}
            <tbody>
              {filteredCalendar.map((emp: any) => {
                const isSundayOffDept = SUNDAY_OFF_DEPT_CODES.includes(emp.department_code);
                const empName = emp.employee_name || emp.full_name || 'N/A';
                const empCode = emp.employee_code || '';

                return (
                  <tr key={emp.employee_id} className="border-b border-gray-100 active:bg-gray-50">
                    {/* ── Employee Name Cell ── */}
                    <td className="p-1.5 sticky left-0 bg-white z-10 border-r border-gray-50">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-[11px] font-semibold text-gray-600 flex-shrink-0">
                          {empName.charAt(0)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div
                            className="text-[12px] sm:text-[13px] font-medium text-gray-900 truncate leading-tight"
                            title={empName}
                          >
                            <span className="hidden sm:inline">{empName}</span>
                            <span className="sm:hidden">{shortName(empName)}</span>
                          </div>
                          <div className="text-[10px] text-gray-400 truncate leading-tight">
                            {empCode}
                          </div>
                        </div>
                      </div>
                    </td>

                    {dates.map((d) => {
                      const dateStr = formatDate(d);
                      const isSunday = d.getDay() === 0;
                      const isSundayOff = isSunday && isSundayOffDept;
                      const isToday = dateStr === todayStr;
                      const isPast = dateStr < todayStr;

                      const rawAssigns = emp.assignments?.[dateStr];
                      const dayAssigns: DayAssignment[] = Array.isArray(rawAssigns)
                        ? rawAssigns
                        : rawAssigns
                          ? [rawAssigns]
                          : [];

                      return (
                        <ShiftCell
                          key={dateStr}
                          assignments={dayAssigns}
                          date={dateStr}
                          isSundayOff={isSundayOff}
                          isToday={isToday}
                          isPast={isPast}
                          readonly={readonly}
                          onClick={(assignmentIndex) =>
                            handleCellClick(emp, dateStr, assignmentIndex)
                          }
                        />
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ═══════════ LEGEND ═══════════ */}
      <div className="mx-4 mt-2 mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px]">
        {[
          { code: 'SHORT_1', label: 'Sáng', color: 'bg-emerald-200' },
          { code: 'SHORT_2', label: 'Chiều', color: 'bg-amber-200' },
          { code: 'SHORT_3', label: 'Đêm', color: 'bg-indigo-200' },
          { code: 'LONG_DAY', label: 'Ngày 12h', color: 'bg-orange-200' },
          { code: 'LONG_NIGHT', label: 'Đêm 12h', color: 'bg-purple-200' },
          { code: 'ADMIN_PROD', label: 'HC-SX', color: 'bg-gray-200' },
          { code: 'ADMIN_OFFICE', label: 'HC-VP', color: 'bg-sky-200' },
        ].map((item) => (
          <span key={item.code} className="flex items-center gap-1">
            <span className={`w-2.5 h-2.5 rounded-sm ${item.color}`} />
            <span className="text-gray-600">{item.label}</span>
          </span>
        ))}

        {ensureArray(teams).length > 0 && (
          <>
            <span className="border-l pl-2 ml-1 flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-blue-500" />
              <span className="text-gray-500">Đội A</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-amber-500" />
              <span className="text-gray-500">Đội B</span>
            </span>
          </>
        )}

        <span className="flex items-center gap-1 text-amber-500">★ Đổi ca</span>
      </div>

      {/* ═══════════ MODALS ═══════════ */}
      <BatchScheduleModal
        isOpen={isBatchModalOpen}
        onClose={() => {
          setIsBatchModalOpen(false);
          refetch();
        }}
        currentUserId={currentUserId}
        preSelectedDepartmentId={departmentId}
      />

      {overrideTarget && (
        <ShiftOverrideModal
          isOpen={!!overrideTarget}
          onClose={() => {
            setOverrideTarget(null);
            refetch();
          }}
          employeeId={overrideTarget.employeeId}
          employeeName={overrideTarget.employeeName}
          date={overrideTarget.date}
          currentShift={overrideTarget.currentShift}
          currentUserId={currentUserId}
        />
      )}

      <style>{`
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
        .pb-safe { padding-bottom: env(safe-area-inset-bottom, 0px); }
      `}</style>
    </div>
  );
}

export default ShiftCalendarPage;