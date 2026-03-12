// ============================================================
// PERMISSION GATE COMPONENT
// File: src/components/common/PermissionGate.tsx
// Huy Anh ERP System - UI Protection Component
// ============================================================

import React from 'react';
import { usePermissions } from '../../hooks/usePermissions';
import type { Feature, PermissionGroup } from '../../types/permissions';

// ==================== TYPES ====================
interface PermissionGateProps {
  children: React.ReactNode;
  
  // Option 1: Check by feature
  feature?: Feature;
  action?: 'view' | 'create' | 'edit' | 'delete' | 'approve';
  
  // Option 2: Check by group
  allowedGroups?: PermissionGroup[];
  
  // Option 3: Check by level
  minLevel?: number;  // Level tối thiểu (số nhỏ = cao hơn)
  maxLevel?: number;  // Level tối đa
  
  // Option 4: Manager only
  requireManager?: boolean;
  requireExecutive?: boolean;
  requireAdmin?: boolean;
  
  // Resource ownership (for edit/delete checks)
  resourceOwnerId?: string;
  resourceDeptId?: string;
  
  // Fallback UI
  fallback?: React.ReactNode;
  
  // Debug mode
  debug?: boolean;
}

// ==================== MAIN COMPONENT ====================
export function PermissionGate({
  children,
  feature,
  action = 'view',
  allowedGroups,
  minLevel,
  maxLevel,
  requireManager = false,
  requireExecutive = false,
  requireAdmin = false,
  resourceOwnerId,
  resourceDeptId,
  fallback = null,
  debug = false,
}: PermissionGateProps) {
  const { 
    level, 
    group, 
    isAdmin, 
    isManager, 
    isExecutive,
    canView, 
    canCreate, 
    canEdit, 
    canDelete, 
    canApprove 
  } = usePermissions();

  let hasPermission = true;
  let reason = '';

  // Check admin requirement
  if (requireAdmin) {
    hasPermission = isAdmin;
    if (!hasPermission) reason = 'Requires admin';
  }

  // Check executive requirement
  if (hasPermission && requireExecutive) {
    hasPermission = isExecutive;
    if (!hasPermission) reason = 'Requires executive';
  }

  // Check manager requirement
  if (hasPermission && requireManager) {
    hasPermission = isManager;
    if (!hasPermission) reason = 'Requires manager';
  }

  // Check allowed groups
  if (hasPermission && allowedGroups && allowedGroups.length > 0) {
    hasPermission = isAdmin || allowedGroups.includes(group);
    if (!hasPermission) reason = `Requires groups: ${allowedGroups.join(', ')}`;
  }

  // Check level range - FIX: Added null check for level
  if (hasPermission && (minLevel !== undefined || maxLevel !== undefined)) {
    const min = minLevel ?? 1;
    const max = maxLevel ?? 6;
    hasPermission = isAdmin || (level !== null && level >= min && level <= max);
    if (!hasPermission) reason = `Requires level ${min}-${max}, current: ${level}`;
  }

  // Check feature permission
  if (hasPermission && feature) {
    switch (action) {
      case 'view':
        hasPermission = canView(feature);
        break;
      case 'create':
        hasPermission = canCreate(feature);
        break;
      case 'edit':
        hasPermission = canEdit(feature, resourceOwnerId, resourceDeptId);
        break;
      case 'delete':
        hasPermission = canDelete(feature, resourceOwnerId, resourceDeptId);
        break;
      case 'approve':
        hasPermission = canApprove(feature, resourceDeptId);
        break;
    }
    if (!hasPermission) reason = `No ${action} permission for ${feature}`;
  }

  // Debug logging
  if (debug) {
    console.log('[PermissionGate]', {
      hasPermission,
      reason,
      level,
      group,
      isAdmin,
      feature,
      action,
    });
  }

  if (!hasPermission) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

// ==================== SHORTHAND COMPONENTS ====================

// Chỉ hiển thị cho Admin
export function AdminOnly({ 
  children, 
  fallback = null 
}: { 
  children: React.ReactNode; 
  fallback?: React.ReactNode;
}) {
  return (
    <PermissionGate requireAdmin fallback={fallback}>
      {children}
    </PermissionGate>
  );
}

// Chỉ hiển thị cho Executive (Giám đốc, Phó GĐ, Trợ lý BGĐ)
export function ExecutiveOnly({ 
  children, 
  fallback = null 
}: { 
  children: React.ReactNode; 
  fallback?: React.ReactNode;
}) {
  return (
    <PermissionGate requireExecutive fallback={fallback}>
      {children}
    </PermissionGate>
  );
}

// Chỉ hiển thị cho Manager trở lên (Level 1-5)
export function ManagerOnly({ 
  children, 
  fallback = null 
}: { 
  children: React.ReactNode; 
  fallback?: React.ReactNode;
}) {
  return (
    <PermissionGate requireManager fallback={fallback}>
      {children}
    </PermissionGate>
  );
}

// Chỉ hiển thị nếu có quyền view feature
export function CanView({ 
  feature, 
  children, 
  fallback = null 
}: { 
  feature: Feature;
  children: React.ReactNode; 
  fallback?: React.ReactNode;
}) {
  return (
    <PermissionGate feature={feature} action="view" fallback={fallback}>
      {children}
    </PermissionGate>
  );
}

// Chỉ hiển thị nếu có quyền create feature
export function CanCreate({ 
  feature, 
  children, 
  fallback = null 
}: { 
  feature: Feature;
  children: React.ReactNode; 
  fallback?: React.ReactNode;
}) {
  return (
    <PermissionGate feature={feature} action="create" fallback={fallback}>
      {children}
    </PermissionGate>
  );
}

// Chỉ hiển thị nếu có quyền edit
export function CanEdit({ 
  feature, 
  resourceOwnerId,
  resourceDeptId,
  children, 
  fallback = null 
}: { 
  feature: Feature;
  resourceOwnerId?: string;
  resourceDeptId?: string;
  children: React.ReactNode; 
  fallback?: React.ReactNode;
}) {
  return (
    <PermissionGate 
      feature={feature} 
      action="edit" 
      resourceOwnerId={resourceOwnerId}
      resourceDeptId={resourceDeptId}
      fallback={fallback}
    >
      {children}
    </PermissionGate>
  );
}

// Chỉ hiển thị nếu có quyền delete
export function CanDelete({ 
  feature, 
  resourceOwnerId,
  resourceDeptId,
  children, 
  fallback = null 
}: { 
  feature: Feature;
  resourceOwnerId?: string;
  resourceDeptId?: string;
  children: React.ReactNode; 
  fallback?: React.ReactNode;
}) {
  return (
    <PermissionGate 
      feature={feature} 
      action="delete" 
      resourceOwnerId={resourceOwnerId}
      resourceDeptId={resourceDeptId}
      fallback={fallback}
    >
      {children}
    </PermissionGate>
  );
}

// Chỉ hiển thị nếu có quyền approve
export function CanApprove({ 
  feature, 
  resourceDeptId,
  children, 
  fallback = null 
}: { 
  feature: Feature;
  resourceDeptId?: string;
  children: React.ReactNode; 
  fallback?: React.ReactNode;
}) {
  return (
    <PermissionGate 
      feature={feature} 
      action="approve" 
      resourceDeptId={resourceDeptId}
      fallback={fallback}
    >
      {children}
    </PermissionGate>
  );
}

export default PermissionGate;