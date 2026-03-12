// ============================================================================
// FILE: src/services/project/riskService.ts
// MODULE: Quản lý Dự án — Huy Anh Rubber ERP
// PHASE: PM7 — Bước 7.1
// MÔ TẢ: Risk register — CRUD, risk matrix, auto-code, activity log
// BẢNG: project_risks (đã tạo PM1), project_activities
// ============================================================================

import { supabase } from '../../lib/supabase'

// ============================================================================
// TYPES
// ============================================================================

export type RiskCategory = 'technical' | 'schedule' | 'resource' | 'external' | 'financial'
export type RiskStatus = 'identified' | 'analyzing' | 'mitigating' | 'resolved' | 'accepted' | 'closed'

export interface ProjectRisk {
  id: string
  project_id: string
  code: string
  title: string
  description?: string
  probability: number       // 1-5
  impact: number            // 1-5
  risk_score: number        // auto-calc = probability * impact
  category?: RiskCategory
  status: RiskStatus
  mitigation_plan?: string
  contingency_plan?: string
  owner_id?: string
  identified_date?: string
  resolved_date?: string
  created_at: string
  updated_at: string
  // Joined
  owner?: { id: string; full_name: string }
}

export interface RiskCreateData {
  project_id: string
  title: string
  description?: string
  probability: number
  impact: number
  category?: RiskCategory
  mitigation_plan?: string
  contingency_plan?: string
  owner_id?: string
}

export interface RiskUpdateData {
  title?: string
  description?: string
  probability?: number
  impact?: number
  category?: RiskCategory
  status?: RiskStatus
  mitigation_plan?: string
  contingency_plan?: string
  owner_id?: string | null
  resolved_date?: string | null
}

/** Ma trận rủi ro: cell [probability][impact] = list of risks */
export interface RiskMatrixCell {
  probability: number
  impact: number
  score: number
  risks: { id: string; code: string; title: string; status: RiskStatus }[]
  count: number
}

export interface RiskStats {
  total: number
  by_status: Record<RiskStatus, number>
  by_zone: { low: number; medium: number; high: number; critical: number }
  top_risks: ProjectRisk[]
}

// ============================================================================
// CONSTANTS
// ============================================================================

const RISK_SELECT = `
  *,
  owner:employees!project_risks_owner_id_fkey(id, full_name)
`

function normalizeRisk(raw: any): ProjectRisk {
  return {
    ...raw,
    owner: Array.isArray(raw.owner) ? raw.owner[0] || null : raw.owner || null,
  }
}

function normalizeRisks(raw: any[]): ProjectRisk[] {
  return (raw || []).map(normalizeRisk)
}

/** Zone classification by risk_score */
function getZone(score: number): 'low' | 'medium' | 'high' | 'critical' {
  if (score >= 16) return 'critical'
  if (score >= 10) return 'high'
  if (score >= 5) return 'medium'
  return 'low'
}

// ============================================================================
// SERVICE
// ============================================================================

export const riskService = {
  /**
   * Auto-generate code: R-001, R-002...
   */
  async generateCode(project_id: string): Promise<string> {
    const { data } = await supabase
      .from('project_risks')
      .select('code')
      .eq('project_id', project_id)
      .order('code', { ascending: false })
      .limit(1)

    let seq = 1
    if (data && data.length > 0 && data[0].code) {
      const match = data[0].code.match(/R-(\d+)/)
      if (match) seq = parseInt(match[1], 10) + 1
    }
    return `R-${String(seq).padStart(3, '0')}`
  },

  /**
   * Lấy danh sách risks của dự án
   */
  async getByProject(project_id: string, params?: {
    status?: RiskStatus
    category?: RiskCategory
    owner_id?: string
    sort_by?: 'risk_score' | 'created_at' | 'status'
    sort_order?: 'asc' | 'desc'
  }): Promise<ProjectRisk[]> {
    let query = supabase
      .from('project_risks')
      .select(RISK_SELECT)
      .eq('project_id', project_id)

    if (params?.status) query = query.eq('status', params.status)
    if (params?.category) query = query.eq('category', params.category)
    if (params?.owner_id) query = query.eq('owner_id', params.owner_id)

    const sortBy = params?.sort_by || 'risk_score'
    const ascending = params?.sort_order === 'asc'
    query = query.order(sortBy, { ascending })

    const { data, error } = await query
    if (error) throw error
    return normalizeRisks(data || [])
  },

  /**
   * Top N risks by score
   */
  async getTopRisks(project_id: string, limit = 5): Promise<ProjectRisk[]> {
    const { data, error } = await supabase
      .from('project_risks')
      .select(RISK_SELECT)
      .eq('project_id', project_id)
      .not('status', 'in', '("resolved","closed")')
      .order('risk_score', { ascending: false })
      .limit(limit)

    if (error) throw error
    return normalizeRisks(data || [])
  },

  /**
   * Lấy 1 risk
   */
  async getById(id: string): Promise<ProjectRisk | null> {
    const { data, error } = await supabase
      .from('project_risks')
      .select(RISK_SELECT)
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null
      throw error
    }
    return normalizeRisk(data)
  },

  /**
   * Tạo risk mới
   */
  async create(input: RiskCreateData): Promise<ProjectRisk> {
    const code = await this.generateCode(input.project_id)

    const { data, error } = await supabase
      .from('project_risks')
      .insert({
        project_id: input.project_id,
        code,
        title: input.title,
        description: input.description || null,
        probability: input.probability,
        impact: input.impact,
        category: input.category || null,
        mitigation_plan: input.mitigation_plan || null,
        contingency_plan: input.contingency_plan || null,
        owner_id: input.owner_id || null,
        status: 'identified',
        identified_date: new Date().toISOString().split('T')[0],
      })
      .select(RISK_SELECT)
      .single()

    if (error) throw error

    // Log activity
    await this._logActivity(input.project_id, 'risk_created', 'risk', data.id,
      `Rủi ro "${code}: ${input.title}" được tạo (Score: ${input.probability * input.impact})`)

    return normalizeRisk(data)
  },

  /**
   * Cập nhật risk
   */
  async update(id: string, updates: RiskUpdateData): Promise<ProjectRisk> {
    const { data, error } = await supabase
      .from('project_risks')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select(RISK_SELECT)
      .single()

    if (error) throw error
    return normalizeRisk(data)
  },

  /**
   * Cập nhật status + log
   */
  async updateStatus(id: string, status: RiskStatus): Promise<ProjectRisk> {
    const current = await this.getById(id)
    if (!current) throw new Error('Risk not found')

    const updates: Record<string, any> = { status, updated_at: new Date().toISOString() }
    if (status === 'resolved' || status === 'closed') {
      updates.resolved_date = new Date().toISOString().split('T')[0]
    }

    const { data, error } = await supabase
      .from('project_risks')
      .update(updates)
      .eq('id', id)
      .select(RISK_SELECT)
      .single()

    if (error) throw error

    await this._logActivity(current.project_id, 'risk_status_changed', 'risk', id,
      `Rủi ro "${current.code}" chuyển: ${current.status} → ${status}`)

    return normalizeRisk(data)
  },

  /**
   * Xóa risk
   */
  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('project_risks')
      .delete()
      .eq('id', id)
    if (error) throw error
  },

  /**
   * Risk Matrix data: 5x5 grid
   */
  async getRiskMatrix(project_id: string): Promise<RiskMatrixCell[]> {
    const { data, error } = await supabase
      .from('project_risks')
      .select('id, code, title, probability, impact, risk_score, status')
      .eq('project_id', project_id)
      .not('status', 'in', '("resolved","closed")')

    if (error) throw error

    const cells: RiskMatrixCell[] = []
    for (let p = 1; p <= 5; p++) {
      for (let i = 1; i <= 5; i++) {
        const matching = (data || []).filter(r => r.probability === p && r.impact === i)
        cells.push({
          probability: p,
          impact: i,
          score: p * i,
          risks: matching.map(r => ({ id: r.id, code: r.code, title: r.title, status: r.status })),
          count: matching.length,
        })
      }
    }
    return cells
  },

  /**
   * Thống kê risks
   */
  async getStats(project_id: string): Promise<RiskStats> {
    const risks = await this.getByProject(project_id)

    const by_status: Record<RiskStatus, number> = {
      identified: 0, analyzing: 0, mitigating: 0, resolved: 0, accepted: 0, closed: 0,
    }
    const by_zone = { low: 0, medium: 0, high: 0, critical: 0 }

    for (const r of risks) {
      by_status[r.status] = (by_status[r.status] || 0) + 1
      if (!['resolved', 'closed'].includes(r.status)) {
        by_zone[getZone(r.risk_score)]++
      }
    }

    const activeRisks = risks
      .filter(r => !['resolved', 'closed'].includes(r.status))
      .sort((a, b) => b.risk_score - a.risk_score)

    return {
      total: risks.length,
      by_status,
      by_zone,
      top_risks: activeRisks.slice(0, 5),
    }
  },

  // Internal
  async _logActivity(project_id: string, action: string, entity_type: string, entity_id: string, description: string): Promise<void> {
    try {
      await supabase.from('project_activities').insert({ project_id, action, entity_type, entity_id, description })
    } catch (err) {
      console.warn('[riskService] Log activity failed:', err)
    }
  },
}

export default riskService