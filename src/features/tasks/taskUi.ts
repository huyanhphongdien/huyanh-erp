// ============================================================================
// taskUi — bộ chuyển màu cho trạng thái / ưu tiên CÔNG VIỆC (Đợt 3 audit UI, 17/11/2026).
// NHÃN + "họ màu" đọc từ MỘT nguồn: TASK_STATUS_LABELS/COLORS, TASK_PRIORITY_LABELS/COLORS
// (src/types/index.ts). File này KHÔNG giữ nhãn riêng — chỉ dịch họ màu (gray/blue/yellow/…) sang
// lớp Tailwind viết sẵn (JIT quét thấy) và sang màu preset antd cho <Tag>/<EnumTag>.
// Trước đó 22 bản STATUS/PRIORITY_CONFIG chép tay đã trôi nhãn: "Đang thực hiện" vs "Đang làm",
// "Chờ đánh giá" vs "Chờ duyệt", Kanban rút "TB"/"Gấp". Màn mới: import từ đây, đừng chép map.
// Ngày tháng: fmtDate / fmtDateTime của src/utils/format.ts — không viết formatDate cục bộ.
// File: src/features/tasks/taskUi.ts
// ============================================================================
import {
  TASK_STATUS_LABELS,
  TASK_STATUS_COLORS,
  TASK_PRIORITY_LABELS,
  TASK_PRIORITY_COLORS,
} from '../../types'

export interface TaskTone {
  bg: string
  text: string
  dot: string
  border: string
}

// Họ màu → lớp Tailwind (chuỗi tĩnh để Tailwind JIT giữ lại)
const TONES: Record<string, TaskTone> = {
  gray: { bg: 'bg-gray-100', text: 'text-gray-700', dot: 'bg-gray-400', border: 'border-gray-300' },
  blue: { bg: 'bg-blue-100', text: 'text-blue-700', dot: 'bg-blue-500', border: 'border-blue-300' },
  yellow: { bg: 'bg-yellow-100', text: 'text-yellow-700', dot: 'bg-yellow-500', border: 'border-yellow-300' },
  orange: { bg: 'bg-orange-100', text: 'text-orange-700', dot: 'bg-orange-500', border: 'border-orange-300' },
  green: { bg: 'bg-green-100', text: 'text-green-700', dot: 'bg-green-500', border: 'border-green-300' },
  emerald: { bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-500', border: 'border-emerald-300' },
  red: { bg: 'bg-red-100', text: 'text-red-700', dot: 'bg-red-500', border: 'border-red-300' },
  purple: { bg: 'bg-purple-100', text: 'text-purple-700', dot: 'bg-purple-500', border: 'border-purple-300' },
}

// Họ màu → preset antd (quy ước EnumTag: default nháp · gold chờ · blue đang làm · green xong · red huỷ)
const ANTD_COLOR: Record<string, string> = {
  gray: 'default',
  blue: 'blue',
  yellow: 'gold',
  orange: 'orange',
  green: 'green',
  emerald: 'green',
  red: 'red',
  purple: 'purple',
}

const PRIORITY_LABELS = TASK_PRIORITY_LABELS as Record<string, string>
const PRIORITY_COLORS = TASK_PRIORITY_COLORS as Record<string, string>

const toAntd = (map: Record<string, string>) =>
  Object.fromEntries(Object.entries(map).map(([k, fam]) => [k, ANTD_COLOR[fam] || 'default'])) as Record<string, string>

/** Màu antd theo trạng thái việc — truyền vào <EnumTag labels={TASK_STATUS_LABELS} colors={…} /> */
export const TASK_STATUS_TAG_COLORS: Record<string, string> = toAntd(TASK_STATUS_COLORS)
/** Màu antd theo độ ưu tiên */
export const TASK_PRIORITY_TAG_COLORS: Record<string, string> = toAntd(PRIORITY_COLORS)

/** Lớp Tailwind theo TÊN họ màu ('orange', 'green'…) — vd màu của getEvaluationStatusColor() */
export function toneClasses(family?: string | null): TaskTone {
  return TONES[family || 'gray'] || TONES.gray
}

/** Nhãn trạng thái việc; mã lạ (dữ liệu cũ) trả nguyên mã, rỗng trả '—' */
export function taskStatusLabel(status?: string | null): string {
  if (!status) return '—'
  return TASK_STATUS_LABELS[status] ?? status
}

/** Lớp Tailwind theo trạng thái việc */
export function taskStatusTone(status?: string | null): TaskTone {
  return TONES[(status && TASK_STATUS_COLORS[status]) || 'gray'] || TONES.gray
}

/** Nhãn độ ưu tiên; mã lạ trả nguyên mã, rỗng trả '—' */
export function taskPriorityLabel(priority?: string | null): string {
  if (!priority) return '—'
  return PRIORITY_LABELS[priority] ?? priority
}

/** Lớp Tailwind theo độ ưu tiên */
export function taskPriorityTone(priority?: string | null): TaskTone {
  return TONES[(priority && PRIORITY_COLORS[priority]) || 'gray'] || TONES.gray
}
