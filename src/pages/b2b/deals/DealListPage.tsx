// ============================================================================
// DEAL LIST PAGE V2 — AdvancedDataTable with filter row + Excel export
// File: src/pages/b2b/deals/DealListPage.tsx
// ============================================================================

import { useState, useMemo } from 'react'
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
import { useOpenTab } from '../../../hooks/useOpenTab'
import { B2BSectionTabs, MUA_HANG_TABS } from '../../../components/b2b/B2BSectionTabs'
import { TIER_LABELS, TIER_COLORS } from '../../../services/b2b/partnerService'
import EnumTag from '../../../components/common/EnumTag'
import { fmtDate, fmtNum, fmtVndNum } from '../../../utils/format'
// DealInlineDetail bỏ — click row thay vì expand inline

const { Text } = Typography

// Tab trạng thái lấy thẳng từ DEAL_STATUS_LABELS (một map chung) — không chép lại nhãn
const STATUS_TABS = [
  { key: 'all', label: 'Tất cả' },
  ...Object.entries(DEAL_STATUS_LABELS).map(([key, label]) => ({ key, label })),
]

// Sổ Deal tải một cục tối đa N dòng — chạm trần thì bảng báo
const LOAD_LIMIT = 500

// Cột tiền in số ĐẦY ĐỦ (tiêu đề ghi ₫) — bản cũ viết tắt "1.23 tỷ"/"1.2 tr" chấm kiểu Mỹ (audit 17/11/2026)

// ============================================================================
// COMPONENT
// ============================================================================

const DealListPage = () => {
  const openTab = useOpenTab()
  const [activeTab, setActiveTab] = useState('all')

  const { data: allDeals = [], isLoading, error, refetch } = useQuery({
    queryKey: ['b2b-deals-all'],
    queryFn: async () => {
      const response = await dealService.getDeals({ page: 1, pageSize: LOAD_LIMIT })
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
            {r.partner?.tier && <EnumTag value={r.partner.tier} labels={TIER_LABELS} colors={TIER_COLORS} style={{ marginLeft: 4, fontSize: 10 }} />}
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
      render: (v) => v ? <Text strong>{fmtNum(v, 1)}</Text> : '—',
      exportRender: (v) => v || 0,
      exportNumFmt: '#,##0.0',
      summary: 'sum',
    },
    {
      key: 'fulfillment',
      title: 'Đã giao / HĐ',
      dataIndex: 'actual_weight_kg',
      width: 120,
      align: 'right',
      render: (_, r) => {
        const target = r.quantity_kg || 0
        const done = r.actual_weight_kg || 0
        if (target <= 0) return '—'
        const pct = Math.round((done / target) * 100)
        const enough = done >= target
        const color = enough ? '#16a34a' : pct >= 60 ? '#d97706' : '#dc2626'
        return (
          <div>
            <Text strong style={{ color, fontSize: 12.5 }}>
              {fmtNum(done / 1000, 1)}/{fmtNum(target / 1000, 1)} T
            </Text>
            <div style={{ fontSize: 10, color }}>{pct}%{enough ? ' ✓ đủ' : ''}</div>
          </div>
        )
      },
      exportRender: (_, r) => {
        const target = r.quantity_kg || 0
        const done = r.actual_weight_kg || 0
        return target > 0 ? `${(done / 1000).toFixed(1)}/${(target / 1000).toFixed(1)} T (${Math.round((done / target) * 100)}%)` : ''
      },
    },
    {
      key: 'unit_price',
      title: 'Đơn giá (₫/kg)',
      dataIndex: 'unit_price',
      width: 100,
      align: 'right',
      sortable: true,
      render: (v) => v ? `${Number(v).toLocaleString('vi-VN')}` : '—',
      exportRender: (v) => v || 0,
      exportNumFmt: '#,##0',
    },
    {
      key: 'total_value',
      title: 'Giá trị (₫)',
      dataIndex: 'total_value_vnd',
      width: 135,
      align: 'right',
      sortable: true,
      render: (v) => <Text strong style={{ color: '#1B4D3E' }}>{v ? fmtVndNum(v) : '—'}</Text>,
      exportRender: (v) => v || 0,
      exportNumFmt: '#,##0',
      summary: 'sum',
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
      exportNumFmt: '0"%"',
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
      render: (v) => fmtDate(v),
      exportRender: (v) => v ? fmtDate(v) : '',
    },
    // Actions column removed — floating eye button handles detail view
  ]

  return (
    <div style={{ padding: 24 }}>
      {/* B2B Section tabs */}
      <B2BSectionTabs tabs={MUA_HANG_TABS} active="deals" />

      {/* Status tabs (Nháp / Tất cả / ...) */}
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
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openTab({
            key: 'b2b-deal-create',
            title: 'Tạo Deal mới',
            componentId: 'b2b-deal-create',
            props: {},
            path: '/b2b/deals/new',
          })} style={{ background: '#1B4D3E' }}>
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
        error={error}
        loadLimit={LOAD_LIMIT}
        title="Sổ Deal (thoả thuận mua mủ với đại lý)"
        dateRangeField="created_at"
        onRefresh={() => refetch()}
        onRowClick={(deal) => openTab({
          key: `b2b-deal-${deal.id}`,
          title: `Deal ${deal.deal_number || deal.id.slice(0, 8)}`,
          componentId: 'b2b-deal-detail',
          props: { id: deal.id },
          path: `/b2b/deals/${deal.id}`,
        })}
        exportFileName="B2B_Deals"
        pageSize={50}
      />
    </div>
  )
}

export default DealListPage
