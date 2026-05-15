// ============================================================================
// CONTRACT GENERATOR SERVICE
// File: src/services/sales/contractGeneratorService.ts
//
// Sinh file .docx (SC + PI) từ 4 template có sẵn ở /public/contract-templates/
// theo Incoterm (CIF/FOB) và loại văn bản (SC = Sales Contract, PI = Proforma Invoice).
//
// Template được build sẵn từ 4 file mẫu:
//   - SC + PI ( CIF)/SC- Yoong Do…   → template_SC_CIF.docx
//   - SC + PI ( CIF)/PI- Yoong Do…   → template_PI_CIF.docx
//   - SC + PI (FOB)/SC-APOLLO…       → template_SC_FOB.docx
//   - SC + PI (FOB)/PI- APOLLO…      → template_PI_FOB.docx
// (xem docs/contract-templates/build_templates.py)
// ============================================================================

import PizZip from 'pizzip'
import Docxtemplater from 'docxtemplater'
import { saveAs } from 'file-saver'
import { SALES_CONFIG } from '../../config/sales.config'

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

export type ContractKind = 'SC_CIF' | 'PI_CIF' | 'SC_FOB' | 'PI_FOB'

/** Toàn bộ field có trong placeholder của 4 template. */
export interface ContractFormData {
  contract_no: string         // HA20260053
  contract_date: string       // 08 May 2026

  buyer_name: string
  buyer_address: string
  buyer_phone?: string

  grade: string               // SVR3L, RSS3, ...
  quantity: string            // "20.16"
  unit_price: string          // "2,460"
  amount: string              // "49,593.60"
  amount_words?: string       // chỉ PI: "Forty-Nine Thousand…Cents Only"

  incoterm: string            // "CIF" | "FOB" | "CFR" | "CNF" | "DDP" | "EXW"
  pol: string                 // Port of loading
  pod?: string                // Port of discharge (CIF/CFR/DDP)

  packing_desc: string        // "35kg/bale with thick polybag, Wooden pallets"
  bales_total?: string        // "576"
  pallets_total?: string      // "16"
  containers: string          // "01"
  cont_type: string           // "20DC" | "40HC"

  shipment_time?: string      // "June, 2026" hoặc multi-lot string
  partial?: string            // "Allowed" | "Not Allowed"
  trans?: string              // "Allowed" | "Not Allowed"

  payment: string             // "LC at sight" | "CAD 5 days" | "T/T 100%"
  payment_extra?: string      // chi tiết LC nếu có

  claims_days?: string        // "20" (default)
  arbitration?: string        // "SICOM Singapore" | "LCIA London"
  freight_mark?: string       // "freight prepaid" | "freight Collect"

  // Điều khoản bổ sung tự do (Sale nhập, max 300 chars). Render ở preview
  // SC + PI và lưu trong form_data. Template hiện chưa có placeholder
  // (render khi rebuild templates với {extra_terms} ở section Payment).
  extra_terms?: string

  // packing_type enum gốc — dùng để derive has_fumigation (chỉ wooden_pallet
  // cần Fumigation certificate). Không render trực tiếp.
  packing_type?: string

  // ----- Bank info: Phú LV (Kiểm tra) nhập per-order -----
  // Sale lên HĐ → submit reviewing → Phú LV mở review, chọn/nhập bank →
  // approved → Trung/Huy ký. Sale KHÔNG nhập 5 field này.
  bank_account_name?: string  // "HUY ANH RUBBER COMPANY LIMITED"
  bank_account_no?: string    // "111002648221"
  bank_full_name?: string     // "VIETNAM JOINT STOCK COMMERCIAL BANK…HUE BRANCH"
  bank_address?: string       // "02 LE QUY DON STREET…HUE CITY, VIET NAM"
  bank_swift?: string         // "ICBVVNVX460"
}

/** Default bank (Vietin Hue) — fallback nếu Phú LV chưa nhập.
 *  Source: src/config/sales.config.ts (single source of truth). */
export const DEFAULT_BANK: Pick<
  ContractFormData,
  'bank_account_name' | 'bank_account_no' | 'bank_full_name' | 'bank_address' | 'bank_swift'
> = SALES_CONFIG.DEFAULT_BANK

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

const TEMPLATE_BASE = SALES_CONFIG.TEMPLATE_BASE

// ----------------------------------------------------------------------------
// Amount → English words ("Forty-Nine Thousand … US Dollars and Sixty Cents Only")
// Dùng cho PI section "Words: ..."
// ----------------------------------------------------------------------------

const _UNITS = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine']
const _TEENS = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
const _TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']
function _under1000(n: number): string {
  if (n === 0) return ''
  if (n < 10) return _UNITS[n]
  if (n < 20) return _TEENS[n - 10]
  if (n < 100) {
    const t = Math.floor(n / 10), u = n % 10
    return _TENS[t] + (u ? '-' + _UNITS[u] : '')
  }
  const h = Math.floor(n / 100), rest = n % 100
  return _UNITS[h] + ' Hundred' + (rest ? ' ' + _under1000(rest) : '')
}

export function amountToWords(amount: number): string {
  if (!amount || amount <= 0) return ''
  const dollars = Math.floor(amount)
  const cents = Math.round((amount - dollars) * 100)
  let result = ''
  if (dollars >= 1_000_000) {
    const m = Math.floor(dollars / 1_000_000)
    result += _under1000(m) + ' Million'
    const rest = dollars % 1_000_000
    if (rest >= 1000) result += ' ' + _under1000(Math.floor(rest / 1000)) + ' Thousand'
    const last = rest % 1000
    if (last) result += ' ' + _under1000(last)
  } else if (dollars >= 1000) {
    result += _under1000(Math.floor(dollars / 1000)) + ' Thousand'
    const last = dollars % 1000
    if (last) result += ' ' + _under1000(last)
  } else {
    result += _under1000(dollars)
  }
  result += ' US Dollars'
  if (cents > 0) result += ' and ' + _under1000(cents) + ' Cents'
  result += ' Only'
  return result.trim().replace(/\s+/g, ' ')
}

/**
 * Normalize grade enum → display format for contracts.
 * DB enum dùng underscore (SVR_3L, RSS_3, LATEX_60) — HĐ quốc tế viết liền (SVR3L,
 * RSS3, LATEX60). Áp dụng cho cả single grade và multi-grade ("SVR_3L + RSS_3").
 */
export function formatGradeForContract(grade: string | null | undefined): string {
  if (!grade) return ''
  return grade
    .split('+')
    .map((g) => g.trim().replace(/_/g, ''))
    .join(' + ')
}

/**
 * Map Incoterm → kiểu template (CIF/FOB).
 * - CIF / CFR / CNF / DDP → dùng template_*_CIF.docx (có Port of discharge + Insurance)
 * - FOB / EXW             → dùng template_*_FOB.docx
 */
export function deriveKind(incoterm: string, type: 'SC' | 'PI'): ContractKind {
  const upper = (incoterm || 'FOB').toUpperCase()
  const isCIF = ['CIF', 'CFR', 'CNF', 'DDP'].includes(upper)
  return `${type}_${isCIF ? 'CIF' : 'FOB'}` as ContractKind
}

async function loadTemplateBuffer(kind: ContractKind): Promise<ArrayBuffer> {
  const url = `${TEMPLATE_BASE}/template_${kind}.docx`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Không tải được template ${kind} (${url}): HTTP ${res.status}`)
  }
  return await res.arrayBuffer()
}

// ----------------------------------------------------------------------------
// Public API
// ----------------------------------------------------------------------------

/** Render template + form data → trả về Blob .docx. */
export async function generateContractBlob(
  kind: ContractKind,
  data: Partial<ContractFormData>,
): Promise<Blob> {
  const buffer = await loadTemplateBuffer(kind)
  const zip = new PizZip(buffer)
  const doc = new Docxtemplater(zip, {
    delimiters: { start: '{', end: '}' },
    paragraphLoop: true,
    linebreaks: true,
    // Missing key → trả về empty (đỡ crash nếu thiếu field)
    nullGetter: () => '',
  })
  // Tự derive flags conditional cho template:
  // - has_extra_terms: hiện paragraph "Other Conditions: ..." khi extra_terms có chữ
  // - has_fumigation: chỉ wooden_pallet cần Fumigation cert (Korea/EU requirement).
  //   Detect qua packing_type enum, hoặc fallback từ packing_desc string.
  // - grade: normalize SVR_3L → SVR3L
  // - amount_words: auto-compute từ {amount} nếu form_data chưa có (self-heal cho
  //   HĐ cũ được tạo trước khi buildFormDataFromOrder compute amount_words)
  const packingDesc = (data.packing_desc || '').toLowerCase()
  const hasFumigation =
    data.packing_type === 'wooden_pallet' ||
    (packingDesc.includes('wooden pallet') && !packingDesc.includes('loose'))
  let amountWords = data.amount_words
  if (!amountWords && data.amount) {
    const num = parseFloat(String(data.amount).replace(/,/g, ''))
    if (num > 0) amountWords = amountToWords(num)
  }
  doc.render({
    ...data,
    grade: formatGradeForContract(data.grade),
    amount_words: amountWords || '',
    has_extra_terms: !!(data.extra_terms && data.extra_terms.trim()),
    has_fumigation: hasFumigation,
  })
  return doc.getZip().generate({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    compression: 'DEFLATE',
  })
}

/** Sinh + download trực tiếp xuống máy. */
export async function downloadContract(
  kind: ContractKind,
  data: Partial<ContractFormData>,
  filename?: string,
): Promise<void> {
  const blob = await generateContractBlob(kind, data)
  const name = filename || `${data.contract_no || 'contract'}_${kind}.docx`
  saveAs(blob, name)
}

/** Sinh đồng thời cả SC + PI cho 1 đơn hàng, return 2 Blob. */
export async function generateContractPair(
  incoterm: string,
  data: Partial<ContractFormData>,
): Promise<{ sc: Blob; pi: Blob; scKind: ContractKind; piKind: ContractKind }> {
  const scKind = deriveKind(incoterm, 'SC')
  const piKind = deriveKind(incoterm, 'PI')
  const [sc, pi] = await Promise.all([
    generateContractBlob(scKind, data),
    generateContractBlob(piKind, data),
  ])
  return { sc, pi, scKind, piKind }
}
