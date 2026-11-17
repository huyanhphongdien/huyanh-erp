// ============================================================================
// RUBBER INTAKE LIST PAGE V2 — AdvancedDataTable with inline detail
// File: src/pages/wms/rubber-intake/RubberIntakeListPage.tsx
// ============================================================================

import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Tag, Typography, Button, Descriptions, Card, Row, Col, Statistic } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import rubberIntakeService, {
  RUBBER_INTAKE_STATUS_LABELS, RUBBER_INTAKE_STATUS_COLORS, RUBBER_INTAKE_PAYMENT_LABELS, RUBBER_INTAKE_PAYMENT_COLORS,
} from '../../../services/rubber/rubberIntakeService'
import type { RubberIntake } from '../../../services/rubber/rubberIntakeService'
import AdvancedDataTable, { type ColumnDef } from '../../../components/common/AdvancedDataTable'
import { EnumTag, enumLabel } from '../../../components/common/EnumTag'
import { RAW_RUBBER_TYPES, RAW_RUBBER_TYPE_LABELS, chuanHoaLoaiMu } from '../../../services/wms/raw.types'
import { fmtDate, fmtKg, fmtPct } from '../../../utils/format'

const { Text } = Typography

// Nhãn/màu trạng thái lấy từ rubberIntakeService (một nguồn với trang chi tiết)
const STATUS_LABELS: Record<string, string> = RUBBER_INTAKE_STATUS_LABELS
const STATUS_COLORS: Record<string, string> = RUBBER_INTAKE_STATUS_COLORS
const PAYMENT_LABELS: Record<string, string> = RUBBER_INTAKE_PAYMENT_LABELS
const PAYMENT_COLORS: Record<string, string> = RUBBER_INTAKE_PAYMENT_COLORS

/** Trần tải một lần — AdvancedDataTable báo khi chạm (loadLimit). */
const LOAD_LIMIT = 500

/** Mã lô: lot_code → product_code (phiếu cũ). Cột `batch_code` KHÔNG có trong bảng. Phiếu tự sinh từ
 *  phiếu cân ghi product_code = mã loại mủ ('mu_nuoc'…) — đó không phải mã lô, không hiện. */
const lotCodeOf = (r: RubberIntake) =>
  r.lot_code || (r.product_code && !(RAW_RUBBER_TYPES as string[]).includes(r.product_code) ? r.product_code : null)
/** Loại mủ chi tiết → nhãn tiếng Việt chuẩn kho NVL; phiếu cũ chưa phân loại → '—'. */
const loaiMuOf = (r: RubberIntake) => (r.raw_rubber_type ? RAW_RUBBER_TYPE_LABELS[chuanHoaLoaiMu(r.raw_rubber_type)] : null)

export default function RubberIntakeListPage() {
  const navigate = useNavigate()

  const { data: intakes = [], isLoading, error, refetch } = useQuery({
    queryKey: ['rubber-intake-all'],
    queryFn: async () => {
      const result = await rubberIntakeService.getAll({ page: 1, pageSize: LOAD_LIMIT })
      return result.data || []
    },
    staleTime: 60000,
  })

  const columns: ColumnDef<RubberIntake>[] = [
    { key: 'lot_code', title: 'Mã lô', dataIndex: 'lot_code', width: 130, sortable: true,
      render: (_v, r) => <Text strong style={{ color: '#1B4D3E' }}>{lotCodeOf(r) || '—'}</Text>,
      exportRender: (_v, r) => lotCodeOf(r) || '' },
    { key: 'supplier_name', title: 'Nhà cung cấp', dataIndex: 'supplier.name', width: 160, ellipsis: true,
      render: (v) => v || '—' },
    { key: 'intake_date', title: 'Ngày nhập', dataIndex: 'intake_date', width: 100, sortable: true,
      render: (v) => fmtDate(v) },
    { key: 'gross_weight', title: 'KL tổng (kg)', dataIndex: 'gross_weight_kg', width: 110, align: 'right', sortable: true,
      render: (v) => v != null ? <Text>{fmtKg(Number(v))}</Text> : '—', exportRender: (v) => v || 0 },
    { key: 'net_weight', title: 'KL hàng (kg)', dataIndex: 'net_weight_kg', width: 110, align: 'right', sortable: true,
      render: (v) => v != null ? <Text strong>{fmtKg(Number(v))}</Text> : '—', exportRender: (v) => v || 0 },
    { key: 'drc', title: 'DRC (%)', dataIndex: 'drc_percent', width: 80, align: 'center', sortable: true,
      render: (v) => v != null ? <Tag color="blue">{fmtPct(Number(v), 2)}</Tag> : '—' },
    { key: 'rubber_type', title: 'Loại mủ', dataIndex: 'raw_rubber_type', width: 100,
      render: (_v, r) => loaiMuOf(r) || '—', exportRender: (_v, r) => loaiMuOf(r) || '' },
    { key: 'status', title: 'Trạng thái', dataIndex: 'status', width: 100,
      filterType: 'select', filterOptions: Object.entries(STATUS_LABELS).map(([v, l]) => ({ value: v, label: l })),
      render: (v) => <EnumTag value={v} labels={STATUS_LABELS} colors={STATUS_COLORS} />,
      exportRender: (v) => enumLabel(STATUS_LABELS, v, '') },
    { key: 'payment_status', title: 'Thanh toán', dataIndex: 'payment_status', width: 90,
      filterType: 'select', filterOptions: Object.entries(PAYMENT_LABELS).map(([v, l]) => ({ value: v, label: l })),
      render: (v) => <EnumTag value={v} labels={PAYMENT_LABELS} colors={PAYMENT_COLORS} />,
      exportRender: (v) => enumLabel(PAYMENT_LABELS, v, '') },
  ]

  const renderInlineDetail = (intake: RubberIntake) => (
    <div style={{ padding: '4px 0' }}>
      <Row gutter={[16, 12]} style={{ marginBottom: 12 }}>
        <Col xs={6}><Card size="small" style={{ borderRadius: 10, textAlign: 'center' }}>
          <Statistic title="KL tổng" value={intake.gross_weight_kg || 0} suffix="kg" valueStyle={{ fontSize: 18, color: '#1B4D3E' }} formatter={v => fmtKg(Number(v))} />
        </Card></Col>
        <Col xs={6}><Card size="small" style={{ borderRadius: 10, textAlign: 'center' }}>
          <Statistic title="KL hàng" value={intake.net_weight_kg || 0} suffix="kg" valueStyle={{ fontSize: 18, color: '#1890ff' }} formatter={v => fmtKg(Number(v))} />
        </Card></Col>
        <Col xs={6}><Card size="small" style={{ borderRadius: 10, textAlign: 'center' }}>
          <Statistic title="DRC" value={intake.drc_percent || 0} suffix="%" valueStyle={{ fontSize: 18, color: '#722ed1' }} />
        </Card></Col>
        <Col xs={6}><Card size="small" style={{ borderRadius: 10, textAlign: 'center' }}>
          <Statistic title="Đơn giá" value={intake.unit_price || 0} suffix="₫/kg" valueStyle={{ fontSize: 16, color: '#52c41a' }} formatter={v => Number(v).toLocaleString('vi-VN')} />
        </Card></Col>
      </Row>
      <Descriptions size="small" column={{ xs: 1, sm: 2, md: 3 }} labelStyle={{ fontWeight: 600 }}>
        <Descriptions.Item label="Mã lô">{lotCodeOf(intake) || '—'}</Descriptions.Item>
        <Descriptions.Item label="Trạng thái"><EnumTag value={intake.status} labels={STATUS_LABELS} colors={STATUS_COLORS} /></Descriptions.Item>
        <Descriptions.Item label="Thanh toán"><EnumTag value={intake.payment_status} labels={PAYMENT_LABELS} colors={PAYMENT_COLORS} /></Descriptions.Item>
        <Descriptions.Item label="NCC">{intake.supplier?.name || '—'}</Descriptions.Item>
        <Descriptions.Item label="Loại mủ">{loaiMuOf(intake) || '—'}</Descriptions.Item>
        <Descriptions.Item label="Ngày nhập">{fmtDate(intake.intake_date)}</Descriptions.Item>
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
        error={error}
        loadLimit={LOAD_LIMIT}
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
