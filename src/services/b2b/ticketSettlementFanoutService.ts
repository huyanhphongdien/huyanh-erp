// ============================================================================
// Ticket Settlement Fan-out Service
// File: src/services/b2b/ticketSettlementFanoutService.ts
// Phase 25 of B2B Intake v4
// ============================================================================
// Use case: 1 weighbridge ticket có N line items thuộc N deal khác nhau.
// Sau khi cân xong → cần tạo settlement riêng cho mỗi deal.
// Partner-only lines (walk-in, không có deal_id) → skip hoặc tạo settlement
// partner-scoped (tùy flow).
// ============================================================================

import { supabase } from '../../lib/supabase'
import { getTicketLines, groupLinesByDeal, type TicketLine } from '../weighbridge/ticketLinesService'
import { autoSettlementService } from './autoSettlementService'

export interface FanoutResult {
  ticket_id: string
  total_lines: number
  deals_settled: string[]       // deal_ids có settlement tạo
  deals_skipped: string[]       // deal_ids skip (đã có settlement)
  partner_only_lines: number    // lines walk-in không có deal
  errors: Array<{ deal_id: string; message: string }>
}

/**
 * Fan-out settlement từ 1 ticket qua nhiều deals.
 *
 * Flow:
 * 1. getTicketLines(ticketId)
 * 2. Group lines theo deal_id
 * 3. Với mỗi group có deal_id → gọi autoSettlementService.createAutoSettlement(dealId)
 * 4. Partner-only lines (no deal_id) → record count, không tạo settlement
 *    (flow walk-in/outright tạo settlement trực tiếp qua orchestrator, không qua đây)
 *
 * Skip deal nếu đã có settlement (idempotent).
 */
export async function createSettlementsFromTicket(ticketId: string): Promise<FanoutResult> {
  const lines = await getTicketLines(ticketId)
  const grouped = groupLinesByDeal(lines)

  const result: FanoutResult = {
    ticket_id: ticketId,
    total_lines: lines.length,
    deals_settled: [],
    deals_skipped: [],
    partner_only_lines: (grouped.no_deal || []).length,
    errors: [],
  }

  // Process từng deal group
  for (const [dealId, groupLines] of Object.entries(grouped)) {
    if (dealId === 'no_deal') continue  // partner-only, skip

    try {
      // Check đã có settlement chưa
      const existing = await autoSettlementService.getExistingSettlement(dealId)
      if (existing) {
        result.deals_skipped.push(dealId)
        continue
      }

      // Tạo settlement tự động cho deal
      const settlementResult = await autoSettlementService.createAutoSettlement(dealId)
      if (settlementResult.success) {
        result.deals_settled.push(dealId)
      } else {
        result.errors.push({
          deal_id: dealId,
          message: settlementResult.error || 'Unknown error',
        })
      }
    } catch (err: any) {
      result.errors.push({
        deal_id: dealId,
        message: err.message || String(err),
      })
    }
  }

  return result
}

/**
 * Helper: lookup tổng line_amount_vnd cho 1 deal từ tất cả tickets đã cân cho deal đó.
 * Dùng khi muốn biết "đại lý này tổng tiền từ bao nhiêu lô" qua nhiều lần cân.
 */
export async function getDealTotalFromAllTickets(dealId: string): Promise<{
  total_kg: number
  total_amount_vnd: number
  ticket_count: number
}> {
  const { data, error } = await supabase
    .from('weighbridge_ticket_items')
    .select('actual_qty_kg, line_amount_vnd, ticket_id')
    .eq('deal_id', dealId)

  if (error) throw new Error(`Query failed: ${error.message}`)

  const items = (data || []) as any[]
  const uniqueTickets = new Set(items.map(i => i.ticket_id))

  return {
    total_kg: items.reduce((sum, i) => sum + Number(i.actual_qty_kg || 0), 0),
    total_amount_vnd: items.reduce((sum, i) => sum + Number(i.line_amount_vnd || 0), 0),
    ticket_count: uniqueTickets.size,
  }
}

export default { createSettlementsFromTicket, getDealTotalFromAllTickets }
