// src/features/tasks/components/TaskForm.tsx
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Input, Select, Button, DatePicker } from '../../../components/ui'
import type { Task, CreateTaskInput } from '../../../types'
 
const taskSchema = z.object({
  name: z.string().min(1, 'Tên công việc là bắt buộc'),
  description: z.string().optional(),
  department_id: z.string().optional(),
  assigner_id: z.string().optional(),
  assignee_id: z.string().optional(),
  parent_task_id: z.string().optional(),
  start_date: z.string().optional(),
  due_date: z.string().optional(),
  status: z.enum(['new', 'in_progress', 'pending_review', 
                  'completed', 'cancelled', 'on_hold']),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
  notes: z.string().optional(),
})
 
type TaskFormData = z.infer<typeof taskSchema>
 
interface TaskFormProps {
  task?: Task
  departments: { id: string; name: string }[]
  employees: { id: string; full_name: string }[]
  parentTasks?: { id: string; code: string; name: string }[]
  onSubmit: (data: CreateTaskInput) => void
  onCancel: () => void
  isLoading?: boolean
}
 
export function TaskForm({
  task,
  departments,
  employees,
  parentTasks = [],
  onSubmit,
  onCancel,
  isLoading
}: TaskFormProps) {
  const { register, handleSubmit, formState: { errors } } = useForm<TaskFormData>({
    resolver: zodResolver(taskSchema),
    defaultValues: {
      name: task?.name || '',
      description: task?.description || '',
      department_id: task?.department_id || '',
      assigner_id: task?.assigner_id || '',
      assignee_id: task?.assignee_id || '',
      parent_task_id: task?.parent_task_id || '',
      start_date: task?.start_date?.slice(0, 16) || '',
      due_date: task?.due_date?.slice(0, 16) || '',
      status: task?.status || 'new',
      priority: task?.priority || 'medium',
      notes: task?.notes || '',
    }
  })
 
  const onFormSubmit = (data: TaskFormData) => {
    onSubmit({
      ...data,
      department_id: data.department_id || undefined,
      assigner_id: data.assigner_id || undefined,
      assignee_id: data.assignee_id || undefined,
      parent_task_id: data.parent_task_id || undefined,
      start_date: data.start_date || undefined,
      due_date: data.due_date || undefined,
    })
  }
 
  return (
    <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <Input
            label="Tên công việc *"
            {...register('name')}
            error={errors.name?.message}
          />
        </div>
 
        <Select
          label="Phòng ban"
          {...register('department_id')}
          options={[
            { value: '', label: '-- Chọn phòng ban --' },
            ...departments.map(d => ({ value: d.id, label: d.name }))
          ]}
        />
 
        <Select
          label="Công việc cha"
          {...register('parent_task_id')}
          options={[
            { value: '', label: '-- Không có --' },
            ...parentTasks.map(t => ({ 
              value: t.id, 
              label: `${t.code} - ${t.name}` 
            }))
          ]}
        />
 
        <Select
          label="Người giao việc"
          {...register('assigner_id')}
          options={[
            { value: '', label: '-- Chọn người giao --' },
            ...employees.map(e => ({ value: e.id, label: e.full_name }))
          ]}
        />
 
        <Select
          label="Người phụ trách"
          {...register('assignee_id')}
          options={[
            { value: '', label: '-- Chọn người phụ trách --' },
            ...employees.map(e => ({ value: e.id, label: e.full_name }))
          ]}
        />
 
        <DatePicker label="Ngày bắt đầu" {...register('start_date')} />
        <DatePicker label="Ngày kết thúc" {...register('due_date')} />
 
        <Select
          label="Trạng thái"
          {...register('status')}
          options={[
            { value: 'new', label: 'Mới' },
            { value: 'in_progress', label: 'Đang làm' },
            { value: 'pending_review', label: 'Chờ duyệt' },
            { value: 'completed', label: 'Hoàn thành' },
            { value: 'cancelled', label: 'Đã hủy' },
            { value: 'on_hold', label: 'Tạm dừng' },
          ]}
        />
 
        <Select
          label="Độ ưu tiên"
          {...register('priority')}
          options={[
            { value: 'low', label: 'Thấp' },
            { value: 'medium', label: 'Trung bình' },
            { value: 'high', label: 'Cao' },
            { value: 'urgent', label: 'Khẩn cấp' },
          ]}
        />
 
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Mô tả
          </label>
          <textarea
            {...register('description')}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg 
                       focus:ring-2 focus:ring-primary"
          />
        </div>
 
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Ghi chú
          </label>
          <textarea
            {...register('notes')}
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg 
                       focus:ring-2 focus:ring-primary"
          />
        </div>
      </div>
 
      <div className="flex justify-end gap-3 pt-4 border-t">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Hủy
        </Button>
        <Button type="submit" isLoading={isLoading}>
          {task ? 'Cập nhật' : 'Tạo công việc'}
        </Button>
      </div>
    </form>
  )
}
