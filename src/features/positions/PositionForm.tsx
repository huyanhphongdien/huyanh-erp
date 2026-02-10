import { useForm } from 'react-hook-form'
import { useMutation } from '@tanstack/react-query'
import { positionService } from '../../services'
import { Button, Input, Select } from '../../components/ui'

// Define types inline
interface Position {
  id: string
  code: string
  name: string
  level?: number
  description?: string
  status?: string
}

interface PositionFormData {
  code: string
  name: string
  level?: number
  description?: string
  status?: string
}

interface PositionFormProps {
  position?: Position | null
  onSuccess: () => void
  onCancel: () => void
}

// Helper function
function toFormData(position: Position | null | undefined): PositionFormData {
  if (!position) {
    return {
      code: '',
      name: '',
      level: 1,
      description: '',
      status: 'active'
    }
  }
  return {
    code: position.code ?? '',
    name: position.name ?? '',
    level: position.level ?? 1,
    description: position.description ?? '',
    status: position.status ?? 'active'
  }
}

export function PositionForm({ position, onSuccess, onCancel }: PositionFormProps) {
  const isEdit = !!position

  const { register, handleSubmit, formState: { errors } } = useForm<PositionFormData>({
    defaultValues: toFormData(position)
  })

  const mutation = useMutation({
    mutationFn: (data: PositionFormData) => 
      isEdit 
        ? positionService.update(position!.id, data as any)
        : positionService.create(data as any),
    onSuccess
  })

  const onSubmit = (data: PositionFormData) => {
    mutation.mutate(data)
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <Input
        label="Mã chức vụ *"
        {...register('code', { required: 'Vui lòng nhập mã' })}
        error={errors.code?.message}
        disabled={isEdit}
      />

      <Input
        label="Tên chức vụ *"
        {...register('name', { required: 'Vui lòng nhập tên' })}
        error={errors.name?.message}
      />

      <Input
        label="Cấp bậc"
        type="number"
        {...register('level', { valueAsNumber: true })}
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