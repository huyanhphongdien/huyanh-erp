// src/services/project/projectCategoryService.ts
// CRUD danh mục loại dự án (PM2 - Bước 2.1)
// Pattern: materialCategoryService.ts (WMS)
// Bảng: project_categories

import { supabase } from '../../lib/supabase'

// ============================================
// INTERFACES
// ============================================

export interface ProjectCategory {
  id: string
  name: string
  description?: string
  color: string            // Hex color cho badge, default '#1B4D3E'
  icon?: string            // Lucide icon name (e.g. 'Monitor', 'Factory', 'Wrench')
  is_active: boolean
  created_at: string
  updated_at: string
  // Virtual (join count)
  project_count?: number
}

export interface ProjectCategoryFormData {
  name: string
  description?: string
  color?: string
  icon?: string
  is_active?: boolean
}

export interface ProjectCategoryPaginationParams {
  page?: number
  pageSize?: number
  search?: string
  is_active?: boolean | 'all'
}

export interface PaginatedProjectCategoryResponse {
  data: ProjectCategory[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

// ============================================
// PREDEFINED ICONS cho loại dự án
// ============================================

export const PROJECT_CATEGORY_ICONS = [
  { value: 'Monitor', label: 'CNTT / Phần mềm' },
  { value: 'Factory', label: 'Sản xuất' },
  { value: 'Building2', label: 'Xây dựng' },
  { value: 'Wrench', label: 'Cải tiến / Bảo trì' },
  { value: 'TrendingUp', label: 'Kinh doanh' },
  { value: 'Users', label: 'Nhân sự / Đào tạo' },
  { value: 'Shield', label: 'An toàn / Chất lượng' },
  { value: 'Truck', label: 'Logistics / Vận tải' },
  { value: 'Leaf', label: 'Môi trường' },
  { value: 'Zap', label: 'Điện / Năng lượng' },
  { value: 'FlaskConical', label: 'R&D / Nghiên cứu' },
  { value: 'FolderOpen', label: 'Khác' },
] as const

// ============================================
// PREDEFINED COLORS cho category badge
// ============================================

export const PROJECT_CATEGORY_COLORS = [
  { value: '#1B4D3E', label: 'Xanh đậm (Primary)' },
  { value: '#E8A838', label: 'Vàng cam (Accent)' },
  { value: '#2563EB', label: 'Xanh dương' },
  { value: '#DC2626', label: 'Đỏ' },
  { value: '#7C3AED', label: 'Tím' },
  { value: '#059669', label: 'Xanh lá' },
  { value: '#D97706', label: 'Cam' },
  { value: '#EC4899', label: 'Hồng' },
  { value: '#0891B2', label: 'Cyan' },
  { value: '#64748B', label: 'Xám' },
] as const

// ============================================
// SERVICE
// ============================================

export const projectCategoryService = {

  /**
   * Lấy danh sách có phân trang + filter
   */
  async getAll(params: ProjectCategoryPaginationParams = {}): Promise<PaginatedProjectCategoryResponse> {
    const page = params.page || 1
    const pageSize = params.pageSize || 20
    const { search, is_active } = params

    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    let query = supabase
      .from('project_categories')
      .select('*', { count: 'exact' })

    // Filter trạng thái
    if (is_active !== 'all' && is_active !== undefined) {
      query = query.eq('is_active', is_active)
    }

    // Tìm kiếm theo tên
    if (search) {
      query = query.ilike('name', `%${search}%`)
    }

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
   * Lấy tất cả danh mục active (cho dropdown/select)
   */
  async getAllActive(): Promise<ProjectCategory[]> {
    const { data, error } = await supabase
      .from('project_categories')
      .select('*')
      .eq('is_active', true)
      .order('name', { ascending: true })

    if (error) throw error
    return data || []
  },

  /**
   * Lấy danh mục theo ID
   */
  async getById(id: string): Promise<ProjectCategory | null> {
    const { data, error } = await supabase
      .from('project_categories')
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
   * Tạo danh mục mới
   */
  async create(formData: ProjectCategoryFormData): Promise<ProjectCategory> {
    const name = formData.name?.trim()

    // Validate
    if (!name) throw new Error('Tên loại dự án không được để trống')

    // Check trùng tên
    const exists = await this.checkNameExists(name)
    if (exists) {
      throw new Error(`Loại dự án "${name}" đã tồn tại`)
    }

    const { data, error } = await supabase
      .from('project_categories')
      .insert({
        name,
        description: formData.description?.trim() || null,
        color: formData.color || '#1B4D3E',
        icon: formData.icon || null,
        is_active: formData.is_active ?? true
      })
      .select()
      .single()

    if (error) throw error
    return data
  },

  /**
   * Cập nhật danh mục
   */
  async update(id: string, formData: Partial<ProjectCategoryFormData>): Promise<ProjectCategory> {
    // Validate tên nếu đổi
    if (formData.name !== undefined) {
      const name = formData.name?.trim()
      if (!name) throw new Error('Tên loại dự án không được để trống')

      const exists = await this.checkNameExists(name, id)
      if (exists) {
        throw new Error(`Loại dự án "${name}" đã tồn tại`)
      }
      formData.name = name
    }

    const { data, error } = await supabase
      .from('project_categories')
      .update({
        ...formData,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data
  },

  /**
   * Xóa danh mục (soft delete = set is_active = false)
   * Không cho xóa nếu có dự án đang sử dụng
   */
  async delete(id: string): Promise<void> {
    // Check xem có dự án nào dùng category này không
    const { count } = await supabase
      .from('projects')
      .select('id', { count: 'exact', head: true })
      .eq('category_id', id)

    if (count && count > 0) {
      throw new Error(`Không thể xóa loại dự án này vì có ${count} dự án đang sử dụng`)
    }

    // Soft delete
    const { error } = await supabase
      .from('project_categories')
      .update({
        is_active: false,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)

    if (error) throw error
  },

  /**
   * Xóa vĩnh viễn (chỉ khi không có dự án nào dùng)
   */
  async hardDelete(id: string): Promise<void> {
    const { count } = await supabase
      .from('projects')
      .select('id', { count: 'exact', head: true })
      .eq('category_id', id)

    if (count && count > 0) {
      throw new Error(`Không thể xóa vĩnh viễn vì có ${count} dự án đang sử dụng`)
    }

    const { error } = await supabase
      .from('project_categories')
      .delete()
      .eq('id', id)

    if (error) throw error
  },

  /**
   * Toggle trạng thái active/inactive
   */
  async toggleActive(id: string): Promise<ProjectCategory> {
    const current = await this.getById(id)
    if (!current) throw new Error('Không tìm thấy loại dự án')
    return this.update(id, { is_active: !current.is_active })
  },

  /**
   * Kiểm tra tên đã tồn tại (case-insensitive)
   */
  async checkNameExists(name: string, excludeId?: string): Promise<boolean> {
    let query = supabase
      .from('project_categories')
      .select('id', { count: 'exact', head: true })
      .ilike('name', name.trim())

    if (excludeId) {
      query = query.neq('id', excludeId)
    }

    const { count } = await query
    return (count || 0) > 0
  },

  /**
   * Đếm số dự án trong từng danh mục
   */
  async getProjectCount(categoryId: string): Promise<number> {
    const { count, error } = await supabase
      .from('projects')
      .select('id', { count: 'exact', head: true })
      .eq('category_id', categoryId)

    if (error) throw error
    return count || 0
  },

  /**
   * Lấy tất cả danh mục kèm số lượng dự án (cho trang quản lý)
   */
  async getAllWithCounts(): Promise<ProjectCategory[]> {
    const { data, error } = await supabase
      .from('project_categories')
      .select('*')
      .order('name', { ascending: true })

    if (error) throw error

    // Đếm projects cho từng category
    const categories = data || []
    const enriched = await Promise.all(
      categories.map(async (cat) => {
        const { count } = await supabase
          .from('projects')
          .select('id', { count: 'exact', head: true })
          .eq('category_id', cat.id)

        return {
          ...cat,
          project_count: count || 0
        }
      })
    )

    return enriched
  },

  /**
   * Seed data ban đầu (chạy 1 lần)
   */
  async seedDefaults(): Promise<void> {
    const defaults: ProjectCategoryFormData[] = [
      { name: 'Công nghệ thông tin', color: '#2563EB', icon: 'Monitor', description: 'Dự án phần mềm, ERP, hạ tầng IT' },
      { name: 'Sản xuất', color: '#059669', icon: 'Factory', description: 'Cải tiến quy trình, mở rộng sản xuất' },
      { name: 'Xây dựng & Hạ tầng', color: '#D97706', icon: 'Building2', description: 'Xây dựng nhà xưởng, kho bãi, hạ tầng' },
      { name: 'Cải tiến & Bảo trì', color: '#7C3AED', icon: 'Wrench', description: 'Bảo trì, sửa chữa, nâng cấp thiết bị' },
      { name: 'Kinh doanh', color: '#E8A838', icon: 'TrendingUp', description: 'Mở rộng thị trường, phát triển khách hàng' },
      { name: 'Điện & Năng lượng', color: '#DC2626', icon: 'Zap', description: 'Hệ thống điện, tiết kiệm năng lượng' },
      { name: 'Khác', color: '#64748B', icon: 'FolderOpen', description: 'Dự án không thuộc nhóm trên' },
    ]

    for (const cat of defaults) {
      const exists = await this.checkNameExists(cat.name)
      if (!exists) {
        await this.create(cat)
      }
    }
  }
}

export default projectCategoryService