// ============================================================================
// WMS TYPES â€” src/services/wms/wms.types.ts
// Module Kho ThÃ nh Pháº©m - Huy Anh Rubber ERP
// NgÃ y: 10/02/2026
// ============================================================================

// ===== CAO SU — RUBBER TYPES =====

export type RubberGrade =
  | 'SVR_L'
  | 'SVR_3L'
  | 'SVR_5'
  | 'SVR_10'
  | 'SVR_20'
  | 'SVR_CV50'
  | 'SVR_CV60'
  | 'RSS_1'
  | 'RSS_3'
  | 'LATEX_60'
export type RubberType = 'mu_dong' | 'mu_nuoc' | 'mu_tap' | 'mu_chen' | 'mu_to' | 'cup_lump' | 'latex' | 'sheet' | 'crepe' | 'mixed'
export type ContaminationStatus = 'clean' | 'suspected' | 'confirmed' | 'cleared'

export const RUBBER_GRADE_LABELS: Record<RubberGrade, string> = {
  SVR_L: 'SVR L',
  SVR_3L: 'SVR 3L',
  SVR_5: 'SVR 5',
  SVR_10: 'SVR 10',
  SVR_20: 'SVR 20',
  SVR_CV50: 'SVR CV50',
  SVR_CV60: 'SVR CV60',
  RSS_1: 'RSS 1',
  RSS_3: 'RSS 3',
  LATEX_60: 'Latex HA 60%',
}

export const RUBBER_GRADE_COLORS: Record<RubberGrade, string> = {
  SVR_L: '#059669',
  SVR_3L: '#16A34A',
  SVR_5: '#22C55E',
  SVR_10: '#F59E0B',
  SVR_20: '#DC2626',
  SVR_CV50: '#6D28D9',
  SVR_CV60: '#7C3AED',
  RSS_1: '#0891B2',
  RSS_3: '#0E7490',
  LATEX_60: '#EC4899',
}

export const RUBBER_TYPE_LABELS: Record<RubberType, string> = {
  mu_dong: 'Mủ đông',
  mu_nuoc: 'Mủ nước',
  mu_tap: 'Mủ tạp',
  mu_chen: 'Mủ chén',
  mu_to: 'Mủ tờ',
  cup_lump: 'Mủ chén',
  latex: 'Mủ nước',
  sheet: 'Mủ tờ',
  crepe: 'Mủ crepe',
  mixed: 'Hỗn hợp',
}

export const CONTAMINATION_LABELS: Record<ContaminationStatus, string> = {
  clean: 'Sạch',
  suspected: 'Nghi ngờ',
  confirmed: 'Xác nhận tạp chất',
  cleared: 'Đã xử lý',
}

export const CONTAMINATION_COLORS: Record<ContaminationStatus, string> = {
  clean: '#16A34A',
  suspected: '#F59E0B',
  confirmed: '#DC2626',
  cleared: '#2563EB',
}

// ===== DANH MUC =====

export interface MaterialCategory {
  id: string
  name: string
  type: 'raw' | 'finished'
  description?: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Material {
  id: string
  sku: string                          // code trong DB cÅ©
  name: string
  type: 'raw' | 'finished'            // type_id trong DB cÅ© â€” map khi query
  category_id?: string
  category?: MaterialCategory          // join
  unit: string
  weight_per_unit?: number             // 33.33 kg/bÃ nh
  min_stock: number
  max_stock?: number
  shelf_life_days?: number
  description?: string
  image_url?: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface MaterialFormData {
  sku: string
  name: string
  type: 'raw' | 'finished'
  category_id?: string
  unit?: string
  weight_per_unit?: number
  min_stock?: number
  max_stock?: number
  shelf_life_days?: number
  description?: string
  image_url?: string
}

export interface Warehouse {
  id: string
  code: string
  name: string
  type: 'raw' | 'finished' | 'mixed'
  address?: string
  is_active: boolean
  created_at: string
  updated_at: string
  // Multi-facility F1+ — kho thuộc nhà máy nào (nullable cho legacy data)
  facility_id?: string | null
}

export interface WarehouseLocation {
  id: string
  warehouse_id: string
  warehouse?: Warehouse                // join
  code: string
  shelf?: string
  row_name?: string
  column_name?: string
  capacity?: number
  current_quantity: number
  is_available: boolean
  created_at: string
}

// ===== LÃ” HÃ€NG =====

export type QCStatus = 'pending' | 'passed' | 'warning' | 'failed' | 'needs_blend'
export type BatchType = 'production' | 'blend' | 'purchase'
export type BatchStatus = 'active' | 'depleted' | 'expired' | 'quarantine'

export interface StockBatch {
  id: string
  batch_no: string
  material_id: string
  material?: Material                  // join
  warehouse_id?: string
  warehouse?: Warehouse                // join
  location_id?: string
  location?: WarehouseLocation         // join

  initial_quantity: number
  quantity_remaining: number
  unit: string

  initial_drc?: number
  latest_drc?: number
  qc_status: QCStatus
  last_qc_date?: string
  next_recheck_date?: string

  batch_type: BatchType
  production_order_id?: string
  blend_source_order_id?: string
  supplier_id?: string

  received_date: string
  expiry_date?: string
  status: BatchStatus
  created_by?: string
  created_at: string
  updated_at: string

  // Phase 9: Sub-lots
  parent_batch_id?: string        // FK lô cha — NULL = lô gốc
  parent_batch?: StockBatch       // join (optional)
  sub_lot_code?: string           // 'A', 'B', 'C'... khi chia lô

  // Rubber-specific fields
  rubber_grade?: RubberGrade
  rubber_type?: RubberType
  moisture_content?: number
  dry_weight?: number
  initial_weight?: number
  current_weight?: number
  weight_loss?: number
  last_weight_check?: string
  supplier_name?: string
  supplier_region?: string
  supplier_reported_drc?: number
  supplier_lab_report_url?: string
  storage_days?: number
  contamination_status?: ContaminationStatus
  contamination_notes?: string
}

// ===== PHIáº¾U NHáº¬P KHO =====

export type StockInStatus = 'draft' | 'confirmed' | 'cancelled'
export type StockInSourceType = 'production' | 'purchase' | 'blend' | 'transfer' | 'adjust' | 'return' | 'repack'

export interface StockInOrder {
  id: string
  code: string
  type: 'raw' | 'finished'
  warehouse_id: string
  warehouse?: Warehouse
  source_type: StockInSourceType
  production_order_id?: string
  purchase_order_id?: string
  supplier_id?: string
  deal_id?: string                     // Phase 4: liên kết Deal B2B
  deal?: { id: string; deal_number: string; partner_name?: string; product_name?: string }
  total_quantity?: number
  total_weight?: number
  status: StockInStatus
  notes?: string
  created_by?: string
  creator?: { full_name: string }    // join employees
  confirmed_by?: string
  confirmer?: { full_name: string }  // join employees
  confirmed_at?: string
  created_at: string
  updated_at: string
  details?: StockInDetail[]            // join
}

export interface StockInDetail {
  id: string
  stock_in_id: string
  material_id: string
  material?: Material
  batch_id?: string
  batch?: StockBatch
  location_id?: string
  location?: WarehouseLocation
  quantity: number
  weight?: number
  unit: string
  notes?: string
  created_at: string
}

export interface StockInFormData {
  type?: 'raw' | 'finished'
  warehouse_id: string
  source_type?: StockInSourceType
  production_order_id?: string
  deal_id?: string                     // Phase 4: liên kết Deal B2B
  notes?: string
}

export interface StockInDetailFormData {
  material_id: string
  quantity: number
  weight?: number
  location_id?: string
  batch_no?: string                    // tá»± sinh hoáº·c nháº­p tay
  initial_drc?: number                 // QC Ä‘áº§u vÃ o
  notes?: string

  // Rubber intake fields
  rubber_grade?: RubberGrade
  rubber_type?: RubberType
  moisture_content?: number
  supplier_name?: string
  supplier_region?: string
  supplier_reported_drc?: number
}

// ===== PHIáº¾U XUáº¤T KHO =====

export type StockOutStatus = 'draft' | 'picking' | 'picked' | 'confirmed' | 'cancelled'
export type StockOutReason = 'sale' | 'production' | 'transfer' | 'blend' | 'adjust' | 'return'
export type PickingStatus = 'pending' | 'picking' | 'picked' | 'skipped'

export interface StockOutOrder {
  id: string
  code: string
  type: string
  warehouse_id: string
  warehouse?: Warehouse
  reason: StockOutReason
  customer_name?: string
  customer_order_ref?: string
  total_quantity?: number
  total_weight?: number
  weighbridge_ticket_id?: string
  status: StockOutStatus
  notes?: string
  created_by?: string
  creator?: { full_name: string }    // join employees
  confirmed_by?: string
  confirmer?: { full_name: string }  // join employees
  confirmed_at?: string
  created_at: string
  updated_at: string
  details?: StockOutDetail[]

  // Rubber export fields
  svr_grade?: RubberGrade
  required_drc_min?: number
  required_drc_max?: number
  container_type?: '20ft' | '40ft'
  container_id?: string
  packing_type?: 'bale' | 'pallet' | 'bulk'
  bale_count?: number
  packing_requirements?: string
  export_date?: string
  coa_generated?: boolean
  packing_list_generated?: boolean
}

export interface StockOutDetail {
  id: string
  stock_out_id: string
  material_id: string
  material?: Material
  batch_id: string
  batch?: StockBatch
  location_id?: string
  location?: WarehouseLocation
  quantity: number
  weight?: number
  picking_status: PickingStatus
  picked_at?: string
  picked_by?: string
  notes?: string
  created_at: string
}

// ===== Tá»’N KHO =====

export interface StockLevel {
  id: string
  material_id: string
  material?: Material
  warehouse_id: string
  warehouse?: Warehouse
  quantity: number
  updated_at: string
}

export type TransactionType = 'in' | 'out' | 'transfer' | 'adjust' | 'blend_in' | 'blend_out'

export interface InventoryTransaction {
  id: string
  material_id: string
  material?: Material
  warehouse_id: string
  batch_id?: string
  type: TransactionType
  quantity: number
  reference_type?: string
  reference_id?: string
  notes?: string
  created_by?: string
  created_at: string
}

// ===== QC =====

export interface MaterialQCStandard {
  id: string
  material_id: string
  material?: Material
  drc_standard?: number
  drc_min?: number
  drc_max?: number
  drc_warning_low?: number
  drc_warning_high?: number
  recheck_interval_days: number
  recheck_shortened_days: number
  created_at: string
  updated_at: string

  // Rubber QC standards
  rubber_grade?: RubberGrade
  moisture_max?: number
  volatile_matter_max?: number
  dirt_max?: number
  ash_max?: number
  nitrogen_max?: number
  pri_min?: number
  mooney_max?: number
  color_lovibond_max?: number
  season?: 'all' | 'dry' | 'rainy'
}

export type QCCheckType = 'initial' | 'recheck' | 'blend' | 'export'
export type QCResult = 'pending' | 'passed' | 'warning' | 'failed'

export interface BatchQCResult {
  id: string
  batch_id: string
  batch?: StockBatch
  drc_value?: number
  pri_value?: number
  mooney_value?: number
  ash_content?: number
  nitrogen_content?: number
  result: QCResult
  check_type: QCCheckType
  notes?: string
  tester_id?: string
  tested_at: string
  created_at: string

  // Rubber QC additions
  moisture_content?: number
  volatile_matter?: number
  metal_content?: number
  dirt_content?: number
  color_lovibond?: number
  grade_tested?: RubberGrade
  grade_matches_expected?: boolean
  contamination_detected?: boolean
  contamination_type?: string
  supplier_drc_discrepancy?: number
}

// Patch cho wms_types.ts — CẬP NHẬT phần CÂN XE
// Thay thế block "===== CÂN XE =====" cũ bằng block mới dưới đây:

// ===== CÂN XE =====

export type TicketType = 'in' | 'out'
export type WeighbridgeStatus = 'weighing_gross' | 'weighing_tare' | 'completed' | 'cancelled'
export type ReferenceType = 'stock_in' | 'stock_out' | 'stock_in_raw' | 'purchase_order' | 'none'

export interface WeighbridgeTicket {
  id: string
  code: string                          // CX-YYYYMMDD-XXX
  vehicle_plate: string
  driver_name?: string
  ticket_type: TicketType
  gross_weight?: number
  tare_weight?: number
  net_weight?: number
  reference_type?: ReferenceType | string
  reference_id?: string
  status: WeighbridgeStatus
  notes?: string
  created_by?: string
  // Phase 7 new fields
  gross_weighed_at?: string
  tare_weighed_at?: string
  gross_weighed_by?: string
  tare_weighed_by?: string
  completed_at?: string
  created_at: string
  updated_at?: string
  images?: WeighbridgeImage[]
}

export interface WeighbridgeImage {
  id: string
  ticket_id: string
  image_url: string
  capture_type: 'front' | 'rear' | 'top' | 'plate' | 'cargo'  // 'top' added Phase 7
  captured_at: string
}

// ===== RUBBER GRADE STANDARD =====

export interface RubberGradeStandard {
  id: string
  grade: RubberGrade
  grade_label: string
  drc_min: number
  drc_max: number | null
  dirt_max: number
  ash_max: number
  nitrogen_max: number
  volatile_matter_max: number
  pri_min: number | null
  mooney_max: number | null
  moisture_max: number
  color_lovibond_max: number | null
  price_factor: number
  is_active: boolean
  sort_order: number
}

// ===== WEIGHT CHECK LOG =====

export interface WeightCheckLog {
  id: string
  batch_id: string
  previous_weight: number | null
  new_weight: number
  weight_change: number | null
  change_reason: 'drying' | 'reweigh' | 'adjust'
  checked_by: string | null
  checked_at: string
  notes: string | null
}

// ===== PRODUCTION (P8) =====

export type ProductionStatus = 'draft' | 'scheduled' | 'in_progress' | 'completed' | 'cancelled'
export type StageStatus = 'pending' | 'in_progress' | 'completed' | 'failed'

export const PRODUCTION_STATUS_LABELS: Record<ProductionStatus, string> = {
  draft: 'Nháp', scheduled: 'Đã lên lịch', in_progress: 'Đang sản xuất',
  completed: 'Hoàn thành', cancelled: 'Đã hủy',
}

export const PRODUCTION_STATUS_COLORS: Record<ProductionStatus, string> = {
  draft: 'default', scheduled: 'blue', in_progress: 'processing',
  completed: 'success', cancelled: 'error',
}

export const STAGE_NAMES: Record<number, string> = {
  1: 'Rửa', 2: 'Tán/Kéo', 3: 'Sấy', 4: 'Ép', 5: 'Đóng gói',
}

export const STAGE_DESCRIPTIONS: Record<number, string> = {
  1: 'Rửa sạch mủ, loại bỏ tạp chất',
  2: 'Tán/kéo dãn mủ thành tờ',
  3: 'Sấy mủ để giảm độ ẩm',
  4: 'Ép/lăn mủ thành bành',
  5: 'Đóng gói bành thành sản phẩm',
}

export interface ProductionOrder {
  id: string
  code: string
  product_type: string
  target_quantity: number
  actual_quantity?: number | null
  yield_percent?: number | null
  target_grade?: string | null
  target_drc_min?: number | null
  target_drc_max?: number | null
  status: ProductionStatus
  stage_current?: number | null
  stage_status?: string | null
  scheduled_start_date?: string | null
  actual_start_date?: string | null
  actual_end_date?: string | null
  facility_id?: string | null
  facility?: ProductionFacility
  supervisor_id?: string | null
  supervisor?: { id: string; full_name: string }
  expected_grade?: string | null
  final_grade?: string | null
  final_drc?: number | null
  notes?: string | null
  created_by?: string | null
  updated_by?: string | null
  created_at: string
  updated_at: string
  items?: ProductionOrderItem[]
  stages?: ProductionStageProgress[]
  output_batches?: ProductionOutputBatch[]
}

export interface ProductionOrderItem {
  id: string
  production_order_id: string
  source_batch_id: string
  source_batch?: StockBatch
  required_quantity: number
  allocated_quantity?: number | null
  stage_sequence?: number | null
  drc_at_intake?: number | null
  expected_drc_output?: number | null
  expected_weight_loss_kg?: number | null
  expected_weight_loss_percent?: number | null
  actual_input_quantity?: number | null
  actual_output_quantity?: number | null
  actual_drc_before?: number | null
  actual_drc_after?: number | null
  actual_weight_loss_kg?: number | null
  notes?: string | null
  created_at: string
  updated_at: string
}

export interface ProductionStageProgress {
  id: string
  production_order_id: string
  stage_number: number
  stage_name: string
  status: StageStatus
  started_at?: string | null
  completed_at?: string | null
  duration_hours?: number | null
  input_quantity?: number | null
  output_quantity?: number | null
  weight_loss_kg?: number | null
  input_drc?: number | null
  output_drc?: number | null
  drc_change?: number | null
  temperature_avg?: number | null
  humidity_avg?: number | null
  duration_days?: number | null
  operator_id?: string | null
  operator?: { id: string; full_name: string }
  qc_checkpoint_passed?: boolean
  qc_inspector_id?: string | null
  qc_notes?: string | null
  notes?: string | null
  created_at: string
}

export interface ProductionOutputBatch {
  id: string
  production_order_id: string
  stock_batch_id?: string | null
  stock_batch?: StockBatch
  output_batch_no?: string | null
  material_id?: string | null
  material?: Material
  quantity_produced: number
  bale_count?: number | null
  final_grade?: string | null
  final_drc?: number | null
  final_moisture?: number | null
  status: 'created' | 'qc_pending' | 'qc_passed' | 'qc_failed' | 'stored'
  warehouse_id?: string | null
  location_id?: string | null
  input_batches?: any
  processing_notes?: string | null
  created_at: string
  updated_at: string
  qc_results?: ProductionQCResult[]
}

export interface ProductionQCResult {
  id: string
  output_batch_id: string
  drc_value?: number | null
  moisture_content?: number | null
  volatile_matter?: number | null
  ash_content?: number | null
  nitrogen_content?: number | null
  dirt_content?: number | null
  pri_value?: number | null
  mooney_value?: number | null
  color_lovibond?: number | null
  metal_content?: number | null
  grade_determined?: string | null
  grade_meets_target?: boolean | null
  result: 'passed' | 'warning' | 'failed'
  tester_id?: string | null
  tested_at?: string | null
  notes?: string | null
  created_at: string
}

export interface ProductionFacility {
  id: string
  code: string
  name: string
  description?: string | null
  max_batch_size_kg: number
  processing_stages?: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface ProductionMaterialSpec {
  id: string
  target_product_grade: string
  target_drc_min: number
  target_drc_max?: number | null
  expected_yield_percent: number
  optimal_input_drc_min?: number | null
  optimal_input_drc_max?: number | null
  washing_duration_hours?: number | null
  washing_water_ratio?: number | null
  creeping_duration_hours?: number | null
  drying_duration_days?: number | null
  drying_temperature_target?: number | null
  pressing_duration_hours?: number | null
  notes?: string | null
  is_active: boolean
}

export interface ProductionOrderFormData {
  product_type: string
  target_quantity: number
  target_grade?: string
  target_drc_min?: number
  target_drc_max?: number
  facility_id?: string
  supervisor_id?: string
  scheduled_start_date?: string
  notes?: string
}

// ===== BLENDING (P9) =====

export type BlendStatus = 'draft' | 'simulated' | 'approved' | 'in_progress' | 'completed' | 'cancelled'

export const BLEND_STATUS_LABELS: Record<BlendStatus, string> = {
  draft: 'Nháp', simulated: 'Đã mô phỏng', approved: 'Đã duyệt',
  in_progress: 'Đang trộn', completed: 'Hoàn thành', cancelled: 'Đã hủy',
}

export const BLEND_STATUS_COLORS: Record<BlendStatus, string> = {
  draft: 'default', simulated: 'blue', approved: 'cyan',
  in_progress: 'processing', completed: 'success', cancelled: 'error',
}

export interface BlendOrder {
  id: string
  code: string
  target_grade: string
  target_drc: number
  target_quantity_kg: number
  actual_drc?: number | null
  actual_quantity_kg?: number | null
  result_grade?: string | null
  grade_meets_target?: boolean | null
  simulated_drc?: number | null
  simulated_quantity_kg?: number | null
  status: BlendStatus
  output_batch_id?: string | null
  output_batch?: StockBatch
  output_warehouse_id?: string | null
  output_location_id?: string | null
  blended_by?: string | null
  blended_at?: string | null
  approved_by?: string | null
  approved_at?: string | null
  notes?: string | null
  created_by?: string | null
  created_at: string
  updated_at: string
  items?: BlendOrderItem[]
  qc_results?: BlendQCResult[]
}

export interface BlendOrderItem {
  id: string
  blend_order_id: string
  source_batch_id: string
  source_batch?: StockBatch
  quantity_kg: number
  percentage?: number | null
  batch_drc?: number | null
  drc_contribution?: number | null
  batch_no?: string | null
  material_name?: string | null
  rubber_grade?: string | null
  notes?: string | null
  created_at: string
}

export interface BlendQCResult {
  id: string
  blend_order_id: string
  drc_value?: number | null
  moisture_content?: number | null
  volatile_matter?: number | null
  ash_content?: number | null
  nitrogen_content?: number | null
  dirt_content?: number | null
  pri_value?: number | null
  mooney_value?: number | null
  color_lovibond?: number | null
  metal_content?: number | null
  grade_determined?: string | null
  grade_meets_target?: boolean | null
  result: 'passed' | 'warning' | 'failed'
  tester_id?: string | null
  tested_at?: string | null
  notes?: string | null
  created_at: string
}

export interface BlendSimulationResult {
  items: Array<{
    batch_id: string
    batch_no: string
    quantity_kg: number
    drc: number
    percentage: number
    drc_contribution: number
    rubber_grade?: string
  }>
  total_quantity_kg: number
  simulated_drc: number
  simulated_grade: string
  meets_target: boolean
  target_drc: number
  target_grade: string
}

export interface BlendOrderFormData {
  target_grade: string
  target_drc: number
  target_quantity_kg: number
  notes?: string
}

// ===== REPORTS (P10) =====

export interface StockMovementReport {
  date: string
  in_quantity: number
  out_quantity: number
  adjust_quantity: number
  blend_in_quantity: number
  blend_out_quantity: number
  balance: number
}

export interface GradeProductionReport {
  grade: string
  production_count: number
  total_input_kg: number
  total_output_kg: number
  avg_yield_percent: number
  avg_drc: number
  blend_count: number
}

export interface SupplierQualityReport {
  supplier_name: string
  supplier_region: string
  batch_count: number
  total_weight_kg: number
  avg_drc: number
  drc_min: number
  drc_max: number
  passed_count: number
  warning_count: number
  failed_count: number
  pass_rate: number
}

export interface DRCTrendReport {
  date: string
  avg_drc: number
  batch_count: number
  grade_breakdown: Record<string, number>
}

export interface InventoryValueReport {
  material_id: string
  material_name: string
  material_sku: string
  rubber_grade: string
  total_quantity_kg: number
  total_dry_weight_kg: number
  avg_drc: number
  batch_count: number
  warehouse_breakdown: Array<{ warehouse_name: string; quantity_kg: number }>
}

// ===== PAGINATION (tÃ¡i sá»­ dá»¥ng pattern ERP) =====

export interface WMSPaginationParams {
  page: number
  pageSize: number
  search?: string
  status?: string
  warehouse_id?: string
  material_id?: string
  type?: string
  from_date?: string
  to_date?: string
  facility_id?: string
  target_grade?: string
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}