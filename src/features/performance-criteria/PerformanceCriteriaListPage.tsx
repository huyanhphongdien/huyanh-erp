import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { performanceService } from '../../services'
import { Button, Input, Card, Pagination, Modal, ConfirmDialog } from '../../components/ui'
import { PerformanceCriteriaForm } from './PerformanceCriteriaForm'

// Define type inline
interface PerformanceCriteria {
  id: string
  code: string
  name: string
  description?: string
  category?: string
  weight?: number
  max_score?: number
  is_required?: boolean
  status?: string
  sort_order?: number
}

const categoryLabels: Record<string, string> = {
  work_quality: 'Chất lượng công việc',
  attitude: 'Thái độ làm việc',
  skill: 'Kỹ năng',
  teamwork: 'Làm việc nhóm',
  initiative: 'Sáng kiến'
}

export function PerformanceCriteriaListPage() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedItem, setSelectedItem] = useState<PerformanceCriteria | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['performance-criteria', page, search],
    queryFn: () => performanceService.getCriteria({ 
      page, 
      pageSize: 10, 
      search: search || undefined 
    })
  })

  const deleteMutation = useMutation({
    mutationFn: performanceService.deleteCriteria,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['performance-criteria'] })
      setDeleteId(null)
    }
  })

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Tiêu chí đánh giá</h1>
        <Button onClick={() => { setSelectedItem(null); setIsModalOpen(true) }}>
          + Thêm tiêu chí
        </Button>
      </div>

      <Card>
        <div className="p-4 border-b">
          <Input
            placeholder="Tìm kiếm..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="w-64"
          />
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Mã</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Tên tiêu chí</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Nhóm</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Trọng số</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Điểm tối đa</th>
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
              ) : !data?.data?.length ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                    Chưa có tiêu chí nào
                  </td>
                </tr>
              ) : (
                data.data.map((item: PerformanceCriteria) => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium">{item.code}</td>
                    <td className="px-4 py-3 text-sm">{item.name}</td>
                    <td className="px-4 py-3 text-sm">
                      {categoryLabels[item.category || ''] || item.category || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm">{item.weight}%</td>
                    <td className="px-4 py-3 text-sm">{item.max_score}</td>
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
        title={selectedItem ? 'Cập nhật tiêu chí' : 'Thêm tiêu chí mới'}
      >
        <PerformanceCriteriaForm
          initialData={selectedItem}
          onSuccess={() => {
            setIsModalOpen(false)
            queryClient.invalidateQueries({ queryKey: ['performance-criteria'] })
          }}
          onCancel={() => setIsModalOpen(false)}
        />
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && deleteMutation.mutate(deleteId)}
        title="Xác nhận xóa"
        message="Bạn có chắc chắn muốn xóa tiêu chí này?"
        isLoading={deleteMutation.isPending}
      />
    </div>
  )
}