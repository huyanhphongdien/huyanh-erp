// ============================================================================
// FILE: src/services/project/overallocationAlert.ts
// MODULE: Quản lý Dự án — Huy Anh Rubber ERP
// PHASE: PM5 — Bước 5.6 (Over-allocation Alerts)
// ============================================================================
// checkOverallocation():
//   Chạy khi thêm/sửa member allocation
//   Nếu tổng > 100% → cảnh báo cho PM + Trưởng phòng
//   Gợi ý: giảm allocation hoặc thay người
// ============================================================================

import { supabase } from '../../lib/supabase'

// ============================================================================
// TYPES
// ============================================================================

export interface OverallocationWarning {
  employee_id: string
  employee_name: string
  employee_code: string
  department_name: string
  total_allocation_pct: number
  excess_pct: number // tổng - 100
  projects: Array<{
    project_id: string
    project_code: string
    project_name: string
    allocation_pct: number
    role: string
  }>
  suggestions: string[]
}

export interface OverallocationCheckResult {
  has_warnings: boolean
  warnings: OverallocationWarning[]
  /** Người cần nhận thông báo (PM + trưởng phòng) */
  notify_user_ids: string[]
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Kiểm tra over-allocation cho 1 nhân viên cụ thể.
 * Gọi sau khi thêm/sửa member allocation trong resourceService.
 *
 * @param employee_id - NV cần check
 * @param triggering_project_id - DA vừa thay đổi (để highlight trong cảnh báo)
 * @returns OverallocationCheckResult
 */
export async function checkOverallocation(
  employee_id: string,
  triggering_project_id?: string
): Promise<OverallocationCheckResult> {
  // 1. Lấy tất cả memberships active của NV trong các DA đang chạy
  const { data: memberships, error: memErr } = await supabase
    .from('project_members')
    .select(`
      allocation_pct,
      role,
      project:projects(id, code, name, status, owner_id)
    `)
    .eq('employee_id', employee_id)
    .eq('is_active', true)

  if (memErr) throw memErr

  // Filter chỉ DA đang active
  const activeMemberships = (memberships || []).filter((m) => {
    const status = (m.project as any)?.status
    return ['planning', 'approved', 'in_progress'].includes(status)
  })

  const totalPct = activeMemberships.reduce(
    (sum, m) => sum + (m.allocation_pct || 0),
    0
  )

  // Không quá tải → return empty
  if (totalPct <= 100) {
    return { has_warnings: false, warnings: [], notify_user_ids: [] }
  }

  // 2. Lấy thông tin NV
  const { data: emp } = await supabase
    .from('employees')
    .select(`
      id, full_name, employee_code,
      department_id,
      department:departments(id, name, manager_id)
    `)
    .eq('id', employee_id)
    .single()

  if (!emp) {
    return { has_warnings: false, warnings: [], notify_user_ids: [] }
  }

  // 3. Build project list
  const projects = activeMemberships.map((m) => ({
    project_id: (m.project as any)?.id || '',
    project_code: (m.project as any)?.code || '',
    project_name: (m.project as any)?.name || '',
    allocation_pct: m.allocation_pct || 0,
    role: m.role || 'member',
  }))

  // 4. Generate suggestions
  const suggestions = generateSuggestions(
    totalPct,
    projects,
    triggering_project_id
  )

  // 5. Collect notify targets: PM của các DA + trưởng phòng
  const notifyIds = new Set<string>()

  // PM / owner của các DA
  for (const m of activeMemberships) {
    const ownerId = (m.project as any)?.owner_id
    if (ownerId) notifyIds.add(ownerId)
  }

  // Trưởng phòng
  const managerId = (emp.department as any)?.manager_id
  if (managerId) notifyIds.add(managerId)

  const warning: OverallocationWarning = {
    employee_id: emp.id,
    employee_name: emp.full_name,
    employee_code: emp.employee_code,
    department_name: (emp.department as any)?.name || '',
    total_allocation_pct: totalPct,
    excess_pct: totalPct - 100,
    projects,
    suggestions,
  }

  // 6. Lưu alert vào DB (nếu có bảng project_alerts)
  await saveAlert(warning, triggering_project_id)

  // 7. Gửi in-app notification
  await sendNotifications(warning, Array.from(notifyIds))

  return {
    has_warnings: true,
    warnings: [warning],
    notify_user_ids: Array.from(notifyIds),
  }
}

/**
 * Batch check: kiểm tra tất cả NV quá tải trong 1 DA
 */
export async function checkProjectOverallocation(
  project_id: string
): Promise<OverallocationCheckResult> {
  const { data: members, error } = await supabase
    .from('project_members')
    .select('employee_id')
    .eq('project_id', project_id)
    .eq('is_active', true)

  if (error) throw error

  const allWarnings: OverallocationWarning[] = []
  const allNotifyIds = new Set<string>()

  for (const m of members || []) {
    const result = await checkOverallocation(m.employee_id, project_id)
    if (result.has_warnings) {
      allWarnings.push(...result.warnings)
      result.notify_user_ids.forEach((id) => allNotifyIds.add(id))
    }
  }

  return {
    has_warnings: allWarnings.length > 0,
    warnings: allWarnings,
    notify_user_ids: Array.from(allNotifyIds),
  }
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Tạo gợi ý dựa trên mức quá tải
 */
function generateSuggestions(
  totalPct: number,
  projects: OverallocationWarning['projects'],
  triggeringProjectId?: string
): string[] {
  const suggestions: string[] = []
  const excessPct = totalPct - 100

  // Sắp xếp: DA có allocation thấp nhất (dễ giảm)
  const sorted = [...projects].sort(
    (a, b) => a.allocation_pct - b.allocation_pct
  )

  // Gợi ý 1: Giảm allocation ở DA vừa trigger
  if (triggeringProjectId) {
    const triggerProj = projects.find(
      (p) => p.project_id === triggeringProjectId
    )
    if (triggerProj) {
      const newPct = Math.max(triggerProj.allocation_pct - excessPct, 10)
      suggestions.push(
        `Giảm phân bổ tại ${triggerProj.project_code} từ ${triggerProj.allocation_pct}% xuống ${newPct}%`
      )
    }
  }

  // Gợi ý 2: Giảm ở DA có allocation thấp nhất
  const lowestNonTrigger = sorted.find(
    (p) => p.project_id !== triggeringProjectId
  )
  if (lowestNonTrigger) {
    suggestions.push(
      `Giảm phân bổ tại ${lowestNonTrigger.project_code} (hiện ${lowestNonTrigger.allocation_pct}%)`
    )
  }

  // Gợi ý 3: Thay người nếu quá tải nặng
  if (excessPct > 30) {
    suggestions.push(
      `Cân nhắc thay thế nhân sự ở 1 trong ${projects.length} dự án đang tham gia`
    )
  }

  // Gợi ý 4: Dàn đều
  if (projects.length >= 3) {
    const evenPct = Math.floor(100 / projects.length)
    suggestions.push(
      `Phân bổ đều: ~${evenPct}% mỗi DA (${projects.length} DA)`
    )
  }

  return suggestions
}

/**
 * Lưu cảnh báo vào bảng project_alerts (nếu tồn tại)
 * Nếu bảng chưa có → silent fail
 */
async function saveAlert(
  warning: OverallocationWarning,
  triggeringProjectId?: string
): Promise<void> {
  try {
    await supabase.from('project_alerts').insert({
      alert_type: 'overallocation',
      severity: warning.excess_pct > 30 ? 'high' : 'medium',
      title: `${warning.employee_name} quá tải ${warning.total_allocation_pct}%`,
      message: `Nhân viên ${warning.employee_code} (${warning.department_name}) đang được phân bổ ${warning.total_allocation_pct}%, vượt ${warning.excess_pct}% giới hạn.`,
      metadata: {
        employee_id: warning.employee_id,
        total_pct: warning.total_allocation_pct,
        excess_pct: warning.excess_pct,
        project_count: warning.projects.length,
        suggestions: warning.suggestions,
      },
      project_id: triggeringProjectId || null,
      is_read: false,
    })
  } catch {
    // Bảng project_alerts chưa tồn tại → skip
    // Sẽ tạo ở PM10 (Thông báo & Audit)
  }
}

/**
 * Gửi in-app notification cho PM + trưởng phòng
 * Sử dụng bảng notifications chung (nếu có)
 */
async function sendNotifications(
  warning: OverallocationWarning,
  recipientIds: string[]
): Promise<void> {
  if (recipientIds.length === 0) return

  try {
    const notifications = recipientIds.map((userId) => ({
      user_id: userId,
      type: 'overallocation_warning',
      title: `⚠️ Quá tải: ${warning.employee_name}`,
      message: `${warning.employee_code} đang phân bổ ${warning.total_allocation_pct}% (vượt ${warning.excess_pct}%). ${warning.suggestions[0] || ''}`,
      metadata: {
        employee_id: warning.employee_id,
        total_pct: warning.total_allocation_pct,
      },
      is_read: false,
    }))

    await supabase.from('notifications').insert(notifications)
  } catch {
    // Bảng notifications chưa tồn tại → skip
    // Console warning cho dev
    console.warn(
      `[OverallocationAlert] Không thể gửi notification cho ${recipientIds.length} người`
    )
  }
}

// ============================================================================
// INTEGRATION GUIDE
// ============================================================================
//
// Gọi checkOverallocation() trong resourceService sau khi:
//
// 1. addMember() thành công:
//    const member = await resourceService.addMember(input)
//    const alertResult = await checkOverallocation(input.employee_id, input.project_id)
//    if (alertResult.has_warnings) {
//      // Hiển thị toast cảnh báo trong UI
//    }
//
// 2. updateAllocation() thành công:
//    await resourceService.updateAllocation(member_id, newPct)
//    const member = await resourceService.getMemberById(member_id)
//    if (member) {
//      const alertResult = await checkOverallocation(member.employee_id, member.project_id)
//    }
//
// 3. Trong ProjectResourcePage.tsx — handleAddMember():
//    import { checkOverallocation } from '../../services/project/overallocationAlert'
//    ...
//    const alertResult = await checkOverallocation(employeeId, projectId)
//    if (alertResult.has_warnings) {
//      const w = alertResult.warnings[0]
//      toast.warn(`${w.employee_name} quá tải ${w.total_allocation_pct}%`)
//    }
//
// ============================================================================

export default {
  checkOverallocation,
  checkProjectOverallocation,
}