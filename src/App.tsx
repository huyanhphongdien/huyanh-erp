// ============================================================
// PHASE 4.5 REFACTOR: UPDATED APP.TSX
// File: src/App.tsx
// ============================================================
// UPDATED: Added Phase 6.3 Task Reports route
// ============================================================

import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from './stores/authStore';

// Layout
import { MainLayout } from './components/common/Layout';

// Auth
import { LoginPage } from './features/auth/LoginPage';

// ===== DASHBOARD - IMPORT TỪ FILE RIÊNG =====
import DashboardPage from './features/dashboard/DashboardPage';

// Phase 3.1: Phòng ban, Chức vụ, Nhân viên
import { DepartmentListPage } from './features/departments';
import { PositionListPage } from './features/positions';
import { EmployeeListPage } from './features/employees';

// Phase 3.2: Hợp đồng
import { ContractTypeListPage } from './features/contract-types';
import { ContractListPage } from './features/contracts';

// Phase 3.3: Nghỉ phép, Chấm công
import { LeaveTypeListPage } from './features/leave-types';
import { LeaveRequestListPage } from './features/leave-requests';
import { AttendanceListPage } from './features/attendance';

// Phase 3.4: Lương, Đánh giá
import { SalaryGradeListPage } from './features/salary-grades';
import { PayrollPeriodListPage } from './features/payroll';
import { PayslipListPage } from './features/payslips';
import { PerformanceCriteriaListPage } from './features/performance-criteria';
import { PerformanceReviewListPage } from './features/performance-reviews';

// Phase 4.1: Task Management
import { TaskListPage, TaskCreatePage, TaskEditPage, TaskViewPage } from './features/tasks';

// Phase 4.3: Evaluation & Approval
import MyTasksPage from './pages/evaluations/MyTasksPage';
import ApprovalsPage from './pages/evaluations/ApprovalPage';
import SelfEvaluationPage from './pages/evaluations/SelfEvaluationPage';
import TaskDetailPage from './pages/evaluations/TaskDetailPage';

// Phase 6.3: Task Reports
import TaskReportsPage from './features/reports/TaskReportsPage';

// ============================================================
// QUERY CLIENT
// ============================================================

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// ============================================================
// PROTECTED ROUTE COMPONENT
// ============================================================

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

// ============================================================
// PUBLIC ROUTE COMPONENT
// ============================================================

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

// ============================================================
// AUTH INITIALIZER
// ============================================================

function AuthInitializer({ children }: { children: React.ReactNode }) {
  const { checkAuth } = useAuthStore();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  return <>{children}</>;
}

// ============================================================
// MAIN APP
// ============================================================

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthInitializer>
          <Routes>
            {/* Public Routes */}
            <Route
              path="/login"
              element={
                <PublicRoute>
                  <LoginPage />
                </PublicRoute>
              }
            />

            {/* Protected Routes - MainLayout chứa Sidebar */}
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <MainLayout />
                </ProtectedRoute>
              }
            >
              {/* Dashboard - SỬ DỤNG COMPONENT TỪ FILE RIÊNG */}
              <Route index element={<DashboardPage />} />

              {/* ===== PHASE 3.1: Phòng ban, Chức vụ, Nhân viên ===== */}
              <Route path="departments" element={<DepartmentListPage />} />
              <Route path="positions" element={<PositionListPage />} />
              <Route path="employees" element={<EmployeeListPage />} />

              {/* ===== PHASE 3.2: Hợp đồng ===== */}
              <Route path="contract-types" element={<ContractTypeListPage />} />
              <Route path="contracts" element={<ContractListPage />} />

              {/* ===== PHASE 3.3: Nghỉ phép, Chấm công ===== */}
              <Route path="leave-types" element={<LeaveTypeListPage />} />
              <Route path="leave-requests" element={<LeaveRequestListPage />} />
              <Route path="attendance" element={<AttendanceListPage />} />

              {/* ===== PHASE 3.4: Lương, Đánh giá ===== */}
              <Route path="salary-grades" element={<SalaryGradeListPage />} />
              <Route path="payroll-periods" element={<PayrollPeriodListPage />} />
              <Route path="payslips" element={<PayslipListPage />} />
              <Route path="performance-criteria" element={<PerformanceCriteriaListPage />} />
              <Route path="performance-reviews" element={<PerformanceReviewListPage />} />

              {/* ===== PHASE 4.1 & 4.5: Task Management (with Overview Tab) ===== */}
              <Route path="tasks" element={<TaskListPage />} />
              <Route path="tasks/create" element={<TaskCreatePage />} />
              <Route path="tasks/new" element={<TaskCreatePage />} />
              <Route path="tasks/:id" element={<TaskViewPage />} />
              <Route path="tasks/:id/edit" element={<TaskEditPage />} />

              {/* ===== PHASE 4.3: Evaluation & Approval ===== */}
              <Route path="my-tasks" element={<MyTasksPage />} />
              <Route path="approvals" element={<ApprovalsPage />} />
              
              {/* SelfEvaluationPage */}
              <Route path="evaluations/self-evaluation" element={<SelfEvaluationPage />} />
              <Route path="self-evaluation" element={<SelfEvaluationPage />} />

              {/* TaskDetailPage - Chi tiết công việc với permissions */}
              <Route path="task-detail/:taskId" element={<TaskDetailPage />} />
              <Route path="my-tasks/:taskId" element={<TaskDetailPage />} />

              {/* ===== PHASE 6.3: Task Reports ===== */}
              <Route path="reports/tasks" element={<TaskReportsPage />} />

              {/* ===== REDIRECTS: Legacy routes & backward compatibility ===== */}
              <Route path="my-evaluations" element={<Navigate to="/my-tasks?tab=approved" replace />} />
              <Route path="evaluations/my-tasks" element={<Navigate to="/my-tasks" replace />} />
              <Route path="evaluations/approval" element={<Navigate to="/approvals" replace />} />
              <Route path="evaluations/my" element={<Navigate to="/my-tasks?tab=approved" replace />} />
              <Route path="evaluations/results" element={<Navigate to="/my-tasks?tab=approved" replace />} />
            </Route>

            {/* 404 */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthInitializer>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;