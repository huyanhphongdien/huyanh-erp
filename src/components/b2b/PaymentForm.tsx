// ============================================================================
// PAYMENT FORM — Form ghi nhận thanh toán quyết toán
// File: src/components/b2b/PaymentForm.tsx
// Phase: E5
// ============================================================================

import { useState } from 'react'
import {
  Form,
  InputNumber,
  DatePicker,
  Select,
  Input,
  Button,
  Space,
  Divider,
  Typography,
  message,
} from 'antd'
import dayjs from 'dayjs'
import { paymentService, PaymentCreateData, PAYMENT_METHOD_LABELS } from '../../services/b2b/paymentService'

const { TextArea } = Input
const { Text } = Typography

interface PaymentFormProps {
  settlementId: string
  maxAmount: number
  createdBy: string
  onSuccess?: () => void
  onCancel?: () => void
}

const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('vi-VN').format(value)
}

const PaymentForm: React.FC<PaymentFormProps> = ({
  settlementId,
  maxAmount,
  createdBy,
  onSuccess,
  onCancel,
}) => {
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<string>('bank_transfer')

  const handleSubmit = async (values: any) => {
    try {
      setLoading(true)

      const paymentData: PaymentCreateData = {
        settlement_id: settlementId,
        amount: values.amount,
        payment_date: values.payment_date?.format('YYYY-MM-DD'),
        payment_method: values.payment_method,
        recipient_name: values.recipient_name,
        bank_account: values.bank_account,
        bank_name: values.bank_name,
        account_holder: values.account_holder,
        company_account: values.company_account,
        company_bank: values.company_bank,
        company_name: values.company_name,
        notes: values.notes,
        created_by: createdBy,
      }

      await paymentService.createPayment(paymentData)
      message.success('Ghi nhận thanh toán thành công')
      form.resetFields()
      onSuccess?.()
    } catch (error: any) {
      message.error(error.message || 'Lỗi khi ghi nhận thanh toán')
    } finally {
      setLoading(false)
    }
  }

  const paymentMethodOptions = Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => ({
    value,
    label,
  }))

  return (
    <Form
      form={form}
      layout="vertical"
      onFinish={handleSubmit}
      initialValues={{
        payment_date: dayjs(),
        payment_method: 'bank_transfer',
        amount: maxAmount > 0 ? maxAmount : undefined,
      }}
    >
      <div style={{ marginBottom: 16, padding: '8px 12px', background: '#f5f5f5', borderRadius: 6 }}>
        <Text type="secondary">Số tiền còn lại: </Text>
        <Text strong style={{ color: '#1B4D3E' }}>{formatCurrency(maxAmount)} ₫</Text>
      </div>

      <Form.Item
        name="amount"
        label="Số tiền thanh toán"
        rules={[
          { required: true, message: 'Vui lòng nhập số tiền' },
          {
            validator: (_, value) => {
              if (value && value > maxAmount) {
                return Promise.reject('Số tiền không được vượt quá số tiền còn lại')
              }
              return Promise.resolve()
            },
          },
        ]}
      >
        <InputNumber
          style={{ width: '100%' }}
          min={1}
          max={maxAmount}
          formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
          parser={v => Number(v?.replace(/,/g, '') || 0)}
          suffix="₫"
          placeholder="Nhập số tiền"
        />
      </Form.Item>

      <Form.Item
        name="payment_date"
        label="Ngày thanh toán"
        rules={[{ required: true, message: 'Vui lòng chọn ngày' }]}
      >
        <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
      </Form.Item>

      <Form.Item
        name="payment_method"
        label="Phương thức"
        rules={[{ required: true }]}
      >
        <Select
          options={paymentMethodOptions}
          onChange={setPaymentMethod}
        />
      </Form.Item>

      {paymentMethod === 'bank_transfer' && (
        <>
          <Divider plain style={{ fontSize: 13 }}>
            Thông tin người nhận
          </Divider>

          <Form.Item name="recipient_name" label="Tên người nhận">
            <Input placeholder="Tên người nhận tiền" />
          </Form.Item>

          <Form.Item name="bank_account" label="Số tài khoản">
            <Input placeholder="Số tài khoản ngân hàng" />
          </Form.Item>

          <Form.Item name="bank_name" label="Ngân hàng">
            <Input placeholder="Tên ngân hàng" />
          </Form.Item>

          <Form.Item name="account_holder" label="Chủ tài khoản">
            <Input placeholder="Tên chủ tài khoản" />
          </Form.Item>

          <Divider plain style={{ fontSize: 13 }}>
            Thông tin công ty chuyển
          </Divider>

          <Form.Item name="company_name" label="Tên công ty">
            <Input placeholder="Tên công ty chuyển tiền" />
          </Form.Item>

          <Form.Item name="company_account" label="TK công ty">
            <Input placeholder="Số tài khoản công ty" />
          </Form.Item>

          <Form.Item name="company_bank" label="NH công ty">
            <Input placeholder="Ngân hàng của công ty" />
          </Form.Item>
        </>
      )}

      <Form.Item name="notes" label="Ghi chú">
        <TextArea rows={2} placeholder="Ghi chú thanh toán" />
      </Form.Item>

      <Form.Item style={{ marginBottom: 0 }}>
        <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
          {onCancel && (
            <Button onClick={onCancel}>Hủy</Button>
          )}
          <Button type="primary" htmlType="submit" loading={loading}>
            Xác nhận thanh toán
          </Button>
        </Space>
      </Form.Item>
    </Form>
  )
}

export default PaymentForm
