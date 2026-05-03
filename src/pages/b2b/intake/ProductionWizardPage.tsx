// ============================================================================
// Production Wizard Page — Flow 🅱️ DRC-after-production
// Phase 33 of B2B Intake v4
// ============================================================================
// 4 bước (simplified từ 8 step roadmap, UX-first):
// 1. Partner + QC sample DRC
// 2. Cân xe + nhập kho
// 3. Chờ BGĐ duyệt (status=accepted)
// 4. Sau SX xong: onProductionFinish → actual_drc → quyết toán
// ============================================================================

import { useState } from 'react'
import { Card, Steps, Form, Select, InputNumber, Input, Button, Space, Typography,
  Alert, Row, Col, Result, message, Divider, Tag } from 'antd'
import { CheckCircleOutlined, ExperimentOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { executeProductionIntake } from '../../../services/b2b/intakeProductionService'
import { useAuthStore } from '../../../stores/authStore'

const { Title, Text } = Typography

export default function ProductionWizardPage() {
  const navigate = useNavigate()
  const [form] = Form.useForm()
  const user = useAuthStore(s => s.user)
  const [step, setStep] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<any>(null)

  const qty = Form.useWatch('quantity_kg', form) || 0
  const drc = Form.useWatch('sample_drc', form) || 0
  const price = Form.useWatch('expected_price', form) || 0
  const estimatedGross = Math.round(qty * (drc / 100) * price)

  const handleFinish = async () => {
    try {
      const values = await form.validateFields()
      setSubmitting(true)
      const res = await executeProductionIntake({
        partner_id: values.partner_id,
        qc_user_id: user?.id || '',
        product_name: values.product_name,
        rubber_type: values.rubber_type,
        quantity_kg: values.quantity_kg,
        sample_drc: values.sample_drc,
        expected_price: values.expected_price,
        facility_id: values.facility_id,
        warehouse_id: values.warehouse_id,
        vehicle_plate: values.vehicle_plate,
        driver_name: values.driver_name,
        production_mode: values.production_mode || 'pooled',
        production_sla_days: values.production_sla_days || 7,
        notes: values.notes,
        created_by: user?.id,
      })

      if (res.success) {
        setResult(res)
        setStep(3)
        message.success(`Deal ${res.deal_number} tạo xong. Chờ BGĐ duyệt + sản xuất.`)
      } else {
        message.error(res.error || 'Lỗi')
      }
    } catch (e: any) {
      message.error(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 1000, margin: '0 auto' }}>
      <Title level={3}>🅱️ DRC-after-production (Chạy đầu ra)</Title>
      <Text type="secondary">
        Đại lý tier ≥ silver. QC sample DRC → BGĐ duyệt → SX → actual DRC → quyết toán.
      </Text>

      <Steps current={step} style={{ marginTop: 24 }} items={[
        { title: 'Đại lý + QC sample' },
        { title: 'Cân + Nhập kho' },
        { title: 'Xem lại' },
        { title: 'Chờ SX' },
      ]} />

      <Card style={{ marginTop: 16 }}>
        <Form form={form} layout="vertical" preserve>
          {step === 0 && (
            <>
              <Alert type="info" showIcon style={{ marginBottom: 16 }}
                message="Bước 1: Chọn đại lý + QC đo sample_drc + đề xuất đơn giá" />

              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name="partner_id" label="Đại lý (tier ≥ silver)" rules={[{ required: true }]}>
                    <Select showSearch placeholder="Chọn đại lý" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="product_name" label="Sản phẩm" rules={[{ required: true }]}>
                    <Input placeholder="Mủ tạp..." />
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item name="rubber_type" label="Loại" rules={[{ required: true }]} initialValue="mu_tap">
                    <Select options={[
                      { value: 'mu_tap', label: 'Mủ tạp' },
                      { value: 'mu_nuoc', label: 'Mủ nước' },
                      { value: 'mu_cao_su', label: 'Mủ cao su' },
                    ]} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="sample_drc" label="Sample DRC (%) — QC đo mẫu"
                    rules={[{ required: true, type: 'number', min: 0, max: 100 }]}>
                    <InputNumber min={0} max={100} step={0.5} prefix={<ExperimentOutlined />} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="expected_price" label="Đơn giá VNĐ/kg (đã thỏa thuận)" rules={[{ required: true }]}>
                    <InputNumber<number> min={0} step={1000}
                      formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                      parser={v => Number(String(v).replace(/\D/g, '')) || 0}
                      style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
              </Row>

              <Alert type="warning" message="Lưu ý: actual DRC sau SX có thể khác sample — variance > 3% tự raise dispute" />

              <Space style={{ marginTop: 16 }}>
                <Button type="primary" onClick={() => setStep(1)}>Tiếp theo</Button>
              </Space>
            </>
          )}

          {step === 1 && (
            <>
              <Alert type="info" showIcon style={{ marginBottom: 16 }}
                message="Bước 2: Cân xe + chọn mode SX (pooled/isolated)" />

              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item name="quantity_kg" label="Net cân (kg)" rules={[{ required: true }]}>
                    <InputNumber min={0} step={100} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="vehicle_plate" label="Biển số" rules={[{ required: true }]}>
                    <Input placeholder="51A-12345" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="driver_name" label="Tài xế">
                    <Input />
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name="facility_id" label="Nhà máy" rules={[{ required: true }]}>
                    <Select />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="warehouse_id" label="Kho NVL" rules={[{ required: true }]}>
                    <Select />
                  </Form.Item>
                </Col>
              </Row>

              <Divider>Cấu hình sản xuất</Divider>

              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name="production_mode" label="Chế độ SX" initialValue="pooled">
                    <Select options={[
                      { value: 'pooled', label: 'Pooled (chung pool, DRC trung bình) — default' },
                      { value: 'isolated', label: 'Isolated (riêng, phí +5-10%) — tier gold+' },
                    ]} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="production_sla_days" label="SLA ngày" initialValue={7}>
                    <InputNumber min={1} max={30} style={{ width: '100%' }} />
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
                message="Ước tính gross (chưa final). Actual sẽ khác sau SX." />

              <Card size="small">
                <Row gutter={16}>
                  <Col span={6}>qty: <strong>{qty.toLocaleString('vi-VN')} kg</strong></Col>
                  <Col span={6}>sample DRC: <strong>{drc}%</strong></Col>
                  <Col span={6}>giá: <strong>{price.toLocaleString('vi-VN')} VNĐ/kg</strong></Col>
                  <Col span={6}><Tag color="orange">Estimated</Tag></Col>
                </Row>
                <Divider />
                <Text strong style={{ fontSize: 20, color: '#1B4D3E' }}>
                  Gross ước tính: {estimatedGross.toLocaleString('vi-VN')} VNĐ
                </Text>
                <br />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Range ±5% tùy actual DRC. Tạm ứng tối đa theo tier (gold 70%).
                </Text>
              </Card>

              <Form.Item name="notes" label="Ghi chú" style={{ marginTop: 16 }}>
                <Input.TextArea rows={2} />
              </Form.Item>

              <Space>
                <Button onClick={() => setStep(1)}>Quay lại</Button>
                <Button type="primary" loading={submitting} onClick={handleFinish}>
                  Tạo deal + chờ BGĐ duyệt
                </Button>
              </Space>
            </>
          )}

          {step === 3 && result && (
            <Result status="info" title={`Deal ${result.deal_number} đang chờ duyệt`}
              subTitle={
                <Space direction="vertical">
                  <Text>Gross ước tính: <strong>{result.estimated_gross_vnd.toLocaleString('vi-VN')} VNĐ</strong></Text>
                  <Text>Advance max: <strong>{result.advance_max_allowed_vnd.toLocaleString('vi-VN')} VNĐ</strong></Text>
                  <Text type="secondary">
                    Sau khi BGĐ duyệt → status=accepted → có thể tạo advance.
                    Sau khi SX xong → onProductionFinish → actual DRC + dispute auto nếu lệch &gt; 3%.
                  </Text>
                </Space>
              }
              extra={[
                <Button key="list" type="primary" onClick={() => navigate('/b2b/deals')}>
                  Xem danh sách deal
                </Button>,
                <Button key="new" onClick={() => { form.resetFields(); setStep(0); setResult(null); }}>
                  Tạo mới
                </Button>,
              ]} />
          )}
        </Form>
      </Card>
    </div>
  )
}
