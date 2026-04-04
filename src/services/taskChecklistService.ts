// ============================================================================
// TASK CHECKLIST SERVICE — Quản lý checklist trong công việc
// File: src/services/taskChecklistService.ts
// ============================================================================

import { supabase } from '../lib/supabase'

export interface ChecklistItem {
  id: string
  task_id: string
  title: string
  is_completed: boolean
  completed_at: string | null
  completed_by: string | null
  sort_order: number
  created_at: string
  requires_evidence?: boolean
  evidence_url?: string | null
  evidence_urls?: string[] | null
  evidence_note?: string | null
}

export interface CreateChecklistData {
  task_id: string
  title: string
  sort_order?: number
}

export const taskChecklistService = {

  async getByTaskId(taskId: string): Promise<ChecklistItem[]> {
    const { data, error } = await supabase
      .from('task_checklist_items')
      .select('*')
      .eq('task_id', taskId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })

    if (error) throw error
    return (data || []) as ChecklistItem[]
  },

  async create(item: CreateChecklistData): Promise<ChecklistItem> {
    // Auto sort_order nếu không truyền
    if (item.sort_order === undefined) {
      const { data: existing } = await supabase
        .from('task_checklist_items')
        .select('sort_order')
        .eq('task_id', item.task_id)
        .order('sort_order', { ascending: false })
        .limit(1)

      item.sort_order = (existing?.[0]?.sort_order ?? -1) + 1
    }

    const { data, error } = await supabase
      .from('task_checklist_items')
      .insert(item)
      .select('*')
      .single()

    if (error) throw error
    return data as ChecklistItem
  },

  async createBulk(taskId: string, titles: (string | { title: string; requires_evidence?: boolean })[]): Promise<ChecklistItem[]> {
    const items = titles.map((item, i) => {
      const isObj = typeof item === 'object'
      return {
        task_id: taskId,
        title: isObj ? item.title : item,
        sort_order: i,
        requires_evidence: isObj ? (item.requires_evidence || false) : false,
      }
    })

    const { data, error } = await supabase
      .from('task_checklist_items')
      .insert(items)
      .select('*')

    if (error) throw error
    return (data || []) as ChecklistItem[]
  },

  async toggle(id: string, isCompleted: boolean, userId?: string): Promise<ChecklistItem> {
    const { data, error } = await supabase
      .from('task_checklist_items')
      .update({
        is_completed: isCompleted,
        completed_at: isCompleted ? new Date().toISOString() : null,
        completed_by: isCompleted ? userId || null : null,
      })
      .eq('id', id)
      .select('*')
      .single()

    if (error) throw error
    return data as ChecklistItem
  },

  async updateTitle(id: string, title: string): Promise<ChecklistItem> {
    const { data, error } = await supabase
      .from('task_checklist_items')
      .update({ title })
      .eq('id', id)
      .select('*')
      .single()

    if (error) throw error
    return data as ChecklistItem
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('task_checklist_items')
      .delete()
      .eq('id', id)

    if (error) throw error
  },

  async reorder(items: { id: string; sort_order: number }[]): Promise<void> {
    for (const item of items) {
      await supabase
        .from('task_checklist_items')
        .update({ sort_order: item.sort_order })
        .eq('id', item.id)
    }
  },

  getProgress(items: ChecklistItem[]): { completed: number; total: number; percent: number } {
    const total = items.length
    const completed = items.filter(i => i.is_completed).length
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0
    return { completed, total, percent }
  },
}
