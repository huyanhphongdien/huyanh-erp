import { useForm } from 'react-hook-form'
import { useMutation } from '@tanstack/react-query'
import { salaryGradeService } from '../../services'
import { Button, Input, Select } from '../../components/ui'
import type { SalaryGrade, SalaryGradeFormData } from '../../types'

interface Props {
  initialData?: SalaryGrade | null
  onSuccess: () => void
  onCancel: () => void
}

export function SalaryGradeForm({ initialData, onSuccess, onCancel }: Props) {
  const { register, handleSubmit, formState: { errors } } = useForm<SalaryGradeFormData>({
    defaultValues: initialData ? {
      ...initialData,
      min_salary: initialData.min_salary ?? undefined,
      max_salary: initialData.max_salary ?? undefined,
      description: initialData.description ?? undefined,
    } : {
      code: '',
      name: '',
      level: 1,
      min_salary: 0,
      max_salary: 0,
      base_salary: 0,
      allowance_rate: 0,
      description: '',
      status: 'active'
    }
  })

  const mutation = useMutation({
    mutationFn: (data: SalaryGradeFormData) => 
      initialData 
        ? salaryGradeService.update(initialData.id, data)
        : salaryGradeService.create(data),
    onSuccess
  })

  return (
    <form onSubmit={handleSubmit(data => mutation.mutate(data as any))} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Mã bậc lương *"
          {...register('code', { required: 'Vui lòng nhập mã' })}
          error={errors.code?.message}
          disabled={!!initialData}
        />
        <Input
          label="Tên bậc lương *"
          {...register('name', { required: 'Vui lòng nhập tên' })}
          error={errors.name?.message}
        />
      </div>

      <Input
        label="Cấp bậc *"
        type="number"
        {...register('level', { required: true, valueAsNumber: true })}
        error={errors.level?.message}
      />

      <div className="grid grid-cols-3 gap-4">
        <Input
          label="Lương tối thiểu *"
          type="number"
          {...register('min_salary', { required: true, valueAsNumber: true })}
        />
        <Input
          label="Lương tối đa *"
          type="number"
          {...register('max_salary', { required: true, valueAsNumber: true })}
        />
        <Input
          label="Lương cơ bản"
          type="number"
          {...register('base_salary', { valueAsNumber: true })}
        />
      </div>

      <Input
        label="Tỷ lệ phụ cấp (%)"
        type="number"
        step="0.01"
        {...register('allowance_rate', { valueAsNumber: true })}
      />

      <Input
        label="Mô tả"
        {...register('description')}
      />

      <Select
        label="Trạng thái"
        {...register('status')}
        options={[
          { value: 'active', label: 'Hoạt động' },
          { value: 'inactive', label: 'Ngừng hoạt động' }
        ]}
      />

      {mutation.isError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
          Có lỗi xảy ra: {(mutation.error as Error)?.message || 'Không thể lưu bậc lương'}
        </div>
      )}

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