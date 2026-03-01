// ============================================================================
// FILE: src/components/project/ProjectReportsTab.tsx
// MODULE: Quản lý Dự án — Huy Anh Rubber ERP
// PHASE: PM9 — Tab Báo cáo hoàn chỉnh
// ============================================================================
// Sections:
//   1. RAG Health Card (Sức khỏe dự án)
//   2. Quick Stats (Tasks, Milestones, Budget, Members)
//   3. Budget Comparison (Planned vs Actual bar)
//   4. Milestone Table (với status icons, overdue highlight)
//   5. Phase Progress (horizontal bars với dates)
//   6. Top Risks (severity-colored score badges)
//   7. Issues by Severity (mini cards)
//   8. Team Summary (member roles + workload)
//   9. Export Actions (PDF, CSV, Portfolio)
// ============================================================================

import React, { useState, useEffect, useMemo } from 'react'
import {
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Users,
  Target,
  ShieldAlert,
  Flag,
  TrendingUp,
  TrendingDown,
  Minus,
  Printer,
  FileSpreadsheet,
  Download,
  ChevronDown,
  ChevronUp,
  Calendar,
  DollarSign,
  CircleDot,
  BarChart3,
  Crown,
  UserCog,
  Eye,
  FileText,
  FolderKanban,
  Info,
  Activity,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { projectHealthService, type HealthResult } from '../../services/project/projectHealthService'
import { exportStatusReportPDF, exportPortfolioCSV, type PDFReportData } from '../../utils/exportProjectPDF'

// ============================================================================
// TYPES
// ============================================================================

interface Phase {
  id: string
  name: string
  status: string
  progress_pct: number
  planned_start?: string
  planned_end?: string
  color?: string
  order_index: number
}

interface Project {
  id: string
  code: string
  name: string
  description?: string
  status: string
  priority: string
  progress_pct: number
  planned_start?: string
  planned_end?: string
  actual_start?: string
  actual_end?: string
  budget_planned: number
  budget_actual: number
  budget_currency: string
  owner?: { id: string; full_name: string }
  sponsor?: { id: string; full_name: string }
  department?: { id: string; name: string }
  category?: { id: string; name: string; color: string }
  tags?: string[]
  created_at: string
  updated_at: string
}

interface MilestoneRow {
  id: string
  name: string
  due_date?: string
  completed_date?: string
  status: string
  phase_name?: string
  assignee_name?: string
}

interface RiskRow {
  id: string
  code: string
  title: string
  probability: number
  impact: number
  score: number
  status: string
  owner_name?: string
  category?: string
}

interface MemberRow {
  id: string
  full_name: string
  role: string
  department_name?: string
  task_count: number
}

// ============================================================================
// CONSTANTS
// ============================================================================

const STATUS_VI: Record<string, string> = {
  draft: 'Nháp', planning: 'Lên KH', approved: 'Đã duyệt',
  in_progress: 'Đang thực hiện', on_hold: 'Tạm dừng', completed: 'Hoàn thành', cancelled: 'Hủy',
  pending: 'Chờ', approaching: 'Sắp tới', overdue: 'Quá hạn',
  identified: 'Đã xác định', analyzing: 'Đang phân tích', mitigating: 'Đang xử lý',
  accepted: 'Chấp nhận', resolved: 'Đã xử lý', closed: 'Đóng',
  open: 'Mở', 'in-progress': 'Đang xử lý',
}

const PHASE_STATUS_CONFIG: Record<string, { bg: string; text: string; dot: string }> = {
  pending:     { bg: 'bg-gray-50',    text: 'text-gray-600',    dot: 'bg-gray-400' },
  in_progress: { bg: 'bg-blue-50',    text: 'text-blue-700',    dot: 'bg-blue-500' },
  completed:   { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  skipped:     { bg: 'bg-gray-50',    text: 'text-gray-400',    dot: 'bg-gray-300' },
}

const ROLE_LABELS: Record<string, string> = {
  pm: 'PM', lead: 'Lead', member: 'Thành viên',
  reviewer: 'Reviewer', observer: 'Quan sát',
}

function fmtDate(d?: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function fmtDateShort(d?: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })
}

function fmtCurrency(n: number): string {
  if (!n) return '0 đ'
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} tỷ`
  if (n >= 1e6) return `${(n / 1e6).toFixed(0)} tr`
  return n.toLocaleString('vi-VN') + ' đ'
}

function daysUntil(d?: string | null): number | null {
  if (!d) return null
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000)
}

// ============================================================================
// COMPONENT
// ============================================================================

const ProjectReportsTab: React.FC<{
  projectId: string
  project: Project
  phases: Phase[]
}> = ({ projectId, project, phases }) => {
  const { user } = useAuthStore()

  // State
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [exportingDetail, setExportingDetail] = useState(false)
  const [exportingPortfolio, setExportingPortfolio] = useState(false)
  const [healthResult, setHealthResult] = useState<HealthResult | null>(null)
  const [taskStats, setTaskStats] = useState({ total: 0, completed: 0, in_progress: 0, overdue: 0, cancelled: 0 })
  const [milestones, setMilestones] = useState<MilestoneRow[]>([])
  const [risks, setRisks] = useState<RiskRow[]>([])
  const [members, setMembers] = useState<MemberRow[]>([])
  const [issuesBySeverity, setIssuesBySeverity] = useState({ critical: 0, high: 0, medium: 0, low: 0, total: 0 })
  const [showAllMilestones, setShowAllMilestones] = useState(false)
  const [showAllRisks, setShowAllRisks] = useState(false)

  // Load data
  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        // 1. Health
        const health = await projectHealthService.calculateHealth(projectId)
        setHealthResult(health)

        // 2. Tasks
        const { data: tasks } = await supabase
          .from('tasks')
          .select('id, status, due_date')
          .eq('project_id', projectId)
        const tl = tasks || []
        const now = new Date()
        setTaskStats({
          total: tl.length,
          completed: tl.filter(t => t.status === 'completed').length,
          in_progress: tl.filter(t => t.status === 'in_progress').length,
          overdue: tl.filter(t =>
            t.due_date && new Date(t.due_date) < now &&
            t.status !== 'completed' && t.status !== 'cancelled'
          ).length,
          cancelled: tl.filter(t => t.status === 'cancelled').length,
        })

        // 3. Milestones
        const { data: ms } = await supabase
          .from('project_milestones')
          .select('id, name, due_date, completed_date, status, phase_id, assignee_id')
          .eq('project_id', projectId)
          .order('due_date')
        const phLookup = new Map<string, string>()
        phases.forEach(p => phLookup.set(p.id, p.name))

        // Load assignee names
        const assigneeIds = [...new Set((ms || []).map(m => m.assignee_id).filter(Boolean))]
        const assigneeLookup = new Map<string, string>()
        if (assigneeIds.length > 0) {
          const { data: emps } = await supabase
            .from('employees')
            .select('id, full_name')
            .in('id', assigneeIds)
          ;(emps || []).forEach(e => assigneeLookup.set(e.id, e.full_name))
        }

        setMilestones((ms || []).map(m => ({
          id: m.id,
          name: m.name,
          due_date: m.due_date,
          completed_date: m.completed_date,
          status: m.status,
          phase_name: m.phase_id ? phLookup.get(m.phase_id) : undefined,
          assignee_name: m.assignee_id ? assigneeLookup.get(m.assignee_id) : undefined,
        })))

        // 4. Risks
        const { data: riskData } = await supabase
          .from('project_risks')
          .select('id, code, title, probability, impact, status, owner_id, category')
          .eq('project_id', projectId)
          .in('status', ['identified', 'analyzing', 'mitigating'])
          .order('probability', { ascending: false })
        const riskOwnerIds = [...new Set((riskData || []).map(r => r.owner_id).filter(Boolean))]
        const riskOwnerMap = new Map<string, string>()
        if (riskOwnerIds.length > 0) {
          const { data: emps } = await supabase
            .from('employees')
            .select('id, full_name')
            .in('id', riskOwnerIds)
          ;(emps || []).forEach(e => riskOwnerMap.set(e.id, e.full_name))
        }
        setRisks((riskData || []).map(r => ({
          id: r.id,
          code: r.code || '',
          title: r.title,
          probability: r.probability || 0,
          impact: r.impact || 0,
          score: (r.probability || 0) * (r.impact || 0),
          status: r.status,
          owner_name: r.owner_id ? riskOwnerMap.get(r.owner_id) : undefined,
          category: r.category,
        })).sort((a, b) => b.score - a.score))

        // 5. Issues
        const { data: issues } = await supabase
          .from('project_issues')
          .select('severity')
          .eq('project_id', projectId)
          .in('status', ['open', 'in_progress'])
        const il = issues || []
        setIssuesBySeverity({
          critical: il.filter(i => i.severity === 'critical').length,
          high: il.filter(i => i.severity === 'high').length,
          medium: il.filter(i => i.severity === 'medium').length,
          low: il.filter(i => i.severity === 'low').length,
          total: il.length,
        })

        // 6. Members
        const { data: memberData } = await supabase
          .from('project_members')
          .select('id, employee_id, role')
          .eq('project_id', projectId)
        const memberEmpIds = (memberData || []).map(m => m.employee_id).filter(Boolean)
        const memberMap = new Map<string, { full_name: string; department_name?: string }>()
        if (memberEmpIds.length > 0) {
          const { data: emps } = await supabase
            .from('employees')
            .select('id, full_name, department:departments(name)')
            .in('id', memberEmpIds)
          ;(emps || []).forEach((e: any) => memberMap.set(e.id, {
            full_name: e.full_name,
            department_name: Array.isArray(e.department) ? e.department[0]?.name : e.department?.name,
          }))
        }

        // Count tasks per member
        const taskCountMap = new Map<string, number>()
        if (memberEmpIds.length > 0) {
          const { data: memberTasks } = await supabase
            .from('tasks')
            .select('assignee_id')
            .eq('project_id', projectId)
            .in('assignee_id', memberEmpIds)
            .neq('status', 'cancelled')
          ;(memberTasks || []).forEach(t => {
            taskCountMap.set(t.assignee_id, (taskCountMap.get(t.assignee_id) || 0) + 1)
          })
        }

        setMembers((memberData || []).map(m => {
          const emp = memberMap.get(m.employee_id)
          return {
            id: m.id,
            full_name: emp?.full_name || '?',
            role: m.role,
            department_name: emp?.department_name,
            task_count: taskCountMap.get(m.employee_id) || 0,
          }
        }).sort((a, b) => {
          const roleOrder: Record<string, number> = { pm: 0, lead: 1, member: 2, reviewer: 3, observer: 4 }
          return (roleOrder[a.role] ?? 5) - (roleOrder[b.role] ?? 5)
        }))

      } catch (err) {
        console.error('[ReportsTab] Load error:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [projectId, phases])

  // Computed
  const completionPct = useMemo(() => {
    if (taskStats.total === 0) return 0
    return Math.round((taskStats.completed / taskStats.total) * 100)
  }, [taskStats])

  const milestoneStats = useMemo(() => {
    const total = milestones.length
    const completed = milestones.filter(m => m.status === 'completed').length
    const overdue = milestones.filter(m =>
      m.status !== 'completed' && m.status !== 'cancelled' &&
      m.due_date && new Date(m.due_date) < new Date()
    ).length
    return { total, completed, overdue }
  }, [milestones])

  const budgetPct = useMemo(() => {
    if (!project.budget_planned || project.budget_planned === 0) return 0
    return Math.round((project.budget_actual / project.budget_planned) * 100)
  }, [project])

  const budgetRemaining = useMemo(() => {
    return project.budget_planned - project.budget_actual
  }, [project])

  const daysLeft = useMemo(() => {
    return daysUntil(project.planned_end)
  }, [project])

  // Export PDF
  const handleExportPDF = () => {
    setExporting(true)
    try {
      const now = new Date()
      const periodLabel = `Tháng ${now.getMonth() + 1}/${now.getFullYear()}`
      const data: PDFReportData = {
        project: {
          code: project.code,
          name: project.name,
          description: project.description,
          status: project.status,
          progress_pct: project.progress_pct,
          planned_start: project.planned_start,
          planned_end: project.planned_end,
          actual_start: project.actual_start,
          budget_planned: project.budget_planned || 0,
          budget_actual: project.budget_actual || 0,
          owner_name: project.owner?.full_name,
          department_name: project.department?.name,
          category_name: project.category?.name,
        },
        health: healthResult?.status || 'green',
        health_label: healthResult?.label || 'Đúng tiến độ',
        planned_progress: healthResult?.planned_progress || 0,
        period_label: periodLabel,
        phases: phases.map(p => ({
          name: p.name, status: p.status, progress_pct: p.progress_pct,
          planned_start: p.planned_start, planned_end: p.planned_end, color: p.color,
        })),
        milestones: milestones.map(m => ({
          name: m.name, due_date: m.due_date, completed_date: m.completed_date,
          status: m.status, phase_name: m.phase_name,
        })),
        risks: risks.slice(0, 5).map(r => ({
          code: r.code, title: r.title, score: r.score, owner_name: r.owner_name,
        })),
        issues_by_severity: issuesBySeverity,
        task_stats: taskStats,
        exported_by: user?.full_name || 'System',
      }
      exportStatusReportPDF(data)
    } catch (err) {
      console.error('Export PDF error:', err)
      alert('Export thất bại')
    } finally {
      setExporting(false)
    }
  }

  // Export Detailed PDF (multi-page, full data)
  const handleExportDetailPDF = () => {
    setExportingDetail(true)
    try {
      const now = new Date()
      const periodLabel = `Tháng ${now.getMonth() + 1}/${now.getFullYear()}`
      const hc = healthResult
      const hConfig = hc ? projectHealthService.getConfig(hc.status) : null

      const HEALTH_COLORS: Record<string, { bg: string; label: string }> = {
        green: { bg: '#16A34A', label: 'ON TRACK' },
        amber: { bg: '#EA580C', label: 'AT RISK' },
        red:   { bg: '#DC2626', label: 'BEHIND' },
      }
      const ragC = HEALTH_COLORS[hc?.status || 'green']

      const STATUS_VI_MAP: Record<string, string> = {
        draft: 'Nháp', planning: 'Lên KH', approved: 'Đã duyệt',
        in_progress: 'Đang chạy', on_hold: 'Tạm dừng', completed: 'Xong', cancelled: 'Hủy',
        pending: 'Chờ', approaching: 'Sắp tới', overdue: 'Trễ',
        identified: 'Đã xác định', analyzing: 'Phân tích', mitigating: 'Xử lý',
        accepted: 'Chấp nhận', resolved: 'Đã xử lý', closed: 'Đóng',
      }

      const fDate = (d?: string | null) => {
        if (!d) return '—'
        return new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
      }
      const fCurr = (n: number) => {
        if (!n) return '0'
        if (n >= 1e9) return `${(n / 1e9).toFixed(1)} tỷ`
        if (n >= 1e6) return `${(n / 1e6).toFixed(0)} tr`
        return n.toLocaleString('vi-VN')
      }
      const pBar = (pct: number, color: string) =>
        `<div style="height:6px;background:#e5e7eb;border-radius:6px;overflow:hidden;width:100%"><div style="height:100%;width:${Math.min(100,pct)}%;background:${color};border-radius:6px"></div></div>`

      const budgetPctVal = project.budget_planned > 0 ? Math.round((project.budget_actual / project.budget_planned) * 100) : 0

      const html = `<!DOCTYPE html>
<html lang="vi"><head><meta charset="UTF-8">
<title>Báo cáo chi tiết — ${project.code}</title>
<style>
@page{size:A4;margin:14mm 16mm}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',system-ui,sans-serif;font-size:10px;color:#1a1a1a;line-height:1.45}
.header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:10px;border-bottom:3px solid #1B4D3E;margin-bottom:14px}
.header-left h1{font-size:15px;color:#1B4D3E;margin-bottom:2px}
.header-left .code{font-size:10px;color:#6B7280;font-family:'JetBrains Mono',monospace}
.header-left .period{font-size:9px;color:#9CA3AF;margin-top:3px}
.rag{width:70px;height:70px;border-radius:50%;background:${ragC.bg};display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff}
.rag-pct{font-size:18px;font-weight:800;font-family:'JetBrains Mono',monospace}
.rag-label{font-size:7px;font-weight:700;letter-spacing:1px;text-transform:uppercase;margin-top:1px}
.section{margin-bottom:12px}
.section-title{font-size:11px;font-weight:700;color:#1B4D3E;border-bottom:1.5px solid #1B4D3E;padding-bottom:2px;margin-bottom:6px}
.info-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px}
.info-item{background:#F9FAFB;border:1px solid #E5E7EB;border-radius:5px;padding:5px 7px}
.info-label{font-size:7px;color:#9CA3AF;text-transform:uppercase;letter-spacing:.5px}
.info-value{font-size:10px;font-weight:600;color:#374151;margin-top:1px}
table{width:100%;border-collapse:collapse;font-size:9px}
th{background:#F3F4F6;font-weight:600;padding:4px 5px;text-align:left;border:1px solid #E5E7EB}
td{padding:4px 5px;border:1px solid #E5E7EB}
.overdue{color:#DC2626;font-weight:600}
.completed{color:#16A34A}
.risk-score{display:inline-block;width:24px;height:24px;border-radius:5px;color:#fff;font-size:10px;font-weight:800;text-align:center;line-height:24px}
.issue-grid{display:flex;gap:5px}
.issue-box{flex:1;border-radius:5px;padding:6px;text-align:center}
.issue-count{font-size:16px;font-weight:800;font-family:'JetBrains Mono',monospace}
.issue-label{font-size:7px;margin-top:1px}
.member-row{display:flex;align-items:center;gap:6px;margin-bottom:4px}
.member-avatar{width:22px;height:22px;border-radius:50%;background:#1B4D3E;color:#fff;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700}
.footer{margin-top:12px;padding-top:8px;border-top:1px solid #E5E7EB;display:flex;justify-content:space-between;font-size:7px;color:#9CA3AF}
.two-col{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.page-break{page-break-before:always;margin-top:12px}
</style></head><body>

<!-- HEADER -->
<div class="header">
  <div class="header-left">
    <div class="code">${project.code}</div>
    <h1>${project.name}</h1>
    <div class="period">${periodLabel} · ${project.department?.name || ''} · PM: ${project.owner?.full_name || '—'}</div>
    ${project.description ? `<div style="font-size:9px;color:#6B7280;margin-top:3px;max-width:400px">${project.description}</div>` : ''}
  </div>
  <div class="rag"><div class="rag-pct">${project.progress_pct}%</div><div class="rag-label">${ragC.label}</div></div>
</div>

<!-- 1. THÔNG TIN CHUNG -->
<div class="section">
  <div class="section-title">1. Thông tin chung</div>
  <div class="info-grid">
    <div class="info-item"><div class="info-label">Thời gian KH</div><div class="info-value">${fDate(project.planned_start)} → ${fDate(project.planned_end)}</div></div>
    <div class="info-item"><div class="info-label">Bắt đầu thực tế</div><div class="info-value">${fDate(project.actual_start)}</div></div>
    <div class="info-item"><div class="info-label">Trạng thái</div><div class="info-value">${STATUS_VI_MAP[project.status] || project.status}</div></div>
    <div class="info-item"><div class="info-label">Tiến độ TT / KH</div><div class="info-value" style="color:${ragC.bg}">${hc?.actual_progress || 0}% / ${hc?.planned_progress || 0}% (Gap: ${hc?.gap || 0}%)</div></div>
    <div class="info-item"><div class="info-label">Ngân sách</div><div class="info-value" ${budgetPctVal > 100 ? 'style="color:#DC2626"' : ''}>${fCurr(project.budget_actual)} / ${fCurr(project.budget_planned)} (${budgetPctVal}%)</div></div>
    <div class="info-item"><div class="info-label">Tasks</div><div class="info-value">${taskStats.completed}/${taskStats.total} xong · ${taskStats.in_progress} đang làm · <span ${taskStats.overdue > 0 ? 'style="color:#DC2626"' : ''}>${taskStats.overdue} quá hạn</span></div></div>
  </div>
</div>

${hc && hc.adjustments.length > 0 ? `
<div class="section">
  <div class="section-title">⚠ Yếu tố ảnh hưởng sức khỏe</div>
  <table><thead><tr><th>Yếu tố</th><th style="width:60px;text-align:center">Điểm</th></tr></thead><tbody>
  ${hc.adjustments.map(a => `<tr><td>${a.reason}</td><td style="text-align:center;color:#DC2626;font-weight:600">${a.impact}</td></tr>`).join('')}
  </tbody></table>
</div>` : ''}

<!-- 2. TIẾN ĐỘ PHASES -->
<div class="section">
  <div class="section-title">2. Tiến độ theo Phase (${phases.length})</div>
  ${phases.sort((a,b) => a.order_index - b.order_index).map(ph => `
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:5px">
      <div style="width:130px;font-size:10px;font-weight:500;color:#374151;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${ph.name}</div>
      <div style="flex:1">${pBar(ph.progress_pct, ph.color || '#6B7280')}</div>
      <div style="width:32px;text-align:right;font-size:10px;font-weight:700;font-family:'JetBrains Mono',monospace">${ph.progress_pct}%</div>
      <div style="width:55px;text-align:center;font-size:8px;color:#6B7280">${STATUS_VI_MAP[ph.status] || ph.status}</div>
      <div style="width:95px;font-size:8px;color:#9CA3AF">${fDate(ph.planned_start)} → ${fDate(ph.planned_end)}</div>
    </div>
  `).join('')}
</div>

<!-- 3. MILESTONES (FULL) -->
<div class="section">
  <div class="section-title">3. Milestones (${milestones.length}) — ${milestoneStats.completed} hoàn thành, ${milestoneStats.overdue} quá hạn</div>
  ${milestones.length > 0 ? `
  <table><thead><tr><th>Milestone</th><th>Phase</th><th>Phụ trách</th><th>Hạn</th><th>Hoàn thành</th><th>Trạng thái</th></tr></thead><tbody>
  ${milestones.map(ms => {
    const isOD = ms.status !== 'completed' && ms.status !== 'cancelled' && ms.due_date && new Date(ms.due_date) < new Date()
    const cls = ms.status === 'completed' ? 'completed' : isOD ? 'overdue' : ''
    return `<tr class="${cls}"><td>${ms.name}</td><td>${ms.phase_name || '—'}</td><td>${ms.assignee_name || '—'}</td><td>${fDate(ms.due_date)}</td><td>${ms.completed_date ? fDate(ms.completed_date) : '—'}</td><td>${ms.status === 'completed' ? '✓ Xong' : isOD ? '⚠ Quá hạn' : (STATUS_VI_MAP[ms.status] || ms.status)}</td></tr>`
  }).join('')}
  </tbody></table>` : '<div style="color:#9CA3AF;font-size:9px">Chưa có milestone</div>'}
</div>

<!-- PAGE BREAK -->
<div class="page-break"></div>

<!-- 4. RỦI RO (FULL) -->
<div class="section">
  <div class="section-title">4. Rủi ro đang mở (${risks.length})</div>
  ${risks.length > 0 ? `
  <table><thead><tr><th style="width:40px">Score</th><th>Mã</th><th>Rủi ro</th><th>P×I</th><th>Chủ sở hữu</th><th>Trạng thái</th></tr></thead><tbody>
  ${risks.map(r => {
    const bg = r.score >= 12 ? '#DC2626' : r.score >= 6 ? '#EA580C' : '#EAB308'
    return `<tr><td style="text-align:center"><span class="risk-score" style="background:${bg}">${r.score}</span></td><td>${r.code}</td><td>${r.title}</td><td style="text-align:center">${r.probability}×${r.impact}</td><td>${r.owner_name || '—'}</td><td>${STATUS_VI_MAP[r.status] || r.status}</td></tr>`
  }).join('')}
  </tbody></table>` : '<div style="color:#9CA3AF;font-size:9px">Không có rủi ro đang mở</div>'}
</div>

<!-- 5. VẤN ĐỀ -->
<div class="section">
  <div class="section-title">5. Vấn đề đang mở (${issuesBySeverity.total})</div>
  <div class="issue-grid">
    <div class="issue-box" style="background:#FEF2F2;color:#DC2626"><div class="issue-count">${issuesBySeverity.critical}</div><div class="issue-label">Nghiêm trọng</div></div>
    <div class="issue-box" style="background:#FFF7ED;color:#EA580C"><div class="issue-count">${issuesBySeverity.high}</div><div class="issue-label">Cao</div></div>
    <div class="issue-box" style="background:#FEFCE8;color:#CA8A04"><div class="issue-count">${issuesBySeverity.medium}</div><div class="issue-label">Trung bình</div></div>
    <div class="issue-box" style="background:#EFF6FF;color:#2563EB"><div class="issue-count">${issuesBySeverity.low}</div><div class="issue-label">Thấp</div></div>
  </div>
</div>

<!-- 6. ĐỘI DỰ ÁN -->
<div class="section">
  <div class="section-title">6. Đội dự án (${members.length} thành viên)</div>
  ${members.length > 0 ? `
  <table><thead><tr><th>Tên</th><th>Vai trò</th><th>Phòng ban</th><th style="text-align:center">Tasks</th></tr></thead><tbody>
  ${members.map(m => `<tr><td style="font-weight:500">${m.full_name}</td><td>${ROLE_LABELS[m.role] || m.role}</td><td>${m.department_name || '—'}</td><td style="text-align:center;font-family:'JetBrains Mono',monospace">${m.task_count}</td></tr>`).join('')}
  </tbody></table>` : '<div style="color:#9CA3AF;font-size:9px">Chưa có thành viên</div>'}
</div>

<!-- FOOTER -->
<div class="footer">
  <span>Công ty TNHH Cao su Huy Anh — Huy Anh Rubber ERP</span>
  <span>Báo cáo chi tiết · Người lập: ${user?.full_name || 'System'} · ${new Date().toLocaleDateString('vi-VN')} ${new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span>
</div>

</body></html>`

      const win = window.open('', '_blank')
      if (!win) { alert('Không thể mở cửa sổ in. Vui lòng cho phép popup.'); return }
      win.document.write(html)
      win.document.close()
      setTimeout(() => win.print(), 400)
    } catch (err) {
      console.error('Export Detail PDF error:', err)
      alert('Export thất bại')
    } finally {
      setExportingDetail(false)
    }
  }

  // Export Portfolio CSV (all active projects)
  const handleExportPortfolio = async () => {
    setExportingPortfolio(true)
    try {
      const now = new Date()
      const periodLabel = `Tháng ${now.getMonth() + 1}/${now.getFullYear()}`

      // Fetch all active projects
      const { data: projects } = await supabase
        .from('projects')
        .select(`
          id, code, name, status, progress_pct, budget_planned, budget_actual,
          owner:employees!projects_owner_id_fkey(full_name),
          department:departments(name)
        `)
        .in('status', ['in_progress', 'planning', 'approved', 'on_hold'])
        .order('code')

      if (!projects?.length) {
        alert('Không có dự án đang hoạt động để xuất báo cáo.')
        return
      }

      // For each project, get health + counts
      const items = await Promise.all(projects.map(async (p: any) => {
        const health = projectHealthService.calculateHealthSimple(
          p.progress_pct,
          p.planned_start,
          p.planned_end
        )

        // Risk count
        const { count: riskCount } = await supabase
          .from('project_risks')
          .select('id', { count: 'exact', head: true })
          .eq('project_id', p.id)
          .in('status', ['identified', 'analyzing', 'mitigating'])

        // Open issues count
        const { count: issueCount } = await supabase
          .from('project_issues')
          .select('id', { count: 'exact', head: true })
          .eq('project_id', p.id)
          .in('status', ['open', 'in_progress'])

        // Next milestone
        const { data: nextMs } = await supabase
          .from('project_milestones')
          .select('name, due_date')
          .eq('project_id', p.id)
          .in('status', ['pending', 'approaching'])
          .order('due_date')
          .limit(1)

        const ownerName = Array.isArray(p.owner) ? p.owner[0]?.full_name : p.owner?.full_name
        const deptName = Array.isArray(p.department) ? p.department[0]?.name : p.department?.name

        return {
          code: p.code,
          name: p.name,
          pm_name: ownerName,
          department_name: deptName,
          status: p.status,
          progress_pct: p.progress_pct,
          health,
          budget_planned: p.budget_planned || 0,
          budget_actual: p.budget_actual || 0,
          risk_count: riskCount || 0,
          open_issues: issueCount || 0,
          next_milestone: nextMs?.[0]?.name,
          next_milestone_date: nextMs?.[0]?.due_date,
        }
      }))

      exportPortfolioCSV(items, periodLabel)
    } catch (err) {
      console.error('Export Portfolio error:', err)
      alert('Export thất bại')
    } finally {
      setExportingPortfolio(false)
    }
  }

  // ========== LOADING ==========
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-[#1B4D3E]" />
      </div>
    )
  }

  const hc = healthResult
  const hConfig = hc ? projectHealthService.getConfig(hc.status) : null

  // ========== RENDER ==========
  return (
    <div className="space-y-4 pb-8">

      {/* ================================================================
          SECTION 1: RAG HEALTH + OVERVIEW STRIP
          ================================================================ */}
      {hc && hConfig && (
        <div className={`rounded-xl border p-4 ${hConfig.bg} ${hConfig.border}`}>
          {/* Header row */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-gray-500" />
              <h3 className="text-[13px] font-semibold text-gray-700">Sức khỏe dự án (RAG)</h3>
            </div>
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border ${hConfig.bg} ${hConfig.border}`}>
              <div className={`w-3 h-3 rounded-full ${hConfig.dot}`} />
              <span className={`text-[12px] font-bold ${hConfig.text}`}>{hConfig.label}</span>
            </div>
          </div>

          {/* Progress comparison */}
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div className="text-center">
              <div className="text-[10px] text-gray-500 uppercase tracking-wide">Thực tế</div>
              <div className="text-[20px] font-bold font-mono" style={{ color: hConfig.color }}>
                {hc.actual_progress}%
              </div>
            </div>
            <div className="text-center">
              <div className="text-[10px] text-gray-500 uppercase tracking-wide">Kế hoạch</div>
              <div className="text-[20px] font-bold font-mono text-gray-600">{hc.planned_progress}%</div>
            </div>
            <div className="text-center">
              <div className="text-[10px] text-gray-500 uppercase tracking-wide">Chênh lệch</div>
              <div className={`text-[20px] font-bold font-mono flex items-center justify-center gap-1 ${hc.gap >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {hc.gap >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                {hc.gap > 0 ? '+' : ''}{hc.gap}%
              </div>
            </div>
          </div>

          {/* Dual progress bars */}
          <div className="space-y-1.5 mb-3">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-gray-500 w-14">Thực tế</span>
              <div className="flex-1 h-2 bg-white/60 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${hc.actual_progress}%`, backgroundColor: hConfig.color }}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-gray-500 w-14">Kế hoạch</span>
              <div className="flex-1 h-2 bg-white/60 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-gray-400"
                  style={{ width: `${hc.planned_progress}%` }}
                />
              </div>
            </div>
          </div>

          {/* Adjustments */}
          {hc.adjustments.length > 0 && (
            <div className="space-y-1 pt-2 border-t border-white/40">
              {hc.adjustments.map((adj, i) => (
                <div key={i} className="flex items-center gap-2 text-[11px]">
                  <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
                  <span className="text-gray-600 flex-1">{adj.reason}</span>
                  <span className="font-mono text-red-600 shrink-0">{adj.impact > 0 ? '+' : ''}{adj.impact}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ================================================================
          SECTION 2: QUICK STATS GRID (6 metrics)
          ================================================================ */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {/* Tasks completed */}
        <div className="bg-white rounded-xl border border-gray-100 p-3 text-center">
          <div className="text-[18px] font-bold font-mono text-emerald-600">
            {taskStats.completed}/{taskStats.total}
          </div>
          <div className="text-[10px] text-gray-500 mt-0.5">Tasks xong</div>
          <div className="h-1 bg-gray-100 rounded-full mt-2 overflow-hidden">
            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${completionPct}%` }} />
          </div>
        </div>

        {/* In progress */}
        <div className="bg-white rounded-xl border border-gray-100 p-3 text-center">
          <div className="text-[18px] font-bold font-mono text-blue-600">{taskStats.in_progress}</div>
          <div className="text-[10px] text-gray-500 mt-0.5">Đang làm</div>
        </div>

        {/* Overdue */}
        <div className={`rounded-xl border p-3 text-center ${taskStats.overdue > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-gray-100'}`}>
          <div className={`text-[18px] font-bold font-mono ${taskStats.overdue > 0 ? 'text-red-600' : 'text-gray-400'}`}>
            {taskStats.overdue}
          </div>
          <div className="text-[10px] text-gray-500 mt-0.5">Quá hạn</div>
        </div>

        {/* Milestones */}
        <div className="bg-white rounded-xl border border-gray-100 p-3 text-center">
          <div className="text-[18px] font-bold font-mono text-violet-600">
            {milestoneStats.completed}/{milestoneStats.total}
          </div>
          <div className="text-[10px] text-gray-500 mt-0.5">Milestones</div>
        </div>

        {/* Risks */}
        <div className={`rounded-xl border p-3 text-center ${risks.length > 0 ? 'bg-orange-50 border-orange-200' : 'bg-white border-gray-100'}`}>
          <div className={`text-[18px] font-bold font-mono ${risks.length > 0 ? 'text-orange-600' : 'text-gray-400'}`}>
            {risks.length}
          </div>
          <div className="text-[10px] text-gray-500 mt-0.5">Rủi ro</div>
        </div>

        {/* Members */}
        <div className="bg-white rounded-xl border border-gray-100 p-3 text-center">
          <div className="text-[18px] font-bold font-mono text-[#1B4D3E]">{members.length}</div>
          <div className="text-[10px] text-gray-500 mt-0.5">Thành viên</div>
        </div>
      </div>

      {/* ================================================================
          SECTION 3: BUDGET COMPARISON
          ================================================================ */}
      {(project.budget_planned > 0 || project.budget_actual > 0) && (
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-gray-400" />
              <h3 className="text-[13px] font-semibold text-gray-700">Ngân sách</h3>
            </div>
            <span className={`text-[12px] font-bold font-mono ${budgetPct > 100 ? 'text-red-600' : budgetPct > 80 ? 'text-amber-600' : 'text-emerald-600'}`}>
              {budgetPct}% đã dùng
            </span>
          </div>

          {/* Visual bar */}
          <div className="relative h-8 bg-gray-100 rounded-lg overflow-hidden mb-3">
            <div
              className={`h-full rounded-lg transition-all ${budgetPct > 100 ? 'bg-red-500' : budgetPct > 80 ? 'bg-amber-500' : 'bg-emerald-500'}`}
              style={{ width: `${Math.min(budgetPct, 100)}%` }}
            />
            {/* Planned marker at 100% */}
            <div className="absolute top-0 bottom-0 right-0 w-px bg-gray-300" />
            {/* Label inside bar */}
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-[11px] font-bold text-white drop-shadow-sm">
                {fmtCurrency(project.budget_actual)}
              </span>
            </div>
          </div>

          {/* Details row */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <div className="text-[10px] text-gray-400 uppercase">Dự toán</div>
              <div className="text-[13px] font-bold font-mono text-gray-700">{fmtCurrency(project.budget_planned)}</div>
            </div>
            <div>
              <div className="text-[10px] text-gray-400 uppercase">Thực tế</div>
              <div className={`text-[13px] font-bold font-mono ${budgetPct > 100 ? 'text-red-600' : 'text-gray-700'}`}>
                {fmtCurrency(project.budget_actual)}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-gray-400 uppercase">Còn lại</div>
              <div className={`text-[13px] font-bold font-mono ${budgetRemaining < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                {budgetRemaining < 0 ? '-' : ''}{fmtCurrency(Math.abs(budgetRemaining))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================
          SECTION 4: TIMELINE — DAYS LEFT + KEY DATES
          ================================================================ */}
      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Calendar className="w-4 h-4 text-gray-400" />
          <h3 className="text-[13px] font-semibold text-gray-700">Thời gian dự án</h3>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <div className="text-[10px] text-gray-400 uppercase">Bắt đầu (KH)</div>
            <div className="text-[12px] font-semibold text-gray-700">{fmtDate(project.planned_start)}</div>
          </div>
          <div>
            <div className="text-[10px] text-gray-400 uppercase">Kết thúc (KH)</div>
            <div className="text-[12px] font-semibold text-gray-700">{fmtDate(project.planned_end)}</div>
          </div>
          <div>
            <div className="text-[10px] text-gray-400 uppercase">Bắt đầu (TT)</div>
            <div className="text-[12px] font-semibold text-gray-700">{fmtDate(project.actual_start)}</div>
          </div>
          <div>
            <div className="text-[10px] text-gray-400 uppercase">Còn lại</div>
            <div className={`text-[12px] font-bold ${
              daysLeft === null ? 'text-gray-400' :
              daysLeft < 0 ? 'text-red-600' :
              daysLeft <= 7 ? 'text-amber-600' :
              'text-emerald-600'
            }`}>
              {daysLeft === null ? '—' :
               daysLeft < 0 ? `Trễ ${Math.abs(daysLeft)} ngày` :
               daysLeft === 0 ? 'Hôm nay' :
               `${daysLeft} ngày`}
            </div>
          </div>
        </div>
      </div>

      {/* ================================================================
          SECTION 5: PHASES PROGRESS
          ================================================================ */}
      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 className="w-4 h-4 text-gray-400" />
          <h3 className="text-[13px] font-semibold text-gray-700">Tiến độ theo Phase</h3>
          <span className="text-[11px] text-gray-400 ml-auto">{phases.length} phases</span>
        </div>

        <div className="space-y-3">
          {phases.sort((a, b) => a.order_index - b.order_index).map((ph) => {
            const cfg = PHASE_STATUS_CONFIG[ph.status] || PHASE_STATUS_CONFIG.pending
            return (
              <div key={ph.id}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />
                    <span className="text-[12px] font-medium text-gray-700 truncate">{ph.name}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.text} font-medium`}>
                      {STATUS_VI[ph.status] || ph.status}
                    </span>
                    <span className="text-[12px] font-bold font-mono text-gray-600 w-10 text-right">{ph.progress_pct}%</span>
                  </div>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${ph.progress_pct}%`, backgroundColor: ph.color || '#6B7280' }}
                  />
                </div>
                {(ph.planned_start || ph.planned_end) && (
                  <div className="text-[10px] text-gray-400 mt-0.5">
                    {fmtDateShort(ph.planned_start)} → {fmtDateShort(ph.planned_end)}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ================================================================
          SECTION 6: MILESTONES TABLE
          ================================================================ */}
      {milestones.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Flag className="w-4 h-4 text-gray-400" />
              <h3 className="text-[13px] font-semibold text-gray-700">Milestones</h3>
              <span className="text-[11px] text-gray-400">
                {milestoneStats.completed}/{milestoneStats.total} hoàn thành
                {milestoneStats.overdue > 0 && (
                  <span className="text-red-500 ml-1">· {milestoneStats.overdue} quá hạn</span>
                )}
              </span>
            </div>
          </div>

          <div className="overflow-x-auto -mx-4 px-4">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 pr-3 text-[10px] font-semibold text-gray-400 uppercase">Milestone</th>
                  <th className="text-left py-2 pr-3 text-[10px] font-semibold text-gray-400 uppercase">Phase</th>
                  <th className="text-left py-2 pr-3 text-[10px] font-semibold text-gray-400 uppercase">Hạn</th>
                  <th className="text-left py-2 pr-3 text-[10px] font-semibold text-gray-400 uppercase">Trạng thái</th>
                  <th className="text-left py-2 text-[10px] font-semibold text-gray-400 uppercase">Phụ trách</th>
                </tr>
              </thead>
              <tbody>
                {(showAllMilestones ? milestones : milestones.slice(0, 5)).map((ms) => {
                  const isOverdue = ms.status !== 'completed' && ms.status !== 'cancelled' &&
                    ms.due_date && new Date(ms.due_date) < new Date()
                  const isCompleted = ms.status === 'completed'
                  const days = daysUntil(ms.due_date)

                  return (
                    <tr key={ms.id} className={`border-b border-gray-50 ${isOverdue ? 'bg-red-50/50' : ''}`}>
                      <td className="py-2 pr-3">
                        <div className="flex items-center gap-1.5">
                          {isCompleted ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                          ) : isOverdue ? (
                            <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                          ) : (
                            <CircleDot className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                          )}
                          <span className={`font-medium ${isCompleted ? 'text-gray-400 line-through' : isOverdue ? 'text-red-700' : 'text-gray-700'}`}>
                            {ms.name}
                          </span>
                        </div>
                      </td>
                      <td className="py-2 pr-3 text-gray-500">{ms.phase_name || '—'}</td>
                      <td className={`py-2 pr-3 font-mono ${isOverdue ? 'text-red-600 font-semibold' : 'text-gray-600'}`}>
                        {fmtDate(ms.due_date)}
                        {!isCompleted && days !== null && (
                          <span className={`block text-[10px] ${days < 0 ? 'text-red-500' : days <= 3 ? 'text-amber-500' : 'text-gray-400'}`}>
                            {days < 0 ? `Trễ ${Math.abs(days)}d` : days === 0 ? 'Hôm nay' : `Còn ${days}d`}
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        {isCompleted ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-emerald-50 text-emerald-700 text-[10px] font-medium rounded">
                            ✓ {fmtDate(ms.completed_date)}
                          </span>
                        ) : isOverdue ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-red-100 text-red-700 text-[10px] font-semibold rounded">
                            Quá hạn
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-gray-50 text-gray-600 text-[10px] font-medium rounded">
                            {STATUS_VI[ms.status] || ms.status}
                          </span>
                        )}
                      </td>
                      <td className="py-2 text-gray-500">{ms.assignee_name || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {milestones.length > 5 && (
            <button
              onClick={() => setShowAllMilestones(!showAllMilestones)}
              className="flex items-center gap-1 mt-2 text-[12px] text-[#1B4D3E] font-medium active:opacity-70"
            >
              {showAllMilestones ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              {showAllMilestones ? 'Thu gọn' : `Xem tất cả (${milestones.length})`}
            </button>
          )}
        </div>
      )}

      {/* ================================================================
          SECTION 7: TOP RISKS + ISSUES (2-column on desktop)
          ================================================================ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Risks */}
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="flex items-center gap-2 mb-3">
            <ShieldAlert className="w-4 h-4 text-gray-400" />
            <h3 className="text-[13px] font-semibold text-gray-700">Rủi ro đang mở</h3>
            <span className="text-[11px] text-gray-400">{risks.length}</span>
          </div>

          {risks.length === 0 ? (
            <div className="text-center py-6">
              <CheckCircle2 className="w-8 h-8 text-emerald-200 mx-auto mb-2" />
              <p className="text-[12px] text-gray-400">Không có rủi ro đang mở</p>
            </div>
          ) : (
            <div className="space-y-2">
              {(showAllRisks ? risks : risks.slice(0, 5)).map((r) => {
                const scoreColor = r.score >= 12 ? 'bg-red-500' : r.score >= 6 ? 'bg-orange-500' : 'bg-yellow-500'
                return (
                  <div key={r.id} className="flex items-center gap-2.5">
                    <div className={`w-8 h-8 ${scoreColor} rounded-lg flex items-center justify-center text-white text-[12px] font-bold shrink-0`}>
                      {r.score}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-medium text-gray-700 truncate">{r.title}</div>
                      <div className="text-[10px] text-gray-400">
                        {r.code} · P{r.probability}×I{r.impact} · {r.owner_name || 'Chưa gán'}
                      </div>
                    </div>
                  </div>
                )
              })}
              {risks.length > 5 && (
                <button
                  onClick={() => setShowAllRisks(!showAllRisks)}
                  className="flex items-center gap-1 text-[12px] text-[#1B4D3E] font-medium active:opacity-70"
                >
                  {showAllRisks ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  {showAllRisks ? 'Thu gọn' : `Xem tất cả (${risks.length})`}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Issues by severity */}
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-gray-400" />
            <h3 className="text-[13px] font-semibold text-gray-700">Vấn đề đang mở</h3>
            <span className="text-[11px] text-gray-400">{issuesBySeverity.total}</span>
          </div>

          {issuesBySeverity.total === 0 ? (
            <div className="text-center py-6">
              <CheckCircle2 className="w-8 h-8 text-emerald-200 mx-auto mb-2" />
              <p className="text-[12px] text-gray-400">Không có vấn đề đang mở</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <div className={`rounded-lg p-3 text-center ${issuesBySeverity.critical > 0 ? 'bg-red-50 border border-red-200' : 'bg-gray-50'}`}>
                <div className={`text-[20px] font-bold font-mono ${issuesBySeverity.critical > 0 ? 'text-red-600' : 'text-gray-300'}`}>
                  {issuesBySeverity.critical}
                </div>
                <div className="text-[10px] text-gray-500">Nghiêm trọng</div>
              </div>
              <div className={`rounded-lg p-3 text-center ${issuesBySeverity.high > 0 ? 'bg-orange-50 border border-orange-200' : 'bg-gray-50'}`}>
                <div className={`text-[20px] font-bold font-mono ${issuesBySeverity.high > 0 ? 'text-orange-600' : 'text-gray-300'}`}>
                  {issuesBySeverity.high}
                </div>
                <div className="text-[10px] text-gray-500">Cao</div>
              </div>
              <div className={`rounded-lg p-3 text-center ${issuesBySeverity.medium > 0 ? 'bg-amber-50 border border-amber-200' : 'bg-gray-50'}`}>
                <div className={`text-[20px] font-bold font-mono ${issuesBySeverity.medium > 0 ? 'text-amber-600' : 'text-gray-300'}`}>
                  {issuesBySeverity.medium}
                </div>
                <div className="text-[10px] text-gray-500">Trung bình</div>
              </div>
              <div className={`rounded-lg p-3 text-center ${issuesBySeverity.low > 0 ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50'}`}>
                <div className={`text-[20px] font-bold font-mono ${issuesBySeverity.low > 0 ? 'text-blue-600' : 'text-gray-300'}`}>
                  {issuesBySeverity.low}
                </div>
                <div className="text-[10px] text-gray-500">Thấp</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ================================================================
          SECTION 8: TEAM SUMMARY
          ================================================================ */}
      {members.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-4 h-4 text-gray-400" />
            <h3 className="text-[13px] font-semibold text-gray-700">Đội dự án</h3>
            <span className="text-[11px] text-gray-400">{members.length} thành viên</span>
          </div>

          <div className="space-y-2">
            {members.map((m) => {
              const initial = m.full_name.charAt(0).toUpperCase()
              const roleCfg: Record<string, string> = {
                pm: 'bg-[#1B4D3E] text-white',
                lead: 'bg-blue-100 text-blue-700',
                member: 'bg-gray-100 text-gray-600',
                reviewer: 'bg-purple-100 text-purple-700',
                observer: 'bg-gray-50 text-gray-400',
              }
              return (
                <div key={m.id} className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold shrink-0 ${roleCfg[m.role] || 'bg-gray-100 text-gray-600'}`}>
                    {initial}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-medium text-gray-700 truncate">{m.full_name}</div>
                    <div className="text-[10px] text-gray-400">{m.department_name || ''}</div>
                  </div>
                  <span className="text-[10px] font-medium text-gray-500 px-1.5 py-0.5 bg-gray-50 rounded shrink-0">
                    {ROLE_LABELS[m.role] || m.role}
                  </span>
                  <span className="text-[11px] font-mono text-gray-500 shrink-0 w-10 text-right">
                    {m.task_count} task{m.task_count !== 1 ? 's' : ''}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ================================================================
          SECTION 9: EXPORT ACTIONS
          ================================================================ */}
      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Download className="w-4 h-4 text-gray-400" />
          <h3 className="text-[13px] font-semibold text-gray-700">Xuất báo cáo</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {/* Status Report PDF */}
          <button
            onClick={handleExportPDF}
            disabled={exporting}
            className="flex items-center justify-center gap-2 py-3 rounded-xl bg-[#1B4D3E] text-white text-[13px] font-semibold active:scale-[0.98] disabled:opacity-50 transition-transform"
          >
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
            Status Report (PDF)
          </button>

          {/* Detailed Report */}
          <button
            onClick={handleExportDetailPDF}
            disabled={exportingDetail}
            className="flex items-center justify-center gap-2 py-3 rounded-xl border border-gray-200 text-gray-700 text-[13px] font-medium active:scale-[0.98] disabled:opacity-50 transition-transform"
          >
            {exportingDetail ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            Báo cáo chi tiết
          </button>

          {/* Portfolio Report */}
          <button
            onClick={handleExportPortfolio}
            disabled={exportingPortfolio}
            className="flex items-center justify-center gap-2 py-3 rounded-xl border border-gray-200 text-gray-700 text-[13px] font-medium active:scale-[0.98] disabled:opacity-50 transition-transform"
          >
            {exportingPortfolio ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderKanban className="w-4 h-4" />}
            Portfolio Report
          </button>
        </div>
      </div>

    </div>
  )
}

export default ProjectReportsTab