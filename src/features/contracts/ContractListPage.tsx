import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { contractService, LABOR_CONTRACT_STATUS_LABELS, LABOR_CONTRACT_STATUS_COLORS } from '../../services'
import { Card, Button, Input, Select, DataTable, Pagination, Modal, ConfirmDialog } from '../../components/ui'
import { ContractForm } from './ContractForm'
import PageState from '../../components/common/PageState'
import { EnumTag } from '../../components/common/EnumTag'
import { fmtVnd, fmtDate } from '../../utils/format'
import type { Contract } from '../../types'

export function ContractListPage() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['contracts', page, search, statusFilter],
    queryFn: () => contractService.getAll({
      page,
      pageSize: 10,
      search,
      status: statusFilter || undefined
    })
  })

  const deleteMutation = useMutation({
    mutationFn: contractService.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] })
      setDeleteId(null)
    }
  })

  // Cột chữ trần PHẢI có dataIndex (thiếu → antd vẽ ô trống). Cột có render(item) cố ý
  // KHÔNG khai dataIndex để render nhận cả bản ghi.
  const columns = [
    { key: 'contract_number', dataIndex: 'contract_number', title: 'Số hợp đồng' },
    {
      key: 'employee',
      title: 'Nhân viên',
      render: (item: Contract) => item.employee?.full_name || '-'
    },
    {
      key: 'contract_type',
      title: 'Loại HĐ',
      render: (item: Contract) => item.contract_type?.name || '-'
    },
    {
      key: 'period',
      title: 'Thời hạn',
      render: (item: Contract) => (
        <div className="text-sm">
          <div>{fmtDate(item.start_date)}</div>
          <div className="text-gray-500">
            {item.end_date ? `đến ${fmtDate(item.end_date)}` : 'Không xác định'}
          </div>
        </div>
      )
    },
    {
      key: 'base_salary',
      title: 'Lương cơ bản',
      render: (item: Contract) => fmtVnd(item.base_salary)
    },
    {
      key: 'status',
      title: 'Trạng thái',
      render: (item: Contract) => (
        <EnumTag value={item.status} labels={LABOR_CONTRACT_STATUS_LABELS} colors={LABOR_CONTRACT_STATUS_COLORS} />
      )
    },
    {
      key: 'actions',
      title: 'Thao tác',
      render: (item: Contract) => (
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => {
            setSelectedContract(item)
            setIsModalOpen(true)
          }}>
            Sửa
          </Button>
          <Button size="sm" variant="danger" onClick={() => setDeleteId(item.id)}>
            Xóa
          </Button>
        </div>
      )
    }
  ]

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Quản lý hợp đồng lao động</h1>
        <Button onClick={() => { setSelectedContract(null); setIsModalOpen(true) }}>
          + Thêm hợp đồng
        </Button>
      </div>

      <Card>
        <div className="p-4 border-b flex gap-4">
          <Input
            placeholder="Tìm kiếm theo số hợp đồng..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="max-w-xs"
          />
          <Select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
            options={[
              { value: '', label: 'Tất cả trạng thái' },
              ...Object.entries(LABOR_CONTRACT_STATUS_LABELS).map(([value, label]) => ({ value, label }))
            ]}
            className="w-48"
          />
        </div>

        {error ? (
          <PageState error={error} onRetry={() => refetch()} />
        ) : (
          // Phân trang ở server → tắt thanh phân trang của bảng, chỉ giữ <Pagination> bên dưới
          <DataTable
            columns={columns}
            data={data?.data || []}
            isLoading={isLoading}
            emptyMessage="Chưa có hợp đồng nào"
            pagination={false}
            showSearch={false}
          />
        )}

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
        title={selectedContract ? 'Cập nhật hợp đồng' : 'Thêm hợp đồng mới'}
        size="lg"
      >
        <ContractForm
          initialData={selectedContract}
          onSuccess={() => {
            setIsModalOpen(false)
            queryClient.invalidateQueries({ queryKey: ['contracts'] })
          }}
          onCancel={() => setIsModalOpen(false)}
        />
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && deleteMutation.mutate(deleteId)}
        title="Xác nhận xóa"
        message="Bạn có chắc chắn muốn xóa hợp đồng này? Hành động này không thể hoàn tác."
        isLoading={deleteMutation.isPending}
      />
    </div>
  )
}
