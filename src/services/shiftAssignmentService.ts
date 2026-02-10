// ============================================================================
// SHIFT ASSIGNMENT SERVICE V2 - Phân ca cho nhân viên (Multi-Shift)
// File: src/services/shiftAssignmentService.ts
// Huy Anh ERP System - Chấm công V2 + Multi-Shift Per Day
// ============================================================================
// UPDATED: Hỗ trợ phân nhiều ca/ngày cho 1 nhân viên
// UPDATED: Thêm batchScheduleByTeams() cho phân ca theo đội
// UPDATED: Logic đổi ca: Thứ 4 tuần chẵn, Thứ 5 tuần lẻ
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
  department_code: string
  department_name: string
  // ★ V2: mỗi ngày có thể có NHIỀU ca
  assignments: Record<string, DayAssignment[]>  // key = 'YYYY-MM-DD'
}

export interface DayAssignment {
  id: string
  shift_id: string
  shift_code: string
  shift_name: string
  shift_category: string
  start_time: string
  end_time: string
  assignment_type: string
  is_override: boolean
}

// ── V2: Team Rotation Types ──

export interface TeamRotationInput {
  department_id: string
  date_from: string           // 'YYYY-MM-DD'
  date_to: string
  team_patterns: TeamPatternConfig[]
  swap_rule: SwapRule
  overwrite_existing: boolean
  created_by: string
  notes?: string
}

export interface TeamPatternConfig {
  team_id: string
  // Shift xoay vòng: team bắt đầu với shift nào
  initial_shift_id: string
}

export interface SwapRule {
  type: 'custom_weekday'
  // Tuần chẵn: đổi ca vào thứ mấy (0=CN, 1=T2, ..., 6=T7)
  even_week_day: number   // 3 = Thứ 4
  // Tuần lẻ: đổi ca vào thứ mấy
  odd_week_day: number    // 4 = Thứ 5
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Lấy ISO week number (1-53) của 1 ngày
 * Tuần 1 = tuần chứa ngày Thứ Năm đầu tiên của năm
 */
function getISOWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7  // Make Sunday = 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
}

/**
 * Kiểm tra ngày có phải ngày đổi ca không
 * Logic: Thứ 4 tuần chẵn, Thứ 5 tuần lẻ
 */
function isSwapDay(date: Date, swapRule: SwapRule): boolean {
  const dayOfWeek = date.getDay() // 0=CN, 1=T2, ..., 6=T7
  const weekNumber = getISOWeekNumber(date)
  const isEvenWeek = weekNumber % 2 === 0

  if (isEvenWeek) {
    return dayOfWeek === swapRule.even_week_day
  } else {
    return dayOfWeek === swapRule.odd_week_day
  }
}

// ============================================================================
// SERVICE
// ============================================================================

export const shiftAssignmentService = {

  // ══════════════════════════════════════════════════════════════════════════
  // QUERY
  // ══════════════════════════════════════════════════════════════════════════

  // ── Lấy ca được phân cho 1 nhân viên tại 1 ngày ──
  // ★ V2: Return mảng (có thể có nhiều ca)
  async getByEmployeeAndDate(employeeId: string, date: string): Promise<ShiftAssignment[]> {
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
      .order('shift_id')  // Sắp xếp theo ca

    if (error) throw error
    return data || []
  },

  // ── Lấy 1 assignment cụ thể (backward compat) ──
  async getOneByEmployeeAndDate(employeeId: string, date: string): Promise<ShiftAssignment | null> {
    const assignments = await this.getByEmployeeAndDate(employeeId, date)
    return assignments.length > 0 ? assignments[0] : null
  },

  // ── Lấy lịch ca theo khoảng thời gian (cho Calendar View) ──
  // ★ V2: Mỗi ngày có thể có nhiều ca
  async getCalendarView(params: CalendarViewParams): Promise<EmployeeShiftCalendar[]> {
    const { department_id, date_from, date_to } = params

    // Lấy danh sách nhân viên
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

    // ★ V2: Build calendar map — mỗi employee+date = mảng assignments
    const assignmentMap = new Map<string, ShiftAssignment[]>()
    ;(assignments || []).forEach(a => {
      const key = `${a.employee_id}|${a.date}`
      if (!assignmentMap.has(key)) assignmentMap.set(key, [])
      assignmentMap.get(key)!.push(a)
    })

    // Build result
    return employees.map(emp => {
      const dept = Array.isArray(emp.department) ? emp.department[0] : emp.department
      
      const dateMap: Record<string, DayAssignment[]> = {}
      
      // Duyệt từng ngày
      const start = new Date(date_from)
      const end = new Date(date_to)
      const current = new Date(start)
      
      while (current <= end) {
        const dateStr = current.toISOString().split('T')[0]
        const key = `${emp.id}|${dateStr}`
        const dayAssignments = assignmentMap.get(key) || []
        
        dateMap[dateStr] = dayAssignments.map(a => {
          const shift = Array.isArray(a.shift) ? a.shift[0] : a.shift
          return {
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
        
        current.setDate(current.getDate() + 1)
      }

      return {
        employee_id: emp.id,
        employee_code: emp.code,
        employee_name: emp.full_name,
        department_code: dept?.code || '',
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
  // PHÂN CA HÀNG LOẠT - ORIGINAL (giữ nguyên cho backward compat)
  // ══════════════════════════════════════════════════════════════════════════

  async batchSchedule(input: BatchScheduleInput): Promise<{
    created: number
    skipped: number
    overwritten: number
  }> {
    const { employee_ids, date_from, date_to, pattern, overwrite_existing, created_by, notes } = input
    
    if (pattern.length === 0) throw new Error('Pattern không được rỗng')
    
    // Query department_code cho từng employee
    const { data: empDepts, error: empDeptError } = await supabase
      .from('employees')
      .select(`
        id,
        department:departments!employees_department_id_fkey(code)
      `)
      .in('id', employee_ids)

    if (empDeptError) throw empDeptError

    const empDeptMap = new Map<string, string>()
    ;(empDepts || []).forEach(e => {
      const dept = Array.isArray(e.department) ? e.department[0] : e.department
      empDeptMap.set(e.id, dept?.code || '')
    })

    const batchId = crypto.randomUUID()
    const rows: any[] = []
    
    const startDate = new Date(date_from)
    const endDate = new Date(date_to)
    
    let currentDate = new Date(startDate)
    while (currentDate <= endDate) {
      const dateStr = currentDate.toISOString().split('T')[0]
      
      const diffDays = Math.floor(
        (currentDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
      )
      const weekIndex = Math.floor(diffDays / 7) % pattern.length
      const shiftId = pattern[weekIndex].shift_id

      const dayOfWeek = currentDate.getDay()

      for (const empId of employee_ids) {
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
      const { data: existing } = await supabase
        .from('shift_assignments')
        .select('id')
        .in('employee_id', employee_ids)
        .gte('date', date_from)
        .lte('date', date_to)

      overwritten = existing?.length || 0

      if (overwritten > 0) {
        const existingIds = (existing || []).map(e => e.id)
        for (let i = 0; i < existingIds.length; i += 100) {
          const batch = existingIds.slice(i, i + 100)
          await supabase
            .from('shift_assignments')
            .delete()
            .in('id', batch)
        }
      }

      for (let i = 0; i < rows.length; i += 500) {
        const batch = rows.slice(i, i + 500)
        const { error } = await supabase
          .from('shift_assignments')
          .insert(batch)
        if (error) throw error
      }

      return { created: rows.length, skipped: 0, overwritten }
    } else {
      const dates = [...new Set(rows.map(r => r.date))]
      
      const { data: existing } = await supabase
        .from('shift_assignments')
        .select('employee_id, date, shift_id')
        .in('employee_id', employee_ids)
        .in('date', dates)

      // ★ V2: Check cả shift_id (vì giờ 1 NV có thể có nhiều ca/ngày)
      const existingSet = new Set(
        (existing || []).map(e => `${e.employee_id}|${e.date}|${e.shift_id}`)
      )

      const newRows = rows.filter(r => !existingSet.has(`${r.employee_id}|${r.date}|${r.shift_id}`))
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
  // ★★★ V2: PHÂN CA THEO ĐỘI (Team Rotation)
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Logic:
  //   - Mỗi đội bắt đầu với 1 ca (initial_shift_id)
  //   - Khi gặp ngày đổi ca (swap day) → đội chuyển sang ca tiếp theo
  //   - Swap day: Thứ 4 tuần chẵn, Thứ 5 tuần lẻ
  //   - Ca xoay vòng giữa các ca ngắn được assign cho department
  //
  // Ví dụ:
  //   Đội A bắt đầu: Ca Sáng
  //   Đội B bắt đầu: Ca Chiều
  //   Ngày đổi (T4 tuần chẵn) → Đội A: Ca Chiều, Đội B: Ca Sáng
  //
  // ══════════════════════════════════════════════════════════════════════════

  async batchScheduleByTeams(input: TeamRotationInput): Promise<{
    created: number
    skipped: number
    overwritten: number
    details: { team_code: string; created: number }[]
  }> {
    const {
      department_id, date_from, date_to,
      team_patterns, swap_rule,
      overwrite_existing, created_by, notes
    } = input

    if (team_patterns.length === 0) {
      throw new Error('Phải có ít nhất 1 đội')
    }

    // ① Lấy thông tin đội + members
    const teamData: {
      team_id: string
      team_code: string
      member_ids: string[]
      current_shift_id: string
    }[] = []

    for (const tp of team_patterns) {
      const { data: team } = await supabase
        .from('shift_teams')
        .select('id, code, name')
        .eq('id', tp.team_id)
        .single()

      if (!team) throw new Error(`Không tìm thấy đội ${tp.team_id}`)

      // Lấy members active trong khoảng
      const { data: members } = await supabase
        .from('shift_team_members')
        .select('employee_id')
        .eq('team_id', tp.team_id)
        .lte('effective_from', date_to)
        .or(`effective_to.is.null,effective_to.gte.${date_from}`)

      const memberIds = (members || []).map(m => m.employee_id)

      teamData.push({
        team_id: tp.team_id,
        team_code: team.code,
        member_ids: memberIds,
        current_shift_id: tp.initial_shift_id
      })
    }

    // ② Lấy tất cả shift_ids đang dùng (để xoay vòng)
    const allShiftIds = team_patterns.map(tp => tp.initial_shift_id)
    // Thêm các ca khác trong department (cho xoay vòng)
    const { data: deptShifts } = await supabase
      .from('department_shift_config')
      .select('shift_id')
      .eq('department_id', department_id)

    const deptShiftIds = (deptShifts || []).map(ds => ds.shift_id)
    // Nếu department_shift_config rỗng → dùng allShiftIds
    const rotationShiftIds = deptShiftIds.length > 0 ? deptShiftIds : [...new Set(allShiftIds)]

    // ③ Query department_code cho tất cả members (kiểm tra nghỉ CN)
    const allMemberIds = teamData.flatMap(t => t.member_ids)
    const empDeptMap = new Map<string, string>()

    if (allMemberIds.length > 0) {
      const { data: empDepts } = await supabase
        .from('employees')
        .select(`id, department:departments!employees_department_id_fkey(code)`)
        .in('id', allMemberIds)

      ;(empDepts || []).forEach(e => {
        const dept = Array.isArray(e.department) ? e.department[0] : e.department
        empDeptMap.set(e.id, dept?.code || '')
      })
    }

    // ④ Generate assignments
    const batchId = crypto.randomUUID()
    const allRows: any[] = []
    const teamCreatedCount: Record<string, number> = {}

    // Track current shift cho mỗi đội
    const teamShiftState = new Map<string, string>()
    teamData.forEach(t => {
      teamShiftState.set(t.team_id, t.current_shift_id)
      teamCreatedCount[t.team_code] = 0
    })

    // Helper: lấy shift tiếp theo trong rotation
    function getNextShift(currentShiftId: string): string {
      const idx = rotationShiftIds.indexOf(currentShiftId)
      if (idx === -1) return rotationShiftIds[0] || currentShiftId
      return rotationShiftIds[(idx + 1) % rotationShiftIds.length]
    }

    // Duyệt từng ngày
    const startDate = new Date(date_from)
    const endDate = new Date(date_to)
    let currentDate = new Date(startDate)

    while (currentDate <= endDate) {
      const dateStr = currentDate.toISOString().split('T')[0]
      const dayOfWeek = currentDate.getDay()

      // Kiểm tra có phải ngày đổi ca không
      const isSwap = isSwapDay(currentDate, swap_rule)

      // Nếu là ngày đổi ca → chuyển shift cho tất cả đội
      if (isSwap) {
        for (const team of teamData) {
          const currentShift = teamShiftState.get(team.team_id)!
          const nextShift = getNextShift(currentShift)
          teamShiftState.set(team.team_id, nextShift)
        }
      }

      // Generate rows cho từng đội
      for (const team of teamData) {
        const shiftId = teamShiftState.get(team.team_id)!

        for (const empId of team.member_ids) {
          // Skip Chủ nhật cho phòng KT/RD
          const deptCode = empDeptMap.get(empId) || ''
          const isSundayOff = dayOfWeek === 0 && SUNDAY_OFF_DEPT_CODES.includes(deptCode)

          if (!isSundayOff) {
            allRows.push({
              employee_id: empId,
              shift_id: shiftId,
              date: dateStr,
              assignment_type: 'scheduled',
              schedule_batch_id: batchId,
              created_by,
              notes: notes || `Team ${team.team_code}`
            })
            teamCreatedCount[team.team_code]++
          }
        }
      }

      currentDate.setDate(currentDate.getDate() + 1)
    }

    if (allRows.length === 0) {
      return {
        created: 0, skipped: 0, overwritten: 0,
        details: teamData.map(t => ({ team_code: t.team_code, created: 0 }))
      }
    }

    // ⑤ Insert (overwrite or skip existing)
    let skipped = 0
    let overwritten = 0

    if (overwrite_existing) {
      // Xóa assignments cũ cho tất cả members trong khoảng
      if (allMemberIds.length > 0) {
        const { data: existing } = await supabase
          .from('shift_assignments')
          .select('id')
          .in('employee_id', allMemberIds)
          .gte('date', date_from)
          .lte('date', date_to)

        overwritten = existing?.length || 0

        if (overwritten > 0) {
          const existingIds = (existing || []).map(e => e.id)
          for (let i = 0; i < existingIds.length; i += 100) {
            const batch = existingIds.slice(i, i + 100)
            await supabase.from('shift_assignments').delete().in('id', batch)
          }
        }
      }

      // Insert tất cả
      for (let i = 0; i < allRows.length; i += 500) {
        const batch = allRows.slice(i, i + 500)
        const { error } = await supabase.from('shift_assignments').insert(batch)
        if (error) throw error
      }

      return {
        created: allRows.length,
        skipped: 0,
        overwritten,
        details: teamData.map(t => ({
          team_code: t.team_code,
          created: teamCreatedCount[t.team_code]
        }))
      }
    } else {
      // Chỉ insert chưa có
      const dates = [...new Set(allRows.map(r => r.date))]

      const { data: existing } = await supabase
        .from('shift_assignments')
        .select('employee_id, date, shift_id')
        .in('employee_id', allMemberIds)
        .in('date', dates)

      const existingSet = new Set(
        (existing || []).map(e => `${e.employee_id}|${e.date}|${e.shift_id}`)
      )

      const newRows = allRows.filter(r =>
        !existingSet.has(`${r.employee_id}|${r.date}|${r.shift_id}`)
      )
      skipped = allRows.length - newRows.length

      if (newRows.length > 0) {
        for (let i = 0; i < newRows.length; i += 500) {
          const batch = newRows.slice(i, i + 500)
          const { error } = await supabase.from('shift_assignments').insert(batch)
          if (error) throw error
        }
      }

      // Recalculate per-team created
      const actualTeamCount: Record<string, number> = {}
      teamData.forEach(t => { actualTeamCount[t.team_code] = 0 })
      newRows.forEach(r => {
        const team = teamData.find(t => t.member_ids.includes(r.employee_id))
        if (team) actualTeamCount[team.team_code]++
      })

      return {
        created: newRows.length,
        skipped,
        overwritten: 0,
        details: teamData.map(t => ({
          team_code: t.team_code,
          created: actualTeamCount[t.team_code]
        }))
      }
    }
  },

  // ══════════════════════════════════════════════════════════════════════════
  // ★ V2: PREVIEW - Xem trước lịch phân ca trước khi lưu
  // ══════════════════════════════════════════════════════════════════════════

  previewTeamRotation(input: {
    date_from: string
    date_to: string
    team_patterns: { team_code: string; initial_shift_id: string; shift_name: string }[]
    swap_rule: SwapRule
    shift_names: Record<string, string>  // shift_id → name
    rotation_shift_ids: string[]
  }): {
    dates: string[]
    schedule: Record<string, Record<string, string>>  // team_code → date → shift_name
    swap_dates: string[]
  } {
    const { date_from, date_to, team_patterns, swap_rule, shift_names, rotation_shift_ids } = input

    const teamShiftState = new Map<string, string>()
    team_patterns.forEach(tp => {
      teamShiftState.set(tp.team_code, tp.initial_shift_id)
    })

    function getNextShift(currentId: string): string {
      const idx = rotation_shift_ids.indexOf(currentId)
      if (idx === -1) return rotation_shift_ids[0] || currentId
      return rotation_shift_ids[(idx + 1) % rotation_shift_ids.length]
    }

    const dates: string[] = []
    const swapDates: string[] = []
    const schedule: Record<string, Record<string, string>> = {}
    team_patterns.forEach(tp => { schedule[tp.team_code] = {} })

    const startDate = new Date(date_from)
    const endDate = new Date(date_to)
    let current = new Date(startDate)

    while (current <= endDate) {
      const dateStr = current.toISOString().split('T')[0]
      dates.push(dateStr)

      const isSwap = isSwapDay(current, swap_rule)
      if (isSwap) {
        swapDates.push(dateStr)
        for (const tp of team_patterns) {
          const currentShift = teamShiftState.get(tp.team_code)!
          teamShiftState.set(tp.team_code, getNextShift(currentShift))
        }
      }

      for (const tp of team_patterns) {
        const shiftId = teamShiftState.get(tp.team_code)!
        schedule[tp.team_code][dateStr] = shift_names[shiftId] || shiftId
      }

      current.setDate(current.getDate() + 1)
    }

    return { dates, schedule, swap_dates: swapDates }
  },

  // ══════════════════════════════════════════════════════════════════════════
  // THAY ĐỔI ĐỘT XUẤT (Override) - giữ nguyên
  // ══════════════════════════════════════════════════════════════════════════

  async overrideShift(input: OverrideInput): Promise<ShiftAssignment> {
    const { employee_id, date, new_shift_id, created_by, notes } = input

    // Kiểm tra có assignment cũ không (lấy assignment đầu tiên)
    const existingList = await this.getByEmployeeAndDate(employee_id, date)
    const existing = existingList.length > 0 ? existingList[0] : null

    if (existing) {
      const { data, error } = await supabase
        .from('shift_assignments')
        .update({
          shift_id: new_shift_id,
          assignment_type: 'override',
          original_shift_id: existing.shift_id,
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

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('shift_assignments')
      .delete()
      .eq('id', id)

    if (error) throw error
  },

  async deleteBatch(batchId: string): Promise<number> {
    const { data, error } = await supabase
      .from('shift_assignments')
      .delete()
      .eq('schedule_batch_id', batchId)
      .select('id')

    if (error) throw error
    return data?.length || 0
  },

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

    const { data, error } = await supabase
      .from('shift_assignments')
      .select(`
        id, employee_id, shift_id, date,
        shift:shifts!shift_assignments_shift_id_fkey(name),
        employee:employees!shift_assignments_employee_id_fkey(department_id)
      `)
      .gte('date', startDate)
      .lte('date', endDate)

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
      unassigned_days: 0
    }
  }
}

export default shiftAssignmentService
