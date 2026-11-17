import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { App } from 'antd'
import { payrollService, PAYROLL_PERIOD_STATUS_LABELS, PAYROLL_PERIOD_STATUS_COLORS } from '../../services'
import { useAuthStore } from '../../stores/authStore'
import { Button, Select, Card, Pagination, Modal, ConfirmDialog } from '../../components/ui'
import { PayrollPeriodForm } from './PayrollPeriodForm'
import PageState from '../../components/common/PageState'
import { EnumTag } from '../../components/common/EnumTag'
import { fmtVnd } from '../../utils/format'
import { dichLoiHeThong } from '../../utils/dichLoiHeThong'
import type { PayrollPeriod } from '../../types'

export function PayrollPeriodListPage() {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const { modal, message } = App.useApp()
  const [page, setPage] = useState(1)
  const [yearFilter, setYearFilter] = useState(new Date().getFullYear())
  const [statusFilter, setStatusFilter] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedItem, setSelectedItem] = useState<PayrollPeriod | null>(null)
  const [generateId, setGenerateId] = useState<string | null>(null)

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['payroll-periods', page, yearFilter, statusFilter],
    queryFn: () => payrollService.getPeriods({ 
      page, 
      pageSize: 10, 
      year: yearFilter,
      status: statusFilter || undefined 
    })
  })

  const generateMutation = useMutation({
    mutationFn: payrollService.generatePayslips,
    onSuccess: (count) => {
      message.success(`Đã tạo ${count} phiếu lương`)
      queryClient.invalidateQueries({ queryKey: ['payroll-periods'] })
      setGenerateId(null)
    },
    onError: (error: Error) => {
      message.error(dichLoiHeThong(error, 'Tạo phiếu lương thất bại'))
      setGenerateId(null)
    }
  })

  const confirmMutation = useMutation({
    mutationFn: (id: string) => payrollService.confirmPeriod(id, user?.employee_id || ''),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payroll-periods'] })
      message.success('Đã xác nhận kỳ lương')
    },
    // Bản cũ không có onError → bấm Xác nhận lỗi là im lặng
    onError: (error: Error) => {
      message.error(dichLoiHeThong(error, 'Xác nhận kỳ lương thất bại'))
    }
  })

  // Xác nhận kỳ lương dính TIỀN → hỏi lại, nêu rõ tổng tiền + số NV
  const askConfirmPeriod = (item: PayrollPeriod) => {
    modal.confirm({
      title: `Xác nhận kỳ lương ${item.code}?`,
      content: `${item.name} — ${item.total_employees ?? 0} nhân viên, tổng ${fmtVnd(item.total_amount)}. Kỳ lương chuyển sang "${PAYROLL_PERIOD_STATUS_LABELS.confirmed}" và ghi tên bạn là người xác nhận.`,
      okText: 'Xác nhận kỳ lương',
      cancelText: 'Để sau',
      onOk: () => confirmMutation.mutateAsync(item.id).catch(() => undefined),
    })
  }

  const formatCurrency = fmtVnd

  const yearOptions = Array.from({ length: 5 }, (_, i) => {
    const y = new Date().getFullYear() - i
    return { value: y.toString(), label: y.toString() }
  })

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Quản lý kỳ lương</h1>
        <Button onClick={() => { setSelectedItem(null); setIsModalOpen(true) }}>
          + Tạo kỳ lương
        </Button>
      </div>

      <Card>
        <div className="p-4 border-b flex gap-4">
          <Select
            value={yearFilter.toString()}
            onChange={(e) => { setYearFilter(parseInt(e.target.value)); setPage(1) }}
            options={yearOptions}
            className="w-32"
          />
          <Select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
            options={[
              { value: '', label: 'Tất cả trạng thái' },
              ...Object.entries(PAYROLL_PERIOD_STATUS_LABELS).map(([value, label]) => ({ value, label }))
            ]}
            className="w-48"
          />
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Mã kỳ</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Tên kỳ lương</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Tháng/Năm</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Số NV</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Tổng lương</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Trạng thái</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                    Đang tải...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={7} className="p-0">
                    <PageState error={error} onRetry={() => refetch()} />
                  </td>
                </tr>
              ) : !data?.data?.length ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                    Chưa có kỳ lương nào
                  </td>
                </tr>
              ) : (
                data.data.map((item) => {
                  return (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium">{item.code}</td>
                      <td className="px-4 py-3 text-sm">{item.name}</td>
                      <td className="px-4 py-3 text-sm">
                        {String(item.month).padStart(2, '0')}/{item.year}
                      </td>
                      <td className="px-4 py-3 text-sm">{item.total_employees}</td>
                      <td className="px-4 py-3 text-sm">{formatCurrency(item.total_amount)}</td>
                      <td className="px-4 py-3 text-sm">
                        <EnumTag value={item.status} labels={PAYROLL_PERIOD_STATUS_LABELS} colors={PAYROLL_PERIOD_STATUS_COLORS} />
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div className="flex gap-1">
                          <Button 
                            size="sm" 
                            variant="outline" 
                            onClick={() => {
                              setSelectedItem(item)
                              setIsModalOpen(true)
                            }}
                          >
                            Chi tiết
                          </Button>
                          {item.status === 'draft' && (
                            <Button 
                              size="sm" 
                              onClick={() => setGenerateId(item.id)}
                            >
                              Tạo phiếu
                            </Button>
                          )}
                          {item.status === 'processing' && (
                            <Button 
                              size="sm" 
                              variant="primary" 
                              onClick={() => askConfirmPeriod(item)}
                              disabled={confirmMutation.isPending}
                            >
                              Xác nhận
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {!error && data && data.totalPages > 1 && (
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
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={selectedItem ? 'Chi tiết kỳ lương' : 'Tạo kỳ lương mới'}
      >
        <PayrollPeriodForm
          initialData={selectedItem}
          onSuccess={() => {
            setIsModalOpen(false)
            queryClient.invalidateQueries({ queryKey: ['payroll-periods'] })
          }}
          onCancel={() => setIsModalOpen(false)}
        />
      </Modal>

      <ConfirmDialog
        isOpen={!!generateId}
        onClose={() => setGenerateId(null)}
        onConfirm={() => generateId && generateMutation.mutate(generateId)}
        title="Tạo phiếu lương"
        message="Hệ thống sẽ tạo phiếu lương cho tất cả nhân viên đang hoạt động. Tiếp tục?"
        isLoading={generateMutation.isPending}
      />
    </div>
  )
}