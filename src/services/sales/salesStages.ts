// ============================================================================
// Sales Module — 7 internal tracking stages
// File: src/services/sales/salesStages.ts
// Phần của Sprint 1 D1 (Sales Tracking & Control)
// ============================================================================
//
// Mỗi đơn đi qua 7 stages, mỗi stage có owner + SLA + dwell time tracking.
// Tham chiếu: docs/SALES_BACKWARD_SCHEDULING_UX.docx
// ============================================================================

export type SalesStage =
  | 'sales'
  | 'raw_material'
  | 'production'
  | 'qc'
  | 'packing'
  | 'logistics'
  | 'delivered'

export const SALES_STAGES: SalesStage[] = [
  'sales',
  'raw_material',
  'production',
  'qc',
  'packing',
  'logistics',
  'delivered',
]

export const SALES_STAGE_LABELS: Record<SalesStage, string> = {
  sales:        'Phòng Kinh doanh',
  raw_material: 'Mua mủ NVL',
  production:   'Sản xuất',
  qc:           'QC Final',
  packing:      'Đóng gói',
  logistics:    'Logistics + xuất kho',
  delivered:    'Đã giao khách',
}

export const SALES_STAGE_SHORT: Record<SalesStage, string> = {
  sales:        'Sales',
  raw_material: 'Mua mủ',
  production:   'Sản xuất',
  qc:           'QC',
  packing:      'Đóng gói',
  logistics:    'Logistics',
  delivered:    'Đã giao',
}

export const SALES_STAGE_EMOJI: Record<SalesStage, string> = {
  sales:        '📋',
  raw_material: '🛒',
  production:   '🏭',
  qc:           '🔬',
  packing:      '📦',
  logistics:    '🚛',
  delivered:    '✅',
}

// Default SLA giờ — đồng bộ với sales_dept_capacity DB
export const SALES_STAGE_SLA_HOURS: Record<SalesStage, number> = {
  sales:         24,    // 1 ngày ký HĐ
  raw_material:  96,    // 4 ngày chuẩn bị NVL
  production:    168,   // 7 ngày sản xuất
  qc:            48,    // 2 ngày QC
  packing:       36,    // 1.5 ngày đóng gói
  logistics:     36,    // 1.5 ngày xếp xe + chứng từ
  delivered:     0,     // terminal — không SLA
}

// Stage tiếp theo (linear flow). null = terminal
export const SALES_STAGE_NEXT: Record<SalesStage, SalesStage | null> = {
  sales:         'raw_material',
  raw_material:  'production',
  production:    'qc',
  qc:            'packing',
  packing:       'logistics',
  logistics:     'delivered',
  delivered:     null,
}

// Owner mặc định mỗi stage — đồng bộ với DB trigger log_sales_stage_change.
// Nếu bạn đổi ở đây, NHỚ chạy lại migration sales_auto_assign_owner_on_stage.sql.
// (BGĐ vẫn có thể đổi owner manual qua nút ✏ trong StageOwnershipCard)
export const SALES_STAGE_DEFAULT_OWNER_EMAIL: Record<SalesStage, string | null> = {
  sales:         'sales@huyanhrubber.com',     // Hồ Thị Liễu
  raw_material:  'tannv@huyanhrubber.com',     // Nguyễn Nhật Tân
  production:    'trunglxh@huyanhrubber.com',  // Lê Xuân Hồng Trung
  qc:            'nhanlt@huyanhrubber.com',    // Lê Thành Nhân
  packing:       'nhanlt@huyanhrubber.com',    // Lê Thành Nhân (cùng người với QC)
  logistics:     'anhlp@huyanhrubber.com',     // Lê Phương Anh
  delivered:     'phulv@huyanhrubber.com',     // Phú LV (Kế toán) — lập HĐ + thu tiền
}

// Tên hiển thị (không phải fetch DB) cho preview UI
export const SALES_STAGE_DEFAULT_OWNER_NAME: Record<SalesStage, string | null> = {
  sales:         'Hồ Thị Liễu',
  raw_material:  'Nguyễn Nhật Tân',
  production:    'Lê Xuân Hồng Trung',
  qc:            'Lê Thành Nhân',
  packing:       'Lê Thành Nhân',
  logistics:     'Lê Phương Anh',
  delivered:     'Phú LV (Kế toán)',
}

// Map status (10 values) → stage gợi ý (cho backfill + sync)
export function statusToStage(status: string): SalesStage {
  switch (status) {
    case 'draft':
    case 'confirmed':
      return 'sales'
    case 'producing':
      return 'production'
    case 'ready':
      return 'qc'
    case 'packing':
      return 'packing'
    case 'shipped':
      return 'logistics'
    case 'delivered':
    case 'invoiced':
    case 'paid':
      return 'delivered'
    default:
      return 'sales'
  }
}

// SLA status helper
export type SLAStatus = 'on_track' | 'at_risk' | 'overdue' | 'done' | 'pending'

export function getSLAStatus(
  stageStartedAt: string | null,
  slaHours: number | null,
  currentStage: SalesStage | null,
): SLAStatus {
  if (currentStage === 'delivered') return 'done'
  if (!stageStartedAt || !slaHours) return 'pending'
  const elapsed = (Date.now() - new Date(stageStartedAt).getTime()) / (1000 * 3600)
  if (elapsed > slaHours) return 'overdue'
  if (elapsed > slaHours * 0.8) return 'at_risk'
  return 'on_track'
}

// Format dwell time hợp lý
export function formatDwell(hours: number | null): string {
  if (!hours || hours <= 0) return '—'
  if (hours < 1) return `${Math.round(hours * 60)} phút`
  if (hours < 24) return `${hours.toFixed(1)}h`
  const days = Math.floor(hours / 24)
  const rh = Math.round(hours % 24)
  return rh > 0 ? `${days}d ${rh}h` : `${days}d`
}

// Status pill colors (Vercel-inspired) — dùng ở StagePill component
export const SLA_PILL_COLORS: Record<SLAStatus, { fg: string; bg: string }> = {
  done:       { fg: '#10b981', bg: '#d1fae5' },   // green
  on_track:   { fg: '#0a72ef', bg: '#dbeafe' },   // blue
  at_risk:    { fg: '#f59e0b', bg: '#fef3c7' },   // amber
  overdue:    { fg: '#ff5b4f', bg: '#fee2e2' },   // red
  pending:    { fg: '#6b7280', bg: '#f3f4f6' },   // gray
}
