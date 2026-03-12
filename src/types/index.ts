// ============================================================================
// src/types/index.ts
// Huy Anh ERP System - COMPLETE TYPES - ALL FIXES INCLUDED
// ============================================================================

// ==================== USER & AUTH ====================
export type UserRole = 'admin' | 'manager' | 'employee'

export interface User {
  id: string
  email: string
  full_name?: string
  avatar_url?: string
  employee_id: string | null
  employee_code: string | null
  department_id: string | null
  department_name: string | null
  position_id: string | null
  position_name?: string | null
  position_level?: number | null
  role: UserRole
  is_manager: boolean
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
  sortOrder?: 'asc' | 'desc'
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

// ==================== DEPARTMENT ====================
export interface Department {
  id: string
  code: string
  name: string
  description?: string | null
  manager_id?: string | null
  parent_id?: string | null
  status: 'active' | 'inactive'
  created_at: string
  updated_at: string
  manager?: Employee | null
  parent?: Department | null
  children?: Department[]
  _count?: { employees: number }
}

export interface DepartmentFormData {
  code: string
  name: string
  description?: string
  manager_id?: string
  parent_id?: string
  status?: string
}

export interface CreateDepartmentInput {
  code: string
  name: string
  description?: string
  manager_id?: string
  parent_id?: string
  status?: 'active' | 'inactive'
}

export interface UpdateDepartmentInput extends Partial<CreateDepartmentInput> {}

// ==================== POSITION ====================
export interface Position {
  id: string
  code: string
  name: string
  description?: string | null
  department_id?: string | null
  level?: number
  can_approve?: boolean
  approval_scope?: 'department' | 'company'
  status: 'active' | 'inactive'
  created_at: string
  updated_at: string
  department?: Department | null
  _count?: { employees: number }
}

export interface PositionFormData {
  code: string
  name: string
  description?: string
  department_id?: string
  level?: number
  can_approve?: boolean
  approval_scope?: 'department' | 'company'
  status?: string
}

export interface CreatePositionInput {
  code: string
  name: string
  description?: string
  department_id?: string
  level?: number
  can_approve?: boolean
  approval_scope?: 'department' | 'company'
  status?: 'active' | 'inactive'
}

export interface UpdatePositionInput extends Partial<CreatePositionInput> {}

// ==================== EMPLOYEE ====================
export type EmployeeStatus = 'active' | 'inactive' | 'on_leave' | 'terminated'
export type Gender = 'male' | 'female' | 'other'

export interface Employee {
  id: string
  code: string
  full_name: string
  email?: string | null
  phone?: string | null
  avatar_url?: string | null
  date_of_birth?: string | null
  gender?: Gender | null
  id_number?: string | null
  address?: string | null
  department_id?: string | null
  position_id?: string | null
  manager_id?: string | null
  salary_grade_id?: string | null
  hire_date?: string | null
  status: EmployeeStatus
  created_at: string
  updated_at: string
  department?: Department | null
  position?: Position | null
  manager?: Employee | null
  salary_grade?: SalaryGrade | null
  user?: { id: string; email: string } | null
}

export interface EmployeeFormData {
  code?: string
  full_name: string
  email?: string
  phone?: string
  date_of_birth?: string
  gender?: Gender | string
  id_number?: string
  address?: string
  department_id?: string
  position_id?: string
  manager_id?: string
  salary_grade_id?: string
  hire_date?: string
  status?: string
}

export interface CreateEmployeeInput {
  code: string
  full_name: string
  email?: string
  phone?: string
  date_of_birth?: string
  gender?: Gender
  id_number?: string
  address?: string
  department_id?: string
  position_id?: string
  manager_id?: string
  hire_date?: string
  status?: EmployeeStatus
}

export interface UpdateEmployeeInput extends Partial<CreateEmployeeInput> {}

// ==================== EMPLOYEE PROFILE ====================
export interface EmployeeProfile {
  id: string
  employee_id: string
  emergency_contact_name?: string
  emergency_contact_phone?: string
  emergency_contact_relation?: string
  bank_account_number?: string
  bank_name?: string
  tax_code?: string
  insurance_number?: string
  education_level?: string
  degree?: string
  major?: string
  university?: string
  graduation_year?: number
  certifications?: string
  skills?: string
  previous_companies?: string
  notes?: string
  created_at: string
  updated_at: string
}

export interface EmployeeProfileFormData {
  employee_id?: string
  emergency_contact_name?: string
  emergency_contact_phone?: string
  emergency_contact_relation?: string
  emergency_contact_relationship?: string
  emergency_contact?: string
  emergency_phone?: string
  bank_account_number?: string
  bank_name?: string
  bank_branch?: string
  bank_account_name?: string
  bank_account?: string
  tax_code?: string
  insurance_number?: string
  social_insurance_number?: string
  health_insurance_number?: string
  education_level?: string
  degree?: string
  major?: string
  university?: string
  school_name?: string
  graduation_year?: number
  id_number?: string
  id_card_number?: string
  id_issue_date?: string
  id_card_issue_date?: string
  id_issue_place?: string
  id_card_issue_place?: string
  id_card_expiry_date?: string
  address?: string
  permanent_address?: string
  permanent_province?: string
  permanent_district?: string
  permanent_ward?: string
  temporary_address?: string
  temporary_province?: string
  temporary_district?: string
  temporary_ward?: string
  city?: string
  marital_status?: string
  number_of_children?: number
  certifications?: string
  skills?: string
  previous_companies?: string
  notes?: string
}

// ==================== CONTRACT TYPE ====================
export interface ContractType {
  id: string
  code: string
  name: string
  description?: string | null
  duration_months?: number | null
  is_renewable?: boolean
  is_permanent?: boolean
  status: 'active' | 'inactive' | string
  created_at: string
  updated_at: string
}

export interface ContractTypeFormData {
  code: string
  name: string
  description?: string
  duration_months?: number
  is_renewable?: boolean
  is_permanent?: boolean
  status?: string
}

export interface CreateContractTypeInput {
  code: string
  name: string
  description?: string
  duration_months?: number
  is_renewable?: boolean
  status?: 'active' | 'inactive'
}

export interface UpdateContractTypeInput extends Partial<CreateContractTypeInput> {}

// ==================== CONTRACT ====================
export type ContractStatus = 'draft' | 'active' | 'expired' | 'terminated' | 'pending' | 'renewed'

export interface Contract {
  id: string
  employee_id: string
  contract_type_id: string
  contract_number: string
  code?: string
  start_date: string
  end_date?: string | null
  signed_date?: string | null
  sign_date?: string | null
  salary?: number | null
  base_salary?: number | null
  allowances?: number | null
  benefits?: string | null
  status: ContractStatus | string
  notes?: string | null
  created_at: string
  updated_at: string
  employee?: { id: string; code?: string; full_name: string } | null
  contract_type?: { id: string; code?: string; name: string } | null
}

export interface ContractFormData {
  employee_id: string
  contract_type_id: string
  contract_number?: string
  code?: string
  start_date: string
  end_date?: string
  signed_date?: string
  sign_date?: string
  salary?: number
  base_salary?: number
  allowances?: number
  benefits?: string
  status?: string
  notes?: string
  salary_currency?: string
  allowance_lunch?: number
  allowance_transport?: number
  allowance_phone?: number
  allowance_housing?: number
  allowance_other?: number
  job_title?: string
  work_location?: string
  working_hours?: string
}

export interface CreateContractInput {
  employee_id: string
  contract_type_id: string
  contract_number: string
  start_date: string
  end_date?: string
  salary?: number
  status?: ContractStatus
  notes?: string
}

export interface UpdateContractInput extends Partial<CreateContractInput> {}

// ==================== EMPLOYEE DOCUMENT ====================
export type DocumentType = 'id_card' | 'passport' | 'degree' | 'certificate' | 'contract' | 'other'

export interface EmployeeDocument {
  id: string
  employee_id: string
  document_type: DocumentType | string
  name: string
  file_url?: string | null
  file_size?: number | null
  expiry_date?: string | null
  notes?: string | null
  created_at: string
  updated_at: string
  employee?: Employee | null
}

export interface CreateEmployeeDocumentInput {
  employee_id: string
  document_type: DocumentType | string
  name: string
  file_url?: string
  file_size?: number
  expiry_date?: string
  notes?: string
}

export interface UpdateEmployeeDocumentInput extends Partial<CreateEmployeeDocumentInput> {}

// ==================== LEAVE TYPE ====================
export interface LeaveType {
  id: string
  code: string
  name: string
  description?: string | null
  max_days_per_year?: number | null
  default_days?: number | null
  requires_approval?: boolean
  is_paid: boolean
  color?: string | null
  status: 'active' | 'inactive' | string
  created_at: string
  updated_at: string
}

export interface LeaveTypeFormData {
  code: string
  name: string
  description?: string
  max_days_per_year?: number
  default_days?: number
  requires_approval?: boolean
  is_paid?: boolean
  color?: string
  status?: string
  max_consecutive_days?: number
}

export interface CreateLeaveTypeInput {
  code: string
  name: string
  description?: string
  max_days_per_year?: number
  is_paid?: boolean
  status?: 'active' | 'inactive'
}

export interface UpdateLeaveTypeInput extends Partial<CreateLeaveTypeInput> {}

// ==================== LEAVE REQUEST ====================
export type LeaveRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'

export interface LeaveRequest {
  id: string
  request_number?: string
  employee_id: string
  leave_type_id: string
  start_date: string
  end_date: string
  days_count?: number
  total_days?: number
  reason?: string | null
  status: LeaveRequestStatus | string
  approved_by?: string | null
  approved_at?: string | null
  approval_notes?: string | null
  rejection_reason?: string | null
  is_half_day?: boolean
  created_at: string
  updated_at: string
  employee?: { id: string; code?: string; full_name: string } | null
  leave_type?: { id: string; name: string; color?: string } | null
  approver?: { id: string; code?: string; full_name: string } | null
}

export interface LeaveRequestFormData {
  employee_id: string
  leave_type_id: string
  start_date: string
  end_date: string
  days_count?: number
  total_days?: number
  reason?: string
  is_half_day?: boolean
}

export interface CreateLeaveRequestInput {
  employee_id: string
  leave_type_id: string
  start_date: string
  end_date: string
  reason?: string
}

export interface UpdateLeaveRequestInput {
  start_date?: string
  end_date?: string
  reason?: string
  status?: LeaveRequestStatus
  rejection_reason?: string
}

// ==================== ATTENDANCE ====================
export type AttendanceStatus = 'present' | 'absent' | 'late' | 'early_leave' | 'on_leave' | string

export interface Attendance {
  id: string
  employee_id: string
  date: string
  check_in_time?: string | null
  check_out_time?: string | null
  check_in?: string | null
  check_out?: string | null
  working_minutes?: number | null
  overtime_minutes?: number | null
  working_hours?: number | null
  overtime_hours?: number | null
  status: AttendanceStatus
  notes?: string | null
  created_at: string
  updated_at: string
  employee?: {
    id: string
    code?: string
    full_name: string
    department?: { name: string } | null
  } | null
}

export interface AttendanceFormData {
  employee_id: string
  date: string
  check_in_time?: string
  check_out_time?: string
  check_in?: string
  check_out?: string
  working_minutes?: number
  overtime_minutes?: number
  status?: string
  notes?: string
}

export interface CreateAttendanceInput {
  employee_id: string
  date: string
  check_in?: string
  check_out?: string
  status?: AttendanceStatus
  notes?: string
}

export interface UpdateAttendanceInput extends Partial<CreateAttendanceInput> {}

// ==================== SALARY GRADE ====================
export interface SalaryGrade {
  id: string
  code: string
  name: string
  level: number
  base_salary: number
  min_salary?: number | null
  max_salary?: number | null
  description?: string | null
  status: 'active' | 'inactive' | string
  created_at: string
  updated_at: string
}

export interface SalaryGradeFormData {
  code: string
  name: string
  level: number
  base_salary: number
  min_salary?: number
  max_salary?: number
  description?: string
  status?: string
  allowance_rate?: number
}

export interface CreateSalaryGradeInput {
  code: string
  name: string
  level: number
  base_salary: number
  min_salary?: number
  max_salary?: number
  description?: string
  status?: 'active' | 'inactive'
}

export interface UpdateSalaryGradeInput extends Partial<CreateSalaryGradeInput> {}

// ==================== PAYROLL PERIOD ====================
export type PayrollPeriodStatus = 'draft' | 'processing' | 'confirmed' | 'paid' | 'completed' | 'cancelled' | string

export interface PayrollPeriod {
  id: string
  code: string
  name: string
  year: number
  month: number
  start_date: string
  end_date: string
  status: PayrollPeriodStatus
  total_employees?: number | null
  total_amount?: number | null
  created_by: string
  confirmed_by?: string | null
  confirmed_at?: string | null
  payment_date?: string | null
  notes?: string | null
  created_at: string
  updated_at: string
  creator?: { id: string; full_name: string } | null
  confirmer?: { id: string; full_name: string } | null
}

export interface PayrollPeriodFormData {
  code: string
  name: string
  year: number
  month: number
  start_date: string
  end_date: string
  status?: string
  payment_date?: string
  notes?: string
}

// ==================== PAYSLIP ====================
export interface Payslip {
  id: string
  payslip_number: string
  payroll_period_id: string
  employee_id: string
  employee_code: string
  employee_name: string
  department_name?: string | null
  position_name?: string | null
  salary_grade_name?: string | null
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
  status: 'draft' | 'confirmed' | 'paid' | string
  notes?: string | null
  created_at: string
  updated_at: string
  employee?: { id: string; code: string; full_name: string } | null
  payroll_period?: PayrollPeriod | null
}

// ==================== PAYROLL (Legacy) ====================
export type PayrollStatus = 'draft' | 'pending' | 'approved' | 'paid'

export interface Payroll {
  id: string
  employee_id: string
  period_month: number
  period_year: number
  basic_salary: number
  allowances?: number
  deductions?: number
  net_salary: number
  status: PayrollStatus
  paid_at?: string | null
  notes?: string | null
  created_at: string
  updated_at: string
  employee?: Employee | null
}

export interface CreatePayrollInput {
  employee_id: string
  period_month: number
  period_year: number
  basic_salary: number
  allowances?: number
  deductions?: number
  notes?: string
}

export interface UpdatePayrollInput extends Partial<CreatePayrollInput> {
  status?: PayrollStatus
}

// ==================== PERFORMANCE REVIEW ====================
export interface PerformanceReview {
  id: string
  employee_id: string
  reviewer_id: string
  period_type?: 'monthly' | 'quarterly' | 'yearly' | string
  review_date: string
  start_date?: string | null
  end_date?: string | null
  overall_score?: number | null
  rating?: 'excellent' | 'good' | 'average' | 'below_average' | 'poor' | string | null
  strengths?: string | null
  weaknesses?: string | null
  goals?: string | null
  comments?: string | null
  status?: 'draft' | 'submitted' | 'approved' | string
  created_at: string
  updated_at: string
  employee?: { id: string; code?: string; full_name: string } | null
  reviewer?: { id: string; full_name: string } | null
}

// ==================== TASK ====================
export type TaskStatus = 
  | 'new' 
  | 'draft'
  | 'in_progress' 
  | 'pending_review' 
  | 'completed' 
  | 'finished'
  | 'accepted'
  | 'cancelled' 
  | 'on_hold'
  | 'paused'

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'
export type ProgressMode = 'manual' | 'auto_status' | 'auto_subtasks' | 'auto_time'

export interface Task {
  id: string
  code: string
  name: string
  title?: string
  description?: string | null
  department_id?: string | null
  assignee_id?: string | null
  assigner_id?: string | null
  parent_id?: string | null
  parent_task_id?: string | null
  project_id?: string | null
  status: TaskStatus | string
  priority: TaskPriority | string
  progress: number
  progress_mode: ProgressMode | string
  evaluation_status?: string | null
  start_date?: string | null
  due_date?: string | null
  completed_at?: string | null
  completed_date?: string | null
  final_score?: number | null
  final_rating?: string | null
  created_at: string
  updated_at: string
  department?: Department | null
  assignee?: Employee | null
  assigner?: Employee | null
  parent?: Task | null
  parent_task?: Task | null
  subtasks?: Task[]
  _count?: { subtasks: number; comments: number; attachments: number }
}

export interface CreateTaskInput {
  name: string
  title?: string
  description?: string
  department_id?: string
  assignee_id?: string
  assigner_id?: string
  parent_id?: string
  parent_task_id?: string
  project_id?: string
  status?: TaskStatus
  priority?: TaskPriority
  progress?: number
  progress_mode?: ProgressMode
  start_date?: string
  due_date?: string
}

export interface UpdateTaskInput extends Partial<CreateTaskInput> {}

export interface TaskFilters {
  status?: TaskStatus | TaskStatus[] | string
  priority?: TaskPriority | TaskPriority[] | string
  department_id?: string
  assignee_id?: string
  assigner_id?: string
  parent_id?: string | null
  from_date?: string
  to_date?: string
  search?: string
}

// ==================== TASK STATUS LABELS & COLORS ====================
export const TASK_STATUS_LABELS: Record<string, string> = {
  new: 'Mới',
  draft: 'Nháp',
  in_progress: 'Đang làm',
  pending_review: 'Chờ duyệt',
  completed: 'Hoàn thành',
  finished: 'Hoàn thành',
  accepted: 'Đã duyệt',
  cancelled: 'Đã hủy',
  on_hold: 'Tạm dừng',
  paused: 'Tạm dừng',
}

export const TASK_STATUS_COLORS: Record<string, string> = {
  new: 'gray',
  draft: 'gray',
  in_progress: 'blue',
  pending_review: 'yellow',
  completed: 'green',
  finished: 'green',
  accepted: 'emerald',
  cancelled: 'red',
  on_hold: 'orange',
  paused: 'yellow',
}

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'Thấp',
  medium: 'Trung bình',
  high: 'Cao',
  urgent: 'Khẩn cấp',
}

export const TASK_PRIORITY_COLORS: Record<TaskPriority, string> = {
  low: 'gray',
  medium: 'blue',
  high: 'orange',
  urgent: 'red',
}

// ==================== RE-EXPORT FROM OTHER TYPE FILES ====================
export * from './taskAssignment'
export * from './evaluation.types'