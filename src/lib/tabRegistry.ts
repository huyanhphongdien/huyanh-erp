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
// Scope pilot: chỉ WMS detail pages. Sau khi user approve rollout,
// thêm Sales/Production/B2B/Customers/Rubber pages vào đây.
// ============================================================================

import { lazy } from 'react'
import { registerTabComponent } from '../stores/tabStore'

// ===== WMS / Kho =====

const StockInDetailPage = lazy(() => import('../pages/wms/stock-in/StockInDetailPage'))
registerTabComponent('stock-in-detail', StockInDetailPage)

const StockOutDetailPage = lazy(() => import('../pages/wms/stock-out/StockOutDetailPage'))
registerTabComponent('stock-out-detail', StockOutDetailPage)

const InventoryDetailPage = lazy(() => import('../pages/wms/InventoryDetailPage'))
registerTabComponent('inventory-detail', InventoryDetailPage)

// Thêm vào đây khi rollout các module khác:
// const SalesOrderDetailPage = lazy(() => import('../pages/sales/SalesOrderDetailPage'))
// registerTabComponent('sales-order-detail', SalesOrderDetailPage)
//
// const ProductionDetailPage = lazy(() => import('../pages/wms/production/ProductionDetailPage'))
// registerTabComponent('production-detail', ProductionDetailPage)
//
// ...
