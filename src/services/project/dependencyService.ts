// ============================================================================
// FILE: src/services/project/dependencyService.ts
// MODULE: Quản lý Dự án (Project Management) — Huy Anh Rubber ERP
// PHASE: PM4 — Bước 4.2
// MÔ TẢ: CRUD dependencies giữa phases/milestones/tasks,
//         validate circular dependency, lấy dependency chain
// BẢNG: project_dependencies
// PATTERN: async/await, Supabase, ERP standard
// ============================================================================

import { supabase } from '../../lib/supabase'
import type { DependencyType } from './ganttService'

// ============================================================================
// TYPES
// ============================================================================

export type DependencyItemType = 'phase' | 'milestone' | 'task'

export interface ProjectDependency {
  id: string
  project_id: string
  source_type: DependencyItemType
  source_id: string
  target_type: DependencyItemType
  target_id: string
  dep_type: DependencyType
  lag_days: number
  created_at: string
  source_name?: string
  target_name?: string
}

export interface CreateDependencyData {
  project_id: string
  source_type: DependencyItemType
  source_id: string
  target_type: DependencyItemType
  target_id: string
  dep_type?: DependencyType
  lag_days?: number
}

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

export interface ChainItem {
  id: string
  name: string
  type: DependencyItemType
  direction: 'predecessor' | 'successor'
  dep_type: DependencyType
  lag_days: number
  depth: number
}

// ============================================================================
// INTERNAL TYPES
// ============================================================================

interface DbDependency {
  id: string
  project_id: string
  source_type: string
  source_id: string
  target_type: string
  target_id: string
  dep_type: string
  lag_days: number
  created_at: string
}

// ============================================================================
// HELPER: cast DB row → ProjectDependency
// ============================================================================

function toProjectDependency(d: DbDependency): ProjectDependency {
  return {
    id: d.id,
    project_id: d.project_id,
    source_type: d.source_type as DependencyItemType,
    source_id: d.source_id,
    target_type: d.target_type as DependencyItemType,
    target_id: d.target_id,
    dep_type: d.dep_type as DependencyType,
    lag_days: d.lag_days || 0,
    created_at: d.created_at,
  }
}

// ============================================================================
// SERVICE
// ============================================================================

export const dependencyService = {

  // --------------------------------------------------------------------------
  // 1. GET
  // --------------------------------------------------------------------------

  async getByProject(projectId: string): Promise<ProjectDependency[]> {
    const { data, error } = await supabase
      .from('project_dependencies')
      .select('id, project_id, source_type, source_id, target_type, target_id, dep_type, lag_days, created_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true })

    if (error) throw error

    const deps = (data || []) as unknown as DbDependency[]

    // Lấy tên source/target
    const nameMap = await this._getItemNames(deps)

    return deps.map((d) => ({
      ...toProjectDependency(d),
      source_name: nameMap.get(d.source_id),
      target_name: nameMap.get(d.target_id),
    }))
  },

  async getById(id: string): Promise<ProjectDependency | null> {
    const { data, error } = await supabase
      .from('project_dependencies')
      .select('id, project_id, source_type, source_id, target_type, target_id, dep_type, lag_days, created_at')
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null
      throw error
    }

    return toProjectDependency(data as unknown as DbDependency)
  },

  // --------------------------------------------------------------------------
  // 2. CREATE — với circular dependency check
  // --------------------------------------------------------------------------

  async create(input: CreateDependencyData): Promise<ProjectDependency> {
    if (input.source_id === input.target_id) {
      throw new Error('Không thể tạo dependency với chính nó')
    }

    // Check duplicate
    const { data: existing } = await supabase
      .from('project_dependencies')
      .select('id')
      .eq('project_id', input.project_id)
      .eq('source_id', input.source_id)
      .eq('target_id', input.target_id)
      .limit(1)

    if (existing && existing.length > 0) {
      throw new Error('Dependency này đã tồn tại')
    }

    // Check circular
    const wouldCreateCycle = await this._wouldCreateCycle(
      input.project_id,
      input.source_id,
      input.target_id
    )

    if (wouldCreateCycle) {
      throw new Error('Không thể tạo dependency — sẽ tạo vòng lặp (circular dependency)')
    }

    const { data, error } = await supabase
      .from('project_dependencies')
      .insert({
        project_id: input.project_id,
        source_type: input.source_type,
        source_id: input.source_id,
        target_type: input.target_type,
        target_id: input.target_id,
        dep_type: input.dep_type || 'FS',
        lag_days: input.lag_days || 0,
      })
      .select('id, project_id, source_type, source_id, target_type, target_id, dep_type, lag_days, created_at')
      .single()

    if (error) throw error

    return toProjectDependency(data as unknown as DbDependency)
  },

  // --------------------------------------------------------------------------
  // 3. UPDATE
  // --------------------------------------------------------------------------

  async update(
    id: string,
    updates: { dep_type?: DependencyType; lag_days?: number }
  ): Promise<ProjectDependency> {
    const { data, error } = await supabase
      .from('project_dependencies')
      .update(updates)
      .eq('id', id)
      .select('id, project_id, source_type, source_id, target_type, target_id, dep_type, lag_days, created_at')
      .single()

    if (error) throw error

    return toProjectDependency(data as unknown as DbDependency)
  },

  // --------------------------------------------------------------------------
  // 4. DELETE
  // --------------------------------------------------------------------------

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('project_dependencies')
      .delete()
      .eq('id', id)

    if (error) throw error
  },

  async deleteByItem(projectId: string, itemId: string): Promise<number> {
    const { data, error } = await supabase
      .from('project_dependencies')
      .delete()
      .eq('project_id', projectId)
      .or(`source_id.eq.${itemId},target_id.eq.${itemId}`)
      .select('id')

    if (error) throw error
    return data?.length || 0
  },

  // --------------------------------------------------------------------------
  // 5. VALIDATE
  // --------------------------------------------------------------------------

  async validateDependencies(projectId: string): Promise<ValidationResult> {
    const errors: string[] = []

    const { data: depsRaw } = await supabase
      .from('project_dependencies')
      .select('id, source_id, target_id, dep_type, lag_days')
      .eq('project_id', projectId)

    const deps = (depsRaw || []) as unknown as DbDependency[]
    if (deps.length === 0) {
      return { valid: true, errors: [] }
    }

    // Duplicates
    const seen = new Set<string>()
    for (const dep of deps) {
      const key = `${dep.source_id}->${dep.target_id}`
      if (seen.has(key)) {
        errors.push(`Duplicate dependency: ${key}`)
      }
      seen.add(key)
    }

    // Self-references
    for (const dep of deps) {
      if (dep.source_id === dep.target_id) {
        errors.push(`Self-reference: ${dep.source_id}`)
      }
    }

    // Cycles
    if (this._detectCycle(deps)) {
      errors.push('Phát hiện vòng lặp (circular dependency) trong project')
    }

    return { valid: errors.length === 0, errors }
  },

  // --------------------------------------------------------------------------
  // 6. DEPENDENCY CHAIN
  // --------------------------------------------------------------------------

  async getDependencyChain(projectId: string, itemId: string): Promise<{
    predecessors: ChainItem[]
    successors: ChainItem[]
  }> {
    const { data: depsRaw } = await supabase
      .from('project_dependencies')
      .select('id, source_type, source_id, target_type, target_id, dep_type, lag_days')
      .eq('project_id', projectId)

    const deps = (depsRaw || []) as unknown as DbDependency[]

    // Forward adj: source → targets (successors)
    // Backward adj: target → sources (predecessors)
    type AdjItem = { id: string; type: string; depType: string; lag: number }
    const forwardAdj = new Map<string, AdjItem[]>()
    const backwardAdj = new Map<string, AdjItem[]>()

    for (const dep of deps) {
      if (!forwardAdj.has(dep.source_id)) forwardAdj.set(dep.source_id, [])
      forwardAdj.get(dep.source_id)!.push({
        id: dep.target_id,
        type: dep.target_type,
        depType: dep.dep_type,
        lag: dep.lag_days,
      })

      if (!backwardAdj.has(dep.target_id)) backwardAdj.set(dep.target_id, [])
      backwardAdj.get(dep.target_id)!.push({
        id: dep.source_id,
        type: dep.source_type,
        depType: dep.dep_type,
        lag: dep.lag_days,
      })
    }

    // BFS predecessors + successors
    const predecessors = this._bfsChain(itemId, backwardAdj, 'predecessor')
    const successors = this._bfsChain(itemId, forwardAdj, 'successor')

    // Lấy names
    const allIds = [
      ...predecessors.map((p) => p.id),
      ...successors.map((s) => s.id),
    ]

    if (allIds.length > 0) {
      const nameMap = await this._getItemNamesByIds(allIds)
      for (const p of predecessors) p.name = nameMap.get(p.id) || p.id
      for (const s of successors) s.name = nameMap.get(s.id) || s.id
    }

    return { predecessors, successors }
  },

  // --------------------------------------------------------------------------
  // PRIVATE HELPERS
  // --------------------------------------------------------------------------

  _bfsChain(
    startId: string,
    adj: Map<string, Array<{ id: string; type: string; depType: string; lag: number }>>,
    direction: 'predecessor' | 'successor'
  ): ChainItem[] {
    const result: ChainItem[] = []
    const visited = new Set<string>()
    const queue: Array<{ id: string; type: string; depType: string; lag: number; depth: number }> = []

    const neighbors = adj.get(startId) || []
    for (const n of neighbors) {
      queue.push({ ...n, depth: 1 })
    }

    while (queue.length > 0) {
      const current = queue.shift()!
      if (visited.has(current.id)) continue
      visited.add(current.id)

      result.push({
        id: current.id,
        name: current.id,
        type: current.type as DependencyItemType,
        direction,
        dep_type: current.depType as DependencyType,
        lag_days: current.lag,
        depth: current.depth,
      })

      const nextNeighbors = adj.get(current.id) || []
      for (const n of nextNeighbors) {
        if (!visited.has(n.id)) {
          queue.push({ ...n, depth: current.depth + 1 })
        }
      }
    }

    return result
  },

  async _wouldCreateCycle(
    projectId: string,
    sourceId: string,
    targetId: string
  ): Promise<boolean> {
    const { data: depsRaw } = await supabase
      .from('project_dependencies')
      .select('source_id, target_id')
      .eq('project_id', projectId)

    const deps = (depsRaw || []) as unknown as Array<{ source_id: string; target_id: string }>

    // Build adj + thêm edge mới
    const adj = new Map<string, string[]>()
    for (const dep of deps) {
      if (!adj.has(dep.source_id)) adj.set(dep.source_id, [])
      adj.get(dep.source_id)!.push(dep.target_id)
    }

    if (!adj.has(sourceId)) adj.set(sourceId, [])
    adj.get(sourceId)!.push(targetId)

    // DFS từ target xem reach được source không → cycle
    const visited = new Set<string>()
    const stack = [targetId]

    while (stack.length > 0) {
      const current = stack.pop()!
      if (current === sourceId) return true
      if (visited.has(current)) continue
      visited.add(current)

      const neighbors = adj.get(current) || []
      for (const n of neighbors) {
        if (!visited.has(n)) stack.push(n)
      }
    }

    return false
  },

  _detectCycle(deps: DbDependency[]): boolean {
    const adj = new Map<string, string[]>()
    const allNodes = new Set<string>()

    for (const dep of deps) {
      allNodes.add(dep.source_id)
      allNodes.add(dep.target_id)
      if (!adj.has(dep.source_id)) adj.set(dep.source_id, [])
      adj.get(dep.source_id)!.push(dep.target_id)
    }

    const color = new Map<string, number>() // 0=white, 1=gray, 2=black
    for (const node of allNodes) color.set(node, 0)

    const dfs = (node: string): boolean => {
      color.set(node, 1)
      for (const n of (adj.get(node) || [])) {
        if (color.get(n) === 1) return true
        if (color.get(n) === 0 && dfs(n)) return true
      }
      color.set(node, 2)
      return false
    }

    for (const node of allNodes) {
      if (color.get(node) === 0 && dfs(node)) return true
    }
    return false
  },

  /**
   * Lấy tên items — dùng await thay vì .then() (fix TS error)
   */
  async _getItemNames(deps: DbDependency[]): Promise<Map<string, string>> {
    const nameMap = new Map<string, string>()
    if (deps.length === 0) return nameMap

    const phaseIds: string[] = []
    const milestoneIds: string[] = []
    const taskIds: string[] = []

    for (const dep of deps) {
      if (dep.source_type === 'phase') phaseIds.push(dep.source_id)
      else if (dep.source_type === 'milestone') milestoneIds.push(dep.source_id)
      else if (dep.source_type === 'task') taskIds.push(dep.source_id)

      if (dep.target_type === 'phase') phaseIds.push(dep.target_id)
      else if (dep.target_type === 'milestone') milestoneIds.push(dep.target_id)
      else if (dep.target_type === 'task') taskIds.push(dep.target_id)
    }

    // Deduplicate
    const uniquePhaseIds = [...new Set(phaseIds)]
    const uniqueMilestoneIds = [...new Set(milestoneIds)]
    const uniqueTaskIds = [...new Set(taskIds)]

    // Query song song bằng Promise.all + await (KHÔNG dùng .then)
    const [phasesRes, milestonesRes, tasksRes] = await Promise.all([
      uniquePhaseIds.length > 0
        ? supabase.from('project_phases').select('id, name').in('id', uniquePhaseIds)
        : Promise.resolve({ data: null }),

      uniqueMilestoneIds.length > 0
        ? supabase.from('project_milestones').select('id, name').in('id', uniqueMilestoneIds)
        : Promise.resolve({ data: null }),

      uniqueTaskIds.length > 0
        ? supabase.from('tasks').select('id, title').in('id', uniqueTaskIds)
        : Promise.resolve({ data: null }),
    ])

    if (phasesRes.data) {
      for (const row of phasesRes.data) {
        nameMap.set(row.id as string, row.name as string)
      }
    }
    if (milestonesRes.data) {
      for (const row of milestonesRes.data) {
        nameMap.set(row.id as string, row.name as string)
      }
    }
    if (tasksRes.data) {
      for (const row of tasksRes.data) {
        nameMap.set(row.id as string, (row as unknown as { id: string; title: string }).title)
      }
    }

    return nameMap
  },

  async _getItemNamesByIds(itemIds: string[]): Promise<Map<string, string>> {
    const nameMap = new Map<string, string>()
    if (itemIds.length === 0) return nameMap

    const uniqueIds = [...new Set(itemIds)]

    const [phasesRes, milestonesRes, tasksRes] = await Promise.all([
      supabase.from('project_phases').select('id, name').in('id', uniqueIds),
      supabase.from('project_milestones').select('id, name').in('id', uniqueIds),
      supabase.from('tasks').select('id, title').in('id', uniqueIds),
    ])

    if (phasesRes.data) {
      for (const row of phasesRes.data) {
        nameMap.set(row.id as string, row.name as string)
      }
    }
    if (milestonesRes.data) {
      for (const row of milestonesRes.data) {
        nameMap.set(row.id as string, row.name as string)
      }
    }
    if (tasksRes.data) {
      for (const row of tasksRes.data) {
        nameMap.set(row.id as string, (row as unknown as { id: string; title: string }).title)
      }
    }

    return nameMap
  },
}

export default dependencyService