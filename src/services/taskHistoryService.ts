import { supabase } from '../lib/supabase'

export interface TaskStatusChange {
  id: string
  task_id: string
  old_status: string
  new_status: string
  changed_by: string
  changed_by_name: string
  changed_at: string
  notes: string | null
}

export const taskHistoryService = {
  async getHistory(taskId: string): Promise<TaskStatusChange[]> {
    const { data } = await supabase
      .from('task_status_history')
      .select('*')
      .eq('task_id', taskId)
      .order('changed_at', { ascending: true })
    return data || []
  },

  async logStatusChange(
    taskId: string,
    oldStatus: string,
    newStatus: string,
    userId: string,
    userName: string,
    notes?: string
  ): Promise<void> {
    await supabase.from('task_status_history').insert({
      task_id: taskId,
      old_status: oldStatus,
      new_status: newStatus,
      changed_by: userId,
      changed_by_name: userName,
      changed_at: new Date().toISOString(),
      notes: notes || null,
    })
  },
}
