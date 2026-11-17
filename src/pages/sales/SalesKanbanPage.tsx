// ============================================================================
// SalesKanbanPage — Kanban board with 7 swimlanes
// File: src/pages/sales/SalesKanbanPage.tsx
// Phần Sprint 1 D3 (Sales Tracking & Control)
// ============================================================================

import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Input, Select, message, Spin, Button, Modal, Empty, Dropdown, Space, Tooltip } from 'antd'
import { Search, RefreshCw, Plus, List, ChevronDown } from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { getTabComponent } from '../../stores/tabStore'
import { salesStageService } from '../../services/sales/salesStageService'
import { getSalesRole, salesPermissions } from '../../services/sales/salesPermissionService'
import QuickPayModal, { type QuickPayTarget } from './components/QuickPayModal'
import { salesOrderPaymentService, type OrderLotMoney } from '../../services/sales/salesOrderPaymentService'
import { salesOrderService, familyTotals, type RootContractOption } from '../../services/sales/salesOrderService'
import { fmtMoney, isVnd } from '../../services/sales/salesMoney'
import { dichLoiHeThong } from '../../utils/dichLoiHeThong'
import { fmtNum } from '../../utils/format'
import { palette } from '../../theme/palette'
import PageState from '../../components/common/PageState'
import { useOpenTab } from '../../hooks/useOpenTab'
import RootContractPickerModal from './components/RootContractPickerModal'
import { useFamilyPartiesReady } from './components/OrderFamilyChip'
import {
  SALES_STAGES,
  SALES_STAGE_LABELS,
  SALES_STAGE_EMOJI,
  paymentBucket,
  isUnpaid,
  outstandingUsd,
  type SalesStage,
} from '../../services/sales/salesStages'

// Tiền USD gọn cho KPI cột (vd $5.90M, $307K) — fmtMoney compact (salesMoney), không tự chép formatter
const fmtUsdCompact = (v: number): string => fmtMoney(v, 'USD', { compact: true })

// Stage rank cho forward-only validation
const STAGE_RANK: Record<SalesStage, number> = {
  sales: 1,
  raw_material: 2,
  production: 3,
  qc: 4,
  packing: 5,
  logistics: 6,
  delivered: 7,
}
import KanbanCard, { type KanbanOrder } from './components/KanbanCard'
import { dispatchService, type LotProgress } from '../../services/logistics/dispatchService'
import { soDisplayCode, partyShortName } from '../../services/sales/salesTypes'

/** Thẻ Kanban + id người phụ trách — lọc "Của tôi" so theo ID, không so chuỗi tên. */
type KanbanRow = KanbanOrder & { current_owner_id: string | null }

/** Một họ HĐ trên bảng (gốc + các đợt mua tiếp đang chạy) — CHỈ gồm các đơn đã nạp (đơn chưa huỷ). */
interface BoardFamily {
  rootId: string
  /** Số HĐ gốc (số đơn của đơn gốc) */
  rootNo: string
  rootDate: string | null
  /** Tên ngắn người mua (cả họ cùng một người mua — trigger bắt) */
  buyer: string
  members: KanbanRow[]
}

/**
 * Gom các thẻ theo HĐ gốc (gốc = parent_order_id ?? id). Đếm trên MỌI đơn đã nạp, không trên danh sách đã lọc:
 * cỡ họ là thuộc tính của HĐ, không đổi khi bật bộ lọc. listForKanban chỉ nạp đơn chưa huỷ → cỡ họ = 1 + số đợt
 * đang chạy, khớp salesOrderService.getFamilyCounts.
 */
function buildFamilies(rows: KanbanRow[]): Map<string, BoardFamily> {
  const m = new Map<string, BoardFamily>()
  for (const o of rows) {
    const rootId = o.parent_order_id || o.id
    let f = m.get(rootId)
    if (!f) {
      f = { rootId, rootNo: '', rootDate: null, buyer: o.customer_short, members: [] }
      m.set(rootId, f)
    }
    f.members.push(o)
    if (o.id === rootId) {
      f.rootNo = soDisplayCode(o)
      f.buyer = o.customer_short
    } else {
      if (!f.rootNo && o.parent_contract_no) f.rootNo = o.parent_contract_no
      if (!f.rootDate && o.parent_contract_date) f.rootDate = o.parent_contract_date
    }
  }
  return m
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function SalesKanbanPage() {
  const user = useAuthStore(s => s.user)
  const navigate = useNavigate()
  const openTab = useOpenTab()
  const salesRole = getSalesRole(user)
  const canCollect = ['accounting', 'admin'].includes(salesRole || '')
  // Họ HĐ / người nhận: chỉ bật khi migration sales_family_parties_p1 đã áp (đang tải / lỗi → ẩn, an toàn)
  const familyReady = useFamilyPartiesReady()
  const canContinue = familyReady && !!salesRole && salesPermissions.canCreateOrder(salesRole)
  const [orders, setOrders] = useState<KanbanRow[]>([])
  const [lotProgress, setLotProgress] = useState<Record<string, LotProgress>>({})
  const [lotPay, setLotPay] = useState<Record<string, OrderLotMoney>>({})
  const [loading, setLoading] = useState(true)
  // Lỗi tải ≠ "cột nào cũng rảnh" — hiện khối lỗi + Thử lại thay cho bảng trống
  const [loadError, setLoadError] = useState<unknown>(null)
  const [search, setSearch] = useState('')
  const [filterEtd, setFilterEtd] = useState<'all' | '7d' | '14d' | '30d'>('all')
  const [showOnlyMine, setShowOnlyMine] = useState(false)
  const [showOnlyOverdue, setShowOnlyOverdue] = useState(false)
  const [showOnlyUnpaid, setShowOnlyUnpaid] = useState(false)   // Chỉ đơn chưa thu tiền
  const [showOnlyFamily, setShowOnlyFamily] = useState(false)   // ⧉ Mua tiếp: chỉ thẻ thuộc HĐ có đợt mua tiếp
  // SOI HĐ: id ĐƠN GỐC đang soi — thẻ cùng họ ở mọi cột có vành thương hiệu, thẻ khác mờ
  const [familyFocus, setFamilyFocus] = useState<string | null>(null)
  const [rootPickerOpen, setRootPickerOpen] = useState(false)
  const [dragOverSettled, setDragOverSettled] = useState(false) // kéo card vào cột "Đã tất toán"
  const [payTarget, setPayTarget] = useState<QuickPayTarget | null>(null)
  const [dragOverStage, setDragOverStage] = useState<SalesStage | null>(null)
  const [confirmTransition, setConfirmTransition] = useState<{
    orderId: string
    orderCode: string
    fromStage: SalesStage
    toStage: SalesStage
  } | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // ── Fetch ── (truy vấn ở salesOrderService.listForKanban — trước đây trang gọi supabase thẳng)
  const fetchOrders = async () => {
    setLoading(true)
    setLoadError(null)
    let data: Awaited<ReturnType<typeof salesOrderService.listForKanban>>
    try {
      data = await salesOrderService.listForKanban()
    } catch (error) {
      setLoading(false)
      // Lỗi token của Supabase trả về chuỗi tiếng Anh khó hiểu ("JWT expired",
      // "JWT issued at future"). Người dùng ở nhà máy không biết phải làm gì với nó, nên dịch
      // sang việc họ CẦN LÀM. Riêng PGRST303 là bug hạ tầng Supabase, src/lib/supabase.ts đã
      // tự thử lại 3 lần — tới được đây nghĩa là cả 4 lần đều trượt.
      // listForKanban ném NGUYÊN lỗi PostgREST nên vẫn đọc được code PGRST301/303.
      const e = error as { code?: string; message?: string } | null
      const isJwt = /jwt|token/i.test(e?.message || '') || ['PGRST301', 'PGRST303'].includes(e?.code || '')
      message.error(
        isJwt
          ? 'Phiên đăng nhập có vấn đề — bấm Làm mới, nếu vẫn lỗi thì đăng xuất rồi đăng nhập lại.'
          : dichLoiHeThong(error, 'Lỗi tải đơn'),
        6,
      )
      setLoadError(error || new Error('Lỗi tải đơn'))
      return
    }
    setLoading(false)

    const mapped: KanbanRow[] = data.map((o) => ({
      id: o.id,
      code: o.code,
      contract_no: o.contract_no,
      // Tên NGẮN (36/66 khách trống short_name — có cả HARMONYTIDE, QINGDAO JINTONG): bỏ đuôi pháp nhân
      customer_short: partyShortName(o.customer),
      customer_name: o.customer?.name || null,
      grade: o.grade,
      quantity_tons: o.quantity_tons,
      status: o.status,
      total_value_usd: o.total_value_usd,
      // Đồng tiền của đơn — thẻ (KanbanCard) vẽ tiền theo đúng ký hiệu $/₫ (đơn VNĐ không hiện "$")
      currency: o.currency ?? null,
      total_value_vnd: o.total_value_vnd ?? null,
      payment_status: o.payment_status || null,
      actual_payment_amount: o.actual_payment_amount ?? null,
      delivery_date: o.delivery_date,
      etd: o.etd,
      current_stage: (o.current_stage as SalesStage) || 'sales',
      stage_started_at: o.stage_started_at,
      stage_sla_hours: o.stage_sla_hours,
      current_owner_name: o.owner?.full_name || null,
      current_owner_id: o.current_owner_id ?? null,   // đã có trong select — trước đây bị bỏ khi map
      // Người nhận hàng riêng (ship_to gắn bằng attachShipTo). Có id mà mất hồ sơ → vẫn báo có người nhận.
      receiver_short: o.ship_to_customer_id
        ? (o.ship_to ? partyShortName(o.ship_to) : 'không rõ người nhận')
        : null,
      receiver_name: o.ship_to?.name || null,
      parent_order_id: o.parent_order_id,
      parent_contract_no: o.parent ? (o.parent.contract_no || o.parent.code) : null,
      parent_contract_date: o.parent?.contract_date ?? null,
      continuation_seq: o.continuation_seq,
    }))
    setOrders(mapped)
    const ids = mapped.map((o) => o.id)
    // Tiến độ lô cho card kanban (best-effort)
    dispatchService.getLotProgressForOrders(ids)
      .then(setLotProgress)
      // Xem ghi chú cùng chỗ ở SalesOrderListPage: hỏng thì xoá trắng + log, đừng im lặng.
      // lotProgress rỗng làm badge "còn thiếu" trên thẻ hiện nguyên số lượng hợp đồng.
      .catch((e) => { console.error('[sales] Không tải được tiến độ lô:', e); setLotProgress({}) })
    // Trục TIỀN theo lô — nuôi máng dưới của viên lô trên thẻ.
    salesOrderPaymentService.getLotPaymentForOrders(ids)
      .then(setLotPay)
      .catch((e) => { console.error('[sales] Không tải được tiền theo lô:', e); setLotPay({}) })
  }

  useEffect(() => { fetchOrders() }, [])

  // ── Họ HĐ: đếm client trên MỌI đơn đã nạp (như byStage) rồi gắn family_size / ngày ký HĐ gốc vào thẻ ──
  const families = useMemo(() => buildFamilies(orders), [orders])
  const boardRows = useMemo<KanbanRow[]>(() => orders.map((o) => {
    const f = families.get(o.parent_order_id || o.id)
    if (!f || f.members.length < 2) return o
    return { ...o, family_size: f.members.length, family_contract_date: f.rootDate }
  }), [orders, families])

  // Họ đang soi đã biến mất (đợt bị huỷ, làm mới) → tự bỏ soi, khỏi kẹt băng soi rỗng
  useEffect(() => {
    if (familyFocus && (families.get(familyFocus)?.members.length ?? 0) < 2) setFamilyFocus(null)
  }, [families, familyFocus])
  // Esc = Bỏ soi
  useEffect(() => {
    if (!familyFocus) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFamilyFocus(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [familyFocus])

  // ── Filter ──
  const filtered = useMemo(() => {
    return boardRows.filter(o => {
      if (search) {
        const s = search.toLowerCase()
        // Khớp thêm SỐ HĐ GỐC (gõ 'HA20260302' ra cả họ, kể cả đợt mang số riêng HA20260301) và TÊN NGƯỜI NHẬN
        // (gõ 'jintong' ra đơn Jintong mua thẳng lẫn đơn Harmonytide giao Jintong).
        const match =
          o.code.toLowerCase().includes(s) ||
          (o.contract_no || '').toLowerCase().includes(s) ||
          o.customer_short.toLowerCase().includes(s) ||
          (o.customer_name || '').toLowerCase().includes(s) ||
          (o.parent_contract_no || '').toLowerCase().includes(s) ||
          (o.receiver_short || '').toLowerCase().includes(s) ||
          (o.receiver_name || '').toLowerCase().includes(s) ||
          (o.grade || '').toLowerCase().includes(s)
        if (!match) return false
      }
      // ⧉ Mua tiếp: đúng những thẻ có dòng ⧉ (gốc có đợt + các đợt)
      if (showOnlyFamily && !o.parent_order_id && (o.family_size ?? 1) < 2) return false
      if (filterEtd !== 'all' && o.etd) {
        const days = (new Date(o.etd).getTime() - Date.now()) / (1000 * 3600 * 24)
        const cutoff = filterEtd === '7d' ? 7 : filterEtd === '14d' ? 14 : 30
        if (days > cutoff) return false
      }
      if (showOnlyMine && user?.employee_id) {
        // So theo ID người phụ trách (trước đây so chuỗi tên: trùng tên / gõ khác một dấu là lọc câm)
        if (o.current_owner_id !== user.employee_id) return false
      }
      if (showOnlyOverdue) {
        if (!o.stage_started_at || !o.stage_sla_hours) return false
        const elapsed = (Date.now() - new Date(o.stage_started_at).getTime()) / (1000 * 3600)
        if (elapsed <= o.stage_sla_hours) return false
      }
      if (showOnlyUnpaid && !isUnpaid(o)) return false   // chỉ đơn đã tới khâu thu mà chưa thu đủ
      return true
    })
  }, [boardRows, search, filterEtd, showOnlyMine, showOnlyOverdue, showOnlyUnpaid, showOnlyFamily, user])

  /** Số thẻ đang có dòng ⧉ — nhãn nút lọc "⧉ Mua tiếp" */
  const familyCardCount = useMemo(
    () => boardRows.filter((o) => !!o.parent_order_id || (o.family_size ?? 1) >= 2).length,
    [boardRows],
  )

  // ── SOI HĐ: chỉ là phép CỘNG trên các đơn đã nạp (mỗi đơn một khoản phải thu riêng — không phải mẫu số công nợ) ──
  const focus = useMemo(() => {
    if (!familyFocus) return null
    const f = families.get(familyFocus)
    if (!f || f.members.length < 2) return null
    const visible = new Set(filtered.map((o) => o.id))
    return {
      ...f,
      totals: familyTotals(f.members),
      hidden: f.members.filter((m) => !visible.has(m.id)).length,
      vnd: f.members.some((m) => isVnd(m.currency)),
    }
  }, [familyFocus, families, filtered])

  /** Thẻ thuộc họ đang soi → 'focus' (vành), thẻ khác → 'dim' (mờ). Không soi → không đổi gì. */
  const highlightOf = (o: KanbanRow): 'focus' | 'dim' | null =>
    !focus ? null : (o.parent_order_id || o.id) === focus.rootId ? 'focus' : 'dim'
  const toggleFamilyFocus = (rootId: string) => setFamilyFocus((cur) => (cur === rootId ? null : rootId))

  // ── Group by stage ──
  const byStage = useMemo(() => {
    const m: Record<SalesStage, KanbanRow[]> = {
      sales: [], raw_material: [], production: [], qc: [],
      packing: [], logistics: [], delivered: [],
    }
    filtered.forEach(o => {
      m[o.current_stage]?.push(o)
    })
    return m
  }, [filtered])

  // Đơn ĐÃ THU ĐỦ (đang ở stage 'delivered') → tách sang cột hiển thị "Đã tất toán"
  // (chỉ nhóm hiển thị, KHÔNG phải stage trong DB — current_stage vẫn 'delivered')
  const settledList = useMemo(
    () => byStage.delivered.filter(o => paymentBucket(o) === 'paid'),
    [byStage],
  )

  // ── Drag handlers ──
  const handleDragOver = (e: React.DragEvent, stage: SalesStage) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragOverStage !== stage) setDragOverStage(stage)
  }

  const handleDragLeave = () => setDragOverStage(null)

  // Kéo 1 card thả vào cột "Đã tất toán" → bật modal "Ghi nhận đã thu" (nhanh)
  const handleDropSettled = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOverSettled(false)
    const orderId = e.dataTransfer.getData('text/plain')
    const order = orders.find(o => o.id === orderId)
    if (!order) return
    if (paymentBucket(order) === 'paid') return  // đã tất toán rồi
    if (!canCollect) {
      message.warning('Chỉ Kế toán/Admin mới ghi nhận đã thu')
      return
    }
    setPayTarget({
      id: order.id,
      label: order.contract_no || order.code,
      subLabel: order.contract_no ? order.code : undefined,
      outstanding: outstandingUsd(order),
    })
  }

  const handleDrop = (e: React.DragEvent, toStage: SalesStage) => {
    e.preventDefault()
    setDragOverStage(null)
    const orderId = e.dataTransfer.getData('text/plain')
    const order = orders.find(o => o.id === orderId)
    if (!order) return
    if (order.current_stage === toStage) return // no-op

    // Forward-only: ngăn kéo lùi stage (vd packing → sales) — workflow chỉ
    // cho phép tiến tới. Muốn revert phải nhờ admin DB intervention.
    const fromRank = STAGE_RANK[order.current_stage] || 0
    const toRank = STAGE_RANK[toStage] || 0
    if (toRank < fromRank) {
      message.warning(
        `Không thể kéo lùi từ "${SALES_STAGE_LABELS[order.current_stage]}" về "${SALES_STAGE_LABELS[toStage]}". ` +
        `Workflow chỉ tiến tới — liên hệ admin nếu cần revert.`,
      )
      return
    }
    // Skip stage cũng cảnh báo (nhảy nhiều bước)
    if (toRank > fromRank + 1) {
      const skipped = toRank - fromRank - 1
      message.warning(
        `Bỏ qua ${skipped} stage (${SALES_STAGE_LABELS[order.current_stage]} → ${SALES_STAGE_LABELS[toStage]}). ` +
        `Tiếp tục? Hệ thống sẽ ghi handoff trực tiếp, không qua các stage trung gian.`,
        4,
      )
      // Vẫn cho proceed (admin có thể skip), chỉ cảnh báo
    }

    setConfirmTransition({
      orderId,
      orderCode: soDisplayCode(order),
      fromStage: order.current_stage,
      toStage,
    })
  }

  const handleConfirmTransition = async () => {
    if (!confirmTransition || !user?.employee_id) {
      message.error('Không xác định được user')
      return
    }
    setSubmitting(true)
    const res = await salesStageService.transitionStage(
      confirmTransition.orderId,
      confirmTransition.toStage,
      user.employee_id,
      `Kéo thẻ từ ${SALES_STAGE_LABELS[confirmTransition.fromStage]} → ${SALES_STAGE_LABELS[confirmTransition.toStage]}`,
    )
    setSubmitting(false)
    if (res.success) {
      message.success(`Đã chuyển ${confirmTransition.orderCode} sang ${SALES_STAGE_LABELS[confirmTransition.toStage]}`)
      setConfirmTransition(null)
      fetchOrders()
    } else {
      message.error(dichLoiHeThong(res.error, 'Không chuyển được bộ phận'))
    }
  }

  const openCreateTab = () => openTab({
    key: 'sales-order-create',
    title: 'Tạo đơn hàng',
    componentId: 'sales-order-create',
    props: {},
    path: '/sales/orders/new',
  })

  const openOrderTab = (id: string, label: string) => openTab({
    key: `sales-order-${id}`,
    title: `Đơn ${label}`,
    componentId: 'sales-order-detail',
    props: { orderId: id },
    path: `/sales/orders/${id}`,
  })

  /**
   * Chọn HĐ gốc xong → mở tab tạo đợt mua tiếp. Đơn NGUỒN = đợt mới nhất của họ (quy cách mới nhất), form tự quy
   * về gốc thật. TabbedWorkspace chọn tab theo path, bỏ qua query → route riêng '/sales/orders/:id/continue'.
   */
  const openContinueTab = (root: RootContractOption) => {
    const sourceId = root.latest_member_id || root.id
    // Màn tạo đợt đăng ký ở tabRegistry ('sales-order-continue'); thiếu thì báo rõ, đừng mở tab hỏng.
    // (Điện thoại < 768px: useOpenTab điều hướng thẳng theo path, không qua registry.)
    if (window.innerWidth >= 768 && !getTabComponent('sales-order-continue')) {
      message.warning('Màn tạo đơn mua tiếp chưa sẵn sàng trên bản này — tải lại trang, nếu vẫn vậy báo IT.')
      return
    }
    openTab({
      key: `sales-order-continue-${sourceId}`,
      title: `Mua tiếp HĐ ${root.contract_no}`,
      componentId: 'sales-order-continue',
      props: { sourceOrderId: sourceId },
      path: `/sales/orders/${sourceId}/continue`,
    })
  }

  const brandBtn = { backgroundColor: palette.brand, borderColor: palette.brand }

  return (
    <div style={{ padding: 16, maxWidth: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, color: '#111' }}>📋 Kanban tiến độ — tất cả đơn</h2>
          <p style={{ color: '#6b7280', margin: '4px 0 0 0', fontSize: 13 }}>
            {filtered.length}/{orders.length} đơn · Kéo thẻ sang cột khác để chuyển bộ phận
          </p>
        </div>
        {/* Đường quay về Sổ đơn + tạo đơn — trước đây Kanban là ngõ cụt (chỉ có Làm mới) */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button icon={<List size={14} />} onClick={() => navigate('/sales/orders')}>Sổ đơn hàng</Button>
          <Button icon={<RefreshCw size={14} />} onClick={fetchOrders}>Làm mới</Button>
          {/* Nút TÁCH: bấm chính = HĐ mới · ▾ "Mua tiếp theo HĐ đã ký…" → chọn HĐ gốc → mở tab tạo đợt.
              (antd 6: Dropdown.Button đã bỏ → Space.Compact + Dropdown + Button.) */}
          {canContinue ? (
            <Space.Compact>
              <Button type="primary" icon={<Plus size={14} />} onClick={openCreateTab} style={brandBtn}>
                Tạo đơn hàng
              </Button>
              <Dropdown
                trigger={['click']}
                placement="bottomRight"
                menu={{
                  items: [
                    { key: 'new', label: 'HĐ mới', onClick: openCreateTab },
                    { key: 'continue', label: 'Mua tiếp theo HĐ đã ký…', onClick: () => setRootPickerOpen(true) },
                  ],
                }}
              >
                <Button type="primary" icon={<ChevronDown size={14} />} aria-label="Chọn kiểu tạo đơn" style={brandBtn} />
              </Dropdown>
            </Space.Compact>
          ) : (
            <Button type="primary" icon={<Plus size={14} />} onClick={openCreateTab} style={brandBtn}>
              Tạo đơn hàng
            </Button>
          )}
        </div>
      </div>

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <Input
          prefix={<Search size={14} />}
          placeholder={familyReady ? 'Tìm số đơn/HĐ gốc, người mua/nhận, grade…' : 'Tìm SO/contract/khách/grade...'}
          value={search}
          onChange={e => setSearch(e.target.value)}
          allowClear
          style={{ width: 300, maxWidth: '100%' }}
        />
        <Select
          value={filterEtd}
          onChange={v => setFilterEtd(v)}
          style={{ width: 160 }}
          options={[
            { value: 'all', label: 'ETD: tất cả' },
            { value: '7d', label: 'ETD: ≤ 7 ngày' },
            { value: '14d', label: 'ETD: ≤ 14 ngày' },
            { value: '30d', label: 'ETD: ≤ 30 ngày' },
          ]}
        />
        <Button
          type={showOnlyMine ? 'primary' : 'default'}
          onClick={() => setShowOnlyMine(!showOnlyMine)}
          style={showOnlyMine ? { background: '#111', borderColor: '#111' } : {}}
        >
          Của tôi
        </Button>
        <Button
          type={showOnlyOverdue ? 'primary' : 'default'}
          onClick={() => setShowOnlyOverdue(!showOnlyOverdue)}
          danger={showOnlyOverdue}
        >
          Quá SLA
        </Button>
        <Button
          type={showOnlyUnpaid ? 'primary' : 'default'}
          onClick={() => setShowOnlyUnpaid(!showOnlyUnpaid)}
          style={showOnlyUnpaid ? { background: '#b45309', borderColor: '#b45309' } : {}}
        >
          💰 Chỉ chưa thu tiền
        </Button>
        {familyReady && (
          <Tooltip title="Chỉ hiện các thẻ thuộc HĐ có đơn mua tiếp: HĐ gốc + từng đợt (mỗi đợt vẫn là một thẻ riêng)">
            <Button
              type={showOnlyFamily ? 'primary' : 'default'}
              onClick={() => setShowOnlyFamily(!showOnlyFamily)}
              style={showOnlyFamily ? brandBtn : { color: palette.brand, borderColor: palette.brand }}
            >
              ⧉ HĐ có mua tiếp{familyCardCount > 0 ? ` (${familyCardCount})` : ''}
            </Button>
          </Tooltip>
        )}
      </div>

      {/* Băng SOI HĐ — chỉ CỘNG các đơn đã nạp trên bảng; mỗi đợt là một khoản phải thu riêng */}
      {focus && (
        <div
          role="status"
          style={{
            display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 10px',
            padding: '8px 12px', marginBottom: 12, borderRadius: 8, fontSize: 13,
            background: palette.brandBg, border: `1px solid ${palette.brand}`, color: '#111',
          }}
        >
          <span style={{ fontWeight: 700, color: palette.brand }}>
            ⧉ Đang soi HĐ <span style={{ fontFamily: 'JetBrains Mono, monospace' }}>{focus.rootNo || '—'}</span>
          </span>
          <span>· <b>{focus.buyer}</b> — {focus.totals.orders} đợt</span>
          <span>· {fmtNum(focus.totals.tons, 2)} t</span>
          <span>· trị giá {fmtMoney(focus.totals.valueUsd, 'USD', { decimals: 0 })}{focus.vnd ? ' (USD quy đổi)' : ''}</span>
          <span>· đã thu {fmtMoney(focus.totals.paidUsd, 'USD', { decimals: 0 })}</span>
          <span style={{ fontSize: 12, color: '#6b7280' }}>
            (cộng các đơn — mỗi đơn một khoản phải thu riêng, không phải mẫu số công nợ)
          </span>
          {focus.hidden > 0 && (
            <span style={{ fontWeight: 600, color: '#b45309' }}>· {focus.hidden} thẻ đang bị lọc ẩn</span>
          )}
          <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 8, flexWrap: 'wrap' }}>
            <Button size="small" onClick={() => openOrderTab(focus.rootId, focus.rootNo || 'gốc')}>Mở HĐ gốc</Button>
            <Button size="small" onClick={() => setFamilyFocus(null)}>Bỏ soi</Button>
          </span>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}><Spin size="large" /></div>
      ) : loadError ? (
        <PageState error={loadError} onRetry={fetchOrders} />
      ) : (
        // Swimlane container — co giãn vừa màn hình, 7 cột chia đều
        // Desktop: 7 cột fit toàn bộ width
        // Narrow screen (<1400px): fallback scroll horizontal khi minWidth không đủ
        <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 12 }}>
          {SALES_STAGES.map(stage => {
            const list = byStage[stage]
            const isOver = dragOverStage === stage
            const isDelivered = stage === 'delivered'

            // ── Cột "Đã giao khách": CHỈ giữ đơn CHƯA thu đủ (đã thu đủ → cột "Đã tất
            //    toán" bên phải), xếp chưa-thu/nợ-to lên đầu + KPI tiền về ──
            let renderList = list
            let kpi: { unpaid: number; partial: number; out: number } | null = null
            if (isDelivered) {
              const rank = (o: KanbanOrder) => {
                const b = paymentBucket(o)
                return b === 'unpaid' ? 0 : b === 'partial' ? 1 : 2
              }
              renderList = list
                .filter(o => paymentBucket(o) !== 'paid')
                .sort((a, b) => {
                  const r = rank(a) - rank(b)
                  return r !== 0 ? r : outstandingUsd(b) - outstandingUsd(a)
                })
              kpi = {
                unpaid: renderList.filter(o => paymentBucket(o) === 'unpaid').length,
                partial: renderList.filter(o => paymentBucket(o) === 'partial').length,
                out: renderList.reduce((s, o) => s + outstandingUsd(o), 0),
              }
            }
            const count = renderList.length
            const isOverloaded = count >= 8
            return (
              <div
                key={stage}
                onDragOver={(e) => handleDragOver(e, stage)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, stage)}
                style={{
                  flex: '1 1 0',          // chia đều width
                  minWidth: 180,          // sàn responsive — dưới 180px thì scroll ngang
                  background: isOver ? '#dbeafe' : '#f4f5f7',
                  border: isOver ? '2px dashed #0a72ef' : '1px solid #e4e4e7',
                  borderRadius: 8,
                  padding: 8,
                  transition: 'background 0.15s',
                }}
              >
                {/* Lane header */}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  marginBottom: 8, padding: '4px 6px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 16 }}>{SALES_STAGE_EMOJI[stage]}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>
                      {SALES_STAGE_LABELS[stage]}
                    </span>
                  </div>
                  <span style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding: '1px 8px',
                    borderRadius: 9999,
                    background: isOverloaded ? '#fee2e2' : '#ffffff',
                    color: isOverloaded ? '#dc2626' : '#374151',
                  }}>
                    {count}
                  </span>
                </div>

                {/* KPI tiền về + link Công nợ — CHỈ cột "Đã giao khách" */}
                {isDelivered && kpi && count > 0 && (
                  <div style={{
                    margin: '0 2px 8px', padding: '8px 10px', borderRadius: 8,
                    background: kpi.out > 0 ? '#fff7ed' : '#f0fdf4',
                    border: `1px solid ${kpi.out > 0 ? '#fed7aa' : '#bbf7d0'}`,
                  }}>
                    <div style={{ fontSize: 10, color: '#9a3412', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      Còn phải thu
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: kpi.out > 0 ? '#b45309' : '#15803d', lineHeight: 1.1 }}>
                      {fmtUsdCompact(kpi.out)}
                    </div>
                    <div style={{ fontSize: 10.5, color: '#6b7280', marginTop: 2 }}>
                      {kpi.unpaid} chưa thu · {kpi.partial} thu 1 phần
                    </div>
                    <div
                      onClick={() => navigate('/sales/ar-aging')}
                      style={{ fontSize: 11, color: '#0a72ef', fontWeight: 600, cursor: 'pointer', marginTop: 4 }}
                    >
                      → Xem Công nợ khách
                    </div>
                  </div>
                )}

                {/* Cards */}
                <div style={{ minHeight: 60 }}>
                  {count === 0 ? (
                    <div style={{ textAlign: 'center', padding: '20px 0', color: '#a1a1aa', fontSize: 11, fontStyle: 'italic' }}>
                      (rảnh)
                    </div>
                  ) : (
                    renderList.map(o => (
                      <KanbanCard
                        key={o.id}
                        order={o}
                        lp={lotProgress[o.id]}
                        lotPay={lotPay[o.id]}
                        familyHighlight={highlightOf(o)}
                        onFamilyClick={toggleFamilyFocus}
                        onDragStart={() => {}}
                        onDragEnd={() => {}}
                      />
                    ))
                  )}
                </div>
              </div>
            )
          })}

          {/* ── Cột "💵 Đã tất toán" — đơn ĐÃ THU ĐỦ, tách khỏi "Đã giao khách".
                Chỉ là NHÓM HIỂN THỊ (không phải stage DB) → dữ liệu không đổi,
                không kéo-thả vào (không gắn onDrop). ── */}
          {(() => {
            const settledOut = settledList.reduce((s, o) => s + (o.total_value_usd || 0), 0)
            return (
              <div
                key="settled"
                onDragOver={(e) => { e.preventDefault(); if (!dragOverSettled) setDragOverSettled(true) }}
                onDragLeave={() => setDragOverSettled(false)}
                onDrop={handleDropSettled}
                style={{
                  flex: '1 1 0', minWidth: 180,
                  background: dragOverSettled ? '#dcfce7' : '#f0fdf4',
                  border: dragOverSettled ? '2px dashed #15803d' : '1px solid #bbf7d0',
                  borderRadius: 8, padding: 8, transition: 'background 0.15s',
                }}
              >
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  marginBottom: 8, padding: '4px 6px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 16 }}>💵</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>Đã tất toán</span>
                  </div>
                  <span style={{
                    fontSize: 11, fontWeight: 600, padding: '1px 8px', borderRadius: 9999,
                    background: '#ffffff', color: '#15803d',
                  }}>
                    {settledList.length}
                  </span>
                </div>
                {settledList.length > 0 && (
                  <div style={{ margin: '0 2px 8px', padding: '6px 10px', borderRadius: 8, background: '#dcfce7' }}>
                    <div style={{ fontSize: 10, color: '#15803d', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      Đã thu về
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#15803d', lineHeight: 1.1 }}>
                      {fmtUsdCompact(settledOut)}
                    </div>
                  </div>
                )}
                <div style={{ minHeight: 60 }}>
                  {settledList.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '16px 8px', color: '#a1a1aa', fontSize: 11 }}>
                      <div style={{ fontStyle: 'italic' }}>(chưa có đơn tất toán)</div>
                      <div style={{ marginTop: 8, color: '#15803d', fontSize: 10.5, lineHeight: 1.5 }}>
                        ⬅ Kéo đơn từ "Đã giao khách" thả vào đây để <b>ghi "đã thu"</b>
                      </div>
                    </div>
                  ) : (
                    settledList.map(o => (
                      <KanbanCard
                        key={o.id}
                        order={o}
                        lp={lotProgress[o.id]}
                        lotPay={lotPay[o.id]}
                        familyHighlight={highlightOf(o)}
                        onFamilyClick={toggleFamilyFocus}
                        onDragStart={() => {}}
                        onDragEnd={() => {}}
                      />
                    ))
                  )}
                </div>
              </div>
            )
          })()}
        </div>
      )}

      {filtered.length === 0 && !loading && !loadError && (
        <Empty description="Không có đơn nào khớp bộ lọc" style={{ marginTop: 40 }} />
      )}

      {/* "Mua tiếp theo HĐ đã ký…" — chọn HĐ gốc (ẩn đơn huỷ / chưa có số HĐ) rồi mở tab tạo đợt */}
      {canContinue && (
        <RootContractPickerModal
          open={rootPickerOpen}
          onClose={() => setRootPickerOpen(false)}
          onPick={openContinueTab}
        />
      )}

      {/* Modal ghi nhận đã thu (kéo card vào cột "Đã tất toán") — dùng chung với Công nợ khách */}
      <QuickPayModal
        target={payTarget}
        onClose={() => setPayTarget(null)}
        onDone={() => { setPayTarget(null); fetchOrders() }}
      />

      {/* Confirm modal */}
      <Modal
        title="Xác nhận chuyển bộ phận"
        open={!!confirmTransition}
        onCancel={() => setConfirmTransition(null)}
        onOk={handleConfirmTransition}
        confirmLoading={submitting}
        okText="Xác nhận chuyển"
        cancelText="Hủy"
        okButtonProps={{ style: { background: '#111', borderColor: '#111' } }}
      >
        {confirmTransition && (
          <div>
            <p style={{ margin: 0, marginBottom: 8 }}>
              Chuyển <strong>{confirmTransition.orderCode}</strong>:
            </p>
            <div style={{ padding: '8px 12px', background: '#f8f9fa', borderRadius: 6, marginBottom: 8 }}>
              {SALES_STAGE_EMOJI[confirmTransition.fromStage]} <strong>{SALES_STAGE_LABELS[confirmTransition.fromStage]}</strong>
              <span style={{ margin: '0 8px', color: '#6b7280' }}>→</span>
              {SALES_STAGE_EMOJI[confirmTransition.toStage]} <strong>{SALES_STAGE_LABELS[confirmTransition.toStage]}</strong>
            </div>
            <p style={{ margin: 0, fontSize: 12, color: '#6b7280' }}>
              Hệ thống sẽ ghi handoff log với người chuyển = bạn ({user?.full_name || user?.email}).
            </p>
          </div>
        )}
      </Modal>

    </div>
  )
}
