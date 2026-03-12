// ============================================================================
// MATERIAL TYPE SERVICE - FIXED
// File: src/services/materialTypeService.ts
// Huy Anh ERP System - Module Quản lý đơn hàng
// ============================================================================
// FIX: Dùng `const` + `export { }` + `export default` để đảm bảo
//      cả `import { materialTypeService }` lẫn `import materialTypeService`
//      đều hoạt động đúng.
// ============================================================================

import { supabase } from '../lib/supabase'

// ============================================
// TYPES
// ============================================

export interface MaterialType {
  id: string
  category_id: string
  code: string
  name: string
  description?: string
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
  category_name?: string
  material_count?: number
}

export interface MaterialTypeFormData {
  category_id: string
  code: string
  name: string
  description?: string
  sort_order?: number
  is_active?: boolean
}

export interface TypePaginationParams {
  page?: number
  pageSize?: number
  search?: string
  category_id?: string
  is_active?: boolean | 'all'
}

export interface PaginatedTypeResponse {
  data: MaterialType[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

// ============================================
// SERVICE
// ============================================

const materialTypeService = {

  async getAll(params: TypePaginationParams = {}): Promise<PaginatedTypeResponse> {
    const page = params.page || 1
    const pageSize = params.pageSize || 10
    const { search, category_id, is_active } = params

    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    let query = supabase
      .from('material_types')
      .select(`
        *,
        material_categories ( name )
      `, { count: 'exact' })

    if (category_id) query = query.eq('category_id', category_id)
    if (is_active !== 'all' && is_active !== undefined) query = query.eq('is_active', is_active)
    if (search) query = query.or(`name.ilike.%${search}%,code.ilike.%${search}%`)

    const { data, error, count } = await query
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })
      .range(from, to)

    if (error) {
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        console.warn('⚠️ Bảng material_types chưa tồn tại')
        return { data: [], total: 0, page, pageSize, totalPages: 0 }
      }
      throw error
    }

    const transformedData = (data || []).map((item: any) => ({
      ...item,
      category_name: item.material_categories?.name || '',
      material_categories: undefined,
    }))

    return {
      data: transformedData,
      total: count || 0,
      page,
      pageSize,
      totalPages: Math.ceil((count || 0) / pageSize),
    }
  },

  async getAllActive(categoryId?: string): Promise<MaterialType[]> {
    let query = supabase
      .from('material_types')
      .select(`*, material_categories ( name )`)
      .eq('is_active', true)

    if (categoryId) query = query.eq('category_id', categoryId)

    const { data, error } = await query
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })

    if (error) {
      if (error.code === '42P01' || error.message?.includes('does not exist')) return []
      throw error
    }

    return (data || []).map((item: any) => ({
      ...item,
      category_name: item.material_categories?.name || '',
      material_categories: undefined,
    }))
  },

  async getById(id: string): Promise<MaterialType | null> {
    const { data, error } = await supabase
      .from('material_types')
      .select(`*, material_categories ( name )`)
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null
      throw error
    }

    return {
      ...data,
      category_name: (data as any).material_categories?.name || '',
      material_categories: undefined,
    } as MaterialType
  },

  async create(type: MaterialTypeFormData): Promise<MaterialType> {
    const code = type.code.toUpperCase().trim()

    const exists = await materialTypeService.checkCodeExists(type.category_id, code)
    if (exists) throw new Error(`Mã loại "${code}" đã tồn tại trong nhóm này`)

    const { data, error } = await supabase
      .from('material_types')
      .insert({
        category_id: type.category_id,
        code,
        name: type.name.trim(),
        description: type.description || null,
        sort_order: type.sort_order || 0,
        is_active: type.is_active ?? true,
      })
      .select()
      .single()

    if (error) throw error
    return data
  },

  async update(id: string, type: Partial<MaterialTypeFormData>): Promise<MaterialType> {
    const updateData: Record<string, any> = { updated_at: new Date().toISOString() }

    if (type.category_id !== undefined) updateData.category_id = type.category_id
    if (type.code !== undefined) updateData.code = type.code.toUpperCase().trim()
    if (type.name !== undefined) updateData.name = type.name.trim()
    if (type.description !== undefined) updateData.description = type.description
    if (type.sort_order !== undefined) updateData.sort_order = type.sort_order
    if (type.is_active !== undefined) updateData.is_active = type.is_active

    const { data, error } = await supabase
      .from('material_types')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('material_types')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (error) throw error
  },

  async toggleActive(id: string, is_active: boolean): Promise<MaterialType> {
    const { data, error } = await supabase
      .from('material_types')
      .update({ is_active, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data
  },

  async checkCodeExists(categoryId: string, code: string, excludeId?: string): Promise<boolean> {
    let query = supabase
      .from('material_types')
      .select('id', { count: 'exact', head: true })
      .eq('category_id', categoryId)
      .eq('code', code.toUpperCase().trim())

    if (excludeId) query = query.neq('id', excludeId)

    const { count, error } = await query
    if (error) return false
    return (count || 0) > 0
  },

  async countMaterials(typeId: string): Promise<number> {
    const { count, error } = await supabase
      .from('materials')
      .select('id', { count: 'exact', head: true })
      .eq('type_id', typeId)

    if (error) return 0
    return count || 0
  },
}

// ✅ Export cả 2 kiểu để hỗ trợ mọi cách import
export { materialTypeService }
export default materialTypeService