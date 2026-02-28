// ============================================================================
// SUPPLIER CONTACTS COMPONENT
// File: src/features/purchasing/pages/components/suppliers/SupplierContacts.tsx
// Huy Anh ERP System - Module Quản lý đơn hàng
// ============================================================================

import React, { useState, useEffect } from 'react';
import {
  Plus,
  Edit,
  Trash2,
  User,
  Phone,
  Mail,
  Briefcase,
  Building2,
  Star,
  MoreVertical,
  X,
  Save,
  AlertCircle,
  Loader2,
  CheckCircle
} from 'lucide-react';

// Import path: 5 cấp lên từ components/suppliers/
import { 
  supplierService, 
  type SupplierContact,
  type SupplierContactFormData 
} from '../../../../../services/supplierService';

// ============================================================================
// TYPES
// ============================================================================

interface SupplierContactsProps {
  supplierId: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const CONTACT_TYPES = [
  { value: 'general', label: 'Liên hệ chung' },
  { value: 'sales', label: 'Kinh doanh' },
  { value: 'accounting', label: 'Kế toán' },
  { value: 'technical', label: 'Kỹ thuật' },
  { value: 'management', label: 'Quản lý' }
];

// ============================================================================
// CONTACT FORM MODAL
// ============================================================================

interface ContactFormModalProps {
  supplierId: string;
  contact?: SupplierContact | null;
  onClose: () => void;
  onSuccess: () => void;
}

const ContactFormModal: React.FC<ContactFormModalProps> = ({
  supplierId,
  contact,
  onClose,
  onSuccess
}) => {
  const isEditMode = !!contact;

  const [formData, setFormData] = useState<SupplierContactFormData>({
    supplier_id: supplierId,
    name: '',
    position: '',
    department: '',
    phone: '',
    mobile: '',
    email: '',
    contact_type: 'general',
    is_primary: false,
    notes: ''
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (contact) {
      setFormData({
        supplier_id: supplierId,
        name: contact.name || '',
        position: contact.position || '',
        department: contact.department || '',
        phone: contact.phone || '',
        mobile: contact.mobile || '',
        email: contact.email || '',
        contact_type: contact.contact_type || 'general',
        is_primary: contact.is_primary || false,
        notes: contact.notes || ''
      });
    }
  }, [contact, supplierId]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name?.trim()) {
      setError('Vui lòng nhập họ tên');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (isEditMode && contact) {
        await supplierService.updateContact(contact.id, formData);
      } else {
        await supplierService.createContact(formData);
      }
      onSuccess();
    } catch (err: any) {
      console.error('Save contact error:', err);
      setError(err.message || 'Không thể lưu thông tin liên hệ');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white">
          <h3 className="text-lg font-semibold">
            {isEditMode ? 'Chỉnh sửa liên hệ' : 'Thêm liên hệ mới'}
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

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Họ tên <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="Nguyễn Văn A"
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Position & Department */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Chức vụ</label>
              <input
                type="text"
                name="position"
                value={formData.position}
                onChange={handleChange}
                placeholder="Trưởng phòng"
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phòng ban</label>
              <input
                type="text"
                name="department"
                value={formData.department}
                onChange={handleChange}
                placeholder="Phòng Kinh doanh"
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Contact Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Loại liên hệ</label>
            <select
              name="contact_type"
              value={formData.contact_type}
              onChange={handleChange}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {CONTACT_TYPES.map(type => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>
          </div>

          {/* Phone & Mobile */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Điện thoại cố định</label>
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                placeholder="028 1234 5678"
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Di động</label>
              <input
                type="tel"
                name="mobile"
                value={formData.mobile}
                onChange={handleChange}
                placeholder="0903 123 456"
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="nguyenvana@company.com"
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Is Primary */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              name="is_primary"
              id="is_primary"
              checked={formData.is_primary}
              onChange={handleChange}
              className="w-4 h-4 text-blue-600 rounded"
            />
            <label htmlFor="is_primary" className="text-sm text-gray-700">
              Đặt làm liên hệ chính
            </label>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ghi chú</label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              rows={2}
              placeholder="Ghi chú..."
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
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
              {isEditMode ? 'Cập nhật' : 'Thêm mới'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ============================================================================
// CONTACT CARD
// ============================================================================

interface ContactCardProps {
  contact: SupplierContact;
  onEdit: () => void;
  onDelete: () => void;
  onSetPrimary: () => void;
}

const ContactCard: React.FC<ContactCardProps> = ({
  contact,
  onEdit,
  onDelete,
  onSetPrimary
}) => {
  const [showMenu, setShowMenu] = useState(false);

  const getTypeLabel = (type: string) => {
    return CONTACT_TYPES.find(t => t.value === type)?.label || type;
  };

  return (
    <div className={`bg-white rounded-lg border p-4 ${contact.is_primary ? 'ring-2 ring-blue-500' : ''}`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-full ${contact.is_primary ? 'bg-blue-100' : 'bg-gray-100'}`}>
            <User size={20} className={contact.is_primary ? 'text-blue-600' : 'text-gray-600'} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-medium text-gray-900">{contact.name}</h4>
              {contact.is_primary && (
                <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full flex items-center gap-1">
                  <Star size={12} className="fill-current" />
                  Chính
                </span>
              )}
            </div>
            {contact.position && (
              <p className="text-sm text-gray-500">{contact.position}</p>
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
                <button
                  onClick={() => { onEdit(); setShowMenu(false); }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
                >
                  <Edit size={14} />
                  Chỉnh sửa
                </button>
                {!contact.is_primary && (
                  <button
                    onClick={() => { onSetPrimary(); setShowMenu(false); }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    <Star size={14} />
                    Đặt làm chính
                  </button>
                )}
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

      {/* Contact Info */}
      <div className="space-y-2 text-sm">
        {contact.department && (
          <div className="flex items-center gap-2 text-gray-600">
            <Building2 size={14} className="text-gray-400" />
            {contact.department}
          </div>
        )}
        {(contact.phone || contact.mobile) && (
          <div className="flex items-center gap-2 text-gray-600">
            <Phone size={14} className="text-gray-400" />
            {contact.mobile || contact.phone}
            {contact.phone && contact.mobile && (
              <span className="text-gray-400">/ {contact.phone}</span>
            )}
          </div>
        )}
        {contact.email && (
          <div className="flex items-center gap-2 text-gray-600">
            <Mail size={14} className="text-gray-400" />
            <a href={`mailto:${contact.email}`} className="text-blue-600 hover:underline">
              {contact.email}
            </a>
          </div>
        )}
      </div>

      {/* Type Badge */}
      <div className="mt-3 pt-3 border-t">
        <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">
          {getTypeLabel(contact.contact_type)}
        </span>
      </div>
    </div>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const SupplierContacts: React.FC<SupplierContactsProps> = ({ supplierId }) => {
  const [contacts, setContacts] = useState<SupplierContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal states
  const [showForm, setShowForm] = useState(false);
  const [editingContact, setEditingContact] = useState<SupplierContact | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<SupplierContact | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ==========================================
  // LOAD DATA
  // ==========================================

  const loadContacts = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await supplierService.getContacts(supplierId);
      setContacts(data);
    } catch (err) {
      console.error('Load contacts error:', err);
      setError('Không thể tải danh sách liên hệ');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadContacts();
  }, [supplierId]);

  // ==========================================
  // HANDLERS
  // ==========================================

  const handleAdd = () => {
    setEditingContact(null);
    setShowForm(true);
  };

  const handleEdit = (contact: SupplierContact) => {
    setEditingContact(contact);
    setShowForm(true);
  };

  const handleFormSuccess = () => {
    setShowForm(false);
    setEditingContact(null);
    loadContacts();
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;

    try {
      setDeleting(true);
      await supplierService.deleteContact(deleteConfirm.id);
      setDeleteConfirm(null);
      loadContacts();
    } catch (err) {
      console.error('Delete contact error:', err);
      alert('Không thể xóa liên hệ');
    } finally {
      setDeleting(false);
    }
  };

  const handleSetPrimary = async (contact: SupplierContact) => {
    try {
      await supplierService.setPrimaryContact(supplierId, contact.id);
      loadContacts();
    } catch (err) {
      console.error('Set primary contact error:', err);
      alert('Không thể đặt làm liên hệ chính');
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
        <button onClick={loadContacts} className="mt-4 text-blue-600 hover:underline">
          Thử lại
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900">
          Người liên hệ ({contacts.length})
        </h3>
        <button
          onClick={handleAdd}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus size={18} />
          Thêm liên hệ
        </button>
      </div>

      {/* Contacts Grid */}
      {contacts.length === 0 ? (
        <div className="bg-white rounded-lg border p-8 text-center">
          <User className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 font-medium text-gray-900">Chưa có người liên hệ</h3>
          <p className="mt-1 text-gray-500">Thêm người liên hệ đầu tiên cho nhà cung cấp này</p>
          <button
            onClick={handleAdd}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus size={18} />
            Thêm liên hệ
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {contacts.map(contact => (
            <ContactCard
              key={contact.id}
              contact={contact}
              onEdit={() => handleEdit(contact)}
              onDelete={() => setDeleteConfirm(contact)}
              onSetPrimary={() => handleSetPrimary(contact)}
            />
          ))}
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <ContactFormModal
          supplierId={supplierId}
          contact={editingContact}
          onClose={() => { setShowForm(false); setEditingContact(null); }}
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
              Bạn có chắc muốn xóa liên hệ <strong>{deleteConfirm.name}</strong>?
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

export default SupplierContacts;