// ============================================================================
// AUTO SETTLEMENT SERVICE — Tự động tạo Quyết toán từ Deal
// File: src/services/b2b/autoSettlementService.ts
// Phase: E5
// ============================================================================

import { supabase } from '../../lib/supabase'
import type { Settlement, SettlementCreateData } from './settlementService'

// ============================================
// TYPES
// ============================================

export interface AutoSettlementResult {
  settlement: Settlement
  summary: {
    actual_weight_kg: number
    actual_drc: number
    price_per_kg: number
    final_value: number
    total_advanced: number
    balance_due: number
    stock_in_count: number
  }
}

// ============================================
// HELPER
// ============================================

const generateSettlementCode = (): string => {
  const now = new Date()
  const year = now.getFullYear()
  const month = (now.getMonth() + 1).toString().padStart(2, '0')
  const day = now.getDate().toString().padStart(2, '0')
  const random = Math.random().toString(36).substring(2, 5).toUpperCase()
  return `QT-${year}${month}${day}-${random}`
}

// ============================================
// SERVICE
// ============================================

export const autoSettlementService = {
  /**
   * Tạo phiếu Quyết toán tự động từ Deal đã duyệt
   * - Lấy thông tin deal (actual_drc, actual_weight_kg, unit_price, final_price, partner_id)
   * - Lấy các phiếu nhập kho confirmed
   * - Tính final_value = actual_weight_kg × (actual_drc/100) × (final_price || unit_price)
   * - Lấy các phiếu tạm ứng đã chi (paid)
   * - Tính balance_due = final_value - total_advanced
   * - Tạo settlement draft + settlement items
   */
  async createAutoSettlement(dealId: string): Promise<AutoSettlementResult> {
    // ─── Gap #3: Chặn tạo settlement khi có active dispute ───
    const { data: activeDisputes, error: disputeErr } = await supabase
      .from('b2b_drc_disputes')
      .select('id, dispute_number, status')
      .eq('deal_id', dealId)
      .in('status', ['open', 'investigating'])
      .limit(1)
    if (disputeErr) throw new Error(`Không thể kiểm tra khiếu nại: ${disputeErr.message}`)
    if (activeDisputes && activeDisputes.length > 0) {
      const d = activeDisputes[0]
      throw new Error(
        `Deal đang có khiếu nại ${d.dispute_number} chưa giải quyết (${d.status}). Phải xử lý khiếu nại trước khi quyết toán.`,
      )
    }

    // ─── 1. Lấy thông tin Deal ───
    const { data: deal, error: dealError } = await supabase
      .from('b2b_deals')
      .select(`
        id, deal_number, partner_id, product_name, product_code,
        quantity_kg, unit_price, final_price, deal_type, price_unit,
        processing_fee_per_ton, expected_output_rate,
        actual_drc, actual_weight_kg, final_value,
        partner:b2b_partners!partner_id ( id, code, name )
      `)
      .eq('id', dealId)
      .single()

    if (dealError) throw new Error(`Không thể lấy thông tin Deal: ${dealError.message}`)
    if (!deal) throw new Error('Deal không tồn tại')

    const actualDrc = deal.actual_drc
    const actualWeightKg = deal.actual_weight_kg || 0

    if (!actualDrc) {
      throw new Error('Deal chưa có dữ liệu DRC thực tế. Vui lòng kiểm tra QC trước khi quyết toán.')
    }

    if (actualWeightKg <= 0) {
      throw new Error('Deal chưa có trọng lượng thực tế. Vui lòng kiểm tra phiếu nhập kho.')
    }

    // ─── 2. Lấy phiếu nhập kho confirmed cho Deal ───
    const { data: stockIns, error: stockInError } = await supabase
      .from('stock_in_orders')
      .select('id, code, total_weight, total_quantity, confirmed_at, created_at')
      .eq('deal_id', dealId)
      .eq('status', 'confirmed')
      .order('created_at', { ascending: true })

    if (stockInError) throw new Error(`Không thể lấy phiếu nhập kho: ${stockInError.message}`)

    const confirmedStockIns = stockIns || []
    const stockInIds = confirmedStockIns.map(si => si.id)

    // ─── 3. Tính giá trị thực tế ───
    const pricePerKg = deal.final_price || deal.unit_price || 0
    const priceUnit = (deal as any).price_unit || 'wet'
    const dealType = (deal as any).deal_type || 'purchase'
    const processingFeePerTon = (deal as any).processing_fee_per_ton || 0
    const expectedOutputRate = (deal as any).expected_output_rate || 80

    let finalValue: number
    let settlementNotes = ''

    if (dealType === 'processing') {
      // Gia công: Tính từ sản lượng đầu ra
      // output_kg = input_kg × (yield / 100)
      const estimatedOutputKg = actualWeightKg * (expectedOutputRate / 100)
      // Phí gia công = input_tons × fee_per_ton
      const processingFee = (actualWeightKg / 1000) * processingFeePerTon
      // Giá trị thành phẩm ước tính (dùng giá thị trường nếu có, hoặc = 0)
      const outputValue = pricePerKg > 0 ? Math.round(estimatedOutputKg * pricePerKg) : 0
      // Đại lý nhận = giá trị TP - phí gia công
      finalValue = outputValue > 0 ? outputValue - Math.round(processingFee) : Math.round(-processingFee)
      settlementNotes = `Gia công: NVL ${(actualWeightKg/1000).toFixed(1)}T → TP ~${(estimatedOutputKg/1000).toFixed(1)}T (${expectedOutputRate}%). Phí GC: ${processingFee.toLocaleString()} VNĐ`
    } else {
      // Mua đứt: Tính từ khối lượng NVL
      if (pricePerKg <= 0) {
        throw new Error('Deal chưa có đơn giá. Vui lòng kiểm tra đơn giá trước khi quyết toán.')
      }
      finalValue = priceUnit === 'dry'
        ? Math.round(actualWeightKg * (actualDrc / 100) * pricePerKg)
        : Math.round(actualWeightKg * pricePerKg)
    }

    // ─── 4. Lấy tạm ứng đã chi (paid) cho Deal ───
    const { data: advances, error: advError } = await supabase
      .from('b2b_advances')
      .select('id, amount, payment_date, advance_number, purpose')
      .eq('deal_id', dealId)
      .eq('status', 'paid')
      .order('payment_date', { ascending: true })

    if (advError) throw new Error(`Không thể lấy tạm ứng: ${advError.message}`)

    const paidAdvances = advances || []
    const totalAdvanced = paidAdvances.reduce((sum, a) => sum + (a.amount || 0), 0)

    // ─── Gap #5: Chặn advance > final_value (dẫn đến balance âm) ───
    // Chỉ cảnh báo, không chặn cứng vì có trường hợp hợp lệ (VD: gia công lỗ)
    // nhưng log để audit. Trong trường hợp purchase thường không nên vượt.
    if (totalAdvanced > finalValue && finalValue > 0 && dealType !== 'processing') {
      throw new Error(
        `Tổng tạm ứng (${totalAdvanced.toLocaleString('vi-VN')} đ) lớn hơn giá trị deal thực tế ` +
        `(${finalValue.toLocaleString('vi-VN')} đ). Vui lòng kiểm tra lại advances hoặc điều chỉnh ` +
        `trước khi quyết toán.`,
      )
    }

    // ─── 5. Tính số dư phải trả ───
    const balanceDue = finalValue - totalAdvanced

    // ─── 6. Tạo settlement code ───
    const code = generateSettlementCode()

    // ─── 7. Xác định khoảng ngày cân + aggregate xe/tài xế từ weighbridge_tickets ───
    let weighDateStart: string | null = null
    let weighDateEnd: string | null = null
    let aggregatedVehiclePlates: string[] = []
    let aggregatedDriverNames: string[] = []
    let aggregatedDriverPhones: string[] = []

    if (confirmedStockIns.length > 0) {
      weighDateStart = confirmedStockIns[0].confirmed_at || confirmedStockIns[0].created_at
      const last = confirmedStockIns[confirmedStockIns.length - 1]
      weighDateEnd = last.confirmed_at || last.created_at
    }

    // Query weighbridge_tickets của deal để lấy xe + tài xế (1 deal nhiều xe)
    const { data: tickets } = await supabase
      .from('weighbridge_tickets')
      .select('vehicle_plate, driver_name, driver_phone, gross_weighed_at, completed_at')
      .eq('deal_id', dealId)
      .eq('ticket_type', 'IN')
      .order('gross_weighed_at', { ascending: true, nullsFirst: false })

    if (tickets && tickets.length > 0) {
      // Distinct vehicle plates
      const plateSet = new Set<string>()
      const driverSet = new Set<string>()
      const phoneSet = new Set<string>()
      for (const t of tickets) {
        if (t.vehicle_plate) plateSet.add(t.vehicle_plate)
        if (t.driver_name) driverSet.add(t.driver_name)
        if (t.driver_phone) phoneSet.add(t.driver_phone)
      }
      aggregatedVehiclePlates = Array.from(plateSet)
      aggregatedDriverNames = Array.from(driverSet)
      aggregatedDriverPhones = Array.from(phoneSet)

      // Narrow weigh_date range từ ticket (chính xác hơn stock_in_orders)
      const firstTicketDate = tickets[0].gross_weighed_at || tickets[0].completed_at
      const lastTicket = tickets[tickets.length - 1]
      const lastTicketDate = lastTicket.gross_weighed_at || lastTicket.completed_at
      if (firstTicketDate) weighDateStart = firstTicketDate
      if (lastTicketDate) weighDateEnd = lastTicketDate
    }

    // ─── 8. Lấy employee_id của user hiện tại (FK settlements.created_by → employees.id) ───
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.id) throw new Error('Chưa đăng nhập')
    const { data: employee } = await supabase
      .from('employees')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()
    if (!employee?.id) {
      throw new Error('Tài khoản chưa liên kết với employee — không thể tạo phiếu quyết toán')
    }
    const createdBy = employee.id

    // ─── 9. Tạo settlement record ───
    const { data: settlement, error: createError } = await supabase
      .from('b2b_settlements')
      .insert({
        code,
        partner_id: deal.partner_id,
        deal_id: dealId,
        intake_ids: stockInIds,
        settlement_type: (deal.deal_type === 'sale' ? 'sale' : deal.deal_type === 'processing' ? 'processing' : 'purchase') as 'purchase' | 'sale' | 'processing',
        product_type: deal.product_name,
        weighed_kg: actualWeightKg,
        finished_kg: priceUnit === 'dry'
          ? Math.round(actualWeightKg * (actualDrc / 100) * 100) / 100
          : actualWeightKg,
        drc_percent: actualDrc,
        approved_price: pricePerKg,
        // gross_amount + remaining_amount là GENERATED columns (finished_kg *
        // approved_price), DB tự compute — KHÔNG được INSERT giá trị trực tiếp
        // (PG reject: "cannot insert a non-DEFAULT value into column gross_amount").
        total_advance: totalAdvanced,
        total_paid_post: 0,
        vehicle_plates: aggregatedVehiclePlates,
        driver_name: aggregatedDriverNames.join(', ') || null,
        driver_phone: aggregatedDriverPhones.join(', ') || null,
        weigh_date_start: weighDateStart,
        weigh_date_end: weighDateEnd,
        stock_in_date: weighDateStart,
        status: 'draft',
        notes: settlementNotes
          ? `${settlementNotes}. Tạo tự động từ Deal ${deal.deal_number}`
          : `Tạo tự động từ Deal ${deal.deal_number}`,
        created_by: createdBy,
      })
      .select(`
        *,
        partner:b2b_partners!partner_id (
          id, code, name, tier, phone, email
        )
      `)
      .single()

    if (createError) throw new Error(`Không thể tạo phiếu quyết toán: ${createError.message}`)

    // ─── 10. Tạo settlement items từ các phiếu nhập kho ───
    if (confirmedStockIns.length > 0) {
      const items = confirmedStockIns.map(si => ({
        settlement_id: settlement.id,
        item_type: 'stock_in',
        description: `Phiếu nhập kho ${si.code} — ${(si.total_weight || 0).toLocaleString()} kg`,
        quantity: si.total_quantity || null,
        unit_price: pricePerKg || null,
        amount: priceUnit === 'dry'
          ? Math.round((si.total_weight || 0) * (actualDrc / 100) * pricePerKg)
          : Math.round((si.total_weight || 0) * pricePerKg),
        is_credit: false,
        notes: null,
      }))

      const { error: itemsError } = await supabase
        .from('b2b_settlement_items')
        .insert(items)

      if (itemsError) {
        console.error('Lỗi tạo settlement items:', itemsError)
      }
    }

    // ─── 11. Link tạm ứng vào settlement ───
    if (paidAdvances.length > 0) {
      const advanceLinks = paidAdvances.map((adv, idx) => ({
        settlement_id: settlement.id,
        advance_id: adv.id,
        advance_date: adv.payment_date,
        amount: adv.amount,
        notes: adv.purpose || `Tạm ứng ${adv.advance_number}`,
        sort_order: idx,
      }))

      const { error: advLinkError } = await supabase
        .from('b2b_settlement_advances')
        .insert(advanceLinks)

      if (advLinkError) {
        console.error('Lỗi link tạm ứng:', advLinkError)
      }
    }

    // ─── 12. Trả kết quả ───
    const result: AutoSettlementResult = {
      settlement: {
        ...settlement,
        partner: Array.isArray(settlement.partner) ? settlement.partner[0] : settlement.partner,
      } as Settlement,
      summary: {
        actual_weight_kg: actualWeightKg,
        actual_drc: actualDrc,
        price_per_kg: pricePerKg,
        final_value: finalValue,
        total_advanced: totalAdvanced,
        balance_due: balanceDue,
        stock_in_count: confirmedStockIns.length,
      },
    }

    return result
  },

  /**
   * Kiểm tra xem Deal đã có settlement chưa (tránh tạo trùng)
   */
  async getExistingSettlement(dealId: string): Promise<Settlement | null> {
    const { data, error } = await supabase
      .from('b2b_settlements')
      .select(`
        *,
        partner:b2b_partners!partner_id (
          id, code, name, tier, phone, email
        )
      `)
      .eq('deal_id', dealId)
      .neq('status', 'cancelled')
      .maybeSingle()

    if (error) {
      console.error('Lỗi kiểm tra settlement:', error)
      return null
    }
    if (!data) return null

    return {
      ...data,
      partner: Array.isArray(data.partner) ? data.partner[0] : data.partner,
    } as Settlement
  },
}

export default autoSettlementService
