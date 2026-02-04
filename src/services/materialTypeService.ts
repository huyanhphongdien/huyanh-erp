// src/services/materialTypeService.ts
// Service quản lý Loại vật tư (Material Types)
import { supabase } from '../lib/supabase'

// ============================================
// INTERFACES
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
  // Joined fields
  category_name?: string
  category_code?: string
  category_color?: string
  // Computed fields
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

export const materialTypeService = {
  /**
   * Lấy danh sách loại vật tư có phân trang
   */
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
        material_categories!inner (
          name,
          code,
          color
        )
      `, { count: 'exact' })

    // Filter theo category
    if (category_id) {
      query = query.eq('category_id', category_id)
    }

    // Filter theo trạng thái
    if (is_active !== 'all' && is_active !== undefined) {
      query = query.eq('is_active', is_active)
    }

    // Tìm kiếm theo tên hoặc mã
    if (search) {
      query = query.or(`name.ilike.%${search}%,code.ilike.%${search}%`)
    }

    // Sắp xếp và phân trang
    const { data, error, count } = await query
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })
      .range(from, to)

    if (error) throw error

    // Transform data to flatten category info
    const transformedData = (data || []).map(item => ({
      ...item,
      category_name: item.material_categories?.name,
      category_code: item.material_categories?.code,
      category_color: item.material_categories?.color,
      material_categories: undefined
    }))

    return {
      data: transformedData,
      total: count || 0,
      page,
      pageSize,
      totalPages: Math.ceil((count || 0) / pageSize)
    }
  },

  /**
   * Lấy tất cả loại active (cho dropdown)
   */
  async getAllActive(categoryId?: string): Promise<MaterialType[]> {
    let query = supabase
      .from('material_types')
      .select(`
        *,
        material_categories!inner (
          name,
          code,
          color
        )
      `)
      .eq('is_active', true)

    if (categoryId) {
      query = query.eq('category_id', categoryId)
    }

    const { data, error } = await query
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })

    if (error) throw error

    return (data || []).map(item => ({
      ...item,
      category_name: item.material_categories?.name,
      category_code: item.material_categories?.code,
      category_color: item.material_categories?.color,
      material_categories: undefined
    }))
  },

  /**
   * Lấy loại theo ID
   */
  async getById(id: string): Promise<MaterialType | null> {
    const { data, error } = await supabase
      .from('material_types')
      .select(`
        *,
        material_categories!inner (
          name,
          code,
          color
        )
      `)
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null
      throw error
    }

    return {
      ...data,
      category_name: data.material_categories?.name,
      category_code: data.material_categories?.code,
      category_color: data.material_categories?.color,
      material_categories: undefined
    }
  },

  /**
   * Lấy loại theo category ID
   */
  async getByCategory(categoryId: string): Promise<MaterialType[]> {
    const { data, error } = await supabase
      .from('material_types')
      .select('*')
      .eq('category_id', categoryId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })

    if (error) throw error
    return data || []
  },

  /**
   * Tạo loại mới
   */
  async create(type: MaterialTypeFormData): Promise<MaterialType> {
    // Validate code format
    const code = type.code.toUpperCase().trim()
    if (!/^[A-Z0-9]{2,10}$/.test(code)) {
      throw new Error('Mã loại phải từ 2-10 ký tự chữ hoặc số')
    }

    // Check code exists in same category
    const exists = await this.checkCodeExists(code, type.category_id)
    if (exists) {
      throw new Error(`Mã loại "${code}" đã tồn tại trong nhóm này`)
    }

    const { data, error } = await supabase
      .from('material_types')
      .insert({
        ...type,
        code,
        sort_order: type.sort_order || 0,
        is_active: type.is_active ?? true
      })
      .select()
      .single()

    if (error) throw error
    return data
  },

  /**
   * Cập nhật loại
   */
  async update(id: string, type: Partial<MaterialTypeFormData>): Promise<MaterialType> {
    // Validate code format if provided
    if (type.code) {
      const code = type.code.toUpperCase().trim()
      if (!/^[A-Z0-9]{2,10}$/.test(code)) {
        throw new Error('Mã loại phải từ 2-10 ký tự chữ hoặc số')
      }

      // Get current type to check category
      const current = await this.getById(id)
      if (!current) throw new Error('Không tìm thấy loại vật tư')

      const categoryId = type.category_id || current.category_id

      // Check code exists in same category (exclude current)
      const exists = await this.checkCodeExists(code, categoryId, id)
      if (exists) {
        throw new Error(`Mã loại "${code}" đã tồn tại trong nhóm này`)
      }
      type.code = code
    }

    const { data, error } = await supabase
      .from('material_types')
      .update({
        ...type,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data
  },

  /**
   * Xóa loại (soft delete)
   */
  async delete(id: string): Promise<void> {
    // Check if type has materials
    const { count } = await supabase
      .from('materials')
      .select('id', { count: 'exact', head: true })
      .eq('type_id', id)

    if (count && count > 0) {
      throw new Error(`Không thể xóa loại này vì có ${count} vật tư đang sử dụng`)
    }

    // Soft delete
    const { error } = await supabase
      .from('material_types')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (error) throw error
  },

  /**
   * Hard delete
   */
  async hardDelete(id: string): Promise<void> {
    const { error } = await supabase
      .from('material_types')
      .delete()
      .eq('id', id)

    if (error) throw error
  },

  /**
   * Toggle trạng thái active
   */
  async toggleActive(id: string): Promise<MaterialType> {
    const current = await this.getById(id)
    if (!current) {
      throw new Error('Không tìm thấy loại vật tư')
    }

    return this.update(id, { is_active: !current.is_active })
  },

  /**
   * Kiểm tra mã đã tồn tại trong cùng category
   */
  async checkCodeExists(code: string, categoryId: string, excludeId?: string): Promise<boolean> {
    let query = supabase
      .from('material_types')
      .select('id', { count: 'exact', head: true })
      .eq('code', code.toUpperCase())
      .eq('category_id', categoryId)

    if (excludeId) {
      query = query.neq('id', excludeId)
    }

    const { count } = await query
    return (count || 0) > 0
  },

  /**
   * Lấy số lượng vật tư trong loại
   */
  async getMaterialCount(typeId: string): Promise<number> {
    const { count, error } = await supabase
      .from('materials')
      .select('id', { count: 'exact', head: true })
      .eq('type_id', typeId)

    if (error) throw error
    return count || 0
  },

  /**
   * Preview mã vật tư
   * Format: {CATEGORY_CODE}-{TYPE_CODE}{NNN}
   */
  async previewMaterialCode(categoryId: string, typeId: string): Promise<string> {
    // Get category and type info
    const { data: category } = await supabase
      .from('material_categories')
      .select('code')
      .eq('id', categoryId)
      .single()

    const { data: type } = await supabase
      .from('material_types')
      .select('code')
      .eq('id', typeId)
      .single()

    if (!category || !type) {
      return '???-???001'
    }

    // Count existing materials in this type
    const { count } = await supabase
      .from('materials')
      .select('id', { count: 'exact', head: true })
      .eq('type_id', typeId)

    const nextNumber = ((count || 0) + 1).toString().padStart(3, '0')
    return `${category.code}-${type.code}${nextNumber}`
  }
}

export default materialTypeService