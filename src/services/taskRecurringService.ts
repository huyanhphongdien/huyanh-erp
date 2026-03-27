import { supabase } from '../lib/supabase'

export interface RecurringRule {
  id: string
  template_id: string | null
  name: string
  frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly'
  day_of_week: number | null  // 0=Sun, 1=Mon...
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
  // Joined
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

const DAY_LABELS = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7']
const FREQ_LABELS: Record<string, string> = {
  daily: 'Hàng ngày',
  weekly: 'Hàng tuần',
  biweekly: 'Hai tuần/lần',
  monthly: 'Hàng tháng',
}

export { DAY_LABELS, FREQ_LABELS }

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

function calculateNextGeneration(frequency: string, dayOfWeek?: number | null, dayOfMonth?: number | null): Date {
  const now = new Date()
  const next = new Date(now)
  next.setHours(8, 0, 0, 0) // 8 AM

  switch (frequency) {
    case 'daily':
      if (now.getHours() >= 8) next.setDate(next.getDate() + 1)
      break
    case 'weekly': {
      const targetDay = dayOfWeek ?? 1 // Default Monday
      const currentDay = now.getDay()
      let daysUntil = targetDay - currentDay
      if (daysUntil <= 0) daysUntil += 7
      next.setDate(next.getDate() + daysUntil)
      break
    }
    case 'biweekly': {
      // Simply add 14 days from current date
      next.setDate(next.getDate() + 14)
      break
    }
    case 'monthly': {
      const targetDate = dayOfMonth ?? 1
      next.setDate(targetDate)
      if (next <= now) next.setMonth(next.getMonth() + 1)
      break
    }
  }
  return next
}
