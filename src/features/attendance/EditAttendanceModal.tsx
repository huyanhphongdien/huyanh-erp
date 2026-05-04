// ============================================================================
// EDIT ATTENDANCE MODAL V2
// File: src/features/attendance/EditAttendanceModal.tsx
// ============================================================================
// ★ V2: Hỗ trợ multi-shift, thêm/xóa ca, đánh vắng
// ============================================================================

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  X, Clock, Save, History, AlertTriangle, Loader2, Plus, Trash2,
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

type Tab = 'symbol' | 'quick' | 'history'

interface AttRecord {
  id: string
  shift_id: string | null
  check_in_time: string | null
  check_out_time: string | null
  status: string
  working_minutes: number
  work_units: number
  shift?: { id: string; code: string; name: string } | null
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function EditAttendanceModal({ open, onClose, day, employeeId, employeeName, onSaved }: Props) {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const editorId = user?.employee_id || ''

  const [tab, setTab] = useState<Tab>('symbol')
  const [error, setError] = useState('')

  // ★ Form cho thêm/sửa ca
  const [editingId, setEditingId] = useState<string | null>(null) // null = thêm mới
  const [showAddForm, setShowAddForm] = useState(false)
  const [formShiftId, setFormShiftId] = useState('')
  const [formCheckIn, setFormCheckIn] = useState('')
  const [formCheckOut, setFormCheckOut] = useState('')
  const [formReason, setFormReason] = useState('')

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
        .select('id, code, name, start_time, end_time, crosses_midnight, work_units')
        .eq('is_active', true)
        .order('code')
      return data || []
    },
    enabled: open,
  })

  // ★ Lấy TẤT CẢ attendance records cho ngày này
  const { data: dayRecords = [], refetch: refetchRecords } = useQuery({
    queryKey: ['attendance-day-records', employeeId, day.date],
    queryFn: async () => {
      const { data } = await supabase
        .from('attendance')
        .select(`
          id, shift_id, check_in_time, check_out_time, status, working_minutes, work_units,
          shift:shifts!attendance_shift_id_fkey(id, code, name)
        `)
        .eq('employee_id', employeeId)
        .eq('date', day.date)
        .order('check_in_time')
      return (data || []).map((r: any) => ({
        ...r,
        shift: Array.isArray(r.shift) ? r.shift[0] : r.shift,
      })) as AttRecord[]
    },
    enabled: open,
  })

  // ── Edit history ──
  const firstRecordId = dayRecords[0]?.id
  const { data: editHistory = [] } = useQuery({
    queryKey: ['attendance-edit-history', firstRecordId],
    queryFn: () => attendanceEditService.getEditHistory(firstRecordId!),
    enabled: tab === 'history' && !!firstRecordId,
  })

  // Reset form
  useEffect(() => {
    if (!open) return
    setError('')
    setShowAddForm(false)
    setEditingId(null)
    setFormReason('')
  }, [open, day.date])

  // ── Thêm ca mới ──
  const addMutation = useMutation({
    mutationFn: async () => {
      if (!formShiftId) throw new Error('Chọn ca trước')

      const shift = shifts.find(s => s.id === formShiftId)
      if (!shift) throw new Error('Không tìm thấy ca')

      // Default times from shift
      const cinTime = formCheckIn || shift.start_time?.substring(0, 5) || '08:00'
      const coutTime = formCheckOut || shift.end_time?.substring(0, 5) || ''

      const checkInISO = `${day.date}T${cinTime}:00+07:00`
      let checkOutISO: string | null = null
      if (coutTime) {
        if ((shift as any).crosses_midnight && coutTime < cinTime) {
          const nextDay = new Date(day.date + 'T00:00:00+07:00')
          nextDay.setDate(nextDay.getDate() + 1)
          const nextDateStr = nextDay.toISOString().split('T')[0]
          checkOutISO = `${nextDateStr}T${coutTime}:00+07:00`
        } else {
          checkOutISO = `${day.date}T${coutTime}:00+07:00`
        }
      }

      return attendanceEditService.createRecord(
        employeeId, day.date, formShiftId, checkInISO, checkOutISO, editorId, formReason || 'Thêm ca'
      )
    },
    onSuccess: (result) => {
      if (!result.success) { setError(result.error || 'Lỗi'); return }
      setShowAddForm(false)
      setFormShiftId('')
      setFormCheckIn('')
      setFormCheckOut('')
      setFormReason('')
      refetchRecords()
      queryClient.invalidateQueries({ queryKey: ['monthly-timesheet'] })
      onSaved()
    },
    onError: (err: Error) => setError(err.message),
  })

  // ── Xóa 1 record ──
  const deleteMutation = useMutation({
    mutationFn: async (recordId: string) => {
      const perm = await attendanceEditService.canEdit(editorId, employeeId)
      if (!perm) throw new Error('Không có quyền')

      // Dùng .select() + count để detect RLS silent fail
      // (RLS reject trả về 0 rows nhưng error=null → cần check rowCount)
      const { data, error: delErr } = await supabase
        .from('attendance')
        .delete()
        .eq('id', recordId)
        .select('id')
      if (delErr) throw new Error(delErr.message)
      if (!data || data.length === 0) {
        throw new Error('Không xóa được. Có thể do RLS policy chặn — liên hệ admin.')
      }
    },
    onSuccess: () => {
      refetchRecords()
      queryClient.invalidateQueries({ queryKey: ['monthly-timesheet'] })
      onSaved()
    },
    onError: (err: Error) => setError(err.message),
  })

  // ── Xóa tất cả (đánh vắng) ──
  const deleteAllMutation = useMutation({
    mutationFn: async () => {
      const perm = await attendanceEditService.canEdit(editorId, employeeId)
      if (!perm) throw new Error('Không có quyền')

      // Detect RLS silent fail: dùng .select() để biết số rows xóa được
      const { data, error: delErr } = await supabase
        .from('attendance')
        .delete()
        .eq('employee_id', employeeId)
        .eq('date', day.date)
        .select('id')
      if (delErr) throw new Error(delErr.message)
      if (dayRecords.length > 0 && (!data || data.length === 0)) {
        throw new Error('Không xóa được. Có thể do RLS policy chặn — liên hệ admin.')
      }
    },
    onSuccess: () => {
      refetchRecords()
      queryClient.invalidateQueries({ queryKey: ['monthly-timesheet'] })
      onSaved()
      onClose()
    },
    onError: (err: Error) => setError(err.message),
  })

  // ── Sửa nhanh ký hiệu (1 click) ──
  // Delegates to attendanceEditService.setDaySymbol so we get:
  //   - real shift start/end times (no hardcoded 08:00→17:00)
  //   - crosses_midnight handling for ca đêm
  //   - permission check on the server
  //   - audit log in attendance_edit_logs
  const symbolMutation = useMutation({
    mutationFn: async (symbol: string) => {
      const result = await attendanceEditService.setDaySymbol(
        employeeId, day.date, symbol, editorId, `Sửa nhanh ${day.date}`
      )
      if (!result.success) throw new Error(result.error || 'Lỗi')
      return result
    },
    onSuccess: () => {
      refetchRecords()
      queryClient.invalidateQueries({ queryKey: ['monthly-timesheet'] })
      onSaved()
      onClose()
    },
    onError: (err: Error) => setError(err.message),
  })

  // ── Sửa nhanh 1 record (đổi ca) ──
  const editMutation = useMutation({
    mutationFn: async () => {
      if (!editingId || !formShiftId) throw new Error('Chọn ca')
      return attendanceEditService.quickEdit(
        editingId, editorId, formShiftId, 'present', formReason || 'Đổi ca'
      )
    },
    onSuccess: (result) => {
      if (!result.success) { setError(result.error || 'Lỗi'); return }
      setEditingId(null)
      refetchRecords()
      queryClient.invalidateQueries({ queryKey: ['monthly-timesheet'] })
      onSaved()
    },
    onError: (err: Error) => setError(err.message),
  })

  if (!open) return null

  const isLoading = addMutation.isPending || deleteMutation.isPending || deleteAllMutation.isPending || editMutation.isPending

  const dateDisplay = new Date(day.date + 'T00:00:00+07:00').toLocaleDateString('vi-VN', {
    weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric'
  })

  const formatTime = (iso: string | null) => {
    if (!iso) return '...'
    const d = new Date(iso)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  // Tổng công trong ngày
  const totalWU = dayRecords.reduce((s, r) => s + (r.work_units || 1), 0)

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
                  Chỉ Admin, Trưởng phòng, hoặc HR được sửa chấm công.
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div className="flex border-b">
              {[
                { id: 'symbol' as Tab, label: 'Sửa nhanh' },
                { id: 'quick' as Tab, label: 'Chi tiết ca' },
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

            <div className="p-4">
              {/* Error */}
              {error && (
                <div className="mb-3 flex items-start gap-2 bg-red-50 text-red-700 rounded-lg px-3 py-2 text-[12px]">
                  <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
                  {error}
                </div>
              )}

              {/* ══════════════ TAB: Sửa nhanh ký hiệu ══════════════ */}
              {tab === 'symbol' && (
                <div className="space-y-3">
                  <p className="text-[12px] text-gray-500">Chọn ký hiệu → tự ghi vào DB. Ký hiệu hiện tại: <strong className="text-[14px]">{day.symbol || '(trống)'}</strong></p>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { sym: 'HC', label: 'HC (Hành chính)', bg: 'bg-blue-100', text: 'text-blue-700', wu: '1.0' },
                      { sym: 'S', label: 'Ca sáng (Ngắn)', bg: 'bg-green-100', text: 'text-green-700', wu: '1.0' },
                      { sym: 'C2', label: 'Ca chiều', bg: 'bg-orange-100', text: 'text-orange-700', wu: '1.0' },
                      { sym: 'Đ', label: 'Ca đêm (Ngắn)', bg: 'bg-purple-100', text: 'text-purple-700', wu: '1.0' },
                      { sym: 'S_dài', label: 'Ca ngày (Dài)', bg: 'bg-green-200', text: 'text-green-800', wu: '1.5' },
                      { sym: 'Đ_dài', label: 'Ca đêm (Dài)', bg: 'bg-purple-200', text: 'text-purple-800', wu: '1.5' },
                      { sym: 'CT', label: 'Công tác', bg: 'bg-cyan-100', text: 'text-cyan-700', wu: '1.0' },
                      { sym: 'P', label: 'Nghỉ phép', bg: 'bg-yellow-100', text: 'text-yellow-700', wu: '0' },
                      { sym: 'X', label: 'Vắng', bg: 'bg-red-100', text: 'text-red-700', wu: '0' },
                    ].map(item => (
                      <button
                        key={item.sym}
                        disabled={isLoading}
                        onClick={() => symbolMutation.mutate(item.sym)}
                        className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-all active:scale-95
                          ${day.symbol === item.sym.replace('_dài', '') ? 'border-emerald-500 ring-2 ring-emerald-200' : 'border-gray-200 hover:border-gray-300'}
                          ${item.bg}`}
                      >
                        <span className={`text-[16px] font-bold ${item.text}`}>{item.sym.replace('_dài', '')}</span>
                        <span className="text-[10px] text-gray-600 leading-tight text-center">{item.label}</span>
                        <span className="text-[10px] text-gray-400">{item.wu} công</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ══════════════ TAB: Chi tiết ca ══════════════ */}
              {tab === 'quick' && (
                <div className="space-y-3">

                  {/* ★ Danh sách các ca trong ngày */}
                  {dayRecords.length > 0 ? (
                    <div>
                      <label className="text-[11px] font-semibold text-gray-500 uppercase mb-1.5 block">
                        Các ca trong ngày ({dayRecords.length} ca — {totalWU} công)
                      </label>
                      <div className="space-y-1.5">
                        {dayRecords.map((rec, idx) => (
                          <div key={rec.id} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 text-[13px]">
                                <span className="font-semibold text-gray-800">
                                  {rec.shift?.name || `Ca ${idx + 1}`}
                                </span>
                                {rec.status === 'business_trip' && (
                                  <span className="px-1.5 py-0.5 bg-sky-100 text-sky-700 text-[10px] font-medium rounded">CT</span>
                                )}
                              </div>
                              <div className="text-[11px] text-gray-500">
                                {formatTime(rec.check_in_time)} → {formatTime(rec.check_out_time)}
                                {rec.working_minutes > 0 && ` • ${Math.round(rec.working_minutes / 60 * 10) / 10}h`}
                                {rec.work_units > 0 && ` • ${rec.work_units} công`}
                              </div>
                            </div>
                            {/* Edit / Delete buttons */}
                            {editingId === rec.id ? (
                              <div className="flex gap-1">
                                <button onClick={() => editMutation.mutate()} disabled={isLoading}
                                  className="px-2 py-1 bg-green-600 text-white text-[10px] font-semibold rounded active:bg-green-700 disabled:opacity-50">
                                  Lưu
                                </button>
                                <button onClick={() => setEditingId(null)}
                                  className="px-2 py-1 border border-gray-300 text-[10px] rounded text-gray-600">
                                  Hủy
                                </button>
                              </div>
                            ) : (
                              <div className="flex gap-1">
                                <button
                                  onClick={() => {
                                    setEditingId(rec.id)
                                    setFormShiftId(rec.shift_id || '')
                                    setFormReason('')
                                  }}
                                  className="px-2 py-1 border border-gray-300 text-[10px] rounded text-gray-600 hover:bg-gray-100"
                                >
                                  Đổi ca
                                </button>
                                <button
                                  onClick={() => { if (confirm('Xóa bản ghi này?')) deleteMutation.mutate(rec.id) }}
                                  disabled={isLoading}
                                  className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded disabled:opacity-50"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Đổi ca form (inline) */}
                      {editingId && (
                        <div className="mt-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
                          <label className="text-[11px] font-semibold text-gray-500 mb-1 block">Đổi sang ca</label>
                          <select value={formShiftId} onChange={e => setFormShiftId(e.target.value)}
                            className="w-full px-3 py-2 text-[13px] border border-gray-200 rounded-lg bg-white mb-2">
                            <option value="">— Chọn ca —</option>
                            {shifts.map(s => (
                              <option key={s.id} value={s.id}>
                                {s.name} ({s.start_time?.substring(0, 5)} - {s.end_time?.substring(0, 5)})
                              </option>
                            ))}
                          </select>
                          <input type="text" value={formReason} onChange={e => setFormReason(e.target.value)}
                            placeholder="Lý do đổi ca..." className="w-full px-3 py-2 text-[13px] border border-gray-200 rounded-lg" />
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-4 text-gray-400 text-[13px]">
                      <Clock size={24} className="mx-auto mb-2 text-gray-300" />
                      Chưa có bản ghi chấm công
                    </div>
                  )}

                  {/* ★ THÊM CA MỚI */}
                  {!showAddForm ? (
                    <button
                      onClick={() => {
                        setShowAddForm(true)
                        setEditingId(null)
                        setFormShiftId('')
                        setFormCheckIn('')
                        setFormCheckOut('')
                        setFormReason('')
                      }}
                      className="w-full flex items-center justify-center gap-1.5 py-2.5 border-2 border-dashed border-gray-300 rounded-xl text-[13px] font-medium text-gray-500 hover:border-[#1B4D3E] hover:text-[#1B4D3E] transition-colors"
                    >
                      <Plus size={15} /> Thêm ca
                    </button>
                  ) : (
                    <div className="p-3 bg-green-50 rounded-xl border border-green-200 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[12px] font-bold text-green-700">Thêm ca mới</span>
                        <button onClick={() => setShowAddForm(false)} className="text-gray-400 hover:text-gray-600">
                          <X size={14} />
                        </button>
                      </div>

                      {/* Ca */}
                      <select value={formShiftId} onChange={e => setFormShiftId(e.target.value)}
                        className="w-full px-3 py-2.5 text-[13px] border border-gray-200 rounded-lg bg-white">
                        <option value="">— Chọn ca —</option>
                        {shifts.map(s => (
                          <option key={s.id} value={s.id}>
                            {s.name} ({s.start_time?.substring(0, 5)} - {s.end_time?.substring(0, 5)})
                            {s.crosses_midnight ? ' 🌙' : ''}
                          </option>
                        ))}
                      </select>

                      {/* Giờ vào/ra */}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] text-gray-500 mb-0.5 block">Giờ vào</label>
                          <input type="text" inputMode="numeric" placeholder="VD: 06:00" maxLength={5}
                              onKeyUp={(e) => {
                                const v = (e.target as HTMLInputElement).value.replace(/[^\d]/g, '')
                                if (v.length >= 3 && !(e.target as HTMLInputElement).value.includes(':')) {
                                  (e.target as HTMLInputElement).value = v.slice(0, 2) + ':' + v.slice(2, 4)
                                }
                              }} value={formCheckIn} onChange={e => setFormCheckIn(e.target.value)}
                            className="w-full px-2 py-2 text-[14px] border border-gray-200 rounded-lg" />
                        </div>
                        <div>
                          <label className="text-[10px] text-gray-500 mb-0.5 block">Giờ ra</label>
                          <input type="text" inputMode="numeric" placeholder="VD: 06:00" maxLength={5}
                              onKeyUp={(e) => {
                                const v = (e.target as HTMLInputElement).value.replace(/[^\d]/g, '')
                                if (v.length >= 3 && !(e.target as HTMLInputElement).value.includes(':')) {
                                  (e.target as HTMLInputElement).value = v.slice(0, 2) + ':' + v.slice(2, 4)
                                }
                              }} value={formCheckOut} onChange={e => setFormCheckOut(e.target.value)}
                            className="w-full px-2 py-2 text-[14px] border border-gray-200 rounded-lg" />
                        </div>
                      </div>

                      {/* Lý do */}
                      <input type="text" value={formReason} onChange={e => setFormReason(e.target.value)}
                        placeholder="Lý do..." className="w-full px-3 py-2 text-[13px] border border-gray-200 rounded-lg" />

                      {/* Submit */}
                      <button
                        onClick={() => addMutation.mutate()}
                        disabled={isLoading || !formShiftId}
                        className="w-full flex items-center justify-center gap-2 py-2.5 bg-green-600 text-white rounded-xl text-[13px] font-semibold active:bg-green-700 disabled:opacity-50"
                      >
                        {addMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                        Thêm ca
                      </button>
                    </div>
                  )}

                  {/* ★ ĐÁNH VẮNG — Xóa tất cả attendance */}
                  {dayRecords.length > 0 && (
                    <button
                      onClick={() => {
                        if (confirm(`Xóa tất cả chấm công ngày ${day.date}?\nNgày này sẽ hiện "X" (vắng).`)) {
                          deleteAllMutation.mutate()
                        }
                      }}
                      disabled={isLoading}
                      className="w-full flex items-center justify-center gap-1.5 py-2 border border-red-300 rounded-xl text-[12px] font-medium text-red-500 hover:bg-red-50 disabled:opacity-50"
                    >
                      <Trash2 size={13} /> Đánh vắng (xóa tất cả)
                    </button>
                  )}
                </div>
              )}

              {/* ══════════════ TAB: Lịch sử ══════════════ */}
              {tab === 'history' && (
                <div>
                  {!firstRecordId ? (
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
                            <span className="font-medium">
                              {log.edit_type === 'shift_change' ? 'Đổi ca' : log.edit_type === 'time_correction' ? 'Sửa giờ' : 'Thủ công'}
                            </span>
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
