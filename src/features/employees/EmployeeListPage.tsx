import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { employeeService, departmentService, positionService } from '../../services'
import { Card, Button, Input, Select, DataTable, Pagination, Modal, ConfirmDialog } from '../../components/ui'
import { EmployeeForm } from './EmployeeForm'
import type { Employee } from '../../types'
 
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
          <Button size="sm" variant="outline" onClick={() => handleEdit(item)}>
            Sửa
          </Button>
          <Button size="sm" variant="danger" onClick={() => setDeleteId(item.id)}>
            Xóa
          </Button>
        </div>
      )
    }
  ]
 
  const handleEdit = (employee: Employee) => {
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
