// ============================================================================
// FILE: src/pages/projects/ProjectReportPage.tsx
// MODULE: Quản lý Dự án — Huy Anh Rubber ERP
// PHASE: PM9 — Bước 9.5: Trang Báo cáo Dự án
// ============================================================================
// Chức năng:
//   - Select: DA cụ thể hoặc Portfolio (tất cả)
//   - Select: Loại báo cáo (Progress | Status | Portfolio)
//   - Select: Kỳ báo cáo (tuần/tháng/quý)
//   - Preview: Render báo cáo dạng HTML
//   - Export: PDF | Excel | In
//   - Portfolio report: Bảng tổng hợp DA + summary KPIs
// Design: Industrial Rubber Theme, mobile-first
// Depends: projectReportService.ts (9.2), projectDashboardService.ts (9.1)
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  BarChart3,
  FileText,
  Download,
  Printer,
  RefreshCw,
  Loader2,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Target,
  Users,
  Calendar,
  TrendingUp,
  TrendingDown,
  Minus,
  Filter,
  FileSpreadsheet,
  Eye,
  Building2,
  FolderKanban,
  ShieldAlert,
  CircleDot,
  ArrowRight,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'

// ============================================================================
// TYPES
// ============================================================================

type ReportType = 'progress' | 'status' | 'portfolio'
type ReportPeriod = 'week' | 'month' | 'quarter'

interface ProjectOption {
  id: string
  code: string
  name: string
  status: string
  progress_pct: number
  owner_name?: string
}

interface PhaseReport {
  name: string
  status: string
  progress_pct: number
  planned_start?: string
  planned_end?: string
  actual_start?: string
  actual_end?: string
  color?: string
}

interface MilestoneReport {
  name: string
  due_date?: string
  completed_date?: string
  status: string
  phase_name?: string
}

interface RiskReport {
  code: string
  title: string
  probability: number
  impact: number
  score: number
  owner_name?: string
  status: string
}

interface IssueReport {
  code: string
  title: string
  severity: string
  status: string
  assignee_name?: string
}

interface ProgressReportData {
  project: ProjectOption & {
    description?: string
    planned_start?: string
    planned_end?: string
    actual_start?: string
    budget_planned: number
    budget_actual: number
    department_name?: string
    category_name?: string
  }
  health: 'green' | 'amber' | 'red'
  health_label: string
  planned_progress: number
  phases: PhaseReport[]
  milestones: MilestoneReport[]
  risks: RiskReport[]
  issues: IssueReport[]
  task_stats: {
    total: number
    completed: number
    in_progress: number
    overdue: number
  }
  period: { start: string; end: string; label: string }
}

interface PortfolioItem {
  id: string
  code: string
  name: string
  pm_name?: string
  department_name?: string
  status: string
  progress_pct: number
  health: 'green' | 'amber' | 'red'
  budget_planned: number
  budget_actual: number
  budget_pct: number
  risk_count: number
  open_issues: number
  next_milestone?: string
  next_milestone_date?: string
}

interface PortfolioReportData {
  items: PortfolioItem[]
  summary: {
    total: number
    on_track: number
    at_risk: number
    behind: number
    total_budget_planned: number
    total_budget_actual: number
  }
  period: { start: string; end: string; label: string }
}

// ============================================================================
// CONSTANTS
// ============================================================================

const REPORT_TYPES: { key: ReportType; label: string; description: string; icon: React.ReactNode }[] = [
  { key: 'progress',  label: 'Báo cáo tiến độ',  description: 'Chi tiết phases, milestones, risks',  icon: <TrendingUp className="w-4 h-4" /> },
  { key: 'status',    label: 'Báo cáo trạng thái', description: 'Tóm tắt 1 trang cho BGĐ',           icon: <FileText className="w-4 h-4" /> },
  { key: 'portfolio', label: 'Báo cáo tổng hợp',  description: 'Tất cả DA — dạng bảng',              icon: <FolderKanban className="w-4 h-4" /> },
]

const REPORT_PERIODS: { key: ReportPeriod; label: string }[] = [
  { key: 'week',    label: 'Tuần này' },
  { key: 'month',   label: 'Tháng này' },
  { key: 'quarter', label: 'Quý này' },
]

const STATUS_LABELS: Record<string, string> = {
  draft: 'Nháp', planning: 'Lên kế hoạch', approved: 'Đã duyệt',
  in_progress: 'Đang chạy', on_hold: 'Tạm dừng', completed: 'Hoàn thành', cancelled: 'Đã hủy',
}

const HEALTH_CONFIG = {
  green: { label: 'Đúng tiến độ', color: '#16A34A', bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  amber: { label: 'Có rủi ro',    color: '#EA580C', bg: 'bg-orange-50',  border: 'border-orange-200',  text: 'text-orange-700',  dot: 'bg-orange-500' },
  red:   { label: 'Trễ tiến độ',  color: '#DC2626', bg: 'bg-red-50',     border: 'border-red-200',     text: 'text-red-700',     dot: 'bg-red-500' },
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-red-100 text-red-700',
  high: 'bg-orange-100 text-orange-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low: 'bg-blue-100 text-blue-700',
}

const PHASE_STATUS_LABELS: Record<string, string> = {
  pending: 'Chờ', in_progress: 'Đang chạy', completed: 'Xong', skipped: 'Bỏ qua',
}

const MS_STATUS_LABELS: Record<string, string> = {
  pending: 'Chờ', approaching: 'Sắp tới', completed: 'Xong', overdue: 'Trễ', cancelled: 'Hủy',
}

// ============================================================================
// HELPERS
// ============================================================================

function formatDate(d?: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatCurrency(amount: number): string {
  if (!amount) return '0'
  if (amount >= 1_000_000_000) return `${(amount / 1_000_000_000).toFixed(1)} tỷ`
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(0)} tr`
  return amount.toLocaleString('vi-VN')
}

function getPeriodDates(period: ReportPeriod): { start: string; end: string; label: string } {
  const now = new Date()
  let start: Date, end: Date, label: string

  switch (period) {
    case 'week': {
      const dayOfWeek = now.getDay() || 7
      start = new Date(now)
      start.setDate(now.getDate() - dayOfWeek + 1)
      end = new Date(start)
      end.setDate(start.getDate() + 6)
      label = `Tuần ${Math.ceil(now.getDate() / 7)} — Tháng ${now.getMonth() + 1}/${now.getFullYear()}`
      break
    }
    case 'month': {
      start = new Date(now.getFullYear(), now.getMonth(), 1)
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      label = `Tháng ${now.getMonth() + 1}/${now.getFullYear()}`
      break
    }
    case 'quarter': {
      const q = Math.floor(now.getMonth() / 3)
      start = new Date(now.getFullYear(), q * 3, 1)
      end = new Date(now.getFullYear(), q * 3 + 3, 0)
      label = `Quý ${q + 1}/${now.getFullYear()}`
      break
    }
  }

  start.setHours(0, 0, 0, 0)
  end.setHours(23, 59, 59, 999)
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
    label,
  }
}

function calculateHealth(progressPct: number, plannedStart?: string, plannedEnd?: string): 'green' | 'amber' | 'red' {
  if (!plannedStart || !plannedEnd) return 'green'
  const now = new Date()
  const start = new Date(plannedStart)
  const end = new Date(plannedEnd)
  const totalDays = Math.max(1, (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
  const elapsedDays = Math.max(0, (now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
  const plannedProgress = Math.min(100, (elapsedDays / totalDays) * 100)
  const gap = progressPct - plannedProgress

  if (gap >= -5) return 'green'
  if (gap >= -15) return 'amber'
  return 'red'
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const ProjectReportPage: React.FC = () => {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const reportRef = useRef<HTMLDivElement>(null)

  // === Filters ===
  const [reportType, setReportType] = useState<ReportType>('progress')
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all')
  const [period, setPeriod] = useState<ReportPeriod>('month')

  // === Data ===
  const [projects, setProjects] = useState<ProjectOption[]>([])
  const [progressData, setProgressData] = useState<ProgressReportData | null>(null)
  const [portfolioData, setPortfolioData] = useState<PortfolioReportData | null>(null)

  // === UI ===
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [showFilters, setShowFilters] = useState(true)
  const [generated, setGenerated] = useState(false)

  // --------------------------------------------------------------------------
  // LOAD PROJECT OPTIONS
  // --------------------------------------------------------------------------

  useEffect(() => {
    const loadProjects = async () => {
      const { data } = await supabase
        .from('projects')
        .select(`
          id, code, name, status, progress_pct,
          owner:employees!projects_owner_id_fkey(full_name)
        `)
        .in('status', ['in_progress', 'planning', 'approved', 'on_hold'])
        .order('code', { ascending: true })

      const list = (data || []).map((p: any) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        status: p.status,
        progress_pct: p.progress_pct || 0,
        owner_name: Array.isArray(p.owner) ? p.owner[0]?.full_name : p.owner?.full_name,
      }))
      setProjects(list)
      setLoading(false)
    }
    loadProjects()
  }, [])

  // Auto-select project for progress/status reports
  useEffect(() => {
    if (reportType === 'portfolio') {
      setSelectedProjectId('all')
    } else if (selectedProjectId === 'all' && projects.length > 0) {
      setSelectedProjectId(projects[0].id)
    }
  }, [reportType, projects])

  // --------------------------------------------------------------------------
  // GENERATE REPORT
  // --------------------------------------------------------------------------

  const generateReport = useCallback(async () => {
    setGenerating(true)
    setGenerated(false)
    const periodDates = getPeriodDates(period)

    try {
      if (reportType === 'portfolio') {
        await generatePortfolioReport(periodDates)
      } else {
        if (!selectedProjectId || selectedProjectId === 'all') return
        await generateProjectReport(selectedProjectId, periodDates)
      }
      setGenerated(true)
      setShowFilters(false)
    } catch (err) {
      console.error('[Report] Generate failed:', err)
    } finally {
      setGenerating(false)
    }
  }, [reportType, selectedProjectId, period])

  // --- Progress / Status Report ---
  const generateProjectReport = async (projectId: string, periodDates: { start: string; end: string; label: string }) => {
    // Project
    const { data: proj } = await supabase
      .from('projects')
      .select(`
        id, code, name, description, status, progress_pct,
        planned_start, planned_end, actual_start,
        budget_planned, budget_actual,
        owner:employees!projects_owner_id_fkey(full_name),
        department:departments(name),
        category:project_categories(name)
      `)
      .eq('id', projectId)
      .single()

    if (!proj) return

    // Phases
    const { data: phasesRaw } = await supabase
      .from('project_phases')
      .select('name, status, progress_pct, planned_start, planned_end, actual_start, actual_end, color')
      .eq('project_id', projectId)
      .order('order_index')

    // Milestones
    const { data: msRaw } = await supabase
      .from('project_milestones')
      .select('name, due_date, completed_date, status, phase:project_phases(name)')
      .eq('project_id', projectId)
      .order('due_date')

    // Risks
    const { data: risksRaw } = await supabase
      .from('project_risks')
      .select('code, title, probability, impact, status, owner:employees!project_risks_owner_id_fkey(full_name)')
      .eq('project_id', projectId)
      .neq('status', 'closed')
      .order('probability', { ascending: false })
      .limit(5)

    // Issues
    const { data: issuesRaw } = await supabase
      .from('project_issues')
      .select('code, title, severity, status, assignee:employees!project_issues_assignee_id_fkey(full_name)')
      .eq('project_id', projectId)
      .in('status', ['open', 'in_progress'])
      .order('created_at', { ascending: false })
      .limit(10)

    // Tasks stats
    const { data: tasks } = await supabase
      .from('tasks')
      .select('id, status, due_date')
      .eq('project_id', projectId)

    const tasksList = tasks || []
    const now = new Date()
    const taskStats = {
      total: tasksList.length,
      completed: tasksList.filter(t => t.status === 'completed').length,
      in_progress: tasksList.filter(t => t.status === 'in_progress').length,
      overdue: tasksList.filter(t =>
        t.due_date && new Date(t.due_date) < now && t.status !== 'completed' && t.status !== 'cancelled'
      ).length,
    }

    // Health
    const health = calculateHealth(proj.progress_pct || 0, proj.planned_start, proj.planned_end)

    // Normalize Supabase FK joins
    const normalize = (val: any) => Array.isArray(val) ? val[0] : val

    setProgressData({
      project: {
        id: proj.id,
        code: proj.code,
        name: proj.name,
        description: proj.description,
        status: proj.status,
        progress_pct: proj.progress_pct || 0,
        planned_start: proj.planned_start,
        planned_end: proj.planned_end,
        actual_start: proj.actual_start,
        budget_planned: proj.budget_planned || 0,
        budget_actual: proj.budget_actual || 0,
        owner_name: normalize(proj.owner)?.full_name,
        department_name: normalize(proj.department)?.name,
        category_name: normalize(proj.category)?.name,
      },
      health,
      health_label: HEALTH_CONFIG[health].label,
      planned_progress: (() => {
        if (!proj.planned_start || !proj.planned_end) return 0
        const s = new Date(proj.planned_start), e = new Date(proj.planned_end)
        const total = Math.max(1, (e.getTime() - s.getTime()) / 86400000)
        const elapsed = Math.max(0, (now.getTime() - s.getTime()) / 86400000)
        return Math.min(100, Math.round((elapsed / total) * 100))
      })(),
      phases: (phasesRaw || []).map(p => ({ ...p, status: p.status || 'pending', progress_pct: p.progress_pct || 0 })),
      milestones: (msRaw || []).map((m: any) => ({
        name: m.name,
        due_date: m.due_date,
        completed_date: m.completed_date,
        status: m.status || 'pending',
        phase_name: normalize(m.phase)?.name,
      })),
      risks: (risksRaw || []).map((r: any) => ({
        code: r.code,
        title: r.title,
        probability: r.probability || 0,
        impact: r.impact || 0,
        score: (r.probability || 0) * (r.impact || 0),
        owner_name: normalize(r.owner)?.full_name,
        status: r.status,
      })).sort((a, b) => b.score - a.score),
      issues: (issuesRaw || []).map((i: any) => ({
        code: i.code,
        title: i.title,
        severity: i.severity || 'medium',
        status: i.status,
        assignee_name: normalize(i.assignee)?.full_name,
      })),
      task_stats: taskStats,
      period: periodDates,
    })
  }

  // --- Portfolio Report ---
  const generatePortfolioReport = async (periodDates: { start: string; end: string; label: string }) => {
    const { data: allProjects } = await supabase
      .from('projects')
      .select(`
        id, code, name, status, progress_pct,
        planned_start, planned_end,
        budget_planned, budget_actual,
        owner:employees!projects_owner_id_fkey(full_name),
        department:departments(name)
      `)
      .in('status', ['in_progress', 'planning', 'approved', 'on_hold'])
      .order('code')

    const normalize = (val: any) => Array.isArray(val) ? val[0] : val
    const items: PortfolioItem[] = []

    for (const p of (allProjects || [])) {
      // Count risks & issues
      const { count: riskCount } = await supabase
        .from('project_risks')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', p.id)
        .neq('status', 'closed')

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

      const health = calculateHealth(p.progress_pct || 0, p.planned_start, p.planned_end)
      const budgetPlanned = p.budget_planned || 0
      const budgetActual = p.budget_actual || 0

      items.push({
        id: p.id,
        code: p.code,
        name: p.name,
        pm_name: normalize(p.owner)?.full_name,
        department_name: normalize(p.department)?.name,
        status: p.status,
        progress_pct: p.progress_pct || 0,
        health,
        budget_planned: budgetPlanned,
        budget_actual: budgetActual,
        budget_pct: budgetPlanned > 0 ? Math.round((budgetActual / budgetPlanned) * 100) : 0,
        risk_count: riskCount || 0,
        open_issues: issueCount || 0,
        next_milestone: nextMs?.[0]?.name,
        next_milestone_date: nextMs?.[0]?.due_date,
      })
    }

    setPortfolioData({
      items,
      summary: {
        total: items.length,
        on_track: items.filter(i => i.health === 'green').length,
        at_risk: items.filter(i => i.health === 'amber').length,
        behind: items.filter(i => i.health === 'red').length,
        total_budget_planned: items.reduce((s, i) => s + i.budget_planned, 0),
        total_budget_actual: items.reduce((s, i) => s + i.budget_actual, 0),
      },
      period: periodDates,
    })
  }

  // --------------------------------------------------------------------------
  // EXPORT
  // --------------------------------------------------------------------------

  const handlePrint = () => {
    if (!reportRef.current) return
    const printContent = reportRef.current.innerHTML
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`
      <html>
      <head>
        <title>Báo cáo Dự án — ${reportType === 'portfolio' ? 'Tổng hợp' : progressData?.project.name}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; font-size: 11px; color: #1a1a1a; padding: 20px; }
          table { width: 100%; border-collapse: collapse; margin: 8px 0; }
          th, td { padding: 6px 8px; border: 1px solid #e5e7eb; text-align: left; font-size: 11px; }
          th { background: #f3f4f6; font-weight: 600; }
          .progress-bar { height: 8px; background: #e5e7eb; border-radius: 4px; overflow: hidden; }
          .progress-fill { height: 100%; border-radius: 4px; }
          h1 { font-size: 18px; margin-bottom: 4px; }
          h2 { font-size: 14px; margin: 12px 0 6px; padding-bottom: 4px; border-bottom: 2px solid #1B4D3E; color: #1B4D3E; }
          h3 { font-size: 12px; margin: 8px 0 4px; }
          .badge { display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 10px; font-weight: 600; }
          .section { margin-bottom: 16px; }
          .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
          .card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; }
          @media print { body { padding: 10px; } }
        </style>
      </head>
      <body>${printContent}</body>
      </html>
    `)
    win.document.close()
    setTimeout(() => { win.print(); win.close() }, 300)
  }

  const handleExportExcel = async () => {
    // Build CSV content for simple export
    let csv = ''
    if (reportType === 'portfolio' && portfolioData) {
      csv = 'Mã DA,Tên DA,PM,Phòng ban,Trạng thái,Tiến độ %,Sức khỏe,NS Dự toán,NS Thực tế,NS %,Rủi ro,Vấn đề,Milestone tới\n'
      portfolioData.items.forEach(item => {
        csv += `${item.code},"${item.name}","${item.pm_name || ''}","${item.department_name || ''}",${STATUS_LABELS[item.status] || item.status},${item.progress_pct},${HEALTH_CONFIG[item.health].label},${item.budget_planned},${item.budget_actual},${item.budget_pct},${item.risk_count},${item.open_issues},"${item.next_milestone || ''}"\n`
      })
    } else if (progressData) {
      csv = 'Mục,Nội dung\n'
      csv += `Dự án,"${progressData.project.name}"\n`
      csv += `Mã,"${progressData.project.code}"\n`
      csv += `Trạng thái,"${STATUS_LABELS[progressData.project.status]}"\n`
      csv += `Tiến độ,${progressData.project.progress_pct}%\n`
      csv += `Sức khỏe,"${progressData.health_label}"\n`
      csv += `\nPhase,Trạng thái,Tiến độ %\n`
      progressData.phases.forEach(ph => {
        csv += `"${ph.name}",${PHASE_STATUS_LABELS[ph.status] || ph.status},${ph.progress_pct}\n`
      })
      csv += `\nMilestone,Hạn,Trạng thái\n`
      progressData.milestones.forEach(ms => {
        csv += `"${ms.name}",${ms.due_date || ''},${MS_STATUS_LABELS[ms.status] || ms.status}\n`
      })
    }

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `bao-cao-${reportType}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // --------------------------------------------------------------------------
  // RENDER — FILTER PANEL
  // --------------------------------------------------------------------------

  const renderFilters = () => (
    <div className={`bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden transition-all ${showFilters ? 'mb-4' : 'mb-2'}`}>
      {/* Toggle header */}
      <button
        onClick={() => setShowFilters(!showFilters)}
        className="w-full flex items-center justify-between px-4 py-3 text-left active:bg-gray-50"
      >
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-[#1B4D3E]" />
          <span className="text-[14px] font-semibold text-gray-800">Thiết lập báo cáo</span>
        </div>
        {showFilters ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
      </button>

      {showFilters && (
        <div className="px-4 pb-4 space-y-3 border-t border-gray-50">
          {/* Report Type */}
          <div>
            <label className="block text-[12px] font-medium text-gray-500 mb-1.5 uppercase tracking-wide">Loại báo cáo</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {REPORT_TYPES.map(rt => (
                <button
                  key={rt.key}
                  onClick={() => { setReportType(rt.key); setGenerated(false) }}
                  className={`flex items-start gap-2.5 p-3 rounded-lg border text-left transition-all active:scale-[0.98] ${
                    reportType === rt.key
                      ? 'border-[#1B4D3E] bg-[#1B4D3E]/5 ring-1 ring-[#1B4D3E]/20'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className={`mt-0.5 ${reportType === rt.key ? 'text-[#1B4D3E]' : 'text-gray-400'}`}>{rt.icon}</div>
                  <div>
                    <div className={`text-[13px] font-semibold ${reportType === rt.key ? 'text-[#1B4D3E]' : 'text-gray-700'}`}>{rt.label}</div>
                    <div className="text-[11px] text-gray-400 mt-0.5">{rt.description}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Project Select (hidden for portfolio) */}
          {reportType !== 'portfolio' && (
            <div>
              <label className="block text-[12px] font-medium text-gray-500 mb-1.5 uppercase tracking-wide">Dự án</label>
              <select
                value={selectedProjectId}
                onChange={e => { setSelectedProjectId(e.target.value); setGenerated(false) }}
                className="w-full px-3 py-2.5 text-[15px] border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-[#1B4D3E]/20 focus:border-[#1B4D3E]"
              >
                <option value="" disabled>Chọn dự án...</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Period */}
          <div>
            <label className="block text-[12px] font-medium text-gray-500 mb-1.5 uppercase tracking-wide">Kỳ báo cáo</label>
            <div className="flex gap-2">
              {REPORT_PERIODS.map(rp => (
                <button
                  key={rp.key}
                  onClick={() => { setPeriod(rp.key); setGenerated(false) }}
                  className={`flex-1 py-2 rounded-lg text-[13px] font-medium border transition-all active:scale-[0.97] ${
                    period === rp.key
                      ? 'border-[#1B4D3E] bg-[#1B4D3E] text-white'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {rp.label}
                </button>
              ))}
            </div>
          </div>

          {/* Generate Button */}
          <button
            onClick={generateReport}
            disabled={generating || (reportType !== 'portfolio' && (!selectedProjectId || selectedProjectId === 'all'))}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[#1B4D3E] text-white text-[14px] font-semibold shadow-sm disabled:opacity-50 active:scale-[0.98] transition-all"
          >
            {generating ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Đang tạo...</>
            ) : (
              <><Eye className="w-4 h-4" /> Xem báo cáo</>
            )}
          </button>
        </div>
      )}
    </div>
  )

  // --------------------------------------------------------------------------
  // RENDER — PROGRESS / STATUS REPORT
  // --------------------------------------------------------------------------

  const renderProgressReport = () => {
    if (!progressData) return null
    const d = progressData
    const hc = HEALTH_CONFIG[d.health]
    const isStatus = reportType === 'status'

    return (
      <div ref={reportRef} className="space-y-4">
        {/* === HEADER === */}
        <div className={`rounded-xl border ${hc.border} ${hc.bg} p-4`}>
          <div className="flex items-start justify-between mb-2">
            <div>
              <div className="text-[11px] text-gray-500 font-mono">{d.project.code}</div>
              <h2 className="text-[16px] font-bold text-gray-900 mt-0.5">{d.project.name}</h2>
              <div className="text-[12px] text-gray-500 mt-1">
                {d.project.department_name && <span>{d.project.department_name} · </span>}
                PM: {d.project.owner_name || '—'} · {d.period.label}
              </div>
            </div>
            {/* RAG Badge */}
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full ${hc.bg} border ${hc.border}`}>
              <div className={`w-3 h-3 rounded-full ${hc.dot}`} />
              <span className={`text-[12px] font-bold ${hc.text}`}>{hc.label}</span>
            </div>
          </div>

          {/* Progress bars */}
          <div className="grid grid-cols-2 gap-3 mt-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] text-gray-500">Thực tế</span>
                <span className="text-[12px] font-bold font-mono" style={{ color: hc.color }}>{d.project.progress_pct}%</span>
              </div>
              <div className="h-2 bg-white/60 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${d.project.progress_pct}%`, backgroundColor: hc.color }} />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] text-gray-500">Kế hoạch</span>
                <span className="text-[12px] font-bold font-mono text-gray-600">{d.planned_progress}%</span>
              </div>
              <div className="h-2 bg-white/60 rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-gray-400 transition-all" style={{ width: `${d.planned_progress}%` }} />
              </div>
            </div>
          </div>
        </div>

        {/* === QUICK STATS === */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: 'Tasks', value: `${d.task_stats.completed}/${d.task_stats.total}`, icon: <CheckCircle2 className="w-3.5 h-3.5" />, color: '#16A34A' },
            { label: 'Đang làm', value: d.task_stats.in_progress, icon: <Clock className="w-3.5 h-3.5" />, color: '#2563EB' },
            { label: 'Quá hạn', value: d.task_stats.overdue, icon: <AlertTriangle className="w-3.5 h-3.5" />, color: d.task_stats.overdue > 0 ? '#DC2626' : '#6B7280' },
            { label: 'Rủi ro', value: d.risks.length, icon: <ShieldAlert className="w-3.5 h-3.5" />, color: d.risks.length > 0 ? '#EA580C' : '#6B7280' },
          ].map((stat, i) => (
            <div key={i} className="bg-white rounded-lg border border-gray-100 p-2.5 text-center">
              <div className="flex justify-center mb-1" style={{ color: stat.color }}>{stat.icon}</div>
              <div className="text-[15px] font-bold font-mono text-gray-900">{stat.value}</div>
              <div className="text-[10px] text-gray-400 mt-0.5">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* === BUDGET === */}
        {(d.project.budget_planned > 0) && (
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <h3 className="text-[13px] font-semibold text-gray-700 mb-2">Ngân sách</h3>
            <div className="flex items-center justify-between text-[12px] mb-1.5">
              <span className="text-gray-500">Dự toán: <strong className="text-gray-700">{formatCurrency(d.project.budget_planned)}</strong></span>
              <span className="text-gray-500">Thực tế: <strong className="text-gray-700">{formatCurrency(d.project.budget_actual)}</strong></span>
            </div>
            <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.min(100, d.project.budget_planned > 0 ? (d.project.budget_actual / d.project.budget_planned) * 100 : 0)}%`,
                  backgroundColor: d.project.budget_actual > d.project.budget_planned ? '#DC2626' : '#1B4D3E',
                }}
              />
            </div>
            <div className="text-right text-[11px] text-gray-400 mt-1">
              {d.project.budget_planned > 0 ? Math.round((d.project.budget_actual / d.project.budget_planned) * 100) : 0}% đã sử dụng
            </div>
          </div>
        )}

        {/* === PHASES (full for progress, mini for status) === */}
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <h3 className="text-[13px] font-semibold text-gray-700 mb-3">Tiến độ theo Phase</h3>
          <div className="space-y-2.5">
            {d.phases.map((ph, i) => (
              <div key={i}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: ph.color || '#6B7280' }} />
                    <span className="text-[12px] font-medium text-gray-700">{ph.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-gray-400">{PHASE_STATUS_LABELS[ph.status] || ph.status}</span>
                    <span className="text-[12px] font-bold font-mono text-gray-600">{ph.progress_pct}%</span>
                  </div>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${ph.progress_pct}%`, backgroundColor: ph.color || '#6B7280' }} />
                </div>
                {!isStatus && ph.planned_start && (
                  <div className="text-[10px] text-gray-400 mt-0.5 ml-4">
                    {formatDate(ph.planned_start)} → {formatDate(ph.planned_end)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* === MILESTONES (full for progress) === */}
        {!isStatus && d.milestones.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <h3 className="text-[13px] font-semibold text-gray-700 mb-3">Milestones</h3>
            <div className="space-y-2">
              {d.milestones.map((ms, i) => {
                const isOverdue = ms.status === 'overdue' || (ms.due_date && new Date(ms.due_date) < new Date() && ms.status !== 'completed')
                const isCompleted = ms.status === 'completed'
                return (
                  <div key={i} className={`flex items-center gap-3 p-2 rounded-lg ${isOverdue ? 'bg-red-50' : isCompleted ? 'bg-emerald-50' : 'bg-gray-50'}`}>
                    {isCompleted ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    ) : isOverdue ? (
                      <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                    ) : (
                      <CircleDot className="w-4 h-4 text-gray-400 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className={`text-[12px] font-medium truncate ${isOverdue ? 'text-red-700' : isCompleted ? 'text-emerald-700' : 'text-gray-700'}`}>
                        {ms.name}
                      </div>
                      {ms.phase_name && <div className="text-[10px] text-gray-400">{ms.phase_name}</div>}
                    </div>
                    <div className="text-right shrink-0">
                      <div className={`text-[11px] font-mono ${isOverdue ? 'text-red-600' : 'text-gray-500'}`}>
                        {formatDate(ms.due_date)}
                      </div>
                      {ms.completed_date && (
                        <div className="text-[10px] text-emerald-500">✓ {formatDate(ms.completed_date)}</div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* === RISKS (top 5) === */}
        {d.risks.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <h3 className="text-[13px] font-semibold text-gray-700 mb-3">Top rủi ro ({d.risks.length})</h3>
            <div className="space-y-1.5">
              {d.risks.slice(0, isStatus ? 3 : 5).map((r, i) => (
                <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-gray-50">
                  <div className={`w-7 h-7 rounded-md flex items-center justify-center text-[11px] font-bold text-white ${
                    r.score >= 12 ? 'bg-red-500' : r.score >= 6 ? 'bg-orange-500' : 'bg-yellow-500'
                  }`}>
                    {r.score}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-medium text-gray-700 truncate">{r.title}</div>
                    <div className="text-[10px] text-gray-400">{r.code} · {r.owner_name || 'Chưa gán'}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* === OPEN ISSUES === */}
        {!isStatus && d.issues.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <h3 className="text-[13px] font-semibold text-gray-700 mb-3">Vấn đề đang mở ({d.issues.length})</h3>
            <div className="space-y-1.5">
              {d.issues.map((iss, i) => (
                <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-gray-50">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${SEVERITY_COLORS[iss.severity] || 'bg-gray-100 text-gray-600'}`}>
                    {iss.severity?.toUpperCase()}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] text-gray-700 truncate">{iss.title}</div>
                    <div className="text-[10px] text-gray-400">{iss.code} · {iss.assignee_name || '—'}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* === REPORT INFO === */}
        <div className="text-center text-[10px] text-gray-400 py-2">
          Báo cáo tạo bởi {user?.full_name || 'System'} · {new Date().toLocaleString('vi-VN')} · Huy Anh Rubber ERP
        </div>
      </div>
    )
  }

  // --------------------------------------------------------------------------
  // RENDER — PORTFOLIO REPORT
  // --------------------------------------------------------------------------

  const renderPortfolioReport = () => {
    if (!portfolioData) return null
    const d = portfolioData

    return (
      <div ref={reportRef} className="space-y-4">
        {/* Header */}
        <div className="bg-[#1B4D3E] rounded-xl p-4 text-white">
          <div className="text-[11px] text-white/60 uppercase tracking-wide">Portfolio Report</div>
          <h2 className="text-[16px] font-bold mt-0.5">Báo cáo tổng hợp dự án</h2>
          <div className="text-[12px] text-white/70 mt-1">{d.period.label} · Công ty TNHH Cao su Huy Anh</div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: 'Tổng DA', value: d.summary.total, color: '#1B4D3E', bg: 'bg-emerald-50' },
            { label: 'Đúng tiến độ', value: d.summary.on_track, color: '#16A34A', bg: 'bg-green-50' },
            { label: 'Có rủi ro', value: d.summary.at_risk, color: '#EA580C', bg: 'bg-orange-50' },
            { label: 'Trễ', value: d.summary.behind, color: '#DC2626', bg: 'bg-red-50' },
          ].map((c, i) => (
            <div key={i} className={`${c.bg} rounded-lg p-2.5 text-center border border-gray-100`}>
              <div className="text-[18px] font-bold font-mono" style={{ color: c.color }}>{c.value}</div>
              <div className="text-[10px] text-gray-500 mt-0.5">{c.label}</div>
            </div>
          ))}
        </div>

        {/* Budget Summary */}
        {d.summary.total_budget_planned > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <h3 className="text-[13px] font-semibold text-gray-700 mb-2">Tổng ngân sách</h3>
            <div className="flex items-center justify-between text-[12px] mb-1.5">
              <span>Dự toán: <strong>{formatCurrency(d.summary.total_budget_planned)}</strong></span>
              <span>Thực tế: <strong>{formatCurrency(d.summary.total_budget_actual)}</strong></span>
            </div>
            <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(100, (d.summary.total_budget_actual / d.summary.total_budget_planned) * 100)}%`,
                  backgroundColor: d.summary.total_budget_actual > d.summary.total_budget_planned ? '#DC2626' : '#1B4D3E',
                }}
              />
            </div>
          </div>
        )}

        {/* Portfolio Table */}
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h3 className="text-[13px] font-semibold text-gray-700">Chi tiết dự án</h3>
          </div>

          {/* Mobile: Card view */}
          <div className="sm:hidden divide-y divide-gray-50">
            {d.items.map(item => {
              const hc = HEALTH_CONFIG[item.health]
              return (
                <div key={item.id} className="p-3">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="text-[11px] font-mono text-gray-400">{item.code}</div>
                      <div className="text-[13px] font-semibold text-gray-800 mt-0.5">{item.name}</div>
                      <div className="text-[11px] text-gray-400 mt-0.5">{item.pm_name || '—'} · {item.department_name || '—'}</div>
                    </div>
                    <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full ${hc.bg} border ${hc.border}`}>
                      <div className={`w-2 h-2 rounded-full ${hc.dot}`} />
                      <span className={`text-[10px] font-bold ${hc.text}`}>{hc.label}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${item.progress_pct}%`, backgroundColor: hc.color }} />
                    </div>
                    <span className="text-[11px] font-mono font-bold text-gray-600">{item.progress_pct}%</span>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-gray-400">
                    <span>NS: {formatCurrency(item.budget_actual)}/{formatCurrency(item.budget_planned)}</span>
                    <span>Rủi ro: {item.risk_count}</span>
                    <span>Vấn đề: {item.open_issues}</span>
                  </div>
                  {item.next_milestone && (
                    <div className="flex items-center gap-1 mt-1.5 text-[10px] text-[#1B4D3E]">
                      <Target className="w-3 h-3" />
                      <span className="truncate">{item.next_milestone}</span>
                      {item.next_milestone_date && <span className="text-gray-400 ml-1">{formatDate(item.next_milestone_date)}</span>}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Desktop: Table view */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="bg-gray-50 text-gray-500">
                  <th className="px-4 py-3 text-left font-medium">Mã</th>
                  <th className="px-4 py-3 text-left font-medium">Tên dự án</th>
                  <th className="px-4 py-3 text-left font-medium">PM</th>
                  <th className="px-4 py-3 text-center font-medium">Trạng thái</th>
                  <th className="px-4 py-3 text-center font-medium">Tiến độ</th>
                  <th className="px-4 py-3 text-center font-medium">Sức khỏe</th>
                  <th className="px-4 py-3 text-right font-medium">NS Dự toán</th>
                  <th className="px-4 py-3 text-right font-medium">NS Thực tế</th>
                  <th className="px-4 py-3 text-center font-medium">Rủi ro</th>
                  <th className="px-4 py-3 text-center font-medium">Vấn đề</th>
                  <th className="px-4 py-3 text-left font-medium">Milestone tới</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {d.items.map(item => {
                  const hc = HEALTH_CONFIG[item.health]
                  return (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-[11px] text-gray-500">{item.code}</td>
                      <td className="px-4 py-3 font-medium text-gray-900 max-w-[200px] truncate">{item.name}</td>
                      <td className="px-4 py-3 text-gray-600 text-[11px]">{item.pm_name || '—'}</td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-[11px]">{STATUS_LABELS[item.status] || item.status}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 justify-center">
                          <div className="w-14 bg-gray-100 rounded-full h-1.5">
                            <div className="h-full rounded-full" style={{ width: `${item.progress_pct}%`, backgroundColor: hc.color }} />
                          </div>
                          <span className="text-[11px] font-mono">{item.progress_pct}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-block w-3 h-3 rounded-full`} style={{ backgroundColor: hc.color }} title={hc.label} />
                      </td>
                      <td className="px-4 py-3 text-right text-[11px] font-mono text-gray-600">{formatCurrency(item.budget_planned)}</td>
                      <td className="px-4 py-3 text-right text-[11px] font-mono text-gray-600">{formatCurrency(item.budget_actual)}</td>
                      <td className="px-4 py-3 text-center text-[11px] font-mono">{item.risk_count || '—'}</td>
                      <td className="px-4 py-3 text-center text-[11px] font-mono">{item.open_issues || '—'}</td>
                      <td className="px-4 py-3 text-[11px] text-gray-500 max-w-[150px] truncate">
                        {item.next_milestone ? (
                          <span>{item.next_milestone} <span className="text-gray-400">({formatDate(item.next_milestone_date)})</span></span>
                        ) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Report Info */}
        <div className="text-center text-[10px] text-gray-400 py-2">
          Báo cáo tạo bởi {user?.full_name || 'System'} · {new Date().toLocaleString('vi-VN')} · Huy Anh Rubber ERP
        </div>
      </div>
    )
  }

  // --------------------------------------------------------------------------
  // MAIN RENDER
  // --------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-[#1B4D3E] animate-spin mb-3" />
        <p className="text-[13px] text-gray-400">Đang tải dữ liệu...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F7F5F2]">
      {/* ===== HEADER ===== */}
      <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-gray-100 safe-area-top">
        <div className="max-w-5xl mx-auto flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-lg active:bg-gray-100">
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <div>
              <h1 className="text-[16px] font-bold text-gray-900">Báo cáo Dự án</h1>
              <p className="text-[11px] text-gray-400">Tạo & xem báo cáo tiến độ, trạng thái, tổng hợp</p>
            </div>
          </div>

          {/* Action buttons (when report generated) */}
          {generated && (
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleExportExcel}
                className="p-2 rounded-lg border border-gray-200 active:bg-gray-100"
                title="Export CSV/Excel"
              >
                <FileSpreadsheet className="w-4 h-4 text-gray-600" />
              </button>
              <button
                onClick={handlePrint}
                className="p-2 rounded-lg border border-gray-200 active:bg-gray-100"
                title="In báo cáo"
              >
                <Printer className="w-4 h-4 text-gray-600" />
              </button>
              <button
                onClick={() => { setGenerated(false); setShowFilters(true) }}
                className="p-2 rounded-lg border border-gray-200 active:bg-gray-100"
                title="Tạo báo cáo mới"
              >
                <RefreshCw className="w-4 h-4 text-gray-600" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ===== BODY ===== */}
      <div className="max-w-5xl mx-auto px-4 py-4">
        {/* Filters */}
        {renderFilters()}

        {/* Report Content */}
        {generated && (
          <>
            {reportType === 'portfolio' ? renderPortfolioReport() : renderProgressReport()}
          </>
        )}

        {/* Empty State */}
        {!generated && !generating && (
          <div className="bg-white rounded-xl border border-gray-100 p-8 text-center mt-4">
            <BarChart3 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <h3 className="text-[15px] font-semibold text-gray-600 mb-1">Chọn thông số và tạo báo cáo</h3>
            <p className="text-[13px] text-gray-400">Chọn loại báo cáo, dự án và kỳ báo cáo ở trên, sau đó nhấn "Xem báo cáo"</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default ProjectReportPage