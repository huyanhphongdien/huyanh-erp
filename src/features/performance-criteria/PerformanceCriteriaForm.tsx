import { useForm } from 'react-hook-form'
import { useMutation } from '@tanstack/react-query'
import { performanceService } from '../../services'
import { Button, Input, Select } from '../../components/ui'

// Define types inline
interface PerformanceCriteria {
  id: string
  code: string
  name: string
  description?: string
  category?: string
  weight?: number
  max_score?: number
  is_required?: boolean
  status?: string
  sort_order?: number
}

interface PerformanceCriteriaFormData {
  code: string
  name: string
  description?: string
  category?: string
  weight?: number
  max_score?: number
  is_required?: boolean
  status?: string
  sort_order?: number
}

interface Props {
  initialData?: PerformanceCriteria | null
  onSuccess: () => void
  onCancel: () => void
}

// Helper function để convert sang form data
function toFormData(data: PerformanceCriteria | null | undefined): PerformanceCriteriaFormData {
  if (!data) {
    return {
      code: '',
      name: '',
      description: '',
      category: 'work_quality',
      weight: 20,
      max_score: 5,
      is_required: true,
      status: 'active',
      sort_order: 0
    }
  }
  return {
    code: data.code ?? '',
    name: data.name ?? '',
    description: data.description ?? '',
    category: data.category ?? 'work_quality',
    weight: data.weight ?? 20,
    max_score: data.max_score ?? 5,
    is_required: data.is_required ?? true,
    status: data.status ?? 'active',
    sort_order: data.sort_order ?? 0
  }
}

export function PerformanceCriteriaForm({ initialData, onSuccess, onCancel }: Props) {
  const { register, handleSubmit, formState: { errors } } = useForm<PerformanceCriteriaFormData>({
    defaultValues: toFormData(initialData)
  })

  const mutation = useMutation({
    mutationFn: (data: PerformanceCriteriaFormData) => 
      initialData 
        ? performanceService.updateCriteria(initialData.id, data as any)
        : performanceService.createCriteria(data as any),
    onSuccess
  })

  return (
    <form onSubmit={handleSubmit(data => mutation.mutate(data))} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Mã tiêu chí *"
          {...register('code', { required: 'Vui lòng nhập mã' })}
          error={errors.code?.message}
          disabled={!!initialData}
        />
        <Select
          label="Nhóm"
          {...register('category')}
          options={[
            { value: 'work_quality', label: 'Chất lượng công việc' },
            { value: 'attitude', label: 'Thái độ làm việc' },
            { value: 'skill', label: 'Kỹ năng' },
            { value: 'teamwork', label: 'Làm việc nhóm' },
            { value: 'initiative', label: 'Sáng kiến' }
          ]}
        />
      </div>

      <Input
        label="Tên tiêu chí *"
        {...register('name', { required: 'Vui lòng nhập tên' })}
        error={errors.name?.message}
      />

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Mô tả</label>
        <textarea
          {...register('description')}
          rows={2}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Input
          label="Trọng số (%) *"
          type="number"
          {...register('weight', { required: true, valueAsNumber: true })}
        />
        <Input
          label="Điểm tối đa"
          type="number"
          {...register('max_score', { valueAsNumber: true })}
        />
        <Input
          label="Thứ tự"
          type="number"
          {...register('sort_order', { valueAsNumber: true })}
        />
      </div>

      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2">
          <input 
            type="checkbox" 
            {...register('is_required')} 
            className="rounded border-gray-300"
          />
          <span className="text-sm">Bắt buộc</span>
        </label>
      </div>

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
          Có lỗi xảy ra: {(mutation.error as Error)?.message || 'Không thể lưu tiêu chí'}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>Hủy</Button>
        <Button type="submit" isLoading={mutation.isPending}>
          {initialData ? 'Cập nhật' : 'Thêm mới'}
        </Button>
      </div>
    </form>
  )
}