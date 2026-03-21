// ============================================================================
// TRACEABILITY SERVICE
// File: src/services/wms/traceabilityService.ts
// Module: Kho Thanh Pham (WMS) - Huy Anh Rubber ERP
// Mo ta: Truy xuat nguon goc san pham - tu thanh pham nguoc ve NVL, deal, dai ly
// Bang: stock_batches, production_orders, production_order_items,
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
  | 'deal'
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
  if (kg >= 1000) return `${(kg / 1000).toFixed(2)} tan`
  return `${kg.toFixed(1)} kg`
}

// ============================================================================
// SERVICE
// ============================================================================

export const traceabilityService = {

  // --------------------------------------------------------------------------
  // TRACE TU THANH PHAM NGUOC VE NGUON GOC
  // Batch (TP) -> Production Order -> NVL Batches -> Stock-In -> Deal -> Dai ly
  // --------------------------------------------------------------------------

  async traceFromBatch(batchId: string): Promise<TraceNode | null> {
    // 1. Lay thong tin lo thanh pham
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
      label: `Lo thanh pham: ${batchLabel}`,
      detail: batchDetail,
      date: formatDate(batch.created_at),
      children: [],
    }

    // 2. Tim production_output_batches co stock_batch_id = batchId
    //    hoac production_order_items co source_batch_id = batchId (neu la NVL)
    const { data: outputBatches } = await supabase
      .from('production_output_batches')
      .select('id, production_order_id, quantity_produced, final_grade, final_drc, created_at')
      .eq('stock_batch_id', batchId)

    if (outputBatches && outputBatches.length > 0) {
      // Lo nay la output cua production -> truy nguoc ve production order
      for (const ob of outputBatches) {
        const prodNode = await this._traceProductionOrder(ob.production_order_id)
        if (prodNode) {
          rootNode.children.push(prodNode)
        }
      }
    } else {
      // Co the batch nay duoc tao truc tiep tu stock_in (khong qua san xuat)
      const stockInNodes = await this._traceBatchToStockIn(batchId)
      rootNode.children.push(...stockInNodes)
    }

    return rootNode
  },

  // --------------------------------------------------------------------------
  // TRACE TU PRODUCTION ORDER -> NVL -> STOCK-IN -> DEAL -> DAI LY
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
      label: `Lenh san xuat: ${po.code}`,
      detail: poDetail,
      date: formatDate(po.actual_start_date || po.created_at),
      children: [],
    }

    // Lay danh sach NVL (production_order_items)
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
          label: `Lo NVL: ${sb.batch_no || sb.id.slice(0, 8)}`,
          detail: sbDetail,
          date: formatDate(sb.created_at),
          children: [],
        }

        // Truy nguoc batch NVL -> stock_in
        const stockInNodes = await this._traceBatchToStockIn(sb.id)
        rawNode.children.push(...stockInNodes)

        prodNode.children.push(rawNode)
      }
    }

    return prodNode
  },

  // --------------------------------------------------------------------------
  // TRACE TU BATCH -> STOCK_IN_DETAILS -> STOCK_IN_ORDER -> DEAL -> PARTNER
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
        sio.source_type === 'deal' ? 'Từ deal' : sio.source_type === 'production' ? 'Tu san xuat' : (sio.source_type || ''),
        warehouse?.name || '',
        formatWeight(sio.total_weight || detail.weight),
      ].filter(Boolean).join(' | ')

      const stockInNode: TraceNode = {
        type: 'stock_in',
        id: sio.id,
        label: `Phieu nhap kho: ${sio.code}`,
        detail: sioDetail,
        date: formatDate(sio.created_at),
        children: [],
      }

      // Neu stock_in co deal_id -> truy ve deal
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
        partner:b2b_partners!partner_id(id, code, name, tier, phone)
      `)
      .eq('id', dealId)
      .single()

    if (dealErr || !deal) return null

    const DEAL_TYPE_MAP: Record<string, string> = {
      purchase: 'Mua hang',
      sale: 'Ban hang',
      processing: 'Gia công',
      consignment: 'Ký gửi',
    }

    const dealDetail = [
      DEAL_TYPE_MAP[deal.deal_type || ''] || deal.deal_type || '',
      deal.product_name || '',
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

    // Partner
    const partner = Array.isArray(deal.partner) ? deal.partner[0] : deal.partner
    if (partner) {
      const partnerDetail = [
        partner.code || '',
        partner.tier ? `Hang ${partner.tier}` : '',
        partner.phone || '',
      ].filter(Boolean).join(' | ')

      dealNode.children.push({
        type: 'partner',
        id: partner.id,
        label: `Dai ly: ${partner.name}`,
        detail: partnerDetail,
        date: null,
        children: [],
      })
    }

    return dealNode
  },

  // --------------------------------------------------------------------------
  // TRACE TU DEAL XUOI VE THANH PHAM
  // Deal -> Stock-Ins -> Batches -> Productions -> Output Batches
  // --------------------------------------------------------------------------

  async traceFromDeal(dealId: string): Promise<TraceNode | null> {
    // 1. Lay thong tin deal
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
      purchase: 'Mua hang',
      sale: 'Ban hang',
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

    // 2. Tim cac phieu nhap kho tu deal nay
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
        label: `Phieu nhap kho: ${sio.code}`,
        detail: sioDetail,
        date: formatDate(sio.created_at),
        children: [],
      }

      // 3. Voi moi detail -> batch -> tim production_order_items dung batch nay
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
          label: `Lo NVL: ${sb.batch_no || sb.id.slice(0, 8)}`,
          detail: batchDetail,
          date: formatDate(sio.created_at),
          children: [],
        }

        // 4. Tim production orders su dung batch nay lam NVL
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
  // TRACE PRODUCTION XUOI -> OUTPUT BATCHES (thanh pham)
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
      label: `Lenh san xuat: ${po.code}`,
      detail: poDetail,
      date: formatDate(po.actual_start_date || po.created_at),
      children: [],
    }

    // Lay output batches
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
          label: `Thanh pham: ${obBatch?.batch_no || ob.id.slice(0, 8)}`,
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
