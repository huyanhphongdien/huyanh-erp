// ============================================================================
// PAYMENT LIST PAGE
// File: src/features/purchasing/pages/PaymentListPage.tsx
// Huy Anh ERP - Phase P5: Payments & Debt Tracking
// ============================================================================
// Route: /purchasing/payments
// Trang lịch sử thanh toán — xem tất cả thanh toán, filter, thống kê
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CreditCard,
  Search,
  Filter,
  RefreshCw,
  Calendar,
  Building2,
  Banknote,
  FileText,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  DollarSign,
  AlertTriangle,
  Clock,
  Loader2,
  ExternalLink,
  Eye,
  X,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  User,
  Hash,
} from 'lucide-react';
import { invoicePaymentService } from '../../../services/invoicePaymentService';
import type {
  PaymentWithDetails,
  PaymentStats,
  PaginatedResponse,
} from '../../../services/invoicePaymentService';

// ============================================================================
// HELPERS
// ============================================================================

const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(amount);
};

const formatDate = (dateStr: string): string => {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
};

const formatDateTime = (dateStr: string): string => {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

// Lấy ngày đầu tháng hiện tại
const getFirstDayOfMonth = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
};

// Lấy ngày hôm nay
const getToday = (): string => {
  return new Date().toISOString().split('T')[0];
};

// ============================================================================
// TYPES
// ============================================================================

type SortField = 'payment_date' | 'amount' | 'created_at';
type SortOrder = 'asc' | 'desc';

interface Filters {
  search: string;
  paymentMethod: string;
  fromDate: string;
  toDate: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const PAGE_SIZE_OPTIONS = [10, 20, 50];

const PAYMENT_METHOD_OPTIONS = [
  { value: 'all', label: 'Tất cả' },
  { value: 'bank_transfer', label: 'Chuyển khoản' },
  { value: 'cash', label: 'Tiền mặt' },
];

// ============================================================================
// COMPONENT
// ============================================================================

const PaymentListPage: React.FC = () => {
  const navigate = useNavigate();

  // ========================================================================
  // STATE
  // ========================================================================

  // Data
  const [payments, setPayments] = useState<PaymentWithDetails[]>([]);
  const [stats, setStats] = useState<PaymentStats | null>(null);
  const [total, setTotal] = useState(0);

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalPages, setTotalPages] = useState(0);

  // Filters
  const [filters, setFilters] = useState<Filters>({
    search: '',
    paymentMethod: 'all',
    fromDate: '',
    toDate: '',
  });
  const [showFilters, setShowFilters] = useState(false);
  const [searchInput, setSearchInput] = useState('');

  // Sort
  const [sortField, setSortField] = useState<SortField>('payment_date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  // Loading
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ========================================================================
  // FETCH DATA
  // ========================================================================

  const fetchPayments = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const result: PaginatedResponse<PaymentWithDetails> = await invoicePaymentService.getAll({
        page,
        pageSize,
        search: filters.search || undefined,
        payment_method: filters.paymentMethod !== 'all' ? filters.paymentMethod : undefined,
        from_date: filters.fromDate || undefined,
        to_date: filters.toDate || undefined,
      });

      setPayments(result.data);
      setTotal(result.total);
      setTotalPages(result.totalPages);
    } catch (err: any) {
      console.error('❌ Error loading payments:', err);
      setError(err.message || 'Không thể tải danh sách thanh toán');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, filters]);

  const fetchStats = useCallback(async () => {
    try {
      setStatsLoading(true);
      const statsData = await invoicePaymentService.getPaymentStats(
        filters.fromDate || undefined,
        filters.toDate || undefined
      );
      setStats(statsData);
    } catch (err: any) {
      console.warn('⚠️ Could not load stats:', err);
      setStats(null);
    } finally {
      setStatsLoading(false);
    }
  }, [filters.fromDate, filters.toDate]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // ========================================================================
  // HANDLERS
  // ========================================================================

  const handleSearch = () => {
    setPage(1);
    setFilters(prev => ({ ...prev, search: searchInput }));
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const handleFilterChange = (key: keyof Filters, value: string) => {
    setPage(1);
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const handleClearFilters = () => {
    setPage(1);
    setSearchInput('');
    setFilters({
      search: '',
      paymentMethod: 'all',
      fromDate: '',
      toDate: '',
    });
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const handleViewInvoice = (invoiceId: string) => {
    if (invoiceId) {
      navigate(`/purchasing/invoices/${invoiceId}`);
    }
  };

  const handleRefresh = () => {
    fetchPayments();
    fetchStats();
  };

  // Sort payments locally (since API doesn't support sort param directly)
  const sortedPayments = [...payments].sort((a, b) => {
    let comparison = 0;
    switch (sortField) {
      case 'payment_date':
        comparison = new Date(a.payment_date).getTime() - new Date(b.payment_date).getTime();
        break;
      case 'amount':
        comparison = (a.amount || 0) - (b.amount || 0);
        break;
      case 'created_at':
        comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        break;
    }
    return sortOrder === 'asc' ? comparison : -comparison;
  });

  // ========================================================================
  // CHECK ACTIVE FILTERS
  // ========================================================================

  const hasActiveFilters =
    filters.search !== '' ||
    filters.paymentMethod !== 'all' ||
    filters.fromDate !== '' ||
    filters.toDate !== '';

  // ========================================================================
  // RENDER
  // ========================================================================

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* ================================================================ */}
      {/* HEADER                                                           */}
      {/* ================================================================ */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <CreditCard className="w-7 h-7 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-900">Lịch sử thanh toán</h1>
          </div>
          <p className="text-sm text-gray-500 mt-1 ml-10">
            {total > 0 ? `${total} thanh toán` : 'Theo dõi tất cả thanh toán cho NCC'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-gray-600 text-sm hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200"
            title="Làm mới dữ liệu"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Làm mới
          </button>
        </div>
      </div>

      {/* ================================================================ */}
      {/* STATS CARDS                                                      */}
      {/* ================================================================ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Tổng thanh toán */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
              <CreditCard className="w-4 h-4 text-blue-600" />
            </div>
            <span className="text-xs text-gray-500 font-medium">Tổng thanh toán</span>
          </div>
          {statsLoading ? (
            <div className="h-7 bg-gray-100 rounded animate-pulse" />
          ) : (
            <>
              <p className="text-lg font-bold text-gray-900">
                {formatCurrency(stats?.total_amount || 0)}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {stats?.total_payments || 0} lần thanh toán
              </p>
            </>
          )}
        </div>

        {/* Chuyển khoản */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
              <Building2 className="w-4 h-4 text-indigo-600" />
            </div>
            <span className="text-xs text-gray-500 font-medium">Chuyển khoản</span>
          </div>
          {statsLoading ? (
            <div className="h-7 bg-gray-100 rounded animate-pulse" />
          ) : (
            <>
              <p className="text-lg font-bold text-indigo-600">
                {formatCurrency(stats?.bank_transfer_amount || 0)}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {stats?.total_amount
                  ? `${Math.round(((stats?.bank_transfer_amount || 0) / stats.total_amount) * 100)}%`
                  : '0%'} tổng TT
              </p>
            </>
          )}
        </div>

        {/* Tiền mặt */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
              <Banknote className="w-4 h-4 text-green-600" />
            </div>
            <span className="text-xs text-gray-500 font-medium">Tiền mặt</span>
          </div>
          {statsLoading ? (
            <div className="h-7 bg-gray-100 rounded animate-pulse" />
          ) : (
            <>
              <p className="text-lg font-bold text-green-600">
                {formatCurrency(stats?.cash_amount || 0)}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {stats?.total_amount
                  ? `${Math.round(((stats?.cash_amount || 0) / stats.total_amount) * 100)}%`
                  : '0%'} tổng TT
              </p>
            </>
          )}
        </div>

        {/* Công nợ */}
        <div className={`bg-white border rounded-xl p-4 ${
          (stats?.overdue_count || 0) > 0 ? 'border-red-200 bg-red-50' : 'border-gray-200'
        }`}>
          <div className="flex items-center gap-2 mb-2">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              (stats?.overdue_count || 0) > 0 ? 'bg-red-100' : 'bg-amber-100'
            }`}>
              <AlertTriangle className={`w-4 h-4 ${
                (stats?.overdue_count || 0) > 0 ? 'text-red-600' : 'text-amber-600'
              }`} />
            </div>
            <span className="text-xs text-gray-500 font-medium">Tổng còn nợ</span>
          </div>
          {statsLoading ? (
            <div className="h-7 bg-gray-100 rounded animate-pulse" />
          ) : (
            <>
              <p className={`text-lg font-bold ${
                (stats?.total_debt || 0) > 0 ? 'text-amber-600' : 'text-gray-400'
              }`}>
                {formatCurrency(stats?.total_debt || 0)}
              </p>
              {(stats?.overdue_count || 0) > 0 && (
                <p className="text-xs text-red-500 mt-0.5">
                  {stats?.overdue_count} HĐ quá hạn · {formatCurrency(stats?.total_overdue || 0)}
                </p>
              )}
              {(stats?.overdue_count || 0) === 0 && (
                <p className="text-xs text-gray-400 mt-0.5">Không có quá hạn</p>
              )}
            </>
          )}
        </div>
      </div>

      {/* ================================================================ */}
      {/* SEARCH & FILTERS                                                 */}
      {/* ================================================================ */}
      <div className="bg-white border border-gray-200 rounded-xl">
        {/* Search bar */}
        <div className="p-4 flex flex-col sm:flex-row gap-3">
          {/* Search input */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Tìm theo mã UNC, ghi chú..."
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {searchInput && (
              <button
                onClick={() => {
                  setSearchInput('');
                  if (filters.search) {
                    handleFilterChange('search', '');
                  }
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Filter toggle & actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`inline-flex items-center gap-1.5 px-3 py-2.5 border rounded-lg text-sm font-medium transition-colors ${
                showFilters || hasActiveFilters
                  ? 'border-blue-300 bg-blue-50 text-blue-700'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Filter className="w-4 h-4" />
              Bộ lọc
              {hasActiveFilters && (
                <span className="w-2 h-2 rounded-full bg-blue-500" />
              )}
            </button>

            <button
              onClick={handleSearch}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Search className="w-4 h-4" />
              Tìm
            </button>
          </div>
        </div>

        {/* Expanded filters */}
        {showFilters && (
          <div className="px-4 pb-4 border-t border-gray-100 pt-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Payment method */}
              <div>
                <label className="block text-xs text-gray-500 font-medium mb-1.5">
                  Phương thức
                </label>
                <select
                  value={filters.paymentMethod}
                  onChange={(e) => handleFilterChange('paymentMethod', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {PAYMENT_METHOD_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {/* From date */}
              <div>
                <label className="block text-xs text-gray-500 font-medium mb-1.5">
                  Từ ngày
                </label>
                <input
                  type="date"
                  value={filters.fromDate}
                  onChange={(e) => handleFilterChange('fromDate', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* To date */}
              <div>
                <label className="block text-xs text-gray-500 font-medium mb-1.5">
                  Đến ngày
                </label>
                <input
                  type="date"
                  value={filters.toDate}
                  onChange={(e) => handleFilterChange('toDate', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Quick date presets + clear */}
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <span className="text-xs text-gray-400">Nhanh:</span>
              <button
                onClick={() => {
                  handleFilterChange('fromDate', getFirstDayOfMonth());
                  handleFilterChange('toDate', getToday());
                }}
                className="text-xs px-2 py-1 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
              >
                Tháng này
              </button>
              <button
                onClick={() => {
                  const now = new Date();
                  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                  const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
                  handleFilterChange('fromDate', prevMonth.toISOString().split('T')[0]);
                  handleFilterChange('toDate', lastDay.toISOString().split('T')[0]);
                }}
                className="text-xs px-2 py-1 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
              >
                Tháng trước
              </button>
              <button
                onClick={() => {
                  const now = new Date();
                  const q = Math.floor(now.getMonth() / 3);
                  const startQ = new Date(now.getFullYear(), q * 3, 1);
                  handleFilterChange('fromDate', startQ.toISOString().split('T')[0]);
                  handleFilterChange('toDate', getToday());
                }}
                className="text-xs px-2 py-1 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
              >
                Quý này
              </button>
              <button
                onClick={() => {
                  handleFilterChange('fromDate', `${new Date().getFullYear()}-01-01`);
                  handleFilterChange('toDate', getToday());
                }}
                className="text-xs px-2 py-1 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
              >
                Năm nay
              </button>

              {hasActiveFilters && (
                <>
                  <div className="w-px h-4 bg-gray-200 mx-1" />
                  <button
                    onClick={handleClearFilters}
                    className="text-xs px-2 py-1 rounded-md text-red-600 hover:bg-red-50 transition-colors font-medium"
                  >
                    Xóa bộ lọc
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ================================================================ */}
      {/* PAYMENT TABLE                                                    */}
      {/* ================================================================ */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-blue-500 mr-3" />
            <span className="text-gray-500">Đang tải dữ liệu thanh toán...</span>
          </div>
        ) : error ? (
          <div className="text-center py-16">
            <AlertTriangle className="w-10 h-10 text-red-400 mx-auto mb-3" />
            <p className="text-red-600 font-medium mb-2">{error}</p>
            <button
              onClick={handleRefresh}
              className="text-sm text-blue-600 hover:text-blue-700 inline-flex items-center gap-1"
            >
              <RefreshCw className="w-4 h-4" /> Thử lại
            </button>
          </div>
        ) : sortedPayments.length === 0 ? (
          <div className="text-center py-20">
            <CreditCard className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-700 mb-2">
              {hasActiveFilters ? 'Không tìm thấy thanh toán' : 'Chưa có thanh toán nào'}
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              {hasActiveFilters
                ? 'Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm'
                : 'Thanh toán sẽ hiển thị tại đây khi bạn ghi nhận thanh toán cho hóa đơn NCC'}
            </p>
            {hasActiveFilters && (
              <button
                onClick={handleClearFilters}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                Xóa bộ lọc
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 uppercase tracking-wider border-b border-gray-100 bg-gray-50/50">
                    <th className="px-4 py-3 font-medium">#</th>
                    <th className="px-4 py-3 font-medium">
                      <button
                        onClick={() => handleSort('payment_date')}
                        className="flex items-center gap-1 hover:text-gray-700 transition-colors"
                      >
                        Ngày TT
                        {sortField === 'payment_date' ? (
                          sortOrder === 'desc' ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 opacity-40" />
                        )}
                      </button>
                    </th>
                    <th className="px-4 py-3 font-medium">Hóa đơn</th>
                    <th className="px-4 py-3 font-medium">NCC</th>
                    <th className="px-4 py-3 font-medium">Phương thức</th>
                    <th className="px-4 py-3 font-medium text-right">
                      <button
                        onClick={() => handleSort('amount')}
                        className="flex items-center gap-1 hover:text-gray-700 transition-colors ml-auto"
                      >
                        Số tiền
                        {sortField === 'amount' ? (
                          sortOrder === 'desc' ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 opacity-40" />
                        )}
                      </button>
                    </th>
                    <th className="px-4 py-3 font-medium">Mã UNC / Ghi chú</th>
                    <th className="px-4 py-3 font-medium">Người tạo</th>
                    <th className="px-4 py-3 font-medium text-center">Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedPayments.map((payment, index) => {
                    const rowNum = (page - 1) * pageSize + index + 1;

                    return (
                      <tr
                        key={payment.id}
                        className="border-b border-gray-50 hover:bg-blue-50/30 transition-colors"
                      >
                        {/* # */}
                        <td className="px-4 py-3.5 text-gray-400 text-xs">{rowNum}</td>

                        {/* Ngày TT */}
                        <td className="px-4 py-3.5">
                          <span className="font-medium text-gray-900">
                            {formatDate(payment.payment_date)}
                          </span>
                        </td>

                        {/* Hóa đơn */}
                        <td className="px-4 py-3.5">
                          {payment.invoice_number ? (
                            <button
                              onClick={() => handleViewInvoice(payment.invoice_id)}
                              className="text-blue-600 hover:text-blue-700 font-medium text-xs inline-flex items-center gap-1 hover:underline"
                            >
                              <FileText className="w-3 h-3" />
                              {payment.invoice_number}
                            </button>
                          ) : (
                            <span className="text-gray-400 text-xs">—</span>
                          )}
                          {payment.order_code && (
                            <p className="text-xs text-gray-400 mt-0.5">
                              ĐH: {payment.order_code}
                            </p>
                          )}
                        </td>

                        {/* NCC */}
                        <td className="px-4 py-3.5">
                          <div className="max-w-[180px]">
                            <p className="text-sm text-gray-900 font-medium truncate">
                              {payment.supplier_name || '—'}
                            </p>
                            {payment.supplier_code && (
                              <p className="text-xs text-gray-400">{payment.supplier_code}</p>
                            )}
                          </div>
                        </td>

                        {/* Phương thức */}
                        <td className="px-4 py-3.5">
                          <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${
                            payment.payment_method === 'bank_transfer'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-green-100 text-green-700'
                          }`}>
                            {payment.payment_method === 'bank_transfer' ? (
                              <Building2 className="w-3 h-3" />
                            ) : (
                              <Banknote className="w-3 h-3" />
                            )}
                            {payment.payment_method === 'bank_transfer' ? 'CK' : 'TM'}
                          </span>
                          {payment.bank_name && (
                            <p className="text-xs text-gray-400 mt-0.5">{payment.bank_name}</p>
                          )}
                        </td>

                        {/* Số tiền */}
                        <td className="px-4 py-3.5 text-right">
                          <span className="font-bold text-gray-900">
                            {formatCurrency(payment.amount)}
                          </span>
                        </td>

                        {/* UNC / Ghi chú */}
                        <td className="px-4 py-3.5">
                          <div className="max-w-[200px]">
                            {payment.reference_number && (
                              <p className="text-xs font-mono text-gray-600">
                                {payment.reference_number}
                              </p>
                            )}
                            {payment.notes && (
                              <p className="text-xs text-gray-400 truncate italic mt-0.5" title={payment.notes}>
                                {payment.notes}
                              </p>
                            )}
                            {!payment.reference_number && !payment.notes && (
                              <span className="text-xs text-gray-300">—</span>
                            )}
                          </div>
                        </td>

                        {/* Người tạo */}
                        <td className="px-4 py-3.5">
                          {payment.created_by_name ? (
                            <span className="text-xs text-gray-600 inline-flex items-center gap-1">
                              <User className="w-3 h-3 text-gray-400" />
                              {payment.created_by_name}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-300">—</span>
                          )}
                        </td>

                        {/* Thao tác */}
                        <td className="px-4 py-3.5 text-center">
                          {payment.invoice_id && (
                            <button
                              onClick={() => handleViewInvoice(payment.invoice_id)}
                              className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              title="Xem hóa đơn"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-gray-100 bg-gray-50/30">
              {/* Info */}
              <div className="flex items-center gap-3 text-sm text-gray-500">
                <span>
                  Hiển thị {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} / {total}
                </span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                  className="px-2 py-1 border border-gray-200 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {PAGE_SIZE_OPTIONS.map(size => (
                    <option key={size} value={size}>{size} / trang</option>
                  ))}
                </select>
              </div>

              {/* Page buttons */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(1)}
                  disabled={page <= 1}
                  className="px-2 py-1.5 text-xs text-gray-500 hover:bg-gray-100 rounded disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Đầu
                </button>
                <button
                  onClick={() => setPage(prev => Math.max(1, prev - 1))}
                  disabled={page <= 1}
                  className="p-1.5 text-gray-500 hover:bg-gray-100 rounded disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                {/* Page numbers */}
                {(() => {
                  const pages: number[] = [];
                  const maxShow = 5;
                  let start = Math.max(1, page - Math.floor(maxShow / 2));
                  let end = Math.min(totalPages, start + maxShow - 1);
                  if (end - start + 1 < maxShow) {
                    start = Math.max(1, end - maxShow + 1);
                  }
                  for (let i = start; i <= end; i++) {
                    pages.push(i);
                  }
                  return pages.map(p => (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={`w-8 h-8 text-xs rounded font-medium transition-colors ${
                        p === page
                          ? 'bg-blue-600 text-white'
                          : 'text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      {p}
                    </button>
                  ));
                })()}

                <button
                  onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={page >= totalPages}
                  className="p-1.5 text-gray-500 hover:bg-gray-100 rounded disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setPage(totalPages)}
                  disabled={page >= totalPages}
                  className="px-2 py-1.5 text-xs text-gray-500 hover:bg-gray-100 rounded disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Cuối
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default PaymentListPage;