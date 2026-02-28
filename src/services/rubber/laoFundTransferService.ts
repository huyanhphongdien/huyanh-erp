// ============================================================================
// FILE: src/services/rubber/laoFundTransferService.ts
// MODULE: Thu mua Mủ Cao su — Huy Anh Rubber ERP
// PHASE: 3.6 — V2 FIX theo schema thật
// DB COLUMNS: transfer_code, transfer_date, amount_lak, fee_lak, net_received_lak,
//   amount_bath, fee_bath, net_received_bath, transfer_method, reference_no,
//   receiver_name, notes, created_by, created_at, updated_at
// ============================================================================

import { supabase } from '../../lib/supabase'
import type {
  LaoFundTransfer,
  LaoFundTransferFormData,
  LaoFundBalance,
  RubberPaginationParams,
  RubberPaginatedResponse,
} from './rubber.types'

// ============================================================================
// CONSTANTS
// ============================================================================

const TRANSFER_SELECT = `*`

const TRANSFER_LIST_SELECT = `
  id, transfer_code, transfer_date,
  amount_lak, fee_lak, net_received_lak,
  amount_bath, fee_bath, net_received_bath,
  transfer_method, reference_no, receiver_name,
  notes, created_by, created_at, updated_at
`

// ============================================================================
// HELPERS
// ============================================================================

async function generateCode(date?: string): Promise<string> {
  const d = date ? new Date(date) : new Date()
  const yy = String(d.getFullYear()).slice(2)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const prefix = `CT-${yy}${mm}${dd}`

  const { count } = await supabase
    .from('lao_fund_transfers')
    .select('id', { count: 'exact', head: true })
    .like('transfer_code', `${prefix}%`)

  const seq = String((count || 0) + 1).padStart(3, '0')
  return `${prefix}-${seq}`
}

// ============================================================================
// SERVICE
// ============================================================================

export const laoFundTransferService = {

  async getAll(params: RubberPaginationParams): Promise<RubberPaginatedResponse<LaoFundTransfer>> {
    const { page = 1, pageSize = 20, search, from_date, to_date } = params
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    let query = supabase
      .from('lao_fund_transfers')
      .select(TRANSFER_LIST_SELECT, { count: 'exact' })

    if (from_date) query = query.gte('transfer_date', from_date)
    if (to_date) query = query.lte('transfer_date', to_date)

    if (search?.trim()) {
      const s = search.trim()
      query = query.or(`transfer_code.ilike.%${s}%,reference_no.ilike.%${s}%,receiver_name.ilike.%${s}%,notes.ilike.%${s}%`)
    }

    const { data, count, error } = await query
      .order('transfer_date', { ascending: false })
      .order('created_at', { ascending: false })
      .range(from, to)

    if (error) throw error
    return {
      data: (data || []) as unknown as LaoFundTransfer[],
      total: count ?? 0,
      page,
      pageSize,
      totalPages: Math.ceil((count ?? 0) / pageSize),
    }
  },

  async getById(id: string): Promise<LaoFundTransfer | null> {
    const { data, error } = await supabase
      .from('lao_fund_transfers')
      .select(TRANSFER_SELECT)
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null
      throw error
    }
    return data as unknown as LaoFundTransfer
  },

  async create(formData: LaoFundTransferFormData, createdBy?: string): Promise<LaoFundTransfer> {
    const netLak = (formData.amount_lak ?? 0) - (formData.fee_lak ?? 0)
    const netBath = (formData.amount_bath ?? 0) - (formData.fee_bath ?? 0)
    const code = formData.transfer_code || await generateCode(formData.transfer_date)

    const insertData = {
      transfer_code: code,
      transfer_date: formData.transfer_date,
      amount_lak: formData.amount_lak ?? null,
      fee_lak: formData.fee_lak ?? null,
      net_received_lak: formData.amount_lak ? netLak : null,
      amount_bath: formData.amount_bath ?? null,
      fee_bath: formData.fee_bath ?? null,
      net_received_bath: formData.amount_bath ? netBath : null,
      transfer_method: formData.transfer_method || null,
      reference_no: formData.reference_no || null,
      receiver_name: formData.receiver_name || null,
      notes: formData.notes || null,
      created_by: createdBy || null,
    }

    const { data, error } = await supabase
      .from('lao_fund_transfers')
      .insert(insertData)
      .select(TRANSFER_SELECT)
      .single()

    if (error) throw error
    return data as unknown as LaoFundTransfer
  },

  async update(id: string, formData: Partial<LaoFundTransferFormData>): Promise<LaoFundTransfer> {
    const existing = await this.getById(id)
    if (!existing) throw new Error('Không tìm thấy phiếu chuyển tiền')

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }

    const allowedFields: (keyof LaoFundTransferFormData)[] = [
      'transfer_date', 'amount_lak', 'fee_lak',
      'amount_bath', 'fee_bath',
      'transfer_method', 'reference_no', 'receiver_name', 'notes',
    ]

    for (const field of allowedFields) {
      if (field in formData) {
        updateData[field] = (formData as Record<string, unknown>)[field] ?? null
      }
    }

    // Recalc net_received
    if ('amount_lak' in formData || 'fee_lak' in formData) {
      const amt = (formData.amount_lak ?? existing.amount_lak) ?? 0
      const fee = (formData.fee_lak ?? existing.fee_lak) ?? 0
      updateData.net_received_lak = amt > 0 ? amt - fee : null
    }
    if ('amount_bath' in formData || 'fee_bath' in formData) {
      const amt = (formData.amount_bath ?? existing.amount_bath) ?? 0
      const fee = (formData.fee_bath ?? existing.fee_bath) ?? 0
      updateData.net_received_bath = amt > 0 ? amt - fee : null
    }

    const { data, error } = await supabase
      .from('lao_fund_transfers')
      .update(updateData)
      .eq('id', id)
      .select(TRANSFER_SELECT)
      .single()

    if (error) throw error
    return data as unknown as LaoFundTransfer
  },

  async delete(id: string): Promise<void> {
    const { data: linked } = await supabase
      .from('lao_shipments')
      .select('id')
      .eq('fund_transfer_id', id)
      .limit(1)

    if (linked && linked.length > 0) {
      throw new Error('Không thể xoá: đã có shipment liên kết')
    }

    const { error } = await supabase.from('lao_fund_transfers').delete().eq('id', id)
    if (error) throw error
  },

  async getBalance(): Promise<LaoFundBalance> {
    const { data: transfers, error: tErr } = await supabase
      .from('lao_fund_transfers')
      .select('net_received_lak, net_received_bath')

    if (tErr) throw tErr

    const totalLak = (transfers || []).reduce((s, t) => s + (t.net_received_lak ?? 0), 0)
    const totalBath = (transfers || []).reduce((s, t) => s + (t.net_received_bath ?? 0), 0)

    // Chi tiêu mua mủ
    const { data: intakes, error: iErr } = await supabase
      .from('rubber_intake_batches')
      .select('total_amount, price_currency')
      .eq('source_type', 'lao_direct')
      .neq('status', 'draft')

    if (iErr) throw iErr

    let spentLak = 0, spentBath = 0
    for (const i of (intakes || [])) {
      if (i.price_currency === 'LAK') spentLak += (i.total_amount ?? 0)
      else if (i.price_currency === 'BATH') spentBath += (i.total_amount ?? 0)
    }

    // Chi phí bốc xếp
    const { data: shipments, error: sErr } = await supabase
      .from('lao_shipments')
      .select('loading_cost_lak, loading_cost_bath')

    if (sErr) throw sErr

    spentLak += (shipments || []).reduce((s, sh) => s + (sh.loading_cost_lak ?? 0), 0)
    spentBath += (shipments || []).reduce((s, sh) => s + (sh.loading_cost_bath ?? 0), 0)

    return {
      total_transferred_lak: totalLak,
      total_spent_lak: spentLak,
      balance_lak: Math.round((totalLak - spentLak) * 100) / 100,
      total_transferred_bath: totalBath,
      total_spent_bath: spentBath,
      balance_bath: Math.round((totalBath - spentBath) * 100) / 100,
    }
  },

  async getMonthlySummary(year: number, month: number) {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`
    const endDate = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`

    const { data, error } = await supabase
      .from('lao_fund_transfers')
      .select('amount_lak, fee_lak, net_received_lak, amount_bath, fee_bath, net_received_bath')
      .gte('transfer_date', startDate)
      .lt('transfer_date', endDate)

    if (error) throw error

    const rows = data || []
    return {
      total_lak: rows.reduce((s, r) => s + (r.amount_lak ?? 0), 0),
      total_bath: rows.reduce((s, r) => s + (r.amount_bath ?? 0), 0),
      fee_lak: rows.reduce((s, r) => s + (r.fee_lak ?? 0), 0),
      fee_bath: rows.reduce((s, r) => s + (r.fee_bath ?? 0), 0),
      net_lak: rows.reduce((s, r) => s + (r.net_received_lak ?? 0), 0),
      net_bath: rows.reduce((s, r) => s + (r.net_received_bath ?? 0), 0),
      transfer_count: rows.length,
    }
  },
}

export const {
  getAll: getAllFundTransfers,
  getById: getFundTransferById,
  create: createFundTransfer,
  update: updateFundTransfer,
  delete: deleteFundTransfer,
  getBalance: getLaoFundBalance,
  getMonthlySummary: getFundMonthlySummary,
} = laoFundTransferService

export default laoFundTransferService