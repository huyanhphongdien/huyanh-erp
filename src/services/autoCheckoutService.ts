// ============================================================================
// AUTO-CHECKOUT CLIENT FALLBACK
// File: src/services/autoCheckoutService.ts
// ============================================================================
//
// DÙNG KHI: Supabase plan không hỗ trợ pg_cron
//
// CÁCH HOẠT ĐỘNG:
//   ① Khi user mở app (checkAuth) → gọi tryAutoCheckout()
//   ② Khi checkIn() gặp open record → gọi tryAutoCheckoutForEmployee()
//   ③ Edge Function (optional) chạy cron external
//
// LOGIC: Giống DB function — tìm record mở, quá 2h sau ca → tự đóng
// ============================================================================

import { supabase } from '../lib/supabase'

// ============================================================================
// HELPERS
// ============================================================================

/** Chuyển time string "HH:MM:SS" thành phút */
function timeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number)
  return h * 60 + (m || 0)
}

/** Tính shift_end datetime dựa trên date + shift */
function getShiftEndDatetime(
  date: string,
  endTime: string,
  crossesMidnight: boolean
): Date {
  const dt = new Date(date + 'T00:00:00')
  const endMin = timeToMinutes(endTime)
  dt.setMinutes(endMin)
  if (crossesMidnight) {
    dt.setDate(dt.getDate() + 1)
  }
  return dt
}

// ============================================================================
// INTERFACES
// ============================================================================

interface OpenRecord {
  id: string
  employee_id: string
  date: string
  check_in_time: string
  shift_id: string | null
  break_minutes: number
  status: string
  shift?: {
    end_time: string
    start_time: string
    crosses_midnight: boolean
    standard_hours: number
    break_minutes: number
    early_leave_threshold_minutes: number
  } | null
}

interface AutoCheckoutResult {
  closed: number
  records: { id: string; employee_id: string; date: string }[]
}

// ============================================================================
// SERVICE
// ============================================================================

export const autoCheckoutService = {

  /**
   * Tìm và đóng TẤT CẢ attendance records mở quá hạn
   * Gọi khi: app init, admin dashboard, hoặc cron job
   */
  async checkAndCloseExpired(): Promise<AutoCheckoutResult> {
    const now = new Date()
    const result: AutoCheckoutResult = { closed: 0, records: [] }

    // ① Lấy tất cả records đang mở
    const { data: openRecords, error } = await supabase
      .from('attendance')
      .select(`
        id, employee_id, date, check_in_time, shift_id, break_minutes, status,
        shift:shifts!attendance_shift_id_fkey(
          end_time, start_time, crosses_midnight, 
          standard_hours, break_minutes, early_leave_threshold_minutes
        )
      `)
      .is('check_out_time', null)
      .not('check_in_time', 'is', null)
      .eq('auto_checkout', false)

    if (error || !openRecords || openRecords.length === 0) {
      return result
    }

    // ② Xử lý từng record
    for (const raw of openRecords) {
      const rec: OpenRecord = {
        ...raw,
        shift: Array.isArray(raw.shift) ? raw.shift[0] : raw.shift,
      }

      try {
        const closed = await this._tryCloseRecord(rec, now)
        if (closed) {
          result.closed++
          result.records.push({ 
            id: rec.id, 
            employee_id: rec.employee_id, 
            date: rec.date 
          })
        }
      } catch (err) {
        console.error(`[AutoCheckout] Error closing record ${rec.id}:`, err)
      }
    }

    if (result.closed > 0) {
      console.log(`[AutoCheckout] Đã đóng ${result.closed} records`)
    }

    return result
  },

  /**
   * Đóng record mở cho 1 nhân viên cụ thể
   * Gọi khi: checkIn() gặp open record quá hạn (thay vì throw error)
   */
  async tryAutoCheckoutForEmployee(employeeId: string): Promise<boolean> {
    const now = new Date()
    const today = now.toISOString().split('T')[0]
    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayStr = yesterday.toISOString().split('T')[0]

    const { data: openRecords, error } = await supabase
      .from('attendance')
      .select(`
        id, employee_id, date, check_in_time, shift_id, break_minutes, status,
        shift:shifts!attendance_shift_id_fkey(
          end_time, start_time, crosses_midnight,
          standard_hours, break_minutes, early_leave_threshold_minutes
        )
      `)
      .eq('employee_id', employeeId)
      .is('check_out_time', null)
      .not('check_in_time', 'is', null)
      .in('date', [today, yesterdayStr])
      .order('check_in_time', { ascending: false })
      .limit(1)

    if (error || !openRecords || openRecords.length === 0) {
      return false
    }

    const raw = openRecords[0]
    const rec: OpenRecord = {
      ...raw,
      shift: Array.isArray(raw.shift) ? raw.shift[0] : raw.shift,
    }

    return this._tryCloseRecord(rec, now)
  },

  /**
   * Internal: Đóng 1 record nếu đủ điều kiện
   * Returns true nếu đã đóng, false nếu chưa đủ điều kiện
   */
  async _tryCloseRecord(rec: OpenRecord, now: Date): Promise<boolean> {
    // ── Tính shift_end datetime ──
    let shiftEndDt: Date

    if (rec.shift?.end_time) {
      shiftEndDt = getShiftEndDatetime(
        rec.date,
        rec.shift.end_time,
        rec.shift.crosses_midnight || false
      )
    } else {
      // Fallback: 17:00 cùng ngày
      shiftEndDt = new Date(rec.date + 'T17:00:00')
    }

    // ── Kiểm tra: phải quá 2h sau kết thúc ca ──
    const bufferMs = 2 * 60 * 60 * 1000 // 2 giờ
    if (now.getTime() <= shiftEndDt.getTime() + bufferMs) {
      return false // Chưa đủ điều kiện
    }

    // ── Tính toán giờ làm ──
    const checkInDt = new Date(rec.check_in_time)
    const breakMins = rec.shift?.break_minutes ?? rec.break_minutes ?? 60
    const stdMins = (rec.shift?.standard_hours ?? 8) * 60
    const earlyThreshold = rec.shift?.early_leave_threshold_minutes ?? 15

    // working = (shift_end - check_in) - break, cap tại standard_hours
    let workingMinutes = Math.max(0,
      Math.floor((shiftEndDt.getTime() - checkInDt.getTime()) / (1000 * 60)) - breakMins
    )
    workingMinutes = Math.min(workingMinutes, stdMins)

    // early_leave
    let earlyLeaveMinutes = 0
    let newStatus = rec.status

    if (workingMinutes < stdMins) {
      const shortage = stdMins - workingMinutes
      if (shortage > earlyThreshold) {
        earlyLeaveMinutes = shortage
        if (rec.status !== 'late') {
          newStatus = 'early_leave'
        }
      }
    }

    // ── Update record ──
    const { error } = await supabase
      .from('attendance')
      .update({
        check_out_time: shiftEndDt.toISOString(),
        auto_checkout: true,
        working_minutes: workingMinutes,
        overtime_minutes: 0,
        early_leave_minutes: earlyLeaveMinutes,
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', rec.id)

    if (error) {
      console.error(`[AutoCheckout] Failed to close ${rec.id}:`, error)
      return false
    }

    console.log(
      `[AutoCheckout] Đóng record ${rec.id} — NV: ${rec.employee_id}, ` +
      `ngày: ${rec.date}, checkout: ${shiftEndDt.toISOString()}`
    )
    return true
  },
}

export default autoCheckoutService