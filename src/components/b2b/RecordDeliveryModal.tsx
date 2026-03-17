// ============================================================================
// RECORD DELIVERY MODAL — Modal ghi nhận giao hàng cho Deal từ Chat
// File: src/components/b2b/RecordDeliveryModal.tsx
//
// Mở khi user click "Giao hàng" trên DealCard (cả factory + partner)
// Ghi nhận lượng mủ giao, DRC tại giao, thông tin xe/tài xế
// ============================================================================

import {
  Modal,
  Form,
  InputNumber,
  Input,
  Row,
  Col,
  Typography,
  Space,
  Tag,
  DatePicker,
  Divider,
} from 'antd'
import {
  SendOutlined,
} from '@ant-design/icons'
import type { DealCardMetadata } from '../../types/b2b.types'
import { PRODUCT_TYPE_LABELS } from '../../services/b2b/chatMessageService'
import dayjs from 'dayjs'

const { Text } = Typography
const { TextArea } = Input

// ============================================
// TYPES
// ============================================

export interface RecordDeliveryFormData {
  quantity_kg: number
  drc_at_delivery?: number
  vehicle_plate?: string
  driver_name?: string
  driver_phone?: string
  delivery_date: string
  notes?: string
}

interface RecordDeliveryModalProps {
  open: boolean
  onCancel: () => void
  onConfirm: (data: RecordDeliveryFormData) => Promise<void>
  loading?: boolean
  deal: DealCardMetadata | null
  partnerName?: string
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

const RecordDeliveryModal = ({
  open,
  onCancel,
  onConfirm,
  loading = false,
  deal,
  partnerName,
}: RecordDeliveryModalProps) => {
  const [form] = Form.useForm()

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      await onConfirm({
        quantity_kg: values.quantity_kg,
        drc_at_delivery: values.drc_at_delivery,
        vehicle_plate: values.vehicle_plate,
        driver_name: values.driver_name,
        driver_phone: values.driver_phone,
        delivery_date: values.delivery_date
          ? dayjs(values.delivery_date).format('YYYY-MM-DD')
          : dayjs().format('YYYY-MM-DD'),
        notes: values.notes,
      })
      form.resetFields()
    } catch {
      // Validation error
    }
  }

  if (!deal) return null

  const productLabel = PRODUCT_TYPE_LABELS[deal.product_type] || deal.product_type
  const quantityTons = deal.quantity_kg / 1000

  return (
    <Modal
      title={
        <Space>
          <SendOutlined style={{ color: '#1890ff', fontSize: 20 }} />
          <span>Ghi nhận giao hàng</span>
          {partnerName && <Tag color="blue">{partnerName}</Tag>}
        </Space>
      }
      open={open}
      onOk={handleSubmit}
      onCancel={onCancel}
      confirmLoading={loading}
      okText="Ghi nhận giao hàng"
      cancelText="Hủy"
      width={520}
      destroyOnHidden
    >
      {/* Deal summary */}
      <div
        style={{
          background: '#f0f5ff',
          borderRadius: 8,
          padding: 12,
          marginBottom: 16,
          marginTop: 12,
        }}
      >
        <Row justify="space-between" style={{ marginBottom: 4 }}>
          <Text type="secondary">Deal</Text>
          <Text strong>{deal.deal_number}</Text>
        </Row>
        <Row justify="space-between" style={{ marginBottom: 4 }}>
          <Text type="secondary">Sản phẩm</Text>
          <Text>{productLabel}</Text>
        </Row>
        <Row justify="space-between" style={{ marginBottom: 4 }}>
          <Text type="secondary">SL theo deal</Text>
          <Text strong>{quantityTons} tấn ({formatCurrency(deal.quantity_kg)} kg)</Text>
        </Row>
        <Row justify="space-between">
          <Text type="secondary">Giá trị Deal</Text>
          <Text strong>{formatCurrency(deal.estimated_value)} VNĐ</Text>
        </Row>
      </div>

      <Form
        form={form}
        layout="vertical"
        initialValues={{
          delivery_date: dayjs(),
          drc_at_delivery: deal.expected_drc,
        }}
        style={{ marginTop: 8 }}
      >
        <Divider style={{ marginTop: 0 }}>Thông tin giao hàng</Divider>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="quantity_kg"
              label="Khối lượng giao (kg)"
              rules={[
                { required: true, message: 'Nhập khối lượng' },
                { type: 'number', min: 1, message: 'Tối thiểu 1 kg' },
              ]}
            >
              <InputNumber<number>
                style={{ width: '100%' }}
                min={1}
                step={100}
                formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                parser={(v) => Number(v!.replace(/,/g, '')) || 0}
                placeholder="VD: 5,000"
                size="large"
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="drc_at_delivery"
              label="DRC tại giao (%)"
              rules={[
                { type: 'number', min: 1, max: 100, message: '1-100%' },
              ]}
            >
              <InputNumber<number>
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

        <Form.Item
          name="delivery_date"
          label="Ngày giao"
          rules={[{ required: true, message: 'Chọn ngày giao' }]}
        >
          <DatePicker
            style={{ width: '100%' }}
            format="DD/MM/YYYY"
            size="large"
            placeholder="Chọn ngày giao"
          />
        </Form.Item>

        <Divider>Thông tin vận chuyển</Divider>

        <Row gutter={16}>
          <Col span={8}>
            <Form.Item name="vehicle_plate" label="Biển số xe">
              <Input placeholder="VD: 43C-123.45" size="large" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="driver_name" label="Tài xế">
              <Input placeholder="Tên tài xế" size="large" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="driver_phone" label="SĐT tài xế">
              <Input placeholder="0905..." size="large" />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item name="notes" label="Ghi chú">
          <TextArea rows={2} placeholder="Ghi chú giao hàng..." maxLength={500} showCount />
        </Form.Item>
      </Form>
    </Modal>
  )
}

export default RecordDeliveryModal
