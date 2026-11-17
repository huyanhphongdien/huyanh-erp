// ============================================================================
// EXPORT EXCEL — CÔNG NỢ KHÁCH (trang /sales/ar-aging)
// File: src/services/sales/arAgingExcel.ts
// ----------------------------------------------------------------------------
// Audit 17/11/2026: kế toán muốn đưa bảng công nợ cho BGĐ phải chụp màn hình.
// File này CHỈ ghi lại đúng các con số trang đang hiện (đọc từ v_ar_aging_rows qua
// arAgingService, trang cuộn lên khách/đơn) — KHÔNG tự viết công thức A/R nào.
// ⚠ Cột tuổi là "tuổi kể từ ngày giao", KHÔNG phải "quá hạn" (xem CLAUDE.md mục Công nợ).
// ============================================================================

import type ExcelJSType from 'exceljs'
import { ORDER_STATUS_LABELS, countryLabel, type SalesOrderStatus } from './salesTypes'

const BRAND = 'FF1B4D3E'
const BRAND_LIGHT = 'FFECFDF5'
const WHITE = 'FFFFFFFF'
const ZEBRA = 'FFF9FAFB'
const BORDER = 'FFE5E7EB'
const RED = 'FFDC2626'
const MONEY = '#,##0'
const DATE = 'dd/mm/yyyy'

/** Một đơn trong bảng con của khách — đúng các số trang đang hiện. */
export interface ArExportOrder {
  id: string
  code: string
  contractNo: string | null
  status: string
  total: number
  paid: number
  outstanding: number
  /** Mốc tuổi (ngày giao) của khoản nợ già nhất trong đơn; null = chưa có mốc. */
  delivery_date: string | null
}

/** Một dòng khách — khớp ARRecord của ARAgingReportPage. */
export interface ArExportCustomer {
  customer_name: string
  customer_code: string
  country: string | null
  currency: string
  total_amount: number
  paid_amount: number
  outstanding: number
  aging_0_30: number
  aging_31_60: number
  aging_61_90: number
  aging_90_plus: number
  aging_no_anchor: number
  order_count: number
  orders: ArExportOrder[]
}

export interface ArAgingExportOpts {
  customers: ArExportCustomer[]
  /** Mô tả phạm vi đang xem (in lên đầu file). */
  scopeLabel: string
}

const thin = (): Partial<ExcelJSType.Borders> => ({
  top: { style: 'thin', color: { argb: BORDER } },
  left: { style: 'thin', color: { argb: BORDER } },
  bottom: { style: 'thin', color: { argb: BORDER } },
  right: { style: 'thin', color: { argb: BORDER } },
})

const toDate = (v: string | null): Date | null => {
  if (!v) return null
  const d = new Date(v)
  return isNaN(d.getTime()) ? null : d
}

function titleBlock(ws: ExcelJSType.Worksheet, cols: number, title: string, sub: string) {
  ws.mergeCells(1, 1, 1, cols)
  const r1 = ws.getRow(1)
  r1.getCell(1).value = 'CÔNG TY TNHH MTV CAO SU HUY ANH PHONG ĐIỀN'
  r1.getCell(1).font = { name: 'Arial', size: 12, bold: true, color: { argb: BRAND } }
  r1.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }
  r1.height = 22
  ws.mergeCells(2, 1, 2, cols)
  const r2 = ws.getRow(2)
  r2.getCell(1).value = title
  r2.getCell(1).font = { name: 'Arial', size: 16, bold: true, color: { argb: BRAND } }
  r2.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }
  r2.height = 28
  ws.mergeCells(3, 1, 3, cols)
  const r3 = ws.getRow(3)
  r3.getCell(1).value = sub
  r3.getCell(1).font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FF6B7280' } }
  r3.getCell(1).alignment = { horizontal: 'center', wrapText: true }
  r3.height = 30
}

function headerRow(ws: ExcelJSType.Worksheet, rowNo: number, headers: string[], widths: number[]) {
  headers.forEach((h, i) => {
    const c = ws.getRow(rowNo).getCell(i + 1)
    c.value = h
    c.font = { name: 'Arial', size: 10, bold: true, color: { argb: WHITE } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } }
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    c.border = thin()
  })
  ws.getRow(rowNo).height = 30
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = w })
}

function styleRow(row: ExcelJSType.Row, values: unknown[], zebra: boolean, moneyCols: number[], dateCols: number[] = []) {
  values.forEach((v, i) => {
    const c = row.getCell(i + 1)
    c.value = v as ExcelJSType.CellValue
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: zebra ? ZEBRA : WHITE } }
    c.border = thin()
    c.font = { name: 'Arial', size: 10 }
    c.alignment = { vertical: 'middle' }
  })
  moneyCols.forEach((i) => { row.getCell(i).numFmt = MONEY; row.getCell(i).alignment = { horizontal: 'right', vertical: 'middle' } })
  dateCols.forEach((i) => { row.getCell(i).numFmt = DATE; row.getCell(i).alignment = { horizontal: 'center', vertical: 'middle' } })
  row.height = 18
}

export async function exportArAgingExcel(opts: ArAgingExportOpts): Promise<void> {
  const { customers, scopeLabel } = opts
  const ExcelJS = (await import('exceljs')).default
  const { saveAs } = await import('file-saver')

  const wb = new ExcelJS.Workbook()
  wb.creator = 'Huy Anh ERP'
  wb.created = new Date()
  const now = new Date()
  const stamp = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  const sub = `${scopeLabel} · ${customers.length} khách · Xuất lúc ${stamp} · Đơn vị USD (đơn VNĐ: số quy đổi). `
    + 'Cột tuổi = số ngày KỂ TỪ NGÀY GIAO, không phải số ngày quá hạn thanh toán.'

  // ── Sheet 1: theo KHÁCH ──
  const COLS = 13
  const ws = wb.addWorksheet('Theo khách', {
    pageSetup: { paperSize: 9 as ExcelJSType.PaperSize, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  })
  titleBlock(ws, COLS, 'CÔNG NỢ KHÁCH HÀNG', sub)
  const HDR = 5
  headerRow(ws, HDR,
    ['STT', 'Khách hàng', 'Mã KH', 'Quốc gia', 'Số đơn', 'Tổng giá trị', 'Đã thu', 'Còn nợ',
      '0–30 ngày', '31–60 ngày', '61–90 ngày', '> 90 ngày', 'Chưa có mốc'],
    [5, 34, 16, 12, 8, 15, 14, 15, 13, 13, 13, 13, 13])
  customers.forEach((c, idx) => {
    const row = ws.getRow(HDR + 1 + idx)
    styleRow(row, [
      idx + 1, c.customer_name, c.customer_code, c.country ? countryLabel(c.country) : '', c.order_count,
      c.total_amount, c.paid_amount, c.outstanding,
      c.aging_0_30 || null, c.aging_31_60 || null, c.aging_61_90 || null, c.aging_90_plus || null, c.aging_no_anchor || null,
    ], idx % 2 === 1, [6, 7, 8, 9, 10, 11, 12, 13])
    row.getCell(8).font = { name: 'Arial', size: 10, bold: true, color: { argb: RED } }
  })
  // Dòng tổng = cộng đúng các dòng phía trên (cùng phép cộng trang dùng cho thẻ KPI)
  const sum = (f: (c: ArExportCustomer) => number) => customers.reduce((s, c) => s + (f(c) || 0), 0)
  const tot = ws.getRow(HDR + 1 + customers.length)
  ws.mergeCells(tot.number, 1, tot.number, 4)
  tot.getCell(1).value = `TỔNG (${customers.length} khách)`
  const totVals: Record<number, number> = {
    5: sum((c) => c.order_count),
    6: sum((c) => c.total_amount), 7: sum((c) => c.paid_amount), 8: sum((c) => c.outstanding),
    9: sum((c) => c.aging_0_30), 10: sum((c) => c.aging_31_60), 11: sum((c) => c.aging_61_90),
    12: sum((c) => c.aging_90_plus), 13: sum((c) => c.aging_no_anchor),
  }
  for (let i = 1; i <= COLS; i++) {
    const cell = tot.getCell(i)
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_LIGHT } }
    cell.border = thin()
    cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: i === 8 ? RED : BRAND } }
    if (totVals[i] != null) {
      cell.value = totVals[i]
      if (i >= 6) cell.numFmt = MONEY
      cell.alignment = { horizontal: 'right', vertical: 'middle' }
    } else if (i === 1) {
      cell.alignment = { horizontal: 'right', vertical: 'middle' }
    }
  }
  tot.height = 22
  ws.views = [{ state: 'frozen', xSplit: 2, ySplit: HDR }]
  ws.autoFilter = { from: { row: HDR, column: 1 }, to: { row: HDR, column: COLS } }

  // ── Sheet 2: theo ĐƠN ──
  const COLS2 = 9
  const ws2 = wb.addWorksheet('Theo đơn', {
    pageSetup: { paperSize: 9 as ExcelJSType.PaperSize, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  })
  titleBlock(ws2, COLS2, 'CÔNG NỢ THEO ĐƠN HÀNG', sub)
  headerRow(ws2, HDR,
    ['Khách hàng', 'Số HĐ', 'Mã đơn', 'Trạng thái', 'Tổng', 'Đã thu', 'Còn nợ', 'Mốc tuổi (ngày giao)', 'Tiền tệ khách'],
    [32, 16, 16, 15, 15, 14, 15, 14, 10])
  let r = HDR + 1
  customers.forEach((c) => {
    c.orders.slice().sort((a, b) => b.outstanding - a.outstanding).forEach((o) => {
      const row = ws2.getRow(r)
      styleRow(row, [
        c.customer_name, o.contractNo || o.code, o.code,
        ORDER_STATUS_LABELS[o.status as SalesOrderStatus] || o.status,
        o.total, o.paid, o.outstanding, toDate(o.delivery_date), c.currency,
      ], (r - HDR) % 2 === 0, [5, 6, 7], [8])
      row.getCell(7).font = { name: 'Arial', size: 10, bold: true, color: { argb: RED } }
      r++
    })
  })
  ws2.views = [{ state: 'frozen', xSplit: 2, ySplit: HDR }]
  ws2.autoFilter = { from: { row: HDR, column: 1 }, to: { row: HDR, column: COLS2 } }

  const buf = await wb.xlsx.writeBuffer()
  const fname = `Cong_no_khach_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}.xlsx`
  saveAs(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), fname)
}
