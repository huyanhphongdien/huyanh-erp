// ============================================================================
// OVERTIME REQUEST SERVICE - V2.1 FIXED
// File: src/services/overtimeRequestService.ts
// ============================================================================
// FIX: getPendingApprovals - Dựa vào RLS thay vì filter approver_id
// ============================================================================

import { supabase } from '../lib/supabase'
import type { BatchResult } from '../types/common'  // ✅ ADD

// ============================================================================
// TYPES
// ============================================================================

interface Shift {
  id: string
  code: string
  name: string
  start_time: string
  end_time: string
}

interface Employee {
  id: string
  code: string
  full_name: string
  department_id: string
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

interface Approver {
  id: string
  code?: string
  full_name: string
}

export interface OvertimeRequest {
  id: string
  employee_id: string
  request_date: string
  shift_id?: string
  planned_start: string
  planned_end: string
  planned_minutes: number
  actual_minutes?: number
  reason: string
  status: 'pending' | 'approved' | 'rejected' | 'completed'
  approver_id?: string
  approved_by?: string
  approved_at?: string
  rejection_reason?: string
  created_at?: string
  updated_at?: string
  employee?: Employee
  shift?: Shift
  approver?: Approver
}

export interface OvertimeApproverInfo {
  approver_id: string
  approver_name: string
  approver_position: string
  approver_level: number
  approval_type: 'self' | 'executive' | 'manager'
}

interface CreateOvertimeInput {
  employee_id: string
  request_date: string
  shift_id?: string
  planned_start: string
  planned_end: string
  planned_minutes: number
  reason: string
}



// ============================================================================
// SELECT QUERY
// ============================================================================

const OVERTIME_SELECT = `
  *,
  employee:employees!overtime_requests_employee_id_fkey(
    id, code, full_name, department_id,
    department:departments!employees_department_id_fkey(id, name),
    position:positions!employees_position_id_fkey(id, name, level)
  ),
  shift:shifts!overtime_requests_shift_id_fkey(id, code, name, start_time, end_time),
  approver:employees!overtime_requests_approved_by_fkey(id, full_name)
`

// ============================================================================
// SERVICE
// ============================================================================

export const overtimeRequestService = {

  // ==========================================================================
  // XÁC ĐỊNH NGƯỜI DUYỆT
  // ==========================================================================

  async getApprover(requesterId: string): Promise<OvertimeApproverInfo | null> {
    try {
      const { data, error } = await supabase
        .rpc('get_overtime_approver', { p_requester_id: requesterId })

      if (error) {
        console.error('getApprover error:', error)
        return null
      }

      if (!data || data.length === 0) {
        return null
      }

      return data[0] as OvertimeApproverInfo
    } catch (error) {
      console.error('getApprover exception:', error)
      return null
    }
  },

  // ==========================================================================
  // DANH SÁCH PHIẾU CỦA NHÂN VIÊN
  // ==========================================================================

  async getByEmployee(
    employeeId: string,
    status?: 'pending' | 'approved' | 'rejected' | 'completed',
    fromDate?: string,
    toDate?: string
  ): Promise<OvertimeRequest[]> {
    try {
      let query = supabase
        .from('overtime_requests')
        .select(OVERTIME_SELECT)
        .eq('employee_id', employeeId)

      if (status) query = query.eq('status', status)
      if (fromDate) query = query.gte('request_date', fromDate)
      if (toDate) query = query.lte('request_date', toDate)

      const { data, error } = await query.order('request_date', { ascending: false })

      if (error) {
        console.error('getByEmployee error:', error)
        return []
      }
      return data || []
    } catch (error) {
      console.error('getByEmployee exception:', error)
      return []
    }
  },

  // ==========================================================================
  // ✅ FIX: PHIẾU CHỜ DUYỆT - DỰA VÀO RLS
  // ==========================================================================

  async getPendingApprovals(
    approverId: string,
    status?: 'pending' | 'approved' | 'rejected',
    fromDate?: string,
    toDate?: string
  ): Promise<OvertimeRequest[]> {
    try {
      // ✅ ĐƠN GIẢN: Chỉ query, để RLS tự filter theo department
      let query = supabase
        .from('overtime_requests')
        .select(OVERTIME_SELECT)

      // Filter status
      if (status) {
        query = query.eq('status', status)
      } else {
        // Mặc định: chỉ lấy pending
        query = query.eq('status', 'pending')
      }

      // Filter date range
      if (fromDate) query = query.gte('request_date', fromDate)
      if (toDate) query = query.lte('request_date', toDate)

      const { data, error } = await query.order('request_date', { ascending: false })

      if (error) {
        console.error('getPendingApprovals error:', error)
        return []
      }
      return data || []
    } catch (error) {
      console.error('getPendingApprovals exception:', error)
      return []
    }
  },

  // ==========================================================================
  // CHI TIẾT 1 PHIẾU
  // ==========================================================================

  async getById(requestId: string): Promise<OvertimeRequest | null> {
    try {
      const { data, error } = await supabase
        .from('overtime_requests')
        .select(OVERTIME_SELECT)
        .eq('id', requestId)
        .maybeSingle()

      if (error) {
        console.error('getById error:', error)
        return null
      }
      return data as OvertimeRequest | null
    } catch (error) {
      console.error('getById exception:', error)
      return null
    }
  },

  // ==========================================================================
  // ✅ FIX: ĐẾM PENDING - DỰA VÀO RLS
  // ==========================================================================

  async getPendingCount(approverId: string): Promise<number> {
    try {
      // ✅ ĐƠN GIẢN: Chỉ đếm pending, RLS tự filter
      const { count, error } = await supabase
        .from('overtime_requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending')

      if (error) {
        console.error('getPendingCount error:', error)
        return 0
      }
      return count || 0
    } catch (error) {
      console.error('getPendingCount exception:', error)
      return 0
    }
  },

  // ==========================================================================
  // TẠO PHIẾU TĂNG CA
  // ==========================================================================

  async create(input: CreateOvertimeInput): Promise<OvertimeRequest> {
    // 1. Validate trùng ngày
    const { data: existing } = await supabase
      .from('overtime_requests')
      .select('id')
      .eq('employee_id', input.employee_id)
      .eq('request_date', input.request_date)
      .in('status', ['pending', 'approved'])
      .maybeSingle()

    if (existing) {
      throw new Error('Đã tồn tại phiếu tăng ca cho ngày này (đang chờ duyệt hoặc đã duyệt)')
    }

    // 2. Xác định người duyệt tự động
    const approverInfo = await this.getApprover(input.employee_id)
    
    if (!approverInfo) {
      throw new Error('Không thể xác định người duyệt. Vui lòng liên hệ quản trị viên.')
    }

    // 3. Tạo phiếu
    const insertData: any = {
      employee_id: input.employee_id,
      request_date: input.request_date,
      shift_id: input.shift_id || null,
      planned_start: input.planned_start,
      planned_end: input.planned_end,
      planned_minutes: input.planned_minutes,
      reason: input.reason,
      approver_id: approverInfo.approver_id,
      status: 'pending',
    }

    // BGĐ tự duyệt → auto approve
    if (approverInfo.approval_type === 'self') {
      insertData.status = 'approved'
      insertData.approved_by = approverInfo.approver_id
      insertData.approved_at = new Date().toISOString()
    }

    const { data, error } = await supabase
      .from('overtime_requests')
      .insert(insertData)
      .select(OVERTIME_SELECT)
      .single()

    if (error) throw error
    return data as OvertimeRequest
  },

  // ==========================================================================
  // DUYỆT 1 PHIẾU
  // ==========================================================================

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

  // ==========================================================================
  // TỪ CHỐI 1 PHIẾU
  // ==========================================================================

  async reject(id: string, approverId: string, reason: string): Promise<OvertimeRequest> {
    if (!reason.trim()) {
      throw new Error('Vui lòng nhập lý do từ chối')
    }

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

  // ==========================================================================
  // DUYỆT HÀNG LOẠT
  // ==========================================================================

  async batchApprove(ids: string[], approverId: string, notes?: string): Promise<BatchResult> {
    const result: BatchResult = { success: 0, failed: 0, errors: [] }

    for (const id of ids) {
      try {
        await this.approve(id, approverId, notes)
        result.success++
      } catch (error: any) {
        result.failed++
        result.errors.push({ id, error: error.message || 'Lỗi không xác định' })
      }
    }

    return result
  },

  // ==========================================================================
  // TỪ CHỐI HÀNG LOẠT
  // ==========================================================================

  async batchReject(ids: string[], approverId: string, reason: string): Promise<BatchResult> {
    const result: BatchResult = { success: 0, failed: 0, errors: [] }

    for (const id of ids) {
      try {
        await this.reject(id, approverId, reason)
        result.success++
      } catch (error: any) {
        result.failed++
        result.errors.push({ id, error: error.message || 'Lỗi không xác định' })
      }
    }

    return result
  },

  // ==========================================================================
  // HỦY PHIẾU
  // ==========================================================================

  async cancel(id: string): Promise<void> {
    const { error } = await supabase
      .from('overtime_requests')
      .delete()
      .eq('id', id)
      .eq('status', 'pending')

    if (error) throw error
  },

  // ==========================================================================
  // LẤY PHIẾU APPROVED THEO NGÀY
  // ==========================================================================

  async getApprovedByDate(
    employeeId: string,
    date: string
  ): Promise<OvertimeRequest | null> {
    try {
      const { data, error } = await supabase
        .from('overtime_requests')
        .select('*')
        .eq('employee_id', employeeId)
        .eq('request_date', date)
        .eq('status', 'approved')
        .maybeSingle()

      if (error) return null
      return data as OvertimeRequest | null
    } catch {
      return null
    }
  },

  // ==========================================================================
  // LỊCH SỬ DUYỆT
  // ==========================================================================

  async getApprovalHistory(
    approverId: string,
    limit: number = 20
  ): Promise<OvertimeRequest[]> {
    try {
      const { data, error } = await supabase
        .from('overtime_requests')
        .select(OVERTIME_SELECT)
        .eq('approved_by', approverId)
        .in('status', ['approved', 'rejected'])
        .order('approved_at', { ascending: false })
        .limit(limit)

      if (error) return []
      return data || []
    } catch {
      return []
    }
  },
}

export default overtimeRequestService