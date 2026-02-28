import { useForm } from 'react-hook-form'
import { useMutation } from '@tanstack/react-query'
import { leaveTypeService } from '../../services'
import { Button, Input, Select } from '../../components/ui'
import type { LeaveType, LeaveTypeFormData } from '../../types'
 
interface Props {
  initialData?: LeaveType | null
  onSuccess: () => void
  onCancel: () => void
}
 
const colorOptions = [
  { value: '#10B981', label: 'Xanh lá' },
  { value: '#3B82F6', label: 'Xanh dương' },
  { value: '#F59E0B', label: 'Vàng cam' },
  { value: '#EF4444', label: 'Đỏ' },
  { value: '#8B5CF6', label: 'Tím' },
  { value: '#EC4899', label: 'Hồng' },
  { value: '#06B6D4', label: 'Cyan' },
  { value: '#6B7280', label: 'Xám' },
]
 
export function LeaveTypeForm({ initialData, onSuccess, onCancel }: Props) {
  const { register, handleSubmit, watch, formState: { errors } } = useForm<LeaveTypeFormData>({
    defaultValues: initialData ? {
      ...initialData,
      description: initialData.description ?? undefined,
      max_days_per_year: initialData.max_days_per_year ?? undefined,
      default_days: initialData.default_days ?? undefined,
      color: initialData.color ?? undefined,
    } : {
      code: '',
      name: '',
      description: '',
      default_days: 0,
      is_paid: true,
      requires_approval: true,
      color: '#3B82F6',
      status: 'active'
    }
  })
 
  const selectedColor = watch('color')
 
  const mutation = useMutation({
    mutationFn: (data: LeaveTypeFormData) => 
      initialData 
        ? leaveTypeService.update(initialData.id, data)
        : leaveTypeService.create(data),
    onSuccess
  })
 
  return (
    <form onSubmit={handleSubmit(data => mutation.mutate(data as any))} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Mã loại nghỉ *"
          {...register('code', { required: 'Vui lòng nhập mã' })}
          error={errors.code?.message}
          disabled={!!initialData}
        />
 
        <Input
          label="Tên loại nghỉ *"
          {...register('name', { required: 'Vui lòng nhập tên' })}
          error={errors.name?.message}
        />
      </div>
 
      <Input
        label="Mô tả"
        {...register('description')}
      />
 
      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Số ngày mặc định/năm"
          type="number"
          {...register('default_days', { valueAsNumber: true })}
        />
 
        <Input
          label="Số ngày nghỉ liên tục tối đa"
          type="number"
          {...register('max_consecutive_days', { valueAsNumber: true })}
        />
      </div>
 
      <div className="grid grid-cols-2 gap-4">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="is_paid"
            {...register('is_paid')}
            className="rounded"
          />
          <label htmlFor="is_paid">Có lương</label>
        </div>
 
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="requires_approval"
            {...register('requires_approval')}
            className="rounded"
          />
          <label htmlFor="requires_approval">Cần phê duyệt</label>
        </div>
      </div>
 
      <div>
        <label className="block text-sm font-medium mb-2">Màu hiển thị</label>
        <div className="flex gap-2 flex-wrap">
          {colorOptions.map(opt => (
            <label 
              key={opt.value}
              className={`w-8 h-8 rounded cursor-pointer border-2 ${
                selectedColor === opt.value ? 'border-gray-800' : 'border-transparent'
              }`}
              style={{ backgroundColor: opt.value }}
            >
              <input
                type="radio"
                value={opt.value}
                {...register('color')}
                className="sr-only"
              />
            </label>
          ))}
        </div>
      </div>
 
      <Select
        label="Trạng thái"
        {...register('status')}
        options={[
          { value: 'active', label: 'Hoạt động' },
          { value: 'inactive', label: 'Ngừng hoạt động' }
        ]}
      />
 
      <div className="flex justify-end gap-2 pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Hủy
        </Button>
        <Button type="submit" isLoading={mutation.isPending}>
          {initialData ? 'Cập nhật' : 'Thêm mới'}
        </Button>
      </div>
    </form>
  )
}
