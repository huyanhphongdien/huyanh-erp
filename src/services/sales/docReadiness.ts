// ============================================================================
// DOC READINESS — mỗi chứng từ có 1 "cơ chế check": định nghĩa dữ liệu CẦN,
// đối chiếu dữ liệu đơn → đủ / thiếu + chỉ rõ NƠI nhập (để nhảy tới điền).
// File: src/services/sales/docReadiness.ts
// Dùng cho trang sinh bộ chứng từ (ExportDocumentsPage) — panel ✓/✗ + đèn.
// Các bên (Consignee/Notify) đọc readyParties → resolveOrderParties — CÙNG hàm suy với documentService, nên
// đèn nói đúng cái sẽ in (sales_family_parties_p1, 17/11/2026). Mục kind 'note' = nhắc kiểm, không tính thiếu.
// ============================================================================
import type { SalesOrder, SalesOrderContainer } from './salesTypes'
import { polLabel } from './salesTypes'
import type { CustomerExportProfile } from './customerExportProfileService'
import type { LcNegotiation } from './lcNegotiationService'
import type { SalesBooking } from './salesBookingService'
import { resolveOrderParties, CONSIGNEE_SOURCE_LABELS, NOTIFY_SOURCE_LABELS, type ResolvedOrderParties } from './orderParties'
import { fmtMoney } from './salesMoney'
import { fmtDate, fmtNum, fmtUsd } from '../../utils/format'

/** Nơi nhập dữ liệu (để deep-link tới đúng tab). */
export type ReadyGroup =
  | 'profile'      // Hồ sơ chứng từ khách
  | 'contract'     // Tab Hợp đồng
  | 'shipping'     // Tab Vận chuyển
  | 'packing'      // Tab Đóng gói
  | 'parties'      // Các bên của đơn — chữ in ô Consignee/Notify (thẻ Các bên, tab Thông tin của đơn)
  | 'negotiation'  // Tab Đơn chiết khấu (trên trang sinh chứng từ)
  | 'auto'         // Tự tính / đính kèm

export const GROUP_LABEL: Record<ReadyGroup, string> = {
  profile: 'Hồ sơ chứng từ khách',
  contract: 'Tab Hợp đồng',
  shipping: 'Tab Vận chuyển',
  packing: 'Tab Đóng gói',
  parties: 'Các bên của đơn (Consignee · Notify)',
  negotiation: 'Tab Đơn chiết khấu',
  auto: 'Tự động / đính kèm',
}

export interface ReadyItem {
  label: string
  group: ReadyGroup
  ok: boolean
  required: boolean      // true = bắt buộc (khoá nút sinh) · false = nên có
  value?: string         // hiển thị khi đủ
  sub?: string           // ghi chú khi thiếu (note: luôn hiện)
  /** 'note' = NHẮC KIỂM (vd C/O Form E, Notify theo 46A/47A) — không có "đủ/thiếu", KHÔNG tính vào số mục thiếu */
  kind?: 'check' | 'note'
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
  /** hồ sơ chứng từ của NGƯỜI NHẬN (order.ship_to_customer_id) — tên pháp lý + địa chỉ in ô Consignee/Notify */
  shipToProfile?: CustomerExportProfile | null
  /** Các bên đã suy sẵn (resolveOrderParties); vắng → readyParties tự suy từ order + profile + negotiation */
  parties?: ResolvedOrderParties | null
}

const has = (v: unknown) => v !== null && v !== undefined && String(v).trim() !== ''
const FREIGHT_TERMS = ['CIF', 'CFR', 'CNF', 'CIP', 'CPT', 'DDP']   // người bán trả cước
const INSURED_TERMS = ['CIF', 'CIP']                               // người bán mua bảo hiểm

/**
 * Các bên của đơn cho bảng kiểm + nhập nhanh — CÙNG hàm suy với chứng từ (resolveOrderParties), nên đèn ở đây nói
 * đúng cái sẽ in. null khi chưa chạy migration sales_family_parties_p1 (đơn không có cột ship_to_customer_id).
 */
export function readyParties(c: ReadyCtx): ResolvedOrderParties | null {
  if (c.parties) return c.parties
  if (c.order.ship_to_customer_id === undefined) return null
  return resolveOrderParties({
    order: c.order,
    buyer: c.order.customer ?? null,
    buyerProfile: c.profile,
    shipTo: c.order.ship_to ?? null,
    shipToProfile: c.shipToProfile ?? null,
    negotiation: c.negotiation,
    lotNo: c.lotNo ?? 0,
  })
}

// ── các mục dùng lại nhiều doc ──
function buyerItem(c: ReadyCtx): ReadyItem {
  const name = c.profile?.buyer_legal_name || (c.order as { customer?: { name?: string } }).customer?.name
  return { label: 'Buyer (tên + địa chỉ)', group: 'profile', required: true, ok: has(name), value: name || undefined }
}
// Địa chỉ người mua chưa có Hồ sơ chứng từ → chứng từ in nguyên địa chỉ ở danh mục khách. Có khi đó là cả khối
// website/email/số TK/SWIFT (HARMONYTIDE: 297 ký tự) → nhắc tạo hồ sơ để in địa chỉ gọn.
function buyerAddressNote(c: ReadyCtx): ReadyItem[] {
  if (has(c.profile?.buyer_address)) return []
  const addr = ((c.order as { customer?: { address?: string | null } }).customer?.address || '').trim()
  const noisy = /(@|www\.|https?:\/\/|swift|a\/c\b|acc(ount)?\s*no|iban)/i.test(addr)
  if (!addr || !(addr.length > 200 || noisy)) return []
  const where = c.profile ? 'Hồ sơ chứng từ chưa điền "Buyer — địa chỉ"' : 'Chưa có Hồ sơ chứng từ'
  return [{
    kind: 'note', label: 'Địa chỉ người mua cần gọn lại', group: 'profile', required: false, ok: false,
    sub: `${where} — đang in nguyên địa chỉ ở danh mục khách (${fmtNum(addr.length)} ký tự${noisy ? ', lẫn email/website/số TK' : ''}). Nhập "Buyer — địa chỉ" ở hồ sơ.`,
  }]
}
function bankItem(c: ReadyCtx): ReadyItem {
  return { label: 'Ngân hàng thụ hưởng', group: 'profile', required: true, ok: has(c.profile?.preferred_bank_id), value: c.profile?.preferred_bank_id ? 'đã chọn' : undefined }
}
function goodsItem(c: ReadyCtx): ReadyItem {
  const ok = has(c.order.grade) && (c.order.quantity_tons || 0) > 0 && (c.order.unit_price || 0) > 0
  // Số theo vi-VN + đơn vị (trước đây in thô '201.6 · 2480')
  const price = c.order.unit_price || 0
  const value = ok
    ? `${String(c.order.grade).replace(/_/g, ' ').replace(/\s+/g, ' ').trim()} · ${fmtNum(c.order.quantity_tons, 3)} tấn · ${fmtMoney(price, c.order.currency, { decimals: Number.isInteger(price) ? 0 : 2 })}/tấn`
    : undefined
  return { label: 'Grade · Số lượng · Đơn giá', group: 'contract', required: true, ok, value }
}
function shipItem(c: ReadyCtx): ReadyItem {
  // booking-aware: chứng từ lấy cảng/tàu từ booking của LÔ, fallback order (khớp documentService)
  const pol = c.booking?.port_of_loading || c.order.port_of_loading
  const pod = c.booking?.port_of_destination || c.order.port_of_destination
  const vessel = c.booking?.vessel_name || c.order.vessel_name
  const ok = has(pol) && has(pod) && has(vessel)
  // Nhãn cảng cho màn hình (trước đây in thô mã 'DA_NANG → …')
  return { label: 'Cảng xếp · Cảng đến · Tàu', group: 'shipping', required: true, ok, value: ok ? `${polLabel(pol)} → ${pod}` : undefined }
}
// Ngày PI. Đợt mua tiếp in CONTRACT NO. theo HĐ GỐC (docs_cite_root) → số + ngày PI của ĐỢT là thứ duy nhất phân biệt
// đợt trên Invoice/PKL ("AS PER PROFORMA INVOICE NO. …/PR.CI DATED …") → nhắc vàng. Đơn khác: nên có như cũ.
function proformaItem(c: ReadyCtx): ReadyItem {
  const cont = !!c.order.parent_order_id && c.order.docs_cite_root !== false
  const ok = has(c.order.proforma_date)
  return {
    label: cont ? 'Ngày PI của đợt mua tiếp' : 'Ngày Proforma (PI)', group: 'shipping', required: cont, ok,
    value: ok ? fmtDate(c.order.proforma_date) : undefined,
    sub: cont && !ok ? 'Ô CONTRACT NO. in số HĐ gốc — thiếu ngày PI thì Invoice mất dòng "DATED" của đợt này' : undefined,
  }
}
// ── Các bên: ô Consignee (+ nhắc kiểm) — đọc readyParties, KHÔNG tự suy lại ──
function consigneeItems(c: ReadyCtx): ReadyItem[] {
  const p = readyParties(c)
  if (!p) return []
  const name = p.consignee.name
  // Đơn mua thẳng chưa có Consignee: như trước — không thêm mục nào
  if (!p.viaIntermediary && p.consignee.source !== 'order_override' && !name) return []
  if (p.consignee.needsConfirm) {
    const sug = p.suggestedConsignee ? ` · đề xuất: ${p.suggestedConsignee.label}` : ''
    return [{
      label: 'Consignee — XNK chưa chốt', group: 'parties', required: true, ok: false,
      sub: name
        ? `Đang tạm in tên người nhận "${name}" — đơn D/P in thẳng người nhận có thể mất quyền với hàng${sug}`
        : `Ô Consignee đang trống${sug}`,
    }]
  }
  return [{
    label: 'Consignee', group: 'parties', required: p.viaIntermediary, ok: !!name,
    value: name ? `${name} · ${CONSIGNEE_SOURCE_LABELS[p.consignee.source]}` : undefined,
    sub: name ? undefined : 'Ô Consignee đang trống',
  }]
}
// Nhắc kiểm từ resolveOrderParties (không tính đủ/thiếu). `codes` = các mã cần hiện ở chứng từ này.
function partyNotes(c: ReadyCtx, codes: Array<'lc_check_notify' | 'co_third_party' | 'override_differs_lc' | 'receiver_inactive' | 'receiver_missing'>): ReadyItem[] {
  const p = readyParties(c)
  if (!p) return []
  const out: ReadyItem[] = []
  for (const w of p.warnings) {
    if (!(codes as string[]).includes(w.code)) continue
    if (w.code === 'co_third_party') {
      out.push({ kind: 'note', label: 'C/O Form E: kiểm ô "Third-party invoicing"', group: 'auto', required: false, ok: false,
        sub: `Người mua ≠ người nhận hàng (${p.receiverLabel || 'người nhận riêng'}) — XNK kiểm khi làm C/O` })
    } else if (w.code === 'lc_check_notify') {
      out.push({ kind: 'note', label: 'Kiểm ô Notify theo điều khoản 46A/47A của L/C', group: 'parties', required: false, ok: false,
        sub: `Đang in Notify: "${p.notify.name || '—'}" (${NOTIFY_SOURCE_LABELS[p.notify.source]})` })
    } else {
      out.push({ kind: 'note', label: w.text, group: 'parties', required: false, ok: false })
    }
  }
  return out
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
    value: ok && needFreight ? (needIns ? `${fmtUsd(c.order.freight_amount, 2)} · ${fmtUsd(c.order.insurance_amount, 2)}` : fmtUsd(c.order.freight_amount, 2)) : undefined }
}
// Container chỉ cần có KL net (cho chứng từ tổng hợp không in cont/seal, vd Non-Wood)
function containersNetItem(c: ReadyCtx): ReadyItem {
  const net = c.containers.reduce((s, x) => s + (x.net_weight_kg || 0), 0)
  const ok = net > 0
  return { label: 'Container (khối lượng)', group: 'packing', required: true, ok, value: ok ? `${fmtNum(net / 1000, 3)} tấn` : undefined, sub: ok ? undefined : 'Chưa có container / KL' }
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
// Invoice/PKL chỉ in khối CONSIGNEE/NOTIFY khi showPartiesBlock → chỉ khi đó mới kiểm ô Consignee ở 2 chứng từ này
const consigneeIfPrinted = (c: ReadyCtx): ReadyItem[] => (readyParties(c)?.showPartiesBlock ? consigneeItems(c) : [])

const REG: Record<string, Builder> = {
  invoice: (c) => [
    buyerItem(c), ...buyerAddressNote(c), bankItem(c), goodsItem(c),
    { label: 'Incoterm', group: 'contract', required: true, ok: has(c.order.incoterm), value: c.order.incoterm || undefined },
    shipItem(c), blItem(c, false), freightItem(c),
    proformaItem(c),
    { label: 'ITEM NO · Kiểu đóng gói (PACKING)', group: 'shipping', required: false, ok: has(c.order.item_no || c.profile?.default_item_no) && has(c.order.packing_desc || c.profile?.default_packing_desc) },
    // Sinh theo LÔ: lô phải có KL net (kẻo hoá đơn ra 0 tấn / $0)
    ...(c.lotNo ? [{ label: 'KL net của lô (>0)', group: 'packing' as ReadyGroup, required: true, ok: c.containers.reduce((s, x) => s + (x.net_weight_kg || 0), 0) > 0, sub: 'Lô chưa nhập KL net → hoá đơn 0 tấn/$0' }] : []),
    ...consigneeIfPrinted(c),
    ...partyNotes(c, ['override_differs_lc', 'lc_check_notify', 'receiver_missing', 'receiver_inactive', 'co_third_party']),
  ],
  packing: (c) => [
    buyerItem(c), ...buyerAddressNote(c), goodsItem(c), containersItem(c), shipItem(c), blItem(c, false),
    ...consigneeIfPrinted(c),
  ],
  weight: (c) => [
    containersItem(c), shipItem(c), blItem(c, false),
    { label: 'Số PALLET / container', group: 'packing', required: false, ok: c.containers.some((x) => has(x.pallet_count)), sub: 'Cột "Pallet" bảng container' },
    // WL luôn in ô CONSIGNEE/ADDRESS → vàng khi đơn qua trung gian mà XNK chưa chốt, kèm nguồn
    ...consigneeItems(c),
    ...partyNotes(c, ['override_differs_lc', 'receiver_missing', 'receiver_inactive']),
  ],
  boe: (c) => [
    lcItem(c),
    freightItem(c),
    { label: 'Kỳ hạn (tenor)', group: 'negotiation', required: false, ok: c.negotiation?.term_days != null, value: c.negotiation?.term_days != null ? `${c.negotiation.term_days} ngày` : undefined },
  ],
  beneficiary: (c) => [
    buyerItem(c), ...buyerAddressNote(c),
    { label: 'Email người mua', group: 'profile', required: false, ok: has((c.order as { customer?: { email?: string } }).customer?.email) },
    shipItem(c), blItem(c, true),
    // Beneficiary cert KHÔNG in ngân hàng → chỉ cần Số L/C nếu có (không đòi bank)
    { label: 'Số L/C (nếu có)', group: 'negotiation', required: false, ok: has(c.negotiation?.lc_number || c.order.lc_number), value: (c.negotiation?.lc_number || c.order.lc_number) || undefined },
  ],
  nonwood: (c) => [
    // Dòng THE BUYER của Non-Wood đi theo ô Consignee → đơn qua trung gian cũng phải chốt Consignee trước
    buyerItem(c), ...buyerAddressNote(c), goodsItem(c), containersNetItem(c), shipItem(c), blItem(c, true),
    ...(readyParties(c)?.viaIntermediary ? consigneeItems(c) : []),
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
      ...partyNotes(c, ['lc_check_notify']),
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
  // Mục 'note' (nhắc kiểm) không có đủ/thiếu → không tính vào đèn / số mục thiếu
  const checks = items.filter((i) => i.kind !== 'note')
  const requiredMissing = checks.filter((i) => i.required && !i.ok).length
  const recommendedMissing = checks.filter((i) => !i.required && !i.ok).length
  return {
    status: requiredMissing > 0 ? 'partial' : 'ok',
    items, requiredMissing, recommendedMissing,
  }
}
