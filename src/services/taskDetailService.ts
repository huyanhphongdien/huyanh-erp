// ============================================================================
// src/services/taskDetailService.ts
// Phase 4.1: Task Detail Service
// Huy Anh ERP System
// ============================================================================
// UPDATED: Đồng bộ với database schema thực tế (2026-01-21)
// - Thêm validation cho approved tasks
// - Thêm helper functions
// ============================================================================
//
// ⚠️ DEPRECATION (Sprint 3.1, defer to Sprint 4):
//   File này có scope CHỒNG CHÉO với taskService.getById().
//   Kế hoạch: merge vào taskService.ts. Dev mới KHÔNG nên import file này
//   cho code mới — dùng taskService thay thế.
//   Xem chi tiết tại src/services/TASK_SERVICES_GUIDE.md
// ============================================================================

import { supabase } from '../lib/supabase'

// ============================================================================
// LOCAL TYPE (TaskDetail chưa có trong types)
// ============================================================================

export interface TaskDetail {
  id?: string
  task_id: string
  
  // Nội dung chi tiết
  detailed_description?: string | null
  acceptance_criteria?: string | null
  technical_requirements?: string | null
  
  // Resources
  estimated_budget?: number | null
  actual_budget?: number | null
  resources_needed?: string | null
  
  // Files & Links
  attachments?: string[] | null
  reference_links?: string[] | null
  
  // Additional info
  risk_assessment?: string | null
  dependencies?: string | null
  milestones?: Record<string, any>[] | null
  
  // Timestamps
  created_at?: string
  updated_at?: string
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Kiểm tra task có thể cập nhật detail không
 */
async function canUpdateTaskDetail(taskId: string): Promise<{
  canUpdate: boolean
  reason?: string
}> {
  // Kiểm tra task có được phê duyệt chưa
  const { data: approval } = await supabase
    .from('task_approvals')
    .select('id')
    .eq('task_id', taskId)
    .eq('action', 'approved')
    .maybeSingle()

  if (approval) {
    return {
      canUpdate: false,
      reason: 'Không thể cập nhật chi tiết của công việc đã được phê duyệt'
    }
  }

  // Kiểm tra task status
  const { data: task, error } = await supabase
    .from('tasks')
    .select('status')
    .eq('id', taskId)
    .single()

  if (error || !task) {
    return {
      canUpdate: false,
      reason: 'Không tìm thấy công việc'
    }
  }

  if (task.status === 'accepted') {
    return {
      canUpdate: false,
      reason: 'Không thể cập nhật chi tiết của công việc đã được phê duyệt'
    }
  }

  if (task.status === 'cancelled') {
    return {
      canUpdate: false,
      reason: 'Không thể cập nhật chi tiết của công việc đã hủy'
    }
  }

  return { canUpdate: true }
}

// ============================================================================
// MAIN SERVICE
// ============================================================================

export const taskDetailService = {
  /**
   * Lấy chi tiết theo task_id
   */
  async getByTaskId(taskId: string): Promise<TaskDetail | null> {
    console.log('📋 [taskDetailService] getByTaskId:', taskId)

    const { data, error } = await supabase
      .from('task_details')
      .select('*')
      .eq('task_id', taskId)
      .single()

    if (error && error.code !== 'PGRST116') {
      console.error('❌ [taskDetailService] getByTaskId error:', error)
      throw error
    }

    return data
  },

  /**
   * Tạo hoặc cập nhật chi tiết
   * FIXED: Thêm validation cho approved tasks
   */
  async upsert(taskId: string, input: Partial<TaskDetail>): Promise<TaskDetail> {
    console.log('📋 [taskDetailService] upsert:', taskId, input)

    // Kiểm tra có thể cập nhật không
    const { canUpdate, reason } = await canUpdateTaskDetail(taskId)
    if (!canUpdate) {
      throw new Error(reason || 'Không thể cập nhật chi tiết công việc')
    }

    const existing = await this.getByTaskId(taskId)

    if (existing) {
      // Update existing
      const { data, error } = await supabase
        .from('task_details')
        .update({
          ...input,
          updated_at: new Date().toISOString()
        })
        .eq('task_id', taskId)
        .select()
        .single()

      if (error) {
        console.error('❌ [taskDetailService] update error:', error)
        throw error
      }

      console.log('✅ [taskDetailService] Updated:', taskId)
      return data
    } else {
      // Create new
      const { data, error } = await supabase
        .from('task_details')
        .insert({ 
          ...input, 
          task_id: taskId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single()

      if (error) {
        console.error('❌ [taskDetailService] create error:', error)
        throw error
      }

      console.log('✅ [taskDetailService] Created:', taskId)
      return data
    }
  },

  /**
   * Chỉ tạo mới (không update nếu đã tồn tại)
   */
  async create(taskId: string, input: Partial<TaskDetail>): Promise<TaskDetail> {
    console.log('📋 [taskDetailService] create:', taskId)

    // Kiểm tra có thể cập nhật không
    const { canUpdate, reason } = await canUpdateTaskDetail(taskId)
    if (!canUpdate) {
      throw new Error(reason || 'Không thể tạo chi tiết công việc')
    }

    // Kiểm tra đã tồn tại chưa
    const existing = await this.getByTaskId(taskId)
    if (existing) {
      throw new Error('Chi tiết công việc đã tồn tại')
    }

    const { data, error } = await supabase
      .from('task_details')
      .insert({ 
        ...input, 
        task_id: taskId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single()

    if (error) {
      console.error('❌ [taskDetailService] create error:', error)
      throw error
    }

    console.log('✅ [taskDetailService] Created:', taskId)
    return data
  },

  /**
   * Chỉ cập nhật (không tạo mới nếu chưa tồn tại)
   */
  async update(taskId: string, input: Partial<TaskDetail>): Promise<TaskDetail> {
    console.log('📋 [taskDetailService] update:', taskId)

    // Kiểm tra có thể cập nhật không
    const { canUpdate, reason } = await canUpdateTaskDetail(taskId)
    if (!canUpdate) {
      throw new Error(reason || 'Không thể cập nhật chi tiết công việc')
    }

    // Kiểm tra đã tồn tại chưa
    const existing = await this.getByTaskId(taskId)
    if (!existing) {
      throw new Error('Chi tiết công việc chưa tồn tại')
    }

    const { data, error } = await supabase
      .from('task_details')
      .update({
        ...input,
        updated_at: new Date().toISOString()
      })
      .eq('task_id', taskId)
      .select()
      .single()

    if (error) {
      console.error('❌ [taskDetailService] update error:', error)
      throw error
    }

    console.log('✅ [taskDetailService] Updated:', taskId)
    return data
  },

  /**
   * Xóa chi tiết
   */
  async delete(taskId: string): Promise<void> {
    console.log('🗑️ [taskDetailService] delete:', taskId)

    // Kiểm tra có thể xóa không
    const { canUpdate, reason } = await canUpdateTaskDetail(taskId)
    if (!canUpdate) {
      throw new Error(reason || 'Không thể xóa chi tiết công việc')
    }

    const { error } = await supabase
      .from('task_details')
      .delete()
      .eq('task_id', taskId)

    if (error) {
      console.error('❌ [taskDetailService] delete error:', error)
      throw error
    }

    console.log('✅ [taskDetailService] Deleted:', taskId)
  },

  /**
   * Cập nhật một field cụ thể
   */
  async updateField(taskId: string, field: keyof TaskDetail, value: any): Promise<TaskDetail> {
    console.log('📋 [taskDetailService] updateField:', taskId, field, value)

    return this.upsert(taskId, { [field]: value } as Partial<TaskDetail>)
  },

  // Export helper for UI
  canUpdateTaskDetail,
}

export default taskDetailService