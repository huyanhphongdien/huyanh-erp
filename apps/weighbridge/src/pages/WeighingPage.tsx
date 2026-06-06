import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Card, Button, Input, Select, Typography, Space, Row, Col, Alert, Divider,
  Tag, InputNumber, message, Modal, AutoComplete, Radio, Steps,
} from 'antd'
import B2BPartnerPicker from '@/components/B2BPartnerPicker'
import {
  ArrowLeftOutlined, SaveOutlined, PrinterOutlined, CheckOutlined,
  CameraOutlined, ThunderboltOutlined,
} from '@ant-design/icons'
import { useAuthStore } from '@/stores/authStore'
import { useCurrentFacility } from '@/stores/facilityStore'
import weighbridgeService from '@erp/services/wms/weighbridgeService'
import drcLookupService, { type DrcLookupRow } from '@erp/services/wms/drcLookupService'
import stockInService from '@erp/services/wms/stockInService'
import stockOutService from '@erp/services/wms/stockOutService'
import transferService, { type InterFacilityTransfer } from '@erp/services/wms/transferService'
import { supabase } from '@erp/lib/supabase'
import { useKeliScale } from '@erp/hooks/useKeliScale'
import { dealWmsService } from '@erp/services/b2b/dealWmsService'
import type { ActiveDealForStockIn } from '@erp/services/b2b/dealWmsService'
import { salesOrderService } from '@erp/services/sales/salesOrderService'
import type { SalesOrderContainer } from '@erp/services/sales/salesTypes'
import type { WeighbridgeTicket } from '@erp/services/wms/wms.types'
import {
  calculateWeights, saveRubberFields, saveCalculatedValues, getRubberSuppliers,
  type RubberWeighData, type WeightCalculation,
} from '@/services/rubberWeighService'
import CameraPanel from '@/components/CameraPanel'
import ScaleSettings from '@/components/ScaleSettings'

const { Title, Text } = Typography
const PRIMARY = '#1B4D3E'
const MONO: React.CSSProperties = { fontFamily: "'JetBrains Mono', monospace" }

const RUBBER_TYPES = [
  { value: 'mu_dong', label: 'Mủ đông' },
  { value: 'mu_nuoc', label: 'Mủ nước' },
  { value: 'mu_tap', label: 'Mủ tạp' },
  { value: 'svr', label: 'SVR' },
]

// Nhãn ngắn (có icon) cho panel "Nhập mủ gần đây" — đủ 5 loại mủ thô
const RUBBER_LABELS: Record<string, string> = {
  mu_nuoc: '💧 Mủ nước', mu_tap: '🪨 Mủ tạp', mu_dong: '🧊 Mủ đông',
  mu_chen: '🥣 Mủ chén', mu_to: '📄 Mủ tờ', svr: 'SVR',
}

const DESTINATIONS = [
  { value: 'cong_1', label: 'Cổng 1' },
  { value: 'cong_2', label: 'Cổng 2' },
  { value: 'cong_3', label: 'Cổng 3' },
  { value: 'bai_mu', label: 'Bãi mủ' },
]

interface SupplierOption {
  id: string
  code: string
  name: string
}

export default function WeighingPage() {
  const navigate = useNavigate()
  const { ticketId } = useParams()
  const { operator } = useAuthStore()
  const { facility: currentFacility, error: facilityError } = useCurrentFacility()
  // useKeliScale: thử cấu hình đã lưu trước + chặn dò trùng (fix kẹt "Chưa kết nối" ở TL 1200/8/None/1)
  const scale = useKeliScale()

  // Ticket state
  const [ticket, setTicket] = useState<WeighbridgeTicket | null>(null)
  // P4: danh sách nhập mủ gần đây (IN, theo facility) — panel cột phải khi tạo phiếu
  const [recentTickets, setRecentTickets] = useState<WeighbridgeTicket[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Form state
  const [vehiclePlate, setVehiclePlate] = useState('')
  const [driverName, setDriverName] = useState('')
  const [driverPhone, setDriverPhone] = useState('')
  const [plateHistory, setPlateHistory] = useState<string[]>([])
  const [tareSuggestion, setTareSuggestion] = useState<{ avgTare: number | null; lastTare: number | null; count: number } | null>(null)
  // G-7: cảnh báo cùng biển số cân lần 2 trong ngày (có thể là cân lại hoặc 2 chuyến)
  const [dupPlateWarning, setDupPlateWarning] = useState<{ count: number; codes: string[] } | null>(null)
  // Loại phiếu cân — IN (cân 2 lần: gross→tare) | OUT (cân 2 lần: tare xe rỗng→gross xe+hàng)
  const [ticketDirection, setTicketDirection] = useState<'in' | 'out'>('in')

  // S3 OUT: Sales Order + Container picker (optional cho OUT — cho phép xuất lẻ không SO)
  const [salesOrders, setSalesOrders] = useState<Array<{
    id: string; code: string; customer_name: string; grade: string;
    quantity_kg: number; container_count: number; container_type: string;
    port_of_destination: string | null; vessel_name: string | null;
  }>>([])
  const [selectedSalesOrderId, setSelectedSalesOrderId] = useState<string>('')
  const [containers, setContainers] = useState<SalesOrderContainer[]>([])
  const [selectedContainerId, setSelectedContainerId] = useState<string>('')
  const [loadingSO, setLoadingSO] = useState(false)
  const [loadingContainers, setLoadingContainers] = useState(false)
  const [sealNoActual, setSealNoActual] = useState('')

  // F3 Transfer: pending transfers cho NM hiện tại (theo direction)
  // - OUT + facility != PD → transfers đang gửi từ facility này
  // - IN  + facility = PD  → transfers đến PD chờ cân nhận
  const [transferOptions, setTransferOptions] = useState<InterFacilityTransfer[]>([])
  const [selectedTransferId, setSelectedTransferId] = useState<string>('')
  const [loadingTransfers, setLoadingTransfers] = useState(false)
  // Khi user chọn transfer → tổng KL hàng dự kiến (sum items.weight_planned_kg).
  // Dùng để compute TARE = GROSS - planned ở cân OUT TL/LAO.
  const [transferPlannedKg, setTransferPlannedKg] = useState<number>(0)

  // Deal/Supplier
  const [deals, setDeals] = useState<ActiveDealForStockIn[]>([])
  const [selectedDealId, setSelectedDealId] = useState<string>('')
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([])
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('')
  const [sourceType, setSourceType] = useState<'deal' | 'supplier' | 'partner_direct'>('deal')
  // partner_direct: cân không có deal — chọn đại lý B2B trực tiếp + rubber_type
  const [directPartnerId, setDirectPartnerId] = useState<string | null>(null)
  const [directRawRubberType, setDirectRawRubberType] = useState<'mu_nuoc'|'mu_tap'|'mu_dong'|'mu_chen'|'mu_to'>('mu_tap')

  // Delivery plans (xe đã khai báo trước ở tab "Thông tin giao hàng")
  const [deliveryPlans, setDeliveryPlans] = useState<any[]>([])
  const [selectedPlanId, setSelectedPlanId] = useState<string>('')

  // Rubber fields
  const [rubberType, setRubberType] = useState<string>('mu_dong')
  // XUẤT: xe về PD có thể chở NHIỀU loại mủ → chọn nhiều (lưu "mu_dong,mu_nuoc")
  const [outRubberTypes, setOutRubberTypes] = useState<string[]>([])
  // Phiếu cân KHÔNG nhập giá / DRC kỳ vọng. Giá giải tại Đề nghị thanh toán
  // (deal hoặc Phiếu chốt giá); price_unit suy từ loại mủ (mủ nước = giá khô).
  const priceUnit: 'wet' | 'dry' = rubberType === 'mu_nuoc' ? 'dry' : 'wet'

  // F2 Tân Lâm — quy trình mủ nước: đo ĐỐT + DRC tại cân lần 2 (sau lấy mẫu + đốt)
  // DRC% tra từ bảng drc_lookup (QC sửa được qua /settings/drc-lookup).
  // Operator có thể override.
  const [dotReading, setDotReading] = useState<number | null>(null)
  const [actualDrc, setActualDrc] = useState<number | null>(null)
  // G-6: track nguồn DRC (lookup từ bảng drc_lookup vs operator nhập tay)
  const [drcSource, setDrcSource] = useState<'lookup' | 'manual' | null>(null)
  const [drcLookupRows, setDrcLookupRows] = useState<DrcLookupRow[]>([])
  const [consolidationCode, setConsolidationCode] = useState<string>('')
  const [destination, setDestination] = useState<string>('bai_mu')
  const [deductionKg, setDeductionKg] = useState<number>(0)
  const [notes, setNotes] = useState('')

  // Manual weight input
  const [manualWeight, setManualWeight] = useState<number | null>(null)

  // Calculation
  const [calc, setCalc] = useState<WeightCalculation | null>(null)

  const plateInputRef = useRef<any>(null)
  const cameraCaptureRef = useRef<((label?: string) => Promise<void>) | null>(null)

  // ============================================================================
  // LOAD DATA
  // ============================================================================

  useEffect(() => {
    // Load deals — filter theo facility hiện tại: trạm cân PD chỉ thấy deal đi PD.
    // Legacy deals (target_facility_id = NULL) vẫn hiện để backward compatible.
    dealWmsService.getActiveDealsForStockIn(undefined, currentFacility?.id)
      .then((d) => { console.log('Deals loaded (facility=', currentFacility?.code, '):', d); setDeals(d) })
      .catch((err) => console.error('Deal load error:', err))
    getRubberSuppliers().then((s) => setSuppliers(s.map((x: any) => ({ id: x.id, code: x.code, name: x.name })))).catch(() => {})
    // Load bảng tra DRC (cache 5 phút trong service)
    drcLookupService.getAll().then(setDrcLookupRows).catch((err) => console.warn('drc_lookup load error:', err))
  }, [currentFacility?.id, currentFacility?.code])

  // P4: Load nhập mủ gần đây (6 phiếu IN mới nhất tại NM này) — reload sau mỗi lần
  // tạo/hoàn tất phiếu (ticket?.id đổi) để operator thấy phiếu vừa cân.
  // Query trực tiếp để lấy thêm qc_actual_drc + created_at (panel hiển thị DRC + giờ).
  useEffect(() => {
    if (!currentFacility?.id) return
    ;(async () => {
      const { data, error } = await supabase
        .from('weighbridge_tickets')
        .select('id, code, vehicle_plate, supplier_name, rubber_type, net_weight, status, created_at, qc_actual_drc')
        .eq('facility_id', currentFacility.id)
        .eq('ticket_type', 'in')
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false })
        .limit(6)
      if (error) { console.warn('recent tickets load error:', error); return }
      setRecentTickets((data || []) as any)
    })()
  }, [currentFacility?.id, ticket?.id])

  // S3 OUT: Load active sales orders khi user chuyển sang OUT
  // CHỈ load ở NM xuất khẩu (PD, can_ship_to_customer=true). TL/LAO không cần.
  useEffect(() => {
    if (ticketDirection !== 'out' || ticket) return
    if (!currentFacility?.can_ship_to_customer) return
    setLoadingSO(true)
    salesOrderService.getActiveForShipping()
      .then(setSalesOrders)
      .catch(err => console.warn('SO load error:', err))
      .finally(() => setLoadingSO(false))
  }, [ticketDirection, ticket, currentFacility])

  // F3: Load pending transfers theo direction + facility
  // - OUT + facility != PD → transfers gửi từ facility này (chưa cân xuất)
  // - IN  + bất kỳ facility → transfers đến facility này (chưa cân nhận, in_transit/arrived)
  useEffect(() => {
    if (ticket || !currentFacility) return
    setLoadingTransfers(true)
    const loader = ticketDirection === 'out'
      ? transferService.getPendingForWeighOut(currentFacility.id)
      : transferService.getPendingForWeighIn(currentFacility.id)
    loader
      .then(setTransferOptions)
      .catch((err) => console.warn('Transfer load error:', err))
      .finally(() => setLoadingTransfers(false))
  }, [ticketDirection, ticket, currentFacility])

  // S3 OUT: Load containers khi user chọn SO
  useEffect(() => {
    if (!selectedSalesOrderId) {
      setContainers([])
      setSelectedContainerId('')
      return
    }
    setLoadingContainers(true)
    salesOrderService.getContainers(selectedSalesOrderId)
      .then(c => {
        // Filter chỉ container chưa shipped
        setContainers(c.filter(x => x.status !== 'shipped'))
      })
      .catch(err => console.warn('Container load error:', err))
      .finally(() => setLoadingContainers(false))
  }, [selectedSalesOrderId])

  const selectedSO = salesOrders.find(s => s.id === selectedSalesOrderId)
  const selectedContainer = containers.find(c => c.id === selectedContainerId)
  // Auto-fill seal_no từ container khi chọn
  useEffect(() => {
    if (selectedContainer?.seal_no) setSealNoActual(selectedContainer.seal_no)
  }, [selectedContainerId])

  // Load existing ticket if editing
  useEffect(() => {
    if (ticketId) {
      loadTicket(ticketId)
    }
  }, [ticketId])

  async function loadTicket(id: string) {
    setLoading(true)
    try {
      const t = await weighbridgeService.getById(id)
      if (t) {
        setTicket(t)
        // Sync direction toggle với ticket type từ DB
        if (t.ticket_type === 'in' || t.ticket_type === 'out') {
          setTicketDirection(t.ticket_type)
        }
        setVehiclePlate(t.vehicle_plate)
        setDriverName(t.driver_name || '')
        setNotes(t.notes || '')
        // Load rubber fields from extended columns
        const ext = t as any
        // Sync SO/container nếu OUT
        if (ext.sales_order_id) setSelectedSalesOrderId(ext.sales_order_id)
        if (ext.container_id) setSelectedContainerId(ext.container_id)
        if (ext.deal_id) { setSelectedDealId(ext.deal_id); setSourceType('deal') }
        if (ext.supplier_id) { setSelectedSupplierId(ext.supplier_id); setSourceType('supplier') }
        if (ext.rubber_type) {
          setRubberType(ext.rubber_type)
          if (t.ticket_type === 'out') setOutRubberTypes(String(ext.rubber_type).split(',').map((s) => s.trim()).filter(Boolean))
        }
        if (ext.destination) setDestination(ext.destination)
        if (ext.deduction_kg) setDeductionKg(ext.deduction_kg)
        // F2 TL: restore ĐỐT + DRC thực + consolidation_code nếu đã save trước đó
        if (ext.field_dot_reading != null) setDotReading(ext.field_dot_reading)
        if (ext.qc_actual_drc != null) setActualDrc(ext.qc_actual_drc)
        if (ext.qc_drc_source === 'lookup' || ext.qc_drc_source === 'manual') {
          setDrcSource(ext.qc_drc_source)
        }
        if (ext.consolidation_code) setConsolidationCode(ext.consolidation_code)
        // Calculate if both weights exist
        if (t.gross_weight != null && t.tare_weight != null) {
          recalculate(t.gross_weight, t.tare_weight, ext.deduction_kg || 0, undefined, undefined, ext.price_unit)
        }
      }
    } catch (err: any) {
      setError(err?.message || 'Không thể tải phiếu cân')
    } finally {
      setLoading(false)
    }
  }

  // ============================================================================
  // VEHICLE AUTOCOMPLETE
  // ============================================================================

  async function handlePlateSearch(search: string) {
    setVehiclePlate(search.toUpperCase())
    if (search.length >= 2) {
      const history = await weighbridgeService.getPlateHistory(search)
      setPlateHistory(history)
    }
  }

  // G-7: check cùng biển số đã có phiếu cân hôm nay chưa.
  // Chạy khi plate dài đủ (full plate) — không bắn warning khi typing dở.
  async function checkPlateDupToday(plate: string) {
    const trimmed = plate.trim().toUpperCase()
    if (trimmed.length < 5) { setDupPlateWarning(null); return }
    const todayStart = new Date(); todayStart.setHours(0,0,0,0)
    let q = supabase
      .from('weighbridge_tickets')
      .select('code, status')
      .eq('vehicle_plate', trimmed)
      .gte('created_at', todayStart.toISOString())
      .neq('status', 'cancelled')
    if (ticket?.id) q = q.neq('id', ticket.id)
    const { data } = await q
    const codes = (data || []).map((r: any) => r.code).filter(Boolean)
    setDupPlateWarning(codes.length > 0 ? { count: codes.length, codes } : null)
  }

  async function handlePlateSelect(plate: string) {
    setVehiclePlate(plate)
    // Auto-fill from history
    const recent = await weighbridgeService.getRecentByPlate(plate, 1)
    if (recent.length > 0) {
      setDriverName(recent[0].driver_name || '')
    }
    // Tare suggestion
    const suggestion = await weighbridgeService.getSuggestedTare(plate)
    setTareSuggestion(suggestion)
  }

  // ============================================================================
  // DEAL AUTO-FILL
  // ============================================================================

  async function loadDeliveryPlans(dealId: string) {
    try {
      const { dealDeliveryPlanService } = await import('@erp/services/b2b/dealDeliveryPlanService')
      const plans = await dealDeliveryPlanService.getByDeal(dealId)
      setDeliveryPlans(plans)
    } catch (e) {
      console.warn('[loadDeliveryPlans] failed:', e)
      setDeliveryPlans([])
    }
  }

  async function handleDealSelect(dealId: string) {
    setSelectedDealId(dealId)
    setSelectedSupplierId('')
    setSelectedPlanId('')
    const deal = deals.find((d) => d.id === dealId)
    if (!deal) return

    // Load xe đã khai báo cho Deal này
    loadDeliveryPlans(dealId)

    // Auto-fill from deal (đã select expected_drc, unit_price, price_unit,
    // rubber_type trong getActiveDealsForStockIn)
    const ext = deal as any
    if (ext.rubber_type) {
      setRubberType(ext.rubber_type)
    } else if (ext.product_name) {
      const lower = ext.product_name.toLowerCase()
      if (lower.includes('đông') || lower.includes('dong')) setRubberType('mu_dong')
      else if (lower.includes('nước') || lower.includes('nuoc')) setRubberType('mu_nuoc')
      else if (lower.includes('tạp') || lower.includes('tap')) setRubberType('mu_tap')
      else if (lower.includes('svr')) setRubberType('svr')
    }
    // Giá / DRC kỳ vọng / price_unit: KHÔNG auto-fill từ deal nữa — giá giải tại ĐNTT.

    // Biển số + tài xế: operator chọn từ dropdown "Xe đã khai báo" (các
    // plan status='pending') hoặc tự nhập nếu xe chưa khai báo.
  }

  function handlePlanSelect(planId: string) {
    setSelectedPlanId(planId)
    const plan = deliveryPlans.find((p) => p.id === planId)
    if (!plan) return
    // Prefill xe + tài xế từ kế hoạch
    setVehiclePlate((plan.vehicle_plate || '').toUpperCase())
    setDriverName(plan.driver_name || '')
    setDriverPhone(plan.driver_phone || '')
    if (plan.notes) setNotes(prev => prev || plan.notes)
  }

  // ============================================================================
  // CALCULATIONS
  // ============================================================================

  function recalculate(
    gross: number, tare: number, ded: number,
    drc?: number | null, price?: number | null, pUnit?: 'wet' | 'dry',
  ) {
    const c = calculateWeights(gross, tare, {
      deduction_kg: ded,
      expected_drc: drc ?? undefined,
      unit_price: price ?? undefined,
      price_unit: pUnit,
    })
    setCalc(c)
    return c
  }

  // ============================================================================
  // ACTIONS
  // ============================================================================

  async function handleCreate() {
    if (!vehiclePlate.trim()) {
      setError('Nhập biển số xe')
      return
    }
    // Phiếu nhập mủ phải gắn NGUỒN để không "vô chủ" (mủ bộc phát phải gắn đại lý → tính thưởng).
    // Bỏ qua nếu là phiếu chuyển kho nội bộ (transfer) — không phải nguồn mua.
    if (ticketDirection === 'in' && !selectedTransferId) {
      if (sourceType === 'deal' && !selectedDealId) { setError('Vui lòng chọn Deal nguồn'); return }
      if (sourceType === 'supplier' && !selectedSupplierId) { setError('Vui lòng chọn nhà cung cấp'); return }
      if (sourceType === 'partner_direct' && !directPartnerId) { setError('Mủ bộc phát phải gắn đại lý (để gom & tính thưởng) — vui lòng chọn đại lý'); return }
    }
    // TẠM BỎ ràng buộc gắn phiếu chuyển kho cho XUẤT — đang chốt quy trình cân
    // xuất 2 lần trước, chưa đụng tới phiếu/trừ kho. Bật lại khi xong quy trình:
    // if (ticketDirection === 'out' && !currentFacility?.can_ship_to_customer && !selectedTransferId) {
    //   setError('Xuất ở nhà máy này phải gắn PHIẾU CHUYỂN KHO — vui lòng chọn phiếu chuyển ở trên'); return
    // }
    setLoading(true)
    setError('')
    try {
      const t = await weighbridgeService.create(
        {
          vehicle_plate: vehiclePlate.trim(),
          driver_name: driverName || undefined,
          driver_phone: driverPhone || undefined,
          ticket_type: ticketDirection,
          notes: notes || undefined,
          facility_id: currentFacility?.id || null,
        },
        operator?.id,
      )

      // S3 OUT: link sales_order + container nếu user đã chọn
      if (ticketDirection === 'out' && (selectedSalesOrderId || selectedContainerId)) {
        try {
          const updates: Record<string, any> = {}
          if (selectedSalesOrderId) updates.sales_order_id = selectedSalesOrderId
          if (selectedContainerId) updates.container_id = selectedContainerId
          await supabase.from('weighbridge_tickets').update(updates).eq('id', t.id)
        } catch (e) {
          console.warn('Link SO/container failed:', e)
        }
      }

      // F3: Link transfer_id nếu user đã chọn phiếu chuyển kho
      if (selectedTransferId) {
        try {
          await supabase.from('weighbridge_tickets').update({ transfer_id: selectedTransferId }).eq('id', t.id)
        } catch (e) {
          console.warn('Link transfer failed:', e)
        }
      }
      setTicket(t)

      // Save rubber fields. Không lưu đơn giá / DRC kỳ vọng — giải tại ĐNTT.
      // source_type lưu thẳng từ UI để khỏi đoán qua FK (Commit C - audit fix).
      const rubberData: RubberWeighData = {
        // XUẤT: gộp nhiều loại "mu_dong,mu_nuoc" (chọn tay); NHẬP: 1 loại
        rubber_type: ticketDirection === 'out'
          ? (outRubberTypes.length ? outRubberTypes.join(',') : '')
          : rubberType,
        price_unit: priceUnit,
        destination: destination || undefined,
        deduction_kg: deductionKg,
        source_type: ticketDirection === 'in' ? sourceType : 'transfer',
      }
      if (sourceType === 'deal' && selectedDealId) {
        const deal = deals.find((d) => d.id === selectedDealId)
        rubberData.deal_id = selectedDealId
        rubberData.partner_id = (deal as any)?.partner_id
        rubberData.supplier_name = deal?.partner_name || ''
      } else if (sourceType === 'supplier' && selectedSupplierId) {
        const sup = suppliers.find((s) => s.id === selectedSupplierId)
        rubberData.supplier_id = selectedSupplierId
        rubberData.supplier_name = sup?.name
      } else if (sourceType === 'partner_direct' && directPartnerId) {
        // Cân không có deal: chọn đại lý B2B trực tiếp + chọn loại mủ
        rubberData.partner_id = directPartnerId
        rubberData.rubber_type = rubberType  // mu_* (từ card "Loại mủ") — trigger bridge → intake
      }
      await saveRubberFields(t.id, rubberData)

      setSuccess('Đã tạo phiếu — Sẵn sàng cân lần 1')
      navigate(`/weigh/${t.id}`, { replace: true })
    } catch (err: any) {
      setError(err?.message || 'Không thể tạo phiếu cân')
    } finally {
      setLoading(false)
    }
  }

  async function handleRecordWeight() {
    if (!ticket) return

    const weight = scale.connected && scale.liveWeight
      ? scale.liveWeight.weight
      : manualWeight

    if (!weight || weight <= 0) {
      setError('Chưa có số cân. Đọc từ cân hoặc nhập tay.')
      return
    }

    setLoading(true)
    setError('')
    try {
      let updated: WeighbridgeTicket
      // OUT 2-weigh — đo THỰC khối lượng hàng:
      //   • Lần 1 = XE RỖNG (tare)  → lần 2 = XE + HÀNG (gross)
      //   • NET hàng = gross − tare (không còn neo theo planned / tare cố định container)
      if (ticket.ticket_type === 'out') {
        if (ticket.status === 'weighing_gross') {
          // Lần 1: xe rỗng (tare)
          updated = await weighbridgeService.updateOutTareFirst(ticket.id, weight, operator?.id)
          setTicket(updated)
          setSuccess(`Cân lần 1 (xe rỗng): ${weight.toLocaleString()} kg — chờ xếp hàng rồi cân lần 2`)
          setManualWeight(null)
          if (cameraCaptureRef.current) cameraCaptureRef.current('L1').catch(() => {})
        } else {
          // Lần 2: xe + hàng (gross) → tính NET hàng
          updated = await weighbridgeService.updateOutGrossSecond(ticket.id, weight, operator?.id)
          setTicket(updated)
          const c = recalculate(weight, updated.tare_weight!, deductionKg, undefined, undefined, priceUnit)
          setSuccess(`Cân lần 2 (xe + hàng): ${weight.toLocaleString()} kg → NET hàng: ${c.net_weight.toLocaleString('vi-VN')} kg`)
          setManualWeight(null)
          if (cameraCaptureRef.current) cameraCaptureRef.current('L2').catch(() => {})
        }
        return
      }

      if (ticket.status === 'weighing_gross') {
        updated = await weighbridgeService.updateGrossWeight(ticket.id, weight, operator?.id)
        setTicket(updated)
        setSuccess(`Cân lần 1 (Gross): ${weight.toLocaleString()} kg`)
        setManualWeight(null)
        // Auto chụp + lưu ảnh camera lần 1
        if (cameraCaptureRef.current) {
          cameraCaptureRef.current('L1').catch(() => {})
        }
      } else {
        // F2 TL: nếu là mủ nước + có ĐỐT/DRC nhập → save kèm tare weight
        // (quy trình: cân gross → lấy mẫu → đốt → xã mủ → cân tare + ĐỐT/DRC)
        const drcExtras = (rubberType === 'mu_nuoc' || dotReading != null || actualDrc != null)
          ? {
              field_dot_reading: dotReading,
              qc_actual_drc: actualDrc,
              qc_drc_source: drcSource,
              consolidation_code: consolidationCode.trim() || null,
            }
          : undefined
        updated = await weighbridgeService.updateTareWeight(ticket.id, weight, operator?.id, drcExtras)
        setTicket(updated)
        // Recalculate với DRC thực đo tại cân (không còn fallback expectedDrc).
        const c = recalculate(
          updated.gross_weight!, weight, deductionKg,
          actualDrc, undefined, priceUnit,
        )
        setSuccess(`Cân lần 2 (Tare): ${weight.toLocaleString()} kg — NET: ${c.net_weight.toLocaleString()} kg`)
        setManualWeight(null)
        // Auto chụp + lưu ảnh camera lần 2
        if (cameraCaptureRef.current) {
          cameraCaptureRef.current('L2').catch(() => {})
        }
      }
    } catch (err: any) {
      setError(err?.message || 'Không thể ghi trọng lượng')
    } finally {
      setLoading(false)
    }
  }

  async function handleComplete(skipDrcCheck = false) {
    if (!ticket) return
    // Guard Tân Lâm: phiếu mủ nước IN cần ĐỐT + DRC để tính KL khô. Hoàn tất mà
    // thiếu DRC → mất dữ liệu quan trọng. Cảnh báo trước, cho phép vẫn hoàn tất.
    if (!skipDrcCheck) {
      const missingDrc =
        ticket.ticket_type === 'in' &&
        (rubberType === 'mu_nuoc' || dotReading != null) &&
        actualDrc == null
      if (missingDrc) {
        Modal.confirm({
          title: 'Chưa nhập DRC cho mủ nước',
          content:
            'Phiếu mủ nước cần ĐỐT + DRC để tính khối lượng khô. Hoàn tất khi chưa có DRC sẽ thiếu dữ liệu quyết toán. Vẫn hoàn tất?',
          okText: 'Vẫn hoàn tất',
          okButtonProps: { danger: true },
          cancelText: 'Quay lại nhập DRC',
          onOk: () => handleComplete(true),
        })
        return
      }
    }
    setLoading(true)
    setError('')
    try {
      const updated = await weighbridgeService.complete(ticket.id)
      setTicket(updated)

      // Save calculated values
      if (calc) {
        await saveCalculatedValues(ticket.id, calc)
      }

      // Update deal if linked — chỉ cho IN (deal nhập). OUT không sync ở đây
      // vì stock-out chưa confirmed (chỉ tạo draft, user pick batch + confirm sau).
      if (selectedDealId && updated.net_weight && ticket.ticket_type === 'in') {
        try {
          await dealWmsService.updateDealStockInTotals(selectedDealId)
        } catch { /* non-blocking */ }

        // Match delivery plan theo vehicle_plate → auto-fill actual_kg +
        // variance. Admin đã declare plan trước → cân xong auto match.
        // Non-blocking: nếu không có plan match thì bỏ qua (xe không được
        // khai báo trước, vẫn cân bình thường).
        try {
          const { dealDeliveryPlanService } = await import('@erp/services/b2b/dealDeliveryPlanService')
          await dealDeliveryPlanService.matchFromWeighbridge({
            deal_id: selectedDealId,
            vehicle_plate: vehiclePlate.trim(),
            weigh_ticket_id: ticket.id,
            actual_kg: updated.net_weight,
          })
          // Reload plans để dropdown gạch xe vừa cân
          loadDeliveryPlans(selectedDealId)
        } catch (err) {
          console.warn('[delivery-plan] match failed (non-blocking):', err)
        }
      }

      // C1: Auto-sync INBOUND → tạo phiếu nhập kho NVL từ phiếu cân
      //     (feature flag VITE_AUTO_WEIGHBRIDGE_SYNC). Chỉ chạy cho
      //     ticket_type='in' — tránh lỡ tạo stock-in từ outbound ticket.
      if (
        ticket.ticket_type === 'in' &&
        import.meta.env.VITE_AUTO_WEIGHBRIDGE_SYNC === 'true'
      ) {
        try {
          // F2 multi-facility: chỉ pick kho NVL CÙNG facility với phiếu cân.
          // Trước fix: order code asc → KHO-LAO-NVL ("L") đứng trước KHO-NVL ("N")
          // → tất cả phiếu nhập từ trạm cân PD đều bị tạo ở kho Lào (BUG).
          const ticketFacilityId = (ticket as any).facility_id || currentFacility?.id || null
          let whQuery = supabase
            .from('warehouses')
            .select('id, code, name, facility_id')
            .eq('is_active', true)
            .in('type', ['raw', 'mixed'])
            .order('code', { ascending: true })
          if (ticketFacilityId) whQuery = whQuery.eq('facility_id', ticketFacilityId)
          const { data: rawWh } = await whQuery.limit(1)
          if (rawWh && rawWh.length > 0) {
            const result = await stockInService.createFromWeighbridgeTicket(
              ticket.id,
              rawWh[0].id,
            )
            if (result.reused) {
              message.info(`Phiếu nhập đã tồn tại: ${result.stockIn?.code || ''}`)
            } else {
              message.success(`Đã tạo phiếu nhập NVL ${rawWh[0].code}: ${result.stockIn?.code || ''}`)
            }
          } else {
            console.warn(`[auto-sync in] không tìm thấy kho NVL cho facility ${ticketFacilityId || 'unknown'}`)
            message.warning('Phiếu cân hoàn tất nhưng không tìm thấy kho NVL cho nhà máy này — phải tạo phiếu nhập tay')
          }
        } catch (syncErr: any) {
          console.warn('[auto-sync in] tạo phiếu nhập thất bại:', syncErr?.message || syncErr)
        }
      }

      // ── Pattern C: cân OUT cho SO + Container → processContainerShipment ──
      // 1 phiếu xuất / SO, mỗi container add detail + trừ kho ngay.
      // Khi tất cả containers shipped → confirm phiếu xuất + SO → shipped.
      // Chỉ trigger khi có selectedSalesOrderId + selectedContainerId.
      // Nếu không có SO → fallback auto-sync cũ (tạo draft).
      if (ticket.ticket_type === 'out' && selectedSalesOrderId && selectedContainerId) {
        try {
          const ticketFacilityId = (ticket as any).facility_id || currentFacility?.id || null
          let tpQuery = supabase
            .from('warehouses')
            .select('id, code')
            .eq('is_active', true)
            .in('type', ['finished', 'mixed'])
            .order('code', { ascending: true })
          if (ticketFacilityId) tpQuery = tpQuery.eq('facility_id', ticketFacilityId)
          const { data: tpWh } = await tpQuery.limit(1)
          const whId = tpWh?.[0]?.id
          if (!whId) throw new Error('Không tìm thấy kho TP')

          // Lưu ý: processContainerShipment chỉ tạo detail 'picked' (KHÔNG trừ kho ở đây);
          // trừ kho 1 lần khi ERP bấm Xác nhận (confirmStockOut) — tránh trừ kép.
          const result = await stockOutService.processContainerShipment({
            sales_order_id: selectedSalesOrderId,
            container_id: selectedContainerId,
            weighbridge_ticket_id: ticket.id,
            warehouse_id: whId,
            net_weight_kg: updated.net_weight || 0,
            seal_no_actual: sealNoActual || undefined,
            user_id: operator?.id || null,
            operator_name: operator?.name || null,
          })

          if (result.reused) {
            message.success(`Thêm container vào phiếu xuất ${result.stockOutCode}`)
          } else {
            message.success(`Tạo phiếu xuất ${result.stockOutCode}`)
          }

          if (result.allContainersShipped) {
            message.success('✅ Tất cả container đã ship — phiếu xuất confirmed, SO → shipped')
          } else {
            message.info('📦 Container shipped — còn container khác chưa cân')
          }
        } catch (syncErr: any) {
          console.error('[Pattern C] processContainerShipment failed:', syncErr)
          message.error('Lỗi xuất kho: ' + (syncErr?.message || ''))
        }
      }
      // Fallback: cân OUT không có SO (xuất lẻ) → tạo draft cũ
      else if (
        ticket.ticket_type === 'out' &&
        !selectedSalesOrderId &&
        import.meta.env.VITE_AUTO_WEIGHBRIDGE_OUT_SYNC === 'true'
      ) {
        try {
          const ticketFacilityId = (ticket as any).facility_id || currentFacility?.id || null
          let tpQuery = supabase
            .from('warehouses')
            .select('id, code, name, facility_id')
            .eq('is_active', true)
            .in('type', ['finished', 'mixed'])
            .order('code', { ascending: true })
          if (ticketFacilityId) tpQuery = tpQuery.eq('facility_id', ticketFacilityId)
          const { data: tpWh } = await tpQuery.limit(1)
          if (tpWh && tpWh.length > 0) {
            const result = await stockOutService.createDraftFromWeighbridgeTicketOut(
              ticket.id,
              tpWh[0].id,
            )
            if (result.reused) {
              message.info(`Phiếu xuất draft đã tồn tại: ${result.stockOut?.code || ''}`)
            } else {
              message.success(`Đã tạo phiếu xuất draft: ${result.stockOut?.code || ''}`)
            }
          }
        } catch (syncErr: any) {
          console.warn('[auto-sync out fallback] failed:', syncErr?.message || syncErr)
        }
      }

      // F3: Auto-trigger transfer state machine nếu ticket gắn với phiếu chuyển
      const linkedTransferId = (ticket as any).transfer_id || selectedTransferId
      if (linkedTransferId && updated.net_weight && updated.net_weight > 0) {
        try {
          if (ticket.ticket_type === 'out') {
            // Cân xuất tại NM gửi → confirmShipped → in_transit
            await transferService.confirmShipped({
              transfer_id: linkedTransferId,
              weighbridge_ticket_id: ticket.id,
              weight_out_kg: updated.net_weight,
              user_id: operator?.id,
            })
            message.success(`Phiếu chuyển: hàng đã rời ${currentFacility?.name} → đang vận chuyển`)
          } else {
            // Cân nhận tại NM nhận → confirmReceived → received hoặc arrived (chờ duyệt)
            const result = await transferService.confirmReceived({
              transfer_id: linkedTransferId,
              weighbridge_ticket_id: ticket.id,
              weight_in_kg: updated.net_weight,
              user_id: operator?.id,
            })
            if (result.needs_approval) {
              message.warning(`Hao hụt ${result.loss_pct}% vượt ngưỡng — cần BGD duyệt`)
            } else {
              message.success(`Phiếu chuyển hoàn tất — hao hụt ${result.loss_pct}% (OK)`)
            }
          }
        } catch (transferErr: any) {
          console.error('Transfer state machine error:', transferErr)
          message.error('Lỗi cập nhật phiếu chuyển: ' + (transferErr?.message || ''))
        }
      }

      message.success(`Hoàn tất — NET: ${updated.net_weight?.toLocaleString()} kg`)

      // Auto navigate to print page after 1 second
      setTimeout(() => {
        navigate(`/print/${ticket.id}`)
      }, 1000)
    } catch (err: any) {
      setError(err?.message || 'Không thể hoàn tất')
    } finally {
      setLoading(false)
    }
  }

  // Lưu/sửa ĐỐT + DRC độc lập (kể cả khi phiếu ĐÃ hoàn tất) — QC đo đốt xong sau.
  // Cập nhật cả weighbridge_tickets lẫn lô nhập rubber_intake_batches (nếu đã sinh)
  // để KL khô (dry_weight_kg GENERATED) + công nợ tính đúng.
  async function handleSaveDrc() {
    if (!ticket) return
    setLoading(true)
    setError('')
    try {
      const cc = consolidationCode.trim() || null
      const { error: e1 } = await supabase
        .from('weighbridge_tickets')
        .update({ field_dot_reading: dotReading, qc_actual_drc: actualDrc, qc_drc_source: drcSource, consolidation_code: cc })
        .eq('id', ticket.id)
      if (e1) throw e1
      // Đồng bộ sang lô nhập (planned_drc_percent = DRC; dry_weight_kg tự tính lại)
      await supabase
        .from('rubber_intake_batches')
        .update({ field_dot_reading: dotReading, planned_drc_percent: actualDrc, consolidation_code: cc })
        .eq('weighbridge_ticket_id', ticket.id)

      const dry = actualDrc != null && ticket.net_weight ? ticket.net_weight * actualDrc / 100 : null
      message.success('Đã lưu ĐỐT/DRC' + (dry != null ? ` — KL khô ${dry.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} kg` : ''))
      const t = await weighbridgeService.getById(ticket.id)
      if (t) setTicket(t)
    } catch (err: any) {
      message.error('Lưu ĐỐT/DRC lỗi: ' + (err?.message || ''))
    } finally {
      setLoading(false)
    }
  }

  async function handleCancel() {
    if (!ticket) return
    Modal.confirm({
      title: 'Hủy phiếu cân?',
      content: 'Phiếu sẽ bị hủy và không thể khôi phục.',
      okText: 'Hủy phiếu',
      cancelText: 'Không',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await weighbridgeService.cancel(ticket.id, 'Hủy từ app cân')
          message.info('Đã hủy phiếu')
          navigate('/', { replace: true })
        } catch (err: any) {
          setError(err?.message || 'Không thể hủy')
        }
      },
    })
  }

  function handlePrint() {
    window.print()
  }

  // ============================================================================
  // KEYBOARD SHORTCUTS
  // ============================================================================

  // Keyboard shortcuts removed to prevent accidental actions

  // ============================================================================
  // RENDER
  // ============================================================================

  const isCreate = !ticket
  const isWeighingGross = ticket?.status === 'weighing_gross'
  const isWeighingTare = ticket?.status === 'weighing_tare'
  const isCompleted = ticket?.status === 'completed'
  const isOut = ticketDirection === 'out'
  // NHẬP: lần1 gross → lần2 tare (chờ tare==null). XUẤT: lần1 tare → lần2 gross (chờ gross==null).
  const secondPending = isOut
    ? (isWeighingTare && ticket?.gross_weight == null)
    : (isWeighingTare && ticket?.tare_weight == null)
  const canRecord = isWeighingGross || secondPending
  const canComplete = isOut
    ? (isWeighingTare && ticket?.gross_weight != null && ticket?.tare_weight != null)
    : (isWeighingTare && ticket?.tare_weight != null)

  const selectedDeal = deals.find((d) => d.id === selectedDealId)

  return (
    <div style={{ minHeight: '100vh', background: '#f0f2f5' }}>
      {/* Header — 3-column layout giống HomePage */}
      <div style={{ background: PRIMARY, padding: '6px 20px', position: 'sticky', top: 0, zIndex: 20 }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr auto 1fr',
            alignItems: 'center',
            gap: 16,
            maxWidth: 1400,
            margin: '0 auto',
          }}
        >
          {/* TRÁI — Back button + logo + tên công ty */}
          <Space size={10} align="center">
            <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/')} style={{ color: '#fff' }} />
            <div
              style={{
                background: '#fff',
                padding: '5px 8px',
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                boxShadow: '0 2px 6px rgba(0,0,0,0.12)',
              }}
            >
              <img
                src="/logo.png"
                alt="Huy Anh Rubber"
                style={{ height: 28, width: 'auto', display: 'block' }}
              />
            </div>
            <div style={{ lineHeight: 1.25 }}>
              <div style={{ color: '#fff', fontSize: 13, fontWeight: 700 }}>Công ty TNHH MTV</div>
              <div style={{ color: '#FFD54F', fontSize: 11, fontWeight: 500 }}>Cao su Huy Anh</div>
            </div>
          </Space>

          {/* GIỮA — Tên trạm cân + mã phiếu */}
          <div style={{ textAlign: 'center' }}>
            <Title level={4} style={{ color: '#fff', margin: 0, fontSize: 18, letterSpacing: 0.5 }}>
              ⚖️ TRẠM CÂN {currentFacility ? currentFacility.name.toUpperCase() : 'HUY ANH'}
            </Title>
            <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12 }}>
              {isCreate ? 'Tạo phiếu cân mới' : `Phiếu ${ticket?.code}`}
              {currentFacility && <> • <span style={{ color: '#FFD54F' }}>🏭 {currentFacility.code}</span></>}
            </Text>
          </div>

          {/* PHẢI — Status tags */}
          <Space size={6} style={{ justifySelf: 'end' }}>
            {ticket && (
              <Tag color={isCompleted ? 'success' : isWeighingTare ? 'warning' : 'processing'} style={{ margin: 0 }}>
                {isCompleted ? 'Hoàn tất' : isWeighingTare ? 'Chờ cân L2' : 'Chờ cân L1'}
              </Tag>
            )}
            <Tag color={scale.connected ? 'green' : 'red'} style={{ cursor: 'pointer', margin: 0 }} onClick={() => navigate('/settings')}>
              {scale.connected ? '● Cân OK' : '○ Chưa kết nối'}
            </Tag>
          </Space>
        </div>
      </div>

      <div style={{ maxWidth: 1500, margin: '0 auto', padding: '8px 16px 12px' }}>
        {error && <Alert type="error" message={error} showIcon closable onClose={() => setError('')} style={{ marginBottom: 12 }} />}
        {success && <Alert type="success" message={success} showIcon closable onClose={() => setSuccess('')} style={{ marginBottom: 12 }} />}
        {facilityError && <Alert type="warning" message={`Lỗi facility: ${facilityError}`} showIcon style={{ marginBottom: 12 }} />}

        {/* Thanh tiến trình — cả NHẬP lẫn XUẤT đều cân 2 lần (thứ tự ngược nhau):
            NHẬP: Gross (xe+hàng) → Tare (xe rỗng). XUẤT: Xe rỗng → Xe + hàng. */}
        {(ticketDirection === 'in' || ticketDirection === 'out') && (
          <Card size="small" style={{ borderRadius: 12, marginBottom: 8 }} styles={{ body: { padding: '8px 12px' } }}>
            <Steps
              size="small"
              current={isCompleted ? 3 : isWeighingTare ? 2 : isWeighingGross ? 1 : 0}
              items={ticketDirection === 'out'
                ? [
                    { title: 'Tạo phiếu' },
                    { title: 'Cân lần 1', description: 'Xe rỗng' },
                    { title: 'Cân lần 2', description: 'Xe + hàng' },
                    { title: 'Hoàn tất' },
                  ]
                : [
                    { title: 'Tạo phiếu' },
                    { title: 'Cân lần 1', description: 'Gross' },
                    {
                      title: 'Cân lần 2',
                      description: (rubberType === 'mu_nuoc' || dotReading != null)
                        ? 'Lấy mẫu · đốt · DRC · tare'
                        : 'Tare',
                    },
                    { title: 'Hoàn tất' },
                  ]
              }
            />
          </Card>
        )}

        <Row gutter={16}>
          {/* LEFT: Form — xếp dọc 1 cột (theo mock), rộng hơn camera */}
          <Col xs={24} lg={15}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
              {/* S3: Loại phiếu — IN (cân 2 lần) | OUT (cân 1 lần) */}
              <Card size="small" title="Loại phiếu cân" style={{ borderRadius: 12 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button
                    type={ticketDirection === 'in' ? 'primary' : 'default'}
                    onClick={() => setTicketDirection('in')}
                    style={ticketDirection === 'in' ? { background: PRIMARY, borderColor: PRIMARY, flex: 1 } : { flex: 1 }}
                    disabled={!!ticket}
                    size="large"
                  >
                    📥 NHẬP (vào kho)
                  </Button>
                  <Button
                    type={ticketDirection === 'out' ? 'primary' : 'default'}
                    onClick={() => setTicketDirection('out')}
                    style={ticketDirection === 'out' ? { background: '#E8A838', borderColor: '#E8A838', flex: 1 } : { flex: 1 }}
                    disabled={!!ticket}
                    size="large"
                  >
                    📤 XUẤT (ra kho)
                  </Button>
                </div>
                <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 6 }}>
                  {ticketDirection === 'in'
                    ? 'Cân 2 lần: Gross (xe + hàng) → Tare (xe rỗng) → Net'
                    : 'Cân 2 lần: Xe rỗng (Tare) → Xe + hàng (Gross) → Net hàng'}
                </Text>
              </Card>

              {/* F3: Transfer picker — hiện cho cả OUT (NM gửi) và IN (NM nhận) khi có pending */}
              {transferOptions.length > 0 && !ticket && (
                <Card
                  size="small"
                  title={`🔀 Phiếu chuyển kho ${ticketDirection === 'out' ? '(cân xuất tại NM gửi)' : '(cân nhận tại NM đến)'}`}
                  style={{ borderRadius: 12, borderColor: '#1B4D3E', borderWidth: 2 }}
                >
                  <Space direction="vertical" size={8} style={{ width: '100%' }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Có {transferOptions.length} phiếu chuyển đang chờ cân — chọn nếu xe này thuộc phiếu chuyển kho
                    </Text>
                    <Select
                      value={selectedTransferId || undefined}
                      onChange={async (v) => {
                        setSelectedTransferId(v || '')
                        const tr = transferOptions.find((x) => x.id === v)
                        // Auto-fill biển số xe từ phiếu chuyển
                        if (tr?.vehicle_plate && !vehiclePlate) setVehiclePlate(tr.vehicle_plate)
                        if (tr?.driver_name && !driverName) setDriverName(tr.driver_name)
                        // F3 cân OUT: load planned KL hàng (sum items.weight_planned_kg)
                        // dùng để compute TARE = GROSS - planned khi user nhập số cân
                        if (v) {
                          try {
                            const full = await transferService.getById(v)
                            const planned = (full?.items || []).reduce(
                              (s, i) => s + (i.weight_planned_kg || 0), 0,
                            )
                            setTransferPlannedKg(planned)
                          } catch {
                            setTransferPlannedKg(0)
                          }
                        } else {
                          setTransferPlannedKg(0)
                        }
                      }}
                      placeholder={loadingTransfers ? 'Đang tải...' : 'Chọn phiếu chuyển (hoặc bỏ trống nếu không phải transfer)'}
                      style={{ width: '100%' }}
                      allowClear
                      loading={loadingTransfers}
                      showSearch
                      optionFilterProp="label"
                      options={transferOptions.map((t) => ({
                        value: t.id,
                        label: `${t.code} — ${t.from_facility?.code}→${t.to_facility?.code}${t.vehicle_plate ? ` · ${t.vehicle_plate}` : ''}`,
                      }))}
                    />
                    {selectedTransferId && (() => {
                      const tr = transferOptions.find((x) => x.id === selectedTransferId)
                      if (!tr) return null
                      return (
                        <div style={{ padding: 10, background: '#F0FDF4', borderRadius: 8, fontSize: 12, border: '1px solid #BBF7D0' }}>
                          <Space size={4} wrap>
                            <Tag color="blue">{tr.from_facility?.code}</Tag>→
                            <Tag color="green">{tr.to_facility?.code}</Tag>
                            <Text type="secondary">|</Text>
                            <Text>Mã: <Text strong>{tr.code}</Text></Text>
                            {ticketDirection === 'out' && transferPlannedKg > 0 && (
                              <>
                                <Text type="secondary">|</Text>
                                <Text>📦 KL dự kiến: <Text strong style={{ color: '#1B4D3E' }}>{transferPlannedKg.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} kg</Text> <Text type="secondary">(tham khảo)</Text></Text>
                              </>
                            )}
                            {ticketDirection === 'in' && tr.weight_out_kg && (
                              <>
                                <Text type="secondary">|</Text>
                                <Text>Cân xuất TL: <Text strong>{tr.weight_out_kg.toLocaleString('vi-VN')} kg</Text></Text>
                              </>
                            )}
                          </Space>
                          {ticketDirection === 'out' && (
                            <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px dashed #BBF7D0', color: '#1B4D3E' }}>
                              ⚖️ Cân <Text strong>2 lần</Text>: lần 1 = <Text strong>xe rỗng</Text> → lần 2 = <Text strong>xe + hàng</Text>.
                              KL hàng thực = lần 2 − lần 1 (trừ kho theo số đo thực này).
                            </div>
                          )}
                        </div>
                      )
                    })()}
                  </Space>
                </Card>
              )}

              {/* S3 OUT: Sales Order + Container picker — CHỈ hiện ở NM xuất khẩu (PD).
                  Ẩn ở TL/LAO (can_ship_to_customer=false) vì các NM này không xuất trực tiếp,
                  chỉ làm transfer về PD. Cũng ẨN khi đã chọn transfer (tránh confusion). */}
              {ticketDirection === 'out' && !selectedTransferId && currentFacility?.can_ship_to_customer && (
                <Card size="small" title="Đơn hàng xuất" style={{ borderRadius: 12, borderColor: '#E8A838' }}>
                  <Space direction="vertical" size={12} style={{ width: '100%' }}>
                    <div>
                      <Text type="secondary" style={{ fontSize: 12 }}>Sales Order (tuỳ chọn — bỏ trống nếu xuất lẻ)</Text>
                      <Select
                        value={selectedSalesOrderId || undefined}
                        onChange={v => { setSelectedSalesOrderId(v || ''); setSelectedContainerId('') }}
                        placeholder="Chọn đơn hàng bán..."
                        style={{ width: '100%' }}
                        disabled={!!ticket}
                        allowClear
                        loading={loadingSO}
                        showSearch
                        optionFilterProp="label"
                        options={salesOrders.map(s => ({
                          value: s.id,
                          label: `${s.code} — ${s.customer_name} — ${s.grade} — ${(s.quantity_kg / 1000).toFixed(1)}T`,
                        }))}
                      />
                      {selectedSO && (
                        <div style={{ marginTop: 8, padding: 8, background: '#FEF3C7', borderRadius: 8 }}>
                          <Text strong style={{ color: '#92400E' }}>{selectedSO.customer_name}</Text>
                          <br />
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {selectedSO.grade} · {selectedSO.container_count}× {selectedSO.container_type}
                            {selectedSO.port_of_destination && ` · ${selectedSO.port_of_destination}`}
                          </Text>
                          {selectedSO.vessel_name && (
                            <><br /><Text type="secondary" style={{ fontSize: 11 }}>🚢 {selectedSO.vessel_name}</Text></>
                          )}
                        </div>
                      )}
                    </div>

                    {selectedSalesOrderId && (
                      <div>
                        <Text type="secondary" style={{ fontSize: 12 }}>Container (1 phiếu cân = 1 container)</Text>
                        <Select
                          value={selectedContainerId || undefined}
                          onChange={v => setSelectedContainerId(v || '')}
                          placeholder="Chọn container..."
                          style={{ width: '100%' }}
                          disabled={!!ticket}
                          allowClear
                          loading={loadingContainers}
                          notFoundContent={containers.length === 0 ? 'SO chưa có container nào sẵn sàng' : undefined}
                          options={containers.map(c => ({
                            value: c.id,
                            label: `${c.container_no || '(chưa số)'} · ${c.container_type} · ${c.bale_count || 0} bành${c.status ? ` · ${c.status}` : ''}`,
                          }))}
                        />
                        {selectedContainer && (
                          <div style={{ marginTop: 8, padding: 8, background: '#F0F9FF', borderRadius: 8, fontSize: 12 }}>
                            ⚖️ Cân <Text strong>2 lần</Text> đo thực: lần 1 = xe + <Text strong>container RỖNG</Text> → lần 2 = + <Text strong>HÀNG</Text>. NET = hàng (không gồm vỏ container).
                          </div>
                        )}
                      </div>
                    )}

                    <div>
                      <Text type="secondary" style={{ fontSize: 12 }}>Số seal thực tế (nếu khác kế hoạch)</Text>
                      <Input
                        value={sealNoActual}
                        onChange={e => setSealNoActual(e.target.value)}
                        placeholder="VD: ABC1234567"
                        disabled={!!ticket}
                      />
                    </div>
                  </Space>
                </Card>
              )}

              {/* IN-only: Source Deal/Supplier */}
              {ticketDirection === 'in' && (
              <Card size="small" title="Nguồn mủ" style={{ borderRadius: 12 }}>
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Button
                      size="large"
                      type={sourceType === 'deal' ? 'primary' : 'default'}
                      onClick={() => setSourceType('deal')}
                      style={sourceType === 'deal' ? { background: PRIMARY, borderColor: PRIMARY, flex: 1 } : { flex: 1 }}
                      disabled={isCompleted}
                    >
                      📦 Theo Deal (đã chốt)
                    </Button>
                    <Button
                      size="large"
                      type={sourceType !== 'deal' ? 'primary' : 'default'}
                      onClick={() => { if (sourceType === 'deal') setSourceType('partner_direct') }}
                      style={sourceType !== 'deal' ? { background: PRIMARY, borderColor: PRIMARY, flex: 1 } : { flex: 1 }}
                      disabled={isCompleted}
                    >
                      👤 Đối tác trực tiếp
                    </Button>
                  </div>

                  {sourceType === 'deal' ? (
                    <div>
                      <Text type="secondary" style={{ fontSize: 12 }}>Chọn Deal B2B</Text>
                      <Select
                        size="large"
                        value={selectedDealId || undefined}
                        onChange={handleDealSelect}
                        placeholder="Chọn Deal..."
                        style={{ width: '100%' }}
                        disabled={isCompleted}
                        allowClear
                        showSearch
                        optionFilterProp="label"
                        options={deals.map((d) => ({
                          value: d.id,
                          label: `${d.deal_number} — ${d.partner_name} — Còn ${(d.remaining_kg / 1000).toFixed(1)}T`,
                        }))}
                      />
                      {selectedDeal && (
                        <div style={{ marginTop: 8, padding: 8, background: '#F0FDF4', borderRadius: 8 }}>
                          <Text strong style={{ color: '#15803D' }}>{selectedDeal.partner_name}</Text>
                          <br />
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {selectedDeal.product_name} • Còn {(selectedDeal.remaining_kg / 1000).toFixed(1)} T
                          </Text>
                        </div>
                      )}

                      {/* Dropdown chọn xe đã khai báo — chỉ hiện nếu deal có plan */}
                      {selectedDealId && deliveryPlans.length > 0 && (
                        <div style={{ marginTop: 12 }}>
                          <Text type="secondary" style={{ fontSize: 12 }}>Xe đã khai báo ({deliveryPlans.filter(p => p.status === 'pending').length} chờ / {deliveryPlans.length} tổng)</Text>
                          <Select
                            value={selectedPlanId || undefined}
                            onChange={handlePlanSelect}
                            placeholder="Chọn xe đã khai báo (hoặc bỏ qua nếu xe mới)"
                            style={{ width: '100%' }}
                            disabled={isCompleted}
                            allowClear
                            options={deliveryPlans.map((p) => {
                              const weighed = p.status === 'weighed'
                              const declared = `${(p.declared_kg / 1000).toFixed(2)}T`
                              const driver = p.driver_name ? ` · ${p.driver_name}` : ''
                              return {
                                value: p.id,
                                disabled: weighed || p.status === 'cancelled',
                                label: (
                                  <span style={{
                                    textDecoration: weighed ? 'line-through' : 'none',
                                    color: weighed ? '#9ca3af' : undefined,
                                  }}>
                                    {p.vehicle_plate} — {declared}{driver}
                                    {weighed && <Tag color="green" style={{ marginLeft: 6 }}>Đã cân</Tag>}
                                    {p.status === 'cancelled' && <Tag color="default" style={{ marginLeft: 6 }}>Hủy</Tag>}
                                    {p.status === 'no_show' && <Tag color="red" style={{ marginLeft: 6 }}>Không đến</Tag>}
                                  </span>
                                ) as any,
                              }
                            })}
                          />
                          {selectedPlanId && (
                            <div style={{ marginTop: 6, padding: 6, background: '#EFF6FF', borderRadius: 6, fontSize: 12 }}>
                              <Text type="secondary">Đã điền biển số + tài xế từ kế hoạch. Cân xong sẽ tự match.</Text>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    /* Đối tác trực tiếp — GỘP đại lý B2B + NCC trong 1 ô search (kết quả có nhãn) */
                    <div>
                      <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                        Tìm đối tác — đại lý B2B hoặc NCC (Lào / NCC Việt)
                      </Text>
                      <B2BPartnerPicker
                        includeSuppliers
                        value={sourceType === 'supplier' ? (selectedSupplierId || null) : directPartnerId}
                        onChange={(id, opt) => {
                          if (!id || !opt) {
                            setSourceType('partner_direct'); setDirectPartnerId(null); setSelectedSupplierId('')
                          } else if (opt.kind === 'supplier') {
                            setSourceType('supplier'); setSelectedSupplierId(id); setDirectPartnerId(null); setSelectedDealId('')
                          } else {
                            setSourceType('partner_direct'); setDirectPartnerId(id); setSelectedSupplierId('')
                          }
                        }}
                        disabled={isCompleted}
                      />
                    </div>
                  )}

                  {/* Loại mủ — chips gọn nằm TRONG Nguồn mủ (theo mock). Bind rubberType
                      (lái priceUnit + DRC); partner_direct lưu rubber_type = rubberType. */}
                  <div>
                    <Divider style={{ margin: '4px 0 10px' }} />
                    <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>
                      Loại mủ <span style={{ color: '#94a3b8' }}>(1 chạm — dùng cho cả phiếu &amp; gom bonus)</span>
                    </Text>
                    <Radio.Group
                      value={rubberType}
                      onChange={(e) => setRubberType(e.target.value)}
                      disabled={isCompleted}
                      buttonStyle="solid"
                      style={{ width: '100%', display: 'flex', flexWrap: 'wrap', gap: 8 }}
                    >
                      <Radio.Button value="mu_nuoc">💧 Mủ nước</Radio.Button>
                      <Radio.Button value="mu_tap">🪨 Mủ tạp</Radio.Button>
                      <Radio.Button value="mu_dong">🧊 Mủ đông</Radio.Button>
                      <Radio.Button value="mu_chen">🥣 Mủ chén</Radio.Button>
                      <Radio.Button value="mu_to">📄 Mủ tờ</Radio.Button>
                    </Radio.Group>
                    {sourceType === 'partner_direct' && (
                      <Text type="secondary" style={{ fontSize: 11, marginTop: 8, display: 'block' }}>
                        ⇒ Nhóm bonus: <strong style={{ color: rubberType === 'mu_nuoc' ? '#1677ff' : '#d97706' }}>
                          {rubberType === 'mu_nuoc' ? 'Mủ nước' : 'Mủ tạp'}
                        </strong>
                      </Text>
                    )}
                  </div>
                </Space>
              </Card>
              )}

              {/* Vehicle info */}
              <Card size="small" title="Thông tin vận chuyển" style={{ borderRadius: 12 }}>
                <Row gutter={[12, 12]}>
                  <Col span={24}>
                    <Text type="secondary" style={{ fontSize: 12 }}>Biển số xe *</Text>
                    <AutoComplete
                      size="large"
                      value={vehiclePlate}
                      onChange={(v) => {
                        const upper = (v || '').toUpperCase()
                        setVehiclePlate(upper)
                        if (upper.length >= 2) handlePlateSearch(upper)
                        checkPlateDupToday(upper)
                      }}
                      onSelect={(v) => { handlePlateSelect(v); checkPlateDupToday(v) }}
                      onBlur={() => checkPlateDupToday(vehiclePlate)}
                      placeholder="VD: 43C-123.45"
                      style={{ width: '100%' }}
                      disabled={isCompleted}
                      options={plateHistory.map((p) => ({ value: p, label: p }))}
                    />
                    {dupPlateWarning && dupPlateWarning.count > 0 && (
                      <div style={{
                        marginTop: 6, padding: '6px 10px', borderRadius: 6,
                        background: '#FFF7E6', border: '1px solid #FFD591',
                        fontSize: 12, color: '#D46B08',
                      }}>
                        ⚠ Biển <b>{vehiclePlate}</b> đã có {dupPlateWarning.count} phiếu cân hôm nay
                        ({dupPlateWarning.codes.slice(0,3).join(', ')}
                        {dupPlateWarning.codes.length > 3 ? '...' : ''}).
                        Kiểm tra trước khi tạo phiếu mới (cân lại? 2 chuyến?).
                      </div>
                    )}
                    {tareSuggestion && tareSuggestion.count > 0 && (
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        💡 Tare TB {tareSuggestion.count} lần: {tareSuggestion.avgTare?.toLocaleString()} kg
                      </Text>
                    )}
                  </Col>
                  <Col span={12}>
                    <Text type="secondary" style={{ fontSize: 12 }}>Tài xế</Text>
                    <Input
                      size="large"
                      value={driverName}
                      onChange={(e) => setDriverName(e.target.value)}
                      placeholder="Tên tài xế..."
                      disabled={isCompleted}
                    />
                  </Col>
                  <Col span={12}>
                    <Text type="secondary" style={{ fontSize: 12 }}>SĐT tài xế</Text>
                    <Input
                      size="large"
                      value={driverPhone}
                      onChange={(e) => setDriverPhone(e.target.value)}
                      placeholder="0905..."
                      disabled={isCompleted}
                    />
                  </Col>
                </Row>
              </Card>

              {/* F2 Tân Lâm — Card "Đo DRC tại cân" cho mủ nước
                  Hiển thị khi: ticket existing + IN + mủ nước (auto-detect TL flow)
                  Quy trình: gross → lấy mẫu → đốt → xã mủ → cân tare + nhập ĐỐT/DRC */}
              {ticket && ticketDirection === 'in' && (rubberType === 'mu_nuoc' || dotReading != null) && (
              <Card
                size="small"
                title={
                  <Space>
                    <span style={{ fontSize: 16 }}>🧪</span>
                    <Text strong style={{ color: PRIMARY }}>Đo DRC tại cân (Tân Lâm)</Text>
                  </Space>
                }
                style={{ borderRadius: 12, borderColor: PRIMARY, borderWidth: 2 }}
              >
                <Row gutter={[12, 12]}>
                  <Col span={12}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      ĐỐT <span style={{ color: '#999' }}>(metrolac)</span>
                    </Text>
                    <InputNumber
                      value={dotReading}
                      onChange={(v) => {
                        const n = typeof v === 'number' ? v : null
                        setDotReading(n)
                        // Mỗi lần ĐỐT đổi → cập nhật lại DRC từ bảng drc_lookup.
                        // QC vẫn có thể override sau bằng cách sửa trực tiếp ô DRC.
                        // Clear ĐỐT (n=null) → clear DRC luôn.
                        if (n == null) {
                          setActualDrc(null)
                          setDrcSource(null)
                        } else {
                          const suggested = drcLookupService.lookupSync(drcLookupRows, n)
                          if (suggested != null) {
                            setActualDrc(suggested)
                            setDrcSource('lookup')
                          }
                        }
                      }}
                      style={{ width: '100%' }}
                      min={100}
                      max={350}
                      placeholder="180-241"
                    />
                  </Col>
                  <Col span={12}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      DRC thực (%){' '}
                      {drcSource === 'lookup' && (
                        <span style={{ color: '#52c41a' }}>· auto từ bảng</span>
                      )}
                      {drcSource === 'manual' && (
                        <span style={{ color: '#fa8c16' }}>· nhập tay</span>
                      )}
                      {drcSource == null && (
                        <span style={{ color: '#999' }}>tự tính từ ĐỐT</span>
                      )}
                    </Text>
                    <InputNumber
                      value={actualDrc}
                      onChange={(v) => {
                        const n = typeof v === 'number' ? v : null
                        setActualDrc(n)
                        // Operator chỉnh tay → override source thành 'manual'.
                        // Nếu clear → reset source.
                        setDrcSource(n == null ? null : 'manual')
                      }}
                      style={{ width: '100%' }}
                      min={0}
                      max={100}
                      step={0.1}
                      placeholder="0-100"
                    />
                  </Col>
                  {/* Preview KL khô khi có đủ data */}
                  {ticket?.net_weight && actualDrc && (
                    <Col span={24}>
                      <div style={{
                        background: '#F0F9F4', border: '1px solid #b7eb8f',
                        borderRadius: 8, padding: '8px 12px',
                      }}>
                        <Text style={{ fontSize: 12 }}>
                          📊 KL khô = {ticket.net_weight.toLocaleString()} kg × {actualDrc}% = {' '}
                          <Text strong style={{ color: PRIMARY, fontSize: 14 }}>
                            {(ticket.net_weight * actualDrc / 100).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} kg
                          </Text>
                        </Text>
                      </div>
                    </Col>
                  )}
                  <Col span={24}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Mã LLM (gộp xe) <span style={{ color: '#999' }}>tùy chọn</span>
                    </Text>
                    <Input
                      value={consolidationCode}
                      onChange={(e) => setConsolidationCode(e.target.value)}
                      placeholder="VD: TMMN-07 XE 1 (19/05)"
                    />
                  </Col>
                  <Col span={24}>
                    <Text type="secondary" style={{ fontSize: 11, fontStyle: 'italic' }}>
                      💡 Nhập ĐỐT + DRC. QC có thể nhập/sửa cả khi phiếu ĐÃ hoàn tất rồi bấm "Lưu ĐỐT/DRC".
                      Auto-suggest DRC dùng <strong>bảng quy đổi HAQT</strong> ({drcLookupRows.length} dòng) — QC sửa được ở Cài đặt → Bảng quy đổi DRC.
                    </Text>
                  </Col>
                  <Col span={24}>
                    <Button
                      type="primary" block onClick={handleSaveDrc} loading={loading}
                      style={{ background: PRIMARY, borderColor: PRIMARY }}
                    >
                      💾 Lưu ĐỐT/DRC
                    </Button>
                  </Col>
                </Row>
              </Card>
              )}

              {/* OUT-only: Loại mủ trên xe — CHỌN NHIỀU (xe về PD có thể chở nhiều loại) */}
              {ticketDirection === 'out' && (
                <Card size="small" title="Loại mủ trên xe (chọn nhiều)" style={{ borderRadius: 12 }}>
                  <Space wrap>
                    {[
                      { value: 'mu_nuoc', label: '💧 Mủ nước' },
                      { value: 'mu_tap', label: '🪨 Mủ tạp' },
                      { value: 'mu_dong', label: '🧊 Mủ đông' },
                      { value: 'mu_chen', label: '🥣 Mủ chén' },
                      { value: 'mu_to', label: '📄 Mủ tờ' },
                    ].map((opt) => {
                      const active = outRubberTypes.includes(opt.value)
                      return (
                        <Button
                          key={opt.value}
                          size="large"
                          type={active ? 'primary' : 'default'}
                          disabled={isCompleted}
                          onClick={() => setOutRubberTypes(
                            active ? outRubberTypes.filter((v) => v !== opt.value) : [...outRubberTypes, opt.value],
                          )}
                          style={active ? { background: PRIMARY, borderColor: PRIMARY } : {}}
                        >
                          {opt.label}
                        </Button>
                      )
                    })}
                  </Space>
                  <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 8 }}>
                    Chọn tất cả loại mủ đang có trên xe (in lên phiếu). Có thể chọn nhiều.
                  </Text>
                </Card>
              )}

              {/* OUT-only: Ghi chú đơn giản */}
              {ticketDirection === 'out' && (
                <Card size="small" title="Ghi chú" style={{ borderRadius: 12 }}>
                  <Input.TextArea value={notes} onChange={(e) => setNotes(e.target.value)}
                    rows={2} placeholder="Ghi chú thêm (nếu có)..." disabled={isCompleted} />
                </Card>
              )}

              {/* Camera */}
              {ticket && (
                <CameraPanel
                  ticketId={ticket.id}
                  disabled={isCompleted}
                  captureRef={cameraCaptureRef}
                />
              )}

            </div>
          </Col>

          {/* RIGHT: Scale + Summary — sticky, luôn thấy số cân khi cuộn form */}
          <Col xs={24} lg={9}>
            <div style={{ position: 'sticky', top: 72, display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
              {/* SỐ PHIẾU CÂN — luôn hiển thị nổi bật */}
              <Card
                size="small"
                style={{ borderRadius: 12, background: PRIMARY, border: 'none' }}
                styles={{ body: { padding: '7px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' } }}
              >
                <div>
                  <div style={{ color: 'rgba(255,255,255,.75)', fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' }}>Số phiếu cân</div>
                  <div style={{ ...MONO, color: '#fff', fontSize: 18, fontWeight: 800, letterSpacing: 1 }}>
                    {ticket?.code || '— tự sinh khi tạo —'}
                  </div>
                </div>
                {ticket && (
                  <Tag color={isCompleted ? 'success' : isWeighingTare ? 'warning' : 'processing'} style={{ margin: 0 }}>
                    {isCompleted ? '✓ Hoàn tất' : isWeighingTare ? '⏳ Chờ cân L2' : '⏳ Chờ cân L1'}
                  </Tag>
                )}
              </Card>

              {/* Live Scale Display */}
              {ticket && !isCompleted && canRecord && (
                <Card size="small" style={{ borderRadius: 12 }}>
                  <div style={{ textAlign: 'center' }}>
                    <Text type="secondary" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 2 }}>
                      {isOut
                        ? (isWeighingGross ? '⚖️ Cân lần 1 (Xe rỗng)' : '⚖️ Cân lần 2 (Xe + hàng)')
                        : (isWeighingGross ? '⚖️ Cân lần 1 (Gross)' : '⚖️ Cân lần 2 (Tare)')}
                    </Text>

                    {/* Scale reading */}
                    {scale.connected && scale.liveWeight ? (
                      <div style={{
                        background: '#111', borderRadius: 12, padding: '16px 24px', margin: '12px 0',
                        border: '2px solid #333',
                      }}>
                        <div style={{ ...MONO, fontSize: 56, fontWeight: 700, color: '#00FF41', lineHeight: 1.1 }}>
                          {scale.liveWeight.weight.toLocaleString()}
                        </div>
                        <Text style={{ color: '#666', fontSize: 14 }}>
                          {scale.liveWeight.unit} {scale.liveWeight.stable ? '● Ổn định' : '○ Chưa ổn định...'}
                        </Text>
                      </div>
                    ) : (
                      <div style={{ margin: '12px 0' }}>
                        <Text type="secondary" style={{ fontSize: 12 }}>Nhập trọng lượng thủ công:</Text>
                        <InputNumber
                          value={manualWeight}
                          onChange={(v) => setManualWeight(v)}
                          style={{ width: '100%', marginTop: 4 }}
                          size="large"
                          min={0}
                          placeholder="Nhập trọng lượng (kg)"
                          formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                          addonAfter="kg"
                        />
                      </div>
                    )}

                    {/* Scale error */}
                    {scale.error && (
                      <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', padding: 10, borderRadius: 8, marginBottom: 8 }}>
                        <Text type="danger" style={{ fontSize: 12 }}>
                          ⚠️ {scale.error}
                        </Text>
                      </div>
                    )}

                    {/* Tare suggestion */}
                    {isWeighingTare && tareSuggestion && tareSuggestion.avgTare && (
                      <div style={{ background: '#FFFBE6', padding: 8, borderRadius: 8, marginBottom: 8 }}>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          💡 Tare TB {tareSuggestion.count} lần trước: {tareSuggestion.avgTare?.toLocaleString()} kg
                        </Text>
                        <Button
                          type="link" size="small"
                          onClick={() => setManualWeight(tareSuggestion.avgTare)}
                        >
                          Dùng giá trị này
                        </Button>
                      </div>
                    )}

                    {canRecord && (
                      <Button
                        type="primary" size="large" block
                        icon={<ThunderboltOutlined />}
                        onClick={handleRecordWeight}
                        loading={loading}
                        style={{ height: 48, background: '#D97706', borderColor: '#D97706', fontSize: 16 }}
                      >
                        {isWeighingGross ? 'GHI CÂN LẦN 1' : 'GHI CÂN LẦN 2'}
                      </Button>
                    )}
                  </div>
                </Card>
              )}

              {/* Weight Summary */}
              <Card size="small" style={{ borderRadius: 12 }} styles={{ body: { padding: 0 } }}>
                <Row>
                  <Col span={8} style={{ textAlign: 'center', padding: '10px 8px' }}>
                    <Text type="secondary" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>Gross</Text>
                    <div style={{ ...MONO, fontSize: 20, fontWeight: 700 }}>
                      {ticket?.gross_weight != null ? ticket.gross_weight.toLocaleString() : '---'}
                    </div>
                    <Text type="secondary" style={{ fontSize: 11 }}>kg</Text>
                  </Col>
                  <Col span={8} style={{ textAlign: 'center', padding: '10px 8px', borderLeft: '1px solid #f0f0f0', borderRight: '1px solid #f0f0f0' }}>
                    <Text type="secondary" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>Tare</Text>
                    <div style={{ ...MONO, fontSize: 20, fontWeight: 700 }}>
                      {ticket?.tare_weight != null ? ticket.tare_weight.toLocaleString() : '---'}
                    </div>
                    <Text type="secondary" style={{ fontSize: 11 }}>kg</Text>
                  </Col>
                  <Col span={8} style={{ textAlign: 'center', padding: '10px 8px', background: calc ? '#F0FDF4' : undefined }}>
                    <Text type="secondary" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>NET</Text>
                    <div style={{ ...MONO, fontSize: 20, fontWeight: 700, color: calc ? '#15803D' : '#141414' }}>
                      {calc ? calc.net_weight.toLocaleString() : (ticket?.net_weight != null ? ticket.net_weight.toLocaleString() : '---')}
                    </div>
                    <Text type="secondary" style={{ fontSize: 12 }}>kg</Text>
                  </Col>
                </Row>
              </Card>

              {/* P4: Nhập mủ gần đây — dưới tổng kết (theo mock), avatar loại mủ + DRC/Net + link */}
              {isCreate && (
                <Card
                  size="small"
                  title={<span style={{ fontSize: 13 }}>🧾 Nhập mủ gần đây</span>}
                  style={{ borderRadius: 12 }}
                  styles={{ body: { padding: 0 } }}
                >
                  {recentTickets.length === 0 ? (
                    <div style={{ padding: 16, textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>
                      Chưa có phiếu nhập nào tại {currentFacility?.name ?? 'nhà máy này'}.
                    </div>
                  ) : (
                    <>
                      <div style={{ maxHeight: 150, overflowY: 'auto' }}>
                        {recentTickets.map((t, idx) => {
                          const ext = t as any
                          const who = (ext.supplier_name || t.vehicle_plate || '—') as string
                          const rt = ext.rubber_type as string | undefined
                          const drc = ext.qc_actual_drc as number | null | undefined
                          const plate = t.vehicle_plate || ''
                          const time = ext.created_at
                            ? new Date(ext.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
                            : ''
                          const emoji = rt && RUBBER_LABELS[rt] ? RUBBER_LABELS[rt].split(' ')[0] : '🧪'
                          const rtName = rt && RUBBER_LABELS[rt] ? RUBBER_LABELS[rt].replace(/^\S+\s/, '') : (rt || '')
                          return (
                            <div
                              key={t.id}
                              onClick={() => navigate(`/weigh/${t.id}`)}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px',
                                cursor: 'pointer', borderTop: idx === 0 ? 'none' : '1px solid #f5f5f5',
                              }}
                            >
                              <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#f0f5f3', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, flexShrink: 0 }}>
                                {emoji}
                              </div>
                              <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ fontSize: 13, fontWeight: 600, color: '#1f2937', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{who}</div>
                                <div style={{ fontSize: 11, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {rtName}{plate ? ` · ${plate}` : ''}{time ? ` · ${time}` : ''}
                                </div>
                              </div>
                              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                <div style={{ ...MONO, fontSize: 14, fontWeight: 700, color: '#1f2937' }}>
                                  {t.net_weight != null ? t.net_weight.toLocaleString('vi-VN') : '—'}
                                  <span style={{ fontSize: 10, color: '#999', fontWeight: 400 }}> kg</span>
                                </div>
                                <div style={{ fontSize: 10, color: drc != null ? '#2563eb' : '#94a3b8' }}>
                                  {drc != null
                                    ? `DRC ${drc}%`
                                    : t.status === 'completed' ? 'Net' : t.status === 'weighing_tare' ? 'Chờ L2' : 'Chờ L1'}
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                      <div
                        onClick={() => navigate('/')}
                        style={{ textAlign: 'center', padding: '8px 0', borderTop: '1px solid #f0f0f0', color: PRIMARY, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                      >
                        Xem tất cả phiếu hôm nay →
                      </div>
                    </>
                  )}
                </Card>
              )}

              {/* Card 'Tính toán' đã bỏ — trạm cân chỉ quan tâm KL, tiền
                  tính sau ở Deal/Quyết toán */}

              {/* QC gate đã bỏ — DRC là thông số quan trọng, để QC lab
                  chuyên trách test sau (tab QC của Deal / Quick Scan).
                  Trạm cân chỉ chịu trách nhiệm Gross/Tare/Net. */}

              {/* Action buttons */}
              {ticket && (
                <Row gutter={8}>
                  {canComplete && (
                    <Col span={12}>
                      <Button
                        type="primary" size="large" block
                        icon={<CheckOutlined />}
                        onClick={() => handleComplete()}
                        loading={loading}
                        style={{ height: 48, background: '#16A34A', borderColor: '#16A34A' }}
                      >
                        HOÀN TẤT
                      </Button>
                    </Col>
                  )}
                  {isCompleted && (
                    <Col span={12}>
                      <Button size="large" block icon={<PrinterOutlined />} onClick={handlePrint}
                        style={{ height: 48 }}>
                        IN PHIẾU
                      </Button>
                    </Col>
                  )}
                  {isCompleted && (
                    <Col span={12}>
                      <Button type="primary" size="large" block
                        onClick={() => navigate('/weigh')}
                        style={{ height: 48, background: PRIMARY, borderColor: PRIMARY }}>
                        Cân xe tiếp
                      </Button>
                    </Col>
                  )}
                  {!isCompleted && (
                    <Col span={canComplete ? 12 : 24}>
                      <Button size="large" block danger onClick={handleCancel}>
                        Hủy phiếu
                      </Button>
                    </Col>
                  )}
                </Row>
              )}

            </div>
          </Col>

          {/* Thanh TẠO PHIẾU — Col full-width DƯỚI cả 2 cột, căn khít theo lưới Row */}
          {isCreate && (
            <Col xs={24} style={{ marginTop: 6 }}>
              <Button
                type="primary" block
                onClick={handleCreate} loading={loading}
                disabled={!vehiclePlate.trim()}
                style={{ height: 50, fontSize: 17, fontWeight: 700, background: PRIMARY, borderColor: PRIMARY, borderRadius: 12 }}
              >
                Tạo phiếu &amp; Bắt đầu cân
              </Button>
            </Col>
          )}
        </Row>
      </div>
    </div>
  )
}
