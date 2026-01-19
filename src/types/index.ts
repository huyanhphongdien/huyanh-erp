// ============================================================
// HUY ANH ERP - TYPESCRIPT TYPES
// Phase 3: HRM Module (3.1 - 3.4)
// ============================================================

// ==================== USER & AUTH ====================
export interface User {
  id: string
  email: string
  full_name?: string
  employee_id?: string
  employee_code?: string
  department_id?: string
  position_id?: string
}

export interface LoginCredentials {
  email: string
  password: string
}

export interface RegisterCredentials {
  email: string
  password: string
  full_name: string
  phone?: string
}

// ==================== PAGINATION ====================
export interface PaginationParams {
  page?: number
  pageSize?: number
  search?: string
  status?: string
  sortBy?: string
  sortOrder?: "asc" | "desc"
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

// ============================================================
// PHASE 3.1: PHÒNG BAN, CHỨC VỤ, NHÂN VIÊN
// ============================================================

// ==================== DEPARTMENT ====================
export interface Department {
  id: string
  code: string
  name: string
  description?: string
  parent_id?: string
  manager_id?: string
  status: "active" | "inactive"
  created_at: string
  updated_at: string
  // Relations
  parent?: Department
  manager?: { id: string; full_name: string }
  children?: Department[]
  _count?: { employees: number }
}

export interface DepartmentFormData {
  code: string
  name: string
  description?: string
  parent_id?: string
  manager_id?: string
  status?: string
}

// ==================== POSITION ====================
export interface Position {
  id: string
  code: string
  name: string
  description?: string
  department_id?: string
  level?: number
  status: "active" | "inactive"
  created_at: string
  updated_at: string
  // Relations
  department?: { id: string; name: string }
  _count?: { employees: number }
}

export interface PositionFormData {
  code: string
  name: string
  description?: string
  department_id?: string
  level?: number
  status?: string
}

// ==================== EMPLOYEE ====================
export interface Employee {
  id: string
  code: string
  full_name: string
  email?: string
  phone?: string
  gender?: "male" | "female" | "other"
  birth_date?: string
  id_number?: string
  id_issue_date?: string
  id_issue_place?: string
  address?: string
  permanent_address?: string
  department_id?: string
  position_id?: string
  manager_id?: string
  hire_date?: string
  probation_end_date?: string
  employment_type?: "full_time" | "part_time" | "contract" | "intern"
  status: "active" | "inactive" | "terminated" | "on_leave"
  avatar_url?: string
  user_id?: string
  salary_grade_id?: string
  created_at: string
  updated_at: string
  // Relations
  department?: { id: string; name: string }
  position?: { id: string; name: string }
  manager?: { id: string; full_name: string }
  salary_grade?: { id: string; name: string; base_salary?: number }
}

export interface EmployeeFormData {
  code: string
  full_name: string
  email?: string
  phone?: string
  gender?: string
  birth_date?: string
  id_number?: string
  id_issue_date?: string
  id_issue_place?: string
  address?: string
  permanent_address?: string
  department_id?: string
  position_id?: string
  manager_id?: string
  hire_date?: string
  probation_end_date?: string
  employment_type?: string
  status?: string
  avatar_url?: string
  salary_grade_id?: string
}

// ============================================================
// PHASE 3.2: HỢP ĐỒNG
// ============================================================

// ==================== CONTRACT TYPE ====================
export interface ContractType {
  id: string
  code: string
  name: string
  description?: string
  duration_months?: number
  is_indefinite: boolean
  status: "active" | "inactive"
  created_at: string
  updated_at: string
}

export interface ContractTypeFormData {
  code: string
  name: string
  description?: string
  duration_months?: number
  is_indefinite?: boolean
  status?: string
}

// ==================== CONTRACT ====================
export interface Contract {
  id: string
  contract_number: string
  employee_id: string
  contract_type_id: string
  start_date: string
  end_date?: string
  sign_date?: string
  base_salary: number
  allowances?: number
  status: "active" | "expired" | "terminated" | "pending"
  notes?: string
  attachment_url?: string
  created_at: string
  updated_at: string
  // Relations
  employee?: { id: string; code: string; full_name: string }
  contract_type?: { id: string; name: string }
}

export interface ContractFormData {
  contract_number: string
  employee_id: string
  contract_type_id: string
  start_date: string
  end_date?: string
  sign_date?: string
  base_salary: number
  allowances?: number
  status?: string
  notes?: string
  attachment_url?: string
}

// ============================================================
// PHASE 3.3: NGHỈ PHÉP & CHẤM CÔNG
// ============================================================

// ==================== LEAVE TYPE ====================
export interface LeaveType {
  id: string
  code: string
  name: string
  description?: string
  default_days: number
  max_consecutive_days?: number
  is_paid: boolean
  requires_approval: boolean
  color?: string
  status: "active" | "inactive"
  created_at: string
  updated_at: string
}

export interface LeaveTypeFormData {
  code: string
  name: string
  description?: string
  default_days: number
  max_consecutive_days?: number
  is_paid?: boolean
  requires_approval?: boolean
  color?: string
  status?: string
}

// ==================== LEAVE BALANCE ====================
export interface LeaveBalance {
  id: string
  employee_id: string
  leave_type_id: string
  year: number
  total_days: number
  used_days: number
  remaining_days: number
  carried_days: number
  created_at: string
  updated_at: string
  // Relations
  employee?: { id: string; code: string; full_name: string }
  leave_type?: LeaveType
}

// ==================== LEAVE REQUEST ====================
export interface LeaveRequest {
  id: string
  request_number: string
  employee_id: string
  leave_type_id: string
  start_date: string
  end_date: string
  total_days: number
  is_half_day: boolean
  half_day_type?: "morning" | "afternoon"
  reason: string
  status: "pending" | "approved" | "rejected" | "cancelled"
  approved_by?: string
  approved_at?: string
  approval_notes?: string
  attachment_url?: string
  created_at: string
  updated_at: string
  // Relations
  employee?: { id: string; code: string; full_name: string }
  leave_type?: { id: string; name: string; color?: string }
  approver?: { id: string; full_name: string }
}

export interface LeaveRequestFormData {
  employee_id: string
  leave_type_id: string
  start_date: string
  end_date: string
  total_days: number
  is_half_day?: boolean
  half_day_type?: string
  reason: string
  attachment_url?: string
}

// ==================== ATTENDANCE ====================
export interface Attendance {
  id: string
  employee_id: string
  date: string
  check_in?: string
  check_out?: string
  check_in_location?: string
  check_out_location?: string
  working_hours?: number
  overtime_hours?: number
  status: "present" | "absent" | "late" | "early_leave" | "half_day" | "on_leave"
  notes?: string
  created_at: string
  updated_at: string
  // Relations
  employee?: { id: string; code: string; full_name: string }
}

export interface AttendanceFormData {
  employee_id: string
  date: string
  check_in?: string
  check_out?: string
  check_in_location?: string
  check_out_location?: string
  status?: string
  notes?: string
}

// ============================================================
// PHASE 3.4: LƯƠNG & ĐÁNH GIÁ HIỆU SUẤT
// ============================================================

// ==================== SALARY GRADE ====================
export interface SalaryGrade {
  id: string
  code: string
  name: string
  level: number
  min_salary: number
  max_salary: number
  base_salary?: number
  allowance_rate?: number
  description?: string
  status: "active" | "inactive"
  created_at: string
  updated_at: string
}

export interface SalaryGradeFormData {
  code: string
  name: string
  level: number
  min_salary: number
  max_salary: number
  base_salary?: number
  allowance_rate?: number
  description?: string
  status?: string
}

// ==================== PAYROLL PERIOD ====================
export interface PayrollPeriod {
  id: string
  code: string
  name: string
  year: number
  month: number
  start_date: string
  end_date: string
  payment_date?: string
  status: "draft" | "processing" | "confirmed" | "paid"
  total_employees: number
  total_amount: number
  notes?: string
  created_by?: string
  confirmed_by?: string
  confirmed_at?: string
  created_at: string
  updated_at: string
  // Relations
  creator?: { id: string; full_name: string }
  confirmer?: { id: string; full_name: string }
}

export interface PayrollPeriodFormData {
  code: string
  name: string
  year: number
  month: number
  start_date: string
  end_date: string
  payment_date?: string
  notes?: string
}

// ==================== PAYSLIP ====================
export interface Payslip {
  id: string
  payslip_number: string
  payroll_period_id: string
  employee_id: string

  // Snapshot thông tin nhân viên
  employee_code?: string
  employee_name?: string
  department_name?: string
  position_name?: string
  salary_grade_name?: string

  // Ngày công
  working_days: number
  actual_days: number
  leave_days: number
  unpaid_leave_days: number
  overtime_hours: number

  // Thu nhập
  base_salary: number
  allowances: number
  overtime_pay: number
  bonus: number
  other_income: number
  gross_salary: number

  // Khấu trừ
  social_insurance: number
  health_insurance: number
  unemployment_insurance: number
  personal_income_tax: number
  other_deductions: number
  total_deductions: number

  // Thực lĩnh
  net_salary: number

  status: "draft" | "confirmed" | "paid"
  notes?: string
  created_at: string
  updated_at: string

  // Relations
  employee?: { id: string; code: string; full_name: string }
  payroll_period?: PayrollPeriod
  items?: PayslipItem[]
}

export interface PayslipItem {
  id: string
  payslip_id: string
  item_type: "earning" | "deduction"
  item_code: string
  item_name: string
  amount: number
  description?: string
  sort_order: number
}

// ==================== PERFORMANCE CRITERIA ====================
export interface PerformanceCriteria {
  id: string
  code: string
  name: string
  description?: string
  category?: string
  weight: number
  max_score: number
  is_required: boolean
  status: "active" | "inactive"
  sort_order: number
  created_at: string
  updated_at: string
}

export interface PerformanceCriteriaFormData {
  code: string
  name: string
  description?: string
  category?: string
  weight: number
  max_score?: number
  is_required?: boolean
  status?: string
  sort_order?: number
}

// ==================== PERFORMANCE REVIEW ====================
export interface PerformanceReview {
  id: string
  review_code: string
  employee_id: string
  reviewer_id?: string
  review_period: string
  period_type: "quarterly" | "yearly"
  start_date: string
  end_date: string
  total_score?: number
  grade?: string
  strengths?: string
  weaknesses?: string
  goals?: string
  reviewer_comments?: string
  employee_comments?: string
  status: "draft" | "submitted" | "reviewed" | "acknowledged"
  submitted_at?: string
  reviewed_at?: string
  acknowledged_at?: string
  created_at: string
  updated_at: string
  // Relations
  employee?: { id: string; code: string; full_name: string }
  reviewer?: { id: string; full_name: string }
  scores?: ReviewScore[]
}

export interface PerformanceReviewFormData {
  employee_id: string
  reviewer_id?: string
  review_period: string
  period_type: string
  start_date: string
  end_date: string
  strengths?: string
  weaknesses?: string
  goals?: string
  reviewer_comments?: string
}

// ==================== REVIEW SCORE ====================
export interface ReviewScore {
  id: string
  review_id: string
  criteria_id: string
  score: number
  weighted_score?: number
  comments?: string
  created_at: string
  // Relations
  criteria?: PerformanceCriteria
}

// ==========================================
// TASK TYPES - PHASE 4.1
// ==========================================
 
export type TaskStatus = 'new' | 'in_progress' | 'pending_review' | 
                         'completed' | 'cancelled' | 'on_hold'
 
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'
 
export type TaskComplexity = 'simple' | 'medium' | 'complex' | 'very_complex'
 
export interface Task {
  id: string
  code: string
  name: string
  description?: string
  
  // FK references
  department_id?: string
  assigner_id?: string
  assignee_id?: string
  project_id?: string
  parent_task_id?: string
  
  // Timeline
  start_date?: string
  due_date?: string
  completed_date?: string
  
  // Status
  status: TaskStatus
  priority: TaskPriority
  progress: number
  
  // Additional
  tags?: string[]
  is_self_assigned: boolean
  notes?: string
  
  // Audit
  created_by?: string
  created_at?: string
  updated_at?: string
  
  // Joined data (từ Supabase)
  department?: {
    id: string
    code: string
    name: string
  }
  assigner?: {
    id: string
    code: string
    full_name: string
  }
  assignee?: {
    id: string
    code: string
    full_name: string
  }
  parent_task?: {
    id: string
    code: string
    name: string
  }
  subtasks?: Task[]
}
 
export interface TaskDetail {
  id: string
  task_id: string
  objectives?: string
  required_skills?: string
  evaluation_criteria?: string
  complexity: TaskComplexity
  methodology?: string
  special_notes?: string
  created_by?: string
  created_at?: string
  updated_at?: string
}
 
export interface CreateTaskInput {
  name: string
  description?: string
  department_id?: string
  assigner_id?: string
  assignee_id?: string
  project_id?: string
  parent_task_id?: string
  start_date?: string
  due_date?: string
  status?: TaskStatus
  priority?: TaskPriority
  tags?: string[]
  is_self_assigned?: boolean
  notes?: string
}
 
export interface UpdateTaskInput extends Partial<CreateTaskInput> {
  progress?: number
  completed_date?: string
}
 
export interface TaskFilter {
  search?: string
  department_id?: string
  assignee_id?: string
  assigner_id?: string
  status?: TaskStatus | TaskStatus[]
  priority?: TaskPriority | TaskPriority[]
  start_date_from?: string
  start_date_to?: string
  due_date_from?: string
  due_date_to?: string
  has_parent?: boolean
}
 
export interface TaskListResponse {
  data: Task[]
  total: number
  page: number
  limit: number
}


// ==========================================
// DEPARTMENT INPUT TYPES
// ==========================================
export interface CreateDepartmentInput {
  code: string
  name: string
  parent_id?: string
  manager_id?: string
  description?: string
  status?: 'active' | 'inactive'
}

export interface UpdateDepartmentInput extends Partial<CreateDepartmentInput> {}

// ==========================================
// EMPLOYEE INPUT TYPES
// ==========================================
export interface CreateEmployeeInput {
  code?: string
  full_name: string
  email?: string
  phone?: string
  date_of_birth?: string
  gender?: 'male' | 'female' | 'other'
  address?: string
  department_id?: string
  position_id?: string
  hire_date?: string
  status?: 'active' | 'inactive'
}

export interface UpdateEmployeeInput extends Partial<CreateEmployeeInput> {}