import { supabase } from '../lib/supabase'

// Define types inline
interface PayrollPeriod {
  id: string
  code: string
  name: string
  year: number
  month: number
  start_date: string
  end_date: string
  status: string
  total_employees?: number
  total_amount?: number
  created_by: string
  confirmed_by?: string
  confirmed_at?: string
  created_at: string
  updated_at: string
}

interface PayrollPeriodFormData {
  code: string
  name: string
  year: number
  month: number
  start_date: string
  end_date: string
  status?: string
}

interface Payslip {
  id: string
  payslip_number: string
  payroll_period_id: string
  employee_id: string
  employee_code: string
  employee_name: string
  department_name?: string
  position_name?: string
  salary_grade_name?: string
  working_days: number
  actual_days: number
  leave_days: number
  unpaid_leave_days: number
  overtime_hours: number
  base_salary: number
  allowances: number
  overtime_pay: number
  bonus: number
  other_income: number
  gross_salary: number
  social_insurance: number
  health_insurance: number
  unemployment_insurance: number
  personal_income_tax: number
  other_deductions: number
  total_deductions: number
  net_salary: number
  status: string
  notes?: string
  created_at: string
  updated_at: string
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

// Type cho employee khi query với relations
interface EmployeeWithRelations {
  id: string
  code: string
  full_name: string
  department_id?: string
  position_id?: string
  salary_grade_id?: string
  departments: { id: string; name: string } | null
  positions: { id: string; name: string } | null
  salary_grades: { id: string; name: string; base_salary: number } | null
}

// ===== HELPER FUNCTIONS =====

async function getPeriodByIdInternal(id: string): Promise<PayrollPeriod> {
  const { data, error } = await supabase
    .from('payroll_periods')
    .select(`
      *,
      creator:employees!payroll_periods_created_by_fkey(id, full_name),
      confirmer:employees!payroll_periods_confirmed_by_fkey(id, full_name)
    `)
    .eq('id', id)
    .single()

  if (error) throw error
  return data
}

// ===== EXPORT SERVICE =====

export const payrollService = {
  // ===== PAYROLL PERIODS =====
  async getPeriods(params: PaginationParams & { year?: number }): Promise<PaginatedResponse<PayrollPeriod>> {
    const { page = 1, pageSize = 10, year, status } = params
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    let query = supabase
      .from('payroll_periods')
      .select(`
        *,
        creator:employees!payroll_periods_created_by_fkey(id, full_name),
        confirmer:employees!payroll_periods_confirmed_by_fkey(id, full_name)
      `, { count: 'exact' })

    if (year) query = query.eq('year', year)
    if (status) query = query.eq('status', status)

    const { data, error, count } = await query
      .order('year', { ascending: false })
      .order('month', { ascending: false })
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

  getPeriodById: getPeriodByIdInternal,

  async createPeriod(formData: PayrollPeriodFormData, createdBy: string): Promise<PayrollPeriod> {
    const { data, error } = await supabase
      .from('payroll_periods')
      .insert({ ...formData, created_by: createdBy })
      .select()
      .single()

    if (error) throw error
    return data
  },

  async updatePeriod(id: string, formData: Partial<PayrollPeriodFormData>): Promise<PayrollPeriod> {
    const { data, error } = await supabase
      .from('payroll_periods')
      .update({ ...formData, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data
  },

  async confirmPeriod(id: string, confirmedBy: string): Promise<PayrollPeriod> {
    const { data, error } = await supabase
      .from('payroll_periods')
      .update({ 
        status: 'confirmed',
        confirmed_by: confirmedBy,
        confirmed_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data
  },

  // ===== PAYSLIPS =====
  async getPayslips(params: PaginationParams & { 
    period_id?: string, 
    employee_id?: string 
  }): Promise<PaginatedResponse<Payslip>> {
    const { page = 1, pageSize = 10, period_id, employee_id, search } = params
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    let query = supabase
      .from('payslips')
      .select(`
        *,
        employee:employees!payslips_employee_id_fkey(id, code, full_name),
        payroll_period:payroll_periods!payslips_payroll_period_id_fkey(id, code, name, year, month)
      `, { count: 'exact' })

    if (period_id) query = query.eq('payroll_period_id', period_id)
    if (employee_id) query = query.eq('employee_id', employee_id)
    if (search) query = query.or(`payslip_number.ilike.%${search}%,employee_name.ilike.%${search}%`)

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
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

  async getPayslipById(id: string): Promise<Payslip> {
    const { data, error } = await supabase
      .from('payslips')
      .select(`
        *,
        employee:employees!payslips_employee_id_fkey(id, code, full_name),
        payroll_period:payroll_periods!payslips_payroll_period_id_fkey(*),
        items:payslip_items(*)
      `)
      .eq('id', id)
      .single()

    if (error) throw error
    return data
  },

  // Tạo phiếu lương cho tất cả nhân viên trong kỳ
  async generatePayslips(periodId: string): Promise<number> {
    // Lấy thông tin kỳ lương
    const period = await getPeriodByIdInternal(periodId)
    
    // Lấy danh sách nhân viên đang active với đầy đủ thông tin
    const { data, error: empError } = await supabase
      .from('employees')
      .select(`
        id, 
        code, 
        full_name,
        department_id,
        position_id,
        salary_grade_id,
        departments!employees_department_id_fkey(id, name),
        positions!employees_position_id_fkey(id, name),
        salary_grades!employees_salary_grade_id_fkey(id, name, base_salary)
      `)
      .eq('status', 'active')

    if (empError) throw empError

    // Cast sang đúng type
    const employees = (data || []) as unknown as EmployeeWithRelations[]

    // Tạo payslip cho từng nhân viên
    let count = 0
    for (const emp of employees) {
      const payslipNumber = `PL${period.year}-${String(period.month).padStart(2, '0')}-${String(count + 1).padStart(3, '0')}`
      
      // Lấy thông tin từ relations
      const baseSalary = emp.salary_grades?.base_salary || 0
      const socialIns = Math.round(baseSalary * 0.08)
      const healthIns = Math.round(baseSalary * 0.015)
      const unempIns = Math.round(baseSalary * 0.01)
      const totalDeductions = socialIns + healthIns + unempIns
      
      const { error } = await supabase
        .from('payslips')
        .insert({
          payslip_number: payslipNumber,
          payroll_period_id: periodId,
          employee_id: emp.id,
          employee_code: emp.code,
          employee_name: emp.full_name,
          department_name: emp.departments?.name || null,
          position_name: emp.positions?.name || null,
          salary_grade_name: emp.salary_grades?.name || null,
          working_days: 22,
          actual_days: 22,
          leave_days: 0,
          unpaid_leave_days: 0,
          overtime_hours: 0,
          base_salary: baseSalary,
          allowances: 0,
          overtime_pay: 0,
          bonus: 0,
          other_income: 0,
          gross_salary: baseSalary,
          social_insurance: socialIns,
          health_insurance: healthIns,
          unemployment_insurance: unempIns,
          personal_income_tax: 0,
          other_deductions: 0,
          total_deductions: totalDeductions,
          net_salary: baseSalary - totalDeductions,
          status: 'draft'
        })

      if (!error) count++
    }

    // Cập nhật thống kê kỳ lương
    const { data: payslips } = await supabase
      .from('payslips')
      .select('net_salary')
      .eq('payroll_period_id', periodId)

    const totalAmount = payslips?.reduce((sum, p) => sum + (p.net_salary || 0), 0) || 0

    await supabase
      .from('payroll_periods')
      .update({ 
        total_employees: count,
        total_amount: totalAmount,
        status: 'processing'
      })
      .eq('id', periodId)

    return count
  },

  // Tạo mã phiếu lương
  async generatePayslipNumber(periodId: string): Promise<string> {
    const period = await getPeriodByIdInternal(periodId)
    
    const { data, error } = await supabase
      .from('payslips')
      .select('payslip_number')
      .eq('payroll_period_id', periodId)
      .order('payslip_number', { ascending: false })
      .limit(1)

    if (!error && data && data.length > 0) {
      const lastNum = parseInt(data[0].payslip_number.slice(-3)) + 1
      return `PL${period.year}-${String(period.month).padStart(2, '0')}-${String(lastNum).padStart(3, '0')}`
    }
    
    return `PL${period.year}-${String(period.month).padStart(2, '0')}-001`
  },

  // Xóa tất cả payslips trong kỳ (để tính lại)
  async deletePayslipsByPeriod(periodId: string): Promise<void> {
    const { error } = await supabase
      .from('payslips')
      .delete()
      .eq('payroll_period_id', periodId)

    if (error) throw error

    // Reset thống kê
    await supabase
      .from('payroll_periods')
      .update({ 
        total_employees: 0,
        total_amount: 0,
        status: 'draft'
      })
      .eq('id', periodId)
  }
}

export default payrollService