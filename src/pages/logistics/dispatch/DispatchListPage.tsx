// ============================================================================
// FILE: src/pages/logistics/dispatch/DispatchListPage.tsx
// MODULE: Vận tải / Lệnh điều động — danh sách
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOpenTab } from '../../../hooks/useOpenTab'
import {
  Card, Table, Button, Space, Typography, Tag, Input, Select, Segmented, Breadcrumb, DatePicker,
} from 'antd'
import { PlusOutlined, ReloadOutlined, SendOutlined, TruckOutlined, CarOutlined, IdcardOutlined } from '@ant-design/icons'
import type { Dayjs } from 'dayjs'
import {
  dispatchService, DISPATCH_STATUS_LABELS, DISPATCH_STATUS_COLORS, isContainerTrip,
  FETCH_RUBBER_LABELS, palletOutKg,
  dispatchCategoryLabel, tripCardFor, TRIP_GROUP_META,
  type DispatchOrder, type DispatchStatus, type TripVehicleGroup,
} from '../../../services/logistics/dispatchService'
import { DASH, fmtDate } from '../../../utils/format'
import PageState from '../../../components/common/PageState'
import { LimitNotice, stdPagination } from '../../../components/common/tableDefaults'

const { Title } = Typography

/** Trần tải một lần (mới tạo trước). Chạm trần → hiện LimitNotice, lọc theo ngày để xem lệnh cũ. */
const LOAD_LIMIT = 200

export default function DispatchListPage() {
  const navigate = useNavigate()
  const openTab = useOpenTab()
  const [rows, setRows] = useState<DispatchOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<unknown>(null)
  const [filter, setFilter] = useState<DispatchStatus | 'all'>('all')
  const [groupFilter, setGroupFilter] = useState<'all' | TripVehicleGroup>('all')
  const [search, setSearch] = useState('')
  // Lọc theo NGÀY ĐIỀU ĐỘNG (service đã nhận date_from/date_to). Mặc định để trống = như cũ (200 lệnh mới
  // nhất): đặt sẵn "30 ngày gần nhất" sẽ giấu lệnh lên lịch cho ngày tới và lệnh nháp cũ chưa chạy.
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null)
  const dateFrom = range?.[0]?.format('YYYY-MM-DD')
  const dateTo = range?.[1]?.format('YYYY-MM-DD')

  const load = useCallback(async () => {
    setLoading(true)
    setLoadErr(null)
    try {
      setRows(await dispatchService.list({
        status: filter === 'all' ? undefined : filter,
        search: search || undefined,
        date_from: dateFrom,
        date_to: dateTo,
        limit: LOAD_LIMIT,
      }))
    } catch (e: any) {
      // Không để bảng hiện "trống" khi tải hỏng — PageState báo lỗi + nút Thử lại.
      setLoadErr(e)
    }
    setLoading(false)
  }, [filter, search, dateFrom, dateTo])

  useEffect(() => { load() }, [load])

  // Lọc theo nhóm xe (client-side trên các dòng đã tải) — gom theo thẻ loại chuyến.
  const shown = groupFilter === 'all'
    ? rows
    : rows.filter(r => tripCardFor(r.trip_type, r.cargo_kind)?.group === groupFilter)

  const columns = [
    { title: 'Mã lệnh', dataIndex: 'code', key: 'code', width: 140, render: (v: string) => <b>{v}</b> },
    { title: 'Ngày', dataIndex: 'dispatch_date', key: 'date', width: 110, render: (v: string) => fmtDate(v) },
    { title: 'Loại chuyến', key: 'trip', width: 180, render: (_: any, r: DispatchOrder) => <span>{dispatchCategoryLabel(r.trip_type, r.cargo_kind)}</span> },
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
      return <span>{[r.customer_name, r.destination].filter(Boolean).join(' → ') || DASH}</span>
    } },
    {
      // Đi cảng: số container. Đi lấy mủ: số pallet mang đi. Chuyến khác: số dòng hành trình.
      title: 'Cont/Pallet', dataIndex: 'total_lines', key: 'lines', width: 90, align: 'center' as const,
      render: (v: number, r: DispatchOrder) => {
        if (r.trip_type === 'fetch_mu') {
          const p = r.pallet_plastic_out || 0, s = r.pallet_steel_out || 0
          return (p || s)
            ? <span title={`${p} nhựa + ${s} sắt = ${palletOutKg(p, s).toLocaleString('vi-VN')} kg`}>📦 {p + s}</span>
            : DASH
        }
        return isContainerTrip(r.trip_type) ? (v || 0) : (v ? v : DASH)
      },
    },
    { title: 'KL (kg)', dataIndex: 'total_weight', key: 'w', width: 110, align: 'right' as const,
      render: (v: number, r: DispatchOrder) => (r.trip_type === 'fetch_mu' ? <span style={{ color: '#94a3b8' }}>cân sau</span> : (v ? v.toLocaleString('vi-VN') : DASH)) },
    { title: 'Trạng thái', dataIndex: 'status', key: 'status', width: 130, render: (s: DispatchStatus) => <Tag color={DISPATCH_STATUS_COLORS[s]}>{DISPATCH_STATUS_LABELS[s]}</Tag> },
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
                props: {},
                path: '/logistics/dispatch/new',
              })}
            >Tạo lệnh</Button>
          </Space>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
          <Segmented
            value={filter}
            onChange={v => setFilter(v as any)}
            options={[
              { label: 'Tất cả', value: 'all' },
              ...(['draft', 'dispatched', 'in_transit', 'completed', 'cancelled'] as DispatchStatus[]).map(s => ({ label: DISPATCH_STATUS_LABELS[s], value: s })),
            ]}
          />
          <Select
            value={groupFilter} onChange={v => setGroupFilter(v)} style={{ width: 200 }}
            options={[
              { value: 'all', label: 'Mọi nhóm xe' },
              ...(['cont', 'truck', 'car', 'other'] as TripVehicleGroup[]).map(g => ({
                value: g, label: `${TRIP_GROUP_META[g].icon} ${TRIP_GROUP_META[g].label}`,
              })),
            ]}
          />
          <DatePicker.RangePicker
            value={range} format="DD/MM/YYYY" allowClear placeholder={['Từ ngày điều động', 'Đến ngày']}
            onChange={v => setRange(v && v[0] && v[1] ? [v[0], v[1]] as [Dayjs, Dayjs] : null)}
          />
        </div>

        <PageState error={loadErr} onRetry={load}>
        <LimitNotice shown={rows.length} limit={LOAD_LIMIT} what="lệnh" />
        <Table rowKey="id" size="middle" loading={loading} columns={columns as any} dataSource={shown}
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
          pagination={stdPagination(20)} />
        </PageState>
      </Card>
    </div>
  )
}
