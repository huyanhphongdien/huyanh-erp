// ============================================================================
// LEAVE REQUEST SERVICE - WITH APPROVAL FLOW
// File: src/services/leaveRequestService.ts
// Huy Anh ERP System
// ============================================================================
// CẬP NHẬT: Thêm luồng phê duyệt theo phân cấp chức vụ
//   - Nhân viên (level 6-7) → Trưởng/Phó phòng (level 4-5) cùng phòng duyệt
//   - Trưởng/Phó phòng (level 4-5) → Ban Giám đốc (level 1-3) duyệt
//   - Ban Giám đốc (level 1-3) → Giám đốc duyệt hoặc tự duyệt
// Pattern tham chiếu: overtimeRequestService.getPendingApprovals()
// ============================================================================

import { supabase } from '../lib/supabase'

// ============================================================================
// TYPES
// ============================================================================

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
  approved_by?: string
  approved_at?: string
  approval_notes?: string
  created_at: string
  updated_at: string
  // Relations
  employee?: {
    id: string
    code: string
    full_name: string
    department_id?: string
    department?: { id: string; name: string } | null
    position?: { name: string; level: number } | null
  } | null
  leave_type?: { id: string; name: string; color: string } | null
  approver?: { id: string; code: string; full_name: string } | null
}

export interface LeaveRequestFormData {
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

// ============================================================================
// CONSTANTS
// ============================================================================

// Position level thresholds
const EXECUTIVE_MAX_LEVEL = 3  // Level 1-3: GĐ, TLGĐ, PGĐ
const MANAGER_MAX_LEVEL = 5    // Level 4-5: Trưởng phòng, Phó phòng
// Level 6-7: Nhân viên, Thực tập sinh

// Select query with relations
const LEAVE_REQUEST_SELECT = `
  *,
  employee:employees!employee_id(
    id, code, full_name, department_id,
    department:departments!department_id(id, name),
    position:positions!position_id(name, level)
  ),
  leave_type:leave_types!leave_type_id(id, name, color),
  approver:employees!approved_by(id, code, full_name)
`

// ============================================================================
// SERVICE
// ============================================================================

export const leaveRequestService = {

  // ==========================================================================
  // LẤY DANH SÁCH ĐƠN NGHỈ PHÉP (CÓ PHÂN TRANG) - CHO NHÂN VIÊN XEM CỦA MÌNH
  // ==========================================================================
  async getAll(params: PaginationParams & { 
    status?: string, 
    employee_id?: string,
    department_id?: string
  }): Promise<PaginatedResponse<LeaveRequest>> {
    const { page = 1, pageSize = 10, status, employee_id, department_id, search } = params
    console.log('[leaveRequestService.getAll] params:', { page, pageSize, status, employee_id, department_id })
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    let query = supabase
      .from('leave_requests')
      .select(LEAVE_REQUEST_SELECT, { count: 'exact' })

    if (status) {
      query = query.eq('status', status)
    }

    if (employee_id) {
      query = query.eq('employee_id', employee_id)
    }

    // Lọc theo phòng ban (dành cho Manager chỉ xem phòng mình)
    if (department_id) {
      // Lấy danh sách employee_id trong phòng
      const { data: deptEmployees } = await supabase
        .from('employees')
        .select('id')
        .eq('department_id', department_id)
        .eq('status', 'active')

      if (deptEmployees && deptEmployees.length > 0) {
        const empIds = deptEmployees.map(e => e.id)
        query = query.in('employee_id', empIds)
      } else {
        // Không có nhân viên trong phòng → trả rỗng
        return { data: [], total: 0, page, pageSize, totalPages: 0 }
      }
    }

    if (search) {
      query = query.ilike('request_number', `%${search}%`)
    }

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, to)

    if (error) {
      console.error('[leaveRequestService.getAll] error:', error)
      throw error
    }
    console.log('[leaveRequestService.getAll] results:', data?.length, 'total:', count)

    return {
      data: data || [],
      total: count || 0,
      page,
      pageSize,
      totalPages: Math.ceil((count || 0) / pageSize)
    }
  },

  // ==========================================================================
  // LẤY DANH SÁCH ĐƠN CHỜ DUYỆT - THEO PHÂN CẤP CHỨC VỤ
  // ==========================================================================
  // Logic giống overtimeRequestService.getPendingApprovals():
  //   - Manager (level 4-5): Chỉ xem đơn của nhân viên trong phòng mình
  //     + Chỉ xem đơn của nhân viên (level 6-7), KHÔNG xem đơn của manager khác
  //   - Executive (level 1-3): Xem đơn của Trưởng/Phó phòng (level 4-5)
  //     + Cũng có thể xem tất cả nếu cần
  // ==========================================================================
  async getPendingApprovals(
    approverId: string,
    status?: 'pending' | 'approved' | 'rejected' | 'cancelled',
    fromDate?: string,
    toDate?: string
  ): Promise<LeaveRequest[]> {
    try {
      // 1. Lấy thông tin người duyệt
      const { data: approver, error: approverError } = await supabase
        .from('employees')
        .select(`
          id, department_id,
          position:positions!position_id(level)
        `)
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

      const approverLevel = (approver.position as any)?.level || 7
      const approverDeptId = approver.department_id

      console.log('[leaveRequestService] Approver level:', approverLevel, 'dept:', approverDeptId)

      // 2. Xác định danh sách employee_id cần lọc dựa trên phân cấp
      let employeeIds: string[] = []

      if (approverLevel <= EXECUTIVE_MAX_LEVEL) {
        // ── EXECUTIVE (level 1-3): CHỈ xem đơn của Trưởng/Phó phòng (level 4-5) ──
        // Đơn của nhân viên (level 6-7) phải đi qua Manager phòng trước
        const { data: managers } = await supabase
          .from('employees')
          .select(`
            id,
            position:positions!position_id(level)
          `)
          .eq('status', 'active')
          .neq('id', approverId)

        if (managers && managers.length > 0) {
          // Chỉ lấy manager level 4-5
          const managerIds = managers
            .filter(emp => {
              const level = (emp.position as any)?.level
              return level && level >= 4 && level <= MANAGER_MAX_LEVEL
            })
            .map(emp => emp.id)

          if (managerIds.length > 0) {
            employeeIds = managerIds
          } else {
            return []
          }
        } else {
          return []
        }
      } else if (approverLevel <= MANAGER_MAX_LEVEL) {
        // ── MANAGER (level 4-5): Chỉ xem đơn nhân viên TRONG PHÒNG ──
        if (!approverDeptId) {
          console.warn('[leaveRequestService] Manager has no department')
          return []
        }

        // Lấy danh sách nhân viên trong phòng
        const { data: deptEmployees } = await supabase
          .from('employees')
          .select('id')
          .eq('department_id', approverDeptId)
          .eq('status', 'active')
          .neq('id', approverId) // Loại trừ chính mình

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

      // 3. Build query
      let query = supabase
        .from('leave_requests')
        .select(LEAVE_REQUEST_SELECT)

      // Filter theo danh sách nhân viên (nếu có)
      if (employeeIds.length > 0) {
        query = query.in('employee_id', employeeIds)
      } else if (approverLevel <= EXECUTIVE_MAX_LEVEL) {
        // Executive xem tất cả, chỉ loại trừ chính mình
        query = query.neq('employee_id', approverId)
      }

      // Filter theo status
      if (status) {
        query = query.eq('status', status)
      }

      // Filter theo ngày
      if (fromDate) {
        query = query.gte('start_date', fromDate)
      }
      if (toDate) {
        query = query.lte('start_date', toDate)
      }

      const { data, error } = await query
        .order('created_at', { ascending: false })

      if (error) {
        console.error('[leaveRequestService] Error fetching leave requests:', error)
        return []
      }

      console.log(`[leaveRequestService] Found ${data?.length || 0} requests for approval`)
      return data || []
    } catch (error) {
      console.error('[leaveRequestService] getPendingApprovals error:', error)
      return []
    }
  },

  // ==========================================================================
  // ĐẾM SỐ ĐƠN CHỜ DUYỆT (cho badge sidebar)
  // ==========================================================================
  async getPendingCount(approverId: string): Promise<number> {
    try {
      const pendingList = await this.getPendingApprovals(approverId, 'pending')
      return pendingList.length
    } catch (error) {
      console.error('[leaveRequestService] getPendingCount error:', error)
      return 0
    }
  },

  // ==========================================================================
  // LẤY CHI TIẾT ĐƠN
  // ==========================================================================
  async getById(id: string): Promise<LeaveRequest> {
    const { data, error } = await supabase
      .from('leave_requests')
      .select(LEAVE_REQUEST_SELECT)
      .eq('id', id)
      .single()

    if (error) throw error
    return data
  },

  // ==========================================================================
  // TẠO ĐƠN MỚI
  // ==========================================================================
  async create(formData: LeaveRequestFormData): Promise<LeaveRequest> {
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
  // DUYỆT ĐƠN - CÓ KIỂM TRA QUYỀN
  // ==========================================================================
  async approve(id: string, approverId: string, notes?: string): Promise<LeaveRequest> {
    // Kiểm tra quyền trước khi duyệt
    const canApprove = await this.checkApprovalPermission(id, approverId)
    if (!canApprove.allowed) {
      throw new Error(canApprove.reason || 'Bạn không có quyền duyệt đơn này')
    }

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
  // TỪ CHỐI ĐƠN - CÓ KIỂM TRA QUYỀN
  // ==========================================================================
  async reject(id: string, approverId: string, notes: string): Promise<LeaveRequest> {
    // Kiểm tra quyền trước khi từ chối
    const canApprove = await this.checkApprovalPermission(id, approverId)
    if (!canApprove.allowed) {
      throw new Error(canApprove.reason || 'Bạn không có quyền từ chối đơn này')
    }

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
  // HỦY ĐƠN (NGƯỜI TẠO TỰ HỦY)
  // ==========================================================================
  async cancel(id: string, employeeId?: string): Promise<LeaveRequest> {
    let query = supabase
      .from('leave_requests')
      .update({ status: 'cancelled' })
      .eq('id', id)
      .eq('status', 'pending') // Chỉ hủy đơn đang chờ duyệt

    // Nếu truyền employeeId, kiểm tra quyền sở hữu
    if (employeeId) {
      query = query.eq('employee_id', employeeId)
    }

    const { data, error } = await query
      .select()
      .single()

    if (error) {
      console.error('[leaveRequestService.cancel] error:', error)
      throw new Error('Không thể hủy đơn. Có thể đơn đã được xử lý hoặc bạn không có quyền.')
    }
    return data
  },

  // ==========================================================================
  // DUYỆT HÀNG LOẠT
  // ==========================================================================
  async batchApprove(
    ids: string[], 
    approverId: string, 
    notes?: string
  ): Promise<{ success: number; failed: number; errors: { id: string; error: string }[] }> {
    let success = 0
    let failed = 0
    const errors: { id: string; error: string }[] = []

    for (const id of ids) {
      try {
        await this.approve(id, approverId, notes)
        success++
      } catch (err: any) {
        failed++
        errors.push({ id, error: err.message || 'Lỗi không xác định' })
      }
    }

    return { success, failed, errors }
  },

  // ==========================================================================
  // TỪ CHỐI HÀNG LOẠT
  // ==========================================================================
  async batchReject(
    ids: string[], 
    approverId: string, 
    notes: string
  ): Promise<{ success: number; failed: number; errors: { id: string; error: string }[] }> {
    let success = 0
    let failed = 0
    const errors: { id: string; error: string }[] = []

    for (const id of ids) {
      try {
        await this.reject(id, approverId, notes)
        success++
      } catch (err: any) {
        failed++
        errors.push({ id, error: err.message || 'Lỗi không xác định' })
      }
    }

    return { success, failed, errors }
  },

  // ==========================================================================
  // KIỂM TRA QUYỀN DUYỆT ĐƠN
  // ==========================================================================
  // Logic:
  //   - Nhân viên (6-7) tạo đơn → Trưởng/Phó phòng (4-5) CÙNG PHÒNG duyệt
  //   - Trưởng/Phó phòng (4-5) tạo đơn → Ban Giám đốc (1-3) duyệt
  //   - PGĐ/TLGĐ (2-3) tạo đơn → Giám đốc (1) duyệt
  //   - Không thể tự duyệt đơn của mình
  // ==========================================================================
  async checkApprovalPermission(
    leaveRequestId: string, 
    approverId: string
  ): Promise<{ allowed: boolean; reason?: string }> {
    try {
      // 1. Lấy thông tin đơn nghỉ phép + nhân viên tạo đơn
      const { data: request, error: reqError } = await supabase
        .from('leave_requests')
        .select(`
          id, employee_id,
          employee:employees!employee_id(
            id, department_id,
            position:positions!position_id(level)
          )
        `)
        .eq('id', leaveRequestId)
        .maybeSingle()

      if (reqError || !request) {
        return { allowed: false, reason: 'Không tìm thấy đơn nghỉ phép' }
      }

      // 2. Không thể tự duyệt
      if (request.employee_id === approverId) {
        return { allowed: false, reason: 'Không thể tự duyệt đơn của mình' }
      }

      // 3. Lấy thông tin người duyệt
      const { data: approver, error: appError } = await supabase
        .from('employees')
        .select(`
          id, department_id,
          position:positions!position_id(level)
        `)
        .eq('id', approverId)
        .maybeSingle()

      if (appError || !approver) {
        return { allowed: false, reason: 'Không tìm thấy thông tin người duyệt' }
      }

      const requesterLevel = (request.employee as any)?.position?.level || 7
      const requesterDeptId = (request.employee as any)?.department_id
      const approverLevel = (approver.position as any)?.level || 7
      const approverDeptId = approver.department_id

      // 4. Nhân viên (level 6-7) → Trưởng/Phó phòng (4-5) CÙNG PHÒNG
      if (requesterLevel > MANAGER_MAX_LEVEL) {
        // Người duyệt phải là Manager (4-5) hoặc Executive (1-3)
        if (approverLevel > MANAGER_MAX_LEVEL) {
          return { allowed: false, reason: 'Chỉ Trưởng/Phó phòng hoặc Ban Giám đốc mới được duyệt' }
        }
        // Nếu người duyệt là Manager, phải cùng phòng
        if (approverLevel >= 4 && approverLevel <= MANAGER_MAX_LEVEL) {
          if (approverDeptId !== requesterDeptId) {
            return { allowed: false, reason: 'Trưởng/Phó phòng chỉ duyệt đơn nhân viên trong phòng mình' }
          }
        }
        return { allowed: true }
      }

      // 5. Trưởng/Phó phòng (level 4-5) → Ban Giám đốc (1-3)
      if (requesterLevel >= 4 && requesterLevel <= MANAGER_MAX_LEVEL) {
        if (approverLevel > EXECUTIVE_MAX_LEVEL) {
          return { allowed: false, reason: 'Đơn của Trưởng/Phó phòng cần Ban Giám đốc duyệt' }
        }
        return { allowed: true }
      }

      // 6. PGĐ/TLGĐ (level 2-3) → Giám đốc (level 1)
      if (requesterLevel >= 2 && requesterLevel <= EXECUTIVE_MAX_LEVEL) {
        if (approverLevel > 1) {
          return { allowed: false, reason: 'Đơn của Phó GĐ/Trợ lý GĐ cần Giám đốc duyệt' }
        }
        return { allowed: true }
      }

      // 7. Giám đốc (level 1) → Tự xác nhận
      if (requesterLevel === 1) {
        return { allowed: true }
      }

      return { allowed: false, reason: 'Không xác định được quyền duyệt' }
    } catch (error) {
      console.error('[leaveRequestService] checkApprovalPermission error:', error)
      return { allowed: false, reason: 'Lỗi kiểm tra quyền' }
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
  // LẤY ĐƠN NGHỈ CHỜ DUYỆT (LEGACY - GIỮ LẠI ĐỂ KHÔNG BREAK CODE CŨ)
  // ==========================================================================
  async getPendingRequests(): Promise<LeaveRequest[]> {
    const { data, error } = await supabase
      .from('leave_requests')
      .select(LEAVE_REQUEST_SELECT)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })

    if (error) throw error
    return data || []
  },

  // ==========================================================================
  // LẤY LỊCH SỬ DUYỆT (ĐÃ XỬ LÝ)
  // ==========================================================================
  // Trả về các đơn mà approverId đã duyệt/từ chối trong N ngày gần nhất
  // ==========================================================================
  async getApprovalHistory(
    approverId: string,
    days: number = 30
  ): Promise<LeaveRequest[]> {
    try {
      const sinceDate = new Date()
      sinceDate.setDate(sinceDate.getDate() - days)

      const { data, error } = await supabase
        .from('leave_requests')
        .select(LEAVE_REQUEST_SELECT)
        .eq('approved_by', approverId)
        .in('status', ['approved', 'rejected'])
        .gte('approved_at', sinceDate.toISOString())
        .order('approved_at', { ascending: false })

      if (error) {
        console.error('[leaveRequestService] getApprovalHistory error:', error)
        return []
      }

      return data || []
    } catch (error) {
      console.error('[leaveRequestService] getApprovalHistory error:', error)
      return []
    }
  },

  // ==========================================================================
  // LẤY THỐNG KÊ CHO TRANG DUYỆT
  // ==========================================================================
  async getApprovalStats(approverId: string): Promise<{
    pending: number
    approved_this_month: number
    rejected_this_month: number
  }> {
    try {
      // Đếm pending (theo quyền)
      const pendingList = await this.getPendingApprovals(approverId, 'pending')
      
      // Đếm approved/rejected tháng này
      const startOfMonth = new Date()
      startOfMonth.setDate(1)
      startOfMonth.setHours(0, 0, 0, 0)

      const { data: approvedThisMonth } = await supabase
        .from('leave_requests')
        .select('id')
        .eq('status', 'approved')
        .eq('approved_by', approverId)
        .gte('approved_at', startOfMonth.toISOString())

      const { data: rejectedThisMonth } = await supabase
        .from('leave_requests')
        .select('id')
        .eq('status', 'rejected')
        .eq('approved_by', approverId)
        .gte('approved_at', startOfMonth.toISOString())

      return {
        pending: pendingList.length,
        approved_this_month: approvedThisMonth?.length || 0,
        rejected_this_month: rejectedThisMonth?.length || 0,
      }
    } catch (error) {
      console.error('[leaveRequestService] getApprovalStats error:', error)
      return { pending: 0, approved_this_month: 0, rejected_this_month: 0 }
    }
  }
}

export default leaveRequestService