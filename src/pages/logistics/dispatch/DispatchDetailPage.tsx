// ============================================================================
// FILE: src/pages/logistics/dispatch/DispatchDetailPage.tsx
// MODULE: Vận tải / Lệnh điều động — Chi tiết (xem + đổi trạng thái + in + xoá)
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Card, Descriptions, Table, Button, Space, Typography, Tag, message, Breadcrumb,
  Popconfirm, Dropdown, Skeleton,
} from 'antd'
import {
  ArrowLeftOutlined, EditOutlined, DeleteOutlined, PrinterOutlined, FileTextOutlined,
  SendOutlined, CheckCircleOutlined, DownOutlined, TruckOutlined, CarOutlined, IdcardOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import {
  dispatchService, DISPATCH_STATUS_LABELS, TRIP_TYPE_LABELS, isContainerTrip,
  type DispatchOrder, type DispatchLine, type DispatchStatus,
} from '../../../services/logistics/dispatchService'
import { soDisplayCode } from '../../../services/sales/salesTypes'

const { Title, Text } = Typography

const STATUS_COLOR: Record<DispatchStatus, string> = {
  draft: 'default', dispatched: 'blue', in_transit: 'gold', completed: 'green', cancelled: 'red',
}
// Chuyển trạng thái hợp lệ
const NEXT_STATUS: Record<DispatchStatus, DispatchStatus[]> = {
  draft: ['dispatched', 'cancelled'],
  dispatched: ['in_transit', 'completed', 'cancelled'],
  in_transit: ['completed', 'cancelled'],
  completed: [],
  cancelled: ['draft'],
}

export default function DispatchDetailPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const [order, setOrder] = useState<DispatchOrder | null>(null)
  const [lines, setLines] = useState<DispatchLine[]>([])
  const [loading, setLoading] = useState(true)
  const [weighing, setWeighing] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await dispatchService.getById(id!)
      if (!res) { message.error('Không tìm thấy lệnh'); navigate('/logistics/dispatch'); return }
      setOrder(res.order); setLines(res.lines)
    } catch (e: any) {
      message.error('Lỗi tải lệnh: ' + (e?.message || e))
    }
    setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])

  const changeStatus = async (next: DispatchStatus) => {
    try {
      await dispatchService.setStatus(id!, next)
      message.success('Đã chuyển: ' + DISPATCH_STATUS_LABELS[next])
      load()
    } catch (e: any) {
      message.error('Lỗi đổi trạng thái: ' + (e?.message || e))
    }
  }

  const onDelete = async () => {
    try {
      await dispatchService.remove(id!)
      message.success('Đã xoá lệnh')
      navigate('/logistics/dispatch')
    } catch (e: any) {
      message.error('Lỗi xoá: ' + (e?.message || e))
    }
  }

  const doMarkWeighed = async () => {
    setWeighing(true)
    try {
      const n = await dispatchService.markWeighed(id!)
      message.success(n > 0
        ? `Đã đánh dấu cân ${n} container — Đơn hàng bán tự cập nhật giao hàng`
        : 'Tất cả container đã được đánh dấu cân rồi')
      load()
    } catch (e: any) {
      message.error('Lỗi đánh dấu: ' + (e?.message || e))
    } finally {
      setWeighing(false)
    }
  }

  if (loading || !order) {
    return <div style={{ padding: 20, maxWidth: 1680, margin: '0 auto' }}><Card><Skeleton active /></Card></div>
  }

  // Đi cảng = bảng container đầy đủ. Chuyến nội bộ/thường = bảng gọn (hành trình · nội dung · KL · ghi chú).
  const isPort = isContainerTrip(order.trip_type)
  const isTrading = order.trip_type === 'trading'
  const colWeighed = {
    // Chỉ cần đánh dấu "Đã cân" — số cân (gồm pallet/bao bì) để nhỏ tham khảo, KHÔNG so với kế hoạch.
    title: 'Cân hàng', dataIndex: 'actual_weight_kg', width: 130, align: 'right' as const,
    render: (v: number | null) => v != null
      ? (
        <div style={{ textAlign: 'right' }}>
          <Tag color="green" style={{ margin: 0 }}>✅ Đã cân</Tag>
          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{v.toLocaleString('vi-VN')} kg (gồm bì)</div>
        </div>
      )
      : <span style={{ color: '#bbb' }}>chưa cân</span>,
  }
  const lineColumns = isPort
    ? [
        { title: '#', key: 'idx', width: 40, render: (_: any, __: any, i: number) => i + 1 },
        { title: 'Hành trình', dataIndex: 'route', render: (v: string) => v || '–' },
        { title: 'Lô', dataIndex: 'lot_code', render: (v: string) => v || '–' },
        { title: 'Loại hàng', dataIndex: 'grade', render: (v: string) => v || '–' },
        { title: 'Số container', dataIndex: 'container_no', render: (v: string) => v ? <b>{v}</b> : '–' },
        { title: 'Seal', dataIndex: 'seal_no', render: (v: string) => v || '–' },
        { title: 'Số kiện', dataIndex: 'package_count', width: 80, align: 'right' as const, render: (v: number) => v ?? '–' },
        { title: 'KL net (KH)', dataIndex: 'weight_kg', width: 110, align: 'right' as const, render: (v: number) => v ? `${v.toLocaleString('vi-VN')} kg` : '–' },
        { title: 'GW (gross)', dataIndex: 'gross_weight_kg', width: 110, align: 'right' as const, render: (v: number | null) => v != null ? <b style={{ color: '#92400E' }}>{v.toLocaleString('vi-VN')} kg</b> : <span style={{ color: '#bbb' }}>—</span> },
        colWeighed,
      ]
    : [
        { title: '#', key: 'idx', width: 40, render: (_: any, __: any, i: number) => i + 1 },
        { title: 'Hành trình', dataIndex: 'route', render: (v: string) => v || '–' },
        { title: 'Nội dung / hàng hóa', dataIndex: 'grade', render: (v: string) => v || '–' },
        { title: 'KL (kg)', dataIndex: 'weight_kg', width: 120, align: 'right' as const, render: (v: number) => v ? `${v.toLocaleString('vi-VN')} kg` : '–' },
        { title: 'Ghi chú', dataIndex: 'note', render: (v: string) => v || '–' },
      ]

  const nexts = NEXT_STATUS[order.status]

  return (
    <div style={{ padding: 20, maxWidth: 1680, margin: '0 auto', fontSize: 15 }}>
      <Breadcrumb style={{ marginBottom: 8 }} items={[
        { title: <a onClick={() => navigate('/logistics/dispatch')}>Lệnh điều động</a> },
        { title: order.code },
      ]} />

      <Card>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
          <Space align="center">
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/logistics/dispatch')} />
            <Title level={4} style={{ margin: 0 }}>{order.code}</Title>
            <Tag color={STATUS_COLOR[order.status]}>{DISPATCH_STATUS_LABELS[order.status]}</Tag>
          </Space>
          <Space wrap>
            {lines.some(l => l.actual_weight_kg == null) && (
              <Popconfirm
                // Hàng thương mại bốc ở nhà máy NGOÀI → xe KHÔNG qua trạm cân Huy Anh →
                // actual_weight_kg mãi NULL → Đơn hàng bán sẽ mãi báo "còn thiếu".
                // Nút này là lối duy nhất để chốt đã giao → phải nói rõ cho người dùng.
                title={isTrading ? 'Đánh dấu ĐÃ GIAO (hàng bốc ngoài)?' : 'Đánh dấu lệnh này đã cân?'}
                description={isTrading
                  ? 'Hàng thương mại không qua trạm cân Huy Anh. Bấm nút này thì Đơn hàng bán mới trừ vào "Còn thiếu (tấn)".'
                  : 'Các container chưa cân sẽ được đánh dấu Đã cân → Đơn hàng bán tự cập nhật giao hàng.'}
                okText={isTrading ? 'Đã giao' : 'Đã cân'} cancelText="Huỷ"
                onConfirm={doMarkWeighed}
              >
                <Button type="primary" ghost loading={weighing} icon={<CheckCircleOutlined />}>
                  {isTrading ? 'Đánh dấu ĐÃ GIAO (bốc ngoài)' : 'Đánh dấu đã cân'}
                </Button>
              </Popconfirm>
            )}
            <Button icon={<PrinterOutlined />} onClick={() => window.open(`/logistics/dispatch/${id}/print?doc=order`, '_blank')}>In lệnh điều động</Button>
            <Button icon={<FileTextOutlined />} onClick={() => window.open(`/logistics/dispatch/${id}/print?doc=handover`, '_blank')}>In biên bản bàn giao</Button>
            {order.status !== 'completed' && (
              <Button icon={<EditOutlined />} onClick={() => navigate(`/logistics/dispatch/${id}/edit`)}>Sửa</Button>
            )}
            {nexts.length > 0 && (
              <Dropdown menu={{
                items: nexts.map(s => ({
                  key: s,
                  label: DISPATCH_STATUS_LABELS[s],
                  icon: s === 'dispatched' ? <SendOutlined /> : s === 'completed' ? <CheckCircleOutlined /> : undefined,
                  onClick: () => changeStatus(s),
                })),
              }}>
                <Button type="primary">Đổi trạng thái <DownOutlined /></Button>
              </Dropdown>
            )}
            <Popconfirm title="Xoá lệnh này?" onConfirm={onDelete} okText="Xoá" cancelText="Huỷ">
              <Button danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </Space>
        </div>

        <Descriptions bordered size="middle" column={{ xs: 1, sm: 2, md: 3 }} labelStyle={{ fontWeight: 600 }} style={{ marginBottom: 20 }}>
          <Descriptions.Item label="Ngày điều động">{dayjs(order.dispatch_date).format('DD/MM/YYYY')}</Descriptions.Item>
          <Descriptions.Item label="Loại chuyến">{TRIP_TYPE_LABELS[order.trip_type]}</Descriptions.Item>
          <Descriptions.Item label="Đơn hàng bán">{order.sales_order ? <a onClick={() => navigate(`/sales/${order.sales_order_id}`)}>{soDisplayCode(order.sales_order)}</a> : '–'}</Descriptions.Item>
          <Descriptions.Item label="Đầu kéo">{order.tractor_plate ? <Tag icon={<TruckOutlined />} color="blue">{order.tractor_plate}</Tag> : '–'}</Descriptions.Item>
          <Descriptions.Item label="Rơ-moóc">{order.trailer_plate ? <Tag icon={<CarOutlined />} color="gold">{order.trailer_plate}</Tag> : '–'}</Descriptions.Item>
          <Descriptions.Item label="Tài xế">{order.driver_name ? <Space size={4}><IdcardOutlined />{order.driver_name}{order.driver_phone && <Text type="secondary">· {order.driver_phone}</Text>}</Space> : '–'}</Descriptions.Item>
          <Descriptions.Item label="Phương tiện">{order.is_hired
            ? <Space size={4} wrap><Tag color="orange">🤝 Thuê ngoài</Tag>{order.hire_company || ''}{order.hire_cost ? <Text type="secondary">· cước {Number(order.hire_cost).toLocaleString('vi-VN')}đ</Text> : null}</Space>
            : <Tag color="green">Đội xe nhà</Tag>}</Descriptions.Item>
          <Descriptions.Item label="Khách hàng">{order.customer_name || '–'}</Descriptions.Item>
          <Descriptions.Item label={isPort ? 'Điểm giao / Cảng' : 'Điểm đến / nơi nhận'}>{order.destination || '–'}</Descriptions.Item>
          {(order.pickup_location || order.pickup_contact) && (
            <Descriptions.Item label="📦 Điểm BỐC hàng">
              <b>{order.pickup_location || '–'}</b>
              {order.pickup_contact ? <span style={{ color: '#64748b' }}> — LH: {order.pickup_contact}</span> : null}
            </Descriptions.Item>
          )}
          <Descriptions.Item label="Căn cứ HĐ / Booking">{order.contract_ref || '–'}</Descriptions.Item>
          <Descriptions.Item label="Người nhận">{order.recipient_name || '–'}</Descriptions.Item>
          <Descriptions.Item label="SĐT người nhận">{order.recipient_phone || '–'}</Descriptions.Item>
          <Descriptions.Item label="Lý do">{order.reason || '–'}</Descriptions.Item>
          {order.note && <Descriptions.Item label="Ghi chú" span={3}>{order.note}</Descriptions.Item>}
        </Descriptions>

        <Title level={4} style={{ marginTop: 8 }}>{isPort ? 'Container' : 'Chi tiết chuyến'} ({order.total_lines}) — tổng {order.total_weight.toLocaleString('vi-VN')} kg</Title>
        <Table rowKey="id" size="middle" pagination={false} columns={lineColumns as any} dataSource={lines}
          scroll={{ x: isPort ? 900 : 600 }}
          locale={{ emptyText: isPort ? 'Chưa có container' : 'Chuyến không có hàng (vd: đón khách) — bỏ trống là bình thường' }} />
      </Card>
    </div>
  )
}
