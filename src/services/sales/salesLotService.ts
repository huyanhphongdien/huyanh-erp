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

/**
 * Tiến độ GIAO của lô, suy từ chứng cứ thật (container + dòng lệnh xe).
 *   none    — chưa container nào của lô rời kho
 *   partial — đã đi một phần
 *   full    — mọi container của lô đã đi
 *
 * ⚠ ĐÂY mới là tiến độ giao. `lot_status` KHÔNG phải — nó là ảnh chụp chép xuống
 * từ trạng thái hợp đồng lúc backfill 26/08/2026 và đang trái chứng cứ ở 9/20 lô.
 * Tuyệt đối không tô màu tiến độ giao bằng `lot_status`.
 */
export type LotDeliveryState = 'none' | 'partial' | 'full'

export interface SalesLotRow {
  /**
   * ⚠ NULL khi lô CHỈ tồn tại qua container, chưa có dòng chốt trong sales_order_lots.
   * Dùng `lot_key` làm khoá dòng ở giao diện, KHÔNG dùng lot_id.
   */
  lot_id: string | null
  /** Khoá dòng ổn định: `${sales_order_id}#${lot_no}`. */
  lot_key: string
  /** false = lô có thật (container đã gán) nhưng CHƯA chốt trị giá. */
  has_lot_row: boolean
  /** Trị giá tạm tính net/1000 × đơn giá. Chỉ để gợi ý — phải chốt mới dùng làm mẫu số thật. */
  value_est_usd: number | null
  value_source: 'lot' | 'invoice' | 'unknown'
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

  // ─── Trục GIAO HÀNG (view v_sales_order_lot_progress, migration p4) ───────
  container_count: number
  containers_delivered: number
  /**
   * ⚠ Số ĐỘNG — cộng sống từ `sales_order_containers.net_weight_kg`, mà cột đó bị
   * `containerService._recalcContainerTotals` ghi đè mỗi lần gán container. Nó sẽ ĐỔI
   * sau khi hoá đơn đã phát cho khách. Dùng để xem tiến độ giao thì được; để đối chiếu
   * TIỀN thì phải dùng `net_weight_kg` (số chốt) và `value_usd`.
   */
  net_kg_total: number
  net_kg_delivered: number
  delivery_state: LotDeliveryState
  /** `lot_status` trái với chứng cứ giao. Chỉ dùng để cảnh báo, không dùng để tính. */
  status_mismatch: boolean
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
    /** Mẫu số hiệu dụng = trị giá chốt, thiếu thì tạm tính. Cùng chuẩn với lotRemainingUsd. */
    lotValueUsd: number
    /** Chỉ phần ĐÃ CHỐT — con số không suy đoán. */
    lotValueLockedUsd: number
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

    /**
     * Hợp đồng ĐÃ chia lô nhưng Σ trị giá lô ≠ trị giá hợp đồng. Đi CẢ HAI CHIỀU và
     * hai chiều có ý nghĩa khác hẳn nhau, nên phải tách:
     *   • thiếu — mới chia một phần hàng thành lô (vd HA20260075 mới gán 5/20 cont)
     *   • vượt  — đóng thật NHIỀU HƠN khối lượng ký. Không phải lỗi: trị giá hợp đồng
     *             là số danh nghĩa lúc ký, trị giá lô là cân thật trên Commercial Invoice.
     * Không có hai số này thì tổng trên trang không bao giờ khớp sổ đơn và người dùng
     * sẽ kết luận hệ thống sai.
     */
    valueShortInLotsUsd: number
    valueOverInLotsUsd: number
    ordersWithLotGap: number

    /** Lô đã giao đủ nhưng chưa thu đủ tiền — hàng đã sang khách, tiền chưa về. */
    lotsDeliveredUnpaid: number

    // ─── Trục GIAO HÀNG ────────────────────────────────────────────────────
    lotsDelivered: number
    lotsDelivering: number
    lotsNotShipped: number
    containersTotal: number
    containersDelivered: number
    netKgTotal: number
    netKgDelivered: number
    /** Số lô có `lot_status` trái chứng cứ giao — cần người xem lại, không tự sửa. */
    lotsMismatch: number

    /**
     * Lô CHƯA CHỐT trị giá — có container gán lô nhưng chưa có dòng sales_order_lots.
     * Tiền thu gắn vào những lô này không có mẫu số tin được. Hệ thống KHÔNG tự chốt hộ:
     * đoán trị giá rồi để khách trả tiền vào đó là lặp lại đúng bug prorata đã gỡ 26/08.
     */
    lotsUnpriced: number
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
      lot_id: r.lot_id ?? null,
      lot_key: r.lot_key,
      has_lot_row: r.has_lot_row === true,
      value_est_usd: r.value_est_usd === null ? null : num(r.value_est_usd),
      value_source: (r.value_source ?? 'unknown') as SalesLotRow['value_source'],
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

      container_count: num(r.container_count),
      containers_delivered: num(r.containers_delivered),
      net_kg_total: num(r.net_kg_total),
      net_kg_delivered: num(r.net_kg_delivered),
      delivery_state: (r.delivery_state ?? 'none') as LotDeliveryState,
      status_mismatch: r.status_mismatch === true,
    }))

    // Đơn nào đã có lô thì bỏ khỏi nhóm "chưa chia lô"
    // Đơn huỷ: query lô KHÔNG lọc được ở tầng DB (view không có cột đó dạng lọc được
    // qua PostgREST cho mọi trạng thái), nên lọc ở đây cho khớp với query đơn bên trên.
    // Không lọc là đơn huỷ vẫn hiện lô và cộng vào tổng.
    const liveLots = lots.filter((l) => l.order_status !== 'cancelled')

    const orderIdsWithLots = new Set(liveLots.map((l) => l.sales_order_id))

    // Đối chiếu Σ trị giá lô với trị giá hợp đồng, CHỈ trên đơn đã chia lô.
    // Dung sai $0,01 cho sai số làm tròn numeric.
    const orderTotalById = new Map<string, number>()
    for (const o of orderRes.data || []) orderTotalById.set(o.id as string, num(o.total_value_usd))
    const lotSumByOrder = new Map<string, number>()
    for (const l of liveLots) {
      lotSumByOrder.set(l.sales_order_id, (lotSumByOrder.get(l.sales_order_id) || 0) + num(l.value_usd))
    }
    const lotGap = { short: 0, over: 0, orders: 0 }
    for (const [oid, lotSum] of lotSumByOrder) {
      const orderTotal = orderTotalById.get(oid)
      if (orderTotal === undefined) continue      // đơn huỷ / ngoài phạm vi
      const d = lotSum - orderTotal
      if (Math.abs(d) <= 0.01) continue
      lotGap.orders += 1
      if (d < 0) lotGap.short += -d
      else lotGap.over += d
    }

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
      lots: liveLots,
      ordersWithoutLots,
      totals: {
        lotCount: liveLots.length,
        // Mẫu số HIỆU DỤNG: trị giá chốt, thiếu thì tạm tính. PHẢI cùng chuẩn với
        // lotRemainingUsd (view tính remaining theo COALESCE(chốt, tạm tính)) — nếu tử số
        // chỉ cộng phần đã chốt thì "Còn nợ" sẽ LỚN HƠN "Trị giá" và người xem thấy ngay
        // là sai. Phần chắc chắn tách riêng ở lotValueLockedUsd.
        lotValueUsd: liveLots.reduce((s, l) => s + num(l.value_usd ?? l.value_est_usd), 0),
        lotValueLockedUsd: liveLots.reduce((s, l) => s + num(l.value_usd), 0),
        lotPaidUsd: liveLots.reduce((s, l) => s + l.paid_usd, 0),
        lotRemainingUsd: liveLots.reduce((s, l) => s + l.remaining_usd, 0),
        lotsPaid: liveLots.filter((l) => l.payment_status === 'paid').length,
        lotsPartial: liveLots.filter((l) => l.payment_status === 'partial').length,
        lotsUnpaid: liveLots.filter((l) => l.payment_status === 'unpaid').length,
        lotsUnknown: liveLots.filter((l) => l.payment_status === 'unknown').length,
        unassignedPaidUsd,
        valueNotInLotsUsd: ordersWithoutLots.reduce((s, o) => s + num(o.total_value_usd), 0),
        valueShortInLotsUsd: lotGap.short,
        valueOverInLotsUsd: lotGap.over,
        ordersWithLotGap: lotGap.orders,
        lotsDeliveredUnpaid: liveLots.filter(
          (l) => l.delivery_state === 'full' && l.payment_status !== 'paid',
        ).length,

        lotsDelivered: liveLots.filter((l) => l.delivery_state === 'full').length,
        lotsDelivering: liveLots.filter((l) => l.delivery_state === 'partial').length,
        lotsNotShipped: liveLots.filter((l) => l.delivery_state === 'none').length,
        containersTotal: liveLots.reduce((s, l) => s + l.container_count, 0),
        containersDelivered: liveLots.reduce((s, l) => s + l.containers_delivered, 0),
        netKgTotal: liveLots.reduce((s, l) => s + l.net_kg_total, 0),
        netKgDelivered: liveLots.reduce((s, l) => s + l.net_kg_delivered, 0),
        lotsMismatch: liveLots.filter((l) => l.status_mismatch).length,
        lotsUnpriced: liveLots.filter((l) => !l.has_lot_row).length,
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
