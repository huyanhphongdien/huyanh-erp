// ============================================================================
// MONTHLY TIMESHEET PAGE V2 — Bảng chấm công tháng (Fixed sticky columns)
// File: src/features/attendance/MonthlyTimesheetPage.tsx
// ============================================================================

import { useState, useMemo, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Download,
  Building2,
  Loader2,
  Eye,
  X,
} from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { supabase } from '../../lib/supabase'
import { monthlyTimesheetService } from '../../services/monthlyTimesheetService'
import type { DayDetail, EmployeeMonthlySummary } from '../../services/monthlyTimesheetService'
import { exportMonthlyTimesheetExcel } from '../../services/monthlyTimesheetExcel'
import EditAttendanceModal from './EditAttendanceModal'

// ============================================================================
// CONSTANTS
// ============================================================================

const SYMBOL_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  'HC': { bg: 'bg-blue-100',    text: 'text-blue-700',    label: 'Hành chính' },
  'S':  { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Ca sáng/ngày' },
  'C2': { bg: 'bg-orange-100',  text: 'text-orange-700',  label: 'Ca chiều' },
  'Đ':  { bg: 'bg-violet-100',  text: 'text-violet-700',  label: 'Ca đêm' },
  'CT': { bg: 'bg-cyan-100',    text: 'text-cyan-700',    label: 'Công tác' },
  'P':  { bg: 'bg-yellow-100',  text: 'text-yellow-700',  label: 'Nghỉ phép' },
  '2ca':{ bg: 'bg-pink-100',    text: 'text-pink-700',    label: '2 ca' },
  'L':  { bg: 'bg-amber-200',   text: 'text-amber-800',   label: 'Nghỉ lễ' },
  'X':  { bg: 'bg-red-100',     text: 'text-red-600',     label: 'Vắng' },
  '—':  { bg: 'bg-gray-50',     text: 'text-gray-300',    label: '' },
  '':   { bg: '',               text: 'text-gray-200',    label: '' },
}

const MONTHS_VN = [
  '', 'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
  'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12',
]

const WEEKDAY_VN = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']

// ★ V2: Fixed pixel widths for sticky columns
const COL_STT = 44
const COL_NAME = 164
const COL_NAME_LEFT = COL_STT

// ── Ẩn 1 số NV trên bảng công của phòng QLSX (managers/admin không chấm công)
//    Lê Vang HA-0045, Phạm Bá Lượng HA-0071, Trần Văn Hiền HA-0070, Lê Duy Minh HA-0059
const QLSX_DEPT_ID = 'd0000000-0000-0000-0000-000000000002'
const QLSX_HIDDEN_EMPLOYEE_CODES = new Set(['HA-0045', 'HA-0071', 'HA-0070', 'HA-0059'])

// Symbol có nghĩa "đi làm" — dùng để check NV có làm việc thật vào ngày lễ không.
// Loại trừ L/P/X/—/'': nghỉ lễ / phép / vắng / chưa tới / trống.
const WORKING_SYMBOLS = new Set(['S', 'Đ', 'C2', 'HC', 'CT', '2ca'])

// ============================================================================
// HELPER
// ============================================================================

function formatTimeVN(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' })
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function MonthlyTimesheetPage() {
  const { user } = useAuthStore()
  const tableRef = useRef<HTMLDivElement>(null)

  const now = new Date()
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1)
  const [selectedYear, setSelectedYear] = useState(now.getFullYear())
  const [selectedDept, setSelectedDept] = useState<string>('all')
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeMonthlySummary | null>(null)
  const [tooltipData, setTooltipData] = useState<{ day: DayDetail; x: number; y: number } | null>(null)
  const [editModal, setEditModal] = useState<{ day: DayDetail; employeeId: string; employeeName: string } | null>(null)

  const { data: departments = [] } = useQuery({
    queryKey: ['departments-list'],
    queryFn: async () => {
      const { data } = await supabase.from('departments').select('id, name, code').order('name')
      return data || []
    },
  })

  const effectiveDeptId = selectedDept === 'all' ? undefined : selectedDept

  const { data: timesheet, isLoading } = useQuery({
    queryKey: ['monthly-timesheet', selectedYear, selectedMonth, effectiveDeptId],
    queryFn: () => monthlyTimesheetService.getMonthlyTimesheet(selectedYear, selectedMonth, effectiveDeptId || null),
    staleTime: 5 * 60 * 1000,
  })

  const daysInMonth = timesheet?.daysInMonth || new Date(selectedYear, selectedMonth, 0).getDate()

  // Filter ẩn các NV không chấm công của phòng QLSX (xem const QLSX_HIDDEN_EMPLOYEE_CODES)
  // Khi user chọn "Phòng QLSX" → bỏ 4 người. Các phòng khác giữ nguyên.
  const displayedTimesheet = useMemo(() => {
    if (!timesheet) return null
    if (selectedDept === QLSX_DEPT_ID) {
      return {
        ...timesheet,
        employees: timesheet.employees.filter(e => !QLSX_HIDDEN_EMPLOYEE_CODES.has(e.employeeCode)),
      }
    }
    return timesheet
  }, [timesheet, selectedDept])

  const dayHeaders = useMemo(() => {
    const h: { day: number; weekday: string; isWeekend: boolean }[] = []
    for (let d = 1; d <= daysInMonth; d++) {
      const dt = new Date(selectedYear, selectedMonth - 1, d)
      const dow = dt.getDay()
      h.push({ day: d, weekday: WEEKDAY_VN[dow], isWeekend: dow === 0 })
    }
    return h
  }, [daysInMonth, selectedYear, selectedMonth])

  const prevMonth = () => {
    if (selectedMonth === 1) { setSelectedMonth(12); setSelectedYear(y => y - 1) }
    else setSelectedMonth(m => m - 1)
    setSelectedEmployee(null)
  }
  const nextMonth = () => {
    if (selectedMonth === 12) { setSelectedMonth(1); setSelectedYear(y => y + 1) }
    else setSelectedMonth(m => m + 1)
    setSelectedEmployee(null)
  }

  const handleExportExcel = () => {
    if (!displayedTimesheet || displayedTimesheet.employees.length === 0) {
      alert('Không có dữ liệu để xuất')
      return
    }
    exportMonthlyTimesheetExcel(displayedTimesheet)
  }

  const showTooltip = (day: DayDetail, e: React.MouseEvent) => {
    if (!day.checkIn && !day.isLeave && !day.isBusinessTrip && day.symbol !== 'X') return
    const rect = (e.target as HTMLElement).getBoundingClientRect()
    setTooltipData({ day, x: Math.min(rect.left, window.innerWidth - 260), y: rect.bottom + 4 })
  }

  // ★ Live data from timesheet (after refetch) for slide-in panel
  const liveSelectedEmp = selectedEmployee
    ? (displayedTimesheet?.employees.find(e => e.employeeId === selectedEmployee.employeeId) || selectedEmployee)
    : null

  // ============================================================
  // RENDER: Grid view (phòng ban) — single render path with slide-in panel
  // ============================================================
  return (
    <div className="min-h-screen bg-[#F7F5F2]">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-20">
        <div className="max-w-[1600px] mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-[16px] font-bold text-[#1B4D3E]">Bảng chấm công</h1>
            <button onClick={handleExportExcel} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-medium bg-[#1B4D3E] text-white active:bg-[#163d32]">
              <Download size={14} /><span className="hidden sm:inline">Xuất Excel</span>
            </button>
          </div>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg px-1 py-1">
              <button onClick={prevMonth} className="p-1.5 rounded-md hover:bg-white active:bg-gray-200"><ChevronLeft size={16} className="text-gray-600" /></button>
              <div className="flex items-center gap-1.5 px-2 min-w-[140px] justify-center">
                <Calendar size={14} className="text-gray-500" />
                <span className="text-[14px] font-bold text-gray-800">{MONTHS_VN[selectedMonth]} {selectedYear}</span>
              </div>
              <button onClick={nextMonth} className="p-1.5 rounded-md hover:bg-white active:bg-gray-200"><ChevronRight size={16} className="text-gray-600" /></button>
            </div>
            <div className="flex items-center gap-1.5">
              <Building2 size={14} className="text-gray-400" />
              <select value={selectedDept} onChange={e => { setSelectedDept(e.target.value); setSelectedEmployee(null) }}
                className="text-[13px] border border-gray-300 rounded-lg px-2 py-1.5 bg-white focus:ring-1 focus:ring-[#1B4D3E]">
                <option value="all">Tất cả phòng ban</option>
                {(departments || []).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2 text-[11px] ml-auto flex-wrap">
              {Object.entries(SYMBOL_STYLES).filter(([k]) => k && k !== '—' && k !== '').map(([sym, s]) => (
                <span key={sym} className={`px-1.5 py-0.5 rounded ${s.bg} ${s.text} font-bold`}>{sym}={s.label}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-[1600px] mx-auto px-4 py-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-[#1B4D3E] mr-2" />
            <span className="text-gray-500">Đang tải bảng chấm công...</span>
          </div>
        ) : !displayedTimesheet || displayedTimesheet.employees.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <Calendar size={40} className="mx-auto mb-3 opacity-50" />
            <p className="text-[15px] font-medium">Không có dữ liệu</p>
          </div>
        ) : (
          <div ref={tableRef} className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="border-collapse text-[12px]" style={{ minWidth: COL_STT + COL_NAME + daysInMonth * 36 + 160 }}>
                <thead>
                  <tr className="bg-[#1B4D3E] text-white">
                    <th style={{ position: 'sticky', left: 0, zIndex: 12, width: COL_STT, minWidth: COL_STT, backgroundColor: '#1B4D3E' }}
                      className="px-2 py-2 text-center border-r border-[#2D8B6E]">STT</th>
                    <th style={{ position: 'sticky', left: COL_NAME_LEFT, zIndex: 12, width: COL_NAME, minWidth: COL_NAME, backgroundColor: '#1B4D3E', boxShadow: '2px 0 4px rgba(0,0,0,0.15)' }}
                      className="px-2 py-2 text-left border-r border-[#2D8B6E]">Họ và tên</th>
                    {dayHeaders.map(h => (
                      <th key={h.day} className={`px-0 py-1.5 text-center border-l border-[#2D8B6E]/40 ${h.isWeekend ? 'bg-red-600' : ''}`} style={{ width: 36, minWidth: 36 }}>
                        <div className="text-[12px] font-bold">{String(h.day).padStart(2, '0')}</div>
                        <div className={`text-[9px] font-normal ${h.isWeekend ? 'text-red-100' : 'text-white/60'}`}>{h.weekday}</div>
                      </th>
                    ))}
                    <th className="px-2 py-2 text-center border-l-2 border-white/30 bg-emerald-800" style={{ minWidth: 48 }}>Công</th>
                    <th className="px-2 py-2 text-center bg-amber-700" style={{ minWidth: 40 }}>Trễ</th>
                    <th className="px-2 py-2 text-center bg-red-700" style={{ minWidth: 40 }}>Vắng</th>
                    <th className="px-2 py-2 text-center bg-amber-600" style={{ minWidth: 40 }}>Lễ</th>
                    <th className="px-1 py-2 text-center bg-gray-700" style={{ minWidth: 36 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {(displayedTimesheet.employees || []).map((emp, idx) => {
                    const bg = idx % 2 === 0 ? '#ffffff' : '#f9fafb'
                    return (
                      <tr key={emp.employeeId} className="border-t border-gray-100 hover:bg-blue-50/30">
                        <td style={{ position: 'sticky', left: 0, zIndex: 5, width: COL_STT, minWidth: COL_STT, backgroundColor: bg }}
                          className="px-2 py-1.5 text-center font-medium text-gray-400 border-r border-gray-100">{idx + 1}</td>
                        <td style={{ position: 'sticky', left: COL_NAME_LEFT, zIndex: 5, width: COL_NAME, minWidth: COL_NAME, backgroundColor: bg, boxShadow: '2px 0 4px rgba(0,0,0,0.06)' }}
                          className="px-2 py-1.5 border-r border-gray-200">
                          <div className="font-medium text-gray-800 truncate" style={{ maxWidth: COL_NAME - 20 }} title={emp.fullName}>{emp.fullName}</div>
                          <div className="text-[10px] text-gray-400">{emp.employeeCode}</div>
                        </td>
                        {emp.days.map((day, di) => {
                          const isWE = dayHeaders[di]?.isWeekend
                          const s = SYMBOL_STYLES[day.symbol] || SYMBOL_STYLES['']
                          const hasDetail = day.checkIn || day.isLeave || day.isBusinessTrip || day.isHoliday || day.symbol === 'X'
                          // Ngày lễ NV đi làm (có shift symbol thực) → ring vàng để nhận diện sẽ được nghỉ bù.
                          // CN-lễ + NV không đi làm → symbol='X' nhưng KHÔNG phải worked → không ring vàng.
                          const workedHoliday = day.isHoliday && WORKING_SYMBOLS.has(day.symbol)
                          // Cell background tint vàng nhạt cho ngày lễ (cả đi làm + nghỉ) để dễ thấy cả cột
                          const tdBg = isWE ? 'bg-red-50' : (day.isHoliday ? 'bg-amber-50' : '')
                          return (
                            <td key={di} className={`px-0 py-1.5 text-center border-l border-gray-50 ${tdBg}`}
                              onMouseEnter={e => hasDetail && showTooltip(day, e)} onMouseLeave={() => setTooltipData(null)}
                              onClick={() => { setTooltipData(null); setEditModal({ day, employeeId: emp.employeeId, employeeName: emp.fullName }) }}
                              style={{ cursor: 'pointer' }}>
                              <div className={`mx-auto w-7 h-6 rounded-md flex items-center justify-center text-[10px] font-bold transition-transform hover:scale-110 ${isWE && day.symbol === '—' ? 'bg-red-100 text-red-300' : `${s.bg} ${s.text}`} ${workedHoliday ? 'ring-2 ring-amber-500' : ''} ${day.lateMinutes > 0 ? 'ring-1 ring-amber-400' : ''} ${day.overtimeMinutes > 0 ? 'ring-1 ring-red-400' : ''}`}>
                                {day.symbol}
                              </div>
                            </td>
                          )
                        })}
                        <td className="px-1 py-1.5 text-center font-bold text-[15px] text-emerald-800 border-l-2 border-gray-200">{emp.totalCong}</td>
                        <td className="px-1 py-1.5 text-center">{emp.totalLateDays > 0 ? <span className="text-amber-600 font-bold text-[13px]">{emp.totalLateDays}</span> : <span className="text-gray-300">—</span>}</td>
                        <td className="px-1 py-1.5 text-center">{emp.totalAbsentDays > 0 ? <span className="text-red-500 font-bold text-[13px]">{emp.totalAbsentDays}</span> : <span className="text-gray-300">—</span>}</td>
                        <td className="px-1 py-1.5 text-center">{emp.totalHolidayDays > 0 ? <span className="text-amber-700 font-bold text-[13px]">{emp.totalHolidayDays}</span> : <span className="text-gray-300">—</span>}</td>
                        <td className="px-1 py-1 text-center">
                          <button onClick={() => setSelectedEmployee(emp)} className="p-1 rounded hover:bg-gray-200 active:bg-gray-300" title="Xem chi tiết">
                            <Eye size={13} className="text-gray-400" />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-[#1B4D3E]/20 font-bold text-[12px]">
                    <td style={{ position: 'sticky', left: 0, zIndex: 5, backgroundColor: '#f0fdf4' }} className="px-2 py-2 border-r border-gray-100" />
                    <td style={{ position: 'sticky', left: COL_NAME_LEFT, zIndex: 5, backgroundColor: '#f0fdf4', boxShadow: '2px 0 4px rgba(0,0,0,0.06)' }}
                      className="px-2 py-2 text-[#1B4D3E] border-r border-gray-200">Tổng ({displayedTimesheet.employees.length} NV)</td>
                    {dayHeaders.map((_, i) => <td key={i} className="border-l border-gray-50" style={{ backgroundColor: '#f0fdf4' }} />)}
                    <td className="px-1 py-2 text-center text-[14px] text-[#1B4D3E] border-l-2 border-gray-200" style={{ backgroundColor: '#f0fdf4' }}>{Math.round(displayedTimesheet.employees.reduce((s, e) => s + e.totalCong, 0) * 10) / 10}</td>
                    <td className="px-1 py-2 text-center text-amber-600" style={{ backgroundColor: '#f0fdf4' }}>{displayedTimesheet.employees.reduce((s, e) => s + e.totalLateDays, 0) || ''}</td>
                    <td className="px-1 py-2 text-center text-red-500" style={{ backgroundColor: '#f0fdf4' }}>{displayedTimesheet.employees.reduce((s, e) => s + e.totalAbsentDays, 0) || ''}</td>
                    <td className="px-1 py-2 text-center text-amber-700" style={{ backgroundColor: '#f0fdf4' }}>{displayedTimesheet.employees.reduce((s, e) => s + e.totalHolidayDays, 0) || ''}</td>
                    <td style={{ backgroundColor: '#f0fdf4' }} />
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="px-4 py-3 border-t bg-gray-50 flex items-center justify-between text-[11px] text-gray-400">
              <span>{displayedTimesheet.departmentName} • {MONTHS_VN[selectedMonth]} {selectedYear}</span>
              <div className="flex gap-12">
                {['Người lập', 'Trưởng phòng', 'Giám đốc'].map(t => (
                  <div key={t} className="text-center"><div className="mb-6">{t}</div><div className="border-t border-gray-300 pt-1 min-w-[100px]" /></div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Slide-in Detail Panel */}
      {liveSelectedEmp && (() => {
        const emp = liveSelectedEmp
        // Count by symbol category for stats
        let statHC = 0, statShift = 0, statCT = 0, statP = 0, statL = 0, statWorkedHoliday = 0, statX = 0
        emp.days.forEach(d => {
          if (d.symbol === 'HC') statHC++
          else if (['S', 'C2', 'Đ', '2ca'].includes(d.symbol)) statShift++
          else if (d.symbol === 'CT') statCT++
          else if (d.symbol === 'P') statP++
          else if (d.symbol === 'L') statL++
          else if (d.symbol === 'X') statX++
          // Ngày lễ NV đi làm thật (có shift symbol) — cộng riêng để admin biết bao nhiêu ngày phải duyệt nghỉ bù.
          // Lễ rơi CN + NV không đi làm → symbol='X', KHÔNG count vào đây.
          if (d.isHoliday && WORKING_SYMBOLS.has(d.symbol)) statWorkedHoliday++
        })
        return (
          <>
            {/* Backdrop */}
            <div className="fixed inset-0 bg-black/30 z-40 animate-in fade-in"
              onClick={() => setSelectedEmployee(null)} />
            {/* Panel */}
            <div className="fixed top-0 right-0 w-[380px] max-w-[92vw] h-screen bg-white shadow-2xl z-50 overflow-y-auto animate-in slide-in-from-right duration-300">
              {/* Header */}
              <div className="sticky top-0 z-10 bg-[#1B4D3E] text-white px-4 py-3 flex items-center justify-between">
                <div className="min-w-0">
                  <div className="text-[16px] font-bold truncate">{emp.fullName}</div>
                  <div className="text-[12px] text-white/70 truncate">{emp.employeeCode} • {emp.departmentName}</div>
                  <div className="text-[11px] text-white/60">{MONTHS_VN[selectedMonth]} {selectedYear}</div>
                </div>
                <button onClick={() => setSelectedEmployee(null)} className="p-1.5 rounded-lg hover:bg-white/10 active:bg-white/20 flex-shrink-0">
                  <X size={20} />
                </button>
              </div>

              {/* KPI cards */}
              <div className="px-4 pt-4 grid grid-cols-3 gap-2">
                <div className="bg-emerald-50 rounded-lg p-3 text-center">
                  <div className="text-[22px] font-bold text-emerald-800 leading-none">{emp.totalCong}</div>
                  <div className="text-[10px] text-gray-600 mt-1">Tổng công</div>
                </div>
                <div className="bg-amber-50 rounded-lg p-3 text-center">
                  <div className="text-[22px] font-bold text-amber-700 leading-none">{emp.totalLateDays}</div>
                  <div className="text-[10px] text-gray-600 mt-1">Ngày trễ</div>
                </div>
                <div className="bg-red-50 rounded-lg p-3 text-center">
                  <div className="text-[22px] font-bold text-red-600 leading-none">{emp.totalAbsentDays}</div>
                  <div className="text-[10px] text-gray-600 mt-1">Vắng</div>
                </div>
              </div>

              {/* Statistics breakdown */}
              <div className="px-4 pt-4">
                <div className="text-[13px] font-semibold text-gray-700 mb-2">Thống kê</div>
                <table className="w-full text-[12px]">
                  <tbody>
                    <tr className="border-b border-gray-100"><td className="py-1.5 text-gray-600">HC (Hành chính)</td><td className="text-right font-semibold">{statHC}</td></tr>
                    <tr className="border-b border-gray-100"><td className="py-1.5 text-gray-600">Ca sáng/chiều/đêm</td><td className="text-right font-semibold">{statShift}</td></tr>
                    <tr className="border-b border-gray-100"><td className="py-1.5 text-gray-600">Công tác</td><td className="text-right font-semibold text-cyan-700">{statCT}</td></tr>
                    <tr className="border-b border-gray-100"><td className="py-1.5 text-gray-600">Nghỉ phép</td><td className="text-right font-semibold text-yellow-700">{statP}</td></tr>
                    <tr className="border-b border-gray-100"><td className="py-1.5 text-gray-600">Nghỉ lễ</td><td className="text-right font-semibold text-amber-700">{statL}</td></tr>
                    {statWorkedHoliday > 0 && (
                      <tr className="border-b border-gray-100 bg-amber-50/50">
                        <td className="py-1.5 text-amber-800 text-[11px]">↳ Đi làm lễ (sẽ nghỉ bù)</td>
                        <td className="text-right font-semibold text-amber-700">{statWorkedHoliday}</td>
                      </tr>
                    )}
                    <tr><td className="py-1.5 text-gray-600">Vắng</td><td className="text-right font-semibold text-red-600">{statX}</td></tr>
                  </tbody>
                </table>
              </div>

              {/* Daily breakdown */}
              <div className="px-4 pt-4 pb-6">
                <div className="text-[13px] font-semibold text-gray-700 mb-2">Chi tiết từng ngày</div>
                <div className="flex flex-col gap-1">
                  {emp.days.map((day, i) => {
                    const dt = new Date(day.date + 'T00:00:00+07:00')
                    const dow = WEEKDAY_VN[dt.getDay()]
                    const style = SYMBOL_STYLES[day.symbol] || SYMBOL_STYLES['']
                    return (
                      <div key={day.date}
                        onClick={() => { setEditModal({ day, employeeId: emp.employeeId, employeeName: emp.fullName }) }}
                        className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-gray-50 active:bg-gray-100 ${day.isWeekend ? 'bg-red-50/40' : i % 2 === 0 ? 'bg-gray-50/50' : ''}`}>
                        <span className={`text-[11px] w-12 flex-shrink-0 ${day.isWeekend ? 'text-red-400' : 'text-gray-500'}`}>
                          {String(i + 1).padStart(2, '0')}/{dow}
                        </span>
                        <div className={`w-7 h-5 rounded flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${style.bg} ${style.text}`}>{day.symbol}</div>
                        <span className="text-[11px] text-gray-600 flex-1 truncate">
                          {day.checkIn ? `${formatTimeVN(day.checkIn)}→${formatTimeVN(day.checkOut) || '...'}` :
                            day.isBusinessTrip ? 'Công tác' :
                            day.isLeave ? 'Nghỉ phép' :
                            day.symbol === 'X' ? 'Vắng' : ''}
                        </span>
                        {day.dayWorkUnits > 0 && <span className="text-[11px] font-semibold text-emerald-700 flex-shrink-0">{day.dayWorkUnits}c</span>}
                        {day.lateMinutes > 0 && <span className="text-[9px] font-bold bg-amber-100 text-amber-600 px-1 rounded flex-shrink-0">T{day.lateMinutes}p</span>}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </>
        )
      })()}

      {/* Edit Modal */}
      {editModal && (
        <EditAttendanceModal
          open={!!editModal}
          onClose={() => setEditModal(null)}
          day={editModal.day}
          employeeId={editModal.employeeId}
          employeeName={editModal.employeeName}
          onSaved={() => setEditModal(null)}
        />
      )}

      {/* Tooltip */}
      {tooltipData && (
        <div className="fixed z-50 bg-white rounded-lg shadow-xl border border-gray-200 px-3 py-2 text-[12px] max-w-[250px]"
          style={{ left: tooltipData.x, top: tooltipData.y }} onMouseLeave={() => setTooltipData(null)}>
          <div className="font-bold text-gray-800 mb-1">
            {new Date(tooltipData.day.date + 'T00:00:00+07:00').toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit' })}
          </div>
          {tooltipData.day.isHoliday && (
            <div className="text-amber-700 font-medium bg-amber-50 px-2 py-0.5 rounded text-[11px] mb-1">
              🎉 Lễ: {tooltipData.day.holidayName}
              {tooltipData.day.checkIn && ' — đi làm sẽ được nghỉ bù'}
            </div>
          )}
          {tooltipData.day.shiftName && <div className="text-gray-500">Ca: {tooltipData.day.shiftName}</div>}
          {tooltipData.day.shiftCount >= 2 && <div className="text-amber-600 font-medium">{tooltipData.day.shiftCount} ca — {tooltipData.day.dayWorkUnits} công</div>}
          {tooltipData.day.checkIn && (
            <div className="text-gray-600">Vào: {formatTimeVN(tooltipData.day.checkIn)}{tooltipData.day.checkOut && ` → Ra: ${formatTimeVN(tooltipData.day.checkOut)}`}</div>
          )}
          {tooltipData.day.workingMinutes > 0 && <div className="text-blue-600">Giờ làm: {Math.round(tooltipData.day.workingMinutes / 60 * 10) / 10}h</div>}
          {tooltipData.day.lateMinutes > 0 && <div className="text-amber-600">Trễ: {tooltipData.day.lateMinutes} phút</div>}
          {tooltipData.day.earlyLeaveMinutes > 15 && <div className="text-purple-600">Về sớm: {tooltipData.day.earlyLeaveMinutes} phút</div>}
          {tooltipData.day.overtimeMinutes > 0 && <div className="text-red-600">Tăng ca: {Math.round(tooltipData.day.overtimeMinutes / 60 * 10) / 10}h</div>}
          {tooltipData.day.isBusinessTrip && <div className="text-sky-600 font-medium">Công tác</div>}
          {tooltipData.day.isLeave && <div className="text-orange-600">Nghỉ phép</div>}
          {tooltipData.day.autoCheckout && <div className="text-gray-400 text-[10px]">Auto checkout</div>}
        </div>
      )}
    </div>
  )
}