// ============================================================================
// Ticket Lines Service — Unified API cho scalar + multi-lot tickets
// File: src/services/weighbridge/ticketLinesService.ts
// Phase 13 of B2B Intake v4
// ============================================================================
// Mục đích: Mọi downstream code (settlement, stock-in, audit, report) chỉ gọi
// getTicketLines(ticketId) — không cần biết ticket có has_items hay không.
//
// - Legacy ticket (has_items=false): synthesize 1 line từ scalar fields
// - New ticket (has_items=true):     query weighbridge_ticket_items
// ============================================================================

import { supabase } from '../../lib/supabase'

export interface TicketLine {
  line_no: number
  deal_id: string | null
  partner_id: string | null
  supplier_id: string | null
  rubber_type: string
  lot_code: string | null
  actual_qty_kg: number
  declared_qty_kg: number
  drc_percent: number | null
  unit_price: number | null
  line_amount_vnd: number | null
  notes: string | null
  /** Source info — caller không cần care, chỉ để debug */
  _source: 'scalar' | 'item'
}

/**
 * Lấy tất cả lines của 1 ticket.
 * Backward-compat: legacy ticket không có items sẽ synthesize 1 line từ scalar.
 *
 * @param ticketId UUID of weighbridge_tickets
 * @returns Array TicketLine — luôn ≥ 1 phần tử nếu ticket tồn tại
 */
export async function getTicketLines(ticketId: string): Promise<TicketLine[]> {
  // Load ticket metadata
  const { data: ticket, error: tErr } = await supabase
    .from('weighbridge_tickets')
    .select('*')
    .eq('id', ticketId)
    .maybeSingle()

  if (tErr) throw new Error(`Ticket load failed: ${tErr.message}`)
  if (!ticket) return []

  // Case 1: Multi-lot (has_items=true) → query junction table
  if (ticket.has_items) {
    const { data: items, error: iErr } = await supabase
      .from('weighbridge_ticket_items')
      .select('*')
      .eq('ticket_id', ticketId)
      .order('line_no', { ascending: true })

    if (iErr) throw new Error(`Items load failed: ${iErr.message}`)
    return (items || []).map((i: any) => ({
      line_no: i.line_no,
      deal_id: i.deal_id,
      partner_id: i.partner_id,
      supplier_id: i.supplier_id,
      rubber_type: i.rubber_type,
      lot_code: i.lot_code,
      actual_qty_kg: Number(i.actual_qty_kg || 0),
      declared_qty_kg: Number(i.declared_qty_kg || 0),
      drc_percent: i.drc_percent !== null ? Number(i.drc_percent) : null,
      unit_price: i.unit_price !== null ? Number(i.unit_price) : null,
      line_amount_vnd: i.line_amount_vnd !== null ? Number(i.line_amount_vnd) : null,
      notes: i.notes,
      _source: 'item' as const,
    }))
  }

  // Case 2: Legacy scalar (has_items=false) → synthesize 1 line
  // Note: field name tham chiếu schema hiện tại — có thể cần update
  // khi weighbridge_tickets schema thay đổi.
  const netWeight = Number((ticket as any).net_weight || 0)
  const drcPercent = (ticket as any).expected_drc !== undefined
    ? Number((ticket as any).expected_drc || 0) : null
  const unitPrice = (ticket as any).unit_price !== undefined
    ? Number((ticket as any).unit_price || 0) : null

  const lineAmount = (drcPercent !== null && unitPrice !== null)
    ? netWeight * drcPercent / 100 * unitPrice
    : null

  return [{
    line_no: 1,
    deal_id: (ticket as any).deal_id || null,
    partner_id: (ticket as any).partner_id || null,
    supplier_id: (ticket as any).supplier_id || null,
    rubber_type: (ticket as any).rubber_type || '',
    lot_code: (ticket as any).lot_code || null,
    actual_qty_kg: netWeight,
    declared_qty_kg: netWeight,  // scalar ticket không có declared riêng → = net
    drc_percent: drcPercent,
    unit_price: unitPrice,
    line_amount_vnd: lineAmount,
    notes: (ticket as any).notes || null,
    _source: 'scalar' as const,
  }]
}

/**
 * Helper: group lines theo deal_id (cho settlement fan-out).
 * Lines không có deal_id (walk-in partner-only) vào key 'no_deal'.
 */
export function groupLinesByDeal(lines: TicketLine[]): Record<string, TicketLine[]> {
  return lines.reduce((acc, line) => {
    const key = line.deal_id || 'no_deal'
    if (!acc[key]) acc[key] = []
    acc[key].push(line)
    return acc
  }, {} as Record<string, TicketLine[]>)
}

/**
 * Helper: compute tổng line_amount_vnd của nhiều lines.
 */
export function sumLineAmounts(lines: TicketLine[]): number {
  return lines.reduce((sum, l) => sum + (l.line_amount_vnd || 0), 0)
}

/**
 * Helper: compute tổng actual_qty_kg.
 */
export function sumActualQty(lines: TicketLine[]): number {
  return lines.reduce((sum, l) => sum + l.actual_qty_kg, 0)
}

export default {
  getTicketLines,
  groupLinesByDeal,
  sumLineAmounts,
  sumActualQty,
}
