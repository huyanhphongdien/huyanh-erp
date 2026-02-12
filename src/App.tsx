// ============================================================
// APP.TSX - UPDATED WITH WMS + LÝ LỊCH MỦ + PHASE 3.6 ROUTES
// File: src/App.tsx
// ============================================================
// CHANGES:
// - Fixed WMS import paths (warehouses was nested under materials/)
// - Added Phase 3 imports: StockInListPage, StockInCreatePage, StockInDetailPage
// - Added Phase 4 imports: StockOutListPage, StockOutCreatePage, StockOutDetailPage, PickingListPage
// - Added all Phase 4 routes
// - ✅ Lý lịch mủ Phase 3.5 — 7 pages, 8 routes, prefix /rubber/
// - ✅ NEW Phase 3.6 — Thu mua mủ Việt + Lào: 7 pages, 8 routes
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

// ✅ Leave Approvals
import LeaveApprovalPage from './features/leave-requests/LeaveApprovalPage';

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

// ✅ Quản lý đội ca (2 team × 3 ca)
import { TeamManagementPage } from './features/shift-assignments';

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

// ===== PHASE P5: Payments & Debt Tracking =====
import InvoiceDetailPage from './features/purchasing/pages/InvoiceDetailPage';
import SupplierDebtPage from './features/purchasing/pages/SupplierDebtPage';
import PaymentListPage from './features/purchasing/pages/PaymentListPage';

// ===== PHASE 6: Access Control =====
import AccessManagementPage from './features/purchasing/pages/AccessManagementPage';

// ✅ Notification Page
import NotificationPage from './pages/NotificationPage';

// ===== WMS MODULE: Kho Thành phẩm =====
// Phase 2: Danh mục
import WMSMaterialListPage from './pages/wms/materials/MaterialListPage';
import WMSWarehouseListPage from './pages/wms/warehouses/WarehouseListPage';
import WMSWarehouseLocationPage from './pages/wms/warehouses/WarehouseLocationPage';
// Phase 3: Nhập kho thành phẩm
import StockInListPage from './pages/wms/stock-in/StockInListPage';
import StockInCreatePage from './pages/wms/stock-in/StockInCreatePage';
import StockInDetailPage from './pages/wms/stock-in/StockInDetailPage';
// Phase 4: Xuất kho
import StockOutListPage from './pages/wms/stock-out/StockOutListPage';
import StockOutCreatePage from './pages/wms/stock-out/StockOutCreatePage';
import StockOutDetailPage from './pages/wms/stock-out/StockOutDetailPage';
import PickingListPage from './pages/wms/stock-out/PickingListPage';

// ===== LÝ LỊCH MỦ — Phase 3.5 (Group riêng) =====
// Folder: pages/wms/rubber-suppliers/
import RubberSupplierListPage from './pages/wms/rubber-suppliers/RubberSupplierListPage';
import RubberSupplierFormPage from './pages/wms/rubber-suppliers/RubberSupplierFormPage';
import RubberSupplierDetailPage from './pages/wms/rubber-suppliers/RubberSupplierDetailPage';
// Folder: pages/wms/rubber-intake/
import RubberIntakeListPage from './pages/wms/rubber-intake/RubberIntakeListPage';
import RubberIntakeDetailPage from './pages/wms/rubber-intake/RubberIntakeDetailPage';
import RubberDailyReportPage from './pages/wms/rubber-intake/RubberDailyReportPage';
import RubberDebtPage from './pages/wms/rubber-intake/RubberDebtPage';

// ===== PHASE 3.6: THU MUA MỦ VIỆT + LÀO =====
// Folder: pages/rubber/
import VnBatchListPage from './pages/rubber/vn/VnBatchListPage';
import LaoTransferPage from './pages/rubber/lao/LaoTransferPage';
import LaoPurchasePage from './pages/rubber/lao/LaoPurchasePage';
import RubberProfilePage from './pages/rubber/RubberProfilePage';
import LaoShipmentPage from './pages/rubber/lao/LaoShipmentPage';
import SettlementPage from './pages/rubber/SettlementPage';
import RubberDashboard from './pages/rubber/RubberDashboard';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

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

function AuthInitializer({ children }: { children: React.ReactNode }) {
  const { checkAuth } = useAuthStore();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  return <>{children}</>;
}

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

            {/* Protected Routes */}
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

              {/* ===== WMS MODULE: Kho Thành phẩm ===== */}
              <Route path="wms">
                <Route index element={<Navigate to="/wms/materials" replace />} />
                {/* Phase 2: Danh mục cơ bản */}
                <Route path="materials" element={<WMSMaterialListPage />} />
                <Route path="warehouses" element={<WMSWarehouseListPage />} />
                <Route path="warehouses/:id/locations" element={<WMSWarehouseLocationPage />} />
                {/* Phase 3: Nhập kho thành phẩm */}
                <Route path="stock-in" element={<StockInListPage />} />
                <Route path="stock-in/new" element={<StockInCreatePage />} />
                <Route path="stock-in/:id" element={<StockInDetailPage />} />
                {/* Phase 4: Xuất kho */}
                <Route path="stock-out" element={<StockOutListPage />} />
                <Route path="stock-out/new" element={<StockOutCreatePage />} />
                <Route path="stock-out/:id" element={<StockOutDetailPage />} />
                <Route path="stock-out/:id/pick" element={<PickingListPage />} />
              </Route>

              {/* ============================================================ */}
              {/* LÝ LỊCH MỦ — Phase 3.5 (Group riêng, prefix /rubber/)       */}
              {/* ============================================================ */}
              <Route path="rubber">
                <Route index element={<Navigate to="/rubber/suppliers" replace />} />
                {/* NCC Mủ — Nhà cung cấp mủ cao su */}
                <Route path="suppliers" element={<RubberSupplierListPage />} />
                <Route path="suppliers/new" element={<RubberSupplierFormPage />} />
                <Route path="suppliers/:id" element={<RubberSupplierDetailPage />} />
                <Route path="suppliers/:id/edit" element={<RubberSupplierFormPage />} />
                {/* Phiếu nhập mủ */}
                <Route path="intake" element={<RubberIntakeListPage />} />
                <Route path="intake/:id" element={<RubberIntakeDetailPage />} />
                {/* Báo cáo & Công nợ */}
                <Route path="daily-report" element={<RubberDailyReportPage />} />
                <Route path="debt" element={<RubberDebtPage />} />

                {/* ======================================================== */}
                {/* PHASE 3.6: Thu mua mủ Việt + Lào                         */}
                {/* ======================================================== */}
                {/* Mủ Việt — Bảng chốt */}
                <Route path="vn/batches" element={<VnBatchListPage />} />
                {/* Lào — Chuyển tiền */}
                <Route path="lao/transfers" element={<LaoTransferPage />} />
                {/* Lào — Thu mua */}
                <Route path="lao/purchases" element={<LaoPurchasePage />} />
                {/* Lào — Xuất kho → NM */}
                <Route path="lao/shipments" element={<LaoShipmentPage />} />
                {/* Lý lịch phiếu mủ (chung) */}
                <Route path="profiles" element={<RubberProfilePage />} />
                {/* Quyết toán thanh toán */}
                <Route path="settlements" element={<SettlementPage />} />
                {/* Dashboard tổng hợp */}
                <Route path="dashboard" element={<RubberDashboard />} />
              </Route>

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
              <Route path="leave-approvals" element={<LeaveApprovalPage />} />

              {/* ===== CHẤM CÔNG V2 ===== */}
              <Route path="attendance" element={<AttendanceListPage />} />
              <Route path="shifts" element={<ShiftListPage />} />
              <Route path="shift-assignments" element={<ShiftCalendarPage />} />
              <Route path="shift-teams" element={<TeamManagementPage />} />
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
                <Route path="invoices/:id" element={<InvoiceDetailPage />} />
                <Route path="debt" element={<SupplierDebtPage />} />
                <Route path="payments" element={<PaymentListPage />} />
                <Route path="access" element={<AccessManagementPage />} />
              </Route>

              {/* ✅ Notifications */}
              <Route path="notifications" element={<NotificationPage />} />

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