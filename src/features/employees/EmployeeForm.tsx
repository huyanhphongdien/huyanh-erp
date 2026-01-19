import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useQuery, useMutation } from '@tanstack/react-query'
import { employeeService, departmentService, positionService } from '../../services'
import { Button, Input, Select } from '../../components/ui'
import type { Employee, EmployeeFormData } from '../../types'
 
interface EmployeeFormProps {
  employee?: Employee | null
  onSuccess: () => void
  onCancel: () => void
}
 
export function EmployeeForm({ employee, onSuccess, onCancel }: EmployeeFormProps) {
  const isEdit = !!employee
 
  const { register, handleSubmit, setValue, formState: { errors } } = useForm<EmployeeFormData>({
    defaultValues: employee || {
      code: '',
      full_name: '',
      date_of_birth: '',
      gender: 'male',
      phone: '',
      email: '',
      department_id: '',
      position_id: '',
      hire_date: '',
      status: 'active'
    }
  })
 
  // Query danh sách phòng ban và chức vụ
  const { data: departments } = useQuery({
    queryKey: ['departments-active'],
    queryFn: departmentService.getAllActive
  })
 
  const { data: positions } = useQuery({
    queryKey: ['positions-active'],
    queryFn: positionService.getAllActive
  })
 
  // Tự động sinh mã NV nếu thêm mới
  useEffect(() => {
    if (!isEdit) {
      employeeService.generateCode().then(code => setValue('code', code))
    }
  }, [isEdit, setValue])
 
  const mutation = useMutation({
    mutationFn: (data: EmployeeFormData) => 
      isEdit 
        ? employeeService.update(employee!.id, data)
        : employeeService.create(data),
    onSuccess
  })
 
  const onSubmit = (data: EmployeeFormData) => {
    mutation.mutate(data)
  }
 
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Mã nhân viên *"
          {...register('code', { required: 'Vui lòng nhập mã' })}
          error={errors.code?.message}
          disabled={isEdit}
        />
        <Input
          label="Họ và tên *"
          {...register('full_name', { required: 'Vui lòng nhập họ tên' })}
          error={errors.full_name?.message}
        />
      </div>
 
      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Ngày sinh"
          type="date"
          {...register('date_of_birth')}
        />
        <Select
          label="Giới tính"
          {...register('gender')}
          options={[
            { value: 'male', label: 'Nam' },
            { value: 'female', label: 'Nữ' },
            { value: 'other', label: 'Khác' }
          ]}
        />
      </div>
 
      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Số điện thoại"
          {...register('phone')}
        />
        <Input
          label="Email"
          type="email"
          {...register('email')}
        />
      </div>
 
      <div className="grid grid-cols-2 gap-4">
        <Select
          label="Phòng ban"
          {...register('department_id')}
          options={[
            { value: '', label: '-- Chọn phòng ban --' },
            ...(departments?.map(d => ({ value: d.id, label: d.name })) || [])
          ]}
        />
        <Select
          label="Chức vụ"
          {...register('position_id')}
          options={[
            { value: '', label: '-- Chọn chức vụ --' },
            ...(positions?.map(p => ({ value: p.id, label: p.name })) || [])
          ]}
        />
      </div>
 
      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Ngày vào làm"
          type="date"
          {...register('hire_date')}
        />
        <Select
          label="Trạng thái"
          {...register('status')}
          options={[
            { value: 'active', label: 'Đang làm việc' },
            { value: 'inactive', label: 'Tạm nghỉ' },
            { value: 'terminated', label: 'Đã nghỉ việc' }
          ]}
        />
      </div>
 
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
