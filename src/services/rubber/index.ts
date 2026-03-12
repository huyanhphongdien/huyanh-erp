// ============================================================================
// RUBBER SERVICES INDEX
// File: src/services/rubber/index.ts
// ============================================================================

// ===== TYPES =====
export * from './rubber.types'

// ===== SERVICES (chỉ export file đã có) =====
export { default as laoFundTransferService } from './laoFundTransferService'
export { default as laoShipmentService } from './laoShipmentService'
export { default as rubberDashboardService } from './rubberDashboardService'

// Thêm dần khi copy file vào:
export { default as rubberSupplierService } from './rubberSupplierService'
export { default as rubberIntakeService } from './rubberIntakeService'
export { default as rubberIntakeBatchService } from './rubberIntakeBatchService'
export { default as rubberSettlementService } from './rubberSettlementService'
export { default as rubberProfileService } from './rubberProfileService'
export { default as rubberExportService } from './rubberExportService'
export { downloadSettlementPDF, downloadDashboardExcel } from './rubberExportService'