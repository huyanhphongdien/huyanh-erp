// ============================================================================
// STOCK IN LIST PAGE V2 — AdvancedDataTable with inline detail
// File: src/pages/wms/stock-in/StockInListPage.tsx
// ============================================================================

import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Tag, Typography, Button, Descriptions, Card, Row, Col, Statistic, Space } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import stockInService from '../../../services/wms/stockInService'
import type { StockInOrder } from '../../../services/wms/wms.types'
import AdvancedDataTable, { type ColumnDef } from '../../../components/common/AdvancedDataTable'
import { useOpenTab } from '../../../hooks/useOpenTab'

const { Text } = Typography

const SOURCE_LABELS: Record<string, string> = {
  production: 'Sản xuất', purchase: 'Mua hàng', blend: 'Phối trộn',
  transfer: 'Chuyển kho', adjust: 'Điều chỉnh', return: 'Khách trả', repack: 'Đóng gói lại',
}
const SOURCE_COLORS: Record<string, string> = {
  production: 'blue', purchase: 'purple', blend: 'cyan', transfer: 'orange',
  adjust: 'default', return: 'magenta', repack: 'geekblue',
}
const TYPE_LABELS: Record<string, string> = { raw: 'NVL', finished: 'TP' }
const TYPE_COLORS: Record<string, string> = { raw: 'orange', finished: 'green' }
const STATUS_LABELS: Record<string, string> = {
  draft: 'Nháp', confirmed: 'Xác nhận', cancelled: 'Đã hủy',
}
const STATUS_COLORS: Record<string, string> = {
  draft: 'default', confirmed: 'success', cancelled: 'error',
}

const formatDate = (d: string | null) => d ? new Date(d).toLocaleDateString('vi-VN') : '—'

// Trích mã phiếu cân từ `notes` (format: "Nhập nhanh từ phiếu cân CX-YYYYMMDD-NNN")
// Trả về null nếu notes không match pattern weighbridge origin.
const extractWeighbridgeCode = (notes: string | null | undefined): string | null => {
  if (!notes) return null
  const match = notes.match(/phiếu cân\s+(CX-[\w-]+)/i)
  return match ? match[1] : null
}

export default function StockInListPage() {
  const navigate = useNavigate()
  const openTab = useOpenTab()

  const openDetail = (order: StockInOrder) => {
    openTab({
      key: `stock-in-${order.id}`,
      title: `Phiếu ${(order as any).code || order.id.slice(0, 8)}`,
      componentId: 'stock-in-detail',
      props: { id: order.id },
      path: `/wms/stock-in/${order.id}`,
    })
  }

  const { data: orders = [], isLoading, refetch } = useQuery({
    queryKey: ['stock-in-orders-all'],
    queryFn: async () => {
      const result = await stockInService.getAll({ page: 1, pageSize: 500 })
      return result.data || []
    },
    staleTime: 60000,
  })

  const columns: ColumnDef<StockInOrder>[] = [
    { key: 'code', title: 'Mã phiếu', dataIndex: 'code', width: 160, sortable: true,
      render: (v) => <Text strong style={{ color: '#1B4D3E' }}>{v}</Text> },
    { key: 'type', title: 'Loại', dataIndex: 'type', width: 80,
      filterType: 'select', filterOptions: Object.entries(TYPE_LABELS).map(([v, l]) => ({ value: v, label: l })),
      render: (v) => <Tag color={TYPE_COLORS[v]}>{TYPE_LABELS[v] || v}</Tag>,
      exportRender: (v) => TYPE_LABELS[v] || v },
    { key: 'source_type', title: 'Nguồn', dataIndex: 'source_type', width: 180,
      filterType: 'select', filterOptions: Object.entries(SOURCE_LABELS).map(([v, l]) => ({ value: v, label: l })),
      render: (v, r) => {
        const ticketCode = extractWeighbridgeCode((r as any).notes)
        return (
          <Space size={4} wrap>
            <Tag color={SOURCE_COLORS[v]}>{SOURCE_LABELS[v] || v}</Tag>
            {ticketCode && (
              <Tag color="cyan" style={{ margin: 0 }}>⚖ {ticketCode}</Tag>
            )}
          </Space>
        )
      },
      exportRender: (v, r) => {
        const ticketCode = extractWeighbridgeCode((r as any).notes)
        return ticketCode ? `${SOURCE_LABELS[v] || v} (${ticketCode})` : (SOURCE_LABELS[v] || v)
      },
    },
    { key: 'warehouse', title: 'Kho', dataIndex: ['warehouse', 'name'], width: 140,
      render: (_, r) => (r as any).warehouse?.name || '—',
      exportRender: (_, r) => (r as any).warehouse?.name || '' },
    { key: 'total_weight', title: 'Trọng lượng (kg)', dataIndex: 'total_weight', width: 140, align: 'right', sortable: true,
      render: (v) => v ? <Text strong>{Number(v).toLocaleString('vi-VN')}</Text> : '—',
      exportRender: (v) => v || 0 },
    { key: 'deal', title: 'Deal / NCC', dataIndex: ['deal', 'deal_number'], width: 160, ellipsis: true,
      render: (_, r) => (r as any).deal?.partner_name || (r as any).deal?.deal_number || '—',
      exportRender: (_, r) => (r as any).deal?.partner_name || (r as any).deal?.deal_number || '' },
    { key: 'status', title: 'Trạng thái', dataIndex: 'status', width: 110,
      filterType: 'select', filterOptions: Object.entries(STATUS_LABELS).map(([v, l]) => ({ value: v, label: l })),
      render: (v) => <Tag color={STATUS_COLORS[v]}>{STATUS_LABELS[v] || v}</Tag>,
      exportRender: (v) => STATUS_LABELS[v] || v },
    { key: 'created_at', title: 'Ngày tạo', dataIndex: 'created_at', width: 110, sortable: true,
      render: (v) => formatDate(v), exportRender: (v) => v ? new Date(v).toLocaleDateString('vi-VN') : '' },
  ]

  const renderInlineDetail = (order: StockInOrder) => (
    <div style={{ padding: '4px 0' }}>
      <Row gutter={[16, 12]} style={{ marginBottom: 12 }}>
        <Col xs={8}><Card size="small" style={{ borderRadius: 10, textAlign: 'center' }}>
          <Statistic title="Trọng lượng" value={order.total_weight || 0} suffix="kg" valueStyle={{ fontSize: 18, color: '#1B4D3E' }} formatter={v => Number(v).toLocaleString('vi-VN')} />
        </Card></Col>
        <Col xs={8}><Card size="small" style={{ borderRadius: 10, textAlign: 'center' }}>
          <Statistic title="Số lượng" value={order.total_quantity || 0} valueStyle={{ fontSize: 18, color: '#1890ff' }} />
        </Card></Col>
        <Col xs={8}><Card size="small" style={{ borderRadius: 10, textAlign: 'center' }}>
          <Statistic title="Loại" value={TYPE_LABELS[order.type] || order.type} valueStyle={{ fontSize: 16, color: TYPE_COLORS[order.type] === 'green' ? '#52c41a' : '#fa8c16' }} />
        </Card></Col>
      </Row>
      <Descriptions size="small" column={{ xs: 1, sm: 2, md: 3 }} labelStyle={{ fontWeight: 600 }}>
        <Descriptions.Item label="Mã phiếu">{order.code}</Descriptions.Item>
        <Descriptions.Item label="Trạng thái"><Tag color={STATUS_COLORS[order.status]}>{STATUS_LABELS[order.status]}</Tag></Descriptions.Item>
        <Descriptions.Item label="Nguồn"><Tag color={SOURCE_COLORS[order.source_type]}>{SOURCE_LABELS[order.source_type]}</Tag></Descriptions.Item>
        <Descriptions.Item label="Kho">{(order as any).warehouse?.name || '—'}</Descriptions.Item>
        <Descriptions.Item label="Deal">{(order as any).deal?.deal_number || '—'}</Descriptions.Item>
        <Descriptions.Item label="Ngày tạo">{formatDate(order.created_at)}</Descriptions.Item>
        <Descriptions.Item label="Ghi chú">{(order as any).notes || '—'}</Descriptions.Item>
      </Descriptions>
      <div style={{ marginTop: 8 }}>
        <Button type="link" onClick={() => openDetail(order)}>Xem chi tiết đầy đủ →</Button>
      </div>
    </div>
  )

  return (
    <div style={{ padding: 24, maxWidth: 1600, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Text strong style={{ fontSize: 18, color: '#1B4D3E' }}>Phiếu nhập kho</Text>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/wms/stock-in/new')} style={{ background: '#1B4D3E' }}>
          Tạo phiếu nhập
        </Button>
      </div>
      <AdvancedDataTable<StockInOrder>
        columns={columns}
        dataSource={orders}
        rowKey="id"
        loading={isLoading}
        title="Phiếu nhập kho"
        dateRangeField="created_at"
        onRefresh={() => refetch()}
        expandedRowRender={renderInlineDetail}
        exportFileName="Phieu_Nhap_Kho"
        pageSize={50}
      />
    </div>
  )
}
