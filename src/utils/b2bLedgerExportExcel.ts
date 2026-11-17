// ============================================================================
// FILE: src/utils/b2bLedgerExportExcel.ts
// MODULE: B2B — Xuất báo cáo công nợ (aging + balance summary) ra Excel
// Sprint 4: Export Excel cho Báo cáo công nợ
// ============================================================================

import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'
import type { AgingItem, BalanceSummary, PartnerBalance } from '../services/b2b/ledgerService'

const COLORS = {
  BLUE_DARK: 'FF1F4E79',
  BLUE_HEADER: 'FF4472C4',
  BLUE_LIGHT: 'FFD6E4F0',
  AMBER_LIGHT: 'FFFFF8E1',
  RED_LIGHT: 'FFFCE4EC',
  GREEN_LIGHT: 'FFE2EFDA',
  GRAY_BG: 'FFF2F2F2',
  GRAY_BORDER: 'FFB4B4B4',
  WHITE: 'FFFFFFFF',
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

const FILL_HEADER: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.BLUE_HEADER } }
const FILL_TOTAL: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.BLUE_LIGHT } }
const FILL_AMBER: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.AMBER_LIGHT } }
const FILL_RED: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.RED_LIGHT } }
const FILL_GREEN: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.GREEN_LIGHT } }

const VND_FORMAT = '#,##0;[Red]-#,##0'

export interface LedgerReportExportData {
  summary: BalanceSummary | null
  aging: AgingItem[]
  periodLabel: string
}

export async function exportLedgerReport(data: LedgerReportExportData): Promise<void> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Huy Anh Rubber ERP'
  wb.created = new Date()

  // ─── Sheet 1: Tổng hợp ───
  const wsSummary = wb.addWorksheet('Tổng hợp')
  wsSummary.mergeCells('A1:D1')
  const titleCell = wsSummary.getCell('A1')
  titleCell.value = 'BÁO CÁO CÔNG NỢ B2B — TỔNG HỢP'
  titleCell.font = FONT_TITLE
  titleCell.alignment = { horizontal: 'center' }

  wsSummary.mergeCells('A2:D2')
  const subCell = wsSummary.getCell('A2')
  subCell.value = `Kỳ: ${data.periodLabel} | Xuất lúc: ${new Date().toLocaleString('vi-VN')}`
  subCell.font = FONT_SUBTITLE
  subCell.alignment = { horizontal: 'center' }

  const summaryRows = [
    ['Tổng nợ phải thu', data.summary?.total_debit ?? 0],
    ['Tổng nợ phải trả', data.summary?.total_credit ?? 0],
    ['Số dư ròng', data.summary?.net_balance ?? 0],
    ['Số đối tác', data.summary?.partner_count ?? 0],
  ]

  let row = 4
  summaryRows.forEach(([label, value]) => {
    const labelCell = wsSummary.getCell(`A${row}`)
    labelCell.value = label
    labelCell.font = FONT_TOTAL
    labelCell.border = BORDER_THIN
    labelCell.fill = FILL_TOTAL

    const valueCell = wsSummary.getCell(`B${row}`)
    valueCell.value = value
    valueCell.font = FONT_DATA
    valueCell.border = BORDER_THIN
    valueCell.numFmt = typeof value === 'number' && label !== 'Số đối tác' ? VND_FORMAT : '#,##0'
    valueCell.alignment = { horizontal: 'right' }
    row++
  })

  wsSummary.getColumn('A').width = 30
  wsSummary.getColumn('B').width = 25

  // ─── Sheet 2: Tuổi nợ ───
  const wsAging = wb.addWorksheet('Tuổi nợ')
  wsAging.mergeCells('A1:H1')
  const agingTitle = wsAging.getCell('A1')
  agingTitle.value = 'BÁO CÁO TUỔI NỢ B2B'
  agingTitle.font = FONT_TITLE
  agingTitle.alignment = { horizontal: 'center' }

  wsAging.mergeCells('A2:H2')
  const agingSub = wsAging.getCell('A2')
  agingSub.value = `Kỳ: ${data.periodLabel} | Xuất lúc: ${new Date().toLocaleString('vi-VN')}`
  agingSub.font = FONT_SUBTITLE
  agingSub.alignment = { horizontal: 'center' }

  const headers = ['Mã đối tác', 'Tên đối tác', 'Hạng', '0-30 ngày', '31-60 ngày', '61-90 ngày', '> 90 ngày', 'Tổng cộng']
  headers.forEach((h, i) => {
    const cell = wsAging.getCell(4, i + 1)
    cell.value = h
    cell.font = FONT_HEADER
    cell.fill = FILL_HEADER
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    cell.border = BORDER_THIN
  })

  let agingRow = 5
  data.aging.forEach((item) => {
    const cells = [
      item.partner_code,
      item.partner_name,
      item.partner_tier?.toUpperCase() || '',
      item.current,
      item.days_30,
      item.days_60,
      item.days_90,
      item.total,
    ]
    cells.forEach((val, i) => {
      const cell = wsAging.getCell(agingRow, i + 1)
      cell.value = val
      cell.font = FONT_DATA
      cell.border = BORDER_THIN
      if (i >= 3) {
        cell.numFmt = VND_FORMAT
        cell.alignment = { horizontal: 'right' }
        if (i === 4 && item.days_30 > 0) cell.fill = FILL_AMBER
        if (i === 5 && item.days_60 > 0) cell.fill = FILL_RED
        if (i === 6 && item.days_90 > 0) { cell.fill = FILL_RED; cell.font = { ...FONT_DATA, bold: true } }
        if (i === 7) cell.font = FONT_TOTAL
      }
    })
    agingRow++
  })

  // Totals row
  if (data.aging.length > 0) {
    const totalLabel = wsAging.getCell(agingRow, 1)
    wsAging.mergeCells(agingRow, 1, agingRow, 3)
    totalLabel.value = 'TỔNG CỘNG'
    totalLabel.font = FONT_TOTAL
    totalLabel.fill = FILL_TOTAL
    totalLabel.alignment = { horizontal: 'right' }
    totalLabel.border = BORDER_THIN

    const sumCurrent = data.aging.reduce((a, x) => a + (x.current || 0), 0)
    const sumDays30 = data.aging.reduce((a, x) => a + (x.days_30 || 0), 0)
    const sumDays60 = data.aging.reduce((a, x) => a + (x.days_60 || 0), 0)
    const sumDays90 = data.aging.reduce((a, x) => a + (x.days_90 || 0), 0)
    const sumTotal = data.aging.reduce((a, x) => a + (x.total || 0), 0)

    const totals = [sumCurrent, sumDays30, sumDays60, sumDays90, sumTotal]
    totals.forEach((val, i) => {
      const cell = wsAging.getCell(agingRow, i + 4)
      cell.value = val
      cell.font = FONT_TOTAL
      cell.fill = FILL_TOTAL
      cell.numFmt = VND_FORMAT
      cell.alignment = { horizontal: 'right' }
      cell.border = BORDER_THIN
    })
  }

  wsAging.getColumn('A').width = 15
  wsAging.getColumn('B').width = 30
  wsAging.getColumn('C').width = 10
  for (let c = 4; c <= 8; c++) wsAging.getColumn(c).width = 16

  // ─── Save ───
  const buffer = await wb.xlsx.writeBuffer()
  const ymd = new Date().toLocaleDateString('sv-SE')
  const filename = `bao-cao-cong-no-b2b_${ymd}.xlsx`
  saveAs(new Blob([buffer]), filename)
}

// ============================================================================
// Xuất Sổ công nợ đối tác (LedgerOverviewPage) — 1 dòng = 1 đối tác
// ============================================================================
export async function exportPartnerBalances(balances: PartnerBalance[]): Promise<void> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Huy Anh Rubber ERP'
  wb.created = new Date()

  const ws = wb.addWorksheet('Công nợ đối tác')
  ws.mergeCells('A1:G1')
  const title = ws.getCell('A1')
  title.value = 'SỔ CÔNG NỢ ĐỐI TÁC B2B'
  title.font = FONT_TITLE
  title.alignment = { horizontal: 'center' }

  ws.mergeCells('A2:G2')
  const sub = ws.getCell('A2')
  sub.value = `Xuất lúc: ${new Date().toLocaleString('vi-VN')}`
  sub.font = FONT_SUBTITLE
  sub.alignment = { horizontal: 'center' }

  const headers = ['Mã đối tác', 'Tên đối tác', 'Hạng', 'Tổng nợ', 'Tổng có', 'Số dư', 'Giao dịch gần nhất']
  headers.forEach((h, i) => {
    const cell = ws.getCell(4, i + 1)
    cell.value = h
    cell.font = FONT_HEADER
    cell.fill = FILL_HEADER
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    cell.border = BORDER_THIN
  })

  let row = 5
  balances.forEach((b) => {
    const cells: (string | number)[] = [
      b.partner_code,
      b.partner_name,
      b.partner_tier?.toUpperCase() || '',
      b.total_debit || 0,
      b.total_credit || 0,
      b.balance || 0,
      b.last_entry_date ? new Date(b.last_entry_date).toLocaleDateString('vi-VN') : '',
    ]
    cells.forEach((val, i) => {
      const cell = ws.getCell(row, i + 1)
      cell.value = val
      cell.font = FONT_DATA
      cell.border = BORDER_THIN
      if (i >= 3 && i <= 5) {
        cell.numFmt = VND_FORMAT
        cell.alignment = { horizontal: 'right' }
        if (i === 5) {
          cell.font = FONT_TOTAL
          if ((b.balance || 0) > 0) cell.fill = FILL_AMBER
        }
      }
      if (i === 6) cell.alignment = { horizontal: 'center' }
    })
    row++
  })

  // Totals row
  if (balances.length > 0) {
    ws.mergeCells(row, 1, row, 3)
    const totalLabel = ws.getCell(row, 1)
    totalLabel.value = 'TỔNG CỘNG'
    totalLabel.font = FONT_TOTAL
    totalLabel.fill = FILL_TOTAL
    totalLabel.alignment = { horizontal: 'right' }
    totalLabel.border = BORDER_THIN

    const sums = [
      balances.reduce((a, x) => a + (x.total_debit || 0), 0),
      balances.reduce((a, x) => a + (x.total_credit || 0), 0),
      balances.reduce((a, x) => a + (x.balance || 0), 0),
    ]
    sums.forEach((val, i) => {
      const cell = ws.getCell(row, i + 4)
      cell.value = val
      cell.font = FONT_TOTAL
      cell.fill = FILL_TOTAL
      cell.numFmt = VND_FORMAT
      cell.alignment = { horizontal: 'right' }
      cell.border = BORDER_THIN
    })
    const lastCell = ws.getCell(row, 7)
    lastCell.fill = FILL_TOTAL
    lastCell.border = BORDER_THIN
  }

  ws.getColumn(1).width = 15
  ws.getColumn(2).width = 30
  ws.getColumn(3).width = 10
  for (let c = 4; c <= 6; c++) ws.getColumn(c).width = 18
  ws.getColumn(7).width = 20

  const buffer = await wb.xlsx.writeBuffer()
  const ymd = new Date().toLocaleDateString('sv-SE')
  saveAs(new Blob([buffer]), `so-cong-no-doi-tac-b2b_${ymd}.xlsx`)
}
