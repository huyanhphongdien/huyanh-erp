// ============================================================
// SHIFT CALENDAR PAGE - Lịch phân ca
// File: src/features/shift-assignments/ShiftCalendarPage.tsx
// ============================================================

import { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  shiftAssignmentService,
  SUNDAY_OFF_DEPT_CODES,
  departmentService,
} from '../../services';
import { ShiftCell } from './ShiftCell';
import type { ShiftCellData } from './ShiftCell';
import { BatchScheduleModal } from './BatchScheduleModal';
import { ShiftOverrideModal } from './ShiftOverrideModal';
import { useAuthStore } from '../../stores/authStore';
import {
  CalendarDays, ChevronLeft, ChevronRight,
  Users, Layers, BarChart3, Building2,
} from 'lucide-react';

// ============================================================
// TYPES
// ============================================================

type ViewMode = 'week' | 'month';

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

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

function formatMonthYear(year: number, month: number): string {
  const monthNames = [
    'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
    'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12',
  ];
  return `${monthNames[month - 1]} ${year}`;
}

function getWeekDates(baseDate: Date): string[] {
  const monday = getMonday(baseDate);
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
}

function getMonthDates(year: number, month: number): string[] {
  const dates: string[] = [];
  const daysInMonth = new Date(year, month, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    dates.push(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }
  return dates;
}

function getWeekLabel(baseDate: Date): string {
  const dates = getWeekDates(baseDate);
  const from = formatDateShort(dates[0]);
  const to = formatDateShort(dates[6]);
  return `${from} — ${to}`;
}

const DAY_NAMES_SHORT = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const DAY_NAMES_FULL = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'CN'];

// ============================================================
// MAIN COMPONENT
// ============================================================

export function ShiftCalendarPage() {
  // === STATE ===
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [departmentId, setDepartmentId] = useState('');
  const [baseDate, setBaseDate] = useState(new Date());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth() + 1);
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [overrideTarget, setOverrideTarget] = useState<OverrideTarget | null>(null);

  // Current user from auth
  const { user } = useAuthStore();
  const currentUserId = user?.employee_id || '';

  // === DATE RANGES ===
  const dates = useMemo(() => {
    if (viewMode === 'week') {
      return getWeekDates(baseDate);
    } else {
      return getMonthDates(currentYear, currentMonth);
    }
  }, [viewMode, baseDate, currentYear, currentMonth]);

  const dateFrom = dates[0];
  const dateTo = dates[dates.length - 1];
  const today = getToday();

  // === QUERIES ===
  const { data: departmentsData } = useQuery({
    queryKey: ['departments-calendar'],
    queryFn: () => departmentService.getAll({ page: 1, pageSize: 50, status: 'active' }),
  });

  const { data: calendarData, isLoading } = useQuery({
    queryKey: ['shift-calendar', departmentId, dateFrom, dateTo],
    queryFn: () => shiftAssignmentService.getCalendarView({
      department_id: departmentId || undefined,
      date_from: dateFrom,
      date_to: dateTo,
    }),
    enabled: !!dateFrom && !!dateTo,
  });

  const departments = departmentsData?.data || [];
  const employees = calendarData || [];

  // === NAVIGATION ===
  const goNext = useCallback(() => {
    if (viewMode === 'week') {
      const next = new Date(baseDate);
      next.setDate(next.getDate() + 7);
      setBaseDate(next);
    } else {
      if (currentMonth === 12) {
        setCurrentMonth(1);
        setCurrentYear(y => y + 1);
      } else {
        setCurrentMonth(m => m + 1);
      }
    }
  }, [viewMode, baseDate, currentMonth, currentYear]);

  const goPrev = useCallback(() => {
    if (viewMode === 'week') {
      const prev = new Date(baseDate);
      prev.setDate(prev.getDate() - 7);
      setBaseDate(prev);
    } else {
      if (currentMonth === 1) {
        setCurrentMonth(12);
        setCurrentYear(y => y - 1);
      } else {
        setCurrentMonth(m => m - 1);
      }
    }
  }, [viewMode, baseDate, currentMonth, currentYear]);

  const goToday = useCallback(() => {
    const now = new Date();
    setBaseDate(now);
    setCurrentYear(now.getFullYear());
    setCurrentMonth(now.getMonth() + 1);
  }, []);

  // === STATS ===
  // ★ Stats giờ tính theo từng nhân viên: chỉ skip CN cho KT + RD
  const stats = useMemo(() => {
    let totalAssigned = 0;
    let totalCells = 0;
    let overrides = 0;

    employees.forEach(emp => {
      const isSundayOffDept = SUNDAY_OFF_DEPT_CODES.includes(emp.department_code);

      dates.forEach(d => {
        const dayOfWeek = new Date(d + 'T00:00:00').getDay();
        const skipThisCell = dayOfWeek === 0 && isSundayOffDept;

        if (!skipThisCell) {
          totalCells++;
          const assignment = emp.assignments[d];
          if (assignment) {
            totalAssigned++;
            if (assignment.is_override) overrides++;
          }
        }
      });
    });

    return {
      totalEmployees: employees.length,
      totalAssigned,
      totalCells,
      coverageRate: totalCells > 0 ? Math.round((totalAssigned / totalCells) * 100) : 0,
      overrides,
    };
  }, [employees, dates]);

  // === CELL CLICK ===
  const handleCellClick = (employeeId: string, employeeName: string, date: string, data: ShiftCellData | null) => {
    setOverrideTarget({
      employeeId,
      employeeName,
      date,
      currentShift: data ? {
        id: data.id,
        shift_id: data.shift_id,
        shift_name: data.shift_name,
        assignment_type: data.assignment_type,
      } : null,
    });
  };

  // === TITLE ===
  const periodLabel = viewMode === 'week'
    ? getWeekLabel(baseDate)
    : formatMonthYear(currentYear, currentMonth);

  return (
    <div className="p-4 lg:p-6 max-w-[1400px] mx-auto">
      {/* ============ HEADER ============ */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <CalendarDays size={24} className="text-blue-500" />
            Phân ca
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">{periodLabel}</p>
        </div>
        <button
          onClick={() => setIsBatchModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white
            rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm"
        >
          <Layers size={16} />
          Phân ca nhanh
        </button>
      </div>

      {/* ============ TOOLBAR ============ */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        {/* Department filter */}
        <div className="flex items-center gap-2">
          <Building2 size={16} className="text-gray-400" />
          <select
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm
              focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">Tất cả phòng ban</option>
            {departments.map((d: any) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>

        {/* View mode toggle */}
        <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
          <button
            onClick={() => setViewMode('week')}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-all
              ${viewMode === 'week'
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
              }
            `}
          >
            Tuần
          </button>
          <button
            onClick={() => setViewMode('month')}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-all
              ${viewMode === 'month'
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
              }
            `}
          >
            Tháng
          </button>
        </div>

        {/* Navigation */}
        <div className="flex items-center gap-1">
          <button
            onClick={goPrev}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ChevronLeft size={18} className="text-gray-600" />
          </button>
          <button
            onClick={goToday}
            className="px-2.5 py-1 text-xs font-medium text-blue-600 bg-blue-50
              hover:bg-blue-100 rounded-lg transition-colors"
          >
            Hôm nay
          </button>
          <button
            onClick={goNext}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ChevronRight size={18} className="text-gray-600" />
          </button>
        </div>

        {/* Stats mini */}
        <div className="ml-auto flex items-center gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <Users size={13} />
            {stats.totalEmployees} NV
          </span>
          <span className="flex items-center gap-1">
            <BarChart3 size={13} />
            {stats.coverageRate}% phân ca
          </span>
          {stats.overrides > 0 && (
            <span className="text-yellow-600">★ {stats.overrides} đổi ca</span>
          )}
        </div>
      </div>

      {/* ============ CALENDAR TABLE ============ */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full" />
          <span className="ml-3 text-gray-500">Đang tải lịch ca...</span>
        </div>
      ) : employees.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-xl border border-gray-200">
          <Users size={40} className="text-gray-300 mb-3" />
          <p className="text-gray-500 text-sm">
            {departmentId ? 'Không có nhân viên trong phòng ban này' : 'Chọn phòng ban để xem lịch phân ca'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              {/* Header: dates */}
              <thead>
                <tr className="bg-gray-50">
                  <th className="sticky left-0 z-10 bg-gray-50 px-3 py-2 text-left text-xs font-semibold text-gray-600 min-w-[160px] border-b border-r border-gray-200">
                    Nhân viên
                  </th>
                  {dates.map(d => {
                    const dateObj = new Date(d + 'T00:00:00');
                    const dayOfWeek = dateObj.getDay();
                    const isSunday = dayOfWeek === 0;
                    const isCurrentDay = d === today;
                    // Map JS day (0=Sun, 1=Mon...) to our DAY_NAMES index (0=Mon)
                    const dayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

                    return (
                      <th
                        key={d}
                        className={`px-0.5 py-1.5 text-center border-b border-gray-200 min-w-[52px]
                          ${isCurrentDay ? 'bg-blue-50' : ''}
                        `}
                      >
                        <div className={`text-[10px] font-medium ${isSunday ? 'text-red-500 font-semibold' : 'text-gray-500'}`}>
                          {viewMode === 'week' ? DAY_NAMES_FULL[dayIndex] : DAY_NAMES_SHORT[dayIndex]}
                        </div>
                        <div className={`text-xs font-bold
                          ${isSunday ? 'text-red-500' : isCurrentDay ? 'text-blue-600' : 'text-gray-700'}
                        `}>
                          {dateObj.getDate()}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>

              {/* Body: employee rows */}
              <tbody>
                {employees.map((emp, empIdx) => {
                  // ★ Xác định phòng ban này có nghỉ CN không
                  const isSundayOffDept = SUNDAY_OFF_DEPT_CODES.includes(emp.department_code);

                  return (
                    <tr
                      key={emp.employee_id}
                      className={empIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}
                    >
                      {/* Employee name - sticky */}
                      <td className="sticky left-0 z-10 px-3 py-1.5 border-r border-gray-200 min-w-[160px]"
                        style={{ backgroundColor: empIdx % 2 === 0 ? 'white' : '#fafafa' }}
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                            <span className="text-[10px] font-bold text-blue-600">
                              {emp.employee_name.charAt(emp.employee_name.lastIndexOf(' ') + 1) || '?'}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-gray-900 truncate" title={emp.employee_name}>
                              {emp.employee_name}
                            </p>
                            <p className="text-[10px] text-gray-400">{emp.employee_code}</p>
                          </div>
                        </div>
                      </td>

                      {/* Shift cells */}
                      {dates.map(d => {
                        const dateObj = new Date(d + 'T00:00:00');
                        const dayOfWeek = dateObj.getDay();
                        const isCurrentDay = d === today;
                        const isPast = d < today;
                        const cellData = emp.assignments[d] as ShiftCellData | undefined;

                        // ★ CHỈ nghỉ CN khi phòng ban thuộc danh sách nghỉ CN
                        const isSundayOff = dayOfWeek === 0 && isSundayOffDept;

                        return (
                          <ShiftCell
                            key={d}
                            data={cellData || null}
                            date={d}
                            isSundayOff={isSundayOff}
                            isToday={isCurrentDay}
                            isPast={isPast}
                            onClick={() => handleCellClick(
                              emp.employee_id,
                              emp.employee_name,
                              d,
                              cellData || null
                            )}
                          />
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div className="px-4 py-2 border-t border-gray-200 bg-gray-50 flex flex-wrap items-center gap-3 text-[10px]">
            <span className="text-gray-500 font-medium">Chú thích:</span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-emerald-100 border border-emerald-300" /> Ca 1
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-amber-100 border border-amber-300" /> Ca 2
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-indigo-100 border border-indigo-300" /> Ca 3
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-orange-100 border border-orange-300" /> Ca ngày
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-purple-100 border border-purple-300" /> Ca đêm
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-gray-100 border border-gray-300" /> HC-SX
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-sky-100 border border-sky-300" /> HC-VP
            </span>
            <span className="flex items-center gap-1 text-yellow-600">★ Đổi ca</span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-gray-100 border border-gray-300" />
              <span className="text-gray-400 italic">CN nghỉ (KT, R&D)</span>
            </span>
          </div>
        </div>
      )}

      {/* ============ MODALS ============ */}
      <BatchScheduleModal
        isOpen={isBatchModalOpen}
        onClose={() => setIsBatchModalOpen(false)}
        currentUserId={currentUserId}
        preSelectedDepartmentId={departmentId}
      />

      {overrideTarget && (
        <ShiftOverrideModal
          isOpen={!!overrideTarget}
          onClose={() => setOverrideTarget(null)}
          employeeId={overrideTarget.employeeId}
          employeeName={overrideTarget.employeeName}
          date={overrideTarget.date}
          currentShift={overrideTarget.currentShift}
          currentUserId={currentUserId}
        />
      )}
    </div>
  );
}

export default ShiftCalendarPage;