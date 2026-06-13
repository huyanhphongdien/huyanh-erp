// ============================================================================
// FILE: src/pages/logistics/dispatch/DispatchListPage.tsx
// MODULE: Vận tải / Lệnh điều động — danh sách
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Card, Table, Button, Space, Typography, Tag, Input, Segmented, message, Breadcrumb,
} from 'antd'
import { PlusOutlined, ReloadOutlined, SendOutlined, TruckOutlined, CarOutlined, IdcardOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import {
  dispatchService, DISPATCH_STATUS_LABELS, TRIP_TYPE_LABELS,
  type DispatchOrder, type DispatchStatus,
} from '../../../services/logistics/dispatchService'

const { Title } = Typography

const STATUS_COLOR: Record<DispatchStatus, string> = {
  draft: 'default', dispatched: 'blue', in_transit: 'gold', completed: 'green', cancelled: 'red',
}

export default function DispatchListPage() {
  const navigate = useNavigate()
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
    { title: 'Khách / Điểm giao', key: 'cust', render: (_: any, r: DispatchOrder) => <span>{[r.customer_name, r.destination].filter(Boolean).join(' → ') || '–'}</span> },
    { title: 'Cont', dataIndex: 'total_lines', key: 'lines', width: 70, align: 'center' as const },
    { title: 'KL (kg)', dataIndex: 'total_weight', key: 'w', width: 110, align: 'right' as const, render: (v: number) => v ? v.toLocaleString('vi-VN') : '–' },
    { title: 'Trạng thái', dataIndex: 'status', key: 'status', width: 130, render: (s: DispatchStatus) => <Tag color={STATUS_COLOR[s]}>{DISPATCH_STATUS_LABELS[s]}</Tag> },
  ]

  return (
    <div style={{ padding: 20, maxWidth: 1680, margin: '0 auto', fontSize: 15 }}>
      <Breadcrumb style={{ marginBottom: 8 }} items={[{ title: 'Vận tải' }, { title: 'Lệnh điều động' }]} />
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <Title level={4} style={{ margin: 0 }}><SendOutlined /> Lệnh điều động xe</Title>
          <Space>
            <Input.Search placeholder="Tìm mã / biển số / tài xế / khách" allowClear style={{ width: 280 }}
              onSearch={setSearch} onChange={e => !e.target.value && setSearch('')} />
            <Button icon={<ReloadOutlined />} onClick={load} />
            <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/logistics/dispatch/new')}>Tạo lệnh</Button>
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
          onRow={(r) => ({ onClick: () => navigate(`/logistics/dispatch/${r.id}`), style: { cursor: 'pointer' } })}
          pagination={{ pageSize: 20, showSizeChanger: false }} />
      </Card>
    </div>
  )
}
