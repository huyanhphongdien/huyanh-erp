import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { payrollService } from '../../services'
import { Button, Input, Select, Card, Pagination, Modal } from '../../components/ui'
import { PayslipDetail } from './PayslipDetail'

// Define Payslip type inline
interface Payslip {
  id: string
  payslip_number: string
  employee_id: string
  employee_code?: string
  employee_name?: string
  department_name?: string
  payroll_period?: {
    id: string
    name: string
  }
  gross_salary: number
  total_deductions: number
  net_salary: number
  status: string
}

const statusLabels: Record<string, { label: string; color: string }> = {
  draft: { label: 'Nháp', color: 'bg-gray-100 text-gray-800' },
  confirmed: { label: 'Đã xác nhận', color: 'bg-green-100 text-green-800' },
  paid: { label: 'Đã trả', color: 'bg-blue-100 text-blue-800' }
}

export function PayslipListPage() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [selectedPayslip, setSelectedPayslip] = useState<Payslip | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['payslips', page, search, statusFilter],
    queryFn: () => payrollService.getPayslips({ 
      page, 
      pageSize: 10, 
      search: search || undefined,
      status: statusFilter || undefined 
    })
  })

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value)
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Phiếu lương</h1>
      </div>

      <Card>
        <div className="p-4 border-b flex gap-4">
          <Input
            placeholder="Tìm kiếm mã phiếu, tên NV..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="w-64"
          />
          <Select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
            options={[
              { value: '', label: 'Tất cả trạng thái' },
              { value: 'draft', label: 'Nháp' },
              { value: 'confirmed', label: 'Đã xác nhận' },
              { value: 'paid', label: 'Đã trả' }
            ]}
            className="w-48"
          />
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Mã phiếu</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Nhân viên</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Phòng ban</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Kỳ lương</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">Tổng thu nhập</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">Khấu trừ</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">Thực lĩnh</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">TT</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-gray-500">
                    Đang tải...
                  </td>
                </tr>
              ) : !data?.data?.length ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-gray-500">
                    Chưa có phiếu lương nào
                  </td>
                </tr>
              ) : (
                data.data.map((item: Payslip) => {
                  const statusInfo = statusLabels[item.status] || statusLabels.draft
                  return (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium">{item.payslip_number}</td>
                      <td className="px-4 py-3 text-sm">
                        {item.employee_code} - {item.employee_name}
                      </td>
                      <td className="px-4 py-3 text-sm">{item.department_name || '-'}</td>
                      <td className="px-4 py-3 text-sm">{item.payroll_period?.name || '-'}</td>
                      <td className="px-4 py-3 text-sm text-right">{formatCurrency(item.gross_salary)}</td>
                      <td className="px-4 py-3 text-sm text-right text-red-600">
                        -{formatCurrency(item.total_deductions)}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-semibold text-green-600">
                        {formatCurrency(item.net_salary)}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span className={`px-2 py-1 rounded text-xs ${statusInfo.color}`}>
                          {statusInfo.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <Button 
                          size="sm" 
                          variant="outline" 
                          onClick={() => setSelectedPayslip(item)}
                        >
                          Xem
                        </Button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {data && data.totalPages > 1 && (
          <div className="p-4 border-t">
            <Pagination 
              currentPage={page} 
              totalPages={data.totalPages} 
              onPageChange={setPage} 
            />
          </div>
        )}
      </Card>

      <Modal
        isOpen={!!selectedPayslip}
        onClose={() => setSelectedPayslip(null)}
        title={`Phiếu lương: ${selectedPayslip?.payslip_number || ''}`}
        size="lg"
      >
        {selectedPayslip && (
          <PayslipDetail 
            payslipId={selectedPayslip.id} 
            onClose={() => setSelectedPayslip(null)} 
          />
        )}
      </Modal>
    </div>
  )
}