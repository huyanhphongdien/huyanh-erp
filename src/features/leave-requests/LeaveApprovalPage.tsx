// ============================================================================
// LEAVE APPROVAL PAGE - MOBILE-FIRST
// File: src/features/leave/LeaveApprovalPage.tsx
// Huy Anh ERP System
// ============================================================================
// Mobile-first design với:
//   - 44px+ touch targets
//   - Bottom-sheet modals
//   - Safe-area padding
//   - Sticky action bars
//   - Batch approve/reject
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
import {
  CheckCircle, XCircle, Clock, Calendar, User, Building2,
  Loader2, AlertTriangle, ChevronDown, ChevronUp,
  CheckSquare, Square, RefreshCw, X, SlidersHorizontal
} from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { leaveRequestService, type LeaveRequest } from '../../services/leaveRequestService'
import type { BatchResult } from '../../types/common'

// ============================================================================
// HELPERS
// ============================================================================

function formatDate(dateStr: string): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return d.toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' })
}

function formatDateTime(dt: string): string {
  if (!dt) return '—'
  return new Date(dt).toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

const STATUS_CFG: Record<string, { label: string; cls: string }> = {
  pending:  { label: 'Chờ duyệt', cls: 'bg-amber-100 text-amber-800 border-amber-200' },
  approved: { label: 'Đã duyệt',  cls: 'bg-green-100 text-green-800 border-green-200' },
  rejected: { label: 'Từ chối',   cls: 'bg-red-100 text-red-800 border-red-200' },
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function LeaveApprovalPage() {
  const { user } = useAuthStore()
  const employeeId = user?.employee_id || ''
  const userLevel = user?.position_level || 7

  // Permission check
  const isExecutive = userLevel <= 3
  const isManager = userLevel >= 4 && userLevel <= 5
  const canApprove = isExecutive || isManager

  // State
  const [tab, setTab] = useState<'pending' | 'history'>('pending')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  const [pendingList, setPendingList] = useState<LeaveRequest[]>([])
  const [historyList, setHistoryList] = useState<LeaveRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // Multi-select
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [batchProcessing, setBatchProcessing] = useState(false)
  const [batchResult, setBatchResult] = useState<BatchResult | null>(null)

  // Single actions
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [actionError, setActionError] = useState('')

  // Batch reject dialog
  const [showBatchReject, setShowBatchReject] = useState(false)
  const [batchRejectReason, setBatchRejectReason] = useState('')

  const hasFilters = !!(dateFrom || dateTo)
  const hasSelection = selected.size > 0
  const isAllSelected = pendingList.length > 0 && selected.size === pendingList.length

  // ══════════════════════════════════════════════════════
  // DATA
  // ══════════════════════════════════════════════════════

  const loadData = useCallback(async () => {
    if (!employeeId) return
    setLoading(true)
    try {
      const [pending, history] = await Promise.all([
        leaveRequestService.getPendingApprovals(employeeId, 'pending', dateFrom || undefined, dateTo || undefined),
        leaveRequestService.getApprovalHistory(employeeId, 30),
      ])
      setPendingList(pending)
      setHistoryList(history)
      setSelected(new Set())
    } catch (err) {
      console.error('Load error:', err)
    } finally {
      setLoading(false)
    }
  }, [employeeId, dateFrom, dateTo])

  useEffect(() => { loadData() }, [loadData])

  const refresh = async () => {
    setRefreshing(true)
    await loadData()
    setRefreshing(false)
  }

  // ══════════════════════════════════════════════════════
  // SELECTION
  // ══════════════════════════════════════════════════════

  const toggle = (id: string) => {
    setSelected(prev => {
      const s = new Set(prev)
      s.has(id) ? s.delete(id) : s.add(id)
      return s
    })
  }

  const toggleAll = () => {
    setSelected(isAllSelected ? new Set() : new Set(pendingList.map(r => r.id)))
  }

  // ══════════════════════════════════════════════════════
  // ACTIONS
  // ══════════════════════════════════════════════════════

  const handleApprove = async (id: string) => {
    setActionLoading(true)
    setActionError('')
    try {
      await leaveRequestService.approve(id, employeeId)
      await loadData()
    } catch (e: any) {
      setActionError(e.message || 'Lỗi duyệt đơn')
    } finally {
      setActionLoading(false)
    }
  }

  const handleReject = async (id: string) => {
    if (!rejectReason.trim()) { setActionError('Vui lòng nhập lý do'); return }
    setActionLoading(true)
    setActionError('')
    try {
      await leaveRequestService.reject(id, employeeId, rejectReason.trim())
      setRejectingId(null)
      setRejectReason('')
      await loadData()
    } catch (e: any) {
      setActionError(e.message || 'Lỗi từ chối')
    } finally {
      setActionLoading(false)
    }
  }

  const handleBatchApprove = async () => {
    if (!hasSelection) return
    setBatchProcessing(true)
    setBatchResult(null)
    try {
      const r = await leaveRequestService.batchApprove(Array.from(selected), employeeId)
      setBatchResult(r)
      await loadData()
    } catch (e: any) {
      setActionError(e.message || 'Lỗi duyệt hàng loạt')
    } finally {
      setBatchProcessing(false)
    }
  }

  const handleBatchReject = async () => {
    if (!hasSelection || !batchRejectReason.trim()) return
    setBatchProcessing(true)
    setBatchResult(null)
    try {
      const r = await leaveRequestService.batchReject(Array.from(selected), employeeId, batchRejectReason.trim())
      setBatchResult(r)
      setShowBatchReject(false)
      setBatchRejectReason('')
      await loadData()
    } catch (e: any) {
      setActionError(e.message || 'Lỗi từ chối hàng loạt')
    } finally {
      setBatchProcessing(false)
    }
  }

  // ══════════════════════════════════════════════════════
  // ACCESS CHECK
  // ══════════════════════════════════════════════════════

  if (!canApprove) {
    return (
      <div className="p-4 sm:p-6 max-w-4xl mx-auto">
        <div className="text-center py-16 bg-white rounded-2xl border">
          <AlertTriangle className="w-14 h-14 text-amber-300 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-gray-900">Không có quyền truy cập</h2>
          <p className="text-sm text-gray-500 mt-2 px-6">
            Chỉ Trưởng phòng, Phó phòng và Ban Giám đốc mới có thể duyệt đơn nghỉ phép
          </p>
          <p className="text-xs text-gray-400 mt-3">
            Cấp bậc của bạn: Level {userLevel} {userLevel >= 6 ? '(Nhân viên)' : ''}
          </p>
        </div>
      </div>
    )
  }

  // ══════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════

  return (
    <div className="min-h-screen bg-gray-50 sm:bg-transparent">
      {/* Mobile Header */}
      <div className="sticky top-0 z-20 bg-white border-b px-4 py-3 sm:relative sm:bg-transparent sm:border-0 sm:px-6 sm:py-0 sm:mb-4">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-lg sm:text-2xl font-bold text-gray-900">Duyệt đơn nghỉ phép</h1>
          <p className="text-xs text-gray-500 mt-0.5 hidden sm:block">
            Phê duyệt hoặc từ chối đơn nghỉ phép của nhân viên
          </p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 sm:py-0 space-y-3 sm:space-y-4">

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          <button
            onClick={() => { setTab('pending'); setSelected(new Set()) }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
              tab === 'pending' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 active:bg-gray-200'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>Chờ duyệt</span>
            {pendingList.length > 0 && (
              <span className="ml-0.5 px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[10px] rounded-full font-bold">
                {pendingList.length}
              </span>
            )}
          </button>
          <button
            onClick={() => { setTab('history'); setSelected(new Set()) }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
              tab === 'history' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 active:bg-gray-200'
            }`}
          >
            <CheckCircle className="w-4 h-4" />
            <span>Đã xử lý</span>
          </button>
        </div>

        {/* Filters */}
        {tab === 'pending' && (
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
                onClick={refresh}
                disabled={refreshing}
                className="flex items-center gap-1.5 px-3.5 py-2.5 text-sm text-gray-600 bg-white border border-gray-200 rounded-xl active:bg-gray-50"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Làm mới</span>
              </button>
            </div>

            {showFilters && (
              <div className="flex gap-2 p-3 bg-white rounded-xl border border-gray-200">
                <div className="flex-1">
                  <label className="text-[11px] text-gray-500 font-medium block mb-1">Từ ngày</label>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={e => setDateFrom(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-[11px] text-gray-500 font-medium block mb-1">Đến ngày</label>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={e => setDateTo(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
                {hasFilters && (
                  <button
                    onClick={() => { setDateFrom(''); setDateTo('') }}
                    className="self-end px-2.5 py-2.5 text-gray-400 hover:text-red-500"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Batch Result */}
        {batchResult && (
          <div className={`p-3.5 rounded-xl border text-sm ${
            batchResult.failed === 0
              ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-amber-50 border-amber-200 text-amber-800'
          }`}>
            <div className="flex items-center justify-between">
              <span className="font-semibold">
                {batchResult.failed === 0
                  ? `✅ Đã xử lý ${batchResult.success} đơn`
                  : `⚠️ OK: ${batchResult.success} — Lỗi: ${batchResult.failed}`
                }
              </span>
              <button onClick={() => setBatchResult(null)} className="text-xs underline opacity-70">
                Đóng
              </button>
            </div>
            {batchResult.errors.length > 0 && (
              <ul className="mt-2 text-xs space-y-0.5">
                {batchResult.errors.map((e, i) => <li key={i}>• {e.error}</li>)}
              </ul>
            )}
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Loader2 className="w-7 h-7 animate-spin text-blue-500" />
            <span className="mt-2 text-sm text-gray-500">Đang tải...</span>
          </div>
        ) : tab === 'pending' ? (
          /* PENDING */
          pendingList.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl border">
              <CheckCircle className="w-14 h-14 text-green-200 mx-auto mb-4" />
              <p className="text-gray-500 font-medium">Không có đơn chờ duyệt</p>
            </div>
          ) : (
            <div className="space-y-2.5 pb-28 sm:pb-4">
              {/* Select all */}
              <button
                onClick={toggleAll}
                className="flex items-center gap-2 px-1 py-1 text-sm text-gray-600 active:text-blue-600"
              >
                {isAllSelected
                  ? <CheckSquare className="w-5 h-5 text-blue-600" />
                  : <Square className="w-5 h-5" />
                }
                <span>{isAllSelected ? 'Bỏ chọn tất cả' : `Chọn tất cả (${pendingList.length})`}</span>
              </button>

              {pendingList.map(req => {
                const emp = Array.isArray(req.employee) ? req.employee[0] : req.employee
                const dept = emp?.department
                const leaveType = Array.isArray(req.leave_type) ? req.leave_type[0] : req.leave_type
                const isExpanded = expandedId === req.id
                const isRejecting = rejectingId === req.id
                const isSelected = selected.has(req.id)

                return (
                  <div
                    key={req.id}
                    className={`bg-white rounded-2xl border-2 transition-colors ${
                      isSelected ? 'border-blue-300 shadow-sm' : 'border-gray-100'
                    }`}
                  >
                    <div className="p-4">
                      {/* Top row */}
                      <div className="flex items-start gap-3">
                        {/* Checkbox */}
                        <button
                          onClick={() => toggle(req.id)}
                          className="w-11 h-11 flex items-center justify-center flex-shrink-0 -ml-1 -mt-1 rounded-lg active:bg-gray-100"
                        >
                          {isSelected
                            ? <CheckSquare className="w-5 h-5 text-blue-600" />
                            : <Square className="w-5 h-5 text-gray-300" />
                          }
                        </button>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between">
                            <div>
                              <h3 className="text-[15px] font-semibold text-gray-900 leading-snug">
                                {emp?.full_name || 'N/A'}
                              </h3>
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
                              className="w-10 h-10 flex items-center justify-center -mr-2 -mt-1 rounded-full active:bg-gray-100"
                            >
                              {isExpanded
                                ? <ChevronUp className="w-5 h-5 text-gray-400" />
                                : <ChevronDown className="w-5 h-5 text-gray-400" />
                              }
                            </button>
                          </div>

                          {/* Chips */}
                          <div className="flex flex-wrap items-center gap-2 mt-2.5">
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
                        </div>
                      </div>

                      {/* Expanded */}
                      {isExpanded && (
                        <div className="mt-4 pt-3 border-t border-gray-100 ml-10">
                          <div className="space-y-2.5 text-sm">
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
                              <p className="text-gray-600 mt-0.5">{formatDateTime(req.created_at || '')}</p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Reject form */}
                      {isRejecting && (
                        <div className="mt-4 pt-3 border-t border-gray-100 ml-10">
                          <textarea
                            value={rejectReason}
                            onChange={e => setRejectReason(e.target.value)}
                            placeholder="Nhập lý do từ chối..."
                            rows={2}
                            className="w-full px-3.5 py-3 border border-gray-300 rounded-xl text-sm resize-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
                            autoFocus
                          />
                          {actionError && <p className="text-xs text-red-500 mt-1.5">{actionError}</p>}
                          <div className="flex gap-2 mt-3">
                            <button
                              onClick={() => handleReject(req.id)}
                              disabled={actionLoading}
                              className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-white bg-red-600 rounded-xl active:bg-red-700 disabled:opacity-50"
                            >
                              {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                              Xác nhận
                            </button>
                            <button
                              onClick={() => { setRejectingId(null); setRejectReason(''); setActionError('') }}
                              className="px-4 py-2.5 text-sm text-gray-600 active:bg-gray-100 rounded-xl"
                            >
                              Hủy
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Action buttons */}
                      {!isRejecting && (
                        <div className="flex gap-2.5 mt-4 ml-10">
                          <button
                            onClick={() => handleApprove(req.id)}
                            disabled={actionLoading}
                            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-3 sm:py-2.5
                              text-sm font-semibold text-green-700 bg-green-50 border border-green-200 rounded-xl
                              active:bg-green-100 disabled:opacity-50 transition-colors"
                          >
                            <CheckCircle className="w-4 h-4" />
                            Duyệt
                          </button>
                          <button
                            onClick={() => { setRejectingId(req.id); setActionError('') }}
                            disabled={actionLoading}
                            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-3 sm:py-2.5
                              text-sm font-semibold text-red-700 bg-red-50 border border-red-200 rounded-xl
                              active:bg-red-100 disabled:opacity-50 transition-colors"
                          >
                            <XCircle className="w-4 h-4" />
                            Từ chối
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        ) : (
          /* HISTORY */
          historyList.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl border">
              <Clock className="w-14 h-14 text-gray-200 mx-auto mb-4" />
              <p className="text-gray-500 font-medium">Chưa có lịch sử duyệt</p>
            </div>
          ) : (
            <div className="space-y-2.5 pb-4">
              {historyList.map(req => {
                const emp = Array.isArray(req.employee) ? req.employee[0] : req.employee
                const leaveType = Array.isArray(req.leave_type) ? req.leave_type[0] : req.leave_type
                const st = STATUS_CFG[req.status] || STATUS_CFG.pending

                return (
                  <div key={req.id} className="bg-white rounded-2xl border border-gray-100 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-[15px] font-semibold text-gray-900">
                            {emp?.full_name || 'N/A'}
                          </h3>
                          <span className={`px-2 py-0.5 text-[11px] font-bold rounded-full border ${st.cls}`}>
                            {st.label}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 mt-2">
                          {leaveType && (
                            <span
                              className="inline-flex px-2 py-0.5 rounded text-xs font-medium text-white"
                              style={{ backgroundColor: leaveType.color }}
                            >
                              {leaveType.name}
                            </span>
                          )}
                          <span className="text-xs text-gray-500">
                            {formatDate(req.start_date)} — {formatDate(req.end_date)}
                          </span>
                          <span className="text-xs font-bold text-blue-600">
                            {req.total_days} ngày
                          </span>
                        </div>
                        {req.approval_notes && (
                          <div className="mt-2.5 text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100">
                            <span className="font-medium">Ghi chú: </span>
                            {req.approval_notes}
                          </div>
                        )}
                      </div>
                      <span className="text-[11px] text-gray-400 whitespace-nowrap flex-shrink-0">
                        {formatDateTime(req.approved_at || '')}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        )}
      </div>

      {/* STICKY BATCH TOOLBAR */}
      {tab === 'pending' && hasSelection && (
        <div className="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-gray-200 shadow-lg
          px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:pb-3
          sm:sticky sm:bottom-auto sm:top-16 sm:z-20 sm:rounded-xl sm:mx-6 sm:shadow-md sm:border sm:border-blue-200 sm:bg-blue-50 sm:mt-3"
        >
          <div className="max-w-5xl mx-auto flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-800 flex-shrink-0">
              <CheckSquare className="w-4 h-4 text-blue-600" />
              <span>{selected.size}</span>
              <span className="hidden sm:inline">đơn đã chọn</span>
            </div>

            <div className="flex gap-2 flex-1 sm:flex-none sm:ml-auto">
              <button
                onClick={handleBatchApprove}
                disabled={batchProcessing}
                className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-3 sm:py-2.5
                  text-sm font-semibold text-white bg-green-600 rounded-xl
                  active:bg-green-700 disabled:opacity-50 transition-colors"
              >
                {batchProcessing
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <CheckCircle className="w-4 h-4" />
                }
                <span>Duyệt</span>
                <span className="hidden sm:inline">({selected.size})</span>
              </button>
              <button
                onClick={() => setShowBatchReject(true)}
                disabled={batchProcessing}
                className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-3 sm:py-2.5
                  text-sm font-semibold text-white bg-red-600 rounded-xl
                  active:bg-red-700 disabled:opacity-50 transition-colors"
              >
                <XCircle className="w-4 h-4" />
                <span>Từ chối</span>
                <span className="hidden sm:inline">({selected.size})</span>
              </button>
              <button
                onClick={() => setSelected(new Set())}
                className="w-11 h-11 sm:w-auto sm:h-auto sm:px-3 sm:py-2.5 flex items-center justify-center
                  text-gray-500 active:bg-gray-100 rounded-xl"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BATCH REJECT DIALOG */}
      {showBatchReject && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center"
          onClick={e => { if (e.target === e.currentTarget) { setShowBatchReject(false); setBatchRejectReason('') }}}
        >
          <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl">
            {/* Drag handle */}
            <div className="flex justify-center pt-2 sm:hidden">
              <div className="w-10 h-1 bg-gray-300 rounded-full" />
            </div>

            <div className="p-5 sm:p-6">
              <h3 className="text-lg font-bold text-gray-900">
                Từ chối {selected.size} đơn
              </h3>
              <p className="text-sm text-gray-500 mt-1 mb-4">
                Lý do sẽ áp dụng cho tất cả đơn được chọn
              </p>

              <textarea
                value={batchRejectReason}
                onChange={e => setBatchRejectReason(e.target.value)}
                placeholder="Nhập lý do từ chối..."
                rows={3}
                className="w-full px-4 py-3.5 border border-gray-300 rounded-xl text-[15px] resize-none
                  focus:ring-2 focus:ring-red-500 focus:border-red-500"
                autoFocus
              />

              <div className="flex flex-col-reverse sm:flex-row gap-2.5 mt-5 sm:justify-end">
                <button
                  onClick={() => { setShowBatchReject(false); setBatchRejectReason('') }}
                  className="w-full sm:w-auto px-5 py-3.5 sm:py-2.5 text-[15px] sm:text-sm text-gray-700
                    bg-white border border-gray-300 rounded-xl active:bg-gray-100"
                >
                  Hủy
                </button>
                <button
                  onClick={handleBatchReject}
                  disabled={!batchRejectReason.trim() || batchProcessing}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-3.5 sm:py-2.5
                    text-[15px] sm:text-sm font-semibold text-white bg-red-600 rounded-xl
                    active:bg-red-700 disabled:opacity-50"
                >
                  {batchProcessing
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <XCircle className="w-4 h-4" />
                  }
                  Từ chối {selected.size} đơn
                </button>
              </div>
            </div>

            {/* Safe area spacer */}
            <div className="h-[env(safe-area-inset-bottom)] sm:hidden" />
          </div>
        </div>
      )}
    </div>
  )
}