// ============================================================================
// FILE: src/utils/projectPermissions.ts
// MODULE: Quản lý Dự án — Huy Anh Rubber ERP
// ============================================================================
// Logic phân quyền chuyển trạng thái dự án
// Áp dụng 7-level position hierarchy:
//   Level 1: Giám đốc
//   Level 2: Trợ lý GĐ
//   Level 3: Phó GĐ
//   Level 4: Trưởng phòng
//   Level 5: Phó phòng
//   Level 6: Nhân viên
//   Level 7: Thực tập sinh
// ============================================================================

// ============================================================================
// TYPES
// ============================================================================

export type ProjectStatus =
  | 'draft'
  | 'planning'
  | 'approved'
  | 'in_progress'
  | 'on_hold'
  | 'completed'
  | 'cancelled'

/** Thông tin user đang đăng nhập */
export interface ProjectUser {
  employee_id: string | null
  position_level: number | null
  role: 'admin' | 'manager' | 'employee'
}

/** Thông tin project cần kiểm tra quyền */
export interface ProjectForPermission {
  id: string
  status: ProjectStatus
  owner_id?: string | null
  sponsor_id?: string | null
}

/** Kết quả kiểm tra quyền */
export interface ProjectPermissions {
  canApprove: boolean        // planning → approved (BGĐ level 1-3)
  canReject: boolean         // planning → draft (BGĐ level 1-3) — trả về lập kế hoạch lại
  canChangeStatus: boolean   // Các chuyển trạng thái khác (Owner + BGĐ)
  canEdit: boolean           // Sửa thông tin dự án
  canDelete: boolean         // Xóa dự án
  allowedTransitions: ProjectStatus[]  // Danh sách trạng thái có thể chuyển
}

/** Cấu hình cho từng transition */
export interface TransitionConfig {
  requiresConfirm: boolean
  requiresReason: boolean
  confirmTitle: string
  confirmMessage: string
  confirmButtonLabel: string
  confirmButtonColor: string // Tailwind class
}

// ============================================================================
// VALID TRANSITIONS (không thay đổi)
// ============================================================================

const VALID_TRANSITIONS: Record<ProjectStatus, ProjectStatus[]> = {
  draft:       ['planning', 'cancelled'],
  planning:    ['approved', 'draft', 'cancelled'],
  approved:    ['in_progress', 'planning', 'cancelled'],
  in_progress: ['on_hold', 'completed', 'cancelled'],
  on_hold:     ['in_progress', 'cancelled'],
  completed:   [],
  cancelled:   ['draft'],
}

// ============================================================================
// TRANSITION LABELS (Tiếng Việt)
// ============================================================================

export const TRANSITION_LABELS: Record<ProjectStatus, string> = {
  draft:       'Trả về nháp',
  planning:    'Lập kế hoạch',
  approved:    'Phê duyệt',
  in_progress: 'Bắt đầu thực hiện',
  on_hold:     'Tạm dừng',
  completed:   'Hoàn thành',
  cancelled:   'Hủy dự án',
}

// ============================================================================
// TRANSITION CONFIG — Confirm dialog cho mỗi transition
// ============================================================================

export function getTransitionConfig(
  fromStatus: ProjectStatus,
  toStatus: ProjectStatus
): TransitionConfig {
  // Các transition cần lý do BẮT BUỘC
  if (toStatus === 'cancelled') {
    return {
      requiresConfirm: true,
      requiresReason: true,
      confirmTitle: 'Hủy dự án',
      confirmMessage: 'Dự án sẽ bị hủy. Vui lòng nhập lý do hủy.',
      confirmButtonLabel: 'Xác nhận hủy',
      confirmButtonColor: 'bg-red-600 hover:bg-red-700',
    }
  }

  if (fromStatus === 'planning' && toStatus === 'draft') {
    return {
      requiresConfirm: true,
      requiresReason: true,
      confirmTitle: 'Trả về nháp',
      confirmMessage: 'Dự án sẽ được trả về trạng thái nháp để chỉnh sửa. Vui lòng nhập lý do.',
      confirmButtonLabel: 'Trả về nháp',
      confirmButtonColor: 'bg-gray-600 hover:bg-gray-700',
    }
  }

  if (fromStatus === 'approved' && toStatus === 'planning') {
    return {
      requiresConfirm: true,
      requiresReason: true,
      confirmTitle: 'Trả về lập kế hoạch',
      confirmMessage: 'Dự án sẽ được trả về để lập kế hoạch lại. Vui lòng nhập lý do.',
      confirmButtonLabel: 'Trả về',
      confirmButtonColor: 'bg-amber-600 hover:bg-amber-700',
    }
  }

  // Phê duyệt — confirm nhưng lý do không bắt buộc
  if (toStatus === 'approved') {
    return {
      requiresConfirm: true,
      requiresReason: false,
      confirmTitle: 'Phê duyệt dự án',
      confirmMessage: 'Xác nhận phê duyệt dự án này? Dự án sẽ sẵn sàng để bắt đầu thực hiện.',
      confirmButtonLabel: 'Phê duyệt',
      confirmButtonColor: 'bg-indigo-600 hover:bg-indigo-700',
    }
  }

  if (toStatus === 'completed') {
    return {
      requiresConfirm: true,
      requiresReason: false,
      confirmTitle: 'Hoàn thành dự án',
      confirmMessage: 'Xác nhận dự án đã hoàn thành? Sau khi hoàn thành sẽ không thể chuyển trạng thái khác.',
      confirmButtonLabel: 'Xác nhận hoàn thành',
      confirmButtonColor: 'bg-green-600 hover:bg-green-700',
    }
  }

  if (toStatus === 'on_hold') {
    return {
      requiresConfirm: true,
      requiresReason: true,
      confirmTitle: 'Tạm dừng dự án',
      confirmMessage: 'Dự án sẽ bị tạm dừng. Vui lòng nhập lý do.',
      confirmButtonLabel: 'Tạm dừng',
      confirmButtonColor: 'bg-amber-600 hover:bg-amber-700',
    }
  }

  // Các transition khác — confirm đơn giản
  return {
    requiresConfirm: true,
    requiresReason: false,
    confirmTitle: `Chuyển sang "${TRANSITION_LABELS[toStatus]}"`,
    confirmMessage: `Xác nhận chuyển trạng thái dự án sang "${TRANSITION_LABELS[toStatus]}"?`,
    confirmButtonLabel: 'Xác nhận',
    confirmButtonColor: 'bg-[#1B4D3E] hover:bg-[#164032]',
  }
}

// ============================================================================
// CORE: Kiểm tra quyền chuyển trạng thái
// ============================================================================

/** Kiểm tra user có phải BGĐ không (level 1-3) */
export function isExecutive(user: ProjectUser): boolean {
  if (user.role === 'admin') return true
  return (user.position_level ?? 99) <= 3
}

/** Kiểm tra user có phải Owner dự án không */
export function isProjectOwner(user: ProjectUser, project: ProjectForPermission): boolean {
  if (!user.employee_id) return false
  return project.owner_id === user.employee_id
}

/** Kiểm tra user có phải Sponsor dự án không */
export function isProjectSponsor(user: ProjectUser, project: ProjectForPermission): boolean {
  if (!user.employee_id) return false
  return project.sponsor_id === user.employee_id
}

/**
 * Kiểm tra quyền cho 1 transition cụ thể
 */
export function canTransitionTo(
  user: ProjectUser,
  project: ProjectForPermission,
  targetStatus: ProjectStatus
): boolean {
  const currentStatus = project.status

  // 1. Check transition hợp lệ
  const validTargets = VALID_TRANSITIONS[currentStatus] || []
  if (!validTargets.includes(targetStatus)) return false

  // 2. PHÊ DUYỆT (planning → approved): CHỈ BGĐ (level 1-3)
  if (currentStatus === 'planning' && targetStatus === 'approved') {
    return isExecutive(user)
  }

  // 3. TRẢ VỀ TỪ PLANNING (planning → draft, planning → cancelled): BGĐ
  if (currentStatus === 'planning' && (targetStatus === 'draft' || targetStatus === 'cancelled')) {
    return isExecutive(user) || isProjectOwner(user, project)
  }

  // 4. CÁC TRANSITION KHÁC: Owner + BGĐ
  return isExecutive(user) || isProjectOwner(user, project)
}

/**
 * Lấy toàn bộ quyền cho user trên project
 */
export function getProjectPermissions(
  user: ProjectUser,
  project: ProjectForPermission
): ProjectPermissions {
  const executive = isExecutive(user)
  const owner = isProjectOwner(user, project)
  const sponsor = isProjectSponsor(user, project)

  // Phê duyệt: chỉ BGĐ
  const canApprove = executive && project.status === 'planning'
  const canReject = executive && project.status === 'planning'

  // Chuyển trạng thái: Owner + BGĐ
  const canChangeStatus = executive || owner

  // Sửa: Owner + BGĐ + Sponsor
  const canEdit = executive || owner || sponsor

  // Xóa: chỉ Admin hoặc Owner khi status = draft
  const canDelete = (user.role === 'admin' || owner) && project.status === 'draft'

  // Lọc transitions theo quyền
  const allTransitions = VALID_TRANSITIONS[project.status] || []
  const allowedTransitions = allTransitions.filter(targetStatus =>
    canTransitionTo(user, project, targetStatus)
  )

  return {
    canApprove,
    canReject,
    canChangeStatus,
    canEdit,
    canDelete,
    allowedTransitions,
  }
}