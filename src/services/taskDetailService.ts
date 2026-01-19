import { supabase } from '../lib/supabase'
import type { TaskDetail } from '../types'
 
export const taskDetailService = {
  // Lấy chi tiết theo task_id
  async getByTaskId(taskId: string): Promise<TaskDetail | null> {
    const { data, error } = await supabase
      .from('task_details')
      .select('*')
      .eq('task_id', taskId)
      .single()
 
    if (error && error.code !== 'PGRST116') throw error
    return data
  },
 
  // Tạo hoặc cập nhật chi tiết
  async upsert(taskId: string, input: Partial<TaskDetail>): Promise<TaskDetail> {
    const existing = await this.getByTaskId(taskId)
 
    if (existing) {
      const { data, error } = await supabase
        .from('task_details')
        .update(input)
        .eq('task_id', taskId)
        .select()
        .single()
 
      if (error) throw error
      return data
    } else {
      const { data, error } = await supabase
        .from('task_details')
        .insert({ ...input, task_id: taskId })
        .select()
        .single()
 
      if (error) throw error
      return data
    }
  }
}
