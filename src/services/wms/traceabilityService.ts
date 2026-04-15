// ============================================================================
// TRACEABILITY SERVICE
// File: src/services/wms/traceabilityService.ts
// Module: Kho Thành Phẩm (WMS) - Huy Anh Rubber ERP
// Mô tả: Truy xuất nguồn gốc sản phẩm - từ thành phẩm ngược về NVL, deal, đại lý
// Bảng: stock_batches, production_orders, production_order_items,
//       stock_in_details, stock_in_orders, b2b_deals, b2b_partners
// ============================================================================

import { supabase } from '../../lib/supabase'

// ============================================================================
// TYPES
// ============================================================================

export type TraceNodeType =
  | 'finished_product'
  | 'production'
  | 'raw_batch'
  | 'stock_in'
  | 'stock_out'
  | 'customer'
  | 'deal'
  | 'rubber_intake'
  | 'partner'

export interface TraceNode {
  type: TraceNodeType
  id: string
  label: string
  detail: string
  date: string | null
  children: TraceNode[]
}

// ============================================================================
// HELPERS
// ============================================================================

function formatDate(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null
  try {
    const d = new Date(dateStr)
    return d.toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  } catch {
    return dateStr
  }
}

function formatWeight(kg: number | null | undefined): string {
  if (kg == null) return ''
  if (kg >= 1000) return `${(kg / 1000).toFixed(2)} tấn`
  return `${kg.toFixed(1)} kg`
}

// ============================================================================
// SERVICE
// ============================================================================

export const traceabilityService = {

  // --------------------------------------------------------------------------
  // TRACE TỪ THÀNH PHẨM NGƯỢC VỀ NGUỒN GỐC
  // Batch (TP) -> Production Order -> NVL Batches -> Stock-In -> Deal -> Đại lý
  // --------------------------------------------------------------------------

  async traceFromBatch(batchId: string): Promise<TraceNode | null> {
    // 1. Lấy thông tin lô thành phẩm
    const { data: batch, error: batchErr } = await supabase
      .from('stock_batches')
      .select(`
        id, batch_no, initial_drc, latest_drc, initial_quantity, quantity_remaining,
        status, created_at,
        material:materials(id, sku, name)
      `)
      .eq('id', batchId)
      .single()

    if (batchErr || !batch) return null

    const batchMaterial = Array.isArray(batch.material) ? batch.material[0] : batch.material
    const batchLabel = batch.batch_no || batchId.slice(0, 8)
    const batchDetail = [
      batchMaterial?.name || '',
      batch.latest_drc != null ? `DRC ${batch.latest_drc}%` : '',
      formatWeight(batch.quantity_remaining),
    ].filter(Boolean).join(' | ')

    const rootNode: TraceNode = {
      type: 'finished_product',
      id: batch.id,
      label: `Lô thành phẩm: ${batchLabel}`,
      detail: batchDetail,
      date: formatDate(batch.created_at),
      children: [],
    }

    // 2. Tìm production_output_batches có stock_batch_id = batchId
    //    hoặc production_order_items có source_batch_id = batchId (nếu là NVL)
    const { data: outputBatches } = await supabase
      .from('production_output_batches')
      .select('id, production_order_id, quantity_produced, final_grade, final_drc, created_at')
      .eq('stock_batch_id', batchId)

    if (outputBatches && outputBatches.length > 0) {
      // Lô này là output của production -> truy ngược về production order
      for (const ob of outputBatches) {
        const prodNode = await this._traceProductionOrder(ob.production_order_id)
        if (prodNode) {
          rootNode.children.push(prodNode)
        }
      }
    } else {
      // Có thể batch này được tạo trực tiếp từ stock_in (không qua sản xuất)
      const stockInNodes = await this._traceBatchToStockIn(batchId)
      rootNode.children.push(...stockInNodes)
    }

    return rootNode
  },

  // --------------------------------------------------------------------------
  // TRACE TỪ PRODUCTION ORDER -> NVL -> STOCK-IN -> DEAL -> ĐẠI LÝ
  // --------------------------------------------------------------------------

  async _traceProductionOrder(poId: string): Promise<TraceNode | null> {
    const { data: po, error: poErr } = await supabase
      .from('production_orders')
      .select(`
        id, code, product_type, target_grade, final_grade, final_drc,
        target_quantity, actual_quantity, status,
        actual_start_date, actual_end_date, created_at,
        facility:production_facilities(id, code, name)
      `)
      .eq('id', poId)
      .single()

    if (poErr || !po) return null

    const facility = Array.isArray(po.facility) ? po.facility[0] : po.facility
    const poDetail = [
      po.product_type,
      po.final_grade || po.target_grade || '',
      po.actual_quantity != null ? formatWeight(po.actual_quantity) : '',
      facility?.name || '',
    ].filter(Boolean).join(' | ')

    const prodNode: TraceNode = {
      type: 'production',
      id: po.id,
      label: `Lệnh sản xuất: ${po.code}`,
      detail: poDetail,
      date: formatDate(po.actual_start_date || po.created_at),
      children: [],
    }

    // Lấy danh sách NVL (production_order_items)
    const { data: items } = await supabase
      .from('production_order_items')
      .select(`
        id, source_batch_id, required_quantity, allocated_quantity,
        source_batch:stock_batches(
          id, batch_no, initial_drc, latest_drc, initial_quantity, quantity_remaining, created_at,
          material:materials(id, sku, name)
        )
      `)
      .eq('production_order_id', poId)

    if (items) {
      for (const item of items) {
        const sb = Array.isArray(item.source_batch) ? item.source_batch[0] : item.source_batch
        if (!sb) continue

        const sbMaterial = Array.isArray(sb.material) ? sb.material[0] : sb.material
        const sbDetail = [
          sbMaterial?.name || '',
          sb.latest_drc != null ? `DRC ${sb.latest_drc}%` : '',
          formatWeight(item.required_quantity),
        ].filter(Boolean).join(' | ')

        const rawNode: TraceNode = {
          type: 'raw_batch',
          id: sb.id,
          label: `Lô NVL: ${sb.batch_no || sb.id.slice(0, 8)}`,
          detail: sbDetail,
          date: formatDate(sb.created_at),
          children: [],
        }

        // Truy ngược batch NVL -> stock_in
        const stockInNodes = await this._traceBatchToStockIn(sb.id)
        rawNode.children.push(...stockInNodes)

        prodNode.children.push(rawNode)
      }
    }

    return prodNode
  },

  // --------------------------------------------------------------------------
  // TRACE TỪ BATCH -> STOCK_IN_DETAILS -> STOCK_IN_ORDER -> DEAL -> PARTNER
  // --------------------------------------------------------------------------

  async _traceBatchToStockIn(batchId: string): Promise<TraceNode[]> {
    const nodes: TraceNode[] = []

    const { data: details } = await supabase
      .from('stock_in_details')
      .select(`
        id, stock_in_id, quantity, weight,
        stock_in:stock_in_orders(
          id, code, type, source_type, deal_id, total_quantity, total_weight,
          status, created_at,
          warehouse:warehouses(id, code, name)
        )
      `)
      .eq('batch_id', batchId)

    if (!details) return nodes

    for (const detail of details) {
      const sio = Array.isArray(detail.stock_in) ? detail.stock_in[0] : detail.stock_in
      if (!sio) continue

      const warehouse = Array.isArray(sio.warehouse) ? sio.warehouse[0] : sio.warehouse
      const sioDetail = [
        sio.source_type === 'deal' ? 'Từ deal' : sio.source_type === 'production' ? 'Từ sản xuất' : (sio.source_type || ''),
        warehouse?.name || '',
        formatWeight(sio.total_weight || detail.weight),
      ].filter(Boolean).join(' | ')

      const stockInNode: TraceNode = {
        type: 'stock_in',
        id: sio.id,
        label: `Phiếu nhập kho: ${sio.code}`,
        detail: sioDetail,
        date: formatDate(sio.created_at),
        children: [],
      }

      // Nếu stock_in có deal_id -> truy về deal
      if (sio.deal_id) {
        const dealNode = await this._traceDeal(sio.deal_id)
        if (dealNode) {
          stockInNode.children.push(dealNode)
        }
      }

      nodes.push(stockInNode)
    }

    return nodes
  },

  // --------------------------------------------------------------------------
  // TRACE DEAL -> PARTNER
  // --------------------------------------------------------------------------

  async _traceDeal(dealId: string): Promise<TraceNode | null> {
    const { data: deal, error: dealErr } = await supabase
      .from('b2b_deals')
      .select(`
        id, deal_number, deal_type, product_name, quantity_kg,
        unit_price, total_value_vnd, status, created_at,
        lot_code, lot_description, rubber_intake_id, source_region,
        partner:b2b_partners!partner_id(id, code, name, tier, phone)
      `)
      .eq('id', dealId)
      .single()

    if (dealErr || !deal) return null

    const DEAL_TYPE_MAP: Record<string, string> = {
      purchase: 'Mua hàng',
      sale: 'Bán hàng',
      processing: 'Gia công',
      consignment: 'Ký gửi',
    }

    const dealDetail = [
      DEAL_TYPE_MAP[deal.deal_type || ''] || deal.deal_type || '',
      deal.product_name || '',
      deal.lot_code ? `Lô: ${deal.lot_code}` : '',
      deal.quantity_kg != null ? formatWeight(deal.quantity_kg) : '',
      deal.total_value_vnd != null ? `${deal.total_value_vnd.toLocaleString('vi-VN')} VND` : '',
    ].filter(Boolean).join(' | ')

    const dealNode: TraceNode = {
      type: 'deal',
      id: deal.id,
      label: `Deal: ${deal.deal_number}`,
      detail: dealDetail,
      date: formatDate(deal.created_at),
      children: [],
    }

    // ★ Rubber Intake (Lý lịch mủ) — nếu có
    if (deal.rubber_intake_id) {
      const intakeNode = await this._traceRubberIntake(deal.rubber_intake_id)
      if (intakeNode) {
        dealNode.children.push(intakeNode)
      }
    }

    // Partner
    const partner = Array.isArray(deal.partner) ? deal.partner[0] : deal.partner
    if (partner) {
      const partnerDetail = [
        partner.code || '',
        partner.tier ? `Hạng ${partner.tier}` : '',
        partner.phone || '',
      ].filter(Boolean).join(' | ')

      dealNode.children.push({
        type: 'partner',
        id: partner.id,
        label: `Đại lý: ${partner.name}`,
        detail: partnerDetail,
        date: null,
        children: [],
      })
    }

    return dealNode
  },

  // --------------------------------------------------------------------------
  // TRACE RUBBER INTAKE (Lý lịch mủ)
  // --------------------------------------------------------------------------

  async _traceRubberIntake(intakeId: string): Promise<TraceNode | null> {
    const { data: intake, error } = await supabase
      .from('rubber_intake_batches')
      .select('id, lot_code, source_type, product_code, intake_date, net_weight_kg, drc_percent, location_name, notes, status')
      .eq('id', intakeId)
      .single()

    if (error || !intake) return null

    const SOURCE_MAP: Record<string, string> = { vietnam: 'VN', lao_direct: 'Lào', lao_agent: 'Lào (ĐL)' }

    const detail = [
      intake.lot_code || '',
      intake.product_code || '',
      SOURCE_MAP[intake.source_type] || intake.source_type,
      intake.drc_percent ? `DRC ${intake.drc_percent}%` : '',
      intake.net_weight_kg ? formatWeight(intake.net_weight_kg) : '',
      intake.location_name || '',
    ].filter(Boolean).join(' | ')

    return {
      type: 'rubber_intake',
      id: intake.id,
      label: `Lý lịch mủ: ${intake.lot_code || intakeId.slice(0, 8)}`,
      detail,
      date: formatDate(intake.intake_date),
      children: [],
    }
  },

  // --------------------------------------------------------------------------
  // TRACE TỪ DEAL XUÔI VỀ THÀNH PHẨM
  // Deal -> Stock-Ins -> Batches -> Productions -> Output Batches
  // --------------------------------------------------------------------------

  async traceFromDeal(dealId: string): Promise<TraceNode | null> {
    // 1. Lấy thông tin deal
    const { data: deal, error: dealErr } = await supabase
      .from('b2b_deals')
      .select(`
        id, deal_number, deal_type, product_name, quantity_kg,
        total_value_vnd, status, created_at,
        partner:b2b_partners!partner_id(id, code, name, tier)
      `)
      .eq('id', dealId)
      .single()

    if (dealErr || !deal) return null

    const partner = Array.isArray(deal.partner) ? deal.partner[0] : deal.partner

    const DEAL_TYPE_MAP: Record<string, string> = {
      purchase: 'Mua hàng',
      sale: 'Bán hàng',
      processing: 'Gia công',
      consignment: 'Ký gửi',
    }

    const dealDetail = [
      DEAL_TYPE_MAP[deal.deal_type || ''] || '',
      deal.product_name || '',
      deal.quantity_kg != null ? formatWeight(deal.quantity_kg) : '',
      partner?.name || '',
    ].filter(Boolean).join(' | ')

    const rootNode: TraceNode = {
      type: 'deal',
      id: deal.id,
      label: `Deal: ${deal.deal_number}`,
      detail: dealDetail,
      date: formatDate(deal.created_at),
      children: [],
    }

    // 2. Tìm các phiếu nhập kho từ deal này
    const { data: stockIns } = await supabase
      .from('stock_in_orders')
      .select(`
        id, code, type, total_quantity, total_weight, status, created_at,
        warehouse:warehouses(id, code, name),
        details:stock_in_details(
          id, batch_id, quantity, weight,
          batch:stock_batches(id, batch_no, initial_drc, latest_drc, quantity_remaining),
          material:materials(id, sku, name)
        )
      `)
      .eq('deal_id', dealId)

    if (!stockIns) return rootNode

    for (const sio of stockIns) {
      const warehouse = Array.isArray(sio.warehouse) ? sio.warehouse[0] : sio.warehouse
      const sioDetail = [
        warehouse?.name || '',
        formatWeight(sio.total_weight),
        sio.status || '',
      ].filter(Boolean).join(' | ')

      const stockInNode: TraceNode = {
        type: 'stock_in',
        id: sio.id,
        label: `Phiếu nhập kho: ${sio.code}`,
        detail: sioDetail,
        date: formatDate(sio.created_at),
        children: [],
      }

      // 3. Với mỗi detail -> batch -> tìm production_order_items dùng batch này
      const sioDetails = (sio as any).details || []
      for (const detail of sioDetails) {
        const sb = Array.isArray(detail.batch) ? detail.batch[0] : detail.batch
        const mat = Array.isArray(detail.material) ? detail.material[0] : detail.material
        if (!sb) continue

        const batchDetail = [
          mat?.name || '',
          sb.latest_drc != null ? `DRC ${sb.latest_drc}%` : '',
          formatWeight(sb.quantity_remaining),
        ].filter(Boolean).join(' | ')

        const batchNode: TraceNode = {
          type: 'raw_batch',
          id: sb.id,
          label: `Lô NVL: ${sb.batch_no || sb.id.slice(0, 8)}`,
          detail: batchDetail,
          date: formatDate(sio.created_at),
          children: [],
        }

        // 4. Tìm production orders sử dụng batch này làm NVL
        const { data: poItems } = await supabase
          .from('production_order_items')
          .select('id, production_order_id, required_quantity')
          .eq('source_batch_id', sb.id)

        if (poItems) {
          for (const poItem of poItems) {
            const prodNode = await this._traceProductionForward(poItem.production_order_id)
            if (prodNode) {
              batchNode.children.push(prodNode)
            }
          }
        }

        stockInNode.children.push(batchNode)
      }

      rootNode.children.push(stockInNode)
    }

    return rootNode
  },

  // --------------------------------------------------------------------------
  // D3: FORWARD TRACEABILITY — Từ 1 batch tìm tất cả đích đến xuôi dòng
  //     Dùng cho quality recall: "batch này lỗi, đã đi đâu?"
  // --------------------------------------------------------------------------

  async traceFromBatchForward(batchId: string): Promise<TraceNode | null> {
    // 1. Lấy thông tin batch gốc
    const { data: batch, error: batchErr } = await supabase
      .from('stock_batches')
      .select(`
        id, batch_no, initial_drc, latest_drc, initial_quantity, quantity_remaining,
        rubber_grade, batch_type, status, created_at,
        material:materials(id, sku, name, type)
      `)
      .eq('id', batchId)
      .single()

    if (batchErr || !batch) return null

    const mat = Array.isArray(batch.material) ? batch.material[0] : batch.material
    const isRaw = (mat as any)?.type === 'raw' || batch.batch_type === 'raw'

    const rootDetail = [
      mat?.name || '',
      batch.rubber_grade || '',
      batch.latest_drc != null ? `DRC ${batch.latest_drc}%` : '',
      formatWeight(batch.initial_quantity),
    ].filter(Boolean).join(' | ')

    const rootNode: TraceNode = {
      type: isRaw ? 'raw_batch' : 'finished_product',
      id: batch.id,
      label: `Lô${isRaw ? ' NVL' : ' TP'}: ${batch.batch_no}`,
      detail: rootDetail,
      date: formatDate(batch.created_at),
      children: [],
    }

    // 2a. NVL: tìm lệnh sản xuất dùng batch này → output batches
    if (isRaw) {
      const { data: poItems } = await supabase
        .from('production_order_items')
        .select('id, production_order_id, required_quantity, allocated_quantity')
        .eq('source_batch_id', batchId)

      if (poItems && poItems.length > 0) {
        const seen = new Set<string>()
        for (const poItem of poItems) {
          if (seen.has(poItem.production_order_id)) continue
          seen.add(poItem.production_order_id)
          const prodNode = await this._traceProductionForward(poItem.production_order_id)
          if (prodNode) rootNode.children.push(prodNode)
        }
      }
    }

    // 2b. Bất kể NVL hay TP — tìm stock_out_details consume batch này
    //     (NVL có thể xuất chuyển kho/bán; TP xuất bán cho khách)
    const { data: outDetails } = await supabase
      .from('stock_out_details')
      .select(`
        id, stock_out_id, quantity, weight,
        stock_out:stock_out_orders(
          id, code, reason, customer_name, customer_order_ref,
          total_weight, status, confirmed_at, created_at,
          warehouse:warehouses(id, code, name)
        )
      `)
      .eq('batch_id', batchId)

    if (outDetails && outDetails.length > 0) {
      const REASON_LABELS: Record<string, string> = {
        sale: 'Bán hàng',
        production: 'Sản xuất',
        transfer: 'Chuyển kho',
        blend: 'Phối trộn',
        adjust: 'Điều chỉnh',
        return: 'Trả hàng',
      }
      const seenOrders = new Set<string>()
      for (const det of outDetails) {
        const so = Array.isArray(det.stock_out) ? det.stock_out[0] : det.stock_out
        if (!so || seenOrders.has(so.id)) continue
        seenOrders.add(so.id)

        const wh = Array.isArray((so as any).warehouse) ? (so as any).warehouse[0] : (so as any).warehouse
        const outDetail = [
          REASON_LABELS[so.reason] || so.reason || '',
          wh?.name || '',
          formatWeight(det.weight || det.quantity),
          so.status || '',
        ].filter(Boolean).join(' | ')

        const outNode: TraceNode = {
          type: 'stock_out',
          id: so.id,
          label: `Phiếu xuất: ${so.code}`,
          detail: outDetail,
          date: formatDate(so.confirmed_at || so.created_at),
          children: [],
        }

        // Nếu có khách hàng → thêm node customer con
        if (so.customer_name) {
          outNode.children.push({
            type: 'customer',
            id: `${so.id}-customer`,
            label: `Khách: ${so.customer_name}`,
            detail: so.customer_order_ref ? `Đơn ${so.customer_order_ref}` : '',
            date: null,
            children: [],
          })
        }

        rootNode.children.push(outNode)
      }
    }

    return rootNode
  },

  // --------------------------------------------------------------------------
  // TRACE PRODUCTION XUÔI -> OUTPUT BATCHES (thành phẩm)
  // --------------------------------------------------------------------------

  async _traceProductionForward(poId: string): Promise<TraceNode | null> {
    const { data: po, error: poErr } = await supabase
      .from('production_orders')
      .select(`
        id, code, product_type, target_grade, final_grade, final_drc,
        actual_quantity, status, actual_start_date, created_at,
        facility:production_facilities(id, code, name)
      `)
      .eq('id', poId)
      .single()

    if (poErr || !po) return null

    const facility = Array.isArray(po.facility) ? po.facility[0] : po.facility
    const poDetail = [
      po.product_type,
      po.final_grade || po.target_grade || '',
      po.actual_quantity != null ? formatWeight(po.actual_quantity) : '',
      facility?.name || '',
    ].filter(Boolean).join(' | ')

    const prodNode: TraceNode = {
      type: 'production',
      id: po.id,
      label: `Lệnh sản xuất: ${po.code}`,
      detail: poDetail,
      date: formatDate(po.actual_start_date || po.created_at),
      children: [],
    }

    // Lấy output batches
    const { data: outputBatches } = await supabase
      .from('production_output_batches')
      .select(`
        id, stock_batch_id, quantity_produced, final_grade, final_drc, status, created_at,
        stock_batch:stock_batches(id, batch_no),
        material:materials(id, sku, name)
      `)
      .eq('production_order_id', poId)

    if (outputBatches) {
      for (const ob of outputBatches) {
        const obBatch = Array.isArray(ob.stock_batch) ? ob.stock_batch[0] : ob.stock_batch
        const obMat = Array.isArray(ob.material) ? ob.material[0] : ob.material

        const obDetail = [
          obMat?.name || '',
          ob.final_grade || '',
          ob.final_drc != null ? `DRC ${ob.final_drc}%` : '',
          formatWeight(ob.quantity_produced),
        ].filter(Boolean).join(' | ')

        prodNode.children.push({
          type: 'finished_product',
          id: ob.stock_batch_id || ob.id,
          label: `Thành phẩm: ${obBatch?.batch_no || ob.id.slice(0, 8)}`,
          detail: obDetail,
          date: formatDate(ob.created_at),
          children: [],
        })
      }
    }

    return prodNode
  },
}

export default traceabilityService
