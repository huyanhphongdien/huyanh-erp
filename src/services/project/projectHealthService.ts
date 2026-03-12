// ============================================================================
// FILE: src/services/project/projectHealthService.ts
// MODULE: Quản lý Dự án — Huy Anh Rubber ERP
// PHASE: PM9 — Bước 9.6: RAG Health Indicator
// ============================================================================
// Tính sức khỏe dự án theo RAG (Red/Amber/Green):
//   Base: gap = actual_progress - planned_progress (by time elapsed)
//   Adjust: overdue milestones, critical risks, open critical issues
// Dùng trong: ProjectDashboard, ProjectStatusCard, ProjectReportPage
// ============================================================================

import { supabase } from '../../lib/supabase'

// ============================================================================
// TYPES
// ============================================================================

export type HealthStatus = 'green' | 'amber' | 'red'

export interface HealthResult {
  status: HealthStatus
  label: string
  color: string
  bg: string
  border: string
  text: string
  dot: string
  gap: number                    // actual - planned (%)
  planned_progress: number       // % based on time elapsed
  actual_progress: number        // project.progress_pct
  adjustments: HealthAdjustment[]
  score: number                  // -100 → +100, negative = worse
}

export interface HealthAdjustment {
  reason: string
  impact: number                 // negative = degrade, positive = upgrade (chưa dùng)
}

export interface ProjectHealthSummary {
  project_id: string
  project_code: string
  project_name: string
  health: HealthResult
}

// ============================================================================
// CONFIG
// ============================================================================

const HEALTH_CONFIG: Record<HealthStatus, Omit<HealthResult, 'gap' | 'planned_progress' | 'actual_progress' | 'adjustments' | 'score'>> = {
  green: { status: 'green', label: 'Đúng tiến độ',  color: '#16A34A', bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  amber: { status: 'amber', label: 'Có rủi ro',     color: '#EA580C', bg: 'bg-orange-50',  border: 'border-orange-200',  text: 'text-orange-700',  dot: 'bg-orange-500' },
  red:   { status: 'red',   label: 'Trễ tiến độ',   color: '#DC2626', bg: 'bg-red-50',     border: 'border-red-200',     text: 'text-red-700',     dot: 'bg-red-500' },
}

// Thresholds
const GREEN_THRESHOLD = -5     // gap >= -5 → green
const AMBER_THRESHOLD = -15    // gap >= -15 → amber, < -15 → red

// Adjustment weights
const OVERDUE_MILESTONE_PENALTY = -3   // per overdue milestone
const CRITICAL_RISK_PENALTY = -4       // per critical risk (score >= 12)
const HIGH_RISK_PENALTY = -2           // per high risk (score >= 6)
const CRITICAL_ISSUE_PENALTY = -5      // per open critical issue
const HIGH_ISSUE_PENALTY = -2          // per open high issue

// ============================================================================
// MAIN SERVICE
// ============================================================================

export const projectHealthService = {

  // --------------------------------------------------------------------------
  // Calculate health for a single project
  // --------------------------------------------------------------------------
  async calculateHealth(projectId: string): Promise<HealthResult> {
    // 1. Get project
    const { data: project } = await supabase
      .from('projects')
      .select('id, progress_pct, planned_start, planned_end, status')
      .eq('id', projectId)
      .single()

    if (!project) {
      return { ...HEALTH_CONFIG.green, gap: 0, planned_progress: 0, actual_progress: 0, adjustments: [], score: 0 }
    }

    // Completed/cancelled projects are always green
    if (project.status === 'completed') {
      return { ...HEALTH_CONFIG.green, gap: 0, planned_progress: 100, actual_progress: 100, adjustments: [], score: 100 }
    }
    if (project.status === 'cancelled' || project.status === 'draft') {
      return { ...HEALTH_CONFIG.green, gap: 0, planned_progress: 0, actual_progress: 0, adjustments: [{ reason: 'Dự án chưa bắt đầu', impact: 0 }], score: 0 }
    }

    const actualProgress = project.progress_pct || 0

    // 2. Calculate planned progress by time elapsed
    let plannedProgress = 0
    if (project.planned_start && project.planned_end) {
      const now = new Date()
      const start = new Date(project.planned_start)
      const end = new Date(project.planned_end)
      const totalDays = Math.max(1, (end.getTime() - start.getTime()) / 86400000)
      const elapsedDays = Math.max(0, (now.getTime() - start.getTime()) / 86400000)
      plannedProgress = Math.min(100, Math.round((elapsedDays / totalDays) * 100))
    }

    // 3. Base gap
    const gap = Math.round(actualProgress - plannedProgress)

    // 4. Load adjustment factors
    const adjustments: HealthAdjustment[] = []
    let adjustmentScore = 0

    // 4a. Overdue milestones
    const { data: overdueMilestones } = await supabase
      .from('project_milestones')
      .select('id, name')
      .eq('project_id', projectId)
      .lt('due_date', new Date().toISOString().split('T')[0])
      .in('status', ['pending', 'approaching'])

    const overdueCount = overdueMilestones?.length || 0
    if (overdueCount > 0) {
      adjustmentScore += overdueCount * OVERDUE_MILESTONE_PENALTY
      adjustments.push({
        reason: `${overdueCount} milestone quá hạn`,
        impact: overdueCount * OVERDUE_MILESTONE_PENALTY,
      })
    }

    // 4b. Critical & high risks
    const { data: activeRisks } = await supabase
      .from('project_risks')
      .select('id, probability, impact')
      .eq('project_id', projectId)
      .in('status', ['identified', 'analyzing', 'mitigating'])

    const criticalRisks = (activeRisks || []).filter(r => (r.probability || 0) * (r.impact || 0) >= 12).length
    const highRisks = (activeRisks || []).filter(r => {
      const score = (r.probability || 0) * (r.impact || 0)
      return score >= 6 && score < 12
    }).length

    if (criticalRisks > 0) {
      adjustmentScore += criticalRisks * CRITICAL_RISK_PENALTY
      adjustments.push({
        reason: `${criticalRisks} rủi ro nghiêm trọng (score ≥ 12)`,
        impact: criticalRisks * CRITICAL_RISK_PENALTY,
      })
    }
    if (highRisks > 0) {
      adjustmentScore += highRisks * HIGH_RISK_PENALTY
      adjustments.push({
        reason: `${highRisks} rủi ro cao (score ≥ 6)`,
        impact: highRisks * HIGH_RISK_PENALTY,
      })
    }

    // 4c. Open critical/high issues
    const { data: openIssues } = await supabase
      .from('project_issues')
      .select('id, severity')
      .eq('project_id', projectId)
      .in('status', ['open', 'in_progress'])

    const criticalIssues = (openIssues || []).filter(i => i.severity === 'critical').length
    const highIssues = (openIssues || []).filter(i => i.severity === 'high').length

    if (criticalIssues > 0) {
      adjustmentScore += criticalIssues * CRITICAL_ISSUE_PENALTY
      adjustments.push({
        reason: `${criticalIssues} vấn đề nghiêm trọng đang mở`,
        impact: criticalIssues * CRITICAL_ISSUE_PENALTY,
      })
    }
    if (highIssues > 0) {
      adjustmentScore += highIssues * HIGH_ISSUE_PENALTY
      adjustments.push({
        reason: `${highIssues} vấn đề ưu tiên cao đang mở`,
        impact: highIssues * HIGH_ISSUE_PENALTY,
      })
    }

    // 5. Adjusted score = gap + adjustments
    const adjustedGap = gap + adjustmentScore

    // 6. Determine RAG status
    let status: HealthStatus
    if (adjustedGap >= GREEN_THRESHOLD) {
      status = 'green'
    } else if (adjustedGap >= AMBER_THRESHOLD) {
      status = 'amber'
    } else {
      status = 'red'
    }

    return {
      ...HEALTH_CONFIG[status],
      gap,
      planned_progress: plannedProgress,
      actual_progress: actualProgress,
      adjustments,
      score: Math.max(-100, Math.min(100, adjustedGap)),
    }
  },

  // --------------------------------------------------------------------------
  // Calculate health for ALL active projects (for dashboard)
  // --------------------------------------------------------------------------
  async getPortfolioHealth(): Promise<ProjectHealthSummary[]> {
    const { data: projects } = await supabase
      .from('projects')
      .select('id, code, name')
      .in('status', ['in_progress', 'planning', 'approved', 'on_hold'])
      .order('code')

    if (!projects?.length) return []

    const results: ProjectHealthSummary[] = []
    for (const p of projects) {
      const health = await this.calculateHealth(p.id)
      results.push({
        project_id: p.id,
        project_code: p.code,
        project_name: p.name,
        health,
      })
    }
    return results
  },

  // --------------------------------------------------------------------------
  // Simple client-side calculation (no DB calls, for quick display)
  // Used when you already have progress_pct, planned_start, planned_end
  // --------------------------------------------------------------------------
  calculateHealthSimple(
    progressPct: number,
    plannedStart?: string | null,
    plannedEnd?: string | null,
  ): HealthStatus {
    if (!plannedStart || !plannedEnd) return 'green'
    const now = new Date()
    const start = new Date(plannedStart)
    const end = new Date(plannedEnd)
    const totalDays = Math.max(1, (end.getTime() - start.getTime()) / 86400000)
    const elapsedDays = Math.max(0, (now.getTime() - start.getTime()) / 86400000)
    const plannedProgress = Math.min(100, (elapsedDays / totalDays) * 100)
    const gap = progressPct - plannedProgress

    if (gap >= GREEN_THRESHOLD) return 'green'
    if (gap >= AMBER_THRESHOLD) return 'amber'
    return 'red'
  },

  // --------------------------------------------------------------------------
  // Get config for rendering
  // --------------------------------------------------------------------------
  getConfig(status: HealthStatus) {
    return HEALTH_CONFIG[status]
  },
}

export default projectHealthService