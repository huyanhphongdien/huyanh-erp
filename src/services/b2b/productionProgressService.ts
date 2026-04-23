// ============================================================================
// Production Progress Service — Timeline visibility cho đại lý Flow B
// File: src/services/b2b/productionProgressService.ts
// Phase 18 of B2B Intake v4
// ============================================================================
// Use case:
// - Partner (đại lý) cần theo dõi tiến độ SX lô của mình trên Portal
// - Giảm gọi điện hỏi factory "bao giờ ra TP"
// - Realtime update khi deal.status + production_orders.status thay đổi
// ============================================================================

import { supabase } from '../../lib/supabase'

export type TimelineStageStatus = 'done' | 'current' | 'pending' | 'skipped'

export interface TimelineStage {
  key: string
  label: string
  status: TimelineStageStatus
  timestamp: string | null
  note?: string
}

export interface ProductionTimeline {
  deal_id: string
  deal_number: string
  purchase_type: string
  current_stage: string
  stages: TimelineStage[]
}

/**
 * Get timeline tiến độ của 1 deal.
 *
 * Stages (theo flow):
 * - drc_after_production: 10 stages (full flow đại lý)
 * - standard: 9 stages (chuẩn)
 * - outright/walkin: 4 stages rút gọn (cân→chi tiền)
 */
export async function getTimeline(dealId: string): Promise<ProductionTimeline> {
  // Load deal + related data
  const { data: deal, error: dErr } = await supabase
    .from('b2b_deals')
    .select(`
      id, deal_number, purchase_type, status,
      sample_drc, actual_drc, finished_product_kg,
      stock_in_count, production_started_at,
      created_at, updated_at
    `)
    .eq('id', dealId)
    .maybeSingle()

  if (dErr) throw new Error(`Deal load failed: ${dErr.message}`)
  if (!deal) throw new Error(`Deal not found: ${dealId}`)

  const d = deal as any
  const purchaseType = d.purchase_type || 'standard'

  // Build stages theo flow
  if (purchaseType === 'drc_after_production') {
    return buildDrcAfterTimeline(d)
  } else if (purchaseType === 'outright' || purchaseType === 'farmer_walkin') {
    return buildQuickTimeline(d)
  } else {
    return buildStandardTimeline(d)
  }
}

// ============================================================================
// FLOW drc_after_production — 10 stages đại lý
// ============================================================================

async function buildDrcAfterTimeline(d: any): Promise<ProductionTimeline> {
  // Lookup related data
  const [weighbridge, stockIn, advances, settlement] = await Promise.all([
    supabase.from('weighbridge_tickets')
      .select('completed_at, status')
      .eq('deal_id', d.id).order('completed_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('stock_in_orders')
      .select('created_at, confirmed_at, status')
      .eq('deal_id', d.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('b2b_advances')
      .select('created_at, status').eq('deal_id', d.id),
    supabase.from('b2b_settlements')
      .select('created_at, confirmed_at, paid_at, status')
      .eq('deal_id', d.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ])

  const wb = weighbridge.data as any
  const si = stockIn.data as any
  const adv = (advances.data || []) as any[]
  const sett = settlement.data as any

  const hasWeighed = !!wb?.completed_at
  const hasStockIn = !!si?.confirmed_at || d.stock_in_count > 0
  const hasSampleDrc = d.sample_drc != null && d.sample_drc > 0
  const isAccepted = ['accepted', 'settled'].includes(d.status)
  const hasAdvance = adv.some(a => ['acknowledged', 'paid'].includes(a.status))
  const hasProductionStart = !!d.production_started_at
  const hasActualDrc = d.actual_drc != null && d.actual_drc > 0
  const hasFinishedProduct = d.finished_product_kg != null && d.finished_product_kg > 0
  const hasSettlement = !!sett?.confirmed_at
  const isSettled = sett?.status === 'paid' || d.status === 'settled'

  const stages: TimelineStage[] = [
    {
      key: 'weighed', label: 'Đã cân',
      status: hasWeighed ? 'done' : 'current',
      timestamp: wb?.completed_at || null,
    },
    {
      key: 'stock_in', label: 'Đã nhập kho',
      status: hasStockIn ? 'done' : (hasWeighed ? 'current' : 'pending'),
      timestamp: si?.confirmed_at || null,
    },
    {
      key: 'qc_sample', label: 'QC sample DRC',
      status: hasSampleDrc ? 'done' : (hasStockIn ? 'current' : 'pending'),
      timestamp: null,
      note: hasSampleDrc ? `Sample: ${d.sample_drc}%` : undefined,
    },
    {
      key: 'bgd_approved', label: 'BGĐ duyệt',
      status: isAccepted ? 'done' : (hasSampleDrc ? 'current' : 'pending'),
      timestamp: null,
    },
    {
      key: 'advance', label: 'Tạm ứng',
      status: hasAdvance ? 'done' : (isAccepted ? 'current' : 'pending'),
      timestamp: null,
      note: hasAdvance ? `Đã ứng ${adv.length} lần` : undefined,
    },
    {
      key: 'production_start', label: 'Bắt đầu sản xuất',
      status: hasProductionStart ? 'done' : (hasAdvance ? 'current' : 'pending'),
      timestamp: d.production_started_at,
    },
    {
      key: 'production_finish', label: 'Ra thành phẩm',
      status: hasFinishedProduct ? 'done' : (hasProductionStart ? 'current' : 'pending'),
      timestamp: null,
      note: hasFinishedProduct ? `${d.finished_product_kg} kg` : undefined,
    },
    {
      key: 'qc_final', label: 'QC final (actual DRC)',
      status: hasActualDrc ? 'done' : (hasFinishedProduct ? 'current' : 'pending'),
      timestamp: null,
      note: hasActualDrc ? `Actual: ${d.actual_drc}%` : undefined,
    },
    {
      key: 'settlement', label: 'Quyết toán',
      status: hasSettlement ? 'done' : (hasActualDrc ? 'current' : 'pending'),
      timestamp: sett?.confirmed_at || null,
    },
    {
      key: 'paid', label: 'Thanh toán',
      status: isSettled ? 'done' : (hasSettlement ? 'current' : 'pending'),
      timestamp: sett?.paid_at || null,
    },
  ]

  const currentStage = stages.find(s => s.status === 'current')?.key
    || stages[stages.length - 1].key

  return {
    deal_id: d.id,
    deal_number: d.deal_number,
    purchase_type: d.purchase_type,
    current_stage: currentStage,
    stages,
  }
}

// ============================================================================
// FLOW standard — 9 stages chuẩn (không có production SX)
// ============================================================================

async function buildStandardTimeline(d: any): Promise<ProductionTimeline> {
  const [weighbridge, stockIn, advances, settlement] = await Promise.all([
    supabase.from('weighbridge_tickets')
      .select('completed_at').eq('deal_id', d.id).limit(1).maybeSingle(),
    supabase.from('stock_in_orders')
      .select('confirmed_at').eq('deal_id', d.id).limit(1).maybeSingle(),
    supabase.from('b2b_advances')
      .select('created_at, status').eq('deal_id', d.id),
    supabase.from('b2b_settlements')
      .select('confirmed_at, paid_at, status').eq('deal_id', d.id).limit(1).maybeSingle(),
  ])

  const hasWeighed = !!(weighbridge.data as any)?.completed_at
  const hasStockIn = !!(stockIn.data as any)?.confirmed_at || d.stock_in_count > 0
  const hasSampleDrc = d.sample_drc != null && d.sample_drc > 0
  const isAccepted = ['accepted', 'settled'].includes(d.status)
  const hasAdvance = (advances.data || []).some((a: any) => ['acknowledged', 'paid'].includes(a.status))
  const hasActualDrc = d.actual_drc != null
  const hasSettlement = !!(settlement.data as any)?.confirmed_at
  const isSettled = d.status === 'settled' || (settlement.data as any)?.status === 'paid'

  const stages: TimelineStage[] = [
    { key: 'booked', label: 'Đặt phiếu', status: 'done', timestamp: d.created_at },
    { key: 'qc_sample', label: 'QC sample', status: hasSampleDrc ? 'done' : 'current', timestamp: null },
    { key: 'bgd_approved', label: 'BGĐ duyệt', status: isAccepted ? 'done' : (hasSampleDrc ? 'current' : 'pending'), timestamp: null },
    { key: 'weighed', label: 'Đã cân', status: hasWeighed ? 'done' : (isAccepted ? 'current' : 'pending'), timestamp: (weighbridge.data as any)?.completed_at },
    { key: 'stock_in', label: 'Đã nhập kho', status: hasStockIn ? 'done' : (hasWeighed ? 'current' : 'pending'), timestamp: (stockIn.data as any)?.confirmed_at },
    { key: 'advance', label: 'Tạm ứng', status: hasAdvance ? 'done' : 'pending', timestamp: null },
    { key: 'qc_actual', label: 'QC actual DRC', status: hasActualDrc ? 'done' : 'pending', timestamp: null },
    { key: 'settlement', label: 'Quyết toán', status: hasSettlement ? 'done' : (hasActualDrc ? 'current' : 'pending'), timestamp: (settlement.data as any)?.confirmed_at },
    { key: 'paid', label: 'Thanh toán', status: isSettled ? 'done' : (hasSettlement ? 'current' : 'pending'), timestamp: (settlement.data as any)?.paid_at },
  ]

  const currentStage = stages.find(s => s.status === 'current')?.key || stages[stages.length - 1].key

  return {
    deal_id: d.id,
    deal_number: d.deal_number,
    purchase_type: d.purchase_type,
    current_stage: currentStage,
    stages,
  }
}

// ============================================================================
// FLOW outright / farmer_walkin — 4 stages rút gọn (1-shot tại cân)
// ============================================================================

async function buildQuickTimeline(d: any): Promise<ProductionTimeline> {
  const [weighbridge, stockIn, settlement] = await Promise.all([
    supabase.from('weighbridge_tickets')
      .select('completed_at').eq('deal_id', d.id).limit(1).maybeSingle(),
    supabase.from('stock_in_orders')
      .select('confirmed_at').eq('deal_id', d.id).limit(1).maybeSingle(),
    supabase.from('b2b_settlements')
      .select('paid_at, status').eq('deal_id', d.id).limit(1).maybeSingle(),
  ])

  const hasWeighed = !!(weighbridge.data as any)?.completed_at
  const hasStockIn = !!(stockIn.data as any)?.confirmed_at || d.stock_in_count > 0
  const isSettled = d.status === 'settled' || (settlement.data as any)?.status === 'paid'

  const stages: TimelineStage[] = [
    { key: 'booked', label: 'Đặt phiếu', status: 'done', timestamp: d.created_at },
    { key: 'weighed', label: 'Đã cân', status: hasWeighed ? 'done' : 'current', timestamp: (weighbridge.data as any)?.completed_at },
    { key: 'stock_in', label: 'Nhập kho', status: hasStockIn ? 'done' : (hasWeighed ? 'current' : 'pending'), timestamp: (stockIn.data as any)?.confirmed_at },
    { key: 'paid', label: 'Chi tiền', status: isSettled ? 'done' : (hasStockIn ? 'current' : 'pending'), timestamp: (settlement.data as any)?.paid_at },
  ]

  const currentStage = stages.find(s => s.status === 'current')?.key || stages[stages.length - 1].key

  return {
    deal_id: d.id,
    deal_number: d.deal_number,
    purchase_type: d.purchase_type,
    current_stage: currentStage,
    stages,
  }
}

export default { getTimeline }
