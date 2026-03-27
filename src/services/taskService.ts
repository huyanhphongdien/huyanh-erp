// src/services/taskService.ts
// Phase 4.1: Task Management Service (WITH EMAIL INTEGRATION)
// ============================================================
// FIXED: Cập nhật status values khớp với database constraints
// Database: draft, in_progress, paused, finished, cancelled
// UPDATED: Thêm query assigner.position.level cho phân quyền
// FIXED: Handle trường hợp employee không có position
// ============================================================

import { supabase } from '../lib/supabase'
import { notifyTaskAssigned } from './emailService'
import type { Task, CreateTaskInput, UpdateTaskInput, TaskFilter, TaskListResponse } from '../types/task.types'

// Helper: Map database task to UI task (name -> title)
// NOTE: assigner_level sẽ được populate sau qua enrichTasksWithAssignerLevel
const mapTaskFromDB = (dbTask: any): any => {
  return {
    ...dbTask,
    // Map 'name' từ database sang 'title' cho UI
    title: dbTask.name || dbTask.title || '',
    // assigner_level sẽ được set sau
    assigner_level: null,
  }
}

/**
 * Enrich tasks với assigner_level
 * Query positions table một lần với tất cả unique position_ids
 */
async function enrichTasksWithAssignerLevel(tasks: any[]): Promise<any[]> {
  // Lấy unique position_ids từ assigners
  const positionIds = new Set<string>()
  for (const task of tasks) {
    const positionId = task.assigner?.position_id
    if (positionId) {
      positionIds.add(positionId)
    }
  }

  if (positionIds.size === 0) {
    console.log('⚠️ [enrichTasksWithAssignerLevel] No position_ids found')
    return tasks
  }

  console.log('🔍 [enrichTasksWithAssignerLevel] Fetching levels for positions:', Array.from(positionIds))

  // Query positions để lấy level mapping
  const { data: positions, error } = await supabase
    .from('positions')
    .select('id, level, name')
    .in('id', Array.from(positionIds))

  if (error) {
    console.error('❌ [enrichTasksWithAssignerLevel] Error:', error)
    return tasks // Return original tasks if query fails
  }

  // Create mapping position_id -> level
  const levelMap = new Map<string, number>()
  for (const pos of (positions || [])) {
    levelMap.set(pos.id, pos.level)
  }

  console.log('✅ [enrichTasksWithAssignerLevel] Level map:', Object.fromEntries(levelMap))

  // Enrich tasks with assigner_level
  return tasks.map(task => {
    const positionId = task.assigner?.position_id
    const level = positionId ? levelMap.get(positionId) : null
    return {
      ...task,
      assigner_level: level ?? null,
    }
  })
}

// Helper: Map UI task to database task (title -> name)
const mapTaskToDB = (input: CreateTaskInput | UpdateTaskInput): any => {
  const { title, ...rest } = input as any
  return {
    ...rest,
    // Map 'title' từ UI sang 'name' cho database
    name: title || input.name,
  }
}

export const taskService = {
  /**
   * Lấy danh sách công việc có filter và phân trang
   * UPDATED: Thêm query assigner position level
   * FIXED: Handle trường hợp không có position
   */
  async getAll(
    page = 1, 
    pageSize = 10, 
    filter?: TaskFilter
  ): Promise<TaskListResponse> {
    console.log('🔍 [taskService.getAll] Called with:', { page, pageSize, filter })

    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    // Build query với relations
    // NOTE: KHÔNG query nested position để tránh lỗi khi employee không có position_id
    // assigner_level sẽ được enrich sau qua enrichTasksWithAssignerLevel
    let query = supabase
      .from('tasks')
      .select(`
        *,
        department:departments(id, code, name),
        assigner:employees!tasks_assigner_id_fkey(
          id, 
          code, 
          full_name,
          department_id,
          position_id
        ),
        assignee:employees!tasks_assignee_id_fkey(
          id, 
          code, 
          full_name,
          department_id
        )
      `, { count: 'exact' })

    // ========== ÁP DỤNG FILTER ==========
    
    // Filter theo search (tìm trong name/title hoặc description)
    if (filter?.search) {
      const searchTerm = `%${filter.search}%`
      query = query.or(`name.ilike.${searchTerm},description.ilike.${searchTerm}`)
      console.log('🔍 Applied search filter:', filter.search)
    }

    // Filter theo phòng ban
    if (filter?.department_id) {
      query = query.eq('department_id', filter.department_id)
      console.log('🏢 Applied department filter:', filter.department_id)
    }

    // Filter theo người phụ trách
    if (filter?.assignee_id) {
      query = query.eq('assignee_id', filter.assignee_id)
      console.log('👤 Applied assignee filter:', filter.assignee_id)
    }

    // Filter theo người giao
    if (filter?.assigner_id) {
      query = query.eq('assigner_id', filter.assigner_id)
      console.log('👤 Applied assigner filter:', filter.assigner_id)
    }

    // Filter theo trạng thái
    if (filter?.status) {
      if (Array.isArray(filter.status)) {
        query = query.in('status', filter.status)
      } else {
        query = query.eq('status', filter.status)
      }
      console.log('📊 Applied status filter:', filter.status)
    }

    // Filter theo độ ưu tiên
    if (filter?.priority) {
      if (Array.isArray(filter.priority)) {
        query = query.in('priority', filter.priority)
      } else {
        query = query.eq('priority', filter.priority)
      }
      console.log('⚡ Applied priority filter:', filter.priority)
    }

    // Filter theo project
    if (filter?.project_id) {
      query = query.eq('project_id', filter.project_id)
    }

    // Filter theo ngày bắt đầu
    if (filter?.start_date_from) {
      query = query.gte('start_date', filter.start_date_from)
    }
    if (filter?.start_date_to) {
      query = query.lte('start_date', filter.start_date_to)
    }

    // Filter theo ngày kết thúc (due_date)
    if (filter?.due_date_from) {
      query = query.gte('due_date', filter.due_date_from)
    }
    if (filter?.due_date_to) {
      query = query.lte('due_date', filter.due_date_to)
    }

    // Filter công việc có/không có parent
    if (filter?.has_parent === true) {
      query = query.not('parent_task_id', 'is', null)
    } else if (filter?.has_parent === false) {
      query = query.is('parent_task_id', null)
    }

    // Filter công việc quá hạn
    if (filter?.is_overdue === true) {
      const today = new Date().toISOString().split('T')[0]
      query = query
        .lt('due_date', today)
        .not('status', 'eq', 'finished')
        .not('status', 'eq', 'cancelled')
    }

    // Filter công việc tự giao
    if (filter?.is_self_assigned !== undefined) {
      query = query.eq('is_self_assigned', filter.is_self_assigned)
    }

    // Sắp xếp và phân trang
    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, to)

    if (error) {
      console.error('❌ [taskService.getAll] Error:', error)
      throw error
    }

    // Map data từ database sang UI format
    let mappedData = (data || []).map(mapTaskFromDB)

    // Enrich với assigner_level
    mappedData = await enrichTasksWithAssignerLevel(mappedData)

    console.log('✅ [taskService.getAll] Result:', { 
      count, 
      returned: mappedData.length,
      page,
      pageSize
    })

    return {
      data: mappedData,
      total: count || 0,
      page,
      pageSize,
      totalPages: Math.ceil((count || 0) / pageSize)
    }
  },

  /**
   * Lấy công việc theo ID
   */
  async getById(id: string): Promise<Task | null> {
    console.log('🔍 [taskService.getById] ID:', id)

    const { data, error } = await supabase
      .from('tasks')
      .select(`
        *,
        department:departments(id, code, name),
        assigner:employees!tasks_assigner_id_fkey(
          id, 
          code, 
          full_name,
          department_id,
          position_id
        ),
        assignee:employees!tasks_assignee_id_fkey(
          id, 
          code, 
          full_name,
          department_id
        ),
        parent_task:tasks!tasks_parent_task_id_fkey(id, code, name)
      `)
      .eq('id', id)
      .single()

    if (error) {
      console.error('❌ [taskService.getById] Error:', error)
      throw error
    }

    if (!data) return null

    // Map và enrich
    const mapped = mapTaskFromDB(data)
    const enriched = await enrichTasksWithAssignerLevel([mapped])
    return enriched[0] || null
  },

  /**
   * Tạo công việc mới + GỬI EMAIL CHO NGƯỜI ĐƯỢC GIAO
   */
  async create(input: CreateTaskInput): Promise<Task> {
    console.log('📝 [taskService.create] Input:', input)

    const dbInput = mapTaskToDB(input)

    const { data, error } = await supabase
      .from('tasks')
      .insert(dbInput)
      .select()
      .single()

    if (error) {
      console.error('❌ [taskService.create] Error:', error)
      throw error
    }

    console.log('✅ [taskService.create] Created:', data.id)

    // GỬI EMAIL CHO NGƯỜI ĐƯỢC GIAO (assignee)
    if (data.assignee_id && data.assigner_id && data.assignee_id !== data.assigner_id) {
      console.log('📧 [taskService.create] Sending email to assignee:', data.assignee_id)
      notifyTaskAssigned(
        data.id,
        data.assignee_id,
        data.assigner_id,
        {
          code: data.code,
          name: data.name,
          description: data.description,
          priority: data.priority,
          due_date: data.due_date,
        }
      ).catch(err => console.error('📧 Email error (non-blocking):', err))
    }

    return mapTaskFromDB(data)
  },

  /**
   * Cập nhật công việc + GỬI EMAIL NẾU ĐỔI NGƯỜI PHỤ TRÁCH
   */
  async update(id: string, input: UpdateTaskInput): Promise<Task> {
    console.log('📝 [taskService.update] ID:', id, 'Input:', input)

    // Lấy thông tin task hiện tại để so sánh
    const { data: currentTask } = await supabase
      .from('tasks')
      .select('assignee_id, assigner_id, code, name, description, priority, due_date')
      .eq('id', id)
      .single()

    const dbInput = mapTaskToDB(input)

    const { data, error } = await supabase
      .from('tasks')
      .update(dbInput)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('❌ [taskService.update] Error:', error)
      throw error
    }

    console.log('✅ [taskService.update] Updated:', id)

    // Nếu đổi người phụ trách, gửi email cho người mới
    if (
      input.assignee_id && 
      currentTask?.assignee_id !== input.assignee_id &&
      data.assigner_id
    ) {
      console.log('📧 [taskService.update] Assignee changed, sending email to:', input.assignee_id)
      notifyTaskAssigned(
        id,
        input.assignee_id,
        data.assigner_id,
        {
          code: data.code,
          name: data.name,
          description: data.description,
          priority: data.priority,
          due_date: data.due_date,
        }
      ).catch(err => console.error('📧 Email error (non-blocking):', err))
    }

    return mapTaskFromDB(data)
  },

  /**
   * Xóa công việc
   */
  async delete(id: string): Promise<void> {
    console.log('🗑️ [taskService.delete] ID:', id)

    const { error } = await supabase
      .from('tasks')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('❌ [taskService.delete] Error:', error)
      throw error
    }

    console.log('✅ [taskService.delete] Deleted:', id)
  },

  /**
   * Cập nhật trạng thái công việc
   */
  async updateStatus(id: string, status: string): Promise<Task> {
    console.log('📊 [taskService.updateStatus] ID:', id, 'Status:', status)

    const updateData: Record<string, any> = { status }

    if (status === 'finished') {
      updateData.completed_date = new Date().toISOString()
      updateData.progress = 100
    }

    const { data, error } = await supabase
      .from('tasks')
      .update(updateData)
      .eq('id', id)
      .select('*, parent_task_id')
      .single()

    if (error) {
      console.error('❌ [taskService.updateStatus] Error:', error)
      throw error
    }

    // Auto-sync parent progress if this is a subtask
    if (data.parent_task_id) {
      await this._recalcParentProgress(data.parent_task_id)
    }

    console.log('✅ [taskService.updateStatus] Updated:', id)
    return mapTaskFromDB(data)
  },

  /**
   * Cập nhật tiến độ công việc
   */
  async updateProgress(id: string, progress: number): Promise<Task> {
    console.log('📈 [taskService.updateProgress] ID:', id, 'Progress:', progress)

    const updateData: Record<string, any> = { progress }

    if (progress >= 100) {
      updateData.status = 'finished'
      updateData.completed_date = new Date().toISOString()
      updateData.progress = 100
    }

    const { data, error } = await supabase
      .from('tasks')
      .update(updateData)
      .eq('id', id)
      .select('*, parent_task_id')
      .single()

    if (error) {
      console.error('❌ [taskService.updateProgress] Error:', error)
      throw error
    }

    // Auto-sync parent progress if this is a subtask
    if (data.parent_task_id) {
      await this._recalcParentProgress(data.parent_task_id)
    }

    console.log('✅ [taskService.updateProgress] Updated:', id)
    return mapTaskFromDB(data)
  },

  /**
   * Lấy công việc con của một task
   */
  async getSubtasks(parentId: string): Promise<Task[]> {
    console.log('🔍 [taskService.getSubtasks] Parent ID:', parentId)

    const { data, error } = await supabase
      .from('tasks')
      .select(`
        *,
        assignee:employees!tasks_assignee_id_fkey(id, code, full_name)
      `)
      .eq('parent_task_id', parentId)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('❌ [taskService.getSubtasks] Error:', error)
      throw error
    }

    return (data || []).map(mapTaskFromDB)
  },

  /**
   * Đếm số công việc theo các trạng thái
   */
  async getStatusCounts(filter?: Partial<TaskFilter>): Promise<Record<string, number>> {
    console.log('📊 [taskService.getStatusCounts] Filter:', filter)

    let query = supabase
      .from('tasks')
      .select('status', { count: 'exact' })

    if (filter?.department_id) {
      query = query.eq('department_id', filter.department_id)
    }
    if (filter?.assignee_id) {
      query = query.eq('assignee_id', filter.assignee_id)
    }

    const { data, error } = await query

    if (error) {
      console.error('❌ [taskService.getStatusCounts] Error:', error)
      throw error
    }

    const counts: Record<string, number> = {
      all: data?.length || 0,
      draft: 0,
      in_progress: 0,
      paused: 0,
      finished: 0,
      cancelled: 0,
    }

    data?.forEach((item: any) => {
      if (counts[item.status] !== undefined) {
        counts[item.status]++
      }
    })

    console.log('✅ [taskService.getStatusCounts] Result:', counts)
    return counts
  },

  /**
   * Giao việc cho nhân viên + GỬI EMAIL
   */
  async assignTask(taskId: string, assigneeId: string, assignerId: string): Promise<Task> {
    console.log('👤 [taskService.assignTask] Task:', taskId, 'Assignee:', assigneeId)

    // Lấy thông tin task hiện tại
    const { data: currentTask } = await supabase
      .from('tasks')
      .select('assignee_id, status, progress, code, name, description, priority, due_date')
      .eq('id', taskId)
      .single()

    const updateData: Record<string, any> = { 
      assignee_id: assigneeId,
      assigner_id: assignerId,
      updated_at: new Date().toISOString()
    }

    if (currentTask?.status === 'draft') {
      updateData.status = 'in_progress'
      if (!currentTask.progress || currentTask.progress === 0) {
        updateData.progress = 1
      }
      console.log('📊 [taskService.assignTask] Changing status from draft to in_progress')
    }

    const { data, error } = await supabase
      .from('tasks')
      .update(updateData)
      .eq('id', taskId)
      .select(`
        *,
        department:departments(id, code, name),
        assigner:employees!tasks_assigner_id_fkey(
          id, 
          code, 
          full_name,
          department_id,
          position_id
        ),
        assignee:employees!tasks_assignee_id_fkey(
          id, 
          code, 
          full_name,
          department_id
        )
      `)
      .single()

    if (error) {
      console.error('❌ [taskService.assignTask] Error:', error)
      throw error
    }

    console.log('✅ [taskService.assignTask] Assigned:', taskId, 'to', assigneeId, 'status:', data.status)

    if (assigneeId !== assignerId) {
      console.log('📧 [taskService.assignTask] Sending email to assignee:', assigneeId)
      notifyTaskAssigned(
        taskId,
        assigneeId,
        assignerId,
        {
          code: data.code,
          name: data.name,
          description: data.description,
          priority: data.priority,
          due_date: data.due_date,
        }
      ).catch(err => console.error('📧 Email error (non-blocking):', err))
    }

    // Map và enrich
    const mapped = mapTaskFromDB(data)
    const enriched = await enrichTasksWithAssignerLevel([mapped])
    return enriched[0] || mapped
  },

  /**
   * Tính lại tiến độ của công việc cha từ các công việc con
   * Gọi tự động khi cập nhật status/progress của subtask
   */
  async _recalcParentProgress(parentTaskId: string): Promise<void> {
    console.log('🔄 [taskService._recalcParentProgress] Parent:', parentTaskId)

    // 1. Get all subtasks
    const { data: subtasks, error } = await supabase
      .from('tasks')
      .select('progress, status')
      .eq('parent_task_id', parentTaskId)

    if (error) {
      console.error('❌ [taskService._recalcParentProgress] Error:', error)
      return
    }

    if (!subtasks || subtasks.length === 0) return

    // 2. Calculate average progress
    const avgProgress = Math.round(
      subtasks.reduce((sum, t) => sum + (t.progress || 0), 0) / subtasks.length
    )

    // 3. Update parent
    const updateData: Record<string, any> = { progress: avgProgress }
    if (avgProgress >= 100) {
      updateData.status = 'finished'
      updateData.completed_date = new Date().toISOString()
    }

    const { error: updateError } = await supabase
      .from('tasks')
      .update(updateData)
      .eq('id', parentTaskId)

    if (updateError) {
      console.error('❌ [taskService._recalcParentProgress] Update error:', updateError)
    } else {
      console.log('✅ [taskService._recalcParentProgress] Updated parent:', parentTaskId, '-> progress:', avgProgress)
    }
  }
}

export default taskService