// ============================================================================
// SALES ORDER CREATE PAGE — Tạo đơn hàng bán quốc tế (Multi-step)
// File: src/pages/sales/SalesOrderCreatePage.tsx
// ============================================================================

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
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
  Alert,
  Checkbox,
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
  amountToWords,
  formatContractDate,
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

// amountToWords moved to contractGeneratorService — share giữa Compose Studio
// và buildFormDataFromOrder để tránh drift logic.

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
    bale_weight_kg: number  // legacy single, = bale_weights_kg[0]
    bale_weights_kg: number[]  // multi (1-2 phần tử). Multi → "linh động"
    bales_per_container: number
    packing_type: string
    packing_note: string
    payment_terms: string
  }
  const [orderItems, setOrderItems] = useState<OrderItem[]>([
    { key: '1', grade: '', quantity_tons: 0, unit_price: 0, bale_weight_kg: 35, bale_weights_kg: [35], bales_per_container: 576, packing_type: 'loose_bale', packing_note: '', payment_terms: '' },
  ])

  const addItem = () => {
    setOrderItems(prev => [...prev, { key: String(Date.now()), grade: '', quantity_tons: 0, unit_price: 0, bale_weight_kg: 35, bale_weights_kg: [35], bales_per_container: 576, packing_type: 'loose_bale', packing_note: '', payment_terms: '' }])
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
  // Linh động flag: bất kỳ item nào check ≥ 2 KG/bành → tổng "linh động"
  const hasFlexibleBaleWeight = orderItems.some(
    (i) => (i.bale_weights_kg && i.bale_weights_kg.length > 1),
  )
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
      contract_date: watchContractDate ? formatContractDate(watchContractDate.toDate()) : '',
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
      packing_type: firstItem.packing_type || 'loose_bale',
      packing_desc: firstItem.packing_note || watchPackingNote
        || (() => {
          const kg = firstItem.bale_weight_kg || 35
          const pt = firstItem.packing_type || 'loose_bale'
          const map: Record<string, string> = {
            loose_bale: 'Loose bales packing',
            sw_pallet: 'SW Pallet packing',
            wooden_pallet: 'Wooden pallets (fumigated)',
            plastic_pallet: 'Plastic pallets',
            metal_box: 'Metal box packing',
          }
          const human = map[pt] || 'Loose bales packing'
          return `${kg} kg/bale, ${human}`
        })(),
      bales_total: itemsTotalBales ? itemsTotalBales.toLocaleString('en-US') : '',
      // pallets_total: chỉ tính khi packing dùng pallet (wooden_pallet/sw_pallet/plastic_pallet),
      // standard 36 bales/pallet (16 pallets x 36 = 576 bales/20DC). Khác thì để rỗng.
      pallets_total: (() => {
        const pt = firstItem.packing_type || ''
        if (!['wooden_pallet', 'sw_pallet', 'plastic_pallet'].includes(pt)) return ''
        const balesPerPallet = 36
        return itemsTotalBales > 0 ? String(Math.ceil(itemsTotalBales / balesPerPallet)) : ''
      })(),
      containers: String(itemsTotalContainers || ''),
      cont_type: containerType === '40ft' ? '40HC' : '20DC',
      shipment_time: watchShipmentTime,
      partial: watchPartial,
      trans: watchTrans,
      payment: (() => {
        // Ưu tiên textarea override "Ghi chú thanh toán" cấp đơn (nếu Sale gõ).
        // Nếu rỗng → lấy payment_terms ở item đầu tiên (Sale tự nhập text).
        // Fallback cuối: "LC at sight".
        if (watchPaymentNote && watchPaymentNote.trim()) return watchPaymentNote.trim()
        const itemPayment = firstItem.payment_terms?.trim()
        if (itemPayment) return itemPayment
        return 'LC at sight'
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
    // Số HĐ KHÔNG bắt buộc — Phú LV điền khi duyệt. Chỉ cần có khách hàng.
    if (!contractData.buyer_name) {
      message.error('Hãy chọn Khách hàng trước khi tải HĐ')
      return
    }
    const noLabel = contractData.contract_no || 'HD-moi'
    setDocLoading(type)
    try {
      if (type === 'BOTH') {
        await downloadContract(deriveKind(contractData.incoterm || 'FOB', 'SC'), contractData, `${noLabel}_SC.docx`)
        await downloadContract(deriveKind(contractData.incoterm || 'FOB', 'PI'), contractData, `${noLabel}_PI.docx`)
        message.success('Đã tải HĐ máy điền sẵn (SC + PI) — Số HĐ để Phú LV điền khi duyệt')
      } else {
        const kind = deriveKind(contractData.incoterm || 'FOB', type)
        await downloadContract(kind, contractData, `${noLabel}_${type}.docx`)
        message.success(`Đã tải ${type} (${kind})`)
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      message.error(`Sinh ${type} thất bại: ${msg}`)
    } finally {
      setDocLoading(null)
    }
  }

  // ── Customer selection ──
  // Phase 1: khi chọn KH → fetch đơn gần nhất → prefill Incoterm/POL/POD/Packing/Payment
  // từ đơn cũ. Nếu chưa có đơn nào với KH này → dùng customer default (FOB/USD).
  const handleCustomerChange = useCallback(
    async (customerId: string) => {
      const cust = customers.find((c) => c.id === customerId) || null
      setSelectedCustomer(cust)
      if (!cust) return

      // Set ngay defaults từ customer profile (instant feedback)
      form.setFieldsValue({
        incoterm: cust.default_incoterm || 'FOB',
        currency: cust.default_currency || 'USD',
        payment_terms: cust.payment_terms || undefined,
      })

      // Fetch last order của KH này để prefill smart defaults
      try {
        const orders = await salesOrderService.getByCustomer(customerId)
        const last = orders[0]  // order_date DESC nên [0] là đơn mới nhất
        if (!last) return
        // Prefill Logistics + Packing từ last order (cho phép Sale override)
        form.setFieldsValue({
          incoterm: last.incoterm || cust.default_incoterm || 'FOB',
          port_of_loading: last.port_of_loading || form.getFieldValue('port_of_loading') || 'DA_NANG',
          port_of_destination: last.port_of_destination || undefined,
        })
        // Prefill first item nếu Sale chưa fill (chỉ khi item state vẫn default)
        setOrderItems((prev) => {
          const firstItem = prev[0]
          if (!firstItem || firstItem.grade || firstItem.quantity_tons > 0) return prev
          return prev.map((it, i) =>
            i === 0
              ? {
                  ...it,
                  grade: last.grade || '',
                  bale_weight_kg: last.bale_weight_kg || 35,
                  bale_weights_kg: [last.bale_weight_kg || 35],
                  bales_per_container: last.bales_per_container || 576,
                  packing_type: last.packing_type || 'loose_bale',
                  payment_terms: last.payment_terms || '',
                }
              : it,
          )
        })
        message.success(`Đã prefill từ đơn gần nhất ${last.code} của ${cust.short_name || cust.name}`, 2)
      } catch (e) {
        // Không block — chỉ là helper
        console.warn('[CreatePage] prefill from last order fail:', e)
      }
    },
    [customers, form],
  )

  // ── Submit ──
  const handleSubmit = async (
    asDraft: boolean,
    opts?: { silent?: boolean },
  ): Promise<{ id: string } | null> => {
    try {
      const values = await form.validateFields()
      setLoading(true)

      // Validate items
      const validItems = orderItems.filter(i => i.grade && i.quantity_tons > 0 && i.unit_price > 0)
      if (validItems.length === 0) {
        message.error('Vui lòng thêm ít nhất 1 sản phẩm')
        setLoading(false)
        return null
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

      // silent mode: caller xử lý message + navigate (vd: upload flow cần SO trước)
      if (!opts?.silent) {
        message.success(asDraft ? 'Đã lưu nháp đơn hàng' : 'Đã xác nhận đơn hàng')
        navigate('/sales/orders')
      }
      return created?.id ? { id: created.id } : null
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'errorFields' in err) return null // form validation
      console.error(err)
      const errMsg = err instanceof Error ? err.message : 'Không thể tạo đơn hàng'
      message.error(errMsg)
      return null
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
            <Col xs={24}>
              <Form.Item label="Khách hàng (Buyer)" name="customer_id" rules={[{ required: true, message: 'Chọn buyer' }]}>
                <Select showSearch placeholder="Chọn khách hàng..." optionFilterProp="label" onChange={handleCustomerChange} size="large"
                  options={customers.map((c) => ({ value: c.id, label: `${c.code} — ${c.name}${c.country ? ` (${c.country})` : ''}` }))} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col xs={24} sm={8}>
              <Form.Item
                label="Số HĐ (tuỳ chọn)"
                name="contract_no"
                tooltip="Docs có thể bỏ trống — Phú LV sẽ điền số HĐ chính thức vào file Word + cập nhật khi duyệt"
              >
                <Input placeholder="Phú sẽ điền — có thể bỏ trống" size="large" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item label="Ngày HĐ" name="contract_date">
                <DatePicker style={{ width: '100%' }} size="large" format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item label="PO# khách hàng (tuỳ chọn)" name="customer_po">
                <Input placeholder="Số PO" size="large" />
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
                <Col xs={24} sm={6}>
                  <div style={{ fontSize: 11, color: '#999', marginBottom: 2 }}>
                    <span style={{ color: '#ff4d4f' }}>*</span> Grade
                  </div>
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
                  <div style={{ fontSize: 11, color: '#999', marginBottom: 2 }}>
                    <span style={{ color: '#ff4d4f' }}>*</span> Tấn
                  </div>
                  <InputNumber value={item.quantity_tons || undefined} min={0.01} step={1} style={{ width: '100%' }} placeholder="725"
                    onChange={(v) => updateItem(item.key, 'quantity_tons', v || 0)} />
                </Col>
                <Col xs={12} sm={4}>
                  <div style={{ fontSize: 11, color: '#999', marginBottom: 2 }}>
                    <span style={{ color: '#ff4d4f' }}>*</span> $/tấn
                  </div>
                  <InputNumber value={item.unit_price || undefined} min={0} step={10} style={{ width: '100%' }} placeholder="1,924"
                    onChange={(v) => updateItem(item.key, 'unit_price', v || 0)} />
                </Col>
                <Col xs={12} sm={5}>
                  <div style={{ fontSize: 11, color: '#999', marginBottom: 2 }}>
                    KG/bành <span style={{ color: '#bfbfbf' }}>(check 1 hoặc 2)</span>
                  </div>
                  <Checkbox.Group
                    value={item.bale_weights_kg || [item.bale_weight_kg || 35]}
                    options={[
                      { value: 33.33, label: '33.33' },
                      { value: 35, label: '35' },
                    ]}
                    onChange={(arr) => {
                      // Min 1 giá trị — nếu user uncheck cả 2, ép giữ 35
                      const next = (arr as number[]).length === 0 ? [35] : (arr as number[]).slice(0, 2)
                      const primary = next[0]
                      updateItem(item.key, 'bale_weights_kg', next)
                      updateItem(item.key, 'bale_weight_kg', primary)
                    }}
                  />
                </Col>
                <Col xs={12} sm={5}>
                  <div style={{ fontSize: 11, color: '#999', marginBottom: 2 }}>Bành/cont</div>
                  <InputNumber value={item.bales_per_container} min={1} style={{ width: '100%' }}
                    onChange={(v) => updateItem(item.key, 'bales_per_container', v || 576)} />
                </Col>
                <Col xs={24} sm={8}>
                  <div style={{ fontSize: 11, color: '#999', marginBottom: 2, marginTop: 4 }}>Đóng gói</div>
                  <Select value={item.packing_type} style={{ width: '100%' }}
                    popupMatchSelectWidth={false}
                    options={[
                      { value: 'loose_bale', label: 'Loose Bale' },
                      { value: 'sw_pallet', label: 'SW Pallet' },
                      { value: 'wooden_pallet', label: 'Wooden Pallet' },
                      { value: 'plastic_pallet', label: 'Plastic Pallet' },
                      { value: 'metal_box', label: 'Metal Box' },
                    ]}
                    onChange={(v) => updateItem(item.key, 'packing_type', v)} />
                </Col>
                <Col xs={24} sm={16}>
                  <div style={{ fontSize: 11, color: '#999', marginBottom: 2, marginTop: 4 }}>Ghi chú bao bì (tuỳ chọn)</div>
                  <Input
                    value={item.packing_note || ''}
                    placeholder="VD: Pallet gỗ fumigation, bao PE lót đáy cont, in logo khách..."
                    onChange={(e) => updateItem(item.key, 'packing_note', e.target.value)}
                  />
                </Col>
                <Col xs={24}>
                  <div style={{ fontSize: 11, color: '#999', marginBottom: 4, marginTop: 4 }}>
                    Phương thức thanh toán (Sale gõ FULL text — render thẳng vào "Term of payment:" của HĐ)
                  </div>
                  <TextArea
                    value={item.payment_terms || ''}
                    rows={3}
                    placeholder={`VD đầy đủ điều khoản:\nL/C at sight. The L/C draft must be opened within 5 days from the contract signing date.\nHoặc: T/T 30% advance before ETD + 70% balance within 5 days of B/L copy.\nHoặc: L/C UPAS 90 days. Plus 10% T/T advance before ETD.`}
                    onChange={(e) => updateItem(item.key, 'payment_terms', e.target.value)}
                    style={{ fontFamily: 'inherit' }}
                  />
                  <div style={{ fontSize: 10, color: '#bfbfbf', marginTop: 4, fontStyle: 'italic' }}>
                    Gợi ý nhanh (click để fill — sửa được sau):&nbsp;
                    {[
                      { label: 'L/C at sight', value: 'L/C at sight. The L/C draft must be opened within 5 days from the contract signing date.' },
                      { label: 'L/C UPAS 90', value: 'L/C UPAS 90 days. The L/C draft must be opened within 5 days from the contract signing date.' },
                      { label: 'CAD 5 days', value: 'Cash Against Documents within 5 days of presentation.' },
                      { label: 'D/P at sight', value: 'Documents against Payment at sight.' },
                      { label: 'T/T 30/70', value: 'T/T 30% advance before ETD + 70% balance within 5 days of B/L copy.' },
                      { label: 'T/T 100%', value: 'T/T 100% advance before ETD.' },
                    ].map((preset, idx, arr) => (
                      <span key={preset.label}>
                        <a
                          style={{ color: '#1677ff', cursor: 'pointer' }}
                          onClick={() => updateItem(item.key, 'payment_terms', preset.value)}
                        >{preset.label}</a>
                        {idx < arr.length - 1 ? ' · ' : ''}
                      </span>
                    ))}
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
                  {(item.bale_weights_kg && item.bale_weights_kg.length > 1) ? (
                    <span style={{ color: '#d46b08', fontWeight: 600 }}>
                      Bành/Cont: Linh động ({item.bale_weights_kg.join(' hoặc ')} kg/bành)
                    </span>
                  ) : (
                    <>
                      {Math.round(item.quantity_tons * 1000 / (item.bale_weight_kg || 35)).toLocaleString()} bành |
                      {' '}{Math.ceil(Math.round(item.quantity_tons * 1000 / (item.bale_weight_kg || 35)) / (item.bales_per_container || 576))} cont
                    </>
                  )}
                  {' | '}${(item.quantity_tons * item.unit_price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              )}
            </div>
          ))}
        </Card>

        {/* ═══ Logistics ═══
            Phase 1: POD ẩn khi FOB/EXW (KH lo cước, không cần cảng đích).
            Hoa hồng chuyển vào Collapse phía dưới (rare use). */}
        <Card size="small" style={{ marginBottom: 16, borderRadius: 12 }}
          title={<span style={{ fontSize: 14, fontWeight: 600 }}>🚢 Logistics</span>}>
          <Row gutter={16}>
            <Col xs={24} sm={8}>
              <Form.Item label="Incoterm" name="incoterm">
                <Select size="large"
                  options={Object.entries(INCOTERM_LABELS).map(([v, l]) => ({ value: v, label: l }))} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item label="Cảng xếp hàng (POL)" name="port_of_loading">
                <Select size="large" allowClear placeholder="Chọn cảng..."
                  options={PORT_OF_LOADING_OPTIONS.map((p) => ({ value: p.value, label: p.label }))} />
              </Form.Item>
            </Col>
            {/* POD: chỉ hiện khi không phải FOB/EXW (incoterm yêu cầu HA lo cước → cần cảng đích) */}
            {!['FOB', 'EXW'].includes((watchIncoterm || '').toUpperCase()) && (
              <Col xs={24} sm={8}>
                <Form.Item label="Cảng đích (POD)" name="port_of_destination">
                  <Input size="large" placeholder="Shanghai, Yokohama..." />
                </Form.Item>
              </Col>
            )}
            <Col xs={24} sm={8}>
              <Form.Item label="Ngày giao dự kiến (tuỳ chọn)" name="delivery_date">
                <DatePicker style={{ width: '100%' }} size="large" format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
          </Row>
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
              key: 'commission',
              label: <span style={{ fontSize: 13, fontWeight: 600 }}>💰 Hoa hồng môi giới (mở khi có)</span>,
              children: (
                <Row gutter={[12, 4]}>
                  <Col xs={24} sm={12}>
                    <Form.Item label="Hoa hồng (%)" name="commission_pct"
                      tooltip="Dùng % HOẶC USD/MT, không dùng cả hai.">
                      <InputNumber min={0} max={20} step={0.5} size="middle" style={{ width: '100%' }} placeholder="2"
                        disabled={commissionUsdPerMt > 0} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={12}>
                    <Form.Item label="Hoa hồng (USD/MT)" name="commission_usd_per_mt"
                      tooltip="Dùng khi môi giới tính theo đô/tấn.">
                      <InputNumber min={0} max={1000} step={1} size="middle" style={{ width: '100%' }} placeholder="25"
                        disabled={commissionPct > 0} />
                    </Form.Item>
                  </Col>
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

        {/* ═══ Tóm tắt nhanh (mini summary thay cho card gradient cũ) ═══ */}
        <Card size="small" style={{ borderRadius: 12, marginBottom: 12 }}>
          <Row gutter={[12, 8]}>
            <Col span={12}>
              <div style={{ fontSize: 11, color: '#999' }}>Tổng bành</div>
              <div style={{
                fontSize: hasFlexibleBaleWeight ? 14 : 18,
                fontWeight: 700,
                color: hasFlexibleBaleWeight ? '#d46b08' : '#1B4D3E',
              }}>
                {hasFlexibleBaleWeight ? 'Linh động' : itemsTotalBales.toLocaleString()}
              </div>
            </Col>
            <Col span={12}>
              <div style={{ fontSize: 11, color: '#999' }}>Số cont</div>
              <div style={{
                fontSize: hasFlexibleBaleWeight ? 14 : 18,
                fontWeight: 700,
                color: '#d46b08',
              }}>
                {hasFlexibleBaleWeight
                  ? 'Linh động'
                  : <>{itemsTotalContainers} <span style={{ fontSize: 11, fontWeight: 400 }}>x 20ft</span></>}
              </div>
            </Col>
            <Col span={24}>
              <div style={{ fontSize: 11, color: '#999' }}>Giá trị {currency}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#10b981' }}>
                ${itemsTotalUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </Col>
          </Row>
        </Card>

        {/* ═══ Action buttons — Upload .docx (Docs trình HĐ) ═══
            Compose flow bỏ hẳn (2026-05-20). HĐ mới CHỈ upload — Docs (Nhung+PA)
            soạn Word + upload → Phú điền + duyệt → Trung/Huy ký → Docs upload FINAL.
            HĐ cũ status='reviewing' flow_type='compose' vẫn render UI cũ ở
            ContractReviewPage (backward compat). */}
        <Card size="small" style={{ marginTop: 12, borderRadius: 12 }}>
          <Space direction="vertical" style={{ width: '100%' }} size={8}>
            <Alert
              type="success"
              showIcon
              style={{ borderRadius: 8, fontSize: 12 }}
              message="Làm hợp đồng — 3 bước nối tiếp"
              description={
                <div style={{ fontSize: 12, lineHeight: 1.7 }}>
                  <b>①</b> Tạo đơn hàng (lưu) → <b>②</b> Lấy file Word HĐ → <b>③</b> Nộp để Phú duyệt + Trung/Huy ký.
                  <br /><span style={{ color: '#52803f' }}>Làm <b>lần lượt từ trên xuống</b> — không phải chọn 1 trong 2.</span>
                </div>
              }
            />

            {/* ── BƯỚC ① tạo (lưu) đơn hàng ── */}
            <Divider style={{ margin: '4px 0' }}>
              <Tag color="green" style={{ fontSize: 11 }}>① Tạo đơn hàng</Tag>
            </Divider>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              block
              size="large"
              loading={loading}
              disabled={submittingReview}
              onClick={() => handleSubmit(true)}
              style={{ background: '#1B4D3E', borderColor: '#1B4D3E', fontWeight: 600 }}
            >
              Tạo đơn hàng
            </Button>
            <div style={{ fontSize: 11, color: '#8c8c8c', textAlign: 'center' }}>
              Lưu đơn (dạng nháp). Lưu xong vẫn sửa được. Xong bước này → xuống ②.
            </div>

            {/* ── BƯỚC ② lấy file Word HĐ (máy điền — Nấc 1) ── */}
            <Divider style={{ margin: '4px 0' }}>
              <Tag color="blue" style={{ fontSize: 11 }}>② Lấy file Word HĐ</Tag>
            </Divider>
            <Button
              type="default"
              icon={<DownloadOutlined />}
              block
              size="large"
              loading={docLoading === 'BOTH'}
              onClick={() => handleDownloadDoc('BOTH')}
            >
              Tải HĐ máy điền sẵn (SC + PI)
            </Button>
            <div style={{ fontSize: 11, color: '#8c8c8c', textAlign: 'center', lineHeight: 1.5 }}>
              Máy lấy số liệu form điền vào mẫu Word — <b>bạn không phải tự gõ</b>. Mở file xem/sửa/in.
              <br />(Hoặc dùng file Word bạn tự soạn.) <b>Rồi nộp file này ở bước ③ ngay dưới.</b>
            </div>

            {/* ── BƯỚC ③ nộp Word vào hệ thống để duyệt + ký ── */}
            <Divider style={{ margin: '4px 0' }}>
              <Tag color="purple" style={{ fontSize: 11 }}>③ Nộp HĐ để duyệt + ký</Tag>
            </Divider>
            <UploadFlowAction
              contractNoHint={contractData.contract_no}
              loading={loading || submittingReview}
              onBeforeSubmit={async () => {
                const ok = await handleSubmit(true, { silent: true })
                return ok?.id || null
              }}
              onUploaded={() => navigate('/sales/orders')}
            />
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
    <div style={{ padding: '16px 24px' }}>
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
        <span style={{ marginLeft: 'auto', color: '#999', fontSize: 12 }}>
          Docs upload file .docx HĐ bên phải · Phú LV duyệt + nhập bank
        </span>
      </div>

      {/* Form single-page — quy trình upload (2026-05-20): bỏ compose UI */}
      {/* Phase 1: smart defaults — contract_date=hôm nay, incoterm=FOB, POL=Đà Nẵng */}
      <Form
        form={form}
        layout="vertical"
        requiredMark
        preserve
        initialValues={{
          contract_date: dayjs(),
          incoterm: 'FOB',
          port_of_loading: 'DA_NANG',
          currency: 'USD',
        }}
      >
        {renderStep1()}
      </Form>
    </div>
  )
}

export default SalesOrderCreatePage

// ============================================================================
// UPLOAD FLOW ACTION — Tab "Upload bản đã sửa" trong Action card
// ============================================================================

interface UploadFlowActionProps {
  contractNoHint?: string
  loading: boolean
  /** Tạo sales_order trước, return order id (null nếu fail/validate fail) */
  onBeforeSubmit: () => Promise<string | null>
  /** Callback sau khi upload + tạo contract xong */
  onUploaded: () => void
}

function UploadFlowAction({ contractNoHint, loading, onBeforeSubmit, onUploaded }: UploadFlowActionProps) {
  const [files, setFiles] = useState<File[]>([])
  const [submitting, setSubmitting] = useState(false)

  const MAX_FILES = 10

  const addFiles = (incoming: FileList | File[]) => {
    const arr = Array.from(incoming).filter((f) => f.name.toLowerCase().endsWith('.docx'))
    if (arr.length === 0) {
      message.error('Chỉ nhận file .docx')
      return
    }
    setFiles((prev) => {
      const merged = [...prev, ...arr]
      if (merged.length > MAX_FILES) {
        message.warning(`Tối đa ${MAX_FILES} file — giữ ${MAX_FILES} đầu tiên`)
        return merged.slice(0, MAX_FILES)
      }
      return merged
    })
  }

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx))
  }

  const handleSubmit = async () => {
    if (files.length === 0) {
      message.error('Chọn ít nhất 1 file .docx')
      return
    }
    setSubmitting(true)
    try {
      const orderId = await onBeforeSubmit()
      if (!orderId) {
        setSubmitting(false)
        return
      }
      await salesContractWorkflowService.createUploadFlow(orderId, files, contractNoHint)
      message.success(`Đã upload ${files.length} file + trình Phú LV duyệt`)
      onUploaded()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload thất bại'
      message.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={8}>
      <Alert
        type="info"
        showIcon
        style={{ borderRadius: 6, fontSize: 12 }}
        message="Nộp file Word vào hệ thống"
        description={
          <div style={{ fontSize: 11.5, lineHeight: 1.7 }}>
            <b>a.</b> Kéo thả file <code>.docx</code> vào ô dưới — dùng <b>file ở bước ② (máy điền)</b> hoặc file bạn tự soạn. Được tối đa {MAX_FILES} file (HĐ chính + phụ lục + packing list…).
            <br />
            <b>b.</b> Bấm <b>“Upload + Trình Kiểm tra”</b> → Phú LV điền Số HĐ + Ngân hàng, duyệt → Trung/Huy ký.
          </div>
        }
      />

      {/* Drop zone */}
      <div
        style={{
          border: files.length > 0 ? '2px solid #1B4D3E' : '2px dashed #d9d9d9',
          background: files.length > 0 ? '#f6ffed' : '#fafafa',
          borderRadius: 8,
          padding: 14,
          textAlign: 'center',
          cursor: 'pointer',
        }}
        onClick={() => document.getElementById('upload-contract-input')?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          e.currentTarget.style.background = '#e6f7ff'
        }}
        onDragLeave={(e) => {
          e.currentTarget.style.background = files.length > 0 ? '#f6ffed' : '#fafafa'
        }}
        onDrop={(e) => {
          e.preventDefault()
          e.currentTarget.style.background = files.length > 0 ? '#f6ffed' : '#fafafa'
          if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files)
        }}
      >
        <input
          id="upload-contract-input"
          type="file"
          multiple
          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          style={{ display: 'none' }}
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files)
            // Reset để chọn lại cùng file được
            e.target.value = ''
          }}
        />
        <FileWordOutlined style={{ fontSize: 28, color: files.length > 0 ? '#1B4D3E' : '#bbb' }} />
        <div style={{ marginTop: 6, fontSize: 13, color: '#444', fontWeight: files.length > 0 ? 600 : 400 }}>
          {files.length > 0
            ? `Đã chọn ${files.length}/${MAX_FILES} file — bấm để thêm`
            : 'Kéo thả nhiều file .docx hoặc bấm để chọn'}
        </div>
        <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
          Tối đa {MAX_FILES} file · 20MB / file
        </div>
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div style={{ border: '1px solid #e8e8e8', borderRadius: 6, maxHeight: 200, overflow: 'auto' }}>
          {files.map((f, idx) => (
            <div
              key={idx}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 10px',
                borderBottom: idx < files.length - 1 ? '1px solid #f0f0f0' : 'none',
                fontSize: 12,
              }}
            >
              <FileWordOutlined style={{ color: '#1B4D3E' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {idx + 1}. {f.name}
                </div>
                <div style={{ fontSize: 10, color: '#999' }}>{(f.size / 1024).toFixed(0)} KB</div>
              </div>
              <Button
                type="text"
                size="small"
                danger
                onClick={(e) => {
                  e.stopPropagation()
                  removeFile(idx)
                }}
              >
                ✕
              </Button>
            </div>
          ))}
        </div>
      )}

      <Button
        type="primary"
        icon={<CheckCircleOutlined />}
        block
        size="large"
        loading={submitting}
        disabled={files.length === 0 || loading}
        onClick={handleSubmit}
        style={{ background: '#1B4D3E' }}
      >
        Upload {files.length > 0 ? `${files.length} file ` : ''}+ Trình Kiểm tra (Phú LV)
      </Button>
      <div style={{ fontSize: 11, color: '#999', textAlign: 'center' }}>
        Phú LV download → fill 2 ô highlight trên Word → reupload → Trung/Huy ký
      </div>
    </Space>
  )
}
