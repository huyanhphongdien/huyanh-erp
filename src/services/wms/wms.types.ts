// ============================================================================
// WMS TYPES â€” src/services/wms/wms.types.ts
// Module Kho ThÃ nh Pháº©m - Huy Anh Rubber ERP
// NgÃ y: 10/02/2026
// ============================================================================

// ===== DANH Má»¤C =====

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
}

// ===== PHIáº¾U NHáº¬P KHO =====

export type StockInStatus = 'draft' | 'confirmed' | 'cancelled'
export type StockInSourceType = 'production' | 'purchase' | 'blend' | 'transfer' | 'adjust'

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
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}