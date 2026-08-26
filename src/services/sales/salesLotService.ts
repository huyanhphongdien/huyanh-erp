import { supabase } from '../../lib/supabase'

/**
 * SỔ LÔ — lô giao hàng của hợp đồng bán, kèm tình trạng thu tiền của TỪNG LÔ.
 *
 * Vì sao có file này: trước 26/08/2026 "lô" không phải một thực thể, chỉ là số nguyên
 * `lot_no` gõ lên từng container. Không có trị giá lô chính thức → không trả lời được
 * "lô nào đã thu tiền". Bảng `sales_order_lots` (migration sales_lots_p1..p3) cho lô một
 * trị giá CHỐT, và view `v_sales_order_lot_payments` ghép nó với tiền thu qua
 * (sales_order_id, lot_no) — đúng khoá mà `sales_order_payments.lot_no` đang dùng sẵn.
 *
 * Mọi phép tính "đã thu đủ chưa" phải đi qua đây hoặc qua salesOrderPaymentService,
 * KHÔNG tự chia prorata tại chỗ. Chia prorata là bug cũ đã gỡ (xem ghi chú trong
 * salesOrderPaymentService.getLotBreakdown).
 */

export type LotPaymentStatus = 'unpaid' | 'partial' | 'paid' | 'unknown'
export type LotStatus = 'planning' | 'packing' | 'shipped' | 'delivered' | 'cancelled'

export interface SalesLotRow {
  lot_id: string
  sales_order_id: string
  contract_no: string | null
  order_status: string | null
  customer_id: string | null
  customer_name: string | null      // ghép ở client từ sales_customers
  lot_no: number
  lot_label: string | null
  lot_status: LotStatus
  net_weight_kg: number | null
  unit_price_usd: number | null
  value_usd: number | null
  etd: string | null
  delivered_at: string | null
  invoice_no: string | null
  bl_no: string | null
  paid_usd: number
  remaining_usd: number
  payment_count: number
  last_payment_date: string | null
  other_currency_payments: number
  payment_status: LotPaymentStatus
}

/** Hợp đồng CHƯA chia lô — vẫn phải hiện, nếu không tổng tiền trên trang sẽ không khớp sổ đơn. */
export interface OrderWithoutLots {
  sales_order_id: string
  contract_no: string | null
  order_status: string | null
  customer_id: string | null
  customer_name: string | null
  total_value_usd: number | null
  actual_payment_amount: number | null
  container_count: number
}

export interface LotLedger {
  lots: SalesLotRow[]
  ordersWithoutLots: OrderWithoutLots[]
  totals: {
    lotCount: number
    lotValueUsd: number
    lotPaidUsd: number
    lotRemainingUsd: number
    lotsPaid: number
    lotsPartial: number
    lotsUnpaid: number
    lotsUnknown: number
    /** Tiền đã thu nhưng KHÔNG gắn số lô — không quy được về lô nào. */
    unassignedPaidUsd: number
    /** Trị giá các hợp đồng chưa chia lô — phần sổ lô chưa với tới được. */
    valueNotInLotsUsd: number
  }
}

const LIVE_ORDER_STATUSES_EXCLUDED = ['cancelled']

function num(v: unknown): number { return Number(v ?? 0) }

export const salesLotService = {
  /**
   * Đọc toàn bộ sổ lô. Trả về CẢ hợp đồng chưa chia lô, vì nếu chỉ trả lô thì
   * trang sẽ hiện $4,97M trong khi sổ đơn hàng là $15,7M — người xem sẽ tưởng mất tiền.
   */
  async getLedger(): Promise<LotLedger> {
    const [lotRes, orderRes, custRes, contRes] = await Promise.all([
      supabase
        .from('v_sales_order_lot_payments')
        .select('*')
        .order('contract_no', { ascending: false })
        .order('lot_no', { ascending: true }),
      supabase
        .from('sales_orders')
        .select('id, contract_no, status, customer_id, total_value_usd, actual_payment_amount')
        .not('status', 'in', `(${LIVE_ORDER_STATUSES_EXCLUDED.join(',')})`),
      supabase.from('sales_customers').select('id, name, short_name'),
      supabase.from('sales_order_containers').select('sales_order_id, lot_no'),
    ])

    if (lotRes.error) throw lotRes.error
    if (orderRes.error) throw orderRes.error

    const custName = new Map<string, string>()
    for (const c of custRes.data || []) {
      custName.set(c.id as string, ((c.short_name as string) || (c.name as string) || '').trim())
    }

    const lots: SalesLotRow[] = (lotRes.data || []).map((r) => ({
      lot_id: r.lot_id,
      sales_order_id: r.sales_order_id,
      contract_no: r.contract_no,
      order_status: r.order_status,
      customer_id: r.customer_id,
      customer_name: r.customer_id ? custName.get(r.customer_id) ?? null : null,
      lot_no: r.lot_no,
      lot_label: r.lot_label,
      lot_status: r.lot_status,
      net_weight_kg: r.net_weight_kg === null ? null : num(r.net_weight_kg),
      unit_price_usd: r.unit_price_usd === null ? null : num(r.unit_price_usd),
      value_usd: r.value_usd === null ? null : num(r.value_usd),
      etd: r.etd,
      delivered_at: r.delivered_at,
      invoice_no: r.invoice_no,
      bl_no: r.bl_no,
      paid_usd: num(r.paid_usd),
      remaining_usd: num(r.remaining_usd),
      payment_count: num(r.payment_count),
      last_payment_date: r.last_payment_date,
      other_currency_payments: num(r.other_currency_payments),
      payment_status: r.payment_status as LotPaymentStatus,
    }))

    // Đơn nào đã có lô thì bỏ khỏi nhóm "chưa chia lô"
    const orderIdsWithLots = new Set(lots.map((l) => l.sales_order_id))

    const contCount = new Map<string, number>()
    for (const c of contRes.data || []) {
      const oid = c.sales_order_id as string
      contCount.set(oid, (contCount.get(oid) || 0) + 1)
    }

    const ordersWithoutLots: OrderWithoutLots[] = (orderRes.data || [])
      .filter((o) => !orderIdsWithLots.has(o.id as string))
      .map((o) => ({
        sales_order_id: o.id as string,
        contract_no: o.contract_no as string | null,
        order_status: o.status as string | null,
        customer_id: o.customer_id as string | null,
        customer_name: o.customer_id ? custName.get(o.customer_id as string) ?? null : null,
        total_value_usd: o.total_value_usd === null ? null : num(o.total_value_usd),
        actual_payment_amount: o.actual_payment_amount === null ? null : num(o.actual_payment_amount),
        container_count: contCount.get(o.id as string) || 0,
      }))
      .sort((a, b) => (b.contract_no || '').localeCompare(a.contract_no || ''))

    // Tiền thu không gắn lô — đọc thẳng, không suy từ view lô (view lô chỉ thấy tiền CÓ lot_no)
    const { data: unassigned } = await supabase
      .from('sales_order_payments')
      .select('amount, currency, payment_type')
      .is('lot_no', null)
    const unassignedPaidUsd = (unassigned || [])
      .filter((p) => p.payment_type !== 'fee_offset')
      .filter((p) => !p.currency || p.currency === 'USD')
      .reduce((s, p) => s + num(p.amount), 0)

    return {
      lots,
      ordersWithoutLots,
      totals: {
        lotCount: lots.length,
        lotValueUsd: lots.reduce((s, l) => s + num(l.value_usd), 0),
        lotPaidUsd: lots.reduce((s, l) => s + l.paid_usd, 0),
        lotRemainingUsd: lots.reduce((s, l) => s + l.remaining_usd, 0),
        lotsPaid: lots.filter((l) => l.payment_status === 'paid').length,
        lotsPartial: lots.filter((l) => l.payment_status === 'partial').length,
        lotsUnpaid: lots.filter((l) => l.payment_status === 'unpaid').length,
        lotsUnknown: lots.filter((l) => l.payment_status === 'unknown').length,
        unassignedPaidUsd,
        valueNotInLotsUsd: ordersWithoutLots.reduce((s, o) => s + num(o.total_value_usd), 0),
      },
    }
  },

  /** Sửa trị giá / nhãn / trạng thái / chứng từ của một lô. */
  async updateLot(
    lotId: string,
    patch: Partial<Pick<SalesLotRow, 'lot_label' | 'value_usd' | 'unit_price_usd' | 'net_weight_kg'
      | 'etd' | 'delivered_at' | 'invoice_no' | 'bl_no'>> & { status?: LotStatus; notes?: string },
  ): Promise<void> {
    const { error } = await supabase.from('sales_order_lots').update(patch).eq('id', lotId)
    if (error) throw error
  },

  /**
   * Tạo lô cho hợp đồng chưa chia lô. Trị giá để người dùng nhập theo chứng từ thật;
   * KHÔNG tự tính hộ, vì hợp đồng chưa chia lô nghĩa là chưa có căn cứ chia.
   */
  async createLot(salesOrderId: string, lotNo: number, patch: {
    lot_label?: string | null
    quantity_tons?: number | null
    net_weight_kg?: number | null
    unit_price_usd?: number | null
    value_usd?: number | null
    etd?: string | null
    status?: LotStatus
  } = {}): Promise<string> {
    const { data, error } = await supabase
      .from('sales_order_lots')
      .insert({ sales_order_id: salesOrderId, lot_no: lotNo, ...patch })
      .select('id')
      .single()
    if (error) throw error
    return data.id as string
  },

  async deleteLot(lotId: string): Promise<void> {
    const { error } = await supabase.from('sales_order_lots').delete().eq('id', lotId)
    if (error) throw error
  },
}
