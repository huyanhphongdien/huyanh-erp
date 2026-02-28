// ============================================================================
// PAYMENT FORM MODAL (CẢI TIẾN v2 - THÊM UPLOAD ẢNH CHỨNG TỪ)
// File: src/features/purchasing/pages/components/payments/PaymentFormModal.tsx
// Huy Anh ERP System - Phase P5
// ============================================================================
// CẬP NHẬT 2026-02-26:
// - Thêm upload ảnh chuyển khoản / ủy nhiệm chi (document_urls)
// - Preview thumbnail + xóa từng ảnh
// - Tối đa 5 ảnh, mỗi ảnh ≤ 10MB
// - Lưu URLs vào field document_urls trên invoice_payments
// - Mobile-first: 44px+ touch targets, text-[15px] inputs
// ============================================================================

import React, { useState, useEffect } from 'react';
import {
  X,
  Loader2,
  CreditCard,
  Banknote,
  Building2,
  Calendar,
  FileText,
  AlertCircle,
  CheckCircle,
  Upload,
  Camera,
  Trash2,
  ImageIcon,
} from 'lucide-react';
import { supabase } from '../../../../../lib/supabase';
import { invoicePaymentService } from '../../../../../services/invoicePaymentService';
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
  // Optional — nếu truyền vào thì dùng, không thì tự fetch
  supplierName?: string;
  totalAmount?: number;
  paidAmount?: number;
  remainingAmount?: number;
  dueDate?: string;
}

interface InvoiceInfo {
  invoice_number: string;
  supplier_name: string;
  total_amount: number;
  paid_amount: number;
  remaining_amount: number;
  due_date?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const PAYMENT_BUCKET = 'payment-documents';
const MAX_FILES = 5;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// ============================================================================
// COMPONENT
// ============================================================================

const PaymentFormModal: React.FC<PaymentFormModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  invoiceId,
  invoiceNumber = '',
  supplierName,
  totalAmount,
  paidAmount,
  remainingAmount,
  dueDate,
}) => {
  const { user } = useAuthStore();

  // Invoice info (fetched or from props)
  const [invoiceInfo, setInvoiceInfo] = useState<InvoiceInfo | null>(null);
  const [fetchingInfo, setFetchingInfo] = useState(false);

  // Form state
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'bank_transfer'>('bank_transfer');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [amount, setAmount] = useState<string>('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [bankName, setBankName] = useState('');
  const [notes, setNotes] = useState('');

  // ★ Image upload state
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0); // 0-100

  // UI state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  // ========================================================================
  // FETCH INVOICE INFO (nếu không truyền props)
  // ========================================================================
  useEffect(() => {
    if (!isOpen) return;

    // Nếu đã truyền props đủ info
    if (totalAmount !== undefined && remainingAmount !== undefined) {
      setInvoiceInfo({
        invoice_number: invoiceNumber,
        supplier_name: supplierName || '',
        total_amount: totalAmount,
        paid_amount: paidAmount || 0,
        remaining_amount: remainingAmount,
        due_date: dueDate,
      });
      return;
    }

    // Fetch từ DB
    const fetchInfo = async () => {
      setFetchingInfo(true);
      try {
        const { data } = await supabase
          .from('supplier_invoices')
          .select(`
            invoice_number, total_amount, paid_amount, remaining_amount, due_date,
            supplier:supplier_id(name)
          `)
          .eq('id', invoiceId)
          .single();

        if (data) {
          const sup = Array.isArray(data.supplier) ? data.supplier[0] : data.supplier;
          setInvoiceInfo({
            invoice_number: data.invoice_number || invoiceNumber,
            supplier_name: sup?.name || '',
            total_amount: data.total_amount || 0,
            paid_amount: data.paid_amount || 0,
            remaining_amount: data.remaining_amount || 0,
            due_date: data.due_date,
          });
        }
      } catch (err) {
        console.error('Error fetching invoice info:', err);
      } finally {
        setFetchingInfo(false);
      }
    };
    fetchInfo();
  }, [isOpen, invoiceId, invoiceNumber, supplierName, totalAmount, paidAmount, remainingAmount, dueDate]);

  // ========================================================================
  // RESET on open
  // ========================================================================
  useEffect(() => {
    if (isOpen) {
      setPaymentMethod('bank_transfer');
      setPaymentDate(new Date().toISOString().split('T')[0]);
      setAmount('');
      setReferenceNumber('');
      setBankName('');
      setNotes('');
      setFiles([]);
      setPreviews([]);
      setUploadProgress(0);
      setError('');
    }
  }, [isOpen]);

  // ========================================================================
  // FILE HANDLING
  // ========================================================================
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    const remaining = MAX_FILES - files.length;

    let fileError = '';
    const validFiles = selected.filter((f) => {
      if (f.size > MAX_FILE_SIZE) {
        fileError = `File "${f.name}" vượt quá 10MB`;
        return false;
      }
      if (!f.type.startsWith('image/') && f.type !== 'application/pdf') {
        fileError = `File "${f.name}" không phải ảnh hoặc PDF`;
        return false;
      }
      return true;
    }).slice(0, remaining);

    if (fileError) setError(fileError);
    else setError('');

    setFiles((prev) => [...prev, ...validFiles]);

    // Generate previews
    validFiles.forEach((file) => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          setPreviews((prev) => [...prev, ev.target?.result as string]);
        };
        reader.readAsDataURL(file);
      } else {
        setPreviews((prev) => [...prev, '']); // PDF placeholder
      }
    });

    e.target.value = '';
  };

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
    setPreviews((prev) => prev.filter((_, i) => i !== idx));
  };

  // ========================================================================
  // UPLOAD FILES to Supabase Storage
  // ========================================================================
  const uploadFiles = async (): Promise<string[]> => {
    if (files.length === 0) return [];

    const urls: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `${invoiceId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from(PAYMENT_BUCKET)
        .upload(path, file, { cacheControl: '3600' });

      if (uploadError) {
        // Fallback: try invoice-images bucket
        const { error: fallbackError } = await supabase.storage
          .from('invoice-images')
          .upload(path, file, { cacheControl: '3600' });

        if (fallbackError) throw fallbackError;

        const { data: urlData } = supabase.storage
          .from('invoice-images')
          .getPublicUrl(path);
        urls.push(urlData.publicUrl);
      } else {
        const { data: urlData } = supabase.storage
          .from(PAYMENT_BUCKET)
          .getPublicUrl(path);
        urls.push(urlData.publicUrl);
      }

      setUploadProgress(Math.round(((i + 1) / files.length) * 100));
    }
    return urls;
  };

  // ========================================================================
  // SUBMIT
  // ========================================================================
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const info = invoiceInfo;
    if (!info) {
      setError('Chưa tải được thông tin hóa đơn');
      return;
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setError('Vui lòng nhập số tiền hợp lệ');
      return;
    }
    if (numAmount > info.remaining_amount * 1.001) {
      setError(`Số tiền không được vượt quá ${fmt(info.remaining_amount)}`);
      return;
    }
    if (!paymentDate) {
      setError('Vui lòng chọn ngày thanh toán');
      return;
    }
    if (paymentMethod === 'bank_transfer' && !referenceNumber.trim()) {
      setError('Vui lòng nhập số UNC / chứng từ cho chuyển khoản');
      return;
    }

    setIsSubmitting(true);
    setUploadProgress(0);

    try {
      // 1. Upload files
      let documentUrls: string[] = [];
      if (files.length > 0) {
        documentUrls = await uploadFiles();
      }

      // 2. Create payment
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

      // Thêm document_urls vào input nếu có
      const paymentData: any = { ...input };
      if (documentUrls.length > 0) {
        paymentData.document_urls = documentUrls;
      }

      await invoicePaymentService.create(paymentData);
      onSuccess();
    } catch (err: any) {
      console.error('Payment error:', err);
      setError(err.message || 'Có lỗi xảy ra khi tạo thanh toán');
    } finally {
      setIsSubmitting(false);
      setUploadProgress(0);
    }
  };

  // ========================================================================
  // HELPERS
  // ========================================================================
  const fmt = (v: number) =>
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(v);

  const handleAmountChange = (value: string) => {
    const cleaned = value.replace(/[^0-9.]/g, '');
    setAmount(cleaned);
    const num = parseFloat(cleaned);
    if (!isNaN(num) && invoiceInfo && num > invoiceInfo.remaining_amount) {
      setError(`Số tiền không được vượt quá ${fmt(invoiceInfo.remaining_amount)}`);
    } else {
      setError('');
    }
  };

  const payFull = () => {
    if (invoiceInfo) setAmount(invoiceInfo.remaining_amount.toString());
  };

  const info = invoiceInfo;
  const payPercent = info && info.total_amount > 0
    ? Math.round((info.paid_amount / info.total_amount) * 100)
    : 0;

  // ========================================================================
  // RENDER
  // ========================================================================
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-gray-100">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 bg-green-100 rounded-xl flex items-center justify-center">
                <CreditCard className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <h2 className="text-base font-bold text-gray-900">Thanh toán hóa đơn</h2>
                <p className="text-xs text-gray-500">
                  {info?.invoice_number || invoiceNumber} {info?.supplier_name ? `— ${info.supplier_name}` : ''}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
            >
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>

          {/* Loading info */}
          {fetchingInfo && (
            <div className="flex items-center justify-center p-6">
              <Loader2 className="w-5 h-5 animate-spin text-blue-500 mr-2" />
              <span className="text-sm text-gray-500">Đang tải thông tin...</span>
            </div>
          )}

          {!fetchingInfo && info && (
            <form onSubmit={handleSubmit}>
              {/* Invoice Summary */}
              <div className="px-5 pt-4 pb-3">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wider">Tổng HĐ</p>
                    <p className="text-sm font-bold text-gray-900 mt-0.5">{fmt(info.total_amount)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wider">Đã thanh toán</p>
                    <p className="text-sm font-bold text-green-600 mt-0.5">{fmt(info.paid_amount)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wider">Còn lại</p>
                    <p className="text-sm font-bold text-amber-600 mt-0.5">{fmt(info.remaining_amount)}</p>
                  </div>
                </div>
                {/* Progress */}
                <div className="mt-2">
                  <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        payPercent >= 100 ? 'bg-green-500' : payPercent > 0 ? 'bg-blue-500' : 'bg-gray-300'
                      }`}
                      style={{ width: `${Math.min(payPercent, 100)}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-gray-400 text-center mt-1">{payPercent}% đã thanh toán</p>
                </div>
              </div>

              <div className="px-5 pb-5 space-y-4">
                {/* Error */}
                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {error}
                  </div>
                )}

                {/* Payment Method */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Phương thức thanh toán <span className="text-red-500">*</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('cash')}
                      className={`flex items-center justify-center gap-2 py-3 rounded-xl border-2 text-sm font-medium transition-all min-h-[48px] ${
                        paymentMethod === 'cash'
                          ? 'border-green-500 bg-green-50 text-green-700'
                          : 'border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}
                    >
                      <Banknote className="w-4 h-4" />
                      Tiền mặt
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('bank_transfer')}
                      className={`flex items-center justify-center gap-2 py-3 rounded-xl border-2 text-sm font-medium transition-all min-h-[48px] ${
                        paymentMethod === 'bank_transfer'
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}
                    >
                      <Building2 className="w-4 h-4" />
                      Chuyển khoản
                    </button>
                  </div>
                </div>

                {/* Payment Date */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    <Calendar className="w-3.5 h-3.5 inline mr-1" />
                    Ngày thanh toán <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    className="w-full min-h-[48px] px-3.5 py-3 bg-white text-[15px] text-gray-900 rounded-xl border border-gray-200 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200"
                    required
                  />
                </div>

                {/* Amount */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    <CreditCard className="w-3.5 h-3.5 inline mr-1" />
                    Số tiền thanh toán (VNĐ) <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={amount}
                      onChange={(e) => handleAmountChange(e.target.value)}
                      placeholder="Nhập số tiền..."
                      className="w-full min-h-[48px] px-3.5 py-3 pr-28 bg-white text-[15px] text-gray-900 rounded-xl border border-gray-200 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200"
                      required
                    />
                    <button
                      type="button"
                      onClick={payFull}
                      className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
                    >
                      Thanh toán hết
                    </button>
                  </div>
                  {amount && (
                    <p className="text-xs text-gray-400 mt-1">
                      {fmt(parseFloat(amount) || 0)} / {fmt(info.remaining_amount)} còn lại
                    </p>
                  )}
                </div>

                {/* Bank Transfer fields */}
                {paymentMethod === 'bank_transfer' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        <FileText className="w-3.5 h-3.5 inline mr-1" />
                        Số UNC / Chứng từ <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={referenceNumber}
                        onChange={(e) => setReferenceNumber(e.target.value)}
                        placeholder="Nhập số UNC hoặc số chứng từ..."
                        className="w-full min-h-[48px] px-3.5 py-3 bg-white text-[15px] text-gray-900 rounded-xl border border-gray-200 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        <Building2 className="w-3.5 h-3.5 inline mr-1" />
                        Ngân hàng
                      </label>
                      <input
                        type="text"
                        value={bankName}
                        onChange={(e) => setBankName(e.target.value)}
                        placeholder="Vd: Vietcombank, MB Bank..."
                        className="w-full min-h-[48px] px-3.5 py-3 bg-white text-[15px] text-gray-900 rounded-xl border border-gray-200 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200"
                      />
                    </div>
                  </>
                )}

                {/* ★ UPLOAD ẢNH CHUYỂN KHOẢN / ỦY NHIỆM CHI */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    <Camera className="w-3.5 h-3.5 inline mr-1" />
                    Ảnh chuyển khoản / Ủy nhiệm chi
                    {paymentMethod === 'bank_transfer' && (
                      <span className="text-xs text-gray-400 font-normal ml-1">(khuyến khích)</span>
                    )}
                  </label>

                  {/* File previews */}
                  {previews.length > 0 && (
                    <div className="flex gap-2 flex-wrap mb-2">
                      {previews.map((preview, idx) => (
                        <div
                          key={idx}
                          className="relative w-20 h-20 rounded-xl border border-gray-200 overflow-hidden group"
                        >
                          {preview ? (
                            <img src={preview} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full bg-gray-100 flex flex-col items-center justify-center">
                              <FileText className="w-5 h-5 text-gray-400" />
                              <span className="text-[9px] text-gray-400 mt-0.5">
                                {files[idx]?.name.split('.').pop()?.toUpperCase()}
                              </span>
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => removeFile(idx)}
                            className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                          >
                            <X className="w-3 h-3" />
                          </button>
                          <div className="absolute bottom-1 left-1 bg-black/50 text-white text-[8px] px-1 py-0.5 rounded">
                            {idx + 1}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Upload area */}
                  {files.length < MAX_FILES && (
                    <label className="flex flex-col items-center justify-center gap-1.5 py-5 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-colors">
                      <Upload className="w-5 h-5 text-gray-400" />
                      <span className="text-sm text-gray-500">
                        {files.length === 0
                          ? 'Chụp ảnh hoặc chọn file'
                          : 'Thêm ảnh'}
                      </span>
                      <span className="text-[10px] text-gray-400">
                        JPG, PNG, PDF — tối đa 10MB · {files.length}/{MAX_FILES}
                      </span>
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        multiple
                        capture="environment"
                        onChange={handleFileSelect}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Ghi chú
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Ghi chú thêm về thanh toán..."
                    rows={2}
                    className="w-full px-3.5 py-3 bg-white text-[15px] text-gray-900 rounded-xl border border-gray-200 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200 resize-none"
                  />
                </div>
              </div>

              {/* Upload progress */}
              {isSubmitting && uploadProgress > 0 && uploadProgress < 100 && (
                <div className="px-5 pb-2">
                  <div className="flex items-center gap-2 text-xs text-blue-600 mb-1">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Đang upload ảnh... {uploadProgress}%
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-1.5">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSubmitting}
                  className="px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-200 rounded-xl transition-colors min-h-[44px]"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !amount || parseFloat(amount) <= 0}
                  className="flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white text-sm font-medium rounded-xl hover:bg-green-700 disabled:opacity-50 transition-colors shadow-sm min-h-[44px]"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Đang xử lý...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      Xác nhận thanh toán
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default PaymentFormModal;