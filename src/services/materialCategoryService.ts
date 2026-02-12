// ============================================================================
// MATERIAL CATEGORY SERVICE - FIXED for WMS DB Schema
// File: src/services/materialCategoryService.ts
// Huy Anh ERP System - Module Quản lý đơn hàng
// ============================================================================
// FIX: DB hiện tại (sau WMS Phase 1) chỉ có columns:
//   id, name, type, description, is_active, created_at, updated_at
// KHÔNG CÓ: code, icon, color, sort_order
// ============================================================================

import { supabase } from '../lib/supabase'

// ============================================
// TYPES
// ============================================

export interface MaterialCategory {
  id: string
  name: string
  type?: 'raw' | 'finished'  // WMS column
  description?: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface MaterialCategoryFormData {
  name: string
  type?: 'raw' | 'finished'
  description?: string
  is_active?: boolean
}

export interface CategoryPaginationParams {
  page?: number
  pageSize?: number
  search?: string
  is_active?: boolean | 'all'
  type?: 'raw' | 'finished' | 'all'
}

export interface PaginatedCategoryResponse {
  data: MaterialCategory[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

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
    const { search, is_active, type } = params

    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    let query = supabase
      .from('material_categories')
      .select('*', { count: 'exact' })

    // Filter theo trạng thái
    if (is_active !== 'all' && is_active !== undefined) {
      query = query.eq('is_active', is_active)
    }

    // Filter theo type (WMS)
    if (type && type !== 'all') {
      query = query.eq('type', type)
    }

    // Tìm kiếm theo tên
    if (search) {
      query = query.or(`name.ilike.%${search}%`)
    }

    // Sắp xếp theo tên
    const { data, error, count } = await query
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
      if (error.code === 'PGRST116') return null
      throw error
    }
    return data
  },

  /**
   * Tạo nhóm mới
   */
  async create(category: MaterialCategoryFormData): Promise<MaterialCategory> {
    const { data, error } = await supabase
      .from('material_categories')
      .insert({
        name: category.name.trim(),
        type: category.type || null,
        description: category.description || null,
        is_active: category.is_active ?? true,
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
    const updateData: Record<string, any> = {}

    if (category.name !== undefined) updateData.name = category.name.trim()
    if (category.type !== undefined) updateData.type = category.type
    if (category.description !== undefined) updateData.description = category.description
    if (category.is_active !== undefined) updateData.is_active = category.is_active

    updateData.updated_at = new Date().toISOString()

    const { data, error } = await supabase
      .from('material_categories')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data
  },

  /**
   * Xóa nhóm (soft delete = set is_active = false)
   */
  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('material_categories')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (error) throw error
  },

  /**
   * Toggle trạng thái active
   */
  async toggleActive(id: string, currentActive?: boolean): Promise<MaterialCategory> {
    // Nếu không truyền currentActive, fetch trước
    let newActive: boolean
    if (currentActive !== undefined) {
      newActive = !currentActive
    } else {
      const current = await this.getById(id)
      if (!current) throw new Error('Không tìm thấy nhóm')
      newActive = !current.is_active
    }

    const { data, error } = await supabase
      .from('material_categories')
      .update({ is_active: newActive, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data
  },

  /**
   * Kiểm tra tên đã tồn tại
   */
  async checkNameExists(name: string, excludeId?: string): Promise<boolean> {
    let query = supabase
      .from('material_categories')
      .select('id', { count: 'exact', head: true })
      .ilike('name', name.trim())

    if (excludeId) {
      query = query.neq('id', excludeId)
    }

    const { count, error } = await query
    if (error) throw error
    return (count || 0) > 0
  },

  /**
   * Đếm số loại vật tư thuộc nhóm (bảng material_types)
   */
  async getTypeCount(categoryId: string): Promise<number> {
    try {
      const { count, error } = await supabase
        .from('material_types')
        .select('id', { count: 'exact', head: true })
        .eq('category_id', categoryId)

      if (error) return 0 // Bảng chưa tồn tại → 0
      return count || 0
    } catch {
      return 0
    }
  },

  /**
   * Đếm số vật tư thuộc nhóm (bảng materials)
   */
  async getMaterialCount(categoryId: string): Promise<number> {
    try {
      const { count, error } = await supabase
        .from('materials')
        .select('id', { count: 'exact', head: true })
        .eq('category_id', categoryId)

      if (error) return 0
      return count || 0
    } catch {
      return 0
    }
  },
}