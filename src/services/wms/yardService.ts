// ============================================================================
// FILE: src/services/wms/yardService.ts
// MODULE: Kho Thành Phẩm (WMS) — Huy Anh Rubber ERP
// MÔ TẢ: Quản lý bản đồ bãi nguyên liệu (Yard Map)
//         Lưu vị trí lô hàng trong bãi theo zone/row/col
// BẢNG: stock_batches (yard_zone, yard_row, yard_col)
// ============================================================================

import { supabase } from '../../lib/supabase'

// ============================================================================
// TYPES
// ============================================================================

export interface YardZoneConfig {
  code: string        // A, B, C
  name: string        // Bãi A, Bãi B
  rows: number        // 10
  cols: number        // 5
}

export interface YardConfig {
  zones: YardZoneConfig[]
}

export interface YardBatchInfo {
  id: string
  batch_no: string
  rubber_type: string
  rubber_grade: string | null
  latest_drc: number | null
  current_weight: number
  qc_status: string
  supplier_name: string | null
  created_at: string
  storage_days: number
}

export interface YardCell {
  zone: string
  row: number
  col: number
  batch?: YardBatchInfo
}

// ============================================================================
// CONSTANTS
// ============================================================================

const YARD_CONFIG_KEY = 'huyanh_yard_config'

const DEFAULT_CONFIG: YardConfig = {
  zones: [
    { code: 'A', name: 'Bãi A', rows: 10, cols: 5 },
    { code: 'B', name: 'Bãi B', rows: 10, cols: 5 },
    { code: 'C', name: 'Bãi C', rows: 10, cols: 5 },
  ],
}

const YARD_BATCH_SELECT = `
  id, batch_no, rubber_type, rubber_grade,
  latest_drc, current_weight, qc_status,
  supplier_name, created_at, storage_days,
  yard_zone, yard_row, yard_col,
  warehouse_id, status
`

// ============================================================================
// SERVICE
// ============================================================================

export const yardService = {

  // --------------------------------------------------------------------------
  // CONFIG — Lưu/đọc cấu hình bãi từ localStorage
  // --------------------------------------------------------------------------

  getConfig(): YardConfig {
    try {
      const raw = localStorage.getItem(YARD_CONFIG_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as YardConfig
        if (parsed.zones && parsed.zones.length > 0) return parsed
      }
    } catch {
      // ignore parse errors
    }
    return DEFAULT_CONFIG
  },

  saveConfig(config: YardConfig): void {
    localStorage.setItem(YARD_CONFIG_KEY, JSON.stringify(config))
  },

  // --------------------------------------------------------------------------
  // GET YARD MAP — Lấy tất cả ô bãi + batch nếu có
  // --------------------------------------------------------------------------

  async getYardMap(warehouseId?: string): Promise<YardCell[]> {
    const config = this.getConfig()

    // Fetch batches with yard positions
    let query = supabase
      .from('stock_batches')
      .select(YARD_BATCH_SELECT)
      .not('yard_zone', 'is', null)
      .eq('status', 'active')

    if (warehouseId) {
      query = query.eq('warehouse_id', warehouseId)
    }

    const { data: batches, error } = await query
    if (error) throw error

    // Build lookup map: "zone-row-col" → batch
    const batchMap = new Map<string, YardBatchInfo>()
    for (const b of (batches || [])) {
      if (b.yard_zone && b.yard_row != null && b.yard_col != null) {
        const key = `${b.yard_zone}-${b.yard_row}-${b.yard_col}`
        batchMap.set(key, {
          id: b.id,
          batch_no: b.batch_no,
          rubber_type: b.rubber_type || '',
          rubber_grade: b.rubber_grade || null,
          latest_drc: b.latest_drc,
          current_weight: b.current_weight || 0,
          qc_status: b.qc_status || 'pending',
          supplier_name: b.supplier_name || null,
          created_at: b.created_at,
          storage_days: b.storage_days || 0,
        })
      }
    }

    // Build full grid
    const cells: YardCell[] = []
    for (const zone of config.zones) {
      for (let r = 1; r <= zone.rows; r++) {
        for (let c = 1; c <= zone.cols; c++) {
          const key = `${zone.code}-${r}-${c}`
          cells.push({
            zone: zone.code,
            row: r,
            col: c,
            batch: batchMap.get(key),
          })
        }
      }
    }

    return cells
  },

  // --------------------------------------------------------------------------
  // ASSIGN POSITION — Gán batch vào ô bãi
  // --------------------------------------------------------------------------

  async assignPosition(batchId: string, zone: string, row: number, col: number): Promise<void> {
    // Check if position is already occupied
    const { data: existing } = await supabase
      .from('stock_batches')
      .select('id, batch_no')
      .eq('yard_zone', zone)
      .eq('yard_row', row)
      .eq('yard_col', col)
      .eq('status', 'active')
      .maybeSingle()

    if (existing && existing.id !== batchId) {
      throw new Error(`Ô ${zone}-${row}-${col} đã có lô ${existing.batch_no}. Vui lòng di chuyển lô cũ trước.`)
    }

    const { error } = await supabase
      .from('stock_batches')
      .update({
        yard_zone: zone,
        yard_row: row,
        yard_col: col,
        updated_at: new Date().toISOString(),
      })
      .eq('id', batchId)

    if (error) throw error
  },

  // --------------------------------------------------------------------------
  // MOVE POSITION — Di chuyển batch sang ô mới
  // --------------------------------------------------------------------------

  async movePosition(batchId: string, newZone: string, newRow: number, newCol: number): Promise<void> {
    // Check target is empty
    const { data: existing } = await supabase
      .from('stock_batches')
      .select('id, batch_no')
      .eq('yard_zone', newZone)
      .eq('yard_row', newRow)
      .eq('yard_col', newCol)
      .eq('status', 'active')
      .maybeSingle()

    if (existing && existing.id !== batchId) {
      throw new Error(`Ô ${newZone}-${newRow}-${newCol} đã có lô ${existing.batch_no}. Không thể di chuyển.`)
    }

    const { error } = await supabase
      .from('stock_batches')
      .update({
        yard_zone: newZone,
        yard_row: newRow,
        yard_col: newCol,
        updated_at: new Date().toISOString(),
      })
      .eq('id', batchId)

    if (error) throw error
  },

  // --------------------------------------------------------------------------
  // CLEAR POSITION — Xóa vị trí bãi (lô đã xuất/hết)
  // --------------------------------------------------------------------------

  async clearPosition(batchId: string): Promise<void> {
    const { error } = await supabase
      .from('stock_batches')
      .update({
        yard_zone: null,
        yard_row: null,
        yard_col: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', batchId)

    if (error) throw error
  },

  // --------------------------------------------------------------------------
  // GET EMPTY POSITIONS — Danh sách ô trống
  // --------------------------------------------------------------------------

  async getEmptyPositions(warehouseId?: string): Promise<Array<{ zone: string; row: number; col: number }>> {
    const config = this.getConfig()

    // Fetch occupied positions
    let query = supabase
      .from('stock_batches')
      .select('yard_zone, yard_row, yard_col')
      .not('yard_zone', 'is', null)
      .eq('status', 'active')

    if (warehouseId) {
      query = query.eq('warehouse_id', warehouseId)
    }

    const { data: occupied, error } = await query
    if (error) throw error

    const occupiedSet = new Set(
      (occupied || []).map(b => `${b.yard_zone}-${b.yard_row}-${b.yard_col}`)
    )

    const empty: Array<{ zone: string; row: number; col: number }> = []
    for (const zone of config.zones) {
      for (let r = 1; r <= zone.rows; r++) {
        for (let c = 1; c <= zone.cols; c++) {
          const key = `${zone.code}-${r}-${c}`
          if (!occupiedSet.has(key)) {
            empty.push({ zone: zone.code, row: r, col: c })
          }
        }
      }
    }

    return empty
  },

  // --------------------------------------------------------------------------
  // GET YARD STATS — Thống kê bãi
  // --------------------------------------------------------------------------

  async getYardStats(warehouseId?: string): Promise<{
    total_positions: number
    occupied: number
    empty: number
    total_weight_kg: number
    batches_pending_qc: number
    batches_passed: number
    avg_drc: number | null
    avg_storage_days: number
  }> {
    const config = this.getConfig()
    const totalPositions = config.zones.reduce((s, z) => s + z.rows * z.cols, 0)

    // Fetch batches with yard positions
    let query = supabase
      .from('stock_batches')
      .select('id, current_weight, qc_status, latest_drc, storage_days')
      .not('yard_zone', 'is', null)
      .eq('status', 'active')

    if (warehouseId) {
      query = query.eq('warehouse_id', warehouseId)
    }

    const { data: batches, error } = await query
    if (error) throw error

    const batchList = batches || []
    const occupied = batchList.length
    const totalWeight = batchList.reduce((s, b) => s + (b.current_weight || 0), 0)
    const pendingQC = batchList.filter(b => b.qc_status === 'pending').length
    const passed = batchList.filter(b => b.qc_status === 'passed').length

    const drcValues = batchList
      .map(b => b.latest_drc)
      .filter((v): v is number => v != null && v > 0)
    const avgDrc = drcValues.length > 0
      ? drcValues.reduce((s, v) => s + v, 0) / drcValues.length
      : null

    const storageDays = batchList.map(b => b.storage_days || 0)
    const avgStorageDays = storageDays.length > 0
      ? storageDays.reduce((s, v) => s + v, 0) / storageDays.length
      : 0

    return {
      total_positions: totalPositions,
      occupied,
      empty: totalPositions - occupied,
      total_weight_kg: totalWeight,
      batches_pending_qc: pendingQC,
      batches_passed: passed,
      avg_drc: avgDrc,
      avg_storage_days: Math.round(avgStorageDays),
    }
  },
}

export default yardService
