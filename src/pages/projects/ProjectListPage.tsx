// ============================================================================
// FILE: src/pages/projects/ProjectListPage.tsx
// MODULE: Quản lý Dự án — Huy Anh Rubber ERP
// PHASE: PM3 — Bước 3.4 (Updated: Real data from Supabase)
// ============================================================================
// ✅ UPDATED: All mock data replaced with real Supabase queries
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react'
import {
  Search,
  Plus,
  FolderKanban,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  X,
  Calendar,
  Users,
  BarChart3,
  Filter,
  ArrowLeft,
  LayoutGrid,
  LayoutList,
  Clock,
  AlertTriangle,
  CheckCircle2,
  PauseCircle,
  FileEdit,
  Ban,
  Target,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

// ============================================================================
// TYPES
// ============================================================================

type ProjectStatus = 'draft' | 'planning' | 'approved' | 'in_progress' | 'on_hold' | 'completed' | 'cancelled'
type ProjectPriority = 'critical' | 'high' | 'medium' | 'low'

interface ProjectCategory {
  id: string
  name: string
  color: string
  icon?: string
}

interface ProjectListItem {
  id: string
  code: string
  name: string
  description?: string
  category_id?: string
  category?: ProjectCategory
  planned_start?: string
  planned_end?: string
  actual_start?: string
  actual_end?: string
  status: ProjectStatus
  priority: ProjectPriority
  progress_pct: number
  budget_planned: number
  budget_currency: string
  owner_id?: string
  owner?: { id: string; full_name: string }
  department?: { id: string; name: string }
  tags?: string[]
  created_at: string
  updated_at: string
}

interface PaginationInfo {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

// ============================================================================
// CONSTANTS
// ============================================================================

const STATUS_TABS = [
  { key: 'all',         label: 'Tất cả',      icon: FolderKanban },
  { key: 'in_progress', label: 'Đang chạy',   icon: BarChart3 },
  { key: 'planning',    label: 'Lập kế hoạch', icon: FileEdit },
  { key: 'completed',   label: 'Hoàn thành',  icon: CheckCircle2 },
  { key: 'on_hold',     label: 'Tạm dừng',    icon: PauseCircle },
] as const

const STATUS_CONFIG: Record<ProjectStatus, {
  label: string
  className: string
  borderColor: string
  icon: React.ReactNode
}> = {
  draft: {
    label: 'Nháp',
    className: 'bg-gray-50 text-gray-600 border-gray-200',
    borderColor: '#9CA3AF',
    icon: <FileEdit className="w-3 h-3" />,
  },
  planning: {
    label: 'Lập KH',
    className: 'bg-blue-50 text-blue-600 border-blue-200',
    borderColor: '#2563EB',
    icon: <Target className="w-3 h-3" />,
  },
  approved: {
    label: 'Đã duyệt',
    className: 'bg-indigo-50 text-indigo-600 border-indigo-200',
    borderColor: '#4F46E5',
    icon: <CheckCircle2 className="w-3 h-3" />,
  },
  in_progress: {
    label: 'Đang chạy',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    borderColor: '#16A34A',
    icon: <BarChart3 className="w-3 h-3" />,
  },
  on_hold: {
    label: 'Tạm dừng',
    className: 'bg-amber-50 text-amber-600 border-amber-200',
    borderColor: '#F59E0B',
    icon: <PauseCircle className="w-3 h-3" />,
  },
  completed: {
    label: 'Hoàn thành',
    className: 'bg-green-50 text-green-700 border-green-200',
    borderColor: '#16A34A',
    icon: <CheckCircle2 className="w-3 h-3" />,
  },
  cancelled: {
    label: 'Đã hủy',
    className: 'bg-red-50 text-red-600 border-red-200',
    borderColor: '#DC2626',
    icon: <Ban className="w-3 h-3" />,
  },
}

const PRIORITY_CONFIG: Record<ProjectPriority, {
  label: string
  color: string
  borderColor: string
  dotColor: string
}> = {
  critical: { label: 'Khẩn cấp', color: 'text-red-600',    borderColor: '#DC2626', dotColor: 'bg-red-500' },
  high:     { label: 'Cao',      color: 'text-orange-600', borderColor: '#EA580C', dotColor: 'bg-orange-500' },
  medium:   { label: 'Trung bình', color: 'text-blue-600',  borderColor: '#2563EB', dotColor: 'bg-blue-500' },
  low:      { label: 'Thấp',     color: 'text-gray-500',   borderColor: '#9CA3AF', dotColor: 'bg-gray-400' },
}

const SORT_OPTIONS = [
  { key: 'created_at_desc',   label: 'Mới nhất' },
  { key: 'planned_end_asc',   label: 'Deadline gần' },
  { key: 'progress_pct_desc', label: 'Tiến độ cao → thấp' },
  { key: 'progress_pct_asc',  label: 'Tiến độ thấp → cao' },
  { key: 'name_asc',          label: 'Tên A → Z' },
]

// ============================================================================
// HELPERS
// ============================================================================

function formatDate(dateStr?: string): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatShortDate(dateStr?: string): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })
}

function formatBudget(amount: number, currency: string = 'VND'): string {
  if (!amount) return '—'
  if (amount >= 1_000_000_000) return `${(amount / 1_000_000_000).toFixed(1)} tỷ`
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(0)} triệu`
  return amount.toLocaleString('vi-VN') + ' ' + currency
}

function getDaysRemaining(endDateStr?: string): { days: number; label: string; color: string } | null {
  if (!endDateStr) return null
  const end = new Date(endDateStr)
  const now = new Date()
  const diffMs = end.getTime() - now.getTime()
  const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

  if (days < 0) return { days: Math.abs(days), label: `Trễ ${Math.abs(days)} ngày`, color: 'text-red-600' }
  if (days === 0) return { days: 0, label: 'Hôm nay', color: 'text-red-600' }
  if (days <= 7) return { days, label: `Còn ${days} ngày`, color: 'text-amber-600' }
  if (days <= 30) return { days, label: `Còn ${days} ngày`, color: 'text-blue-600' }
  return { days, label: `Còn ${days} ngày`, color: 'text-gray-500' }
}

function getProgressColor(pct: number, status: ProjectStatus): string {
  if (status === 'completed') return 'bg-green-500'
  if (status === 'on_hold') return 'bg-amber-400'
  if (status === 'cancelled') return 'bg-gray-300'
  if (pct >= 75) return 'bg-emerald-500'
  if (pct >= 40) return 'bg-blue-500'
  if (pct >= 10) return 'bg-amber-500'
  return 'bg-gray-300'
}

/** Parse sort key → { column, ascending } for Supabase .order() */
function parseSortKey(key: string): { column: string; ascending: boolean } {
  if (key === 'created_at_desc')   return { column: 'created_at', ascending: false }
  if (key === 'planned_end_asc')   return { column: 'planned_end', ascending: true }
  if (key === 'progress_pct_desc') return { column: 'progress_pct', ascending: false }
  if (key === 'progress_pct_asc')  return { column: 'progress_pct', ascending: true }
  if (key === 'name_asc')          return { column: 'name', ascending: true }
  return { column: 'created_at', ascending: false }
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

const StatusBadge: React.FC<{ status: ProjectStatus }> = ({ status }) => {
  const conf = STATUS_CONFIG[status]
  return (
    <span className={`
      inline-flex items-center gap-1
      px-2.5 py-1 text-[11px] font-semibold leading-none
      rounded-full border ${conf.className}
    `}>
      {conf.icon}
      {conf.label}
    </span>
  )
}

const PriorityBadge: React.FC<{ priority: ProjectPriority; compact?: boolean }> = ({ priority, compact }) => {
  const conf = PRIORITY_CONFIG[priority]
  return (
    <span className={`inline-flex items-center gap-1.5 ${conf.color}`}>
      <span className={`w-2 h-2 rounded-full ${conf.dotColor}`} />
      {!compact && <span className="text-[12px] font-medium">{conf.label}</span>}
    </span>
  )
}

const CategoryTag: React.FC<{ category?: ProjectCategory }> = ({ category }) => {
  if (!category) return null
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-md"
      style={{
        backgroundColor: category.color + '15',
        color: category.color,
      }}
    >
      {category.name}
    </span>
  )
}

const ProgressBar: React.FC<{ pct: number; status: ProjectStatus; showLabel?: boolean }> = ({
  pct, status, showLabel = true,
}) => {
  const color = getProgressColor(pct, status)
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
        />
      </div>
      {showLabel && (
        <span
          className="text-[13px] font-semibold text-gray-700 tabular-nums min-w-[40px] text-right"
          style={{ fontFamily: "'JetBrains Mono', monospace" }}
        >
          {pct.toFixed(0)}%
        </span>
      )}
    </div>
  )
}

// ============================================================================
// PROJECT CARD — Mobile / Card view
// ============================================================================

const ProjectCard: React.FC<{
  project: ProjectListItem
  onTap: (id: string) => void
}> = ({ project, onTap }) => {
  const priorityConf = PRIORITY_CONFIG[project.priority]
  const deadline = getDaysRemaining(project.planned_end)

  return (
    <button
      type="button"
      onClick={() => onTap(project.id)}
      className="
        w-full text-left bg-white
        rounded-[14px] border border-gray-100
        shadow-[0_1px_2px_rgba(0,0,0,0.05)]
        active:scale-[0.98] transition-transform duration-150
        overflow-hidden
      "
    >
      <div className="flex">
        <div
          className="w-1.5 shrink-0 rounded-l-[14px]"
          style={{ backgroundColor: priorityConf.borderColor }}
        />
        <div className="flex-1 p-4 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span
              className="text-[14px] font-bold text-gray-500 tracking-tight"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >
              {project.code}
            </span>
            <StatusBadge status={project.status} />
          </div>
          <h3 className="text-[15px] font-semibold text-gray-900 leading-snug line-clamp-2 mb-2">
            {project.name}
          </h3>
          <div className="flex items-center gap-2 flex-wrap mb-3">
            <CategoryTag category={project.category} />
            <PriorityBadge priority={project.priority} />
          </div>
          <div className="mb-3">
            <ProgressBar pct={project.progress_pct} status={project.status} />
          </div>
          <div className="flex items-center justify-between text-[12px] text-gray-500">
            <span className="inline-flex items-center gap-1.5 truncate">
              <Users className="w-3.5 h-3.5 text-gray-400" />
              <span className="truncate">{project.owner?.full_name || '—'}</span>
            </span>
            {deadline && (
              <span className={`inline-flex items-center gap-1 font-medium ${deadline.color}`}>
                <Clock className="w-3.5 h-3.5" />
                {deadline.label}
              </span>
            )}
            {!deadline && project.planned_end && (
              <span className="inline-flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                {formatShortDate(project.planned_end)}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center pr-3">
          <ChevronRight className="w-5 h-5 text-gray-300" />
        </div>
      </div>
    </button>
  )
}

// ============================================================================
// TABLE ROW — Desktop view
// ============================================================================

const ProjectTableRow: React.FC<{
  project: ProjectListItem
  onTap: (id: string) => void
}> = ({ project, onTap }) => {
  const deadline = getDaysRemaining(project.planned_end)

  return (
    <tr
      onClick={() => onTap(project.id)}
      className="cursor-pointer border-b border-gray-50 hover:bg-gray-50/50 transition-colors"
    >
      <td className="px-4 py-3">
        <span
          className="text-[13px] font-bold text-[#1B4D3E] tracking-tight"
          style={{ fontFamily: "'JetBrains Mono', monospace" }}
        >
          {project.code}
        </span>
      </td>
      <td className="px-4 py-3 max-w-[300px]">
        <div>
          <p className="text-[14px] font-semibold text-gray-900 truncate leading-snug">
            {project.name}
          </p>
          <div className="mt-0.5">
            <CategoryTag category={project.category} />
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <span className="text-[13px] text-gray-700">
          {project.owner?.full_name || '—'}
        </span>
      </td>
      <td className="px-4 py-3 min-w-[160px]">
        <ProgressBar pct={project.progress_pct} status={project.status} />
      </td>
      <td className="px-4 py-3">
        <StatusBadge status={project.status} />
      </td>
      <td className="px-4 py-3">
        <PriorityBadge priority={project.priority} />
      </td>
      <td className="px-4 py-3 text-right">
        <div className="text-[13px]">
          <span className="text-gray-700">{formatShortDate(project.planned_end)}</span>
          {deadline && (
            <p className={`text-[11px] font-medium mt-0.5 ${deadline.color}`}>
              {deadline.label}
            </p>
          )}
        </div>
      </td>
      <td className="px-2 py-3">
        <ChevronRight className="w-4 h-4 text-gray-300" />
      </td>
    </tr>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const ProjectListPage: React.FC = () => {
  const navigate = useNavigate()

  // State
  const [projects, setProjects] = useState<ProjectListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<'card' | 'table'>('card')
  const [activeTab, setActiveTab] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortKey, setSortKey] = useState('created_at_desc')
  const [showFilters, setShowFilters] = useState(false)
  const [priorityFilter, setPriorityFilter] = useState<string>('all')
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1, pageSize: 20, total: 0, totalPages: 0,
  })

  // ✅ Summary counts — loaded from Supabase
  const [allCount, setAllCount] = useState(0)
  const [runningCount, setRunningCount] = useState(0)
  const [overdueCount, setOverdueCount] = useState(0)

  // ---- Responsive: auto switch to table on desktop ----
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const handler = (e: MediaQueryListEvent | MediaQueryList) => {
      setViewMode(e.matches ? 'table' : 'card')
    }
    handler(mq)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // ========================================================================
  // LOAD PROJECTS FROM SUPABASE
  // ========================================================================

  const loadProjects = useCallback(async () => {
    setLoading(true)
    try {
      // Build query — simple select without FK hint joins to avoid constraint name issues
      let query = supabase
        .from('projects')
        .select(`
          id, code, name, description,
          category_id,
          planned_start, planned_end, actual_start, actual_end,
          status, priority, progress_pct,
          budget_planned, budget_currency,
          owner_id,
          department_id,
          tags,
          created_at, updated_at
        `)

      // Filter by status tab
      if (activeTab !== 'all') {
        query = query.eq('status', activeTab)
      }

      // Filter by priority
      if (priorityFilter !== 'all') {
        query = query.eq('priority', priorityFilter)
      }

      // Search — use ilike for text search
      if (searchQuery.trim()) {
        const q = `%${searchQuery.trim()}%`
        query = query.or(`name.ilike.${q},code.ilike.${q}`)
      }

      // Sort
      const { column, ascending } = parseSortKey(sortKey)
      query = query.order(column, { ascending, nullsFirst: false })

      // Execute
      const { data, error, count } = await query

      if (error) {
        console.error('[ProjectList] Query error:', error)
        throw error
      }

      // Load lookup tables for client-side join
      const [catRes, empRes, deptRes] = await Promise.all([
        supabase.from('project_categories').select('id, name, color'),
        supabase.from('employees').select('id, full_name'),
        supabase.from('departments').select('id, name'),
      ])

      const catMap = new Map((catRes.data || []).map((c: any) => [c.id, { id: c.id, name: c.name, color: c.color || '#6B7280' }]))
      const empMap = new Map((empRes.data || []).map((e: any) => [e.id, { id: e.id, full_name: e.full_name }]))
      const deptMap = new Map((deptRes.data || []).map((d: any) => [d.id, { id: d.id, name: d.name }]))

      // Normalize with client-side joins
      const normalized: ProjectListItem[] = (data || []).map((p: any) => ({
        ...p,
        progress_pct: Number(p.progress_pct) || 0,
        budget_planned: Number(p.budget_planned) || 0,
        budget_currency: p.budget_currency || 'VND',
        category: p.category_id ? catMap.get(p.category_id) : undefined,
        owner: p.owner_id ? empMap.get(p.owner_id) : undefined,
        department: p.department_id ? deptMap.get(p.department_id) : undefined,
      }))

      setProjects(normalized)
      setPagination({
        page: 1,
        pageSize: 20,
        total: normalized.length,
        totalPages: Math.ceil(normalized.length / 20),
      })
    } catch (err) {
      console.error('Load projects failed:', err)
    } finally {
      setLoading(false)
    }
  }, [activeTab, searchQuery, sortKey, priorityFilter])

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  // ========================================================================
  // LOAD SUMMARY COUNTS
  // ========================================================================

  useEffect(() => {
    const loadCounts = async () => {
      try {
        // Total count
        const { count: total } = await supabase
          .from('projects')
          .select('id', { count: 'exact', head: true })

        // Running count
        const { count: running } = await supabase
          .from('projects')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'in_progress')

        // Overdue count: planned_end < today AND status NOT in completed/cancelled
        const today = new Date().toISOString().split('T')[0]
        const { count: overdue } = await supabase
          .from('projects')
          .select('id', { count: 'exact', head: true })
          .lt('planned_end', today)
          .not('status', 'in', '("completed","cancelled")')

        setAllCount(total || 0)
        setRunningCount(running || 0)
        setOverdueCount(overdue || 0)
      } catch (err) {
        console.error('[ProjectList] Count query failed:', err)
      }
    }
    loadCounts()
  }, [projects]) // Re-count when projects change

  // ---- Handlers ----
  const handleProjectTap = (id: string) => {
    navigate(`/projects/${id}`)
  }

  const handleCreateNew = () => {
    navigate('/projects/new')
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="min-h-screen bg-[#F7F5F2]">

      {/* ===== HEADER ===== */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">

          {/* Top row: Title + Actions */}
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate('/projects')}
                className="lg:hidden p-2 -ml-2 rounded-xl active:bg-gray-100"
              >
                <ArrowLeft className="w-5 h-5 text-gray-600" />
              </button>
              <div>
                <h1 className="text-lg font-bold text-gray-900">Dự án</h1>
                <p className="text-[12px] text-gray-500 hidden sm:block">
                  {allCount} dự án • {runningCount} đang chạy
                  {overdueCount > 0 && (
                    <span className="text-red-500 ml-1">• {overdueCount} trễ hạn</span>
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* View mode toggle — desktop */}
              <div className="hidden lg:flex items-center bg-gray-100 rounded-lg p-0.5">
                <button
                  onClick={() => setViewMode('card')}
                  className={`p-2 rounded-md transition-colors ${
                    viewMode === 'card' ? 'bg-white shadow-sm text-[#1B4D3E]' : 'text-gray-500'
                  }`}
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode('table')}
                  className={`p-2 rounded-md transition-colors ${
                    viewMode === 'table' ? 'bg-white shadow-sm text-[#1B4D3E]' : 'text-gray-500'
                  }`}
                >
                  <LayoutList className="w-4 h-4" />
                </button>
              </div>

              {/* Create button */}
              <button
                onClick={handleCreateNew}
                className="
                  hidden sm:inline-flex items-center gap-2
                  px-4 py-2.5 rounded-xl
                  bg-[#1B4D3E] text-white text-[14px] font-semibold
                  active:scale-[0.97] transition-transform
                  shadow-sm
                "
              >
                <Plus className="w-4 h-4" />
                Tạo dự án
              </button>
            </div>
          </div>

          {/* Search bar */}
          <div className="pb-3 flex items-center gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm dự án theo tên, mã, PM..."
                className="
                  w-full pl-10 pr-10 py-2.5
                  text-[15px] bg-gray-50 rounded-xl
                  border border-gray-200 focus:border-[#2D8B6E] focus:ring-1 focus:ring-[#2D8B6E]/20
                  outline-none transition-colors
                  placeholder:text-gray-400
                "
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-gray-200"
                >
                  <X className="w-3.5 h-3.5 text-gray-400" />
                </button>
              )}
            </div>

            {/* Filter toggle */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`
                p-2.5 rounded-xl border transition-colors
                ${showFilters
                  ? 'bg-[#1B4D3E] border-[#1B4D3E] text-white'
                  : 'bg-white border-gray-200 text-gray-600'
                }
              `}
            >
              <Filter className="w-4.5 h-4.5" />
            </button>
          </div>

          {/* Status tabs — horizontal scroll */}
          <div className="flex gap-1 overflow-x-auto pb-3 -mx-1 px-1 scrollbar-hide">
            {STATUS_TABS.map(tab => {
              const isActive = activeTab === tab.key
              const Icon = tab.icon
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`
                    inline-flex items-center gap-1.5
                    px-3.5 py-2 rounded-full
                    text-[13px] font-medium whitespace-nowrap
                    transition-colors
                    ${isActive
                      ? 'bg-[#1B4D3E] text-white shadow-sm'
                      : 'bg-white text-gray-600 border border-gray-200'
                    }
                  `}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {tab.label}
                </button>
              )
            })}
          </div>

          {/* Expandable filters panel */}
          {showFilters && (
            <div className="pb-3 flex flex-wrap gap-2">
              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className="
                  px-3 py-2 text-[13px] bg-white rounded-lg
                  border border-gray-200 outline-none
                  focus:border-[#2D8B6E]
                "
              >
                <option value="all">Tất cả ưu tiên</option>
                <option value="critical">Khẩn cấp</option>
                <option value="high">Cao</option>
                <option value="medium">Trung bình</option>
                <option value="low">Thấp</option>
              </select>

              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value)}
                className="
                  px-3 py-2 text-[13px] bg-white rounded-lg
                  border border-gray-200 outline-none
                  focus:border-[#2D8B6E]
                "
              >
                {SORT_OPTIONS.map(opt => (
                  <option key={opt.key} value={opt.key}>{opt.label}</option>
                ))}
              </select>

              {(priorityFilter !== 'all' || searchQuery || activeTab !== 'all') && (
                <button
                  onClick={() => {
                    setPriorityFilter('all')
                    setSearchQuery('')
                    setActiveTab('all')
                    setSortKey('created_at_desc')
                  }}
                  className="px-3 py-2 text-[13px] text-red-500 font-medium rounded-lg border border-red-200 bg-red-50"
                >
                  Xóa bộ lọc
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ===== CONTENT ===== */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">

        {/* Loading skeleton */}
        {loading && (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-white rounded-[14px] h-[140px] animate-pulse" />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && projects.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
              <FolderKanban className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-[16px] font-semibold text-gray-700 mb-1">
              Không tìm thấy dự án
            </h3>
            <p className="text-[14px] text-gray-500 mb-6">
              {searchQuery
                ? `Không có kết quả cho "${searchQuery}"`
                : 'Bắt đầu bằng cách tạo dự án đầu tiên'
              }
            </p>
            <button
              onClick={handleCreateNew}
              className="
                inline-flex items-center gap-2
                px-5 py-3 rounded-xl
                bg-[#1B4D3E] text-white text-[14px] font-semibold
                active:scale-[0.97] transition-transform
              "
            >
              <Plus className="w-4 h-4" />
              Tạo dự án mới
            </button>
          </div>
        )}

        {/* CARD VIEW */}
        {!loading && projects.length > 0 && viewMode === 'card' && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {projects.map(project => (
              <ProjectCard
                key={project.id}
                project={project}
                onTap={handleProjectTap}
              />
            ))}
          </div>
        )}

        {/* TABLE VIEW */}
        {!loading && projects.length > 0 && viewMode === 'table' && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50/80 border-b border-gray-100">
                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                      Mã DA
                    </th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                      Tên dự án
                    </th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                      PM
                    </th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider min-w-[160px]">
                      Tiến độ
                    </th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                      Trạng thái
                    </th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                      Ưu tiên
                    </th>
                    <th className="px-4 py-3 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                      Deadline
                    </th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {projects.map(project => (
                    <ProjectTableRow
                      key={project.id}
                      project={project}
                      onTap={handleProjectTap}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            {pagination.totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                <span className="text-[13px] text-gray-500">
                  {pagination.total} dự án
                </span>
                <div className="flex items-center gap-1">
                  {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map(p => (
                    <button
                      key={p}
                      onClick={() => setPagination(prev => ({ ...prev, page: p }))}
                      className={`
                        w-8 h-8 rounded-lg text-[13px] font-medium transition-colors
                        ${p === pagination.page
                          ? 'bg-[#1B4D3E] text-white'
                          : 'text-gray-600 hover:bg-gray-100'
                        }
                      `}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Result count — card view */}
        {!loading && projects.length > 0 && viewMode === 'card' && (
          <div className="mt-4 text-center text-[13px] text-gray-400">
            Hiển thị {projects.length} / {pagination.total} dự án
          </div>
        )}
      </div>

      {/* ===== FAB — Mobile create button ===== */}
      <button
        onClick={handleCreateNew}
        className="
          sm:hidden fixed bottom-6 right-5 z-40
          w-14 h-14 rounded-full
          bg-[#1B4D3E] text-white
          shadow-lg shadow-[#1B4D3E]/30
          flex items-center justify-center
          active:scale-90 transition-transform
        "
      >
        <Plus className="w-6 h-6" />
      </button>
    </div>
  )
}

export default ProjectListPage