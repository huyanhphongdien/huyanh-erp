import { useQuery } from '@tanstack/react-query'
import { payrollService } from '../../services'
import { Button, Card } from '../../components/ui'

interface Props {
  payslipId: string
  onClose: () => void
}

export function PayslipDetail({ payslipId, onClose }: Props) {
  const { data: payslip, isLoading } = useQuery({
    queryKey: ['payslip', payslipId],
    queryFn: () => payrollService.getPayslipById(payslipId)
  })

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value)
  }

  if (isLoading) return <div className="p-4 text-center">Đang tải...</div>
  if (!payslip) return <div className="p-4 text-center">Không tìm thấy phiếu lương</div>

  return (
    <div className="space-y-6">
      {/* Thông tin nhân viên */}
      <Card className="p-4">
        <h3 className="font-semibold mb-3 text-gray-700">Thông tin nhân viên</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-500">Mã NV:</span>
            <span className="ml-2 font-medium">{payslip.employee_code}</span>
          </div>
          <div>
            <span className="text-gray-500">Họ tên:</span>
            <span className="ml-2 font-medium">{payslip.employee_name}</span>
          </div>
          <div>
            <span className="text-gray-500">Phòng ban:</span>
            <span className="ml-2">{payslip.department_name || '-'}</span>
          </div>
          <div>
            <span className="text-gray-500">Chức vụ:</span>
            <span className="ml-2">{payslip.position_name || '-'}</span>
          </div>
          <div>
            <span className="text-gray-500">Bậc lương:</span>
            <span className="ml-2">{payslip.salary_grade_name || '-'}</span>
          </div>
        </div>
      </Card>

      {/* Ngày công */}
      <Card className="p-4">
        <h3 className="font-semibold mb-3 text-gray-700">Ngày công</h3>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <span className="text-gray-500">Ngày công chuẩn:</span>
            <span className="ml-2 font-medium">{payslip.working_days}</span>
          </div>
          <div>
            <span className="text-gray-500">Ngày công thực tế:</span>
            <span className="ml-2 font-medium">{payslip.actual_days}</span>
          </div>
          <div>
            <span className="text-gray-500">Ngày nghỉ phép:</span>
            <span className="ml-2">{payslip.leave_days}</span>
          </div>
          <div>
            <span className="text-gray-500">Nghỉ không lương:</span>
            <span className="ml-2">{payslip.unpaid_leave_days}</span>
          </div>
          <div>
            <span className="text-gray-500">Giờ tăng ca:</span>
            <span className="ml-2">{payslip.overtime_hours}</span>
          </div>
        </div>
      </Card>

      {/* Thu nhập */}
      <Card className="p-4">
        <h3 className="font-semibold mb-3 text-green-600">Thu nhập</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span>Lương cơ bản</span>
            <span className="font-medium">{formatCurrency(payslip.base_salary)}</span>
          </div>
          <div className="flex justify-between">
            <span>Phụ cấp</span>
            <span>{formatCurrency(payslip.allowances)}</span>
          </div>
          <div className="flex justify-between">
            <span>Tiền tăng ca</span>
            <span>{formatCurrency(payslip.overtime_pay)}</span>
          </div>
          <div className="flex justify-between">
            <span>Thưởng</span>
            <span>{formatCurrency(payslip.bonus)}</span>
          </div>
          <div className="flex justify-between">
            <span>Thu nhập khác</span>
            <span>{formatCurrency(payslip.other_income)}</span>
          </div>
          <div className="flex justify-between border-t pt-2 font-semibold">
            <span>Tổng thu nhập</span>
            <span className="text-green-600">{formatCurrency(payslip.gross_salary)}</span>
          </div>
        </div>
      </Card>

      {/* Khấu trừ */}
      <Card className="p-4">
        <h3 className="font-semibold mb-3 text-red-600">Khấu trừ</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span>BHXH (8%)</span>
            <span>{formatCurrency(payslip.social_insurance)}</span>
          </div>
          <div className="flex justify-between">
            <span>BHYT (1.5%)</span>
            <span>{formatCurrency(payslip.health_insurance)}</span>
          </div>
          <div className="flex justify-between">
            <span>BHTN (1%)</span>
            <span>{formatCurrency(payslip.unemployment_insurance)}</span>
          </div>
          <div className="flex justify-between">
            <span>Thuế TNCN</span>
            <span>{formatCurrency(payslip.personal_income_tax)}</span>
          </div>
          <div className="flex justify-between">
            <span>Khấu trừ khác</span>
            <span>{formatCurrency(payslip.other_deductions)}</span>
          </div>
          <div className="flex justify-between border-t pt-2 font-semibold">
            <span>Tổng khấu trừ</span>
            <span className="text-red-600">{formatCurrency(payslip.total_deductions)}</span>
          </div>
        </div>
      </Card>

      {/* Thực lĩnh */}
      <Card className="p-4 bg-blue-50">
        <div className="flex justify-between items-center">
          <span className="text-lg font-semibold">THỰC LĨNH</span>
          <span className="text-2xl font-bold text-blue-600">{formatCurrency(payslip.net_salary)}</span>
        </div>
      </Card>

      <div className="flex justify-end">
        <Button variant="outline" onClick={onClose}>Đóng</Button>
      </div>
    </div>
  )
}