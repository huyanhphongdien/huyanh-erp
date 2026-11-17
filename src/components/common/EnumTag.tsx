// ============================================================================
// EnumTag — hiện MỘT giá trị trạng thái/loại (enum) thành Tag tiếng Việt có màu.
// Nhãn + màu của mỗi thực thể sống ở SERVICE/TYPES của nó (vd ORDER_STATUS_LABELS/COLORS trong
// salesTypes, FLEET_PR_STATUS_* trong fleetPaymentRequestService) — trang KHÔNG tự chép map.
// (Đợt 3 audit UI 17/11/2026: 172 bảng màu/nhãn cục bộ đã trôi nghĩa, có màn in thẳng mã tiếng Anh.)
// Quy ước màu (khớp luật màu dòng tiền ở CLAUDE.md):
//   'default' nháp · 'gold'/'orange' chờ / một phần · 'blue' đang làm / đã duyệt chờ chi
//   'green' xong / đã chi / đạt · 'red' huỷ / từ chối / lỗi / không đạt
// ============================================================================
import type { CSSProperties } from 'react'
import { Tag } from 'antd'

export interface EnumTagProps {
  value?: string | null
  labels: Record<string, string>
  colors?: Record<string, string>
  /** chữ khi value rỗng */
  empty?: string
  style?: CSSProperties
}

export function EnumTag({ value, labels, colors, empty = '—', style }: EnumTagProps) {
  if (!value) return <span style={{ color: '#9CA3AF' }}>{empty}</span>
  return <Tag color={colors?.[value] || 'default'} style={style}>{labels[value] ?? value}</Tag>
}

/** Nhãn dạng chữ (Excel, tooltip, câu thông báo) — cùng map với EnumTag */
export const enumLabel = (labels: Record<string, string>, value?: string | null, empty = '—') =>
  value ? (labels[value] ?? value) : empty

export default EnumTag
