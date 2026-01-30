import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { employeeProfileService } from '../../services'
import { Button, Input, Select, Card } from '../../components/ui'
import type { EmployeeProfileFormData } from '../../types'
 
interface Props {
  employeeId: string
}
 
export function EmployeeProfileTab({ employeeId }: Props) {
  const queryClient = useQueryClient()
 
  const { data: profile, isLoading } = useQuery({
    queryKey: ['employee-profile', employeeId],
    queryFn: () => employeeProfileService.getByEmployeeId(employeeId)
  })
 
  const { register, handleSubmit, formState: { isDirty } } = useForm<EmployeeProfileFormData>({
    values: profile ? { ...profile } : { employee_id: employeeId }
  })
 
  const mutation = useMutation({
    mutationFn: (data: EmployeeProfileFormData) => 
      employeeProfileService.upsert({ ...data, employee_id: employeeId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employee-profile', employeeId] })
    }
  })
 
  if (isLoading) {
    return <div className="p-4">Đang tải...</div>
  }
 
  return (
    <form onSubmit={handleSubmit(data => mutation.mutate(data))} className="space-y-6">
      {/* CMND/CCCD */}
      <Card className="p-4">
        <h3 className="font-semibold mb-4">Thông tin CMND/CCCD</h3>
        <div className="grid grid-cols-2 gap-4">
          <Input label="Số CMND/CCCD" {...register('id_card_number')} />
          <Input label="Ngày cấp" type="date" {...register('id_card_issue_date')} />
          <Input label="Nơi cấp" {...register('id_card_issue_place')} />
          <Input label="Ngày hết hạn" type="date" {...register('id_card_expiry_date')} />
        </div>
      </Card>
 
      {/* Địa chỉ thường trú */}
      <Card className="p-4">
        <h3 className="font-semibold mb-4">Địa chỉ thường trú</h3>
        <div className="grid grid-cols-2 gap-4">
          <Input label="Tỉnh/Thành phố" {...register('permanent_province')} />
          <Input label="Quận/Huyện" {...register('permanent_district')} />
          <Input label="Phường/Xã" {...register('permanent_ward')} />
          <Input label="Địa chỉ chi tiết" {...register('permanent_address')} className="col-span-2" />
        </div>
      </Card>
 
      {/* Địa chỉ tạm trú */}
      <Card className="p-4">
        <h3 className="font-semibold mb-4">Địa chỉ tạm trú</h3>
        <div className="grid grid-cols-2 gap-4">
          <Input label="Tỉnh/Thành phố" {...register('temporary_province')} />
          <Input label="Quận/Huyện" {...register('temporary_district')} />
          <Input label="Phường/Xã" {...register('temporary_ward')} />
          <Input label="Địa chỉ chi tiết" {...register('temporary_address')} className="col-span-2" />
        </div>
      </Card>
 
      {/* Liên hệ khẩn cấp */}
      <Card className="p-4">
        <h3 className="font-semibold mb-4">Liên hệ khẩn cấp</h3>
        <div className="grid grid-cols-3 gap-4">
          <Input label="Họ tên" {...register('emergency_contact_name')} />
          <Input label="Số điện thoại" {...register('emergency_contact_phone')} />
          <Input label="Mối quan hệ" {...register('emergency_contact_relationship')} />
        </div>
      </Card>
 
      {/* Gia đình */}
      <Card className="p-4">
        <h3 className="font-semibold mb-4">Thông tin gia đình</h3>
        <div className="grid grid-cols-2 gap-4">
          <Select
            label="Tình trạng hôn nhân"
            {...register('marital_status')}
            options={[
              { value: '', label: '-- Chọn --' },
              { value: 'single', label: 'Độc thân' },
              { value: 'married', label: 'Đã kết hôn' },
              { value: 'divorced', label: 'Ly hôn' },
              { value: 'widowed', label: 'Góa' }
            ]}
          />
          <Input 
            label="Số con" 
            type="number" 
            {...register('number_of_children', { valueAsNumber: true })} 
          />
        </div>
      </Card>
 
      {/* Học vấn */}
      <Card className="p-4">
        <h3 className="font-semibold mb-4">Trình độ học vấn</h3>
        <div className="grid grid-cols-2 gap-4">
          <Select
            label="Trình độ"
            {...register('education_level')}
            options={[
              { value: '', label: '-- Chọn --' },
              { value: 'high_school', label: 'Trung học phổ thông' },
              { value: 'college', label: 'Cao đẳng' },
              { value: 'bachelor', label: 'Đại học' },
              { value: 'master', label: 'Thạc sĩ' },
              { value: 'phd', label: 'Tiến sĩ' }
            ]}
          />
          <Input 
            label="Năm tốt nghiệp" 
            type="number" 
            {...register('graduation_year', { valueAsNumber: true })} 
          />
          <Input label="Trường" {...register('school_name')} />
          <Input label="Chuyên ngành" {...register('major')} />
        </div>
      </Card>
 
      {/* Ngân hàng */}
      <Card className="p-4">
        <h3 className="font-semibold mb-4">Thông tin ngân hàng</h3>
        <div className="grid grid-cols-2 gap-4">
          <Input label="Tên ngân hàng" {...register('bank_name')} />
          <Input label="Chi nhánh" {...register('bank_branch')} />
          <Input label="Số tài khoản" {...register('bank_account_number')} />
          <Input label="Tên chủ tài khoản" {...register('bank_account_name')} />
        </div>
      </Card>
 
      {/* Bảo hiểm */}
      <Card className="p-4">
        <h3 className="font-semibold mb-4">Bảo hiểm & Thuế</h3>
        <div className="grid grid-cols-3 gap-4">
          <Input label="Số BHXH" {...register('social_insurance_number')} />
          <Input label="Số BHYT" {...register('health_insurance_number')} />
          <Input label="Mã số thuế" {...register('tax_code')} />
        </div>
      </Card>
 
      <div className="flex justify-end">
        <Button type="submit" isLoading={mutation.isPending} disabled={!isDirty}>
          Lưu thông tin
        </Button>
      </div>
    </form>
  )
}
