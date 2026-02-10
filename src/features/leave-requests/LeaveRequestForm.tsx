// ============================================================================
// LEAVE REQUEST FORM - MOBILE-FIRST
// File: src/features/leave-requests/LeaveRequestForm.tsx
// ============================================================================
// CẬP NHẬT: Thêm prop viewOnly để hiển thị read-only cho đơn pending
// khi mở từ "Xem chi tiết" (không phải edit)
// ============================================================================

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useQuery, useMutation } from '@tanstack/react-query'
import { 
  Calendar, User, FileText, Clock, Loader2, 
  CheckCircle, XCircle, AlertTriangle 
} from 'lucide-react'
import { leaveRequestService, leaveTypeService, employeeService } from '../../services'
import { useAuthStore } from '../../stores/authStore'

interface LeaveRequestFormData {
  employee_id: string
  leave_type_id: string
  start_date: string
  end_date: string
  total_days: number
  is_half_day: boolean
  reason: string
}

interface LeaveRequest {
  id: string
  employee_id: string
  leave_type_id: string
  request_number: string
  start_date: string
  end_date: string
  total_days: number
  is_half_day?: boolean
  reason: string
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  approval_notes?: string
  employee?: {
    id: string
    code: string
    full_name: string
  }
  leave_type?: {
    id: string
    name: string
    color: string
  }
}

interface Props {
  initialData?: LeaveRequest | null
  viewOnly?: boolean  // ← MỚI: hiển thị read-only kể cả đơn pending
  onSuccess: () => void
  onCancel: () => void
}

export function LeaveRequestForm({ initialData, viewOnly = false, onSuccess, onCancel }: Props) {
  const { user } = useAuthStore()
  
  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<LeaveRequestFormData>({
    defaultValues: initialData ? {
      employee_id: initialData.employee_id || '',
      leave_type_id: initialData.leave_type_id || '',
      start_date: initialData.start_date || new Date().toISOString().split('T')[0],
      end_date: initialData.end_date || new Date().toISOString().split('T')[0],
      total_days: initialData.total_days || 1,
      is_half_day: initialData.is_half_day || false,
      reason: initialData.reason || ''
    } : {
      employee_id: user?.employee_id || '',
      leave_type_id: '',
      start_date: new Date().toISOString().split('T')[0],
      end_date: new Date().toISOString().split('T')[0],
      total_days: 1,
      is_half_day: false,
      reason: ''
    }
  })

  // Query danh sách loại nghỉ phép (chỉ active)
  const { data: leaveTypes, isLoading: isLoadingLeaveTypes } = useQuery({
    queryKey: ['leave-types-active'],
    queryFn: leaveTypeService.getAllActive,
    enabled: !viewOnly && !(initialData && initialData.status !== 'pending')
  })

  // Query danh sách nhân viên
  const { data: employees, isLoading: isLoadingEmployees } = useQuery({
    queryKey: ['employees-active'],
    queryFn: () => employeeService.getAll({ page: 1, pageSize: 1000, status: 'active' }),
    enabled: !viewOnly && !(initialData && initialData.status !== 'pending')
  })

  // Tính số ngày nghỉ tự động
  const startDate = watch('start_date')
  const endDate = watch('end_date')
  const isHalfDay = watch('is_half_day')

  useEffect(() => {
    if (startDate && endDate) {
      const start = new Date(startDate)
      const end = new Date(endDate)
      let days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
      
      if (isHalfDay) {
        days = 0.5
      }
      
      if (days > 0) {
        setValue('total_days', days)
      }
    }
  }, [startDate, endDate, isHalfDay, setValue])

  const mutation = useMutation({
    mutationFn: (data: LeaveRequestFormData) => leaveRequestService.create(data as any),
    onSuccess
  })

  // ══════════════════════════════════════════════════════
  // READ-ONLY VIEW (Approved/Rejected/Cancelled OR viewOnly)
  // ══════════════════════════════════════════════════════

  const isReadOnly = viewOnly || (initialData && initialData.status !== 'pending')

  if (initialData && isReadOnly) {
    const statusConfig: Record<string, { label: string; icon: any; cls: string }> = {
      pending:   { label: 'Chờ duyệt', icon: Clock, cls: 'bg-amber-50 text-amber-700 border-amber-200' },
      approved:  { label: 'Đã duyệt', icon: CheckCircle, cls: 'bg-green-50 text-green-700 border-green-200' },
      rejected:  { label: 'Từ chối', icon: XCircle, cls: 'bg-red-50 text-red-700 border-red-200' },
      cancelled: { label: 'Đã hủy', icon: AlertTriangle, cls: 'bg-gray-50 text-gray-700 border-gray-200' },
    }
    const status = statusConfig[initialData.status] || statusConfig.pending
    const StatusIcon = status.icon

    return (
      <div className="space-y-4 sm:space-y-5">
        {/* Status badge */}
        <div className={`flex items-center gap-2 px-4 py-3 rounded-xl border ${status.cls}`}>
          <StatusIcon className="w-5 h-5 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold">{status.label}</p>
            <p className="text-xs opacity-75">Mã đơn: {initialData.request_number}</p>
          </div>
        </div>

        {/* Info grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs text-gray-500 font-medium flex items-center gap-1">
              <User className="w-3 h-3" />
              Nhân viên
            </label>
            <p className="text-[15px] font-semibold text-gray-900">{initialData.employee?.full_name}</p>
            <p className="text-xs text-gray-500">{initialData.employee?.code}</p>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-gray-500 font-medium">Loại nghỉ</label>
            {initialData.leave_type && (
              <span
                className="inline-block px-3 py-1.5 rounded-lg text-sm font-medium text-white"
                style={{ backgroundColor: initialData.leave_type.color }}
              >
                {initialData.leave_type.name}
              </span>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-xs text-gray-500 font-medium flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              Từ ngày
            </label>
            <p className="text-[15px] font-medium text-gray-900">
              {new Date(initialData.start_date).toLocaleDateString('vi-VN', { 
                weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' 
              })}
            </p>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-gray-500 font-medium flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              Đến ngày
            </label>
            <p className="text-[15px] font-medium text-gray-900">
              {new Date(initialData.end_date).toLocaleDateString('vi-VN', { 
                weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' 
              })}
            </p>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-gray-500 font-medium flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Số ngày nghỉ
            </label>
            <p className="text-[15px] font-bold text-blue-600">{initialData.total_days} ngày</p>
          </div>
        </div>

        {/* Reason */}
        <div className="space-y-2">
          <label className="text-xs text-gray-500 font-medium flex items-center gap-1">
            <FileText className="w-3 h-3" />
            Lý do nghỉ
          </label>
          <div className="bg-gray-50 rounded-xl px-4 py-3 border border-gray-200">
            <p className="text-[15px] text-gray-800">{initialData.reason}</p>
          </div>
        </div>

        {/* Approval notes */}
        {initialData.approval_notes && (
          <div className="space-y-2">
            <label className="text-xs text-gray-500 font-medium">Ghi chú phê duyệt</label>
            <div className="bg-red-50 rounded-xl px-4 py-3 border border-red-200">
              <p className="text-[15px] text-red-700">{initialData.approval_notes}</p>
            </div>
          </div>
        )}

        {/* Close button */}
        <div className="pt-2">
          <button
            onClick={onCancel}
            className="w-full py-3.5 sm:py-3 px-4 bg-white border-2 border-gray-300 rounded-xl
              text-[15px] sm:text-sm font-semibold text-gray-700 
              active:bg-gray-50 transition-colors"
          >
            Đóng
          </button>
        </div>
      </div>
    )
  }

  // ══════════════════════════════════════════════════════
  // LOADING STATE
  // ══════════════════════════════════════════════════════

  if (isLoadingLeaveTypes || isLoadingEmployees) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        <span className="mt-3 text-sm text-gray-500">Đang tải dữ liệu...</span>
      </div>
    )
  }

  // ══════════════════════════════════════════════════════
  // FORM (Create/Edit)
  // ══════════════════════════════════════════════════════

  return (
    <form onSubmit={handleSubmit(data => mutation.mutate(data))} className="space-y-4 sm:space-y-5">
      
      {/* Employee select */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
          <User className="w-4 h-4 text-gray-400" />
          Nhân viên <span className="text-red-500">*</span>
        </label>
        <select
          {...register('employee_id', { required: 'Vui lòng chọn nhân viên' })}
          className={`w-full px-4 py-3.5 sm:py-3 border rounded-xl text-[15px] sm:text-sm
            bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500
            ${errors.employee_id ? 'border-red-300' : 'border-gray-300'}`}
        >
          <option value="">-- Chọn nhân viên --</option>
          {(employees?.data || []).map(e => (
            <option key={e.id} value={e.id}>
              {e.code} - {e.full_name}
            </option>
          ))}
        </select>
        {errors.employee_id && (
          <p className="text-xs text-red-600 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            {errors.employee_id.message}
          </p>
        )}
      </div>

      {/* Leave type select */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">
          Loại nghỉ phép <span className="text-red-500">*</span>
        </label>
        <select
          {...register('leave_type_id', { required: 'Vui lòng chọn loại nghỉ' })}
          className={`w-full px-4 py-3.5 sm:py-3 border rounded-xl text-[15px] sm:text-sm
            bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500
            ${errors.leave_type_id ? 'border-red-300' : 'border-gray-300'}`}
        >
          <option value="">-- Chọn loại nghỉ --</option>
          {(leaveTypes || []).map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        {errors.leave_type_id && (
          <p className="text-xs text-red-600 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            {errors.leave_type_id.message}
          </p>
        )}
      </div>

      {/* Date range */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-gray-400" />
            Từ ngày <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            {...register('start_date', { required: 'Vui lòng chọn ngày bắt đầu' })}
            className={`w-full px-4 py-3.5 sm:py-3 border rounded-xl text-[15px] sm:text-sm
              bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500
              ${errors.start_date ? 'border-red-300' : 'border-gray-300'}`}
          />
          {errors.start_date && (
            <p className="text-xs text-red-600">{errors.start_date.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-gray-400" />
            Đến ngày <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            {...register('end_date', { required: 'Vui lòng chọn ngày kết thúc' })}
            className={`w-full px-4 py-3.5 sm:py-3 border rounded-xl text-[15px] sm:text-sm
              bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500
              ${errors.end_date ? 'border-red-300' : 'border-gray-300'}`}
          />
          {errors.end_date && (
            <p className="text-xs text-red-600">{errors.end_date.message}</p>
          )}
        </div>
      </div>

      {/* Total days + Half day */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Tổng số ngày nghỉ</label>
          <input
            type="number"
            step="0.5"
            {...register('total_days', { valueAsNumber: true })}
            disabled
            className="w-full px-4 py-3.5 sm:py-3 border border-gray-300 rounded-xl text-[15px] sm:text-sm
              bg-gray-50 text-gray-600 font-bold"
          />
        </div>

        <div className="flex items-end pb-1">
          <label className="flex items-center gap-3 cursor-pointer w-full h-12 sm:h-11 px-4 
            border-2 border-gray-300 rounded-xl active:bg-gray-50 transition-colors">
            <input
              type="checkbox"
              {...register('is_half_day')}
              className="w-5 h-5 rounded border-gray-300 text-blue-600 
                focus:ring-2 focus:ring-blue-500 cursor-pointer"
            />
            <span className="text-[15px] sm:text-sm font-medium text-gray-700">Nghỉ nửa ngày</span>
          </label>
        </div>
      </div>

      {/* Reason */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
          <FileText className="w-4 h-4 text-gray-400" />
          Lý do nghỉ <span className="text-red-500">*</span>
        </label>
        <textarea
          {...register('reason', { required: 'Vui lòng nhập lý do' })}
          rows={4}
          placeholder="Nhập lý do xin nghỉ phép..."
          className={`w-full px-4 py-3.5 sm:py-3 border rounded-xl text-[15px] sm:text-sm
            resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500
            ${errors.reason ? 'border-red-300' : 'border-gray-300'}`}
        />
        {errors.reason && (
          <p className="text-xs text-red-600 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            {errors.reason.message}
          </p>
        )}
      </div>

      {/* Error message */}
      {mutation.isError && (
        <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl">
          <div className="flex gap-2">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
            <div className="text-sm text-red-700">
              <p className="font-semibold">Có lỗi xảy ra</p>
              <p className="text-xs mt-0.5">
                {(mutation.error as Error)?.message || 'Không thể tạo đơn nghỉ phép'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="w-full sm:w-auto py-3.5 sm:py-2.5 px-5 border-2 border-gray-300 rounded-xl
            text-[15px] sm:text-sm font-semibold text-gray-700 
            active:bg-gray-50 transition-colors"
        >
          Hủy
        </button>
        <button
          type="submit"
          disabled={mutation.isPending}
          className="w-full sm:flex-1 flex items-center justify-center gap-2 
            py-3.5 sm:py-2.5 px-5 bg-blue-600 rounded-xl
            text-[15px] sm:text-sm font-semibold text-white 
            active:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed
            transition-colors"
        >
          {mutation.isPending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Đang xử lý...</span>
            </>
          ) : (
            <>
              <CheckCircle className="w-4 h-4" />
              <span>Tạo đơn nghỉ phép</span>
            </>
          )}
        </button>
      </div>

      {/* Safe area spacer for mobile */}
      <div className="h-[env(safe-area-inset-bottom)] sm:hidden" />
    </form>
  )
}