// ============================================================================
// PO LIST PAGE V2 — AdvancedDataTable with inline detail
// File: src/features/purchasing/pages/POListPage.tsx
// ============================================================================

import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Tag, Typography, Button, Tabs, Descriptions, Progress, Card, Row, Col, Statistic } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import {
  purchaseOrderService,
  type PurchaseOrder,
  PO_STATUS_LABELS,
  PO_STATUS_COLORS,
  formatCurrency,
} from '../../../services/purchaseOrderService'
import AdvancedDataTable, { type ColumnDef } from '../../../components/common/AdvancedDataTable'

const { Text } = Typography

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Nháp' },
  { value: 'confirmed', label: 'Xác nhận' },
  { value: 'partial', label: 'Nhận 1 phần' },
  { value: 'completed', label: 'Hoàn thành' },
  { value: 'cancelled', label: 'Đã hủy' },
]

const formatDate = (d: string | null) => d ? new Date(d).toLocaleDateString('vi-VN') : '—'

export default function POListPage() {
  const navigate = useNavigate()

  const { data: orders = [], isLoading, refetch } = useQuery({
    queryKey: ['purchase-orders-all'],
    queryFn: async () => {
      const result = await purchaseOrderService.getList({ page: 1, pageSize: 500 })
      return result.data
    },
    staleTime: 60000,
  })

  const columns: ColumnDef<PurchaseOrder>[] = [
    { key: 'order_code', title: 'Mã đơn', dataIndex: 'order_code', width: 130, sortable: true,
      render: (v) => <Text strong style={{ color: '#1B4D3E' }}>{v}</Text> },
    { key: 'project_name', title: 'Dự án / Ghi chú', dataIndex: 'project_name', width: 180, ellipsis: true,
      render: (v, r) => (<div><Text style={{ fontSize: 13 }}>{v || '—'}</Text>
        {r.requester && <div style={{ fontSize: 11, color: '#999' }}>{r.requester.full_name}</div>}</div>) },
    { key: 'supplier', title: 'Nhà cung cấp', dataIndex: ['supplier', 'name'], width: 160, ellipsis: true,
      render: (_, r) => <Text>{(r as any).supplier?.name || '—'}</Text>,
      exportRender: (_, r) => (r as any).supplier?.name || '' },
    { key: 'order_date', title: 'Ngày tạo', dataIndex: 'order_date', width: 100, sortable: true,
      render: (v) => formatDate(v), exportRender: (v) => v ? new Date(v).toLocaleDateString('vi-VN') : '' },
    { key: 'department', title: 'Phòng ban', dataIndex: ['department', 'name'], width: 120, ellipsis: true,
      render: (_, r) => (r as any).department?.name || '—',
      exportRender: (_, r) => (r as any).department?.name || '' },
    { key: 'grand_total', title: 'Tổng tiền', dataIndex: 'grand_total', width: 120, align: 'right', sortable: true,
      render: (v) => <Text strong>{formatCurrency(v)}</Text>, exportRender: (v) => v || 0 },
    { key: 'status', title: 'Trạng thái', dataIndex: 'status', width: 120,
      filterType: 'select', filterOptions: STATUS_OPTIONS,
      render: (v) => <Tag color={PO_STATUS_COLORS[v as keyof typeof PO_STATUS_COLORS]}>{PO_STATUS_LABELS[v as keyof typeof PO_STATUS_LABELS]}</Tag>,
      exportRender: (v) => PO_STATUS_LABELS[v as keyof typeof PO_STATUS_LABELS] || v },
    { key: 'invoice_progress', title: 'Hóa đơn', dataIndex: 'invoice_progress', width: 80, align: 'center',
      render: (v) => v > 0 ? <Progress percent={v} size="small" steps={5} /> : '—' },
    { key: 'payment_progress', title: 'Thanh toán', dataIndex: 'payment_progress', width: 80, align: 'center',
      render: (v) => v > 0 ? <Progress percent={v} size="small" steps={5} strokeColor="#52c41a" /> : '—' },
  ]

  const renderInlineDetail = (order: PurchaseOrder) => (
    <div style={{ padding: '4px 0' }}>
      <Row gutter={[16, 12]} style={{ marginBottom: 12 }}>
        <Col xs={6}><Card size="small" style={{ borderRadius: 10, textAlign: 'center' }}>
          <Statistic title="Tổng tiền" value={order.grand_total || 0} formatter={v => formatCurrency(Number(v))} valueStyle={{ fontSize: 18, color: '#1B4D3E' }} />
        </Card></Col>
        <Col xs={6}><Card size="small" style={{ borderRadius: 10, textAlign: 'center' }}>
          <Statistic title="VAT" value={order.vat_amount || 0} formatter={v => formatCurrency(Number(v))} valueStyle={{ fontSize: 18, color: '#722ed1' }} />
        </Card></Col>
        <Col xs={6}><Card size="small" style={{ borderRadius: 10, textAlign: 'center' }}>
          <Statistic title="Hóa đơn" value={order.invoice_progress || 0} suffix="%" valueStyle={{ fontSize: 18, color: '#1890ff' }} />
        </Card></Col>
        <Col xs={6}><Card size="small" style={{ borderRadius: 10, textAlign: 'center' }}>
          <Statistic title="Thanh toán" value={order.payment_progress || 0} suffix="%" valueStyle={{ fontSize: 18, color: '#52c41a' }} />
        </Card></Col>
      </Row>
      <Descriptions size="small" column={{ xs: 1, sm: 2, md: 3 }} labelStyle={{ fontWeight: 600 }}>
        <Descriptions.Item label="Mã đơn">{order.order_code}</Descriptions.Item>
        <Descriptions.Item label="Trạng thái"><Tag color={PO_STATUS_COLORS[order.status as keyof typeof PO_STATUS_COLORS]}>{PO_STATUS_LABELS[order.status as keyof typeof PO_STATUS_LABELS]}</Tag></Descriptions.Item>
        <Descriptions.Item label="NCC">{(order as any).supplier?.name || '—'}</Descriptions.Item>
        <Descriptions.Item label="Phòng ban">{(order as any).department?.name || '—'}</Descriptions.Item>
        <Descriptions.Item label="Người yêu cầu">{(order as any).requester?.full_name || '—'}</Descriptions.Item>
        <Descriptions.Item label="Ngày tạo">{formatDate(order.order_date)}</Descriptions.Item>
        <Descriptions.Item label="Giao dự kiến">{formatDate(order.expected_delivery_date)}</Descriptions.Item>
        <Descriptions.Item label="Dự án">{order.project_name || '—'}</Descriptions.Item>
        <Descriptions.Item label="Ghi chú">{order.notes || '—'}</Descriptions.Item>
      </Descriptions>
      <div style={{ marginTop: 8 }}>
        <Button type="link" onClick={() => navigate(`/purchasing/orders/${order.id}`)}>Xem chi tiết đầy đủ →</Button>
      </div>
    </div>
  )

  return (
    <div style={{ padding: 24, maxWidth: 1600, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Text strong style={{ fontSize: 18, color: '#1B4D3E' }}>Đơn đặt hàng</Text>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/purchasing/orders/new')} style={{ background: '#1B4D3E' }}>
          Tạo đơn hàng
        </Button>
      </div>
      <AdvancedDataTable<PurchaseOrder>
        columns={columns}
        dataSource={orders}
        rowKey="id"
        loading={isLoading}
        title="Đơn đặt hàng"
        dateRangeField="order_date"
        onRefresh={() => refetch()}
        expandedRowRender={renderInlineDetail}
        exportFileName="Don_Dat_Hang"
        pageSize={50}
      />
    </div>
  )
}
