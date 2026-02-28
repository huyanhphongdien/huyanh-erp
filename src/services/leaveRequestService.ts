import { supabase } from '../lib/supabase'

// ============================================================================
// TYPES
// ============================================================================

interface Employee {
  id: string
  code: string
  full_name: string
  department_id?: string
  department?: {
    id: string
    name: string
  }
  position?: {
    id: string
    name: string
    level: number
  }
}

interface LeaveType {
  id: string
  name: string
  color?: string
}

interface Approver {
  id: string
  code?: string
  full_name: string
}

export interface LeaveRequest {
  id: string
  employee_id: string
  leave_type_id: string
  request_number: string
  start_date: string
  end_date: string
  total_days: number
  reason: string
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  approver_id?: string
  approved_by?: string
  approved_at?: string
  approval_notes?: string
  created_at: string
  updated_at: string
  employee?: Employee
  leave_type?: LeaveType
  approver?: Approver
}

export interface LeaveApproverInfo {
  approver_id: string
  approver_name: string
  approver_position: string
  approver_level: number
  approval_type: 'self' | 'executive' | 'manager'
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

// ✅ RENAMED: BatchResult → LeaveBatchResult (tránh trùng export)
export interface LeaveBatchResult {
  success: number
  failed: number
  errors: Array<{ id: string; error: string }>
}

// ============================================================================
// CONSTANTS
// ============================================================================

const EXECUTIVE_MAX_LEVEL = 3  // Level 1-3: Ban Giám đốc
const MANAGER_MAX_LEVEL = 5    // Level 4-5: Trưởng/Phó phòng

// Select chung cho leave requests
const LEAVE_SELECT = `
  *,
  employee:employees!leave_requests_employee_id_fkey(
    id, code, full_name, department_id,
    department:departments!employees_department_id_fkey(id, name),
    position:positions!employees_position_id_fkey(id, name, level)
  ),
  leave_type:leave_types!leave_requests_leave_type_id_fkey(id, name, color),
  approver:employees!leave_requests_approved_by_fkey(id, full_name)
`

// ============================================================================
// SERVICE
// ============================================================================

export const leaveRequestService = {

  // ==========================================================================
  // LẤY NGƯỜI DUYỆT CHO ĐƠN NGHỈ PHÉP (dùng RPC nếu có)
  // ==========================================================================
  async getApprover(requesterId: string): Promise<LeaveApproverInfo | null> {
    try {
      const { data, error } = await supabase
        .rpc('get_leave_approver', { p_requester_id: requesterId })

      if (error) {
        console.error('[leaveRequestService] getApprover error:', error)
        return null
      }

      if (!data || data.length === 0) return null
      return data[0] as LeaveApproverInfo
    } catch (error) {
      console.error('[leaveRequestService] getApprover exception:', error)
      return null
    }
  },

  // ==========================================================================
  // LẤY ĐƠN THEO NHÂN VIÊN
  // ==========================================================================
  async getByEmployee(
    employeeId: string,
    status?: 'pending' | 'approved' | 'rejected' | 'cancelled',
    fromDate?: string,
    toDate?: string
  ): Promise<LeaveRequest[]> {
    try {
      let query = supabase
        .from('leave_requests')
        .select(LEAVE_SELECT)
        .eq('employee_id', employeeId)

      if (status) query = query.eq('status', status)
      if (fromDate) query = query.gte('start_date', fromDate)
      if (toDate) query = query.lte('end_date', toDate)

      const { data, error } = await query.order('created_at', { ascending: false })

      if (error) {
        console.error('[leaveRequestService] getByEmployee error:', error)
        return []
      }
      return data || []
    } catch (error) {
      console.error('[leaveRequestService] getByEmployee exception:', error)
      return []
    }
  },

  // ==========================================================================
  // LẤY DANH SÁCH ĐƠN CHỜ DUYỆT - THEO PHÂN CẤP CHỨC VỤ
  // ==========================================================================
  async getPendingApprovals(
    approverId: string,
    status?: 'pending' | 'approved' | 'rejected' | 'cancelled',
    fromDate?: string,
    toDate?: string
  ): Promise<LeaveRequest[]> {
    try {
      // ── STEP 1: Lấy thông tin người duyệt (SIMPLE - không nested) ──
      const { data: approver, error: approverError } = await supabase
        .from('employees')
        .select('id, department_id, position_id')
        .eq('id', approverId)
        .maybeSingle()

      if (approverError) {
        console.error('[leaveRequestService] Error fetching approver:', approverError)
        return []
      }

      if (!approver) {
        console.warn('[leaveRequestService] Approver not found')
        return []
      }

      // ── STEP 2: Lấy position level RIÊNG (tránh 406) ──
      let approverLevel = 7 // Default = nhân viên
      if (approver.position_id) {
        const { data: posData } = await supabase
          .from('positions')
          .select('level')
          .eq('id', approver.position_id)
          .maybeSingle()

        if (posData?.level) {
          approverLevel = posData.level
        }
      }

      const approverDeptId = approver.department_id
      console.log('[leaveRequestService] Approver level:', approverLevel, 'dept:', approverDeptId)

      // ── STEP 3: Xác định danh sách employee_id cần lọc ──
      let employeeIds: string[] = []

      if (approverLevel <= EXECUTIVE_MAX_LEVEL) {
        // ── EXECUTIVE (level 1-3): Xem TẤT CẢ đơn (trừ chính mình) ──
        employeeIds = []

      } else if (approverLevel <= MANAGER_MAX_LEVEL) {
        // ── MANAGER (level 4-5): Chỉ xem đơn nhân viên TRONG PHÒNG ──
        if (!approverDeptId) {
          console.warn('[leaveRequestService] Manager has no department')
          return []
        }

        const { data: deptEmployees } = await supabase
          .from('employees')
          .select('id')
          .eq('department_id', approverDeptId)
          .eq('status', 'active')
          .neq('id', approverId)

        if (deptEmployees && deptEmployees.length > 0) {
          employeeIds = deptEmployees.map(e => e.id)
        } else {
          console.log('[leaveRequestService] No employees in department')
          return []
        }

      } else {
        // ── NHÂN VIÊN (level 6-7): Không có quyền duyệt ──
        console.log('[leaveRequestService] Employee level - no approval rights')
        return []
      }

      // ── STEP 4: Query leave_requests với filter ──
      let query = supabase
        .from('leave_requests')
        .select(LEAVE_SELECT)

      // Filter status
      if (status) {
        query = query.eq('status', status)
      } else {
        query = query.eq('status', 'pending')
      }

      // Filter employee_id theo phân cấp
      if (employeeIds.length > 0) {
        query = query.in('employee_id', employeeIds)
      } else if (approverLevel <= EXECUTIVE_MAX_LEVEL) {
        query = query.neq('employee_id', approverId)
      }

      // Filter ngày nếu có
      if (fromDate) query = query.gte('start_date', fromDate)
      if (toDate) query = query.lte('end_date', toDate)

      const { data, error } = await query.order('created_at', { ascending: false })

      if (error) {
        console.error('[leaveRequestService] getPendingApprovals error:', error)
        return []
      }

      console.log(`[leaveRequestService] Found ${data?.length || 0} requests for approval`)
      return data || []
    } catch (error) {
      console.error('[leaveRequestService] getPendingApprovals exception:', error)
      return []
    }
  },

  // ==========================================================================
  // ĐẾM ĐƠN PENDING (cho badge sidebar)
  // ==========================================================================
  async getPendingCount(employeeId: string): Promise<number> {
    try {
      const { data: approver } = await supabase
        .from('employees')
        .select('id, department_id, position_id')
        .eq('id', employeeId)
        .maybeSingle()

      if (!approver) return 0

      let level = 7
      if (approver.position_id) {
        const { data: posData } = await supabase
          .from('positions')
          .select('level')
          .eq('id', approver.position_id)
          .maybeSingle()
        if (posData?.level) level = posData.level
      }

      // Employee → 0
      if (level > MANAGER_MAX_LEVEL) return 0

      // Executive → count tất cả pending (trừ mình)
      if (level <= EXECUTIVE_MAX_LEVEL) {
        const { count, error } = await supabase
          .from('leave_requests')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'pending')
          .neq('employee_id', employeeId)

        if (error) return 0
        return count || 0
      }

      // Manager → count pending trong phòng
      if (approver.department_id) {
        const { data: deptEmployees } = await supabase
          .from('employees')
          .select('id')
          .eq('department_id', approver.department_id)
          .eq('status', 'active')
          .neq('id', employeeId)

        if (!deptEmployees || deptEmployees.length === 0) return 0

        const employeeIds = deptEmployees.map(e => e.id)
        const { count, error } = await supabase
          .from('leave_requests')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'pending')
          .in('employee_id', employeeIds)

        if (error) return 0
        return count || 0
      }

      return 0
    } catch (error) {
      console.error('[leaveRequestService] getPendingCount error:', error)
      return 0
    }
  },

  // ==========================================================================
  // LẤY DANH SÁCH ĐƠN (có phân trang)
  // ==========================================================================
  async getAll(params: PaginationParams & { 
    status?: string, 
    employee_id?: string 
  }): Promise<PaginatedResponse<LeaveRequest>> {
    const { page = 1, pageSize = 10, status, employee_id, search } = params
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    let query = supabase
      .from('leave_requests')
      .select(LEAVE_SELECT, { count: 'exact' })

    if (status) {
      query = query.eq('status', status)
    }

    if (employee_id) {
      query = query.eq('employee_id', employee_id)
    }

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

  // ==========================================================================
  // LẤY CHI TIẾT
  // ==========================================================================
  async getById(id: string): Promise<LeaveRequest> {
    const { data, error } = await supabase
      .from('leave_requests')
      .select(LEAVE_SELECT)
      .eq('id', id)
      .single()

    if (error) throw error
    return data
  },

  // ==========================================================================
  // TẠO ĐƠN MỚI
  // ==========================================================================
  async create(formData: LeaveRequestFormData & { approver_id?: string }): Promise<LeaveRequest> {
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

  // ==========================================================================
  // CẬP NHẬT ĐƠN
  // ==========================================================================
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

  // ==========================================================================
  // XÓA ĐƠN
  // ==========================================================================
  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('leave_requests')
      .delete()
      .eq('id', id)

    if (error) throw error
  },

  // ==========================================================================
  // DUYỆT ĐƠN
  // ==========================================================================
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

  // ==========================================================================
  // TỪ CHỐI ĐƠN
  // ==========================================================================
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

  // ==========================================================================
  // HỦY ĐƠN (người tạo tự hủy)
  // ==========================================================================
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

  // ==========================================================================
  // DUYỆT / TỪ CHỐI HÀNG LOẠT
  // ==========================================================================
  async batchApprove(ids: string[], approverId: string): Promise<LeaveBatchResult> {
    const result: LeaveBatchResult = { success: 0, failed: 0, errors: [] }

    for (const id of ids) {
      try {
        await this.approve(id, approverId)
        result.success++
      } catch (error) {
        result.failed++
        result.errors.push({ id, error: (error as Error).message })
      }
    }

    return result
  },

  async batchReject(ids: string[], approverId: string, notes: string): Promise<LeaveBatchResult> {
    const result: LeaveBatchResult = { success: 0, failed: 0, errors: [] }

    for (const id of ids) {
      try {
        await this.reject(id, approverId, notes)
        result.success++
      } catch (error) {
        result.failed++
        result.errors.push({ id, error: (error as Error).message })
      }
    }

    return result
  },

  // ==========================================================================
  // ★ LỊCH SỬ DUYỆT - FIX: Method bị thiếu gây crash LeaveApprovalPage
  // ==========================================================================
  async getApprovalHistory(
    approverId: string,
    limit: number = 20
  ): Promise<LeaveRequest[]> {
    try {
      const { data, error } = await supabase
        .from('leave_requests')
        .select(LEAVE_SELECT)
        .eq('approved_by', approverId)
        .in('status', ['approved', 'rejected'])
        .order('approved_at', { ascending: false })
        .limit(limit)

      if (error) {
        console.error('[leaveRequestService] getApprovalHistory error:', error)
        return []
      }
      return data || []
    } catch (error) {
      console.error('[leaveRequestService] getApprovalHistory exception:', error)
      return []
    }
  },

  // ==========================================================================
  // TẠO MÃ ĐƠN TỰ ĐỘNG
  // ==========================================================================
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

  // ==========================================================================
  // LẤY ĐƠN NGHỈ CHỜ DUYỆT (legacy - dùng getPendingApprovals thay thế)
  // ==========================================================================
  async getPendingRequests(): Promise<LeaveRequest[]> {
    const { data, error } = await supabase
      .from('leave_requests')
      .select(LEAVE_SELECT)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })

    if (error) throw error
    return data || []
  }
}

export default leaveRequestService