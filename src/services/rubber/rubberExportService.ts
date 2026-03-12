// ============================================================================
// FILE: src/services/rubber/rubberExportService.ts
// MODULE: Thu mua Mủ Cao su — Huy Anh Rubber ERP
// PHASE: 3.6 — Bước 3.6.16 + 3.6.18
// MÔ TẢ: Export PDF quyết toán + Export Excel dashboard
//         Sử dụng jsPDF (PDF) + SheetJS (Excel) — chạy client-side
// ============================================================================

import { supabase } from '../../lib/supabase'
import type {
  RubberSettlement,
  RubberSettlementPayment,
  RubberSourceType,
  RubberCurrency,
} from './rubber.types'

// ============================================================================
// HELPERS
// ============================================================================

function fmtMoney(n?: number | null, currency?: RubberCurrency): string {
  if (n == null) return '—'
  const formatted = new Intl.NumberFormat('vi-VN').format(Math.round(n))
  const symbols: Record<string, string> = {
    VND: ' ₫', LAK: ' ₭', BATH: ' ฿', KIP: ' ₭',
  }
  return formatted + (symbols[currency || 'VND'] || '')
}

function fmtDate(d?: string | null): string {
  if (!d) return '—'
  const dt = new Date(d)
  return dt.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function sourceLabel(s: RubberSourceType): string {
  return { vietnam: 'Mủ Việt Nam', lao_direct: 'Mủ Lào trực tiếp', lao_agent: 'Mủ Lào đại lý' }[s] || s
}

// ============================================================================
// 1. EXPORT PDF QUYẾT TOÁN (Bước 3.6.16)
// Sử dụng jsPDF — cần: npm install jspdf jspdf-autotable
// ============================================================================

export async function exportSettlementPDF(settlementId: string): Promise<Blob | null> {
  try {
    // 1. Load data
    const { data: settlement, error } = await supabase
      .from('rubber_settlements')
      .select(`
        *,
        supplier:rubber_suppliers(*),
        payments:rubber_settlement_payments(*)
      `)
      .eq('id', settlementId)
      .single()

    if (error || !settlement) {
      console.error('Load settlement failed:', error)
      return null
    }

    // 2. Dynamic import jsPDF
    const { default: jsPDF } = await import('jspdf')
    const autoTable = (await import('jspdf-autotable')).default

    const doc = new jsPDF('p', 'mm', 'a4')
    const W = doc.internal.pageSize.getWidth()
    const margin = 15
    let y = 15

    // === HEADER ===
    doc.setFontSize(10)
    doc.setTextColor(100)
    doc.text('CÔNG TY TNHH CAO SU HUY ANH', margin, y)
    doc.text(`Ngày in: ${fmtDate(new Date().toISOString())}`, W - margin, y, { align: 'right' })
    y += 8

    doc.setFontSize(16)
    doc.setTextColor(27, 77, 62) // #1B4D3E
    doc.text('PHIẾU ĐỀ XUẤT THANH TOÁN', W / 2, y, { align: 'center' })
    y += 6

    doc.setFontSize(10)
    doc.setTextColor(100)
    doc.text(`Loại: ${sourceLabel(settlement.source_type)}`, W / 2, y, { align: 'center' })
    y += 10

    // === THÔNG TIN CHUNG ===
    doc.setFontSize(11)
    doc.setTextColor(0)
    const info = [
      ['Nhà cung cấp:', settlement.supplier?.name || '—'],
      ['Mã NCC:', settlement.supplier?.code || '—'],
      ['Ngày quyết toán:', fmtDate(settlement.settlement_date)],
      ['Biển số xe:', settlement.vehicle_plate || '—'],
    ]
    info.forEach(([label, value]) => {
      doc.setFont('helvetica', 'bold')
      doc.text(label, margin, y)
      doc.setFont('helvetica', 'normal')
      doc.text(String(value), margin + 45, y)
      y += 6
    })
    y += 4

    // === BẢNG KHỐI LƯỢNG & GIÁ ===
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text('CHI TIẾT KHỐI LƯỢNG & GIÁ', margin, y)
    y += 2

    const currency = settlement.price_currency || 'VND'
    const detailRows = [
      ['KL phiếu cân (kg)', fmtMoney(settlement.gross_weight_kg, undefined)?.replace(' ₫', '') || '—'],
      ['DRC (%)', settlement.drc_percent ? `${settlement.drc_percent}%` : '—'],
      ['KL mủ khô (kg)', fmtMoney(settlement.dry_rubber_kg, undefined)?.replace(' ₫', '') || '—'],
      ['Đơn giá phê duyệt', fmtMoney(settlement.approved_price, currency as RubberCurrency)],
      ['Thành tiền', fmtMoney(settlement.total_amount, currency as RubberCurrency)],
    ]

    if (settlement.exchange_rate) {
      detailRows.push(['Tỷ giá', `× ${settlement.exchange_rate}`])
      detailRows.push(['Thành tiền (VND)', fmtMoney(settlement.total_amount_vnd, 'VND')])
    }

    // @ts-ignore — jspdf-autotable augments jsPDF
    autoTable(doc, {
      startY: y,
      head: [['Hạng mục', 'Giá trị']],
      body: detailRows,
      theme: 'grid',
      styles: { fontSize: 10, cellPadding: 3 },
      headStyles: { fillColor: [27, 77, 62], textColor: 255 },
      columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
      margin: { left: margin, right: margin },
    })

    // @ts-ignore
    y = (doc as any).lastAutoTable.finalY + 8

    // === BẢNG THANH TOÁN ĐỢT ===
    const payments: RubberSettlementPayment[] = settlement.payments || []
    if (payments.length > 0) {
      doc.setFontSize(12)
      doc.setFont('helvetica', 'bold')
      doc.text('LỊCH SỬ THANH TOÁN', margin, y)
      y += 2

      const payRows = payments
        .sort((a: any, b: any) => a.payment_no - b.payment_no)
        .map((p: any) => [
          `Đợt ${p.payment_no}`,
          fmtDate(p.payment_date),
          fmtMoney(p.amount, p.currency as RubberCurrency),
          p.method === 'cash' ? 'Tiền mặt' : 'Chuyển khoản',
          p.reference_no || '—',
        ])

      // @ts-ignore
      autoTable(doc, {
        startY: y,
        head: [['Đợt', 'Ngày', 'Số tiền', 'PT thanh toán', 'Mã giao dịch']],
        body: payRows,
        theme: 'grid',
        styles: { fontSize: 9, cellPadding: 2.5 },
        headStyles: { fillColor: [45, 139, 110], textColor: 255 },
        columnStyles: { 2: { halign: 'right' } },
        margin: { left: margin, right: margin },
      })

      // @ts-ignore
      y = (doc as any).lastAutoTable.finalY + 6
    }

    // === TỔNG KẾT ===
    const totalAmt = settlement.total_amount_vnd || settlement.total_amount || 0
    const paidAmt = settlement.paid_amount || 0
    const debt = totalAmt - paidAmt

    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text(`Tổng thành tiền:`, margin, y)
    doc.text(fmtMoney(totalAmt, 'VND'), W - margin, y, { align: 'right' })
    y += 6
    doc.text(`Đã thanh toán:`, margin, y)
    doc.setTextColor(22, 163, 74)
    doc.text(fmtMoney(paidAmt, 'VND'), W - margin, y, { align: 'right' })
    y += 6
    doc.setTextColor(debt > 0 ? 220 : 0, debt > 0 ? 38 : 0, debt > 0 ? 38 : 0)
    doc.text(`Còn nợ:`, margin, y)
    doc.text(fmtMoney(debt, 'VND'), W - margin, y, { align: 'right' })
    y += 12

    // === KHUNG CHỮ KÝ 4 CẤP ===
    doc.setTextColor(0)
    doc.setFontSize(10)
    const signers = ['Người lập', 'Kế toán', 'Thu mua', 'Giám đốc']
    const sigW = (W - margin * 2) / 4
    signers.forEach((s, i) => {
      const x = margin + i * sigW + sigW / 2
      doc.setFont('helvetica', 'bold')
      doc.text(s, x, y, { align: 'center' })
      doc.setFont('helvetica', 'normal')
      doc.text('(Ký, ghi rõ họ tên)', x, y + 5, { align: 'center' })
    })

    // === FOOTER ===
    const pageCount = doc.getNumberOfPages()
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i)
      doc.setFontSize(8)
      doc.setTextColor(150)
      doc.text(
        `Huy Anh Rubber ERP — Phiếu thanh toán — Trang ${i}/${pageCount}`,
        W / 2,
        doc.internal.pageSize.getHeight() - 8,
        { align: 'center' }
      )
    }

    return doc.output('blob')
  } catch (err) {
    console.error('Export PDF error:', err)
    return null
  }
}

/** Trigger download of settlement PDF */
export async function downloadSettlementPDF(settlementId: string, filename?: string): Promise<boolean> {
  const blob = await exportSettlementPDF(settlementId)
  if (!blob) return false

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename || `quyet-toan-${settlementId.slice(0, 8)}.pdf`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  return true
}

// ============================================================================
// 2. EXPORT EXCEL DASHBOARD (Bước 3.6.18)
// Sử dụng SheetJS (xlsx) — đã có trong project
// ============================================================================

export async function exportDashboardExcel(year: number, month: number): Promise<Blob | null> {
  try {
    const XLSX = await import('xlsx')

    const wb = XLSX.utils.book_new()

    // ---- Sheet 1: Tổng hợp theo NCC ----
    const { data: batches } = await supabase
      .from('rubber_intake_batches')
      .select(`*, supplier:rubber_suppliers(code, name, country)`)
      .gte('intake_date', `${year}-${String(month).padStart(2, '0')}-01`)
      .lt('intake_date', month === 12
        ? `${year + 1}-01-01`
        : `${year}-${String(month + 1).padStart(2, '0')}-01`)
      .order('intake_date')

    if (batches && batches.length > 0) {
      const rows = batches.map((b: any, i: number) => ({
        'STT': i + 1,
        'Ngày': fmtDate(b.intake_date),
        'NCC': b.supplier?.name || '—',
        'Mã NCC': b.supplier?.code || '—',
        'Nguồn': sourceLabel(b.source_type),
        'Mã hàng': b.product_code || '—',
        'KL chốt (tấn)': b.settled_qty_ton || '',
        'Giá chốt (VND/tấn)': b.settled_price_per_ton || '',
        'KL mua (kg)': b.purchase_qty_kg || '',
        'Đơn giá': b.unit_price || '',
        'Tiền tệ': b.price_currency || 'VND',
        'Thành tiền': b.total_amount || '',
        'KL tươi (kg)': b.gross_weight_kg || '',
        'KL nhập (kg)': b.net_weight_kg || '',
        'DRC (%)': b.drc_percent || '',
        'TP NK (tấn)': b.finished_product_ton || '',
        'Biển xe': b.vehicle_plate || '',
        'Trạng thái': b.status === 'confirmed' ? 'Đã XN' : b.status === 'settled' ? 'Đã QT' : 'Nháp',
      }))

      const ws1 = XLSX.utils.json_to_sheet(rows)
      // Set column widths
      ws1['!cols'] = [
        { wch: 4 }, { wch: 12 }, { wch: 25 }, { wch: 12 }, { wch: 18 },
        { wch: 12 }, { wch: 14 }, { wch: 18 }, { wch: 12 }, { wch: 12 },
        { wch: 8 }, { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 8 },
        { wch: 12 }, { wch: 12 }, { wch: 10 },
      ]
      XLSX.utils.book_append_sheet(wb, ws1, 'Tổng hợp thu mua')
    }

    // ---- Sheet 2: Theo dõi Lào ----
    const { data: transfers } = await supabase
      .from('lao_fund_transfers')
      .select('*')
      .gte('transfer_date', `${year}-${String(month).padStart(2, '0')}-01`)
      .lt('transfer_date', month === 12
        ? `${year + 1}-01-01`
        : `${year}-${String(month + 1).padStart(2, '0')}-01`)
      .order('transfer_date')

    const { data: laoBatches } = await supabase
      .from('rubber_intake_batches')
      .select(`*, supplier:rubber_suppliers(name)`)
      .eq('source_type', 'lao_direct')
      .gte('intake_date', `${year}-${String(month).padStart(2, '0')}-01`)
      .lt('intake_date', month === 12
        ? `${year + 1}-01-01`
        : `${year}-${String(month + 1).padStart(2, '0')}-01`)
      .order('intake_date')

    const { data: shipments } = await supabase
      .from('lao_shipments')
      .select('*')
      .gte('shipment_date', `${year}-${String(month).padStart(2, '0')}-01`)
      .lt('shipment_date', month === 12
        ? `${year + 1}-01-01`
        : `${year}-${String(month + 1).padStart(2, '0')}-01`)
      .order('shipment_date')

    // Merge all events into tracking table
    type TrackRow = {
      date: string; type: string; detail: string;
      ct_lak: number; ct_bath: number;
      buy_kg: number; buy_lak: number; buy_bath: number;
      ship_kg: number; note: string;
    }
    const trackRows: TrackRow[] = []

    ;(transfers || []).forEach((t: any) => {
      trackRows.push({
        date: t.transfer_date,
        type: 'Chuyển tiền',
        detail: `${t.reference_no || ''} → ${t.receiver_name || ''}`,
        ct_lak: t.amount_lak || 0, ct_bath: t.amount_bath || 0,
        buy_kg: 0, buy_lak: 0, buy_bath: 0,
        ship_kg: 0, note: t.notes || '',
      })
    })

    ;(laoBatches || []).forEach((b: any) => {
      const isLak = b.price_currency === 'LAK'
      trackRows.push({
        date: b.intake_date,
        type: 'Mua mủ',
        detail: `${b.supplier?.name || '—'} @ ${b.location_name || '—'}`,
        ct_lak: 0, ct_bath: 0,
        buy_kg: b.purchase_qty_kg || 0,
        buy_lak: isLak ? (b.total_amount || 0) : 0,
        buy_bath: !isLak ? (b.total_amount || 0) : 0,
        ship_kg: 0, note: b.notes || '',
      })
    })

    ;(shipments || []).forEach((s: any) => {
      trackRows.push({
        date: s.shipment_date,
        type: 'Xuất NM',
        detail: `${s.vehicle_plate || ''} (${s.lot_codes?.join(', ') || ''})`,
        ct_lak: 0, ct_bath: 0,
        buy_kg: 0, buy_lak: 0, buy_bath: 0,
        ship_kg: s.loading_weight_kg || 0,
        note: s.notes || '',
      })
    })

    // Sort by date
    trackRows.sort((a, b) => a.date.localeCompare(b.date))

    // Calculate running balances
    let balLak = 0, balBath = 0, balKg = 0
    const trackOutput = trackRows.map((r, i) => {
      balLak += r.ct_lak - r.buy_lak
      balBath += r.ct_bath - r.buy_bath
      balKg += r.buy_kg - r.ship_kg
      return {
        'STT': i + 1,
        'Ngày': fmtDate(r.date),
        'Loại': r.type,
        'Chi tiết': r.detail,
        'CT LAK': r.ct_lak || '',
        'CT BATH': r.ct_bath || '',
        'Mua (kg)': r.buy_kg || '',
        'Mua LAK': r.buy_lak || '',
        'Mua BATH': r.buy_bath || '',
        'Xuất NM (kg)': r.ship_kg || '',
        'Tồn kg': balKg,
        'Tồn ₭ LAK': balLak,
        'Tồn ฿ BATH': balBath,
        'Ghi chú': r.note,
      }
    })

    if (trackOutput.length > 0) {
      const ws2 = XLSX.utils.json_to_sheet(trackOutput)
      ws2['!cols'] = [
        { wch: 4 }, { wch: 12 }, { wch: 12 }, { wch: 30 },
        { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 14 },
        { wch: 12 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 25 },
      ]
      XLSX.utils.book_append_sheet(wb, ws2, 'Theo dõi Lào')
    }

    // ---- Sheet 3: Quyết toán ----
    const { data: settlements } = await supabase
      .from('rubber_settlements')
      .select(`*, supplier:rubber_suppliers(code, name)`)
      .gte('settlement_date', `${year}-${String(month).padStart(2, '0')}-01`)
      .lt('settlement_date', month === 12
        ? `${year + 1}-01-01`
        : `${year}-${String(month + 1).padStart(2, '0')}-01`)
      .order('settlement_date')

    if (settlements && settlements.length > 0) {
      const settleRows = settlements.map((s: any, i: number) => ({
        'STT': i + 1,
        'Ngày QT': fmtDate(s.settlement_date),
        'NCC': s.supplier?.name || '—',
        'Nguồn': sourceLabel(s.source_type),
        'Biển xe': s.vehicle_plate || '',
        'KL cân (kg)': s.gross_weight_kg || '',
        'DRC (%)': s.drc_percent || '',
        'KL khô (kg)': s.dry_rubber_kg || '',
        'Đơn giá': s.approved_price || '',
        'Tiền tệ': s.price_currency || 'VND',
        'Thành tiền': s.total_amount || '',
        'Tỷ giá': s.exchange_rate || '',
        'TT (VND)': s.total_amount_vnd || s.total_amount || '',
        'Đã trả': s.paid_amount || 0,
        'Còn nợ': (s.total_amount_vnd || s.total_amount || 0) - (s.paid_amount || 0),
        'Trạng thái': s.status === 'paid' ? 'Đã trả đủ' :
                      s.status === 'partial_paid' ? 'Trả 1 phần' :
                      s.status === 'approved' ? 'Đã duyệt' : 'Nháp',
      }))

      const ws3 = XLSX.utils.json_to_sheet(settleRows)
      ws3['!cols'] = [
        { wch: 4 }, { wch: 12 }, { wch: 25 }, { wch: 18 }, { wch: 12 },
        { wch: 12 }, { wch: 8 }, { wch: 12 }, { wch: 14 }, { wch: 8 },
        { wch: 16 }, { wch: 8 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 12 },
      ]
      XLSX.utils.book_append_sheet(wb, ws3, 'Quyết toán')
    }

    // Generate blob
    const wbOut = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
    return new Blob([wbOut], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  } catch (err) {
    console.error('Export Excel error:', err)
    return null
  }
}

/** Trigger download of dashboard Excel */
export async function downloadDashboardExcel(year: number, month: number): Promise<boolean> {
  const blob = await exportDashboardExcel(year, month)
  if (!blob) return false

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `thu-mua-mu-${year}-T${String(month).padStart(2, '0')}.xlsx`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  return true
}

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

const rubberExportService = {
  exportSettlementPDF,
  downloadSettlementPDF,
  exportDashboardExcel,
  downloadDashboardExcel,
}

export default rubberExportService