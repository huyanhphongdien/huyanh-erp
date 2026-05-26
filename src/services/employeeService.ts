// src/services/employeeService.ts
import { supabase } from '../lib/supabase'
import type { Employee, PaginatedResponse } from '../types'

// Define EmployeeFormData inline
// Lưu ý: mã NV (hac13_code) do DB tự sinh qua DEFAULT generate_hac13(3) — không nhập tay.
interface EmployeeFormData {
  full_name: string
  email?: string
  phone?: string
  date_of_birth?: string
  gender?: 'male' | 'female' | 'other'
  address?: string
  department_id?: string
  position_id?: string
  hire_date?: string
  status?: string
}

// Interface riêng cho employee params
interface EmployeePaginationParams {
  page?: number
  pageSize?: number
  search?: string
  status?: string
  department_id?: string
  position_id?: string
}

export const employeeService = {
  // Lấy danh sách có phân trang
  async getAll(params: EmployeePaginationParams = {}): Promise<PaginatedResponse<Employee>> {
    const page = params.page || 1
    const pageSize = params.pageSize || 10
    const { search, status, department_id, position_id } = params
    
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    let query = supabase
      .from('employees')
      .select('*', { count: 'exact' })  // FIXED: Bỏ relation query phức tạp

    if (status && status !== 'all') {
      query = query.eq('status', status)
    }

    if (department_id) {
      query = query.eq('department_id', department_id)
    }

    if (position_id) {
      query = query.eq('position_id', position_id)
    }

    if (search) {
      // Search trên full_name, email, hac13_code và code (cột legacy đã sync với hac13)
      query = query.or(
        `full_name.ilike.%${search}%,code.ilike.%${search}%,hac13_code.ilike.%${search}%,email.ilike.%${search}%`,
      )
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

  // Lấy theo ID
  async getById(id: string): Promise<Employee | null> {
    const { data, error } = await supabase
      .from('employees')
      .select('*')  // FIXED: Bỏ relation query
      .eq('id', id)
      .single()

    if (error) throw error
    return data
  },

  // Tạo mới
  async create(employee: EmployeeFormData): Promise<Employee> {
    const { data, error } = await supabase
      .from('employees')
      .insert(employee)
      .select()
      .single()

    if (error) throw error
    return data
  },

  // Cập nhật
  async update(id: string, employee: Partial<EmployeeFormData>): Promise<Employee> {
    const { data, error } = await supabase
      .from('employees')
      .update(employee)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data
  },

  // Xóa
  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('employees')
      .delete()
      .eq('id', id)

    if (error) throw error
  },

  // Tìm theo HAC-13 code (hỗ trợ cả dạng có dash và không dash).
  async findByHac13Code(code: string): Promise<Employee | null> {
    const normalized = code.replace(/[\s-]/g, '')
    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .eq('hac13_code', normalized)
      .maybeSingle()
    if (error) throw error
    return data
  },
}

export default employeeService