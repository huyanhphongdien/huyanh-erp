// ============================================================================
// FILE: src/services/wms/batchService.ts
// MODULE: Kho Thành Phẩm (WMS) — Huy Anh Rubber ERP
// PHASE: P3 — Bước 3.1 (batchService)
// MÔ TẢ: Quản lý lô hàng — tạo lô, cập nhật tồn, DRC, QC status
//         MÃ LÔ MỚI: {Loại}-{MãSP}-{YYMMDD}-{Seq}
//         VD: TP-SVR10-260211-001, PT-SVR10-260215-001
// BẢNG: stock_batches, stock_levels, warehouse_locations
// PATTERN: async/await, Supabase, WMSPaginationParams
// ============================================================================

import { supabase } from '../../lib/supabase'
import type {
  StockBatch,
  QCStatus,
  BatchStatus,
  WMSPaginationParams,
  PaginatedResponse,
} from './wms.types'

// ============================================================================
// TYPES — Form data riêng cho batch
// ============================================================================

export interface CreateBatchData {
  material_id: string
  warehouse_id?: string
  location_id?: string
  initial_quantity: number
  unit?: string
  initial_drc?: number
  batch_type?: 'production' | 'blend' | 'purchase'
  production_order_id?: string
  blend_source_order_id?: string
  supplier_id?: string
  received_date?: string
  expiry_date?: string
  created_by?: string
  parent_batch_id?: string        // Phase 9: lô cha khi chia sub-lot
  sub_lot_code?: string           // Phase 9: 'A', 'B', 'C'...
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Select string kèm join */
const BATCH_SELECT = `
  *,
  material:materials(id, sku, name, type, unit, weight_per_unit, category_id),
  warehouse:warehouses(id, code, name, type),
  location:warehouse_locations(id, code, shelf, row_name, column_name)
`

/** Compact select (cho danh sách) */
const BATCH_LIST_SELECT = `
  id, batch_no, material_id, warehouse_id, location_id,
  initial_quantity, quantity_remaining, unit,
  initial_drc, latest_drc, qc_status,
  last_qc_date, next_recheck_date,
  batch_type, received_date, expiry_date, status,
  parent_batch_id, sub_lot_code,
  created_at, updated_at,
  material:materials(id, sku, name, unit),
  warehouse:warehouses(id, code, name),
  location:warehouse_locations(id, code)
`

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Map batch_type → prefix mã lô
 * TP = Thành phẩm, PT = Phối trộn, NVL = Nguyên vật liệu
 */
function getBatchPrefix(batchType: string, materialType?: string): string {
  if (batchType === 'blend') return 'PT'
  if (materialType === 'raw') return 'NVL'
  return 'TP'
}

/**
 * Lấy mã rút gọn SP từ SKU
 * VD: "TP-SVR10" → "SVR10", "TP-SVR20" → "SVR20", "TP-LAT-HA" → "LATHA"
 * Nếu SKU không có prefix → dùng nguyên
 * Tối đa 8 ký tự, bỏ dấu '-' thừa
 */
function getShortSKU(sku: string): string {
  let short = sku
    .replace(/^TP-/i, '')
    .replace(/^NVL-/i, '')
    .replace(/^PT-/i, '')

  // Rút gọn: bỏ dấu '-' và giới hạn 8 ký tự
  short = short.replace(/-/g, '').toUpperCase()
  return short.substring(0, 8)
}

/**
 * Tự sinh mã lô theo format mới: {Loại}-{MãSP}-{YYMMDD}-{Seq}
 * VD: TP-SVR10-260211-001, PT-SVR10-260215-001, NVL-MU-260211-001
 *
 * @param materialId - UUID của sản phẩm (để lấy SKU)
 * @param batchType  - 'production' | 'blend' | 'purchase'
 */
async function generateBatchNo(
  materialId: string,
  batchType: string = 'production'
): Promise<string> {
  // 1. Lấy SKU + type của material
  const { data: mat, error: matErr } = await supabase
    .from('materials')
    .select('sku, type')
    .eq('id', materialId)
    .single()

  if (matErr) throw matErr
  if (!mat) throw new Error(`Không tìm thấy sản phẩm: ${materialId}`)

  const prefix = getBatchPrefix(batchType, mat.type)
  const shortSKU = getShortSKU(mat.sku)

  // 2. Tạo date part
  const now = new Date()
  const yy = String(now.getFullYear()).slice(-2)
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  const datePart = `${yy}${mm}${dd}`

  // 3. Tìm sequence lớn nhất trong ngày + cùng SP
  const searchPrefix = `${prefix}-${shortSKU}-${datePart}`

  const { data, error } = await supabase
    .from('stock_batches')
    .select('batch_no')
    .like('batch_no', `${searchPrefix}-%`)
    .order('batch_no', { ascending: false })
    .limit(1)

  if (error) throw error

  let seq = 1
  if (data && data.length > 0) {
    const lastNo = data[0].batch_no
    const lastSeq = parseInt(lastNo.split('-').pop() || '0', 10)
    seq = lastSeq + 1
  }

  return `${searchPrefix}-${String(seq).padStart(3, '0')}`
}

// ============================================================================
// SERVICE
// ============================================================================

export const batchService = {

  // --------------------------------------------------------------------------
  // GENERATE — Tự sinh mã lô (expose ra ngoài)
  // --------------------------------------------------------------------------
  generateBatchNo,

  // --------------------------------------------------------------------------
  // HELPERS — Expose để UI có thể preview mã lô
  // --------------------------------------------------------------------------
  getBatchPrefix,
  getShortSKU,

  // --------------------------------------------------------------------------
  // CREATE — Tạo lô hàng mới
  // --------------------------------------------------------------------------
  async createBatch(data: CreateBatchData): Promise<StockBatch> {
    const batchNo = await generateBatchNo(
      data.material_id,
      data.batch_type || 'production'
    )

    const insertData = {
      batch_no: batchNo,
      material_id: data.material_id,
      warehouse_id: data.warehouse_id || null,
      location_id: data.location_id || null,
      initial_quantity: data.initial_quantity,
      quantity_remaining: data.initial_quantity,
      unit: data.unit || 'kg',
      initial_drc: data.initial_drc || null,
      latest_drc: data.initial_drc || null,
      qc_status: 'pending' as QCStatus,
      last_qc_date: data.initial_drc ? new Date().toISOString().split('T')[0] : null,
      batch_type: data.batch_type || 'production',
      production_order_id: data.production_order_id || null,
      blend_source_order_id: data.blend_source_order_id || null,
      supplier_id: data.supplier_id || null,
      received_date: data.received_date || new Date().toISOString().split('T')[0],
      expiry_date: data.expiry_date || null,
      status: 'active' as BatchStatus,
      created_by: data.created_by || null,
      // Phase 9: Sub-lots
      parent_batch_id: data.parent_batch_id || null,
      sub_lot_code: data.sub_lot_code || null,
    }

    const { data: batch, error } = await supabase
      .from('stock_batches')
      .insert(insertData)
      .select(BATCH_SELECT)
      .single()

    if (error) throw error
    return batch as unknown as StockBatch
  },

  // --------------------------------------------------------------------------
  // GET BY ID — Chi tiết lô + join material, warehouse, location
  // --------------------------------------------------------------------------
  async getById(id: string): Promise<StockBatch | null> {
    const { data, error } = await supabase
      .from('stock_batches')
      .select(BATCH_SELECT)
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null // Not found
      throw error
    }

    return data as unknown as StockBatch
  },

  // --------------------------------------------------------------------------
  // GET BY BATCH NO — Tìm theo mã lô
  // --------------------------------------------------------------------------
  async getByBatchNo(batchNo: string): Promise<StockBatch | null> {
    const { data, error } = await supabase
      .from('stock_batches')
      .select(BATCH_SELECT)
      .eq('batch_no', batchNo)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null
      throw error
    }

    return data as unknown as StockBatch
  },

  // --------------------------------------------------------------------------
  // GET ALL — Phân trang, filter
  // --------------------------------------------------------------------------
  async getAll(params: WMSPaginationParams): Promise<PaginatedResponse<StockBatch>> {
    const {
      page = 1,
      pageSize = 20,
      search,
      status,        // 'active' | 'depleted' | 'expired' | 'quarantine'
      warehouse_id,
      material_id,
      type,          // qc_status filter
      from_date,
      to_date,
    } = params

    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    let query = supabase
      .from('stock_batches')
      .select(BATCH_LIST_SELECT, { count: 'exact' })

    // Filter: batch status
    if (status) {
      query = query.eq('status', status)
    }

    // Filter: warehouse
    if (warehouse_id) {
      query = query.eq('warehouse_id', warehouse_id)
    }

    // Filter: material
    if (material_id) {
      query = query.eq('material_id', material_id)
    }

    // Filter: QC status (truyền qua type param)
    if (type) {
      query = query.eq('qc_status', type)
    }

    // Filter: date range (received_date)
    if (from_date) {
      query = query.gte('received_date', from_date)
    }
    if (to_date) {
      query = query.lte('received_date', to_date)
    }

    // Search: batch_no
    if (search && search.trim()) {
      const term = `%${search.trim()}%`
      query = query.ilike('batch_no', term)
    }

    // Order & paginate
    query = query
      .order('created_at', { ascending: false })
      .range(from, to)

    const { data, count, error } = await query
    if (error) throw error

    const total = count ?? 0
    return {
      data: (data || []) as unknown as StockBatch[],
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    }
  },

  // --------------------------------------------------------------------------
  // GET BY MATERIAL — DS lô theo sản phẩm (order by received_date)
  // --------------------------------------------------------------------------
  async getByMaterial(
    materialId: string,
    options?: { activeOnly?: boolean; warehouseId?: string }
  ): Promise<StockBatch[]> {
    let query = supabase
      .from('stock_batches')
      .select(BATCH_LIST_SELECT)
      .eq('material_id', materialId)

    if (options?.activeOnly) {
      query = query.eq('status', 'active')
    }

    if (options?.warehouseId) {
      query = query.eq('warehouse_id', options.warehouseId)
    }

    query = query.order('received_date', { ascending: true })

    const { data, error } = await query
    if (error) throw error
    return (data || []) as unknown as StockBatch[]
  },

  // --------------------------------------------------------------------------
  // GET ACTIVE BATCHES — Lô còn hàng (cho Picking P4)
  // --------------------------------------------------------------------------
  async getActiveBatches(
    options?: {
      warehouse_id?: string
      material_id?: string
      qc_passed_only?: boolean
    }
  ): Promise<StockBatch[]> {
    let query = supabase
      .from('stock_batches')
      .select(BATCH_LIST_SELECT)
      .eq('status', 'active')
      .gt('quantity_remaining', 0)

    if (options?.warehouse_id) {
      query = query.eq('warehouse_id', options.warehouse_id)
    }

    if (options?.material_id) {
      query = query.eq('material_id', options.material_id)
    }

    if (options?.qc_passed_only) {
      query = query.eq('qc_status', 'passed')
    }

    // FIFO: lô cũ nhất trước
    query = query.order('received_date', { ascending: true })

    const { data, error } = await query
    if (error) throw error
    return (data || []) as unknown as StockBatch[]
  },

  // --------------------------------------------------------------------------
  // GET BATCHES DUE RECHECK — Lô cần tái kiểm DRC
  // --------------------------------------------------------------------------
  async getBatchesDueRecheck(): Promise<StockBatch[]> {
    const today = new Date().toISOString().split('T')[0]

    const { data, error } = await supabase
      .from('stock_batches')
      .select(BATCH_LIST_SELECT)
      .eq('status', 'active')
      .neq('qc_status', 'failed')
      .lte('next_recheck_date', today)
      .order('next_recheck_date', { ascending: true })

    if (error) throw error
    return (data || []) as unknown as StockBatch[]
  },

  // --------------------------------------------------------------------------
  // GET SUB-LOTS — Lấy DS lô con của 1 lô cha (Phase 9)
  // --------------------------------------------------------------------------
  async getSubLots(parentBatchId: string): Promise<StockBatch[]> {
    const { data, error } = await supabase
      .from('stock_batches')
      .select(BATCH_LIST_SELECT)
      .eq('parent_batch_id', parentBatchId)
      .order('sub_lot_code', { ascending: true })

    if (error) throw error
    return (data || []) as unknown as StockBatch[]
  },

  // --------------------------------------------------------------------------
  // UPDATE QUANTITY — Tăng/giảm quantity_remaining
  // --------------------------------------------------------------------------
  async updateQuantity(id: string, delta: number): Promise<StockBatch> {
    // Lấy lô hiện tại
    const { data: current, error: fetchError } = await supabase
      .from('stock_batches')
      .select('quantity_remaining, status')
      .eq('id', id)
      .single()

    if (fetchError) throw fetchError
    if (!current) throw new Error(`Không tìm thấy lô: ${id}`)

    const newQty = current.quantity_remaining + delta
    if (newQty < 0) {
      throw new Error(`Không đủ hàng trong lô. Còn: ${current.quantity_remaining}, yêu cầu giảm: ${Math.abs(delta)}`)
    }

    // Cập nhật quantity + auto depleted
    const updateData: Record<string, unknown> = {
      quantity_remaining: newQty,
      updated_at: new Date().toISOString(),
    }

    // Tự động chuyển status khi hết hàng
    if (newQty === 0) {
      updateData.status = 'depleted'
    } else if (current.status === 'depleted' && newQty > 0) {
      // Trường hợp điều chỉnh tăng lại
      updateData.status = 'active'
    }

    const { data, error } = await supabase
      .from('stock_batches')
      .update(updateData)
      .eq('id', id)
      .select(BATCH_SELECT)
      .single()

    if (error) throw error
    return data as unknown as StockBatch
  },

  // --------------------------------------------------------------------------
  // UPDATE QC STATUS — Cập nhật trạng thái QC
  // --------------------------------------------------------------------------
  async updateQCStatus(id: string, qcStatus: QCStatus): Promise<StockBatch> {
    const updateData: Record<string, unknown> = {
      qc_status: qcStatus,
      updated_at: new Date().toISOString(),
    }

    // Nếu failed → quarantine
    if (qcStatus === 'failed') {
      updateData.status = 'quarantine'
    }

    const { data, error } = await supabase
      .from('stock_batches')
      .update(updateData)
      .eq('id', id)
      .select(BATCH_SELECT)
      .single()

    if (error) throw error
    return data as unknown as StockBatch
  },

  // --------------------------------------------------------------------------
  // UPDATE DRC — Cập nhật latest_drc, last_qc_date, next_recheck_date
  // --------------------------------------------------------------------------
  async updateDRC(
    id: string,
    drcValue: number,
    nextRecheckDate?: string
  ): Promise<StockBatch> {
    const updateData: Record<string, unknown> = {
      latest_drc: drcValue,
      last_qc_date: new Date().toISOString().split('T')[0],
      updated_at: new Date().toISOString(),
    }

    if (nextRecheckDate) {
      updateData.next_recheck_date = nextRecheckDate
    }

    const { data, error } = await supabase
      .from('stock_batches')
      .update(updateData)
      .eq('id', id)
      .select(BATCH_SELECT)
      .single()

    if (error) throw error
    return data as unknown as StockBatch
  },

  // --------------------------------------------------------------------------
  // UPDATE STATUS — Chuyển trạng thái lô (active, quarantine, expired)
  // --------------------------------------------------------------------------
  async updateStatus(id: string, status: BatchStatus): Promise<StockBatch> {
    const { data, error } = await supabase
      .from('stock_batches')
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select(BATCH_SELECT)
      .single()

    if (error) throw error
    return data as unknown as StockBatch
  },

  // --------------------------------------------------------------------------
  // UPDATE LOCATION — Di chuyển lô sang vị trí khác
  // --------------------------------------------------------------------------
  async updateLocation(
    id: string,
    warehouseId: string,
    locationId?: string
  ): Promise<StockBatch> {
    const { data, error } = await supabase
      .from('stock_batches')
      .update({
        warehouse_id: warehouseId,
        location_id: locationId || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select(BATCH_SELECT)
      .single()

    if (error) throw error
    return data as unknown as StockBatch
  },

  // --------------------------------------------------------------------------
  // COUNT — Đếm nhanh theo điều kiện
  // --------------------------------------------------------------------------
  async countByStatus(status?: BatchStatus): Promise<number> {
    let query = supabase
      .from('stock_batches')
      .select('id', { count: 'exact', head: true })

    if (status) {
      query = query.eq('status', status)
    }

    const { count, error } = await query
    if (error) throw error
    return count ?? 0
  },

  async countByQCStatus(qcStatus: QCStatus): Promise<number> {
    const { count, error } = await supabase
      .from('stock_batches')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active')
      .eq('qc_status', qcStatus)

    if (error) throw error
    return count ?? 0
  },

  // --------------------------------------------------------------------------
  // MARK EXPIRED — Đánh dấu lô hết hạn (chạy scheduled)
  // --------------------------------------------------------------------------
  async markExpiredBatches(): Promise<number> {
    const today = new Date().toISOString().split('T')[0]

    const { data, error } = await supabase
      .from('stock_batches')
      .update({
        status: 'expired' as BatchStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('status', 'active')
      .not('expiry_date', 'is', null)
      .lte('expiry_date', today)
      .select('id')

    if (error) throw error
    return data?.length ?? 0
  },
}

// ============================================================================
// STANDALONE EXPORTS (tương thích cả 2 pattern import)
// ============================================================================

export const {
  createBatch,
  getById: getBatchById,
  getByBatchNo,
  getAll: getAllBatches,
  getByMaterial: getBatchesByMaterial,
  getActiveBatches,
  getBatchesDueRecheck,
  getSubLots,
  updateQuantity: updateBatchQuantity,
  updateQCStatus: updateBatchQCStatus,
  updateDRC: updateBatchDRC,
  updateStatus: updateBatchStatus,
  updateLocation: updateBatchLocation,
  countByStatus: countBatchesByStatus,
  countByQCStatus: countBatchesByQCStatus,
  markExpiredBatches,
} = batchService

export default batchService