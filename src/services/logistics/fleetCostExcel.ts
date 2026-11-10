// ============================================================================
// EXPORT EXCEL — SỔ CHI PHÍ ĐỘI XE theo tài xế, đúng bố cục "Form theo dõi chi phí tài xế.xlsx"
// File: src/services/logistics/fleetCostExcel.ts
//
// Một sheet / tài xế: dòng 1 tiêu đề tháng, dòng 2 tên lái xe, dòng 3–5 đầu cột 2 tầng, mỗi dòng
// = 1 lệnh điều động, cuối sheet TỔNG / TẠM ỨNG / TỔNG CHI / CÒN LẠI (tách LAK và VNĐ như form).
// 26 cột A→Z giữ nguyên thứ tự của form; 5 cột lương (U→Y) để TRỐNG vì Đợt 1 chưa tính lương.
// Số lấy thẳng từ v_fleet_cost_trips (TripCostRow) — không cộng lại ở đây ngoài tổng cột.
// ============================================================================

import type ExcelJSType from 'exceljs'
import { DISPATCH_STATUS_LABELS } from './dispatchService'
import { EXPENSE_KIND_LABELS, type ExpenseKind, type TripCostRow } from './fleetCostService'

const BRAND = 'FF1B4D3E'
const HEAD_BG = 'FFECFDF5'
const OK_BG = 'FFF0F9F4'
const RED_BG = 'FFFEF2F2'
const BORDER = 'FFD1D5DB'
const AMBER = 'FFB45309'
const INT = '#,##0'
const DATE = 'dd/mm/yyyy'

const thin = (): Partial<ExcelJSType.Borders> => ({
  top: { style: 'thin', color: { argb: BORDER } }, left: { style: 'thin', color: { argb: BORDER } },
  bottom: { style: 'thin', color: { argb: BORDER } }, right: { style: 'thin', color: { argb: BORDER } },
})

export interface DriverSheet {
  driverName: string
  trips: TripCostRow[]
}

export interface FleetCostExportOpts {
  ym: string               // 'YYYY-MM'
  sheets: DriverSheet[]    // 1 sheet / tài xế (trips đã lọc theo tài xế + tháng)
}

const kindsText = (kinds: string | null): string =>
  (kinds || '').split(',').filter(Boolean).map((k) => EXPENSE_KIND_LABELS[k as ExpenseKind] || k).join(', ')

const toDate = (iso: string | null): Date | null => (iso ? new Date(iso + 'T00:00:00') : null)

const sheetName = (name: string, used: Set<string>): string => {
  let base = name.replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 28) || 'Tai xe'
  let n = base; let i = 2
  while (used.has(n)) { n = `${base} (${i++})` }
  used.add(n)
  return n
}

export async function exportFleetCostMonth(opts: FleetCostExportOpts): Promise<void> {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Huy Anh ERP'
  const [y, m] = opts.ym.split('-')
  const used = new Set<string>()

  for (const sh of opts.sheets) {
    const ws = wb.addWorksheet(sheetName(sh.driverName, used), { views: [{ state: 'frozen', ySplit: 5 }] })
    const widths = [20, 11, 11, 11, 8, 13, 12, 10, 10, 26, 8, 7, 24, 28, 12, 14, 12, 14, 12, 14, 11, 11, 13, 11, 11, 22]
    ws.columns = widths.map((w) => ({ width: w }))

    // Dòng 1–2: tiêu đề
    ws.mergeCells('A1:Z1')
    ws.getCell('A1').value = `THEO DÕI CHI PHÍ ĐỘI XE CONTAINER THÁNG ${m}/${y}`
    ws.getCell('A1').font = { bold: true, size: 14, color: { argb: BRAND } }
    ws.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' }
    ws.getRow(1).height = 24
    ws.getCell('A2').value = `Lái xe : ${sh.driverName.toUpperCase()}`
    ws.getCell('A2').font = { bold: true, size: 12 }

    // Dòng 3–5: đầu cột 2 tầng, đúng nhóm của form
    const groups: [string, string, string][] = [
      ['A3', 'A5', 'Họ và tên'], ['B3', 'B5', 'Tình trạng'],
      ['C3', 'E4', 'Ngày công tác'], ['F3', 'G4', 'XE'], ['H3', 'I4', 'Km'], ['J3', 'J5', 'HÀNH TRÌNH'],
      ['K3', 'L4', 'Ngày hành trình'], ['M3', 'M5', 'Nội dung công việc'], ['N3', 'N5', 'Nội dung chi phí'],
      ['O3', 'P4', 'Tạm ứng'], ['Q3', 'T3', 'Chi phí phát sinh'], ['U3', 'Y4', 'Lương'], ['Z3', 'Z5', 'Ghi chú'],
      ['Q4', 'R4', 'Được tính'], ['S4', 'T4', 'Không được tính'],
    ]
    for (const [a, b, text] of groups) { ws.mergeCells(`${a}:${b}`); ws.getCell(a).value = text }
    const sub: Record<string, string> = {
      C5: 'Ngày đi', D5: 'Ngày về', E5: 'Tổng ngày đi và về', F5: 'BS XE', G5: 'Rơ mooc', H5: 'Km đồng hồ đi', I5: 'Km đồng hồ về',
      K5: 'Số ngày hành trình (chuẩn)', L5: 'Vượt thời gian', O5: 'LAK', P5: 'VNĐ', Q5: 'Số tiền lak', R5: 'Số tiền VNĐ',
      S5: 'Số tiền lak', T5: 'Số tiền VNĐ', U5: 'Đơn giá chuyến', V5: 'Hỗ trợ vượt thời gian/ ngày', W5: 'Tổng lương chuyến(VNĐ)',
      X5: 'Hỗ trợ dầu / km', Y5: 'Hỗ trợ vận chuyển/ tấn',
    }
    for (const [addr, text] of Object.entries(sub)) ws.getCell(addr).value = text
    for (let r = 3; r <= 5; r++) {
      const row = ws.getRow(r)
      row.height = r === 5 ? 30 : 18
      for (let c = 1; c <= 26; c++) {
        const cell = row.getCell(c)
        cell.font = { bold: true, size: 10 }
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEAD_BG } }
        cell.border = thin()
      }
    }

    // Dữ liệu: 1 dòng = 1 lệnh
    let r = 6
    const first = r
    for (const t of sh.trips) {
      const row = ws.getRow(r)
      const vals: (string | number | Date | null)[] = [
        sh.driverName,
        DISPATCH_STATUS_LABELS[t.status as keyof typeof DISPATCH_STATUS_LABELS] || t.status,
        toDate(t.dispatch_date), toDate(t.return_date), t.trip_days,
        t.tractor_plate, t.trailer_plate, t.odometer_start_km, t.odometer_end_km,
        t.route_name || [t.pickup_location, t.destination].filter(Boolean).join(' → ') || null,
        t.standard_days, t.over_days,
        [t.code, t.reason || (t.customer_name ? `Giao ${t.customer_name}` : null)].filter(Boolean).join(' · '),
        [kindsText(t.kinds), t.is_hired && t.hire_cost ? 'Cước thuê xe ngoài' : null].filter(Boolean).join(', ') || null,
        t.adv_lak || null, t.adv_vnd || null,
        t.counted_lak || null, t.counted_vnd || null,
        t.uncounted_lak || null, t.uncounted_vnd || null,
        null, null, null, null, null,
        [t.cost_status === 'reviewed' ? 'đã duyệt' : null, t.n_missing_receipt ? `${t.n_missing_receipt} khoản thiếu chứng từ` : null, t.cost_note].filter(Boolean).join(' · ') || null,
      ]
      vals.forEach((v, i) => { row.getCell(i + 1).value = v })
      for (let c = 1; c <= 26; c++) {
        const cell = row.getCell(c)
        cell.border = thin()
        cell.font = { size: 10 }
        cell.alignment = { vertical: 'middle', wrapText: [10, 13, 14, 26].includes(c) }
        if ([3, 4].includes(c)) cell.numFmt = DATE
        if ([5, 8, 9, 11, 12, 15, 16, 17, 18, 19, 20].includes(c)) cell.numFmt = INT
        if ([17, 18].includes(c)) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: OK_BG } }
        if ([19, 20].includes(c)) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: RED_BG } }
        if (c === 12 && (t.over_days || 0) > 0) cell.font = { size: 10, bold: true, color: { argb: AMBER } }
      }
      r++
    }
    const last = r - 1

    // Tổng (công thức Excel để người nhận sửa tay vẫn đúng)
    const sumCols = ['E', 'O', 'P', 'Q', 'R', 'S', 'T']
    const total = ws.getRow(r)
    total.getCell(1).value = 'TỔNG CHI'
    ws.mergeCells(`A${r}:C${r}`)
    for (const col of sumCols) total.getCell(col).value = last >= first ? { formula: `SUM(${col}${first}:${col}${last})` } : 0
    const lines: [string, string, string][] = [
      ['TẠM ỨNG', `O${r}`, `P${r}`],
      ['TỔNG CHI', `Q${r}`, `R${r}`],
    ]
    let rr = r + 1
    for (const [label, lak, vnd] of lines) {
      const row = ws.getRow(rr)
      ws.mergeCells(`A${rr}:N${rr}`)
      row.getCell(1).value = label
      row.getCell('O').value = { formula: lak }
      row.getCell('P').value = { formula: vnd }
      rr++
    }
    const left = ws.getRow(rr)
    ws.mergeCells(`A${rr}:N${rr}`)
    left.getCell(1).value = 'CÒN LẠI (tạm ứng − tổng chi được tính)'
    left.getCell('O').value = { formula: `O${r + 1}-O${r + 2}` }
    left.getCell('P').value = { formula: `P${r + 1}-P${r + 2}` }
    for (let i = r; i <= rr; i++) {
      const row = ws.getRow(i)
      for (let c = 1; c <= 26; c++) {
        const cell = row.getCell(c)
        cell.font = { bold: true, size: 10 }
        cell.border = thin()
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEAD_BG } }
        if (c >= 5) cell.numFmt = INT
      }
    }
    ws.getRow(rr + 2).getCell(1).value = `Xuất từ Huy Anh ERP · ${new Date().toLocaleString('vi-VN')} · lương chuyến (cột U–Y) chưa tính ở đợt này`
    ws.getRow(rr + 2).getCell(1).font = { italic: true, size: 9, color: { argb: 'FF6B7280' } }
  }

  if (!opts.sheets.length) {
    const ws = wb.addWorksheet('Trong')
    ws.getCell('A1').value = `Tháng ${m}/${y}: không có chuyến nào`
  }

  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `Chi_phi_doi_xe_${y}-${m}${opts.sheets.length === 1 ? '_' + opts.sheets[0].driverName.replace(/\s+/g, '_') : ''}.xlsx`
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}
