// ============================================================================
// SUPPLIER DEBT PAGE
// File: src/features/purchasing/pages/SupplierDebtPage.tsx
// Huy Anh ERP - Phase P5: Payments & Debt Tracking
// ============================================================================
// Trang tổng hợp công nợ NCC:
// - Thống kê thanh toán tổng quan
// - Bảng công nợ theo NCC
// - Danh sách hóa đơn quá hạn
// - Cảnh báo sắp đến hạn
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DollarSign,
  AlertTriangle,
  Clock,
  TrendingUp,
  Search,
  RefreshCw,
  Building2,
  FileText,
  ChevronRight,
  AlertCircle,
  CheckCircle,
  ArrowUpDown,
  Filter,
  Loader2,
  CreditCard,
  Banknote,
} from 'lucide-react';
import { invoicePaymentService, PAYMENT_STATUS_MAP } from '../../../services/invoicePaymentService';
import type {
  SupplierDebtSummary,
  OverdueInvoice,
  PaymentStats,
} from '../../../services/invoicePaymentService';
// Định dạng: utils/format (bản formatCurrency/formatDate tự viết đã xoá)
import { fmtVnd as formatCurrency, fmtDate as formatDate } from '../../../utils/format';
import { dichLoiHeThong } from '../../../utils/dichLoiHeThong';

// ============================================================================
// TYPES
// ============================================================================

type TabType = 'debt' | 'overdue' | 'payments';
type SortField = 'total_remaining_amount' | 'overdue_amount' | 'total_invoice_amount' | 'supplier_name';
type SortOrder = 'asc' | 'desc';

// ============================================================================
// COMPONENT
// ============================================================================

const SupplierDebtPage: React.FC = () => {
  const navigate = useNavigate();
  // Data
  const [debtSummaries, setDebtSummaries] = useState<SupplierDebtSummary[]>([]);
  const [overdueInvoices, setOverdueInvoices] = useState<OverdueInvoice[]>([]);
  const [paymentStats, setPaymentStats] = useState<PaymentStats | null>(null);

  // UI
  const [activeTab, setActiveTab] = useState<TabType>('debt');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('total_remaining_amount');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [filterDebt, setFilterDebt] = useState<'all' | 'has_debt' | 'overdue'>('has_debt');

  // ============================================================================
  // DATA LOADING
  // ============================================================================

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError('');

      const [summaries, overdue, stats] = await Promise.all([
        invoicePaymentService.getDebtSummary(),
        invoicePaymentService.getOverdueInvoices(),
        invoicePaymentService.getPaymentStats(),
      ]);

      setDebtSummaries(summaries);
      setOverdueInvoices(overdue);
      setPaymentStats(stats);
    } catch (err: any) {
      console.error('Error loading debt data:', err);
      setError(dichLoiHeThong(err, 'Không thể tải dữ liệu công nợ'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ============================================================================
  // HELPERS
  // ============================================================================

  // Nhãn trạng thái thanh toán: MỘT map ở invoicePaymentService (trước đây 'Chưa TT'/'TT một phần'/'Đã TT')
  const getPaymentStatusBadge = (status: string) => {
    const cfg = PAYMENT_STATUS_MAP[status];
    const label = cfg?.label || status;
    const className = cfg ? `${cfg.bgColor} ${cfg.color}` : 'bg-gray-100 text-gray-700';
    return (
      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${className}`}>
        {label}
      </span>
    );
  };

  // ============================================================================
  // FILTERED & SORTED DATA
  // ============================================================================

  const filteredDebtSummaries = debtSummaries
    .filter(s => {
      // Filter by search
      if (search) {
        const q = search.toLowerCase();
        if (!(s.supplier_name || '').toLowerCase().includes(q) && !(s.supplier_code || '').toLowerCase().includes(q)) {
          return false;
        }
      }
      // Filter by debt status
      if (filterDebt === 'has_debt') return s.total_remaining_amount > 0;
      if (filterDebt === 'overdue') return s.overdue_invoices > 0;
      return true;
    })
    .sort((a, b) => {
      const aVal = a[sortField] ?? 0;
      const bVal = b[sortField] ?? 0;
      if (typeof aVal === 'string') {
        return sortOrder === 'asc'
          ? aVal.localeCompare(bVal as string)
          : (bVal as string).localeCompare(aVal);
      }
      return sortOrder === 'asc'
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number);
    });

  const filteredOverdueInvoices = overdueInvoices.filter(inv => {
    if (!search) return true;
    const q = search.toLowerCase();
    // Số hóa đơn NCC không bắt buộc (có thể null) → phải `|| ''`, không thì gõ tìm là sập trang
    return (
      (inv.supplier_name || '').toLowerCase().includes(q) ||
      (inv.supplier_code || '').toLowerCase().includes(q) ||
      (inv.invoice_number || '').toLowerCase().includes(q) ||
      (inv.order_code && inv.order_code.toLowerCase().includes(q))
    );
  });

  // ============================================================================
  // SORT HANDLER
  // ============================================================================

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => (
    <ArrowUpDown
      className={`w-3.5 h-3.5 cursor-pointer ${
        sortField === field ? 'text-blue-600' : 'text-gray-400'
      }`}
      onClick={() => toggleSort(field)}
    />
  );

  // ============================================================================
  // STATS CARDS
  // ============================================================================

  const totalDebt = debtSummaries.reduce((sum, s) => sum + s.total_remaining_amount, 0);
  const totalOverdueAmount = debtSummaries.reduce((sum, s) => sum + s.overdue_amount, 0);
  const totalDueSoonAmount = debtSummaries.reduce((sum, s) => sum + s.due_soon_amount, 0);
  const suppliersWithDebt = debtSummaries.filter(s => s.total_remaining_amount > 0).length;

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">💰 Công nợ & Thanh toán</h1>
          <p className="text-sm text-gray-500 mt-1">
            Theo dõi công nợ nhà cung cấp, cảnh báo quá hạn
          </p>
        </div>
        <button
          onClick={loadData}
          disabled={isLoading}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          Làm mới
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {/* Tổng công nợ */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-100 rounded-lg">
              <DollarSign className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Tổng công nợ</p>
              <p className="text-lg font-bold text-blue-600">{formatCurrency(totalDebt)}</p>
              <p className="text-xs text-gray-400">{suppliersWithDebt} NCC còn nợ</p>
            </div>
          </div>
        </div>

        {/* Quá hạn */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-red-100 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Quá hạn</p>
              <p className="text-lg font-bold text-red-600">{formatCurrency(totalOverdueAmount)}</p>
              <p className="text-xs text-gray-400">{overdueInvoices.length} hóa đơn</p>
            </div>
          </div>
        </div>

        {/* Sắp đến hạn */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-yellow-100 rounded-lg">
              <Clock className="w-5 h-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Sắp đến hạn (7 ngày)</p>
              <p className="text-lg font-bold text-yellow-600">{formatCurrency(totalDueSoonAmount)}</p>
              <p className="text-xs text-gray-400">
                {debtSummaries.reduce((sum, s) => sum + s.due_soon_invoices, 0)} hóa đơn
              </p>
            </div>
          </div>
        </div>

        {/* Đã thanh toán (tháng này) */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-green-100 rounded-lg">
              <TrendingUp className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Đã thanh toán</p>
              <p className="text-lg font-bold text-green-600">
                {formatCurrency(paymentStats?.total_amount || 0)}
              </p>
              <p className="text-xs text-gray-400">{paymentStats?.total_payments || 0} lần thanh toán</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-gray-200">
        {/* Tab Header */}
        <div className="flex items-center justify-between border-b px-4">
          <div className="flex gap-1">
            <button
              onClick={() => setActiveTab('debt')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'debt'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Building2 className="w-4 h-4 inline mr-1.5" />
              Công nợ NCC
              {suppliersWithDebt > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 text-xs bg-blue-100 text-blue-600 rounded-full">
                  {suppliersWithDebt}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('overdue')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'overdue'
                  ? 'border-red-600 text-red-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <AlertTriangle className="w-4 h-4 inline mr-1.5" />
              Quá hạn
              {overdueInvoices.length > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 text-xs bg-red-100 text-red-600 rounded-full">
                  {overdueInvoices.length}
                </span>
              )}
            </button>
          </div>

          {/* Search & Filter */}
          <div className="flex items-center gap-2 py-2">
            {activeTab === 'debt' && (
              <select
                value={filterDebt}
                onChange={e => setFilterDebt(e.target.value as any)}
                className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg"
              >
                <option value="all">Tất cả NCC</option>
                <option value="has_debt">Còn công nợ</option>
                <option value="overdue">Có quá hạn</option>
              </select>
            )}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Tìm NCC, số hóa đơn..."
                className="pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg w-48 focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Tab Content */}
        <div className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-gray-500">
              <Loader2 className="w-6 h-6 animate-spin mr-2" />
              Đang tải dữ liệu...
            </div>
          ) : error ? (
            <div className="flex flex-col items-center py-16 text-red-500">
              <AlertCircle className="w-8 h-8 mb-2" />
              <p className="text-sm">{error}</p>
              <button onClick={loadData} className="mt-2 text-blue-600 text-sm hover:underline">
                Thử lại
              </button>
            </div>
          ) : activeTab === 'debt' ? (
            // =================== DEBT TAB ===================
            <div className="overflow-x-auto">
              {filteredDebtSummaries.length === 0 ? (
                // Trống vì TÌM/LỌC thì nói đúng là không khớp — không được báo "tất cả đã thanh toán" (sai nghĩa)
                search || filterDebt === 'overdue' ? (
                  <div className="flex flex-col items-center py-16 text-gray-400">
                    <Search className="w-10 h-10 mb-3 text-gray-300" />
                    <p className="text-sm font-medium">
                      {search ? 'Không tìm thấy NCC phù hợp' : 'Không có NCC nào đang quá hạn'}
                    </p>
                    <p className="text-xs">{search ? 'Thử từ khóa khác hoặc đổi bộ lọc' : 'Đổi bộ lọc để xem NCC khác'}</p>
                  </div>
                ) : debtSummaries.length === 0 ? (
                  <div className="flex flex-col items-center py-16 text-gray-400">
                    <FileText className="w-12 h-12 mb-3 text-gray-300" />
                    <p className="text-sm font-medium">Chưa có hóa đơn NCC nào</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center py-16 text-gray-400">
                    <CheckCircle className="w-12 h-12 mb-3 text-green-300" />
                    <p className="text-sm font-medium">Không có công nợ nào!</p>
                    <p className="text-xs">Tất cả hóa đơn đã được thanh toán</p>
                  </div>
                )
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="text-left px-4 py-3 font-medium text-gray-600">
                        <div className="flex items-center gap-1">
                          NCC <SortIcon field="supplier_name" />
                        </div>
                      </th>
                      <th className="text-center px-3 py-3 font-medium text-gray-600">Hóa đơn</th>
                      <th className="text-right px-3 py-3 font-medium text-gray-600">
                        <div className="flex items-center justify-end gap-1">
                          Tổng hóa đơn <SortIcon field="total_invoice_amount" />
                        </div>
                      </th>
                      <th className="text-right px-3 py-3 font-medium text-gray-600">Đã trả</th>
                      <th className="text-right px-3 py-3 font-medium text-gray-600">
                        <div className="flex items-center justify-end gap-1">
                          Còn nợ <SortIcon field="total_remaining_amount" />
                        </div>
                      </th>
                      <th className="text-center px-3 py-3 font-medium text-gray-600">
                        <div className="flex items-center justify-center gap-1">
                          Quá hạn <SortIcon field="overdue_amount" />
                        </div>
                      </th>
                      <th className="text-center px-3 py-3 font-medium text-gray-600" title="Phần trăm tổng hóa đơn đã trả">Tỷ lệ đã trả</th>
                      <th className="px-3 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredDebtSummaries.map(supplier => {
                      const debtPercent = supplier.total_invoice_amount > 0
                        ? Math.round((supplier.total_paid_amount / supplier.total_invoice_amount) * 100)
                        : 0;

                      return (
                        <tr
                          key={supplier.supplier_id}
                          className="hover:bg-gray-50 cursor-pointer"
                          onClick={() => navigate(`/purchasing/suppliers/${supplier.supplier_id}`)}
                          title="Mở chi tiết nhà cung cấp"
                        >
                          <td className="px-4 py-3">
                            <div>
                              <p className="font-medium text-gray-900">{supplier.supplier_name}</p>
                              <p className="text-xs text-gray-500">{supplier.supplier_code}</p>
                            </div>
                          </td>
                          <td className="text-center px-3 py-3">
                            <div className="text-xs space-y-0.5">
                              <div>{supplier.total_invoices} hóa đơn</div>
                              {supplier.unpaid_invoices > 0 && (
                                <span className="text-amber-600">{supplier.unpaid_invoices} chưa trả</span>
                              )}
                              {supplier.partial_invoices > 0 && (
                                <span className="text-orange-500">{supplier.partial_invoices} trả một phần</span>
                              )}
                            </div>
                          </td>
                          <td className="text-right px-3 py-3 font-medium">
                            {formatCurrency(supplier.total_invoice_amount)}
                          </td>
                          <td className="text-right px-3 py-3 text-blue-600">
                            {formatCurrency(supplier.total_paid_amount)}
                          </td>
                          <td className="text-right px-3 py-3">
                            <span className={`font-bold ${
                              supplier.total_remaining_amount > 0 ? 'text-orange-600' : 'text-green-600'
                            }`}>
                              {formatCurrency(supplier.total_remaining_amount)}
                            </span>
                          </td>
                          <td className="text-center px-3 py-3">
                            {supplier.overdue_invoices > 0 ? (
                              <div>
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-medium">
                                  <AlertTriangle className="w-3 h-3" />
                                  {supplier.overdue_invoices}
                                </span>
                                <p className="text-xs text-red-500 mt-0.5">
                                  {formatCurrency(supplier.overdue_amount)}
                                </p>
                              </div>
                            ) : supplier.due_soon_invoices > 0 ? (
                              <div>
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full text-xs font-medium">
                                  <Clock className="w-3 h-3" />
                                  {supplier.due_soon_invoices}
                                </span>
                                <p className="text-xs text-yellow-500 mt-0.5">Sắp đến hạn</p>
                              </div>
                            ) : (
                              <span className="text-xs text-green-500">—</span>
                            )}
                          </td>
                          <td className="px-3 py-3">
                            <div className="w-16">
                              <div className="w-full bg-gray-200 rounded-full h-1.5">
                                <div
                                  className={`h-1.5 rounded-full ${
                                    debtPercent >= 100 ? 'bg-green-500' :
                                    debtPercent >= 50 ? 'bg-blue-500' : 'bg-orange-500'
                                  }`}
                                  style={{ width: `${Math.min(debtPercent, 100)}%` }}
                                />
                              </div>
                              <p className="text-xs text-gray-400 text-center mt-0.5">{debtPercent}%</p>
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <ChevronRight className="w-4 h-4 text-gray-400" />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {/* Footer totals */}
                  <tfoot>
                    <tr className="bg-gray-50 font-semibold">
                      <td className="px-4 py-3 text-gray-700">
                        Tổng cộng ({filteredDebtSummaries.length} NCC)
                      </td>
                      <td className="text-center px-3 py-3 text-gray-700">
                        {filteredDebtSummaries.reduce((sum, s) => sum + s.total_invoices, 0)} hóa đơn
                      </td>
                      <td className="text-right px-3 py-3 text-gray-700">
                        {formatCurrency(filteredDebtSummaries.reduce((sum, s) => sum + s.total_invoice_amount, 0))}
                      </td>
                      <td className="text-right px-3 py-3 text-blue-600">
                        {formatCurrency(filteredDebtSummaries.reduce((sum, s) => sum + s.total_paid_amount, 0))}
                      </td>
                      <td className="text-right px-3 py-3 text-orange-600">
                        {formatCurrency(filteredDebtSummaries.reduce((sum, s) => sum + s.total_remaining_amount, 0))}
                      </td>
                      <td className="text-center px-3 py-3 text-red-600">
                        {formatCurrency(filteredDebtSummaries.reduce((sum, s) => sum + s.overdue_amount, 0))}
                      </td>
                      <td colSpan={2}></td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          ) : activeTab === 'overdue' ? (
            // =================== OVERDUE TAB ===================
            <div className="overflow-x-auto">
              {filteredOverdueInvoices.length === 0 ? (
                search && overdueInvoices.length > 0 ? (
                  <div className="flex flex-col items-center py-16 text-gray-400">
                    <Search className="w-10 h-10 mb-3 text-gray-300" />
                    <p className="text-sm font-medium">Không tìm thấy hóa đơn quá hạn phù hợp</p>
                    <p className="text-xs">Thử từ khóa khác</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center py-16 text-gray-400">
                    <CheckCircle className="w-12 h-12 mb-3 text-green-300" />
                    <p className="text-sm font-medium">Không có hóa đơn quá hạn!</p>
                    <p className="text-xs">Tất cả đang trong thời hạn thanh toán</p>
                  </div>
                )
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-red-50">
                      <th className="text-left px-4 py-3 font-medium text-red-700">Hóa đơn</th>
                      <th className="text-left px-3 py-3 font-medium text-red-700">NCC</th>
                      <th className="text-left px-3 py-3 font-medium text-red-700">Đơn hàng</th>
                      <th className="text-center px-3 py-3 font-medium text-red-700">Hạn thanh toán</th>
                      <th className="text-center px-3 py-3 font-medium text-red-700">Quá hạn</th>
                      <th className="text-right px-3 py-3 font-medium text-red-700">Tổng hóa đơn</th>
                      <th className="text-right px-3 py-3 font-medium text-red-700">Còn nợ</th>
                      <th className="text-center px-3 py-3 font-medium text-red-700">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredOverdueInvoices.map(inv => (
                      <tr key={inv.id} className="hover:bg-red-50/50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-red-400" />
                            <span className="font-medium text-gray-900">{inv.invoice_number}</span>
                          </div>
                          <p className="text-xs text-gray-500 ml-6">Ngày: {formatDate(inv.invoice_date)}</p>
                        </td>
                        <td className="px-3 py-3">
                          <p className="font-medium text-gray-900">{inv.supplier_name}</p>
                          <p className="text-xs text-gray-500">{inv.supplier_code}</p>
                        </td>
                        <td className="px-3 py-3">
                          {inv.order_code ? (
                            <p className="text-xs text-blue-600">{inv.order_code}</p>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>
                        <td className="text-center px-3 py-3">
                          <span className="text-xs text-red-600 font-medium">
                            {formatDate(inv.due_date)}
                          </span>
                        </td>
                        <td className="text-center px-3 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold ${
                            inv.days_overdue > 30
                              ? 'bg-red-200 text-red-800'
                              : inv.days_overdue > 7
                                ? 'bg-red-100 text-red-700'
                                : 'bg-orange-100 text-orange-700'
                          }`}>
                            <AlertTriangle className="w-3 h-3" />
                            {inv.days_overdue} ngày
                          </span>
                        </td>
                        <td className="text-right px-3 py-3 font-medium">
                          {formatCurrency(inv.total_amount)}
                        </td>
                        <td className="text-right px-3 py-3">
                          <span className="font-bold text-red-600">
                            {formatCurrency(inv.remaining_amount)}
                          </span>
                        </td>
                        <td className="text-center px-3 py-3">
                          {getPaymentStatusBadge(inv.payment_status)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-red-50 font-semibold">
                      <td colSpan={5} className="px-4 py-3 text-red-700">
                        Tổng cộng ({filteredOverdueInvoices.length} hóa đơn quá hạn)
                      </td>
                      <td className="text-right px-3 py-3 text-red-700">
                        {formatCurrency(filteredOverdueInvoices.reduce((sum, i) => sum + i.total_amount, 0))}
                      </td>
                      <td className="text-right px-3 py-3 text-red-700">
                        {formatCurrency(filteredOverdueInvoices.reduce((sum, i) => sum + i.remaining_amount, 0))}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default SupplierDebtPage;