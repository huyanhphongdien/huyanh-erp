// ============================================================================
// SUPPLIER DETAIL PAGE
// File: src/features/purchasing/pages/SupplierDetailPage.tsx
// Huy Anh ERP System - Module Quản lý đơn hàng
// ============================================================================

import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import {
  ArrowLeft,
  Edit,
  Trash2,
  Building2,
  User,
  Phone,
  Mail,
  Globe,
  MapPin,
  CreditCard,
  FileText,
  Users,
  ShoppingCart,
  Star,
  CheckCircle,
  XCircle,
  Ban,
  Loader2,
  AlertCircle,
  MoreVertical,
  ExternalLink
} from 'lucide-react';

// Import paths cho cấu trúc: src/features/purchasing/pages/
import { supplierService, type Supplier } from '../../../services/supplierService';
import { SupplierContacts } from './components/suppliers/SupplierContacts';
import { SupplierQuotations } from './components/suppliers/SupplierQuotations';

// ============================================================================
// TYPES
// ============================================================================

type TabType = 'info' | 'contacts' | 'quotations' | 'orders';

interface TabConfig {
  id: TabType;
  label: string;
  icon: React.ReactNode;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const TABS: TabConfig[] = [
  { id: 'info', label: 'Thông tin chung', icon: <Building2 size={18} /> },
  { id: 'contacts', label: 'Người liên hệ', icon: <Users size={18} /> },
  { id: 'quotations', label: 'Báo giá', icon: <FileText size={18} /> },
  { id: 'orders', label: 'Đơn hàng', icon: <ShoppingCart size={18} /> }
];

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

// Status Badge
const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const config: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
    active: { label: 'Hoạt động', className: 'bg-green-100 text-green-800', icon: <CheckCircle size={16} /> },
    inactive: { label: 'Tạm ngừng', className: 'bg-yellow-100 text-yellow-800', icon: <XCircle size={16} /> },
    blocked: { label: 'Đã khóa', className: 'bg-red-100 text-red-800', icon: <Ban size={16} /> }
  };
  const { label, className, icon } = config[status] || config.inactive;
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${className}`}>
      {icon}{label}
    </span>
  );
};

// Info Row
const InfoRow: React.FC<{ 
  icon: React.ReactNode; 
  label: string; 
  value?: string | number | null;
  isLink?: boolean;
}> = ({ icon, label, value, isLink }) => {
  if (!value) return null;
  
  return (
    <div className="flex items-start gap-3 py-3 border-b border-gray-100 last:border-0">
      <span className="text-gray-400 mt-0.5">{icon}</span>
      <div className="flex-1">
        <p className="text-xs text-gray-500 mb-0.5">{label}</p>
        {isLink ? (
          <a 
            href={value.toString().startsWith('http') ? value.toString() : `https://${value}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline flex items-center gap-1"
          >
            {value}
            <ExternalLink size={14} />
          </a>
        ) : (
          <p className="text-gray-900 font-medium">{value}</p>
        )}
      </div>
    </div>
  );
};

// Stat Card
const StatCard: React.FC<{
  label: string;
  value: string | number;
  subValue?: string;
  icon: React.ReactNode;
  color: string;
}> = ({ label, value, subValue, icon, color }) => (
  <div className={`bg-${color}-50 rounded-lg p-4`}>
    <div className="flex items-center gap-3">
      <div className={`p-2 bg-${color}-100 rounded-lg text-${color}-600`}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-sm text-gray-600">{label}</p>
        {subValue && <p className="text-xs text-gray-500">{subValue}</p>}
      </div>
    </div>
  </div>
);

// Rating Display
const RatingDisplay: React.FC<{ rating: number }> = ({ rating }) => (
  <div className="flex items-center gap-2">
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          size={20}
          className={star <= rating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'}
        />
      ))}
    </div>
    <span className="text-lg font-medium text-gray-700">{rating.toFixed(1)}</span>
  </div>
);

// ============================================================================
// TAB: THÔNG TIN CHUNG
// ============================================================================

const InfoTab: React.FC<{ supplier: Supplier }> = ({ supplier }) => {
  const formatCurrency = (value: number) => 
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left Column - Basic Info */}
      <div className="lg:col-span-2 space-y-6">
        {/* Company Info */}
        <div className="bg-white rounded-lg border p-6">
          <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Building2 size={20} className="text-blue-600" />
            Thông tin công ty
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
            <InfoRow icon={<FileText size={18} />} label="Mã NCC" value={supplier.code} />
            <InfoRow icon={<FileText size={18} />} label="Mã số thuế" value={supplier.tax_code} />
            <InfoRow icon={<Building2 size={18} />} label="Loại" value={supplier.supplier_type === 'company' ? 'Công ty' : 'Cá nhân'} />
            <InfoRow icon={<Star size={18} />} label="Nhóm" value={
              supplier.supplier_group === 'primary' ? 'NCC Chính' :
              supplier.supplier_group === 'secondary' ? 'NCC Phụ' : 'Dịch vụ'
            } />
          </div>
        </div>

        {/* Contact Info */}
        <div className="bg-white rounded-lg border p-6">
          <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Phone size={20} className="text-blue-600" />
            Thông tin liên hệ
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
            <InfoRow icon={<Phone size={18} />} label="Điện thoại" value={supplier.phone} />
            <InfoRow icon={<Mail size={18} />} label="Email" value={supplier.email} />
            <InfoRow icon={<Globe size={18} />} label="Website" value={supplier.website} isLink />
            <InfoRow icon={<MapPin size={18} />} label="Địa chỉ" value={
              [supplier.address, supplier.ward, supplier.district, supplier.province]
                .filter(Boolean).join(', ')
            } />
          </div>

          {/* Primary Contact */}
          {supplier.contact_name && (
            <div className="mt-6 pt-6 border-t">
              <h4 className="font-medium text-gray-700 mb-3">Người liên hệ chính</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
                <InfoRow icon={<User size={18} />} label="Họ tên" value={supplier.contact_name} />
                <InfoRow icon={<FileText size={18} />} label="Chức vụ" value={supplier.contact_position} />
                <InfoRow icon={<Phone size={18} />} label="Điện thoại" value={supplier.contact_phone} />
                <InfoRow icon={<Mail size={18} />} label="Email" value={supplier.contact_email} />
              </div>
            </div>
          )}
        </div>

        {/* Bank Info */}
        {supplier.bank_name && (
          <div className="bg-white rounded-lg border p-6">
            <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <CreditCard size={20} className="text-blue-600" />
              Thông tin ngân hàng
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
              <InfoRow icon={<Building2 size={18} />} label="Ngân hàng" value={supplier.bank_name} />
              <InfoRow icon={<MapPin size={18} />} label="Chi nhánh" value={supplier.bank_branch} />
              <InfoRow icon={<CreditCard size={18} />} label="Số tài khoản" value={supplier.bank_account} />
              <InfoRow icon={<User size={18} />} label="Chủ tài khoản" value={supplier.bank_holder} />
            </div>
          </div>
        )}

        {/* Payment Terms */}
        <div className="bg-white rounded-lg border p-6">
          <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <FileText size={20} className="text-blue-600" />
            Điều khoản thanh toán
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
            <InfoRow 
              icon={<FileText size={18} />} 
              label="Thời hạn thanh toán" 
              value={supplier.payment_terms === 0 ? 'Thanh toán ngay' : `${supplier.payment_terms} ngày`} 
            />
            <InfoRow 
              icon={<CreditCard size={18} />} 
              label="Hạn mức công nợ" 
              value={supplier.credit_limit > 0 ? formatCurrency(supplier.credit_limit) : 'Không giới hạn'} 
            />
          </div>

          {supplier.notes && (
            <div className="mt-4 pt-4 border-t">
              <p className="text-xs text-gray-500 mb-1">Ghi chú</p>
              <p className="text-gray-700 whitespace-pre-wrap">{supplier.notes}</p>
            </div>
          )}
        </div>
      </div>

      {/* Right Column - Stats */}
      <div className="space-y-6">
        {/* Rating */}
        <div className="bg-white rounded-lg border p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Đánh giá</h3>
          <RatingDisplay rating={supplier.rating || 0} />
        </div>

        {/* Statistics */}
        <div className="bg-white rounded-lg border p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Thống kê</h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center py-2 border-b">
              <span className="text-gray-600">Tổng đơn hàng</span>
              <span className="font-semibold text-gray-900">{supplier.total_orders || 0}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b">
              <span className="text-gray-600">Tổng giá trị</span>
              <span className="font-semibold text-gray-900">{formatCurrency(supplier.total_order_value || 0)}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b">
              <span className="text-gray-600">Đã thanh toán</span>
              <span className="font-semibold text-green-600">{formatCurrency(supplier.total_paid || 0)}</span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-gray-600">Công nợ</span>
              <span className={`font-semibold ${supplier.total_debt > 0 ? 'text-red-600' : 'text-gray-900'}`}>
                {formatCurrency(supplier.total_debt || 0)}
              </span>
            </div>
          </div>
        </div>

        {/* Last Order */}
        {supplier.last_order_date && (
          <div className="bg-white rounded-lg border p-6">
            <h3 className="font-semibold text-gray-900 mb-2">Đơn hàng gần nhất</h3>
            <p className="text-gray-600">
              {new Date(supplier.last_order_date).toLocaleDateString('vi-VN', {
                day: '2-digit',
                month: '2-digit', 
                year: 'numeric'
              })}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// TAB: ĐƠN HÀNG (PLACEHOLDER)
// ============================================================================

const OrdersTab: React.FC<{ supplierId: string }> = ({ supplierId }) => (
  <div className="bg-white rounded-lg border p-8 text-center">
    <ShoppingCart className="mx-auto h-12 w-12 text-gray-400 mb-4" />
    <h3 className="text-lg font-medium text-gray-900 mb-2">Lịch sử đơn hàng</h3>
    <p className="text-gray-500 mb-4">
      Tính năng này sẽ được phát triển trong Phase 3 - Quản lý đơn hàng
    </p>
    <p className="text-sm text-gray-400">Supplier ID: {supplierId}</p>
  </div>
);

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const SupplierDetailPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const location = useLocation();

  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('info');
  const [showActions, setShowActions] = useState(false);
  
  // Delete
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Success message from navigation state
  const successMessage = location.state?.message;

  // ==========================================
  // LOAD DATA
  // ==========================================

  const loadSupplier = async () => {
    if (!id) {
      setError('ID nhà cung cấp không hợp lệ');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await supplierService.getById(id);
      if (!data) {
        setError('Không tìm thấy nhà cung cấp');
      } else {
        setSupplier(data);
      }
    } catch (err) {
      console.error('Load supplier error:', err);
      setError('Không thể tải thông tin nhà cung cấp');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSupplier();
  }, [id]);

  // Clear success message after showing
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => {
        navigate(location.pathname, { replace: true, state: {} });
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  // ==========================================
  // HANDLERS
  // ==========================================

  const handleEdit = () => {
    navigate(`/purchasing/suppliers/${id}/edit`);
  };

  const handleDelete = async () => {
    if (!id) return;

    try {
      setDeleting(true);
      await supplierService.delete(id);
      navigate('/purchasing/suppliers', {
        state: { message: 'Đã xóa nhà cung cấp thành công!' }
      });
    } catch (err) {
      console.error('Delete supplier error:', err);
      alert('Không thể xóa nhà cung cấp');
    } finally {
      setDeleting(false);
      setDeleteConfirm(false);
    }
  };

  // ==========================================
  // RENDER
  // ==========================================

  // Loading
  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="mx-auto h-10 w-10 text-blue-600 animate-spin" />
          <p className="mt-2 text-gray-500">Đang tải thông tin...</p>
        </div>
      </div>
    );
  }

  // Error
  if (error || !supplier) {
    return (
      <div className="p-6">
        <div className="max-w-md mx-auto text-center">
          <div className="p-4 bg-red-50 rounded-full w-16 h-16 mx-auto flex items-center justify-center mb-4">
            <AlertCircle className="text-red-500" size={32} />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Lỗi</h2>
          <p className="text-gray-600 mb-6">{error || 'Không tìm thấy nhà cung cấp'}</p>
          <button
            onClick={() => navigate('/purchasing/suppliers')}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Quay lại danh sách
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Success Message */}
      {successMessage && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-700">
          <CheckCircle size={20} />
          {successMessage}
        </div>
      )}

      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate('/purchasing/suppliers')}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-4"
        >
          <ArrowLeft size={20} />
          Quay lại danh sách
        </button>

        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="p-4 bg-blue-100 rounded-xl">
              <Building2 className="text-blue-600" size={32} />
            </div>
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-2xl font-bold text-gray-900">{supplier.name}</h1>
                <StatusBadge status={supplier.status} />
              </div>
              <div className="flex items-center gap-4 text-gray-500">
                <span>{supplier.code}</span>
                {supplier.tax_code && (
                  <>
                    <span>•</span>
                    <span>MST: {supplier.tax_code}</span>
                  </>
                )}
                {supplier.short_name && (
                  <>
                    <span>•</span>
                    <span>{supplier.short_name}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleEdit}
              className="inline-flex items-center gap-2 px-4 py-2 border rounded-lg hover:bg-gray-50"
            >
              <Edit size={18} />
              Chỉnh sửa
            </button>
            
            <div className="relative">
              <button
                onClick={() => setShowActions(!showActions)}
                className="p-2 border rounded-lg hover:bg-gray-50"
              >
                <MoreVertical size={20} />
              </button>
              
              {showActions && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowActions(false)} />
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border z-20">
                    <button
                      onClick={() => {
                        setDeleteConfirm(true);
                        setShowActions(false);
                      }}
                      className="flex items-center gap-2 w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg"
                    >
                      <Trash2 size={16} />
                      Xóa nhà cung cấp
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b mb-6">
        <div className="flex gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'info' && <InfoTab supplier={supplier} />}
      {activeTab === 'contacts' && <SupplierContacts supplierId={supplier.id} />}
      {activeTab === 'quotations' && <SupplierQuotations supplierId={supplier.id} />}
      {activeTab === 'orders' && <OrdersTab supplierId={supplier.id} />}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <div className="flex items-center gap-3 text-red-600 mb-4">
              <AlertCircle size={24} />
              <h3 className="text-lg font-semibold">Xác nhận xóa</h3>
            </div>
            <p className="text-gray-600 mb-6">
              Bạn có chắc muốn xóa nhà cung cấp <strong>{supplier.name}</strong>?
              <br />
              <span className="text-sm text-gray-500">Hành động này không thể hoàn tác.</span>
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirm(false)}
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

export default SupplierDetailPage;