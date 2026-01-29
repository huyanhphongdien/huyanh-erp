// ============================================================================
// src/types/index.ts
// Huy Anh ERP System - Types Export
// ============================================================================
// Phase 3: HRM Module (3.1 - 3.4)
// Phase 4.1: Task Management
// Phase 4.2: Task Assignment
// Phase 4.3: Approval & Evaluation
// ============================================================================

// ==================== USER & AUTH ====================
export type UserRole = 'admin' | 'manager' | 'employee'

export interface User {
  id: string
  email: string
  full_name?: string
  avatar_url?: string
  
  // Employee linkage
  employee_id: string | null
  employee_code: string | null
  
  // Department info
  department_id: string | null
  department_name: string | null
  
  // Position info
  position_id: string | null
  position_name?: string | null      // ← THÊM MỚI
  position_level?: number | null     // ← THÊM MỚI
  
  // Role & permissions
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

// ==================== PHASE 3.1: DEPARTMENT ====================
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
  
  // Relations
  manager?: Employee | null
  parent?: Department | null
  children?: Department[]
  _count?: { employees: number }
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

// ==================== PHASE 3.1: POSITION ====================
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
  
  // Relations
  department?: Department | null
  _count?: { employees: number }
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

// ==================== PHASE 3.1: EMPLOYEE ====================
export type EmployeeStatus = 'active' | 'inactive' | 'on_leave' | 'terminated'
export type Gender = 'male' | 'female' | 'other'

export interface Employee {
  id: string
  code: string
  full_name: string
  email?: string | null
  phone?: string | null
  avatar_url?: string | null
  
  // Personal info
  date_of_birth?: string | null
  gender?: Gender | null
  id_number?: string | null
  address?: string | null
  
  // Work info
  department_id?: string | null
  position_id?: string | null
  manager_id?: string | null
  hire_date?: string | null
  
  status: EmployeeStatus
  created_at: string
  updated_at: string
  
  // Relations
  department?: Department | null
  position?: Position | null
  manager?: Employee | null
  user?: { id: string; email: string } | null
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

// ==================== PHASE 3.2: CONTRACT TYPE ====================
export interface ContractType {
  id: string
  code: string
  name: string
  description?: string | null
  duration_months?: number | null
  is_permanent: boolean
  status: 'active' | 'inactive'
  created_at: string
  updated_at: string
}

export interface CreateContractTypeInput {
  code: string
  name: string
  description?: string
  duration_months?: number
  is_permanent?: boolean
  status?: 'active' | 'inactive'
}

export interface UpdateContractTypeInput extends Partial<CreateContractTypeInput> {}

// ==================== PHASE 3.2: CONTRACT ====================
export type ContractStatus = 'draft' | 'active' | 'expired' | 'terminated'

export interface Contract {
  id: string
  code: string
  employee_id: string
  contract_type_id: string
  start_date: string
  end_date?: string | null
  salary?: number | null
  status: ContractStatus
  notes?: string | null
  created_at: string
  updated_at: string
  
  // Relations
  employee?: Employee | null
  contract_type?: ContractType | null
}

export interface CreateContractInput {
  code: string
  employee_id: string
  contract_type_id: string
  start_date: string
  end_date?: string
  salary?: number
  status?: ContractStatus
  notes?: string
}

export interface UpdateContractInput extends Partial<CreateContractInput> {}

// ==================== PHASE 3.2: EMPLOYEE DOCUMENT ====================
export type DocumentType = 'id_card' | 'passport' | 'degree' | 'certificate' | 'contract' | 'other'

export interface EmployeeDocument {
  id: string
  employee_id: string
  document_type: DocumentType
  name: string
  file_url?: string | null
  file_size?: number | null
  expiry_date?: string | null
  notes?: string | null
  created_at: string
  updated_at: string
  
  // Relations
  employee?: Employee | null
}

export interface CreateEmployeeDocumentInput {
  employee_id: string
  document_type: DocumentType
  name: string
  file_url?: string
  file_size?: number
  expiry_date?: string
  notes?: string
}

export interface UpdateEmployeeDocumentInput extends Partial<CreateEmployeeDocumentInput> {}

// ==================== PHASE 3.3: LEAVE TYPE ====================
export interface LeaveType {
  id: string
  code: string
  name: string
  description?: string | null
  max_days_per_year?: number | null
  is_paid: boolean
  status: 'active' | 'inactive'
  created_at: string
  updated_at: string
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

// ==================== PHASE 3.3: LEAVE REQUEST ====================
export type LeaveRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'

export interface LeaveRequest {
  id: string
  employee_id: string
  leave_type_id: string
  start_date: string
  end_date: string
  days_count: number
  reason?: string | null
  status: LeaveRequestStatus
  approved_by?: string | null
  approved_at?: string | null
  rejection_reason?: string | null
  created_at: string
  updated_at: string
  
  // Relations
  employee?: Employee | null
  leave_type?: LeaveType | null
  approver?: Employee | null
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

// ==================== PHASE 3.3: ATTENDANCE ====================
export type AttendanceStatus = 'present' | 'absent' | 'late' | 'early_leave' | 'on_leave'

export interface Attendance {
  id: string
  employee_id: string
  date: string
  check_in?: string | null
  check_out?: string | null
  status: AttendanceStatus
  notes?: string | null
  created_at: string
  updated_at: string
  
  // Relations
  employee?: Employee | null
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

// ==================== PHASE 3.4: SALARY GRADE ====================
export interface SalaryGrade {
  id: string
  code: string
  name: string
  min_salary: number
  max_salary: number
  description?: string | null
  status: 'active' | 'inactive'
  created_at: string
  updated_at: string
}

export interface CreateSalaryGradeInput {
  code: string
  name: string
  min_salary: number
  max_salary: number
  description?: string
  status?: 'active' | 'inactive'
}

export interface UpdateSalaryGradeInput extends Partial<CreateSalaryGradeInput> {}

// ==================== PHASE 3.4: PAYROLL ====================
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
  
  // Relations
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

// ==================== PHASE 4.1: TASK ====================
export type TaskStatus = 
  | 'new' 
  | 'in_progress' 
  | 'pending_review' 
  | 'completed' 
  | 'accepted'
  | 'cancelled' 
  | 'on_hold'

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'

export type ProgressMode = 'manual' | 'auto_status' | 'auto_subtasks'

export interface Task {
  id: string
  code: string
  name: string
  description?: string | null
  
  // Assignment
  department_id?: string | null
  assignee_id?: string | null
  assigner_id?: string | null
  
  // Hierarchy
  parent_id?: string | null
  
  // Status & Progress
  status: TaskStatus
  priority: TaskPriority
  progress: number
  progress_mode: ProgressMode
  
  // Dates
  start_date?: string | null
  due_date?: string | null
  completed_at?: string | null
  
  created_at: string
  updated_at: string
  
  // Relations
  department?: Department | null
  assignee?: Employee | null
  assigner?: Employee | null
  parent?: Task | null
  subtasks?: Task[]
  _count?: { subtasks: number; comments: number; attachments: number }
}

export interface CreateTaskInput {
  name: string
  description?: string
  department_id?: string
  assignee_id?: string
  assigner_id?: string
  parent_id?: string
  status?: TaskStatus
  priority?: TaskPriority
  progress?: number
  progress_mode?: ProgressMode
  start_date?: string
  due_date?: string
}

export interface UpdateTaskInput extends Partial<CreateTaskInput> {}

export interface TaskFilters {
  status?: TaskStatus
  priority?: TaskPriority
  department_id?: string
  assignee_id?: string
  assigner_id?: string
  parent_id?: string | null
  from_date?: string
  to_date?: string
  search?: string
}

// ==================== PHASE 4.1: TASK STATUS LABELS & COLORS ====================
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  new: 'Mới',
  in_progress: 'Đang làm',
  pending_review: 'Chờ duyệt',
  completed: 'Hoàn thành',
  accepted: 'Đã duyệt',
  cancelled: 'Đã hủy',
  on_hold: 'Tạm dừng',
}

export const TASK_STATUS_COLORS: Record<TaskStatus, string> = {
  new: 'gray',
  in_progress: 'blue',
  pending_review: 'yellow',
  completed: 'green',
  accepted: 'emerald',
  cancelled: 'red',
  on_hold: 'orange',
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

// Phase 4.2: Task Assignment
export * from './taskAssignment'

// Phase 4.3: Evaluation & Approval
export * from './evaluation.types'