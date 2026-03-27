// src/services/subtaskService.ts
// Phase 4.4: Subtask Management Service
// ============================================================
// Quản lý quan hệ công việc cha - con
// Quy tắc: Tối đa 1 bậc (cha -> con, không có cháu)
// ============================================================
// RÀNG BUỘC:
// 1. due_date con ≤ due_date cha
// 2. start_date con ≥ start_date cha
// 3. Cascade: Cha Cancelled/On Hold → Con cũng vậy
// 4. Cha chỉ Completed khi tất cả con Completed
// ============================================================

import { supabase } from '../lib/supabase'

// ============================================================
// LOCAL TYPES (để tránh dependency vào ../types)
// ============================================================

export interface SubtaskItem {
  id: string
  code?: string
  name?: string
  title?: string
  description?: string | null
  status: string
  priority: string
  progress: number
  start_date?: string | null
  due_date?: string | null
  completed_date?: string | null
  parent_task_id?: string | null
  department_id?: string | null
  assignee_id?: string | null
  assigner_id?: string | null
  assignee?: {
    id: string
    code?: string
    full_name: string
  } | null
  department?: {
    id: string
    code?: string
    name: string
  } | null
  created_at?: string
  updated_at?: string
}

// Helper: Map database task to UI task
const mapTaskFromDB = (dbTask: any): SubtaskItem => {
  return {
    ...dbTask,
    title: dbTask.name || dbTask.title || '',
  }
}

// ============================================================
// INTERFACES
// ============================================================

export interface SubtaskSummary {
  total: number
  completed: number
  inProgress: number
  overdue: number
  averageProgress: number
}

export interface ValidationResult {
  isValid: boolean
  errors: string[]
  warnings: string[]
}

export interface DateConstraints {
  minStartDate?: string | null  // start_date của cha
  maxDueDate?: string | null    // due_date của cha
}

export interface CreateSubtaskInput {
  parent_task_id: string
  name: string
  description?: string
  assignee_id?: string
  priority?: string
  start_date?: string
  due_date?: string
  department_id?: string
}

// ============================================================
// VALIDATION HELPERS
// ============================================================

/**
 * So sánh 2 ngày (chỉ so sánh phần date, không tính time)
 */
const compareDates = (date1?: string | null, date2?: string | null): number => {
  if (!date1 && !date2) return 0
  if (!date1) return -1
  if (!date2) return 1
  
  const d1 = new Date(date1).setHours(0, 0, 0, 0)
  const d2 = new Date(date2).setHours(0, 0, 0, 0)
  
  return d1 - d2
}

/**
 * Format date cho hiển thị lỗi
 */
const formatDateVN = (date?: string | null): string => {
  if (!date) return 'N/A'
  return new Date(date).toLocaleDateString('vi-VN')
}

// ============================================================
// SERVICE
// ============================================================

export const subtaskService = {
  /**
   * Lấy danh sách công việc con của một task
   */
  async getSubtasks(parentId: string): Promise<SubtaskItem[]> {
    console.log('📋 [subtaskService.getSubtasks] Parent ID:', parentId)

    const { data, error } = await supabase
      .from('tasks')
      .select(`
        *,
        assignee:employees!tasks_assignee_id_fkey(id, code, full_name),
        department:departments(id, code, name)
      `)
      .eq('parent_task_id', parentId)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('❌ [subtaskService.getSubtasks] Error:', error)
      throw error
    }

    return (data || []).map(mapTaskFromDB)
  },

  /**
   * Đếm số công việc con
   */
  async getSubtaskCount(parentId: string): Promise<number> {
    const { count, error } = await supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('parent_task_id', parentId)

    if (error) {
      console.error('❌ [subtaskService.getSubtaskCount] Error:', error)
      throw error
    }

    return count || 0
  },

  /**
   * Lấy thống kê công việc con
   */
  async getSubtaskSummary(parentId: string): Promise<SubtaskSummary> {
    console.log('📊 [subtaskService.getSubtaskSummary] Parent ID:', parentId)

    const { data, error } = await supabase
      .from('tasks')
      .select('id, status, progress, due_date')
      .eq('parent_task_id', parentId)

    if (error) {
      console.error('❌ [subtaskService.getSubtaskSummary] Error:', error)
      throw error
    }

    const tasks = data || []
    const today = new Date().toISOString().split('T')[0]

    const summary: SubtaskSummary = {
      total: tasks.length,
      completed: tasks.filter(t => t.status === 'completed').length,
      inProgress: tasks.filter(t => t.status === 'in_progress').length,
      overdue: tasks.filter(t => 
        t.due_date && 
        t.due_date < today && 
        t.status !== 'completed' && 
        t.status !== 'cancelled'
      ).length,
      averageProgress: tasks.length > 0 
        ? Math.round(tasks.reduce((sum, t) => sum + (t.progress || 0), 0) / tasks.length)
        : 0
    }

    console.log('✅ [subtaskService.getSubtaskSummary] Result:', summary)
    return summary
  },

  /**
   * Kiểm tra task có thể tạo con không
   * - Không được là con của task khác (tránh tạo "cháu")
   */
  async canHaveChildren(taskId: string): Promise<{ canCreate: boolean; reason?: string }> {
    console.log('🔍 [subtaskService.canHaveChildren] Task ID:', taskId)

    const { data, error } = await supabase
      .from('tasks')
      .select('id, parent_task_id')
      .eq('id', taskId)
      .single()

    if (error) {
      console.error('❌ [subtaskService.canHaveChildren] Error:', error)
      return { canCreate: false, reason: 'Không tìm thấy công việc' }
    }

    if (data.parent_task_id) {
      return { 
        canCreate: false, 
        reason: 'Công việc này đã là công việc con, không thể tạo thêm cấp con nữa' 
      }
    }

    return { canCreate: true }
  },

  /**
   * Lấy ràng buộc ngày từ công việc cha
   */
  async getDateConstraints(parentTaskId: string): Promise<DateConstraints> {
    const { data } = await supabase
      .from('tasks')
      .select('start_date, due_date')
      .eq('id', parentTaskId)
      .single()

    return {
      minStartDate: data?.start_date || null,
      maxDueDate: data?.due_date || null,
    }
  },

  /**
   * Validate ngày của công việc con so với cha
   * - start_date con >= start_date cha
   * - due_date con <= due_date cha
   */
  async validateSubtaskDates(
    parentTaskId: string,
    startDate?: string | null,
    dueDate?: string | null
  ): Promise<ValidationResult> {
    const errors: string[] = []
    const warnings: string[] = []

    // Lấy thông tin cha
    const { data: parent } = await supabase
      .from('tasks')
      .select('start_date, due_date, name')
      .eq('id', parentTaskId)
      .single()

    if (!parent) {
      return { isValid: false, errors: ['Không tìm thấy công việc cha'], warnings }
    }

    // Validate start_date
    if (startDate && parent.start_date) {
      if (compareDates(startDate, parent.start_date) < 0) {
        errors.push(
          `Ngày bắt đầu (${formatDateVN(startDate)}) không được trước ngày bắt đầu của công việc cha (${formatDateVN(parent.start_date)})`
        )
      }
    }

    // Validate due_date
    if (dueDate && parent.due_date) {
      if (compareDates(dueDate, parent.due_date) > 0) {
        errors.push(
          `Hạn hoàn thành (${formatDateVN(dueDate)}) không được sau hạn của công việc cha (${formatDateVN(parent.due_date)})`
        )
      }
    }

    // Warning nếu con không có due_date nhưng cha có
    if (!dueDate && parent.due_date) {
      warnings.push(
        `Nên đặt hạn hoàn thành trước ${formatDateVN(parent.due_date)} (hạn của công việc cha)`
      )
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    }
  },

  /**
   * Tạo công việc con
   */
  async createSubtask(input: CreateSubtaskInput): Promise<SubtaskItem> {
    console.log('➕ [subtaskService.createSubtask] Input:', input)

    // Validate 1: Kiểm tra parent có phải là con không
    const canCreate = await subtaskService.canHaveChildren(input.parent_task_id)
    if (!canCreate.canCreate) {
      throw new Error(canCreate.reason || 'Không thể tạo công việc con')
    }

    // Validate 2: Kiểm tra ràng buộc ngày
    const dateValidation = await subtaskService.validateSubtaskDates(
      input.parent_task_id,
      input.start_date,
      input.due_date
    )
    if (!dateValidation.isValid) {
      throw new Error(dateValidation.errors.join('\n'))
    }

    // Lấy thông tin parent để copy một số field
    const { data: parent } = await supabase
      .from('tasks')
      .select('department_id, assigner_id, start_date, due_date')
      .eq('id', input.parent_task_id)
      .single()

    const insertData = {
      parent_task_id: input.parent_task_id,
      name: input.name,
      description: input.description || null,
      assignee_id: input.assignee_id || null,
      assigner_id: parent?.assigner_id || null,
      department_id: input.department_id || parent?.department_id || null,
      priority: input.priority || 'medium',
      start_date: input.start_date || null,
      due_date: input.due_date || null,
      status: 'draft',
      progress: 0,
    }

    const { data, error } = await supabase
      .from('tasks')
      .insert(insertData)
      .select(`
        *,
        assignee:employees!tasks_assignee_id_fkey(id, code, full_name)
      `)
      .single()

    if (error) {
      console.error('❌ [subtaskService.createSubtask] Error:', error)
      throw error
    }

    console.log('✅ [subtaskService.createSubtask] Created:', data.id)

    // Cập nhật tiến độ & trạng thái cha
    await subtaskService.recalculateParent(input.parent_task_id)

    return mapTaskFromDB(data)
  },

  /**
   * Xóa công việc (kiểm tra nếu có con thì không cho xóa)
   */
  async deleteTask(taskId: string): Promise<void> {
    console.log('🗑️ [subtaskService.deleteTask] Task ID:', taskId)

    // Kiểm tra có con không
    const childCount = await subtaskService.getSubtaskCount(taskId)
    if (childCount > 0) {
      throw new Error(`Không thể xóa công việc này vì còn ${childCount} công việc con. Vui lòng xóa công việc con trước.`)
    }

    // Lấy parent_task_id trước khi xóa
    const { data: task } = await supabase
      .from('tasks')
      .select('parent_task_id')
      .eq('id', taskId)
      .single()

    const parentId = task?.parent_task_id

    // Xóa task
    const { error } = await supabase
      .from('tasks')
      .delete()
      .eq('id', taskId)

    if (error) {
      console.error('❌ [subtaskService.deleteTask] Error:', error)
      throw error
    }

    console.log('✅ [subtaskService.deleteTask] Deleted:', taskId)

    // Nếu là con, cập nhật lại cha
    if (parentId) {
      await subtaskService.recalculateParent(parentId)
    }
  },

  /**
   * Tính toán lại tiến độ và trạng thái của công việc cha
   * Gọi sau khi: tạo/xóa/cập nhật công việc con
   */
  async recalculateParent(parentId: string): Promise<void> {
    console.log('🔄 [subtaskService.recalculateParent] Parent ID:', parentId)

    // Lấy tất cả con
    const { data: children, error } = await supabase
      .from('tasks')
      .select('id, status, progress')
      .eq('parent_task_id', parentId)

    if (error) {
      console.error('❌ [subtaskService.recalculateParent] Error:', error)
      return
    }

    if (!children || children.length === 0) {
      console.log('📝 [subtaskService.recalculateParent] No children, skip')
      return
    }

    // Tính tiến độ trung bình
    const avgProgress = Math.round(
      children.reduce((sum, c) => sum + (c.progress || 0), 0) / children.length
    )

    // Xác định trạng thái cha dựa trên con
    let newStatus = 'draft'
    const statuses = children.map(c => c.status)

    if (statuses.every(s => s === 'completed')) {
      newStatus = 'completed'
    } else if (statuses.some(s => s === 'in_progress')) {
      newStatus = 'in_progress'
    } else if (statuses.some(s => s === 'paused')) {
      newStatus = 'paused'
    } else if (statuses.every(s => s === 'draft')) {
      newStatus = 'draft'
    } else {
      newStatus = 'in_progress' // Default nếu mix
    }

    console.log('📊 [subtaskService.recalculateParent] New values:', { avgProgress, newStatus })

    // Cập nhật cha
    const updateData: Record<string, unknown> = {
      progress: avgProgress,
      status: newStatus,
    }

    // Nếu hoàn thành, set completed_date
    if (newStatus === 'completed') {
      updateData.completed_date = new Date().toISOString()
    }

    const { error: updateError } = await supabase
      .from('tasks')
      .update(updateData)
      .eq('id', parentId)

    if (updateError) {
      console.error('❌ [subtaskService.recalculateParent] Update error:', updateError)
    } else {
      console.log('✅ [subtaskService.recalculateParent] Updated parent')
    }
  },

  /**
   * Cập nhật tiến độ công việc con và tự động cập nhật cha
   */
  async updateSubtaskProgress(taskId: string, progress: number): Promise<SubtaskItem> {
    console.log('📈 [subtaskService.updateSubtaskProgress] Task:', taskId, 'Progress:', progress)

    const updateData: Record<string, unknown> = { progress }

    // Tự động chuyển trạng thái khi đạt 100%
    if (progress >= 100) {
      updateData.status = 'completed'
      updateData.completed_date = new Date().toISOString()
      updateData.progress = 100
    }

    const { data, error } = await supabase
      .from('tasks')
      .update(updateData)
      .eq('id', taskId)
      .select('*, parent_task_id')
      .single()

    if (error) {
      console.error('❌ [subtaskService.updateSubtaskProgress] Error:', error)
      throw error
    }

    // Cập nhật cha nếu có
    if (data.parent_task_id) {
      await subtaskService.recalculateParent(data.parent_task_id)
    }

    return mapTaskFromDB(data)
  },

  /**
   * Cập nhật trạng thái công việc con và tự động cập nhật cha
   */
  async updateSubtaskStatus(taskId: string, status: string): Promise<SubtaskItem> {
    console.log('🔄 [subtaskService.updateSubtaskStatus] Task:', taskId, 'Status:', status)

    const updateData: Record<string, unknown> = { status }

    if (status === 'completed') {
      updateData.completed_date = new Date().toISOString()
      updateData.progress = 100
    }

    const { data, error } = await supabase
      .from('tasks')
      .update(updateData)
      .eq('id', taskId)
      .select('*, parent_task_id')
      .single()

    if (error) {
      console.error('❌ [subtaskService.updateSubtaskStatus] Error:', error)
      throw error
    }

    // Cập nhật cha nếu có
    if (data.parent_task_id) {
      await subtaskService.recalculateParent(data.parent_task_id)
    }

    return mapTaskFromDB(data)
  },

  /**
   * Lấy công việc "anh em" (cùng cha)
   */
  async getSiblings(taskId: string): Promise<SubtaskItem[]> {
    console.log('👥 [subtaskService.getSiblings] Task ID:', taskId)

    // Lấy parent_task_id của task hiện tại
    const { data: task } = await supabase
      .from('tasks')
      .select('parent_task_id')
      .eq('id', taskId)
      .single()

    if (!task?.parent_task_id) {
      return []
    }

    // Lấy tất cả con của cùng cha, trừ task hiện tại
    const { data, error } = await supabase
      .from('tasks')
      .select(`
        *,
        assignee:employees!tasks_assignee_id_fkey(id, code, full_name)
      `)
      .eq('parent_task_id', task.parent_task_id)
      .neq('id', taskId)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('❌ [subtaskService.getSiblings] Error:', error)
      throw error
    }

    return (data || []).map(mapTaskFromDB)
  },

  /**
   * Kiểm tra task có phải là cha không
   */
  async isParentTask(taskId: string): Promise<boolean> {
    const count = await subtaskService.getSubtaskCount(taskId)
    return count > 0
  },

  /**
   * Kiểm tra task có phải là con không
   */
  async isChildTask(taskId: string): Promise<boolean> {
    const { data } = await supabase
      .from('tasks')
      .select('parent_task_id')
      .eq('id', taskId)
      .single()

    return !!data?.parent_task_id
  },

  /**
   * Validate khi cập nhật due_date của công việc cha
   * Kiểm tra xem có con nào vượt hạn mới không
   */
  async validateParentDueDateChange(
    parentTaskId: string,
    newDueDate: string
  ): Promise<ValidationResult> {
    const errors: string[] = []
    const warnings: string[] = []

    // Lấy tất cả con
    const { data: children } = await supabase
      .from('tasks')
      .select('id, code, name, due_date')
      .eq('parent_task_id', parentTaskId)

    if (!children || children.length === 0) {
      return { isValid: true, errors, warnings }
    }

    // Kiểm tra từng con
    const violatingChildren: string[] = []
    
    for (const child of children) {
      if (child.due_date && compareDates(child.due_date, newDueDate) > 0) {
        violatingChildren.push(
          `${child.code || child.id}: ${child.name} (hạn: ${formatDateVN(child.due_date)})`
        )
      }
    }

    if (violatingChildren.length > 0) {
      warnings.push(
        `${violatingChildren.length} công việc con có hạn sau ngày mới (${formatDateVN(newDueDate)}):\n` +
        violatingChildren.join('\n')
      )
    }

    return {
      isValid: true, // Chỉ warning, không block
      errors,
      warnings,
    }
  },

  /**
   * Cascade trạng thái từ cha xuống con
   * Gọi khi cha chuyển sang Cancelled hoặc On Hold
   */
  async cascadeStatusToChildren(
    parentTaskId: string,
    newStatus: 'cancelled' | 'paused'
  ): Promise<{ success: boolean; updatedCount: number; error?: string }> {
    console.log('🔄 [subtaskService.cascadeStatus] Parent:', parentTaskId, 'Status:', newStatus)

    try {
      // Lấy tất cả con chưa completed/cancelled
      const { data: children, error: fetchError } = await supabase
        .from('tasks')
        .select('id')
        .eq('parent_task_id', parentTaskId)
        .not('status', 'in', '("completed","cancelled")')

      if (fetchError) throw fetchError

      if (!children || children.length === 0) {
        return { success: true, updatedCount: 0 }
      }

      const childIds = children.map(c => c.id)

      // Update tất cả con
      const { error: updateError } = await supabase
        .from('tasks')
        .update({ 
          status: newStatus,
          updated_at: new Date().toISOString()
        })
        .in('id', childIds)

      if (updateError) throw updateError

      console.log('✅ [subtaskService.cascadeStatus] Updated:', childIds.length, 'children')
      
      return { success: true, updatedCount: childIds.length }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      console.error('❌ [subtaskService.cascadeStatus] Error:', err)
      return { success: false, updatedCount: 0, error: errorMessage }
    }
  },

  /**
   * Kiểm tra cha có thể chuyển sang Completed không
   * Yêu cầu: Tất cả con phải Completed
   */
  async canParentComplete(parentTaskId: string): Promise<{
    canComplete: boolean
    reason?: string
    incompleteChildren?: Array<{ id: string; code?: string; name: string; status: string }>
  }> {
    // Lấy tất cả con
    const { data: children, error } = await supabase
      .from('tasks')
      .select('id, code, name, status')
      .eq('parent_task_id', parentTaskId)

    if (error) {
      return { canComplete: false, reason: 'Lỗi khi kiểm tra công việc con' }
    }

    // Không có con -> cho phép complete
    if (!children || children.length === 0) {
      return { canComplete: true }
    }

    // Tìm con chưa completed
    const incompleteChildren = children.filter(c => c.status !== 'completed')

    if (incompleteChildren.length > 0) {
      return {
        canComplete: false,
        reason: `Còn ${incompleteChildren.length}/${children.length} công việc con chưa hoàn thành`,
        incompleteChildren: incompleteChildren.map(c => ({
          id: c.id,
          code: c.code,
          name: c.name,
          status: c.status,
        })),
      }
    }

    return { canComplete: true }
  },

  /**
   * Kiểm tra cha có thể chuyển sang trạng thái mới không
   */
  async validateParentStatusChange(
    parentTaskId: string,
    newStatus: string
  ): Promise<ValidationResult> {
    const errors: string[] = []
    const warnings: string[] = []

    // Nếu chuyển sang Completed, kiểm tra tất cả con đã completed
    if (newStatus === 'completed') {
      const result = await subtaskService.canParentComplete(parentTaskId)
      
      if (!result.canComplete) {
        errors.push(result.reason || 'Không thể hoàn thành công việc cha')
        
        if (result.incompleteChildren && result.incompleteChildren.length <= 5) {
          errors.push('Công việc con chưa hoàn thành:')
          result.incompleteChildren.forEach(c => {
            errors.push(`  - ${c.code || c.id}: ${c.name}`)
          })
        }
      }
    }

    // Nếu chuyển sang Cancelled hoặc On Hold, cảnh báo cascade
    if (newStatus === 'cancelled' || newStatus === 'paused') {
      const count = await subtaskService.getSubtaskCount(parentTaskId)
      
      if (count > 0) {
        const statusLabel = newStatus === 'cancelled' ? 'Đã hủy' : 'Tạm dừng'
        warnings.push(
          `${count} công việc con sẽ tự động chuyển sang trạng thái "${statusLabel}"`
        )
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    }
  }
}

// Export default
export default subtaskService