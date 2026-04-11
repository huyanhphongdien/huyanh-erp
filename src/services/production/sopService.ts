// ============================================================================
// SOP SERVICE — Standard Operating Procedure
// File: src/services/production/sopService.ts
// ============================================================================

import { supabase } from '../../lib/supabase'

export interface SOPDocument {
  id: string
  code: string
  name: string
  category: string
  department_id: string | null
  version: number
  status: string
  effective_date: string | null
  review_date: string | null
  approved_by: string | null
  approved_at: string | null
  created_by: string | null
  created_at: string
  department?: { name: string } | null
  steps?: SOPStep[]
}

export interface SOPStep {
  id: string
  sop_id: string
  step_number: number
  title: string
  content: string | null
  media_urls: string[] | null
  ppe_required: string[] | null
  warning_notes: string | null
  duration_minutes: number | null
}

export const SOP_CATEGORIES: Record<string, string> = {
  production: 'Sản xuất', quality: 'Chất lượng', safety: 'An toàn',
  maintenance: 'Bảo trì', general: 'Chung',
}

export const SOP_STATUS: Record<string, { label: string; color: string }> = {
  draft: { label: 'Nháp', color: 'default' },
  pending_review: { label: 'Chờ duyệt', color: 'warning' },
  approved: { label: 'Đã duyệt', color: 'blue' },
  active: { label: 'Đang áp dụng', color: 'success' },
  archived: { label: 'Lưu trữ', color: 'default' },
}

export const sopService = {
  async getAll(): Promise<SOPDocument[]> {
    const { data, error } = await supabase
      .from('sop_documents')
      .select('*, department:departments(name)')
      .order('code')
    if (error) throw error
    return (data || []).map((d: any) => ({ ...d, department: Array.isArray(d.department) ? d.department[0] : d.department }))
  },

  async getById(id: string): Promise<SOPDocument & { steps: SOPStep[] }> {
    const [{ data: doc }, { data: steps }] = await Promise.all([
      supabase.from('sop_documents').select('*, department:departments(name)').eq('id', id).single(),
      supabase.from('sop_steps').select('*').eq('sop_id', id).order('step_number'),
    ])
    if (!doc) throw new Error('SOP not found')
    return {
      ...doc,
      department: Array.isArray(doc.department) ? doc.department[0] : doc.department,
      steps: steps || [],
    }
  },

  async create(data: { code: string; name: string; category: string; department_id?: string; created_by?: string }): Promise<SOPDocument> {
    const { data: created, error } = await supabase.from('sop_documents').insert(data).select().single()
    if (error) throw error
    return created
  },

  async updateStatus(id: string, status: string, approvedBy?: string): Promise<void> {
    const update: any = { status, updated_at: new Date().toISOString() }
    if (status === 'approved' || status === 'active') {
      update.approved_by = approvedBy
      update.approved_at = new Date().toISOString()
    }
    const { error } = await supabase.from('sop_documents').update(update).eq('id', id)
    if (error) throw error
  },

  async addStep(sopId: string, data: Partial<SOPStep>): Promise<SOPStep> {
    const { data: created, error } = await supabase.from('sop_steps').insert({ sop_id: sopId, ...data }).select().single()
    if (error) throw error
    return created
  },

  async updateStep(stepId: string, data: Partial<SOPStep>): Promise<void> {
    const { error } = await supabase.from('sop_steps').update(data).eq('id', stepId)
    if (error) throw error
  },

  async deleteStep(stepId: string): Promise<void> {
    const { error } = await supabase.from('sop_steps').delete().eq('id', stepId)
    if (error) throw error
  },
}

export default sopService
