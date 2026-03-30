// ============================================================================
// FINANCE TAB — Tab Tài chính trong Chi tiết Đơn hàng bán
// File: src/components/sales/FinanceTab.tsx
// Module Bán hàng quốc tế — Huy Anh Rubber ERP
// Primary color: #1B4D3E
// ============================================================================

import { useState, useMemo } from 'react'
import {
  Card,
  Form,
  Input,
  InputNumber,
  Select,
  DatePicker,
  Switch,
  Button,
  Divider,
  Tag,
  Alert,
  Row,
  Col,
  Statistic,
  message,
} from 'antd'
import {
  DollarOutlined,
  BankOutlined,
  PercentageOutlined,
  SaveOutlined,
} from '@ant-design/icons'
import { supabase } from '../../lib/supabase'
import { BANK_OPTIONS, PAYMENT_TERMS_LABELS } from '../../services/sales/salesTypes'
import type { SalesOrder } from '../../services/sales/salesTypes'
import dayjs from 'dayjs'

// ============================================================================
// PROPS
// ============================================================================

interface FinanceTabProps {
  order: SalesOrder
  readOnly?: boolean
  onUpdate?: () => void
}

// ============================================================================
// HELPERS
// ============================================================================

const PRIMARY = '#1B4D3E'

// ============================================================================
// COMPONENT
// ============================================================================

export default function FinanceTab({ order, readOnly = false, onUpdate }: FinanceTabProps) {
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)

  // ── L/C expiry warning ──
  const lcWarning = useMemo(() => {
    if (!order.lc_expiry_date) return null
    const expiry = dayjs(order.lc_expiry_date)
    const now = dayjs()
    const daysLeft = expiry.diff(now, 'day')
    if (daysLeft < 7) {
      return daysLeft
    }
    return null
  }, [order.lc_expiry_date])

  // ── Payment status derived ──
  const paymentStatus = useMemo(() => {
    const received = (order as any).payment_received_amount || 0
    const total = order.total_value_usd || 0
    if (received >= total && total > 0) return 'paid'
    if (order.lc_expiry_date && dayjs(order.lc_expiry_date).isBefore(dayjs())) return 'overdue'
    return 'pending'
  }, [order])

  const paymentStatusTag = () => {
    switch (paymentStatus) {
      case 'paid':
        return <Tag color="green">Đã TT</Tag>
      case 'overdue':
        return <Tag color="red">Quá hạn</Tag>
      default:
        return <Tag color="orange">Chờ TT</Tag>
    }
  }

  // ── Commission total ──
  const commissionRate = Form.useWatch('commission_rate', form) || (order as any).commission_rate || 0
  const commissionTotal = commissionRate * (order.quantity_tons || 0)

  // ── Discount amount ──
  const discountAmount = Form.useWatch('discount_amount', form) || (order as any).discount_amount || 0

  // ── Net received ──
  const totalValue = order.total_value_usd || 0
  const netReceived = totalValue - discountAmount - commissionTotal

  // ── Save handler ──
  const handleSave = async () => {
    try {
      const values = await form.validateFields()
      setSaving(true)

      const updateData: Record<string, unknown> = {}

      // Payment fields
      if (values.payment_terms !== undefined) updateData.payment_terms = values.payment_terms
      if (values.lc_number !== undefined) updateData.lc_number = values.lc_number || null
      if (values.lc_bank !== undefined) updateData.lc_bank = values.lc_bank || null
      if (values.lc_expiry_date !== undefined) {
        updateData.lc_expiry_date = values.lc_expiry_date
          ? values.lc_expiry_date.format('YYYY-MM-DD')
          : null
      }
      if (values.receiving_bank !== undefined) updateData.receiving_bank = values.receiving_bank || null
      if (values.payment_date !== undefined) {
        updateData.payment_date = values.payment_date
          ? values.payment_date.format('YYYY-MM-DD')
          : null
      }
      if (values.payment_received_amount !== undefined) {
        updateData.payment_received_amount = values.payment_received_amount || 0
      }

      // Discount fields
      if (values.discount_amount !== undefined) updateData.discount_amount = values.discount_amount || 0
      if (values.discount_date !== undefined) {
        updateData.discount_date = values.discount_date
          ? values.discount_date.format('YYYY-MM-DD')
          : null
      }
      if (values.btc_submission_date !== undefined) {
        updateData.btc_submission_date = values.btc_submission_date
          ? values.btc_submission_date.format('YYYY-MM-DD')
          : null
      }

      // Commission fields
      if (values.commission_rate !== undefined) updateData.commission_rate = values.commission_rate || 0
      if (values.commission_total !== undefined) updateData.commission_total = commissionTotal
      if (values.broker !== undefined) updateData.broker = values.broker || null
      if (values.commission_paid !== undefined) updateData.commission_paid = values.commission_paid || false
      if (values.commission_paid_date !== undefined) {
        updateData.commission_paid_date = values.commission_paid_date
          ? values.commission_paid_date.format('YYYY-MM-DD')
          : null
      }

      // Contract price
      if (values.contract_price !== undefined) updateData.contract_price = values.contract_price || null

      const { error } = await supabase
        .from('sales_orders')
        .update(updateData)
        .eq('id', order.id)

      if (error) throw error

      message.success('Đã cập nhật thông tin tài chính')
      onUpdate?.()
    } catch (err) {
      console.error('Save finance error:', err)
      message.error('Không thể lưu thông tin tài chính')
    } finally {
      setSaving(false)
    }
  }

  // ============================================================================
  // INITIAL VALUES
  // ============================================================================

  const ext = order as any
  const initialValues = {
    payment_terms: order.payment_terms || undefined,
    lc_number: order.lc_number || '',
    lc_bank: order.lc_bank || '',
    lc_expiry_date: order.lc_expiry_date ? dayjs(order.lc_expiry_date) : null,
    receiving_bank: ext.receiving_bank || undefined,
    payment_date: ext.payment_date ? dayjs(ext.payment_date) : null,
    payment_received_amount: ext.payment_received_amount || 0,
    discount_amount: ext.discount_amount || 0,
    discount_date: ext.discount_date ? dayjs(ext.discount_date) : null,
    btc_submission_date: ext.btc_submission_date ? dayjs(ext.btc_submission_date) : null,
    commission_rate: ext.commission_rate || 0,
    broker: ext.broker || '',
    commission_paid: ext.commission_paid || false,
    commission_paid_date: ext.commission_paid_date ? dayjs(ext.commission_paid_date) : null,
    contract_price: ext.contract_price || null,
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <Form
      form={form}
      layout="vertical"
      initialValues={initialValues}
      disabled={readOnly}
    >
      {/* L/C expiry warning */}
      {lcWarning !== null && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message={
            lcWarning >= 0
              ? `L/C sắp hết hạn trong ${lcWarning} ngày!`
              : `L/C đã hết hạn ${Math.abs(lcWarning)} ngày trước!`
          }
        />
      )}

      <Row gutter={24}>
        {/* ═══ SECTION 1: Thanh toán ═══ */}
        <Col xs={24} lg={12}>
          <Card
            title={
              <span>
                <BankOutlined style={{ marginRight: 8, color: PRIMARY }} />
                Thanh toán
              </span>
            }
            size="small"
            style={{ marginBottom: 16 }}
          >
            <Form.Item label="Phương thức thanh toán" name="payment_terms">
              <Select
                allowClear
                placeholder="Chọn điều khoản..."
                options={Object.entries(PAYMENT_TERMS_LABELS).map(([v, l]) => ({
                  value: v,
                  label: l,
                }))}
              />
            </Form.Item>

            <Row gutter={16}>
              <Col xs={24} sm={12}>
                <Form.Item label="Số L/C" name="lc_number">
                  <Input placeholder="L/C number" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item label="Ngân hàng phát hành L/C" name="lc_bank">
                  <Input placeholder="Issuing bank" />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={16}>
              <Col xs={24} sm={12}>
                <Form.Item label="Hạn L/C" name="lc_expiry_date">
                  <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item label="Ngân hàng nhận" name="receiving_bank">
                  <Select
                    allowClear
                    placeholder="Chọn ngân hàng..."
                    options={BANK_OPTIONS.map((b) => ({
                      value: b.value,
                      label: b.label,
                    }))}
                  />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={16}>
              <Col xs={24} sm={12}>
                <Form.Item label="Ngày thanh toán" name="payment_date">
                  <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item label="Số tiền đã nhận (USD)" name="payment_received_amount">
                  <InputNumber
                    min={0}
                    step={100}
                    style={{ width: '100%' }}
                    formatter={(v) => `$ ${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                    parser={(v) => v?.replace(/\$\s?|(,*)/g, '') as any}
                  />
                </Form.Item>
              </Col>
            </Row>

            <div style={{ marginTop: 8 }}>
              <span style={{ marginRight: 8 }}>Trạng thái thanh toán:</span>
              {paymentStatusTag()}
            </div>
          </Card>

          {/* ═══ SECTION 2: Chiết khấu ═══ */}
          <Card
            title={
              <span>
                <PercentageOutlined style={{ marginRight: 8, color: PRIMARY }} />
                Chiết khấu
              </span>
            }
            size="small"
            style={{ marginBottom: 16 }}
          >
            <Row gutter={16}>
              <Col xs={24} sm={8}>
                <Form.Item label="Số tiền chiết khấu (USD)" name="discount_amount">
                  <InputNumber
                    min={0}
                    step={100}
                    style={{ width: '100%' }}
                    formatter={(v) => `$ ${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                    parser={(v) => v?.replace(/\$\s?|(,*)/g, '') as any}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} sm={8}>
                <Form.Item label="Ngày chiết khấu" name="discount_date">
                  <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={8}>
                <Form.Item label="Ngày trình BTC" name="btc_submission_date">
                  <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
                </Form.Item>
              </Col>
            </Row>
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          {/* ═══ SECTION 3: Hoa hồng (Commission) ═══ */}
          <Card
            title={
              <span>
                <DollarOutlined style={{ marginRight: 8, color: PRIMARY }} />
                Hoa hồng (Commission)
              </span>
            }
            size="small"
            style={{ marginBottom: 16 }}
          >
            <Row gutter={16}>
              <Col xs={24} sm={12}>
                <Form.Item label="Mức hoa hồng (USD/MT)" name="commission_rate">
                  <InputNumber
                    min={0}
                    step={1}
                    style={{ width: '100%' }}
                    placeholder="0"
                  />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Statistic
                  title="Tổng hoa hồng"
                  value={commissionTotal}
                  precision={2}
                  prefix="$"
                  valueStyle={{ color: PRIMARY, fontSize: 18 }}
                  style={{ marginTop: 4 }}
                />
              </Col>
            </Row>

            <Form.Item label="Broker" name="broker">
              <Input placeholder="Tên broker / trung gian" />
            </Form.Item>

            <Row gutter={16} align="middle">
              <Col xs={12} sm={8}>
                <Form.Item
                  label="Đã chi"
                  name="commission_paid"
                  valuePropName="checked"
                >
                  <Switch checkedChildren="Đã chi" unCheckedChildren="Chưa chi" />
                </Form.Item>
              </Col>
              <Col xs={12} sm={8}>
                <Form.Item label="Ngày chi" name="commission_paid_date">
                  <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
                </Form.Item>
              </Col>
            </Row>
          </Card>

          {/* ═══ SECTION 4: Giá (read-only comparison) ═══ */}
          <Card
            title={
              <span>
                <DollarOutlined style={{ marginRight: 8, color: PRIMARY }} />
                Giá
              </span>
            }
            size="small"
            style={{ marginBottom: 16 }}
          >
            <Row gutter={16}>
              <Col span={8}>
                <Statistic
                  title="Giá chốt"
                  value={order.unit_price || 0}
                  precision={2}
                  prefix="$"
                  suffix="/MT"
                  valueStyle={{ fontSize: 16 }}
                />
              </Col>
              <Col span={8}>
                <Form.Item label="Giá hợp đồng" name="contract_price" style={{ marginBottom: 0 }}>
                  <InputNumber
                    min={0}
                    step={10}
                    style={{ width: '100%' }}
                    placeholder="USD/MT"
                    disabled={readOnly}
                  />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Statistic
                  title="Chênh lệch"
                  value={
                    (ext.contract_price || 0) - (order.unit_price || 0)
                  }
                  precision={2}
                  prefix="$"
                  suffix="/MT"
                  valueStyle={{
                    fontSize: 16,
                    color:
                      (ext.contract_price || 0) - (order.unit_price || 0) >= 0
                        ? '#52c41a'
                        : '#ff4d4f',
                  }}
                />
              </Col>
            </Row>
          </Card>

          {/* ═══ SECTION 5: Tổng kết ═══ */}
          <Card
            title={
              <span>
                <DollarOutlined style={{ marginRight: 8, color: PRIMARY }} />
                Tổng kết
              </span>
            }
            size="small"
            style={{ marginBottom: 16 }}
          >
            <Row gutter={[16, 8]}>
              <Col span={12}>
                <Statistic
                  title="Doanh thu"
                  value={totalValue}
                  precision={2}
                  prefix="$"
                  valueStyle={{ color: PRIMARY, fontSize: 18 }}
                />
              </Col>
              <Col span={12}>
                <Statistic
                  title="Chiết khấu"
                  value={discountAmount}
                  precision={2}
                  prefix="- $"
                  valueStyle={{ color: '#ff4d4f', fontSize: 16 }}
                />
              </Col>
              <Col span={12}>
                <Statistic
                  title="Hoa hồng"
                  value={commissionTotal}
                  precision={2}
                  prefix="- $"
                  valueStyle={{ color: '#ff4d4f', fontSize: 16 }}
                />
              </Col>
              <Col span={12}>
                <Divider style={{ margin: '4px 0' }} />
                <Statistic
                  title="Thực nhận"
                  value={netReceived}
                  precision={2}
                  prefix="$"
                  valueStyle={{
                    color: PRIMARY,
                    fontSize: 22,
                    fontWeight: 700,
                  }}
                />
              </Col>
            </Row>
          </Card>
        </Col>
      </Row>

      {/* Save button */}
      {!readOnly && (
        <div style={{ textAlign: 'right', marginTop: 16 }}>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            size="large"
            loading={saving}
            onClick={handleSave}
            style={{ background: PRIMARY, borderColor: PRIMARY }}
          >
            Lưu thông tin tài chính
          </Button>
        </div>
      )}
    </Form>
  )
}
