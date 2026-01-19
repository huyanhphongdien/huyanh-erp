import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { performanceService } from '../../services'
import { Button, Input, Select, Card, Pagination, Modal } from '../../components/ui'
import { PerformanceReviewForm } from './PerformanceReviewForm'
import type { PerformanceReview } from '../../types'

const statusLabels: Record<string, { label: string; color: string }> = {
  draft: { label: 'Nháp', color: 'bg-gray-100 text-gray-800' },
  submitted: { label: 'Đã nộp', color: 'bg-yellow-100 text-yellow-800' },
  reviewed: { label: 'Đã đánh giá', color: 'bg-green-100 text-green-800' },
  acknowledged: { label: 'NV xác nhận', color: 'bg-blue-100 text-blue-800' }
}

const gradeColors: Record<string, string> = {
  A: 'bg-green-500 text-white',
  B: 'bg-blue-500 text-white',
  C: 'bg-yellow-500 text-white',
  D: 'bg-orange-500 text-white',
  E: 'bg-red-500 text-white'
}

export function PerformanceReviewListPage() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [periodFilter, setPeriodFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedItem, setSelectedItem] = useState<PerformanceReview | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['performance-reviews', page, periodFilter, statusFilter],
    queryFn: () => performanceService.getReviews({ 
      page, 
      pageSize: 10, 
      period: periodFilter || undefined,
      status: statusFilter || undefined 
    })
  })

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Đánh giá hiệu suất</h1>
        <Button onClick={() => { setSelectedItem(null); setIsModalOpen(true) }}>
          + Tạo đánh giá
        </Button>
      </div>

      <Card>
        <div className="p-4 border-b flex gap-4">
          <Input
            placeholder="Kỳ đánh giá (VD: Q1-2026)"
            value={periodFilter}
            onChange={(e) => { setPeriodFilter(e.target.value); setPage(1) }}
            className="w-48"
          />
          <Select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
            options={[
              { value: '', label: 'Tất cả trạng thái' },
              { value: 'draft', label: 'Nháp' },
              { value: 'submitted', label: 'Đã nộp' },
              { value: 'reviewed', label: 'Đã đánh giá' },
              { value: 'acknowledged', label: 'NV xác nhận' }
            ]}
            className="w-48"
          />
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Mã đánh giá</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Nhân viên</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Kỳ đánh giá</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Điểm</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Xếp loại</th>
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
                    Chưa có đánh giá nào
                  </td>
                </tr>
              ) : (
                data.data.map((item) => {
                  const statusInfo = statusLabels[item.status] || statusLabels.draft
                  return (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium">{item.review_code}</td>
                      <td className="px-4 py-3 text-sm">
                        {item.employee?.code} - {item.employee?.full_name}
                      </td>
                      <td className="px-4 py-3 text-sm">{item.review_period}</td>
                      <td className="px-4 py-3 text-sm font-medium">
                        {item.total_score?.toFixed(1) || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {item.grade ? (
                          <span className={`px-2 py-1 rounded text-xs font-bold ${gradeColors[item.grade] || ''}`}>
                            {item.grade}
                          </span>
                        ) : '-'}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span className={`px-2 py-1 rounded text-xs ${statusInfo.color}`}>
                          {statusInfo.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm">
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
                      </td>
                    </tr>
                  )
                })
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
        title={selectedItem ? `Đánh giá: ${selectedItem.review_code}` : 'Tạo đánh giá mới'}
        size="lg"
      >
        <PerformanceReviewForm
          initialData={selectedItem}
          onSuccess={() => {
            setIsModalOpen(false)
            queryClient.invalidateQueries({ queryKey: ['performance-reviews'] })
          }}
          onCancel={() => setIsModalOpen(false)}
        />
      </Modal>
    </div>
  )
}