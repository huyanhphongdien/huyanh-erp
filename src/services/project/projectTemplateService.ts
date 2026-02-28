// src/services/project/projectTemplateService.ts
// Quản lý project templates — dự án mẫu (PM2 - Bước 2.2)
// Template = project có is_template=true
// Clone: copy project header + phases + milestones, KHÔNG copy members/tasks/risks

import { supabase } from '../../lib/supabase'

// ============================================
// INTERFACES
// ============================================

export interface ProjectTemplate {
  id: string
  code: string
  name: string
  description?: string
  category_id?: string
  priority: string
  tags?: string[]
  
  // Thông tin template
  is_template: boolean
  
  // Join data
  category_name?: string
  category_color?: string
  category_icon?: string
  phase_count?: number
  milestone_count?: number
  
  created_at: string
  updated_at: string
}

export interface ProjectTemplatePhase {
  id: string
  project_id: string
  name: string
  description?: string
  order_index: number
  planned_start?: string    // DATE from project_phases table
  planned_end?: string      // DATE from project_phases table
  actual_start?: string
  actual_end?: string
  status: string
  progress_pct: number
  color?: string
  created_at: string
  updated_at: string
}

export interface ProjectTemplateMilestone {
  id: string
  project_id: string
  phase_id?: string
  name: string
  description?: string
  due_date: string            // DATE from project_milestones table
  completed_date?: string
  status: string
  assignee_id?: string
  deliverables?: any[]        // JSONB
  created_at: string
  updated_at: string
}

export interface CreateFromTemplateInput {
  template_id: string
  // Overrides cho dự án mới
  name: string
  code?: string
  description?: string
  category_id?: string
  planned_start?: string       // ISO date
  planned_end?: string
  owner_id?: string
  sponsor_id?: string
  department_id?: string
  priority?: string
  tags?: string[]
}

export interface TemplateDetail extends ProjectTemplate {
  phases: ProjectTemplatePhase[]
  milestones: ProjectTemplateMilestone[]
}

// ============================================
// SERVICE
// ============================================

export const projectTemplateService = {

  /**
   * Lấy danh sách templates
   */
  async getTemplates(params: {
    search?: string
    category_id?: string
    page?: number
    pageSize?: number
  } = {}): Promise<{
    data: ProjectTemplate[]
    total: number
    page: number
    pageSize: number
    totalPages: number
  }> {
    const page = params.page || 1
    const pageSize = params.pageSize || 20
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    let query = supabase
      .from('projects')
      .select(`
        id, code, name, description, category_id, priority, tags,
        is_template, created_at, updated_at,
        project_categories ( name, color, icon )
      `, { count: 'exact' })
      .eq('is_template', true)

    if (params.search) {
      query = query.or(`name.ilike.%${params.search}%,code.ilike.%${params.search}%`)
    }

    if (params.category_id) {
      query = query.eq('category_id', params.category_id)
    }

    const { data, error, count } = await query
      .order('name', { ascending: true })
      .range(from, to)

    if (error) throw error

    // Enrich với phase/milestone count
    const enriched: ProjectTemplate[] = await Promise.all(
      (data || []).map(async (tmpl: any) => {
        const [phaseRes, msRes] = await Promise.all([
          supabase
            .from('project_phases')
            .select('id', { count: 'exact', head: true })
            .eq('project_id', tmpl.id),
          supabase
            .from('project_milestones')
            .select('id', { count: 'exact', head: true })
            .eq('project_id', tmpl.id)
        ])

        return {
          ...tmpl,
          category_name: tmpl.project_categories?.name,
          category_color: tmpl.project_categories?.color,
          category_icon: tmpl.project_categories?.icon,
          phase_count: phaseRes.count || 0,
          milestone_count: msRes.count || 0,
        }
      })
    )

    return {
      data: enriched,
      total: count || 0,
      page,
      pageSize,
      totalPages: Math.ceil((count || 0) / pageSize)
    }
  },

  /**
   * Lấy chi tiết template (kèm phases + milestones)
   */
  async getTemplateDetail(templateId: string): Promise<TemplateDetail | null> {
    // Lấy project header
    const { data: project, error: projErr } = await supabase
      .from('projects')
      .select(`
        id, code, name, description, category_id, priority, tags,
        is_template, created_at, updated_at,
        project_categories ( name, color, icon )
      `)
      .eq('id', templateId)
      .eq('is_template', true)
      .single()

    if (projErr) {
      if (projErr.code === 'PGRST116') return null
      throw projErr
    }

    // Lấy phases
    const { data: phases, error: phaseErr } = await supabase
      .from('project_phases')
      .select('*')
      .eq('project_id', templateId)
      .order('order_index', { ascending: true })

    if (phaseErr) throw phaseErr

    // Lấy milestones
    const { data: milestones, error: msErr } = await supabase
      .from('project_milestones')
      .select('*')
      .eq('project_id', templateId)
      .order('due_date', { ascending: true })

    if (msErr) throw msErr

    return {
      ...project,
      category_name: (project as any).project_categories?.name,
      category_color: (project as any).project_categories?.color,
      category_icon: (project as any).project_categories?.icon,
      phase_count: (phases || []).length,
      milestone_count: (milestones || []).length,
      phases: phases || [],
      milestones: milestones || [],
    } as TemplateDetail
  },

  /**
   * Đánh dấu dự án hiện có thành template
   */
  async markAsTemplate(projectId: string): Promise<void> {
    const { error } = await supabase
      .from('projects')
      .update({
        is_template: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', projectId)

    if (error) throw error
  },

  /**
   * Bỏ đánh dấu template
   */
  async unmarkTemplate(projectId: string): Promise<void> {
    const { error } = await supabase
      .from('projects')
      .update({
        is_template: false,
        updated_at: new Date().toISOString()
      })
      .eq('id', projectId)

    if (error) throw error
  },

  /**
   * Tạo dự án mới từ template
   * 1. Clone project header (với overrides)
   * 2. Clone phases (với offset ngày nếu có planned_start)
   * 3. Clone milestones (map phase_id mới)
   * 4. KHÔNG clone: members, tasks, risks, issues, documents, activities
   */
  async createFromTemplate(input: CreateFromTemplateInput): Promise<{ project_id: string; code: string }> {
    // 1. Lấy template detail
    const template = await this.getTemplateDetail(input.template_id)
    if (!template) {
      throw new Error('Không tìm thấy template')
    }

    // 2. Generate project code nếu chưa có
    const code = input.code || await this.generateProjectCode()

    // 3. Tạo project mới
    const { data: newProject, error: insertErr } = await supabase
      .from('projects')
      .insert({
        code,
        name: input.name,
        description: input.description || template.description,
        category_id: input.category_id || template.category_id,
        priority: input.priority || template.priority || 'medium',
        tags: input.tags || template.tags,
        planned_start: input.planned_start || null,
        planned_end: input.planned_end || null,
        owner_id: input.owner_id || null,
        sponsor_id: input.sponsor_id || null,
        department_id: input.department_id || null,
        status: 'draft',
        is_template: false,
        template_id: input.template_id,
        progress_pct: 0,
        budget_planned: 0,
        budget_actual: 0,
      })
      .select('id, code')
      .single()

    if (insertErr) throw insertErr

    const newProjectId = newProject.id
    const plannedStart = input.planned_start ? new Date(input.planned_start) : null

    // 4. Clone phases — tạo map oldPhaseId → newPhaseId
    const phaseIdMap: Record<string, string> = {}

    if (template.phases.length > 0) {
      for (const phase of template.phases) {
        // Tính ngày nếu có planned_start và duration
        let phaseStart: string | null = null
        let phaseEnd: string | null = null

        if (plannedStart && phase.planned_start && phase.planned_end) {
          // Tính offset từ template
          const templateStart = new Date(template.phases[0]?.planned_start || phase.planned_start)
          const offsetDays = Math.round(
            (new Date(phase.planned_start).getTime() - templateStart.getTime()) / (1000 * 60 * 60 * 24)
          )
          const durationDays = Math.round(
            (new Date(phase.planned_end).getTime() - new Date(phase.planned_start).getTime()) / (1000 * 60 * 60 * 24)
          )

          const newStart = new Date(plannedStart)
          newStart.setDate(newStart.getDate() + offsetDays)
          const newEnd = new Date(newStart)
          newEnd.setDate(newEnd.getDate() + durationDays)

          phaseStart = newStart.toISOString().split('T')[0]
          phaseEnd = newEnd.toISOString().split('T')[0]
        }

        const { data: newPhase, error: phErr } = await supabase
          .from('project_phases')
          .insert({
            project_id: newProjectId,
            name: phase.name,
            description: phase.description,
            order_index: phase.order_index,
            color: phase.color,
            planned_start: phaseStart,
            planned_end: phaseEnd,
            status: 'pending',
            progress_pct: 0,
          })
          .select('id')
          .single()

        if (phErr) throw phErr
        phaseIdMap[phase.id] = newPhase.id
      }
    }

    // 5. Clone milestones — map phase_id sang id mới
    if (template.milestones.length > 0) {
      for (const ms of template.milestones) {
        // Map phase_id
        const newPhaseId = ms.phase_id ? phaseIdMap[ms.phase_id] || null : null

        // Tính due_date từ offset nếu có planned_start
        let dueDate: string | null = null
        if (plannedStart && ms.due_date) {
          // Giữ nguyên due_date hoặc tính offset tương tự
          const templateFirstDate = template.phases[0]?.planned_start || ms.due_date
          const offsetDays = Math.round(
            (new Date(ms.due_date).getTime() - new Date(templateFirstDate).getTime()) / (1000 * 60 * 60 * 24)
          )
          const newDue = new Date(plannedStart)
          newDue.setDate(newDue.getDate() + Math.max(offsetDays, 0))
          dueDate = newDue.toISOString().split('T')[0]
        }

        const { error: msErr } = await supabase
          .from('project_milestones')
          .insert({
            project_id: newProjectId,
            phase_id: newPhaseId,
            name: ms.name,
            description: ms.description,
            due_date: dueDate || new Date().toISOString().split('T')[0], // Fallback today
            deliverables: ms.deliverables || '[]',
            status: 'pending',
          })

        if (msErr) throw msErr
      }
    }

    return { project_id: newProjectId, code }
  },

  /**
   * Generate mã dự án tự động: DA-YYYY-NNN
   */
  async generateProjectCode(): Promise<string> {
    const year = new Date().getFullYear()
    const prefix = `DA-${year}-`

    const { data, error } = await supabase
      .from('projects')
      .select('code')
      .ilike('code', `${prefix}%`)
      .order('code', { ascending: false })
      .limit(1)

    if (error) throw error

    let nextNum = 1
    if (data && data.length > 0) {
      const lastCode = data[0].code
      const lastNum = parseInt(lastCode.replace(prefix, ''), 10)
      if (!isNaN(lastNum)) {
        nextNum = lastNum + 1
      }
    }

    return `${prefix}${nextNum.toString().padStart(3, '0')}`
  },

  /**
   * Xóa template (chỉ xóa nếu không có dự án nào tạo từ template này)
   */
  async deleteTemplate(templateId: string): Promise<void> {
    // Check dự án con
    const { count } = await supabase
      .from('projects')
      .select('id', { count: 'exact', head: true })
      .eq('template_id', templateId)
      .eq('is_template', false)

    if (count && count > 0) {
      throw new Error(`Không thể xóa template vì có ${count} dự án được tạo từ template này`)
    }

    // Xóa milestones → phases → project
    await supabase
      .from('project_milestones')
      .delete()
      .eq('project_id', templateId)

    await supabase
      .from('project_phases')
      .delete()
      .eq('project_id', templateId)

    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', templateId)
      .eq('is_template', true)

    if (error) throw error
  }
}

export default projectTemplateService