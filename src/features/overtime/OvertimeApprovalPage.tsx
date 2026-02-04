// ============================================================================
// OVERTIME APPROVAL PAGE
// File: src/features/overtime/OvertimeApprovalPage.tsx
// Huy Anh ERP System - Chấm công V2 (Batch 4)
// ============================================================================
// Trang duyệt phiếu tăng ca:
//   - Manager (4-5): duyệt phiếu trong phòng ban mình
//   - Executive (1-3): duyệt tất cả phiếu
//   - Employee (6-7): không truy cập được
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
import {
  CheckCircle, XCircle, Clock, Calendar, User, Building2,
  MessageSquare, Loader2, AlertTriangle, ChevronDown, ChevronUp,
} from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { overtimeRequestService, type OvertimeRequest } from '../../services/overtimeRequestService'

// ============================================================================
// HELPERS
// ============================================================================

function formatDate(dateStr: string): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('vi-VN', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function formatTime(timeStr: string): string {
  if (!timeStr) return '—'
  return timeStr.slice(0, 5)
}

function formatMinutes(minutes: number): string {
  if (!minutes) return '—'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} phút`
  if (m === 0) return `${h} giờ`
  return `${h}h${m.toString().padStart(2, '0')}`
}

function formatDateTime(dtStr: string): string {
  if (!dtStr) return '—'
  return new Date(dtStr).toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function OvertimeApprovalPage() {
  const { user } = useAuthStore()

  // User info
  const employeeId = user?.employee_id
  const departmentId = user?.department_id
  const userLevel = user?.position_level || 7
  const isExecutive = userLevel <= 3
  const isManager = userLevel <= 5

  // Data state
  const [pendingRequests, setPendingRequests] = useState<OvertimeRequest[]>([])
  const [historyRequests, setHistoryRequests] = useState<OvertimeRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Tab
  const [activeTab, setActiveTab] = useState<'pending' | 'history'>('pending')

  // Action state
  const [actionLoading, setActionLoading] = useState<string | null>(null) // id đang xử lý
  const [rejectModal, setRejectModal] = useState<OvertimeRequest | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [showHistory, setShowHistory] = useState(false)

  // --------------------------------------------------------------------------
  // LOAD DATA
  // --------------------------------------------------------------------------

  const loadPending = useCallback(async () => {
    if (!employeeId) return

    try {
      setLoading(true)
      setError(null)

      let data: OvertimeRequest[]
      if (isExecutive) {
        data = await overtimeRequestService.getAllPending()
      } else if (isManager && departmentId) {
        data = await overtimeRequestService.getPendingByDepartment(departmentId)
      } else {
        data = []
      }

      setPendingRequests(data)
    } catch (err: any) {
      console.error('Error loading pending overtime requests:', err)
      setError(err.message || 'Không thể tải danh sách phiếu chờ duyệt')
    } finally {
      setLoading(false)
    }
  }, [employeeId, departmentId, isExecutive, isManager])

  const loadHistory = useCallback(async () => {
    if (!employeeId) return

    try {
      const result = await overtimeRequestService.getApprovalHistory({
        approverId: employeeId,
        departmentId: isExecutive ? undefined : (departmentId || undefined),
        page: 1,
        pageSize: 20,
      })
      setHistoryRequests(result.data)
    } catch (err: any) {
      console.error('Error loading approval history:', err)
    }
  }, [employeeId, departmentId, isExecutive])

  useEffect(() => {
    loadPending()
  }, [loadPending])

  useEffect(() => {
    if (activeTab === 'history') {
      loadHistory()
    }
  }, [activeTab, loadHistory])

  // --------------------------------------------------------------------------
  // ACTIONS
  // --------------------------------------------------------------------------

  const handleApprove = async (request: OvertimeRequest) => {
    if (!employeeId) return
    if (!confirm(`Duyệt phiếu tăng ca của ${request.employee?.full_name}?`)) return

    try {
      setActionLoading(request.id)
      await overtimeRequestService.approve(request.id, employeeId)
      // Reload danh sách
      loadPending()
    } catch (err: any) {
      alert(err.message || 'Không thể duyệt phiếu')
    } finally {
      setActionLoading(null)
    }
  }

  const openRejectModal = (request: OvertimeRequest) => {
    setRejectModal(request)
    setRejectReason('')
  }

  const handleReject = async () => {
    if (!rejectModal || !employeeId) return
    if (!rejectReason.trim()) {
      alert('Vui lòng nhập lý do từ chối')
      return
    }

    try {
      setActionLoading(rejectModal.id)
      await overtimeRequestService.reject(rejectModal.id, employeeId, rejectReason.trim())
      setRejectModal(null)
      setRejectReason('')
      loadPending()
    } catch (err: any) {
      alert(err.message || 'Không thể từ chối phiếu')
    } finally {
      setActionLoading(null)
    }
  }

  // --------------------------------------------------------------------------
  // PERMISSION CHECK
  // --------------------------------------------------------------------------

  if (!isManager) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
          <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-yellow-800 mb-2">Không có quyền truy cập</h2>
          <p className="text-sm text-yellow-600">
            Chỉ Trưởng phòng trở lên mới có quyền duyệt phiếu tăng ca.
          </p>
        </div>
      </div>
    )
  }

  // --------------------------------------------------------------------------
  // RENDER
  // --------------------------------------------------------------------------

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Duyệt phiếu tăng ca</h1>
        <p className="text-sm text-gray-500 mt-1">
          {isExecutive
            ? 'Duyệt tất cả phiếu đăng ký tăng ca trong công ty'
            : `Duyệt phiếu đăng ký tăng ca trong phòng ${user?.department_name || 'ban'}`}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b mb-6">
        <button
          onClick={() => setActiveTab('pending')}
          className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'pending'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Chờ duyệt
          {pendingRequests.length > 0 && (
            <span className="ml-2 bg-yellow-100 text-yellow-700 text-xs font-bold px-2 py-0.5 rounded-full">
              {pendingRequests.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'history'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Lịch sử duyệt
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 text-red-700 p-4 rounded-lg mb-6 text-sm">
          {error}
        </div>
      )}

      {/* Tab: Pending */}
      {activeTab === 'pending' && (
        <div>
          {loading ? (
            <div className="flex items-center justify-center py-12 text-gray-500">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              Đang tải...
            </div>
          ) : pendingRequests.length === 0 ? (
            <div className="bg-white rounded-lg border p-12 text-center">
              <CheckCircle className="w-12 h-12 text-green-300 mx-auto mb-3" />
              <h3 className="text-lg font-medium text-gray-700 mb-1">Không có phiếu chờ duyệt</h3>
              <p className="text-sm text-gray-500">Tất cả phiếu tăng ca đã được xử lý.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {pendingRequests.map((request) => (
                <PendingCard
                  key={request.id}
                  request={request}
                  isLoading={actionLoading === request.id}
                  onApprove={() => handleApprove(request)}
                  onReject={() => openRejectModal(request)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: History */}
      {activeTab === 'history' && (
        <div>
          {historyRequests.length === 0 ? (
            <div className="bg-white rounded-lg border p-12 text-center">
              <Clock className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <h3 className="text-lg font-medium text-gray-700 mb-1">Chưa có lịch sử</h3>
              <p className="text-sm text-gray-500">Bạn chưa duyệt/từ chối phiếu nào.</p>
            </div>
          ) : (
            <div className="bg-white rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Nhân viên</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Ngày OT</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Giờ OT</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Thời lượng</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">Kết quả</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Thời gian xử lý</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {historyRequests.map((req) => (
                    <tr key={req.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{req.employee?.full_name}</div>
                        <div className="text-xs text-gray-500">{req.employee?.department?.name}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{formatDate(req.request_date)}</td>
                      <td className="px-4 py-3 text-gray-600">
                        {formatTime(req.planned_start_time)} — {formatTime(req.planned_end_time)}
                      </td>
                      <td className="px-4 py-3 font-medium">{formatMinutes(req.planned_minutes)}</td>
                      <td className="px-4 py-3 text-center">
                        {req.status === 'approved' ? (
                          <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                            Đã duyệt
                          </span>
                        ) : (
                          <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
                            Từ chối
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {formatDateTime(req.approved_at || '')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Reject Modal */}
      {rejectModal && (
        <RejectModal
          request={rejectModal}
          reason={rejectReason}
          onReasonChange={setRejectReason}
          onConfirm={handleReject}
          onClose={() => setRejectModal(null)}
          isLoading={actionLoading === rejectModal.id}
        />
      )}
    </div>
  )
}

// ============================================================================
// PENDING CARD (sub-component)
// ============================================================================

function PendingCard({
  request,
  isLoading,
  onApprove,
  onReject,
}: {
  request: OvertimeRequest
  isLoading: boolean
  onApprove: () => void
  onReject: () => void
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="bg-white rounded-lg border hover:shadow-sm transition-shadow">
      {/* Main row */}
      <div className="flex items-center gap-4 px-5 py-4">
        {/* Employee info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center font-bold text-sm shrink-0">
              {(request.employee?.full_name || '?')[0]}
            </div>
            <div className="min-w-0">
              <div className="font-medium text-gray-900 truncate">{request.employee?.full_name}</div>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <Building2 className="w-3 h-3" />
                {request.employee?.department?.name || '—'}
              </div>
            </div>
          </div>
        </div>

        {/* Date */}
        <div className="text-center shrink-0">
          <div className="text-xs text-gray-500">Ngày OT</div>
          <div className="font-medium text-gray-900 text-sm">{formatDate(request.request_date)}</div>
        </div>

        {/* Time */}
        <div className="text-center shrink-0">
          <div className="text-xs text-gray-500">Giờ OT</div>
          <div className="font-medium text-gray-900 text-sm">
            {formatTime(request.planned_start_time)} — {formatTime(request.planned_end_time)}
          </div>
        </div>

        {/* Duration */}
        <div className="text-center shrink-0">
          <div className="text-xs text-gray-500">Thời lượng</div>
          <div className="font-bold text-blue-600 text-sm">{formatMinutes(request.planned_minutes)}</div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onApprove}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium disabled:opacity-50"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            Duyệt
          </button>
          <button
            onClick={onReject}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-2 bg-white border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors text-sm font-medium disabled:opacity-50"
          >
            <XCircle className="w-4 h-4" />
            Từ chối
          </button>
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="px-5 py-3 border-t bg-gray-50 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="text-gray-500">Ca làm việc:</span>{' '}
              <span className="text-gray-900">{request.shift?.name || 'Không xác định'}</span>
            </div>
            <div>
              <span className="text-gray-500">Ngày tạo:</span>{' '}
              <span className="text-gray-900">{formatDateTime(request.created_at)}</span>
            </div>
          </div>
          <div className="mt-2">
            <span className="text-gray-500">Lý do:</span>{' '}
            <span className="text-gray-900">{request.reason}</span>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// REJECT MODAL (sub-component)
// ============================================================================

function RejectModal({
  request,
  reason,
  onReasonChange,
  onConfirm,
  onClose,
  isLoading,
}: {
  request: OvertimeRequest
  reason: string
  onReasonChange: (val: string) => void
  onConfirm: () => void
  onClose: () => void
  isLoading: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-6 py-4 border-b">
          <XCircle className="w-5 h-5 text-red-500" />
          <h2 className="text-lg font-bold text-gray-900">Từ chối phiếu tăng ca</h2>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-4">
          {/* Info */}
          <div className="bg-gray-50 rounded-lg p-3 text-sm">
            <div className="flex items-center gap-2 mb-1">
              <User className="w-4 h-4 text-gray-500" />
              <span className="font-medium text-gray-900">{request.employee?.full_name}</span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gray-500" />
              <span className="text-gray-600">
                {formatDate(request.request_date)} | {formatTime(request.planned_start_time)} — {formatTime(request.planned_end_time)} ({formatMinutes(request.planned_minutes)})
              </span>
            </div>
          </div>

          {/* Reason */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Lý do từ chối <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => onReasonChange(e.target.value)}
              rows={3}
              placeholder="Nhập lý do từ chối phiếu tăng ca..."
              className="w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 text-sm resize-none"
              autoFocus
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-gray-50 rounded-b-xl flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2.5 border rounded-lg text-gray-700 hover:bg-gray-100 transition-colors text-sm font-medium disabled:opacity-50"
          >
            Hủy
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading || !reason.trim()}
            className="flex items-center gap-2 px-5 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Đang xử lý...
              </>
            ) : (
              <>
                <XCircle className="w-4 h-4" />
                Xác nhận từ chối
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}