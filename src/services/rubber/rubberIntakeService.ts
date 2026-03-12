// ============================================================================
// FILE: src/services/rubber/rubberIntakeService.ts
// MODULE: Lý Lịch Mủ — Huy Anh Rubber ERP
// PHASE: P3.5
// BẢNG: rubber_intake_batches (KHÔNG phải rubber_intakes — bảng đó không tồn tại)
// ============================================================================

import { supabase } from '../../lib/supabase'

// ============================================================================
// TYPES
// ============================================================================

export interface RubberSupplierRef {
  id: string
  code: string
  name: string
  phone?: string
  country?: string
  supplier_type?: string
}

export interface RubberIntake {
  id: string
  source_type: string            // 'vietnam' | 'lao_direct' | 'lao_agent'
  intake_date: string
  supplier_id?: string
  supplier?: RubberSupplierRef
  product_code?: string

  // Mủ Việt
  settled_qty_ton?: number
  settled_price_per_ton?: number

  // Mủ Lào
  purchase_qty_kg?: number
  unit_price?: number
  price_currency?: string
  total_amount?: number

  // Chi tiết nhập kho
  gross_weight_kg?: number
  net_weight_kg?: number
  drc_percent?: number
  finished_product_ton?: number
  avg_unit_price?: number

  // Tham chiếu
  invoice_no?: string
  sct_ref?: string
  location_name?: string
  buyer_name?: string
  vehicle_plate?: string
  vehicle_label?: string
  exchange_rate?: number
  total_amount_vnd?: number
  fund_transfer_id?: string
  arrival_date?: string

  // Trạng thái
  notes?: string
  status: 'draft' | 'confirmed' | 'settled' | 'cancelled'
  payment_status: 'unpaid' | 'partial' | 'paid'
  paid_amount?: number

  created_by?: string
  created_at: string
  updated_at: string
}

export interface RubberIntakePaginationParams {
  page?: number
  pageSize?: number
  search?: string
  status?: string
  supplier_id?: string
  source_type?: string
  from_date?: string
  to_date?: string
  payment_status?: string
  product_code?: string
  // alias dùng cho RubberSupplierDetailPage
  rubber_supplier_id?: string
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

// ============================================================================
// CONSTANTS
// ============================================================================

const TABLE = 'rubber_intake_batches'

const INTAKE_SELECT = `
  *,
  supplier:rubber_suppliers(id, code, name, phone, country, supplier_type)
`

const INTAKE_LIST_SELECT = `
  id, source_type, intake_date, supplier_id, product_code,
  settled_qty_ton, settled_price_per_ton,
  purchase_qty_kg, unit_price, price_currency, total_amount,
  gross_weight_kg, net_weight_kg, drc_percent, finished_product_ton,
  avg_unit_price,
  invoice_no, vehicle_plate, vehicle_label,
  location_name, buyer_name,
  exchange_rate, total_amount_vnd,
  status, payment_status, paid_amount,
  notes, created_by, created_at, updated_at,
  supplier:rubber_suppliers(id, code, name, phone, country, supplier_type)
`

// ============================================================================
// SERVICE
// ============================================================================

export const rubberIntakeService = {

  async getAll(
    params: RubberIntakePaginationParams = {}
  ): Promise<PaginatedResponse<RubberIntake>> {
    const {
      page = 1,
      pageSize = 20,
      search,
      status,
      supplier_id,
      rubber_supplier_id,
      source_type,
      from_date,
      to_date,
      payment_status,
      product_code,
    } = params

    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    let query = supabase
      .from(TABLE)
      .select(INTAKE_LIST_SELECT, { count: 'exact' })

    // Filters
    if (status && status !== 'all') query = query.eq('status', status)
    const suppId = supplier_id || rubber_supplier_id
    if (suppId) query = query.eq('supplier_id', suppId)
    if (source_type && source_type !== 'all') query = query.eq('source_type', source_type)
    if (payment_status && payment_status !== 'all') query = query.eq('payment_status', payment_status)
    if (product_code) query = query.ilike('product_code', `%${product_code}%`)
    if (from_date) query = query.gte('intake_date', from_date)
    if (to_date) query = query.lte('intake_date', to_date)

    if (search && search.trim()) {
      const s = search.trim()
      query = query.or(
        `product_code.ilike.%${s}%,invoice_no.ilike.%${s}%,vehicle_plate.ilike.%${s}%,vehicle_label.ilike.%${s}%,location_name.ilike.%${s}%,buyer_name.ilike.%${s}%`
      )
    }

    query = query
      .order('intake_date', { ascending: false })
      .order('created_at', { ascending: false })
      .range(from, to)

    const { data, count, error } = await query
    if (error) throw error

    const total = count ?? 0
    return {
      data: (data || []) as unknown as RubberIntake[],
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    }
  },

  async getById(id: string): Promise<RubberIntake | null> {
    const { data, error } = await supabase
      .from(TABLE)
      .select(INTAKE_SELECT)
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null
      throw error
    }

    return data as unknown as RubberIntake
  },

  async confirm(id: string): Promise<RubberIntake> {
    const { data, error } = await supabase
      .from(TABLE)
      .update({
        status: 'confirmed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('status', 'draft')
      .select(INTAKE_SELECT)
      .single()

    if (error) throw error
    return data as unknown as RubberIntake
  },

  async cancel(id: string): Promise<RubberIntake> {
    const { data, error } = await supabase
      .from(TABLE)
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('status', 'draft')
      .select(INTAKE_SELECT)
      .single()

    if (error) throw error
    return data as unknown as RubberIntake
  },

  async getDailyReport(date: string) {
    const { data, error } = await supabase
      .from(TABLE)
      .select(INTAKE_LIST_SELECT)
      .eq('intake_date', date)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: true })

    if (error) throw error

    const intakes = (data || []) as unknown as RubberIntake[]
    const supplierIds = new Set(intakes.map(i => i.supplier_id).filter(Boolean))

    return {
      intakes,
      summary: {
        count: intakes.length,
        total_gross: intakes.reduce((s, i) => s + (i.gross_weight_kg || 0), 0),
        total_net: intakes.reduce((s, i) => s + (i.net_weight_kg || 0), 0),
        total_finished: intakes.reduce((s, i) => s + (i.finished_product_ton || 0), 0),
        total_amount: intakes.reduce((s, i) => s + (i.total_amount || 0), 0),
        supplier_count: supplierIds.size,
      },
    }
  },
}

export default rubberIntakeService