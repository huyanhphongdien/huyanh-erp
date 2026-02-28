// ============================================================================
// FILE: src/services/project/ganttService.ts
// MODULE: Quản lý Dự án — Huy Anh Rubber ERP
// PHASE: PM4 — Bước 4.1 (Fixed: date normalization to YYYY-MM-DD)
// ============================================================================

import { supabase } from '../../lib/supabase'

// ============================================================================
// TYPES
// ============================================================================

export type GanttItemType = 'project' | 'phase' | 'milestone' | 'task'
export type DependencyType = 'FS' | 'FF' | 'SS' | 'SF'

export interface GanttItem {
  id: string
  name: string
  type: GanttItemType
  start: string | null
  end: string | null
  progress: number
  color?: string
  parent_id: string | null
  assignee_name?: string
  assignee_id?: string
  status?: string
  is_critical?: boolean
  dependencies: string[]
  duration_days: number
  early_start?: string
  early_finish?: string
  late_start?: string
  late_finish?: string
  total_float?: number
}

export interface GanttDependency {
  id: string
  project_id: string
  source_id: string
  source_type: string
  target_id: string
  target_type: string
  dep_type: DependencyType
  lag_days: number
}

export interface GanttData {
  items: GanttItem[]
  dependencies: GanttDependency[]
  critical_path: string[]
  project_start: string | null
  project_end: string | null
  total_duration_days: number
}

export interface BaselineItem {
  item_id: string
  item_type: GanttItemType
  name: string
  planned_start: string | null
  planned_end: string | null
  progress: number
}

export interface BaselineVariance {
  item_id: string
  name: string
  type: GanttItemType
  baseline_start: string | null
  baseline_end: string | null
  actual_start: string | null
  actual_end: string | null
  start_variance_days: number
  end_variance_days: number
  progress_baseline: number
  progress_actual: number
}

export interface MultiProjectGanttParams {
  project_ids?: string[]
  department_id?: string
  status?: string
  priority?: string
}

export interface MultiProjectGanttResult {
  project_id: string
  project_code: string
  project_name: string
  status: string
  priority: string
  items: GanttItem[]
}

// ============================================================================
// INTERNAL DB TYPES
// ============================================================================

interface DbPhase {
  id: string; name: string
  planned_start: string | null; planned_end: string | null
  actual_start: string | null; actual_end: string | null
  progress_pct: number | null; status: string; color: string | null; order_index: number
  project_id?: string
}

interface DbMilestone {
  id: string; name: string; due_date: string; completed_date: string | null
  status: string; phase_id: string | null; assignee_id: string | null
  project_id?: string
}

interface DbDependency {
  id: string; project_id: string; source_type: string; source_id: string
  target_type: string; target_id: string; dep_type: string; lag_days: number
}

interface DbTask {
  id: string; name: string; start_date: string | null; due_date: string | null
  progress: number | null; status: string; assignee_id: string | null
  phase_id: string | null
}

interface DbProject {
  id: string; code: string; name: string
  planned_start: string | null; planned_end: string | null
  actual_start: string | null; actual_end: string | null
  progress_pct: number | null; status: string; priority: string
  department_id: string | null
}

// ============================================================================
// HELPERS
// ============================================================================

/** Normalize any date string to YYYY-MM-DD (strip time/timezone) */
function toDateOnly(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null
  if (dateStr.length === 10 && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr
  const match = dateStr.match(/^(\d{4}-\d{2}-\d{2})/)
  return match ? match[1] : null
}

function daysBetween(start: string | null, end: string | null): number {
  if (!start || !end) return 0
  const s = new Date(start)
  const e = new Date(end)
  const diff = Math.ceil((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24))
  return Math.max(diff, 0)
}

function addDays(date: string, days: number): string {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

function getMinDate(dates: (string | null | undefined)[]): string | null {
  const valid = dates.filter((d): d is string => !!d)
  if (valid.length === 0) return null
  return valid.sort()[0]
}

function getMaxDate(dates: (string | null | undefined)[]): string | null {
  const valid = dates.filter((d): d is string => !!d)
  if (valid.length === 0) return null
  return valid.sort().reverse()[0]
}

// ============================================================================
// GANTT SERVICE
// ============================================================================

export const ganttService = {

  // --------------------------------------------------------------------------
  // 1. GET GANTT DATA
  // --------------------------------------------------------------------------

  async getGanttData(projectId: string): Promise<GanttData> {
    const [projectRes, phasesRes, milestonesRes, depsRes] = await Promise.all([
      supabase
        .from('projects')
        .select('id, code, name, planned_start, planned_end, actual_start, actual_end, progress_pct, status')
        .eq('id', projectId)
        .single(),

      supabase
        .from('project_phases')
        .select('id, name, planned_start, planned_end, actual_start, actual_end, progress_pct, status, color, order_index')
        .eq('project_id', projectId)
        .order('order_index', { ascending: true }),

      supabase
        .from('project_milestones')
        .select('id, name, due_date, completed_date, status, phase_id, assignee_id')
        .eq('project_id', projectId)
        .order('due_date', { ascending: true }),

      supabase
        .from('project_dependencies')
        .select('id, project_id, source_type, source_id, target_type, target_id, dep_type, lag_days')
        .eq('project_id', projectId),
    ])

    // Tasks query
    let tasksRes: { data: any[] | null; error: any } = { data: [], error: null }
    try {
      tasksRes = await supabase
        .from('tasks')
        .select('id, name, start_date, due_date, progress, status, assignee_id, phase_id')
        .eq('project_id', projectId)
        .order('start_date', { ascending: true })
        .limit(500)
    } catch (e) {
      console.warn('Tasks query failed:', e)
    }
    if (tasksRes.error) {
      console.warn('Tasks query error (ignored):', tasksRes.error.message)
      tasksRes.data = []
    }

    if (projectRes.error) throw projectRes.error

    const project = projectRes.data as unknown as DbProject
    const phases = (phasesRes.data || []) as unknown as DbPhase[]
    const milestones = (milestonesRes.data || []) as unknown as DbMilestone[]
    const deps = (depsRes.data || []) as unknown as DbDependency[]
    const tasks = (tasksRes.data || []) as unknown as DbTask[]

    // Batch assignee names
    const assigneeIds = new Set<string>()
    for (const ms of milestones) { if (ms.assignee_id) assigneeIds.add(ms.assignee_id) }
    for (const task of tasks) { if (task.assignee_id) assigneeIds.add(task.assignee_id) }

    const assigneeMap = new Map<string, string>()
    if (assigneeIds.size > 0) {
      const { data: employees } = await supabase
        .from('employees').select('id, full_name').in('id', Array.from(assigneeIds))
      if (employees) {
        for (const emp of employees) assigneeMap.set(emp.id as string, emp.full_name as string)
      }
    }

    // Dependency lookup
    const depLookup = new Map<string, string[]>()
    for (const dep of deps) {
      const existing = depLookup.get(dep.target_id) || []
      existing.push(dep.source_id)
      depLookup.set(dep.target_id, existing)
    }

    // --- Build Gantt Items (ALL dates normalized to YYYY-MM-DD) ---
    const items: GanttItem[] = []

    // Phase items
    for (const phase of phases) {
      const start = toDateOnly(phase.actual_start) || toDateOnly(phase.planned_start)
      const end = toDateOnly(phase.actual_end) || toDateOnly(phase.planned_end)

      items.push({
        id: phase.id,
        name: phase.name,
        type: 'phase',
        start,
        end,
        progress: Number(phase.progress_pct) || 0,
        color: phase.color || '#1B4D3E',
        parent_id: null,
        status: phase.status,
        dependencies: depLookup.get(phase.id) || [],
        duration_days: daysBetween(start, end),
      })
    }

    // Milestone items
    for (const ms of milestones) {
      const dueDate = toDateOnly(ms.due_date)
      items.push({
        id: ms.id,
        name: ms.name,
        type: 'milestone',
        start: dueDate,
        end: dueDate,
        progress: ms.status === 'completed' ? 100 : 0,
        parent_id: ms.phase_id || null,
        assignee_name: ms.assignee_id ? assigneeMap.get(ms.assignee_id) : undefined,
        assignee_id: ms.assignee_id || undefined,
        status: ms.status,
        dependencies: depLookup.get(ms.id) || [],
        duration_days: 0,
      })
    }

    // Task items — dates normalized!
    for (const task of tasks) {
      const taskStart = toDateOnly(task.start_date)
      const taskEnd = toDateOnly(task.due_date)

      items.push({
        id: task.id,
        name: task.name || 'Untitled task',
        type: 'task',
        start: taskStart,
        end: taskEnd,
        progress: Number(task.progress) || 0,
        parent_id: task.phase_id || null,
        assignee_name: task.assignee_id ? assigneeMap.get(task.assignee_id) : undefined,
        assignee_id: task.assignee_id || undefined,
        status: task.status,
        dependencies: depLookup.get(task.id) || [],
        duration_days: daysBetween(taskStart, taskEnd),
      })
    }

    // Dependencies
    const ganttDeps: GanttDependency[] = deps.map(d => ({
      id: d.id,
      project_id: d.project_id,
      source_id: d.source_id,
      source_type: d.source_type,
      target_id: d.target_id,
      target_type: d.target_type,
      dep_type: d.dep_type as DependencyType,
      lag_days: d.lag_days || 0,
    }))

    // Critical path
    const criticalPath = this._calculateCriticalPath(items, ganttDeps)
    const criticalSet = new Set(criticalPath)
    for (const item of items) {
      item.is_critical = criticalSet.has(item.id)
    }

    // Project dates
    const allStarts = items.map(i => i.start)
    const allEnds = items.map(i => i.end)
    const projectStart = getMinDate(allStarts) || toDateOnly(project.planned_start)
    const projectEnd = getMaxDate(allEnds) || toDateOnly(project.planned_end)

    return {
      items,
      dependencies: ganttDeps,
      critical_path: criticalPath,
      project_start: projectStart,
      project_end: projectEnd,
      total_duration_days: daysBetween(projectStart, projectEnd),
    }
  },

  // --------------------------------------------------------------------------
  // 2. CRITICAL PATH (CPM) — unchanged logic
  // --------------------------------------------------------------------------

  async calculateCriticalPath(projectId: string): Promise<string[]> {
    const ganttData = await this.getGanttData(projectId)
    return ganttData.critical_path
  },

  _calculateCriticalPath(items: GanttItem[], dependencies: GanttDependency[]): string[] {
    const validItems = items.filter(i => i.start && i.end && i.type !== 'milestone')
    if (validItems.length === 0) return []

    type DepLink = { targetId: string; depType: DependencyType; lag: number }
    type PredLink = { sourceId: string; depType: DependencyType; lag: number }

    const successorMap = new Map<string, DepLink[]>()
    const predecessorMap = new Map<string, PredLink[]>()

    for (const dep of dependencies) {
      if (!successorMap.has(dep.source_id)) successorMap.set(dep.source_id, [])
      successorMap.get(dep.source_id)!.push({ targetId: dep.target_id, depType: dep.dep_type, lag: dep.lag_days })

      if (!predecessorMap.has(dep.target_id)) predecessorMap.set(dep.target_id, [])
      predecessorMap.get(dep.target_id)!.push({ sourceId: dep.source_id, depType: dep.dep_type, lag: dep.lag_days })
    }

    const itemMap = new Map<string, GanttItem>()
    for (const item of validItems) itemMap.set(item.id, item)

    const projectStartDate = getMinDate(validItems.map(i => i.start))
    if (!projectStartDate) return []

    const sorted = this._topologicalSort(validItems.map(i => i.id), dependencies)

    // Forward pass
    const es = new Map<string, number>()
    const ef = new Map<string, number>()

    for (const id of sorted) {
      const item = itemMap.get(id)
      if (!item || !item.start || !item.end) continue

      const duration = item.duration_days || daysBetween(item.start, item.end)
      const preds = predecessorMap.get(id)

      if (!preds || preds.length === 0) {
        es.set(id, daysBetween(projectStartDate, item.start))
      } else {
        let maxConstraint = 0
        for (const pred of preds) {
          const predEF = ef.get(pred.sourceId) ?? 0
          const predES = es.get(pred.sourceId) ?? 0
          let constraint = 0
          switch (pred.depType) {
            case 'FS': constraint = predEF + pred.lag; break
            case 'FF': constraint = predEF - duration + pred.lag; break
            case 'SS': constraint = predES + pred.lag; break
            case 'SF': constraint = predES - duration + pred.lag; break
          }
          maxConstraint = Math.max(maxConstraint, constraint)
        }
        es.set(id, maxConstraint)
      }
      ef.set(id, (es.get(id) ?? 0) + duration)
    }

    // Backward pass
    const ls = new Map<string, number>()
    const lf = new Map<string, number>()

    const efValues = Array.from(ef.values())
    const projectFinish = efValues.length > 0 ? Math.max(...efValues) : 0
    const reverseSorted = [...sorted].reverse()

    for (const id of reverseSorted) {
      const item = itemMap.get(id)
      if (!item || !item.start || !item.end) continue

      const duration = item.duration_days || daysBetween(item.start, item.end)
      const succs = successorMap.get(id)

      if (!succs || succs.length === 0) {
        lf.set(id, projectFinish)
      } else {
        let minConstraint = projectFinish
        for (const succ of succs) {
          const succLS = ls.get(succ.targetId) ?? projectFinish
          const succLF = lf.get(succ.targetId) ?? projectFinish
          let constraint = projectFinish
          switch (succ.depType) {
            case 'FS': constraint = succLS - succ.lag; break
            case 'FF': constraint = succLF - succ.lag; break
            case 'SS': constraint = succLS + duration - succ.lag; break
            case 'SF': constraint = succLF + duration - succ.lag; break
          }
          minConstraint = Math.min(minConstraint, constraint)
        }
        lf.set(id, minConstraint)
      }
      ls.set(id, (lf.get(id) ?? 0) - duration)
    }

    // Float & Critical Path
    const criticalPath: string[] = []
    for (const id of sorted) {
      const item = itemMap.get(id)
      if (!item) continue

      const totalFloat = (ls.get(id) ?? 0) - (es.get(id) ?? 0)
      item.early_start = addDays(projectStartDate, es.get(id) ?? 0)
      item.early_finish = addDays(projectStartDate, ef.get(id) ?? 0)
      item.late_start = addDays(projectStartDate, ls.get(id) ?? 0)
      item.late_finish = addDays(projectStartDate, lf.get(id) ?? 0)
      item.total_float = totalFloat

      if (Math.abs(totalFloat) < 0.01) criticalPath.push(id)
    }

    return criticalPath
  },

  _topologicalSort(itemIds: string[], dependencies: GanttDependency[]): string[] {
    const inDegree = new Map<string, number>()
    const adj = new Map<string, string[]>()

    for (const id of itemIds) { inDegree.set(id, 0); adj.set(id, []) }

    for (const dep of dependencies) {
      if (inDegree.has(dep.source_id) && inDegree.has(dep.target_id)) {
        adj.get(dep.source_id)!.push(dep.target_id)
        inDegree.set(dep.target_id, (inDegree.get(dep.target_id) || 0) + 1)
      }
    }

    const queue: string[] = []
    for (const [id, degree] of inDegree) { if (degree === 0) queue.push(id) }

    const sorted: string[] = []
    while (queue.length > 0) {
      const current = queue.shift()!
      sorted.push(current)
      const neighbors = adj.get(current)
      if (neighbors) {
        for (const neighbor of neighbors) {
          const newDegree = (inDegree.get(neighbor) || 1) - 1
          inDegree.set(neighbor, newDegree)
          if (newDegree === 0) queue.push(neighbor)
        }
      }
    }

    for (const id of itemIds) { if (!sorted.includes(id)) sorted.push(id) }
    return sorted
  },

  // --------------------------------------------------------------------------
  // 3. AUTO-SCHEDULE
  // --------------------------------------------------------------------------

  async autoSchedule(projectId: string): Promise<{ updated_count: number; items: GanttItem[] }> {
    const ganttData = await this.getGanttData(projectId)
    const { items, dependencies } = ganttData

    const projectStart = ganttData.project_start
    if (!projectStart) return { updated_count: 0, items }

    const schedulableItems = items.filter(i => i.start && i.end && i.type !== 'milestone')
    const sorted = this._topologicalSort(schedulableItems.map(i => i.id), dependencies)

    type PredLink = { sourceId: string; depType: DependencyType; lag: number }
    const predMap = new Map<string, PredLink[]>()
    for (const dep of dependencies) {
      if (!predMap.has(dep.target_id)) predMap.set(dep.target_id, [])
      predMap.get(dep.target_id)!.push({ sourceId: dep.source_id, depType: dep.dep_type, lag: dep.lag_days })
    }

    const itemMap = new Map<string, GanttItem>()
    for (const item of items) itemMap.set(item.id, item)

    const newDates = new Map<string, { start: string; end: string }>()
    let updatedCount = 0

    for (const id of sorted) {
      const item = itemMap.get(id)
      if (!item || !item.start || !item.end) continue

      const duration = item.duration_days || daysBetween(item.start, item.end)
      const preds = predMap.get(id)
      let newStart = item.start

      if (preds && preds.length > 0) {
        let latestConstraint = ''
        for (const pred of preds) {
          const predItem = itemMap.get(pred.sourceId)
          if (!predItem) continue
          const predEnd = newDates.get(pred.sourceId)?.end || predItem.end
          const predStart = newDates.get(pred.sourceId)?.start || predItem.start
          if (!predEnd || !predStart) continue

          let constraint = ''
          switch (pred.depType) {
            case 'FS': constraint = addDays(predEnd, pred.lag); break
            case 'FF': constraint = addDays(predEnd, pred.lag - duration); break
            case 'SS': constraint = addDays(predStart, pred.lag); break
            case 'SF': constraint = addDays(predStart, pred.lag - duration); break
          }
          if (!latestConstraint || constraint > latestConstraint) latestConstraint = constraint
        }
        if (latestConstraint && latestConstraint > item.start) newStart = latestConstraint
      }

      const newEnd = addDays(newStart, duration)
      newDates.set(id, { start: newStart, end: newEnd })
      if (newStart !== item.start || newEnd !== item.end) updatedCount++
    }

    // Persist
    const now = new Date().toISOString()
    for (const [id, dates] of newDates) {
      const item = itemMap.get(id)
      if (!item) continue
      if (dates.start === item.start && dates.end === item.end) continue

      if (item.type === 'phase') {
        await supabase.from('project_phases')
          .update({ planned_start: dates.start, planned_end: dates.end, updated_at: now })
          .eq('id', id)
      } else if (item.type === 'task') {
        await supabase.from('tasks')
          .update({ start_date: dates.start, due_date: dates.end, updated_at: now })
          .eq('id', id)
      } else if (item.type === 'milestone') {
        await supabase.from('project_milestones')
          .update({ due_date: dates.start, updated_at: now })
          .eq('id', id)
      }
    }

    for (const item of items) {
      const nd = newDates.get(item.id)
      if (nd) { item.start = nd.start; item.end = nd.end }
    }

    return { updated_count: updatedCount, items }
  },

  // --------------------------------------------------------------------------
  // 4. MULTI-PROJECT GANTT
  // --------------------------------------------------------------------------

  async getMultiProjectGantt(params: MultiProjectGanttParams = {}): Promise<{
    projects: MultiProjectGanttResult[]; overall_start: string | null; overall_end: string | null
  }> {
    let query = supabase
      .from('projects')
      .select('id, code, name, status, priority, planned_start, planned_end, progress_pct, department_id')
      .eq('is_template', false)
      .not('status', 'in', '("cancelled","draft")')
      .order('planned_start', { ascending: true })

    if (params.project_ids?.length) query = query.in('id', params.project_ids)
    if (params.department_id) query = query.eq('department_id', params.department_id)
    if (params.status) query = query.eq('status', params.status)
    if (params.priority) query = query.eq('priority', params.priority)

    const { data: projectsRaw, error } = await query
    if (error) throw error

    const projects = (projectsRaw || []) as unknown as DbProject[]
    if (projects.length === 0) return { projects: [], overall_start: null, overall_end: null }

    const projectIds = projects.map(p => p.id)

    const [phasesRes, milestonesRes] = await Promise.all([
      supabase.from('project_phases')
        .select('id, project_id, name, planned_start, planned_end, actual_start, actual_end, progress_pct, status, color, order_index')
        .in('project_id', projectIds)
        .order('order_index', { ascending: true }),
      supabase.from('project_milestones')
        .select('id, project_id, name, due_date, completed_date, status, phase_id')
        .in('project_id', projectIds)
        .order('due_date', { ascending: true }),
    ])

    const allPhases = (phasesRes.data || []) as unknown as (DbPhase & { project_id: string })[]
    const allMilestones = (milestonesRes.data || []) as unknown as (DbMilestone & { project_id: string })[]

    const result: MultiProjectGanttResult[] = projects.map(project => {
      const pPhases = allPhases.filter(p => p.project_id === project.id)
      const pMilestones = allMilestones.filter(m => m.project_id === project.id)
      const items: GanttItem[] = []

      items.push({
        id: project.id,
        name: `${project.code} — ${project.name}`,
        type: 'project',
        start: toDateOnly(project.planned_start),
        end: toDateOnly(project.planned_end),
        progress: Number(project.progress_pct) || 0,
        color: '#1B4D3E',
        parent_id: null,
        status: project.status,
        dependencies: [],
        duration_days: daysBetween(project.planned_start, project.planned_end),
      })

      for (const phase of pPhases) {
        const start = toDateOnly(phase.actual_start) || toDateOnly(phase.planned_start)
        const end = toDateOnly(phase.actual_end) || toDateOnly(phase.planned_end)
        items.push({
          id: phase.id, name: phase.name, type: 'phase',
          start, end,
          progress: Number(phase.progress_pct) || 0,
          color: phase.color || '#2D6A4F',
          parent_id: project.id, status: phase.status,
          dependencies: [], duration_days: daysBetween(start, end),
        })
      }

      for (const ms of pMilestones) {
        const dueDate = toDateOnly(ms.due_date)
        items.push({
          id: ms.id, name: ms.name, type: 'milestone',
          start: dueDate, end: dueDate,
          progress: ms.status === 'completed' ? 100 : 0,
          parent_id: ms.phase_id || project.id,
          status: ms.status, dependencies: [], duration_days: 0,
        })
      }

      return {
        project_id: project.id,
        project_code: project.code,
        project_name: project.name,
        status: project.status,
        priority: project.priority,
        items,
      }
    })

    return {
      projects: result,
      overall_start: getMinDate(projects.map(p => p.planned_start)),
      overall_end: getMaxDate(projects.map(p => p.planned_end)),
    }
  },

  // --------------------------------------------------------------------------
  // 5. BASELINE
  // --------------------------------------------------------------------------

  async saveBaseline(projectId: string, createdBy?: string): Promise<{ id: string; snapshot_date: string; item_count: number }> {
    const ganttData = await this.getGanttData(projectId)
    const baselineItems: BaselineItem[] = ganttData.items.map(item => ({
      item_id: item.id, item_type: item.type, name: item.name,
      planned_start: item.start, planned_end: item.end, progress: item.progress,
    }))

    const snapshotDate = new Date().toISOString().split('T')[0]
    const { data, error } = await supabase
      .from('project_baselines')
      .insert({ project_id: projectId, snapshot_date: snapshotDate, data: baselineItems, created_by: createdBy || null })
      .select('id').single()

    if (error) throw error
    return { id: (data as unknown as { id: string }).id, snapshot_date: snapshotDate, item_count: baselineItems.length }
  },

  async compareBaseline(projectId: string, baselineId?: string): Promise<BaselineVariance[]> {
    let baselineQuery = supabase
      .from('project_baselines')
      .select('id, project_id, snapshot_date, data, created_by, created_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false }).limit(1)

    if (baselineId) {
      baselineQuery = supabase
        .from('project_baselines')
        .select('id, project_id, snapshot_date, data, created_by, created_at')
        .eq('id', baselineId).limit(1)
    }

    const { data: baselineRows, error: blError } = await baselineQuery
    if (blError) throw blError
    if (!baselineRows || baselineRows.length === 0) throw new Error('Không tìm thấy baseline')

    const row = baselineRows[0]
    const baselineItems = (Array.isArray(row.data) ? row.data : []) as unknown as BaselineItem[]

    const ganttData = await this.getGanttData(projectId)
    const actualMap = new Map<string, GanttItem>()
    for (const item of ganttData.items) actualMap.set(item.id, item)

    return baselineItems.map(bl => {
      const actual = actualMap.get(bl.item_id)
      return {
        item_id: bl.item_id, name: bl.name, type: bl.item_type,
        baseline_start: bl.planned_start, baseline_end: bl.planned_end,
        actual_start: actual?.start || null, actual_end: actual?.end || null,
        start_variance_days: actual?.start && bl.planned_start ? daysBetween(bl.planned_start, actual.start) : 0,
        end_variance_days: actual?.end && bl.planned_end ? daysBetween(bl.planned_end, actual.end) : 0,
        progress_baseline: bl.progress, progress_actual: actual?.progress || 0,
      }
    })
  },

  async getBaselines(projectId: string): Promise<Array<{
    id: string; snapshot_date: string; item_count: number; created_by: string | null; created_at: string
  }>> {
    const { data, error } = await supabase
      .from('project_baselines')
      .select('id, snapshot_date, data, created_by, created_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })

    if (error) throw error
    return (data || []).map(row => ({
      id: row.id as string,
      snapshot_date: row.snapshot_date as string,
      item_count: (Array.isArray(row.data) ? row.data : []).length,
      created_by: (row.created_by as string | null) || null,
      created_at: row.created_at as string,
    }))
  },
}

export default ganttService