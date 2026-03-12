import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { departmentService } from '../../services'
import { Card, Button, Input, DataTable, Pagination, Modal, ConfirmDialog } from '../../components/ui'
import { DepartmentForm } from './DepartmentForm'
import { Lock } from 'lucide-react'
import type { Department } from '../../types'

// ============================================================================
// TẠM THỜI KHÓA CHỨC NĂNG SỬA/XÓA
// Set = false để mở lại
// ============================================================================
const DISABLE_EDIT_DELETE = true

export function DepartmentListPage() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedDepartment, setSelectedDepartment] = useState<Department | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  // Query danh sách
  const { data, isLoading } = useQuery({
    queryKey: ['departments', page, search],
    queryFn: () => departmentService.getAll({ page, pageSize: 10, search })
  })

  // Mutation xóa
  const deleteMutation = useMutation({
    mutationFn: departmentService.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['departments'] })
      setDeleteId(null)
    }
  })

  // Columns cho table
  const columns = [
    { key: 'code', title: 'Mã' },
    { key: 'name', title: 'Tên phòng ban' },
    { key: 'description', title: 'Mô tả' },
    {
      key: 'status',
      title: 'Trạng thái',
      render: (item: Department) => (
        <span className={`px-2 py-1 rounded-full text-xs ${
          item.status === 'active' 
            ? 'bg-green-100 text-green-800' 
            : 'bg-red-100 text-red-800'
        }`}>
          {item.status === 'active' ? 'Hoạt động' : 'Ngừng'}
        </span>
      )
    },
    {
      key: 'actions',
      title: 'Thao tác',
      render: (item: Department) => (
        <div className="flex gap-2">
          {DISABLE_EDIT_DELETE ? (
            <>
              <Button 
                size="sm" 
                variant="outline" 
                disabled
                className="opacity-50 cursor-not-allowed"
                title="Chức năng tạm khóa"
              >
                <Lock className="w-3 h-3 mr-1" />
                Sửa
              </Button>
              <Button 
                size="sm" 
                variant="danger" 
                disabled
                className="opacity-50 cursor-not-allowed"
                title="Chức năng tạm khóa"
              >
                <Lock className="w-3 h-3 mr-1" />
                Xóa
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="outline" onClick={() => handleEdit(item)}>
                Sửa
              </Button>
              <Button size="sm" variant="danger" onClick={() => setDeleteId(item.id)}>
                Xóa
              </Button>
            </>
          )}
        </div>
      )
    }
  ]

  const handleEdit = (department: Department) => {
    if (DISABLE_EDIT_DELETE) return
    setSelectedDepartment(department)
    setIsModalOpen(true)
  }

  const handleAdd = () => {
    setSelectedDepartment(null)
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setSelectedDepartment(null)
  }

  const handleSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ['departments'] })
    handleCloseModal()
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Quản lý Phòng ban</h1>
        <Button onClick={handleAdd}>+ Thêm phòng ban</Button>
      </div>

      {/* Thông báo tạm khóa */}
      {DISABLE_EDIT_DELETE && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2 text-amber-700">
          <Lock className="w-4 h-4" />
          <span className="text-sm">Chức năng Sửa/Xóa đang tạm thời bị khóa để đảm bảo tính toàn vẹn dữ liệu.</span>
        </div>
      )}

      <Card>
        {/* Search */}
        <div className="mb-4">
          <Input
            placeholder="Tìm kiếm theo mã hoặc tên..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-md"
          />
        </div>

        {/* Table */}
        <DataTable
          columns={columns}
          data={data?.data || []}
          isLoading={isLoading}
          emptyMessage="Chưa có phòng ban nào"
        />

        {/* Pagination */}
        {data && (
          <Pagination
            currentPage={data.page}
            totalPages={data.totalPages}
            onPageChange={setPage}
          />
        )}
      </Card>

      {/* Modal Form */}
      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={selectedDepartment ? 'Sửa phòng ban' : 'Thêm phòng ban'}
      >
        <DepartmentForm
          department={selectedDepartment}
          onSuccess={handleSuccess}
          onCancel={handleCloseModal}
        />
      </Modal>

      {/* Confirm Delete */}
      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && deleteMutation.mutate(deleteId)}
        title="Xác nhận xóa"
        message="Bạn có chắc muốn xóa phòng ban này?"
        isLoading={deleteMutation.isPending}
      />
    </div>
  )
}