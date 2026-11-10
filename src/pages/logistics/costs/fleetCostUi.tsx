// ============================================================================
// fleetCostUi — mảnh giao diện dùng chung của Sổ chi phí đội xe / Đề nghị thanh toán chi phí xe
// File: src/pages/logistics/costs/fleetCostUi.tsx
// Một nơi định nghĩa màu, font số, ô KPI, cặp tiền VNĐ/LAK, nhãn trạng thái — hai trang và khối
// trong chi tiết lệnh nhìn cùng một kiểu.
// ============================================================================

import type { CSSProperties, ReactNode } from 'react'
import { Tag, Typography } from 'antd'
import { fmtAmt } from '../../../services/logistics/fleetCostService'
import { FLEET_PR_STATUS_COLORS, FLEET_PR_STATUS_LABELS, type FleetPrStatus } from '../../../services/logistics/fleetPaymentRequestService'

const { Text } = Typography

export const BRAND = '#1B4D3E'
export const BRAND_DARK = '#0D2E25'
export const GOLD = '#E8A838'
export const OK = '#15803d'
export const AMBER = '#b45309'
export const RED = '#b91c1c'
export const INK_2 = '#6b7280'

export const MONO: CSSProperties = { fontFamily: "'JetBrains Mono', Consolas, ui-monospace, monospace", fontVariantNumeric: 'tabular-nums' }

/** InputNumber: dấu chấm ngăn nghìn kiểu Việt. */
export const thousands = {
  formatter: (v: string | number | undefined) => (v === undefined || v === null || v === '' ? '' : `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')),
  parser: (v: string | undefined) => (v ? v.replace(/\./g, '') : '') as unknown as number,
}

/** Hai đồng tiền trên 2 dòng: VNĐ trên, LAK dưới (bỏ dòng 0). */
export function Pair({ vnd, lak, tone, bold }: { vnd: number; lak: number; tone?: string; bold?: boolean }) {
  if (!vnd && !lak) return <Text type="secondary">–</Text>
  return (
    <div style={{ textAlign: 'right', ...MONO, color: tone, fontWeight: bold ? 700 : undefined }}>
      {vnd ? <div>{fmtAmt(vnd)} ₫</div> : null}
      {lak ? <div style={{ fontSize: 12, color: INK_2 }}>{fmtAmt(lak)} LAK</div> : null}
    </div>
  )
}

/** Ô số tổng: nhãn nhỏ in hoa, số to đơn cách, dòng phụ, vạch màu bên trái. */
export function Kpi({ label, value, sub, tone, icon }: { label: string; value: ReactNode; sub?: ReactNode; tone?: string; icon?: ReactNode }) {
  const accent = tone || BRAND
  return (
    <div style={{ flex: 1, minWidth: 148, background: '#fff', border: '1px solid #e5e7eb', borderLeft: `4px solid ${accent}`, borderRadius: 10, padding: '10px 14px', boxShadow: '0 1px 2px rgba(0,0,0,.03)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 11, color: INK_2, textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 600 }}>{label}</span>
        {icon && <span style={{ color: accent, opacity: 0.8, fontSize: 15 }}>{icon}</span>}
      </div>
      <div style={{ fontSize: 21, fontWeight: 800, color: accent, ...MONO, marginTop: 2, lineHeight: 1.2 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: INK_2, marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

/** Tiêu đề trang: tên + mô tả bên trái, hành động bên phải. */
export function PageHeader({ title, subtitle, extra }: { title: ReactNode; subtitle?: ReactNode; extra?: ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
      <div>
        <div style={{ fontSize: 22, fontWeight: 800, color: BRAND_DARK, lineHeight: 1.2 }}>{title}</div>
        {subtitle && <div style={{ fontSize: 13, color: INK_2, marginTop: 4 }}>{subtitle}</div>}
      </div>
      {extra}
    </div>
  )
}

export function PrStatusTag({ status, style }: { status: FleetPrStatus; style?: CSSProperties }) {
  return <Tag color={FLEET_PR_STATUS_COLORS[status]} style={{ margin: 0, fontWeight: 600, ...style }}>{FLEET_PR_STATUS_LABELS[status]}</Tag>
}

/** Nhãn mục nhỏ in hoa dùng trên các thẻ. */
export function Eyebrow({ children }: { children: ReactNode }) {
  return <div style={{ fontSize: 11, color: INK_2, textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 600, marginBottom: 4 }}>{children}</div>
}
