import { useForm } from 'react-hook-form'
import { useMutation } from '@tanstack/react-query'
import { departmentService } from '../../services'
import { Button, Input, Select } from '../../components/ui'
import type { Department, DepartmentFormData } from '../../types'
 
interface DepartmentFormProps {
  department?: Department | null
  onSuccess: () => void
  onCancel: () => void
}
 
export function DepartmentForm({ department, onSuccess, onCancel }: DepartmentFormProps) {
  const isEdit = !!department
 
  const { register, handleSubmit, formState: { errors } } = useForm<DepartmentFormData>({
    defaultValues: department || {
      code: '',
      name: '',
      description: '',
      status: 'active'
    }
  })
 
  const mutation = useMutation({
    mutationFn: (data: DepartmentFormData) => 
      isEdit 
        ? departmentService.update(department!.id, data)
        : departmentService.create(data),
    onSuccess
  })
 
  const onSubmit = (data: DepartmentFormData) => {
    mutation.mutate(data)
  }
 
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <Input
        label="Mã phòng ban *"
        {...register('code', { required: 'Vui lòng nhập mã' })}
        error={errors.code?.message}
        disabled={isEdit}
      />
 
      <Input
        label="Tên phòng ban *"
        {...register('name', { required: 'Vui lòng nhập tên' })}
        error={errors.name?.message}
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
 
      {mutation.error && (
        <p className="text-danger text-sm">
          {(mutation.error as Error).message}
        </p>
      )}
 
      <div className="flex justify-end gap-3 pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Hủy
        </Button>
        <Button type="submit" isLoading={mutation.isPending}>
          {isEdit ? 'Cập nhật' : 'Thêm mới'}
        </Button>
      </div>
    </form>
  )
}
