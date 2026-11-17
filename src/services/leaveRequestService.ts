import { supabase } from '../lib/supabase'
import { eachDayStr } from '../utils/dateVN'

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
  code?: string
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
  // ★ Trường công tác (Phương án C)
  trip_destination?: string
  trip_purpose?: string
  trip_with?: string
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
  // ★ Trường công tác
  trip_destination?: string
  trip_purpose?: string
  trip_with?: string
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

// ★ Một đơn công tác như BusinessTripPage hiển thị
export interface BusinessTripRow {
  id: string
  employee_id: string
  request_number: string
  start_date: string
  end_date: string
  total_days: number
  trip_destination: string
  trip_purpose: string
  trip_with: string
  reason: string
  status: string
  created_by: string
  created_at: string
  employee?: { id: string; code: string; full_name: string }
  creator?: { id: string; full_name: string }
}

export interface BusinessTripEmployee {
  id: string
  code: string
  full_name: string
  department_id: string
}

// ★ Input tạo đơn công tác (BusinessTripPage) — 1 đơn cho mỗi nhân viên được chọn
export interface BusinessTripCreateInput {
  employee_ids: string[]
  start_date: string
  end_date: string
  total_days: number
  trip_destination: string
  trip_purpose: string
  trip_with: string
  reason: string
  created_by: string
  creator_name: string
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
  leave_type:leave_types!leave_requests_leave_type_id_fkey(id, code, name, color),
  approver:employees!leave_requests_approved_by_fkey(id, full_name)
`

// Select cho màn Đơn công tác (người được gán + người gán)
const BUSINESS_TRIP_SELECT = `
  *,
  employee:employees!leave_requests_employee_id_fkey(id, code, full_name),
  creator:employees!leave_requests_approved_by_fkey(id, full_name)
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

      // Lỗi đọc ≠ "không có đơn": ném lên để LeaveApprovalPage hiện khối lỗi + Thử lại
      if (approverError) {
        console.error('[leaveRequestService] Error fetching approver:', approverError)
        throw approverError
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
        throw error
      }

      console.log(`[leaveRequestService] Found ${data?.length || 0} requests for approval`)
      return data || []
    } catch (error) {
      console.error('[leaveRequestService] getPendingApprovals exception:', error)
      throw error
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

    // ★ Thông báo TP/PP: có đơn phép mới
    try {
      const { notifyDeptManagers } = await import('./notificationHelper')
      const { data: emp } = await supabase.from('employees').select('department_id, full_name').eq('id', formData.employee_id).single()
      if (emp?.department_id) {
        await notifyDeptManagers(emp.department_id, {
          module: 'leave',
          type: 'leave_submitted',
          title: `Đơn nghỉ phép mới: ${emp.full_name}`,
          message: `${formData.start_date} → ${formData.end_date} (${formData.total_days} ngày)`,
          referenceUrl: '/leave-requests',
        })
      }
    } catch (e) { console.error('[notify] leave created error:', e) }

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
      .select(LEAVE_SELECT)
      .single()

    if (error) {
      // PGRST116 = "Cannot coerce the result to a single JSON object"
      // → UPDATE return 0 rows (RLS chặn hoặc id sai)
      if (error.code === 'PGRST116') {
        throw new Error('Bạn không có quyền duyệt đơn nghỉ phép này (chỉ Trưởng/Phó phòng cùng phòng hoặc BGĐ).')
      }
      throw error
    }

    // ★ Auto-attendance cho công tác
    await this._createBusinessTripAttendance(data)

    // ★ Xóa shift_assignment + ghi attendance "leave" cho ngày nghỉ phép
    await this._applyLeaveToSchedule(data)

    // ★ Thông báo cho NV: đơn được duyệt
    try {
      const { notify } = await import('./notificationHelper')
      await notify({
        recipientId: data.employee_id,
        senderId: approverId,
        module: 'leave',
        type: 'leave_approved',
        title: 'Đơn nghỉ phép đã được duyệt',
        message: `Từ ${data.start_date} đến ${data.end_date} (${data.total_days} ngày)`,
        referenceUrl: '/leave-requests',
      })
    } catch (e) { console.error('[notify] leave approved error:', e) }

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

    if (error) {
      if (error.code === 'PGRST116') {
        throw new Error('Bạn không có quyền từ chối đơn nghỉ phép này.')
      }
      throw error
    }

    // ★ Thông báo cho NV: đơn bị từ chối
    try {
      const { notify } = await import('./notificationHelper')
      await notify({
        recipientId: data.employee_id,
        senderId: approverId,
        module: 'leave',
        type: 'leave_rejected',
        title: 'Đơn nghỉ phép bị từ chối',
        message: notes || 'Không có ghi chú',
        referenceUrl: '/leave-requests',
        priority: 'high',
      })
    } catch (e) { console.error('[notify] leave rejected error:', e) }

    return data
  },

  // ==========================================================================
  // HỦY ĐƠN (người tạo tự hủy)
  // ==========================================================================
  async cancel(id: string): Promise<LeaveRequest> {
    // Lấy đơn trước để xóa attendance nếu là công tác đã duyệt
    const existing = await this.getById(id)

    const { data, error } = await supabase
      .from('leave_requests')
      .update({ status: 'cancelled' })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    // ★ Xóa attendance business_trip nếu đơn đã duyệt bị hủy
    if (existing.status === 'approved') {
      await this._deleteBusinessTripAttendance(existing.employee_id, existing.start_date, existing.end_date)
    }

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
        throw error
      }
      return data || []
    } catch (error) {
      console.error('[leaveRequestService] getApprovalHistory exception:', error)
      throw error
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
  },

  // ==========================================================================
  // ★ ĐƠN CÔNG TÁC (BusinessTripPage) — MỘT nguồn tạo/sửa/xoá đơn + attendance,
  //   tái dùng _createBusinessTripAttendance / _deleteBusinessTripAttendance.
  //   (Bản inline cũ trong page tính ngày bằng toISOString → attendance lùi
  //   1 ngày, xoá đơn để sót dòng mồ côi — audit 17/11/2026.)
  // ==========================================================================
  async createBusinessTrips(params: BusinessTripCreateInput): Promise<void> {
    const { data: typeRow } = await supabase
      .from('leave_types')
      .select('id')
      .eq('code', 'BUSINESS_TRIP')
      .maybeSingle()
    const typeId = typeRow?.id
    if (!typeId) throw new Error('Loại phép "Công tác" chưa được cấu hình')

    // Mã đơn CT{year}-NNNN (công tác đánh số riêng, khác NP của nghỉ phép)
    const year = new Date().getFullYear()
    const { data: last } = await supabase
      .from('leave_requests')
      .select('request_number')
      .ilike('request_number', `CT${year}%`)
      .order('request_number', { ascending: false })
      .limit(1)
    let nextNum = last && last.length > 0 ? parseInt(last[0].request_number.slice(-4)) + 1 : 1

    const startVN = new Date(params.start_date + 'T00:00:00+07:00').toLocaleDateString('vi-VN')
    const endVN = new Date(params.end_date + 'T00:00:00+07:00').toLocaleDateString('vi-VN')

    for (const empId of params.employee_ids) {
      const requestNumber = `CT${year}-${String(nextNum++).padStart(4, '0')}`

      // Tạo đơn — TP/PP tạo = auto approved
      const { error: insertError } = await supabase
        .from('leave_requests')
        .insert({
          employee_id: empId,
          leave_type_id: typeId,
          request_number: requestNumber,
          start_date: params.start_date,
          end_date: params.end_date,
          total_days: params.total_days,
          trip_destination: params.trip_destination,
          trip_purpose: params.trip_purpose,
          trip_with: params.trip_with,
          reason: params.reason || `Công tác: ${params.trip_destination}`,
          status: 'approved',
          approved_by: params.created_by,
          approved_at: new Date().toISOString(),
        })
      if (insertError) throw insertError

      // Attendance business_trip — cùng một nguồn với luồng duyệt đơn nghỉ phép
      await this._createBusinessTripAttendance({
        employee_id: empId,
        start_date: params.start_date,
        end_date: params.end_date,
        trip_destination: params.trip_destination,
        trip_purpose: params.trip_purpose,
        leave_type: { code: 'BUSINESS_TRIP' },
      })

      // Thông báo cho NV được gán
      try {
        const { notify } = await import('./notificationHelper')
        await notify({
          recipientId: empId,
          senderId: params.created_by,
          module: 'attendance',
          type: 'attendance_business_trip',
          title: `Bạn được gán đi công tác: ${params.trip_destination}`,
          message: `${params.creator_name} đã gán bạn đi công tác ${params.trip_destination} từ ${startVN} đến ${endVN} (${params.total_days} ngày).${params.trip_purpose ? ' Mục đích: ' + params.trip_purpose : ''}`,
          referenceUrl: '/attendance/business-trips',
          priority: 'normal',
        })
      } catch (e) {
        console.error('[leaveRequestService] business trip notify error:', e)
      }
    }
  },

  async updateBusinessTrip(id: string, changes: {
    trip_destination: string
    trip_purpose: string
    trip_with: string
    start_date: string
    end_date: string
  }): Promise<void> {
    const { data: trip } = await supabase
      .from('leave_requests')
      .select('employee_id, start_date, end_date')
      .eq('id', id)
      .single()
    if (!trip) throw new Error('Không tìm thấy đơn công tác')

    const datesChanged = trip.start_date !== changes.start_date || trip.end_date !== changes.end_date
    const newTotalDays = Math.max(1, eachDayStr(changes.start_date, changes.end_date).length)

    const { error } = await supabase
      .from('leave_requests')
      .update({
        trip_destination: changes.trip_destination,
        trip_purpose: changes.trip_purpose,
        trip_with: changes.trip_with,
        start_date: changes.start_date,
        end_date: changes.end_date,
        total_days: newTotalDays,
        reason: `Công tác: ${changes.trip_destination}`,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
    if (error) throw error

    if (datesChanged) {
      // Xoá attendance theo KHOẢNG CŨ rồi tạo lại theo khoảng mới — không để dòng mồ côi
      await this._deleteBusinessTripAttendance(trip.employee_id, trip.start_date, trip.end_date)
      await this._createBusinessTripAttendance({
        employee_id: trip.employee_id,
        start_date: changes.start_date,
        end_date: changes.end_date,
        trip_destination: changes.trip_destination,
        trip_purpose: changes.trip_purpose,
        leave_type: { code: 'BUSINESS_TRIP' },
      })
    } else {
      // Ngày không đổi → chỉ cập nhật ghi chú attendance
      await supabase
        .from('attendance')
        .update({ notes: `Công tác: ${changes.trip_destination} — ${changes.trip_purpose || ''}`.trim() })
        .eq('employee_id', trip.employee_id)
        .eq('status', 'business_trip')
        .gte('date', changes.start_date)
        .lte('date', changes.end_date)
    }
  },

  async deleteBusinessTrip(id: string): Promise<void> {
    const { data: trip } = await supabase
      .from('leave_requests')
      .select('employee_id, start_date, end_date')
      .eq('id', id)
      .single()
    if (!trip) throw new Error('Không tìm thấy đơn công tác')

    // Xoá attendance business_trip đúng khoảng ngày của đơn
    await this._deleteBusinessTripAttendance(trip.employee_id, trip.start_date, trip.end_date)

    const { error } = await supabase.from('leave_requests').delete().eq('id', id)
    if (error) throw error
  },

  /**
   * Danh sách đơn công tác cho BusinessTripPage (chuyển từ query inline trong trang).
   * NV thường: đơn của mình. TP/PP/BGĐ: đơn của NV đang làm trong phòng (không lọc nếu phòng trống — như bản cũ).
   * Lỗi đọc → NÉM lên để trang hiện khối lỗi, không giả làm "Chưa có đơn công tác".
   */
  async getBusinessTrips(employeeId: string, isManager: boolean, departmentId: string | null): Promise<BusinessTripRow[]> {
    const { data: typeRow, error: typeErr } = await supabase
      .from('leave_types')
      .select('id')
      .eq('code', 'BUSINESS_TRIP')
      .maybeSingle()
    if (typeErr) throw typeErr
    if (!typeRow?.id) return []

    let query = supabase
      .from('leave_requests')
      .select(BUSINESS_TRIP_SELECT)
      .eq('leave_type_id', typeRow.id)
      .in('status', ['approved', 'pending'])
      .order('created_at', { ascending: false })

    if (!isManager) {
      // NV chỉ xem của mình
      query = query.eq('employee_id', employeeId)
    } else if (departmentId) {
      // Manager: xem NV trong phòng
      const { data: deptEmps, error: deptErr } = await supabase
        .from('employees')
        .select('id')
        .eq('department_id', departmentId)
        .eq('status', 'active')
      if (deptErr) throw deptErr
      if (deptEmps && deptEmps.length > 0) {
        query = query.in('employee_id', deptEmps.map(e => e.id))
      }
    }

    const { data, error } = await query
    if (error) throw error
    return (data || []) as unknown as BusinessTripRow[]
  },

  /** NV có thể gán công tác: BGĐ (level ≤ 3) thấy toàn công ty, TP/PP chỉ phòng mình. */
  async getBusinessTripEmployees(departmentId: string | null, userLevel: number): Promise<BusinessTripEmployee[]> {
    let query = supabase
      .from('employees')
      .select('id, code, full_name, department_id')
      .eq('status', 'active')
      .order('full_name')
    if (departmentId && userLevel > 3) {
      query = query.eq('department_id', departmentId)
    }
    const { data, error } = await query
    if (error) throw error
    return (data || []) as BusinessTripEmployee[]
  },

  // ==========================================================================
  // ★ AUTO-ATTENDANCE CHO CÔNG TÁC (khi duyệt đơn)
  // ==========================================================================
  async _createBusinessTripAttendance(request: any): Promise<void> {
    try {
      // Lấy leave_type code
      const leaveType = Array.isArray(request.leave_type) ? request.leave_type[0] : request.leave_type
      if (!leaveType || leaveType.code !== 'BUSINESS_TRIP') return

      // Duyệt ngày thuần lịch (dateVN.eachDayStr) — không đi qua Date/toISOString nên không lệch múi giờ
      for (const dateStr of eachDayStr(request.start_date, request.end_date)) {
        // Kiểm tra đã có attendance cho ngày này chưa
        const { data: existing } = await supabase
          .from('attendance')
          .select('id')
          .eq('employee_id', request.employee_id)
          .eq('date', dateStr)
          .maybeSingle()

        if (existing) continue // Không ghi đè nếu đã có (VD: đã check-in)

        // Tạo attendance record
        const notes = `Công tác: ${request.trip_destination || ''} — ${request.trip_purpose || ''}`
        await supabase.from('attendance').insert({
          employee_id: request.employee_id,
          date: dateStr,
          status: 'business_trip',
          work_units: 1.0,
          working_minutes: 480, // 8h chuẩn
          notes: notes.trim(),
          check_in_time: dateStr + 'T08:00:00+07:00',
          check_out_time: dateStr + 'T17:00:00+07:00',
        })
      }

      console.log(`[leaveRequestService] Created business_trip attendance for ${request.employee_id}: ${request.start_date} → ${request.end_date}`)
    } catch (error) {
      console.error('[leaveRequestService] _createBusinessTripAttendance error:', error)
    }
  },

  // ==========================================================================
  // ★ XÓA ATTENDANCE CÔNG TÁC (khi hủy đơn đã duyệt)
  // ==========================================================================
  // ==========================================================================
  // ★ NGHỈ PHÉP → XÓA SHIFT + TẠO ATTENDANCE "leave"
  // ==========================================================================
  async _applyLeaveToSchedule(request: any): Promise<void> {
    try {
      const leaveType = Array.isArray(request.leave_type) ? request.leave_type[0] : request.leave_type
      // Công tác đã xử lý riêng
      if (leaveType?.code === 'BUSINESS_TRIP') return

      const startDate = new Date(request.start_date + 'T00:00:00+07:00')
      const endDate = new Date(request.end_date + 'T00:00:00+07:00')

      for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        // Format local date (không dùng toISOString vì nó trả UTC → lùi 1 ngày ở VN timezone)
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

        // Xóa shift_assignment ngày đó
        await supabase
          .from('shift_assignments')
          .delete()
          .eq('employee_id', request.employee_id)
          .eq('date', dateStr)

        // Tạo attendance "leave" nếu chưa có
        const { data: existing } = await supabase
          .from('attendance')
          .select('id')
          .eq('employee_id', request.employee_id)
          .eq('date', dateStr)
          .maybeSingle()

        if (!existing) {
          await supabase.from('attendance').insert({
            employee_id: request.employee_id,
            date: dateStr,
            status: 'leave',
            work_units: 0,
            working_minutes: 0,
            notes: `Nghỉ phép: ${leaveType?.name || 'N/A'}`,
          })
        }
      }

      console.log(`[leaveRequestService] Applied leave to schedule: ${request.employee_id} ${request.start_date} → ${request.end_date}`)
    } catch (error) {
      console.error('[leaveRequestService] _applyLeaveToSchedule error:', error)
    }
  },

  async _deleteBusinessTripAttendance(employeeId: string, startDate: string, endDate: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('attendance')
        .delete()
        .eq('employee_id', employeeId)
        .eq('status', 'business_trip')
        .gte('date', startDate)
        .lte('date', endDate)

      if (error) {
        console.error('[leaveRequestService] _deleteBusinessTripAttendance error:', error)
      } else {
        console.log(`[leaveRequestService] Deleted business_trip attendance for ${employeeId}: ${startDate} → ${endDate}`)
      }
    } catch (error) {
      console.error('[leaveRequestService] _deleteBusinessTripAttendance exception:', error)
    }
  }
}

export default leaveRequestService