// ============================================================================
// FILE: src/services/rubber/rubberSettlementService.ts
// MODULE: Thu mua Mủ Cao su — Huy Anh Rubber ERP
// PHASE: 3.6 — Bước 3.6.5 — V2 FIX theo schema thật
// DB COLUMNS: settlement_code, source_type, supplier_id, settlement_date,
//   batch_ids, weighed_kg, drc_percent, finished_product_ton, total_qty_ton,
//   unit_price, currency, exchange_rate,
//   total_amount, total_amount_vnd, paid_amount, remaining_amount,
//   payment_status (unpaid|partial|paid), approved_by, approved_at,
//   bank_account, bank_name, payment_method,
//   notes, status (draft|approved|closed|cancelled), created_by
// ============================================================================

import { supabase } from '../../lib/supabase'
import type {
  RubberSettlement,
  RubberSettlementFormData,
  RubberSettlementPayment,
  RubberSettlementPaymentFormData,
  RubberSourceType,
  SettlementStatus,
  PaymentStatus,
  RubberCurrency,
  RubberPaginationParams,
  RubberPaginatedResponse,
  RubberDebtSummary,
} from './rubber.types'

// ============================================================================
// CONSTANTS
// ============================================================================

const SETTLEMENT_SELECT = `
  *,
  supplier:rubber_suppliers(id, code, name, phone, country, supplier_type, bank_account, bank_name),
  payments:rubber_settlement_payments(
    id, settlement_id, payment_no, payment_date,
    amount, currency, method, cash_amount, transfer_amount,
    reference_no, bank_name, notes, created_at
  )
`

const SETTLEMENT_LIST_SELECT = `
  id, settlement_code, source_type, settlement_date, supplier_id,
  batch_ids, weighed_kg, drc_percent, finished_product_ton, total_qty_ton,
  unit_price, currency, exchange_rate,
  total_amount, total_amount_vnd, paid_amount, remaining_amount,
  payment_status, payment_method, status, notes,
  created_at, updated_at,
  supplier:rubber_suppliers(id, code, name, country, supplier_type)
`

// ============================================================================
// HELPERS
// ============================================================================

/** Auto-gen settlement_code: QT-YYMMDD-XXX */
async function generateCode(date?: string): Promise<string> {
  const d = date ? new Date(date) : new Date()
  const yy = String(d.getFullYear()).slice(2)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const prefix = `QT-${yy}${mm}${dd}`

  const { count } = await supabase
    .from('rubber_settlements')
    .select('id', { count: 'exact', head: true })
    .like('settlement_code', `${prefix}%`)

  const seq = String((count || 0) + 1).padStart(3, '0')
  return `${prefix}-${seq}`
}

// ============================================================================
// SERVICE
// ============================================================================

export const rubberSettlementService = {

  // ==========================================================================
  // GET ALL
  // ==========================================================================
  async getAll(
    params: RubberPaginationParams
  ): Promise<RubberPaginatedResponse<RubberSettlement>> {
    const { page = 1, pageSize = 20, search, source_type, supplier_id, status, from_date, to_date } = params
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    let query = supabase
      .from('rubber_settlements')
      .select(SETTLEMENT_LIST_SELECT, { count: 'exact' })

    if (source_type) query = query.eq('source_type', source_type)
    if (supplier_id) query = query.eq('supplier_id', supplier_id)
    if (status) query = query.eq('status', status)
    if (from_date) query = query.gte('settlement_date', from_date)
    if (to_date) query = query.lte('settlement_date', to_date)

    if (search?.trim()) {
      const s = search.trim()
      query = query.or(`settlement_code.ilike.%${s}%,notes.ilike.%${s}%`)
    }

    const { data, count, error } = await query
      .order('settlement_date', { ascending: false })
      .order('created_at', { ascending: false })
      .range(from, to)

    if (error) throw error
    return {
      data: (data || []) as unknown as RubberSettlement[],
      total: count ?? 0,
      page,
      pageSize,
      totalPages: Math.ceil((count ?? 0) / pageSize),
    }
  },

  // ==========================================================================
  // GET BY ID
  // ==========================================================================
  async getById(id: string): Promise<RubberSettlement | null> {
    const { data, error } = await supabase
      .from('rubber_settlements')
      .select(SETTLEMENT_SELECT)
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null
      throw error
    }

    const settlement = data as unknown as RubberSettlement
    if (settlement.payments) {
      settlement.payments.sort((a, b) => a.payment_no - b.payment_no)
    }
    return settlement
  },

  // ==========================================================================
  // CREATE
  // ==========================================================================
  async create(
    formData: RubberSettlementFormData,
    createdBy?: string
  ): Promise<RubberSettlement> {
    const calc = this._autoCalculate(formData)
    const code = await generateCode(formData.settlement_date)

    const insertData = {
      settlement_code: code,
      source_type: formData.source_type,
      settlement_date: formData.settlement_date,
      supplier_id: formData.supplier_id || null,
      batch_ids: formData.batch_ids || [],
      weighed_kg: formData.weighed_kg ?? null,
      drc_percent: formData.drc_percent ?? null,
      finished_product_ton: calc.finished_product_ton ?? formData.finished_product_ton ?? null,
      total_qty_ton: formData.total_qty_ton ?? null,
      unit_price: formData.unit_price ?? null,
      currency: formData.currency || 'VND',
      exchange_rate: formData.exchange_rate ?? null,
      total_amount: calc.total_amount ?? formData.total_amount ?? null,
      total_amount_vnd: calc.total_amount_vnd ?? formData.total_amount_vnd ?? null,
      paid_amount: 0,
      remaining_amount: calc.total_amount_vnd ?? calc.total_amount ?? formData.total_amount_vnd ?? formData.total_amount ?? 0,
      payment_status: 'unpaid' as PaymentStatus,
      payment_method: formData.payment_method || null,
      bank_account: formData.bank_account || null,
      bank_name: formData.bank_name || null,
      status: 'draft' as SettlementStatus,
      notes: formData.notes || null,
      created_by: createdBy || null,
    }

    const { data, error } = await supabase
      .from('rubber_settlements')
      .insert(insertData)
      .select(SETTLEMENT_SELECT)
      .single()

    if (error) throw error
    return data as unknown as RubberSettlement
  },

  // ==========================================================================
  // UPDATE
  // ==========================================================================
  async update(
    id: string,
    formData: Partial<RubberSettlementFormData>
  ): Promise<RubberSettlement> {
    const existing = await this.getById(id)
    if (!existing) throw new Error('Không tìm thấy phiếu quyết toán')
    if (existing.status === 'closed') {
      throw new Error('Không thể sửa phiếu đã đóng')
    }

    const merged = { source_type: existing.source_type, ...formData } as RubberSettlementFormData
    merged.weighed_kg = formData.weighed_kg ?? existing.weighed_kg
    merged.drc_percent = formData.drc_percent ?? existing.drc_percent
    merged.unit_price = formData.unit_price ?? existing.unit_price
    merged.exchange_rate = formData.exchange_rate ?? existing.exchange_rate

    const calc = this._autoCalculate(merged)

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }

    const allowedFields: (keyof RubberSettlementFormData)[] = [
      'source_type', 'settlement_date', 'supplier_id',
      'batch_ids', 'weighed_kg', 'drc_percent', 'finished_product_ton', 'total_qty_ton',
      'unit_price', 'currency', 'exchange_rate',
      'total_amount', 'total_amount_vnd',
      'payment_method', 'bank_account', 'bank_name', 'notes',
    ]

    for (const field of allowedFields) {
      if (field in formData) {
        updateData[field] = (formData as Record<string, unknown>)[field] ?? null
      }
    }

    if (calc.finished_product_ton !== undefined) updateData.finished_product_ton = calc.finished_product_ton
    if (calc.total_amount !== undefined) updateData.total_amount = calc.total_amount
    if (calc.total_amount_vnd !== undefined) updateData.total_amount_vnd = calc.total_amount_vnd

    // Recalc remaining
    const newTotal = (calc.total_amount_vnd ?? calc.total_amount ?? existing.total_amount_vnd ?? existing.total_amount ?? 0) as number
    updateData.remaining_amount = newTotal - (existing.paid_amount ?? 0)

    const { data, error } = await supabase
      .from('rubber_settlements')
      .update(updateData)
      .eq('id', id)
      .select(SETTLEMENT_SELECT)
      .single()

    if (error) throw error
    return data as unknown as RubberSettlement
  },

  // ==========================================================================
  // DELETE
  // ==========================================================================
  async delete(id: string): Promise<void> {
    const existing = await this.getById(id)
    if (!existing) throw new Error('Không tìm thấy phiếu quyết toán')
    if (existing.status !== 'draft') throw new Error('Chỉ có thể xoá phiếu Nháp')
    if (existing.payments && existing.payments.length > 0) {
      throw new Error('Không thể xoá phiếu đã có thanh toán')
    }

    const { error } = await supabase.from('rubber_settlements').delete().eq('id', id)
    if (error) throw error
  },

  // ==========================================================================
  // APPROVE — draft → approved
  // ==========================================================================
  async approve(id: string, approvedBy?: string): Promise<RubberSettlement> {
    const existing = await this.getById(id)
    if (!existing) throw new Error('Không tìm thấy phiếu quyết toán')
    if (existing.status !== 'draft') throw new Error('Chỉ duyệt phiếu Nháp')

    this._validateForApprove(existing)

    const { data, error } = await supabase
      .from('rubber_settlements')
      .update({
        status: 'approved' as SettlementStatus,
        approved_by: approvedBy || null,
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select(SETTLEMENT_SELECT)
      .single()

    if (error) throw error
    return data as unknown as RubberSettlement
  },

  // ==========================================================================
  // ADD PAYMENT
  // ==========================================================================
  async addPayment(
    settlementId: string,
    paymentData: RubberSettlementPaymentFormData,
    createdBy?: string
  ): Promise<RubberSettlement> {
    const settlement = await this.getById(settlementId)
    if (!settlement) throw new Error('Không tìm thấy phiếu quyết toán')
    if (settlement.status === 'draft') throw new Error('Cần duyệt phiếu trước')
    if (settlement.payment_status === 'paid') throw new Error('Đã thanh toán đủ')

    const currentPayments = settlement.payments || []
    const nextNo = currentPayments.length > 0
      ? Math.max(...currentPayments.map(p => p.payment_no)) + 1
      : 1

    const isCash = paymentData.method === 'cash'

    const { error: payErr } = await supabase
      .from('rubber_settlement_payments')
      .insert({
        settlement_id: settlementId,
        payment_no: nextNo,
        payment_date: paymentData.payment_date,
        amount: paymentData.amount,
        currency: paymentData.currency || settlement.currency || 'VND',
        method: paymentData.method || 'cash',
        cash_amount: isCash ? paymentData.amount : (paymentData.cash_amount ?? 0),
        transfer_amount: !isCash ? paymentData.amount : (paymentData.transfer_amount ?? 0),
        reference_no: paymentData.reference_no || null,
        bank_name: paymentData.bank_name || null,
        notes: paymentData.notes || null,
        created_by: createdBy || null,
      })

    if (payErr) throw payErr

    await this._recalculatePaymentStatus(settlementId)

    const updated = await this.getById(settlementId)
    if (!updated) throw new Error('Lỗi tải phiếu sau thanh toán')
    return updated
  },

  // ==========================================================================
  // REMOVE PAYMENT
  // ==========================================================================
  async removePayment(paymentId: string): Promise<RubberSettlement> {
    const { data: payment, error: fetchErr } = await supabase
      .from('rubber_settlement_payments')
      .select('id, settlement_id')
      .eq('id', paymentId)
      .single()

    if (fetchErr) throw fetchErr
    if (!payment) throw new Error('Không tìm thấy đợt thanh toán')

    const { error: delErr } = await supabase
      .from('rubber_settlement_payments')
      .delete()
      .eq('id', paymentId)
    if (delErr) throw delErr

    await this._recalculatePaymentStatus(payment.settlement_id)

    const updated = await this.getById(payment.settlement_id)
    if (!updated) throw new Error('Lỗi tải phiếu sau xoá thanh toán')
    return updated
  },

  // ==========================================================================
  // GET DEBT SUMMARY
  // ==========================================================================
  async getDebtSummary(sourceType?: RubberSourceType): Promise<RubberDebtSummary[]> {
    let query = supabase
      .from('rubber_settlements')
      .select(`
        id, source_type, supplier_id, currency,
        total_amount, total_amount_vnd, paid_amount, remaining_amount,
        supplier:rubber_suppliers(id, name)
      `)
      .in('status', ['approved', 'closed'])

    if (sourceType) query = query.eq('source_type', sourceType)

    const { data, error } = await query
    if (error) throw error

    const map = new Map<string, RubberDebtSummary>()

    for (const row of (data || []) as any[]) {
      const key = row.supplier_id || 'unknown'
      if (!map.has(key)) {
        map.set(key, {
          supplier_id: key,
          supplier_name: row.supplier?.name || 'Không rõ',
          source_type: row.source_type,
          total_settled: 0,
          total_paid: 0,
          remaining_debt: 0,
          currency: row.currency || 'VND',
        })
      }
      const debt = map.get(key)!
      debt.total_settled += (row.total_amount_vnd ?? row.total_amount ?? 0)
      debt.total_paid += (row.paid_amount ?? 0)
    }

    for (const debt of map.values()) {
      debt.remaining_debt = Math.round((debt.total_settled - debt.total_paid) * 100) / 100
    }

    return Array.from(map.values())
      .filter(d => d.remaining_debt > 0 || d.total_settled > 0)
      .sort((a, b) => b.remaining_debt - a.remaining_debt)
  },

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  _autoCalculate(data: RubberSettlementFormData): {
    finished_product_ton?: number
    total_amount?: number
    total_amount_vnd?: number
  } {
    const result: { finished_product_ton?: number; total_amount?: number; total_amount_vnd?: number } = {}

    // finished_product_ton = weighed_kg × DRC% / 100 / 1000
    if (data.weighed_kg && data.drc_percent) {
      result.finished_product_ton = Math.round((data.weighed_kg * data.drc_percent / 100 / 1000) * 10000) / 10000
    }

    // total_amount = total_qty_ton × unit_price (hoặc finished_product_ton × unit_price)
    const qty = data.total_qty_ton ?? result.finished_product_ton
    if (qty && data.unit_price) {
      result.total_amount = Math.round(qty * data.unit_price * 100) / 100
    }

    // Lào ĐL: total_amount_vnd = total_amount × exchange_rate
    if (data.source_type === 'lao_agent' && data.exchange_rate) {
      const amt = result.total_amount ?? data.total_amount
      if (amt) {
        result.total_amount_vnd = Math.round(amt * data.exchange_rate)
      }
    }

    return result
  },

  _validateForApprove(s: RubberSettlement): void {
    if (!s.supplier_id) throw new Error('Cần chọn NCC trước khi duyệt')
    if (!s.total_amount || s.total_amount <= 0) throw new Error('Thành tiền phải > 0')
    if (s.source_type === 'lao_agent' && (!s.exchange_rate || s.exchange_rate <= 0)) {
      throw new Error('Mủ Lào ĐL: cần tỷ giá')
    }
  },

  async _recalculatePaymentStatus(settlementId: string): Promise<void> {
    const { data: settlement } = await supabase
      .from('rubber_settlements')
      .select('id, total_amount, total_amount_vnd, source_type, status, payment_status')
      .eq('id', settlementId)
      .single()

    if (!settlement) return

    const { data: payments } = await supabase
      .from('rubber_settlement_payments')
      .select('amount')
      .eq('settlement_id', settlementId)

    const totalPaid = (payments || []).reduce((s, p) => s + (p.amount || 0), 0)
    const targetAmount = settlement.source_type === 'lao_agent'
      ? (settlement.total_amount_vnd ?? settlement.total_amount ?? 0)
      : (settlement.total_amount ?? 0)

    let newPaymentStatus: PaymentStatus
    if (totalPaid <= 0) {
      newPaymentStatus = 'unpaid'
    } else if (totalPaid >= targetAmount) {
      newPaymentStatus = 'paid'
    } else {
      newPaymentStatus = 'partial'
    }

    const newStatus: SettlementStatus = newPaymentStatus === 'paid' ? 'closed' : settlement.status as SettlementStatus
    const remaining = Math.max(0, targetAmount - totalPaid)

    await supabase
      .from('rubber_settlements')
      .update({
        paid_amount: totalPaid,
        remaining_amount: remaining,
        payment_status: newPaymentStatus,
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', settlementId)
  },
}

// ============================================================================
// STANDALONE EXPORTS
// ============================================================================

export const {
  getAll: getAllSettlements,
  getById: getSettlementById,
  create: createSettlement,
  update: updateSettlement,
  delete: deleteSettlement,
  approve: approveSettlement,
  addPayment: addSettlementPayment,
  removePayment: removeSettlementPayment,
  getDebtSummary: getSettlementDebtSummary,
} = rubberSettlementService

export default rubberSettlementService