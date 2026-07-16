// ============================================================================
// FILE: src/pages/logistics/dispatch/DispatchListPage.tsx
// MODULE: Vận tải / Lệnh điều động — danh sách
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOpenTab } from '../../../hooks/useOpenTab'
import {
  Card, Table, Button, Space, Typography, Tag, Input, Segmented, message, Breadcrumb,
} from 'antd'
import { PlusOutlined, ReloadOutlined, SendOutlined, TruckOutlined, CarOutlined, IdcardOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import {
  dispatchService, DISPATCH_STATUS_LABELS, TRIP_TYPE_LABELS, isContainerTrip,
  FETCH_RUBBER_LABELS, palletOutKg,
  type DispatchOrder, type DispatchStatus,
} from '../../../services/logistics/dispatchService'

const { Title } = Typography

const STATUS_COLOR: Record<DispatchStatus, string> = {
  draft: 'default', dispatched: 'blue', in_transit: 'gold', completed: 'green', cancelled: 'red',
}

export default function DispatchListPage() {
  const navigate = useNavigate()
  const openTab = useOpenTab()
  const [rows, setRows] = useState<DispatchOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<DispatchStatus | 'all'>('all')
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setRows(await dispatchService.list({
        status: filter === 'all' ? undefined : filter,
        search: search || undefined,
        limit: 200,
      }))
    } catch (e: any) {
      message.error('Lỗi tải lệnh điều động: ' + (e?.message || e))
    }
    setLoading(false)
  }, [filter, search])

  useEffect(() => { load() }, [load])

  const columns = [
    { title: 'Mã lệnh', dataIndex: 'code', key: 'code', width: 140, render: (v: string) => <b>{v}</b> },
    { title: 'Ngày', dataIndex: 'dispatch_date', key: 'date', width: 110, render: (v: string) => dayjs(v).format('DD/MM/YYYY') },
    { title: 'Loại', dataIndex: 'trip_type', key: 'trip', width: 150, render: (v: keyof typeof TRIP_TYPE_LABELS) => TRIP_TYPE_LABELS[v] || v },
    {
      title: 'Xe / Tài xế', key: 'veh', render: (_: any, r: DispatchOrder) => (
        <Space size={4} wrap>
          {r.tractor_plate && <Tag icon={<TruckOutlined />} color="blue">{r.tractor_plate}</Tag>}
          {r.trailer_plate && <Tag icon={<CarOutlined />} color="gold">{r.trailer_plate}</Tag>}
          {r.driver_name && <Tag icon={<IdcardOutlined />}>{r.driver_name}</Tag>}
        </Space>
      ),
    },
    { title: 'Khách / Điểm đến', key: 'cust', render: (_: any, r: DispatchOrder) => {
      // Đi lấy mủ: không có khách/điểm giao → hiện nơi lấy + loại mủ + lô cho dễ nhận.
      if (r.trip_type === 'fetch_mu') {
        const parts = [
          r.pickup_location,
          r.fetch_rubber_type ? (FETCH_RUBBER_LABELS[r.fetch_rubber_type] || r.fetch_rubber_type) : null,
          r.fetch_lot_code ? `lô ${r.fetch_lot_code}` : null,
        ].filter(Boolean)
        return <span style={{ color: '#0369A1' }}>🌳 Lấy mủ{parts.length ? ': ' + parts.join(' · ') : ''}</span>
      }
      return <span>{[r.customer_name, r.destination].filter(Boolean).join(' → ') || '–'}</span>
    } },
    {
      // Đi cảng: số container. Đi lấy mủ: số pallet mang đi. Chuyến khác: số dòng hành trình.
      title: 'Cont/Pallet', dataIndex: 'total_lines', key: 'lines', width: 90, align: 'center' as const,
      render: (v: number, r: DispatchOrder) => {
        if (r.trip_type === 'fetch_mu') {
          const p = r.pallet_plastic_out || 0, s = r.pallet_steel_out || 0
          return (p || s)
            ? <span title={`${p} nhựa + ${s} sắt = ${palletOutKg(p, s).toLocaleString('vi-VN')} kg`}>📦 {p + s}</span>
            : '–'
        }
        return isContainerTrip(r.trip_type) ? (v || 0) : (v ? v : '–')
      },
    },
    { title: 'KL (kg)', dataIndex: 'total_weight', key: 'w', width: 110, align: 'right' as const,
      render: (v: number, r: DispatchOrder) => (r.trip_type === 'fetch_mu' ? <span style={{ color: '#94a3b8' }}>cân sau</span> : (v ? v.toLocaleString('vi-VN') : '–')) },
    { title: 'Trạng thái', dataIndex: 'status', key: 'status', width: 130, render: (s: DispatchStatus) => <Tag color={STATUS_COLOR[s]}>{DISPATCH_STATUS_LABELS[s]}</Tag> },
  ]

  return (
    <div style={{ padding: 20, fontSize: 15 }}>
      <Breadcrumb style={{ marginBottom: 8 }} items={[{ title: 'Vận tải' }, { title: 'Lệnh điều động' }]} />
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <Title level={4} style={{ margin: 0 }}><SendOutlined /> Lệnh điều động xe</Title>
          <Space>
            <Input.Search placeholder="Tìm mã / biển số / tài xế / khách" allowClear style={{ width: 280 }}
              onSearch={setSearch} onChange={e => !e.target.value && setSearch('')} />
            <Button icon={<ReloadOutlined />} onClick={load} />
            <Button
              type="primary" icon={<PlusOutlined />}
              onClick={() => openTab({
                key: 'dispatch-create',
                title: 'Tạo lệnh điều động',
                componentId: 'dispatch-create',
                path: '/logistics/dispatch/new',
              })}
            >Tạo lệnh</Button>
          </Space>
        </div>

        <Segmented
          style={{ marginBottom: 12 }}
          value={filter}
          onChange={v => setFilter(v as any)}
          options={[
            { label: 'Tất cả', value: 'all' },
            ...(['draft', 'dispatched', 'in_transit', 'completed', 'cancelled'] as DispatchStatus[]).map(s => ({ label: DISPATCH_STATUS_LABELS[s], value: s })),
          ]}
        />

        <Table rowKey="id" size="middle" loading={loading} columns={columns as any} dataSource={rows}
          onRow={(r) => ({
            // Mở TAB chi tiết thay vì điều hướng — trang này giờ là 1 tab, navigate
            // sẽ đè mất tab đang mở (vd tab Đơn hàng bán bên cạnh).
            onClick: () => openTab({
              key: `dispatch-${r.id}`,
              title: `Lệnh ${r.code}`,
              componentId: 'dispatch-detail',
              props: { id: r.id },
              path: `/logistics/dispatch/${r.id}`,
            }),
            style: { cursor: 'pointer' },
          })}
          pagination={{ pageSize: 20, showSizeChanger: false }} />
      </Card>
    </div>
  )
}
