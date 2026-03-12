import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useQuery, useMutation } from '@tanstack/react-query'
import { contractService, contractTypeService, employeeService } from '../../services'
import { Button, Input, Select } from '../../components/ui'
import type { Contract, ContractFormData } from '../../types'
 
interface Props {
  initialData?: Contract | null
  employeeId?: string // Pre-select employee
  onSuccess: () => void
  onCancel: () => void
}

// Helper: Convert Contract (with nulls) to ContractFormData (with undefined)
function contractToFormData(contract: Contract): Partial<ContractFormData> {
  return {
    employee_id: contract.employee_id,
    contract_type_id: contract.contract_type_id,
    contract_number: contract.contract_number ?? undefined,
    code: contract.code ?? undefined,
    start_date: contract.start_date,
    end_date: contract.end_date ?? undefined,
    signed_date: contract.signed_date ?? undefined,
    sign_date: contract.sign_date ?? undefined,
    salary: contract.salary ?? undefined,
    base_salary: contract.base_salary ?? undefined,
    allowances: contract.allowances ?? undefined,
    benefits: contract.benefits ?? undefined,
    status: contract.status ?? undefined,
    notes: contract.notes ?? undefined,
  }
}
 
export function ContractForm({ initialData, employeeId, onSuccess, onCancel }: Props) {
  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<ContractFormData>({
    defaultValues: initialData 
      ? contractToFormData(initialData)
      : {
          contract_number: '',
          employee_id: employeeId || '',
          contract_type_id: '',
          start_date: new Date().toISOString().split('T')[0],
          end_date: '',
          base_salary: 0,
          salary_currency: 'VND',
          allowance_lunch: 0,
          allowance_transport: 0,
          allowance_phone: 0,
          allowance_housing: 0,
          allowance_other: 0,
          job_title: '',
          work_location: 'Huy Anh Rubber',
          working_hours: '8:00 - 17:00',
          status: 'active',
          notes: ''
        }
  })
 
  // Load employees for dropdown
  const { data: employees } = useQuery({
    queryKey: ['employees-active'],
    queryFn: () => employeeService.getAll({ page: 1, pageSize: 1000, status: 'active' })
  })
 
  // Load contract types for dropdown
  const { data: contractTypes } = useQuery({
    queryKey: ['contract-types-active'],
    queryFn: contractTypeService.getAllActive
  })
 
  // Generate contract number
  useEffect(() => {
    if (!initialData) {
      contractService.generateContractNumber().then(num => {
        setValue('contract_number', num)
      })
    }
  }, [initialData, setValue])
 
  // Auto calculate end_date based on contract type
  const contractTypeId = watch('contract_type_id')
  const startDate = watch('start_date')
 
  useEffect(() => {
    if (contractTypeId && startDate && contractTypes) {
      const selectedType = contractTypes.find(t => t.id === contractTypeId)
      // FIX: Use is_renewable instead of is_permanent
      // is_renewable === false means permanent contract (no end date)
      if (selectedType && selectedType.is_renewable !== false && selectedType.duration_months) {
        const start = new Date(startDate)
        start.setMonth(start.getMonth() + selectedType.duration_months)
        setValue('end_date', start.toISOString().split('T')[0])
      } else if (selectedType?.is_renewable === false) {
        // Permanent contract - no end date
        setValue('end_date', '')
      }
    }
  }, [contractTypeId, startDate, contractTypes, setValue])
 
  const mutation = useMutation({
    mutationFn: (data: ContractFormData) => {
      // Ensure required fields for create
      const submitData = {
        ...data,
        contract_number: data.contract_number || '',
        employee_id: data.employee_id,
        contract_type_id: data.contract_type_id,
        start_date: data.start_date,
      }
      return initialData 
        ? contractService.update(initialData.id, submitData)
        : contractService.create(submitData as any)
    },
    onSuccess
  })
 
  const onSubmit = (data: ContractFormData) => {
    mutation.mutate(data)
  }
 
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Số hợp đồng *"
          {...register('contract_number', { required: 'Vui lòng nhập số hợp đồng' })}
          error={errors.contract_number?.message}
          disabled={!!initialData}
        />
 
        <Select
          label="Nhân viên *"
          {...register('employee_id', { required: 'Vui lòng chọn nhân viên' })}
          error={errors.employee_id?.message}
          disabled={!!employeeId || !!initialData}
          options={[
            { value: '', label: '-- Chọn nhân viên --' },
            ...(employees?.data || []).map(e => ({ 
              value: e.id, 
              label: `${e.code} - ${e.full_name}` 
            }))
          ]}
        />
 
        <Select
          label="Loại hợp đồng *"
          {...register('contract_type_id', { required: 'Vui lòng chọn loại hợp đồng' })}
          error={errors.contract_type_id?.message}
          options={[
            { value: '', label: '-- Chọn loại hợp đồng --' },
            ...(contractTypes || []).map(t => ({ value: t.id, label: t.name }))
          ]}
        />
 
        <Select
          label="Trạng thái"
          {...register('status')}
          options={[
            { value: 'active', label: 'Đang hiệu lực' },
            { value: 'expired', label: 'Hết hạn' },
            { value: 'terminated', label: 'Chấm dứt' },
            { value: 'renewed', label: 'Đã gia hạn' }
          ]}
        />
 
        <Input
          label="Ngày bắt đầu *"
          type="date"
          {...register('start_date', { required: 'Vui lòng chọn ngày' })}
          error={errors.start_date?.message}
        />
 
        <Input
          label="Ngày kết thúc"
          type="date"
          {...register('end_date')}
        />
      </div>
 
      <hr className="my-4" />
      <h3 className="font-semibold">Thông tin lương</h3>
 
      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Lương cơ bản *"
          type="number"
          {...register('base_salary', { 
            required: 'Vui lòng nhập lương',
            valueAsNumber: true 
          })}
          error={errors.base_salary?.message}
        />
 
        <Input
          label="Phụ cấp ăn trưa"
          type="number"
          {...register('allowance_lunch', { valueAsNumber: true })}
        />
 
        <Input
          label="Phụ cấp đi lại"
          type="number"
          {...register('allowance_transport', { valueAsNumber: true })}
        />
 
        <Input
          label="Phụ cấp điện thoại"
          type="number"
          {...register('allowance_phone', { valueAsNumber: true })}
        />
 
        <Input
          label="Phụ cấp nhà ở"
          type="number"
          {...register('allowance_housing', { valueAsNumber: true })}
        />
 
        <Input
          label="Phụ cấp khác"
          type="number"
          {...register('allowance_other', { valueAsNumber: true })}
        />
      </div>
 
      <hr className="my-4" />
      <h3 className="font-semibold">Thông tin công việc</h3>
 
      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Chức danh"
          {...register('job_title')}
        />
 
        <Input
          label="Địa điểm làm việc"
          {...register('work_location')}
        />
 
        <Input
          label="Giờ làm việc"
          {...register('working_hours')}
          placeholder="VD: 8:00 - 17:00"
        />
      </div>
 
      <Input
        label="Ghi chú"
        {...register('notes')}
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