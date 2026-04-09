// ============================================================================
// ATTENDANCE EDIT SERVICE
// File: src/services/attendanceEditService.ts
// ============================================================================
// Sửa chấm công với phân quyền + audit log
// Quyền: Admin + Trưởng phòng (NV trong phòng) + HR
// ============================================================================

import { supabase } from '../lib/supabase'

// ============================================================================
// TYPES
// ============================================================================

export interface AttendanceEditData {
  // Sửa nhanh (ký hiệu/ca)
  shiftId?: string | null
  status?: string

  // Sửa chi tiết (giờ)
  checkInTime?: string | null   // ISO string
  checkOutTime?: string | null  // ISO string

  // Ghi chú
  reason?: string
}

export interface AttendanceEditResult {
  success: boolean
  error?: string
  record?: any
}

// Shift code → default status mapping
const SHIFT_STATUS: Record<string, string> = {
  'SHORT_1': 'present',
  'SHORT_2': 'present',
  'SHORT_3': 'present',
  'LONG_DAY': 'present',
  'LONG_NIGHT': 'present',
  'ADMIN_PROD': 'present',
  'ADMIN_OFFICE': 'present',
}

// ============================================================================
// PERMISSION CHECK
// ============================================================================

interface PermissionResult {
  allowed: boolean
  reason?: string
}

async function checkEditPermission(
  editorEmployeeId: string,
  targetEmployeeId: string
): Promise<PermissionResult> {
  // Kiểm tra admin từ auth session
  const { data: { user: authUser } } = await supabase.auth.getUser()
  const authRole = authUser?.user_metadata?.role
  const authEmail = authUser?.email?.toLowerCase()

  // Admin role hoặc email đặc biệt → sửa được tất cả
  if (authRole === 'admin' || authEmail === 'minhld@huyanhrubber.com') {
    return { allowed: true }
  }

  // Lấy thông tin editor
  const { data: editor } = await supabase
    .from('employees')
    .select(`
      id, department_id, position_id,
      position:positions!employees_position_id_fkey(id, name, level)
    `)
    .eq('id', editorEmployeeId)
    .single()

  if (!editor) return { allowed: false, reason: 'Không tìm thấy nhân viên' }

  const position = Array.isArray(editor.position) ? editor.position[0] : editor.position
  const level = position?.level || 7

  // Admin (level 1-2) → sửa được tất cả
  if (level <= 2) return { allowed: true }

  // HR department → sửa được tất cả
  const { data: dept } = await supabase
    .from('departments')
    .select('code')
    .eq('id', editor.department_id)
    .single()

  if (dept?.code === 'HAP-HCTH') return { allowed: true } // Phòng HC-TH = HR

  // Trưởng/Phó phòng (level 3-5) → sửa NV trong phòng mình
  if (level <= 5) {
    const { data: target } = await supabase
      .from('employees')
      .select('department_id')
      .eq('id', targetEmployeeId)
      .single()

    if (target?.department_id === editor.department_id) {
      return { allowed: true }
    }
    return { allowed: false, reason: 'Bạn chỉ được sửa chấm công nhân viên trong phòng mình' }
  }

  return { allowed: false, reason: 'Bạn không có quyền sửa chấm công' }
}

// ============================================================================
// SERVICE
// ============================================================================

export const attendanceEditService = {

  /**
   * Kiểm tra quyền sửa
   */
  async canEdit(editorEmployeeId: string, targetEmployeeId: string): Promise<boolean> {
    const result = await checkEditPermission(editorEmployeeId, targetEmployeeId)
    return result.allowed
  },

  /**
   * Sửa nhanh — thay đổi ca/ký hiệu
   */
  async quickEdit(
    attendanceId: string,
    editorEmployeeId: string,
    newShiftId: string | null,
    newStatus: string,
    reason?: string
  ): Promise<AttendanceEditResult> {
    try {
      // ① Lấy record hiện tại
      const { data: current, error: fetchErr } = await supabase
        .from('attendance')
        .select('*, shift:shifts!attendance_shift_id_fkey(id, code, name, standard_hours, break_minutes)')
        .eq('id', attendanceId)
        .single()

      if (fetchErr || !current) return { success: false, error: 'Không tìm thấy bản ghi' }

      // ② Kiểm tra quyền
      const perm = await checkEditPermission(editorEmployeeId, current.employee_id)
      if (!perm.allowed) return { success: false, error: perm.reason }

      // ③ Lấy shift mới (nếu có)
      let newShift: any = null
      if (newShiftId) {
        const { data } = await supabase
          .from('shifts')
          .select('id, code, name, standard_hours, break_minutes, crosses_midnight, start_time, end_time')
          .eq('id', newShiftId)
          .single()
        newShift = data
      }

      // ④ Tính lại working_minutes nếu có check_in/out + shift mới
      let workingMinutes = current.working_minutes
      let overtimeMinutes = current.overtime_minutes
      if (current.check_in_time && current.check_out_time && newShift) {
        const checkIn = new Date(current.check_in_time)
        const checkOut = new Date(current.check_out_time)
        const elapsed = Math.max(0, Math.floor((checkOut.getTime() - checkIn.getTime()) / (1000 * 60)))
        workingMinutes = Math.max(0, elapsed - (newShift.break_minutes || 60))
      }

      // ⑤ Log old values
      const oldValues = {
        shift_id: current.shift_id,
        shift_code: Array.isArray(current.shift) ? current.shift[0]?.code : current.shift?.code,
        status: current.status,
        working_minutes: current.working_minutes,
      }
      const newValues = {
        shift_id: newShiftId,
        shift_code: newShift?.code || null,
        status: newStatus,
        working_minutes: workingMinutes,
      }

      // ⑥ Update attendance
      const { data: updated, error: updateErr } = await supabase
        .from('attendance')
        .update({
          shift_id: newShiftId,
          status: newStatus,
          working_minutes: workingMinutes,
          updated_at: new Date().toISOString(),
        })
        .eq('id', attendanceId)
        .select()
        .single()

      if (updateErr) return { success: false, error: updateErr.message }

      // ⑦ Insert edit log
      await supabase.from('attendance_edit_logs').insert({
        attendance_id: attendanceId,
        edited_by: editorEmployeeId,
        old_values: oldValues,
        new_values: newValues,
        reason: reason || 'Sửa nhanh ca/trạng thái',
        edit_type: 'shift_change',
      })

      return { success: true, record: updated }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  },

  /**
   * Sửa chi tiết — thay đổi giờ check-in/check-out
   */
  async detailEdit(
    attendanceId: string,
    editorEmployeeId: string,
    data: AttendanceEditData,
    reason?: string
  ): Promise<AttendanceEditResult> {
    try {
      // ① Lấy record hiện tại
      const { data: current, error: fetchErr } = await supabase
        .from('attendance')
        .select('*, shift:shifts!attendance_shift_id_fkey(id, code, name, standard_hours, break_minutes, early_leave_threshold_minutes)')
        .eq('id', attendanceId)
        .single()

      if (fetchErr || !current) return { success: false, error: 'Không tìm thấy bản ghi' }

      // ② Kiểm tra quyền
      const perm = await checkEditPermission(editorEmployeeId, current.employee_id)
      if (!perm.allowed) return { success: false, error: perm.reason }

      // ③ Build update object
      const updates: Record<string, any> = { updated_at: new Date().toISOString() }
      const oldValues: Record<string, any> = {}
      const newValues: Record<string, any> = {}

      // Shift
      if (data.shiftId !== undefined) {
        oldValues.shift_id = current.shift_id
        newValues.shift_id = data.shiftId
        updates.shift_id = data.shiftId
      }

      // Status
      if (data.status) {
        oldValues.status = current.status
        newValues.status = data.status
        updates.status = data.status
      }

      // Check-in time
      if (data.checkInTime !== undefined) {
        oldValues.check_in_time = current.check_in_time
        newValues.check_in_time = data.checkInTime
        updates.check_in_time = data.checkInTime
      }

      // Check-out time
      if (data.checkOutTime !== undefined) {
        oldValues.check_out_time = current.check_out_time
        newValues.check_out_time = data.checkOutTime
        updates.check_out_time = data.checkOutTime
      }

      // ④ Tính lại working_minutes
      const checkIn = data.checkInTime !== undefined ? data.checkInTime : current.check_in_time
      const checkOut = data.checkOutTime !== undefined ? data.checkOutTime : current.check_out_time

      if (checkIn && checkOut) {
        const shift = Array.isArray(current.shift) ? current.shift[0] : current.shift
        const breakMins = shift?.break_minutes || 60
        const stdMins = (shift?.standard_hours || 8) * 60
        const earlyThreshold = shift?.early_leave_threshold_minutes || 15

        const elapsed = Math.max(0, Math.floor(
          (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / (1000 * 60)
        ))
        const working = Math.max(0, elapsed - breakMins)

        oldValues.working_minutes = current.working_minutes
        newValues.working_minutes = working
        updates.working_minutes = working

        // Early leave
        if (working < stdMins) {
          const shortage = stdMins - working
          if (shortage > earlyThreshold) {
            updates.early_leave_minutes = shortage
            if (!data.status) {
              if (current.late_minutes > 0) {
                updates.status = 'late_and_early'
              } else {
                updates.status = 'early_leave'
              }
            }
          } else {
            updates.early_leave_minutes = 0
          }
        } else {
          updates.early_leave_minutes = 0
        }

        // OT = 0 khi sửa tay (cần phiếu OT riêng)
        updates.overtime_minutes = 0
      }

      // ⑤ Update
      const { data: updated, error: updateErr } = await supabase
        .from('attendance')
        .update(updates)
        .eq('id', attendanceId)
        .select()
        .single()

      if (updateErr) return { success: false, error: updateErr.message }

      // ⑥ Log
      await supabase.from('attendance_edit_logs').insert({
        attendance_id: attendanceId,
        edited_by: editorEmployeeId,
        old_values: oldValues,
        new_values: newValues,
        reason: reason || 'Sửa chi tiết giờ',
        edit_type: 'time_correction',
      })

      return { success: true, record: updated }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  },

  /**
   * Tạo record mới (cho ngày chưa có attendance)
   */
  async createRecord(
    employeeId: string,
    date: string,
    shiftId: string,
    checkInTime: string,
    checkOutTime: string | null,
    editorEmployeeId: string,
    reason?: string
  ): Promise<AttendanceEditResult> {
    try {
      // Kiểm tra quyền
      const perm = await checkEditPermission(editorEmployeeId, employeeId)
      if (!perm.allowed) return { success: false, error: perm.reason }

      // Lấy shift info
      const { data: shift } = await supabase
        .from('shifts')
        .select('*')
        .eq('id', shiftId)
        .single()

      // Tính working
      let workingMinutes = 0
      if (checkInTime && checkOutTime) {
        const elapsed = Math.max(0, Math.floor(
          (new Date(checkOutTime).getTime() - new Date(checkInTime).getTime()) / (1000 * 60)
        ))
        workingMinutes = Math.max(0, elapsed - (shift?.break_minutes || 60))
      }

      // Insert
      const { data: created, error } = await supabase
        .from('attendance')
        .insert({
          employee_id: employeeId,
          date,
          shift_id: shiftId,
          shift_date: date,
          check_in_time: checkInTime,
          check_out_time: checkOutTime,
          working_minutes: workingMinutes,
          overtime_minutes: 0,
          late_minutes: 0,
          early_leave_minutes: 0,
          break_minutes: shift?.break_minutes || 60,
          status: 'present',
          auto_checkout: false,
          is_gps_verified: false,
        })
        .select()
        .single()

      if (error) return { success: false, error: error.message }

      // Log
      await supabase.from('attendance_edit_logs').insert({
        attendance_id: created.id,
        edited_by: editorEmployeeId,
        old_values: {},
        new_values: { created: true, date, shift_id: shiftId },
        reason: reason || 'Tạo bản ghi chấm công thủ công',
        edit_type: 'manual',
      })

      return { success: true, record: created }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  },

  /**
   * Sửa nhanh ký hiệu — xóa hết record cũ trong ngày, tạo record mới theo symbol
   * - Lấy giờ thực từ shifts table (không hardcode 08:00→17:00)
   * - Xử lý crosses_midnight cho ca đêm
   * - Ghi audit log
   * - Permission check
   *
   * symbol: 'HC' | 'S' | 'C2' | 'Đ' | 'S_dài' | 'Đ_dài' | 'CT' | 'P' | 'X'
   */
  async setDaySymbol(
    employeeId: string,
    date: string,
    symbol: string,
    editorEmployeeId: string,
    reason?: string,
  ): Promise<AttendanceEditResult> {
    try {
      // ① Permission
      const perm = await checkEditPermission(editorEmployeeId, employeeId)
      if (!perm.allowed) return { success: false, error: perm.reason }

      // ② Symbol → shift code
      const SYMBOL_MAP: Record<string, { shiftCode: string; status: string }> = {
        'HC':    { shiftCode: 'ADMIN_PROD', status: 'present' },
        'S':     { shiftCode: 'SHORT_1',    status: 'present' },
        'C2':    { shiftCode: 'SHORT_2',    status: 'present' },
        'Đ':     { shiftCode: 'SHORT_3',    status: 'present' },
        'S_dài': { shiftCode: 'LONG_DAY',   status: 'present' },
        'Đ_dài': { shiftCode: 'LONG_NIGHT', status: 'present' },
        'CT':    { shiftCode: '',           status: 'business_trip' },
        'P':     { shiftCode: '',           status: 'leave' },
        'X':     { shiftCode: '',           status: 'absent' },
      }
      const mapping = SYMBOL_MAP[symbol]
      if (!mapping) return { success: false, error: 'Ký hiệu không hợp lệ: ' + symbol }

      // ③ Snapshot old records (for log + idempotency)
      const { data: oldRecs } = await supabase
        .from('attendance')
        .select('id, shift_id, status, work_units, shift:shifts!attendance_shift_id_fkey(code)')
        .eq('employee_id', employeeId)
        .eq('date', date)
      const oldValues = {
        records_count: oldRecs?.length || 0,
        shift_codes: (oldRecs || [])
          .map((r: any) => Array.isArray(r.shift) ? r.shift[0]?.code : r.shift?.code)
          .filter(Boolean),
        statuses: (oldRecs || []).map((r: any) => r.status),
      }

      // ④ Delete all existing records for this day
      const { error: delErr } = await supabase
        .from('attendance')
        .delete()
        .eq('employee_id', employeeId)
        .eq('date', date)
      if (delErr) return { success: false, error: delErr.message }

      // ⑤ X = Vắng → no record (just deletion)
      if (symbol === 'X') {
        // Note: cannot log to attendance_edit_logs without an attendance_id FK.
        // Deletion is recorded by the absence of a record going forward.
        return { success: true, record: null }
      }

      // ⑥ Look up shift (if any)
      let shiftData: any = null
      if (mapping.shiftCode) {
        const { data: s } = await supabase
          .from('shifts')
          .select('id, code, name, start_time, end_time, work_units, standard_hours, break_minutes, crosses_midnight')
          .eq('code', mapping.shiftCode)
          .single()
        shiftData = s
        if (!shiftData) return { success: false, error: `Không tìm thấy ca: ${mapping.shiftCode}` }
      }

      // ⑦ Build check_in / check_out from shift's start_time / end_time
      let checkInISO: string
      let checkOutISO: string
      let workingMinutes = 0
      let workUnits = 1.0

      if (shiftData) {
        const startTime = shiftData.start_time?.substring(0, 5) || '08:00'
        const endTime = shiftData.end_time?.substring(0, 5) || '17:00'
        workUnits = Number(shiftData.work_units) || 1.0

        checkInISO = `${date}T${startTime}:00+07:00`

        if (shiftData.crosses_midnight && endTime < startTime) {
          // End time on next day
          const nextDay = new Date(date + 'T00:00:00+07:00')
          nextDay.setDate(nextDay.getDate() + 1)
          const nextDateStr = nextDay.toISOString().split('T')[0]
          checkOutISO = `${nextDateStr}T${endTime}:00+07:00`
        } else {
          checkOutISO = `${date}T${endTime}:00+07:00`
        }

        const elapsed = Math.max(0, Math.floor(
          (new Date(checkOutISO).getTime() - new Date(checkInISO).getTime()) / (1000 * 60)
        ))
        workingMinutes = Math.max(0, elapsed - (shiftData.break_minutes || 60))
      } else {
        // CT (business trip) or P (leave) — no shift, mark a default 8h window
        checkInISO = `${date}T08:00:00+07:00`
        checkOutISO = `${date}T17:00:00+07:00`
        workingMinutes = 480
        workUnits = mapping.status === 'business_trip' ? 1.0 : 0
      }

      // ⑧ Insert new record
      const { data: created, error: insErr } = await supabase
        .from('attendance')
        .insert({
          employee_id: employeeId,
          date,
          shift_date: date,
          shift_id: shiftData?.id || null,
          check_in_time: checkInISO,
          check_out_time: checkOutISO,
          working_minutes: workingMinutes,
          overtime_minutes: 0,
          late_minutes: 0,
          early_leave_minutes: 0,
          break_minutes: shiftData?.break_minutes || 60,
          work_units: workUnits,
          status: mapping.status,
          auto_checkout: false,
          is_gps_verified: false,
        })
        .select()
        .single()

      if (insErr) return { success: false, error: insErr.message }

      // ⑨ Audit log
      await supabase.from('attendance_edit_logs').insert({
        attendance_id: created.id,
        edited_by: editorEmployeeId,
        old_values: oldValues,
        new_values: {
          symbol,
          shift_code: shiftData?.code || null,
          status: mapping.status,
          work_units: workUnits,
          check_in: checkInISO,
          check_out: checkOutISO,
        },
        reason: reason || `Sửa nhanh: đặt ký hiệu ${symbol}`,
        edit_type: 'shift_change',
      })

      return { success: true, record: created }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  },

  /**
   * Lấy lịch sử sửa của 1 attendance record
   */
  async getEditHistory(attendanceId: string) {
    const { data, error } = await supabase
      .from('attendance_edit_logs')
      .select(`
        id, edited_at, old_values, new_values, reason, edit_type,
        editor:employees!attendance_edit_logs_edited_by_fkey(id, full_name, code)
      `)
      .eq('attendance_id', attendanceId)
      .order('edited_at', { ascending: false })

    if (error) return []
    return (data || []).map(d => ({
      ...d,
      editor: Array.isArray(d.editor) ? d.editor[0] : d.editor,
    }))
  },
}

export default attendanceEditService