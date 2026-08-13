// ============================================================================
// SALES ORDER PAYMENTS — Lịch sử thanh toán cho đơn hàng bán
// File: src/services/sales/salesOrderPaymentService.ts
//
// Cách A (đã chốt 2026-04-14): payment_status couple chặt với order.status.
// Sau mỗi insert/update/delete payment, service sẽ:
//   1. Recompute total_paid = SUM(amount) của tất cả payments
//   2. Update sales_orders.actual_payment_amount = total_paid
//   3. Update payment_status (unpaid/partial/paid)
//   4. Nếu payment_status BECAME 'paid' và order.status ∈ {shipped, delivered, invoiced}
//      → bump status từng bước qua VALID_TRANSITIONS cho đến 'paid'
// ============================================================================

import { supabase } from '../../lib/supabase'
import { salesOrderService } from './salesOrderService'
import type { SalesOrderStatus } from './salesPermissionService'

export type PaymentType = 'deposit' | 'installment' | 'final' | 'discount_lc' | 'fee_offset' | 'other'

export const PAYMENT_TYPE_LABELS: Record<PaymentType, string> = {
  deposit:     'Đặt cọc',
  installment: 'Trả lẻ',
  final:       'Trả cuối / Tất toán',
  discount_lc: 'Chiết khấu L/C',
  fee_offset:  'Bù trừ phí',
  other:       'Khác',
}

export const PAYMENT_TYPE_COLORS: Record<PaymentType, string> = {
  deposit:     '#722ed1', // tím
  installment: '#1677ff', // xanh dương
  final:       '#52c41a', // xanh lá
  discount_lc: '#faad14', // vàng cam
  fee_offset:  '#8c8c8c', // xám
  other:       '#bfbfbf',
}

export interface SalesOrderPayment {
  id: string
  sales_order_id: string
  lot_no?: number | null   // lô khoản thu thuộc về (NULL = cả đơn / chưa gán lô)
  payment_date: string
  amount: number
  currency: string
  exchange_rate?: number | null
  amount_vnd?: number | null
  payment_type: PaymentType
  bank_name?: string | null
  bank_reference?: string | null
  swift_code?: string | null
  fee_amount?: number | null
  notes?: string | null
  created_by?: string | null
  created_at: string
  updated_at: string
}

export interface CreatePaymentInput {
  sales_order_id: string
  lot_no?: number | null   // gán khoản thu cho 1 lô; bỏ trống = cả đơn
  payment_date: string
  amount: number
  currency?: string
  exchange_rate?: number | null
  payment_type: PaymentType
  bank_name?: string | null
  bank_reference?: string | null
  swift_code?: string | null
  fee_amount?: number | null
  notes?: string | null
}

// ============================================================================
// Auto-bump logic — chuyển order.status từng bước cho tới 'paid'
// ============================================================================

const STATUS_FORWARD: Partial<Record<SalesOrderStatus, SalesOrderStatus>> = {
  shipped: 'delivered',
  delivered: 'invoiced',
  invoiced: 'paid',
}

async function bumpToPaidIfNeeded(orderId: string): Promise<void> {
  // Đọc lại status hiện tại
  const { data: order, error } = await supabase
    .from('sales_orders')
    .select('status')
    .eq('id', orderId)
    .single()
  if (error || !order) return

  let currentStatus = order.status as SalesOrderStatus

  // Bump từng bước cho đến khi đạt 'paid' hoặc không còn next
  while (currentStatus !== 'paid' && STATUS_FORWARD[currentStatus]) {
    const nextStatus = STATUS_FORWARD[currentStatus]!
    try {
      await salesOrderService.updateStatus(orderId, nextStatus)
      currentStatus = nextStatus
    } catch (e) {
      // Nếu transition bị chặn (vd order ở 'cancelled') → dừng
      console.warn(`[salesOrderPayment] Cannot bump status ${currentStatus}→${nextStatus}:`, e)
      break
    }
  }
}

// ============================================================================
// Recompute aggregates trên sales_orders sau mỗi thay đổi payment
// ============================================================================

async function recomputeOrderAggregates(orderId: string): Promise<void> {
  // Tính total_paid từ tất cả payments (trừ fee_offset không tính vào tiền thu)
  const { data: payments, error: pErr } = await supabase
    .from('sales_order_payments')
    .select('amount, payment_type, payment_date')
    .eq('sales_order_id', orderId)
  if (pErr) throw pErr

  const realPayments = (payments || []).filter(p => p.payment_type !== 'fee_offset')
  const totalPaid = realPayments.reduce((s, p) => s + Number(p.amount || 0), 0)
  const lastDate = realPayments.length
    ? realPayments.map(p => p.payment_date).sort().reverse()[0]
    : null

  // Đọc total_value_usd
  const { data: order, error: oErr } = await supabase
    .from('sales_orders')
    .select('total_value_usd, payment_status, status')
    .eq('id', orderId)
    .single()
  if (oErr || !order) throw oErr || new Error('order not found')

  const totalValue = Number(order.total_value_usd || 0)
  let newPaymentStatus: 'unpaid' | 'partial' | 'paid' = 'unpaid'
  if (totalPaid >= totalValue && totalValue > 0) newPaymentStatus = 'paid'
  else if (totalPaid > 0) newPaymentStatus = 'partial'

  // Update sales_orders aggregates
  await supabase
    .from('sales_orders')
    .update({
      actual_payment_amount: totalPaid,
      payment_status: newPaymentStatus,
      payment_received_date: lastDate,
      updated_at: new Date().toISOString(),
    })
    .eq('id', orderId)

  // Cách A: nếu vừa become 'paid', auto-bump order.status
  if (newPaymentStatus === 'paid' && order.payment_status !== 'paid') {
    await bumpToPaidIfNeeded(orderId)
  }
}

// ============================================================================
// THU TIỀN THEO LÔ — trị giá lô (chia theo net) + đã thu + trạng thái từng lô
// ============================================================================

export type LotPayStatus = 'unpaid' | 'partial' | 'paid'

export interface LotPaymentRow {
  lotNo: number
  lotValue: number        // trị giá lô (USD) — chia theo net container
  paidAmount: number      // đã thu GẮN cho lô này (USD)
  status: LotPayStatus
  netKg: number
  containerCount: number
}

export interface OrderPaymentBreakdown {
  totalValue: number
  totalPaid: number       // tổng đã thu (mọi khoản, trừ fee_offset)
  orderStatus: LotPayStatus
  hasLots: boolean
  lots: LotPaymentRow[]   // chỉ lô đã gán lot_no cho container
  unattributedPaid: number // tiền thu KHÔNG gắn lô (lot_no NULL)
  lotsPaid: number         // số lô đã thu đủ
  lotsTotal: number
}

export const salesOrderPaymentService = {

  /** Liệt kê tất cả payment của 1 đơn (sắp xếp theo ngày) */
  async listByOrder(orderId: string): Promise<SalesOrderPayment[]> {
    const { data, error } = await supabase
      .from('sales_order_payments')
      .select('*')
      .eq('sales_order_id', orderId)
      .order('payment_date', { ascending: true })
      .order('created_at', { ascending: true })
    if (error) throw error
    return (data || []) as SalesOrderPayment[]
  },

  /** Tạo payment mới + recompute + auto-bump */
  async create(input: CreatePaymentInput): Promise<SalesOrderPayment> {
    const amount_vnd = input.exchange_rate && input.amount
      ? input.amount * input.exchange_rate
      : null

    const { data, error } = await supabase
      .from('sales_order_payments')
      .insert({
        sales_order_id: input.sales_order_id,
        lot_no: input.lot_no ?? null,
        payment_date: input.payment_date,
        amount: input.amount,
        currency: input.currency || 'USD',
        exchange_rate: input.exchange_rate || null,
        amount_vnd,
        payment_type: input.payment_type,
        bank_name: input.bank_name || null,
        bank_reference: input.bank_reference || null,
        swift_code: input.swift_code || null,
        fee_amount: input.fee_amount || 0,
        notes: input.notes || null,
      })
      .select('*')
      .single()
    if (error) throw error

    await recomputeOrderAggregates(input.sales_order_id)
    return data as SalesOrderPayment
  },

  /** Cập nhật payment + recompute */
  async update(id: string, patch: Partial<CreatePaymentInput>): Promise<SalesOrderPayment> {
    const updateData: Record<string, unknown> = { ...patch }
    if (patch.amount && patch.exchange_rate) {
      updateData.amount_vnd = patch.amount * patch.exchange_rate
    }
    const { data, error } = await supabase
      .from('sales_order_payments')
      .update(updateData)
      .eq('id', id)
      .select('*')
      .single()
    if (error) throw error

    await recomputeOrderAggregates((data as SalesOrderPayment).sales_order_id)
    return data as SalesOrderPayment
  },

  /** Xóa payment + recompute */
  async delete(id: string): Promise<void> {
    // Lấy sales_order_id trước khi xóa
    const { data: row } = await supabase
      .from('sales_order_payments')
      .select('sales_order_id')
      .eq('id', id)
      .single()
    if (!row) return

    const { error } = await supabase
      .from('sales_order_payments')
      .delete()
      .eq('id', id)
    if (error) throw error

    await recomputeOrderAggregates(row.sales_order_id)
  },

  /** Helper public: gọi recompute thủ công (vd sau khi sửa total_value_usd của đơn) */
  async recompute(orderId: string): Promise<void> {
    return recomputeOrderAggregates(orderId)
  },

  /**
   * Bóc tách thu tiền THEO LÔ cho 1 đơn:
   *  - Trị giá mỗi lô = total_value_usd × (net lô / tổng net) — khớp cách chia của documentService.
   *  - Đã thu mỗi lô = SUM(amount) các payment có lot_no = lô đó (bỏ fee_offset).
   *  - Trạng thái lô: paid nếu đã thu ≥ trị giá lô, partial nếu > 0, còn lại unpaid.
   *  - Khoản thu lot_no NULL = chưa gán lô (unattributedPaid) — vẫn tính vào tổng đơn.
   */
  async getLotBreakdown(orderId: string): Promise<OrderPaymentBreakdown> {
    const [oRes, cRes, pRes] = await Promise.all([
      supabase.from('sales_orders').select('total_value_usd').eq('id', orderId).single(),
      supabase.from('sales_order_containers').select('lot_no, net_weight_kg').eq('sales_order_id', orderId),
      supabase.from('sales_order_payments').select('amount, lot_no, payment_type').eq('sales_order_id', orderId),
    ])
    const totalValue = Number(oRes.data?.total_value_usd || 0)
    const conts = cRes.data || []
    const pays = (pRes.data || []).filter((p) => p.payment_type !== 'fee_offset')
    const totalPaid = round2(pays.reduce((s, p) => s + Number(p.amount || 0), 0))
    const orderStatus: LotPayStatus =
      totalPaid >= totalValue && totalValue > 0 ? 'paid' : totalPaid > 0 ? 'partial' : 'unpaid'

    // Gom container theo lô + tổng net
    const lotNet = new Map<number, { net: number; count: number }>()
    let totalNet = 0
    for (const c of conts) {
      const net = Number(c.net_weight_kg || 0)
      totalNet += net
      if (c.lot_no != null) {
        const e = lotNet.get(c.lot_no) || { net: 0, count: 0 }
        e.net += net; e.count += 1
        lotNet.set(c.lot_no, e)
      }
    }
    // Tiền thu theo lô
    const lotPaid = new Map<number, number>()
    let unattributedPaid = 0
    for (const p of pays) {
      const amt = Number(p.amount || 0)
      if (p.lot_no != null) lotPaid.set(p.lot_no, (lotPaid.get(p.lot_no) || 0) + amt)
      else unattributedPaid += amt
    }
    const lotNos = [...lotNet.keys()].sort((a, b) => a - b)
    const lots: LotPaymentRow[] = lotNos.map((lotNo) => {
      const { net, count } = lotNet.get(lotNo)!
      const lotValue = totalNet > 0
        ? round2(totalValue * net / totalNet)
        : (lotNos.length ? round2(totalValue / lotNos.length) : 0)
      const paidAmount = round2(lotPaid.get(lotNo) || 0)
      const status: LotPayStatus = paidAmount >= lotValue && lotValue > 0 ? 'paid' : paidAmount > 0 ? 'partial' : 'unpaid'
      return { lotNo, lotValue, paidAmount, status, netKg: net, containerCount: count }
    })
    return {
      totalValue, totalPaid, orderStatus,
      hasLots: lots.length > 0,
      lots, unattributedPaid: round2(unattributedPaid),
      lotsPaid: lots.filter((l) => l.status === 'paid').length,
      lotsTotal: lots.length,
    }
  },

  /**
   * Batch cho Kanban: với danh sách đơn → mỗi đơn trả { lotsPaid, lotsTotal }.
   * Chỉ tính lô đã gán container; 1 lô "đã thu" khi tiền gắn lô ≥ trị giá lô.
   */
  async getLotPaymentForOrders(orderIds: string[]): Promise<Record<string, { lotsPaid: number; lotsTotal: number }>> {
    const out: Record<string, { lotsPaid: number; lotsTotal: number }> = {}
    if (!orderIds.length) return out
    const [oRes, cRes, pRes] = await Promise.all([
      supabase.from('sales_orders').select('id, total_value_usd').in('id', orderIds),
      supabase.from('sales_order_containers').select('sales_order_id, lot_no, net_weight_kg').in('sales_order_id', orderIds),
      supabase.from('sales_order_payments').select('sales_order_id, lot_no, amount, payment_type').in('sales_order_id', orderIds).not('lot_no', 'is', null),
    ])
    const totalValById: Record<string, number> = {}
    for (const o of oRes.data || []) totalValById[o.id] = Number(o.total_value_usd || 0)
    // gom net theo (đơn, lô) + tổng net theo đơn
    const lotNet: Record<string, Map<number, number>> = {}
    const totalNet: Record<string, number> = {}
    for (const c of cRes.data || []) {
      const oid = c.sales_order_id as string
      const net = Number(c.net_weight_kg || 0)
      totalNet[oid] = (totalNet[oid] || 0) + net
      if (c.lot_no != null) {
        ;(lotNet[oid] ||= new Map()).set(c.lot_no, ((lotNet[oid].get(c.lot_no)) || 0) + net)
      }
    }
    // tiền thu theo (đơn, lô)
    const lotPaid: Record<string, Map<number, number>> = {}
    for (const p of pRes.data || []) {
      const oid = p.sales_order_id as string
      ;(lotPaid[oid] ||= new Map()).set(p.lot_no as number, ((lotPaid[oid].get(p.lot_no as number)) || 0) + Number(p.amount || 0))
    }
    for (const oid of orderIds) {
      const nets = lotNet[oid]
      if (!nets || nets.size === 0) { out[oid] = { lotsPaid: 0, lotsTotal: 0 }; continue }
      const tv = totalValById[oid] || 0
      const tn = totalNet[oid] || 0
      let paidCount = 0
      for (const [lotNo, net] of nets) {
        const lotValue = tn > 0 ? tv * net / tn : (nets.size ? tv / nets.size : 0)
        const paid = lotPaid[oid]?.get(lotNo) || 0
        if (lotValue > 0 && paid >= lotValue - 0.01) paidCount++
      }
      out[oid] = { lotsPaid: paidCount, lotsTotal: nets.size }
    }
    return out
  },
}

function round2(n: number): number { return Math.round(n * 100) / 100 }
