// ============================================================================
// DOCX EXPORT — sinh file Word (.docx) CHUẨN cho bộ chứng từ xuất khẩu
// File: src/services/sales/docxExport.ts
//
// Dùng thư viện `docx` (dựng Word thật, Times New Roman, letterhead, bảng viền)
// thay cho HTML→.doc thô. Khớp mẫu chứng từ thật.
// ============================================================================

import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, BorderStyle, WidthType, ImageRun, VerticalAlign, TableLayoutType, type TableVerticalAlign,
} from 'docx'
import { saveAs } from 'file-saver'
import { amountToWords } from './contractGeneratorService'
import { logoUint8Array, LOGO_W, LOGO_H } from './logoAsset'
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
const NB = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
const NO_BORDERS = { top: NB, bottom: NB, left: NB, right: NB, insideHorizontal: NB, insideVertical: NB }

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
function gridTable(headers: string[], rows: string[][], widths?: number[], centerAll = false) {
  const headRow = new TableRow({
    tableHeader: true,
    children: headers.map((h, i) => cell(h, { bold: true, size: 9, align: AlignmentType.CENTER, width: widths?.[i] })),
  })
  const bodyRows = rows.map((r) => new TableRow({
    children: r.map((v, i) => cell(v, { size: 9.5, width: widths?.[i], align: (centerAll || i !== 0) ? AlignmentType.CENTER : undefined })),
  }))
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: TABLE_BORDERS, rows: [headRow, ...bodyRows] })
}
// Cell linh hoạt: nhiều paragraph, căn dọc, gộp cột — để dựng bảng invoice khớp mẫu
function cellBox(children: Paragraph[], o: { width?: number; valign?: TableVerticalAlign; columnSpan?: number } = {}) {
  return new TableCell({
    children,
    width: o.width ? { size: o.width, type: WidthType.PERCENTAGE } : undefined,
    columnSpan: o.columnSpan,
    verticalAlign: o.valign,
    margins: { top: 40, bottom: 40, left: 70, right: 70 },
    borders: CELL_BORDERS,
  })
}
// Ngày -> DD.MM.YYYY (dòng "DATED ..." trong Commercial Invoice)
const fmtDot = (s: string | null | undefined): string => {
  if (!s) return ''
  const dt = new Date(s)
  if (isNaN(dt.getTime())) return s
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(dt.getDate())}.${p(dt.getMonth() + 1)}.${dt.getFullYear()}`
}
// Ô "DESCRIPTION OF GOODS AND/OR SERVICE" — DÙNG CHUNG Invoice / Packing List / Weight List (khớp mẫu)
type DescData = {
  quantity_tons: number; grade: string
  proforma_no?: string; proforma_date?: string
  packing_desc?: string; total_packing?: string
  net_weight_kg: number; gross_weight_kg: number
  item_no?: string; lc_number?: string | null; lc_date?: string | null
  hs_code: string; country_of_origin: string
  invoice_extra_lines?: string; shipping_marks?: string
  po_number?: string | null; attn_contacts?: string
}
function buildDescLines(d: DescData): Paragraph[] {
  const out: Paragraph[] = []
  const dl = (s: string, o: PO = {}) => out.push(P(s, { after: 0, size: 9.5, ...o }))
  const qty = d.quantity_tons.toFixed(2).replace(/\.00$/, '')
  dl(`${qty} MT -  NATURAL RUBBER ${(d.grade || '').replace(/_/g, ' ')}.`, { bold: true })
  if (d.proforma_no) dl(`AS PER PROFORMA INVOICE NO.${d.proforma_no}`)
  if (d.proforma_date) dl(`DATED ${fmtDot(d.proforma_date)}`)
  if (d.packing_desc) dl(`PACKING: ${d.packing_desc}`)
  if (d.total_packing) dl(`TOTAL PACKING: ${d.total_packing}`)
  dl(`NET WEIGHT: ${d.net_weight_kg.toFixed(2)} KGS`)
  dl(`GROSS WEIGHT: ${d.gross_weight_kg.toFixed(2)} KGS`)
  if (d.item_no) dl(`ITEM NO.: ${d.item_no}`)
  if (d.lc_number) dl(`LC NO: ${d.lc_number}${d.lc_date ? `   DATE: ${fmtDot(d.lc_date)}` : ''}`)
  dl(`HS CODE: ${d.hs_code}`)
  dl('PRODUCER: HUY ANH RUBBER COMPANY LIMITED')
  dl(`COUNTRY OF ORIGIN: ${d.country_of_origin}`)
  if (d.invoice_extra_lines) d.invoice_extra_lines.split('\n').forEach((l) => l.trim() && dl(l.trim()))
  dl('')
  dl('SHIPPING MARK', { bold: true })
  if (d.shipping_marks) d.shipping_marks.split('\n').forEach((l) => dl(l))
  if (d.po_number) dl(`PO NO: ${d.po_number}`)
  if (d.attn_contacts) { dl('Attn:'); d.attn_contacts.split('\n').forEach((l) => l.trim() && dl(l.trim())) }
  return out
}
// Logo HUYANH Natural Rubber (khớp mẫu chứng từ thật) — nhúng từ src/assets/logo.png
function logoImage(width = 168): ImageRun {
  const height = Math.round((width * LOGO_H) / LOGO_W)   // giữ tỉ lệ 300×96
  return new ImageRun({ type: 'png', data: logoUint8Array(), transformation: { width, height } })
}
// Letterhead = LOGO trái + khối thông tin công ty căn phải (giống hệt mẫu)
function letterhead(): (Paragraph | Table)[] {
  const right = [
    P('HUY ANH RUBBER COMPANY LIMITED', { align: AlignmentType.RIGHT, bold: true, size: 12, after: 0 }),
    P('KHE MA, PHONG DIEN WARD, HUE CITY, VIETNAM', { align: AlignmentType.RIGHT, size: 9.5, after: 0 }),
    P('TEL: 054 3774994    FAX: 054 3774994', { align: AlignmentType.RIGHT, size: 9.5, after: 0 }),
    P('EMAIL: info@huyanh.com    WEB: http://huyanhrubber.com.vn', { align: AlignmentType.RIGHT, size: 9.5, after: 0 }),
  ]
  const headTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: NO_BORDERS,
    rows: [new TableRow({
      children: [
        new TableCell({
          width: { size: 42, type: WidthType.PERCENTAGE }, borders: NO_BORDERS,
          verticalAlign: VerticalAlign.CENTER, margins: { top: 0, bottom: 0, left: 0, right: 0 },
          children: [new Paragraph({ children: [logoImage()], spacing: { after: 0 } })],
        }),
        new TableCell({
          width: { size: 58, type: WidthType.PERCENTAGE }, borders: NO_BORDERS,
          verticalAlign: VerticalAlign.CENTER, margins: { top: 0, bottom: 0, left: 0, right: 0 },
          children: right,
        }),
      ],
    })],
  })
  return [headTable, P('', { after: 80, rule: true })]
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

// ── COMMERCIAL INVOICE ── (khớp HỆT sheet INV HA20260080.xlsm: 1 bảng viền lớn)
export function invoiceDoc(d: InvoiceData): Document {
  const CENTER = AlignmentType.CENTER, RIGHT = AlignmentType.RIGHT, VC = VerticalAlign.CENTER
  const qtyFmt = d.quantity_tons.toFixed(2)
  const priceFmt = Number.isInteger(d.unit_price) ? String(d.unit_price) : d.unit_price.toFixed(2)
  const n2 = (v: number) => (v || 0).toFixed(2)
  const pod = d.port_of_destination || ''
  const cifLine = `${d.incoterm} ${pod}`.trim()

  // Ô mô tả hàng (cột trái, cao) — dùng chung với PKL/WL
  const desc = buildDescLines(d)

  // Bảng hàng: header + body + TOTAL/FREIGHT/INSURANCE/FOB(COST) + SAY + PAYMENT TERM
  const goods = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE }, borders: TABLE_BORDERS,
    layout: TableLayoutType.FIXED, columnWidths: [5255, 1213, 1819, 1819],
    rows: [
      new TableRow({ tableHeader: true, children: [
        cellBox([P('DESCRIPTION OF GOODS AND/OR SERVICE', { bold: true, align: CENTER, size: 10, after: 0 })], { valign: VC }),
        cellBox([P('QUANTITY OF GOODS (MT)', { bold: true, align: CENTER, size: 8.5, after: 0 })], { valign: VC }),
        cellBox([P('UNIT PRICE (USD/MT)', { bold: true, align: CENTER, size: 8.5, after: 0 }), P(cifLine, { align: CENTER, size: 8, after: 0 })], { valign: VC }),
        cellBox([P('AMOUNT (USD)', { bold: true, align: CENTER, size: 8.5, after: 0 })], { valign: VC }),
      ] }),
      new TableRow({ children: [
        cellBox(desc),
        cellBox([P(qtyFmt, { align: CENTER, after: 0 })], { valign: VC }),
        cellBox([P(priceFmt, { align: CENTER, after: 0 })], { valign: VC }),
        cellBox([P(n2(d.subtotal), { align: CENTER, after: 0 })], { valign: VC }),
      ] }),
      new TableRow({ children: [
        cellBox([P('TOTAL', { bold: true, align: CENTER, after: 0 })]),
        cellBox([P(qtyFmt, { align: CENTER, after: 0 })]),
        cellBox([P('', { after: 0 })]),
        cellBox([P(n2(d.subtotal), { align: CENTER, after: 0 })]),
      ] }),
      new TableRow({ children: [
        cellBox([P('FREIGHT CHARGES', { align: CENTER, after: 0 })], { columnSpan: 3 }),
        cellBox([P(n2(d.freight), { align: CENTER, after: 0 })]),
      ] }),
      new TableRow({ children: [
        cellBox([P('INSURANCE', { align: CENTER, after: 0 })], { columnSpan: 3 }),
        cellBox([P(n2(d.insurance), { align: CENTER, after: 0 })]),
      ] }),
      new TableRow({ children: [
        cellBox([P(`FOB ${d.port_of_loading || ''} (COST)`, { align: CENTER, after: 0 })], { columnSpan: 3 }),
        cellBox([P(n2(d.the_cost), { align: CENTER, after: 0 })]),
      ] }),
      new TableRow({ children: [
        cellBox([P('SAY US DOLLARS:', { after: 0 })]),
        cellBox([P(amountToWords(d.total), { after: 0 })], { columnSpan: 3 }),
      ] }),
      new TableRow({ children: [
        cellBox([P('PAYMENT TERM:', { after: 0 })]),
        cellBox([P(d.payment_terms || '', { after: 0 })], { columnSpan: 3 }),
      ] }),
    ],
  })

  const kids: (Paragraph | Table)[] = [
    ...letterhead(),
    P('COMMERCIAL INVOICE', { align: CENTER, bold: true, size: 15, after: 20 }),
    P(`No: ${d.invoice_code}`, { align: RIGHT, after: 0 }),
    P(`Date: ${fmtD(d.invoice_date)}`, { align: RIGHT, after: 80 }),
    P([R('THE SELLER/THE BENEFICIARY: ', { bold: true }), R('HUY ANH RUBBER COMPANY LIMITED')], { after: 0 }),
    P('ADDRESS: KHE MA, PHONG DIEN WARD, HUE CITY, VIETNAM', { after: 40 }),
    P([R('THE BUYER/THE APPLICANT: ', { bold: true }), R(d.buyer_name || d.customer.name)], { after: 0 }),
    P(`ADDRESS: ${d.buyer_address || d.customer.address}`, { after: 80 }),
    gridTable(
      ['CONTRACT NO', 'SHIPMENT DATE', 'VESSEL', 'PORT OF LOADING', 'BILL OF LADING NUMBER', 'PORT OF DISCHARGE'],
      [[d.order_code, fmtD(d.shipment_date) || '—', `${d.vessel_name || ''}${d.voyage_number ? ' ' + d.voyage_number : ''}`.trim() || '—', d.port_of_loading || '—', d.bl_number || '—', pod || '—']],
      [15, 14, 19, 18, 18, 16],
    ),
    P('', { after: 20 }),
    goods,
    P('', { after: 40 }),
    P('BANK INFORMATION:', { bold: true, after: 0 }),
    P(`ACCOUNT NAME: ${d.bank_info.account_name}`, { after: 0 }),
    P(`BANK NAME: ${d.bank_info.name}`, { after: 0 }),
    P(`ACCOUNT NUMBER: ${d.bank_info.account}`, { after: 0 }),
    ...(d.bank_info.address ? [P(`BANK ADDRESS: ${d.bank_info.address}`, { after: 0 })] : []),
    P(`SWIFT CODE: ${d.bank_info.swift}`, { after: 220 }),
    P('HUY ANH RUBBER COMPANY LIMITED', { align: RIGHT, bold: true, after: 0 }),
    P('', { after: 280 }),
    P('PHÓ GIÁM ĐỐC', { align: RIGHT, bold: true, after: 0 }),
    P('Lê Xuân Hồng Trung', { align: RIGHT, bold: true }),
  ]
  return makeDoc(kids)
}

// ── PACKING LIST ── (khớp HỆT sheet PKL / bản in BCT GRI 04)
export function packingListDoc(d: PackingListData): Document {
  const CENTER = AlignmentType.CENTER, RIGHT = AlignmentType.RIGHT, VC = VerticalAlign.CENTER
  const kgs = (v: number) => String(Math.round(v || 0))
  // MTS lấy CÙNG nguồn với dòng NET/GROSS WEIGHT KGS trong ô mô tả (net_weight_kg có fallback) → không mâu thuẫn
  const netMts = (d.net_weight_kg / 1000).toFixed(2)
  const grossMts = (d.gross_weight_kg / 1000).toFixed(2)
  const vessel = `${d.vessel_name || ''}${d.voyage_number ? ' ' + d.voyage_number : ''}`.trim() || '—'

  // Bảng container: NO restart theo lô (lot_no)
  let no = 0
  let prevLot: number | null = null
  const contRows = d.containers.map((c) => {
    const lot = c.lot_no ?? 0
    if (lot !== prevLot) { no = 1; prevLot = lot } else { no += 1 }
    return [String(no), c.container_no, c.seal_no, kgs(c.net_weight_kg), kgs(c.gross_weight_kg)]
  })

  // Bảng mô tả 3 cột: DESCRIPTION | NET WEIGHT (MTS) | GROSS WEIGHT (MTS)
  const descTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE }, borders: TABLE_BORDERS,
    layout: TableLayoutType.FIXED, columnWidths: [7074, 1516, 1516],
    rows: [
      new TableRow({ tableHeader: true, children: [
        cellBox([P('DESCRIPTION OF GOODS AND/OR SERVICE', { bold: true, align: CENTER, size: 10, after: 0 })], { valign: VC }),
        cellBox([P('NET WEIGHT (MTS)', { bold: true, align: CENTER, size: 8.5, after: 0 })], { valign: VC }),
        cellBox([P('GROSS WEIGHT (MTS)', { bold: true, align: CENTER, size: 8.5, after: 0 })], { valign: VC }),
      ] }),
      new TableRow({ children: [
        cellBox(buildDescLines(d)),
        cellBox([P(netMts, { align: CENTER, after: 0 })], { valign: VC }),
        cellBox([P(grossMts, { align: CENTER, after: 0 })], { valign: VC }),
      ] }),
      new TableRow({ children: [
        cellBox([P('TOTAL', { bold: true, align: CENTER, after: 0 })]),
        cellBox([P(netMts, { align: CENTER, after: 0 })]),
        cellBox([P(grossMts, { align: CENTER, after: 0 })]),
      ] }),
    ],
  })

  const kids: (Paragraph | Table)[] = [
    ...letterhead(),
    P('PACKING LIST', { align: CENTER, bold: true, size: 15, after: 20 }),
    P(`No: ${d.pkl_no}`, { align: RIGHT, after: 0 }),
    P(`Date: ${fmtD(d.date)}`, { align: RIGHT, after: 80 }),
    P([R('THE SELLER/THE BENEFICIARY: ', { bold: true }), R('HUY ANH RUBBER COMPANY LIMITED')], { after: 0 }),
    P('ADDRESS: KHE MA, PHONG DIEN WARD, HUE CITY, VIETNAM', { after: 40 }),
    P([R('THE BUYER/THE APPLICANT: ', { bold: true }), R(d.buyer_name || d.customer_name)], { after: 0 }),
    P(`ADDRESS: ${d.buyer_address || d.customer_address}`, { after: 80 }),
    gridTable(
      ['COMMERCIAL INVOICE', 'BILL OF LADING NUMBER', 'VESSEL', 'PORT OF LOADING', 'PORT OF DISCHARGE'],
      [[d.invoice_code, d.bl_number || '—', vessel, d.port_of_loading || '—', d.port_of_destination || '—']],
      [20, 18, 20, 22, 20], true,
    ),
    P('', { after: 20 }),
    gridTable(
      ['NO', 'CONTAINER NO', 'SEAL NO', 'NET WEIGHT (KGS)', 'GROSS WEIGHT (KGS)'],
      contRows,
      [8, 28, 24, 20, 20], true,
    ),
    P('', { after: 20 }),
    descTable,
    P('', { after: 260 }),
    P('HUY ANH RUBBER COMPANY LIMITED', { align: RIGHT, bold: true, after: 0 }),
    P('', { after: 260 }),
    P('PHÓ GIÁM ĐỐC', { align: RIGHT, bold: true, after: 0 }),
    P('Lê Xuân Hồng Trung', { align: RIGHT, bold: true }),
  ]
  return makeDoc(kids)
}

// ── WEIGHT LIST ──
// ── WEIGHT LIST ── (khớp HỆT sheet WL HA20260080.xlsm: khối info dọc + bảng container có PALLET)
export function weightListDoc(d: WeightListData): Document {
  const CENTER = AlignmentType.CENTER, RIGHT = AlignmentType.RIGHT, VC = VerticalAlign.CENTER
  const kgs = (v: number) => String(Math.round(v || 0))
  const vessel = `${d.vessel_name || ''}${d.voyage_number ? ' ' + d.voyage_number : ''}`.trim() || '—'
  const lcLine = d.lc_number ? `${d.lc_number}${d.lc_date ? `      DATE: ${fmtDot(d.lc_date)}` : ''}` : '—'

  // Khối info dọc (borderless 2 cột)
  const info: [string, string][] = [
    ['THE SELLER/BENEFICIARY:', 'HUY ANH RUBBER COMPANY LIMITED'],
    ['ADDRESS:', 'KHE MA, PHONG DIEN WARD, HUE CITY, VIETNAM'],
    ['CONSIGNEE:', d.consignee || '—'],
    ['ADDRESS:', d.consignee_address || '—'],
    ['COMMODITY:', `NATURAL RUBBER ${(d.grade || '').replace(/_/g, ' ')}`],
    ['PACKING:', d.packing_desc || '—'],
    ['TOTAL:', d.total_packing || '—'],
    ['NET WEIGHT:', `${d.net_weight_kg.toFixed(2)} KGS`],
    ['GROSS WEIGHT:', `${d.gross_weight_kg.toFixed(2)} KGS`],
    ['VESSEL:', vessel],
    ['PORT OF LOADING:', d.port_of_loading || '—'],
    ['PORT OF DISCHARGE:', d.port_of_destination || '—'],
    ['BILL OF LADING NUMBER:', d.bl_number || '—'],
    ['LC NO:', lcLine],
  ]
  const infoTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE }, borders: NO_BORDERS,
    layout: TableLayoutType.FIXED, columnWidths: [2900, 7206],
    rows: info.map(([k, v]) => new TableRow({ children: [
      new TableCell({ borders: NO_BORDERS, margins: { top: 8, bottom: 8, left: 0, right: 40 }, children: [P(k, { bold: true, size: 10.5, after: 0 })] }),
      new TableCell({ borders: NO_BORDERS, margins: { top: 8, bottom: 8, left: 0, right: 0 }, children: [P(v, { size: 10.5, after: 0 })] }),
    ] })),
  })

  // Bảng container: NO restart theo lô, cột PALLET, TOTAL span 3 cột đầu
  let no = 0
  let prevLot: number | null = null
  const bodyRows = d.containers.map((c) => {
    const lot = c.lot_no ?? 0
    if (lot !== prevLot) { no = 1; prevLot = lot } else { no += 1 }
    return new TableRow({ children: [
      cellBox([P(String(no), { align: CENTER, after: 0 })], { valign: VC }),
      cellBox([P(c.container_no, { align: CENTER, after: 0 })], { valign: VC }),
      cellBox([P(c.seal_no, { align: CENTER, after: 0 })], { valign: VC }),
      cellBox([P(c.pallet_count != null ? String(c.pallet_count) : '', { align: CENTER, after: 0 })], { valign: VC }),
      cellBox([P(kgs(c.net_weight_kg), { align: CENTER, after: 0 })], { valign: VC }),
      cellBox([P(kgs(c.gross_weight_kg), { align: CENTER, after: 0 })], { valign: VC }),
    ] })
  })
  const contTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE }, borders: TABLE_BORDERS,
    layout: TableLayoutType.FIXED, columnWidths: [808, 2425, 2223, 1213, 1718, 1719],
    rows: [
      new TableRow({ tableHeader: true, children: ['NO', 'CONTAINER NO', 'SEAL NO', 'PALLET', 'NET WEIGHT (KGS)', 'GROSS WEIGHT (KGS)'].map((h) =>
        cellBox([P(h, { bold: true, align: CENTER, size: 8.5, after: 0 })], { valign: VC })) }),
      ...bodyRows,
      new TableRow({ children: [
        cellBox([P('TOTAL', { bold: true, align: CENTER, after: 0 })], { columnSpan: 3 }),
        cellBox([P(d.total_pallet ? String(d.total_pallet) : '', { bold: true, align: CENTER, after: 0 })]),
        cellBox([P(kgs(d.total_net), { bold: true, align: CENTER, after: 0 })]),
        cellBox([P(kgs(d.total_gross), { bold: true, align: CENTER, after: 0 })]),
      ] }),
    ],
  })

  return makeDoc([
    ...letterhead(),
    P('WEIGHT LIST', { align: CENTER, bold: true, size: 15, after: 20 }),
    P(`No: ${d.wl_no}`, { align: RIGHT, after: 0 }),
    P(`Date: ${fmtD(d.date)}`, { align: RIGHT, after: 80 }),
    infoTable,
    P('', { after: 20 }),
    contTable,
    P('', { after: 260 }),
    P('HUY ANH RUBBER COMPANY LIMITED', { align: RIGHT, bold: true, after: 0 }),
    P('', { after: 260 }),
    P('PHÓ GIÁM ĐỐC', { align: RIGHT, bold: true, after: 0 }),
    P('Lê Xuân Hồng Trung', { align: RIGHT, bold: true }),
  ])
}

// Tách chuỗi ngân hàng → { name, swift }. Hỗ trợ "BANK (SWIFT XXX)" và "XXX / BANK / UNIT / LOC".
export function parseBankSwift(s: string): { name: string; swift: string } {
  const raw = (s || '').trim()
  const m = raw.match(/\(SWIFT\s*:?\s*([A-Z0-9]{6,11})\)/i)
  if (m) return { name: raw.replace(/\s*\(SWIFT[^)]*\)\s*/i, '').trim(), swift: m[1].toUpperCase() }
  // BIC chuẩn: 6 chữ + 2 alnum (+ tuỳ chọn 3 alnum) = 8 hoặc 11 ký tự → tránh nhầm 1 từ tên NH thành SWIFT
  const parts = raw.split(/\s*\/\s*/).map((x) => x.trim()).filter(Boolean)
  if (parts.length > 1 && /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/i.test(parts[0])) {
    return { name: parts.slice(1).join(', '), swift: parts[0].toUpperCase() }
  }
  return { name: raw, swift: '' }
}

// ── BILL OF EXCHANGE ── (khớp HỆT sheet BOE / bản in — KHÔNG letterhead)
export function boeDoc(d: {
  amount: number; ourBank: string; issuingBank: string; invoiceRef: string; invoiceDate: string
  tenorDays: number | null; lcNumber: string; lcDate: string; today: string
  method?: 'lc' | 'dp' | 'da'; drawnOn?: string   // D/P·D/A: TO = người mua, không L/C
  issuingBankAddress?: string; issuingBankSwift?: string   // NH nhờ thu (D/P) / phát hành (L/C): địa chỉ + SWIFT
}): Document {
  const isDP = d.method === 'dp' || d.method === 'da'
  const bank = parseBankSwift(d.issuingBank)
  const swift = d.issuingBankSwift || bank.swift
  const tenorBase = d.tenorDays == null ? 'AT ______ DAYS FROM BILL OF LADING DATE'
    : d.tenorDays === 0 ? 'AT SIGHT' : `AT ${d.tenorDays} DAYS FROM BILL OF LADING DATE`
  const tenorLine = (d.tenorDays && d.tenorDays > 0 && d.today) ? `${tenorBase}   -   ${d.today}` : tenorBase

  // Dòng label : value (borderless 3 cột — canh cột như mẫu)
  const NBM = { top: 26, bottom: 26, left: 0, right: 30 }
  const kvRow = (k: string, v: string, boldV = false) => new TableRow({ children: [
    new TableCell({ width: { size: 37, type: WidthType.PERCENTAGE }, borders: NO_BORDERS, margins: NBM, children: [P(k, { size: 11, after: 0 })] }),
    new TableCell({ width: { size: 3, type: WidthType.PERCENTAGE }, borders: NO_BORDERS, margins: { top: 26, bottom: 26, left: 0, right: 0 }, children: [P(':', { size: 11, after: 0 })] }),
    new TableCell({ width: { size: 60, type: WidthType.PERCENTAGE }, borders: NO_BORDERS, margins: { top: 26, bottom: 26, left: 30, right: 0 }, children: [P(v, { size: 11, bold: boldV, after: 0 })] }),
  ] })
  const rows: TableRow[] = [
    kvRow('Pay To The Order Of', d.ourBank),
    kvRow('The Sum Of SAY (US DOLLARS)', amountToWords(d.amount).toUpperCase()),
    kvRow('Value received as per our Invoice(s) No(s)', `${d.invoiceRef}       Date: ${fmtD(d.invoiceDate)}`),
  ]
  if (isDP) {
    // D/P·D/A (nhờ thu): NH người mua = "collecting bank" (tên + địa chỉ + SWIFT), TO = NGƯỜI MUA
    rows.push(kvRow("The collecting bank's name", bank.name))
    if (d.issuingBankAddress) rows.push(kvRow('Bank address', d.issuingBankAddress))
    if (swift) rows.push(kvRow('Swift code', swift))
    rows.push(kvRow('TO', d.drawnOn || '', true))
  } else {
    // L/C: drawn under NH phát hành, có số L/C, TO = NH phát hành
    rows.push(kvRow('Drawn under', bank.name))
    if (swift) rows.push(kvRow('Swift code', swift))
    rows.push(kvRow('L/C NUMBER', `${d.lcNumber}${d.lcDate ? `        L/C DATE: ${d.lcDate}` : ''}`))
    rows.push(kvRow('TO', bank.name, true))
  }
  const fieldTable = new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: NO_BORDERS, rows })

  return makeDoc([
    P('BILL OF EXCHANGE', { align: AlignmentType.CENTER, bold: true, size: 15, after: 60 }),
    P(`Hue City, ${d.today}`, { after: 0 }),
    P([R('FOR: USD ', { bold: true }), R(money(d.amount), { bold: true })], { after: 20 }),
    P(tenorLine, { bold: true, after: 0 }),
    P('of this First Bill of Exchange (Second of the same tenor and date being unpaid)', { italics: true, after: 80 }),
    fieldTable,
    P('', { after: 200 }),
    P('HUY ANH RUBBER COMPANY LIMITED', { align: AlignmentType.CENTER, bold: true, after: 0 }),
    P('', { after: 240 }),
    P('PHÓ GIÁM ĐỐC', { align: AlignmentType.CENTER, bold: true, after: 0 }),
    P('Lê Xuân Hồng Trung', { align: AlignmentType.CENTER, bold: true }),
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
    ...letterhead(),
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
    ...letterhead(),
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
    P(`No.: ${d.cert_no}`, { align: AlignmentType.RIGHT, after: 0 }),
    P(`Date: ${fmtD(d.date)}`, { align: AlignmentType.RIGHT, after: 100 }),
    kv('THE BUYER/APPLICANT:', d.buyer_name),
    P(`ADDRESS: ${d.buyer_address}`, { after: 40 }),
    kv('BILL OF LADING NO.:', d.bl_number || '—'),
    kv('SHIPPED ON BOARD:', fmtD(d.shipped_on_board) || '—'),
    kv('VESSEL/VOYAGE:', d.vessel || '—'),
    kv('PORT OF LOADING:', d.port_of_loading || '—'),
    kv('PORT OF DISCHARGE:', d.port_of_destination || '—'),
    kv('LC NO:', `${d.lc_number || '—'}${d.lc_date ? '        DATE: ' + fmtDot(d.lc_date) : ''}`),
    kv('BUYER:', d.buyer_name),
    ...(d.buyer_email ? [kv('EMAIL ADDRESS:', d.buyer_email)] : []),
    P('', { after: 40 }),
    P('We, HUY ANH RUBBER COMPANY LIMITED CERTIFY THAT, a set of copy documents had been emailed to the applicant within 03 days from shipment.', { after: 220 }),
    P('HUY ANH RUBBER COMPANY LIMITED', { align: AlignmentType.RIGHT, bold: true, after: 0 }),
    P('', { after: 260 }),
    P('PHÓ GIÁM ĐỐC', { align: AlignmentType.RIGHT, bold: true, after: 0 }),
    P('Lê Xuân Hồng Trung', { align: AlignmentType.RIGHT, bold: true }),
  ])
}

// ── CERTIFICATE OF NON-WOOD PACKING MATERIAL ──
export function nonWoodCertDoc(d: NonWoodCertData): Document {
  const kv = (k: string, v: string) => P([R(k, { bold: true }), R(`   ${v}`)], { after: 20 })
  return makeDoc([
    ...letterhead(),
    P('CERTIFICATE OF NON-WOOD PACKING MATERIAL', { align: AlignmentType.CENTER, bold: true, size: 15, after: 20 }),
    P(`No: ${d.cert_no}`, { align: AlignmentType.RIGHT, after: 0 }),
    P(`Date: ${fmtD(d.date)}`, { align: AlignmentType.RIGHT, after: 100 }),
    kv('THE SELLER:', 'HUY ANH RUBBER COMPANY LIMITED'),
    P('ADDRESS: KHE MA, PHONG DIEN WARD, HUE CITY, VIETNAM', { after: 40 }),
    kv('THE BUYER:', d.buyer_name),
    P(`ADDRESS: ${d.buyer_address}`, { after: 40 }),
    kv('COMMODITY:', d.commodity),
    kv('COUNTRY OF ORIGIN:', d.country_of_origin),
    ...(d.packing_desc ? [kv('PACKING:', d.packing_desc)] : []),
    ...(d.total_packing ? [kv('TOTAL:', d.total_packing)] : []),
    kv('NET WEIGHT:', `${d.net_weight_kg.toFixed(2)} KGS`),
    kv('GROSS WEIGHT:', `${d.gross_weight_kg.toFixed(2)} KGS`),
    kv('VESSEL:', d.vessel || '—'),
    kv('PORT OF LOADING:', d.port_of_loading || '—'),
    kv('PORT OF DISCHARGE:', d.port_of_destination || '—'),
    kv('BILL OF LADING NUMBER:', d.bl_number || '—'),
    kv('CONTRACT NO.:', d.contract_no),
    kv('INVOICE NO.:', d.invoice_no),
    P('', { after: 40 }),
    P(`WE, HUY ANH RUBBER COMPANY LIMITED CERTIFY THAT ${d.quantity_tons.toFixed(2).replace(/\.00$/, '')} MT OF NATURAL RUBBER ${d.grade_label}, NO WOODEN PACKING MATERIAL USED IN THE WHOLE OF SHIPMENT OF GOODS.`, { after: 220 }),
    P('HUY ANH RUBBER COMPANY LIMITED', { align: AlignmentType.RIGHT, bold: true, after: 0 }),
    P('', { after: 260 }),
    P('PHÓ GIÁM ĐỐC', { align: AlignmentType.RIGHT, bold: true, after: 0 }),
    P('Lê Xuân Hồng Trung', { align: AlignmentType.RIGHT, bold: true }),
  ])
}

