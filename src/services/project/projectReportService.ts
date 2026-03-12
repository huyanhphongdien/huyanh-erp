// ============================================================================
// FILE: src/services/project/projectReportService.ts
// MODULE: Quản lý Dự án — Huy Anh Rubber ERP
// PHASE: PM9 — Bước 9.2: Report Service
// ============================================================================
// Các loại báo cáo dự án:
// - getProgressReport(): Báo cáo tiến độ chi tiết 1 DA
// - getStatusReport(): 1-page summary cho BGĐ (RAG)
// - getPortfolioReport(): Tổng hợp tất cả DA
// - exportPDF / exportExcel: Xuất file
// ============================================================================

import { supabase } from '../../lib/supabase'
import { calculateHealth, type HealthStatus } from './projectDashboardService'

// ============================================
// INTERFACES
// ============================================

export interface ProgressReport {
  project: {
    id: string
    code: string
    name: string
    description: string | null
    status: string
    priority: string
    progress_pct: number
    planned_start: string | null
    planned_end: string | null
    actual_start: string | null
    actual_end: string | null
    budget_planned: number
    budget_actual: number
    owner_name: string
    department_name: string
    category_name: string
    health: HealthStatus
  }
  phases: PhaseProgress[]
  milestones: MilestoneProgress[]
  risks_top5: RiskSummary[]
  issues_summary: IssueSummary
  recent_activities: { action: string; entity_name: string; actor_name: string; created_at: string }[]
}

export interface PhaseProgress {
  id: string
  name: string
  order_index: number
  status: string
  progress_pct: number
  planned_start: string | null
  planned_end: string | null
  actual_start: string | null
  actual_end: string | null
  is_late: boolean
}

export interface MilestoneProgress {
  id: string
  name: string
  due_date: string
  status: string
  completed_at: string | null
  is_on_time: boolean | null // null nếu chưa hoàn thành
  phase_name: string | null
}

export interface RiskSummary {
  id: string
  code: string
  title: string
  category: string
  probability: number
  impact: number
  risk_score: number
  status: string
  owner_name: string
}

export interface IssueSummary {
  total: number
  by_severity: { severity: string; count: number }[]
  by_status: { status: string; count: number }[]
}

export interface StatusReport {
  project_code: string
  project_name: string
  report_period: string
  health: HealthStatus
  health_gap: number
  // Summary
  overall_progress: number
  planned_end: string | null
  budget_planned: number
  budget_actual: number
  budget_variance_pct: number
  owner_name: string
  // Phases mini
  phases: { name: string; progress: number; status: string }[]
  // Milestones upcoming
  milestones: { name: string; due_date: string; status: string }[]
  // Top risks
  top_risks: { title: string; score: number; owner: string }[]
  // Issues count
  issues: { critical: number; high: number; medium: number; low: number }
}

export interface PortfolioItem {
  id: string
  code: string
  name: string
  status: string
  priority: string
  progress_pct: number
  health: HealthStatus
  owner_name: string
  department_name: string
  planned_end: string | null
  budget_planned: number
  budget_actual: number
  next_milestone: string | null
  next_milestone_due: string | null
  risk_count: number
  issue_count: number
}

export interface PortfolioReport {
  generated_at: string
  total_projects: number
  on_track_pct: number
  at_risk_pct: number
  behind_pct: number
  items: PortfolioItem[]
  top_risks: RiskSummary[]
}

// ============================================
// SERVICE
// ============================================

export const projectReportService = {

  // -----------------------------------------
  // 9.2.1 — Progress Report (chi tiết 1 DA)
  // -----------------------------------------
  async getProgressReport(projectId: string): Promise<ProgressReport> {
    // 1. Project info
    const { data: proj, error: projErr } = await supabase
      .from('projects')
      .select(`
        id, code, name, description, status, priority, progress_pct,
        planned_start, planned_end, actual_start, actual_end,
        budget_planned, budget_actual,
        owner:employees!projects_owner_id_fkey(full_name),
        department:departments!projects_department_id_fkey(name),
        category:project_categories!projects_category_id_fkey(name)
      `)
      .eq('id', projectId)
      .single()

    if (projErr) throw projErr

    const { health } = calculateHealth(
      proj.progress_pct,
      proj.planned_start,
      proj.planned_end
    )

    // 2. Phases
    const { data: phases } = await supabase
      .from('project_phases')
      .select('id, name, order_index, status, progress_pct, planned_start, planned_end, actual_start, actual_end')
      .eq('project_id', projectId)
      .order('order_index', { ascending: true })

    const today = new Date().toISOString().split('T')[0]
    const phaseProgress: PhaseProgress[] = (phases || []).map(ph => ({
      ...ph,
      progress_pct: Number(ph.progress_pct) || 0,
      is_late: ph.status !== 'completed' && ph.planned_end != null && ph.planned_end < today,
    }))

    // 3. Milestones
    const { data: milestones } = await supabase
      .from('project_milestones')
      .select(`
        id, name, due_date, status, completed_at,
        phase:project_phases!project_milestones_phase_id_fkey(name)
      `)
      .eq('project_id', projectId)
      .order('due_date', { ascending: true })

    const milestoneProgress: MilestoneProgress[] = (milestones || []).map(ms => {
      let is_on_time: boolean | null = null
      if (ms.status === 'completed' && ms.completed_at) {
        is_on_time = ms.completed_at.split('T')[0] <= ms.due_date
      }
      return {
        id: ms.id,
        name: ms.name,
        due_date: ms.due_date,
        status: ms.status,
        completed_at: ms.completed_at,
        is_on_time,
        phase_name: (ms.phase as any)?.name || null,
      }
    })

    // 4. Top 5 Risks
    const { data: risks } = await supabase
      .from('project_risks')
      .select(`
        id, code, title, category, probability, impact, risk_score, status,
        owner:employees!project_risks_owner_id_fkey(full_name)
      `)
      .eq('project_id', projectId)
      .not('status', 'eq', 'closed')
      .order('risk_score', { ascending: false })
      .limit(5)

    const risks_top5: RiskSummary[] = (risks || []).map(r => ({
      id: r.id,
      code: r.code,
      title: r.title,
      category: r.category,
      probability: r.probability,
      impact: r.impact,
      risk_score: r.risk_score,
      status: r.status,
      owner_name: (r.owner as any)?.full_name || '—',
    }))

    // 5. Issues summary
    const { data: issues } = await supabase
      .from('project_issues')
      .select('id, severity, status')
      .eq('project_id', projectId)
      .not('status', 'eq', 'closed')

    const issueList = issues || []
    const bySeverity: Record<string, number> = {}
    const byStatus: Record<string, number> = {}
    for (const iss of issueList) {
      bySeverity[iss.severity] = (bySeverity[iss.severity] || 0) + 1
      byStatus[iss.status] = (byStatus[iss.status] || 0) + 1
    }

    const issues_summary: IssueSummary = {
      total: issueList.length,
      by_severity: Object.entries(bySeverity).map(([severity, count]) => ({ severity, count })),
      by_status: Object.entries(byStatus).map(([status, count]) => ({ status, count })),
    }

    // 6. Recent activities
    const { data: activities } = await supabase
      .from('project_activities')
      .select(`
        action, entity_name, created_at,
        actor:employees!project_activities_actor_id_fkey(full_name)
      `)
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(10)

    const recent_activities = (activities || []).map(a => ({
      action: a.action,
      entity_name: a.entity_name || '',
      actor_name: (a.actor as any)?.full_name || '—',
      created_at: a.created_at,
    }))

    return {
      project: {
        id: proj.id,
        code: proj.code,
        name: proj.name,
        description: proj.description,
        status: proj.status,
        priority: proj.priority,
        progress_pct: Number(proj.progress_pct) || 0,
        planned_start: proj.planned_start,
        planned_end: proj.planned_end,
        actual_start: proj.actual_start,
        actual_end: proj.actual_end,
        budget_planned: Number(proj.budget_planned) || 0,
        budget_actual: Number(proj.budget_actual) || 0,
        owner_name: (proj.owner as any)?.full_name || '—',
        department_name: (proj.department as any)?.name || '—',
        category_name: (proj.category as any)?.name || '—',
        health,
      },
      phases: phaseProgress,
      milestones: milestoneProgress,
      risks_top5,
      issues_summary,
      recent_activities,
    }
  },

  // -----------------------------------------
  // 9.2.2 — Status Report (1-page cho BGĐ)
  // -----------------------------------------
  async getStatusReport(projectId: string, period?: string): Promise<StatusReport> {
    const report = await this.getProgressReport(projectId)
    const { project, phases, milestones, risks_top5, issues_summary } = report

    const { health, gap } = calculateHealth(
      project.progress_pct,
      project.planned_start,
      project.planned_end
    )

    const budgetVariance = project.budget_planned > 0
      ? ((project.budget_actual - project.budget_planned) / project.budget_planned) * 100
      : 0

    // Issues by severity count
    const issuesBySev: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0 }
    for (const s of issues_summary.by_severity) {
      if (s.severity in issuesBySev) {
        issuesBySev[s.severity] = s.count
      }
    }

    // Upcoming milestones (not completed)
    const upcomingMs = milestones
      .filter(ms => ms.status !== 'completed')
      .slice(0, 5)

    return {
      project_code: project.code,
      project_name: project.name,
      report_period: period || new Date().toISOString().split('T')[0],
      health,
      health_gap: gap,
      overall_progress: project.progress_pct,
      planned_end: project.planned_end,
      budget_planned: project.budget_planned,
      budget_actual: project.budget_actual,
      budget_variance_pct: Math.round(budgetVariance * 100) / 100,
      owner_name: project.owner_name,
      phases: phases.map(ph => ({
        name: ph.name,
        progress: ph.progress_pct,
        status: ph.status,
      })),
      milestones: upcomingMs.map(ms => ({
        name: ms.name,
        due_date: ms.due_date,
        status: ms.status,
      })),
      top_risks: risks_top5.map(r => ({
        title: r.title,
        score: r.risk_score,
        owner: r.owner_name,
      })),
      issues: issuesBySev as any,
    }
  },

  // -----------------------------------------
  // 9.2.3 — Portfolio Report (tất cả DA)
  // -----------------------------------------
  async getPortfolioReport(): Promise<PortfolioReport> {
    const { data: projects, error } = await supabase
      .from('projects')
      .select(`
        id, code, name, status, priority, progress_pct,
        planned_start, planned_end, budget_planned, budget_actual,
        owner:employees!projects_owner_id_fkey(full_name),
        department:departments!projects_department_id_fkey(name)
      `)
      .not('status', 'eq', 'cancelled')
      .order('status', { ascending: true })
      .order('planned_end', { ascending: true })

    if (error) throw error
    const all = projects || []

    // Get upcoming milestone for each project
    const projectIds = all.map(p => p.id)
    const today = new Date().toISOString().split('T')[0]

    let milestoneMap = new Map<string, { name: string; due_date: string }>()
    if (projectIds.length > 0) {
      const { data: milestones } = await supabase
        .from('project_milestones')
        .select('project_id, name, due_date')
        .in('project_id', projectIds)
        .in('status', ['pending', 'approaching'])
        .gte('due_date', today)
        .order('due_date', { ascending: true })

      for (const ms of (milestones || [])) {
        if (!milestoneMap.has(ms.project_id)) {
          milestoneMap.set(ms.project_id, { name: ms.name, due_date: ms.due_date })
        }
      }
    }

    // Risk & Issue counts
    let riskCountMap = new Map<string, number>()
    let issueCountMap = new Map<string, number>()
    if (projectIds.length > 0) {
      const { data: riskCounts } = await supabase
        .from('project_risks')
        .select('project_id')
        .in('project_id', projectIds)
        .not('status', 'eq', 'closed')

      for (const r of (riskCounts || [])) {
        riskCountMap.set(r.project_id, (riskCountMap.get(r.project_id) || 0) + 1)
      }

      const { data: issueCounts } = await supabase
        .from('project_issues')
        .select('project_id')
        .in('project_id', projectIds)
        .not('status', 'eq', 'closed')

      for (const i of (issueCounts || [])) {
        issueCountMap.set(i.project_id, (issueCountMap.get(i.project_id) || 0) + 1)
      }
    }

    let onTrack = 0, atRisk = 0, behind = 0
    const items: PortfolioItem[] = all.map(p => {
      const { health } = calculateHealth(p.progress_pct, p.planned_start, p.planned_end)
      if (health === 'on_track') onTrack++
      else if (health === 'at_risk') atRisk++
      else behind++

      const nextMs = milestoneMap.get(p.id)

      return {
        id: p.id,
        code: p.code,
        name: p.name,
        status: p.status,
        priority: p.priority,
        progress_pct: Number(p.progress_pct) || 0,
        health,
        owner_name: (p.owner as any)?.full_name || '—',
        department_name: (p.department as any)?.name || '—',
        planned_end: p.planned_end,
        budget_planned: Number(p.budget_planned) || 0,
        budget_actual: Number(p.budget_actual) || 0,
        next_milestone: nextMs?.name || null,
        next_milestone_due: nextMs?.due_date || null,
        risk_count: riskCountMap.get(p.id) || 0,
        issue_count: issueCountMap.get(p.id) || 0,
      }
    })

    const total = items.length || 1

    // Top risks across all projects
    const { data: topRisks } = await supabase
      .from('project_risks')
      .select(`
        id, code, title, category, probability, impact, risk_score, status,
        owner:employees!project_risks_owner_id_fkey(full_name)
      `)
      .in('project_id', projectIds)
      .not('status', 'eq', 'closed')
      .order('risk_score', { ascending: false })
      .limit(10)

    return {
      generated_at: new Date().toISOString(),
      total_projects: items.length,
      on_track_pct: Math.round((onTrack / total) * 100),
      at_risk_pct: Math.round((atRisk / total) * 100),
      behind_pct: Math.round((behind / total) * 100),
      items,
      top_risks: (topRisks || []).map(r => ({
        id: r.id,
        code: r.code,
        title: r.title,
        category: r.category,
        probability: r.probability,
        impact: r.impact,
        risk_score: r.risk_score,
        status: r.status,
        owner_name: (r.owner as any)?.full_name || '—',
      })),
    }
  },
}

export default projectReportService