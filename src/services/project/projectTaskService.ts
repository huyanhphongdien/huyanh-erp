// ============================================================================
// FILE: src/services/project/projectTaskService.ts
// MODULE: Quản lý Dự án — Huy Anh Rubber ERP
// PHASE: PM6 — Bước 6.2 (Updated: No FK hint joins — client-side lookups)
// ============================================================================
// ✅ UPDATED: All FK hint joins removed to avoid 400 errors from mismatched
//    constraint names. Uses client-side Map lookups instead.
// ============================================================================

import { supabase } from '../../lib/supabase'

// ============================================================================
// TYPES
// ============================================================================

export type TaskStatus =
  | 'draft'
  | 'pending'
  | 'in_progress'
  | 'review'
  | 'completed'
  | 'cancelled'
  | 'overdue'

export type TaskPriority = 'urgent' | 'high' | 'medium' | 'low'

export interface ProjectTaskFilter {
  project_id: string
  phase_id?: string | null
  milestone_id?: string | null
  status?: TaskStatus | TaskStatus[]
  priority?: TaskPriority
  assignee_id?: string
  search?: string
  page?: number
  pageSize?: number
  sort_by?: 'created_at' | 'due_date' | 'priority' | 'status' | 'progress'
  sort_order?: 'asc' | 'desc'
}

export interface ProjectTaskCreateData {
  name: string
  description?: string
  project_id: string
  phase_id?: string
  milestone_id?: string
  department_id?: string
  assignee_id?: string
  priority?: TaskPriority
  due_date?: string
  start_date?: string
  estimated_hours?: number
  tags?: string[]
  created_by?: string
}

export interface ProjectTaskUpdateData {
  name?: string
  description?: string
  phase_id?: string | null
  milestone_id?: string | null
  assignee_id?: string | null
  priority?: TaskPriority
  status?: TaskStatus
  progress?: number
  due_date?: string | null
  start_date?: string | null
  estimated_hours?: number
  actual_hours?: number
  tags?: string[]
}

export interface ProjectTask {
  id: string
  name: string
  description?: string
  project_id: string
  phase_id?: string
  milestone_id?: string
  department_id?: string
  status: TaskStatus
  priority: TaskPriority
  progress: number
  due_date?: string
  start_date?: string
  estimated_hours?: number
  actual_hours?: number
  tags?: string[]
  created_by?: string
  assignee_id?: string
  created_at: string
  updated_at: string
  phase?: { id: string; name: string; color?: string; order_index: number }
  milestone?: { id: string; name: string; due_date: string }
  assignee?: { id: string; full_name: string; avatar_url?: string }
  creator?: { id: string; full_name: string }
  department?: { id: string; name: string }
}

export interface PhaseTaskStats {
  phase_id: string
  phase_name: string
  phase_color?: string
  phase_order: number
  total: number
  completed: number
  in_progress: number
  todo: number
  overdue: number
  progress_pct: number
}

export interface ProjectTaskStats {
  total: number
  completed: number
  in_progress: number
  todo: number
  review: number
  overdue: number
  cancelled: number
  progress_pct: number
  by_phase: PhaseTaskStats[]
  by_assignee: { employee_id: string; full_name: string; count: number; completed: number }[]
  by_priority: { priority: TaskPriority; count: number }[]
}

export interface PaginatedTasks {
  data: ProjectTask[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

// ============================================================================
// CONSTANTS — Simple selects WITHOUT FK hints
// ============================================================================

/** Select cho tasks — raw columns only, NO FK joins */
const TASK_RAW_SELECT = `
  id, name, description, status, priority, progress,
  due_date, start_date, project_id, phase_id, milestone_id,
  department_id, assignee_id, created_by,
  estimated_hours, actual_hours, tags,
  created_at, updated_at
`

// ============================================================================
// LOOKUP HELPERS — Build Maps for client-side joins
// ============================================================================

interface PhaseInfo { id: string; name: string; color?: string; order_index: number }
interface MilestoneInfo { id: string; name: string; due_date: string }
interface EmployeeInfo { id: string; full_name: string; avatar_url?: string }
interface DeptInfo { id: string; name: string }

/** Load lookup maps for phases, employees, milestones, departments */
async function buildLookups(tasks: any[]): Promise<{
  phaseMap: Map<string, PhaseInfo>
  milestoneMap: Map<string, MilestoneInfo>
  empMap: Map<string, EmployeeInfo>
  deptMap: Map<string, DeptInfo>
}> {
  // Collect unique IDs
  const phaseIds = new Set<string>()
  const milestoneIds = new Set<string>()
  const empIds = new Set<string>()
  const deptIds = new Set<string>()

  for (const t of tasks) {
    if (t.phase_id) phaseIds.add(t.phase_id)
    if (t.milestone_id) milestoneIds.add(t.milestone_id)
    if (t.assignee_id) empIds.add(t.assignee_id)
    if (t.created_by) empIds.add(t.created_by)
    if (t.department_id) deptIds.add(t.department_id)
  }

  // Parallel fetch lookups
  const [phaseRes, msRes, empRes, deptRes] = await Promise.all([
    phaseIds.size > 0
      ? supabase.from('project_phases').select('id, name, color, order_index').in('id', Array.from(phaseIds))
      : Promise.resolve({ data: [] }),
    milestoneIds.size > 0
      ? supabase.from('project_milestones').select('id, name, due_date').in('id', Array.from(milestoneIds))
      : Promise.resolve({ data: [] }),
    empIds.size > 0
      ? supabase.from('employees').select('id, full_name, avatar_url').in('id', Array.from(empIds))
      : Promise.resolve({ data: [] }),
    deptIds.size > 0
      ? supabase.from('departments').select('id, name').in('id', Array.from(deptIds))
      : Promise.resolve({ data: [] }),
  ])

  const phaseMap = new Map<string, PhaseInfo>(
    ((phaseRes as any).data || []).map((p: any) => [p.id, { id: p.id, name: p.name, color: p.color, order_index: p.order_index ?? 0 }])
  )
  const milestoneMap = new Map<string, MilestoneInfo>(
    ((msRes as any).data || []).map((m: any) => [m.id, { id: m.id, name: m.name, due_date: m.due_date }])
  )
  const empMap = new Map<string, EmployeeInfo>(
    ((empRes as any).data || []).map((e: any) => [e.id, { id: e.id, full_name: e.full_name, avatar_url: e.avatar_url }])
  )
  const deptMap = new Map<string, DeptInfo>(
    ((deptRes as any).data || []).map((d: any) => [d.id, { id: d.id, name: d.name }])
  )

  return { phaseMap, milestoneMap, empMap, deptMap }
}

/** Enrich raw tasks with lookup data */
function enrichTasks(
  rawTasks: any[],
  lookups: { phaseMap: Map<string, PhaseInfo>; milestoneMap: Map<string, MilestoneInfo>; empMap: Map<string, EmployeeInfo>; deptMap: Map<string, DeptInfo> }
): ProjectTask[] {
  return rawTasks.map(t => ({
    ...t,
    progress: Number(t.progress) || 0,
    phase: t.phase_id ? lookups.phaseMap.get(t.phase_id) || null : null,
    milestone: t.milestone_id ? lookups.milestoneMap.get(t.milestone_id) || null : null,
    assignee: t.assignee_id ? lookups.empMap.get(t.assignee_id) || null : null,
    creator: t.created_by ? lookups.empMap.get(t.created_by) || null : null,
    department: t.department_id ? lookups.deptMap.get(t.department_id) || null : null,
  }))
}

// ============================================================================
// SERVICE
// ============================================================================

export const projectTaskService = {
  // ==========================================================================
  // LẤY DANH SÁCH TASKS CỦA DỰ ÁN
  // ==========================================================================

  async getTasksByProject(params: ProjectTaskFilter): Promise<PaginatedTasks> {
    const {
      project_id,
      phase_id,
      milestone_id,
      status,
      priority,
      assignee_id,
      search,
      page = 1,
      pageSize = 50,
      sort_by = 'created_at',
      sort_order = 'desc',
    } = params

    let query = supabase
      .from('tasks')
      .select(TASK_RAW_SELECT, { count: 'exact' })
      .eq('project_id', project_id)

    if (phase_id) query = query.eq('phase_id', phase_id)
    if (phase_id === null) query = query.is('phase_id', null)
    if (milestone_id) query = query.eq('milestone_id', milestone_id)

    if (status) {
      if (Array.isArray(status)) {
        query = query.in('status', status)
      } else {
        query = query.eq('status', status)
      }
    }

    if (priority) query = query.eq('priority', priority)
    if (assignee_id) query = query.eq('assignee_id', assignee_id)
    if (search) query = query.ilike('name', `%${search}%`)

    const ascending = sort_order === 'asc'
    query = query.order(sort_by, { ascending })

    const from = (page - 1) * pageSize
    const to = from + pageSize - 1
    query = query.range(from, to)

    const { data, error, count } = await query
    if (error) throw error

    const rawTasks = data || []
    const lookups = await buildLookups(rawTasks)

    return {
      data: enrichTasks(rawTasks, lookups),
      total: count || 0,
      page,
      pageSize,
      totalPages: Math.ceil((count || 0) / pageSize),
    }
  },

  async getTasksByPhase(project_id: string): Promise<Map<string, ProjectTask[]>> {
    const { data, error } = await supabase
      .from('tasks')
      .select(TASK_RAW_SELECT)
      .eq('project_id', project_id)
      .neq('status', 'cancelled')
      .order('phase_id', { ascending: true })
      .order('created_at', { ascending: true })

    if (error) throw error

    const rawTasks = data || []
    const lookups = await buildLookups(rawTasks)
    const enriched = enrichTasks(rawTasks, lookups)

    const grouped = new Map<string, ProjectTask[]>()
    const UNASSIGNED = '__no_phase__'

    for (const task of enriched) {
      const key = task.phase_id || UNASSIGNED
      if (!grouped.has(key)) grouped.set(key, [])
      grouped.get(key)!.push(task)
    }

    return grouped
  },

  // ==========================================================================
  // CRUD
  // ==========================================================================

  async getById(id: string): Promise<ProjectTask | null> {
    const { data, error } = await supabase
      .from('tasks')
      .select(TASK_RAW_SELECT)
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null
      throw error
    }

    const lookups = await buildLookups([data])
    return enrichTasks([data], lookups)[0] || null
  },

  async createProjectTask(input: ProjectTaskCreateData): Promise<ProjectTask> {
    const { data, error } = await supabase
      .from('tasks')
      .insert({
        name: input.name,
        description: input.description || null,
        project_id: input.project_id,
        phase_id: input.phase_id || null,
        milestone_id: input.milestone_id || null,
        department_id: input.department_id || null,
        assignee_id: input.assignee_id || null,
        priority: input.priority || 'medium',
        due_date: input.due_date || null,
        start_date: input.start_date || null,
        estimated_hours: input.estimated_hours || null,
        tags: input.tags || [],
        created_by: input.created_by || null,
        status: input.assignee_id ? 'in_progress' : 'draft',
        progress: input.assignee_id ? 1 : 0,
      })
      .select(TASK_RAW_SELECT)
      .single()

    if (error) throw error

    // Log activity
    await this._logActivity(input.project_id, 'task_created', 'task', data.id,
      `Task "${input.name}" được tạo`, input.created_by)

    const lookups = await buildLookups([data])
    return enrichTasks([data], lookups)[0]
  },

  async updateTask(id: string, updates: ProjectTaskUpdateData, actor_id?: string): Promise<ProjectTask> {
    const { data: current } = await supabase
      .from('tasks')
      .select('project_id, name, status, progress')
      .eq('id', id)
      .single()

    const { data, error } = await supabase
      .from('tasks')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select(TASK_RAW_SELECT)
      .single()

    if (error) throw error

    if (current?.project_id && updates.status && updates.status !== current.status) {
      await this._logActivity(
        current.project_id, 'task_status_changed', 'task', id,
        `Task "${current.name}" chuyển trạng thái: ${current.status} → ${updates.status}`,
        actor_id
      )
    }

    if (current?.project_id && updates.progress !== undefined
        && updates.progress !== current.progress) {
      await this._logActivity(
        current.project_id, 'task_progress_updated', 'task', id,
        `Task "${current.name}" tiến độ: ${current.progress}% → ${updates.progress}%`,
        actor_id
      )
    }

    const lookups = await buildLookups([data])
    return enrichTasks([data], lookups)[0]
  },

  async deleteTask(id: string): Promise<void> {
    const { error } = await supabase
      .from('tasks')
      .delete()
      .eq('id', id)

    if (error) throw error
  },

  // ==========================================================================
  // GẮN / GỠ TASK VÀO DỰ ÁN
  // ==========================================================================

  async linkTask(task_id: string, project_id: string, phase_id?: string, milestone_id?: string): Promise<void> {
    const { error } = await supabase
      .from('tasks')
      .update({
        project_id,
        phase_id: phase_id || null,
        milestone_id: milestone_id || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', task_id)

    if (error) throw error
  },

  async unlinkTask(task_id: string): Promise<void> {
    const { error } = await supabase
      .from('tasks')
      .update({
        project_id: null,
        phase_id: null,
        milestone_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', task_id)

    if (error) throw error
  },

  async moveToPhase(task_id: string, phase_id: string | null): Promise<void> {
    const { error } = await supabase
      .from('tasks')
      .update({
        phase_id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', task_id)

    if (error) throw error
  },

  async bulkLink(task_ids: string[], project_id: string, phase_id?: string): Promise<number> {
    const { data, error } = await supabase
      .from('tasks')
      .update({
        project_id,
        phase_id: phase_id || null,
        updated_at: new Date().toISOString(),
      })
      .in('id', task_ids)
      .select('id')

    if (error) throw error
    return data?.length || 0
  },

  async bulkUpdateStatus(task_ids: string[], status: TaskStatus): Promise<number> {
    const progress = status === 'completed' ? 100 : undefined

    const updateData: Record<string, any> = {
      status,
      updated_at: new Date().toISOString(),
    }
    if (progress !== undefined) {
      updateData.progress = progress
    }

    const { data, error } = await supabase
      .from('tasks')
      .update(updateData)
      .in('id', task_ids)
      .select('id')

    if (error) throw error
    return data?.length || 0
  },

  // ==========================================================================
  // PROGRESS SYNC
  // ==========================================================================

  async calculatePhaseProgress(phase_id: string): Promise<number> {
    const { data, error } = await supabase
      .from('tasks')
      .select('status, progress')
      .eq('phase_id', phase_id)
      .neq('status', 'cancelled')

    if (error) throw error
    if (!data || data.length === 0) return 0

    const total = data.reduce((sum, t) => {
      return sum + (t.status === 'completed' ? 100 : (t.progress || 0))
    }, 0)
    const avg = Math.round((total / data.length) * 100) / 100

    await supabase
      .from('project_phases')
      .update({ progress_pct: avg, updated_at: new Date().toISOString() })
      .eq('id', phase_id)

    return avg
  },

  async calculateProjectProgress(project_id: string): Promise<number> {
    const { data: phases, error: phaseError } = await supabase
      .from('project_phases')
      .select('id, progress_pct')
      .eq('project_id', project_id)
      .neq('status', 'skipped')

    if (phaseError) throw phaseError

    if (!phases || phases.length === 0) {
      const { data: tasks, error: taskError } = await supabase
        .from('tasks')
        .select('status, progress')
        .eq('project_id', project_id)
        .neq('status', 'cancelled')

      if (taskError) throw taskError
      if (!tasks || tasks.length === 0) return 0

      const total = tasks.reduce((sum, t) => {
        return sum + (t.status === 'completed' ? 100 : (t.progress || 0))
      }, 0)
      const avg = Math.round((total / tasks.length) * 100) / 100

      await supabase
        .from('projects')
        .update({ progress_pct: avg, updated_at: new Date().toISOString() })
        .eq('id', project_id)

      return avg
    }

    const total = phases.reduce((sum, p) => sum + (p.progress_pct || 0), 0)
    const avg = Math.round((total / phases.length) * 100) / 100

    await supabase
      .from('projects')
      .update({ progress_pct: avg, updated_at: new Date().toISOString() })
      .eq('id', project_id)

    return avg
  },

  async syncProgress(project_id: string): Promise<void> {
    const { data: phases } = await supabase
      .from('project_phases')
      .select('id')
      .eq('project_id', project_id)
      .neq('status', 'skipped')

    if (phases) {
      for (const phase of phases) {
        await this.calculatePhaseProgress(phase.id)
      }
    }

    await this.calculateProjectProgress(project_id)
  },

  // ==========================================================================
  // THỐNG KÊ — No FK hints, uses client-side lookups
  // ==========================================================================

  async getTaskStats(project_id: string): Promise<ProjectTaskStats> {
    const { data: rawTasks, error } = await supabase
      .from('tasks')
      .select('id, status, priority, progress, due_date, phase_id, assignee_id')
      .eq('project_id', project_id)

    if (error) throw error
    if (!rawTasks || rawTasks.length === 0) {
      return {
        total: 0, completed: 0, in_progress: 0, todo: 0, review: 0,
        overdue: 0, cancelled: 0, progress_pct: 0,
        by_phase: [], by_assignee: [], by_priority: [],
      }
    }

    const today = new Date().toISOString().split('T')[0]

    // Load lookups for phases and assignees
    const phaseIds = new Set<string>()
    const empIds = new Set<string>()
    for (const t of rawTasks) {
      if (t.phase_id) phaseIds.add(t.phase_id)
      if (t.assignee_id) empIds.add(t.assignee_id)
    }

    const [phaseRes, empRes] = await Promise.all([
      phaseIds.size > 0
        ? supabase.from('project_phases').select('id, name, color, order_index').in('id', Array.from(phaseIds))
        : Promise.resolve({ data: [] }),
      empIds.size > 0
        ? supabase.from('employees').select('id, full_name').in('id', Array.from(empIds))
        : Promise.resolve({ data: [] }),
    ])

    const phaseMap = new Map<string, { id: string; name: string; color?: string; order_index: number }>(
      ((phaseRes as any).data || []).map((p: any) => [p.id, p])
    )
    const empMap = new Map<string, { id: string; full_name: string }>(
      ((empRes as any).data || []).map((e: any) => [e.id, e])
    )

    // Overall stats
    const stats: ProjectTaskStats = {
      total: rawTasks.length,
      completed: rawTasks.filter(t => t.status === 'completed').length,
      in_progress: rawTasks.filter(t => t.status === 'in_progress').length,
      todo: rawTasks.filter(t => t.status === 'draft' || t.status === 'pending').length,
      review: rawTasks.filter(t => t.status === 'review').length,
      overdue: rawTasks.filter(t =>
        t.due_date && t.due_date < today && !['completed', 'cancelled'].includes(t.status)
      ).length,
      cancelled: rawTasks.filter(t => t.status === 'cancelled').length,
      progress_pct: 0,
      by_phase: [],
      by_assignee: [],
      by_priority: [],
    }

    const activeTasks = rawTasks.filter(t => t.status !== 'cancelled')
    if (activeTasks.length > 0) {
      const totalProgress = activeTasks.reduce((sum, t) => {
        return sum + (t.status === 'completed' ? 100 : (t.progress || 0))
      }, 0)
      stats.progress_pct = Math.round((totalProgress / activeTasks.length) * 100) / 100
    }

    // By phase
    const phaseStatsMap = new Map<string, PhaseTaskStats>()
    const NO_PHASE = '__no_phase__'

    for (const task of rawTasks) {
      const key = task.phase_id || NO_PHASE
      if (!phaseStatsMap.has(key)) {
        const phaseInfo = task.phase_id ? phaseMap.get(task.phase_id) : undefined
        phaseStatsMap.set(key, {
          phase_id: key,
          phase_name: phaseInfo?.name || 'Chưa phân phase',
          phase_color: phaseInfo?.color || '#6B7280',
          phase_order: phaseInfo?.order_index ?? 999,
          total: 0, completed: 0, in_progress: 0, todo: 0, overdue: 0, progress_pct: 0,
        })
      }
      const ps = phaseStatsMap.get(key)!
      ps.total++
      if (task.status === 'completed') ps.completed++
      else if (task.status === 'in_progress') ps.in_progress++
      else if (['draft', 'pending'].includes(task.status)) ps.todo++
      if (task.due_date && task.due_date < today && !['completed', 'cancelled'].includes(task.status)) {
        ps.overdue++
      }
    }

    for (const ps of phaseStatsMap.values()) {
      const phaseTasks = rawTasks.filter(t => (t.phase_id || NO_PHASE) === ps.phase_id && t.status !== 'cancelled')
      if (phaseTasks.length > 0) {
        const tp = phaseTasks.reduce((s, t) => s + (t.status === 'completed' ? 100 : (t.progress || 0)), 0)
        ps.progress_pct = Math.round((tp / phaseTasks.length) * 100) / 100
      }
    }

    stats.by_phase = Array.from(phaseStatsMap.values()).sort((a, b) => a.phase_order - b.phase_order)

    // By assignee
    const assigneeStatsMap = new Map<string, { employee_id: string; full_name: string; count: number; completed: number }>()
    for (const task of rawTasks) {
      const empId = task.assignee_id || '__unassigned__'
      if (!assigneeStatsMap.has(empId)) {
        const empInfo = task.assignee_id ? empMap.get(task.assignee_id) : undefined
        assigneeStatsMap.set(empId, {
          employee_id: empId,
          full_name: empInfo?.full_name || 'Chưa phân công',
          count: 0,
          completed: 0,
        })
      }
      const as = assigneeStatsMap.get(empId)!
      as.count++
      if (task.status === 'completed') as.completed++
    }
    stats.by_assignee = Array.from(assigneeStatsMap.values()).sort((a, b) => b.count - a.count)

    // By priority
    const priorityCount: Record<string, number> = {}
    for (const task of rawTasks) {
      const p = task.priority || 'medium'
      priorityCount[p] = (priorityCount[p] || 0) + 1
    }
    stats.by_priority = (['urgent', 'high', 'medium', 'low'] as TaskPriority[])
      .map(p => ({ priority: p, count: priorityCount[p] || 0 }))

    return stats
  },

  async getUnlinkedTasks(params: {
    department_id?: string
    search?: string
    limit?: number
  }): Promise<ProjectTask[]> {
    let query = supabase
      .from('tasks')
      .select(TASK_RAW_SELECT)
      .is('project_id', null)
      .not('status', 'in', '("completed","cancelled")')

    if (params.department_id) query = query.eq('department_id', params.department_id)
    if (params.search) query = query.ilike('name', `%${params.search}%`)

    query = query
      .order('created_at', { ascending: false })
      .limit(params.limit || 20)

    const { data, error } = await query
    if (error) throw error

    const rawTasks = data || []
    const lookups = await buildLookups(rawTasks)
    return enrichTasks(rawTasks, lookups)
  },

  // ==========================================================================
  // HELPERS CHO DROPDOWN (Phases, Milestones, Members)
  // ==========================================================================

  async getProjectPhases(project_id: string): Promise<{ id: string; name: string; order_index: number; status: string }[]> {
    const { data, error } = await supabase
      .from('project_phases')
      .select('id, name, order_index, status')
      .eq('project_id', project_id)
      .order('order_index', { ascending: true })

    if (error) throw error
    return data || []
  },

  async getProjectMilestones(project_id: string): Promise<{ id: string; name: string; due_date: string; status: string }[]> {
    const { data, error } = await supabase
      .from('project_milestones')
      .select('id, name, due_date, status')
      .eq('project_id', project_id)
      .order('due_date', { ascending: true })

    if (error) throw error
    return data || []
  },

  async getProjectMembers(project_id: string): Promise<{ employee_id: string; full_name: string; role: string }[]> {
    // Step 1: Get member records (no FK hint)
    const { data: memberData, error: memberError } = await supabase
      .from('project_members')
      .select('employee_id, role')
      .eq('project_id', project_id)
      .eq('is_active', true)

    if (memberError) throw memberError
    if (!memberData || memberData.length === 0) return []

    // Step 2: Load employee names
    const empIds = memberData.map(m => m.employee_id).filter(Boolean)
    const { data: empData } = await supabase
      .from('employees')
      .select('id, full_name')
      .in('id', empIds)

    const empMap = new Map((empData || []).map((e: any) => [e.id, e.full_name]))

    return memberData.map(m => ({
      employee_id: m.employee_id,
      full_name: empMap.get(m.employee_id) || 'N/A',
      role: m.role,
    }))
  },

  // ==========================================================================
  // INTERNAL HELPERS
  // ==========================================================================

  async _logActivity(
    project_id: string,
    action: string,
    entity_type: string,
    entity_id: string,
    description: string,
    actor_id?: string,
  ): Promise<void> {
    try {
      await supabase.from('project_activities').insert({
        project_id,
        action,
        entity_type,
        entity_id,
        description,
        actor_id: actor_id || null,
      })
    } catch (err) {
      console.warn('[projectTaskService] Failed to log activity:', err)
    }
  },
}

export default projectTaskService