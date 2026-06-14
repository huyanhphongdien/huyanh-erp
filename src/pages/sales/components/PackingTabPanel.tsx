// ============================================================================
// PackingTabPanel — tab "Đóng gói" gọn cho panel chi tiết (dùng ở dạng Bảng + Split)
// Hiện Theo dõi lô + nút mở trang Quản lý đóng gói (chia lô · nhập số cont/seal).
// ============================================================================
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Table, Tag, Space, Typography, Empty, Spin } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { ContainerOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { containerService } from '../../../services/sales/containerService'
import { dispatchService, type DeliveryState } from '../../../services/logistics/dispatchService'
import {
  LOT_STAGES, buildLotTrackRows, lotOverallStage, lotDeliveryStats,
} from '../../../services/sales/lotTracking'
import type { SalesOrderContainer } from '../../../services/sales/salesTypes'

const { Text } = Typography

export default function PackingTabPanel({ orderId }: { orderId: string }) {
  const navigate = useNavigate()
  const [containers, setContainers] = useState<SalesOrderContainer[]>([])
  const [deliveryMap, setDeliveryMap] = useState<Record<string, DeliveryState>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    containerService.getContainers(orderId)
      .then(async (cs) => {
        if (!alive) return
        setContainers(cs)
        try { setDeliveryMap(await dispatchService.getDeliveryStatus(cs.map((c) => c.id))) } catch { /* ignore */ }
      })
      .catch(() => { /* ignore */ })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [orderId])

  const rows = buildLotTrackRows(containers, deliveryMap)
  const { lotsTotal, lotsDelivered } = lotDeliveryStats(rows)
  const deliveredCount = containers.filter((c) => deliveryMap[c.id] === 'delivered').length

  const cols: ColumnsType<typeof rows[number]> = [
    { title: 'Lô', key: 'lo', width: 80, render: (_: unknown, r) => r.lotNo != null ? <Text strong>Lô {r.lotNo}</Text> : <Text type="secondary">Chưa gán</Text> },
    { title: 'Hạn', key: 'hg', width: 92, render: (_: unknown, r) => r.deadline ? dayjs(r.deadline).format('DD/MM/YY') : '—' },
    { title: 'Cont', key: 'sc', width: 52, align: 'center' as const, render: (_: unknown, r) => r.total },
    {
      title: 'Tiến độ', key: 'td', render: (_: unknown, r) => (
        <Space size={[2, 2]} wrap>
          {LOT_STAGES.filter((s) => r.counts[s.key] > 0).map((s) => (
            <Tag key={s.key} color={s.color} style={{ margin: 0, fontSize: 11 }}>{s.icon}{r.counts[s.key]}</Tag>
          ))}
        </Space>
      ),
    },
    {
      title: 'Trạng thái', key: 'tt', width: 130, render: (_: unknown, r) => {
        const { allDelivered, stage } = lotOverallStage(r)
        if (allDelivered) return <Tag color="green">🟢 Đã giao xong</Tag>
        return stage ? <Tag color={stage.color}>{stage.icon} {stage.label}</Tag> : '—'
      },
    },
  ]

  return (
    <div style={{ padding: 2 }}>
      <Button
        type="primary" block icon={<ContainerOutlined />}
        onClick={() => navigate(`/sales/orders/${orderId}/packing`)}
        style={{ marginBottom: 12, background: '#1B4D3E', borderColor: '#1B4D3E' }}
      >
        Quản lý đóng gói → (chia lô · nhập số cont/seal)
      </Button>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>
      ) : containers.length === 0 ? (
        <Empty description="Chưa có container — bấm nút trên để tạo & chia lô" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <>
          <Space size={[6, 6]} wrap style={{ marginBottom: 10 }}>
            <Tag color="blue">{containers.length} cont</Tag>
            <Tag color="purple">{lotsTotal} lô{lotsTotal === 0 ? ' (chưa chia)' : ''}</Tag>
            {lotsTotal > 0 && <Tag color="green">🟢 Đã giao {lotsDelivered}/{lotsTotal} lô</Tag>}
            <Tag color="green">✅ {deliveredCount}/{containers.length} cont đã giao</Tag>
          </Space>
          <Table dataSource={rows} columns={cols} rowKey="key" size="small" pagination={false} bordered scroll={{ x: 460 }} />
        </>
      )}
    </div>
  )
}
