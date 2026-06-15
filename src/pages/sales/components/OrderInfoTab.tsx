// ============================================================================
// OrderInfoTab — tab "Thông tin" gọn (read-view) dùng cho panel chi tiết
// (dạng Bảng + Split). Sửa đầy đủ vẫn ở trang chi tiết.
// ============================================================================
import { Descriptions, Card, Tag, Button, Row, Col } from 'antd'
import { useNavigate } from 'react-router-dom'
import type { SalesOrder, Incoterm, PackingType, PaymentTerms } from '../../../services/sales/salesTypes'
import {
  ORDER_STATUS_LABELS, ORDER_STATUS_COLORS,
  INCOTERM_LABELS, CONTAINER_TYPE_LABELS, PACKING_TYPE_LABELS, PAYMENT_TERMS_LABELS,
  CUSTOMER_TIER_COLORS, CUSTOMER_TIER_LABELS, SVR_GRADE_OPTIONS,
} from '../../../services/sales/salesTypes'

const fDate = (s?: string | null) => (s ? new Date(s).toLocaleDateString('vi-VN') : '-')
const fUsd = (v?: number | null) => (v != null ? '$' + v.toLocaleString('en-US') : '-')

export default function OrderInfoTab({ order }: { order: SalesOrder }) {
  const navigate = useNavigate()
  const cust = order.customer
  const gradeLabel = SVR_GRADE_OPTIONS.find((g: any) => g.value === order.grade)?.label || order.grade

  return (
    <Row gutter={16}>
      <Col xs={24} lg={15}>
        <Card title="Thông tin đơn hàng" size="small">
          <Descriptions bordered column={{ xs: 1, sm: 2 }} size="small">
            <Descriptions.Item label="Mã đơn">{order.code}</Descriptions.Item>
            <Descriptions.Item label="Số HĐ">{(order as any).contract_no || '-'}</Descriptions.Item>
            <Descriptions.Item label="Trạng thái">
              <Tag color={ORDER_STATUS_COLORS[order.status]}>{ORDER_STATUS_LABELS[order.status]}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Grade"><Tag color="blue">{gradeLabel}</Tag></Descriptions.Item>
            <Descriptions.Item label="Khách hàng" span={2}>{cust?.name || '-'} {cust?.country ? `(${cust.country})` : ''}</Descriptions.Item>
            <Descriptions.Item label="Số lượng">{order.quantity_tons} tấn ({order.quantity_kg?.toLocaleString()} kg)</Descriptions.Item>
            <Descriptions.Item label="Đơn giá">{fUsd(order.unit_price)} / tấn</Descriptions.Item>
            <Descriptions.Item label="Giá trị">{fUsd(order.total_value_usd)}</Descriptions.Item>
            <Descriptions.Item label="Incoterm">{INCOTERM_LABELS[order.incoterm as Incoterm] || order.incoterm}</Descriptions.Item>
            <Descriptions.Item label="Cảng xếp">{order.port_of_loading || '-'}</Descriptions.Item>
            <Descriptions.Item label="Cảng đích">{order.port_of_destination || '-'}</Descriptions.Item>
            <Descriptions.Item label="Container">{order.container_count || 0} × {CONTAINER_TYPE_LABELS[order.container_type as keyof typeof CONTAINER_TYPE_LABELS] || order.container_type || '20ft'}</Descriptions.Item>
            <Descriptions.Item label="Tổng bành / KL bành">{order.total_bales || '-'} · {order.bale_weight_kg} kg</Descriptions.Item>
            <Descriptions.Item label="Đóng gói" span={2}>
              {PACKING_TYPE_LABELS[order.packing_type as PackingType] || order.packing_type}
              {order.packing_note ? <span style={{ fontSize: 12, color: '#666', fontStyle: 'italic' }}> · {order.packing_note}</span> : ''}
            </Descriptions.Item>
            <Descriptions.Item label="Thanh toán" span={2}>{PAYMENT_TERMS_LABELS[order.payment_terms as PaymentTerms] || order.payment_terms || '-'}</Descriptions.Item>
            <Descriptions.Item label="Shipment Time">{order.shipment_time || '-'}</Descriptions.Item>
            <Descriptions.Item label="Booking ref">{order.booking_reference || '-'}</Descriptions.Item>
            <Descriptions.Item label="ETD">{fDate(order.etd)}</Descriptions.Item>
            <Descriptions.Item label="ETA">{fDate(order.eta)}</Descriptions.Item>
            <Descriptions.Item label="Ghi chú" span={2}>{order.notes || '-'}</Descriptions.Item>
          </Descriptions>
        </Card>
      </Col>
      <Col xs={24} lg={9}>
        {cust && (
          <Card size="small" title="Khách hàng" style={{ marginBottom: 12 }}
            extra={<Button size="small" type="link" onClick={() => navigate(`/sales/customers/${cust.id}`)}>Chi tiết</Button>}>
            <Descriptions column={1} size="small">
              <Descriptions.Item label="Mã">{cust.code}</Descriptions.Item>
              <Descriptions.Item label="Tên">{cust.name}</Descriptions.Item>
              <Descriptions.Item label="Quốc gia">{cust.country || '-'}</Descriptions.Item>
              {cust.tier && <Descriptions.Item label="Hạng"><Tag color={CUSTOMER_TIER_COLORS[cust.tier]}>{CUSTOMER_TIER_LABELS[cust.tier]}</Tag></Descriptions.Item>}
            </Descriptions>
          </Card>
        )}
        <Card size="small" title="Chỉ tiêu kỹ thuật yêu cầu">
          <Descriptions column={2} size="small" bordered>
            <Descriptions.Item label="DRC min">{order.drc_min ?? '-'} %</Descriptions.Item>
            <Descriptions.Item label="DRC max">{order.drc_max ?? '-'} %</Descriptions.Item>
            <Descriptions.Item label="Moisture">{order.moisture_max ?? '-'} %</Descriptions.Item>
            <Descriptions.Item label="Dirt">{order.dirt_max ?? '-'} %</Descriptions.Item>
            <Descriptions.Item label="Ash">{order.ash_max ?? '-'} %</Descriptions.Item>
            <Descriptions.Item label="Nitrogen">{order.nitrogen_max ?? '-'} %</Descriptions.Item>
            <Descriptions.Item label="PRI">{order.pri_min ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="Mooney">{order.mooney_max ?? '-'}</Descriptions.Item>
          </Descriptions>
        </Card>
      </Col>
    </Row>
  )
}
