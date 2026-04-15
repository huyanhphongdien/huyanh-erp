// ============================================================================
// PRODUCTION OUTPUT PAGE — Ant Design
// File: src/pages/wms/production/ProductionOutputPage.tsx
// Route: /wms/production/:id/output
// Module: Kho Thành Phẩm (WMS) - Huy Anh Rubber ERP
// ============================================================================

import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Card,
  Table,
  Tag,
  Button,
  Space,
  Typography,
  Row,
  Col,
  Statistic,
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  Spin,
  Empty,
  Alert,
  Descriptions,
  message,
} from 'antd'
import {
  ArrowLeftOutlined,
  PlusOutlined,
  ExperimentOutlined,
  CheckCircleOutlined,
  InboxOutlined,
} from '@ant-design/icons'
import { supabase } from '../../../lib/supabase'
import productionService from '../../../services/wms/productionService'
import GradeBadge from '../../../components/wms/GradeBadge'
import type {
  ProductionOrder,
  ProductionOutputBatch,
} from '../../../services/wms/wms.types'
import {
  PRODUCTION_STATUS_LABELS,
  PRODUCTION_STATUS_COLORS,
  RUBBER_GRADE_LABELS,
} from '../../../services/wms/wms.types'
import type { RubberGrade } from '../../../services/wms/wms.types'

const { Title, Text } = Typography

// ============================================================================
// COMPONENT
// ============================================================================

interface ProductionOutputPageProps {
  id?: string
}

const ProductionOutputPage = ({ id: propId }: ProductionOutputPageProps = {}) => {
  const { id: paramId } = useParams<{ id: string }>()
  const id = propId || paramId
  const navigate = useNavigate()

  const [order, setOrder] = useState<ProductionOrder | null>(null)
  const [batches, setBatches] = useState<ProductionOutputBatch[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Create batch modal
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createLoading, setCreateLoading] = useState(false)
  const [materials, setMaterials] = useState<{ id: string; sku: string; name: string }[]>([])
  const [warehouses, setWarehouses] = useState<{ id: string; code: string; name: string }[]>([])
  const [createForm] = Form.useForm()

  // QC modal
  const [showQcModal, setShowQcModal] = useState(false)
  const [qcLoading, setQcLoading] = useState(false)
  const [qcBatchId, setQcBatchId] = useState<string>('')
  const [qcForm] = Form.useForm()

  const loadData = async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const [orderData, batchData] = await Promise.all([
        productionService.getById(id),
        productionService.getOutputBatches(id),
      ])
      setOrder(orderData)
      setBatches(batchData)
    } catch (err: any) {
      setError(err.message || 'Không thể tải dữ liệu')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [id])

  // Load materials + warehouses for create modal
  useEffect(() => {
    const load = async () => {
      const [{ data: mats }, { data: whs }] = await Promise.all([
        supabase.from('materials').select('id, sku, name').eq('is_active', true).order('name'),
        supabase.from('warehouses').select('id, code, name').eq('is_active', true).order('name'),
      ])
      if (mats) setMaterials(mats)
      if (whs) setWarehouses(whs)
    }
    load()
  }, [])

  const handleCreateBatch = async () => {
    if (!id) return
    try {
      const values = await createForm.validateFields()
      setCreateLoading(true)
      await productionService.createOutputBatch(id, {
        material_id: values.material_id,
        quantity_produced: values.quantity_produced,
        final_grade: values.final_grade || undefined,
        final_drc: values.final_drc || undefined,
        warehouse_id: values.warehouse_id || undefined,
      })
      message.success('Tạo lô thành phẩm thành công')
      setShowCreateModal(false)
      createForm.resetFields()
      loadData()
    } catch (err: any) {
      if (err.errorFields) return // validation error
      message.error(err.message || 'Không thể tạo lô thành phẩm')
    } finally {
      setCreateLoading(false)
    }
  }

  const handleQC = async () => {
    if (!qcBatchId) return
    try {
      const values = await qcForm.validateFields()
      setQcLoading(true)
      await productionService.recordOutputQC(qcBatchId, {
        drc_value: values.drc_value || undefined,
        moisture_content: values.moisture_content || undefined,
        volatile_matter: values.volatile_matter || undefined,
        ash_content: values.ash_content || undefined,
        nitrogen_content: values.nitrogen_content || undefined,
        dirt_content: values.dirt_content || undefined,
        pri_value: values.pri_value || undefined,
        mooney_value: values.mooney_value || undefined,
        color_lovibond: values.color_lovibond || undefined,
        metal_content: values.metal_content || undefined,
        notes: values.notes || undefined,
      })
      message.success('Ghi nhận QC thành công')
      setShowQcModal(false)
      setQcBatchId('')
      qcForm.resetFields()
      loadData()
    } catch (err: any) {
      if (err.errorFields) return
      message.error(err.message || 'Không thể ghi nhận QC')
    } finally {
      setQcLoading(false)
    }
  }

  const openQcModal = (batchId: string) => {
    setQcBatchId(batchId)
    qcForm.resetFields()
    setShowQcModal(true)
  }

  if (loading) {
    return <div style={{ padding: 24, textAlign: 'center', paddingTop: 100 }}><Spin size="large" /></div>
  }

  if (!order) {
    return (
      <div style={{ padding: 24 }}>
        {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} showIcon />}
        <Empty description="Không tìm thấy lệnh sản xuất" />
      </div>
    )
  }

  const totalProduced = batches.reduce((s, b) => s + (b.quantity_produced || 0), 0)
  const totalBales = batches.reduce((s, b) => s + (b.bale_count || 0), 0)
  const qcPassed = batches.filter(b => b.status === 'qc_passed').length

  const batchStatusMap: Record<string, { color: string; label: string }> = {
    created: { color: 'default', label: 'Mới' },
    qc_pending: { color: 'processing', label: 'Chờ QC' },
    qc_passed: { color: 'success', label: 'Đạt QC' },
    qc_failed: { color: 'error', label: 'Không đạt' },
    stored: { color: 'blue', label: 'Đã nhập kho' },
  }

  const columns = [
    {
      title: 'Lô',
      key: 'batch',
      render: (_: any, r: ProductionOutputBatch) => (
        <Text style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>
          {r.output_batch_no || r.stock_batch?.batch_no || r.id.slice(0, 8)}
        </Text>
      ),
    },
    {
      title: 'Grade',
      dataIndex: 'final_grade',
      key: 'final_grade',
      render: (v: string | null) => <GradeBadge grade={v} size="small" />,
    },
    {
      title: 'DRC %',
      dataIndex: 'final_drc',
      key: 'final_drc',
      align: 'right' as const,
      render: (v: number | null) => v != null ? (
        <Text style={{ fontFamily: "'JetBrains Mono', monospace", color: '#1B4D3E' }}>{v}%</Text>
      ) : '—',
    },
    {
      title: 'SL (kg)',
      dataIndex: 'quantity_produced',
      key: 'quantity_produced',
      align: 'right' as const,
      render: (v: number) => (
        <Text style={{ fontFamily: "'JetBrains Mono', monospace" }}>{v?.toLocaleString()}</Text>
      ),
    },
    {
      title: 'Số bành',
      dataIndex: 'bale_count',
      key: 'bale_count',
      align: 'right' as const,
      render: (v: number | null) => v ?? '—',
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      render: (v: string) => {
        const cfg = batchStatusMap[v] || batchStatusMap.created
        return <Tag color={cfg.color}>{cfg.label}</Tag>
      },
    },
    {
      title: 'Thao tác',
      key: 'actions',
      render: (_: any, r: ProductionOutputBatch) => (
        <Space>
          {(r.status === 'created' || r.status === 'qc_pending') && (
            <Button type="link" size="small" onClick={() => openQcModal(r.id)}>
              QC
            </Button>
          )}
          {r.status === 'qc_passed' && (
            <Button type="link" size="small" onClick={() => navigate(`/wms/stock-in/new`)}>
              Nhập kho
            </Button>
          )}
        </Space>
      ),
    },
  ]

  return (
    <div style={{ padding: 24 }}>
      {/* Back */}
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(`/wms/production/${id}`)}>
          Quay lại
        </Button>
      </Space>

      {/* Header */}
      <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
        <Col>
          <Title level={4} style={{ margin: 0, color: '#1B4D3E' }}>
            <InboxOutlined style={{ marginRight: 8 }} />
            Thành phẩm — {order.code}
          </Title>
          <Space style={{ marginTop: 4 }}>
            <Tag color={PRODUCTION_STATUS_COLORS[order.status]}>
              {PRODUCTION_STATUS_LABELS[order.status]}
            </Tag>
            <GradeBadge grade={order.target_grade} size="small" />
          </Space>
        </Col>
        <Col>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => { createForm.resetFields(); setShowCreateModal(true) }}
            style={{ background: '#1B4D3E', borderColor: '#1B4D3E' }}
          >
            Tạo lô thành phẩm
          </Button>
        </Col>
      </Row>

      {error && (
        <Alert type="error" message={error} closable onClose={() => setError(null)} style={{ marginBottom: 16, borderRadius: 8 }} showIcon />
      )}

      {/* Summary */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={6}>
          <Card bodyStyle={{ padding: 12 }}>
            <Statistic title="Số lô" value={batches.length}
              valueStyle={{ fontSize: 20, fontFamily: "'JetBrains Mono'" }} />
          </Card>
        </Col>
        <Col xs={6}>
          <Card bodyStyle={{ padding: 12 }}>
            <Statistic title="Tổng SL (kg)" value={totalProduced.toLocaleString()}
              valueStyle={{ fontSize: 20, fontFamily: "'JetBrains Mono'" }} />
          </Card>
        </Col>
        <Col xs={6}>
          <Card bodyStyle={{ padding: 12 }}>
            <Statistic title="Tổng bành" value={totalBales}
              valueStyle={{ fontSize: 20, fontFamily: "'JetBrains Mono'" }} />
          </Card>
        </Col>
        <Col xs={6}>
          <Card bodyStyle={{ padding: 12 }}>
            <Statistic title="Đạt QC" value={qcPassed} suffix={`/ ${batches.length}`}
              valueStyle={{ fontSize: 20, color: '#16A34A', fontFamily: "'JetBrains Mono'" }} />
          </Card>
        </Col>
      </Row>

      {/* Table */}
      <Card bodyStyle={{ padding: 0 }} style={{ borderRadius: 12 }}>
        <Table
          dataSource={batches}
          columns={columns}
          rowKey="id"
          size="small"
          pagination={false}
          locale={{ emptyText: <Empty description="Chưa có lô thành phẩm" /> }}
        />
      </Card>

      {/* Create batch modal */}
      <Modal
        title={<Space><PlusOutlined /> Tạo lô thành phẩm</Space>}
        open={showCreateModal}
        onCancel={() => setShowCreateModal(false)}
        onOk={handleCreateBatch}
        okText="Tạo"
        confirmLoading={createLoading}
        okButtonProps={{ style: { background: '#1B4D3E', borderColor: '#1B4D3E' } }}
      >
        <Form form={createForm} layout="vertical">
          <Form.Item name="material_id" label="Sản phẩm" rules={[{ required: true, message: 'Chọn sản phẩm' }]}>
            <Select
              placeholder="Chọn sản phẩm"
              showSearch
              optionFilterProp="label"
              options={materials.map(m => ({
                value: m.id,
                label: `${m.sku} — ${m.name}`,
              }))}
            />
          </Form.Item>
          <Form.Item name="quantity_produced" label="Sản lượng (kg)" rules={[{ required: true, message: 'Nhập sản lượng' }]}>
            <InputNumber min={0} placeholder="0" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="final_grade" label="Grade">
            <Select
              placeholder="Chọn grade"
              allowClear
              options={Object.entries(RUBBER_GRADE_LABELS).map(([value, label]) => ({
                value, label,
              }))}
            />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="final_drc" label="DRC (%)">
                <InputNumber min={0} max={100} step={0.1} placeholder="0.0" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="warehouse_id" label="Kho">
                <Select
                  placeholder="Chọn kho"
                  allowClear
                  options={warehouses.map(w => ({
                    value: w.id,
                    label: `${w.name} (${w.code})`,
                  }))}
                />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* QC modal */}
      <Modal
        title={<Space><ExperimentOutlined /> Kiểm tra chất lượng (QC)</Space>}
        open={showQcModal}
        onCancel={() => { setShowQcModal(false); setQcBatchId('') }}
        onOk={handleQC}
        okText="Ghi nhận QC"
        confirmLoading={qcLoading}
        okButtonProps={{ style: { background: '#1B4D3E', borderColor: '#1B4D3E' } }}
        width={600}
      >
        <Form form={qcForm} layout="vertical">
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="drc_value" label="DRC (%)">
                <InputNumber min={0} max={100} step={0.1} placeholder="0.0" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="moisture_content" label="Độ ẩm (%)">
                <InputNumber min={0} max={100} step={0.01} placeholder="0.00" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="volatile_matter" label="Chất bay hơi (%)">
                <InputNumber min={0} max={100} step={0.01} placeholder="0.00" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="ash_content" label="Tro (%)">
                <InputNumber min={0} max={100} step={0.01} placeholder="0.00" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="nitrogen_content" label="Nitơ (%)">
                <InputNumber min={0} max={100} step={0.01} placeholder="0.00" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="dirt_content" label="Tạp chất (%)">
                <InputNumber min={0} max={100} step={0.01} placeholder="0.00" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="pri_value" label="PRI">
                <InputNumber min={0} step={1} placeholder="0" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="mooney_value" label="Mooney">
                <InputNumber min={0} step={1} placeholder="0" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="color_lovibond" label="Màu (Lovibond)">
                <InputNumber min={0} step={0.1} placeholder="0.0" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="metal_content" label="Kim loại (ppm)">
            <InputNumber min={0} step={0.01} placeholder="0.00" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="notes" label="Ghi chú">
            <Input.TextArea rows={2} placeholder="Ghi chú QC..." />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default ProductionOutputPage
