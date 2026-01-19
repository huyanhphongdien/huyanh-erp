// src/services/taskService.ts
import { supabase } from '../lib/supabase'
import type { Task, TaskFormData, PaginatedResponse } from '../types'
 
// Interface riêng cho task params
interface TaskPaginationParams {
  page?: number
  pageSize?: number
  search?: string
  status?: string
  priority?: string
  department_id?: string
  assignee_id?: string
}
 
export const taskService = {
  // Lấy danh sách có phân trang
  async getAll(params: TaskPaginationParams): Promise<PaginatedResponse<Task>> {
    const page = params.page || 1
    const pageSize = params.pageSize || 10
    const { search, status, priority, department_id, assignee_id } = params
    
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1
 
    let query = supabase
      .from('tasks')
      .select(`
        *,
        department:departments!tasks_department_id_fkey(id, code, name),
        assigner:employees!tasks_assigner_id_fkey(id, code, full_name),
        assignee:employees!tasks_assignee_id_fkey(id, code, full_name),
        parent_task:tasks!tasks_parent_task_id_fkey(id, code, name)
      `, { count: 'exact' })
 
    if (search) {
      query = query.or(`name.ilike.%${search}%,code.ilike.%${search}%`)
    }
    if (status && status !== 'all') {
      query = query.eq('status', status)
    }
    if (priority && priority !== 'all') {
      query = query.eq('priority', priority)
    }
    if (department_id) {
      query = query.eq('department_id', department_id)
    }
    if (assignee_id) {
      query = query.eq('assignee_id', assignee_id)
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
 
  // Lấy theo ID
  async getById(id: string): Promise<Task | null> {
    const { data, error } = await supabase
      .from('tasks')
      .select(`
        *,
        department:departments!tasks_department_id_fkey(id, code, name),
        assigner:employees!tasks_assigner_id_fkey(id, code, full_name),
        assignee:employees!tasks_assignee_id_fkey(id, code, full_name),
        parent_task:tasks!tasks_parent_task_id_fkey(id, code, name)
      `)
      .eq('id', id)
      .single()
 
    if (error) throw error
    return data
  },
 
  // Tạo mới
  async create(task: TaskFormData): Promise<Task> {
    const { data, error } = await supabase
      .from('tasks')
      .insert(task)
      .select()
      .single()
 
    if (error) throw error
    return data
  },
 
  // Cập nhật
  async update(id: string, task: Partial<TaskFormData>): Promise<Task> {
    const { data, error } = await supabase
      .from('tasks')
      .update(task)
      .eq('id', id)
      .select()
      .single()
 
    if (error) throw error
    return data
  },
 
  // Xóa
  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('tasks')
      .delete()
      .eq('id', id)
 
    if (error) throw error
  },
 
  // Cập nhật trạng thái
  async updateStatus(id: string, status: string): Promise<Task> {
    const updateData: any = { status }
    
    if (status === 'completed') {
      updateData.completed_date = new Date().toISOString()
      updateData.progress = 100
    }
 
    const { data, error } = await supabase
      .from('tasks')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()
 
    if (error) throw error
    return data
  },
 
  // Cập nhật tiến độ
  async updateProgress(id: string, progress: number): Promise<Task> {
    const { data, error } = await supabase
      .from('tasks')
      .update({ progress })
      .eq('id', id)
      .select()
      .single()
 
    if (error) throw error
    return data
  }
}
