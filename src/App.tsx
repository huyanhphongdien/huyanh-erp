// ============================================================
// PHASE 5 UPDATE + CHẤM CÔNG V2: UPDATED APP.TSX
// File: src/App.tsx
// ============================================================
// CHANGES:
// - Added Chấm công V2 routes: shifts, shift-assignments, overtime
// - All previous routes preserved
// ============================================================

import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from './stores/authStore';

// Layout
import { MainLayout } from './components/common/Layout';

// Auth
import { LoginPage } from './features/auth/LoginPage';

// ===== DASHBOARD =====
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

// User Settings
import UserSettingsPage from './pages/settings/UserSettingsPage';

// ===== CHẤM CÔNG V2: Ca, Phân ca, Tăng ca =====
import { ShiftListPage } from './features/shifts';
import { ShiftCalendarPage } from './features/shift-assignments';
import { OvertimeListPage, OvertimeApprovalPage } from './features/overtime';

// ===== PURCHASING MODULE =====
import { 
  SupplierListPage, SupplierCreatePage, SupplierEditPage, SupplierDetailPage,
  CategoryListPage, TypeListPage, UnitListPage,
  MaterialListPage, MaterialDetailPage
} from './features/purchasing';
import VariantAttributeManagement from './features/purchasing/pages/VariantAttributeManagement';
import POListPage from './features/purchasing/pages/POListPage';
import POFormPage from './features/purchasing/pages/POFormPage';
import PODetailPage from './features/purchasing/pages/PODetailPage';
import SupplierDebtPage from './features/purchasing/pages/SupplierDebtPage';
import PaymentListPage from './features/purchasing/pages/PaymentListPage';

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
              {/* Dashboard */}
              <Route index element={<DashboardPage />} />

              {/* ===== PHASE 3.1: Phòng ban, Chức vụ, Nhân viên ===== */}
              <Route path="departments" element={<DepartmentListPage />} />
              <Route path="positions" element={<PositionListPage />} />
              <Route path="employees" element={<EmployeeListPage />} />

              {/* ===== PHASE 3.2: Hợp đồng ===== */}
              <Route path="contract-types" element={<ContractTypeListPage />} />
              <Route path="contracts" element={<ContractListPage />} />

              {/* ===== PHASE 3.3: Nghỉ phép ===== */}
              <Route path="leave-types" element={<LeaveTypeListPage />} />
              <Route path="leave-requests" element={<LeaveRequestListPage />} />

              {/* ===== CHẤM CÔNG V2 ===== */}
              <Route path="attendance" element={<AttendanceListPage />} />
              <Route path="shifts" element={<ShiftListPage />} />
              <Route path="shift-assignments" element={<ShiftCalendarPage />} />
              <Route path="overtime" element={<OvertimeListPage />} />
              <Route path="overtime/approval" element={<OvertimeApprovalPage />} />

              {/* ===== PHASE 3.4: Lương, Đánh giá ===== */}
              <Route path="salary-grades" element={<SalaryGradeListPage />} />
              <Route path="payroll-periods" element={<PayrollPeriodListPage />} />
              <Route path="payslips" element={<PayslipListPage />} />
              <Route path="performance-criteria" element={<PerformanceCriteriaListPage />} />
              <Route path="performance-reviews" element={<PerformanceReviewListPage />} />

              {/* ===== PHASE 4.1 & 4.5: Task Management ===== */}
              <Route path="tasks" element={<TaskListPage />} />
              <Route path="tasks/create" element={<TaskCreatePage />} />
              <Route path="tasks/new" element={<TaskCreatePage />} />
              <Route path="tasks/:id" element={<TaskViewPage />} />
              <Route path="tasks/:id/edit" element={<TaskEditPage />} />

              {/* ===== PHASE 4.3: Evaluation & Approval ===== */}
              <Route path="my-tasks" element={<MyTasksPage />} />
              <Route path="approvals" element={<ApprovalsPage />} />
              <Route path="evaluations/self-evaluation" element={<SelfEvaluationPage />} />
              <Route path="self-evaluation" element={<SelfEvaluationPage />} />
              <Route path="task-detail/:taskId" element={<TaskDetailPage />} />
              <Route path="my-tasks/:taskId" element={<TaskDetailPage />} />

              {/* ===== PHASE 6.3: Task Reports ===== */}
              <Route path="reports/tasks" element={<TaskReportsPage />} />

              {/* ===== PURCHASING MODULE ===== */}
              <Route path="purchasing">
                <Route index element={<Navigate to="/purchasing/suppliers" replace />} />
                <Route path="suppliers" element={<SupplierListPage />} />
                <Route path="suppliers/new" element={<SupplierCreatePage />} />
                <Route path="suppliers/:id" element={<SupplierDetailPage />} />
                <Route path="suppliers/:id/edit" element={<SupplierEditPage />} />
                <Route path="categories" element={<CategoryListPage />} />
                <Route path="types" element={<TypeListPage />} />
                <Route path="units" element={<UnitListPage />} />
                <Route path="materials" element={<MaterialListPage />} />
                <Route path="materials/:id" element={<MaterialDetailPage />} />
                <Route path="variant-attributes" element={<VariantAttributeManagement />} />
                <Route path="orders" element={<POListPage />} />
                <Route path="orders/new" element={<POFormPage />} />
                <Route path="orders/:id" element={<PODetailPage />} />
                <Route path="orders/:id/edit" element={<POFormPage />} />
                <Route path="debt" element={<SupplierDebtPage />} />
                <Route path="payments" element={<PaymentListPage />} />
              </Route>

              {/* ===== USER SETTINGS ===== */}
              <Route path="settings" element={<UserSettingsPage />} />
              <Route path="account" element={<UserSettingsPage />} />
              <Route path="profile" element={<UserSettingsPage />} />

              {/* ===== REDIRECTS ===== */}
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