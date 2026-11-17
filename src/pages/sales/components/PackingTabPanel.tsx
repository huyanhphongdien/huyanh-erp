// ============================================================================
// PackingTabPanel — tab "Đóng gói" gọn cho panel chi tiết (dùng ở dạng Bảng + Split)
// Hiện Theo dõi lô + nút mở trang Quản lý đóng gói (chia lô · nhập số cont/seal).
// ============================================================================
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Table, Tag, Space, Typography, Popover } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { ContainerOutlined } from '@ant-design/icons'
import { containerService } from '../../../services/sales/containerService'
import PageState from '../../../components/common/PageState'
import { fmtDate } from '../../../utils/format'
import { dispatchService, type DeliveryState } from '../../../services/logistics/dispatchService'
import { useOpenTab } from '../../../hooks/useOpenTab'
import {
  LOT_STAGES, buildLotTrackRows, lotOverallStage, lotDeliveryStats,
} from '../../../services/sales/lotTracking'
import type { SalesOrderContainer } from '../../../services/sales/salesTypes'

const { Text } = Typography

export default function PackingTabPanel({ orderId }: { orderId: string }) {
  const navigate = useNavigate()
  const openTab = useOpenTab()
  const [containers, setContainers] = useState<SalesOrderContainer[]>([])
  const [deliveryMap, setDeliveryMap] = useState<Record<string, DeliveryState>>({})
  // Lệnh điều động đã chở container của đơn này → cho bấm nhảy sang xem.
  const [dispatches, setDispatches] = useState<Array<{ id: string; code: string }>>([])
  const [loading, setLoading] = useState(true)
  // Lỗi tải ≠ "chưa có container" — trước đây nuốt lỗi rồi hiện màn trống giả
  const [loadError, setLoadError] = useState<unknown>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setLoadError(null)
    containerService.getContainers(orderId)
      .then(async (cs) => {
        if (!alive) return
        setContainers(cs)
        const ids = cs.map((c) => c.id)
        try { setDeliveryMap(await dispatchService.getDeliveryStatus(ids)) } catch { /* ignore */ }
        try {
          const d = await dispatchService.getDispatchOrdersForContainers(ids)
          if (alive) setDispatches(d)
        } catch { /* ignore */ }
      })
      .catch((e) => { if (alive) setLoadError(e || true) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [orderId, reloadKey])

  const rows = buildLotTrackRows(containers, deliveryMap)
  const { lotsTotal, lotsDelivered } = lotDeliveryStats(rows)
  const deliveredCount = containers.filter((c) => deliveryMap[c.id] === 'delivered').length

  const cols: ColumnsType<typeof rows[number]> = [
    { title: 'Lô', key: 'lo', width: 80, render: (_: unknown, r) => r.lotNo != null ? <Text strong>Lô {r.lotNo}</Text> : <Text type="secondary">Chưa gán</Text> },
    { title: 'Hạn', key: 'hg', width: 92, render: (_: unknown, r) => fmtDate(r.deadline) },
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

      <PageState
        loading={loading}
        error={loadError}
        onRetry={() => setReloadKey((k) => k + 1)}
        empty={containers.length === 0}
        emptyText="Chưa có container — bấm nút trên để tạo & chia lô"
        minHeight={120}
      >
        <>
          <Space size={[6, 6]} wrap style={{ marginBottom: 10 }}>
            <Tag color="blue">{containers.length} cont</Tag>
            <Tag color="purple">{lotsTotal} lô{lotsTotal === 0 ? ' (chưa chia)' : ''}</Tag>
            {lotsTotal > 0 && <Tag color="green">🟢 Đã giao {lotsDelivered}/{lotsTotal} lô</Tag>}
            <Tag color="green">✅ {deliveredCount}/{containers.length} cont đã giao</Tag>
            {/* Đi bằng lệnh nào — mở TAB MỚI, không rời khỏi đơn hàng đang xem.
                Đơn có thể đi bằng cả chục lệnh → gộp popover, đừng rải chip cho tràn. */}
            {dispatches.length > 0 && (
              <Popover
                trigger="click"
                placement="bottomLeft"
                title={`${dispatches.length} lệnh điều động`}
                content={
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 260, overflowY: 'auto' }}>
                    {dispatches.map((d) => (
                      <Tag
                        key={d.id}
                        color="purple"
                        style={{ cursor: 'pointer', margin: 0 }}
                        onClick={() => openTab({
                          key: `dispatch-${d.id}`,
                          title: `Lệnh ${d.code}`,
                          componentId: 'dispatch-detail',
                          props: { id: d.id },
                          path: `/logistics/dispatch/${d.id}`,
                        })}
                      >
                        🚚 {d.code}
                      </Tag>
                    ))}
                  </div>
                }
              >
                <Tag color="purple" style={{ cursor: 'pointer' }}>
                  🚚 {dispatches.length} lệnh điều động
                </Tag>
              </Popover>
            )}
          </Space>
          <Table dataSource={rows} columns={cols} rowKey="key" size="small" pagination={false} bordered scroll={{ x: 460 }} />
        </>
      </PageState>
    </div>
  )
}
