// ============================================================================
// SUPPLIER EDIT PAGE
// File: src/features/purchasing/pages/SupplierEditPage.tsx
// Huy Anh ERP System - Module Quản lý đơn hàng
// ============================================================================

import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Building2, Loader2, AlertCircle } from 'lucide-react';

// File: src/features/purchasing/pages/SupplierEditPage.tsx
// SupplierForm: src/features/purchasing/pages/components/suppliers/SupplierForm.tsx
// Service: src/services/supplierService.ts
import { SupplierForm } from './components/suppliers/SupplierForm';
import { supplierService, type Supplier } from '../../../services/supplierService';

export const SupplierEditPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load supplier data
  useEffect(() => {
    const loadSupplier = async () => {
      if (!id) {
        setError('ID nhà cung cấp không hợp lệ');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
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

    loadSupplier();
  }, [id]);

  const handleSuccess = (updatedSupplier: Supplier) => {
    navigate(`/purchasing/suppliers/${updatedSupplier.id}`, {
      state: { message: 'Đã cập nhật nhà cung cấp thành công!' }
    });
  };

  const handleCancel = () => {
    navigate(`/purchasing/suppliers/${id}`);
  };

  // Loading state
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

  // Error state
  if (error) {
    return (
      <div className="p-6">
        <div className="max-w-md mx-auto text-center">
          <div className="p-4 bg-red-50 rounded-full w-16 h-16 mx-auto flex items-center justify-center mb-4">
            <AlertCircle className="text-red-500" size={32} />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Lỗi</h2>
          <p className="text-gray-600 mb-6">{error}</p>
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
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={handleCancel}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-4"
        >
          <ArrowLeft size={20} />
          Quay lại
        </button>

        <div className="flex items-center gap-3">
          <div className="p-3 bg-blue-100 rounded-lg">
            <Building2 className="text-blue-600" size={28} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Chỉnh sửa nhà cung cấp</h1>
            <p className="text-gray-500">
              {supplier?.code} - {supplier?.name}
            </p>
          </div>
        </div>
      </div>

      {/* Form */}
      {supplier && (
        <SupplierForm
          supplier={supplier}
          onSuccess={handleSuccess}
          onCancel={handleCancel}
        />
      )}
    </div>
  );
};

export default SupplierEditPage;