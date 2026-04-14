// ============================================================================
// AUTO-CHECKOUT SERVICE V6 — Client Fallback (Simplified)
// File: src/services/autoCheckoutService.ts
// ============================================================================
//
// V6: Đơn giản hóa — chỉ 1 vai trò:
//   → Khi checkIn() gặp open record quá hạn, đóng nó tại client
//   → KHÔNG chạy batch scan nữa (để pg_cron lo)
//
// LOGIC ĐỒNG BỘ VỚI DB function auto_checkout_v6():
//   - Buffer: 1 TIẾNG sau ca kết thúc
//   - Checkout time = shift_end (không phải now)
//   - Working = (shift_end - check_in) - break, cap tại standard_hours
//   - OT = 0 (auto checkout không tính OT)
//   - Timezone: tính theo VN (+07:00)
// ============================================================================

import { supabase } from '../lib/supabase'

// ============================================================================
// CONSTANTS
// ============================================================================

/** Buffer mặc định: 1 tiếng sau ca kết thúc mới auto checkout */
const AUTO_CHECKOUT_BUFFER_MS = 1 * 60 * 60 * 1000

/** Buffer ca qua đêm: 3 tiếng sau ca kết thúc (cho phép checkout tới 09:00 cho ca 18-06) */
const AUTO_CHECKOUT_NIGHT_BUFFER_MS = 3 * 60 * 60 * 1000

/** Vietnam timezone offset: +7 hours */
const VN_OFFSET_MS = 7 * 60 * 60 * 1000

// ============================================================================
// HELPERS
// ============================================================================

/** Chuyển "HH:MM:SS" → phút trong ngày */
function timeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number)
  return h * 60 + (m || 0)
}

/** Cộng/trừ ngày theo pure string — không phụ thuộc TZ runtime */
function addDaysToDateStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d + days))
  return date.toISOString().split('T')[0]
}

/** Tạo Date object cho shift_end theo timezone VN */
function getShiftEndVN(date: string, endTime: string, crossesMidnight: boolean): Date {
  // Tạo date ở timezone VN
  // date = "2026-03-10", endTime = "06:00:00"
  const endMin = timeToMinutes(endTime)
  const endH = Math.floor(endMin / 60)
  const endM = endMin % 60

  // Tạo timestamp string VN: "2026-03-10T06:00:00+07:00"
  const endDate = crossesMidnight ? addDaysToDateStr(date, 1) : date

  const vnTimeStr = `${endDate}T${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}:00+07:00`
  return new Date(vnTimeStr)
}

/** Lấy giờ VN hiện tại */
function getNowVN(): Date {
  return new Date() // Date.now() luôn là UTC internally, so sánh OK
}

// ============================================================================
// INTERFACES
// ============================================================================

interface OpenRecord {
  id: string
  employee_id: string
  date: string
  check_in_time: string
  status: string
  late_minutes: number
  break_minutes: number
  shift?: {
    code: string
    name: string
    end_time: string
    start_time: string
    crosses_midnight: boolean
    standard_hours: number
    break_minutes: number
    early_leave_threshold_minutes: number
  } | null
}

// ============================================================================
// SERVICE
// ============================================================================

export const autoCheckoutService = {

  /**
   * ★ V6: Thử đóng 1 record mở cho 1 nhân viên
   * Gọi bởi: attendanceService.checkIn() khi gặp open record
   * Returns: true nếu đã đóng, false nếu chưa đủ điều kiện
   */
  async tryCloseForEmployee(employeeId: string): Promise<boolean> {
    const now = getNowVN()
    // ★ V6.2: dùng múi giờ VN, không phụ thuộc TZ runtime
    const today = now.toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' })
    const yesterday = addDaysToDateStr(today, -1)

    // Tìm record đang mở
    const { data, error } = await supabase
      .from('attendance')
      .select(`
        id, employee_id, date, check_in_time, status, late_minutes, break_minutes,
        shift:shifts!attendance_shift_id_fkey(
          code, name, end_time, start_time, crosses_midnight,
          standard_hours, break_minutes, early_leave_threshold_minutes
        )
      `)
      .eq('employee_id', employeeId)
      .is('check_out_time', null)
      .not('check_in_time', 'is', null)
      .in('date', [today, yesterday])
      .order('check_in_time', { ascending: false })
      .limit(1)

    if (error || !data || data.length === 0) return false

    const raw = data[0]
    const rec: OpenRecord = {
      ...raw,
      shift: Array.isArray(raw.shift) ? raw.shift[0] : raw.shift,
    }

    return this._tryClose(rec, now)
  },

  /**
   * Internal: Logic đóng 1 record — ĐỒNG BỘ với DB function auto_checkout_v6()
   */
  async _tryClose(rec: OpenRecord, now: Date): Promise<boolean> {
    // ── Tính shift_end ──
    let shiftEndDt: Date

    if (rec.shift?.end_time) {
      shiftEndDt = getShiftEndVN(
        rec.date,
        rec.shift.end_time,
        rec.shift.crosses_midnight || false
      )
    } else {
      // Fallback: 17:00 VN cùng ngày (ca thường) hoặc 06:00 ngày sau (ca đêm)
      if (rec.shift?.crosses_midnight) {
        shiftEndDt = new Date(addDaysToDateStr(rec.date, 1) + 'T06:00:00+07:00')
      } else {
        shiftEndDt = new Date(rec.date + 'T17:00:00+07:00')
      }
    }

    // ── Kiểm tra buffer: phải quá buffer sau ca ──
    // Ca qua đêm (18h-06h): buffer 3 tiếng → auto-close lúc 09:00
    // Ca thường: buffer 1 tiếng
    const bufferMs = (rec.shift?.crosses_midnight)
      ? AUTO_CHECKOUT_NIGHT_BUFFER_MS
      : AUTO_CHECKOUT_BUFFER_MS

    if (now.getTime() <= shiftEndDt.getTime() + bufferMs) {
      return false // Chưa đủ điều kiện
    }

    // ── Tính working_minutes ──
    const checkInDt = new Date(rec.check_in_time)
    const breakMins = rec.shift?.break_minutes ?? rec.break_minutes ?? 60
    const stdMins = (rec.shift?.standard_hours ?? 8) * 60
    const earlyThreshold = rec.shift?.early_leave_threshold_minutes ?? 15

    // working = (shift_end - check_in) - break
    let workingMinutes = Math.max(0,
      Math.floor((shiftEndDt.getTime() - checkInDt.getTime()) / (1000 * 60)) - breakMins
    )
    // Cap tại standard_hours
    workingMinutes = Math.min(workingMinutes, stdMins)

    // ── Early leave ──
    let earlyLeaveMinutes = 0
    let newStatus = rec.status

    if (workingMinutes < stdMins) {
      const shortage = stdMins - workingMinutes
      if (shortage > earlyThreshold) {
        earlyLeaveMinutes = shortage
        if (rec.status === 'late' || (rec.late_minutes ?? 0) > 0) {
          newStatus = 'late_and_early'
        } else {
          newStatus = 'early_leave'
        }
      }
      // Dưới threshold → không ghi early_leave_minutes, giữ status hiện tại
    }

    // ── Update ──
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
      .is('check_out_time', null) // Race condition guard

    if (error) {
      console.error(`[AutoCheckout V6] Lỗi đóng ${rec.id}:`, error)
      return false
    }

    console.log(
      `[AutoCheckout V6] Đóng ${rec.id} — ca ${rec.shift?.code ?? 'N/A'}, ` +
      `ngày ${rec.date}, checkout=${shiftEndDt.toISOString()}, work=${workingMinutes}p`
    )
    return true
  },
}

export default autoCheckoutService