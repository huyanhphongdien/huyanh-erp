// ============================================================================
// PO LIST PAGE
// File: src/features/purchasing/pages/POListPage.tsx
// Huy Anh ERP System - Module Mua hàng - Phase 3.2
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  Eye,
  Pencil,
  Trash2,
  ShoppingCart,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  FileText,
  MoreHorizontal,
  X,
  Calendar,
  Building2,
  RefreshCw,
  Send,
  Package,
  TrendingUp,
} from 'lucide-react'
import {
  purchaseOrderService,
  type PurchaseOrder,
  type POFilter,
  type POStatus,
  PO_STATUS_LABELS,
  PO_STATUS_COLORS,
  formatCurrency,
} from '../../../services/purchaseOrderService'
import { departmentService } from '../../../services/departmentService'

// ============================================================================
// CONSTANTS
// ============================================================================

const PAGE_SIZE_OPTIONS = [10, 20, 50]

/** Icon cho từng status */
const STATUS_ICONS: Record<POStatus, React.ElementType> = {
  draft: FileText,
  pending: Clock,
  approved: CheckCircle2,
  rejected: XCircle,
  partial: Package,
  completed: CheckCircle2,
  cancelled: XCircle,
}

/** CSS classes cho status badge */
const STATUS_BADGE_CLASSES: Record<POStatus, string> = {
  draft: 'bg-gray-100 text-gray-700',
  pending: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-blue-100 text-blue-700',
  rejected: 'bg-red-100 text-red-700',
  partial: 'bg-orange-100 text-orange-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-gray-100 text-gray-500',
}

// ============================================================================
// STATUS BADGE COMPONENT
// ============================================================================

function StatusBadge({ status }: { status: POStatus }) {
  const Icon = STATUS_ICONS[status] || FileText
  const label = PO_STATUS_LABELS[status] || status
  const classes = STATUS_BADGE_CLASSES[status] || 'bg-gray-100 text-gray-700'

  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${classes}`}>
      <Icon className="w-3.5 h-3.5" />
      {label}
    </span>
  )
}

// ============================================================================
// PROGRESS BAR COMPONENT
// ============================================================================

function ProgressBar({ value, label, color = 'blue' }: { value: number; label: string; color?: string }) {
  const colorClasses: Record<string, string> = {
    blue: 'bg-blue-500',
    green: 'bg-green-500',
    orange: 'bg-orange-500',
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${colorClasses[color] || colorClasses.blue}`}
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
      <span className="text-xs text-gray-500 whitespace-nowrap w-16 text-right">
        {label}
      </span>
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

function POListPage() {
  const navigate = useNavigate()

  // ===== STATE =====
  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [totalItems, setTotalItems] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  // Filters
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [departmentFilter, setDepartmentFilter] = useState<string>('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  // Stats
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({})

  // Departments for filter dropdown
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([])

  // Action menu
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null)

  // Delete modal
  const [deleteModal, setDeleteModal] = useState<{ show: boolean; order: PurchaseOrder | null }>({
    show: false,
    order: null,
  })
  const [deleting, setDeleting] = useState(false)

  // ===== LOAD DATA =====
  const loadOrders = useCallback(async () => {
    setLoading(true)
    try {
      const filter: POFilter = {}

      if (search) filter.search = search
      if (statusFilter && statusFilter !== 'all') filter.status = statusFilter as POStatus
      if (departmentFilter) filter.department_id = departmentFilter
      if (dateFrom) filter.date_from = dateFrom
      if (dateTo) filter.date_to = dateTo

      const result = await purchaseOrderService.getAll(page, pageSize, filter)
      setOrders(result.data)
      setTotalItems(result.total)
      setTotalPages(result.totalPages)
    } catch (err) {
      console.error('Lỗi tải danh sách đơn hàng:', err)
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, search, statusFilter, departmentFilter, dateFrom, dateTo])

  const loadStatusCounts = useCallback(async () => {
    try {
      const counts = await purchaseOrderService.getStatusCounts()
      setStatusCounts(counts)
    } catch (err) {
      console.error('Lỗi tải thống kê:', err)
    }
  }, [])

  const loadDepartments = useCallback(async () => {
    try {
      const depts = await departmentService.getAllActive()
      setDepartments(depts.map((d: any) => ({ id: d.id, name: d.name })))
    } catch (err) {
      console.error('Lỗi tải phòng ban:', err)
    }
  }, [])

  useEffect(() => {
    loadOrders()
  }, [loadOrders])

  useEffect(() => {
    loadStatusCounts()
    loadDepartments()
  }, [loadStatusCounts, loadDepartments])

  // ===== HANDLERS =====
  const handleSearch = () => {
    setSearch(searchInput)
    setPage(1)
  }

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch()
  }

  const handleClearFilters = () => {
    setSearchInput('')
    setSearch('')
    setStatusFilter('all')
    setDepartmentFilter('')
    setDateFrom('')
    setDateTo('')
    setPage(1)
  }

  const handleDelete = async () => {
    if (!deleteModal.order) return
    setDeleting(true)
    try {
      await purchaseOrderService.delete(deleteModal.order.id)
      setDeleteModal({ show: false, order: null })
      loadOrders()
      loadStatusCounts()
    } catch (err: any) {
      alert(err.message || 'Lỗi xóa đơn hàng')
    } finally {
      setDeleting(false)
    }
  }

  const hasActiveFilters = search || statusFilter !== 'all' || departmentFilter || dateFrom || dateTo

  // ===== RENDER =====
  return (
    <div className="p-6 space-y-6">
      {/* ===== HEADER ===== */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Đơn hàng</h1>
          <p className="text-sm text-gray-500 mt-1">
            Quản lý đơn hàng mua hàng
          </p>
        </div>
        <button
          onClick={() => navigate('/purchasing/orders/new')}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Tạo đơn hàng
        </button>
      </div>

      {/* ===== STATUS TABS ===== */}
      <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 overflow-x-auto">
        {[
          { key: 'all', label: 'Tất cả', icon: ShoppingCart },
          { key: 'draft', label: 'Nháp', icon: FileText },
          { key: 'pending', label: 'Chờ duyệt', icon: Clock },
          { key: 'approved', label: 'Đã duyệt', icon: CheckCircle2 },
          { key: 'rejected', label: 'Từ chối', icon: XCircle },
          { key: 'completed', label: 'Hoàn thành', icon: CheckCircle2 },
        ].map((tab) => {
          const isActive = statusFilter === tab.key
          const count = tab.key === 'all' ? statusCounts.all : statusCounts[tab.key]
          const TabIcon = tab.icon

          return (
            <button
              key={tab.key}
              onClick={() => {
                setStatusFilter(tab.key)
                setPage(1)
              }}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${
                isActive
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <TabIcon className="w-4 h-4" />
              {tab.label}
              {count !== undefined && count > 0 && (
                <span
                  className={`text-xs px-1.5 py-0.5 rounded-full ${
                    isActive ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-600'
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* ===== SEARCH & FILTER BAR ===== */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
        <div className="p-4 flex items-center gap-3">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Tìm theo mã đơn, tên dự án..."
              className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>

          {/* Search button */}
          <button
            onClick={handleSearch}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm transition-colors"
          >
            Tìm
          </button>

          {/* Toggle advanced filters */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors ${
              showFilters || hasActiveFilters
                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <Filter className="w-4 h-4" />
            Bộ lọc
            {hasActiveFilters && (
              <span className="w-2 h-2 bg-blue-600 rounded-full" />
            )}
          </button>

          {/* Refresh */}
          <button
            onClick={() => { loadOrders(); loadStatusCounts() }}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
            title="Làm mới"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Advanced Filters */}
        {showFilters && (
          <div className="px-4 pb-4 pt-0 border-t border-gray-100">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
              {/* Department */}
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Phòng ban</label>
                <select
                  value={departmentFilter}
                  onChange={(e) => { setDepartmentFilter(e.target.value); setPage(1) }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                >
                  <option value="">Tất cả phòng ban</option>
                  {departments.map((dept) => (
                    <option key={dept.id} value={dept.id}>{dept.name}</option>
                  ))}
                </select>
              </div>

              {/* Date From */}
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Từ ngày</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => { setDateFrom(e.target.value); setPage(1) }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </div>

              {/* Date To */}
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Đến ngày</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => { setDateTo(e.target.value); setPage(1) }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </div>
            </div>

            {/* Clear filters button */}
            {hasActiveFilters && (
              <div className="mt-3 flex justify-end">
                <button
                  onClick={handleClearFilters}
                  className="flex items-center gap-1 text-sm text-gray-500 hover:text-red-600 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                  Xóa bộ lọc
                </button>
              </div>
            )}
          </div>
        )}

        {/* ===== TABLE ===== */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-t border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Mã đơn
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Dự án / Công trình
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Ngày tạo
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Phòng ban
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Tổng tiền
                </th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Trạng thái
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-40">
                  Tiến độ
                </th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-16">
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                // Skeleton
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-4 py-4"><div className="h-4 bg-gray-200 rounded w-28" /></td>
                    <td className="px-4 py-4"><div className="h-4 bg-gray-200 rounded w-40" /></td>
                    <td className="px-4 py-4"><div className="h-4 bg-gray-200 rounded w-24" /></td>
                    <td className="px-4 py-4"><div className="h-4 bg-gray-200 rounded w-28" /></td>
                    <td className="px-4 py-4"><div className="h-4 bg-gray-200 rounded w-24 ml-auto" /></td>
                    <td className="px-4 py-4"><div className="h-6 bg-gray-200 rounded-full w-20 mx-auto" /></td>
                    <td className="px-4 py-4"><div className="h-3 bg-gray-200 rounded w-full" /></td>
                    <td className="px-4 py-4"><div className="h-6 bg-gray-200 rounded w-6 mx-auto" /></td>
                  </tr>
                ))
              ) : orders.length === 0 ? (
                // Empty state
                <tr>
                  <td colSpan={8} className="px-4 py-16 text-center">
                    <ShoppingCart className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 font-medium">
                      {hasActiveFilters ? 'Không tìm thấy đơn hàng phù hợp' : 'Chưa có đơn hàng nào'}
                    </p>
                    <p className="text-sm text-gray-400 mt-1">
                      {hasActiveFilters
                        ? 'Thử thay đổi bộ lọc để xem kết quả khác'
                        : 'Bắt đầu bằng cách tạo đơn hàng mới'}
                    </p>
                    {!hasActiveFilters && (
                      <button
                        onClick={() => navigate('/purchasing/orders/new')}
                        className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                      >
                        <Plus className="w-4 h-4" />
                        Tạo đơn hàng đầu tiên
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                // Data rows
                orders.map((order) => (
                  <tr
                    key={order.id}
                    className="hover:bg-gray-50 transition-colors cursor-pointer group"
                    onClick={() => navigate(`/purchasing/orders/${order.id}`)}
                  >
                    {/* Mã đơn */}
                    <td className="px-4 py-3.5">
                      <span className="font-semibold text-blue-600 group-hover:text-blue-700">
                        {order.order_code}
                      </span>
                    </td>

                    {/* Dự án */}
                    <td className="px-4 py-3.5">
                      <div>
                        <p className="text-sm text-gray-900 font-medium truncate max-w-[200px]">
                          {order.project_name || '—'}
                        </p>
                        {order.requester && (
                          <p className="text-xs text-gray-400 mt-0.5">
                            {order.requester.full_name}
                          </p>
                        )}
                      </div>
                    </td>

                    {/* Ngày tạo */}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1.5 text-sm text-gray-600">
                        <Calendar className="w-3.5 h-3.5 text-gray-400" />
                        {new Date(order.order_date).toLocaleDateString('vi-VN')}
                      </div>
                      {order.expected_delivery_date && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          Giao: {new Date(order.expected_delivery_date).toLocaleDateString('vi-VN')}
                        </p>
                      )}
                    </td>

                    {/* Phòng ban */}
                    <td className="px-4 py-3.5">
                      {order.department ? (
                        <div className="flex items-center gap-1.5 text-sm text-gray-600">
                          <Building2 className="w-3.5 h-3.5 text-gray-400" />
                          {order.department.name}
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400">—</span>
                      )}
                    </td>

                    {/* Tổng tiền */}
                    <td className="px-4 py-3.5 text-right">
                      <p className="text-sm font-semibold text-gray-900">
                        {formatCurrency(order.grand_total)}
                      </p>
                      {order.grand_total > 0 && order.vat_amount > 0 && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          VAT: {formatCurrency(order.vat_amount)}
                        </p>
                      )}
                    </td>

                    {/* Trạng thái */}
                    <td className="px-4 py-3.5 text-center">
                      <StatusBadge status={order.status} />
                    </td>

                    {/* Tiến độ */}
                    <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                      {['approved', 'partial', 'completed'].includes(order.status) ? (
                        <div className="space-y-1.5">
                          <ProgressBar
                            value={order.invoice_progress}
                            label={`HĐ ${order.invoice_progress}%`}
                            color="blue"
                          />
                          <ProgressBar
                            value={order.payment_progress}
                            label={`TT ${order.payment_progress}%`}
                            color="green"
                          />
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3.5 text-center" onClick={(e) => e.stopPropagation()}>
                      <div className="relative">
                        <button
                          onClick={() => setActiveMenuId(activeMenuId === order.id ? null : order.id)}
                          className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>

                        {/* Dropdown menu */}
                        {activeMenuId === order.id && (
                          <>
                            {/* Backdrop */}
                            <div
                              className="fixed inset-0 z-10"
                              onClick={() => setActiveMenuId(null)}
                            />
                            <div className="absolute right-0 top-8 z-20 bg-white border border-gray-200 rounded-lg shadow-lg py-1 w-44">
                              {/* View */}
                              <button
                                onClick={() => {
                                  setActiveMenuId(null)
                                  navigate(`/purchasing/orders/${order.id}`)
                                }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                              >
                                <Eye className="w-4 h-4" />
                                Xem chi tiết
                              </button>

                              {/* Edit - chỉ draft/rejected */}
                              {['draft', 'rejected'].includes(order.status) && (
                                <button
                                  onClick={() => {
                                    setActiveMenuId(null)
                                    navigate(`/purchasing/orders/${order.id}/edit`)
                                  }}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                >
                                  <Pencil className="w-4 h-4" />
                                  Chỉnh sửa
                                </button>
                              )}

                              {/* Submit - chỉ draft */}
                              {order.status === 'draft' && order.grand_total > 0 && (
                                <button
                                  onClick={async () => {
                                    setActiveMenuId(null)
                                    if (!confirm('Nộp đơn hàng này để chờ duyệt?')) return
                                    try {
                                      // Cần userId - lấy từ auth store
                                      // await purchaseOrderService.submit(order.id, userId)
                                      alert('Chức năng nộp đơn sẽ được hoàn thiện trong Phase 3.3')
                                      loadOrders()
                                      loadStatusCounts()
                                    } catch (err: any) {
                                      alert(err.message || 'Lỗi')
                                    }
                                  }}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-blue-700 hover:bg-blue-50"
                                >
                                  <Send className="w-4 h-4" />
                                  Nộp duyệt
                                </button>
                              )}

                              {/* Delete - chỉ draft */}
                              {order.status === 'draft' && (
                                <>
                                  <div className="border-t border-gray-100 my-1" />
                                  <button
                                    onClick={() => {
                                      setActiveMenuId(null)
                                      setDeleteModal({ show: true, order })
                                    }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                    Xóa
                                  </button>
                                </>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* ===== PAGINATION ===== */}
        {totalItems > 0 && (
          <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500">
                Hiển thị {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalItems)} / {totalItems} đơn hàng
              </span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value))
                  setPage(1)
                }}
                className="text-sm border border-gray-300 rounded-md px-2 py-1 focus:ring-2 focus:ring-blue-500 outline-none"
              >
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>{size} / trang</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page <= 1}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              {/* Page numbers */}
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                let pageNum: number
                if (totalPages <= 5) {
                  pageNum = i + 1
                } else if (page <= 3) {
                  pageNum = i + 1
                } else if (page >= totalPages - 2) {
                  pageNum = totalPages - 4 + i
                } else {
                  pageNum = page - 2 + i
                }

                return (
                  <button
                    key={pageNum}
                    onClick={() => setPage(pageNum)}
                    className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                      page === pageNum
                        ? 'bg-blue-600 text-white'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {pageNum}
                  </button>
                )
              })}

              <button
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page >= totalPages}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ===== DELETE MODAL ===== */}
      {deleteModal.show && deleteModal.order && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDeleteModal({ show: false, order: null })} />
          <div className="relative bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                <AlertCircle className="w-5 h-5 text-red-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900">Xóa đơn hàng?</h3>
                <p className="text-sm text-gray-500 mt-1">
                  Bạn có chắc muốn xóa đơn hàng{' '}
                  <strong className="text-gray-700">{deleteModal.order.order_code}</strong>?
                  Thao tác này không thể hoàn tác.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setDeleteModal({ show: false, order: null })}
                disabled={deleting}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Hủy
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {deleting ? 'Đang xóa...' : 'Xóa'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default POListPage