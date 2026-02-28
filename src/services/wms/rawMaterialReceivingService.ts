// ============================================================================
// FILE: src/services/wms/rawMaterialReceivingService.ts
// MODULE: Nhập Nguyên Liệu — Huy Anh Rubber ERP
// Ngày: 11/02/2026
// ============================================================================

import { supabase } from '../../lib/supabase'

// ============================================================================
// TYPES
// ============================================================================

export type RawMaterialType =
  | 'field_latex' | 'cup_lump' | 'sheet' | 'slab'
  | 'scrap' | 'earth_rubber' | 'latex_concentrate'
  | 'chemical' | 'other'

export type ReceivingStatus =
  | 'draft' | 'weighing' | 'qc_testing' | 'qc_passed'
  | 'qc_failed' | 'confirmed' | 'rejected' | 'cancelled'

export type RawStockStatus =
  | 'available' | 'in_production' | 'depleted'
  | 'expired' | 'quarantine' | 'rejected'

export type PaymentStatus = 'unpaid' | 'partial' | 'paid'

export interface RawMaterialReceiving {
  id: string
  code: string
  supplier_id: string | null
  supplier_name: string | null
  supplier?: any
  purchase_order_id: string | null
  vehicle_plate: string | null
  driver_name: string | null
  driver_phone: string | null
  driver_id_number: string | null
  weighbridge_ticket_id: string | null
  gross_weight: number | null
  tare_weight: number | null
  net_weight: number | null
  origin_province: string | null
  origin_district: string | null
  origin_farm: string | null
  rubber_age_years: number | null
  material_type: RawMaterialType
  material_grade: string | null
  drc_value: number | null
  tsc_value: number | null
  dirt_content: number | null
  ash_content: number | null
  volatile_matter: number | null
  nitrogen_content: number | null
  vfa_number: number | null
  plasticity_pri: number | null
  mooney_viscosity: number | null
  color_index: string | null
  ph_value: number | null
  ammonia_content: number | null
  declared_quantity: number | null
  actual_quantity: number | null
  dry_rubber_quantity: number | null
  unit: string
  number_of_containers: number | null
  container_type: string | null
  unit_price: number | null
  total_amount: number | null
  payment_status: PaymentStatus
  storage_yard: string | null
  storage_position: string | null
  status: ReceivingStatus
  rejection_reason: string | null
  notes: string | null
  qc_notes: string | null
  images: string[] | null
  received_by: string | null
  received_by_name?: string
  qc_tested_by: string | null
  qc_tested_by_name?: string
  approved_by: string | null
  approved_by_name?: string
  received_at: string
  qc_tested_at: string | null
  approved_at: string | null
  created_at: string
  updated_at: string
  details?: RawMaterialReceivingDetail[]
}

export interface RawMaterialReceivingDetail {
  id: string
  receiving_id: string
  material_id: string | null
  material?: any
  material_type: string | null
  material_grade: string | null
  quantity: number
  dry_rubber_quantity: number | null
  number_of_containers: number | null
  drc_value: number | null
  tsc_value: number | null
  dirt_content: number | null
  unit_price: number | null
  total_amount: number | null
  storage_yard: string | null
  storage_position: string | null
  lot_number: string | null
  notes: string | null
  created_at: string
}

export interface RawMaterialStock {
  id: string
  lot_number: string
  receiving_id: string | null
  receiving_detail_id: string | null
  material_id: string | null
  material?: any
  material_type: string | null
  material_grade: string | null
  supplier_id: string | null
  supplier_name: string | null
  origin_province: string | null
  initial_quantity: number
  quantity_remaining: number
  dry_rubber_initial: number | null
  dry_rubber_remaining: number | null
  unit: string
  drc_value: number | null
  latest_drc: number | null
  qc_status: string
  storage_yard: string | null
  storage_position: string | null
  received_date: string
  expiry_date: string | null
  status: RawStockStatus
  created_at: string
  updated_at: string
}

export interface ReceivingFormData {
  supplier_id?: string
  supplier_name?: string
  purchase_order_id?: string
  vehicle_plate?: string
  driver_name?: string
  driver_phone?: string
  driver_id_number?: string
  origin_province?: string
  origin_district?: string
  origin_farm?: string
  rubber_age_years?: number
  material_type: RawMaterialType
  material_grade?: string
  notes?: string
}

export interface ReceivingQCData {
  drc_value?: number
  tsc_value?: number
  dirt_content?: number
  ash_content?: number
  volatile_matter?: number
  nitrogen_content?: number
  vfa_number?: number
  plasticity_pri?: number
  mooney_viscosity?: number
  color_index?: string
  ph_value?: number
  ammonia_content?: number
  qc_notes?: string
}

export interface ListParams {
  page?: number
  pageSize?: number
  status?: ReceivingStatus
  material_type?: RawMaterialType
  supplier_id?: string
  from_date?: string
  to_date?: string
  search?: string
  sort_by?: string
  sort_order?: 'asc' | 'desc'
}

// ============================================================================
// MATERIAL TYPE LABELS
// ============================================================================

export const MATERIAL_TYPE_LABELS: Record<RawMaterialType, string> = {
  field_latex: 'Mủ nước',
  cup_lump: 'Mủ chén',
  sheet: 'Mủ tờ (RSS)',
  slab: 'Mủ tấm/dây',
  scrap: 'Mủ tạp',
  earth_rubber: 'Mủ đất',
  latex_concentrate: 'Latex cô đặc',
  chemical: 'Hóa chất',
  other: 'Khác',
}

export const RECEIVING_STATUS_LABELS: Record<ReceivingStatus, string> = {
  draft: 'Nháp',
  weighing: 'Đang cân',
  qc_testing: 'Đang QC',
  qc_passed: 'QC đạt',
  qc_failed: 'QC không đạt',
  confirmed: 'Đã nhập',
  rejected: 'Từ chối',
  cancelled: 'Đã hủy',
}

// ============================================================================
// SERVICE
// ============================================================================

const rawMaterialReceivingService = {

  // ========================================================================
  // GENERATE CODE: NNL-YYYYMMDD-XXX
  // ========================================================================
  async generateCode(): Promise<string> {
    const { data, error } = await supabase.rpc('fn_generate_raw_receiving_code')
    if (error) {
      // Fallback: generate locally
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
      const ts = Date.now().toString().slice(-3)
      return `NNL-${today}-${ts}`
    }
    return data as string
  },

  // ========================================================================
  // CREATE
  // ========================================================================
  async create(data: ReceivingFormData & { received_by?: string }): Promise<RawMaterialReceiving> {
    const code = await this.generateCode()

    const { data: row, error } = await supabase
      .from('raw_material_receivings')
      .insert({
        code,
        supplier_id: data.supplier_id || null,
        supplier_name: data.supplier_name || null,
        purchase_order_id: data.purchase_order_id || null,
        vehicle_plate: data.vehicle_plate || null,
        driver_name: data.driver_name || null,
        driver_phone: data.driver_phone || null,
        driver_id_number: data.driver_id_number || null,
        origin_province: data.origin_province || null,
        origin_district: data.origin_district || null,
        origin_farm: data.origin_farm || null,
        rubber_age_years: data.rubber_age_years || null,
        material_type: data.material_type,
        material_grade: data.material_grade || null,
        notes: data.notes || null,
        received_by: data.received_by || null,
        status: 'draft',
      })
      .select()
      .single()

    if (error) throw error
    return row
  },

  // ========================================================================
  // UPDATE WEIGHTS (from weighbridge)
  // ========================================================================
  async updateWeights(
    id: string,
    weights: { gross_weight?: number; tare_weight?: number; weighbridge_ticket_id?: string }
  ): Promise<void> {
    const update: any = { ...weights }
    if (weights.gross_weight && weights.tare_weight) {
      update.net_weight = weights.gross_weight - weights.tare_weight
    }
    const { error } = await supabase
      .from('raw_material_receivings')
      .update(update)
      .eq('id', id)
    if (error) throw error
  },

  // ========================================================================
  // UPDATE QC DATA
  // ========================================================================
  async updateQC(
    id: string,
    qcData: ReceivingQCData & { qc_tested_by?: string }
  ): Promise<void> {
    const { error } = await supabase
      .from('raw_material_receivings')
      .update({
        ...qcData,
        qc_tested_at: new Date().toISOString(),
        status: 'qc_testing',
      })
      .eq('id', id)
    if (error) throw error
  },

  // ========================================================================
  // UPDATE QUANTITY & PRICE
  // ========================================================================
  async updateQuantityPrice(
    id: string,
    data: {
      declared_quantity?: number
      actual_quantity?: number
      unit_price?: number
      number_of_containers?: number
      container_type?: string
      storage_yard?: string
      storage_position?: string
    }
  ): Promise<void> {
    const { error } = await supabase
      .from('raw_material_receivings')
      .update(data)
      .eq('id', id)
    if (error) throw error
  },

  // ========================================================================
  // CONFIRM (QC passed → create stock lot)
  // ========================================================================
  async confirm(id: string, approved_by: string): Promise<void> {
    // 1. Get receiving
    const { data: rcv, error: err1 } = await supabase
      .from('raw_material_receivings')
      .select('*')
      .eq('id', id)
      .single()
    if (err1) throw err1

    // 2. Update status
    const { error: err2 } = await supabase
      .from('raw_material_receivings')
      .update({
        status: 'confirmed',
        approved_by,
        approved_at: new Date().toISOString(),
      })
      .eq('id', id)
    if (err2) throw err2

    // 3. Check if details exist
    const { data: details } = await supabase
      .from('raw_material_receiving_details')
      .select('*')
      .eq('receiving_id', id)

    if (details && details.length > 0) {
      // Create stock lot for each detail
      for (const d of details) {
        await this._createStockLot(rcv, d)
      }
    } else {
      // Single lot from header
      await this._createStockLot(rcv, null)
    }
  },

  async _createStockLot(rcv: any, detail: any | null): Promise<void> {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const { count } = await supabase
      .from('raw_material_stock')
      .select('*', { count: 'exact', head: true })
      .like('lot_number', `LOT-NL-${today}%`)

    const lotNo = `LOT-NL-${today}-${String((count || 0) + 1).padStart(3, '0')}`

    const qty = detail?.quantity ?? rcv.actual_quantity ?? rcv.net_weight ?? 0
    const drc = detail?.drc_value ?? rcv.drc_value
    const dryQty = drc ? Math.round(qty * drc / 100 * 100) / 100 : null

    const { error } = await supabase
      .from('raw_material_stock')
      .insert({
        lot_number: lotNo,
        receiving_id: rcv.id,
        receiving_detail_id: detail?.id || null,
        material_id: detail?.material_id || null,
        material_type: detail?.material_type || rcv.material_type,
        material_grade: detail?.material_grade || rcv.material_grade,
        supplier_id: rcv.supplier_id,
        supplier_name: rcv.supplier_name,
        origin_province: rcv.origin_province,
        initial_quantity: qty,
        quantity_remaining: qty,
        dry_rubber_initial: dryQty,
        dry_rubber_remaining: dryQty,
        drc_value: drc,
        latest_drc: drc,
        qc_status: 'passed',
        storage_yard: detail?.storage_yard || rcv.storage_yard,
        storage_position: detail?.storage_position || rcv.storage_position,
        received_date: new Date().toISOString().slice(0, 10),
        status: 'available',
      })
    if (error) throw error
  },

  // ========================================================================
  // REJECT
  // ========================================================================
  async reject(id: string, reason: string, approved_by: string): Promise<void> {
    const { error } = await supabase
      .from('raw_material_receivings')
      .update({
        status: 'rejected',
        rejection_reason: reason,
        approved_by,
        approved_at: new Date().toISOString(),
      })
      .eq('id', id)
    if (error) throw error
  },

  // ========================================================================
  // CANCEL
  // ========================================================================
  async cancel(id: string): Promise<void> {
    const { error } = await supabase
      .from('raw_material_receivings')
      .update({ status: 'cancelled' })
      .eq('id', id)
    if (error) throw error
  },

  // ========================================================================
  // LIST
  // ========================================================================
  async getAll(params: ListParams = {}): Promise<{ data: RawMaterialReceiving[]; total: number }> {
    const {
      page = 1, pageSize = 20,
      status, material_type, supplier_id,
      from_date, to_date, search,
      sort_by = 'received_at', sort_order = 'desc'
    } = params

    let query = supabase
      .from('raw_material_receivings')
      .select('*, supplier:suppliers(id, name, code)', { count: 'exact' })

    if (status) query = query.eq('status', status)
    if (material_type) query = query.eq('material_type', material_type)
    if (supplier_id) query = query.eq('supplier_id', supplier_id)
    if (from_date) query = query.gte('received_at', from_date)
    if (to_date) query = query.lte('received_at', to_date + 'T23:59:59')
    if (search) {
      query = query.or(`code.ilike.%${search}%,vehicle_plate.ilike.%${search}%,supplier_name.ilike.%${search}%,driver_name.ilike.%${search}%`)
    }

    const from = (page - 1) * pageSize
    query = query.order(sort_by, { ascending: sort_order === 'asc' })
      .range(from, from + pageSize - 1)

    const { data, count, error } = await query
    if (error) throw error
    return { data: data || [], total: count || 0 }
  },

  // ========================================================================
  // GET BY ID
  // ========================================================================
  async getById(id: string): Promise<RawMaterialReceiving | null> {
    const { data, error } = await supabase
      .from('raw_material_receivings')
      .select(`
        *,
        supplier:suppliers(id, name, code, phone, region, quality_rating),
        details:raw_material_receiving_details(
          *, material:materials(id, sku, name, unit)
        )
      `)
      .eq('id', id)
      .single()

    if (error) throw error
    return data
  },

  // ========================================================================
  // DETAILS CRUD
  // ========================================================================
  async addDetail(
    receiving_id: string,
    detail: Partial<RawMaterialReceivingDetail>
  ): Promise<RawMaterialReceivingDetail> {
    const { data, error } = await supabase
      .from('raw_material_receiving_details')
      .insert({ ...detail, receiving_id })
      .select()
      .single()
    if (error) throw error
    return data
  },

  async updateDetail(
    id: string,
    updates: Partial<RawMaterialReceivingDetail>
  ): Promise<void> {
    const { error } = await supabase
      .from('raw_material_receiving_details')
      .update(updates)
      .eq('id', id)
    if (error) throw error
  },

  async deleteDetail(id: string): Promise<void> {
    const { error } = await supabase
      .from('raw_material_receiving_details')
      .delete()
      .eq('id', id)
    if (error) throw error
  },

  // ========================================================================
  // RAW MATERIAL STOCK
  // ========================================================================
  async getStock(params: {
    status?: RawStockStatus
    material_type?: string
    supplier_id?: string
    storage_yard?: string
    search?: string
    page?: number
    pageSize?: number
  } = {}): Promise<{ data: RawMaterialStock[]; total: number }> {
    const { page = 1, pageSize = 20, status, material_type, supplier_id, storage_yard, search } = params

    let query = supabase
      .from('raw_material_stock')
      .select('*, material:materials(id, sku, name)', { count: 'exact' })

    if (status) query = query.eq('status', status)
    if (material_type) query = query.eq('material_type', material_type)
    if (supplier_id) query = query.eq('supplier_id', supplier_id)
    if (storage_yard) query = query.eq('storage_yard', storage_yard)
    if (search) {
      query = query.or(`lot_number.ilike.%${search}%,supplier_name.ilike.%${search}%`)
    }

    const from = (page - 1) * pageSize
    query = query.order('received_date', { ascending: false }).range(from, from + pageSize - 1)

    const { data, count, error } = await query
    if (error) throw error
    return { data: data || [], total: count || 0 }
  },

  async getStockById(id: string): Promise<RawMaterialStock | null> {
    const { data, error } = await supabase
      .from('raw_material_stock')
      .select('*, material:materials(id, sku, name, unit)')
      .eq('id', id)
      .single()
    if (error) throw error
    return data
  },

  // Get available stock for production (FIFO)
  async getAvailableForProduction(materialType?: string): Promise<RawMaterialStock[]> {
    let query = supabase
      .from('raw_material_stock')
      .select('*, material:materials(id, sku, name)')
      .eq('status', 'available')
      .gt('quantity_remaining', 0)
      .order('received_date', { ascending: true }) // FIFO

    if (materialType) query = query.eq('material_type', materialType)

    const { data, error } = await query
    if (error) throw error
    return data || []
  },

  // ========================================================================
  // CONSUMPTION (truy xuất nguồn gốc)
  // ========================================================================
  async recordConsumption(data: {
    production_order_id?: string
    raw_stock_id: string
    quantity_used: number
    output_batch_id?: string
    shift?: string
    team?: string
    used_by?: string
    notes?: string
  }): Promise<void> {
    // 1. Get stock to calculate dry rubber
    const { data: stock, error: err1 } = await supabase
      .from('raw_material_stock')
      .select('drc_value, quantity_remaining')
      .eq('id', data.raw_stock_id)
      .single()
    if (err1) throw err1

    const drc = stock?.drc_value || null
    const dryUsed = drc ? Math.round(data.quantity_used * drc / 100 * 100) / 100 : null

    // 2. Insert consumption record
    const { error: err2 } = await supabase
      .from('raw_material_consumption')
      .insert({
        ...data,
        dry_rubber_used: dryUsed,
        drc_at_use: drc,
      })
    if (err2) throw err2

    // 3. Reduce stock
    const newRemaining = (stock?.quantity_remaining || 0) - data.quantity_used
    const { error: err3 } = await supabase
      .from('raw_material_stock')
      .update({
        quantity_remaining: Math.max(0, newRemaining),
        status: newRemaining <= 0 ? 'depleted' : 'in_production',
      })
      .eq('id', data.raw_stock_id)
    if (err3) throw err3
  },

  // ========================================================================
  // TRACEABILITY: Backward trace from finished goods batch
  // ========================================================================
  async traceBackward(outputBatchId: string): Promise<{
    consumption: any[]
    rawStocks: any[]
    receivings: any[]
    suppliers: any[]
  }> {
    // 1. Find consumption records for this output batch
    const { data: consumption } = await supabase
      .from('raw_material_consumption')
      .select('*, raw_stock:raw_material_stock(*)')
      .eq('output_batch_id', outputBatchId)

    if (!consumption || consumption.length === 0) {
      return { consumption: [], rawStocks: [], receivings: [], suppliers: [] }
    }

    // 2. Get raw stocks
    const rawStockIds = consumption.map(c => c.raw_stock_id).filter(Boolean)
    const { data: rawStocks } = await supabase
      .from('raw_material_stock')
      .select('*')
      .in('id', rawStockIds)

    // 3. Get receivings
    const receivingIds = [...new Set((rawStocks || []).map(s => s.receiving_id).filter(Boolean))]
    const { data: receivings } = await supabase
      .from('raw_material_receivings')
      .select('*, supplier:suppliers(*)')
      .in('id', receivingIds)

    // 4. Get suppliers
    const supplierIds = [...new Set((receivings || []).map(r => r.supplier_id).filter(Boolean))]
    const { data: suppliers } = await supabase
      .from('suppliers')
      .select('*')
      .in('id', supplierIds)

    return {
      consumption: consumption || [],
      rawStocks: rawStocks || [],
      receivings: receivings || [],
      suppliers: suppliers || [],
    }
  },

  // ========================================================================
  // STATS
  // ========================================================================
  async getDailyStats(date?: string): Promise<{
    total_receivings: number
    total_net_weight: number
    total_dry_rubber: number
    by_material_type: Record<string, number>
    by_status: Record<string, number>
  }> {
    const targetDate = date || new Date().toISOString().slice(0, 10)

    const { data, error } = await supabase
      .from('raw_material_receivings')
      .select('material_type, status, net_weight, dry_rubber_quantity')
      .gte('received_at', targetDate + 'T00:00:00')
      .lte('received_at', targetDate + 'T23:59:59')

    if (error) throw error

    const stats = {
      total_receivings: data?.length || 0,
      total_net_weight: 0,
      total_dry_rubber: 0,
      by_material_type: {} as Record<string, number>,
      by_status: {} as Record<string, number>,
    }

    for (const r of data || []) {
      stats.total_net_weight += r.net_weight || 0
      stats.total_dry_rubber += r.dry_rubber_quantity || 0
      stats.by_material_type[r.material_type] = (stats.by_material_type[r.material_type] || 0) + 1
      stats.by_status[r.status] = (stats.by_status[r.status] || 0) + 1
    }

    return stats
  },

  // ========================================================================
  // VEHICLE PLATE AUTOCOMPLETE (từ lịch sử)
  // ========================================================================
  async searchVehiclePlates(query: string): Promise<string[]> {
    const { data } = await supabase
      .from('raw_material_receivings')
      .select('vehicle_plate')
      .ilike('vehicle_plate', `%${query}%`)
      .not('vehicle_plate', 'is', null)
      .order('received_at', { ascending: false })
      .limit(10)

    const plates = [...new Set((data || []).map(d => d.vehicle_plate).filter(Boolean))]
    return plates as string[]
  },

  // ========================================================================
  // SUPPLIER HISTORY (DRC trung bình, số lần giao)
  // ========================================================================
  async getSupplierHistory(supplierId: string): Promise<{
    total_deliveries: number
    avg_drc: number | null
    total_dry_rubber: number
    last_delivery: string | null
    quality_trend: Array<{ date: string; drc: number }>
  }> {
    const { data } = await supabase
      .from('raw_material_receivings')
      .select('received_at, drc_value, dry_rubber_quantity')
      .eq('supplier_id', supplierId)
      .eq('status', 'confirmed')
      .order('received_at', { ascending: false })

    if (!data || data.length === 0) {
      return { total_deliveries: 0, avg_drc: null, total_dry_rubber: 0, last_delivery: null, quality_trend: [] }
    }

    const drcValues = data.filter(d => d.drc_value != null).map(d => d.drc_value as number)
    const avgDrc = drcValues.length > 0
      ? Math.round(drcValues.reduce((a, b) => a + b, 0) / drcValues.length * 100) / 100
      : null

    return {
      total_deliveries: data.length,
      avg_drc: avgDrc,
      total_dry_rubber: data.reduce((sum, d) => sum + (d.dry_rubber_quantity || 0), 0),
      last_delivery: data[0]?.received_at || null,
      quality_trend: data.slice(0, 30).filter(d => d.drc_value != null).map(d => ({
        date: d.received_at,
        drc: d.drc_value as number,
      })).reverse(),
    }
  },
}

export default rawMaterialReceivingService