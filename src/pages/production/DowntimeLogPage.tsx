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
import { toDateStrVN } from '../../utils/dateVN'
import { fmtDateTime } from '../../utils/format'

const { Text } = Typography

export default function DowntimeLogPage() {
  const navigate = useNavigate()
  const now = new Date()
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  // Ngày hôm nay theo GIỜ MÁY (VN) — toISOString() là UTC: 00:00–07:00 sáng ra ngày HÔM QUA → sự cố hôm nay bị cắt
  const today = toDateStrVN(now)

  const { data: downtimes = [], isLoading, error, refetch } = useQuery({
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
      render: (v) => fmtDateTime(v) },
    { key: 'ended_at', title: 'Kết thúc', dataIndex: 'ended_at', width: 130,
      render: (v) => v ? fmtDateTime(v) : <Tag color="red">Đang dừng</Tag> },
    { key: 'duration_minutes', title: 'Thời gian', dataIndex: 'duration_minutes', width: 90, align: 'right', sortable: true,
      render: (v) => v ? <Text strong>{v} phút</Text> : '—' },
    { key: 'resolution', title: 'Xử lý', dataIndex: 'resolution', width: 200, ellipsis: true },
  ]

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)} />
        <Text strong style={{ fontSize: 18, color: '#1B4D3E' }}>🔧 Sự cố / dừng máy</Text>
      </div>
      <AdvancedDataTable<Downtime>
        columns={columns}
        dataSource={downtimes}
        rowKey="id"
        loading={isLoading}
        error={error}
        title="Sự cố sản xuất"
        dateRangeField="started_at"
        onRefresh={() => refetch()}
        exportFileName="Downtime_SX"
        pageSize={50}
      />
    </div>
  )
}
