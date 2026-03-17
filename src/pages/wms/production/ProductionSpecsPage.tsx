// ============================================================================
// PRODUCTION SPECS PAGE — Ant Design
// File: src/pages/wms/production/ProductionSpecsPage.tsx
// Module: Kho Thành Phẩm (WMS) - Huy Anh Rubber ERP
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Card,
  Table,
  Button,
  Space,
  Typography,
  Row,
  Col,
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  Alert,
  message,
} from 'antd'
import {
  ArrowLeftOutlined,
  ReloadOutlined,
  EditOutlined,
  FileTextOutlined,
} from '@ant-design/icons'
import { supabase } from '../../../lib/supabase'
import productionService from '../../../services/wms/productionService'
import GradeBadge from '../../../components/wms/GradeBadge'
import type { ProductionMaterialSpec } from '../../../services/wms/wms.types'
import { RUBBER_GRADE_LABELS } from '../../../services/wms/wms.types'

const { Title, Text } = Typography

// ============================================================================
// COMPONENT
// ============================================================================

const ProductionSpecsPage = () => {
  const navigate = useNavigate()

  const [specs, setSpecs] = useState<ProductionMaterialSpec[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Modal
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm()

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await productionService.getMaterialSpecs()
      setSpecs(data)
    } catch (err: any) {
      setError(err.message || 'Không thể tải du lieu')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const openEdit = (spec: ProductionMaterialSpec) => {
    setEditingId(spec.id)
    form.setFieldsValue({
      target_product_grade: spec.target_product_grade,
      target_drc_min: spec.target_drc_min,
      target_drc_max: spec.target_drc_max,
      expected_yield_percent: spec.expected_yield_percent,
      optimal_input_drc_min: spec.optimal_input_drc_min,
      optimal_input_drc_max: spec.optimal_input_drc_max,
      washing_duration_hours: spec.washing_duration_hours,
      washing_water_ratio: spec.washing_water_ratio,
      creeping_duration_hours: spec.creeping_duration_hours,
      drying_duration_days: spec.drying_duration_days,
      drying_temperature_target: spec.drying_temperature_target,
      pressing_duration_hours: spec.pressing_duration_hours,
      notes: spec.notes,
    })
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!editingId) return
    try {
      const values = await form.validateFields()
      setSaving(true)

      const { error: err } = await supabase
        .from('production_material_specs')
        .update({
          target_drc_min: values.target_drc_min,
          target_drc_max: values.target_drc_max || null,
          expected_yield_percent: values.expected_yield_percent,
          optimal_input_drc_min: values.optimal_input_drc_min || null,
          optimal_input_drc_max: values.optimal_input_drc_max || null,
          washing_duration_hours: values.washing_duration_hours || null,
          washing_water_ratio: values.washing_water_ratio || null,
          creeping_duration_hours: values.creeping_duration_hours || null,
          drying_duration_days: values.drying_duration_days || null,
          drying_temperature_target: values.drying_temperature_target || null,
          pressing_duration_hours: values.pressing_duration_hours || null,
          notes: values.notes || null,
        })
        .eq('id', editingId)

      if (err) throw err

      message.success('Cập nhật định mức thành công')
      setShowModal(false)
      setEditingId(null)
      form.resetFields()
      loadData()
    } catch (err: any) {
      if (err.errorFields) return
      message.error(err.message || 'Không thể cập nhật')
    } finally {
      setSaving(false)
    }
  }

  const columns = [
    {
      title: 'Grade',
      dataIndex: 'target_product_grade',
      key: 'target_product_grade',
      render: (v: string) => <GradeBadge grade={v} size="small" />,
    },
    {
      title: 'DRC min (%)',
      dataIndex: 'target_drc_min',
      key: 'target_drc_min',
      align: 'right' as const,
      render: (v: number) => (
        <Text style={{ fontFamily: "'JetBrains Mono', monospace" }}>{v}</Text>
      ),
    },
    {
      title: 'DRC max (%)',
      dataIndex: 'target_drc_max',
      key: 'target_drc_max',
      align: 'right' as const,
      render: (v: number | null) => v != null ? (
        <Text style={{ fontFamily: "'JetBrains Mono', monospace" }}>{v}</Text>
      ) : '—',
    },
    {
      title: 'Yield (%)',
      dataIndex: 'expected_yield_percent',
      key: 'expected_yield_percent',
      align: 'right' as const,
      render: (v: number) => (
        <Text strong style={{ fontFamily: "'JetBrains Mono', monospace", color: '#E8A838' }}>{v}%</Text>
      ),
    },
    {
      title: 'DRC NL tối ưu',
      key: 'optimal_drc',
      align: 'right' as const,
      render: (_: any, r: ProductionMaterialSpec) => {
        if (!r.optimal_input_drc_min && !r.optimal_input_drc_max) return '—'
        return (
          <Text style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            {r.optimal_input_drc_min || '?'}% — {r.optimal_input_drc_max || '?'}%
          </Text>
        )
      },
    },
    {
      title: 'Rua (h)',
      dataIndex: 'washing_duration_hours',
      key: 'washing_duration_hours',
      align: 'right' as const,
      render: (v: number | null) => v != null ? (
        <Text style={{ fontFamily: "'JetBrains Mono', monospace" }}>{v}</Text>
      ) : '—',
    },
    {
      title: 'Keo (h)',
      dataIndex: 'creeping_duration_hours',
      key: 'creeping_duration_hours',
      align: 'right' as const,
      render: (v: number | null) => v != null ? (
        <Text style={{ fontFamily: "'JetBrains Mono', monospace" }}>{v}</Text>
      ) : '—',
    },
    {
      title: 'Say (ngay)',
      dataIndex: 'drying_duration_days',
      key: 'drying_duration_days',
      align: 'right' as const,
      render: (v: number | null) => v != null ? (
        <Text style={{ fontFamily: "'JetBrains Mono', monospace" }}>{v}</Text>
      ) : '—',
    },
    {
      title: 'Ep (h)',
      dataIndex: 'pressing_duration_hours',
      key: 'pressing_duration_hours',
      align: 'right' as const,
      render: (v: number | null) => v != null ? (
        <Text style={{ fontFamily: "'JetBrains Mono', monospace" }}>{v}</Text>
      ) : '—',
    },
    {
      title: '',
      key: 'actions',
      render: (_: any, r: ProductionMaterialSpec) => (
        <Button type="text" icon={<EditOutlined />} onClick={() => openEdit(r)} />
      ),
    },
  ]

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
        <Col>
          <Space>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/wms/production')}>
              Quay lại
            </Button>
          </Space>
          <Title level={4} style={{ margin: '8px 0 0', color: '#1B4D3E' }}>
            <FileTextOutlined style={{ marginRight: 8 }} />
            Dinh muc san xuat
          </Title>
        </Col>
        <Col>
          <Button icon={<ReloadOutlined />} onClick={loadData} loading={loading}>
            Làm mới
          </Button>
        </Col>
      </Row>

      {error && (
        <Alert type="error" message={error} closable onClose={() => setError(null)} style={{ marginBottom: 16, borderRadius: 8 }} showIcon />
      )}

      <Card bodyStyle={{ padding: 0 }} style={{ borderRadius: 12 }}>
        <Table
          dataSource={specs}
          columns={columns}
          rowKey="id"
          loading={loading}
          size="small"
          pagination={false}
          locale={{ emptyText: 'Chưa có dinh muc' }}
        />
      </Card>

      {/* Edit modal */}
      <Modal
        title="Cập nhật định mức"
        open={showModal}
        onCancel={() => { setShowModal(false); setEditingId(null) }}
        onOk={handleSave}
        okText="Cập nhật"
        confirmLoading={saving}
        okButtonProps={{ style: { background: '#1B4D3E', borderColor: '#1B4D3E' } }}
        width={640}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="target_product_grade" label="Grade">
            <Select disabled options={Object.entries(RUBBER_GRADE_LABELS).map(([v, l]) => ({ value: v, label: l }))} />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="target_drc_min" label="DRC min (%)" rules={[{ required: true, message: 'Nhap DRC min' }]}>
                <InputNumber min={0} max={100} step={0.1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="target_drc_max" label="DRC max (%)">
                <InputNumber min={0} max={100} step={0.1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="expected_yield_percent" label="Yield mong doi (%)" rules={[{ required: true, message: 'Nhập yield' }]}>
                <InputNumber min={0} max={100} step={0.1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="optimal_input_drc_min" label="DRC NL min (%)">
                <InputNumber min={0} max={100} step={0.1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="optimal_input_drc_max" label="DRC NL max (%)">
                <InputNumber min={0} max={100} step={0.1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Title level={5} style={{ marginTop: 8 }}>Thoi gian cong doan</Title>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="washing_duration_hours" label="Rua (gio)">
                <InputNumber min={0} step={0.5} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="washing_water_ratio" label="Ti le nuoc rua">
                <InputNumber min={0} step={0.1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="creeping_duration_hours" label="Keo/tan (gio)">
                <InputNumber min={0} step={0.5} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="drying_duration_days" label="Say (ngay)">
                <InputNumber min={0} step={0.5} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="drying_temperature_target" label="Nhiet do say (°C)">
                <InputNumber min={0} max={200} step={1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="pressing_duration_hours" label="Ep (gio)">
                <InputNumber min={0} step={0.5} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="notes" label="Ghi chú">
            <Input.TextArea rows={2} placeholder="Ghi chú dinh muc..." />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default ProductionSpecsPage
