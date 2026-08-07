// ============================================================================
// DOCX EXPORT — sinh file Word (.docx) CHUẨN cho bộ chứng từ xuất khẩu
// File: src/services/sales/docxExport.ts
//
// Dùng thư viện `docx` (dựng Word thật, Times New Roman, letterhead, bảng viền)
// thay cho HTML→.doc thô. Khớp mẫu chứng từ thật.
// ============================================================================

import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, BorderStyle, WidthType,
} from 'docx'
import { saveAs } from 'file-saver'
import { amountToWords } from './contractGeneratorService'
import type { InvoiceData, PackingListData, WeightListData, BeneficiaryCertData, NonWoodCertData } from './documentService'

const FONT = 'Times New Roman'
const hp = (pt: number) => Math.round(pt * 2)   // half-points
const money = (v: number | null | undefined) =>
  (v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
// Ngày -> DD/MM/YYYY (bỏ ISO). Trả nguyên nếu không parse được.
const fmtD = (s: string | null | undefined): string => {
  if (!s) return ''
  const d = new Date(s)
  if (isNaN(d.getTime())) return s
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`
}
const B = { style: BorderStyle.SINGLE, size: 4, color: '000000' }
const CELL_BORDERS = { top: B, bottom: B, left: B, right: B }
const TABLE_BORDERS = { ...CELL_BORDERS, insideHorizontal: B, insideVertical: B }

type PO = { align?: (typeof AlignmentType)[keyof typeof AlignmentType]; after?: number; before?: number; bold?: boolean; italics?: boolean; size?: number; rule?: boolean }

function R(text: string, o: { bold?: boolean; italics?: boolean; size?: number } = {}) {
  return new TextRun({ text, bold: o.bold, italics: o.italics, size: hp(o.size ?? 11), font: FONT })
}
function P(content: string | TextRun[], o: PO = {}) {
  const children = typeof content === 'string' ? [R(content, { bold: o.bold, italics: o.italics, size: o.size })] : content
  return new Paragraph({
    children,
    alignment: o.align,
    spacing: { after: o.after ?? 40, before: o.before ?? 0 },
    border: o.rule ? { bottom: { style: BorderStyle.SINGLE, size: 12, color: '000000', space: 2 } } : undefined,
  })
}
function cell(content: string, o: { bold?: boolean; size?: number; align?: PO['align']; width?: number } = {}) {
  return new TableCell({
    children: [P(content, { bold: o.bold, size: o.size ?? 10, align: o.align, after: 0 })],
    width: o.width ? { size: o.width, type: WidthType.PERCENTAGE } : undefined,
    margins: { top: 30, bottom: 30, left: 70, right: 70 },
    borders: CELL_BORDERS,
  })
}
function gridTable(headers: string[], rows: string[][], widths?: number[]) {
  const headRow = new TableRow({
    tableHeader: true,
    children: headers.map((h, i) => cell(h, { bold: true, size: 9, align: AlignmentType.CENTER, width: widths?.[i] })),
  })
  const bodyRows = rows.map((r) => new TableRow({
    children: r.map((v, i) => cell(v, { size: 9.5, width: widths?.[i], align: i === 0 ? undefined : AlignmentType.CENTER })),
  }))
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: TABLE_BORDERS, rows: [headRow, ...bodyRows] })
}
function letterhead(): Paragraph[] {
  return [
    P('HUY ANH RUBBER COMPANY LIMITED', { align: AlignmentType.CENTER, bold: true, size: 15, after: 0 }),
    P('Khe Ma, Phong Dien Ward, Hue City, Viet Nam', { align: AlignmentType.CENTER, size: 10.5, after: 0 }),
    P('Tel: 054.3774994   ·   Fax: 054.3774994   ·   Tax ID: 3301549896', { align: AlignmentType.CENTER, size: 10.5, after: 60, rule: true }),
  ]
}
function makeDoc(children: (Paragraph | Table)[]) {
  return new Document({
    styles: { default: { document: { run: { font: FONT, size: hp(11) } } } },
    sections: [{ properties: { page: { margin: { top: 680, bottom: 680, left: 900, right: 900 } } }, children }],
  })
}

export async function saveDocx(doc: Document, filename: string) {
  const blob = await Packer.toBlob(doc)
  saveAs(blob, filename.toLowerCase().endsWith('.docx') ? filename : `${filename}.docx`)
}

// ── COMMERCIAL INVOICE ──
export function invoiceDoc(d: InvoiceData): Document {
  const kids: (Paragraph | Table)[] = [
    ...letterhead(),
    P('COMMERCIAL INVOICE', { align: AlignmentType.CENTER, bold: true, size: 15, after: 20 }),
    P(`No: ${d.invoice_code}          Date: ${fmtD(d.invoice_date)}`, { align: AlignmentType.CENTER, after: 100 }),
    P([R('THE SELLER: ', { bold: true }), R('HUY ANH RUBBER COMPANY LIMITED')], { after: 0 }),
    P('ADDRESS: Khe Ma, Phong Dien Ward, Hue City, Viet Nam', { after: 0 }),
    P('TEL: 054.3774994   FAX: 054.3774994', { after: 60 }),
    P([R('THE BUYER: ', { bold: true }), R(d.buyer_name || d.customer.name)], { after: 0 }),
    P(`ADDRESS: ${d.buyer_address || d.customer.address}`, { after: 60 }),
  ]
  if (d.consignee) kids.push(P([R('CONSIGNEE: ', { bold: true }), R(d.consignee.trim())], { after: 0 }))
  if (d.notify_party) kids.push(P([R('NOTIFY: ', { bold: true }), R(d.notify_party.trim())], { after: 60 }))
  kids.push(
    gridTable(
      ['CONTRACT NO', 'INCOTERM', 'PORT OF LOADING', 'PORT OF DISCHARGE', 'PO NO.'],
      [[d.order_code, d.incoterm, d.port_of_loading || '—', d.port_of_destination || '—', d.po_number || '—']],
      [22, 14, 24, 24, 16],
    ),
  )
  if (d.vessel_name || d.etd || d.bl_number) {
    const parts: TextRun[] = []
    if (d.vessel_name) parts.push(R('VESSEL: ', { bold: true }), R(`${d.vessel_name}${d.voyage_number ? ' / ' + d.voyage_number : ''}    `))
    if (d.etd) parts.push(R('ETD: ', { bold: true }), R(`${fmtD(d.etd)}    `))
    if (d.bl_number) parts.push(R('B/L NO: ', { bold: true }), R(`${d.bl_number}${d.bl_date ? '  DATED ' + fmtD(d.bl_date) : ''}`))
    kids.push(P(parts, { before: 40, after: 40 }))
  }
  kids.push(
    P('', { after: 40 }),
    gridTable(
      ['DESCRIPTION OF GOODS', 'QUANTITY (MT)', `UNIT PRICE (${d.currency}/MT)`, 'AMOUNT (USD)'],
      [[`${d.quantity_tons} MT - NATURAL RUBBER ${(d.grade || '').replace(/_/g, ' ')}`, `${d.quantity_tons}`, money(d.unit_price), money(d.subtotal)]],
      [46, 14, 20, 20],
    ),
    P(`${d.incoterm} ${d.port_of_destination || ''}`.trim(), { after: 40, size: 10.5 }),
    P([R('NET WEIGHT: ', { bold: true }), R(`${d.net_weight_kg.toFixed(2)} KGS`)], { after: 0 }),
    P([R('GROSS WEIGHT: ', { bold: true }), R(`${d.gross_weight_kg.toFixed(2)} KGS`)], { after: 0 }),
    P([R('HS CODE: ', { bold: true }), R(d.hs_code), R('        COUNTRY OF ORIGIN: ', { bold: true }), R(d.country_of_origin)], { after: 0 }),
    P([R('PRODUCER: ', { bold: true }), R('HUY ANH RUBBER COMPANY LIMITED')], { after: 60 }),
  )
  kids.push(P([R('TOTAL: ', { bold: true }), R(`USD ${money(d.total)}`, { bold: true })], { after: 0 }))
  // CIF: cước + bảo hiểm TRỪ ra "THE COST" (số Hối phiếu draw) — khớp mẫu gốc
  if (d.freight > 0 || d.insurance > 0) {
    if (d.freight > 0) kids.push(P(`FREIGHT CHARGE: USD ${money(d.freight)}`, { after: 0 }))
    if (d.insurance > 0) kids.push(P(`INSURANCE: USD ${money(d.insurance)}`, { after: 0 }))
    kids.push(P([R('THE COST: ', { bold: true }), R(`USD ${money(d.the_cost)}`, { bold: true })], { after: 0 }))
  }
  kids.push(
    P(`PAYMENT TERM: ${d.payment_terms || ''}`, { after: 0 }),
    P(`SAY US DOLLARS: ${amountToWords(d.total).toUpperCase()}`, { italics: true, after: 60 }),
  )
  if (d.lc_number) kids.push(P(`L/C NUMBER: ${d.lc_number}`, { after: 0 }))
  if (d.shipping_marks) {
    kids.push(P('SHIPPING MARK:', { bold: true, after: 0 }))
    d.shipping_marks.split('\n').forEach((l) => kids.push(P(l, { after: 0, size: 10.5 })))
  }
  kids.push(
    P('', { after: 40 }),
    P('BANK INFORMATION:', { bold: true, after: 0 }),
    P(`ACCOUNT NAME: ${d.bank_info.account_name}`, { after: 0 }),
    P(`BANK NAME: ${d.bank_info.name}`, { after: 0 }),
    ...(d.bank_info.address ? [P(`BANK ADDRESS: ${d.bank_info.address}`, { after: 0 })] : []),
    P(`ACCOUNT NUMBER: ${d.bank_info.account}     SWIFT CODE: ${d.bank_info.swift}`, { after: 200 }),
    P('HUY ANH RUBBER COMPANY LIMITED', { align: AlignmentType.RIGHT, bold: true, after: 0 }),
    P('', { after: 300 }),
    P('GENERAL DIRECTOR', { align: AlignmentType.RIGHT, bold: true }),
  )
  return makeDoc(kids)
}

// ── PACKING LIST ──
export function packingListDoc(d: PackingListData): Document {
  const kids: (Paragraph | Table)[] = [
    ...letterhead(),
    P('PACKING LIST', { align: AlignmentType.CENTER, bold: true, size: 15, after: 60 }),
    P([R('Sales Order: ', { bold: true }), R(d.order_code), R('     Buyer: ', { bold: true }), R(d.buyer_name || d.customer_name)], { after: 0 }),
  ]
  if (d.consignee) kids.push(P([R('Consignee: ', { bold: true }), R(d.consignee.trim())], { after: 0 }))
  kids.push(
    P([R('Commodity: ', { bold: true }), R(`Natural Rubber ${(d.grade || '').replace(/_/g, ' ')}`), R('     Vessel: ', { bold: true }), R(d.vessel_name || 'TBD')], { after: 0 }),
    P([R('POL: ', { bold: true }), R(d.port_of_loading || 'TBD'), R('     POD: ', { bold: true }), R(d.port_of_destination || 'TBD'), R('     ETD: ', { bold: true }), R(d.etd ? fmtD(d.etd) : 'TBD')], { after: 80 }),
    gridTable(
      ['Container No.', 'Seal No.', 'Type', 'Bales', 'Net Weight (KG)', 'Gross Weight (KG)'],
      [
        ...d.containers.map((c) => [c.container_no, c.seal_no, c.container_type, `${c.bale_count}`, money(c.net_weight_kg).replace(/\.00$/, ''), money(c.gross_weight_kg).replace(/\.00$/, '')]),
        ['TOTAL', '', '', `${d.total_bales}`, money(d.total_net_weight).replace(/\.00$/, ''), money(d.total_gross_weight).replace(/\.00$/, '')],
      ],
      [22, 20, 10, 12, 18, 18],
    ),
  )
  if (d.shipping_marks) {
    kids.push(P('', { after: 40 }), P('Shipping Marks:', { bold: true, after: 0 }))
    d.shipping_marks.split('\n').forEach((l) => kids.push(P(l, { after: 0, size: 10.5 })))
  }
  kids.push(P('', { after: 300 }), P('HUY ANH RUBBER COMPANY LIMITED', { align: AlignmentType.RIGHT, bold: true }))
  return makeDoc(kids)
}

// ── WEIGHT LIST ──
export function weightListDoc(d: WeightListData): Document {
  const kids: (Paragraph | Table)[] = [
    ...letterhead(),
    P('WEIGHT LIST', { align: AlignmentType.CENTER, bold: true, size: 15, after: 60 }),
    P([R('Sales Order: ', { bold: true }), R(d.order_code), R('     Buyer: ', { bold: true }), R(d.buyer_name)], { after: 0 }),
  ]
  if (d.consignee) kids.push(P([R('Consignee: ', { bold: true }), R(d.consignee.trim())], { after: 0 }))
  kids.push(
    P([R('Vessel: ', { bold: true }), R(d.vessel_name || 'TBD'), R('     B/L No.: ', { bold: true }), R(`${d.bl_number || 'TBD'}${d.bl_date ? ' (' + fmtD(d.bl_date) + ')' : ''}`), R('     ETD: ', { bold: true }), R(d.etd ? fmtD(d.etd) : 'TBD')], { after: 80 }),
    gridTable(
      ['Container No.', 'Seal No.', 'Bales', 'Net (KG)', 'Tare (KG)', 'Gross (KG)'],
      [
        ...d.containers.map((c) => [c.container_no, c.seal_no, `${c.bale_count}`, money(c.net_weight_kg).replace(/\.00$/, ''), money(c.tare_weight_kg).replace(/\.00$/, ''), money(c.gross_weight_kg).replace(/\.00$/, '')]),
        ['TOTAL', '', `${d.total_bales}`, money(d.total_net).replace(/\.00$/, ''), money(d.total_tare).replace(/\.00$/, ''), money(d.total_gross).replace(/\.00$/, '')],
      ],
      [24, 20, 12, 15, 14, 15],
    ),
    P('', { after: 300 }),
    P('HUY ANH RUBBER COMPANY LIMITED', { align: AlignmentType.RIGHT, bold: true }),
  )
  return makeDoc(kids)
}

// ── BILL OF EXCHANGE ──
export function boeDoc(d: {
  amount: number; ourBank: string; issuingBank: string; invoiceRef: string; invoiceDate: string
  tenorDays: number | null; lcNumber: string; lcDate: string; today: string
  method?: 'lc' | 'dp' | 'da'; drawnOn?: string   // D/P·D/A: drawn ON người mua, không L/C
}): Document {
  const isDP = d.method === 'dp' || d.method === 'da'
  const tenorLine = d.tenorDays == null ? 'AT ______ DAYS FROM BILL OF LADING DATE'
    : d.tenorDays === 0 ? 'AT SIGHT' : `AT ${d.tenorDays} DAYS FROM BILL OF LADING DATE`
  const kv = (k: string, v: string) => P([R(k, {}), R(`: ${v}`, { bold: true })], { after: 20 })
  return makeDoc([
    P('BILL OF EXCHANGE', { align: AlignmentType.CENTER, bold: true, size: 15, after: 60 }),
    P([R(`Hue City, ${d.today}`), R('                                          '), R(`FOR: USD ${money(d.amount)}`, { bold: true })], { after: 20 }),
    P(tenorLine, { bold: true, after: 0 }),
    P('of this First Bill of Exchange (Second of the same tenor and date being unpaid)', { italics: true, after: 80 }),
    kv('Pay To The Order Of', d.ourBank),
    kv('The Sum Of Say (US DOLLARS)', amountToWords(d.amount).toUpperCase()),
    kv('Value received as per our Invoice(s) No(s)', `${d.invoiceRef}  Dated ${fmtD(d.invoiceDate)}`),
    // L/C: "Drawn under {NH phát hành}" + số L/C · D/P·D/A: "Drawn on {người mua}", KHÔNG L/C
    ...(isDP
      ? [kv('Drawn on', d.drawnOn || ''), kv('TO', d.issuingBank)]
      : [kv('Drawn under', d.issuingBank), kv('L/C Number', `${d.lcNumber}${d.lcDate ? `   L/C Date: ${d.lcDate}` : ''}`), kv('TO', d.issuingBank)]),
    P('', { after: 240 }),
    P('HUY ANH RUBBER COMPANY LIMITED', { align: AlignmentType.RIGHT, bold: true, after: 0 }),
    P('', { after: 260 }),
    P('PHÓ GIÁM ĐỐC', { align: AlignmentType.RIGHT, bold: true }),
  ])
}

// ── ĐƠN CHIẾT KHẤU (BM03) ──
export function lcNegotiationDoc(d: {
  orderCode: string; contractNo: string; grade: string; invTotal: number
  bankName: string; accountNo: string; issuingBank: string; lcNumber: string; lcDate: string
  negotiatePct: number | null; negotiateAmount: number | null; interestRate: number | null
  termDays: number | null; submittedDate: string
  checklist: { label: string; originals: number; copies: number }[]
}): Document {
  const kv = (k: string, v: string) => P([R(k, {}), R(`: ${v}`)], { after: 20 })
  const kids: (Paragraph | Table)[] = [
    P('GIẤY ĐỀ NGHỊ KIÊM HỢP ĐỒNG THƯƠNG LƯỢNG THANH TOÁN', { align: AlignmentType.CENTER, bold: true, size: 14, after: 20 }),
    P(`Số: ${d.orderCode}/TLTT`, { align: AlignmentType.CENTER, after: 100 }),
    P([R('Kính gửi: ', { bold: true }), R(`Ngân hàng ${d.bankName || '.....'}`)], { after: 80 }),
    P('A. ĐỀ NGHỊ CỦA KHÁCH HÀNG', { bold: true, size: 12, after: 20 }),
    kv('Khách hàng', 'CÔNG TY TNHH MỘT THÀNH VIÊN CAO SU HUY ANH PHONG ĐIỀN'),
    kv('Tài khoản', `${d.accountNo || '—'} tại ${d.bankName || '—'}`),
    kv('Người đại diện', 'Ông Lê Xuân Hồng Trung — Phó Giám Đốc'),
    P('NỘI DUNG ĐỀ NGHỊ', { bold: true, size: 12, after: 20, before: 60 }),
    kv('L/C số', `${d.lcNumber || '—'}${d.lcDate ? `   ngày ${d.lcDate}` : ''}`),
    kv('Ngân hàng phát hành', d.issuingBank || '—'),
    kv('Loại hàng', `NATURAL RUBBER ${(d.grade || '').replace(/_/g, ' ')}`),
    kv('Số hợp đồng', d.contractNo || d.orderCode),
    kv('Trị giá hóa đơn', `USD ${money(d.invTotal)}`),
    P('BỘ CHỨNG TỪ ĐỀ NGHỊ THƯƠNG LƯỢNG (số bản)', { bold: true, size: 12, after: 20, before: 60 }),
    gridTable(
      ['Chứng từ', 'Bản gốc', 'Bản copy'],
      d.checklist.length ? d.checklist.map((c) => [c.label, `${c.originals}`, `${c.copies}`]) : [['(Chưa nhập checklist ở Hồ sơ chứng từ khách)', '', '']],
      [60, 20, 20],
    ),
    P('ĐIỀU KIỆN THƯƠNG LƯỢNG', { bold: true, size: 12, after: 20, before: 80 }),
    kv('Tỷ lệ thương lượng', `${d.negotiatePct ?? '—'}%  = USD ${money(d.negotiateAmount || 0)}`),
    kv('Lãi suất', `${d.interestRate ?? '—'} %/năm`),
    kv('Thời hạn', `${d.termDays ?? '—'} ngày`),
    kv('Ngày nộp', d.submittedDate || '—'),
    P('', { after: 240 }),
    P('CÔNG TY TNHH MTV CAO SU HUY ANH PHONG ĐIỀN', { align: AlignmentType.RIGHT, bold: true, after: 0 }),
    P('', { after: 260 }),
    P('PHÓ GIÁM ĐỐC', { align: AlignmentType.RIGHT, bold: true }),
  ]
  return makeDoc(kids)
}

// ── ĐƠN CHIẾT KHẤU nhờ thu D/P · D/A (BM08 — bộ chứng từ TRỪ L/C) ──
export function collectionDiscountDoc(d: {
  orderCode: string; contractNo: string; grade: string; invTotal: number; draftValue: number
  bankName: string; accountNo: string; method: 'dp' | 'da'
  collectingBank: string; buyerName: string
  negotiatePct: number | null; negotiateAmount: number | null; interestRate: number | null
  termDays: number | null; submittedDate: string
  checklist: { label: string; originals: number; copies: number }[]
}): Document {
  const kv = (k: string, v: string) => P([R(k, {}), R(`: ${v}`)], { after: 20 })
  const methodLabel = d.method === 'da' ? 'Nhờ thu D/A (URC 522)' : 'Nhờ thu D/P (URC 522)'
  const kids: (Paragraph | Table)[] = [
    P('GIẤY ĐỀ NGHỊ CHIẾT KHẤU KIÊM PHỤ LỤC HỢP ĐỒNG', { align: AlignmentType.CENTER, bold: true, size: 14, after: 20 }),
    P(`Số: ${d.orderCode}/CI-CK`, { align: AlignmentType.CENTER, after: 10 }),
    P('(Mẫu BM08 — Hối phiếu kèm bộ chứng từ, TRỪ L/C)', { align: AlignmentType.CENTER, italics: true, size: 10, after: 100 }),
    P([R('Kính gửi: ', { bold: true }), R(`Ngân hàng ${d.bankName || '.....'}`)], { after: 80 }),
    P('A. ĐỀ NGHỊ CỦA KHÁCH HÀNG', { bold: true, size: 12, after: 20 }),
    kv('Khách hàng', 'CÔNG TY TNHH MỘT THÀNH VIÊN CAO SU HUY ANH PHONG ĐIỀN'),
    kv('Tài khoản', `${d.accountNo || '—'} tại ${d.bankName || '—'}`),
    kv('Người đại diện', 'Ông Lê Xuân Hồng Trung — Phó Giám Đốc'),
    P('NỘI DUNG ĐỀ NGHỊ', { bold: true, size: 12, after: 20, before: 60 }),
    kv('Phương thức thanh toán', methodLabel),
    kv('Ngân hàng nhờ thu (người mua)', d.collectingBank || '—'),
    kv('Người nhập khẩu / người mua', d.buyerName || '—'),
    kv('Loại hàng', `NATURAL RUBBER ${(d.grade || '').replace(/_/g, ' ')}`),
    kv('Số hợp đồng', d.contractNo || d.orderCode),
    kv('Trị giá hóa đơn', `USD ${money(d.invTotal)}`),
    P([R('Giá trị Hối phiếu (đòi tiền)', {}), R(`: USD ${money(d.draftValue)}`, { bold: true })], { after: 20 }),
    P('BỘ CHỨNG TỪ (số bản)', { bold: true, size: 12, after: 20, before: 60 }),
    gridTable(
      ['Chứng từ', 'Bản gốc', 'Bản copy'],
      d.checklist.length ? d.checklist.map((c) => [c.label, `${c.originals}`, `${c.copies}`]) : [['(Chưa nhập checklist ở Hồ sơ chứng từ khách)', '', '']],
      [60, 20, 20],
    ),
    P('Cam kết xuất trình đầy đủ bộ chứng từ trong vòng 15 ngày làm việc kể từ ngày Ngân hàng thực hiện thương lượng thanh toán. Gửi Hối phiếu kèm bộ chứng từ đi nhờ thu theo Quy tắc thống nhất về Nhờ thu (URC 522). Mọi rủi ro & chi phí thuộc về khách hàng.', { italics: true, before: 30, after: 40 }),
    P('ĐIỀU KIỆN CHIẾT KHẤU', { bold: true, size: 12, after: 20, before: 40 }),
    kv('Tỷ lệ chiết khấu', `${d.negotiatePct ?? '—'}%  = USD ${money(d.negotiateAmount || 0)}`),
    kv('Lãi suất', `${d.interestRate ?? '—'} %/năm`),
    kv('Thời hạn', `${d.termDays ?? '—'} ngày`),
    kv('Ngày nộp', d.submittedDate || '—'),
    P('', { after: 240 }),
    P('CÔNG TY TNHH MTV CAO SU HUY ANH PHONG ĐIỀN', { align: AlignmentType.RIGHT, bold: true, after: 0 }),
    P('', { after: 260 }),
    P('PHÓ GIÁM ĐỐC', { align: AlignmentType.RIGHT, bold: true }),
  ]
  return makeDoc(kids)
}

// ── BENEFICIARY'S CERTIFICATE ──
export function beneficiaryCertDoc(d: BeneficiaryCertData): Document {
  const kv = (k: string, v: string) => P([R(k, { bold: true }), R(`   ${v}`)], { after: 20 })
  return makeDoc([
    ...letterhead(),
    P("BENEFICIARY'S CERTIFICATE", { align: AlignmentType.CENTER, bold: true, size: 15, after: 20 }),
    P(`No.: ${d.cert_no}          Date: ${fmtD(d.date)}`, { align: AlignmentType.CENTER, after: 100 }),
    kv('THE BUYER/APPLICANT:', d.buyer_name),
    P(`ADDRESS: ${d.buyer_address}`, { after: 60 }),
    kv('BILL OF LADING NO.:', d.bl_number || '—'),
    kv('SHIPPED ON BOARD:', fmtD(d.shipped_on_board) || '—'),
    kv('VESSEL/VOYAGE:', d.vessel || '—'),
    kv('PORT OF LOADING:', d.port_of_loading || '—'),
    kv('PORT OF DISCHARGE:', d.port_of_destination || '—'),
    kv('L/C NO:', `${d.lc_number || '—'}${d.lc_date ? '   DATE: ' + fmtD(d.lc_date) : ''}`),
    ...(d.buyer_email ? [kv('EMAIL ADDRESS:', d.buyer_email)] : []),
    P('', { after: 40 }),
    P('We, HUY ANH RUBBER COMPANY LIMITED CERTIFY THAT, a set of copy documents had been emailed to the applicant within 03 days from shipment.', { after: 220 }),
    P('HUY ANH RUBBER COMPANY LIMITED', { align: AlignmentType.RIGHT, bold: true, after: 0 }),
    P('', { after: 300 }),
    P('GENERAL DIRECTOR', { align: AlignmentType.RIGHT, bold: true }),
  ])
}

// ── CERTIFICATE OF NON-WOOD PACKING MATERIAL ──
export function nonWoodCertDoc(d: NonWoodCertData): Document {
  const kv = (k: string, v: string) => P([R(k, { bold: true }), R(`   ${v}`)], { after: 20 })
  return makeDoc([
    ...letterhead(),
    P('CERTIFICATE OF NON-WOOD PACKING MATERIAL', { align: AlignmentType.CENTER, bold: true, size: 15, after: 20 }),
    P(`No: ${d.cert_no}          Date: ${fmtD(d.date)}`, { align: AlignmentType.CENTER, after: 100 }),
    kv('THE SELLER:', 'HUY ANH RUBBER COMPANY LIMITED'),
    P('ADDRESS: Khe Ma, Phong Dien Ward, Hue City, Viet Nam', { after: 40 }),
    kv('THE BUYER:', d.buyer_name),
    P(`ADDRESS: ${d.buyer_address}`, { after: 60 }),
    kv('COMMODITY:', d.commodity),
    kv('COUNTRY OF ORIGIN:', d.country_of_origin),
    kv('NET WEIGHT:', `${d.net_weight_kg.toFixed(2)} KGS`),
    kv('GROSS WEIGHT:', `${d.gross_weight_kg.toFixed(2)} KGS`),
    kv('VESSEL:', d.vessel || '—'),
    kv('PORT OF LOADING:', d.port_of_loading || '—'),
    kv('PORT OF DISCHARGE:', d.port_of_destination || '—'),
    kv('BILL OF LADING NUMBER:', d.bl_number || '—'),
    kv('CONTRACT NO.:', d.contract_no),
    kv('INVOICE NO.:', d.invoice_no),
    P('', { after: 40 }),
    P(`WE, HUY ANH RUBBER COMPANY LIMITED CERTIFY THAT ${d.quantity_tons} MT OF NATURAL RUBBER ${d.grade_label}, NO WOODEN PACKING MATERIAL USED IN THE WHOLE OF SHIPMENT OF GOODS.`, { after: 220 }),
    P('HUY ANH RUBBER COMPANY LIMITED', { align: AlignmentType.RIGHT, bold: true, after: 0 }),
    P('', { after: 300 }),
    P('GENERAL DIRECTOR', { align: AlignmentType.RIGHT, bold: true }),
  ])
}

