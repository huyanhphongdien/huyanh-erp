// ============================================================================
// WMS SERVICES INDEX — Re-export tất cả services của module Kho Thành phẩm
// File: src/services/wms/index.ts
// ============================================================================

// ===== TYPES =====
export * from './wms.types'

// ===== PHASE 2: Danh mục cơ bản =====
export { default as wmsMaterialCategoryService } from './materialCategoryService'
export { default as wmsWarehouseService } from './warehouseService'
export { default as wmsWarehouseLocationService } from './warehouseLocationService'
export { default as wmsMaterialService } from './wmsMaterialService'

// ===== PHASE 3: Nhập kho (sẽ thêm sau) =====
// export { batchService } from './batchService'
// export { stockInService } from './stockInService'

// ===== PHASE 4: Xuất kho (sẽ thêm sau) =====
// export { pickingService } from './pickingService'
// export { stockOutService } from './stockOutService'

// ===== PHASE 5: Tồn kho (sẽ thêm sau) =====
// export { inventoryService } from './inventoryService'
// export { alertService } from './alertService'
// export { stockCheckService } from './stockCheckService'

// ===== PHASE 6: QC & DRC (sẽ thêm sau) =====
// export { qcService } from './qcService'

// ===== PHASE 7: Cân xe =====
export { default as weighbridgeService } from './weighbridgeService'
export { default as weighbridgeImageService } from './weighbridgeImageService'

// ===== PHASE 8: Lệnh SX & BOM (sẽ thêm sau) =====
// export { bomService } from './bomService'
// export { productionService } from './productionService'

// ===== PHASE 9: Phối trộn (sẽ thêm sau) =====
// export { blendingService } from './blendingService'

// ===== PHASE 10: Báo cáo (sẽ thêm sau) =====
// export { wmsReportService } from './wmsReportService'
// export { wmsDashboardService } from './wmsDashboardService'