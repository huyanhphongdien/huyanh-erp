// ============================================================================
// OrderFamilyChip — chip HỌ HĐ ở header chi tiết đơn (trang đầy đủ, drawer, Split — CHUNG một component)
// File: src/pages/sales/components/OrderFamilyChip.tsx (sales_family_parties_p1, owner duyệt 17/11/2026)
//
//   • Đợt con:        "Mua tiếp · Đợt 3 · HĐ HA20260302" — bấm mở ĐƠN GỐC (openTab).
//     Đợt mang số riêng (HA20260301) vẫn hiện "Đợt 2 · HĐ HA20260302" — số đợt đọc continuation_seq, không đọc chuỗi.
//   • Gốc có đợt:     "⧉ HĐ gốc · 3 đợt" — bấm mở popover danh sách các đợt (bấm một đợt → mở đơn đó).
//   • Đơn thường / chưa migration: không vẽ gì.
// Màu THƯƠNG HIỆU (palette.js) — cố ý không dùng gold/blue/green/red (màu trạng thái). Xuống dòng được trên điện thoại.
// Cũng export useFamilyPartiesReady() — hook DUY NHẤT để UI hỏi "đã bật Đơn mua tiếp / Người nhận hàng chưa".
// ============================================================================

import { useState, type KeyboardEvent, type MouseEvent } from 'react'
import { Popover, Space, Tag, Tooltip, Typography } from 'antd'
import { useQuery } from '@tanstack/react-query'
import { salesOrderService, type SalesFamilyMember } from '../../../services/sales/salesOrderService'
import {
  ORDER_STATUS_COLORS,
  ORDER_STATUS_LABELS,
  partyShortName,
  soDisplayCode,
} from '../../../services/sales/salesTypes'
import { EnumTag } from '../../../components/common/EnumTag'
import PageState from '../../../components/common/PageState'
import { useOpenTab } from '../../../hooks/useOpenTab'
import { fmtDate, fmtNum } from '../../../utils/format'
import { palette } from '../../../theme/palette'

const { Text } = Typography

/** Khoá TanStack Query: cờ "migration sales_family_parties_p1 đã áp". */
export const FAMILY_PARTIES_READY_QUERY_KEY = ['sales-family-parties-ready'] as const
/** Khoá TanStack Query của một họ HĐ: ['sales-order-family', rootId] — invalidate sau khi tạo/huỷ đợt. */
export const salesOrderFamilyQueryKey = (rootId: string) => ['sales-order-family', rootId] as const

/**
 * true khi đã chạy migration sales_family_parties_p1 (thăm dò 1 lần/phiên qua salesOrderService.familyPartiesReady).
 * Đang tải / lỗi → false: UI ẨN nút & khối mới (an toàn).
 */
export function useFamilyPartiesReady(): boolean {
  const { data } = useQuery({
    queryKey: FAMILY_PARTIES_READY_QUERY_KEY,
    queryFn: () => salesOrderService.familyPartiesReady(),
    staleTime: Infinity,
    gcTime: Infinity,
  })
  return data === true
}

/** Props chip họ HĐ — `order` là đơn đang xem (SalesOrder từ getById đã có `parent` khi đã migration). */
export interface OrderFamilyChipProps {
  order: {
    id: string
    code?: string | null
    contract_no?: string | null
    parent_order_id?: string | null
    continuation_seq?: number | null
    parent?: { id: string; code?: string | null; contract_no?: string | null; contract_date?: string | null } | null
    customer?: { name?: string | null; short_name?: string | null } | null
  }
  /** Số đơn cả họ nếu nơi gọi đã biết (getFamilyCounts) — gốc khỏi tự tải; popover vẫn tải khi mở. */
  familySize?: number
  /** Ghi đè hành động mở đơn (mặc định: openTab chi tiết đơn). */
  onOpenOrder?: (orderId: string, label: string) => void
}

const chipStyle = {
  color: palette.brand,
  borderColor: palette.brand,
  background: palette.brandBg,
  cursor: 'pointer',
  whiteSpace: 'normal' as const,
  height: 'auto',
  maxWidth: '100%',
  marginInlineEnd: 0,
}

export default function OrderFamilyChip({ order, familySize, onOpenOrder }: OrderFamilyChipProps) {
  const ready = useFamilyPartiesReady()
  const openTab = useOpenTab()
  const [open, setOpen] = useState(false)
  const isChild = !!order.parent_order_id
  const rootId = order.parent_order_id || order.id

  // Gốc: chưa biết cỡ họ → tải họ để biết có vẽ chip không. Đợt con: chỉ tải khi mở (không dùng ở chip đợt).
  const needFamily = ready && !isChild && (familySize === undefined || open)
  const famQ = useQuery({
    queryKey: salesOrderFamilyQueryKey(rootId),
    queryFn: () => salesOrderService.getFamily(rootId),
    enabled: needFamily,
    staleTime: 60 * 1000,
  })

  if (!ready) return null

  const openOrder = (id: string, label: string) => {
    if (onOpenOrder) return onOpenOrder(id, label)
    openTab({
      key: `sales-order-${id}`,
      title: `Đơn ${label}`,
      componentId: 'sales-order-detail',
      props: { orderId: id },
      path: `/sales/orders/${id}`,
    })
  }
  const stop = (e: MouseEvent | KeyboardEvent) => e.stopPropagation()
  const onKey = (fn: () => void) => (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); fn() }
  }

  // ── Đợt con ──
  if (isChild) {
    const rootNo = order.parent?.contract_no || order.parent?.code || ''
    const seq = order.continuation_seq ?? null
    const label = `Mua tiếp${seq ? ` · Đợt ${seq}` : ''}${rootNo ? ` · HĐ ${rootNo}` : ''}`
    const meta = [
      order.customer?.name || order.customer?.short_name ? partyShortName(order.customer) : '',
      order.parent?.contract_date ? `ký ${fmtDate(order.parent.contract_date)}` : '',
    ].filter(Boolean).join(', ')
    const tip = `Mua tiếp theo HĐ ${rootNo || 'gốc'}${meta ? ` (${meta})` : ''} — không ký HĐ mới. Bấm để mở HĐ gốc.`
    const go = () => openOrder(rootId, rootNo || 'gốc')
    return (
      <Tooltip title={tip}>
        <Tag
          role="button"
          tabIndex={0}
          style={chipStyle}
          onClick={(e) => { stop(e); go() }}
          onKeyDown={onKey(go)}
        >
          {label}
        </Tag>
      </Tooltip>
    )
  }

  // ── Gốc ──
  const members: SalesFamilyMember[] = famQ.data || []
  const liveCount = members.filter((m) => m.status !== 'cancelled').length
  const size = familySize ?? (famQ.isSuccess ? liveCount : 0)
  if (size < 2) return null

  const content = (
    <div style={{ width: 'min(360px, calc(100vw - 48px))' }} onClick={stop}>
      <PageState
        loading={famQ.isLoading}
        error={famQ.error}
        onRetry={() => famQ.refetch()}
        empty={famQ.isSuccess && members.length === 0}
        emptyText="Chưa có đợt mua tiếp nào"
        minHeight={80}
      >
        <Space direction="vertical" size={4} style={{ width: '100%' }}>
          {members.map((m) => {
            const cancelled = m.status === 'cancelled'
            const isSelf = m.id === order.id
            const lbl = soDisplayCode(m)
            const go = () => { setOpen(false); openOrder(m.id, lbl) }
            return (
              <div
                key={m.id}
                role="button"
                tabIndex={0}
                onClick={(e) => { stop(e); if (!isSelf) go() }}
                onKeyDown={isSelf ? undefined : onKey(go)}
                style={{
                  display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, padding: '4px 6px', borderRadius: 6,
                  cursor: isSelf ? 'default' : 'pointer', opacity: cancelled ? 0.55 : 1,
                  background: isSelf ? palette.brandBg : undefined,
                }}
              >
                <Text strong style={{ minWidth: 52 }}>Đợt {m.seq}</Text>
                <Text style={{ fontFamily: 'monospace' }} delete={cancelled}>{lbl}</Text>
                <EnumTag value={m.status} labels={ORDER_STATUS_LABELS} colors={ORDER_STATUS_COLORS} />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {fmtNum(m.quantity_tons, 2)} t{m.ship_to ? ` · → ${partyShortName(m.ship_to)}` : ''}
                  {isSelf ? ' · đang xem' : ''}
                </Text>
              </div>
            )
          })}
          <Text type="secondary" style={{ fontSize: 11 }}>
            Mỗi đợt là một đơn riêng (tiền, lô, công nợ riêng) — không ký HĐ mới.
          </Text>
        </Space>
      </PageState>
    </div>
  )

  return (
    <Popover
      content={content}
      title={`HĐ ${soDisplayCode(order)} · ${size} đợt`}
      trigger="click"
      open={open}
      onOpenChange={setOpen}
    >
      <Tag
        role="button"
        tabIndex={0}
        style={chipStyle}
        onClick={stop}
        onKeyDown={onKey(() => setOpen((v) => !v))}
        title="HĐ gốc có các đợt mua tiếp — bấm để xem các đợt"
      >
        ⧉ HĐ gốc · {size} đợt
      </Tag>
    </Popover>
  )
}
