import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { employeeService, departmentService } from '../../services'
import { Card, Button, Input, Select, DataTable, Pagination, Modal, ConfirmDialog } from '../../components/ui'
import { EmployeeForm } from './EmployeeForm'
import { Lock } from 'lucide-react'
import type { Employee } from '../../types'

// ============================================================================
// TẠM THỜI KHÓA CHỨC NĂNG SỬA/XÓA
// Set = false để mở lại
// ============================================================================
const DISABLE_EDIT_DELETE = true

export function EmployeeListPage() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [departmentFilter, setDepartmentFilter] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  // Query danh sách nhân viên
  const { data, isLoading } = useQuery({
    queryKey: ['employees', page, search, departmentFilter],
    queryFn: () => employeeService.getAll({ 
      page, 
      pageSize: 10, 
      search,
      department_id: departmentFilter || undefined
    })
  })

  // Query danh sách phòng ban cho filter
  const { data: departments } = useQuery({
    queryKey: ['departments-active'],
    queryFn: departmentService.getAllActive
  })

  const deleteMutation = useMutation({
    mutationFn: employeeService.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] })
      setDeleteId(null)
    }
  })

  const columns = [
    { key: 'code', title: 'Mã NV' },
    { key: 'full_name', title: 'Họ và tên' },
    {
      key: 'department',
      title: 'Phòng ban',
      render: (item: Employee) => item.department?.name || '-'
    },
    {
      key: 'position',
      title: 'Chức vụ',
      render: (item: Employee) => item.position?.name || '-'
    },
    { key: 'phone', title: 'Điện thoại' },
    {
      key: 'status',
      title: 'Trạng thái',
      render: (item: Employee) => (
        <span className={`px-2 py-1 rounded-full text-xs ${
          item.status === 'active' 
            ? 'bg-green-100 text-green-800' 
            : 'bg-red-100 text-red-800'
        }`}>
          {item.status === 'active' ? 'Đang làm' : 'Nghỉ việc'}
        </span>
      )
    },
    {
      key: 'actions',
      title: 'Thao tác',
      render: (item: Employee) => (
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

  const handleEdit = (employee: Employee) => {
    if (DISABLE_EDIT_DELETE) return
    setSelectedEmployee(employee)
    setIsModalOpen(true)
  }

  const handleAdd = () => {
    setSelectedEmployee(null)
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setSelectedEmployee(null)
  }

  const handleSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ['employees'] })
    handleCloseModal()
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Quản lý Nhân viên</h1>
        <Button onClick={handleAdd}>+ Thêm nhân viên</Button>
      </div>

      {/* Thông báo tạm khóa */}
      {DISABLE_EDIT_DELETE && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2 text-amber-700">
          <Lock className="w-4 h-4" />
          <span className="text-sm">Chức năng Sửa/Xóa đang tạm thời bị khóa để đảm bảo tính toàn vẹn dữ liệu.</span>
        </div>
      )}

      <Card>
        {/* Filters */}
        <div className="flex gap-4 mb-4">
          <Input
            placeholder="Tìm kiếm theo mã, tên, email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-md"
          />
          <Select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            options={[
              { value: '', label: 'Tất cả phòng ban' },
              ...(departments?.map(d => ({ value: d.id, label: d.name })) || [])
            ]}
            className="w-48"
          />
        </div>

        <DataTable
          columns={columns}
          data={data?.data || []}
          isLoading={isLoading}
          emptyMessage="Chưa có nhân viên nào"
        />

        {data && (
          <Pagination
            currentPage={data.page}
            totalPages={data.totalPages}
            onPageChange={setPage}
          />
        )}
      </Card>

      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={selectedEmployee ? 'Sửa nhân viên' : 'Thêm nhân viên'}
        size="lg"
      >
        <EmployeeForm
          employee={selectedEmployee}
          onSuccess={handleSuccess}
          onCancel={handleCloseModal}
        />
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && deleteMutation.mutate(deleteId)}
        title="Xác nhận xóa"
        message="Bạn có chắc muốn xóa nhân viên này?"
        isLoading={deleteMutation.isPending}
      />
    </div>
  )
}