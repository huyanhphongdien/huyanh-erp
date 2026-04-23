// ============================================================================
// Settlement Preview Service — Compute settlement ước tính dựa trên sample_drc
// File: src/services/b2b/settlementPreviewService.ts
// Phase 17 of B2B Intake v4
// ============================================================================
// Use case:
// - Flow drc_after_production: đại lý cần biết số tiền dự kiến SAU khi cân
//   + QC sample, TRƯỚC khi chạy sản xuất (có thể mất 3-7 ngày).
// - Preview = range low/high ±5% tùy actual DRC có thể khác sample.
// ============================================================================

import { supabase } from '../../lib/supabase'

export interface SettlementPreview {
  /** Gross estimated dựa trên sample_drc */
  estimated_gross: number
  /** Sau khi trừ advance đã ứng */
  estimated_remaining: number
  /** Range low-high tính ±5% (DRC actual có thể khác) */
  range: {
    low: number
    high: number
  }
  /** Currency code */
  currency: string
  /** Disclaimer text để hiển thị UI */
  disclaimer: string
  /** Flow không hỗ trợ preview (vd standard/outright/walkin) */
  not_supported?: string
}

/**
 * Tính preview settlement cho deal.
 *
 * Formula (flow drc_after_production):
 *   gross = quantity_kg × (sample_drc / 100) × unit_price
 *   remaining = gross - advance_paid
 *   range.low = remaining × 0.95   (DRC actual có thể thấp hơn 5%)
 *   range.high = remaining × 1.05  (DRC actual có thể cao hơn 5%)
 *
 * Flow khác:
 * - outright: gross đã chốt khi cân, không cần preview
 * - farmer_walkin: gross chốt khi cân, không cần preview
 * - standard: settlement tính sau khi có actual_drc, không cần preview
 */
export async function previewSettlement(dealId: string): Promise<SettlementPreview> {
  // Load deal
  const { data: deal, error: dErr } = await supabase
    .from('b2b_deals')
    .select('id, purchase_type, quantity_kg, unit_price, sample_drc, actual_drc, currency')
    .eq('id', dealId)
    .maybeSingle()

  if (dErr) throw new Error(`Deal load failed: ${dErr.message}`)
  if (!deal) throw new Error(`Deal not found: ${dealId}`)

  const currency = (deal as any).currency || 'VND'

  // Chỉ flow drc_after_production hỗ trợ preview
  if ((deal as any).purchase_type !== 'drc_after_production') {
    return {
      estimated_gross: 0,
      estimated_remaining: 0,
      range: { low: 0, high: 0 },
      currency,
      disclaimer: '',
      not_supported: `Preview chỉ khả dụng cho flow drc_after_production. Flow hiện tại: ${(deal as any).purchase_type}`,
    }
  }

  const qty = Number((deal as any).quantity_kg || 0)
  const price = Number((deal as any).unit_price || 0)
  const sampleDrc = Number((deal as any).sample_drc || 0)

  if (sampleDrc <= 0) {
    return {
      estimated_gross: 0,
      estimated_remaining: 0,
      range: { low: 0, high: 0 },
      currency,
      disclaimer: 'Chưa có sample_drc (QC chưa đo mẫu). Preview không khả dụng.',
      not_supported: 'Chưa có sample_drc',
    }
  }

  // Gross estimated
  const estimatedGross = qty * (sampleDrc / 100) * price

  // Lookup advance đã ứng cho deal này
  const { data: advances } = await supabase
    .from('b2b_advances')
    .select('amount')
    .eq('deal_id', dealId)
    .in('status', ['acknowledged', 'paid'])

  const totalAdvance = (advances || []).reduce((sum, a: any) => sum + Number(a.amount || 0), 0)
  const estimatedRemaining = Math.max(0, estimatedGross - totalAdvance)

  return {
    estimated_gross: Math.round(estimatedGross),
    estimated_remaining: Math.round(estimatedRemaining),
    range: {
      low: Math.round(estimatedRemaining * 0.95),
      high: Math.round(estimatedRemaining * 1.05),
    },
    currency,
    disclaimer: 'Ước tính dựa trên DRC mẫu QC. Actual DRC sau sản xuất có thể lệch ±5%. Settlement cuối dựa trên actual.',
  }
}

/**
 * Format preview thành text hiển thị UI.
 */
export function formatPreview(p: SettlementPreview): string {
  if (p.not_supported) return p.not_supported

  const fmt = (n: number) => n.toLocaleString('vi-VN')
  return `Dự kiến: ${fmt(p.estimated_remaining)} ${p.currency} (từ ${fmt(p.range.low)} đến ${fmt(p.range.high)} tùy DRC actual)`
}

export default { previewSettlement, formatPreview }
