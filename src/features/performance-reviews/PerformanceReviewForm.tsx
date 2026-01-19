import { useForm } from 'react-hook-form'
import { useQuery, useMutation } from '@tanstack/react-query'
import { performanceService, employeeService } from '../../services'
import { Button, Input, Select, Card } from '../../components/ui'
import type { PerformanceReview, PerformanceReviewFormData } from '../../types'

interface Props {
  initialData?: PerformanceReview | null
  onSuccess: () => void
  onCancel: () => void
}

const gradeColors: Record<string, string> = {
  A: 'bg-green-500 text-white',
  B: 'bg-blue-500 text-white',
  C: 'bg-yellow-500 text-white',
  D: 'bg-orange-500 text-white',
  E: 'bg-red-500 text-white'
}

export function PerformanceReviewForm({ initialData, onSuccess, onCancel }: Props) {
  const currentYear = new Date().getFullYear()
  const currentQuarter = Math.ceil((new Date().getMonth() + 1) / 3)

  const { register, handleSubmit, formState: { errors } } = useForm<PerformanceReviewFormData>({
    defaultValues: initialData ? {
      employee_id: initialData.employee_id,
      reviewer_id: initialData.reviewer_id,
      review_period: initialData.review_period,
      period_type: initialData.period_type,
      start_date: initialData.start_date,
      end_date: initialData.end_date,
      strengths: initialData.strengths || '',
      weaknesses: initialData.weaknesses || '',
      goals: initialData.goals || '',
      reviewer_comments: initialData.reviewer_comments || ''
    } : {
      employee_id: '',
      reviewer_id: '',
      review_period: `Q${currentQuarter}-${currentYear}`,
      period_type: 'quarterly',
      start_date: '',
      end_date: '',
      strengths: '',
      weaknesses: '',
      goals: '',
      reviewer_comments: ''
    }
  })

  const { data: employees } = useQuery({
    queryKey: ['employees-active'],
    queryFn: () => employeeService.getAll({ page: 1, pageSize: 1000, status: 'active' })
  })

  const createMutation = useMutation({
    mutationFn: performanceService.createReview,
    onSuccess
  })

  // View mode for existing review
  if (initialData) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm text-gray-500">Nhân viên</label>
            <p className="font-medium">{initialData.employee?.code} - {initialData.employee?.full_name}</p>
          </div>
          <div>
            <label className="text-sm text-gray-500">Kỳ đánh giá</label>
            <p className="font-medium">{initialData.review_period}</p>
          </div>
          <div>
            <label className="text-sm text-gray-500">Điểm tổng</label>
            <p className="font-medium text-lg">{initialData.total_score?.toFixed(1) || '-'}</p>
          </div>
          <div>
            <label className="text-sm text-gray-500">Xếp loại</label>
            {initialData.grade ? (
              <span className={`inline-block px-3 py-1 rounded text-sm font-bold ${gradeColors[initialData.grade] || ''}`}>
                {initialData.grade}
              </span>
            ) : <p>-</p>}
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

        {/* Chi tiết điểm */}
        {initialData.scores && initialData.scores.length > 0 && (
          <Card className="p-4">
            <h3 className="font-semibold mb-3">Chi tiết điểm</h3>
            <div className="space-y-2">
              {initialData.scores.map(s => (
                <div key={s.id} className="flex justify-between text-sm">
                  <span>{s.criteria?.name}</span>
                  <span className="font-medium">{s.score}/{s.criteria?.max_score}</span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {initialData.strengths && (
          <div>
            <label className="text-sm text-gray-500">Điểm mạnh</label>
            <p className="p-2 bg-green-50 rounded">{initialData.strengths}</p>
          </div>
        )}

        {initialData.weaknesses && (
          <div>
            <label className="text-sm text-gray-500">Điểm cần cải thiện</label>
            <p className="p-2 bg-yellow-50 rounded">{initialData.weaknesses}</p>
          </div>
        )}

        {initialData.goals && (
          <div>
            <label className="text-sm text-gray-500">Mục tiêu kỳ tới</label>
            <p className="p-2 bg-blue-50 rounded">{initialData.goals}</p>
          </div>
        )}

        {initialData.reviewer_comments && (
          <div>
            <label className="text-sm text-gray-500">Nhận xét của quản lý</label>
            <p className="p-2 bg-gray-50 rounded">{initialData.reviewer_comments}</p>
          </div>
        )}

        <div className="flex justify-end">
          <Button variant="outline" onClick={onCancel}>Đóng</Button>
        </div>
      </div>
    )
  }

  // Create mode
  return (
    <form onSubmit={handleSubmit(data => createMutation.mutate(data))} className="space-y-4">
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

      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Kỳ đánh giá *"
          placeholder="VD: Q1-2026"
          {...register('review_period', { required: 'Vui lòng nhập kỳ' })}
          error={errors.review_period?.message}
        />
        <Select
          label="Loại kỳ"
          {...register('period_type')}
          options={[
            { value: 'quarterly', label: 'Theo quý' },
            { value: 'yearly', label: 'Theo năm' }
          ]}
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

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Điểm mạnh</label>
        <textarea
          {...register('strengths')}
          rows={2}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
          placeholder="Nhập điểm mạnh của nhân viên..."
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Điểm cần cải thiện</label>
        <textarea
          {...register('weaknesses')}
          rows={2}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
          placeholder="Nhập điểm cần cải thiện..."
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Mục tiêu kỳ tới</label>
        <textarea
          {...register('goals')}
          rows={2}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
          placeholder="Nhập mục tiêu cho kỳ đánh giá tiếp theo..."
        />
      </div>

      {createMutation.isError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
          Có lỗi xảy ra: {(createMutation.error as Error)?.message || 'Không thể tạo đánh giá'}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>Hủy</Button>
        <Button type="submit" isLoading={createMutation.isPending}>Tạo đánh giá</Button>
      </div>
    </form>
  )
}