// ============================================================================
// ORDER INVOICE TAB (CẬP NHẬT - FIX-2)
// File: src/features/purchasing/pages/components/orders/OrderInvoiceTab.tsx
// Huy Anh ERP - Phase P5: Payments & Debt Tracking
// ============================================================================
// Tab "Hóa đơn & Thanh toán" trong PODetailPage
// FIX: Bấm "Thanh toán" → gọi onPayment(invoiceId) → mở PaymentFormModal
//      KHÔNG navigate đi nơi khác
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import {
  FileText,
  Plus,
  CreditCard,
  Eye,
  Trash2,
  AlertTriangle,
  Clock,
  CheckCircle,
  Banknote,
  Building2,
  Image as ImageIcon,
  ChevronDown,
  ChevronUp,
  Loader2,
  RefreshCw,
  ExternalLink,
  TrendingUp,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supplierInvoiceService } from '../../../../../services/supplierInvoiceService';
import { invoicePaymentService } from '../../../../../services/invoicePaymentService';

// ============================================================================
// TYPES
// ============================================================================

interface SupplierInvoice {
  id: string;
  invoice_number: string;
  supplier_id: string;
  order_id: string;
  invoice_date: string;
  due_date?: string;
  total_amount: number;
  vat_amount?: number;
  paid_amount: number;
  remaining_amount: number;
  payment_status: 'unpaid' | 'partial' | 'paid';
  status: string;
  notes?: string;
  image_urls?: string[];
  created_at: string;
  supplier?: {
    id: string;
    code: string;
    name: string;
  } | null;
}

interface InvoiceSummary {
  total_invoices: number;
  total_invoice_amount: number;
  total_paid: number;
  total_remaining: number;
  overdue_count: number;
}

interface OrderInvoiceTabProps {
  orderId: string;
  orderStatus: string;
  refreshKey?: number;
  onPayment: (invoiceId: string, invoiceNumber: string) => void;
  onAddInvoice: () => void;
}

// ============================================================================
// STATUS CONFIG
// ============================================================================

const PAYMENT_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  unpaid: { label: 'Chưa thanh toán', color: 'text-red-700', bg: 'bg-red-50 border-red-200', icon: AlertTriangle },
  partial: { label: 'Thanh toán một phần', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200', icon: Clock },
  paid: { label: 'Đã thanh toán', color: 'text-green-700', bg: 'bg-green-50 border-green-200', icon: CheckCircle },
};

// ============================================================================
// HELPER: FORMAT
// ============================================================================

const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(amount);
};

const formatDate = (dateStr: string): string => {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
};

const isOverdue = (dueDate?: string, paymentStatus?: string): boolean => {
  if (!dueDate || paymentStatus === 'paid') return false;
  return new Date(dueDate) < new Date();
};

const getDaysOverdue = (dueDate: string): number => {
  const diff = new Date().getTime() - new Date(dueDate).getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
};

// ============================================================================
// COMPONENT
// ============================================================================

const OrderInvoiceTab: React.FC<OrderInvoiceTabProps> = ({
  orderId,
  orderStatus,
  refreshKey = 0,
  onPayment,
  onAddInvoice,
}) => {
  const navigate = useNavigate();

  // State
  const [invoices, setInvoices] = useState<SupplierInvoice[]>([]);
  const [summary, setSummary] = useState<InvoiceSummary>({
    total_invoices: 0,
    total_invoice_amount: 0,
    total_paid: 0,
    total_remaining: 0,
    overdue_count: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedSuppliers, setExpandedSuppliers] = useState<Set<string>>(new Set());

  // ========================================================================
  // FETCH DATA
  // ========================================================================

  const fetchInvoices = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch invoices for this order
      const { data, error: fetchError } = await (window as any).__supabase
        ? (window as any).__supabase
            .from('supplier_invoices')
            .select(`
              *,
              supplier:supplier_id(id, code, name)
            `)
            .eq('order_id', orderId)
            .order('created_at', { ascending: false })
        : await supplierInvoiceService.getByOrderId
          ? supplierInvoiceService.getByOrderId(orderId)
          : { data: [], error: null };

      // Fallback: use Supabase directly if service method doesn't exist
      let invoiceData: SupplierInvoice[] = [];

      if (fetchError) {
        console.error('Error fetching invoices:', fetchError);
        // Try alternative approach
        try {
          const result = await fetch(`/api/invoices?order_id=${orderId}`);
          invoiceData = await result.json();
        } catch {
          throw fetchError;
        }
      } else if (Array.isArray(data)) {
        invoiceData = data.map((item: any) => ({
          ...item,
          supplier: Array.isArray(item.supplier) ? item.supplier[0] : item.supplier,
        }));
      } else if (data && typeof data === 'object' && 'data' in data) {
        invoiceData = (data as any).data || [];
      }

      setInvoices(invoiceData);

      // Calculate summary
      const summaryData: InvoiceSummary = {
        total_invoices: invoiceData.length,
        total_invoice_amount: invoiceData.reduce((sum: number, inv: SupplierInvoice) => sum + (inv.total_amount || 0), 0),
        total_paid: invoiceData.reduce((sum: number, inv: SupplierInvoice) => sum + (inv.paid_amount || 0), 0),
        total_remaining: invoiceData.reduce((sum: number, inv: SupplierInvoice) => sum + (inv.remaining_amount || 0), 0),
        overdue_count: invoiceData.filter((inv: SupplierInvoice) => isOverdue(inv.due_date, inv.payment_status)).length,
      };
      setSummary(summaryData);
    } catch (err: any) {
      console.error('❌ Error loading invoices:', err);
      setError(err.message || 'Không thể tải danh sách hóa đơn');
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    if (orderId) {
      fetchInvoices();
    }
  }, [orderId, refreshKey, fetchInvoices]);

  // ========================================================================
  // GROUP BY SUPPLIER
  // ========================================================================

  const groupedBySupplier = React.useMemo(() => {
    const groups: Record<string, {
      supplier: { id: string; code: string; name: string };
      invoices: SupplierInvoice[];
      totalAmount: number;
      paidAmount: number;
      remainingAmount: number;
    }> = {};

    invoices.forEach(inv => {
      const supplierId = inv.supplier_id || 'unknown';
      if (!groups[supplierId]) {
        groups[supplierId] = {
          supplier: inv.supplier || { id: supplierId, code: '—', name: 'Không xác định' },
          invoices: [],
          totalAmount: 0,
          paidAmount: 0,
          remainingAmount: 0,
        };
      }
      groups[supplierId].invoices.push(inv);
      groups[supplierId].totalAmount += inv.total_amount || 0;
      groups[supplierId].paidAmount += inv.paid_amount || 0;
      groups[supplierId].remainingAmount += inv.remaining_amount || 0;
    });

    return Object.values(groups);
  }, [invoices]);

  // ========================================================================
  // HANDLERS
  // ========================================================================

  const toggleSupplier = (supplierId: string) => {
    setExpandedSuppliers(prev => {
      const next = new Set(prev);
      if (next.has(supplierId)) {
        next.delete(supplierId);
      } else {
        next.add(supplierId);
      }
      return next;
    });
  };

  const handleViewInvoice = (invoiceId: string) => {
    navigate(`/purchasing/invoices/${invoiceId}`);
  };

  // FIX QUAN TRỌNG: Gọi onPayment thay vì navigate
  const handlePayment = (invoiceId: string, invoiceNumber: string) => {
    onPayment(invoiceId, invoiceNumber);
  };

  // ========================================================================
  // RENDER: LOADING / ERROR
  // ========================================================================

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-blue-500 mr-3" />
        <span className="text-gray-500">Đang tải hóa đơn & thanh toán...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <AlertTriangle className="w-10 h-10 text-red-400 mx-auto mb-3" />
        <p className="text-red-600 font-medium">{error}</p>
        <button
          onClick={fetchInvoices}
          className="mt-3 text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1 mx-auto"
        >
          <RefreshCw className="w-4 h-4" /> Thử lại
        </button>
      </div>
    );
  }

  // ========================================================================
  // RENDER: EMPTY STATE
  // ========================================================================

  if (invoices.length === 0) {
    return (
      <div className="text-center py-12">
        <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-700 mb-2">Chưa có hóa đơn nào</h3>
        <p className="text-gray-500 mb-4 text-sm">
          Thêm hóa đơn NCC khi nhận hàng để theo dõi thanh toán
        </p>
        {['confirmed', 'partial', 'delivering'].includes(orderStatus) && (
          <button
            onClick={onAddInvoice}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            Thêm hóa đơn NCC
          </button>
        )}
      </div>
    );
  }

  // ========================================================================
  // RENDER: MAIN
  // ========================================================================

  const paymentPercent = summary.total_invoice_amount > 0
    ? Math.round((summary.total_paid / summary.total_invoice_amount) * 100)
    : 0;

  return (
    <div className="space-y-5">
      {/* ================================================================ */}
      {/* SUMMARY CARDS                                                    */}
      {/* ================================================================ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Tổng hóa đơn */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <FileText className="w-4 h-4 text-blue-500" />
            <span className="text-xs text-gray-500 font-medium">Hóa đơn</span>
          </div>
          <p className="text-lg font-bold text-gray-900">{summary.total_invoices}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {formatCurrency(summary.total_invoice_amount)}
          </p>
        </div>

        {/* Đã thanh toán */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle className="w-4 h-4 text-green-500" />
            <span className="text-xs text-gray-500 font-medium">Đã thanh toán</span>
          </div>
          <p className="text-lg font-bold text-green-600">{formatCurrency(summary.total_paid)}</p>
          <p className="text-xs text-gray-400 mt-0.5">{paymentPercent}% tổng HĐ</p>
        </div>

        {/* Còn nợ */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-amber-500" />
            <span className="text-xs text-gray-500 font-medium">Còn nợ</span>
          </div>
          <p className="text-lg font-bold text-amber-600">{formatCurrency(summary.total_remaining)}</p>
          <p className="text-xs text-gray-400 mt-0.5">{100 - paymentPercent}% chưa TT</p>
        </div>

        {/* Quá hạn */}
        <div className={`bg-white border rounded-xl p-4 ${summary.overdue_count > 0 ? 'border-red-200 bg-red-50' : 'border-gray-200'}`}>
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className={`w-4 h-4 ${summary.overdue_count > 0 ? 'text-red-500' : 'text-gray-400'}`} />
            <span className="text-xs text-gray-500 font-medium">Quá hạn</span>
          </div>
          <p className={`text-lg font-bold ${summary.overdue_count > 0 ? 'text-red-600' : 'text-gray-400'}`}>
            {summary.overdue_count}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">hóa đơn</p>
        </div>
      </div>

      {/* ================================================================ */}
      {/* PROGRESS BAR TỔNG                                                */}
      {/* ================================================================ */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">Tiến độ thanh toán tổng</span>
          <span className="text-sm font-bold text-blue-600">{paymentPercent}%</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              paymentPercent >= 100 ? 'bg-green-500' :
              paymentPercent >= 50 ? 'bg-blue-500' :
              paymentPercent > 0 ? 'bg-amber-500' : 'bg-gray-300'
            }`}
            style={{ width: `${Math.min(paymentPercent, 100)}%` }}
          />
        </div>
        <div className="flex justify-between mt-1.5 text-xs text-gray-400">
          <span>Đã TT: {formatCurrency(summary.total_paid)}</span>
          <span>Tổng: {formatCurrency(summary.total_invoice_amount)}</span>
        </div>
      </div>

      {/* ================================================================ */}
      {/* NHÓM THEO NCC                                                     */}
      {/* ================================================================ */}
      <div className="space-y-3">
        {groupedBySupplier.map(group => {
          const supplierExpanded = expandedSuppliers.has(group.supplier.id) || groupedBySupplier.length === 1;
          const supplierPayPercent = group.totalAmount > 0
            ? Math.round((group.paidAmount / group.totalAmount) * 100)
            : 0;

          return (
            <div key={group.supplier.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              {/* Supplier Header */}
              <button
                onClick={() => toggleSupplier(group.supplier.id)}
                className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Building2 className="w-5 h-5 text-blue-500 flex-shrink-0" />
                  <div className="text-left">
                    <p className="font-semibold text-gray-900 text-sm">{group.supplier.name}</p>
                    <p className="text-xs text-gray-500">{group.supplier.code} · {group.invoices.length} hóa đơn</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  {/* Mini progress */}
                  <div className="text-right hidden sm:block">
                    <p className="text-xs text-gray-500">
                      TT: {formatCurrency(group.paidAmount)} / {formatCurrency(group.totalAmount)}
                    </p>
                    <div className="w-24 bg-gray-100 rounded-full h-1.5 mt-1">
                      <div
                        className={`h-full rounded-full ${
                          supplierPayPercent >= 100 ? 'bg-green-500' :
                          supplierPayPercent > 0 ? 'bg-blue-500' : 'bg-gray-300'
                        }`}
                        style={{ width: `${Math.min(supplierPayPercent, 100)}%` }}
                      />
                    </div>
                  </div>
                  {/* Remaining badge */}
                  {group.remainingAmount > 0 && (
                    <span className="text-xs font-medium text-amber-700 bg-amber-50 px-2 py-1 rounded-lg whitespace-nowrap">
                      Nợ: {formatCurrency(group.remainingAmount)}
                    </span>
                  )}
                  {supplierExpanded ? (
                    <ChevronUp className="w-4 h-4 text-gray-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  )}
                </div>
              </button>

              {/* Invoice List */}
              {supplierExpanded && (
                <div className="border-t border-gray-100">
                  {group.invoices.map((invoice, idx) => {
                    const statusConfig = PAYMENT_STATUS_CONFIG[invoice.payment_status] || PAYMENT_STATUS_CONFIG.unpaid;
                    const StatusIcon = statusConfig.icon;
                    const overdue = isOverdue(invoice.due_date, invoice.payment_status);
                    const daysOver = invoice.due_date ? getDaysOverdue(invoice.due_date) : 0;
                    const invoicePayPercent = invoice.total_amount > 0
                      ? Math.round((invoice.paid_amount / invoice.total_amount) * 100)
                      : 0;

                    return (
                      <div
                        key={invoice.id}
                        className={`p-4 ${idx > 0 ? 'border-t border-gray-50' : ''} hover:bg-gray-50/50 transition-colors`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                          {/* Invoice Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                              <span className="font-medium text-gray-900 text-sm truncate">
                                {invoice.invoice_number}
                              </span>
                              {/* Status Badge */}
                              <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${statusConfig.bg} ${statusConfig.color}`}>
                                <StatusIcon className="w-3 h-3" />
                                {statusConfig.label}
                              </span>
                              {/* Overdue Badge */}
                              {overdue && (
                                <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 border border-red-200 text-red-700">
                                  <AlertTriangle className="w-3 h-3" />
                                  Quá hạn {daysOver} ngày
                                </span>
                              )}
                              {/* Has images */}
                              {invoice.image_urls && invoice.image_urls.length > 0 && (
                                <span className="text-xs text-gray-400 flex items-center gap-0.5">
                                  <ImageIcon className="w-3 h-3" />
                                  {invoice.image_urls.length}
                                </span>
                              )}
                            </div>

                            {/* Details row */}
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 ml-6">
                              <span>Ngày HĐ: {formatDate(invoice.invoice_date)}</span>
                              {invoice.due_date && (
                                <span className={overdue ? 'text-red-600 font-medium' : ''}>
                                  Hạn TT: {formatDate(invoice.due_date)}
                                </span>
                              )}
                              <span>Tổng: <strong className="text-gray-700">{formatCurrency(invoice.total_amount)}</strong></span>
                            </div>

                            {/* Payment progress */}
                            <div className="ml-6 mt-2">
                              <div className="flex items-center gap-3">
                                <div className="flex-1 max-w-xs bg-gray-100 rounded-full h-2">
                                  <div
                                    className={`h-full rounded-full transition-all ${
                                      invoicePayPercent >= 100 ? 'bg-green-500' :
                                      invoicePayPercent > 0 ? 'bg-blue-500' : 'bg-gray-300'
                                    }`}
                                    style={{ width: `${Math.min(invoicePayPercent, 100)}%` }}
                                  />
                                </div>
                                <span className="text-xs font-medium text-gray-600 whitespace-nowrap">
                                  {formatCurrency(invoice.paid_amount)} / {formatCurrency(invoice.total_amount)}
                                  <span className="ml-1 text-gray-400">({invoicePayPercent}%)</span>
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-2 sm:flex-shrink-0 ml-6 sm:ml-0">
                            {/* Nút Thanh toán nhanh - CHỈ hiện khi còn nợ */}
                            {invoice.payment_status !== 'paid' && invoice.remaining_amount > 0 && (
                              <button
                                onClick={() => handlePayment(invoice.id, invoice.invoice_number)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 transition-colors shadow-sm"
                                title={`Thanh toán ${formatCurrency(invoice.remaining_amount)}`}
                              >
                                <CreditCard className="w-3.5 h-3.5" />
                                <span>Thanh toán</span>
                                <span className="bg-green-700 px-1.5 py-0.5 rounded text-[10px]">
                                  {formatCurrency(invoice.remaining_amount)}
                                </span>
                              </button>
                            )}
                            {/* Nút Chi tiết */}
                            <button
                              onClick={() => handleViewInvoice(invoice.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-100 border border-gray-200 transition-colors"
                              title="Xem chi tiết hóa đơn"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              Chi tiết
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* Add invoice button (within supplier group) */}
                  {['confirmed', 'partial', 'delivering'].includes(orderStatus) && (
                    <div className="p-3 border-t border-gray-100 bg-gray-50/50">
                      <button
                        onClick={onAddInvoice}
                        className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Thêm hóa đơn cho {group.supplier.name}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ================================================================ */}
      {/* FOOTER ACTIONS                                                    */}
      {/* ================================================================ */}
      {['confirmed', 'partial', 'delivering'].includes(orderStatus) && (
        <div className="flex items-center justify-between pt-2">
          <button
            onClick={onAddInvoice}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Thêm hóa đơn NCC
          </button>
          <button
            onClick={fetchInvoices}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-gray-500 text-sm hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Làm mới
          </button>
        </div>
      )}
    </div>
  );
};

export default OrderInvoiceTab;