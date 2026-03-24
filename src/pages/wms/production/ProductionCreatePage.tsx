// ============================================================================
// PRODUCTION CREATE PAGE — Ant Design + 3-Step Wizard
// File: src/pages/wms/production/ProductionCreatePage.tsx
// Module: Kho Thành Phẩm (WMS) - Huy Anh Rubber ERP
// ============================================================================

import React, { useState, useEffect } from 'react'
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
  Table,
  Descriptions,
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
  PlayCircleOutlined,
} from '@ant-design/icons'
import { supabase } from '../../../lib/supabase'
import productionService from '../../../services/wms/productionService'
import GradeBadge from '../../../components/wms/GradeBadge'
import type {
  ProductionFacility,
  ProductionMaterialSpec,
  ProductionOrderFormData,
} from '../../../services/wms/wms.types'
import { RUBBER_GRADE_LABELS } from '../../../services/wms/wms.types'
import type { RubberGrade } from '../../../services/wms/wms.types'

const { Title, Text } = Typography

// ============================================================================
// TYPES
// ============================================================================

interface RawBatch {
  id: string
  batch_no: string
  initial_drc: number | null
  latest_drc: number | null
  qc_status: string
  quantity_remaining: number
  rubber_grade: string | null
}

interface SelectedBatch {
  batch: RawBatch
  quantity: number
}

// ============================================================================
// COMPONENT
// ============================================================================

const ProductionCreatePage = () => {
  const navigate = useNavigate()

  // Wizard state
  const [step, setStep] = useState(0)

  // Step 1: Header
  const [targetGrade, setTargetGrade] = useState<string>('')
  const [targetQuantity, setTargetQuantity] = useState<number | null>(null)
  const [facilityId, setFacilityId] = useState<string>('')
  const [supervisorId, setSupervisorId] = useState<string>('')
  const [scheduledDate, setScheduledDate] = useState<string>('')
  const [notes, setNotes] = useState('')
  const [drcMin, setDrcMin] = useState<number | null>(null)
  const [drcMax, setDrcMax] = useState<number | null>(null)

  // Step 2: Input batches
  const [selectedBatches, setSelectedBatches] = useState<SelectedBatch[]>([])
  const [showBatchModal, setShowBatchModal] = useState(false)
  const [batchQuantity, setBatchQuantity] = useState<number | null>(null)
  const [selectedRawBatch, setSelectedRawBatch] = useState<RawBatch | null>(null)

  // Data
  const [facilities, setFacilities] = useState<ProductionFacility[]>([])
  const [supervisors, setSupervisors] = useState<{ id: string; full_name: string }[]>([])
  const [rawBatches, setRawBatches] = useState<RawBatch[]>([])
  const [loadingBatches, setLoadingBatches] = useState(false)
  const [loadingFacilities, setLoadingFacilities] = useState(true)

  // Submit
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successCode, setSuccessCode] = useState<string | null>(null)

  // Load facilities + supervisors
  useEffect(() => {
    const load = async () => {
      setLoadingFacilities(true)
      try {
        const facs = await productionService.getFacilities()
        setFacilities(facs)
      } catch (err) { console.error(err) }

      try {
        const { data } = await supabase
          .from('employees')
          .select('id, full_name')
          .eq('is_active', true)
          .order('full_name')
        if (data) setSupervisors(data)
      } catch (err) { console.error(err) }
      setLoadingFacilities(false)
    }
    load()
  }, [])

  // Auto-fill DRC from spec when grade changes
  useEffect(() => {
    if (!targetGrade) { setDrcMin(null); setDrcMax(null); return }
    const loadSpec = async () => {
      try {
        const spec = await productionService.getSpecByGrade(targetGrade)
        if (spec) {
          setDrcMin(spec.target_drc_min)
          setDrcMax(spec.target_drc_max ?? null)
        }
      } catch (err) { console.error(err) }
    }
    loadSpec()
  }, [targetGrade])

  // Load raw batches for step 2
  useEffect(() => {
    if (step !== 1) return
    const load = async () => {
      setLoadingBatches(true)
      try {
        const { data, error: err } = await supabase
          .from('stock_batches')
          .select('id, batch_no, initial_drc, latest_drc, qc_status, quantity_remaining, rubber_grade')
          .eq('status', 'active')
          .eq('batch_type', 'purchase')
          .gt('quantity_remaining', 0)
          .order('created_at', { ascending: false })
        if (err) throw err
        setRawBatches((data || []) as RawBatch[])
      } catch (err) { console.error(err) }
      setLoadingBatches(false)
    }
    load()
  }, [step])

  // Calculations
  const totalInputWeight = selectedBatches.reduce((s, b) => s + b.quantity, 0)
  const weightedDrc = totalInputWeight > 0
    ? selectedBatches.reduce((s, b) => {
        const drc = b.batch.latest_drc || b.batch.initial_drc || 0
        return s + drc * b.quantity
      }, 0) / totalInputWeight
    : 0
  const estimatedYield = totalInputWeight > 0 && targetQuantity
    ? Math.round((targetQuantity / totalInputWeight) * 10000) / 100
    : 0

  // Handlers
  const handleSelectBatch = (batch: RawBatch) => {
    setSelectedRawBatch(batch)
    setBatchQuantity(null)
    setShowBatchModal(true)
  }

  const handleAddBatch = () => {
    if (!selectedRawBatch || !batchQuantity || batchQuantity <= 0) return
    const existing = selectedBatches.find(b => b.batch.id === selectedRawBatch.id)
    if (existing) {
      message.warning('Lô này đã được chọn')
      return
    }
    setSelectedBatches(prev => [...prev, { batch: selectedRawBatch, quantity: batchQuantity }])
    setShowBatchModal(false)
    setSelectedRawBatch(null)
    setBatchQuantity(null)
  }

  const handleRemoveBatch = (batchId: string) => {
    setSelectedBatches(prev => prev.filter(b => b.batch.id !== batchId))
  }

  const handleSubmit = async (startProduction: boolean) => {
    setSaving(true)
    setError(null)
    try {
      const formData: ProductionOrderFormData = {
        product_type: targetGrade || 'SVR',
        target_quantity: targetQuantity || 0,
        target_grade: targetGrade || undefined,
        target_drc_min: drcMin || undefined,
        target_drc_max: drcMax || undefined,
        facility_id: facilityId || undefined,
        supervisor_id: supervisorId || undefined,
        scheduled_start_date: scheduledDate || undefined,
        notes: notes || undefined,
      }

      const order = await productionService.create(formData)

      // Add input batches
      for (const sb of selectedBatches) {
        await productionService.addInputBatch(order.id, sb.batch.id, sb.quantity)
      }

      // Start production if requested
      if (startProduction) {
        await productionService.startProduction(order.id)
      }

      setSuccessCode(order.code)
    } catch (err: any) {
      setError(err.message || 'Không thể tạo lệnh sản xuất')
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
          title="Tạo lệnh sản xuất thành công!"
          subTitle={<Text style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 18 }}>{successCode}</Text>}
          extra={[
            <Button key="list" onClick={() => navigate('/wms/production')}>Về danh sách</Button>,
            <Button key="new" type="primary" onClick={() => window.location.reload()}
              style={{ background: '#1B4D3E', borderColor: '#1B4D3E' }}>
              Tạo lệnh mới
            </Button>,
          ]}
        />
      </div>
    )
  }

  const canStep1 = targetGrade && targetQuantity && targetQuantity > 0
  const canStep2 = selectedBatches.length > 0
  const canConfirm = canStep1 && canStep2

  // Available batches (exclude already selected)
  const availableBatches = rawBatches.filter(b => !selectedBatches.some(sb => sb.batch.id === b.id))

  const batchColumns = [
    {
      title: 'Lô',
      dataIndex: 'batch_no',
      key: 'batch_no',
      render: (v: string) => <Text strong style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>{v}</Text>,
    },
    {
      title: 'Grade',
      dataIndex: 'rubber_grade',
      key: 'rubber_grade',
      render: (v: string | null) => <GradeBadge grade={v} size="small" />,
    },
    {
      title: 'DRC %',
      key: 'drc',
      align: 'right' as const,
      render: (_: any, r: RawBatch) => {
        const drc = r.latest_drc || r.initial_drc
        return drc ? (
          <Text style={{ fontFamily: "'JetBrains Mono', monospace", color: '#1B4D3E' }}>{drc}%</Text>
        ) : '—'
      },
    },
    {
      title: 'Còn lại (kg)',
      dataIndex: 'quantity_remaining',
      key: 'quantity_remaining',
      align: 'right' as const,
      render: (v: number) => (
        <Text style={{ fontFamily: "'JetBrains Mono', monospace" }}>{v.toLocaleString()}</Text>
      ),
    },
    {
      title: 'QC',
      dataIndex: 'qc_status',
      key: 'qc_status',
      render: (v: string) => {
        const color = v === 'passed' ? 'success' : v === 'failed' ? 'error' : 'default'
        return <Tag color={color}>{v}</Tag>
      },
    },
    {
      title: '',
      key: 'action',
      render: (_: any, r: RawBatch) => (
        <Button type="link" icon={<PlusOutlined />} onClick={() => handleSelectBatch(r)}>
          Chọn
        </Button>
      ),
    },
  ]

  const selectedColumns = [
    {
      title: 'Lô',
      key: 'batch_no',
      render: (_: any, r: SelectedBatch) => (
        <Text strong style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>{r.batch.batch_no}</Text>
      ),
    },
    {
      title: 'Grade',
      key: 'grade',
      render: (_: any, r: SelectedBatch) => <GradeBadge grade={r.batch.rubber_grade} size="small" />,
    },
    {
      title: 'DRC %',
      key: 'drc',
      align: 'right' as const,
      render: (_: any, r: SelectedBatch) => {
        const drc = r.batch.latest_drc || r.batch.initial_drc
        return drc ? <Text style={{ fontFamily: "'JetBrains Mono', monospace" }}>{drc}%</Text> : '—'
      },
    },
    {
      title: 'SL (kg)',
      key: 'quantity',
      align: 'right' as const,
      render: (_: any, r: SelectedBatch) => (
        <Text strong style={{ fontFamily: "'JetBrains Mono', monospace" }}>{r.quantity.toLocaleString()}</Text>
      ),
    },
    {
      title: '',
      key: 'action',
      render: (_: any, r: SelectedBatch) => (
        <Button danger type="text" icon={<DeleteOutlined />} onClick={() => handleRemoveBatch(r.batch.id)} />
      ),
    },
  ]

  return (
    <div style={{ padding: 24, maxWidth: 960, margin: '0 auto' }}>
      {/* Header */}
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/wms/production')}>Quay lại</Button>
      </Space>
      <Title level={4} style={{ color: '#1B4D3E', marginBottom: 24 }}>
        <ExperimentOutlined style={{ marginRight: 8 }} />
        Tạo lệnh sản xuất
      </Title>

      {/* Steps */}
      <Steps
        current={step}
        style={{ marginBottom: 24 }}
        items={[
          { title: 'Thông tin' },
          { title: 'Nguyên liệu' },
          { title: 'Xác nhận' },
        ]}
      />

      {/* Error */}
      {error && (
        <Alert type="error" message={error} closable onClose={() => setError(null)} style={{ marginBottom: 16, borderRadius: 8 }} showIcon />
      )}

      {/* ═══ STEP 1: Thong tin ═══ */}
      {step === 0 && (
        <Card style={{ borderRadius: 12 }}>
          <Row gutter={24}>
            <Col span={12}>
              <div style={{ marginBottom: 16 }}>
                <Text strong>Grade sản phẩm *</Text>
                <Select
                  value={targetGrade || undefined}
                  onChange={setTargetGrade}
                  placeholder="Chọn grade"
                  style={{ width: '100%', marginTop: 4 }}
                  size="large"
                  options={Object.entries(RUBBER_GRADE_LABELS).map(([value, label]) => ({
                    value, label,
                  }))}
                />
              </div>
            </Col>
            <Col span={12}>
              <div style={{ marginBottom: 16 }}>
                <Text strong>Sản lượng mục tiêu (kg) *</Text>
                <InputNumber
                  value={targetQuantity}
                  onChange={v => setTargetQuantity(v)}
                  min={0}
                  placeholder="VD: 10000"
                  style={{ width: '100%', marginTop: 4 }}
                  size="large"
                />
              </div>
            </Col>
          </Row>

          <Row gutter={24}>
            <Col span={8}>
              <div style={{ marginBottom: 16 }}>
                <Text strong>Nhà máy</Text>
                <Select
                  value={facilityId || undefined}
                  onChange={setFacilityId}
                  placeholder="Chọn nhà máy"
                  style={{ width: '100%', marginTop: 4 }}
                  allowClear
                  loading={loadingFacilities}
                  options={facilities.map(f => ({
                    value: f.id,
                    label: `${f.name} (${f.code})`,
                  }))}
                />
              </div>
            </Col>
            <Col span={8}>
              <div style={{ marginBottom: 16 }}>
                <Text strong>Giám sát</Text>
                <Select
                  value={supervisorId || undefined}
                  onChange={setSupervisorId}
                  placeholder="Chọn giám sát"
                  style={{ width: '100%', marginTop: 4 }}
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  options={supervisors.map(s => ({
                    value: s.id,
                    label: s.full_name,
                  }))}
                />
              </div>
            </Col>
            <Col span={8}>
              <div style={{ marginBottom: 16 }}>
                <Text strong>Ngày dự kiến</Text>
                <Input
                  type="date"
                  value={scheduledDate}
                  onChange={e => setScheduledDate(e.target.value)}
                  style={{ width: '100%', marginTop: 4 }}
                  size="large"
                />
              </div>
            </Col>
          </Row>

          {/* DRC range from spec */}
          {(drcMin || drcMax) && (
            <Alert
              type="info"
              message={
                <Space>
                  <Text>DRC mục tiêu:</Text>
                  <Text strong style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    {drcMin}% — {drcMax}%
                  </Text>
                  <Text type="secondary">(từ định mức)</Text>
                </Space>
              }
              showIcon
              style={{ marginBottom: 16, borderRadius: 8 }}
            />
          )}

          <div style={{ marginBottom: 16 }}>
            <Text strong>Ghi chú</Text>
            <Input.TextArea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Ghi chú lệnh sản xuất..."
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

      {/* ═══ STEP 2: Nguyên liệu ═══ */}
      {step === 1 && (
        <Card style={{ borderRadius: 12 }}>
          {/* Selected batches */}
          {selectedBatches.length > 0 && (
            <>
              <Text strong style={{ fontSize: 16, display: 'block', marginBottom: 8 }}>
                Đã chọn ({selectedBatches.length} lô)
              </Text>
              <Table
                dataSource={selectedBatches}
                columns={selectedColumns}
                rowKey={r => r.batch.id}
                size="small"
                pagination={false}
                style={{ marginBottom: 16 }}
              />
              <Row gutter={16} style={{ marginBottom: 24 }}>
                <Col span={8}>
                  <Card bodyStyle={{ padding: 12 }}>
                    <Statistic title="Tổng NL (kg)" value={totalInputWeight.toLocaleString()}
                      valueStyle={{ fontSize: 18, fontFamily: "'JetBrains Mono'" }} />
                  </Card>
                </Col>
                <Col span={8}>
                  <Card bodyStyle={{ padding: 12 }}>
                    <Statistic title="DRC TB" value={weightedDrc.toFixed(1)} suffix="%"
                      valueStyle={{ fontSize: 18, fontFamily: "'JetBrains Mono'", color: '#1B4D3E' }} />
                  </Card>
                </Col>
                <Col span={8}>
                  <Card bodyStyle={{ padding: 12 }}>
                    <Statistic title="Yield ước tính" value={estimatedYield.toFixed(1)} suffix="%"
                      valueStyle={{ fontSize: 18, fontFamily: "'JetBrains Mono'", color: '#E8A838' }} />
                  </Card>
                </Col>
              </Row>
            </>
          )}

          {/* Available batches */}
          <Text strong style={{ fontSize: 16, display: 'block', marginBottom: 8 }}>
            Lô nguyên liệu khả dụng
          </Text>
          {loadingBatches ? (
            <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
          ) : availableBatches.length === 0 ? (
            <Empty description="Không có lô nguyên liệu khả dụng" style={{ padding: 40 }} />
          ) : (
            <Table
              dataSource={availableBatches}
              columns={batchColumns}
              rowKey="id"
              size="small"
              pagination={{ pageSize: 10, showSizeChanger: false }}
            />
          )}

          <div style={{ marginTop: 16 }}>
            <Space>
              <Button size="large" onClick={() => setStep(0)} icon={<ArrowLeftOutlined />}>Quay lại</Button>
              <Button type="primary" size="large" onClick={() => setStep(2)} disabled={!canStep2}
                icon={<ArrowRightOutlined />} style={{ background: '#1B4D3E', borderColor: '#1B4D3E' }}>
                Tiếp theo
              </Button>
            </Space>
          </div>

          {/* Add batch quantity modal */}
          <Modal
            title={<Space><PlusOutlined /> Nhập số lượng</Space>}
            open={showBatchModal}
            onCancel={() => { setShowBatchModal(false); setSelectedRawBatch(null) }}
            onOk={handleAddBatch}
            okText="Thêm"
            okButtonProps={{ disabled: !batchQuantity || batchQuantity <= 0 }}
          >
            {selectedRawBatch && (
              <div>
                <Descriptions size="small" column={2} style={{ marginBottom: 16 }}>
                  <Descriptions.Item label="Lô">{selectedRawBatch.batch_no}</Descriptions.Item>
                  <Descriptions.Item label="Grade"><GradeBadge grade={selectedRawBatch.rubber_grade} size="small" /></Descriptions.Item>
                  <Descriptions.Item label="DRC">{selectedRawBatch.latest_drc || selectedRawBatch.initial_drc || '—'}%</Descriptions.Item>
                  <Descriptions.Item label="Còn lại">{selectedRawBatch.quantity_remaining.toLocaleString()} kg</Descriptions.Item>
                </Descriptions>
                <Text strong style={{ display: 'block', marginBottom: 4 }}>Số lượng lấy (kg) *</Text>
                <InputNumber
                  value={batchQuantity}
                  onChange={setBatchQuantity}
                  min={1}
                  max={selectedRawBatch.quantity_remaining}
                  placeholder="0"
                  style={{ width: '100%' }}
                  size="large"
                />
              </div>
            )}
          </Modal>
        </Card>
      )}

      {/* ═══ STEP 3: Xác nhận ═══ */}
      {step === 2 && (
        <Card style={{ borderRadius: 12 }}>
          <Title level={5}>Tóm tắt lệnh sản xuất</Title>

          <Descriptions bordered size="small" column={{ xs: 1, sm: 2 }} style={{ marginBottom: 16 }}>
            <Descriptions.Item label="Grade">
              <GradeBadge grade={targetGrade} size="small" />
            </Descriptions.Item>
            <Descriptions.Item label="Sản lượng mục tiêu">
              <Text style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                {targetQuantity?.toLocaleString()} kg
              </Text>
            </Descriptions.Item>
            <Descriptions.Item label="DRC mục tiêu">
              {drcMin && drcMax ? `${drcMin}% — ${drcMax}%` : '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Nhà máy">
              {facilities.find(f => f.id === facilityId)?.name || '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Giám sát">
              {supervisors.find(s => s.id === supervisorId)?.full_name || '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Ngày dự kiến">
              {scheduledDate || '—'}
            </Descriptions.Item>
            {notes && <Descriptions.Item label="Ghi chú" span={2}>{notes}</Descriptions.Item>}
          </Descriptions>

          {/* Input summary */}
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={6}>
              <Card bodyStyle={{ padding: 12 }}>
                <Statistic title="Số lô NL" value={selectedBatches.length}
                  valueStyle={{ fontSize: 18, fontFamily: "'JetBrains Mono'" }} />
              </Card>
            </Col>
            <Col span={6}>
              <Card bodyStyle={{ padding: 12 }}>
                <Statistic title="Tổng NL (kg)" value={totalInputWeight.toLocaleString()}
                  valueStyle={{ fontSize: 18, fontFamily: "'JetBrains Mono'" }} />
              </Card>
            </Col>
            <Col span={6}>
              <Card bodyStyle={{ padding: 12 }}>
                <Statistic title="DRC TB" value={weightedDrc.toFixed(1)} suffix="%"
                  valueStyle={{ fontSize: 18, fontFamily: "'JetBrains Mono'", color: '#1B4D3E' }} />
              </Card>
            </Col>
            <Col span={6}>
              <Card bodyStyle={{ padding: 12 }}>
                <Statistic title="Yield ước tính" value={estimatedYield.toFixed(1)} suffix="%"
                  valueStyle={{ fontSize: 18, fontFamily: "'JetBrains Mono'", color: '#E8A838' }} />
              </Card>
            </Col>
          </Row>

          {/* Batch list */}
          <Card title={`Nguyên liệu (${selectedBatches.length} lô)`} size="small" style={{ marginBottom: 16 }}>
            <Table
              dataSource={selectedBatches}
              columns={selectedColumns.filter(c => c.key !== 'action')}
              rowKey={r => r.batch.id}
              size="small"
              pagination={false}
            />
          </Card>

          <Space>
            <Button size="large" onClick={() => setStep(1)} icon={<ArrowLeftOutlined />}>Quay lại</Button>
            <Button size="large" onClick={() => handleSubmit(false)} loading={saving} icon={<SaveOutlined />}>
              Lưu nháp
            </Button>
            <Button type="primary" size="large" onClick={() => handleSubmit(true)} loading={saving}
              disabled={!canConfirm}
              icon={<PlayCircleOutlined />}
              style={{ background: '#1B4D3E', borderColor: '#1B4D3E' }}>
              Xác nhận & Bắt đầu SX
            </Button>
          </Space>
        </Card>
      )}
    </div>
  )
}

export default ProductionCreatePage
