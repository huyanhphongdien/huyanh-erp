import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { leaveTypeService } from '../../services'
import { Card, Button, Input, DataTable, Pagination, Modal, ConfirmDialog } from '../../components/ui'
import { LeaveTypeForm } from './LeaveTypeForm'
import type { LeaveType } from '../../types'
 
export function LeaveTypeListPage() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedItem, setSelectedItem] = useState<LeaveType | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
 
  const { data, isLoading } = useQuery({
    queryKey: ['leave-types', page, search],
    queryFn: () => leaveTypeService.getAll({ page, pageSize: 10, search })
  })
 
  const deleteMutation = useMutation({
    mutationFn: leaveTypeService.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leave-types'] })
      setDeleteId(null)
    }
  })
 
  const columns = [
    { key: 'code', title: 'Mã' },
    { key: 'name', title: 'Tên loại nghỉ phép' },
    {
      key: 'color',
      title: 'Màu',
      render: (item: LeaveType) => (
        <div 
          className="w-6 h-6 rounded" 
          style={{ backgroundColor: item.color ?? undefined }}
        />
      )
    },
    {
      key: 'default_days',
      title: 'Số ngày/năm',
      render: (item: LeaveType) => item.default_days || '-'
    },
    {
      key: 'is_paid',
      title: 'Có lương',
      render: (item: LeaveType) => item.is_paid ? '✓' : '✗'
    },
    {
      key: 'status',
      title: 'Trạng thái',
      render: (item: LeaveType) => (
        <span className={`px-2 py-1 rounded-full text-xs ${
          item.status === 'active' 
            ? 'bg-green-100 text-green-800' 
            : 'bg-gray-100 text-gray-800'
        }`}>
          {item.status === 'active' ? 'Hoạt động' : 'Ngừng'}
        </span>
      )
    },
    {
      key: 'actions',
      title: 'Thao tác',
      render: (item: LeaveType) => (
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => {
            setSelectedItem(item)
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
        <h1 className="text-2xl font-bold">Quản lý loại nghỉ phép</h1>
        <Button onClick={() => { setSelectedItem(null); setIsModalOpen(true) }}>
          + Thêm loại nghỉ phép
        </Button>
      </div>
 
      <Card>
        <div className="p-4 border-b">
          <Input
            placeholder="Tìm kiếm theo mã hoặc tên..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="max-w-md"
          />
        </div>
 
        <DataTable
          columns={columns}
          data={data?.data || []}
          isLoading={isLoading}
          emptyMessage="Chưa có loại nghỉ phép nào"
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
        title={selectedItem ? 'Cập nhật loại nghỉ phép' : 'Thêm loại nghỉ phép'}
      >
        <LeaveTypeForm
          initialData={selectedItem}
          onSuccess={() => {
            setIsModalOpen(false)
            queryClient.invalidateQueries({ queryKey: ['leave-types'] })
          }}
          onCancel={() => setIsModalOpen(false)}
        />
      </Modal>
 
      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && deleteMutation.mutate(deleteId)}
        title="Xác nhận xóa"
        message="Bạn có chắc chắn muốn xóa loại nghỉ phép này?"
        isLoading={deleteMutation.isPending}
      />
    </div>
  )
}
