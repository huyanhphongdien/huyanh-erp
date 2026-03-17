// ============================================================================
// BOOKING FORM MODAL — Form tạo phiếu chốt mủ (Factory side)
// File: src/components/b2b/BookingFormModal.tsx
// Khi nhân viên nhà máy chốt với đại lý → tạo booking pending
// ============================================================================

import { useState, useEffect } from 'react'
import {
  Modal,
  Form,
  Select,
  InputNumber,
  Input,
  DatePicker,
  Row,
  Col,
  Divider,
  Typography,
  Space,
  Tag,
} from 'antd'
import { AuditOutlined } from '@ant-design/icons'
import {
  PRODUCT_TYPE_LABELS,
  type BookingMetadata,
} from '../../services/b2b/chatMessageService'
import {
  PICKUP_LOCATIONS,
  COUNTRY_LABELS,
  COUNTRY_FLAGS,
  getLocationsByCountry,
  getCountries,
} from '../../constants/pickupLocations'
import dayjs from 'dayjs'

const { Text, Title } = Typography
const { TextArea } = Input

// ============================================
// TYPES
// ============================================

interface BookingFormModalProps {
  open: boolean
  onCancel: () => void
  onSubmit: (booking: BookingMetadata) => void
  loading?: boolean
  partnerName?: string
}

// ============================================
// HELPERS
// ============================================

const generateBookingCode = (): string => {
  const now = new Date()
  const year = now.getFullYear().toString().slice(-2)
  const month = (now.getMonth() + 1).toString().padStart(2, '0')
  const day = now.getDate().toString().padStart(2, '0')
  const random = Math.random().toString(36).substring(2, 6).toUpperCase()
  return `BK${year}${month}${day}-${random}`
}

// ============================================
// COMPONENT
// ============================================

const BookingFormModal = ({
  open,
  onCancel,
  onSubmit,
  loading = false,
  partnerName,
}: BookingFormModalProps) => {
  const [form] = Form.useForm()
  const [estimatedValue, setEstimatedValue] = useState(0)
  const [showCustomLocation, setShowCustomLocation] = useState(false)

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      form.resetFields()
      setEstimatedValue(0)
      setShowCustomLocation(false)
    }
  }, [open, form])

  // Calculate estimated value on field change
  const handleValuesChange = () => {
    const values = form.getFieldsValue()
    const qty = values.quantity_tons || 0
    const price = values.price_per_kg || 0
    const drc = values.drc_percent || 0
    const priceUnit = values.price_unit || 'wet'

    let estimated = 0
    if (priceUnit === 'wet') {
      // Giá ướt: qty(tấn) × 1000(kg) × giá/kg
      estimated = qty * 1000 * price
    } else {
      // Giá khô: qty(tấn) × 1000(kg) × DRC% × giá/kg
      estimated = qty * 1000 * (drc / 100) * price
    }
    setEstimatedValue(Math.round(estimated))
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      // Resolve pickup location label
      let pickupLocationLabel: string | undefined
      if (values.pickup_location) {
        if (values.pickup_location === 'other') {
          pickupLocationLabel = values.custom_location?.trim() || undefined
        } else {
          const found = PICKUP_LOCATIONS.find(l => l.value === values.pickup_location)
          pickupLocationLabel = found?.label || values.pickup_location
        }
      }

      const booking: BookingMetadata = {
        code: generateBookingCode(),
        product_type: values.product_type,
        quantity_tons: values.quantity_tons,
        drc_percent: values.drc_percent,
        price_per_kg: values.price_per_kg,
        price_unit: values.price_unit,
        estimated_value: estimatedValue,
        pickup_location: pickupLocationLabel,
        delivery_date: values.delivery_date
          ? dayjs(values.delivery_date).format('YYYY-MM-DD')
          : dayjs().add(1, 'day').format('YYYY-MM-DD'),
        notes: values.notes || undefined,
        status: 'pending',
      }
      onSubmit(booking)
    } catch {
      // Validation error
    }
  }

  const formatCurrency = (value: number): string => {
    return value.toLocaleString('vi-VN')
  }

  return (
    <Modal
      title={
        <Space>
          <AuditOutlined style={{ color: '#F59E0B', fontSize: 20 }} />
          <span>Tạo phiếu chốt mủ</span>
          {partnerName && (
            <Tag color="blue">{partnerName}</Tag>
          )}
        </Space>
      }
      open={open}
      onOk={handleSubmit}
      onCancel={onCancel}
      confirmLoading={loading}
      okText="Gửi phiếu chốt"
      cancelText="Hủy"
      width={520}
      destroyOnHidden
    >
      <Form
        form={form}
        layout="vertical"
        onValuesChange={handleValuesChange}
        initialValues={{
          price_unit: 'wet',
          drc_percent: 60,
        }}
        style={{ marginTop: 16 }}
      >
        {/* Loại mủ */}
        <Form.Item
          name="product_type"
          label="Loại mủ"
          rules={[{ required: true, message: 'Chọn loại mủ' }]}
        >
          <Select
            placeholder="Chọn loại mủ cao su"
            options={Object.entries(PRODUCT_TYPE_LABELS).map(([value, label]) => ({
              value,
              label,
            }))}
            size="large"
          />
        </Form.Item>

        <Row gutter={16}>
          {/* Số lượng */}
          <Col span={12}>
            <Form.Item
              name="quantity_tons"
              label="Số lượng (tấn)"
              rules={[
                { required: true, message: 'Nhập số lượng' },
                { type: 'number', min: 0.1, message: 'Tối thiểu 0.1 tấn' },
              ]}
            >
              <InputNumber<number>
                style={{ width: '100%' }}
                min={0.1}
                step={0.5}
                placeholder="VD: 5"
                formatter={(value) => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                parser={(value) => Number(value!.replace(/,/g, '')) || 0}
                size="large"
              />
            </Form.Item>
          </Col>

          {/* DRC */}
          <Col span={12}>
            <Form.Item
              name="drc_percent"
              label="DRC (%)"
              rules={[
                { required: true, message: 'Nhập DRC' },
                { type: 'number', min: 1, max: 100, message: '1-100%' },
              ]}
            >
              <InputNumber<number>
                style={{ width: '100%' }}
                min={1}
                max={100}
                step={1}
                placeholder="VD: 60"
                suffix="%"
                size="large"
              />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          {/* Đơn giá */}
          <Col span={12}>
            <Form.Item
              name="price_per_kg"
              label="Đơn giá (đ/kg)"
              rules={[
                { required: true, message: 'Nhập đơn giá' },
                { type: 'number', min: 100, message: 'Giá không hợp lệ' },
              ]}
            >
              <InputNumber<number>
                style={{ width: '100%' }}
                min={100}
                step={100}
                placeholder="VD: 12,000"
                formatter={(value) => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                parser={(value) => Number(value!.replace(/,/g, '')) || 0}
                size="large"
              />
            </Form.Item>
          </Col>

          {/* Loại giá */}
          <Col span={12}>
            <Form.Item
              name="price_unit"
              label="Loại giá"
              rules={[{ required: true }]}
            >
              <Select
                size="large"
                options={[
                  { value: 'wet', label: 'Giá ướt' },
                  { value: 'dry', label: 'Giá khô (theo DRC)' },
                ]}
              />
            </Form.Item>
          </Col>
        </Row>

        {/* Địa điểm chốt hàng */}
        <Form.Item
          name="pickup_location"
          label="Địa điểm chốt hàng"
          rules={[{ required: true, message: 'Vui lòng chọn địa điểm' }]}
          tooltip="Chọn địa điểm sẽ tự động điền DRC dự kiến"
        >
          <Select
            placeholder="Chọn địa điểm"
            showSearch
            optionFilterProp="label"
            onChange={(value) => {
              setShowCustomLocation(value === 'other')
              // Auto-fill DRC khi chọn địa điểm
              if (value !== 'other') {
                const found = PICKUP_LOCATIONS.find(l => l.value === value)
                if (found) {
                  form.setFieldsValue({ drc_percent: found.default_drc })
                  handleValuesChange()
                }
              }
            }}
            size="large"
          >
            {getCountries().map(country => (
              <Select.OptGroup key={country} label={`${COUNTRY_FLAGS[country] || ''} ${COUNTRY_LABELS[country] || country}`}>
                {getLocationsByCountry(country).map(loc => (
                  <Select.Option key={loc.value} value={loc.value} label={loc.label}>
                    {loc.label} (DRC ~{loc.default_drc}%)
                  </Select.Option>
                ))}
              </Select.OptGroup>
            ))}
            <Select.OptGroup label="Khác">
              <Select.Option value="other" label="Khác (nhập tay)">Khác (nhập tay)</Select.Option>
            </Select.OptGroup>
          </Select>
        </Form.Item>

        {showCustomLocation && (
          <Form.Item
            name="custom_location"
            label="Nhập địa điểm"
            rules={[{ required: true, message: 'Vui lòng nhập địa điểm' }]}
          >
            <Input placeholder="VD: Huyện XYZ, Tỉnh ABC" size="large" />
          </Form.Item>
        )}

        {/* Ngày giao hàng */}
        <Form.Item
          name="delivery_date"
          label="Ngày giao hàng dự kiến"
        >
          <DatePicker
            style={{ width: '100%' }}
            format="DD/MM/YYYY"
            placeholder="Chọn ngày giao hàng"
            disabledDate={(current) => current && current < dayjs().startOf('day')}
            size="large"
          />
        </Form.Item>

        {/* Ghi chú */}
        <Form.Item name="notes" label="Ghi chú">
          <TextArea
            rows={2}
            placeholder="Ghi chú thêm (điều kiện giao hàng, yêu cầu đặc biệt...)"
            maxLength={500}
            showCount
          />
        </Form.Item>

        {/* Estimated Value Preview */}
        <Divider style={{ margin: '12px 0' }} />
        <div
          style={{
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            borderRadius: 12,
            padding: 16,
            textAlign: 'center',
          }}
        >
          <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13 }}>
            Giá trị ước tính
          </Text>
          <Title
            level={3}
            style={{ color: '#ffd700', margin: '4px 0 0' }}
          >
            {estimatedValue > 0 ? `${formatCurrency(estimatedValue)} VNĐ` : '—'}
          </Title>
        </div>
      </Form>
    </Modal>
  )
}

export default BookingFormModal
