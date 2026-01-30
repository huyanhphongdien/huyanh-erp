import { useForm } from 'react-hook-form'
import { useMutation } from '@tanstack/react-query'
import { payrollService } from '../../services'
import { useAuthStore } from '../../stores/authStore'
import { Button, Input } from '../../components/ui'
import type { PayrollPeriod, PayrollPeriodFormData } from '../../types'

interface Props {
  initialData?: PayrollPeriod | null
  onSuccess: () => void
  onCancel: () => void
}

export function PayrollPeriodForm({ initialData, onSuccess, onCancel }: Props) {
  const { user } = useAuthStore()
  const currentDate = new Date()
  const currentYear = currentDate.getFullYear()
  const currentMonth = currentDate.getMonth() + 1

  // Tính ngày đầu và cuối tháng
  const getLastDayOfMonth = (year: number, month: number) => {
    return new Date(year, month, 0).getDate()
  }

  const { register, handleSubmit, formState: { errors } } = useForm<PayrollPeriodFormData>({
    defaultValues: initialData ? {
      code: initialData.code,
      name: initialData.name,
      year: initialData.year,
      month: initialData.month,
      start_date: initialData.start_date,
      end_date: initialData.end_date,
      payment_date: initialData.payment_date || '',
      notes: initialData.notes || ''
    } : {
      code: `KL${currentYear}-${String(currentMonth).padStart(2, '0')}`,
      name: `Kỳ lương tháng ${String(currentMonth).padStart(2, '0')}/${currentYear}`,
      year: currentYear,
      month: currentMonth,
      start_date: `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`,
      end_date: `${currentYear}-${String(currentMonth).padStart(2, '0')}-${getLastDayOfMonth(currentYear, currentMonth)}`,
      payment_date: '',
      notes: ''
    }
  })

  const mutation = useMutation({
    mutationFn: (data: PayrollPeriodFormData) => 
      initialData 
        ? payrollService.updatePeriod(initialData.id, data)
        : payrollService.createPeriod(data, user?.employee_id || ''),
    onSuccess
  })

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value)
  }

  // View mode for existing period
  if (initialData) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm text-gray-500">Mã kỳ</label>
            <p className="font-medium">{initialData.code}</p>
          </div>
          <div>
            <label className="text-sm text-gray-500">Tên kỳ</label>
            <p className="font-medium">{initialData.name}</p>
          </div>
          <div>
            <label className="text-sm text-gray-500">Tháng/Năm</label>
            <p className="font-medium">{String(initialData.month).padStart(2, '0')}/{initialData.year}</p>
          </div>
          <div>
            <label className="text-sm text-gray-500">Số nhân viên</label>
            <p className="font-medium">{initialData.total_employees}</p>
          </div>
          <div>
            <label className="text-sm text-gray-500">Tổng lương</label>
            <p className="font-medium text-green-600">{formatCurrency(initialData.total_amount ?? 0)}</p>
          </div>
          <div>
            <label className="text-sm text-gray-500">Trạng thái</label>
            <p className="font-medium capitalize">{initialData.status}</p>
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
        {initialData.notes && (
          <div>
            <label className="text-sm text-gray-500">Ghi chú</label>
            <p className="font-medium">{initialData.notes}</p>
          </div>
        )}
        <div className="flex justify-end">
          <Button variant="outline" onClick={onCancel}>Đóng</Button>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit(data => mutation.mutate(data))} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Mã kỳ lương *"
          {...register('code', { required: 'Vui lòng nhập mã' })}
          error={errors.code?.message}
        />
        <Input
          label="Tên kỳ lương *"
          {...register('name', { required: 'Vui lòng nhập tên' })}
          error={errors.name?.message}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Năm *"
          type="number"
          {...register('year', { required: true, valueAsNumber: true })}
        />
        <Input
          label="Tháng *"
          type="number"
          min={1}
          max={12}
          {...register('month', { required: true, valueAsNumber: true })}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Từ ngày *"
          type="date"
          {...register('start_date', { required: true })}
        />
        <Input
          label="Đến ngày *"
          type="date"
          {...register('end_date', { required: true })}
        />
      </div>

      <Input
        label="Ngày trả lương"
        type="date"
        {...register('payment_date')}
      />

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Ghi chú</label>
        <textarea
          {...register('notes')}
          rows={2}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      {mutation.isError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
          Có lỗi xảy ra: {(mutation.error as Error)?.message || 'Không thể tạo kỳ lương'}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Hủy
        </Button>
        <Button type="submit" isLoading={mutation.isPending}>
          Tạo kỳ lương
        </Button>
      </div>
    </form>
  )
}