// ============================================================================
// FILE: src/utils/purchaseExportExcel.ts
// MODULE: Mua hàng — Huy Anh Rubber ERP
// PHASE: P7 — Export Excel định dạng chuyên nghiệp
// THƯ VIỆN: exceljs (npm install exceljs)
// ============================================================================

// ❗ Cài trước: npm install exceljs file-saver
// ❗ npm install --save-dev @types/file-saver

import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'

// ============================================================================
// COLORS & STYLES
// ============================================================================

const COLORS = {
  BLUE_DARK: 'FF1F4E79',
  BLUE_MID: 'FF2E75B6',
  BLUE_HEADER: 'FF4472C4',
  BLUE_LIGHT: 'FFD6E4F0',
  GREEN_DARK: 'FF548235',
  GREEN_LIGHT: 'FFE2EFDA',
  RED_DARK: 'FFC62828',
  RED_LIGHT: 'FFFCE4EC',
  AMBER_LIGHT: 'FFFFF8E1',
  AMBER_DARK: 'FFF57F17',
  GRAY_BG: 'FFF2F2F2',
  WHITE: 'FFFFFFFF',
  GRAY_BORDER: 'FFB4B4B4',
}

const BORDER_THIN: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: COLORS.GRAY_BORDER } },
  bottom: { style: 'thin', color: { argb: COLORS.GRAY_BORDER } },
  left: { style: 'thin', color: { argb: COLORS.GRAY_BORDER } },
  right: { style: 'thin', color: { argb: COLORS.GRAY_BORDER } },
}

const FONT_TITLE: Partial<ExcelJS.Font> = { name: 'Arial', size: 16, bold: true, color: { argb: COLORS.BLUE_DARK } }
const FONT_SUBTITLE: Partial<ExcelJS.Font> = { name: 'Arial', size: 10, color: { argb: 'FF666666' } }
const FONT_HEADER: Partial<ExcelJS.Font> = { name: 'Arial', size: 10, bold: true, color: { argb: COLORS.WHITE } }
const FONT_DATA: Partial<ExcelJS.Font> = { name: 'Arial', size: 10, color: { argb: 'FF333333' } }
const FONT_TOTAL: Partial<ExcelJS.Font> = { name: 'Arial', size: 10, bold: true, color: { argb: COLORS.BLUE_DARK } }
const FONT_RED: Partial<ExcelJS.Font> = { name: 'Arial', size: 10, bold: true, color: { argb: COLORS.RED_DARK } }
const FONT_GREEN: Partial<ExcelJS.Font> = { name: 'Arial', size: 10, color: { argb: COLORS.GREEN_DARK } }
const FONT_MONEY_BOLD: Partial<ExcelJS.Font> = { name: 'Arial', size: 10, bold: true, color: { argb: COLORS.BLUE_DARK } }
const FONT_CODE: Partial<ExcelJS.Font> = { name: 'Arial', size: 10, bold: true, color: { argb: COLORS.BLUE_MID } }

const FILL_HEADER: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.BLUE_HEADER } }
const FILL_ALT: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.GRAY_BG } }
const FILL_TOTAL: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.BLUE_LIGHT } }
const FILL_RED: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.RED_LIGHT } }
const FILL_GREEN: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.GREEN_LIGHT } }
const FILL_AMBER: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.AMBER_LIGHT } }

const VND_FORMAT = '#,##0'
const DATE_FORMAT = 'DD/MM/YYYY'

// ============================================================================
// HELPERS
// ============================================================================

function addTitle(ws: ExcelJS.Worksheet, title: string, subtitle: string, row: number, colSpan: number = 8): number {
  ws.mergeCells(row, 1, row, colSpan)
  const titleCell = ws.getCell(row, 1)
  titleCell.value = title
  titleCell.font = FONT_TITLE

  ws.mergeCells(row + 1, 1, row + 1, colSpan)
  const subCell = ws.getCell(row + 1, 1)
  subCell.value = subtitle
  subCell.font = FONT_SUBTITLE

  return row + 3
}

function addHeaderRow(ws: ExcelJS.Worksheet, row: number, headers: string[]) {
  headers.forEach((h, i) => {
    const cell = ws.getCell(row, i + 1)
    cell.value = h
    cell.font = FONT_HEADER
    cell.fill = FILL_HEADER
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    cell.border = BORDER_THIN
  })
  ws.getRow(row).height = 30
}

function setCell(
  ws: ExcelJS.Worksheet,
  row: number,
  col: number,
  value: any,
  options?: {
    font?: Partial<ExcelJS.Font>
    fill?: ExcelJS.FillPattern
    align?: 'left' | 'center' | 'right'
    numFmt?: string
  }
) {
  const cell = ws.getCell(row, col)
  cell.value = value
  cell.font = options?.font || FONT_DATA
  cell.border = BORDER_THIN
  cell.alignment = {
    horizontal: options?.align || 'left',
    vertical: 'middle',
    wrapText: true,
  }
  if (options?.fill) cell.fill = options.fill
  if (options?.numFmt) cell.numFmt = options.numFmt
  return cell
}

function formatDate(d: string): string {
  if (!d) return ''
  const date = new Date(d)
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`
}

const statusLabels: Record<string, string> = {
  draft: 'Nháp',
  confirmed: 'Đã duyệt',
  delivering: 'Đang giao',
  partial: 'TT 1 phần',
  completed: 'Hoàn thành',
  paid: 'Đã TT',
  pending: 'Chưa TT',
  cancelled: 'Hủy',
  overdue: 'Quá hạn',
}

// ============================================================================
// EXPORT FUNCTIONS
// ============================================================================

export interface ExportOrderRow {
  order_code: string
  order_date: string
  supplier_name?: string
  category?: string
  subtotal?: number
  vat_amount?: number
  total_amount: number
  paid_amount?: number
  remaining_amount?: number
  status: string
}

export interface ExportInvoiceRow {
  invoice_code: string
  invoice_number?: string
  order_code?: string
  supplier_name?: string
  invoice_date: string
  due_date?: string
  total_amount: number
  paid_amount?: number
  remaining_amount?: number
  status: string
  days_overdue?: number
}

export interface ExportPaymentRow {
  payment_code?: string
  invoice_code?: string
  supplier_name?: string
  payment_date: string
  amount: number
  method?: string
  reference?: string
}

export interface ExportDebtRow {
  supplier_code?: string
  supplier_name: string
  invoice_count?: number
  total_amount: number
  paid_amount?: number
  remaining_amount: number
  max_overdue?: number
}

// ============================================================================
// MAIN EXPORT
// ============================================================================

export async function exportPurchaseReport(
  type: 'orders' | 'invoices' | 'payments' | 'debt',
  data: any[],
  dateLabel?: string
) {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Huy Anh Rubber ERP'
  wb.created = new Date()

  const now = new Date()
  const dateStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  const sub = `Ngày xuất: ${dateStr} — Huy Anh Rubber ERP${dateLabel ? ` — ${dateLabel}` : ''}`

  switch (type) {
    case 'orders':
      buildOrdersSheet(wb, data as ExportOrderRow[], sub)
      break
    case 'invoices':
      buildInvoicesSheet(wb, data as ExportInvoiceRow[], sub)
      break
    case 'payments':
      buildPaymentsSheet(wb, data as ExportPaymentRow[], sub)
      break
    case 'debt':
      buildDebtSheet(wb, data as ExportDebtRow[], sub)
      break
  }

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const fileName = `BaoCao_${type === 'orders' ? 'DonHang' : type === 'invoices' ? 'HoaDon' : type === 'payments' ? 'ThanhToan' : 'CongNo'}_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}.xlsx`
  saveAs(blob, fileName)
}

// ============================================================================
// BUILDERS
// ============================================================================

function buildOrdersSheet(wb: ExcelJS.Workbook, data: ExportOrderRow[], sub: string) {
  const ws = wb.addWorksheet('Đơn hàng', { properties: { tabColor: { argb: 'FF4472C4' } } })
  ws.columns = [
    { width: 5 }, { width: 18 }, { width: 14 }, { width: 35 }, { width: 16 },
    { width: 18 }, { width: 15 }, { width: 20 }, { width: 18 }, { width: 18 }, { width: 15 },
  ]

  let r = addTitle(ws, 'BÁO CÁO ĐƠN HÀNG MUA HÀNG', sub, 1, 11)
  addHeaderRow(ws, r, ['STT', 'Mã đơn hàng', 'Ngày đặt', 'Nhà cung cấp', 'Nhóm VT', 'Giá trước thuế', 'VAT', 'Tổng giá trị', 'Đã thanh toán', 'Còn nợ', 'Trạng thái'])
  r++
  const dataStart = r

  data.forEach((o, i) => {
    const bg = i % 2 === 1 ? FILL_ALT : undefined
    const remaining = (o.remaining_amount || 0)
    setCell(ws, r, 1, i + 1, { align: 'center', fill: bg })
    setCell(ws, r, 2, o.order_code, { font: FONT_CODE, fill: bg })
    setCell(ws, r, 3, formatDate(o.order_date), { align: 'center', fill: bg })
    setCell(ws, r, 4, o.supplier_name || '', { fill: bg })
    setCell(ws, r, 5, o.category || '', { align: 'center', fill: bg })
    setCell(ws, r, 6, o.subtotal || 0, { numFmt: VND_FORMAT, align: 'right', fill: bg })
    setCell(ws, r, 7, o.vat_amount || 0, { numFmt: VND_FORMAT, align: 'right', fill: bg })
    setCell(ws, r, 8, o.total_amount, { numFmt: VND_FORMAT, align: 'right', font: FONT_MONEY_BOLD, fill: bg })
    setCell(ws, r, 9, o.paid_amount || 0, { numFmt: VND_FORMAT, align: 'right', font: (o.paid_amount || 0) > 0 ? FONT_GREEN : FONT_DATA, fill: bg })
    setCell(ws, r, 10, remaining, { numFmt: VND_FORMAT, align: 'right', font: remaining > 0 ? FONT_RED : FONT_DATA, fill: remaining > 0 ? FILL_RED : bg })
    setCell(ws, r, 11, statusLabels[o.status] || o.status, { align: 'center', fill: bg })
    r++
  })

  // Total row
  const dataEnd = r - 1
  for (let c = 1; c <= 5; c++) setCell(ws, r, c, c === 4 ? 'TỔNG CỘNG' : (c === 5 ? `${data.length} đơn` : ''), { font: FONT_TOTAL, fill: FILL_TOTAL, align: c >= 4 ? (c === 5 ? 'center' : 'left') : 'center' })
  for (let c = 6; c <= 10; c++) {
    const sum = data.reduce((s, o) => s + (c === 6 ? (o.subtotal || 0) : c === 7 ? (o.vat_amount || 0) : c === 8 ? o.total_amount : c === 9 ? (o.paid_amount || 0) : (o.remaining_amount || 0)), 0)
    setCell(ws, r, c, sum, { numFmt: VND_FORMAT, font: FONT_TOTAL, align: 'right', fill: FILL_TOTAL })
  }
  setCell(ws, r, 11, '', { fill: FILL_TOTAL })

  ws.autoFilter = { from: { row: dataStart - 1, column: 1 }, to: { row: dataEnd, column: 11 } }
  ws.views = [{ state: 'frozen', ySplit: dataStart - 1 }]
}

function buildInvoicesSheet(wb: ExcelJS.Workbook, data: ExportInvoiceRow[], sub: string) {
  const ws = wb.addWorksheet('Hóa đơn NCC', { properties: { tabColor: { argb: 'FFED7D31' } } })
  ws.columns = [
    { width: 5 }, { width: 18 }, { width: 16 }, { width: 18 }, { width: 35 },
    { width: 14 }, { width: 14 }, { width: 20 }, { width: 18 }, { width: 18 }, { width: 14 }, { width: 14 },
  ]

  let r = addTitle(ws, 'BÁO CÁO HÓA ĐƠN NHÀ CUNG CẤP', sub, 1, 12)
  addHeaderRow(ws, r, ['STT', 'Mã HĐ', 'Số HĐ gốc', 'Mã ĐH', 'Nhà cung cấp', 'Ngày HĐ', 'Hạn TT', 'Tổng tiền', 'Đã TT', 'Còn nợ', 'Trạng thái', 'Quá hạn'])
  r++
  const dataStart = r

  data.forEach((inv, i) => {
    const isOverdue = (inv.days_overdue || 0) > 0
    const bg = isOverdue ? FILL_RED : (i % 2 === 1 ? FILL_ALT : undefined)
    const remaining = inv.remaining_amount || 0

    setCell(ws, r, 1, i + 1, { align: 'center', fill: bg })
    setCell(ws, r, 2, inv.invoice_code, { font: { name: 'Arial', size: 10, bold: true, color: { argb: 'FFED7D31' } }, fill: bg })
    setCell(ws, r, 3, inv.invoice_number || '', { align: 'center', fill: bg })
    setCell(ws, r, 4, inv.order_code || '', { fill: bg })
    setCell(ws, r, 5, inv.supplier_name || '', { fill: bg })
    setCell(ws, r, 6, formatDate(inv.invoice_date), { align: 'center', fill: bg })
    setCell(ws, r, 7, formatDate(inv.due_date || ''), { align: 'center', fill: bg })
    setCell(ws, r, 8, inv.total_amount, { numFmt: VND_FORMAT, align: 'right', font: FONT_MONEY_BOLD, fill: bg })
    setCell(ws, r, 9, inv.paid_amount || 0, { numFmt: VND_FORMAT, align: 'right', font: (inv.paid_amount || 0) > 0 ? FONT_GREEN : FONT_DATA, fill: bg })
    setCell(ws, r, 10, remaining, { numFmt: VND_FORMAT, align: 'right', font: remaining > 0 ? FONT_RED : FONT_DATA, fill: bg })

    const statusFill = inv.status === 'paid' ? FILL_GREEN : inv.status === 'partial' ? FILL_AMBER : bg
    setCell(ws, r, 11, statusLabels[inv.status] || inv.status, { align: 'center', fill: statusFill })
    setCell(ws, r, 12, isOverdue ? `${inv.days_overdue} ngày` : '', { align: 'center', font: isOverdue ? FONT_RED : FONT_DATA, fill: bg })
    r++
  })

  const dataEnd = r - 1
  for (let c of [1,2,3,4,6,7,11,12]) setCell(ws, r, c, c === 4 ? 'TỔNG CỘNG' : '', { font: FONT_TOTAL, fill: FILL_TOTAL })
  setCell(ws, r, 5, `${data.length} hóa đơn`, { font: FONT_TOTAL, fill: FILL_TOTAL, align: 'center' })
  for (let c of [8,9,10]) {
    const sum = data.reduce((s, inv) => s + (c === 8 ? inv.total_amount : c === 9 ? (inv.paid_amount || 0) : (inv.remaining_amount || 0)), 0)
    setCell(ws, r, c, sum, { numFmt: VND_FORMAT, font: FONT_TOTAL, align: 'right', fill: FILL_TOTAL })
  }

  ws.autoFilter = { from: { row: dataStart - 1, column: 1 }, to: { row: dataEnd, column: 12 } }
  ws.views = [{ state: 'frozen', ySplit: dataStart - 1 }]
}

function buildPaymentsSheet(wb: ExcelJS.Workbook, data: ExportPaymentRow[], sub: string) {
  const ws = wb.addWorksheet('Thanh toán', { properties: { tabColor: { argb: 'FF70AD47' } } })
  ws.columns = [
    { width: 5 }, { width: 18 }, { width: 18 }, { width: 35 },
    { width: 14 }, { width: 20 }, { width: 16 }, { width: 20 },
  ]

  let r = addTitle(ws, 'BÁO CÁO LỊCH SỬ THANH TOÁN', sub, 1, 8)
  addHeaderRow(ws, r, ['STT', 'Mã TT', 'Mã hóa đơn', 'Nhà cung cấp', 'Ngày TT', 'Số tiền', 'Hình thức', 'Mã giao dịch'])
  r++
  const dataStart = r

  data.forEach((p, i) => {
    const bg = i % 2 === 1 ? FILL_ALT : undefined
    setCell(ws, r, 1, i + 1, { align: 'center', fill: bg })
    setCell(ws, r, 2, p.payment_code || '', { font: { name: 'Arial', size: 10, bold: true, color: { argb: COLORS.GREEN_DARK } }, fill: bg })
    setCell(ws, r, 3, p.invoice_code || '', { fill: bg })
    setCell(ws, r, 4, p.supplier_name || '', { fill: bg })
    setCell(ws, r, 5, formatDate(p.payment_date), { align: 'center', fill: bg })
    setCell(ws, r, 6, p.amount, { numFmt: VND_FORMAT, align: 'right', font: FONT_MONEY_BOLD, fill: bg })
    setCell(ws, r, 7, p.method || '', { align: 'center', fill: bg })
    setCell(ws, r, 8, p.reference || '', { fill: bg })
    r++
  })

  const dataEnd = r - 1
  for (let c of [1,2,3,5,7,8]) setCell(ws, r, c, '', { fill: FILL_TOTAL })
  setCell(ws, r, 4, 'TỔNG CỘNG', { font: FONT_TOTAL, fill: FILL_TOTAL })
  const total = data.reduce((s, p) => s + p.amount, 0)
  setCell(ws, r, 6, total, { numFmt: VND_FORMAT, font: FONT_TOTAL, align: 'right', fill: FILL_TOTAL })

  ws.autoFilter = { from: { row: dataStart - 1, column: 1 }, to: { row: dataEnd, column: 8 } }
  ws.views = [{ state: 'frozen', ySplit: dataStart - 1 }]
}

function buildDebtSheet(wb: ExcelJS.Workbook, data: ExportDebtRow[], sub: string) {
  const ws = wb.addWorksheet('Công nợ', { properties: { tabColor: { argb: 'FFFF0000' } } })
  ws.columns = [
    { width: 5 }, { width: 14 }, { width: 35 }, { width: 8 },
    { width: 20 }, { width: 18 }, { width: 18 }, { width: 14 }, { width: 20 },
  ]

  let r = addTitle(ws, 'BÁO CÁO CÔNG NỢ NHÀ CUNG CẤP', sub, 1, 9)
  addHeaderRow(ws, r, ['STT', 'Mã NCC', 'Tên nhà cung cấp', 'Số HĐ', 'Tổng giá trị', 'Đã TT', 'Còn nợ', 'Quá hạn', 'Mức độ'])
  r++
  const dataStart = r

  data.forEach((d, i) => {
    const bg = i % 2 === 1 ? FILL_ALT : undefined
    const overdue = d.max_overdue || 0
    let severity = 'Bình thường'
    let sevFill = bg
    let sevFont = FONT_DATA
    if (overdue > 30) { severity = '🔴 Nghiêm trọng'; sevFill = FILL_RED; sevFont = FONT_RED }
    else if (overdue > 7) { severity = '🟡 Cần chú ý'; sevFill = FILL_AMBER; sevFont = { name: 'Arial', size: 10, bold: true, color: { argb: COLORS.AMBER_DARK } } }

    setCell(ws, r, 1, i + 1, { align: 'center', fill: bg })
    setCell(ws, r, 2, d.supplier_code || '', { font: { name: 'Arial', size: 10, bold: true }, fill: bg })
    setCell(ws, r, 3, d.supplier_name, { fill: bg })
    setCell(ws, r, 4, d.invoice_count || 0, { align: 'center', fill: bg })
    setCell(ws, r, 5, d.total_amount, { numFmt: VND_FORMAT, align: 'right', fill: bg })
    setCell(ws, r, 6, d.paid_amount || 0, { numFmt: VND_FORMAT, align: 'right', font: FONT_GREEN, fill: bg })
    setCell(ws, r, 7, d.remaining_amount, { numFmt: VND_FORMAT, align: 'right', font: FONT_RED, fill: bg })
    setCell(ws, r, 8, overdue > 0 ? `${overdue} ngày` : '—', { align: 'center', fill: bg })
    setCell(ws, r, 9, severity, { align: 'center', font: sevFont, fill: sevFill })
    r++
  })

  const dataEnd = r - 1
  for (let c of [1,2,4,8,9]) setCell(ws, r, c, '', { fill: FILL_TOTAL })
  setCell(ws, r, 3, `TỔNG (${data.length} NCC)`, { font: FONT_TOTAL, fill: FILL_TOTAL })
  for (let c of [5,6,7]) {
    const sum = data.reduce((s, d) => s + (c === 5 ? d.total_amount : c === 6 ? (d.paid_amount || 0) : d.remaining_amount), 0)
    setCell(ws, r, c, sum, { numFmt: VND_FORMAT, font: FONT_TOTAL, align: 'right', fill: FILL_TOTAL })
  }

  ws.autoFilter = { from: { row: dataStart - 1, column: 1 }, to: { row: dataEnd, column: 9 } }
  ws.views = [{ state: 'frozen', ySplit: dataStart - 1 }]
}

export default exportPurchaseReport