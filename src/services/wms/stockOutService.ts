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
  // Rubber-specific header fields (cho phiếu xuất TP bán container)
  svr_grade?: string | null
  required_drc_min?: number | null
  required_drc_max?: number | null
  container_type?: string | null
  bale_count?: number | null
  // S2: Link tới deal sale — khi confirm sẽ update delivered_weight_kg của deal
  deal_id?: string | null
  // W1: Link tới Sales Order + Container (cho OUT từ phiếu cân hoặc từ page)
  sales_order_id?: string | null
  container_id?: string | null
}

/** Data thêm 1 dòng đã picked vào phiếu (flow chọn batch manual) */
export interface ManualPickedDetail {
  material_id: string
  batch_id: string
  location_id?: string | null
  quantity: number
  /** weight kg, để tính inventory. Nếu null sẽ fallback quantity khi confirm. */
  weight?: number | null
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
 * Tự sinh mã phiếu xuất: XK-TP-YYYYMMDD-XXX (finished) hoặc XK-NVL-YYYYMMDD-XXX (raw)
 */
/**
 * Validate: kho phải đúng loại (raw ↔ raw, finished ↔ finished, mixed ↔ cả 2)
 * Ngăn user xuất NVL khỏi kho thành phẩm hoặc ngược lại
 */
async function _assertWarehouseTypeMatches(
  warehouseId: string,
  orderType: 'raw' | 'finished',
): Promise<void> {
  const { data: wh, error } = await supabase
    .from('warehouses')
    .select('id, name, type')
    .eq('id', warehouseId)
    .single()
  if (error || !wh) throw new Error('Không tìm thấy kho')
  const whType = (wh as any).type as 'raw' | 'finished' | 'mixed' | null
  if (!whType || whType === 'mixed') return
  if (whType !== orderType) {
    const orderLabel = orderType === 'raw' ? 'Nguyên liệu' : 'Thành phẩm'
    const whLabel = whType === 'raw' ? 'Nguyên liệu' : 'Thành phẩm'
    throw new Error(
      `Kho "${(wh as any).name}" là kho ${whLabel}, không thể xuất hàng ${orderLabel}. Chọn kho khác hoặc dùng kho hỗn hợp (mixed).`,
    )
  }
}

async function generateCode(orderType: 'raw' | 'finished' = 'finished'): Promise<string> {
  const now = new Date()
  const yyyy = String(now.getFullYear())
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  const typeSegment = orderType === 'raw' ? 'NVL' : 'TP'
  const prefix = `XK-${typeSegment}-${yyyy}${mm}${dd}`

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
    const orderType: 'raw' | 'finished' = (data.type || 'finished') as 'raw' | 'finished'
    await _assertWarehouseTypeMatches(data.warehouse_id, orderType)

    const code = await generateCode(orderType)

    const insertData: Record<string, any> = {
      code,
      type: orderType,
      warehouse_id: data.warehouse_id,
      reason: data.reason || 'sale',
      customer_name: data.customer_name || null,
      customer_order_ref: data.customer_order_ref || null,
      notes: data.notes || null,
      status: 'draft' as StockOutStatus,
      created_by: createdBy || null,
      total_quantity: 0,
      total_weight: 0,
      // Rubber-specific header fields (nullable, chỉ set khi page truyền vào)
      svr_grade: data.svr_grade || null,
      required_drc_min: data.required_drc_min ?? null,
      required_drc_max: data.required_drc_max ?? null,
      container_type: data.container_type || null,
      bale_count: data.bale_count ?? null,
      // S2: link tới deal sale (nullable, chỉ khi reason='sale')
      deal_id: data.deal_id || null,
      // W1: link tới Sales Order + Container
      sales_order_id: data.sales_order_id || null,
      container_id: data.container_id || null,
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
  // ADD PICKED DETAILS — Bulk insert details với picking_status='picked'
  // cho flow chọn batch manual ở StockOutCreatePage (thay thế inline insert)
  // --------------------------------------------------------------------------
  async addPickedDetails(
    stockOutId: string,
    items: ManualPickedDetail[],
    pickedBy?: string,
  ): Promise<StockOutDetail[]> {
    if (items.length === 0) {
      throw new Error('Không có dòng nào để thêm')
    }

    // 1. Validate phiếu đang draft/picking
    const { data: order, error: orderErr } = await supabase
      .from('stock_out_orders')
      .select('id, status')
      .eq('id', stockOutId)
      .single()

    if (orderErr) throw orderErr
    if (!order) throw new Error('Không tìm thấy phiếu xuất kho')
    if (order.status !== 'draft' && order.status !== 'picking') {
      throw new Error('Chỉ có thể thêm sản phẩm khi phiếu Nháp hoặc Đang picking')
    }

    const now = new Date().toISOString()
    const insertRows = items.map(it => ({
      stock_out_id: stockOutId,
      material_id: it.material_id,
      batch_id: it.batch_id,
      location_id: it.location_id || null,
      quantity: it.quantity,
      weight: it.weight && it.weight > 0 ? it.weight : null,
      picking_status: 'picked' as PickingStatus,
      picked_at: now,
      picked_by: pickedBy || null,
    }))

    const { data: inserted, error: insErr } = await supabase
      .from('stock_out_details')
      .insert(insertRows)
      .select(`
        *,
        material:materials(id, sku, name, type, unit, weight_per_unit),
        batch:stock_batches(id, batch_no, initial_drc, latest_drc, qc_status, received_date),
        location:warehouse_locations(id, code, shelf, row_name, column_name)
      `)

    if (insErr) throw insErr

    // 2. Auto-transition draft → picking nếu còn ở draft
    if (order.status === 'draft') {
      await supabase
        .from('stock_out_orders')
        .update({ status: 'picking' as StockOutStatus, updated_at: now })
        .eq('id', stockOutId)
    }

    // 3. Recalculate totals
    await this._recalculateTotals(stockOutId)

    return (inserted || []) as unknown as StockOutDetail[]
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
    //    QUAN TRỌNG: stock_batches.quantity_remaining lưu COUNT (đơn vị, VD bành),
    //    trong khi stock_levels + inventory_transactions lưu KG.
    //    → Dùng detail.quantity cho batch/location, detail.weight cho levels/tx.
    for (const detail of pickedDetails) {
      const deltaCount = Number(detail.quantity || 0)
      const deltaKg = Number(detail.weight || detail.quantity || 0)

      // 3a. Giảm stock_batches.quantity_remaining theo COUNT (đơn vị)
      //     Nếu quantity_remaining = 0 → status = 'depleted'
      await batchService.updateQuantity(detail.batch_id, -deltaCount)

      // 3b. Giảm stock_levels.quantity theo KG
      await this._upsertStockLevel(
        detail.material_id,
        order.warehouse_id,
        -deltaKg
      )

      // 3c. Insert inventory_transactions (type='out') theo KG
      await supabase
        .from('inventory_transactions')
        .insert({
          material_id: detail.material_id,
          warehouse_id: order.warehouse_id,
          batch_id: detail.batch_id,
          type: 'out',
          quantity: -deltaKg,
          reference_type: 'stock_out',
          reference_id: stockOutId,
          notes: `Xuất kho từ phiếu ${(order as any).code}`,
          created_by: confirmedBy || null,
        })

      // 3d. Giảm warehouse_locations.current_quantity theo count
      if (detail.location_id) {
        await this._decreaseLocationQuantity(detail.location_id, detail.quantity)
      }
    }

    // 4. Tính lại total (chỉ tính picked, không tính skipped)
    await this._recalculateTotals(stockOutId, true)

    // 5. S2: Nếu phiếu có deal_id → update delivered_weight_kg của deal
    //    W6+W7: Nếu phiếu có sales_order_id/container_id → update SO + container.
    //    Non-blocking (log error nhưng không fail confirm).
    const { data: orderFull } = await supabase
      .from('stock_out_orders')
      .select('deal_id, sales_order_id, container_id, total_weight, total_quantity')
      .eq('id', stockOutId)
      .single()

    if (orderFull && (orderFull as any).deal_id) {
      try {
        const { dealWmsService } = await import('../b2b/dealWmsService')
        await dealWmsService.updateDealStockOutTotals((orderFull as any).deal_id)
      } catch (e) {
        console.error('[stockOut] deal sync failed (non-blocking):', e)
      }
    }

    // W6: Update container.gross_weight_kg + status='sealed'
    if (orderFull && (orderFull as any).container_id) {
      try {
        const containerId = (orderFull as any).container_id
        await supabase
          .from('sales_order_containers')
          .update({
            net_weight_kg: (orderFull as any).total_weight || 0,
            bale_count: (orderFull as any).total_quantity || 0,
            status: 'sealed',
            packed_at: now,
            sealed_at: now,
            updated_at: now,
          })
          .eq('id', containerId)
      } catch (e) {
        console.error('[stockOut] container update failed (non-blocking):', e)
      }
    }

    // W7: SO status auto-transition → 'shipped' khi tất cả container đã sealed/shipped
    if (orderFull && (orderFull as any).sales_order_id) {
      try {
        const soId = (orderFull as any).sales_order_id
        const { data: containers } = await supabase
          .from('sales_order_containers')
          .select('status')
          .eq('sales_order_id', soId)
        const allDone = containers && containers.length > 0 &&
          containers.every((c: any) => ['sealed', 'shipped'].includes(c.status))
        if (allDone) {
          await supabase
            .from('sales_orders')
            .update({ status: 'shipped', updated_at: now })
            .eq('id', soId)
        }
      } catch (e) {
        console.error('[stockOut] SO status update failed (non-blocking):', e)
      }
    }

    // 6. Return phiếu đã xác nhận
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
  // S3 — WEIGHBRIDGE OUTBOUND AUTO-SYNC
  // ==========================================================================

  /**
   * Tạo phiếu xuất DRAFT từ phiếu cân outbound (ticket_type='out').
   * Mirror pattern createFromWeighbridgeTicket (inbound) nhưng:
   *  - Draft thay vì confirmed (user phải pick batch trước khi confirm)
   *  - Notes format giống nhau → StockInListPage/StockOutListPage extract
   *    mã ticket qua regex chung.
   *  - Idempotent: nếu đã có phiếu xuất với notes match → return cũ.
   */
  async createDraftFromWeighbridgeTicketOut(
    ticketId: string,
    warehouseId: string,
    createdBy?: string,
  ): Promise<{ stockOut: any; reused?: boolean }> {
    // 1. Fetch ticket + validate
    const { data: ticket, error: ticketErr } = await supabase
      .from('weighbridge_tickets')
      .select('*')
      .eq('id', ticketId)
      .single()

    if (ticketErr) throw ticketErr
    if (!ticket) throw new Error('Không tìm thấy phiếu cân')
    if (ticket.status !== 'completed') throw new Error('Phiếu cân chưa hoàn tất')
    if (ticket.ticket_type !== 'out') {
      throw new Error(`Phiếu cân không phải outbound (type=${ticket.ticket_type})`)
    }

    // 2. Idempotency check — match notes pattern
    if (ticket.code) {
      const { data: existing } = await supabase
        .from('stock_out_orders')
        .select('id, code, status')
        .like('notes', `%phiếu cân ${ticket.code}%`)
        .limit(1)
      if (existing && existing.length > 0) {
        return { stockOut: existing[0], reused: true }
      }
    }

    // 3. Ticket đã có reference_type='stock_out' + reference_id → đã link sẵn,
    //    không tạo mới
    if (ticket.reference_type === 'stock_out' && ticket.reference_id) {
      const { data: linked } = await supabase
        .from('stock_out_orders')
        .select('id, code, status')
        .eq('id', ticket.reference_id)
        .single()
      if (linked) return { stockOut: linked, reused: true }
    }

    // 4. Validate kho TP (outbound mặc định là TP hàng bán)
    await _assertWarehouseTypeMatches(warehouseId, 'finished')

    // 5. Pre-fetch SO + customer + container info nếu ticket đã link
    let customerName: string | null = null
    let customerOrderRef: string | null = null
    let containerType: string | null = null
    let baleCount: number | null = null
    if (ticket.sales_order_id) {
      const { data: so } = await supabase
        .from('sales_orders')
        .select(`
          code, container_type,
          customer:sales_customers(name, short_name)
        `)
        .eq('id', ticket.sales_order_id)
        .single()
      if (so) {
        const customer: any = Array.isArray((so as any).customer) ? (so as any).customer[0] : (so as any).customer
        customerName = customer?.short_name || customer?.name || null
        customerOrderRef = (so as any).code || null
        containerType = (so as any).container_type || null
      }
    }
    if (ticket.container_id) {
      const { data: container } = await supabase
        .from('sales_order_containers')
        .select('container_no, seal_no, container_type, bale_count')
        .eq('id', ticket.container_id)
        .single()
      if (container) {
        containerType = (container as any).container_type || containerType
        baleCount = (container as any).bale_count || null
      }
    }

    // 6. Create header. User decision: AUTO-CONFIRM (status='confirmed') khi
    // có SO + allocation. Nếu không có SO → draft (user pick batch manual).
    const code = await generateCode('finished')
    const containerNote = ticket.container_id ? ' · container linked' : ''
    const { data: order, error: insErr } = await supabase
      .from('stock_out_orders')
      .insert({
        code,
        type: 'finished',
        warehouse_id: warehouseId,
        reason: 'sale' as StockOutReason,
        customer_name: customerName,
        customer_order_ref: customerOrderRef,
        notes: `Từ phiếu cân ${ticket.code}${ticket.vehicle_plate ? ` · ${ticket.vehicle_plate}` : ''}${containerNote}`,
        status: 'draft' as StockOutStatus, // start as draft, will auto-confirm below if allocation exists
        created_by: createdBy || null,
        total_quantity: 0,
        total_weight: ticket.net_weight || 0,
        container_type: containerType,
        bale_count: baleCount,
        sales_order_id: ticket.sales_order_id || null,
        container_id: ticket.container_id || null,
      })
      .select('id, code, status')
      .single()

    if (insErr) throw insErr

    // 7. Nếu có sales_order_id + allocation → auto-fill picked details + confirm
    if (ticket.sales_order_id && order) {
      try {
        // Lấy allocations cho SO (filter theo container nếu có)
        let allocQuery = supabase
          .from('sales_order_stock_allocations')
          .select('stock_batch_id, quantity_kg')
          .eq('sales_order_id', ticket.sales_order_id)
          .in('status', ['reserved', 'packed'])
        if (ticket.container_id) {
          allocQuery = allocQuery.eq('container_id', ticket.container_id)
        }
        const { data: allocations } = await allocQuery

        if (allocations && allocations.length > 0) {
          // Fetch batch details để có material_id + weight_per_unit
          const batchIds = allocations.map((a: any) => a.stock_batch_id).filter(Boolean)
          const { data: batches } = await supabase
            .from('stock_batches')
            .select('id, material_id, location_id, material:materials(weight_per_unit)')
            .in('id', batchIds)

          const items = allocations.map((alloc: any) => {
            const batch: any = batches?.find((b: any) => b.id === alloc.stock_batch_id)
            const wpu = batch?.material?.weight_per_unit || 1
            const weightKg = Number(alloc.quantity_kg) || 0
            const quantity = Math.round((weightKg / wpu) * 100) / 100
            return {
              material_id: batch?.material_id,
              batch_id: alloc.stock_batch_id,
              location_id: batch?.location_id || null,
              quantity,
              weight: weightKg,
            }
          }).filter(it => it.material_id && it.batch_id)

          if (items.length > 0) {
            await this.addPickedDetails(order.id, items, createdBy)
            const confirmed = await this.confirmStockOut(order.id, createdBy)
            return { stockOut: confirmed }
          }
        }
      } catch (e) {
        console.warn('[stockOut OUT] auto-confirm failed, leaving draft:', e)
      }
    }

    return { stockOut: order }
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