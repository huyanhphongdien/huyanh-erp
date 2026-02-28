// ============================================================================
// FILE: src/services/rubber/laoShipmentService.ts
// MODULE: Thu mua Mủ Cao su — Huy Anh Rubber ERP
// PHASE: 3.6 — Bước 3.6.12 — V2 FIX theo schema thật
// DB COLUMNS: shipment_code, shipment_date, profile_id, fund_transfer_id,
//   total_weight_kg, lot_codes, vehicle_plate,
//   loading_cost_lak, loading_cost_bath, transport_cost_vnd,
//   departed_at, arrived_at, arrived_date,
//   status, stock_in_id, notes, created_by
// ============================================================================

import { supabase } from '../../lib/supabase'
import type {
  LaoShipment,
  LaoShipmentFormData,
  RubberPaginationParams,
  RubberPaginatedResponse,
} from './rubber.types'

// ============================================================================
// CONSTANTS
// ============================================================================

const SHIPMENT_SELECT = `
  *,
  profile:rubber_profiles(
    id, intake_date, vehicle_plate, procurement_team,
    origin, product_code, weight_at_origin_kg,
    qc_approved, accounting_approved, procurement_approved, security_approved
  )
`

const SHIPMENT_LIST_SELECT = `
  id, shipment_code, shipment_date, profile_id, fund_transfer_id,
  total_weight_kg, lot_codes, vehicle_plate,
  loading_cost_lak, loading_cost_bath, transport_cost_vnd,
  departed_at, arrived_at, arrived_date,
  status, stock_in_id, notes, created_at, updated_at,
  profile:rubber_profiles(id, vehicle_plate, origin, product_code)
`

// ============================================================================
// HELPERS
// ============================================================================

async function generateCode(date?: string): Promise<string> {
  const d = date ? new Date(date) : new Date()
  const yy = String(d.getFullYear()).slice(2)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const prefix = `XK-${yy}${mm}${dd}`

  const { count } = await supabase
    .from('lao_shipments')
    .select('id', { count: 'exact', head: true })
    .like('shipment_code', `${prefix}%`)

  const seq = String((count || 0) + 1).padStart(3, '0')
  return `${prefix}-${seq}`
}

type ShipmentStatus = LaoShipment['status']

// ============================================================================
// SERVICE
// ============================================================================

export const laoShipmentService = {

  // ==========================================================================
  // GET ALL
  // ==========================================================================
  async getAll(params: RubberPaginationParams): Promise<RubberPaginatedResponse<LaoShipment>> {
    const { page = 1, pageSize = 20, search, status, from_date, to_date } = params
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    let query = supabase
      .from('lao_shipments')
      .select(SHIPMENT_LIST_SELECT, { count: 'exact' })

    if (status) query = query.eq('status', status)
    if (from_date) query = query.gte('shipment_date', from_date)
    if (to_date) query = query.lte('shipment_date', to_date)

    if (search?.trim()) {
      const s = search.trim()
      query = query.or(`vehicle_plate.ilike.%${s}%,shipment_code.ilike.%${s}%,notes.ilike.%${s}%`)
    }

    const { data, count, error } = await query
      .order('shipment_date', { ascending: false })
      .order('created_at', { ascending: false })
      .range(from, to)

    if (error) throw error
    return {
      data: (data || []) as unknown as LaoShipment[],
      total: count ?? 0,
      page,
      pageSize,
      totalPages: Math.ceil((count ?? 0) / pageSize),
    }
  },

  // ==========================================================================
  // GET BY ID
  // ==========================================================================
  async getById(id: string): Promise<LaoShipment | null> {
    const { data, error } = await supabase
      .from('lao_shipments')
      .select(SHIPMENT_SELECT)
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null
      throw error
    }
    return data as unknown as LaoShipment
  },

  // ==========================================================================
  // CREATE
  // ==========================================================================
  async create(formData: LaoShipmentFormData, createdBy?: string): Promise<LaoShipment> {
    const code = await generateCode(formData.shipment_date)

    const insertData = {
      shipment_code: formData.shipment_code || code,
      shipment_date: formData.shipment_date,
      profile_id: formData.profile_id || null,
      fund_transfer_id: formData.fund_transfer_id || null,
      total_weight_kg: formData.total_weight_kg ?? null,
      lot_codes: formData.lot_codes || [],
      vehicle_plate: formData.vehicle_plate || null,
      loading_cost_lak: formData.loading_cost_lak ?? null,
      loading_cost_bath: formData.loading_cost_bath ?? null,
      transport_cost_vnd: formData.transport_cost_vnd ?? null,
      departed_at: formData.departed_at || null,
      status: 'loading' as ShipmentStatus,
      notes: formData.notes || null,
      created_by: createdBy || null,
    }

    const { data, error } = await supabase
      .from('lao_shipments')
      .insert(insertData)
      .select(SHIPMENT_SELECT)
      .single()

    if (error) throw error
    return data as unknown as LaoShipment
  },

  // ==========================================================================
  // UPDATE
  // ==========================================================================
  async update(id: string, formData: Partial<LaoShipmentFormData>): Promise<LaoShipment> {
    const existing = await this.getById(id)
    if (!existing) throw new Error('Không tìm thấy phiếu xuất kho Lào')
    if (existing.status === 'completed') throw new Error('Không thể sửa phiếu đã hoàn tất')

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }

    const allowedFields: (keyof LaoShipmentFormData)[] = [
      'shipment_date', 'profile_id', 'fund_transfer_id',
      'total_weight_kg', 'lot_codes', 'vehicle_plate',
      'loading_cost_lak', 'loading_cost_bath', 'transport_cost_vnd',
      'departed_at', 'notes',
    ]

    for (const field of allowedFields) {
      if (field in formData) {
        updateData[field] = (formData as Record<string, unknown>)[field] ?? null
      }
    }

    const { data, error } = await supabase
      .from('lao_shipments')
      .update(updateData)
      .eq('id', id)
      .select(SHIPMENT_SELECT)
      .single()

    if (error) throw error
    return data as unknown as LaoShipment
  },

  // ==========================================================================
  // DELETE
  // ==========================================================================
  async delete(id: string): Promise<void> {
    const existing = await this.getById(id)
    if (!existing) throw new Error('Không tìm thấy phiếu xuất kho Lào')
    if (existing.status === 'arrived' || existing.status === 'completed') {
      throw new Error('Không thể xoá phiếu đã đến NM hoặc hoàn tất')
    }

    const { error } = await supabase.from('lao_shipments').delete().eq('id', id)
    if (error) throw error
  },

  // ==========================================================================
  // MARK IN TRANSIT — loading → in_transit
  // ==========================================================================
  async markInTransit(id: string): Promise<LaoShipment> {
    const existing = await this.getById(id)
    if (!existing) throw new Error('Không tìm thấy phiếu')
    if (existing.status !== 'loading') throw new Error('Chỉ chuyển từ "Đang xếp hàng"')
    if (!existing.total_weight_kg || existing.total_weight_kg <= 0) {
      throw new Error('Cần nhập KL xếp xe trước')
    }

    const { data, error } = await supabase
      .from('lao_shipments')
      .update({
        status: 'in_transit' as ShipmentStatus,
        departed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select(SHIPMENT_SELECT)
      .single()

    if (error) throw error
    return data as unknown as LaoShipment
  },

  // ==========================================================================
  // MARK ARRIVED — in_transit → arrived
  // ==========================================================================
  async markArrived(id: string, arrivedDate?: string): Promise<LaoShipment> {
    const existing = await this.getById(id)
    if (!existing) throw new Error('Không tìm thấy phiếu')
    if (existing.status !== 'in_transit') throw new Error('Chỉ đánh dấu đến NM khi đang vận chuyển')

    const now = new Date().toISOString()
    const arrDate = arrivedDate || now.split('T')[0]

    const { data, error } = await supabase
      .from('lao_shipments')
      .update({
        status: 'arrived' as ShipmentStatus,
        arrived_at: now,
        arrived_date: arrDate,
        updated_at: now,
      })
      .eq('id', id)
      .select(SHIPMENT_SELECT)
      .single()

    if (error) throw error
    return data as unknown as LaoShipment
  },

  // ==========================================================================
  // COMPLETE — arrived → completed
  // ==========================================================================
  async complete(id: string, stockInId?: string): Promise<LaoShipment> {
    const existing = await this.getById(id)
    if (!existing) throw new Error('Không tìm thấy phiếu')
    if (existing.status !== 'arrived') throw new Error('Chỉ hoàn tất khi đã đến NM')

    const { data, error } = await supabase
      .from('lao_shipments')
      .update({
        status: 'completed' as ShipmentStatus,
        stock_in_id: stockInId || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select(SHIPMENT_SELECT)
      .single()

    if (error) throw error
    return data as unknown as LaoShipment
  },

  // ==========================================================================
  // GET LOT CODES
  // ==========================================================================
  async getLotCodes(): Promise<string[]> {
    const { data, error } = await supabase
      .from('lao_shipments')
      .select('lot_codes')
      .not('lot_codes', 'is', null)

    if (error) throw error

    const codes = new Set<string>()
    for (const row of (data || []) as any[]) {
      ;(row.lot_codes || []).forEach((c: string) => codes.add(c))
    }
    return Array.from(codes).sort()
  },

  // ==========================================================================
  // GET SUMMARY
  // ==========================================================================
  async getSummary(fromDate: string, toDate: string): Promise<{
    total_shipments: number
    total_weight_kg: number
    total_cost_lak: number
    total_cost_bath: number
    total_transport_vnd: number
    by_status: Record<string, number>
  }> {
    const { data, error } = await supabase
      .from('lao_shipments')
      .select('total_weight_kg, loading_cost_lak, loading_cost_bath, transport_cost_vnd, status')
      .gte('shipment_date', fromDate)
      .lte('shipment_date', toDate)

    if (error) throw error

    const rows = data || []
    const byStatus: Record<string, number> = { loading: 0, in_transit: 0, arrived: 0, completed: 0 }
    for (const r of rows as any[]) {
      byStatus[r.status] = (byStatus[r.status] || 0) + 1
    }

    return {
      total_shipments: rows.length,
      total_weight_kg: rows.reduce((s: number, r: any) => s + (r.total_weight_kg ?? 0), 0),
      total_cost_lak: rows.reduce((s: number, r: any) => s + (r.loading_cost_lak ?? 0), 0),
      total_cost_bath: rows.reduce((s: number, r: any) => s + (r.loading_cost_bath ?? 0), 0),
      total_transport_vnd: rows.reduce((s: number, r: any) => s + (r.transport_cost_vnd ?? 0), 0),
      by_status: byStatus,
    }
  },
}

// ============================================================================
// STANDALONE EXPORTS
// ============================================================================

export const {
  getAll: getAllShipments,
  getById: getShipmentById,
  create: createShipment,
  update: updateShipment,
  delete: deleteShipment,
  markInTransit: markShipmentInTransit,
  markArrived: markShipmentArrived,
  complete: completeShipment,
  getLotCodes: getShipmentLotCodes,
  getSummary: getShipmentSummary,
} = laoShipmentService

export default laoShipmentService