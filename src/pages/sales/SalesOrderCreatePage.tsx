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
  AutoComplete,
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
  BANK_OPTIONS,
  BANK_DETAILS,
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

  // Multi-item state
  interface OrderItem {
    key: string
    grade: string
    quantity_tons: number
    unit_price: number
    bale_weight_kg: number
    bales_per_container: number
    packing_type: string
    packing_note: string
    payment_terms: string
  }
  const [orderItems, setOrderItems] = useState<OrderItem[]>([
    { key: '1', grade: '', quantity_tons: 0, unit_price: 0, bale_weight_kg: 35, bales_per_container: 576, packing_type: 'loose_bale', packing_note: '', payment_terms: '' },
  ])

  const addItem = () => {
    setOrderItems(prev => [...prev, { key: String(Date.now()), grade: '', quantity_tons: 0, unit_price: 0, bale_weight_kg: 35, bales_per_container: 576, packing_type: 'loose_bale', packing_note: '', payment_terms: '' }])
  }

  const removeItem = (key: string) => {
    if (orderItems.length <= 1) return
    setOrderItems(prev => prev.filter(i => i.key !== key))
  }

  const updateItem = (key: string, field: string, value: any) => {
    setOrderItems(prev => prev.map(i => i.key === key ? { ...i, [field]: value } : i))
  }

  // Totals from items
  const itemsTotalTons = orderItems.reduce((s, i) => s + (i.quantity_tons || 0), 0)
  const itemsTotalUSD = orderItems.reduce((s, i) => s + (i.quantity_tons || 0) * (i.unit_price || 0), 0)
  const itemsTotalBales = orderItems.reduce((s, i) => {
    const bw = i.bale_weight_kg || 35
    return s + Math.round((i.quantity_tons * 1000) / bw)
  }, 0)
  const itemsTotalContainers = orderItems.reduce((s, i) => {
    const bw = i.bale_weight_kg || 35
    const bales = Math.round((i.quantity_tons * 1000) / bw)
    return s + (i.bales_per_container > 0 ? Math.ceil(bales / i.bales_per_container) : 0)
  }, 0)

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
  const commissionUsdPerMt = Form.useWatch('commission_usd_per_mt', form) || 0

  const totalBales = baleWeight > 0 ? Math.round((quantityTons * 1000) / baleWeight) : 0
  const balesPerContainer = containerType === '40ft' ? balesPerContInput * 2 : balesPerContInput
  const containerCount = balesPerContainer > 0 ? Math.ceil(totalBales / balesPerContainer) : 0
  const totalValueUSD = quantityTons * unitPrice
  // Ưu tiên USD/MT nếu có; nếu không thì dùng %
  const commissionAmt = commissionUsdPerMt > 0
    ? quantityTons * commissionUsdPerMt
    : totalValueUSD * (commissionPct / 100)

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

  // ── Step validation & navigation ──
  const nextStep = async () => {
    try {
      // Validate form fields
      await form.validateFields(['customer_id', 'contract_no'])
      // Validate items
      const validItems = orderItems.filter(i => i.grade && i.quantity_tons > 0 && i.unit_price > 0)
      if (validItems.length === 0) {
        message.error('Vui lòng thêm ít nhất 1 sản phẩm (chọn Grade, nhập Tấn, $/tấn)')
        return
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

      // Validate items
      const validItems = orderItems.filter(i => i.grade && i.quantity_tons > 0 && i.unit_price > 0)
      if (validItems.length === 0) {
        message.error('Vui lòng thêm ít nhất 1 sản phẩm')
        setLoading(false)
        return
      }

      // Gộp packing_note từ items → header (để detail page hiển thị)
      const itemPackingNotes = validItems
        .map(i => (i.packing_note || '').trim())
        .filter(Boolean)
      const aggregatedPackingNote = validItems.length === 1
        ? (itemPackingNotes[0] || undefined)
        : (itemPackingNotes.length
            ? validItems
                .filter(i => (i.packing_note || '').trim())
                .map(i => `${i.grade}: ${i.packing_note}`)
                .join('\n')
            : undefined)

      // Convert dayjs to string + calc from items
      const payload: CreateSalesOrderData = {
        ...values,
        // Set header from first item (or combined)
        grade: validItems.length === 1 ? validItems[0].grade : validItems.map(i => i.grade).join(' + '),
        quantity_tons: itemsTotalTons,
        unit_price: validItems.length === 1 ? validItems[0].unit_price : Math.round((itemsTotalUSD / itemsTotalTons) * 100) / 100,
        bale_weight_kg: validItems[0].bale_weight_kg,
        bales_per_container: validItems[0].bales_per_container,
        packing_type: validItems[0].packing_type as any,
        packing_note: values.packing_note || aggregatedPackingNote,
        delivery_date: values.delivery_date ? values.delivery_date.format('YYYY-MM-DD') : undefined,
        contract_date: values.contract_date ? values.contract_date.format('YYYY-MM-DD') : undefined,
        etd: values.etd ? values.etd.format('YYYY-MM-DD') : undefined,
        eta: values.eta ? values.eta.format('YYYY-MM-DD') : undefined,
        lc_expiry_date: values.lc_expiry_date ? values.lc_expiry_date.format('YYYY-MM-DD') : undefined,
        commission_amount: values.commission_usd_per_mt
          ? itemsTotalTons * values.commission_usd_per_mt
          : (values.commission_pct ? itemsTotalUSD * (values.commission_pct / 100) : undefined),
        // Multi-item data
        items: validItems,
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

        {/* ═══ Sản phẩm & Giá — Multi-item ═══ */}
        <Card size="small" style={{ marginBottom: 16, borderRadius: 12 }}
          title={<Space><span style={{ fontSize: 14, fontWeight: 600 }}>Sản phẩm & Giá</span><Tag color="blue">{orderItems.length} sản phẩm</Tag></Space>}
          extra={<Button size="small" type="dashed" onClick={addItem} icon={<span>+</span>}>Thêm SP</Button>}>

          {orderItems.map((item, idx) => (
            <div key={item.key} style={{ background: idx % 2 === 0 ? '#fafafa' : '#fff', padding: '12px', borderRadius: 8, marginBottom: 8, border: '1px solid #f0f0f0' }}>
              <Row gutter={[12, 8]} align="middle">
                <Col xs={24} sm={5}>
                  <div style={{ fontSize: 11, color: '#999', marginBottom: 2 }}>Grade</div>
                  <AutoComplete
                    value={item.grade || undefined}
                    placeholder="Chọn hoặc tự nhập (vd SVR10mixture SBR1502 60/40)"
                    style={{ width: '100%' }}
                    options={SVR_GRADE_OPTIONS.map(g => ({ value: g.value, label: g.label }))}
                    filterOption={(input, opt) =>
                      String(opt?.value || '').toLowerCase().includes(input.toLowerCase()) ||
                      String(opt?.label || '').toLowerCase().includes(input.toLowerCase())
                    }
                    onChange={(v: string) => updateItem(item.key, 'grade', v || '')}
                  />
                </Col>
                <Col xs={12} sm={4}>
                  <div style={{ fontSize: 11, color: '#999', marginBottom: 2 }}>Tấn</div>
                  <InputNumber value={item.quantity_tons || undefined} min={0.01} step={1} style={{ width: '100%' }} placeholder="725"
                    onChange={(v) => updateItem(item.key, 'quantity_tons', v || 0)} />
                </Col>
                <Col xs={12} sm={4}>
                  <div style={{ fontSize: 11, color: '#999', marginBottom: 2 }}>$/tấn</div>
                  <InputNumber value={item.unit_price || undefined} min={0} step={10} style={{ width: '100%' }} placeholder="1,924"
                    onChange={(v) => updateItem(item.key, 'unit_price', v || 0)} />
                </Col>
                <Col xs={12} sm={3}>
                  <div style={{ fontSize: 11, color: '#999', marginBottom: 2 }}>KG/bành</div>
                  <Select value={item.bale_weight_kg} style={{ width: '100%' }}
                    options={[{ value: 35, label: '35' }, { value: 33.33, label: '33.33' }]}
                    onChange={(v) => updateItem(item.key, 'bale_weight_kg', v)} />
                </Col>
                <Col xs={12} sm={3}>
                  <div style={{ fontSize: 11, color: '#999', marginBottom: 2 }}>Bành/cont</div>
                  <InputNumber value={item.bales_per_container} min={1} style={{ width: '100%' }}
                    onChange={(v) => updateItem(item.key, 'bales_per_container', v || 576)} />
                </Col>
                <Col xs={12} sm={4}>
                  <div style={{ fontSize: 11, color: '#999', marginBottom: 2 }}>Đóng gói</div>
                  <Select value={item.packing_type} style={{ width: '100%' }}
                    options={[
                      { value: 'loose_bale', label: 'Loose Bale' },
                      { value: 'sw_pallet', label: 'SW Pallet' },
                      { value: 'wooden_pallet', label: 'Wooden Pallet' },
                      { value: 'metal_box', label: 'Metal Box' },
                    ]}
                    onChange={(v) => updateItem(item.key, 'packing_type', v)} />
                </Col>
                <Col xs={24}>
                  <div style={{ fontSize: 11, color: '#999', marginBottom: 2, marginTop: 4 }}>Ghi chú bao bì (tuỳ chọn)</div>
                  <Input
                    value={item.packing_note || ''}
                    placeholder="VD: Pallet gỗ fumigation, bao PE lót đáy cont, in logo khách..."
                    onChange={(e) => updateItem(item.key, 'packing_note', e.target.value)}
                  />
                </Col>
                <Col xs={24}>
                  <div style={{ fontSize: 11, color: '#999', marginBottom: 4, marginTop: 4 }}>Thanh toán</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {Object.entries(PAYMENT_TERMS_LABELS).map(([val, label]) => {
                      const selected = (item.payment_terms || '').split(',').includes(val)
                      return (
                        <Tag
                          key={val}
                          style={{ cursor: 'pointer', fontSize: 11, padding: '2px 8px', borderRadius: 4, userSelect: 'none',
                            background: selected ? '#1B4D3E' : '#fff', color: selected ? '#fff' : '#666',
                            border: selected ? '1px solid #1B4D3E' : '1px solid #d9d9d9' }}
                          onClick={() => {
                            const current = (item.payment_terms || '').split(',').filter(Boolean)
                            const next = selected ? current.filter(v => v !== val) : [...current, val]
                            updateItem(item.key, 'payment_terms', next.join(','))
                          }}
                        >
                          {selected ? '✓ ' : ''}{label}
                        </Tag>
                      )
                    })}
                  </div>
                </Col>
                <Col xs={4} sm={1} style={{ textAlign: 'center' }}>
                  {orderItems.length > 1 && (
                    <Button type="text" danger size="small" onClick={() => removeItem(item.key)} style={{ marginTop: 16 }}>X</Button>
                  )}
                </Col>
              </Row>
              {item.quantity_tons > 0 && item.unit_price > 0 && (
                <div style={{ marginTop: 6, fontSize: 11, color: '#666' }}>
                  {Math.round(item.quantity_tons * 1000 / (item.bale_weight_kg || 35)).toLocaleString()} bành |
                  {' '}{Math.ceil(Math.round(item.quantity_tons * 1000 / (item.bale_weight_kg || 35)) / (item.bales_per_container || 576))} cont |
                  {' '}${(item.quantity_tons * item.unit_price).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                </div>
              )}
            </div>
          ))}
        </Card>

        {/* ═══ Điều khoản & Ngân hàng ═══ */}
        <Card size="small" style={{ marginBottom: 16, borderRadius: 12 }}
          title={<span style={{ fontSize: 14, fontWeight: 600 }}>Điều khoản & Ngân hàng</span>}>
          <Row gutter={16}>
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
            <Col xs={24}>
              <Form.Item
                label="Shipment Time"
                name="shipment_time"
                tooltip="Điều khoản thời gian giao hàng trên hợp đồng/L/C (text tự do). VD: Within 30 days from L/C date, End of May 2026, June/July 2026..."
              >
                <Input size="large" placeholder="VD: Within 30 days from L/C date / End of May 2026 / June–July shipment" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col xs={24}>
              <Form.Item
                label="Ghi chú thanh toán"
                name="payment_terms_note"
                tooltip="Dùng cho case thanh toán không khớp tag cố định phía trên. VD: L/C at sight, L/C usance, L/C UPAS, 10% cọc + 90% D/P, 30% TT trước + 70% khi giao..."
              >
                <TextArea
                  rows={2}
                  placeholder="VD: L/C at sight / L/C UPAS 90 days / 10% cọc + 90% D/P / 30% TT trước ETD + 70% sau B/L"
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col xs={24} sm={8}>
              <Form.Item label="Hoa hồng (%)" name="commission_pct" tooltip="Tính theo % tổng giá trị đơn. Dùng % HOẶC USD/MT, không dùng cả hai.">
                <InputNumber min={0} max={20} step={0.5} size="large" style={{ width: '100%' }} placeholder="2"
                  disabled={commissionUsdPerMt > 0} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item label="Hoa hồng (USD/MT)" name="commission_usd_per_mt" tooltip="Số USD trên mỗi tấn. Dùng khi hợp đồng môi giới tính theo đô/tấn thay vì %.">
                <InputNumber min={0} max={1000} step={1} size="large" style={{ width: '100%' }} placeholder="25"
                  disabled={commissionPct > 0} />
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
              <Form.Item label="Ngân hàng" name="bank_code" initialValue="VCB">
                <Select size="large" onChange={(val: string) => {
                  const details = BANK_DETAILS[val]
                  if (details) {
                    form.setFieldsValue({
                      bank_name: details.name,
                      bank_account: details.account,
                      bank_swift: details.swift,
                    })
                  } else {
                    form.setFieldsValue({ bank_name: '', bank_account: '', bank_swift: '' })
                  }
                }}
                  options={BANK_OPTIONS.map(b => ({ value: b.value, label: b.label }))}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item label="Số tài khoản" name="bank_account" initialValue="0071001046372">
                <Input size="large" style={{ fontFamily: 'monospace' }} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item label="SWIFT Code" name="bank_swift" initialValue="BFTVVNVX">
                <Input size="large" style={{ fontFamily: 'monospace' }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="bank_name" hidden><Input /></Form.Item>
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
              <div style={{ color: '#fff', fontSize: 28, fontWeight: 700, lineHeight: 1 }}>{itemsTotalBales.toLocaleString()}</div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginTop: 2 }}>bành</div>
            </Col>
            <Col span={12}>
              <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, marginBottom: 4 }}>Số container</div>
              <div style={{ color: '#FFD700', fontSize: 28, fontWeight: 700, lineHeight: 1 }}>{itemsTotalContainers}</div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginTop: 2 }}>20ft</div>
            </Col>
            <Col span={12}>
              <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, marginBottom: 4 }}>Giá trị {currency}</div>
              <div style={{ color: '#4ADE80', fontSize: 22, fontWeight: 700, lineHeight: 1 }}>
                ${itemsTotalUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </Col>
            <Col span={12}>
              <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, marginBottom: 4 }}>Hoa hồng</div>
              <div style={{ color: '#fff', fontSize: 16, fontWeight: 600, lineHeight: 1 }}>
                {commissionUsdPerMt > 0
                  ? `$${(itemsTotalTons * commissionUsdPerMt).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
                  : commissionPct > 0
                    ? `$${(itemsTotalUSD * commissionPct / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
                    : '—'}
              </div>
              {commissionUsdPerMt > 0 && (
                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10, marginTop: 2 }}>
                  ${commissionUsdPerMt}/MT
                </div>
              )}
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
                {commissionAmt > 0
                  ? `$${commissionAmt.toLocaleString('en-US', { maximumFractionDigits: 0 })} (${vals.commission_usd_per_mt ? `$${vals.commission_usd_per_mt}/MT` : `${vals.commission_pct || 0}%`})`
                  : '-'}
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
                {PACKING_TYPE_LABELS[vals.packing_type as PackingType] || vals.packing_type || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="KL bành">{vals.bale_weight_kg || 33.33} kg</Descriptions.Item>
            </Descriptions>

            {/* Quality specs — editable */}
            <Divider plain style={{ margin: '12px 0 8px' }}>
              Chỉ tiêu kỹ thuật (tự động từ Grade, sửa nếu cần)
            </Divider>
            <Row gutter={[8, 0]}>
              <Col xs={8} sm={4}>
                <Form.Item label="DRC min %" name="drc_min" style={{ marginBottom: 8 }}>
                  <InputNumber size="small" min={0} max={100} step={0.1} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col xs={8} sm={4}>
                <Form.Item label="DRC max %" name="drc_max" style={{ marginBottom: 8 }}>
                  <InputNumber size="small" min={0} max={100} step={0.1} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col xs={8} sm={4}>
                <Form.Item label="Moisture %" name="moisture_max" style={{ marginBottom: 8 }}>
                  <InputNumber size="small" min={0} max={10} step={0.01} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col xs={8} sm={4}>
                <Form.Item label="Dirt %" name="dirt_max" style={{ marginBottom: 8 }}>
                  <InputNumber size="small" min={0} max={1} step={0.001} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col xs={8} sm={4}>
                <Form.Item label="Ash %" name="ash_max" style={{ marginBottom: 8 }}>
                  <InputNumber size="small" min={0} max={5} step={0.01} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col xs={8} sm={4}>
                <Form.Item label="N₂ %" name="nitrogen_max" style={{ marginBottom: 8 }}>
                  <InputNumber size="small" min={0} max={2} step={0.01} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col xs={8} sm={4}>
                <Form.Item label="Volatile %" name="volatile_max" style={{ marginBottom: 8 }}>
                  <InputNumber size="small" min={0} max={5} step={0.01} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col xs={8} sm={4}>
                <Form.Item label="PRI min" name="pri_min" style={{ marginBottom: 8 }}>
                  <InputNumber size="small" min={0} max={100} step={1} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col xs={8} sm={4}>
                <Form.Item label="Mooney" name="mooney_max" style={{ marginBottom: 8 }}>
                  <InputNumber size="small" min={0} max={100} step={1} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col xs={8} sm={4}>
                <Form.Item label="Color" name="color_lovibond_max" style={{ marginBottom: 8 }}>
                  <InputNumber size="small" min={0} max={10} step={0.5} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
            </Row>
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
        <Button icon={<ArrowLeftOutlined />} onClick={() => {
          if (currentStep > 0) {
            prevStep()
          } else {
            navigate('/sales/orders')
          }
        }} />
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
