// ============================================================================
// OVERTIME REQUEST SERVICE
// File: src/services/overtimeRequestService.ts
// Huy Anh ERP System - Chấm công V2 (Batch 4)
// ============================================================================
// Database table: overtime_requests
// Cột ngày: request_date (DATE)
// Trạng thái: pending | approved | rejected | completed
// ============================================================================

import { supabase } from '../lib/supabase'

// ============================================================================
// TYPES
// ============================================================================

export interface OvertimeRequest {
  id: string
  employee_id: string
  request_date: string
  shift_id?: string | null
  planned_start_time: string
  planned_end_time: string
  planned_minutes: number
  actual_start_time?: string | null
  actual_end_time?: string | null
  actual_minutes?: number | null
  reason: string
  status: 'pending' | 'approved' | 'rejected' | 'completed'
  approved_by?: string | null
  approved_at?: string | null
  rejection_reason?: string | null
  created_at: string
  updated_at: string
  // Relations (populated by select queries)
  employee?: {
    id: string
    code: string
    full_name: string
    department_id?: string
    department?: { id: string; name: string } | null
    position?: { name: string; level: number } | null
  } | null
  shift?: {
    id: string
    name: string
    code: string
    start_time: string
    end_time: string
    shift_category: string
} | null
    approver?: {        // ← THÊM ĐOẠN NÀY
    id: string
    full_name: string
  } | null
}

export interface CreateOvertimeInput {
  employee_id: string
  request_date: string
  shift_id?: string | null
  planned_start_time: string
  planned_end_time: string
  planned_minutes: number
  reason: string
}

export interface OvertimePaginationParams {
  page: number
  pageSize: number
  status?: string
  employee_id?: string
  department_id?: string
  from_date?: string
  to_date?: string
}

interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

// ============================================================================
// SELECT QUERY (dùng chung)
// ============================================================================

const OVERTIME_SELECT = `
  *,
  employee:employees!overtime_requests_employee_id_fkey(
    id, code, full_name, department_id,
    department:departments!employees_department_id_fkey(id, name),
    position:positions!employees_position_id_fkey(name, level)
  ),
  shift:shifts!overtime_requests_shift_id_fkey(
    id, name, code, start_time, end_time, shift_category
),
  approver:employees!overtime_requests_approved_by_fkey(
    id, full_name
  )
`

// ============================================================================
// SERVICE
// ============================================================================

export const overtimeRequestService = {

  // --------------------------------------------------------------------------
  // LẤY DANH SÁCH CÓ PHÂN TRANG + FILTER
  // --------------------------------------------------------------------------
  async getAll(params: OvertimePaginationParams): Promise<PaginatedResponse<OvertimeRequest>> {
    const { page = 1, pageSize = 10, status, employee_id, department_id, from_date, to_date } = params
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    let query = supabase
      .from('overtime_requests')
      .select(OVERTIME_SELECT, { count: 'exact' })

    // Filter theo trạng thái
    if (status && status !== 'all') {
      query = query.eq('status', status)
    }

    // Filter theo nhân viên
    if (employee_id) {
      query = query.eq('employee_id', employee_id)
    }

    // Filter theo khoảng ngày
    if (from_date) {
      query = query.gte('request_date', from_date)
    }
    if (to_date) {
      query = query.lte('request_date', to_date)
    }

    const { data, error, count } = await query
      .order('request_date', { ascending: false })
      .range(from, to)

    if (error) throw error

    // Filter theo phòng ban (client-side vì join nested)
    let filteredData = data || []
    if (department_id) {
      filteredData = filteredData.filter(
        (item: any) => item.employee?.department_id === department_id
      )
    }

    return {
      data: filteredData as OvertimeRequest[],
      total: count || 0,
      page,
      pageSize,
      totalPages: Math.ceil((count || 0) / pageSize),
    }
  },

  // --------------------------------------------------------------------------
  // LẤY PHIẾU TĂNG CA CỦA NHÂN VIÊN (cho trang danh sách cá nhân)
  // --------------------------------------------------------------------------
  async getMyRequests(
    employeeId: string,
    params: Omit<OvertimePaginationParams, 'employee_id' | 'department_id'> = { page: 1, pageSize: 10 }
  ): Promise<PaginatedResponse<OvertimeRequest>> {
    return this.getAll({
      ...params,
      employee_id: employeeId,
    })
  },

  // --------------------------------------------------------------------------
  // LẤY THEO ID
  // --------------------------------------------------------------------------
  async getById(id: string): Promise<OvertimeRequest> {
    const { data, error } = await supabase
      .from('overtime_requests')
      .select(OVERTIME_SELECT)
      .eq('id', id)
      .single()

    if (error) throw error
    return data as OvertimeRequest
  },

  // --------------------------------------------------------------------------
  // TẠO PHIẾU TĂNG CA MỚI
  // --------------------------------------------------------------------------
  async create(input: CreateOvertimeInput): Promise<OvertimeRequest> {
    // Validate: không tạo trùng ngày cho cùng nhân viên
    const { data: existing } = await supabase
      .from('overtime_requests')
      .select('id')
      .eq('employee_id', input.employee_id)
      .eq('request_date', input.request_date)
      .maybeSingle()

    if (existing) {
      throw new Error('Đã tồn tại phiếu tăng ca cho ngày này')
    }

    const { data, error } = await supabase
      .from('overtime_requests')
      .insert({
        employee_id: input.employee_id,
        request_date: input.request_date,
        shift_id: input.shift_id || null,
        planned_start_time: input.planned_start_time,
        planned_end_time: input.planned_end_time,
        planned_minutes: input.planned_minutes,
        reason: input.reason,
        status: 'pending',
      })
      .select(OVERTIME_SELECT)
      .single()

    if (error) throw error
    return data as OvertimeRequest
  },

  // --------------------------------------------------------------------------
  // DUYỆT PHIẾU
  // --------------------------------------------------------------------------
  async approve(id: string, approverId: string, notes?: string): Promise<OvertimeRequest> {
    const { data, error } = await supabase
      .from('overtime_requests')
      .update({
        status: 'approved',
        approved_by: approverId,
        approved_at: new Date().toISOString(),
        rejection_reason: notes || null,
      })
      .eq('id', id)
      .eq('status', 'pending')
      .select(OVERTIME_SELECT)
      .single()

    if (error) throw error
    return data as OvertimeRequest
  },

  // --------------------------------------------------------------------------
  // TỪ CHỐI PHIẾU
  // --------------------------------------------------------------------------
  async reject(id: string, approverId: string, reason: string): Promise<OvertimeRequest> {
    const { data, error } = await supabase
      .from('overtime_requests')
      .update({
        status: 'rejected',
        approved_by: approverId,
        approved_at: new Date().toISOString(),
        rejection_reason: reason,
      })
      .eq('id', id)
      .eq('status', 'pending')
      .select(OVERTIME_SELECT)
      .single()

    if (error) throw error
    return data as OvertimeRequest
  },

  // --------------------------------------------------------------------------
  // HỦY PHIẾU (người tạo tự hủy, chỉ khi đang pending)
  // --------------------------------------------------------------------------
  async cancel(id: string): Promise<void> {
    const { error } = await supabase
      .from('overtime_requests')
      .delete()
      .eq('id', id)
      .eq('status', 'pending')

    if (error) throw error
  },

  // --------------------------------------------------------------------------
  // LẤY PHIẾU CHỜ DUYỆT THEO PHÒNG BAN (Manager level 4-5)
  // --------------------------------------------------------------------------
  async getPendingByDepartment(departmentId: string): Promise<OvertimeRequest[]> {
    const { data, error } = await supabase
      .from('overtime_requests')
      .select(OVERTIME_SELECT)
      .eq('status', 'pending')
      .order('request_date', { ascending: true })

    if (error) throw error

    // Filter theo phòng ban (client-side do join nested)
    const filtered = (data || []).filter(
      (item: any) => item.employee?.department_id === departmentId
    )

    return filtered as OvertimeRequest[]
  },

  // --------------------------------------------------------------------------
  // LẤY TẤT CẢ PHIẾU CHỜ DUYỆT (Executive level 1-3)
  // --------------------------------------------------------------------------
  async getAllPending(): Promise<OvertimeRequest[]> {
    const { data, error } = await supabase
      .from('overtime_requests')
      .select(OVERTIME_SELECT)
      .eq('status', 'pending')
      .order('request_date', { ascending: true })

    if (error) throw error
    return (data || []) as OvertimeRequest[]
  },

  // --------------------------------------------------------------------------
  // ĐẾM SỐ PHIẾU PENDING (cho badge sidebar)
  // --------------------------------------------------------------------------
  async getPendingCount(params?: { departmentId?: string }): Promise<number> {
    const { data, error } = await supabase
      .from('overtime_requests')
      .select('id, employee:employees!overtime_requests_employee_id_fkey(department_id)')
      .eq('status', 'pending')

    if (error) throw error

    if (params?.departmentId) {
      return (data || []).filter(
        (item: any) => item.employee?.department_id === params.departmentId
      ).length
    }

    return data?.length || 0
  },

  // --------------------------------------------------------------------------
  // LẤY LỊCH SỬ DUYỆT (cho trang approval - đã duyệt/từ chối)
  // --------------------------------------------------------------------------
  async getApprovalHistory(params: {
    approverId?: string
    departmentId?: string
    page?: number
    pageSize?: number
  }): Promise<PaginatedResponse<OvertimeRequest>> {
    const { page = 1, pageSize = 10, approverId, departmentId } = params
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    let query = supabase
      .from('overtime_requests')
      .select(OVERTIME_SELECT, { count: 'exact' })
      .in('status', ['approved', 'rejected'])

    if (approverId) {
      query = query.eq('approved_by', approverId)
    }

    const { data, error, count } = await query
      .order('approved_at', { ascending: false })
      .range(from, to)

    if (error) throw error

    let filteredData = data || []
    if (departmentId) {
      filteredData = filteredData.filter(
        (item: any) => item.employee?.department_id === departmentId
      )
    }

    return {
      data: filteredData as OvertimeRequest[],
      total: count || 0,
      page,
      pageSize,
      totalPages: Math.ceil((count || 0) / pageSize),
    }
  },
}

export default overtimeRequestService