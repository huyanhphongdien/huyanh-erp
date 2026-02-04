// ============================================================================
// PO LIST PAGE - CẬP NHẬT PHASE P5
// File: src/features/purchasing/pages/POListPage.tsx
// Huy Anh ERP System
// ============================================================================
// CẬP NHẬT:
// - Status tabs mới: Tất cả / Nháp / Đã XN / Đang giao / Hoàn thành
// - Cột tiến độ hiển thị % hóa đơn + % thanh toán thực tế
// - Bỏ pending/approved/rejected (workflow cũ)
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  Eye,
  Pencil,
  Trash2,
  Clock,
  CheckCircle2,
  FileText,
  MoreHorizontal,
  X,
  Calendar,
  Building2,
  RefreshCw,
  Package,
  AlertCircle,
  AlertTriangle,
  Ban,
  TrendingUp,
  Loader2,
  Filter,
  ShoppingCart,
  Receipt,
  CreditCard,
} from 'lucide-react';
import {
  purchaseOrderService,
  type PurchaseOrder,
} from '../../../services/purchaseOrderService';
import { departmentService } from '../../../services/departmentService';

// ============================================================================
// TYPES & CONSTANTS
// ============================================================================

type OrderStatus = 'draft' | 'confirmed' | 'partial' | 'completed' | 'cancelled';

const STATUS_LABELS: Record<OrderStatus, string> = {
  draft: 'Nháp',
  confirmed: 'Đã xác nhận',
  partial: 'Đang giao',
  completed: 'Hoàn thành',
  cancelled: 'Đã hủy',
};

const STATUS_BADGE_CLASSES: Record<OrderStatus, string> = {
  draft: 'bg-gray-100 text-gray-700',
  confirmed: 'bg-blue-100 text-blue-700',
  partial: 'bg-orange-100 text-orange-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-gray-100 text-gray-500',
};

const STATUS_ICONS: Record<OrderStatus, React.ElementType> = {
  draft: FileText,
  confirmed: CheckCircle2,
  partial: Package,
  completed: CheckCircle2,
  cancelled: Ban,
};

// Tab config (mới - không còn pending/approved/rejected)
const STATUS_TABS: { key: OrderStatus | 'all'; label: string; icon: React.ElementType }[] = [
  { key: 'all', label: 'Tất cả', icon: ShoppingCart },
  { key: 'draft', label: 'Nháp', icon: FileText },
  { key: 'confirmed', label: 'Đã XN', icon: CheckCircle2 },
  { key: 'partial', label: 'Đang giao', icon: Package },
  { key: 'completed', label: 'Hoàn thành', icon: CheckCircle2 },
];

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
  }).format(amount);
}

// ============================================================================
// STATUS BADGE
// ============================================================================

function StatusBadge({ status }: { status: string }) {
  const Icon = STATUS_ICONS[status as OrderStatus] || FileText;
  const label = STATUS_LABELS[status as OrderStatus] || status;
  const classes = STATUS_BADGE_CLASSES[status as OrderStatus] || 'bg-gray-100 text-gray-700';

  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${classes}`}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </span>
  );
}

// ============================================================================
// PROGRESS CELL - Cột tiến độ HĐ + TT
// ============================================================================

function ProgressCell({
  invoiceProgress,
  paymentProgress,
  status,
}: {
  invoiceProgress: number;
  paymentProgress: number;
  status: string;
}) {
  // Draft orders don't show progress
  if (status === 'draft' || status === 'cancelled') {
    return <span className="text-xs text-gray-400">—</span>;
  }

  return (
    <div className="space-y-1.5 min-w-[100px]">
      {/* Invoice progress */}
      <div className="flex items-center gap-1.5">
        <Receipt className="w-3 h-3 text-blue-400 flex-shrink-0" />
        <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all"
            style={{ width: `${Math.min(invoiceProgress, 100)}%` }}
          />
        </div>
        <span className="text-[10px] text-gray-500 w-8 text-right">{invoiceProgress}%</span>
      </div>
      {/* Payment progress */}
      <div className="flex items-center gap-1.5">
        <CreditCard className="w-3 h-3 text-green-400 flex-shrink-0" />
        <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-green-500 rounded-full transition-all"
            style={{ width: `${Math.min(paymentProgress, 100)}%` }}
          />
        </div>
        <span className="text-[10px] text-gray-500 w-8 text-right">{paymentProgress}%</span>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

function POListPage() {
  const navigate = useNavigate();
  const location = useLocation();

  // State
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<OrderStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});

  // Filters
  const [showFilters, setShowFilters] = useState(false);
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);

  // Action menu
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);

  // Delete
  const [deleteModal, setDeleteModal] = useState<{
    show: boolean;
    order: PurchaseOrder | null;
    loading: boolean;
  }>({ show: false, order: null, loading: false });

  // Success message from navigation
  const [successMsg, setSuccessMsg] = useState<string | null>(
    (location.state as any)?.message || null
  );

  // ===== LOAD DEPARTMENTS =====
  useEffect(() => {
    departmentService.getAllActive().then(setDepartments).catch(console.error);
  }, []);

  // ===== LOAD ORDERS =====
  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { page, pageSize, search };
      if (activeTab !== 'all') params.status = activeTab;
      if (departmentFilter) params.department_id = departmentFilter;

      const result = await purchaseOrderService.getAll(params);
      setOrders(result.data);
      setTotal(result.total);
    } catch (err: any) {
      console.error('Error loading orders:', err);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, activeTab, departmentFilter]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  // ===== LOAD STATUS COUNTS =====
  useEffect(() => {
    const loadCounts = async () => {
      try {
        const counts = await purchaseOrderService.getStatusCounts();
        setStatusCounts(counts);
      } catch (err) {
        console.error('Error loading counts:', err);
      }
    };
    loadCounts();
  }, [orders]); // Reload counts when orders change

  // Auto-clear success
  useEffect(() => {
    if (successMsg) {
      const timer = setTimeout(() => setSuccessMsg(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [successMsg]);

  // Search handler
  const handleSearch = () => {
    setSearch(searchInput);
    setPage(1);
  };

  // Tab change
  const handleTabChange = (tab: OrderStatus | 'all') => {
    setActiveTab(tab);
    setPage(1);
  };

  // Delete
  const handleDelete = async () => {
    if (!deleteModal.order) return;
    setDeleteModal((prev) => ({ ...prev, loading: true }));
    try {
      await purchaseOrderService.delete(deleteModal.order.id);
      setDeleteModal({ show: false, order: null, loading: false });
      loadOrders();
    } catch (err: any) {
      alert(err.message || 'Lỗi xóa');
      setDeleteModal((prev) => ({ ...prev, loading: false }));
    }
  };

  // Calculated
  const totalPages = Math.ceil(total / pageSize);
  const allCount =
    Object.values(statusCounts).reduce((s, c) => s + c, 0) -
    (statusCounts.cancelled || 0);

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-5">
      {/* Success message */}
      {successMsg && (
        <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
          <span className="text-sm text-green-700 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            {successMsg}
          </span>
          <button onClick={() => setSuccessMsg(null)}>
            <X className="w-4 h-4 text-green-400" />
          </button>
        </div>
      )}

      {/* ===== HEADER ===== */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <ShoppingCart className="w-6 h-6 text-blue-500" />
            Đơn đặt hàng
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {total} đơn hàng
          </p>
        </div>
        <button
          onClick={() => navigate('/purchasing/orders/new')}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 shadow-sm transition-colors"
        >
          <Plus className="w-4 h-4" />
          Tạo đơn hàng
        </button>
      </div>

      {/* ===== STATUS TABS ===== */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl overflow-x-auto">
        {STATUS_TABS.map((tab) => {
          const Icon = tab.icon;
          const count =
            tab.key === 'all' ? allCount : statusCounts[tab.key] || 0;

          return (
            <button
              key={tab.key}
              onClick={() => handleTabChange(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-colors ${
                activeTab === tab.key
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
              <span
                className={`text-xs px-1.5 py-0.5 rounded-full ${
                  activeTab === tab.key
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-gray-200 text-gray-500'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ===== SEARCH & FILTERS ===== */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search */}
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Tìm mã đơn, dự án..."
            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          {searchInput && (
            <button
              onClick={() => {
                setSearchInput('');
                setSearch('');
                setPage(1);
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Filter button */}
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-2 px-4 py-2.5 border rounded-lg text-sm transition-colors ${
            showFilters || departmentFilter
              ? 'border-blue-500 text-blue-600 bg-blue-50'
              : 'border-gray-300 text-gray-600 hover:bg-gray-50'
          }`}
        >
          <Filter className="w-4 h-4" />
          Bộ lọc
          {departmentFilter && (
            <span className="w-2 h-2 bg-blue-500 rounded-full" />
          )}
        </button>

        {/* Refresh */}
        <button
          onClick={loadOrders}
          disabled={loading}
          className="p-2.5 border border-gray-300 rounded-lg text-gray-500 hover:bg-gray-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="flex items-end gap-4 p-4 bg-gray-50 border border-gray-200 rounded-lg">
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-500 mb-1">Phòng ban</label>
            <select
              value={departmentFilter}
              onChange={(e) => {
                setDepartmentFilter(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value="">Tất cả phòng ban</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          {departmentFilter && (
            <button
              onClick={() => {
                setDepartmentFilter('');
                setPage(1);
              }}
              className="px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg"
            >
              Xóa lọc
            </button>
          )}
        </div>
      )}

      {/* ===== TABLE ===== */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Mã đơn
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Dự án
                </th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Ngày
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Tổng tiền
                </th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Trạng thái
                </th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Tiến độ
                </th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-12">
                  
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                // Skeleton
                Array.from({ length: 5 }).map((_, idx) => (
                  <tr key={idx} className="animate-pulse">
                    <td className="px-4 py-3">
                      <div className="h-4 bg-gray-200 rounded w-24" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="h-4 bg-gray-200 rounded w-40" />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="h-4 bg-gray-200 rounded w-20 mx-auto" />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="h-4 bg-gray-200 rounded w-28 ml-auto" />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="h-5 bg-gray-200 rounded-full w-20 mx-auto" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="h-4 bg-gray-200 rounded w-24 mx-auto" />
                    </td>
                    <td className="px-4 py-3" />
                  </tr>
                ))
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <ShoppingCart className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500">
                      {search || departmentFilter
                        ? 'Không tìm thấy đơn hàng phù hợp'
                        : 'Chưa có đơn hàng nào'}
                    </p>
                    {!search && !departmentFilter && (
                      <button
                        onClick={() => navigate('/purchasing/orders/new')}
                        className="mt-3 text-sm text-blue-600 hover:underline"
                      >
                        + Tạo đơn hàng đầu tiên
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                orders.map((order) => (
                  <tr
                    key={order.id}
                    onClick={() => navigate(`/purchasing/orders/${order.id}`)}
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    {/* Mã đơn */}
                    <td className="px-4 py-3">
                      <span className="font-medium text-blue-600 hover:underline">
                        {order.order_code}
                      </span>
                    </td>

                    {/* Dự án */}
                    <td className="px-4 py-3">
                      <p className="text-gray-900 truncate max-w-[200px]">
                        {order.project_name || '—'}
                      </p>
                    </td>

                    {/* Ngày */}
                    <td className="px-4 py-3 text-center text-gray-500">
                      {new Date(order.order_date || order.created_at).toLocaleDateString('vi-VN')}
                    </td>

                    {/* Tổng tiền */}
                    <td className="px-4 py-3 text-right font-medium text-gray-900">
                      {formatCurrency(order.grand_total || 0)}
                    </td>

                    {/* Trạng thái */}
                    <td className="px-4 py-3 text-center">
                      <StatusBadge status={order.status} />
                    </td>

                    {/* Tiến độ */}
                    <td className="px-4 py-3">
                      <ProgressCell
                        invoiceProgress={order.invoice_progress || 0}
                        paymentProgress={order.payment_progress || 0}
                        status={order.status}
                      />
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <div className="relative">
                        <button
                          onClick={() =>
                            setActionMenuId(
                              actionMenuId === order.id ? null : order.id
                            )
                          }
                          className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>

                        {actionMenuId === order.id && (
                          <>
                            <div
                              className="fixed inset-0 z-10"
                              onClick={() => setActionMenuId(null)}
                            />
                            <div className="absolute right-0 top-8 z-20 bg-white border border-gray-200 rounded-lg shadow-lg py-1 w-40">
                              <button
                                onClick={() => {
                                  navigate(`/purchasing/orders/${order.id}`);
                                  setActionMenuId(null);
                                }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                              >
                                <Eye className="w-4 h-4" />
                                Xem chi tiết
                              </button>
                              {order.status === 'draft' && (
                                <>
                                  <button
                                    onClick={() => {
                                      navigate(`/purchasing/orders/${order.id}/edit`);
                                      setActionMenuId(null);
                                    }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                  >
                                    <Pencil className="w-4 h-4" />
                                    Chỉnh sửa
                                  </button>
                                  <div className="border-t border-gray-100 my-1" />
                                  <button
                                    onClick={() => {
                                      setDeleteModal({
                                        show: true,
                                        order,
                                        loading: false,
                                      });
                                      setActionMenuId(null);
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

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
            <span className="text-xs text-gray-500">
              Hiển thị {orders.length} / {total}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 border border-gray-300 rounded hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm text-gray-600 px-2">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-1.5 border border-gray-300 rounded hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ===== DELETE MODAL ===== */}
      {deleteModal.show && deleteModal.order && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() =>
              !deleteModal.loading &&
              setDeleteModal({ show: false, order: null, loading: false })
            }
          />
          <div className="relative bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Xóa đơn hàng?</h3>
            <p className="text-sm text-gray-600 mb-4">
              Đơn <strong>{deleteModal.order.order_code}</strong> sẽ bị xóa vĩnh viễn.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() =>
                  setDeleteModal({ show: false, order: null, loading: false })
                }
                disabled={deleteModal.loading}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Hủy
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteModal.loading}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {deleteModal.loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                {deleteModal.loading ? 'Đang xóa...' : 'Xóa'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default POListPage;