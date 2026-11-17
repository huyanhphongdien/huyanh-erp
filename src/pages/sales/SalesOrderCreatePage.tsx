// ============================================================================
// SALES ORDER CREATE PAGE — Tạo đơn hàng bán quốc tế + ĐƠN MUA TIẾP theo HĐ đã ký
// File: src/pages/sales/SalesOrderCreatePage.tsx
//
// MỘT form, hai chế độ (sales_family_parties_p1, owner duyệt 17/11/2026):
//   • HĐ mới   — /sales/orders/new (tab 'sales-order-create').
//   • Mua tiếp — tab 'sales-order-continue-<sourceId>' (props { sourceOrderId }) hoặc route
//     /sales/orders/:orderId/continue (điện thoại / mở thẳng URL, cờ continueFromRoute). Đơn nguồn quy về HĐ GỐC;
//     KHOÁ người mua, đồng tiền, ngày HĐ (= gốc); chép quy cách theo salesOrderService.continuationPrefill (KHÔNG chép
//     tấn/giá/ETD/PO/cọc/L-C/booking/ghi chú/tỷ giá); lưu bằng createContinuation. Mỗi đợt là MỘT đơn bình thường —
//     tiền, lô, công nợ riêng (không đổi công thức nào). Số đợt do trigger DB cấp, form chỉ GỢI Ý số đơn '<HĐ gốc>-D<n>'.
// Ô "Người nhận hàng" + 4 ô chữ in Consignee/Notify chỉ hiện khi familyPartiesReady() (migration đã áp).
// ============================================================================

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import dayjs from 'dayjs'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../../stores/authStore'
import { useTabStore } from '../../stores/tabStore'
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
  Modal,
  type InputRef,
} from 'antd'
import {
  ArrowLeftOutlined,
  SaveOutlined,
  CheckCircleOutlined,
  DownloadOutlined,
  FileWordOutlined,
  BranchesOutlined,
  EditOutlined,
  SwapOutlined,
  UndoOutlined,
} from '@ant-design/icons'
import {
  downloadContract,
  deriveKind,
  DEFAULT_BANK,
  amountToWords,
  formatContractDate,
  type ContractFormData,
} from '../../services/sales/contractGeneratorService'
import { salesContractWorkflowService, describeContractNoHit } from '../../services/sales/salesContractWorkflowService'
import { salesCustomerService } from '../../services/sales/salesCustomerService'
import {
  salesOrderService,
  type CreateSalesOrderData,
  type CreateContinuationInput,
  type PossibleDuplicate,
} from '../../services/sales/salesOrderService'
import { balesFromTons, containersFromBales, defaultBalesPerContainer } from '../../services/sales/baleMath'
import { rubberGradeService } from '../../services/wms/rubberGradeService'
import type { SalesCustomer, SalesOrder, CustomerStatus, PackingType } from '../../services/sales/salesTypes'
import { SALES_CURRENCY_OPTIONS, isVnd, priceUnitLabel, fmtMoney, vndInputProps } from '../../services/sales/salesMoney'
import { useUnsavedWarning } from '../../hooks/useUnsavedWarning'
import { useOpenTab } from '../../hooks/useOpenTab'
import { useIsPhone } from '../../hooks/useIsPhone'
import { usdInputProps, fmtDate, fmtDateShort, fmtNum } from '../../utils/format'
import { dichLoiHeThong } from '../../utils/dichLoiHeThong'
import { palette } from '../../theme/palette'
import PageState from '../../components/common/PageState'
import { EnumTag } from '../../components/common/EnumTag'
import PartyFields, { SALES_CUSTOMER_PICKER_QUERY_KEY } from './components/PartyFields'
import RootContractPickerModal from './components/RootContractPickerModal'
import { useFamilyPartiesReady, salesOrderFamilyQueryKey } from './components/OrderFamilyChip'
import type { RubberGradeStandard } from '../../services/wms/wms.types'
import {
  SVR_GRADE_OPTIONS,
  INCOTERM_LABELS,
  PAYMENT_TERMS_LABELS,
  PORT_OF_LOADING_OPTIONS,
  CUSTOMER_TIER_LABELS,
  CUSTOMER_TIER_COLORS,
  CUSTOMER_STATUS_LABELS,
  COUNTRY_OPTIONS,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_COLORS,
  normalizeContractNo,
  partyShortName,
  soDisplayCode,
} from '../../services/sales/salesTypes'

const { Title, Text } = Typography
const { TextArea } = Input

/** Ô chỉ tiêu kỹ thuật cấp đơn (Form.Item cùng tên) — đợt mua tiếp chép từ đơn nguồn. */
const SPEC_KEYS = [
  'drc_min', 'drc_max', 'moisture_max', 'dirt_max', 'ash_max',
  'nitrogen_max', 'volatile_max', 'pri_min', 'mooney_max', 'color_lovibond_max',
] as const
type SpecKey = (typeof SPEC_KEYS)[number]

/** 4 ô CHỮ IN ghi đè ô Consignee/Notify trên chứng từ (chỉ để in; trống = tự suy). */
const PRINT_FIELDS = ['consignee_name', 'consignee_address', 'notify_party', 'notify_address'] as const

/** Khoá query ngữ cảnh form Mua tiếp (đầu form + điền sẵn + kiểm khi lưu). */
const continuationQueryKey = (sourceId: string | null) => ['sales-order-continuation', sourceId] as const

/** Đơn giá /tấn theo đồng tiền của đơn — số chẵn không in số lẻ ($2,470 · 35.000.000 ₫). */
const fmtPrice = (v: number | null | undefined, currency?: string | null): string =>
  v == null || Number.isNaN(Number(v))
    ? '—'
    : fmtMoney(Number(v), currency, { decimals: Number.isInteger(Number(v)) ? 0 : 2 })

/** Lỗi "số HĐ đã có" (service kiểm trước / index DB ux_sales_orders_contract_no_norm_active lúc chèn). */
const isContractNoTakenError = (msg: string) => msg.startsWith('Số HĐ') && msg.includes('đã có')

/** Một lời nhắc trước khi lưu (hiện chung một hộp "Vẫn tạo / Xem lại"); `action` = nút phụ đóng hộp rồi chạy. */
type PreSaveNote = { text: string; action?: { label: string; run: () => void } }

/** Props khi mở dạng TAB (TabContent trải tab.props) hoặc từ route. */
export interface SalesOrderCreatePageProps {
  /** Đơn NGUỒN để tạo đơn MUA TIẾP (gốc hoặc một đợt — tự quy về gốc). Có → chế độ Mua tiếp. */
  sourceOrderId?: string
  /**
   * Chỉ route 'sales/orders/:orderId/continue' bật cờ này: đọc đơn nguồn từ useParams().orderId.
   * Tab đang ẩn (keep-alive) vẫn thấy useParams của URL KHÁC (vd /sales/orders/<id> của tab chi tiết) —
   * đọc thẳng params là tab "Tạo đơn hàng" bị lật nhầm sang chế độ mua tiếp.
   */
  continueFromRoute?: boolean
}

// amountToWords moved to contractGeneratorService — share giữa Compose Studio
// và buildFormDataFromOrder để tránh drift logic.

// ============================================================================
// COMPONENT
// ============================================================================

function SalesOrderCreatePage({ sourceOrderId: propSourceId, continueFromRoute }: SalesOrderCreatePageProps = {}) {
  const navigate = useNavigate()
  const openTab = useOpenTab()
  const qc = useQueryClient()
  const isPhone = useIsPhone()
  const [searchParams] = useSearchParams()
  const user = useAuthStore(s => s.user)
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [submittingReview, setSubmittingReview] = useState(false)
  const [formDirty, setFormDirty] = useState(false)
  // Đóng tab / F5 khi đang nhập dở → trình duyệt hỏi lại (đang lưu thì thôi)
  useUnsavedWarning(formDirty && !loading && !submittingReview)
  const [docLoading, setDocLoading] = useState<'SC' | 'PI' | 'BOTH' | null>(null)
  const [previewTab, setPreviewTab] = useState<'SC' | 'PI'>('SC')

  // ── Chế độ: HĐ mới | MUA TIẾP theo HĐ đã ký ──
  // Tab truyền sourceOrderId; route /sales/orders/:orderId/continue truyền cờ continueFromRoute (đọc useParams).
  const { orderId: paramOrderId } = useParams<{ orderId: string }>()
  const sourceOrderId = propSourceId || (continueFromRoute ? paramOrderId : undefined) || null
  const isContinuation = !!sourceOrderId
  /** key tab của chính form này (quy ước openTab ở các lối vào) — để đánh dấu "chưa lưu" và tự đóng sau khi tạo đợt */
  const ownTabKey = sourceOrderId ? `sales-order-continue-${sourceOrderId}` : 'sales-order-create'
  /** Migration Các bên / Họ HĐ đã áp chưa — false: ẨN ô Người nhận + chữ in (đang tải cũng false) */
  const familyReady = useFamilyPartiesReady()

  // Data
  const [customers, setCustomers] = useState<SalesCustomer[]>([])
  const [customersLoaded, setCustomersLoaded] = useState(false)
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
    /** Đơn giá đợt nguồn — CHỈ làm placeholder ở đợt mua tiếp ('đợt trước $2,470'), không điền vào ô giá */
    last_unit_price?: number | null
    /** Chỉ tiêu kỹ thuật của dòng chép từ đợt nguồn (đợt mua tiếp) — gửi kèm dòng hàng */
    specs?: Partial<Record<SpecKey, number>>
  }
  const [orderItems, setOrderItems] = useState<OrderItem[]>([
    { key: '1', grade: '', quantity_tons: 0, unit_price: 0, bale_weight_kg: 35, bale_weights_kg: [35], bales_per_container: defaultBalesPerContainer(35, null), packing_type: 'loose_bale', packing_note: '', payment_terms: '' },
  ])
  // Dòng sản phẩm DỞ DANG (thiếu Grade/Tấn/Giá) bị chặn khi lưu — tô viền đỏ theo key
  const [invalidKeys, setInvalidKeys] = useState<string[]>([])

  // Dòng hàng nằm ngoài <Form> nên onValuesChange không bắt — tự đánh dấu "chưa lưu"
  const addItem = () => {
    setFormDirty(true)
    setOrderItems(prev => [...prev, { key: String(Date.now()), grade: '', quantity_tons: 0, unit_price: 0, bale_weight_kg: 35, bale_weights_kg: [35], bales_per_container: defaultBalesPerContainer(35, null), packing_type: 'loose_bale', packing_note: '', payment_terms: '' }])
  }

  const removeItem = (key: string) => {
    if (orderItems.length <= 1) return
    setFormDirty(true)
    setOrderItems(prev => prev.filter(i => i.key !== key))
  }

  const updateItem = (key: string, field: string, value: any) => {
    setFormDirty(true)
    setOrderItems(prev => prev.map(i => i.key === key ? { ...i, [field]: value } : i))
  }

  // Totals from items
  const itemsTotalTons = orderItems.reduce((s, i) => s + (i.quantity_tons || 0), 0)
  const itemsTotalUSD = orderItems.reduce((s, i) => s + (i.quantity_tons || 0) * (i.unit_price || 0), 0)
  // Linh động flag: bất kỳ item nào check ≥ 2 KG/bành → tổng "linh động"
  const hasFlexibleBaleWeight = orderItems.some(
    (i) => (i.bale_weights_kg && i.bale_weights_kg.length > 1),
  )
  // Bành / cont tính qua baleMath (33,33 kg = 30 bành/tấn → 210 t = 6.300 bành = 10 cont, không phải 6.301 / 11)
  const itemsTotalBales = orderItems.reduce((s, i) => s + balesFromTons(i.quantity_tons, i.bale_weight_kg || 35), 0)
  const itemsTotalContainers = orderItems.reduce((s, i) => s + containersFromBales(balesFromTons(i.quantity_tons, i.bale_weight_kg || 35), i.bales_per_container), 0)

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
        setCustomersLoaded(true)
      } catch (err) {
        console.error('Load data error:', err)
        // Ô "Người mua" sẽ trống — nói rõ là LỖI TẢI, không phải chưa có khách
        message.error(dichLoiHeThong(err, 'Không tải được danh sách khách hàng / grade — tải lại trang (F5)'), 6)
      }
    }
    loadData()
  }, [])

  // ── Auto-calc values ──
  const quantityTons = Form.useWatch('quantity_tons', form) || 0
  const unitPrice = Form.useWatch('unit_price', form) || 0
  const baleWeight = Form.useWatch('bale_weight_kg', form) || 35
  const containerType = Form.useWatch('container_type', form) || '20ft'
  const balesPerContInput = Form.useWatch('bales_per_container', form) || defaultBalesPerContainer(baleWeight, containerType)
  const currency = Form.useWatch('currency', form) || 'USD'
  // Bán nội địa: giá nhập bằng VNĐ, cần tỷ giá để quy đổi USD cho công nợ/báo cáo (salesMoney.ts)
  const vnd = isVnd(currency)
  const exchangeRateWatch = Form.useWatch('exchange_rate', form) || 0
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

  // ── Các bên của đơn: người mua (customer_id) → người nhận hàng (ship_to_customer_id) + 4 ô chữ in ──
  // ⚠ Form.useWatch (antd v6) báo trễ một macrotask — chỉ dùng để HIỂN THỊ / khoá query; chỗ cần khớp tức thời với
  // store (buyerId của ô Người nhận) đọc getFieldValue trong Form.Item shouldUpdate.
  const watchCustomerId = Form.useWatch('customer_id', form) as string | undefined
  const watchConsigneeName = Form.useWatch('consignee_name', form) as string | undefined
  const watchConsigneeAddr = Form.useWatch('consignee_address', form) as string | undefined
  const watchNotifyParty = Form.useWatch('notify_party', form) as string | undefined
  const watchNotifyAddr = Form.useWatch('notify_address', form) as string | undefined
  const printFilledCount = [watchConsigneeName, watchConsigneeAddr, watchNotifyParty, watchNotifyAddr]
    .filter((v) => typeof v === 'string' && v.trim()).length
  const [printOpen, setPrintOpen] = useState(false)
  /** Đơn gần nhất CHƯA HUỶ của người mua có người nhận → gợi ý 1 chạm "dùng lại?" (chỉ HĐ mới) */
  const [shipToHint, setShipToHint] = useState<{ buyerId: string; orderLabel: string; shipToId: string; shipToName: string } | null>(null)
  /** Người mua đã bấm "đúng, mua thẳng" ở lời nhắc chọn nhầm vai */
  const [roleHintDismissed, setRoleHintDismissed] = useState<string | null>(null)
  /** Sale đã đụng ô Người nhận ở đợt mua tiếp → thôi tô nổi "xác nhận" */
  const [shipToTouched, setShipToTouched] = useState(false)
  /** Ô Số đơn của đợt mua tiếp: mặc định khoá theo số gợi ý, bấm "Đổi số" mới gõ được */
  const [editNo, setEditNo] = useState(false)
  /** Form HĐ mới: modal "Mua tiếp theo HĐ đã ký…" (Sale nhận ra đây là đợt mua thêm của HĐ cũ) */
  const [rootPickerOpen, setRootPickerOpen] = useState(false)
  const contractNoInputRef = useRef<InputRef>(null)
  /** Chỉ điền sẵn MỘT lần cho mỗi đơn nguồn (đọc lại ngữ cảnh để làm mới số đợt không được ghi đè chỗ Sale đã sửa) */
  const prefilledFor = useRef<string | null>(null)
  /** Chống trả lời muộn khi đổi người mua liên tục (đơn gần nhất của người mua CŨ về sau) */
  const buyerReqRef = useRef(0)

  // ── Ngữ cảnh MUA TIẾP: gốc thật, cả họ + tổng, số đợt dự kiến, số gợi ý, số file HĐ ở gốc, bộ điền sẵn ──
  // staleTime ∞ + không tự tải lại: đầu form không đổi số giữa chừng; gcTime 0: mở lại tab là đọc mới.
  const ctxQ = useQuery({
    queryKey: continuationQueryKey(sourceOrderId),
    queryFn: () => salesOrderService.getContinuationContext(sourceOrderId as string),
    enabled: isContinuation,
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
    retry: 1,
  })
  const contCtx = isContinuation ? (ctxQ.data ?? null) : null
  const contReady = !!contCtx && !contCtx.blockReason
  const rootNo = contCtx ? ((contCtx.root.contract_no || '').trim() || soDisplayCode(contCtx.root)) : ''
  /**
   * Hiện ô Người nhận + 4 ô chữ in: đã migration, HOẶC ngữ cảnh mua tiếp đã nạp (getContinuationContext chỉ ra
   * không-blockReason khi migration đã áp). Đợt mua tiếp mà ẩn các ô này thì lúc lưu sẽ ghi đè người nhận/chữ in
   * chép từ đợt trước thành NULL — nên không phụ thuộc riêng vào hook (có thể còn đang tải/lỗi mạng).
   */
  const partiesOn = familyReady || contReady

  // Danh sách khách gọn — CHUNG cache với ô PartyFields (cùng khoá) — để biết trạng thái người nhận khi lưu
  const pickerQ = useQuery({
    queryKey: SALES_CUSTOMER_PICKER_QUERY_KEY,
    queryFn: () => salesCustomerService.getPickerOptions(),
    staleTime: 5 * 60 * 1000,
    enabled: partiesOn,
  })

  // Điền sẵn đợt mua tiếp — MỘT lần mỗi đơn nguồn (create_flow 'ĐIỀN SẴN'; luật ở continuationPrefill)
  useEffect(() => {
    if (!contCtx || contCtx.blockReason) return
    if (prefilledFor.current === contCtx.source.id) return
    prefilledFor.current = contCtx.source.id
    const p = contCtx.prefill
    const specVals: Partial<Record<SpecKey, number>> = {}
    for (const k of SPEC_KEYS) if (p[k] !== undefined && p[k] !== null) specVals[k] = p[k] as number
    form.resetFields()
    form.setFieldsValue({
      // KHOÁ theo gốc
      customer_id: p.customer_id,
      currency: p.currency,
      contract_date: p.contract_date ? dayjs(p.contract_date) : null,
      // Số đơn GỢI Ý — Sale xác nhận hoặc bấm "Đổi số"
      contract_no: contCtx.suggestedNo || undefined,
      // CHÉP từ đơn nguồn
      incoterm: p.incoterm || 'FOB',
      port_of_loading: p.port_of_loading || 'DA_NANG',
      port_of_destination: p.port_of_destination,
      commission_pct: p.commission_pct,
      commission_usd_per_mt: p.commission_usd_per_mt,
      ...specVals,
      // Các bên — tô nổi để Sale xác nhận, sửa được từng đợt
      ship_to_customer_id: p.ship_to_customer_id ?? null,
      consignee_name: p.consignee_name ?? undefined,
      consignee_address: p.consignee_address ?? undefined,
      notify_party: p.notify_party ?? undefined,
      notify_address: p.notify_address ?? undefined,
      // KHÔNG chép: tấn, đơn giá (chỉ placeholder), ETD/ngày giao, PO khách, cọc, L/C, booking, ghi chú, tỷ giá
    })
    setOrderItems(p.items.map((it, idx) => {
      const bw = it.bale_weight_kg || 35
      const specs: Partial<Record<SpecKey, number>> = {}
      for (const k of SPEC_KEYS) if (it[k] !== undefined && it[k] !== null) specs[k] = it[k] as number
      return {
        key: `c${idx + 1}`,
        grade: it.grade || '',
        quantity_tons: 0,
        unit_price: 0,
        bale_weight_kg: bw,
        bale_weights_kg: it.bale_weights_kg && it.bale_weights_kg.length ? it.bale_weights_kg : [bw],
        bales_per_container: it.bales_per_container || defaultBalesPerContainer(bw, null),
        packing_type: it.packing_type || 'loose_bale',
        packing_note: it.packing_note || '',
        payment_terms: it.payment_terms || '',
        last_unit_price: it.last_unit_price ?? null,
        specs,
      }
    }))
    setInvalidKeys([])
    setEditNo(!contCtx.suggestedNo)
    setShipToTouched(false)
    setPrintOpen(PRINT_FIELDS.some((k) => !!(p[k] || '').trim()))
    setFormDirty(false)
  }, [contCtx, form])

  // Thẻ "Thông tin người mua" bên phải: người mua của HĐ gốc (có thể đã ngừng GD → không nằm trong danh sách đang hoạt động)
  useEffect(() => {
    if (!contCtx || contCtx.blockReason) return
    const id = contCtx.root.customer_id
    const found = customers.find((c) => c.id === id)
    if (found) { setSelectedCustomer(found); return }
    if (!customersLoaded) return
    let alive = true
    salesCustomerService.getById(id)
      .then((c) => { if (alive) setSelectedCustomer(c) })
      // chỉ là thẻ xem thêm — ô Người mua đã có tên từ HĐ gốc
      .catch((e) => console.warn('[CreatePage] Không tải được hồ sơ người mua của HĐ gốc:', e))
    return () => { alive = false }
  }, [contCtx, customers, customersLoaded])

  // Ô Người mua: danh sách khách đang hoạt động; đợt mua tiếp thêm người mua của gốc nếu không còn trong danh sách
  const buyerOptions = useMemo(() => {
    const label = (c: { code?: string | null; name: string; country?: string | null }) =>
      `${c.code ? `${c.code} — ` : ''}${c.name}${c.country ? ` (${c.country})` : ''}`
    const opts = customers.map((c) => ({ value: c.id, label: label(c) }))
    const rc = contCtx?.root.customer
    if (rc && !customers.some((c) => c.id === rc.id)) opts.unshift({ value: rc.id, label: label(rc) })
    return opts
  }, [customers, contCtx])

  const buyerShort = partyShortName(customers.find((c) => c.id === watchCustomerId) || contCtx?.root.customer || selectedCustomer)

  // ── Nhắc chọn nhầm vai (chỉ HĐ mới): người mua vừa chọn từng là NGƯỜI NHẬN qua trung gian ──
  const receivedQ = useQuery({
    queryKey: ['sales-received-orders', watchCustomerId ?? null],
    queryFn: () => salesCustomerService.getReceivedOrders(watchCustomerId as string),
    enabled: familyReady && !isContinuation && !!watchCustomerId,
    staleTime: 5 * 60 * 1000,
  })
  const roleHint = useMemo(() => {
    if (isContinuation || !familyReady || !watchCustomerId || roleHintDismissed === watchCustomerId) return null
    const rows = receivedQ.data || []
    const by = new Map<string, { id: string; name: string; count: number }>()
    for (const o of rows) {
      if (!o.customer_id || o.customer_id === watchCustomerId) continue
      const cur = by.get(o.customer_id) || { id: o.customer_id, name: partyShortName(o.customer), count: 0 }
      cur.count += 1
      by.set(o.customer_id, cur)
    }
    const list = [...by.values()].sort((a, b) => b.count - a.count)
    return list.length ? { receiverId: watchCustomerId, list } : null
  }, [isContinuation, familyReady, watchCustomerId, roleHintDismissed, receivedQ.data])

  // Đánh dấu tab "chưa lưu" (chấm vàng trên thanh tab; LRU không đuổi tab dở) — chỉ khi form đang mở dạng tab
  useEffect(() => {
    const st = useTabStore.getState()
    const tab = st.tabs.find((t) => t.key === ownTabKey)
    if (tab && !!tab.dirty !== formDirty) st.setDirty(ownTabKey, formDirty)
  }, [formDirty, ownTabKey])

  const openOrderTab = useCallback((id: string, label: string) => {
    openTab({
      key: `sales-order-${id}`,
      title: `Đơn ${label}`,
      componentId: 'sales-order-detail',
      props: { orderId: id },
      path: `/sales/orders/${id}`,
    })
  }, [openTab])

  const openContinueTab = useCallback((id: string, label: string) => {
    openTab({
      key: `sales-order-continue-${id}`,
      title: `Mua tiếp ${label}`,
      componentId: 'sales-order-continue',
      props: { sourceOrderId: id },
      path: `/sales/orders/${id}/continue`,
    })
  }, [openTab])

  const totalBales = balesFromTons(quantityTons, baleWeight)
  const balesPerContainer = containerType === '40ft' ? balesPerContInput * 2 : balesPerContInput
  const containerCount = containersFromBales(totalBales, balesPerContainer)
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
            sw_plastic_pallet: 'Shrink Wrapped plastic pallets',
            sw_wooden_pallet: 'Shrink Wrapped wooden pallets',
            wooden_pallet: 'Wooden pallets (fumigated)',
            plastic_pallet: 'Plastic pallets',
            metal_box: 'Metal box packing',
          }
          const human = map[pt] || 'Loose bales packing'
          return `${kg} kg/bale, ${human}`
        })(),
      bales_total: itemsTotalBales ? itemsTotalBales.toLocaleString('en-US') : '',
      // pallets_total: chỉ tính khi packing dùng pallet (mọi loại pallet),
      // standard 36 bales/pallet (16 pallets x 36 = 576 bales/20DC). Khác thì để rỗng.
      pallets_total: (() => {
        const pt = firstItem.packing_type || ''
        if (!['wooden_pallet', 'sw_pallet', 'sw_plastic_pallet', 'sw_wooden_pallet', 'plastic_pallet'].includes(pt)) return ''
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
    // Số HĐ KHÔNG bắt buộc để tải bản nháp — chưa có thì ô số để trống, Sale tự điền trên Word. Chỉ cần có người mua.
    if (!contractData.buyer_name) {
      message.error('Hãy chọn Người mua trước khi tải HĐ')
      return
    }
    const noLabel = contractData.contract_no || 'HD-moi'
    setDocLoading(type)
    try {
      if (type === 'BOTH') {
        await downloadContract(deriveKind(contractData.incoterm || 'FOB', 'SC'), contractData, `${noLabel}_SC.docx`)
        await downloadContract(deriveKind(contractData.incoterm || 'FOB', 'PI'), contractData, `${noLabel}_PI.docx`)
        message.success(contractData.contract_no
          ? 'Đã tải HĐ máy điền sẵn (SC + PI)'
          : 'Đã tải HĐ máy điền sẵn (SC + PI) — chưa có Số HĐ, điền trên file Word hoặc nhập số rồi tải lại')
      } else {
        const kind = deriveKind(contractData.incoterm || 'FOB', type)
        await downloadContract(kind, contractData, `${noLabel}_${type}.docx`)
        message.success(`Đã tải ${type} (${kind})`)
      }
    } catch (e: unknown) {
      message.error(dichLoiHeThong(e, `Sinh ${type} thất bại`))
    } finally {
      setDocLoading(null)
    }
  }

  // ── Chọn NGƯỜI MUA (chỉ HĐ mới — đợt mua tiếp khoá người mua theo gốc) ──
  // Phase 1: khi chọn KH → fetch đơn gần nhất → prefill Incoterm/POL/POD/Packing/Payment
  // từ đơn cũ. Nếu chưa có đơn nào với KH này → dùng customer default (FOB/USD).
  // Thêm 17/11/2026: đơn gần nhất CHƯA HUỶ có người nhận → gợi ý 1 chạm "Đơn trước của A giao cho B — dùng lại?".
  const handleCustomerChange = useCallback(
    async (customerId: string) => {
      const req = ++buyerReqRef.current
      const cust = customers.find((c) => c.id === customerId) || null
      setSelectedCustomer(cust)
      setShipToHint(null)
      if (!cust) return

      // Set ngay defaults từ customer profile (instant feedback)
      form.setFieldsValue({
        incoterm: cust.default_incoterm || 'FOB',
        currency: cust.default_currency || 'USD',
        payment_terms: cust.payment_terms || undefined,
      })

      // Fetch last order của KH này để prefill smart defaults (getByCustomer đã bỏ đơn huỷ, kèm ship_to)
      try {
        const orders = await salesOrderService.getByCustomer(customerId)
        if (req !== buyerReqRef.current) return  // Sale đã chọn người mua khác trong lúc chờ
        const withShipTo = orders.find((o) => o.ship_to_customer_id && o.ship_to_customer_id !== customerId)
        if (withShipTo?.ship_to_customer_id) {
          setShipToHint({
            buyerId: customerId,
            orderLabel: soDisplayCode(withShipTo),
            shipToId: withShipTo.ship_to_customer_id,
            shipToName: partyShortName(withShipTo.ship_to),
          })
        }
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
                  bales_per_container: last.bales_per_container || defaultBalesPerContainer(last.bale_weight_kg || 35, null),
                  packing_type: last.packing_type || 'loose_bale',
                  payment_terms: last.payment_terms || '',
                }
              : it,
          )
        })
        message.success(`Đã điền sẵn theo đơn gần nhất ${soDisplayCode(last)} của ${partyShortName(cust)}`, 2)
      } catch (e) {
        // Không block — chỉ là helper
        console.warn('[CreatePage] prefill from last order fail:', e)
      }
    },
    [customers, form],
  )

  // ── Nhắc chọn nhầm vai → "Đổi giúp tôi": Người mua = bên trung gian, Người nhận = khách vừa chọn ──
  const swapRoles = async (intermediaryId: string) => {
    const receiverId = form.getFieldValue('customer_id') as string | undefined
    if (!receiverId || receiverId === intermediaryId) return
    form.setFieldsValue({ customer_id: intermediaryId })
    setFormDirty(true)
    await handleCustomerChange(intermediaryId)
    form.setFieldsValue({ ship_to_customer_id: receiverId })
    message.success(
      `Đã đổi: Người mua = ${partyShortName(customers.find((c) => c.id === intermediaryId))}, ` +
      `Người nhận = ${partyShortName(customers.find((c) => c.id === receiverId))}`,
    )
  }

  // ── Mở từ trang khách hàng: /sales/orders/new?customer_id=... → chọn sẵn khách đó (chỉ HĐ mới) ──
  useEffect(() => {
    if (isContinuation) return
    const preselectId = searchParams.get('customer_id')
    if (!preselectId || customers.length === 0) return
    if (form.getFieldValue('customer_id')) return // người dùng đã tự chọn — không ghi đè
    if (!customers.some((c) => c.id === preselectId)) return
    form.setFieldsValue({ customer_id: preselectId })
    handleCustomerChange(preselectId)
  }, [isContinuation, customers, searchParams, form, handleCustomerChange])

  // ── Phân loại dòng sản phẩm khi lưu ──
  // Đủ (giữ) / rỗng hoàn toàn (bỏ qua) / DỞ DANG (chặn — không âm thầm vứt bỏ)
  const isCompleteItem = (i: OrderItem) => Boolean(i.grade && i.quantity_tons > 0 && i.unit_price > 0)
  const isPartialItem = (i: OrderItem) =>
    Boolean(i.grade || i.quantity_tons > 0 || i.unit_price > 0) && !isCompleteItem(i)

  /** Chặn dòng dở dang: báo lỗi + tô viền đỏ dòng đó. Trả true nếu có dòng bị chặn. */
  const blockPartialItems = (): boolean => {
    const partialRows: number[] = []
    const partialKeys: string[] = []
    orderItems.forEach((i, idx) => {
      if (isPartialItem(i)) {
        partialRows.push(idx + 1)
        partialKeys.push(i.key)
      }
    })
    if (partialKeys.length === 0) {
      setInvalidKeys([])
      return false
    }
    setInvalidKeys(partialKeys)
    message.error(`Dòng sản phẩm thứ ${partialRows.join(', ')} thiếu Grade/Tấn/Giá — điền đủ hoặc xoá dòng`)
    return true
  }

  // ── Số HĐ / số đơn đã có ở đơn chưa huỷ khác → CHẶN; đợt mua tiếp thì gợi ý lại số kế tiếp ──
  // (hai người tạo đợt cùng lúc: người sau bị index chặn trùng — create_flow 'KIỂM KHI LƯU')
  const onContractNoTaken = async (text: string) => {
    form.setFields([{ name: 'contract_no', errors: [text] }])
    if (!contCtx) {
      message.error(text, 6)
      form.scrollToField('contract_no')
      return
    }
    let next = ''
    try {
      next = await salesOrderService.suggestContinuationNo(contCtx.root.id)
    } catch (e) {
      console.warn('[CreatePage] Không lấy được số đợt kế tiếp:', e)
    }
    void ctxQ.refetch()   // làm mới "sẽ là đợt n · họ đang có k đợt" ở đầu form (không điền sẵn lại)
    const current = normalizeContractNo(form.getFieldValue('contract_no'))
    if (next && normalizeContractNo(next) !== current) {
      Modal.confirm({
        title: 'Số đơn này đã có',
        content: (
          <div style={{ fontSize: 13, lineHeight: 1.6 }}>
            {text}
            <div style={{ marginTop: 8 }}>Số gợi ý kế tiếp còn trống: <b style={{ fontFamily: 'monospace' }}>{next}</b></div>
          </div>
        ),
        okText: `Dùng ${next}`,
        cancelText: 'Tự sửa số',
        onOk: () => {
          form.setFields([{ name: 'contract_no', value: next, errors: [] }])
          setEditNo(false)
          setFormDirty(true)
          message.info('Đã đổi số đơn — bấm "Tạo đơn mua tiếp" để lưu', 4)
        },
        onCancel: () => {
          setEditNo(true)
          setTimeout(() => contractNoInputRef.current?.focus({ cursor: 'all' }), 60)
        },
      })
      return
    }
    message.error(text, 6)
    setEditNo(true)
    form.scrollToField('contract_no')
  }

  /**
   * Kiểm trước khi lưu (cả HĐ mới lẫn đợt mua tiếp):
   *   CHẶN — số HĐ trùng nguyên văn (sau chuẩn hoá) với đơn chưa huỷ khác.
   *   HỎI LẠI (một hộp chung) — có thể trùng lô hàng (findPossibleDuplicates: ca sinh đôi HA20260136/HA20260301) ·
   *     số HĐ cùng gốc với đơn khác · HĐ gốc chưa có file HĐ đã ký · người nhận đang ngừng giao dịch.
   * Lỗi mạng ở bước kiểm KHÔNG chặn lưu (báo vàng) — index DB vẫn chặn số trùng lúc chèn.
   */
  const runPreSaveChecks = async (a: {
    contractNo: string
    buyerId: string
    shipToId: string | null
    grade: string
    tons: number
    price: number
    currency: string
    familyRootId: string | null
  }): Promise<{ blocked: boolean; dups: PossibleDuplicate[]; notes: PreSaveNote[] }> => {
    const notes: PreSaveNote[] = []
    const [noRes, dupRes] = await Promise.allSettled([
      a.contractNo
        ? salesContractWorkflowService.checkContractNo(a.contractNo, { buyerId: a.buyerId, familyRootId: a.familyRootId })
        : Promise.resolve(null),
      salesOrderService.findPossibleDuplicates({
        customer_id: a.buyerId,
        ship_to_customer_id: a.shipToId,
        grade: a.grade,
        quantity_tons: a.tons,
        unit_price: a.price,
        currency: a.currency,
        family_root_id: a.familyRootId,
      }),
    ])

    // ① Số HĐ
    if (noRes.status === 'fulfilled') {
      if (noRes.value?.block) {
        await onContractNoTaken(describeContractNoHit(noRes.value.block))
        return { blocked: true, dups: [], notes: [] }
      }
      for (const w of noRes.value?.warnings || []) {
        notes.push({
          text: describeContractNoHit(w),
          // Cùng người mua, khác họ HĐ → có thể là mua tiếp theo HĐ đó (chỉ gợi ý ở form HĐ mới)
          action: w.kind === 'same_buyer' && familyReady && !isContinuation
            ? { label: `Mua tiếp theo HĐ ${w.contract_no}`, run: () => openContinueTab(w.id, w.contract_no) }
            : undefined,
        })
      }
    } else {
      console.warn('[CreatePage] Kiểm trùng số HĐ lỗi:', noRes.reason)
      message.warning(`${dichLoiHeThong(noRes.reason, 'Chưa kiểm được trùng số HĐ')} — vẫn lưu tiếp, số trùng sẽ bị chặn lúc lưu`, 5)
    }

    // ② Có thể trùng lô hàng
    let dups: PossibleDuplicate[] = []
    if (dupRes.status === 'fulfilled') {
      dups = dupRes.value
    } else {
      console.warn('[CreatePage] Kiểm trùng lô hàng lỗi:', dupRes.reason)
      message.warning(`${dichLoiHeThong(dupRes.reason, 'Chưa kiểm được đơn có thể trùng lô hàng')} — vẫn lưu tiếp`, 5)
    }

    // ③ Đợt mua tiếp: HĐ gốc chưa có file HĐ đã ký (như HA20260301) — null = không đếm được → không nhắc
    if (contCtx && contCtx.rootContractFileCount === 0) {
      notes.push({ text: `HĐ gốc ${rootNo} chưa có file HĐ đã ký — chọn đúng HĐ?` })
    }

    // ④ Người nhận đang ngừng giao dịch
    if (a.shipToId) {
      const r = pickerQ.data?.find((c) => c.id === a.shipToId)
      if (r?.status && r.status !== 'active') {
        notes.push({
          text: `Người nhận ${partyShortName(r)} đang ở trạng thái "${CUSTOMER_STATUS_LABELS[r.status as CustomerStatus] ?? r.status}" — kiểm lại trước khi giao hàng`,
        })
      }
    }
    return { blocked: false, dups, notes }
  }

  /** Hộp hỏi lại trước khi lưu: tiêu đề "Có thể trùng lô hàng với …" khi có đơn nghi trùng. true = "Vẫn tạo". */
  const confirmBeforeSave = (dups: PossibleDuplicate[], notes: PreSaveNote[], shipToId: string | null) =>
    new Promise<boolean>((resolve) => {
      let settled = false
      const done = (v: boolean) => { if (!settled) { settled = true; resolve(v) } }
      const holder: { close?: () => void } = {}
      const kindOf = (d: PossibleDuplicate) =>
        d.same_family ? 'cùng HĐ (đợt khác)'
          : d.same_buyer ? 'cùng người mua'
            : shipToId && d.ship_to_customer_id === shipToId ? 'cùng người nhận'
              : 'chéo vai mua/nhận'
      const inst = Modal.confirm({
        title: dups.length
          ? `Có thể trùng lô hàng với ${soDisplayCode(dups[0])}${dups.length > 1 ? ` (+${dups.length - 1} đơn)` : ''}`
          : 'Kiểm tra trước khi lưu',
        width: 600,
        okText: 'Vẫn tạo',
        cancelText: 'Xem lại',
        onOk: () => done(true),
        onCancel: () => done(false),
        content: (
          <div style={{ fontSize: 13, lineHeight: 1.6 }}>
            {dups.length > 0 && (
              <>
                <div style={{ marginBottom: 8 }}>
                  Đã có đơn cùng grade, cùng tấn, đơn giá lệch ≤ 0,5%, đặt trong ±7 ngày và chung một bên — có thể là
                  <b> CÙNG MỘT lô hàng</b> đã nhập rồi. Kiểm tra trước khi tạo thêm.
                </div>
                <Space orientation="vertical" size={6} style={{ width: '100%' }}>
                  {dups.slice(0, 5).map((d) => (
                    <div key={d.id} style={{ padding: '6px 10px', borderRadius: 8, border: `1px solid ${palette.warning}` }}>
                      <Space size={6} wrap>
                        <Text strong style={{ fontFamily: 'monospace' }}>{soDisplayCode(d)}</Text>
                        <EnumTag value={d.status} labels={ORDER_STATUS_LABELS} colors={ORDER_STATUS_COLORS} />
                        <Text type="secondary" style={{ fontSize: 12 }}>{kindOf(d)}</Text>
                      </Space>
                      <div style={{ fontSize: 12.5, overflowWrap: 'anywhere' }}>
                        {partyShortName(d.customer)}{d.ship_to ? ` → ${partyShortName(d.ship_to)}` : ''}
                        {' · '}{fmtNum(d.quantity_tons, 3)} t × {fmtPrice(d.unit_price, d.currency)}
                        {' · '}tạo {fmtDateShort(d.created_at)}
                      </div>
                    </div>
                  ))}
                  {dups.length > 5 && <Text type="secondary" style={{ fontSize: 12 }}>… và {dups.length - 5} đơn khác</Text>}
                </Space>
              </>
            )}
            {notes.length > 0 && (
              <div style={{ marginTop: dups.length ? 12 : 0 }}>
                {dups.length > 0 && <div style={{ fontWeight: 600, marginBottom: 4 }}>Cần xem thêm</div>}
                <ul style={{ paddingLeft: 18, margin: 0 }}>
                  {notes.map((n, i) => (
                    <li key={i} style={{ marginBottom: 4, overflowWrap: 'anywhere' }}>
                      {n.text}
                      {n.action && (
                        <Button
                          type="link"
                          size="small"
                          style={{ paddingInline: 4, height: 'auto' }}
                          onClick={() => { holder.close?.(); done(false); n.action?.run() }}
                        >
                          {n.action.label}
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ),
      })
      holder.close = () => inst.destroy()
    })

  // ── Submit ──
  const handleSubmit = async (
    asDraft: boolean,
    opts?: { silent?: boolean },
  ): Promise<{ id: string } | null> => {
    let values: any
    try {
      values = await form.validateFields()
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'errorFields' in err) return null // form validation
      message.error(dichLoiHeThong(err, 'Không thể tạo đơn hàng'))
      return null
    }

    // Validate items — dòng DỞ DANG bị CHẶN, không âm thầm vứt bỏ khi lưu
    if (blockPartialItems()) return null
    const validItems = orderItems.filter(isCompleteItem)
    if (validItems.length === 0) {
      message.error('Vui lòng thêm ít nhất 1 sản phẩm')
      return null
    }
    if (isContinuation && !contReady) {
      message.error(contCtx?.blockReason || 'Chưa nạp xong HĐ gốc — đợi một chút rồi lưu lại')
      return null
    }

    setLoading(true)
    try {
      // Đầu đơn tính từ dòng hàng (y như trước)
      const headerGrade = validItems.length === 1 ? validItems[0].grade : validItems.map(i => i.grade).join(' + ')
      const headerPrice = validItems.length === 1 ? validItems[0].unit_price : Math.round((itemsTotalUSD / itemsTotalTons) * 100) / 100
      const orderCurrency = (contCtx ? contCtx.prefill.currency : values.currency) || 'USD'
      const buyerId: string = contCtx ? contCtx.root.customer_id : values.customer_id
      const shipToId: string | null = partiesOn && values.ship_to_customer_id && values.ship_to_customer_id !== buyerId
        ? values.ship_to_customer_id
        : null
      const contractNo = String(values.contract_no || '').trim()

      const pre = await runPreSaveChecks({
        contractNo,
        buyerId,
        shipToId,
        grade: headerGrade,
        tons: itemsTotalTons,
        price: headerPrice,
        currency: orderCurrency,
        familyRootId: contCtx ? contCtx.root.id : null,
      })
      if (pre.blocked) return null
      if (pre.dups.length || pre.notes.length) {
        setLoading(false)
        const go = await confirmBeforeSave(pre.dups, pre.notes, shipToId)
        if (!go) return null
        setLoading(true)
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

      let created: SalesOrder
      if (contCtx) {
        // ── ĐỢT MUA TIẾP: người mua / đồng tiền / ngày HĐ / đơn gốc do service KHOÁ theo gốc; trường không gửi
        //    (undefined) lấy theo continuationPrefill(đơn nguồn). null / '' = Sale xoá → thắng phần điền sẵn.
        const isFobLike = ['FOB', 'EXW'].includes(String(values.incoterm || '').toUpperCase())
        const specVals: Record<string, unknown> = {}
        for (const k of SPEC_KEYS) if (values[k] !== undefined) specVals[k] = values[k]
        const input = {
          contract_no: contractNo,
          customer_po: values.customer_po || undefined,
          exchange_rate: values.exchange_rate || undefined,   // đơn VNĐ bắt buộc (không chép tỷ giá đợt trước)
          incoterm: values.incoterm || undefined,
          port_of_loading: values.port_of_loading ?? '',
          port_of_destination: isFobLike ? '' : (values.port_of_destination ?? ''),
          delivery_date: values.delivery_date ? values.delivery_date.format('YYYY-MM-DD') : undefined,
          notes: values.notes || undefined,
          ...specVals,
          commission_pct: values.commission_pct,
          commission_usd_per_mt: values.commission_usd_per_mt,
          // commission_amount: KHÔNG gửi — service tính lại theo tấn của đợt (USD quy đổi với đơn VNĐ)
          ship_to_customer_id: shipToId,
          consignee_name: values.consignee_name ?? null,
          consignee_address: values.consignee_address ?? null,
          notify_party: values.notify_party ?? null,
          notify_address: values.notify_address ?? null,
          grade: headerGrade,
          quantity_tons: itemsTotalTons,
          unit_price: headerPrice,
          bale_weight_kg: validItems[0].bale_weight_kg,
          bales_per_container: validItems[0].bales_per_container,
          packing_type: validItems[0].packing_type as PackingType,
          packing_note: aggregatedPackingNote ?? '',
          items: validItems.map((i) => ({
            grade: i.grade,
            quantity_tons: i.quantity_tons,
            unit_price: i.unit_price,
            payment_terms: i.payment_terms,
            bale_weight_kg: i.bale_weight_kg,
            bale_weights_kg: i.bale_weights_kg,
            bales_per_container: i.bales_per_container,
            packing_type: i.packing_type,
            packing_note: i.packing_note,
            ...(i.specs || {}),
          })),
        } as CreateContinuationInput
        created = await salesOrderService.createContinuation(contCtx.source.id, input)
      } else {
        // Convert dayjs to string + calc from items
        const payload: CreateSalesOrderData = {
          ...values,
          contract_no: contractNo || undefined,
          // Set header from first item (or combined)
          grade: headerGrade,
          quantity_tons: itemsTotalTons,
          unit_price: headerPrice,
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
          // Đồng tiền + tỷ giá (đơn VNĐ bắt buộc có tỷ giá — service kiểm lại)
          currency: values.currency || 'USD',
          exchange_rate: values.exchange_rate || undefined,
          // Người nhận hàng: = người mua / "Chính người mua" → NULL (service + trigger DB cũng đổi). Chưa migration
          // thì ô không hiện và service không gửi cột (safe-key).
          ship_to_customer_id: shipToId,
          // Multi-item data — từng dòng mang đồng tiền của đơn
          items: validItems.map(i => ({ ...i, currency: values.currency || 'USD' })),
        }
        created = await salesOrderService.create(payload)
      }

      // If not draft, confirm immediately
      if (!asDraft && created.id) {
        try {
          await salesOrderService.updateStatus(created.id, 'confirmed', { actor: { id: user?.employee_id || user?.id || null, name: user?.full_name || user?.email || null } })
        } catch {
          // Order created as draft, but confirmation failed — still navigate
        }
      }

      // Đã lưu → thôi cảnh báo rời trang / chấm "chưa lưu" trên tab
      setFormDirty(false)

      if (contCtx) {
        // Họ HĐ vừa thêm một đợt → chip "⧉ HĐ gốc · n đợt", khối các đợt, modal chọn HĐ gốc đọc lại
        void qc.invalidateQueries({ queryKey: salesOrderFamilyQueryKey(contCtx.root.id) })
        void qc.invalidateQueries({ queryKey: ['sales-root-contracts'] })
      }

      // silent mode: caller xử lý message + navigate (vd: upload flow cần SO trước)
      if (!opts?.silent) {
        if (contCtx) {
          // Số đợt THẬT do trigger cấp (createContinuation đã đọc lại đơn) — không lấy số dự kiến ở đầu form
          const label = soDisplayCode(created)
          const seq = created.continuation_seq
          message.success(seq
            ? `Đã tạo ${label} — đợt ${seq} của HĐ ${rootNo}`
            : `Đã tạo ${label} — đơn mua tiếp theo HĐ ${rootNo}`, 5)
          openOrderTab(created.id, label)
          // Đóng tab form mua tiếp (đã xong) — tránh bấm lưu lần nữa thành đợt trùng
          const st = useTabStore.getState()
          if (st.tabs.some((t) => t.key === ownTabKey)) st.closeTab(ownTabKey)
        } else {
          message.success(asDraft
            ? 'Đã lưu đơn — mở chi tiết để đính kèm file HĐ đã ký'
            : 'Đã xác nhận đơn hàng')
          // Mở thẳng chi tiết đơn để Sale đính kèm file HĐ ở tab "Hợp đồng"
          navigate(created?.id ? `/sales/orders/${created.id}` : '/sales/orders')
        }
      }
      return created?.id ? { id: created.id } : null
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : ''
      // Index DB chặn số trùng lúc chèn (người khác vừa lấy số này) → cùng đường gợi ý số kế tiếp
      if (isContractNoTakenError(msg)) {
        await onContractNoTaken(msg)
        return null
      }
      console.error(err)
      message.error(dichLoiHeThong(err, isContinuation ? 'Không tạo được đơn mua tiếp' : 'Không thể tạo đơn hàng'))
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

      // Check trùng số HĐ — trùng NGUYÊN VĂN (sau chuẩn hoá hoa/thường + khoảng trắng) thì chặn
      // (17/11/2026: cùng gốc số như 'HA20260053 PH' / 'HA20260053' chỉ còn là cảnh báo — checkContractNo.warnings)
      const { block } = await salesContractWorkflowService.checkContractNo(contractData.contract_no, {
        buyerId: values.customer_id,
      })
      if (block) {
        message.error(describeContractNoHit(block))
        setSubmittingReview(false)
        return
      }

      // Cùng luật với handleSubmit: dòng DỞ DANG bị CHẶN, không âm thầm vứt bỏ
      if (blockPartialItems()) {
        setSubmittingReview(false)
        return
      }
      const validItems = orderItems.filter(isCompleteItem)
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
      message.error(dichLoiHeThong(err, 'Không thể trình kiểm tra'))
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
        {/* ═══ Thông tin Hợp đồng — Các bên của đơn: Người mua → Người nhận hàng ═══ */}
        <Card size="small" style={{ marginBottom: 16, borderRadius: 12 }}
          title={<span style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'normal' }}>
            {isContinuation ? `📋 Đợt mua tiếp — HĐ ${rootNo}` : '📋 Thông tin Hợp đồng'}
          </span>}>
          <Row gutter={16}>
            <Col xs={24}>
              <Form.Item
                label="Người mua (đứng tên HĐ · trả tiền · công nợ)"
                name="customer_id"
                rules={[{ required: true, message: 'Chọn người mua' }]}
                extra={isContinuation
                  ? 'Khoá theo HĐ gốc — đợt mua tiếp luôn cùng người mua. Hàng giao cho công ty khác thì chọn ở ô Người nhận hàng.'
                  : undefined}
              >
                <Select showSearch placeholder="Chọn người mua…" optionFilterProp="label" onChange={handleCustomerChange} size="large"
                  disabled={isContinuation}
                  options={buyerOptions} />
              </Form.Item>
            </Col>

            {/* Nhắc chọn nhầm vai: khách vừa chọn làm NGƯỜI MUA từng là NGƯỜI NHẬN qua trung gian */}
            {roleHint && (() => {
              const top = roleHint.list[0]
              const topSelectable = customers.some((c) => c.id === top.id)
              return (
                <Col xs={24}>
                  <Alert
                    key={roleHint.receiverId}
                    type="warning"
                    showIcon
                    closable={{ onClose: () => setRoleHintDismissed(roleHint.receiverId) }}
                    style={{ marginBottom: 12, borderRadius: 8 }}
                    title={`${buyerShort} từng nhận hàng qua ${roleHint.list.map((x) => `${x.name} (${x.count} đơn)`).join(', ')}`}
                    description={
                      <Space orientation="vertical" size={6} style={{ width: '100%' }}>
                        <span>
                          Nếu {top.name} ký HĐ và trả tiền: <b>Người mua = {top.name}</b>, <b>Người nhận = {buyerShort}</b>.
                          {' '}Nếu lần này {buyerShort} mua thẳng thì bỏ qua (bấm ✕).
                        </span>
                        {topSelectable && (
                          <Button size="small" icon={<SwapOutlined />} onClick={() => { void swapRoles(top.id) }}>
                            Đổi giúp tôi
                          </Button>
                        )}
                      </Space>
                    }
                  />
                </Col>
              )
            })()}

            {/* Người nhận hàng (khách cuối) — chỉ khi đã migration (familyPartiesReady)
                ⚠ buyerId đọc ĐỒNG BỘ từ store (shouldUpdate): Form.useWatch của antd v6 báo trễ MỘT macrotask, trong khi
                ô Form.Item vẽ lại ngay — "Đổi giúp tôi" đặt người nhận = người mua CŨ sẽ bị PartyFields tưởng "nhận = mua"
                (buyerId còn cũ) và xoá về NULL. */}
            {partiesOn && (
              <Col xs={24}>
                <Form.Item
                  noStyle
                  shouldUpdate={(prev, cur) =>
                    prev.customer_id !== cur.customer_id || prev.ship_to_customer_id !== cur.ship_to_customer_id}
                >
                  {({ getFieldValue }) => {
                    const buyerNow = (getFieldValue('customer_id') as string | undefined) || null
                    const shipToNow = getFieldValue('ship_to_customer_id') as string | null | undefined
                    const showHint = !isContinuation && !!shipToHint && shipToHint.buyerId === buyerNow && !shipToNow
                    return (
                      <Form.Item
                        label="Người nhận hàng"
                        name="ship_to_customer_id"
                        tooltip="Công ty hàng đến (khách cuối) của RIÊNG đơn này. Giao thẳng cho người mua thì để 'Chính người mua'. Công nợ, thanh toán, hoa hồng luôn theo NGƯỜI MUA — người nhận chỉ để in chứng từ và thống kê tấn về tay khách cuối."
                        extra={showHint && shipToHint ? (
                          <Space size={6} wrap style={{ marginTop: 4 }}>
                            <span style={{ fontSize: 12 }}>
                              Đơn trước của {buyerShort} ({shipToHint.orderLabel}) giao cho <b>{shipToHint.shipToName}</b> — dùng lại?
                            </span>
                            <Button
                              size="small"
                              onClick={() => {
                                form.setFieldsValue({ ship_to_customer_id: shipToHint.shipToId })
                                setFormDirty(true)
                              }}
                            >
                              Dùng lại
                            </Button>
                          </Space>
                        ) : undefined}
                      >
                        <PartyFields buyerId={buyerNow} highlight={isContinuation && !shipToTouched} />
                      </Form.Item>
                    )
                  }}
                </Form.Item>
              </Col>
            )}

            {/* 4 ô CHỮ IN Consignee/Notify — gập mặc định; trống = chứng từ tự suy (resolveOrderParties) */}
            {partiesOn && (
              <Col xs={24}>
                <Collapse
                  ghost
                  size="small"
                  style={{ marginTop: -8, marginBottom: 12 }}
                  activeKey={printOpen ? ['print'] : []}
                  onChange={(keys) => setPrintOpen((keys as Array<string | number>).includes('print'))}
                  items={[
                    {
                      key: 'print',
                      // Luôn gắn ô vào form kể cả khi gập — chữ chép từ đợt trước phải được lưu dù Sale không mở ra
                      forceRender: true,
                      label: (
                        <Space size={6} wrap>
                          <span style={{ fontSize: 13, fontWeight: 600 }}>Chữ in Consignee / Notify (tuỳ chọn)</span>
                          {printFilledCount > 0
                            ? <Text type="warning" style={{ fontSize: 12 }}>· {printFilledCount}/4 ô đã ghi{isContinuation ? ' (chép từ đợt trước — xác nhận)' : ''}</Text>
                            : <Text type="secondary" style={{ fontSize: 12 }}>· để trống = tự suy</Text>}
                        </Space>
                      ),
                      children: (
                        <>
                          <Text type="secondary" style={{ display: 'block', fontSize: 12, marginBottom: 8 }}>
                            Để trống thì chứng từ tự suy: L/C → "TO THE ORDER OF &lt;NH phát hành&gt;"; có người nhận → tên + địa chỉ
                            người nhận (XNK chốt ở thẻ Các bên trong chi tiết đơn); không thì theo hồ sơ chứng từ của người mua.
                            Chỉ gõ khi cần in "TO ORDER", tên forwarder, hoặc tên/địa chỉ khác hồ sơ.
                          </Text>
                          <Row gutter={12}>
                            <Col xs={24} sm={12}>
                              <Form.Item label="Consignee — tên" name="consignee_name" style={{ marginBottom: 8 }}>
                                <TextArea autoSize={{ minRows: 1, maxRows: 3 }} maxLength={300} placeholder="vd TO ORDER" />
                              </Form.Item>
                            </Col>
                            <Col xs={24} sm={12}>
                              <Form.Item label="Consignee — địa chỉ" name="consignee_address" style={{ marginBottom: 8 }}>
                                <TextArea autoSize={{ minRows: 1, maxRows: 4 }} maxLength={500} />
                              </Form.Item>
                            </Col>
                            <Col xs={24} sm={12}>
                              <Form.Item label="Notify party — tên" name="notify_party" style={{ marginBottom: 8 }}>
                                <TextArea autoSize={{ minRows: 1, maxRows: 3 }} maxLength={300} />
                              </Form.Item>
                            </Col>
                            <Col xs={24} sm={12}>
                              <Form.Item label="Notify — địa chỉ" name="notify_address" style={{ marginBottom: 8 }}>
                                <TextArea autoSize={{ minRows: 1, maxRows: 4 }} maxLength={500} />
                              </Form.Item>
                            </Col>
                          </Row>
                        </>
                      ),
                    },
                  ]}
                />
              </Col>
            )}
          </Row>
          <Row gutter={16}>
            <Col xs={24} sm={isContinuation ? 10 : 8}>   {/* đợt mua tiếp: ô số "HA20260302-D3" + nút Đổi số cần rộng hơn */}
              {isContinuation ? (
                // Số ĐƠN của đợt: hệ thống GỢI Ý '<số HĐ gốc>-D<n>', Sale xác nhận hoặc "Đổi số" (khách cấp PI số riêng / L/C ghi số khác)
                <Form.Item
                  label={`Số đơn${contCtx ? ` · đợt ${contCtx.nextSeq}` : ''}`}
                  required
                  tooltip={`Số của RIÊNG đợt này — gốc số chứng từ PKL/WL… của đợt. Ô CONTRACT NO. trên chứng từ vẫn in số HĐ gốc ${rootNo}. Hệ thống gợi ý số; khách cấp PI số riêng hoặc L/C ghi số khác thì bấm "Đổi số".`}
                >
                  <Space.Compact style={{ width: '100%' }}>
                    <Form.Item
                      name="contract_no"
                      noStyle
                      rules={[{ required: true, whitespace: true, message: 'Nhập số đơn cho đợt mua tiếp' }]}
                    >
                      <Input
                        ref={contractNoInputRef}
                        size="large"
                        readOnly={!editNo}
                        variant={editNo ? 'outlined' : 'filled'}
                        placeholder="Số đơn của đợt"
                        style={{ fontFamily: 'monospace' }}
                      />
                    </Form.Item>
                    {editNo ? (
                      <Button
                        size="large"
                        icon={<UndoOutlined />}
                        disabled={!contCtx?.suggestedNo}
                        title="Quay về số hệ thống gợi ý"
                        onClick={() => {
                          form.setFields([{ name: 'contract_no', value: contCtx?.suggestedNo, errors: [] }])
                          setEditNo(false)
                          setFormDirty(true)
                        }}
                      >
                        Số gợi ý
                      </Button>
                    ) : (
                      <Button
                        size="large"
                        icon={<EditOutlined />}
                        onClick={() => {
                          setEditNo(true)
                          setTimeout(() => contractNoInputRef.current?.focus({ cursor: 'all' }), 60)
                        }}
                      >
                        Đổi số
                      </Button>
                    )}
                  </Space.Compact>
                </Form.Item>
              ) : (
                <Form.Item
                  label="Số HĐ (tuỳ chọn)"
                  name="contract_no"
                  tooltip="Số in trên HĐ và chứng từ (PKL/WL…) — không được trùng đơn chưa huỷ khác. Chưa có thì để trống, điền sau ở tab Hợp đồng."
                >
                  <Input placeholder="vd HA20260310" size="large" />
                </Form.Item>
              )}
            </Col>
            <Col xs={24} sm={isContinuation ? 7 : 8}>
              <Form.Item
                label={isContinuation ? 'Ngày HĐ (= HĐ gốc)' : 'Ngày HĐ'}
                name="contract_date"
                tooltip={isContinuation ? 'Đợt mua tiếp dùng ngày ký HĐ gốc (khoá). Ngày đặt của đợt = ngày tạo đơn.' : undefined}
              >
                <DatePicker style={{ width: '100%' }} size="large" format="DD/MM/YYYY" disabled={isContinuation} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={isContinuation ? 7 : 8}>
              <Form.Item
                label="PO# khách hàng (tuỳ chọn)"
                name="customer_po"
                tooltip={isContinuation ? 'Số PO khách đặt cho RIÊNG đợt này (in "PO NO:" trên Invoice) — không chép từ đợt trước.' : undefined}
              >
                <Input placeholder="Số PO" size="large" />
              </Form.Item>
            </Col>
          </Row>
        </Card>

        {/* ═══ Sản phẩm & Giá — Multi-item ═══ */}
        <Card size="small" style={{ marginBottom: 16, borderRadius: 12 }}
          title={<Space><span style={{ fontSize: 14, fontWeight: 600 }}>Sản phẩm & Giá</span><Tag color="blue">{orderItems.length} sản phẩm</Tag></Space>}
          extra={<Button size="small" type="dashed" onClick={addItem} icon={<span>+</span>}>Thêm SP</Button>}>

          {/* Đồng tiền của đơn — USD xuất khẩu / VNĐ bán nội địa. Áp cho mọi dòng sản phẩm. */}
          <Row gutter={12} style={{ marginBottom: 10 }}>
            <Col xs={12} sm={7}>
              <Form.Item
                name="currency"
                label={<span style={{ fontSize: 11, color: '#999' }}>Đồng tiền{isContinuation ? ' (theo HĐ gốc)' : ''}</span>}
                tooltip={isContinuation ? 'Đợt mua tiếp phải cùng đồng tiền với HĐ gốc — đổi đồng tiền thì làm HĐ mới.' : undefined}
                style={{ marginBottom: 0 }}
              >
                <Select options={SALES_CURRENCY_OPTIONS} popupMatchSelectWidth={false} disabled={isContinuation} />
              </Form.Item>
            </Col>
            {vnd && (
              <Col xs={12} sm={9}>
                <Form.Item
                  name="exchange_rate"
                  label={<span style={{ fontSize: 11, color: '#999' }}>Tỷ giá VND/USD (quy đổi báo cáo)</span>}
                  rules={[{ required: true, message: 'Đơn VNĐ cần tỷ giá' }]}
                  style={{ marginBottom: 0 }}
                >
                  <InputNumber min={1} step={100} style={{ width: '100%' }} placeholder="25.500" {...vndInputProps} />
                </Form.Item>
              </Col>
            )}
          </Row>

          {orderItems.map((item, idx) => (
            <div key={item.key} style={{ background: idx % 2 === 0 ? '#fafafa' : '#fff', padding: '12px', borderRadius: 8, marginBottom: 8, border: invalidKeys.includes(item.key) ? '1px solid #ff4d4f' : '1px solid #f0f0f0' }}>
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
                    <span style={{ color: '#ff4d4f' }}>*</span> {priceUnitLabel(currency)}
                  </div>
                  {/* Đợt mua tiếp: KHÔNG chép đơn giá — giá đợt trước chỉ làm placeholder */}
                  {vnd ? (
                    <InputNumber value={item.unit_price || undefined} min={0} step={100000} style={{ width: '100%' }}
                      placeholder={item.last_unit_price ? `đợt trước ${fmtPrice(item.last_unit_price, currency)}` : '35.000.000'}
                      title={item.last_unit_price ? `Đơn giá đợt trước: ${fmtPrice(item.last_unit_price, currency)}/tấn — nhập giá của đợt này` : undefined}
                      {...vndInputProps}
                      onChange={(v) => updateItem(item.key, 'unit_price', v || 0)} />
                  ) : (
                    <InputNumber value={item.unit_price || undefined} min={0} {...usdInputProps} step={10} style={{ width: '100%' }}
                      placeholder={item.last_unit_price ? `đợt trước ${fmtPrice(item.last_unit_price, currency)}` : '1,924'}
                      title={item.last_unit_price ? `Đơn giá đợt trước: ${fmtPrice(item.last_unit_price, currency)}/tấn — nhập giá của đợt này` : undefined}
                      onChange={(v) => updateItem(item.key, 'unit_price', v || 0)} />
                  )}
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
                    onChange={(v) => updateItem(item.key, 'bales_per_container', v || defaultBalesPerContainer(item.bale_weight_kg || 35, null))} />
                </Col>
                <Col xs={24} sm={8}>
                  <div style={{ fontSize: 11, color: '#999', marginBottom: 2, marginTop: 4 }}>Đóng gói</div>
                  <Select value={item.packing_type} style={{ width: '100%' }}
                    popupMatchSelectWidth={false}
                    options={[
                      { value: 'loose_bale', label: 'Loose Bale' },
                      { value: 'sw_plastic_pallet', label: 'Shrink Wrapped plastic pallets' },
                      { value: 'sw_wooden_pallet', label: 'Shrink Wrapped wooden pallets' },
                      { value: 'plastic_pallet', label: 'Plastic Pallet' },
                      { value: 'wooden_pallet', label: 'Wooden Pallet' },
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
                      {balesFromTons(item.quantity_tons, item.bale_weight_kg || 35).toLocaleString('vi-VN')} bành |
                      {' '}{containersFromBales(balesFromTons(item.quantity_tons, item.bale_weight_kg || 35), item.bales_per_container || defaultBalesPerContainer(item.bale_weight_kg || 35, null))} cont
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

        {/* ═══ Chỉ tiêu kỹ thuật + Ghi chú (collapsible) ═══
            forceRender: ô luôn gắn vào form kể cả khi gập — đợt mua tiếp điền sẵn chỉ tiêu/hoa hồng từ đơn nguồn,
            Sale không mở ra thì giá trị vẫn phải được lưu (và Sale xoá đi thì phải xoá được). */}
        <Collapse
          ghost
          style={{ marginBottom: 16 }}
          items={[
            {
              key: 'quality',
              forceRender: true,
              label: <span style={{ fontSize: 13, fontWeight: 600 }}>📊 Chỉ tiêu kỹ thuật (mở rộng để sửa){isContinuation ? ' — chép từ đợt trước' : ''}</span>,
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
              forceRender: true,
              label: <span style={{ fontSize: 13, fontWeight: 600 }}>💰 Hoa hồng môi giới (mở khi có){isContinuation && (commissionPct > 0 || commissionUsdPerMt > 0) ? ' — chép tỉ lệ đợt trước, tiền tính lại theo tấn đợt này' : ''}</span>,
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
              forceRender: true,
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
        {/* ═══ Thông tin người mua (đứng tên HĐ) ═══ */}
        {selectedCustomer && (
          <Card size="small" style={{ marginBottom: 12, borderRadius: 12, background: '#fafffe', borderColor: '#d9f7e8' }}
            title={<span style={{ fontSize: 13, fontWeight: 600, color: '#1B4D3E' }}>Thông tin người mua</span>}>
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
                {hasFlexibleBaleWeight ? 'Linh động' : itemsTotalBales.toLocaleString('vi-VN')}
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
              <div style={{ fontSize: 11, color: '#999' }}>Giá trị {vnd ? 'VNĐ' : 'USD'}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#10b981' }}>
                {fmtMoney(itemsTotalUSD, currency)}
              </div>
              {vnd && (
                <div style={{ fontSize: 11, color: '#999' }}>
                  {exchangeRateWatch > 0
                    ? `≈ ${fmtMoney(itemsTotalUSD / exchangeRateWatch, 'USD')} theo tỷ giá ${Number(exchangeRateWatch).toLocaleString('vi-VN')}`
                    : 'Nhập tỷ giá để quy đổi USD (công nợ, báo cáo cộng chung USD)'}
                </div>
              )}
            </Col>
          </Row>
        </Card>

        {/* ═══ Action buttons — luồng ĐƠN GIẢN (2026-08-05) ═══
            Bỏ hẳn quy trình duyệt/ký phức tạp (form mẫu không cover hết HĐ thật).
            Sale tự quản HĐ: tạo đơn → lấy/soạn Word → ký ngoài → đính kèm file đã ký
            ở tab "Hợp đồng" của đơn (ContractFileSection). Không còn reviewing/approved/signed.
            10 HĐ workflow cũ đã archive — vẫn xem được lịch sử ở tab Hợp đồng. */}
        <Card size="small" style={{ marginTop: 12, borderRadius: 12 }}>
          {isContinuation ? (
            // Đợt mua tiếp: KHÔNG ký HĐ mới → ẩn bước "Lấy file Word HĐ"
            <Space orientation="vertical" style={{ width: '100%' }} size={8}>
              <Alert
                showIcon
                icon={<BranchesOutlined style={{ color: palette.brand }} />}
                style={{ borderRadius: 8, fontSize: 12, background: palette.brandBg, borderColor: palette.brand }}
                title="Đợt mua tiếp — không ký HĐ mới"
                description={
                  <div style={{ fontSize: 12, lineHeight: 1.7 }}>
                    Lưu xong sẽ <b>mở chi tiết đơn</b>. Nên đính <b>PI khách ký / phụ lục / email đặt hàng</b> của đợt này
                    ở tab "Hợp đồng" (không bắt buộc). Chứng từ in ô CONTRACT NO. theo HĐ gốc{rootNo ? ` ${rootNo}` : ''}.
                  </div>
                }
              />
              <Button
                type="primary"
                icon={<SaveOutlined />}
                block
                size="large"
                loading={loading}
                disabled={!contReady}
                onClick={() => handleSubmit(true)}
                style={{ background: palette.brand, borderColor: palette.brand, fontWeight: 600 }}
              >
                Tạo đơn mua tiếp{contCtx ? ` (đợt ${contCtx.nextSeq})` : ''}
              </Button>
              <div style={{ fontSize: 11, color: '#8c8c8c', textAlign: 'center' }}>
                Đơn mới ở trạng thái Nháp → Xác nhận → các bộ phận như đơn thường. Tiền, lô, công nợ của đợt tách riêng.
              </div>
            </Space>
          ) : (
          <Space direction="vertical" style={{ width: '100%' }} size={8}>
            <Alert
              type="success"
              showIcon
              style={{ borderRadius: 8, fontSize: 12 }}
              title="Làm hợp đồng — đơn giản 2 bước"
              description={
                <div style={{ fontSize: 12, lineHeight: 1.7 }}>
                  <b>①</b> Tạo đơn hàng (lưu) → <b>②</b> Lấy/soạn file Word HĐ → ký + đóng dấu →{' '}
                  <b>đính kèm file đã ký</b> ở tab "Hợp đồng" của đơn.
                  <br /><span style={{ color: '#52803f' }}>Không còn bước trình duyệt — Sale tự quản HĐ của mình.</span>
                  {familyReady && (
                    <>
                      <br />Khách mua thêm theo HĐ ĐÃ KÝ? Không cần số HĐ mới —{' '}
                      <a onClick={() => setRootPickerOpen(true)}>Mua tiếp theo HĐ đã ký…</a>
                    </>
                  )}
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
              Lưu đơn xong sẽ <b>mở chi tiết đơn</b> để bạn đính kèm file HĐ đã ký (tab "Hợp đồng").
            </div>

            {/* ── BƯỚC ② lấy file Word HĐ (tùy chọn — máy điền sẵn) ── */}
            <Divider style={{ margin: '4px 0' }}>
              <Tag color="blue" style={{ fontSize: 11 }}>② Lấy file Word HĐ (tùy chọn)</Tag>
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
              Máy điền số liệu form vào mẫu Word cho bạn bản nháp nhanh — <b>hoặc tự soạn Word</b> nếu HĐ đặc thù.
              <br />Ký + đóng dấu xong → vào chi tiết đơn, tab <b>"Hợp đồng"</b>, đính kèm file đã ký.
            </div>
          </Space>
          )}
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

  const rootCustomerShort = contCtx ? partyShortName(contCtx.root.customer) : ''
  const sourceIsRoot = !!contCtx && contCtx.source.id === contCtx.root.id

  return (
    <div style={{ padding: isPhone ? 12 : '16px 24px' }}>
      {/* Breadcrumb */}
      <Breadcrumb
        style={{ marginBottom: 12 }}
        items={[
          { title: 'Đơn hàng bán' },
          {
            title: <a onClick={() => navigate('/sales/orders')}>Danh sách</a>,
          },
          { title: isContinuation ? `Mua tiếp${rootNo ? ` HĐ ${rootNo}` : ''}` : 'Tạo mới' },
        ]}
      />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/sales/orders')} />
        <Title level={4} style={{ margin: 0 }}>
          {isContinuation ? 'Tạo đơn mua tiếp' : 'Tạo đơn hàng bán'}
        </Title>
        {!isContinuation && !isPhone && (
          <span style={{ marginLeft: 'auto', color: '#999', fontSize: 12 }}>
            Lưu đơn → đính kèm file HĐ đã ký ở tab "Hợp đồng" của đơn
          </span>
        )}
      </div>

      {/* ── Chế độ MUA TIẾP: nạp HĐ gốc — đang tải / lỗi (Thử lại) / không tạo được (lý do) ── */}
      {isContinuation && !contReady ? (
        <PageState
          loading={ctxQ.isPending}
          error={ctxQ.error}
          onRetry={() => { void ctxQ.refetch() }}
          minHeight={240}
        >
          {contCtx?.blockReason ? (
            <Alert
              type="error"
              showIcon
              style={{ borderRadius: 10 }}
              title="Không tạo được đơn mua tiếp"
              description={
                <Space orientation="vertical" size={8} style={{ width: '100%' }}>
                  <span>{contCtx.blockReason}</span>
                  <Space size={8} wrap>
                    <Button onClick={() => openOrderTab(contCtx.root.id, rootNo || contCtx.root.code)}>Mở HĐ gốc</Button>
                    {!sourceIsRoot && (
                      <Button onClick={() => openOrderTab(contCtx.source.id, soDisplayCode(contCtx.source))}>Mở đơn đã chọn</Button>
                    )}
                    <Button onClick={() => navigate('/sales/orders')}>Về Sổ đơn</Button>
                  </Space>
                </Space>
              }
            />
          ) : null}
        </PageState>
      ) : (
        <>
          {contCtx && (
            <>
              {/* Đầu form Mua tiếp — số đợt là DỰ KIẾN (trigger cấp số thật lúc lưu) */}
              <Alert
                showIcon
                icon={<BranchesOutlined style={{ color: palette.brand }} />}
                style={{ marginBottom: 12, borderRadius: 10, background: palette.brandBg, borderColor: palette.brand }}
                title={
                  <span style={{ overflowWrap: 'anywhere' }}>
                    Mua tiếp theo HĐ <b style={{ fontFamily: 'monospace' }}>{rootNo}</b> · {rootCustomerShort}
                    {' '}· ký {fmtDate(contCtx.root.contract_date || contCtx.root.order_date)}
                    {' '}— sẽ là <b>đợt {contCtx.nextSeq}</b> (họ đang có {contCtx.totals.orders} đợt, {fmtNum(contCtx.totals.tons, 3)} t).
                  </span>
                }
                description={
                  <div style={{ fontSize: 13, lineHeight: 1.6 }}>
                    Không cần ký HĐ mới; sau khi lưu có thể đính PI / phụ lục / email ở tab Hợp đồng.
                    {!sourceIsRoot && (
                      <> Quy cách chép từ đợt <b style={{ fontFamily: 'monospace' }}>{soDisplayCode(contCtx.source)}</b>.</>
                    )}
                    {' '}Tấn, đơn giá, ETD, PO khách, L/C, ghi chú, tỷ giá KHÔNG chép — nhập cho đợt này.
                    {' '}<a onClick={() => openOrderTab(contCtx.root.id, rootNo)}>Mở HĐ gốc</a>
                  </div>
                }
              />
              {contCtx.rootContractFileCount === 0 && (
                <Alert
                  type="warning"
                  showIcon
                  style={{ marginBottom: 12, borderRadius: 10 }}
                  title={`HĐ gốc ${rootNo} chưa có file HĐ đã ký — chọn đúng HĐ?`}
                  description="Đợt mua tiếp dựa trên HĐ gốc đã ký. Nếu HĐ này chưa ký hoặc là đơn tạm, có thể cần tạo HĐ mới thay vì mua tiếp."
                />
              )}
            </>
          )}

          {/* Form single-page — quy trình upload (2026-05-20): bỏ compose UI */}
          {/* Phase 1: smart defaults — contract_date=hôm nay, incoterm=FOB, POL=Đà Nẵng */}
          <Form
            form={form}
            layout="vertical"
            requiredMark
            preserve
            onValuesChange={(changed: Record<string, unknown>) => {
              setFormDirty(true)
              if ('ship_to_customer_id' in changed) setShipToTouched(true)
            }}
            initialValues={{
              contract_date: dayjs(),
              incoterm: 'FOB',
              port_of_loading: 'DA_NANG',
              currency: 'USD',
            }}
          >
            {renderStep1()}
          </Form>
        </>
      )}

      {/* Form HĐ mới → "Mua tiếp theo HĐ đã ký…": chọn HĐ gốc rồi mở tab tạo đợt (đơn nguồn = đợt mới nhất của họ) */}
      {familyReady && !isContinuation && (
        <RootContractPickerModal
          open={rootPickerOpen}
          onClose={() => setRootPickerOpen(false)}
          onPick={(r) => openContinueTab(r.latest_member_id || r.id, r.contract_no)}
        />
      )}
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
      message.error(dichLoiHeThong(err, 'Upload thất bại'))
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
