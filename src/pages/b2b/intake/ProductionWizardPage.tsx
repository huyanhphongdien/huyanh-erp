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
import { fmtVnd, vndInputProps } from '../../../utils/format'
import { dichLoiHeThong } from '../../../utils/dichLoiHeThong'

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
        message.error(dichLoiHeThong(res.error, 'Không tạo được deal'))
      }
    } catch (e: any) {
      if (e?.errorFields) { message.warning('Còn ô bắt buộc chưa điền — kiểm tra lại'); return }
      message.error(dichLoiHeThong(e, 'Không tạo được deal'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ padding: 24 }}>
      <Title level={3}>🅱️ Chạy đầu ra (DRC sau sản xuất)</Title>
      <Text type="secondary">
        Đại lý hạng Bạc trở lên. QC đo DRC mẫu → BGĐ duyệt → sản xuất → DRC thực tế → quyết toán.
      </Text>

      <Steps current={step} style={{ marginTop: 24 }} items={[
        { title: 'Đại lý + DRC mẫu' },
        { title: 'Cân + Nhập kho' },
        { title: 'Xem lại' },
        { title: 'Chờ SX' },
      ]} />

      <Card style={{ marginTop: 16 }}>
        <Form form={form} layout="vertical" preserve>
          {step === 0 && (
            <>
              <Alert type="info" showIcon style={{ marginBottom: 16 }}
                message="Bước 1: Chọn đại lý + QC đo DRC mẫu + đề xuất đơn giá" />

              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name="partner_id" label="Đại lý (hạng Bạc trở lên)" rules={[{ required: true }]}>
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
                  <Form.Item name="sample_drc" label="DRC mẫu (%) — QC đo mẫu"
                    rules={[{ required: true, type: 'number', min: 0, max: 100 }]}>
                    <InputNumber min={0} max={100} step={0.5} prefix={<ExperimentOutlined />} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="expected_price" label="Đơn giá ₫/kg (đã thoả thuận)" rules={[{ required: true }]}>
                    <InputNumber<number> min={0} step={1000}
                      {...vndInputProps}
                      style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
              </Row>

              <Alert type="warning" message="Lưu ý: DRC thực tế sau sản xuất có thể khác DRC mẫu" />

              <Space style={{ marginTop: 16 }}>
                <Button type="primary" onClick={() => setStep(1)}>Tiếp theo</Button>
              </Space>
            </>
          )}

          {step === 1 && (
            <>
              <Alert type="info" showIcon style={{ marginBottom: 16 }}
                message="Bước 2: Cân xe + chọn chế độ sản xuất (chung / riêng)" />

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
                      { value: 'pooled', label: 'Chạy chung (DRC trung bình) — mặc định' },
                      { value: 'isolated', label: 'Chạy riêng (phí +5–10%) — hạng Vàng trở lên' },
                    ]} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="production_sla_days" label="Hạn sản xuất (ngày)" initialValue={7}>
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
                message="Tiền hàng ƯỚC TÍNH (chưa chốt) — số thật sẽ khác sau sản xuất." />

              <Card size="small">
                <Row gutter={16}>
                  <Col span={6}>KL: <strong>{qty.toLocaleString('vi-VN')} kg</strong></Col>
                  <Col span={6}>DRC mẫu: <strong>{drc}%</strong></Col>
                  <Col span={6}>Giá: <strong>{price.toLocaleString('vi-VN')} ₫/kg</strong></Col>
                  <Col span={6}><Tag color="orange">Ước tính</Tag></Col>
                </Row>
                <Divider />
                <Text strong style={{ fontSize: 20, color: '#1B4D3E' }}>
                  Tiền hàng ước tính: {fmtVnd(estimatedGross)}
                </Text>
                <br />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Chênh ±5% tuỳ DRC thực tế. Tạm ứng tối đa theo hạng đại lý (Vàng 70%).
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
                  <Text>Tiền hàng ước tính: <strong>{fmtVnd(result.estimated_gross_vnd)}</strong></Text>
                  <Text>Tạm ứng tối đa: <strong>{fmtVnd(result.advance_max_allowed_vnd)}</strong></Text>
                  <Text type="secondary">
                    Sau khi BGĐ duyệt (Đã duyệt) → được tạo tạm ứng.
                    Sau khi sản xuất xong → ghi DRC thực tế + giá cuối để quyết toán.
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
