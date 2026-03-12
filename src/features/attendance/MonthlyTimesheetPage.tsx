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
  ArrowLeft,
  Eye,
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
  'S':  { bg: 'bg-blue-100',   text: 'text-blue-700',   label: 'Ca sáng/ngày' },
  'Đ':  { bg: 'bg-violet-100', text: 'text-violet-700', label: 'Ca đêm' },
  'C2': { bg: 'bg-emerald-100',text: 'text-emerald-700',label: 'Ca chiều' },
  'HC': { bg: 'bg-gray-100',   text: 'text-gray-600',   label: 'Hành chính' },
  'P':  { bg: 'bg-orange-100', text: 'text-orange-600', label: 'Nghỉ phép' },
  'X':  { bg: 'bg-red-100',    text: 'text-red-600',    label: 'Vắng' },
  '—':  { bg: 'bg-gray-50',    text: 'text-gray-300',   label: '' },
  '':   { bg: '',              text: 'text-gray-200',   label: '' },
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
    if (!timesheet || timesheet.employees.length === 0) {
      alert('Không có dữ liệu để xuất')
      return
    }
    exportMonthlyTimesheetExcel(timesheet)
  }

  const showTooltip = (day: DayDetail, e: React.MouseEvent) => {
    if (!day.checkIn && !day.isLeave && day.symbol !== 'X') return
    const rect = (e.target as HTMLElement).getBoundingClientRect()
    setTooltipData({ day, x: Math.min(rect.left, window.innerWidth - 260), y: rect.bottom + 4 })
  }

  // ============================================================
  // RENDER: Drill-down (chi tiết 1 NV)
  // ============================================================
  if (selectedEmployee) {
    const emp = selectedEmployee
    return (
      <div className="min-h-screen bg-[#F7F5F2]">
        <div className="bg-white border-b sticky top-0 z-10">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
            <button onClick={() => setSelectedEmployee(null)} className="p-2 rounded-lg active:bg-gray-100">
              <ArrowLeft size={20} className="text-gray-600" />
            </button>
            <div className="flex-1 min-w-0">
              <h2 className="text-[15px] font-bold text-gray-800 truncate">{emp.fullName}</h2>
              <p className="text-[12px] text-gray-500">{emp.employeeCode} • {emp.departmentName} • {MONTHS_VN[selectedMonth]} {selectedYear}</p>
            </div>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-2 mb-4">
            {[
              { label: 'Đi làm', value: emp.totalWorkDays, unit: 'ngày', color: 'text-blue-600 bg-blue-50' },
              { label: 'Tổng giờ', value: emp.totalWorkingHours, unit: 'h', color: 'text-emerald-600 bg-emerald-50' },
              { label: 'Tăng ca', value: emp.totalOvertimeHours, unit: 'h', color: 'text-purple-600 bg-purple-50' },
              { label: 'Đi trễ', value: emp.totalLateDays, unit: 'lần', color: 'text-amber-600 bg-amber-50' },
              { label: 'Về sớm', value: emp.totalEarlyDays, unit: 'lần', color: 'text-orange-600 bg-orange-50' },
              { label: 'Vắng', value: emp.totalAbsentDays, unit: 'ngày', color: 'text-red-600 bg-red-50' },
              { label: 'Nghỉ phép', value: emp.totalLeaveDays, unit: 'ngày', color: 'text-cyan-600 bg-cyan-50' },
            ].map(s => (
              <div key={s.label} className={`rounded-xl px-3 py-2.5 ${s.color}`}>
                <div className="text-[11px] font-medium opacity-70">{s.label}</div>
                <div className="text-lg font-bold">{s.value}<span className="text-[11px] font-normal ml-0.5">{s.unit}</span></div>
              </div>
            ))}
          </div>
          <div className="space-y-1">
            {emp.days.map((day, i) => {
              const dt = new Date(day.date + 'T00:00:00+07:00')
              const dow = WEEKDAY_VN[dt.getDay()]
              const style = SYMBOL_STYLES[day.symbol] || SYMBOL_STYLES['']
              const hasData = day.checkIn || day.isLeave || day.symbol === 'X'
              return (
                <div key={day.date} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] ${day.isWeekend ? 'bg-red-50/50' : 'bg-white'} ${!hasData && day.symbol === '—' ? 'opacity-50' : ''}`}>
                  <div className="w-14 flex-shrink-0">
                    <span className={`font-bold ${day.isWeekend ? 'text-red-400' : 'text-gray-700'}`}>{String(i + 1).padStart(2, '0')}</span>
                    <span className={`ml-1 text-[11px] ${day.isWeekend ? 'text-red-300' : 'text-gray-400'}`}>{dow}</span>
                  </div>
                  <div className={`w-8 h-7 rounded flex items-center justify-center text-[11px] font-bold flex-shrink-0 ${style.bg} ${style.text}`}>{day.symbol}</div>
                  <div className="flex-1 min-w-0">
                    {day.checkIn ? (
                      <div className="flex items-center gap-2 text-[12px]">
                        <span className="text-gray-600">{formatTimeVN(day.checkIn)} → {formatTimeVN(day.checkOut) || '...'}</span>
                        {day.shiftName && <span className="text-gray-400 text-[11px] truncate">{day.shiftName}</span>}
                      </div>
                    ) : day.isLeave ? (
                      <span className="text-orange-500 text-[12px]">Nghỉ phép</span>
                    ) : day.symbol === 'X' ? (
                      <span className="text-red-400 text-[12px]">Vắng không phép</span>
                    ) : null}
                  </div>
                  <div className="w-14 text-right flex-shrink-0">
                    {day.workingMinutes > 0 && <span className="text-[12px] font-medium text-gray-600">{Math.round(day.workingMinutes / 60 * 10) / 10}h</span>}
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    {day.lateMinutes > 0 && <span className="px-1 py-px rounded text-[9px] font-bold bg-amber-100 text-amber-600">T{day.lateMinutes}p</span>}
                    {day.earlyLeaveMinutes > 15 && <span className="px-1 py-px rounded text-[9px] font-bold bg-purple-100 text-purple-600">V{day.earlyLeaveMinutes}p</span>}
                    {day.overtimeMinutes > 0 && <span className="px-1 py-px rounded text-[9px] font-bold bg-red-100 text-red-600">OT{Math.round(day.overtimeMinutes / 60 * 10) / 10}h</span>}
                    {day.autoCheckout && <span className="px-1 py-px rounded text-[9px] bg-gray-200 text-gray-500">auto</span>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  // ============================================================
  // RENDER: Grid view (phòng ban)
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
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
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
        ) : !timesheet || timesheet.employees.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <Calendar size={40} className="mx-auto mb-3 opacity-50" />
            <p className="text-[15px] font-medium">Không có dữ liệu</p>
          </div>
        ) : (
          <div ref={tableRef} className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="border-collapse text-[12px]" style={{ minWidth: COL_STT + COL_NAME + daysInMonth * 38 + 320 }}>
                <thead>
                  <tr className="bg-[#1B4D3E] text-white">
                    <th style={{ position: 'sticky', left: 0, zIndex: 12, width: COL_STT, minWidth: COL_STT, backgroundColor: '#1B4D3E' }}
                      className="px-2 py-2 text-center border-r border-[#2D8B6E]">STT</th>
                    <th style={{ position: 'sticky', left: COL_NAME_LEFT, zIndex: 12, width: COL_NAME, minWidth: COL_NAME, backgroundColor: '#1B4D3E', boxShadow: '2px 0 4px rgba(0,0,0,0.15)' }}
                      className="px-2 py-2 text-left border-r border-[#2D8B6E]">Họ và tên</th>
                    {dayHeaders.map(h => (
                      <th key={h.day} className={`px-0 py-1.5 text-center border-l border-[#2D8B6E]/40 ${h.isWeekend ? 'bg-red-800/30' : ''}`} style={{ width: 36, minWidth: 36 }}>
                        <div className="text-[11px] font-bold">{String(h.day).padStart(2, '0')}</div>
                        <div className={`text-[9px] font-normal ${h.isWeekend ? 'text-red-200' : 'text-white/60'}`}>{h.weekday}</div>
                      </th>
                    ))}
                    <th className="px-2 py-2 text-center border-l-2 border-white/30 bg-[#163d32]" style={{ minWidth: 44 }}>Công</th>
                    <th className="px-2 py-2 text-center bg-[#163d32]" style={{ minWidth: 44 }}>Giờ</th>
                    <th className="px-2 py-2 text-center bg-[#163d32]" style={{ minWidth: 36 }}>Trễ</th>
                    <th className="px-2 py-2 text-center bg-[#163d32]" style={{ minWidth: 36 }}>VS</th>
                    <th className="px-2 py-2 text-center bg-[#163d32]" style={{ minWidth: 36 }}>OT</th>
                    <th className="px-2 py-2 text-center bg-[#163d32]" style={{ minWidth: 36 }}>Vắng</th>
                    <th className="px-1 py-2 text-center bg-[#163d32]" style={{ minWidth: 32 }}><Eye size={12} className="mx-auto" /></th>
                  </tr>
                </thead>
                <tbody>
                  {timesheet.employees.map((emp, idx) => {
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
                          const s = SYMBOL_STYLES[day.symbol] || SYMBOL_STYLES['']
                          const hasDetail = day.checkIn || day.isLeave || day.symbol === 'X'
                          return (
                            <td key={di} className={`px-0 py-1 text-center border-l border-gray-50 ${dayHeaders[di]?.isWeekend ? 'bg-red-50/40' : ''}`}
                              onMouseEnter={e => hasDetail && showTooltip(day, e)} onMouseLeave={() => setTooltipData(null)}
                              onClick={() => { setTooltipData(null); setEditModal({ day, employeeId: emp.employeeId, employeeName: emp.fullName }) }}
                              style={{ cursor: 'pointer' }}>
                              <div className={`mx-auto w-7 h-6 rounded flex items-center justify-center text-[10px] font-bold ${s.bg} ${s.text} ${day.lateMinutes > 0 ? 'ring-1 ring-amber-400' : ''} ${day.overtimeMinutes > 0 ? 'ring-1 ring-red-400' : ''}`}>
                                {day.symbol}
                              </div>
                            </td>
                          )
                        })}
                        <td className="px-1 py-1 text-center font-bold text-blue-600 border-l-2 border-gray-200">{emp.totalWorkDays}</td>
                        <td className="px-1 py-1 text-center font-medium text-gray-700">{emp.totalWorkingHours}</td>
                        <td className="px-1 py-1 text-center">{emp.totalLateDays > 0 && <span className="text-amber-600 font-bold">{emp.totalLateDays}</span>}</td>
                        <td className="px-1 py-1 text-center">{emp.totalEarlyDays > 0 && <span className="text-purple-600 font-bold">{emp.totalEarlyDays}</span>}</td>
                        <td className="px-1 py-1 text-center">{emp.totalOvertimeHours > 0 && <span className="text-red-600 font-bold">{emp.totalOvertimeHours}</span>}</td>
                        <td className="px-1 py-1 text-center">{emp.totalAbsentDays > 0 && <span className="text-red-500 font-bold">{emp.totalAbsentDays}</span>}</td>
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
                      className="px-2 py-2 text-[#1B4D3E] border-r border-gray-200">Tổng ({timesheet.employees.length} NV)</td>
                    {dayHeaders.map((_, i) => <td key={i} className="border-l border-gray-50" style={{ backgroundColor: '#f0fdf4' }} />)}
                    <td className="px-1 py-2 text-center text-blue-600 border-l-2 border-gray-200" style={{ backgroundColor: '#f0fdf4' }}>{timesheet.employees.reduce((s, e) => s + e.totalWorkDays, 0)}</td>
                    <td className="px-1 py-2 text-center text-gray-700" style={{ backgroundColor: '#f0fdf4' }}>{Math.round(timesheet.employees.reduce((s, e) => s + e.totalWorkingHours, 0) * 10) / 10}</td>
                    <td className="px-1 py-2 text-center text-amber-600" style={{ backgroundColor: '#f0fdf4' }}>{timesheet.employees.reduce((s, e) => s + e.totalLateDays, 0) || ''}</td>
                    <td className="px-1 py-2 text-center text-purple-600" style={{ backgroundColor: '#f0fdf4' }}>{timesheet.employees.reduce((s, e) => s + e.totalEarlyDays, 0) || ''}</td>
                    <td className="px-1 py-2 text-center text-red-600" style={{ backgroundColor: '#f0fdf4' }}>{Math.round(timesheet.employees.reduce((s, e) => s + e.totalOvertimeHours, 0) * 10) / 10 || ''}</td>
                    <td className="px-1 py-2 text-center text-red-500" style={{ backgroundColor: '#f0fdf4' }}>{timesheet.employees.reduce((s, e) => s + e.totalAbsentDays, 0) || ''}</td>
                    <td style={{ backgroundColor: '#f0fdf4' }} />
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="px-4 py-3 border-t bg-gray-50 flex items-center justify-between text-[11px] text-gray-400">
              <span>{timesheet.departmentName} • {MONTHS_VN[selectedMonth]} {selectedYear}</span>
              <div className="flex gap-12">
                {['Người lập', 'Trưởng phòng', 'Giám đốc'].map(t => (
                  <div key={t} className="text-center"><div className="mb-6">{t}</div><div className="border-t border-gray-300 pt-1 min-w-[100px]" /></div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

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
          {tooltipData.day.shiftName && <div className="text-gray-500">Ca: {tooltipData.day.shiftName}</div>}
          {tooltipData.day.checkIn && (
            <div className="text-gray-600">Vào: {formatTimeVN(tooltipData.day.checkIn)}{tooltipData.day.checkOut && ` → Ra: ${formatTimeVN(tooltipData.day.checkOut)}`}</div>
          )}
          {tooltipData.day.workingMinutes > 0 && <div className="text-blue-600">Giờ làm: {Math.round(tooltipData.day.workingMinutes / 60 * 10) / 10}h</div>}
          {tooltipData.day.lateMinutes > 0 && <div className="text-amber-600">Trễ: {tooltipData.day.lateMinutes} phút</div>}
          {tooltipData.day.earlyLeaveMinutes > 15 && <div className="text-purple-600">Về sớm: {tooltipData.day.earlyLeaveMinutes} phút</div>}
          {tooltipData.day.overtimeMinutes > 0 && <div className="text-red-600">Tăng ca: {Math.round(tooltipData.day.overtimeMinutes / 60 * 10) / 10}h</div>}
          {tooltipData.day.isLeave && <div className="text-orange-600">Nghỉ phép</div>}
          {tooltipData.day.autoCheckout && <div className="text-gray-400 text-[10px]">Auto checkout</div>}
        </div>
      )}
    </div>
  )
}