import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Card, Button, Input, Select, Typography, Space, Row, Col, Alert, Divider,
  Tag, InputNumber, message, Modal, AutoComplete,
} from 'antd'
import {
  ArrowLeftOutlined, SaveOutlined, PrinterOutlined, CheckOutlined,
  CameraOutlined, ThunderboltOutlined,
} from '@ant-design/icons'
import { useAuthStore } from '@/stores/authStore'
import { useCurrentFacility } from '@/stores/facilityStore'
import weighbridgeService from '@erp/services/wms/weighbridgeService'
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

const DESTINATIONS = [
  { value: 'cong_1', label: 'Cổng 1' },
  { value: 'cong_2', label: 'Cổng 2' },
  { value: 'cong_3', label: 'Cổng 3' },
  { value: 'bai_mu', label: 'Bãi mủ' },
]

// S3: Tare cố định theo loại container (kg) — user decision
const CONTAINER_TARE_KG: Record<string, number> = {
  '20ft': 2300,
  '40ft': 3800,
}

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
  const scale = useKeliScale()

  // Ticket state
  const [ticket, setTicket] = useState<WeighbridgeTicket | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Form state
  const [vehiclePlate, setVehiclePlate] = useState('')
  const [driverName, setDriverName] = useState('')
  const [plateHistory, setPlateHistory] = useState<string[]>([])
  const [tareSuggestion, setTareSuggestion] = useState<{ avgTare: number | null; lastTare: number | null; count: number } | null>(null)
  // S3: Loại phiếu cân — IN (cân 2 lần gross/tare) | OUT (cân 1 lần net trực tiếp)
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
  const [sourceType, setSourceType] = useState<'deal' | 'supplier'>('deal')

  // Rubber fields
  const [rubberType, setRubberType] = useState<string>('mu_dong')
  const [expectedDrc, setExpectedDrc] = useState<number | null>(null)
  const [unitPrice, setUnitPrice] = useState<number | null>(null)
  const [priceUnit, setPriceUnit] = useState<'wet' | 'dry'>('wet')
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
  }, [currentFacility?.id, currentFacility?.code])

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
        if (ext.rubber_type) setRubberType(ext.rubber_type)
        if (ext.expected_drc) setExpectedDrc(ext.expected_drc)
        if (ext.unit_price) setUnitPrice(ext.unit_price)
        if (ext.price_unit) setPriceUnit(ext.price_unit)
        if (ext.destination) setDestination(ext.destination)
        if (ext.deduction_kg) setDeductionKg(ext.deduction_kg)
        // Calculate if both weights exist
        if (t.gross_weight != null && t.tare_weight != null) {
          recalculate(t.gross_weight, t.tare_weight, ext.deduction_kg || 0, ext.expected_drc, ext.unit_price, ext.price_unit)
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

  async function handleDealSelect(dealId: string) {
    setSelectedDealId(dealId)
    setSelectedSupplierId('')
    const deal = deals.find((d) => d.id === dealId)
    if (!deal) return

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
    if (ext.expected_drc) setExpectedDrc(ext.expected_drc)
    if (ext.unit_price) setUnitPrice(ext.unit_price)
    if (ext.price_unit === 'wet' || ext.price_unit === 'dry') setPriceUnit(ext.price_unit)

    // Prefill thông tin xe/tài xế từ "Báo đã giao" của đại lý (nếu có)
    // → operator không phải nhập lại. Chỉ prefill nếu operator chưa gõ.
    try {
      const delivery = await dealWmsService.getLatestDeliveryForDeal(dealId)
      if (delivery) {
        if (delivery.vehicle_plate && !vehiclePlate) {
          setVehiclePlate(delivery.vehicle_plate.toUpperCase())
        }
        if (delivery.driver_name && !driverName) {
          setDriverName(delivery.driver_name)
        }
        if (delivery.notes && !notes) {
          setNotes(`[Từ báo đã giao] ${delivery.notes}`)
        }
      }
    } catch (e) {
      console.warn('[handleDealSelect] fetch delivery failed:', e)
    }
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
    setLoading(true)
    setError('')
    try {
      const t = await weighbridgeService.create(
        {
          vehicle_plate: vehiclePlate.trim(),
          driver_name: driverName || undefined,
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

      // Save rubber fields
      const rubberData: RubberWeighData = {
        rubber_type: rubberType,
        expected_drc: expectedDrc ?? undefined,
        unit_price: unitPrice ?? undefined,
        price_unit: priceUnit,
        destination: destination || undefined,
        deduction_kg: deductionKg,
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
      // S3 + F3: OUT flow — cân 1 lần. weight nhập = TỔNG CÂN (gross). Tare phụ thuộc context:
      //   • Có Container (SO export) → tare cố định = container_tare (20ft=2300, 40ft=3800)
      //   • Có Transfer + planned > 0 → TARE xe = GROSS - planned (NET = planned)
      //     (KL hàng đã biết trước, cân chỉ để xác định tare xe — không bị "trốn")
      //   • Xuất lẻ hoặc transfer chưa có planned → tare = 0, NET = weight (giả lập đơn giản)
      if (ticket.ticket_type === 'out') {
        const isContainerShipment = !!selectedContainerId
        const isTransferWithPlanned = !!selectedTransferId && transferPlannedKg > 0
        const containerType = selectedContainer?.container_type || '20ft'

        let tareKg = 0
        let ctxLabel = 'xuất lẻ (NET trực tiếp)'

        if (isContainerShipment) {
          tareKg = CONTAINER_TARE_KG[containerType] || CONTAINER_TARE_KG['20ft']
          ctxLabel = `container ${containerType}, tare ${tareKg.toLocaleString()} kg`
        } else if (isTransferWithPlanned) {
          // GROSS = weight nhập, NET = planned (KL hàng đã biết), TARE = GROSS - planned
          tareKg = Math.max(0, Math.round((weight - transferPlannedKg) * 100) / 100)
          if (weight < transferPlannedKg) {
            // Edge case: GROSS < planned → fallback NET = GROSS
            tareKg = 0
            ctxLabel = `transfer (cân ${weight} < KL dự kiến ${transferPlannedKg}, fallback NET=GROSS)`
          } else {
            ctxLabel = `transfer: TARE xe = ${tareKg.toLocaleString('vi-VN')} kg, NET hàng = ${transferPlannedKg.toLocaleString('vi-VN')} kg`
          }
        }

        updated = await weighbridgeService.updateGrossWeight(ticket.id, weight, operator?.id)
        updated = await weighbridgeService.updateTareWeight(ticket.id, tareKg, operator?.id)
        setTicket(updated)
        const c = recalculate(weight, tareKg, deductionKg, expectedDrc, unitPrice, priceUnit)
        setSuccess(`Cân OUT: gross ${weight.toLocaleString()} kg | ${ctxLabel} → NET ${c.net_weight.toLocaleString('vi-VN')} kg`)
        setManualWeight(null)
        if (cameraCaptureRef.current) {
          cameraCaptureRef.current('OUT').catch(() => {})
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
        updated = await weighbridgeService.updateTareWeight(ticket.id, weight, operator?.id)
        setTicket(updated)
        const c = recalculate(
          updated.gross_weight!, weight, deductionKg,
          expectedDrc, unitPrice, priceUnit,
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

  async function handleComplete() {
    if (!ticket) return
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
  const canRecord = isWeighingGross || (isWeighingTare && ticket?.tare_weight == null)
  const canComplete = isWeighingTare && ticket?.tare_weight != null

  const selectedDeal = deals.find((d) => d.id === selectedDealId)

  return (
    <div style={{ minHeight: '100vh', background: '#f0f2f5' }}>
      {/* Header — 3-column layout giống HomePage */}
      <div style={{ background: PRIMARY, padding: '10px 20px', position: 'sticky', top: 0, zIndex: 20 }}>
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

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: 16 }}>
        {error && <Alert type="error" message={error} showIcon closable onClose={() => setError('')} style={{ marginBottom: 12 }} />}
        {success && <Alert type="success" message={success} showIcon closable onClose={() => setSuccess('')} style={{ marginBottom: 12 }} />}
        {facilityError && <Alert type="warning" message={`Lỗi facility: ${facilityError}`} showIcon style={{ marginBottom: 12 }} />}

        <Row gutter={16}>
          {/* LEFT: Form */}
          <Col xs={24} lg={10}>
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
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
                    : 'Cân 1 lần: weight = net trực tiếp (xe đã có hàng)'}
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
                                <Text>📦 KL hàng: <Text strong style={{ color: '#1B4D3E' }}>{transferPlannedKg.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} kg</Text></Text>
                              </>
                            )}
                            {ticketDirection === 'in' && tr.weight_out_kg && (
                              <>
                                <Text type="secondary">|</Text>
                                <Text>Cân xuất TL: <Text strong>{tr.weight_out_kg.toLocaleString('vi-VN')} kg</Text></Text>
                              </>
                            )}
                          </Space>
                          {ticketDirection === 'out' && transferPlannedKg > 0 && (
                            <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px dashed #BBF7D0', color: '#1B4D3E' }}>
                              💡 Cân scale cho ra <Text strong>tổng</Text> (xe + hàng).
                              Hệ thống tự tính: <Text code>TARE xe = TỔNG cân − {transferPlannedKg.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} kg</Text>
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
                            <Text strong>Tare cố định:</Text> {(CONTAINER_TARE_KG[selectedContainer.container_type || '20ft'] || 2300).toLocaleString()} kg ({selectedContainer.container_type})
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
                      type={sourceType === 'deal' ? 'primary' : 'default'}
                      onClick={() => setSourceType('deal')}
                      style={sourceType === 'deal' ? { background: PRIMARY, borderColor: PRIMARY } : {}}
                      disabled={isCompleted}
                    >
                      Theo Deal
                    </Button>
                    <Button
                      type={sourceType === 'supplier' ? 'primary' : 'default'}
                      onClick={() => setSourceType('supplier')}
                      style={sourceType === 'supplier' ? { background: PRIMARY, borderColor: PRIMARY } : {}}
                      disabled={isCompleted}
                    >
                      Theo NCC
                    </Button>
                  </div>

                  {sourceType === 'deal' ? (
                    <div>
                      <Text type="secondary" style={{ fontSize: 12 }}>Chọn Deal B2B</Text>
                      <Select
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
                    </div>
                  ) : (
                    <div>
                      <Text type="secondary" style={{ fontSize: 12 }}>Chọn NCC mủ</Text>
                      <Select
                        value={selectedSupplierId || undefined}
                        onChange={(v) => { setSelectedSupplierId(v); setSelectedDealId('') }}
                        placeholder="Chọn NCC..."
                        style={{ width: '100%' }}
                        disabled={isCompleted}
                        allowClear
                        showSearch
                        optionFilterProp="label"
                        options={suppliers.map((s) => ({
                          value: s.id,
                          label: `${s.code} — ${s.name}`,
                        }))}
                      />
                    </div>
                  )}
                </Space>
              </Card>
              )}

              {/* Vehicle info */}
              <Card size="small" title="Thông tin xe" style={{ borderRadius: 12 }}>
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  <div>
                    <Text type="secondary" style={{ fontSize: 12 }}>Biển số xe *</Text>
                    <AutoComplete
                      value={vehiclePlate}
                      onChange={(v) => {
                        const upper = (v || '').toUpperCase()
                        setVehiclePlate(upper)
                        if (upper.length >= 2) handlePlateSearch(upper)
                      }}
                      onSelect={(v) => handlePlateSelect(v)}
                      placeholder="Nhập biển số..."
                      style={{ width: '100%' }}
                      disabled={isCompleted}
                      options={plateHistory.map((p) => ({ value: p, label: p }))}
                    />
                    {tareSuggestion && tareSuggestion.count > 0 && (
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        💡 Tare TB {tareSuggestion.count} lần: {tareSuggestion.avgTare?.toLocaleString()} kg
                      </Text>
                    )}
                  </div>
                  <div>
                    <Text type="secondary" style={{ fontSize: 12 }}>Tài xế</Text>
                    <Input
                      value={driverName}
                      onChange={(e) => setDriverName(e.target.value)}
                      placeholder="Tên tài xế..."
                      disabled={isCompleted}
                    />
                  </div>
                </Space>
              </Card>

              {/* Rubber fields — IN only (TP xuất không cần loại mủ/DRC/đơn giá/vị trí dỡ/tạp chất) */}
              {ticketDirection === 'in' && (
              <Card size="small" title="Thông tin mủ" style={{ borderRadius: 12 }}>
                <Row gutter={[12, 12]}>
                  <Col span={12}>
                    <Text type="secondary" style={{ fontSize: 12 }}>Loại mủ</Text>
                    <Select value={rubberType} onChange={setRubberType} style={{ width: '100%' }}
                      disabled={isCompleted} options={RUBBER_TYPES} />
                  </Col>
                  <Col span={12}>
                    <Text type="secondary" style={{ fontSize: 12 }}>DRC kỳ vọng (%)</Text>
                    <InputNumber value={expectedDrc} onChange={(v) => setExpectedDrc(v)}
                      style={{ width: '100%' }} min={0} max={100} disabled={isCompleted} />
                  </Col>
                  <Col span={12}>
                    <Text type="secondary" style={{ fontSize: 12 }}>Đơn giá (đ/kg)</Text>
                    <InputNumber value={unitPrice} onChange={(v) => setUnitPrice(v)}
                      style={{ width: '100%' }} min={0} disabled={isCompleted}
                      formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} />
                  </Col>
                  <Col span={12}>
                    <Text type="secondary" style={{ fontSize: 12 }}>Vị trí dỡ</Text>
                    <Select value={destination || undefined} onChange={setDestination}
                      style={{ width: '100%' }} options={DESTINATIONS} allowClear
                      placeholder="Chọn..." disabled={isCompleted} />
                  </Col>
                  <Col span={24}>
                    <Text type="secondary" style={{ fontSize: 12 }}>Ghi chú</Text>
                    <Input.TextArea value={notes} onChange={(e) => setNotes(e.target.value)}
                      rows={2} placeholder="Ghi chú..." disabled={isCompleted} />
                  </Col>
                </Row>
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

              {/* Create button */}
              {isCreate && (
                <Button
                  type="primary" size="large" block
                  onClick={handleCreate} loading={loading}
                  disabled={!vehiclePlate.trim()}
                  style={{ height: 48, background: PRIMARY, borderColor: PRIMARY }}
                >
                  Tạo phiếu & Bắt đầu cân
                </Button>
              )}
            </Space>
          </Col>

          {/* RIGHT: Scale + Summary */}
          <Col xs={24} lg={14}>
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              {/* Live Scale Display */}
              {ticket && !isCompleted && canRecord && (
                <Card size="small" style={{ borderRadius: 12 }}>
                  <div style={{ textAlign: 'center' }}>
                    <Text type="secondary" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 2 }}>
                      {isWeighingGross ? '⚖️ Cân lần 1 (Gross)' : '⚖️ Cân lần 2 (Tare)'}
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
                  <Col span={8} style={{ textAlign: 'center', padding: 16 }}>
                    <Text type="secondary" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>Gross</Text>
                    <div style={{ ...MONO, fontSize: 24, fontWeight: 700 }}>
                      {ticket?.gross_weight != null ? ticket.gross_weight.toLocaleString() : '---'}
                    </div>
                    <Text type="secondary" style={{ fontSize: 12 }}>kg</Text>
                  </Col>
                  <Col span={8} style={{ textAlign: 'center', padding: 16, borderLeft: '1px solid #f0f0f0', borderRight: '1px solid #f0f0f0' }}>
                    <Text type="secondary" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>Tare</Text>
                    <div style={{ ...MONO, fontSize: 24, fontWeight: 700 }}>
                      {ticket?.tare_weight != null ? ticket.tare_weight.toLocaleString() : '---'}
                    </div>
                    <Text type="secondary" style={{ fontSize: 12 }}>kg</Text>
                  </Col>
                  <Col span={8} style={{ textAlign: 'center', padding: 16, background: calc ? '#F0FDF4' : undefined }}>
                    <Text type="secondary" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>NET</Text>
                    <div style={{ ...MONO, fontSize: 24, fontWeight: 700, color: calc ? '#15803D' : '#141414' }}>
                      {calc ? calc.net_weight.toLocaleString() : (ticket?.net_weight != null ? ticket.net_weight.toLocaleString() : '---')}
                    </div>
                    <Text type="secondary" style={{ fontSize: 12 }}>kg</Text>
                  </Col>
                </Row>
              </Card>

              {/* Rubber calculation summary */}
              {calc && (
                <Card size="small" title="Tính toán" style={{ borderRadius: 12 }}>
                  <Row gutter={[16, 8]}>
                    <Col span={12}>
                      <Text type="secondary">NET:</Text>
                      <Text strong style={{ ...MONO, float: 'right' }}>{calc.net_weight.toLocaleString()} kg</Text>
                    </Col>
                    <Col span={12}>
                      <Text strong>KL Thực:</Text>
                      <Text strong style={{ ...MONO, float: 'right', color: '#15803D' }}>
                        {calc.actual_net_weight.toLocaleString()} kg
                      </Text>
                    </Col>
                    {calc.dry_weight_estimate != null && (
                      <Col span={12}>
                        <Text type="secondary">KL Khô ({expectedDrc}%):</Text>
                        <Text style={{ ...MONO, float: 'right', color: '#B45309' }}>
                          {calc.dry_weight_estimate.toLocaleString()} kg
                        </Text>
                      </Col>
                    )}
                    {calc.estimated_value != null && (
                      <>
                        <Col span={24}><Divider style={{ margin: '4px 0' }} /></Col>
                        <Col span={24} style={{ textAlign: 'right' }}>
                          <Text strong style={{ fontSize: 18, color: PRIMARY }}>
                            Thành tiền: {calc.estimated_value.toLocaleString()} đ
                          </Text>
                        </Col>
                      </>
                    )}
                  </Row>
                </Card>
              )}

              {/* Action buttons */}
              {ticket && (
                <Row gutter={8}>
                  {canComplete && (
                    <Col span={12}>
                      <Button
                        type="primary" size="large" block
                        icon={<CheckOutlined />}
                        onClick={handleComplete}
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

              {/* Keyboard shortcuts hint */}
              <Card size="small" style={{ borderRadius: 12, background: '#FAFAFA' }}>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  Trạm Cân — Cao Su Huy Anh Phong Điền
                </Text>
              </Card>
            </Space>
          </Col>
        </Row>
      </div>
    </div>
  )
}
