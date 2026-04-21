// ============================================================================
// SETTLEMENT SERVICE — Service quản lý Quyết toán B2B
// File: src/services/b2b/settlementService.ts
// Phase: E5
// ============================================================================

import { supabase } from '../../lib/supabase'

// ============================================
// TYPES
// ============================================

export type SettlementStatus = 'draft' | 'pending' | 'approved' | 'paid' | 'cancelled' | 'rejected'
export type SettlementType = 'purchase' | 'sale' | 'processing'

export interface Settlement {
  id: string
  code: string
  partner_id: string
  deal_id: string | null
  intake_ids: string[]
  settlement_type: SettlementType
  product_type: string | null
  weighed_kg: number
  finished_kg: number
  drc_percent: number | null
  approved_price: number
  gross_amount: number | null
  total_advance: number
  total_paid_post: number
  remaining_amount: number | null
  vehicle_plates: string[] | null
  driver_name: string | null
  driver_phone: string | null
  weigh_date_start: string | null
  weigh_date_end: string | null
  stock_in_date: string | null
  status: SettlementStatus
  approved_by: string | null
  approved_at: string | null
  approval_notes: string | null
  rejected_by: string | null
  rejected_at: string | null
  rejected_reason: string | null
  paid_amount: number
  paid_at: string | null
  paid_by: string | null
  payment_method: string | null
  bank_reference: string | null
  submitted_at: string | null
  notes: string | null
  internal_notes: string | null
  // Sprint 2 Cross #2 — tạm khoá khi có dispute
  locked_by_dispute: boolean | null
  locked_dispute_id: string | null
  created_by: string
  created_at: string
  updated_at: string
  // Joined
  partner?: {
    id: string
    code: string
    name: string
    tier: string
    phone: string | null
    email: string | null
  }
  // Related
  items?: SettlementItem[]
  advances?: SettlementAdvanceLink[]
  payments?: SettlementPayment[]
}

export interface SettlementItem {
  id: string
  settlement_id: string
  item_type: string
  description: string
  quantity: number | null
  unit_price: number | null
  amount: number
  is_credit: boolean
  notes: string | null
  created_at: string
}

export interface SettlementAdvanceLink {
  id: string
  settlement_id: string
  advance_id: string | null
  advance_date: string
  amount: number
  notes: string | null
  sort_order: number
  created_at: string
}

export interface SettlementPayment {
  id: string
  settlement_id: string
  payment_date: string
  amount: number
  payment_method: string
  recipient_name: string | null
  bank_account: string | null
  bank_name: string | null
  account_holder: string | null
  company_account: string | null
  company_bank: string | null
  company_name: string | null
  notes: string | null
  receipt_url: string | null
  created_by: string
  created_at: string
}

export interface SettlementListParams {
  page?: number
  pageSize?: number
  search?: string
  status?: SettlementStatus | 'all'
  partner_id?: string
  settlement_type?: SettlementType | 'all'
  date_from?: string
  date_to?: string
  sort_by?: string
  sort_order?: 'asc' | 'desc'
}

export interface PaginatedSettlementResponse {
  data: Settlement[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface SettlementCreateData {
  partner_id: string
  deal_id?: string
  intake_ids?: string[]
  settlement_type?: SettlementType
  product_type?: string
  weighed_kg?: number
  finished_kg?: number
  drc_percent?: number
  approved_price?: number
  vehicle_plates?: string[]
  driver_name?: string
  driver_phone?: string
  weigh_date_start?: string
  weigh_date_end?: string
  stock_in_date?: string
  notes?: string
  internal_notes?: string
  created_by: string
  // Items & advances to create along
  items?: Omit<SettlementItem, 'id' | 'settlement_id' | 'created_at'>[]
  linked_advances?: Omit<SettlementAdvanceLink, 'id' | 'settlement_id' | 'created_at'>[]
}

export interface SettlementUpdateData {
  settlement_type?: SettlementType
  product_type?: string
  weighed_kg?: number
  finished_kg?: number
  drc_percent?: number
  approved_price?: number
  vehicle_plates?: string[]
  driver_name?: string
  driver_phone?: string
  weigh_date_start?: string
  weigh_date_end?: string
  stock_in_date?: string
  notes?: string
  internal_notes?: string
}

// ============================================
// CONSTANTS
// ============================================

export const SETTLEMENT_STATUS_LABELS: Record<SettlementStatus, string> = {
  draft: 'Nháp',
  pending: 'Chờ duyệt',
  approved: 'Đã duyệt',
  paid: 'Đã thanh toán',
  cancelled: 'Đã hủy',
  rejected: 'Từ chối',
}

export const SETTLEMENT_STATUS_COLORS: Record<SettlementStatus, string> = {
  draft: 'default',
  pending: 'orange',
  approved: 'green',
  paid: 'blue',
  cancelled: 'red',
  rejected: 'red',
}

export const SETTLEMENT_TYPE_LABELS: Record<SettlementType, string> = {
  purchase: 'Mua hàng',
  sale: 'Bán hàng',
  processing: 'Gia công',
}

export const SETTLEMENT_TYPE_COLORS: Record<SettlementType, string> = {
  purchase: 'cyan',
  sale: 'green',
  processing: 'orange',
}

// ============================================
// HELPER
// ============================================

const generateSettlementCode = (): string => {
  const now = new Date()
  const year = now.getFullYear().toString().slice(-2)
  const month = (now.getMonth() + 1).toString().padStart(2, '0')
  const random = Math.random().toString(36).substring(2, 6).toUpperCase()
  return `QT${year}${month}-${random}`
}

// ============================================
// SERVICE
// ============================================

export const settlementService = {
  // ============================================
  // LIST & QUERY
  // ============================================

  async getSettlements(params: SettlementListParams = {}): Promise<PaginatedSettlementResponse> {
    const {
      page = 1,
      pageSize = 10,
      search,
      status,
      partner_id,
      settlement_type,
      date_from,
      date_to,
      sort_by = 'created_at',
      sort_order = 'desc',
    } = params

    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    let query = supabase
      .from('b2b_settlements')
      .select(`
        *,
        partner:b2b_partners!partner_id (
          id, code, name, tier, phone, email
        )
      `, { count: 'exact' })

    if (status && status !== 'all') {
      query = query.eq('status', status)
    }

    if (partner_id) {
      query = query.eq('partner_id', partner_id)
    }

    if (settlement_type && settlement_type !== 'all') {
      query = query.eq('settlement_type', settlement_type)
    }

    if (date_from) {
      query = query.gte('created_at', date_from)
    }
    if (date_to) {
      query = query.lte('created_at', date_to)
    }

    if (search) {
      query = query.ilike('code', `%${search}%`)
    }

    query = query.order(sort_by, { ascending: sort_order === 'asc' })

    const { data, error, count } = await query.range(from, to)

    if (error) throw error

    const settlements = (data || []).map(s => ({
      ...s,
      partner: Array.isArray(s.partner) ? s.partner[0] : s.partner,
    })) as Settlement[]

    return {
      data: settlements,
      total: count || 0,
      page,
      pageSize,
      totalPages: Math.ceil((count || 0) / pageSize),
    }
  },

  async getSettlementById(id: string): Promise<Settlement | null> {
    const { data, error } = await supabase
      .from('b2b_settlements')
      .select(`
        *,
        partner:b2b_partners!partner_id (
          id, code, name, tier, phone, email
        )
      `)
      .eq('id', id)
      .maybeSingle()

    if (error) throw error
    if (!data) return null

    // Fetch related data in parallel
    const [itemsRes, advancesRes, paymentsRes] = await Promise.all([
      supabase.from('b2b_settlement_items').select('*').eq('settlement_id', id).order('created_at'),
      supabase.from('b2b_settlement_advances').select('*').eq('settlement_id', id).order('sort_order'),
      supabase.from('b2b_settlement_payments').select('*').eq('settlement_id', id).order('payment_date', { ascending: false }),
    ])

    return {
      ...data,
      partner: Array.isArray(data.partner) ? data.partner[0] : data.partner,
      items: (itemsRes.data || []) as SettlementItem[],
      advances: (advancesRes.data || []) as SettlementAdvanceLink[],
      payments: (paymentsRes.data || []) as SettlementPayment[],
    } as Settlement
  },

  async getSettlementsByPartner(partnerId: string): Promise<Settlement[]> {
    const { data, error } = await supabase
      .from('b2b_settlements')
      .select(`
        *,
        partner:b2b_partners!partner_id (
          id, code, name, tier
        )
      `)
      .eq('partner_id', partnerId)
      .order('created_at', { ascending: false })

    if (error) throw error

    return (data || []).map(s => ({
      ...s,
      partner: Array.isArray(s.partner) ? s.partner[0] : s.partner,
    })) as Settlement[]
  },

  // ============================================
  // CREATE
  // ============================================

  async createSettlement(createData: SettlementCreateData): Promise<Settlement> {
    const code = generateSettlementCode()
    const grossAmount = (createData.finished_kg || 0) * (createData.approved_price || 0)

    const { data, error } = await supabase
      .from('b2b_settlements')
      .insert({
        code,
        partner_id: createData.partner_id,
        deal_id: createData.deal_id,
        intake_ids: createData.intake_ids || [],
        settlement_type: createData.settlement_type || 'purchase',
        product_type: createData.product_type,
        weighed_kg: createData.weighed_kg || 0,
        finished_kg: createData.finished_kg || 0,
        drc_percent: createData.drc_percent,
        approved_price: createData.approved_price || 0,
        gross_amount: grossAmount,
        total_advance: 0,
        total_paid_post: 0,
        remaining_amount: grossAmount,
        vehicle_plates: createData.vehicle_plates || [],
        driver_name: createData.driver_name,
        driver_phone: createData.driver_phone,
        weigh_date_start: createData.weigh_date_start,
        weigh_date_end: createData.weigh_date_end,
        stock_in_date: createData.stock_in_date,
        status: 'draft' as SettlementStatus,
        notes: createData.notes,
        internal_notes: createData.internal_notes,
        created_by: createData.created_by,
      })
      .select(`
        *,
        partner:b2b_partners!partner_id (
          id, code, name, tier, phone, email
        )
      `)
      .single()

    if (error) throw error

    const settlement = {
      ...data,
      partner: Array.isArray(data.partner) ? data.partner[0] : data.partner,
    } as Settlement

    // Create items if provided
    if (createData.items && createData.items.length > 0) {
      const itemsToInsert = createData.items.map(item => ({
        settlement_id: settlement.id,
        item_type: item.item_type,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        amount: item.amount,
        is_credit: item.is_credit,
        notes: item.notes,
      }))

      await supabase.from('b2b_settlement_items').insert(itemsToInsert)
    }

    // Link advances if provided
    if (createData.linked_advances && createData.linked_advances.length > 0) {
      const advancesToInsert = createData.linked_advances.map((adv, idx) => ({
        settlement_id: settlement.id,
        advance_id: adv.advance_id,
        advance_date: adv.advance_date,
        amount: adv.amount,
        notes: adv.notes,
        sort_order: idx,
      }))

      await supabase.from('b2b_settlement_advances').insert(advancesToInsert)

      // Update total_advance
      const totalAdvance = advancesToInsert.reduce((sum, a) => sum + a.amount, 0)
      await supabase
        .from('b2b_settlements')
        .update({
          total_advance: totalAdvance,
          remaining_amount: grossAmount - totalAdvance,
        })
        .eq('id', settlement.id)
    }

    return settlement
  },

  // ============================================
  // UPDATE
  // ============================================

  async updateSettlement(id: string, updateData: SettlementUpdateData): Promise<Settlement> {
    const current = await this.getSettlementById(id)
    if (!current) throw new Error('Phiếu quyết toán không tồn tại')

    // ─── Sprint 2 Gap #7: Khoá field sau khi approved/paid ───
    // Chỉ cho sửa notes/internal_notes. Sửa amount/kg/price sau approve →
    // ledger entry không update theo → công nợ lệch.
    const LOCKED_STATUSES: SettlementStatus[] = ['approved', 'paid']
    if (LOCKED_STATUSES.includes(current.status)) {
      const ALLOWED_EDIT: (keyof SettlementUpdateData)[] = ['notes', 'internal_notes']
      const attempted = Object.keys(updateData).filter(
        (k) => (updateData as any)[k] !== undefined,
      )
      const blocked = attempted.filter(
        (k) => !ALLOWED_EDIT.includes(k as keyof SettlementUpdateData),
      )
      if (blocked.length > 0) {
        throw new Error(
          `Phiếu quyết toán ${current.code} đã ${current.status === 'paid' ? 'thanh toán' : 'duyệt'} ` +
          `— chỉ được sửa ghi chú. Trường bị khoá: ${blocked.join(', ')}. ` +
          `Nếu cần điều chỉnh, hãy từ chối phiếu hoặc ghi bút toán điều chỉnh.`,
        )
      }
    }

    // ─── Sprint 2 Cross #2: Không cho sửa khi bị lock bởi dispute ───
    if ((current as any).locked_by_dispute) {
      throw new Error(
        `Phiếu quyết toán ${current.code} đang bị tạm khoá do có khiếu nại DRC chưa giải quyết. ` +
        `Vui lòng xử lý khiếu nại trước.`,
      )
    }

    const updates: any = {
      ...updateData,
      updated_at: new Date().toISOString(),
    }

    // Recalculate gross if price/kg changed
    if (updateData.finished_kg !== undefined || updateData.approved_price !== undefined) {
      const finishedKg = updateData.finished_kg ?? current.finished_kg
      const approvedPrice = updateData.approved_price ?? current.approved_price
      updates.gross_amount = finishedKg * approvedPrice
      updates.remaining_amount = updates.gross_amount - current.total_advance - current.total_paid_post
    }

    const { data, error } = await supabase
      .from('b2b_settlements')
      .update(updates)
      .eq('id', id)
      .select(`
        *,
        partner:b2b_partners!partner_id (
          id, code, name, tier, phone, email
        )
      `)
      .single()

    if (error) throw error

    return {
      ...data,
      partner: Array.isArray(data.partner) ? data.partner[0] : data.partner,
    } as Settlement
  },

  // ============================================
  // STATUS TRANSITIONS
  // ============================================

  async submitForApproval(id: string): Promise<Settlement> {
    const current = await this.getSettlementById(id)
    if (!current) throw new Error('Phiếu quyết toán không tồn tại')
    if (current.status !== 'draft' && current.status !== 'rejected') {
      throw new Error('Chỉ có thể gửi duyệt phiếu ở trạng thái "Nháp" hoặc "Từ chối"')
    }

    // ─── Sprint 2 Cross #2: Phiếu đang bị khoá bởi dispute ───
    if ((current as any).locked_by_dispute) {
      throw new Error(
        `Phiếu ${current.code} đang tạm khoá do có khiếu nại DRC chưa giải quyết. ` +
        `Vui lòng xử lý khiếu nại trước khi gửi duyệt.`,
      )
    }

    // ─── Gap #3: Chặn submit khi deal có active dispute ───
    if (current.deal_id) {
      const { data: activeDisputes } = await supabase
        .from('b2b_drc_disputes')
        .select('id, dispute_number, status')
        .eq('deal_id', current.deal_id)
        .in('status', ['open', 'investigating'])
        .limit(1)
      if (activeDisputes && activeDisputes.length > 0) {
        const d = activeDisputes[0]
        throw new Error(
          `Deal đang có khiếu nại ${d.dispute_number} chưa giải quyết (${d.status}). ` +
          `Phải xử lý khiếu nại trước khi gửi duyệt phiếu quyết toán.`,
        )
      }
    }

    const { data, error } = await supabase
      .from('b2b_settlements')
      .update({
        status: 'pending' as SettlementStatus,
        submitted_at: new Date().toISOString(),
        // Clear rejection fields when resubmitting
        rejected_by: null,
        rejected_at: null,
        rejected_reason: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select(`*, partner:b2b_partners!partner_id (id, code, name, tier)`)
      .single()

    if (error) throw error
    return { ...data, partner: Array.isArray(data.partner) ? data.partner[0] : data.partner } as Settlement
  },

  async approveSettlement(id: string, approvedBy: string, notes?: string): Promise<Settlement> {
    const current = await this.getSettlementById(id)
    if (!current) throw new Error('Phiếu quyết toán không tồn tại')
    if (current.status !== 'pending') {
      throw new Error('Chỉ có thể duyệt phiếu ở trạng thái "Chờ duyệt"')
    }

    // ─── Sprint 2 Cross #2: Lock flag do dispute ───
    if ((current as any).locked_by_dispute) {
      throw new Error(
        `Phiếu ${current.code} đang bị khoá do có khiếu nại DRC chưa giải quyết. Không thể duyệt.`,
      )
    }

    // ─── Gap #3: Double-check dispute tại thời điểm duyệt ───
    if (current.deal_id) {
      const { data: activeDisputes } = await supabase
        .from('b2b_drc_disputes')
        .select('id, dispute_number, status')
        .eq('deal_id', current.deal_id)
        .in('status', ['open', 'investigating'])
        .limit(1)
      if (activeDisputes && activeDisputes.length > 0) {
        const d = activeDisputes[0]
        throw new Error(
          `Deal đang có khiếu nại ${d.dispute_number} chưa giải quyết. Không thể duyệt phiếu quyết toán.`,
        )
      }
    }

    // ─── Gap #5: Chặn duyệt khi advance > gross_amount (balance âm) ───
    const grossAmount = current.gross_amount || 0
    const totalAdvance = current.total_advance || 0
    if (totalAdvance > grossAmount && grossAmount > 0 && current.settlement_type !== 'processing') {
      throw new Error(
        `Tổng tạm ứng (${totalAdvance.toLocaleString('vi-VN')} đ) lớn hơn giá trị quyết toán ` +
        `(${grossAmount.toLocaleString('vi-VN')} đ). Không thể duyệt — vui lòng điều chỉnh advance hoặc amount.`,
      )
    }

    const { data, error } = await supabase
      .from('b2b_settlements')
      .update({
        status: 'approved' as SettlementStatus,
        approved_by: approvedBy,
        approved_at: new Date().toISOString(),
        approval_notes: notes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select(`*, partner:b2b_partners!partner_id (id, code, name, tier)`)
      .single()

    if (error) throw error

    // Ghi bút toán công nợ: DEBIT (nhà máy nợ đại lý giá trị deal)
    // Sprint 3 Gap #8 — dùng ledgerService.createManualEntry để có idempotency
    // (tránh double ledger entry khi retry). reference_code = settlement.code.
    // Gap #9 — period derived từ entry_date (hôm nay = ngày approve).
    if (current.partner_id) {
      try {
        const grossAmount = current.gross_amount || 0
        const { ledgerService } = await import('./ledgerService')
        await ledgerService.createManualEntry({
          partner_id: current.partner_id,
          entry_type: 'settlement',
          description: `Quyết toán ${current.code} — Giá trị deal`,
          debit: grossAmount,
          credit: 0,
          reference_code: current.code,
          created_by: approvedBy,
        })
      } catch (err) {
        console.error('Ghi ledger debit khi approve settlement thất bại:', err)
      }
    }

    // Gửi thông báo chat
    if (current.deal_id) {
      try {
        const { dealWmsService } = await import('./dealWmsService')
        await dealWmsService.notifyDealChatSettlement(
          current.deal_id,
          current.code,
          current.gross_amount || 0,
          'approved'
        )
      } catch (err) {
        console.error('Notify chat settlement approved thất bại:', err)
      }
    }

    // Sprint 4 — notification engine (both audiences)
    try {
      const { b2bNotificationService } = await import('./b2bNotificationService')
      await b2bNotificationService.notify({
        type: 'settlement_approved',
        audience: 'both',
        partner_id: current.partner_id,
        deal_id: current.deal_id,
        settlement_id: id,
        title: `Phiếu quyết toán ${current.code} đã duyệt`,
        message: `Giá trị: ${(current.gross_amount || 0).toLocaleString('vi-VN')} đ`,
        created_by: approvedBy,
      })
    } catch (err) { console.error('B2B notification settlement approved:', err) }

    return { ...data, partner: Array.isArray(data.partner) ? data.partner[0] : data.partner } as Settlement
  },

  async rejectSettlement(id: string, rejectedBy: string, reason: string): Promise<Settlement> {
    const current = await this.getSettlementById(id)
    if (!current) throw new Error('Phiếu quyết toán không tồn tại')
    if (current.status !== 'pending') {
      throw new Error('Chỉ có thể từ chối phiếu ở trạng thái "Chờ duyệt"')
    }

    const { data, error } = await supabase
      .from('b2b_settlements')
      .update({
        status: 'rejected' as SettlementStatus,
        rejected_by: rejectedBy,
        rejected_at: new Date().toISOString(),
        rejected_reason: reason,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select(`*, partner:b2b_partners!partner_id (id, code, name, tier)`)
      .single()

    if (error) throw error
    return { ...data, partner: Array.isArray(data.partner) ? data.partner[0] : data.partner } as Settlement
  },

  async markAsPaid(id: string, paymentData: { payment_method: string; bank_reference?: string; paid_by?: string }): Promise<Settlement> {
    const current = await this.getSettlementById(id)
    if (!current) throw new Error('Phiếu quyết toán không tồn tại')
    if (current.status !== 'approved') {
      throw new Error('Chỉ có thể thanh toán phiếu ở trạng thái "Đã duyệt"')
    }

    const { data, error } = await supabase
      .from('b2b_settlements')
      .update({
        status: 'paid' as SettlementStatus,
        paid_at: new Date().toISOString(),
        paid_by: paymentData.paid_by || null,
        payment_method: paymentData.payment_method,
        bank_reference: paymentData.bank_reference || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select(`*, partner:b2b_partners!partner_id (id, code, name, tier)`)
      .single()

    if (error) throw error

    // Ghi bút toán công nợ: CREDIT (thanh toán cho đại lý, trừ nợ)
    if (current.partner_id) {
      try {
        // remaining = gross - advance - đã thanh toán trước đó
        const grossAmount = current.gross_amount || 0
        const totalAdvance = current.total_advance || 0
        const alreadyPaid = current.paid_amount || 0
        const creditAmount = current.remaining_amount || Math.max(0, grossAmount - totalAdvance - alreadyPaid)
        const paymentAmount = creditAmount > 0 ? creditAmount : 0
        if (paymentAmount > 0) {
          // Gap #8 idempotency: reference_code = settlement.code + '-PAY'
          const { ledgerService } = await import('./ledgerService')
          await ledgerService.createManualEntry({
            partner_id: current.partner_id,
            entry_type: 'payment',
            description: `Thanh toán quyết toán ${current.code} (${paymentData.payment_method === 'bank_transfer' ? 'CK' : paymentData.payment_method === 'cash' ? 'TM' : paymentData.payment_method})`,
            debit: 0,
            credit: paymentAmount,
            reference_code: `${current.code}-PAY`,
            created_by: paymentData.paid_by,
          })
        }
      } catch (err) {
        console.error('Ghi ledger credit khi thanh toán settlement thất bại:', err)
      }
    }

    // Gửi thông báo chat
    if (current.deal_id) {
      try {
        const { dealWmsService } = await import('./dealWmsService')
        await dealWmsService.notifyDealChatSettlement(
          current.deal_id,
          current.code,
          current.gross_amount || 0,
          'paid'
        )
      } catch (err) {
        console.error('Notify chat settlement paid thất bại:', err)
      }
    }

    return { ...data, partner: Array.isArray(data.partner) ? data.partner[0] : data.partner } as Settlement
  },

  /** @deprecated Use markAsPaid instead */
  async markPaid(id: string): Promise<Settlement> {
    return this.markAsPaid(id, { payment_method: 'bank_transfer' })
  },

  async cancelSettlement(id: string): Promise<Settlement> {
    // Check current status
    const { data: current } = await supabase.from('b2b_settlements').select('status').eq('id', id).single()
    if (!current) throw new Error('Không tìm thấy phiếu quyết toán')
    if (current.status === 'paid') throw new Error('Không thể hủy phiếu đã thanh toán')
    if (current.status === 'cancelled') throw new Error('Phiếu đã bị hủy trước đó')

    const { data, error } = await supabase
      .from('b2b_settlements')
      .update({
        status: 'cancelled' as SettlementStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select(`*, partner:b2b_partners!partner_id (id, code, name, tier)`)
      .single()

    if (error) throw error
    return { ...data, partner: Array.isArray(data.partner) ? data.partner[0] : data.partner } as Settlement
  },

  // ============================================
  // DELETE
  // ============================================

  async deleteSettlement(id: string): Promise<void> {
    const settlement = await this.getSettlementById(id)
    if (!settlement) throw new Error('Phiếu quyết toán không tồn tại')
    if (settlement.status !== 'draft') {
      throw new Error('Chỉ có thể xóa phiếu ở trạng thái "Nháp"')
    }

    // Delete related data first
    await Promise.all([
      supabase.from('b2b_settlement_items').delete().eq('settlement_id', id),
      supabase.from('b2b_settlement_advances').delete().eq('settlement_id', id),
      supabase.from('b2b_settlement_payments').delete().eq('settlement_id', id),
    ])

    const { error } = await supabase
      .from('b2b_settlements')
      .delete()
      .eq('id', id)

    if (error) throw error
  },

  // ============================================
  // STATISTICS
  // ============================================

  async getStatsByStatus(): Promise<Record<SettlementStatus, number>> {
    const { data, error } = await supabase
      .from('b2b_settlements')
      .select('status')

    if (error) throw error

    const stats: Record<SettlementStatus, number> = {
      draft: 0,
      pending: 0,
      approved: 0,
      paid: 0,
      cancelled: 0,
      rejected: 0,
    }

    for (const row of (data || []) as any[]) {
      if (row.status && stats[row.status as SettlementStatus] !== undefined) {
        stats[row.status as SettlementStatus]++
      }
    }

    return stats
  },

  // ============================================
  // SETTLEMENT ITEMS
  // ============================================

  async addItem(settlementId: string, item: Omit<SettlementItem, 'id' | 'settlement_id' | 'created_at'>): Promise<SettlementItem> {
    const { data, error } = await supabase
      .from('b2b_settlement_items')
      .insert({
        settlement_id: settlementId,
        ...item,
      })
      .select()
      .single()

    if (error) throw error
    return data as SettlementItem
  },

  async updateItem(itemId: string, updates: Partial<SettlementItem>): Promise<SettlementItem> {
    const { data, error } = await supabase
      .from('b2b_settlement_items')
      .update(updates)
      .eq('id', itemId)
      .select()
      .single()

    if (error) throw error
    return data as SettlementItem
  },

  async removeItem(itemId: string): Promise<void> {
    const { error } = await supabase
      .from('b2b_settlement_items')
      .delete()
      .eq('id', itemId)

    if (error) throw error
  },

  // ============================================
  // SETTLEMENT ADVANCES
  // ============================================

  async linkAdvance(
    settlementId: string,
    advanceData: { advance_id?: string; advance_date: string; amount: number; notes?: string }
  ): Promise<SettlementAdvanceLink> {
    const { data, error } = await supabase
      .from('b2b_settlement_advances')
      .insert({
        settlement_id: settlementId,
        advance_id: advanceData.advance_id,
        advance_date: advanceData.advance_date,
        amount: advanceData.amount,
        notes: advanceData.notes,
      })
      .select()
      .single()

    if (error) throw error

    // Update settlement total_advance
    await this._recalcAdvanceTotal(settlementId)

    return data as SettlementAdvanceLink
  },

  async unlinkAdvance(id: string, settlementId: string): Promise<void> {
    const { error } = await supabase
      .from('b2b_settlement_advances')
      .delete()
      .eq('id', id)

    if (error) throw error

    await this._recalcAdvanceTotal(settlementId)
  },

  async _recalcAdvanceTotal(settlementId: string): Promise<void> {
    const { data } = await supabase
      .from('b2b_settlement_advances')
      .select('amount')
      .eq('settlement_id', settlementId)

    const totalAdvance = (data || []).reduce((sum: number, a: any) => sum + (a.amount || 0), 0)

    const settlement = await this.getSettlementById(settlementId)
    const grossAmount = settlement?.gross_amount || 0
    const totalPaid = settlement?.total_paid_post || 0

    await supabase
      .from('b2b_settlements')
      .update({
        total_advance: totalAdvance,
        remaining_amount: grossAmount - totalAdvance - totalPaid,
      })
      .eq('id', settlementId)
  },
}

export default settlementService
