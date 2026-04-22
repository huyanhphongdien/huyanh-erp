// ============================================================================
// CONFIRM DEAL MODAL — Modal xác nhận Deal + Tạm ứng từ Chat
// File: src/components/b2b/ConfirmDealModal.tsx
//
// Hiển thị khi user click "Xác nhận" trên BookingCard
// 2 phần: Thông tin Deal (điều chỉnh được) + Tạm ứng (tùy chọn)
// ============================================================================

import { useState, useEffect, useMemo } from 'react'
import {
  Modal,
  Form,
  Select,
  InputNumber,
  Input,
  Row,
  Col,
  Divider,
  Typography,
  Space,
  Tag,
  Radio,
  Alert,
  Tooltip,
} from 'antd'
import {
  CheckCircleOutlined,
  EnvironmentOutlined,
  InfoCircleOutlined,
  DollarOutlined,
} from '@ant-design/icons'
import type { BookingMetadata } from '../../services/b2b/chatMessageService'
import { PRODUCT_TYPE_LABELS } from '../../services/b2b/chatMessageService'
import type { ConfirmDealFormData } from '../../types/b2b.types'
import { calculateEstimatedValue } from '../../services/b2b/dealConfirmService'
import { supabase } from '../../lib/supabase'

const { Text, Title } = Typography
const { TextArea } = Input

// ============================================
// TYPES
// ============================================

interface ConfirmDealModalProps {
  open: boolean
  onCancel: () => void
  onConfirm: (data: ConfirmDealFormData) => Promise<void>
  loading?: boolean
  booking: BookingMetadata | null
  partnerName?: string
  /** Chỉ factory mới có quyền tạm ứng */
  showAdvanceSection?: boolean
}

// ============================================
// HELPERS
// ============================================

const formatCurrency = (value: number): string => {
  return value.toLocaleString('vi-VN')
}

// ============================================
// COMPONENT
// ============================================

const ConfirmDealModal = ({
  open,
  onCancel,
  onConfirm,
  loading = false,
  booking,
  partnerName,
  showAdvanceSection = true,
}: ConfirmDealModalProps) => {
  const [form] = Form.useForm()
  const [hasAdvance, setHasAdvance] = useState(false)
  const [dealType, setDealType] = useState<string>('purchase')
  const [resolvedFacility, setResolvedFacility] = useState<{
    id: string | null; code: string | null; name: string | null
  }>({ id: null, code: null, name: null })

  // Reset khi mở modal
  useEffect(() => {
    if (open && booking) {
      form.setFieldsValue({
        product_type: booking.product_type,
        agreed_quantity_tons: booking.quantity_tons,
        expected_drc: booking.drc_percent,
        agreed_price: booking.price_per_kg,
        price_unit: booking.price_unit || 'wet',
        target_facility_id: (booking as any).target_facility_id,
        delivery_date: booking.delivery_date,
        deal_notes: '',
        has_advance: false,
        advance_amount: undefined,
        advance_payment_method: 'cash',
        advance_receiver_name: '',
        advance_receiver_phone: '',
        advance_notes: '',
      })
      setHasAdvance(false)
      const demandType = (booking as any).demand_type || (booking as any).deal_type || 'purchase'
      setDealType(demandType as string)
      // Reset resolved state
      setResolvedFacility({
        id: (booking as any).target_facility_id || null,
        code: (booking as any).target_facility_code || null,
        name: (booking as any).target_facility_name || null,
      })
    }
  }, [open, booking, form])

  // Fallback: nếu booking không có target_facility_id nhưng có demand_id → lookup
  // từ demand.warehouse_id → warehouse.facility_id. Fix case booking cũ portal
  // chưa gửi facility info.
  useEffect(() => {
    if (!open || !booking) return
    const bookingAny = booking as any
    if (bookingAny.target_facility_id) return  // đã có, skip
    const demandId = bookingAny.demand_id
    if (!demandId) return
    const resolve = async () => {
      const { data: dem } = await supabase
        .from('b2b_demands')
        .select('warehouse_id')
        .eq('id', demandId)
        .maybeSingle()
      if (!dem?.warehouse_id) return
      const { data: wh } = await supabase
        .from('warehouses')
        .select('facility_id, facilities:facility_id(id, code, name)')
        .eq('id', dem.warehouse_id)
        .maybeSingle()
      const fac = (wh as any)?.facilities
      const facId = fac?.id || (wh as any)?.facility_id || null
      if (!facId) return
      setResolvedFacility({
        id: facId,
        code: fac?.code || null,
        name: fac?.name || null,
      })
      form.setFieldValue('target_facility_id', facId)
    }
    resolve()
  }, [open, booking, form])

  // Tính giá trị ước tính (reactive)
  const estimatedValue = useMemo(() => {
    if (!booking) return 0
    const values = form.getFieldsValue()
    return calculateEstimatedValue({
      quantity_tons: values.agreed_quantity_tons || booking.quantity_tons || 0,
      price_per_kg: values.agreed_price || booking.price_per_kg || 0,
      price_unit: values.price_unit || booking.price_unit || 'wet',
      drc_percent: values.expected_drc || booking.drc_percent || 0,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, booking])

  const [liveEstimatedValue, setLiveEstimatedValue] = useState(0)

  useEffect(() => {
    setLiveEstimatedValue(estimatedValue)
  }, [estimatedValue])

  const handleValuesChange = () => {
    const values = form.getFieldsValue()
    const newEstimate = calculateEstimatedValue({
      quantity_tons: values.agreed_quantity_tons || 0,
      price_per_kg: values.agreed_price || 0,
      price_unit: values.price_unit || 'wet',
      drc_percent: values.expected_drc || 0,
    })
    setLiveEstimatedValue(newEstimate)
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      const bookingMeta = booking as any
      const finalFacilityId = values.target_facility_id
        || bookingMeta?.target_facility_id
        || resolvedFacility.id
      const data: ConfirmDealFormData = {
        product_type: values.product_type,
        agreed_quantity_tons: values.agreed_quantity_tons,
        expected_drc: values.expected_drc,
        agreed_price: values.agreed_price,
        price_unit: values.price_unit,
        // pickup_location đã bỏ khỏi form
        target_facility_id: finalFacilityId,
        target_facility_code: bookingMeta?.target_facility_code || resolvedFacility.code,
        target_facility_name: bookingMeta?.target_facility_name || resolvedFacility.name,
        delivery_date: values.delivery_date || booking?.delivery_date,
        deal_notes: values.deal_notes,
        deal_type: dealType as 'purchase' | 'sale' | 'processing' | 'consignment',
        processing_fee_per_ton: values.processing_fee_per_ton || null,
        expected_output_rate: values.expected_output_rate || null,
        has_advance: hasAdvance,
        ...(hasAdvance && {
          advance_amount: values.advance_amount,
          advance_payment_method: values.advance_payment_method,
          advance_receiver_name: values.advance_receiver_name,
          advance_receiver_phone: values.advance_receiver_phone,
          advance_notes: values.advance_notes,
        }),
      }
      await onConfirm(data)
    } catch {
      // Validation error
    }
  }

  if (!booking) return null

  const advanceAmount = hasAdvance ? (form.getFieldValue('advance_amount') || 0) : 0
  const balanceDue = liveEstimatedValue - advanceAmount

  return (
    <Modal
      title={
        <Space>
          <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 20 }} />
          <span>Xác nhận tạo Deal</span>
          {partnerName && <Tag color="blue">{partnerName}</Tag>}
        </Space>
      }
      open={open}
      onOk={handleSubmit}
      onCancel={onCancel}
      confirmLoading={loading}
      okText={hasAdvance ? 'Tạo Deal + Ghi tạm ứng' : 'Tạo Deal'}
      cancelText="Hủy"
      width={580}
      destroyOnHidden
    >
      <Form
        form={form}
        layout="vertical"
        onValuesChange={handleValuesChange}
        style={{ marginTop: 16 }}
      >
        {/* ============================================ */}
        {/* PHẦN 1: THÔNG TIN DEAL */}
        {/* ============================================ */}

        <Divider style={{ marginTop: 0 }}>
          Thông tin Deal
        </Divider>

        {/* NEW-BUG-F fix: các trường đã chốt từ phiếu booking → LOCK, không cho
            factory sửa để giữ nguyên thỏa thuận với đại lý. Chỉ Ghi chú Deal
            và section Tạm ứng mới editable. Muốn đổi số lượng/giá/DRC phải
            thương lượng lại qua chat hoặc reject booking. */}
        <Alert
          message="Các trường dưới đây khóa theo phiếu chốt mủ"
          description="Loại mủ, số lượng, DRC, đơn giá, nhà máy đã thỏa thuận trên phiếu chốt không thể sửa khi tạo deal. Nếu cần thay đổi, phản hồi qua chat rồi đại lý chốt lại phiếu mới."
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />

        {/* Loại mủ — lock */}
        <Form.Item
          name="product_type"
          label="Loại mủ"
          rules={[{ required: true, message: 'Chọn loại mủ' }]}
        >
          <Select
            disabled
            options={Object.entries(PRODUCT_TYPE_LABELS).map(([value, label]) => ({
              value,
              label,
            }))}
            size="large"
          />
        </Form.Item>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="agreed_quantity_tons"
              label="Số lượng (tấn)"
              rules={[
                { required: true, message: 'Nhập số lượng' },
                { type: 'number', min: 0.1, message: 'Tối thiểu 0.1 tấn' },
              ]}
            >
              <InputNumber<number>
                disabled
                style={{ width: '100%' }}
                min={0.1}
                step={0.5}
                formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                parser={(v) => Number(v!.replace(/,/g, '')) || 0}
                size="large"
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="expected_drc"
              label={
                <Space>
                  DRC dự kiến (%)
                  <Tooltip title="DRC ban đầu, phụ thuộc nhiều yếu tố. DRC thực tế sẽ cập nhật sau QC.">
                    <InfoCircleOutlined style={{ color: '#faad14' }} />
                  </Tooltip>
                </Space>
              }
              rules={[
                { required: true, message: 'Nhập DRC' },
                { type: 'number', min: 1, max: 100, message: '1-100%' },
              ]}
            >
              <InputNumber<number>
                disabled
                style={{ width: '100%' }}
                min={1}
                max={100}
                step={1}
                suffix="%"
                size="large"
              />
            </Form.Item>
          </Col>
        </Row>

        {/* Loại giá — hidden, kế thừa từ booking */}
        <Form.Item name="price_unit" hidden>
          <Input />
        </Form.Item>

        <Form.Item
          name="agreed_price"
          label="Đơn giá thỏa thuận (đ/kg)"
          rules={[
            { required: true, message: 'Nhập đơn giá' },
            { type: 'number', min: 100, message: 'Giá không hợp lệ' },
          ]}
        >
          <InputNumber<number>
            disabled
            style={{ width: '100%' }}
            min={100}
            step={100}
            formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
            parser={(v) => Number(v!.replace(/,/g, '')) || 0}
            size="large"
          />
        </Form.Item>

        {/* Giao tại nhà máy — kế thừa + lock.
            Thứ tự fallback: booking.target_facility_id (portal đã gửi)
                           → resolvedFacility (lookup demand.warehouse.facility)
                           → rỗng (factory phải chọn tay) */}
        <Form.Item
          name="target_facility_id"
          label={<><span style={{ marginRight: 4 }}>🏭</span> Giao tại nhà máy</>}
          initialValue={(booking as any).target_facility_id || resolvedFacility.id}
          rules={[{ required: true, message: 'Vui lòng chọn nhà máy nhận hàng' }]}
          extra={
            (booking as any).target_facility_code
              ? `Kế thừa từ phiếu chốt (${(booking as any).target_facility_code} — ${(booking as any).target_facility_name || ''})`
              : resolvedFacility.code
                ? `Kế thừa từ nhu cầu mua (${resolvedFacility.code} — ${resolvedFacility.name || ''})`
                : 'Phiếu chốt + nhu cầu mua đều chưa chọn nhà máy. Factory tự chọn.'
          }
        >
          <Select
            disabled={!!((booking as any).target_facility_id) || !!resolvedFacility.id}
            placeholder="Chọn nhà máy nhận hàng"
            options={[
              { value: '755ae776-3be6-47b8-b1d0-d15b61789f24', label: '🏭 PD — Phong Điền (HQ)' },
              { value: '9bc1467c-0cbe-4982-abc1-192c61ef7dca', label: '🏭 TL — Tân Lâm' },
              { value: '67b45068-6e7c-4888-b8b3-49721bb9cb96', label: '🏭 LAO — Lào' },
            ]}
          />
        </Form.Item>

        {/* Giá trị ước tính */}
        <div
          style={{
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            borderRadius: 12,
            padding: 16,
            textAlign: 'center',
            marginBottom: 16,
          }}
        >
          <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13 }}>
            Giá trị ước tính
          </Text>
          <Title level={3} style={{ color: '#ffd700', margin: '4px 0 0' }}>
            {liveEstimatedValue > 0 ? `${formatCurrency(liveEstimatedValue)} VNĐ` : '—'}
          </Title>
        </div>

        {dealType === 'processing' && (
          <>
            <Form.Item label="Phí gia công (đ/tấn)" name="processing_fee_per_ton">
              <InputNumber style={{width:'100%'}} min={0} placeholder="VD: 2,500,000"
                formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                parser={v => v!.replace(/,/g, '') as any} />
            </Form.Item>
            <Form.Item label="Tỷ lệ thu hồi dự kiến (%)" name="expected_output_rate" initialValue={80}>
              <InputNumber style={{width:'100%'}} min={1} max={100} suffix="%" />
            </Form.Item>
          </>
        )}

        {/* Ghi chú */}
        <Form.Item name="deal_notes" label="Ghi chú Deal">
          <TextArea
            rows={2}
            placeholder="Ghi chú thêm cho deal..."
            maxLength={500}
            showCount
          />
        </Form.Item>

        {/* ============================================ */}
        {/* PHẦN 2: TẠM ỨNG */}
        {/* ============================================ */}

        {showAdvanceSection && dealType !== 'processing' && (
          <>
            <Divider>
              <Space>
                <DollarOutlined />
                Tạm ứng
              </Space>
            </Divider>

            <Form.Item name="has_advance" label="Tạm ứng ngay?">
              <Radio.Group
                onChange={(e) => setHasAdvance(e.target.value)}
                value={hasAdvance}
              >
                <Space direction="vertical">
                  <Radio value={false}>Không, ghi nợ toàn bộ</Radio>
                  <Radio value={true}>Có, tạm ứng ngay</Radio>
                </Space>
              </Radio.Group>
            </Form.Item>

            {hasAdvance && (
              <div
                style={{
                  background: '#fafafa',
                  border: '1px solid #f0f0f0',
                  borderRadius: 8,
                  padding: 16,
                }}
              >
                <Form.Item
                  name="advance_amount"
                  label="Số tiền ứng (VNĐ)"
                  rules={[
                    { required: true, message: 'Nhập số tiền ứng' },
                    { type: 'number', min: 1, message: 'Số tiền phải > 0' },
                    {
                      type: 'number',
                      max: liveEstimatedValue || undefined,
                      message: 'Không vượt quá giá trị Deal',
                    },
                  ]}
                >
                  <InputNumber<number>
                    style={{ width: '100%' }}
                    min={1}
                    step={1000000}
                    formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                    parser={(v) => Number(v!.replace(/,/g, '')) || 0}
                    placeholder="VD: 20,000,000"
                    size="large"
                  />
                </Form.Item>

                <Form.Item
                  name="advance_payment_method"
                  label="Hình thức"
                  rules={[{ required: true, message: 'Chọn hình thức' }]}
                >
                  <Select
                    size="large"
                    options={[
                      { value: 'cash', label: 'Tiền mặt' },
                      { value: 'bank_transfer', label: 'Chuyển khoản' },
                    ]}
                  />
                </Form.Item>

                <Row gutter={16}>
                  <Col span={12}>
                    <Form.Item
                      name="advance_receiver_name"
                      label="Người nhận"
                      rules={[{ required: true, message: 'Nhập người nhận' }]}
                    >
                      <Input placeholder="Tên người nhận" size="large" />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item name="advance_receiver_phone" label="SĐT">
                      <Input placeholder="0905 xxx xxx" size="large" />
                    </Form.Item>
                  </Col>
                </Row>

                <Form.Item name="advance_notes" label="Ghi chú ứng">
                  <TextArea rows={2} placeholder="VD: Ứng tại vườn" />
                </Form.Item>
              </div>
            )}

            {/* ============================================ */}
            {/* TÓM TẮT TÀI CHÍNH */}
            {/* ============================================ */}

            {hasAdvance && liveEstimatedValue > 0 && (
              <div
                style={{
                  marginTop: 16,
                  padding: 16,
                  background: '#f6ffed',
                  border: '1px solid #b7eb8f',
                  borderRadius: 8,
                }}
              >
                <Row justify="space-between" style={{ marginBottom: 4 }}>
                  <Text>Giá trị Deal:</Text>
                  <Text strong>{formatCurrency(liveEstimatedValue)} VNĐ</Text>
                </Row>
                <Row justify="space-between" style={{ marginBottom: 4 }}>
                  <Text>Tạm ứng:</Text>
                  <Text strong style={{ color: '#cf1322' }}>
                    - {formatCurrency(advanceAmount)} VNĐ
                  </Text>
                </Row>
                <Divider style={{ margin: '8px 0' }} />
                <Row justify="space-between">
                  <Text strong>Còn phải trả:</Text>
                  <Text strong style={{ color: '#1890ff', fontSize: 16 }}>
                    {formatCurrency(balanceDue)} VNĐ
                  </Text>
                </Row>
              </div>
            )}
          </>
        )}
      </Form>
    </Modal>
  )
}

export default ConfirmDealModal
