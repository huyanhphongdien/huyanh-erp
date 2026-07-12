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
  // Ưu tiên hiện theo LÔ; chưa chia lô thì hiện theo container.
  const label = lotsTotal > 0
    ? `📦 ${lotsDelivered}/${lotsTotal} lô`
    : `${contsDelivered}/${contsTotal} cont`

  const tip = lotsTotal > 0
    ? `Đã giao ${lotsDelivered}/${lotsTotal} lô · ${contsDelivered}/${contsTotal} container`
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
