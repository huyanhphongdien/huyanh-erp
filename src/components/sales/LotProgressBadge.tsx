// ============================================================================
// LotProgressBadge — chỉ báo tiến độ lô/giao của 1 đơn (dùng ở 3 view: bảng / split / kanban)
// Kèm lối nhảy sang LỆNH ĐIỀU ĐỘNG đã chở lô đó (mở TAB MỚI, không rời đơn hàng).
//
// ⚠ 1 đơn có thể đi bằng RẤT NHIỀU lệnh (thực tế có đơn 12 lệnh). Xếp chip inline
//   thì dòng cao ngoằng, bảng vỡ → gộp thành 1 chip "🚚 N lệnh" + popover danh sách.
//   Chỉ khi đúng 1 lệnh mới hiện thẳng mã cho nhanh.
// ============================================================================
import { Tag, Tooltip, Popover } from 'antd'
import { useOpenTab } from '../../hooks/useOpenTab'
import type { LotProgress } from '../../services/logistics/dispatchService'

/**
 * Chip nhảy sang LỆNH ĐIỀU ĐỘNG, tách riêng để dùng được CẢ khi không vẽ badge tiến độ.
 * Từ Đợt 4 thẻ Kanban và cột Lô ở Sổ đơn hàng vẽ dải viên lô thay badge — mà dải viên
 * không có chip lệnh, nên nếu không tách ra thì mọi đơn CÓ LÔ sẽ mất hẳn lối nhảy này.
 */
export function DispatchChips({
  orders,
  small,
}: {
  orders: Array<{ id: string; code: string }>
  small?: boolean
}) {
  const openTab = useOpenTab()
  if (!orders || orders.length === 0) return null
  const fs = small ? 11 : 12
  const lh = small ? '16px' : '18px'

  const open = (d: { id: string; code: string }) => {
    openTab({
      key: `dispatch-${d.id}`,
      title: `Lệnh ${d.code}`,
      componentId: 'dispatch-detail',
      props: { id: d.id },
      path: `/logistics/dispatch/${d.id}`,
    })
  }
  const chip = (d: { id: string; code: string }, key?: string) => (
    <Tag
      key={key ?? d.id}
      color="purple"
      style={{ margin: 0, fontSize: fs, lineHeight: lh, cursor: 'pointer' }}
      onClick={(e) => { e.stopPropagation(); open(d) }}
    >
      🚚 {d.code}
    </Tag>
  )

  if (orders.length === 1) return chip(orders[0])
  return (
    <Popover
      trigger={['hover', 'click']}
      placement="right"
      title={`${orders.length} lệnh điều động`}
      content={
        <div
          style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 260, overflowY: 'auto' }}
          onClick={(e) => e.stopPropagation()}
        >
          {orders.map((d) => chip(d))}
        </div>
      }
    >
      <Tag
        color="purple"
        style={{ margin: 0, fontSize: fs, lineHeight: lh, cursor: 'pointer' }}
        onClick={(e) => e.stopPropagation()}
      >
        🚚 {orders.length} lệnh
      </Tag>
    </Popover>
  )
}

export default function LotProgressBadge({
  p,
  small,
  showDispatch = true,
}: {
  p?: LotProgress
  small?: boolean
  /** Tắt chip lệnh khi chỗ hiển thị quá chật. */
  showDispatch?: boolean
}) {
  const openTab = useOpenTab()
  if (!p || p.contsTotal === 0) return null
  const { lotsTotal, lotsDelivered, contsTotal, contsDelivered, dispatchOrders } = p

  const allDone = contsDelivered === contsTotal
  const color = allDone ? 'green' : contsDelivered > 0 ? 'blue' : 'default'

  // ⚠ TRƯỚC 27/08/2026 chỗ này là biểu thức LOẠI TRỪ: có lô thì CHỈ hiện theo lô, và
  // phần container chưa gán lô biến mất. HA20260075 hiện "📦 1/1 lô" màu xanh như đã xong
  // trong khi mới giao 5/20 container — 15 container bị giấu. HA20260066 giấu 1/2.
  // Khi có CẢ HAI thì phải hiện CẢ HAI.
  const contsNoLot = (p.contsNoLot ?? 0)
  const label = lotsTotal > 0
    ? `📦 ${lotsDelivered}/${lotsTotal} lô` + (contsNoLot > 0 ? ` · +${contsNoLot} cont chưa chia` : '')
    : `${contsDelivered}/${contsTotal} cont`

  const tip = lotsTotal > 0
    ? `Đã giao ${lotsDelivered}/${lotsTotal} lô · ${contsDelivered}/${contsTotal} container`
      + (contsNoLot > 0
        ? `\n⚠ ${contsNoLot} container CHƯA gán lô — phần này không nằm trong phân số lô.`
        : '')
    : `Đã giao ${contsDelivered}/${contsTotal} container (chưa chia lô)`

  const fs = small ? 11 : 12
  const lh = small ? '16px' : '18px'
  const ds = showDispatch ? (dispatchOrders || []) : []

  const open = (d: { id: string; code: string }) => {
    openTab({
      key: `dispatch-${d.id}`,
      title: `Lệnh ${d.code}`,
      componentId: 'dispatch-detail',
      props: { id: d.id },
      path: `/logistics/dispatch/${d.id}`,
    })
  }

  const chip = (d: { id: string; code: string }, key?: string) => (
    <Tag
      key={key ?? d.id}
      color="purple"
      style={{ margin: 0, fontSize: fs, lineHeight: lh, cursor: 'pointer' }}
      onClick={(e) => { e.stopPropagation(); open(d) }}
    >
      🚚 {d.code}
    </Tag>
  )

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
      <Tooltip title={tip}>
        <Tag color={color} style={{ margin: 0, fontSize: fs, lineHeight: lh }}>{label}</Tag>
      </Tooltip>

      {/* 1 lệnh → hiện thẳng mã. Nhiều lệnh → gộp 1 chip + popover (giữ dòng gọn). */}
      {ds.length === 1 && chip(ds[0])}
      {ds.length > 1 && (
        <Popover
          trigger="click"
          placement="right"
          title={`${ds.length} lệnh điều động`}
          content={
            <div
              style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 260, overflowY: 'auto' }}
              onClick={(e) => e.stopPropagation()}
            >
              {ds.map((d) => chip(d))}
            </div>
          }
        >
          <Tag
            color="purple"
            style={{ margin: 0, fontSize: fs, lineHeight: lh, cursor: 'pointer' }}
            onClick={(e) => e.stopPropagation()}   // đừng mở đơn hàng bên dưới
          >
            🚚 {ds.length} lệnh
          </Tag>
        </Popover>
      )}
    </span>
  )
}
