// ============================================================================
// FILE: src/services/wms/stockOutService.ts
// MODULE: Kho Thành Phẩm (WMS) — Huy Anh Rubber ERP
// PHASE: P4 — Bước 4.2 (tạo phiếu), 4.3 (thêm chi tiết + picking), 4.4 (xác nhận)
// MÔ TẢ: Phiếu xuất kho — tạo, thêm SP (auto FIFO picking), xác nhận → giảm tồn
// BẢNG: stock_out_orders, stock_out_details, stock_batches, stock_levels,
//        inventory_transactions, warehouse_locations
// PATTERN: async/await, Supabase (giống stockInService)
// ============================================================================

import { supabase } from '../../lib/supabase'
import { pickingService } from './pickingService'
import { batchService } from './batchService'
import type {
  StockOutOrder,
  StockOutDetail,
  StockOutStatus,
  StockOutReason,
  PickingStatus,
  WMSPaginationParams,
  PaginatedResponse,
} from './wms.types'
import type { PickingOptions } from './pickingService'

// ============================================================================
// TYPES — Form data
// ============================================================================

/** Data tạo phiếu xuất (header) */
export interface StockOutFormData {
  type?: 'raw' | 'finished'
  warehouse_id: string
  reason?: StockOutReason
  customer_name?: string
  customer_order_ref?: string
  notes?: string
}

/** Data thêm sản phẩm vào phiếu xuất (auto picking) */
export interface StockOutMaterialRequest {
  material_id: string
  quantity: number
  /** Options cho picking (VD: cho phép lô warning) */
  picking_options?: PickingOptions
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Select string cho phiếu xuất — join details + material + batch + location */
const STOCK_OUT_SELECT = `
  *,
  warehouse:warehouses(id, code, name, type),
  details:stock_out_details(
    *,
    material:materials(id, sku, name, type, unit, weight_per_unit),
    batch:stock_batches(id, batch_no, initial_drc, latest_drc, qc_status, received_date),
    location:warehouse_locations(id, code, shelf, row_name, column_name)
  )
`

/** Select cho danh sách (compact) */
const STOCK_OUT_LIST_SELECT = `
  id, code, type, warehouse_id,
  reason, customer_name, customer_order_ref,
  total_quantity, total_weight, status, notes,
  created_by, confirmed_by, confirmed_at,
  created_at, updated_at,
  warehouse:warehouses(id, code, name)
`

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Tự sinh mã phiếu xuất: XK-TP-YYYYMMDD-XXX
 * VD: XK-TP-20260211-001
 */
async function generateCode(): Promise<string> {
  const now = new Date()
  const yyyy = String(now.getFullYear())
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  const prefix = `XK-TP-${yyyy}${mm}${dd}`

  const { data, error } = await supabase
    .from('stock_out_orders')
    .select('code')
    .like('code', `${prefix}-%`)
    .order('code', { ascending: false })
    .limit(1)

  if (error) throw error

  let seq = 1
  if (data && data.length > 0) {
    const lastCode = data[0].code
    const lastSeq = parseInt(lastCode.split('-').pop() || '0', 10)
    seq = lastSeq + 1
  }

  return `${prefix}-${String(seq).padStart(3, '0')}`
}

// ============================================================================
// SERVICE
// ============================================================================

export const stockOutService = {

  // ==========================================================================
  // BƯỚC 4.2 — TẠO PHIẾU
  // ==========================================================================

  generateCode,

  // --------------------------------------------------------------------------
  // CREATE — Tạo header phiếu xuất (status = draft)
  // --------------------------------------------------------------------------
  async create(data: StockOutFormData, createdBy?: string): Promise<StockOutOrder> {
    const code = await generateCode()

    const insertData = {
      code,
      type: data.type || 'finished',
      warehouse_id: data.warehouse_id,
      reason: data.reason || 'sale',
      customer_name: data.customer_name || null,
      customer_order_ref: data.customer_order_ref || null,
      notes: data.notes || null,
      status: 'draft' as StockOutStatus,
      created_by: createdBy || null,
      total_quantity: 0,
      total_weight: 0,
    }

    const { data: order, error } = await supabase
      .from('stock_out_orders')
      .insert(insertData)
      .select(STOCK_OUT_SELECT)
      .single()

    if (error) throw error
    return order as unknown as StockOutOrder
  },

  // --------------------------------------------------------------------------
  // GET ALL — DS phiếu xuất, phân trang, filter
  // --------------------------------------------------------------------------
  async getAll(params: WMSPaginationParams): Promise<PaginatedResponse<StockOutOrder>> {
    const {
      page = 1,
      pageSize = 20,
      search,
      status,
      warehouse_id,
      type,
      from_date,
      to_date,
    } = params

    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    let query = supabase
      .from('stock_out_orders')
      .select(STOCK_OUT_LIST_SELECT, { count: 'exact' })

    if (status) query = query.eq('status', status)
    if (warehouse_id) query = query.eq('warehouse_id', warehouse_id)
    if (type) query = query.eq('type', type)
    if (from_date) query = query.gte('created_at', `${from_date}T00:00:00`)
    if (to_date) query = query.lte('created_at', `${to_date}T23:59:59`)

    if (search && search.trim()) {
      // Tìm theo mã phiếu hoặc tên khách
      query = query.or(`code.ilike.%${search.trim()}%,customer_name.ilike.%${search.trim()}%`)
    }

    query = query
      .order('created_at', { ascending: false })
      .range(from, to)

    const { data, count, error } = await query
    if (error) throw error

    const total = count ?? 0
    return {
      data: (data || []) as unknown as StockOutOrder[],
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    }
  },

  // --------------------------------------------------------------------------
  // GET BY ID — Chi tiết phiếu + join details → material, batch, location
  // --------------------------------------------------------------------------
  async getById(id: string): Promise<StockOutOrder | null> {
    const { data, error } = await supabase
      .from('stock_out_orders')
      .select(STOCK_OUT_SELECT)
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null
      throw error
    }

    return data as unknown as StockOutOrder
  },

  // ==========================================================================
  // BƯỚC 4.3 — THÊM SẢN PHẨM + TỰ ĐỘNG TẠO PICKING LIST (FIFO)
  // ==========================================================================

  // --------------------------------------------------------------------------
  // ADD MATERIAL REQUEST — Chọn SP + SL → hệ thống tự tạo picking list
  // --------------------------------------------------------------------------
  async addMaterialRequest(
    stockOutId: string,
    request: StockOutMaterialRequest
  ): Promise<{
    details: StockOutDetail[]
    fulfilled: boolean
    shortage: number
  }> {
    // 1. Validate: phiếu phải ở trạng thái draft hoặc picking
    const { data: order, error: orderErr } = await supabase
      .from('stock_out_orders')
      .select('id, status, warehouse_id')
      .eq('id', stockOutId)
      .single()

    if (orderErr) throw orderErr
    if (!order) throw new Error('Không tìm thấy phiếu xuất kho')
    if (order.status !== 'draft' && order.status !== 'picking') {
      throw new Error('Chỉ có thể thêm sản phẩm khi phiếu ở trạng thái Nháp hoặc Đang picking')
    }

    // 2. Lấy danh sách batch_id đã có trong phiếu (exclude khỏi picking mới)
    const { data: existingDetails } = await supabase
      .from('stock_out_details')
      .select('batch_id')
      .eq('stock_out_id', stockOutId)

    const excludeBatchIds = (existingDetails || [])
      .map(d => d.batch_id)
      .filter(Boolean) as string[]

    // 3. Generate FIFO picking list
    const pickingResult = await pickingService.generatePickingList(
      request.material_id,
      order.warehouse_id,
      request.quantity,
      {
        ...request.picking_options,
        exclude_batch_ids: [
          ...(request.picking_options?.exclude_batch_ids || []),
          ...excludeBatchIds,
        ],
      }
    )

    if (pickingResult.items.length === 0) {
      throw new Error('Không tìm thấy lô hàng đủ điều kiện xuất. Kiểm tra tồn kho và trạng thái QC.')
    }

    // 4. Insert stock_out_details cho MỖI lô trong picking list
    const insertDetails = pickingResult.items.map(item => ({
      stock_out_id: stockOutId,
      material_id: item.material_id,
      batch_id: item.batch_id,
      location_id: item.location_id,
      quantity: item.quantity,
      weight: item.weight,
      picking_status: 'pending' as PickingStatus,
    }))

    const { data: newDetails, error: insertErr } = await supabase
      .from('stock_out_details')
      .insert(insertDetails)
      .select(`
        *,
        material:materials(id, sku, name, type, unit, weight_per_unit),
        batch:stock_batches(id, batch_no, initial_drc, latest_drc, qc_status, received_date),
        location:warehouse_locations(id, code, shelf, row_name, column_name)
      `)

    if (insertErr) throw insertErr

    // 5. Update order status → picking (nếu đang draft)
    if (order.status === 'draft') {
      await supabase
        .from('stock_out_orders')
        .update({
          status: 'picking' as StockOutStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', stockOutId)
    }

    // 6. Recalculate totals
    await this._recalculateTotals(stockOutId)

    return {
      details: (newDetails || []) as unknown as StockOutDetail[],
      fulfilled: pickingResult.fulfilled,
      shortage: pickingResult.shortage,
    }
  },

  // --------------------------------------------------------------------------
  // REMOVE DETAIL — Xóa 1 dòng picking (chỉ khi pending)
  // --------------------------------------------------------------------------
  async removeDetail(detailId: string): Promise<void> {
    // Validate: chỉ xóa dòng chưa pick
    const { data: detail, error: fetchErr } = await supabase
      .from('stock_out_details')
      .select('id, stock_out_id, picking_status')
      .eq('id', detailId)
      .single()

    if (fetchErr) throw fetchErr
    if (!detail) throw new Error('Không tìm thấy chi tiết phiếu xuất')
    if (detail.picking_status === 'picked') {
      throw new Error('Không thể xóa dòng đã lấy hàng')
    }

    const { error: deleteErr } = await supabase
      .from('stock_out_details')
      .delete()
      .eq('id', detailId)

    if (deleteErr) throw deleteErr

    // Recalculate totals
    await this._recalculateTotals(detail.stock_out_id)

    // Nếu không còn detail nào → chuyển về draft
    const { data: remaining } = await supabase
      .from('stock_out_details')
      .select('id')
      .eq('stock_out_id', detail.stock_out_id)

    if (!remaining || remaining.length === 0) {
      await supabase
        .from('stock_out_orders')
        .update({
          status: 'draft' as StockOutStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', detail.stock_out_id)
    }
  },

  // ==========================================================================
  // BƯỚC 4.4 — XÁC NHẬN XUẤT KHO → GIẢM TỒN
  // ==========================================================================

  // --------------------------------------------------------------------------
  // CONFIRM STOCK OUT — Xác nhận xuất kho, cập nhật tồn kho
  // --------------------------------------------------------------------------
  async confirmStockOut(
    stockOutId: string,
    confirmedBy?: string
  ): Promise<StockOutOrder> {
    // 1. Validate: tất cả details phải picking_status = 'picked' (hoặc 'skipped')
    const { data: order, error: orderErr } = await supabase
      .from('stock_out_orders')
      .select(`
        id, status, warehouse_id, code,
        details:stock_out_details(
          id, material_id, batch_id, location_id,
          quantity, weight, picking_status
        )
      `)
      .eq('id', stockOutId)
      .single()

    if (orderErr) throw orderErr
    if (!order) throw new Error('Không tìm thấy phiếu xuất kho')
    if (order.status === 'confirmed') {
      throw new Error('Phiếu đã được xác nhận trước đó')
    }
    if (order.status === 'cancelled') {
      throw new Error('Không thể xác nhận phiếu đã hủy')
    }

    const details = (order as any).details as Array<{
      id: string
      material_id: string
      batch_id: string
      location_id: string | null
      quantity: number
      weight: number | null
      picking_status: PickingStatus
    }>

    if (!details || details.length === 0) {
      throw new Error('Phiếu phải có ít nhất 1 chi tiết trước khi xác nhận')
    }

    // Kiểm tra: không còn dòng pending
    const pendingItems = details.filter(
      d => d.picking_status === 'pending' || d.picking_status === 'picking'
    )
    if (pendingItems.length > 0) {
      throw new Error(
        `Còn ${pendingItems.length} dòng chưa hoàn tất picking. Vui lòng lấy hàng hoặc bỏ qua tất cả trước khi xác nhận.`
      )
    }

    // Chỉ xử lý các dòng đã picked (bỏ qua skipped)
    const pickedDetails = details.filter(d => d.picking_status === 'picked')

    if (pickedDetails.length === 0) {
      throw new Error('Không có dòng nào được lấy hàng. Không thể xác nhận phiếu rỗng.')
    }

    const now = new Date().toISOString()

    // 2. Update header → confirmed
    const { error: updateOrderErr } = await supabase
      .from('stock_out_orders')
      .update({
        status: 'confirmed' as StockOutStatus,
        confirmed_by: confirmedBy || null,
        confirmed_at: now,
        updated_at: now,
      })
      .eq('id', stockOutId)

    if (updateOrderErr) throw updateOrderErr

    // 3. Với MỖI detail đã picked → cập nhật tồn kho
    for (const detail of pickedDetails) {
      // 3a. Giảm stock_batches.quantity_remaining
      //     Nếu quantity_remaining = 0 → status = 'depleted'
      await batchService.updateQuantity(detail.batch_id, -detail.quantity)

      // 3b. Giảm stock_levels.quantity
      await this._upsertStockLevel(
        detail.material_id,
        order.warehouse_id,
        -detail.quantity  // delta âm = giảm
      )

      // 3c. Insert inventory_transactions (type='out')
      await supabase
        .from('inventory_transactions')
        .insert({
          material_id: detail.material_id,
          warehouse_id: order.warehouse_id,
          batch_id: detail.batch_id,
          type: 'out',
          quantity: -detail.quantity,  // Âm = xuất
          reference_type: 'stock_out',
          reference_id: stockOutId,
          notes: `Xuất kho từ phiếu ${(order as any).code}`,
          created_by: confirmedBy || null,
        })

      // 3d. Giảm warehouse_locations.current_quantity
      if (detail.location_id) {
        await this._decreaseLocationQuantity(detail.location_id, detail.quantity)
      }
    }

    // 4. Tính lại total (chỉ tính picked, không tính skipped)
    await this._recalculateTotals(stockOutId, true)

    // 5. Return phiếu đã xác nhận
    const confirmed = await this.getById(stockOutId)
    if (!confirmed) throw new Error('Không thể tải phiếu sau khi xác nhận')
    return confirmed
  },

  // --------------------------------------------------------------------------
  // CANCEL — Hủy phiếu xuất (chỉ draft hoặc picking)
  // --------------------------------------------------------------------------
  async cancelStockOut(stockOutId: string): Promise<StockOutOrder> {
    const { data: order, error: fetchErr } = await supabase
      .from('stock_out_orders')
      .select('id, status')
      .eq('id', stockOutId)
      .single()

    if (fetchErr) throw fetchErr
    if (!order) throw new Error('Không tìm thấy phiếu xuất kho')
    if (order.status === 'confirmed') {
      throw new Error('Không thể hủy phiếu đã xác nhận xuất kho')
    }
    if (order.status === 'cancelled') {
      throw new Error('Phiếu đã hủy trước đó')
    }

    // Xóa tất cả details
    await supabase
      .from('stock_out_details')
      .delete()
      .eq('stock_out_id', stockOutId)

    // Update status
    const { data: cancelled, error: updateErr } = await supabase
      .from('stock_out_orders')
      .update({
        status: 'cancelled' as StockOutStatus,
        total_quantity: 0,
        total_weight: 0,
        updated_at: new Date().toISOString(),
      })
      .eq('id', stockOutId)
      .select(STOCK_OUT_SELECT)
      .single()

    if (updateErr) throw updateErr
    return cancelled as unknown as StockOutOrder
  },

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  // --------------------------------------------------------------------------
  // Tính lại tổng quantity / weight của phiếu
  // --------------------------------------------------------------------------
  async _recalculateTotals(
    stockOutId: string,
    pickedOnly: boolean = false
  ): Promise<void> {
    let query = supabase
      .from('stock_out_details')
      .select('quantity, weight, picking_status')
      .eq('stock_out_id', stockOutId)

    const { data: details, error } = await query
    if (error) throw error

    let filtered = details || []
    if (pickedOnly) {
      filtered = filtered.filter(d => d.picking_status === 'picked')
    }

    const totalQty = filtered.reduce((sum, d) => sum + (d.quantity || 0), 0)
    const totalWeight = filtered.reduce((sum, d) => sum + (d.weight || 0), 0)

    await supabase
      .from('stock_out_orders')
      .update({
        total_quantity: totalQty,
        total_weight: totalWeight,
        updated_at: new Date().toISOString(),
      })
      .eq('id', stockOutId)
  },

  // --------------------------------------------------------------------------
  // Upsert stock_levels: tăng/giảm quantity cho material + warehouse
  // --------------------------------------------------------------------------
  async _upsertStockLevel(
    materialId: string,
    warehouseId: string,
    quantityDelta: number
  ): Promise<void> {
    const { data: existing } = await supabase
      .from('stock_levels')
      .select('id, quantity')
      .eq('material_id', materialId)
      .eq('warehouse_id', warehouseId)
      .maybeSingle()

    if (existing) {
      const newQty = Math.max(0, existing.quantity + quantityDelta)
      await supabase
        .from('stock_levels')
        .update({
          quantity: newQty,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
    } else if (quantityDelta > 0) {
      // Chỉ insert nếu delta dương (không tạo record tồn âm)
      await supabase
        .from('stock_levels')
        .insert({
          material_id: materialId,
          warehouse_id: warehouseId,
          quantity: quantityDelta,
        })
    }
  },

  // --------------------------------------------------------------------------
  // Giảm current_quantity của warehouse_location
  // --------------------------------------------------------------------------
  async _decreaseLocationQuantity(
    locationId: string,
    quantityDelta: number
  ): Promise<void> {
    const { data: loc, error: fetchErr } = await supabase
      .from('warehouse_locations')
      .select('id, current_quantity')
      .eq('id', locationId)
      .single()

    if (fetchErr || !loc) return

    const newQty = Math.max(0, (loc.current_quantity || 0) - quantityDelta)
    await supabase
      .from('warehouse_locations')
      .update({ current_quantity: newQty })
      .eq('id', locationId)
  },
}

// ============================================================================
// STANDALONE EXPORTS
// ============================================================================

export const {
  create: createStockOut,
  getAll: getAllStockOuts,
  getById: getStockOutById,
  addMaterialRequest,
  removeDetail: removeStockOutDetail,
  confirmStockOut,
  cancelStockOut,
} = stockOutService

export default stockOutService