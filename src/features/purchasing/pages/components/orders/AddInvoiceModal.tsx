// ============================================================================
// ADD INVOICE MODAL - Modal thêm hóa đơn NCC từ đơn hàng
// File: src/features/purchasing/pages/components/orders/AddInvoiceModal.tsx
// Huy Anh ERP System - Phase P5
// ============================================================================
// Workflow: Chọn NCC → Load items từ đơn hàng → Nhập SL thực nhận → Upload ảnh → Lưu
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import {
  X,
  Receipt,
  Building2,
  Calendar,
  FileText,
  Upload,
  Trash2,
  Package,
  Save,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Plus,
  Image as ImageIcon,
  ChevronDown,
} from 'lucide-react';
import { supplierInvoiceService } from '../../../../../services/supplierInvoiceService';
import type { InvoiceItemFormData } from '../../../../../services/supplierInvoiceService';
import { purchaseOrderService } from '../../../../../services/purchaseOrderService';
import { supabase } from '../../../../../lib/supabase';

// ============================================================================
// TYPES
// ============================================================================

interface OrderSupplier {
  id: string;
  code: string;
  name: string;
  item_count: number;
  subtotal: number;
}

interface OrderItemForInvoice {
  id: string;
  material_code: string;
  material_name: string;
  unit: string;
  quantity: number;
  unit_price: number;
  vat_rate: number;
  invoiced_quantity: number;
  remaining_quantity: number;
  // Form state
  selected: boolean;
  invoice_quantity: number;
}

// ============================================================================
// HELPERS
// ============================================================================

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
  }).format(amount);
}

const INVOICE_IMAGE_BUCKET = 'invoice-images';
const MAX_IMAGES = 5;
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB

// ============================================================================
// MAIN COMPONENT
// ============================================================================

interface AddInvoiceModalProps {
  show: boolean;
  orderId: string;
  /** Pre-select supplier (khi bấm "Thêm HĐ cho NCC X") */
  preSelectedSupplierId?: string;
  currentUserId?: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function AddInvoiceModal({
  show,
  orderId,
  preSelectedSupplierId,
  currentUserId,
  onClose,
  onSuccess,
}: AddInvoiceModalProps) {
  // ===== STATE =====
  const [step, setStep] = useState<'select_supplier' | 'fill_form'>('select_supplier');
  const [suppliers, setSuppliers] = useState<OrderSupplier[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');
  const [orderItems, setOrderItems] = useState<OrderItemForInvoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form fields
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');

  // Images
  const [images, setImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [uploadingImages, setUploadingImages] = useState(false);

  // ===== LOAD SUPPLIERS =====
  useEffect(() => {
    if (!show) return;
    loadSuppliers();
  }, [show, orderId]);

  // Auto-select supplier if pre-selected
  useEffect(() => {
    if (preSelectedSupplierId && suppliers.length > 0) {
      setSelectedSupplierId(preSelectedSupplierId);
      setStep('fill_form');
    }
  }, [preSelectedSupplierId, suppliers]);

  const loadSuppliers = async () => {
    try {
      const data = await purchaseOrderService.getOrderSuppliers(orderId);
      setSuppliers(data);
    } catch (err: any) {
      console.error('Error loading suppliers:', err);
      setError('Lỗi tải danh sách NCC');
    }
  };

  // ===== LOAD ORDER ITEMS FOR SELECTED SUPPLIER =====
  useEffect(() => {
    if (selectedSupplierId && step === 'fill_form') {
      loadOrderItems(selectedSupplierId);
    }
  }, [selectedSupplierId, step]);

  const loadOrderItems = async (supplierId: string) => {
    setLoading(true);
    try {
      const items = await supplierInvoiceService.getOrderItemsForInvoice(
        orderId,
        supplierId
      );
      setOrderItems(
        items.map((item: any) => ({
          ...item,
          selected: item.remaining_quantity > 0,
          invoice_quantity: item.remaining_quantity > 0 ? item.remaining_quantity : 0,
        }))
      );
    } catch (err: any) {
      console.error('Error loading order items:', err);
      setError('Lỗi tải vật tư');
    } finally {
      setLoading(false);
    }
  };

  // ===== IMAGE HANDLING =====
  const handleImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const remaining = MAX_IMAGES - images.length;

    const validFiles = files
      .filter((f) => {
        if (f.size > MAX_IMAGE_SIZE) {
          alert(`File "${f.name}" vượt quá 10MB`);
          return false;
        }
        if (!f.type.startsWith('image/') && f.type !== 'application/pdf') {
          alert(`File "${f.name}" không phải ảnh hoặc PDF`);
          return false;
        }
        return true;
      })
      .slice(0, remaining);

    setImages((prev) => [...prev, ...validFiles]);

    // Tạo preview
    validFiles.forEach((file) => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
          setImagePreviews((prev) => [...prev, e.target?.result as string]);
        };
        reader.readAsDataURL(file);
      } else {
        setImagePreviews((prev) => [...prev, '']); // PDF placeholder
      }
    });

    // Reset input
    e.target.value = '';
  }, [images]);

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
    setImagePreviews((prev) => prev.filter((_, i) => i !== index));
  };

  // ===== UPLOAD IMAGES TO STORAGE =====
  const uploadImages = async (): Promise<string[]> => {
    if (images.length === 0) return [];

    setUploadingImages(true);
    const urls: string[] = [];

    try {
      for (const file of images) {
        const ext = file.name.split('.').pop() || 'jpg';
        const path = `${orderId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from(INVOICE_IMAGE_BUCKET)
          .upload(path, file, { cacheControl: '3600' });

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from(INVOICE_IMAGE_BUCKET)
          .getPublicUrl(path);

        urls.push(urlData.publicUrl);
      }
    } finally {
      setUploadingImages(false);
    }

    return urls;
  };

  // ===== TOGGLE ITEM =====
  const toggleItem = (index: number) => {
    setOrderItems((prev) =>
      prev.map((item, i) =>
        i === index
          ? {
              ...item,
              selected: !item.selected,
              invoice_quantity: !item.selected ? item.remaining_quantity : 0,
            }
          : item
      )
    );
  };

  // ===== UPDATE QUANTITY =====
  const updateQuantity = (index: number, qty: number) => {
    setOrderItems((prev) =>
      prev.map((item, i) =>
        i === index
          ? {
              ...item,
              invoice_quantity: Math.min(Math.max(0, qty), item.remaining_quantity),
              selected: qty > 0,
            }
          : item
      )
    );
  };

  // ===== CALCULATE TOTALS =====
  const selectedItems = orderItems.filter((item) => item.selected && item.invoice_quantity > 0);
  const subtotal = selectedItems.reduce(
    (sum, item) => sum + item.invoice_quantity * item.unit_price,
    0
  );
  const vatAmount = selectedItems.reduce(
    (sum, item) => sum + item.invoice_quantity * item.unit_price * (item.vat_rate / 100),
    0
  );
  const totalAmount = subtotal + vatAmount;

  // ===== SUBMIT =====
  const handleSubmit = async () => {
    if (selectedItems.length === 0) {
      setError('Chọn ít nhất 1 vật tư');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // 1. Upload images
      const imageUrls = await uploadImages();

      // 2. Prepare items
      const items: InvoiceItemFormData[] = selectedItems.map((item, idx) => ({
        order_item_id: item.id,
        material_code: item.material_code,
        material_name: item.material_name,
        unit: item.unit,
        quantity: item.invoice_quantity,
        unit_price: item.unit_price,
        vat_rate: item.vat_rate,
        sort_order: idx,
      }));

      // 3. Create invoice
      await supplierInvoiceService.create({
        order_id: orderId,
        supplier_id: selectedSupplierId,
        invoice_number: invoiceNumber || undefined,
        invoice_date: invoiceDate,
        due_date: dueDate || undefined,
        notes: notes || undefined,
        created_by: currentUserId || undefined,
        items,
      });

      // 4. Update image_urls nếu có (post-create)
      // Note: supplierInvoiceService.create chưa support image_urls trực tiếp
      // Có thể thêm sau bằng update

      onSuccess();
      handleClose();
    } catch (err: any) {
      console.error('Error creating invoice:', err);
      setError(err.message || 'Lỗi tạo hóa đơn');
    } finally {
      setSaving(false);
    }
  };

  // ===== RESET & CLOSE =====
  const handleClose = () => {
    setStep('select_supplier');
    setSelectedSupplierId('');
    setOrderItems([]);
    setInvoiceNumber('');
    setInvoiceDate(new Date().toISOString().split('T')[0]);
    setDueDate('');
    setNotes('');
    setImages([]);
    setImagePreviews([]);
    setError(null);
    onClose();
  };

  if (!show) return null;

  // ===== RENDER =====
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />

      {/* Modal */}
      <div className="relative w-full max-w-2xl max-h-[90vh] bg-white rounded-xl shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b flex-shrink-0">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Receipt className="w-5 h-5 text-blue-500" />
              Thêm hóa đơn NCC
            </h3>
            {selectedSupplierId && (
              <p className="text-sm text-gray-500 mt-0.5">
                {suppliers.find((s) => s.id === selectedSupplierId)?.name}
              </p>
            )}
          </div>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content - Scrollable */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* ===== STEP 1: SELECT SUPPLIER ===== */}
          {step === 'select_supplier' && (
            <div>
              <p className="text-sm text-gray-600 mb-3">
                Chọn nhà cung cấp để tạo hóa đơn:
              </p>
              <div className="space-y-2">
                {suppliers.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => {
                      setSelectedSupplierId(s.id);
                      setStep('fill_form');
                    }}
                    className="w-full flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:border-blue-400 hover:bg-blue-50/50 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <Building2 className="w-5 h-5 text-gray-400" />
                      <div>
                        <p className="font-medium text-gray-900">{s.name}</p>
                        <p className="text-xs text-gray-500">
                          {s.code} • {s.item_count} vật tư
                        </p>
                      </div>
                    </div>
                    <p className="text-sm font-medium text-gray-600">
                      {formatCurrency(s.subtotal)}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ===== STEP 2: FILL FORM ===== */}
          {step === 'fill_form' && (
            <>
              {/* Supplier selector (can change) */}
              {!preSelectedSupplierId && (
                <button
                  onClick={() => setStep('select_supplier')}
                  className="flex items-center gap-2 text-sm text-blue-600 hover:underline"
                >
                  <ChevronDown className="w-4 h-4 rotate-90" />
                  Đổi NCC
                </button>
              )}

              {/* Invoice info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Số hóa đơn NCC
                  </label>
                  <input
                    type="text"
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                    placeholder="VD: 0001234"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Ngày hóa đơn <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={invoiceDate}
                    onChange={(e) => setInvoiceDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Hạn thanh toán
                  </label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Ghi chú
                  </label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Ghi chú hóa đơn..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Order items */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                  <Package className="w-4 h-4 text-blue-500" />
                  Vật tư từ đơn hàng
                </h4>

                {loading ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                    <span className="ml-2 text-sm text-gray-500">Đang tải...</span>
                  </div>
                ) : (
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="w-10 p-2 text-center">
                            <input
                              type="checkbox"
                              checked={orderItems.length > 0 && orderItems.every((i) => i.selected)}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setOrderItems((prev) =>
                                  prev.map((item) => ({
                                    ...item,
                                    selected: checked && item.remaining_quantity > 0,
                                    invoice_quantity: checked ? item.remaining_quantity : 0,
                                  }))
                                );
                              }}
                              className="rounded border-gray-300"
                            />
                          </th>
                          <th className="p-2 text-left text-xs font-medium text-gray-500">Vật tư</th>
                          <th className="p-2 text-center text-xs font-medium text-gray-500 w-20">ĐVT</th>
                          <th className="p-2 text-right text-xs font-medium text-gray-500 w-20">ĐH</th>
                          <th className="p-2 text-right text-xs font-medium text-gray-500 w-20">Đã HĐ</th>
                          <th className="p-2 text-center text-xs font-medium text-gray-500 w-24">SL nhận</th>
                          <th className="p-2 text-right text-xs font-medium text-gray-500 w-28">Đơn giá</th>
                          <th className="p-2 text-right text-xs font-medium text-gray-500 w-28">Thành tiền</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {orderItems.map((item, idx) => {
                          const amount = item.invoice_quantity * item.unit_price;
                          const disabled = item.remaining_quantity <= 0;

                          return (
                            <tr
                              key={item.id}
                              className={`${
                                disabled
                                  ? 'bg-gray-50 opacity-50'
                                  : item.selected
                                  ? 'bg-blue-50/30'
                                  : ''
                              }`}
                            >
                              <td className="p-2 text-center">
                                <input
                                  type="checkbox"
                                  checked={item.selected}
                                  disabled={disabled}
                                  onChange={() => toggleItem(idx)}
                                  className="rounded border-gray-300"
                                />
                              </td>
                              <td className="p-2">
                                <p className="font-medium text-gray-900 text-xs">
                                  {item.material_name}
                                </p>
                                {item.material_code && (
                                  <p className="text-xs text-gray-500">{item.material_code}</p>
                                )}
                              </td>
                              <td className="p-2 text-center text-xs text-gray-500">{item.unit}</td>
                              <td className="p-2 text-right text-xs">{item.quantity}</td>
                              <td className="p-2 text-right text-xs text-gray-500">
                                {item.invoiced_quantity}
                              </td>
                              <td className="p-2 text-center">
                                <input
                                  type="number"
                                  min={0}
                                  max={item.remaining_quantity}
                                  value={item.invoice_quantity}
                                  onChange={(e) =>
                                    updateQuantity(idx, parseFloat(e.target.value) || 0)
                                  }
                                  disabled={disabled}
                                  className="w-full px-2 py-1 text-center border border-gray-300 rounded text-xs focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
                                />
                              </td>
                              <td className="p-2 text-right text-xs">
                                {formatCurrency(item.unit_price)}
                              </td>
                              <td className="p-2 text-right text-xs font-medium">
                                {item.selected && item.invoice_quantity > 0
                                  ? formatCurrency(amount)
                                  : '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      {selectedItems.length > 0 && (
                        <tfoot className="bg-gray-50">
                          <tr>
                            <td colSpan={7} className="p-2 text-right text-xs font-medium text-gray-600">
                              Tạm tính:
                            </td>
                            <td className="p-2 text-right text-xs font-medium">{formatCurrency(subtotal)}</td>
                          </tr>
                          <tr>
                            <td colSpan={7} className="p-2 text-right text-xs text-gray-500">
                              VAT:
                            </td>
                            <td className="p-2 text-right text-xs">{formatCurrency(vatAmount)}</td>
                          </tr>
                          <tr>
                            <td colSpan={7} className="p-2 text-right text-sm font-bold text-gray-700">
                              Tổng:
                            </td>
                            <td className="p-2 text-right text-sm font-bold text-blue-600">
                              {formatCurrency(totalAmount)}
                            </td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                )}
              </div>

              {/* Image upload */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-blue-500" />
                  Ảnh hóa đơn ({images.length}/{MAX_IMAGES})
                </h4>

                {/* Previews */}
                {imagePreviews.length > 0 && (
                  <div className="flex gap-2 mb-3 flex-wrap">
                    {imagePreviews.map((preview, idx) => (
                      <div
                        key={idx}
                        className="relative w-20 h-20 rounded-lg border border-gray-200 overflow-hidden group"
                      >
                        {preview ? (
                          <img
                            src={preview}
                            alt={`Preview ${idx + 1}`}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full bg-gray-100 flex items-center justify-center">
                            <FileText className="w-6 h-6 text-gray-400" />
                          </div>
                        )}
                        <button
                          onClick={() => removeImage(idx)}
                          className="absolute top-0.5 right-0.5 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Upload button */}
                {images.length < MAX_IMAGES && (
                  <label className="flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-colors">
                    <Upload className="w-4 h-4 text-gray-400" />
                    <span className="text-sm text-gray-500">
                      Chọn ảnh hóa đơn (JPG, PNG, PDF - tối đa 10MB)
                    </span>
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      multiple
                      onChange={handleImageSelect}
                      className="hidden"
                    />
                  </label>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {step === 'fill_form' && (
          <div className="flex items-center justify-between p-5 border-t flex-shrink-0 bg-gray-50">
            <div className="text-sm">
              <span className="text-gray-500">Đã chọn: </span>
              <span className="font-semibold text-gray-900">
                {selectedItems.length} vật tư
              </span>
              {selectedItems.length > 0 && (
                <>
                  <span className="text-gray-400 mx-2">•</span>
                  <span className="font-bold text-blue-600">
                    {formatCurrency(totalAmount)}
                  </span>
                </>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleClose}
                disabled={saving}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Đóng
              </button>
              <button
                onClick={handleSubmit}
                disabled={saving || selectedItems.length === 0}
                className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {uploadingImages ? 'Đang tải ảnh...' : 'Đang lưu...'}
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Lưu hóa đơn
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default AddInvoiceModal;