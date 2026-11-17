// ============================================================================
// orderParties — MỘT hàm suy "CÁC BÊN CỦA ĐƠN" cho chứng từ, thẻ Các bên và bảng kiểm chứng từ
// File: src/services/sales/orderParties.ts (sales_family_parties_p1.sql, owner duyệt 17/11/2026)
//
// BA VAI, MỖI VAI MỘT CHỖ LƯU:
//   ① NGƯỜI MUA      = sales_orders.customer_id — đứng tên HĐ, ô BUYER/APPLICANT, bị ký phát Hối phiếu,
//                      mang công nợ / tiền thu / hoa hồng / doanh thu.
//   ② NGƯỜI NHẬN HÀNG = sales_orders.ship_to_customer_id (theo TỪNG đơn; NULL = chính người mua). Luôn là hồ sơ khách.
//   ③ CHỮ IN Consignee/Notify = 4 cột text trên đơn (NULL = tự suy) — chỉ để IN, không dùng thống kê/công nợ.
// HÀM THUẦN (không gọi DB): người gọi nạp đơn + hồ sơ rồi truyền vào → test được, documentService / OrderPartiesCard /
// docReadiness cùng gọi để 3 nơi không lệch. Thay resolveConsignee cũ (documentService.ts:286-301) — regex cũ chỉ
// nhận 'THE ORDER'/'TO ORDER' ở đầu chuỗi nên biến 'TO THE ORDER OF X' thành 'THE ORDER OF TO THE ORDER OF X'.
// Đơn mua thẳng không có chữ ghi đè → kết quả Y NHƯ resolveConsignee + notify cũ (in y như hôm nay).
// ============================================================================

import { partyShortName } from './salesTypes'

/** Nguồn của dòng Consignee đang in. */
export type ConsigneeSource = 'order_override' | 'lc' | 'receiver' | 'buyer_profile' | 'none'
/** Nguồn của dòng Notify đang in. */
export type NotifySource = 'order_override' | 'receiver' | 'buyer_profile' | 'buyer' | 'none'

/** Nhãn "(nguồn …)" cạnh 'In ô Consignee: …' — dùng chung, đừng gõ lại ở màn. */
export const CONSIGNEE_SOURCE_LABELS: Record<ConsigneeSource, string> = {
  order_override: 'gõ riêng cho đơn này',
  lc: 'theo L/C — ngân hàng phát hành',
  receiver: 'tên người nhận hàng — XNK chưa chốt',
  buyer_profile: 'hồ sơ chứng từ người mua',
  none: 'chưa có',
}

/** Nhãn "(nguồn …)" cạnh 'In ô Notify: …'. */
export const NOTIFY_SOURCE_LABELS: Record<NotifySource, string> = {
  order_override: 'gõ riêng cho đơn này',
  receiver: 'người nhận hàng',
  buyer_profile: 'hồ sơ chứng từ người mua',
  buyer: 'tên người mua',
  none: 'chưa có',
}

/** Một hồ sơ khách (sales_customers) — người mua hoặc người nhận. */
export interface PartyCustomerInput {
  id?: string
  name?: string | null
  short_name?: string | null
  address?: string | null
  country?: string | null
  status?: string | null
}

/** Hồ sơ chứng từ của khách (sales_customer_export_profiles) — chỉ các cột resolver đọc. */
export interface PartyProfileInput {
  buyer_legal_name?: string | null
  buyer_address?: string | null
  consignee_name?: string | null
  consignee_address?: string | null
  notify_party?: string | null
  notify_address?: string | null
  /** "chứng từ trung tính": Invoice/PKL của người mua này KHÔNG in khối người nhận */
  hide_receiver_on_invoice?: boolean | null
}

/** Dòng sales_order_lc_negotiations của đơn/lô (lot_no = lotNo || 0). method NULL coi như L/C (như code cũ). */
export interface PartyNegotiationInput {
  method?: string | null
  issuing_bank?: string | null
  issuing_bank_address?: string | null
}

/** Các cột của đơn resolver đọc. */
export interface PartyOrderInput {
  customer_id?: string | null
  ship_to_customer_id?: string | null
  consignee_name?: string | null
  consignee_address?: string | null
  notify_party?: string | null
  notify_address?: string | null
  payment_terms?: string | null
  payment_terms_note?: string | null
}

/** Đầu vào resolveOrderParties — người gọi tự nạp (documentService / OrderPartiesCard / docReadiness). */
export interface ResolveOrderPartiesInput {
  order: PartyOrderInput
  /** người mua (sales_customers) */
  buyer?: PartyCustomerInput | null
  /** hồ sơ chứng từ người mua */
  buyerProfile?: PartyProfileInput | null
  /** người nhận (sales_customers) — null khi đơn mua thẳng hoặc chưa nạp được */
  shipTo?: PartyCustomerInput | null
  /** hồ sơ chứng từ của người nhận (nếu có) */
  shipToProfile?: PartyProfileInput | null
  negotiation?: PartyNegotiationInput | null
  /** lô đang in (0/trống = cả đơn). Chưa dùng — để sẵn cho "người nhận theo LÔ" (sales_order_bookings) */
  lotNo?: number | null
}

/**
 * Mã cảnh báo: consignee_unconfirmed = đơn trung gian XNK chưa chốt ô Consignee (readiness vàng) ·
 * override_differs_lc = chữ gõ tay khác mặc định L/C · receiver_missing = không đọc được hồ sơ người nhận ·
 * receiver_inactive = người nhận ngừng giao dịch · lc_check_notify = L/C có người nhận: kiểm Notify theo 46A/47A ·
 * co_third_party = có người nhận riêng: nhắc C/O Form E ô "Third-party invoicing".
 */
export type PartyWarningCode =
  | 'consignee_unconfirmed'
  | 'override_differs_lc'
  | 'receiver_missing'
  | 'receiver_inactive'
  | 'lc_check_notify'
  | 'co_third_party'

/** Một cảnh báo của phần Các bên — `text` là câu tiếng Việt hiện thẳng được. */
export interface PartyWarning {
  code: PartyWarningCode
  text: string
}

/** Cách thanh toán suy được (để đề xuất ô Consignee). D/A gộp vào 'dp' (cùng là nhờ thu). */
export type PartyPaymentMethod = 'lc' | 'dp' | 'tt'

/** Một nút chốt ô Consignee (ghi vào chữ ghi đè consignee_name/address). */
export interface ConsigneePreset {
  kind: 'receiver' | 'to_order' | 'order_of_bank'
  label: string
  name: string
  address: string
}

/** Kết quả suy Các bên: dòng in Consignee/Notify (kèm nguồn), tên NH cho Hối phiếu/ĐNCK, đề xuất + cảnh báo. */
export interface ResolvedOrderParties {
  /** needsConfirm = đơn qua trung gian, chưa có chữ ghi đè, không có L/C → XNK phải bấm chốt */
  consignee: { name: string; address: string; source: ConsigneeSource; needsConfirm: boolean }
  notify: { name: string; address: string; source: NotifySource }
  /** Tên ngân hàng cho Hối phiếu / Đơn chiết khấu / Đơn thương lượng: NH phát hành L/C → phần sau 'TO THE ORDER OF'
   *  của Consignee → '' (KHÔNG BAO GIỜ là tên người nhận/người mua). */
  bankHint: string
  /** tên ngắn người nhận ('' khi đơn mua thẳng) */
  receiverLabel: string
  /** đơn có người nhận riêng (khác người mua) */
  viaIntermediary: boolean
  /** Invoice/PKL có in khối CONSIGNEE/NOTIFY không: chỉ khi có người nhận hoặc chữ ghi đè, và người mua không bật
   *  "chứng từ trung tính" */
  showPartiesBlock: boolean
  paymentMethod: PartyPaymentMethod | null
  /** chữ Consignee mặc định theo L/C (null nếu không có L/C có NH phát hành) */
  lcConsignee: string | null
  /** đề xuất mặc định owner chốt (chỉ khi qua trung gian + chưa chốt): D/P → TO ORDER · L/C → theo NH · T/T → tên người nhận */
  suggestedConsignee: ConsigneePreset | null
  /** các nút chốt ô Consignee cho thẻ Các bên: [Tên người nhận] [TO ORDER] [TO THE ORDER OF <NH>] (+ [Gõ tay…] ở UI) */
  consigneePresets: ConsigneePreset[]
  warnings: PartyWarning[]
}

// ── Nhận diện "TO ORDER" / "TO THE ORDER OF <NH>" ─────────────────────────────

/** Chữ Consignee dạng "theo lệnh": 'TO ORDER', 'TO THE ORDER OF X', 'THE ORDER OF X', 'ORDER OF X'. */
export function isToOrder(s?: string | null): boolean {
  return /^\s*(TO\s+)?(THE\s+)?ORDER\b/i.test(s || '')
}

/** Tên ngân hàng sau 'TO THE ORDER OF' / 'THE ORDER OF' / 'TO ORDER OF'; không phải dạng đó → null. */
export function bankFromConsignee(s?: string | null): string | null {
  const m = /^\s*(TO\s+)?(THE\s+)?ORDER\s+OF\s+([\s\S]+)$/i.exec(s || '')
  const bank = m ? m[3].replace(/\s+/g, ' ').trim().replace(/[,;.]+$/, '').trim() : ''
  return bank || null
}

/** Bỏ đuôi "(SWIFT …)" khỏi tên NH phát hành (như resolveConsignee cũ). */
function cleanBank(s?: string | null): string {
  return (s || '').replace(/\s*\(SWIFT[^)]*\)\s*/i, ' ').replace(/\s+/g, ' ').trim()
}

/** Chữ Consignee mặc định theo L/C — GIỮ đúng chữ code cũ đang in ('THE ORDER OF <NH>'); NH đã ở dạng "theo lệnh" thì giữ nguyên. */
export function lcConsigneeText(bank: string): string {
  const b = cleanBank(bank)
  return isToOrder(b) ? b : `THE ORDER OF ${b}`
}

/** So hai chữ Consignee bỏ qua hoa/thường, khoảng trắng và chữ 'TO ' đầu ('TO THE ORDER OF X' ≡ 'THE ORDER OF X'). */
function sameConsignee(a: string, b: string): boolean {
  const n = (s: string) => s.toUpperCase().replace(/\s+/g, ' ').trim().replace(/^TO\s+(?=THE\s+ORDER)/, '').replace(/[,;.]+$/, '')
  return n(a) === n(b)
}

const t = (s?: string | null): string => (s || '').trim()

/** Suy cách thanh toán: bảng thương lượng (method) trước, rồi payment_terms + ghi chú. L/C → nhờ thu → T/T. */
export function detectPaymentMethod(
  order: Pick<PartyOrderInput, 'payment_terms' | 'payment_terms_note'>,
  negotiation?: PartyNegotiationInput | null,
): PartyPaymentMethod | null {
  const m = (negotiation?.method || '').toLowerCase()
  if (m === 'lc') return 'lc'
  if (m === 'dp' || m === 'da') return 'dp'
  const s = `${order.payment_terms || ''} ${order.payment_terms_note || ''}`.toLowerCase().replace(/_/g, ' ')
  if (!s.trim()) return null
  if (/\bl\s*\/?\s*c\b/.test(s)) return 'lc'
  if (/\b(d\s*\/?\s*p|d\s*\/?\s*a|cad|nhờ thu|collection)\b/.test(s)) return 'dp'
  if (/\b(t\s*\/?\s*t|advance|trả trước|chuyển khoản)\b/.test(s)) return 'tt'
  return null
}

/**
 * Suy CÁC BÊN của một đơn (hoặc một lô) — kèm NGUỒN của từng dòng.
 *
 * CONSIGNEE (ưu tiên): (1) chữ ghi đè của đơn — THẮNG (đơn L/C mà khác mặc định L/C → cảnh báo)
 *   (2) L/C có NH phát hành (method 'lc' hoặc trống) → 'THE ORDER OF <NH>' (chữ code cũ)
 *   (3) có người nhận → tên + địa chỉ người nhận (hồ sơ chứng từ của người nhận, không có thì sales_customers),
 *       needsConfirm = true (XNK phải chốt — in thẳng tên người nhận cho đơn D/P có thể mất quyền với hàng)
 *   (4) consignee trong hồ sơ người mua (5) trống — KHÔNG rơi về tên người mua.
 * NOTIFY: (1) chữ ghi đè (2) người nhận (3) notify trong hồ sơ người mua (4) tên người mua.
 * BANK HINT: NH phát hành (bảng thương lượng) → phần sau 'TO THE ORDER OF' của Consignee → ''.
 */
export function resolveOrderParties(input: ResolveOrderPartiesInput): ResolvedOrderParties {
  const { order, buyer, buyerProfile, shipTo, shipToProfile, negotiation } = input
  const warnings: PartyWarning[] = []
  const viaIntermediary = !!order.ship_to_customer_id && order.ship_to_customer_id !== order.customer_id

  // Người nhận: hồ sơ chứng từ của người nhận trước, không có thì sales_customers (tên 1 dòng → gộp khoảng trắng thừa,
  // vd 'QINGDAO JINTONG  TRADING'; địa chỉ giữ xuống dòng)
  const receiverName = viaIntermediary
    ? (t(shipToProfile?.buyer_legal_name) || t(shipTo?.name)).replace(/\s+/g, ' ')
    : ''
  const receiverAddress = viaIntermediary ? (t(shipToProfile?.buyer_address) || t(shipTo?.address)) : ''
  const receiverLabel = viaIntermediary && shipTo ? partyShortName(shipTo) : (receiverName ? partyShortName({ name: receiverName }) : '')
  if (viaIntermediary && !shipTo && !receiverName) {
    warnings.push({ code: 'receiver_missing', text: 'Không đọc được hồ sơ người nhận hàng — chọn lại ô Người nhận hàng' })
  }
  if (viaIntermediary && shipTo?.status && shipTo.status !== 'active') {
    warnings.push({ code: 'receiver_inactive', text: `Người nhận ${receiverLabel || receiverName} đang ngừng giao dịch — kiểm lại trước khi in chứng từ` })
  }

  // L/C (logic cũ: method trống coi là L/C, phải có NH phát hành)
  const negBank = cleanBank(negotiation?.issuing_bank)
  const lcApplies = (negotiation?.method || 'lc') === 'lc' && !!negBank
  const lcConsignee = lcApplies ? lcConsigneeText(negBank) : null

  // ── CONSIGNEE ──
  const override = t(order.consignee_name)
  let consignee: ResolvedOrderParties['consignee']
  if (override) {
    consignee = { name: override, address: t(order.consignee_address), source: 'order_override', needsConfirm: false }
    if (lcConsignee && !sameConsignee(override, lcConsignee)) {
      warnings.push({
        code: 'override_differs_lc',
        text: `Ô Consignee gõ riêng ("${override}") khác mặc định L/C ("${lcConsignee}") — kiểm theo điều khoản 46A/47A của L/C`,
      })
    }
  } else if (lcConsignee) {
    // Địa chỉ: như code cũ — consignee_address của hồ sơ người mua
    consignee = { name: lcConsignee, address: t(buyerProfile?.consignee_address), source: 'lc', needsConfirm: false }
  } else if (viaIntermediary && receiverName) {
    consignee = { name: receiverName, address: receiverAddress, source: 'receiver', needsConfirm: true }
    warnings.push({
      code: 'consignee_unconfirmed',
      text: `Đơn bán qua trung gian — XNK chưa chốt ô Consignee (đang tạm in tên người nhận ${receiverLabel || receiverName})`,
    })
  } else if (t(buyerProfile?.consignee_name)) {
    consignee = { name: t(buyerProfile?.consignee_name), address: t(buyerProfile?.consignee_address), source: 'buyer_profile', needsConfirm: false }
  } else {
    consignee = { name: '', address: '', source: 'none', needsConfirm: viaIntermediary }
  }

  // ── NOTIFY ──
  const nOverride = t(order.notify_party)
  const buyerName = t(buyerProfile?.buyer_legal_name) || t(buyer?.name)
  let notify: ResolvedOrderParties['notify']
  if (nOverride) {
    notify = { name: nOverride, address: t(order.notify_address), source: 'order_override' }
  } else if (viaIntermediary && receiverName) {
    notify = { name: receiverName, address: receiverAddress, source: 'receiver' }
  } else if (t(buyerProfile?.notify_party)) {
    notify = { name: t(buyerProfile?.notify_party), address: t(buyerProfile?.notify_address), source: 'buyer_profile' }
  } else if (buyerName) {
    // như code cũ: tên người mua + notify_address của hồ sơ (thường trống)
    notify = { name: buyerName, address: t(buyerProfile?.notify_address), source: 'buyer' }
  } else {
    notify = { name: '', address: '', source: 'none' }
  }

  // ── BANK HINT ── (Hối phiếu / ĐNCK / Đơn thương lượng — KHÔNG lấy tên người nhận làm ngân hàng)
  const fromNeg = negBank ? (bankFromConsignee(negBank) ?? (isToOrder(negBank) ? '' : negBank)) : ''
  const bankHint = fromNeg || bankFromConsignee(consignee.name) || ''

  // ── Đề xuất + nút chốt ô Consignee ──
  const paymentMethod = detectPaymentMethod(order, negotiation)
  const presets: ConsigneePreset[] = []
  if (viaIntermediary && receiverName) {
    presets.push({ kind: 'receiver', label: `Tên người nhận (${receiverLabel || receiverName})`, name: receiverName, address: receiverAddress })
  }
  presets.push({ kind: 'to_order', label: 'TO ORDER', name: 'TO ORDER', address: '' })
  const presetBank = negBank ? (bankFromConsignee(negBank) ?? negBank) : bankHint
  if (presetBank && !isToOrder(presetBank)) {
    presets.push({
      kind: 'order_of_bank',
      label: `TO THE ORDER OF ${presetBank}`,
      name: `TO THE ORDER OF ${presetBank}`,
      address: lcApplies ? t(negotiation?.issuing_bank_address) : '',
    })
  }
  let suggestedConsignee: ConsigneePreset | null = null
  if (viaIntermediary && !override) {
    if (paymentMethod === 'dp') suggestedConsignee = presets.find((p) => p.kind === 'to_order') ?? null
    else if (paymentMethod === 'lc') suggestedConsignee = presets.find((p) => p.kind === 'order_of_bank') ?? null
    else if (paymentMethod === 'tt') suggestedConsignee = presets.find((p) => p.kind === 'receiver') ?? null
  }

  if (viaIntermediary && lcApplies) {
    warnings.push({ code: 'lc_check_notify', text: 'Đơn L/C có người nhận riêng — kiểm ô Notify theo điều khoản 46A/47A của L/C' })
  }
  if (viaIntermediary) {
    warnings.push({ code: 'co_third_party', text: 'Đơn có người nhận riêng — C/O Form E: kiểm ô "Third-party invoicing"' })
  }

  const showPartiesBlock = (viaIntermediary || !!override || !!nOverride) && !buyerProfile?.hide_receiver_on_invoice

  return {
    consignee,
    notify,
    bankHint,
    receiverLabel,
    viaIntermediary,
    showPartiesBlock,
    paymentMethod,
    lcConsignee,
    suggestedConsignee,
    consigneePresets: presets,
    warnings,
  }
}
