// ============================================================================
// PHASE 4.3: EVALUATION ROUTES
// File: src/routes/evaluationRoutes.tsx
// Huy Anh ERP System
// ============================================================================
// CHANGES:
// - Xóa MyEvaluationsPage (đã gộp vào MyTasksPage - tab Đã duyệt)
// - Redirect /my-evaluations → /my-tasks?tab=approved
// ============================================================================

import React, { Suspense, lazy } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';

// ============================================================================
// LAZY LOAD PAGES
// ============================================================================

const MyTasksPage = lazy(() => import('../pages/evaluations/MyTasksPage'));
const SelfEvaluationPage = lazy(() => import('../pages/evaluations/SelfEvaluationPage'));
const ApprovalPage = lazy(() => import('../pages/evaluations/ApprovalPage'));
// ĐÃ XÓA: MyEvaluationsPage (gộp vào MyTasksPage)

// ============================================================================
// LOADING COMPONENT
// ============================================================================

const PageLoading: React.FC = () => (
  <div className="flex items-center justify-center min-h-[400px]">
    <div className="flex items-center gap-3 text-gray-500">
      <svg className="animate-spin h-6 w-6" viewBox="0 0 24 24">
        <circle 
          className="opacity-25" 
          cx="12" cy="12" r="10" 
          stroke="currentColor" 
          strokeWidth="4" 
          fill="none" 
        />
        <path 
          className="opacity-75" 
          fill="currentColor" 
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" 
        />
      </svg>
      <span>Đang tải...</span>
    </div>
  </div>
);

// ============================================================================
// PROTECTED ROUTE COMPONENTS
// ============================================================================

// Yêu cầu đăng nhập
interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) {
    return <PageLoading />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

// Yêu cầu có employee_id
interface EmployeeRouteProps {
  children: React.ReactNode;
}

const EmployeeRoute: React.FC<EmployeeRouteProps> = ({ children }) => {
  const { user, isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) {
    return <PageLoading />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!user?.employee_id) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="text-red-500 text-5xl mb-4">⚠️</div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Không có quyền truy cập
          </h2>
          <p className="text-gray-500">
            Tài khoản của bạn chưa được liên kết với hồ sơ nhân viên.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

// Yêu cầu là manager hoặc admin
interface ManagerRouteProps {
  children: React.ReactNode;
}

const ManagerRoute: React.FC<ManagerRouteProps> = ({ children }) => {
  const { user, isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) {
    return <PageLoading />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!user?.is_manager && user?.role !== 'admin') {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="text-red-500 text-5xl mb-4">🔒</div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Không có quyền truy cập
          </h2>
          <p className="text-gray-500">
            Chức năng này chỉ dành cho quản lý.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

// ============================================================================
// ROUTE CONFIGURATION - Routes mới (gom nhóm Công việc)
// ============================================================================

export const evaluationRoutes = [
  // Công việc của tôi (bao gồm cả Kết quả đánh giá - tab Đã duyệt)
  {
    path: 'my-tasks',
    element: (
      <EmployeeRoute>
        <Suspense fallback={<PageLoading />}>
          <MyTasksPage />
        </Suspense>
      </EmployeeRoute>
    ),
  },
  
  // Tự đánh giá (form riêng khi click từ MyTasksPage)
  {
    path: 'self-evaluation',
    element: (
      <EmployeeRoute>
        <Suspense fallback={<PageLoading />}>
          <SelfEvaluationPage />
        </Suspense>
      </EmployeeRoute>
    ),
  },
  
  // Phê duyệt công việc (cho manager)
  {
    path: 'approvals',
    element: (
      <ManagerRoute>
        <Suspense fallback={<PageLoading />}>
          <ApprovalPage />
        </Suspense>
      </ManagerRoute>
    ),
  },
  
  // ĐÃ XÓA: my-evaluations route (gộp vào my-tasks tab approved)
  // Redirect về /my-tasks?tab=approved
  {
    path: 'my-evaluations',
    element: <Navigate to="/my-tasks?tab=approved" replace />,
  },
  
  // Legacy routes redirect
  {
    path: 'evaluations',
    children: [
      { index: true, element: <Navigate to="/my-tasks" replace /> },
      { path: 'self', element: <Navigate to="/self-evaluation" replace /> },
      { path: 'self-evaluation', element: <Navigate to="/self-evaluation" replace /> },
      { path: 'approval', element: <Navigate to="/approvals" replace /> },
      { path: 'my', element: <Navigate to="/my-tasks?tab=approved" replace /> },
      { path: 'my-tasks', element: <Navigate to="/my-tasks" replace /> },
      { path: 'results', element: <Navigate to="/my-tasks?tab=approved" replace /> },
    ],
  },
];

// ============================================================================
// NAVIGATION ITEMS (cho sidebar/menu)
// ============================================================================

export interface NavItem {
  path: string;
  label: string;
  icon?: string;
  badge?: number | string;
  requiredRole?: 'employee' | 'manager' | 'admin';
}

// ĐÃ CẬP NHẬT: Xóa "Kết quả đánh giá" - đã gộp vào "Công việc của tôi"
export const evaluationNavItems: NavItem[] = [
  {
    path: '/my-tasks',
    label: 'Công việc của tôi',
    icon: '👤',
    requiredRole: 'employee',
  },
  {
    path: '/approvals',
    label: 'Phê duyệt công việc',
    icon: '✓',
    requiredRole: 'manager',
  },
  // ĐÃ XÓA: /my-evaluations (gộp vào /my-tasks tab Đã duyệt)
];

// Filter nav items based on user role
export function getEvaluationNavItems(user: { 
  is_manager?: boolean; 
  role?: string;
  employee_id?: string | null;
} | null): NavItem[] {
  if (!user) return [];

  return evaluationNavItems.filter(item => {
    // Check employee role
    if (item.requiredRole === 'employee' && !user.employee_id) {
      return false;
    }
    
    // Check manager role
    if (item.requiredRole === 'manager' && !user.is_manager && user.role !== 'admin') {
      return false;
    }
    
    // Check admin role
    if (item.requiredRole === 'admin' && user.role !== 'admin') {
      return false;
    }

    return true;
  });
}

// ============================================================================
// EXPORTS
// ============================================================================

export { ProtectedRoute, EmployeeRoute, ManagerRoute, PageLoading };
export default evaluationRoutes;