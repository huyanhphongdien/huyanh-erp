import { supabase } from '../lib/supabase'

// Define types inline
interface LeaveRequest {
  id: string
  employee_id: string
  leave_type_id: string
  request_number: string
  start_date: string
  end_date: string
  total_days: number
  reason: string
  status: string
  approved_by?: string
  approved_at?: string
  approval_notes?: string
  created_at: string
  updated_at: string
}

interface LeaveRequestFormData {
  employee_id: string
  leave_type_id: string
  start_date: string
  end_date: string
  total_days: number
  reason: string
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

export const leaveRequestService = {
  // Lấy danh sách đơn nghỉ phép (có phân trang)
  async getAll(params: PaginationParams & { 
    status?: string, 
    employee_id?: string 
  }): Promise<PaginatedResponse<LeaveRequest>> {
    const { page = 1, pageSize = 10, status, employee_id, search } = params
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    let query = supabase
      .from('leave_requests')
      .select(`
        *,
        employee:employees!leave_requests_employee_id_fkey(id, code, full_name),
        leave_type:leave_types!leave_requests_leave_type_id_fkey(id, name, color),
        approver:employees!leave_requests_approved_by_fkey(id, code, full_name)
      `, { count: 'exact' })

    // Filter by status
    if (status) {
      query = query.eq('status', status)
    }

    // Filter by employee
    if (employee_id) {
      query = query.eq('employee_id', employee_id)
    }

    // Search by request_number
    if (search) {
      query = query.ilike('request_number', `%${search}%`)
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

  // Lấy chi tiết
  async getById(id: string): Promise<LeaveRequest> {
    const { data, error } = await supabase
      .from('leave_requests')
      .select(`
        *,
        employee:employees!leave_requests_employee_id_fkey(id, code, full_name),
        leave_type:leave_types!leave_requests_leave_type_id_fkey(id, name, color),
        approver:employees!leave_requests_approved_by_fkey(id, code, full_name)
      `)
      .eq('id', id)
      .single()

    if (error) throw error
    return data
  },

  // Tạo đơn mới
  async create(formData: LeaveRequestFormData): Promise<LeaveRequest> {
    // Tạo mã đơn tự động
    const requestNumber = await this.generateRequestNumber()

    const { data, error } = await supabase
      .from('leave_requests')
      .insert({
        ...formData,
        request_number: requestNumber,
        status: 'pending'
      })
      .select()
      .single()

    if (error) throw error
    return data
  },

  // Cập nhật đơn
  async update(id: string, formData: Partial<LeaveRequestFormData>): Promise<LeaveRequest> {
    const { data, error } = await supabase
      .from('leave_requests')
      .update({ ...formData, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data
  },

  // Xóa đơn
  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('leave_requests')
      .delete()
      .eq('id', id)

    if (error) throw error
  },

  // Duyệt đơn
  async approve(id: string, approverId: string, notes?: string): Promise<LeaveRequest> {
    const { data, error } = await supabase
      .from('leave_requests')
      .update({
        status: 'approved',
        approved_by: approverId,
        approved_at: new Date().toISOString(),
        approval_notes: notes || null
      })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data
  },

  // Từ chối đơn
  async reject(id: string, approverId: string, notes: string): Promise<LeaveRequest> {
    const { data, error } = await supabase
      .from('leave_requests')
      .update({
        status: 'rejected',
        approved_by: approverId,
        approved_at: new Date().toISOString(),
        approval_notes: notes
      })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data
  },

  // Hủy đơn (người tạo tự hủy)
  async cancel(id: string): Promise<LeaveRequest> {
    const { data, error } = await supabase
      .from('leave_requests')
      .update({ status: 'cancelled' })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data
  },

  // Tạo mã đơn tự động
  async generateRequestNumber(): Promise<string> {
    const year = new Date().getFullYear()
    
    const { data, error } = await supabase
      .from('leave_requests')
      .select('request_number')
      .ilike('request_number', `NP${year}%`)
      .order('request_number', { ascending: false })
      .limit(1)

    if (!error && data && data.length > 0 && data[0].request_number) {
      const lastNumber = data[0].request_number
      const num = parseInt(lastNumber.slice(-4)) + 1
      return `NP${year}-${num.toString().padStart(4, '0')}`
    }
    
    return `NP${year}-0001`
  },

  // Lấy đơn nghỉ chờ duyệt
  async getPendingRequests(): Promise<LeaveRequest[]> {
    const { data, error } = await supabase
      .from('leave_requests')
      .select(`
        *,
        employee:employees!leave_requests_employee_id_fkey(id, code, full_name),
        leave_type:leave_types!leave_requests_leave_type_id_fkey(id, name, color)
      `)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })

    if (error) throw error
    return data || []
  }
}

export default leaveRequestService