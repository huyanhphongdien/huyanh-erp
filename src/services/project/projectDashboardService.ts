// ============================================================================
// FILE: src/services/project/projectDashboardService.ts
// MODULE: Quản lý Dự án — Huy Anh Rubber ERP
// PHASE: PM9 — Bước 9.1: Dashboard Service
// ============================================================================
// Cung cấp dữ liệu cho Dashboard tổng quan dự án:
// - getOverview(): Cards tổng hợp + data cho charts
// - getMyDashboard(): DA tôi tham gia, tasks đến hạn, milestones
// - getHealthSummary(): RAG status cho mỗi DA đang chạy
// - getUpcomingMilestones(): Milestones sắp tới across projects
// ============================================================================

import { supabase } from '../../lib/supabase'

// ============================================
// INTERFACES
// ============================================

export type HealthStatus = 'on_track' | 'at_risk' | 'behind_schedule'

export interface DashboardOverview {
  total_projects: number
  active_projects: number     // in_progress
  completed_projects: number
  on_hold_projects: number
  overdue_projects: number    // in_progress + planned_end < today
  draft_projects: number
  cancelled_projects: number
  // Chart data
  by_status: { status: string; count: number; color: string }[]
  by_department: { department: string; count: number }[]
  by_priority: { priority: string; count: number; color: string }[]
}

export interface MyDashboardData {
  my_projects: ProjectSummary[]
  upcoming_tasks: TaskDue[]
  upcoming_milestones: MilestoneDue[]
  recent_activities: ActivityItem[]
}

export interface ProjectSummary {
  id: string
  code: string
  name: string
  status: string
  priority: string
  progress_pct: number
  planned_start: string | null
  planned_end: string | null
  health: HealthStatus
  owner_name: string
  department_name: string
  task_count: number
  milestone_count: number
  risk_count: number
  open_issues: number
  next_milestone: string | null
  next_milestone_due: string | null
}

export interface ProjectHealthItem {
  id: string
  code: string
  name: string
  status: string
  progress_pct: number
  planned_start: string | null
  planned_end: string | null
  health: HealthStatus
  gap: number              // actual - planned progress
  overdue_milestones: number
  critical_risks: number
  critical_issues: number
}

export interface TaskDue {
  id: string
  name: string
  due_date: string
  status: string
  priority: string
  project_code: string
  project_name: string
  assignee_name: string
}

export interface MilestoneDue {
  id: string
  name: string
  due_date: string
  status: string
  project_id: string
  project_code: string
  project_name: string
  phase_name: string | null
  is_overdue: boolean
}

export interface ActivityItem {
  id: string
  action: string
  entity_type: string
  entity_name: string
  actor_name: string
  actor_avatar?: string
  created_at: string
  project_code: string
  project_name: string
}

// ============================================
// STATUS COLOR MAP
// ============================================

const STATUS_COLORS: Record<string, string> = {
  draft: '#9CA3AF',        // gray
  planning: '#60A5FA',     // blue
  approved: '#34D399',     // emerald
  in_progress: '#1B4D3E',  // primary green
  on_hold: '#FBBF24',      // amber
  completed: '#10B981',    // green
  cancelled: '#EF4444',    // red
}

const PRIORITY_COLORS: Record<string, string> = {
  critical: '#EF4444',
  high: '#F97316',
  medium: '#FBBF24',
  low: '#60A5FA',
}

// ============================================
// HEALTH CALCULATOR
// ============================================

export function calculateHealth(
  progress_pct: number,
  planned_start: string | null,
  planned_end: string | null,
  overdue_milestones = 0,
  critical_risks = 0,
  critical_issues = 0
): { health: HealthStatus; gap: number } {
  if (!planned_start || !planned_end) {
    return { health: 'on_track', gap: 0 }
  }

  const now = new Date()
  const start = new Date(planned_start)
  const end = new Date(planned_end)
  const totalDays = Math.max(1, (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
  const elapsedDays = Math.max(0, (now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
  const plannedProgress = Math.min(100, (elapsedDays / totalDays) * 100)
  const actualProgress = Number(progress_pct) || 0
  let gap = actualProgress - plannedProgress

  // Adjust by risk factors
  if (overdue_milestones > 0) gap -= overdue_milestones * 3
  if (critical_risks > 0) gap -= critical_risks * 2
  if (critical_issues > 0) gap -= critical_issues * 2

  let health: HealthStatus = 'on_track'
  if (gap < -15) {
    health = 'behind_schedule'
  } else if (gap < -5) {
    health = 'at_risk'
  }

  return { health, gap: Math.round(gap * 100) / 100 }
}

// ============================================
// SERVICE
// ============================================

export const projectDashboardService = {

  // -----------------------------------------
  // 9.1.1 — Tổng quan (Dashboard cards + charts)
  // -----------------------------------------
  async getOverview(): Promise<DashboardOverview> {
    // Lấy tất cả dự án (không bao gồm cancelled)
    const { data: projects, error } = await supabase
      .from('projects')
      .select(`
        id, status, priority, progress_pct, planned_end,
        department:departments!projects_department_id_fkey(name)
      `)

    if (error) throw error
    const all = projects || []

    // Count by status
    const statusCount: Record<string, number> = {}
    let overdue = 0
    const now = new Date().toISOString().split('T')[0]

    for (const p of all) {
      statusCount[p.status] = (statusCount[p.status] || 0) + 1
      if (p.status === 'in_progress' && p.planned_end && p.planned_end < now) {
        overdue++
      }
    }

    // By status for chart
    const by_status = Object.entries(statusCount).map(([status, count]) => ({
      status,
      count,
      color: STATUS_COLORS[status] || '#9CA3AF'
    }))

    // By department
    const deptCount: Record<string, number> = {}
    for (const p of all) {
      const deptName = (p.department as any)?.name || 'Chưa phân'
      deptCount[deptName] = (deptCount[deptName] || 0) + 1
    }
    const by_department = Object.entries(deptCount).map(([department, count]) => ({
      department, count
    }))

    // By priority
    const prioCount: Record<string, number> = {}
    for (const p of all) {
      prioCount[p.priority] = (prioCount[p.priority] || 0) + 1
    }
    const by_priority = Object.entries(prioCount).map(([priority, count]) => ({
      priority,
      count,
      color: PRIORITY_COLORS[priority] || '#9CA3AF'
    }))

    return {
      total_projects: all.length,
      active_projects: statusCount['in_progress'] || 0,
      completed_projects: statusCount['completed'] || 0,
      on_hold_projects: statusCount['on_hold'] || 0,
      overdue_projects: overdue,
      draft_projects: statusCount['draft'] || 0,
      cancelled_projects: statusCount['cancelled'] || 0,
      by_status,
      by_department,
      by_priority,
    }
  },

  // -----------------------------------------
  // 9.1.2 — My Dashboard (DA tôi tham gia)
  // -----------------------------------------
  async getMyDashboard(employeeId: string): Promise<MyDashboardData> {
    // 1. Lấy projects mà tôi là owner hoặc member
    const { data: ownedProjects } = await supabase
      .from('projects')
      .select(`
        id, code, name, status, priority, progress_pct,
        planned_start, planned_end,
        owner:employees!projects_owner_id_fkey(full_name),
        department:departments!projects_department_id_fkey(name)
      `)
      .eq('owner_id', employeeId)
      .not('status', 'in', '("cancelled","completed")')
      .order('planned_end', { ascending: true })

    const { data: memberProjects } = await supabase
      .from('project_members')
      .select(`
        project:projects(
          id, code, name, status, priority, progress_pct,
          planned_start, planned_end,
          owner:employees!projects_owner_id_fkey(full_name),
          department:departments!projects_department_id_fkey(name)
        )
      `)
      .eq('employee_id', employeeId)
      .eq('is_active', true)

    // Merge & deduplicate
    const projectMap = new Map<string, any>()
    for (const p of (ownedProjects || [])) {
      projectMap.set(p.id, p)
    }
    for (const m of (memberProjects || [])) {
      const p = (m as any).project
      if (p && !projectMap.has(p.id)) {
        projectMap.set(p.id, p)
      }
    }

    // Calculate health for each project
    const my_projects: ProjectSummary[] = []
    for (const p of projectMap.values()) {
      if (['cancelled', 'completed'].includes(p.status)) continue

      const { health } = calculateHealth(
        p.progress_pct,
        p.planned_start,
        p.planned_end
      )

      my_projects.push({
        id: p.id,
        code: p.code,
        name: p.name,
        status: p.status,
        priority: p.priority,
        progress_pct: Number(p.progress_pct) || 0,
        planned_start: p.planned_start,
        planned_end: p.planned_end,
        health,
        owner_name: (p.owner as any)?.full_name || '—',
        department_name: (p.department as any)?.name || '—',
        task_count: 0,    // Will enrich below
        milestone_count: 0,
        risk_count: 0,
        open_issues: 0,
        next_milestone: null,
        next_milestone_due: null,
      })
    }

    // 2. Tasks đến hạn trong 7 ngày
    const weekLater = new Date()
    weekLater.setDate(weekLater.getDate() + 7)
    const weekLaterStr = weekLater.toISOString().split('T')[0]

    const { data: tasks } = await supabase
      .from('tasks')
      .select(`
        id, name, due_date, status, priority,
        project:projects!tasks_project_id_fkey(code, name)
      `)
      .eq('assignee_id', employeeId)
      .not('status', 'in', '("completed","cancelled")')
      .lte('due_date', weekLaterStr)
      .order('due_date', { ascending: true })
      .limit(10)

    const upcoming_tasks: TaskDue[] = (tasks || []).map(t => ({
      id: t.id,
      name: t.name,
      due_date: t.due_date,
      status: t.status,
      priority: t.priority || 'medium',
      project_code: (t.project as any)?.code || '—',
      project_name: (t.project as any)?.name || '—',
      assignee_name: '',
    }))

    // 3. Upcoming milestones (30 ngày)
    const upcoming_milestones = await this.getUpcomingMilestones(30, employeeId)

    // 4. Recent activities
    const projectIds = Array.from(projectMap.keys())
    let recent_activities: ActivityItem[] = []
    if (projectIds.length > 0) {
      const { data: activities } = await supabase
        .from('project_activities')
        .select(`
          id, action, entity_type, entity_name, created_at,
          actor:employees!project_activities_actor_id_fkey(full_name, avatar_url),
          project:projects!project_activities_project_id_fkey(code, name)
        `)
        .in('project_id', projectIds)
        .order('created_at', { ascending: false })
        .limit(20)

      recent_activities = (activities || []).map(a => ({
        id: a.id,
        action: a.action,
        entity_type: a.entity_type,
        entity_name: a.entity_name || '',
        actor_name: (a.actor as any)?.full_name || '—',
        actor_avatar: (a.actor as any)?.avatar_url,
        created_at: a.created_at,
        project_code: (a.project as any)?.code || '',
        project_name: (a.project as any)?.name || '',
      }))
    }

    return {
      my_projects,
      upcoming_tasks,
      upcoming_milestones,
      recent_activities,
    }
  },

  // -----------------------------------------
  // 9.1.3 — Health Summary (RAG cho tất cả DA đang chạy)
  // -----------------------------------------
  async getHealthSummary(): Promise<ProjectHealthItem[]> {
    const { data: projects, error } = await supabase
      .from('projects')
      .select(`
        id, code, name, status, progress_pct, planned_start, planned_end
      `)
      .in('status', ['in_progress', 'approved', 'planning'])
      .order('planned_end', { ascending: true })

    if (error) throw error
    if (!projects?.length) return []

    const projectIds = projects.map(p => p.id)

    // Count overdue milestones per project
    const today = new Date().toISOString().split('T')[0]
    const { data: overdueMilestones } = await supabase
      .from('project_milestones')
      .select('project_id')
      .in('project_id', projectIds)
      .in('status', ['pending', 'approaching'])
      .lt('due_date', today)

    const overdueMsMap = new Map<string, number>()
    for (const ms of (overdueMilestones || [])) {
      overdueMsMap.set(ms.project_id, (overdueMsMap.get(ms.project_id) || 0) + 1)
    }

    // Count critical risks per project
    const { data: criticalRisks } = await supabase
      .from('project_risks')
      .select('project_id')
      .in('project_id', projectIds)
      .in('status', ['identified', 'mitigating'])
      .gte('risk_score', 15) // critical zone

    const critRiskMap = new Map<string, number>()
    for (const r of (criticalRisks || [])) {
      critRiskMap.set(r.project_id, (critRiskMap.get(r.project_id) || 0) + 1)
    }

    // Count critical issues per project
    const { data: criticalIssues } = await supabase
      .from('project_issues')
      .select('project_id')
      .in('project_id', projectIds)
      .eq('severity', 'critical')
      .in('status', ['open', 'in_progress'])

    const critIssueMap = new Map<string, number>()
    for (const i of (criticalIssues || [])) {
      critIssueMap.set(i.project_id, (critIssueMap.get(i.project_id) || 0) + 1)
    }

    return projects.map(p => {
      const overdueMsCount = overdueMsMap.get(p.id) || 0
      const critRiskCount = critRiskMap.get(p.id) || 0
      const critIssueCount = critIssueMap.get(p.id) || 0

      const { health, gap } = calculateHealth(
        p.progress_pct,
        p.planned_start,
        p.planned_end,
        overdueMsCount,
        critRiskCount,
        critIssueCount
      )

      return {
        id: p.id,
        code: p.code,
        name: p.name,
        status: p.status,
        progress_pct: Number(p.progress_pct) || 0,
        planned_start: p.planned_start,
        planned_end: p.planned_end,
        health,
        gap,
        overdue_milestones: overdueMsCount,
        critical_risks: critRiskCount,
        critical_issues: critIssueCount,
      }
    })
  },

  // -----------------------------------------
  // 9.1.4 — Upcoming Milestones (cross-project)
  // -----------------------------------------
  async getUpcomingMilestones(days = 30, employeeId?: string): Promise<MilestoneDue[]> {
    const today = new Date()
    const futureDate = new Date()
    futureDate.setDate(today.getDate() + days)
    const todayStr = today.toISOString().split('T')[0]
    const futureStr = futureDate.toISOString().split('T')[0]

    let query = supabase
      .from('project_milestones')
      .select(`
        id, name, due_date, status,
        project_id,
        project:projects!project_milestones_project_id_fkey(code, name),
        phase:project_phases!project_milestones_phase_id_fkey(name)
      `)
      .in('status', ['pending', 'approaching', 'overdue'])
      .lte('due_date', futureStr)
      .order('due_date', { ascending: true })
      .limit(20)

    const { data, error } = await query
    if (error) throw error

    return (data || []).map(ms => ({
      id: ms.id,
      name: ms.name,
      due_date: ms.due_date,
      status: ms.status,
      project_id: ms.project_id,
      project_code: (ms.project as any)?.code || '',
      project_name: (ms.project as any)?.name || '',
      phase_name: (ms.phase as any)?.name || null,
      is_overdue: ms.due_date < todayStr,
    }))
  },
}

export default projectDashboardService