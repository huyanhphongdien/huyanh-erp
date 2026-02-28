// ============================================================================
// SHIFT TEAM SERVICE - Quản lý đội ca
// File: src/services/shiftTeamService.ts
// Huy Anh ERP System - Phân 3 ca ngắn cho 2 đội
// ============================================================================
// DB SCHEMA (actual):
// shift_teams: id, code, name, department_id, description, is_active,
//              created_at, updated_at, default_rotation_pattern, sort_order, created_by
// shift_team_members: id, team_id, employee_id, effective_from, effective_to,
//                     created_by, created_at
// ============================================================================

import { supabase } from '../lib/supabase'

// ============================================================================
// TYPES
// ============================================================================

export interface ShiftTeam {
  id: string
  code: string
  name: string
  department_id: string
  description: string | null
  default_rotation_pattern: any[] | null
  sort_order: number
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
  // Relations
  department?: {
    id: string
    code: string
    name: string
  }
  // Computed
  member_count?: number
}

export interface ShiftTeamMember {
  id: string
  team_id: string
  employee_id: string
  effective_from: string
  effective_to: string | null
  created_by: string | null
  created_at: string
  // Relations
  employee?: {
    id: string
    code: string
    full_name: string
    department_id: string
    department?: { id: string; code: string; name: string }
    position?: { id: string; name: string; level: number }
  }
  team?: {
    id: string
    code: string
    name: string
  }
}

export interface CreateTeamInput {
  code: string
  name: string
  department_id?: string
  description?: string
  default_rotation_pattern?: any[]
  sort_order?: number
  created_by?: string
}

export interface AddMemberInput {
  team_id: string
  employee_id: string
  effective_from?: string
  created_by?: string
}

export interface TransferMemberInput {
  employee_id: string
  from_team_id: string
  to_team_id: string
  effective_from?: string
  created_by?: string
}

// ============================================================================
// QUERIES — khớp 100% với FK constraints thực tế
// ============================================================================

const TEAM_SELECT = `
  *,
  department:departments!shift_teams_department_id_fkey(id, code, name)
`

// shift_team_members KHÔNG có cột notes, added_by, updated_at
// shift_teams KHÔNG có cột color
const MEMBER_SELECT = `
  *,
  employee:employees!shift_team_members_employee_id_fkey(
    id, code, full_name, department_id,
    department:departments!employees_department_id_fkey(id, code, name),
    position:positions!employees_position_id_fkey(id, name, level)
  ),
  team:shift_teams!shift_team_members_team_id_fkey(id, code, name)
`

// ============================================================================
// COLOR HELPER — vì DB không có cột color, hardcode theo team code
// ============================================================================
function getTeamColor(code: string): string {
  if (code?.includes('A') || code === 'TEAM_A') return '#3B82F6'
  if (code?.includes('B') || code === 'TEAM_B') return '#F59E0B'
  return '#6B7280'
}

// ============================================================================
// SERVICE
// ============================================================================

export const shiftTeamService = {

  // ── GET ALL TEAMS ──
  async getTeams(departmentId?: string): Promise<ShiftTeam[]> {
    let query = supabase
      .from('shift_teams')
      .select(TEAM_SELECT)
      .eq('is_active', true)
      .order('sort_order')
      .order('code')

    if (departmentId) {
      query = query.eq('department_id', departmentId)
    }

    const { data, error } = await query
    if (error) throw error
    return (data || []) as unknown as ShiftTeam[]
  },

  // ── GET TEAM BY ID ──
  async getTeamById(id: string): Promise<ShiftTeam | null> {
    const { data, error } = await supabase
      .from('shift_teams')
      .select(TEAM_SELECT)
      .eq('id', id)
      .maybeSingle()

    if (error) throw error
    return data as unknown as ShiftTeam | null
  },

  // ── CREATE TEAM ──
  async createTeam(input: CreateTeamInput): Promise<ShiftTeam> {
    const { data, error } = await supabase
      .from('shift_teams')
      .insert({
        code: input.code,
        name: input.name,
        department_id: input.department_id || null,
        description: input.description || null,
        default_rotation_pattern: input.default_rotation_pattern || null,
        sort_order: input.sort_order || 0,
        created_by: input.created_by || null
      })
      .select(TEAM_SELECT)
      .single()

    if (error) throw error
    return data as unknown as ShiftTeam
  },

  // ── UPDATE TEAM ──
  async updateTeam(id: string, input: Partial<CreateTeamInput>): Promise<ShiftTeam> {
    // Chỉ gửi các cột thực sự tồn tại trong DB
    const safeInput: Record<string, any> = {}
    if (input.code !== undefined) safeInput.code = input.code
    if (input.name !== undefined) safeInput.name = input.name
    if (input.department_id !== undefined) safeInput.department_id = input.department_id
    if (input.description !== undefined) safeInput.description = input.description
    if (input.default_rotation_pattern !== undefined) safeInput.default_rotation_pattern = input.default_rotation_pattern
    if (input.sort_order !== undefined) safeInput.sort_order = input.sort_order
    if (input.created_by !== undefined) safeInput.created_by = input.created_by

    const { data, error } = await supabase
      .from('shift_teams')
      .update(safeInput)
      .eq('id', id)
      .select(TEAM_SELECT)
      .single()

    if (error) throw error
    return data as unknown as ShiftTeam
  },

  // ── DEACTIVATE TEAM ──
  async deactivateTeam(id: string): Promise<void> {
    const { error } = await supabase
      .from('shift_teams')
      .update({ is_active: false })
      .eq('id', id)

    if (error) throw error
  },

  // ══════════════════════════════════════════════
  // MEMBERS
  // ══════════════════════════════════════════════

  // ── GET ACTIVE MEMBERS OF A TEAM ──
  async getTeamMembers(teamId: string): Promise<ShiftTeamMember[]> {
    const { data, error } = await supabase
      .from('shift_team_members')
      .select(MEMBER_SELECT)
      .eq('team_id', teamId)
      .is('effective_to', null)
      .order('created_at', { ascending: true })

    if (error) throw error
    return (data || []) as unknown as ShiftTeamMember[]
  },

  // ── GET ALL ACTIVE MEMBERS ──
  async getAllMembers(departmentId?: string): Promise<ShiftTeamMember[]> {
    const { data, error } = await supabase
      .from('shift_team_members')
      .select(MEMBER_SELECT)
      .is('effective_to', null)
      .order('created_at', { ascending: true })

    if (error) throw error

    const members = (data || []) as unknown as ShiftTeamMember[]

    if (departmentId) {
      return members.filter(m => {
        const emp = m.employee as any
        const dept = emp?.department
        const deptId = Array.isArray(dept) ? dept[0]?.id : dept?.id
        return deptId === departmentId
      })
    }

    return members
  },

  // ── ADD MEMBER ──
  async addMember(input: AddMemberInput): Promise<ShiftTeamMember> {
    const effectiveFrom = input.effective_from || new Date().toISOString().split('T')[0]

    // End any existing active membership in OTHER teams first
    await supabase
      .from('shift_team_members')
      .update({ effective_to: effectiveFrom })
      .eq('employee_id', input.employee_id)
      .is('effective_to', null)
      .neq('team_id', input.team_id)

    // Check if already active in THIS team
    const { data: existing } = await supabase
      .from('shift_team_members')
      .select('id')
      .eq('employee_id', input.employee_id)
      .eq('team_id', input.team_id)
      .is('effective_to', null)
      .maybeSingle()

    if (existing) {
      const { data } = await supabase
        .from('shift_team_members')
        .select(MEMBER_SELECT)
        .eq('id', existing.id)
        .single()
      return data as unknown as ShiftTeamMember
    }

    // Insert new — chỉ các cột tồn tại: team_id, employee_id, effective_from, created_by
    const { data, error } = await supabase
      .from('shift_team_members')
      .insert({
        team_id: input.team_id,
        employee_id: input.employee_id,
        effective_from: effectiveFrom,
        created_by: input.created_by || null
      })
      .select(MEMBER_SELECT)
      .single()

    if (error) throw error
    return data as unknown as ShiftTeamMember
  },

  // ── ADD MEMBERS IN BULK ──
  async addMembersInBulk(
    teamId: string,
    employeeIds: string[],
    effectiveFrom?: string,
    createdBy?: string
  ): Promise<{ added: number; skipped: number; errors: string[] }> {
    const date = effectiveFrom || new Date().toISOString().split('T')[0]
    let added = 0
    let skipped = 0
    const errors: string[] = []

    for (const empId of employeeIds) {
      try {
        // End existing active membership in OTHER teams
        await supabase
          .from('shift_team_members')
          .update({ effective_to: date })
          .eq('employee_id', empId)
          .is('effective_to', null)
          .neq('team_id', teamId)

        // Check if already in this team
        const { data: existing } = await supabase
          .from('shift_team_members')
          .select('id')
          .eq('employee_id', empId)
          .eq('team_id', teamId)
          .is('effective_to', null)
          .maybeSingle()

        if (existing) {
          skipped++
          continue
        }

        const { error } = await supabase
          .from('shift_team_members')
          .insert({
            team_id: teamId,
            employee_id: empId,
            effective_from: date,
            created_by: createdBy || null
          })

        if (error) {
          errors.push(`${empId}: ${error.message}`)
        } else {
          added++
        }
      } catch (err: any) {
        errors.push(`${empId}: ${err.message}`)
      }
    }

    return { added, skipped, errors }
  },

  // ── REMOVE MEMBER (soft) ──
  async removeMember(memberId: string): Promise<void> {
    const today = new Date().toISOString().split('T')[0]

    const { error } = await supabase
      .from('shift_team_members')
      .update({ effective_to: today })
      .eq('id', memberId)

    if (error) throw error
  },

  // ── TRANSFER MEMBER ──
  async transferMember(input: TransferMemberInput): Promise<ShiftTeamMember> {
    const effectiveFrom = input.effective_from || new Date().toISOString().split('T')[0]

    // End current membership
    const { error: endError } = await supabase
      .from('shift_team_members')
      .update({ effective_to: effectiveFrom })
      .eq('employee_id', input.employee_id)
      .eq('team_id', input.from_team_id)
      .is('effective_to', null)

    if (endError) throw endError

    // Create new membership
    const { data, error } = await supabase
      .from('shift_team_members')
      .insert({
        team_id: input.to_team_id,
        employee_id: input.employee_id,
        effective_from: effectiveFrom,
        created_by: input.created_by || null
      })
      .select(MEMBER_SELECT)
      .single()

    if (error) throw error
    return data as unknown as ShiftTeamMember
  },

  // ── GET UNASSIGNED EMPLOYEES ──
  async getUnassignedEmployees(departmentId: string): Promise<any[]> {
    const { data: employees, error: empError } = await supabase
      .from('employees')
      .select('id, code, full_name, department_id')
      .eq('department_id', departmentId)
      .eq('status', 'active')
      .order('full_name')

    if (empError) throw empError
    if (!employees || employees.length === 0) return []

    // Active members = effective_to IS NULL
    const { data: members, error: memError } = await supabase
      .from('shift_team_members')
      .select('employee_id')
      .is('effective_to', null)

    if (memError) throw memError

    const assignedIds = new Set((members || []).map(m => m.employee_id))
    return employees.filter(e => !assignedIds.has(e.id))
  },

  // ── GET EMPLOYEE'S CURRENT TEAM ──
  async getEmployeeTeam(employeeId: string): Promise<ShiftTeamMember | null> {
    const { data, error } = await supabase
      .from('shift_team_members')
      .select(MEMBER_SELECT)
      .eq('employee_id', employeeId)
      .is('effective_to', null)
      .maybeSingle()

    if (error) throw error
    return data as unknown as ShiftTeamMember | null
  },

  // ── GET TEAMS WITH COUNT (dùng view v_shift_team_summary) ──
  async getTeamsWithCount(departmentId?: string): Promise<(ShiftTeam & { member_count: number })[]> {
    let query = supabase
      .from('v_shift_team_summary')
      .select('*')

    if (departmentId) {
      query = query.eq('department_id', departmentId)
    }

    const { data, error } = await query.order('department_code').order('team_code')

    if (error) {
      // Fallback if view doesn't exist
      const teams = await this.getTeams(departmentId)
      const result = await Promise.all(
        teams.map(async (team) => {
          const members = await this.getTeamMembers(team.id)
          return { ...team, member_count: members.length }
        })
      )
      return result
    }

    return (data || []).map((row: any) => ({
      id: row.team_id,
      code: row.team_code,
      name: row.team_name,
      department_id: row.department_id,
      description: null,
      default_rotation_pattern: row.default_rotation_pattern,
      sort_order: 0,
      is_active: row.is_active,
      created_by: null,
      created_at: '',
      updated_at: '',
      department: {
        id: row.department_id,
        code: row.department_code,
        name: row.department_name
      },
      member_count: row.active_member_count || 0
    }))
  },

  // ── HELPER: get color by team code ──
  getTeamColor
}

export default shiftTeamService