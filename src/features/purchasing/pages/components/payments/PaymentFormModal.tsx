// ============================================================================
// PAYMENT FORM MODAL
// File: src/features/purchasing/pages/components/payments/PaymentFormModal.tsx
// Huy Anh ERP - Phase P5: Payments & Debt Tracking
// ============================================================================
// Modal cho phép thêm thanh toán vào hóa đơn NCC
// Features:
// - Chọn phương thức: Tiền mặt / Chuyển khoản
// - Nhập số tiền (với validate không vượt remaining)
// - Nhập số UNC/chứng từ
// - Ghi chú
// ============================================================================

import React, { useState, useEffect } from 'react';
import {
  X,
  CreditCard,
  Banknote,
  Building2,
  FileText,
  Calendar,
  AlertCircle,
  CheckCircle,
  Loader2,
} from 'lucide-react';
import { invoicePaymentService, PAYMENT_METHODS } from '../../../../../services/invoicePaymentService';
import type { CreatePaymentInput } from '../../../../../services/invoicePaymentService';
import { useAuthStore } from '../../../../../stores/authStore';

// ============================================================================
// TYPES
// ============================================================================

interface PaymentFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  invoiceId: string;
  invoiceNumber?: string;
  supplierName?: string;
  totalAmount?: number;
  paidAmount?: number;
  remainingAmount?: number;
  dueDate?: string;
}

// ============================================================================
// COMPONENT
// ============================================================================

const PaymentFormModal: React.FC<PaymentFormModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  invoiceId,
  invoiceNumber = '',
  supplierName = '',
  totalAmount = 0,
  paidAmount = 0,
  remainingAmount = 0,
  dueDate,
}) => {
  const { user } = useAuthStore();

  // Form state
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [amount, setAmount] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'bank_transfer'>('bank_transfer');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [bankName, setBankName] = useState('');
  const [notes, setNotes] = useState('');

  // UI state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [payFullAmount, setPayFullAmount] = useState(false);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setPaymentDate(new Date().toISOString().split('T')[0]);
      setAmount('');
      setPaymentMethod('bank_transfer');
      setReferenceNumber('');
      setBankName('');
      setNotes('');
      setError('');
      setPayFullAmount(false);
    }
  }, [isOpen]);

  // Toggle pay full amount
  useEffect(() => {
    if (payFullAmount) {
      setAmount(remainingAmount.toString());
    }
  }, [payFullAmount, remainingAmount]);

  // ============================================================================
  // HANDLERS
  // ============================================================================

  const handleAmountChange = (value: string) => {
    // Chỉ cho phép số và dấu chấm
    const cleaned = value.replace(/[^0-9.]/g, '');
    setAmount(cleaned);
    setPayFullAmount(false);

    // Validate
    const numValue = parseFloat(cleaned);
    if (!isNaN(numValue) && numValue > remainingAmount) {
      setError(`Số tiền không được vượt quá ${formatCurrency(remainingAmount)}`);
    } else {
      setError('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validate
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setError('Vui lòng nhập số tiền hợp lệ');
      return;
    }

    if (numAmount > remainingAmount * 1.001) {
      setError(`Số tiền không được vượt quá ${formatCurrency(remainingAmount)}`);
      return;
    }

    if (!paymentDate) {
      setError('Vui lòng chọn ngày thanh toán');
      return;
    }

    if (paymentMethod === 'bank_transfer' && !referenceNumber.trim()) {
      setError('Vui lòng nhập số UNC/chứng từ cho thanh toán chuyển khoản');
      return;
    }

    setIsSubmitting(true);

    try {
      const input: CreatePaymentInput = {
        invoice_id: invoiceId,
        payment_date: paymentDate,
        amount: numAmount,
        payment_method: paymentMethod,
        reference_number: referenceNumber.trim() || undefined,
        bank_name: bankName.trim() || undefined,
        notes: notes.trim() || undefined,
        created_by: user?.employee_id || undefined,
      };

      await invoicePaymentService.create(input);
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Payment error:', err);
      setError(err.message || 'Có lỗi xảy ra khi tạo thanh toán');
    } finally {
      setIsSubmitting(false);
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

  const isOverdue = dueDate && new Date(dueDate) < new Date();

  const numAmount = parseFloat(amount) || 0;
  const isValid = numAmount > 0 && numAmount <= remainingAmount * 1.001 && paymentDate;

  // ============================================================================
  // RENDER
  // ============================================================================

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black bg-opacity-50 transition-opacity" onClick={onClose} />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative w-full max-w-lg bg-white rounded-xl shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">💰 Thanh toán hóa đơn</h3>
              <p className="text-sm text-gray-500 mt-1">
                {invoiceNumber} - {supplierName}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Invoice Summary */}
          <div className="px-5 py-3 bg-gray-50 border-b">
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-gray-500">Tổng HĐ:</span>
                <p className="font-semibold text-gray-900">{formatCurrency(totalAmount)}</p>
              </div>
              <div>
                <span className="text-gray-500">Đã thanh toán:</span>
                <p className="font-semibold text-blue-600">{formatCurrency(paidAmount)}</p>
              </div>
              <div>
                <span className="text-gray-500">Còn lại:</span>
                <p className={`font-semibold ${isOverdue ? 'text-red-600' : 'text-orange-600'}`}>
                  {formatCurrency(remainingAmount)}
                </p>
              </div>
            </div>
            {isOverdue && dueDate && (
              <div className="flex items-center gap-1.5 mt-2 text-red-600 text-xs">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>Hóa đơn quá hạn {Math.floor((Date.now() - new Date(dueDate).getTime()) / (1000 * 60 * 60 * 24))} ngày</span>
              </div>
            )}
            {/* Progress bar */}
            <div className="mt-2">
              <div className="w-full bg-gray-200 rounded-full h-1.5">
                <div
                  className={`h-1.5 rounded-full transition-all ${
                    paidAmount >= totalAmount ? 'bg-green-500' : 'bg-blue-500'
                  }`}
                  style={{ width: `${Math.min((paidAmount / totalAmount) * 100, 100)}%` }}
                />
              </div>
              <p className="text-xs text-gray-400 mt-0.5 text-right">
                {totalAmount > 0 ? Math.round((paidAmount / totalAmount) * 100) : 0}% đã thanh toán
              </p>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            {/* Payment Method */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Phương thức thanh toán <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-2 gap-3">
                {PAYMENT_METHODS.map(method => (
                  <button
                    key={method.value}
                    type="button"
                    onClick={() => setPaymentMethod(method.value as 'cash' | 'bank_transfer')}
                    className={`flex items-center gap-2 p-3 rounded-lg border-2 transition-all ${
                      paymentMethod === method.value
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-200 hover:border-gray-300 text-gray-600'
                    }`}
                  >
                    {method.value === 'cash' ? (
                      <Banknote className="w-5 h-5" />
                    ) : (
                      <Building2 className="w-5 h-5" />
                    )}
                    <span className="text-sm font-medium">{method.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Payment Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <Calendar className="w-4 h-4 inline mr-1" />
                Ngày thanh toán <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={paymentDate}
                onChange={e => setPaymentDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                required
              />
            </div>

            {/* Amount */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <CreditCard className="w-4 h-4 inline mr-1" />
                Số tiền thanh toán (VNĐ) <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={amount}
                  onChange={e => handleAmountChange(e.target.value)}
                  placeholder="Nhập số tiền..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm pr-24"
                  required
                />
                <button
                  type="button"
                  onClick={() => setPayFullAmount(!payFullAmount)}
                  className={`absolute right-1 top-1 px-2.5 py-1 text-xs rounded-md transition-colors ${
                    payFullAmount
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  Thanh toán hết
                </button>
              </div>
              {numAmount > 0 && (
                <p className="text-xs text-gray-500 mt-1">
                  = {formatCurrency(numAmount)}
                  {numAmount < remainingAmount && (
                    <span className="text-orange-500 ml-2">
                      (còn lại: {formatCurrency(remainingAmount - numAmount)})
                    </span>
                  )}
                  {numAmount >= remainingAmount && (
                    <span className="text-green-500 ml-2 inline-flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" /> Thanh toán đủ
                    </span>
                  )}
                </p>
              )}
            </div>

            {/* Reference Number (for bank transfer) */}
            {paymentMethod === 'bank_transfer' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <FileText className="w-4 h-4 inline mr-1" />
                    Số UNC / Chứng từ <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={referenceNumber}
                    onChange={e => setReferenceNumber(e.target.value)}
                    placeholder="Nhập số UNC hoặc số chứng từ..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <Building2 className="w-4 h-4 inline mr-1" />
                    Ngân hàng
                  </label>
                  <input
                    type="text"
                    value={bankName}
                    onChange={e => setBankName(e.target.value)}
                    placeholder="Vd: Vietcombank, MB Bank..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  />
                </div>
              </>
            )}

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Ghi chú
              </label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Ghi chú thêm về thanh toán..."
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm resize-none"
              />
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                disabled={isSubmitting}
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !isValid}
                className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Đang xử lý...
                  </>
                ) : (
                  <>
                    <CreditCard className="w-4 h-4" />
                    Xác nhận thanh toán
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default PaymentFormModal;