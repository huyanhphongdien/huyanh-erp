// ============================================================================
// SOP LIST PAGE — Standard Operating Procedures
// File: src/pages/production/SOPListPage.tsx
// ============================================================================

import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Tag, Typography, Button, Descriptions, Space, Steps, message } from 'antd'
import { ArrowLeftOutlined, PlusOutlined, FileTextOutlined } from '@ant-design/icons'
import { sopService, SOP_CATEGORIES, SOP_STATUS, type SOPDocument } from '../../services/production/sopService'
import { useAuthStore } from '../../stores/authStore'
import AdvancedDataTable, { type ColumnDef } from '../../components/common/AdvancedDataTable'

const { Text } = Typography

export default function SOPListPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuthStore()

  const { data: sops = [], isLoading, refetch } = useQuery({
    queryKey: ['sop-documents'],
    queryFn: () => sopService.getAll(),
  })

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      await sopService.updateStatus(id, status, user?.employee_id)
    },
    onSuccess: () => { message.success('Đã cập nhật'); queryClient.invalidateQueries({ queryKey: ['sop-documents'] }) },
    onError: (e: Error) => message.error(e.message),
  })

  const columns: ColumnDef<SOPDocument>[] = [
    { key: 'code', title: 'Mã SOP', dataIndex: 'code', width: 100, sortable: true,
      render: (v) => <Text strong style={{ color: '#1B4D3E', fontFamily: 'monospace' }}>{v}</Text> },
    { key: 'name', title: 'Tên quy trình', dataIndex: 'name', width: 250, ellipsis: true },
    { key: 'category', title: 'Phân loại', dataIndex: 'category', width: 110,
      filterType: 'select', filterOptions: Object.entries(SOP_CATEGORIES).map(([v, l]) => ({ value: v, label: l })),
      render: (v) => <Tag>{SOP_CATEGORIES[v] || v}</Tag>,
      exportRender: (v) => SOP_CATEGORIES[v] || v },
    { key: 'department', title: 'Phòng ban', dataIndex: ['department', 'name'], width: 120,
      render: (_, r) => r.department?.name || '—', exportRender: (_, r) => r.department?.name || '' },
    { key: 'version', title: 'Ver', dataIndex: 'version', width: 50, align: 'center',
      render: (v) => <Tag color="blue">v{v}</Tag> },
    { key: 'status', title: 'Trạng thái', dataIndex: 'status', width: 120,
      filterType: 'select', filterOptions: Object.entries(SOP_STATUS).map(([v, s]) => ({ value: v, label: s.label })),
      render: (v) => { const s = SOP_STATUS[v]; return s ? <Tag color={s.color}>{s.label}</Tag> : v },
      exportRender: (v) => SOP_STATUS[v]?.label || v },
    { key: 'effective_date', title: 'Hiệu lực', dataIndex: 'effective_date', width: 100,
      render: (v) => v || '—' },
  ]

  const renderInlineDetail = (sop: SOPDocument) => (
    <div style={{ padding: '8px 0' }}>
      <Descriptions size="small" column={{ xs: 1, sm: 2, md: 3 }} labelStyle={{ fontWeight: 600 }}>
        <Descriptions.Item label="Mã">{sop.code}</Descriptions.Item>
        <Descriptions.Item label="Trạng thái">
          <Tag color={SOP_STATUS[sop.status]?.color}>{SOP_STATUS[sop.status]?.label}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="Phiên bản">v{sop.version}</Descriptions.Item>
        <Descriptions.Item label="Phân loại">{SOP_CATEGORIES[sop.category]}</Descriptions.Item>
        <Descriptions.Item label="Phòng ban">{sop.department?.name || '—'}</Descriptions.Item>
        <Descriptions.Item label="Hiệu lực">{sop.effective_date || '—'}</Descriptions.Item>
        <Descriptions.Item label="Tái soát">{sop.review_date || '—'}</Descriptions.Item>
      </Descriptions>
      <Space style={{ marginTop: 8 }}>
        {sop.status === 'draft' && (
          <Button size="small" type="primary" onClick={() => statusMutation.mutate({ id: sop.id, status: 'pending_review' })}>
            Gửi duyệt
          </Button>
        )}
        {sop.status === 'pending_review' && (
          <Button size="small" type="primary" style={{ background: '#52c41a' }}
            onClick={() => statusMutation.mutate({ id: sop.id, status: 'active' })}>
            Duyệt & Áp dụng
          </Button>
        )}
        {sop.status === 'active' && (
          <Button size="small" onClick={() => statusMutation.mutate({ id: sop.id, status: 'archived' })}>
            Lưu trữ
          </Button>
        )}
      </Space>
    </div>
  )

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)} />
          <Text strong style={{ fontSize: 18, color: '#1B4D3E' }}>📖 SOP — Quy trình chuẩn</Text>
        </div>
      </div>
      <AdvancedDataTable<SOPDocument>
        columns={columns}
        dataSource={sops}
        rowKey="id"
        loading={isLoading}
        title="Quy trình SOP"
        onRefresh={() => refetch()}
        expandedRowRender={renderInlineDetail}
        exportFileName="SOP_List"
        pageSize={50}
      />
    </div>
  )
}
