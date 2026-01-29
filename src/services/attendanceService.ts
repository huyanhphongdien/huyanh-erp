import { supabase } from '../lib/supabase'

// Define types inline
interface Attendance {
  id: string
  employee_id: string
  date: string
  check_in_time?: string
  check_out_time?: string
  working_minutes?: number
  overtime_minutes?: number
  status: string
  notes?: string
  created_at: string
  updated_at: string
}

interface AttendanceFormData {
  employee_id: string
  date: string
  check_in_time?: string
  check_out_time?: string
  working_minutes?: number
  overtime_minutes?: number
  status?: string
  notes?: string
}

interface PaginationParams {
  page: number
  pageSize: number
  search?: string
  status?: string
}

interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}
 
export const attendanceService = {
  async getAll(params: PaginationParams & { 
    employee_id?: string, 
    from_date?: string, 
    to_date?: string 
  }): Promise<PaginatedResponse<Attendance>> {
    const { page, pageSize, status, employee_id, from_date, to_date } = params
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1
 
    let query = supabase
      .from('attendance')
      .select(`
        *,
        employee:employees!attendance_employee_id_fkey(id, code, full_name, department:departments!employees_department_id_fkey(name))
      `, { count: 'exact' })
 
    if (status && status !== 'all') {
      query = query.eq('status', status)
    }
 
    if (employee_id) {
      query = query.eq('employee_id', employee_id)
    }
 
    if (from_date) {
      query = query.gte('date', from_date)
    }
 
    if (to_date) {
      query = query.lte('date', to_date)
    }
 
    const { data, error, count } = await query
      .order('date', { ascending: false })
      .range(from, to)
 
    if (error) throw error
 
    return {
      data: data || [],
      total: count || 0,
      page,
      pageSize,
      totalPages: Math.ceil((count || 0) / pageSize)
    }
  },
 
  // Lấy chấm công của nhân viên theo ngày
  async getByEmployeeAndDate(employeeId: string, date: string): Promise<Attendance | null> {
    const { data, error } = await supabase
      .from('attendance')
      .select('*')
      .eq('employee_id', employeeId)
      .eq('date', date)
      .maybeSingle()  // FIXED: Dùng maybeSingle thay vì single
 
    if (error) throw error
    return data
  },
 
  // Check-in
  async checkIn(employeeId: string): Promise<Attendance> {
    const today = new Date().toISOString().split('T')[0]
    const now = new Date().toISOString()
    
    // Kiểm tra đã check-in chưa
    const existing = await this.getByEmployeeAndDate(employeeId, today)
    
    if (existing) {
      throw new Error('Bạn đã check-in hôm nay rồi')
    }
 
    // Xác định trạng thái (đi trễ nếu sau 8:30)
    const checkInHour = new Date().getHours()
    const checkInMinute = new Date().getMinutes()
    const isLate = checkInHour > 8 || (checkInHour === 8 && checkInMinute > 30)
 
    const { data, error } = await supabase
      .from('attendance')
      .insert({
        employee_id: employeeId,
        date: today,
        check_in_time: now,
        status: isLate ? 'late' : 'present'
      })
      .select()
      .single()
 
    if (error) throw error
    return data
  },
 
  // Check-out
  async checkOut(employeeId: string): Promise<Attendance> {
    const today = new Date().toISOString().split('T')[0]
    const now = new Date().toISOString()
    
    const existing = await this.getByEmployeeAndDate(employeeId, today)
    
    if (!existing) {
      throw new Error('Bạn chưa check-in hôm nay')
    }
    
    if (existing.check_out_time) {
      throw new Error('Bạn đã check-out rồi')
    }
 
    // Tính thời gian làm việc
    const checkIn = new Date(existing.check_in_time!)
    const checkOut = new Date(now)
    const workingMinutes = Math.floor((checkOut.getTime() - checkIn.getTime()) / (1000 * 60))
    
    // Tính OT (sau 17:30)
    let overtimeMinutes = 0
    const endOfDay = new Date(today + 'T17:30:00')
    if (checkOut > endOfDay) {
      overtimeMinutes = Math.floor((checkOut.getTime() - endOfDay.getTime()) / (1000 * 60))
    }
 
    // Xác định về sớm (trước 17:00)
    const isEarlyLeave = checkOut.getHours() < 17
 
    const { data, error } = await supabase
      .from('attendance')
      .update({
        check_out_time: now,
        working_minutes: workingMinutes,
        overtime_minutes: overtimeMinutes,
        status: isEarlyLeave ? 'early_leave' : existing.status
      })
      .eq('id', existing.id)
      .select()
      .single()
 
    if (error) throw error
    return data
  },
 
  // Lấy chấm công hôm nay của nhân viên
  async getTodayAttendance(employeeId: string): Promise<Attendance | null> {
    const today = new Date().toISOString().split('T')[0]
    return this.getByEmployeeAndDate(employeeId, today)
  },
 
  // Báo cáo chấm công theo tháng
  async getMonthlyReport(year: number, month: number, departmentId?: string): Promise<any[]> {
    const startDate = `${year}-${month.toString().padStart(2, '0')}-01`
    const endDate = new Date(year, month, 0).toISOString().split('T')[0]
 
    let query = supabase
      .from('attendance')
      .select(`
        *,
        employee:employees!attendance_employee_id_fkey(
          id, code, full_name, 
          department_id,
          department:departments!employees_department_id_fkey(id, name)
        )
      `)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('employee_id')
      .order('date')
 
    const { data, error } = await query
 
    if (error) throw error
    
    // Nếu có filter theo phòng ban
    if (departmentId && data) {
      return data.filter(item => item.employee?.department_id === departmentId)
    }
    
    return data || []
  },
 
  // Cập nhật chấm công (admin)
  async update(id: string, attendance: Partial<AttendanceFormData>): Promise<Attendance> {
    const { data, error } = await supabase
      .from('attendance')
      .update(attendance)
      .eq('id', id)
      .select()
      .single()
 
    if (error) throw error
    return data
  }
}

export default attendanceService