// ============================================================================
// TAB REGISTRY — Đăng ký tất cả detail pages có thể mở thành tab
// File: src/lib/tabRegistry.ts
//
// Mỗi tab có 1 componentId string (serializable) map tới React component.
// Module này được import 1 lần khi app boot (từ MainLayout hoặc App.tsx)
// để đảm bảo registry luôn sẵn sàng — kể cả khi user F5 và tab được
// restore từ localStorage.
//
// Dùng React.lazy cho code-splitting: tab component chỉ tải khi user
// mở lần đầu. Sau khi tải, cached trong module scope → lần sau tức thì.
//
// Scope hiện tại: toàn bộ WMS detail pages.
// Rollout tiếp theo: Sales/Production/B2B/Customers/Rubber — thêm vào đây.
// ============================================================================

import { lazy } from 'react'
import { registerTabComponent } from '../stores/tabStore'

// ===== WMS / Kho — Core flows =====

const StockInDetailPage = lazy(() => import('../pages/wms/stock-in/StockInDetailPage'))
registerTabComponent('stock-in-detail', StockInDetailPage)

const StockOutDetailPage = lazy(() => import('../pages/wms/stock-out/StockOutDetailPage'))
registerTabComponent('stock-out-detail', StockOutDetailPage)

// F3 — Inter-facility Transfer detail
const TransferDetailPage = lazy(() => import('../pages/wms/transfer/TransferDetailPage'))
registerTabComponent('transfer-detail', TransferDetailPage)

const PickingListPage = lazy(() => import('../pages/wms/stock-out/PickingListPage'))
registerTabComponent('picking-list', PickingListPage)

const InventoryDetailPage = lazy(() => import('../pages/wms/InventoryDetailPage'))
registerTabComponent('inventory-detail', InventoryDetailPage)

// ===== WMS — QC =====

const BatchQCHistoryPage = lazy(() => import('../pages/wms/qc/BatchQCHistoryPage'))
registerTabComponent('batch-qc-history', BatchQCHistoryPage)

const BatchLabelPage = lazy(() => import('../pages/wms/BatchLabelPage'))
registerTabComponent('batch-label', BatchLabelPage)

// ===== WMS — Blending =====

const BlendDetailPage = lazy(() => import('../pages/wms/blending/BlendDetailPage'))
registerTabComponent('blend-detail', BlendDetailPage)

// ===== WMS — Production =====

const ProductionDetailPage = lazy(() => import('../pages/wms/production/ProductionDetailPage'))
registerTabComponent('production-detail', ProductionDetailPage)

const ProductionStagePage = lazy(() => import('../pages/wms/production/ProductionStagePage'))
registerTabComponent('production-stage', ProductionStagePage)

const ProductionOutputPage = lazy(() => import('../pages/wms/production/ProductionOutputPage'))
registerTabComponent('production-output', ProductionOutputPage)

// ===== WMS — Weighbridge =====

const WeighbridgeDetailPage = lazy(() => import('../pages/wms/weighbridge/WeighbridgeDetailPage'))
registerTabComponent('weighbridge-detail', WeighbridgeDetailPage)

// ===== WMS — Warehouse =====

const WarehouseLocationPage = lazy(() => import('../pages/wms/warehouses/WarehouseLocationPage'))
registerTabComponent('warehouse-location', WarehouseLocationPage)

// ===== B2B — Dashboards & List pages (mở từ sidebar menu) =====

const B2BDashboardPage = lazy(() => import('../pages/b2b/B2BDashboardPage'))
registerTabComponent('b2b-dashboard', B2BDashboardPage)

const B2BChatListPage = lazy(() => import('../pages/b2b/B2BChatListPage'))
registerTabComponent('b2b-chat-list', B2BChatListPage)

const DemandListPage = lazy(() => import('../pages/b2b/demands/DemandListPage'))
registerTabComponent('b2b-demand-list', DemandListPage)

const PartnerListPage = lazy(() => import('../pages/b2b/partners/PartnerListPage'))
registerTabComponent('b2b-partner-list', PartnerListPage)

const DealListPage = lazy(() => import('../pages/b2b/deals/DealListPage'))
registerTabComponent('b2b-deal-list', DealListPage)

const AuctionListPage = lazy(() => import('../pages/b2b/auctions/AuctionListPage'))
registerTabComponent('b2b-auction-list', AuctionListPage)

const B2BRubberIntakePage = lazy(() => import('../pages/b2b/rubber-intake/B2BRubberIntakePage'))
registerTabComponent('b2b-rubber-intake-list', B2BRubberIntakePage)

const LedgerOverviewPage = lazy(() => import('../pages/b2b/ledger/LedgerOverviewPage'))
registerTabComponent('b2b-ledger-overview', LedgerOverviewPage)

const SettlementListPage = lazy(() => import('../pages/b2b/settlements/SettlementListPage'))
registerTabComponent('b2b-settlement-list', SettlementListPage)

const DisputeListPage = lazy(() => import('../pages/b2b/disputes/DisputeListPage'))
registerTabComponent('b2b-dispute-list', DisputeListPage)

const B2BAnalyticsDashboard = lazy(() => import('../pages/b2b/reports/B2BAnalyticsDashboard'))
registerTabComponent('b2b-analytics', B2BAnalyticsDashboard)

const LedgerReportPage = lazy(() => import('../pages/b2b/reports/LedgerReportPage'))
registerTabComponent('b2b-ledger-report', LedgerReportPage)

// ===== B2B — Deal detail flow =====

const DealDetailPage = lazy(() => import('../pages/b2b/deals/DealDetailPage'))
registerTabComponent('b2b-deal-detail', DealDetailPage)

const DealCreatePage = lazy(() => import('../pages/b2b/deals/DealCreatePage'))
registerTabComponent('b2b-deal-create', DealCreatePage)

const DealPrintPage = lazy(() => import('../pages/b2b/deals/DealPrintPage'))
registerTabComponent('b2b-deal-print', DealPrintPage)

// ===== B2B — Chat room =====

const B2BChatRoomPage = lazy(() => import('../pages/b2b/B2BChatRoomPage'))
registerTabComponent('b2b-chat-room', B2BChatRoomPage)

// ===== SALES — Order detail flow =====

const SalesOrderDetailPage = lazy(() => import('../pages/sales/SalesOrderDetailPage'))
registerTabComponent('sales-order-detail', SalesOrderDetailPage)

const SalesOrderCreatePage = lazy(() => import('../pages/sales/SalesOrderCreatePage'))
registerTabComponent('sales-order-create', SalesOrderCreatePage)

const ContainerPackingPage = lazy(() => import('../pages/sales/ContainerPackingPage'))
registerTabComponent('sales-container-packing', ContainerPackingPage)

const ExportDocumentsPage = lazy(() => import('../pages/sales/ExportDocumentsPage'))
registerTabComponent('sales-export-documents', ExportDocumentsPage)

// ===== SALES — Customer detail =====

const CustomerDetailPage = lazy(() => import('../pages/sales/CustomerDetailPage'))
registerTabComponent('sales-customer-detail', CustomerDetailPage)
