// ============================================================================
// LotProgressBadge — chỉ báo tiến độ lô/giao của 1 đơn (dùng ở 3 view: bảng / split / kanban)
// Kèm CHIP LỆNH ĐIỀU ĐỘNG bấm được: thấy "đã giao" thì biết luôn hàng đi bằng lệnh
// nào, bấm nhảy thẳng sang xem — khỏi phải mò qua module Vận tải để tra.
// ============================================================================
import { Tag, Tooltip } from 'antd'
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
  const dispatches = showDispatch ? (dispatchOrders || []) : []

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
      <Tooltip title={tip}>
        <Tag color={color} style={{ margin: 0, fontSize: fs, lineHeight: lh }}>{label}</Tag>
      </Tooltip>

      {dispatches.map((d) => (
        <Tooltip key={d.id} title={`Mở lệnh điều động ${d.code} ở tab mới`}>
          <Tag
            color="purple"
            style={{ margin: 0, fontSize: fs, lineHeight: lh, cursor: 'pointer' }}
            onClick={(e) => {
              e.stopPropagation()   // đừng mở đơn hàng khi bấm vào chip lệnh
              // Mở TAB MỚI thay vì điều hướng tại chỗ — đang xem đơn hàng mà nhảy
              // thẳng sang lệnh là mất chỗ đang làm. Trùng key → focus tab đã mở.
              openTab({
                key: `dispatch-${d.id}`,
                title: `Lệnh ${d.code}`,
                componentId: 'dispatch-detail',
                props: { id: d.id },
                path: `/logistics/dispatch/${d.id}`,
              })
            }}
          >
            🚚 {d.code}
          </Tag>
        </Tooltip>
      ))}
    </span>
  )
}
