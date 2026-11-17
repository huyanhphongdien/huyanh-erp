import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { employeeService, departmentService, positionService, EMPLOYEE_STATUS_LABELS, EMPLOYEE_STATUS_COLORS } from '../../services'
import { Card, Button, Input, Select, DataTable, Pagination, Modal, ConfirmDialog } from '../../components/ui'
import { EmployeeForm } from './EmployeeForm'
import { Lock } from 'lucide-react'
import { formatHac13Display } from '../../lib/hac13'
import PageState from '../../components/common/PageState'
import { EnumTag } from '../../components/common/EnumTag'
import { HR_MASTER_DATA_READONLY, HR_MASTER_DATA_READONLY_NOTE } from './hrMasterData'
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
  const { data, isLoading, error, refetch } = useQuery({
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

  // Chức vụ — để hiện tên (employeeService.getAll chỉ select '*', không join)
  const { data: positions } = useQuery({
    queryKey: ['positions-active'],
    queryFn: positionService.getAllActive
  })

  const deptName = useMemo(() => new Map((departments || []).map(d => [d.id, d.name] as [string, string])), [departments])
  const posName = useMemo(() => new Map((positions || []).map(p => [p.id, p.name] as [string, string])), [positions])

  const deleteMutation = useMutation({
    mutationFn: employeeService.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] })
      setDeleteId(null)
    }
  })

  // Cột chữ trần PHẢI có dataIndex (thiếu → antd vẽ ô trống). Cột có render(item) cố ý
  // KHÔNG khai dataIndex để render nhận cả bản ghi.
  const columns = [
    {
      key: 'hac13_code',
      title: 'Mã NV (HAC-13)',
      render: (item: Employee) => (
        <span className="font-mono text-sm">
          {item.hac13_code ? formatHac13Display(item.hac13_code) : item.code || '—'}
        </span>
      ),
    },
    { key: 'full_name', dataIndex: 'full_name', title: 'Họ và tên' },
    {
      key: 'department',
      title: 'Phòng ban',
      render: (item: Employee) => item.department?.name || deptName.get(item.department_id || '') || '—'
    },
    {
      key: 'position',
      title: 'Chức vụ',
      render: (item: Employee) => item.position?.name || posName.get(item.position_id || '') || '—'
    },
    { key: 'phone', dataIndex: 'phone', title: 'Điện thoại' },
    {
      key: 'status',
      title: 'Trạng thái',
      render: (item: Employee) => (
        <EnumTag value={item.status} labels={EMPLOYEE_STATUS_LABELS} colors={EMPLOYEE_STATUS_COLORS} />
      )
    },
    // Khoá Sửa/Xoá → ẩn hẳn cột Thao tác (không vẽ 2 nút chết mỗi dòng)
    ...(HR_MASTER_DATA_READONLY ? [] : [{
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
    }])
  ]

  const handleEdit = (employee: Employee) => {
    if (HR_MASTER_DATA_READONLY) return
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
      {HR_MASTER_DATA_READONLY && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2 text-amber-700">
          <Lock className="w-4 h-4" />
          <span className="text-sm">{HR_MASTER_DATA_READONLY_NOTE}</span>
        </div>
      )}

      <Card>
        {/* Filters */}
        <div className="flex gap-4 mb-4">
          <Input
            placeholder="Tìm theo mã HAC-13, tên, email..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="max-w-md"
          />
          <Select
            value={departmentFilter}
            onChange={(e) => { setDepartmentFilter(e.target.value); setPage(1) }}
            options={[
              { value: '', label: 'Tất cả phòng ban' },
              ...(departments?.map(d => ({ value: d.id, label: d.name })) || [])
            ]}
            className="w-48"
          />
        </div>

        {error ? (
          <PageState error={error} onRetry={() => refetch()} />
        ) : (
          <>
            {/* Phân trang ở server → tắt thanh phân trang của bảng, chỉ giữ <Pagination> bên dưới */}
            <DataTable
              columns={columns}
              data={data?.data || []}
              isLoading={isLoading}
              emptyMessage="Chưa có nhân viên nào"
              pagination={false}
              showSearch={false}
            />

            {data && (
              <Pagination
                currentPage={data.page}
                totalPages={data.totalPages}
                onPageChange={setPage}
              />
            )}
          </>
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
