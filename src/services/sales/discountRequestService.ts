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

/** Gộp dữ liệu ERP + field nhập tay → object điền vào template. */
export async function buildDnckData(orderId: string, lotNo = 0) {
  const inv = await documentService.getInvoiceData(orderId, lotNo)
  const neg = await lcNegotiationService.getByOrder(orderId, lotNo)
  const df: DnckFields = (neg?.dnck_fields as DnckFields) || {}
  const amount = inv.total
  const pct = neg?.negotiate_pct ?? 90
  const negAmount = neg?.negotiate_amount ?? (amount * pct) / 100
  const bank = parseBankSwift(neg?.issuing_bank || inv.consignee || '')
  const reqDate = df.request_date ? new Date(df.request_date) : new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  const gradeCompact = (inv.grade || '').replace(/_/g, '')
  const addrLines = (inv.buyer_address || '').split(/\n|,\s*/).map((x) => x.trim()).filter(Boolean)
  const base = inv.order_code.split(' — ')[0]

  return {
    form_seq: df.form_seq || '',
    form_year: df.form_year || String(reqDate.getFullYear()),
    invoice_ref: inv.invoice_code,
    rq_d: p(reqDate.getDate()), rq_m: p(reqDate.getMonth() + 1), rq_y: String(reqDate.getFullYear()),
    lc_number: neg?.lc_number || inv.lc_number || '',
    lc_date: ddmmyyyy(neg?.lc_date),
    issuing_bank: df.issuing_bank || neg?.issuing_bank || '',
    commodity: df.commodity || `NATURAL RUBBER ${gradeCompact}`,
    shipping_line: df.shipping_line || '',
    amount: money(amount),
    invoice_no: inv.invoice_code,
    invoice_date: ddmmyyyy(inv.invoice_date),
    contract_no: df.contract_no || base,
    contract_date: ddmmyyyy(df.contract_date || (inv as { proforma_date?: string }).proforma_date || ''),
    lc_remaining: df.lc_remaining || money(amount),
    recv_swift: df.recv_swift || bank.swift,
    recv_bank_name: df.recv_bank_name || bank.name,
    recv_bank_addr1: df.recv_bank_addr1 || '',
    recv_bank_addr2: df.recv_bank_addr2 || '',
    applicant_name: df.applicant_name || inv.buyer_name,
    applicant_addr1: df.applicant_addr1 || addrLines[0] || inv.buyer_address,
    applicant_addr2: df.applicant_addr2 || addrLines[1] || '',
    applicant_addr3: df.applicant_addr3 || addrLines[2] || '',
    negotiate_amount: money(negAmount),
    negotiate_amount_words: df.negotiate_amount_words || '',
    term_days: neg?.term_days != null ? String(neg.term_days) : '',
    secured_amount_vnd: df.secured_amount_vnd || '',
  }
}

/** Điền template Vietinbank + tải .docx. */
export async function generateDNCK(orderId: string, lotNo = 0): Promise<void> {
  const data = await buildDnckData(orderId, lotNo)
  const res = await fetch(`${SALES_CONFIG.TEMPLATE_BASE}/template_DNCK_LC.docx`)
  if (!res.ok) throw new Error(`Không tải được template ĐNCK (HTTP ${res.status})`)
  const zip = new PizZip(await res.arrayBuffer())
  const doc = new Docxtemplater(zip, {
    delimiters: { start: '{', end: '}' }, paragraphLoop: true, linebreaks: true, nullGetter: () => '',
  })
  doc.render(data)
  const blob = doc.getZip().generate({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  })
  saveAs(blob, `DNCK_${data.contract_no}${lotNo ? `_L${lotNo}` : ''}.docx`)
}

export const discountRequestService = { buildDnckData, generateDNCK }
export default discountRequestService
