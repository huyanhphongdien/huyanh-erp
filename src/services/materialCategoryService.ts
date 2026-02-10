// src/services/purchasing/materialCategoryService.ts
// Service quản lý Nhóm vật tư (Material Categories)
import { supabase } from '../lib/supabase'

// ============================================
// INTERFACES
// ============================================

export interface MaterialCategory {
  id: string
  code: string
  name: string
  description?: string
  icon?: string
  color?: string
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
  // Computed fields
  material_count?: number
}

export interface MaterialCategoryFormData {
  code: string
  name: string
  description?: string
  icon?: string
  color?: string
  sort_order?: number
  is_active?: boolean
}

export interface CategoryPaginationParams {
  page?: number
  pageSize?: number
  search?: string
  is_active?: boolean | 'all'
}

export interface PaginatedCategoryResponse {
  data: MaterialCategory[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

// ============================================
// PREDEFINED ICONS & COLORS
// ============================================

export const CATEGORY_ICONS = [
  { value: 'Package', label: 'Nguyên liệu' },
  { value: 'Fuel', label: 'Nhiên liệu' },
  { value: 'Wrench', label: 'Phụ tùng' },
  { value: 'HardHat', label: 'Bảo hộ' },
  { value: 'FileText', label: 'Văn phòng phẩm' },
  { value: 'Cpu', label: 'Thiết bị điện' },
  { value: 'Droplet', label: 'Hóa chất' },
  { value: 'Building', label: 'Vật liệu xây dựng' },
  { value: 'Box', label: 'Bao bì' },
  { value: 'Layers', label: 'Khác' },
]

export const CATEGORY_COLORS = [
  { value: '#3B82F6', label: 'Xanh dương', bg: 'bg-blue-500' },
  { value: '#10B981', label: 'Xanh lá', bg: 'bg-emerald-500' },
  { value: '#F59E0B', label: 'Cam', bg: 'bg-amber-500' },
  { value: '#EF4444', label: 'Đỏ', bg: 'bg-red-500' },
  { value: '#8B5CF6', label: 'Tím', bg: 'bg-violet-500' },
  { value: '#EC4899', label: 'Hồng', bg: 'bg-pink-500' },
  { value: '#06B6D4', label: 'Cyan', bg: 'bg-cyan-500' },
  { value: '#6B7280', label: 'Xám', bg: 'bg-gray-500' },
]

// ============================================
// SERVICE
// ============================================

export const materialCategoryService = {
  /**
   * Lấy danh sách nhóm vật tư có phân trang
   */
  async getAll(params: CategoryPaginationParams = {}): Promise<PaginatedCategoryResponse> {
    const page = params.page || 1
    const pageSize = params.pageSize || 10
    const { search, is_active } = params
    
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    let query = supabase
      .from('material_categories')
      .select('*', { count: 'exact' })

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

    return {
      data: data || [],
      total: count || 0,
      page,
      pageSize,
      totalPages: Math.ceil((count || 0) / pageSize)
    }
  },

  /**
   * Lấy tất cả nhóm active (cho dropdown)
   */
  async getAllActive(): Promise<MaterialCategory[]> {
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
  async getById(id: string): Promise<MaterialCategory | null> {
    const { data, error } = await supabase
      .from('material_categories')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null // Not found
      throw error
    }
    return data
  },

  /**
   * Tạo nhóm mới
   */
  async create(category: MaterialCategoryFormData): Promise<MaterialCategory> {
    // Validate code format
    const code = category.code.toUpperCase().trim()
    if (!/^[A-Z]{2,5}$/.test(code)) {
      throw new Error('Mã nhóm phải từ 2-5 ký tự chữ in hoa')
    }

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
  async update(id: string, category: Partial<MaterialCategoryFormData>): Promise<MaterialCategory> {
    // Validate code format if provided
    if (category.code) {
      const code = category.code.toUpperCase().trim()
      if (!/^[A-Z]{2,5}$/.test(code)) {
        throw new Error('Mã nhóm phải từ 2-5 ký tự chữ in hoa')
      }

      // Check code exists (exclude current)
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
   * Xóa nhóm (soft delete - set is_active = false)
   */
  async delete(id: string): Promise<void> {
    // Check if category has materials or types
    const { count: typeCount } = await supabase
      .from('material_types')
      .select('id', { count: 'exact', head: true })
      .eq('category_id', id)

    if (typeCount && typeCount > 0) {
      throw new Error(`Không thể xóa nhóm này vì có ${typeCount} loại vật tư đang sử dụng`)
    }

    // Soft delete
    const { error } = await supabase
      .from('material_categories')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (error) throw error
  },

  /**
   * Hard delete (chỉ dùng khi thực sự cần)
   */
  async hardDelete(id: string): Promise<void> {
    const { error } = await supabase
      .from('material_categories')
      .delete()
      .eq('id', id)

    if (error) throw error
  },

  /**
   * Toggle trạng thái active
   */
  async toggleActive(id: string): Promise<MaterialCategory> {
    // Get current status
    const current = await this.getById(id)
    if (!current) {
      throw new Error('Không tìm thấy nhóm vật tư')
    }

    return this.update(id, { is_active: !current.is_active })
  },

  /**
   * Kiểm tra mã đã tồn tại
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
   * Lấy số lượng vật tư trong nhóm
   */
  async getMaterialCount(categoryId: string): Promise<number> {
    const { count, error } = await supabase
      .from('materials')
      .select('id', { count: 'exact', head: true })
      .eq('category_id', categoryId)

    if (error) throw error
    return count || 0
  },

  /**
   * Lấy số lượng loại vật tư trong nhóm
   */
  async getTypeCount(categoryId: string): Promise<number> {
    const { count, error } = await supabase
      .from('material_types')
      .select('id', { count: 'exact', head: true })
      .eq('category_id', categoryId)

    if (error) throw error
    return count || 0
  },

  /**
   * Cập nhật thứ tự hiển thị
   */
  async updateSortOrder(items: { id: string; sort_order: number }[]): Promise<void> {
    for (const item of items) {
      const { error } = await supabase
        .from('material_categories')
        .update({ sort_order: item.sort_order })
        .eq('id', item.id)

      if (error) throw error
    }
  },

  /**
   * Lấy danh sách với số lượng types và materials
   */
  async getAllWithCounts(): Promise<(MaterialCategory & { type_count: number; material_count: number })[]> {
    const { data: categories, error } = await supabase
      .from('material_categories')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })

    if (error) throw error

    // Get counts for each category
    const result = await Promise.all(
      (categories || []).map(async (cat) => {
        const [typeCount, materialCount] = await Promise.all([
          this.getTypeCount(cat.id),
          this.getMaterialCount(cat.id)
        ])
        return {
          ...cat,
          type_count: typeCount,
          material_count: materialCount
        }
      })
    )

    return result
  }
}

export default materialCategoryService