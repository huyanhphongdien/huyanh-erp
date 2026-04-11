// ============================================================================
// DOWNTIME LOG PAGE — Sự cố / dừng máy
// File: src/pages/production/DowntimeLogPage.tsx
// ============================================================================

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Tag, Typography, Button } from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { downtimeService, REASON_CATEGORIES, IMPACT_LEVELS, type Downtime } from '../../services/production/downtimeService'
import AdvancedDataTable, { type ColumnDef } from '../../components/common/AdvancedDataTable'

const { Text } = Typography
const formatDate = (d: string | null) => d ? new Date(d).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'

export default function DowntimeLogPage() {
  const navigate = useNavigate()
  const now = new Date()
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const today = now.toISOString().split('T')[0]

  const { data: downtimes = [], isLoading, refetch } = useQuery({
    queryKey: ['production-downtimes', monthStart],
    queryFn: () => downtimeService.getByDateRange(monthStart, today),
  })

  const columns: ColumnDef<Downtime>[] = [
    { key: 'reason_category', title: 'Loại', dataIndex: 'reason_category', width: 120,
      filterType: 'select', filterOptions: Object.entries(REASON_CATEGORIES).map(([v, l]) => ({ value: v, label: l })),
      render: (v) => <Tag color="orange">{REASON_CATEGORIES[v] || v}</Tag>,
      exportRender: (v) => REASON_CATEGORIES[v] || v },
    { key: 'reason_detail', title: 'Chi tiết', dataIndex: 'reason_detail', width: 200, ellipsis: true },
    { key: 'impact_level', title: 'Mức độ', dataIndex: 'impact_level', width: 100,
      render: (v) => { const cfg = IMPACT_LEVELS[v]; return cfg ? <Tag color={cfg.color}>{cfg.label}</Tag> : v } },
    { key: 'started_at', title: 'Bắt đầu', dataIndex: 'started_at', width: 130, sortable: true,
      render: (v) => formatDate(v) },
    { key: 'ended_at', title: 'Kết thúc', dataIndex: 'ended_at', width: 130,
      render: (v) => v ? formatDate(v) : <Tag color="red">Đang dừng</Tag> },
    { key: 'duration_minutes', title: 'Thời gian', dataIndex: 'duration_minutes', width: 90, align: 'right', sortable: true,
      render: (v) => v ? <Text strong>{v} phút</Text> : '—' },
    { key: 'resolution', title: 'Xử lý', dataIndex: 'resolution', width: 200, ellipsis: true },
  ]

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)} />
        <Text strong style={{ fontSize: 18, color: '#1B4D3E' }}>🔧 Downtime / Sự cố</Text>
      </div>
      <AdvancedDataTable<Downtime>
        columns={columns}
        dataSource={downtimes}
        rowKey="id"
        loading={isLoading}
        title="Sự cố sản xuất"
        dateRangeField="started_at"
        onRefresh={() => refetch()}
        exportFileName="Downtime_SX"
        pageSize={50}
      />
    </div>
  )
}
