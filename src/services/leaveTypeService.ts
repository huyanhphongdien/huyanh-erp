import { supabase } from '../lib/supabase'

// Define types inline
interface LeaveType {
  id: string
  code: string
  name: string
  description?: string
  max_days_per_year?: number
  requires_approval: boolean
  is_paid: boolean
  color?: string
  status: string
  created_at: string
  updated_at: string
}

interface LeaveTypeFormData {
  code: string
  name: string
  description?: string
  max_days_per_year?: number
  requires_approval?: boolean
  is_paid?: boolean
  color?: string
  status?: string
}

interface PaginationParams {
  page: number
  pageSize: number
  search?: string
  status?: string
}

interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export const leaveTypeService = {
  // Lấy tất cả loại nghỉ phép (có phân trang)
  async getAll(params: PaginationParams): Promise<PaginatedResponse<LeaveType>> {
    const { page = 1, pageSize = 10, search, status } = params
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    let query = supabase
      .from('leave_types')
      .select('*', { count: 'exact' })

    // Filter by status
    if (status) {
      query = query.eq('status', status)
    }

    // Search by code or name
    if (search) {
      query = query.or(`code.ilike.%${search}%,name.ilike.%${search}%`)
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

  // Lấy tất cả loại nghỉ phép active (cho dropdown)
  async getAllActive(): Promise<LeaveType[]> {
    const { data, error } = await supabase
      .from('leave_types')
      .select('*')
      .eq('status', 'active')
      .order('name', { ascending: true })

    if (error) throw error
    return data || []
  },

  // Lấy chi tiết theo ID
  async getById(id: string): Promise<LeaveType> {
    const { data, error } = await supabase
      .from('leave_types')
      .select('*')
      .eq('id', id)
      .single()

    if (error) throw error
    return data
  },

  // Tạo mới
  async create(formData: LeaveTypeFormData): Promise<LeaveType> {
    const { data, error } = await supabase
      .from('leave_types')
      .insert(formData)
      .select()
      .single()

    if (error) throw error
    return data
  },

  // Cập nhật
  async update(id: string, formData: Partial<LeaveTypeFormData>): Promise<LeaveType> {
    const { data, error } = await supabase
      .from('leave_types')
      .update({ ...formData, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data
  },

  // Xóa
  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('leave_types')
      .delete()
      .eq('id', id)

    if (error) throw error
  }
}

export default leaveTypeService