// ============================================================================
// OVERTIME REQUEST FORM
// File: src/features/overtime/OvertimeRequestForm.tsx
// Huy Anh ERP System - Chấm công V2 (Batch 4)
// ============================================================================
// Modal form để nhân viên tạo phiếu đăng ký tăng ca
// - Chọn ngày tăng ca
// - Auto load ca được phân hôm đó (nếu có)
// - Chọn giờ bắt đầu/kết thúc OT
// - Tự tính planned_minutes
// - Validate: không tạo trùng ngày, ngày >= hôm nay
// ============================================================================

import { useState, useEffect } from 'react'
import { X, Clock, Calendar, AlertCircle, Loader2, Info } from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { overtimeRequestService } from '../../services/overtimeRequestService'
import { supabase } from '../../lib/supabase'

// ============================================================================
// TYPES
// ============================================================================

interface FormData {
  request_date: string
  planned_start_time: string
  planned_end_time: string
  reason: string
}

interface ShiftInfo {
  id: string
  name: string
  code: string
  start_time: string
  end_time: string
  shift_category: string  // ← đổi từ category
}

interface OvertimeRequestFormProps {
  onSuccess: () => void
  onClose: () => void
}

// ============================================================================
// HELPERS
// ============================================================================

function getTodayStr(): string {
  return new Date().toISOString().split('T')[0]
}

/** Tính số phút giữa 2 thời gian HH:mm */
function calculateMinutes(start: string, end: string): number {
  if (!start || !end) return 0
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  let startMin = sh * 60 + sm
  let endMin = eh * 60 + em
  // Nếu end < start → qua ngày hôm sau
  if (endMin <= startMin) {
    endMin += 24 * 60
  }
  return endMin - startMin
}

function formatMinutes(minutes: number): string {
  if (minutes <= 0) return '0 phút'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} phút`
  if (m === 0) return `${h} giờ`
  return `${h} giờ ${m} phút`
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function OvertimeRequestForm({ onSuccess, onClose }: OvertimeRequestFormProps) {
  const { user } = useAuthStore()
  const employeeId = user?.employee_id

  // Form state
  const [formData, setFormData] = useState<FormData>({
    request_date: getTodayStr(),
    planned_start_time: '17:30',
    planned_end_time: '19:30',
    reason: '',
  })

  // Shift info
  const [shiftInfo, setShiftInfo] = useState<ShiftInfo | null>(null)
  const [shiftLoading, setShiftLoading] = useState(false)

  // Submit state
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Validation state
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})

  // Computed: planned_minutes
  const plannedMinutes = calculateMinutes(formData.planned_start_time, formData.planned_end_time)

  // --------------------------------------------------------------------------
  // LOAD SHIFT FOR DATE
  // --------------------------------------------------------------------------

  useEffect(() => {
    if (formData.request_date && employeeId) {
      loadShiftForDate(formData.request_date)
    }
  }, [formData.request_date, employeeId])

  const loadShiftForDate = async (date: string) => {
    if (!employeeId) return

    try {
      setShiftLoading(true)
      setShiftInfo(null)

      // Query shift_assignments cho nhân viên trong ngày đó
      const { data, error: err } = await supabase
        .from('shift_assignments')
        .select(`
          shift_id,
          shift:shifts(id, name, code, start_time, end_time, shift_category)
        `)
        .eq('employee_id', employeeId)
        .eq('date', date)
        .maybeSingle()

      if (!err && data?.shift) {
        const shift = Array.isArray(data.shift) ? data.shift[0] : data.shift
        if (shift) {
          setShiftInfo(shift as ShiftInfo)
        }
      }
    } catch (err) {
      console.error('Error loading shift for date:', err)
    } finally {
      setShiftLoading(false)
    }
  }

  // --------------------------------------------------------------------------
  // FORM HANDLERS
  // --------------------------------------------------------------------------

  const handleChange = (field: keyof FormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    // Clear validation error cho field đó
    if (validationErrors[field]) {
      setValidationErrors(prev => {
        const next = { ...prev }
        delete next[field]
        return next
      })
    }
    setError(null)
  }

  // --------------------------------------------------------------------------
  // VALIDATION
  // --------------------------------------------------------------------------

  const validate = (): boolean => {
    const errors: Record<string, string> = {}

    if (!formData.request_date) {
      errors.request_date = 'Vui lòng chọn ngày tăng ca'
    } else if (formData.request_date < getTodayStr()) {
      errors.request_date = 'Ngày tăng ca không được ở quá khứ'
    }

    if (!formData.planned_start_time) {
      errors.planned_start_time = 'Vui lòng chọn giờ bắt đầu'
    }

    if (!formData.planned_end_time) {
      errors.planned_end_time = 'Vui lòng chọn giờ kết thúc'
    }

    if (plannedMinutes <= 0) {
      errors.planned_end_time = 'Giờ kết thúc phải sau giờ bắt đầu'
    }

    if (plannedMinutes > 720) { // > 12 giờ
      errors.planned_end_time = 'Thời gian tăng ca không được vượt quá 12 giờ'
    }

    if (!formData.reason.trim()) {
      errors.reason = 'Vui lòng nhập lý do tăng ca'
    } else if (formData.reason.trim().length < 10) {
      errors.reason = 'Lý do phải có ít nhất 10 ký tự'
    }

    setValidationErrors(errors)
    return Object.keys(errors).length === 0
  }

  // --------------------------------------------------------------------------
  // SUBMIT
  // --------------------------------------------------------------------------

  const handleSubmit = async () => {
    if (!employeeId) {
      setError('Không xác định được nhân viên. Vui lòng đăng nhập lại.')
      return
    }

    if (!validate()) return

    try {
      setSubmitting(true)
      setError(null)

      await overtimeRequestService.create({
        employee_id: employeeId,
        request_date: formData.request_date,
        shift_id: shiftInfo?.id || null,
        planned_start_time: formData.planned_start_time,
        planned_end_time: formData.planned_end_time,
        planned_minutes: plannedMinutes,
        reason: formData.reason.trim(),
      })

      onSuccess()
    } catch (err: any) {
      console.error('Error creating overtime request:', err)
      setError(err.message || 'Không thể tạo phiếu tăng ca')
    } finally {
      setSubmitting(false)
    }
  }

  // --------------------------------------------------------------------------
  // RENDER
  // --------------------------------------------------------------------------

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-bold text-gray-900">Tạo phiếu tăng ca</h2>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-5">
          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 bg-red-50 text-red-700 p-3 rounded-lg text-sm">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Ngày tăng ca */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Ngày tăng ca <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="date"
                value={formData.request_date}
                onChange={(e) => handleChange('request_date', e.target.value)}
                min={getTodayStr()}
                className={`w-full pl-10 pr-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm ${
                  validationErrors.request_date ? 'border-red-500' : ''
                }`}
              />
            </div>
            {validationErrors.request_date && (
              <p className="text-red-500 text-xs mt-1">{validationErrors.request_date}</p>
            )}
          </div>

          {/* Thông tin ca */}
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="flex items-center gap-2 text-sm">
              <Info className="w-4 h-4 text-blue-500" />
              <span className="font-medium text-gray-700">Ca làm việc:</span>
              {shiftLoading ? (
                <span className="flex items-center gap-1 text-gray-500">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Đang tải...
                </span>
              ) : shiftInfo ? (
                <span className="text-blue-700 font-medium">
                  {shiftInfo.name} ({shiftInfo.start_time?.slice(0, 5)} — {shiftInfo.end_time?.slice(0, 5)})
                </span>
              ) : (
                <span className="text-gray-500 italic">Chưa phân ca cho ngày này</span>
              )}
            </div>
          </div>

          {/* Giờ bắt đầu - kết thúc */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Giờ bắt đầu OT <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="time"
                  value={formData.planned_start_time}
                  onChange={(e) => handleChange('planned_start_time', e.target.value)}
                  className={`w-full pl-10 pr-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm ${
                    validationErrors.planned_start_time ? 'border-red-500' : ''
                  }`}
                />
              </div>
              {validationErrors.planned_start_time && (
                <p className="text-red-500 text-xs mt-1">{validationErrors.planned_start_time}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Giờ kết thúc OT <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="time"
                  value={formData.planned_end_time}
                  onChange={(e) => handleChange('planned_end_time', e.target.value)}
                  className={`w-full pl-10 pr-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm ${
                    validationErrors.planned_end_time ? 'border-red-500' : ''
                  }`}
                />
              </div>
              {validationErrors.planned_end_time && (
                <p className="text-red-500 text-xs mt-1">{validationErrors.planned_end_time}</p>
              )}
            </div>
          </div>

          {/* Thời lượng tính toán */}
          {plannedMinutes > 0 && (
            <div className="bg-blue-50 rounded-lg p-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-600" />
              <span className="text-sm text-blue-700">
                Thời gian tăng ca dự kiến: <strong>{formatMinutes(plannedMinutes)}</strong>
              </span>
            </div>
          )}

          {/* Lý do */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Lý do tăng ca <span className="text-red-500">*</span>
            </label>
            <textarea
              value={formData.reason}
              onChange={(e) => handleChange('reason', e.target.value)}
              rows={3}
              placeholder="Nhập lý do cần tăng ca..."
              className={`w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm resize-none ${
                validationErrors.reason ? 'border-red-500' : ''
              }`}
            />
            <div className="flex items-center justify-between mt-1">
              {validationErrors.reason ? (
                <p className="text-red-500 text-xs">{validationErrors.reason}</p>
              ) : (
                <span />
              )}
              <span className="text-xs text-gray-400">{formData.reason.length}/500</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-gray-50 rounded-b-xl flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2.5 border rounded-lg text-gray-700 hover:bg-gray-100 transition-colors text-sm font-medium disabled:opacity-50"
          >
            Hủy
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || plannedMinutes <= 0}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Đang gửi...
              </>
            ) : (
              'Gửi phiếu tăng ca'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}