import { useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { useQuery, useMutation } from '@tanstack/react-query'
import { InputNumber } from 'antd'
import { contractService, contractTypeService, employeeService, LABOR_CONTRACT_STATUS_LABELS } from '../../services'
import { Button, Input, Select } from '../../components/ui'
import { EmployeePicker } from '../employees/EmployeePicker'
import { vndInputProps } from '../../utils/format'
import { toDateStrVN } from '../../utils/dateVN'
import { dichLoiHeThong } from '../../utils/dichLoiHeThong'
import type { Contract, ContractFormData } from '../../types'

interface Props {
  initialData?: Contract | null
  employeeId?: string // Pre-select employee
  onSuccess: () => void
  onCancel: () => void
}

// Ô tiền VND của form (chấm ngăn nghìn)
type MoneyFieldName = 'base_salary' | 'allowance_lunch' | 'allowance_transport' | 'allowance_phone' | 'allowance_housing' | 'allowance_other'

// Bản ghi đọc bằng select('*') có ĐỦ cột của bảng contracts — kiểu Contract chung khai thiếu phụ cấp / chức danh / nơi làm.
type ContractRow = Contract & {
  salary_currency?: string | null
  allowance_lunch?: number | null
  allowance_transport?: number | null
  allowance_phone?: number | null
  allowance_housing?: number | null
  allowance_other?: number | null
  job_title?: string | null
  work_location?: string | null
  working_hours?: string | null
}

// Helper: Convert Contract (with nulls) to ContractFormData (with undefined)
// ⚠ Nạp ĐỦ mọi cột có ô trên form: ô register() thiếu giá trị đầu đọc '' từ DOM → bấm Cập nhật là ghi '' đè chức danh /
// nơi làm / giờ làm đã lưu; ô tiền (Controller) thiếu giá trị đầu thì hiện TRỐNG dù HĐ có phụ cấp. Chỉ map cột THẬT
// của bảng (code / signed_date / sign_date / salary / allowances / benefits không có trong bảng contracts).
function contractToFormData(contract: ContractRow): Partial<ContractFormData> {
  return {
    employee_id: contract.employee_id,
    contract_type_id: contract.contract_type_id,
    contract_number: contract.contract_number ?? undefined,
    start_date: contract.start_date,
    end_date: contract.end_date ?? '',
    base_salary: contract.base_salary ?? undefined,
    salary_currency: contract.salary_currency ?? undefined,
    allowance_lunch: contract.allowance_lunch ?? undefined,
    allowance_transport: contract.allowance_transport ?? undefined,
    allowance_phone: contract.allowance_phone ?? undefined,
    allowance_housing: contract.allowance_housing ?? undefined,
    allowance_other: contract.allowance_other ?? undefined,
    job_title: contract.job_title ?? '',
    work_location: contract.work_location ?? '',
    working_hours: contract.working_hours ?? '',
    status: contract.status ?? undefined,
    notes: contract.notes ?? '',
  }
}

export function ContractForm({ initialData, employeeId, onSuccess, onCancel }: Props) {
  const { register, control, handleSubmit, watch, setValue, formState: { errors } } = useForm<ContractFormData>({
    defaultValues: initialData
      ? contractToFormData(initialData)
      : {
          contract_number: '',
          employee_id: employeeId || '',
          contract_type_id: '',
          start_date: new Date().toLocaleDateString('sv-SE'),
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
  // Sửa HĐ của NV đã nghỉ (không còn trong danh sách active) → vẫn hiện đúng tên, không hiện mã UUID
  const currentEmp = initialData?.employee
  const employeeOptions = currentEmp && !(employees?.data || []).some(e => e.id === currentEmp.id)
    ? [...(employees?.data || []), currentEmp]
    : (employees?.data || [])

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
    // Sửa HĐ: chỉ tự tính lại khi người dùng ĐỔI loại HĐ / ngày bắt đầu — mở form ra thì giữ ngày kết thúc đã lưu
    // (trước đây vừa mở form là ngày kết thúc bị tính lại đè mất, bấm Cập nhật là ghi luôn).
    if (initialData && contractTypeId === initialData.contract_type_id && startDate === initialData.start_date) return
    if (contractTypeId && startDate && contractTypes) {
      const selectedType = contractTypes.find(t => t.id === contractTypeId)
      // FIX: Use is_renewable instead of is_permanent
      // is_renewable === false means permanent contract (no end date)
      if (selectedType && selectedType.is_renewable !== false && selectedType.duration_months) {
        // Cộng tháng theo LỊCH rồi toDateStrVN — không đi qua toISOString (UTC)
        const [y, m, d] = startDate.split('-').map(Number)
        setValue('end_date', toDateStrVN(new Date(y, m - 1 + selectedType.duration_months, d)))
      } else if (selectedType?.is_renewable === false) {
        // Permanent contract - no end date
        setValue('end_date', '')
      }
    }
  }, [contractTypeId, startDate, contractTypes, setValue, initialData])

  const mutation = useMutation({
    mutationFn: (data: ContractFormData) => {
      // Ensure required fields for create
      const submitData = {
        ...data,
        contract_number: data.contract_number || '',
        employee_id: data.employee_id,
        contract_type_id: data.contract_type_id,
        start_date: data.start_date,
        // HĐ không thời hạn: ô ngày kết thúc trống → NULL. Gửi '' vào cột date là Postgres từ chối (22007) — lưu hỏng.
        end_date: data.end_date || null,
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

  // Ô tiền VND — antd InputNumber chấm ngăn nghìn (thay input type=number không ngăn nghìn)
  const moneyField = (name: MoneyFieldName, label: string, required = false) => (
    <div className="w-full">
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <Controller
        name={name}
        control={control}
        rules={required ? { required: 'Vui lòng nhập lương' } : undefined}
        render={({ field }) => (
          <InputNumber
            {...vndInputProps}
            min={0}
            value={field.value ?? null}
            onChange={(v) => field.onChange(v ?? undefined)}
            onBlur={field.onBlur}
            suffix="₫"
            size="large"
            status={errors[name] ? 'error' : undefined}
            style={{ width: '100%' }}
          />
        )}
      />
      {errors[name] && (
        <p className="mt-1 text-sm text-danger">{errors[name]?.message}</p>
      )}
    </div>
  )

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Số hợp đồng *"
          {...register('contract_number', { required: 'Vui lòng nhập số hợp đồng' })}
          error={errors.contract_number?.message}
          disabled={!!initialData}
        />

        <div className="w-full">
          <label className="block text-sm font-medium text-gray-700 mb-1">Nhân viên *</label>
          {/* Gõ tên/mã để tìm (không dấu cũng được) — thay <select> native 1000 dòng */}
          <Controller
            name="employee_id"
            control={control}
            rules={{ required: 'Vui lòng chọn nhân viên' }}
            render={({ field }) => (
              <EmployeePicker
                employees={employeeOptions}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                disabled={!!employeeId || !!initialData}
                invalid={!!errors.employee_id}
                size="large"
              />
            )}
          />
          {errors.employee_id && (
            <p className="mt-1 text-sm text-danger">{errors.employee_id.message}</p>
          )}
        </div>

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
          options={Object.entries(LABOR_CONTRACT_STATUS_LABELS).map(([value, label]) => ({ value, label }))}
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
        {moneyField('base_salary', 'Lương cơ bản *', true)}
        {moneyField('allowance_lunch', 'Phụ cấp ăn trưa')}
        {moneyField('allowance_transport', 'Phụ cấp đi lại')}
        {moneyField('allowance_phone', 'Phụ cấp điện thoại')}
        {moneyField('allowance_housing', 'Phụ cấp nhà ở')}
        {moneyField('allowance_other', 'Phụ cấp khác')}
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

      {mutation.isError && (
        <p className="text-sm text-danger">{dichLoiHeThong(mutation.error, 'Lưu hợp đồng thất bại')}</p>
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
