// src/services/wms/materialCategoryService.ts
// WMS wrapper cho materialCategoryService (tái sử dụng từ module Đơn hàng)
// Thêm filter type='finished' cho thành phẩm
import { supabase } from '../../lib/supabase'

// ============================================
// INTERFACES (tái sử dụng pattern ERP)
// ============================================

export interface WMSMaterialCategory {
  id: string
  code: string
  name: string
  type: string                         // 'raw' | 'finished'
  description?: string
  icon?: string
  color?: string
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
  material_count?: number
}

export interface WMSCategoryFormData {
  code: string
  name: string
  type?: 'raw' | 'finished'
  description?: string
  icon?: string
  color?: string
  sort_order?: number
  is_active?: boolean
}

export interface WMSCategoryPaginationParams {
  page?: number
  pageSize?: number
  search?: string
  type?: 'raw' | 'finished' | 'all'
  is_active?: boolean | 'all'
}

export interface PaginatedWMSCategoryResponse {
  data: WMSMaterialCategory[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

// ============================================
// SERVICE
// ============================================

export const wmsMaterialCategoryService = {
  /**
   * Lấy danh sách nhóm có phân trang + filter type
   */
  async getAll(params: WMSCategoryPaginationParams = {}): Promise<PaginatedWMSCategoryResponse> {
    const page = params.page || 1
    const pageSize = params.pageSize || 10
    const { search, type, is_active } = params

    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    let query = supabase
      .from('material_categories')
      .select('*', { count: 'exact' })

    // Filter theo loại (raw/finished)
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
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })
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
   * Lấy tất cả nhóm thành phẩm active (cho dropdown WMS)
   */
  async getFinishedCategories(): Promise<WMSMaterialCategory[]> {
    const { data, error } = await supabase
      .from('material_categories')
      .select('*')
      .eq('type', 'finished')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })

    if (error) throw error
    return data || []
  },

  /**
   * Lấy tất cả nhóm NVL active (cho dropdown)
   */
  async getRawCategories(): Promise<WMSMaterialCategory[]> {
    const { data, error } = await supabase
      .from('material_categories')
      .select('*')
      .eq('type', 'raw')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })

    if (error) throw error
    return data || []
  },

  /**
   * Lấy tất cả nhóm active (cả raw + finished)
   */
  async getAllActive(): Promise<WMSMaterialCategory[]> {
    const { data, error } = await supabase
      .from('material_categories')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })

    if (error) throw error
    return data || []
  },

  /**
   * Lấy nhóm theo ID
   */
  async getById(id: string): Promise<WMSMaterialCategory | null> {
    const { data, error } = await supabase
      .from('material_categories')
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
   * Tạo nhóm mới
   */
  async create(category: WMSCategoryFormData): Promise<WMSMaterialCategory> {
    const code = category.code.toUpperCase().trim()

    // Validate
    if (!code) throw new Error('Mã nhóm không được để trống')
    if (!category.name?.trim()) throw new Error('Tên nhóm không được để trống')

    // Check code exists
    const exists = await this.checkCodeExists(code)
    if (exists) {
      throw new Error(`Mã nhóm "${code}" đã tồn tại`)
    }

    const { data, error } = await supabase
      .from('material_categories')
      .insert({
        ...category,
        code,
        type: category.type || 'finished',
        sort_order: category.sort_order || 0,
        is_active: category.is_active ?? true
      })
      .select()
      .single()

    if (error) throw error
    return data
  },

  /**
   * Cập nhật nhóm
   */
  async update(id: string, category: Partial<WMSCategoryFormData>): Promise<WMSMaterialCategory> {
    if (category.code) {
      const code = category.code.toUpperCase().trim()
      const exists = await this.checkCodeExists(code, id)
      if (exists) {
        throw new Error(`Mã nhóm "${code}" đã tồn tại`)
      }
      category.code = code
    }

    const { data, error } = await supabase
      .from('material_categories')
      .update({
        ...category,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data
  },

  /**
   * Xóa nhóm (soft delete)
   */
  async delete(id: string): Promise<void> {
    // Check if has materials
    const { count } = await supabase
      .from('materials')
      .select('id', { count: 'exact', head: true })
      .eq('category_id', id)

    if (count && count > 0) {
      throw new Error(`Không thể xóa nhóm này vì có ${count} vật tư đang sử dụng`)
    }

    const { error } = await supabase
      .from('material_categories')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (error) throw error
  },

  /**
   * Toggle trạng thái
   */
  async toggleActive(id: string): Promise<WMSMaterialCategory> {
    const current = await this.getById(id)
    if (!current) throw new Error('Không tìm thấy nhóm vật tư')
    return this.update(id, { is_active: !current.is_active })
  },

  /**
   * Kiểm tra mã tồn tại
   */
  async checkCodeExists(code: string, excludeId?: string): Promise<boolean> {
    let query = supabase
      .from('material_categories')
      .select('id', { count: 'exact', head: true })
      .eq('code', code.toUpperCase())

    if (excludeId) {
      query = query.neq('id', excludeId)
    }

    const { count } = await query
    return (count || 0) > 0
  },

  /**
   * Đếm số vật tư trong nhóm
   */
  async getMaterialCount(categoryId: string): Promise<number> {
    const { count, error } = await supabase
      .from('materials')
      .select('id', { count: 'exact', head: true })
      .eq('category_id', categoryId)

    if (error) throw error
    return count || 0
  }
}

export default wmsMaterialCategoryService