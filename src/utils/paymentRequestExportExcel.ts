// ============================================================================
// FILE: src/utils/paymentRequestExportExcel.ts
// MODULE: WMS / Nhập kho mủ — Xuất Đề nghị thanh toán ra Excel
// Theo form "ĐNTT" (BÁO CÁO KHỐI LƯỢNG HẰNG NGÀY MỦ NƯỚC TÂN LÂM.xlsx):
//   STT | Nội dung | ĐVT | Số lượng | Đơn giá | Thành tiền | Ghi chú
// ============================================================================

import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'
import logoUrl from '../assets/logo.png'
import type { PaymentRequest, PaymentRequestLine } from '../services/wms/paymentRequestService'

const RUBBER_LABELS: Record<string, string> = {
  mu_nuoc: 'mủ nước', mu_tap: 'mủ tạp', mu_dong: 'mủ đông', mu_chen: 'mủ chén', mu_to: 'mủ tờ',
}
const CCY_LABEL: Record<string, string> = { VND: 'VND', KIP: 'KIP', THB: 'THB' }

// ── Đọc số tiền bằng chữ (tiếng Việt) ──
function readVietnameseNumber(num: number): string {
  if (!num || num <= 0) return 'Không'
  const ds = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín']
  const readTriple = (n: number, full: boolean): string => {
    const tr = Math.floor(n / 100), ch = Math.floor((n % 100) / 10), dv = n % 10
    let s = ''
    if (full || tr > 0) s += ds[tr] + ' trăm'
    if (ch === 0) { if (dv > 0) s += (s ? ' lẻ ' : '') + ds[dv] }
    else {
      s += (s ? ' ' : '') + (ch === 1 ? 'mười' : ds[ch] + ' mươi')
      if (dv === 1 && ch > 1) s += ' mốt'
      else if (dv === 5 && ch > 0) s += ' lăm'
      else if (dv > 0) s += ' ' + ds[dv]
    }
    return s.trim()
  }
  const units = ['', ' nghìn', ' triệu', ' tỷ']
  const groups: number[] = []
  let n = Math.round(num)
  while (n > 0) { groups.push(n % 1000); n = Math.floor(n / 1000) }
  let out = ''
  for (let i = groups.length - 1; i >= 0; i--) {
    if (groups[i] === 0) continue   // bỏ nhóm 0 (gồm cả nhóm đơn vị cuối → hết "không trăm" thừa)
    // Thêm khoảng trắng giữa các nhóm (trước đây dính chữ: "triệubảy", "nghìnkhông")
    out += (out ? ' ' : '') + readTriple(groups[i], i < groups.length - 1) + units[i]
  }
  out = out.trim().replace(/\s+/g, ' ')
  return out.charAt(0).toUpperCase() + out.slice(1)
}

const BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' },
}

export interface ExportOpts {
  preparedBy?: string | null              // Người đề nghị
  department?: string | null              // Bộ phận (mặc định HCTH)
  msnv?: string | null                    // Mã số nhân viên
  paymentMethod?: 'ck_cty' | 'ck_quy' | 'cash'  // Hình thức nhận tiền (mặc định ck_quy)
}

export async function exportPaymentRequestExcel(
  req: PaymentRequest,
  lines: PaymentRequestLine[],
  opts: ExportOpts = {},
): Promise<void> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Huy Anh Rubber ERP'
  wb.created = new Date()
  const ws = wb.addWorksheet('ĐNTT', {
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } },
  })
  ws.columns = [
    { width: 5 },   // A STT
    { width: 40 },  // B Nội dung
    { width: 6 },   // C ĐVT
    { width: 12 },  // D Số lượng
    { width: 12 },  // E Đơn giá
    { width: 16 },  // F Thành tiền
    { width: 30 },  // G Ghi chú
  ]

  const ccy = CCY_LABEL[req.currency] || 'VND'
  const numFmt = '#,##0'
  const wFmt = '#,##0.0'   // số lượng (kg) — giữ 1 số lẻ như phiếu kế toán làm tay
  const d = new Date(req.request_date)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()

  let r = 1
  const merge = (range: string) => ws.mergeCells(range)

  // ─ Logo (góc trái) — float trên ô, không chiếm cell ─
  try {
    const resp = await fetch(logoUrl)
    const buf = await resp.arrayBuffer()
    const imgId = wb.addImage({ buffer: buf, extension: 'png' })
    ws.addImage(imgId, { tl: { col: 0, row: 0 }, ext: { width: 130, height: 46 } })
  } catch { /* logo optional — bỏ qua nếu fetch lỗi */ }
  ws.getRow(1).height = 24
  ws.getRow(2).height = 18

  // ─ Company header (canh giữa để không đè logo trái) ─
  merge(`A${r}:G${r}`)
  ws.getCell(`A${r}`).value = 'CÔNG TY TNHH MTV CAO SU HUY ANH PHONG ĐIỀN'
  ws.getCell(`A${r}`).font = { name: 'Times New Roman', size: 12, bold: true }
  ws.getCell(`A${r}`).alignment = { horizontal: 'center' }
  r++
  merge(`A${r}:G${r}`)
  ws.getCell(`A${r}`).value = 'MST: 3301549896 · Khe Mạ, Phường Phong Điền, TP Huế'
  ws.getCell(`A${r}`).font = { name: 'Times New Roman', size: 9, italic: true, color: { argb: 'FF666666' } }
  ws.getCell(`A${r}`).alignment = { horizontal: 'center' }
  r++; r++

  // ─ Title ─
  merge(`A${r}:G${r}`)
  ws.getCell(`A${r}`).value = 'ĐỀ NGHỊ THANH TOÁN'
  ws.getCell(`A${r}`).font = { name: 'Times New Roman', size: 16, bold: true }
  ws.getCell(`A${r}`).alignment = { horizontal: 'center' }
  r++
  merge(`A${r}:G${r}`)
  ws.getCell(`A${r}`).value = `Ngày ${dd} tháng ${mm} năm ${yyyy}`
  ws.getCell(`A${r}`).font = { name: 'Times New Roman', size: 11, italic: true }
  ws.getCell(`A${r}`).alignment = { horizontal: 'center' }
  r++

  // ─ Meta rows ─
  const metaFont: Partial<ExcelJS.Font> = { name: 'Times New Roman', size: 11 }
  const putMeta = (label: string) => {
    merge(`A${r}:G${r}`)
    ws.getCell(`A${r}`).value = label
    ws.getCell(`A${r}`).font = metaFont
    r++
  }
  // Lý do tự sinh (ưu tiên tiêu đề người dùng nhập)
  const rubberKey = req.rubber_type || lines.find(l => l.rubber_type)?.rubber_type || ''
  const rubberLbl = rubberKey ? (RUBBER_LABELS[rubberKey] || rubberKey) : 'nguyên liệu'
  const facName = req.facility?.name ? ` tại nhà máy ${req.facility.name}` : ''
  const reason = (req.title && req.title.trim())
    ? req.title.trim()
    : `Đề nghị thanh toán tiền mua mủ ${rubberLbl}${facName} mua ngày ${dd}/${mm}/${yyyy}`

  // Hình thức nhận tiền — 3 ô tick (mặc định CK quỹ)
  const tick = (on: boolean) => (on ? '☑' : '☐')
  const pm = opts.paymentMethod || 'ck_quy'
  const hinhThuc = `Hình thức nhận tiền:   ${tick(pm === 'ck_cty')} Chuyển khoản Cty     ${tick(pm === 'ck_quy')} Chuyển khoản quỹ     ${tick(pm === 'cash')} Tiền mặt`

  putMeta(`Số phiếu: ${req.code}        Tiền tệ: ${ccy}`)
  putMeta('Kính gửi: Ban Giám đốc, Kế toán trưởng')
  putMeta(`Người đề nghị: ${opts.preparedBy || '..............'}        Bộ phận: ${opts.department || 'HCTH'}        MSNV: ${opts.msnv || '............'}`)
  putMeta(`Lý do thanh toán: ${reason}`)
  putMeta(hinhThuc)
  putMeta('Tên tài khoản: theo danh sách cột Ghi chú')
  r++

  // ─ Table header ─
  const headerRowIdx = r
  const headers = ['STT', 'Nội dung', 'ĐVT', 'Số lượng', 'Đơn giá', `Thành tiền (${ccy})`, 'Ghi chú']
  headers.forEach((h, i) => {
    const cell = ws.getCell(headerRowIdx, i + 1)
    cell.value = h
    cell.font = { name: 'Times New Roman', size: 10, bold: true }
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } }
    cell.border = BORDER
  })
  r++

  // ─ Data rows ─
  let totalAmount = 0
  let totalWeight = 0
  lines.forEach((l, idx) => {
    const rubber = l.rubber_type ? (RUBBER_LABELS[l.rubber_type] || l.rubber_type) : ''
    const slip = l.note ? ` số phiếu ${l.note}` : ''
    const noiDung = `Thanh toán tiền mua ${rubber || 'mủ'}${slip}`
    const ghiChu = [l.payee_name, l.payee_note].filter(Boolean).join(' — ')
    const vals = [idx + 1, noiDung, 'kg', l.weight || 0, l.unit_price || 0, l.amount || 0, ghiChu]
    vals.forEach((v, i) => {
      const cell = ws.getCell(r, i + 1)
      cell.value = v as any
      cell.font = { name: 'Times New Roman', size: 10 }
      cell.border = BORDER
      if (i === 0) cell.alignment = { horizontal: 'center', vertical: 'top' }
      else if (i === 2) cell.alignment = { horizontal: 'center', vertical: 'top' }
      else if (i >= 3 && i <= 5) { cell.numFmt = (i === 3 ? wFmt : numFmt); cell.alignment = { horizontal: 'right', vertical: 'top' } }
      else cell.alignment = { horizontal: 'left', vertical: 'top', wrapText: true }
    })
    totalAmount += l.amount || 0
    totalWeight += l.weight || 0
    r++
  })

  // ─ Total row ─
  merge(`A${r}:C${r}`)
  ws.getCell(`A${r}`).value = 'TỔNG CỘNG'
  ws.getCell(`A${r}`).font = { name: 'Times New Roman', size: 10, bold: true }
  ws.getCell(`A${r}`).alignment = { horizontal: 'center' }
  ws.getCell(`A${r}`).border = BORDER
  // D = tổng kg
  ws.getCell(r, 4).value = totalWeight
  ws.getCell(r, 4).numFmt = wFmt
  ws.getCell(r, 4).font = { name: 'Times New Roman', size: 10, bold: true }
  ws.getCell(r, 4).alignment = { horizontal: 'right' }
  ws.getCell(r, 4).border = BORDER
  ws.getCell(r, 5).border = BORDER
  // F = tổng tiền
  ws.getCell(r, 6).value = totalAmount
  ws.getCell(r, 6).numFmt = numFmt
  ws.getCell(r, 6).font = { name: 'Times New Roman', size: 11, bold: true }
  ws.getCell(r, 6).alignment = { horizontal: 'right' }
  ws.getCell(r, 6).border = BORDER
  ws.getCell(r, 7).border = BORDER
  for (let c = 1; c <= 7; c++) ws.getCell(r, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF8E1' } }
  r++

  // ─ Số tiền bằng chữ ─
  merge(`A${r}:G${r}`)
  const ccyWord = ccy === 'VND' ? 'đồng' : ccy === 'KIP' ? 'kíp' : 'baht'
  ws.getCell(`A${r}`).value = `Số tiền bằng chữ: ${readVietnameseNumber(totalAmount)} ${ccyWord}.`
  ws.getCell(`A${r}`).font = { name: 'Times New Roman', size: 11, italic: true, bold: true }
  r++; r++

  // ─ Chữ ký — merge mỗi ô ký để nhãn không bị cắt ─
  const signRow = r
  const blocks = [
    { cell: `A${signRow}`,   range: `A${signRow}:B${signRow}`,   sub: `A${signRow + 1}:B${signRow + 1}`, subCell: `A${signRow + 1}`, label: 'Người đề nghị' },
    { cell: `C${signRow}`,   range: `C${signRow}:E${signRow}`,   sub: `C${signRow + 1}:E${signRow + 1}`, subCell: `C${signRow + 1}`, label: 'Kế toán trưởng' },
    { cell: `F${signRow}`,   range: `F${signRow}:G${signRow}`,   sub: `F${signRow + 1}:G${signRow + 1}`, subCell: `F${signRow + 1}`, label: 'Giám đốc' },
  ]
  for (const b of blocks) {
    merge(b.range)
    ws.getCell(b.cell).value = b.label
    ws.getCell(b.cell).font = { name: 'Times New Roman', size: 11, bold: true }
    ws.getCell(b.cell).alignment = { horizontal: 'center' }
    merge(b.sub)
    ws.getCell(b.subCell).value = '(Ký, ghi rõ họ tên)'
    ws.getCell(b.subCell).font = { name: 'Times New Roman', size: 9, italic: true, color: { argb: 'FF888888' } }
    ws.getCell(b.subCell).alignment = { horizontal: 'center' }
  }

  const buf = await wb.xlsx.writeBuffer()
  saveAs(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `DNTT_${req.code}.xlsx`)
}
