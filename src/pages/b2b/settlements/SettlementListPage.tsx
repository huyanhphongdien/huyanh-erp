// ============================================================================
// SETTLEMENT LIST PAGE V2 — AdvancedDataTable with inline detail
// File: src/pages/b2b/settlements/SettlementListPage.tsx
// ============================================================================

import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Tag, Typography, Button, Tabs, Descriptions, Card, Row, Col, Statistic } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import {
  settlementService, Settlement, SETTLEMENT_STATUS_LABELS, SETTLEMENT_STATUS_COLORS,
  SETTLEMENT_TYPE_LABELS, SETTLEMENT_TYPE_COLORS,
} from '../../../services/b2b/settlementService'
import AdvancedDataTable, { type ColumnDef } from '../../../components/common/AdvancedDataTable'

const { Text } = Typography

const STATUS_TABS = [
  { key: 'all', label: 'Tất cả' },
  { key: 'draft', label: 'Nháp' },
  { key: 'pending_approval', label: 'Chờ duyệt' },
  { key: 'approved', label: 'Đã duyệt' },
  { key: 'paid', label: 'Đã thanh toán' },
]
const STATUS_OPTIONS = STATUS_TABS.filter(t => t.key !== 'all').map(t => ({ value: t.key, label: t.label }))

const formatCurrency = (v: number | null) => {
  if (!v) return '—'
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)} tỷ`
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)} tr`
  return v.toLocaleString('vi-VN')
}
const formatDate = (d: string | null) => d ? new Date(d).toLocaleDateString('vi-VN') : '—'

export default function SettlementListPage() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('all')

  const { data: allSettlements = [], isLoading, refetch } = useQuery({
    queryKey: ['b2b-settlements-all'],
    queryFn: async () => {
      const res = await settlementService.getSettlements({ page: 1, pageSize: 500 })
      return res.data
    },
    staleTime: 60000,
  })

  const tabData = useMemo(() => {
    if (activeTab === 'all') return allSettlements
    return allSettlements.filter(s => s.status === activeTab)
  }, [allSettlements, activeTab])

  const statusCounts = useMemo(() => {
    const c: Record<string, number> = { all: allSettlements.length }
    allSettlements.forEach(s => { c[s.status] = (c[s.status] || 0) + 1 })
    return c
  }, [allSettlements])

  const columns: ColumnDef<Settlement>[] = [
    { key: 'settlement_number', title: 'Mã QT', dataIndex: 'settlement_number', width: 130, sortable: true,
      render: (v) => <Text strong style={{ color: '#1B4D3E' }}>{v}</Text> },
    { key: 'partner', title: 'Đại lý', dataIndex: ['partner', 'name'], width: 160, ellipsis: true,
      render: (_, r) => <Text>{(r as any).partner?.name || '—'}</Text>,
      exportRender: (_, r) => (r as any).partner?.name || '' },
    { key: 'settlement_type', title: 'Loại', dataIndex: 'settlement_type', width: 100,
      render: (v) => <Tag color={SETTLEMENT_TYPE_COLORS[v as keyof typeof SETTLEMENT_TYPE_COLORS]}>{SETTLEMENT_TYPE_LABELS[v as keyof typeof SETTLEMENT_TYPE_LABELS] || v}</Tag> },
    { key: 'total_amount', title: 'Tổng giá trị', dataIndex: 'total_amount', width: 120, align: 'right', sortable: true,
      render: (v) => <Text strong style={{ color: '#1B4D3E' }}>{formatCurrency(v)}</Text>, exportRender: (v) => v || 0 },
    { key: 'total_advanced', title: 'Đã ứng', dataIndex: 'total_advanced', width: 110, align: 'right',
      render: (v) => <Text style={{ color: '#722ed1' }}>{formatCurrency(v)}</Text>, exportRender: (v) => v || 0 },
    { key: 'balance_due', title: 'Còn nợ', dataIndex: 'balance_due', width: 110, align: 'right', sortable: true,
      render: (v) => <Text strong style={{ color: v > 0 ? '#cf1322' : '#52c41a' }}>{formatCurrency(v)}</Text>, exportRender: (v) => v || 0 },
    { key: 'status', title: 'Trạng thái', dataIndex: 'status', width: 110,
      filterType: 'select', filterOptions: STATUS_OPTIONS,
      render: (v) => <Tag color={SETTLEMENT_STATUS_COLORS[v as keyof typeof SETTLEMENT_STATUS_COLORS]}>{SETTLEMENT_STATUS_LABELS[v as keyof typeof SETTLEMENT_STATUS_LABELS]}</Tag>,
      exportRender: (v) => SETTLEMENT_STATUS_LABELS[v as keyof typeof SETTLEMENT_STATUS_LABELS] || v },
    { key: 'created_at', title: 'Ngày tạo', dataIndex: 'created_at', width: 100, sortable: true,
      render: (v) => formatDate(v) },
  ]

  const renderInlineDetail = (s: Settlement) => {
    const aging = Math.floor((Date.now() - new Date(s.created_at).getTime()) / 86400000)
    return (
      <div style={{ padding: '4px 0' }}>
        <Row gutter={[16, 12]} style={{ marginBottom: 12 }}>
          <Col xs={6}><Card size="small" style={{ borderRadius: 10, textAlign: 'center' }}>
            <Statistic title="Tổng giá trị" value={s.total_amount || 0} formatter={v => formatCurrency(Number(v))} valueStyle={{ fontSize: 18, color: '#1B4D3E' }} />
          </Card></Col>
          <Col xs={6}><Card size="small" style={{ borderRadius: 10, textAlign: 'center' }}>
            <Statistic title="Đã ứng" value={s.total_advanced || 0} formatter={v => formatCurrency(Number(v))} valueStyle={{ fontSize: 18, color: '#722ed1' }} />
          </Card></Col>
          <Col xs={6}><Card size="small" style={{ borderRadius: 10, textAlign: 'center' }}>
            <Statistic title="Còn nợ" value={s.balance_due || 0} formatter={v => formatCurrency(Number(v))} valueStyle={{ fontSize: 18, color: (s.balance_due || 0) > 0 ? '#cf1322' : '#52c41a' }} />
          </Card></Col>
          <Col xs={6}><Card size="small" style={{ borderRadius: 10, textAlign: 'center' }}>
            <Statistic title="Aging" value={aging} suffix="ngày" valueStyle={{ fontSize: 18, color: aging > 30 ? '#cf1322' : aging > 14 ? '#fa8c16' : '#52c41a' }} />
          </Card></Col>
        </Row>
        <Descriptions size="small" column={{ xs: 1, sm: 2, md: 3 }} labelStyle={{ fontWeight: 600 }}>
          <Descriptions.Item label="Mã QT">{s.settlement_number}</Descriptions.Item>
          <Descriptions.Item label="Trạng thái"><Tag color={SETTLEMENT_STATUS_COLORS[s.status as keyof typeof SETTLEMENT_STATUS_COLORS]}>{SETTLEMENT_STATUS_LABELS[s.status as keyof typeof SETTLEMENT_STATUS_LABELS]}</Tag></Descriptions.Item>
          <Descriptions.Item label="Đại lý">{(s as any).partner?.name || '—'}</Descriptions.Item>
          <Descriptions.Item label="Loại">{SETTLEMENT_TYPE_LABELS[s.settlement_type as keyof typeof SETTLEMENT_TYPE_LABELS] || s.settlement_type}</Descriptions.Item>
          <Descriptions.Item label="Ngày tạo">{formatDate(s.created_at)}</Descriptions.Item>
          <Descriptions.Item label="Ghi chú">{(s as any).notes || '—'}</Descriptions.Item>
        </Descriptions>
        <div style={{ marginTop: 8 }}>
          <Button type="link" onClick={() => navigate(`/b2b/settlements/${s.id}`)}>Xem chi tiết đầy đủ →</Button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: 24, maxWidth: 1600, margin: '0 auto' }}>
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        style={{ marginBottom: 16 }}
        items={STATUS_TABS.map(tab => ({
          key: tab.key,
          label: <span>{tab.label} {statusCounts[tab.key] > 0 && <Tag style={{ marginLeft: 4, fontSize: 10 }}>{statusCounts[tab.key]}</Tag>}</span>,
        }))}
        tabBarExtraContent={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/b2b/settlements/new')} style={{ background: '#1B4D3E' }}>
            Tạo phiếu QT
          </Button>
        }
      />
      <AdvancedDataTable<Settlement>
        columns={columns}
        dataSource={tabData}
        rowKey="id"
        loading={isLoading}
        title="Quyết toán B2B"
        dateRangeField="created_at"
        onRefresh={() => refetch()}
        expandedRowRender={renderInlineDetail}
        exportFileName="Quyet_Toan_B2B"
        pageSize={50}
      />
    </div>
  )
}
