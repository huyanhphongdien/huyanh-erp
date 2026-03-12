// src/services/wms/warehouseService.ts
// Service quản lý Kho hàng (Warehouses)
import { supabase } from '../../lib/supabase'

// ============================================
// INTERFACES
// ============================================

export type WarehouseType = 'raw' | 'finished' | 'mixed'

export interface Warehouse {
  id: string
  code: string
  name: string
  type: WarehouseType
  address?: string
  is_active: boolean
  created_at: string
  updated_at: string
  // Computed
  location_count?: number
  available_locations?: number
}

export interface WarehouseFormData {
  code: string
  name: string
  type: WarehouseType
  address?: string
  is_active?: boolean
}

export interface WarehousePaginationParams {
  page?: number
  pageSize?: number
  search?: string
  type?: WarehouseType | 'all'
  is_active?: boolean | 'all'
}

export interface PaginatedWarehouseResponse {
  data: Warehouse[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

// ============================================
// CONSTANTS
// ============================================

export const WAREHOUSE_TYPE_LABELS: Record<WarehouseType, string> = {
  raw: 'Nguyên vật liệu',
  finished: 'Thành phẩm',
  mixed: 'Hỗn hợp',
}

export const WAREHOUSE_TYPE_COLORS: Record<WarehouseType, string> = {
  raw: 'bg-amber-50 text-amber-700 border-amber-200',
  finished: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  mixed: 'bg-blue-50 text-blue-700 border-blue-200',
}

// ============================================
// SERVICE
// ============================================

export const warehouseService = {
  /**
   * Lấy danh sách kho có phân trang
   */
  async getAll(params: WarehousePaginationParams = {}): Promise<PaginatedWarehouseResponse> {
    const page = params.page || 1
    const pageSize = params.pageSize || 10
    const { search, type, is_active } = params

    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    let query = supabase
      .from('warehouses')
      .select('*', { count: 'exact' })

    // Filter theo loại kho
    if (type && type !== 'all') {
      query = query.eq('type', type)
    }

    // Filter theo trạng thái
    if (is_active !== 'all' && is_active !== undefined) {
      query = query.eq('is_active', is_active)
    }

    // Tìm kiếm theo tên hoặc mã
    if (search) {
      query = query.or(`name.ilike.%${search}%,code.ilike.%${search}%`)
    }

    const { data, error, count } = await query
      .order('code', { ascending: true })
      .range(from, to)

    if (error) throw error

    return {
      data: data || [],
      total: count || 0,
      page,
      pageSize,
      totalPages: Math.ceil((count || 0) / pageSize)
    }
  },

  /**
   * Lấy tất cả kho active (cho dropdown)
   */
  async getAllActive(): Promise<Warehouse[]> {
    const { data, error } = await supabase
      .from('warehouses')
      .select('*')
      .eq('is_active', true)
      .order('code', { ascending: true })

    if (error) throw error
    return data || []
  },

  /**
   * Lấy kho thành phẩm (type = finished hoặc mixed)
   * Dùng cho dropdown nhập/xuất kho TP
   */
  async getFinishedWarehouses(): Promise<Warehouse[]> {
    const { data, error } = await supabase
      .from('warehouses')
      .select('*')
      .eq('is_active', true)
      .in('type', ['finished', 'mixed'])
      .order('code', { ascending: true })

    if (error) throw error
    return data || []
  },

  /**
   * Lấy kho NVL (type = raw hoặc mixed)
   */
  async getRawWarehouses(): Promise<Warehouse[]> {
    const { data, error } = await supabase
      .from('warehouses')
      .select('*')
      .eq('is_active', true)
      .in('type', ['raw', 'mixed'])
      .order('code', { ascending: true })

    if (error) throw error
    return data || []
  },

  /**
   * Lấy kho theo ID
   */
  async getById(id: string): Promise<Warehouse | null> {
    const { data, error } = await supabase
      .from('warehouses')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null
      throw error
    }
    return data
  },

  /**
   * Lấy kho theo ID kèm thống kê vị trí
   */
  async getByIdWithStats(id: string): Promise<(Warehouse & { location_count: number; available_locations: number }) | null> {
    const warehouse = await this.getById(id)
    if (!warehouse) return null

    // Đếm tổng vị trí
    const { count: totalLoc } = await supabase
      .from('warehouse_locations')
      .select('id', { count: 'exact', head: true })
      .eq('warehouse_id', id)

    // Đếm vị trí còn trống
    const { count: availableLoc } = await supabase
      .from('warehouse_locations')
      .select('id', { count: 'exact', head: true })
      .eq('warehouse_id', id)
      .eq('is_available', true)

    return {
      ...warehouse,
      location_count: totalLoc || 0,
      available_locations: availableLoc || 0
    }
  },

  /**
   * Tạo kho mới
   */
  async create(warehouse: WarehouseFormData): Promise<Warehouse> {
    const code = warehouse.code.toUpperCase().trim()

    // Validate
    if (!code) throw new Error('Mã kho không được để trống')
    if (!warehouse.name?.trim()) throw new Error('Tên kho không được để trống')

    // Check code exists
    const exists = await this.checkCodeExists(code)
    if (exists) {
      throw new Error(`Mã kho "${code}" đã tồn tại`)
    }

    const { data, error } = await supabase
      .from('warehouses')
      .insert({
        ...warehouse,
        code,
        is_active: warehouse.is_active ?? true
      })
      .select()
      .single()

    if (error) throw error
    return data
  },

  /**
   * Cập nhật kho
   */
  async update(id: string, warehouse: Partial<WarehouseFormData>): Promise<Warehouse> {
    if (warehouse.code) {
      const code = warehouse.code.toUpperCase().trim()
      const exists = await this.checkCodeExists(code, id)
      if (exists) {
        throw new Error(`Mã kho "${code}" đã tồn tại`)
      }
      warehouse.code = code
    }

    const { data, error } = await supabase
      .from('warehouses')
      .update({
        ...warehouse,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data
  },

  /**
   * Xóa kho (soft delete)
   */
  async delete(id: string): Promise<void> {
    // Check if has locations with stock
    const { count } = await supabase
      .from('warehouse_locations')
      .select('id', { count: 'exact', head: true })
      .eq('warehouse_id', id)
      .gt('current_quantity', 0)

    if (count && count > 0) {
      throw new Error(`Không thể xóa kho này vì có ${count} vị trí đang chứa hàng`)
    }

    const { error } = await supabase
      .from('warehouses')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (error) throw error
  },

  /**
   * Toggle trạng thái
   */
  async toggleActive(id: string): Promise<Warehouse> {
    const current = await this.getById(id)
    if (!current) throw new Error('Không tìm thấy kho')
    return this.update(id, { is_active: !current.is_active })
  },

  /**
   * Kiểm tra mã kho tồn tại
   */
  async checkCodeExists(code: string, excludeId?: string): Promise<boolean> {
    let query = supabase
      .from('warehouses')
      .select('id', { count: 'exact', head: true })
      .eq('code', code.toUpperCase())

    if (excludeId) {
      query = query.neq('id', excludeId)
    }

    const { count } = await query
    return (count || 0) > 0
  },

  /**
   * Lấy tất cả kho kèm thống kê (cho dashboard)
   */
  async getAllWithStats(): Promise<(Warehouse & { location_count: number; available_locations: number })[]> {
    const warehouses = await this.getAllActive()

    const result = await Promise.all(
      warehouses.map(async (wh) => {
        const { count: totalLoc } = await supabase
          .from('warehouse_locations')
          .select('id', { count: 'exact', head: true })
          .eq('warehouse_id', wh.id)

        const { count: availableLoc } = await supabase
          .from('warehouse_locations')
          .select('id', { count: 'exact', head: true })
          .eq('warehouse_id', wh.id)
          .eq('is_available', true)

        return {
          ...wh,
          location_count: totalLoc || 0,
          available_locations: availableLoc || 0
        }
      })
    )

    return result
  }
}

export default warehouseService