// ============================================================================
// OVERTIME REQUEST FORM - V2.1 (Mobile-First)
// File: src/features/overtime/OvertimeRequestForm.tsx
// Huy Anh ERP System - Chấm công V2
// ============================================================================
// MOBILE: Full-screen bottom-sheet, 44px+ touch targets, safe-area padding
// DESKTOP: Centered modal 480px max-width
// ============================================================================

import { useState, useEffect } from 'react'
import {
  X, Calendar, Clock, AlertCircle, Loader2, Info,
  CheckCircle, User, Send
} from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import {
  overtimeRequestService,
  type OvertimeApproverInfo
} from '../../services/overtimeRequestService'
import { supabase } from '../../lib/supabase'

// ============================================================================
// TYPES
// ============================================================================

interface Shift {
  id: string
  code: string
  name: string
  start_time: string
  end_time: string
}

interface FormData {
  request_date: string
  planned_start: string
  planned_end: string
  planned_minutes: number
  reason: string
  shift_id?: string
}

interface Props {
  onClose: () => void
  onSuccess: () => void
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function OvertimeRequestForm({ onClose, onSuccess }: Props) {
  const { user } = useAuthStore()
  const employeeId = user?.employee_id

  const [formData, setFormData] = useState<FormData>({
    request_date: new Date().toISOString().split('T')[0],
    planned_start: '17:30',
    planned_end: '19:30',
    planned_minutes: 120,
    reason: '',
  })

  const [shiftInfo, setShiftInfo] = useState<Shift | null>(null)
  const [shiftLoading, setShiftLoading] = useState(false)
  const [approverInfo, setApproverInfo] = useState<OvertimeApproverInfo | null>(null)
  const [approverLoading, setApproverLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  // ── Load approver ──
  useEffect(() => {
    if (!employeeId) return
    setApproverLoading(true)
    overtimeRequestService.getApprover(employeeId)
      .then(info => setApproverInfo(info))
      .catch(err => console.error('Error loading approver:', err))
      .finally(() => setApproverLoading(false))
  }, [employeeId])

  // ── Load shift ──
  useEffect(() => {
    if (!employeeId || !formData.request_date) return

    const loadShift = async () => {
      setShiftLoading(true)
      try {
        const { data } = await supabase
          .from('shift_assignments')
          .select('shift_id, shift:shifts!shift_assignments_shift_id_fkey(id, code, name, start_time, end_time)')
          .eq('employee_id', employeeId)
          .eq('date', formData.request_date)
          .maybeSingle()

        if (data?.shift) {
          const shift = Array.isArray(data.shift) ? data.shift[0] : data.shift
          setShiftInfo(shift)
          setFormData(prev => ({
            ...prev,
            shift_id: shift?.id,
            planned_start: shift?.end_time?.slice(0, 5) || prev.planned_start,
          }))
        } else {
          setShiftInfo(null)
        }
      } catch (err) {
        console.error('Error loading shift:', err)
      } finally {
        setShiftLoading(false)
      }
    }

    loadShift()
  }, [employeeId, formData.request_date])

  // ── Auto-calculate minutes ──
  useEffect(() => {
    const { planned_start, planned_end } = formData
    if (!planned_start || !planned_end) return
    const [sH, sM] = planned_start.split(':').map(Number)
    const [eH, eM] = planned_end.split(':').map(Number)
    let startMins = sH * 60 + sM
    let endMins = eH * 60 + eM
    if (endMins <= startMins) endMins += 24 * 60
    setFormData(prev => ({ ...prev, planned_minutes: Math.max(0, endMins - startMins) }))
  }, [formData.planned_start, formData.planned_end])

  const handleChange = (field: keyof FormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    setErrors(prev => ({ ...prev, [field]: '' }))
    setSubmitError('')
  }

  const formatMinutes = (mins: number) => {
    const h = Math.floor(mins / 60)
    const m = mins % 60
    if (h === 0) return `${m} phút`
    if (m === 0) return `${h} giờ`
    return `${h} giờ ${m} phút`
  }

  const validate = (): boolean => {
    const e: Record<string, string> = {}
    if (!formData.request_date) e.request_date = 'Chọn ngày tăng ca'
    if (!formData.planned_start) e.planned_start = 'Nhập giờ bắt đầu'
    if (!formData.planned_end) e.planned_end = 'Nhập giờ kết thúc'
    if (formData.planned_minutes <= 0) e.planned_end = 'Giờ kết thúc phải sau giờ bắt đầu'
    if (formData.planned_minutes > 480) e.planned_end = 'Tối đa 8 giờ tăng ca'
    if (!formData.reason.trim() || formData.reason.trim().length < 10)
      e.reason = 'Lý do tối thiểu 10 ký tự'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = async () => {
    if (!employeeId || !validate()) return
    setSubmitting(true)
    setSubmitError('')
    try {
      await overtimeRequestService.create({
        employee_id: employeeId,
        request_date: formData.request_date,
        shift_id: formData.shift_id,
        planned_start: formData.planned_start,
        planned_end: formData.planned_end,
        planned_minutes: formData.planned_minutes,
        reason: formData.reason.trim(),
      })
      onSuccess()
    } catch (error: any) {
      setSubmitError(error.message || 'Lỗi tạo phiếu tăng ca')
    } finally {
      setSubmitting(false)
    }
  }

  // ══════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[95vh] sm:max-h-[85vh] flex flex-col overflow-hidden">

        {/* ── Header ── */}
        <div className="flex-shrink-0 border-b px-4 py-3 sm:px-6 sm:py-4 relative">
          {/* Drag handle (mobile) */}
          <div className="absolute top-1.5 left-1/2 -translate-x-1/2 w-10 h-1 bg-gray-300 rounded-full sm:hidden" />
          <div className="flex items-center justify-between mt-2 sm:mt-0">
            <h2 className="text-lg font-bold text-gray-900">Tạo phiếu tăng ca</h2>
            <button
              onClick={onClose}
              className="w-10 h-10 flex items-center justify-center hover:bg-gray-100 active:bg-gray-200 rounded-full -mr-2"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        {/* ── Body (scrollable) ── */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          <div className="px-4 sm:px-6 py-4 space-y-5">

            {/* Error */}
            {submitError && (
              <div className="flex items-start gap-3 p-3.5 bg-red-50 text-red-700 rounded-xl border border-red-200">
                <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
                <div className="text-sm">
                  <p className="font-semibold">Không thể tạo phiếu</p>
                  <p className="mt-0.5 text-red-600">{submitError}</p>
                </div>
              </div>
            )}

            {/* Approver Info */}
            <div className={`rounded-xl p-4 border ${
              approverInfo?.approval_type === 'self'
                ? 'bg-green-50 border-green-200'
                : 'bg-blue-50 border-blue-200'
            }`}>
              {approverLoading ? (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Đang xác định người duyệt...
                </div>
              ) : approverInfo ? (
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                    approverInfo.approval_type === 'self' ? 'bg-green-100' : 'bg-blue-100'
                  }`}>
                    {approverInfo.approval_type === 'self'
                      ? <CheckCircle className="w-5 h-5 text-green-600" />
                      : <User className="w-5 h-5 text-blue-600" />
                    }
                  </div>
                  <div>
                    {approverInfo.approval_type === 'self' ? (
                      <>
                        <p className="text-sm font-semibold text-green-800">Tự động duyệt</p>
                        <p className="text-xs text-green-600 mt-0.5">Phiếu sẽ được duyệt ngay (Ban Giám đốc)</p>
                      </>
                    ) : (
                      <>
                        <p className="text-sm font-semibold text-blue-800">{approverInfo.approver_name}</p>
                        <p className="text-xs text-blue-600 mt-0.5">{approverInfo.approver_position} — Người duyệt</p>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-amber-700">
                  <AlertCircle className="w-5 h-5" />
                  Không xác định được người duyệt
                </div>
              )}
            </div>

            {/* Ngày tăng ca */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Ngày tăng ca <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-gray-400 pointer-events-none" />
                <input
                  type="date"
                  value={formData.request_date}
                  onChange={e => handleChange('request_date', e.target.value)}
                  className={`w-full pl-12 pr-4 py-3.5 border rounded-xl text-[15px]
                    focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                    errors.request_date ? 'border-red-400 bg-red-50' : 'border-gray-300'
                  }`}
                />
              </div>
              {errors.request_date && (
                <p className="text-red-500 text-xs mt-1.5 ml-1">{errors.request_date}</p>
              )}
            </div>

            {/* Ca làm việc */}
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-white border border-gray-200 flex items-center justify-center flex-shrink-0">
                  <Info className="w-[18px] h-[18px] text-blue-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Ca làm việc</p>
                  {shiftLoading ? (
                    <div className="flex items-center gap-1.5 text-sm text-gray-400 mt-1">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Đang tải...
                    </div>
                  ) : shiftInfo ? (
                    <p className="text-[15px] font-semibold text-gray-900 mt-0.5 truncate">
                      {shiftInfo.name}
                      <span className="text-gray-500 font-normal text-sm ml-1.5">
                        {shiftInfo.start_time?.slice(0, 5)} — {shiftInfo.end_time?.slice(0, 5)}
                      </span>
                    </p>
                  ) : (
                    <p className="text-sm text-gray-400 italic mt-0.5">Chưa phân ca cho ngày này</p>
                  )}
                </div>
              </div>
            </div>

            {/* Giờ bắt đầu + kết thúc */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Bắt đầu OT <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Clock className="absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-gray-400 pointer-events-none" />
                  <input
                    type="time"
                    value={formData.planned_start}
                    onChange={e => handleChange('planned_start', e.target.value)}
                    className={`w-full pl-12 pr-3 py-3.5 border rounded-xl text-[15px]
                      focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                      errors.planned_start ? 'border-red-400 bg-red-50' : 'border-gray-300'
                    }`}
                  />
                </div>
                {errors.planned_start && (
                  <p className="text-red-500 text-xs mt-1.5 ml-1">{errors.planned_start}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Kết thúc OT <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Clock className="absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-gray-400 pointer-events-none" />
                  <input
                    type="time"
                    value={formData.planned_end}
                    onChange={e => handleChange('planned_end', e.target.value)}
                    className={`w-full pl-12 pr-3 py-3.5 border rounded-xl text-[15px]
                      focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                      errors.planned_end ? 'border-red-400 bg-red-50' : 'border-gray-300'
                    }`}
                  />
                </div>
                {errors.planned_end && (
                  <p className="text-red-500 text-xs mt-1.5 ml-1">{errors.planned_end}</p>
                )}
              </div>
            </div>

            {/* Tổng giờ OT */}
            <div className="flex items-center justify-between px-4 py-3.5 bg-amber-50 border border-amber-200 rounded-xl">
              <div className="flex items-center gap-2">
                <Clock className="w-[18px] h-[18px] text-amber-600" />
                <span className="text-sm text-amber-800">Tổng thời gian OT</span>
              </div>
              <span className="text-base font-bold text-amber-900">
                {formatMinutes(formData.planned_minutes)}
              </span>
            </div>

            {/* Lý do */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Lý do tăng ca <span className="text-red-500">*</span>
              </label>
              <textarea
                rows={3}
                value={formData.reason}
                onChange={e => handleChange('reason', e.target.value)}
                placeholder="Mô tả lý do cần tăng ca (tối thiểu 10 ký tự)..."
                className={`w-full px-4 py-3.5 border rounded-xl text-[15px] resize-none
                  focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                  errors.reason ? 'border-red-400 bg-red-50' : 'border-gray-300'
                }`}
              />
              <div className="flex items-center justify-between mt-1.5 px-1">
                {errors.reason
                  ? <p className="text-red-500 text-xs">{errors.reason}</p>
                  : <span />
                }
                <span className={`text-xs font-medium ${
                  formData.reason.length >= 10 ? 'text-green-600' : 'text-gray-400'
                }`}>
                  {formData.reason.length}/10
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Footer (sticky, safe-area) ── */}
        <div className="flex-shrink-0 border-t bg-white px-4 sm:px-6 pt-3 sm:pt-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:pb-4">
          <div className="flex flex-col-reverse sm:flex-row gap-2.5 sm:gap-3 sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="w-full sm:w-auto px-5 py-3.5 sm:py-2.5 text-[15px] sm:text-sm font-medium text-gray-700
                bg-white border border-gray-300 rounded-xl hover:bg-gray-50 active:bg-gray-100
                disabled:opacity-50 transition-colors"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || !approverInfo}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-3.5 sm:py-2.5
                text-[15px] sm:text-sm font-semibold text-white bg-blue-600 rounded-xl
                hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Đang gửi...</>
              ) : approverInfo?.approval_type === 'self' ? (
                <><CheckCircle className="w-4 h-4" /> Tạo & tự duyệt</>
              ) : (
                <><Send className="w-4 h-4" /> Gửi phiếu tăng ca</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}