// ============================================================================
// STOCK IN CREATE PAGE — Ant Design + Rubber Intake
// File: src/pages/wms/stock-in/StockInCreatePage.tsx
// Rewrite: Tailwind -> Ant Design v6, them rubber fields (supplier, type, grade)
// ============================================================================

import React, { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Card,
  Steps,
  Form,
  Select,
  Input,
  InputNumber,
  Button,
  Space,
  Typography,
  Row,
  Col,
  Tag,
  Alert,
  Statistic,
  Modal,
  Spin,
  Empty,
  Result,
  Radio,
  Divider,
  List,
  message,
} from 'antd'
import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  PlusOutlined,
  DeleteOutlined,
  SaveOutlined,
  CheckCircleOutlined,
  ExperimentOutlined,
  EnvironmentOutlined,
  InboxOutlined,
  ScanOutlined,
} from '@ant-design/icons'
import { supabase } from '../../../lib/supabase'
import stockInService from '../../../services/wms/stockInService'
import { useActiveWarehouses } from '../../../hooks/useActiveWarehouses'
import WarehousePicker from '../../../components/wms/WarehousePicker'
import { dealWmsService } from '../../../services/b2b/dealWmsService'
import type { ActiveDealForStockIn } from '../../../services/b2b/dealWmsService'
import { useAuthStore } from '../../../stores/authStore'
import LocationPicker from '../../../components/wms/LocationPicker'
import type { LocationData } from '../../../components/wms/LocationPicker'
import QCInputForm, { QCBadge } from '../../../components/wms/QCInputForm'
import type { QCFormData, QCResultType } from '../../../components/wms/QCInputForm'
import GradeBadge from '../../../components/wms/GradeBadge'
import { rubberGradeService } from '../../../services/wms/rubberGradeService'
import type { RubberGrade, RubberType } from '../../../services/wms/wms.types'
import { RUBBER_TYPE_LABELS } from '../../../services/wms/wms.types'

const { Title, Text } = Typography

// ============================================================================
// TYPES
// ============================================================================

interface WarehouseOption { id: string; code: string; name: string; type: string }
interface MaterialOption { id: string; sku: string; name: string; unit: string; weight_per_unit: number | null }

interface DetailItem {
  tempId: string
  material_id: string
  material?: MaterialOption
  quantity: number
  weight: number
  location_id?: string
  location?: LocationData
  drc_value?: number
  qc_result?: QCResultType
  qc_message?: string
  notes?: string
  // Rubber
  rubber_grade?: RubberGrade
  dry_weight?: number
  qcFormData?: QCFormData
}

type StockType = 'raw' | 'finished'
type SourceType = 'production' | 'purchase' | 'blend' | 'transfer' | 'adjust' | 'return' | 'repack'

// Nguồn nhập hợp lệ theo loại kho:
//   - NVL: mua hàng từ nông trại, phối trộn (NVL out), chuyển kho NVL, điều chỉnh
//   - TP: sản xuất, phối trộn (TP output), khách trả, đóng gói lại, chuyển kho TP, điều chỉnh
const SOURCE_OPTIONS_RAW = [
  { value: 'purchase', label: 'Mua hàng (nông trại)' },
  { value: 'transfer', label: 'Chuyển kho NVL' },
  { value: 'adjust', label: 'Điều chỉnh kiểm kê' },
]

const SOURCE_OPTIONS_FINISHED = [
  { value: 'production', label: 'Sản xuất' },
  { value: 'blend', label: 'Phối trộn' },
  { value: 'return', label: 'Khách trả hàng' },
  { value: 'repack', label: 'Đóng gói lại' },
  { value: 'transfer', label: 'Chuyển kho TP' },
  { value: 'adjust', label: 'Điều chỉnh kiểm kê' },
]

const RUBBER_TYPE_OPTIONS = Object.entries(RUBBER_TYPE_LABELS).map(([value, label]) => ({
  value, label,
}))

// ============================================================================
// ADD DETAIL MODAL
// ============================================================================

const AddDetailModal: React.FC<{
  open: boolean
  warehouseId: string
  onSubmit: (item: DetailItem) => void
  onCancel: () => void
}> = ({ open, warehouseId, onSubmit, onCancel }) => {
  const [materials, setMaterials] = useState<MaterialOption[]>([])
  const [loadingMat, setLoadingMat] = useState(true)
  const [materialId, setMaterialId] = useState('')
  const [quantity, setQuantity] = useState<number | null>(null)
  const [selectedLocation, setSelectedLocation] = useState<LocationData | null>(null)
  const [qcData, setQcData] = useState<QCFormData | null>(null)
  const [itemNotes, setItemNotes] = useState('')
  const [supplierReportedDrc, setSupplierReportedDrc] = useState<number | null>(null)

  useEffect(() => {
    const load = async () => {
      setLoadingMat(true)
      const { data } = await supabase
        .from('materials')
        .select('id, sku, name, unit, weight_per_unit')
        .eq('is_active', true)
        .order('name')
      if (data) setMaterials(data)
      setLoadingMat(false)
    }
    if (open) load()
  }, [open])

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      setMaterialId('')
      setQuantity(null)
      setSelectedLocation(null)
      setQcData(null)
      setItemNotes('')
      setSupplierReportedDrc(null)
    }
  }, [open])

  const selectedMaterial = materials.find(m => m.id === materialId)
  const qtyNum = quantity || 0
  const weightCalc = selectedMaterial?.weight_per_unit
    ? Math.round(qtyNum * selectedMaterial.weight_per_unit * 100) / 100
    : qtyNum
  const canSubmit = materialId && qtyNum > 0 && qcData !== null
  // Ưu tiên grade từ material SKU (chính xác cho RSS/Latex/SVR L/CV),
  // chỉ fallback sang phân loại theo DRC nếu SKU không match pattern
  const autoGrade = rubberGradeService.resolveGrade({
    sku: selectedMaterial?.sku,
    drc: qcData?.drc_value,
  }) || undefined
  const dryWeight = qcData?.drc_value && weightCalc > 0
    ? rubberGradeService.calculateDryWeight(weightCalc, qcData.drc_value) : 0

  // DRC discrepancy
  const drcDiscrepancy = supplierReportedDrc && qcData?.drc_value
    ? Math.round((qcData.drc_value - supplierReportedDrc) * 10) / 10
    : null

  const handleSubmit = () => {
    if (!canSubmit || !qcData) return
    onSubmit({
      tempId: `temp-${Date.now()}`,
      material_id: materialId,
      material: selectedMaterial,
      quantity: qtyNum,
      weight: weightCalc,
      location_id: selectedLocation?.id,
      location: selectedLocation || undefined,
      drc_value: qcData.drc_value,
      qc_result: qcData.qc_result,
      qc_message: qcData.qc_message,
      notes: itemNotes || qcData.notes,
      rubber_grade: autoGrade,
      dry_weight: dryWeight,
      qcFormData: qcData,
    })
  }

  return (
    <Modal
      title={<Space><PlusOutlined /> Thêm sản phẩm</Space>}
      open={open}
      onCancel={onCancel}
      width={640}
      footer={[
        <Button key="cancel" onClick={onCancel}>Huỷ</Button>,
        <Button key="submit" type="primary" onClick={handleSubmit} disabled={!canSubmit}
          style={{ background: canSubmit ? '#2D8B6E' : undefined, borderColor: canSubmit ? '#2D8B6E' : undefined }}>
          <CheckCircleOutlined /> Thêm vào phiếu
        </Button>,
      ]}
      styles={{ body: { maxHeight: '70vh', overflow: 'auto' } }}
    >
      {/* Material */}
      <div style={{ marginBottom: 16 }}>
        <Text strong style={{ display: 'block', marginBottom: 4 }}>Sản phẩm *</Text>
        <Select
          value={materialId || undefined}
          onChange={setMaterialId}
          placeholder="Chọn sản phẩm"
          style={{ width: '100%' }}
          size="large"
          loading={loadingMat}
          showSearch
          optionFilterProp="label"
          options={materials.map(m => ({
            value: m.id,
            label: `${m.sku} — ${m.name} (${m.unit})`,
          }))}
        />
      </div>

      {/* Quantity */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={12}>
          <Text strong style={{ display: 'block', marginBottom: 4 }}>
            Số lượng ({selectedMaterial?.unit || 'kg'}) *
          </Text>
          <InputNumber
            value={quantity}
            onChange={setQuantity}
            min={0}
            placeholder="0"
            style={{ width: '100%' }}
            size="large"
          />
        </Col>
        <Col span={12}>
          <Text strong style={{ display: 'block', marginBottom: 4 }}>Trọng lượng (kg)</Text>
          <InputNumber value={weightCalc} disabled style={{ width: '100%' }} size="large" />
          {dryWeight > 0 && (
            <Text type="secondary" style={{ fontSize: 11 }}>
              Dry weight: {dryWeight.toLocaleString()} kg
              {autoGrade && <> · <GradeBadge grade={autoGrade} size="small" /></>}
            </Text>
          )}
        </Col>
      </Row>

      {/* DRC đại lý báo (rubber) */}
      <div style={{ marginBottom: 16 }}>
        <Text strong style={{ display: 'block', marginBottom: 4 }}>DRC đại lý báo (%)</Text>
        <InputNumber
          value={supplierReportedDrc}
          onChange={setSupplierReportedDrc}
          min={0} max={100} step={0.1}
          placeholder="VD: 55.0"
          style={{ width: '100%' }}
        />
        {drcDiscrepancy !== null && Math.abs(drcDiscrepancy) > 1 && (
          <Alert
            type={Math.abs(drcDiscrepancy) > 3 ? 'error' : 'warning'}
            message={`Chênh lệch DRC: ${drcDiscrepancy > 0 ? '+' : ''}${drcDiscrepancy}% (QC: ${qcData?.drc_value}% vs Đại lý: ${supplierReportedDrc}%)`}
            showIcon
            banner
            style={{ marginTop: 4, borderRadius: 6 }}
          />
        )}
      </div>

      {/* Location Picker */}
      <Divider style={{ margin: '8px 0' }} />
      <LocationPicker
        warehouse_id={warehouseId}
        selectedId={selectedLocation?.id}
        onSelect={setSelectedLocation}
        mode="stock-in"
      />

      {/* QC Input Form */}
      <Divider style={{ margin: '8px 0' }} />
      <QCInputForm
        material_id={materialId}
        onChange={setQcData}
        required
        showAdvanced
        showNotes={false}
      />

      {/* Notes */}
      <div style={{ marginTop: 16 }}>
        <Text strong style={{ display: 'block', marginBottom: 4 }}>Ghi chú</Text>
        <Input
          value={itemNotes}
          onChange={e => setItemNotes(e.target.value)}
          placeholder="Ghi chú cho dòng này..."
        />
      </div>
    </Modal>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const StockInCreatePage = () => {
  const navigate = useNavigate()
  const { user } = useAuthStore()

  // Wizard state
  const [step, setStep] = useState(0) // 0, 1, 2

  // Top-level mode: NVL vs TP (quyết định loại kho + source options + fields hiển thị)
  const [stockType, setStockType] = useState<StockType>('raw')

  // Step 1: Header
  const [warehouseId, setWarehouseId] = useState('')
  const [sourceType, setSourceType] = useState<SourceType>('purchase')
  const [dealId, setDealId] = useState('')
  const [headerNotes, setHeaderNotes] = useState('')
  // Rubber fields
  const [supplierName, setSupplierName] = useState('')
  const [supplierRegion, setSupplierRegion] = useState('')
  const [rubberType, setRubberType] = useState<string>('')

  // QR scan
  const [ticketCode, setTicketCode] = useState('')
  const [scanLoading, setScanLoading] = useState(false)
  const [scannedTicket, setScannedTicket] = useState<any>(null)

  // Step 2: Details
  const [details, setDetails] = useState<DetailItem[]>([])
  const [showAddModal, setShowAddModal] = useState(false)

  // Data — warehouses via shared hook, dùng chung cache với các page khác
  const { data: warehouses = [] } = useActiveWarehouses()
  const [activeDeals, setActiveDeals] = useState<ActiveDealForStockIn[]>([])
  const [loadingDeals, setLoadingDeals] = useState(false)

  // Submit
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successCode, setSuccessCode] = useState<string | null>(null)

  // Khi đổi mode NVL ↔ TP: reset kho + source về default hợp lệ
  useEffect(() => {
    setWarehouseId('')
    setSourceType(stockType === 'raw' ? 'purchase' : 'production')
    setDealId('')
  }, [stockType])

  // Load deals when source = purchase
  useEffect(() => {
    if (sourceType !== 'purchase') { setActiveDeals([]); setDealId(''); return }
    const load = async () => {
      setLoadingDeals(true)
      try {
        const deals = await dealWmsService.getActiveDealsForStockIn()
        setActiveDeals(deals)
      } catch (err) { console.error(err) }
      setLoadingDeals(false)
    }
    load()
  }, [sourceType])

  const selectedDeal = activeDeals.find(d => d.id === dealId)
  const selectedWarehouse = warehouses.find(w => w.id === warehouseId)

  // Auto-fill from deal when deal is selected (purchase mode)
  useEffect(() => {
    if (sourceType === 'purchase' && selectedDeal) {
      if (selectedDeal.partner_name && !supplierName) {
        setSupplierName(selectedDeal.partner_name)
      }
      if (selectedDeal.product_name && !rubberType) {
        // Try to match product_name to a rubber type
        const matchedType = Object.entries(RUBBER_TYPE_LABELS).find(
          ([, label]) => selectedDeal.product_name?.toLowerCase().includes(label.toLowerCase())
        )
        if (matchedType) {
          setRubberType(matchedType[0])
        }
      }
    }
  }, [dealId, selectedDeal, sourceType])

  // QR scan handler
  const handleScanTicket = async (code: string) => {
    const trimmed = code.trim()
    if (!trimmed) {
      message.warning('Vui lòng nhập mã phiếu cân')
      return
    }
    setScanLoading(true)
    try {
      const { data: ticket, error: ticketError } = await supabase
        .from('weighbridge_tickets')
        .select('code, deal_id, supplier_name, vehicle_plate, net_weight, rubber_type, partner_id, expected_drc, unit_price')
        .eq('code', trimmed)
        .single()

      if (ticketError || !ticket) {
        message.error(`Không tìm thấy phiếu cân: ${trimmed}`)
        setScanLoading(false)
        return
      }

      // Lấy deal info riêng nếu có deal_id
      let dealInfo: any = null
      if (ticket.deal_id) {
        const { data: deal } = await supabase
          .from('b2b_deals')
          .select('id, deal_number, partner_id, product_name, quantity_kg')
          .eq('id', ticket.deal_id)
          .single()
        dealInfo = deal
      }

      setScannedTicket({ ...ticket, deal: dealInfo })

      // Auto-fill from ticket
      if (ticket.supplier_name) {
        setSupplierName(ticket.supplier_name)
      }
      if (ticket.rubber_type) {
        setRubberType(ticket.rubber_type)
      }
      if (ticket.vehicle_plate) {
        setHeaderNotes(prev => prev ? `${prev}\nBiển số xe: ${ticket.vehicle_plate}` : `Biển số xe: ${ticket.vehicle_plate}`)
      }

      // If ticket has deal_id, switch to purchase mode and select the deal
      if (ticket.deal_id) {
        setSourceType('purchase')
        // Wait for deals to load, then set dealId
        setTimeout(() => {
          setDealId(ticket.deal_id)
        }, 500)
      }

      message.success(`Đã tìm thấy phiếu cân: ${ticket.code} - KL ròng: ${ticket.net_weight ? `${ticket.net_weight.toLocaleString()} kg` : 'N/A'}`)
    } catch (err: any) {
      message.error(`Lỗi tra cứu phiếu cân: ${err.message}`)
    } finally {
      setScanLoading(false)
    }
  }

  // Summary calculations
  const totalQty = details.reduce((s, d) => s + d.quantity, 0)
  const totalWeight = details.reduce((s, d) => s + d.weight, 0)
  const totalDryWeight = details.reduce((s, d) => s + (d.dry_weight || 0), 0)
  const hasQCFailed = details.some(d => d.qc_result === 'failed')

  // Handlers
  const handleAddDetail = (item: DetailItem) => {
    setDetails(prev => [...prev, item])
    setShowAddModal(false)
  }

  const handleRemoveDetail = (tempId: string) => {
    setDetails(prev => prev.filter(d => d.tempId !== tempId))
  }

  const handleSubmit = async (asDraft: boolean) => {
    setSaving(true)
    setError(null)
    try {
      const currentUserId = user?.employee_id || user?.id || 'system'
      const order = await stockInService.create({
        type: stockType,
        warehouse_id: warehouseId,
        source_type: sourceType,
        deal_id: dealId || undefined,
        notes: headerNotes || undefined,
      }, currentUserId)

      // Add details
      for (const item of details) {
        await stockInService.addDetail(order.id, {
          material_id: item.material_id,
          quantity: item.quantity,
          weight: item.weight,
          location_id: item.location_id,
          initial_drc: item.drc_value,
          notes: item.notes,
          // Rubber
          rubber_grade: item.rubber_grade,
          rubber_type: (rubberType as RubberType) || undefined,
          moisture_content: item.qcFormData?.moisture_content,
          supplier_name: supplierName || undefined,
          supplier_region: supplierRegion || undefined,
          supplier_reported_drc: undefined, // stored in batch via addDetail
        })
      }

      // Confirm if not draft
      if (!asDraft) {
        await stockInService.confirmStockIn(order.id, currentUserId)
      }

      setSuccessCode(order.code)
    } catch (err: any) {
      setError(err.message || 'Không thể tạo phiếu')
    } finally {
      setSaving(false)
    }
  }

  // Success screen
  if (successCode) {
    return (
      <div style={{ padding: 24 }}>
        <Result
          status="success"
          title="Tạo phiếu nhập kho thành công!"
          subTitle={<Text style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 18 }}>{successCode}</Text>}
          extra={[
            <Button key="list" onClick={() => navigate('/wms/stock-in')}>Về danh sách</Button>,
            <Button key="new" type="primary" onClick={() => window.location.reload()}
              style={{ background: '#1B4D3E', borderColor: '#1B4D3E' }}>
              Tạo phiếu mới
            </Button>,
          ]}
        />
      </div>
    )
  }

  // Can proceed to next step
  const canStep1 = warehouseId && sourceType
  const canStep2 = details.length > 0
  const canConfirm = canStep1 && canStep2

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: '0 auto' }}>
      {/* Header */}
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/wms/stock-in')}>Quay lại</Button>
      </Space>
      <Title level={4} style={{ color: '#1B4D3E', marginBottom: 24 }}>
        <InboxOutlined style={{ marginRight: 8 }} />
        Tạo phiếu nhập kho
      </Title>

      {/* Steps */}
      <Steps
        current={step}
        style={{ marginBottom: 24 }}
        items={[
          { title: 'Thông tin' },
          { title: 'Chi tiết' },
          { title: 'Xác nhận' },
        ]}
      />

      {/* Error */}
      {error && (
        <Alert type="error" message={error} closable onClose={() => setError(null)} style={{ marginBottom: 16, borderRadius: 8 }} showIcon />
      )}

      {/* === STEP 1: Thông tin === */}
      {step === 0 && (
        <Card style={{ borderRadius: 12 }}>
          {/* Top-level toggle: NVL vs TP */}
          <div style={{ marginBottom: 16, padding: 12, background: '#fafafa', borderRadius: 8 }}>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>Loại phiếu nhập *</Text>
            <Radio.Group
              value={stockType}
              onChange={e => setStockType(e.target.value)}
              buttonStyle="solid"
              size="large"
            >
              <Radio.Button value="raw" style={{ minWidth: 200, textAlign: 'center' }}>
                📦 Nhập Nguyên liệu (NVL)
              </Radio.Button>
              <Radio.Button value="finished" style={{ minWidth: 200, textAlign: 'center' }}>
                🏭 Nhập Thành phẩm (TP)
              </Radio.Button>
            </Radio.Group>
            <div style={{ fontSize: 11, color: '#999', marginTop: 6 }}>
              {stockType === 'raw'
                ? 'Nhập cao su thô từ nông trại / nhà cung cấp vào kho NVL'
                : 'Nhập thành phẩm từ khách trả hàng, đóng gói lại, chuyển kho, hoặc điều chỉnh kiểm kê'}
            </div>
          </div>

          {/* QR Scan Section — chỉ hiện với NVL */}
          {stockType === 'raw' && (
          <Card
            size="small"
            style={{ marginBottom: 16, borderStyle: 'dashed', borderColor: '#2D8B6E', borderRadius: 8, background: '#f6ffed' }}
          >
            <Space direction="vertical" style={{ width: '100%' }}>
              <Text strong style={{ color: '#1B4D3E' }}>
                <ScanOutlined style={{ marginRight: 6 }} />
                Quét QR phiếu cân
              </Text>
              <Input.Search
                value={ticketCode}
                onChange={e => setTicketCode(e.target.value)}
                placeholder="Nhập mã phiếu cân (VD: CX-20260318-001)"
                enterButton="Tìm phiếu cân"
                size="large"
                loading={scanLoading}
                onSearch={handleScanTicket}
              />
              {scannedTicket && (
                <Alert
                  type="success"
                  showIcon
                  message={`Phiếu cân: ${scannedTicket.code}`}
                  description={
                    <Space direction="vertical" size={2}>
                      {scannedTicket.supplier_name && <Text>Đại lý: {scannedTicket.supplier_name}</Text>}
                      {scannedTicket.vehicle_plate && <Text>Biển số xe: {scannedTicket.vehicle_plate}</Text>}
                      {scannedTicket.net_weight && <Text>Khối lượng ròng: {scannedTicket.net_weight.toLocaleString()} kg</Text>}
                      {scannedTicket.rubber_type && <Text>Loại mủ: {RUBBER_TYPE_LABELS[scannedTicket.rubber_type as RubberType] || scannedTicket.rubber_type}</Text>}
                      {scannedTicket.deal && <Text>Deal: {scannedTicket.deal.deal_number}</Text>}
                    </Space>
                  }
                  style={{ borderRadius: 6 }}
                />
              )}
            </Space>
          </Card>
          )}

          <Row gutter={24}>
            <Col span={12}>
              <div style={{ marginBottom: 16 }}>
                <Text strong>Kho nhập *</Text>
                <WarehousePicker
                  value={warehouseId}
                  onChange={setWarehouseId}
                  stockType={stockType}
                  style={{ marginTop: 4 }}
                />
              </div>
            </Col>
            <Col span={12}>
              <div style={{ marginBottom: 16 }}>
                <Text strong>Nguồn nhập *</Text>
                <Select
                  value={sourceType}
                  onChange={v => setSourceType(v as SourceType)}
                  style={{ width: '100%', marginTop: 4 }}
                  size="large"
                  options={stockType === 'raw' ? SOURCE_OPTIONS_RAW : SOURCE_OPTIONS_FINISHED}
                />
              </div>
            </Col>
          </Row>

          {/* Deal selection (purchase only) */}
          {sourceType === 'purchase' && (
            <div style={{ marginBottom: 16 }}>
              <Text strong>Deal B2B</Text>
              <Select
                value={dealId || undefined}
                onChange={setDealId}
                placeholder="Chọn Deal để liên kết"
                style={{ width: '100%', marginTop: 4 }}
                size="large"
                allowClear
                loading={loadingDeals}
                showSearch
                optionFilterProp="label"
                options={activeDeals.map(d => ({
                  value: d.id,
                  label: `${d.deal_number} — ${d.partner_name} — Còn ${(d.remaining_kg / 1000).toFixed(1)} T`,
                }))}
              />
              {selectedDeal && (
                <Card size="small" style={{ marginTop: 8, background: '#f0f5ff', borderRadius: 8 }}>
                  <Row gutter={16}>
                    <Col span={6}><Text type="secondary">Deal</Text><br /><Text strong>{selectedDeal.deal_number}</Text></Col>
                    <Col span={6}><Text type="secondary">Đại lý</Text><br /><Text>{selectedDeal.partner_name}</Text></Col>
                    <Col span={6}><Text type="secondary">SL Deal</Text><br /><Text>{(selectedDeal.quantity_kg / 1000).toFixed(1)} T</Text></Col>
                    <Col span={6}><Text type="secondary">Còn lại</Text><br /><Text strong style={{ color: '#1890ff' }}>{(selectedDeal.remaining_kg / 1000).toFixed(1)} T</Text></Col>
                  </Row>
                </Card>
              )}
            </div>
          )}

          {/* Rubber intake fields — chỉ hiện cho NVL (nguồn từ nông trại) */}
          {stockType === 'raw' && (
            <>
              <Divider style={{ fontSize: 13 }}>Thông tin nguồn gốc (cao su)</Divider>
              <Row gutter={16}>
                <Col span={8}>
                  <div style={{ marginBottom: 16 }}>
                    <Text strong>Đại lý / Nguồn</Text>
                    <Input
                      value={supplierName}
                      onChange={e => setSupplierName(e.target.value)}
                      placeholder="Tên đại lý"
                      style={{ marginTop: 4 }}
                    />
                  </div>
                </Col>
                <Col span={8}>
                  <div style={{ marginBottom: 16 }}>
                    <Text strong>Vùng nguồn gốc</Text>
                    <Input
                      value={supplierRegion}
                      onChange={e => setSupplierRegion(e.target.value)}
                      placeholder="Bình Phước, Tây Ninh..."
                      style={{ marginTop: 4 }}
                    />
                  </div>
                </Col>
                <Col span={8}>
                  <div style={{ marginBottom: 16 }}>
                    <Text strong>Loại mủ</Text>
                    <Select
                      value={rubberType || undefined}
                      onChange={setRubberType}
                      placeholder="Chọn loại"
                      style={{ width: '100%', marginTop: 4 }}
                      allowClear
                      options={RUBBER_TYPE_OPTIONS}
                    />
                  </div>
                </Col>
              </Row>
            </>
          )}

          {/* Notes */}
          <div style={{ marginBottom: 16 }}>
            <Text strong>Ghi chú</Text>
            <Input.TextArea
              value={headerNotes}
              onChange={e => setHeaderNotes(e.target.value)}
              placeholder="Ghi chú phiếu nhập..."
              rows={2}
              style={{ marginTop: 4 }}
            />
          </div>

          <div style={{ textAlign: 'right' }}>
            <Button type="primary" size="large" onClick={() => setStep(1)} disabled={!canStep1}
              icon={<ArrowRightOutlined />} style={{ background: '#1B4D3E', borderColor: '#1B4D3E' }}>
              Tiếp theo
            </Button>
          </div>
        </Card>
      )}

      {/* === STEP 2: Chi tiết === */}
      {step === 1 && (
        <Card style={{ borderRadius: 12 }}>
          <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
            <Col>
              <Text strong style={{ fontSize: 16 }}>Danh sách mặt hàng ({details.length})</Text>
            </Col>
            <Col>
              <Button type="dashed" icon={<PlusOutlined />} onClick={() => setShowAddModal(true)}>
                Thêm sản phẩm
              </Button>
            </Col>
          </Row>

          {details.length === 0 ? (
            <Empty description="Chưa có mặt hàng nào. Bấm 'Thêm sản phẩm' để bắt đầu." style={{ padding: 40 }} />
          ) : (
            <List
              dataSource={details}
              renderItem={(item, index) => (
                <List.Item
                  key={item.tempId}
                  actions={[
                    <Button danger type="text" icon={<DeleteOutlined />} onClick={() => handleRemoveDetail(item.tempId)} />,
                  ]}
                >
                  <List.Item.Meta
                    title={
                      <Space>
                        <Text strong>#{index + 1}</Text>
                        <Text>{item.material?.sku} — {item.material?.name}</Text>
                        {item.rubber_grade && <GradeBadge grade={item.rubber_grade} size="small" />}
                        <QCBadge result={item.qc_result} size="sm" />
                      </Space>
                    }
                    description={
                      <Space size="middle">
                        <Text style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                          SL: {item.quantity} {item.material?.unit || 'kg'}
                        </Text>
                        <Text style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                          KL: {item.weight.toLocaleString()} kg
                        </Text>
                        {item.drc_value && (
                          <Text style={{ fontFamily: "'JetBrains Mono', monospace", color: '#1B4D3E' }}>
                            DRC: {item.drc_value}%
                          </Text>
                        )}
                        {item.dry_weight ? (
                          <Text style={{ fontFamily: "'JetBrains Mono', monospace", color: '#2D8B6E' }}>
                            Dry: {item.dry_weight.toLocaleString()} kg
                          </Text>
                        ) : null}
                        {item.location && (
                          <Tag><EnvironmentOutlined /> {item.location.code}</Tag>
                        )}
                      </Space>
                    }
                  />
                </List.Item>
              )}
            />
          )}

          <Divider />
          <Space>
            <Button size="large" onClick={() => setStep(0)} icon={<ArrowLeftOutlined />}>Quay lại</Button>
            <Button size="large" onClick={() => handleSubmit(true)} loading={saving} icon={<SaveOutlined />}>
              Lưu nháp
            </Button>
            <Button type="primary" size="large" onClick={() => setStep(2)} disabled={!canStep2}
              icon={<ArrowRightOutlined />} style={{ background: '#1B4D3E', borderColor: '#1B4D3E' }}>
              Tiếp theo
            </Button>
          </Space>

          <AddDetailModal
            open={showAddModal}
            warehouseId={warehouseId}
            onSubmit={handleAddDetail}
            onCancel={() => setShowAddModal(false)}
          />
        </Card>
      )}

      {/* === STEP 3: Xác nhận === */}
      {step === 2 && (
        <Card style={{ borderRadius: 12 }}>
          <Title level={5}>Tóm tắt phiếu nhập kho</Title>

          {/* Info summary */}
          <Card size="small" style={{ marginBottom: 16, background: '#fafafa', borderRadius: 8 }}>
            <Row gutter={16}>
              <Col span={8}><Text type="secondary">Kho</Text><br /><Text strong>{selectedWarehouse?.name}</Text></Col>
              <Col span={8}><Text type="secondary">Nguồn</Text><br /><Tag>{(stockType === 'raw' ? SOURCE_OPTIONS_RAW : SOURCE_OPTIONS_FINISHED).find(s => s.value === sourceType)?.label || sourceType}</Tag></Col>
              {selectedDeal && <Col span={8}><Text type="secondary">Deal</Text><br /><Text strong>{selectedDeal.deal_number}</Text></Col>}
            </Row>
            {(supplierName || supplierRegion || rubberType) && (
              <Row gutter={16} style={{ marginTop: 8 }}>
                {supplierName && <Col span={8}><Text type="secondary">Đại lý</Text><br /><Text>{supplierName}</Text></Col>}
                {supplierRegion && <Col span={8}><Text type="secondary">Vùng</Text><br /><Text>{supplierRegion}</Text></Col>}
                {rubberType && <Col span={8}><Text type="secondary">Loại mủ</Text><br /><Text>{RUBBER_TYPE_LABELS[rubberType as RubberType] || rubberType}</Text></Col>}
              </Row>
            )}
          </Card>

          {/* Summary stats */}
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={6}>
              <Card bodyStyle={{ padding: 12 }}>
                <Statistic title="Số mặt hàng" value={details.length} valueStyle={{ fontSize: 20, fontFamily: "'JetBrains Mono'" }} />
              </Card>
            </Col>
            <Col span={6}>
              <Card bodyStyle={{ padding: 12 }}>
                <Statistic
                  title="Số đơn vị"
                  value={totalQty}
                  suffix={(() => {
                    const units = new Set(details.map(d => d.material?.unit || 'đv'))
                    return units.size === 1 ? Array.from(units)[0] : 'đv'
                  })()}
                  valueStyle={{ fontSize: 20, fontFamily: "'JetBrains Mono'" }}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card bodyStyle={{ padding: 12 }}>
                <Statistic title="Trọng lượng" value={(totalWeight / 1000).toFixed(3)} suffix="T" valueStyle={{ fontSize: 20, fontFamily: "'JetBrains Mono'" }} />
              </Card>
            </Col>
            <Col span={6}>
              <Card bodyStyle={{ padding: 12 }}>
                <Statistic title="TL khô (dry)" value={(totalDryWeight / 1000).toFixed(3)} suffix="T" valueStyle={{ fontSize: 20, color: '#2D8B6E', fontFamily: "'JetBrains Mono'" }} />
              </Card>
            </Col>
          </Row>

          {/* QC warning */}
          {hasQCFailed && (
            <Alert
              type="error"
              message="Có mặt hàng KHÔNG ĐẠT QC. Phiếu vẫn có thể tạo nhưng lô sẽ ở trạng thái quarantine."
              showIcon
              style={{ marginBottom: 16, borderRadius: 8 }}
            />
          )}

          {/* Detail list */}
          <Card title={`Chi tiết (${details.length})`} size="small" style={{ marginBottom: 16 }}>
            {details.map((item, i) => (
              <div key={item.tempId} style={{ padding: '8px 0', borderBottom: i < details.length - 1 ? '1px solid #f0f0f0' : undefined }}>
                <Space>
                  <Text strong>#{i + 1}</Text>
                  <Text>{item.material?.name}</Text>
                  {item.rubber_grade && <GradeBadge grade={item.rubber_grade} size="small" />}
                  <QCBadge result={item.qc_result} size="sm" />
                </Space>
                <div style={{ marginLeft: 24 }}>
                  <Text type="secondary" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>
                    {item.quantity} {item.material?.unit} · {item.weight.toLocaleString()} kg
                    {item.drc_value ? ` · DRC ${item.drc_value}%` : ''}
                    {item.dry_weight ? ` · Dry ${item.dry_weight.toLocaleString()} kg` : ''}
                    {item.location ? ` · ${item.location.code}` : ''}
                  </Text>
                </div>
              </div>
            ))}
          </Card>

          <Space>
            <Button size="large" onClick={() => setStep(1)} icon={<ArrowLeftOutlined />}>Quay lại</Button>
            <Button size="large" onClick={() => handleSubmit(true)} loading={saving} icon={<SaveOutlined />}>
              Lưu nháp
            </Button>
            <Button type="primary" size="large" onClick={() => handleSubmit(false)} loading={saving}
              disabled={!canConfirm}
              icon={<CheckCircleOutlined />}
              style={{ background: '#1B4D3E', borderColor: '#1B4D3E' }}>
              Xác nhận nhập kho
            </Button>
          </Space>
        </Card>
      )}
    </div>
  )
}

export default StockInCreatePage
