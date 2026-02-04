// ============================================================================
// PO DETAIL PAGE - CẬP NHẬT PHASE P5
// File: src/features/purchasing/pages/PODetailPage.tsx
// Huy Anh ERP System
// ============================================================================
// CẬP NHẬT:
// - Thêm Tab 4: Hóa đơn & Thanh toán (OrderInvoiceTab)
// - Confirm flow: bắt buộc upload ít nhất 1 file bằng chứng
// - Workflow mới: draft → confirmed → partial → completed → cancelled
// - Bỏ pending/approved/rejected
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
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
import { OrderInvoiceTab } from './components/orders/OrderInvoiceTab';
import { AddInvoiceModal } from './components/orders/AddInvoiceModal';

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

const CONFIRMATION_BUCKET = 'order-confirmations';
const MAX_CONFIRM_FILES = 5;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
  }).format(amount);
}

// ============================================================================
// CONFIRM MODAL (với upload file bắt buộc)
// ============================================================================

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
  onConfirm: (files: File[]) => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [error, setError] = useState('');

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    const remaining = MAX_CONFIRM_FILES - files.length;

    const validFiles = selected
      .filter((f) => {
        if (f.size > MAX_FILE_SIZE) {
          setError(`File "${f.name}" vượt quá 10MB`);
          return false;
        }
        return true;
      })
      .slice(0, remaining);

    setFiles((prev) => [...prev, ...validFiles]);
    setError('');

    // Preview
    validFiles.forEach((file) => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          setPreviews((prev) => [...prev, ev.target?.result as string]);
        };
        reader.readAsDataURL(file);
      } else {
        setPreviews((prev) => [...prev, '']);
      }
    });
    e.target.value = '';
  };

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
    setPreviews((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = () => {
    if (files.length === 0) {
      setError('Vui lòng upload ít nhất 1 file bằng chứng (đề xuất đã ký duyệt)');
      return;
    }
    onConfirm(files);
  };

  // Reset on close
  useEffect(() => {
    if (!show) {
      setFiles([]);
      setPreviews([]);
      setError('');
    }
  }, [show]);

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white rounded-xl shadow-2xl">
        <div className="p-5 border-b">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-blue-500" />
            Xác nhận đơn hàng
          </h3>
          <p className="text-sm text-gray-500 mt-1">
            Đơn <strong>{orderCode}</strong> sẽ chuyển sang trạng thái "Đã xác nhận"
          </p>
        </div>

        <div className="p-5 space-y-4">
          {/* Warning */}
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
            <strong>Bắt buộc:</strong> Upload ảnh/PDF đề xuất đã được ký duyệt.
            Sau khi xác nhận, đơn hàng sẽ bị khóa không sửa được.
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* File previews */}
          {previews.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {previews.map((preview, idx) => (
                <div
                  key={idx}
                  className="relative w-20 h-20 rounded-lg border border-gray-200 overflow-hidden group"
                >
                  {preview ? (
                    <img src={preview} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-gray-100 flex flex-col items-center justify-center">
                      <FileText className="w-5 h-5 text-gray-400" />
                      <span className="text-[10px] text-gray-400 mt-0.5">
                        {files[idx]?.name.split('.').pop()?.toUpperCase()}
                      </span>
                    </div>
                  )}
                  <button
                    onClick={() => removeFile(idx)}
                    className="absolute top-0.5 right-0.5 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Upload area */}
          {files.length < MAX_CONFIRM_FILES && (
            <label className="flex flex-col items-center justify-center gap-2 py-6 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-colors">
              <Upload className="w-6 h-6 text-gray-400" />
              <span className="text-sm text-gray-500">
                Kéo thả hoặc chọn file
              </span>
              <span className="text-xs text-gray-400">
                JPG, PNG, PDF — tối đa 10MB/file — {files.length}/{MAX_CONFIRM_FILES}
              </span>
              <input
                type="file"
                accept="image/*,application/pdf"
                multiple
                onChange={handleFileSelect}
                className="hidden"
              />
            </label>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-5 border-t bg-gray-50 rounded-b-xl">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-200 rounded-lg"
          >
            Hủy
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || files.length === 0}
            className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Đang xác nhận...
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

  // Xác nhận đơn hàng (draft → confirmed) với upload file bằng chứng
  const handleConfirm = async (files: File[]) => {
    if (!order || !id) return;
    setActionLoading(true);

    try {
      // 1. Upload files to storage
      const fileUrls: string[] = [];
      for (const file of files) {
        const ext = file.name.split('.').pop() || 'jpg';
        const path = `${id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from(CONFIRMATION_BUCKET)
          .upload(path, file, { cacheControl: '3600' });

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from(CONFIRMATION_BUCKET)
          .getPublicUrl(path);

        fileUrls.push(urlData.publicUrl);
      }

      // 2. Xác nhận đơn hàng + lưu file URLs (service tự ghi history)
      const userId = user?.employee_id || '';
      await purchaseOrderService.confirmWithFiles(id, userId, fileUrls);

      setSuccessMsg('Đơn hàng đã được xác nhận');
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
    loadOrder(); // Reload to update status/progress
  };

  const handlePayment = (invoiceId: string) => {
    navigate(`/purchasing/invoices/${invoiceId}?tab=payment`);
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
  const isCompleted = status === 'completed';
  const isCancelled = status === 'cancelled';
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
    { key: 'info', label: 'Thông tin', icon: FileText },
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
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowActionMenu(false)}
                  />
                  <div className="absolute right-0 top-10 z-20 bg-white border border-gray-200 rounded-lg shadow-lg py-1 w-44">
                    {canCancel && (
                      <button
                        onClick={() => {
                          setShowCancelModal(true);
                          setShowActionMenu(false);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-orange-600 hover:bg-orange-50"
                      >
                        <Ban className="w-4 h-4" />
                        Hủy đơn hàng
                      </button>
                    )}
                    {isDraft && (
                      <button
                        onClick={() => {
                          setShowDeleteModal(true);
                          setShowActionMenu(false);
                        }}
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
          {activeTab === 'info' && <OrderInfoTab order={order} />}
          {activeTab === 'items' && (
            <OrderItemsTab items={items} grandTotal={order.grand_total || 0} />
          )}
          {activeTab === 'invoices' && (
            <OrderInvoiceTab
              orderId={order.id}
              orderStatus={order.status}
              onAddInvoice={handleAddInvoice}
              onPayment={handlePayment}
              onViewInvoice={handleViewInvoice}
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
    </div>
  );
}

export default PODetailPage;