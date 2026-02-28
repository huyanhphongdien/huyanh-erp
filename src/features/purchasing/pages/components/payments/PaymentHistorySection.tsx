// ============================================================================
// PAYMENT HISTORY SECTION
// File: src/features/purchasing/pages/components/payments/PaymentHistorySection.tsx
// Huy Anh ERP - Phase P5: Payments & Debt Tracking
// ============================================================================
// Component hiển thị lịch sử thanh toán của một hóa đơn
// Dùng trong: InvoiceDetailPage hoặc OrderDetailPage
// ============================================================================

import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  Banknote,
  Building2,
  Trash2,
  Plus,
  Clock,
  AlertCircle,
  FileText,
  ChevronDown,
  ChevronUp,
  Loader2,
} from 'lucide-react';
import { invoicePaymentService } from '../../../../../services/invoicePaymentService';
import type { InvoicePayment } from '../../../../../services/invoicePaymentService';
import PaymentFormModal from './PaymentFormModal';

// ============================================================================
// TYPES
// ============================================================================

interface PaymentHistorySectionProps {
  invoiceId: string;
  invoiceNumber?: string;
  supplierName?: string;
  totalAmount?: number;
  paidAmount?: number;
  remainingAmount?: number;
  paymentStatus?: string;
  dueDate?: string;
  canEdit?: boolean;
  onPaymentChange?: () => void;
}

// ============================================================================
// COMPONENT
// ============================================================================

const PaymentHistorySection: React.FC<PaymentHistorySectionProps> = ({
  invoiceId,
  invoiceNumber = '',
  supplierName = '',
  totalAmount = 0,
  paidAmount = 0,
  remainingAmount = 0,
  paymentStatus = 'unpaid',
  dueDate,
  canEdit = true,
  onPaymentChange,
}) => {
  const [payments, setPayments] = useState<InvoicePayment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(true);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  // ============================================================================
  // DATA LOADING
  // ============================================================================

  const loadPayments = async () => {
    try {
      setIsLoading(true);
      const data = await invoicePaymentService.getByInvoiceId(invoiceId);
      setPayments(data);
    } catch (err: any) {
      console.error('Error loading payments:', err);
      setError('Không thể tải lịch sử thanh toán');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (invoiceId) {
      loadPayments();
    }
  }, [invoiceId]);

  // ============================================================================
  // HANDLERS
  // ============================================================================

  const handlePaymentSuccess = () => {
    loadPayments();
    onPaymentChange?.();
  };

  const handleDelete = async (paymentId: string) => {
    if (!confirm('Bạn có chắc muốn xóa thanh toán này? Thao tác không thể hoàn tác.')) {
      return;
    }

    try {
      setDeletingId(paymentId);
      await invoicePaymentService.delete(paymentId);
      await loadPayments();
      onPaymentChange?.();
    } catch (err: any) {
      console.error('Error deleting payment:', err);
      setError(err.message || 'Có lỗi khi xóa thanh toán');
    } finally {
      setDeletingId(null);
    }
  };

  // ============================================================================
  // HELPERS
  // ============================================================================

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND',
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const formatDateTime = (dateStr: string) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getPaymentMethodIcon = (method: string) => {
    switch (method) {
      case 'cash': return <Banknote className="w-4 h-4 text-green-600" />;
      case 'bank_transfer': return <Building2 className="w-4 h-4 text-blue-600" />;
      default: return <CreditCard className="w-4 h-4 text-gray-600" />;
    }
  };

  const getPaymentMethodLabel = (method: string) => {
    switch (method) {
      case 'cash': return 'Tiền mặt';
      case 'bank_transfer': return 'Chuyển khoản';
      default: return method;
    }
  };

  const getStatusBadge = (status: string) => {
    const map: Record<string, { label: string; className: string }> = {
      unpaid: { label: 'Chưa TT', className: 'bg-red-100 text-red-700' },
      partial: { label: 'TT một phần', className: 'bg-yellow-100 text-yellow-700' },
      paid: { label: 'Đã TT đủ', className: 'bg-green-100 text-green-700' },
    };
    const info = map[status] || { label: status, className: 'bg-gray-100 text-gray-700' };
    return (
      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${info.className}`}>
        {info.label}
      </span>
    );
  };

  const totalPaid = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
  const isOverdue = dueDate && new Date(dueDate) < new Date() && paymentStatus !== 'paid';

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="bg-white border border-gray-200 rounded-lg">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <CreditCard className="w-5 h-5 text-blue-600" />
          <div>
            <h4 className="text-sm font-semibold text-gray-900">
              Thanh toán ({payments.length})
            </h4>
            <p className="text-xs text-gray-500">
              {formatCurrency(totalPaid)} / {formatCurrency(totalAmount)}
              {' '}
              {getStatusBadge(paymentStatus)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && remainingAmount > 0 && (
            <button
              onClick={e => {
                e.stopPropagation();
                setShowPaymentModal(true);
              }}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
            >
              <Plus className="w-3.5 h-3.5" />
              Thanh toán
            </button>
          )}
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          )}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="px-4 pb-2">
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all duration-500 ${
              paymentStatus === 'paid'
                ? 'bg-green-500'
                : isOverdue
                  ? 'bg-red-500'
                  : 'bg-blue-500'
            }`}
            style={{ width: `${totalAmount > 0 ? Math.min((totalPaid / totalAmount) * 100, 100) : 0}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-gray-400 mt-0.5">
          <span>{totalAmount > 0 ? Math.round((totalPaid / totalAmount) * 100) : 0}%</span>
          <span>Còn lại: {formatCurrency(remainingAmount)}</span>
        </div>
      </div>

      {/* Overdue Warning */}
      {isOverdue && (
        <div className="mx-4 mb-2 flex items-center gap-2 p-2 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          <span>
            Hóa đơn quá hạn {Math.floor((Date.now() - new Date(dueDate!).getTime()) / (1000 * 60 * 60 * 24))} ngày
            (hạn: {formatDate(dueDate!)})
          </span>
        </div>
      )}

      {/* Payment List */}
      {isExpanded && (
        <div className="border-t">
          {isLoading ? (
            <div className="flex items-center justify-center py-8 text-gray-500">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              Đang tải...
            </div>
          ) : error ? (
            <div className="p-4 text-center text-red-500 text-sm">{error}</div>
          ) : payments.length === 0 ? (
            <div className="p-6 text-center text-gray-500">
              <CreditCard className="w-10 h-10 mx-auto mb-2 text-gray-300" />
              <p className="text-sm">Chưa có thanh toán nào</p>
              {canEdit && remainingAmount > 0 && (
                <button
                  onClick={() => setShowPaymentModal(true)}
                  className="mt-2 text-blue-600 hover:text-blue-700 text-sm font-medium"
                >
                  + Thêm thanh toán
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y">
              {payments.map((payment, index) => (
                <div
                  key={payment.id}
                  className="px-4 py-3 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      {/* Icon */}
                      <div className={`mt-0.5 p-1.5 rounded-lg ${
                        payment.payment_method === 'cash' ? 'bg-green-100' : 'bg-blue-100'
                      }`}>
                        {getPaymentMethodIcon(payment.payment_method)}
                      </div>

                      {/* Info */}
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-gray-900">
                            {formatCurrency(payment.amount)}
                          </span>
                          <span className={`inline-flex px-1.5 py-0.5 rounded text-xs ${
                            payment.payment_method === 'cash'
                              ? 'bg-green-50 text-green-700'
                              : 'bg-blue-50 text-blue-700'
                          }`}>
                            {getPaymentMethodLabel(payment.payment_method)}
                          </span>
                        </div>

                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatDate(payment.payment_date)}
                          </span>
                          {payment.reference_number && (
                            <span className="flex items-center gap-1">
                              <FileText className="w-3 h-3" />
                              UNC: {payment.reference_number}
                            </span>
                          )}
                          {payment.bank_name && (
                            <span className="flex items-center gap-1">
                              <Building2 className="w-3 h-3" />
                              {payment.bank_name}
                            </span>
                          )}
                        </div>

                        {payment.notes && (
                          <p className="text-xs text-gray-400 mt-1 italic">{payment.notes}</p>
                        )}

                        {payment.created_by_name && (
                          <p className="text-xs text-gray-400 mt-0.5">
                            Bởi: {payment.created_by_name} • {formatDateTime(payment.created_at)}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Delete button */}
                    {canEdit && (
                      <button
                        onClick={() => handleDelete(payment.id)}
                        disabled={deletingId === payment.id}
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                        title="Xóa thanh toán"
                      >
                        {deletingId === payment.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Payment Modal */}
      <PaymentFormModal
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        onSuccess={handlePaymentSuccess}
        invoiceId={invoiceId}
        invoiceNumber={invoiceNumber}
        supplierName={supplierName}
        totalAmount={totalAmount}
        paidAmount={paidAmount}
        remainingAmount={remainingAmount}
        dueDate={dueDate}
      />
    </div>
  );
};

export default PaymentHistorySection;