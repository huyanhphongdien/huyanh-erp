// ============================================================================
// OVERTIME LIST PAGE
// File: src/features/overtime/OvertimeListPage.tsx
// Huy Anh ERP System - Chấm công V2 (Batch 4)
// ============================================================================
// Hiển thị danh sách phiếu tăng ca:
//   - Employee (6-7): xem phiếu của mình
//   - Manager (4-5): xem phiếu phòng ban mình
//   - Executive (1-3): xem tất cả
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
import { Plus, Clock, Filter, Search, Trash2, Eye, ChevronLeft, ChevronRight } from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { overtimeRequestService, type OvertimeRequest } from '../../services/overtimeRequestService'
import OvertimeRequestForm from './OvertimeRequestForm'

// ============================================================================
// HELPERS
// ============================================================================

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending:   { label: 'Chờ duyệt',  color: 'text-yellow-700', bg: 'bg-yellow-100' },
  approved:  { label: 'Đã duyệt',   color: 'text-green-700',  bg: 'bg-green-100' },
  rejected:  { label: 'Từ chối',     color: 'text-red-700',    bg: 'bg-red-100' },
  completed: { label: 'Hoàn thành',  color: 'text-blue-700',   bg: 'bg-blue-100' },
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatTime(timeStr: string): string {
  if (!timeStr) return '—'
  return timeStr.slice(0, 5) // "HH:mm"
}

function formatMinutes(minutes: number): string {
  if (!minutes) return '—'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} phút`
  if (m === 0) return `${h} giờ`
  return `${h}h${m.toString().padStart(2, '0')}`
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function OvertimeListPage() {
  const { user } = useAuthStore()

  // Data
  const [requests, setRequests] = useState<OvertimeRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Pagination
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const pageSize = 10

  // Filters
  const [statusFilter, setStatusFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // Modal
  const [showForm, setShowForm] = useState(false)
  const [showDetail, setShowDetail] = useState<OvertimeRequest | null>(null)

  // User info
  const employeeId = user?.employee_id
  const departmentId = user?.department_id
  const userLevel = user?.position_level || 7
  const isManager = userLevel <= 5  // Manager (4-5) hoặc Executive (1-3)
  const isExecutive = userLevel <= 3

  // --------------------------------------------------------------------------
  // LOAD DATA
  // --------------------------------------------------------------------------

  const loadRequests = useCallback(async () => {
    if (!employeeId) return

    try {
      setLoading(true)
      setError(null)

      const result = await overtimeRequestService.getAll({
        page,
        pageSize,
        status: statusFilter === 'all' ? undefined : statusFilter,
        // Employee: chỉ xem của mình, Manager: phòng ban, Executive: tất cả
        employee_id: !isManager ? employeeId : undefined,
        department_id: isManager && !isExecutive ? (departmentId || undefined) : undefined,
        from_date: dateFrom || undefined,
        to_date: dateTo || undefined,
      })

      setRequests(result.data)
      setTotal(result.total)
      setTotalPages(result.totalPages)
    } catch (err: any) {
      console.error('Error loading overtime requests:', err)
      setError(err.message || 'Không thể tải danh sách phiếu tăng ca')
    } finally {
      setLoading(false)
    }
  }, [employeeId, departmentId, isManager, isExecutive, page, pageSize, statusFilter, dateFrom, dateTo])

  useEffect(() => {
    loadRequests()
  }, [loadRequests])

  // Reset page khi filter thay đổi
  useEffect(() => {
    setPage(1)
  }, [statusFilter, dateFrom, dateTo])

  // --------------------------------------------------------------------------
  // ACTIONS
  // --------------------------------------------------------------------------

  const handleCancel = async (id: string) => {
    if (!confirm('Bạn có chắc muốn hủy phiếu tăng ca này?')) return

    try {
      await overtimeRequestService.cancel(id)
      loadRequests()
    } catch (err: any) {
      alert(err.message || 'Không thể hủy phiếu')
    }
  }

  const handleFormSuccess = () => {
    setShowForm(false)
    loadRequests()
  }

  // --------------------------------------------------------------------------
  // STATS
  // --------------------------------------------------------------------------

  const stats = {
    total: total,
    pending: requests.filter(r => r.status === 'pending').length,
    approved: requests.filter(r => r.status === 'approved').length,
    rejected: requests.filter(r => r.status === 'rejected').length,
  }

  // --------------------------------------------------------------------------
  // RENDER
  // --------------------------------------------------------------------------

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isManager ? 'Quản lý tăng ca' : 'Tăng ca của tôi'}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {isManager
              ? isExecutive
                ? 'Xem tất cả phiếu đăng ký tăng ca'
                : 'Phiếu đăng ký tăng ca trong phòng ban'
              : 'Quản lý các phiếu đăng ký tăng ca của bạn'}
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm"
        >
          <Plus className="w-4 h-4" />
          Tạo phiếu tăng ca
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg border p-4">
          <div className="text-sm text-gray-500">Tổng phiếu</div>
          <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="text-sm text-yellow-600">Chờ duyệt</div>
          <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="text-sm text-green-600">Đã duyệt</div>
          <div className="text-2xl font-bold text-green-600">{stats.approved}</div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="text-sm text-red-600">Từ chối</div>
          <div className="text-2xl font-bold text-red-600">{stats.rejected}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border p-4 mb-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <span className="text-sm font-medium text-gray-600">Lọc:</span>
          </div>

          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-sm border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="all">Tất cả trạng thái</option>
            <option value="pending">Chờ duyệt</option>
            <option value="approved">Đã duyệt</option>
            <option value="rejected">Từ chối</option>
            <option value="completed">Hoàn thành</option>
          </select>

          {/* Date range */}
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="text-sm border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Từ ngày"
            />
            <span className="text-gray-400">→</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="text-sm border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Đến ngày"
            />
          </div>

          {/* Clear filters */}
          {(statusFilter !== 'all' || dateFrom || dateTo) && (
            <button
              onClick={() => {
                setStatusFilter('all')
                setDateFrom('')
                setDateTo('')
              }}
              className="text-sm text-blue-600 hover:text-blue-800 underline"
            >
              Xóa bộ lọc
            </button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 text-red-700 p-4 rounded-lg mb-6 text-sm">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-lg border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {isManager && <th className="text-left px-4 py-3 font-medium text-gray-600">Nhân viên</th>}
                <th className="text-left px-4 py-3 font-medium text-gray-600">Ngày tăng ca</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Ca làm</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Giờ OT</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Thời lượng</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Lý do</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Trạng thái</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Người duyệt</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? (
                <tr>
                  <td colSpan={isManager ? 9 : 8} className="px-4 py-12 text-center text-gray-500">
                    <div className="flex items-center justify-center gap-2">
                      <Clock className="w-5 h-5 animate-spin" />
                      Đang tải...
                    </div>
                  </td>
                </tr>
              ) : requests.length === 0 ? (
                <tr>
                  <td colSpan={isManager ? 9 : 8} className="px-4 py-12 text-center text-gray-500">
                    <div className="flex flex-col items-center gap-2">
                      <Search className="w-8 h-8 text-gray-300" />
                      <span>Không có phiếu tăng ca nào</span>
                      <button
                        onClick={() => setShowForm(true)}
                        className="text-blue-600 hover:text-blue-800 text-sm underline mt-1"
                      >
                        Tạo phiếu mới
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                requests.map((req) => {
                  const statusCfg = STATUS_CONFIG[req.status] || STATUS_CONFIG.pending
                  return (
                    <tr key={req.id} className="hover:bg-gray-50 transition-colors">
                      {/* Nhân viên (chỉ hiện cho Manager) */}
                      {isManager && (
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900">
                            {req.employee?.full_name || '—'}
                          </div>
                          <div className="text-xs text-gray-500">
                            {req.employee?.department?.name || ''}
                          </div>
                        </td>
                      )}

                      {/* Ngày tăng ca */}
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {formatDate(req.request_date)}
                      </td>

                      {/* Ca làm */}
                      <td className="px-4 py-3 text-gray-600">
                        {req.shift?.name || '—'}
                      </td>

                      {/* Giờ OT */}
                      <td className="px-4 py-3 text-gray-600">
                        {formatTime(req.planned_start_time)} — {formatTime(req.planned_end_time)}
                      </td>

                      {/* Thời lượng */}
                      <td className="px-4 py-3">
                        <span className="font-medium text-gray-900">
                          {formatMinutes(req.planned_minutes)}
                        </span>
                      </td>

                      {/* Lý do */}
                      <td className="px-4 py-3 text-gray-600 max-w-[200px] truncate" title={req.reason}>
                        {req.reason}
                      </td>

                      {/* Trạng thái */}
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${statusCfg.bg} ${statusCfg.color}`}>
                          {statusCfg.label}
                        </span>
                      </td>

                      {/* Người duyệt */}
                      <td className="px-4 py-3 text-gray-600">
                        {req.approver?.full_name || '—'}
                      </td>

                      {/* Thao tác */}
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => setShowDetail(req)}
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                            title="Xem chi tiết"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {/* Chỉ hiện nút hủy cho phiếu pending của chính mình */}
                          {req.status === 'pending' && req.employee_id === employeeId && (
                            <button
                              onClick={() => handleCancel(req.id)}
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                              title="Hủy phiếu"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50">
            <div className="text-sm text-gray-500">
              Hiển thị {((page - 1) * pageSize) + 1}–{Math.min(page * pageSize, total)} / {total} phiếu
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1.5 rounded border bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm text-gray-600">
                Trang {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-1.5 rounded border bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {showDetail && (
        <DetailModal
          request={showDetail}
          onClose={() => setShowDetail(null)}
        />
      )}

      {/* Create Form Modal */}
      {showForm && (
        <OvertimeRequestForm
          onSuccess={handleFormSuccess}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  )
}

// ============================================================================
// DETAIL MODAL (sub-component)
// ============================================================================

function DetailModal({
  request,
  onClose,
}: {
  request: OvertimeRequest
  onClose: () => void
}) {
  const statusCfg = STATUS_CONFIG[request.status] || STATUS_CONFIG.pending

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-bold text-gray-900">Chi tiết phiếu tăng ca</h2>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 rounded"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-4">
          {/* Trạng thái */}
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500 w-28">Trạng thái:</span>
            <span className={`inline-flex px-3 py-1 rounded-full text-sm font-medium ${statusCfg.bg} ${statusCfg.color}`}>
              {statusCfg.label}
            </span>
          </div>

          {/* Nhân viên */}
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500 w-28">Nhân viên:</span>
            <div>
              <div className="font-medium text-gray-900">{request.employee?.full_name || '—'}</div>
              <div className="text-xs text-gray-500">{request.employee?.department?.name}</div>
            </div>
          </div>

          {/* Ngày */}
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500 w-28">Ngày tăng ca:</span>
            <span className="font-medium text-gray-900">{formatDate(request.request_date)}</span>
          </div>

          {/* Ca */}
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500 w-28">Ca làm việc:</span>
            <span className="text-gray-900">{request.shift?.name || 'Không xác định'}</span>
          </div>

          {/* Giờ OT */}
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500 w-28">Giờ tăng ca:</span>
            <span className="text-gray-900">
              {formatTime(request.planned_start_time)} — {formatTime(request.planned_end_time)}
              <span className="text-gray-500 ml-2">({formatMinutes(request.planned_minutes)})</span>
            </span>
          </div>

          {/* Lý do */}
          <div className="flex gap-3">
            <span className="text-sm text-gray-500 w-28 shrink-0">Lý do:</span>
            <span className="text-gray-900">{request.reason}</span>
          </div>

          {/* Người duyệt */}
          {request.approved_by && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500 w-28">Người duyệt:</span>
              <span className="text-gray-900">{request.approver?.full_name || '—'}</span>
            </div>
          )}

          {/* Lý do từ chối */}
          {request.rejection_reason && request.status === 'rejected' && (
            <div className="flex gap-3">
              <span className="text-sm text-gray-500 w-28 shrink-0">Lý do từ chối:</span>
              <span className="text-red-600">{request.rejection_reason}</span>
            </div>
          )}

          {/* Thời gian thực tế (nếu có) */}
          {request.actual_start_time && (
            <div className="border-t pt-4 mt-4">
              <div className="text-sm font-medium text-gray-700 mb-2">Thời gian thực tế</div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-500 w-28">Giờ thực tế:</span>
                <span className="text-gray-900">
                  {formatTime(request.actual_start_time)} — {formatTime(request.actual_end_time || '')}
                  {request.actual_minutes && (
                    <span className="text-gray-500 ml-2">({formatMinutes(request.actual_minutes)})</span>
                  )}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-gray-50 rounded-b-xl">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 border rounded-lg text-gray-700 hover:bg-gray-100 transition-colors text-sm font-medium"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  )
}