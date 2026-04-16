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

// Thêm vào đây khi rollout các module khác:
// const SalesOrderDetailPage = lazy(() => import('../pages/sales/SalesOrderDetailPage'))
// registerTabComponent('sales-order-detail', SalesOrderDetailPage)
