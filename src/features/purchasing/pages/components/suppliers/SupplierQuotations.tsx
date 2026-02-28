// ============================================================================
// SUPPLIER QUOTATIONS COMPONENT
// File: src/features/purchasing/pages/components/suppliers/SupplierQuotations.tsx
// Huy Anh ERP System - Module Quản lý đơn hàng
// ============================================================================

import React, { useState, useEffect, useRef } from 'react';
import {
  Plus,
  Edit,
  Trash2,
  FileText,
  Upload,
  Download,
  Eye,
  Calendar,
  DollarSign,
  MoreVertical,
  X,
  Save,
  AlertCircle,
  Loader2,
  CheckCircle,
  Clock,
  XCircle,
  File,
  FileImage,
  FileSpreadsheet
} from 'lucide-react';

// Import path: 5 cấp lên từ components/suppliers/
import { 
  supplierService, 
  type SupplierQuotation,
  type SupplierQuotationFormData 
} from '../../../../../services/supplierService';

// ============================================================================
// TYPES
// ============================================================================

interface SupplierQuotationsProps {
  supplierId: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const STATUS_OPTIONS = [
  { value: 'active', label: 'Còn hiệu lực', color: 'green' },
  { value: 'expired', label: 'Hết hạn', color: 'red' },
  { value: 'superseded', label: 'Đã thay thế', color: 'yellow' },
  { value: 'cancelled', label: 'Đã hủy', color: 'gray' }
];

const ALLOWED_FILE_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/png',
  'image/gif'
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const getFileIcon = (fileType?: string): React.ReactNode => {
  if (!fileType) return <File size={20} />;
  if (fileType.includes('pdf')) return <FileText size={20} className="text-red-500" />;
  if (fileType.includes('image')) return <FileImage size={20} className="text-blue-500" />;
  if (fileType.includes('sheet') || fileType.includes('excel')) return <FileSpreadsheet size={20} className="text-green-500" />;
  return <FileText size={20} className="text-gray-500" />;
};

const isExpired = (validUntil?: string | null): boolean => {
  if (!validUntil) return false;
  return new Date(validUntil) < new Date();
};

// ============================================================================
// QUOTATION FORM MODAL
// ============================================================================

interface QuotationFormModalProps {
  supplierId: string;
  quotation?: SupplierQuotation | null;
  onClose: () => void;
  onSuccess: () => void;
}

const QuotationFormModal: React.FC<QuotationFormModalProps> = ({
  supplierId,
  quotation,
  onClose,
  onSuccess
}) => {
  const isEditMode = !!quotation;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState<SupplierQuotationFormData>({
    supplier_id: supplierId,
    quotation_number: '',
    quotation_date: new Date().toISOString().split('T')[0],
    valid_until: '',
    title: '',
    description: '',
    total_amount: undefined,
    currency: 'VND',
    status: 'active',
    notes: ''
  });

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (quotation) {
      setFormData({
        supplier_id: supplierId,
        quotation_number: quotation.quotation_number || '',
        quotation_date: quotation.quotation_date?.split('T')[0] || '',
        valid_until: quotation.valid_until?.split('T')[0] || '',
        title: quotation.title || '',
        description: quotation.description || '',
        file_url: quotation.file_url,
        file_name: quotation.file_name,
        file_size: quotation.file_size,
        file_type: quotation.file_type,
        total_amount: quotation.total_amount,
        currency: quotation.currency || 'VND',
        status: quotation.status || 'active',
        notes: quotation.notes || ''
      });
    }
  }, [quotation, supplierId]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? (value === '' ? undefined : Number(value)) : value
    }));
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!ALLOWED_FILE_TYPES.includes(file.type)) {
      setError('Loại file không được hỗ trợ. Chỉ chấp nhận PDF, Word, Excel, và hình ảnh.');
      return;
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      setError('File quá lớn. Kích thước tối đa là 10MB.');
      return;
    }

    setSelectedFile(file);
    setError(null);
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.quotation_date) {
      setError('Vui lòng nhập ngày báo giá');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      let fileData = {
        file_url: formData.file_url,
        file_name: formData.file_name,
        file_size: formData.file_size,
        file_type: formData.file_type
      };

      // Upload new file if selected
      if (selectedFile) {
        setUploading(true);
        const uploadResult = await supplierService.uploadQuotationFile(supplierId, selectedFile);
        fileData = {
          file_url: uploadResult.url,
          file_name: uploadResult.fileName,
          file_size: uploadResult.fileSize,
          file_type: uploadResult.fileType
        };
        setUploading(false);
      }

      const dataToSave: SupplierQuotationFormData = {
        ...formData,
        ...fileData
      };

      if (isEditMode && quotation) {
        await supplierService.updateQuotation(quotation.id, dataToSave);
      } else {
        await supplierService.createQuotation(dataToSave);
      }
      
      onSuccess();
    } catch (err: any) {
      console.error('Save quotation error:', err);
      setError(err.message || 'Không thể lưu báo giá');
    } finally {
      setLoading(false);
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white">
          <h3 className="text-lg font-semibold">
            {isEditMode ? 'Chỉnh sửa báo giá' : 'Thêm báo giá mới'}
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          {/* Quotation Number & Title */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Số báo giá</label>
              <input
                type="text"
                name="quotation_number"
                value={formData.quotation_number}
                onChange={handleChange}
                placeholder="BG-2026-001"
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Trạng thái</label>
              <select
                name="status"
                value={formData.status}
                onChange={handleChange}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {STATUS_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tiêu đề</label>
            <input
              type="text"
              name="title"
              value={formData.title}
              onChange={handleChange}
              placeholder="Báo giá vật liệu xây dựng Q1/2026"
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Ngày báo giá <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                name="quotation_date"
                value={formData.quotation_date}
                onChange={handleChange}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Hiệu lực đến</label>
              <input
                type="date"
                name="valid_until"
                value={formData.valid_until}
                onChange={handleChange}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Amount */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tổng giá trị</label>
              <input
                type="number"
                name="total_amount"
                value={formData.total_amount || ''}
                onChange={handleChange}
                min={0}
                placeholder="0"
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Đơn vị tiền</label>
              <select
                name="currency"
                value={formData.currency}
                onChange={handleChange}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="VND">VND</option>
                <option value="USD">USD</option>
              </select>
            </div>
          </div>

          {/* File Upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">File đính kèm</label>
            
            {/* Existing file */}
            {formData.file_url && !selectedFile && (
              <div className="mb-2 p-3 bg-gray-50 border rounded-lg flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {getFileIcon(formData.file_type)}
                  <div>
                    <p className="text-sm font-medium">{formData.file_name}</p>
                    {formData.file_size && (
                      <p className="text-xs text-gray-500">{formatFileSize(formData.file_size)}</p>
                    )}
                  </div>
                </div>
                <a
                  href={formData.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline text-sm"
                >
                  Xem file
                </a>
              </div>
            )}

            {/* New file selected */}
            {selectedFile && (
              <div className="mb-2 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {getFileIcon(selectedFile.type)}
                  <div>
                    <p className="text-sm font-medium text-blue-700">{selectedFile.name}</p>
                    <p className="text-xs text-blue-600">{formatFileSize(selectedFile.size)}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleRemoveFile}
                  className="text-red-500 hover:text-red-700"
                >
                  <X size={18} />
                </button>
              </div>
            )}

            {/* Upload button */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif"
              onChange={handleFileSelect}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-blue-400 hover:text-blue-500 flex items-center justify-center gap-2"
            >
              <Upload size={20} />
              {selectedFile || formData.file_url ? 'Thay đổi file' : 'Chọn file để upload'}
            </button>
            <p className="text-xs text-gray-500 mt-1">
              Hỗ trợ: PDF, Word, Excel, hình ảnh. Tối đa 10MB.
            </p>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Mô tả</label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              rows={2}
              placeholder="Mô tả nội dung báo giá..."
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ghi chú</label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              rows={2}
              placeholder="Ghi chú thêm..."
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 border rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={loading || uploading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
            >
              {(loading || uploading) ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  {uploading ? 'Đang upload...' : 'Đang lưu...'}
                </>
              ) : (
                <>
                  <Save size={18} />
                  {isEditMode ? 'Cập nhật' : 'Thêm mới'}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ============================================================================
// QUOTATION CARD
// ============================================================================

interface QuotationCardProps {
  quotation: SupplierQuotation;
  onEdit: () => void;
  onDelete: () => void;
}

const QuotationCard: React.FC<QuotationCardProps> = ({
  quotation,
  onEdit,
  onDelete
}) => {
  const [showMenu, setShowMenu] = useState(false);

  const expired = isExpired(quotation.valid_until);
  const statusConfig = STATUS_OPTIONS.find(s => s.value === quotation.status) || STATUS_OPTIONS[0];

  const formatCurrency = (amount: number, currency: string = 'VND') => {
    return new Intl.NumberFormat('vi-VN', { 
      style: 'currency', 
      currency 
    }).format(amount);
  };

  return (
    <div className={`bg-white rounded-lg border p-4 ${expired && quotation.status === 'active' ? 'border-red-200' : ''}`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${expired ? 'bg-red-100' : 'bg-blue-100'}`}>
            <FileText size={20} className={expired ? 'text-red-600' : 'text-blue-600'} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-medium text-gray-900">
                {quotation.title || quotation.quotation_number || 'Báo giá'}
              </h4>
            </div>
            {quotation.quotation_number && quotation.title && (
              <p className="text-sm text-gray-500">{quotation.quotation_number}</p>
            )}
          </div>
        </div>

        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-1 hover:bg-gray-100 rounded"
          >
            <MoreVertical size={18} />
          </button>

          {showMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
              <div className="absolute right-0 mt-1 w-40 bg-white rounded-lg shadow-lg border z-20">
                {quotation.file_url && (
                  <a
                    href={quotation.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
                    onClick={() => setShowMenu(false)}
                  >
                    <Eye size={14} />
                    Xem file
                  </a>
                )}
                <button
                  onClick={() => { onEdit(); setShowMenu(false); }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
                >
                  <Edit size={14} />
                  Chỉnh sửa
                </button>
                <hr />
                <button
                  onClick={() => { onDelete(); setShowMenu(false); }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                >
                  <Trash2 size={14} />
                  Xóa
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Info */}
      <div className="space-y-2 text-sm">
        {/* Dates */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1 text-gray-600">
            <Calendar size={14} className="text-gray-400" />
            {new Date(quotation.quotation_date).toLocaleDateString('vi-VN')}
          </div>
          {quotation.valid_until && (
            <div className={`flex items-center gap-1 ${expired ? 'text-red-600' : 'text-gray-600'}`}>
              <Clock size={14} className={expired ? 'text-red-400' : 'text-gray-400'} />
              HSD: {new Date(quotation.valid_until).toLocaleDateString('vi-VN')}
              {expired && <span className="text-xs">(Hết hạn)</span>}
            </div>
          )}
        </div>

        {/* Amount */}
        {quotation.total_amount && (
          <div className="flex items-center gap-1 text-gray-900 font-medium">
            <DollarSign size={14} className="text-gray-400" />
            {formatCurrency(quotation.total_amount, quotation.currency)}
          </div>
        )}

        {/* File */}
        {quotation.file_url && (
          <a
            href={quotation.file_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-blue-600 hover:underline"
          >
            {getFileIcon(quotation.file_type)}
            <span className="truncate">{quotation.file_name}</span>
            {quotation.file_size && (
              <span className="text-gray-400 text-xs">({formatFileSize(quotation.file_size)})</span>
            )}
          </a>
        )}

        {/* Description */}
        {quotation.description && (
          <p className="text-gray-500 line-clamp-2">{quotation.description}</p>
        )}
      </div>

      {/* Status Badge */}
      <div className="mt-3 pt-3 border-t flex items-center justify-between">
        <span className={`px-2 py-1 bg-${statusConfig.color}-100 text-${statusConfig.color}-700 text-xs rounded font-medium`}>
          {statusConfig.label}
        </span>
        <span className="text-xs text-gray-400">
          {new Date(quotation.created_at).toLocaleDateString('vi-VN')}
        </span>
      </div>
    </div>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const SupplierQuotations: React.FC<SupplierQuotationsProps> = ({ supplierId }) => {
  const [quotations, setQuotations] = useState<SupplierQuotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Modal states
  const [showForm, setShowForm] = useState(false);
  const [editingQuotation, setEditingQuotation] = useState<SupplierQuotation | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<SupplierQuotation | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ==========================================
  // LOAD DATA
  // ==========================================

  const loadQuotations = async () => {
    try {
      setLoading(true);
      setError(null);
      const status = statusFilter !== 'all' ? statusFilter : undefined;
      const data = await supplierService.getQuotations(supplierId, status);
      setQuotations(data);
    } catch (err) {
      console.error('Load quotations error:', err);
      setError('Không thể tải danh sách báo giá');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQuotations();
  }, [supplierId, statusFilter]);

  // ==========================================
  // HANDLERS
  // ==========================================

  const handleAdd = () => {
    setEditingQuotation(null);
    setShowForm(true);
  };

  const handleEdit = (quotation: SupplierQuotation) => {
    setEditingQuotation(quotation);
    setShowForm(true);
  };

  const handleFormSuccess = () => {
    setShowForm(false);
    setEditingQuotation(null);
    loadQuotations();
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;

    try {
      setDeleting(true);
      
      // Delete file from storage if exists
      if (deleteConfirm.file_url) {
        await supplierService.deleteQuotationFile(deleteConfirm.file_url);
      }
      
      await supplierService.deleteQuotation(deleteConfirm.id);
      setDeleteConfirm(null);
      loadQuotations();
    } catch (err) {
      console.error('Delete quotation error:', err);
      alert('Không thể xóa báo giá');
    } finally {
      setDeleting(false);
    }
  };

  // ==========================================
  // RENDER
  // ==========================================

  if (loading) {
    return (
      <div className="bg-white rounded-lg border p-8 text-center">
        <Loader2 className="mx-auto h-8 w-8 text-blue-600 animate-spin" />
        <p className="mt-2 text-gray-500">Đang tải...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg border p-8 text-center">
        <AlertCircle className="mx-auto h-8 w-8 text-red-500" />
        <p className="mt-2 text-red-600">{error}</p>
        <button onClick={loadQuotations} className="mt-4 text-blue-600 hover:underline">
          Thử lại
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <h3 className="font-semibold text-gray-900">
            Báo giá ({quotations.length})
          </h3>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-sm border rounded-lg px-3 py-1.5"
          >
            <option value="all">Tất cả</option>
            {STATUS_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <button
          onClick={handleAdd}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus size={18} />
          Thêm báo giá
        </button>
      </div>

      {/* Quotations Grid */}
      {quotations.length === 0 ? (
        <div className="bg-white rounded-lg border p-8 text-center">
          <FileText className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 font-medium text-gray-900">Chưa có báo giá</h3>
          <p className="mt-1 text-gray-500">Thêm báo giá đầu tiên từ nhà cung cấp này</p>
          <button
            onClick={handleAdd}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus size={18} />
            Thêm báo giá
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {quotations.map(quotation => (
            <QuotationCard
              key={quotation.id}
              quotation={quotation}
              onEdit={() => handleEdit(quotation)}
              onDelete={() => setDeleteConfirm(quotation)}
            />
          ))}
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <QuotationFormModal
          supplierId={supplierId}
          quotation={editingQuotation}
          onClose={() => { setShowForm(false); setEditingQuotation(null); }}
          onSuccess={handleFormSuccess}
        />
      )}

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <div className="flex items-center gap-3 text-red-600 mb-4">
              <AlertCircle size={24} />
              <h3 className="text-lg font-semibold">Xác nhận xóa</h3>
            </div>
            <p className="text-gray-600 mb-6">
              Bạn có chắc muốn xóa báo giá <strong>{deleteConfirm.title || deleteConfirm.quotation_number || 'này'}</strong>?
              {deleteConfirm.file_url && (
                <span className="block text-sm text-gray-500 mt-1">File đính kèm cũng sẽ bị xóa.</span>
              )}
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                disabled={deleting}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                Hủy
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? 'Đang xóa...' : 'Xóa'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SupplierQuotations;