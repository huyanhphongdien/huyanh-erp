// ============================================================================
// SHIFT REPORT SERVICE — Báo cáo ca sản xuất
// File: src/services/production/shiftReportService.ts
// ============================================================================

import { supabase } from '../../lib/supabase'

export interface ShiftReport {
  id: string
  report_date: string
  shift: string
  team: string | null
  line_id: string | null
  planned_output_kg: number
  actual_output_kg: number
  yield_percent: number | null
  total_run_minutes: number
  total_downtime_minutes: number
  total_bales: number
  passed_bales: number
  rejected_bales: number
  qc_pass_rate: number | null
  oee_availability: number | null
  oee_performance: number | null
  oee_quality: number | null
  oee_overall: number | null
  headcount: number | null
  handover_notes: string | null
  incidents: string | null
  reported_by: string | null
  approved_by: string | null
  created_at: string
}

export const shiftReportService = {

  async create(data: Partial<ShiftReport>): Promise<ShiftReport> {
    // Auto-calculate OEE
    const planned = data.total_run_minutes || 480 // 8h default
    const downtime = data.total_downtime_minutes || 0
    const actualOutput = data.actual_output_kg || 0
    const plannedOutput = data.planned_output_kg || 1
    const passed = data.passed_bales || 0
    const total = data.total_bales || 1

    const availability = planned > 0 ? Math.round((planned - downtime) / planned * 100) : 0
    const performance = plannedOutput > 0 ? Math.round(actualOutput / plannedOutput * 100) : 0
    const quality = total > 0 ? Math.round(passed / total * 100) : 0
    const oee = Math.round(availability * performance * quality / 10000)

    const { data: created, error } = await supabase
      .from('shift_production_reports')
      .insert({
        ...data,
        yield_percent: plannedOutput > 0 ? Math.round(actualOutput / plannedOutput * 1000) / 10 : null,
        qc_pass_rate: total > 0 ? Math.round(passed / total * 1000) / 10 : null,
        oee_availability: availability,
        oee_performance: Math.min(performance, 100),
        oee_quality: quality,
        oee_overall: oee,
      })
      .select()
      .single()
    if (error) throw error
    return created
  },

  async getByDate(date: string): Promise<ShiftReport[]> {
    const { data, error } = await supabase
      .from('shift_production_reports')
      .select('*')
      .eq('report_date', date)
      .order('shift')
    if (error) throw error
    return data || []
  },

  async getByRange(from: string, to: string): Promise<ShiftReport[]> {
    const { data, error } = await supabase
      .from('shift_production_reports')
      .select('*')
      .gte('report_date', from)
      .lte('report_date', to)
      .order('report_date', { ascending: false })
    if (error) throw error
    return data || []
  },

  /** Tổng hợp OEE theo khoảng thời gian */
  async getOEESummary(from: string, to: string): Promise<{
    avg_availability: number; avg_performance: number; avg_quality: number; avg_oee: number; report_count: number
  }> {
    const reports = await this.getByRange(from, to)
    if (reports.length === 0) return { avg_availability: 0, avg_performance: 0, avg_quality: 0, avg_oee: 0, report_count: 0 }

    const sum = reports.reduce((acc, r) => ({
      a: acc.a + (r.oee_availability || 0),
      p: acc.p + (r.oee_performance || 0),
      q: acc.q + (r.oee_quality || 0),
      o: acc.o + (r.oee_overall || 0),
    }), { a: 0, p: 0, q: 0, o: 0 })

    const n = reports.length
    return {
      avg_availability: Math.round(sum.a / n * 10) / 10,
      avg_performance: Math.round(sum.p / n * 10) / 10,
      avg_quality: Math.round(sum.q / n * 10) / 10,
      avg_oee: Math.round(sum.o / n * 10) / 10,
      report_count: n,
    }
  },
}

export default shiftReportService
