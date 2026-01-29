// src/services/departmentService.ts
import { supabase } from '../lib/supabase'
import type { Department, PaginatedResponse } from '../types'

// Define DepartmentFormData inline
interface DepartmentFormData {
  code: string
  name: string
  description?: string
  parent_id?: string
  manager_id?: string
  status?: string
}

// Interface riêng cho department params
interface DepartmentPaginationParams {
  page?: number
  pageSize?: number
  search?: string
  status?: string
}

export const departmentService = {
  // Lấy danh sách có phân trang
  async getAll(params: DepartmentPaginationParams = {}): Promise<PaginatedResponse<Department>> {
    const page = params.page || 1
    const pageSize = params.pageSize || 10
    const { search, status } = params
    
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    let query = supabase
      .from('departments')
      .select('*', { count: 'exact' })  // FIXED: Bỏ count employees, chỉ select departments

    // Filter theo status
    if (status && status !== 'all') {
      query = query.eq('status', status)
    }

    // Tìm kiếm theo tên hoặc mã
    if (search) {
      query = query.or(`name.ilike.%${search}%,code.ilike.%${search}%`)
    }

    // Sắp xếp và phân trang
    const { data, error, count } = await query
      .order('created_at', { ascending: false })
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

  // Lấy tất cả (cho dropdown)
  async getAllActive(): Promise<Department[]> {
    const { data, error } = await supabase
      .from('departments')
      .select('*')
      .eq('status', 'active')
      .order('name')

    if (error) throw error
    return data || []
  },

  // Lấy theo ID
  async getById(id: string): Promise<Department | null> {
    const { data, error } = await supabase
      .from('departments')
      .select('*')
      .eq('id', id)
      .single()

    if (error) throw error
    return data
  },

  // Tạo mới
  async create(department: DepartmentFormData): Promise<Department> {
    const { data, error } = await supabase
      .from('departments')
      .insert(department)
      .select()
      .single()

    if (error) throw error
    return data
  },

  // Cập nhật
  async update(id: string, department: Partial<DepartmentFormData>): Promise<Department> {
    const { data, error } = await supabase
      .from('departments')
      .update(department)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data
  },

  // Xóa
  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('departments')
      .delete()
      .eq('id', id)

    if (error) throw error
  },

  // Kiểm tra mã đã tồn tại
  async checkCodeExists(code: string, excludeId?: string): Promise<boolean> {
    let query = supabase
      .from('departments')
      .select('id', { count: 'exact', head: true })  // FIXED: Thêm head: true để chỉ count
      .eq('code', code)

    if (excludeId) {
      query = query.neq('id', excludeId)
    }

    const { count } = await query  // FIXED: Dùng count thay vì data
    return (count || 0) > 0
  },

  // NEW: Lấy số lượng employees trong department (nếu cần)
  async getEmployeeCount(departmentId: string): Promise<number> {
    const { count, error } = await supabase
      .from('employees')
      .select('id', { count: 'exact', head: true })
      .eq('department_id', departmentId)
      .eq('status', 'active')

    if (error) throw error
    return count || 0
  }
}

export default departmentService