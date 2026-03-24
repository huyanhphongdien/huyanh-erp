// ============================================================================
// WEIGHT TRACKING SERVICE
// File: src/services/wms/weightTrackingService.ts
// Theo dõi hao hụt trọng lượng cao su theo thời gian
// Bảng: weight_check_logs, stock_batches
// ============================================================================

import { supabase } from '../../lib/supabase'
import type {
  WeightCheckLog,
  StockBatch,
} from './wms.types'

// ============================================================================
// SERVICE
// ============================================================================

export const weightTrackingService = {

  // --------------------------------------------------------------------------
  // GHI NHẬN KIỂM TRA TRỌNG LƯỢNG
  // --------------------------------------------------------------------------

  /**
   * Ghi nhận kiểm tra trọng lượng cho 1 batch
   * 1. Lấy current_weight của batch
   * 2. Insert weight_check_logs
   * 3. Update batch: current_weight, weight_loss, last_weight_check
   */
  async recordWeightCheck(
    batchId: string,
    newWeight: number,
    reason: 'drying' | 'reweigh' | 'adjust' = 'drying',
    checkedBy?: string,
    notes?: string
  ): Promise<WeightCheckLog | null> {
    // 1. Lấy batch hiện tại
    const { data: batch } = await supabase
      .from('stock_batches')
      .select('current_weight, initial_weight, weight_loss')
      .eq('id', batchId)
      .single()

    if (!batch) {
      console.error('recordWeightCheck: batch not found', batchId)
      return null
    }

    const previousWeight = batch.current_weight || batch.initial_weight || 0
    const weightChange = Math.round((newWeight - previousWeight) * 100) / 100

    // 2. Insert log
    const { data: log, error: logError } = await supabase
      .from('weight_check_logs')
      .insert({
        batch_id: batchId,
        previous_weight: previousWeight,
        new_weight: newWeight,
        weight_change: weightChange,
        change_reason: reason,
        checked_by: checkedBy || null,
        notes: notes || null,
      })
      .select('*')
      .single()

    if (logError) {
      console.error('recordWeightCheck insert error:', logError)
      return null
    }

    // 3. Update batch
    const initialWeight = batch.initial_weight || previousWeight
    const totalLoss = Math.round((initialWeight - newWeight) * 100) / 100

    await supabase
      .from('stock_batches')
      .update({
        current_weight: newWeight,
        weight_loss: Math.max(0, totalLoss),
        last_weight_check: new Date().toISOString().split('T')[0],
        updated_at: new Date().toISOString(),
      })
      .eq('id', batchId)

    return log as WeightCheckLog
  },

  // --------------------------------------------------------------------------
  // LỊCH SỬ CÂN
  // --------------------------------------------------------------------------

  /** Lấy lịch sử cân của batch */
  async getWeightHistory(batchId: string): Promise<WeightCheckLog[]> {
    const { data, error } = await supabase
      .from('weight_check_logs')
      .select('*')
      .eq('batch_id', batchId)
      .order('checked_at', { ascending: false })

    if (error) {
      console.error('getWeightHistory error:', error)
      return []
    }

    return (data || []) as WeightCheckLog[]
  },

  // --------------------------------------------------------------------------
  // TÍNH HAO HỤT
  // --------------------------------------------------------------------------

  /** Tính hao hụt chi tiết cho 1 batch */
  async calculateWeightLoss(batchId: string): Promise<{
    initial_weight: number
    current_weight: number
    total_loss_kg: number
    loss_percent: number
    days_in_storage: number
    avg_loss_per_day: number
  } | null> {
    const { data: batch } = await supabase
      .from('stock_batches')
      .select('initial_weight, current_weight, weight_loss, received_date, storage_days')
      .eq('id', batchId)
      .single()

    if (!batch || !batch.initial_weight) return null

    const initialWeight = batch.initial_weight
    const currentWeight = batch.current_weight || initialWeight
    const totalLoss = Math.round((initialWeight - currentWeight) * 100) / 100
    const lossPercent = initialWeight > 0
      ? Math.round((totalLoss / initialWeight) * 10000) / 100
      : 0

    // Tính số ngày lưu kho
    const receivedDate = new Date(batch.received_date)
    const today = new Date()
    const daysInStorage = Math.floor(
      (today.getTime() - receivedDate.getTime()) / (1000 * 60 * 60 * 24)
    )

    const avgLossPerDay = daysInStorage > 0
      ? Math.round((totalLoss / daysInStorage) * 1000) / 1000
      : 0

    return {
      initial_weight: initialWeight,
      current_weight: currentWeight,
      total_loss_kg: totalLoss,
      loss_percent: lossPercent,
      days_in_storage: daysInStorage,
      avg_loss_per_day: avgLossPerDay,
    }
  },

  // --------------------------------------------------------------------------
  // CẢNH BÁO HAO HỤT
  // --------------------------------------------------------------------------

  /** Lấy batches có hao hụt vượt ngưỡng */
  async getBatchesWithExcessiveLoss(
    thresholdPercent: number = 5
  ): Promise<StockBatch[]> {
    // Query active batches có initial_weight > 0
    const { data, error } = await supabase
      .from('stock_batches')
      .select(`
        *,
        material:materials(id, sku, name, type),
        warehouse:warehouses(id, code, name)
      `)
      .eq('status', 'active')
      .not('initial_weight', 'is', null)
      .gt('initial_weight', 0)

    if (error) {
      console.error('getBatchesWithExcessiveLoss error:', error)
      return []
    }

    // Filter: weight_loss / initial_weight * 100 > threshold
    return (data || [])
      .filter((b: any) => {
        if (!b.initial_weight || b.initial_weight <= 0) return false
        const lossPercent = ((b.weight_loss || 0) / b.initial_weight) * 100
        return lossPercent > thresholdPercent
      }) as StockBatch[]
  },

  // --------------------------------------------------------------------------
  // CẬP NHẬT STORAGE DAYS
  // --------------------------------------------------------------------------

  /**
   * Cập nhật storage_days cho tất cả batches active
   * Nên gọi định kỳ (mỗi ngày 1 lần)
   */
  async updateStorageDays(): Promise<number> {
    // Lấy tất cả active batches
    const { data: batches, error } = await supabase
      .from('stock_batches')
      .select('id, received_date')
      .eq('status', 'active')

    if (error || !batches) {
      console.error('updateStorageDays error:', error)
      return 0
    }

    const today = new Date()
    let updatedCount = 0

    for (const batch of batches) {
      const receivedDate = new Date(batch.received_date)
      const days = Math.floor(
        (today.getTime() - receivedDate.getTime()) / (1000 * 60 * 60 * 24)
      )

      const { error: updateError } = await supabase
        .from('stock_batches')
        .update({ storage_days: days })
        .eq('id', batch.id)

      if (!updateError) updatedCount++
    }

    return updatedCount
  },

  // --------------------------------------------------------------------------
  // LƯU KHO QUÁ LÂU
  // --------------------------------------------------------------------------

  /** Lấy batches lưu kho quá lâu */
  async getBatchesExceedingStorageDuration(
    maxDays: number = 60
  ): Promise<StockBatch[]> {
    const { data, error } = await supabase
      .from('stock_batches')
      .select(`
        *,
        material:materials(id, sku, name, type),
        warehouse:warehouses(id, code, name)
      `)
      .eq('status', 'active')
      .gt('storage_days', maxDays)
      .order('storage_days', { ascending: false })

    if (error) {
      console.error('getBatchesExceedingStorageDuration error:', error)
      return []
    }

    return (data || []) as StockBatch[]
  },
}

export default weightTrackingService
