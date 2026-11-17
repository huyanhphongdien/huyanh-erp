// ============================================================================
// OrderInfoTab — tab "Thông tin" gọn (read-view) DÙNG CHUNG cho trang chi tiết đầy đủ + panel (drawer / Split).
// Sửa đầy đủ vẫn ở tab Hợp đồng.
// Họ HĐ + các bên (sales_family_parties_p1, 17/11/2026):
//   · BA SỐ tách bạch — "Mã đơn (nội bộ)" = code SO-… · "Số đơn · Đợt n/N" = contract_no của đợt ·
//     "Số HĐ ký (in CONTRACT NO., khai hải quan)" = contractNoForDocs (số HĐ gốc khi docs_cite_root) — chống chép
//     số đợt 'HA20260302-D3' vào tờ khai.
//   · Cột phải: <OrderPartiesCard> (Người mua → Người nhận → chữ in Consignee/Notify) thay thẻ "Khách hàng".
//   · Cuối tab: <OrderFamilyBlock> "Các đợt cùng HĐ" khi họ ≥ 2 đơn.
// ============================================================================
import { Descriptions, Card, Tag, Button, Row, Col, Space, Typography } from 'antd'
import type { SalesOrder, Incoterm, PackingType, PaymentTerms } from '../../../services/sales/salesTypes'
import {
  ORDER_STATUS_LABELS, ORDER_STATUS_COLORS, ORDER_KIND_LABELS, ORDER_KIND_COLORS,
  INCOTERM_LABELS, CONTAINER_TYPE_LABELS, PACKING_TYPE_LABELS, PAYMENT_TERMS_LABELS,
  SVR_GRADE_OPTIONS,
  soDisplayCode, polLabel, contractNoForDocs, contractDateForDocs, orderKind, partyShortName,
} from '../../../services/sales/salesTypes'
import type { SalesRole } from '../../../services/sales/salesPermissionService'
import { isVnd, fmtMoney, orderTotalInCurrency } from '../../../services/sales/salesMoney'
import { fmtDate as fDate, fmtKg, fmtNum } from '../../../utils/format'
import { EnumTag } from '../../../components/common/EnumTag'
import OrderPartiesCard from './OrderPartiesCard'
import OrderFamilyBlock, { useOpenSalesOrder, useOrderFamily } from './OrderFamilyBlock'

const { Text } = Typography

interface Props {
  order: SalesOrder
  /** vai trò Đơn hàng bán (quyền sửa thẻ Các bên) — bỏ trống thì thẻ tự đọc từ tài khoản */
  salesRole?: SalesRole | null
  /** nơi gọi tải lại đơn sau khi sửa các bên */
  onSaved?: () => void
}

export default function OrderInfoTab({ order, salesRole, onSaved }: Props) {
  const fam = useOrderFamily(order)
  const openOrder = useOpenSalesOrder()
  const cust = order.customer
  const gradeLabel = SVR_GRADE_OPTIONS.find((g: any) => g.value === order.grade)?.label || order.grade

  // Đợt con (chỉ khi đã migration — chưa migration thì parent_order_id vắng)
  const isChild = fam.ready && fam.isChild
  const seq = order.continuation_seq ?? null
  const seqText = seq ? `Đợt ${seq}${fam.maxSeq >= seq ? `/${fam.maxSeq}` : ''}` : 'Đợt'
  const docsNo = contractNoForDocs(order)
  const docsDate = contractDateForDocs(order)
  const receiver = fam.ready && order.ship_to_customer_id ? order.ship_to : null
  const openRoot = () => { if (order.parent_order_id) openOrder(order.parent_order_id, fam.rootNo || 'gốc') }

  return (
    <Row gutter={16}>
      <Col xs={24} lg={15}>
        <Card title="Thông tin đơn hàng" size="small">
          {/* column khai đủ mọi cỡ (thiếu md+ thì antd v6 rơi về 3 cột, bóp ô số đơn còn ~90px); nhãn rộng cố định để 2 cột đều nhau */}
          <Descriptions bordered column={{ xs: 1, sm: 2, md: 2, lg: 2, xl: 2, xxl: 2 }} size="small" styles={{ label: { width: 120 } }}>
            {/* Trước 17/11/2026 ô này in soDisplayCode → trùng y ô "Số HĐ" (ảnh owner: hai ô cùng HA20260136) */}
            <Descriptions.Item label="Mã đơn (nội bộ)">{order.code || '—'}</Descriptions.Item>
            {isChild ? (
              <Descriptions.Item label={`Số đơn · ${seqText}`}>
                <Text strong style={{ fontFamily: 'monospace' }}>{soDisplayCode(order)}</Text>
              </Descriptions.Item>
            ) : (
              <Descriptions.Item label="Số HĐ">{order.contract_no || '—'}</Descriptions.Item>
            )}
            {isChild && (
              <Descriptions.Item label="Số HĐ ký" span={2}>
                <Space size={[8, 4]} wrap>
                  <Text strong copyable={{ text: docsNo, tooltips: ['Chép số HĐ ký', 'Đã chép'] }} style={{ fontFamily: 'monospace' }}>
                    {docsNo}
                  </Text>
                  {docsDate ? <Text type="secondary">ngày {fDate(docsDate)}</Text> : null}
                  <Text type="secondary" style={{ fontSize: 12 }}>· in ô CONTRACT NO., khai hải quan</Text>
                  {order.docs_cite_root === false ? (
                    <Text type="secondary" style={{ fontSize: 12 }}>(đơn này in số riêng — đổi ở tab Hợp đồng)</Text>
                  ) : null}
                  <Button type="link" size="small" onClick={openRoot} style={{ padding: 0, height: 'auto' }}>
                    Mở HĐ gốc {fam.rootNo}
                  </Button>
                </Space>
              </Descriptions.Item>
            )}
            <Descriptions.Item label="Trạng thái">
              <EnumTag value={order.status} labels={ORDER_STATUS_LABELS} colors={ORDER_STATUS_COLORS} />
            </Descriptions.Item>
            {fam.ready && (
              <Descriptions.Item label="Loại đơn">
                {isChild ? (
                  <Space size={[6, 2]} wrap>
                    <EnumTag value={orderKind(order)} labels={ORDER_KIND_LABELS} colors={ORDER_KIND_COLORS} style={{ marginInlineEnd: 0 }} />
                    <Text type="secondary" style={{ fontSize: 12 }}>{seq ? `Đợt ${seq} · ` : ''}HĐ {fam.rootNo}</Text>
                  </Space>
                ) : (
                  // HĐ mới: CHỮ THƯỜNG — Tag 'default' dễ đọc nhầm là "Nháp"
                  <span>
                    {ORDER_KIND_LABELS.new}
                    {fam.liveChildren.length > 0 ? (
                      <Text type="secondary" style={{ fontSize: 12 }}> · HĐ gốc của {fam.live.length} đợt</Text>
                    ) : null}
                  </span>
                )}
              </Descriptions.Item>
            )}
            <Descriptions.Item label="Grade" span={fam.ready ? 2 : 1}>
              {/* Tên hỗn hợp dài (vd "MIXTURES OF NATURAL RUBBER SVR10 AND SBR1502 …") phải xuống dòng,
                  không thì bảng rộng gấp rưỡi màn hình điện thoại. */}
              <Tag color="blue" style={{ whiteSpace: 'normal', height: 'auto', lineHeight: 1.5, padding: '2px 8px', wordBreak: 'break-word' }}>{gradeLabel}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Người mua" span={2}>
              {cust?.name || '—'} {cust?.country ? `(${cust.country})` : ''}
              {receiver ? (
                <Text style={{ fontWeight: 600 }}> → {partyShortName(receiver)} <Text type="secondary" style={{ fontWeight: 400, fontSize: 12 }}>(người nhận)</Text></Text>
              ) : null}
            </Descriptions.Item>
            <Descriptions.Item label="Số lượng">{fmtNum(order.quantity_tons, 3)} tấn ({fmtKg(order.quantity_kg)} kg)</Descriptions.Item>
            <Descriptions.Item label="Đơn giá">{fmtMoney(order.unit_price, order.currency, { decimals: 0 })} / tấn</Descriptions.Item>
            <Descriptions.Item label="Giá trị">{fmtMoney(orderTotalInCurrency(order), order.currency, { decimals: 0 })}</Descriptions.Item>
            <Descriptions.Item label="Incoterm">{INCOTERM_LABELS[order.incoterm as Incoterm] || order.incoterm || '—'}</Descriptions.Item>
            {/* polLabel: tên cảng, không in thẳng mã 'HCM_CAT_LAI' (audit 17/11/2026) */}
            <Descriptions.Item label="Cảng xếp">{polLabel(order.port_of_loading)}</Descriptions.Item>
            <Descriptions.Item label="Cảng đích">{order.port_of_destination || '—'}</Descriptions.Item>
            <Descriptions.Item label="Container">{order.container_count || 0} × {CONTAINER_TYPE_LABELS[order.container_type as keyof typeof CONTAINER_TYPE_LABELS] || order.container_type || '20ft'}</Descriptions.Item>
            {/* fmtNum: '5.760' (trước in '5760' thiếu dấu ngăn nghìn) · fmtKg: '33,33' */}
            <Descriptions.Item label="Tổng bành / KL bành">
              {order.total_bales ? fmtNum(order.total_bales) : '—'} · {order.bale_weight_kg ? `${fmtKg(order.bale_weight_kg)} kg` : '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Đóng gói" span={2}>
              {PACKING_TYPE_LABELS[order.packing_type as PackingType] || order.packing_type}
              {order.shrink_wrap ? ' + Shrink wrap' : ''}
              {order.pallet_required ? ' + Pallet' : ''}
              {order.packing_note ? <span style={{ fontSize: 12, color: '#666', fontStyle: 'italic' }}> · {order.packing_note}</span> : ''}
            </Descriptions.Item>
            <Descriptions.Item label="PO# KH">{order.customer_po || '—'}</Descriptions.Item>
            {isVnd(order.currency)
              ? <Descriptions.Item label="Quy đổi USD">{fmtMoney(order.total_value_usd, 'USD', { decimals: 0 })}</Descriptions.Item>
              : <Descriptions.Item label="Giá trị VND">{fmtMoney(order.total_value_vnd, 'VND')}</Descriptions.Item>}
            <Descriptions.Item label="Tỷ giá">{order.exchange_rate ? `${order.exchange_rate.toLocaleString('vi-VN')} VND/USD` : '—'}</Descriptions.Item>
            <Descriptions.Item label="Thanh toán" span={2}>
              {PAYMENT_TERMS_LABELS[order.payment_terms as PaymentTerms] || order.payment_terms || '—'}
              {order.payment_terms_note ? <span style={{ fontSize: 12, color: '#666', fontStyle: 'italic' }}> · {order.payment_terms_note}</span> : ''}
            </Descriptions.Item>
            <Descriptions.Item label="Số L/C">{order.lc_number || '—'}</Descriptions.Item>
            <Descriptions.Item label="NH L/C">{order.lc_bank || '—'}</Descriptions.Item>
            <Descriptions.Item label="Hết hạn L/C">{fDate(order.lc_expiry_date)}</Descriptions.Item>
            <Descriptions.Item label="Ngày đặt">{fDate(order.order_date)}</Descriptions.Item>
            <Descriptions.Item label="Ngày giao">{fDate(order.delivery_date)}</Descriptions.Item>
            <Descriptions.Item label="Shipment Time">{order.shipment_time || '—'}</Descriptions.Item>
            <Descriptions.Item label="Hãng tàu">{order.shipping_line || '—'}</Descriptions.Item>
            <Descriptions.Item label="Tàu / Chuyến">{order.vessel_name || '—'}</Descriptions.Item>
            <Descriptions.Item label="Booking ref">{order.booking_reference || '—'}</Descriptions.Item>
            <Descriptions.Item label="ETD">{fDate(order.etd)}</Descriptions.Item>
            <Descriptions.Item label="ETA">{fDate(order.eta)}</Descriptions.Item>
            <Descriptions.Item label="Shipping marks" span={2}>
              {order.shipping_marks ? <span style={{ whiteSpace: 'pre-line' }}>{order.shipping_marks}</span> : <span style={{ color: '#aaa' }}>(hồ sơ khách)</span>}
            </Descriptions.Item>
            <Descriptions.Item label="Ghi chú" span={2}>{order.notes || '—'}</Descriptions.Item>
          </Descriptions>
        </Card>
      </Col>
      <Col xs={24} lg={9}>
        {/* Thẻ CÁC BÊN (Người mua → Người nhận → chữ in Consignee/Notify) — thay thẻ "Khách hàng" cũ */}
        <OrderPartiesCard order={order} salesRole={salesRole} onSaved={onSaved} />
        <Card size="small" title="Chỉ tiêu kỹ thuật yêu cầu">
          <Descriptions column={2} size="small" bordered>
            <Descriptions.Item label="DRC min">{order.drc_min ?? '—'} %</Descriptions.Item>
            <Descriptions.Item label="DRC max">{order.drc_max ?? '—'} %</Descriptions.Item>
            <Descriptions.Item label="Moisture">{order.moisture_max ?? '—'} %</Descriptions.Item>
            <Descriptions.Item label="Dirt">{order.dirt_max ?? '—'} %</Descriptions.Item>
            <Descriptions.Item label="Ash">{order.ash_max ?? '—'} %</Descriptions.Item>
            <Descriptions.Item label="Nitrogen">{order.nitrogen_max ?? '—'} %</Descriptions.Item>
            <Descriptions.Item label="PRI">{order.pri_min ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Mooney">{order.mooney_max ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Volatile">{order.volatile_max ?? '—'} %</Descriptions.Item>
            <Descriptions.Item label="Color">{order.color_lovibond_max ?? '—'}</Descriptions.Item>
          </Descriptions>
        </Card>
      </Col>
      {/* Các đợt cùng HĐ — tự ẩn khi họ < 2 đơn (đơn thường) hoặc chưa migration */}
      <Col xs={24}>
        <OrderFamilyBlock order={order} />
      </Col>
    </Row>
  )
}
