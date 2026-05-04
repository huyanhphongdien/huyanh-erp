// ============================================================================
// Sales Stage Service — chuyển stage + handoff log
// File: src/services/sales/salesStageService.ts
// ============================================================================

import { supabase } from '../../lib/supabase'
import type { SalesStage } from './salesStages'
import { SALES_STAGE_NEXT } from './salesStages'

export interface HandoffRow {
  id: string
  sales_order_id: string
  from_dept: SalesStage | null
  to_dept: SalesStage
  passed_by: string | null
  received_by: string | null
  passed_at: string
  received_at: string | null
  dwell_time_hours: number | null
  passed_notes: string | null
  received_notes: string | null
  created_at: string
  // Joined
  passer?: { id: string; full_name: string; code: string } | null
}

export interface CapacityRow {
  dept_code: SalesStage
  dept_name: string
  max_concurrent_orders: number
  warning_threshold_pct: number
  critical_threshold_pct: number
  default_sla_hours: number
  is_active: boolean
}

export const salesStageService = {
  /**
   * Chuyển 1 đơn sang stage tiếp theo (hoặc stage chỉ định).
   * Trigger DB log_sales_stage_change tự sinh handoff log.
   */
  async transitionStage(
    orderId: string,
    nextStage: SalesStage,
    passedBy: string,
    notes?: string,
  ): Promise<{ success: boolean; error?: string }> {
    // Set session var để trigger lấy được passed_by
    try {
      await supabase.rpc('set_config', {
        setting_name: 'app.current_user_id',
        new_value: passedBy,
        is_local: true,
      })
    } catch {
      // RPC có thể chưa có — trigger fallback về current_owner_id cũ
    }

    const updateData: Record<string, unknown> = {
      current_stage: nextStage,
      // current_owner_id sẽ được set trong UI bước "assign owner mới"
    }

    const { data, error } = await supabase
      .from('sales_orders')
      .update(updateData)
      .eq('id', orderId)
      .select('id, current_stage, stage_started_at, stage_sla_hours')
      .single()

    if (error) {
      return { success: false, error: error.message }
    }

    // Update notes của handoff vừa fire (nếu có)
    if (notes) {
      const { data: lastHandoff } = await supabase
        .from('sales_order_handoffs')
        .select('id')
        .eq('sales_order_id', orderId)
        .order('passed_at', { ascending: false })
        .limit(1)
        .single()
      if (lastHandoff?.id) {
        await supabase
          .from('sales_order_handoffs')
          .update({ passed_notes: notes })
          .eq('id', lastHandoff.id)
      }
    }

    return { success: !!data }
  },

  /**
   * Pass sang stage tiếp theo theo flow chuẩn (sales → raw_material → ...)
   */
  async passToNext(orderId: string, currentStage: SalesStage, passedBy: string, notes?: string) {
    const next = SALES_STAGE_NEXT[currentStage]
    if (!next) {
      return { success: false, error: 'Đã ở stage cuối (delivered) — không thể chuyển tiếp.' }
    }
    return this.transitionStage(orderId, next, passedBy, notes)
  },

  /**
   * Reassign owner cho đơn mà không chuyển stage
   */
  async reassignOwner(orderId: string, newOwnerId: string): Promise<{ success: boolean; error?: string }> {
    const { error } = await supabase
      .from('sales_orders')
      .update({ current_owner_id: newOwnerId })
      .eq('id', orderId)
      .select('id')
      .single()
    return { success: !error, error: error?.message }
  },

  /**
   * Lấy lịch sử handoff cho 1 đơn
   */
  async getHandoffHistory(orderId: string): Promise<HandoffRow[]> {
    const { data, error } = await supabase
      .from('sales_order_handoffs')
      .select(`
        *,
        passer:employees!sales_order_handoffs_passed_by_fkey(id, full_name, code)
      `)
      .eq('sales_order_id', orderId)
      .order('passed_at', { ascending: true })

    if (error) {
      console.error('[getHandoffHistory] error:', error)
      return []
    }
    return (data || []).map((r: any) => ({
      ...r,
      passer: Array.isArray(r.passer) ? r.passer[0] : r.passer,
    })) as HandoffRow[]
  },

  /**
   * Lấy capacity config tất cả bộ phận
   */
  async getCapacityConfig(): Promise<CapacityRow[]> {
    const { data } = await supabase
      .from('sales_dept_capacity')
      .select('*')
      .eq('is_active', true)
      .order('dept_code')
    return (data || []) as CapacityRow[]
  },

  /**
   * Lấy load real-time mỗi bộ phận: COUNT đơn đang ở stage X (không phải delivered/cancelled)
   */
  async getDeptLoad(): Promise<Record<SalesStage, number>> {
    const { data } = await supabase
      .from('sales_orders')
      .select('current_stage')
      .neq('status', 'cancelled')
    const counts: Partial<Record<SalesStage, number>> = {}
    ;(data || []).forEach((r: any) => {
      const s = r.current_stage as SalesStage
      counts[s] = (counts[s] || 0) + 1
    })
    return counts as Record<SalesStage, number>
  },
}
