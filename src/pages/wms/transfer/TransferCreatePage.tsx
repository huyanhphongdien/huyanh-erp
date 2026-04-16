// ============================================================================
// TRANSFER CREATE PAGE — Tạo phiếu chuyển kho liên nhà máy (F3)
// File: src/pages/wms/transfer/TransferCreatePage.tsx
// ============================================================================

import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Card, Typography, Space, Button, Row, Col, Input, Table, InputNumber,
  Select, Divider, Tag, message, Modal, Empty, Alert,
} from 'antd'
import {
  ArrowLeftOutlined, SaveOutlined, PlusOutlined, DeleteOutlined,
  SwapRightOutlined, InboxOutlined,
} from '@ant-design/icons'
import { supabase } from '../../../lib/supabase'
import { useAuthStore } from '../../../stores/authStore'
import { useActiveFacilities } from '../../../hooks/useActiveFacilities'
import { useActiveWarehouses } from '../../../hooks/useActiveWarehouses'
import { useFacilityFilter } from '../../../stores/facilityFilterStore'
import transferService, { type CreateTransferInput } from '../../../services/wms/transferService'
import GradeBadge from '../../../components/wms/GradeBadge'
import type { RubberGrade } from '../../../services/wms/wms.types'

const { Title, Text } = Typography
const PRIMARY = '#1B4D3E'

interface BatchPick {
  batch_id: string
  batch_no: string
  material_id: string
  material_name: string
  material_unit: string
  weight_per_unit: number
  rubber_grade: RubberGrade | null
  quantity_remaining: number
  current_weight: number
  // Picked
  pick_qty: number
  pick_weight: number
}

const COUNTRY_FLAG: Record<string, string> = { VN: '🇻🇳', LA: '🇱🇦' }

export default function TransferCreatePage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { currentFacilityId } = useFacilityFilter()
  const { data: facilities = [] } = useActiveFacilities()
  const { data: warehouses = [] } = useActiveWarehouses()

  // Source: NM gửi (mặc định = facility filter hiện tại nếu có)
  const [fromFacilityId, setFromFacilityId] = useState<string | undefined>(currentFacilityId)
  const [fromWarehouseId, setFromWarehouseId] = useState<string | undefined>()

  // Destination: NM nhận (mặc định = PD nếu nguồn không phải PD)
  const [toFacilityId, setToFacilityId] = useState<string | undefined>()
  const [toWarehouseId, setToWarehouseId] = useState<string | undefined>()

  // Vehicle
  const [vehiclePlate, setVehiclePlate] = useState('')
  const [driverName, setDriverName] = useState('')
  const [driverPhone, setDriverPhone] = useState('')

  // Items
  const [pickedBatches, setPickedBatches] = useState<BatchPick[]>([])
  const [availableBatches, setAvailableBatches] = useState<any[]>([])
  const [loadingBatches, setLoadingBatches] = useState(false)
  const [showPickModal, setShowPickModal] = useState(false)

  // Other
  const [notes, setNotes] = useState('')
  const [lossThreshold, setLossThreshold] = useState(0.5)
  const [submitting, setSubmitting] = useState(false)

  // Mặc định to_facility = PD nếu from khác PD
  useEffect(() => {
    if (!fromFacilityId) return
    const pd = facilities.find((f) => f.code === 'PD')
    if (pd && fromFacilityId !== pd.id && !toFacilityId) {
      setToFacilityId(pd.id)
    }
  }, [fromFacilityId, facilities, toFacilityId])

  // Filter warehouses theo facility
  const fromWarehouses = useMemo(
    () => warehouses.filter((w: any) => w.facility_id === fromFacilityId && (w.type === 'finished' || w.type === 'mixed')),
    [warehouses, fromFacilityId],
  )
  const toWarehouses = useMemo(
    () => warehouses.filter((w: any) => w.facility_id === toFacilityId && (w.type === 'finished' || w.type === 'mixed')),
    [warehouses, toFacilityId],
  )

  // Auto-pick warehouse khi facility đổi
  useEffect(() => { if (fromWarehouses.length === 1) setFromWarehouseId(fromWarehouses[0].id) }, [fromWarehouses])
  useEffect(() => { if (toWarehouses.length === 1) setToWarehouseId(toWarehouses[0].id) }, [toWarehouses])

  // Load batches available trong kho gửi
  const loadAvailableBatches = async () => {
    if (!fromWarehouseId) {
      message.warning('Chọn kho gửi trước')
      return
    }
    setLoadingBatches(true)
    try {
      const { data, error } = await supabase
        .from('stock_batches')
        .select(`
          id, batch_no, material_id, quantity_remaining, current_weight,
          rubber_grade, latest_drc, status,
          material:materials(id, sku, name, unit, weight_per_unit)
        `)
        .eq('warehouse_id', fromWarehouseId)
        .eq('status', 'active')
        .gt('quantity_remaining', 0)
        .order('created_at', { ascending: true })  // FIFO
      if (error) throw error
      // Loại trừ batch đã pick rồi
      const pickedIds = new Set(pickedBatches.map((b) => b.batch_id))
      setAvailableBatches((data || []).filter((b: any) => !pickedIds.has(b.id)))
      setShowPickModal(true)
    } catch (err: any) {
      message.error('Lỗi tải batch: ' + (err.message || ''))
    } finally {
      setLoadingBatches(false)
    }
  }

  const handlePickBatch = (batch: any) => {
    const mat = Array.isArray(batch.material) ? batch.material[0] : batch.material
    setPickedBatches((prev) => [...prev, {
      batch_id: batch.id,
      batch_no: batch.batch_no,
      material_id: batch.material_id,
      material_name: mat?.name || '?',
      material_unit: mat?.unit || 'bành',
      weight_per_unit: mat?.weight_per_unit || 0,
      rubber_grade: batch.rubber_grade,
      quantity_remaining: batch.quantity_remaining,
      current_weight: batch.current_weight,
      pick_qty: batch.quantity_remaining,  // mặc định pick hết
      pick_weight: batch.current_weight,
    }])
    setAvailableBatches((prev) => prev.filter((b) => b.id !== batch.id))
  }

  const handleChangeQty = (idx: number, qty: number) => {
    setPickedBatches((prev) => {
      const next = [...prev]
      const b = next[idx]
      const safe = Math.max(0, Math.min(qty || 0, b.quantity_remaining))
      next[idx] = {
        ...b,
        pick_qty: safe,
        pick_weight: Math.round(safe * b.weight_per_unit * 100) / 100,
      }
      return next
    })
  }

  const handleRemove = (idx: number) => {
    setPickedBatches((prev) => prev.filter((_, i) => i !== idx))
  }

  const totalQty = pickedBatches.reduce((s, b) => s + b.pick_qty, 0)
  const totalWeight = pickedBatches.reduce((s, b) => s + b.pick_weight, 0)

  const canSubmit =
    fromFacilityId && fromWarehouseId && toFacilityId && toWarehouseId &&
    fromFacilityId !== toFacilityId &&
    pickedBatches.length > 0 &&
    pickedBatches.every((b) => b.pick_qty > 0)

  const handleSubmit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    try {
      const payload: CreateTransferInput = {
        from_facility_id: fromFacilityId!,
        from_warehouse_id: fromWarehouseId!,
        to_facility_id: toFacilityId!,
        to_warehouse_id: toWarehouseId!,
        vehicle_plate: vehiclePlate || undefined,
        driver_name: driverName || undefined,
        driver_phone: driverPhone || undefined,
        loss_threshold_pct: lossThreshold,
        notes: notes || undefined,
        items: pickedBatches.map((b) => ({
          material_id: b.material_id,
          source_batch_id: b.batch_id,
          quantity_planned: b.pick_qty,
          weight_planned_kg: b.pick_weight,
        })),
      }
      // employee_id (FK tới employees.id), KHÔNG dùng user.id (auth.users.id)
      const transfer = await transferService.create(payload, user?.employee_id || undefined)
      message.success(`Tạo phiếu chuyển ${transfer.code} thành công`)
      navigate(`/wms/transfer/${transfer.id}`)
    } catch (err: any) {
      message.error('Lỗi tạo phiếu: ' + (err.message || ''))
    } finally {
      setSubmitting(false)
    }
  }

  const fromFacility = facilities.find((f) => f.id === fromFacilityId)
  const toFacility = facilities.find((f) => f.id === toFacilityId)

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/wms/transfer')} />
        <Title level={4} style={{ margin: 0, color: PRIMARY }}>
          🔀 Tạo phiếu chuyển kho liên nhà máy
        </Title>
      </Space>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="Quy trình 5 bước"
        description="Tạo phiếu → Cân xuất tại NM gửi → Hàng đang vận chuyển → Cân nhận tại NM đến → Hoàn tất (đối soát hao hụt)"
      />

      {/* Source + Destination */}
      <Card title="🏭 Tuyến chuyển" size="small" style={{ marginBottom: 16, borderRadius: 10 }}>
        <Row gutter={[16, 12]} align="middle">
          <Col xs={24} md={11}>
            <Text strong style={{ color: PRIMARY }}>Từ nhà máy (gửi):</Text>
            <Select
              size="large"
              style={{ width: '100%', marginTop: 4 }}
              placeholder="Chọn NM gửi"
              value={fromFacilityId}
              onChange={(v) => { setFromFacilityId(v); setFromWarehouseId(undefined) }}
              options={facilities.map((f) => ({
                value: f.id,
                label: `${COUNTRY_FLAG[f.country || 'VN']} ${f.name}`,
              }))}
            />
            <Select
              size="large"
              style={{ width: '100%', marginTop: 8 }}
              placeholder="Chọn kho gửi"
              value={fromWarehouseId}
              onChange={setFromWarehouseId}
              disabled={!fromFacilityId}
              options={fromWarehouses.map((w) => ({ value: w.id, label: `${w.code} — ${w.name}` }))}
              notFoundContent={fromFacilityId ? 'NM này chưa có kho TP' : 'Chọn NM trước'}
            />
          </Col>
          <Col xs={24} md={2} style={{ textAlign: 'center' }}>
            <SwapRightOutlined style={{ fontSize: 32, color: PRIMARY }} />
          </Col>
          <Col xs={24} md={11}>
            <Text strong style={{ color: PRIMARY }}>Đến nhà máy (nhận):</Text>
            <Select
              size="large"
              style={{ width: '100%', marginTop: 4 }}
              placeholder="Chọn NM nhận"
              value={toFacilityId}
              onChange={(v) => { setToFacilityId(v); setToWarehouseId(undefined) }}
              options={facilities
                .filter((f) => f.id !== fromFacilityId)
                .map((f) => ({
                  value: f.id,
                  label: `${COUNTRY_FLAG[f.country || 'VN']} ${f.name}${f.can_ship_to_customer ? ' ⭐' : ''}`,
                }))}
            />
            <Select
              size="large"
              style={{ width: '100%', marginTop: 8 }}
              placeholder="Chọn kho nhận"
              value={toWarehouseId}
              onChange={setToWarehouseId}
              disabled={!toFacilityId}
              options={toWarehouses.map((w) => ({ value: w.id, label: `${w.code} — ${w.name}` }))}
              notFoundContent={toFacilityId ? 'NM này chưa có kho TP' : 'Chọn NM trước'}
            />
          </Col>
        </Row>
      </Card>

      {/* Vehicle + driver */}
      <Card title="🚛 Phương tiện" size="small" style={{ marginBottom: 16, borderRadius: 10 }}>
        <Row gutter={12}>
          <Col xs={24} sm={8}>
            <Text>Biển số xe</Text>
            <Input
              size="large"
              placeholder="VD: 75H-12345"
              value={vehiclePlate}
              onChange={(e) => setVehiclePlate(e.target.value.toUpperCase())}
              style={{ marginTop: 4 }}
            />
          </Col>
          <Col xs={24} sm={8}>
            <Text>Tài xế</Text>
            <Input
              size="large"
              placeholder="Tên tài xế"
              value={driverName}
              onChange={(e) => setDriverName(e.target.value)}
              style={{ marginTop: 4 }}
            />
          </Col>
          <Col xs={24} sm={8}>
            <Text>SĐT tài xế</Text>
            <Input
              size="large"
              placeholder="0901..."
              value={driverPhone}
              onChange={(e) => setDriverPhone(e.target.value)}
              style={{ marginTop: 4 }}
            />
          </Col>
        </Row>
      </Card>

      {/* Picked batches */}
      <Card
        title={
          <Space>
            <span>📦 Hàng cần chuyển ({pickedBatches.length} batch)</span>
            <Tag color="blue">SL: {totalQty.toLocaleString('vi-VN')}</Tag>
            <Tag color="green">{totalWeight.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} kg</Tag>
          </Space>
        }
        size="small"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={loadAvailableBatches} loading={loadingBatches}>
            Thêm batch
          </Button>
        }
        style={{ marginBottom: 16, borderRadius: 10 }}
      >
        {pickedBatches.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="Chưa chọn batch nào — click 'Thêm batch'"
          />
        ) : (
          <Table
            size="small"
            pagination={false}
            rowKey="batch_id"
            dataSource={pickedBatches}
            columns={[
              { title: 'Batch', dataIndex: 'batch_no', width: 140, render: (v) => <Text strong>{v}</Text> },
              { title: 'Vật liệu', dataIndex: 'material_name', ellipsis: true },
              { title: 'Grade', dataIndex: 'rubber_grade', width: 90, render: (g) => <GradeBadge grade={g} size="small" /> },
              {
                title: 'Tồn (đv)',
                dataIndex: 'quantity_remaining',
                width: 90,
                align: 'right' as const,
                render: (v) => v.toLocaleString('vi-VN'),
              },
              {
                title: 'Pick',
                dataIndex: 'pick_qty',
                width: 110,
                render: (v, _, idx) => (
                  <InputNumber
                    min={0}
                    max={pickedBatches[idx].quantity_remaining}
                    value={v}
                    onChange={(val) => handleChangeQty(idx, val || 0)}
                    style={{ width: '100%' }}
                  />
                ),
              },
              {
                title: 'Đv',
                dataIndex: 'material_unit',
                width: 60,
                render: (v) => <Text type="secondary">{v}</Text>,
              },
              {
                title: 'KL (kg)',
                dataIndex: 'pick_weight',
                width: 110,
                align: 'right' as const,
                render: (v) => <Text strong>{v.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}</Text>,
              },
              {
                title: '',
                width: 50,
                render: (_, __, idx) => (
                  <Button type="text" danger icon={<DeleteOutlined />} onClick={() => handleRemove(idx)} />
                ),
              },
            ]}
            summary={() => (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={4}>
                  <Text strong>Tổng cộng</Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={1} align="right"><Text strong>{totalQty.toLocaleString('vi-VN')}</Text></Table.Summary.Cell>
                <Table.Summary.Cell index={2} />
                <Table.Summary.Cell index={3} align="right"><Text strong style={{ color: PRIMARY }}>{totalWeight.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} kg</Text></Table.Summary.Cell>
                <Table.Summary.Cell index={4} />
              </Table.Summary.Row>
            )}
          />
        )}
      </Card>

      {/* Threshold + Notes */}
      <Card title="⚙️ Cấu hình" size="small" style={{ marginBottom: 16, borderRadius: 10 }}>
        <Row gutter={12}>
          <Col xs={24} sm={8}>
            <Text>Ngưỡng hao hụt cho phép (%)</Text>
            <InputNumber
              size="large"
              min={0}
              max={10}
              step={0.1}
              value={lossThreshold}
              onChange={(v) => setLossThreshold(v || 0.5)}
              style={{ width: '100%', marginTop: 4 }}
              suffix="%"
            />
            <Text type="secondary" style={{ fontSize: 11 }}>
              Nếu hao hụt vượt ngưỡng → cần BGD duyệt mới hoàn tất
            </Text>
          </Col>
          <Col xs={24} sm={16}>
            <Text>Ghi chú</Text>
            <Input.TextArea
              rows={2}
              placeholder="Ghi chú cho phiếu chuyển..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              style={{ marginTop: 4 }}
            />
          </Col>
        </Row>
      </Card>

      {/* Submit */}
      <div style={{ textAlign: 'right', marginTop: 16 }}>
        <Button
          type="primary"
          size="large"
          icon={<SaveOutlined />}
          loading={submitting}
          disabled={!canSubmit}
          onClick={handleSubmit}
          style={{ background: PRIMARY, minWidth: 200 }}
        >
          Tạo phiếu chuyển
        </Button>
        {!canSubmit && (
          <div style={{ marginTop: 4 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {!fromFacilityId || !toFacilityId
                ? '↑ Chọn cả NM gửi và NM nhận'
                : !fromWarehouseId || !toWarehouseId
                ? '↑ Chọn kho gửi và kho nhận'
                : pickedBatches.length === 0
                ? '↑ Thêm ít nhất 1 batch'
                : '↑ Số lượng pick phải > 0'}
            </Text>
          </div>
        )}
      </div>

      {/* Modal pick batch */}
      <Modal
        title={`Chọn batch trong kho ${fromWarehouses.find((w) => w.id === fromWarehouseId)?.code || ''}`}
        open={showPickModal}
        onCancel={() => setShowPickModal(false)}
        footer={null}
        width={900}
      >
        {availableBatches.length === 0 ? (
          <Empty description="Không còn batch khả dụng" />
        ) : (
          <Table
            size="small"
            rowKey="id"
            dataSource={availableBatches}
            pagination={{ pageSize: 10 }}
            columns={[
              { title: 'Batch', dataIndex: 'batch_no', width: 140, render: (v) => <Text strong>{v}</Text> },
              {
                title: 'Vật liệu',
                key: 'material',
                render: (_, r: any) => {
                  const m = Array.isArray(r.material) ? r.material[0] : r.material
                  return m?.name || '—'
                },
              },
              {
                title: 'Grade',
                dataIndex: 'rubber_grade',
                width: 90,
                render: (g) => <GradeBadge grade={g} size="small" />,
              },
              {
                title: 'DRC',
                dataIndex: 'latest_drc',
                width: 70,
                render: (v) => v ? `${v}%` : '—',
              },
              {
                title: 'Tồn (đv)',
                dataIndex: 'quantity_remaining',
                width: 90,
                align: 'right' as const,
                render: (v) => v.toLocaleString('vi-VN'),
              },
              {
                title: 'KL (kg)',
                dataIndex: 'current_weight',
                width: 100,
                align: 'right' as const,
                render: (v) => v?.toLocaleString('vi-VN', { maximumFractionDigits: 1 }) || '—',
              },
              {
                title: '',
                width: 80,
                render: (_, batch) => (
                  <Button type="primary" size="small" onClick={() => handlePickBatch(batch)} icon={<InboxOutlined />}>
                    Chọn
                  </Button>
                ),
              },
            ]}
          />
        )}
        {fromFacility && toFacility && (
          <Divider style={{ margin: '8px 0' }} />
        )}
        {fromFacility && toFacility && (
          <Text type="secondary" style={{ fontSize: 12 }}>
            Tuyến: {COUNTRY_FLAG[fromFacility.country || 'VN']} {fromFacility.name} → {COUNTRY_FLAG[toFacility.country || 'VN']} {toFacility.name}
          </Text>
        )}
      </Modal>
    </div>
  )
}
