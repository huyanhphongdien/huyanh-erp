import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { contractService } from '../../services'
import { Card, Button, Input, Select, DataTable, Pagination, Modal, ConfirmDialog } from '../../components/ui'
import { ContractForm } from './ContractForm'
import type { Contract } from '../../types'
 
export function ContractListPage() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
 
  const { data, isLoading } = useQuery({
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
 
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('vi-VN', { 
      style: 'currency', 
      currency: 'VND' 
    }).format(value)
  }
 
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('vi-VN')
  }
 
  const columns = [
    { key: 'contract_number', title: 'Số hợp đồng' },
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
          <div>{formatDate(item.start_date)}</div>
          <div className="text-gray-500">
            {item.end_date ? `đến ${formatDate(item.end_date)}` : 'Không xác định'}
          </div>
        </div>
      )
    },
    {
      key: 'base_salary',
      title: 'Lương cơ bản',
      render: (item: Contract) => formatCurrency(item.base_salary ?? 0)
    },
    {
      key: 'status',
      title: 'Trạng thái',
      render: (item: Contract) => {
        const statusColors: Record<string, string> = {
          active: 'bg-green-100 text-green-800',
          expired: 'bg-yellow-100 text-yellow-800',
          terminated: 'bg-red-100 text-red-800',
          renewed: 'bg-blue-100 text-blue-800'
        }
        const statusLabels: Record<string, string> = {
          active: 'Hiệu lực',
          expired: 'Hết hạn',
          terminated: 'Chấm dứt',
          renewed: 'Đã gia hạn'
        }
        return (
          <span className={`px-2 py-1 rounded-full text-xs ${statusColors[item.status]}`}>
            {statusLabels[item.status]}
          </span>
        )
      }
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
              { value: 'active', label: 'Đang hiệu lực' },
              { value: 'expired', label: 'Hết hạn' },
              { value: 'terminated', label: 'Đã chấm dứt' },
              { value: 'renewed', label: 'Đã gia hạn' }
            ]}
            className="w-48"
          />
        </div>
 
        <DataTable
          columns={columns}
          data={data?.data || []}
          isLoading={isLoading}
          emptyMessage="Chưa có hợp đồng nào"
        />
 
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
