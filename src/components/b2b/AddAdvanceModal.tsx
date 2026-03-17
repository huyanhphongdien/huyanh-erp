// ============================================================================
// ADD ADVANCE MODAL — Modal ứng thêm tiền cho Deal từ Chat
// File: src/components/b2b/AddAdvanceModal.tsx
//
// Mở khi user click "Ứng thêm" trên DealCard (chỉ factory)
// Tạo advance + ghi ledger + update deal totals + gửi message trong chat
// ============================================================================

import { useState } from 'react'
import {
  Modal,
  Form,
  InputNumber,
  Input,
  Select,
  Row,
  Col,
  Typography,
  Space,
  Tag,
  Divider,
} from 'antd'
import {
  DollarOutlined,
} from '@ant-design/icons'
import type { DealCardMetadata } from '../../types/b2b.types'
import { PRODUCT_TYPE_LABELS } from '../../services/b2b/chatMessageService'

const { Text } = Typography
const { TextArea } = Input

// ============================================
// TYPES
// ============================================

export interface AddAdvanceFormData {
  amount: number
  payment_method: 'cash' | 'bank_transfer'
  receiver_name: string
  receiver_phone?: string
  notes?: string
}

interface AddAdvanceModalProps {
  open: boolean
  onCancel: () => void
  onConfirm: (data: AddAdvanceFormData) => Promise<void>
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

const AddAdvanceModal = ({
  open,
  onCancel,
  onConfirm,
  loading = false,
  deal,
  partnerName,
}: AddAdvanceModalProps) => {
  const [form] = Form.useForm()
  const [liveAmount, setLiveAmount] = useState(0)

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      await onConfirm({
        amount: values.amount,
        payment_method: values.payment_method,
        receiver_name: values.receiver_name,
        receiver_phone: values.receiver_phone,
        notes: values.notes,
      })
      form.resetFields()
      setLiveAmount(0)
    } catch {
      // Validation error
    }
  }

  if (!deal) return null

  const productLabel = PRODUCT_TYPE_LABELS[deal.product_type] || deal.product_type
  const newBalanceDue = deal.balance_due - liveAmount

  return (
    <Modal
      title={
        <Space>
          <DollarOutlined style={{ color: '#faad14', fontSize: 20 }} />
          <span>Ứng thêm tiền</span>
          {partnerName && <Tag color="blue">{partnerName}</Tag>}
        </Space>
      }
      open={open}
      onOk={handleSubmit}
      onCancel={onCancel}
      confirmLoading={loading}
      okText="Xác nhận ứng"
      cancelText="Hủy"
      width={480}
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
          <Text type="secondary">Giá trị Deal</Text>
          <Text strong>{formatCurrency(deal.estimated_value)} VNĐ</Text>
        </Row>
        <Row justify="space-between" style={{ marginBottom: 4 }}>
          <Text type="secondary">Đã ứng</Text>
          <Text style={{ color: '#52c41a' }}>{formatCurrency(deal.total_advanced)} VNĐ</Text>
        </Row>
        <Divider style={{ margin: '8px 0' }} />
        <Row justify="space-between">
          <Text strong>Còn nợ</Text>
          <Text strong style={{ color: '#1890ff', fontSize: 15 }}>
            {formatCurrency(deal.balance_due)} VNĐ
          </Text>
        </Row>
      </div>

      <Form
        form={form}
        layout="vertical"
        initialValues={{
          payment_method: 'cash',
        }}
        onValuesChange={(changed) => {
          if ('amount' in changed) {
            setLiveAmount(changed.amount || 0)
          }
        }}
      >
        <Form.Item
          name="amount"
          label="Số tiền ứng (VNĐ)"
          rules={[
            { required: true, message: 'Nhập số tiền ứng' },
            { type: 'number', min: 1, message: 'Số tiền phải > 0' },
            {
              type: 'number',
              max: deal.balance_due > 0 ? deal.balance_due : undefined,
              message: 'Không vượt quá số tiền còn nợ',
            },
          ]}
        >
          <InputNumber<number>
            style={{ width: '100%' }}
            min={1}
            step={1000000}
            formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
            parser={(v) => Number(v!.replace(/,/g, '')) || 0}
            placeholder="VD: 10,000,000"
            size="large"
          />
        </Form.Item>

        <Form.Item
          name="payment_method"
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
              name="receiver_name"
              label="Người nhận"
              rules={[{ required: true, message: 'Nhập người nhận' }]}
            >
              <Input placeholder="Tên người nhận" size="large" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="receiver_phone" label="SĐT">
              <Input placeholder="0905 xxx xxx" size="large" />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item name="notes" label="Ghi chú">
          <TextArea rows={2} placeholder="VD: Ứng thêm tại vườn" maxLength={300} showCount />
        </Form.Item>
      </Form>

      {/* Tóm tắt sau khi ứng */}
      {liveAmount > 0 && (
        <div
          style={{
            padding: 12,
            background: '#f6ffed',
            border: '1px solid #b7eb8f',
            borderRadius: 8,
          }}
        >
          <Row justify="space-between" style={{ marginBottom: 4 }}>
            <Text>Ứng thêm lần này:</Text>
            <Text strong style={{ color: '#cf1322' }}>
              + {formatCurrency(liveAmount)} VNĐ
            </Text>
          </Row>
          <Row justify="space-between" style={{ marginBottom: 4 }}>
            <Text>Tổng đã ứng:</Text>
            <Text strong style={{ color: '#52c41a' }}>
              {formatCurrency(deal.total_advanced + liveAmount)} VNĐ
            </Text>
          </Row>
          <Divider style={{ margin: '8px 0' }} />
          <Row justify="space-between">
            <Text strong>Còn phải trả:</Text>
            <Text strong style={{ color: newBalanceDue > 0 ? '#1890ff' : '#52c41a', fontSize: 15 }}>
              {formatCurrency(Math.max(0, newBalanceDue))} VNĐ
            </Text>
          </Row>
        </div>
      )}
    </Modal>
  )
}

export default AddAdvanceModal
