import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useQuery, useMutation } from '@tanstack/react-query'
import { leaveRequestService, leaveTypeService, employeeService } from '../../services'
import { useAuthStore } from '../../stores/authStore'
import { Button, Input, Select } from '../../components/ui'
import type { LeaveRequest, LeaveRequestFormData } from '../../types'

interface Props {
  initialData?: LeaveRequest | null
  onSuccess: () => void
  onCancel: () => void
}

export function LeaveRequestForm({ initialData, onSuccess, onCancel }: Props) {
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
    queryFn: leaveTypeService.getAllActive
  })

  // Query danh sách nhân viên
  const { data: employees, isLoading: isLoadingEmployees } = useQuery({
    queryKey: ['employees-active'],
    queryFn: () => employeeService.getAll({ page: 1, pageSize: 1000, status: 'active' })
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
    mutationFn: (data: LeaveRequestFormData) => 
      initialData 
        ? leaveRequestService.update(initialData.id, data)
        : leaveRequestService.create(data),
    onSuccess
  })

  // Nếu đang xem chi tiết (đã duyệt/từ chối), chỉ hiển thị thông tin
  if (initialData && initialData.status !== 'pending') {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm text-gray-500">Mã đơn</label>
            <p className="font-medium">{initialData.request_number}</p>
          </div>
          <div>
            <label className="text-sm text-gray-500">Nhân viên</label>
            <p className="font-medium">{initialData.employee?.full_name}</p>
          </div>
          <div>
            <label className="text-sm text-gray-500">Loại nghỉ</label>
            <p className="font-medium">{initialData.leave_type?.name}</p>
          </div>
          <div>
            <label className="text-sm text-gray-500">Số ngày</label>
            <p className="font-medium">{initialData.total_days} ngày</p>
          </div>
          <div>
            <label className="text-sm text-gray-500">Từ ngày</label>
            <p className="font-medium">{new Date(initialData.start_date).toLocaleDateString('vi-VN')}</p>
          </div>
          <div>
            <label className="text-sm text-gray-500">Đến ngày</label>
            <p className="font-medium">{new Date(initialData.end_date).toLocaleDateString('vi-VN')}</p>
          </div>
        </div>
        <div>
          <label className="text-sm text-gray-500">Lý do</label>
          <p className="font-medium">{initialData.reason}</p>
        </div>
        {initialData.approval_notes && (
          <div>
            <label className="text-sm text-gray-500">Ghi chú phê duyệt</label>
            <p className="font-medium">{initialData.approval_notes}</p>
          </div>
        )}
        <div className="flex justify-end">
          <Button variant="outline" onClick={onCancel}>Đóng</Button>
        </div>
      </div>
    )
  }

  // Loading state
  if (isLoadingLeaveTypes || isLoadingEmployees) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-gray-500">Đang tải dữ liệu...</div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit(data => mutation.mutate(data))} className="space-y-4">
      <Select
        label="Nhân viên *"
        {...register('employee_id', { required: 'Vui lòng chọn nhân viên' })}
        error={errors.employee_id?.message}
        options={[
          { value: '', label: '-- Chọn nhân viên --' },
          ...(employees?.data || []).map(e => ({ 
            value: e.id, 
            label: `${e.code} - ${e.full_name}` 
          }))
        ]}
      />

      <Select
        label="Loại nghỉ phép *"
        {...register('leave_type_id', { required: 'Vui lòng chọn loại nghỉ' })}
        error={errors.leave_type_id?.message}
        options={[
          { value: '', label: '-- Chọn loại nghỉ --' },
          ...(leaveTypes || []).map(t => ({ value: t.id, label: t.name }))
        ]}
      />

      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Từ ngày *"
          type="date"
          {...register('start_date', { required: 'Vui lòng chọn ngày bắt đầu' })}
          error={errors.start_date?.message}
        />

        <Input
          label="Đến ngày *"
          type="date"
          {...register('end_date', { required: 'Vui lòng chọn ngày kết thúc' })}
          error={errors.end_date?.message}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Tổng số ngày nghỉ"
          type="number"
          step="0.5"
          {...register('total_days', { valueAsNumber: true })}
          disabled
        />

        <div className="flex items-center gap-2 pt-6">
          <input
            type="checkbox"
            id="is_half_day"
            {...register('is_half_day')}
            className="rounded"
          />
          <label htmlFor="is_half_day">Nghỉ nửa ngày</label>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Lý do nghỉ *
        </label>
        <textarea
          {...register('reason', { required: 'Vui lòng nhập lý do' })}
          rows={3}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
          placeholder="Nhập lý do xin nghỉ phép..."
        />
        {errors.reason && (
          <p className="mt-1 text-sm text-red-600">{errors.reason.message}</p>
        )}
      </div>

      {mutation.isError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
          Có lỗi xảy ra: {(mutation.error as Error)?.message || 'Không thể tạo đơn nghỉ phép'}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Hủy
        </Button>
        <Button type="submit" isLoading={mutation.isPending}>
          {initialData ? 'Cập nhật' : 'Tạo đơn'}
        </Button>
      </div>
    </form>
  )
}