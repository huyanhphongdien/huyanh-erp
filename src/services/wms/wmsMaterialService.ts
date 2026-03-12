// ============================================================================
// FILE: src/services/wms/wmsMaterialService.ts
// MODULE: Kho Thành Phẩm (WMS) — Huy Anh Rubber ERP
// PHASE: P2 — Bước 2.4
// ============================================================================
//
// ⚠️  ĐÂY LÀ WMS WRAPPER — KHÔNG PHẢI SERVICE GỐC
//
//     Service gốc (CRUD đầy đủ):  src/services/materialService.ts  (Purchasing)
//     File này (WMS wrapper):     src/services/wms/wmsMaterialService.ts
//
//     Cả hai cùng query CHUNG bảng `materials`.
//     WMS wrapper chỉ thêm filter material_type và hàm đặc thù kho.
//
//     Cột WMS (thêm qua ALTER TABLE):
//       material_type, sku, weight_per_unit, shelf_life_days, max_stock
//
//     Khi cần tạo/sửa/xóa vật tư → dùng materialService gốc.
//     Khi cần query kho, filter thành phẩm, cập nhật SKU → dùng file này.
//
// ============================================================================

import { supabase } from '../../lib/supabase'

// ============================================================================
// TYPES
// ============================================================================

/** Material nhìn từ góc WMS */
export interface WMSMaterial {
  id: string
  code: string                          // mã nội bộ auto-gen (purchasing)
  sku?: string                          // mã SKU thương mại (WMS) VD: TP-SVR3L
  name: string
  short_name?: string
  material_type: 'raw' | 'finished'     // phân loại WMS
  category_id?: string
  type_id?: string
  unit_id?: string
  unit_name?: string
  description?: string
  specifications?: string
  brand?: string
  origin?: string
  weight_per_unit?: number              // WMS: kg/bành, kg/thùng
  shelf_life_days?: number              // WMS: hạn sử dụng (ngày)
  min_stock: number
  max_stock?: number                    // WMS: tồn tối đa
  current_stock: number
  reference_price?: number
  image_url?: string
  status: 'active' | 'inactive'
  created_at: string
  updated_at: string
  // Joins
  category?: { id: string; code: string; name: string; icon?: string; color?: string }
  type?: { id: string; code: string; name: string }
  unit?: { id: string; code: string; name: string; symbol?: string }
}

/** Form data — chỉ các cột WMS */
export interface WMSMaterialFormData {
  sku?: string
  material_type?: 'raw' | 'finished'
  weight_per_unit?: number | null
  shelf_life_days?: number | null
  max_stock?: number | null
}

export interface WMSMaterialPaginationParams {
  page: number
  pageSize: number
  search?: string
  material_type?: 'raw' | 'finished'
  category_id?: string
  type_id?: string
  status?: 'active' | 'inactive' | 'all'
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

// ============================================================================
// CONSTANTS
// ============================================================================

const WMS_SELECT = `
  *,
  category:material_categories(id, code, name, icon, color),
  type:material_types(id, code, name),
  unit:units(id, code, name, symbol)
`

// ============================================================================
// WMS MATERIAL SERVICE (wrapper)
// ============================================================================

export const wmsMaterialService = {

  // --------------------------------------------------------------------------
  // GET ALL — phân trang + filter WMS
  // --------------------------------------------------------------------------
  async getAll(params: WMSMaterialPaginationParams): Promise<PaginatedResponse<WMSMaterial>> {
    const {
      page = 1,
      pageSize = 20,
      search,
      material_type,
      category_id,
      type_id,
      status,
    } = params

    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    let query = supabase
      .from('materials')
      .select(WMS_SELECT, { count: 'exact' })
      .is('deleted_at', null)

    if (material_type) {
      query = query.eq('material_type', material_type)
    }

    if (category_id) {
      query = query.eq('category_id', category_id)
    }

    if (type_id) {
      query = query.eq('type_id', type_id)
    }

    if (status && status !== 'all') {
      query = query.eq('status', status)
    }

    if (search && search.trim()) {
      const term = `%${search.trim()}%`
      query = query.or(`name.ilike.${term},code.ilike.${term},sku.ilike.${term}`)
    }

    query = query
      .order('code', { ascending: true })
      .range(from, to)

    const { data, count, error } = await query
    if (error) throw error

    const total = count ?? 0

    return {
      data: (data as WMSMaterial[]) || [],
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    }
  },

  // --------------------------------------------------------------------------
  // GET FINISHED GOODS — thành phẩm active (dùng nhiều nhất trong WMS)
  // --------------------------------------------------------------------------
  async getFinishedGoods(): Promise<WMSMaterial[]> {
    const { data, error } = await supabase
      .from('materials')
      .select(WMS_SELECT)
      .eq('material_type', 'finished')
      .eq('status', 'active')
      .is('deleted_at', null)
      .order('code', { ascending: true })

    if (error) throw error
    return (data as WMSMaterial[]) || []
  },

  // --------------------------------------------------------------------------
  // GET RAW MATERIALS — NVL active
  // --------------------------------------------------------------------------
  async getRawMaterials(): Promise<WMSMaterial[]> {
    const { data, error } = await supabase
      .from('materials')
      .select(WMS_SELECT)
      .eq('material_type', 'raw')
      .eq('status', 'active')
      .is('deleted_at', null)
      .order('code', { ascending: true })

    if (error) throw error
    return (data as WMSMaterial[]) || []
  },

  // --------------------------------------------------------------------------
  // GET ALL ACTIVE — cho dropdown (filter material_type nếu cần)
  // --------------------------------------------------------------------------
  async getAllActive(material_type?: 'raw' | 'finished'): Promise<WMSMaterial[]> {
    let query = supabase
      .from('materials')
      .select(WMS_SELECT)
      .eq('status', 'active')
      .is('deleted_at', null)
      .order('name', { ascending: true })

    if (material_type) {
      query = query.eq('material_type', material_type)
    }

    const { data, error } = await query
    if (error) throw error
    return (data as WMSMaterial[]) || []
  },

  // --------------------------------------------------------------------------
  // GET BY CATEGORY
  // --------------------------------------------------------------------------
  async getByCategory(category_id: string): Promise<WMSMaterial[]> {
    const { data, error } = await supabase
      .from('materials')
      .select(WMS_SELECT)
      .eq('category_id', category_id)
      .eq('status', 'active')
      .is('deleted_at', null)
      .order('code', { ascending: true })

    if (error) throw error
    return (data as WMSMaterial[]) || []
  },

  // --------------------------------------------------------------------------
  // GET BY ID
  // --------------------------------------------------------------------------
  async getById(id: string): Promise<WMSMaterial> {
    const { data, error } = await supabase
      .from('materials')
      .select(WMS_SELECT)
      .eq('id', id)
      .single()

    if (error) throw error
    return data as WMSMaterial
  },

  // --------------------------------------------------------------------------
  // GET BY SKU
  // --------------------------------------------------------------------------
  async getBySku(sku: string): Promise<WMSMaterial | null> {
    const { data, error } = await supabase
      .from('materials')
      .select(WMS_SELECT)
      .eq('sku', sku)
      .is('deleted_at', null)
      .maybeSingle()

    if (error) throw error
    return data as WMSMaterial | null
  },

  // --------------------------------------------------------------------------
  // GET BY CODE — tìm theo mã nội bộ purchasing
  // --------------------------------------------------------------------------
  async getByCode(code: string): Promise<WMSMaterial | null> {
    const { data, error } = await supabase
      .from('materials')
      .select(WMS_SELECT)
      .eq('code', code)
      .is('deleted_at', null)
      .maybeSingle()

    if (error) throw error
    return data as WMSMaterial | null
  },

  // --------------------------------------------------------------------------
  // CHECK SKU EXISTS
  // --------------------------------------------------------------------------
  async isSkuExists(sku: string, excludeId?: string): Promise<boolean> {
    let query = supabase
      .from('materials')
      .select('id')
      .eq('sku', sku)
      .is('deleted_at', null)

    if (excludeId) {
      query = query.neq('id', excludeId)
    }

    const { data, error } = await query
    if (error) throw error
    return (data?.length ?? 0) > 0
  },

  // --------------------------------------------------------------------------
  // UPDATE WMS FIELDS — chỉ cập nhật cột WMS, không đụng purchasing fields
  // Purchasing fields (name, category, price...) → dùng materialService gốc
  // --------------------------------------------------------------------------
  async updateWMSFields(id: string, fields: WMSMaterialFormData): Promise<WMSMaterial> {
    if (fields.sku) {
      const exists = await wmsMaterialService.isSkuExists(fields.sku, id)
      if (exists) {
        throw new Error(`Mã SKU "${fields.sku}" đã tồn tại`)
      }
    }

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    if (fields.sku !== undefined) updateData.sku = fields.sku?.trim().toUpperCase() || null
    if (fields.material_type !== undefined) updateData.material_type = fields.material_type
    if (fields.weight_per_unit !== undefined) updateData.weight_per_unit = fields.weight_per_unit
    if (fields.shelf_life_days !== undefined) updateData.shelf_life_days = fields.shelf_life_days
    if (fields.max_stock !== undefined) updateData.max_stock = fields.max_stock

    const { data, error } = await supabase
      .from('materials')
      .update(updateData)
      .eq('id', id)
      .select(WMS_SELECT)
      .single()

    if (error) throw error
    return data as WMSMaterial
  },

  // --------------------------------------------------------------------------
  // GET LOW STOCK — thành phẩm tồn dưới min_stock (cảnh báo P5)
  // --------------------------------------------------------------------------
  async getLowStockFinished(): Promise<WMSMaterial[]> {
    const { data, error } = await supabase
      .from('materials')
      .select(WMS_SELECT)
      .eq('material_type', 'finished')
      .eq('status', 'active')
      .is('deleted_at', null)
      .gt('min_stock', 0)

    if (error) throw error

    return ((data as WMSMaterial[]) || [])
      .filter(m => m.current_stock < m.min_stock)
      .sort((a, b) => {
        const ratioA = a.min_stock > 0 ? a.current_stock / a.min_stock : 1
        const ratioB = b.min_stock > 0 ? b.current_stock / b.min_stock : 1
        return ratioA - ratioB
      })
  },

  // --------------------------------------------------------------------------
  // GET OVER STOCK — thành phẩm tồn vượt max_stock (cảnh báo P5)
  // --------------------------------------------------------------------------
  async getOverStockFinished(): Promise<WMSMaterial[]> {
    const { data, error } = await supabase
      .from('materials')
      .select(WMS_SELECT)
      .eq('material_type', 'finished')
      .eq('status', 'active')
      .is('deleted_at', null)
      .not('max_stock', 'is', null)
      .gt('max_stock', 0)

    if (error) throw error

    return ((data as WMSMaterial[]) || [])
      .filter(m => m.max_stock && m.current_stock > m.max_stock)
  },

  // --------------------------------------------------------------------------
  // GET STATS — thống kê WMS dashboard
  // --------------------------------------------------------------------------
  async getStats(): Promise<{
    totalFinished: number
    totalRaw: number
    lowStockCount: number
    overStockCount: number
    categoryCounts: Array<{ category_name: string; count: number }>
  }> {
    const { data: allActive, error } = await supabase
      .from('materials')
      .select(`
        id, material_type, current_stock, min_stock, max_stock,
        category:material_categories(name)
      `)
      .eq('status', 'active')
      .is('deleted_at', null)

    if (error) throw error

    const items = allActive || []
    const finished = items.filter(m => m.material_type === 'finished')
    const raw = items.filter(m => m.material_type === 'raw')

    const lowStockCount = finished.filter(
      m => m.min_stock > 0 && m.current_stock < m.min_stock
    ).length

    const overStockCount = finished.filter(
      m => m.max_stock && m.max_stock > 0 && m.current_stock > m.max_stock
    ).length

    const categoryMap = new Map<string, number>()
    for (const m of finished) {
      const catName = (m.category as any)?.name || 'Chưa phân loại'
      categoryMap.set(catName, (categoryMap.get(catName) || 0) + 1)
    }

    const categoryCounts = Array.from(categoryMap.entries())
      .map(([category_name, count]) => ({ category_name, count }))
      .sort((a, b) => b.count - a.count)

    return {
      totalFinished: finished.length,
      totalRaw: raw.length,
      lowStockCount,
      overStockCount,
      categoryCounts,
    }
  },
}

export default wmsMaterialService