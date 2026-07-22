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
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from './stores/authStore';

// Layout
import { MainLayout } from './components/common/MainLayout';
import AdminGate from './components/common/AdminGate';

// Auth
import { LoginPage } from './features/auth/LoginPage';

// ===== LAZY LOADED PAGES — Mobile Performance Optimization =====
// Heavy pages (>500 lines) and less-frequently-used pages are lazy-loaded
// to reduce initial bundle size for mobile users on slow networks.

const DashboardPage = lazy(() => import('./features/dashboard/DashboardPage'));

// Phase 3.1: Phòng ban, Chức vụ, Nhân viên
const DepartmentListPage = lazy(() => import('./features/departments').then(m => ({ default: m.DepartmentListPage })));
const PositionListPage = lazy(() => import('./features/positions').then(m => ({ default: m.PositionListPage })));
const EmployeeListPage = lazy(() => import('./features/employees').then(m => ({ default: m.EmployeeListPage })));

// Phase 3.2: Hợp đồng
const ContractTypeListPage = lazy(() => import('./features/contract-types').then(m => ({ default: m.ContractTypeListPage })));
const ContractListPage = lazy(() => import('./features/contracts').then(m => ({ default: m.ContractListPage })));

// Phase 3.3: Nghỉ phép, Chấm công
const LeaveTypeListPage = lazy(() => import('./features/leave-types').then(m => ({ default: m.LeaveTypeListPage })));
const LeaveRequestListPage = lazy(() => import('./features/leave-requests').then(m => ({ default: m.LeaveRequestListPage })));
const AttendanceListPage = lazy(() => import('./features/attendance').then(m => ({ default: m.AttendanceListPage })));
const LeaveApprovalPage = lazy(() => import('./features/leave-requests/LeaveApprovalPage'));

// Phase 3.4: Lương, Đánh giá
const SalaryGradeListPage = lazy(() => import('./features/salary-grades').then(m => ({ default: m.SalaryGradeListPage })));
const PayrollPeriodListPage = lazy(() => import('./features/payroll').then(m => ({ default: m.PayrollPeriodListPage })));
const PayslipListPage = lazy(() => import('./features/payslips').then(m => ({ default: m.PayslipListPage })));
const PerformanceCriteriaListPage = lazy(() => import('./features/performance-criteria').then(m => ({ default: m.PerformanceCriteriaListPage })));
const PerformanceReviewListPage = lazy(() => import('./features/performance-reviews').then(m => ({ default: m.PerformanceReviewListPage })));

// Phase 4.1: Task Management
const TaskListPage = lazy(() => import('./features/tasks').then(m => ({ default: m.TaskListPage })));
// GĐ 5 — "Cần anh xem": duyệt theo NGOẠI LỆ + xuất Nhật ký Excel
const TaskExceptionsPage = lazy(() => import('./pages/tasks/TaskExceptionsPage'));
const TaskCreatePage = lazy(() => import('./features/tasks').then(m => ({ default: m.TaskCreatePage })));
const TaskEditPage = lazy(() => import('./features/tasks').then(m => ({ default: m.TaskEditPage })));
const TaskViewPage = lazy(() => import('./features/tasks').then(m => ({ default: m.TaskViewPage })));

// Phase 4.3: Evaluation & Approval
const MyTasksPage = lazy(() => import('./pages/evaluations/MyTasksPage'));
const ApprovalsPage = lazy(() => import('./pages/evaluations/ApprovalPage'));
const SelfEvaluationPage = lazy(() => import('./pages/evaluations/SelfEvaluationPage'));
const TaskDetailPage = lazy(() => import('./pages/evaluations/TaskDetailPage'));
const BatchApprovePage = lazy(() => import('./pages/tasks/BatchApprovePage'));

// Phase 6.3: Task Reports
const TaskReportsPage = lazy(() => import('./features/reports/TaskReportsPage'));

// Performance Dashboard
const PerformanceDashboardPage = lazy(() => import('./pages/performance/PerformanceDashboardPage'));
const EmployeePerformancePage = lazy(() => import('./pages/performance/EmployeePerformancePage'));
const PerformanceReportPage = lazy(() => import('./pages/performance/PerformanceReportPage'));
const PerformanceConfigPage = lazy(() => import('./pages/performance/PerformanceConfigPage'));

// Operations
const CoverageDashboardPage = lazy(() => import('./pages/operations/CoverageDashboardPage'));

// User Settings
const UserSettingsPage = lazy(() => import('./pages/settings/UserSettingsPage'));

// ===== MOBILE CÔNG KHAI: quét QR máy → báo hỏng (KHÔNG cần đăng nhập) =====
const MachineReportPage = lazy(() => import('./pages/mobile/MachineReportPage'));
// ===== MOBILE thợ bảo trì (đăng nhập): hàng chờ phiếu báo hỏng =====
const MachineQueuePage = lazy(() => import('./pages/mobile/MachineQueuePage'));
// ===== APP "Huy Anh Ops" — vỏ mobile 4 tab (Hôm nay/Tuần tra/Ca/Công) =====
const OpsShell = lazy(() => import('./pages/mobile/OpsShell'));
const OpsHome = lazy(() => import('./pages/mobile/OpsHome'));
const OpsPatrol = lazy(() => import('./pages/mobile/OpsPatrol'));
const OpsShift = lazy(() => import('./pages/mobile/OpsShift'));
const OpsTimesheet = lazy(() => import('./pages/mobile/OpsTimesheet'));

// ===== CHẤM CÔNG V2: Ca, Phân ca, Tăng ca =====
const ShiftListPage = lazy(() => import('./features/shifts').then(m => ({ default: m.ShiftListPage })));
const ShiftCalendarPage = lazy(() => import('./features/shift-assignments').then(m => ({ default: m.ShiftCalendarPage })));
const OvertimeListPage = lazy(() => import('./features/overtime').then(m => ({ default: m.OvertimeListPage })));
const OvertimeApprovalPage = lazy(() => import('./features/overtime').then(m => ({ default: m.OvertimeApprovalPage })));
const TeamManagementPage = lazy(() => import('./features/shift-assignments').then(m => ({ default: m.TeamManagementPage })));

// ★ Bảng chấm công tháng
const MonthlyTimesheetPage = lazy(() => import('./features/attendance/MonthlyTimesheetPage'));
const QRCheckInPage = lazy(() => import('./features/attendance/QRCheckInPage'));

// ★ Production MES (QLSX)
const ProductionStepTrackerPage = lazy(() => import('./pages/production/ProductionStepTrackerPage'));
const DowntimeLogPage = lazy(() => import('./pages/production/DowntimeLogPage'));
const ShiftReportPage = lazy(() => import('./pages/production/ShiftReportPage'));
const ProductionLiveBoard = lazy(() => import('./pages/production/ProductionLiveBoard'));
const OEEDashboardPage = lazy(() => import('./pages/production/OEEDashboardPage'));
const SOPListPage = lazy(() => import('./pages/production/SOPListPage'));
const SOPTrainingPage = lazy(() => import('./pages/production/SOPTrainingPage'));
const SafetySignsPage = lazy(() => import('./pages/production/SafetySignsPage'));

// ★ Đơn công tác
const BusinessTripPage = lazy(() => import('./features/attendance/BusinessTripPage'));

// ===== PURCHASING MODULE (lazy) =====
const SupplierListPage = lazy(() => import('./features/purchasing').then(m => ({ default: m.SupplierListPage })));
const SupplierCreatePage = lazy(() => import('./features/purchasing').then(m => ({ default: m.SupplierCreatePage })));
const SupplierEditPage = lazy(() => import('./features/purchasing').then(m => ({ default: m.SupplierEditPage })));
const SupplierDetailPage = lazy(() => import('./features/purchasing').then(m => ({ default: m.SupplierDetailPage })));
const CategoryListPage = lazy(() => import('./features/purchasing').then(m => ({ default: m.CategoryListPage })));
const TypeListPage = lazy(() => import('./features/purchasing').then(m => ({ default: m.TypeListPage })));
const UnitListPage = lazy(() => import('./features/purchasing').then(m => ({ default: m.UnitListPage })));
const MaterialListPage = lazy(() => import('./features/purchasing').then(m => ({ default: m.MaterialListPage })));
const MaterialDetailPage = lazy(() => import('./features/purchasing').then(m => ({ default: m.MaterialDetailPage })));
const VariantAttributeManagement = lazy(() => import('./features/purchasing/pages/VariantAttributeManagement'));
const POListPage = lazy(() => import('./features/purchasing/pages/POListPage'));
const POFormPage = lazy(() => import('./features/purchasing/pages/POFormPage'));
const PODetailPage = lazy(() => import('./features/purchasing/pages/PODetailPage'));
const InvoiceDetailPage = lazy(() => import('./features/purchasing/pages/InvoiceDetailPage'));
const SupplierDebtPage = lazy(() => import('./features/purchasing/pages/SupplierDebtPage'));
const PaymentListPage = lazy(() => import('./features/purchasing/pages/PaymentListPage'));
const AccessManagementPage = lazy(() => import('./features/purchasing/pages/AccessManagementPage'));
const PurchaseReportPage = lazy(() => import('./features/purchasing/pages/PurchaseReportPage'));

// Notification Page
const NotificationPage = lazy(() => import('./pages/b2b/NotificationPage'));

// ===== WMS MODULE (lazy) =====
const WMSMaterialListPage = lazy(() => import('./pages/wms/materials/MaterialListPage'));
const WMSWarehouseListPage = lazy(() => import('./pages/wms/warehouses/WarehouseListPage'));
const WMSWarehouseLocationPage = lazy(() => import('./pages/wms/warehouses/WarehouseLocationPage'));
const StockInListPage = lazy(() => import('./pages/wms/stock-in/StockInListPage'));
const StockInCreatePage = lazy(() => import('./pages/wms/stock-in/StockInCreatePage'));
const StockInDetailPage = lazy(() => import('./pages/wms/stock-in/StockInDetailPage'));
const StockOutListPage = lazy(() => import('./pages/wms/stock-out/StockOutListPage'));
const StockOutCreatePage = lazy(() => import('./pages/wms/stock-out/StockOutCreatePage'));
const StockOutDetailPage = lazy(() => import('./pages/wms/stock-out/StockOutDetailPage'));
const PickingListPage = lazy(() => import('./pages/wms/stock-out/PickingListPage'));
// F3 — Inter-facility Transfer
const TransferListPage = lazy(() => import('./pages/wms/transfer/TransferListPage'));
const TransferCreatePage = lazy(() => import('./pages/wms/transfer/TransferCreatePage'));
const TransferDetailPage = lazy(() => import('./pages/wms/transfer/TransferDetailPage'));
// Phase A consolidation: các page rời (InventoryDashboard, NVLDashboardPage,
// AlertListPage, StockCheckPage, QCDashboardPage, QCRecheckPage, etc.) giờ
// chỉ render nội bộ trong 3 tabbed wrapper, không còn lazy import trực tiếp.
const WMSInventoryTabbedPage = lazy(() => import('./pages/wms/WMSInventoryTabbedPage'));
const WMSQCTabbedPage = lazy(() => import('./pages/wms/qc/WMSQCTabbedPage'));
const WMSReportsTabbedPage = lazy(() => import('./pages/wms/reports/WMSReportsTabbedPage'));
const InventoryDetailPage = lazy(() => import('./pages/wms/InventoryDetailPage'));
const BatchQCHistoryPage = lazy(() => import('./pages/wms/qc/BatchQCHistoryPage'));
const BatchLabelPage = lazy(() => import('./pages/wms/BatchLabelPage'));
const WeighbridgeListPage = lazy(() => import('./pages/wms/weighbridge/WeighbridgeListPage'));
const WeighbridgeDetailPage = lazy(() => import('./pages/wms/weighbridge/WeighbridgeDetailPage'));

// ===== Rubber Supply Chain (lazy) =====
const RubberSupplierListPage = lazy(() => import('./pages/wms/rubber-suppliers/RubberSupplierListPage'));
const RubberSupplierFormPage = lazy(() => import('./pages/wms/rubber-suppliers/RubberSupplierFormPage'));
const RubberSupplierDetailPage = lazy(() => import('./pages/wms/rubber-suppliers/RubberSupplierDetailPage'));
const RubberIntakeListPage = lazy(() => import('./pages/wms/rubber-intake/RubberIntakeListPage'));
const RubberIntakeDetailPage = lazy(() => import('./pages/wms/rubber-intake/RubberIntakeDetailPage'));
const RubberDailyReportPage = lazy(() => import('./pages/wms/rubber-intake/RubberDailyReportPage'));
const RubberDebtPage = lazy(() => import('./pages/wms/rubber-intake/RubberDebtPage'));
const PaymentRequestListPage = lazy(() => import('./pages/wms/rubber-intake/PaymentRequestListPage'));
const PaymentRequestCreatePage = lazy(() => import('./pages/wms/rubber-intake/PaymentRequestCreatePage'));
const PaymentRequestDetailPage = lazy(() => import('./pages/wms/rubber-intake/PaymentRequestDetailPage'));
const PaymentRequestPrintPage = lazy(() => import('./pages/wms/rubber-intake/PaymentRequestPrintPage'));
// ===== LOGISTICS / VẬN TẢI — Lệnh điều động + Đội xe =====
const FleetVehicleListPage = lazy(() => import('./pages/logistics/fleet/FleetVehicleListPage'));
const FleetDriverListPage = lazy(() => import('./pages/logistics/fleet/FleetDriverListPage'));
const DispatchListPage = lazy(() => import('./pages/logistics/dispatch/DispatchListPage'));
const DispatchCreatePage = lazy(() => import('./pages/logistics/dispatch/DispatchCreatePage'));
const DispatchDetailPage = lazy(() => import('./pages/logistics/dispatch/DispatchDetailPage'));
const DispatchPrintPage = lazy(() => import('./pages/logistics/dispatch/DispatchPrintPage'));
const FetchReportPage = lazy(() => import('./pages/logistics/dispatch/FetchReportPage'));
const FinanceLoanDashboard = lazy(() => import('./pages/finance/FinanceLoanDashboard'));
const FinanceLoanListPage = lazy(() => import('./pages/finance/FinanceLoanListPage'));
const FinanceDepositListPage = lazy(() => import('./pages/finance/FinanceDepositListPage'));
const FinanceCreditLinePage = lazy(() => import('./pages/finance/FinanceCreditLinePage'));
const FinanceInterestPage = lazy(() => import('./pages/finance/FinanceInterestPage'));
const FinanceCollateralPage = lazy(() => import('./pages/finance/FinanceCollateralPage'));
const FinanceReceivablePage = lazy(() => import('./pages/finance/FinanceReceivablePage'));
const FinanceCashPage = lazy(() => import('./pages/finance/FinanceCashPage'));
const FinanceCashflowDashboard = lazy(() => import('./pages/finance/FinanceCashflowDashboard'));
const FinanceAuditLogPage = lazy(() => import('./pages/finance/FinanceAuditLogPage'));
const VnBatchListPage = lazy(() => import('./pages/rubber/vn/VnBatchListPage'));
const LaoTransferPage = lazy(() => import('./pages/rubber/lao/LaoTransferPage'));
const LaoPurchasePage = lazy(() => import('./pages/rubber/lao/LaoPurchasePage'));
const RubberProfilePage = lazy(() => import('./pages/rubber/RubberProfilePage'));
const LaoShipmentPage = lazy(() => import('./pages/rubber/lao/LaoShipmentPage'));
const SettlementPage = lazy(() => import('./pages/rubber/SettlementPage'));
const RubberDashboard = lazy(() => import('./pages/rubber/RubberDashboard'));

// ===== YardMap, Production, Blending, Reports (lazy) =====
const YardMapPage = lazy(() => import('./pages/wms/YardMapPage'));
const ProductionListPage = lazy(() => import('./pages/wms/production/ProductionListPage'));
const ProductionCreatePage = lazy(() => import('./pages/wms/production/ProductionCreatePage'));
const ProductionDetailPage = lazy(() => import('./pages/wms/production/ProductionDetailPage'));
const ProductionStagePage = lazy(() => import('./pages/wms/production/ProductionStagePage'));
const ProductionDashboardPage = lazy(() => import('./pages/wms/production/ProductionDashboardPage'));
const ProductionOutputPage = lazy(() => import('./pages/wms/production/ProductionOutputPage'));
const ProductionFacilitiesPage = lazy(() => import('./pages/wms/production/ProductionFacilitiesPage'));
const ProductionSpecsPage = lazy(() => import('./pages/wms/production/ProductionSpecsPage'));
const BlendListPage = lazy(() => import('./pages/wms/blending/BlendListPage'));
const BlendCreatePage = lazy(() => import('./pages/wms/blending/BlendCreatePage'));
const BlendDetailPage = lazy(() => import('./pages/wms/blending/BlendDetailPage'));
const BlendSuggestPage = lazy(() => import('./pages/wms/blending/BlendSuggestPage'));
// Phase A: 5 report page rời giờ chỉ render nội bộ trong WMSReportsTabbedPage
const WMSSettingsPage = lazy(() => import('./pages/wms/WMSSettingsPage'));
const WMSConfigTabbedPage = lazy(() => import('./pages/wms/WMSConfigTabbedPage'));

// ===== PROJECT MANAGEMENT (lazy) =====
const ProjectCategoryPage = lazy(() => import('./pages/projects/ProjectCategoryPage'));
const ProjectTemplateList = lazy(() => import('./pages/projects/ProjectTemplateList'));
const ProjectListPage = lazy(() => import('./pages/projects/ProjectListPage'));
const ProjectCreatePage = lazy(() => import('./pages/projects/ProjectCreatePage'));
const ProjectDetailPage = lazy(() => import('./pages/projects/ProjectDetailPage'));
const ProjectGanttPage = lazy(() => import('./pages/projects/ProjectGanttPage'));
const MultiProjectGanttPage = lazy(() => import('./pages/projects/MultiProjectGanttPage'));
const ProjectResourcePage = lazy(() => import('./pages/projects/ProjectResourcePage'));
const CapacityPlanningPage = lazy(() => import('./pages/projects/CapacityPlanningPage'));

// ============================================================
// ★ B2B MODULE — Dashboard, Chat, Deals, Ledger, Settlements, Reports
// ============================================================
const TaskTemplateListPage = lazy(() => import('./pages/tasks/TaskTemplateListPage'));
const TaskKanbanPage = lazy(() => import('./pages/tasks/TaskKanbanPage'));
const B2BDashboardPage = lazy(() => import('./pages/b2b/B2BDashboardPage'));
const AuctionListPage = lazy(() => import('./pages/b2b/auctions/AuctionListPage'));
const AuctionDetailPage = lazy(() => import('./pages/b2b/auctions/AuctionDetailPage'));
const B2BChatListPage = lazy(() => import('./pages/b2b/B2BChatListPage'));
const B2BChatRoomPage = lazy(() => import('./pages/b2b/B2BChatRoomPage'));
const DealListPage = lazy(() => import('./pages/b2b/deals/DealListPage'));
const DealCreatePage = lazy(() => import('./pages/b2b/deals/DealCreatePage'));
const DealDetailPage = lazy(() => import('./pages/b2b/deals/DealDetailPage'));
const DealPrintPage = lazy(() => import('./pages/b2b/deals/DealPrintPage'));
// Partners
const PartnerListPage = lazy(() => import('./pages/b2b/partners/PartnerListPage'));
const PartnerRequestsPage = lazy(() => import('./pages/b2b/partners/PartnerRequestsPage'));
const PartnerAssignmentsPage = lazy(() => import('./pages/b2b/partners/PartnerAssignmentsPage'));
const PartnerDetailPage = lazy(() => import('./pages/b2b/partners/PartnerDetailPage'));
// Bonuses (Quy chế thưởng đại lý)
const BonusListPage = lazy(() => import('./pages/b2b/bonuses/BonusListPage'));
const BonusRulesPage = lazy(() => import('./pages/b2b/bonuses/BonusRulesPage'));
// Intake manual entry — tạm thời cho admin nhập tay phiếu cân
const ManualEntryPage = lazy(() => import('./pages/b2b/intake-manual/ManualEntryPage'));
// Phase E5: Công nợ & Quyết toán
const LedgerOverviewPage = lazy(() => import('./pages/b2b/ledger/LedgerOverviewPage'));
const PartnerLedgerPage = lazy(() => import('./pages/b2b/ledger/PartnerLedgerPage'));
const SettlementListPage = lazy(() => import('./pages/b2b/settlements/SettlementListPage'));
const SettlementCreatePage = lazy(() => import('./pages/b2b/settlements/SettlementCreatePage'));
const SettlementDetailPage = lazy(() => import('./pages/b2b/settlements/SettlementDetailPage'));
const LedgerReportPage = lazy(() => import('./pages/b2b/reports/LedgerReportPage'));
const B2BAnalyticsDashboard = lazy(() => import('./pages/b2b/reports/B2BAnalyticsDashboard'));
const PriceIntelligencePage = lazy(() => import('./pages/b2b/reports/PriceIntelligencePage'));
const PickupLocationSettingsPage = lazy(() => import('./pages/b2b/PickupLocationSettingsPage'));
const B2BRubberIntakePage = lazy(() => import('./pages/b2b/rubber-intake/B2BRubberIntakePage'));
const B2BRubberIntakeStatsPage = lazy(() => import('./pages/b2b/rubber-intake/B2BRubberIntakeStatsPage'));
const B2BRubberIntakeDetailPage = lazy(() => import('./pages/b2b/rubber-intake/B2BRubberIntakeDetailPage'));
const B2BRubberIntakePrintPage = lazy(() => import('./pages/b2b/rubber-intake/B2BRubberIntakePrintPage'));
const PriceLockListPage = lazy(() => import('./pages/b2b/price-lock/PriceLockListPage'));
const PriceLockFormPage = lazy(() => import('./pages/b2b/price-lock/PriceLockFormPage'));
const PriceLockPrintPage = lazy(() => import('./pages/b2b/price-lock/PriceLockPrintPage'));
// B2B Demands
const DemandListPage = lazy(() => import('./pages/b2b/demands/DemandListPage'));
// B2B Intake v4 — 3 flow wizards + daily price admin
const OutrightWizardPage = lazy(() => import('./pages/b2b/intake/OutrightWizardPage'));
const WalkinWizardPage = lazy(() => import('./pages/b2b/intake/WalkinWizardPage'));
const ProductionWizardPage = lazy(() => import('./pages/b2b/intake/ProductionWizardPage'));
const DailyPriceListPage = lazy(() => import('./pages/b2b/settings/DailyPriceListPage'));
const DemandCreatePage = lazy(() => import('./pages/b2b/demands/DemandCreatePage'));
const DemandDetailPage = lazy(() => import('./pages/b2b/demands/DemandDetailPage'))

// ===== MASTER DATA — BUSINESS PARTNER (HAC-13 v10) =====
const BusinessPartnerListPage = lazy(() => import('./pages/master-data/BusinessPartnerListPage'))
const BusinessPartnerDetailPage = lazy(() => import('./pages/master-data/BusinessPartnerDetailPage'))

// ===== SALES MODULE =====
const CustomerListPage = lazy(() => import('./pages/sales/CustomerListPage'))
const CustomerDetailPage = lazy(() => import('./pages/sales/CustomerDetailPage'));
const SalesOrderListPage = lazy(() => import('./pages/sales/SalesOrderListPage'))
const SalesKanbanPage = lazy(() => import('./pages/sales/SalesKanbanPage'))
const AuditLogPage = lazy(() => import('./pages/admin/AuditLogPage'))
const SalesDigestPage = lazy(() => import('./pages/sales/SalesDigestPage'))
const SalesDigestSubscribersPage = lazy(() => import('./pages/sales/SalesDigestSubscribersPage'))
const SalesOrderCreatePage = lazy(() => import('./pages/sales/SalesOrderCreatePage'))
const SalesOrderDetailPage = lazy(() => import('./pages/sales/SalesOrderDetailPage'))
const ContractGeneratorTestPage = lazy(() => import('./pages/sales/ContractGeneratorTestPage'))
const ContractReviewPage = lazy(() => import('./pages/sales/ContractReviewPage'))
const ContractSignPage = lazy(() => import('./pages/sales/ContractSignPage'))
const ContainerPackingPage = lazy(() => import('./pages/sales/ContainerPackingPage'))
const ExportDocumentsPage = lazy(() => import('./pages/sales/ExportDocumentsPage'))
const SalesDashboardPage = lazy(() => import('./pages/sales/SalesDashboardPage'))
const ShipmentFollowingPage = lazy(() => import('./pages/sales/ShipmentFollowingPage'))
const ARAgingReportPage = lazy(() => import('./pages/sales/ARAgingReportPage'))
const CashFlowPage = lazy(() => import('./pages/sales/CashFlowPage'))
const ExecutiveDashboardPage = lazy(() => import('./pages/sales/ExecutiveDashboardPage'))


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
  const { checkAuth, isAuthenticated } = useAuthStore();

  useEffect(() => {
    checkAuth();
    // App Android "Huy Anh Ops": đăng ký FCM push (web = no-op)
    import('./services/capacitorPush').then(m => m.initCapacitorPush()).catch(() => {});
  }, [checkAuth]);

  // Sau khi đăng nhập → lưu FCM token theo employee
  useEffect(() => {
    if (isAuthenticated) {
      import('./services/capacitorPush').then(m => m.syncFcmTokenToDb()).catch(() => {});
    }
  }, [isAuthenticated]);

  return <>{children}</>;
}

// App native "Huy Anh Ops" mở là vào thẳng vỏ mobile /m/app (web KHÔNG đổi).
// Chỉ chặn trang gốc '/'; điều hướng nội bộ (vd /tasks/:id) vẫn cho qua.
function NativeGate() {
  const nav = useNavigate();
  const loc = useLocation();
  const { isAuthenticated } = useAuthStore();
  useEffect(() => {
    if (Capacitor.isNativePlatform() && isAuthenticated && loc.pathname === '/') {
      nav('/m/app', { replace: true });
    }
  }, [isAuthenticated, loc.pathname, nav]);
  return null;
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
          <NativeGate />
          <Routes>
            {/* ============================================================ */}
            {/* ERP Login                                                    */}
            {/* ============================================================ */}
            <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />

            {/* ============================================================ */}
            {/* CÔNG KHAI — quét QR máy báo hỏng (công nhân KHÔNG cần login) */}
            {/* ============================================================ */}
            <Route path="/m/tb/:code" element={<MachineReportPage />} />

            {/* Thợ bảo trì (đăng nhập) — hàng chờ báo hỏng, layout mobile riêng */}
            <Route path="/m/yeu-cau" element={<ProtectedRoute><MachineQueuePage /></ProtectedRoute>} />

            {/* App "Huy Anh Ops" — vỏ mobile 4 tab cho thợ (đăng nhập) */}
            <Route path="/m" element={<Navigate to="/m/app" replace />} />
            <Route path="/m/app" element={<ProtectedRoute><Suspense fallback={<LoadingSpinner />}><OpsShell /></Suspense></ProtectedRoute>}>
              <Route index element={<Suspense fallback={<LoadingSpinner />}><OpsHome /></Suspense>} />
              <Route path="tuan-tra" element={<Suspense fallback={<LoadingSpinner />}><OpsPatrol /></Suspense>} />
              <Route path="ca" element={<Suspense fallback={<LoadingSpinner />}><OpsShift /></Suspense>} />
              <Route path="cong" element={<Suspense fallback={<LoadingSpinner />}><OpsTimesheet /></Suspense>} />
            </Route>

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
                {/* B2B Chat — danh sách (tab-based) + phòng chat chi tiết khi deep-link/refresh */}
                <Route path="chat" element={<Suspense fallback={<LoadingSpinner />}><B2BChatListPage /></Suspense>} />
                <Route path="chat/:roomId" element={<Suspense fallback={<LoadingSpinner />}><B2BChatRoomPage /></Suspense>} />
                {/* B2B Partners */}
                <Route path="partners" element={<Suspense fallback={<LoadingSpinner />}><PartnerListPage /></Suspense>} />
                <Route path="partners/requests" element={<Suspense fallback={<LoadingSpinner />}><PartnerRequestsPage /></Suspense>} />
                <Route path="partners/assignments" element={<Suspense fallback={<LoadingSpinner />}><PartnerAssignmentsPage /></Suspense>} />
                <Route path="partners/:id" element={<Suspense fallback={<LoadingSpinner />}><PartnerDetailPage /></Suspense>} />
                {/* B2B Deals */}
                <Route path="deals" element={<Suspense fallback={<LoadingSpinner />}><DealListPage /></Suspense>} />
                <Route path="deals/new" element={<Suspense fallback={<LoadingSpinner />}><DealCreatePage /></Suspense>} />
                <Route path="deals/:id" element={<Suspense fallback={<LoadingSpinner />}><DealDetailPage /></Suspense>} />
                <Route path="deals/:id/print" element={<Suspense fallback={<LoadingSpinner />}><DealPrintPage /></Suspense>} />
                {/* B2B Bonuses — Quy chế thưởng đại lý (mủ tạp + mủ nước) */}
                <Route path="bonuses" element={<Suspense fallback={<LoadingSpinner />}><BonusListPage /></Suspense>} />
                <Route path="bonus-rules" element={<Suspense fallback={<LoadingSpinner />}><BonusRulesPage /></Suspense>} />
                <Route path="intake-manual" element={<Suspense fallback={<LoadingSpinner />}><ManualEntryPage /></Suspense>} />
                {/* B2B Ledger (Phase E5) */}
                <Route path="ledger" element={<Suspense fallback={<LoadingSpinner />}><LedgerOverviewPage /></Suspense>} />
                <Route path="ledger/:partnerId" element={<Suspense fallback={<LoadingSpinner />}><PartnerLedgerPage /></Suspense>} />
                {/* B2B Settlements (Phase E5) */}
                <Route path="settlements" element={<Suspense fallback={<LoadingSpinner />}><SettlementListPage /></Suspense>} />
                <Route path="settlements/new" element={<Suspense fallback={<LoadingSpinner />}><SettlementCreatePage /></Suspense>} />
                <Route path="settlements/:id" element={<Suspense fallback={<LoadingSpinner />}><SettlementDetailPage /></Suspense>} />
                {/* B2B Reports (Phase E5) */}
                <Route path="reports" element={<Suspense fallback={<LoadingSpinner />}><LedgerReportPage /></Suspense>} />
                <Route path="analytics" element={<Suspense fallback={<LoadingSpinner />}><B2BAnalyticsDashboard /></Suspense>} />
                <Route path="price-intelligence" element={<Suspense fallback={<LoadingSpinner />}><PriceIntelligencePage /></Suspense>} />
                {/* B2B Demands */}
                <Route path="demands" element={<Suspense fallback={<LoadingSpinner />}><DemandListPage /></Suspense>} />
                <Route path="demands/new" element={<Suspense fallback={<LoadingSpinner />}><DemandCreatePage /></Suspense>} />
                <Route path="demands/:id/edit" element={<Suspense fallback={<LoadingSpinner />}><DemandCreatePage /></Suspense>} />
                <Route path="demands/:id" element={<Suspense fallback={<LoadingSpinner />}><DemandDetailPage /></Suspense>} />
                {/* B2B Intake v4 wizards */}
                <Route path="intake/outright" element={<Suspense fallback={<LoadingSpinner />}><OutrightWizardPage /></Suspense>} />
                <Route path="intake/walkin" element={<Suspense fallback={<LoadingSpinner />}><WalkinWizardPage /></Suspense>} />
                <Route path="intake/production" element={<Suspense fallback={<LoadingSpinner />}><ProductionWizardPage /></Suspense>} />
                <Route path="settings/daily-prices" element={<Suspense fallback={<LoadingSpinner />}><DailyPriceListPage /></Suspense>} />
                {/* B2B Rubber Intake (Lý lịch mủ) */}
                <Route path="stats" element={<Suspense fallback={<LoadingSpinner />}><B2BRubberIntakeStatsPage /></Suspense>} />
                <Route path="rubber-intake" element={<Suspense fallback={<LoadingSpinner />}><B2BRubberIntakePage /></Suspense>} />
                <Route path="rubber-intake/:id" element={<Suspense fallback={<LoadingSpinner />}><B2BRubberIntakeDetailPage /></Suspense>} />
                <Route path="rubber-intake/:id/print" element={<Suspense fallback={<LoadingSpinner />}><B2BRubberIntakePrintPage /></Suspense>} />
                {/* Phiếu chốt giá (Thu mua) */}
                <Route path="price-lock" element={<Suspense fallback={<LoadingSpinner />}><PriceLockListPage /></Suspense>} />
                <Route path="price-lock/new" element={<Suspense fallback={<LoadingSpinner />}><PriceLockFormPage /></Suspense>} />
                <Route path="price-lock/:id" element={<Suspense fallback={<LoadingSpinner />}><PriceLockFormPage /></Suspense>} />
                <Route path="price-lock/:id/print" element={<Suspense fallback={<LoadingSpinner />}><PriceLockPrintPage /></Suspense>} />
                {/* B2B Auctions (Phase B1) */}
                <Route path="auctions" element={<Suspense fallback={<LoadingSpinner />}><AuctionListPage /></Suspense>} />
                <Route path="auctions/:id" element={<Suspense fallback={<LoadingSpinner />}><AuctionDetailPage /></Suspense>} />
                {/* B2B Pickup Locations */}
                <Route path="pickup-locations" element={<Suspense fallback={<LoadingSpinner />}><PickupLocationSettingsPage /></Suspense>} />
              </Route>

              {/* ===== SALES MODULE ===== */}
              <Route path="sales/dashboard" element={<Suspense fallback={<LoadingSpinner />}><SalesDashboardPage /></Suspense>} />
              <Route path="sales/customers" element={<Suspense fallback={<LoadingSpinner />}><CustomerListPage /></Suspense>} />
              <Route path="sales/customers/:customerId" element={<Suspense fallback={<LoadingSpinner />}><CustomerDetailPage /></Suspense>} />

              {/* HAC-13 Master Data — Business Partner */}
              <Route path="master-data/business-partners" element={<Suspense fallback={<LoadingSpinner />}><BusinessPartnerListPage /></Suspense>} />
              <Route path="master-data/business-partners/:id" element={<Suspense fallback={<LoadingSpinner />}><BusinessPartnerDetailPage /></Suspense>} />
              <Route path="sales/orders" element={<Suspense fallback={<LoadingSpinner />}><SalesOrderListPage /></Suspense>} />
              <Route path="sales/kanban" element={<Suspense fallback={<LoadingSpinner />}><SalesKanbanPage /></Suspense>} />
              <Route path="admin/audit-log" element={<Suspense fallback={<LoadingSpinner />}><AuditLogPage /></Suspense>} />
              <Route path="sales/digest" element={<Suspense fallback={<LoadingSpinner />}><SalesDigestPage /></Suspense>} />
              <Route path="sales/digest/subscribers" element={<Suspense fallback={<LoadingSpinner />}><SalesDigestSubscribersPage /></Suspense>} />
              <Route path="sales/orders/new" element={<Suspense fallback={<LoadingSpinner />}><SalesOrderCreatePage /></Suspense>} />
              <Route path="sales/contract-test" element={<Suspense fallback={<LoadingSpinner />}><ContractGeneratorTestPage /></Suspense>} />
              <Route path="sales/contracts/review" element={<Suspense fallback={<LoadingSpinner />}><ContractReviewPage /></Suspense>} />
              <Route path="sales/contracts/sign" element={<Suspense fallback={<LoadingSpinner />}><ContractSignPage /></Suspense>} />
              <Route path="sales/orders/:orderId" element={<Suspense fallback={<LoadingSpinner />}><SalesOrderDetailPage /></Suspense>} />
              <Route path="sales/orders/:orderId/packing" element={<Suspense fallback={<LoadingSpinner />}><ContainerPackingPage /></Suspense>} />
              <Route path="sales/orders/:orderId/documents" element={<Suspense fallback={<LoadingSpinner />}><ExportDocumentsPage /></Suspense>} />
              <Route path="sales/shipments" element={<Suspense fallback={<LoadingSpinner />}><ShipmentFollowingPage /></Suspense>} />
              <Route path="sales/ar-aging" element={<Suspense fallback={<LoadingSpinner />}><ARAgingReportPage /></Suspense>} />
              <Route path="sales/cash-flow" element={<Suspense fallback={<LoadingSpinner />}><CashFlowPage /></Suspense>} />
              <Route path="executive" element={<Suspense fallback={<LoadingSpinner />}><ExecutiveDashboardPage /></Suspense>} />

              {/* ===== WMS MODULE ===== */}
              <Route path="wms">
                {/* Phase A: Inventory tabbed wrapper — overview | nvl | alerts | stock-check */}
                <Route index element={<WMSInventoryTabbedPage />} />
                <Route path="nvl-dashboard" element={<Navigate to="/wms?tab=nvl" replace />} />
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
                {/* F3: Inter-facility Transfer */}
                <Route path="transfer" element={<TransferListPage />} />
                <Route path="transfer/new" element={<TransferCreatePage />} />
                <Route path="transfer/:id" element={<TransferDetailPage />} />
                <Route path="inventory/:materialId" element={<InventoryDetailPage />} />
                {/* Phase A: redirect to consolidated /wms inventory tabbed */}
                <Route path="alerts" element={<Navigate to="/wms?tab=alerts" replace />} />
                <Route path="stock-check" element={<Navigate to="/wms?tab=stock-check" replace />} />
                {/* Phase A: QC tabbed wrapper — dashboard | recheck | quick-scan | standards */}
                <Route path="qc" element={<WMSQCTabbedPage />} />
                <Route path="qc/recheck" element={<Navigate to="/wms/qc?tab=recheck" replace />} />
                <Route path="qc/standards" element={<Navigate to="/wms/qc?tab=standards" replace />} />
                <Route path="qc/quick-scan" element={<Navigate to="/wms/qc?tab=quick-scan" replace />} />
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
                {/* P10: Reports — Phase A tabbed wrapper (dashboard | stock-movement | supplier-quality | inventory-value | supplier-scoring) */}
                <Route path="reports" element={<WMSReportsTabbedPage />} />
                <Route path="reports/stock-movement" element={<Navigate to="/wms/reports?tab=stock-movement" replace />} />
                <Route path="reports/supplier-quality" element={<Navigate to="/wms/reports?tab=supplier-quality" replace />} />
                <Route path="reports/inventory-value" element={<Navigate to="/wms/reports?tab=inventory-value" replace />} />
                <Route path="reports/supplier-scoring" element={<Navigate to="/wms/reports?tab=supplier-scoring" replace />} />
                {/* P11: Settings (legacy — redirect to consolidated config) */}
                <Route path="settings" element={<Navigate to="/wms/config?tab=settings" replace />} />
                {/* Phase B consolidation: Vật liệu + Kho hàng + Cài đặt → 1 page tabs */}
                <Route path="config" element={<WMSConfigTabbedPage />} />
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
                <Route path="payment-requests" element={<PaymentRequestListPage />} />
                <Route path="payment-requests/new" element={<PaymentRequestCreatePage />} />
                <Route path="payment-requests/:id" element={<PaymentRequestDetailPage />} />
                <Route path="payment-requests/:id/print" element={<PaymentRequestPrintPage />} />
                <Route path="vn/batches" element={<VnBatchListPage />} />
                <Route path="lao/transfers" element={<LaoTransferPage />} />
                <Route path="lao/purchases" element={<LaoPurchasePage />} />
                <Route path="lao/shipments" element={<LaoShipmentPage />} />
                <Route path="profiles" element={<RubberProfilePage />} />
                <Route path="settlements" element={<SettlementPage />} />
                <Route path="dashboard" element={<RubberDashboard />} />
              </Route>

              {/* ===== LOGISTICS / VẬN TẢI — Lệnh điều động + Đội xe ===== */}
              <Route path="logistics">
                <Route index element={<Navigate to="/logistics/dispatch" replace />} />
                <Route path="dispatch" element={<DispatchListPage />} />
                <Route path="dispatch/new" element={<DispatchCreatePage />} />
                <Route path="dispatch/fetch-report" element={<FetchReportPage />} />
                <Route path="dispatch/:id" element={<DispatchDetailPage />} />
                <Route path="dispatch/:id/edit" element={<DispatchCreatePage />} />
                <Route path="dispatch/:id/print" element={<DispatchPrintPage />} />
                <Route path="fleet/vehicles" element={<FleetVehicleListPage />} />
                <Route path="fleet/drivers" element={<FleetDriverListPage />} />
              </Route>

              {/* ===== VỐN VAY NGÂN HÀNG (Admin only) ===== */}
              <Route path="finance">
                <Route index element={<Navigate to="/finance/overview" replace />} />
                <Route path="overview" element={<AdminGate><FinanceLoanDashboard /></AdminGate>} />
                <Route path="cashflow" element={<AdminGate><FinanceCashflowDashboard /></AdminGate>} />
                <Route path="credit-lines" element={<AdminGate><FinanceCreditLinePage /></AdminGate>} />
                <Route path="collaterals" element={<AdminGate><FinanceCollateralPage /></AdminGate>} />
                <Route path="loans" element={<AdminGate><FinanceLoanListPage /></AdminGate>} />
                <Route path="interest" element={<AdminGate><FinanceInterestPage /></AdminGate>} />
                <Route path="deposits" element={<AdminGate><FinanceDepositListPage /></AdminGate>} />
                <Route path="receivables" element={<AdminGate><FinanceReceivablePage /></AdminGate>} />
                <Route path="cash" element={<AdminGate><FinanceCashPage /></AdminGate>} />
                <Route path="audit-log" element={<AdminGate><FinanceAuditLogPage /></AdminGate>} />
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
              <Route path="attendance/qr-checkin" element={<Suspense fallback={<LoadingSpinner />}><QRCheckInPage /></Suspense>} />

              {/* Production MES (QLSX) */}
              <Route path="production/steps/:orderId" element={<Suspense fallback={<LoadingSpinner />}><ProductionStepTrackerPage /></Suspense>} />
              <Route path="production/downtimes" element={<Suspense fallback={<LoadingSpinner />}><DowntimeLogPage /></Suspense>} />
              <Route path="production/shift-reports" element={<Suspense fallback={<LoadingSpinner />}><ShiftReportPage /></Suspense>} />
              <Route path="production/live" element={<Suspense fallback={<LoadingSpinner />}><ProductionLiveBoard /></Suspense>} />
              <Route path="production/oee" element={<Suspense fallback={<LoadingSpinner />}><OEEDashboardPage /></Suspense>} />
              <Route path="production/sop" element={<Suspense fallback={<LoadingSpinner />}><SOPListPage /></Suspense>} />
              <Route path="production/training" element={<Suspense fallback={<LoadingSpinner />}><SOPTrainingPage /></Suspense>} />
              <Route path="production/safety-signs" element={<Suspense fallback={<LoadingSpinner />}><SafetySignsPage /></Suspense>} />
              <Route path="shifts" element={<ShiftListPage />} />
              <Route path="shift-assignments" element={<ShiftCalendarPage />} />
              <Route path="shift-teams" element={<TeamManagementPage />} />
              <Route path="attendance/business-trips" element={<BusinessTripPage />} />
              <Route path="overtime" element={<OvertimeListPage />} />
              <Route path="overtime/approval" element={<OvertimeApprovalPage />} />
              <Route path="salary-grades" element={<SalaryGradeListPage />} />
              <Route path="payroll-periods" element={<PayrollPeriodListPage />} />
              <Route path="payslips" element={<PayslipListPage />} />
              <Route path="performance-criteria" element={<PerformanceCriteriaListPage />} />
              <Route path="performance-reviews" element={<PerformanceReviewListPage />} />

              {/* ===== TASKS MODULE ===== */}
              <Route path="tasks" element={<TaskListPage />} />
              {/* GĐ 5 — đặt TRƯỚC tasks/:id để không bị nuốt bởi route động */}
              <Route path="tasks/can-xem" element={<Suspense fallback={<LoadingSpinner />}><TaskExceptionsPage /></Suspense>} />
              <Route path="tasks/create" element={<TaskCreatePage />} />
              <Route path="tasks/new" element={<TaskCreatePage />} />
              <Route path="tasks/:id" element={<TaskViewPage />} />
              <Route path="tasks/:id/edit" element={<TaskEditPage />} />
              <Route path="my-tasks" element={<MyTasksPage />} />
              <Route path="approvals" element={<ApprovalsPage />} />
              <Route path="tasks/approve-batch" element={<BatchApprovePage />} />
              <Route path="evaluations/self-evaluation" element={<SelfEvaluationPage />} />
              <Route path="self-evaluation" element={<SelfEvaluationPage />} />
              <Route path="task-detail/:taskId" element={<TaskDetailPage />} />
              <Route path="my-tasks/:taskId" element={<TaskDetailPage />} />
              <Route path="reports/tasks" element={<TaskReportsPage />} />
              <Route path="tasks/kanban" element={<Suspense fallback={<LoadingSpinner />}><TaskKanbanPage /></Suspense>} />
              <Route path="task-templates" element={<Suspense fallback={<LoadingSpinner />}><TaskTemplateListPage /></Suspense>} />

              {/* ===== PERFORMANCE DASHBOARD ===== */}
              <Route path="performance" element={<PerformanceDashboardPage />} />
              <Route path="performance/reports" element={<PerformanceReportPage />} />
              <Route path="performance/config" element={<PerformanceConfigPage />} />
              <Route path="performance/:employeeId" element={<EmployeePerformancePage />} />
              <Route path="operations/coverage" element={<CoverageDashboardPage />} />

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