// ============================================================================
// FILE: src/services/wms/stockInService.ts
// MODULE: Kho Thanh Pham (WMS) - Huy Anh Rubber ERP
// PHASE: P3 - Buoc 3.2 (tao phieu), 3.3 (them chi tiet), 3.4 (xac nhan)
// MO TA: Phiếu nhập kho - tao, them chi tiet + tao lo, xac nhan -> cap nhat ton
// BANG: stock_in_orders, stock_in_details, stock_batches, stock_levels,
//       inventory_transactions, warehouse_locations
// PATTERN: async/await, Supabase
// ============================================================================

import { supabase } from '../../lib/supabase'
import { batchService } from './batchService'
import type {
  StockInOrder,
  StockInDetail,
  StockInFormData,
  StockInDetailFormData,
  StockInStatus,
  WMSPaginationParams,
  PaginatedResponse,
} from './wms.types'

// ============================================================================
// CONSTANTS
// ============================================================================

/** Select string cho phiếu nhập - join details + material + batch + location */
const STOCK_IN_SELECT = `
  *,
  warehouse:warehouses(id, code, name, type),
  creator:employees!stock_in_orders_created_by_fkey(full_name),
  confirmer:employees!stock_in_orders_confirmed_by_fkey(full_name),
  details:stock_in_details(
    *,
    material:materials(id, sku, name, type, unit, weight_per_unit),
    batch:stock_batches(id, batch_no, initial_drc, latest_drc, qc_status),
    location:warehouse_locations(id, code, shelf, row_name, column_name)
  )
`

/** Select cho danh sach (compact) */
const STOCK_IN_LIST_SELECT = `
  id, code, type, warehouse_id, source_type, deal_id,
  total_quantity, total_weight, status, notes,
  created_by, confirmed_by, confirmed_at,
  created_at, updated_at,
  warehouse:warehouses(id, code, name),
  creator:employees!stock_in_orders_created_by_fkey(full_name),
  confirmer:employees!stock_in_orders_confirmed_by_fkey(full_name),
  deal:b2b_deals!deal_id(id, deal_number)
`

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Tu sinh ma phiếu nhập: NK-TP-YYYYMMDD-XXX
 * VD: NK-TP-20260210-001
 */
async function generateCode(): Promise<string> {
  const now = new Date()
  const yyyy = String(now.getFullYear())
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  const prefix = `NK-TP-${yyyy}${mm}${dd}`

  const { data, error } = await supabase
    .from('stock_in_orders')
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

export const stockInService = {

  // ==========================================================================
  // BUOC 3.2 - TAO PHIEU
  // ==========================================================================

  // --------------------------------------------------------------------------
  // GENERATE CODE
  // --------------------------------------------------------------------------
  generateCode,

  // --------------------------------------------------------------------------
  // CREATE - Tao header phiếu nhập (status = draft)
  // --------------------------------------------------------------------------
  async create(data: StockInFormData, createdBy?: string): Promise<StockInOrder> {
    const code = await generateCode()

    const insertData = {
      code,
      type: data.type || 'finished',
      warehouse_id: data.warehouse_id,
      source_type: data.source_type || 'production',
      production_order_id: data.production_order_id || null,
      deal_id: data.deal_id || null,
      notes: data.notes || null,
      status: 'draft' as StockInStatus,
      created_by: createdBy || null,
      total_quantity: 0,
      total_weight: 0,
    }

    const { data: order, error } = await supabase
      .from('stock_in_orders')
      .insert(insertData)
      .select(STOCK_IN_SELECT)
      .single()

    if (error) throw error
    return order as unknown as StockInOrder
  },

  // --------------------------------------------------------------------------
  // GET ALL - DS phiếu nhập, phan trang, filter
  // --------------------------------------------------------------------------
  async getAll(params: WMSPaginationParams): Promise<PaginatedResponse<StockInOrder>> {
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
      .from('stock_in_orders')
      .select(STOCK_IN_LIST_SELECT, { count: 'exact' })

    if (status) query = query.eq('status', status)
    if (warehouse_id) query = query.eq('warehouse_id', warehouse_id)
    if (type) query = query.eq('type', type)
    if (from_date) query = query.gte('created_at', `${from_date}T00:00:00`)
    if (to_date) query = query.lte('created_at', `${to_date}T23:59:59`)

    if (search && search.trim()) {
      query = query.ilike('code', `%${search.trim()}%`)
    }

    query = query
      .order('created_at', { ascending: false })
      .range(from, to)

    const { data, count, error } = await query
    if (error) throw error

    const total = count ?? 0
    return {
      data: (data || []) as unknown as StockInOrder[],
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    }
  },

  // --------------------------------------------------------------------------
  // GET BY ID - Chi tiet phieu + join details -> material, batch, location
  // --------------------------------------------------------------------------
  async getById(id: string): Promise<StockInOrder | null> {
    const { data, error } = await supabase
      .from('stock_in_orders')
      .select(STOCK_IN_SELECT)
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null
      throw error
    }

    return data as unknown as StockInOrder
  },

  // ==========================================================================
  // BUOC 3.3 - THEM / SUA / XOA CHI TIET
  // ==========================================================================

  // --------------------------------------------------------------------------
  // ADD DETAIL - Them chi tiet + tao lo moi
  // --------------------------------------------------------------------------
  async addDetail(
    stockInId: string,
    detail: StockInDetailFormData
  ): Promise<StockInDetail> {
    // 1. Validate: phieu phai o trang thai draft
    const { data: order, error: orderErr } = await supabase
      .from('stock_in_orders')
      .select('id, status, warehouse_id')
      .eq('id', stockInId)
      .single()

    if (orderErr) throw orderErr
    if (!order) throw new Error('Không tìm thấy phiếu nhập kho')
    if (order.status !== 'draft') {
      throw new Error('Chi co the them chi tiet khi phieu o trang thai Nhap')
    }

    // 2. Tao lô hàng moi (stock_batches)
    const batch = await batchService.createBatch({
      material_id: detail.material_id,
      warehouse_id: order.warehouse_id,
      location_id: detail.location_id,
      initial_quantity: detail.quantity,
      initial_drc: detail.initial_drc,
      batch_type: 'production',
    })

    // 3. Tao chi tiet phiếu nhập (stock_in_details)
    const insertDetail = {
      stock_in_id: stockInId,
      material_id: detail.material_id,
      batch_id: batch.id,
      location_id: detail.location_id || null,
      quantity: detail.quantity,
      weight: detail.weight || null,
      unit: 'kg',
      notes: detail.notes || null,
    }

    const { data: newDetail, error: detailErr } = await supabase
      .from('stock_in_details')
      .insert(insertDetail)
      .select(`
        *,
        material:materials(id, sku, name, type, unit, weight_per_unit),
        batch:stock_batches(id, batch_no, initial_drc, latest_drc, qc_status),
        location:warehouse_locations(id, code, shelf, row_name, column_name)
      `)
      .single()

    if (detailErr) throw detailErr

    // 4. Cap nhat tong số lượng / trong luong header
    await this._recalculateTotals(stockInId)

    return newDetail as unknown as StockInDetail
  },

  // --------------------------------------------------------------------------
  // REMOVE DETAIL - Xoa chi tiet (chi khi phieu con draft)
  // --------------------------------------------------------------------------
  async removeDetail(detailId: string): Promise<void> {
    // Lay detail + kiem tra status phieu
    const { data: detail, error: fetchErr } = await supabase
      .from('stock_in_details')
      .select('id, stock_in_id, batch_id')
      .eq('id', detailId)
      .single()

    if (fetchErr) throw fetchErr
    if (!detail) throw new Error('Không tìm thấy chi tiết')

    // Kiem tra phieu draft
    const { data: order, error: orderErr } = await supabase
      .from('stock_in_orders')
      .select('status')
      .eq('id', detail.stock_in_id)
      .single()

    if (orderErr) throw orderErr
    if (order?.status !== 'draft') {
      throw new Error('Chi co the xoa chi tiet khi phieu o trang thai Nhap')
    }

    // Xoa lô hàng lien quan (neu co)
    if (detail.batch_id) {
      await supabase
        .from('stock_batches')
        .delete()
        .eq('id', detail.batch_id)
    }

    // Xoa chi tiet
    const { error: deleteErr } = await supabase
      .from('stock_in_details')
      .delete()
      .eq('id', detailId)

    if (deleteErr) throw deleteErr

    // Cap nhat tong
    await this._recalculateTotals(detail.stock_in_id)
  },

  // --------------------------------------------------------------------------
  // UPDATE DETAIL - Sua số lượng / vị trí (chi khi draft)
  // --------------------------------------------------------------------------
  async updateDetail(
    detailId: string,
    data: Partial<StockInDetailFormData>
  ): Promise<StockInDetail> {
    // Lay detail hien tai
    const { data: existing, error: fetchErr } = await supabase
      .from('stock_in_details')
      .select('id, stock_in_id, batch_id')
      .eq('id', detailId)
      .single()

    if (fetchErr) throw fetchErr
    if (!existing) throw new Error('Không tìm thấy chi tiết')

    // Kiem tra phieu draft
    const { data: order, error: orderErr } = await supabase
      .from('stock_in_orders')
      .select('status')
      .eq('id', existing.stock_in_id)
      .single()

    if (orderErr) throw orderErr
    if (order?.status !== 'draft') {
      throw new Error('Chi co the sua chi tiet khi phieu o trang thai Nhap')
    }

    // Update detail
    const updateData: Record<string, unknown> = {}
    if (data.quantity !== undefined) updateData.quantity = data.quantity
    if (data.weight !== undefined) updateData.weight = data.weight
    if (data.location_id !== undefined) updateData.location_id = data.location_id
    if (data.notes !== undefined) updateData.notes = data.notes

    const { data: updated, error: updateErr } = await supabase
      .from('stock_in_details')
      .update(updateData)
      .eq('id', detailId)
      .select(`
        *,
        material:materials(id, sku, name, type, unit, weight_per_unit),
        batch:stock_batches(id, batch_no, initial_drc, latest_drc, qc_status),
        location:warehouse_locations(id, code, shelf, row_name, column_name)
      `)
      .single()

    if (updateErr) throw updateErr

    // Dong bo quantity ve batch neu thay doi
    if (data.quantity !== undefined && existing.batch_id) {
      await supabase
        .from('stock_batches')
        .update({
          initial_quantity: data.quantity,
          quantity_remaining: data.quantity,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.batch_id)
    }

    // Dong bộ lọcation ve batch
    if (data.location_id !== undefined && existing.batch_id) {
      await supabase
        .from('stock_batches')
        .update({
          location_id: data.location_id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.batch_id)
    }

    // Cap nhat tong
    await this._recalculateTotals(existing.stock_in_id)

    return updated as unknown as StockInDetail
  },

  // ==========================================================================
  // BUOC 3.4 - XAC NHAN NHAP KHO
  // ==========================================================================

  // --------------------------------------------------------------------------
  // CONFIRM - Xac nhan nhập kho -> cap nhat tồn kho, ghi giao dich
  // --------------------------------------------------------------------------
  async confirmStockIn(stockInId: string, confirmedBy: string): Promise<StockInOrder> {
    // 1. Validate: phieu phai o status=draft, co it nhat 1 detail
    const { data: order, error: orderErr } = await supabase
      .from('stock_in_orders')
      .select(`
        id, status, warehouse_id,
        details:stock_in_details(id, material_id, batch_id, location_id, quantity, weight)
      `)
      .eq('id', stockInId)
      .single()

    if (orderErr) throw orderErr
    if (!order) throw new Error('Không tìm thấy phiếu nhập kho')
    if (order.status !== 'draft') {
      throw new Error('Chi co the xac nhan phieu o trang thai Nhap')
    }

    const details = (order as any).details as Array<{
      id: string
      material_id: string
      batch_id: string
      location_id: string | null
      quantity: number
      weight: number | null
    }>

    if (!details || details.length === 0) {
      throw new Error('Phieu phai co it nhat 1 chi tiet truoc khi xac nhan')
    }

    // 2. Update header -> confirmed
    const now = new Date().toISOString()
    const { error: updateOrderErr } = await supabase
      .from('stock_in_orders')
      .update({
        status: 'confirmed' as StockInStatus,
        confirmed_by: confirmedBy,
        confirmed_at: now,
        updated_at: now,
      })
      .eq('id', stockInId)

    if (updateOrderErr) throw updateOrderErr

    // 3. Voi MOI detail -> cap nhat tồn kho
    for (const detail of details) {
      // 3a. Upsert stock_levels: tang quantity
      await this._upsertStockLevel(
        detail.material_id,
        order.warehouse_id,
        detail.quantity
      )

      // 3b. Insert inventory_transactions (type='in')
      await supabase
        .from('inventory_transactions')
        .insert({
          material_id: detail.material_id,
          warehouse_id: order.warehouse_id,
          batch_id: detail.batch_id,
          type: 'in',
          quantity: detail.quantity,
          reference_type: 'stock_in',
          reference_id: stockInId,
          notes: `Nhap kho tu phieu ${order.id}`,
          created_by: confirmedBy,
        })

      // 3c. Update warehouse_locations.current_quantity
      if (detail.location_id) {
        await this._increaseLocationQuantity(detail.location_id, detail.quantity)
      }

      // 3d. Update stock_batches.status = 'active'
      if (detail.batch_id) {
        await supabase
          .from('stock_batches')
          .update({
            status: 'active',
            warehouse_id: order.warehouse_id,
            updated_at: now,
          })
          .eq('id', detail.batch_id)
      }
    }

    // 4. Tinh total_quantity, total_weight -> update header
    await this._recalculateTotals(stockInId)

    // 5. Phase 4: Neu co deal_id -> cap nhat deal totals + gui thong bao chat
    const { data: orderWithDeal } = await supabase
      .from('stock_in_orders')
      .select('deal_id, code, total_weight')
      .eq('id', stockInId)
      .single()

    if (orderWithDeal?.deal_id) {
      try {
        const { dealWmsService } = await import('../b2b/dealWmsService')
        await dealWmsService.updateDealStockInTotals(orderWithDeal.deal_id)
        await dealWmsService.notifyDealChatStockIn(
          orderWithDeal.deal_id,
          orderWithDeal.code,
          orderWithDeal.total_weight || 0
        )
      } catch (err) {
        console.error('Update deal after stock-in confirm failed:', err)
        // Non-blocking: stock-in van thanh cong
      }
    }

    // 6. Return phieu da xac nhan
    const confirmed = await this.getById(stockInId)
    if (!confirmed) throw new Error('Không thể tải phiếu sau khi xác nhận')
    return confirmed
  },

  // --------------------------------------------------------------------------
  // CANCEL - Huy phieu (chi draft)
  // --------------------------------------------------------------------------
  async cancelStockIn(stockInId: string): Promise<StockInOrder> {
    const { data: order, error: fetchErr } = await supabase
      .from('stock_in_orders')
      .select('id, status')
      .eq('id', stockInId)
      .single()

    if (fetchErr) throw fetchErr
    if (!order) throw new Error('Không tìm thấy phiếu nhập kho')
    if (order.status !== 'draft') {
      throw new Error('Chi co the huy phieu o trang thai Nhap')
    }

    // Xoa cac lo lien quan (chua active)
    const { data: details } = await supabase
      .from('stock_in_details')
      .select('batch_id')
      .eq('stock_in_id', stockInId)

    if (details) {
      const batchIds = details
        .map(d => d.batch_id)
        .filter(Boolean) as string[]

      if (batchIds.length > 0) {
        await supabase
          .from('stock_batches')
          .delete()
          .in('id', batchIds)
      }
    }

    // Update status
    const { data: cancelled, error: updateErr } = await supabase
      .from('stock_in_orders')
      .update({
        status: 'cancelled' as StockInStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', stockInId)
      .select(STOCK_IN_SELECT)
      .single()

    if (updateErr) throw updateErr
    return cancelled as unknown as StockInOrder
  },

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  // --------------------------------------------------------------------------
  // Tinh lai tong quantity / weight cua phieu
  // --------------------------------------------------------------------------
  async _recalculateTotals(stockInId: string): Promise<void> {
    const { data: details, error } = await supabase
      .from('stock_in_details')
      .select('quantity, weight')
      .eq('stock_in_id', stockInId)

    if (error) throw error

    const totalQty = (details || []).reduce((sum, d) => sum + (d.quantity || 0), 0)
    const totalWeight = (details || []).reduce((sum, d) => sum + (d.weight || 0), 0)

    await supabase
      .from('stock_in_orders')
      .update({
        total_quantity: totalQty,
        total_weight: totalWeight,
        updated_at: new Date().toISOString(),
      })
      .eq('id', stockInId)
  },

  // --------------------------------------------------------------------------
  // Upsert stock_levels: tang quantity cho material + warehouse
  // --------------------------------------------------------------------------
  async _upsertStockLevel(
    materialId: string,
    warehouseId: string,
    quantityDelta: number
  ): Promise<void> {
    // Thu tim record hien tai
    const { data: existing } = await supabase
      .from('stock_levels')
      .select('id, quantity')
      .eq('material_id', materialId)
      .eq('warehouse_id', warehouseId)
      .maybeSingle()

    if (existing) {
      // Update: tang quantity
      await supabase
        .from('stock_levels')
        .update({
          quantity: existing.quantity + quantityDelta,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
    } else {
      // Insert moi
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
  // Tang current_quantity cua warehouse_location
  // --------------------------------------------------------------------------
  async _increaseLocationQuantity(
    locationId: string,
    quantityDelta: number
  ): Promise<void> {
    const { data: loc, error: fetchErr } = await supabase
      .from('warehouse_locations')
      .select('id, current_quantity')
      .eq('id', locationId)
      .single()

    if (fetchErr || !loc) return // Bo qua neu khong tim thay

    await supabase
      .from('warehouse_locations')
      .update({
        current_quantity: (loc.current_quantity || 0) + quantityDelta,
      })
      .eq('id', locationId)
  },
}

// ============================================================================
// STANDALONE EXPORTS
// ============================================================================

export const {
  create: createStockIn,
  getAll: getAllStockIns,
  getById: getStockInById,
  addDetail: addStockInDetail,
  removeDetail: removeStockInDetail,
  updateDetail: updateStockInDetail,
  confirmStockIn,
  cancelStockIn,
} = stockInService

export default stockInService
