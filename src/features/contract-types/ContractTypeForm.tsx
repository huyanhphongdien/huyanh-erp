import { useForm } from 'react-hook-form'
import { useMutation } from '@tanstack/react-query'
import { contractTypeService } from '../../services'
import { Button, Input, Select } from '../../components/ui'
import type { ContractType, ContractTypeFormData } from '../../types'
 
interface Props {
  initialData?: ContractType | null
  onSuccess: () => void
  onCancel: () => void
}
 
export function ContractTypeForm({ initialData, onSuccess, onCancel }: Props) {
  const { register, handleSubmit, watch, formState: { errors } } = useForm<ContractTypeFormData>({
    defaultValues: initialData ? {
      ...initialData,
      description: initialData.description ?? undefined,
      duration_months: initialData.duration_months ?? undefined,
    } : {
      code: '',
      name: '',
      description: '',
      duration_months: 12,
      is_permanent: false,
      status: 'active'
    }
  })
 
  const isPermanent = watch('is_permanent')
 
  const mutation = useMutation({
    mutationFn: (data: ContractTypeFormData) => 
      initialData 
        ? contractTypeService.update(initialData.id, data)
        : contractTypeService.create(data),
    onSuccess
  })
 
  const onSubmit = (data: ContractTypeFormData) => {
    if (data.is_permanent) {
      data.duration_months = undefined
    }
    mutation.mutate(data)
  }
 
  return (
    <form onSubmit={handleSubmit(onSubmit as any)} className="space-y-4">
      <Input
        label="Mã loại hợp đồng *"
        {...register('code', { required: 'Vui lòng nhập mã' })}
        error={errors.code?.message}
        disabled={!!initialData}
      />
 
      <Input
        label="Tên loại hợp đồng *"
        {...register('name', { required: 'Vui lòng nhập tên' })}
        error={errors.name?.message}
      />
 
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="is_permanent"
          {...register('is_permanent')}
          className="rounded"
        />
        <label htmlFor="is_permanent">Hợp đồng không xác định thời hạn</label>
      </div>
 
      {!isPermanent && (
        <Input
          label="Thời hạn (tháng)"
          type="number"
          {...register('duration_months', { valueAsNumber: true })}
        />
      )}
 
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
