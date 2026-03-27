// ============================================================
// APP.TSX - UPDATED WITH B2B CHAT MODULE + MONTHLY TIMESHEET
// File: src/App.tsx
// ============================================================
// CHANGES:
// - ✅ Partner Portal Routes (/partner/*)
// - ★ B2B Chat Routes cho Nhân viên (/b2b/chat, /b2b/chat/:id) - NEW
// - ★ Monthly Timesheet Route (/attendance/monthly) - NEW
// - Đã xóa các B2B pages cũ (chưa tạo lại)
// ============================================================

import { useEffect, Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from './stores/authStore';

// Layout
import { MainLayout } from './components/common/MainLayout';

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

// ★ Bảng chấm công tháng
import MonthlyTimesheetPage from './features/attendance/MonthlyTimesheetPage';

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

// ✅ PHASE 7: Báo cáo mua hàng
import PurchaseReportPage from './features/purchasing/pages/PurchaseReportPage';

// ✅ Notification Page
import NotificationPage from './pages/b2b/NotificationPage';

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
// Phase 5: Tồn kho & Cảnh báo
import InventoryDashboard from './pages/wms/InventoryDashboard';
import InventoryDetailPage from './pages/wms/InventoryDetailPage';
import AlertListPage from './pages/wms/AlertListPage';
import StockCheckPage from './pages/wms/StockCheckPage';
import NVLDashboardPage from './pages/wms/NVLDashboardPage';
// ✅ Phase 6: QC Tracking & DRC
import QCDashboardPage from './pages/wms/qc/QCDashboardPage';
import QCRecheckPage from './pages/wms/qc/QCRecheckPage';
import QCStandardsConfigPage from './pages/wms/qc/QCStandardsConfigPage';
import BatchQCHistoryPage from './pages/wms/qc/BatchQCHistoryPage';
import QCQuickScanPage from './pages/wms/qc/QCQuickScanPage';

// ✅ Batch Label — In nhãn QR cho bãi mủ
import BatchLabelPage from './pages/wms/BatchLabelPage';

// ✅ Phase 7: Trạm cân xe (Weighbridge)
import WeighbridgePage from './pages/wms/weighbridge/WeighbridgePage';
import WeighbridgeListPage from './pages/wms/weighbridge/WeighbridgeListPage';
import WeighbridgeDetailPage from './pages/wms/weighbridge/WeighbridgeDetailPage';

// ===== LÝ LỊCH MỦ — Phase 3.5 (Group riêng) =====
import RubberSupplierListPage from './pages/wms/rubber-suppliers/RubberSupplierListPage';
import RubberSupplierFormPage from './pages/wms/rubber-suppliers/RubberSupplierFormPage';
import RubberSupplierDetailPage from './pages/wms/rubber-suppliers/RubberSupplierDetailPage';
import RubberIntakeListPage from './pages/wms/rubber-intake/RubberIntakeListPage';
import RubberIntakeDetailPage from './pages/wms/rubber-intake/RubberIntakeDetailPage';
import RubberDailyReportPage from './pages/wms/rubber-intake/RubberDailyReportPage';
import RubberDebtPage from './pages/wms/rubber-intake/RubberDebtPage';

// ===== PHASE 3.6: THU MUA MỦ VIỆT + LÀO =====
import VnBatchListPage from './pages/rubber/vn/VnBatchListPage';
import LaoTransferPage from './pages/rubber/lao/LaoTransferPage';
import LaoPurchasePage from './pages/rubber/lao/LaoPurchasePage';
import RubberProfilePage from './pages/rubber/RubberProfilePage';
import LaoShipmentPage from './pages/rubber/lao/LaoShipmentPage';
import SettlementPage from './pages/rubber/SettlementPage';
import RubberDashboard from './pages/rubber/RubberDashboard';

// ===== YARD MAP =====
import YardMapPage from './pages/wms/YardMapPage';

// ===== P8: PRODUCTION MODULE =====
import ProductionListPage from './pages/wms/production/ProductionListPage';
import ProductionCreatePage from './pages/wms/production/ProductionCreatePage';
import ProductionDetailPage from './pages/wms/production/ProductionDetailPage';
import ProductionStagePage from './pages/wms/production/ProductionStagePage';
import ProductionDashboardPage from './pages/wms/production/ProductionDashboardPage';
import ProductionOutputPage from './pages/wms/production/ProductionOutputPage';
import ProductionFacilitiesPage from './pages/wms/production/ProductionFacilitiesPage';
import ProductionSpecsPage from './pages/wms/production/ProductionSpecsPage';

// ===== P9: BLENDING MODULE =====
import BlendListPage from './pages/wms/blending/BlendListPage';
import BlendCreatePage from './pages/wms/blending/BlendCreatePage';
import BlendDetailPage from './pages/wms/blending/BlendDetailPage';
import BlendSuggestPage from './pages/wms/blending/BlendSuggestPage';

// ===== P10: WMS REPORTS =====
import WMSReportDashboardPage from './pages/wms/reports/WMSReportDashboardPage';
import StockMovementReportPage from './pages/wms/reports/StockMovementReportPage';
import SupplierQualityReportPage from './pages/wms/reports/SupplierQualityReportPage';
import InventoryValueReportPage from './pages/wms/reports/InventoryValueReportPage';
import SupplierScoringPage from './pages/wms/reports/SupplierScoringPage';

// ===== P11: WMS SETTINGS & FORECAST =====
import WMSSettingsPage from './pages/wms/WMSSettingsPage';

// ===== PROJECT MANAGEMENT MODULE =====
import ProjectCategoryPage from './pages/projects/ProjectCategoryPage';
import ProjectTemplateList from './pages/projects/ProjectTemplateList';
import ProjectListPage from './pages/projects/ProjectListPage';
import ProjectCreatePage from './pages/projects/ProjectCreatePage';
import ProjectDetailPage from './pages/projects/ProjectDetailPage';
import ProjectGanttPage from './pages/projects/ProjectGanttPage';
import MultiProjectGanttPage from './pages/projects/MultiProjectGanttPage';
import ProjectResourcePage from './pages/projects/ProjectResourcePage';
import CapacityPlanningPage from './pages/projects/CapacityPlanningPage';

// ============================================================
// ★ B2B MODULE — Dashboard, Chat, Deals, Ledger, Settlements, Reports
// ============================================================
const TaskTemplateListPage = lazy(() => import('./pages/tasks/TaskTemplateListPage'));
const TaskKanbanPage = lazy(() => import('./pages/tasks/TaskKanbanPage'));
const B2BDashboardPage = lazy(() => import('./pages/b2b/B2BDashboardPage'));
const B2BChatListPage = lazy(() => import('./pages/b2b/B2BChatListPage'));
const B2BChatRoomPage = lazy(() => import('./pages/b2b/B2BChatRoomPage'));
const DealListPage = lazy(() => import('./pages/b2b/deals/DealListPage'));
const DealCreatePage = lazy(() => import('./pages/b2b/deals/DealCreatePage'));
const DealDetailPage = lazy(() => import('./pages/b2b/deals/DealDetailPage'));
// Partners
const PartnerListPage = lazy(() => import('./pages/b2b/partners/PartnerListPage'));
const PartnerDetailPage = lazy(() => import('./pages/b2b/partners/PartnerDetailPage'));
// Phase E5: Công nợ & Quyết toán
const LedgerOverviewPage = lazy(() => import('./pages/b2b/ledger/LedgerOverviewPage'));
const PartnerLedgerPage = lazy(() => import('./pages/b2b/ledger/PartnerLedgerPage'));
const SettlementListPage = lazy(() => import('./pages/b2b/settlements/SettlementListPage'));
const SettlementCreatePage = lazy(() => import('./pages/b2b/settlements/SettlementCreatePage'));
const SettlementDetailPage = lazy(() => import('./pages/b2b/settlements/SettlementDetailPage'));
const LedgerReportPage = lazy(() => import('./pages/b2b/reports/LedgerReportPage'));
const PickupLocationSettingsPage = lazy(() => import('./pages/b2b/PickupLocationSettingsPage'));
// B2B Demands
const DemandListPage = lazy(() => import('./pages/b2b/demands/DemandListPage'));
const DemandCreatePage = lazy(() => import('./pages/b2b/demands/DemandCreatePage'));
const DemandDetailPage = lazy(() => import('./pages/b2b/demands/DemandDetailPage'))

// ===== SALES MODULE =====
const CustomerListPage = lazy(() => import('./pages/sales/CustomerListPage'))
const CustomerDetailPage = lazy(() => import('./pages/sales/CustomerDetailPage'));
const SalesOrderListPage = lazy(() => import('./pages/sales/SalesOrderListPage'))
const SalesOrderCreatePage = lazy(() => import('./pages/sales/SalesOrderCreatePage'))
const SalesOrderDetailPage = lazy(() => import('./pages/sales/SalesOrderDetailPage'))
const ContainerPackingPage = lazy(() => import('./pages/sales/ContainerPackingPage'))
const ExportDocumentsPage = lazy(() => import('./pages/sales/ExportDocumentsPage'))
const SalesDashboardPage = lazy(() => import('./pages/sales/SalesDashboardPage'))


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

function LoadingSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthInitializer>
          <Routes>
            {/* ============================================================ */}
            {/* ERP Login                                                    */}
            {/* ============================================================ */}
            <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />

            {/* ============================================================ */}
            {/* Protected Routes — ERP Internal                              */}
            {/* ============================================================ */}
            <Route path="/" element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
              <Route index element={<DashboardPage />} />

              {/* ============================================================ */}
              {/* ★ B2B MODULE — Chat Only (NEW)                              */}
              {/* ============================================================ */}
              <Route path="b2b">
                <Route index element={<Suspense fallback={<LoadingSpinner />}><B2BDashboardPage /></Suspense>} />
                {/* B2B Chat */}
                <Route path="chat" element={<Suspense fallback={<LoadingSpinner />}><B2BChatListPage /></Suspense>} />
                <Route path="chat/:roomId" element={<Suspense fallback={<LoadingSpinner />}><B2BChatRoomPage /></Suspense>} />
                {/* B2B Partners */}
                <Route path="partners" element={<Suspense fallback={<LoadingSpinner />}><PartnerListPage /></Suspense>} />
                <Route path="partners/:id" element={<Suspense fallback={<LoadingSpinner />}><PartnerDetailPage /></Suspense>} />
                {/* B2B Deals */}
                <Route path="deals" element={<Suspense fallback={<LoadingSpinner />}><DealListPage /></Suspense>} />
                <Route path="deals/new" element={<Suspense fallback={<LoadingSpinner />}><DealCreatePage /></Suspense>} />
                <Route path="deals/:id" element={<Suspense fallback={<LoadingSpinner />}><DealDetailPage /></Suspense>} />
                {/* B2B Ledger (Phase E5) */}
                <Route path="ledger" element={<Suspense fallback={<LoadingSpinner />}><LedgerOverviewPage /></Suspense>} />
                <Route path="ledger/:partnerId" element={<Suspense fallback={<LoadingSpinner />}><PartnerLedgerPage /></Suspense>} />
                {/* B2B Settlements (Phase E5) */}
                <Route path="settlements" element={<Suspense fallback={<LoadingSpinner />}><SettlementListPage /></Suspense>} />
                <Route path="settlements/new" element={<Suspense fallback={<LoadingSpinner />}><SettlementCreatePage /></Suspense>} />
                <Route path="settlements/:id" element={<Suspense fallback={<LoadingSpinner />}><SettlementDetailPage /></Suspense>} />
                {/* B2B Reports (Phase E5) */}
                <Route path="reports" element={<Suspense fallback={<LoadingSpinner />}><LedgerReportPage /></Suspense>} />
                {/* B2B Demands */}
                <Route path="demands" element={<Suspense fallback={<LoadingSpinner />}><DemandListPage /></Suspense>} />
                <Route path="demands/new" element={<Suspense fallback={<LoadingSpinner />}><DemandCreatePage /></Suspense>} />
                <Route path="demands/:id" element={<Suspense fallback={<LoadingSpinner />}><DemandDetailPage /></Suspense>} />
                {/* B2B Pickup Locations */}
                <Route path="pickup-locations" element={<Suspense fallback={<LoadingSpinner />}><PickupLocationSettingsPage /></Suspense>} />
              </Route>

              {/* ===== SALES MODULE ===== */}
              <Route path="sales/dashboard" element={<Suspense fallback={<LoadingSpinner />}><SalesDashboardPage /></Suspense>} />
              <Route path="sales/customers" element={<Suspense fallback={<LoadingSpinner />}><CustomerListPage /></Suspense>} />
              <Route path="sales/customers/:customerId" element={<Suspense fallback={<LoadingSpinner />}><CustomerDetailPage /></Suspense>} />
              <Route path="sales/orders" element={<Suspense fallback={<LoadingSpinner />}><SalesOrderListPage /></Suspense>} />
              <Route path="sales/orders/new" element={<Suspense fallback={<LoadingSpinner />}><SalesOrderCreatePage /></Suspense>} />
              <Route path="sales/orders/:orderId" element={<Suspense fallback={<LoadingSpinner />}><SalesOrderDetailPage /></Suspense>} />
              <Route path="sales/orders/:orderId/packing" element={<Suspense fallback={<LoadingSpinner />}><ContainerPackingPage /></Suspense>} />
              <Route path="sales/orders/:orderId/documents" element={<Suspense fallback={<LoadingSpinner />}><ExportDocumentsPage /></Suspense>} />

              {/* ===== WMS MODULE ===== */}
              <Route path="wms">
                <Route index element={<InventoryDashboard />} />
                <Route path="nvl-dashboard" element={<NVLDashboardPage />} />
                <Route path="materials" element={<WMSMaterialListPage />} />
                <Route path="warehouses" element={<WMSWarehouseListPage />} />
                <Route path="warehouses/:id/locations" element={<WMSWarehouseLocationPage />} />
                <Route path="stock-in" element={<StockInListPage />} />
                <Route path="stock-in/new" element={<StockInCreatePage />} />
                <Route path="stock-in/:id" element={<StockInDetailPage />} />
                <Route path="stock-out" element={<StockOutListPage />} />
                <Route path="stock-out/new" element={<StockOutCreatePage />} />
                <Route path="stock-out/:id" element={<StockOutDetailPage />} />
                <Route path="stock-out/:id/pick" element={<PickingListPage />} />
                <Route path="inventory/:materialId" element={<InventoryDetailPage />} />
                <Route path="alerts" element={<AlertListPage />} />
                <Route path="stock-check" element={<StockCheckPage />} />
                <Route path="qc" element={<QCDashboardPage />} />
                <Route path="qc/recheck" element={<QCRecheckPage />} />
                <Route path="qc/standards" element={<QCStandardsConfigPage />} />
                <Route path="qc/quick-scan" element={<QCQuickScanPage />} />
                <Route path="qc/batch/:batchId" element={<BatchQCHistoryPage />} />
                {/* Batch Label — In nhãn QR */}
                <Route path="batch/:batchId/label" element={<BatchLabelPage />} />
                {/* Trang cân chuyển sang can.huyanhrubber.vn — ERP chỉ giữ lịch sử + chi tiết */}
                <Route path="weighbridge" element={<WeighbridgeListPage />} />
                <Route path="weighbridge/list" element={<WeighbridgeListPage />} />
                <Route path="weighbridge/:id" element={<WeighbridgeDetailPage />} />
                {/* P8: Production */}
                <Route path="production" element={<ProductionListPage />} />
                <Route path="production/dashboard" element={<ProductionDashboardPage />} />
                <Route path="production/new" element={<ProductionCreatePage />} />
                <Route path="production/:id" element={<ProductionDetailPage />} />
                <Route path="production/:id/stage/:stageNumber" element={<ProductionStagePage />} />
                <Route path="production/:id/output" element={<ProductionOutputPage />} />
                <Route path="production/facilities" element={<ProductionFacilitiesPage />} />
                <Route path="production/specs" element={<ProductionSpecsPage />} />
                {/* P9: Blending */}
                <Route path="blending" element={<BlendListPage />} />
                <Route path="blending/new" element={<BlendCreatePage />} />
                <Route path="blending/suggest" element={<BlendSuggestPage />} />
                <Route path="blending/:id" element={<BlendDetailPage />} />
                {/* P10: Reports */}
                <Route path="reports" element={<WMSReportDashboardPage />} />
                <Route path="reports/stock-movement" element={<StockMovementReportPage />} />
                <Route path="reports/supplier-quality" element={<SupplierQualityReportPage />} />
                <Route path="reports/inventory-value" element={<InventoryValueReportPage />} />
                <Route path="reports/supplier-scoring" element={<SupplierScoringPage />} />
                {/* P11: Settings */}
                <Route path="settings" element={<WMSSettingsPage />} />
                {/* Yard Map */}
                <Route path="yard-map" element={<YardMapPage />} />
              </Route>

              {/* ===== RUBBER MODULE ===== */}
              <Route path="rubber">
                <Route index element={<Navigate to="/rubber/suppliers" replace />} />
                <Route path="suppliers" element={<RubberSupplierListPage />} />
                <Route path="suppliers/new" element={<RubberSupplierFormPage />} />
                <Route path="suppliers/:id" element={<RubberSupplierDetailPage />} />
                <Route path="suppliers/:id/edit" element={<RubberSupplierFormPage />} />
                <Route path="intake" element={<RubberIntakeListPage />} />
                <Route path="intake/:id" element={<RubberIntakeDetailPage />} />
                <Route path="daily-report" element={<RubberDailyReportPage />} />
                <Route path="debt" element={<RubberDebtPage />} />
                <Route path="vn/batches" element={<VnBatchListPage />} />
                <Route path="lao/transfers" element={<LaoTransferPage />} />
                <Route path="lao/purchases" element={<LaoPurchasePage />} />
                <Route path="lao/shipments" element={<LaoShipmentPage />} />
                <Route path="profiles" element={<RubberProfilePage />} />
                <Route path="settlements" element={<SettlementPage />} />
                <Route path="dashboard" element={<RubberDashboard />} />
              </Route>

              {/* ===== PROJECTS MODULE ===== */}
              <Route path="projects">
                <Route index element={<Navigate to="/projects/list" replace />} />
                <Route path="categories" element={<ProjectCategoryPage />} />
                <Route path="templates" element={<ProjectTemplateList />} />
                <Route path="list" element={<ProjectListPage />} />
                <Route path="new" element={<ProjectCreatePage />} />
                <Route path=":id" element={<ProjectDetailPage />} />
                <Route path=":id/gantt" element={<ProjectGanttPage />} />
                <Route path="gantt" element={<MultiProjectGanttPage />} />
                <Route path=":id/resources" element={<ProjectResourcePage />} />
                <Route path="resources" element={<CapacityPlanningPage />} />
              </Route>

              {/* ===== HR MODULE ===== */}
              <Route path="departments" element={<DepartmentListPage />} />
              <Route path="positions" element={<PositionListPage />} />
              <Route path="employees" element={<EmployeeListPage />} />
              <Route path="contract-types" element={<ContractTypeListPage />} />
              <Route path="contracts" element={<ContractListPage />} />
              <Route path="leave-types" element={<LeaveTypeListPage />} />
              <Route path="leave-requests" element={<LeaveRequestListPage />} />
              <Route path="leave-approvals" element={<LeaveApprovalPage />} />
              <Route path="attendance" element={<AttendanceListPage />} />
              <Route path="attendance/monthly" element={<MonthlyTimesheetPage />} />
              <Route path="shifts" element={<ShiftListPage />} />
              <Route path="shift-assignments" element={<ShiftCalendarPage />} />
              <Route path="shift-teams" element={<TeamManagementPage />} />
              <Route path="overtime" element={<OvertimeListPage />} />
              <Route path="overtime/approval" element={<OvertimeApprovalPage />} />
              <Route path="salary-grades" element={<SalaryGradeListPage />} />
              <Route path="payroll-periods" element={<PayrollPeriodListPage />} />
              <Route path="payslips" element={<PayslipListPage />} />
              <Route path="performance-criteria" element={<PerformanceCriteriaListPage />} />
              <Route path="performance-reviews" element={<PerformanceReviewListPage />} />

              {/* ===== TASKS MODULE ===== */}
              <Route path="tasks" element={<TaskListPage />} />
              <Route path="tasks/create" element={<TaskCreatePage />} />
              <Route path="tasks/new" element={<TaskCreatePage />} />
              <Route path="tasks/:id" element={<TaskViewPage />} />
              <Route path="tasks/:id/edit" element={<TaskEditPage />} />
              <Route path="my-tasks" element={<MyTasksPage />} />
              <Route path="approvals" element={<ApprovalsPage />} />
              <Route path="evaluations/self-evaluation" element={<SelfEvaluationPage />} />
              <Route path="self-evaluation" element={<SelfEvaluationPage />} />
              <Route path="task-detail/:taskId" element={<TaskDetailPage />} />
              <Route path="my-tasks/:taskId" element={<TaskDetailPage />} />
              <Route path="reports/tasks" element={<TaskReportsPage />} />
              <Route path="tasks/kanban" element={<Suspense fallback={<LoadingSpinner />}><TaskKanbanPage /></Suspense>} />
              <Route path="task-templates" element={<Suspense fallback={<LoadingSpinner />}><TaskTemplateListPage /></Suspense>} />

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
                <Route path="reports" element={<PurchaseReportPage />} />
              </Route>

              {/* ===== OTHER ===== */}
              <Route path="notifications" element={<NotificationPage />} />
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