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
import type { MonthlyTimesheetData, EmployeeMonthlySummary } from './monthlyTimesheetService'

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

// Symbol có nghĩa "đi làm thật" — dùng để check NV làm việc vào ngày lễ
const WORKING_SYMBOLS = new Set(['S', 'Đ', 'C2', 'HC', 'CT', '2ca'])

// Symbol → fill color
const SYMBOL_FILL: Record<string, string> = {
  'S': 'DBEAFE', 'Đ': 'EDE9FE', 'C2': 'D1FAE5',
  'HC': 'F3F4F6', 'P': 'FFEDD5', 'CT': 'E0F2FE', '2ca': 'FEF3C7',
  'L': 'FDE68A',  // vàng đậm — Nghỉ lễ
  'X': 'FEE2E2',
}
const SYMBOL_FONT: Record<string, string> = {
  'S': '1D4ED8', 'Đ': '6D28D9', 'C2': '047857',
  'HC': '4B5563', 'P': 'EA580C', 'CT': '0369A1', '2ca': 'B45309',
  'L': '92400E',  // amber-800
  'X': 'DC2626',
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
  // 3 cột đầu (STT/Họ tên/Mã NV) + ngày trong tháng + 8 cột tổng (Công/Giờ/Trễ/V.Sớm/OT/Vắng/Phép/Lễ) + 1 cột "Ký xác nhận"
  const totalCols = 3 + daysInMonth + 8 + 1
  const confirmCol = totalCols // cột cuối cùng = ký xác nhận

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
      horizontalCentered: true,  // căn giữa nội dung khi in
      margins: { left: 0.2, right: 0.2, top: 0.3, bottom: 0.3, header: 0.15, footer: 0.15 },
    },
  })

  // ── Column widths ──
  // Tinh chỉnh để tổng width vừa khít A3 ngang (~407mm in được sau margin) → fitToWidth không cần co.
  // STT 4 + Họ tên 24 + Mã NV 11 + 31 ngày × 4.0 = 124 + 8 cột tổng (~40) + ký 18 = ~221 units (~16")
  ws.getColumn(1).width = 4    // STT
  ws.getColumn(2).width = 24   // Họ tên
  ws.getColumn(3).width = 11   // Mã NV
  for (let d = 1; d <= daysInMonth; d++) ws.getColumn(3 + d).width = 4.0
  const sumStart = 3 + daysInMonth + 1
  // Width cho 8 cột tổng: Công, Giờ, Trễ, V.Sớm, OT, Vắng, Phép, Lễ
  const sumWidths = [6, 6, 5, 6, 5, 5, 5, 5]
  sumWidths.forEach((w, i) => { ws.getColumn(sumStart + i).width = w })
  ws.getColumn(confirmCol).width = 18  // Ký xác nhận — đủ chỗ ký tay

  // ══════════════════════════════════════════════════
  // ROW 1: Company name
  // ══════════════════════════════════════════════════
  ws.mergeCells(1, 1, 1, totalCols)
  const r1 = ws.getRow(1)
  r1.getCell(1).value = 'CÔNG TY TNHH MTV CAO SU HUY ANH PHONG ĐIỀN'
  r1.getCell(1).font = { name: 'Arial', size: 13, bold: true, color: { argb: BRAND_GREEN } }
  r1.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }
  r1.height = 26

  // ROW 2: empty
  ws.getRow(2).height = 6

  // ROW 3: Title
  ws.mergeCells(3, 1, 3, totalCols)
  const r3 = ws.getRow(3)
  r3.getCell(1).value = `BẢNG CHẤM CÔNG ${MONTHS_VN[month].toUpperCase()} ${year}`
  r3.getCell(1).font = { name: 'Arial', size: 18, bold: true, color: { argb: BRAND_GREEN } }
  r3.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }
  r3.height = 34

  // ROW 4: Department
  ws.mergeCells(4, 1, 4, totalCols)
  const r4 = ws.getRow(4)
  r4.getCell(1).value = `Phòng ban: ${departmentName}`
  r4.getCell(1).font = { name: 'Arial', size: 12, italic: true, color: { argb: '6B7280' } }
  r4.getCell(1).alignment = { horizontal: 'center' }
  r4.height = 22

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
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: WHITE } }
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
  const sumLabels = ['Công', 'Giờ', 'Trễ', 'V.Sớm', 'OT', 'Vắng', 'Phép', 'Lễ']
  sumLabels.forEach((label, i) => {
    const col = sumStart + i
    ws.mergeCells(hdrRow1, col, hdrRow2, col)
    const cell = ws.getRow(hdrRow1).getCell(col)
    cell.value = label
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: WHITE } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '163D32' } }
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    cell.border = thinBorder
  })

  // Header cột "Ký xác nhận" — màu khác (xám đậm) để phân biệt
  ws.mergeCells(hdrRow1, confirmCol, hdrRow2, confirmCol)
  const cConfirmHdr = ws.getRow(hdrRow1).getCell(confirmCol)
  cConfirmHdr.value = 'Ký xác nhận'
  cConfirmHdr.font = { name: 'Arial', size: 11, bold: true, color: { argb: WHITE } }
  cConfirmHdr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '374151' } }
  cConfirmHdr.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
  cConfirmHdr.border = thinBorder

  ws.getRow(hdrRow1).height = 26
  ws.getRow(hdrRow2).height = 20

  // ══════════════════════════════════════════════════
  // DATA ROWS
  // ══════════════════════════════════════════════════
  const dataStartRow = 8

  employees.forEach((emp, idx) => {
    const rowNum = dataStartRow + idx
    const row = ws.getRow(rowNum)
    const isEvenRow = idx % 2 === 0
    const rowBg = isEvenRow ? WHITE : 'F9FAFB'

    row.height = 32  // chiều cao dòng — đủ font 11 + chỗ ký xác nhận

    // STT
    const cSTT = row.getCell(1)
    cSTT.value = idx + 1
    cSTT.font = { name: 'Arial', size: 10, color: { argb: '9CA3AF' } }
    cSTT.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } }
    cSTT.alignment = { horizontal: 'center', vertical: 'middle' }
    cSTT.border = thinBorder

    // Họ tên
    const cName = row.getCell(2)
    cName.value = emp.fullName
    cName.font = { name: 'Arial', size: 11, bold: true }
    cName.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } }
    cName.alignment = { horizontal: 'left', vertical: 'middle' }
    cName.border = thinBorder

    // Mã NV
    const cCode = row.getCell(3)
    cCode.value = emp.employeeCode
    cCode.font = { name: 'Arial', size: 9, color: { argb: '6B7280' } }
    cCode.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } }
    cCode.alignment = { horizontal: 'center', vertical: 'middle' }
    cCode.border = thinBorder

    // Day cells
    emp.days.forEach((day, di) => {
      const col = 4 + di
      const cell = row.getCell(col)
      const sym = day.symbol === '—' ? '' : day.symbol
      cell.value = sym

      let fillColor = SYMBOL_FILL[day.symbol] || rowBg
      const fontColor = SYMBOL_FONT[day.symbol] || '374151'
      // NV ĐI LÀM THẬT vào ngày lễ → tint nền + border vàng đậm để đánh dấu nghỉ bù.
      // Lễ rơi CN + NV không đi làm → symbol='X', KHÔNG có treatment đặc biệt.
      const isWorkedHoliday = day.isHoliday && WORKING_SYMBOLS.has(day.symbol)
      if (isWorkedHoliday) {
        fillColor = 'FEF3C7'  // amber-100
      }

      cell.font = { name: 'Arial', size: 10, bold: !!sym, color: { argb: fontColor } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: sym ? fillColor : (day.isHoliday ? 'FEF3C7' : rowBg) } }
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
      // Ngày lễ NV đi làm → border vàng đậm (báo "sẽ nghỉ bù")
      if (isWorkedHoliday) {
        cell.border = {
          top: { style: 'medium', color: { argb: 'D97706' } },
          left: { style: 'medium', color: { argb: 'D97706' } },
          bottom: { style: 'medium', color: { argb: 'D97706' } },
          right: { style: 'medium', color: { argb: 'D97706' } },
        }
      } else {
        cell.border = thinBorder
      }
    })

    // Summary cells
    const summaryValues = [
      { val: emp.totalCong, color: '1D4ED8', bold: true },
      { val: emp.totalWorkingHours, color: '374151', bold: false },
      { val: emp.totalLateDays || '', color: 'D97706', bold: true },
      { val: emp.totalEarlyDays || '', color: '7C3AED', bold: true },
      { val: emp.totalOvertimeHours || '', color: 'DC2626', bold: true },
      { val: emp.totalAbsentDays || '', color: 'DC2626', bold: true },
      { val: emp.totalLeaveDays || '', color: 'EA580C', bold: false },
      { val: emp.totalHolidayDays || '', color: '92400E', bold: true },  // Lễ — amber-800
    ]

    summaryValues.forEach((sv, i) => {
      const cell = row.getCell(sumStart + i)
      cell.value = sv.val
      cell.font = { name: 'Arial', size: 11, bold: sv.bold, color: { argb: sv.color } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } }
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
      cell.border = thinBorder
    })

    // Cell ký xác nhận — empty + border để NV ký tay
    const cConfirm = row.getCell(confirmCol)
    cConfirm.value = ''
    cConfirm.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } }
    cConfirm.border = thinBorder
  })

  // ══════════════════════════════════════════════════
  // TOTALS ROW
  // ══════════════════════════════════════════════════
  const totRowNum = dataStartRow + employees.length
  const totRow = ws.getRow(totRowNum)
  totRow.height = 28

  // Merge STT cell
  const cTotSTT = totRow.getCell(1)
  cTotSTT.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'ECFDF5' } }
  cTotSTT.border = thinBorder

  const cTotName = totRow.getCell(2)
  cTotName.value = 'TỔNG CỘNG'
  cTotName.font = { name: 'Arial', size: 11, bold: true, color: { argb: BRAND_GREEN } }
  cTotName.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'ECFDF5' } }
  cTotName.alignment = { horizontal: 'left', vertical: 'middle' }
  cTotName.border = thinBorder

  const cTotCode = totRow.getCell(3)
  cTotCode.value = `${employees.length} NV`
  cTotCode.font = { name: 'Arial', size: 9, color: { argb: '6B7280' } }
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
    Math.round(employees.reduce((s, e) => s + e.totalCong, 0) * 10) / 10,
    Math.round(employees.reduce((s, e) => s + e.totalWorkingHours, 0) * 10) / 10,
    employees.reduce((s, e) => s + e.totalLateDays, 0) || '',
    employees.reduce((s, e) => s + e.totalEarlyDays, 0) || '',
    Math.round(employees.reduce((s, e) => s + e.totalOvertimeHours, 0) * 10) / 10 || '',
    employees.reduce((s, e) => s + e.totalAbsentDays, 0) || '',
    employees.reduce((s, e) => s + e.totalLeaveDays, 0) || '',
    employees.reduce((s, e) => s + e.totalHolidayDays, 0) || '',  // Lễ
  ]
  const totColors = ['1D4ED8', '374151', 'D97706', '7C3AED', 'DC2626', 'DC2626', 'EA580C', '92400E']

  totals.forEach((val, i) => {
    const cell = totRow.getCell(sumStart + i)
    cell.value = val
    cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: totColors[i] } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'ECFDF5' } }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    cell.border = thinBorder
  })

  // Cell ký xác nhận ở dòng tổng — để trống nhưng giữ border
  const cTotConfirm = totRow.getCell(confirmCol)
  cTotConfirm.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'ECFDF5' } }
  cTotConfirm.border = thinBorder

  // ══════════════════════════════════════════════════
  // SIGNATURE AREA
  // ══════════════════════════════════════════════════
  const sigRow = totRowNum + 3
  const sigStyle: Partial<ExcelJS.Style> = {
    font: { name: 'Arial', size: 11, italic: true, color: { argb: '6B7280' } },
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
    ['CT', 'Công tác', 'Đi công tác (đã duyệt)'],
    ['2ca', '2 ca/ngày', 'VD: Ca 1 + Ca 3 = 2.0 công'],
    ['L', 'Nghỉ lễ', '1 công — ngày lễ VN, NV không đi làm'],
    ['(viền vàng)', 'Đi làm ngày lễ', '1 công + 1 ngày nghỉ bù sau (xin qua leave_request)'],
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

// ============================================================================
// EXPORT CÁ NHÂN — phiếu chấm công 1 nhân viên (layout DỌC: 1 ngày = 1 dòng)
// ============================================================================

const fmtTimeHM = (iso: string | null): string => {
  if (!iso) return ''
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
const sanitizeName = (s: string) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_')

export async function exportEmployeeMonthlyExcel(emp: EmployeeMonthlySummary, month: number, year: number): Promise<void> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Huy Anh ERP'
  wb.created = new Date()

  const ws = wb.addWorksheet(emp.employeeCode || 'NV', {
    pageSetup: {
      paperSize: 9 as ExcelJS.PaperSize, // A4
      orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    },
  })

  const COLS = 11 // Ngày · Thứ · Ký hiệu · Ca · Vào · Ra · Công · Trễ · Sớm · OT · Ghi chú
  const widths = [9, 6, 8, 22, 9, 9, 7, 7, 7, 7, 28]
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = w })

  // Header
  ws.mergeCells(1, 1, 1, COLS)
  const r1 = ws.getRow(1)
  r1.getCell(1).value = 'CÔNG TY TNHH MTV CAO SU HUY ANH PHONG ĐIỀN'
  r1.getCell(1).font = { name: 'Arial', size: 12, bold: true, color: { argb: BRAND_GREEN } }
  r1.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }; r1.height = 22

  ws.mergeCells(2, 1, 2, COLS)
  const r2 = ws.getRow(2)
  r2.getCell(1).value = `PHIẾU CHẤM CÔNG CÁ NHÂN — ${MONTHS_VN[month].toUpperCase()}/${year}`
  r2.getCell(1).font = { name: 'Arial', size: 15, bold: true, color: { argb: BRAND_GREEN } }
  r2.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }; r2.height = 28

  ws.mergeCells(3, 1, 3, COLS)
  const r3 = ws.getRow(3)
  r3.getCell(1).value = `Họ tên: ${emp.fullName}     |     Mã NV: ${emp.employeeCode}     |     Phòng: ${emp.departmentName}`
  r3.getCell(1).font = { name: 'Arial', size: 11, bold: true }
  r3.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }; r3.height = 20
  ws.getRow(4).height = 4

  // Column header
  const HDR = 5
  const headers = ['Ngày', 'Thứ', 'Ký hiệu', 'Ca', 'Giờ vào', 'Giờ ra', 'Công', 'Trễ(p)', 'Sớm(p)', 'OT(p)', 'Ghi chú']
  headers.forEach((h, i) => {
    const c = ws.getRow(HDR).getCell(i + 1)
    c.value = h
    c.font = { name: 'Arial', size: 10, bold: true, color: { argb: WHITE } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_GREEN } }
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    c.border = thinBorder
  })
  ws.getRow(HDR).height = 24

  // Data — 1 dòng/ngày
  const start = HDR + 1
  emp.days.forEach((day, i) => {
    const row = ws.getRow(start + i)
    const dt = new Date(day.date + 'T00:00:00')
    const sym = day.symbol === '—' ? '' : day.symbol
    const ca = day.allShiftNames && day.allShiftNames.length ? day.allShiftNames.join(' + ') : (day.shiftName || '')
    const ghichu = day.holidayName ? `Lễ: ${day.holidayName}`
      : day.isBusinessTrip ? 'Công tác'
      : day.isLeave ? `Nghỉ phép${day.leaveType ? ` (${day.leaveType})` : ''}`
      : day.autoCheckout ? 'Hệ thống tự chốt ca' : ''
    const isWorkedHoliday = day.isHoliday && WORKING_SYMBOLS.has(day.symbol)
    const rowBg = dt.getDay() === 0 ? 'FEF2F2' : (day.isHoliday ? 'FEF3C7' : (i % 2 ? 'F9FAFB' : WHITE))

    const cells: (string | number)[] = [
      `${String(dt.getDate()).padStart(2, '0')}/${String(month).padStart(2, '0')}`,
      WEEKDAY_SHORT[dt.getDay()],
      sym, ca,
      fmtTimeHM(day.checkIn), fmtTimeHM(day.checkOut),
      day.dayWorkUnits || '', day.lateMinutes || '', day.earlyLeaveMinutes || '', day.overtimeMinutes || '',
      ghichu + (isWorkedHoliday ? ' · đi làm lễ (nghỉ bù)' : ''),
    ]
    cells.forEach((val, ci) => {
      const c = row.getCell(ci + 1)
      c.value = val
      const fill = (ci === 2 && sym) ? (SYMBOL_FILL[day.symbol] || rowBg) : rowBg
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } }
      c.font = { name: 'Arial', size: 10, bold: ci === 2 && !!sym, color: { argb: ci === 2 ? (SYMBOL_FONT[day.symbol] || '374151') : '374151' } }
      c.alignment = { horizontal: ci === 3 || ci === 10 ? 'left' : 'center', vertical: 'middle', wrapText: ci === 10 }
      c.border = thinBorder
    })
    row.height = 17
  })

  // Dòng TỔNG
  const totRn = start + emp.days.length
  const tr = ws.getRow(totRn)
  ws.mergeCells(totRn, 1, totRn, 6)
  const tc = tr.getCell(1)
  tc.value = 'TỔNG CỘNG'
  tc.font = { name: 'Arial', size: 11, bold: true, color: { argb: BRAND_GREEN } }
  tc.alignment = { horizontal: 'right', vertical: 'middle' }
  tc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'ECFDF5' } }
  tc.border = thinBorder
  const totVals: (string | number)[] = [emp.totalCong, emp.totalLateDays || '', emp.totalEarlyDays || '', Math.round(emp.totalOvertimeHours * 60) || '', '']
  totVals.forEach((v, i) => {
    const c = tr.getCell(7 + i)
    c.value = v
    c.font = { name: 'Arial', size: 11, bold: true, color: { argb: '1D4ED8' } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'ECFDF5' } }
    c.alignment = { horizontal: 'center', vertical: 'middle' }
    c.border = thinBorder
  })
  tr.height = 22

  // Dòng tóm tắt
  const sumRn = totRn + 2
  ws.mergeCells(sumRn, 1, sumRn, COLS)
  const sc = ws.getRow(sumRn).getCell(1)
  sc.value = `Tổng công: ${emp.totalCong}  •  Đi làm: ${emp.totalWorkDays} ngày  •  Trễ: ${emp.totalLateDays}  •  Về sớm: ${emp.totalEarlyDays}  •  OT: ${emp.totalOvertimeHours}h  •  Vắng: ${emp.totalAbsentDays}  •  Phép: ${emp.totalLeaveDays}  •  Công tác: ${emp.totalBusinessTripDays}  •  Lễ: ${emp.totalHolidayDays}`
  sc.font = { name: 'Arial', size: 10, italic: true, color: { argb: '374151' } }
  sc.alignment = { horizontal: 'left' }

  // Ký
  const sigRn = sumRn + 3
  const sigStyle = { font: { name: 'Arial', size: 11, italic: true, color: { argb: '6B7280' } }, alignment: { horizontal: 'center' as const } }
  ws.getRow(sigRn).getCell(3).value = 'Người lao động'; ws.getRow(sigRn).getCell(3).style = sigStyle
  ws.getRow(sigRn).getCell(8).value = 'Trưởng phòng'; ws.getRow(sigRn).getCell(8).style = sigStyle
  const sigLineRn = sigRn + 3
  ws.getRow(sigLineRn).getCell(3).value = '........................'; ws.getRow(sigLineRn).getCell(3).style = sigStyle
  ws.getRow(sigLineRn).getCell(8).value = '........................'; ws.getRow(sigLineRn).getCell(8).style = sigStyle

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  saveAs(blob, `Cham_Cong_${emp.employeeCode || 'NV'}_${sanitizeName(emp.fullName)}_T${month}_${year}.xlsx`)
}