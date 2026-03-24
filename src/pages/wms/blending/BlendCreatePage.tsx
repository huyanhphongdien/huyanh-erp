// ============================================================================
// BLEND CREATE PAGE — Ant Design + 3-Step Wizard + BLEND SIMULATOR
// File: src/pages/wms/blending/BlendCreatePage.tsx
// Module: Kho Thành Phẩm (WMS) - Huy Anh Rubber ERP
// ============================================================================

import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Card,
  Steps,
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
  Progress,
  message,
} from 'antd'
import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  PlusOutlined,
  DeleteOutlined,
  SaveOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ExperimentOutlined,
} from '@ant-design/icons'
import blendingService from '../../../services/wms/blendingService'
import { rubberGradeService } from '../../../services/wms/rubberGradeService'
import GradeBadge from '../../../components/wms/GradeBadge'
import type { StockBatch, RubberGradeStandard } from '../../../services/wms/wms.types'
import { RUBBER_GRADE_LABELS } from '../../../services/wms/wms.types'

const { Title, Text } = Typography

// ============================================================================
// TYPES
// ============================================================================

interface AvailableBatch {
  id: string
  batch_no: string
  initial_drc: number | null
  latest_drc: number | null
  qc_status: string
  quantity_remaining: number
  rubber_grade: string | null
  material_name?: string
}

interface SelectedBlendItem {
  batch: AvailableBatch
  quantity_kg: number
}

// ============================================================================
// COMPONENT
// ============================================================================

const BlendCreatePage = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  // Wizard state
  const [step, setStep] = useState(0)

  // Step 1: Target info
  const [targetGrade, setTargetGrade] = useState<string>(searchParams.get('grade') || '')
  const [targetDrc, setTargetDrc] = useState<number | null>(null)
  const [targetQuantity, setTargetQuantity] = useState<number | null>(null)
  const [notes, setNotes] = useState('')

  // Step 2: Blend simulator
  const [selectedItems, setSelectedItems] = useState<SelectedBlendItem[]>([])
  const [showBatchModal, setShowBatchModal] = useState(false)
  const [batchQuantity, setBatchQuantity] = useState<number | null>(null)
  const [selectedRawBatch, setSelectedRawBatch] = useState<AvailableBatch | null>(null)

  // Data
  const [availableBatches, setAvailableBatches] = useState<AvailableBatch[]>([])
  const [gradeStandards, setGradeStandards] = useState<RubberGradeStandard[]>([])
  const [loadingBatches, setLoadingBatches] = useState(false)
  const [loadingGrades, setLoadingGrades] = useState(true)
  const [batchSearch, setBatchSearch] = useState('')

  // Submit
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successCode, setSuccessCode] = useState<string | null>(null)

  // Load grade standards
  useEffect(() => {
    const load = async () => {
      setLoadingGrades(true)
      try {
        const standards = await rubberGradeService.getAll()
        setGradeStandards(standards)
      } catch (err) { console.error(err) }
      setLoadingGrades(false)
    }
    load()
  }, [])

  // Auto-fill DRC from grade standard when grade changes
  useEffect(() => {
    if (!targetGrade) { setTargetDrc(null); return }
    const standard = gradeStandards.find(s => s.grade === targetGrade)
    if (standard) {
      setTargetDrc(standard.drc_min)
    }
  }, [targetGrade, gradeStandards])

  // Load available batches for step 2
  useEffect(() => {
    if (step !== 1) return
    const load = async () => {
      setLoadingBatches(true)
      try {
        const batches = await blendingService.getBatchesNeedingBlend()
        setAvailableBatches(batches.map((b: StockBatch) => ({
          id: b.id,
          batch_no: b.batch_no,
          initial_drc: b.initial_drc ?? null,
          latest_drc: b.latest_drc ?? null,
          qc_status: b.qc_status,
          quantity_remaining: b.quantity_remaining,
          rubber_grade: b.rubber_grade || null,
          material_name: (b.material as any)?.name || '',
        })))
      } catch (err) { console.error(err) }
      setLoadingBatches(false)
    }
    load()
  }, [step])

  // Pre-select batch from URL params
  useEffect(() => {
    const preselectedBatchId = searchParams.get('batch_id')
    if (preselectedBatchId && availableBatches.length > 0) {
      const batch = availableBatches.find(b => b.id === preselectedBatchId)
      if (batch && !selectedItems.some(s => s.batch.id === preselectedBatchId)) {
        setSelectedRawBatch(batch)
        setShowBatchModal(true)
      }
    }
  }, [availableBatches, searchParams])

  // ── SIMULATION (real-time) ──
  const simulation = useMemo(() => {
    if (selectedItems.length === 0 || !targetDrc || !targetGrade) return null

    const items = selectedItems.map(s => ({
      batch_id: s.batch.id,
      batch_no: s.batch.batch_no,
      quantity_kg: s.quantity_kg,
      drc: s.batch.latest_drc || s.batch.initial_drc || 0,
      rubber_grade: s.batch.rubber_grade || undefined,
    }))

    return blendingService.simulateFromItems(items, targetDrc, targetGrade)
  }, [selectedItems, targetDrc, targetGrade])

  // Handlers
  const handleSelectBatch = (batch: AvailableBatch) => {
    setSelectedRawBatch(batch)
    setBatchQuantity(null)
    setShowBatchModal(true)
  }

  const handleAddBatch = () => {
    if (!selectedRawBatch || !batchQuantity || batchQuantity <= 0) return
    const existing = selectedItems.find(b => b.batch.id === selectedRawBatch.id)
    if (existing) {
      message.warning('Lô này đã được chọn')
      return
    }
    setSelectedItems(prev => [...prev, { batch: selectedRawBatch, quantity_kg: batchQuantity }])
    setShowBatchModal(false)
    setSelectedRawBatch(null)
    setBatchQuantity(null)
  }

  const handleRemoveItem = (batchId: string) => {
    setSelectedItems(prev => prev.filter(b => b.batch.id !== batchId))
  }

  const handleSubmit = async (approve: boolean) => {
    setSaving(true)
    setError(null)
    try {
      if (!targetGrade || !targetDrc || !targetQuantity) {
        throw new Error('Vui lòng nhập đầy đủ thông tin')
      }

      const order = await blendingService.create({
        target_grade: targetGrade,
        target_drc: targetDrc,
        target_quantity_kg: targetQuantity,
        notes: notes || undefined,
      })

      // Add items
      for (const item of selectedItems) {
        await blendingService.addItem(order.id, item.batch.id, item.quantity_kg)
      }

      // Run simulation
      await blendingService.simulate(order.id)

      // Approve if requested
      if (approve) {
        await blendingService.approve(order.id, 'system')
      }

      setSuccessCode(order.code)
    } catch (err: any) {
      setError(err.message || 'Không thể tạo lệnh phối trộn')
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
          title="Tạo lệnh phối trộn thành công!"
          subTitle={<Text style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 18 }}>{successCode}</Text>}
          extra={[
            <Button key="list" onClick={() => navigate('/wms/blending')}>Về danh sách</Button>,
            <Button key="new" type="primary" onClick={() => window.location.reload()}
              style={{ background: '#1B4D3E', borderColor: '#1B4D3E' }}>
              Tạo lệnh mới
            </Button>,
          ]}
        />
      </div>
    )
  }

  const canStep1 = targetGrade && targetDrc && targetDrc > 0 && targetQuantity && targetQuantity > 0
  const canStep2 = selectedItems.length > 0
  const canConfirm = canStep1 && canStep2

  // Filter available (exclude selected)
  const filteredBatches = availableBatches
    .filter(b => !selectedItems.some(s => s.batch.id === b.id))
    .filter(b => !batchSearch || b.batch_no.toLowerCase().includes(batchSearch.toLowerCase())
      || (b.material_name || '').toLowerCase().includes(batchSearch.toLowerCase()))

  // ── Batch columns (left side) ──
  const batchColumns = [
    {
      title: 'Lô',
      dataIndex: 'batch_no',
      key: 'batch_no',
      render: (v: string) => <Text strong style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>{v}</Text>,
    },
    {
      title: 'Nguyên liệu',
      dataIndex: 'material_name',
      key: 'material_name',
      ellipsis: true,
      render: (v: string) => <Text style={{ fontSize: 12 }}>{v || '—'}</Text>,
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
      render: (_: any, r: AvailableBatch) => {
        const drc = r.latest_drc || r.initial_drc
        return drc ? <Text style={{ fontFamily: "'JetBrains Mono', monospace", color: '#1B4D3E' }}>{drc}%</Text> : '—'
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
      title: '',
      key: 'action',
      width: 80,
      render: (_: any, r: AvailableBatch) => (
        <Button type="link" icon={<PlusOutlined />} onClick={() => handleSelectBatch(r)} size="small">
          Chọn
</Button>
      ),
    },
  ]

  // ── Selected items columns (right side) ──
  const selectedColumns = [
    {
      title: 'Lô',
      key: 'batch_no',
      render: (_: any, r: SelectedBlendItem) => (
        <Text strong style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>{r.batch.batch_no}</Text>
      ),
    },
    {
      title: 'DRC %',
      key: 'drc',
      align: 'right' as const,
      render: (_: any, r: SelectedBlendItem) => {
        const drc = r.batch.latest_drc || r.batch.initial_drc
        return drc ? <Text style={{ fontFamily: "'JetBrains Mono', monospace" }}>{drc}%</Text> : '—'
      },
    },
    {
      title: 'SL (kg)',
      key: 'qty',
      align: 'right' as const,
      render: (_: any, r: SelectedBlendItem) => (
        <Text strong style={{ fontFamily: "'JetBrains Mono', monospace" }}>{r.quantity_kg.toLocaleString()}</Text>
      ),
    },
    {
      title: '% tổng',
      key: 'pct',
      align: 'right' as const,
      render: (_: any, r: SelectedBlendItem) => {
        if (!simulation) return '—'
        const simItem = simulation.items.find(i => i.batch_id === r.batch.id)
        return simItem ? (
          <Text style={{ fontFamily: "'JetBrains Mono', monospace", color: '#E8A838' }}>{simItem.percentage}%</Text>
        ) : '—'
      },
    },
    {
      title: 'Đóng góp DRC',
      key: 'contrib',
      align: 'right' as const,
      render: (_: any, r: SelectedBlendItem) => {
        if (!simulation) return '—'
        const simItem = simulation.items.find(i => i.batch_id === r.batch.id)
        return simItem ? (
          <Text style={{ fontFamily: "'JetBrains Mono', monospace" }}>{simItem.drc_contribution}</Text>
        ) : '—'
      },
    },
    {
      title: '',
      key: 'action',
      width: 50,
      render: (_: any, r: SelectedBlendItem) => (
        <Button danger type="text" icon={<DeleteOutlined />} onClick={() => handleRemoveItem(r.batch.id)} size="small" />
      ),
    },
  ]

  // DRC progress bar helper
  const drcProgressPercent = simulation && targetDrc
    ? Math.min(100, Math.round((simulation.simulated_drc / targetDrc) * 100))
    : 0
  const drcProgressColor = simulation?.meets_target ? '#16A34A' : '#DC2626'

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/wms/blending')}>Quay lại</Button>
      </Space>
      <Title level={4} style={{ color: '#1B4D3E', marginBottom: 24 }}>
        <ExperimentOutlined style={{ marginRight: 8 }} />
        Tạo lệnh phối trộn
      </Title>

      {/* Steps */}
      <Steps
        current={step}
        style={{ marginBottom: 24 }}
        items={[
          { title: 'Mục tiêu' },
          { title: 'Mô phỏng phối trộn' },
          { title: 'Xác nhận' },
        ]}
      />

      {/* Error */}
      {error && (
        <Alert type="error" message={error} closable onClose={() => setError(null)} style={{ marginBottom: 16, borderRadius: 8 }} showIcon />
      )}

      {/* ═══ STEP 1: Target info ═══ */}
      {step === 0 && (
        <Card style={{ borderRadius: 12 }}>
          <Row gutter={24}>
            <Col span={8}>
              <div style={{ marginBottom: 16 }}>
                <Text strong>Grade mục tiêu *</Text>
                <Select
                  value={targetGrade || undefined}
                  onChange={setTargetGrade}
                  placeholder="Chọn grade"
                  style={{ width: '100%', marginTop: 4 }}
                  size="large"
                  loading={loadingGrades}
                  options={Object.entries(RUBBER_GRADE_LABELS).map(([value, label]) => ({
                    value, label,
                  }))}
                />
              </div>
            </Col>
            <Col span={8}>
              <div style={{ marginBottom: 16 }}>
                <Text strong>DRC mục tiêu (%) *</Text>
                <InputNumber
                  value={targetDrc}
                  onChange={v => setTargetDrc(v)}
                  min={0}
                  max={100}
                  step={0.1}
                  placeholder="VD: 60"
                  style={{ width: '100%', marginTop: 4 }}
                  size="large"
                />
              </div>
            </Col>
            <Col span={8}>
              <div style={{ marginBottom: 16 }}>
                <Text strong>Sản lượng mục tiêu (kg) *</Text>
                <InputNumber
                  value={targetQuantity}
                  onChange={v => setTargetQuantity(v)}
                  min={0}
                  placeholder="VD: 5000"
                  style={{ width: '100%', marginTop: 4 }}
                  size="large"
                />
              </div>
            </Col>
          </Row>

          {targetGrade && targetDrc && (
            <Alert
              type="info"
              message={
                <Space>
                  <Text>Grade:</Text>
                  <GradeBadge grade={targetGrade} size="small" />
                  <Text style={{ marginLeft: 8 }}>DRC mục tiêu:</Text>
                  <Text strong style={{ fontFamily: "'JetBrains Mono', monospace" }}>{targetDrc}%</Text>
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
              placeholder="Ghi chú lệnh phối trộn..."
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

      {/* ═══ STEP 2: BLEND SIMULATOR ═══ */}
      {step === 1 && (
        <div>
          <Row gutter={16}>
            {/* LEFT: Available batches */}
            <Col span={14}>
              <Card
                title={
                  <Space>
                    <Text strong>Lô nguyên liệu khả dụng</Text>
                    <Input.Search
                      placeholder="Tìm lô..."
                      value={batchSearch}
                      onChange={e => setBatchSearch(e.target.value)}
                      allowClear
                      style={{ width: 200 }}
                      size="small"
                    />
                  </Space>
                }
                style={{ borderRadius: 12 }}
                styles={{ body: { padding: 0 } }}
              >
                {loadingBatches ? (
                  <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
                ) : filteredBatches.length === 0 ? (
                  <Empty description="Không có lô khả dụng" style={{ padding: 40 }} />
                ) : (
                  <Table
                    dataSource={filteredBatches}
                    columns={batchColumns}
                    rowKey="id"
                    size="small"
                    pagination={{ pageSize: 8, showSizeChanger: false }}
                  />
                )}
              </Card>
            </Col>

            {/* RIGHT: Selected items + Simulation */}
            <Col span={10}>
              <Card
                title={<Text strong>Nguyên liệu đã chọn ({selectedItems.length})</Text>}
                style={{ borderRadius: 12, marginBottom: 16 }}
                styles={{ body: { padding: selectedItems.length > 0 ? 0 : 16 } }}
              >
                {selectedItems.length === 0 ? (
                  <Empty description="Chọn lô nguyên liệu từ bảng bên trái" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                ) : (
                  <Table
                    dataSource={selectedItems}
                    columns={selectedColumns}
                    rowKey={r => r.batch.id}
                    size="small"
                    pagination={false}
                  />
                )}
              </Card>

              {/* SIMULATION RESULT */}
              {simulation && (
                <Card
                  title={
                    <Space>
                      <ExperimentOutlined />
                      <Text strong>Kết quả mô phỏng</Text>
                    </Space>
                  }
                  style={{
                    borderRadius: 12,
                    border: simulation.meets_target ? '2px solid #16A34A' : '2px solid #DC2626',
                  }}
                >
                  <Row gutter={16} style={{ marginBottom: 12 }}>
                    <Col span={12}>
                      <Statistic
                        title="Tổng sản lượng"
                        value={simulation.total_quantity_kg.toLocaleString()}
                        suffix="kg"
                        valueStyle={{ fontSize: 18, fontFamily: "'JetBrains Mono'" }}
                      />
                    </Col>
                    <Col span={12}>
                      <Statistic
                        title="DRC mô phỏng"
                        value={simulation.simulated_drc}
                        suffix="%"
                        valueStyle={{ fontSize: 18, fontFamily: "'JetBrains Mono'", color: '#1B4D3E' }}
                      />
                    </Col>
                  </Row>

                  <div style={{ marginBottom: 12 }}>
                    <Space>
                      <Text type="secondary">Grade:</Text>
                      <GradeBadge grade={simulation.simulated_grade} size="small" />
                    </Space>
                  </div>

                  {/* DRC Progress */}
                  <div style={{ marginBottom: 12 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>DRC mục tiêu: {targetDrc}%</Text>
                    <Progress
                      percent={drcProgressPercent}
                      strokeColor={drcProgressColor}
                      format={() => `${simulation.simulated_drc}%`}
                      size="small"
                    />
                  </div>

                  {/* Meets target badge */}
                  <div style={{ textAlign: 'center', padding: '8px 0' }}>
                    {simulation.meets_target ? (
                      <Tag icon={<CheckCircleOutlined />} color="success" style={{ fontSize: 14, padding: '4px 12px' }}>
                        Đạt mục tiêu
                      </Tag>
                    ) : (
                      <Tag icon={<CloseCircleOutlined />} color="error" style={{ fontSize: 14, padding: '4px 12px' }}>
                        Chưa đạt mục tiêu
                      </Tag>
                    )}
                  </div>
                </Card>
              )}
            </Col>
          </Row>

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
                <Text strong style={{ display: 'block', marginBottom: 4 }}>Số lượng phối trộn (kg) *</Text>
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
        </div>
      )}

      {/* ═══ STEP 3: Review ═══ */}
      {step === 2 && (
        <Card style={{ borderRadius: 12 }}>
          <Title level={5}>Tóm tắt lệnh phối trộn</Title>

          <Descriptions bordered size="small" column={{ xs: 1, sm: 2 }} style={{ marginBottom: 16 }}>
            <Descriptions.Item label="Grade mục tiêu">
              <GradeBadge grade={targetGrade} size="small" />
            </Descriptions.Item>
            <Descriptions.Item label="DRC mục tiêu">
              <Text style={{ fontFamily: "'JetBrains Mono', monospace" }}>{targetDrc}%</Text>
            </Descriptions.Item>
            <Descriptions.Item label="Sản lượng mục tiêu">
              <Text style={{ fontFamily: "'JetBrains Mono', monospace" }}>{targetQuantity?.toLocaleString()} kg</Text>
            </Descriptions.Item>
            <Descriptions.Item label="Số lô nguyên liệu">{selectedItems.length}</Descriptions.Item>
            {notes && <Descriptions.Item label="Ghi chú" span={2}>{notes}</Descriptions.Item>}
          </Descriptions>

          {/* Simulation result */}
          {simulation && (
            <Card
              size="small"
              style={{
                marginBottom: 16,
                borderRadius: 8,
                background: simulation.meets_target ? '#f6ffed' : '#fff2f0',
                border: simulation.meets_target ? '1px solid #b7eb8f' : '1px solid #ffa39e',
              }}
            >
              <Row gutter={16}>
                <Col span={6}>
                  <Statistic title="Tổng NL (kg)" value={simulation.total_quantity_kg.toLocaleString()}
                    valueStyle={{ fontSize: 18, fontFamily: "'JetBrains Mono'" }} />
                </Col>
                <Col span={6}>
                  <Statistic title="DRC mô phỏng" value={simulation.simulated_drc} suffix="%"
                    valueStyle={{ fontSize: 18, fontFamily: "'JetBrains Mono'", color: '#1B4D3E' }} />
                </Col>
                <Col span={6}>
                  <Statistic title="Grade mô phỏng" value={simulation.simulated_grade}
                    valueStyle={{ fontSize: 18 }} />
                </Col>
                <Col span={6}>
                  <div style={{ textAlign: 'center', paddingTop: 8 }}>
                    {simulation.meets_target ? (
                      <Tag icon={<CheckCircleOutlined />} color="success" style={{ fontSize: 14, padding: '4px 12px' }}>
                        Đạt mục tiêu
                      </Tag>
                    ) : (
                      <Tag icon={<CloseCircleOutlined />} color="error" style={{ fontSize: 14, padding: '4px 12px' }}>
                        Chưa đạt
                      </Tag>
                    )}
                  </div>
                </Col>
              </Row>
            </Card>
          )}

          {/* Items table */}
          <Card title={`Nguyên liệu (${selectedItems.length} lô)`} size="small" style={{ marginBottom: 16 }}>
            <Table
              dataSource={selectedItems}
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
              icon={<CheckCircleOutlined />}
              style={{ background: '#1B4D3E', borderColor: '#1B4D3E' }}>
              Lưu & Duyệt
            </Button>
          </Space>
        </Card>
      )}
    </div>
  )
}

export default BlendCreatePage
