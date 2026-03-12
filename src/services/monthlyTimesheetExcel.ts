// ============================================================================
// MONTHLY TIMESHEET EXCEL EXPORT V2 — Professional Format
// File: src/services/monthlyTimesheetExcel.ts
// ============================================================================
// Dùng ExcelJS — full styling: màu nền, border, font, merge, print setup
// npm install exceljs file-saver
// npm install -D @types/file-saver
// ============================================================================

import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'
import type { MonthlyTimesheetData } from './monthlyTimesheetService'

// ============================================================================
// CONSTANTS
// ============================================================================

const MONTHS_VN = [
  '', 'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
  'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12',
]
const WEEKDAY_SHORT = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']

// Colors
const BRAND_GREEN = '1B4D3E'
const BRAND_GREEN_LIGHT = '2D8B6E'
const WHITE = 'FFFFFF'
const GRAY_BG = 'F3F4F6'
const GRAY_BORDER = 'D1D5DB'

// Symbol → fill color
const SYMBOL_FILL: Record<string, string> = {
  'S': 'DBEAFE', 'Đ': 'EDE9FE', 'C2': 'D1FAE5',
  'HC': 'F3F4F6', 'P': 'FFEDD5', 'X': 'FEE2E2',
}
const SYMBOL_FONT: Record<string, string> = {
  'S': '1D4ED8', 'Đ': '6D28D9', 'C2': '047857',
  'HC': '4B5563', 'P': 'EA580C', 'X': 'DC2626',
}

// Border style
const thinBorder: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: GRAY_BORDER } },
  left: { style: 'thin', color: { argb: GRAY_BORDER } },
  bottom: { style: 'thin', color: { argb: GRAY_BORDER } },
  right: { style: 'thin', color: { argb: GRAY_BORDER } },
}

// ============================================================================
// EXPORT FUNCTION
// ============================================================================

export async function exportMonthlyTimesheetExcel(data: MonthlyTimesheetData): Promise<void> {
  const { month, year, daysInMonth, employees, departmentName } = data
  const totalCols = 3 + daysInMonth + 7

  const wb = new ExcelJS.Workbook()
  wb.creator = 'Huy Anh ERP'
  wb.created = new Date()

  const ws = wb.addWorksheet(`T${month}-${year}`, {
    pageSetup: {
      paperSize: 8 as ExcelJS.PaperSize, // A3
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.25, right: 0.25, top: 0.3, bottom: 0.3, header: 0.15, footer: 0.15 },
    },
  })

  // ── Column widths ──
  ws.getColumn(1).width = 5    // STT
  ws.getColumn(2).width = 22   // Họ tên
  ws.getColumn(3).width = 13   // Mã NV
  for (let d = 1; d <= daysInMonth; d++) ws.getColumn(3 + d).width = 4.5
  const sumStart = 3 + daysInMonth + 1
  const sumWidths = [5.5, 5.5, 4.5, 5.5, 4.5, 5.5, 5.5]
  sumWidths.forEach((w, i) => { ws.getColumn(sumStart + i).width = w })

  // ══════════════════════════════════════════════════
  // ROW 1: Company name
  // ══════════════════════════════════════════════════
  ws.mergeCells(1, 1, 1, totalCols)
  const r1 = ws.getRow(1)
  r1.getCell(1).value = 'CÔNG TY TNHH MTV CAO SU HUY ANH PHONG ĐIỀN'
  r1.getCell(1).font = { name: 'Arial', size: 11, bold: true, color: { argb: BRAND_GREEN } }
  r1.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }
  r1.height = 22

  // ROW 2: empty
  ws.getRow(2).height = 6

  // ROW 3: Title
  ws.mergeCells(3, 1, 3, totalCols)
  const r3 = ws.getRow(3)
  r3.getCell(1).value = `BẢNG CHẤM CÔNG ${MONTHS_VN[month].toUpperCase()} ${year}`
  r3.getCell(1).font = { name: 'Arial', size: 14, bold: true, color: { argb: BRAND_GREEN } }
  r3.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }
  r3.height = 28

  // ROW 4: Department
  ws.mergeCells(4, 1, 4, totalCols)
  const r4 = ws.getRow(4)
  r4.getCell(1).value = `Phòng ban: ${departmentName}`
  r4.getCell(1).font = { name: 'Arial', size: 10, italic: true, color: { argb: '6B7280' } }
  r4.getCell(1).alignment = { horizontal: 'center' }
  r4.height = 18

  // ROW 5: empty
  ws.getRow(5).height = 4

  // ══════════════════════════════════════════════════
  // ROW 6-7: HEADER (2 rows)
  // ══════════════════════════════════════════════════
  const hdrRow1 = 6
  const hdrRow2 = 7

  // Merge STT, Họ tên, Mã NV across 2 rows
  ws.mergeCells(hdrRow1, 1, hdrRow2, 1) // STT
  ws.mergeCells(hdrRow1, 2, hdrRow2, 2) // Họ tên
  ws.mergeCells(hdrRow1, 3, hdrRow2, 3) // Mã NV

  // Header style function
  const styleHeaderCell = (row: number, col: number, value: string, isWeekend = false) => {
    const cell = ws.getRow(row).getCell(col)
    cell.value = value
    cell.font = { name: 'Arial', size: 8, bold: true, color: { argb: WHITE } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isWeekend ? 'B91C1C' : BRAND_GREEN } }
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    cell.border = thinBorder
  }

  // Fixed headers
  styleHeaderCell(hdrRow1, 1, 'STT')
  styleHeaderCell(hdrRow1, 2, 'Họ và tên')
  styleHeaderCell(hdrRow1, 3, 'Mã NV')

  // Day headers
  for (let d = 1; d <= daysInMonth; d++) {
    const dt = new Date(year, month - 1, d)
    const isWeekend = dt.getDay() === 0
    const col = 3 + d
    styleHeaderCell(hdrRow1, col, String(d).padStart(2, '0'), isWeekend)
    styleHeaderCell(hdrRow2, col, WEEKDAY_SHORT[dt.getDay()], isWeekend)
  }

  // Summary headers (merge 2 rows each)
  const sumLabels = ['Công', 'Giờ', 'Trễ', 'V.Sớm', 'OT', 'Vắng', 'Phép']
  sumLabels.forEach((label, i) => {
    const col = sumStart + i
    ws.mergeCells(hdrRow1, col, hdrRow2, col)
    const cell = ws.getRow(hdrRow1).getCell(col)
    cell.value = label
    cell.font = { name: 'Arial', size: 8, bold: true, color: { argb: WHITE } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '163D32' } }
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    cell.border = thinBorder
  })

  ws.getRow(hdrRow1).height = 22
  ws.getRow(hdrRow2).height = 16

  // ══════════════════════════════════════════════════
  // DATA ROWS
  // ══════════════════════════════════════════════════
  const dataStartRow = 8

  employees.forEach((emp, idx) => {
    const rowNum = dataStartRow + idx
    const row = ws.getRow(rowNum)
    const isEvenRow = idx % 2 === 0
    const rowBg = isEvenRow ? WHITE : 'F9FAFB'

    row.height = 20

    // STT
    const cSTT = row.getCell(1)
    cSTT.value = idx + 1
    cSTT.font = { name: 'Arial', size: 9, color: { argb: '9CA3AF' } }
    cSTT.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } }
    cSTT.alignment = { horizontal: 'center', vertical: 'middle' }
    cSTT.border = thinBorder

    // Họ tên
    const cName = row.getCell(2)
    cName.value = emp.fullName
    cName.font = { name: 'Arial', size: 9, bold: true }
    cName.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } }
    cName.alignment = { horizontal: 'left', vertical: 'middle' }
    cName.border = thinBorder

    // Mã NV
    const cCode = row.getCell(3)
    cCode.value = emp.employeeCode
    cCode.font = { name: 'Arial', size: 8, color: { argb: '6B7280' } }
    cCode.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } }
    cCode.alignment = { horizontal: 'center', vertical: 'middle' }
    cCode.border = thinBorder

    // Day cells
    emp.days.forEach((day, di) => {
      const col = 4 + di
      const cell = row.getCell(col)
      const sym = day.symbol === '—' ? '' : day.symbol
      cell.value = sym

      const fillColor = SYMBOL_FILL[day.symbol] || rowBg
      const fontColor = SYMBOL_FONT[day.symbol] || '374151'

      cell.font = { name: 'Arial', size: 8, bold: !!sym, color: { argb: fontColor } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: sym ? fillColor : rowBg } }
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
      cell.border = thinBorder
    })

    // Summary cells
    const summaryValues = [
      { val: emp.totalWorkDays, color: '1D4ED8', bold: true },
      { val: emp.totalWorkingHours, color: '374151', bold: false },
      { val: emp.totalLateDays || '', color: 'D97706', bold: true },
      { val: emp.totalEarlyDays || '', color: '7C3AED', bold: true },
      { val: emp.totalOvertimeHours || '', color: 'DC2626', bold: true },
      { val: emp.totalAbsentDays || '', color: 'DC2626', bold: true },
      { val: emp.totalLeaveDays || '', color: 'EA580C', bold: false },
    ]

    summaryValues.forEach((sv, i) => {
      const cell = row.getCell(sumStart + i)
      cell.value = sv.val
      cell.font = { name: 'Arial', size: 9, bold: sv.bold, color: { argb: sv.color } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } }
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
      cell.border = thinBorder
    })
  })

  // ══════════════════════════════════════════════════
  // TOTALS ROW
  // ══════════════════════════════════════════════════
  const totRowNum = dataStartRow + employees.length
  const totRow = ws.getRow(totRowNum)
  totRow.height = 22

  // Merge STT cell
  const cTotSTT = totRow.getCell(1)
  cTotSTT.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'ECFDF5' } }
  cTotSTT.border = thinBorder

  const cTotName = totRow.getCell(2)
  cTotName.value = 'TỔNG CỘNG'
  cTotName.font = { name: 'Arial', size: 9, bold: true, color: { argb: BRAND_GREEN } }
  cTotName.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'ECFDF5' } }
  cTotName.alignment = { horizontal: 'left', vertical: 'middle' }
  cTotName.border = thinBorder

  const cTotCode = totRow.getCell(3)
  cTotCode.value = `${employees.length} NV`
  cTotCode.font = { name: 'Arial', size: 8, color: { argb: '6B7280' } }
  cTotCode.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'ECFDF5' } }
  cTotCode.alignment = { horizontal: 'center', vertical: 'middle' }
  cTotCode.border = thinBorder

  // Empty day cells in total row
  for (let d = 1; d <= daysInMonth; d++) {
    const cell = totRow.getCell(3 + d)
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'ECFDF5' } }
    cell.border = thinBorder
  }

  // Summary totals
  const totals = [
    employees.reduce((s, e) => s + e.totalWorkDays, 0),
    Math.round(employees.reduce((s, e) => s + e.totalWorkingHours, 0) * 10) / 10,
    employees.reduce((s, e) => s + e.totalLateDays, 0) || '',
    employees.reduce((s, e) => s + e.totalEarlyDays, 0) || '',
    Math.round(employees.reduce((s, e) => s + e.totalOvertimeHours, 0) * 10) / 10 || '',
    employees.reduce((s, e) => s + e.totalAbsentDays, 0) || '',
    employees.reduce((s, e) => s + e.totalLeaveDays, 0) || '',
  ]
  const totColors = ['1D4ED8', '374151', 'D97706', '7C3AED', 'DC2626', 'DC2626', 'EA580C']

  totals.forEach((val, i) => {
    const cell = totRow.getCell(sumStart + i)
    cell.value = val
    cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: totColors[i] } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'ECFDF5' } }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    cell.border = thinBorder
  })

  // ══════════════════════════════════════════════════
  // SIGNATURE AREA
  // ══════════════════════════════════════════════════
  const sigRow = totRowNum + 3
  const sigStyle: Partial<ExcelJS.Style> = {
    font: { name: 'Arial', size: 9, italic: true, color: { argb: '6B7280' } },
    alignment: { horizontal: 'center' },
  }

  // Distribute 3 signatures across columns
  const sig1Col = 2
  const sig2Col = Math.floor(totalCols / 2)
  const sig3Col = totalCols - 2

  ws.getRow(sigRow).getCell(sig1Col).value = 'Người lập'
  ws.getRow(sigRow).getCell(sig1Col).style = sigStyle
  ws.getRow(sigRow).getCell(sig2Col).value = 'Trưởng phòng'
  ws.getRow(sigRow).getCell(sig2Col).style = sigStyle
  ws.getRow(sigRow).getCell(sig3Col).value = 'Giám đốc'
  ws.getRow(sigRow).getCell(sig3Col).style = sigStyle

  // Signature lines (empty row below for signing)
  const sigLineRow = sigRow + 3
  ws.getRow(sigLineRow).getCell(sig1Col).value = '........................'
  ws.getRow(sigLineRow).getCell(sig1Col).style = sigStyle
  ws.getRow(sigLineRow).getCell(sig2Col).value = '........................'
  ws.getRow(sigLineRow).getCell(sig2Col).style = sigStyle
  ws.getRow(sigLineRow).getCell(sig3Col).value = '........................'
  ws.getRow(sigLineRow).getCell(sig3Col).style = sigStyle

  // ══════════════════════════════════════════════════
  // LEGEND SHEET
  // ══════════════════════════════════════════════════
  const wsL = wb.addWorksheet('Chú thích')
  wsL.getColumn(1).width = 10
  wsL.getColumn(2).width = 30
  wsL.getColumn(3).width = 50

  const legendData = [
    ['Ký hiệu', 'Ý nghĩa', 'Ca tương ứng'],
    ['S', 'Ca sáng / Ca ngày', 'SHORT_1 (06-14h), LONG_DAY (06-18h)'],
    ['Đ', 'Ca đêm', 'SHORT_3 (22-06h), LONG_NIGHT (18-06h)'],
    ['C2', 'Ca chiều', 'SHORT_2 (14-22h)'],
    ['HC', 'Hành chính', 'ADMIN_PROD (07-17h), ADMIN_OFFICE (08-17h)'],
    ['P', 'Nghỉ phép', 'Đã được duyệt'],
    ['X', 'Vắng không phép', ''],
  ]

  legendData.forEach((rowData, ri) => {
    const row = wsL.getRow(ri + 1)
    rowData.forEach((val, ci) => {
      const cell = row.getCell(ci + 1)
      cell.value = val
      if (ri === 0) {
        cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: WHITE } }
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_GREEN } }
      } else {
        cell.font = { name: 'Arial', size: 9 }
        // Color the symbol cell
        if (ci === 0 && SYMBOL_FILL[val as string]) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SYMBOL_FILL[val as string] } }
          cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: SYMBOL_FONT[val as string] } }
        }
      }
      cell.alignment = { horizontal: ci === 0 ? 'center' : 'left', vertical: 'middle' }
      cell.border = thinBorder
    })
  })

  // ── Download ──
  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const fileName = `Bang_Cham_Cong_T${month}_${year}_${departmentName.replace(/\s+/g, '_')}.xlsx`
  saveAs(blob, fileName)
}