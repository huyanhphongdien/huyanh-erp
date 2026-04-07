import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Card, Button, Input, Select, Typography, Space, Row, Col, Alert, Divider,
  Tag, InputNumber, Switch, message, Modal, AutoComplete,
} from 'antd'
import {
  ArrowLeftOutlined, SaveOutlined, PrinterOutlined, CheckOutlined,
  CameraOutlined, ThunderboltOutlined,
} from '@ant-design/icons'
import { useAuthStore } from '@/stores/authStore'
import weighbridgeService from '@erp/services/wms/weighbridgeService'
import { useKeliScale } from '@erp/hooks/useKeliScale'
import { dealWmsService } from '@erp/services/b2b/dealWmsService'
import type { ActiveDealForStockIn } from '@erp/services/b2b/dealWmsService'
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

interface SupplierOption {
  id: string
  code: string
  name: string
}

export default function WeighingPage() {
  const navigate = useNavigate()
  const { ticketId } = useParams()
  const { operator } = useAuthStore()
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
  const [destination, setDestination] = useState<string>('')
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
    // Load deals and suppliers
    dealWmsService.getActiveDealsForStockIn().then((d) => { console.log('Deals loaded:', d); setDeals(d) }).catch((err) => console.error('Deal load error:', err))
    getRubberSuppliers().then((s) => setSuppliers(s.map((x: any) => ({ id: x.id, code: x.code, name: x.name })))).catch(() => {})
  }, [])

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
        setVehiclePlate(t.vehicle_plate)
        setDriverName(t.driver_name || '')
        setNotes(t.notes || '')
        // Load rubber fields from extended columns
        const ext = t as any
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

  function handleDealSelect(dealId: string) {
    setSelectedDealId(dealId)
    setSelectedSupplierId('')
    const deal = deals.find((d) => d.id === dealId)
    if (deal) {
      // Auto-fill from deal
      const ext = deal as any
      if (ext.product_name) {
        const lower = ext.product_name.toLowerCase()
        if (lower.includes('đông') || lower.includes('dong')) setRubberType('mu_dong')
        else if (lower.includes('nước') || lower.includes('nuoc')) setRubberType('mu_nuoc')
        else if (lower.includes('tạp') || lower.includes('tap')) setRubberType('mu_tap')
        else if (lower.includes('svr')) setRubberType('svr')
      }
      if (ext.expected_drc) setExpectedDrc(ext.expected_drc)
      if (ext.unit_price) setUnitPrice(ext.unit_price)
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
        { vehicle_plate: vehiclePlate.trim(), driver_name: driverName || undefined, ticket_type: 'in', notes: notes || undefined },
        operator?.id,
      )
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

      // Update deal if linked
      if (selectedDealId && updated.net_weight) {
        try {
          await dealWmsService.updateDealStockInTotals(selectedDealId)
        } catch { /* non-blocking */ }
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
      {/* Header */}
      <div style={{ background: PRIMARY, padding: '10px 20px', position: 'sticky', top: 0, zIndex: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, maxWidth: 1200, margin: '0 auto' }}>
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/')} style={{ color: '#fff' }} />
          <Title level={5} style={{ color: '#fff', margin: 0, flex: 1 }}>
            {isCreate ? 'Tạo phiếu cân mới' : `Phiếu ${ticket?.code}`}
          </Title>
          {ticket && (
            <Tag color={
              isCompleted ? 'success' : isWeighingTare ? 'warning' : 'processing'
            }>
              {isCompleted ? 'Hoàn tất' : isWeighingTare ? 'Chờ cân L2' : 'Chờ cân L1'}
            </Tag>
          )}
          {/* Scale status — kết nối qua icon ⚙️ */}
          <Space size={4}>
            <Tag color={scale.connected ? 'green' : 'red'}>
              {scale.connected ? '● Đã kết nối cân' : '○ Chưa kết nối'}
            </Tag>
            <ScaleSettings scale={scale} />
          </Space>
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: 16 }}>
        {error && <Alert type="error" message={error} showIcon closable onClose={() => setError('')} style={{ marginBottom: 12 }} />}
        {success && <Alert type="success" message={success} showIcon closable onClose={() => setSuccess('')} style={{ marginBottom: 12 }} />}

        <Row gutter={16}>
          {/* LEFT: Form */}
          <Col xs={24} lg={10}>
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              {/* Source: Deal or Supplier */}
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

              {/* Rubber fields */}
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
                    <Text type="secondary" style={{ fontSize: 12 }}>Loại giá</Text>
                    <div style={{ marginTop: 4 }}>
                      <Switch
                        checked={priceUnit === 'dry'}
                        onChange={(checked) => setPriceUnit(checked ? 'dry' : 'wet')}
                        checkedChildren="Khô"
                        unCheckedChildren="Ướt"
                        disabled={isCompleted}
                      />
                    </div>
                  </Col>
                  <Col span={12}>
                    <Text type="secondary" style={{ fontSize: 12 }}>Vị trí dỡ</Text>
                    <Select value={destination || undefined} onChange={setDestination}
                      style={{ width: '100%' }} options={DESTINATIONS} allowClear
                      placeholder="Chọn..." disabled={isCompleted} />
                  </Col>
                  <Col span={12}>
                    <Text type="secondary" style={{ fontSize: 12 }}>Tạp chất (kg)</Text>
                    <InputNumber value={deductionKg} onChange={(v) => setDeductionKg(v || 0)}
                      style={{ width: '100%' }} min={0} disabled={isCompleted} />
                  </Col>
                  <Col span={24}>
                    <Text type="secondary" style={{ fontSize: 12 }}>Ghi chú</Text>
                    <Input.TextArea value={notes} onChange={(e) => setNotes(e.target.value)}
                      rows={2} placeholder="Ghi chú..." disabled={isCompleted} />
                  </Col>
                </Row>
              </Card>

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
                      <Text type="secondary">Tạp chất:</Text>
                      <Text style={{ ...MONO, float: 'right', color: calc.deduction_kg > 0 ? '#DC2626' : undefined }}>
                        - {calc.deduction_kg.toLocaleString()} kg
                      </Text>
                    </Col>
                    <Col span={24}><Divider style={{ margin: '4px 0' }} /></Col>
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
