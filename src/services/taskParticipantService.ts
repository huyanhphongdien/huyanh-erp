// ============================================================================
// TASK PARTICIPANT SERVICE
// File: src/services/taskParticipantService.ts
// Huy Anh ERP System
// ============================================================================
// Service xử lý việc thêm/xóa người tham gia vào công việc
// Quyền:
// - Level 1-3 (GĐ, Trợ lý GĐ, Phó GĐ): Thêm trực tiếp mọi nhân viên
// - Level 4-5 (Trưởng phòng, Phó phòng): Thêm trực tiếp nhân viên cùng phòng
// - Level 6-7 (Nhân viên, TTS): Gửi yêu cầu cho đồng nghiệp cùng phòng
// ============================================================================

import { supabase } from '../lib/supabase'

// ============================================================================
// TYPES
// ============================================================================

export interface TaskParticipant {
  id: string
  task_id: string
  employee_id: string
  role: 'participant' | 'reviewer'
  status: 'pending' | 'accepted' | 'declined' | 'completed' | 'removed'  // UPDATED: match enum
  note?: string | null
  invited_by?: string | null
  invitation_note?: string | null
  assigned_at?: string | null
  accepted_at?: string | null
  responded_at?: string | null
  created_at?: string
  // Employee info
  employee_code?: string
  employee_name?: string
  employee_email?: string
  employee_department_id?: string
  employee_department_name?: string
  employee_position_name?: string
  employee_position_level?: number
  // Inviter info
  inviter_name?: string
}

export interface PendingRequest {
  id: string
  task_id: string
  employee_id: string
  invited_by: string
  invitation_note?: string | null
  requested_at: string
  // Task info
  task_code: string
  task_name: string
  task_description?: string | null
  task_status: string
  task_priority: string
  task_due_date?: string | null
  task_progress: number
  // Inviter info
  inviter_name: string
  inviter_code: string
  inviter_department_name?: string
}

export interface AddParticipantInput {
  task_id: string
  employee_id: string
  invited_by: string
  invitation_note?: string
}

export interface CanAddResult {
  can_add: boolean
  add_type: 'direct' | 'request' | null
  reason: string
}

export interface AvailableEmployee {
  id: string
  code: string
  full_name: string
  email?: string
  department_id: string
  department_name: string
  position_name?: string
  position_level?: number
}

// ============================================================================
// SERVICE
// ============================================================================

export const taskParticipantService = {
  /**
   * Lấy danh sách người tham gia của một task
   */
  async getParticipants(taskId: string): Promise<{ data: TaskParticipant[]; error: Error | null }> {
    console.log('👥 [taskParticipantService] getParticipants for task:', taskId)

    try {
      const { data, error } = await supabase
        .from('task_assignments')
        .select(`
          id,
          task_id,
          employee_id,
          role,
          status,
          note,
          invited_by,
          invitation_note,
          assigned_at,
          accepted_at,
          responded_at,
          created_at,
          employee:employees!task_assignments_employee_id_fkey(
            id,
            code,
            full_name,
            email,
            department_id,
            department:departments!employees_department_id_fkey(name),
            position:positions(name, level)
          ),
          inviter:employees!task_assignments_invited_by_fkey(full_name)
        `)
        .eq('task_id', taskId)
        .eq('role', 'participant')
        .not('status', 'in', '(removed,declined)')  // UPDATED: 'rejected' -> 'declined'
        .order('created_at', { ascending: true })

      if (error) throw error

      // Map data
      const participants: TaskParticipant[] = (data || []).map((item: any) => ({
        id: item.id,
        task_id: item.task_id,
        employee_id: item.employee_id,
        role: item.role,
        status: item.status,
        note: item.note,
        invited_by: item.invited_by,
        invitation_note: item.invitation_note,
        assigned_at: item.assigned_at,
        accepted_at: item.accepted_at,
        responded_at: item.responded_at,
        created_at: item.created_at,
        employee_code: item.employee?.code,
        employee_name: item.employee?.full_name,
        employee_email: item.employee?.email,
        employee_department_id: item.employee?.department_id,
        employee_department_name: item.employee?.department?.name,
        employee_position_name: item.employee?.position?.name,
        employee_position_level: item.employee?.position?.level,
        inviter_name: item.inviter?.full_name,
      }))

      console.log('✅ [taskParticipantService] Found', participants.length, 'participants')
      return { data: participants, error: null }

    } catch (error) {
      console.error('❌ [taskParticipantService] getParticipants error:', error)
      return { data: [], error: error as Error }
    }
  },

  /**
   * Kiểm tra quyền thêm người tham gia
   */
  async checkCanAddParticipant(
    requesterId: string,
    targetEmployeeId: string,
    taskId: string
  ): Promise<CanAddResult> {
    console.log('🔍 [taskParticipantService] checkCanAddParticipant:', {
      requesterId,
      targetEmployeeId,
      taskId,
    })

    try {
      // Lấy thông tin requester
      const { data: requester, error: requesterError } = await supabase
        .from('employees')
        .select(`
          id,
          department_id,
          position:positions(level)
        `)
        .eq('id', requesterId)
        .single()

      if (requesterError || !requester) {
        return { can_add: false, add_type: null, reason: 'Không tìm thấy thông tin người yêu cầu' }
      }

      // Lấy thông tin target employee
      const { data: target, error: targetError } = await supabase
        .from('employees')
        .select('id, department_id')
        .eq('id', targetEmployeeId)
        .single()

      if (targetError || !target) {
        return { can_add: false, add_type: null, reason: 'Không tìm thấy nhân viên' }
      }

      // Lấy thông tin task
      const { data: task, error: taskError } = await supabase
        .from('tasks')
        .select('id, department_id, assignee_id')
        .eq('id', taskId)
        .single()

      if (taskError || !task) {
        return { can_add: false, add_type: null, reason: 'Không tìm thấy công việc' }
      }

      // Kiểm tra đã là participant chưa
      const { data: existing } = await supabase
        .from('task_assignments')
        .select('id')
        .eq('task_id', taskId)
        .eq('employee_id', targetEmployeeId)
        .not('status', 'in', '(removed,declined)')  // UPDATED: 'rejected' -> 'declined'
        .single()

      if (existing) {
        return { can_add: false, add_type: null, reason: 'Nhân viên đã là người tham gia' }
      }

      // Kiểm tra là assignee chính
      if (task.assignee_id === targetEmployeeId) {
        return { can_add: false, add_type: null, reason: 'Nhân viên đã là người phụ trách chính' }
      }

      const requesterLevel = (requester.position as any)?.level || 99
      const requesterDept = requester.department_id
      const targetDept = target.department_id

      // Level 1-3: Thêm trực tiếp toàn công ty
      if (requesterLevel <= 3) {
        return { can_add: true, add_type: 'direct', reason: 'Được phép thêm trực tiếp' }
      }

      // Level 4-5: Thêm trực tiếp trong phòng
      if (requesterLevel <= 5) {
        if (requesterDept === targetDept) {
          return { can_add: true, add_type: 'direct', reason: 'Được phép thêm trực tiếp (cùng phòng)' }
        }
        return { can_add: false, add_type: null, reason: 'Chỉ được thêm nhân viên trong phòng ban của bạn' }
      }

      // Level 6+: Gửi yêu cầu cho đồng nghiệp cùng phòng
      if (requesterDept === targetDept) {
        return { can_add: true, add_type: 'request', reason: 'Gửi yêu cầu tham gia' }
      }

      return { can_add: false, add_type: null, reason: 'Chỉ được mời đồng nghiệp cùng phòng ban' }

    } catch (error) {
      console.error('❌ [taskParticipantService] checkCanAddParticipant error:', error)
      return { can_add: false, add_type: null, reason: 'Có lỗi xảy ra' }
    }
  },

  /**
   * Thêm người tham gia vào task
   */
  async addParticipant(input: AddParticipantInput): Promise<{ success: boolean; data?: TaskParticipant; error?: string }> {
    console.log('➕ [taskParticipantService] addParticipant:', input)

    try {
      // Kiểm tra quyền
      const canAddResult = await this.checkCanAddParticipant(
        input.invited_by,
        input.employee_id,
        input.task_id
      )

      if (!canAddResult.can_add) {
        return { success: false, error: canAddResult.reason }
      }

      // Xác định status dựa trên loại thêm
      // UPDATED: 'active' -> 'accepted' theo enum thực tế
      const status = canAddResult.add_type === 'direct' ? 'accepted' : 'pending'
      const acceptedAt = canAddResult.add_type === 'direct' ? new Date().toISOString() : null

      // Insert vào database
      const { data, error } = await supabase
        .from('task_assignments')
        .insert({
          task_id: input.task_id,
          employee_id: input.employee_id,
          role: 'participant',
          status,
          invited_by: input.invited_by,
          invitation_note: input.invitation_note || null,
          assigned_at: new Date().toISOString(),
          accepted_at: acceptedAt,
        })
        .select(`
          id,
          task_id,
          employee_id,
          role,
          status,
          invited_by,
          invitation_note,
          assigned_at,
          accepted_at,
          created_at,
          employee:employees!task_assignments_employee_id_fkey(
            code,
            full_name,
            department:departments!employees_department_id_fkey(name),
            position:positions(name, level)
          )
        `)
        .single()

      if (error) throw error

      console.log('✅ [taskParticipantService] Added participant:', data.id, 'status:', status)

      return {
        success: true,
        data: {
          id: data.id,
          task_id: data.task_id,
          employee_id: data.employee_id,
          role: data.role,
          status: data.status,
          invited_by: data.invited_by,
          invitation_note: data.invitation_note,
          assigned_at: data.assigned_at,
          accepted_at: data.accepted_at,
          created_at: data.created_at,
          employee_code: (data.employee as any)?.code,
          employee_name: (data.employee as any)?.full_name,
          employee_department_name: (data.employee as any)?.department?.name,
          employee_position_name: (data.employee as any)?.position?.name,
          employee_position_level: (data.employee as any)?.position?.level,
        },
      }

    } catch (error: any) {
      console.error('❌ [taskParticipantService] addParticipant error:', error)
      return { success: false, error: error.message || 'Không thể thêm người tham gia' }
    }
  },

  /**
   * Xóa người tham gia khỏi task
   */
  async removeParticipant(
    assignmentId: string,
    // removedBy: string
  ): Promise<{ success: boolean; error?: string }> {
    console.log('➖ [taskParticipantService] removeParticipant:', assignmentId)

    try {
      const { error } = await supabase
        .from('task_assignments')
        .update({
          status: 'removed',
          responded_at: new Date().toISOString(),
        })
        .eq('id', assignmentId)

      if (error) throw error

      console.log('✅ [taskParticipantService] Removed participant:', assignmentId)
      return { success: true }

    } catch (error: any) {
      console.error('❌ [taskParticipantService] removeParticipant error:', error)
      return { success: false, error: error.message || 'Không thể xóa người tham gia' }
    }
  },

  /**
   * Lấy danh sách yêu cầu tham gia đang chờ (cho nhân viên)
   */
  async getPendingRequests(employeeId: string): Promise<{ data: PendingRequest[]; error: Error | null }> {
    console.log('📬 [taskParticipantService] getPendingRequests for:', employeeId)

    try {
      const { data, error } = await supabase
        .from('task_assignments')
        .select(`
          id,
          task_id,
          employee_id,
          invited_by,
          invitation_note,
          created_at,
          task:tasks(
            code,
            name,
            description,
            status,
            priority,
            due_date,
            progress
          ),
          inviter:employees!task_assignments_invited_by_fkey(
            full_name,
            code,
            department:departments!employees_department_id_fkey(name)
          )
        `)
        .eq('employee_id', employeeId)
        .eq('status', 'pending')
        .eq('role', 'participant')
        .order('created_at', { ascending: false })

      if (error) throw error

      const requests: PendingRequest[] = (data || []).map((item: any) => ({
        id: item.id,
        task_id: item.task_id,
        employee_id: item.employee_id,
        invited_by: item.invited_by,
        invitation_note: item.invitation_note,
        requested_at: item.created_at,
        task_code: item.task?.code,
        task_name: item.task?.name,
        task_description: item.task?.description,
        task_status: item.task?.status,
        task_priority: item.task?.priority,
        task_due_date: item.task?.due_date,
        task_progress: item.task?.progress || 0,
        inviter_name: item.inviter?.full_name,
        inviter_code: item.inviter?.code,
        inviter_department_name: item.inviter?.department?.name,
      }))

      console.log('✅ [taskParticipantService] Found', requests.length, 'pending requests')
      return { data: requests, error: null }

    } catch (error) {
      console.error('❌ [taskParticipantService] getPendingRequests error:', error)
      return { data: [], error: error as Error }
    }
  },

  /**
   * Đếm số yêu cầu tham gia đang chờ
   */
  async countPendingRequests(employeeId: string): Promise<number> {
    try {
      const { count, error } = await supabase
        .from('task_assignments')
        .select('id', { count: 'exact', head: true })
        .eq('employee_id', employeeId)
        .eq('status', 'pending')
        .eq('role', 'participant')

      if (error) throw error
      return count || 0
    } catch (error) {
      console.error('❌ [taskParticipantService] countPendingRequests error:', error)
      return 0
    }
  },

  /**
   * Chấp nhận yêu cầu tham gia
   */
  async acceptRequest(assignmentId: string): Promise<{ success: boolean; error?: string }> {
    console.log('✅ [taskParticipantService] acceptRequest:', assignmentId)

    try {
      const { error } = await supabase
        .from('task_assignments')
        .update({
          status: 'accepted',  // UPDATED: 'active' -> 'accepted'
          accepted_at: new Date().toISOString(),
          responded_at: new Date().toISOString(),
        })
        .eq('id', assignmentId)

      if (error) throw error

      console.log('✅ [taskParticipantService] Accepted request:', assignmentId)
      return { success: true }

    } catch (error: any) {
      console.error('❌ [taskParticipantService] acceptRequest error:', error)
      return { success: false, error: error.message || 'Không thể chấp nhận yêu cầu' }
    }
  },

  /**
   * Từ chối yêu cầu tham gia
   */
  async rejectRequest(assignmentId: string, reason?: string): Promise<{ success: boolean; error?: string }> {
    console.log('❌ [taskParticipantService] rejectRequest:', assignmentId)

    try {
      const { error } = await supabase
        .from('task_assignments')
        .update({
          status: 'declined',  // UPDATED: 'rejected' -> 'declined'
          note: reason || null,
          responded_at: new Date().toISOString(),
        })
        .eq('id', assignmentId)

      if (error) throw error

      console.log('✅ [taskParticipantService] Rejected request:', assignmentId)
      return { success: true }

    } catch (error: any) {
      console.error('❌ [taskParticipantService] rejectRequest error:', error)
      return { success: false, error: error.message || 'Không thể từ chối yêu cầu' }
    }
  },

  /**
   * Lấy danh sách nhân viên có thể thêm vào task
   * - Dựa vào quyền của người đang đăng nhập
   * - Loại trừ những người đã là participant hoặc assignee
   */
  async getAvailableEmployees(
    taskId: string,
    requesterId: string
  ): Promise<{ data: AvailableEmployee[]; error: Error | null }> {
    console.log('👥 [taskParticipantService] getAvailableEmployees for task:', taskId, 'requester:', requesterId)

    try {
      // Lấy thông tin requester
      const { data: requester, error: requesterError } = await supabase
        .from('employees')
        .select(`
          id,
          department_id,
          position:positions(level)
        `)
        .eq('id', requesterId)
        .single()

      if (requesterError) {
        console.error('❌ [taskParticipantService] Error fetching requester:', requesterError)
        return { data: [], error: new Error('Không tìm thấy thông tin người dùng') }
      }

      if (!requester) {
        console.error('❌ [taskParticipantService] Requester not found')
        return { data: [], error: new Error('Không tìm thấy thông tin người dùng') }
      }

      console.log('✅ [taskParticipantService] Requester info:', requester)

      // Lấy thông tin task
      const { data: task, error: taskError } = await supabase
        .from('tasks')
        .select('id, assignee_id')
        .eq('id', taskId)
        .single()

      if (taskError || !task) {
        console.error('❌ [taskParticipantService] Task not found:', taskError)
        return { data: [], error: new Error('Không tìm thấy công việc') }
      }

      console.log('✅ [taskParticipantService] Task info:', task)

      // Lấy danh sách employee_id đã là participant
      const { data: existingParticipants } = await supabase
        .from('task_assignments')
        .select('employee_id')
        .eq('task_id', taskId)
        .not('status', 'in', '(removed,declined)')

      // Tạo Set các ID cần loại trừ
      const excludedIds = new Set<string>()
      excludedIds.add(requesterId)
      if (task.assignee_id) {
        excludedIds.add(task.assignee_id)
      }
      if (existingParticipants) {
        existingParticipants.forEach(p => {
          if (p.employee_id) excludedIds.add(p.employee_id)
        })
      }

      console.log('📋 [taskParticipantService] Excluded IDs:', Array.from(excludedIds))

      const requesterLevel = (requester.position as any)?.level || 99
      const requesterDept = requester.department_id

      console.log('👤 [taskParticipantService] Requester level:', requesterLevel, 'dept:', requesterDept)

      // Build query dựa trên quyền
      let query = supabase
        .from('employees')
        .select(`
          id,
          code,
          full_name,
          email,
          department_id,
          department:departments!employees_department_id_fkey(name),
          position:positions(name, level)
        `)
        .eq('status', 'active')
        .order('full_name', { ascending: true })

      // Level 4+ (Trưởng phòng trở xuống): Chỉ lấy nhân viên cùng phòng
      if (requesterLevel > 3 && requesterDept) {
        console.log('🔒 [taskParticipantService] Filtering by department:', requesterDept)
        query = query.eq('department_id', requesterDept)
      }

      const { data, error } = await query

      if (error) {
        console.error('❌ [taskParticipantService] Query error:', error)
        throw error
      }

      console.log('📊 [taskParticipantService] Raw query returned:', data?.length || 0, 'employees')

      // Filter out excluded IDs in JavaScript (more reliable than PostgREST not.in)
      const filteredData = (data || []).filter(e => !excludedIds.has(e.id))

      console.log('📊 [taskParticipantService] After filtering excluded:', filteredData.length, 'employees')

      const employees: AvailableEmployee[] = filteredData.map((e: any) => ({
        id: e.id,
        code: e.code,
        full_name: e.full_name,
        email: e.email,
        department_id: e.department_id,
        department_name: e.department?.name || '',
        position_name: e.position?.name,
        position_level: e.position?.level,
      }))

      console.log('✅ [taskParticipantService] Found', employees.length, 'available employees')
      return { data: employees, error: null }

    } catch (error) {
      console.error('❌ [taskParticipantService] getAvailableEmployees error:', error)
      return { data: [], error: error as Error }
    }
  },
}

export default taskParticipantService