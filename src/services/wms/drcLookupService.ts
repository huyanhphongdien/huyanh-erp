// ============================================================================
// FILE: src/services/wms/drcLookupService.ts
// MODULE: Trạm cân — bảng tra cứu DRC từ Metrolac (ĐỐT)
// MÔ TẢ: CRUD bảng drc_lookup + helper lookup(metrolac) với linear interpolation
// BẢNG: drc_lookup
// ============================================================================

import { supabase } from '../../lib/supabase'

export interface DrcLookupRow {
  metrolac_reading: number
  drc_pct: number
  source?: string | null
  notes?: string | null
  updated_by?: string | null
  updated_at?: string | null
}

let cache: DrcLookupRow[] | null = null
let cacheLoadedAt = 0
const CACHE_TTL_MS = 5 * 60 * 1000

const drcLookupService = {
  /** Lấy toàn bộ bảng (sorted by metrolac_reading). Có cache 5 phút. */
  async getAll(forceFresh = false): Promise<DrcLookupRow[]> {
    if (!forceFresh && cache && Date.now() - cacheLoadedAt < CACHE_TTL_MS) {
      return cache
    }
    const { data, error } = await supabase
      .from('drc_lookup')
      .select('*')
      .order('metrolac_reading', { ascending: true })
    if (error) throw error
    cache = (data || []) as DrcLookupRow[]
    cacheLoadedAt = Date.now()
    return cache
  },

  /**
   * Tra DRC% từ chỉ số Metrolac.
   * - Integer in-range: exact lookup
   * - Số lẻ: linear interpolation giữa floor/ceil
   * - Out-of-range: extrapolate theo slope của 2 dòng biên
   * - Bảng rỗng / lỗi: trả null
   */
  async lookup(metrolac: number | null | undefined): Promise<number | null> {
    if (metrolac == null || !Number.isFinite(metrolac)) return null
    const rows = await this.getAll()
    if (rows.length === 0) return null
    return interpolate(rows, metrolac)
  },

  /** Sync version — yêu cầu rows đã load sẵn (vd qua useQuery). */
  lookupSync(rows: DrcLookupRow[], metrolac: number | null | undefined): number | null {
    if (metrolac == null || !Number.isFinite(metrolac)) return null
    if (rows.length === 0) return null
    return interpolate(rows, metrolac)
  },

  /** Upsert 1 dòng (insert nếu mới, update nếu đã tồn tại). */
  async upsert(row: Pick<DrcLookupRow, 'metrolac_reading' | 'drc_pct'> & Partial<DrcLookupRow>): Promise<DrcLookupRow> {
    const { data, error } = await supabase
      .from('drc_lookup')
      .upsert({
        metrolac_reading: row.metrolac_reading,
        drc_pct: row.drc_pct,
        notes: row.notes ?? null,
        source: row.source ?? undefined,
      }, { onConflict: 'metrolac_reading' })
      .select()
      .single()
    if (error) throw error
    invalidateCache()
    return data as DrcLookupRow
  },

  /** Bulk upsert. */
  async upsertMany(rows: Array<Pick<DrcLookupRow, 'metrolac_reading' | 'drc_pct'>>): Promise<number> {
    if (rows.length === 0) return 0
    const { error, count } = await supabase
      .from('drc_lookup')
      .upsert(rows, { onConflict: 'metrolac_reading', count: 'exact' })
    if (error) throw error
    invalidateCache()
    return count ?? rows.length
  },

  async remove(metrolacReading: number): Promise<void> {
    const { error } = await supabase
      .from('drc_lookup')
      .delete()
      .eq('metrolac_reading', metrolacReading)
    if (error) throw error
    invalidateCache()
  },

  invalidateCache,
}

function invalidateCache() {
  cache = null
  cacheLoadedAt = 0
}

function interpolate(rows: DrcLookupRow[], m: number): number {
  const sorted = rows  // assume already sorted by getAll()
  const min = sorted[0]
  const max = sorted[sorted.length - 1]

  // Exact match (integer)
  if (Number.isInteger(m)) {
    const hit = sorted.find(r => r.metrolac_reading === m)
    if (hit) return round2(hit.drc_pct)
  }

  // Out-of-range — extrapolate
  if (m < min.metrolac_reading) {
    const a = sorted[0]
    const b = sorted[1] ?? a
    const slope = (b.drc_pct - a.drc_pct) / Math.max(1, b.metrolac_reading - a.metrolac_reading)
    return round2(Math.max(0, a.drc_pct + slope * (m - a.metrolac_reading)))
  }
  if (m > max.metrolac_reading) {
    const a = sorted[sorted.length - 2] ?? max
    const b = max
    const slope = (b.drc_pct - a.drc_pct) / Math.max(1, b.metrolac_reading - a.metrolac_reading)
    return round2(Math.min(100, b.drc_pct + slope * (m - b.metrolac_reading)))
  }

  // In-range — linear interpolate between floor & ceil
  const floor = Math.floor(m)
  const ceil = Math.ceil(m)
  const f = sorted.find(r => r.metrolac_reading === floor)
  const c = sorted.find(r => r.metrolac_reading === ceil)
  if (f && c) {
    if (floor === ceil) return round2(f.drc_pct)
    return round2(f.drc_pct + (c.drc_pct - f.drc_pct) * (m - floor))
  }
  // Fallback — nearest
  return round2((f ?? c ?? min).drc_pct)
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export default drcLookupService
