// ============================================================================
// FILE: src/services/rubber/rubberIntakeBatchService.ts
// MODULE: Thu mua Mủ Cao su — Huy Anh Rubber ERP
// PHASE: 3.6 — Bước 3.6.4
// MÔ TẢ: CRUD đợt nhập mủ — dùng chung Việt + Lào TT + Lào ĐL
// BẢNG: rubber_intake_batches, rubber_suppliers
// PATTERN: async/await, Supabase, RubberPaginationParams
// ============================================================================

import { supabase } from '../../lib/supabase'
import type {
  RubberIntakeBatch,
  RubberIntakeBatchFormData,
  RubberSourceType,
  IntakeBatchStatus,
  RubberPaginationParams,
  RubberPaginatedResponse,
  RubberSupplierReport,
} from './rubber.types'

// ============================================================================
// CONSTANTS
// ============================================================================

/** Select string — join supplier */
const INTAKE_SELECT = `
  *,
  supplier:rubber_suppliers(id, code, name, phone, country, supplier_type)
`

/** Compact select cho danh sách */
const INTAKE_LIST_SELECT = `
  id, source_type, intake_date, supplier_id, product_code,
  settled_qty_ton, settled_price_per_ton,
  purchase_qty_kg, unit_price, price_currency, total_amount,
  gross_weight_kg, net_weight_kg, drc_percent, finished_product_ton,
  invoice_no, vehicle_plate, vehicle_label,
  status, notes, created_at, updated_at,
  supplier:rubber_suppliers(id, code, name, country, supplier_type)
`

// ============================================================================
// SERVICE
// ============================================================================

export const rubberIntakeBatchService = {

  // ==========================================================================
  // GET ALL — Danh sách đợt nhập, phân trang, filter
  // ==========================================================================
  async getAll(
    params: RubberPaginationParams
  ): Promise<RubberPaginatedResponse<RubberIntakeBatch>> {
    const {
      page = 1,
      pageSize = 20,
      search,
      source_type,
      supplier_id,
      status,
      from_date,
      to_date,
      product_code,
      vehicle_plate,
    } = params

    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    let query = supabase
      .from('rubber_intake_batches')
      .select(INTAKE_LIST_SELECT, { count: 'exact' })

    // Filters
    if (source_type) query = query.eq('source_type', source_type)
    if (supplier_id) query = query.eq('supplier_id', supplier_id)
    if (status) query = query.eq('status', status)
    if (product_code) query = query.ilike('product_code', `%${product_code}%`)
    if (vehicle_plate) query = query.ilike('vehicle_plate', `%${vehicle_plate}%`)
    if (from_date) query = query.gte('intake_date', from_date)
    if (to_date) query = query.lte('intake_date', to_date)

    if (search && search.trim()) {
      const s = search.trim()
      query = query.or(
        `product_code.ilike.%${s}%,invoice_no.ilike.%${s}%,vehicle_plate.ilike.%${s}%,vehicle_label.ilike.%${s}%`
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
      data: (data || []) as unknown as RubberIntakeBatch[],
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    }
  },

  // ==========================================================================
  // GET BY ID — Chi tiết đợt nhập + join supplier
  // ==========================================================================
  async getById(id: string): Promise<RubberIntakeBatch | null> {
    const { data, error } = await supabase
      .from('rubber_intake_batches')
      .select(INTAKE_SELECT)
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null
      throw error
    }

    return data as unknown as RubberIntakeBatch
  },

  // ==========================================================================
  // CREATE — Tạo đợt nhập mủ mới
  // ==========================================================================
  async create(
    formData: RubberIntakeBatchFormData,
    createdBy?: string
  ): Promise<RubberIntakeBatch> {
    // Auto-calculate tùy theo source_type
    const calculated = this._autoCalculate(formData)

    const insertData = {
      source_type: formData.source_type,
      intake_date: formData.intake_date,
      supplier_id: formData.supplier_id || null,
      product_code: formData.product_code || null,
      // Mủ Việt
      settled_qty_ton: formData.settled_qty_ton ?? null,
      settled_price_per_ton: formData.settled_price_per_ton ?? null,
      // Mủ Lào
      purchase_qty_kg: formData.purchase_qty_kg ?? null,
      unit_price: formData.unit_price ?? null,
      price_currency: formData.price_currency || 'VND',
      total_amount: calculated.total_amount ?? formData.total_amount ?? null,
      // Chi tiết nhập kho
      gross_weight_kg: formData.gross_weight_kg ?? null,
      net_weight_kg: formData.net_weight_kg ?? null,
      drc_percent: formData.drc_percent ?? null,
      finished_product_ton: calculated.finished_product_ton ?? formData.finished_product_ton ?? null,
      avg_unit_price: formData.avg_unit_price ?? null,
      // Tham chiếu
      invoice_no: formData.invoice_no || null,
      sct_ref: formData.sct_ref || null,
      location_name: formData.location_name || null,
      buyer_name: formData.buyer_name || null,
      vehicle_plate: formData.vehicle_plate || null,
      vehicle_label: formData.vehicle_label || null,
      exchange_rate: formData.exchange_rate ?? null,
      fund_transfer_id: formData.fund_transfer_id || null,
      notes: formData.notes || null,
      status: 'draft' as IntakeBatchStatus,
      created_by: createdBy || null,
    }

    const { data, error } = await supabase
      .from('rubber_intake_batches')
      .insert(insertData)
      .select(INTAKE_SELECT)
      .single()

    if (error) throw error
    return data as unknown as RubberIntakeBatch
  },

  // ==========================================================================
  // UPDATE — Cập nhật đợt nhập (chỉ khi draft hoặc confirmed)
  // ==========================================================================
  async update(
    id: string,
    formData: Partial<RubberIntakeBatchFormData>
  ): Promise<RubberIntakeBatch> {
    // Validate status
    const existing = await this.getById(id)
    if (!existing) throw new Error('Không tìm thấy đợt nhập mủ')
    if (existing.status === 'settled') {
      throw new Error('Không thể sửa đợt nhập đã quyết toán')
    }

    // Auto-calculate with merged data
    const merged = { ...existing, ...formData } as RubberIntakeBatchFormData
    const calculated = this._autoCalculate(merged)

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    // Chỉ update các field được truyền vào
    const allowedFields: (keyof RubberIntakeBatchFormData)[] = [
      'source_type', 'intake_date', 'supplier_id', 'product_code',
      'settled_qty_ton', 'settled_price_per_ton',
      'purchase_qty_kg', 'unit_price', 'price_currency', 'total_amount',
      'gross_weight_kg', 'net_weight_kg', 'drc_percent',
      'finished_product_ton', 'avg_unit_price',
      'invoice_no', 'sct_ref', 'location_name', 'buyer_name',
      'vehicle_plate', 'vehicle_label', 'exchange_rate', 'fund_transfer_id',
      'notes',
    ]

    for (const field of allowedFields) {
      if (field in formData) {
        updateData[field] = (formData as Record<string, unknown>)[field] ?? null
      }
    }

    // Override auto-calculated fields
    if (calculated.total_amount !== undefined) {
      updateData.total_amount = calculated.total_amount
    }
    if (calculated.finished_product_ton !== undefined) {
      updateData.finished_product_ton = calculated.finished_product_ton
    }

    const { data, error } = await supabase
      .from('rubber_intake_batches')
      .update(updateData)
      .eq('id', id)
      .select(INTAKE_SELECT)
      .single()

    if (error) throw error
    return data as unknown as RubberIntakeBatch
  },

  // ==========================================================================
  // DELETE — Xoá đợt nhập (chỉ khi draft)
  // ==========================================================================
  async delete(id: string): Promise<void> {
    const existing = await this.getById(id)
    if (!existing) throw new Error('Không tìm thấy đợt nhập mủ')
    if (existing.status !== 'draft') {
      throw new Error('Chỉ có thể xoá đợt nhập ở trạng thái Nháp')
    }

    const { error } = await supabase
      .from('rubber_intake_batches')
      .delete()
      .eq('id', id)

    if (error) throw error
  },

  // ==========================================================================
  // CONFIRM — Xác nhận đợt nhập: draft → confirmed
  // ==========================================================================
  async confirm(id: string, confirmedBy?: string): Promise<RubberIntakeBatch> {
    const existing = await this.getById(id)
    if (!existing) throw new Error('Không tìm thấy đợt nhập mủ')
    if (existing.status !== 'draft') {
      throw new Error('Chỉ có thể xác nhận đợt nhập ở trạng thái Nháp')
    }

    // Validate theo source_type
    this._validateForConfirm(existing)

    const { data, error } = await supabase
      .from('rubber_intake_batches')
      .update({
        status: 'confirmed' as IntakeBatchStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select(INTAKE_SELECT)
      .single()

    if (error) throw error
    return data as unknown as RubberIntakeBatch
  },

  // ==========================================================================
  // SETTLE — Đánh dấu đã quyết toán: confirmed → settled
  // ==========================================================================
  async settle(id: string): Promise<RubberIntakeBatch> {
    const existing = await this.getById(id)
    if (!existing) throw new Error('Không tìm thấy đợt nhập mủ')
    if (existing.status !== 'confirmed') {
      throw new Error('Chỉ có thể quyết toán đợt nhập đã xác nhận')
    }

    const { data, error } = await supabase
      .from('rubber_intake_batches')
      .update({
        status: 'settled' as IntakeBatchStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select(INTAKE_SELECT)
      .single()

    if (error) throw error
    return data as unknown as RubberIntakeBatch
  },

  // ==========================================================================
  // BÁO CÁO — Tổng hợp theo tháng
  // ==========================================================================
  async getMonthlyReport(
    year: number,
    month: number,
    sourceType?: RubberSourceType
  ): Promise<{
    total_batches: number
    total_gross_weight_kg: number
    total_net_weight_kg: number
    total_finished_product_ton: number
    avg_drc_percent: number
    total_amount: number
    by_source: Record<RubberSourceType, {
      count: number
      gross_kg: number
      net_kg: number
      finished_ton: number
      amount: number
    }>
  }> {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`
    const endDate = month === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(month + 1).padStart(2, '0')}-01`

    let query = supabase
      .from('rubber_intake_batches')
      .select('*')
      .gte('intake_date', startDate)
      .lt('intake_date', endDate)
      .neq('status', 'draft')

    if (sourceType) query = query.eq('source_type', sourceType)

    const { data, error } = await query
    if (error) throw error

    const batches = (data || []) as unknown as RubberIntakeBatch[]

    // Tổng hợp
    const bySource: Record<string, { count: number; gross_kg: number; net_kg: number; finished_ton: number; amount: number }> = {
      vietnam: { count: 0, gross_kg: 0, net_kg: 0, finished_ton: 0, amount: 0 },
      lao_direct: { count: 0, gross_kg: 0, net_kg: 0, finished_ton: 0, amount: 0 },
      lao_agent: { count: 0, gross_kg: 0, net_kg: 0, finished_ton: 0, amount: 0 },
    }

    let totalDrc = 0
    let drcCount = 0

    for (const b of batches) {
      const src = bySource[b.source_type]
      if (!src) continue

      src.count++
      src.gross_kg += b.gross_weight_kg ?? 0
      src.net_kg += b.net_weight_kg ?? 0
      src.finished_ton += b.finished_product_ton ?? 0
      src.amount += b.total_amount ?? 0

      if (b.drc_percent && b.drc_percent > 0) {
        totalDrc += b.drc_percent
        drcCount++
      }
    }

    return {
      total_batches: batches.length,
      total_gross_weight_kg: batches.reduce((s, b) => s + (b.gross_weight_kg ?? 0), 0),
      total_net_weight_kg: batches.reduce((s, b) => s + (b.net_weight_kg ?? 0), 0),
      total_finished_product_ton: batches.reduce((s, b) => s + (b.finished_product_ton ?? 0), 0),
      avg_drc_percent: drcCount > 0 ? Math.round((totalDrc / drcCount) * 100) / 100 : 0,
      total_amount: batches.reduce((s, b) => s + (b.total_amount ?? 0), 0),
      by_source: bySource as Record<RubberSourceType, typeof bySource[string]>,
    }
  },

  // ==========================================================================
  // BÁO CÁO — DS đợt nhập của 1 NCC trong khoảng thời gian
  // ==========================================================================
  async getBySupplier(
    supplierId: string,
    fromDate: string,
    toDate: string
  ): Promise<RubberIntakeBatch[]> {
    const { data, error } = await supabase
      .from('rubber_intake_batches')
      .select(INTAKE_LIST_SELECT)
      .eq('supplier_id', supplierId)
      .gte('intake_date', fromDate)
      .lte('intake_date', toDate)
      .order('intake_date', { ascending: true })

    if (error) throw error
    return (data || []) as unknown as RubberIntakeBatch[]
  },

  // ==========================================================================
  // BÁO CÁO — Tổng hợp theo NCC (cho dashboard)
  // ==========================================================================
  async getSupplierSummary(
    fromDate: string,
    toDate: string,
    sourceType?: RubberSourceType
  ): Promise<RubberSupplierReport[]> {
    let query = supabase
      .from('rubber_intake_batches')
      .select(`
        supplier_id, source_type, product_code,
        gross_weight_kg, net_weight_kg, drc_percent,
        finished_product_ton, total_amount, price_currency,
        supplier:rubber_suppliers(id, name)
      `)
      .gte('intake_date', fromDate)
      .lte('intake_date', toDate)
      .neq('status', 'draft')

    if (sourceType) query = query.eq('source_type', sourceType)

    const { data, error } = await query
    if (error) throw error

    // Group by supplier
    const map = new Map<string, RubberSupplierReport>()

    for (const row of (data || []) as any[]) {
      const key = row.supplier_id || 'unknown'
      if (!map.has(key)) {
        map.set(key, {
          supplier_id: key,
          supplier_name: row.supplier?.name || 'Không rõ',
          source_type: row.source_type,
          batch_count: 0,
          total_fresh_weight_kg: 0,
          total_intake_weight_kg: 0,
          avg_drc_percent: 0,
          total_finished_product_ton: 0,
          total_amount: 0,
          currency: row.price_currency || 'VND',
        })
      }

      const report = map.get(key)!
      report.batch_count++
      report.total_fresh_weight_kg += row.gross_weight_kg ?? 0
      report.total_intake_weight_kg += row.net_weight_kg ?? 0
      report.total_finished_product_ton += row.finished_product_ton ?? 0
      report.total_amount += row.total_amount ?? 0
    }

    // Tính avg DRC
    for (const row of (data || []) as any[]) {
      const key = row.supplier_id || 'unknown'
      const report = map.get(key)
      if (report && row.drc_percent && row.drc_percent > 0) {
        // Weighted average sẽ chính xác hơn, tạm dùng simple avg
        report.avg_drc_percent += row.drc_percent
      }
    }
    for (const report of map.values()) {
      if (report.batch_count > 0 && report.avg_drc_percent > 0) {
        report.avg_drc_percent = Math.round(
          (report.avg_drc_percent / report.batch_count) * 100
        ) / 100
      }
    }

    return Array.from(map.values())
      .sort((a, b) => b.total_amount - a.total_amount)
  },

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  /**
   * Auto-calculate fields dựa theo source_type:
   * - Lào: total_amount = purchase_qty_kg × unit_price
   * - Chung: finished_product_ton = net_weight_kg × DRC% / 1000
   */
  _autoCalculate(data: RubberIntakeBatchFormData): {
    total_amount?: number
    finished_product_ton?: number
  } {
    const result: { total_amount?: number; finished_product_ton?: number } = {}

    // Auto-calc total_amount cho mủ Lào
    if (
      (data.source_type === 'lao_direct' || data.source_type === 'lao_agent') &&
      data.purchase_qty_kg &&
      data.unit_price
    ) {
      result.total_amount = Math.round(data.purchase_qty_kg * data.unit_price * 100) / 100
    }

    // Auto-calc finished_product_ton = net_weight × DRC% / 1000
    if (data.net_weight_kg && data.drc_percent) {
      result.finished_product_ton =
        Math.round((data.net_weight_kg * data.drc_percent / 100) / 1000 * 10000) / 10000
    }

    return result
  },

  /**
   * Validate trước khi confirm — kiểm tra dữ liệu bắt buộc theo luồng
   */
  _validateForConfirm(batch: RubberIntakeBatch): void {
    switch (batch.source_type) {
      case 'vietnam':
        if (!batch.settled_qty_ton || !batch.settled_price_per_ton) {
          throw new Error('Mủ Việt: cần có KL chốt (tấn) và giá chốt TP')
        }
        break
      case 'lao_direct':
        if (!batch.purchase_qty_kg || !batch.unit_price) {
          throw new Error('Mủ Lào TT: cần có KL mua (kg) và đơn giá')
        }
        break
      case 'lao_agent':
        if (!batch.purchase_qty_kg || !batch.unit_price || !batch.exchange_rate) {
          throw new Error('Mủ Lào ĐL: cần có KL mua, đơn giá và tỷ giá quy đổi')
        }
        break
    }

    if (!batch.supplier_id) {
      throw new Error('Cần chọn nhà cung cấp trước khi xác nhận')
    }
  },
}

// ============================================================================
// STANDALONE EXPORTS
// ============================================================================

export const {
  getAll: getAllIntakeBatches,
  getById: getIntakeBatchById,
  create: createIntakeBatch,
  update: updateIntakeBatch,
  delete: deleteIntakeBatch,
  confirm: confirmIntakeBatch,
  settle: settleIntakeBatch,
  getMonthlyReport: getIntakeMonthlyReport,
  getBySupplier: getIntakeBySupplier,
  getSupplierSummary: getIntakeSupplierSummary,
} = rubberIntakeBatchService

export default rubberIntakeBatchService