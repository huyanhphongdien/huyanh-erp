// ============================================================================
// DOWNTIME SERVICE — Sự cố / dừng máy
// File: src/services/production/downtimeService.ts
// ============================================================================

import { supabase } from '../../lib/supabase'

export interface Downtime {
  id: string
  production_order_id: string | null
  line_id: string | null
  reason_category: string
  reason_detail: string | null
  started_at: string
  ended_at: string | null
  duration_minutes: number | null
  impact_level: string
  resolution: string | null
  reported_by: string | null
  resolved_by: string | null
  created_at: string
}

export const REASON_CATEGORIES: Record<string, string> = {
  mechanical: 'Cơ khí',
  electrical: 'Điện',
  material_shortage: 'Thiếu NVL',
  quality_issue: 'Chất lượng',
  planned_maintenance: 'Bảo trì',
  operator: 'Nhân công',
  other: 'Khác',
}

export const IMPACT_LEVELS: Record<string, { label: string; color: string }> = {
  low: { label: 'Thấp', color: 'green' },
  medium: { label: 'Trung bình', color: 'orange' },
  high: { label: 'Cao', color: 'red' },
  critical: { label: 'Nghiêm trọng', color: 'magenta' },
}

export const downtimeService = {

  async create(data: {
    production_order_id?: string
    line_id?: string
    reason_category: string
    reason_detail?: string
    impact_level?: string
    reported_by?: string
  }): Promise<Downtime> {
    const { data: created, error } = await supabase
      .from('production_downtimes')
      .insert({
        ...data,
        started_at: new Date().toISOString(),
      })
      .select()
      .single()
    if (error) throw error
    return created
  },

  async end(id: string, resolution?: string, resolvedBy?: string): Promise<void> {
    const { data: dt } = await supabase
      .from('production_downtimes')
      .select('started_at')
      .eq('id', id)
      .single()

    const duration = dt?.started_at
      ? Math.round((Date.now() - new Date(dt.started_at).getTime()) / 60000)
      : null

    const { error } = await supabase
      .from('production_downtimes')
      .update({
        ended_at: new Date().toISOString(),
        duration_minutes: duration,
        resolution: resolution || null,
        resolved_by: resolvedBy || null,
      })
      .eq('id', id)
    if (error) throw error
  },

  async getByOrder(orderId: string): Promise<Downtime[]> {
    const { data, error } = await supabase
      .from('production_downtimes')
      .select('*')
      .eq('production_order_id', orderId)
      .order('started_at', { ascending: false })
    if (error) throw error
    return data || []
  },

  async getByDateRange(from: string, to: string): Promise<Downtime[]> {
    const { data, error } = await supabase
      .from('production_downtimes')
      .select('*')
      .gte('started_at', from)
      .lte('started_at', to + 'T23:59:59')
      .order('started_at', { ascending: false })
    if (error) throw error
    return data || []
  },

  /** Pareto data — top lý do dừng máy */
  async getPareto(from: string, to: string): Promise<{ category: string; label: string; count: number; total_minutes: number }[]> {
    const { data, error } = await supabase
      .from('production_downtimes')
      .select('reason_category, duration_minutes')
      .gte('started_at', from)
      .lte('started_at', to + 'T23:59:59')
      .not('duration_minutes', 'is', null)
    if (error) throw error

    const agg: Record<string, { count: number; minutes: number }> = {}
    for (const d of (data || [])) {
      if (!agg[d.reason_category]) agg[d.reason_category] = { count: 0, minutes: 0 }
      agg[d.reason_category].count++
      agg[d.reason_category].minutes += d.duration_minutes || 0
    }

    return Object.entries(agg)
      .map(([cat, stats]) => ({
        category: cat,
        label: REASON_CATEGORIES[cat] || cat,
        count: stats.count,
        total_minutes: stats.minutes,
      }))
      .sort((a, b) => b.total_minutes - a.total_minutes)
  },
}

export default downtimeService
