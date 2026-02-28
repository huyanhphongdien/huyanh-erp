// ============================================================================
// FILE: src/services/rubber/rubberDashboardService.ts
// MODULE: Thu mua Mủ Cao su — Huy Anh Rubber ERP
// PHASE: 3.6 — Bước 3.6.17
// MÔ TẢ: Dashboard tổng hợp thu mua mủ — thay thế file Excel
//         + getMonthlySummary (Việt + Lào TT + Lào ĐL)
//         + getTrackingTable (bảng theo dõi Lào format Excel)
//         + getSupplierPivot (pivot theo NCC)
//         + getMonthlyTrend (biểu đồ theo tháng)
// BẢNG: rubber_intake_batches, lao_fund_transfers, lao_shipments,
//        rubber_settlements, rubber_settlement_payments, rubber_suppliers
// ============================================================================

import { supabase } from '../../lib/supabase'
import type {
  RubberSourceType,
  RubberMonthlySummary,
  RubberSupplierReport,
  LaoTrackingRow,
  RubberDebtSummary,
} from './rubber.types'

// ============================================================================
// SERVICE
// ============================================================================

export const rubberDashboardService = {

  // ==========================================================================
  // MONTHLY SUMMARY — Tổng hợp Việt + Lào theo tháng
  // Summary cards: 🇻🇳 Việt | 🇱🇦 Lào TT | 🤝 Lào ĐL | 📊 Tổng
  // ==========================================================================
  async getMonthlySummary(
    year: number,
    month: number
  ): Promise<RubberMonthlySummary> {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`
    const endDate = month === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(month + 1).padStart(2, '0')}-01`

    // 1. Intake batches (không lấy draft)
    const { data: intakes, error: iErr } = await supabase
      .from('rubber_intake_batches')
      .select(`
        source_type, supplier_id,
        settled_qty_ton, settled_price_per_ton,
        purchase_qty_kg, total_amount, price_currency,
        gross_weight_kg, net_weight_kg, drc_percent,
        finished_product_ton, exchange_rate
      `)
      .gte('intake_date', startDate)
      .lt('intake_date', endDate)
      .neq('status', 'draft')

    if (iErr) throw iErr

    // 2. Tồn quỹ Lào
    const { data: transfers, error: tErr } = await supabase
      .from('lao_fund_transfers')
      .select('net_received_lak, net_received_bath')

    if (tErr) throw tErr

    // Chi tiêu LAK/BATH (all time — cho tồn quỹ)
    const { data: laoIntakes, error: liErr } = await supabase
      .from('rubber_intake_batches')
      .select('total_amount, price_currency')
      .eq('source_type', 'lao_direct')
      .neq('status', 'draft')

    if (liErr) throw liErr

    const { data: shipments, error: sErr } = await supabase
      .from('lao_shipments')
      .select('loading_cost_lak, loading_cost_bath')

    if (sErr) throw sErr

    // ---- Tính toán ----
    const rows = (intakes || []) as any[]

    // Mủ Việt
    const vnRows = rows.filter(r => r.source_type === 'vietnam')
    const vnSuppliers = new Set(vnRows.map(r => r.supplier_id).filter(Boolean))
    const vnTotalTon = vnRows.reduce((s: number, r: any) => s + (r.settled_qty_ton ?? 0), 0)
    const vnTotalVnd = vnRows.reduce((s: number, r: any) => {
      return s + ((r.settled_qty_ton ?? 0) * (r.settled_price_per_ton ?? 0))
    }, 0)

    // Mủ Lào TT
    const laoTTRows = rows.filter(r => r.source_type === 'lao_direct')
    const laoTTKg = laoTTRows.reduce((s: number, r: any) => s + (r.purchase_qty_kg ?? 0), 0)
    let laoTTLak = 0
    let laoTTBath = 0
    for (const r of laoTTRows) {
      if (r.price_currency === 'LAK') laoTTLak += r.total_amount ?? 0
      else if (r.price_currency === 'BATH') laoTTBath += r.total_amount ?? 0
    }

    // Mủ Lào ĐL
    const laoDLRows = rows.filter(r => r.source_type === 'lao_agent')
    const laoDLKg = laoDLRows.reduce((s: number, r: any) => s + (r.purchase_qty_kg ?? 0), 0)
    const laoDLKip = laoDLRows
      .filter(r => r.price_currency === 'KIP')
      .reduce((s: number, r: any) => s + (r.total_amount ?? 0), 0)
    const laoDLVnd = laoDLRows.reduce((s: number, r: any) => {
      const amt = r.total_amount ?? 0
      const rate = r.exchange_rate ?? 0
      return s + (rate > 0 ? amt * rate : amt)
    }, 0)

    // Tồn quỹ Lào (all-time)
    const totalTransLak = (transfers || []).reduce((s: number, t: any) => s + (t.net_received_lak ?? 0), 0)
    const totalTransBath = (transfers || []).reduce((s: number, t: any) => s + (t.net_received_bath ?? 0), 0)

    let spentLak = 0, spentBath = 0
    for (const li of (laoIntakes || []) as any[]) {
      if (li.price_currency === 'LAK') spentLak += li.total_amount ?? 0
      if (li.price_currency === 'BATH') spentBath += li.total_amount ?? 0
    }
    for (const sh of (shipments || []) as any[]) {
      spentLak += sh.loading_cost_lak ?? 0
      spentBath += sh.loading_cost_bath ?? 0
    }

    // Tổng cộng
    const allFreshKg = rows.reduce((s: number, r: any) => s + (r.gross_weight_kg ?? 0), 0)
    const allIntakeKg = rows.reduce((s: number, r: any) => s + (r.net_weight_kg ?? 0), 0)
    const allFinishedTon = rows.reduce((s: number, r: any) => s + (r.finished_product_ton ?? 0), 0)
    const allAmountVnd = vnTotalVnd + laoDLVnd // Lào TT tính riêng bằng ngoại tệ

    return {
      year,
      month,
      // Việt
      vn_supplier_count: vnSuppliers.size,
      vn_total_settled_ton: round2(vnTotalTon),
      vn_total_amount_vnd: Math.round(vnTotalVnd),
      // Lào TT
      lao_direct_total_kg: round2(laoTTKg),
      lao_direct_total_lak: Math.round(laoTTLak),
      lao_direct_total_bath: Math.round(laoTTBath),
      lao_fund_balance_lak: Math.round(totalTransLak - spentLak),
      lao_fund_balance_bath: Math.round(totalTransBath - spentBath),
      // Lào ĐL
      lao_agent_total_kg: round2(laoDLKg),
      lao_agent_total_kip: Math.round(laoDLKip),
      lao_agent_total_vnd: Math.round(laoDLVnd),
      // Tổng
      total_fresh_weight_kg: round2(allFreshKg),
      total_intake_weight_kg: round2(allIntakeKg),
      total_finished_product_ton: round4(allFinishedTon),
      total_amount_vnd: Math.round(allAmountVnd),
    }
  },

  // ==========================================================================
  // SUPPLIER PIVOT — Bảng pivot theo NCC
  // Cột: NCC | Source | KL chốt | KL tươi | KL nhập | DRC | TP NK | Số tiền
  // ==========================================================================
  async getSupplierPivot(
    year: number,
    month: number,
    sourceType?: RubberSourceType
  ): Promise<RubberSupplierReport[]> {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`
    const endDate = month === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(month + 1).padStart(2, '0')}-01`

    let query = supabase
      .from('rubber_intake_batches')
      .select(`
        supplier_id, source_type, price_currency,
        gross_weight_kg, net_weight_kg, drc_percent,
        finished_product_ton, total_amount,
        settled_qty_ton, settled_price_per_ton,
        supplier:rubber_suppliers(id, name)
      `)
      .gte('intake_date', startDate)
      .lt('intake_date', endDate)
      .neq('status', 'draft')

    if (sourceType) query = query.eq('source_type', sourceType)

    const { data, error } = await query
    if (error) throw error

    const map = new Map<string, RubberSupplierReport>()

    for (const row of (data || []) as any[]) {
      const key = `${row.supplier_id || 'unknown'}_${row.source_type}`
      if (!map.has(key)) {
        map.set(key, {
          supplier_id: row.supplier_id || 'unknown',
          supplier_name: row.supplier?.name || 'Không rõ',
          source_type: row.source_type,
          batch_count: 0,
          total_fresh_weight_kg: 0,
          total_intake_weight_kg: 0,
          avg_drc_percent: 0,
          total_finished_product_ton: 0,
          total_amount: 0,
          currency: row.price_currency || 'VND',
        })
      }

      const r = map.get(key)!
      r.batch_count++
      r.total_fresh_weight_kg += row.gross_weight_kg ?? 0
      r.total_intake_weight_kg += row.net_weight_kg ?? 0
      r.total_finished_product_ton += row.finished_product_ton ?? 0

      // Mủ Việt: amount = settled_qty_ton × settled_price_per_ton
      if (row.source_type === 'vietnam') {
        r.total_amount += (row.settled_qty_ton ?? 0) * (row.settled_price_per_ton ?? 0)
      } else {
        r.total_amount += row.total_amount ?? 0
      }

      // DRC tích luỹ (tính avg sau)
      if (row.drc_percent && row.drc_percent > 0) {
        r.avg_drc_percent += row.drc_percent
      }
    }

    // Tính avg DRC
    for (const r of map.values()) {
      if (r.batch_count > 0 && r.avg_drc_percent > 0) {
        r.avg_drc_percent = round2(r.avg_drc_percent / r.batch_count)
      }
      r.total_fresh_weight_kg = round2(r.total_fresh_weight_kg)
      r.total_intake_weight_kg = round2(r.total_intake_weight_kg)
      r.total_finished_product_ton = round4(r.total_finished_product_ton)
      r.total_amount = Math.round(r.total_amount)
    }

    return Array.from(map.values())
      .sort((a, b) => {
        // Sort: vietnam → lao_direct → lao_agent, then by amount desc
        const order: Record<string, number> = { vietnam: 0, lao_direct: 1, lao_agent: 2 }
        const diff = (order[a.source_type] ?? 9) - (order[b.source_type] ?? 9)
        return diff !== 0 ? diff : b.total_amount - a.total_amount
      })
  },

  // ==========================================================================
  // LAO TRACKING TABLE — Bảng theo dõi Lào thay Excel
  // STT | Ngày | Chuyển tiền | Mua | Xuất NM | Tồn kho | Tồn quỹ
  // ==========================================================================
  async getTrackingTable(
    year: number,
    month: number
  ): Promise<LaoTrackingRow[]> {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`
    const endDate = month === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(month + 1).padStart(2, '0')}-01`

    // 1. Chuyển tiền trong tháng
    const { data: transfers } = await supabase
      .from('lao_fund_transfers')
      .select('transfer_date, net_received_lak, net_received_bath, notes')
      .gte('transfer_date', startDate)
      .lt('transfer_date', endDate)
      .order('transfer_date', { ascending: true })

    // 2. Thu mua Lào TT trong tháng
    const { data: purchases } = await supabase
      .from('rubber_intake_batches')
      .select(`
        intake_date, location_name, purchase_qty_kg,
        unit_price, price_currency, total_amount, notes
      `)
      .eq('source_type', 'lao_direct')
      .neq('status', 'draft')
      .gte('intake_date', startDate)
      .lt('intake_date', endDate)
      .order('intake_date', { ascending: true })

    // 3. Shipments trong tháng
    const { data: ships } = await supabase
      .from('lao_shipments')
      .select('shipment_date, loading_weight_kg, arrival_weight_kg, notes')
      .gte('shipment_date', startDate)
      .lt('shipment_date', endDate)
      .order('shipment_date', { ascending: true })

    // 4. Merge tất cả events theo ngày
    const dayMap = new Map<string, LaoTrackingRow>()

    const getRow = (date: string): LaoTrackingRow => {
      if (!dayMap.has(date)) {
        dayMap.set(date, { date })
      }
      return dayMap.get(date)!
    }

    // Chuyển tiền
    for (const t of (transfers || []) as any[]) {
      const row = getRow(t.transfer_date)
      row.transfer_lak = (row.transfer_lak ?? 0) + (t.net_received_lak ?? 0)
      row.transfer_bath = (row.transfer_bath ?? 0) + (t.net_received_bath ?? 0)
      if (t.notes && !row.notes) row.notes = t.notes
    }

    // Thu mua
    for (const p of (purchases || []) as any[]) {
      const row = getRow(p.intake_date)
      row.purchase_location = p.location_name || row.purchase_location
      row.purchase_qty_kg = (row.purchase_qty_kg ?? 0) + (p.purchase_qty_kg ?? 0)
      row.purchase_price = p.unit_price ?? row.purchase_price
      row.purchase_currency = p.price_currency ?? row.purchase_currency
      row.purchase_amount = (row.purchase_amount ?? 0) + (p.total_amount ?? 0)
    }

    // Xuất NM
    for (const s of (ships || []) as any[]) {
      const row = getRow(s.shipment_date)
      row.shipment_weight_kg = (row.shipment_weight_kg ?? 0) + (s.loading_weight_kg ?? 0)
      row.shipment_arrival_kg = (row.shipment_arrival_kg ?? 0) + (s.arrival_weight_kg ?? 0)
    }

    // Sort by date + tính running balance
    const sorted = Array.from(dayMap.values())
      .sort((a, b) => a.date.localeCompare(b.date))

    // Running balance (simplified: chỉ trong tháng, cần balance đầu kỳ cho chính xác)
    let runLak = 0, runBath = 0, runKg = 0

    for (const row of sorted) {
      // Tồn quỹ
      runLak += (row.transfer_lak ?? 0) - (
        row.purchase_currency === 'LAK' ? (row.purchase_amount ?? 0) : 0
      )
      runBath += (row.transfer_bath ?? 0) - (
        row.purchase_currency === 'BATH' ? (row.purchase_amount ?? 0) : 0
      )
      row.fund_balance_lak = Math.round(runLak)
      row.fund_balance_bath = Math.round(runBath)

      // Tồn kho kg (mua - xuất)
      runKg += (row.purchase_qty_kg ?? 0) - (row.shipment_weight_kg ?? 0)
      row.stock_balance_kg = round2(runKg)
    }

    return sorted
  },

  // ==========================================================================
  // MONTHLY TREND — Biểu đồ KL theo tháng (12 tháng gần nhất)
  // Bar chart: Việt / Lào TT / Lào ĐL
  // ==========================================================================
  async getMonthlyTrend(
    year: number
  ): Promise<Array<{
    month: number
    label: string
    vietnam_ton: number
    lao_direct_kg: number
    lao_agent_kg: number
    total_vnd: number
  }>> {
    const startDate = `${year}-01-01`
    const endDate = `${year + 1}-01-01`

    const { data, error } = await supabase
      .from('rubber_intake_batches')
      .select(`
        intake_date, source_type,
        settled_qty_ton, settled_price_per_ton,
        purchase_qty_kg, total_amount, price_currency,
        exchange_rate, finished_product_ton
      `)
      .gte('intake_date', startDate)
      .lt('intake_date', endDate)
      .neq('status', 'draft')

    if (error) throw error

    // Init 12 months
    const months = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      label: `T${i + 1}`,
      vietnam_ton: 0,
      lao_direct_kg: 0,
      lao_agent_kg: 0,
      total_vnd: 0,
    }))

    for (const row of (data || []) as any[]) {
      const m = parseInt(row.intake_date?.substring(5, 7), 10)
      if (m < 1 || m > 12) continue
      const bucket = months[m - 1]

      switch (row.source_type) {
        case 'vietnam':
          bucket.vietnam_ton += row.settled_qty_ton ?? 0
          bucket.total_vnd += (row.settled_qty_ton ?? 0) * (row.settled_price_per_ton ?? 0)
          break
        case 'lao_direct':
          bucket.lao_direct_kg += row.purchase_qty_kg ?? 0
          // Lào TT không cộng vào total_vnd (ngoại tệ)
          break
        case 'lao_agent':
          bucket.lao_agent_kg += row.purchase_qty_kg ?? 0
          bucket.total_vnd += (row.total_amount ?? 0) * (row.exchange_rate ?? 1)
          break
      }
    }

    // Round
    for (const m of months) {
      m.vietnam_ton = round2(m.vietnam_ton)
      m.lao_direct_kg = round2(m.lao_direct_kg)
      m.lao_agent_kg = round2(m.lao_agent_kg)
      m.total_vnd = Math.round(m.total_vnd)
    }

    return months
  },

  // ==========================================================================
  // DEBT OVERVIEW — Tổng quan công nợ (delegate to settlementService)
  // Tóm tắt nhanh cho dashboard cards
  // ==========================================================================
  async getDebtOverview(): Promise<{
    total_debt_vnd: number
    total_suppliers_with_debt: number
    overdue_count: number
  }> {
    const { data, error } = await supabase
      .from('rubber_settlements')
      .select(`
        id, supplier_id, total_amount, total_amount_vnd, source_type, status,
        payments:rubber_settlement_payments(amount)
      `)
      .in('status', ['approved', 'partial_paid'])

    if (error) throw error

    let totalDebt = 0
    const suppliersWithDebt = new Set<string>()

    for (const row of (data || []) as any[]) {
      const target = row.total_amount_vnd ?? row.total_amount ?? 0
      const paid = ((row.payments || []) as { amount: number }[])
        .reduce((s: number, p: { amount: number }) => s + (p.amount || 0), 0)
      const remaining = target - paid

      if (remaining > 0) {
        totalDebt += remaining
        if (row.supplier_id) suppliersWithDebt.add(row.supplier_id)
      }
    }

    return {
      total_debt_vnd: Math.round(totalDebt),
      total_suppliers_with_debt: suppliersWithDebt.size,
      overdue_count: 0, // TODO: implement based on settlement_date + payment terms
    }
  },
}

// ============================================================================
// HELPERS
// ============================================================================

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000
}

// ============================================================================
// STANDALONE EXPORTS
// ============================================================================

export const {
  getMonthlySummary: getRubberMonthlySummary,
  getSupplierPivot: getRubberSupplierPivot,
  getTrackingTable: getLaoTrackingTable,
  getMonthlyTrend: getRubberMonthlyTrend,
  getDebtOverview: getRubberDebtOverview,
} = rubberDashboardService

export default rubberDashboardService