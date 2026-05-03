// ============================================================================
// Walkin Wizard Page — Flow 🅲 Farmer walk-in
// Phase 32 of B2B Intake v4
// ============================================================================
// 4 bước: quick-create hộ (CCCD) → QC DRC tại cân → weighbridge → chi tiền
// ============================================================================

import { useState, useEffect } from 'react'
import { Card, Steps, Form, Select, InputNumber, Input, Button, Space, Typography,
  Alert, Row, Col, Result, message, Tag, Divider } from 'antd'
import { CheckCircleOutlined, DollarOutlined, PrinterOutlined, IdcardOutlined,
  SearchOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { executeWalkinIntake } from '../../../services/b2b/intakeWalkinService'
import { findHouseholdByCCCD, validateVietnameseCCCD } from '../../../services/b2b/partnerQuickCreateService'
import { getCurrentPrice } from '../../../services/b2b/dailyPriceListService'
import { useAuthStore } from '../../../stores/authStore'

const { Title, Text } = Typography

export default function WalkinWizardPage() {
  const navigate = useNavigate()
  const [form] = Form.useForm()
  const user = useAuthStore(s => s.user)
  const [step, setStep] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [existingPartner, setExistingPartner] = useState<any>(null)
  const [dailyPrice, setDailyPrice] = useState<number | null>(null)
  const [cccdValid, setCccdValid] = useState(false)

  const cccd = Form.useWatch('national_id', form)
  const rubberType = Form.useWatch('rubber_type', form)
  const drc = Form.useWatch('drc_measured', form)
  const netKg = Form.useWatch('net_weight_kg', form)
  const priceOverride = Form.useWatch('unit_price_override', form)

  // Auto lookup partner khi CCCD đủ 12 số
  useEffect(() => {
    const cccdClean = String(cccd || '').trim()
    if (cccdClean.length === 12) {
      const check = validateVietnameseCCCD(cccdClean)
      setCccdValid(check.valid)
      if (check.valid) {
        findHouseholdByCCCD(cccdClean).then(p => setExistingPartner(p))
      } else {
        setExistingPartner(null)
      }
    } else {
      setCccdValid(false)
      setExistingPartner(null)
    }
  }, [cccd])

  // Auto lookup daily price khi chọn rubber_type
  useEffect(() => {
    if (rubberType) {
      getCurrentPrice(rubberType).then(p => {
        setDailyPrice(p?.base_price_per_kg || null)
        if (p) {
          form.setFieldValue('unit_price_override', p.base_price_per_kg)
        }
      })
    }
  }, [rubberType])

  const priceUse = priceOverride || dailyPrice || 0
  const totalAmount = Math.round((netKg || 0) * ((drc || 0) / 100) * priceUse)

  const handleFinish = async () => {
    try {
      const values = await form.validateFields()
      setSubmitting(true)

      const res = await executeWalkinIntake({
        partner_id: existingPartner?.id,
        household: !existingPartner ? {
          national_id: values.national_id,
          name: values.name,
          phone: values.phone,
          address: values.address,
          nationality: 'VN',
        } : undefined,
        qc_user_id: user?.id || '',
        drc_measured: values.drc_measured,
        product_name: values.product_name,
        rubber_type: values.rubber_type,
        net_weight_kg: values.net_weight_kg,
        vehicle_plate: values.vehicle_plate,
        driver_name: values.driver_name,
        unit_price_override: values.unit_price_override,
        facility_id: values.facility_id,
        warehouse_id: values.warehouse_id,
        created_by: user?.id,
        notes: values.notes,
      })

      if (res.success) {
        setResult(res)
        setStep(3)
        message.success(`Đã tạo deal ${res.deal_number} + chi ${res.total_amount_vnd.toLocaleString('vi-VN')} VNĐ`)
      } else {
        message.error(res.error || 'Lỗi không xác định')
      }
    } catch (e: any) {
      message.error(e.message || 'Validate failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 1000, margin: '0 auto' }}>
      <Title level={3}>🅲 Walk-in Hộ Nông Dân</Title>
      <Text type="secondary">
        Hộ nông dân VN chưa đăng ký. QC đo DRC tại cân. Chi tiền mặt ngay.
      </Text>

      <Steps current={step} style={{ marginTop: 24 }} items={[
        { title: 'Hộ (CCCD)' },
        { title: 'QC + Cân' },
        { title: 'Xem lại' },
        { title: 'Hoàn tất' },
      ]} />

      <Card style={{ marginTop: 16 }}>
        <Form form={form} layout="vertical" preserve>
          {step === 0 && (
            <>
              <Alert type="info" showIcon style={{ marginBottom: 16 }}
                message="Nhập CCCD — tự tra hộ đã đăng ký. Nếu chưa có, điền thêm họ tên + SĐT để tạo mới." />

              <Form.Item name="national_id" label="CCCD (12 số)"
                rules={[
                  { required: true, message: 'Bắt buộc' },
                  { pattern: /^\d{12}$/, message: 'CCCD phải đúng 12 số' },
                ]}>
                <Input prefix={<IdcardOutlined />} placeholder="079xxxxxxxxx" maxLength={12}
                  suffix={cccdValid ? <CheckCircleOutlined style={{ color: '#52c41a' }} /> : null} />
              </Form.Item>

              {existingPartner && (
                <Alert type="success" showIcon style={{ marginBottom: 16 }}
                  message={`Đã có trong hệ thống: ${existingPartner.name} (${existingPartner.code})`}
                  description={`Tier: ${existingPartner.tier} · Reuse partner_id`} />
              )}

              {!existingPartner && cccdValid && (
                <>
                  <Alert type="warning" showIcon style={{ marginBottom: 16 }}
                    message="Hộ mới — cần điền thông tin để tạo" />
                  <Row gutter={16}>
                    <Col span={12}>
                      <Form.Item name="name" label="Họ và tên"
                        rules={[{ required: true, min: 2 }]}>
                        <Input placeholder="Nguyễn Văn A" />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item name="phone" label="SĐT"
                        rules={[{ pattern: /^(\+84|0)\d{9}$/, message: 'SĐT VN 10 số' }]}>
                        <Input placeholder="0912345678" />
                      </Form.Item>
                    </Col>
                  </Row>
                  <Form.Item name="address" label="Địa chỉ">
                    <Input placeholder="Xã, huyện, tỉnh" />
                  </Form.Item>
                </>
              )}

              <Space>
                <Button type="primary" disabled={!cccdValid} onClick={() => setStep(1)}>
                  Tiếp theo
                </Button>
              </Space>
            </>
          )}

          {step === 1 && (
            <>
              <Alert type="info" showIcon style={{ marginBottom: 16 }}
                message="QC đo DRC tại cân + cân xe. Đơn giá tra từ bảng giá ngày (có thể override)." />

              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name="rubber_type" label="Loại mủ" rules={[{ required: true }]} initialValue="mu_tap">
                    <Select options={[
                      { value: 'mu_tap', label: 'Mủ tạp' },
                      { value: 'mu_nuoc', label: 'Mủ nước' },
                      { value: 'mu_cao_su', label: 'Mủ cao su' },
                    ]} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="product_name" label="Tên sản phẩm" rules={[{ required: true }]}>
                    <Input placeholder="Mủ tạp..." />
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item name="drc_measured" label="DRC đo (%)"
                    rules={[{ required: true, type: 'number', min: 0, max: 100 }]}>
                    <InputNumber min={0} max={100} step={0.5} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="unit_price_override" label={`Giá (VNĐ/kg) — daily: ${dailyPrice?.toLocaleString('vi-VN') || 'chưa có'}`}
                    rules={[{ required: true }]}>
                    <InputNumber<number> min={0} step={1000}
                      formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                      parser={v => Number(String(v).replace(/\D/g, '')) || 0}
                      style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="net_weight_kg" label="Cân NET (kg)" rules={[{ required: true }]}>
                    <InputNumber min={0} step={10} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
              </Row>

              <Divider />

              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name="vehicle_plate" label="Biển số xe" rules={[{ required: true }]}>
                    <Input placeholder="51A-12345" />
                  </Form.Item>
                </Col>
                <Col span={12}>
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

              <Space>
                <Button onClick={() => setStep(0)}>Quay lại</Button>
                <Button type="primary" onClick={() => setStep(2)}>Tiếp theo</Button>
              </Space>
            </>
          )}

          {step === 2 && (
            <>
              <Alert type="warning" showIcon style={{ marginBottom: 16 }}
                message="Xem lại trước khi chi tiền (không thể hoàn)" />

              <Card size="small">
                <Row gutter={16}>
                  <Col span={6}>NET: <strong>{netKg?.toLocaleString('vi-VN')} kg</strong></Col>
                  <Col span={6}>DRC: <strong>{drc}%</strong></Col>
                  <Col span={6}>Giá: <strong>{priceUse?.toLocaleString('vi-VN')} VNĐ/kg</strong></Col>
                  <Col span={6}><Tag color="green">Công thức: qty×DRC×giá</Tag></Col>
                </Row>
                <Divider />
                <Text strong style={{ fontSize: 22, color: '#1B4D3E' }}>
                  Tổng chi: {totalAmount.toLocaleString('vi-VN')} VNĐ
                </Text>
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
            <Result status="success" title={`Hoàn tất ${result.deal_number}`}
              subTitle={
                <Space direction="vertical">
                  <Text>Hộ: <strong>{result.partner_code}</strong> {result.partner_is_new && <Tag color="blue">Mới tạo</Tag>}</Text>
                  <Text>Đã chi: <strong>{result.total_amount_vnd.toLocaleString('vi-VN')} VNĐ</strong></Text>
                </Space>
              }
              extra={[
                <Button key="p" icon={<PrinterOutlined />} onClick={() => window.print()}>In</Button>,
                <Button key="n" type="primary" onClick={() => { form.resetFields(); setStep(0); setResult(null); }}>
                  Tạo mới
                </Button>,
              ]} />
          )}
        </Form>
      </Card>
    </div>
  )
}
