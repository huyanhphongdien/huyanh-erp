// src/services/departmentService.ts
import { supabase } from '../lib/supabase'
import type { Department, DepartmentFormData, PaginationParams, PaginatedResponse } from '../types'

export const departmentService = {
  // Lấy danh sách có phân trang
  async getAll(params: PaginationParams): Promise<PaginatedResponse<Department>> {
    // Thêm giá trị mặc định
    const page = params.page || 1
    const pageSize = params.pageSize || 10
    const { search, status } = params
    
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    let query = supabase
      .from('departments')
      .select('*, employees!employees_department_id_fkey(count)', { count: 'exact' })

    if (status && status !== 'all') {
      query = query.eq('status', status)
    }

    if (search) {
      query = query.or(`name.ilike.%${search}%,code.ilike.%${search}%`)
    }

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

  async getAllActive(): Promise<Department[]> {
    const { data, error } = await supabase
      .from('departments')
      .select('*')
      .eq('status', 'active')
      .order('name')

    if (error) throw error
    return data || []
  },

  async getById(id: string): Promise<Department | null> {
    const { data, error } = await supabase
      .from('departments')
      .select('*')
      .eq('id', id)
      .single()

    if (error) throw error
    return data
  },

  async create(department: DepartmentFormData): Promise<Department> {
    const { data, error } = await supabase
      .from('departments')
      .insert(department)
      .select()
      .single()

    if (error) throw error
    return data
  },

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

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('departments')
      .delete()
      .eq('id', id)

    if (error) throw error
  },

  async checkCodeExists(code: string, excludeId?: string): Promise<boolean> {
    let query = supabase
      .from('departments')
      .select('id')
      .eq('code', code)

    if (excludeId) {
      query = query.neq('id', excludeId)
    }

    const { data } = await query.single()
    return !!data
  }
}