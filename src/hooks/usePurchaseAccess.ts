// ============================================================================
// USE PURCHASE ACCESS HOOK
// File: src/hooks/usePurchaseAccess.ts
// Huy Anh ERP System - Phase 6: Access Control
// ============================================================================
// Hook kiểm tra quyền truy cập module Mua hàng
// Sử dụng: const { hasAccess, accessLevel, isExecutive, isLoading } = usePurchaseAccess();
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import { purchaseAccessService } from '../services/purchaseAccessService';
import type { AccessLevel, AccessCheckResult } from '../services/purchaseAccessService';
import { useAuthStore } from '../stores/authStore';

// ============================================================================
// TYPES
// ============================================================================

export interface UsePurchaseAccessReturn {
  // Access state
  hasAccess: boolean;
  accessLevel: AccessLevel | null;
  isExecutive: boolean;
  isLoading: boolean;
  error: string | null;

  // Permission checks
  canView: boolean;       // view_only hoặc full
  canCreate: boolean;     // full only
  canEdit: boolean;       // full only
  canDelete: boolean;     // full only
  canManageAccess: boolean; // Executive level ≤ 3 only

  // Actions
  refresh: () => Promise<void>;
}

// ============================================================================
// HOOK
// ============================================================================

export function usePurchaseAccess(): UsePurchaseAccessReturn {
  const { user } = useAuthStore();

  const [hasAccess, setHasAccess] = useState(false);
  const [accessLevel, setAccessLevel] = useState<AccessLevel | null>(null);
  const [isExecutive, setIsExecutive] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const checkAccess = useCallback(async () => {
    if (!user) {
      setHasAccess(false);
      setAccessLevel(null);
      setIsExecutive(false);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      // Admin → full access
      if (user.role === 'admin') {
        setHasAccess(true);
        setAccessLevel('full');
        setIsExecutive(true);
        setIsLoading(false);
        return;
      }

      // Executive (level ≤ 5) → full access
      const level = user.position_level;
      if (level && level <= 5) {
        setHasAccess(true);
        setAccessLevel('full');
        setIsExecutive(true);
        setIsLoading(false);
        return;
      }

      // Kiểm tra bảng purchase_access
      const result: AccessCheckResult = await purchaseAccessService.checkCurrentUserAccess();
      setHasAccess(result.hasAccess);
      setAccessLevel(result.accessLevel);
      setIsExecutive(result.isExecutive);
    } catch (err: any) {
      console.error('❌ [usePurchaseAccess] Error:', err);
      setError(err.message || 'Lỗi kiểm tra quyền');
      setHasAccess(false);
      setAccessLevel(null);
      setIsExecutive(false);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    checkAccess();
  }, [checkAccess]);

  // Derived permissions
  const canView = hasAccess;
  const canCreate = hasAccess && (isExecutive || accessLevel === 'full');
  const canEdit = hasAccess && (isExecutive || accessLevel === 'full');
  const canDelete = hasAccess && (isExecutive || accessLevel === 'full');

  // Chỉ BGĐ (level ≤ 3) mới quản lý phân quyền
  const canManageAccess = user?.role === 'admin' || 
    (user?.position_level != null && user.position_level <= 3);

  return {
    hasAccess,
    accessLevel,
    isExecutive,
    isLoading,
    error,
    canView,
    canCreate,
    canEdit,
    canDelete,
    canManageAccess,
    refresh: checkAccess,
  };
}

export default usePurchaseAccess;