// ============================================================================
// SAFETY SIGNS PAGE — Biển hiệu an toàn nhà máy
// File: src/pages/production/SafetySignsPage.tsx
// ============================================================================

import { useQuery } from '@tanstack/react-query'
import { Tag, Typography, Button, Descriptions, Image } from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import AdvancedDataTable, { type ColumnDef } from '../../components/common/AdvancedDataTable'

const { Text } = Typography

const SIGN_TYPES: Record<string, { label: string; color: string; emoji: string }> = {
  prohibition: { label: 'Cấm', color: 'red', emoji: '🔴' },
  mandatory: { label: 'Bắt buộc', color: 'blue', emoji: '🔵' },
  warning: { label: 'Cảnh báo', color: 'gold', emoji: '🟡' },
  information: { label: 'Thông tin', color: 'green', emoji: '🟢' },
  fire: { label: 'PCCC', color: 'volcano', emoji: '🔥' },
}

const CONDITION_MAP: Record<string, { label: string; color: string }> = {
  good: { label: 'Tốt', color: 'success' },
  faded: { label: 'Phai màu', color: 'warning' },
  damaged: { label: 'Hỏng', color: 'error' },
  missing: { label: 'Mất', color: 'error' },
  replaced: { label: 'Đã thay', color: 'processing' },
}

interface SafetySign {
  id: string; code: string; type: string; name: string; description: string | null
  area: string; location_detail: string | null; image_url: string | null
  standard: string | null; install_date: string | null
  last_inspection_date: string | null; next_inspection_date: string | null
  condition: string; created_at: string
}

export default function SafetySignsPage() {
  const navigate = useNavigate()

  const { data: signs = [], isLoading, refetch } = useQuery({
    queryKey: ['safety-signs'],
    queryFn: async () => {
      const { data, error } = await supabase.from('safety_signs').select('*').order('area, code')
      if (error) throw error
      return data || []
    },
  })

  const columns: ColumnDef<SafetySign>[] = [
    { key: 'code', title: 'Mã', dataIndex: 'code', width: 80, sortable: true,
      render: (v) => <Text strong style={{ fontFamily: 'monospace' }}>{v}</Text> },
    { key: 'type', title: 'Loại', dataIndex: 'type', width: 100,
      filterType: 'select', filterOptions: Object.entries(SIGN_TYPES).map(([v, s]) => ({ value: v, label: `${s.emoji} ${s.label}` })),
      render: (v) => { const s = SIGN_TYPES[v]; return s ? <Tag color={s.color}>{s.emoji} {s.label}</Tag> : v } },
    { key: 'name', title: 'Tên biển', dataIndex: 'name', width: 180, ellipsis: true },
    { key: 'area', title: 'Khu vực', dataIndex: 'area', width: 120,
      render: (v) => <Tag>{v}</Tag> },
    { key: 'condition', title: 'Tình trạng', dataIndex: 'condition', width: 100,
      filterType: 'select', filterOptions: Object.entries(CONDITION_MAP).map(([v, s]) => ({ value: v, label: s.label })),
      render: (v) => { const c = CONDITION_MAP[v]; return c ? <Tag color={c.color}>{c.label}</Tag> : v } },
    { key: 'next_inspection', title: 'Kiểm tra tiếp', dataIndex: 'next_inspection_date', width: 110, sortable: true,
      render: (v) => {
        if (!v) return '—'
        const isOverdue = new Date(v) < new Date()
        return <Text style={{ color: isOverdue ? '#ff4d4f' : '#666' }}>{v}{isOverdue ? ' ⚠️' : ''}</Text>
      } },
    { key: 'standard', title: 'Tiêu chuẩn', dataIndex: 'standard', width: 100 },
  ]

  const renderInlineDetail = (sign: SafetySign) => (
    <div style={{ padding: '8px 0', display: 'flex', gap: 16 }}>
      {sign.image_url && (
        <Image src={sign.image_url} width={120} height={120} style={{ borderRadius: 8, objectFit: 'cover' }} />
      )}
      <div style={{ flex: 1 }}>
        <Descriptions size="small" column={{ xs: 1, sm: 2 }} labelStyle={{ fontWeight: 600 }}>
          <Descriptions.Item label="Mã">{sign.code}</Descriptions.Item>
          <Descriptions.Item label="Loại">{SIGN_TYPES[sign.type]?.emoji} {SIGN_TYPES[sign.type]?.label}</Descriptions.Item>
          <Descriptions.Item label="Khu vực">{sign.area}</Descriptions.Item>
          <Descriptions.Item label="Vị trí chi tiết">{sign.location_detail || '—'}</Descriptions.Item>
          <Descriptions.Item label="Tình trạng"><Tag color={CONDITION_MAP[sign.condition]?.color}>{CONDITION_MAP[sign.condition]?.label}</Tag></Descriptions.Item>
          <Descriptions.Item label="Tiêu chuẩn">{sign.standard || '—'}</Descriptions.Item>
          <Descriptions.Item label="Ngày lắp">{sign.install_date || '—'}</Descriptions.Item>
          <Descriptions.Item label="Kiểm tra gần nhất">{sign.last_inspection_date || '—'}</Descriptions.Item>
          <Descriptions.Item label="Kiểm tra tiếp theo">{sign.next_inspection_date || '—'}</Descriptions.Item>
          <Descriptions.Item label="Mô tả">{sign.description || '—'}</Descriptions.Item>
        </Descriptions>
      </div>
    </div>
  )

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)} />
        <Text strong style={{ fontSize: 18, color: '#1B4D3E' }}>⚠️ Biển hiệu an toàn</Text>
      </div>
      <AdvancedDataTable<SafetySign>
        columns={columns}
        dataSource={signs}
        rowKey="id"
        loading={isLoading}
        title="Biển hiệu an toàn"
        onRefresh={() => refetch()}
        expandedRowRender={renderInlineDetail}
        exportFileName="Bien_Hieu_An_Toan"
        pageSize={50}
      />
    </div>
  )
}
