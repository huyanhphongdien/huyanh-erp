// ============================================================================
// FILE: src/services/wms/alertService.ts
// MODULE: Kho Thành Phẩm (WMS) — Huy Anh Rubber ERP
// PHASE: P5 — Bước 5.2: Hệ thống cảnh báo
// MÔ TẢ: Kiểm tra & tạo cảnh báo tồn kho thấp/cao, lô sắp hết hạn,
//         lô quá hạn, QC cần tái kiểm
// BẢNG: stock_levels, stock_batches, materials, material_qc_standards
// ============================================================================

import { supabase } from '../../lib/supabase'
import type { Material, StockBatch } from './wms.types'

// ============================================================================
// TYPES
// ============================================================================

export type AlertType = 'low_stock' | 'over_stock' | 'expiring' | 'expired' | 'needs_recheck' | 'needs_blend'

export type AlertSeverity = 'high' | 'medium' | 'low'

export interface StockAlert {
  id: string                    // generated client-side
  type: AlertType
  severity: AlertSeverity
  material_id: string
  material: Material
  batch_id?: string
  batch?: Partial<StockBatch>
  message: string
  detail?: string              // mô tả chi tiết hơn
  created_at: string
  dismissed?: boolean
}

// ============================================================================
// HELPERS
// ============================================================================

let alertCounter = 0
const generateAlertId = () => `alert-${Date.now()}-${++alertCounter}`

// ============================================================================
// SERVICE
// ============================================================================

export const alertService = {

  // --------------------------------------------------------------------------
  // KIỂM TRA TẤT CẢ CẢNH BÁO
  // --------------------------------------------------------------------------

  /**
   * Scan toàn bộ tồn kho + lô → trả về DS cảnh báo
   * Gọi khi load dashboard hoặc pull-to-refresh
   */
  async checkAllAlerts(): Promise<StockAlert[]> {
    const alerts: StockAlert[] = []

    // Chạy song song các kiểm tra
    const [stockAlerts, expiryAlerts, recheckAlerts, blendAlerts] = await Promise.all([
      this.checkStockAlerts(),
      this.checkExpiryAlerts(),
      this.checkRecheckAlerts(),
      this.checkBlendAlerts(),
    ])

    alerts.push(...stockAlerts, ...expiryAlerts, ...recheckAlerts, ...blendAlerts)

    // Sort: high severity trước, rồi medium, rồi low
    const severityOrder = { high: 0, medium: 1, low: 2 }
    return alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])
  },

  // --------------------------------------------------------------------------
  // 1. CẢNH BÁO TỒN KHO THẤP / CAO
  // --------------------------------------------------------------------------

  async checkStockAlerts(): Promise<StockAlert[]> {
    const alerts: StockAlert[] = []

    // Lấy tất cả materials + stock_levels
    const { data: materials, error: matErr } = await supabase
      .from('materials')
      .select('id, sku, name, type, unit, weight_per_unit, min_stock, max_stock, is_active')
      .eq('is_active', true)
      .eq('type', 'finished')

    if (matErr) throw matErr

    for (const mat of (materials || []) as Material[]) {
      // Tính tổng tồn kho material này
      const { data: levels } = await supabase
        .from('stock_levels')
        .select('quantity')
        .eq('material_id', mat.id)

      const totalQty = (levels || []).reduce((sum, l) => sum + (l.quantity || 0), 0)

      // Check tồn thấp
      if (mat.min_stock > 0 && totalQty < mat.min_stock) {
        const severity: AlertSeverity = totalQty <= 0 ? 'high' : totalQty < mat.min_stock * 0.5 ? 'high' : 'medium'
        alerts.push({
          id: generateAlertId(),
          type: totalQty <= 0 ? 'low_stock' : 'low_stock',
          severity,
          material_id: mat.id,
          material: mat,
          message: totalQty <= 0
            ? `${mat.name}: HẾT HÀNG!`
            : `${mat.name}: Tồn ${totalQty} ${mat.unit} (dưới mức tối thiểu ${mat.min_stock})`,
          detail: `Tồn hiện tại: ${totalQty} / Min: ${mat.min_stock}`,
          created_at: new Date().toISOString(),
        })
      }

      // Check tồn cao
      if (mat.max_stock && totalQty > mat.max_stock) {
        alerts.push({
          id: generateAlertId(),
          type: 'over_stock',
          severity: 'low',
          material_id: mat.id,
          material: mat,
          message: `${mat.name}: Tồn ${totalQty} ${mat.unit} (vượt mức tối đa ${mat.max_stock})`,
          detail: `Tồn hiện tại: ${totalQty} / Max: ${mat.max_stock}`,
          created_at: new Date().toISOString(),
        })
      }
    }

    return alerts
  },

  // --------------------------------------------------------------------------
  // 2. CẢNH BÁO LÔ SẮP HẾT HẠN / QUÁ HẠN
  // --------------------------------------------------------------------------

  async checkExpiryAlerts(): Promise<StockAlert[]> {
    const alerts: StockAlert[] = []
    const now = new Date()

    // Lấy batches active có expiry_date
    const { data: batches, error } = await supabase
      .from('stock_batches')
      .select(`
        id, batch_no, material_id, quantity_remaining, expiry_date, received_date,
        material:materials(id, sku, name, type, unit)
      `)
      .eq('status', 'active')
      .gt('quantity_remaining', 0)
      .not('expiry_date', 'is', null)
      .order('expiry_date', { ascending: true })

    if (error) throw error

    for (const batch of (batches || []) as any[]) {
      if (!batch.expiry_date) continue

      const expiryDate = new Date(batch.expiry_date)
      const daysUntilExpiry = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

      if (daysUntilExpiry < 0) {
        // Đã quá hạn
        alerts.push({
          id: generateAlertId(),
          type: 'expired',
          severity: 'high',
          material_id: batch.material_id,
          material: batch.material as Material,
          batch_id: batch.id,
          batch: { batch_no: batch.batch_no, quantity_remaining: batch.quantity_remaining },
          message: `Lô ${batch.batch_no}: ĐÃ QUÁ HẠN ${Math.abs(daysUntilExpiry)} ngày!`,
          detail: `Hết hạn: ${expiryDate.toLocaleDateString('vi-VN')} | Còn ${batch.quantity_remaining} ${batch.material?.unit || ''}`,
          created_at: new Date().toISOString(),
        })
      } else if (daysUntilExpiry <= 7) {
        // Sắp hết hạn 7 ngày
        alerts.push({
          id: generateAlertId(),
          type: 'expiring',
          severity: 'high',
          material_id: batch.material_id,
          material: batch.material as Material,
          batch_id: batch.id,
          batch: { batch_no: batch.batch_no, quantity_remaining: batch.quantity_remaining },
          message: `Lô ${batch.batch_no}: Hết hạn trong ${daysUntilExpiry} ngày!`,
          detail: `Hết hạn: ${expiryDate.toLocaleDateString('vi-VN')} | Còn ${batch.quantity_remaining} ${batch.material?.unit || ''}`,
          created_at: new Date().toISOString(),
        })
      } else if (daysUntilExpiry <= 15) {
        alerts.push({
          id: generateAlertId(),
          type: 'expiring',
          severity: 'medium',
          material_id: batch.material_id,
          material: batch.material as Material,
          batch_id: batch.id,
          batch: { batch_no: batch.batch_no, quantity_remaining: batch.quantity_remaining },
          message: `Lô ${batch.batch_no}: Hết hạn trong ${daysUntilExpiry} ngày`,
          detail: `Hết hạn: ${expiryDate.toLocaleDateString('vi-VN')}`,
          created_at: new Date().toISOString(),
        })
      } else if (daysUntilExpiry <= 30) {
        alerts.push({
          id: generateAlertId(),
          type: 'expiring',
          severity: 'low',
          material_id: batch.material_id,
          material: batch.material as Material,
          batch_id: batch.id,
          batch: { batch_no: batch.batch_no, quantity_remaining: batch.quantity_remaining },
          message: `Lô ${batch.batch_no}: Hết hạn trong ${daysUntilExpiry} ngày`,
          detail: `Hết hạn: ${expiryDate.toLocaleDateString('vi-VN')}`,
          created_at: new Date().toISOString(),
        })
      }
    }

    return alerts
  },

  // --------------------------------------------------------------------------
  // 3. CẢNH BÁO LÔ CẦN TÁI KIỂM DRC
  // --------------------------------------------------------------------------

  async checkRecheckAlerts(): Promise<StockAlert[]> {
    const alerts: StockAlert[] = []
    const now = new Date().toISOString()

    // Lấy batches cần tái kiểm (next_recheck_date <= today)
    const { data: batches, error } = await supabase
      .from('stock_batches')
      .select(`
        id, batch_no, material_id, quantity_remaining, 
        latest_drc, next_recheck_date, last_qc_date,
        material:materials(id, sku, name, type, unit)
      `)
      .eq('status', 'active')
      .gt('quantity_remaining', 0)
      .not('next_recheck_date', 'is', null)
      .lte('next_recheck_date', now)
      .order('next_recheck_date', { ascending: true })

    if (error) throw error

    for (const batch of (batches || []) as any[]) {
      const recheckDate = new Date(batch.next_recheck_date)
      const daysPast = Math.ceil((Date.now() - recheckDate.getTime()) / (1000 * 60 * 60 * 24))

      alerts.push({
        id: generateAlertId(),
        type: 'needs_recheck',
        severity: daysPast > 7 ? 'high' : daysPast > 3 ? 'medium' : 'low',
        material_id: batch.material_id,
        material: batch.material as Material,
        batch_id: batch.id,
        batch: { batch_no: batch.batch_no, quantity_remaining: batch.quantity_remaining },
        message: `Lô ${batch.batch_no}: Cần tái kiểm DRC${daysPast > 0 ? ` (quá hạn ${daysPast} ngày)` : ''}`,
        detail: `DRC hiện tại: ${batch.latest_drc || '?'}% | Hạn tái kiểm: ${recheckDate.toLocaleDateString('vi-VN')}`,
        created_at: new Date().toISOString(),
      })
    }

    return alerts
  },

  // --------------------------------------------------------------------------
  // 4. CẢNH BÁO LÔ CẦN PHỐI TRỘN
  // --------------------------------------------------------------------------

  async checkBlendAlerts(): Promise<StockAlert[]> {
    const alerts: StockAlert[] = []

    const { data: batches, error } = await supabase
      .from('stock_batches')
      .select(`
        id, batch_no, material_id, quantity_remaining, latest_drc,
        material:materials(id, sku, name, type, unit)
      `)
      .eq('status', 'active')
      .eq('qc_status', 'needs_blend')
      .gt('quantity_remaining', 0)

    if (error) throw error

    for (const batch of (batches || []) as any[]) {
      alerts.push({
        id: generateAlertId(),
        type: 'needs_blend',
        severity: 'medium',
        material_id: batch.material_id,
        material: batch.material as Material,
        batch_id: batch.id,
        batch: { batch_no: batch.batch_no, quantity_remaining: batch.quantity_remaining },
        message: `Lô ${batch.batch_no}: DRC ${batch.latest_drc || '?'}% — cần phối trộn`,
        detail: `Còn ${batch.quantity_remaining} ${batch.material?.unit || ''} chờ phối trộn`,
        created_at: new Date().toISOString(),
      })
    }

    return alerts
  },

  // --------------------------------------------------------------------------
  // LẤY CẢNH BÁO THEO LOẠI
  // --------------------------------------------------------------------------

  async getAlertsByType(type: AlertType): Promise<StockAlert[]> {
    const all = await this.checkAllAlerts()
    return all.filter(a => a.type === type)
  },

  // --------------------------------------------------------------------------
  // ĐẾM CẢNH BÁO (cho badge trên sidebar)
  // --------------------------------------------------------------------------

  async getAlertCount(): Promise<{ total: number; high: number; medium: number; low: number }> {
    const all = await this.checkAllAlerts()
    return {
      total: all.length,
      high: all.filter(a => a.severity === 'high').length,
      medium: all.filter(a => a.severity === 'medium').length,
      low: all.filter(a => a.severity === 'low').length,
    }
  },
}

export default alertService
