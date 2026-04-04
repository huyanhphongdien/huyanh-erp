// ============================================================================
// SALES ORDER CREATE PAGE — Tạo đơn hàng bán quốc tế (Multi-step)
// File: src/pages/sales/SalesOrderCreatePage.tsx
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Card,
  Steps,
  Form,
  Select,
  InputNumber,
  Input,
  Switch,
  DatePicker,
  Button,
  Space,
  Typography,
  Row,
  Col,
  Descriptions,
  Tag,
  Statistic,
  Divider,
  message,
  Breadcrumb,
} from 'antd'
import {
  ArrowLeftOutlined,
  SaveOutlined,
  CheckCircleOutlined,
  UserOutlined,
  ExperimentOutlined,
  TruckOutlined,
  FileTextOutlined,
} from '@ant-design/icons'
import { salesCustomerService } from '../../services/sales/salesCustomerService'
import { salesOrderService, type CreateSalesOrderData } from '../../services/sales/salesOrderService'
import { rubberGradeService } from '../../services/wms/rubberGradeService'
import type { SalesCustomer } from '../../services/sales/salesTypes'
import type { RubberGradeStandard } from '../../services/wms/wms.types'
import {
  SVR_GRADE_OPTIONS,
  INCOTERM_LABELS,
  PAYMENT_TERMS_LABELS,
  PACKING_TYPE_LABELS,
  PORT_OF_LOADING_OPTIONS,
  CONTAINER_TYPE_LABELS,
  CUSTOMER_TIER_LABELS,
  CUSTOMER_TIER_COLORS,
  COUNTRY_OPTIONS,
} from '../../services/sales/salesTypes'
import type { Incoterm, PaymentTerms, PackingType, ContainerType } from '../../services/sales/salesTypes'

const { Title, Text } = Typography
const { TextArea } = Input

// ============================================================================
// HELPERS
// ============================================================================

const formatCurrency = (value: number | undefined | null, currency = 'USD'): string => {
  if (!value) return '-'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value)
}

const formatVND = (value: number | undefined | null): string => {
  if (!value) return '-'
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)} tỷ`
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} tr`
  return new Intl.NumberFormat('vi-VN').format(value) + ' đ'
}

const CURRENCY_OPTIONS = [
  { value: 'USD', label: 'USD' },
  { value: 'EUR', label: 'EUR' },
  { value: 'JPY', label: 'JPY' },
  { value: 'CNY', label: 'CNY' },
]

// ============================================================================
// COMPONENT
// ============================================================================

function SalesOrderCreatePage() {
  const navigate = useNavigate()
  const [form] = Form.useForm()
  const [currentStep, setCurrentStep] = useState(0)
  const [loading, setLoading] = useState(false)

  // Data
  const [customers, setCustomers] = useState<SalesCustomer[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<SalesCustomer | null>(null)
  const [gradeStandards, setGradeStandards] = useState<RubberGradeStandard[]>([])
  const [selectedStandard, setSelectedStandard] = useState<RubberGradeStandard | null>(null)

  // ── Load customers & grade standards ──
  useEffect(() => {
    const loadData = async () => {
      try {
        const [custs, standards] = await Promise.all([
          salesCustomerService.getAllActive(),
          rubberGradeService.getAll(),
        ])
        setCustomers(custs)
        setGradeStandards(standards)
      } catch (err) {
        console.error('Load data error:', err)
        message.error('Không thể tải dữ liệu')
      }
    }
    loadData()
  }, [])

  // ── Auto-calc values ──
  const quantityTons = Form.useWatch('quantity_tons', form) || 0
  const unitPrice = Form.useWatch('unit_price', form) || 0
  const exchangeRate = Form.useWatch('exchange_rate', form) || 0
  const baleWeight = Form.useWatch('bale_weight_kg', form) || 33.33
  const containerType = Form.useWatch('container_type', form) || '20ft'
  const currency = Form.useWatch('currency', form) || 'USD'

  const totalBales = baleWeight > 0 ? Math.ceil((quantityTons * 1000) / baleWeight) : 0
  // Container 20ft: 600 bành (35kg) hoặc 630 bành (33.33kg) | 40ft: gấp đôi
  const balesPerContainer20ft = baleWeight >= 35 ? 600 : 630
  const balesPerContainer = containerType === '40ft' ? balesPerContainer20ft * 2 : balesPerContainer20ft
  const containerCount = balesPerContainer > 0 ? Math.ceil(totalBales / balesPerContainer) : 0
  const totalValueUSD = quantityTons * unitPrice
  const totalValueVND = exchangeRate > 0 ? totalValueUSD * exchangeRate : 0

  // ── Customer selection ──
  const handleCustomerChange = useCallback(
    (customerId: string) => {
      const cust = customers.find((c) => c.id === customerId) || null
      setSelectedCustomer(cust)
      if (cust) {
        form.setFieldsValue({
          incoterm: cust.default_incoterm || 'FOB',
          currency: cust.default_currency || 'USD',
          payment_terms: cust.payment_terms || undefined,
        })
      }
    },
    [customers, form],
  )

  // ── Grade selection → auto-fill quality specs ──
  const handleGradeChange = useCallback(
    (grade: string) => {
      const std = gradeStandards.find((s) => s.grade === grade) || null
      setSelectedStandard(std)
      if (std) {
        form.setFieldsValue({
          drc_min: std.drc_min,
          drc_max: std.drc_max ?? undefined,
          moisture_max: std.moisture_max,
          dirt_max: std.dirt_max,
          ash_max: std.ash_max,
          nitrogen_max: std.nitrogen_max,
          volatile_max: std.volatile_matter_max,
          pri_min: std.pri_min ?? undefined,
          mooney_max: std.mooney_max ?? undefined,
          color_lovibond_max: std.color_lovibond_max ?? undefined,
        })
      }
    },
    [gradeStandards, form],
  )

  // ── Step validation & navigation ──
  const stepFields: string[][] = [
    ['customer_id', 'grade', 'quantity_tons', 'unit_price'],
    [],
    [],
    [],
  ]

  const nextStep = async () => {
    try {
      if (stepFields[currentStep].length > 0) {
        await form.validateFields(stepFields[currentStep])
      }
      setCurrentStep((s) => Math.min(s + 1, 3))
    } catch {
      // validation failed
    }
  }

  const prevStep = () => setCurrentStep((s) => Math.max(s - 1, 0))

  // ── Submit ──
  const handleSubmit = async (asDraft: boolean) => {
    try {
      const values = await form.validateFields()
      setLoading(true)

      // Convert dayjs to string
      const payload: CreateSalesOrderData = {
        ...values,
        delivery_date: values.delivery_date ? values.delivery_date.format('YYYY-MM-DD') : undefined,
        etd: values.etd ? values.etd.format('YYYY-MM-DD') : undefined,
        eta: values.eta ? values.eta.format('YYYY-MM-DD') : undefined,
        lc_expiry_date: values.lc_expiry_date ? values.lc_expiry_date.format('YYYY-MM-DD') : undefined,
      }

      const created = await salesOrderService.create(payload)

      // If not draft, confirm immediately
      if (!asDraft && created.id) {
        try {
          await salesOrderService.updateStatus(created.id, 'confirmed')
        } catch {
          // Order created as draft, but confirmation failed — still navigate
        }
      }

      message.success(asDraft ? 'Đã lưu nháp đơn hàng' : 'Đã xác nhận đơn hàng')
      navigate('/sales/orders')
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'errorFields' in err) return // form validation
      console.error(err)
      const errMsg = err instanceof Error ? err.message : 'Không thể tạo đơn hàng'
      message.error(errMsg)
    } finally {
      setLoading(false)
    }
  }

  // ══════════════════════════════════════════════════════════════
  // STEP CONTENT
  // ══════════════════════════════════════════════════════════════

  const renderStep1 = () => (
    <Row gutter={24}>
      <Col xs={24} lg={16}>
        <Card title="Khách hàng & Sản phẩm" size="small">
          <Form.Item
            label="Khách hàng"
            name="customer_id"
            rules={[{ required: true, message: 'Vui lòng chọn khách hàng' }]}
          >
            <Select
              showSearch
              placeholder="Chọn khách hàng..."
              optionFilterProp="label"
              onChange={handleCustomerChange}
              options={customers.map((c) => ({
                value: c.id,
                label: `${c.code} — ${c.name}${c.country ? ` (${c.country})` : ''}`,
              }))}
            />
          </Form.Item>

          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item
                label="Grade SVR"
                name="grade"
                rules={[{ required: true, message: 'Vui lòng chọn grade' }]}
              >
                <Select
                  placeholder="Chọn grade..."
                  options={SVR_GRADE_OPTIONS.map((g) => ({ value: g.value, label: g.label }))}
                  onChange={handleGradeChange}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item label="PO# khách hàng" name="customer_po">
                <Input placeholder="Số PO của khách hàng" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col xs={24} sm={8}>
              <Form.Item
                label="Số lượng (tấn)"
                name="quantity_tons"
                rules={[{ required: true, message: 'Nhập số lượng' }]}
              >
                <InputNumber min={0.1} step={1} style={{ width: '100%' }} placeholder="0" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item
                label="Đơn giá (USD/tấn)"
                name="unit_price"
                rules={[{ required: true, message: 'Nhập đơn giá' }]}
              >
                <InputNumber min={0} step={10} style={{ width: '100%' }} placeholder="0" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={4}>
              <Form.Item label="Tiền tệ" name="currency" initialValue="USD">
                <Select options={CURRENCY_OPTIONS} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={4}>
              <Form.Item label="Tỷ giá (VND)" name="exchange_rate">
                <InputNumber min={0} step={100} style={{ width: '100%' }} placeholder="25000" />
              </Form.Item>
            </Col>
          </Row>

          {/* Quy cách bành — ảnh hưởng tính toán bành + container */}
          <Form.Item label="Quy cách bành" name="bale_weight_kg" initialValue={33.33} style={{ maxWidth: 320 }}>
            <Select
              options={[
                { value: 33.33, label: '33.33 kg/bành (630 bành/cont 20ft)' },
                { value: 35, label: '35 kg/bành (600 bành/cont 20ft)' },
              ]}
            />
          </Form.Item>
        </Card>
      </Col>

      <Col xs={24} lg={8}>
        {/* Customer card */}
        {selectedCustomer && (
          <Card
            size="small"
            title="Thông tin khách hàng"
            style={{ marginBottom: 16 }}
          >
            <Descriptions column={1} size="small">
              <Descriptions.Item label="Mã">{selectedCustomer.code}</Descriptions.Item>
              <Descriptions.Item label="Tên">{selectedCustomer.name}</Descriptions.Item>
              <Descriptions.Item label="Quốc gia">
                {COUNTRY_OPTIONS.find((c) => c.value === selectedCustomer.country)?.label ||
                  selectedCustomer.country ||
                  '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Hạng">
                <Tag color={CUSTOMER_TIER_COLORS[selectedCustomer.tier]}>
                  {CUSTOMER_TIER_LABELS[selectedCustomer.tier]}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Liên hệ">
                {selectedCustomer.contact_person || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Email">{selectedCustomer.email || '-'}</Descriptions.Item>
            </Descriptions>
          </Card>
        )}

        {/* Auto-calc card */}
        <Card size="small" title="Tự động tính toán">
          <Row gutter={[16, 16]}>
            <Col span={12}>
              <Statistic title="Tổng bành" value={totalBales} suffix="bành" />
            </Col>
            <Col span={12}>
              <Statistic title="Số container" value={containerCount} suffix={containerType} />
            </Col>
            <Col span={12}>
              <Statistic
                title={`Giá trị ${currency}`}
                value={totalValueUSD}
                precision={2}
                prefix="$"
              />
            </Col>
            <Col span={12}>
              <Statistic title="Giá trị VND" value={totalValueVND > 0 ? formatVND(totalValueVND) : '-'} />
            </Col>
          </Row>
        </Card>
      </Col>
    </Row>
  )

  const renderStep2 = () => (
    <Row gutter={24}>
      <Col xs={24} lg={14}>
        <Card title="Chỉ tiêu kỹ thuật" size="small">
          {selectedStandard && (
            <div style={{ marginBottom: 16 }}>
              <Tag color="blue">
                Tự động điền từ tiêu chuẩn {selectedStandard.grade_label}
              </Tag>
            </div>
          )}
          <Row gutter={16}>
            <Col xs={12} sm={8}>
              <Form.Item label="DRC min (%)" name="drc_min">
                <InputNumber min={0} max={100} step={0.1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={12} sm={8}>
              <Form.Item label="DRC max (%)" name="drc_max">
                <InputNumber min={0} max={100} step={0.1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={12} sm={8}>
              <Form.Item label="Moisture max (%)" name="moisture_max">
                <InputNumber min={0} max={10} step={0.01} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={12} sm={8}>
              <Form.Item label="Dirt max (%)" name="dirt_max">
                <InputNumber min={0} max={1} step={0.001} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={12} sm={8}>
              <Form.Item label="Ash max (%)" name="ash_max">
                <InputNumber min={0} max={5} step={0.01} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={12} sm={8}>
              <Form.Item label="Nitrogen max (%)" name="nitrogen_max">
                <InputNumber min={0} max={2} step={0.01} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={12} sm={8}>
              <Form.Item label="Volatile max (%)" name="volatile_max">
                <InputNumber min={0} max={5} step={0.01} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={12} sm={8}>
              <Form.Item label="PRI min" name="pri_min">
                <InputNumber min={0} max={100} step={1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={12} sm={8}>
              <Form.Item label="Mooney max" name="mooney_max">
                <InputNumber min={0} max={100} step={1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={12} sm={8}>
              <Form.Item label="Color max" name="color_lovibond_max">
                <InputNumber min={0} max={10} step={0.5} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
        </Card>
      </Col>

      <Col xs={24} lg={10}>
        <Card title="Đóng gói" size="small">
          <Form.Item label="Loại đóng gói" name="packing_type" initialValue="bale">
            <Select
              options={Object.entries(PACKING_TYPE_LABELS).map(([v, l]) => ({
                value: v,
                label: l,
              }))}
            />
          </Form.Item>

          <Form.Item label="Quy cách bành" name="bale_weight_kg" initialValue={33.33}>
            <Select
              options={[
                { value: 33.33, label: '33.33 kg/bành (630 bành/cont 20ft)' },
                { value: 35, label: '35 kg/bành (600 bành/cont 20ft)' },
              ]}
            />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="Shrink wrap" name="shrink_wrap" valuePropName="checked" initialValue={false}>
                <Switch />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Pallet" name="pallet_required" valuePropName="checked" initialValue={false}>
                <Switch />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item label="Marking instructions" name="marking_instructions">
            <TextArea rows={4} placeholder="Hướng dẫn đánh dấu trên bành/thùng..." />
          </Form.Item>
        </Card>
      </Col>
    </Row>
  )

  const renderStep3 = () => (
    <Row gutter={24}>
      <Col xs={24} lg={12}>
        <Card title="Vận chuyển" size="small">
          <Form.Item label="Incoterm" name="incoterm" initialValue="FOB">
            <Select
              options={Object.entries(INCOTERM_LABELS).map(([v, l]) => ({
                value: v,
                label: l,
              }))}
            />
          </Form.Item>

          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item label="Cảng xếp hàng" name="port_of_loading">
                <Select
                  allowClear
                  placeholder="Chọn cảng..."
                  options={PORT_OF_LOADING_OPTIONS.map((p) => ({
                    value: p.value,
                    label: p.label,
                  }))}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item label="Cảng đích" name="port_of_destination">
                <Input placeholder="Vd: Shanghai, Yokohama..." />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item label="Loại container" name="container_type" initialValue="20ft">
            <Select
              options={Object.entries(CONTAINER_TYPE_LABELS).map(([v, l]) => ({
                value: v,
                label: l,
              }))}
            />
          </Form.Item>

          <Row gutter={16}>
            <Col xs={24} sm={8}>
              <Form.Item label="Ngày giao" name="delivery_date">
                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item label="ETD" name="etd">
                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item label="ETA" name="eta">
                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
          </Row>

          <Divider />
          <Row gutter={16}>
            <Col xs={24} sm={8}>
              <Form.Item label="Hãng tàu" name="shipping_line">
                <Input placeholder="Vd: Maersk, MSC..." />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item label="Tên tàu" name="vessel_name">
                <Input placeholder="Vessel name" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item label="Booking ref" name="booking_reference">
                <Input placeholder="Booking number" />
              </Form.Item>
            </Col>
          </Row>
        </Card>
      </Col>

      <Col xs={24} lg={12}>
        <Card title="Thanh toán" size="small">
          <Form.Item label="Điều khoản thanh toán" name="payment_terms">
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
            <Col xs={24} sm={8}>
              <Form.Item label="Số L/C" name="lc_number">
                <Input placeholder="L/C number" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item label="Ngân hàng L/C" name="lc_bank">
                <Input placeholder="Issuing bank" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item label="Hết hạn L/C" name="lc_expiry_date">
                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
          </Row>
        </Card>
      </Col>
    </Row>
  )

  const renderStep4 = () => {
    const vals = form.getFieldsValue(true)
    const grade = SVR_GRADE_OPTIONS.find((g) => g.value === vals.grade)
    const cust = selectedCustomer
    const pol = PORT_OF_LOADING_OPTIONS.find((p) => p.value === vals.port_of_loading)

    return (
      <Row gutter={24}>
        <Col xs={24} lg={16}>
          <Card title="Xác nhận đơn hàng" size="small">
            <Descriptions bordered column={{ xs: 1, sm: 2 }} size="small">
              <Descriptions.Item label="Khách hàng" span={2}>
                {cust ? `${cust.code} — ${cust.name}` : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Grade">
                <Tag color="blue">{grade?.label || vals.grade || '-'}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="PO# KH">{vals.customer_po || '-'}</Descriptions.Item>
              <Descriptions.Item label="Số lượng">{vals.quantity_tons} tấn</Descriptions.Item>
              <Descriptions.Item label="Đơn giá">
                {formatCurrency(vals.unit_price, vals.currency)} / tấn
              </Descriptions.Item>
              <Descriptions.Item label="Giá trị USD">
                {formatCurrency(totalValueUSD, 'USD')}
              </Descriptions.Item>
              <Descriptions.Item label="Giá trị VND">
                {totalValueVND > 0 ? formatVND(totalValueVND) : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Tổng bành">{totalBales}</Descriptions.Item>
              <Descriptions.Item label="Container">
                {containerCount} x {vals.container_type || '20ft'}
              </Descriptions.Item>
              <Descriptions.Item label="Incoterm">
                {INCOTERM_LABELS[vals.incoterm as Incoterm] || vals.incoterm || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Cảng xếp hàng">
                {pol?.label || vals.port_of_loading || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Cảng đích">
                {vals.port_of_destination || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Ngày giao">
                {vals.delivery_date ? vals.delivery_date.format('DD/MM/YYYY') : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Thanh toán">
                {PAYMENT_TERMS_LABELS[vals.payment_terms as PaymentTerms] || vals.payment_terms || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Số L/C">{vals.lc_number || '-'}</Descriptions.Item>
              <Descriptions.Item label="Đóng gói">
                {PACKING_TYPE_LABELS[vals.packing_type as PackingType] || 'Banh'}
                {vals.shrink_wrap ? ' + Shrink wrap' : ''}
                {vals.pallet_required ? ' + Pallet' : ''}
              </Descriptions.Item>
              <Descriptions.Item label="KL bành">{vals.bale_weight_kg || 33.33} kg</Descriptions.Item>
            </Descriptions>

            {/* Quality specs summary */}
            <Divider orientationMargin={0} plain>
              Chỉ tiêu kỹ thuật
            </Divider>
            <Descriptions bordered column={{ xs: 2, sm: 3 }} size="small">
              <Descriptions.Item label="DRC">
                {vals.drc_min ?? '-'} ~ {vals.drc_max ?? '-'} %
              </Descriptions.Item>
              <Descriptions.Item label="Moisture">{vals.moisture_max ?? '-'} %</Descriptions.Item>
              <Descriptions.Item label="Dirt">{vals.dirt_max ?? '-'} %</Descriptions.Item>
              <Descriptions.Item label="Ash">{vals.ash_max ?? '-'} %</Descriptions.Item>
              <Descriptions.Item label="Nitrogen">{vals.nitrogen_max ?? '-'} %</Descriptions.Item>
              <Descriptions.Item label="Volatile">{vals.volatile_max ?? '-'} %</Descriptions.Item>
              <Descriptions.Item label="PRI">{vals.pri_min ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="Mooney">{vals.mooney_max ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="Color">{vals.color_lovibond_max ?? '-'}</Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>

        <Col xs={24} lg={8}>
          <Card title="Ghi chú" size="small">
            <Form.Item name="notes">
              <TextArea rows={6} placeholder="Ghi chú cho đơn hàng..." />
            </Form.Item>
          </Card>

          <Card size="small" style={{ marginTop: 16 }}>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Button
                type="default"
                icon={<SaveOutlined />}
                block
                size="large"
                loading={loading}
                onClick={() => handleSubmit(true)}
              >
                Lưu nháp
              </Button>
              <Button
                type="primary"
                icon={<CheckCircleOutlined />}
                block
                size="large"
                loading={loading}
                onClick={() => handleSubmit(false)}
                style={{ background: '#1B4D3E' }}
              >
                Xác nhận đơn hàng
              </Button>
            </Space>
          </Card>
        </Col>
      </Row>
    )
  }

  // ══════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════

  const stepItems = [
    { title: 'Khách hàng & Sản phẩm', icon: <UserOutlined /> },
    { title: 'Chất lượng & Đóng gói', icon: <ExperimentOutlined /> },
    { title: 'Vận chuyển & Thanh toán', icon: <TruckOutlined /> },
    { title: 'Xác nhận', icon: <FileTextOutlined /> },
  ]

  return (
    <div style={{ padding: '24px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Breadcrumb */}
      <Breadcrumb
        style={{ marginBottom: 16 }}
        items={[
          { title: 'Đơn hàng bán' },
          {
            title: <a onClick={() => navigate('/sales/orders')}>Danh sách</a>,
          },
          { title: 'Tạo mới' },
        ]}
      />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/sales/orders')} />
        <Title level={4} style={{ margin: 0 }}>
          Tạo đơn hàng bán
        </Title>
      </div>

      {/* Steps */}
      <Card style={{ marginBottom: 24 }}>
        <Steps current={currentStep} items={stepItems} />
      </Card>

      {/* Form */}
      <Form form={form} layout="vertical" requiredMark="optional">
        {currentStep === 0 && renderStep1()}
        {currentStep === 1 && renderStep2()}
        {currentStep === 2 && renderStep3()}
        {currentStep === 3 && renderStep4()}
      </Form>

      {/* Navigation buttons */}
      {currentStep < 3 && (
        <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between' }}>
          <Button onClick={prevStep} disabled={currentStep === 0}>
            Quay lại
          </Button>
          <Button type="primary" onClick={nextStep} style={{ background: '#1B4D3E' }}>
            Tiếp theo
          </Button>
        </div>
      )}
    </div>
  )
}

export default SalesOrderCreatePage
