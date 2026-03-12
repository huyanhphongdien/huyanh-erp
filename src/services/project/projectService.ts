// ============================================================================
// FILE: src/services/project/projectService.ts
// MODULE: Quản lý Dự án — Huy Anh Rubber ERP
// PHASE: PM3 — Bước 3.1
// MÔ TẢ: CRUD dự án, generate code, status transitions, activity logging
// BẢNG: projects, project_categories, employees, departments, project_members,
//        project_phases, project_milestones, project_activities
// PATTERN: async/await, Supabase, object-based service export
// ============================================================================

import { supabase } from '../../lib/supabase'
import type {
  Project,
  ProjectFormData,
  ProjectStatus,
  ProjectStats,
  ProjectPaginationParams,
  PaginatedResponse,
  ProjectActivity,
  ActivityAction,
  ActivityEntityType,
  VALID_STATUS_TRANSITIONS,
} from './project.types'

// ============================================================================
// CONSTANTS — Select strings cho join
// ============================================================================

/** Select đầy đủ cho chi tiết dự án */
const PROJECT_DETAIL_SELECT = `
  *,
  category:project_categories(id, name, color, icon),
  owner:employees!projects_owner_id_fkey(id, full_name),
  sponsor:employees!projects_sponsor_id_fkey(id, full_name),
  department:departments(id, name)
`

/** Select compact cho danh sách */
const PROJECT_LIST_SELECT = `
  id, code, name, description, category_id, 
  planned_start, planned_end, actual_start, actual_end,
  status, priority, progress_pct,
  budget_planned, budget_actual, budget_currency,
  owner_id, sponsor_id, department_id,
  tags, is_template, template_id,
  created_by, created_at, updated_at,
  category:project_categories(id, name, color, icon),
  owner:employees!projects_owner_id_fkey(id, full_name),
  department:departments(id, name)
`

// ============================================================================
// VALID STATUS TRANSITIONS
// ============================================================================

const STATUS_TRANSITIONS: Record<ProjectStatus, ProjectStatus[]> = {
  draft:       ['planning', 'cancelled'],
  planning:    ['approved', 'draft', 'cancelled'],
  approved:    ['in_progress', 'planning', 'cancelled'],
  in_progress: ['on_hold', 'completed', 'cancelled'],
  on_hold:     ['in_progress', 'cancelled'],
  completed:   [],
  cancelled:   ['draft'],
}

// ============================================================================
// HELPER — Auto-generate project code: DA-YYYY-XXX
// ============================================================================

async function generateCode(): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `DA-${year}`

  const { data, error } = await supabase
    .from('projects')
    .select('code')
    .like('code', `${prefix}-%`)
    .order('code', { ascending: false })
    .limit(1)

  if (error) throw error

  let seq = 1
  if (data && data.length > 0) {
    const lastCode = data[0].code
    const parts = lastCode.split('-')
    const lastSeq = parseInt(parts[parts.length - 1] || '0', 10)
    seq = lastSeq + 1
  }

  return `${prefix}-${String(seq).padStart(3, '0')}`
}

// ============================================================================
// HELPER — Log activity
// ============================================================================

async function logActivity(params: {
  project_id: string
  action: ActivityAction
  entity_type?: ActivityEntityType
  entity_id?: string
  actor_id?: string
  old_value?: Record<string, unknown>
  new_value?: Record<string, unknown>
  description?: string
}): Promise<void> {
  try {
    // Lấy current user nếu không truyền actor_id
    let actorId = params.actor_id
    if (!actorId) {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: emp } = await supabase
          .from('employees')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle()
        actorId = emp?.id
      }
    }

    await supabase.from('project_activities').insert({
      project_id: params.project_id,
      action: params.action,
      entity_type: params.entity_type || 'project',
      entity_id: params.entity_id,
      actor_id: actorId,
      old_value: params.old_value,
      new_value: params.new_value,
      description: params.description,
    })
  } catch (err) {
    // Activity log không nên block luồng chính
    console.warn('[projectService] logActivity failed:', err)
  }
}

// ============================================================================
// HELPER — Get current employee id
// ============================================================================

async function getCurrentEmployeeId(): Promise<string | undefined> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return undefined

  const { data: emp } = await supabase
    .from('employees')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()

  return emp?.id
}

// ============================================================================
// SERVICE
// ============================================================================

export const projectService = {

  // ==========================================================================
  // GENERATE CODE
  // ==========================================================================

  /**
   * Preview mã dự án tiếp theo (dùng hiển thị trên form)
   */
  async previewCode(): Promise<string> {
    return generateCode()
  },

  // ==========================================================================
  // GET ALL — Phân trang + Filter
  // ==========================================================================

  async getAll(params: ProjectPaginationParams = {}): Promise<PaginatedResponse<Project>> {
    const page = params.page || 1
    const pageSize = params.pageSize || 10
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    let query = supabase
      .from('projects')
      .select(PROJECT_LIST_SELECT, { count: 'exact' })
      .eq('is_template', false) // Không lấy templates

    // --- FILTERS ---
    if (params.status && params.status !== 'all') {
      query = query.eq('status', params.status)
    }

    if (params.priority && params.priority !== 'all') {
      query = query.eq('priority', params.priority)
    }

    if (params.category_id) {
      query = query.eq('category_id', params.category_id)
    }

    if (params.owner_id) {
      query = query.eq('owner_id', params.owner_id)
    }

    if (params.department_id) {
      query = query.eq('department_id', params.department_id)
    }

    if (params.search) {
      query = query.or(
        `name.ilike.%${params.search}%,code.ilike.%${params.search}%,description.ilike.%${params.search}%`
      )
    }

    // --- SORT ---
    const sortBy = params.sort_by || 'created_at'
    const sortAsc = params.sort_order === 'asc'

    // Priority sort đặc biệt: critical > high > medium > low
    if (sortBy === 'priority') {
      // Supabase không hỗ trợ custom order, sort theo text (alphabetical gần đúng)
      query = query.order('priority', { ascending: sortAsc })
    } else {
      query = query.order(sortBy, { ascending: sortAsc })
    }

    const { data, error, count } = await query.range(from, to)

    if (error) throw error

    return {
      data: (data as unknown as Project[]) || [],
      total: count || 0,
      page,
      pageSize,
      totalPages: Math.ceil((count || 0) / pageSize),
    }
  },

  // ==========================================================================
  // GET BY ID — Chi tiết dự án (join đầy đủ)
  // ==========================================================================

  async getById(id: string): Promise<Project | null> {
    const { data, error } = await supabase
      .from('projects')
      .select(PROJECT_DETAIL_SELECT)
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null
      throw error
    }

    return data as unknown as Project
  },

  // ==========================================================================
  // CREATE — Tạo dự án mới
  // ==========================================================================

  async create(formData: ProjectFormData): Promise<Project> {
    // Validate
    if (!formData.name?.trim()) {
      throw new Error('Tên dự án không được để trống')
    }

    // Generate code
    const code = await generateCode()

    // Current user
    const currentEmpId = await getCurrentEmployeeId()

    const insertData = {
      code,
      name: formData.name.trim(),
      description: formData.description?.trim() || null,
      category_id: formData.category_id || null,
      planned_start: formData.planned_start || null,
      planned_end: formData.planned_end || null,
      priority: formData.priority || 'medium',
      status: 'draft' as ProjectStatus,
      progress_pct: 0,
      budget_planned: formData.budget_planned || 0,
      budget_actual: 0,
      budget_currency: formData.budget_currency || 'VND',
      owner_id: formData.owner_id || currentEmpId || null,
      sponsor_id: formData.sponsor_id || null,
      department_id: formData.department_id || null,
      tags: formData.tags || [],
      is_template: formData.is_template || false,
      created_by: currentEmpId,
      updated_by: currentEmpId,
    }

    // Validate date range
    if (insertData.planned_start && insertData.planned_end) {
      if (new Date(insertData.planned_end) < new Date(insertData.planned_start)) {
        throw new Error('Ngày kết thúc phải sau ngày bắt đầu')
      }
    }

    const { data, error } = await supabase
      .from('projects')
      .insert(insertData)
      .select(PROJECT_DETAIL_SELECT)
      .single()

    if (error) throw error

    const project = data as unknown as Project

    // Auto-add owner as project member (role: owner)
    if (project.owner_id) {
      await supabase.from('project_members').insert({
        project_id: project.id,
        employee_id: project.owner_id,
        role: 'owner',
        allocation_pct: 100,
        start_date: project.planned_start,
        end_date: project.planned_end,
        is_active: true,
      }).then(() => {}) // Không block nếu lỗi
    }

    // Log activity
    await logActivity({
      project_id: project.id,
      action: 'created',
      entity_type: 'project',
      entity_id: project.id,
      description: `Tạo dự án "${project.name}" (${project.code})`,
      new_value: { code: project.code, name: project.name, status: project.status },
    })

    return project
  },

  // ==========================================================================
  // UPDATE — Cập nhật thông tin dự án
  // ==========================================================================

  async update(id: string, formData: Partial<ProjectFormData>): Promise<Project> {
    const currentEmpId = await getCurrentEmployeeId()

    // Validate date range nếu có cập nhật dates
    if (formData.planned_start && formData.planned_end) {
      if (new Date(formData.planned_end) < new Date(formData.planned_start)) {
        throw new Error('Ngày kết thúc phải sau ngày bắt đầu')
      }
    }

    const updateData: Record<string, unknown> = {
      ...formData,
      updated_by: currentEmpId,
      updated_at: new Date().toISOString(),
    }

    // Clean up name
    if (formData.name) {
      updateData.name = formData.name.trim()
    }

    const { data, error } = await supabase
      .from('projects')
      .update(updateData)
      .eq('id', id)
      .select(PROJECT_DETAIL_SELECT)
      .single()

    if (error) throw error

    const project = data as unknown as Project

    // Log activity
    await logActivity({
      project_id: id,
      action: 'updated',
      entity_type: 'project',
      entity_id: id,
      description: `Cập nhật dự án "${project.name}"`,
    })

    return project
  },

  // ==========================================================================
  // UPDATE STATUS — Chuyển trạng thái (có validate transitions)
  // ==========================================================================

  async updateStatus(id: string, newStatus: ProjectStatus): Promise<Project> {
    // Lấy trạng thái hiện tại
    const current = await this.getById(id)
    if (!current) throw new Error('Không tìm thấy dự án')

    const oldStatus = current.status

    // Validate transition
    const allowed = STATUS_TRANSITIONS[oldStatus] || []
    if (!allowed.includes(newStatus)) {
      throw new Error(
        `Không thể chuyển từ "${oldStatus}" sang "${newStatus}". ` +
        `Cho phép: ${allowed.join(', ') || 'không có'}`
      )
    }

    const currentEmpId = await getCurrentEmployeeId()

    const updateData: Record<string, unknown> = {
      status: newStatus,
      updated_by: currentEmpId,
      updated_at: new Date().toISOString(),
    }

    // Auto-set actual_start khi chuyển sang in_progress
    if (newStatus === 'in_progress' && !current.actual_start) {
      updateData.actual_start = new Date().toISOString().split('T')[0]
    }

    // Auto-set actual_end khi chuyển sang completed
    if (newStatus === 'completed' && !current.actual_end) {
      updateData.actual_end = new Date().toISOString().split('T')[0]
    }

    const { data, error } = await supabase
      .from('projects')
      .update(updateData)
      .eq('id', id)
      .select(PROJECT_DETAIL_SELECT)
      .single()

    if (error) throw error

    const project = data as unknown as Project

    // Log activity
    await logActivity({
      project_id: id,
      action: 'status_changed',
      entity_type: 'project',
      entity_id: id,
      old_value: { status: oldStatus },
      new_value: { status: newStatus },
      description: `Chuyển trạng thái: ${oldStatus} → ${newStatus}`,
    })

    return project
  },

  // ==========================================================================
  // DELETE — Xóa dự án (chỉ khi status = draft)
  // ==========================================================================

  async delete(id: string): Promise<void> {
    const current = await this.getById(id)
    if (!current) throw new Error('Không tìm thấy dự án')

    if (current.status !== 'draft' && current.status !== 'cancelled') {
      throw new Error(
        'Chỉ có thể xóa dự án ở trạng thái "Nháp" hoặc "Đã hủy". ' +
        'Hãy hủy dự án trước khi xóa.'
      )
    }

    // Cascade delete sẽ xóa phases, milestones, members, activities
    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', id)

    if (error) throw error
  },

  // ==========================================================================
  // GET MY PROJECTS — Dự án mà user tham gia (owner hoặc member)
  // ==========================================================================

  async getMyProjects(employeeId: string): Promise<Project[]> {
    // Lấy project_ids mà user là member
    const { data: memberOf, error: memErr } = await supabase
      .from('project_members')
      .select('project_id')
      .eq('employee_id', employeeId)
      .eq('is_active', true)

    if (memErr) throw memErr

    const memberProjectIds = (memberOf || []).map(m => m.project_id)

    // Lấy projects mà user là owner HOẶC là member
    let query = supabase
      .from('projects')
      .select(PROJECT_LIST_SELECT)
      .eq('is_template', false)

    if (memberProjectIds.length > 0) {
      query = query.or(`owner_id.eq.${employeeId},id.in.(${memberProjectIds.join(',')})`)
    } else {
      query = query.eq('owner_id', employeeId)
    }

    const { data, error } = await query
      .order('updated_at', { ascending: false })

    if (error) throw error
    return (data as unknown as Project[]) || []
  },

  // ==========================================================================
  // GET PROJECT STATS — Tổng hợp statistics cho 1 dự án
  // ==========================================================================

  async getProjectStats(projectId: string): Promise<ProjectStats> {
    // Chạy song song tất cả queries
    const [
      phasesRes,
      milestonesRes,
      milestonesCompletedRes,
      membersRes,
      risksRes,
      issuesRes,
    ] = await Promise.all([
      supabase
        .from('project_phases')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', projectId),
      supabase
        .from('project_milestones')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', projectId),
      supabase
        .from('project_milestones')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', projectId)
        .eq('status', 'completed'),
      supabase
        .from('project_members')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', projectId)
        .eq('is_active', true),
      supabase
        .from('project_risks')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', projectId),
      supabase
        .from('project_issues')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', projectId)
        .in('status', ['open', 'in_progress']),
    ])

    return {
      phase_count: phasesRes.count || 0,
      milestone_count: milestonesRes.count || 0,
      milestone_completed: milestonesCompletedRes.count || 0,
      task_count: 0,        // Sẽ implement khi liên kết Task module (PM6)
      task_completed: 0,
      member_count: membersRes.count || 0,
      risk_count: risksRes.count || 0,
      open_issues: issuesRes.count || 0,
    }
  },

  // ==========================================================================
  // GET ACTIVITIES — Activity log cho dự án
  // ==========================================================================

  async getActivities(projectId: string, limit = 20): Promise<ProjectActivity[]> {
    const { data, error } = await supabase
      .from('project_activities')
      .select(`
        *,
        actor:employees!project_activities_actor_id_fkey(id, full_name)
      `)
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) throw error
    return (data as unknown as ProjectActivity[]) || []
  },

  // ==========================================================================
  // GET ALLOWED TRANSITIONS — Lấy trạng thái có thể chuyển
  // ==========================================================================

  getAllowedTransitions(currentStatus: ProjectStatus): ProjectStatus[] {
    return STATUS_TRANSITIONS[currentStatus] || []
  },

  // ==========================================================================
  // TEMPLATES — Lấy danh sách dự án mẫu
  // ==========================================================================

  async getTemplates(): Promise<Project[]> {
    const { data, error } = await supabase
      .from('projects')
      .select(PROJECT_LIST_SELECT)
      .eq('is_template', true)
      .order('name', { ascending: true })

    if (error) throw error
    return (data as unknown as Project[]) || []
  },

  // ==========================================================================
  // CREATE FROM TEMPLATE — Clone dự án từ template
  // ==========================================================================

  async createFromTemplate(
    templateId: string,
    overrides: Partial<ProjectFormData>
  ): Promise<Project> {
    // Lấy template
    const template = await this.getById(templateId)
    if (!template) throw new Error('Không tìm thấy template')

    // Tạo dự án mới
    const project = await this.create({
      name: overrides.name || `${template.name} (Copy)`,
      description: overrides.description || template.description,
      category_id: overrides.category_id || template.category_id,
      priority: overrides.priority || template.priority,
      planned_start: overrides.planned_start,
      planned_end: overrides.planned_end,
      budget_planned: overrides.budget_planned || template.budget_planned,
      budget_currency: template.budget_currency,
      owner_id: overrides.owner_id,
      sponsor_id: overrides.sponsor_id,
      department_id: overrides.department_id || template.department_id,
      tags: template.tags,
      is_template: false,
    })

    // Clone phases từ template
    const { data: templatePhases } = await supabase
      .from('project_phases')
      .select('*')
      .eq('project_id', templateId)
      .order('order_index', { ascending: true })

    if (templatePhases && templatePhases.length > 0) {
      const phaseMapping: Record<string, string> = {} // old_id → new_id

      for (const phase of templatePhases) {
        const { data: newPhase } = await supabase
          .from('project_phases')
          .insert({
            project_id: project.id,
            name: phase.name,
            description: phase.description,
            order_index: phase.order_index,
            color: phase.color,
            status: 'pending',
            progress_pct: 0,
          })
          .select()
          .single()

        if (newPhase) {
          phaseMapping[phase.id] = newPhase.id
        }
      }

      // Clone milestones (link to new phases)
      const { data: templateMilestones } = await supabase
        .from('project_milestones')
        .select('*')
        .eq('project_id', templateId)

      if (templateMilestones && templateMilestones.length > 0) {
        const milestonesToInsert = templateMilestones.map(ms => ({
          project_id: project.id,
          phase_id: ms.phase_id ? phaseMapping[ms.phase_id] || null : null,
          name: ms.name,
          description: ms.description,
          due_date: ms.due_date, // User sẽ cập nhật sau
          status: 'pending',
          deliverables: ms.deliverables || [],
        }))

        await supabase
          .from('project_milestones')
          .insert(milestonesToInsert)
      }
    }

    // Log activity
    await logActivity({
      project_id: project.id,
      action: 'created',
      entity_type: 'project',
      entity_id: project.id,
      description: `Tạo dự án từ template "${template.name}"`,
      new_value: { template_id: templateId, template_name: template.name },
    })

    return project
  },
}

export default projectService