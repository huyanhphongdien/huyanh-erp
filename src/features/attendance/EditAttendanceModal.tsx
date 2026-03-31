// ============================================================================
// EDIT ATTENDANCE MODAL
// File: src/features/attendance/EditAttendanceModal.tsx
// ============================================================================
// Modal sửa chấm công — 2 tab: Sửa nhanh + Chi tiết
// Gọi từ MonthlyTimesheetPage khi click vào ô ngày
// ============================================================================

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  X, Clock, Save, History, AlertTriangle, Loader2, ChevronDown,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { attendanceEditService } from '../../services/attendanceEditService'
import type { DayDetail } from '../../services/monthlyTimesheetService'

// ============================================================================
// TYPES
// ============================================================================

interface Props {
  open: boolean
  onClose: () => void
  day: DayDetail
  employeeId: string
  employeeName: string
  onSaved: () => void
}

type Tab = 'quick' | 'detail' | 'history'

const STATUS_OPTIONS = [
  { value: 'present', label: 'Đúng giờ', color: 'text-green-600' },
  { value: 'late', label: 'Đi trễ', color: 'text-amber-600' },
  { value: 'early_leave', label: 'Về sớm', color: 'text-purple-600' },
  { value: 'late_and_early', label: 'Trễ + Về sớm', color: 'text-orange-600' },
  { value: 'business_trip', label: 'Công tác', color: 'text-sky-600' },
]

const SYMBOL_TO_STATUS: Record<string, string> = {
  'S': 'present', 'Đ': 'present', 'C2': 'present', 'HC': 'present',
  'P': 'present', 'X': 'absent',
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function EditAttendanceModal({ open, onClose, day, employeeId, employeeName, onSaved }: Props) {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const editorId = user?.employee_id || ''

  const [tab, setTab] = useState<Tab>('quick')
  const [selectedShiftId, setSelectedShiftId] = useState<string>(day.shiftCode ? '' : '')
  const [selectedStatus, setSelectedStatus] = useState(day.status || 'present')
  const [checkInTime, setCheckInTime] = useState('')
  const [checkOutTime, setCheckOutTime] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')

  // ── Permission check ──
  const { data: canEdit = false, isLoading: permLoading } = useQuery({
    queryKey: ['can-edit-attendance', editorId, employeeId],
    queryFn: () => attendanceEditService.canEdit(editorId, employeeId),
    enabled: open && !!editorId,
  })

  // ── Shifts list ──
  const { data: shifts = [] } = useQuery({
    queryKey: ['shifts-list'],
    queryFn: async () => {
      const { data } = await supabase
        .from('shifts')
        .select('id, code, name, start_time, end_time, crosses_midnight')
        .eq('is_active', true)
        .order('code')
      return data || []
    },
    enabled: open,
  })

  // ── Attendance record ID (cần cho edit) ──
  const { data: attendanceRecord } = useQuery({
    queryKey: ['attendance-record', employeeId, day.date],
    queryFn: async () => {
      const { data } = await supabase
        .from('attendance')
        .select('id, shift_id, check_in_time, check_out_time, status, working_minutes')
        .eq('employee_id', employeeId)
        .eq('date', day.date)
        .order('check_in_time', { ascending: false })
        .limit(1)
      return data?.[0] || null
    },
    enabled: open,
  })

  // ── Edit history ──
  const { data: editHistory = [] } = useQuery({
    queryKey: ['attendance-edit-history', attendanceRecord?.id],
    queryFn: () => attendanceEditService.getEditHistory(attendanceRecord!.id),
    enabled: tab === 'history' && !!attendanceRecord?.id,
  })

  // ── Init form values ──
  useEffect(() => {
    if (!open) return
    setError('')
    setReason('')

    // Find shift id from code
    const shiftMatch = shifts.find(s => s.code === day.shiftCode)
    setSelectedShiftId(shiftMatch?.id || attendanceRecord?.shift_id || '')
    setSelectedStatus(day.status || 'present')

    // Parse times for detail tab
    if (day.checkIn) {
      const d = new Date(day.checkIn)
      setCheckInTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`)
    } else {
      setCheckInTime('')
    }
    if (day.checkOut) {
      const d = new Date(day.checkOut)
      setCheckOutTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`)
    } else {
      setCheckOutTime('')
    }
  }, [open, day, shifts, attendanceRecord])

  // ── Quick edit mutation ──
  const quickEditMutation = useMutation({
    mutationFn: async () => {
      if (!attendanceRecord) {
        // Tạo mới nếu chưa có record
        const shift = shifts.find(s => s.id === selectedShiftId)
        if (!shift) throw new Error('Chọn ca trước')

        // Default check-in = shift start time
        const checkIn = `${day.date}T${shift.start_time}+07:00`
        return attendanceEditService.createRecord(
          employeeId, day.date, selectedShiftId, checkIn, null, editorId, reason
        )
      }
      return attendanceEditService.quickEdit(
        attendanceRecord.id, editorId, selectedShiftId || null, selectedStatus, reason
      )
    },
    onSuccess: (result) => {
      if (!result.success) {
        setError(result.error || 'Lỗi không xác định')
        return
      }
      queryClient.invalidateQueries({ queryKey: ['monthly-timesheet'] })
      onSaved()
      onClose()
    },
    onError: (err: Error) => setError(err.message),
  })

  // ── Detail edit mutation ──
  const detailEditMutation = useMutation({
    mutationFn: async () => {
      if (!checkInTime) throw new Error('Nhập giờ vào')

      // Build ISO times
      const checkInISO = `${day.date}T${checkInTime}:00+07:00`
      const checkOutISO = checkOutTime ? `${day.date}T${checkOutTime}:00+07:00` : null

      // Handle crosses_midnight checkout
      const shift = shifts.find(s => s.id === selectedShiftId)
      let adjustedCheckOut = checkOutISO
      if (shift?.crosses_midnight && checkOutTime && checkOutTime < checkInTime) {
        // Checkout ngày hôm sau
        const nextDay = new Date(day.date + 'T00:00:00+07:00')
        nextDay.setDate(nextDay.getDate() + 1)
        const nextDateStr = nextDay.toISOString().split('T')[0]
        adjustedCheckOut = `${nextDateStr}T${checkOutTime}:00+07:00`
      }

      if (!attendanceRecord) {
        // Tạo mới
        return attendanceEditService.createRecord(
          employeeId, day.date, selectedShiftId, checkInISO, adjustedCheckOut, editorId, reason
        )
      }

      return attendanceEditService.detailEdit(
        attendanceRecord.id, editorId,
        {
          shiftId: selectedShiftId || undefined,
          status: selectedStatus,
          checkInTime: checkInISO,
          checkOutTime: adjustedCheckOut,
        },
        reason
      )
    },
    onSuccess: (result) => {
      if (!result.success) {
        setError(result.error || 'Lỗi không xác định')
        return
      }
      queryClient.invalidateQueries({ queryKey: ['monthly-timesheet'] })
      onSaved()
      onClose()
    },
    onError: (err: Error) => setError(err.message),
  })

  if (!open) return null

  const isLoading = quickEditMutation.isPending || detailEditMutation.isPending
  const dateDisplay = new Date(day.date + 'T00:00:00+07:00').toLocaleDateString('vi-VN', {
    weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric'
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div>
            <h3 className="text-[15px] font-bold text-gray-800">Sửa chấm công</h3>
            <p className="text-[12px] text-gray-500">{employeeName} — {dateDisplay}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100"><X size={18} /></button>
        </div>

        {/* Permission check */}
        {permLoading ? (
          <div className="p-6 text-center text-gray-400">
            <Loader2 size={20} className="animate-spin mx-auto mb-2" />
            Đang kiểm tra quyền...
          </div>
        ) : !canEdit ? (
          <div className="p-6">
            <div className="flex items-start gap-2 bg-red-50 text-red-700 rounded-lg px-3 py-2.5 text-[13px]">
              <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
              <div>
                <div className="font-medium">Không có quyền sửa</div>
                <div className="text-[12px] text-red-500 mt-0.5">
                  Chỉ Admin, Trưởng phòng (NV trong phòng), hoặc HR được sửa chấm công.
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div className="flex border-b">
              {[
                { id: 'quick' as Tab, label: 'Sửa nhanh' },
                { id: 'detail' as Tab, label: 'Chi tiết' },
                { id: 'history' as Tab, label: 'Lịch sử' },
              ].map(t => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`flex-1 py-2.5 text-[13px] font-medium border-b-2 transition-colors
                    ${tab === t.id ? 'border-[#1B4D3E] text-[#1B4D3E]' : 'border-transparent text-gray-400 hover:text-gray-600'}
                  `}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="p-4">
              {/* Error */}
              {error && (
                <div className="mb-3 flex items-start gap-2 bg-red-50 text-red-700 rounded-lg px-3 py-2 text-[12px]">
                  <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
                  {error}
                </div>
              )}

              {/* ── TAB: Sửa nhanh ── */}
              {tab === 'quick' && (
                <div className="space-y-3">
                  {/* Ca */}
                  <div>
                    <label className="text-[11px] font-semibold text-gray-500 uppercase mb-1 block">Ca làm việc</label>
                    <select
                      value={selectedShiftId}
                      onChange={e => setSelectedShiftId(e.target.value)}
                      className="w-full px-3 py-2.5 text-[14px] border border-gray-200 rounded-lg bg-white focus:border-[#1B4D3E] focus:ring-1 focus:ring-[#1B4D3E]/20"
                    >
                      <option value="">— Không có ca —</option>
                      {shifts.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.start_time?.substring(0, 5)} - {s.end_time?.substring(0, 5)})
                          {s.crosses_midnight ? ' 🌙' : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Trạng thái */}
                  <div>
                    <label className="text-[11px] font-semibold text-gray-500 uppercase mb-1 block">Trạng thái</label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {STATUS_OPTIONS.map(opt => (
                        <button
                          key={opt.value}
                          onClick={() => setSelectedStatus(opt.value)}
                          className={`px-3 py-2 rounded-lg text-[13px] font-medium border transition-colors
                            ${selectedStatus === opt.value
                              ? 'border-[#1B4D3E] bg-[#1B4D3E]/5 text-[#1B4D3E]'
                              : 'border-gray-200 text-gray-500 hover:bg-gray-50'}
                          `}
                        >
                          {opt.label}
                        </button>
                      ))}
                      <button
                        onClick={() => setSelectedStatus('absent')}
                        className={`px-3 py-2 rounded-lg text-[13px] font-medium border transition-colors
                          ${selectedStatus === 'absent'
                            ? 'border-red-400 bg-red-50 text-red-600'
                            : 'border-gray-200 text-gray-500 hover:bg-gray-50'}
                        `}
                      >
                        Vắng
                      </button>
                      <button
                        onClick={() => setSelectedStatus('leave')}
                        className={`px-3 py-2 rounded-lg text-[13px] font-medium border transition-colors
                          ${selectedStatus === 'leave'
                            ? 'border-orange-400 bg-orange-50 text-orange-600'
                            : 'border-gray-200 text-gray-500 hover:bg-gray-50'}
                        `}
                      >
                        Nghỉ phép
                      </button>
                    </div>
                  </div>

                  {/* Lý do */}
                  <div>
                    <label className="text-[11px] font-semibold text-gray-500 uppercase mb-1 block">Lý do sửa</label>
                    <input
                      type="text"
                      value={reason}
                      onChange={e => setReason(e.target.value)}
                      placeholder="VD: Phân ca nhầm, NV quên check-in..."
                      className="w-full px-3 py-2.5 text-[14px] border border-gray-200 rounded-lg focus:border-[#1B4D3E] focus:ring-1 focus:ring-[#1B4D3E]/20"
                    />
                  </div>

                  {/* Save button */}
                  <button
                    onClick={() => quickEditMutation.mutate()}
                    disabled={isLoading}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[14px] font-semibold bg-[#1B4D3E] text-white active:bg-[#163d32] disabled:opacity-50"
                  >
                    {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    Lưu thay đổi
                  </button>
                </div>
              )}

              {/* ── TAB: Chi tiết ── */}
              {tab === 'detail' && (
                <div className="space-y-3">
                  {/* Ca */}
                  <div>
                    <label className="text-[11px] font-semibold text-gray-500 uppercase mb-1 block">Ca làm việc</label>
                    <select
                      value={selectedShiftId}
                      onChange={e => setSelectedShiftId(e.target.value)}
                      className="w-full px-3 py-2.5 text-[14px] border border-gray-200 rounded-lg bg-white focus:border-[#1B4D3E]"
                    >
                      <option value="">— Không có ca —</option>
                      {shifts.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.start_time?.substring(0, 5)} - {s.end_time?.substring(0, 5)})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Giờ vào / ra */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-semibold text-gray-500 uppercase mb-1 block">Giờ vào</label>
                      <input
                        type="time"
                        value={checkInTime}
                        onChange={e => setCheckInTime(e.target.value)}
                        className="w-full px-3 py-2.5 text-[15px] border border-gray-200 rounded-lg focus:border-[#1B4D3E]"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-gray-500 uppercase mb-1 block">Giờ ra</label>
                      <input
                        type="time"
                        value={checkOutTime}
                        onChange={e => setCheckOutTime(e.target.value)}
                        className="w-full px-3 py-2.5 text-[15px] border border-gray-200 rounded-lg focus:border-[#1B4D3E]"
                      />
                    </div>
                  </div>

                  {/* Trạng thái */}
                  <div>
                    <label className="text-[11px] font-semibold text-gray-500 uppercase mb-1 block">Trạng thái</label>
                    <select
                      value={selectedStatus}
                      onChange={e => setSelectedStatus(e.target.value)}
                      className="w-full px-3 py-2.5 text-[14px] border border-gray-200 rounded-lg bg-white focus:border-[#1B4D3E]"
                    >
                      {STATUS_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                      <option value="absent">Vắng</option>
                      <option value="leave">Nghỉ phép</option>
                    </select>
                  </div>

                  {/* Lý do */}
                  <div>
                    <label className="text-[11px] font-semibold text-gray-500 uppercase mb-1 block">Lý do sửa</label>
                    <input
                      type="text"
                      value={reason}
                      onChange={e => setReason(e.target.value)}
                      placeholder="VD: Sửa giờ check-in do máy lỗi..."
                      className="w-full px-3 py-2.5 text-[14px] border border-gray-200 rounded-lg focus:border-[#1B4D3E]"
                    />
                  </div>

                  {/* Preview */}
                  {checkInTime && checkOutTime && (
                    <div className="bg-blue-50 rounded-lg px-3 py-2 text-[12px] text-blue-700">
                      <Clock size={12} className="inline mr-1" />
                      Thời gian: {checkInTime} → {checkOutTime}
                      {(() => {
                        const [h1, m1] = checkInTime.split(':').map(Number)
                        const [h2, m2] = checkOutTime.split(':').map(Number)
                        let diff = (h2 * 60 + m2) - (h1 * 60 + m1)
                        if (diff < 0) diff += 24 * 60 // crosses midnight
                        return ` = ${Math.round(diff / 60 * 10) / 10}h`
                      })()}
                    </div>
                  )}

                  <button
                    onClick={() => detailEditMutation.mutate()}
                    disabled={isLoading || !checkInTime}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[14px] font-semibold bg-[#1B4D3E] text-white active:bg-[#163d32] disabled:opacity-50"
                  >
                    {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    Lưu thay đổi
                  </button>
                </div>
              )}

              {/* ── TAB: Lịch sử ── */}
              {tab === 'history' && (
                <div>
                  {!attendanceRecord?.id ? (
                    <p className="text-center text-gray-400 text-[13px] py-4">Chưa có bản ghi chấm công</p>
                  ) : editHistory.length === 0 ? (
                    <p className="text-center text-gray-400 text-[13px] py-4">Chưa có lịch sử sửa</p>
                  ) : (
                    <div className="space-y-2">
                      {editHistory.map((log: any) => (
                        <div key={log.id} className="bg-gray-50 rounded-lg px-3 py-2 text-[12px]">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium text-gray-700">{log.editor?.full_name || 'N/A'}</span>
                            <span className="text-gray-400">
                              {new Date(log.edited_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}
                            </span>
                          </div>
                          <div className="text-gray-500">
                            <span className="font-medium">{log.edit_type === 'shift_change' ? 'Đổi ca' : log.edit_type === 'time_correction' ? 'Sửa giờ' : 'Thủ công'}</span>
                            {log.reason && <span> — {log.reason}</span>}
                          </div>
                          {log.old_values?.shift_code && (
                            <div className="text-gray-400 mt-0.5">
                              Ca: {log.old_values.shift_code} → {log.new_values?.shift_code || '—'}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}