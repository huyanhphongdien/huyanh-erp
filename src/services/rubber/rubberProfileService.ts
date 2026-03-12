// ============================================================================
// FILE: src/services/rubber/rubberProfileService.ts
// MODULE: Thu mua Mủ Cao su — Huy Anh Rubber ERP
// PHASE: 3.6 — Bước 3.6.12
// MÔ TẢ: CRUD Lý lịch mủ phiếu xe/container
//         + Wizard 4 bước: Xe → Hàng → Liên kết đợt mua → Ký duyệt
//         + Sơ đồ khoang (compartments JSONB)
//         + Approval tracking (QC / Kế toán / Thu mua / Bảo vệ)
// BẢNG: rubber_profiles
// SCHEMA COLUMNS:
//   id, profile_code, intake_date, procurement_team,
//   vehicle_plate, driver_name, has_trailer, trailer_plate,
//   origin, product_code,
//   weight_at_origin_kg, weight_at_factory_kg, weight_diff_kg, weight_diff_percent,
//   compartments (jsonb), batch_ids (uuid[]),
//   qc_approved, qc_approved_by, qc_approved_at,
//   accounting_approved, accounting_approved_by, accounting_approved_at,
//   procurement_approved, procurement_approved_by, procurement_approved_at,
//   security_approved, security_approved_by, security_approved_at,
//   status, notes, created_by, created_at, updated_at
// ============================================================================

import { supabase } from '../../lib/supabase'
import type {
  RubberProfile,
  RubberProfileFormData,
  RubberPaginationParams,
  RubberPaginatedResponse,
} from './rubber.types'

// ============================================================================
// CONSTANTS
// ============================================================================

const PROFILE_SELECT = `
  *,
  supplier:rubber_suppliers(id, code, name, phone, country, supplier_type)
`

const PROFILE_LIST_SELECT = `
  id, profile_code, intake_date, procurement_team,
  vehicle_plate, driver_name, has_trailer, trailer_plate,
  origin, product_code,
  weight_at_origin_kg, weight_at_factory_kg, weight_diff_kg, weight_diff_percent,
  compartments, batch_ids,
  qc_approved, accounting_approved, procurement_approved, security_approved,
  status, notes, created_at, updated_at
`

// ============================================================================
// HELPERS
// ============================================================================

function calcWeightDiff(
  originKg?: number | null,
  factoryKg?: number | null
): { diff_kg: number | null; diff_percent: number | null } {
  if (originKg && factoryKg && originKg > 0) {
    const diff = Math.round((originKg - factoryKg) * 100) / 100
    const pct = Math.round((diff / originKg) * 10000) / 100
    return { diff_kg: diff, diff_percent: pct }
  }
  return { diff_kg: null, diff_percent: null }
}

function countApprovals(data: Record<string, any>): number {
  let count = 0
  if (data.qc_approved) count++
  if (data.accounting_approved) count++
  if (data.procurement_approved) count++
  if (data.security_approved) count++
  return count
}

/** Auto-gen profile_code: LL-YYMMDD-XXX */
async function generateCode(date?: string): Promise<string> {
  const d = date ? new Date(date) : new Date()
  const yy = String(d.getFullYear()).slice(2)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const prefix = `LL-${yy}${mm}${dd}`

  const { count } = await supabase
    .from('rubber_profiles')
    .select('id', { count: 'exact', head: true })
    .like('profile_code', `${prefix}%`)

  const seq = String((count || 0) + 1).padStart(3, '0')
  return `${prefix}-${seq}`
}

// ============================================================================
// SERVICE
// ============================================================================

export const rubberProfileService = {

  // ==========================================================================
  // GET ALL
  // ==========================================================================
  async getAll(params: RubberPaginationParams = {} as RubberPaginationParams): Promise<RubberPaginatedResponse<RubberProfile>> {
    const page = params.page || 1
    const pageSize = params.pageSize || 20
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    let query = supabase
      .from('rubber_profiles')
      .select(PROFILE_LIST_SELECT, { count: 'exact' })

    if (params.status && params.status !== 'all') {
      query = query.eq('status', params.status)
    }

    if (params.from_date) {
      query = query.gte('intake_date', params.from_date)
    }
    if (params.to_date) {
      query = query.lte('intake_date', params.to_date)
    }

    if (params.search) {
      query = query.or(
        `vehicle_plate.ilike.%${params.search}%,` +
        `product_code.ilike.%${params.search}%,` +
        `driver_name.ilike.%${params.search}%,` +
        `profile_code.ilike.%${params.search}%`
      )
    }

    const { data, error, count } = await query
      .order('intake_date', { ascending: false })
      .order('created_at', { ascending: false })
      .range(from, to)

    if (error) throw error

    return {
      data: (data || []) as unknown as RubberProfile[],
      total: count || 0,
      page,
      pageSize,
      totalPages: Math.ceil((count || 0) / pageSize),
    }
  },

  // ==========================================================================
  // GET BY ID
  // ==========================================================================
  async getById(id: string): Promise<RubberProfile | null> {
    const { data, error } = await supabase
      .from('rubber_profiles')
      .select(PROFILE_SELECT)
      .eq('id', id)
      .single()

    if (error) throw error
    return data as unknown as RubberProfile
  },

  // ==========================================================================
  // CREATE
  // ==========================================================================
  async create(formData: RubberProfileFormData): Promise<RubberProfile> {
    const { diff_kg, diff_percent } = calcWeightDiff(
      formData.weight_at_origin_kg,
      formData.weight_at_factory_kg
    )

    const profileCode = await generateCode(formData.intake_date)

    const insertData: Record<string, any> = {
      profile_code: profileCode,
      intake_date: formData.intake_date || new Date().toISOString().split('T')[0],
      procurement_team: formData.procurement_team || null,
      vehicle_plate: formData.vehicle_plate,
      driver_name: formData.driver_name || null,
      has_trailer: formData.has_trailer || false,
      trailer_plate: formData.trailer_plate || null,
      origin: formData.origin || null,
      product_code: formData.product_code || null,
      weight_at_origin_kg: formData.weight_at_origin_kg || null,
      weight_at_factory_kg: formData.weight_at_factory_kg || null,
      weight_diff_kg: diff_kg,
      weight_diff_percent: diff_percent,
      compartments: formData.compartments || null,
      drc_percent: formData.drc_percent || null,
      net_weight_kg: formData.net_weight_kg || null,
      batch_ids: formData.batch_ids || [],
      qc_approved: formData.qc_approved || false,
      accounting_approved: formData.accounting_approved || false,
      procurement_approved: formData.procurement_approved || false,
      security_approved: formData.security_approved || false,
      status: 'draft',
      notes: formData.notes || null,
    }

    if (countApprovals(insertData) >= 2) {
      insertData.status = 'confirmed'
    }

    const { data, error } = await supabase
      .from('rubber_profiles')
      .insert(insertData)
      .select(PROFILE_SELECT)
      .single()

    if (error) throw error
    return data as unknown as RubberProfile
  },

  // ==========================================================================
  // UPDATE
  // ==========================================================================
  async update(id: string, formData: Partial<RubberProfileFormData>): Promise<RubberProfile> {
    const updateData: Record<string, any> = {}

    if (formData.intake_date !== undefined) updateData.intake_date = formData.intake_date
    if (formData.procurement_team !== undefined) updateData.procurement_team = formData.procurement_team
    if (formData.vehicle_plate !== undefined) updateData.vehicle_plate = formData.vehicle_plate
    if (formData.driver_name !== undefined) updateData.driver_name = formData.driver_name
    if (formData.has_trailer !== undefined) updateData.has_trailer = formData.has_trailer
    if (formData.trailer_plate !== undefined) updateData.trailer_plate = formData.trailer_plate
    if (formData.origin !== undefined) updateData.origin = formData.origin
    if (formData.product_code !== undefined) updateData.product_code = formData.product_code
    if (formData.weight_at_origin_kg !== undefined) updateData.weight_at_origin_kg = formData.weight_at_origin_kg
    if (formData.weight_at_factory_kg !== undefined) updateData.weight_at_factory_kg = formData.weight_at_factory_kg
    if (formData.compartments !== undefined) updateData.compartments = formData.compartments
    if (formData.drc_percent !== undefined) updateData.drc_percent = formData.drc_percent
    if (formData.net_weight_kg !== undefined) updateData.net_weight_kg = formData.net_weight_kg
    if (formData.batch_ids !== undefined) updateData.batch_ids = formData.batch_ids
    if (formData.notes !== undefined) updateData.notes = formData.notes

    // Re-calc weight diff
    if (formData.weight_at_origin_kg !== undefined || formData.weight_at_factory_kg !== undefined) {
      const current = await this.getById(id)
      const originKg = formData.weight_at_origin_kg ?? current?.weight_at_origin_kg
      const factoryKg = formData.weight_at_factory_kg ?? current?.weight_at_factory_kg
      const { diff_kg, diff_percent } = calcWeightDiff(originKg, factoryKg)
      updateData.weight_diff_kg = diff_kg
      updateData.weight_diff_percent = diff_percent
    }

    // Handle approvals
    const approvalFields = ['qc_approved', 'accounting_approved', 'procurement_approved', 'security_approved'] as const
    const hasApprovalChange = approvalFields.some(f => (formData as any)[f] !== undefined)

    if (hasApprovalChange) {
      approvalFields.forEach(f => {
        if ((formData as any)[f] !== undefined) updateData[f] = (formData as any)[f]
      })

      const current = await this.getById(id)
      const merged = { ...current, ...updateData }
      updateData.status = countApprovals(merged) >= 2 ? 'confirmed' : 'draft'
    }

    updateData.updated_at = new Date().toISOString()

    const { data, error } = await supabase
      .from('rubber_profiles')
      .update(updateData)
      .eq('id', id)
      .select(PROFILE_SELECT)
      .single()

    if (error) throw error
    return data as unknown as RubberProfile
  },

  // ==========================================================================
  // DELETE (chỉ draft)
  // ==========================================================================
  async delete(id: string): Promise<void> {
    const { data: existing } = await supabase
      .from('rubber_profiles')
      .select('status')
      .eq('id', id)
      .single()

    if (existing?.status !== 'draft') {
      throw new Error('Chỉ có thể xoá phiếu ở trạng thái nháp')
    }

    const { error } = await supabase
      .from('rubber_profiles')
      .delete()
      .eq('id', id)

    if (error) throw error
  },

  // ==========================================================================
  // UPDATE APPROVAL — Cập nhật 1 loại ký duyệt + ghi by/at
  // ==========================================================================
  async updateApproval(
    id: string,
    approvalType: 'qc' | 'accounting' | 'procurement' | 'security',
    approved: boolean,
    userId?: string
  ): Promise<RubberProfile> {
    const now = new Date().toISOString()

    const updateData: Record<string, any> = {
      [`${approvalType}_approved`]: approved,
      [`${approvalType}_approved_by`]: approved ? (userId || null) : null,
      [`${approvalType}_approved_at`]: approved ? now : null,
      updated_at: now,
    }

    const current = await this.getById(id)
    if (!current) throw new Error('Không tìm thấy phiếu')

    const merged = { ...current, ...updateData }
    updateData.status = countApprovals(merged) >= 2 ? 'confirmed' : 'draft'

    const { data, error } = await supabase
      .from('rubber_profiles')
      .update(updateData)
      .eq('id', id)
      .select(PROFILE_SELECT)
      .single()

    if (error) throw error
    return data as unknown as RubberProfile
  },

  // ==========================================================================
  // GET LINKED BATCHES
  // ==========================================================================
  async getLinkedBatches(profileId: string): Promise<any[]> {
    const profile = await this.getById(profileId)
    if (!profile || !profile.batch_ids || profile.batch_ids.length === 0) {
      return []
    }

    const { data, error } = await supabase
      .from('rubber_intake_batches')
      .select(`
        id, source_type, intake_date, product_code,
        purchase_qty_kg, total_amount, price_currency,
        location_name, buyer_name, status,
        supplier:rubber_suppliers(id, code, name)
      `)
      .in('id', profile.batch_ids)
      .order('intake_date', { ascending: false })

    if (error) throw error
    return data || []
  },

  // ==========================================================================
  // GET AVAILABLE BATCHES — cho wizard bước 3
  // ==========================================================================
  async getAvailableBatches(sourceType?: string): Promise<any[]> {
    const { data: profiles } = await supabase
      .from('rubber_profiles')
      .select('batch_ids')

    const linkedIds = new Set<string>()
    ;(profiles || []).forEach((p: any) => {
      ;(p.batch_ids || []).forEach((bid: string) => linkedIds.add(bid))
    })

    let query = supabase
      .from('rubber_intake_batches')
      .select(`
        id, source_type, intake_date, product_code,
        purchase_qty_kg, net_weight_kg, total_amount, price_currency,
        location_name, buyer_name, vehicle_plate, status,
        supplier:rubber_suppliers(id, code, name)
      `)
      .in('status', ['confirmed', 'settled'])
      .order('intake_date', { ascending: false })

    if (sourceType && sourceType !== 'all') {
      query = query.eq('source_type', sourceType)
    }

    const { data, error } = await query
    if (error) throw error

    return (data || []).filter((b: any) => !linkedIds.has(b.id))
  },

  // ==========================================================================
  // GET SUMMARY
  // ==========================================================================
  async getSummary(fromDate?: string, toDate?: string): Promise<{
    total: number
    confirmed: number
    draft: number
    total_origin_kg: number
    total_factory_kg: number
    avg_diff_percent: number
  }> {
    let query = supabase
      .from('rubber_profiles')
      .select('status, weight_at_origin_kg, weight_at_factory_kg, weight_diff_percent')

    if (fromDate) query = query.gte('intake_date', fromDate)
    if (toDate) query = query.lte('intake_date', toDate)

    const { data, error } = await query
    if (error) throw error

    const rows = data || []
    const confirmed = rows.filter((r: any) => r.status === 'confirmed').length
    const draft = rows.filter((r: any) => r.status === 'draft').length
    const totalOrigin = rows.reduce((s: number, r: any) => s + (r.weight_at_origin_kg || 0), 0)
    const totalFactory = rows.reduce((s: number, r: any) => s + (r.weight_at_factory_kg || 0), 0)
    const diffs = rows.filter((r: any) => r.weight_diff_percent != null).map((r: any) => r.weight_diff_percent)
    const avgDiff = diffs.length > 0 ? diffs.reduce((s: number, v: number) => s + v, 0) / diffs.length : 0

    return {
      total: rows.length,
      confirmed,
      draft,
      total_origin_kg: Math.round(totalOrigin * 100) / 100,
      total_factory_kg: Math.round(totalFactory * 100) / 100,
      avg_diff_percent: Math.round(avgDiff * 100) / 100,
    }
  },
}

// ============================================================================
// STANDALONE EXPORTS
// ============================================================================

export const {
  getAll: getAllProfiles,
  getById: getProfileById,
  create: createProfile,
  update: updateProfile,
  delete: deleteProfile,
  updateApproval,
  getLinkedBatches,
  getAvailableBatches,
  getSummary: getProfileSummary,
} = rubberProfileService

export default rubberProfileService