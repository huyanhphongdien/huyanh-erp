// ============================================================================
// PO DETAIL PAGE - CẬP NHẬT PHASE P5 (HOÀN CHỈNH)
// File: src/features/purchasing/pages/PODetailPage.tsx
// Huy Anh ERP System
// ============================================================================
// CẬP NHẬT 2026-02-26:
// - ConfirmOrderModal: thêm số đề xuất (auto-gen), ngày duyệt, người duyệt
//   + upload file bắt buộc
// - Tab Thông tin: hiển thị section "Thông tin phê duyệt" sau khi xác nhận
// - handleConfirm: lưu approval data + file URLs + confirm order
// ============================================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  AlertCircle,
  X,
  Package,
  History,
  Receipt,
  CreditCard,
  FileText,
  Pencil,
  Trash2,
  Upload,
  MoreHorizontal,
  MapPin,
  Calendar,
  Building2,
  Ban,
  ShoppingCart,
  ExternalLink,
  Image as ImageIcon,
  Shield,
  Hash,
  User,
  Eye,
  Info,
} from 'lucide-react';
import {
  purchaseOrderService,
  type PurchaseOrder,
  type PurchaseOrderItem,
  type PurchaseOrderHistory,
} from '../../../services/purchaseOrderService';
import { supabase } from '../../../lib/supabase';
import { useAuthStore } from '../../../stores/authStore';

// Components
import { OrderStatusBadge } from './components/orders/OrderStatusBadge';
import { OrderInfoTab } from './components/orders/OrderInfoTab';
import { OrderItemsTab } from './components/orders/OrderItemsTab';
import { OrderHistoryTab } from './components/orders/OrderHistoryTab';
import OrderInvoiceTab from './components/orders/OrderInvoiceTab';
import { AddInvoiceModal } from './components/orders/AddInvoiceModal';
import PaymentFormModal from './components/payments/PaymentFormModal';

// ============================================================================
// CONSTANTS
// ============================================================================

type OrderStatus = 'draft' | 'confirmed' | 'partial' | 'completed' | 'cancelled';

const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  draft: 'Nháp',
  confirmed: 'Đã xác nhận',
  partial: 'Đang giao',
  completed: 'Hoàn thành',
  cancelled: 'Đã hủy',
};

const MAX_CONFIRM_FILES = 5;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
  }).format(amount);
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ============================================================================
// HELPERS: Auto-generate approval number & default approver
// ============================================================================

async function generateApprovalNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `DX-${year}-`;
  try {
    const { count, error } = await supabase
      .from('purchase_orders')
      .select('*', { count: 'exact', head: true })
      .ilike('approval_number', `${prefix}%`);
    if (error) throw error;
    const next = ((count || 0) + 1).toString().padStart(6, '0');
    return `${prefix}${next}`;
  } catch {
    const ts = Date.now().toString().slice(-6);
    return `${prefix}${ts}`;
  }
}

async function fetchDefaultApprover(): Promise<string> {
  try {
    const { data } = await supabase
      .from('employees')
      .select('full_name, position')
      .or('position.ilike.%giám đốc%,position.ilike.%giam doc%,position.ilike.%director%')
      .eq('status', 'active')
      .limit(1)
      .single();
    if (data) return `${data.full_name} - ${data.position || 'Giám đốc'}`;

    // Fallback: tìm theo tên
    const { data: byName } = await supabase
      .from('employees')
      .select('full_name, position')
      .ilike('full_name', '%Lê Văn Huy%')
      .limit(1)
      .single();
    if (byName) return `${byName.full_name} - ${byName.position || 'Giám đốc'}`;
    return 'Lê Văn Huy - Giám đốc';
  } catch {
    return 'Lê Văn Huy - Giám đốc';
  }
}

// ============================================================================
// CONFIRM MODAL (với thông tin phê duyệt + upload file bắt buộc)
// ============================================================================

interface ApprovalData {
  approval_number: string;
  approval_date: string;
  approved_by_name: string;
  files: File[];
}

function ConfirmOrderModal({
  show,
  orderCode,
  loading,
  onClose,
  onConfirm,
}: {
  show: boolean;
  orderCode: string;
  loading: boolean;
  onClose: () => void;
  onConfirm: (data: ApprovalData) => void;
}) {
  const [approvalNumber, setApprovalNumber] = useState('');
  const [approvalDate, setApprovalDate] = useState('');
  const [approvedByName, setApprovedByName] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [initLoading, setInitLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const initialized = useRef(false);

  // Auto-generate defaults when modal opens
  useEffect(() => {
    if (!show) {
      // Reset
      initialized.current = false;
      setFiles([]);
      setPreviews([]);
      setError('');
      setApprovalNumber('');
      setApprovalDate('');
      setApprovedByName('');
      return;
    }
    if (initialized.current) return;
    initialized.current = true;

    const init = async () => {
      setInitLoading(true);
      try {
        const [autoNumber, defaultApprover] = await Promise.all([
          generateApprovalNumber(),
          fetchDefaultApprover(),
        ]);
        setApprovalNumber(autoNumber);
        setApprovalDate(new Date().toISOString().split('T')[0]);
        setApprovedByName(defaultApprover);
      } catch {
        setApprovalNumber(`DX-${new Date().getFullYear()}-000001`);
        setApprovalDate(new Date().toISOString().split('T')[0]);
        setApprovedByName('Lê Văn Huy - Giám đốc');
      } finally {
        setInitLoading(false);
      }
    };
    init();
  }, [show]);

  const addFiles = (newFileList: FileList | null) => {
    if (!newFileList) return;
    const selected = Array.from(newFileList);
    const remaining = MAX_CONFIRM_FILES - files.length;

    const validFiles = selected
      .filter((f) => {
        if (f.size > MAX_FILE_SIZE) {
          setError(`File "${f.name}" vượt quá 10MB`);
          return false;
        }
        if (!f.type.startsWith('image/') && f.type !== 'application/pdf') {
          setError(`File "${f.name}" không hỗ trợ. Chỉ ảnh hoặc PDF.`);
          return false;
        }
        return true;
      })
      .slice(0, remaining);

    if (validFiles.length === 0) return;
    setError('');
    setFiles((prev) => [...prev, ...validFiles]);

    // Generate previews
    validFiles.forEach((file) => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (ev) => setPreviews((prev) => [...prev, ev.target?.result as string]);
        reader.readAsDataURL(file);
      } else {
        setPreviews((prev) => [...prev, '']);
      }
    });
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    addFiles(e.target.files);
    e.target.value = '';
  };

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
    setPreviews((prev) => prev.filter((_, i) => i !== idx));
    setError('');
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    addFiles(e.dataTransfer.files);
  };

  const handleSubmit = () => {
    if (!approvalNumber.trim()) {
      setError('Vui lòng nhập số đề xuất');
      return;
    }
    if (!approvalDate) {
      setError('Vui lòng chọn ngày duyệt');
      return;
    }
    if (files.length === 0) {
      setError('Vui lòng upload ít nhất 1 file bằng chứng phê duyệt (ảnh/PDF đề xuất đã ký duyệt)');
      return;
    }
    onConfirm({
      approval_number: approvalNumber.trim(),
      approval_date: approvalDate,
      approved_by_name: approvedByName.trim(),
      files,
    });
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={!loading ? onClose : undefined} />
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 rounded-t-2xl z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                <Shield className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">Xác nhận đơn hàng</h3>
                <p className="text-sm text-gray-500">{orderCode}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              disabled={loading}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-50"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          {/* Warning */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <p className="text-sm text-blue-700">
              <strong>Lưu ý:</strong> Sau khi xác nhận, đơn hàng có hiệu lực ngay và không thể sửa nội dung.
              Vui lòng nhập thông tin phê duyệt và upload bằng chứng.
            </p>
          </div>

          {initLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
              <span className="ml-2 text-gray-500">Đang tải...</span>
            </div>
          ) : (
            <>
              {/* Số đề xuất */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1.5">
                  <Hash className="w-4 h-4 text-gray-400" />
                  Số đề xuất / Số phiếu duyệt
                </label>
                <input
                  type="text"
                  value={approvalNumber}
                  readOnly
                  className="w-full px-4 py-2.5 text-[15px] border border-gray-300 rounded-xl bg-gray-50 text-gray-600 cursor-not-allowed"
                />
                <p className="text-xs text-gray-400 mt-1">Hệ thống tự tạo, tự động tăng</p>
              </div>

              {/* Ngày duyệt */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1.5">
                  <Calendar className="w-4 h-4 text-gray-400" />
                  Ngày duyệt <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={approvalDate}
                  onChange={(e) => setApprovalDate(e.target.value)}
                  disabled={loading}
                  className="w-full px-4 py-2.5 text-[15px] border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
                />
              </div>

              {/* Người duyệt */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1.5">
                  <User className="w-4 h-4 text-gray-400" />
                  Người duyệt
                </label>
                <input
                  type="text"
                  value={approvedByName}
                  readOnly
                  className="w-full px-4 py-2.5 text-[15px] border border-gray-300 rounded-xl bg-gray-50 text-gray-600 cursor-not-allowed"
                />
                <p className="text-xs text-gray-400 mt-1">Mặc định: Giám đốc</p>
              </div>

              {/* Upload file */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1.5">
                  <Upload className="w-4 h-4 text-gray-400" />
                  File đính kèm <span className="text-red-500">*</span>
                  <span className="text-xs text-gray-400 font-normal">(Ảnh/PDF đề xuất đã duyệt)</span>
                </label>

                {/* Drop zone */}
                <div
                  className={`relative border-2 border-dashed rounded-xl p-5 text-center transition-colors cursor-pointer ${
                    dragOver
                      ? 'border-blue-400 bg-blue-50'
                      : 'border-gray-300 bg-gray-50 hover:border-blue-300 hover:bg-blue-50/50'
                  }`}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="w-7 h-7 text-gray-400 mx-auto mb-2" />
                  <p className="text-sm text-gray-600">
                    Kéo thả hoặc <span className="text-blue-600 font-medium">chọn file</span>
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    Ảnh (JPG, PNG) hoặc PDF • Tối đa {MAX_CONFIRM_FILES} file • Mỗi file ≤ 10MB
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*,.pdf,application/pdf"
                    capture="environment"
                    className="hidden"
                    onChange={handleFileSelect}
                    disabled={loading}
                  />
                </div>

                {/* File list */}
                {files.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {files.map((file, idx) => {
                      const isImage = file.type.startsWith('image/');
                      return (
                        <div
                          key={`${file.name}-${idx}`}
                          className="flex items-center gap-3 bg-white border border-gray-200 rounded-lg px-3 py-2"
                        >
                          {/* Thumbnail */}
                          {isImage && previews[idx] ? (
                            <img
                              src={previews[idx]}
                              alt={file.name}
                              className="w-10 h-10 object-cover rounded-lg border border-gray-200"
                            />
                          ) : (
                            <div className="w-10 h-10 bg-red-50 rounded-lg flex items-center justify-center">
                              <FileText className="w-5 h-5 text-red-500" />
                            </div>
                          )}

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-700 truncate">{file.name}</p>
                            <p className="text-xs text-gray-400">{formatFileSize(file.size)}</p>
                          </div>

                          {/* Remove */}
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); removeFile(idx); }}
                            disabled={loading}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    })}

                    <div className="flex items-center justify-between text-xs text-gray-400 px-1">
                      <span>{files.length}/{MAX_CONFIRM_FILES} file • Tổng {formatFileSize(files.reduce((s, f) => s + f.size, 0))}</span>
                      {files.length < MAX_CONFIRM_FILES && (
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="text-blue-600 hover:text-blue-700 font-medium"
                          disabled={loading}
                        >
                          + Thêm file
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4 rounded-b-2xl flex gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 disabled:opacity-50"
          >
            Hủy
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || initLoading || files.length === 0}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Đang xử lý...
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                Xác nhận đơn hàng
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// APPROVAL EVIDENCE SECTION (hiển thị trong tab Thông tin)
// ============================================================================

function ApprovalEvidenceSection({ order }: { order: PurchaseOrder }) {
  const hasApproval = order.approval_number || (order as any).approval_documents?.length > 0;
  if (!hasApproval) return null;

  const docs: any[] = (order as any).approval_documents || [];

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 mt-4">
      <div className="flex items-center gap-2 mb-4">
        <Shield className="w-5 h-5 text-blue-600" />
        <h3 className="font-semibold text-gray-900">Thông tin phê duyệt</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div>
          <p className="text-xs text-gray-500 mb-1">Số đề xuất</p>
          <p className="text-sm font-semibold text-gray-900">
            {order.approval_number || '—'}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-1">Ngày duyệt</p>
          <p className="text-sm font-medium text-gray-700">
            {(order as any).approval_date
              ? new Date((order as any).approval_date).toLocaleDateString('vi-VN')
              : '—'}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-1">Người duyệt</p>
          <p className="text-sm font-medium text-gray-700">
            {(order as any).approved_by_name || '—'}
          </p>
        </div>
      </div>

      {/* File đính kèm */}
      {docs.length > 0 && (
        <div>
          <p className="text-xs text-gray-500 mb-2">File đính kèm</p>
          <div className="space-y-2">
            {docs.map((doc: any, index: number) => {
              const isImage = doc.type?.startsWith('image/') || doc.url?.match(/\.(jpg|jpeg|png|webp|gif)$/i);
              return (
                <a
                  key={index}
                  href={doc.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-3 bg-gray-50 hover:bg-blue-50 border border-gray-200 hover:border-blue-300 rounded-lg transition-colors group"
                >
                  {isImage ? (
                    <img
                      src={doc.url}
                      alt={doc.name || `File ${index + 1}`}
                      className="w-10 h-10 object-cover rounded-lg border border-gray-200"
                    />
                  ) : (
                    <div className="w-10 h-10 bg-red-50 rounded-lg flex items-center justify-center">
                      <FileText className="w-5 h-5 text-red-500" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-700 group-hover:text-blue-600 truncate">
                      {doc.name || `File ${index + 1}`}
                    </p>
                    {doc.size && (
                      <p className="text-xs text-gray-400">{formatFileSize(doc.size)}</p>
                    )}
                  </div>
                  <Eye className="w-4 h-4 text-gray-400 group-hover:text-blue-500" />
                </a>
              );
            })}
          </div>
        </div>
      )}

      {/* Nếu chỉ có file URLs (legacy format từ confirmWithFiles) */}
      {docs.length === 0 && (order as any).confirmation_files?.length > 0 && (
        <div>
          <p className="text-xs text-gray-500 mb-2">File đính kèm</p>
          <div className="space-y-2">
            {((order as any).confirmation_files as string[]).map((url: string, index: number) => {
              const isImage = url.match(/\.(jpg|jpeg|png|webp|gif)$/i);
              return (
                <a
                  key={index}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-3 bg-gray-50 hover:bg-blue-50 border border-gray-200 hover:border-blue-300 rounded-lg transition-colors group"
                >
                  {isImage ? (
                    <img
                      src={url}
                      alt={`File ${index + 1}`}
                      className="w-10 h-10 object-cover rounded-lg border border-gray-200"
                    />
                  ) : (
                    <div className="w-10 h-10 bg-red-50 rounded-lg flex items-center justify-center">
                      <FileText className="w-5 h-5 text-red-500" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-700 group-hover:text-blue-600 truncate">
                      {url.split('/').pop() || `File ${index + 1}`}
                    </p>
                  </div>
                  <Eye className="w-4 h-4 text-gray-400 group-hover:text-blue-500" />
                </a>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// DELETE MODAL
// ============================================================================

function DeleteModal({
  show,
  orderCode,
  loading,
  onClose,
  onConfirm,
}: {
  show: boolean;
  orderCode: string;
  loading: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Xóa đơn hàng?</h3>
        <p className="text-sm text-gray-600 mb-4">
          Đơn <strong>{orderCode}</strong> sẽ bị xóa vĩnh viễn. Không thể hoàn tác.
        </p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            Hủy
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            {loading ? 'Đang xóa...' : 'Xóa'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// CANCEL MODAL
// ============================================================================

function CancelModal({
  show,
  orderCode,
  loading,
  onClose,
  onConfirm,
}: {
  show: boolean;
  orderCode: string;
  loading: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Hủy đơn hàng?</h3>
        <p className="text-sm text-gray-600 mb-3">
          Đơn <strong>{orderCode}</strong> sẽ bị hủy.
        </p>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Lý do hủy (tùy chọn)..."
          rows={3}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-4"
        />
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            Đóng
          </button>
          <button
            onClick={() => onConfirm(reason)}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ban className="w-4 h-4" />}
            {loading ? 'Đang hủy...' : 'Hủy đơn hàng'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

type TabKey = 'info' | 'items' | 'history' | 'invoices';

function PODetailPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const { user } = useAuthStore();

  // ===== STATE =====
  const [order, setOrder] = useState<PurchaseOrder | null>(null);
  const [items, setItems] = useState<PurchaseOrderItem[]>([]);
  const [history, setHistory] = useState<PurchaseOrderHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('info');
  const [successMsg, setSuccessMsg] = useState<string | null>(
    (location.state as any)?.message || null
  );

  // Action states
  const [actionLoading, setActionLoading] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showActionMenu, setShowActionMenu] = useState(false);

  // Invoice modal
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [invoicePreSelectedSupplier, setInvoicePreSelectedSupplier] = useState<string | undefined>();
  const [invoiceRefreshKey, setInvoiceRefreshKey] = useState(0);

  // Payment modal
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentInvoiceId, setPaymentInvoiceId] = useState<string | null>(null);
  const [paymentInvoiceNumber, setPaymentInvoiceNumber] = useState<string>('');

  // ===== LOAD DATA =====
  const loadOrder = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [orderData, itemsData, historyData] = await Promise.all([
        purchaseOrderService.getById(id),
        purchaseOrderService.getItems(id),
        purchaseOrderService.getHistory(id),
      ]);

      if (!orderData) {
        setError('Đơn hàng không tồn tại');
        return;
      }

      setOrder(orderData);
      setItems(itemsData);
      setHistory(historyData);
    } catch (err: any) {
      console.error('Error loading order:', err);
      setError(err.message || 'Lỗi tải đơn hàng');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadOrder();
  }, [loadOrder]);

  // Auto-clear success message
  useEffect(() => {
    if (successMsg) {
      const timer = setTimeout(() => setSuccessMsg(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [successMsg]);

  // ===== ACTIONS =====

  // Xác nhận đơn hàng với thông tin phê duyệt + upload file
  const handleConfirm = async (data: ApprovalData) => {
    if (!order || !id) return;
    setActionLoading(true);

    try {
      // 1. Upload files to storage
      const uploadedDocs: any[] = [];
      for (let i = 0; i < data.files.length; i++) {
        const file = data.files[i];
        const ext = file.name.split('.').pop() || 'jpg';
        const storagePath = `approvals/${id}/${Date.now()}_${i}.${ext}`;

        // Try 'purchase-approvals' bucket first
        let uploadResult = await supabase.storage
          .from('purchase-approvals')
          .upload(storagePath, file, { upsert: true });

        let bucketName = 'purchase-approvals';

        if (uploadResult.error) {
          // Fallback: 'order-confirmations'
          uploadResult = await supabase.storage
            .from('order-confirmations')
            .upload(storagePath, file, { upsert: true });
          bucketName = 'order-confirmations';

          if (uploadResult.error) {
            // Fallback: 'invoice-images'
            uploadResult = await supabase.storage
              .from('invoice-images')
              .upload(storagePath, file, { upsert: true });
            bucketName = 'invoice-images';

            if (uploadResult.error) {
              throw new Error(`Upload thất bại: ${file.name} — ${uploadResult.error.message}`);
            }
          }
        }

        const { data: urlData } = supabase.storage
          .from(bucketName)
          .getPublicUrl(storagePath);

        uploadedDocs.push({
          name: file.name,
          url: urlData.publicUrl,
          type: file.type,
          size: file.size,
          path: storagePath,
        });
      }

      // 2. Lưu thông tin phê duyệt vào purchase_orders
      const { error: updateError } = await supabase
        .from('purchase_orders')
        .update({
          approval_number: data.approval_number,
          approval_date: data.approval_date,
          approved_by_name: data.approved_by_name,
          approval_documents: uploadedDocs,
        })
        .eq('id', id);

      if (updateError) {
        console.error('Error saving approval data:', updateError);
        // Không throw — vẫn tiếp tục confirm
      }

      // 3. Confirm đơn hàng
      const userId = user?.employee_id || '';

      // Thử gọi confirmWithFiles nếu có, nếu không thì gọi confirm thường
      if (typeof purchaseOrderService.confirmWithFiles === 'function') {
        await purchaseOrderService.confirmWithFiles(
          id,
          userId,
          uploadedDocs.map((d: any) => d.url)
        );
      } else if (typeof purchaseOrderService.confirm === 'function') {
        await purchaseOrderService.confirm(id, userId);
      } else {
        // Fallback: manual status update
        await supabase
          .from('purchase_orders')
          .update({
            status: 'confirmed',
            confirmed_by: userId || null,
            confirmed_at: new Date().toISOString(),
            confirmed_by_name: user?.full_name || '',
          })
          .eq('id', id);
      }

      setSuccessMsg('Đơn hàng đã được xác nhận!');
      setShowConfirmModal(false);
      loadOrder();
    } catch (err: any) {
      console.error('Error confirming order:', err);
      alert(err.message || 'Lỗi xác nhận đơn hàng');
    } finally {
      setActionLoading(false);
    }
  };

  // Hủy đơn hàng
  const handleCancel = async (reason: string) => {
    if (!order || !id) return;
    setActionLoading(true);
    try {
      const userId = user?.employee_id || '';
      await purchaseOrderService.cancel(id, userId, reason);
      setSuccessMsg('Đơn hàng đã bị hủy');
      setShowCancelModal(false);
      loadOrder();
    } catch (err: any) {
      alert(err.message || 'Lỗi hủy đơn hàng');
    } finally {
      setActionLoading(false);
    }
  };

  // Xóa đơn hàng (chỉ draft)
  const handleDelete = async () => {
    if (!order || !id) return;
    setActionLoading(true);
    try {
      await purchaseOrderService.delete(id);
      navigate('/purchasing/orders', {
        state: { message: `Đã xóa đơn hàng ${order.order_code}` },
      });
    } catch (err: any) {
      alert(err.message || 'Lỗi xóa đơn hàng');
    } finally {
      setActionLoading(false);
    }
  };

  // Invoice callbacks
  const handleAddInvoice = (supplierId?: string) => {
    setInvoicePreSelectedSupplier(supplierId);
    setShowInvoiceModal(true);
  };

  const handleInvoiceCreated = () => {
    setInvoiceRefreshKey((k) => k + 1);
    loadOrder();
  };

  // Payment modal
  const handlePayment = (invoiceId: string, invoiceNumber?: string) => {
    setPaymentInvoiceId(invoiceId);
    setPaymentInvoiceNumber(invoiceNumber || '');
    setShowPaymentModal(true);
  };

  const handlePaymentSuccess = () => {
    setShowPaymentModal(false);
    setPaymentInvoiceId(null);
    setPaymentInvoiceNumber('');
    setSuccessMsg('Thanh toán đã được ghi nhận thành công');
    setInvoiceRefreshKey((k) => k + 1);
    loadOrder();
  };

  const handleViewInvoice = (invoiceId: string) => {
    navigate(`/purchasing/invoices/${invoiceId}`);
  };

  // ===== RENDER =====

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="text-center py-12">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
          <p className="text-lg font-medium text-gray-900 mb-1">
            {error || 'Đơn hàng không tồn tại'}
          </p>
          <button
            onClick={() => navigate('/purchasing/orders')}
            className="mt-3 text-sm text-blue-600 hover:underline"
          >
            ← Quay lại danh sách
          </button>
        </div>
      </div>
    );
  }

  const status = order.status as OrderStatus;
  const isDraft = status === 'draft';
  const isConfirmed = status === 'confirmed';
  const isPartial = status === 'partial';
  const canEdit = isDraft;
  const canConfirm = isDraft;
  const canCancel = isDraft || isConfirmed;
  const canAddInvoice = isConfirmed || isPartial;

  // Group items by supplier
  const itemsBySupplier: Record<string, PurchaseOrderItem[]> = {};
  items.forEach((item) => {
    const key = item.supplier_id || 'unknown';
    if (!itemsBySupplier[key]) itemsBySupplier[key] = [];
    itemsBySupplier[key].push(item);
  });

  // Tab config
  const TABS: { key: TabKey; label: string; icon: React.ElementType; count?: number }[] = [
    { key: 'info', label: 'Thông tin', icon: Info },
    { key: 'items', label: 'Vật tư', icon: Package, count: items.length },
    { key: 'invoices', label: 'Hóa đơn & TT', icon: Receipt },
    { key: 'history', label: 'Lịch sử', icon: History, count: history.length },
  ];

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-5">
      {/* Success message */}
      {successMsg && (
        <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-center gap-2 text-sm text-green-700">
            <CheckCircle2 className="w-4 h-4" />
            {successMsg}
          </div>
          <button onClick={() => setSuccessMsg(null)}>
            <X className="w-4 h-4 text-green-400" />
          </button>
        </div>
      )}

      {/* ===== HEADER ===== */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <button
            onClick={() => navigate('/purchasing/orders')}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg mt-0.5"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-gray-900">{order.order_code}</h1>
              <OrderStatusBadge status={status} />
            </div>
            {order.project_name && (
              <p className="text-sm text-gray-500 mt-0.5">{order.project_name}</p>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {canEdit && (
            <button
              onClick={() => navigate(`/purchasing/orders/${id}/edit`)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg"
            >
              <Pencil className="w-4 h-4" />
              Sửa
            </button>
          )}

          {canConfirm && (
            <button
              onClick={() => setShowConfirmModal(true)}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
            >
              <CheckCircle2 className="w-4 h-4" />
              Xác nhận
            </button>
          )}

          {canAddInvoice && (
            <button
              onClick={() => handleAddInvoice()}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg"
            >
              <Receipt className="w-4 h-4" />
              Thêm HĐ
            </button>
          )}

          {/* More actions */}
          {(canCancel || isDraft) && (
            <div className="relative">
              <button
                onClick={() => setShowActionMenu(!showActionMenu)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                <MoreHorizontal className="w-5 h-5" />
              </button>

              {showActionMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowActionMenu(false)} />
                  <div className="absolute right-0 top-10 z-20 bg-white border border-gray-200 rounded-lg shadow-lg py-1 w-44">
                    {canCancel && (
                      <button
                        onClick={() => { setShowCancelModal(true); setShowActionMenu(false); }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-orange-600 hover:bg-orange-50"
                      >
                        <Ban className="w-4 h-4" />
                        Hủy đơn hàng
                      </button>
                    )}
                    {isDraft && (
                      <button
                        onClick={() => { setShowDeleteModal(true); setShowActionMenu(false); }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                        Xóa đơn hàng
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ===== SUMMARY CARDS ===== */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <p className="text-xs text-gray-500 flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            Ngày tạo
          </p>
          <p className="text-sm font-medium text-gray-900 mt-0.5">
            {new Date(order.order_date || order.created_at).toLocaleDateString('vi-VN')}
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <p className="text-xs text-gray-500 flex items-center gap-1">
            <Building2 className="w-3 h-3" />
            NCC
          </p>
          <p className="text-sm font-medium text-gray-900 mt-0.5">
            {Object.keys(itemsBySupplier).length} nhà cung cấp
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <p className="text-xs text-gray-500 flex items-center gap-1">
            <ShoppingCart className="w-3 h-3" />
            Vật tư
          </p>
          <p className="text-sm font-medium text-gray-900 mt-0.5">{items.length} mục</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <p className="text-xs text-gray-500">Tổng tiền</p>
          <p className="text-lg font-bold text-blue-600 mt-0.5">
            {formatCurrency(order.grand_total || 0)}
          </p>
        </div>
      </div>

      {/* Delivery info */}
      {(order.delivery_address || order.delivery_notes) && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-1.5">
            <MapPin className="w-4 h-4 text-green-500" />
            Giao hàng
          </h3>
          {order.delivery_address && (
            <p className="text-sm text-gray-600">{order.delivery_address}</p>
          )}
          {order.delivery_notes && (
            <p className="text-sm text-gray-500 mt-0.5">{order.delivery_notes}</p>
          )}
        </div>
      )}

      {/* ===== TABS ===== */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="flex border-b border-gray-200 overflow-x-auto">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                  activeTab === tab.key
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
                {tab.count !== undefined && (
                  <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="p-5">
          {activeTab === 'info' && (
            <div>
              <OrderInfoTab order={order} />
              {/* ★ Section phê duyệt — hiển thị khi đã có thông tin */}
              <ApprovalEvidenceSection order={order} />
            </div>
          )}
          {activeTab === 'items' && (
            <OrderItemsTab items={items} grandTotal={order.grand_total || 0} />
          )}
          {activeTab === 'invoices' && (
            <OrderInvoiceTab
              orderId={order.id}
              orderStatus={order.status}
              onAddInvoice={handleAddInvoice}
              onPayment={handlePayment}
              refreshKey={invoiceRefreshKey}
            />
          )}
          {activeTab === 'history' && <OrderHistoryTab history={history} />}
        </div>
      </div>

      {/* ===== MODALS ===== */}
      <ConfirmOrderModal
        show={showConfirmModal}
        orderCode={order.order_code}
        loading={actionLoading}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={handleConfirm}
      />

      <DeleteModal
        show={showDeleteModal}
        orderCode={order.order_code}
        loading={actionLoading}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleDelete}
      />

      <CancelModal
        show={showCancelModal}
        orderCode={order.order_code}
        loading={actionLoading}
        onClose={() => setShowCancelModal(false)}
        onConfirm={handleCancel}
      />

      <AddInvoiceModal
        show={showInvoiceModal}
        orderId={order.id}
        preSelectedSupplierId={invoicePreSelectedSupplier}
        currentUserId={user?.employee_id ?? undefined}
        onClose={() => {
          setShowInvoiceModal(false);
          setInvoicePreSelectedSupplier(undefined);
        }}
        onSuccess={handleInvoiceCreated}
      />

      {/* Payment modal */}
      {showPaymentModal && paymentInvoiceId && (
        <PaymentFormModal
          isOpen={showPaymentModal}
          onClose={() => {
            setShowPaymentModal(false);
            setPaymentInvoiceId(null);
            setPaymentInvoiceNumber('');
          }}
          onSuccess={handlePaymentSuccess}
          invoiceId={paymentInvoiceId}
          invoiceNumber={paymentInvoiceNumber}
        />
      )}
    </div>
  );
}

export default PODetailPage;