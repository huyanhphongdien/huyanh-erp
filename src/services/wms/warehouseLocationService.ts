// src/services/wms/warehouseLocationService.ts
// Service quản lý Vị trí kho (Warehouse Locations)
import { supabase } from '../../lib/supabase'

// ============================================
// INTERFACES
// ============================================

export type LocationStatus = 'empty' | 'partial' | 'full' | 'unavailable'

export interface WarehouseLocation {
  id: string
  warehouse_id: string
  code: string                         // VD: B-K1-A1
  shelf?: string                       // Kệ: K1, K2...
  row_name?: string                    // Hàng: A, B, C...
  column_name?: string                 // Ô: 1, 2, 3...
  capacity?: number                    // Sức chứa (kg)
  current_quantity: number             // Đang chứa
  is_available: boolean
  created_at: string
  // Computed
  usage_percent?: number
  status?: LocationStatus
  warehouse?: {
    id: string
    code: string
    name: string
  }
}

export interface LocationFormData {
  warehouse_id: string
  code: string
  shelf?: string
  row_name?: string
  column_name?: string
  capacity?: number
  is_available?: boolean
}

export interface LocationBulkCreateData {
  warehouse_id: string
  warehouse_code: string               // VD: B (dùng để sinh mã)
  shelves: string[]                     // ['K1','K2','K3']
  rows: string[]                        // ['A','B','C']
  columns: string[]                     // ['1','2','3','4','5']
  capacity_per_slot?: number            // Sức chứa mỗi ô
}

export interface LocationPaginationParams {
  page?: number
  pageSize?: number
  warehouse_id?: string
  search?: string
  shelf?: string
  is_available?: boolean | 'all'
  status?: LocationStatus | 'all'
}

export interface PaginatedLocationResponse {
  data: WarehouseLocation[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface LocationGridSummary {
  warehouse_id: string
  total: number
  empty: number
  partial: number
  full: number
  unavailable: number
  shelves: string[]
}

// ============================================
// HELPERS
// ============================================

/**
 * Tính trạng thái ô từ capacity & current_quantity
 */
function computeLocationStatus(loc: WarehouseLocation): WarehouseLocation {
  let usage_percent = 0
  let status: LocationStatus = 'empty'

  if (!loc.is_available) {
    status = 'unavailable'
  } else if (loc.capacity && loc.capacity > 0) {
    usage_percent = Math.round((loc.current_quantity / loc.capacity) * 100)
    if (usage_percent === 0) status = 'empty'
    else if (usage_percent >= 80) status = 'full'
    else status = 'partial'
  } else if (loc.current_quantity > 0) {
    status = 'partial'
    usage_percent = 50 // Không có capacity → hiển thị 50%
  }

  return { ...loc, usage_percent, status }
}

// ============================================
// SERVICE
// ============================================

export const warehouseLocationService = {
  /**
   * Lấy danh sách vị trí có phân trang
   */
  async getAll(params: LocationPaginationParams = {}): Promise<PaginatedLocationResponse> {
    const page = params.page || 1
    const pageSize = params.pageSize || 50    // Mặc định 50 (grid lớn)
    const { warehouse_id, search, shelf, is_available, status } = params

    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    let query = supabase
      .from('warehouse_locations')
      .select('*', { count: 'exact' })

    // Filter bắt buộc theo kho
    if (warehouse_id) {
      query = query.eq('warehouse_id', warehouse_id)
    }

    // Filter theo kệ
    if (shelf) {
      query = query.eq('shelf', shelf)
    }

    // Filter theo trạng thái available
    if (is_available !== 'all' && is_available !== undefined) {
      query = query.eq('is_available', is_available)
    }

    // Tìm kiếm theo mã vị trí
    if (search) {
      query = query.ilike('code', `%${search}%`)
    }

    const { data, error, count } = await query
      .order('shelf', { ascending: true })
      .order('row_name', { ascending: true })
      .order('column_name', { ascending: true })
      .range(from, to)

    if (error) throw error

    // Compute status cho mỗi location
    let result = (data || []).map(computeLocationStatus)

    // Filter theo status (client-side vì computed)
    if (status && status !== 'all') {
      result = result.filter(loc => loc.status === status)
    }

    return {
      data: result,
      total: count || 0,
      page,
      pageSize,
      totalPages: Math.ceil((count || 0) / pageSize)
    }
  },

  /**
   * Lấy tất cả vị trí trong 1 kho (cho grid view)
   */
  async getByWarehouse(warehouse_id: string): Promise<WarehouseLocation[]> {
    const { data, error } = await supabase
      .from('warehouse_locations')
      .select('*')
      .eq('warehouse_id', warehouse_id)
      .order('shelf', { ascending: true })
      .order('row_name', { ascending: true })
      .order('column_name', { ascending: true })

    if (error) throw error
    return (data || []).map(computeLocationStatus)
  },

  /**
   * Lấy vị trí còn trống trong 1 kho (cho LocationPicker)
   */
  async getAvailable(warehouse_id: string): Promise<WarehouseLocation[]> {
    const { data, error } = await supabase
      .from('warehouse_locations')
      .select('*')
      .eq('warehouse_id', warehouse_id)
      .eq('is_available', true)
      .order('shelf', { ascending: true })
      .order('row_name', { ascending: true })
      .order('column_name', { ascending: true })

    if (error) throw error

    // Chỉ lấy ô chưa đầy (< 80% capacity)
    return (data || [])
      .map(computeLocationStatus)
      .filter(loc => loc.status !== 'full')
  },

  /**
   * Lấy vị trí theo ID
   */
  async getById(id: string): Promise<WarehouseLocation | null> {
    const { data, error } = await supabase
      .from('warehouse_locations')
      .select(`
        *,
        warehouse:warehouses(id, code, name)
      `)
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null
      throw error
    }
    return computeLocationStatus(data)
  },

  /**
   * Tạo vị trí mới
   */
  async create(location: LocationFormData): Promise<WarehouseLocation> {
    const code = location.code.toUpperCase().trim()

    if (!code) throw new Error('Mã vị trí không được để trống')
    if (!location.warehouse_id) throw new Error('Chưa chọn kho')

    // Check code unique trong cùng kho
    const exists = await this.checkCodeExists(location.warehouse_id, code)
    if (exists) {
      throw new Error(`Mã vị trí "${code}" đã tồn tại trong kho này`)
    }

    const { data, error } = await supabase
      .from('warehouse_locations')
      .insert({
        ...location,
        code,
        current_quantity: 0,
        is_available: location.is_available ?? true
      })
      .select()
      .single()

    if (error) throw error
    return computeLocationStatus(data)
  },

  /**
   * Tạo hàng loạt vị trí (VD: 5 kệ × 3 hàng × 5 ô = 75 vị trí)
   */
  async bulkCreate(params: LocationBulkCreateData): Promise<{ created: number; skipped: number }> {
    const { warehouse_id, warehouse_code, shelves, rows, columns, capacity_per_slot } = params

    if (!warehouse_id) throw new Error('Chưa chọn kho')
    if (!shelves.length || !rows.length || !columns.length) {
      throw new Error('Chưa nhập kệ, hàng hoặc ô')
    }

    const locations: LocationFormData[] = []

    for (const shelf of shelves) {
      for (const row of rows) {
        for (const col of columns) {
          const code = `${warehouse_code}-${shelf}-${row}${col}`
          locations.push({
            warehouse_id,
            code: code.toUpperCase(),
            shelf,
            row_name: row,
            column_name: col,
            capacity: capacity_per_slot,
            is_available: true
          })
        }
      }
    }

    // Insert batch, skip duplicates
    let created = 0
    let skipped = 0

    for (const loc of locations) {
      try {
        const exists = await this.checkCodeExists(loc.warehouse_id, loc.code)
        if (exists) {
          skipped++
          continue
        }

        await supabase
          .from('warehouse_locations')
          .insert({ ...loc, current_quantity: 0 })

        created++
      } catch {
        skipped++
      }
    }

    return { created, skipped }
  },

  /**
   * Cập nhật vị trí
   */
  async update(id: string, location: Partial<LocationFormData>): Promise<WarehouseLocation> {
    if (location.code) {
      location.code = location.code.toUpperCase().trim()
    }

    const { data, error } = await supabase
      .from('warehouse_locations')
      .update(location)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return computeLocationStatus(data)
  },

  /**
   * Đổi trạng thái khả dụng
   */
  async updateAvailability(id: string, is_available: boolean): Promise<WarehouseLocation> {
    return this.update(id, { is_available })
  },

  /**
   * Xóa vị trí (chỉ khi đang trống)
   */
  async delete(id: string): Promise<void> {
    // Check if has stock
    const loc = await this.getById(id)
    if (!loc) throw new Error('Không tìm thấy vị trí')

    if (loc.current_quantity > 0) {
      throw new Error(`Không thể xóa vị trí "${loc.code}" vì đang chứa ${loc.current_quantity} kg`)
    }

    // Check if has batches referencing
    const { count } = await supabase
      .from('stock_batches')
      .select('id', { count: 'exact', head: true })
      .eq('location_id', id)
      .eq('status', 'active')

    if (count && count > 0) {
      throw new Error(`Không thể xóa vì có ${count} lô hàng đang ở vị trí này`)
    }

    const { error } = await supabase
      .from('warehouse_locations')
      .delete()
      .eq('id', id)

    if (error) throw error
  },

  /**
   * Kiểm tra mã vị trí tồn tại trong cùng kho
   */
  async checkCodeExists(warehouse_id: string, code: string, excludeId?: string): Promise<boolean> {
    let query = supabase
      .from('warehouse_locations')
      .select('id', { count: 'exact', head: true })
      .eq('warehouse_id', warehouse_id)
      .eq('code', code.toUpperCase())

    if (excludeId) {
      query = query.neq('id', excludeId)
    }

    const { count } = await query
    return (count || 0) > 0
  },

  /**
   * Thống kê grid cho 1 kho (dùng ở WarehouseLocationPage)
   */
  async getGridSummary(warehouse_id: string): Promise<LocationGridSummary> {
    const locations = await this.getByWarehouse(warehouse_id)

    const shelves = [...new Set(locations.map(l => l.shelf).filter(Boolean))] as string[]

    return {
      warehouse_id,
      total: locations.length,
      empty: locations.filter(l => l.status === 'empty').length,
      partial: locations.filter(l => l.status === 'partial').length,
      full: locations.filter(l => l.status === 'full').length,
      unavailable: locations.filter(l => l.status === 'unavailable').length,
      shelves: shelves.sort()
    }
  },

  /**
   * Cập nhật current_quantity (gọi khi nhập/xuất kho)
   * delta > 0 = nhập thêm, delta < 0 = xuất bớt
   */
  async adjustQuantity(id: string, delta: number): Promise<WarehouseLocation> {
    // Get current
    const loc = await this.getById(id)
    if (!loc) throw new Error('Không tìm thấy vị trí')

    const newQty = loc.current_quantity + delta
    if (newQty < 0) {
      throw new Error(`Số lượng không đủ tại ${loc.code} (hiện có: ${loc.current_quantity}, cần xuất: ${Math.abs(delta)})`)
    }

    if (loc.capacity && newQty > loc.capacity) {
      throw new Error(`Vượt sức chứa tại ${loc.code} (capacity: ${loc.capacity}, sau nhập: ${newQty})`)
    }

    const { data, error } = await supabase
      .from('warehouse_locations')
      .update({ current_quantity: newQty })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return computeLocationStatus(data)
  },

  /**
   * Lấy danh sách kệ trong 1 kho (cho filter dropdown)
   */
  async getShelves(warehouse_id: string): Promise<string[]> {
    const { data, error } = await supabase
      .from('warehouse_locations')
      .select('shelf')
      .eq('warehouse_id', warehouse_id)
      .not('shelf', 'is', null)
      .order('shelf', { ascending: true })

    if (error) throw error

    const shelves = [...new Set((data || []).map(d => d.shelf as string))]
    return shelves
  }
}

export default warehouseLocationService