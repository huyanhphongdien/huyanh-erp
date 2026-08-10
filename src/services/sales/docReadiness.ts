// ============================================================================
// DOC READINESS — mỗi chứng từ có 1 "cơ chế check": định nghĩa dữ liệu CẦN,
// đối chiếu dữ liệu đơn → đủ / thiếu + chỉ rõ NƠI nhập (để nhảy tới điền).
// File: src/services/sales/docReadiness.ts
// Dùng cho trang sinh bộ chứng từ (ExportDocumentsPage) — panel ✓/✗ + đèn.
// ============================================================================
import type { SalesOrder, SalesOrderContainer } from './salesTypes'
import type { CustomerExportProfile } from './customerExportProfileService'
import type { LcNegotiation } from './lcNegotiationService'
import type { SalesBooking } from './salesBookingService'

/** Nơi nhập dữ liệu (để deep-link tới đúng tab). */
export type ReadyGroup =
  | 'profile'      // Hồ sơ chứng từ khách
  | 'contract'     // Tab Hợp đồng
  | 'shipping'     // Tab Vận chuyển
  | 'packing'      // Tab Đóng gói
  | 'negotiation'  // Tab Đơn chiết khấu (trên trang sinh chứng từ)
  | 'auto'         // Tự tính / đính kèm

export const GROUP_LABEL: Record<ReadyGroup, string> = {
  profile: 'Hồ sơ chứng từ khách',
  contract: 'Tab Hợp đồng',
  shipping: 'Tab Vận chuyển',
  packing: 'Tab Đóng gói',
  negotiation: 'Tab Đơn chiết khấu',
  auto: 'Tự động / đính kèm',
}

export interface ReadyItem {
  label: string
  group: ReadyGroup
  ok: boolean
  required: boolean      // true = bắt buộc (khoá nút sinh) · false = nên có
  value?: string         // hiển thị khi đủ
  sub?: string           // ghi chú khi thiếu
}

export interface ReadyResult {
  status: 'ok' | 'partial' | 'idle'   // idle = không tự sinh (COA)
  items: ReadyItem[]
  requiredMissing: number             // số mục BẮT BUỘC còn thiếu (>0 → chưa sinh được)
  recommendedMissing: number
}

export interface ReadyCtx {
  order: SalesOrder
  containers: SalesOrderContainer[]
  profile: CustomerExportProfile | null
  negotiation: LcNegotiation | null
  booking?: SalesBooking | null   // booking của LÔ đang chọn (vessel/cảng/B-L theo lô)
  lotNo?: number                  // 0 = cả đơn; >0 = lô
}

const has = (v: unknown) => v !== null && v !== undefined && String(v).trim() !== ''
const FREIGHT_TERMS = ['CIF', 'CFR', 'CNF', 'CIP', 'CPT', 'DDP']   // người bán trả cước
const INSURED_TERMS = ['CIF', 'CIP']                               // người bán mua bảo hiểm

// ── các mục dùng lại nhiều doc ──
function buyerItem(c: ReadyCtx): ReadyItem {
  const name = c.profile?.buyer_legal_name || (c.order as { customer?: { name?: string } }).customer?.name
  return { label: 'Buyer (tên + địa chỉ)', group: 'profile', required: true, ok: has(name), value: name || undefined }
}
function bankItem(c: ReadyCtx): ReadyItem {
  return { label: 'Ngân hàng thụ hưởng', group: 'profile', required: true, ok: has(c.profile?.preferred_bank_id), value: c.profile?.preferred_bank_id ? 'đã chọn' : undefined }
}
function goodsItem(c: ReadyCtx): ReadyItem {
  const ok = has(c.order.grade) && (c.order.quantity_tons || 0) > 0 && (c.order.unit_price || 0) > 0
  return { label: 'Grade · Số lượng · Đơn giá', group: 'contract', required: true, ok, value: ok ? `${c.order.grade} · ${c.order.quantity_tons} · ${c.order.unit_price}` : undefined }
}
function shipItem(c: ReadyCtx): ReadyItem {
  // booking-aware: chứng từ lấy cảng/tàu từ booking của LÔ, fallback order (khớp documentService)
  const pol = c.booking?.port_of_loading || c.order.port_of_loading
  const pod = c.booking?.port_of_destination || c.order.port_of_destination
  const vessel = c.booking?.vessel_name || c.order.vessel_name
  const ok = has(pol) && has(pod) && has(vessel)
  return { label: 'Cảng xếp · Cảng đến · Tàu', group: 'shipping', required: true, ok, value: ok ? `${pol} → ${pod}` : undefined }
}
function blItem(c: ReadyCtx, required = false): ReadyItem {
  const bl = c.booking?.bl_number || c.order.bl_number
  return { label: 'Số B/L' + (required ? '' : ' (nên có)'), group: 'shipping', required, ok: has(bl), value: bl || undefined }
}
function freightItem(c: ReadyCtx): ReadyItem {
  const term = (c.order.incoterm || '').toUpperCase()
  const needFreight = FREIGHT_TERMS.includes(term)
  const needIns = INSURED_TERMS.includes(term)   // CFR/CNF/CPT/DDP = chỉ cước, KHÔNG bảo hiểm
  const ok = (!needFreight || has(c.order.freight_amount)) && (!needIns || has(c.order.insurance_amount))
  const label = needIns ? 'Cước + Bảo hiểm (đơn CIF)' : 'Cước (Freight)'
  return { label, group: 'shipping', required: needFreight, ok, sub: needFreight && !ok ? 'Thiếu → FOB(COST) sẽ = giá bán (sai)' : undefined,
    value: ok && needFreight ? (needIns ? `$${c.order.freight_amount} · $${c.order.insurance_amount}` : `$${c.order.freight_amount}`) : undefined }
}
// Container chỉ cần có KL net (cho chứng từ tổng hợp không in cont/seal, vd Non-Wood)
function containersNetItem(c: ReadyCtx): ReadyItem {
  const net = c.containers.reduce((s, x) => s + (x.net_weight_kg || 0), 0)
  const ok = net > 0
  return { label: 'Container (khối lượng)', group: 'packing', required: true, ok, value: ok ? `${(net / 1000).toFixed(2)} tấn` : undefined, sub: ok ? undefined : 'Chưa có container / KL' }
}
function containersItem(c: ReadyCtx): ReadyItem {
  const withW = c.containers.filter((x) => (x.net_weight_kg || 0) > 0)
  const real = withW.filter((x) => has(x.container_no) && has(x.seal_no))
  const ok = withW.length > 0 && real.length === withW.length
  const missing = withW.length - real.length
  return {
    label: 'Container (Số cont · Seal · Net · Gross)', group: 'packing', required: true, ok,
    value: ok ? `${real.length} container` : undefined,
    sub: ok ? undefined : (withW.length === 0 ? 'Chưa có container' : `${missing}/${withW.length} container còn "TBD" (chưa nhập số cont/seal)`),
  }
}
function lcItem(c: ReadyCtx): ReadyItem {
  const method = c.negotiation?.method || 'lc'
  const isDP = method !== 'lc'
  const df = (c.negotiation?.dnck_fields as Record<string, string>) || {}
  const ok = isDP
    ? (has(c.negotiation?.issuing_bank) || has(df.recv_bank_name))   // D/P: NH nhờ thu (field chính hoặc ô ĐNCK)
    : (has(c.negotiation?.issuing_bank) && has(c.negotiation?.lc_number || c.order.lc_number))
  return { label: isDP ? 'NH nhờ thu (người mua)' : 'Số L/C + NH phát hành', group: 'negotiation', required: true, ok, value: ok ? (c.negotiation?.lc_number || c.order.lc_number || c.negotiation?.issuing_bank || df.recv_bank_name || '') : undefined }
}

// ── registry: mỗi doc → hàm sinh danh sách mục cần ──
type Builder = (c: ReadyCtx) => ReadyItem[]
const REG: Record<string, Builder> = {
  invoice: (c) => [
    buyerItem(c), bankItem(c), goodsItem(c),
    { label: 'Incoterm', group: 'contract', required: true, ok: has(c.order.incoterm), value: c.order.incoterm || undefined },
    shipItem(c), blItem(c, false), freightItem(c),
    { label: 'Ngày Proforma (PI)', group: 'shipping', required: false, ok: has(c.order.proforma_date), value: c.order.proforma_date || undefined },
    { label: 'ITEM NO · Kiểu đóng gói (PACKING)', group: 'shipping', required: false, ok: has(c.order.item_no || c.profile?.default_item_no) && has(c.order.packing_desc || c.profile?.default_packing_desc) },
    // Sinh theo LÔ: lô phải có KL net (kẻo hoá đơn ra 0 tấn / $0)
    ...(c.lotNo ? [{ label: 'KL net của lô (>0)', group: 'packing' as ReadyGroup, required: true, ok: c.containers.reduce((s, x) => s + (x.net_weight_kg || 0), 0) > 0, sub: 'Lô chưa nhập KL net → hoá đơn 0 tấn/$0' }] : []),
  ],
  packing: (c) => [
    buyerItem(c), goodsItem(c), containersItem(c), shipItem(c), blItem(c, false),
  ],
  weight: (c) => [
    containersItem(c), shipItem(c), blItem(c, false),
    { label: 'Số PALLET / container', group: 'packing', required: false, ok: c.containers.some((x) => has(x.pallet_count)), sub: 'Cột "Pallet" bảng container' },
  ],
  boe: (c) => [
    lcItem(c),
    freightItem(c),
    { label: 'Kỳ hạn (tenor)', group: 'negotiation', required: false, ok: c.negotiation?.term_days != null, value: c.negotiation?.term_days != null ? `${c.negotiation.term_days} ngày` : undefined },
  ],
  beneficiary: (c) => [
    buyerItem(c),
    { label: 'Email người mua', group: 'profile', required: false, ok: has((c.order as { customer?: { email?: string } }).customer?.email) },
    shipItem(c), blItem(c, true),
    // Beneficiary cert KHÔNG in ngân hàng → chỉ cần Số L/C nếu có (không đòi bank)
    { label: 'Số L/C (nếu có)', group: 'negotiation', required: false, ok: has(c.negotiation?.lc_number || c.order.lc_number), value: (c.negotiation?.lc_number || c.order.lc_number) || undefined },
  ],
  nonwood: (c) => [
    buyerItem(c), goodsItem(c), containersNetItem(c), shipItem(c), blItem(c, true),
  ],
  lc: (c) => {
    const df = (c.negotiation?.dnck_fields as Record<string, string>) || {}
    const isDP = (c.negotiation?.method || 'lc') !== 'lc'
    return [
      lcItem(c),
      { label: '% · Kỳ hạn thương lượng', group: 'negotiation', required: false, ok: has(c.negotiation?.negotiate_pct) && c.negotiation?.term_days != null, value: c.negotiation?.negotiate_pct ? `${c.negotiation.negotiate_pct}%` : undefined },
      { label: 'Checklist chứng từ (46A)', group: 'negotiation', required: true, ok: (c.negotiation?.doc_checklist?.length || 0) > 0, value: c.negotiation?.doc_checklist?.length ? `${c.negotiation.doc_checklist.length} loại` : undefined },
      { label: 'STT đơn ĐNCK', group: 'negotiation', required: true, ok: has(df.form_seq) },
      { label: 'Hãng tàu (tên đầy đủ)', group: 'negotiation', required: false, ok: has(df.shipping_line) },
      isDP
        ? { label: 'NH nhờ thu (địa chỉ) · Số tiền bằng chữ', group: 'negotiation', required: false, ok: has(df.recv_bank_addr) && has(df.discount_amount_words) }
        : { label: 'NH nhận CT (địa chỉ) · Số tiền bằng chữ · Bảo đảm (VNĐ)', group: 'negotiation', required: false, ok: has(df.recv_bank_addr1) && has(df.negotiate_amount_words) && has(df.secured_amount_vnd) },
    ]
  },
}

/** COA = đính kèm, không tự sinh. */
export function checkReadiness(docKey: string, ctx: ReadyCtx): ReadyResult {
  if (docKey === 'coa') {
    return { status: 'idle', items: [{ label: 'COA lấy từ phòng LAB → đính kèm scan', group: 'auto', required: false, ok: true, value: 'đính kèm' }], requiredMissing: 0, recommendedMissing: 0 }
  }
  const builder = REG[docKey]
  const items = builder ? builder(ctx) : []
  const requiredMissing = items.filter((i) => i.required && !i.ok).length
  const recommendedMissing = items.filter((i) => !i.required && !i.ok).length
  return {
    status: requiredMissing > 0 ? 'partial' : 'ok',
    items, requiredMissing, recommendedMissing,
  }
}
