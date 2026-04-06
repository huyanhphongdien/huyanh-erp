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
  DatePicker,
  Button,
  Space,
  Typography,
  Row,
  Col,
  Descriptions,
  Tag,
  Divider,
  message,
  Breadcrumb,
} from 'antd'
import {
  ArrowLeftOutlined,
  SaveOutlined,
  CheckCircleOutlined,
  UserOutlined,
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
  CUSTOMER_TIER_LABELS,
  CUSTOMER_TIER_COLORS,
  COUNTRY_OPTIONS,
} from '../../services/sales/salesTypes'
import type { Incoterm, PaymentTerms, PackingType } from '../../services/sales/salesTypes'

const { Title } = Typography
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
  const [, setSelectedStandard] = useState<RubberGradeStandard | null>(null)

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
  const baleWeight = Form.useWatch('bale_weight_kg', form) || 35
  const balesPerContInput = Form.useWatch('bales_per_container', form) || 576
  const containerType = Form.useWatch('container_type', form) || '20ft'
  const currency = Form.useWatch('currency', form) || 'USD'
  const commissionPct = Form.useWatch('commission_pct', form) || 0

  const totalBales = baleWeight > 0 ? Math.ceil((quantityTons * 1000) / baleWeight) : 0
  const balesPerContainer = containerType === '40ft' ? balesPerContInput * 2 : balesPerContInput
  const containerCount = balesPerContainer > 0 ? Math.ceil(totalBales / balesPerContainer) : 0
  const totalValueUSD = quantityTons * unitPrice
  const commissionAmt = totalValueUSD * (commissionPct / 100)

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

      // Convert dayjs to string + calc commission
      const totalUsd = (values.quantity_tons || 0) * (values.unit_price || 0)
      const payload: CreateSalesOrderData = {
        ...values,
        delivery_date: values.delivery_date ? values.delivery_date.format('YYYY-MM-DD') : undefined,
        contract_date: values.contract_date ? values.contract_date.format('YYYY-MM-DD') : undefined,
        etd: values.etd ? values.etd.format('YYYY-MM-DD') : undefined,
        eta: values.eta ? values.eta.format('YYYY-MM-DD') : undefined,
        lc_expiry_date: values.lc_expiry_date ? values.lc_expiry_date.format('YYYY-MM-DD') : undefined,
        commission_amount: values.commission_pct ? totalUsd * (values.commission_pct / 100) : undefined,
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
        {/* ═══ Thông tin Hợp đồng ═══ */}
        <Card size="small" style={{ marginBottom: 16, borderRadius: 12 }}
          title={<span style={{ fontSize: 14, fontWeight: 600 }}>📋 Thông tin Hợp đồng</span>}>
          <Row gutter={16}>
            <Col xs={24} sm={8}>
              <Form.Item label="Số hợp đồng" name="contract_no" rules={[{ required: true, message: 'Nhập số HĐ' }]}>
                <Input placeholder="VD: LTC2024/PD-ATC" size="large" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item label="Ngày hợp đồng" name="contract_date">
                <DatePicker style={{ width: '100%' }} size="large" format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item label="PO# khách hàng" name="customer_po">
                <Input placeholder="Số PO" size="large" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col xs={24}>
              <Form.Item label="Khách hàng (Buyer)" name="customer_id" rules={[{ required: true, message: 'Chọn buyer' }]}>
                <Select showSearch placeholder="Chọn khách hàng..." optionFilterProp="label" onChange={handleCustomerChange} size="large"
                  options={customers.map((c) => ({ value: c.id, label: `${c.code} — ${c.name}${c.country ? ` (${c.country})` : ''}` }))} />
              </Form.Item>
            </Col>
          </Row>
        </Card>

        {/* ═══ Sản phẩm & Giá ═══ */}
        <Card size="small" style={{ marginBottom: 16, borderRadius: 12 }}
          title={<span style={{ fontSize: 14, fontWeight: 600 }}>Sản phẩm & Giá</span>}>
          <Row gutter={16}>
            <Col xs={24} sm={8}>
              <Form.Item label="Grade SVR" name="grade" rules={[{ required: true, message: 'Chọn grade' }]}>
                <Select placeholder="Chọn grade..." size="large"
                  options={SVR_GRADE_OPTIONS.map((g) => ({ value: g.value, label: g.label }))}
                  onChange={handleGradeChange} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item label="Số lượng (tấn)" name="quantity_tons" rules={[{ required: true, message: 'Nhập SL' }]}>
                <InputNumber min={0.01} step={1} size="large" style={{ width: '100%' }} placeholder="725.76"
                  formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                  parser={(v) => Number(v?.replace(/,/g, '') || 0) as any} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item label="Đơn giá (USD/MT)" name="unit_price" rules={[{ required: true, message: 'Nhập giá' }]}>
                <InputNumber min={0} step={10} size="large" style={{ width: '100%' }} placeholder="1,924"
                  formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                  parser={(v) => Number(v?.replace(/,/g, '') || 0) as any} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col xs={24} sm={8}>
              <Form.Item label="Tiền tệ" name="currency" initialValue="USD">
                <Select size="large" options={CURRENCY_OPTIONS} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item label="Quy cách bành" name="bale_weight_kg" initialValue={35}>
                <Select size="large" options={[
                  { value: 35, label: '35 kg/bành' },
                  { value: 33.33, label: '33.33 kg/bành' },
                ]} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item label="Bành/container" name="bales_per_container" initialValue={576}>
                <InputNumber min={1} max={1000} size="large" style={{ width: '100%' }} placeholder="576" />
              </Form.Item>
            </Col>
          </Row>
        </Card>

        {/* ═══ Điều khoản & Ngân hàng ═══ */}
        <Card size="small" style={{ marginBottom: 16, borderRadius: 12 }}
          title={<span style={{ fontSize: 14, fontWeight: 600 }}>Điều khoản & Ngân hàng</span>}>
          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item label="Thanh toán" name="payment_terms">
                <Select size="large" allowClear placeholder="Chọn..."
                  options={Object.entries(PAYMENT_TERMS_LABELS).map(([v, l]) => ({ value: v, label: l }))} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item label="Incoterm" name="incoterm" initialValue="FOB">
                <Select size="large"
                  options={Object.entries(INCOTERM_LABELS).map(([v, l]) => ({ value: v, label: l }))} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item label="Ngày giao dự kiến" name="delivery_date">
                <DatePicker style={{ width: '100%' }} size="large" format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item label="Cảng xếp hàng (POL)" name="port_of_loading">
                <Select size="large" allowClear placeholder="Chọn cảng..."
                  options={PORT_OF_LOADING_OPTIONS.map((p) => ({ value: p.value, label: p.label }))} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col xs={24} sm={8}>
              <Form.Item label="Hoa hồng (%)" name="commission_pct">
                <InputNumber min={0} max={20} step={0.5} size="large" style={{ width: '100%' }} placeholder="2" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item label="Đóng gói" name="packing_type" initialValue="loose_bale">
                <Select size="large" options={[
                  { value: 'loose_bale', label: 'Loose Bale' },
                  { value: 'sw_pallet', label: 'SW Pallet (Shrink Wrap)' },
                  { value: 'wooden_pallet', label: 'Wooden Pallet' },
                  { value: 'metal_box', label: 'Metal Box' },
                ]} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item label="Cảng đích" name="port_of_destination">
                <Input size="large" placeholder="Shanghai, Yokohama..." />
              </Form.Item>
            </Col>
          </Row>
          <Divider style={{ margin: '12px 0' }} />
          <Row gutter={16}>
            <Col xs={24} sm={8}>
              <Form.Item label="Ngân hàng" name="bank_name" initialValue="Vietcombank CN Huế">
                <Input size="large" placeholder="Vietcombank CN Huế" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item label="Số tài khoản" name="bank_account" initialValue="0071001046372">
                <Input size="large" placeholder="0071001046372" style={{ fontFamily: 'monospace' }} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item label="SWIFT Code" name="bank_swift" initialValue="BFTVVNVX">
                <Input size="large" placeholder="BFTVVNVX" style={{ fontFamily: 'monospace' }} />
              </Form.Item>
            </Col>
          </Row>
        </Card>
      </Col>

      <Col xs={24} lg={8}>
        {/* ═══ Thông tin khách hàng ═══ */}
        {selectedCustomer && (
          <Card size="small" style={{ marginBottom: 16, borderRadius: 12, background: '#fafffe', borderColor: '#d9f7e8' }}
            title={<span style={{ fontSize: 13, fontWeight: 600, color: '#1B4D3E' }}>Thông tin khách hàng</span>}>
            <Descriptions column={1} size="small" labelStyle={{ color: '#888', width: 80 }}>
              <Descriptions.Item label="Mã"><Tag style={{ fontFamily: 'monospace' }}>{selectedCustomer.code}</Tag></Descriptions.Item>
              <Descriptions.Item label="Tên"><strong>{selectedCustomer.name}</strong></Descriptions.Item>
              <Descriptions.Item label="Quốc gia">
                {COUNTRY_OPTIONS.find((c) => c.value === selectedCustomer.country)?.label || selectedCustomer.country || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Hạng">
                <Tag color={CUSTOMER_TIER_COLORS[selectedCustomer.tier]}>
                  {CUSTOMER_TIER_LABELS[selectedCustomer.tier]}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Liên hệ">{selectedCustomer.contact_person || '-'}</Descriptions.Item>
              <Descriptions.Item label="Email">{selectedCustomer.email || '-'}</Descriptions.Item>
            </Descriptions>
          </Card>
        )}

        {/* ═══ Tự động tính toán ═══ */}
        <Card size="small" style={{ borderRadius: 12, background: 'linear-gradient(135deg, #1B4D3E 0%, #2E7D5B 100%)', border: 'none' }}>
          <div style={{ color: '#fff', marginBottom: 16 }}>
            <span style={{ fontSize: 13, fontWeight: 600, opacity: 0.8 }}>Tự động tính toán</span>
          </div>
          <Row gutter={[16, 20]}>
            <Col span={12}>
              <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, marginBottom: 4 }}>Tổng bành</div>
              <div style={{ color: '#fff', fontSize: 28, fontWeight: 700, lineHeight: 1 }}>{totalBales.toLocaleString()}</div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginTop: 2 }}>bành ({baleWeight} kg)</div>
            </Col>
            <Col span={12}>
              <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, marginBottom: 4 }}>Số container</div>
              <div style={{ color: '#FFD700', fontSize: 28, fontWeight: 700, lineHeight: 1 }}>{containerCount}</div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginTop: 2 }}>{containerType}</div>
            </Col>
            <Col span={12}>
              <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, marginBottom: 4 }}>Giá trị {currency}</div>
              <div style={{ color: '#4ADE80', fontSize: 22, fontWeight: 700, lineHeight: 1 }}>
                {currency === 'USD' ? '$' : ''}{totalValueUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </Col>
            <Col span={12}>
              <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, marginBottom: 4 }}>Hoa hồng</div>
              <div style={{ color: '#fff', fontSize: 16, fontWeight: 600, lineHeight: 1 }}>
                {commissionAmt > 0 ? `$${commissionAmt.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '—'}
              </div>
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
              <Descriptions.Item label="Hoa hồng">
                {commissionAmt > 0 ? `$${commissionAmt.toLocaleString('en-US', { maximumFractionDigits: 0 })} (${vals.commission_pct || 0}%)` : '-'}
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
    { title: 'Khách hàng & Sản phẩm', icon: <UserOutlined />, description: 'BP Sale nhập' },
    { title: 'Xác nhận đơn hàng', icon: <FileTextOutlined />, description: 'Review & lưu' },
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

      {/* Form — dùng display:none thay vì unmount để giữ data khi back */}
      <Form form={form} layout="vertical" requiredMark="optional" preserve>
        <div style={{ display: currentStep === 0 ? 'block' : 'none' }}>
          {renderStep1()}
        </div>
        <div style={{ display: currentStep === 1 ? 'block' : 'none' }}>
          {renderStep4()}
        </div>
      </Form>

      {/* Navigation buttons */}
      {currentStep < 1 && (
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
