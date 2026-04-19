// ============================================================================
// DEAL LIST PAGE V2 — AdvancedDataTable with filter row + Excel export
// File: src/pages/b2b/deals/DealListPage.tsx
// ============================================================================

import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Tag, Typography, Button, Tabs } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import {
  dealService,
  Deal,
  DealStatus,
  DEAL_STATUS_LABELS,
  DEAL_STATUS_COLORS,
  DEAL_TYPE_LABELS,
} from '../../../services/b2b/dealService'
import AdvancedDataTable, { type ColumnDef } from '../../../components/common/AdvancedDataTable'
// DealInlineDetail bỏ — click row thay vì expand inline

const { Text } = Typography

const STATUS_TABS = [
  { key: 'all', label: 'Tất cả' },
  { key: 'pending', label: 'Chờ xử lý' },
  { key: 'processing', label: 'Đang xử lý' },
  { key: 'accepted', label: 'Đã duyệt' },
  { key: 'settled', label: 'Đã quyết toán' },
  { key: 'cancelled', label: 'Đã hủy' },
]

const formatCurrency = (v: number | null): string => {
  if (!v) return '—'
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)} tỷ`
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)} tr`
  return v.toLocaleString('vi-VN')
}

const formatDate = (d: string | null) => d ? new Date(d).toLocaleDateString('vi-VN') : '—'

// ============================================================================
// COMPONENT
// ============================================================================

const DealListPage = () => {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('all')

  const { data: allDeals = [], isLoading, refetch } = useQuery({
    queryKey: ['b2b-deals-all'],
    queryFn: async () => {
      const response = await dealService.getDeals({ page: 1, pageSize: 500 })
      return response.data
    },
    staleTime: 60000,
  })

  // Filter by tab
  const tabDeals = useMemo(() => {
    if (activeTab === 'all') return allDeals
    return allDeals.filter(d => d.status === activeTab)
  }, [allDeals, activeTab])

  // Status counts
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: allDeals.length }
    allDeals.forEach(d => { counts[d.status] = (counts[d.status] || 0) + 1 })
    return counts
  }, [allDeals])

  const columns: ColumnDef<Deal>[] = [
    {
      key: 'deal_number',
      title: 'Mã Deal',
      dataIndex: 'deal_number',
      width: 140,
      sortable: true,
      render: (v) => (
        <Text strong style={{ color: '#1B4D3E' }}>{v}</Text>
      ),
      exportRender: (v) => v || '',
    },
    {
      key: 'partner_name',
      title: 'Đại lý',
      dataIndex: ['partner', 'name'],
      width: 180,
      sortable: true,
      render: (_, r) => (
        <div>
          <Text strong style={{ fontSize: 13 }}>{r.partner?.name || '—'}</Text>
          <div style={{ fontSize: 11, color: '#999' }}>
            {r.partner?.code}
            {r.partner?.tier && <Tag style={{ marginLeft: 4, fontSize: 10 }}>{r.partner.tier}</Tag>}
          </div>
        </div>
      ),
      exportRender: (_, r) => r.partner?.name || '',
    },
    {
      key: 'product_name',
      title: 'Sản phẩm',
      dataIndex: 'product_name',
      width: 120,
      ellipsis: true,
      exportRender: (v) => v || '',
    },
    {
      key: 'quantity',
      title: 'Số lượng (tấn)',
      dataIndex: 'quantity_tons',
      width: 110,
      align: 'right',
      sortable: true,
      render: (v) => v ? <Text strong>{v.toFixed(1)}</Text> : '—',
      exportRender: (v) => v || 0,
    },
    {
      key: 'unit_price',
      title: 'Đơn giá',
      dataIndex: 'unit_price',
      width: 100,
      align: 'right',
      sortable: true,
      render: (v) => v ? `${Number(v).toLocaleString('vi-VN')}` : '—',
      exportRender: (v) => v || 0,
    },
    {
      key: 'total_value',
      title: 'Giá trị',
      dataIndex: 'total_value_vnd',
      width: 120,
      align: 'right',
      sortable: true,
      render: (v) => <Text strong style={{ color: '#1B4D3E' }}>{formatCurrency(v)}</Text>,
      exportRender: (v) => v || 0,
    },
    {
      key: 'expected_drc',
      title: 'DRC (%)',
      dataIndex: 'expected_drc',
      width: 80,
      align: 'center',
      render: (v, r) => {
        if (r.actual_drc) return <Tag color="blue">{r.actual_drc}%</Tag>
        return v ? `${v}%` : '—'
      },
      exportRender: (_, r) => r.actual_drc || r.expected_drc || '',
    },
    {
      key: 'status',
      title: 'Trạng thái',
      dataIndex: 'status',
      width: 120,
      filterType: 'select',
      filterOptions: STATUS_TABS.filter(t => t.key !== 'all').map(t => ({ value: t.key, label: t.label })),
      render: (v: DealStatus) => <Tag color={DEAL_STATUS_COLORS[v]}>{DEAL_STATUS_LABELS[v]}</Tag>,
      exportRender: (v) => DEAL_STATUS_LABELS[v as DealStatus] || v,
    },
    {
      key: 'source_region',
      title: 'Vùng',
      dataIndex: 'source_region',
      width: 100,
      ellipsis: true,
    },
    {
      key: 'created_at',
      title: 'Ngày tạo',
      dataIndex: 'created_at',
      width: 100,
      sortable: true,
      render: (v) => formatDate(v),
      exportRender: (v) => v ? new Date(v).toLocaleDateString('vi-VN') : '',
    },
    // Actions column removed — floating eye button handles detail view
  ]

  return (
    <div style={{ padding: 24, maxWidth: 1600, margin: '0 auto' }}>
      {/* Tabs */}
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        style={{ marginBottom: 16 }}
        items={STATUS_TABS.map(tab => ({
          key: tab.key,
          label: (
            <span>
              {tab.label}
              {statusCounts[tab.key] > 0 && (
                <Tag style={{ marginLeft: 6, fontSize: 10 }}>{statusCounts[tab.key]}</Tag>
              )}
            </span>
          ),
        }))}
        tabBarExtraContent={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/b2b/deals/new')} style={{ background: '#1B4D3E' }}>
            Tạo Deal
          </Button>
        }
      />

      {/* Table — click row → điều hướng DealDetailPage. Không còn expand
          inline (tránh trùng UX với trang detail). */}
      <AdvancedDataTable<Deal>
        columns={columns}
        dataSource={tabDeals}
        rowKey="id"
        loading={isLoading}
        title={`Deals B2B`}
        dateRangeField="created_at"
        onRefresh={() => refetch()}
        onRowClick={(deal) => navigate(`/b2b/deals/${deal.id}`)}
        exportFileName="B2B_Deals"
        pageSize={50}
      />
    </div>
  )
}

export default DealListPage
