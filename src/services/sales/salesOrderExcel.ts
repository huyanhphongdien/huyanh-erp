// ============================================================================
// EXPORT EXCEL — ĐƠN HÀNG BÁN (định dạng chuyên nghiệp)
// File: src/services/sales/salesOrderExcel.ts
// ----------------------------------------------------------------------------
// Tách riêng khỏi page (giống monthlyTimesheetExcel.ts) + tái dùng ĐÚNG 2 helper
// deliveredTons()/remainingTons() của dispatchService → số trong file Excel KHÔNG
// THỂ lệch số trên màn hình (cùng một công thức duy nhất).
// ============================================================================

import type ExcelJSType from 'exceljs'
import { deliveredTons, remainingTons, type LotProgress } from '../logistics/dispatchService'
import { ORDER_STATUS_LABELS, soDisplayCode, type SalesOrder } from './salesTypes'

const BRAND = 'FF1B4D3E'
const BRAND_LIGHT = 'FFECFDF5'
const WHITE = 'FFFFFFFF'
const ZEBRA = 'FFF9FAFB'
const BORDER = 'FFE5E7EB'
const RED = 'FFDC2626'
const GREEN = 'FF15803D'

const NUM = '#,##0.00'
const MONEY = '#,##0.00'
const DATE = 'dd/mm/yyyy'

/** Trạng thái coi như đã xong — tô nhạt để phân biệt đơn đang chạy. */
const DONE_STATUSES = new Set(['delivered', 'invoiced', 'paid'])

export interface SalesOrderExportOpts {
  orders: SalesOrder[]
  lotProgress: Record<string, LotProgress>
  /** Mô tả bộ lọc đang áp (in lên đầu file để biết đây là báo cáo gì). */
  filterDesc: string
  /** Nhãn nguồn dữ liệu: "Đơn đã chọn" hoặc "Tất cả theo bộ lọc". */
  scopeLabel: string
}

const thin = (): Partial<ExcelJSType.Borders> => ({
  top: { style: 'thin', color: { argb: BORDER } },
  left: { style: 'thin', color: { argb: BORDER } },
  bottom: { style: 'thin', color: { argb: BORDER } },
  right: { style: 'thin', color: { argb: BORDER } },
})

const toDate = (v: any): Date | null => {
  if (!v) return null
  const d = new Date(v)
  return isNaN(d.getTime()) ? null : d
}

export async function exportSalesOrdersExcel(opts: SalesOrderExportOpts): Promise<void> {
  const { orders, lotProgress, filterDesc, scopeLabel } = opts
  const ExcelJS = (await import('exceljs')).default
  const { saveAs } = await import('file-saver')

  const wb = new ExcelJS.Workbook()
  wb.creator = 'Huy Anh ERP'
  wb.created = new Date()

  const COLS = 21
  const ws = wb.addWorksheet('Đơn hàng bán', {
    pageSetup: {
      paperSize: 8 as ExcelJSType.PaperSize, // A3
      orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      margins: { left: 0.2, right: 0.2, top: 0.3, bottom: 0.3, header: 0.15, footer: 0.15 },
    },
  })

  // ── Khối tiêu đề: biết ngay đây là báo cáo gì, lọc gì, xuất lúc nào ──
  ws.mergeCells(1, 1, 1, COLS)
  const r1 = ws.getRow(1)
  r1.getCell(1).value = 'CÔNG TY TNHH MTV CAO SU HUY ANH PHONG ĐIỀN'
  r1.getCell(1).font = { name: 'Arial', size: 12, bold: true, color: { argb: BRAND } }
  r1.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }
  r1.height = 22

  ws.mergeCells(2, 1, 2, COLS)
  const r2 = ws.getRow(2)
  r2.getCell(1).value = 'DANH SÁCH ĐƠN HÀNG BÁN'
  r2.getCell(1).font = { name: 'Arial', size: 17, bold: true, color: { argb: BRAND } }
  r2.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }
  r2.height = 30

  ws.mergeCells(3, 1, 3, COLS)
  const now = new Date()
  const stamp = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  const r3 = ws.getRow(3)
  r3.getCell(1).value = `${scopeLabel} · ${orders.length} đơn · Bộ lọc: ${filterDesc || 'Không lọc'} · Xuất lúc ${stamp}`
  r3.getCell(1).font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FF6B7280' } }
  r3.getCell(1).alignment = { horizontal: 'center' }
  r3.height = 18
  ws.getRow(4).height = 5

  // ── Header ──
  const HDR = 5
  const headers = [
    'STT', 'Số HĐ', 'Khách hàng', 'Loại hàng', 'Số LOT',
    'SL (tấn)', 'Đã giao (T)', 'Còn thiếu (T)',
    'Đơn giá USD', 'Thành tiền USD', 'Đặt cọc', 'CK', 'NH CK', 'Còn lại (USD)',
    'Hạn giao', 'Sẵn hàng', 'Ngân hàng', 'Số BKG', 'ETD', 'Tiền về', 'Trạng thái',
  ]
  headers.forEach((h, i) => {
    const c = ws.getRow(HDR).getCell(i + 1)
    c.value = h
    c.font = { name: 'Arial', size: 10, bold: true, color: { argb: WHITE } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } }
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    c.border = thin()
  })
  ws.getRow(HDR).height = 26

  const widths = [5, 14, 30, 12, 12, 10, 11, 12, 11, 14, 12, 10, 12, 14, 11, 11, 15, 14, 11, 11, 13]
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = w })

  // ── Dòng dữ liệu ──
  let estimatedAny = false
  orders.forEach((o, idx) => {
    const p = lotProgress[o.id]
    const cancelled = o.status === 'cancelled'
    const d = cancelled ? { tons: 0, estimated: false } : deliveredTons(o.quantity_tons, p, o.status)
    const rem = cancelled ? 0 : remainingTons(o.quantity_tons, p, o.status)
    if (d.estimated) estimatedAny = true

    const row = ws.getRow(HDR + 1 + idx)
    const bg = idx % 2 === 1 ? ZEBRA : WHITE
    const vals: any[] = [
      idx + 1,
      soDisplayCode(o),
      (o as any).customer?.name || '',
      o.grade || '',
      o.customer_po || '',
      o.quantity_tons ?? null,
      cancelled ? null : (d.tons || null),
      cancelled ? null : rem,
      o.unit_price ?? null,
      o.total_value_usd ?? null,
      (o as any).deposit_amount ?? null,
      (o as any).discount_amount ?? null,
      (o as any).discount_bank || '',
      // Giữ ĐÚNG công thức của màn hình (total − cọc − CK), không thêm bank_charges.
      (o as any).remaining_amount ??
        ((o.total_value_usd || 0) - ((o as any).deposit_amount || 0) - ((o as any).discount_amount || 0)),
      toDate(o.delivery_date),
      toDate((o as any).ready_date),
      (o as any).bank_name || '',
      (o as any).booking_reference || '',
      toDate(o.etd),
      toDate((o as any).payment_received_date),
      ORDER_STATUS_LABELS[o.status as keyof typeof ORDER_STATUS_LABELS] || o.status,
    ]
    vals.forEach((v, i) => {
      const c = row.getCell(i + 1)
      c.value = v
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }
      c.border = thin()
      c.font = { name: 'Arial', size: 10 }
      c.alignment = { vertical: 'middle' }
    })
    // Định dạng số / ngày
    ;[6, 7, 8].forEach((i) => { row.getCell(i).numFmt = NUM; row.getCell(i).alignment = { horizontal: 'right', vertical: 'middle' } })
    ;[9, 10, 11, 12, 14].forEach((i) => { row.getCell(i).numFmt = MONEY; row.getCell(i).alignment = { horizontal: 'right', vertical: 'middle' } })
    ;[15, 16, 19, 20].forEach((i) => { row.getCell(i).numFmt = DATE; row.getCell(i).alignment = { horizontal: 'center', vertical: 'middle' } })
    // Còn thiếu > 0 → đỏ đậm (đây là số khách nhìn); = 0 → xanh
    const cRem = row.getCell(8)
    cRem.font = { name: 'Arial', size: 10, bold: true, color: { argb: rem > 0 ? RED : GREEN } }
    if (cancelled) {
      row.getCell(21).font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FF9CA3AF' } }
    } else if (DONE_STATUSES.has(o.status)) {
      row.getCell(21).font = { name: 'Arial', size: 10, color: { argb: GREEN } }
    }
    row.height = 18
  })

  // ── DÒNG TỔNG — LOẠI đơn hủy, khớp đúng banner trên màn hình ──
  const live = orders.filter((o) => o.status !== 'cancelled')
  const sum = (f: (o: SalesOrder) => number) => live.reduce((s, o) => s + (f(o) || 0), 0)
  const totRow = ws.getRow(HDR + 1 + orders.length)
  ws.mergeCells(totRow.number, 1, totRow.number, 5)
  const tc = totRow.getCell(1)
  tc.value = `TỔNG (${live.length} đơn — không tính đơn đã hủy)`
  tc.font = { name: 'Arial', size: 11, bold: true, color: { argb: BRAND } }
  tc.alignment = { horizontal: 'right', vertical: 'middle' }

  const totals: Record<number, number> = {
    6: sum((o) => o.quantity_tons || 0),
    7: sum((o) => deliveredTons(o.quantity_tons, lotProgress[o.id], o.status).tons),
    8: sum((o) => remainingTons(o.quantity_tons, lotProgress[o.id], o.status)),
    10: sum((o) => o.total_value_usd || 0),
  }
  for (let i = 1; i <= COLS; i++) {
    const c = totRow.getCell(i)
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_LIGHT } }
    c.border = thin()
    if (totals[i] != null) {
      c.value = totals[i]
      c.numFmt = i === 10 ? MONEY : NUM
      c.font = { name: 'Arial', size: 11, bold: true, color: { argb: i === 8 ? RED : BRAND } }
      c.alignment = { horizontal: 'right', vertical: 'middle' }
    }
  }
  totRow.height = 22

  // Freeze header + AutoFilter (cuộn không mất tiêu đề, lọc ngay trong Excel)
  ws.views = [{ state: 'frozen', xSplit: 2, ySplit: HDR }]
  ws.autoFilter = { from: { row: HDR, column: 1 }, to: { row: HDR, column: COLS } }

  // ── Sheet Chú thích ──
  const wsN = wb.addWorksheet('Chú thích')
  wsN.getColumn(1).width = 22
  wsN.getColumn(2).width = 95
  const notes: [string, string][] = [
    ['Mục', 'Ý nghĩa'],
    ['Đã giao (T)', 'KL hàng trong container đã giao (net). KHÔNG phải số cân xe — số cân gồm cả pallet/bao bì.'],
    ['Còn thiếu (T)', 'SL hợp đồng − Đã giao. Đơn đã giao xong (delivered/shipped/invoiced/paid) hoặc đã giao hết container → 0.'],
    ['Đơn đã hủy', 'Vẫn liệt kê nhưng KHÔNG tính vào dòng TỔNG (hủy không phải nợ hàng).'],
    ['Bộ lọc Grade', 'Lọc theo Grade ở cấp ĐƠN; SL là tấn CẢ ĐƠN → đơn có nhiều loại hàng sẽ gồm cả tấn loại khác.'],
    ['Hàng thương mại', 'Bốc ở nhà máy ngoài, không qua trạm cân → phải bấm "Đánh dấu ĐÃ GIAO (bốc ngoài)" ở Lệnh điều động thì mới trừ vào Còn thiếu.'],
  ]
  if (estimatedAny) {
    notes.push(['~ (ước lượng)', 'Có container đã giao nhưng chưa nhập KL → Đã giao được ước lượng theo KL trung bình các container đã có KL.'])
  }
  notes.forEach(([a, b], i) => {
    const r = wsN.getRow(i + 1)
    r.getCell(1).value = a
    r.getCell(2).value = b
    const isHdr = i === 0
    ;[1, 2].forEach((ci) => {
      const c = r.getCell(ci)
      c.font = { name: 'Arial', size: isHdr ? 10 : 9, bold: isHdr, color: { argb: isHdr ? WHITE : 'FF374151' } }
      if (isHdr) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } }
      c.alignment = { vertical: 'middle', wrapText: ci === 2 }
      c.border = thin()
    })
  })

  const buf = await wb.xlsx.writeBuffer()
  const fname = `Don_hang_ban_${orders.length}don_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}.xlsx`
  saveAs(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), fname)
  return
}
