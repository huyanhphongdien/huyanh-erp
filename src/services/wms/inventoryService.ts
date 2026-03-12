// ============================================================================
// FILE: src/services/wms/inventoryService.ts
// MODULE: Kho Thành Phẩm (WMS) — Huy Anh Rubber ERP
// PHASE: P5 — Bước 5.1: Tồn kho & Biến động
// MÔ TẢ: Tổng hợp tồn kho, breakdown theo kho/lô, lịch sử xuất nhập,
//         giá trị tồn kho, biến động 30 ngày
// BẢNG: stock_levels, stock_batches, inventory_transactions, materials, warehouses
// PATTERN: async/await, Supabase, consistent với stockInService/batchService
// ============================================================================

import { supabase } from '../../lib/supabase'
import type {
  Material,
  Warehouse,
  StockLevel,
  StockBatch,
  InventoryTransaction,
  TransactionType,
  WMSPaginationParams,
  PaginatedResponse,
} from './wms.types'

// ============================================================================
// TYPES — Riêng cho inventory dashboard
// ============================================================================

/** Tổng hợp tồn kho 1 sản phẩm */
export interface StockSummaryItem {
  material_id: string
  material: Material
  total_quantity: number        // tổng bành/thùng
  total_weight: number          // tổng kg (= quantity × weight_per_unit)
  warehouse_breakdown: Array<{
    warehouse_id: string
    warehouse: Warehouse
    quantity: number
    weight: number
  }>
  min_stock: number
  max_stock?: number
  stock_status: 'normal' | 'low' | 'over' | 'out_of_stock'
}

/** Tổng quan kho */
export interface InventoryOverview {
  total_materials: number       // số loại SP có tồn
  total_quantity: number        // tổng SL tất cả SP
  total_weight: number          // tổng khối lượng
  total_alerts: number          // số cảnh báo active
  low_stock_count: number       // số SP dưới min
  expiring_soon_count: number   // số lô sắp hết hạn
}

/** Biến động tồn kho theo ngày */
export interface StockMovement {
  date: string                  // YYYY-MM-DD
  in_quantity: number           // tổng nhập trong ngày
  out_quantity: number          // tổng xuất trong ngày
  adjust_quantity: number       // tổng điều chỉnh
  balance: number               // tồn cuối ngày (tính lũy kế)
}

/** Params cho lịch sử giao dịch */
export interface TransactionHistoryParams extends WMSPaginationParams {
  transaction_type?: TransactionType
  batch_id?: string
}

// ============================================================================
// SERVICE
// ============================================================================

export const inventoryService = {

  // --------------------------------------------------------------------------
  // TỔNG QUAN KHO
  // --------------------------------------------------------------------------

  /**
   * Lấy overview cho dashboard: tổng SP, tổng SL, cảnh báo...
   */
  async getOverview(): Promise<InventoryOverview> {
    // 1. Đếm materials có tồn kho > 0
    const { data: stockLevels, error: slErr } = await supabase
      .from('stock_levels')
      .select(`
        material_id,
        quantity,
        material:materials(id, name, min_stock, max_stock, weight_per_unit)
      `)
      .gt('quantity', 0)

    if (slErr) throw slErr

    const levels = (stockLevels || []) as any[]

    // Group by material
    const byMaterial = new Map<string, { quantity: number; min_stock: number }>()
    for (const sl of levels) {
      const existing = byMaterial.get(sl.material_id)
      const min = sl.material?.min_stock || 0
      if (existing) {
        existing.quantity += sl.quantity
      } else {
        byMaterial.set(sl.material_id, { quantity: sl.quantity, min_stock: min })
      }
    }

    let lowStockCount = 0
    for (const [, val] of byMaterial) {
      if (val.quantity < val.min_stock && val.min_stock > 0) lowStockCount++
    }

    // 2. Đếm lô sắp hết hạn (30 ngày)
    const thirtyDaysLater = new Date()
    thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30)

    const { count: expiringCount } = await supabase
      .from('stock_batches')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active')
      .gt('quantity_remaining', 0)
      .not('expiry_date', 'is', null)
      .lte('expiry_date', thirtyDaysLater.toISOString())

    // 3. Tính tổng
    const totalQuantity = levels.reduce((sum, sl) => sum + (sl.quantity || 0), 0)
    const totalWeight = levels.reduce((sum, sl) => {
      const wpUnit = sl.material?.weight_per_unit || 0
      return sum + (sl.quantity || 0) * wpUnit
    }, 0)

    return {
      total_materials: byMaterial.size,
      total_quantity: totalQuantity,
      total_weight: Math.round(totalWeight * 100) / 100,
      total_alerts: lowStockCount + (expiringCount || 0),
      low_stock_count: lowStockCount,
      expiring_soon_count: expiringCount || 0,
    }
  },

  // --------------------------------------------------------------------------
  // TỔNG HỢP TỒN KHO THEO SẢN PHẨM
  // --------------------------------------------------------------------------

  /**
   * Tổng hợp tồn kho: group by material, breakdown by warehouse
   */
  async getStockSummary(params?: {
    search?: string
    warehouse_id?: string
    type?: 'raw' | 'finished'
    stock_status?: 'normal' | 'low' | 'over' | 'out_of_stock'
  }): Promise<StockSummaryItem[]> {
    // Lấy tất cả stock_levels có quantity > 0 (hoặc = 0 nếu muốn thấy hết hàng)
    let query = supabase
      .from('stock_levels')
      .select(`
        material_id,
        warehouse_id,
        quantity,
        material:materials(id, sku, name, type, unit, weight_per_unit, min_stock, max_stock, category_id, is_active),
        warehouse:warehouses(id, code, name, type)
      `)

    if (params?.warehouse_id) {
      query = query.eq('warehouse_id', params.warehouse_id)
    }

    const { data, error } = await query
    if (error) throw error

    const rows = (data || []) as any[]

    // Group by material_id
    const groupMap = new Map<string, StockSummaryItem>()

    for (const row of rows) {
      if (!row.material) continue

      // Filter by type
      if (params?.type && row.material.type !== params.type) continue

      // Filter by search
      if (params?.search) {
        const s = params.search.toLowerCase()
        const matchName = row.material.name?.toLowerCase().includes(s)
        const matchSku = row.material.sku?.toLowerCase().includes(s)
        if (!matchName && !matchSku) continue
      }

      const existing = groupMap.get(row.material_id)
      const weight = (row.quantity || 0) * (row.material.weight_per_unit || 0)

      if (existing) {
        existing.total_quantity += row.quantity || 0
        existing.total_weight += weight
        existing.warehouse_breakdown.push({
          warehouse_id: row.warehouse_id,
          warehouse: row.warehouse,
          quantity: row.quantity || 0,
          weight: Math.round(weight * 100) / 100,
        })
      } else {
        groupMap.set(row.material_id, {
          material_id: row.material_id,
          material: row.material,
          total_quantity: row.quantity || 0,
          total_weight: Math.round(weight * 100) / 100,
          warehouse_breakdown: [{
            warehouse_id: row.warehouse_id,
            warehouse: row.warehouse,
            quantity: row.quantity || 0,
            weight: Math.round(weight * 100) / 100,
          }],
          min_stock: row.material.min_stock || 0,
          max_stock: row.material.max_stock,
          stock_status: 'normal',
        })
      }
    }

    // Tính stock_status + round totals
    const result = Array.from(groupMap.values()).map(item => {
      item.total_weight = Math.round(item.total_weight * 100) / 100

      if (item.total_quantity <= 0) {
        item.stock_status = 'out_of_stock'
      } else if (item.min_stock > 0 && item.total_quantity < item.min_stock) {
        item.stock_status = 'low'
      } else if (item.max_stock && item.total_quantity > item.max_stock) {
        item.stock_status = 'over'
      } else {
        item.stock_status = 'normal'
      }
      return item
    })

    // Filter by stock_status
    if (params?.stock_status) {
      return result.filter(r => r.stock_status === params.stock_status)
    }

    // Sort: cảnh báo trước, rồi theo tên
    return result.sort((a, b) => {
      const priority = { out_of_stock: 0, low: 1, over: 2, normal: 3 }
      const diff = priority[a.stock_status] - priority[b.stock_status]
      if (diff !== 0) return diff
      return (a.material.name || '').localeCompare(b.material.name || '')
    })
  },

  // --------------------------------------------------------------------------
  // TỒN KHO 1 KHO
  // --------------------------------------------------------------------------

  /**
   * Tồn kho chi tiết 1 kho
   */
  async getStockByWarehouse(warehouseId: string): Promise<Array<{
    material: Material
    quantity: number
    weight: number
    batches: StockBatch[]
  }>> {
    // Lấy stock_levels
    const { data: levels, error: lvlErr } = await supabase
      .from('stock_levels')
      .select(`
        material_id, quantity,
        material:materials(id, sku, name, type, unit, weight_per_unit, min_stock, max_stock)
      `)
      .eq('warehouse_id', warehouseId)
      .gt('quantity', 0)

    if (lvlErr) throw lvlErr

    // Lấy batches active trong kho này
    const { data: batches, error: batchErr } = await supabase
      .from('stock_batches')
      .select(`
        id, batch_no, material_id, warehouse_id, location_id,
        initial_quantity, quantity_remaining, unit,
        initial_drc, latest_drc, qc_status, status,
        received_date, expiry_date, created_at
      `)
      .eq('warehouse_id', warehouseId)
      .eq('status', 'active')
      .gt('quantity_remaining', 0)
      .order('received_date', { ascending: true })

    if (batchErr) throw batchErr

    // Group batches by material
    const batchByMaterial = new Map<string, StockBatch[]>()
    for (const b of (batches || [])) {
      const arr = batchByMaterial.get(b.material_id) || []
      arr.push(b as StockBatch)
      batchByMaterial.set(b.material_id, arr)
    }

    return ((levels || []) as any[]).map(sl => ({
      material: sl.material as Material,
      quantity: sl.quantity || 0,
      weight: Math.round((sl.quantity || 0) * (sl.material?.weight_per_unit || 0) * 100) / 100,
      batches: batchByMaterial.get(sl.material_id) || [],
    }))
  },

  // --------------------------------------------------------------------------
  // TỒN CHI TIẾT THEO LÔ (1 SẢN PHẨM)
  // --------------------------------------------------------------------------

  /**
   * Tồn chi tiết theo lô — dùng cho InventoryDetailPage
   */
  async getStockByBatch(materialId: string, warehouseId?: string): Promise<StockBatch[]> {
    let query = supabase
      .from('stock_batches')
      .select(`
        *,
        material:materials(id, sku, name, type, unit, weight_per_unit),
        warehouse:warehouses(id, code, name),
        location:warehouse_locations(id, code, shelf, row_name, column_name)
      `)
      .eq('material_id', materialId)
      .eq('status', 'active')
      .gt('quantity_remaining', 0)
      .order('received_date', { ascending: true })

    if (warehouseId) {
      query = query.eq('warehouse_id', warehouseId)
    }

    const { data, error } = await query
    if (error) throw error
    return (data || []) as StockBatch[]
  },

  // --------------------------------------------------------------------------
  // LỊCH SỬ GIAO DỊCH
  // --------------------------------------------------------------------------

  /**
   * Lịch sử xuất nhập tồn — phân trang, filter
   */
  async getTransactionHistory(params: TransactionHistoryParams): Promise<PaginatedResponse<InventoryTransaction>> {
    const { page = 1, pageSize = 20, material_id, warehouse_id, from_date, to_date, search } = params

    let countQuery = supabase
      .from('inventory_transactions')
      .select('id', { count: 'exact', head: true })

    let dataQuery = supabase
      .from('inventory_transactions')
      .select(`
        *,
        material:materials(id, sku, name, type, unit),
        batch:stock_batches(id, batch_no)
      `)

    // Filters
    if (material_id) {
      countQuery = countQuery.eq('material_id', material_id)
      dataQuery = dataQuery.eq('material_id', material_id)
    }
    if (warehouse_id) {
      countQuery = countQuery.eq('warehouse_id', warehouse_id)
      dataQuery = dataQuery.eq('warehouse_id', warehouse_id)
    }
    if (params.transaction_type) {
      countQuery = countQuery.eq('type', params.transaction_type)
      dataQuery = dataQuery.eq('type', params.transaction_type)
    }
    if (params.batch_id) {
      countQuery = countQuery.eq('batch_id', params.batch_id)
      dataQuery = dataQuery.eq('batch_id', params.batch_id)
    }
    if (from_date) {
      countQuery = countQuery.gte('created_at', from_date)
      dataQuery = dataQuery.gte('created_at', from_date)
    }
    if (to_date) {
      countQuery = countQuery.lte('created_at', to_date)
      dataQuery = dataQuery.lte('created_at', to_date)
    }

    // Count
    const { count, error: countErr } = await countQuery
    if (countErr) throw countErr
    const total = count || 0

    // Data
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    const { data, error } = await dataQuery
      .order('created_at', { ascending: false })
      .range(from, to)

    if (error) throw error

    return {
      data: (data || []) as InventoryTransaction[],
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    }
  },

  // --------------------------------------------------------------------------
  // BIẾN ĐỘNG TỒN KHO THEO NGÀY (CHART DATA)
  // --------------------------------------------------------------------------

  /**
   * Biến động 30 ngày — dùng cho line chart
   */
  async getStockMovements(materialId: string, days: number = 30): Promise<StockMovement[]> {
    const fromDate = new Date()
    fromDate.setDate(fromDate.getDate() - days)

    const { data: transactions, error } = await supabase
      .from('inventory_transactions')
      .select('type, quantity, created_at')
      .eq('material_id', materialId)
      .gte('created_at', fromDate.toISOString())
      .order('created_at', { ascending: true })

    if (error) throw error

    // Group by date
    const dayMap = new Map<string, { in_qty: number; out_qty: number; adj_qty: number }>()

    // Init tất cả ngày trong range
    for (let i = 0; i <= days; i++) {
      const d = new Date()
      d.setDate(d.getDate() - (days - i))
      const key = d.toISOString().split('T')[0]
      dayMap.set(key, { in_qty: 0, out_qty: 0, adj_qty: 0 })
    }

    // Aggregate transactions
    for (const tx of (transactions || [])) {
      const dateKey = tx.created_at.split('T')[0]
      const entry = dayMap.get(dateKey)
      if (!entry) continue

      const qty = Math.abs(tx.quantity || 0)
      switch (tx.type as TransactionType) {
        case 'in':
        case 'blend_in':
          entry.in_qty += qty
          break
        case 'out':
        case 'blend_out':
          entry.out_qty += qty
          break
        case 'adjust':
        case 'transfer':
          entry.adj_qty += tx.quantity || 0 // có thể âm
          break
      }
    }

    // Lấy tồn hiện tại để tính ngược
    const { data: currentStock } = await supabase
      .from('stock_levels')
      .select('quantity')
      .eq('material_id', materialId)

    let currentBalance = (currentStock || []).reduce((sum, sl) => sum + (sl.quantity || 0), 0)

    // Tính balance từ cuối về đầu
    const sortedDates = Array.from(dayMap.keys()).sort()
    const movements: StockMovement[] = []

    // Tính tổng biến động từ ngày cuối đến hiện tại
    // Rồi đi từ cuối về đầu để có balance mỗi ngày
    const dailyData = sortedDates.map(date => {
      const entry = dayMap.get(date)!
      return { date, ...entry }
    })

    // Tính balance: balance cuối = currentBalance
    // balance(ngày i) = balance(ngày i+1) - in(ngày i+1) + out(ngày i+1) - adj(ngày i+1)
    const balances = new Array(dailyData.length).fill(0)
    balances[dailyData.length - 1] = currentBalance

    for (let i = dailyData.length - 2; i >= 0; i--) {
      const next = dailyData[i + 1]
      balances[i] = balances[i + 1] - next.in_qty + next.out_qty - next.adj_qty
    }

    for (let i = 0; i < dailyData.length; i++) {
      movements.push({
        date: dailyData[i].date,
        in_quantity: dailyData[i].in_qty,
        out_quantity: dailyData[i].out_qty,
        adjust_quantity: dailyData[i].adj_qty,
        balance: Math.max(0, balances[i]),
      })
    }

    return movements
  },

  // --------------------------------------------------------------------------
  // GIÁ TRỊ TỒN KHO (placeholder — cần bổ sung cột cost_price)
  // --------------------------------------------------------------------------

  /**
   * Tổng giá trị tồn kho — hiện tại tính theo weight
   * TODO: bổ sung cost_price vào materials để tính chính xác
   */
  async getStockValue(): Promise<{
    total_weight: number
    by_material: Array<{
      material: Material
      quantity: number
      weight: number
    }>
  }> {
    const summary = await this.getStockSummary({ type: 'finished' })

    const byMaterial = summary.map(s => ({
      material: s.material,
      quantity: s.total_quantity,
      weight: s.total_weight,
    }))

    return {
      total_weight: byMaterial.reduce((sum, m) => sum + m.weight, 0),
      by_material: byMaterial,
    }
  },
}

export default inventoryService