// ============================================================================
// RUBBER INTAKE LIST PAGE V2 — AdvancedDataTable with inline detail
// File: src/pages/wms/rubber-intake/RubberIntakeListPage.tsx
// ============================================================================

import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Tag, Typography, Button, Descriptions, Card, Row, Col, Statistic } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import rubberIntakeService from '../../../services/rubber/rubberIntakeService'
import type { RubberIntake } from '../../../services/rubber/rubberIntakeService'
import AdvancedDataTable, { type ColumnDef } from '../../../components/common/AdvancedDataTable'

const { Text } = Typography

const STATUS_LABELS: Record<string, string> = {
  pending: 'Chờ QC', qc_done: 'Đã QC', settled: 'Đã quyết toán', cancelled: 'Đã hủy',
}
const STATUS_COLORS: Record<string, string> = {
  pending: 'warning', qc_done: 'processing', settled: 'success', cancelled: 'error',
}
const PAYMENT_LABELS: Record<string, string> = {
  unpaid: 'Chưa TT', partial: 'TT 1 phần', paid: 'Đã TT',
}
const PAYMENT_COLORS: Record<string, string> = {
  unpaid: 'error', partial: 'warning', paid: 'success',
}

const formatDate = (d: string | null) => d ? new Date(d).toLocaleDateString('vi-VN') : '—'
const formatWeight = (v: number | null) => v ? `${Number(v).toLocaleString('vi-VN')} kg` : '—'

export default function RubberIntakeListPage() {
  const navigate = useNavigate()

  const { data: intakes = [], isLoading, refetch } = useQuery({
    queryKey: ['rubber-intake-all'],
    queryFn: async () => {
      const result = await rubberIntakeService.getAll({ page: 1, pageSize: 500 })
      return result.data || []
    },
    staleTime: 60000,
  })

  const columns: ColumnDef<RubberIntake>[] = [
    { key: 'batch_code', title: 'Mã lô', dataIndex: 'batch_code', width: 130, sortable: true,
      render: (v) => <Text strong style={{ color: '#1B4D3E' }}>{v || '—'}</Text> },
    { key: 'supplier_name', title: 'Nhà cung cấp', dataIndex: 'supplier_name', width: 160, ellipsis: true },
    { key: 'intake_date', title: 'Ngày nhập', dataIndex: 'intake_date', width: 100, sortable: true,
      render: (v) => formatDate(v) },
    { key: 'gross_weight', title: 'TL Gross (kg)', dataIndex: 'gross_weight_kg', width: 110, align: 'right', sortable: true,
      render: (v) => v ? <Text>{Number(v).toLocaleString('vi-VN')}</Text> : '—', exportRender: (v) => v || 0 },
    { key: 'net_weight', title: 'TL Net (kg)', dataIndex: 'net_weight_kg', width: 110, align: 'right', sortable: true,
      render: (v) => v ? <Text strong>{Number(v).toLocaleString('vi-VN')}</Text> : '—', exportRender: (v) => v || 0 },
    { key: 'drc', title: 'DRC (%)', dataIndex: 'drc_percent', width: 80, align: 'center', sortable: true,
      render: (v) => v ? <Tag color="blue">{v}%</Tag> : '—' },
    { key: 'rubber_type', title: 'Loại mủ', dataIndex: 'rubber_type', width: 100,
      render: (v) => v || '—' },
    { key: 'status', title: 'Trạng thái', dataIndex: 'status', width: 100,
      filterType: 'select', filterOptions: Object.entries(STATUS_LABELS).map(([v, l]) => ({ value: v, label: l })),
      render: (v) => <Tag color={STATUS_COLORS[v]}>{STATUS_LABELS[v] || v}</Tag>,
      exportRender: (v) => STATUS_LABELS[v] || v },
    { key: 'payment_status', title: 'Thanh toán', dataIndex: 'payment_status', width: 90,
      filterType: 'select', filterOptions: Object.entries(PAYMENT_LABELS).map(([v, l]) => ({ value: v, label: l })),
      render: (v) => v ? <Tag color={PAYMENT_COLORS[v]}>{PAYMENT_LABELS[v]}</Tag> : '—',
      exportRender: (v) => PAYMENT_LABELS[v] || v || '' },
  ]

  const renderInlineDetail = (intake: RubberIntake) => (
    <div style={{ padding: '4px 0' }}>
      <Row gutter={[16, 12]} style={{ marginBottom: 12 }}>
        <Col xs={6}><Card size="small" style={{ borderRadius: 10, textAlign: 'center' }}>
          <Statistic title="TL Gross" value={intake.gross_weight_kg || 0} suffix="kg" valueStyle={{ fontSize: 18, color: '#1B4D3E' }} formatter={v => Number(v).toLocaleString('vi-VN')} />
        </Card></Col>
        <Col xs={6}><Card size="small" style={{ borderRadius: 10, textAlign: 'center' }}>
          <Statistic title="TL Net" value={intake.net_weight_kg || 0} suffix="kg" valueStyle={{ fontSize: 18, color: '#1890ff' }} formatter={v => Number(v).toLocaleString('vi-VN')} />
        </Card></Col>
        <Col xs={6}><Card size="small" style={{ borderRadius: 10, textAlign: 'center' }}>
          <Statistic title="DRC" value={intake.drc_percent || 0} suffix="%" valueStyle={{ fontSize: 18, color: '#722ed1' }} />
        </Card></Col>
        <Col xs={6}><Card size="small" style={{ borderRadius: 10, textAlign: 'center' }}>
          <Statistic title="Đơn giá" value={intake.unit_price || 0} suffix="VNĐ/kg" valueStyle={{ fontSize: 16, color: '#52c41a' }} formatter={v => Number(v).toLocaleString('vi-VN')} />
        </Card></Col>
      </Row>
      <Descriptions size="small" column={{ xs: 1, sm: 2, md: 3 }} labelStyle={{ fontWeight: 600 }}>
        <Descriptions.Item label="Mã lô">{intake.batch_code || '—'}</Descriptions.Item>
        <Descriptions.Item label="Trạng thái"><Tag color={STATUS_COLORS[intake.status]}>{STATUS_LABELS[intake.status]}</Tag></Descriptions.Item>
        <Descriptions.Item label="Thanh toán">{intake.payment_status ? <Tag color={PAYMENT_COLORS[intake.payment_status]}>{PAYMENT_LABELS[intake.payment_status]}</Tag> : '—'}</Descriptions.Item>
        <Descriptions.Item label="NCC">{intake.supplier_name || '—'}</Descriptions.Item>
        <Descriptions.Item label="Loại mủ">{intake.rubber_type || '—'}</Descriptions.Item>
        <Descriptions.Item label="Ngày nhập">{formatDate(intake.intake_date)}</Descriptions.Item>
        <Descriptions.Item label="Xe">{(intake as any).vehicle_plate || '—'}</Descriptions.Item>
        <Descriptions.Item label="Tài xế">{(intake as any).driver_name || '—'}</Descriptions.Item>
        <Descriptions.Item label="Ghi chú">{(intake as any).notes || '—'}</Descriptions.Item>
      </Descriptions>
      <div style={{ marginTop: 8 }}>
        <Button type="link" onClick={() => navigate(`/rubber/intake/${intake.id}`)}>Xem chi tiết đầy đủ →</Button>
      </div>
    </div>
  )

  return (
    <div style={{ padding: 24, maxWidth: 1600, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Text strong style={{ fontSize: 18, color: '#1B4D3E' }}>Lý lịch mủ — Thu mua</Text>
      </div>
      <AdvancedDataTable<RubberIntake>
        columns={columns}
        dataSource={intakes}
        rowKey="id"
        loading={isLoading}
        title="Lý lịch mủ"
        dateRangeField="intake_date"
        onRefresh={() => refetch()}
        expandedRowRender={renderInlineDetail}
        exportFileName="Ly_Lich_Mu"
        pageSize={50}
      />
    </div>
  )
}
