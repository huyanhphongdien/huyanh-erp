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

/**
 * Trị giá lô lấy từ đâu — quyết định có tin được kết luận "đã thu đủ" hay không.
 *  'lot'       : sales_order_lots.value_usd — số ĐÃ CHỐT, khớp Commercial Invoice. Tin được.
 *  'invoice'   : tính sống = net lô/1000 × unit_price. Đúng công thức Invoice, nhưng net_weight_kg
 *                bị containerService._recalcContainerTotals ghi đè mỗi lần gán cont, nên con số
 *                này có thể đổi SAU khi đã phát hoá đơn. Cần chốt vào sales_order_lots.
 *  'unknown'   : không có giá → không kết luận được, không bao giờ trả 'paid'.
 */
export type LotValueSource = 'lot' | 'invoice' | 'unknown'

export interface LotPaymentRow {
  lotNo: number
  lotLabel?: string | null
  lotValue: number        // trị giá lô (USD) — xem valueSource để biết đáng tin tới đâu
  valueSource: LotValueSource
  paidAmount: number      // đã thu GẮN cho lô này (USD)
  status: LotPayStatus
  netKg: number
  containerCount: number
}

/**
 * Tiền của MỘT lô, cho dải chip lô. Vốn đã được tính trong vòng lặp của
 * getLotPaymentForOrders rồi bị vứt, chỉ giữ lại con số đếm — giống hệt chuyện
 * deliveryByLot bên dispatchService. Tốn 0 truy vấn thêm.
 *
 * `status = 'unknown'` khi lô chưa có trị giá: KHÔNG kết luận được đã thu đủ hay chưa,
 * và tuyệt đối không được vẽ thành 100%.
 */
export interface LotMoneyRow {
  lotNo: number
  valueUsd: number
  paidUsd: number
  status: LotPayStatus | 'unknown'
  /** sales_order_lots.status — số NHẬP TAY, chỉ để đối chiếu với chứng cứ giao. */
  lotStatus?: string | null
  /**
   * true  = valueUsd là trị giá ĐÃ CHỐT (sales_order_lots.value_usd).
   * false = số TẠM TÍNH (net/1000 × đơn giá) — sẽ ĐỔI mỗi lần gán lại container.
   * Không phân biệt hai thứ này là màn hình hiện số tạm tính như thể đã chốt —
   * đúng lỗi vừa vá ở Sổ lô 27/08/2026, đừng lặp lại ở màn khác.
   */
  valueLocked: boolean
}

/** Tiền theo lô của MỘT đơn — kết quả batch cho danh sách / Kanban. */
export interface OrderLotMoney {
  lotsPaid: number
  lotsTotal: number
  moneyByLot: LotMoneyRow[]
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

    // AI ghi khoản thu này. Cột created_by đã có sẵn nhưng chưa bao giờ được điền —
    // 2/2 dòng trong hệ thống đang NULL. Không có nó thì "phải có người thực sự nhập
    // thanh toán" là điều không kiểm chứng được, và khoản thu sai không truy được về ai.
    // Hỏng phiên đăng nhập thì vẫn ghi (để null) chứ không chặn tiền về.
    let created_by: string | null = null
    try {
      const { data: auth } = await supabase.auth.getUser()
      created_by = auth?.user?.id ?? null
    } catch { /* không chặn ghi tiền vì lỗi đọc phiên */ }

    const { data, error } = await supabase
      .from('sales_order_payments')
      .insert({
        created_by,
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
   * Bóc tách thu tiền THEO LÔ cho 1 đơn.
   *
   * TRỊ GIÁ LÔ lấy theo thứ tự ưu tiên (xem LotValueSource):
   *   1. sales_order_lots.value_usd  — số đã chốt, đúng bằng số trên Commercial Invoice
   *   2. net lô/1000 × unit_price    — công thức Invoice, tính sống khi lô chưa có dòng chốt
   *   3. 0 → 'unknown', không bao giờ kết luận "đã thu đủ"
   *
   * ⚠ TRƯỚC 26/08/2026 hàm này chia PRORATA: total_value_usd × net lô / Σnet(mọi container).
   * Đó là SỐ SAI và phải bỏ, vì hai lý do:
   *   • total_value_usd tính theo khối lượng danh nghĩa lúc ký, còn khách trả theo khối lượng
   *     thực trên Invoice → lệch thật 7/20 lô, nặng nhất HA20260059 lô 1: $473.760 (prorata)
   *     vs $50.820 (Invoice) — gấp 9 lần. HA20260056 lệch −$34.624/lô, tức lô sẽ hiện
   *     "đã thu đủ" khi khách mới trả 85% hoá đơn.
   *   • Mẫu số Σnet cộng cả container CHƯA gán lô, nên tổng trị giá các lô không bằng trị giá
   *     đơn: HA20260075 chỉ quy được $223.776 trên $895.104 vào lô.
   *
   * Khoản thu lot_no NULL = chưa gán lô (unattributedPaid) — vẫn tính vào tổng đơn.
   */
  async getLotBreakdown(orderId: string): Promise<OrderPaymentBreakdown> {
    const [oRes, lRes, cRes, pRes] = await Promise.all([
      supabase.from('sales_orders').select('total_value_usd, unit_price').eq('id', orderId).single(),
      supabase.from('sales_order_lots').select('lot_no, lot_label, value_usd, net_weight_kg').eq('sales_order_id', orderId),
      supabase.from('sales_order_containers').select('lot_no, net_weight_kg').eq('sales_order_id', orderId),
      supabase.from('sales_order_payments').select('amount, lot_no, payment_type').eq('sales_order_id', orderId),
    ])
    const totalValue = Number(oRes.data?.total_value_usd || 0)
    const unitPrice = Number(oRes.data?.unit_price || 0)
    const pays = (pRes.data || []).filter((p) => p.payment_type !== 'fee_offset')
    const totalPaid = round2(pays.reduce((s, p) => s + Number(p.amount || 0), 0))
    const orderStatus: LotPayStatus =
      totalPaid >= totalValue && totalValue > 0 ? 'paid' : totalPaid > 0 ? 'partial' : 'unpaid'

    // Lô đã chốt trong sales_order_lots
    const lotRows = new Map<number, { value: number; label: string | null; net: number }>()
    for (const l of lRes.data || []) {
      lotRows.set(l.lot_no as number, {
        value: Number(l.value_usd || 0),
        label: (l.lot_label as string | null) ?? null,
        net: Number(l.net_weight_kg || 0),
      })
    }

    // Gom container theo lô (để đếm cont + có net dự phòng khi lô chưa chốt)
    const lotNet = new Map<number, { net: number; count: number }>()
    for (const c of cRes.data || []) {
      if (c.lot_no == null) continue
      const e = lotNet.get(c.lot_no) || { net: 0, count: 0 }
      e.net += Number(c.net_weight_kg || 0); e.count += 1
      lotNet.set(c.lot_no, e)
    }

    // Tiền thu theo lô
    const lotPaid = new Map<number, number>()
    let unattributedPaid = 0
    for (const p of pays) {
      const amt = Number(p.amount || 0)
      if (p.lot_no != null) lotPaid.set(p.lot_no, (lotPaid.get(p.lot_no) || 0) + amt)
      else unattributedPaid += amt
    }

    // Vũ trụ lô = hợp của (lô đã chốt) ∪ (lô suy từ container). Lô đã chốt nhưng chưa gán
    // container vẫn phải hiện, nếu không thì thu tiền xong lô đó biến mất khỏi bảng.
    const lotNos = [...new Set([...lotRows.keys(), ...lotNet.keys()])].sort((a, b) => a - b)

    const lots: LotPaymentRow[] = lotNos.map((lotNo) => {
      const row = lotRows.get(lotNo)
      const fromConts = lotNet.get(lotNo)
      const netKg = fromConts?.net ?? row?.net ?? 0

      let lotValue = 0
      let valueSource: LotValueSource = 'unknown'
      if (row && row.value > 0) {
        lotValue = round2(row.value)
        valueSource = 'lot'
      } else if (netKg > 0 && unitPrice > 0) {
        lotValue = round2((netKg / 1000) * unitPrice)
        valueSource = 'invoice'
      }

      const paidAmount = round2(lotPaid.get(lotNo) || 0)
      // Dung sai 0,01 USD cho sai số làm tròn. lotValue = 0 thì KHÔNG bao giờ là 'paid'.
      const status: LotPayStatus =
        lotValue > 0 && paidAmount >= lotValue - 0.01 ? 'paid' : paidAmount > 0 ? 'partial' : 'unpaid'

      return {
        lotNo,
        lotLabel: row?.label ?? null,
        lotValue,
        valueSource,
        paidAmount,
        status,
        netKg,
        containerCount: fromConts?.count ?? 0,
      }
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
   * Dùng ĐÚNG thứ tự trị giá lô như getLotBreakdown (lot chốt → công thức Invoice → bỏ qua),
   * không prorata. Hai chỗ lệch công thức thì badge Kanban và bảng chi tiết sẽ nói khác nhau
   * về cùng một lô.
   */
  async getLotPaymentForOrders(orderIds: string[]): Promise<Record<string, OrderLotMoney>> {
    const out: Record<string, OrderLotMoney> = {}
    if (!orderIds.length) return out

    // ⚠ PHẢI CHUNK. PostgREST nhét cả mảng id vào URL: 104 UUID ≈ 3,9KB, sát ngưỡng
    // HTTP 414 — và khi vượt thì request hỏng, .data về null, hàm này trả 0/0 cho MỌI đơn
    // mà không có lỗi nào nổi lên. dispatchService.getLotProgressForOrders đã dính đúng
    // lỗi này rồi mới phải chunk (xem ghi chú ở dispatchService.ts).
    const ids = [...new Set(orderIds.filter(Boolean))]
    const CHUNK = 100

    async function fetchChunked<T>(
      run: (slice: string[]) => PromiseLike<{ data: T[] | null }>,
    ): Promise<T[]> {
      const rows: T[] = []
      for (let i = 0; i < ids.length; i += CHUNK) {
        const { data } = await run(ids.slice(i, i + CHUNK))
        rows.push(...((data || []) as T[]))
      }
      return rows
    }

    type ORow = { id: string; unit_price: number | null }
    type LRow = { sales_order_id: string; lot_no: number; value_usd: number | null; status: string | null }
    type CRow = { sales_order_id: string; lot_no: number | null; net_weight_kg: number | null }
    type PRow = { sales_order_id: string; lot_no: number | null; amount: number | null; payment_type: string | null; currency: string | null }

    const [oRows, lRows, cRows, pRows] = await Promise.all([
      fetchChunked<ORow>((s) => supabase.from('sales_orders').select('id, unit_price').in('id', s)),
      fetchChunked<LRow>((s) => supabase.from('sales_order_lots').select('sales_order_id, lot_no, value_usd, status').in('sales_order_id', s)),
      fetchChunked<CRow>((s) => supabase.from('sales_order_containers').select('sales_order_id, lot_no, net_weight_kg').in('sales_order_id', s)),
      fetchChunked<PRow>((s) => supabase.from('sales_order_payments').select('sales_order_id, lot_no, amount, payment_type, currency').in('sales_order_id', s).not('lot_no', 'is', null)),
    ])
    const oRes = { data: oRows }, lRes = { data: lRows }, cRes = { data: cRows }, pRes = { data: pRows }

    const unitPriceById: Record<string, number> = {}
    for (const o of oRes.data || []) unitPriceById[o.id] = Number(o.unit_price || 0)

    // trị giá lô ĐÃ CHỐT theo (đơn, lô)
    const lotValue: Record<string, Map<number, number>> = {}
    const lotStatusMap: Record<string, Map<number, string | null>> = {}
    for (const l of lRes.data || []) {
      const oid = l.sales_order_id as string
      ;(lotValue[oid] ||= new Map()).set(l.lot_no as number, Number(l.value_usd || 0))
      ;(lotStatusMap[oid] ||= new Map()).set(l.lot_no as number, l.status)
    }
    // net theo (đơn, lô) — dự phòng khi lô chưa chốt
    const lotNet: Record<string, Map<number, number>> = {}
    for (const c of cRes.data || []) {
      if (c.lot_no == null) continue
      const oid = c.sales_order_id as string
      ;(lotNet[oid] ||= new Map()).set(c.lot_no, ((lotNet[oid].get(c.lot_no)) || 0) + Number(c.net_weight_kg || 0))
    }
    // tiền thu theo (đơn, lô)
    const lotPaid: Record<string, Map<number, number>> = {}
    // Chỉ cộng khoản USD. Trị giá lô là USD, cộng thẳng số tiền ngoại tệ khác vào đó
    // là so hai đơn vị với nhau — view v_sales_order_lot_payments cũng lọc y hệt,
    // hai bên phải cùng một luật thì badge Kanban mới khớp Sổ lô.
    for (const p of (pRes.data || [])
      .filter((p) => p.payment_type !== 'fee_offset')
      .filter((p) => !p.currency || p.currency === 'USD')) {
      const oid = p.sales_order_id as string
      ;(lotPaid[oid] ||= new Map()).set(p.lot_no as number, ((lotPaid[oid].get(p.lot_no as number)) || 0) + Number(p.amount || 0))
    }

    for (const oid of orderIds) {
      const values = lotValue[oid]
      const nets = lotNet[oid]
      const lotNos = [...new Set([...(values?.keys() ?? []), ...(nets?.keys() ?? [])])]
        .sort((a, b) => a - b)   // vị trí là danh tính của lô — luôn theo số lô tăng dần
      if (!lotNos.length) { out[oid] = { lotsPaid: 0, lotsTotal: 0, moneyByLot: [] }; continue }

      const up = unitPriceById[oid] || 0
      let paidCount = 0
      const moneyByLot: LotMoneyRow[] = []
      for (const lotNo of lotNos) {
        const chot = values?.get(lotNo) || 0
        const net = nets?.get(lotNo) || 0
        const v = chot > 0 ? chot : (net > 0 && up > 0 ? (net / 1000) * up : 0)
        const paid = round2(lotPaid[oid]?.get(lotNo) || 0)
        const isPaid = v > 0 && paid >= v - 0.01
        if (isPaid) paidCount++
        moneyByLot.push({
          lotNo,
          valueUsd: round2(v),
          paidUsd: paid,
          status: !v ? 'unknown' : isPaid ? 'paid' : paid > 0 ? 'partial' : 'unpaid',
          valueLocked: chot > 0,
          lotStatus: lotStatusMap[oid]?.get(lotNo) ?? null,
        })
      }
      out[oid] = { lotsPaid: paidCount, lotsTotal: lotNos.length, moneyByLot }
    }
    return out
  },
}

function round2(n: number): number { return Math.round(n * 100) / 100 }
