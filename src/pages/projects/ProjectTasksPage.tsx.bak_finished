// ============================================================================
// FILE: src/pages/projects/ProjectTasksPage.tsx
// MODULE: Quản lý Dự án — Huy Anh Rubber ERP
// PHASE: PM6 — Bước 6.4 + 6.5
// MÔ TẢ: Trang tasks của dự án — 3 view modes (By Phase, Kanban, List)
//         Tạo task mới (pre-fill project context), bulk actions
// DESIGN: Industrial Rubber Theme, mobile-first, TailwindCSS
// ============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Plus,
  ChevronDown,
  ChevronRight,
  Search,
  Filter,
  LayoutList,
  Columns3,
  FolderTree,
  Loader2,
  CheckCircle2,
  Circle,
  Clock,
  AlertTriangle,
  ArrowUpDown,
  MoreHorizontal,
  X,
  Save,
  Calendar,
  User,
  Flag,
  RefreshCw,
  Link2,
  Unlink,
  MoveRight,
  Trash2,
  Edit3,
  Eye,
  ChevronUp,
  Target,
  BarChart3,
  GripVertical,
} from 'lucide-react'
import { projectTaskService } from '../../services/project/projectTaskService'
import type {
  ProjectTask,
  ProjectTaskFilter,
  ProjectTaskCreateData,
  ProjectTaskStats,
  PhaseTaskStats,
  TaskStatus,
  TaskPriority,
} from '../../services/project/projectTaskService'

// ============================================================================
// TYPES & CONSTANTS
// ============================================================================

type ViewMode = 'by_phase' | 'kanban' | 'list'

const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string; icon: React.ReactNode }> = {
  draft:      { label: 'Nháp',      color: 'text-gray-500',   bgColor: 'bg-gray-100',  icon: <Circle className="w-3.5 h-3.5" /> },
  todo:       { label: 'Chờ làm',    color: 'text-gray-600',   bgColor: 'bg-gray-100',  icon: <Circle className="w-3.5 h-3.5" /> },
  pending:    { label: 'Chờ xử lý',  color: 'text-amber-600',  bgColor: 'bg-amber-50',  icon: <Clock className="w-3.5 h-3.5" /> },
  in_progress:{ label: 'Đang làm',   color: 'text-blue-600',   bgColor: 'bg-blue-50',   icon: <Loader2 className="w-3.5 h-3.5 animate-spin" /> },
  review:     { label: 'Chờ duyệt',  color: 'text-purple-600', bgColor: 'bg-purple-50', icon: <Eye className="w-3.5 h-3.5" /> },
  completed:  { label: 'Hoàn thành', color: 'text-emerald-600',bgColor: 'bg-emerald-50',icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  cancelled:  { label: 'Đã hủy',    color: 'text-red-500',    bgColor: 'bg-red-50',    icon: <X className="w-3.5 h-3.5" /> },
  overdue:    { label: 'Quá hạn',    color: 'text-red-600',    bgColor: 'bg-red-50',    icon: <AlertTriangle className="w-3.5 h-3.5" /> },
}

const PRIORITY_CONFIG: Record<TaskPriority, { label: string; color: string; dot: string }> = {
  urgent: { label: 'Khẩn cấp', color: 'text-red-600',    dot: 'bg-red-500' },
  high:   { label: 'Cao',      color: 'text-orange-600',  dot: 'bg-orange-500' },
  medium: { label: 'Trung bình',color: 'text-blue-600',   dot: 'bg-blue-500' },
  low:    { label: 'Thấp',     color: 'text-gray-500',    dot: 'bg-gray-400' },
}

const KANBAN_COLUMNS: { key: TaskStatus[]; label: string; headerColor: string }[] = [
  { key: ['draft', 'pending'],  label: 'Chờ làm',    headerColor: 'border-gray-400' },
  { key: ['in_progress'],      label: 'Đang làm',   headerColor: 'border-blue-500' },
  { key: ['review'],           label: 'Chờ duyệt',  headerColor: 'border-purple-500' },
  { key: ['completed'],        label: 'Hoàn thành', headerColor: 'border-emerald-500' },
]

// ============================================================================
// PROPS
// ============================================================================

interface ProjectTasksPageProps {
  projectId: string
  projectName?: string
  /** Danh sách members dự án cho assignee dropdown */
  onNavigateToTask?: (taskId: string) => void
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const ProjectTasksPage: React.FC<ProjectTasksPageProps> = ({
  projectId,
  projectName,
  onNavigateToTask,
}) => {
  // State
  const [viewMode, setViewMode] = useState<ViewMode>('by_phase')
  const [tasks, setTasks] = useState<ProjectTask[]>([])
  const [stats, setStats] = useState<ProjectTaskStats | null>(null)
  const [phases, setPhases] = useState<{ id: string; name: string; order_index: number; status: string }[]>([])
  const [members, setMembers] = useState<{ employee_id: string; full_name: string; role: string }[]>([])
  const [milestones, setMilestones] = useState<{ id: string; name: string; due_date: string; status: string }[]>([])
  
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Filters
  const [filterPhase, setFilterPhase] = useState<string>('')
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [filterAssignee, setFilterAssignee] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  
  // Create task modal
  const [showCreateModal, setShowCreateModal] = useState(false)
  
  // Selected tasks (for bulk actions)
  const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set())
  
  // Accordion expand state (By Phase view)
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set())

  // ========================================================================
  // DATA LOADING
  // ========================================================================

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const [tasksResult, statsResult, phasesResult, membersResult, milestonesResult] = await Promise.all([
        projectTaskService.getTasksByProject({
          project_id: projectId,
          phase_id: filterPhase || undefined,
          status: filterStatus as TaskStatus || undefined,
          assignee_id: filterAssignee || undefined,
          search: searchQuery || undefined,
          pageSize: 200, // Load all for client-side grouping
        }),
        projectTaskService.getTaskStats(projectId),
        projectTaskService.getProjectPhases(projectId),
        projectTaskService.getProjectMembers(projectId),
        projectTaskService.getProjectMilestones(projectId),
      ])

      setTasks(tasksResult.data)
      setStats(statsResult)
      setPhases(phasesResult)
      setMembers(membersResult)
      setMilestones(milestonesResult)

      // Auto-expand all phases on first load
      if (expandedPhases.size === 0 && phasesResult.length > 0) {
        setExpandedPhases(new Set(phasesResult.map(p => p.id)))
      }
    } catch (err: any) {
      console.error('[ProjectTasksPage] Load error:', err)
      setError(err.message || 'Không thể tải danh sách tasks')
    } finally {
      setLoading(false)
    }
  }, [projectId, filterPhase, filterStatus, filterAssignee, searchQuery])

  useEffect(() => {
    loadData()
  }, [loadData])

  // ========================================================================
  // GROUPED DATA
  // ========================================================================

  /** Tasks grouped by phase for accordion view */
  const tasksByPhase = useMemo(() => {
    const map = new Map<string, ProjectTask[]>()
    const NO_PHASE = '__no_phase__'

    // Initialize with all phases (even empty ones)
    for (const phase of phases) {
      map.set(phase.id, [])
    }
    map.set(NO_PHASE, []) // Chưa phân phase

    for (const task of tasks) {
      const key = task.phase_id || NO_PHASE
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(task)
    }

    return map
  }, [tasks, phases])

  /** Tasks grouped by status for kanban view */
  const tasksByStatus = useMemo(() => {
    return KANBAN_COLUMNS.map(col => ({
      ...col,
      tasks: tasks.filter(t => col.key.includes(t.status)),
    }))
  }, [tasks])

  // ========================================================================
  // HANDLERS
  // ========================================================================

  const togglePhase = (phaseId: string) => {
    setExpandedPhases(prev => {
      const next = new Set(prev)
      if (next.has(phaseId)) next.delete(phaseId)
      else next.add(phaseId)
      return next
    })
  }

  const toggleSelectTask = (taskId: string) => {
    setSelectedTasks(prev => {
      const next = new Set(prev)
      if (next.has(taskId)) next.delete(taskId)
      else next.add(taskId)
      return next
    })
  }

  const selectAllTasks = () => {
    if (selectedTasks.size === tasks.length) {
      setSelectedTasks(new Set())
    } else {
      setSelectedTasks(new Set(tasks.map(t => t.id)))
    }
  }

  const handleQuickStatusChange = async (taskId: string, newStatus: TaskStatus) => {
    try {
      const completion = newStatus === 'completed' ? 100 : undefined
      await projectTaskService.updateTask(taskId, {
        status: newStatus,
        ...(completion !== undefined ? { progress: completion } : {}),
      })
      await loadData()
    } catch (err: any) {
      console.error('Status update failed:', err)
    }
  }

  const handleBulkStatusChange = async (status: TaskStatus) => {
    if (selectedTasks.size === 0) return
    try {
      await projectTaskService.bulkUpdateStatus(Array.from(selectedTasks), status)
      setSelectedTasks(new Set())
      await loadData()
    } catch (err: any) {
      console.error('Bulk update failed:', err)
    }
  }

  const handleSyncProgress = async () => {
    try {
      await projectTaskService.syncProgress(projectId)
      await loadData()
    } catch (err: any) {
      console.error('Sync failed:', err)
    }
  }

  const handleTaskCreated = async () => {
    setShowCreateModal(false)
    await loadData()
  }

  const clearFilters = () => {
    setFilterPhase('')
    setFilterStatus('')
    setFilterAssignee('')
    setSearchQuery('')
  }

  const hasActiveFilters = filterPhase || filterStatus || filterAssignee || searchQuery

  // ========================================================================
  // RENDER HELPERS
  // ========================================================================

  /** Badge trạng thái task */
  const StatusBadge: React.FC<{ status: TaskStatus }> = ({ status }) => {
    const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.todo
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${cfg.color} ${cfg.bgColor}`}>
        {cfg.icon}
        {cfg.label}
      </span>
    )
  }

  /** Badge ưu tiên */
  const PriorityBadge: React.FC<{ priority: TaskPriority }> = ({ priority }) => {
    const cfg = PRIORITY_CONFIG[priority] || PRIORITY_CONFIG.medium
    return (
      <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${cfg.color}`}>
        <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
        {cfg.label}
      </span>
    )
  }

  /** Progress bar nhỏ */
  const MiniProgress: React.FC<{ value: number }> = ({ value }) => (
    <div className="flex items-center gap-1.5">
      <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            value >= 100 ? 'bg-emerald-500' : value > 50 ? 'bg-blue-500' : value > 0 ? 'bg-amber-500' : 'bg-gray-300'
          }`}
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
      <span className="text-[11px] text-gray-500 w-8 text-right">{Math.round(value)}%</span>
    </div>
  )

  /** Card task (dùng chung cho By Phase và Kanban) */
  const TaskCard: React.FC<{ task: ProjectTask; showPhase?: boolean; compact?: boolean }> = ({ task, showPhase, compact }) => {
    const isOverdue = task.due_date && new Date(task.due_date) < new Date() && !['completed', 'cancelled'].includes(task.status)

    return (
      <div
        className={`bg-white rounded-lg border transition-all
          ${selectedTasks.has(task.id) ? 'border-[#1B4D3E] ring-1 ring-[#1B4D3E]/20' : 'border-gray-200 hover:border-gray-300'}
          ${compact ? 'p-2.5' : 'p-3'}
        `}
      >
        <div className="flex items-start gap-2">
          {/* Checkbox */}
          <button
            onClick={(e) => { e.stopPropagation(); toggleSelectTask(task.id) }}
            className={`mt-0.5 w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors
              ${selectedTasks.has(task.id) ? 'bg-[#1B4D3E] border-[#1B4D3E] text-white' : 'border-gray-300 hover:border-gray-400'}
            `}
          >
            {selectedTasks.has(task.id) && <CheckCircle2 className="w-3 h-3" />}
          </button>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Title */}
            <button
              onClick={() => onNavigateToTask?.(task.id)}
              className="text-[13px] font-medium text-gray-900 hover:text-[#1B4D3E] text-left line-clamp-2 transition-colors"
            >
              {task.name}
            </button>

            {/* Meta row */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
              <StatusBadge status={task.status} />
              <PriorityBadge priority={task.priority} />

              {showPhase && task.phase && (
                <span className="text-[11px] text-gray-500 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: task.phase.color || '#6B7280' }} />
                  {task.phase.name}
                </span>
              )}

              {task.due_date && (
                <span className={`text-[11px] flex items-center gap-0.5 ${isOverdue ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                  <Calendar className="w-3 h-3" />
                  {new Date(task.due_date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}
                  {isOverdue && ' ⚠'}
                </span>
              )}

              {task.assignee && (
                <span className="text-[11px] text-gray-500 flex items-center gap-0.5">
                  <User className="w-3 h-3" />
                  {task.assignee.full_name}
                </span>
              )}
            </div>

            {/* Progress */}
            {!compact && task.progress > 0 && task.status !== 'completed' && (
              <div className="mt-2">
                <MiniProgress value={task.progress} />
              </div>
            )}
          </div>

          {/* Quick complete button */}
          {task.status !== 'completed' && task.status !== 'cancelled' && (
            <button
              onClick={(e) => { e.stopPropagation(); handleQuickStatusChange(task.id, 'completed') }}
              className="mt-0.5 p-1 rounded-full text-gray-300 hover:text-emerald-500 hover:bg-emerald-50 transition-colors"
              title="Đánh dấu hoàn thành"
            >
              <CheckCircle2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    )
  }

  // ========================================================================
  // RENDER: STATS SUMMARY
  // ========================================================================

  const StatsSummary = () => {
    if (!stats) return null

    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 mb-4">
        {[
          { label: 'Tổng', value: stats.total, color: 'text-gray-900' },
          { label: 'Hoàn thành', value: stats.completed, color: 'text-emerald-600' },
          { label: 'Đang làm', value: stats.in_progress, color: 'text-blue-600' },
          { label: 'Chờ làm', value: stats.todo, color: 'text-gray-600' },
          { label: 'Chờ duyệt', value: stats.review, color: 'text-purple-600' },
          { label: 'Quá hạn', value: stats.overdue, color: 'text-red-600' },
          { label: 'Tiến độ', value: `${Math.round(stats.progress_pct)}%`, color: 'text-[#1B4D3E]' },
        ].map(item => (
          <div key={item.label} className="bg-white rounded-lg border border-gray-200 px-3 py-2">
            <div className={`text-lg font-bold ${item.color}`}>{item.value}</div>
            <div className="text-[11px] text-gray-500">{item.label}</div>
          </div>
        ))}
      </div>
    )
  }

  // ========================================================================
  // RENDER: VIEW BY PHASE (Accordion)
  // ========================================================================

  const ByPhaseView = () => {
    const NO_PHASE = '__no_phase__'

    // Build ordered list: phases first, then unassigned
    const orderedKeys = [
      ...phases.map(p => p.id),
      ...(tasksByPhase.has(NO_PHASE) && (tasksByPhase.get(NO_PHASE)?.length || 0) > 0 ? [NO_PHASE] : []),
    ]

    if (orderedKeys.length === 0 && tasks.length === 0) {
      return (
        <div className="text-center py-12">
          <Target className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-[14px]">Chưa có tasks nào trong dự án</p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="mt-3 px-4 py-2 bg-[#1B4D3E] text-white text-[13px] rounded-lg hover:bg-[#153F33] transition-colors"
          >
            <Plus className="w-4 h-4 inline mr-1" />
            Tạo task đầu tiên
          </button>
        </div>
      )
    }

    return (
      <div className="space-y-2">
        {orderedKeys.map(key => {
          const isNoPhase = key === NO_PHASE
          const phase = phases.find(p => p.id === key)
          const phaseTasks = tasksByPhase.get(key) || []
          const expanded = expandedPhases.has(key)
          const completedCount = phaseTasks.filter(t => t.status === 'completed').length

          // Phase stat from stats
          const phaseStat = stats?.by_phase.find(s => s.phase_id === key)

          return (
            <div key={key} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              {/* Phase header */}
              <button
                onClick={() => togglePhase(key)}
                className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-gray-50 transition-colors"
              >
                {expanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}

                {/* Phase color dot */}
                {!isNoPhase && (
                  <span
                    className="w-3 h-3 rounded-sm flex-shrink-0"
                    style={{ backgroundColor: phase?.status === 'completed' ? '#10B981' : (phaseStat?.phase_color || '#6B7280') }}
                  />
                )}

                <span className="text-[13px] font-semibold text-gray-800 flex-1 text-left">
                  {isNoPhase ? 'Chưa phân phase' : phase?.name || key}
                </span>

                {/* Count badges */}
                <span className="text-[11px] text-gray-500 mr-1">
                  {completedCount}/{phaseTasks.length}
                </span>

                {/* Mini progress */}
                {phaseTasks.length > 0 && (
                  <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all"
                      style={{ width: `${phaseTasks.length > 0 ? (completedCount / phaseTasks.length) * 100 : 0}%` }}
                    />
                  </div>
                )}
              </button>

              {/* Phase tasks */}
              {expanded && (
                <div className="border-t border-gray-100 p-2 space-y-1.5">
                  {phaseTasks.length === 0 ? (
                    <p className="text-[12px] text-gray-400 text-center py-4">Chưa có task trong phase này</p>
                  ) : (
                    phaseTasks.map(task => (
                      <TaskCard key={task.id} task={task} />
                    ))
                  )}

                  {/* Add task to this phase */}
                  <button
                    onClick={() => {
                      // TODO: Open create modal with pre-filled phase_id
                      setShowCreateModal(true)
                    }}
                    className="w-full flex items-center justify-center gap-1 py-2 text-[12px] text-gray-400 hover:text-[#1B4D3E] hover:bg-gray-50 rounded transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Thêm task
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  // ========================================================================
  // RENDER: KANBAN VIEW
  // ========================================================================

  const KanbanView = () => (
    <div className="flex gap-3 overflow-x-auto pb-4 -mx-4 px-4 snap-x">
      {tasksByStatus.map(col => (
        <div
          key={col.label}
          className={`flex-shrink-0 w-[280px] sm:w-[300px] bg-gray-50 rounded-lg border-t-2 ${col.headerColor}`}
        >
          {/* Column header */}
          <div className="flex items-center justify-between px-3 py-2.5">
            <span className="text-[13px] font-semibold text-gray-700">{col.label}</span>
            <span className="text-[11px] text-gray-400 bg-white px-1.5 py-0.5 rounded-full">
              {col.tasks.length}
            </span>
          </div>

          {/* Column tasks */}
          <div className="px-2 pb-2 space-y-1.5 max-h-[60vh] overflow-y-auto">
            {col.tasks.length === 0 ? (
              <div className="text-center py-6 text-[12px] text-gray-400">
                Không có task
              </div>
            ) : (
              col.tasks.map(task => (
                <TaskCard key={task.id} task={task} showPhase compact />
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  )

  // ========================================================================
  // RENDER: LIST VIEW (Table)
  // ========================================================================

  const ListView = () => (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Desktop table (hidden on mobile) */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="w-8 px-3 py-2">
                <input
                  type="checkbox"
                  checked={selectedTasks.size === tasks.length && tasks.length > 0}
                  onChange={selectAllTasks}
                  className="w-3.5 h-3.5 rounded border-gray-300 text-[#1B4D3E] focus:ring-[#1B4D3E]"
                />
              </th>
              <th className="text-left text-[11px] font-semibold text-gray-500 uppercase px-3 py-2">Tên task</th>
              <th className="text-left text-[11px] font-semibold text-gray-500 uppercase px-3 py-2 w-28">Phase</th>
              <th className="text-left text-[11px] font-semibold text-gray-500 uppercase px-3 py-2 w-28">Người thực hiện</th>
              <th className="text-center text-[11px] font-semibold text-gray-500 uppercase px-3 py-2 w-24">Ưu tiên</th>
              <th className="text-center text-[11px] font-semibold text-gray-500 uppercase px-3 py-2 w-24">Trạng thái</th>
              <th className="text-center text-[11px] font-semibold text-gray-500 uppercase px-3 py-2 w-20">Tiến độ</th>
              <th className="text-center text-[11px] font-semibold text-gray-500 uppercase px-3 py-2 w-24">Deadline</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {tasks.map(task => {
              const isOverdue = task.due_date && new Date(task.due_date) < new Date() && !['completed', 'cancelled'].includes(task.status)
              return (
                <tr key={task.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selectedTasks.has(task.id)}
                      onChange={() => toggleSelectTask(task.id)}
                      className="w-3.5 h-3.5 rounded border-gray-300 text-[#1B4D3E] focus:ring-[#1B4D3E]"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => onNavigateToTask?.(task.id)}
                      className="text-[13px] font-medium text-gray-900 hover:text-[#1B4D3E] text-left transition-colors"
                    >
                      {task.name}
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    {task.phase ? (
                      <span className="text-[12px] text-gray-600 flex items-center gap-1">
                        <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: task.phase.color || '#6B7280' }} />
                        {task.phase.name}
                      </span>
                    ) : (
                      <span className="text-[12px] text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span className="text-[12px] text-gray-600">{task.assignee?.full_name || '—'}</span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <PriorityBadge priority={task.priority} />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <StatusBadge status={task.status} />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <MiniProgress value={task.progress} />
                  </td>
                  <td className={`px-3 py-2 text-center text-[12px] ${isOverdue ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                    {task.due_date
                      ? new Date(task.due_date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })
                      : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards (visible on mobile only) */}
      <div className="sm:hidden p-2 space-y-1.5">
        {tasks.map(task => (
          <TaskCard key={task.id} task={task} showPhase />
        ))}
      </div>

      {tasks.length === 0 && (
        <div className="text-center py-12">
          <Target className="w-10 h-10 text-gray-300 mx-auto mb-2" />
          <p className="text-[13px] text-gray-500">
            {hasActiveFilters ? 'Không tìm thấy task phù hợp' : 'Chưa có task nào'}
          </p>
        </div>
      )}
    </div>
  )

  // ========================================================================
  // RENDER: CREATE TASK MODAL
  // ========================================================================

  const CreateTaskModal = () => {
    const [form, setForm] = useState<Partial<ProjectTaskCreateData>>({
      project_id: projectId,
      priority: 'medium',
    })
    const [saving, setSaving] = useState(false)

    const handleSubmit = async () => {
      if (!form.name?.trim()) return
      try {
        setSaving(true)
        await projectTaskService.createProjectTask({
          ...form,
          project_id: projectId,
          name: form.name!.trim(),
        } as ProjectTaskCreateData)
        handleTaskCreated()
      } catch (err: any) {
        console.error('Create task failed:', err)
      } finally {
        setSaving(false)
      }
    }

    return (
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onClick={() => setShowCreateModal(false)}>
        <div
          className="bg-white w-full sm:max-w-lg sm:rounded-xl rounded-t-xl max-h-[85vh] overflow-y-auto"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between z-10">
            <h3 className="text-[15px] font-bold text-gray-900">Tạo Task mới</h3>
            <button onClick={() => setShowCreateModal(false)} className="p-1 hover:bg-gray-100 rounded-lg">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          {/* Form */}
          <div className="p-4 space-y-4">
            {/* Tên task */}
            <div>
              <label className="block text-[12px] font-medium text-gray-600 mb-1">Tên task *</label>
              <input
                type="text"
                value={form.name || ''}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Nhập tên công việc..."
                className="w-full px-3 py-2.5 text-[15px] border border-gray-300 rounded-lg focus:border-[#1B4D3E] focus:ring-1 focus:ring-[#1B4D3E] outline-none"
                autoFocus
              />
            </div>

            {/* Mô tả */}
            <div>
              <label className="block text-[12px] font-medium text-gray-600 mb-1">Mô tả</label>
              <textarea
                value={form.description || ''}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                rows={3}
                placeholder="Mô tả chi tiết..."
                className="w-full px-3 py-2.5 text-[15px] border border-gray-300 rounded-lg focus:border-[#1B4D3E] focus:ring-1 focus:ring-[#1B4D3E] outline-none resize-none"
              />
            </div>

            {/* Phase + Milestone (2 cols) */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[12px] font-medium text-gray-600 mb-1">Phase</label>
                <select
                  value={form.phase_id || ''}
                  onChange={e => setForm(f => ({ ...f, phase_id: e.target.value || undefined }))}
                  className="w-full px-3 py-2.5 text-[15px] border border-gray-300 rounded-lg focus:border-[#1B4D3E] outline-none bg-white"
                >
                  <option value="">— Chọn phase —</option>
                  {phases.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[12px] font-medium text-gray-600 mb-1">Milestone</label>
                <select
                  value={form.milestone_id || ''}
                  onChange={e => setForm(f => ({ ...f, milestone_id: e.target.value || undefined }))}
                  className="w-full px-3 py-2.5 text-[15px] border border-gray-300 rounded-lg focus:border-[#1B4D3E] outline-none bg-white"
                >
                  <option value="">— Không —</option>
                  {milestones.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Người thực hiện + Ưu tiên */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[12px] font-medium text-gray-600 mb-1">Người thực hiện</label>
                <select
                  value={form.assignee_id || ''}
                  onChange={e => setForm(f => ({ ...f, assignee_id: e.target.value || undefined }))}
                  className="w-full px-3 py-2.5 text-[15px] border border-gray-300 rounded-lg focus:border-[#1B4D3E] outline-none bg-white"
                >
                  <option value="">— Chưa phân —</option>
                  {members.map(m => (
                    <option key={m.employee_id} value={m.employee_id}>{m.full_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[12px] font-medium text-gray-600 mb-1">Ưu tiên</label>
                <select
                  value={form.priority || 'medium'}
                  onChange={e => setForm(f => ({ ...f, priority: e.target.value as TaskPriority }))}
                  className="w-full px-3 py-2.5 text-[15px] border border-gray-300 rounded-lg focus:border-[#1B4D3E] outline-none bg-white"
                >
                  {Object.entries(PRIORITY_CONFIG).map(([key, cfg]) => (
                    <option key={key} value={key}>{cfg.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Ngày bắt đầu + Deadline */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[12px] font-medium text-gray-600 mb-1">Ngày bắt đầu</label>
                <input
                  type="date"
                  value={form.start_date || ''}
                  onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                  className="w-full px-3 py-2.5 text-[15px] border border-gray-300 rounded-lg focus:border-[#1B4D3E] outline-none"
                />
              </div>
              <div>
                <label className="block text-[12px] font-medium text-gray-600 mb-1">Deadline</label>
                <input
                  type="date"
                  value={form.due_date || ''}
                  onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                  className="w-full px-3 py-2.5 text-[15px] border border-gray-300 rounded-lg focus:border-[#1B4D3E] outline-none"
                />
              </div>
            </div>

            {/* Số giờ dự kiến */}
            <div>
              <label className="block text-[12px] font-medium text-gray-600 mb-1">Số giờ dự kiến</label>
              <input
                type="number"
                value={form.estimated_hours || ''}
                onChange={e => setForm(f => ({ ...f, estimated_hours: Number(e.target.value) || undefined }))}
                placeholder="VD: 8"
                min={0}
                step={0.5}
                className="w-full px-3 py-2.5 text-[15px] border border-gray-300 rounded-lg focus:border-[#1B4D3E] outline-none"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="sticky bottom-0 bg-white border-t border-gray-200 px-4 py-3 flex gap-2 safe-area-bottom">
            <button
              onClick={() => setShowCreateModal(false)}
              className="flex-1 py-2.5 text-[14px] text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Hủy
            </button>
            <button
              onClick={handleSubmit}
              disabled={!form.name?.trim() || saving}
              className="flex-1 py-2.5 text-[14px] text-white bg-[#1B4D3E] rounded-lg hover:bg-[#153F33] disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Tạo task
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ========================================================================
  // MAIN RENDER
  // ========================================================================

  if (loading && tasks.length === 0) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-[#1B4D3E]" />
        <span className="ml-2 text-[14px] text-gray-500">Đang tải tasks...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <AlertTriangle className="w-10 h-10 text-red-400 mx-auto mb-2" />
        <p className="text-red-600 text-[14px]">{error}</p>
        <button onClick={loadData} className="mt-3 px-4 py-2 text-[13px] text-[#1B4D3E] bg-gray-100 rounded-lg hover:bg-gray-200">
          Thử lại
        </button>
      </div>
    )
  }

  return (
    <div>
      {/* Stats summary */}
      <StatsSummary />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {/* View mode toggle */}
        <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
          {([
            { key: 'by_phase' as ViewMode, icon: <FolderTree className="w-4 h-4" />, label: 'Phase' },
            { key: 'kanban' as ViewMode, icon: <Columns3 className="w-4 h-4" />, label: 'Kanban' },
            { key: 'list' as ViewMode, icon: <LayoutList className="w-4 h-4" />, label: 'List' },
          ]).map(v => (
            <button
              key={v.key}
              onClick={() => setViewMode(v.key)}
              className={`flex items-center gap-1 px-2.5 py-1.5 text-[12px] rounded-md transition-colors
                ${viewMode === v.key ? 'bg-white text-[#1B4D3E] font-medium shadow-sm' : 'text-gray-500 hover:text-gray-700'}
              `}
            >
              {v.icon}
              <span className="hidden sm:inline">{v.label}</span>
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="flex-1 min-w-[160px] relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Tìm task..."
            className="w-full pl-8 pr-3 py-2 text-[13px] border border-gray-300 rounded-lg focus:border-[#1B4D3E] focus:ring-1 focus:ring-[#1B4D3E] outline-none"
          />
        </div>

        {/* Filter toggle */}
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-1 px-3 py-2 text-[12px] border rounded-lg transition-colors
            ${hasActiveFilters ? 'border-[#1B4D3E] text-[#1B4D3E] bg-[#1B4D3E]/5' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}
          `}
        >
          <Filter className="w-4 h-4" />
          Bộ lọc
          {hasActiveFilters && (
            <span className="ml-1 w-4 h-4 bg-[#1B4D3E] text-white rounded-full text-[10px] flex items-center justify-center">
              !
            </span>
          )}
        </button>

        {/* Sync button */}
        <button
          onClick={handleSyncProgress}
          className="p-2 text-gray-400 hover:text-[#1B4D3E] hover:bg-gray-100 rounded-lg transition-colors"
          title="Đồng bộ tiến độ"
        >
          <RefreshCw className="w-4 h-4" />
        </button>

        {/* Create button */}
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-1 px-3 py-2 text-[13px] text-white bg-[#1B4D3E] rounded-lg hover:bg-[#153F33] transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Tạo task</span>
        </button>
      </div>

      {/* Filter bar (collapsible) */}
      {showFilters && (
        <div className="flex flex-wrap items-center gap-2 mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
          <select
            value={filterPhase}
            onChange={e => setFilterPhase(e.target.value)}
            className="px-3 py-2 text-[13px] border border-gray-300 rounded-lg bg-white focus:border-[#1B4D3E] outline-none"
          >
            <option value="">Tất cả phases</option>
            {phases.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="px-3 py-2 text-[13px] border border-gray-300 rounded-lg bg-white focus:border-[#1B4D3E] outline-none"
          >
            <option value="">Tất cả trạng thái</option>
            {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
              <option key={key} value={key}>{cfg.label}</option>
            ))}
          </select>

          <select
            value={filterAssignee}
            onChange={e => setFilterAssignee(e.target.value)}
            className="px-3 py-2 text-[13px] border border-gray-300 rounded-lg bg-white focus:border-[#1B4D3E] outline-none"
          >
            <option value="">Tất cả người thực hiện</option>
            {members.map(m => (
              <option key={m.employee_id} value={m.employee_id}>{m.full_name}</option>
            ))}
          </select>

          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="px-3 py-2 text-[12px] text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            >
              <X className="w-3.5 h-3.5 inline mr-0.5" />
              Xóa bộ lọc
            </button>
          )}
        </div>
      )}

      {/* Bulk action bar */}
      {selectedTasks.size > 0 && (
        <div className="flex items-center gap-2 mb-3 p-2.5 bg-[#1B4D3E]/5 border border-[#1B4D3E]/20 rounded-lg">
          <span className="text-[12px] text-[#1B4D3E] font-medium">
            Đã chọn {selectedTasks.size} task
          </span>
          <div className="flex-1" />
          <button
            onClick={() => handleBulkStatusChange('in_progress')}
            className="px-2.5 py-1.5 text-[11px] text-blue-600 bg-blue-50 rounded-md hover:bg-blue-100 transition-colors"
          >
            → Đang làm
          </button>
          <button
            onClick={() => handleBulkStatusChange('completed')}
            className="px-2.5 py-1.5 text-[11px] text-emerald-600 bg-emerald-50 rounded-md hover:bg-emerald-100 transition-colors"
          >
            ✓ Hoàn thành
          </button>
          <button
            onClick={() => setSelectedTasks(new Set())}
            className="px-2.5 py-1.5 text-[11px] text-gray-500 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
          >
            Bỏ chọn
          </button>
        </div>
      )}

      {/* View content */}
      {viewMode === 'by_phase' && <ByPhaseView />}
      {viewMode === 'kanban' && <KanbanView />}
      {viewMode === 'list' && <ListView />}

      {/* Create task modal */}
      {showCreateModal && <CreateTaskModal />}
    </div>
  )
}

export default ProjectTasksPage