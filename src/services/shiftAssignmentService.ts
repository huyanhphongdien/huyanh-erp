// ============================================================================
// SHIFT ASSIGNMENT SERVICE - Phân ca cho nhân viên
// File: src/services/shiftAssignmentService.ts
// Huy Anh ERP System - Chấm công V2
// ============================================================================

import { supabase } from '../lib/supabase'

// ============================================================================
// CONSTANTS
// ============================================================================

// Phòng ban nghỉ Chủ nhật (chỉ 2 phòng này)
export const SUNDAY_OFF_DEPT_CODES = ['HAP-KT', 'HAP-RD']

// ============================================================================
// TYPES
// ============================================================================

export interface ShiftAssignment {
  id: string
  employee_id: string
  shift_id: string
  date: string
  assignment_type: 'scheduled' | 'override' | 'swap'
  schedule_batch_id: string | null
  original_shift_id: string | null
  swap_with_employee_id: string | null
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  // Relations
  employee?: {
    id: string
    code: string
    full_name: string
    department_id: string
    department?: { id: string; code: string; name: string }
  }
  shift?: {
    id: string
    code: string
    name: string
    shift_category: string
    start_time: string
    end_time: string
    crosses_midnight: boolean
  }
  original_shift?: {
    id: string
    code: string
    name: string
  }
}

export interface BatchScheduleInput {
  employee_ids: string[]
  date_from: string       // 'YYYY-MM-DD'
  date_to: string
  pattern: PatternItem[]  // Xoay ca pattern
  overwrite_existing: boolean
  created_by: string
  notes?: string
}

export interface PatternItem {
  week_number: number  // 1, 2, 3...
  shift_id: string
}

export interface OverrideInput {
  employee_id: string
  date: string
  new_shift_id: string
  created_by: string
  notes?: string
}

export interface CalendarViewParams {
  department_id?: string
  date_from: string
  date_to: string
}

export interface EmployeeShiftCalendar {
  employee_id: string
  employee_code: string
  employee_name: string
  department_code: string   // ★ THÊM - để xác định nghỉ CN
  department_name: string
  assignments: Record<string, {  // key = 'YYYY-MM-DD'
    id: string
    shift_id: string
    shift_code: string
    shift_name: string
    shift_category: string
    start_time: string
    end_time: string
    assignment_type: string
    is_override: boolean
  } | null>
}

// ============================================================================
// SERVICE
// ============================================================================

export const shiftAssignmentService = {

  // ══════════════════════════════════════════════════════════════════════════
  // QUERY
  // ══════════════════════════════════════════════════════════════════════════

  // ── Lấy ca được phân cho 1 nhân viên tại 1 ngày ──
  async getByEmployeeAndDate(employeeId: string, date: string): Promise<ShiftAssignment | null> {
    const { data, error } = await supabase
      .from('shift_assignments')
      .select(`
        *,
        shift:shifts!shift_assignments_shift_id_fkey(
          id, code, name, shift_category, start_time, end_time, 
          crosses_midnight, standard_hours, break_minutes,
          late_threshold_minutes, early_leave_threshold_minutes
        )
      `)
      .eq('employee_id', employeeId)
      .eq('date', date)
      .maybeSingle()

    if (error) throw error
    return data
  },

  // ── Lấy lịch ca theo khoảng thời gian (cho Calendar View) ──
  async getCalendarView(params: CalendarViewParams): Promise<EmployeeShiftCalendar[]> {
    const { department_id, date_from, date_to } = params

    // Lấy danh sách nhân viên — ★ thêm code cho department
    let empQuery = supabase
      .from('employees')
      .select(`
        id, code, full_name, department_id,
        department:departments!employees_department_id_fkey(id, code, name)
      `)
      .eq('status', 'active')
      .order('full_name')

    if (department_id) {
      empQuery = empQuery.eq('department_id', department_id)
    }

    const { data: employees, error: empError } = await empQuery
    if (empError) throw empError

    if (!employees || employees.length === 0) return []

    // Lấy tất cả assignments trong khoảng
    const employeeIds = employees.map(e => e.id)
    
    const { data: assignments, error: assError } = await supabase
      .from('shift_assignments')
      .select(`
        *,
        shift:shifts!shift_assignments_shift_id_fkey(
          id, code, name, shift_category, start_time, end_time
        )
      `)
      .in('employee_id', employeeIds)
      .gte('date', date_from)
      .lte('date', date_to)
      .order('date')

    if (assError) throw assError

    // Build calendar map
    const assignmentMap = new Map<string, ShiftAssignment[]>()
    ;(assignments || []).forEach(a => {
      const key = a.employee_id
      if (!assignmentMap.has(key)) assignmentMap.set(key, [])
      assignmentMap.get(key)!.push(a)
    })

    // Build result
    return employees.map(emp => {
      const dept = Array.isArray(emp.department) ? emp.department[0] : emp.department
      const empAssignments = assignmentMap.get(emp.id) || []
      
      const dateMap: Record<string, any> = {}
      empAssignments.forEach(a => {
        const shift = Array.isArray(a.shift) ? a.shift[0] : a.shift
        dateMap[a.date] = {
          id: a.id,
          shift_id: a.shift_id,
          shift_code: shift?.code || '',
          shift_name: shift?.name || '',
          shift_category: shift?.shift_category || '',
          start_time: shift?.start_time || '',
          end_time: shift?.end_time || '',
          assignment_type: a.assignment_type,
          is_override: a.assignment_type === 'override' || a.assignment_type === 'swap'
        }
      })

      return {
        employee_id: emp.id,
        employee_code: emp.code,
        employee_name: emp.full_name,
        department_code: dept?.code || '',   // ★ THÊM
        department_name: dept?.name || '',
        assignments: dateMap
      }
    })
  },

  // ── Lấy assignments của 1 nhân viên trong khoảng thời gian ──
  async getByEmployeeRange(
    employeeId: string, 
    dateFrom: string, 
    dateTo: string
  ): Promise<ShiftAssignment[]> {
    const { data, error } = await supabase
      .from('shift_assignments')
      .select(`
        *,
        shift:shifts!shift_assignments_shift_id_fkey(
          id, code, name, shift_category, start_time, end_time, crosses_midnight
        ),
        original_shift:shifts!shift_assignments_original_shift_id_fkey(
          id, code, name
        )
      `)
      .eq('employee_id', employeeId)
      .gte('date', dateFrom)
      .lte('date', dateTo)
      .order('date')

    if (error) throw error
    return data || []
  },

  // ══════════════════════════════════════════════════════════════════════════
  // PHÂN CA HÀNG LOẠT (Batch Schedule)
  // ══════════════════════════════════════════════════════════════════════════

  async batchSchedule(input: BatchScheduleInput): Promise<{
    created: number
    skipped: number
    overwritten: number
  }> {
    const { employee_ids, date_from, date_to, pattern, overwrite_existing, created_by, notes } = input
    
    if (pattern.length === 0) throw new Error('Pattern không được rỗng')
    
    // ★ Query department_code cho từng employee để biết ai nghỉ CN
    const { data: empDepts, error: empDeptError } = await supabase
      .from('employees')
      .select(`
        id,
        department:departments!employees_department_id_fkey(code)
      `)
      .in('id', employee_ids)

    if (empDeptError) throw empDeptError

    // Map employee_id → department_code
    const empDeptMap = new Map<string, string>()
    ;(empDepts || []).forEach(e => {
      const dept = Array.isArray(e.department) ? e.department[0] : e.department
      empDeptMap.set(e.id, dept?.code || '')
    })

    const batchId = crypto.randomUUID()
    const rows: any[] = []
    
    // Generate dates
    const startDate = new Date(date_from)
    const endDate = new Date(date_to)
    
    let currentDate = new Date(startDate)
    while (currentDate <= endDate) {
      const dateStr = currentDate.toISOString().split('T')[0]
      
      // Xác định tuần (ISO week relative to start)
      const diffDays = Math.floor(
        (currentDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
      )
      const weekIndex = Math.floor(diffDays / 7) % pattern.length
      const shiftId = pattern[weekIndex].shift_id

      const dayOfWeek = currentDate.getDay() // 0 = Sunday

      for (const empId of employee_ids) {
        // ★ CHỈ skip Chủ nhật cho phòng Kế Toán (HAP-KT) và R&D (HAP-RD)
        const deptCode = empDeptMap.get(empId) || ''
        const isSundayOff = dayOfWeek === 0 && SUNDAY_OFF_DEPT_CODES.includes(deptCode)

        if (!isSundayOff) {
          rows.push({
            employee_id: empId,
            shift_id: shiftId,
            date: dateStr,
            assignment_type: 'scheduled',
            schedule_batch_id: batchId,
            created_by,
            notes: notes || null
          })
        }
      }

      currentDate.setDate(currentDate.getDate() + 1)
    }

    if (rows.length === 0) {
      return { created: 0, skipped: 0, overwritten: 0 }
    }

    let skipped = 0
    let overwritten = 0

    if (overwrite_existing) {
      // Xóa assignments cũ trong khoảng cho các employees
      const { data: existing } = await supabase
        .from('shift_assignments')
        .select('id')
        .in('employee_id', employee_ids)
        .gte('date', date_from)
        .lte('date', date_to)

      overwritten = existing?.length || 0

      if (overwritten > 0) {
        const existingIds = (existing || []).map(e => e.id)
        // Xóa từng batch 100
        for (let i = 0; i < existingIds.length; i += 100) {
          const batch = existingIds.slice(i, i + 100)
          await supabase
            .from('shift_assignments')
            .delete()
            .in('id', batch)
        }
      }

      // Insert tất cả
      for (let i = 0; i < rows.length; i += 500) {
        const batch = rows.slice(i, i + 500)
        const { error } = await supabase
          .from('shift_assignments')
          .insert(batch)
        if (error) throw error
      }

      return { created: rows.length, skipped: 0, overwritten }
    } else {
      // Kiểm tra existing, chỉ insert chưa có
      const dates = [...new Set(rows.map(r => r.date))]
      
      const { data: existing } = await supabase
        .from('shift_assignments')
        .select('employee_id, date')
        .in('employee_id', employee_ids)
        .in('date', dates)

      const existingSet = new Set(
        (existing || []).map(e => `${e.employee_id}|${e.date}`)
      )

      const newRows = rows.filter(r => !existingSet.has(`${r.employee_id}|${r.date}`))
      skipped = rows.length - newRows.length

      if (newRows.length > 0) {
        for (let i = 0; i < newRows.length; i += 500) {
          const batch = newRows.slice(i, i + 500)
          const { error } = await supabase
            .from('shift_assignments')
            .insert(batch)
          if (error) throw error
        }
      }

      return { created: newRows.length, skipped, overwritten: 0 }
    }
  },

  // ══════════════════════════════════════════════════════════════════════════
  // THAY ĐỔI ĐỘT XUẤT (Override)
  // ══════════════════════════════════════════════════════════════════════════

  async overrideShift(input: OverrideInput): Promise<ShiftAssignment> {
    const { employee_id, date, new_shift_id, created_by, notes } = input

    // Kiểm tra có assignment cũ không
    const existing = await this.getByEmployeeAndDate(employee_id, date)

    if (existing) {
      // Update existing → override
      const { data, error } = await supabase
        .from('shift_assignments')
        .update({
          shift_id: new_shift_id,
          assignment_type: 'override',
          original_shift_id: existing.shift_id,  // Lưu ca gốc
          notes: notes || `Đổi ca từ ${existing.shift?.name || 'N/A'}`,
          created_by,
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id)
        .select(`
          *,
          shift:shifts!shift_assignments_shift_id_fkey(id, code, name)
        `)
        .single()

      if (error) throw error
      return data
    } else {
      // Tạo mới dạng override
      const { data, error } = await supabase
        .from('shift_assignments')
        .insert({
          employee_id,
          shift_id: new_shift_id,
          date,
          assignment_type: 'override',
          notes,
          created_by
        })
        .select(`
          *,
          shift:shifts!shift_assignments_shift_id_fkey(id, code, name)
        `)
        .single()

      if (error) throw error
      return data
    }
  },

  // ══════════════════════════════════════════════════════════════════════════
  // XÓA / QUẢN LÝ
  // ══════════════════════════════════════════════════════════════════════════

  // ── Xóa 1 assignment ──
  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('shift_assignments')
      .delete()
      .eq('id', id)

    if (error) throw error
  },

  // ── Xóa tất cả assignments trong 1 batch ──
  async deleteBatch(batchId: string): Promise<number> {
    const { data, error } = await supabase
      .from('shift_assignments')
      .delete()
      .eq('schedule_batch_id', batchId)
      .select('id')

    if (error) throw error
    return data?.length || 0
  },

  // ── Xóa assignments của 1 nhân viên trong khoảng thời gian ──
  async deleteRange(
    employeeId: string, 
    dateFrom: string, 
    dateTo: string
  ): Promise<number> {
    const { data, error } = await supabase
      .from('shift_assignments')
      .delete()
      .eq('employee_id', employeeId)
      .gte('date', dateFrom)
      .lte('date', dateTo)
      .select('id')

    if (error) throw error
    return data?.length || 0
  },

  // ── Thống kê phân ca theo tháng ──
  async getMonthStats(year: number, month: number, departmentId?: string): Promise<{
    total_assignments: number
    total_employees: number
    by_shift: { shift_name: string; count: number }[]
    unassigned_days: number
  }> {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`
    const endDate = new Date(year, month, 0).toISOString().split('T')[0]

    let query = supabase
      .from('shift_assignments')
      .select(`
        id, employee_id, shift_id, date,
        shift:shifts!shift_assignments_shift_id_fkey(name),
        employee:employees!shift_assignments_employee_id_fkey(department_id)
      `)
      .gte('date', startDate)
      .lte('date', endDate)

    const { data, error } = await query
    if (error) throw error

    let filtered = data || []
    if (departmentId) {
      filtered = filtered.filter(a => {
        const emp = Array.isArray(a.employee) ? a.employee[0] : a.employee
        return emp?.department_id === departmentId
      })
    }

    const employeeSet = new Set(filtered.map(a => a.employee_id))
    const shiftCount = new Map<string, number>()
    
    filtered.forEach(a => {
      const shift = Array.isArray(a.shift) ? a.shift[0] : a.shift
      const name = shift?.name || 'N/A'
      shiftCount.set(name, (shiftCount.get(name) || 0) + 1)
    })

    return {
      total_assignments: filtered.length,
      total_employees: employeeSet.size,
      by_shift: Array.from(shiftCount.entries())
        .map(([shift_name, count]) => ({ shift_name, count }))
        .sort((a, b) => b.count - a.count),
      unassigned_days: 0  // Tính sau nếu cần
    }
  }
}

export default shiftAssignmentService