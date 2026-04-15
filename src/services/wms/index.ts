// ============================================================================
// WMS SERVICES INDEX — Re-export tất cả services của module Kho Thành phẩm
// File: src/services/wms/index.ts
// ============================================================================
// Phase B consolidation (2026-04-15): barrel full coverage — 25/25 services.
// Consumer side: `import { stockOutService } from '../../services/wms'`.
// Trước đó: phải import trực tiếp từ từng file.
// ============================================================================

// ===== TYPES =====
export * from './wms.types'

// ===== Phase 2: Danh mục cơ bản =====
export { warehouseService, WAREHOUSE_TYPE_LABELS, WAREHOUSE_TYPE_COLORS } from './warehouseService'
export { wmsMaterialService } from './wmsMaterialService'

// ===== Phase 3: Nhập kho =====
export { batchService } from './batchService'
export { stockInService } from './stockInService'

// ===== Phase 4: Xuất kho =====
export { pickingService } from './pickingService'
export { stockOutService } from './stockOutService'

// ===== Phase 5: Tồn kho =====
export { inventoryService } from './inventoryService'
export { alertService } from './alertService'
export { stockCheckService } from './stockCheckService'
export {
  recordInventoryMove,
  adjustLevelsAndLocation,
  type InventoryTxType,
  type RecordMoveParams,
} from './inventorySync'

// ===== Phase 6: QC & DRC =====
export { qcService } from './qcService'
export { rubberGradeService } from './rubberGradeService'

// ===== Phase 7: Cân xe =====
export { weighbridgeService } from './weighbridgeService'
export { weighbridgeImageService } from './weighbridgeImageService'

// ===== Phase 8: Lệnh SX & BOM =====
export { productionService } from './productionService'
export { costTrackingService } from './costTrackingService'

// ===== Phase 9: Phối trộn =====
export { blendingService } from './blendingService'

// ===== Phase 10: Báo cáo & Dashboard =====
export { wmsReportService } from './wmsReportService'
export { nvlDashboardService } from './nvlDashboardService'
export { supplierScoringService } from './supplierScoringService'
export { traceabilityService } from './traceabilityService'

// ===== Phase 11: Dự báo, Bản đồ bãi, Cài đặt =====
export { forecastService, DEFAULT_ALERT_CONFIG } from './forecastService'
export { yardService } from './yardService'

// ============================================================================
// Back-compat aliases — cho code cũ đang import `wms*Service` prefix
// (chỉ giữ cho tới khi refactor toàn bộ consumer sang tên gốc)
// ============================================================================
export { warehouseService as wmsWarehouseService } from './warehouseService'
