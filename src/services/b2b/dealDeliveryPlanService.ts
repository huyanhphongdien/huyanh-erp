// ============================================================================
// DEAL DELIVERY PLAN SERVICE — Quản lý kế hoạch giao hàng theo xe
// File: src/services/b2b/dealDeliveryPlanService.ts
//
// Luồng:
//   1. Nhà máy (admin) tạo plan khi đại lý gọi: "Xe 43C-123 chở 500kg"
//   2. Khi xe đến cân, weighbridge match theo vehicle_plate → markWeighed
//   3. Tab "Thông tin giao hàng" hiện bảng so sánh với variance highlight
// ============================================================================

import { supabase } from '../../lib/supabase'

export type DeliveryPlanStatus = 'pending' | 'weighed' | 'cancelled' | 'no_show'

export interface DeliveryPlan {
  id: string
  deal_id: string
  vehicle_plate: string
  driver_name: string | null
  driver_phone: string | null
  declared_kg: number
  declared_at: string
  declared_by: string | null
  notes: string | null
  weigh_ticket_id: string | null
  actual_kg: number | null
  weighed_at: string | null
  variance_kg: number | null
  status: DeliveryPlanStatus
  created_at: string
  updated_at: string
}

export interface CreateDeliveryPlanInput {
  deal_id: string
  vehicle_plate: string
  driver_name?: string
  driver_phone?: string
  declared_kg: number
  notes?: string
  declared_by?: string
}

export const DELIVERY_PLAN_STATUS_LABELS: Record<DeliveryPlanStatus, string> = {
  pending: 'Chờ xe đến',
  weighed: 'Đã cân',
  cancelled: 'Đã hủy',
  no_show: 'Không đến',
}

export const DELIVERY_PLAN_STATUS_COLORS: Record<DeliveryPlanStatus, string> = {
  pending: 'orange',
  weighed: 'green',
  cancelled: 'default',
  no_show: 'red',
}

export const dealDeliveryPlanService = {
  // ==========================================
  // QUERY
  // ==========================================

  async getByDeal(dealId: string): Promise<DeliveryPlan[]> {
    const { data, error } = await supabase
      .from('b2b_deal_delivery_plans')
      .select('*')
      .eq('deal_id', dealId)
      .order('declared_at', { ascending: false })

    if (error) throw error
    return (data || []) as DeliveryPlan[]
  },

  // ==========================================
  // CREATE
  // ==========================================

  async create(input: CreateDeliveryPlanInput): Promise<DeliveryPlan> {
    if (!input.deal_id) throw new Error('Thiếu deal_id')
    if (!input.vehicle_plate?.trim()) throw new Error('Thiếu biển số xe')
    if (!input.declared_kg || input.declared_kg <= 0) throw new Error('KL khai báo phải > 0')

    const { data, error } = await supabase
      .from('b2b_deal_delivery_plans')
      .insert({
        deal_id: input.deal_id,
        vehicle_plate: input.vehicle_plate.toUpperCase().trim(),
        driver_name: input.driver_name?.trim() || null,
        driver_phone: input.driver_phone?.trim() || null,
        declared_kg: input.declared_kg,
        notes: input.notes?.trim() || null,
        declared_by: input.declared_by || null,
        status: 'pending' as DeliveryPlanStatus,
      })
      .select('*')
      .single()

    if (error) throw error
    return data as DeliveryPlan
  },

  // ==========================================
  // UPDATE
  // ==========================================

  async update(id: string, patch: Partial<CreateDeliveryPlanInput>): Promise<DeliveryPlan> {
    const updateData: Record<string, any> = {}
    if (patch.vehicle_plate !== undefined) updateData.vehicle_plate = patch.vehicle_plate.toUpperCase().trim()
    if (patch.driver_name !== undefined) updateData.driver_name = patch.driver_name?.trim() || null
    if (patch.driver_phone !== undefined) updateData.driver_phone = patch.driver_phone?.trim() || null
    if (patch.declared_kg !== undefined) updateData.declared_kg = patch.declared_kg
    if (patch.notes !== undefined) updateData.notes = patch.notes?.trim() || null
    updateData.updated_at = new Date().toISOString()

    const { data, error } = await supabase
      .from('b2b_deal_delivery_plans')
      .update(updateData)
      .eq('id', id)
      .select('*')
      .single()

    if (error) throw error
    return data as DeliveryPlan
  },

  async setStatus(id: string, status: DeliveryPlanStatus): Promise<DeliveryPlan> {
    const { data, error } = await supabase
      .from('b2b_deal_delivery_plans')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single()

    if (error) throw error
    return data as DeliveryPlan
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('b2b_deal_delivery_plans')
      .delete()
      .eq('id', id)
    if (error) throw error
  },

  // ==========================================
  // MATCH FROM WEIGHBRIDGE
  // Gọi sau khi weighbridge complete ticket với deal_id set.
  // Tìm pending plan theo (deal_id + vehicle_plate) rồi gắn actual_kg.
  // ==========================================

  async matchFromWeighbridge(params: {
    deal_id: string
    vehicle_plate: string
    weigh_ticket_id: string
    actual_kg: number
  }): Promise<DeliveryPlan | null> {
    const plate = params.vehicle_plate.toUpperCase().trim()
    // Tìm plan 'pending' trùng plate gần nhất
    const { data: plans, error: fetchErr } = await supabase
      .from('b2b_deal_delivery_plans')
      .select('id')
      .eq('deal_id', params.deal_id)
      .eq('vehicle_plate', plate)
      .eq('status', 'pending')
      .order('declared_at', { ascending: true })
      .limit(1)

    if (fetchErr) throw fetchErr
    const plan = (plans || [])[0]
    if (!plan) return null

    const { data: updated, error: updErr } = await supabase
      .from('b2b_deal_delivery_plans')
      .update({
        weigh_ticket_id: params.weigh_ticket_id,
        actual_kg: params.actual_kg,
        weighed_at: new Date().toISOString(),
        status: 'weighed' as DeliveryPlanStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', plan.id)
      .select('*')
      .single()

    if (updErr) throw updErr
    return updated as DeliveryPlan
  },

  // ==========================================
  // SUMMARY — tính tổng cho tab "Thông tin giao hàng"
  // ==========================================

  summarize(plans: DeliveryPlan[]): {
    total_plans: number
    total_declared_kg: number
    total_actual_kg: number
    total_variance_kg: number
    pending_count: number
    weighed_count: number
    avg_variance_pct: number | null
  } {
    const totalDeclared = plans.reduce((s, p) => s + (p.declared_kg || 0), 0)
    const totalActual = plans.reduce((s, p) => s + (p.actual_kg || 0), 0)
    const totalVariance = plans.reduce((s, p) => s + (p.variance_kg || 0), 0)
    const weighed = plans.filter(p => p.status === 'weighed')
    const avgPct = weighed.length > 0
      ? weighed.reduce((s, p) => {
          if (!p.declared_kg) return s
          return s + ((p.variance_kg || 0) / p.declared_kg) * 100
        }, 0) / weighed.length
      : null

    return {
      total_plans: plans.length,
      total_declared_kg: totalDeclared,
      total_actual_kg: totalActual,
      total_variance_kg: totalVariance,
      pending_count: plans.filter(p => p.status === 'pending').length,
      weighed_count: weighed.length,
      avg_variance_pct: avgPct,
    }
  },
}

export default dealDeliveryPlanService
