// ============================================================================
// FILE: src/components/project/WorkloadHeatmap.tsx
// MODULE: Quản lý Dự án — Huy Anh Rubber ERP
// PHASE: PM5 — Bước 5.3 (WorkloadHeatmap)
// ============================================================================
// Ma trận heatmap:
//   Rows = Nhân viên
//   Columns = Tuần hoặc Tháng
//   Cell color = allocation %
//   Click cell → popup chi tiết allocation từng DA
// ============================================================================

import React, { useState, useMemo, useRef, useEffect } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  X,
  Briefcase,
  AlertTriangle,
  Users,
} from 'lucide-react'

// ============================================================================
// TYPES
// ============================================================================

export type HeatmapViewMode = 'week' | 'month'

/** Thông tin allocation 1 DA trong 1 khoảng thời gian */
export interface AllocationSlot {
  project_id: string
  project_code: string
  project_name: string
  allocation_pct: number
  role: string
}

/** Dữ liệu 1 nhân viên trong heatmap */
export interface HeatmapEmployee {
  employee_id: string
  employee_name: string
  employee_code: string
  department_name: string
  avatar_url: string | null
  /** Key = column key (YYYY-WXX cho week, YYYY-MM cho month) */
  slots: Record<string, AllocationSlot[]>
}

/** Props cho component */
export interface WorkloadHeatmapProps {
  employees: HeatmapEmployee[]
  /** Ngày bắt đầu hiển thị (default: đầu tháng hiện tại) */
  startDate?: Date
  /** Số cột hiển thị (default: 8 cho week, 6 cho month) */
  columnCount?: number
  /** Chế độ xem (default: week) */
  viewMode?: HeatmapViewMode
  /** Callback khi click vào cell */
  onCellClick?: (
    employee: HeatmapEmployee,
    columnKey: string,
    slots: AllocationSlot[]
  ) => void
  /** Loading state */
  loading?: boolean
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Lấy ISO week number
 */
function getWeekNumber(date: Date): number {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7))
  const week1 = new Date(d.getFullYear(), 0, 4)
  return (
    1 +
    Math.round(
      ((d.getTime() - week1.getTime()) / 86400000 -
        3 +
        ((week1.getDay() + 6) % 7)) /
        7
    )
  )
}

/**
 * Tạo week key: "2026-W09"
 */
function getWeekKey(date: Date): string {
  const year = date.getFullYear()
  const week = getWeekNumber(date)
  return `${year}-W${String(week).padStart(2, '0')}`
}

/**
 * Tạo month key: "2026-03"
 */
function getMonthKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

/**
 * Tạo label cho column
 */
function getColumnLabel(key: string, mode: HeatmapViewMode): string {
  if (mode === 'week') {
    // "2026-W09" → "T9"
    const weekNum = key.split('-W')[1]
    return `T${parseInt(weekNum, 10)}`
  }
  // "2026-03" → "Th3"
  const monthNum = key.split('-')[1]
  return `Th${parseInt(monthNum, 10)}`
}

/**
 * Tạo sub-label (năm hoặc ngày bắt đầu tuần)
 */
function getColumnSubLabel(key: string, mode: HeatmapViewMode): string {
  if (mode === 'week') {
    const [yearStr, weekStr] = key.split('-W')
    const year = parseInt(yearStr, 10)
    const week = parseInt(weekStr, 10)
    // Tính ngày đầu tuần (Monday)
    const jan4 = new Date(year, 0, 4)
    const dayOfWeek = jan4.getDay() || 7
    const firstMonday = new Date(jan4)
    firstMonday.setDate(jan4.getDate() - dayOfWeek + 1)
    const mondayOfWeek = new Date(firstMonday)
    mondayOfWeek.setDate(firstMonday.getDate() + (week - 1) * 7)
    return `${mondayOfWeek.getDate()}/${mondayOfWeek.getMonth() + 1}`
  }
  // Month: show year
  return key.split('-')[0]
}

/**
 * Tạo danh sách column keys
 */
function generateColumns(
  startDate: Date,
  count: number,
  mode: HeatmapViewMode
): string[] {
  const columns: string[] = []
  const d = new Date(startDate)

  for (let i = 0; i < count; i++) {
    if (mode === 'week') {
      columns.push(getWeekKey(d))
      d.setDate(d.getDate() + 7)
    } else {
      columns.push(getMonthKey(d))
      d.setMonth(d.getMonth() + 1)
    }
  }

  return columns
}

/**
 * Tính tổng allocation cho 1 cell
 */
function getCellTotal(slots: AllocationSlot[]): number {
  return slots.reduce((sum, s) => sum + s.allocation_pct, 0)
}

/**
 * Lấy cell background color class
 */
function getCellBg(total: number): string {
  if (total <= 0) return 'bg-gray-50'
  if (total <= 50) return 'bg-green-100'
  if (total <= 80) return 'bg-blue-200'
  if (total <= 100) return 'bg-amber-200'
  return 'bg-red-300'
}

/**
 * Lấy cell text color class
 */
function getCellText(total: number): string {
  if (total <= 0) return 'text-gray-300'
  if (total <= 50) return 'text-green-800'
  if (total <= 80) return 'text-blue-800'
  if (total <= 100) return 'text-amber-800'
  return 'text-red-900 font-bold'
}

/**
 * Tính ngày bắt đầu tuần chứa date (Monday)
 */
function getMonday(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay() || 7
  d.setDate(d.getDate() - day + 1)
  d.setHours(0, 0, 0, 0)
  return d
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function WorkloadHeatmap({
  employees,
  startDate: propStartDate,
  columnCount: propColumnCount,
  viewMode: propViewMode,
  onCellClick,
  loading = false,
}: WorkloadHeatmapProps) {
  // --- State ---
  const [viewMode, setViewMode] = useState<HeatmapViewMode>(
    propViewMode || 'week'
  )
  const defaultCount = viewMode === 'week' ? 8 : 6
  const columnCount = propColumnCount || defaultCount

  const [baseDate, setBaseDate] = useState<Date>(() => {
    if (propStartDate) return propStartDate
    return viewMode === 'week' ? getMonday(new Date()) : new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  })

  // Popup state
  const [popup, setPopup] = useState<{
    employee: HeatmapEmployee
    columnKey: string
    slots: AllocationSlot[]
    rect: DOMRect
  } | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)

  // Update base date when view mode changes
  useEffect(() => {
    if (viewMode === 'week') {
      setBaseDate(getMonday(new Date()))
    } else {
      setBaseDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1))
    }
  }, [viewMode])

  // --- Computed ---
  const columns = useMemo(
    () => generateColumns(baseDate, columnCount, viewMode),
    [baseDate, columnCount, viewMode]
  )

  const currentKey = useMemo(
    () => (viewMode === 'week' ? getWeekKey(new Date()) : getMonthKey(new Date())),
    [viewMode]
  )

  // --- Navigation ---
  const handlePrev = () => {
    const d = new Date(baseDate)
    if (viewMode === 'week') {
      d.setDate(d.getDate() - 7 * columnCount)
    } else {
      d.setMonth(d.getMonth() - columnCount)
    }
    setBaseDate(d)
  }

  const handleNext = () => {
    const d = new Date(baseDate)
    if (viewMode === 'week') {
      d.setDate(d.getDate() + 7 * columnCount)
    } else {
      d.setMonth(d.getMonth() + columnCount)
    }
    setBaseDate(d)
  }

  const handleToday = () => {
    if (viewMode === 'week') {
      setBaseDate(getMonday(new Date()))
    } else {
      setBaseDate(
        new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      )
    }
  }

  // --- Cell click ---
  const handleCellClick = (
    emp: HeatmapEmployee,
    colKey: string,
    e: React.MouseEvent<HTMLDivElement>
  ) => {
    const slots = emp.slots[colKey] || []
    const rect = e.currentTarget.getBoundingClientRect()

    setPopup({ employee: emp, columnKey: colKey, slots, rect })

    if (onCellClick) {
      onCellClick(emp, colKey, slots)
    }
  }

  // Close popup on outside click
  useEffect(() => {
    if (!popup) return
    const handleClick = () => setPopup(null)
    const timer = setTimeout(() => {
      document.addEventListener('click', handleClick)
    }, 10)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('click', handleClick)
    }
  }, [popup])

  // ==========================================================================
  // RENDER: LEGEND
  // ==========================================================================

  const renderLegend = () => (
    <div className="flex items-center gap-1 text-[10px] text-gray-500 flex-wrap">
      <span>Mức tải:</span>
      {[
        { bg: 'bg-gray-50 border-gray-200', label: '0%' },
        { bg: 'bg-green-100 border-green-300', label: '1-50%' },
        { bg: 'bg-blue-200 border-blue-300', label: '51-80%' },
        { bg: 'bg-amber-200 border-amber-300', label: '81-100%' },
        { bg: 'bg-red-300 border-red-400', label: '>100%' },
      ].map((l) => (
        <span
          key={l.label}
          className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border ${l.bg}`}
        >
          <span
            className={`w-2.5 h-2.5 rounded-sm ${l.bg.split(' ')[0]}`}
          />
          {l.label}
        </span>
      ))}
    </div>
  )

  // ==========================================================================
  // RENDER: POPUP
  // ==========================================================================

  const renderPopup = () => {
    if (!popup) return null

    const total = getCellTotal(popup.slots)
    const label = getColumnLabel(popup.columnKey, viewMode)
    const subLabel = getColumnSubLabel(popup.columnKey, viewMode)

    return (
      <div
        className="fixed z-50 bg-white border border-gray-200 rounded-xl shadow-xl p-3 min-w-[220px] max-w-[280px]"
        style={{
          top: Math.min(popup.rect.bottom + 8, window.innerHeight - 200),
          left: Math.min(
            Math.max(popup.rect.left, 8),
            window.innerWidth - 290
          ),
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="font-semibold text-sm text-gray-900 truncate">
              {popup.employee.employee_name}
            </div>
            <div className="text-xs text-gray-500">
              {label} ({subLabel})
            </div>
          </div>
          <button
            onClick={() => setPopup(null)}
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100"
          >
            <X size={14} />
          </button>
        </div>

        {/* Total */}
        <div
          className={`text-center py-2 rounded-lg mb-2 ${getCellBg(total)}`}
        >
          <span className={`text-xl font-bold ${getCellText(total)}`}>
            {total}%
          </span>
          {total > 100 && (
            <div className="flex items-center justify-center gap-1 text-xs text-red-700 mt-0.5">
              <AlertTriangle size={12} />
              Quá tải {total - 100}%
            </div>
          )}
        </div>

        {/* Project breakdown */}
        {popup.slots.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-2">
            Chưa phân bổ DA nào
          </p>
        ) : (
          <div className="space-y-1.5">
            {popup.slots.map((s, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between text-xs bg-gray-50 rounded-lg px-2.5 py-1.5"
              >
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  <Briefcase
                    size={11}
                    className="text-gray-400 flex-shrink-0"
                  />
                  <span className="truncate text-gray-700">
                    {s.project_code}
                  </span>
                </div>
                <span className="font-mono font-medium text-gray-600 ml-2">
                  {s.allocation_pct}%
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ==========================================================================
  // RENDER: MAIN
  // ==========================================================================

  return (
    <div className="bg-white border rounded-xl overflow-hidden">
      {/* ===== TOOLBAR ===== */}
      <div className="flex items-center justify-between p-3 border-b gap-2 flex-wrap">
        {/* View mode toggle */}
        <div className="flex bg-gray-100 rounded-lg p-0.5">
          {(['week', 'month'] as HeatmapViewMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setViewMode(m)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                viewMode === m
                  ? 'bg-white text-[#1B4D3E] shadow-sm'
                  : 'text-gray-500'
              }`}
            >
              {m === 'week' ? 'Tuần' : 'Tháng'}
            </button>
          ))}
        </div>

        {/* Navigation */}
        <div className="flex items-center gap-1">
          <button
            onClick={handlePrev}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 active:scale-95"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={handleToday}
            className="px-2.5 h-8 text-xs font-medium text-[#1B4D3E] rounded-lg hover:bg-[#1B4D3E]/5 active:scale-95 flex items-center gap-1"
          >
            <Calendar size={13} />
            Hiện tại
          </button>
          <button
            onClick={handleNext}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 active:scale-95"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* ===== HEATMAP TABLE ===== */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-3 border-[#1B4D3E] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : employees.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-gray-400">
          <Users size={36} className="mb-2" />
          <p className="text-sm">Chưa có dữ liệu</p>
        </div>
      ) : (
        <div className="overflow-x-auto" ref={scrollRef}>
          <table className="w-full min-w-[500px]">
            {/* Column headers */}
            <thead>
              <tr className="border-b">
                <th className="sticky left-0 z-10 bg-white text-left px-3 py-2 min-w-[140px] w-[140px]">
                  <span className="text-xs font-medium text-gray-500">
                    Nhân viên
                  </span>
                </th>
                {columns.map((col) => (
                  <th
                    key={col}
                    className={`px-1 py-2 text-center min-w-[52px] ${
                      col === currentKey ? 'bg-[#1B4D3E]/5' : ''
                    }`}
                  >
                    <div
                      className={`text-xs font-medium ${
                        col === currentKey
                          ? 'text-[#1B4D3E]'
                          : 'text-gray-600'
                      }`}
                    >
                      {getColumnLabel(col, viewMode)}
                    </div>
                    <div className="text-[10px] text-gray-400 leading-tight">
                      {getColumnSubLabel(col, viewMode)}
                    </div>
                  </th>
                ))}
                {/* Total column */}
                <th className="px-2 py-2 text-center min-w-[52px] bg-gray-50 border-l">
                  <div className="text-xs font-medium text-gray-600">TB</div>
                </th>
              </tr>
            </thead>

            {/* Data rows */}
            <tbody>
              {employees.map((emp) => {
                // Calculate per-column totals
                const colTotals = columns.map((col) =>
                  getCellTotal(emp.slots[col] || [])
                )
                const avg =
                  colTotals.length > 0
                    ? Math.round(
                        colTotals.reduce((s, v) => s + v, 0) /
                          colTotals.filter((v) => v > 0).length || 0
                      )
                    : 0

                return (
                  <tr key={emp.employee_id} className="border-b last:border-0">
                    {/* Employee name (sticky) */}
                    <td className="sticky left-0 z-10 bg-white px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-[#1B4D3E] flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
                          {emp.avatar_url ? (
                            <img
                              src={emp.avatar_url}
                              alt=""
                              className="w-7 h-7 rounded-full object-cover"
                            />
                          ) : (
                            emp.employee_name?.charAt(0) || '?'
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-gray-900 truncate max-w-[90px]">
                            {emp.employee_name}
                          </div>
                          <div className="text-[10px] text-gray-400 truncate max-w-[90px]">
                            {emp.department_name}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Heatmap cells */}
                    {columns.map((col, idx) => {
                      const total = colTotals[idx]
                      const bg = getCellBg(total)
                      const textColor = getCellText(total)
                      const isCurrentCol = col === currentKey

                      return (
                        <td
                          key={col}
                          className={`px-0.5 py-1 ${
                            isCurrentCol ? 'bg-[#1B4D3E]/5' : ''
                          }`}
                        >
                          <div
                            onClick={(e) => handleCellClick(emp, col, e)}
                            className={`mx-auto w-11 h-9 rounded-md flex items-center justify-center cursor-pointer transition-all active:scale-90 ${bg} ${
                              isCurrentCol
                                ? 'ring-1 ring-[#1B4D3E]/30'
                                : ''
                            }`}
                          >
                            <span
                              className={`text-[11px] font-mono ${textColor}`}
                            >
                              {total > 0 ? `${total}` : '·'}
                            </span>
                          </div>
                        </td>
                      )
                    })}

                    {/* Average column */}
                    <td className="px-1 py-1 bg-gray-50 border-l">
                      <div
                        className={`mx-auto w-11 h-9 rounded-md flex items-center justify-center ${getCellBg(avg)}`}
                      >
                        <span
                          className={`text-[11px] font-mono font-medium ${getCellText(avg)}`}
                        >
                          {avg > 0 ? avg : '·'}
                        </span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ===== LEGEND ===== */}
      <div className="p-3 border-t bg-gray-50">{renderLegend()}</div>

      {/* ===== POPUP ===== */}
      {renderPopup()}
    </div>
  )
}

// ============================================================================
// HELPER EXPORT: Chuyển đổi EmployeeWorkload → HeatmapEmployee
// Dùng trong ProjectResourcePage hoặc CapacityPlanningPage
// ============================================================================

/**
 * Chuyển đổi dữ liệu workload thành format cho heatmap.
 * Mỗi project membership sẽ được phân bổ vào các cột dựa theo start_date/end_date.
 * Nếu không có date range → phân bổ đều tất cả cột.
 */
export function workloadToHeatmapData(
  workloads: Array<{
    employee_id: string
    employee_name: string
    employee_code: string
    department_name: string
    avatar_url: string | null
    projects: Array<{
      project_id: string
      project_code: string
      project_name: string
      role: string
      allocation_pct: number
      start_date: string | null
      end_date: string | null
    }>
  }>,
  columns: string[],
  viewMode: HeatmapViewMode
): HeatmapEmployee[] {
  return workloads.map((wl) => {
    const slots: Record<string, AllocationSlot[]> = {}

    // Initialize all columns
    for (const col of columns) {
      slots[col] = []
    }

    // Distribute each project across applicable columns
    for (const proj of wl.projects) {
      for (const col of columns) {
        // Check if project is active during this column's time period
        let colStart: Date
        let colEnd: Date

        if (viewMode === 'week') {
          const [yearStr, weekStr] = col.split('-W')
          const year = parseInt(yearStr, 10)
          const week = parseInt(weekStr, 10)
          const jan4 = new Date(year, 0, 4)
          const dayOfWeek = jan4.getDay() || 7
          const firstMonday = new Date(jan4)
          firstMonday.setDate(jan4.getDate() - dayOfWeek + 1)
          colStart = new Date(firstMonday)
          colStart.setDate(firstMonday.getDate() + (week - 1) * 7)
          colEnd = new Date(colStart)
          colEnd.setDate(colStart.getDate() + 6)
        } else {
          const [yearStr, monthStr] = col.split('-')
          colStart = new Date(parseInt(yearStr), parseInt(monthStr) - 1, 1)
          colEnd = new Date(parseInt(yearStr), parseInt(monthStr), 0)
        }

        const projStart = proj.start_date
          ? new Date(proj.start_date)
          : null
        const projEnd = proj.end_date ? new Date(proj.end_date) : null

        // If no dates set → assume always active
        const isActive =
          (!projStart && !projEnd) ||
          (!projStart && projEnd && projEnd >= colStart) ||
          (projStart && !projEnd && projStart <= colEnd) ||
          (projStart && projEnd && projStart <= colEnd && projEnd >= colStart)

        if (isActive) {
          slots[col].push({
            project_id: proj.project_id,
            project_code: proj.project_code,
            project_name: proj.project_name,
            allocation_pct: proj.allocation_pct,
            role: proj.role,
          })
        }
      }
    }

    return {
      employee_id: wl.employee_id,
      employee_name: wl.employee_name,
      employee_code: wl.employee_code,
      department_name: wl.department_name,
      avatar_url: wl.avatar_url,
      slots,
    }
  })
}