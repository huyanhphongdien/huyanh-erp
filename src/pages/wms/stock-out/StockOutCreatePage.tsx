// ============================================================================
// STOCK OUT CREATE PAGE — Ant Design (3-step wizard)
// File: src/pages/wms/stock-out/StockOutCreatePage.tsx
// Rewrite: Tailwind -> Ant Design v6, add rubber fields
// ============================================================================
// LUONG:
//   Step 1: Chọn kho + Ly do xuat + Khach hang
//   Step 2: Xem hang ton trong kho -> chon lo, vị trí, số lượng
//   Step 3: Xem lai tong hop -> Lưu nháp / Xác nhận xuat
// ============================================================================

import React, { useState, useMemo, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Card,
  Button,
  Space,
  Typography,
  Spin,
  Steps,
  Form,
  Select,
  Input,
  InputNumber,
  Modal,
  Table,
  Tag,
  Alert,
  Descriptions,
  Row,
  Col,
  Statistic,
  Empty,
  Result,
  Badge,
  Divider,
  List,
  Radio,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  PlusOutlined,
  DeleteOutlined,
  SaveOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  WarningOutlined,
  SearchOutlined,
  FilterOutlined,
  LoadingOutlined,
  FileTextOutlined,
  ShoppingCartOutlined,
  SwapOutlined,
  ExperimentOutlined,
  ControlOutlined,
  RollbackOutlined,
  InboxOutlined,
} from '@ant-design/icons'
import { supabase } from '../../../lib/supabase'
import GradeBadge from '../../../components/wms/GradeBadge'
import type { RubberGrade } from '../../../services/wms/wms.types'
import { RUBBER_GRADE_LABELS } from '../../../services/wms/wms.types'

const { Title, Text } = Typography
const { TextArea } = Input

// ============================================================================
// TYPES
// ============================================================================

interface WarehouseOption {
  id: string
  code: string
  name: string
  type: string
}

interface BatchStock {
  id: string
  batch_no: string
  material_id: string
  material_sku: string
  material_name: string
  material_unit: string
  weight_per_unit: number | null
  warehouse_id: string
  location_id: string | null
  location_code: string | null
  location_shelf: string | null
  location_row: string | null
  location_col: string | null
  quantity_remaining: number
  initial_drc: number | null
  latest_drc: number | null
  qc_status: string
  received_date: string
  status: string
  rubber_grade: RubberGrade | null
  dry_weight: number | null
}

interface OutItem {
  tempId: string
  batch_id: string
  batch_no: string
  material_id: string
  material_name: string
  material_sku: string
  material_unit: string
  weight_per_unit: number | null
  location_id: string | null
  location_code: string | null
  quantity: number
  max_quantity: number
  weight: number
  latest_drc: number | null
  qc_status: string
  rubber_grade: RubberGrade | null
}

type StockType = 'raw' | 'finished'
type StockOutReason = 'sale' | 'production' | 'transfer' | 'blend' | 'adjust' | 'return'

interface FormHeader {
  warehouse_id: string
  reason: StockOutReason
  customer_name: string
  customer_order_ref: string
  notes: string
  svr_grade: RubberGrade | ''
  required_drc_min: number | null
  required_drc_max: number | null
  container_type: string
  bale_count: number | null
}

// ============================================================================
// CONSTANTS
// ============================================================================

const REASONS: { value: StockOutReason; label: string; icon: React.ReactNode; desc: string }[] = [
  { value: 'sale', label: 'Bán hàng', icon: <ShoppingCartOutlined />, desc: 'Xuất bán cho khách' },
  { value: 'transfer', label: 'Chuyển kho', icon: <SwapOutlined />, desc: 'Chuyển sang kho khác' },
  { value: 'blend', label: 'Phối trộn', icon: <ExperimentOutlined />, desc: 'Đưa đi phối trộn DRC' },
  { value: 'adjust', label: 'Điều chỉnh', icon: <ControlOutlined />, desc: 'Điều chỉnh tồn kho' },
  { value: 'return', label: 'Trả hàng', icon: <RollbackOutlined />, desc: 'Trả lại NCC/SX' },
]

const QC_TAG: Record<string, { color: string; label: string }> = {
  passed: { color: 'success', label: 'Đạt' },
  warning: { color: 'warning', label: 'Cảnh báo' },
  failed: { color: 'error', label: 'Không đạt' },
  needs_blend: { color: 'purple', label: 'Cần phối trộn' },
  pending: { color: 'default', label: 'Chờ QC' },
}

const monoStyle: React.CSSProperties = { fontFamily: "'JetBrains Mono', monospace" }

const GRADE_OPTIONS = Object.entries(RUBBER_GRADE_LABELS).map(([value, label]) => ({
  value,
  label,
}))

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const StockOutCreatePage: React.FC = () => {
  const navigate = useNavigate()

  // Step wizard
  const [step, setStep] = useState(0) // 0-indexed for Ant Steps

  // Top-level mode: NVL vs TP (quyết định loại kho xuất + reason mặc định)
  const [stockType, setStockType] = useState<StockType>('finished')

  // Step 1: Header
  const [header, setHeader] = useState<FormHeader>({
    warehouse_id: '',
    reason: 'sale',
    customer_name: '',
    customer_order_ref: '',
    notes: '',
    svr_grade: '',
    required_drc_min: null,
    required_drc_max: null,
    container_type: '',
    bale_count: null,
  })

  // Step 2: Stock in warehouse + selected items
  const [batchStocks, setBatchStocks] = useState<BatchStock[]>([])
  const [loadingBatches, setLoadingBatches] = useState(false)
  const [outItems, setOutItems] = useState<OutItem[]>([])
  const [addModalOpen, setAddModalOpen] = useState(false)

  // Filters for batch selection modal
  const [searchText, setSearchText] = useState('')
  const [filterQC, setFilterQC] = useState<string>('all')
  const [filterMaterial, setFilterMaterial] = useState<string>('all')

  // Data loading
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([])
  const [loadingWarehouses, setLoadingWarehouses] = useState(true)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  // Submission
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successCode, setSuccessCode] = useState<string | null>(null)

  // ========================================================================
  // LOAD DATA
  // ========================================================================

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: emp, error: empErr } = await supabase
        .from('employees')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle()

      if (!empErr && emp) {
        setCurrentUserId(emp.id)
        console.log('[StockOut] Employee ID:', emp.id, '(from auth:', user.id, ')')
      } else {
        console.warn('[StockOut] Employee not found for auth user:', user.id, empErr)
        setCurrentUserId(user.id)
      }
    }
    getUser()
  }, [])

  useEffect(() => {
    const load = async () => {
      setLoadingWarehouses(true)
      const { data, error } = await supabase
        .from('warehouses')
        .select('id, code, name, type')
        .eq('is_active', true)
        .order('code')

      if (!error && data) setWarehouses(data)
      setLoadingWarehouses(false)
    }
    load()
  }, [])

  const loadBatchStocks = useCallback(async (warehouseId: string) => {
    if (!warehouseId) return
    setLoadingBatches(true)
    try {
      const { data: allBatches, error: debugErr } = await supabase
        .from('stock_batches')
        .select('id, batch_no, warehouse_id, status, qc_status, quantity_remaining, location_id')
        .eq('warehouse_id', warehouseId)

      console.log('[StockOut] DEBUG all batches in warehouse:', warehouseId, allBatches)

      const { data, error: err } = await supabase
        .from('stock_batches')
        .select(`
          id, batch_no, material_id, warehouse_id, location_id,
          quantity_remaining, initial_drc, latest_drc, qc_status,
          received_date, status, rubber_grade, dry_weight,
          material:materials(id, sku, name, unit, weight_per_unit),
          location:warehouse_locations(id, code, shelf, row_name, column_name)
        `)
        .eq('warehouse_id', warehouseId)
        .eq('status', 'active')
        .gt('quantity_remaining', 0)
        .order('received_date', { ascending: true })  // FIFO

      if (err) throw err

      console.log('[StockOut] Filtered batches (active, qty>0):', data?.length, data)

      const mapped: BatchStock[] = (data || []).map((row: any) => ({
        id: row.id,
        batch_no: row.batch_no,
        material_id: row.material_id,
        material_sku: row.material?.sku || '',
        material_name: row.material?.name || '',
        material_unit: row.material?.unit || 'banh',
        weight_per_unit: row.material?.weight_per_unit || null,
        warehouse_id: row.warehouse_id,
        location_id: row.location?.id || null,
        location_code: row.location?.code || null,
        location_shelf: row.location?.shelf || null,
        location_row: row.location?.row_name || null,
        location_col: row.location?.column_name || null,
        quantity_remaining: row.quantity_remaining,
        initial_drc: row.initial_drc,
        latest_drc: row.latest_drc,
        qc_status: row.qc_status,
        received_date: row.received_date,
        status: row.status,
        rubber_grade: row.rubber_grade || null,
        dry_weight: row.dry_weight || null,
      }))

      setBatchStocks(mapped)

      if (mapped.length === 0 && allBatches && allBatches.length > 0) {
        console.warn('[StockOut] Batches exist but none matched filters!', {
          allBatchStatuses: allBatches.map(b => ({ id: b.id, status: b.status, qc: b.qc_status, qty: b.quantity_remaining })),
          query: 'status=active AND quantity_remaining > 0',
        })
      }
    } catch (e) {
      console.error('Loi load tồn kho:', e)
      setBatchStocks([])
    } finally {
      setLoadingBatches(false)
    }
  }, [])

  useEffect(() => {
    if (header.warehouse_id) {
      loadBatchStocks(header.warehouse_id)
    } else {
      setBatchStocks([])
    }
  }, [header.warehouse_id, loadBatchStocks])

  // ========================================================================
  // DERIVED
  // ========================================================================

  // Filter kho theo stockType: raw → chỉ kho NVL + mixed; finished → chỉ kho TP + mixed
  const filteredWarehouses = useMemo(() => {
    return warehouses.filter(w => w.type === 'mixed' || w.type === stockType)
  }, [warehouses, stockType])

  // Khi đổi NVL ↔ TP: reset kho + reason về default hợp lệ
  useEffect(() => {
    setHeader(h => ({
      ...h,
      warehouse_id: '',
      reason: stockType === 'raw' ? 'transfer' : 'sale',
    }))
    setOutItems([])
  }, [stockType])

  const selectedWarehouse = warehouses.find(w => w.id === header.warehouse_id)

  const materialOptions = useMemo(() => {
    const map = new Map<string, { id: string; label: string }>()
    batchStocks.forEach(b => {
      if (!map.has(b.material_id)) {
        map.set(b.material_id, { id: b.material_id, label: `${b.material_sku} — ${b.material_name}` })
      }
    })
    return Array.from(map.values())
  }, [batchStocks])

  const filteredBatches = useMemo(() => {
    let list = batchStocks

    const addedBatchIds = new Set(outItems.map(i => i.batch_id))
    list = list.filter(b => !addedBatchIds.has(b.id))

    if (filterQC !== 'all') {
      list = list.filter(b => b.qc_status === filterQC)
    }

    if (filterMaterial !== 'all') {
      list = list.filter(b => b.material_id === filterMaterial)
    }

    if (searchText.trim()) {
      const term = searchText.toLowerCase().trim()
      list = list.filter(b =>
        b.batch_no.toLowerCase().includes(term) ||
        b.material_name.toLowerCase().includes(term) ||
        b.material_sku.toLowerCase().includes(term) ||
        (b.location_code || '').toLowerCase().includes(term)
      )
    }

    return list
  }, [batchStocks, outItems, filterQC, filterMaterial, searchText])

  const totalQty = useMemo(() => outItems.reduce((s, i) => s + i.quantity, 0), [outItems])
  const totalWeight = useMemo(() => outItems.reduce((s, i) => s + i.weight, 0), [outItems])
  const hasNonPassedItems = outItems.some(i => i.qc_status !== 'passed')
  const hasPendingItems = outItems.some(i => i.qc_status === 'pending')

  // ========================================================================
  // HANDLERS
  // ========================================================================

  const validateStep1 = (): boolean => !!header.warehouse_id
  const validateStep2 = (): boolean => outItems.length > 0 && outItems.every(i => i.quantity > 0)

  const handleNext = () => {
    setError(null)
    if (step === 0 && validateStep1()) setStep(1)
    else if (step === 1 && validateStep2()) setStep(2)
  }

  const handleBack = () => {
    setError(null)
    if (step > 0) setStep(step - 1)
    else navigate('/wms/stock-out')
  }

  const handleAddBatch = (batch: BatchStock) => {
    if (outItems.some(i => i.batch_id === batch.id)) return

    const defaultQty = batch.quantity_remaining
    const weight = batch.weight_per_unit
      ? defaultQty * batch.weight_per_unit
      : 0

    const newItem: OutItem = {
      tempId: `out-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      batch_id: batch.id,
      batch_no: batch.batch_no,
      material_id: batch.material_id,
      material_name: batch.material_name,
      material_sku: batch.material_sku,
      material_unit: batch.material_unit,
      weight_per_unit: batch.weight_per_unit,
      location_id: batch.location_id,
      location_code: batch.location_code,
      quantity: defaultQty,
      max_quantity: batch.quantity_remaining,
      weight,
      latest_drc: batch.latest_drc,
      qc_status: batch.qc_status,
      rubber_grade: batch.rubber_grade,
    }

    setOutItems(prev => [...prev, newItem])
    setAddModalOpen(false)
  }

  const handleChangeQty = (tempId: string, qty: number) => {
    setOutItems(prev => prev.map(i => {
      if (i.tempId !== tempId) return i
      const weight = i.weight_per_unit ? qty * i.weight_per_unit : 0
      return { ...i, quantity: qty, weight }
    }))
  }

  const handleRemoveItem = (tempId: string) => {
    setOutItems(prev => prev.filter(i => i.tempId !== tempId))
  }

  // ========================================================================
  // SAVE / CONFIRM
  // ========================================================================

  const generateCode = async (): Promise<string> => {
    const now = new Date()
    const yyyy = String(now.getFullYear())
    const mm = String(now.getMonth() + 1).padStart(2, '0')
    const dd = String(now.getDate()).padStart(2, '0')
    const typeSegment = stockType === 'raw' ? 'NVL' : 'TP'
    const prefix = `XK-${typeSegment}-${yyyy}${mm}${dd}`

    const { data, error: err } = await supabase
      .from('stock_out_orders')
      .select('code')
      .like('code', `${prefix}-%`)
      .order('code', { ascending: false })
      .limit(1)

    if (err) throw err

    let seq = 1
    if (data && data.length > 0) {
      const lastSeq = parseInt(data[0].code.split('-').pop() || '0', 10)
      seq = lastSeq + 1
    }

    return `${prefix}-${String(seq).padStart(3, '0')}`
  }

  const handleSaveDraft = async () => {
    if (!currentUserId) {
      setError('Chưa xác định được người dùng đang đăng nhập')
      return
    }
    setSaving(true)
    setError(null)

    try {
      const code = await generateCode()

      const { data: order, error: hErr } = await supabase
        .from('stock_out_orders')
        .insert({
          code,
          type: stockType,
          warehouse_id: header.warehouse_id,
          reason: header.reason,
          customer_name: header.customer_name || null,
          customer_order_ref: header.customer_order_ref || null,
          total_quantity: totalQty,
          total_weight: totalWeight > 0 ? totalWeight : null,
          status: 'draft',
          notes: header.notes || null,
          created_by: currentUserId,
          svr_grade: header.svr_grade || null,
          required_drc_min: header.required_drc_min,
          required_drc_max: header.required_drc_max,
          container_type: header.container_type || null,
          bale_count: header.bale_count,
        })
        .select('id, code')
        .single()

      if (hErr) throw hErr

      const details = outItems.map(item => ({
        stock_out_id: order.id,
        material_id: item.material_id,
        batch_id: item.batch_id,
        location_id: item.location_id || null,
        quantity: item.quantity,
        weight: item.weight > 0 ? item.weight : null,
        picking_status: 'pending',
      }))

      const { error: dErr } = await supabase
        .from('stock_out_details')
        .insert(details)

      if (dErr) throw dErr

      setSuccessCode(order.code)
      setTimeout(() => navigate('/wms/stock-out'), 1500)
    } catch (err: any) {
      console.error('Loi luu nhap:', err)
      setError(err.message || 'Có lỗi xảy ra khi lưu phiếu')
    } finally {
      setSaving(false)
    }
  }

  const handleConfirm = async () => {
    if (!currentUserId) {
      setError('Chưa xác định được người dùng đang đăng nhập')
      return
    }
    setSaving(true)
    setError(null)

    try {
      const code = await generateCode()

      const { data: order, error: hErr } = await supabase
        .from('stock_out_orders')
        .insert({
          code,
          type: stockType,
          warehouse_id: header.warehouse_id,
          reason: header.reason,
          customer_name: header.customer_name || null,
          customer_order_ref: header.customer_order_ref || null,
          total_quantity: totalQty,
          total_weight: totalWeight > 0 ? totalWeight : null,
          status: 'confirmed',
          notes: header.notes || null,
          created_by: currentUserId,
          confirmed_by: currentUserId,
          confirmed_at: new Date().toISOString(),
          svr_grade: header.svr_grade || null,
          required_drc_min: header.required_drc_min,
          required_drc_max: header.required_drc_max,
          container_type: header.container_type || null,
          bale_count: header.bale_count,
        })
        .select('id, code')
        .single()

      if (hErr) throw hErr

      const details = outItems.map(item => ({
        stock_out_id: order.id,
        material_id: item.material_id,
        batch_id: item.batch_id,
        location_id: item.location_id || null,
        quantity: item.quantity,
        weight: item.weight > 0 ? item.weight : null,
        picking_status: 'picked',
        picked_at: new Date().toISOString(),
        picked_by: currentUserId,
      }))

      const { error: dErr } = await supabase
        .from('stock_out_details')
        .insert(details)

      if (dErr) throw dErr

      // Update stock_batches, stock_levels, inventory_transactions
      for (const item of outItems) {
        const { data: batch, error: bErr } = await supabase
          .from('stock_batches')
          .select('quantity_remaining')
          .eq('id', item.batch_id)
          .single()

        if (bErr) throw bErr

        const newQty = batch.quantity_remaining - item.quantity
        const updateData: Record<string, any> = {
          quantity_remaining: newQty,
          updated_at: new Date().toISOString(),
        }
        if (newQty <= 0) updateData.status = 'depleted'

        const { error: uErr } = await supabase
          .from('stock_batches')
          .update(updateData)
          .eq('id', item.batch_id)

        if (uErr) throw uErr

        const { data: sl, error: slErr } = await supabase
          .from('stock_levels')
          .select('id, quantity')
          .eq('material_id', item.material_id)
          .eq('warehouse_id', header.warehouse_id)
          .maybeSingle()

        if (slErr) throw slErr

        if (sl) {
          const { error: slUpErr } = await supabase
            .from('stock_levels')
            .update({
              quantity: sl.quantity - item.quantity,
              updated_at: new Date().toISOString(),
            })
            .eq('id', sl.id)

          if (slUpErr) throw slUpErr
        }

        if (item.location_id) {
          const { data: loc, error: locErr } = await supabase
            .from('warehouse_locations')
            .select('id, current_quantity')
            .eq('id', item.location_id)
            .maybeSingle()

          if (!locErr && loc) {
            await supabase
              .from('warehouse_locations')
              .update({
                current_quantity: Math.max(0, loc.current_quantity - item.quantity),
              })
              .eq('id', loc.id)
          }
        }

        const { error: txErr } = await supabase
          .from('inventory_transactions')
          .insert({
            material_id: item.material_id,
            warehouse_id: header.warehouse_id,
            batch_id: item.batch_id,
            type: 'out',
            quantity: -item.quantity,
            reference_type: 'stock_out',
            reference_id: order.id,
            notes: `Xuất kho: ${code}`,
            created_by: currentUserId,
          })

        if (txErr) throw txErr
      }

      setSuccessCode(order.code)
      setTimeout(() => navigate('/wms/stock-out'), 1500)
    } catch (err: any) {
      console.error('Loi xac nhan xuất kho:', err)
      setError(err.message || 'Có lỗi xảy ra khi xác nhận xuất kho')
    } finally {
      setSaving(false)
    }
  }

  // ========================================================================
  // SUCCESS OVERLAY
  // ========================================================================

  if (successCode) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '80vh' }}>
        <Result
          status="success"
          title="Thành công!"
          subTitle={
            <div>
              <Text>Phiếu xuất kho đã được tạo</Text>
              <div>
                <Text strong style={{ ...monoStyle, color: '#1B4D3E', fontSize: 20 }}>
                  {successCode}
                </Text>
              </div>
            </div>
          }
          extra={
            <Button
              type="primary"
              onClick={() => navigate('/wms/stock-out')}
              style={{ backgroundColor: '#2D8B6E', borderColor: '#2D8B6E' }}
            >
              Về danh sách
            </Button>
          }
        />
      </div>
    )
  }

  // ========================================================================
  // BATCH SELECTION MODAL — columns
  // ========================================================================

  const batchModalColumns: ColumnsType<BatchStock> = [
    {
      title: 'Mã lô',
      dataIndex: 'batch_no',
      key: 'batch_no',
      width: 130,
      render: (val: string) => <Text strong style={monoStyle}>{val}</Text>,
    },
    {
      title: 'Grade',
      dataIndex: 'rubber_grade',
      key: 'rubber_grade',
      width: 90,
      render: (grade: RubberGrade | null) => <GradeBadge grade={grade} size="small" />,
    },
    {
      title: 'Sản phẩm',
      key: 'material',
      width: 180,
      render: (_: any, r: BatchStock) => (
        <div>
          <Text style={{ fontSize: 12, ...monoStyle }}>{r.material_sku}</Text>
          <div><Text type="secondary" style={{ fontSize: 12 }}>{r.material_name}</Text></div>
        </div>
      ),
    },
    {
      title: 'Vị trí',
      key: 'location',
      width: 120,
      render: (_: any, r: BatchStock) => {
        const loc = r.location_code
          ? `${r.location_code}${r.location_shelf ? ` · Ke ${r.location_shelf}` : ''}`
          : 'Chưa gán'
        return <Text type="secondary" style={{ fontSize: 12 }}>{loc}</Text>
      },
    },
    {
      title: 'QC',
      dataIndex: 'qc_status',
      key: 'qc_status',
      width: 100,
      render: (status: string) => {
        const cfg = QC_TAG[status] || QC_TAG.pending
        return <Tag color={cfg.color}>{cfg.label}</Tag>
      },
    },
    {
      title: 'DRC',
      dataIndex: 'latest_drc',
      key: 'latest_drc',
      width: 80,
      render: (drc: number | null) =>
        drc != null ? <Text style={monoStyle}>{drc.toFixed(1)}%</Text> : '—',
    },
    {
      title: 'Tồn',
      dataIndex: 'quantity_remaining',
      key: 'quantity_remaining',
      width: 80,
      align: 'right',
      render: (qty: number) => <Text strong style={{ ...monoStyle, color: '#1B4D3E' }}>{qty.toLocaleString('vi-VN')}</Text>,
    },
    {
      title: '',
      key: 'action',
      width: 70,
      render: (_: any, record: BatchStock) => (
        <Button
          type="primary"
          size="small"
          icon={<PlusOutlined />}
          onClick={() => handleAddBatch(record)}
          style={{ backgroundColor: '#2D8B6E', borderColor: '#2D8B6E' }}
        >
          Thêm
        </Button>
      ),
    },
  ]

  // ========================================================================
  // OUT ITEMS TABLE — columns for Step 2 & 3
  // ========================================================================

  const outItemColumns: ColumnsType<OutItem> = [
    {
      title: 'Mã lô',
      dataIndex: 'batch_no',
      key: 'batch_no',
      width: 130,
      render: (val: string) => <Text strong style={monoStyle}>{val}</Text>,
    },
    {
      title: 'Grade',
      dataIndex: 'rubber_grade',
      key: 'rubber_grade',
      width: 90,
      render: (grade: RubberGrade | null) => <GradeBadge grade={grade} size="small" />,
    },
    {
      title: 'Sản phẩm',
      key: 'material',
      width: 160,
      render: (_: any, r: OutItem) => (
        <div>
          <Text style={{ fontSize: 12, ...monoStyle }}>{r.material_sku}</Text>
          <div><Text type="secondary" style={{ fontSize: 12 }}>{r.material_name}</Text></div>
        </div>
      ),
    },
    {
      title: 'Vị trí',
      dataIndex: 'location_code',
      key: 'location_code',
      width: 100,
      render: (loc: string | null) => loc || '—',
    },
    {
      title: 'QC',
      dataIndex: 'qc_status',
      key: 'qc_status',
      width: 100,
      render: (status: string) => {
        const cfg = QC_TAG[status] || QC_TAG.pending
        return <Tag color={cfg.color}>{cfg.label}</Tag>
      },
    },
    {
      title: 'DRC',
      dataIndex: 'latest_drc',
      key: 'latest_drc',
      width: 80,
      render: (drc: number | null) =>
        drc != null ? <Text style={monoStyle}>{drc.toFixed(1)}%</Text> : '—',
    },
    {
      title: 'SL xuất',
      key: 'quantity',
      width: 140,
      render: (_: any, record: OutItem) => (
        <Space>
          <InputNumber
            min={1}
            max={record.max_quantity}
            value={record.quantity}
            onChange={(val) => handleChangeQty(record.tempId, val || 0)}
            size="small"
            style={{ width: 80, ...monoStyle }}
          />
          <Text type="secondary" style={{ fontSize: 11 }}>/ {record.max_quantity.toLocaleString('vi-VN')}</Text>
        </Space>
      ),
    },
    {
      title: 'KL (kg)',
      dataIndex: 'weight',
      key: 'weight',
      width: 90,
      align: 'right',
      render: (w: number) => w > 0
        ? <Text style={monoStyle}>{w.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}</Text>
        : '—',
    },
    {
      title: '',
      key: 'action',
      width: 60,
      render: (_: any, record: OutItem) => (
        <Button
          danger
          type="text"
          size="small"
          icon={<DeleteOutlined />}
          onClick={() => handleRemoveItem(record.tempId)}
        />
      ),
    },
  ]

  // For Step 3 review — read-only columns
  const reviewColumns: ColumnsType<OutItem> = [
    {
      title: '#',
      key: 'index',
      width: 40,
      render: (_: any, __: any, idx: number) => idx + 1,
    },
    {
      title: 'Mã lô',
      dataIndex: 'batch_no',
      key: 'batch_no',
      width: 130,
      render: (val: string) => <Text strong style={monoStyle}>{val}</Text>,
    },
    {
      title: 'Grade',
      dataIndex: 'rubber_grade',
      key: 'rubber_grade',
      width: 90,
      render: (grade: RubberGrade | null) => <GradeBadge grade={grade} size="small" />,
    },
    {
      title: 'Sản phẩm',
      key: 'material',
      render: (_: any, r: OutItem) => `${r.material_sku} — ${r.material_name}`,
    },
    {
      title: 'Vị trí',
      dataIndex: 'location_code',
      key: 'location_code',
      width: 100,
      render: (loc: string | null) => loc || '—',
    },
    {
      title: 'QC',
      dataIndex: 'qc_status',
      key: 'qc_status',
      width: 100,
      render: (status: string) => {
        const cfg = QC_TAG[status] || QC_TAG.pending
        return <Tag color={cfg.color}>{cfg.label}</Tag>
      },
    },
    {
      title: 'DRC',
      dataIndex: 'latest_drc',
      key: 'latest_drc',
      width: 80,
      render: (drc: number | null) =>
        drc != null ? <Text style={monoStyle}>{drc.toFixed(1)}%</Text> : '—',
    },
    {
      title: 'Số lượng',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 100,
      align: 'right',
      render: (qty: number, r: OutItem) => (
        <div>
          <Text strong style={{ ...monoStyle, color: '#1B4D3E' }}>{qty.toLocaleString('vi-VN')}</Text>
          <div><Text type="secondary" style={{ fontSize: 11 }}>{r.material_unit}</Text></div>
        </div>
      ),
    },
    {
      title: 'KL (kg)',
      dataIndex: 'weight',
      key: 'weight',
      width: 90,
      align: 'right',
      render: (w: number) => w > 0
        ? <Text style={monoStyle}>{w.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}</Text>
        : '—',
    },
  ]

  // ========================================================================
  // RENDER
  // ========================================================================

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={handleBack} />
          <div>
            <Title level={4} style={{ margin: 0, color: '#1B4D3E' }}>Tạo phiếu xuất kho</Title>
            {selectedWarehouse && (
              <Text type="secondary">Kho: {selectedWarehouse.code} — {selectedWarehouse.name}</Text>
            )}
          </div>
        </Space>
        {outItems.length > 0 && (
          <Badge count={outItems.length} style={{ backgroundColor: '#1B4D3E' }}>
            <Tag style={{ ...monoStyle, fontSize: 14 }}>
              {totalQty.toLocaleString('vi-VN')} {outItems[0]?.material_unit || 'banh'}
            </Tag>
          </Badge>
        )}
      </div>

      {/* Steps */}
      <Steps
        current={step}
        items={[
          { title: 'Chọn kho' },
          { title: 'Chọn hàng' },
          { title: 'Xác nhận' },
        ]}
        style={{ marginBottom: 32 }}
      />

      {/* Error */}
      {error && (
        <Alert
          message={error}
          type="error"
          closable
          onClose={() => setError(null)}
          style={{ marginBottom: 16 }}
        />
      )}

      {/* ================================================================ */}
      {/* STEP 1: CHON KHO + LY DO */}
      {/* ================================================================ */}
      {step === 0 && (
        <Row gutter={24}>
          <Col xs={24} lg={14}>
            {/* Top-level toggle: NVL vs TP (mirror stock-in) */}
            <Card style={{ marginBottom: 16 }}>
              <Text strong style={{ display: 'block', marginBottom: 8 }}>Loại phiếu xuất *</Text>
              <Radio.Group
                value={stockType}
                onChange={e => setStockType(e.target.value)}
                buttonStyle="solid"
                size="large"
              >
                <Radio.Button value="raw" style={{ minWidth: 200, textAlign: 'center' }}>
                  📦 Xuất Nguyên liệu (NVL)
                </Radio.Button>
                <Radio.Button value="finished" style={{ minWidth: 200, textAlign: 'center' }}>
                  🏭 Xuất Thành phẩm (TP)
                </Radio.Button>
              </Radio.Group>
              <div style={{ fontSize: 11, color: '#999', marginTop: 6 }}>
                {stockType === 'raw'
                  ? 'Xuất cao su thô từ kho NVL (chuyển kho, phối trộn, điều chỉnh…)'
                  : 'Xuất thành phẩm từ kho TP (bán hàng, chuyển kho, trả hàng…)'}
              </div>
            </Card>

            <Card title="Kho xuất" style={{ marginBottom: 24 }}>
              {loadingWarehouses ? (
                <div style={{ textAlign: 'center', padding: 40 }}>
                  <Spin tip="Đang tải danh sách kho..." />
                </div>
              ) : (
                <Select
                  placeholder={stockType === 'raw' ? 'Chọn kho NVL' : 'Chọn kho TP'}
                  value={header.warehouse_id || undefined}
                  onChange={val => setHeader(h => ({ ...h, warehouse_id: val }))}
                  style={{ width: '100%' }}
                  size="large"
                  notFoundContent={filteredWarehouses.length === 0 ? `Không có kho ${stockType === 'raw' ? 'NVL' : 'TP'} nào` : undefined}
                  options={filteredWarehouses.map(w => ({
                    value: w.id,
                    label: `${w.code} — ${w.name}`,
                  }))}
                />
              )}
              {header.warehouse_id && batchStocks.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <Text type="secondary" style={monoStyle}>{batchStocks.length} lô tồn kho</Text>
                </div>
              )}
            </Card>

            <Card title="Lý do xuất" style={{ marginBottom: 24 }}>
              <Select
                value={header.reason}
                onChange={val => setHeader(h => ({ ...h, reason: val }))}
                style={{ width: '100%' }}
                size="large"
                options={REASONS.map(r => ({
                  value: r.value,
                  label: (
                    <Space>
                      {r.icon}
                      <span>{r.label}</span>
                      <Text type="secondary" style={{ fontSize: 12 }}>— {r.desc}</Text>
                    </Space>
                  ),
                }))}
              />
              {header.reason === 'blend' && (
                <Alert
                  message="Khi xuất phối trộn, bạn có thể chọn cả lô không đạt QC hoặc cần phối trộn"
                  type="info"
                  showIcon
                  style={{ marginTop: 12 }}
                />
              )}
            </Card>

            {/* Customer info (sale only) */}
            {header.reason === 'sale' && (
              <Card title="Khách hàng" style={{ marginBottom: 24 }}>
                <Form layout="vertical">
                  <Form.Item label="Tên khách hàng">
                    <Input
                      value={header.customer_name}
                      onChange={e => setHeader(h => ({ ...h, customer_name: e.target.value }))}
                      placeholder="Tên khách hàng..."
                      size="large"
                    />
                  </Form.Item>
                  <Form.Item label="Số đơn hàng / Ref">
                    <Input
                      value={header.customer_order_ref}
                      onChange={e => setHeader(h => ({ ...h, customer_order_ref: e.target.value }))}
                      placeholder="PO-2026-..."
                      size="large"
                      style={monoStyle}
                    />
                  </Form.Item>
                </Form>
              </Card>
            )}
          </Col>

          <Col xs={24} lg={10}>
            {/* Rubber-specific fields */}
            <Card title="Thông tin cao su" style={{ marginBottom: 24 }}>
              <Form layout="vertical">
                <Form.Item label="SVR Grade">
                  <Select
                    value={header.svr_grade || undefined}
                    onChange={val => setHeader(h => ({ ...h, svr_grade: val || '' }))}
                    placeholder="Chọn grade..."
                    allowClear
                    options={GRADE_OPTIONS}
                    style={{ width: '100%' }}
                  />
                </Form.Item>
                <Row gutter={16}>
                  <Col span={12}>
                    <Form.Item label="DRC min (%)">
                      <InputNumber
                        value={header.required_drc_min}
                        onChange={val => setHeader(h => ({ ...h, required_drc_min: val }))}
                        min={0}
                        max={100}
                        step={0.1}
                        placeholder="55.0"
                        style={{ width: '100%', ...monoStyle }}
                      />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item label="DRC max (%)">
                      <InputNumber
                        value={header.required_drc_max}
                        onChange={val => setHeader(h => ({ ...h, required_drc_max: val }))}
                        min={0}
                        max={100}
                        step={0.1}
                        placeholder="65.0"
                        style={{ width: '100%', ...monoStyle }}
                      />
                    </Form.Item>
                  </Col>
                </Row>
                <Form.Item label="Loại container">
                  <Select
                    value={header.container_type || undefined}
                    onChange={val => setHeader(h => ({ ...h, container_type: val || '' }))}
                    placeholder="Chọn loại..."
                    allowClear
                    options={[
                      { value: '20ft', label: 'Container 20ft' },
                      { value: '40ft', label: 'Container 40ft' },
                    ]}
                    style={{ width: '100%' }}
                  />
                </Form.Item>
                <Form.Item label="Số bành (bale count)">
                  <InputNumber
                    value={header.bale_count}
                    onChange={val => setHeader(h => ({ ...h, bale_count: val }))}
                    min={0}
                    placeholder="0"
                    style={{ width: '100%', ...monoStyle }}
                  />
                </Form.Item>
              </Form>
            </Card>

            {/* Notes */}
            <Card title="Ghi chú" style={{ marginBottom: 24 }}>
              <TextArea
                value={header.notes}
                onChange={e => setHeader(h => ({ ...h, notes: e.target.value }))}
                placeholder="Ghi chú thêm..."
                rows={3}
              />
            </Card>
          </Col>
        </Row>
      )}

      {/* ================================================================ */}
      {/* STEP 2: CHON HANG TON KHO */}
      {/* ================================================================ */}
      {step === 1 && (
        <div>
          {/* Warehouse info bar */}
          <Card size="small" style={{ marginBottom: 16, borderLeft: '3px solid #1B4D3E' }}>
            <Space>
              <InboxOutlined style={{ color: '#2D8B6E' }} />
              <Text strong style={{ color: '#1B4D3E' }}>
                {selectedWarehouse?.code} — {selectedWarehouse?.name}
              </Text>
              <Text type="secondary" style={monoStyle}>{batchStocks.length} lô tồn</Text>
            </Space>
          </Card>

          {/* Selected items */}
          {outItems.length > 0 && (
            <Card
              title={
                <Space>
                  <InboxOutlined style={{ color: '#2D8B6E' }} />
                  <span>Danh sách xuất ({outItems.length} lô)</span>
                  <Text strong style={{ ...monoStyle, color: '#1B4D3E' }}>
                    {totalQty.toLocaleString('vi-VN')} {outItems[0]?.material_unit || 'banh'}
                  </Text>
                </Space>
              }
              style={{ marginBottom: 16 }}
            >
              {/* Warnings */}
              {outItems.some(i => i.qc_status === 'failed' || i.qc_status === 'pending') && (
                <Alert
                  message="Có lô chưa đạt QC trong danh sách"
                  type="warning"
                  showIcon
                  style={{ marginBottom: 12 }}
                />
              )}
              <Table<OutItem>
                columns={outItemColumns}
                dataSource={outItems}
                rowKey="tempId"
                pagination={false}
                scroll={{ x: 1000 }}
                size="small"
              />
            </Card>
          )}

          {/* Add batch button */}
          <Button
            type="dashed"
            icon={<PlusOutlined />}
            onClick={() => setAddModalOpen(true)}
            size="large"
            block
            style={{ marginBottom: 16, height: 56, fontSize: 16 }}
          >
            Thêm lô hàng từ kho
          </Button>

          {/* Batch Selection Modal */}
          <Modal
            title={`Chọn lô hàng — ${selectedWarehouse?.code || ''}`}
            open={addModalOpen}
            onCancel={() => setAddModalOpen(false)}
            footer={null}
            width={1000}
            styles={{ body: { maxHeight: '70vh', overflowY: 'auto' } }}
          >
            {/* Filters */}
            <Space wrap style={{ marginBottom: 16 }}>
              <Input
                placeholder="Tìm mã lô, sản phẩm, vị trí..."
                prefix={<SearchOutlined />}
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                allowClear
                style={{ width: 280 }}
              />
              <Select
                value={filterQC}
                onChange={val => setFilterQC(val)}
                style={{ width: 140 }}
                options={[
                  { value: 'all', label: 'Tất cả QC' },
                  { value: 'passed', label: 'Đạt' },
                  { value: 'warning', label: 'Cảnh báo' },
                  { value: 'needs_blend', label: 'Cần phối trộn' },
                  { value: 'failed', label: 'Không đạt' },
                  { value: 'pending', label: 'Chờ QC' },
                ]}
              />
              {materialOptions.length > 1 && (
                <Select
                  value={filterMaterial}
                  onChange={val => setFilterMaterial(val)}
                  style={{ width: 200 }}
                  options={[
                    { value: 'all', label: 'Tất cả SP' },
                    ...materialOptions.map(m => ({ value: m.id, label: m.label })),
                  ]}
                />
              )}
            </Space>

            <Text type="secondary" style={{ display: 'block', marginBottom: 8, fontSize: 12 }}>
              Hàng tồn — FIFO (lô cũ trước) — Click "Thêm" để chọn
            </Text>

            {loadingBatches ? (
              <div style={{ textAlign: 'center', padding: 40 }}>
                <Spin tip="Đang tải hàng tồn..." />
              </div>
            ) : filteredBatches.length === 0 ? (
              <Empty
                description={
                  batchStocks.length === 0
                    ? 'Kho này chưa có hàng tồn'
                    : searchText || filterQC !== 'all' || filterMaterial !== 'all'
                      ? 'Không tìm thấy lô phù hợp'
                      : 'Tất cả lô đã được thêm vào phiếu'
                }
              />
            ) : (
              <Table<BatchStock>
                columns={batchModalColumns}
                dataSource={filteredBatches}
                rowKey="id"
                pagination={{ pageSize: 10, size: 'small' }}
                scroll={{ x: 900 }}
                size="small"
              />
            )}
          </Modal>
        </div>
      )}

      {/* ================================================================ */}
      {/* STEP 3: XAC NHAN */}
      {/* ================================================================ */}
      {step === 2 && (
        <Row gutter={24}>
          <Col xs={24} lg={16}>
            {/* Summary info */}
            <Card title={<><FileTextOutlined style={{ marginRight: 8 }} />Thông tin phiếu xuất</>} style={{ marginBottom: 24 }}>
              <Descriptions column={{ xs: 1, sm: 2 }} size="small">
                <Descriptions.Item label="Kho xuất">
                  <Text strong>{selectedWarehouse?.code}</Text>
                  <Text type="secondary" style={{ marginLeft: 8 }}>{selectedWarehouse?.name}</Text>
                </Descriptions.Item>
                <Descriptions.Item label="Lý do">
                  {REASONS.find(r => r.value === header.reason)?.label}
                </Descriptions.Item>
                {header.customer_name && (
                  <Descriptions.Item label="Khách hàng">{header.customer_name}</Descriptions.Item>
                )}
                {header.customer_order_ref && (
                  <Descriptions.Item label="Số đơn hàng">
                    <Text style={monoStyle}>{header.customer_order_ref}</Text>
                  </Descriptions.Item>
                )}
                {header.svr_grade && (
                  <Descriptions.Item label="SVR Grade">
                    <GradeBadge grade={header.svr_grade} />
                  </Descriptions.Item>
                )}
                {(header.required_drc_min != null || header.required_drc_max != null) && (
                  <Descriptions.Item label="DRC yêu cầu">
                    <Text style={monoStyle}>
                      {header.required_drc_min != null ? `${header.required_drc_min}%` : '—'}
                      {' ~ '}
                      {header.required_drc_max != null ? `${header.required_drc_max}%` : '—'}
                    </Text>
                  </Descriptions.Item>
                )}
                {header.container_type && (
                  <Descriptions.Item label="Container">{header.container_type}</Descriptions.Item>
                )}
                {header.bale_count != null && header.bale_count > 0 && (
                  <Descriptions.Item label="Số bành">
                    <Text style={monoStyle}>{header.bale_count}</Text>
                  </Descriptions.Item>
                )}
                {header.notes && (
                  <Descriptions.Item label="Ghi chú" span={2}>{header.notes}</Descriptions.Item>
                )}
              </Descriptions>
            </Card>

            {/* Warning for non-passed QC */}
            {hasNonPassedItems && (
              <Alert
                message="Có lô chưa đạt QC trong phiếu"
                description={
                  <Text>
                    Phiếu này bao gồm {outItems.filter(i => i.qc_status !== 'passed').length} lô
                    chưa đạt QC ({outItems.filter(i => i.qc_status !== 'passed').map(i => (QC_TAG[i.qc_status] || QC_TAG.pending).label).join(', ')}).
                    {header.reason === 'blend'
                      ? ' Điều này phù hợp cho mục đích phối trộn.'
                      : ' Đảm bảo khách hàng đã chấp nhận mức DRC này.'
                    }
                  </Text>
                }
                type="warning"
                showIcon
                icon={<WarningOutlined />}
                style={{ marginBottom: 24 }}
              />
            )}

            {/* Detail items */}
            <Card title={`Chi tiết xuất kho (${outItems.length} lô)`}>
              <Table<OutItem>
                columns={reviewColumns}
                dataSource={outItems}
                rowKey="tempId"
                pagination={false}
                scroll={{ x: 1000 }}
                size="small"
              />
            </Card>
          </Col>

          <Col xs={24} lg={8}>
            {/* Summary totals */}
            <Card
              style={{ marginBottom: 24, backgroundColor: '#1B4D3E', border: 'none' }}
              styles={{ body: { padding: 24 } }}
            >
              <Statistic
                title={<span style={{ color: 'rgba(255,255,255,0.7)' }}>Tổng số lượng</span>}
                value={totalQty}
                suffix={outItems[0]?.material_unit || 'banh'}
                valueStyle={{ ...monoStyle, color: '#fff', fontSize: 28 }}
              />
              <Divider style={{ borderColor: 'rgba(255,255,255,0.2)', margin: '16px 0' }} />
              <Statistic
                title={<span style={{ color: 'rgba(255,255,255,0.7)' }}>Ước tính KL</span>}
                value={totalWeight > 0 ? totalWeight : 0}
                suffix="kg"
                valueStyle={{ ...monoStyle, color: '#fff', fontSize: 20 }}
                formatter={(val) => val ? (val as number).toLocaleString('vi-VN') : '—'}
              />
              <div style={{ marginTop: 16, color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>
                {outItems.length} lô · {new Set(outItems.map(i => i.material_id)).size} sản phẩm
              </div>
            </Card>
          </Col>
        </Row>
      )}

      {/* ================================================================ */}
      {/* BOTTOM ACTION BAR */}
      {/* ================================================================ */}
      <Card
        style={{
          position: 'sticky',
          bottom: 0,
          marginTop: 24,
          boxShadow: '0 -2px 8px rgba(0,0,0,0.08)',
        }}
        styles={{ body: { padding: '16px 24px' } }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={handleBack}
            size="large"
          >
            {step === 0 ? 'Quay lại' : 'Trước'}
          </Button>

          <Space>
            {step === 0 && (
              <Button
                type="primary"
                size="large"
                onClick={handleNext}
                disabled={!validateStep1()}
                icon={<ArrowRightOutlined />}
                style={validateStep1() ? { backgroundColor: '#1B4D3E', borderColor: '#1B4D3E' } : {}}
              >
                Tiếp: Chọn hàng xuất
              </Button>
            )}

            {step === 1 && (
              <Button
                type="primary"
                size="large"
                onClick={handleNext}
                disabled={!validateStep2()}
                icon={<ArrowRightOutlined />}
                style={validateStep2() ? { backgroundColor: '#1B4D3E', borderColor: '#1B4D3E' } : {}}
              >
                Xem lại ({outItems.length} lô)
              </Button>
            )}

            {step === 2 && (
              <>
                <Button
                  size="large"
                  onClick={handleSaveDraft}
                  disabled={saving}
                  icon={<SaveOutlined />}
                  style={{ borderColor: '#2D8B6E', color: '#2D8B6E' }}
                >
                  Lưu nháp
                </Button>
                <Button
                  type="primary"
                  size="large"
                  onClick={handleConfirm}
                  disabled={saving}
                  loading={saving}
                  icon={<CheckCircleOutlined />}
                  style={{ backgroundColor: '#1B4D3E', borderColor: '#1B4D3E' }}
                >
                  {saving ? 'Đang xử lý...' : 'Xác nhận xuất'}
                </Button>
              </>
            )}
          </Space>
        </div>
      </Card>
    </div>
  )
}

export default StockOutCreatePage
