// ============================================================================
// FILE: src/services/project/issueService.ts
// MODULE: Quản lý Dự án — Huy Anh Rubber ERP
// PHASE: PM7 — Bước 7.2
// MÔ TẢ: Issue tracker — CRUD, resolve, escalate, activity log
// BẢNG: project_issues (đã tạo PM1), project_activities
// ============================================================================

import { supabase } from '../../lib/supabase'

// ============================================================================
// TYPES
// ============================================================================

export type IssueSeverity = 'critical' | 'high' | 'medium' | 'low'
export type IssueStatus = 'open' | 'in_progress' | 'resolved' | 'closed' | 'escalated'

export interface ProjectIssue {
  id: string
  project_id: string
  code: string
  title: string
  description?: string
  severity: IssueSeverity
  status: IssueStatus
  assignee_id?: string
  reported_by?: string
  resolution?: string
  reported_date?: string
  due_date?: string
  resolved_date?: string
  created_at: string
  updated_at: string
  // Joined
  assignee?: { id: string; full_name: string }
  reporter?: { id: string; full_name: string }
}

export interface IssueCreateData {
  project_id: string
  title: string
  description?: string
  severity?: IssueSeverity
  assignee_id?: string
  reported_by?: string
  due_date?: string
}

export interface IssueUpdateData {
  title?: string
  description?: string
  severity?: IssueSeverity
  status?: IssueStatus
  assignee_id?: string | null
  due_date?: string | null
  resolution?: string
}

export interface IssueStats {
  total: number
  open: number
  in_progress: number
  resolved: number
  closed: number
  escalated: number
  overdue: number
  by_severity: Record<IssueSeverity, number>
}

// ============================================================================
// CONSTANTS
// ============================================================================

const ISSUE_SELECT = `
  *,
  assignee:employees!project_issues_assignee_id_fkey(id, full_name),
  reporter:employees!project_issues_reported_by_fkey(id, full_name)
`

function normalizeIssue(raw: any): ProjectIssue {
  return {
    ...raw,
    assignee: Array.isArray(raw.assignee) ? raw.assignee[0] || null : raw.assignee || null,
    reporter: Array.isArray(raw.reporter) ? raw.reporter[0] || null : raw.reporter || null,
  }
}

function normalizeIssues(raw: any[]): ProjectIssue[] {
  return (raw || []).map(normalizeIssue)
}

// ============================================================================
// SERVICE
// ============================================================================

export const issueService = {
  async generateCode(project_id: string): Promise<string> {
    const { data } = await supabase
      .from('project_issues')
      .select('code')
      .eq('project_id', project_id)
      .order('code', { ascending: false })
      .limit(1)

    let seq = 1
    if (data && data.length > 0 && data[0].code) {
      const match = data[0].code.match(/I-(\d+)/)
      if (match) seq = parseInt(match[1], 10) + 1
    }
    return `I-${String(seq).padStart(3, '0')}`
  },

  async getByProject(project_id: string, params?: {
    status?: IssueStatus
    severity?: IssueSeverity
    assignee_id?: string
    sort_by?: 'created_at' | 'severity' | 'status' | 'due_date'
    sort_order?: 'asc' | 'desc'
  }): Promise<ProjectIssue[]> {
    let query = supabase
      .from('project_issues')
      .select(ISSUE_SELECT)
      .eq('project_id', project_id)

    if (params?.status) query = query.eq('status', params.status)
    if (params?.severity) query = query.eq('severity', params.severity)
    if (params?.assignee_id) query = query.eq('assignee_id', params.assignee_id)

    query = query.order(params?.sort_by || 'created_at', { ascending: params?.sort_order === 'asc' })

    const { data, error } = await query
    if (error) throw error
    return normalizeIssues(data || [])
  },

  async getById(id: string): Promise<ProjectIssue | null> {
    const { data, error } = await supabase
      .from('project_issues')
      .select(ISSUE_SELECT)
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null
      throw error
    }
    return normalizeIssue(data)
  },

  async create(input: IssueCreateData): Promise<ProjectIssue> {
    const code = await this.generateCode(input.project_id)

    const { data, error } = await supabase
      .from('project_issues')
      .insert({
        project_id: input.project_id,
        code,
        title: input.title,
        description: input.description || null,
        severity: input.severity || 'medium',
        assignee_id: input.assignee_id || null,
        reported_by: input.reported_by || null,
        due_date: input.due_date || null,
        status: 'open',
        reported_date: new Date().toISOString().split('T')[0],
      })
      .select(ISSUE_SELECT)
      .single()

    if (error) throw error

    await this._logActivity(input.project_id, 'issue_created', 'issue', data.id,
      `Vấn đề "${code}: ${input.title}" được báo cáo`)

    return normalizeIssue(data)
  },

  async update(id: string, updates: IssueUpdateData): Promise<ProjectIssue> {
    const { data, error } = await supabase
      .from('project_issues')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select(ISSUE_SELECT)
      .single()

    if (error) throw error
    return normalizeIssue(data)
  },

  /**
   * Resolve issue
   */
  async resolve(id: string, resolution: string): Promise<ProjectIssue> {
    const current = await this.getById(id)
    if (!current) throw new Error('Issue not found')

    const { data, error } = await supabase
      .from('project_issues')
      .update({
        status: 'resolved',
        resolution,
        resolved_date: new Date().toISOString().split('T')[0],
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select(ISSUE_SELECT)
      .single()

    if (error) throw error

    await this._logActivity(current.project_id, 'issue_resolved', 'issue', id,
      `Vấn đề "${current.code}" đã giải quyết`)

    return normalizeIssue(data)
  },

  /**
   * Escalate issue
   */
  async escalate(id: string): Promise<ProjectIssue> {
    const current = await this.getById(id)
    if (!current) throw new Error('Issue not found')

    const { data, error } = await supabase
      .from('project_issues')
      .update({ status: 'escalated', updated_at: new Date().toISOString() })
      .eq('id', id)
      .select(ISSUE_SELECT)
      .single()

    if (error) throw error

    await this._logActivity(current.project_id, 'issue_escalated', 'issue', id,
      `Vấn đề "${current.code}" đã leo thang xử lý`)

    return normalizeIssue(data)
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('project_issues').delete().eq('id', id)
    if (error) throw error
  },

  /**
   * Đếm issues mở
   */
  async getOpenCount(project_id: string): Promise<number> {
    const { count, error } = await supabase
      .from('project_issues')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', project_id)
      .in('status', ['open', 'in_progress', 'escalated'])

    if (error) throw error
    return count || 0
  },

  /**
   * Thống kê
   */
  async getStats(project_id: string): Promise<IssueStats> {
    const issues = await this.getByProject(project_id)
    const today = new Date().toISOString().split('T')[0]

    const stats: IssueStats = {
      total: issues.length,
      open: issues.filter(i => i.status === 'open').length,
      in_progress: issues.filter(i => i.status === 'in_progress').length,
      resolved: issues.filter(i => i.status === 'resolved').length,
      closed: issues.filter(i => i.status === 'closed').length,
      escalated: issues.filter(i => i.status === 'escalated').length,
      overdue: issues.filter(i => i.due_date && i.due_date < today && !['resolved', 'closed'].includes(i.status)).length,
      by_severity: { critical: 0, high: 0, medium: 0, low: 0 },
    }

    for (const i of issues) {
      stats.by_severity[i.severity] = (stats.by_severity[i.severity] || 0) + 1
    }

    return stats
  },

  async _logActivity(project_id: string, action: string, entity_type: string, entity_id: string, description: string): Promise<void> {
    try {
      await supabase.from('project_activities').insert({ project_id, action, entity_type, entity_id, description })
    } catch (err) {
      console.warn('[issueService] Log activity failed:', err)
    }
  },
}

export default issueService