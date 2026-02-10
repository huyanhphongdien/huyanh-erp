// ============================================================================
// LEAVE REQUEST LIST PAGE - MOBILE-FIRST
// File: src/features/leave-requests/LeaveRequestListPage.tsx
// ============================================================================
// CẬP NHẬT: Sửa luồng phê duyệt theo phân cấp chức vụ
//   - Nhân viên: chỉ xem đơn của mình, không có nút duyệt/từ chối
//   - Trưởng/Phó phòng: xem đơn phòng mình + duyệt nhân viên trong phòng
//   - Ban Giám đốc: xem tất cả + duyệt đơn của Trưởng/Phó phòng
//   - Dùng user.employee_id (không phải user.id) khi approve/reject
// ============================================================================

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, RefreshCw, Calendar, FileText,
  CheckCircle, XCircle, Clock, AlertTriangle, ChevronDown,
  ChevronUp, Loader2, X, SlidersHorizontal, Building2
} from 'lucide-react'
import { leaveRequestService, type LeaveRequest } from '../../services'
import { useAuthStore } from '../../stores/authStore'
import { LeaveRequestForm } from './LeaveRequestForm'

export function LeaveRequestListPage() {
  const queryClient = useQueryClient()
  const { user } = useAuthStore()

  // Phân quyền
  const employeeId = user?.employee_id || ''
  const userLevel = user?.position_level || 7
  const isExecutive = userLevel <= 3  // GĐ, TLGĐ, PGĐ
  const isManager = userLevel >= 4 && userLevel <= 5  // TP, PP
  const isEmployee = userLevel >= 6  // NV, TTS
  const canApprove = isExecutive || isManager

  // State
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  // Modal states
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [selectedRequest, setSelectedRequest] = useState<LeaveRequest | null>(null)
  const [viewOnly, setViewOnly] = useState(false)
  const [approveId, setApproveId] = useState<string | null>(null)
  const [rejectId, setRejectId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  // Expanded cards
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // ══════════════════════════════════════════════════════
  // DATA QUERY
  // ══════════════════════════════════════════════════════
  // Nhân viên: chỉ xem đơn của chính mình
  // Manager: chỉ xem đơn trong phòng ban mình
  // Executive: xem tất cả
  const { data, isLoading } = useQuery({
    queryKey: ['leave-requests', page, statusFilter, employeeId, userLevel],
    queryFn: () => leaveRequestService.getAll({
      page,
      pageSize: 20,
      status: statusFilter || undefined,
      // Nhân viên chỉ xem đơn của mình
      employee_id: isEmployee ? employeeId : undefined,
      // Manager chỉ xem phòng ban mình
      department_id: isManager ? (user?.department_id || undefined) : undefined,
    })
  })

  // ══════════════════════════════════════════════════════
  // APPROVE/REJECT MUTATIONS
  // ══════════════════════════════════════════════════════
  // QUAN TRỌNG: dùng employeeId (employee_id), KHÔNG phải user.id

  const approveMutation = useMutation({
    mutationFn: (id: string) => leaveRequestService.approve(id, employeeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leave-requests'] })
      setApproveId(null)
    }
  })

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      leaveRequestService.reject(id, employeeId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leave-requests'] })
      setRejectId(null)
      setRejectReason('')
    }
  })

  // ══════════════════════════════════════════════════════
  // PERMISSION CHECK: Có quyền duyệt đơn cụ thể không?
  // ══════════════════════════════════════════════════════
  const canApproveRequest = (req: LeaveRequest): boolean => {
    if (!canApprove) return false

    // Không tự duyệt đơn của mình
    if (req.employee_id === employeeId) return false

    const requesterLevel = (req.employee as any)?.position?.level || 7

    // Manager (4-5): chỉ duyệt nhân viên (6-7) CÙNG PHÒNG
    if (isManager) {
      const requesterDeptId = (req.employee as any)?.department_id
      const userDeptId = user?.department_id
      // Chỉ duyệt nhân viên (level > 5) và cùng phòng
      return requesterLevel > 5 && requesterDeptId === userDeptId
    }

    // Executive (1-3): duyệt Manager (4-5) + có thể duyệt nhân viên
    if (isExecutive) {
      // Chỉ cần không phải tự mình là được
      return true
    }

    return false
  }

  // Refresh
  const handleRefresh = async () => {
    setRefreshing(true)
    await queryClient.invalidateQueries({ queryKey: ['leave-requests'] })
    setRefreshing(false)
  }

  // Format helpers
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('vi-VN', {
      weekday: 'short', day: '2-digit', month: '2-digit'
    })
  }

  const formatDateTime = (dateStr: string | undefined) => {
    if (!dateStr) return '—'
    return new Date(dateStr).toLocaleString('vi-VN', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
    })
  }

  // Status config
  const STATUS_CONFIG: Record<string, { label: string; cls: string; icon: any }> = {
    pending: { label: 'Chờ duyệt', cls: 'bg-amber-100 text-amber-800 border-amber-200', icon: Clock },
    approved: { label: 'Đã duyệt', cls: 'bg-green-100 text-green-800 border-green-200', icon: CheckCircle },
    rejected: { label: 'Từ chối', cls: 'bg-red-100 text-red-800 border-red-200', icon: XCircle },
    cancelled: { label: 'Đã hủy', cls: 'bg-gray-100 text-gray-800 border-gray-200', icon: AlertTriangle },
  }

  const requests = data?.data || []
  const hasFilters = !!statusFilter
  const totalPages = data?.totalPages || 1

  return (
    <div className="min-h-screen bg-gray-50 sm:bg-transparent">
      {/* ══════════════════════════════════════════════════════
          STICKY HEADER
      ══════════════════════════════════════════════════════ */}
      <div className="sticky top-0 z-20 bg-white border-b px-4 py-3 sm:relative sm:bg-transparent sm:border-0 sm:px-6 sm:py-0 sm:mb-4">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg sm:text-2xl font-bold text-gray-900">Đơn nghỉ phép</h1>
              <p className="text-xs text-gray-500 mt-0.5 hidden sm:block">
                {isEmployee
                  ? 'Quản lý đơn xin nghỉ phép của bạn'
                  : 'Quản lý đơn xin nghỉ phép của nhân viên'
                }
              </p>
            </div>
            <button
              onClick={() => { setSelectedRequest(null); setViewOnly(false); setIsFormOpen(true) }}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-blue-600 text-white rounded-xl
                text-sm font-semibold active:bg-blue-700 transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Tạo đơn</span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 sm:py-0 space-y-3 sm:space-y-4">

        {/* ══════════════════════════════════════════════════════
            FILTERS
        ══════════════════════════════════════════════════════ */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowFilters(p => !p)}
              className={`flex items-center gap-1.5 px-3.5 py-2.5 text-sm rounded-xl border transition-colors ${
                hasFilters
                  ? 'bg-blue-50 border-blue-200 text-blue-700'
                  : 'bg-white border-gray-200 text-gray-600 active:bg-gray-50'
              }`}
            >
              <SlidersHorizontal className="w-4 h-4" />
              <span>Lọc</span>
              {hasFilters && <span className="w-2 h-2 rounded-full bg-blue-500" />}
            </button>

            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-1.5 px-3.5 py-2.5 text-sm text-gray-600
                bg-white border border-gray-200 rounded-xl active:bg-gray-50"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Làm mới</span>
            </button>

            {!isLoading && (
              <span className="ml-auto text-xs text-gray-500">
                {requests.length} đơn
              </span>
            )}
          </div>

          {showFilters && (
            <div className="flex gap-2 p-3 bg-white rounded-xl border border-gray-200">
              <div className="flex-1">
                <select
                  value={statusFilter}
                  onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm
                    bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Tất cả trạng thái</option>
                  <option value="pending">Chờ duyệt</option>
                  <option value="approved">Đã duyệt</option>
                  <option value="rejected">Từ chối</option>
                  <option value="cancelled">Đã hủy</option>
                </select>
              </div>
              {hasFilters && (
                <button
                  onClick={() => { setStatusFilter(''); setPage(1) }}
                  className="px-2.5 py-2.5 text-gray-400 active:text-red-500"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* ══════════════════════════════════════════════════════
            CONTENT
        ══════════════════════════════════════════════════════ */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Loader2 className="w-7 h-7 animate-spin text-blue-500" />
            <span className="mt-2 text-sm text-gray-500">Đang tải...</span>
          </div>
        ) : requests.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl border">
            <FileText className="w-14 h-14 text-gray-200 mx-auto mb-4" />
            <p className="text-gray-500 font-medium">Chưa có đơn nghỉ phép</p>
            <p className="text-sm text-gray-400 mt-1">
              {hasFilters ? 'Thử thay đổi bộ lọc' : 'Tạo đơn mới để bắt đầu'}
            </p>
          </div>
        ) : (
          <div className="space-y-2.5 pb-4">
            {requests.map(req => {
              const emp = req.employee
              const dept = (emp as any)?.department
              const leaveType = req.leave_type
              const status = STATUS_CONFIG[req.status] || STATUS_CONFIG.pending
              const isExpanded = expandedId === req.id
              const showApprovalActions = req.status === 'pending' && canApproveRequest(req)
              const isOwnRequest = req.employee_id === employeeId

              return (
                <div
                  key={req.id}
                  className="bg-white rounded-2xl border border-gray-100 overflow-hidden"
                >
                  <div className="p-4">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-[15px] font-semibold text-gray-900">
                            {emp?.full_name || 'N/A'}
                            {isOwnRequest && (
                              <span className="ml-1.5 text-xs text-blue-600 font-normal">(Bạn)</span>
                            )}
                          </h3>
                          <span className={`px-2 py-0.5 text-[11px] font-bold rounded-full border ${status.cls}`}>
                            {status.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="text-xs text-gray-500">{emp?.code}</span>
                          {dept && (
                            <span className="text-xs text-gray-400 flex items-center gap-0.5">
                              <Building2 className="w-3 h-3" />
                              {dept.name}
                            </span>
                          )}
                        </div>
                      </div>

                      <button
                        onClick={() => setExpandedId(isExpanded ? null : req.id)}
                        className="w-10 h-10 flex items-center justify-center -mr-2 -mt-1
                          rounded-full active:bg-gray-100"
                      >
                        {isExpanded
                          ? <ChevronUp className="w-5 h-5 text-gray-400" />
                          : <ChevronDown className="w-5 h-5 text-gray-400" />
                        }
                      </button>
                    </div>

                    {/* Info chips */}
                    <div className="flex flex-wrap items-center gap-2">
                      {leaveType && (
                        <span
                          className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium text-white"
                          style={{ backgroundColor: leaveType.color }}
                        >
                          {leaveType.name}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-50 rounded-lg text-xs text-gray-700">
                        <Calendar className="w-3 h-3 text-gray-400" />
                        {formatDate(req.start_date)} — {formatDate(req.end_date)}
                      </span>
                      <span className="inline-flex items-center px-2.5 py-1 bg-blue-50 rounded-lg text-xs font-bold text-blue-700">
                        {req.total_days} ngày
                      </span>
                    </div>

                    {/* Expanded details */}
                    {isExpanded && (
                      <div className="mt-4 pt-3 border-t border-gray-100 space-y-2.5 text-sm">
                        <div>
                          <span className="text-gray-500 text-xs font-medium">Lý do</span>
                          <p className="text-gray-800 mt-0.5">{req.reason}</p>
                        </div>
                        <div>
                          <span className="text-gray-500 text-xs font-medium">Mã đơn</span>
                          <p className="text-gray-700 mt-0.5">{req.request_number}</p>
                        </div>
                        <div>
                          <span className="text-gray-500 text-xs font-medium">Tạo lúc</span>
                          <p className="text-gray-600 mt-0.5">{formatDateTime(req.created_at)}</p>
                        </div>
                        {req.approval_notes && (
                          <div>
                            <span className="text-gray-500 text-xs font-medium">Ghi chú phê duyệt</span>
                            <p className="text-red-600 mt-0.5 bg-red-50 px-3 py-2 rounded-lg border border-red-100">
                              {req.approval_notes}
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Action buttons - CHỈ HIỆN KHI CÓ QUYỀN DUYỆT */}
                    {showApprovalActions && (
                      <div className="flex gap-2 mt-4">
                        <button
                          onClick={() => setApproveId(req.id)}
                          className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-3 sm:py-2.5
                            text-sm font-semibold text-green-700 bg-green-50 border border-green-200 rounded-xl
                            active:bg-green-100 transition-colors"
                        >
                          <CheckCircle className="w-4 h-4" />
                          Duyệt
                        </button>
                        <button
                          onClick={() => setRejectId(req.id)}
                          className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-3 sm:py-2.5
                            text-sm font-semibold text-red-700 bg-red-50 border border-red-200 rounded-xl
                            active:bg-red-100 transition-colors"
                        >
                          <XCircle className="w-4 h-4" />
                          Từ chối
                        </button>
                        <button
                          onClick={() => { setSelectedRequest(req); setViewOnly(true); setIsFormOpen(true) }}
                          className="sm:flex-none flex items-center justify-center gap-1.5 px-4 py-3 sm:py-2.5
                            text-sm font-semibold text-gray-700 bg-white border-2 border-gray-300 rounded-xl
                            active:bg-gray-50 transition-colors"
                        >
                          <FileText className="w-4 h-4" />
                          <span className="hidden sm:inline">Chi tiết</span>
                        </button>
                      </div>
                    )}

                    {/* Pending nhưng KHÔNG CÓ quyền duyệt (đơn của mình / không đúng phòng) */}
                    {req.status === 'pending' && !showApprovalActions && (
                      <div className="flex gap-2 mt-4">
                        <button
                          onClick={() => { setSelectedRequest(req); setViewOnly(true); setIsFormOpen(true) }}
                          className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-2.5
                            text-sm font-medium text-gray-700 bg-white border-2 border-gray-300 rounded-xl
                            active:bg-gray-50 transition-colors"
                        >
                          <FileText className="w-4 h-4" />
                          Xem chi tiết
                        </button>
                        {/* Nhân viên có thể hủy đơn pending của mình */}
                        {isOwnRequest && (
                          <button
                            onClick={async () => {
                              if (confirm('Bạn có chắc muốn hủy đơn này?')) {
                                try {
                                  await leaveRequestService.cancel(req.id, employeeId)
                                  queryClient.invalidateQueries({ queryKey: ['leave-requests'] })
                                } catch (err: any) {
                                  alert(err.message || 'Không thể hủy đơn. Vui lòng thử lại.')
                                }
                              }
                            }}
                            className="flex items-center justify-center gap-1.5 px-4 py-2.5
                              text-sm font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-xl
                              active:bg-amber-100 transition-colors"
                          >
                            <X className="w-4 h-4" />
                            Hủy đơn
                          </button>
                        )}
                      </div>
                    )}

                    {/* Đã xử lý - chỉ xem chi tiết */}
                    {req.status !== 'pending' && (
                      <div className="mt-4">
                        <button
                          onClick={() => { setSelectedRequest(req); setViewOnly(true); setIsFormOpen(true) }}
                          className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-2.5
                            text-sm font-medium text-gray-700 bg-white border-2 border-gray-300 rounded-xl
                            active:bg-gray-50 transition-colors"
                        >
                          <FileText className="w-4 h-4" />
                          Xem chi tiết
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════
            PAGINATION
        ══════════════════════════════════════════════════════ */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between bg-white rounded-xl border border-gray-200 px-4 py-3">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300
                rounded-lg active:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Trước
            </button>
            <span className="text-sm text-gray-600">
              Trang {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300
                rounded-lg active:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Sau
            </button>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════
          FORM MODAL
      ══════════════════════════════════════════════════════ */}
      {isFormOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center">
          <div className="bg-white w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-center pt-2 sm:hidden">
              <div className="w-10 h-1 bg-gray-300 rounded-full" />
            </div>
            <div className="sticky top-0 bg-white border-b px-5 py-4 sm:px-6">
              <h2 className="text-lg font-bold text-gray-900">
                {selectedRequest ? 'Chi tiết đơn nghỉ phép' : 'Tạo đơn nghỉ phép'}
              </h2>
            </div>
            <div className="p-5 sm:p-6">
              <LeaveRequestForm
                initialData={selectedRequest as any}
                viewOnly={viewOnly}
                onSuccess={() => {
                  setIsFormOpen(false)
                  setSelectedRequest(null)
                  setViewOnly(false)
                  queryClient.invalidateQueries({ queryKey: ['leave-requests'] })
                }}
                onCancel={() => {
                  setIsFormOpen(false)
                  setSelectedRequest(null)
                  setViewOnly(false)
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          APPROVE CONFIRM DIALOG
      ══════════════════════════════════════════════════════ */}
      {approveId && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center"
          onClick={e => { if (e.target === e.currentTarget) setApproveId(null) }}
        >
          <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl">
            <div className="flex justify-center pt-2 sm:hidden">
              <div className="w-10 h-1 bg-gray-300 rounded-full" />
            </div>
            <div className="p-5 sm:p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                  <CheckCircle className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Xác nhận duyệt</h3>
                  <p className="text-sm text-gray-500 mt-0.5">Duyệt đơn nghỉ phép này?</p>
                </div>
              </div>

              {approveMutation.isError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                  {(approveMutation.error as Error)?.message || 'Lỗi khi duyệt đơn'}
                </div>
              )}

              <div className="flex flex-col-reverse sm:flex-row gap-2.5">
                <button
                  onClick={() => setApproveId(null)}
                  className="w-full sm:w-auto px-5 py-3.5 sm:py-2.5 text-[15px] sm:text-sm text-gray-700
                    bg-white border border-gray-300 rounded-xl active:bg-gray-100"
                >
                  Hủy
                </button>
                <button
                  onClick={() => approveId && approveMutation.mutate(approveId)}
                  disabled={approveMutation.isPending}
                  className="w-full sm:flex-1 flex items-center justify-center gap-2 px-5 py-3.5 sm:py-2.5
                    text-[15px] sm:text-sm font-semibold text-white bg-green-600 rounded-xl
                    active:bg-green-700 disabled:opacity-50"
                >
                  {approveMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle className="w-4 h-4" />
                  )}
                  Xác nhận duyệt
                </button>
              </div>
            </div>
            <div className="h-[env(safe-area-inset-bottom)] sm:hidden" />
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          REJECT MODAL
      ══════════════════════════════════════════════════════ */}
      {rejectId && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center"
          onClick={e => { if (e.target === e.currentTarget) { setRejectId(null); setRejectReason('') }}}
        >
          <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl">
            <div className="flex justify-center pt-2 sm:hidden">
              <div className="w-10 h-1 bg-gray-300 rounded-full" />
            </div>
            <div className="p-5 sm:p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-1">Từ chối đơn nghỉ phép</h3>
              <p className="text-sm text-gray-500 mb-4">Vui lòng nhập lý do từ chối</p>

              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Nhập lý do từ chối..."
                rows={3}
                className="w-full px-4 py-3.5 border border-gray-300 rounded-xl text-[15px] resize-none
                  focus:ring-2 focus:ring-red-500 focus:border-red-500"
                autoFocus
              />

              {rejectMutation.isError && (
                <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                  {(rejectMutation.error as Error)?.message || 'Lỗi khi từ chối đơn'}
                </div>
              )}

              <div className="flex flex-col-reverse sm:flex-row gap-2.5 mt-5">
                <button
                  onClick={() => { setRejectId(null); setRejectReason('') }}
                  className="w-full sm:w-auto px-5 py-3.5 sm:py-2.5 text-[15px] sm:text-sm text-gray-700
                    bg-white border border-gray-300 rounded-xl active:bg-gray-100"
                >
                  Hủy
                </button>
                <button
                  onClick={() => rejectId && rejectMutation.mutate({ id: rejectId, reason: rejectReason })}
                  disabled={!rejectReason.trim() || rejectMutation.isPending}
                  className="w-full sm:flex-1 flex items-center justify-center gap-2 px-5 py-3.5 sm:py-2.5
                    text-[15px] sm:text-sm font-semibold text-white bg-red-600 rounded-xl
                    active:bg-red-700 disabled:opacity-50"
                >
                  {rejectMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <XCircle className="w-4 h-4" />
                  )}
                  Từ chối
                </button>
              </div>
            </div>
            <div className="h-[env(safe-area-inset-bottom)] sm:hidden" />
          </div>
        </div>
      )}
    </div>
  )
}