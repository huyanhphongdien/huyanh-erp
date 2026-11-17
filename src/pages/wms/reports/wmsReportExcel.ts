// ============================================================================
// wmsReportExcel — exporter Excel dùng chung cho các trang Báo cáo WMS.
// Chép đúng pattern handleExport của src/components/common/AdvancedDataTable.tsx
// (sổ phiếu nhập/chuyển kho đang xuất được): dòng tiêu đề gộp ô, header xanh đậm,
// cột số numFmt, dòng TỔNG, autoFilter + auto width, tên file kèm ngày giờ.
// (reportExportUtils.ts typed cứng cho báo cáo công việc nên không dùng lại được.)
// File: src/pages/wms/reports/wmsReportExcel.ts (Đợt 2 audit UI 17/11/2026)
// ============================================================================

import dayjs from 'dayjs'

export interface CotExcel {
  title: string
  /** 'sum' → cột được cộng vào dòng TỔNG (chỉ tác dụng với cột toàn số) */
  summary?: 'sum'
  /** numFmt ExcelJS cho cột số, mặc định '#,##0.##' */
  numFmt?: string
  align?: 'left' | 'right' | 'center'
}

export interface SheetExcel {
  /** Tên sheet (≤31 ký tự) */
  name: string
  /** Dòng tiêu đề gộp ô ở row 1 (kèm số dòng + thời điểm xuất tự động) */
  title: string
  columns: CotExcel[]
  rows: (string | number | null | undefined)[][]
}

const DARK = 'FF1B4D3E'

/** Xuất 1 file .xlsx gồm 1+ sheet; tải về `<fileName>_<YYYYMMDD_HHmm>.xlsx`. */
export async function xuatExcelBaoCao(fileName: string, sheets: SheetExcel[]): Promise<void> {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Huy Anh ERP'

  for (const sheet of sheets) {
    // Freeze title (row 1) + header (row 2)
    const ws = wb.addWorksheet(sheet.name, { views: [{ state: 'frozen', ySplit: 2 }] })
    const colCount = sheet.columns.length
    const exportRows = sheet.rows.map(r => r.map(v => (v == null ? '' : v)))

    // Cột số = có ít nhất 1 number và mọi giá trị non-empty đều là number
    const isNumeric = sheet.columns.map((_, i) =>
      exportRows.some(r => typeof r[i] === 'number') &&
      exportRows.every(r => r[i] === '' || typeof r[i] === 'number'),
    )
    const numFmtFor = (i: number) => sheet.columns[i]?.numFmt || '#,##0.##'

    // ── Row 1: Tiêu đề + meta (gộp ô) ──
    ws.addRow([`${sheet.title} — ${exportRows.length} dòng · ${dayjs().format('DD/MM/YYYY HH:mm')}`])
    ws.mergeCells(1, 1, 1, Math.max(colCount, 1))
    const titleCell = ws.getCell(1, 1)
    titleCell.font = { bold: true, size: 13, color: { argb: DARK } }
    titleCell.alignment = { horizontal: 'left', vertical: 'middle' }
    ws.getRow(1).height = 22

    // ── Row 2: Header ──
    const headerRow = ws.addRow(sheet.columns.map(c => c.title))
    headerRow.height = 18
    headerRow.eachCell((cell, col) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DARK } }
      cell.alignment = { horizontal: sheet.columns[col - 1]?.align || 'center', vertical: 'middle', wrapText: true }
      cell.border = { bottom: { style: 'thin', color: { argb: 'FF14402F' } } }
    })

    // ── Data rows ──
    exportRows.forEach((vals, idx) => {
      const r = ws.addRow(vals)
      r.eachCell((cell, col) => {
        const c = sheet.columns[col - 1]
        if (isNumeric[col - 1]) {
          cell.numFmt = numFmtFor(col - 1)
          cell.alignment = { horizontal: 'right' }
        } else if (c?.align) {
          cell.alignment = { horizontal: c.align }
        }
        if (idx % 2 === 1) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F7F5' } }
        }
        cell.border = { bottom: { style: 'hair', color: { argb: 'FFE6E6E6' } } }
      })
    })

    // ── Dòng TỔNG (nếu có cột summary) ──
    const hasSummary = sheet.columns.some(c => c.summary)
    if (hasSummary && exportRows.length > 0) {
      const totalVals: (string | number)[] = sheet.columns.map((c, i) => {
        if (c.summary !== 'sum' || !isNumeric[i]) return ''
        const nums = exportRows.map(r => r[i]).filter((v): v is number => typeof v === 'number')
        return nums.length ? nums.reduce((a, b) => a + b, 0) : ''
      })
      // Nhãn "TỔNG" đặt ở cột đầu tiên không phải summary
      const labelIdx = sheet.columns.findIndex(c => !c.summary)
      if (labelIdx >= 0 && totalVals[labelIdx] === '') totalVals[labelIdx] = `TỔNG (${exportRows.length} dòng)`
      const totalRow = ws.addRow(totalVals)
      totalRow.eachCell((cell, col) => {
        cell.font = { bold: true, color: { argb: DARK } }
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCEAE3' } }
        cell.border = { top: { style: 'double', color: { argb: DARK } } }
        if (isNumeric[col - 1]) {
          cell.numFmt = numFmtFor(col - 1)
          cell.alignment = { horizontal: 'right' }
        }
      })
    }

    // ── AutoFilter trên header (row 2) ──
    ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: colCount } }

    // ── Auto-width (cân nhắc cả số đã format dấu phẩy) ──
    ws.columns.forEach((col, i) => {
      const lens = exportRows.map(r => {
        const v = r[i]
        return typeof v === 'number' ? Math.round(v).toLocaleString('vi-VN').length : String(v ?? '').length
      })
      const maxLen = Math.max(sheet.columns[i]?.title?.length || 10, ...lens, 0)
      col.width = Math.min(42, Math.max(12, maxLen + 2))
    })
  }

  // Download
  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${fileName}_${dayjs().format('YYYYMMDD_HHmm')}.xlsx`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
