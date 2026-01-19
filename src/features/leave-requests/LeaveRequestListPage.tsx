import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { leaveRequestService } from '../../services'
import { useAuthStore } from '../../stores/authStore'
import { Card, Button, Input, Select, DataTable, Pagination, Modal, ConfirmDialog } from '../../components/ui'
import { LeaveRequestForm } from './LeaveRequestForm'
import type { LeaveRequest } from '../../types'
 
export function LeaveRequestListPage() {
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedRequest, setSelectedRequest] = useState<LeaveRequest | null>(null)
  const [approveId, setApproveId] = useState<string | null>(null)
  const [rejectId, setRejectId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
 
  const { data, isLoading } = useQuery({
    queryKey: ['leave-requests', page, statusFilter],
    queryFn: () => leaveRequestService.getAll({ 
      page, 
      pageSize: 10, 
      status: statusFilter || undefined
    })
  })
 
  const approveMutation = useMutation({
    mutationFn: (id: string) => leaveRequestService.approve(id, user!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leave-requests'] })
      setApproveId(null)
    }
  })
 
  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string, reason: string }) => 
      leaveRequestService.reject(id, user!.id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leave-requests'] })
      setRejectId(null)
      setRejectReason('')
    }
  })
 
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('vi-VN')
  }
 
  const columns = [
    { key: 'request_number', title: 'Mã đơn' },
    {
      key: 'employee',
      title: 'Nhân viên',
      render: (item: LeaveRequest) => item.employee?.full_name || '-'
    },
    {
      key: 'leave_type',
      title: 'Loại nghỉ',
      render: (item: LeaveRequest) => (
        <span 
          className="px-2 py-1 rounded text-xs text-white"
          style={{ backgroundColor: item.leave_type?.color }}
        >
          {item.leave_type?.name}
        </span>
      )
    },
    {
      key: 'period',
      title: 'Thời gian',
      render: (item: LeaveRequest) => (
        <div className="text-sm">
          <div>{formatDate(item.start_date)} - {formatDate(item.end_date)}</div>
          <div className="text-gray-500">{item.total_days} ngày</div>
        </div>
      )
    },
    {
      key: 'status',
      title: 'Trạng thái',
      render: (item: LeaveRequest) => {
        const statusColors = {
          pending: 'bg-yellow-100 text-yellow-800',
          approved: 'bg-green-100 text-green-800',
          rejected: 'bg-red-100 text-red-800',
          cancelled: 'bg-gray-100 text-gray-800'
        }
        const statusLabels = {
          pending: 'Chờ duyệt',
          approved: 'Đã duyệt',
          rejected: 'Từ chối',
          cancelled: 'Đã hủy'
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
      render: (item: LeaveRequest) => (
        <div className="flex gap-2">
          {item.status === 'pending' && (
            <>
              <Button size="sm" variant="primary" onClick={() => setApproveId(item.id)}>
                Duyệt
              </Button>
              <Button size="sm" variant="danger" onClick={() => setRejectId(item.id)}>
                Từ chối
              </Button>
            </>
          )}
          <Button size="sm" variant="outline" onClick={() => {
            setSelectedRequest(item)
            setIsModalOpen(true)
          }}>
            Chi tiết
          </Button>
        </div>
      )
    }
  ]
 
  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Quản lý đơn nghỉ phép</h1>
        <Button onClick={() => { setSelectedRequest(null); setIsModalOpen(true) }}>
          + Tạo đơn nghỉ phép
        </Button>
      </div>
 
      <Card>
        <div className="p-4 border-b">
          <Select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
            options={[
              { value: '', label: 'Tất cả trạng thái' },
              { value: 'pending', label: 'Chờ duyệt' },
              { value: 'approved', label: 'Đã duyệt' },
              { value: 'rejected', label: 'Từ chối' },
              { value: 'cancelled', label: 'Đã hủy' }
            ]}
            className="w-48"
          />
        </div>
 
        <DataTable
          columns={columns}
          data={data?.data || []}
          isLoading={isLoading}
          emptyMessage="Chưa có đơn nghỉ phép nào"
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
        title={selectedRequest ? 'Chi tiết đơn nghỉ phép' : 'Tạo đơn nghỉ phép'}
        size="lg"
      >
        <LeaveRequestForm
          initialData={selectedRequest}
          onSuccess={() => {
            setIsModalOpen(false)
            queryClient.invalidateQueries({ queryKey: ['leave-requests'] })
          }}
          onCancel={() => setIsModalOpen(false)}
        />
      </Modal>
 
      {/* Confirm Approve */}
      <ConfirmDialog
        isOpen={!!approveId}
        onClose={() => setApproveId(null)}
        onConfirm={() => approveId && approveMutation.mutate(approveId)}
        title="Xác nhận duyệt"
        message="Bạn có chắc chắn muốn duyệt đơn nghỉ phép này?"
        isLoading={approveMutation.isPending}
      />
 
      {/* Reject Modal */}
      <Modal
        isOpen={!!rejectId}
        onClose={() => { setRejectId(null); setRejectReason('') }}
        title="Từ chối đơn nghỉ phép"
      >
        <div className="space-y-4">
          <Input
            label="Lý do từ chối *"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Nhập lý do từ chối..."
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => { setRejectId(null); setRejectReason('') }}>
              Hủy
            </Button>
            <Button 
              variant="danger" 
              onClick={() => rejectId && rejectMutation.mutate({ id: rejectId, reason: rejectReason })}
              disabled={!rejectReason}
              isLoading={rejectMutation.isPending}
            >
              Từ chối
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
