import { supabase } from '../lib/supabase'
import type { Employee, EmployeeFormData, PaginatedResponse } from '../types'

// Định nghĩa params riêng cho employee
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
  async getAll(params: EmployeePaginationParams): Promise<PaginatedResponse<Employee>> {
    const page = params.page || 1
    const pageSize = params.pageSize || 10
    const { search, status, department_id, position_id } = params
    
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    let query = supabase
      .from('employees')
      .select(`
        *,
        department:departments!employees_department_id_fkey(id, code, name),
        position:positions!employees_position_id_fkey(id, code, name)
      `, { count: 'exact' })

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
      query = query.or(`full_name.ilike.%${search}%,code.ilike.%${search}%,email.ilike.%${search}%`)
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
      .select(`
        *,
        department:departments!employees_department_id_fkey(id, code, name),
        position:positions!employees_position_id_fkey(id, code, name)
      `)
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

  // Kiểm tra mã đã tồn tại
  async checkCodeExists(code: string, excludeId?: string): Promise<boolean> {
    let query = supabase
      .from('employees')
      .select('id')
      .eq('code', code)

    if (excludeId) {
      query = query.neq('id', excludeId)
    }

    const { data } = await query.single()
    return !!data
  },

  // Tạo mã nhân viên tự động
  async generateCode(): Promise<string> {
    const { data } = await supabase
      .from('employees')
      .select('code')
      .order('code', { ascending: false })
      .limit(1)
      .single()

    if (data?.code) {
      const num = parseInt(data.code.replace('NV', '')) + 1
      return `NV${num.toString().padStart(3, '0')}`
    }
    return 'NV001'
  }
}