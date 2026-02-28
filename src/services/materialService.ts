// ============================================================================
// MATERIAL SERVICE (FIX 2026-02-26)
// File: src/services/materialService.ts
// Huy Anh ERP System - Module Quản lý đơn hàng
// ============================================================================
// FIX:
// 1. generateMaterialCode: material_categories có thể không có cột 'code'
//    → fallback dùng 'name' để tạo prefix
// 2. material_types có thể không tồn tại → try/catch an toàn
// 3. Giữ nguyên toàn bộ logic CRUD, chỉ fix phần code generation
// ============================================================================

import { supabase } from '../lib/supabase'

// ============================================================================
// HELPER: Check deleted_at column existence (cached)
// Cột deleted_at có thể chưa tồn tại → chỉ dùng cho soft-delete trong delete()
// Tất cả query khác đã bỏ filter deleted_at → dùng status='active' thay thế
// ============================================================================

let _hasDeletedAt: boolean | null = null

;(async () => {
  try {
    const { error } = await supabase.from('materials').select('deleted_at').limit(1)
    _hasDeletedAt = !error
  } catch {
    _hasDeletedAt = false
  }
})()

// ============================================================================
// INTERFACES - Khớp với database schema
// ============================================================================

export interface Material {
  id: string
  code: string
  name: string
  short_name?: string
  category_id?: string
  type_id?: string
  unit_id?: string
  unit_name?: string
  description?: string
  specifications?: string
  brand?: string
  origin?: string
  reference_price?: number
  min_price?: number
  max_price?: number
  last_purchase_price?: number
  last_purchase_date?: string
  min_stock: number
  current_stock: number
  preferred_supplier_id?: string
  image_url?: string
  notes?: string
  order_count?: number
  status: 'active' | 'inactive'
  created_by?: string
  created_at: string
  updated_at: string
  deleted_at?: string
  // Relations
  category?: {
    id: string
    code?: string
    name: string
    icon?: string
    color?: string
  }
  type?: {
    id: string
    code: string
    name: string
  }
  unit?: {
    id: string
    code: string
    name: string
    symbol?: string
  }
  preferred_supplier?: {
    id: string
    code: string
    name: string
  }
  created_by_employee?: {
    id: string
    full_name: string
  }
  has_variants?: boolean
}

export interface MaterialFormData {
  name: string
  short_name?: string
  category_id?: string
  type_id?: string
  unit_id?: string
  unit_name?: string
  description?: string
  specifications?: string
  brand?: string
  origin?: string
  reference_price?: number
  min_price?: number
  max_price?: number
  last_purchase_price?: number
  last_purchase_date?: string
  min_stock?: number
  current_stock?: number
  preferred_supplier_id?: string
  image_url?: string
  notes?: string
  status?: 'active' | 'inactive'
}

export interface MaterialPaginationParams {
  page: number
  pageSize: number
  search?: string
  categoryId?: string
  typeId?: string
  supplierId?: string
  status?: 'active' | 'inactive' | 'all'
  lowStock?: boolean
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface MaterialSupplier {
  id: string
  material_id: string
  supplier_id: string
  supplier_code?: string
  unit_price?: number
  min_order_qty?: number
  lead_time_days?: number
  is_preferred: boolean
  price_valid_from?: string
  price_valid_to?: string
  notes?: string
  created_at: string
  updated_at: string
  supplier?: {
    id: string
    code: string
    name: string
    phone?: string
    email?: string
  }
}

export interface MaterialSupplierFormData {
  material_id: string
  supplier_id: string
  supplier_code?: string
  unit_price?: number
  min_order_qty?: number
  lead_time_days?: number
  is_preferred?: boolean
  price_valid_from?: string
  price_valid_to?: string
  notes?: string
}

// ============================================================================
// ★ FIX: Generate Material Code — an toàn với DB schema thực tế
// ============================================================================

/**
 * Tạo prefix từ tên nhóm (fallback khi không có cột 'code')
 * VD: "Nhóm Thép CB240" → "RST5" hoặc tương tự
 */
function generatePrefixFromName(name: string): string {
  // Bỏ dấu tiếng Việt
  const normalized = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')

  // Lấy chữ cái đầu mỗi từ, tối đa 4 ký tự
  const words = normalized.split(/\s+/).filter(Boolean)
  let prefix = words.map(w => w[0]).join('').toUpperCase()

  // Đảm bảo ít nhất 2 ký tự
  if (prefix.length < 2) {
    prefix = normalized.replace(/[^A-Za-z0-9]/g, '').substring(0, 4).toUpperCase()
  }

  return prefix.substring(0, 5) || 'VT'
}

export const generateMaterialCode = async (
  categoryId: string,
  typeId?: string
): Promise<string> => {
  // 1. Lấy thông tin category — thử cả code lẫn name
  let prefix = 'VT'

  try {
    // Thử select code trước
    const { data: catWithCode, error: codeErr } = await supabase
      .from('material_categories')
      .select('code, name')
      .eq('id', categoryId)
      .single()

    if (codeErr) {
      // Nếu lỗi (có thể không có cột code), thử chỉ select name
      const { data: catNameOnly, error: nameErr } = await supabase
        .from('material_categories')
        .select('name')
        .eq('id', categoryId)
        .single()

      if (nameErr || !catNameOnly) {
        throw new Error('Không tìm thấy nhóm vật tư')
      }

      prefix = generatePrefixFromName(catNameOnly.name)
    } else if (catWithCode) {
      // Ưu tiên dùng code nếu có
      prefix = catWithCode.code || generatePrefixFromName(catWithCode.name)
    }
  } catch (err: any) {
    if (err.message === 'Không tìm thấy nhóm vật tư') throw err

    // Fallback cuối cùng: lấy name
    try {
      const { data } = await supabase
        .from('material_categories')
        .select('name')
        .eq('id', categoryId)
        .single()

      if (data) prefix = generatePrefixFromName(data.name)
    } catch {
      // Giữ prefix = 'VT'
    }
  }

  // 2. Thêm type code nếu có
  if (typeId) {
    try {
      const { data: type } = await supabase
        .from('material_types')
        .select('code')
        .eq('id', typeId)
        .single()

      if (type?.code) {
        prefix = `${prefix}-${type.code}`
      }
    } catch {
      // Bảng material_types chưa tồn tại → bỏ qua
    }
  }

  // 3. Đếm số material hiện có với prefix này
  try {
    const { count, error: countError } = await supabase
      .from('materials')
      .select('*', { count: 'exact', head: true })
      .ilike('code', `${prefix}-%`)

    if (countError) throw countError

    const nextNumber = ((count || 0) + 1).toString().padStart(4, '0')
    return `${prefix}-${nextNumber}`
  } catch {
    // Fallback: dùng timestamp
    const ts = Date.now().toString().slice(-6)
    return `${prefix}-${ts}`
  }
}

export const previewMaterialCode = async (
  categoryId: string,
  typeId?: string
): Promise<string> => {
  return generateMaterialCode(categoryId, typeId)
}

// ============================================================================
// MATERIAL SERVICE
// ============================================================================

export const materialService = {
  // ==========================================
  // QUERIES
  // ==========================================

  async getAll(params: MaterialPaginationParams): Promise<PaginatedResponse<Material>> {
    const {
      page = 1,
      pageSize = 10,
      search,
      categoryId,
      typeId,
      supplierId,
      status,
      lowStock,
    } = params
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    let query = supabase
      .from('materials')
      .select(
        `
        *,
        category:material_categories(id, code, name, icon, color),
        type:material_types(id, code, name),
        unit:units(id, code, name, symbol),
        preferred_supplier:suppliers!materials_preferred_supplier_id_fkey(id, code, name),
        created_by_employee:employees!materials_created_by_fkey(id, full_name)
      `,
        { count: 'exact' }
      )
      

    if (categoryId) query = query.eq('category_id', categoryId)
    if (typeId) query = query.eq('type_id', typeId)
    if (supplierId) query = query.eq('preferred_supplier_id', supplierId)
    if (status && status !== 'all') query = query.eq('status', status)
    if (search) query = query.or(`code.ilike.%${search}%,name.ilike.%${search}%`)

    const { data, error, count } = await query
      .order('code', { ascending: true })
      .range(from, to)

    if (error) throw error

    let filteredData = data || []
    if (lowStock) {
      filteredData = filteredData.filter((m) => m.current_stock < m.min_stock)
    }

    return {
      data: filteredData,
      total: count || 0,
      page,
      pageSize,
      totalPages: Math.ceil((count || 0) / pageSize),
    }
  },

  async getAllActive(): Promise<Material[]> {
    const { data, error } = await supabase
      .from('materials')
      .select(
        `
        *,
        category:material_categories(id, code, name),
        type:material_types(id, code, name),
        unit:units(id, code, name, symbol)
      `
      )
      .eq('status', 'active')
      
      .order('name', { ascending: true })

    if (error) throw error
    return data || []
  },

  async getByCategory(categoryId: string): Promise<Material[]> {
    const { data, error } = await supabase
      .from('materials')
      .select(
        `
        *,
        type:material_types(id, code, name),
        unit:units(id, code, name, symbol)
      `
      )
      .eq('category_id', categoryId)
      .eq('status', 'active')
      
      .order('name', { ascending: true })

    if (error) throw error
    return data || []
  },

  async getByType(typeId: string): Promise<Material[]> {
    const { data, error } = await supabase
      .from('materials')
      .select(
        `
        *,
        category:material_categories(id, code, name),
        unit:units(id, code, name, symbol)
      `
      )
      .eq('type_id', typeId)
      .eq('status', 'active')
      
      .order('name', { ascending: true })

    if (error) throw error
    return data || []
  },

  async getById(id: string): Promise<Material> {
    const { data, error } = await supabase
      .from('materials')
      .select(
        `
        *,
        category:material_categories(id, code, name, icon, color),
        type:material_types(id, code, name),
        unit:units(id, code, name, symbol),
        preferred_supplier:suppliers!materials_preferred_supplier_id_fkey(id, code, name, phone, email),
        created_by_employee:employees!materials_created_by_fkey(id, full_name)
      `
      )
      .eq('id', id)
      .single()

    if (error) throw error
    return data
  },

  async getByCode(code: string): Promise<Material | null> {
    const { data, error } = await supabase
      .from('materials')
      .select(
        `
        *,
        category:material_categories(id, code, name),
        type:material_types(id, code, name),
        unit:units(id, code, name, symbol)
      `
      )
      .eq('code', code)
      
      .single()

    if (error && error.code !== 'PGRST116') throw error
    return data
  },

  async checkCodeExists(code: string, excludeId?: string): Promise<boolean> {
    let query = supabase
      .from('materials')
      .select('id')
      .eq('code', code)
      

    if (excludeId) query = query.neq('id', excludeId)

    const { data, error } = await query.single()
    if (error && error.code === 'PGRST116') return false
    if (error) throw error
    return !!data
  },

  async getLowStock(): Promise<Material[]> {
    const { data, error } = await supabase
      .from('materials')
      .select(
        `
        *,
        category:material_categories(id, code, name, icon, color),
        type:material_types(id, code, name),
        unit:units(id, code, name, symbol),
        preferred_supplier:suppliers!materials_preferred_supplier_id_fkey(id, code, name)
      `
      )
      .eq('status', 'active')
      
      .order('current_stock', { ascending: true })

    if (error) throw error
    return (data || []).filter((m) => m.current_stock < m.min_stock)
  },

  // ==========================================
  // MUTATIONS
  // ==========================================

  async create(formData: MaterialFormData, userId?: string): Promise<Material> {
    if (!formData.category_id) {
      throw new Error('Vui lòng chọn nhóm vật tư')
    }

    const code = await generateMaterialCode(formData.category_id, formData.type_id)

    const exists = await this.checkCodeExists(code)
    if (exists) {
      throw new Error(`Mã vật tư "${code}" đã tồn tại`)
    }

    const { data, error } = await supabase
      .from('materials')
      .insert({
        code,
        name: formData.name.trim(),
        short_name: formData.short_name?.trim() || null,
        category_id: formData.category_id,
        type_id: formData.type_id || null,
        unit_id: formData.unit_id || null,
        unit_name: formData.unit_name?.trim() || null,
        description: formData.description?.trim() || null,
        specifications: formData.specifications?.trim() || null,
        brand: formData.brand?.trim() || null,
        origin: formData.origin?.trim() || null,
        reference_price: formData.reference_price || null,
        min_price: formData.min_price || null,
        max_price: formData.max_price || null,
        last_purchase_price: formData.last_purchase_price || null,
        last_purchase_date: formData.last_purchase_date || null,
        min_stock: formData.min_stock ?? 0,
        current_stock: formData.current_stock ?? 0,
        preferred_supplier_id: formData.preferred_supplier_id || null,
        image_url: formData.image_url || null,
        notes: formData.notes?.trim() || null,
        status: formData.status ?? 'active',
        created_by: userId || null,
      })
      .select(
        `
        *,
        category:material_categories(id, code, name, icon, color),
        type:material_types(id, code, name),
        unit:units(id, code, name, symbol)
      `
      )
      .single()

    if (error) throw error
    return data
  },

  async update(id: string, formData: Partial<MaterialFormData>): Promise<Material> {
    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    }

    if (formData.name !== undefined) updateData.name = formData.name.trim()
    if (formData.short_name !== undefined) updateData.short_name = formData.short_name?.trim() || null
    if (formData.category_id !== undefined) updateData.category_id = formData.category_id || null
    if (formData.type_id !== undefined) updateData.type_id = formData.type_id || null
    if (formData.unit_id !== undefined) updateData.unit_id = formData.unit_id || null
    if (formData.unit_name !== undefined) updateData.unit_name = formData.unit_name?.trim() || null
    if (formData.description !== undefined) updateData.description = formData.description?.trim() || null
    if (formData.specifications !== undefined) updateData.specifications = formData.specifications?.trim() || null
    if (formData.brand !== undefined) updateData.brand = formData.brand?.trim() || null
    if (formData.origin !== undefined) updateData.origin = formData.origin?.trim() || null
    if (formData.reference_price !== undefined) updateData.reference_price = formData.reference_price || null
    if (formData.min_price !== undefined) updateData.min_price = formData.min_price || null
    if (formData.max_price !== undefined) updateData.max_price = formData.max_price || null
    if (formData.last_purchase_price !== undefined) updateData.last_purchase_price = formData.last_purchase_price || null
    if (formData.last_purchase_date !== undefined) updateData.last_purchase_date = formData.last_purchase_date || null
    if (formData.min_stock !== undefined) updateData.min_stock = formData.min_stock
    if (formData.current_stock !== undefined) updateData.current_stock = formData.current_stock
    if (formData.preferred_supplier_id !== undefined) updateData.preferred_supplier_id = formData.preferred_supplier_id || null
    if (formData.image_url !== undefined) updateData.image_url = formData.image_url || null
    if (formData.notes !== undefined) updateData.notes = formData.notes?.trim() || null
    if (formData.status !== undefined) updateData.status = formData.status

    const { data, error } = await supabase
      .from('materials')
      .update(updateData)
      .eq('id', id)
      .select(
        `
        *,
        category:material_categories(id, code, name, icon, color),
        type:material_types(id, code, name),
        unit:units(id, code, name, symbol),
        preferred_supplier:suppliers!materials_preferred_supplier_id_fkey(id, code, name)
      `
      )
      .single()

    if (error) throw error
    return data
  },

  async deactivate(id: string): Promise<void> {
    const { error } = await supabase
      .from('materials')
      .update({ status: 'inactive', updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error
  },

  async activate(id: string): Promise<void> {
    const { error } = await supabase
      .from('materials')
      .update({ status: 'active', updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error
  },

  async delete(id: string): Promise<void> {
    // Try soft delete first (if deleted_at column exists)
    if (_hasDeletedAt !== false) {
      const { error } = await supabase
        .from('materials')
        .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', id)
      if (!error) return
      // If column doesn't exist, fall through to status update
      _hasDeletedAt = false
    }
    // Fallback: set status inactive
    const { error } = await supabase
      .from('materials')
      .update({ status: 'inactive', updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error
  },

  async updateStock(id: string, quantity: number, operation: 'add' | 'subtract' | 'set'): Promise<void> {
    const { data: material, error: getError } = await supabase
      .from('materials')
      .select('current_stock')
      .eq('id', id)
      .single()
    if (getError) throw getError

    let newStock = material.current_stock || 0
    switch (operation) {
      case 'add': newStock += quantity; break
      case 'subtract': newStock = Math.max(0, newStock - quantity); break
      case 'set': newStock = quantity; break
    }

    const { error } = await supabase
      .from('materials')
      .update({ current_stock: newStock, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error
  },

  async updateLastPrice(id: string, price: number): Promise<void> {
    const { error } = await supabase
      .from('materials')
      .update({
        last_purchase_price: price,
        last_purchase_date: new Date().toISOString().split('T')[0],
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
    if (error) throw error
  },

  // ==========================================
  // MATERIAL SUPPLIERS
  // ==========================================

  async getSuppliers(materialId: string): Promise<MaterialSupplier[]> {
    const { data, error } = await supabase
      .from('material_suppliers')
      .select(`*, supplier:suppliers(id, code, name, phone, email)`)
      .eq('material_id', materialId)
      .order('is_preferred', { ascending: false })
      .order('unit_price', { ascending: true })
    if (error) throw error
    return data || []
  },

  async addSupplier(formData: MaterialSupplierFormData): Promise<MaterialSupplier> {
    const { data, error } = await supabase
      .from('material_suppliers')
      .insert(formData)
      .select(`*, supplier:suppliers(id, code, name, phone, email)`)
      .single()
    if (error) {
      if (error.code === '23505') throw new Error('Nhà cung cấp này đã được thêm cho vật tư')
      throw error
    }
    return data
  },

  async updateSupplier(id: string, formData: Partial<MaterialSupplierFormData>): Promise<MaterialSupplier> {
    const { data, error } = await supabase
      .from('material_suppliers')
      .update({ ...formData, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select(`*, supplier:suppliers(id, code, name, phone, email)`)
      .single()
    if (error) throw error
    return data
  },

  async removeSupplier(id: string): Promise<void> {
    const { error } = await supabase.from('material_suppliers').delete().eq('id', id)
    if (error) throw error
  },

  async setPreferredSupplier(materialId: string, supplierId: string): Promise<void> {
    const { error } = await supabase
      .from('material_suppliers')
      .update({ is_preferred: true })
      .eq('material_id', materialId)
      .eq('supplier_id', supplierId)
    if (error) throw error
  },

  // ==========================================
  // STATISTICS
  // ==========================================

  async getStats(): Promise<{
    total: number
    active: number
    inactive: number
    lowStock: number
    byCategory: { category: string; count: number }[]
  }> {
    const { count: total } = await supabase
      .from('materials')
      .select('*', { count: 'exact', head: true })
      

    const { count: active } = await supabase
      .from('materials')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active')
      

    const { count: inactive } = await supabase
      .from('materials')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'inactive')
      

    const { data: allMaterials } = await supabase
      .from('materials')
      .select('current_stock, min_stock')
      .eq('status', 'active')
      

    const lowStock = (allMaterials || []).filter((m) => m.current_stock < m.min_stock).length

    const { data: categoryData } = await supabase
      .from('materials')
      .select(`category:material_categories(name)`)
      .eq('status', 'active')
      

    const categoryCount: Record<string, number> = {}
    categoryData?.forEach((item) => {
      const catName = (item.category as any)?.name || 'Không phân loại'
      categoryCount[catName] = (categoryCount[catName] || 0) + 1
    })

    return {
      total: total || 0,
      active: active || 0,
      inactive: inactive || 0,
      lowStock,
      byCategory: Object.entries(categoryCount).map(([category, count]) => ({ category, count })),
    }
  },

  generateMaterialCode,
  previewMaterialCode,
}

export default materialService