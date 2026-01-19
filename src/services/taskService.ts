import { supabase } from '../lib/supabase'
import type { 
  Task, TaskDetail, CreateTaskInput, UpdateTaskInput, 
  TaskFilter, TaskListResponse 
} from '../types'
 
export const taskService = {
  // Lấy danh sách công việc với filter và pagination
  async getAll(
    page: number = 1,
    limit: number = 10,
    filter?: TaskFilter
  ): Promise<TaskListResponse> {
    let query = supabase
      .from('tasks')
      .select(`
        *,
        department:departments!tasks_department_id_fkey(id, code, name),
        assigner:employees!tasks_assigner_id_fkey(id, code, full_name),
        assignee:employees!tasks_assignee_id_fkey(id, code, full_name),
        parent_task:tasks!tasks_parent_task_id_fkey(id, code, name)
      `, { count: 'exact' })
 
    // Apply filters
    if (filter?.search) {
      query = query.or(`name.ilike.%${filter.search}%,code.ilike.%${filter.search}%`)
    }
    if (filter?.department_id) {
      query = query.eq('department_id', filter.department_id)
    }
    if (filter?.assignee_id) {
      query = query.eq('assignee_id', filter.assignee_id)
    }
    if (filter?.assigner_id) {
      query = query.eq('assigner_id', filter.assigner_id)
    }
    if (filter?.status) {
      if (Array.isArray(filter.status)) {
        query = query.in('status', filter.status)
      } else {
        query = query.eq('status', filter.status)
      }
    }
    if (filter?.priority) {
      if (Array.isArray(filter.priority)) {
        query = query.in('priority', filter.priority)
      } else {
        query = query.eq('priority', filter.priority)
      }
    }
    if (filter?.due_date_from) {
      query = query.gte('due_date', filter.due_date_from)
    }
    if (filter?.due_date_to) {
      query = query.lte('due_date', filter.due_date_to)
    }
    if (filter?.has_parent === false) {
      query = query.is('parent_task_id', null)
    }
 
    // Pagination
    const from = (page - 1) * limit
    const to = from + limit - 1
 
    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, to)
 
    if (error) throw error
 
    return {
      data: data || [],
      total: count || 0,
      page,
      limit
    }
  },
 
  // Lấy chi tiết công việc theo ID
  async getById(id: string): Promise<Task | null> {
    const { data, error } = await supabase
      .from('tasks')
      .select(`
        *,
        department:departments!tasks_department_id_fkey(id, code, name),
        assigner:employees!tasks_assigner_id_fkey(id, code, full_name),
        assignee:employees!tasks_assignee_id_fkey(id, code, full_name),
        parent_task:tasks!tasks_parent_task_id_fkey(id, code, name),
        subtasks:tasks!tasks_parent_task_id_fkey(id, code, name, status, priority, progress)
      `)
      .eq('id', id)
      .single()
 
    if (error) throw error
    return data
  },
 
  // Tạo công việc mới
  async create(input: CreateTaskInput): Promise<Task> {
    const { data, error } = await supabase
      .from('tasks')
      .insert(input)
      .select()
      .single()
 
    if (error) throw error
    return data
  },
 
  // Cập nhật công việc
  async update(id: string, input: UpdateTaskInput): Promise<Task> {
    const { data, error } = await supabase
      .from('tasks')
      .update(input)
      .eq('id', id)
      .select()
      .single()
 
    if (error) throw error
    return data
  },
 
  // Xóa công việc
  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('tasks')
      .delete()
      .eq('id', id)
 
    if (error) throw error
  },
 
  // Cập nhật trạng thái
  async updateStatus(id: string, status: string): Promise<Task> {
    const updateData: UpdateTaskInput = { status: status as any }
    
    if (status === 'completed') {
      updateData.completed_date = new Date().toISOString()
      updateData.progress = 100
    }
 
    return this.update(id, updateData)
  },
 
  // Cập nhật tiến độ
  async updateProgress(id: string, progress: number): Promise<Task> {
    return this.update(id, { progress })
  },
 
  // Lấy subtasks
  async getSubtasks(parentId: string): Promise<Task[]> {
    const { data, error } = await supabase
      .from('tasks')
      .select(`
        *,
        assignee:employees!tasks_assignee_id_fkey(id, code, full_name)
      `)
      .eq('parent_task_id', parentId)
      .order('created_at', { ascending: true })
 
    if (error) throw error
    return data || []
  },
 
  // Thống kê công việc theo phòng ban
  async getStatsByDepartment(departmentId?: string) {
    let query = supabase
      .from('tasks')
      .select('status, department_id')
 
    if (departmentId) {
      query = query.eq('department_id', departmentId)
    }
 
    const { data, error } = await query
 
    if (error) throw error
 
    const stats = {
      total: data?.length || 0,
      new: data?.filter(t => t.status === 'new').length || 0,
      in_progress: data?.filter(t => t.status === 'in_progress').length || 0,
      pending_review: data?.filter(t => t.status === 'pending_review').length || 0,
      completed: data?.filter(t => t.status === 'completed').length || 0,
      cancelled: data?.filter(t => t.status === 'cancelled').length || 0,
      on_hold: data?.filter(t => t.status === 'on_hold').length || 0,
    }
 
    return stats
  }
}
