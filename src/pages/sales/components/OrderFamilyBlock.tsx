// ============================================================================
// OrderFamilyBlock — khối "CÁC ĐỢT CÙNG HĐ" cuối tab Thông tin (trang đầy đủ, drawer, Split — CHUNG một component)
// File: src/pages/sales/components/OrderFamilyBlock.tsx (sales_family_parties_p1, owner duyệt 17/11/2026)
//
// Cũng là nơi DUY NHẤT của:
//   • useOrderFamily(order)        — họ HĐ của đơn đang xem (CÙNG khoá query với OrderFamilyChip →
//                                    chip, khối này, tab Hợp đồng, Tiến độ chỉ tải MỘT lần / gốc).
//   • useOpenSalesOrder()          — mở chi tiết một đơn bằng tab (mẫu Sổ đơn).
//   • useContinueOrderAction(...)  — luật hiện / khoá lối vào "Tạo đơn mua tiếp" (3 lối vào: header trang,
//     <ContinueOrderButton>          menu Hành động của drawer/Split, tab Hợp đồng cạnh "Tạo phụ lục").
//
// Mỗi đợt mua tiếp là MỘT đơn bình thường (tiền, lô, công nợ riêng) — dòng cộng ở đây chỉ để xem,
// KHÔNG phải mẫu số công nợ. Chưa migration (useFamilyPartiesReady = false) → không vẽ gì, nút ẩn.
// ============================================================================

import { useCallback, useMemo } from 'react'
import { Button, Card, Table, Tag, Tooltip, Typography } from 'antd'
import type { TableColumnsType } from 'antd'
import { BranchesOutlined } from '@ant-design/icons'
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import {
  salesOrderService,
  familyTotals,
  type SalesFamilyMember,
} from '../../../services/sales/salesOrderService'
import {
  ORDER_STATUS_COLORS,
  ORDER_STATUS_LABELS,
  SVR_GRADE_OPTIONS,
  partyShortName,
  soDisplayCode,
} from '../../../services/sales/salesTypes'
import { salesPermissions, type SalesRole } from '../../../services/sales/salesPermissionService'
import { fmtMoney, isVnd } from '../../../services/sales/salesMoney'
import { EnumTag } from '../../../components/common/EnumTag'
import PageState from '../../../components/common/PageState'
import { stdPagination } from '../../../components/common/tableDefaults'
import { useOpenTab } from '../../../hooks/useOpenTab'
import { useIsPhone } from '../../../hooks/useIsPhone'
import { fmtDate, fmtNum } from '../../../utils/format'
import { palette } from '../../../theme/palette'
import { salesOrderFamilyQueryKey, useFamilyPartiesReady } from './OrderFamilyChip'

const { Text } = Typography

// ── Họ HĐ của đơn đang xem ──────────────────────────────────────────────────

/** Đơn tối thiểu để biết họ HĐ (SalesOrder từ getById đã có `parent` khi đã migration). */
export interface FamilyOrderLike {
  id: string
  code?: string | null
  contract_no?: string | null
  status?: string | null
  parent_order_id?: string | null
  continuation_seq?: number | null
  parent?: {
    id?: string
    code?: string | null
    contract_no?: string | null
    contract_date?: string | null
    status?: string | null
  } | null
}

/** Họ HĐ đã tính sẵn cho màn chi tiết. */
export interface OrderFamilyInfo {
  /** migration sales_family_parties_p1 đã áp (false → mọi khối mới ẩn) */
  ready: boolean
  /** đơn đang xem là ĐỢT mua tiếp (có đơn gốc) */
  isChild: boolean
  /** id đơn GỐC của họ (đơn thường / gốc → chính nó) */
  rootId: string
  /** số HĐ gốc để HIỂN THỊ (đợt: số của gốc; gốc: số của chính nó) */
  rootNo: string
  query: UseQueryResult<SalesFamilyMember[], Error>
  /** cả họ, KỂ CẢ đợt đã huỷ, sắp theo số đợt (gốc = 1) */
  members: SalesFamilyMember[]
  /** các đơn chưa huỷ */
  live: SalesFamilyMember[]
  /** các đợt con (không gồm gốc) */
  children: SalesFamilyMember[]
  /** các đợt con chưa huỷ */
  liveChildren: SalesFamilyMember[]
  /** số đợt lớn nhất của họ (tính cả đợt huỷ) — mẫu "Đợt n/N" */
  maxSeq: number
  /** có nên vẽ khối/dòng họ HĐ: đợt con luôn có; gốc khi còn ≥ 1 đợt chưa huỷ */
  showBlock: boolean
}

/**
 * Họ HĐ của một đơn — CÙNG khoá query với OrderFamilyChip (salesOrderFamilyQueryKey(rootId)) nên mọi khối của màn
 * chi tiết dùng chung một lần tải. Chưa migration → không tải, members = [].
 */
export function useOrderFamily(order?: FamilyOrderLike | null): OrderFamilyInfo {
  const ready = useFamilyPartiesReady()
  const isChild = !!order?.parent_order_id
  const rootId = order ? order.parent_order_id || order.id : ''
  const query = useQuery({
    queryKey: salesOrderFamilyQueryKey(rootId),
    queryFn: () => salesOrderService.getFamily(rootId),
    enabled: ready && !!rootId,
    staleTime: 60 * 1000,
  })
  const data = query.data
  const derived = useMemo(() => {
    const members = data ?? []
    const live = members.filter((m) => m.status !== 'cancelled')
    const children = members.filter((m) => !m.is_root)
    const liveChildren = children.filter((m) => m.status !== 'cancelled')
    const maxSeq = members.reduce((mx, m) => Math.max(mx, m.seq || 0), 0)
    return { members, live, children, liveChildren, maxSeq }
  }, [data])
  const rootMember = derived.members.find((m) => m.is_root)
  const rootNo = isChild
    ? (order?.parent?.contract_no || rootMember?.contract_no || order?.parent?.code || rootMember?.code || '')
    : (order ? soDisplayCode(order) : '')
  return {
    ready,
    isChild,
    rootId,
    rootNo,
    query,
    ...derived,
    showBlock: ready && derived.members.length >= 2 && (isChild || derived.live.length >= 2),
  }
}

/** Mở chi tiết một đơn bằng tab (theo mẫu Sổ đơn) — dùng chung khối họ HĐ / link HĐ gốc. */
export function useOpenSalesOrder(): (orderId: string, label: string) => void {
  const openTab = useOpenTab()
  return useCallback((orderId: string, label: string) => {
    openTab({
      key: `sales-order-${orderId}`,
      title: `Đơn ${label}`,
      componentId: 'sales-order-detail',
      props: { orderId },
      path: `/sales/orders/${orderId}`,
    })
  }, [openTab])
}

// ── Lối vào "Tạo đơn mua tiếp" ──────────────────────────────────────────────

/** Luật lối vào "Tạo đơn mua tiếp" (dùng chung 3 nơi). */
export interface ContinueOrderAction {
  /** có vẽ lối vào: đã migration · quyền canCreateOrder · đơn CHƯA huỷ (mọi trạng thái khác đều được — gốc thường đã giao) */
  show: boolean
  /** lý do KHÔNG tạo được (gốc chưa có số HĐ / gốc đã huỷ) → nút mờ + tooltip giải thích */
  disabledReason: string | null
  /** lý do rút gọn để in ngay cạnh nhãn (màn cảm ứng không có tooltip) */
  disabledShort: string | null
  /** mở tab form Mua tiếp (route /sales/orders/:id/continue — TabbedWorkspace bỏ qua query nên không dùng '?from=') */
  open: () => void
}

/**
 * Lối vào "Tạo đơn mua tiếp" từ đơn đang xem (gốc hoặc một đợt — form tự quy về gốc, lấy quy cách của đơn được bấm).
 * Mở openTab key 'sales-order-continue-<id>' · componentId 'sales-order-continue' · props {sourceOrderId}.
 */
export function useContinueOrderAction(
  order: FamilyOrderLike | null | undefined,
  salesRole: SalesRole | null,
): ContinueOrderAction {
  const ready = useFamilyPartiesReady()
  const openTab = useOpenTab()
  const isChild = !!order?.parent_order_id
  // Số HĐ của GỐC: đợt đọc qua `parent` (null = chưa nạp được → không khoá, form sẽ tự kiểm); gốc đọc chính nó.
  const rootContractNo: string | null = isChild
    ? (order?.parent ? (order.parent.contract_no || '').trim() : null)
    : (order?.contract_no || '').trim()
  const show = !!order && ready && !!salesRole && salesPermissions.canCreateOrder(salesRole) && order.status !== 'cancelled'

  let disabledReason: string | null = null
  let disabledShort: string | null = null
  if (show) {
    if (isChild && order?.parent?.status === 'cancelled') {
      disabledReason = `HĐ gốc ${rootContractNo || order.parent?.code || ''} đã huỷ — không tạo đơn mua tiếp được`
      disabledShort = 'HĐ gốc đã huỷ'
    } else if (rootContractNo === '') {
      disabledReason = isChild
        ? 'HĐ gốc chưa có số HĐ — điền số HĐ cho đơn gốc trước'
        : 'Đơn này chưa có Số HĐ — điền Số HĐ ở tab Hợp đồng trước rồi mới tạo đơn mua tiếp'
      disabledShort = 'chưa có số HĐ'
    }
  }

  const orderId = order?.id
  const tabLabel = rootContractNo || (order ? soDisplayCode(order) : '')
  const open = useCallback(() => {
    if (!orderId) return
    openTab({
      key: `sales-order-continue-${orderId}`,
      title: `Mua tiếp HĐ ${tabLabel}`,
      componentId: 'sales-order-continue',
      props: { sourceOrderId: orderId },
      path: `/sales/orders/${orderId}/continue`,
    })
  }, [orderId, tabLabel, openTab])

  return { show, disabledReason, disabledShort, open }
}

export interface ContinueOrderButtonProps {
  order: FamilyOrderLike | null | undefined
  salesRole: SalesRole | null
  size?: 'small' | 'middle' | 'large'
  /** chạy trước khi mở tab (vd đóng drawer) */
  onBeforeOpen?: () => void
}

/** Nút "Tạo đơn mua tiếp" — ẩn khi đơn huỷ / không quyền / chưa migration; mờ + tooltip khi gốc chưa có số HĐ. */
export function ContinueOrderButton({ order, salesRole, size = 'middle', onBeforeOpen }: ContinueOrderButtonProps) {
  const action = useContinueOrderAction(order, salesRole)
  const isPhone = useIsPhone()
  if (!action.show) return null
  const tip = action.disabledReason
    || 'Khách mua thêm theo HĐ đã ký: tạo một đơn mới gắn vào HĐ gốc — không ký HĐ mới; tấn, giá, lô, công nợ của đợt tách riêng'
  const btn = (
    <Button
      size={size}
      icon={<BranchesOutlined />}
      disabled={!!action.disabledReason}
      onClick={() => { onBeforeOpen?.(); action.open() }}
    >
      Tạo đơn mua tiếp
    </Button>
  )
  return (
    <>
      <Tooltip title={tip}>
        {/* Nút disabled không bắn sự kiện chuột → bọc span để tooltip vẫn hiện lý do */}
        {action.disabledReason ? <span style={{ display: 'inline-block' }}>{btn}</span> : btn}
      </Tooltip>
      {/* Màn cảm ứng không có tooltip → in lý do rút gọn cạnh nút */}
      {action.disabledReason && isPhone ? (
        <Text type="secondary" style={{ fontSize: 11 }}>({action.disabledShort})</Text>
      ) : null}
    </>
  )
}

// ── Khối "Các đợt cùng HĐ" ──────────────────────────────────────────────────

export interface OrderFamilyBlockProps {
  /** đơn đang xem */
  order: FamilyOrderLike
  /** ghi đè hành động mở một đơn (mặc định: tab chi tiết) */
  onOpenOrder?: (orderId: string, label: string) => void
}

/** Trị giá một đơn theo ĐÚNG đồng tiền của đơn (VND đọc total_value_vnd, USD đọc total_value_usd — cùng cột familyTotals cộng). */
const memberValue = (m: SalesFamilyMember) => fmtMoney(isVnd(m.currency) ? m.total_value_vnd : m.total_value_usd, m.currency, { decimals: 0 })

export default function OrderFamilyBlock({ order, onOpenOrder }: OrderFamilyBlockProps) {
  const fam = useOrderFamily(order)
  const isPhone = useIsPhone()
  const openOrderTab = useOpenSalesOrder()
  const openOrder = onOpenOrder || openOrderTab
  const { query, members, live, rootNo } = fam

  if (!fam.ready) return null
  // Gốc chưa biết cỡ họ → đợi (đơn thường không vẽ gì). Đợt con chắc chắn có họ ≥ 2 → hiện khung tải / lỗi.
  if (!fam.isChild && (query.isLoading || (query.isSuccess && !fam.showBlock))) return null
  if (fam.isChild && query.isSuccess && !fam.showBlock) return null

  const totals = familyTotals(members)
  const currency = members.find((m) => m.is_root)?.currency || members[0]?.currency || null
  const vnd = isVnd(currency)
  const vndSum = vnd ? live.reduce((s, m) => s + (Number(m.total_value_vnd) || 0), 0) : 0
  const valueText = vnd
    ? `${fmtMoney(vndSum, 'VND')} (≈ ${fmtMoney(totals.valueUsd, 'USD', { decimals: 0 })} quy đổi)`
    : fmtMoney(totals.valueUsd, 'USD', { decimals: 0 })
  const nCancelled = members.length - live.length

  const go = (m: SalesFamilyMember) => { if (m.id !== order.id) openOrder(m.id, soDisplayCode(m)) }

  const columns: TableColumnsType<SalesFamilyMember> = [
    {
      title: 'Đợt',
      key: 'seq',
      width: 96,
      render: (_: unknown, m) => (
        <span style={{ whiteSpace: 'nowrap' }}>
          <Text strong>Đợt {m.seq}</Text>
          {m.is_root ? <Tag style={{ marginInlineStart: 6, color: palette.brand, borderColor: palette.brand, background: palette.brandBg }}>gốc</Tag> : null}
        </span>
      ),
    },
    {
      title: 'Số đơn',
      key: 'no',
      render: (_: unknown, m) => (
        <span>
          <Text style={{ fontFamily: 'monospace' }} delete={m.status === 'cancelled'}>{soDisplayCode(m)}</Text>
          {m.id === order.id ? <Text type="secondary" style={{ fontSize: 12 }}> · đang xem</Text> : null}
        </span>
      ),
    },
    {
      title: 'Trạng thái',
      key: 'status',
      width: 120,
      render: (_: unknown, m) => <EnumTag value={m.status} labels={ORDER_STATUS_LABELS} colors={ORDER_STATUS_COLORS} />,
    },
    {
      title: 'Người nhận',
      key: 'ship_to',
      render: (_: unknown, m) => (m.ship_to
        ? <span title={m.ship_to.name}>{partyShortName(m.ship_to)}</span>
        : <Text type="secondary">= người mua</Text>),
    },
    {
      title: 'Grade',
      dataIndex: 'grade',
      key: 'grade',
      // nhãn grade dùng chung (không in mã thô 'SVR_10'); grade gộp nhiều mặt hàng thì giữ nguyên chữ
      render: (v: string | null) => (v ? (SVR_GRADE_OPTIONS.find((g) => g.value === v)?.label || v) : '—'),
    },
    { title: 'Tấn', key: 'tons', align: 'right', width: 90, render: (_: unknown, m) => fmtNum(m.quantity_tons, 3) },
    { title: 'Trị giá', key: 'value', align: 'right', width: 130, render: (_: unknown, m) => memberValue(m) },
    {
      title: 'Đã thu',
      key: 'paid',
      align: 'right',
      width: 110,
      // actual_payment_amount là USD (đơn VNĐ: USD quy đổi) — như thẻ Tài chính ở tab Tiến độ
      render: (_: unknown, m) => fmtMoney(m.actual_payment_amount, 'USD', { decimals: 0 }),
    },
    { title: 'ETD', key: 'etd', width: 104, render: (_: unknown, m) => fmtDate(m.etd) },
  ]

  return (
    <Card
      size="small"
      style={{ marginTop: 12 }}
      title={
        <span style={{ whiteSpace: 'normal' }}>
          ⧉ Các đợt cùng HĐ {rootNo}
          {query.isSuccess ? (
            <Text type="secondary" style={{ fontWeight: 400, fontSize: 12 }}>
              {' '}· {live.length} đơn{nCancelled ? ` · ${nCancelled} đã huỷ` : ''}
            </Text>
          ) : null}
        </span>
      }
    >
      <PageState
        loading={query.isLoading}
        error={query.error}
        onRetry={() => { void query.refetch() }}
        empty={query.isSuccess && members.length === 0}
        emptyText="Chưa có đợt mua tiếp nào"
        minHeight={80}
      >
        {isPhone ? (
          // Điện thoại: thẻ xếp dọc, không bảng ngang
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {members.map((m) => {
              const self = m.id === order.id
              return (
                <div
                  key={m.id}
                  role={self ? undefined : 'button'}
                  tabIndex={self ? undefined : 0}
                  onClick={() => go(m)}
                  onKeyDown={(e) => { if (!self && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); go(m) } }}
                  style={{
                    border: '1px solid #f0f0f0', borderRadius: 8, padding: '8px 10px',
                    background: self ? palette.brandBg : undefined,
                    opacity: m.status === 'cancelled' ? 0.55 : 1,
                    cursor: self ? 'default' : 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
                    <Text strong>Đợt {m.seq}</Text>
                    <Text style={{ fontFamily: 'monospace', wordBreak: 'break-all' }} delete={m.status === 'cancelled'}>{soDisplayCode(m)}</Text>
                    <EnumTag value={m.status} labels={ORDER_STATUS_LABELS} colors={ORDER_STATUS_COLORS} />
                    {self ? <Text type="secondary" style={{ fontSize: 12 }}>đang xem</Text> : null}
                  </div>
                  <div style={{ fontSize: 12, marginTop: 2 }}>
                    <Text type="secondary">
                      {fmtNum(m.quantity_tons, 3)} t · {memberValue(m)}
                      {m.ship_to ? ` · → ${partyShortName(m.ship_to)}` : ''}
                      {m.etd ? ` · ETD ${fmtDate(m.etd)}` : ''}
                    </Text>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <Table<SalesFamilyMember>
            size="small"
            rowKey="id"
            columns={columns}
            dataSource={members}
            pagination={members.length > 20 ? stdPagination(20) : false}
            scroll={{ x: 'max-content' }}
            onRow={(m) => ({
              onClick: () => go(m),
              style: {
                cursor: m.id === order.id ? 'default' : 'pointer',
                background: m.id === order.id ? palette.brandBg : undefined,
                opacity: m.status === 'cancelled' ? 0.55 : 1,
              },
            })}
          />
        )}
        <div style={{ marginTop: 8, fontSize: 12 }}>
          <Text>
            Cộng {totals.orders} đơn chưa huỷ: <b>{fmtNum(totals.tons, 3)} t</b> · {valueText} · đã thu {fmtMoney(totals.paidUsd, 'USD', { decimals: 0 })}
          </Text>
          <br />
          <Text type="secondary">
            Cộng các đơn — không phải mẫu số công nợ (mỗi đợt là một khoản phải thu riêng). Mỗi đợt không ký HĐ mới.
          </Text>
        </div>
      </PageState>
    </Card>
  )
}
