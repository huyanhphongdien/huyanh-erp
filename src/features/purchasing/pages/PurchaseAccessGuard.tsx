// ============================================================================
// PURCHASE ACCESS GUARD
// File: src/features/purchasing/components/PurchaseAccessGuard.tsx
// Huy Anh ERP System - Phase 6: Access Control
// ============================================================================
// Wrap component/route để kiểm tra quyền truy cập module Mua hàng
// Usage:
//   <PurchaseAccessGuard>
//     <YourComponent />
//   </PurchaseAccessGuard>
//
//   <PurchaseAccessGuard requiredLevel="full" fallback={<ReadOnlyView />}>
//     <EditableComponent />
//   </PurchaseAccessGuard>
// ============================================================================

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldX, ShieldCheck, Loader2, ArrowLeft, Lock } from 'lucide-react';
import { usePurchaseAccess } from '../../../hooks/usePurchaseAccess';
import type { AccessLevel } from '../../../services/purchaseAccessService';

// ============================================================================
// TYPES
// ============================================================================

interface PurchaseAccessGuardProps {
  children: React.ReactNode;
  /** Mức quyền tối thiểu: 'view_only' (mặc định) hoặc 'full' */
  requiredLevel?: AccessLevel;
  /** Component hiển thị khi không có quyền (thay vì trang mặc định) */
  fallback?: React.ReactNode;
  /** Ẩn hoàn toàn thay vì hiển thị thông báo */
  hideIfNoAccess?: boolean;
}

// ============================================================================
// COMPONENT
// ============================================================================

const PurchaseAccessGuard: React.FC<PurchaseAccessGuardProps> = ({
  children,
  requiredLevel = 'view_only',
  fallback,
  hideIfNoAccess = false,
}) => {
  const navigate = useNavigate();
  const { hasAccess, accessLevel, isExecutive, isLoading } = usePurchaseAccess();

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="w-7 h-7 animate-spin text-blue-500 mr-3" />
        <span className="text-gray-500">Đang kiểm tra quyền truy cập...</span>
      </div>
    );
  }

  // Không có quyền gì
  if (!hasAccess) {
    if (hideIfNoAccess) return null;
    if (fallback) return <>{fallback}</>;

    return (
      <div className="max-w-lg mx-auto text-center py-20 px-4">
        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-5">
          <ShieldX className="w-8 h-8 text-red-500" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">
          Không có quyền truy cập
        </h2>
        <p className="text-gray-500 mb-6 leading-relaxed">
          Bạn chưa được cấp quyền truy cập module Quản lý Đơn hàng.<br />
          Vui lòng liên hệ Ban Giám đốc để được cấp quyền.
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Về trang chủ
          </button>
        </div>
      </div>
    );
  }

  // Có quyền nhưng không đủ level (ví dụ: view_only muốn truy cập trang cần full)
  if (requiredLevel === 'full' && !isExecutive && accessLevel !== 'full') {
    if (hideIfNoAccess) return null;
    if (fallback) return <>{fallback}</>;

    return (
      <div className="max-w-lg mx-auto text-center py-20 px-4">
        <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-5">
          <Lock className="w-8 h-8 text-amber-500" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">
          Quyền hạn chế
        </h2>
        <p className="text-gray-500 mb-6 leading-relaxed">
          Bạn chỉ có quyền <strong>Xem</strong> trong module này.<br />
          Để tạo, sửa, xóa dữ liệu, cần quyền <strong>Toàn quyền</strong>.
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Quay lại
          </button>
        </div>
      </div>
    );
  }

  // Đủ quyền → render children
  return <>{children}</>;
};

// ============================================================================
// PERMISSION CHECK COMPONENT (inline)
// ============================================================================

interface PermissionCheckProps {
  requiredLevel?: AccessLevel;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * Component nhỏ gọn hơn PurchaseAccessGuard — dùng để ẩn/hiện nút, link
 * Usage: <PermissionCheck requiredLevel="full"><DeleteButton /></PermissionCheck>
 */
export const PermissionCheck: React.FC<PermissionCheckProps> = ({
  requiredLevel = 'full',
  children,
  fallback = null,
}) => {
  const { hasAccess, accessLevel, isExecutive, isLoading } = usePurchaseAccess();

  if (isLoading) return null;
  if (!hasAccess) return <>{fallback}</>;

  if (requiredLevel === 'full' && !isExecutive && accessLevel !== 'full') {
    return <>{fallback}</>;
  }

  return <>{children}</>;
};

export default PurchaseAccessGuard;