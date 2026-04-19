// ============================================================================
// DEAL-WMS BRIDGE SERVICE
// File: src/services/b2b/dealWmsService.ts
// Phase: 4.1 — Liên kết B2B Deals với WMS (Stock-In, Batches, QC, Weighbridge)
// ============================================================================

import { supabase } from '../../lib/supabase'
import { patchDealCardMetadata } from './dealChatActionsService'

// ============================================
// TYPES
// ============================================

export interface DealStockInSummary {
  stock_in_id: string
  code: string
  warehouse_name: string
  status: 'draft' | 'confirmed' | 'cancelled'
  total_quantity: number
  total_weight: number
  confirmed_at: string | null
  created_at: string
}

export interface DealBatchSummary {
  batch_id: string
  batch_no: string
  material_name: string
  initial_drc: number | null
  latest_drc: number | null
  qc_status: string
  quantity_remaining: number
  received_date: string
  last_qc_date: string | null
}

export interface DealWeighbridgeSummary {
  ticket_id: string
  code: string
  vehicle_plate: string
  net_weight: number | null
  status: string
  completed_at: string | null
}

export interface DealWmsOverview {
  deal_id: string
  stock_in_count: number
  total_received_kg: number
  batch_count: number
  avg_drc: number | null
  weighbridge_count: number
  total_weighed_kg: number
  qc_summary: {
    passed: number
    warning: number
    failed: number
    pending: number
  }
}

export interface ActiveDealForStockIn {
  id: string
  deal_number: string
  partner_name: string
  partner_id?: string
  product_name: string
  quantity_kg: number
  received_kg: number
  remaining_kg: number
  // Auto-fill weighbridge khi chọn deal
  expected_drc?: number | null
  unit_price?: number | null
  price_unit?: 'wet' | 'dry' | null
  rubber_type?: string | null
  target_facility_id?: string | null
  lot_code?: string | null
}

// ============================================
// SERVICE
// ============================================

export const dealWmsService = {

  /**
   * Lấy tất cả phiếu nhập kho của 1 Deal
   */
  async getStockInsByDeal(dealId: string): Promise<DealStockInSummary[]> {
    const { data, error } = await supabase
      .from('stock_in_orders')
      .select(`
        id, code, status, total_quantity, total_weight,
        confirmed_at, created_at,
        warehouse:warehouses!warehouse_id ( name )
      `)
      .eq('deal_id', dealId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('getStockInsByDeal error:', error)
      return []
    }

    return (data || []).map((si: any) => ({
      stock_in_id: si.id,
      code: si.code,
      warehouse_name: si.warehouse?.name || '',
      status: si.status,
      total_quantity: si.total_quantity || 0,
      total_weight: si.total_weight || 0,
      confirmed_at: si.confirmed_at,
      created_at: si.created_at,
    }))
  },

  /**
   * Lấy tất cả batches thuộc Deal (qua stock_in_details)
   */
  async getBatchesByDeal(dealId: string): Promise<DealBatchSummary[]> {
    // 1. Lấy stock_in_ids thuộc deal
    const { data: stockIns } = await supabase
      .from('stock_in_orders')
      .select('id')
      .eq('deal_id', dealId)
      .eq('status', 'confirmed')

    const stockInIds = (stockIns || []).map((s: any) => s.id)
    if (stockInIds.length === 0) return []

    // 2. Lấy details có batch_id
    const { data: details } = await supabase
      .from('stock_in_details')
      .select(`
        batch_id, created_at,
        batch:stock_batches!batch_id (
          id, batch_no, initial_drc, latest_drc, qc_status, quantity_remaining,
          material:materials!material_id ( name )
        )
      `)
      .in('stock_in_id', stockInIds)
      .not('batch_id', 'is', null)

    if (!details) return []

    return details
      .filter((d: any) => d.batch)
      .map((d: any) => ({
        batch_id: d.batch.id,
        batch_no: d.batch.batch_no,
        material_name: d.batch.material?.name || '',
        initial_drc: d.batch.initial_drc,
        latest_drc: d.batch.latest_drc,
        qc_status: d.batch.qc_status || 'pending',
        quantity_remaining: d.batch.quantity_remaining || 0,
        received_date: d.created_at,
        last_qc_date: null, // Sẽ lấy từ batch_qc_results nếu cần
      }))
  },

  /**
   * Lấy phiếu cân liên quan đến Deal (qua stock_in reference)
   */
  async getWeighbridgeByDeal(dealId: string): Promise<DealWeighbridgeSummary[]> {
    // Lấy stock_in_ids thuộc deal
    const { data: stockIns } = await supabase
      .from('stock_in_orders')
      .select('id')
      .eq('deal_id', dealId)

    const stockInIds = (stockIns || []).map((s: any) => s.id)
    if (stockInIds.length === 0) return []

    // Lấy weighbridge tickets linked tới các stock-in này
    const { data: tickets } = await supabase
      .from('weighbridge_tickets')
      .select('id, code, vehicle_plate, net_weight, status, completed_at')
      .eq('reference_type', 'stock_in')
      .in('reference_id', stockInIds)
      .order('created_at', { ascending: false })

    return (tickets || []).map((t: any) => ({
      ticket_id: t.id,
      code: t.code,
      vehicle_plate: t.vehicle_plate,
      net_weight: t.net_weight,
      status: t.status,
      completed_at: t.completed_at,
    }))
  },

  /**
   * Tổng hợp WMS data cho 1 Deal
   */
  async getDealWmsOverview(dealId: string): Promise<DealWmsOverview> {
    const [stockIns, batches, weighbridges] = await Promise.all([
      this.getStockInsByDeal(dealId),
      this.getBatchesByDeal(dealId),
      this.getWeighbridgeByDeal(dealId),
    ])

    const confirmedStockIns = stockIns.filter(si => si.status === 'confirmed')
    const totalReceivedKg = confirmedStockIns.reduce((sum, si) => sum + si.total_weight, 0)
    const totalWeighedKg = weighbridges.reduce((sum, w) => sum + (w.net_weight || 0), 0)

    // Tính weighted average DRC
    let totalDrcWeight = 0
    let totalWeight = 0
    const qcSummary = { passed: 0, warning: 0, failed: 0, pending: 0 }

    for (const batch of batches) {
      if (batch.latest_drc && batch.quantity_remaining > 0) {
        totalDrcWeight += batch.latest_drc * batch.quantity_remaining
        totalWeight += batch.quantity_remaining
      }
      const status = batch.qc_status as keyof typeof qcSummary
      if (status in qcSummary) qcSummary[status]++
    }

    const avgDrc = totalWeight > 0
      ? Math.round((totalDrcWeight / totalWeight) * 100) / 100
      : null

    return {
      deal_id: dealId,
      stock_in_count: stockIns.length,
      total_received_kg: totalReceivedKg,
      batch_count: batches.length,
      avg_drc: avgDrc,
      weighbridge_count: weighbridges.length,
      total_weighed_kg: totalWeighedKg,
      qc_summary: qcSummary,
    }
  },

  /**
   * Lấy danh sách Deals chưa hoàn tất nhập kho (cho dropdown chọn Deal)
   */
  async getActiveDealsForStockIn(
    partnerId?: string,
    /** Filter deals đi vào facility này. NULL deals (chưa assign) vẫn hiện để legacy. */
    currentFacilityId?: string,
  ): Promise<ActiveDealForStockIn[]> {
    // 1. Lấy deals status = 'processing' hoặc 'accepted'
    let query = supabase
      .from('b2b_deals')
      .select(`
        id, deal_number, product_name, quantity_kg, target_facility_id,
        expected_drc, unit_price, price_unit, rubber_type, lot_code, partner_id,
        partner:b2b_partners!partner_id ( id, name )
      `)
      .in('status', ['processing', 'accepted'])

    if (partnerId) {
      query = query.eq('partner_id', partnerId)
    }

    // Filter theo facility: trạm cân ở PD chỉ thấy deal đi PD, không nhầm
    // TL/LAO. Legacy deals có target_facility_id = NULL vẫn hiện để backward
    // compatible (có thể cân ở bất kỳ trạm nào).
    if (currentFacilityId) {
      query = query.or(`target_facility_id.is.null,target_facility_id.eq.${currentFacilityId}`)
    }

    const { data: deals, error } = await query

    if (error) {
      console.error('getActiveDealsForStockIn error:', error)
      return []
    }

    // 2. Lấy SL đã nhập cho mỗi deal
    const result: ActiveDealForStockIn[] = []
    for (const deal of (deals || [])) {
      const { data: stockIns } = await supabase
        .from('stock_in_orders')
        .select('total_weight')
        .eq('deal_id', (deal as any).id)
        .eq('status', 'confirmed')

      const receivedKg = (stockIns || [])
        .reduce((sum: number, si: any) => sum + (si.total_weight || 0), 0)

      const quantityKg = (deal as any).quantity_kg || 0

      const d = deal as any
      result.push({
        id: d.id,
        deal_number: d.deal_number,
        partner_name: d.partner?.name || '',
        partner_id: d.partner_id,
        product_name: d.product_name || '',
        quantity_kg: quantityKg,
        received_kg: receivedKg,
        remaining_kg: Math.max(0, quantityKg - receivedKg),
        expected_drc: d.expected_drc ?? null,
        unit_price: d.unit_price ?? null,
        price_unit: d.price_unit ?? null,
        rubber_type: d.rubber_type ?? null,
        target_facility_id: d.target_facility_id ?? null,
        lot_code: d.lot_code ?? null,
      })
    }

    return result.filter(d => d.remaining_kg > 0)
  },

  /**
   * Lấy thông tin delivery gần nhất của 1 Deal (từ chat message metadata)
   * Dùng bởi weighbridge để auto-fill biển số + tài xế khi operator chọn Deal
   * → tránh nhập trùng lặp thông tin đại lý đã cung cấp lúc báo đã giao.
   */
  async getLatestDeliveryForDeal(dealId: string): Promise<{
    quantity_kg?: number | null
    drc_at_delivery?: number | null
    delivery_date?: string | null
    vehicle_plate?: string | null
    driver_name?: string | null
    driver_phone?: string | null
    notes?: string | null
  } | null> {
    try {
      // Query message_type='system' với metadata.delivery.deal_id = dealId
      const { data, error } = await supabase
        .from('b2b_chat_messages')
        .select('metadata, sent_at')
        .eq('message_type', 'system')
        .contains('metadata', { delivery: { deal_id: dealId } })
        .order('sent_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (error || !data) return null
      const d = (data as any).metadata?.delivery
      if (!d) return null
      return {
        quantity_kg: d.quantity_kg ?? null,
        drc_at_delivery: d.drc_at_delivery ?? null,
        delivery_date: d.delivery_date ?? null,
        vehicle_plate: d.vehicle_plate ?? null,
        driver_name: d.driver_name ?? null,
        driver_phone: d.driver_phone ?? null,
        notes: d.notes ?? null,
      }
    } catch (e) {
      console.error('[getLatestDeliveryForDeal] error:', e)
      return null
    }
  },

  /**
   * Cập nhật actual_drc từ QC kết quả về Deal
   * Tính weighted average DRC từ tất cả batches thuộc Deal
   */
  async updateDealActualDrc(dealId: string): Promise<{
    actual_drc: number | null
    actual_weight_kg: number
    final_value: number | null
    qc_status: string
  } | null> {
    // 1. Lấy tất cả batches qua stock_in
    const { data: stockIns } = await supabase
      .from('stock_in_orders')
      .select('id')
      .eq('deal_id', dealId)
      .eq('status', 'confirmed')

    const stockInIds = (stockIns || []).map((s: any) => s.id)
    if (stockInIds.length === 0) return null

    const { data: details } = await supabase
      .from('stock_in_details')
      .select('batch_id, quantity, weight')
      .in('stock_in_id', stockInIds)

    const batchIds = (details || [])
      .map((d: any) => d.batch_id)
      .filter(Boolean) as string[]
    if (batchIds.length === 0) return null

    const { data: batches } = await supabase
      .from('stock_batches')
      .select('latest_drc, quantity_remaining, qc_status')
      .in('id', batchIds)

    // 2. Tính weighted average DRC
    let totalDrcWeight = 0
    let totalWeight = 0
    const qcSummary: Record<string, number> = { passed: 0, warning: 0, failed: 0, pending: 0 }

    for (const batch of (batches || [])) {
      if (batch.latest_drc && batch.quantity_remaining > 0) {
        totalDrcWeight += batch.latest_drc * batch.quantity_remaining
        totalWeight += batch.quantity_remaining
      }
      const status = batch.qc_status || 'pending'
      if (status in qcSummary) qcSummary[status]++
    }

    const avgDrc = totalWeight > 0
      ? Math.round((totalDrcWeight / totalWeight) * 100) / 100
      : null

    // 3. Tính actual_weight từ stock-in confirmed
    const actualWeight = (details || []).reduce((sum: number, d: any) => sum + (d.weight || 0), 0)

    // 4. Tính final_value
    const { data: deal } = await supabase
      .from('b2b_deals')
      .select('unit_price, quantity_kg, price_unit, deal_type')
      .eq('id', dealId)
      .single()

    let finalValue: number | null = null
    if (deal && avgDrc && actualWeight > 0) {
      const priceUnit = (deal as any).price_unit || 'wet'
      const dealType = (deal as any).deal_type || 'purchase'

      if (dealType === 'processing') {
        // Gia công: final_value tính sau khi SX xong, không tính ở đây
        finalValue = null
      } else if (priceUnit === 'dry') {
        // Giá khô: weight × DRC/100 × price
        finalValue = Math.round(actualWeight * (avgDrc / 100) * (deal.unit_price || 0))
      } else {
        // Giá ướt: weight × price (DRC chỉ dùng tham khảo)
        finalValue = Math.round(actualWeight * (deal.unit_price || 0))
      }
    }

    // 5. Tổng hợp QC status
    let qcStatus = 'pending'
    if (qcSummary.failed > 0) qcStatus = 'failed'
    else if (qcSummary.warning > 0) qcStatus = 'warning'
    else if (qcSummary.passed > 0 && qcSummary.pending === 0) qcStatus = 'passed'

    // 6. Update deal
    await supabase
      .from('b2b_deals')
      .update({
        actual_drc: avgDrc,
        // actual_weight_kg: removed — only updateDealStockInTotals writes this
        final_value: finalValue,
        qc_status: qcStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', dealId)

    return { actual_drc: avgDrc, actual_weight_kg: actualWeight, final_value: finalValue, qc_status: qcStatus }
  },

  /**
   * Cập nhật deal totals sau khi confirm stock-in
   */
  async updateDealStockInTotals(dealId: string): Promise<void> {
    // Đếm số phiếu nhập + tổng trọng lượng
    const { data: stockIns } = await supabase
      .from('stock_in_orders')
      .select('id, total_weight, status')
      .eq('deal_id', dealId)

    const confirmedStockIns = (stockIns || []).filter((si: any) => si.status === 'confirmed')
    const totalWeight = confirmedStockIns.reduce((sum: number, si: any) => sum + (si.total_weight || 0), 0)

    await supabase
      .from('b2b_deals')
      .update({
        stock_in_count: confirmedStockIns.length,
        actual_weight_kg: totalWeight,
        updated_at: new Date().toISOString(),
      })
      .eq('id', dealId)
  },

  /**
   * S2: Cập nhật deal totals sau khi confirm stock-out (chiều xuất — deal sale)
   * Mirror pattern updateDealStockInTotals nhưng cho delivered_weight_kg.
   */
  async updateDealStockOutTotals(dealId: string): Promise<void> {
    const { data: stockOuts } = await supabase
      .from('stock_out_orders')
      .select('id, total_weight, status')
      .eq('deal_id', dealId)

    const confirmedStockOuts = (stockOuts || []).filter((so: any) => so.status === 'confirmed')
    const totalWeight = confirmedStockOuts.reduce((sum: number, so: any) => sum + (so.total_weight || 0), 0)

    await supabase
      .from('b2b_deals')
      .update({
        stock_out_count: confirmedStockOuts.length,
        delivered_weight_kg: totalWeight,
        updated_at: new Date().toISOString(),
      })
      .eq('id', dealId)
  },

  /**
   * S2: Lấy danh sách deal SALE đang active để user chọn khi xuất kho
   * (mirror getActiveDealsForStockIn nhưng filter deal_type='sale')
   */
  async getActiveDealsForStockOut(): Promise<ActiveDealForStockIn[]> {
    const { data: deals } = await supabase
      .from('b2b_deals')
      .select(`
        id, deal_number, deal_type, product_name, quantity_kg,
        delivered_weight_kg, status,
        partner:b2b_partners!partner_id(name)
      `)
      .in('status', ['active', 'confirmed', 'in_progress'])
      .eq('deal_type', 'sale')
      .order('created_at', { ascending: false })
      .limit(50)

    const result: ActiveDealForStockIn[] = (deals || []).map((d: any) => {
      const quantityKg = Number(d.quantity_kg) || 0
      const deliveredKg = Number(d.delivered_weight_kg) || 0
      return {
        id: d.id,
        deal_number: d.deal_number,
        partner_name: d.partner?.name || '—',
        product_name: d.product_name || '',
        quantity_kg: quantityKg,
        received_kg: deliveredKg, // reuse field name, semantics = "delivered" với sale
        remaining_kg: Math.max(0, quantityKg - deliveredKg),
      }
    })

    return result.filter(d => d.remaining_kg > 0)
  },

  /**
   * Gửi thông báo vào chat khi confirm nhập kho
   */
  async notifyDealChatStockIn(dealId: string, stockInCode: string, totalWeight: number): Promise<void> {
    try {
    const { data: deal } = await supabase
      .from('b2b_deals')
      .select('partner_id, deal_number')
      .eq('id', dealId)
      .single()

    if (!deal) { console.warn('[dealWms] notifyStockIn: deal not found:', dealId); return }

    // Try deal-specific room first, then general room
    const { data: room } = await supabase
      .from('b2b_chat_rooms')
      .select('id')
      .eq('partner_id', deal.partner_id)
      .in('room_type', ['deal', 'general'])
      .order('room_type', { ascending: true }) // deal first
      .limit(1)
      .maybeSingle()

    if (!room) { console.warn('[dealWms] notifyStockIn: no chat room for partner:', deal.partner_id); return }

    await supabase
      .from('b2b_chat_messages')
      .insert({
        room_id: room.id,
        sender_type: 'system',
        sender_id: 'system',
        message_type: 'system',
        content: `Đã nhập kho ${(totalWeight / 1000).toFixed(1)} tấn cho Deal ${deal.deal_number} (${stockInCode})`,
        metadata: {
          notification_type: 'stock_in_confirmed',
          deal_id: dealId,
          stock_in_code: stockInCode,
          total_weight: totalWeight,
        },
        attachments: [],
      })

    await supabase
      .from('b2b_chat_rooms')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', room.id)

    // Sync DealCard live — progress bar chuyển sang "Đã nhập kho"
    const { data: freshDeal } = await supabase
      .from('b2b_deals')
      .select('stock_in_count, actual_weight_kg')
      .eq('id', dealId)
      .single()
    if (freshDeal) {
      await patchDealCardMetadata(dealId, {
        stock_in_count: freshDeal.stock_in_count ?? undefined,
        actual_weight_kg: freshDeal.actual_weight_kg ?? undefined,
      })
    }
    } catch (e) { console.error('[dealWms] notifyStockIn error:', e) }
  },

  /**
   * Gửi thông báo vào chat khi QC hoàn thành
   */
  async notifyDealChatQcUpdate(dealId: string, actualDrc: number, qcStatus: string): Promise<void> {
    try {
    const { data: deal } = await supabase
      .from('b2b_deals')
      .select('partner_id, deal_number')
      .eq('id', dealId)
      .single()

    if (!deal) { console.warn('[dealWms] notifyQc: deal not found:', dealId); return }

    const { data: room } = await supabase
      .from('b2b_chat_rooms')
      .select('id')
      .eq('partner_id', deal.partner_id)
      .in('room_type', ['deal', 'general'])
      .order('room_type', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (!room) { console.warn('[dealWms] notifyQc: no chat room for partner:', deal.partner_id); return }

    const statusLabels: Record<string, string> = {
      passed: 'Đạt',
      warning: 'Cảnh báo',
      failed: 'Không đạt',
      pending: 'Chờ kiểm tra',
    }

    await supabase
      .from('b2b_chat_messages')
      .insert({
        room_id: room.id,
        sender_type: 'system',
        sender_id: 'system',
        message_type: 'system',
        content: `QC hoàn thành — Deal ${deal.deal_number}: DRC thực tế = ${actualDrc}%, Trạng thái: ${statusLabels[qcStatus] || qcStatus}`,
        metadata: {
          notification_type: 'qc_completed',
          deal_id: dealId,
          actual_drc: actualDrc,
          qc_status: qcStatus,
        },
        attachments: [],
      })

    await supabase
      .from('b2b_chat_rooms')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', room.id)

    // Sync DealCard live — DRC thực + qc_status để progress bar + variance warning hiển thị
    const { data: freshDeal } = await supabase
      .from('b2b_deals')
      .select('actual_drc, qc_status, final_value')
      .eq('id', dealId)
      .single()
    if (freshDeal) {
      await patchDealCardMetadata(dealId, {
        actual_drc: freshDeal.actual_drc ?? undefined,
        qc_status: (freshDeal.qc_status as any) ?? undefined,
        final_value: freshDeal.final_value ?? undefined,
      })
    }
    } catch (e) { console.error('[dealWms] notifyQc error:', e) }
  },

  /**
   * Gửi thông báo vào chat khi có sự kiện quyết toán (tạo, duyệt, thanh toán)
   */
  async notifyDealChatSettlement(dealId: string, settlementCode: string, amount: number, status: string): Promise<void> {
    try {
    const { data: deal } = await supabase
      .from('b2b_deals')
      .select('partner_id, deal_number')
      .eq('id', dealId)
      .single()

    if (!deal) { console.warn('[dealWms] notifySettlement: deal not found:', dealId); return }

    const { data: room } = await supabase
      .from('b2b_chat_rooms')
      .select('id')
      .eq('partner_id', deal.partner_id)
      .in('room_type', ['deal', 'general'])
      .order('room_type', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (!room) { console.warn('[dealWms] notifySettlement: no room for partner:', deal.partner_id); return }

    const formattedAmount = amount.toLocaleString('vi-VN')

    let content = ''
    if (status === 'draft') {
      content = `Đã tạo phiếu quyết toán ${settlementCode} cho Deal ${deal.deal_number}, giá trị: ${formattedAmount} VNĐ`
    } else if (status === 'approved') {
      content = `Phiếu quyết toán ${settlementCode} đã được duyệt`
    } else if (status === 'paid') {
      content = `Đã thanh toán quyết toán ${settlementCode}, số tiền: ${formattedAmount} VNĐ`
    } else {
      content = `Cập nhật quyết toán ${settlementCode}: ${status}`
    }

    await supabase
      .from('b2b_chat_messages')
      .insert({
        room_id: room.id,
        sender_type: 'system',
        sender_id: 'system',
        message_type: 'system',
        content,
        metadata: {
          notification_type: 'settlement_update',
          deal_id: dealId,
          settlement_code: settlementCode,
          amount,
          status,
        },
        attachments: [],
      })

    await supabase
      .from('b2b_chat_rooms')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', room.id)

    // Sync DealCard live — settlement code + có thể status deal đã đổi (accepted → settled)
    const { data: freshDeal } = await supabase
      .from('b2b_deals')
      .select('status, final_value')
      .eq('id', dealId)
      .single()
    await patchDealCardMetadata(dealId, {
      settlement_code: settlementCode,
      status: freshDeal?.status ?? undefined,
      final_value: freshDeal?.final_value ?? undefined,
    })
    } catch (e) { console.error('[dealWms] notifySettlement error:', e) }
  },

  /**
   * Gửi thông báo vào chat khi chi tạm ứng
   */
  async notifyDealChatAdvance(dealId: string, advanceNumber: string, amount: number): Promise<void> {
    try {
    const { data: deal } = await supabase
      .from('b2b_deals')
      .select('partner_id, deal_number')
      .eq('id', dealId)
      .single()

    if (!deal) { console.warn('[dealWms] notifyAdvance: deal not found:', dealId); return }

    const { data: room } = await supabase
      .from('b2b_chat_rooms')
      .select('id')
      .eq('partner_id', deal.partner_id)
      .in('room_type', ['deal', 'general'])
      .order('room_type', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (!room) { console.warn('[dealWms] notifyAdvance: no room for partner:', deal.partner_id); return }

    const formattedAmount = amount.toLocaleString('vi-VN')

    await supabase
      .from('b2b_chat_messages')
      .insert({
        room_id: room.id,
        sender_type: 'system',
        sender_id: 'system',
        message_type: 'system',
        content: `Đã chi tạm ứng ${advanceNumber} số tiền ${formattedAmount} VNĐ cho Deal ${deal.deal_number}`,
        metadata: {
          notification_type: 'advance_paid',
          deal_id: dealId,
          advance_number: advanceNumber,
          amount,
        },
        attachments: [],
      })

    await supabase
      .from('b2b_chat_rooms')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', room.id)
    } catch (e) { console.error('[dealWms] notifyAdvance error:', e) }
  },
}
