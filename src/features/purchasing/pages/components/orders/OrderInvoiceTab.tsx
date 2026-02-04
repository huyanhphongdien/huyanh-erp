// ============================================================================
// ORDER INVOICE TAB - Tab "Hóa đơn & Thanh toán" trong PODetailPage
// File: src/features/purchasing/pages/components/orders/OrderInvoiceTab.tsx
// Huy Anh ERP System - Phase P5
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import {
  Receipt,
  CreditCard,
  Plus,
  Eye,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Ban,
  Building2,
  Calendar,
  FileText,
  Loader2,
  Banknote,
  TrendingUp,
  AlertCircle,
  ImageIcon,
  ExternalLink,
} from 'lucide-react';
import { purchaseOrderService } from '../../../../../services/purchaseOrderService';
import type {
  OrderInvoiceSummary,
  OrderSupplierInvoiceBreakdown,
  OrderInvoiceDetail,
  InvoicePaymentDetail,
} from '../../../../../services/purchaseOrderService';

// ============================================================================
// HELPERS
// ============================================================================

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
  }).format(amount);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('vi-VN');
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('vi-VN');
}

// ============================================================================
// INVOICE STATUS BADGE
// ============================================================================

const INVOICE_STATUS_CONFIG: Record<string, {
  label: string;
  className: string;
  icon: React.ElementType;
}> = {
  pending: {
    label: 'Chờ TT',
    className: 'bg-yellow-100 text-yellow-700',
    icon: Clock,
  },
  partial: {
    label: 'TT một phần',
    className: 'bg-orange-100 text-orange-700',
    icon: TrendingUp,
  },
  paid: {
    label: 'Đã TT đủ',
    className: 'bg-green-100 text-green-700',
    icon: CheckCircle2,
  },
  cancelled: {
    label: 'Đã hủy',
    className: 'bg-gray-100 text-gray-500',
    icon: Ban,
  },
};

function InvoiceStatusBadge({ status }: { status: string }) {
  const config = INVOICE_STATUS_CONFIG[status] || INVOICE_STATUS_CONFIG.pending;
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${config.className}`}>
      <Icon className="w-3 h-3" />
      {config.label}
    </span>
  );
}

// ============================================================================
// PAYMENT METHOD LABEL
// ============================================================================

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: 'Tiền mặt',
  bank_transfer: 'Chuyển khoản',
};

// ============================================================================
// PROGRESS BAR
// ============================================================================

function ProgressBar({
  value,
  color = 'blue',
  height = 'h-2',
}: {
  value: number;
  color?: 'blue' | 'green' | 'orange' | 'red';
  height?: string;
}) {
  const colorClasses = {
    blue: 'bg-blue-500',
    green: 'bg-green-500',
    orange: 'bg-orange-500',
    red: 'bg-red-500',
  };

  return (
    <div className={`w-full bg-gray-200 rounded-full ${height} overflow-hidden`}>
      <div
        className={`${height} rounded-full transition-all duration-500 ${colorClasses[color]}`}
        style={{ width: `${Math.min(value, 100)}%` }}
      />
    </div>
  );
}

// ============================================================================
// SUMMARY CARDS
// ============================================================================

function SummaryCards({ summary }: { summary: OrderInvoiceSummary }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {/* Tổng đơn hàng */}
      <div className="bg-white border border-gray-200 rounded-lg p-3">
        <div className="flex items-center gap-2 mb-1">
          <FileText className="w-4 h-4 text-gray-400" />
          <span className="text-xs text-gray-500">Tổng đơn hàng</span>
        </div>
        <p className="text-lg font-bold text-gray-900">
          {formatCurrency(summary.grand_total)}
        </p>
      </div>

      {/* Hóa đơn */}
      <div className="bg-white border border-gray-200 rounded-lg p-3">
        <div className="flex items-center gap-2 mb-1">
          <Receipt className="w-4 h-4 text-blue-500" />
          <span className="text-xs text-gray-500">
            Hóa đơn ({summary.invoice_count})
          </span>
        </div>
        <p className="text-lg font-bold text-blue-600">
          {formatCurrency(summary.total_invoiced)}
        </p>
        <ProgressBar value={summary.invoice_progress} color="blue" height="h-1" />
        <p className="text-xs text-gray-400 mt-0.5">{summary.invoice_progress}%</p>
      </div>

      {/* Đã thanh toán */}
      <div className="bg-white border border-gray-200 rounded-lg p-3">
        <div className="flex items-center gap-2 mb-1">
          <CreditCard className="w-4 h-4 text-green-500" />
          <span className="text-xs text-gray-500">Đã thanh toán</span>
        </div>
        <p className="text-lg font-bold text-green-600">
          {formatCurrency(summary.total_paid)}
        </p>
        <ProgressBar value={summary.payment_progress} color="green" height="h-1" />
        <p className="text-xs text-gray-400 mt-0.5">{summary.payment_progress}%</p>
      </div>

      {/* Còn lại / Quá hạn */}
      <div className={`border rounded-lg p-3 ${
        summary.overdue_count > 0 
          ? 'bg-red-50 border-red-200' 
          : 'bg-white border-gray-200'
      }`}>
        <div className="flex items-center gap-2 mb-1">
          {summary.overdue_count > 0 ? (
            <AlertTriangle className="w-4 h-4 text-red-500" />
          ) : (
            <Banknote className="w-4 h-4 text-orange-500" />
          )}
          <span className="text-xs text-gray-500">
            {summary.overdue_count > 0
              ? `Quá hạn (${summary.overdue_count} HĐ)`
              : 'Còn phải trả'}
          </span>
        </div>
        <p className={`text-lg font-bold ${
          summary.overdue_count > 0 ? 'text-red-600' : 'text-orange-600'
        }`}>
          {formatCurrency(summary.total_remaining)}
        </p>
      </div>
    </div>
  );
}

// ============================================================================
// PAYMENT ROW
// ============================================================================

function PaymentRow({ payment }: { payment: InvoicePaymentDetail }) {
  return (
    <div className="flex items-center justify-between py-2 px-3 bg-green-50 rounded-lg text-sm">
      <div className="flex items-center gap-3">
        <CreditCard className="w-3.5 h-3.5 text-green-600" />
        <div>
          <span className="font-medium text-green-700">
            {formatCurrency(payment.amount)}
          </span>
          <span className="text-gray-500 ml-2">
            {PAYMENT_METHOD_LABELS[payment.payment_method] || payment.payment_method}
          </span>
          {payment.reference_number && (
            <span className="text-gray-400 ml-2">#{payment.reference_number}</span>
          )}
        </div>
      </div>
      <div className="text-right text-xs text-gray-500">
        <div>{formatDate(payment.payment_date)}</div>
        {payment.created_by_name && <div>{payment.created_by_name}</div>}
      </div>
    </div>
  );
}

// ============================================================================
// INVOICE CARD
// ============================================================================

function InvoiceCard({
  invoice,
  onPayment,
  onViewDetail,
}: {
  invoice: OrderInvoiceDetail;
  onPayment: (invoiceId: string) => void;
  onViewDetail: (invoiceId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const paymentPercent = invoice.total_amount > 0
    ? Math.round((invoice.paid_amount / invoice.total_amount) * 100)
    : 0;

  return (
    <div className={`border rounded-lg overflow-hidden ${
      invoice.is_overdue ? 'border-red-300 bg-red-50/30' : 'border-gray-200'
    }`}>
      {/* Header */}
      <div
        className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3 min-w-0">
          <Receipt className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm text-gray-900">
                {invoice.invoice_code}
              </span>
              {invoice.invoice_number && (
                <span className="text-xs text-gray-500">
                  (Số HĐ: {invoice.invoice_number})
                </span>
              )}
              <InvoiceStatusBadge status={invoice.status} />
              {invoice.is_overdue && (
                <span className="inline-flex items-center gap-0.5 text-xs text-red-600 font-medium">
                  <AlertTriangle className="w-3 h-3" />
                  Quá hạn {invoice.days_overdue} ngày
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {formatDate(invoice.invoice_date)}
              </span>
              {invoice.due_date && (
                <span>Hạn TT: {formatDate(invoice.due_date)}</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="text-right">
            <p className="text-sm font-semibold text-gray-900">
              {formatCurrency(invoice.total_amount)}
            </p>
            <p className="text-xs text-gray-500">
              Đã TT: {paymentPercent}%
            </p>
          </div>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          )}
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-gray-200 p-3 space-y-3">
          {/* Payment progress */}
          <div>
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>Đã TT: {formatCurrency(invoice.paid_amount)}</span>
              <span>Còn lại: {formatCurrency(invoice.remaining_amount)}</span>
            </div>
            <ProgressBar
              value={paymentPercent}
              color={invoice.status === 'paid' ? 'green' : 'blue'}
              height="h-1.5"
            />
          </div>

          {/* Images */}
          {invoice.image_urls && invoice.image_urls.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1 flex items-center gap-1">
                <ImageIcon className="w-3 h-3" />
                Ảnh hóa đơn ({invoice.image_urls.length})
              </p>
              <div className="flex gap-2 flex-wrap">
                {invoice.image_urls.slice(0, 4).map((url, idx) => (
                  <a
                    key={idx}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-16 h-16 rounded-lg border border-gray-200 overflow-hidden hover:border-blue-400 transition-colors"
                  >
                    <img
                      src={url}
                      alt={`HĐ ${idx + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </a>
                ))}
                {invoice.image_urls.length > 4 && (
                  <div className="w-16 h-16 rounded-lg border border-gray-200 flex items-center justify-center text-xs text-gray-500">
                    +{invoice.image_urls.length - 4}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Notes */}
          {invoice.notes && (
            <p className="text-xs text-gray-500 italic">{invoice.notes}</p>
          )}

          {/* Payments list */}
          {invoice.payments.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1.5">
                Lịch sử thanh toán ({invoice.payments.length})
              </p>
              <div className="space-y-1.5">
                {invoice.payments.map((p) => (
                  <PaymentRow key={p.id} payment={p} />
                ))}
              </div>
            </div>
          )}

          {/* Meta */}
          <div className="text-xs text-gray-400 flex items-center gap-3">
            {invoice.created_by_name && (
              <span>Tạo bởi: {invoice.created_by_name}</span>
            )}
            <span>{formatDateTime(invoice.created_at)}</span>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1 border-t border-gray-100">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onViewDetail(invoice.id);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <Eye className="w-3.5 h-3.5" />
              Chi tiết
            </button>
            {['pending', 'partial'].includes(invoice.status) && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onPayment(invoice.id);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors"
              >
                <CreditCard className="w-3.5 h-3.5" />
                Thanh toán
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// SUPPLIER SECTION
// ============================================================================

function SupplierSection({
  supplier,
  onAddInvoice,
  onPayment,
  onViewInvoice,
}: {
  supplier: OrderSupplierInvoiceBreakdown;
  onAddInvoice: (supplierId: string) => void;
  onPayment: (invoiceId: string) => void;
  onViewInvoice: (invoiceId: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Supplier header */}
      <div
        className="flex items-center justify-between p-4 bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors"
        onClick={() => setCollapsed(!collapsed)}
      >
        <div className="flex items-center gap-3">
          <Building2 className="w-5 h-5 text-blue-500" />
          <div>
            <h4 className="font-semibold text-gray-900">
              {supplier.supplier_name}
            </h4>
            <p className="text-xs text-gray-500">
              {supplier.supplier_code} • {supplier.order_item_count} vật tư •{' '}
              Đơn hàng: {formatCurrency(supplier.order_subtotal)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Mini progress */}
          <div className="hidden sm:flex items-center gap-3 text-xs">
            <div className="text-center">
              <p className="text-gray-500">Hóa đơn</p>
              <p className="font-semibold text-blue-600">{supplier.invoice_progress}%</p>
            </div>
            <div className="text-center">
              <p className="text-gray-500">Thanh toán</p>
              <p className="font-semibold text-green-600">{supplier.payment_progress}%</p>
            </div>
            {supplier.remaining > 0 && (
              <div className="text-center">
                <p className="text-gray-500">Còn nợ</p>
                <p className="font-semibold text-orange-600">
                  {formatCurrency(supplier.remaining)}
                </p>
              </div>
            )}
          </div>

          {collapsed ? (
            <ChevronDown className="w-5 h-5 text-gray-400" />
          ) : (
            <ChevronUp className="w-5 h-5 text-gray-400" />
          )}
        </div>
      </div>

      {!collapsed && (
        <div className="p-4 space-y-3">
          {/* Progress bars */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>Hóa đơn</span>
                <span>{supplier.invoice_progress}% ({formatCurrency(supplier.total_invoiced)})</span>
              </div>
              <ProgressBar value={supplier.invoice_progress} color="blue" height="h-1.5" />
            </div>
            <div>
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>Thanh toán</span>
                <span>{supplier.payment_progress}% ({formatCurrency(supplier.total_paid)})</span>
              </div>
              <ProgressBar value={supplier.payment_progress} color="green" height="h-1.5" />
            </div>
          </div>

          {/* Invoices */}
          {supplier.invoices.length > 0 ? (
            <div className="space-y-2">
              {supplier.invoices.map((inv) => (
                <InvoiceCard
                  key={inv.id}
                  invoice={inv}
                  onPayment={onPayment}
                  onViewDetail={onViewInvoice}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-6 text-gray-400">
              <Receipt className="w-8 h-8 mx-auto mb-2" />
              <p className="text-sm">Chưa có hóa đơn</p>
            </div>
          )}

          {/* Add invoice button */}
          <button
            onClick={() => onAddInvoice(supplier.supplier_id)}
            className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-gray-300 text-gray-500 hover:border-blue-400 hover:text-blue-600 rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Thêm hóa đơn cho {supplier.supplier_name}
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

interface OrderInvoiceTabProps {
  orderId: string;
  orderStatus: string;
  /** Callback khi mở modal thêm hóa đơn */
  onAddInvoice: (supplierId?: string) => void;
  /** Callback khi thanh toán */
  onPayment: (invoiceId: string) => void;
  /** Callback khi xem chi tiết hóa đơn */
  onViewInvoice: (invoiceId: string) => void;
  /** Trigger refresh */
  refreshKey?: number;
}

export function OrderInvoiceTab({
  orderId,
  orderStatus,
  onAddInvoice,
  onPayment,
  onViewInvoice,
  refreshKey = 0,
}: OrderInvoiceTabProps) {
  const [summary, setSummary] = useState<OrderInvoiceSummary | null>(null);
  const [breakdown, setBreakdown] = useState<OrderSupplierInvoiceBreakdown[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [summaryData, breakdownData] = await Promise.all([
        purchaseOrderService.getOrderInvoiceSummary(orderId),
        purchaseOrderService.getOrderInvoiceBreakdown(orderId),
      ]);
      setSummary(summaryData);
      setBreakdown(breakdownData);
    } catch (err: any) {
      console.error('❌ [OrderInvoiceTab] loadData error:', err);
      setError(err.message || 'Lỗi tải dữ liệu');
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    loadData();
  }, [loadData, refreshKey]);

  // Can add invoice? Only when order is confirmed, partial, or completed
  const canAddInvoice = ['confirmed', 'partial', 'completed'].includes(orderStatus);

  // Loading
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
        <span className="ml-2 text-gray-500">Đang tải hóa đơn & thanh toán...</span>
      </div>
    );
  }

  // Error
  if (error) {
    return (
      <div className="text-center py-8">
        <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
        <p className="text-red-600 text-sm">{error}</p>
        <button
          onClick={loadData}
          className="mt-2 text-sm text-blue-600 hover:underline"
        >
          Thử lại
        </button>
      </div>
    );
  }

  // Draft order - no invoices yet
  if (orderStatus === 'draft') {
    return (
      <div className="text-center py-12 text-gray-400">
        <Receipt className="w-12 h-12 mx-auto mb-3" />
        <p className="text-sm font-medium">Đơn hàng ở trạng thái Nháp</p>
        <p className="text-xs mt-1">Xác nhận đơn hàng trước khi thêm hóa đơn</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      {summary && <SummaryCards summary={summary} />}

      {/* Supplier Breakdown */}
      {breakdown.length > 0 ? (
        <div className="space-y-4">
          {breakdown.map((supplier) => (
            <SupplierSection
              key={supplier.supplier_id}
              supplier={supplier}
              onAddInvoice={canAddInvoice ? onAddInvoice : () => {}}
              onPayment={onPayment}
              onViewInvoice={onViewInvoice}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-gray-400">
          <Receipt className="w-10 h-10 mx-auto mb-2" />
          <p className="text-sm">Chưa có hóa đơn nào</p>
          {canAddInvoice && (
            <button
              onClick={() => onAddInvoice()}
              className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Thêm hóa đơn đầu tiên
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default OrderInvoiceTab;