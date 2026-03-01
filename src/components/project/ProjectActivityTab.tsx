// ============================================================================
// FILE: src/components/project/ProjectActivityTab.tsx
// MODULE: Quản lý Dự án — Huy Anh Rubber ERP
// PM8+: Tab Hoạt động (Real Supabase data, rich UI)
// ============================================================================
// Hiển thị timeline hoạt động dự án với:
// - Icon + màu theo loại action
// - Filter theo loại hoạt động
// - Load more (pagination)
// - Stats summary
// - Empty state
// - Relative time + full datetime tooltip
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react'
import {
  Activity, Users, CheckCircle2, AlertTriangle, FileText, Edit3,
  MessageSquare, Plus, Trash2, ArrowUpDown, Play, PauseCircle,
  FolderOpen, Target, BarChart3, Clock, ChevronDown, Loader2,
  Filter, RefreshCw, UserPlus, UserMinus, Flag, ShieldAlert,
  Milestone as MilestoneIcon, ListTodo, X, CalendarDays,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'

// ============================================================================
// TYPES
// ============================================================================

interface ActivityItem {
  id: string
  project_id: string
  action: string
  description: string | null
  entity_type: string | null
  entity_id: string | null
  old_value: string | null
  new_value: string | null
  metadata: Record<string, any> | null
  actor_id: string | null
  created_at: string
  // Client-side join
  actor?: { id: string; full_name: string }
}

interface ProjectActivityTabProps {
  projectId: string
}

// ============================================================================
// ACTION CONFIG — icon + color + label cho từng loại action
// ============================================================================

interface ActionConfig {
  icon: React.ReactNode
  bg: string
  color: string
  label: string
  group: string
}

const ACTION_CONFIGS: Record<string, ActionConfig> = {
  // Status
  status_changed:      { icon: <ArrowUpDown className="w-3.5 h-3.5" />, bg: 'bg-blue-100',    color: 'text-blue-600',    label: 'Đổi trạng thái',     group: 'status' },
  phase_started:       { icon: <Play className="w-3.5 h-3.5" />,        bg: 'bg-emerald-100', color: 'text-emerald-600', label: 'Bắt đầu phase',      group: 'status' },
  phase_completed:     { icon: <CheckCircle2 className="w-3.5 h-3.5" />,bg: 'bg-green-100',   color: 'text-green-600',   label: 'Hoàn thành phase',   group: 'status' },
  project_started:     { icon: <Play className="w-3.5 h-3.5" />,        bg: 'bg-emerald-100', color: 'text-emerald-600', label: 'Bắt đầu dự án',      group: 'status' },
  project_completed:   { icon: <CheckCircle2 className="w-3.5 h-3.5" />,bg: 'bg-green-100',   color: 'text-green-600',   label: 'Hoàn thành dự án',   group: 'status' },
  project_on_hold:     { icon: <PauseCircle className="w-3.5 h-3.5" />, bg: 'bg-amber-100',   color: 'text-amber-600',   label: 'Tạm dừng dự án',     group: 'status' },

  // Members
  member_added:        { icon: <UserPlus className="w-3.5 h-3.5" />,    bg: 'bg-purple-100',  color: 'text-purple-600',  label: 'Thêm thành viên',    group: 'member' },
  member_removed:      { icon: <UserMinus className="w-3.5 h-3.5" />,   bg: 'bg-red-100',     color: 'text-red-500',     label: 'Xóa thành viên',     group: 'member' },
  member_role_changed: { icon: <Users className="w-3.5 h-3.5" />,       bg: 'bg-purple-100',  color: 'text-purple-600',  label: 'Đổi vai trò',        group: 'member' },

  // Milestones
  milestone_created:   { icon: <MilestoneIcon className="w-3.5 h-3.5" />,bg: 'bg-indigo-100', color: 'text-indigo-600',  label: 'Tạo milestone',      group: 'milestone' },
  milestone_completed: { icon: <Flag className="w-3.5 h-3.5" />,        bg: 'bg-green-100',   color: 'text-green-600',   label: 'Milestone hoàn thành',group: 'milestone' },
  milestone_overdue:   { icon: <AlertTriangle className="w-3.5 h-3.5" />,bg: 'bg-red-100',    color: 'text-red-500',     label: 'Milestone quá hạn',  group: 'milestone' },

  // Tasks
  task_created:        { icon: <Plus className="w-3.5 h-3.5" />,        bg: 'bg-sky-100',     color: 'text-sky-600',     label: 'Tạo task',           group: 'task' },
  task_completed:      { icon: <CheckCircle2 className="w-3.5 h-3.5" />,bg: 'bg-green-100',   color: 'text-green-600',   label: 'Task hoàn thành',    group: 'task' },
  task_assigned:       { icon: <Target className="w-3.5 h-3.5" />,      bg: 'bg-sky-100',     color: 'text-sky-600',     label: 'Giao task',          group: 'task' },

  // Documents
  document_uploaded:   { icon: <FileText className="w-3.5 h-3.5" />,    bg: 'bg-teal-100',    color: 'text-teal-600',    label: 'Upload tài liệu',   group: 'document' },
  document_deleted:    { icon: <Trash2 className="w-3.5 h-3.5" />,      bg: 'bg-red-100',     color: 'text-red-500',     label: 'Xóa tài liệu',      group: 'document' },

  // Risks & Issues
  risk_created:        { icon: <ShieldAlert className="w-3.5 h-3.5" />, bg: 'bg-orange-100',  color: 'text-orange-600',  label: 'Tạo rủi ro',        group: 'risk' },
  issue_created:       { icon: <AlertTriangle className="w-3.5 h-3.5" />,bg: 'bg-red-100',    color: 'text-red-500',     label: 'Tạo vấn đề',        group: 'risk' },
  issue_resolved:      { icon: <CheckCircle2 className="w-3.5 h-3.5" />,bg: 'bg-green-100',   color: 'text-green-600',   label: 'Giải quyết vấn đề', group: 'risk' },

  // General
  updated:             { icon: <Edit3 className="w-3.5 h-3.5" />,       bg: 'bg-gray-100',    color: 'text-gray-500',    label: 'Cập nhật',           group: 'general' },
  comment_added:       { icon: <MessageSquare className="w-3.5 h-3.5" />,bg: 'bg-blue-100',   color: 'text-blue-600',    label: 'Bình luận',          group: 'general' },
  created:             { icon: <Plus className="w-3.5 h-3.5" />,        bg: 'bg-emerald-100', color: 'text-emerald-600', label: 'Tạo mới',           group: 'general' },
}

const DEFAULT_ACTION: ActionConfig = {
  icon: <Activity className="w-3.5 h-3.5" />,
  bg: 'bg-gray-100',
  color: 'text-gray-500',
  label: 'Hoạt động',
  group: 'general',
}

function getActionConfig(action: string): ActionConfig {
  return ACTION_CONFIGS[action] || DEFAULT_ACTION
}

// ============================================================================
// FILTER GROUPS
// ============================================================================

const FILTER_GROUPS: { key: string; label: string; icon: React.ReactNode }[] = [
  { key: 'all',       label: 'Tất cả',      icon: <Activity className="w-3.5 h-3.5" /> },
  { key: 'status',    label: 'Trạng thái',   icon: <ArrowUpDown className="w-3.5 h-3.5" /> },
  { key: 'member',    label: 'Nhân sự',      icon: <Users className="w-3.5 h-3.5" /> },
  { key: 'milestone', label: 'Milestone',    icon: <MilestoneIcon className="w-3.5 h-3.5" /> },
  { key: 'task',      label: 'Task',         icon: <ListTodo className="w-3.5 h-3.5" /> },
  { key: 'document',  label: 'Tài liệu',    icon: <FolderOpen className="w-3.5 h-3.5" /> },
  { key: 'risk',      label: 'Rủi ro',       icon: <ShieldAlert className="w-3.5 h-3.5" /> },
  { key: 'general',   label: 'Khác',         icon: <Edit3 className="w-3.5 h-3.5" /> },
]

// ============================================================================
// HELPERS
// ============================================================================

const PAGE_SIZE = 20

function timeAgo(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime()
  const m = Math.floor(ms / 60000)
  if (m < 1) return 'Vừa xong'
  if (m < 60) return `${m} phút trước`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} giờ trước`
  const d = Math.floor(h / 24)
  if (d === 1) return 'Hôm qua'
  if (d < 7) return `${d} ngày trước`
  if (d < 30) return `${Math.floor(d / 7)} tuần trước`
  if (d < 365) return `${Math.floor(d / 30)} tháng trước`
  return `${Math.floor(d / 365)} năm trước`
}

function fullDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

/** Group activities by date label */
function groupByDate(items: ActivityItem[]): { label: string; items: ActivityItem[] }[] {
  const groups: Map<string, ActivityItem[]> = new Map()
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  for (const item of items) {
    const d = new Date(item.created_at)
    d.setHours(0, 0, 0, 0)

    let label: string
    if (d.getTime() === today.getTime()) {
      label = 'Hôm nay'
    } else if (d.getTime() === yesterday.getTime()) {
      label = 'Hôm qua'
    } else if (d.getTime() > today.getTime() - 7 * 86400000) {
      label = 'Tuần này'
    } else if (d.getTime() > today.getTime() - 30 * 86400000) {
      label = 'Tháng này'
    } else {
      label = d.toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' })
    }

    if (!groups.has(label)) groups.set(label, [])
    groups.get(label)!.push(item)
  }

  return Array.from(groups.entries()).map(([label, items]) => ({ label, items }))
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const ProjectActivityTab: React.FC<ProjectActivityTabProps> = ({ projectId }) => {
  const [activities, setActivities] = useState<ActivityItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [filterGroup, setFilterGroup] = useState('all')
  const [totalCount, setTotalCount] = useState(0)

  // ==========================================================================
  // LOAD DATA
  // ==========================================================================

  const loadActivities = useCallback(async (append = false) => {
    if (append) setLoadingMore(true)
    else setLoading(true)

    try {
      const offset = append ? activities.length : 0

      let query = supabase
        .from('project_activities')
        .select('id, action, description, entity_type, entity_id, old_value, new_value, metadata, actor_id, created_at', { count: 'exact' })
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1)

      const { data, error, count } = await query

      if (error) throw error

      const items = (data || []) as any[]

      // Client-side join: actor names
      const actorIds = new Set<string>()
      items.forEach(a => { if (a.actor_id) actorIds.add(a.actor_id) })

      const empMap = new Map<string, { id: string; full_name: string }>()
      if (actorIds.size > 0) {
        const { data: empData } = await supabase
          .from('employees')
          .select('id, full_name')
          .in('id', Array.from(actorIds))
        ;(empData || []).forEach((e: any) => empMap.set(e.id, { id: e.id, full_name: e.full_name }))
      }

      const mapped: ActivityItem[] = items.map(a => ({
        ...a,
        actor: a.actor_id ? empMap.get(a.actor_id) : undefined,
      }))

      if (append) {
        setActivities(prev => [...prev, ...mapped])
      } else {
        setActivities(mapped)
      }

      setTotalCount(count || 0)
      setHasMore(items.length === PAGE_SIZE)
    } catch (err) {
      console.error('[ActivityTab] Load failed:', err)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [projectId, activities.length])

  useEffect(() => { loadActivities(false) }, [projectId])

  // ==========================================================================
  // FILTER
  // ==========================================================================

  const filtered = filterGroup === 'all'
    ? activities
    : activities.filter(a => getActionConfig(a.action).group === filterGroup)

  const dateGroups = groupByDate(filtered)

  // Stats
  const groupCounts: Record<string, number> = {}
  activities.forEach(a => {
    const g = getActionConfig(a.action).group
    groupCounts[g] = (groupCounts[g] || 0) + 1
  })

  // ==========================================================================
  // RENDER
  // ==========================================================================

  return (
    <div className="space-y-4">

      {/* STATS BAR */}
      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-[#1B4D3E]" />
            <h3 className="text-[13px] font-semibold text-gray-700">Nhật ký hoạt động</h3>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-gray-400 font-mono">{totalCount} hoạt động</span>
            <button
              onClick={() => loadActivities(false)}
              className="p-1.5 rounded-lg text-gray-400 active:bg-gray-100"
              title="Làm mới"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { key: 'status',    label: 'Trạng thái', color: 'bg-blue-500' },
            { key: 'member',    label: 'Nhân sự',    color: 'bg-purple-500' },
            { key: 'task',      label: 'Task',        color: 'bg-sky-500' },
            { key: 'milestone', label: 'Milestone',   color: 'bg-indigo-500' },
          ].map(s => (
            <div key={s.key} className="text-center">
              <div className="text-[16px] font-bold text-gray-800 font-mono">{groupCounts[s.key] || 0}</div>
              <div className="text-[10px] text-gray-400 flex items-center justify-center gap-1">
                <div className={`w-1.5 h-1.5 rounded-full ${s.color}`} />
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* FILTER CHIPS */}
      <div className="flex gap-1.5 overflow-x-auto scrollbar-hide -mx-1 px-1">
        {FILTER_GROUPS.map(fg => {
          const active = filterGroup === fg.key
          const cnt = fg.key === 'all' ? activities.length : (groupCounts[fg.key] || 0)
          return (
            <button
              key={fg.key}
              onClick={() => setFilterGroup(fg.key)}
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-semibold whitespace-nowrap border transition-colors
                ${active ? 'bg-[#1B4D3E] text-white border-[#1B4D3E]' : 'bg-white text-gray-600 border-gray-200 active:bg-gray-50'}`}
            >
              {fg.icon} {fg.label}
              {cnt > 0 && (
                <span className={`px-1 py-0.5 rounded-full text-[9px] font-bold leading-none ${active ? 'bg-white/20' : 'bg-gray-100 text-gray-500'}`}>
                  {cnt}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* LOADING */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      )}

      {/* EMPTY */}
      {!loading && filtered.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-100 py-16 text-center">
          <Activity className="w-14 h-14 text-gray-200 mx-auto mb-3" />
          <p className="text-[14px] text-gray-500 font-medium">
            {filterGroup !== 'all' ? 'Không có hoạt động loại này' : 'Chưa có hoạt động nào'}
          </p>
          <p className="text-[12px] text-gray-400 mt-1">
            Các thay đổi trong dự án sẽ được ghi nhận tại đây
          </p>
          {filterGroup !== 'all' && (
            <button
              onClick={() => setFilterGroup('all')}
              className="mt-3 inline-flex items-center gap-1 px-3 py-1.5 text-[12px] text-[#1B4D3E] font-medium active:underline"
            >
              <X className="w-3 h-3" /> Xóa bộ lọc
            </button>
          )}
        </div>
      )}

      {/* TIMELINE — grouped by date */}
      {!loading && dateGroups.map((group, gi) => (
        <div key={gi}>
          {/* Date group header */}
          <div className="flex items-center gap-2 mb-2 mt-1">
            <CalendarDays className="w-3.5 h-3.5 text-gray-400" />
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{group.label}</span>
            <div className="flex-1 h-px bg-gray-100" />
            <span className="text-[10px] text-gray-400 font-mono">{group.items.length}</span>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            {group.items.map((act, idx) => {
              const config = getActionConfig(act.action)
              const isLast = idx === group.items.length - 1

              return (
                <div
                  key={act.id}
                  className={`flex gap-3 px-4 py-3 ${!isLast ? 'border-b border-gray-50' : ''} hover:bg-gray-50/50 transition-colors`}
                >
                  {/* Timeline dot + line */}
                  <div className="flex flex-col items-center pt-0.5">
                    <div className={`w-7 h-7 rounded-lg ${config.bg} flex items-center justify-center shrink-0 ${config.color}`}>
                      {config.icon}
                    </div>
                    {!isLast && <div className="w-0.5 flex-1 bg-gray-100 mt-1" />}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 pb-0.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] text-gray-800 leading-snug">
                          {act.description || config.label}
                        </p>

                        {/* Change details (old → new) */}
                        {act.old_value && act.new_value && (
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className="px-1.5 py-0.5 bg-red-50 text-red-600 text-[10px] font-medium rounded line-through">
                              {act.old_value}
                            </span>
                            <span className="text-[10px] text-gray-400">→</span>
                            <span className="px-1.5 py-0.5 bg-green-50 text-green-600 text-[10px] font-medium rounded">
                              {act.new_value}
                            </span>
                          </div>
                        )}

                        {/* Entity badge */}
                        {act.entity_type && (
                          <span className="inline-flex items-center gap-0.5 mt-1 px-1.5 py-0.5 bg-gray-50 text-gray-500 text-[10px] font-medium rounded">
                            {act.entity_type === 'phase' && <ListTodo className="w-2.5 h-2.5" />}
                            {act.entity_type === 'milestone' && <MilestoneIcon className="w-2.5 h-2.5" />}
                            {act.entity_type === 'task' && <Target className="w-2.5 h-2.5" />}
                            {act.entity_type === 'document' && <FileText className="w-2.5 h-2.5" />}
                            {act.entity_type === 'risk' && <ShieldAlert className="w-2.5 h-2.5" />}
                            {act.entity_type === 'member' && <Users className="w-2.5 h-2.5" />}
                            {act.entity_type}
                          </span>
                        )}
                      </div>

                      {/* Action badge */}
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold shrink-0 ${config.bg} ${config.color}`}>
                        {config.label}
                      </span>
                    </div>

                    {/* Footer: actor + time */}
                    <div className="flex items-center gap-2 mt-1.5">
                      {act.actor && (
                        <div className="flex items-center gap-1">
                          <div className="w-4 h-4 rounded-full bg-[#1B4D3E] flex items-center justify-center text-white text-[8px] font-bold shrink-0">
                            {act.actor.full_name.charAt(0)}
                          </div>
                          <span className="text-[11px] text-gray-500 font-medium">{act.actor.full_name}</span>
                        </div>
                      )}
                      <span className="text-[10px] text-gray-400" title={fullDateTime(act.created_at)}>
                        {timeAgo(act.created_at)}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}

      {/* LOAD MORE */}
      {!loading && hasMore && filtered.length > 0 && (
        <button
          onClick={() => loadActivities(true)}
          disabled={loadingMore}
          className="w-full py-3 rounded-xl border border-gray-200 bg-white text-[13px] font-medium text-gray-600 flex items-center justify-center gap-2 active:bg-gray-50 disabled:opacity-50"
        >
          {loadingMore ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Đang tải...</>
          ) : (
            <><ChevronDown className="w-4 h-4" /> Xem thêm ({totalCount - activities.length} còn lại)</>
          )}
        </button>
      )}

      {/* ALL LOADED */}
      {!loading && !hasMore && activities.length > 0 && (
        <p className="text-center text-[11px] text-gray-400 py-2">
          Đã hiển thị tất cả {totalCount} hoạt động
        </p>
      )}
    </div>
  )
}

export default ProjectActivityTab