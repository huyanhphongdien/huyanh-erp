// ============================================================================
// labels — nhãn + màu DÙNG CHUNG cho khối Chấm công · Nghỉ phép · Tăng ca · Phân ca
// File: src/features/attendance/labels.ts (Đợt 3 audit UI 17/11/2026)
// Trước đó "Chờ duyệt" chép tay ở 5 màn với 2 tông (amber vs yellow); Đội B lúc hồng
// lúc vàng (chú giải Lịch phân ca vẽ amber trong khi Bảng chấm công + widget vẽ rose).
// Các màn Tailwind lấy class ở đây — đừng chép lại map trong trang.
// Nhãn trạng thái CHẤM CÔNG (present/late/…) nằm ở attendanceService.ATTENDANCE_STATUS_LABELS.
// ============================================================================

/** Trạng thái duyệt của đơn nghỉ phép / phiếu tăng ca. */
export const APPROVAL_STATUS_LABELS: Record<string, string> = {
  pending: 'Chờ duyệt',
  approved: 'Đã duyệt',
  rejected: 'Từ chối',
  cancelled: 'Đã hủy',
  completed: 'Hoàn thành',
}

export interface ApprovalStatusStyle {
  label: string
  /** chip nhỏ có viền (nền -100) */
  badge: string
  /** khối lớn có viền (nền -50) */
  soft: string
  bg: string
  text: string
}

// Quy ước màu: chờ = amber · đã duyệt = xanh lá · từ chối = đỏ · đã hủy = xám · hoàn thành = xanh dương
const APPROVAL_STYLE: Record<string, Omit<ApprovalStatusStyle, 'label'>> = {
  pending: { badge: 'bg-amber-100 text-amber-800 border-amber-200', soft: 'bg-amber-50 text-amber-700 border-amber-200', bg: 'bg-amber-50', text: 'text-amber-700' },
  approved: { badge: 'bg-green-100 text-green-800 border-green-200', soft: 'bg-green-50 text-green-700 border-green-200', bg: 'bg-green-50', text: 'text-green-700' },
  rejected: { badge: 'bg-red-100 text-red-800 border-red-200', soft: 'bg-red-50 text-red-700 border-red-200', bg: 'bg-red-50', text: 'text-red-700' },
  cancelled: { badge: 'bg-gray-100 text-gray-800 border-gray-200', soft: 'bg-gray-50 text-gray-700 border-gray-200', bg: 'bg-gray-50', text: 'text-gray-700' },
  completed: { badge: 'bg-blue-100 text-blue-800 border-blue-200', soft: 'bg-blue-50 text-blue-700 border-blue-200', bg: 'bg-blue-50', text: 'text-blue-700' },
}

/** Nhãn + tông của một trạng thái duyệt. Mã lạ → hiện đúng mã, tông xám (không đoán thành "Chờ duyệt"). */
export function approvalStatus(status?: string | null): ApprovalStatusStyle {
  const s = status || ''
  return { label: APPROVAL_STATUS_LABELS[s] ?? (s || '—'), ...(APPROVAL_STYLE[s] ?? APPROVAL_STYLE.cancelled) }
}

/** Màu đội ca — Đội A xanh dương, Đội B hồng (rose). Bảng chấm công, widget Vào/Ra ca, Lịch phân ca cùng đọc. */
export const TEAM_BADGE: Record<string, string> = {
  A: 'bg-blue-50 text-blue-700 border-blue-200',
  B: 'bg-rose-50 text-rose-700 border-rose-200',
}
export const TEAM_BADGE_DEFAULT = 'bg-gray-100 text-gray-600 border-gray-200'

/** Bản đặc — nhãn đội trong ô lịch, chấm chú giải. */
export const TEAM_SOLID: Record<string, string> = {
  A: 'bg-blue-500 text-white',
  B: 'bg-rose-500 text-white',
}
export const TEAM_SOLID_DEFAULT = 'bg-gray-500 text-white'
