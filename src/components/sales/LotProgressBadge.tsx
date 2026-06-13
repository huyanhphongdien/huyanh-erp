// ============================================================================
// LotProgressBadge — chỉ báo tiến độ lô/giao của 1 đơn (dùng ở 3 view: bảng / split / kanban)
// ============================================================================
import { Tag, Tooltip } from 'antd'
import type { LotProgress } from '../../services/logistics/dispatchService'

export default function LotProgressBadge({
  p,
  small,
}: {
  p?: LotProgress
  small?: boolean
}) {
  if (!p || p.contsTotal === 0) return null
  const { lotsTotal, lotsDelivered, contsTotal, contsDelivered } = p

  const allDone = contsDelivered === contsTotal
  const color = allDone ? 'green' : contsDelivered > 0 ? 'blue' : 'default'
  // Ưu tiên hiện theo LÔ; chưa chia lô thì hiện theo container.
  const label = lotsTotal > 0
    ? `📦 ${lotsDelivered}/${lotsTotal} lô`
    : `${contsDelivered}/${contsTotal} cont`

  const tip = lotsTotal > 0
    ? `Đã giao ${lotsDelivered}/${lotsTotal} lô · ${contsDelivered}/${contsTotal} container`
    : `Đã giao ${contsDelivered}/${contsTotal} container (chưa chia lô)`

  return (
    <Tooltip title={tip}>
      <Tag color={color} style={{ margin: 0, fontSize: small ? 11 : 12, lineHeight: small ? '16px' : '18px' }}>
        {label}
      </Tag>
    </Tooltip>
  )
}
