import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Card, Table, Tag, Typography, Space, DatePicker, Row, Col, Breadcrumb, Button,
} from 'antd'
import { TruckOutlined, ReloadOutlined, InboxOutlined } from '@ant-design/icons'
import dayjs, { Dayjs } from 'dayjs'
import {
  dispatchService, FETCH_RUBBER_LABELS, type DispatchOrder,
} from '../../../services/logistics/dispatchService'

const { Title, Text } = Typography

// KL mủ chênh > 1% giữa TL và PĐ → đáng chú ý (ngoài lệch cân ~0,9%).
const DIFF_PCT_WARN = 1

export default function FetchReportPage() {
  const navigate = useNavigate()
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null)

  const { data: trips = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ['fetch-report', range?.[0]?.format('YYYY-MM-DD'), range?.[1]?.format('YYYY-MM-DD')],
    queryFn: () => dispatchService.listFetchReport({
      date_from: range?.[0]?.format('YYYY-MM-DD'),
      date_to: range?.[1]?.format('YYYY-MM-DD'),
    }),
    staleTime: 60 * 1000,
  })

  // ── Sổ pallet: số dư đang ở TL = Σ(đi) − Σ(về), chỉ tính chuyến ĐÃ chốt pallet về ──
  const settled = trips.filter(t => t.pallet_plastic_return != null || t.pallet_steel_return != null)
  const sum = (arr: DispatchOrder[], f: (t: DispatchOrder) => number) => arr.reduce((s, t) => s + f(t), 0)
  const outN = sum(settled, t => t.pallet_plastic_out || 0)
  const outS = sum(settled, t => t.pallet_steel_out || 0)
  const retN = sum(settled, t => t.pallet_plastic_return || 0)
  const retS = sum(settled, t => t.pallet_steel_return || 0)
  const atTlN = outN - retN
  const atTlS = outS - retS
  const inTransit = trips.length - settled.length

  const columns = [
    { title: 'Ngày', dataIndex: 'dispatch_date', width: 100, render: (v: string) => dayjs(v).format('DD/MM/YYYY') },
    { title: 'Lệnh', dataIndex: 'code', width: 140, render: (v: string, r: DispatchOrder) => <a onClick={() => navigate(`/logistics/dispatch/${r.id}`)}><b>{v}</b></a> },
    { title: 'Xe / Tài xế', width: 200, render: (_: any, r: DispatchOrder) => (
      <Space size={4} wrap>
        {r.tractor_plate && <Tag icon={<TruckOutlined />} color="blue">{r.tractor_plate}</Tag>}
        {r.driver_name && <Text type="secondary">{r.driver_name}</Text>}
      </Space>
    ) },
    { title: 'Mủ / Lô', width: 150, render: (_: any, r: DispatchOrder) => (
      <span>{r.fetch_rubber_type ? (FETCH_RUBBER_LABELS[r.fetch_rubber_type] || r.fetch_rubber_type) : '–'}{r.fetch_lot_code ? ` · ${r.fetch_lot_code}` : ''}</span>
    ) },
    {
      title: 'Pallet (đi → rời TL → để lại)', width: 230, render: (_: any, r: DispatchOrder) => {
        const hasReturn = r.pallet_plastic_return != null || r.pallet_steel_return != null
        const leftN = (r.pallet_plastic_out || 0) - (r.pallet_plastic_return || 0)
        const leftS = (r.pallet_steel_out || 0) - (r.pallet_steel_return || 0)
        return (
          <span style={{ fontSize: 13 }}>
            {r.pallet_plastic_out || 0}N+{r.pallet_steel_out || 0}S
            {' → '}
            {hasReturn ? <b>{r.pallet_plastic_return || 0}N+{r.pallet_steel_return || 0}S{r.fetch_tl_skipped ? ' 🚛' : ''}</b> : <Text type="secondary">⏳</Text>}
            {hasReturn && <>{' → '}<Text type="secondary">{leftN}N+{leftS}S</Text></>}
          </span>
        )
      },
    },
    {
      title: 'KL mủ (TL / PĐ)', width: 210, render: (_: any, r: DispatchOrder) => {
        const tl = r.tl_net_kg, pd = r.pd_net_kg
        let diffEl = null
        if (tl != null && pd != null && tl > 0) {
          const diff = pd - tl
          const pct = Math.abs(diff) / tl * 100
          diffEl = <Text style={{ color: pct > DIFF_PCT_WARN ? '#dc2626' : '#15803d' }}> ({diff > 0 ? '+' : ''}{diff.toLocaleString('vi-VN')}kg · {pct.toFixed(1)}%)</Text>
        }
        return (
          <span style={{ fontSize: 13 }}>
            {r.fetch_tl_skipped ? <Tag color="orange">🚛 TL bỏ cân</Tag> : (tl != null ? <b>{tl.toLocaleString('vi-VN')}</b> : <Text type="secondary">⏳</Text>)}
            {' / '}
            {pd != null ? <b>{pd.toLocaleString('vi-VN')}</b> : <Text type="secondary">⏳</Text>}
            {diffEl}
          </span>
        )
      },
    },
    {
      title: 'Trạng thái', width: 120, render: (_: any, r: DispatchOrder) => {
        if (r.pd_net_kg != null) return <Tag color="green">Xong</Tag>
        if (r.tl_net_kg != null || r.fetch_tl_skipped) return <Tag color="blue">Chờ PĐ cân về</Tag>
        return <Tag>Đang lấy mủ</Tag>
      },
    },
  ]

  return (
    <div style={{ padding: 20 }}>
      <Breadcrumb style={{ marginBottom: 8 }} items={[{ title: 'Vận tải' }, { title: 'Báo cáo đi lấy mủ' }]} />
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
          <Title level={4} style={{ margin: 0 }}><TruckOutlined /> Báo cáo đi lấy mủ (TL → PĐ)</Title>
          <Space>
            <DatePicker.RangePicker value={range as any} onChange={(v) => setRange(v as any)} format="DD/MM/YYYY" allowClear />
            <Button icon={<ReloadOutlined />} onClick={() => refetch()} loading={isFetching}>Làm mới</Button>
          </Space>
        </div>

        {/* SỔ PALLET — số dư đang ở Tân Lâm */}
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col xs={24} md={12}>
            <Card size="small" style={{ background: '#F0F9FF', borderColor: '#BAE6FD' }}>
              <div style={{ fontWeight: 600, color: '#0369A1', marginBottom: 8 }}><InboxOutlined /> Sổ pallet — đang ở Tân Lâm (đã chốt)</div>
              <Space size={32} wrap>
                <span>Nhựa: đi <b>{outN}</b> · về <b>{retN}</b> · <Text strong style={{ color: atTlN > 0 ? '#b45309' : '#15803d', fontSize: 16 }}>còn ở TL: {atTlN}</Text></span>
                <span>Sắt: đi <b>{outS}</b> · về <b>{retS}</b> · <Text strong style={{ color: atTlS > 0 ? '#b45309' : '#15803d', fontSize: 16 }}>còn ở TL: {atTlS}</Text></span>
              </Space>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 6 }}>
                "Còn ở TL" = pallet PĐ gửi đi chưa mang về (Σ đi − Σ về). Số dương lớn = pallet đang tồn/thất thoát ở TL.
              </div>
            </Card>
          </Col>
          <Col xs={24} md={12}>
            <Card size="small">
              <Space size={32} wrap>
                <span>Tổng chuyến: <b>{trips.length}</b></span>
                <span>Đang lấy mủ (chưa chốt pallet): <b style={{ color: inTransit ? '#b45309' : undefined }}>{inTransit}</b></span>
                <span>Xe container (TL bỏ cân): <b>{trips.filter(t => t.fetch_tl_skipped).length}</b></span>
              </Space>
            </Card>
          </Col>
        </Row>

        <Table
          rowKey="id" size="middle" loading={isLoading} pagination={{ pageSize: 20 }}
          columns={columns as any} dataSource={trips} scroll={{ x: 1050 }}
          locale={{ emptyText: 'Chưa có chuyến đi lấy mủ nào' }}
        />
      </Card>
    </div>
  )
}
