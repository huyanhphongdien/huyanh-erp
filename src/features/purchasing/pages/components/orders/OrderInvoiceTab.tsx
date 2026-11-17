// ============================================================================
// ORDER INVOICE TAB - Tab "Hóa đơn & Thanh toán" trong PODetailPage
// File: src/features/purchasing/pages/components/orders/OrderInvoiceTab.tsx
// Huy Anh ERP System - Phase P5 (CẢI TIẾN v2)
// ============================================================================
// CẬP NHẬT 2026-02-26:
// - Summary cards rõ ràng: tổng HĐ, đã thanh toán, còn nợ, quá hạn
// - Progress bars cho từng hóa đơn: HĐ giao + Thanh toán
// - Mỗi invoice card hiển thị: ảnh đã upload (thumbnail), link xem chi tiết
// - Lịch sử thanh toán inline có link đến hình ảnh HĐ gốc
// - Mobile-first, 44px+ touch targets
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Receipt,
  CreditCard,
  Plus,
  Eye,
  AlertTriangle,
  CheckCircle,
  Clock,
  Building2,
  Calendar,
  FileText,
  Loader2,
  Banknote,
  TrendingUp,
  ImageIcon,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Camera,
  DollarSign,
  Wallet,
  CircleAlert,
  ArrowUpRight,
} from 'lucide-react';
import { supabase } from '../../../../../lib/supabase';
import {
  INVOICE_PAYMENT_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  isInvoiceOverdue,
  invoiceDaysOverdue,
} from '../../../../../services/invoicePaymentService';
import { fmtVnd as fmt, fmtDate } from '../../../../../utils/format';
import PageState from '../../../../../components/common/PageState';

// ============================================================================
// TYPES
// ============================================================================

interface InvoiceRecord {
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
  supplier?: { id: string; code: string; name: string } | null;
}

interface PaymentRecord {
  id: string;
  invoice_id: string;
  amount: number;
  payment_date: string;
  payment_method: 'cash' | 'bank_transfer';
  reference_number?: string;
  bank_name?: string;
  payment_code?: string;
  notes?: string;
  created_by_name?: string;
  created_at: string;
}

interface InvoiceSummary {
  totalInvoices: number;
  totalInvoiceAmount: number;
  totalPaid: number;
  totalRemaining: number;
  overdueCount: number;
  paidCount: number;
  partialCount: number;
  unpaidCount: number;
  totalImages: number;
}

interface OrderInvoiceTabProps {
  orderId: string;
  orderStatus: string;
  refreshKey?: number;
  onPayment: (invoiceId: string, invoiceNumber: string) => void;
  onAddInvoice: (supplierId?: string) => void;
}

// ============================================================================
// HELPERS
// ============================================================================

// fmt = fmtVnd · fmtDate: utils/format (bản tự viết cũ đã xoá)

// Quá hạn theo NGÀY LỊCH — dùng chung invoicePaymentService (trước đây hạn hôm nay đã "Quá hạn 1d" từ 7h sáng)
const isOverdue = (dueDate?: string, status?: string): boolean => isInvoiceOverdue(dueDate, status);

const getDaysOverdue = (dueDate: string): number => invoiceDaysOverdue(dueDate);

const pct = (paid: number, total: number): number =>
  total > 0 ? Math.round((paid / total) * 100) : 0;

// ============================================================================
// STATUS CONFIG
// ============================================================================

// Nhãn từ invoicePaymentService (MỘT nguồn — trước đây 'Chưa TT'/'TT một phần'/'Đã TT đủ'); giữ lớp Tailwind + icon.
// Màu theo luật dòng tiền: chưa trả vàng · một phần cam · đủ xanh lá (đỏ chỉ cho quá hạn)
const PAYMENT_STATUS: Record<string, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  unpaid: { label: INVOICE_PAYMENT_STATUS_LABELS.unpaid, color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200', icon: AlertTriangle },
  partial: { label: INVOICE_PAYMENT_STATUS_LABELS.partial, color: 'text-orange-700', bg: 'bg-orange-50 border-orange-200', icon: Clock },
  paid: { label: INVOICE_PAYMENT_STATUS_LABELS.paid, color: 'text-green-700', bg: 'bg-green-50 border-green-200', icon: CheckCircle },
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
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  // Lỗi tải — trước đây nuốt im rồi hiện "Chưa có hóa đơn nào" (trống GIẢ)
  const [loadError, setLoadError] = useState<unknown>(null);
  const [expandedInvoice, setExpandedInvoice] = useState<string | null>(null);

  // --------------------------------------------------------------------------
  // FETCH
  // --------------------------------------------------------------------------
  const fetchData = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    setLoadError(null);
    try {
      // Fetch invoices
      const { data: invData, error: invErr } = await supabase
        .from('supplier_invoices')
        .select(`
          *,
          supplier:supplier_id(id, code, name)
        `)
        .eq('order_id', orderId)
        .order('created_at', { ascending: false });
      if (invErr) throw invErr;

      const normalizedInvoices = (invData || []).map((inv: any) => ({
        ...inv,
        supplier: Array.isArray(inv.supplier) ? inv.supplier[0] : inv.supplier,
      }));
      setInvoices(normalizedInvoices);

      // Fetch all payments for these invoices
      if (normalizedInvoices.length > 0) {
        const invoiceIds = normalizedInvoices.map((inv: any) => inv.id);
        const { data: payData, error: payErr } = await supabase
          .from('invoice_payments')
          .select('*')
          .in('invoice_id', invoiceIds)
          .order('payment_date', { ascending: false });
        if (payErr) throw payErr;

        setPayments(payData || []);
      } else {
        setPayments([]);
      }
    } catch (err) {
      console.error('Error loading invoices:', err);
      setLoadError(err);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    fetchData();
  }, [fetchData, refreshKey]);

  // --------------------------------------------------------------------------
  // COMPUTED SUMMARY
  // --------------------------------------------------------------------------
  const summary: InvoiceSummary = React.useMemo(() => {
    const s: InvoiceSummary = {
      totalInvoices: invoices.length,
      totalInvoiceAmount: 0,
      totalPaid: 0,
      totalRemaining: 0,
      overdueCount: 0,
      paidCount: 0,
      partialCount: 0,
      unpaidCount: 0,
      totalImages: 0,
    };
    invoices.forEach((inv) => {
      s.totalInvoiceAmount += inv.total_amount || 0;
      s.totalPaid += inv.paid_amount || 0;
      s.totalRemaining += inv.remaining_amount || 0;
      s.totalImages += (inv.image_urls || []).length;
      if (inv.payment_status === 'paid') s.paidCount++;
      else if (inv.payment_status === 'partial') s.partialCount++;
      else s.unpaidCount++;
      if (isOverdue(inv.due_date, inv.payment_status)) s.overdueCount++;
    });
    return s;
  }, [invoices]);

  const payPercent = pct(summary.totalPaid, summary.totalInvoiceAmount);

  // --------------------------------------------------------------------------
  // HELPERS
  // --------------------------------------------------------------------------
  const getInvoicePayments = (invoiceId: string) =>
    payments.filter((p) => p.invoice_id === invoiceId);

  const toggleExpand = (id: string) => {
    setExpandedInvoice((prev) => (prev === id ? null : id));
  };

  const canAddInvoice = orderStatus === 'confirmed' || orderStatus === 'partial';

  // --------------------------------------------------------------------------
  // RENDER: LOADING
  // --------------------------------------------------------------------------
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-blue-500 mr-2" />
        <span className="text-gray-500">Đang tải hóa đơn...</span>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // RENDER: LỖI TẢI (xét TRƯỚC trống)
  // --------------------------------------------------------------------------
  if (loadError) {
    return <PageState error={loadError} onRetry={fetchData} />;
  }

  // --------------------------------------------------------------------------
  // RENDER: EMPTY
  // --------------------------------------------------------------------------
  if (invoices.length === 0) {
    return (
      <div className="text-center py-12">
        <Receipt className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500 mb-1">Chưa có hóa đơn nào</p>
        <p className="text-xs text-gray-400 mb-4">
          {canAddInvoice
            ? 'Thêm hóa đơn NCC để theo dõi thanh toán'
            : 'Đơn hàng cần được xác nhận trước khi thêm hóa đơn'}
        </p>
        {canAddInvoice && (
          <button
            onClick={() => onAddInvoice()}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Thêm hóa đơn
          </button>
        )}
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // RENDER: MAIN
  // --------------------------------------------------------------------------
  return (
    <div className="space-y-5">
      {/* ================================================================== */}
      {/* SUMMARY CARDS                                                       */}
      {/* ================================================================== */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Tổng HĐ */}
        <div className="bg-white border border-gray-200 rounded-xl p-3.5">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center">
              <Receipt className="w-4 h-4 text-blue-600" />
            </div>
            <span className="text-xs text-gray-500 font-medium">Hóa đơn</span>
          </div>
          <p className="text-lg font-bold text-gray-900">{summary.totalInvoices} <span className="text-sm font-normal text-gray-400">HĐ</span></p>
          <div className="flex items-center gap-1.5 mt-1">
            {summary.totalImages > 0 && (
              <span className="inline-flex items-center gap-0.5 text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                <Camera className="w-2.5 h-2.5" />
                {summary.totalImages} ảnh
              </span>
            )}
          </div>
        </div>

        {/* Tổng tiền hóa đơn */}
        <div className="bg-white border border-gray-200 rounded-xl p-3.5">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-7 h-7 rounded-lg bg-indigo-50 flex items-center justify-center">
              <DollarSign className="w-4 h-4 text-indigo-600" />
            </div>
            <span className="text-xs text-gray-500 font-medium">Tổng tiền hóa đơn</span>
          </div>
          <p className="text-lg font-bold text-gray-900">{fmt(summary.totalInvoiceAmount)}</p>
        </div>

        {/* Đã thanh toán */}
        <div className="bg-white border border-gray-200 rounded-xl p-3.5">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-7 h-7 rounded-lg bg-green-50 flex items-center justify-center">
              <Wallet className="w-4 h-4 text-green-600" />
            </div>
            <span className="text-xs text-gray-500 font-medium">Đã thanh toán</span>
          </div>
          <p className="text-lg font-bold text-green-600">{fmt(summary.totalPaid)}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">{payPercent}% tổng hóa đơn</p>
        </div>

        {/* Còn nợ */}
        <div className={`bg-white border rounded-xl p-3.5 ${summary.overdueCount > 0 ? 'border-red-200 bg-red-50/30' : 'border-gray-200'}`}>
          <div className="flex items-center gap-2 mb-1">
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${summary.overdueCount > 0 ? 'bg-red-100' : 'bg-amber-50'}`}>
              {summary.overdueCount > 0 ? (
                <CircleAlert className="w-4 h-4 text-red-600" />
              ) : (
                <TrendingUp className="w-4 h-4 text-amber-600" />
              )}
            </div>
            <span className="text-xs text-gray-500 font-medium">Còn nợ</span>
          </div>
          <p className={`text-lg font-bold ${summary.totalRemaining > 0 ? (summary.overdueCount > 0 ? 'text-red-600' : 'text-amber-600') : 'text-gray-400'}`}>
            {fmt(summary.totalRemaining)}
          </p>
          {summary.overdueCount > 0 && (
            <p className="text-[10px] text-red-500 mt-0.5 font-medium">
              ⚠ {summary.overdueCount} hóa đơn quá hạn
            </p>
          )}
        </div>
      </div>

      {/* ================================================================== */}
      {/* OVERALL PROGRESS BAR                                                */}
      {/* ================================================================== */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-gray-700">Tiến độ thanh toán tổng</span>
          <span className="text-sm font-bold text-blue-600">{payPercent}%</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${
              payPercent >= 100 ? 'bg-green-500' :
              payPercent >= 50 ? 'bg-blue-500' :
              payPercent > 0 ? 'bg-amber-500' : 'bg-gray-300'
            }`}
            style={{ width: `${Math.min(payPercent, 100)}%` }}
          />
        </div>
        <div className="flex justify-between mt-1.5 text-[10px] text-gray-400">
          <span>Đã trả: {fmt(summary.totalPaid)}</span>
          <span>Còn lại: {fmt(summary.totalRemaining)}</span>
        </div>
        {/* Status breakdown — nhãn từ map chung của service */}
        <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-100">
          <StatusChip count={summary.paidCount} label={INVOICE_PAYMENT_STATUS_LABELS.paid.toLowerCase()} color="green" />
          <StatusChip count={summary.partialCount} label={INVOICE_PAYMENT_STATUS_LABELS.partial.toLowerCase()} color="orange" />
          <StatusChip count={summary.unpaidCount} label={INVOICE_PAYMENT_STATUS_LABELS.unpaid.toLowerCase()} color="amber" />
        </div>
      </div>

      {/* ================================================================== */}
      {/* HEADER + ADD BUTTON                                                 */}
      {/* ================================================================== */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">
          Danh sách hóa đơn ({invoices.length})
        </h3>
        {canAddInvoice && (
          <button
            onClick={() => onAddInvoice()}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Thêm hóa đơn
          </button>
        )}
      </div>

      {/* ================================================================== */}
      {/* INVOICE CARDS                                                       */}
      {/* ================================================================== */}
      <div className="space-y-3">
        {invoices.map((inv) => {
          const invPayPercent = pct(inv.paid_amount, inv.total_amount);
          const config = PAYMENT_STATUS[inv.payment_status] || PAYMENT_STATUS.unpaid;
          const StatusIcon = config.icon;
          const overdue = isOverdue(inv.due_date, inv.payment_status);
          const daysOver = inv.due_date ? getDaysOverdue(inv.due_date) : 0;
          const invPayments = getInvoicePayments(inv.id);
          const isExpanded = expandedInvoice === inv.id;
          const images = inv.image_urls || [];

          return (
            <div
              key={inv.id}
              className={`bg-white border rounded-xl overflow-hidden transition-all ${
                overdue ? 'border-red-200' : 'border-gray-200'
              }`}
            >
              {/* Card Header */}
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  {/* Left: Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900 text-sm">
                        {inv.invoice_number}
                      </span>
                      <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border ${config.bg} ${config.color}`}>
                        <StatusIcon className="w-3 h-3" />
                        {config.label}
                      </span>
                      {overdue && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-medium px-2 py-0.5 rounded-full bg-red-100 border border-red-300 text-red-700">
                          Quá hạn {daysOver} ngày
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                      <Building2 className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate">{inv.supplier?.name || '—'}</span>
                      <span className="text-gray-300">·</span>
                      <Calendar className="w-3 h-3 flex-shrink-0" />
                      <span>{fmtDate(inv.invoice_date)}</span>
                    </div>

                    {/* Image thumbnails - hiển thị ảnh HĐ đã upload */}
                    {images.length > 0 && (
                      <div className="flex items-center gap-1.5 mt-2">
                        <Camera className="w-3 h-3 text-gray-400 flex-shrink-0" />
                        <div className="flex gap-1">
                          {images.slice(0, 3).map((url, idx) => (
                            <div
                              key={idx}
                              className="w-8 h-8 rounded border border-gray-200 overflow-hidden cursor-pointer hover:border-blue-400 transition-colors"
                              onClick={() => navigate(`/purchasing/invoices/${inv.id}`)}
                              title={`Ảnh HĐ ${idx + 1} — Bấm để xem chi tiết`}
                            >
                              <img
                                src={url}
                                alt=""
                                className="w-full h-full object-cover"
                                loading="lazy"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none';
                                }}
                              />
                            </div>
                          ))}
                          {images.length > 3 && (
                            <div
                              className="w-8 h-8 rounded border border-gray-200 bg-gray-100 flex items-center justify-center cursor-pointer hover:border-blue-400"
                              onClick={() => navigate(`/purchasing/invoices/${inv.id}`)}
                            >
                              <span className="text-[9px] text-gray-500 font-medium">+{images.length - 3}</span>
                            </div>
                          )}
                        </div>
                        <span className="text-[10px] text-gray-400">{images.length} ảnh hóa đơn gốc</span>
                      </div>
                    )}
                  </div>

                  {/* Right: Amount + actions */}
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-gray-900">{fmt(inv.total_amount)}</p>
                    <p className="text-[10px] text-green-600 mt-0.5">Đã trả: {fmt(inv.paid_amount)}</p>
                    {inv.remaining_amount > 0 && (
                      <p className="text-[10px] text-amber-600">Nợ: {fmt(inv.remaining_amount)}</p>
                    )}
                  </div>
                </div>

                {/* Progress bar cho từng HĐ */}
                <div className="mt-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-gray-400">Thanh toán</span>
                    <span className="text-[10px] font-medium text-gray-600">{invPayPercent}%</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        invPayPercent >= 100 ? 'bg-green-500' :
                        invPayPercent >= 50 ? 'bg-blue-500' :
                        invPayPercent > 0 ? 'bg-amber-500' : 'bg-gray-300'
                      }`}
                      style={{ width: `${Math.min(invPayPercent, 100)}%` }}
                    />
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-2 mt-3">
                  <button
                    onClick={() => navigate(`/purchasing/invoices/${inv.id}`)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
                    title="Xem chi tiết hóa đơn (ảnh gốc, vật tư, thanh toán)"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    Chi tiết
                  </button>

                  {inv.payment_status !== 'paid' && inv.remaining_amount > 0 && (
                    <button
                      onClick={() => onPayment(inv.id, inv.invoice_number)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors"
                    >
                      <CreditCard className="w-3.5 h-3.5" />
                      Thanh toán
                    </button>
                  )}

                  {/* Expand payment history */}
                  {invPayments.length > 0 && (
                    <button
                      onClick={() => toggleExpand(inv.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs text-gray-500 hover:bg-gray-100 rounded-lg transition-colors ml-auto"
                    >
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      {invPayments.length} lần thanh toán
                    </button>
                  )}
                </div>
              </div>

              {/* Expanded: Payment History */}
              {isExpanded && invPayments.length > 0 && (
                <div className="bg-gray-50 border-t border-gray-100 p-4 space-y-2.5">
                  <p className="text-xs font-semibold text-gray-600 mb-2">Lịch sử thanh toán</p>
                  {invPayments.map((pay) => (
                    <div
                      key={pay.id}
                      className="flex items-center gap-3 p-2.5 bg-white rounded-lg border border-gray-100"
                    >
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                        pay.payment_method === 'bank_transfer' ? 'bg-blue-100 text-blue-600' : 'bg-green-100 text-green-600'
                      }`}>
                        {pay.payment_method === 'bank_transfer' ? (
                          <Building2 className="w-4 h-4" />
                        ) : (
                          <Banknote className="w-4 h-4" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-gray-900">{fmt(pay.amount)}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                            pay.payment_method === 'bank_transfer' ? 'bg-blue-50 text-blue-700' : 'bg-green-50 text-green-700'
                          }`}>
                            {PAYMENT_METHOD_LABELS[pay.payment_method] || pay.payment_method}
                          </span>
                          {pay.payment_code && (
                            <span className="text-[10px] font-mono text-gray-400">{pay.payment_code}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-gray-400 mt-0.5">
                          <span>{fmtDate(pay.payment_date)}</span>
                          {pay.reference_number && <span>UNC: {pay.reference_number}</span>}
                          {pay.created_by_name && <span>• {pay.created_by_name}</span>}
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Link xem ảnh HĐ gốc */}
                  {images.length > 0 && (
                    <div className="pt-2 border-t border-gray-100">
                      <button
                        onClick={() => navigate(`/purchasing/invoices/${inv.id}`)}
                        className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium"
                      >
                        <ImageIcon className="w-3.5 h-3.5" />
                        Xem {images.length} ảnh hóa đơn gốc
                        <ArrowUpRight className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ============================================================================
// STATUS CHIP HELPER
// ============================================================================

const StatusChip: React.FC<{ count: number; label: string; color: 'green' | 'amber' | 'orange' | 'red' }> = ({
  count,
  label,
  color,
}) => {
  if (count === 0) return null;
  const colors = {
    green: 'bg-green-50 text-green-700',
    amber: 'bg-amber-50 text-amber-700',
    orange: 'bg-orange-50 text-orange-700',
    red: 'bg-red-50 text-red-700',
  };
  const dots = { green: 'bg-green-500', amber: 'bg-amber-500', orange: 'bg-orange-500', red: 'bg-red-500' };
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full ${colors[color]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dots[color]}`} />
      {count} {label}
    </span>
  );
};

export default OrderInvoiceTab;