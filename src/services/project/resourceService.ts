// ============================================================================
// FILE: src/services/project/resourceService.ts
// MODULE: Quản lý Dự án (Project Management) — Huy Anh Rubber ERP
// PHASE: PM5 — Bước 5.1 (resourceService)
// MÔ TẢ: Quản lý thành viên dự án, phân bổ nguồn lực, workload, capacity
// BẢNG: project_members, projects, employees, departments
// PATTERN: async/await, Supabase, CRUD + business logic
// ============================================================================

import { supabase } from '../../lib/supabase'

// ============================================================================
// TYPES
// ============================================================================

/** Vai trò thành viên trong dự án */
export type ProjectMemberRole =
  | 'owner'       // Chủ dự án (PM)
  | 'co_owner'    // Đồng quản lý
  | 'lead'        // Trưởng nhóm / trưởng phase
  | 'member'      // Thành viên thường
  | 'reviewer'    // Người review / approve deliverables
  | 'observer'    // Chỉ xem (read-only)

/** Thành viên dự án — row từ project_members JOIN employees */
export interface ProjectMember {
  id: string
  project_id: string
  employee_id: string
  role: ProjectMemberRole
  allocation_pct: number          // % thời gian dành cho DA (0-100+)
  start_date: string | null
  end_date: string | null
  responsibility: string | null
  is_active: boolean
  joined_at: string
  left_at: string | null
  // Joined fields
  employee?: {
    id: string
    full_name: string
    employee_code: string
    email: string | null
    phone: string | null
    avatar_url: string | null
    department?: {
      id: string
      name: string
    }
    position?: {
      id: string
      name: string
    }
  }
  project?: {
    id: string
    code: string
    name: string
    status: string
    planned_start: string | null
    planned_end: string | null
  }
}

/** Form data khi thêm thành viên */
export interface AddMemberInput {
  project_id: string
  employee_id: string
  role?: ProjectMemberRole
  allocation_pct?: number
  start_date?: string | null
  end_date?: string | null
  responsibility?: string | null
}

/** Form data khi cập nhật thành viên */
export interface UpdateMemberInput {
  role?: ProjectMemberRole
  allocation_pct?: number
  start_date?: string | null
  end_date?: string | null
  responsibility?: string | null
  is_active?: boolean
}

/** Workload tổng hợp 1 nhân viên */
export interface EmployeeWorkload {
  employee_id: string
  employee_name: string
  employee_code: string
  department_name: string
  position_name: string
  avatar_url: string | null
  total_allocation_pct: number
  project_count: number
  projects: Array<{
    project_id: string
    project_code: string
    project_name: string
    project_status: string
    role: ProjectMemberRole
    allocation_pct: number
    start_date: string | null
    end_date: string | null
  }>
  is_overallocated: boolean
}

/** Capacity tổng hợp phòng ban */
export interface DepartmentCapacity {
  department_id: string
  department_name: string
  total_employees: number
  allocated_employees: number
  available_employees: number
  overallocated_employees: number
  avg_allocation_pct: number
  employees: EmployeeWorkload[]
}

/** Params cho getMembers */
export interface GetMembersParams {
  project_id: string
  role?: ProjectMemberRole | 'all'
  is_active?: boolean | 'all'
  search?: string
}

// ============================================================================
// CONSTANTS
// ============================================================================

export const MEMBER_ROLE_LABELS: Record<ProjectMemberRole, string> = {
  owner: 'Chủ dự án (PM)',
  co_owner: 'Đồng quản lý',
  lead: 'Trưởng nhóm',
  member: 'Thành viên',
  reviewer: 'Người review',
  observer: 'Quan sát viên',
}

export const MEMBER_ROLE_COLORS: Record<ProjectMemberRole, string> = {
  owner: 'bg-purple-50 text-purple-700 border-purple-200',
  co_owner: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  lead: 'bg-blue-50 text-blue-700 border-blue-200',
  member: 'bg-green-50 text-green-700 border-green-200',
  reviewer: 'bg-amber-50 text-amber-700 border-amber-200',
  observer: 'bg-gray-50 text-gray-600 border-gray-200',
}

/** Allocation heatmap colors */
export const ALLOCATION_COLORS = {
  free: 'bg-gray-100 text-gray-500',       // 0%
  low: 'bg-green-100 text-green-700',      // 1-50%
  medium: 'bg-blue-100 text-blue-700',     // 51-80%
  high: 'bg-amber-100 text-amber-700',     // 81-100%
  over: 'bg-red-100 text-red-700',         // >100%
} as const

/** Select string cho project_members JOIN employees + dept + position */
const MEMBER_SELECT = `
  *,
  employee:employees(
    id, full_name, employee_code:code, email, phone, avatar_url,
    department:departments!employees_department_id_fkey(id, name),
    position:positions(id, name)
  )
`

/** Select cho member + project info (dùng cho workload) */
const MEMBER_WITH_PROJECT_SELECT = `
  *,
  employee:employees(
    id, full_name, employee_code:code, email, phone, avatar_url,
    department:departments!employees_department_id_fkey(id, name),
    position:positions(id, name)
  ),
  project:projects(
    id, code, name, status, planned_start, planned_end
  )
`

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Lấy allocation color class dựa theo %
 */
export function getAllocationColor(pct: number): string {
  if (pct <= 0) return ALLOCATION_COLORS.free
  if (pct <= 50) return ALLOCATION_COLORS.low
  if (pct <= 80) return ALLOCATION_COLORS.medium
  if (pct <= 100) return ALLOCATION_COLORS.high
  return ALLOCATION_COLORS.over
}

/**
 * Lấy allocation level text
 */
export function getAllocationLevel(pct: number): string {
  if (pct <= 0) return 'Trống'
  if (pct <= 50) return 'Thấp'
  if (pct <= 80) return 'Trung bình'
  if (pct <= 100) return 'Cao'
  return 'Quá tải!'
}

// ============================================================================
// SERVICE
// ============================================================================

const resourceService = {

  // --------------------------------------------------------------------------
  // THÊM THÀNH VIÊN VÀO DỰ ÁN
  // --------------------------------------------------------------------------
  async addMember(input: AddMemberInput): Promise<ProjectMember> {
    const {
      project_id,
      employee_id,
      role = 'member',
      allocation_pct = 100,
      start_date = null,
      end_date = null,
      responsibility = null,
    } = input

    // 1. Kiểm tra đã là thành viên chưa (bao gồm cả inactive)
    const { data: existing } = await supabase
      .from('project_members')
      .select('id, is_active')
      .eq('project_id', project_id)
      .eq('employee_id', employee_id)
      .maybeSingle()

    if (existing) {
      if (existing.is_active) {
        throw new Error('Nhân viên đã là thành viên dự án này')
      }
      // Re-activate nếu đã từng rời
      const { data, error } = await supabase
        .from('project_members')
        .update({
          role,
          allocation_pct,
          start_date,
          end_date,
          responsibility,
          is_active: true,
          left_at: null,
          joined_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select(MEMBER_SELECT)
        .single()

      if (error) throw error
      return data as ProjectMember
    }

    // 2. Thêm mới
    const { data, error } = await supabase
      .from('project_members')
      .insert({
        project_id,
        employee_id,
        role,
        allocation_pct,
        start_date,
        end_date,
        responsibility,
      })
      .select(MEMBER_SELECT)
      .single()

    if (error) throw error
    return data as ProjectMember
  },

  // --------------------------------------------------------------------------
  // XÓA (DEACTIVATE) THÀNH VIÊN
  // --------------------------------------------------------------------------
  async removeMember(member_id: string): Promise<void> {
    const { error } = await supabase
      .from('project_members')
      .update({
        is_active: false,
        left_at: new Date().toISOString(),
      })
      .eq('id', member_id)

    if (error) throw error
  },

  /**
   * Xóa cứng — chỉ dùng cho trường hợp thêm nhầm
   */
  async deleteMember(member_id: string): Promise<void> {
    const { error } = await supabase
      .from('project_members')
      .delete()
      .eq('id', member_id)

    if (error) throw error
  },

  // --------------------------------------------------------------------------
  // CẬP NHẬT THÔNG TIN THÀNH VIÊN
  // --------------------------------------------------------------------------
  async updateMember(
    member_id: string,
    input: UpdateMemberInput
  ): Promise<ProjectMember> {
    const { data, error } = await supabase
      .from('project_members')
      .update(input)
      .eq('id', member_id)
      .select(MEMBER_SELECT)
      .single()

    if (error) throw error
    return data as ProjectMember
  },

  // --------------------------------------------------------------------------
  // CẬP NHẬT ALLOCATION
  // --------------------------------------------------------------------------
  async updateAllocation(
    member_id: string,
    allocation_pct: number,
    start_date?: string | null,
    end_date?: string | null
  ): Promise<ProjectMember> {
    const updateData: Record<string, unknown> = { allocation_pct }
    if (start_date !== undefined) updateData.start_date = start_date
    if (end_date !== undefined) updateData.end_date = end_date

    const { data, error } = await supabase
      .from('project_members')
      .update(updateData)
      .eq('id', member_id)
      .select(MEMBER_SELECT)
      .single()

    if (error) throw error
    return data as ProjectMember
  },

  // --------------------------------------------------------------------------
  // LẤY DS THÀNH VIÊN DỰ ÁN
  // --------------------------------------------------------------------------
  async getMembers(params: GetMembersParams): Promise<ProjectMember[]> {
    const { project_id, role = 'all', is_active = true, search } = params

    let query = supabase
      .from('project_members')
      .select(MEMBER_SELECT)
      .eq('project_id', project_id)
      .order('role', { ascending: true })
      .order('joined_at', { ascending: true })

    // Filter role
    if (role !== 'all') {
      query = query.eq('role', role)
    }

    // Filter active
    if (is_active !== 'all') {
      query = query.eq('is_active', is_active)
    }

    const { data, error } = await query

    if (error) throw error

    let members = (data || []) as ProjectMember[]

    // Search theo tên nhân viên
    if (search) {
      const keyword = search.toLowerCase()
      members = members.filter(
        (m) =>
          m.employee?.full_name?.toLowerCase().includes(keyword) ||
          m.employee?.employee_code?.toLowerCase().includes(keyword) ||
          m.employee?.email?.toLowerCase().includes(keyword)
      )
    }

    return members
  },

  // --------------------------------------------------------------------------
  // LẤY 1 MEMBER BY ID
  // --------------------------------------------------------------------------
  async getMemberById(member_id: string): Promise<ProjectMember | null> {
    const { data, error } = await supabase
      .from('project_members')
      .select(MEMBER_SELECT)
      .eq('id', member_id)
      .maybeSingle()

    if (error) throw error
    return data as ProjectMember | null
  },

  // --------------------------------------------------------------------------
  // WORKLOAD TỔNG HỢP 1 NHÂN VIÊN
  // Tổng hợp allocation_pct từ TẤT CẢ dự án đang active
  // --------------------------------------------------------------------------
  async getEmployeeWorkload(
    employee_id: string,
    from_date?: string,
    to_date?: string
  ): Promise<EmployeeWorkload> {
    // Lấy info nhân viên
    const { data: emp, error: empError } = await supabase
      .from('employees')
      .select(`
        id, full_name, employee_code:code, avatar_url,
        department:departments!employees_department_id_fkey(id, name),
        position:positions(id, name)
      `)
      .eq('id', employee_id)
      .single()

    if (empError) throw empError

    // Lấy tất cả project memberships active
    let query = supabase
      .from('project_members')
      .select(MEMBER_WITH_PROJECT_SELECT)
      .eq('employee_id', employee_id)
      .eq('is_active', true)

    const { data: memberships, error: memError } = await query

    if (memError) throw memError

    const activeMemberships = (memberships || []) as ProjectMember[]

    // Filter theo khoảng thời gian nếu có
    const filtered = activeMemberships.filter((m) => {
      // Chỉ tính dự án đang in_progress hoặc planning/approved
      const projectStatus = m.project?.status
      if (!['planning', 'approved', 'in_progress'].includes(projectStatus || '')) {
        return false
      }

      // Filter theo date range
      if (from_date && m.end_date && m.end_date < from_date) return false
      if (to_date && m.start_date && m.start_date > to_date) return false

      return true
    })

    const total_allocation_pct = filtered.reduce(
      (sum, m) => sum + (m.allocation_pct || 0),
      0
    )

    return {
      employee_id: emp.id,
      employee_name: emp.full_name,
      employee_code: emp.employee_code,
      department_name: (emp.department as any)?.name || '',
      position_name: (emp.position as any)?.name || '',
      avatar_url: emp.avatar_url,
      total_allocation_pct,
      project_count: filtered.length,
      projects: filtered.map((m) => ({
        project_id: m.project?.id || '',
        project_code: m.project?.code || '',
        project_name: m.project?.name || '',
        project_status: m.project?.status || '',
        role: m.role,
        allocation_pct: m.allocation_pct,
        start_date: m.start_date,
        end_date: m.end_date,
      })),
      is_overallocated: total_allocation_pct > 100,
    }
  },

  // --------------------------------------------------------------------------
  // DS NHÂN VIÊN QUÁ TẢI (tổng allocation > threshold)
  // --------------------------------------------------------------------------
  async getOverallocated(
    threshold_pct: number = 100
  ): Promise<EmployeeWorkload[]> {
    // Lấy tất cả project_members active trong DA đang chạy
    const { data: allMembers, error } = await supabase
      .from('project_members')
      .select(`
        employee_id,
        allocation_pct,
        role,
        start_date,
        end_date,
        project:projects(id, code, name, status)
      `)
      .eq('is_active', true)

    if (error) throw error

    // Filter chỉ DA đang active
    const activeMembers = (allMembers || []).filter((m) => {
      const status = (m.project as any)?.status
      return ['planning', 'approved', 'in_progress'].includes(status)
    })

    // Group theo employee_id → tính tổng allocation
    const employeeMap = new Map<
      string,
      {
        total: number
        projects: Array<{
          project_id: string
          project_code: string
          project_name: string
          project_status: string
          role: ProjectMemberRole
          allocation_pct: number
          start_date: string | null
          end_date: string | null
        }>
      }
    >()

    for (const m of activeMembers) {
      const empId = m.employee_id
      if (!employeeMap.has(empId)) {
        employeeMap.set(empId, { total: 0, projects: [] })
      }
      const entry = employeeMap.get(empId)!
      entry.total += m.allocation_pct || 0
      entry.projects.push({
        project_id: (m.project as any)?.id || '',
        project_code: (m.project as any)?.code || '',
        project_name: (m.project as any)?.name || '',
        project_status: (m.project as any)?.status || '',
        role: m.role as ProjectMemberRole,
        allocation_pct: m.allocation_pct,
        start_date: m.start_date,
        end_date: m.end_date,
      })
    }

    // Filter > threshold
    const overIds = Array.from(employeeMap.entries())
      .filter(([, v]) => v.total > threshold_pct)
      .map(([empId]) => empId)

    if (overIds.length === 0) return []

    // Lấy employee info
    const { data: employees, error: empError } = await supabase
      .from('employees')
      .select(`
        id, full_name, employee_code:code, avatar_url,
        department:departments!employees_department_id_fkey(id, name),
        position:positions(id, name)
      `)
      .in('id', overIds)

    if (empError) throw empError

    return (employees || []).map((emp) => {
      const entry = employeeMap.get(emp.id)!
      return {
        employee_id: emp.id,
        employee_name: emp.full_name,
        employee_code: emp.employee_code,
        department_name: (emp.department as any)?.name || '',
        position_name: (emp.position as any)?.name || '',
        avatar_url: emp.avatar_url,
        total_allocation_pct: entry.total,
        project_count: entry.projects.length,
        projects: entry.projects,
        is_overallocated: true,
      }
    }).sort((a, b) => b.total_allocation_pct - a.total_allocation_pct)
  },

  // --------------------------------------------------------------------------
  // CAPACITY PHÒNG BAN
  // Tổng hợp workload tất cả NV trong 1 phòng ban
  // --------------------------------------------------------------------------
  async getDepartmentCapacity(
    department_id: string,
    from_date?: string,
    to_date?: string
  ): Promise<DepartmentCapacity> {
    // 1. Lấy tất cả NV trong phòng ban (active)
    const { data: employees, error: empError } = await supabase
      .from('employees')
      .select(`
        id, full_name, employee_code:code, avatar_url,
        department:departments!employees_department_id_fkey(id, name),
        position:positions(id, name)
      `)
      .eq('department_id', department_id)
      .eq('status', 'active')

    if (empError) throw empError

    const empList = employees || []
    if (empList.length === 0) {
      // Lấy tên phòng ban
      const { data: dept } = await supabase
        .from('departments')
        .select('id, name')
        .eq('id', department_id)
        .single()

      return {
        department_id,
        department_name: dept?.name || '',
        total_employees: 0,
        allocated_employees: 0,
        available_employees: 0,
        overallocated_employees: 0,
        avg_allocation_pct: 0,
        employees: [],
      }
    }

    const empIds = empList.map((e) => e.id)

    // 2. Lấy tất cả memberships của các NV này
    const { data: allMemberships, error: memError } = await supabase
      .from('project_members')
      .select(`
        employee_id,
        allocation_pct,
        role,
        start_date,
        end_date,
        is_active,
        project:projects(id, code, name, status)
      `)
      .in('employee_id', empIds)
      .eq('is_active', true)

    if (memError) throw memError

    // 3. Group theo employee_id
    const empAllocationMap = new Map<
      string,
      Array<{
        project_id: string
        project_code: string
        project_name: string
        project_status: string
        role: ProjectMemberRole
        allocation_pct: number
        start_date: string | null
        end_date: string | null
      }>
    >()

    for (const m of allMemberships || []) {
      const status = (m.project as any)?.status
      if (!['planning', 'approved', 'in_progress'].includes(status)) continue

      // Filter theo date range
      if (from_date && m.end_date && m.end_date < from_date) continue
      if (to_date && m.start_date && m.start_date > to_date) continue

      const empId = m.employee_id
      if (!empAllocationMap.has(empId)) {
        empAllocationMap.set(empId, [])
      }
      empAllocationMap.get(empId)!.push({
        project_id: (m.project as any)?.id || '',
        project_code: (m.project as any)?.code || '',
        project_name: (m.project as any)?.name || '',
        project_status: (m.project as any)?.status || '',
        role: m.role as ProjectMemberRole,
        allocation_pct: m.allocation_pct,
        start_date: m.start_date,
        end_date: m.end_date,
      })
    }

    // 4. Build workload per employee
    const workloads: EmployeeWorkload[] = empList.map((emp) => {
      const projects = empAllocationMap.get(emp.id) || []
      const total = projects.reduce((sum, p) => sum + p.allocation_pct, 0)
      return {
        employee_id: emp.id,
        employee_name: emp.full_name,
        employee_code: emp.employee_code,
        department_name: (emp.department as any)?.name || '',
        position_name: (emp.position as any)?.name || '',
        avatar_url: emp.avatar_url,
        total_allocation_pct: total,
        project_count: projects.length,
        projects,
        is_overallocated: total > 100,
      }
    })

    // 5. Tính summary
    const allocated = workloads.filter((w) => w.project_count > 0).length
    const over = workloads.filter((w) => w.is_overallocated).length
    const totalPct = workloads.reduce(
      (sum, w) => sum + w.total_allocation_pct,
      0
    )
    const avgPct = empList.length > 0 ? totalPct / empList.length : 0

    return {
      department_id,
      department_name: (empList[0]?.department as any)?.name || '',
      total_employees: empList.length,
      allocated_employees: allocated,
      available_employees: empList.length - allocated,
      overallocated_employees: over,
      avg_allocation_pct: Math.round(avgPct * 10) / 10,
      employees: workloads.sort(
        (a, b) => b.total_allocation_pct - a.total_allocation_pct
      ),
    }
  },

  // --------------------------------------------------------------------------
  // NHÂN VIÊN CÒN TRỐNG (chưa tham gia DA nào hoặc allocation < threshold)
  // Dùng khi PM muốn tìm người có thể assign
  // --------------------------------------------------------------------------
  async getAvailableEmployees(
    department_id?: string,
    max_allocation_pct: number = 80
  ): Promise<
    Array<{
      employee_id: string
      employee_name: string
      employee_code: string
      department_name: string
      position_name: string
      avatar_url: string | null
      current_allocation_pct: number
      available_pct: number
    }>
  > {
    // 1. Lấy NV active
    let empQuery = supabase
      .from('employees')
      .select(`
        id, full_name, employee_code:code, avatar_url,
        department:departments!employees_department_id_fkey(id, name),
        position:positions(id, name)
      `)
      .eq('status', 'active')

    if (department_id) {
      empQuery = empQuery.eq('department_id', department_id)
    }

    const { data: employees, error: empError } = await empQuery

    if (empError) throw empError

    const empList = employees || []
    if (empList.length === 0) return []

    const empIds = empList.map((e) => e.id)

    // 2. Lấy allocation hiện tại
    const { data: memberships, error: memError } = await supabase
      .from('project_members')
      .select(`
        employee_id,
        allocation_pct,
        project:projects(status)
      `)
      .in('employee_id', empIds)
      .eq('is_active', true)

    if (memError) throw memError

    // 3. Tính tổng allocation per employee
    const allocationMap = new Map<string, number>()
    for (const m of memberships || []) {
      const status = (m.project as any)?.status
      if (!['planning', 'approved', 'in_progress'].includes(status)) continue
      const empId = m.employee_id
      allocationMap.set(empId, (allocationMap.get(empId) || 0) + (m.allocation_pct || 0))
    }

    // 4. Filter NV còn capacity
    return empList
      .map((emp) => {
        const currentPct = allocationMap.get(emp.id) || 0
        return {
          employee_id: emp.id,
          employee_name: emp.full_name,
          employee_code: emp.employee_code,
          department_name: (emp.department as any)?.name || '',
          position_name: (emp.position as any)?.name || '',
          avatar_url: emp.avatar_url,
          current_allocation_pct: currentPct,
          available_pct: Math.max(0, 100 - currentPct),
        }
      })
      .filter((e) => e.current_allocation_pct <= max_allocation_pct)
      .sort((a, b) => a.current_allocation_pct - b.current_allocation_pct)
  },

  // --------------------------------------------------------------------------
  // THỐNG KÊ NHANH CHO PROJECT RESOURCE TAB
  // --------------------------------------------------------------------------
  async getProjectResourceStats(project_id: string): Promise<{
    total_members: number
    active_members: number
    by_role: Record<ProjectMemberRole, number>
    avg_allocation: number
    overallocated_count: number
  }> {
    const members = await this.getMembers({
      project_id,
      is_active: 'all',
    })

    const active = members.filter((m) => m.is_active)
    const byRole: Record<string, number> = {}
    let totalAlloc = 0

    for (const m of active) {
      byRole[m.role] = (byRole[m.role] || 0) + 1
      totalAlloc += m.allocation_pct || 0
    }

    // Check overallocated: cần lấy workload từng người
    let overCount = 0
    const checkedIds = new Set<string>()
    for (const m of active) {
      if (checkedIds.has(m.employee_id)) continue
      checkedIds.add(m.employee_id)
      try {
        const wl = await this.getEmployeeWorkload(m.employee_id)
        if (wl.is_overallocated) overCount++
      } catch {
        // Skip nếu lỗi
      }
    }

    return {
      total_members: members.length,
      active_members: active.length,
      by_role: byRole as Record<ProjectMemberRole, number>,
      avg_allocation:
        active.length > 0
          ? Math.round((totalAlloc / active.length) * 10) / 10
          : 0,
      overallocated_count: overCount,
    }
  },

  // --------------------------------------------------------------------------
  // SEARCH EMPLOYEES CHO ADD MEMBER MODAL
  // Trả về NV chưa thuộc DA hiện tại
  // --------------------------------------------------------------------------
  async searchEmployeesForProject(
    project_id: string,
    search: string,
    department_id?: string
  ): Promise<
    Array<{
      id: string
      full_name: string
      employee_code: string
      department_name: string
      position_name: string
      avatar_url: string | null
      current_allocation_pct: number
      already_member: boolean
    }>
  > {
    // 1. Lấy DS thành viên hiện tại
    const { data: currentMembers } = await supabase
      .from('project_members')
      .select('employee_id')
      .eq('project_id', project_id)
      .eq('is_active', true)

    const currentMemberIds = new Set(
      (currentMembers || []).map((m) => m.employee_id)
    )

    // 2. Search employees
    let empQuery = supabase
      .from('employees')
      .select(`
        id, full_name, employee_code:code, avatar_url,
        department:departments!employees_department_id_fkey(id, name),
        position:positions(id, name)
      `)
      .eq('status', 'active')
      .limit(20)

    if (department_id) {
      empQuery = empQuery.eq('department_id', department_id)
    }

    if (search) {
      empQuery = empQuery.or(
        `full_name.ilike.%${search}%,code.ilike.%${search}%`
      )
    }

    const { data: employees, error } = await empQuery

    if (error) throw error

    // 3. Lấy allocation hiện tại
    const empIds = (employees || []).map((e) => e.id)
    const { data: memberships } = await supabase
      .from('project_members')
      .select(`employee_id, allocation_pct, project:projects(status)`)
      .in('employee_id', empIds)
      .eq('is_active', true)

    const allocMap = new Map<string, number>()
    for (const m of memberships || []) {
      const status = (m.project as any)?.status
      if (!['planning', 'approved', 'in_progress'].includes(status)) continue
      allocMap.set(
        m.employee_id,
        (allocMap.get(m.employee_id) || 0) + (m.allocation_pct || 0)
      )
    }

    return (employees || []).map((emp) => ({
      id: emp.id,
      full_name: emp.full_name,
      employee_code: emp.employee_code,
      department_name: (emp.department as any)?.name || '',
      position_name: (emp.position as any)?.name || '',
      avatar_url: emp.avatar_url,
      current_allocation_pct: allocMap.get(emp.id) || 0,
      already_member: currentMemberIds.has(emp.id),
    }))
  },
}

export default resourceService