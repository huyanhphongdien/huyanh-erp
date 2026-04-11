// ============================================================================
// STOCK IN LIST PAGE V2 — AdvancedDataTable with inline detail
// File: src/pages/wms/stock-in/StockInListPage.tsx
// ============================================================================

import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Tag, Typography, Button, Descriptions, Card, Row, Col, Statistic } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import stockInService from '../../../services/wms/stockInService'
import type { StockInOrder } from '../../../services/wms/wms.types'
import AdvancedDataTable, { type ColumnDef } from '../../../components/common/AdvancedDataTable'

const { Text } = Typography

const SOURCE_LABELS: Record<string, string> = {
  production: 'Sản xuất', purchase: 'Mua hàng', blend: 'Phối trộn',
  transfer: 'Chuyển kho', adjust: 'Điều chỉnh',
}
const SOURCE_COLORS: Record<string, string> = {
  production: 'blue', purchase: 'purple', blend: 'cyan', transfer: 'orange', adjust: 'default',
}
const STATUS_LABELS: Record<string, string> = {
  draft: 'Nháp', confirmed: 'Xác nhận', cancelled: 'Đã hủy',
}
const STATUS_COLORS: Record<string, string> = {
  draft: 'default', confirmed: 'success', cancelled: 'error',
}

const formatDate = (d: string | null) => d ? new Date(d).toLocaleDateString('vi-VN') : '—'

export default function StockInListPage() {
  const navigate = useNavigate()

  const { data: orders = [], isLoading, refetch } = useQuery({
    queryKey: ['stock-in-orders-all'],
    queryFn: async () => {
      const result = await stockInService.getList({ page: 1, pageSize: 500 })
      return result.data || []
    },
    staleTime: 60000,
  })

  const columns: ColumnDef<StockInOrder>[] = [
    { key: 'order_code', title: 'Mã phiếu', dataIndex: 'order_code', width: 130, sortable: true,
      render: (v) => <Text strong style={{ color: '#1B4D3E' }}>{v}</Text> },
    { key: 'source_type', title: 'Nguồn', dataIndex: 'source_type', width: 100,
      filterType: 'select', filterOptions: Object.entries(SOURCE_LABELS).map(([v, l]) => ({ value: v, label: l })),
      render: (v) => <Tag color={SOURCE_COLORS[v]}>{SOURCE_LABELS[v] || v}</Tag>,
      exportRender: (v) => SOURCE_LABELS[v] || v },
    { key: 'warehouse', title: 'Kho', dataIndex: ['warehouse', 'name'], width: 120,
      render: (_, r) => (r as any).warehouse?.name || '—',
      exportRender: (_, r) => (r as any).warehouse?.name || '' },
    { key: 'total_weight', title: 'Trọng lượng (kg)', dataIndex: 'total_weight_kg', width: 120, align: 'right', sortable: true,
      render: (v) => v ? <Text strong>{Number(v).toLocaleString('vi-VN')}</Text> : '—',
      exportRender: (v) => v || 0 },
    { key: 'rubber_grade', title: 'Grade', dataIndex: 'rubber_grade_name', width: 100,
      render: (v) => v ? <Tag color="green">{v}</Tag> : '—' },
    { key: 'supplier', title: 'NCC / Đại lý', dataIndex: 'supplier_name', width: 150, ellipsis: true },
    { key: 'status', title: 'Trạng thái', dataIndex: 'status', width: 100,
      filterType: 'select', filterOptions: Object.entries(STATUS_LABELS).map(([v, l]) => ({ value: v, label: l })),
      render: (v) => <Tag color={STATUS_COLORS[v]}>{STATUS_LABELS[v] || v}</Tag>,
      exportRender: (v) => STATUS_LABELS[v] || v },
    { key: 'created_at', title: 'Ngày tạo', dataIndex: 'created_at', width: 100, sortable: true,
      render: (v) => formatDate(v), exportRender: (v) => v ? new Date(v).toLocaleDateString('vi-VN') : '' },
  ]

  const renderInlineDetail = (order: StockInOrder) => (
    <div style={{ padding: '4px 0' }}>
      <Row gutter={[16, 12]} style={{ marginBottom: 12 }}>
        <Col xs={8}><Card size="small" style={{ borderRadius: 10, textAlign: 'center' }}>
          <Statistic title="Trọng lượng" value={order.total_weight_kg || 0} suffix="kg" valueStyle={{ fontSize: 18, color: '#1B4D3E' }} formatter={v => Number(v).toLocaleString('vi-VN')} />
        </Card></Col>
        <Col xs={8}><Card size="small" style={{ borderRadius: 10, textAlign: 'center' }}>
          <Statistic title="Số lượng items" value={(order as any).item_count || 0} valueStyle={{ fontSize: 18, color: '#1890ff' }} />
        </Card></Col>
        <Col xs={8}><Card size="small" style={{ borderRadius: 10, textAlign: 'center' }}>
          <Statistic title="Grade" value={order.rubber_grade_name || '—'} valueStyle={{ fontSize: 16, color: '#52c41a' }} />
        </Card></Col>
      </Row>
      <Descriptions size="small" column={{ xs: 1, sm: 2, md: 3 }} labelStyle={{ fontWeight: 600 }}>
        <Descriptions.Item label="Mã phiếu">{order.order_code}</Descriptions.Item>
        <Descriptions.Item label="Trạng thái"><Tag color={STATUS_COLORS[order.status]}>{STATUS_LABELS[order.status]}</Tag></Descriptions.Item>
        <Descriptions.Item label="Nguồn"><Tag color={SOURCE_COLORS[order.source_type]}>{SOURCE_LABELS[order.source_type]}</Tag></Descriptions.Item>
        <Descriptions.Item label="Kho">{(order as any).warehouse?.name || '—'}</Descriptions.Item>
        <Descriptions.Item label="NCC">{order.supplier_name || '—'}</Descriptions.Item>
        <Descriptions.Item label="Ngày tạo">{formatDate(order.created_at)}</Descriptions.Item>
        <Descriptions.Item label="Ghi chú">{(order as any).notes || '—'}</Descriptions.Item>
      </Descriptions>
      <div style={{ marginTop: 8 }}>
        <Button type="link" onClick={() => navigate(`/wms/stock-in/${order.id}`)}>Xem chi tiết đầy đủ →</Button>
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
