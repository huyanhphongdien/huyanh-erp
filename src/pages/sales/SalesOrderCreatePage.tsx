// ============================================================================
// SALES ORDER CREATE PAGE — Tạo đơn hàng bán quốc tế (Multi-step)
// File: src/pages/sales/SalesOrderCreatePage.tsx
// ============================================================================

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Card,
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
  Tabs,
  Collapse,
} from 'antd'
import {
  ArrowLeftOutlined,
  SaveOutlined,
  CheckCircleOutlined,
  DownloadOutlined,
  FileWordOutlined,
} from '@ant-design/icons'
import {
  downloadContract,
  deriveKind,
  DEFAULT_BANK,
  type ContractFormData,
} from '../../services/sales/contractGeneratorService'
import { salesContractWorkflowService } from '../../services/sales/salesContractWorkflowService'
import { salesCustomerService } from '../../services/sales/salesCustomerService'
import { salesOrderService, type CreateSalesOrderData } from '../../services/sales/salesOrderService'
import { rubberGradeService } from '../../services/wms/rubberGradeService'
import type { SalesCustomer } from '../../services/sales/salesTypes'
import type { RubberGradeStandard } from '../../services/wms/wms.types'
import {
  SVR_GRADE_OPTIONS,
  INCOTERM_LABELS,
  PAYMENT_TERMS_LABELS,
  PORT_OF_LOADING_OPTIONS,
  CUSTOMER_TIER_LABELS,
  CUSTOMER_TIER_COLORS,
  COUNTRY_OPTIONS,
} from '../../services/sales/salesTypes'

const { Title } = Typography
const { TextArea } = Input

// ============================================================================
// HELPERS — Amount → English words (cho PI section "Words: ...")
// ============================================================================

const _UNITS = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine']
const _TEENS = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
const _TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']
function _under1000(n: number): string {
  if (n === 0) return ''
  if (n < 10) return _UNITS[n]
  if (n < 20) return _TEENS[n - 10]
  if (n < 100) {
    const t = Math.floor(n / 10), u = n % 10
    return _TENS[t] + (u ? '-' + _UNITS[u] : '')
  }
  const h = Math.floor(n / 100), rest = n % 100
  return _UNITS[h] + ' Hundred' + (rest ? ' ' + _under1000(rest) : '')
}
function amountToWords(amount: number): string {
  if (!amount || amount <= 0) return ''
  const dollars = Math.floor(amount)
  const cents = Math.round((amount - dollars) * 100)
  let result = ''
  if (dollars >= 1_000_000) {
    const m = Math.floor(dollars / 1_000_000)
    result += _under1000(m) + ' Million'
    const rest = dollars % 1_000_000
    if (rest >= 1000) result += ' ' + _under1000(Math.floor(rest / 1000)) + ' Thousand'
    const last = rest % 1000
    if (last) result += ' ' + _under1000(last)
  } else if (dollars >= 1000) {
    result += _under1000(Math.floor(dollars / 1000)) + ' Thousand'
    const last = dollars % 1000
    if (last) result += ' ' + _under1000(last)
  } else {
    result += _under1000(dollars)
  }
  result += ' US Dollars'
  if (cents > 0) result += ' and ' + _under1000(cents) + ' Cents'
  result += ' Only'
  return result.trim().replace(/\s+/g, ' ')
}

// ============================================================================
// COMPONENT
// ============================================================================

function SalesOrderCreatePage() {
  const navigate = useNavigate()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [submittingReview, setSubmittingReview] = useState(false)
  const [docLoading, setDocLoading] = useState<'SC' | 'PI' | 'BOTH' | null>(null)
  const [previewTab, setPreviewTab] = useState<'SC' | 'PI'>('SC')

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

  // ── Watch fields cần cho live preview ──
  const watchContractNo = Form.useWatch('contract_no', form) || ''
  const watchContractDate = Form.useWatch('contract_date', form)
  const watchIncoterm = Form.useWatch('incoterm', form) || 'FOB'
  const watchPOL = Form.useWatch('port_of_loading', form) || ''
  const watchPOD = Form.useWatch('port_of_destination', form) || ''
  const watchShipmentTime = Form.useWatch('shipment_time', form) || ''
  const watchPaymentNote = Form.useWatch('payment_terms_note', form) || ''
  const watchPackingNote = Form.useWatch('packing_note', form) || ''

  // ── Điều kiện kèm theo (Sale chọn override default theo từng đơn) ──
  const watchPartial     = Form.useWatch('contract_partial', form) || 'Not Allowed'
  const watchTrans       = Form.useWatch('contract_trans', form) || 'Allowed'
  const watchClaimsDays  = Form.useWatch('contract_claims_days', form) || 20
  const watchArbitration = Form.useWatch('contract_arbitration', form) || 'SICOM Singapore'
  const watchFreightMark = Form.useWatch('contract_freight_mark', form) || ''
  const watchExtraTerms  = Form.useWatch('contract_extra_terms', form) || ''

  const totalBales = baleWeight > 0 ? Math.round((quantityTons * 1000) / baleWeight) : 0
  const balesPerContainer = containerType === '40ft' ? balesPerContInput * 2 : balesPerContInput
  const containerCount = balesPerContainer > 0 ? Math.ceil(totalBales / balesPerContainer) : 0
  const totalValueUSD = quantityTons * unitPrice
  // Ưu tiên USD/MT nếu có; nếu không thì dùng %
  const commissionAmt = commissionUsdPerMt > 0
    ? quantityTons * commissionUsdPerMt
    : totalValueUSD * (commissionPct / 100)

  // ── Build ContractFormData từ form state + items ──
  // Sale KHÔNG nhập bank info — gắn DEFAULT_BANK để preview, Phú LV sẽ override khi review.
  const contractData = useMemo<Partial<ContractFormData>>(() => {
    const firstItem = orderItems[0] || ({} as Partial<OrderItem>)
    const allGrades = orderItems
      .filter((i) => i.grade && i.quantity_tons > 0)
      .map((i) => i.grade)
    const isFOB = ['FOB', 'EXW'].includes((watchIncoterm || '').toUpperCase())
    return {
      contract_no: watchContractNo || '',
      contract_date: watchContractDate ? watchContractDate.format('DD MMM YYYY') : '',
      buyer_name: selectedCustomer?.name || '',
      buyer_address: selectedCustomer?.address || '',
      buyer_phone: selectedCustomer?.phone || '',
      grade: allGrades.length ? allGrades.join(' + ') : '',
      quantity: itemsTotalTons ? itemsTotalTons.toFixed(2) : '',
      unit_price: firstItem.unit_price
        ? firstItem.unit_price.toLocaleString('en-US')
        : '',
      amount: itemsTotalUSD
        ? itemsTotalUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : '',
      incoterm: watchIncoterm,
      pol: watchPOL,
      pod: isFOB ? '' : watchPOD,
      packing_desc: firstItem.packing_note || watchPackingNote
        || (() => {
          const kg = firstItem.bale_weight_kg || 35
          const pt = firstItem.packing_type || 'loose_bale'
          const map: Record<string, string> = {
            loose_bale: 'Loose bales packing',
            sw_pallet: 'SW Pallet packing',
            wooden_pallet: 'Wooden pallets (fumigated)',
            metal_box: 'Metal box packing',
          }
          const human = map[pt] || 'Loose bales packing'
          return `${kg} kg/bale, ${human}`
        })(),
      bales_total: itemsTotalBales ? itemsTotalBales.toLocaleString() : '',
      pallets_total: '',
      containers: String(itemsTotalContainers || ''),
      cont_type: containerType === '40ft' ? '40HC' : '20DC',
      shipment_time: watchShipmentTime,
      partial: watchPartial,
      trans: watchTrans,
      payment: (() => {
        // Ưu tiên textarea override (Sale tự gõ); nếu rỗng → aggregate quick picks
        // từ items (PAYMENT_TERMS_LABELS keys: LC_30, TT_100, CAD, DP, ...).
        if (watchPaymentNote && watchPaymentNote.trim()) return watchPaymentNote.trim()
        const ENUM_TO_EN: Record<string, string> = {
          LC_30: 'L/C 30 days', LC_60: 'L/C 60 days', LC_90: 'L/C 90 days',
          TT_10: 'T/T 10%', TT_30: 'T/T 30%', TT_60: 'T/T 60%', TT_100: 'T/T 100%',
          CAD: 'CAD', DP: 'D/P',
        }
        const aggregated = orderItems
          .flatMap((i) => (i.payment_terms || '').split(',').filter(Boolean))
          .filter((v, idx, arr) => arr.indexOf(v) === idx) // dedupe
          .map((v) => ENUM_TO_EN[v] || v)
        return aggregated.length > 0 ? aggregated.join(' + ') : 'LC at sight'
      })(),
      payment_extra: '',
      claims_days: String(watchClaimsDays),
      arbitration: watchArbitration,
      freight_mark: watchFreightMark || (isFOB ? 'freight Collect' : 'freight prepaid'),
      extra_terms: watchExtraTerms,
      // amount_words auto compute cho PI section "Words: ..."
      amount_words: itemsTotalUSD ? amountToWords(itemsTotalUSD) : '',
      ...DEFAULT_BANK,
    }
  }, [
    orderItems,
    selectedCustomer,
    watchContractNo,
    watchContractDate,
    watchIncoterm,
    watchPOL,
    watchPOD,
    watchShipmentTime,
    watchPaymentNote,
    watchPackingNote,
    watchPartial,
    watchTrans,
    watchClaimsDays,
    watchArbitration,
    watchFreightMark,
    watchExtraTerms,
    itemsTotalTons,
    itemsTotalUSD,
    itemsTotalBales,
    itemsTotalContainers,
    containerType,
  ])

  // ── Sinh HĐ .docx ──
  const handleDownloadDoc = async (type: 'SC' | 'PI' | 'BOTH') => {
    if (!contractData.contract_no) {
      message.error('Cần nhập "Số hợp đồng" trước khi sinh HĐ')
      return
    }
    if (!contractData.buyer_name) {
      message.error('Cần chọn khách hàng trước khi sinh HĐ')
      return
    }
    setDocLoading(type)
    try {
      if (type === 'BOTH') {
        await downloadContract(deriveKind(contractData.incoterm || 'FOB', 'SC'), contractData, `${contractData.contract_no}_SC.docx`)
        await downloadContract(deriveKind(contractData.incoterm || 'FOB', 'PI'), contractData, `${contractData.contract_no}_PI.docx`)
        message.success(`Đã sinh SC + PI cho ${contractData.contract_no}`)
      } else {
        const kind = deriveKind(contractData.incoterm || 'FOB', type)
        await downloadContract(kind, contractData, `${contractData.contract_no}_${type}.docx`)
        message.success(`Đã sinh ${type} (${kind})`)
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      message.error(`Sinh ${type} thất bại: ${msg}`)
    } finally {
      setDocLoading(null)
    }
  }

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

  // ── Submit cho Phú LV review ──
  // 1. Validate + lưu sales_order (status='draft')
  // 2. Tạo sales_order_contracts (status='reviewing', reviewer=Phú LV)
  // 3. Navigate về danh sách
  const handleSubmitForReview = async () => {
    if (!contractData.contract_no) {
      message.error('Cần nhập "Số hợp đồng" trước khi trình kiểm tra')
      return
    }
    if (!contractData.buyer_name) {
      message.error('Cần chọn khách hàng trước khi trình kiểm tra')
      return
    }
    try {
      const values = await form.validateFields()
      setSubmittingReview(true)

      // Check trùng số HĐ
      const isTaken = await salesContractWorkflowService.isContractNoTaken(
        contractData.contract_no,
      )
      if (isTaken) {
        message.error(
          `Số HĐ "${contractData.contract_no}" đã tồn tại — vui lòng chọn số khác`,
        )
        setSubmittingReview(false)
        return
      }

      const validItems = orderItems.filter(
        (i) => i.grade && i.quantity_tons > 0 && i.unit_price > 0,
      )
      if (validItems.length === 0) {
        message.error('Vui lòng thêm ít nhất 1 sản phẩm')
        setSubmittingReview(false)
        return
      }

      // Build payload tương tự handleSubmit
      const itemPackingNotes = validItems
        .map((i) => (i.packing_note || '').trim())
        .filter(Boolean)
      const aggregatedPackingNote =
        validItems.length === 1
          ? itemPackingNotes[0] || undefined
          : itemPackingNotes.length
            ? validItems
                .filter((i) => (i.packing_note || '').trim())
                .map((i) => `${i.grade}: ${i.packing_note}`)
                .join('\n')
            : undefined

      const payload: CreateSalesOrderData = {
        ...values,
        grade:
          validItems.length === 1
            ? validItems[0].grade
            : validItems.map((i) => i.grade).join(' + '),
        quantity_tons: itemsTotalTons,
        unit_price:
          validItems.length === 1
            ? validItems[0].unit_price
            : Math.round((itemsTotalUSD / itemsTotalTons) * 100) / 100,
        bale_weight_kg: validItems[0].bale_weight_kg,
        bales_per_container: validItems[0].bales_per_container,
        packing_type: validItems[0].packing_type as never,
        packing_note: values.packing_note || aggregatedPackingNote,
        delivery_date: values.delivery_date
          ? values.delivery_date.format('YYYY-MM-DD')
          : undefined,
        contract_date: values.contract_date
          ? values.contract_date.format('YYYY-MM-DD')
          : undefined,
        etd: values.etd ? values.etd.format('YYYY-MM-DD') : undefined,
        eta: values.eta ? values.eta.format('YYYY-MM-DD') : undefined,
        lc_expiry_date: values.lc_expiry_date
          ? values.lc_expiry_date.format('YYYY-MM-DD')
          : undefined,
        commission_amount: values.commission_usd_per_mt
          ? itemsTotalTons * values.commission_usd_per_mt
          : values.commission_pct
            ? itemsTotalUSD * (values.commission_pct / 100)
            : undefined,
        items: validItems,
      }

      // 1) Tạo sales_order
      const created = await salesOrderService.create(payload)
      if (!created?.id) throw new Error('Tạo sales_order thất bại')

      // 2) Tạo contract draft + submit reviewing
      await salesContractWorkflowService.createDraftAndSubmit(created.id, contractData)

      message.success(
        `Đã trình HĐ ${contractData.contract_no} cho Phú LV (Kiểm tra) duyệt`,
      )
      navigate('/sales/orders')
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'errorFields' in err) return // form validation
      console.error(err)
      const errMsg = err instanceof Error ? err.message : 'Không thể trình kiểm tra'
      message.error(errMsg)
    } finally {
      setSubmittingReview(false)
    }
  }

  // ══════════════════════════════════════════════════════════════
  // STEP CONTENT
  // ══════════════════════════════════════════════════════════════

  const renderStep1 = () => (
    <Row gutter={20}>
      <Col xs={24} lg={14}>
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

        {/* ═══ Điều khoản ═══ */}
        {/* Bank info (Ngân hàng / Số TK / SWIFT) chuyển sang bước "Kiểm tra" — Phú LV nhập per-order */}
        <Card size="small" style={{ marginBottom: 16, borderRadius: 12 }}
          title={<span style={{ fontSize: 14, fontWeight: 600 }}>Điều khoản (Bank info do Kiểm tra nhập)</span>}>
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
        </Card>

        {/* ═══ Điều kiện kèm theo trên HĐ (mục 3, 4, 6, 8 của template SC) ═══ */}
        <Card size="small" style={{ marginBottom: 16, borderRadius: 12 }}
          title={<Space size={6}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>📑 Điều kiện kèm theo</span>
            <Tag color="orange" style={{ fontSize: 10 }}>Mặc định OK · sửa khi đặc thù KH</Tag>
          </Space>}>
          <Row gutter={16}>
            <Col xs={24} sm={12} md={6}>
              <Form.Item label="Partial shipment" name="contract_partial" initialValue="Not Allowed"
                tooltip="Cho phép giao nhiều đợt? Mặc định KHÔNG.">
                <Select size="large" options={[
                  { value: 'Not Allowed', label: 'Not Allowed' },
                  { value: 'Allowed', label: 'Allowed' },
                ]} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Form.Item label="Transshipment" name="contract_trans" initialValue="Allowed"
                tooltip="Cho phép chuyển tàu giữa đường? Mặc định YES.">
                <Select size="large" options={[
                  { value: 'Allowed', label: 'Allowed' },
                  { value: 'Not Allowed', label: 'Not Allowed' },
                ]} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Form.Item label="Claims period (ngày)" name="contract_claims_days" initialValue={20}
                tooltip="Số ngày KH được khiếu nại sau khi nhận hàng. Default 20.">
                <InputNumber min={1} max={90} step={5} size="large" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Form.Item label="Arbitration" name="contract_arbitration" initialValue="SICOM Singapore"
                tooltip="Tòa trọng tài giải quyết tranh chấp.">
                <Select size="large" showSearch options={[
                  { value: 'SICOM Singapore', label: 'SICOM Singapore' },
                  { value: 'LCIA London', label: 'LCIA London' },
                  { value: 'VIAC Vietnam', label: 'VIAC Vietnam' },
                  { value: 'ICC Paris', label: 'ICC Paris' },
                  { value: 'HKIAC Hong Kong', label: 'HKIAC Hong Kong' },
                ]} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item label="Freight mark trên B/L" name="contract_freight_mark"
                tooltip="Auto theo Incoterm: CIF/CFR → 'freight prepaid' (HA trả); FOB → 'freight Collect' (KH trả).">
                <Input size="large" placeholder="Auto theo Incoterm — sửa nếu thoả thuận khác" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item label="Amount in words" tooltip="Auto compute từ Tổng USD cho PI section 'Words:'. Sale không cần sửa.">
                <Input size="large" disabled value={contractData.amount_words || '(sẽ tự sinh khi có giá trị USD)'}
                  style={{ background: '#fafafa', fontStyle: 'italic', color: '#595959' }} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col xs={24}>
              <Form.Item
                label={
                  <Space size={6}>
                    <span>📌 Điều khoản bổ sung khác</span>
                    <Tag color="blue" style={{ fontSize: 10 }}>Tối đa 300 ký tự</Tag>
                  </Space>
                }
                name="contract_extra_terms"
                tooltip="Các clause đặc thù của KH mà không lường trước được khi thiết kế form. VD: 'Giảm 2% nếu giao trước 15/6', 'KH lo phí fumigation', 'Bao bì in logo riêng theo file đính kèm', 'Trả lại pallet khi rỗng'... Phú LV + Trung/Huy đều thấy ở bước review."
                rules={[{ max: 300, message: 'Tối đa 300 ký tự' }]}
              >
                <TextArea
                  rows={3}
                  showCount
                  maxLength={300}
                  placeholder="VD: KH yêu cầu fumigation trước khi shipping · Giảm 2% nếu giao trước 15/6 · Bao bì in logo riêng theo file đính kèm..."
                />
              </Form.Item>
            </Col>
          </Row>
          <div style={{ fontSize: 11, color: '#999', marginTop: 4, padding: '6px 8px',
                        background: '#fff7e6', borderRadius: 6, borderLeft: '3px solid #d46b08' }}>
            ⚠️ <strong>Force Majeure</strong> và <strong>Legal Responsibility</strong> đã được template HĐ hard-code (theo Incoterm CIF vs FOB) — KHÔNG cần Sale chỉnh.
          </div>
        </Card>

        {/* ═══ Chỉ tiêu kỹ thuật + Ghi chú (collapsible) ═══ */}
        <Collapse
          ghost
          style={{ marginBottom: 16 }}
          items={[
            {
              key: 'quality',
              label: <span style={{ fontSize: 13, fontWeight: 600 }}>📊 Chỉ tiêu kỹ thuật (mở rộng để sửa)</span>,
              children: (
                <Row gutter={[12, 4]}>
                  <Col xs={12} sm={6}><Form.Item label="DRC min %" name="drc_min" style={{ marginBottom: 8 }}><InputNumber size="middle" min={0} max={100} step={0.1} style={{ width: '100%' }} /></Form.Item></Col>
                  <Col xs={12} sm={6}><Form.Item label="DRC max %" name="drc_max" style={{ marginBottom: 8 }}><InputNumber size="middle" min={0} max={100} step={0.1} style={{ width: '100%' }} /></Form.Item></Col>
                  <Col xs={12} sm={6}><Form.Item label="Moisture %" name="moisture_max" style={{ marginBottom: 8 }}><InputNumber size="middle" min={0} max={10} step={0.01} style={{ width: '100%' }} /></Form.Item></Col>
                  <Col xs={12} sm={6}><Form.Item label="Dirt %" name="dirt_max" style={{ marginBottom: 8 }}><InputNumber size="middle" min={0} max={1} step={0.001} style={{ width: '100%' }} /></Form.Item></Col>
                  <Col xs={12} sm={6}><Form.Item label="Ash %" name="ash_max" style={{ marginBottom: 8 }}><InputNumber size="middle" min={0} max={5} step={0.01} style={{ width: '100%' }} /></Form.Item></Col>
                  <Col xs={12} sm={6}><Form.Item label="N₂ %" name="nitrogen_max" style={{ marginBottom: 8 }}><InputNumber size="middle" min={0} max={2} step={0.01} style={{ width: '100%' }} /></Form.Item></Col>
                  <Col xs={12} sm={6}><Form.Item label="Volatile %" name="volatile_max" style={{ marginBottom: 8 }}><InputNumber size="middle" min={0} max={5} step={0.01} style={{ width: '100%' }} /></Form.Item></Col>
                  <Col xs={12} sm={6}><Form.Item label="PRI min" name="pri_min" style={{ marginBottom: 8 }}><InputNumber size="middle" min={0} max={100} step={1} style={{ width: '100%' }} /></Form.Item></Col>
                  <Col xs={12} sm={6}><Form.Item label="Mooney" name="mooney_max" style={{ marginBottom: 8 }}><InputNumber size="middle" min={0} max={100} step={1} style={{ width: '100%' }} /></Form.Item></Col>
                  <Col xs={12} sm={6}><Form.Item label="Color" name="color_lovibond_max" style={{ marginBottom: 8 }}><InputNumber size="middle" min={0} max={10} step={0.5} style={{ width: '100%' }} /></Form.Item></Col>
                </Row>
              ),
            },
            {
              key: 'notes',
              label: <span style={{ fontSize: 13, fontWeight: 600 }}>📝 Ghi chú đơn hàng</span>,
              children: (
                <Form.Item name="notes" style={{ marginBottom: 0 }}>
                  <TextArea rows={4} placeholder="Ghi chú nội bộ cho đơn hàng..." />
                </Form.Item>
              ),
            },
          ]}
        />
      </Col>

      <Col xs={24} lg={10}>
        <div style={{ position: 'sticky', top: 16 }}>
        {/* ═══ Thông tin khách hàng ═══ */}
        {selectedCustomer && (
          <Card size="small" style={{ marginBottom: 12, borderRadius: 12, background: '#fafffe', borderColor: '#d9f7e8' }}
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

        {/* ═══ Live Preview HĐ (SC + PI) ═══ */}
        <Card
          size="small"
          style={{ marginTop: 12, borderRadius: 12 }}
          title={
            <Space size={6}>
              <FileWordOutlined style={{ color: '#1B4D3E' }} />
              <span style={{ fontSize: 13, fontWeight: 600 }}>Hợp đồng (Live Preview)</span>
              <Tag color={deriveKind(contractData.incoterm || 'FOB', 'SC') === 'SC_CIF' ? 'blue' : 'green'} style={{ fontSize: 10 }}>
                {deriveKind(contractData.incoterm || 'FOB', 'SC').replace('_', ' ')}
              </Tag>
            </Space>
          }
          extra={
            <Tabs
              size="small"
              activeKey={previewTab}
              onChange={(k) => setPreviewTab(k as 'SC' | 'PI')}
              items={[
                { key: 'SC', label: 'SC' },
                { key: 'PI', label: 'PI' },
              ]}
              tabBarStyle={{ marginBottom: 0 }}
            />
          }
        >
          <div style={{
            maxHeight: 420,
            overflowY: 'auto',
            background: '#fff',
            padding: 12,
            border: '1px solid #f0f0f0',
            borderRadius: 6,
          }}>
            {previewTab === 'SC' ? <PreviewSC /> : <PreviewPI />}
          </div>

          {/* Nút sinh .docx */}
          <Space.Compact block style={{ marginTop: 12 }}>
            <Button
              icon={<DownloadOutlined />}
              loading={docLoading === 'SC'}
              onClick={() => handleDownloadDoc('SC')}
              style={{ flex: 1 }}
            >
              Tải SC
            </Button>
            <Button
              icon={<DownloadOutlined />}
              loading={docLoading === 'PI'}
              onClick={() => handleDownloadDoc('PI')}
              style={{ flex: 1 }}
            >
              Tải PI
            </Button>
            <Button
              type="primary"
              icon={<DownloadOutlined />}
              loading={docLoading === 'BOTH'}
              onClick={() => handleDownloadDoc('BOTH')}
              style={{ flex: 1.2, background: '#1B4D3E' }}
            >
              Tải SC + PI
            </Button>
          </Space.Compact>
        </Card>

        {/* ═══ Action buttons ═══ */}
        <Card size="small" style={{ marginTop: 12, borderRadius: 12 }}>
          <Space direction="vertical" style={{ width: '100%' }}>
            <Button
              type="default"
              icon={<SaveOutlined />}
              block
              size="large"
              loading={loading}
              disabled={submittingReview}
              onClick={() => handleSubmit(true)}
            >
              Lưu nháp (chưa trình)
            </Button>
            <Button
              type="primary"
              icon={<CheckCircleOutlined />}
              block
              size="large"
              loading={submittingReview}
              disabled={loading}
              onClick={handleSubmitForReview}
              style={{ background: '#1B4D3E' }}
            >
              Trình Kiểm tra (Phú LV)
            </Button>
            <div style={{ fontSize: 11, color: '#999', textAlign: 'center', marginTop: 4 }}>
              Phú LV nhập bank info → trình Trung/Huy ký
            </div>
          </Space>
        </Card>
        </div>
      </Col>
    </Row>
  )

  // ── Live preview HTML (mirror cấu trúc 4 template .docx) ──
  const PreviewSC = () => (
    <div style={{ fontFamily: 'Georgia, serif', fontSize: 11, lineHeight: 1.5, color: '#333' }}>
      <div style={{ textAlign: 'center', fontWeight: 700, fontSize: 14, marginBottom: 8 }}>
        SALES CONTRACT
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <span>No.: <strong>{contractData.contract_no || '—'}</strong></span>
        <span>Date: <strong>{contractData.contract_date || '—'}</strong></span>
      </div>
      <div style={{ marginBottom: 6 }}><strong>THE SELLER:</strong> HUY ANH RUBBER COMPANY LIMITED</div>
      <div style={{ marginBottom: 6 }}><strong>THE BUYER:</strong> {contractData.buyer_name || '—'}</div>
      <div style={{ marginBottom: 10, color: '#666' }}>ADDRESS: {contractData.buyer_address || '—'}</div>
      <div style={{ background: '#f5f5f5', padding: 6, marginBottom: 8, fontSize: 10 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #ccc' }}>
              <th style={{ textAlign: 'left' }}>COMMODITY</th>
              <th style={{ textAlign: 'right' }}>QTY (MTs)</th>
              <th style={{ textAlign: 'right' }}>{contractData.incoterm} {contractData.pod ? `– ${contractData.pod}` : contractData.pol} (USD/MT)</th>
              <th style={{ textAlign: 'right' }}>AMOUNT (USD)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>NATURAL RUBBER {contractData.grade || '—'}</td>
              <td style={{ textAlign: 'right' }}>{contractData.quantity || '—'}</td>
              <td style={{ textAlign: 'right' }}>{contractData.unit_price || '—'}</td>
              <td style={{ textAlign: 'right' }}>{contractData.amount || '—'}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div style={{ marginBottom: 4 }}><strong>Packing:</strong> {contractData.bales_total} bales / {contractData.containers} x {contractData.cont_type}</div>
      <div style={{ marginBottom: 4 }}><strong>Shipment:</strong></div>
      <div style={{ paddingLeft: 12, marginBottom: 4 }}>- Port of loading: {contractData.pol || '—'}</div>
      {contractData.pod && <div style={{ paddingLeft: 12, marginBottom: 4 }}>- Port of discharge: {contractData.pod}</div>}
      <div style={{ paddingLeft: 12, marginBottom: 4 }}>- Time of shipment: {contractData.shipment_time || '—'}</div>
      <div style={{ paddingLeft: 12, marginBottom: 8 }}>- Partial: {contractData.partial} / Transshipment: {contractData.trans}</div>
      <div style={{ marginBottom: 4 }}><strong>Term of payment:</strong> {contractData.payment || '—'}</div>
      <Divider style={{ margin: '8px 0', borderColor: '#e0e0e0' }} />
      <div style={{ background: '#fff7e6', padding: 6, marginBottom: 6, fontSize: 10, color: '#d48806' }}>
        <strong>Ben's Bank detail (do Phú LV nhập khi review):</strong><br />
        ACCOUNT NAME: {contractData.bank_account_name}<br />
        ACCOUNT NO: {contractData.bank_account_no}<br />
        BANK: {contractData.bank_full_name}<br />
        SWIFT: {contractData.bank_swift}
      </div>
      <div style={{ marginBottom: 4 }}><strong>Documents:</strong> 3/3 Original B/L marked {contractData.freight_mark}, Commercial Invoice, Packing List, C/O, Test Cert, Phytosanitary{contractData.pod ? ', Insurance Cert' : ''}</div>
      <div style={{ marginBottom: 4 }}><strong>Claims:</strong> within {contractData.claims_days} days of receipt</div>
      <div style={{ marginBottom: 4 }}><strong>Arbitration:</strong> {contractData.arbitration}</div>
      {contractData.extra_terms && (
        <div style={{
          marginTop: 8, padding: 8, background: '#e6f4ff',
          border: '1px solid #91caff', borderRadius: 6, fontSize: 10,
        }}>
          <strong style={{ color: '#1677ff' }}>Other Conditions:</strong>{' '}
          <span style={{ whiteSpace: 'pre-wrap' }}>{contractData.extra_terms}</span>
        </div>
      )}
    </div>
  )

  const PreviewPI = () => (
    <div style={{ fontFamily: 'Georgia, serif', fontSize: 11, lineHeight: 1.5, color: '#333' }}>
      <div style={{ textAlign: 'center', fontWeight: 700, fontSize: 14, marginBottom: 8 }}>
        PROFORMA INVOICE
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <span>No: <strong>{contractData.contract_no || '—'}/PR.CI</strong></span>
        <span>Date: <strong>{contractData.contract_date || '—'}</strong></span>
      </div>
      <div style={{ marginBottom: 6 }}><strong>THE SELLER:</strong> HUY ANH RUBBER COMPANY LIMITED</div>
      <div style={{ marginBottom: 6 }}><strong>THE BUYER:</strong> {contractData.buyer_name || '—'}</div>
      <div style={{ marginBottom: 10, color: '#666' }}>ADDRESS: {contractData.buyer_address || '—'}</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8, fontSize: 10 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #ccc' }}>
            <th style={{ textAlign: 'left' }}># Cont</th>
            <th style={{ textAlign: 'left' }}>Description of Goods</th>
            <th style={{ textAlign: 'right' }}>Qty (MTs)</th>
            <th style={{ textAlign: 'right' }}>Unit Price (USD/MT)</th>
            <th style={{ textAlign: 'right' }}>Total (USD)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{contractData.containers} x {contractData.cont_type}</td>
            <td>NATURAL RUBBER {contractData.grade || '—'} ({contractData.packing_desc || '—'})</td>
            <td style={{ textAlign: 'right' }}>{contractData.quantity || '—'}</td>
            <td style={{ textAlign: 'right' }}>{contractData.unit_price || '—'}</td>
            <td style={{ textAlign: 'right' }}>{contractData.amount || '—'}</td>
          </tr>
        </tbody>
      </table>
      <div style={{ marginBottom: 6, fontStyle: 'italic', color: '#888' }}>
        Words: <span style={{ color: '#aaa' }}>(amount in words — fill khi sinh .docx)</span>
      </div>
      <div style={{ marginBottom: 4 }}><strong>Payment:</strong> {contractData.payment || '—'}</div>
      {contractData.extra_terms && (
        <div style={{
          marginTop: 6, padding: 8, background: '#e6f4ff',
          border: '1px solid #91caff', borderRadius: 6, fontSize: 10,
        }}>
          <strong style={{ color: '#1677ff' }}>Other Conditions:</strong>{' '}
          <span style={{ whiteSpace: 'pre-wrap' }}>{contractData.extra_terms}</span>
        </div>
      )}
      <div style={{ background: '#fff7e6', padding: 6, marginTop: 6, fontSize: 10, color: '#d48806' }}>
        <strong>Ben's Bank detail (Phú LV nhập):</strong><br />
        ACCOUNT: {contractData.bank_account_name} — {contractData.bank_account_no}<br />
        SWIFT: {contractData.bank_swift}
      </div>
    </div>
  )

  // ══════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════

  return (
    <div style={{ padding: '16px 24px', maxWidth: 1600, margin: '0 auto' }}>
      {/* Breadcrumb */}
      <Breadcrumb
        style={{ marginBottom: 12 }}
        items={[
          { title: 'Đơn hàng bán' },
          {
            title: <a onClick={() => navigate('/sales/orders')}>Danh sách</a>,
          },
          { title: 'Tạo mới' },
        ]}
      />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/sales/orders')} />
        <Title level={4} style={{ margin: 0 }}>
          Tạo đơn hàng bán
        </Title>
        <Tag color="orange" style={{ marginLeft: 8 }}>BP Sale nhập</Tag>
        <span style={{ marginLeft: 'auto', color: '#999', fontSize: 12 }}>
          Form trái — Live preview HĐ bên phải · Bank info do Phú LV (Kiểm tra) nhập
        </span>
      </div>

      {/* Form single-page (Compose Studio) */}
      <Form form={form} layout="vertical" requiredMark preserve>
        {renderStep1()}
      </Form>
    </div>
  )
}

export default SalesOrderCreatePage
