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
      status: 'in_progress',
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
