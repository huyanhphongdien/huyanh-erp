// ============================================================================
// SUPPLIER FORM
// File: src/features/purchasing/components/SupplierForm.tsx
// Huy Anh ERP System - Module Quản lý đơn hàng
// ============================================================================

import React, { useState, useEffect } from 'react';
import {
  Building2,
  User,
  Phone,
  Mail,
  Globe,
  MapPin,
  CreditCard,
  FileText,
  Save,
  X,
  AlertCircle,
  CheckCircle,
  Loader2
} from 'lucide-react';

// File: src/features/purchasing/pages/components/suppliers/SupplierForm.tsx
// Service: src/services/supplierService.ts
// Path: 5 cấp lên (../../../../../)
import { supplierService, type Supplier, type SupplierFormData } from '../../../../../services/supplierService';

// ============================================================================
// TYPES
// ============================================================================

interface SupplierFormProps {
  supplier?: Supplier | null;  // null = create mode
  onSuccess: (supplier: Supplier) => void;
  onCancel: () => void;
}

interface FormErrors {
  name?: string;
  code?: string;
  tax_code?: string;
  email?: string;
  phone?: string;
  general?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const SUPPLIER_TYPES = [
  { value: 'company', label: 'Công ty', icon: Building2 },
  { value: 'individual', label: 'Cá nhân', icon: User }
];

const SUPPLIER_GROUPS = [
  { value: 'primary', label: 'NCC Chính', description: 'Nhà cung cấp chính, ưu tiên đặt hàng' },
  { value: 'secondary', label: 'NCC Phụ', description: 'Nhà cung cấp dự phòng' },
  { value: 'service', label: 'Dịch vụ', description: 'Cung cấp dịch vụ (vận chuyển, bảo trì...)' }
];

const PAYMENT_TERMS_OPTIONS = [
  { value: 0, label: 'Thanh toán ngay' },
  { value: 7, label: '7 ngày' },
  { value: 15, label: '15 ngày' },
  { value: 30, label: '30 ngày' },
  { value: 45, label: '45 ngày' },
  { value: 60, label: '60 ngày' },
  { value: 90, label: '90 ngày' }
];

const PROVINCES = [
  'An Giang', 'Bà Rịa - Vũng Tàu', 'Bắc Giang', 'Bắc Kạn', 'Bạc Liêu',
  'Bắc Ninh', 'Bến Tre', 'Bình Định', 'Bình Dương', 'Bình Phước',
  'Bình Thuận', 'Cà Mau', 'Cần Thơ', 'Cao Bằng', 'Đà Nẵng',
  'Đắk Lắk', 'Đắk Nông', 'Điện Biên', 'Đồng Nai', 'Đồng Tháp',
  'Gia Lai', 'Hà Giang', 'Hà Nam', 'Hà Nội', 'Hà Tĩnh',
  'Hải Dương', 'Hải Phòng', 'Hậu Giang', 'Hòa Bình', 'Hưng Yên',
  'Khánh Hòa', 'Kiên Giang', 'Kon Tum', 'Lai Châu', 'Lâm Đồng',
  'Lạng Sơn', 'Lào Cai', 'Long An', 'Nam Định', 'Nghệ An',
  'Ninh Bình', 'Ninh Thuận', 'Phú Thọ', 'Phú Yên', 'Quảng Bình',
  'Quảng Nam', 'Quảng Ngãi', 'Quảng Ninh', 'Quảng Trị', 'Sóc Trăng',
  'Sơn La', 'Tây Ninh', 'Thái Bình', 'Thái Nguyên', 'Thanh Hóa',
  'Thừa Thiên Huế', 'Tiền Giang', 'TP. Hồ Chí Minh', 'Trà Vinh', 'Tuyên Quang',
  'Vĩnh Long', 'Vĩnh Phúc', 'Yên Bái'
];

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

// Form Section
const FormSection: React.FC<{
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, icon, children }) => (
  <div className="bg-white rounded-lg border p-6">
    <div className="flex items-center gap-2 mb-4 pb-4 border-b">
      <span className="text-blue-600">{icon}</span>
      <h3 className="font-semibold text-gray-900">{title}</h3>
    </div>
    {children}
  </div>
);

// Form Field
const FormField: React.FC<{
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
  className?: string;
}> = ({ label, required, error, children, className = '' }) => (
  <div className={className}>
    <label className="block text-sm font-medium text-gray-700 mb-1">
      {label}
      {required && <span className="text-red-500 ml-1">*</span>}
    </label>
    {children}
    {error && (
      <p className="mt-1 text-sm text-red-500 flex items-center gap-1">
        <AlertCircle size={14} />
        {error}
      </p>
    )}
  </div>
);

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const SupplierForm: React.FC<SupplierFormProps> = ({
  supplier,
  onSuccess,
  onCancel
}) => {
  const isEditMode = !!supplier;

  // Form state
  const [formData, setFormData] = useState<SupplierFormData>({
    name: '',
    short_name: '',
    supplier_type: 'company',
    supplier_group: 'primary',
    tax_code: '',
    phone: '',
    email: '',
    website: '',
    address: '',
    province: '',
    district: '',
    ward: '',
    bank_name: '',
    bank_account: '',
    bank_branch: '',
    bank_holder: '',
    payment_terms: 30,
    credit_limit: 0,
    contact_name: '',
    contact_phone: '',
    contact_email: '',
    contact_position: '',
    notes: '',
    status: 'active'
  });

  const [errors, setErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);

  // ==========================================
  // EFFECTS
  // ==========================================

  // Load supplier data for edit mode
  useEffect(() => {
    if (supplier) {
      setFormData({
        name: supplier.name || '',
        short_name: supplier.short_name || '',
        supplier_type: supplier.supplier_type || 'company',
        supplier_group: supplier.supplier_group || 'primary',
        tax_code: supplier.tax_code || '',
        phone: supplier.phone || '',
        email: supplier.email || '',
        website: supplier.website || '',
        address: supplier.address || '',
        province: supplier.province || '',
        district: supplier.district || '',
        ward: supplier.ward || '',
        bank_name: supplier.bank_name || '',
        bank_account: supplier.bank_account || '',
        bank_branch: supplier.bank_branch || '',
        bank_holder: supplier.bank_holder || '',
        payment_terms: supplier.payment_terms || 30,
        credit_limit: supplier.credit_limit || 0,
        contact_name: supplier.contact_name || '',
        contact_phone: supplier.contact_phone || '',
        contact_email: supplier.contact_email || '',
        contact_position: supplier.contact_position || '',
        notes: supplier.notes || '',
        status: supplier.status || 'active'
      });
    }
  }, [supplier]);

  // ==========================================
  // HANDLERS
  // ==========================================

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value, type } = e.target;
    
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'number' ? (value === '' ? 0 : Number(value)) : value
    }));

    // Clear error when field changes
    if (errors[name as keyof FormErrors]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  };

  const handleTypeChange = (type: 'company' | 'individual') => {
    setFormData((prev) => ({ ...prev, supplier_type: type }));
  };

  const handleGroupChange = (group: 'primary' | 'secondary' | 'service') => {
    setFormData((prev) => ({ ...prev, supplier_group: group }));
  };

  // ==========================================
  // VALIDATION
  // ==========================================

  const validate = async (): Promise<boolean> => {
    const newErrors: FormErrors = {};

    // Required fields
    if (!formData.name?.trim()) {
      newErrors.name = 'Vui lòng nhập tên nhà cung cấp';
    }

    // Email format
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Email không hợp lệ';
    }

    // Phone format (Vietnamese)
    if (formData.phone && !/^[0-9]{10,11}$/.test(formData.phone.replace(/[^0-9]/g, ''))) {
      newErrors.phone = 'Số điện thoại không hợp lệ';
    }

    // Check duplicate tax code
    if (formData.tax_code?.trim()) {
      setChecking(true);
      try {
        const exists = await supplierService.checkTaxCodeExists(
          formData.tax_code,
          supplier?.id
        );
        if (exists) {
          newErrors.tax_code = 'Mã số thuế đã tồn tại';
        }
      } catch (err) {
        console.error('Check tax code error:', err);
      } finally {
        setChecking(false);
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // ==========================================
  // SUBMIT
  // ==========================================

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const isValid = await validate();
    if (!isValid) return;

    setLoading(true);
    setErrors({});

    try {
      let result: Supplier;

      if (isEditMode && supplier) {
        result = await supplierService.update(supplier.id, formData);
      } else {
        result = await supplierService.create(formData);
      }

      onSuccess(result);
    } catch (err: any) {
      console.error('Save supplier error:', err);
      setErrors({
        general: err.message || 'Không thể lưu nhà cung cấp. Vui lòng thử lại.'
      });
    } finally {
      setLoading(false);
    }
  };

  // ==========================================
  // RENDER
  // ==========================================

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* General Error */}
      {errors.general && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-2 text-red-700">
          <AlertCircle size={20} />
          {errors.general}
        </div>
      )}

      {/* Basic Information */}
      <FormSection title="Thông tin cơ bản" icon={<Building2 size={20} />}>
        {/* Supplier Type */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Loại nhà cung cấp <span className="text-red-500">*</span>
          </label>
          <div className="grid grid-cols-2 gap-4">
            {SUPPLIER_TYPES.map((type) => {
              const Icon = type.icon;
              const isSelected = formData.supplier_type === type.value;
              return (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => handleTypeChange(type.value as 'company' | 'individual')}
                  className={`flex items-center gap-3 p-4 rounded-lg border-2 transition-colors ${
                    isSelected
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className={`p-2 rounded-lg ${isSelected ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>
                    <Icon size={24} />
                  </div>
                  <span className={`font-medium ${isSelected ? 'text-blue-700' : 'text-gray-700'}`}>
                    {type.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Supplier Group */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Nhóm nhà cung cấp <span className="text-red-500">*</span>
          </label>
          <div className="grid grid-cols-3 gap-4">
            {SUPPLIER_GROUPS.map((group) => {
              const isSelected = formData.supplier_group === group.value;
              return (
                <button
                  key={group.value}
                  type="button"
                  onClick={() => handleGroupChange(group.value as 'primary' | 'secondary' | 'service')}
                  className={`p-4 rounded-lg border-2 text-left transition-colors ${
                    isSelected
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <span className={`font-medium ${isSelected ? 'text-blue-700' : 'text-gray-700'}`}>
                    {group.label}
                  </span>
                  <p className="text-xs text-gray-500 mt-1">{group.description}</p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Name */}
          <FormField label="Tên nhà cung cấp" required error={errors.name} className="md:col-span-2">
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="VD: Công ty TNHH Xi măng Holcim Việt Nam"
              className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.name ? 'border-red-300' : 'border-gray-300'
              }`}
            />
          </FormField>

          {/* Short Name */}
          <FormField label="Tên viết tắt">
            <input
              type="text"
              name="short_name"
              value={formData.short_name}
              onChange={handleChange}
              placeholder="VD: Holcim"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </FormField>

          {/* Tax Code */}
          <FormField label="Mã số thuế" error={errors.tax_code}>
            <div className="relative">
              <input
                type="text"
                name="tax_code"
                value={formData.tax_code}
                onChange={handleChange}
                placeholder="VD: 0302080428"
                className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.tax_code ? 'border-red-300' : 'border-gray-300'
                }`}
              />
              {checking && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-gray-400" size={18} />
              )}
            </div>
          </FormField>
        </div>
      </FormSection>

      {/* Contact Information */}
      <FormSection title="Thông tin liên hệ" icon={<Phone size={20} />}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Phone */}
          <FormField label="Số điện thoại" error={errors.phone}>
            <input
              type="tel"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              placeholder="VD: 028 3824 5888"
              className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.phone ? 'border-red-300' : 'border-gray-300'
              }`}
            />
          </FormField>

          {/* Email */}
          <FormField label="Email" error={errors.email}>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="VD: contact@holcim.com.vn"
              className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.email ? 'border-red-300' : 'border-gray-300'
              }`}
            />
          </FormField>

          {/* Website */}
          <FormField label="Website" className="md:col-span-2">
            <input
              type="url"
              name="website"
              value={formData.website}
              onChange={handleChange}
              placeholder="VD: https://www.holcim.com.vn"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </FormField>
        </div>

        {/* Primary Contact */}
        <div className="mt-6 pt-6 border-t">
          <h4 className="font-medium text-gray-700 mb-4">Người liên hệ chính</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Họ tên">
              <input
                type="text"
                name="contact_name"
                value={formData.contact_name}
                onChange={handleChange}
                placeholder="VD: Nguyễn Văn A"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </FormField>

            <FormField label="Chức vụ">
              <input
                type="text"
                name="contact_position"
                value={formData.contact_position}
                onChange={handleChange}
                placeholder="VD: Trưởng phòng Kinh doanh"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </FormField>

            <FormField label="Điện thoại">
              <input
                type="tel"
                name="contact_phone"
                value={formData.contact_phone}
                onChange={handleChange}
                placeholder="VD: 0903 123 456"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </FormField>

            <FormField label="Email">
              <input
                type="email"
                name="contact_email"
                value={formData.contact_email}
                onChange={handleChange}
                placeholder="VD: nguyenvana@holcim.com.vn"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </FormField>
          </div>
        </div>
      </FormSection>

      {/* Address */}
      <FormSection title="Địa chỉ" icon={<MapPin size={20} />}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Province */}
          <FormField label="Tỉnh/Thành phố">
            <select
              name="province"
              value={formData.province}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">-- Chọn tỉnh/thành --</option>
              {PROVINCES.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </FormField>

          {/* District */}
          <FormField label="Quận/Huyện">
            <input
              type="text"
              name="district"
              value={formData.district}
              onChange={handleChange}
              placeholder="VD: Quận 1"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </FormField>

          {/* Ward */}
          <FormField label="Phường/Xã">
            <input
              type="text"
              name="ward"
              value={formData.ward}
              onChange={handleChange}
              placeholder="VD: Phường Bến Nghé"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </FormField>

          {/* Address */}
          <FormField label="Địa chỉ chi tiết" className="md:col-span-3">
            <textarea
              name="address"
              value={formData.address}
              onChange={handleChange}
              rows={2}
              placeholder="VD: 123 Đường Nguyễn Huệ"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </FormField>
        </div>
      </FormSection>

      {/* Bank Information */}
      <FormSection title="Thông tin ngân hàng" icon={<CreditCard size={20} />}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="Tên ngân hàng">
            <input
              type="text"
              name="bank_name"
              value={formData.bank_name}
              onChange={handleChange}
              placeholder="VD: Vietcombank"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </FormField>

          <FormField label="Chi nhánh">
            <input
              type="text"
              name="bank_branch"
              value={formData.bank_branch}
              onChange={handleChange}
              placeholder="VD: Chi nhánh Sài Gòn"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </FormField>

          <FormField label="Số tài khoản">
            <input
              type="text"
              name="bank_account"
              value={formData.bank_account}
              onChange={handleChange}
              placeholder="VD: 0071001234567"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </FormField>

          <FormField label="Tên chủ tài khoản">
            <input
              type="text"
              name="bank_holder"
              value={formData.bank_holder}
              onChange={handleChange}
              placeholder="VD: CTY TNHH XI MANG HOLCIM VN"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </FormField>
        </div>
      </FormSection>

      {/* Payment Terms */}
      <FormSection title="Điều khoản thanh toán" icon={<FileText size={20} />}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="Thời hạn thanh toán">
            <select
              name="payment_terms"
              value={formData.payment_terms}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {PAYMENT_TERMS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </FormField>

          <FormField label="Hạn mức công nợ">
            <div className="relative">
              <input
                type="number"
                name="credit_limit"
                value={formData.credit_limit || ''}
                onChange={handleChange}
                min={0}
                step={1000000}
                placeholder="0 = Không giới hạn"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                VNĐ
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Để trống hoặc nhập 0 nếu không giới hạn công nợ
            </p>
          </FormField>
        </div>

        {/* Notes */}
        <div className="mt-4">
          <FormField label="Ghi chú">
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              rows={3}
              placeholder="Ghi chú thêm về nhà cung cấp..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </FormField>
        </div>
      </FormSection>

      {/* Status (Edit mode only) */}
      {isEditMode && (
        <FormSection title="Trạng thái" icon={<CheckCircle size={20} />}>
          <div className="flex items-center gap-6">
            {[
              { value: 'active', label: 'Hoạt động', color: 'green' },
              { value: 'inactive', label: 'Tạm ngừng', color: 'yellow' },
              { value: 'blocked', label: 'Đã khóa', color: 'red' }
            ].map((status) => (
              <label key={status.value} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="status"
                  value={status.value}
                  checked={formData.status === status.value}
                  onChange={handleChange}
                  className="w-4 h-4 text-blue-600"
                />
                <span className={`text-${status.color}-600 font-medium`}>{status.label}</span>
              </label>
            ))}
          </div>
        </FormSection>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-4 pt-6 border-t">
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
        >
          <X size={18} className="inline mr-2" />
          Hủy
        </button>
        <button
          type="submit"
          disabled={loading || checking}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
        >
          {loading ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              Đang lưu...
            </>
          ) : (
            <>
              <Save size={18} />
              {isEditMode ? 'Cập nhật' : 'Tạo mới'}
            </>
          )}
        </button>
      </div>
    </form>
  );
};

export default SupplierForm;