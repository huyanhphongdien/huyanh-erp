// ============================================================================
// DASHBOARD PAGE - ROUTER
// File: src/features/dashboard/DashboardPage.tsx
// Huy Anh ERP System - Hiển thị Dashboard theo quyền
// ============================================================================

import { usePermissions } from '../../hooks/usePermissions';
import { EmployeeDashboard } from './EmployeeDashboard';
import { ManagerDashboard } from './ManagerDashboard';

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function DashboardPage() {
  const { group, isAdmin } = usePermissions();

  // Admin: Hiển thị Manager Dashboard (full quyền)
  if (isAdmin) {
    return <ManagerDashboard />;
  }

  // Executive (Level 1-3): Hiển thị Manager Dashboard
  if (group === 'executive') {
    return <ManagerDashboard />;
  }

  // Manager (Level 4-5): Hiển thị Manager Dashboard
  if (group === 'manager') {
    return <ManagerDashboard />;
  }

  // Employee (Level 6): Hiển thị Employee Dashboard (giới hạn)
  return <EmployeeDashboard />;
}

export default DashboardPage;