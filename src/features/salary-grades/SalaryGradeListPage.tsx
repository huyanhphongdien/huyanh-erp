import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { salaryGradeService } from '../../services'
import { Button, Input, Select, Card, Pagination, Modal, ConfirmDialog } from '../../components/ui'
import { SalaryGradeForm } from './SalaryGradeForm'
import type { SalaryGrade } from '../../types'

export function SalaryGradeListPage() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedItem, setSelectedItem] = useState<SalaryGrade | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['salary-grades', page, search, statusFilter],
    queryFn: () => salaryGradeService.getAll({ 
      page, 
      pageSize: 10, 
      search: search || undefined,
      status: statusFilter || undefined 
    })
  })

  const deleteMutation = useMutation({
    mutationFn: salaryGradeService.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['salary-grades'] })
      setDeleteId(null)
    }
  })

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value)
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Quản lý bậc lương</h1>
        <Button onClick={() => { setSelectedItem(null); setIsModalOpen(true) }}>
          + Thêm bậc lương
        </Button>
      </div>

      <Card>
        <div className="p-4 border-b flex gap-4">
          <Input
            placeholder="Tìm kiếm..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="w-64"
          />
          <Select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
            options={[
              { value: '', label: 'Tất cả trạng thái' },
              { value: 'active', label: 'Hoạt động' },
              { value: 'inactive', label: 'Ngừng hoạt động' }
            ]}
            className="w-48"
          />
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Mã</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Tên bậc lương</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Cấp</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Lương tối thiểu</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Lương tối đa</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Lương cơ bản</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Trạng thái</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                    Đang tải...
                  </td>
                </tr>
              ) : !data?.data?.length ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                    Chưa có bậc lương nào
                  </td>
                </tr>
              ) : (
                data.data.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm">{item.code}</td>
                    <td className="px-4 py-3 text-sm font-medium">{item.name}</td>
                    <td className="px-4 py-3 text-sm">{item.level}</td>
                    <td className="px-4 py-3 text-sm">{formatCurrency(item.min_salary ?? 0)}</td>
                    <td className="px-4 py-3 text-sm">{formatCurrency(item.max_salary ?? 0)}</td>
                    <td className="px-4 py-3 text-sm">
                      {item.base_salary ? formatCurrency(item.base_salary) : '-'}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`px-2 py-1 rounded text-xs ${
                        item.status === 'active' 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {item.status === 'active' ? 'Hoạt động' : 'Ngừng'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex gap-2">
                        <Button 
                          size="sm" 
                          variant="outline" 
                          onClick={() => {
                            setSelectedItem(item)
                            setIsModalOpen(true)
                          }}
                        >
                          Sửa
                        </Button>
                        <Button 
                          size="sm" 
                          variant="danger" 
                          onClick={() => setDeleteId(item.id)}
                        >
                          Xóa
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
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
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={selectedItem ? 'Cập nhật bậc lương' : 'Thêm bậc lương mới'}
      >
        <SalaryGradeForm
          initialData={selectedItem}
          onSuccess={() => {
            setIsModalOpen(false)
            queryClient.invalidateQueries({ queryKey: ['salary-grades'] })
          }}
          onCancel={() => setIsModalOpen(false)}
        />
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && deleteMutation.mutate(deleteId)}
        title="Xác nhận xóa"
        message="Bạn có chắc chắn muốn xóa bậc lương này?"
        isLoading={deleteMutation.isPending}
      />
    </div>
  )
}