// ============================================================================
// TASK TEMPLATE SERVICE — Sprint 4 (M3 merge)
// File: src/services/taskTemplateService.ts
// ============================================================================
// Sprint 4 M3: Hợp nhất taskRecurringService vào đây.
// Templates + Recurring rules cùng nghiệp vụ "định nghĩa task lặp lại" →
// để cùng 1 service.
// ============================================================================

import { supabase } from '../lib/supabase'

export interface TaskTemplate {
  id: string
  name: string
  description: string | null
  category: string
  default_priority: string
  default_duration_days: number
  department_id: string | null
  default_assignee_id: string | null
  checklist_items: Array<{ title: string }>
  tags: string[] | null
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface CreateTemplateData {
  name: string
  description?: string
  category?: string
  default_priority?: string
  default_duration_days?: number
  department_id?: string
  default_assignee_id?: string
  checklist_items?: Array<{ title: string }>
  tags?: string[]
}

export const TEMPLATE_CATEGORIES = {
  production: { label: 'Sản xuất', color: 'blue' },
  qc: { label: 'QC / Kiểm tra', color: 'green' },
  maintenance: { label: 'Bảo trì', color: 'orange' },
  report: { label: 'Báo cáo', color: 'purple' },
  inventory: { label: 'Kho / Kiểm kê', color: 'cyan' },
  general: { label: 'Chung', color: 'default' },
}

export const taskTemplateService = {
  async getAll(activeOnly = true): Promise<TaskTemplate[]> {
    let query = supabase.from('task_templates').select('*').order('category').order('name')
    if (activeOnly) query = query.eq('is_active', true)
    const { data, error } = await query
    if (error) throw error
    return (data || []) as TaskTemplate[]
  },

  async getById(id: string): Promise<TaskTemplate | null> {
    const { data, error } = await supabase.from('task_templates').select('*').eq('id', id).single()
    if (error) return null
    return data as TaskTemplate
  },

  async create(template: CreateTemplateData, userId?: string): Promise<TaskTemplate> {
    const { data, error } = await supabase.from('task_templates').insert({
      ...template,
      checklist_items: JSON.stringify(template.checklist_items || []),
      created_by: userId || null,
    }).select('*').single()
    if (error) throw error
    return data as TaskTemplate
  },

  async update(id: string, updates: Partial<CreateTemplateData>): Promise<TaskTemplate> {
    const payload: any = { ...updates, updated_at: new Date().toISOString() }
    if (updates.checklist_items) payload.checklist_items = JSON.stringify(updates.checklist_items)
    const { data, error } = await supabase.from('task_templates').update(payload).eq('id', id).select('*').single()
    if (error) throw error
    return data as TaskTemplate
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('task_templates').update({ is_active: false }).eq('id', id)
    if (error) throw error
  },

  // Create task from template
  async createTaskFromTemplate(templateId: string, overrides?: {
    assignee_id?: string
    department_id?: string
    due_date?: string
    name_suffix?: string
  }): Promise<string> {
    const template = await this.getById(templateId)
    if (!template) throw new Error('Template không tồn tại')

    const dueDate = overrides?.due_date || new Date(Date.now() + template.default_duration_days * 86400000).toISOString().split('T')[0]
    const taskName = overrides?.name_suffix ? `${template.name} — ${overrides.name_suffix}` : template.name

    // Create task
    const { data: task, error } = await supabase.from('tasks').insert({
      name: taskName,
      description: template.description,
      priority: template.default_priority,
      status: 'draft',
      progress: 0,
      due_date: dueDate,
      assignee_id: overrides?.assignee_id || template.default_assignee_id || null,
      department_id: overrides?.department_id || template.department_id || null,
    }).select('id').single()

    if (error) throw error

    // Create checklist items
    const checklistItems = (typeof template.checklist_items === 'string'
      ? JSON.parse(template.checklist_items)
      : template.checklist_items) as Array<{ title: string }>

    if (checklistItems.length > 0) {
      const items = checklistItems.map((item, i) => ({
        task_id: task.id,
        title: item.title,
        sort_order: i,
      }))
      await supabase.from('task_checklist_items').insert(items)
    }

    return task.id
  },
}

// ============================================================================
// RECURRING RULES (merged from taskRecurringService — Sprint 4 M3)
// ============================================================================

export interface RecurringRule {
  id: string
  template_id: string | null
  name: string
  frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly'
  day_of_week: number | null
  day_of_month: number | null
  time_of_day: string
  assignee_id: string | null
  assignee_ids: string[] | null
  department_id: string | null
  is_active: boolean
  last_generated_at: string | null
  next_generation_at: string | null
  created_by: string | null
  created_at: string
  template?: { id: string; name: string; category: string; checklist_items: any }
}

export interface CreateRecurringData {
  template_id?: string
  name: string
  frequency: string
  day_of_week?: number
  day_of_month?: number
  time_of_day?: string
  assignee_id?: string
  assignee_ids?: string[]
  department_id?: string
}

export const DAY_LABELS = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7']
export const FREQ_LABELS: Record<string, string> = {
  daily: 'Hàng ngày',
  weekly: 'Hàng tuần',
  biweekly: 'Hai tuần/lần',
  monthly: 'Hàng tháng',
}

function calculateNextGeneration(frequency: string, dayOfWeek?: number | null, dayOfMonth?: number | null): Date {
  const now = new Date()
  const next = new Date(now)
  next.setHours(8, 0, 0, 0)

  switch (frequency) {
    case 'daily':
      if (now.getHours() >= 8) next.setDate(next.getDate() + 1)
      break
    case 'weekly': {
      const targetDay = dayOfWeek ?? 1
      const currentDay = now.getDay()
      let daysUntil = targetDay - currentDay
      if (daysUntil <= 0) daysUntil += 7
      next.setDate(next.getDate() + daysUntil)
      break
    }
    case 'biweekly':
      next.setDate(next.getDate() + 14)
      break
    case 'monthly': {
      const targetDate = dayOfMonth ?? 1
      next.setDate(targetDate)
      if (next <= now) next.setMonth(next.getMonth() + 1)
      break
    }
  }
  return next
}

export const taskRecurringService = {
  async getAll(): Promise<RecurringRule[]> {
    const { data, error } = await supabase
      .from('task_recurring_rules')
      .select('*, template:task_templates(id, name, category, checklist_items)')
      .order('is_active', { ascending: false })
      .order('name')
    if (error) throw error
    return (data || []) as RecurringRule[]
  },

  async create(rule: CreateRecurringData, userId?: string): Promise<RecurringRule> {
    const nextGen = calculateNextGeneration(rule.frequency, rule.day_of_week, rule.day_of_month)
    const { data, error } = await supabase.from('task_recurring_rules').insert({
      ...rule,
      next_generation_at: nextGen.toISOString(),
      created_by: userId || null,
    }).select('*').single()
    if (error) throw error
    return data as RecurringRule
  },

  async update(id: string, updates: Partial<CreateRecurringData>): Promise<RecurringRule> {
    const payload: any = { ...updates }
    if (updates.frequency || updates.day_of_week !== undefined || updates.day_of_month !== undefined) {
      const nextGen = calculateNextGeneration(
        updates.frequency || 'weekly',
        updates.day_of_week,
        updates.day_of_month
      )
      payload.next_generation_at = nextGen.toISOString()
    }
    const { data, error } = await supabase.from('task_recurring_rules').update(payload).eq('id', id).select('*').single()
    if (error) throw error
    return data as RecurringRule
  },

  async toggleActive(id: string, isActive: boolean): Promise<void> {
    const { error } = await supabase.from('task_recurring_rules').update({ is_active: isActive }).eq('id', id)
    if (error) throw error
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('task_recurring_rules').delete().eq('id', id)
    if (error) throw error
  },

  getFrequencyLabel(rule: RecurringRule): string {
    const freq = FREQ_LABELS[rule.frequency] || rule.frequency
    if (rule.frequency === 'weekly' && rule.day_of_week != null) {
      return `${freq} (${DAY_LABELS[rule.day_of_week]})`
    }
    if (rule.frequency === 'monthly' && rule.day_of_month != null) {
      return `${freq} (ngày ${rule.day_of_month})`
    }
    return freq
  },
}
