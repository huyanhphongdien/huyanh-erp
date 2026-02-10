// ============================================================================
// OVERTIME LIST PAGE - V2.1 (Mobile-First)
// File: src/features/overtime/OvertimeListPage.tsx
// Huy Anh ERP System - Chấm công V2
// ============================================================================
// MOBILE: Card-based layout, sticky header, collapsible filters, safe-area
// DESKTOP: Table-like layout with inline filters
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
import {
  Plus, Clock, SlidersHorizontal, Trash2, Eye, Search,
  Calendar, ChevronDown, ChevronUp, AlertCircle, Loader2,
  CheckCircle, XCircle, Timer, X
} from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import {
  overtimeRequestService,
  type OvertimeRequest
} from '../../services/overtimeRequestService'
import OvertimeRequestForm from './OvertimeRequestForm'

// ============================================================================
// HELPERS
// ============================================================================

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: typeof Clock }> = {
  pending:   { label: 'Chờ duyệt',  color: 'text-yellow-700', bg: 'bg-yellow-50',  icon: Clock },
  approved:  { label: 'Đã duyệt',   color: 'text-green-700',  bg: 'bg-green-50',   icon: CheckCircle },
  rejected:  { label: 'Từ chối',     color: 'text-red-700',    bg: 'bg-red-50',     icon: XCircle },
  completed: { label: 'Hoàn thành',  color: 'text-blue-700',   bg: 'bg-blue-50',    icon: CheckCircle },
}

const STATUS_TABS = [
  { key: 'all',       label: 'Tất cả' },
  { key: 'pending',   label: 'Chờ duyệt' },
  { key: 'approved',  label: 'Đã duyệt' },
  { key: 'rejected',  label: 'Từ chối' },
]

function formatDate(dateStr: string): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatDateShort(dateStr: string): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr + 'T00:00:00')
  const weekday = d.toLocaleDateString('vi-VN', { weekday: 'short' })
  const day = d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })
  return `${weekday}, ${day}`
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

function getRelativeDate(dateStr: string): string {
  if (!dateStr) return ''
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const d = new Date(dateStr + 'T00:00:00')
  const diff = Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  if (diff === 0) return 'Hôm nay'
  if (diff === -1) return 'Hôm qua'
  if (diff === 1) return 'Ngày mai'
  return ''
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function OvertimeListPage() {
  const { user } = useAuthStore()
  const employeeId = user?.employee_id

  // ── State ──
  const [requests, setRequests] = useState<OvertimeRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Filters
  const [statusFilter, setStatusFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // Stats
  const [stats, setStats] = useState({ total: 0, pending: 0, approved: 0, rejected: 0 })

  // Delete
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null)

  // ── Load data ──
  const loadRequests = useCallback(async () => {
    if (!employeeId) return
    setLoading(true)
    try {
      const data = await overtimeRequestService.getByEmployee(
        employeeId,
        statusFilter === 'all' ? undefined : statusFilter as any,
        dateFrom || undefined,
        dateTo || undefined
      )
      setRequests(data)

      // Calc stats from full data (no filter)
      if (statusFilter === 'all' && !dateFrom && !dateTo) {
        setStats({
          total: data.length,
          pending: data.filter(r => r.status === 'pending').length,
          approved: data.filter(r => r.status === 'approved').length,
          rejected: data.filter(r => r.status === 'rejected').length,
        })
      }
    } catch (err) {
      console.error('Load requests error:', err)
    } finally {
      setLoading(false)
    }
  }, [employeeId, statusFilter, dateFrom, dateTo])

  useEffect(() => {
    loadRequests()
  }, [loadRequests])

  // Load stats separately when filters active
  useEffect(() => {
    if (!employeeId) return
    if (statusFilter !== 'all' || dateFrom || dateTo) {
      const loadStats = async () => {
        try {
          const allData = await overtimeRequestService.getByEmployee(employeeId)
          setStats({
            total: allData.length,
            pending: allData.filter(r => r.status === 'pending').length,
            approved: allData.filter(r => r.status === 'approved').length,
            rejected: allData.filter(r => r.status === 'rejected').length,
          })
        } catch { /* ignore */ }
      }
      loadStats()
    }
  }, [employeeId, statusFilter, dateFrom, dateTo])

  // ── Handlers ──
  const handleDelete = async (id: string) => {
    setDeletingId(id)
    try {
      await overtimeRequestService.cancel(id)
      setRequests(prev => prev.filter(r => r.id !== id))
      setStats(prev => ({ ...prev, total: prev.total - 1, pending: prev.pending - 1 }))
      setShowDeleteConfirm(null)
    } catch (err) {
      console.error('Delete error:', err)
      alert('Không thể hủy phiếu. Vui lòng thử lại.')
    } finally {
      setDeletingId(null)
    }
  }

  const handleFormSuccess = () => {
    setShowForm(false)
    loadRequests()
  }

  const clearFilters = () => {
    setDateFrom('')
    setDateTo('')
    setStatusFilter('all')
  }

  const hasActiveFilters = dateFrom || dateTo
  const activeFilterCount = [dateFrom, dateTo].filter(Boolean).length

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Sticky Header ── */}
      <div className="sticky top-0 z-20 bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-3 sm:py-4">
          {/* Top row: Title + New button */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-gray-900">Phiếu tăng ca</h1>
              <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
                {stats.total} phiếu · {stats.pending} chờ duyệt
              </p>
            </div>

            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-2 px-4 py-3 sm:py-2.5
                         bg-blue-600 text-white rounded-xl sm:rounded-lg
                         text-sm font-medium
                         active:bg-blue-700 sm:hover:bg-blue-700
                         transition-colors min-h-[44px]"
            >
              <Plus className="w-[18px] h-[18px]" />
              <span className="hidden sm:inline">Tạo phiếu</span>
              <span className="sm:hidden">Mới</span>
            </button>
          </div>

          {/* Status tabs - scrollable on mobile */}
          <div className="flex items-center gap-2 mt-3 -mx-4 px-4 overflow-x-auto scrollbar-hide">
            <div className="flex items-center bg-gray-100 rounded-xl p-1 min-w-max">
              {STATUS_TABS.map(tab => {
                const count = tab.key === 'all' ? stats.total
                  : tab.key === 'pending' ? stats.pending
                  : tab.key === 'approved' ? stats.approved
                  : stats.rejected
                const isActive = statusFilter === tab.key

                return (
                  <button
                    key={tab.key}
                    onClick={() => setStatusFilter(tab.key)}
                    className={`
                      relative flex items-center gap-1.5 px-3 py-2 rounded-lg
                      text-sm font-medium whitespace-nowrap transition-all min-h-[40px]
                      ${isActive
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-500 active:text-gray-700'
                      }
                    `}
                  >
                    {tab.label}
                    {count > 0 && (
                      <span className={`
                        inline-flex items-center justify-center min-w-[20px] h-5
                        px-1.5 rounded-full text-xs font-semibold
                        ${isActive
                          ? tab.key === 'pending' ? 'bg-yellow-100 text-yellow-700'
                          : tab.key === 'rejected' ? 'bg-red-100 text-red-700'
                          : 'bg-blue-100 text-blue-700'
                          : 'bg-gray-200 text-gray-600'
                        }
                      `}>
                        {count}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            {/* Filter toggle */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`
                relative flex-shrink-0 flex items-center gap-1.5 px-3 py-2
                rounded-xl text-sm font-medium min-h-[40px] transition-colors
                ${hasActiveFilters
                  ? 'bg-blue-50 text-blue-700 active:bg-blue-100'
                  : 'bg-gray-100 text-gray-600 active:bg-gray-200'
                }
              `}
            >
              <SlidersHorizontal className="w-4 h-4" />
              <span className="hidden sm:inline">Lọc</span>
              {activeFilterCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 flex items-center justify-center
                                 bg-blue-600 text-white rounded-full text-[10px] font-bold">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>

          {/* Collapsible date filters */}
          {showFilters && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Lọc theo ngày</span>
                {hasActiveFilters && (
                  <button
                    onClick={clearFilters}
                    className="text-xs text-blue-600 font-medium active:text-blue-800 min-h-[32px] flex items-center"
                  >
                    Xóa bộ lọc
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Từ ngày</label>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={e => setDateFrom(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-[15px]
                               focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400
                               bg-gray-50 min-h-[44px]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Đến ngày</label>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={e => setDateTo(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-[15px]
                               focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400
                               bg-gray-50 min-h-[44px]"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="max-w-4xl mx-auto px-4 py-4 sm:py-6">

        {/* Loading */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
            <p className="text-sm text-gray-500">Đang tải dữ liệu...</p>
          </div>
        ) : requests.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center">
              <Clock className="w-8 h-8 text-gray-400" />
            </div>
            <div className="text-center">
              <p className="text-base font-medium text-gray-700">
                {statusFilter !== 'all'
                  ? `Không có phiếu ${STATUS_CONFIG[statusFilter]?.label.toLowerCase() || ''}`
                  : 'Chưa có phiếu tăng ca nào'
                }
              </p>
              <p className="text-sm text-gray-500 mt-1">
                {statusFilter !== 'all'
                  ? 'Thử đổi bộ lọc để xem phiếu khác'
                  : 'Bấm "Mới" để tạo phiếu tăng ca đầu tiên'
                }
              </p>
            </div>
            {statusFilter === 'all' && (
              <button
                onClick={() => setShowForm(true)}
                className="inline-flex items-center gap-2 px-5 py-3 bg-blue-600 text-white
                           rounded-xl text-sm font-medium active:bg-blue-700
                           transition-colors min-h-[44px]"
              >
                <Plus className="w-4 h-4" />
                Tạo phiếu tăng ca
              </button>
            )}
          </div>
        ) : (
          /* Request list - Card layout */
          <div className="space-y-3">
            {requests.map(req => {
              const status = STATUS_CONFIG[req.status] || STATUS_CONFIG.pending
              const StatusIcon = status.icon
              const isExpanded = expandedId === req.id
              const isPending = req.status === 'pending'
              const relative = getRelativeDate(req.request_date)
              const approverName = req.approver?.full_name

              return (
                <div
                  key={req.id}
                  className={`
                    bg-white rounded-2xl border-2 transition-all
                    ${isPending ? 'border-yellow-200' : 'border-gray-100'}
                  `}
                >
                  {/* Card header - always visible */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : req.id)}
                    className="w-full text-left p-4 active:bg-gray-50 transition-colors rounded-2xl"
                  >
                    <div className="flex items-start gap-3">
                      {/* Status icon */}
                      <div className={`
                        flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center mt-0.5
                        ${status.bg}
                      `}>
                        <StatusIcon className={`w-5 h-5 ${status.color}`} />
                      </div>

                      {/* Main info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-semibold text-sm text-gray-900 truncate">
                              {formatDateShort(req.request_date)}
                            </span>
                            {relative && (
                              <span className="flex-shrink-0 text-[11px] font-medium px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-600">
                                {relative}
                              </span>
                            )}
                          </div>
                          <span className={`
                            flex-shrink-0 inline-flex items-center gap-1 px-2 py-1
                            rounded-lg text-xs font-medium
                            ${status.bg} ${status.color}
                          `}>
                            {status.label}
                          </span>
                        </div>

                        {/* Time & duration chips */}
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-50 rounded-lg text-xs text-gray-600">
                            <Clock className="w-3 h-3" />
                            {formatTime(req.planned_start)} – {formatTime(req.planned_end)}
                          </span>
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-50 rounded-lg text-xs text-gray-600">
                            <Timer className="w-3 h-3" />
                            {formatMinutes(req.planned_minutes)}
                          </span>
                        </div>

                        {/* Reason preview */}
                        {!isExpanded && req.reason && (
                          <p className="text-xs text-gray-500 mt-1.5 truncate">
                            {req.reason}
                          </p>
                        )}
                      </div>

                      {/* Expand indicator */}
                      <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center mt-1">
                        {isExpanded
                          ? <ChevronUp className="w-4 h-4 text-gray-400" />
                          : <ChevronDown className="w-4 h-4 text-gray-400" />
                        }
                      </div>
                    </div>
                  </button>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="px-4 pb-4 pt-0 border-t border-gray-100 mx-4 space-y-3">
                      {/* Reason */}
                      <div className="pt-3">
                        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Lý do</span>
                        <p className="text-sm text-gray-700 mt-1">{req.reason || '—'}</p>
                      </div>

                      {/* Shift info */}
                      {req.shift && (
                        <div>
                          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Ca làm việc</span>
                          <p className="text-sm text-gray-700 mt-1">
                            {req.shift.name} ({req.shift.code})
                          </p>
                        </div>
                      )}

                      {/* Approver */}
                      {approverName && (
                        <div>
                          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Người duyệt</span>
                          <p className="text-sm text-gray-700 mt-1">{approverName}</p>
                        </div>
                      )}

                      {/* Rejection reason */}
                      {req.status === 'rejected' && req.rejection_reason && (
                        <div className="bg-red-50 rounded-xl p-3">
                          <span className="text-xs font-medium text-red-600 uppercase tracking-wide">Lý do từ chối</span>
                          <p className="text-sm text-red-700 mt-1">{req.rejection_reason}</p>
                        </div>
                      )}

                      {/* Actual OT (if completed) */}
                      {req.actual_minutes && req.actual_minutes > 0 && (
                        <div className="bg-blue-50 rounded-xl p-3">
                          <span className="text-xs font-medium text-blue-600 uppercase tracking-wide">Thực tế</span>
                          <p className="text-sm text-blue-700 mt-1 font-medium">
                            {formatMinutes(req.actual_minutes)}
                          </p>
                        </div>
                      )}

                      {/* Timestamps */}
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400 pt-1">
                        <span>Tạo: {req.created_at ? new Date(req.created_at).toLocaleDateString('vi-VN') : '—'}</span>
                        {req.approved_at && (
                          <span>
                            {req.status === 'approved' ? 'Duyệt' : 'Xử lý'}:{' '}
                            {new Date(req.approved_at).toLocaleDateString('vi-VN')}
                          </span>
                        )}
                      </div>

                      {/* Actions */}
                      {isPending && (
                        <div className="pt-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setShowDeleteConfirm(req.id)
                            }}
                            className="inline-flex items-center gap-2 px-4 py-2.5 text-red-600
                                       bg-red-50 rounded-xl text-sm font-medium
                                       active:bg-red-100 transition-colors min-h-[44px]"
                          >
                            <Trash2 className="w-4 h-4" />
                            Hủy phiếu
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Create Form Modal ── */}
      {showForm && (
        <OvertimeRequestForm
          onClose={() => setShowForm(false)}
          onSuccess={handleFormSuccess}
        />
      )}

      {/* ── Delete Confirm - Bottom Sheet ── */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setShowDeleteConfirm(null)}
          />

          {/* Dialog */}
          <div className="relative w-full sm:max-w-sm bg-white rounded-t-2xl sm:rounded-2xl
                          shadow-2xl overflow-hidden animate-in slide-in-from-bottom">
            {/* Drag handle (mobile) */}
            <div className="flex justify-center pt-3 pb-1 sm:hidden">
              <div className="w-10 h-1 bg-gray-300 rounded-full" />
            </div>

            <div className="p-5 text-center">
              <div className="w-14 h-14 mx-auto bg-red-100 rounded-2xl flex items-center justify-center mb-4">
                <AlertCircle className="w-7 h-7 text-red-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Hủy phiếu tăng ca?</h3>
              <p className="text-sm text-gray-500 mt-2">
                Phiếu sẽ bị xóa vĩnh viễn và không thể khôi phục.
              </p>
            </div>

            <div className="px-5 pb-5 flex flex-col-reverse sm:flex-row gap-3"
                 style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom, 0px))' }}>
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="flex-1 py-3.5 sm:py-2.5 px-4 bg-gray-100 text-gray-700 rounded-xl
                           text-sm font-medium active:bg-gray-200 sm:hover:bg-gray-200
                           transition-colors min-h-[44px]"
              >
                Không, giữ lại
              </button>
              <button
                onClick={() => handleDelete(showDeleteConfirm)}
                disabled={deletingId === showDeleteConfirm}
                className="flex-1 py-3.5 sm:py-2.5 px-4 bg-red-600 text-white rounded-xl
                           text-sm font-medium active:bg-red-700 sm:hover:bg-red-700
                           transition-colors disabled:opacity-60 min-h-[44px]
                           inline-flex items-center justify-center gap-2"
              >
                {deletingId === showDeleteConfirm ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Đang hủy...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    Hủy phiếu
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Safe area bottom spacer for FAB */}
      <div className="h-4 sm:h-8" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }} />
    </div>
  )
}