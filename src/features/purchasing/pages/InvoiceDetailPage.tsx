// ============================================================================
// INVOICE DETAIL PAGE (CẢI TIẾN v2)
// File: src/features/purchasing/pages/InvoiceDetailPage.tsx
// Huy Anh ERP - Phase P5: Payments & Debt Tracking
// ============================================================================
// CẬP NHẬT 2026-02-26:
// - Tab Thanh toán: mỗi payment row có link "Xem ảnh HĐ" dẫn đến tab Ảnh
// - Tab Ảnh HĐ: gallery cải tiến, lightbox + nút download
// - Summary cards rõ ràng hơn: tổng tiền, đã TT, còn nợ, hạn TT
// - Progress bar nổi bật với percentage
// - Tab Thông tin: grid 2 cột gọn gàng
// - Mobile-first: 44px+ touch targets, text-[15px] inputs
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  FileText,
  CreditCard,
  Image as ImageIcon,
  Info,
  Package,
  Building2,
  Calendar,
  Clock,
  CheckCircle,
  AlertTriangle,
  Loader2,
  ExternalLink,
  Download,
  X,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  Banknote,
  User,
  Camera,
  ArrowUpRight,
  Eye,
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { invoicePaymentService } from '../../../services/invoicePaymentService';
import type { InvoicePayment } from '../../../services/invoicePaymentService';
import PaymentFormModal from './components/payments/PaymentFormModal';
import { useAuthStore } from '../../../stores/authStore';

// ============================================================================
// TYPES
// ============================================================================

interface InvoiceDetail {
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
  created_by?: string;
  supplier?: { id: string; code: string; name: string } | null;
  order?: { id: string; order_code: string; project_name: string } | null;
  creator?: { id: string; full_name: string } | null;
}

interface InvoiceItem {
  id: string;
  invoice_id: string;
  material_id: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  material?: { id: string; code: string; name: string; unit: string } | null;
}

type TabKey = 'materials' | 'payments' | 'images' | 'info';

// ============================================================================
// CONSTANTS
// ============================================================================

const PAYMENT_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  unpaid: { label: 'Chưa thanh toán', color: 'text-red-700', bg: 'bg-red-100 border-red-300', icon: AlertTriangle },
  partial: { label: 'Thanh toán một phần', color: 'text-amber-700', bg: 'bg-amber-100 border-amber-300', icon: Clock },
  paid: { label: 'Đã thanh toán đủ', color: 'text-green-700', bg: 'bg-green-100 border-green-300', icon: CheckCircle },
};

const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
  { key: 'materials', label: 'Vật tư', icon: Package },
  { key: 'payments', label: 'Thanh toán', icon: CreditCard },
  { key: 'images', label: 'Ảnh HĐ gốc', icon: ImageIcon },
  { key: 'info', label: 'Thông tin', icon: Info },
];

// ============================================================================
// HELPERS
// ============================================================================

const fmt = (amount: number): string =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(amount);

const fmtDate = (dateStr: string): string => {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const fmtDateTime = (dateStr: string): string => {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
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

const InvoiceDetailPage: React.FC = () => {
  const { id: invoiceId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();

  // State
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [payments, setPayments] = useState<InvoicePayment[]>([]);
  const [activeTab, setActiveTab] = useState<TabKey>('materials');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Payment modal
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  // Image lightbox
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  // ========================================================================
  // FETCH DATA
  // ========================================================================

  const fetchInvoice = useCallback(async () => {
    if (!invoiceId) return;
    try {
      setLoading(true);
      setError(null);

      const { data: invoiceData, error: invoiceError } = await supabase
        .from('supplier_invoices')
        .select(`
          *,
          supplier:supplier_id(id, code, name),
          order:order_id(id, order_code, project_name),
          creator:created_by(id, full_name)
        `)
        .eq('id', invoiceId)
        .single();

      if (invoiceError) throw invoiceError;

      const normalizedInvoice: InvoiceDetail = {
        ...invoiceData,
        supplier: Array.isArray(invoiceData.supplier) ? invoiceData.supplier[0] : invoiceData.supplier,
        order: Array.isArray(invoiceData.order) ? invoiceData.order[0] : invoiceData.order,
        creator: Array.isArray(invoiceData.creator) ? invoiceData.creator[0] : invoiceData.creator,
      };
      setInvoice(normalizedInvoice);

      // Fetch items
      const { data: itemsData } = await supabase
        .from('supplier_invoice_items')
        .select(`*, material:material_id(id, code, name, unit)`)
        .eq('invoice_id', invoiceId)
        .order('created_at', { ascending: true });

      if (itemsData) {
        setItems(itemsData.map((item: any) => ({
          ...item,
          material: Array.isArray(item.material) ? item.material[0] : item.material,
        })));
      }

      // Fetch payments
      try {
        const paymentList = await invoicePaymentService.getByInvoiceId(invoiceId);
        setPayments(paymentList);
      } catch {
        setPayments([]);
      }
    } catch (err: any) {
      console.error('Error loading invoice:', err);
      setError(err.message || 'Không thể tải thông tin hóa đơn');
    } finally {
      setLoading(false);
    }
  }, [invoiceId]);

  useEffect(() => { fetchInvoice(); }, [fetchInvoice]);

  useEffect(() => {
    if (successMsg) {
      const t = setTimeout(() => setSuccessMsg(null), 4000);
      return () => clearTimeout(t);
    }
  }, [successMsg]);

  // ========================================================================
  // HANDLERS
  // ========================================================================

  const handlePaymentSuccess = () => {
    setShowPaymentModal(false);
    setSuccessMsg('Thanh toán đã được ghi nhận');
    fetchInvoice();
  };

  const handleDeletePayment = async (paymentId: string) => {
    if (!confirm('Bạn có chắc muốn xóa thanh toán này? Số tiền sẽ được hoàn lại.')) return;
    try {
      await invoicePaymentService.delete(paymentId);
      setSuccessMsg('Đã xóa thanh toán');
      fetchInvoice();
    } catch (err: any) {
      alert('Lỗi xóa thanh toán: ' + err.message);
    }
  };

  const openLightbox = (index: number) => { setLightboxIndex(index); setLightboxOpen(true); };
  const closeLightbox = () => setLightboxOpen(false);
  const prevImage = () => {
    const imgs = invoice?.image_urls || [];
    setLightboxIndex(prev => (prev - 1 + imgs.length) % imgs.length);
  };
  const nextImage = () => {
    const imgs = invoice?.image_urls || [];
    setLightboxIndex(prev => (prev + 1) % imgs.length);
  };

  // Switch to images tab
  const goToImagesTab = () => setActiveTab('images');

  // ========================================================================
  // RENDER: LOADING / ERROR
  // ========================================================================

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500 mr-3" />
        <span className="text-gray-500 text-lg">Đang tải hóa đơn...</span>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="max-w-2xl mx-auto text-center py-20">
        <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-gray-800 mb-2">Không tìm thấy hóa đơn</h2>
        <p className="text-gray-500 mb-6">{error || 'Hóa đơn không tồn tại hoặc đã bị xóa.'}</p>
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
        >
          <ArrowLeft className="w-4 h-4" />
          Quay lại
        </button>
      </div>
    );
  }

  // ========================================================================
  // COMPUTED
  // ========================================================================

  const statusConfig = PAYMENT_STATUS_CONFIG[invoice.payment_status] || PAYMENT_STATUS_CONFIG.unpaid;
  const StatusIcon = statusConfig.icon;
  const overdue = isOverdue(invoice.due_date, invoice.payment_status);
  const daysOver = invoice.due_date ? getDaysOverdue(invoice.due_date) : 0;
  const payPercent = invoice.total_amount > 0 ? Math.round((invoice.paid_amount / invoice.total_amount) * 100) : 0;
  const images = invoice.image_urls || [];

  // ========================================================================
  // RENDER: MAIN
  // ========================================================================

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      {/* Success message */}
      {successMsg && (
        <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-center gap-2 text-sm text-green-700">
            <CheckCircle className="w-4 h-4" />
            {successMsg}
          </div>
          <button onClick={() => setSuccessMsg(null)}><X className="w-4 h-4 text-green-400" /></button>
        </div>
      )}

      {/* ================================================================ */}
      {/* HEADER                                                           */}
      {/* ================================================================ */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2.5 hover:bg-gray-100 rounded-lg transition-colors"
            title="Quay lại"
          >
            <ArrowLeft className="w-5 h-5 text-gray-500" />
          </button>
          <div>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h1 className="text-xl font-bold text-gray-900">{invoice.invoice_number}</h1>
              <span className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full border ${statusConfig.bg} ${statusConfig.color}`}>
                <StatusIcon className="w-3.5 h-3.5" />
                {statusConfig.label}
              </span>
              {overdue && (
                <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-red-100 border border-red-300 text-red-700">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Quá hạn {daysOver} ngày
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500 flex items-center gap-2 flex-wrap">
              <Building2 className="w-4 h-4" />
              {invoice.supplier?.name || '—'}
              {invoice.order && (
                <>
                  <span className="text-gray-300">·</span>
                  <Link
                    to={`/purchasing/orders/${invoice.order.id}`}
                    className="text-blue-600 hover:text-blue-700 inline-flex items-center gap-1"
                  >
                    <ExternalLink className="w-3 h-3" />
                    {invoice.order.order_code}
                  </Link>
                </>
              )}
              {images.length > 0 && (
                <>
                  <span className="text-gray-300">·</span>
                  <button
                    onClick={goToImagesTab}
                    className="text-blue-600 hover:text-blue-700 inline-flex items-center gap-1"
                  >
                    <Camera className="w-3 h-3" />
                    {images.length} ảnh HĐ
                  </button>
                </>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {invoice.payment_status !== 'paid' && invoice.remaining_amount > 0 && (
            <button
              onClick={() => setShowPaymentModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors shadow-sm"
            >
              <CreditCard className="w-4 h-4" />
              Thanh toán
            </button>
          )}
        </div>
      </div>

      {/* ================================================================ */}
      {/* SUMMARY CARDS                                                    */}
      {/* ================================================================ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard
          label="Tổng tiền HĐ"
          value={fmt(invoice.total_amount)}
          sub={invoice.vat_amount ? `VAT: ${fmt(invoice.vat_amount)}` : undefined}
          accent="blue"
        />
        <SummaryCard
          label="Đã thanh toán"
          value={fmt(invoice.paid_amount)}
          sub={`${payPercent}% · ${payments.length} lần TT`}
          accent="green"
        />
        <SummaryCard
          label="Còn nợ"
          value={fmt(invoice.remaining_amount)}
          sub={`${100 - payPercent}%`}
          accent={invoice.remaining_amount > 0 ? 'amber' : 'gray'}
        />
        <div className={`bg-white border rounded-xl p-4 ${overdue ? 'border-red-200 bg-red-50' : 'border-gray-200'}`}>
          <span className="text-xs text-gray-500 font-medium">Hạn thanh toán</span>
          <p className={`text-lg font-bold mt-1 ${overdue ? 'text-red-600' : 'text-gray-900'}`}>
            {invoice.due_date ? fmtDate(invoice.due_date) : '—'}
          </p>
          {overdue && <p className="text-xs text-red-500 mt-0.5">Quá hạn {daysOver} ngày</p>}
        </div>
      </div>

      {/* Payment Progress Bar */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-gray-700">Tiến độ thanh toán</span>
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
          <span>Đã TT: {fmt(invoice.paid_amount)}</span>
          <span>Tổng HĐ: {fmt(invoice.total_amount)}</span>
        </div>
      </div>

      {/* ================================================================ */}
      {/* TABS                                                             */}
      {/* ================================================================ */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="border-b border-gray-200 px-4">
          <div className="flex gap-0 overflow-x-auto">
            {TABS.map(tab => {
              const TabIcon = tab.icon;
              const isActive = activeTab === tab.key;
              let count = 0;
              if (tab.key === 'materials') count = items.length;
              if (tab.key === 'payments') count = payments.length;
              if (tab.key === 'images') count = images.length;

              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors min-h-[44px] ${
                    isActive
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <TabIcon className="w-4 h-4" />
                  {tab.label}
                  {count > 0 && (
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                      isActive ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="p-5">
          {/* ============================================================ */}
          {/* TAB: VẬT TƯ                                                  */}
          {/* ============================================================ */}
          {activeTab === 'materials' && (
            <div>
              {items.length === 0 ? (
                <EmptyState icon={Package} text="Chưa có vật tư trong hóa đơn này" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-gray-500 uppercase tracking-wider border-b border-gray-100">
                        <th className="pb-3 pr-4">#</th>
                        <th className="pb-3 pr-4">Mã VT</th>
                        <th className="pb-3 pr-4">Tên vật tư</th>
                        <th className="pb-3 pr-4 text-center">ĐVT</th>
                        <th className="pb-3 pr-4 text-right">Số lượng</th>
                        <th className="pb-3 pr-4 text-right">Đơn giá</th>
                        <th className="pb-3 text-right">Thành tiền</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, index) => (
                        <tr key={item.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                          <td className="py-3 pr-4 text-gray-400">{index + 1}</td>
                          <td className="py-3 pr-4 font-mono text-xs text-gray-600">{item.material?.code || '—'}</td>
                          <td className="py-3 pr-4 font-medium text-gray-900">{item.material?.name || '—'}</td>
                          <td className="py-3 pr-4 text-center text-gray-500">{item.material?.unit || '—'}</td>
                          <td className="py-3 pr-4 text-right font-medium">{item.quantity?.toLocaleString('vi-VN')}</td>
                          <td className="py-3 pr-4 text-right text-gray-600">{fmt(item.unit_price)}</td>
                          <td className="py-3 text-right font-bold text-gray-900">{fmt(item.total_price)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-gray-200">
                        <td colSpan={6} className="py-3 text-right font-semibold text-gray-700 pr-4">Tổng cộng:</td>
                        <td className="py-3 text-right font-bold text-lg text-blue-600">
                          {fmt(items.reduce((sum, item) => sum + (item.total_price || 0), 0))}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ============================================================ */}
          {/* TAB: THANH TOÁN (CẢI TIẾN - có link ảnh HĐ)                 */}
          {/* ============================================================ */}
          {activeTab === 'payments' && (
            <div className="space-y-4">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-gray-800">Lịch sử thanh toán</h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {payments.length} lần · Tổng: {fmt(payments.reduce((s, p) => s + (p.amount || 0), 0))}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {/* Link đến ảnh HĐ */}
                  {images.length > 0 && (
                    <button
                      onClick={goToImagesTab}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      {images.length} ảnh HĐ gốc
                    </button>
                  )}
                  {invoice.payment_status !== 'paid' && invoice.remaining_amount > 0 && (
                    <button
                      onClick={() => setShowPaymentModal(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      Thêm thanh toán
                    </button>
                  )}
                </div>
              </div>

              {/* Mini progress in payments tab */}
              <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-gray-500">Tiến độ TT</span>
                  <span className="font-bold text-blue-600">{payPercent}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      payPercent >= 100 ? 'bg-green-500' : payPercent >= 50 ? 'bg-blue-500' : payPercent > 0 ? 'bg-amber-500' : 'bg-gray-300'
                    }`}
                    style={{ width: `${Math.min(payPercent, 100)}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                  <span>Đã TT: {fmt(invoice.paid_amount)}</span>
                  <span>Còn nợ: {fmt(invoice.remaining_amount)}</span>
                </div>
              </div>

              {/* Payment list */}
              {payments.length === 0 ? (
                <div className="text-center py-10">
                  <CreditCard className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 mb-3">Chưa có thanh toán nào</p>
                  {invoice.payment_status !== 'paid' && (
                    <button
                      onClick={() => setShowPaymentModal(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700"
                    >
                      <Plus className="w-4 h-4" />
                      Ghi nhận thanh toán đầu tiên
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {payments.map((payment, idx) => (
                    <div
                      key={payment.id}
                      className="flex items-start gap-4 p-4 bg-gray-50 rounded-xl border border-gray-100 hover:border-gray-200 transition-colors"
                    >
                      {/* Icon */}
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                        payment.payment_method === 'bank_transfer' ? 'bg-blue-100 text-blue-600' : 'bg-green-100 text-green-600'
                      }`}>
                        {payment.payment_method === 'bank_transfer' ? <Building2 className="w-5 h-5" /> : <Banknote className="w-5 h-5" />}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="font-semibold text-gray-900">{fmt(payment.amount)}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            payment.payment_method === 'bank_transfer' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                          }`}>
                            {payment.payment_method === 'bank_transfer' ? 'Chuyển khoản' : 'Tiền mặt'}
                          </span>
                          {payment.payment_code && (
                            <span className="text-xs font-mono text-gray-400">{payment.payment_code}</span>
                          )}
                          <span className="text-[10px] text-gray-300">#{idx + 1}</span>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {fmtDate(payment.payment_date)}
                          </span>
                          {payment.reference_number && (
                            <span className="flex items-center gap-1">
                              <FileText className="w-3 h-3" />
                              UNC: {payment.reference_number}
                            </span>
                          )}
                          {payment.bank_name && <span>NH: {payment.bank_name}</span>}
                          {payment.created_by_name && (
                            <span className="flex items-center gap-1">
                              <User className="w-3 h-3" />
                              {payment.created_by_name}
                            </span>
                          )}
                        </div>

                        {payment.notes && (
                          <p className="text-xs text-gray-400 mt-1 italic">{payment.notes}</p>
                        )}

                        {/* ★ LINK ĐẾN ẢNH HĐ GỐC — yêu cầu mới */}
                        {images.length > 0 && (
                          <button
                            onClick={goToImagesTab}
                            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 mt-1.5 font-medium"
                          >
                            <Camera className="w-3 h-3" />
                            Xem ảnh HĐ gốc ({images.length})
                            <ArrowUpRight className="w-3 h-3" />
                          </button>
                        )}
                      </div>

                      {/* Delete */}
                      {payment.created_by === user?.id && (
                        <button
                          onClick={() => handleDeletePayment(payment.id)}
                          className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center"
                          title="Xóa thanh toán"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}

                  {/* Total */}
                  <div className="flex items-center justify-between pt-3 border-t border-gray-200">
                    <span className="text-sm font-medium text-gray-600">
                      Tổng đã thanh toán ({payments.length} lần):
                    </span>
                    <span className="text-lg font-bold text-green-600">
                      {fmt(payments.reduce((sum, p) => sum + (p.amount || 0), 0))}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ============================================================ */}
          {/* TAB: ẢNH HĐ GỐC                                             */}
          {/* ============================================================ */}
          {activeTab === 'images' && (
            <div>
              {images.length === 0 ? (
                <EmptyState icon={ImageIcon} text="Chưa có ảnh hóa đơn" />
              ) : (
                <div>
                  <p className="text-sm text-gray-500 mb-4">
                    {images.length} ảnh hóa đơn gốc — Bấm vào ảnh để xem full-size
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {images.map((url, index) => (
                      <div
                        key={index}
                        className="relative group cursor-pointer rounded-xl overflow-hidden border border-gray-200 aspect-[3/4] bg-gray-50"
                        onClick={() => openLightbox(index)}
                      >
                        <img
                          src={url}
                          alt={`HĐ ${invoice.invoice_number} - Ảnh ${index + 1}`}
                          className="w-full h-full object-cover transition-transform group-hover:scale-105"
                          loading="lazy"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src =
                              'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2YwZjBmMCIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBkb21pbmFudC1iYXNlbGluZT0ibWlkZGxlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjOTk5IiBmb250LXNpemU9IjE0Ij5Lw7RuZyB04bqjaSDhuqNuaDwvdGV4dD48L3N2Zz4=';
                          }}
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                            <div className="bg-white/90 rounded-full p-2">
                              <Eye className="w-5 h-5 text-gray-700" />
                            </div>
                          </div>
                        </div>
                        <div className="absolute bottom-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded-lg">
                          {index + 1}/{images.length}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ============================================================ */}
          {/* TAB: THÔNG TIN                                               */}
          {/* ============================================================ */}
          {activeTab === 'info' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <InfoRow label="Số hóa đơn" value={invoice.invoice_number} />
                <InfoRow label="Ngày hóa đơn" value={fmtDate(invoice.invoice_date)} />
                <InfoRow
                  label="NCC"
                  value={
                    invoice.supplier ? (
                      <Link to={`/purchasing/suppliers/${invoice.supplier.id}`} className="text-blue-600 hover:text-blue-700">
                        {invoice.supplier.code} — {invoice.supplier.name}
                      </Link>
                    ) : '—'
                  }
                />
                <InfoRow label="Hạn thanh toán" value={invoice.due_date ? fmtDate(invoice.due_date) : 'Không có'} />
                <InfoRow
                  label="Đơn hàng"
                  value={
                    invoice.order ? (
                      <Link to={`/purchasing/orders/${invoice.order.id}`} className="text-blue-600 hover:text-blue-700 inline-flex items-center gap-1">
                        <ExternalLink className="w-3 h-3" />
                        {invoice.order.order_code} — {invoice.order.project_name}
                      </Link>
                    ) : '—'
                  }
                />
                <InfoRow label="Người tạo" value={invoice.creator?.full_name || '—'} />
                <InfoRow label="Ngày tạo" value={fmtDateTime(invoice.created_at)} />
                <InfoRow label="Tổng tiền" value={fmt(invoice.total_amount)} />
                {invoice.vat_amount ? <InfoRow label="VAT" value={fmt(invoice.vat_amount)} /> : null}
                <InfoRow label="Đã TT" value={<span className="text-green-600 font-semibold">{fmt(invoice.paid_amount)}</span>} />
                <InfoRow label="Còn nợ" value={<span className={invoice.remaining_amount > 0 ? 'text-amber-600 font-semibold' : 'text-gray-400'}>{fmt(invoice.remaining_amount)}</span>} />
                <InfoRow
                  label="Ảnh HĐ gốc"
                  value={
                    images.length > 0 ? (
                      <button onClick={goToImagesTab} className="text-blue-600 hover:text-blue-700 inline-flex items-center gap-1 text-sm">
                        <Camera className="w-3.5 h-3.5" />
                        {images.length} ảnh — Bấm xem
                        <ArrowUpRight className="w-3 h-3" />
                      </button>
                    ) : 'Chưa có'
                  }
                />
              </div>
              {invoice.notes && (
                <div className="pt-3 border-t border-gray-100">
                  <p className="text-xs text-gray-500 font-medium mb-1">Ghi chú:</p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{invoice.notes}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ================================================================ */}
      {/* LIGHTBOX                                                         */}
      {/* ================================================================ */}
      {lightboxOpen && images.length > 0 && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center" onClick={closeLightbox}>
          <button onClick={closeLightbox} className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white z-10">
            <X className="w-6 h-6" />
          </button>
          <div className="absolute top-4 left-4 text-white text-sm bg-black/50 px-3 py-1.5 rounded-full">
            {lightboxIndex + 1} / {images.length}
          </div>
          <a
            href={images[lightboxIndex]}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="absolute top-4 right-16 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white z-10"
            title="Tải ảnh"
          >
            <Download className="w-5 h-5" />
          </a>
          {images.length > 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); prevImage(); }}
              className="absolute left-4 top-1/2 -translate-y-1/2 p-3 bg-white/10 hover:bg-white/20 rounded-full text-white z-10"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
          )}
          <img
            src={images[lightboxIndex]}
            alt={`Ảnh ${lightboxIndex + 1}`}
            className="max-w-[90vw] max-h-[85vh] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          {images.length > 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); nextImage(); }}
              className="absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-white/10 hover:bg-white/20 rounded-full text-white z-10"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          )}
        </div>
      )}

      {/* ================================================================ */}
      {/* PAYMENT MODAL                                                    */}
      {/* ================================================================ */}
      {showPaymentModal && invoiceId && (
        <PaymentFormModal
          isOpen={showPaymentModal}
          onClose={() => setShowPaymentModal(false)}
          onSuccess={handlePaymentSuccess}
          invoiceId={invoiceId}
          invoiceNumber={invoice.invoice_number}
        />
      )}
    </div>
  );
};

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

const InfoRow: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 py-2 border-b border-gray-50">
    <span className="text-xs text-gray-500 font-medium sm:w-32 flex-shrink-0">{label}</span>
    <span className="text-sm text-gray-800">{value}</span>
  </div>
);

const SummaryCard: React.FC<{
  label: string;
  value: string;
  sub?: string;
  accent: 'blue' | 'green' | 'amber' | 'gray';
}> = ({ label, value, sub, accent }) => {
  const accentColors = {
    blue: 'text-gray-900',
    green: 'text-green-600',
    amber: 'text-amber-600',
    gray: 'text-gray-400',
  };
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <span className="text-xs text-gray-500 font-medium">{label}</span>
      <p className={`text-lg font-bold mt-1 ${accentColors[accent]}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
};

const EmptyState: React.FC<{ icon: React.ElementType; text: string }> = ({ icon: Icon, text }) => (
  <div className="text-center py-10">
    <Icon className="w-10 h-10 text-gray-300 mx-auto mb-3" />
    <p className="text-gray-500">{text}</p>
  </div>
);

export default InvoiceDetailPage;