// ============================================================================
// DISCOUNT REQUEST (ĐNCK) SERVICE — sinh "Giấy đề nghị kiêm phụ lục hợp đồng"
// của Vietinbank (BM08A / L/C) bằng cách ĐIỀN template docxtemplater.
// File: src/services/sales/discountRequestService.ts
// Template: public/contract-templates/template_DNCK_LC.docx (GIỮ NGUYÊN form NH,
// chỉ điền field động). Data pháp lý cố định nằm trong template.
// ============================================================================
import PizZip from 'pizzip'
import Docxtemplater from 'docxtemplater'
import { saveAs } from 'file-saver'
import { SALES_CONFIG } from '../../config/sales.config'
import { documentService } from './documentService'
import { lcNegotiationService } from './lcNegotiationService'
import { parseBankSwift } from './docxExport'

const money = (v: number | null | undefined) =>
  (v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const ddmmyyyy = (s: string | null | undefined): string => {
  if (!s) return ''
  const d = new Date(s)
  if (isNaN(d.getTime())) return s
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`
}

/** Field nhập riêng cho form ĐNCK (lưu ở negotiation.dnck_fields). */
export type DnckFields = Record<string, string>

// Nhãn chứng từ trên form Vietinbank (map từ key checklist 46A của đơn)
const DOC_FORM_LABELS: Record<string, string> = {
  BOE: 'Bill of Exchange', CI: 'Commercial Invoice', PL: 'Packing List',
  WL: 'Weight List', COA: 'Certificate of Analysis', BL: 'Bill of Lading',
  CO: 'Certificate of Origin', INS: 'Insurance', PHYTO: 'Phyto Certificate',
  NONWOOD: 'Non-Wood Certificate', QUALITY: 'Quality Certificate',
}
const pad2 = (n: number) => String(n || 0).padStart(2, '0')

// ── D/P (BM08 nhờ thu): lưới checklist 11 ô CỐ ĐỊNH → box ☑/☐ (Wingdings) + orig/copy ──
const WING_ON = 'þ'   // Wingdings þ = ☑
const WING_OFF = '¨'  // Wingdings ¨ = ☐
// key checklist 46A → ô lưới trên form D/P (WL không có ô; Airway luôn ☐)
const DP_GRID_MAP: Record<string, string> = {
  CI: 'ci', BOE: 'boe', COA: 'test', BL: 'bl', PL: 'pkl',
  NONWOOD: 'nw', CO: 'co', PHYTO: 'phyto', INS: 'ins', QUALITY: 'qual',
}
const DP_GRID_CELLS = ['ci', 'boe', 'test', 'bl', 'pkl', 'nw', 'awb', 'co', 'phyto', 'ins', 'qual']

/** Sinh field lưới checklist (động theo doc_checklist của đơn). */
function dpGridFields(checklist?: { doc: string; originals: number; copies: number }[] | null): Record<string, string> {
  const out: Record<string, string> = {}
  for (const c of DP_GRID_CELLS) { out[`${c}_box`] = WING_OFF; out[`${c}_orig`] = ''; out[`${c}_copy`] = '' }
  for (const item of checklist || []) {
    const cell = DP_GRID_MAP[item.doc]
    if (!cell) continue
    const has = (item.originals || 0) > 0 || (item.copies || 0) > 0
    out[`${cell}_box`] = has ? WING_ON : WING_OFF
    if (has) {
      out[`${cell}_orig`] = item.doc === 'BOE' ? '2/2' : String(item.originals || '')
      out[`${cell}_copy`] = item.doc === 'BOE' ? '' : String(item.copies || '')
    }
  }
  return out
}

/** Gộp dữ liệu ERP + field nhập tay → object điền vào template. */
export async function buildDnckData(orderId: string, lotNo = 0) {
  const inv = await documentService.getInvoiceData(orderId, lotNo)
  const neg = await lcNegotiationService.getByOrder(orderId, lotNo)
  const df: DnckFields = (neg?.dnck_fields as DnckFields) || {}
  // Giá trị đòi tiền = số Hối phiếu draw (THE COST khi đơn CIF có cước/BH), khớp Hối phiếu + bản in
  const drawAmount = (inv.freight > 0 || inv.insurance > 0) ? inv.the_cost : inv.total
  const pct = neg?.negotiate_pct ?? null
  const negAmount = neg?.negotiate_amount ?? (pct != null ? (drawAmount * pct) / 100 : null)
  const bank = parseBankSwift(neg?.issuing_bank || inv.consignee || '')
  const parsed = df.request_date ? new Date(df.request_date) : null
  const reqDate = parsed && !isNaN(parsed.getTime()) ? parsed : new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  const gradeCompact = (inv.grade || '').replace(/_/g, ' ')   // SVR_10 → "SVR 10" (khớp Invoice)
  const addrLines = (inv.buyer_address || '').split(/\n|,\s*/).map((x) => x.trim()).filter(Boolean)
  const base = inv.order_code.split(' — ')[0]

  // Checklist mục 3 (động theo 46A của đơn) → loop {#docs} trong template
  const docs = (neg?.doc_checklist || [])
    .filter((c) => (c.originals || 0) > 0 || (c.copies || 0) > 0)
    .map((c) => ({
      name: DOC_FORM_LABELS[c.doc] || c.doc,
      orig: c.doc === 'BOE' ? '2/2' : pad2(c.originals),
      copy: pad2(c.copies),
    }))

  return {
    docs,
    form_seq: df.form_seq || '',
    form_year: df.form_year || String(reqDate.getFullYear()),
    invoice_ref: inv.invoice_code,
    rq_d: p(reqDate.getDate()), rq_m: p(reqDate.getMonth() + 1), rq_y: String(reqDate.getFullYear()),
    lc_number: neg?.lc_number || inv.lc_number || '',
    lc_date: ddmmyyyy(neg?.lc_date),
    issuing_bank: df.issuing_bank || neg?.issuing_bank || '',
    commodity: df.commodity || `NATURAL RUBBER ${gradeCompact}`,
    shipping_line: df.shipping_line || '',
    amount: money(drawAmount),
    invoice_no: inv.invoice_code,
    invoice_date: ddmmyyyy(inv.invoice_date),
    contract_no: df.contract_no || base,
    contract_date: ddmmyyyy(df.contract_date || (inv as { contract_date?: string }).contract_date || ''),
    lc_remaining: df.lc_remaining || money(drawAmount),
    recv_swift: df.recv_swift || bank.swift,
    recv_bank_name: df.recv_bank_name || bank.name,
    recv_bank_addr1: df.recv_bank_addr1 || '',
    recv_bank_addr2: df.recv_bank_addr2 || '',
    applicant_name: df.applicant_name || inv.buyer_name,
    applicant_addr1: df.applicant_addr1 || addrLines[0] || inv.buyer_address,
    applicant_addr2: df.applicant_addr2 || addrLines[1] || '',
    applicant_addr3: df.applicant_addr3 || addrLines[2] || '',
    negotiate_amount: negAmount != null ? money(negAmount) : '',
    negotiate_amount_words: df.negotiate_amount_words || '',
    term_days: neg?.term_days != null ? String(neg.term_days) : '',
    secured_amount_vnd: df.secured_amount_vnd || '',
  }
}

/** Gộp dữ liệu ERP + field nhập tay → object điền template D/P (BM08 nhờ thu). */
export async function buildDnckDataDP(orderId: string, lotNo = 0) {
  const inv = await documentService.getInvoiceData(orderId, lotNo)
  const neg = await lcNegotiationService.getByOrder(orderId, lotNo)
  const df: DnckFields = (neg?.dnck_fields as DnckFields) || {}
  const drawAmount = (inv.freight > 0 || inv.insurance > 0) ? inv.the_cost : inv.total
  const pct = neg?.negotiate_pct ?? null
  const negAmount = neg?.negotiate_amount ?? (pct != null ? (drawAmount * pct) / 100 : null)
  // D/P: issuing_bank = NH nhờ thu (NH người mua) → tách tên + swift
  const bank = parseBankSwift(df.recv_bank_name || neg?.issuing_bank || '')
  const parsed = df.request_date ? new Date(df.request_date) : null
  const reqDate = parsed && !isNaN(parsed.getTime()) ? parsed : new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  const gradeCompact = (inv.grade || '').replace(/_/g, ' ')   // SVR_10 → "SVR 10" (khớp Invoice)
  const base = inv.order_code.split(' — ')[0]
  const buyerAddr = (inv.buyer_address || '').replace(/\n/g, ', ').trim()

  return {
    ...dpGridFields(neg?.doc_checklist),
    form_seq: df.form_seq || '',
    form_year: df.form_year || String(reqDate.getFullYear()),
    invoice_ref: inv.invoice_code,
    rq_d: p(reqDate.getDate()), rq_m: p(reqDate.getMonth() + 1), rq_y: String(reqDate.getFullYear()),
    commodity: df.commodity || `NATURAL RUBBER ${gradeCompact}`,
    shipping_line: df.shipping_line || '',
    amount: money(drawAmount),
    invoice_no: inv.invoice_code,
    invoice_date: ddmmyyyy(inv.invoice_date),
    contract_no: df.contract_no || base,
    contract_date: ddmmyyyy(df.contract_date || (inv as { contract_date?: string }).contract_date || ''),
    negotiate_date: ddmmyyyy(df.negotiate_date || ''),
    // NH nhờ thu (người mua) — strip SWIFT khỏi tên nếu người dùng gộp chung
    recv_bank_name: df.recv_bank_name ? parseBankSwift(df.recv_bank_name).name : bank.name,
    recv_bank_addr: df.recv_bank_addr || '',
    recv_swift: df.recv_swift || bank.swift,
    // Người nhập khẩu / người mua
    buyer_name: df.buyer_name || inv.buyer_name,
    buyer_addr: df.buyer_addr || buyerAddr,
    discount_amount: negAmount != null ? money(negAmount) : '',
    discount_amount_words: df.discount_amount_words || '',
    negotiate_pct: pct != null ? String(pct) : '',
    term_days: neg?.term_days != null ? String(neg.term_days) : '',
  }
}

/** Điền template Vietinbank + tải .docx. Chọn template theo phương thức (L/C vs D/P nhờ thu). */
export async function generateDNCK(orderId: string, lotNo = 0): Promise<void> {
  const neg = await lcNegotiationService.getByOrder(orderId, lotNo)
  const isDP = !!(neg?.method && neg.method !== 'lc')   // 'dp' / 'da' → BM08 nhờ thu
  const data = isDP ? await buildDnckDataDP(orderId, lotNo) : await buildDnckData(orderId, lotNo)
  const tpl = isDP ? 'template_DNCK_DP.docx' : 'template_DNCK_LC.docx'
  // cache-bust: luôn lấy template mới nhất (tránh trình duyệt giữ bản cũ còn highlight vàng)
  const res = await fetch(`${SALES_CONFIG.TEMPLATE_BASE}/${tpl}?v=${Date.now()}`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Không tải được template ĐNCK (HTTP ${res.status})`)
  const zip = new PizZip(await res.arrayBuffer())
  const doc = new Docxtemplater(zip, {
    delimiters: { start: '{', end: '}' }, paragraphLoop: true, linebreaks: true, nullGetter: () => '',
  })
  doc.render(data)
  const outZip = doc.getZip()
  // An toàn: xoá MỌI highlight (bôi vàng…) còn sót trước khi xuất — "định dạng sạch trước khi tải"
  try {
    const docXml = outZip.file('word/document.xml')?.asText()
    if (docXml) {
      const cleaned = docXml
        .replace(/<w:highlight\b[^>]*\/>/g, '')
        .replace(/<w:highlight\b[^>]*>[\s\S]*?<\/w:highlight>/g, '')
      outZip.file('word/document.xml', cleaned)
    }
  } catch { /* không có gì để xoá thì bỏ qua */ }
  const blob = outZip.generate({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  })
  saveAs(blob, `DNCK_${isDP ? 'DP_' : ''}${data.contract_no}${lotNo ? `_L${lotNo}` : ''}.docx`)
}

export const discountRequestService = { buildDnckData, buildDnckDataDP, generateDNCK }
export default discountRequestService
