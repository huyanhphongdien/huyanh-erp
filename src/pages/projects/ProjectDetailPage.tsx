// ============================================================================
// FILE: src/pages/projects/ProjectDetailPage.tsx
// MODULE: Quản lý Dự án — Huy Anh Rubber ERP
// PHASE: PM3 — Bước 3.6 + PM4 (Gantt) + PM5 (Resources) + PM6 (Tasks) + PM7 (Risks) + PM8 (Docs) + PM9 (Reports)
// ============================================================================
// Hub chính dự án: Header + Tab navigation
// Tab Tổng quan: Summary cards, milestones mini, recent activities
// Tab Phases: Accordion CRUD (tạo/sửa/xóa/reorder phases)
// Tab Gantt: GanttChart component — PM4 integrated
// Tab Nhân sự: Resource management — PM5 integrated
// Tab Tasks: Project tasks — PM6 integrated
// Tab Rủi ro: Risk register + Issue tracker — PM7 integrated
// Tab Tài liệu: Document management — PM8 integrated
// Tab Báo cáo: Quick reports + Export PDF — PM9 integrated
// Các tab khác: Placeholder cho PM10-PM11
// Design: Industrial Rubber Theme, mobile-first
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react'
import {
  ArrowLeft,
  MoreHorizontal,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Edit3,
  Trash2,
  Plus,
  Check,
  X,
  Calendar,
  Users,
  Target,
  AlertTriangle,
  FileText,
  BarChart3,
  Clock,
  Crown,
  Loader2,
  CheckCircle2,
  PauseCircle,
  Ban,
  FileEdit,
  FolderKanban,
  Milestone,
  ListTodo,
  ShieldAlert,
  FolderOpen,
  Activity,
  DollarSign,
  GanttChart as GanttChartIcon,
  UserCog,
  CircleDot,
  ArrowUpDown,
  GripVertical,
  Play,
  Square,
  SkipForward,
  RefreshCw,
  Save,
  Info,
  Printer,
  FileSpreadsheet,
  Download,
} from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

// PM4 — Gantt imports
import GanttChart from '../../components/project/GanttChart'
import type { ZoomLevel } from '../../components/project/GanttChart'
import { ganttService } from '../../services/project/ganttService'
import type { GanttData, GanttItem } from '../../services/project/ganttService'

// PM5 — Resource imports
import resourceService, {
  type ProjectMember,
  type ProjectMemberRole,
  type EmployeeWorkload,
  MEMBER_ROLE_LABELS,
  MEMBER_ROLE_COLORS,
  getAllocationColor,
} from '../../services/project/resourceService'

// PM6 — Task imports
import ProjectTasksPage from './ProjectTasksPage'

// PM7 — Risk imports
import ProjectRiskPage from './ProjectRiskPage'

// PM8 — Document imports
import ProjectDocsTab from '../../components/project/ProjectDocsTab'

// PM9 — Reports & Health imports
import { useAuthStore } from '../../stores/authStore'
import { projectHealthService, type HealthResult } from '../../services/project/projectHealthService'
import { exportStatusReportPDF, type PDFReportData } from '../../utils/exportProjectPDF'

// ============================================================================
// TYPES
// ============================================================================

type ProjectStatus = 'draft' | 'planning' | 'approved' | 'in_progress' | 'on_hold' | 'completed' | 'cancelled'
type ProjectPriority = 'critical' | 'high' | 'medium' | 'low'
type PhaseStatus = 'pending' | 'in_progress' | 'completed' | 'skipped'
type MilestoneStatus = 'pending' | 'approaching' | 'completed' | 'overdue' | 'cancelled'

interface Project {
  id: string
  code: string
  name: string
  description?: string
  category?: { id: string; name: string; color: string }
  planned_start?: string
  planned_end?: string
  actual_start?: string
  actual_end?: string
  status: ProjectStatus
  priority: ProjectPriority
  progress_pct: number
  budget_planned: number
  budget_actual: number
  budget_currency: string
  owner?: { id: string; full_name: string }
  sponsor?: { id: string; full_name: string }
  department?: { id: string; name: string }
  tags?: string[]
  created_at: string
  updated_at: string
}

interface Phase {
  id: string
  project_id: string
  name: string
  description?: string
  order_index: number
  planned_start?: string
  planned_end?: string
  status: PhaseStatus
  progress_pct: number
  color?: string
  milestones?: MilestoneItem[]
}

interface MilestoneItem {
  id: string
  name: string
  due_date: string
  completed_date?: string
  status: MilestoneStatus
  assignee?: { id: string; full_name: string }
  phase?: { id: string; name: string }
}

interface ActivityItem {
  id: string
  action: string
  description?: string
  actor?: { id: string; full_name: string }
  created_at: string
}

interface ProjectStats {
  phase_count: number
  milestone_count: number
  milestone_completed: number
  member_count: number
  risk_count: number
  open_issues: number
}

// ============================================================================
// CONSTANTS
// ============================================================================

const STATUS_CONFIG: Record<ProjectStatus, { label: string; className: string; icon: React.ReactNode }> = {
  draft:       { label: 'Nháp',           className: 'bg-gray-50 text-gray-600 border-gray-200',       icon: <FileEdit className="w-3.5 h-3.5" /> },
  planning:    { label: 'Lập kế hoạch',   className: 'bg-blue-50 text-blue-600 border-blue-200',       icon: <Target className="w-3.5 h-3.5" /> },
  approved:    { label: 'Đã duyệt',       className: 'bg-indigo-50 text-indigo-600 border-indigo-200', icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  in_progress: { label: 'Đang thực hiện', className: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: <BarChart3 className="w-3.5 h-3.5" /> },
  on_hold:     { label: 'Tạm dừng',       className: 'bg-amber-50 text-amber-600 border-amber-200',   icon: <PauseCircle className="w-3.5 h-3.5" /> },
  completed:   { label: 'Hoàn thành',     className: 'bg-green-50 text-green-700 border-green-200',   icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  cancelled:   { label: 'Đã hủy',         className: 'bg-red-50 text-red-600 border-red-200',         icon: <Ban className="w-3.5 h-3.5" /> },
}

const PRIORITY_CONFIG: Record<ProjectPriority, { label: string; dotColor: string; color: string }> = {
  critical: { label: 'Khẩn cấp', dotColor: 'bg-red-500',    color: 'text-red-600' },
  high:     { label: 'Cao',      dotColor: 'bg-orange-500', color: 'text-orange-600' },
  medium:   { label: 'Trung bình', dotColor: 'bg-blue-500',  color: 'text-blue-600' },
  low:      { label: 'Thấp',     dotColor: 'bg-gray-400',   color: 'text-gray-500' },
}

const PHASE_STATUS_CONFIG: Record<PhaseStatus, { label: string; icon: React.ReactNode; color: string; bgColor: string }> = {
  pending:     { label: 'Chờ',     icon: <CircleDot className="w-4 h-4" />, color: 'text-gray-500',   bgColor: 'bg-gray-100' },
  in_progress: { label: 'Đang chạy', icon: <Play className="w-4 h-4" />,    color: 'text-blue-600',   bgColor: 'bg-blue-100' },
  completed:   { label: 'Xong',    icon: <Check className="w-4 h-4" />,     color: 'text-green-600',  bgColor: 'bg-green-100' },
  skipped:     { label: 'Bỏ qua',  icon: <SkipForward className="w-4 h-4" />, color: 'text-gray-400', bgColor: 'bg-gray-50' },
}

const MS_STATUS_ICON: Record<MilestoneStatus, { icon: string; color: string }> = {
  pending:     { icon: '⬜', color: 'text-gray-500' },
  approaching: { icon: '🔵', color: 'text-blue-600' },
  completed:   { icon: '✅', color: 'text-green-600' },
  overdue:     { icon: '🔴', color: 'text-red-600' },
  cancelled:   { icon: '⚫', color: 'text-gray-400' },
}

const VALID_TRANSITIONS: Record<ProjectStatus, ProjectStatus[]> = {
  draft:       ['planning', 'cancelled'],
  planning:    ['approved', 'draft', 'cancelled'],
  approved:    ['in_progress', 'planning', 'cancelled'],
  in_progress: ['on_hold', 'completed', 'cancelled'],
  on_hold:     ['in_progress', 'cancelled'],
  completed:   [],
  cancelled:   ['draft'],
}

// ✅ PM9: Added 'reports' tab
type TabKey = 'overview' | 'phases' | 'gantt' | 'resources' | 'tasks' | 'budget' | 'risks' | 'docs' | 'reports' | 'activity'

const TABS: { key: TabKey; label: string; icon: React.ReactNode; phase?: string }[] = [
  { key: 'overview',  label: 'Tổng quan',  icon: <FolderKanban className="w-4 h-4" /> },
  { key: 'phases',    label: 'Phases',      icon: <ListTodo className="w-4 h-4" /> },
  { key: 'gantt',     label: 'Gantt',       icon: <GanttChartIcon className="w-4 h-4" /> },
  { key: 'resources', label: 'Nhân sự',     icon: <UserCog className="w-4 h-4" /> },
  { key: 'tasks',     label: 'Tasks',       icon: <CheckCircle2 className="w-4 h-4" /> },
  { key: 'budget',    label: 'Khái toán',   icon: <DollarSign className="w-4 h-4" />,   phase: 'PM11' },
  { key: 'risks',     label: 'Rủi ro',      icon: <ShieldAlert className="w-4 h-4" /> },
  { key: 'docs',      label: 'Tài liệu',   icon: <FolderOpen className="w-4 h-4" /> },
  { key: 'reports',   label: 'Báo cáo',     icon: <BarChart3 className="w-4 h-4" /> },
  { key: 'activity',  label: 'Hoạt động',   icon: <Activity className="w-4 h-4" /> },
]

// ============================================================================
// DEFAULT VALUES (no more mock data — all real from Supabase)
// ============================================================================

const DEFAULT_PROJECT: Project = {
  id: '',
  code: '',
  name: '',
  description: '',
  status: 'draft',
  priority: 'medium',
  progress_pct: 0,
  budget_planned: 0,
  budget_actual: 0,
  budget_currency: 'VND',
  created_at: '',
  updated_at: '',
}

const DEFAULT_STATS: ProjectStats = {
  phase_count: 0,
  milestone_count: 0,
  milestone_completed: 0,
  member_count: 0,
  risk_count: 0,
  open_issues: 0,
}

// ============================================================================
// HELPERS
// ============================================================================

function formatDate(d?: string): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatBudget(n: number): string {
  if (!n) return '—'
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} tỷ`
  if (n >= 1e6) return `${(n / 1e6).toFixed(0)} tr`
  return n.toLocaleString('vi-VN')
}

function timeAgo(dateStr: string): string {
  const d = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (days === 0) return 'Hôm nay'
  if (days === 1) return 'Hôm qua'
  if (days < 30) return `${days} ngày trước`
  const months = Math.floor(days / 30)
  return `${months} tháng trước`
}

function getProgressColor(pct: number): string {
  if (pct >= 75) return 'bg-emerald-500'
  if (pct >= 40) return 'bg-blue-500'
  if (pct >= 10) return 'bg-amber-500'
  return 'bg-gray-300'
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

const StatusBadge: React.FC<{ status: ProjectStatus; size?: 'sm' | 'md' }> = ({ status, size = 'sm' }) => {
  const c = STATUS_CONFIG[status]
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border font-semibold ${c.className} ${
      size === 'md' ? 'text-[13px]' : 'text-[11px]'
    }`}>
      {c.icon} {c.label}
    </span>
  )
}

const PriorityDot: React.FC<{ priority: ProjectPriority }> = ({ priority }) => {
  const c = PRIORITY_CONFIG[priority]
  return (
    <span className={`inline-flex items-center gap-1.5 ${c.color} text-[12px] font-medium`}>
      <span className={`w-2 h-2 rounded-full ${c.dotColor}`} />
      {c.label}
    </span>
  )
}

/** Summary stat card */
const StatCard: React.FC<{ label: string; value: string | number; sub?: string; icon: React.ReactNode; color: string }> = ({
  label, value, sub, icon, color,
}) => (
  <div className="bg-white rounded-xl border border-gray-100 p-3.5">
    <div className="flex items-start justify-between mb-2">
      <span className="text-[11px] font-semibold text-gray-500 uppercase">{label}</span>
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${color}`}>{icon}</div>
    </div>
    <p className="text-[22px] font-bold text-gray-900 leading-none" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
      {value}
    </p>
    {sub && <p className="text-[11px] text-gray-500 mt-1">{sub}</p>}
  </div>
)

// ============================================================================
// TAB: OVERVIEW
// ============================================================================

const OverviewTab: React.FC<{
  project: Project
  stats: ProjectStats
  milestones: MilestoneItem[]
  activities: ActivityItem[]
}> = ({ project, stats, milestones, activities }) => {
  const budgetPct = project.budget_planned > 0
    ? Math.round((project.budget_actual / project.budget_planned) * 100)
    : 0

  return (
    <div className="space-y-5">
      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Phases"
          value={stats.phase_count}
          icon={<ListTodo className="w-4 h-4 text-blue-600" />}
          color="bg-blue-50"
        />
        <StatCard
          label="Milestones"
          value={`${stats.milestone_completed}/${stats.milestone_count}`}
          sub={stats.milestone_count > 0 ? `${Math.round((stats.milestone_completed / stats.milestone_count) * 100)}% hoàn thành` : undefined}
          icon={<Milestone className="w-4 h-4 text-purple-600" />}
          color="bg-purple-50"
        />
        <StatCard
          label="Thành viên"
          value={stats.member_count}
          icon={<Users className="w-4 h-4 text-emerald-600" />}
          color="bg-emerald-50"
        />
        <StatCard
          label="Ngân sách"
          value={formatBudget(project.budget_actual)}
          sub={`/ ${formatBudget(project.budget_planned)} (${budgetPct}%)`}
          icon={<DollarSign className="w-4 h-4 text-amber-600" />}
          color="bg-amber-50"
        />
      </div>

      {/* Description */}
      {project.description && (
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <h3 className="text-[12px] font-semibold text-gray-500 uppercase mb-2">Mô tả</h3>
          <p className="text-[14px] text-gray-700 leading-relaxed">{project.description}</p>
        </div>
      )}

      {/* Milestones mini timeline */}
      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[12px] font-semibold text-gray-500 uppercase">Milestones sắp tới</h3>
          <span className="text-[11px] text-gray-400">{milestones.length} mốc</span>
        </div>
        <div className="space-y-2.5">
          {milestones.slice(0, 5).map(ms => {
            const msConf = MS_STATUS_ICON[ms.status]
            return (
              <div key={ms.id} className="flex items-center gap-3">
                <span className="text-[16px] shrink-0">{msConf.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className={`text-[13px] font-medium truncate ${ms.status === 'completed' ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                    {ms.name}
                  </p>
                  <p className="text-[11px] text-gray-500">
                    {formatDate(ms.due_date)}
                    {ms.phase && <span className="ml-1.5">• {ms.phase.name}</span>}
                  </p>
                </div>
                {ms.assignee && (
                  <span className="text-[11px] text-gray-400 shrink-0">{ms.assignee.full_name}</span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Recent activities */}
      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <h3 className="text-[12px] font-semibold text-gray-500 uppercase mb-3">Hoạt động gần đây</h3>
        <div className="space-y-3">
          {activities.map(act => (
            <div key={act.id} className="flex gap-3">
              <div className="w-2 h-2 rounded-full bg-[#1B4D3E] mt-1.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] text-gray-700">{act.description}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  {act.actor?.full_name} • {timeAgo(act.created_at)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Info grid */}
      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <h3 className="text-[12px] font-semibold text-gray-500 uppercase mb-3">Thông tin chi tiết</h3>
        <div className="grid grid-cols-2 gap-y-3 gap-x-6 text-[13px]">
          <div><span className="text-gray-500">Phòng ban:</span> <span className="font-medium text-gray-800 ml-1">{project.department?.name || '—'}</span></div>
          <div><span className="text-gray-500">Sponsor:</span> <span className="font-medium text-gray-800 ml-1">{project.sponsor?.full_name || '—'}</span></div>
          <div><span className="text-gray-500">Bắt đầu DK:</span> <span className="font-medium text-gray-800 ml-1">{formatDate(project.planned_start)}</span></div>
          <div><span className="text-gray-500">Kết thúc DK:</span> <span className="font-medium text-gray-800 ml-1">{formatDate(project.planned_end)}</span></div>
          <div><span className="text-gray-500">Bắt đầu TT:</span> <span className="font-medium text-gray-800 ml-1">{formatDate(project.actual_start)}</span></div>
          <div><span className="text-gray-500">Rủi ro:</span> <span className="font-medium text-gray-800 ml-1">{stats.risk_count} ({stats.open_issues} vấn đề mở)</span></div>
        </div>
        {project.tags && project.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-gray-50">
            {project.tags.map((tag, i) => (
              <span key={i} className="px-2 py-0.5 text-[11px] bg-gray-100 text-gray-600 rounded-md">#{tag}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// TAB: PHASES (Accordion + inline CRUD)
// ============================================================================

const PhasesTab: React.FC<{
  phases: Phase[]
  projectId: string
  onRefresh: () => void
  onUpdateStatus: (id: string, status: PhaseStatus) => void
  onDelete: (id: string) => void
}> = ({ phases, projectId, onRefresh, onUpdateStatus, onDelete }) => {
  const [expandedId, setExpandedId] = useState<string | null>(phases[0]?.id || null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newPhaseName, setNewPhaseName] = useState('')
  const [adding, setAdding] = useState(false)

  // Edit state
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editStart, setEditStart] = useState('')
  const [editEnd, setEditEnd] = useState('')
  const [saving, setSaving] = useState(false)

  // Milestones state
  const [milestonesMap, setMilestonesMap] = useState<Map<string, MilestoneItem[]>>(new Map())
  const [loadingMs, setLoadingMs] = useState<Set<string>>(new Set())
  const [addMsPhaseId, setAddMsPhaseId] = useState<string | null>(null)
  const [msName, setMsName] = useState('')
  const [msDueDate, setMsDueDate] = useState('')
  const [msAssigneeId, setMsAssigneeId] = useState('')
  const [savingMs, setSavingMs] = useState(false)

  // Employees for assignee dropdown
  const [employees, setEmployees] = useState<{ id: string; full_name: string }[]>([])
  useEffect(() => {
    supabase.from('employees').select('id, full_name').order('full_name')
      .then(({ data }) => setEmployees(data || []))
  }, [])

  // Load milestones for a phase
  const loadMilestones = useCallback(async (phaseId: string) => {
    setLoadingMs(prev => new Set(prev).add(phaseId))
    try {
      const { data } = await supabase
        .from('project_milestones')
        .select('id, name, due_date, completed_date, status, assignee_id, phase_id')
        .eq('project_id', projectId)
        .eq('phase_id', phaseId)
        .order('due_date', { ascending: true })

      // Load assignee names
      const empIds = (data || []).map((m: any) => m.assignee_id).filter(Boolean)
      const empMap = new Map<string, { id: string; full_name: string }>()
      if (empIds.length > 0) {
        const { data: empData } = await supabase.from('employees').select('id, full_name').in('id', empIds)
        ;(empData || []).forEach((e: any) => empMap.set(e.id, e))
      }

      const milestones: MilestoneItem[] = (data || []).map((m: any) => ({
        id: m.id,
        name: m.name,
        due_date: m.due_date,
        completed_date: m.completed_date || undefined,
        status: m.status || 'pending',
        assignee: m.assignee_id ? empMap.get(m.assignee_id) : undefined,
        phase: { id: phaseId, name: phases.find(p => p.id === phaseId)?.name || '' },
      }))

      setMilestonesMap(prev => new Map(prev).set(phaseId, milestones))
    } catch (err) {
      console.error('Load milestones failed:', err)
    } finally {
      setLoadingMs(prev => { const s = new Set(prev); s.delete(phaseId); return s })
    }
  }, [projectId, phases])

  // Auto-load milestones when phase expands
  useEffect(() => {
    if (expandedId && !milestonesMap.has(expandedId)) {
      loadMilestones(expandedId)
    }
  }, [expandedId, loadMilestones, milestonesMap])

  // Also load milestones with no phase (project-level)
  const [projectMilestones, setProjectMilestones] = useState<MilestoneItem[]>([])
  const [addProjectMs, setAddProjectMs] = useState(false)
  const loadProjectMilestones = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('project_milestones')
        .select('id, name, due_date, completed_date, status, assignee_id, phase_id')
        .eq('project_id', projectId)
        .is('phase_id', null)
        .order('due_date', { ascending: true })

      const empIds = (data || []).map((m: any) => m.assignee_id).filter(Boolean)
      const empMap = new Map<string, { id: string; full_name: string }>()
      if (empIds.length > 0) {
        const { data: empData } = await supabase.from('employees').select('id, full_name').in('id', empIds)
        ;(empData || []).forEach((e: any) => empMap.set(e.id, e))
      }

      setProjectMilestones((data || []).map((m: any) => ({
        id: m.id, name: m.name, due_date: m.due_date,
        completed_date: m.completed_date || undefined,
        status: m.status || 'pending',
        assignee: m.assignee_id ? empMap.get(m.assignee_id) : undefined,
      })))
    } catch (err) {
      console.error('Load project milestones failed:', err)
    }
  }, [projectId])

  useEffect(() => { loadProjectMilestones() }, [loadProjectMilestones])

  const handleAddMilestone = async (phaseId: string | null) => {
    if (!msName.trim() || !msDueDate) return
    setSavingMs(true)
    try {
      const { error } = await supabase.from('project_milestones').insert({
        project_id: projectId,
        phase_id: phaseId,
        name: msName.trim(),
        due_date: msDueDate,
        assignee_id: msAssigneeId || null,
        status: 'pending',
      })
      if (error) throw error

      setMsName('')
      setMsDueDate('')
      setMsAssigneeId('')
      setAddMsPhaseId(null)
      setAddProjectMs(false)

      if (phaseId) {
        await loadMilestones(phaseId)
      } else {
        await loadProjectMilestones()
      }
    } catch (err: any) {
      console.error('Add milestone failed:', err)
      alert('Thêm milestone thất bại: ' + (err.message || 'Lỗi'))
    } finally {
      setSavingMs(false)
    }
  }

  const handleToggleMilestoneStatus = async (msId: string, currentStatus: MilestoneStatus, phaseId: string | null) => {
    const newStatus = currentStatus === 'completed' ? 'pending' : 'completed'
    const completedDate = newStatus === 'completed' ? new Date().toISOString().split('T')[0] : null
    try {
      await supabase.from('project_milestones')
        .update({ status: newStatus, completed_date: completedDate })
        .eq('id', msId)
      if (phaseId) await loadMilestones(phaseId)
      else await loadProjectMilestones()
    } catch (err) {
      console.error('Toggle milestone failed:', err)
    }
  }

  const handleDeleteMilestone = async (msId: string, phaseId: string | null) => {
    if (!confirm('Xóa milestone này?')) return
    try {
      await supabase.from('project_milestones').delete().eq('id', msId)
      if (phaseId) await loadMilestones(phaseId)
      else await loadProjectMilestones()
    } catch (err) {
      console.error('Delete milestone failed:', err)
    }
  }


  /** Milestone list within a phase */
  const MilestoneList: React.FC<{ milestones: MilestoneItem[]; phaseId: string | null; isLoading?: boolean }> = ({ milestones, phaseId, isLoading }) => {
    const isAddingHere = phaseId === null ? addProjectMs : addMsPhaseId === phaseId

    const handleClickAdd = () => {
      setMsName(''); setMsDueDate(''); setMsAssigneeId('')
      if (phaseId === null) {
        setAddProjectMs(true)
        setAddMsPhaseId(null)
      } else {
        setAddMsPhaseId(phaseId)
        setAddProjectMs(false)
      }
    }

    const handleCancelAdd = () => {
      if (phaseId === null) setAddProjectMs(false)
      else setAddMsPhaseId(null)
    }

    return (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold text-gray-500 uppercase flex items-center gap-1">
            <Milestone className="w-3.5 h-3.5" />
            Milestones ({milestones.length})
          </span>
          {!isAddingHere && (
            <button
              onClick={handleClickAdd}
              className="text-[11px] text-[#1B4D3E] font-medium flex items-center gap-0.5 hover:underline"
            >
              <Plus className="w-3 h-3" /> Thêm
            </button>
          )}
        </div>

        {isLoading && (
          <div className="flex items-center gap-2 py-2 text-[12px] text-gray-400">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Đang tải...
          </div>
        )}

        {!isLoading && milestones.length === 0 && !isAddingHere && (
          <p className="text-[12px] text-gray-400 py-1">Chưa có milestone</p>
        )}

        {milestones.map(ms => {
          const msConf = MS_STATUS_ICON[ms.status]
          const isOverdue = ms.status !== 'completed' && ms.due_date && new Date(ms.due_date) < new Date()
          return (
            <div key={ms.id} className={`flex items-center gap-2 py-1.5 px-2 rounded-lg ${isOverdue ? 'bg-red-50' : 'hover:bg-gray-50'} group`}>
              <button
                onClick={() => handleToggleMilestoneStatus(ms.id, ms.status, phaseId)}
                className="text-[14px] shrink-0"
                title={ms.status === 'completed' ? 'Đánh dấu chưa xong' : 'Đánh dấu hoàn thành'}
              >
                {msConf.icon}
              </button>
              <div className="flex-1 min-w-0">
                <span className={`text-[12px] font-medium ${ms.status === 'completed' ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                  {ms.name}
                </span>
              </div>
              <span className={`text-[11px] shrink-0 ${isOverdue ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
                {formatDate(ms.due_date)}
              </span>
              {ms.assignee && (
                <span className="text-[10px] text-gray-400 shrink-0 hidden sm:block">{ms.assignee.full_name}</span>
              )}
              <button
                onClick={() => handleDeleteMilestone(ms.id, phaseId)}
                className="opacity-0 group-hover:opacity-100 p-1 rounded text-gray-300 hover:text-red-500 transition-opacity shrink-0"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          )
        })}

        {/* Inline form — NOT a sub-component (avoids remount on state change) */}
        {isAddingHere && (
          <div className="bg-amber-50/50 border border-amber-200 rounded-lg p-3 space-y-2">
            <div className="text-[11px] font-semibold text-amber-700 uppercase">Thêm Milestone mới</div>
            <input
              type="text" value={msName} onChange={e => setMsName(e.target.value)}
              placeholder="Tên milestone..."
              className="w-full px-3 py-2 text-[13px] bg-white rounded-lg border border-gray-200 outline-none focus:border-[#2D8B6E]"
            />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-gray-500 mb-0.5 block">Ngày đến hạn *</label>
                <input
                  type="date" value={msDueDate} onChange={e => setMsDueDate(e.target.value)}
                  className="w-full px-2 py-2 text-[13px] bg-white rounded-lg border border-gray-200 outline-none focus:border-[#2D8B6E]"
                />
              </div>
              <div>
                <label className="text-[10px] text-gray-500 mb-0.5 block">Phụ trách</label>
                <select
                  value={msAssigneeId} onChange={e => setMsAssigneeId(e.target.value)}
                  className="w-full px-2 py-2 text-[13px] bg-white rounded-lg border border-gray-200 outline-none focus:border-[#2D8B6E]"
                >
                  <option value="">— Không —</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => handleAddMilestone(phaseId)}
                disabled={savingMs || !msName.trim() || !msDueDate}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-[#1B4D3E] text-white text-[12px] font-semibold disabled:opacity-50 active:scale-[0.97]"
              >
                {savingMs ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                Lưu
              </button>
              <button onClick={handleCancelAdd} className="px-3 py-2 rounded-lg border border-gray-200 text-gray-500 text-[12px]">Hủy</button>
            </div>
          </div>
        )}
      </div>
    )
  }

  const handleAdd = async () => {
    if (!newPhaseName.trim() || !projectId) return
    setAdding(true)
    try {
      const nextOrder = phases.length > 0
        ? Math.max(...phases.map(p => p.order_index)) + 1
        : 0

      const { error } = await supabase.from('project_phases').insert({
        project_id: projectId,
        name: newPhaseName.trim(),
        order_index: nextOrder,
        status: 'pending',
        progress_pct: 0,
      })

      if (error) throw error

      setNewPhaseName('')
      setShowAddForm(false)
      onRefresh()
    } catch (err: any) {
      console.error('Add phase failed:', err)
      alert('Thêm giai đoạn thất bại: ' + (err.message || 'Lỗi'))
    } finally {
      setAdding(false)
    }
  }

  const startEdit = (phase: Phase) => {
    setEditId(phase.id)
    setEditName(phase.name)
    setEditDesc(phase.description || '')
    setEditStart(phase.planned_start || '')
    setEditEnd(phase.planned_end || '')
  }

  const cancelEdit = () => {
    setEditId(null)
    setEditName('')
    setEditDesc('')
    setEditStart('')
    setEditEnd('')
  }

  const handleSaveEdit = async () => {
    if (!editId || !editName.trim()) return
    setSaving(true)
    try {
      const { error } = await supabase.from('project_phases')
        .update({
          name: editName.trim(),
          description: editDesc.trim() || null,
          planned_start: editStart || null,
          planned_end: editEnd || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editId)

      if (error) throw error

      cancelEdit()
      onRefresh()
    } catch (err: any) {
      console.error('Save phase failed:', err)
      alert('Lưu thất bại: ' + (err.message || 'Lỗi'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      {phases.map((phase, idx) => {
        const isExpanded = expandedId === phase.id
        const isEditing = editId === phase.id
        const phaseConf = PHASE_STATUS_CONFIG[phase.status]

        return (
          <div key={phase.id} className={`bg-white rounded-xl border overflow-hidden ${isEditing ? 'border-[#2D8B6E] ring-1 ring-[#2D8B6E]/20' : 'border-gray-100'}`}>
            <button
              type="button"
              onClick={() => setExpandedId(isExpanded ? null : phase.id)}
              className="w-full flex items-center gap-3 p-4 text-left active:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-1 shrink-0">
                <GripVertical className="w-4 h-4 text-gray-300" />
                <span className="text-[12px] font-bold text-gray-400 w-5 text-center"
                  style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                  {idx + 1}
                </span>
              </div>

              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${phaseConf.bgColor} ${phaseConf.color}`}>
                {phaseConf.icon}
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-semibold text-gray-900 truncate">{phase.name}</p>
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden max-w-[120px]">
                    <div
                      className={`h-full rounded-full ${getProgressColor(phase.progress_pct)}`}
                      style={{ width: `${phase.progress_pct}%` }}
                    />
                  </div>
                  <span className="text-[11px] font-semibold text-gray-500"
                    style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    {phase.progress_pct}%
                  </span>
                  <span className={`text-[10px] font-medium ${phaseConf.color}`}>{phaseConf.label}</span>
                </div>
              </div>

              <span className="text-[11px] text-gray-400 hidden sm:block shrink-0">
                {phase.planned_start && phase.planned_end
                  ? `${formatDate(phase.planned_start)} → ${formatDate(phase.planned_end)}`
                  : '—'
                }
              </span>

              {isExpanded
                ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" />
                : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
              }
            </button>

            {isExpanded && !isEditing && (
              <div className="border-t border-gray-100 p-4 space-y-3">
                {phase.description && (
                  <p className="text-[13px] text-gray-600">{phase.description}</p>
                )}

                <div className="grid grid-cols-2 gap-3 text-[12px]">
                  <div>
                    <span className="text-gray-500">Bắt đầu DK:</span>
                    <span className="font-medium text-gray-800 ml-1">{formatDate(phase.planned_start)}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Kết thúc DK:</span>
                    <span className="font-medium text-gray-800 ml-1">{formatDate(phase.planned_end)}</span>
                  </div>
                </div>

                {/* ===== MILESTONES SECTION ===== */}
                <div className="pt-2 border-t border-gray-50">
                  <MilestoneList
                    milestones={milestonesMap.get(phase.id) || []}
                    phaseId={phase.id}
                    isLoading={loadingMs.has(phase.id)}
                  />
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-gray-50">
                  {phase.status === 'pending' && (
                    <button
                      onClick={() => onUpdateStatus(phase.id, 'in_progress')}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-50 text-blue-600 text-[12px] font-semibold active:scale-[0.97]"
                    >
                      <Play className="w-3.5 h-3.5" /> Bắt đầu
                    </button>
                  )}
                  {phase.status === 'in_progress' && (
                    <button
                      onClick={() => onUpdateStatus(phase.id, 'completed')}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-green-50 text-green-600 text-[12px] font-semibold active:scale-[0.97]"
                    >
                      <Check className="w-3.5 h-3.5" /> Hoàn thành
                    </button>
                  )}
                  <button
                    onClick={() => startEdit(phase)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-50 text-gray-600 text-[12px] font-medium"
                  >
                    <Edit3 className="w-3.5 h-3.5" /> Sửa
                  </button>
                  <button
                    onClick={() => onDelete(phase.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-50 text-red-500 text-[12px] font-medium ml-auto"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Xóa
                  </button>
                </div>
              </div>
            )}

            {/* ===== INLINE EDIT FORM ===== */}
            {isExpanded && isEditing && (
              <div className="border-t border-[#2D8B6E]/30 p-4 space-y-3 bg-[#F7F5F2]/50">
                <div>
                  <label className="text-[11px] font-semibold text-gray-500 uppercase mb-1 block">Tên giai đoạn</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full px-3 py-2.5 text-[14px] bg-white rounded-lg border border-gray-200 outline-none focus:border-[#2D8B6E] focus:ring-1 focus:ring-[#2D8B6E]/20"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-gray-500 uppercase mb-1 block">Mô tả (tùy chọn)</label>
                  <textarea
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2.5 text-[14px] bg-white rounded-lg border border-gray-200 outline-none focus:border-[#2D8B6E] focus:ring-1 focus:ring-[#2D8B6E]/20 resize-none"
                    placeholder="Mô tả giai đoạn..."
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-gray-500 uppercase mb-1 block">Ngày bắt đầu DK</label>
                    <input
                      type="date"
                      value={editStart}
                      onChange={(e) => setEditStart(e.target.value)}
                      className="w-full px-3 py-2.5 text-[14px] bg-white rounded-lg border border-gray-200 outline-none focus:border-[#2D8B6E] focus:ring-1 focus:ring-[#2D8B6E]/20"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-gray-500 uppercase mb-1 block">Ngày kết thúc DK</label>
                    <input
                      type="date"
                      value={editEnd}
                      onChange={(e) => setEditEnd(e.target.value)}
                      min={editStart || undefined}
                      className="w-full px-3 py-2.5 text-[14px] bg-white rounded-lg border border-gray-200 outline-none focus:border-[#2D8B6E] focus:ring-1 focus:ring-[#2D8B6E]/20"
                    />
                  </div>
                </div>

                {/* Duration hint */}
                {editStart && editEnd && new Date(editEnd) > new Date(editStart) && (
                  <div className="flex items-center gap-1.5 text-[12px] text-blue-600 bg-blue-50 rounded-lg px-3 py-1.5">
                    <Calendar className="w-3.5 h-3.5" />
                    {Math.ceil((new Date(editEnd).getTime() - new Date(editStart).getTime()) / (1000 * 60 * 60 * 24))} ngày
                  </div>
                )}

                <div className="flex items-center gap-2 pt-2 border-t border-gray-200">
                  <button
                    onClick={handleSaveEdit}
                    disabled={saving || !editName.trim()}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-[#1B4D3E] text-white text-[13px] font-semibold active:scale-[0.97] disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Lưu thay đổi
                  </button>
                  <button
                    onClick={cancelEdit}
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg border border-gray-200 text-gray-600 text-[13px] font-medium active:scale-[0.97]"
                  >
                    Hủy
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}

      {/* ===== ADD PHASE BUTTON / FORM (always visible, prominent) ===== */}
      {showAddForm ? (
        <div className="bg-white rounded-xl border border-dashed border-[#2D8B6E] p-4">
          <div className="text-[11px] font-semibold text-[#1B4D3E] uppercase mb-2">Thêm giai đoạn mới</div>
          <div className="flex gap-2">
            <input
              type="text"
              value={newPhaseName}
              onChange={(e) => setNewPhaseName(e.target.value)}
              placeholder="Tên giai đoạn mới..."
              className="flex-1 px-3 py-2.5 text-[14px] bg-gray-50 rounded-lg border border-gray-200 outline-none focus:border-[#2D8B6E]"
              autoFocus
              disabled={adding}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            />
            <button onClick={handleAdd} disabled={adding || !newPhaseName.trim()} className="px-3 py-2.5 rounded-lg bg-[#1B4D3E] text-white disabled:opacity-50">
              {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            </button>
            <button onClick={() => { setShowAddForm(false); setNewPhaseName('') }} disabled={adding} className="px-3 py-2.5 rounded-lg bg-gray-100 text-gray-500">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowAddForm(true)}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl border border-dashed border-gray-300 text-[13px] font-medium text-gray-500 active:bg-gray-50 transition-colors"
        >
          <Plus className="w-4 h-4" /> Thêm giai đoạn
        </button>
      )}

      {/* ===== PROJECT-LEVEL MILESTONES (no phase) ===== */}
      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <MilestoneList
          milestones={projectMilestones}
          phaseId={null}
          isLoading={false}
        />
      </div>
    </div>
  )
}

// ============================================================================
// TAB: GANTT (PM4 — Real GanttChart component)
// ============================================================================

const GanttTab: React.FC<{
  projectId: string
  projectCode?: string
  onNavigateFullPage?: () => void
}> = ({ projectId, projectCode, onNavigateFullPage }) => {
  const [ganttData, setGanttData] = useState<GanttData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedItem, setSelectedItem] = useState<GanttItem | null>(null)
  const [autoScheduling, setAutoScheduling] = useState(false)
  const [resolvedProjectId, setResolvedProjectId] = useState<string | null>(null)

  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId)

  useEffect(() => {
    const resolveId = async () => {
      if (isUUID) {
        setResolvedProjectId(projectId)
        return
      }
      try {
        if (projectCode) {
          const { data, error: err } = await supabase
            .from('projects')
            .select('id')
            .eq('code', projectCode)
            .maybeSingle()
          if (!err && data?.id) {
            setResolvedProjectId(data.id)
            return
          }
        }

        const { data, error: err2 } = await supabase
          .from('projects')
          .select('id')
          .neq('status', 'cancelled')
          .order('created_at', { ascending: false })
          .limit(1)

        if (!err2 && data && data.length > 0) {
          setResolvedProjectId(data[0].id)
        } else {
          setLoading(false)
          setError('Không tìm thấy dự án trong database.')
        }
      } catch (err: any) {
        console.error('Failed to resolve project ID:', err)
        setLoading(false)
        setError('Không thể kết nối database: ' + (err?.message || 'Unknown'))
      }
    }
    resolveId()
  }, [projectId, projectCode, isUUID])

  const loadGanttData = useCallback(async () => {
    if (!resolvedProjectId) return
    try {
      setLoading(true)
      setError(null)
      const data = await ganttService.getGanttData(resolvedProjectId)
      setGanttData(data)
    } catch (err: any) {
      console.error('Failed to load Gantt data:', err)
      setError(err?.message || 'Không thể tải dữ liệu Gantt')
    } finally {
      setLoading(false)
    }
  }, [resolvedProjectId])

  useEffect(() => {
    if (resolvedProjectId) {
      loadGanttData()
    }
  }, [resolvedProjectId, loadGanttData])

  const handleAutoSchedule = async () => {
    if (!resolvedProjectId) return
    try {
      setAutoScheduling(true)
      const result = await ganttService.autoSchedule(resolvedProjectId)
      console.log(`Auto-scheduled: ${result.updated_count} items updated`)
      await loadGanttData()
    } catch (err: any) {
      console.error('Auto-schedule failed:', err)
      alert('Auto-schedule thất bại: ' + (err?.message || 'Lỗi không xác định'))
    } finally {
      setAutoScheduling(false)
    }
  }

  const handleSaveBaseline = async () => {
    if (!resolvedProjectId) return
    try {
      await ganttService.saveBaseline(resolvedProjectId)
      alert('Đã lưu baseline thành công!')
    } catch (err: any) {
      console.error('Save baseline failed:', err)
      alert('Lưu baseline thất bại: ' + (err?.message || 'Lỗi'))
    }
  }

  const handleItemClick = (item: GanttItem) => {
    setSelectedItem(prev => prev?.id === item.id ? null : item)
  }

  if (loading || (!resolvedProjectId && !error)) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-[#1B4D3E] animate-spin mb-3" />
        <p className="text-[13px] text-gray-500">Đang tải Gantt chart...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl border border-red-100 p-6 text-center">
        <AlertTriangle className="w-10 h-10 text-red-400 mx-auto mb-3" />
        <h3 className="text-[15px] font-semibold text-gray-700 mb-1">Không tải được Gantt</h3>
        <p className="text-[13px] text-gray-500 mb-4">{error}</p>
        <button
          onClick={loadGanttData}
          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-[#1B4D3E] text-white text-[13px] font-semibold active:scale-[0.97]"
        >
          <RefreshCw className="w-4 h-4" /> Thử lại
        </button>
      </div>
    )
  }

  if (!ganttData || ganttData.items.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 p-8 text-center">
        <GanttChartIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <h3 className="text-[15px] font-semibold text-gray-600 mb-1">Chưa có dữ liệu Gantt</h3>
        <p className="text-[13px] text-gray-400 mb-4">
          Hãy tạo phases và milestones trong tab Phases trước, sau đó quay lại đây.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-100 p-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-4 text-[12px] text-gray-500">
            <span>
              <strong className="text-gray-800" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                {ganttData.items.length}
              </strong> items
            </span>
            {ganttData.critical_path.length > 0 && (
              <span className="inline-flex items-center gap-1 text-red-600">
                <AlertTriangle className="w-3.5 h-3.5" />
                {ganttData.critical_path.length} critical path
              </span>
            )}
            <span>{ganttData.total_duration_days} ngày</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleAutoSchedule}
              disabled={autoScheduling}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-50 text-blue-600 text-[12px] font-semibold active:scale-[0.97] disabled:opacity-50"
            >
              {autoScheduling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Auto-schedule
            </button>
            <button
              onClick={handleSaveBaseline}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-50 text-amber-600 text-[12px] font-semibold active:scale-[0.97]"
            >
              <Save className="w-3.5 h-3.5" /> Lưu baseline
            </button>
            {onNavigateFullPage && (
              <button
                onClick={onNavigateFullPage}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-50 text-gray-600 text-[12px] font-medium"
              >
                <BarChart3 className="w-3.5 h-3.5" /> Toàn màn hình
              </button>
            )}
            <button
              onClick={loadGanttData}
              className="p-2 rounded-lg bg-gray-50 text-gray-400 active:bg-gray-100"
              title="Làm mới"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden" style={{ minHeight: '400px' }}>
        <GanttChart
          data={ganttData}
          zoomLevel="month"
          showCriticalPath={true}
          onItemClick={handleItemClick}
          className="w-full"
        />
      </div>

      {selectedItem && (
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="flex items-start justify-between mb-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded ${
                  selectedItem.type === 'phase' ? 'bg-blue-100 text-blue-700' :
                  selectedItem.type === 'milestone' ? 'bg-amber-100 text-amber-700' :
                  'bg-gray-100 text-gray-600'
                }`}>
                  {selectedItem.type}
                </span>
                {selectedItem.is_critical && (
                  <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded bg-red-100 text-red-600">
                    Critical
                  </span>
                )}
              </div>
              <h4 className="text-[15px] font-semibold text-gray-900">{selectedItem.name}</h4>
            </div>
            <button onClick={() => setSelectedItem(null)} className="p-1.5 rounded-lg active:bg-gray-100">
              <X className="w-4 h-4 text-gray-400" />
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[12px]">
            <div>
              <span className="text-gray-500">Bắt đầu</span>
              <p className="font-medium text-gray-800">{formatDate(selectedItem.start || undefined)}</p>
            </div>
            <div>
              <span className="text-gray-500">Kết thúc</span>
              <p className="font-medium text-gray-800">{formatDate(selectedItem.end || undefined)}</p>
            </div>
            <div>
              <span className="text-gray-500">Tiến độ</span>
              <p className="font-medium text-gray-800" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                {selectedItem.progress}%
              </p>
            </div>
            <div>
              <span className="text-gray-500">Thời lượng</span>
              <p className="font-medium text-gray-800">{selectedItem.duration_days || 0} ngày</p>
            </div>
            {selectedItem.assignee_name && (
              <div>
                <span className="text-gray-500">Phụ trách</span>
                <p className="font-medium text-gray-800">{selectedItem.assignee_name}</p>
              </div>
            )}
            {selectedItem.total_float !== undefined && (
              <div>
                <span className="text-gray-500">Float</span>
                <p className={`font-medium ${selectedItem.total_float === 0 ? 'text-red-600' : 'text-gray-800'}`}
                   style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                  {selectedItem.total_float} ngày
                </p>
              </div>
            )}
            {selectedItem.status && (
              <div>
                <span className="text-gray-500">Trạng thái</span>
                <p className="font-medium text-gray-800 capitalize">{selectedItem.status.replace('_', ' ')}</p>
              </div>
            )}
            {selectedItem.dependencies.length > 0 && (
              <div>
                <span className="text-gray-500">Dependencies</span>
                <p className="font-medium text-gray-800">{selectedItem.dependencies.length} liên kết</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// TAB: RESOURCES (PM5 — Nhân sự dự án)
// ============================================================================

const ResourcesTab: React.FC<{ projectId: string }> = ({ projectId }) => {
  const [members, setMembers] = useState<ProjectMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [showAdd, setShowAdd] = useState(false)
  const [searchQ, setSearchQ] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [searching, setSearching] = useState(false)
  const [addingId, setAddingId] = useState<string | null>(null)
  const [addRole, setAddRole] = useState<ProjectMemberRole>('member')
  const [addPct, setAddPct] = useState(100)

  const [editId, setEditId] = useState<string | null>(null)
  const [editRole, setEditRole] = useState<ProjectMemberRole>('member')
  const [editPct, setEditPct] = useState(100)
  const [saving, setSaving] = useState(false)

  const [removeId, setRemoveId] = useState<string | null>(null)

  const [workloads, setWorkloads] = useState<EmployeeWorkload[]>([])
  const [subTab, setSubTab] = useState<'list' | 'workload'>('list')

  const [stats, setStats] = useState<{ active: number; avg: number; over: number }>({ active: 0, avg: 0, over: 0 })

  const loadMembers = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await resourceService.getMembers({ project_id: projectId, is_active: 'all' })
      setMembers(data)
      const s = await resourceService.getProjectResourceStats(projectId)
      setStats({ active: s.active_members, avg: s.avg_allocation, over: s.overallocated_count })
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => { loadMembers() }, [loadMembers])

  useEffect(() => {
    if (subTab !== 'workload' || members.length === 0) return
    const load = async () => {
      const wls: EmployeeWorkload[] = []
      const seen = new Set<string>()
      for (const m of members.filter(m => m.is_active)) {
        if (seen.has(m.employee_id)) continue
        seen.add(m.employee_id)
        try {
          const wl = await resourceService.getEmployeeWorkload(m.employee_id)
          wls.push(wl)
        } catch {}
      }
      setWorkloads(wls.sort((a, b) => b.total_allocation_pct - a.total_allocation_pct))
    }
    load()
  }, [subTab, members])

  useEffect(() => {
    if (!showAdd) return
    const timer = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await resourceService.searchEmployeesForProject(projectId, searchQ)
        setSearchResults(res)
      } catch {}
      setSearching(false)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQ, showAdd, projectId])

  useEffect(() => {
    if (showAdd) {
      resourceService.searchEmployeesForProject(projectId, '').then(setSearchResults).catch(() => {})
    }
  }, [showAdd, projectId])

  const handleAdd = async (empId: string) => {
    try {
      setAddingId(empId)
      await resourceService.addMember({ project_id: projectId, employee_id: empId, role: addRole, allocation_pct: addPct })
      await loadMembers()
      resourceService.searchEmployeesForProject(projectId, searchQ).then(setSearchResults).catch(() => {})
    } catch (e: any) { alert(e.message) }
    finally { setAddingId(null) }
  }

  const handleRemove = async (mid: string) => {
    try {
      await resourceService.removeMember(mid)
      setRemoveId(null)
      await loadMembers()
    } catch (e: any) { alert(e.message) }
  }

  const handleSaveEdit = async () => {
    if (!editId) return
    setSaving(true)
    try {
      await resourceService.updateMember(editId, { role: editRole, allocation_pct: editPct })
      setEditId(null)
      await loadMembers()
    } catch (e: any) { alert(e.message) }
    finally { setSaving(false) }
  }

  const startEdit = (m: ProjectMember) => {
    setEditId(m.id)
    setEditRole(m.role)
    setEditPct(m.allocation_pct)
  }

  const ROLES: { value: ProjectMemberRole; label: string }[] = [
    { value: 'owner', label: 'PM' },
    { value: 'co_owner', label: 'Đồng QĐ' },
    { value: 'lead', label: 'Trưởng nhóm' },
    { value: 'member', label: 'Thành viên' },
    { value: 'reviewer', label: 'Reviewer' },
    { value: 'observer', label: 'Quan sát' },
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-[#1B4D3E]" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>
    )
  }

  const activeMembers = members.filter(m => m.is_active)
  const inactiveMembers = members.filter(m => !m.is_active)

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white border rounded-xl p-3 text-center">
          <div className="text-lg font-bold text-[#1B4D3E]">{stats.active}</div>
          <div className="text-[11px] text-gray-500">Thành viên</div>
        </div>
        <div className="bg-white border rounded-xl p-3 text-center">
          <div className="text-lg font-bold text-blue-600">{stats.avg}%</div>
          <div className="text-[11px] text-gray-500">TB Allocation</div>
        </div>
        <div className={`border rounded-xl p-3 text-center ${stats.over > 0 ? 'bg-red-50 border-red-200' : 'bg-white'}`}>
          <div className={`text-lg font-bold ${stats.over > 0 ? 'text-red-600' : 'text-gray-400'}`}>{stats.over}</div>
          <div className="text-[11px] text-gray-500">Quá tải</div>
        </div>
      </div>

      {/* Sub-tabs + Add button */}
      <div className="flex items-center justify-between">
        <div className="flex bg-gray-100 rounded-lg p-0.5">
          <button onClick={() => setSubTab('list')} className={`px-3 py-1.5 text-xs font-medium rounded-md ${subTab === 'list' ? 'bg-white text-[#1B4D3E] shadow-sm' : 'text-gray-500'}`}>
            <Users className="w-3.5 h-3.5 inline mr-1" />Thành viên
          </button>
          <button onClick={() => setSubTab('workload')} className={`px-3 py-1.5 text-xs font-medium rounded-md ${subTab === 'workload' ? 'bg-white text-[#1B4D3E] shadow-sm' : 'text-gray-500'}`}>
            <BarChart3 className="w-3.5 h-3.5 inline mr-1" />Workload
          </button>
        </div>
        <button onClick={() => setShowAdd(true)} className="h-9 px-3 bg-[#1B4D3E] text-white rounded-lg text-xs font-medium flex items-center gap-1.5 active:scale-95">
          <Plus className="w-4 h-4" />Thêm
        </button>
      </div>

      {/* Sub-tab: Member list */}
      {subTab === 'list' && (
        <div className="space-y-2">
          {activeMembers.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border">
              <Users className="w-10 h-10 mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500 text-sm">Chưa có thành viên</p>
            </div>
          ) : activeMembers.map(m => {
            const emp = m.employee
            const isEditing = editId === m.id
            const isRemoving = removeId === m.id
            const roleColor = MEMBER_ROLE_COLORS[m.role] || ''
            const allocColor = getAllocationColor(m.allocation_pct)

            return (
              <div key={m.id} className={`bg-white border rounded-xl p-3.5 ${isEditing ? 'ring-2 ring-[#1B4D3E]' : ''}`}>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-[#1B4D3E] flex items-center justify-center text-white font-bold text-sm shrink-0">
                    {emp?.avatar_url ? <img src={emp.avatar_url} className="w-9 h-9 rounded-full object-cover" /> : emp?.full_name?.charAt(0) || '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-gray-900 text-sm truncate">{emp?.full_name || 'N/A'}</div>
                    <div className="text-[11px] text-gray-500 truncate">{emp?.department?.name} • {emp?.position?.name}</div>
                  </div>
                  {!isEditing && !isRemoving && (
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => startEdit(m)} className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100"><Edit3 className="w-3.5 h-3.5" /></button>
                      <button onClick={() => setRemoveId(m.id)} className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  )}
                </div>

                {!isEditing && (
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${roleColor}`}>
                      {MEMBER_ROLE_LABELS[m.role] || m.role}
                    </span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${allocColor}`}>
                      {m.allocation_pct}%
                    </span>
                    {m.start_date && (
                      <span className="text-[11px] text-gray-400">
                        {new Date(m.start_date).toLocaleDateString('vi-VN')}
                        {m.end_date && ` → ${new Date(m.end_date).toLocaleDateString('vi-VN')}`}
                      </span>
                    )}
                  </div>
                )}

                {isEditing && (
                  <div className="mt-3 space-y-2 bg-gray-50 rounded-lg p-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[11px] text-gray-500 mb-0.5 block">Vai trò</label>
                        <select value={editRole} onChange={e => setEditRole(e.target.value as ProjectMemberRole)}
                          className="w-full h-10 px-2 rounded-lg border text-sm bg-white focus:ring-2 focus:ring-[#1B4D3E] outline-none">
                          {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-[11px] text-gray-500 mb-0.5 block">Phân bổ</label>
                        <div className="relative">
                          <input type="number" min={0} max={150} step={5} value={editPct} onChange={e => setEditPct(Number(e.target.value))}
                            className="w-full h-10 px-2 pr-7 rounded-lg border text-sm text-right font-mono focus:ring-2 focus:ring-[#1B4D3E] outline-none" />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-gray-400">%</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={handleSaveEdit} disabled={saving}
                        className="flex-1 h-9 bg-[#1B4D3E] text-white rounded-lg text-xs font-medium flex items-center justify-center gap-1 active:scale-[0.98] disabled:opacity-50">
                        <Check className="w-3.5 h-3.5" />{saving ? 'Lưu...' : 'Lưu'}
                      </button>
                      <button onClick={() => setEditId(null)} className="h-9 px-3 border rounded-lg text-xs text-gray-600 active:scale-[0.98]">Hủy</button>
                    </div>
                  </div>
                )}

                {isRemoving && (
                  <div className="mt-2 bg-red-50 border border-red-200 rounded-lg p-2.5 flex items-center gap-2">
                    <span className="text-xs text-red-700 flex-1">Xóa {emp?.full_name}?</span>
                    <button onClick={() => handleRemove(m.id)} className="h-8 px-3 bg-red-600 text-white rounded-lg text-xs font-medium active:scale-95">Xóa</button>
                    <button onClick={() => setRemoveId(null)} className="h-8 px-3 border rounded-lg text-xs text-gray-600 active:scale-95">Hủy</button>
                  </div>
                )}
              </div>
            )
          })}

          {inactiveMembers.length > 0 && (
            <details className="mt-3">
              <summary className="text-[11px] text-gray-400 cursor-pointer py-1">{inactiveMembers.length} đã rời</summary>
              <div className="space-y-1.5 mt-2">
                {inactiveMembers.map(m => (
                  <div key={m.id} className="bg-white border rounded-lg p-2.5 opacity-50 text-xs text-gray-500">
                    {m.employee?.full_name} — {MEMBER_ROLE_LABELS[m.role]} — Rời {m.left_at && new Date(m.left_at).toLocaleDateString('vi-VN')}
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      {/* Sub-tab: Workload */}
      {subTab === 'workload' && (
        <div className="space-y-2">
          {workloads.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border">
              <BarChart3 className="w-10 h-10 mx-auto text-gray-300 mb-3" />
              <p className="text-sm text-gray-500">Chưa có dữ liệu</p>
            </div>
          ) : workloads.map(wl => {
            const isOver = wl.is_overallocated
            const barW = Math.min(wl.total_allocation_pct, 150)
            return (
              <div key={wl.employee_id} className={`bg-white border rounded-xl p-3.5 ${isOver ? 'border-red-300' : ''}`}>
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 rounded-full bg-[#1B4D3E] flex items-center justify-center text-white text-[11px] font-bold shrink-0">
                    {wl.employee_name?.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm text-gray-900 truncate">{wl.employee_name}</div>
                    <div className="text-[11px] text-gray-500">{wl.department_name}</div>
                  </div>
                  <div className={`text-base font-bold ${isOver ? 'text-red-600' : 'text-[#1B4D3E]'}`}>{wl.total_allocation_pct}%</div>
                </div>
                <div className="relative h-4 bg-gray-100 rounded-full overflow-hidden mb-2">
                  <div className={`absolute top-0 left-0 h-full rounded-full ${isOver ? 'bg-red-500' : 'bg-[#1B4D3E]'}`}
                    style={{ width: `${(barW / 150) * 100}%` }} />
                  <div className="absolute top-0 h-full w-px bg-gray-400" style={{ left: `${(100 / 150) * 100}%` }} />
                </div>
                <div className="space-y-1">
                  {wl.projects.map((p, i) => (
                    <div key={i} className="flex items-center justify-between text-[11px]">
                      <span className="truncate text-gray-600">{p.project_code} — {p.project_name}</span>
                      <span className={`font-mono font-medium ml-2 ${p.project_id === projectId ? 'text-[#1B4D3E]' : 'text-gray-500'}`}>{p.allocation_pct}%</span>
                    </div>
                  ))}
                </div>
                {isOver && (
                  <div className="flex items-center gap-1 mt-2 text-[11px] text-red-600 bg-red-50 rounded-lg px-2 py-1">
                    <AlertTriangle className="w-3 h-3" />Quá tải {wl.total_allocation_pct - 100}%
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Add Member Modal (bottom-sheet) */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => { setShowAdd(false); setSearchQ('') }} />
          <div className="relative w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl max-h-[80vh] flex flex-col" style={{ animation: 'slideUp .25s ease-out' }}>
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-base font-bold text-gray-900">Thêm thành viên</h3>
              <button onClick={() => { setShowAdd(false); setSearchQ('') }} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100"><X className="w-5 h-5" /></button>
            </div>
            <div className="px-4 pt-3 pb-2 border-b bg-gray-50 grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-gray-500 mb-0.5 block">Vai trò</label>
                <select value={addRole} onChange={e => setAddRole(e.target.value as ProjectMemberRole)}
                  className="w-full h-10 px-2 rounded-lg border text-sm bg-white focus:ring-2 focus:ring-[#1B4D3E] outline-none">
                  {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] text-gray-500 mb-0.5 block">Phân bổ</label>
                <div className="relative">
                  <input type="number" min={0} max={150} step={5} value={addPct} onChange={e => setAddPct(Number(e.target.value))}
                    className="w-full h-10 px-2 pr-7 rounded-lg border text-sm text-right font-mono focus:ring-2 focus:ring-[#1B4D3E] outline-none" />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-gray-400">%</span>
                </div>
              </div>
            </div>
            <div className="px-4 pt-3">
              <input type="text" value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Tìm nhân viên..."
                className="w-full h-10 px-3 rounded-xl border bg-gray-50 text-sm focus:ring-2 focus:ring-[#1B4D3E] outline-none" autoFocus />
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
              {searching && <p className="text-center text-sm text-gray-400 py-6">Đang tìm...</p>}
              {!searching && searchResults.length === 0 && searchQ && <p className="text-center text-sm text-gray-400 py-6">Không tìm thấy</p>}
              {searchResults.map((emp: any) => (
                <div key={emp.id} className={`flex items-center gap-3 p-2.5 rounded-xl border ${emp.already_member ? 'opacity-50' : ''}`}>
                  <div className="w-9 h-9 rounded-full bg-[#1B4D3E] flex items-center justify-center text-white text-sm font-bold shrink-0">
                    {emp.full_name?.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">{emp.full_name}</div>
                    <div className="text-[11px] text-gray-500">{emp.employee_code} • {emp.department_name}</div>
                    {emp.current_allocation_pct > 0 && (
                      <div className={`text-[11px] ${emp.current_allocation_pct > 100 ? 'text-red-500' : 'text-gray-400'}`}>
                        Hiện: {emp.current_allocation_pct}%
                      </div>
                    )}
                  </div>
                  {emp.already_member ? (
                    <span className="text-[11px] text-gray-400 shrink-0">Đã có</span>
                  ) : (
                    <button onClick={() => handleAdd(emp.id)} disabled={addingId === emp.id}
                      className="h-9 px-3 bg-[#1B4D3E] text-white rounded-lg text-xs font-medium active:scale-95 disabled:opacity-50 shrink-0">
                      {addingId === emp.id ? '...' : 'Thêm'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>
    </div>
  )
}

// ============================================================================
// TAB: REPORTS (PM9 — Báo cáo nhanh + Export PDF)
// ============================================================================

const ReportsQuickTab: React.FC<{
  projectId: string
  project: Project
  phases: Phase[]
}> = ({ projectId, project, phases }) => {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [healthResult, setHealthResult] = useState<HealthResult | null>(null)
  const [loadingHealth, setLoadingHealth] = useState(true)
  const [exporting, setExporting] = useState(false)

  // Task stats for export
  const [taskStats, setTaskStats] = useState({ total: 0, completed: 0, in_progress: 0, overdue: 0 })
  const [milestones, setMilestones] = useState<any[]>([])
  const [risks, setRisks] = useState<any[]>([])
  const [issuesBySeverity, setIssuesBySeverity] = useState({ critical: 0, high: 0, medium: 0, low: 0 })

  useEffect(() => {
    const load = async () => {
      setLoadingHealth(true)
      try {
        // Health
        const health = await projectHealthService.calculateHealth(projectId)
        setHealthResult(health)

        // Tasks
        const { data: tasks } = await supabase
          .from('tasks').select('id, status, due_date').eq('project_id', projectId)
        const tl = tasks || []
        const now = new Date()
        setTaskStats({
          total: tl.length,
          completed: tl.filter(t => t.status === 'completed').length,
          in_progress: tl.filter(t => t.status === 'in_progress').length,
          overdue: tl.filter(t => t.due_date && new Date(t.due_date) < now && t.status !== 'completed' && t.status !== 'cancelled').length,
        })

        // Milestones (simple select)
        const { data: ms } = await supabase
          .from('project_milestones')
          .select('name, due_date, completed_date, status, phase_id')
          .eq('project_id', projectId).order('due_date')

        // Build phase name lookup from parent phases prop
        const phLookup = new Map<string, string>()
        phases.forEach(p => phLookup.set(p.id, p.name))

        setMilestones((ms || []).map((m: any) => ({
          name: m.name, due_date: m.due_date, completed_date: m.completed_date,
          status: m.status, phase_name: m.phase_id ? phLookup.get(m.phase_id) : undefined,
        })))

        // Risks (simple select — no FK hint)
        const { data: rk } = await supabase
          .from('project_risks')
          .select('code, title, probability, impact, status, owner_id')
          .eq('project_id', projectId).neq('status', 'closed').order('probability', { ascending: false }).limit(5)

        // Load risk owner names
        const riskOwnerIds = (rk || []).map((r: any) => r.owner_id).filter(Boolean)
        const riskOwnerMap = new Map<string, string>()
        if (riskOwnerIds.length > 0) {
          const { data: ownerData } = await supabase
            .from('employees').select('id, full_name').in('id', riskOwnerIds)
          ;(ownerData || []).forEach((e: any) => riskOwnerMap.set(e.id, e.full_name))
        }

        setRisks((rk || []).map((r: any) => ({
          code: r.code, title: r.title,
          score: (r.probability || 0) * (r.impact || 0),
          owner_name: r.owner_id ? riskOwnerMap.get(r.owner_id) : undefined,
        })))

        // Issues by severity
        const { data: issues } = await supabase
          .from('project_issues').select('severity').eq('project_id', projectId).in('status', ['open', 'in_progress'])
        const il = issues || []
        setIssuesBySeverity({
          critical: il.filter(i => i.severity === 'critical').length,
          high: il.filter(i => i.severity === 'high').length,
          medium: il.filter(i => i.severity === 'medium').length,
          low: il.filter(i => i.severity === 'low').length,
        })
      } catch (err) {
        console.error('Reports load error:', err)
      } finally {
        setLoadingHealth(false)
      }
    }
    load()
  }, [projectId])

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
        milestones,
        risks,
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

  if (loadingHealth) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-[#1B4D3E]" />
      </div>
    )
  }

  const hc = healthResult
  const hConfig = hc ? projectHealthService.getConfig(hc.status) : null

  return (
    <div className="space-y-4">
      {/* RAG Health Card */}
      {hc && hConfig && (
        <div className={`rounded-xl border p-4 ${hConfig.bg} ${hConfig.border}`}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[13px] font-semibold text-gray-700">Sức khỏe dự án (RAG)</h3>
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border ${hConfig.bg} ${hConfig.border}`}>
              <div className={`w-3 h-3 rounded-full ${hConfig.dot}`} />
              <span className={`text-[12px] font-bold ${hConfig.text}`}>{hConfig.label}</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-3">
            <div className="text-center">
              <div className="text-[11px] text-gray-500">Thực tế</div>
              <div className="text-[18px] font-bold font-mono" style={{ color: hConfig.color }}>{hc.actual_progress}%</div>
            </div>
            <div className="text-center">
              <div className="text-[11px] text-gray-500">Kế hoạch</div>
              <div className="text-[18px] font-bold font-mono text-gray-600">{hc.planned_progress}%</div>
            </div>
            <div className="text-center">
              <div className="text-[11px] text-gray-500">Gap</div>
              <div className={`text-[18px] font-bold font-mono ${hc.gap >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {hc.gap > 0 ? '+' : ''}{hc.gap}%
              </div>
            </div>
          </div>

          {/* Adjustments */}
          {hc.adjustments.length > 0 && (
            <div className="space-y-1 pt-2 border-t border-white/40">
              {hc.adjustments.map((adj, i) => (
                <div key={i} className="flex items-center gap-2 text-[11px]">
                  <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
                  <span className="text-gray-600">{adj.reason}</span>
                  <span className="font-mono text-red-600 ml-auto">{adj.impact}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Quick Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-gray-100 p-3 text-center">
          <div className="text-[18px] font-bold font-mono text-emerald-600">{taskStats.completed}/{taskStats.total}</div>
          <div className="text-[11px] text-gray-500">Tasks xong</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-3 text-center">
          <div className="text-[18px] font-bold font-mono text-blue-600">{taskStats.in_progress}</div>
          <div className="text-[11px] text-gray-500">Đang làm</div>
        </div>
        <div className={`rounded-xl border p-3 text-center ${taskStats.overdue > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-gray-100'}`}>
          <div className={`text-[18px] font-bold font-mono ${taskStats.overdue > 0 ? 'text-red-600' : 'text-gray-400'}`}>{taskStats.overdue}</div>
          <div className="text-[11px] text-gray-500">Quá hạn</div>
        </div>
        <div className={`rounded-xl border p-3 text-center ${risks.length > 0 ? 'bg-orange-50 border-orange-200' : 'bg-white border-gray-100'}`}>
          <div className={`text-[18px] font-bold font-mono ${risks.length > 0 ? 'text-orange-600' : 'text-gray-400'}`}>{risks.length}</div>
          <div className="text-[11px] text-gray-500">Rủi ro</div>
        </div>
      </div>

      {/* Export Actions */}
      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <h3 className="text-[13px] font-semibold text-gray-700 mb-3">Xuất báo cáo</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <button
            onClick={handleExportPDF}
            disabled={exporting}
            className="flex items-center justify-center gap-2 py-3 rounded-xl bg-[#1B4D3E] text-white text-[13px] font-semibold active:scale-[0.98] disabled:opacity-50"
          >
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
            Status Report (PDF)
          </button>
          <button
            onClick={() => navigate('/projects/reports')}
            className="flex items-center justify-center gap-2 py-3 rounded-xl border border-gray-200 text-gray-700 text-[13px] font-medium active:scale-[0.98]"
          >
            <FileText className="w-4 h-4" />
            Báo cáo chi tiết
          </button>
          <button
            onClick={() => navigate('/projects/reports')}
            className="flex items-center justify-center gap-2 py-3 rounded-xl border border-gray-200 text-gray-700 text-[13px] font-medium active:scale-[0.98]"
          >
            <FolderKanban className="w-4 h-4" />
            Portfolio Report
          </button>
        </div>
      </div>

      {/* Phases Progress */}
      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <h3 className="text-[13px] font-semibold text-gray-700 mb-3">Tiến độ theo Phase</h3>
        <div className="space-y-2.5">
          {phases.map((ph, i) => (
            <div key={i}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: ph.color || '#6B7280' }} />
                  <span className="text-[12px] font-medium text-gray-700">{ph.name}</span>
                </div>
                <span className="text-[12px] font-bold font-mono text-gray-600">{ph.progress_pct}%</span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${ph.progress_pct}%`, backgroundColor: ph.color || '#6B7280' }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// TAB: PLACEHOLDER (for PM10-PM11)
// ============================================================================

const PlaceholderTab: React.FC<{ tabName: string; phase: string }> = ({ tabName, phase }) => (
  <div className="flex flex-col items-center justify-center py-16 text-center">
    <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
      <FolderKanban className="w-8 h-8 text-gray-300" />
    </div>
    <h3 className="text-[15px] font-semibold text-gray-600 mb-1">{tabName}</h3>
    <p className="text-[13px] text-gray-400">Sẽ triển khai trong {phase}</p>
  </div>
)

// ============================================================================
// TAB: ACTIVITY
// ============================================================================

const ActivityTab: React.FC<{ activities: ActivityItem[] }> = ({ activities }) => (
  <div className="bg-white rounded-xl border border-gray-100 p-4">
    <div className="space-y-4">
      {activities.map((act, idx) => (
        <div key={act.id} className="flex gap-3">
          <div className="flex flex-col items-center">
            <div className="w-3 h-3 rounded-full bg-[#1B4D3E] border-2 border-white ring-2 ring-[#1B4D3E]/20 shrink-0" />
            {idx < activities.length - 1 && <div className="w-0.5 flex-1 bg-gray-200 mt-1" />}
          </div>
          <div className="flex-1 pb-4 min-w-0">
            <p className="text-[13px] text-gray-800">{act.description}</p>
            <p className="text-[11px] text-gray-400 mt-1">
              {act.actor?.full_name} • {timeAgo(act.created_at)}
            </p>
          </div>
        </div>
      ))}
    </div>
  </div>
)

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const ProjectDetailPage: React.FC = () => {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()

  // ✅ Real data state — no more mock
  const [project, setProject] = useState<Project>(DEFAULT_PROJECT)
  const [stats, setStats] = useState<ProjectStats>(DEFAULT_STATS)
  const [phases, setPhases] = useState<Phase[]>([])
  const [milestones, setMilestones] = useState<MilestoneItem[]>([])
  const [activities, setActivities] = useState<ActivityItem[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabKey>('overview')
  const [showStatusMenu, setShowStatusMenu] = useState(false)
  const [realProjectId, setRealProjectId] = useState<string | null>(null)

  // ========================================================================
  // LOAD ALL REAL DATA FROM SUPABASE
  // ========================================================================

  useEffect(() => {
    if (!id) return
    const loadProject = async () => {
      setLoading(true)
      try {
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)

        // ── 1. Load project base ──
        let data: any = null
        let err: any = null

        const PROJECT_SELECT = `
          id, code, name, description, status, priority,
          planned_start, planned_end, actual_start, actual_end,
          progress_pct, budget_planned, budget_actual, budget_currency,
          owner_id, sponsor_id, department_id, category_id, tags,
          created_at, updated_at
        `

        if (isUUID) {
          const res = await supabase.from('projects').select(PROJECT_SELECT).eq('id', id).single()
          data = res.data; err = res.error
        } else {
          const res = await supabase.from('projects').select(PROJECT_SELECT).eq('code', id).maybeSingle()
          if (res.data) { data = res.data; err = res.error }
          else {
            const res2 = await supabase.from('projects').select(PROJECT_SELECT).order('created_at').limit(1).maybeSingle()
            data = res2.data; err = res2.error
          }
        }

        if (err || !data) {
          console.error('Project load error:', err)
          setLoading(false)
          return
        }

        const projectId = data.id
        setRealProjectId(projectId)

        // ── 2. Parallel load: owner, sponsor, department, category ──
        const [ownerRes, sponsorRes, deptRes, catRes] = await Promise.all([
          data.owner_id
            ? supabase.from('employees').select('id, full_name').eq('id', data.owner_id).maybeSingle()
            : Promise.resolve({ data: null }),
          data.sponsor_id
            ? supabase.from('employees').select('id, full_name').eq('id', data.sponsor_id).maybeSingle()
            : Promise.resolve({ data: null }),
          data.department_id
            ? supabase.from('departments').select('id, name').eq('id', data.department_id).maybeSingle()
            : Promise.resolve({ data: null }),
          data.category_id
            ? supabase.from('project_categories').select('id, name, color').eq('id', data.category_id).maybeSingle()
            : Promise.resolve({ data: null }),
        ])

        setProject({
          id: projectId,
          code: data.code,
          name: data.name,
          description: data.description || '',
          status: data.status || 'draft',
          priority: data.priority || 'medium',
          planned_start: data.planned_start || '',
          planned_end: data.planned_end || '',
          actual_start: data.actual_start || undefined,
          actual_end: data.actual_end || undefined,
          progress_pct: Number(data.progress_pct) || 0,
          budget_planned: Number(data.budget_planned) || 0,
          budget_actual: Number(data.budget_actual) || 0,
          budget_currency: data.budget_currency || 'VND',
          tags: data.tags || [],
          created_at: data.created_at,
          updated_at: data.updated_at,
          owner: ownerRes.data ? { id: ownerRes.data.id, full_name: ownerRes.data.full_name } : undefined,
          sponsor: sponsorRes.data ? { id: sponsorRes.data.id, full_name: sponsorRes.data.full_name } : undefined,
          department: deptRes.data ? { id: deptRes.data.id, name: deptRes.data.name } : undefined,
          category: catRes.data ? { id: catRes.data.id, name: catRes.data.name, color: catRes.data.color || '#3B82F6' } : undefined,
        })

        // ── 3. Parallel load: phases, milestones, activities, stats ──
        const [phasesRes, milestonesRes, activitiesRes, membersRes, risksRes, issuesRes] = await Promise.all([
          // Phases
          supabase.from('project_phases')
            .select('*')
            .eq('project_id', projectId)
            .order('order_index', { ascending: true }),
          // Milestones (simple select — no FK hints to avoid constraint name issues)
          supabase.from('project_milestones')
            .select('id, name, due_date, completed_date, status, assignee_id, phase_id')
            .eq('project_id', projectId)
            .order('due_date', { ascending: true }),
          // Activities (simple select — no FK hints)
          supabase.from('project_activities')
            .select('id, action, description, created_at, actor_id')
            .eq('project_id', projectId)
            .order('created_at', { ascending: false })
            .limit(20),
          // Members count
          supabase.from('project_members')
            .select('id', { count: 'exact', head: true })
            .eq('project_id', projectId)
            .eq('is_active', true),
          // Risks count
          supabase.from('project_risks')
            .select('id', { count: 'exact', head: true })
            .eq('project_id', projectId)
            .not('status', 'in', '("closed","resolved")'),
          // Open issues count
          supabase.from('project_issues')
            .select('id', { count: 'exact', head: true })
            .eq('project_id', projectId)
            .in('status', ['open', 'in_progress', 'escalated']),
        ])

        // Set phases
        const phasesData = phasesRes.data || []
        setPhases(phasesData.map((p: any) => ({
          id: p.id,
          project_id: projectId,
          name: p.name,
          description: p.description || '',
          order_index: p.order_index ?? p.sort_order ?? 0,
          status: p.status || 'pending',
          progress_pct: Number(p.progress_pct) || 0,
          planned_start: p.planned_start || '',
          planned_end: p.planned_end || '',
          color: p.color || '#1B4D3E',
        })))

        // Build lookup maps for client-side joins
        const empIds = new Set<string>()
        const msData = milestonesRes.data || []
        const actData = activitiesRes.data || []
        msData.forEach((m: any) => { if (m.assignee_id) empIds.add(m.assignee_id) })
        actData.forEach((a: any) => { if (a.actor_id) empIds.add(a.actor_id) })

        // Load employees for milestones + activities
        const empMap = new Map<string, { id: string; full_name: string }>()
        if (empIds.size > 0) {
          const { data: empData } = await supabase
            .from('employees').select('id, full_name')
            .in('id', Array.from(empIds))
          ;(empData || []).forEach((e: any) => empMap.set(e.id, { id: e.id, full_name: e.full_name }))
        }

        // Build phase lookup for milestones
        const phaseMap = new Map<string, { id: string; name: string }>()
        phasesData.forEach((p: any) => phaseMap.set(p.id, { id: p.id, name: p.name }))

        // Set milestones (client-side join)
        setMilestones(msData.map((m: any) => ({
          id: m.id,
          name: m.name,
          due_date: m.due_date,
          completed_date: m.completed_date || undefined,
          status: m.status || 'pending',
          assignee: m.assignee_id ? empMap.get(m.assignee_id) : undefined,
          phase: m.phase_id ? phaseMap.get(m.phase_id) : undefined,
        })))

        // Set activities (client-side join)
        setActivities(actData.map((a: any) => ({
          id: a.id,
          action: a.action,
          description: a.description || '',
          actor: a.actor_id ? empMap.get(a.actor_id) : undefined,
          created_at: a.created_at,
        })))

        // Set stats (real counts)
        const msCompleted = msData.filter((m: any) => m.status === 'completed').length
        setStats({
          phase_count: phasesData.length,
          milestone_count: msData.length,
          milestone_completed: msCompleted,
          member_count: membersRes.count || 0,
          risk_count: risksRes.count || 0,
          open_issues: issuesRes.count || 0,
        })

      } catch (e) {
        console.error('Failed to load project:', e)
      } finally {
        setLoading(false)
      }
    }
    loadProject()
  }, [id])

  // ========================================================================
  // RELOAD PHASES (called after add/delete/update)
  // ========================================================================

  const loadPhases = useCallback(async () => {
    if (!realProjectId) return
    try {
      const { data } = await supabase
        .from('project_phases')
        .select('*')
        .eq('project_id', realProjectId)
        .order('order_index', { ascending: true })

      const phasesData = data || []
      setPhases(phasesData.map((p: any) => ({
        id: p.id,
        project_id: realProjectId,
        name: p.name,
        description: p.description || '',
        order_index: p.order_index ?? p.sort_order ?? 0,
        status: p.status || 'pending',
        progress_pct: Number(p.progress_pct) || 0,
        planned_start: p.planned_start || '',
        planned_end: p.planned_end || '',
        color: p.color || '#1B4D3E',
      })))

      // Update stats phase_count
      setStats(prev => ({ ...prev, phase_count: phasesData.length }))
    } catch (e) {
      console.error('Failed to reload phases:', e)
    }
  }, [realProjectId])

  const allowedTransitions = VALID_TRANSITIONS[project.status] || []

  const handleStatusChange = async (newStatus: ProjectStatus) => {
    setShowStatusMenu(false)
    try {
      if (realProjectId) {
        await supabase.from('projects')
          .update({ status: newStatus, updated_at: new Date().toISOString() })
          .eq('id', realProjectId)
      }
      setProject(prev => ({ ...prev, status: newStatus }))
    } catch (e) {
      console.error('Status update failed:', e)
    }
  }

  const handlePhaseStatusUpdate = async (phaseId: string, status: PhaseStatus) => {
    try {
      const progress = status === 'completed' ? 100 : undefined
      await supabase.from('project_phases')
        .update({
          status,
          ...(progress !== undefined ? { progress_pct: progress } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq('id', phaseId)
      await loadPhases()
    } catch (e) {
      console.error('Phase status update failed:', e)
    }
  }

  const handlePhaseDelete = async (phaseId: string) => {
    if (!confirm('Xóa giai đoạn này?')) return
    try {
      await supabase.from('project_phases').delete().eq('id', phaseId)
      await loadPhases()
    } catch (e) {
      console.error('Phase delete failed:', e)
    }
  }

  // ✅ PM9: Use projectHealthService for simple health (no DB call in header)
  const getHealthStatus = () => {
    if (!project.planned_start || !project.planned_end) return null
    const simpleHealth = projectHealthService.calculateHealthSimple(
      project.progress_pct, project.planned_start, project.planned_end
    )
    const config = projectHealthService.getConfig(simpleHealth)
    return { label: config.label, color: config.text, bg: config.bg }
  }

  const health = getHealthStatus()

  // ============================================================================
  // RENDER
  // ============================================================================

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F7F5F2] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-[#1B4D3E] mx-auto mb-3" />
          <p className="text-[13px] text-gray-500">Đang tải dự án...</p>
        </div>
      </div>
    )
  }

  if (!project.id) {
    return (
      <div className="min-h-screen bg-[#F7F5F2] flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-[15px] font-medium text-gray-600 mb-1">Không tìm thấy dự án</p>
          <button onClick={() => navigate('/projects/list')} className="text-[13px] text-[#1B4D3E] hover:underline">
            ← Về danh sách
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F7F5F2]">
      {/* ===== HEADER ===== */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="flex items-center h-14 gap-3">
            <button onClick={() => navigate('/projects/list')} className="p-2 -ml-2 rounded-xl active:bg-gray-100">
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <div className="flex-1 min-w-0">
              <span className="text-[12px] font-bold text-gray-400" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                {project.code}
              </span>
            </div>
            <button
              onClick={() => navigate(`/projects/${realProjectId || id}/edit`)}
              className="p-2 rounded-xl active:bg-gray-100"
            >
              <Edit3 className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          <div className="pb-3">
            <h1 className="text-[18px] sm:text-[20px] font-bold text-gray-900 leading-snug mb-2">
              {project.name}
            </h1>
            <div className="flex items-center flex-wrap gap-2">
              <div className="relative">
                <button
                  onClick={() => allowedTransitions.length > 0 && setShowStatusMenu(!showStatusMenu)}
                  disabled={allowedTransitions.length === 0}
                  className="disabled:cursor-default"
                >
                  <StatusBadge status={project.status} size="md" />
                  {allowedTransitions.length > 0 && <ChevronDown className="inline w-3 h-3 ml-0.5 text-current" />}
                </button>

                {showStatusMenu && (
                  <div className="absolute z-50 mt-1 left-0 bg-white border border-gray-200 rounded-xl shadow-lg py-1 min-w-[160px]">
                    {allowedTransitions.map(s => (
                      <button
                        key={s}
                        onClick={() => handleStatusChange(s)}
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-[13px] hover:bg-gray-50"
                      >
                        {STATUS_CONFIG[s].icon}
                        <span>{STATUS_CONFIG[s].label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <PriorityDot priority={project.priority} />

              {project.category && (
                <span
                  className="px-2 py-0.5 text-[11px] font-medium rounded-md"
                  style={{ backgroundColor: project.category.color + '20', color: project.category.color }}
                >
                  {project.category.name}
                </span>
              )}

              {health && (
                <span className={`px-2 py-0.5 text-[11px] font-semibold rounded-md ${health.bg} ${health.color}`}>
                  {health.label}
                </span>
              )}
            </div>
          </div>

          <div className="pb-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[11px] text-gray-500">Tiến độ</span>
              <span className="text-[14px] font-bold text-gray-800" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                {project.progress_pct.toFixed(1)}%
              </span>
            </div>
            <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${getProgressColor(project.progress_pct)}`}
                style={{ width: `${project.progress_pct}%` }}
              />
            </div>
            <div className="flex gap-0.5 mt-1.5">
              {phases.map(p => (
                <div key={p.id} className="flex-1 group relative">
                  <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${p.progress_pct}%`, backgroundColor: p.color || '#9CA3AF' }}
                    />
                  </div>
                  <div className="invisible group-hover:visible absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-gray-800 text-white text-[10px] rounded-md whitespace-nowrap z-10">
                    {p.name}: {p.progress_pct}%
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-4 pb-3 text-[12px] text-gray-500">
            <span className="inline-flex items-center gap-1.5">
              <Crown className="w-3.5 h-3.5 text-[#1B4D3E]" />
              {project.owner?.full_name}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              {formatDate(project.planned_start)} → {formatDate(project.planned_end)}
            </span>
          </div>

          {/* ===== TAB NAVIGATION ===== */}
          <div className="flex gap-0.5 overflow-x-auto -mx-4 px-4 scrollbar-hide">
            {TABS.map(tab => {
              const isActive = activeTab === tab.key
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`
                    inline-flex items-center gap-1.5 px-3.5 py-2.5
                    text-[12px] font-semibold whitespace-nowrap
                    border-b-2 transition-colors
                    ${isActive
                      ? 'border-[#1B4D3E] text-[#1B4D3E]'
                      : 'border-transparent text-gray-500 active:text-gray-700'
                    }
                  `}
                >
                  {tab.icon}
                  <span className="hidden sm:inline">{tab.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* ===== TAB CONTENT ===== */}
      <div className={`mx-auto py-5 ${activeTab === 'gantt' ? 'max-w-7xl px-3 sm:px-4' : 'max-w-5xl px-4 sm:px-6'}`}>
        {activeTab === 'overview' && (
          <OverviewTab project={project} stats={stats} milestones={milestones} activities={activities} />
        )}

        {activeTab === 'phases' && (
          <PhasesTab
            phases={phases}
            projectId={realProjectId || ''}
            onRefresh={loadPhases}
            onUpdateStatus={handlePhaseStatusUpdate}
            onDelete={handlePhaseDelete}
          />
        )}

        {activeTab === 'gantt' && realProjectId && (
          <GanttTab
            projectId={realProjectId}
            projectCode={project.code}
            onNavigateFullPage={() => navigate(`/projects/${realProjectId}/gantt`)}
          />
        )}

        {activeTab === 'activity' && (
          <ActivityTab activities={activities} />
        )}

        {/* ✅ PM5: Resources tab */}
        {activeTab === 'resources' && realProjectId && (
          <ResourcesTab projectId={realProjectId} />
        )}
        {activeTab === 'resources' && !realProjectId && !loading && (
          <div className="text-center py-12 text-gray-400 text-sm">Đang tải dự án...</div>
        )}

        {/* ✅ PM6: Tasks tab */}
        {activeTab === 'tasks' && realProjectId && (
          <ProjectTasksPage
            projectId={realProjectId}
            projectName={project.name}
            onNavigateToTask={(taskId) => navigate(`/tasks/${taskId}`)}
          />
        )}

        {/* ✅ PM7: Risks & Issues tab */}
        {activeTab === 'risks' && realProjectId && (
          <ProjectRiskPage
            projectId={realProjectId}
          />
        )}

        {/* ✅ PM8: Documents & Files tab */}
        {activeTab === 'docs' && (realProjectId || id) && (
          <ProjectDocsTab
            projectId={realProjectId || id || ''}
            phases={phases.map(p => ({ id: p.id, name: p.name }))}
          />
        )}

        {/* ✅ PM9: Reports & Health tab */}
        {activeTab === 'reports' && realProjectId && (
          <ReportsQuickTab
            projectId={realProjectId}
            project={project}
            phases={phases}
          />
        )}

        {/* Placeholder tabs for future phases */}
        {['budget'].includes(activeTab) && (
          <PlaceholderTab
            tabName={TABS.find(t => t.key === activeTab)?.label || ''}
            phase={TABS.find(t => t.key === activeTab)?.phase || ''}
          />
        )}
      </div>

      {showStatusMenu && (
        <div className="fixed inset-0 z-40" onClick={() => setShowStatusMenu(false)} />
      )}
    </div>
  )
}

export default ProjectDetailPage