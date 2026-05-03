// ============================================================================
// Outright Wizard Page — Flow 🅰️ Mua đứt
// File: src/pages/b2b/intake/OutrightWizardPage.tsx
// Phase 31 of B2B Intake v4
// ============================================================================
// 4 bước: partner+DRC cáp → weighbridge → settlement preview → chi tiền
// ============================================================================

import { useState } from 'react'
import { Card, Steps, Form, Select, InputNumber, Input, Button, Space, Typography,
  Alert, Row, Col, Result, message } from 'antd'
import { CheckCircleOutlined, DollarOutlined, PrinterOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { executeOutrightIntake } from '../../../services/b2b/intakeOutrightService'
import { supabase } from '../../../lib/supabase'
import { useAuthStore } from '../../../stores/authStore'

const { Title, Text } = Typography

export default function OutrightWizardPage() {
  const navigate = useNavigate()
  const [form] = Form.useForm()
  const user = useAuthStore(s => s.user)
  const [step, setStep] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<any>(null)

  const handleFinish = async () => {
    try {
      const values = await form.validateFields()
      setSubmitting(true)

      const res = await executeOutrightIntake({
        partner_id: values.partner_id,
        buyer_user_id: user?.id || '',
        product_name: values.product_name,
        rubber_type: values.rubber_type,
        quantity_kg: values.quantity_kg,
        drc_percent: values.drc_percent,
        unit_price: values.unit_price,
        facility_id: values.facility_id,
        warehouse_id: values.warehouse_id,
        nationality: values.nationality || 'VN',
        vehicle_plate: values.vehicle_plate,
        driver_name: values.driver_name,
        created_by: user?.id,
        notes: values.notes,
      })

      if (res.success) {
        setResult(res)
        setStep(3)
        message.success(`Đã tạo deal ${res.deal_number} + chi tiền ${res.total_amount_vnd.toLocaleString('vi-VN')} VNĐ`)
      } else {
        message.error(res.error || 'Lỗi không xác định')
      }
    } catch (e: any) {
      message.error(e.message || 'Validate failed')
    } finally {
      setSubmitting(false)
    }
  }

  const previewAmount = Form.useWatch('quantity_kg', form) * Form.useWatch('unit_price', form) || 0

  return (
    <div style={{ padding: 24, maxWidth: 1000, margin: '0 auto' }}>
      <Title level={3}>🅰️ Mua đứt (Outright)</Title>
      <Text type="secondary">
        Bypass QC sample + BGĐ duyệt. Chi tiền ngay tại cân. DRC cáp kinh nghiệm.
      </Text>

      <Steps
        current={step}
        style={{ marginTop: 24 }}
        items={[
          { title: 'Đại lý + DRC cáp' },
          { title: 'Cân xe' },
          { title: 'Xem lại' },
          { title: 'Hoàn tất' },
        ]}
      />

      <Card style={{ marginTop: 16 }}>
        <Form form={form} layout="vertical" preserve>
          {step === 0 && (
            <>
              <Alert type="info" showIcon style={{ marginBottom: 16 }}
                message="Bước 1: Chọn đại lý, nhập DRC cáp kinh nghiệm + đơn giá" />

              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name="partner_id" label="Đại lý" rules={[{ required: true }]}>
                    <Select placeholder="Chọn đại lý" showSearch />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="nationality" label="Quốc tịch" initialValue="VN">
                    <Select options={[
                      { value: 'VN', label: 'Việt Nam' },
                      { value: 'LAO', label: 'Lào (prefix batch = LAO-)' },
                    ]} />
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name="product_name" label="Loại sản phẩm" rules={[{ required: true }]}>
                    <Input placeholder="Mủ tạp, Mủ nước..." />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="rubber_type" label="Mã loại" rules={[{ required: true }]} initialValue="mu_tap">
                    <Select options={[
                      { value: 'mu_tap', label: 'mu_tap' },
                      { value: 'mu_nuoc', label: 'mu_nuoc' },
                      { value: 'mu_cao_su', label: 'mu_cao_su' },
                    ]} />
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item name="drc_percent" label="DRC cáp %"
                    rules={[{ required: true }, { type: 'number', min: 25, max: 70, message: 'DRC nên 25-70%' }]}>
                    <InputNumber min={0} max={100} step={0.5} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="unit_price" label="Đơn giá VNĐ/kg" rules={[{ required: true }]}>
                    <InputNumber<number> min={0} step={1000}
                      formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                      parser={v => Number(String(v).replace(/\D/g, '')) || 0}
                      style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item label="Preview">
                    <Text strong style={{ fontSize: 16, color: '#1B4D3E' }}>
                      {previewAmount.toLocaleString('vi-VN')} VNĐ (×qty)
                    </Text>
                  </Form.Item>
                </Col>
              </Row>

              <Space>
                <Button type="primary" onClick={() => setStep(1)}>Tiếp theo</Button>
              </Space>
            </>
          )}

          {step === 1 && (
            <>
              <Alert type="info" showIcon style={{ marginBottom: 16 }}
                message="Bước 2: Cân xe tại weighbridge" />

              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item name="quantity_kg" label="Net cân (kg)" rules={[{ required: true }]}>
                    <InputNumber min={0} step={100} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="vehicle_plate" label="Biển số xe" rules={[{ required: true }]}>
                    <Input placeholder="51A-12345" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="driver_name" label="Tài xế">
                    <Input placeholder="Tên" />
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name="facility_id" label="Nhà máy" rules={[{ required: true }]}>
                    <Select placeholder="Chọn nhà máy" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="warehouse_id" label="Kho NVL" rules={[{ required: true }]}>
                    <Select placeholder="Chọn kho" />
                  </Form.Item>
                </Col>
              </Row>

              <Space>
                <Button onClick={() => setStep(0)}>Quay lại</Button>
                <Button type="primary" onClick={() => setStep(2)}>Tiếp theo</Button>
              </Space>
            </>
          )}

          {step === 2 && (
            <>
              <Alert type="warning" showIcon style={{ marginBottom: 16 }}
                message="Bước 3: Xem lại — click 'Chi tiền' sẽ tạo deal + settled ngay" />

              <Card size="small" title="Thông tin deal">
                <Row>
                  <Col span={8}>qty: {form.getFieldValue('quantity_kg')} kg</Col>
                  <Col span={8}>DRC: {form.getFieldValue('drc_percent')}%</Col>
                  <Col span={8}>Giá: {form.getFieldValue('unit_price')?.toLocaleString()} VNĐ/kg</Col>
                </Row>
                <Row style={{ marginTop: 8 }}>
                  <Col span={24}>
                    <Text strong style={{ fontSize: 20, color: '#1B4D3E' }}>
                      Tổng chi: {previewAmount.toLocaleString('vi-VN')} VNĐ
                    </Text>
                  </Col>
                </Row>
              </Card>

              <Form.Item name="notes" label="Ghi chú" style={{ marginTop: 16 }}>
                <Input.TextArea rows={2} />
              </Form.Item>

              <Space>
                <Button onClick={() => setStep(1)}>Quay lại</Button>
                <Button type="primary" icon={<DollarOutlined />} loading={submitting} onClick={handleFinish}>
                  Chi tiền + In phiếu
                </Button>
              </Space>
            </>
          )}

          {step === 3 && result && (
            <Result
              status="success"
              icon={<CheckCircleOutlined />}
              title={`Hoàn tất ${result.deal_number}`}
              subTitle={
                <Space direction="vertical">
                  <Text>Đã chi: <strong>{result.total_amount_vnd.toLocaleString('vi-VN')} VNĐ</strong></Text>
                  <Text>Ticket: <strong>{result.ticket_code}</strong></Text>
                </Space>
              }
              extra={[
                <Button key="print" icon={<PrinterOutlined />} onClick={() => window.print()}>
                  In phiếu
                </Button>,
                <Button key="new" type="primary" onClick={() => {
                  form.resetFields(); setStep(0); setResult(null);
                }}>
                  Tạo mới
                </Button>,
                <Button key="list" onClick={() => navigate('/b2b/deals')}>
                  Xem danh sách deal
                </Button>,
              ]}
            />
          )}
        </Form>
      </Card>
    </div>
  )
}
