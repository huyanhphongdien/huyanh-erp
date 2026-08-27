// ============================================================================
// CÔNG NỢ KHÁCH — đọc dòng công nợ hai tầng từ v_ar_aging_rows
// File: src/services/sales/arAgingService.ts
//
// VÌ SAO CÓ FILE NÀY
// Trang Công nợ khách trước đây tự gõ công thức: đọc sales_orders + payments rồi cộng
// trong TypeScript. Ba chỗ khác cũng tự gõ công thức của riêng mình, và mỗi chỗ ra một số.
// Từ 27/08/2026 mẫu số nằm TRỌN trong SQL, trang chỉ hiển thị.
//
// BA LOẠI DÒNG, cộng lại LUÔN bằng Σ trị giá hợp đồng — không thiếu, không thừa:
//   'lot'      1 dòng = 1 lô đã chốt. Mẫu số = sales_order_lots.value_usd (số trên Invoice).
//   'residual' 1 dòng/đơn có lô. Mẫu số = trị giá HĐ − Σ trị giá lô.
//              ⚠ CÓ THỂ ÂM và phải để âm: 2 đơn đang giao VƯỢT hợp đồng (cân thật hơn
//              khối lượng danh nghĩa lúc ký). Kẹp Math.max(0, …) là nuốt mất khoản khách
//              thực sự nợ thêm.
//   'order'    1 dòng/đơn CHƯA chia lô. Mẫu số = trị giá HĐ (100%).
//
// ⚠ KHÔNG BAO GIỜ chia trị giá HĐ xuống lô theo tỉ lệ. Phần chênh được hoà giải bằng
// PHÉP TRỪ (dòng 'residual' đứng riêng), không phải phép nhân — xem luật cấm prorata
// trong CLAUDE.md.
//
// ⚠ "Tuổi" ở đây là TUỔI KỂ TỪ NGÀY GIAO, KHÔNG phải "quá hạn". Toàn hệ thống không có
// ngày đến hạn ở bất kỳ đâu (fin_receivables 0 dòng, sales_invoices 0 dòng,
// payment_terms 13/89 đơn) — gọi là "quá hạn" là bịa ra một mốc không tồn tại.
// ============================================================================

import { supabase } from '../../lib/supabase'

/** Bucket tuổi nợ. `no_anchor` = KHÔNG có ngày giao → không được xếp vào bucket nào. */
export type AgingBucket = 'd0_30' | 'd31_60' | 'd61_90' | 'd90_plus' | 'no_anchor'

export const AGING_BUCKET_LABELS: Record<AgingBucket, string> = {
  d0_30: '0–30 ngày',
  d31_60: '31–60 ngày',
  d61_90: '61–90 ngày',
  d90_plus: 'Trên 90 ngày',
  no_anchor: 'Chưa có mốc',
}

export type ArRowKind = 'lot' | 'residual' | 'order'

/** Nguồn của ngày dùng để tính tuổi — để người đọc biết dòng nào dựa trên chứng cứ gì. */
export const ANCHOR_SOURCE_LABELS: Record<string, string> = {
  lot_dispatch: 'Lệnh điều động của lô',
  order_delivery_date: 'Ngày giao trên đơn',
  order_dispatch: 'Lệnh điều động của đơn',
  order_shipped_at: 'Ngày xuất hàng',
  order_bl_date: 'Ngày B/L',
}

export interface ArAgingRow {
  rowKind: ArRowKind
  salesOrderId: string
  orderCode: string
  contractNo: string | null
  orderStatus: string
  customerId: string
  currency: string
  contractValueUsd: number
  lotNo: number | null
  lotLabel: string | null
  rowValueUsd: number
  rowPaidUsd: number
  /** value − paid. CÓ THỂ ÂM ở dòng 'residual'. Đừng kẹp về 0. */
  rowOutstandingUsd: number
  anchorDate: string | null
  anchorSource: string | null
  deliveryState: string
  containerCount: number
  containersDelivered: number
  ageDays: number | null
  agingBucket: AgingBucket
}

export interface ArCustomer {
  id: string
  code: string
  name: string
  country: string | null
}

/**
 * PostgREST trả cột `numeric` về dưới dạng CHUỖI. Cộng dồn bằng `+=` trên chuỗi là NỐI
 * CHUỖI chứ không báo lỗi — tổng ra một dãy số dài vô nghĩa mà không có gì cảnh báo.
 * Cùng lý do salesLotService bọc num() cho cả họ view này.
 */
const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}

const VALID_BUCKETS: readonly AgingBucket[] = ['d0_30', 'd31_60', 'd61_90', 'd90_plus', 'no_anchor']

export const arAgingService = {
  /**
   * Mọi dòng công nợ + danh bạ khách để tra tên.
   * View đã lọc sẵn phạm vi A/R (bỏ draft / cancelled / paid), trang không lọc lại.
   */
  async listRows(): Promise<{ rows: ArAgingRow[]; customers: Record<string, ArCustomer> }> {
    const { data, error } = await supabase
      .from('v_ar_aging_rows')
      .select('*')
    if (error) throw error

    const rows: ArAgingRow[] = (data || []).map((r: Record<string, unknown>) => {
      const bucket = r.aging_bucket as AgingBucket
      return {
        rowKind: r.row_kind as ArRowKind,
        salesOrderId: String(r.sales_order_id),
        orderCode: String(r.order_code ?? ''),
        contractNo: (r.contract_no as string) ?? null,
        orderStatus: String(r.order_status ?? ''),
        customerId: String(r.customer_id ?? ''),
        currency: String(r.currency ?? 'USD'),
        contractValueUsd: num(r.contract_value_usd),
        lotNo: r.lot_no == null ? null : Number(r.lot_no),
        lotLabel: (r.lot_label as string) ?? null,
        rowValueUsd: num(r.row_value_usd),
        rowPaidUsd: num(r.row_paid_usd),
        rowOutstandingUsd: num(r.row_outstanding_usd),
        anchorDate: (r.anchor_date as string) ?? null,
        anchorSource: (r.anchor_source as string) ?? null,
        deliveryState: String(r.delivery_state ?? 'none'),
        containerCount: num(r.container_count),
        containersDelivered: num(r.containers_delivered),
        ageDays: r.age_days == null ? null : Number(r.age_days),
        // Bucket lạ (view đổi mà quên sửa đây) phải rơi về 'no_anchor' — thà nói
        // "chưa có mốc" còn hơn im lặng nhét tiền vào một cột sai.
        agingBucket: VALID_BUCKETS.includes(bucket) ? bucket : 'no_anchor',
      }
    })

    const custIds = [...new Set(rows.map((r) => r.customerId).filter(Boolean))]
    const customers: Record<string, ArCustomer> = {}
    // Chunk 120 cho đồng bộ với các service khác: mảng .in() dài làm phình URL về phía
    // ngưỡng ~8.000 ký tự, quá thì PostgREST trả 414 chứ không trả thiếu.
    for (let i = 0; i < custIds.length; i += 120) {
      const { data: cs, error: cErr } = await supabase
        .from('sales_customers')
        .select('id, code, name, short_name, country')
        .in('id', custIds.slice(i, i + 120))
      if (cErr) throw cErr
      for (const c of (cs || []) as Array<Record<string, unknown>>) {
        customers[String(c.id)] = {
          id: String(c.id),
          code: String(c.code ?? ''),
          name: String(c.short_name || c.name || ''),
          country: (c.country as string) ?? null,
        }
      }
    }

    return { rows, customers }
  },
}
