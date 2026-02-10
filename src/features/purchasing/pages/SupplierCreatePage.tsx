// ============================================================================
// SUPPLIER CREATE PAGE
// File: src/features/purchasing/pages/SupplierCreatePage.tsx
// Huy Anh ERP System - Module Quản lý đơn hàng
// ============================================================================

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Building2 } from 'lucide-react';

// File: src/features/purchasing/pages/SupplierCreatePage.tsx
// SupplierForm: src/features/purchasing/pages/components/suppliers/SupplierForm.tsx
// Service: src/services/supplierService.ts
import { SupplierForm } from './components/suppliers/SupplierForm';
import type { Supplier } from '../../../services/supplierService';

export const SupplierCreatePage: React.FC = () => {
  const navigate = useNavigate();

  const handleSuccess = (supplier: Supplier) => {
    // Navigate to detail page after create
    navigate(`/purchasing/suppliers/${supplier.id}`, {
      state: { message: `Đã tạo nhà cung cấp ${supplier.code} thành công!` }
    });
  };

  const handleCancel = () => {
    navigate('/purchasing/suppliers');
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={handleCancel}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-4"
        >
          <ArrowLeft size={20} />
          Quay lại danh sách
        </button>

        <div className="flex items-center gap-3">
          <div className="p-3 bg-blue-100 rounded-lg">
            <Building2 className="text-blue-600" size={28} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Thêm nhà cung cấp mới</h1>
            <p className="text-gray-500">Nhập thông tin nhà cung cấp</p>
          </div>
        </div>
      </div>

      {/* Form */}
      <SupplierForm
        supplier={null}
        onSuccess={handleSuccess}
        onCancel={handleCancel}
      />
    </div>
  );
};

export default SupplierCreatePage;