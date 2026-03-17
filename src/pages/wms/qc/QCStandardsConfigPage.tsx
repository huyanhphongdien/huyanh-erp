// ============================================================================
// QC STANDARDS CONFIG PAGE — Ant Design + Full SVR Standards
// File: src/pages/wms/qc/QCStandardsConfigPage.tsx
// Rewrite: Tailwind -> Ant Design v6, them full SVR parameters
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Card, Table, Button, Space, Typography, Spin, Modal,
  Form, InputNumber, Select, Row, Col, Tag, message, Divider,
} from 'antd'
import {
  ArrowLeftOutlined, PlusOutlined, EditOutlined,
  SettingOutlined, ExperimentOutlined,
} from '@ant-design/icons'
import { supabase } from '../../../lib/supabase'
import qcService from '../../../services/wms/qcService'
import { rubberGradeService } from '../../../services/wms/rubberGradeService'
import type { MaterialQCStandard, RubberGradeStandard, RubberGrade } from '../../../services/wms/wms.types'
import { DRCGauge } from '../../../components/wms/QCInputForm'
import GradeBadge from '../../../components/wms/GradeBadge'

const { Title, Text } = Typography

// ============================================================================
// TYPES
// ============================================================================

interface MaterialOption { id: string; sku: string; name: string }
interface StandardRow extends MaterialQCStandard { material_name?: string; material_sku?: string }

// ============================================================================
// COMPONENT
// ============================================================================

const QCStandardsConfigPage = () => {
  const navigate = useNavigate()
  const [standards, setStandards] = useState<StandardRow[]>([])
  const [materials, setMaterials] = useState<MaterialOption[]>([])
  const [gradeStandards, setGradeStandards] = useState<RubberGradeStandard[]>([])
  const [loading, setLoading] = useState(true)

  // Modal
  const [modalOpen, setModalOpen] = useState(false)
  const [isNew, setIsNew] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [stds, mats, grades] = await Promise.all([
        qcService.getAllStandards(),
        supabase.from('materials').select('id, sku, name').eq('is_active', true).order('name').then(r => r.data || []),
        rubberGradeService.getAll(),
      ])

      // Enrich standards with material info
      const enriched: StandardRow[] = (stds as any[]).map(s => {
        const mat = (mats as MaterialOption[]).find(m => m.id === s.material_id)
        return { ...s, material_name: mat?.name || '—', material_sku: mat?.sku || '' }
      })

      setStandards(enriched)
      setMaterials(mats as MaterialOption[])
      setGradeStandards(grades)
    } catch (err) { console.error('Load standards error:', err) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // Open modal
  const handleAdd = () => {
    setIsNew(true)
    setEditingId(null)
    form.resetFields()
    form.setFieldsValue({
      drc_standard: 60, drc_min: 58, drc_max: 62,
      drc_warning_low: 59, drc_warning_high: 61,
      recheck_interval_days: 14, recheck_shortened_days: 7,
      moisture_max: 0.80, volatile_matter_max: 0.20,
      dirt_max: 0.020, ash_max: 0.50, nitrogen_max: 0.60,
      pri_min: 40, season: 'all',
    })
    setModalOpen(true)
  }

  const handleEdit = (record: StandardRow) => {
    setIsNew(false)
    setEditingId(record.material_id)
    form.setFieldsValue({
      material_id: record.material_id,
      rubber_grade: record.rubber_grade,
      drc_standard: record.drc_standard,
      drc_min: record.drc_min,
      drc_max: record.drc_max,
      drc_warning_low: record.drc_warning_low,
      drc_warning_high: record.drc_warning_high,
      recheck_interval_days: record.recheck_interval_days,
      recheck_shortened_days: record.recheck_shortened_days,
      moisture_max: record.moisture_max,
      volatile_matter_max: record.volatile_matter_max,
      dirt_max: record.dirt_max,
      ash_max: record.ash_max,
      nitrogen_max: record.nitrogen_max,
      pri_min: record.pri_min,
      mooney_max: record.mooney_max,
      color_lovibond_max: record.color_lovibond_max,
      season: record.season || 'all',
    })
    setModalOpen(true)
  }

  // Auto-fill from grade standard
  const handleGradeChange = (grade: RubberGrade) => {
    const std = gradeStandards.find(g => g.grade === grade)
    if (std) {
      form.setFieldsValue({
        drc_standard: std.drc_min,
        drc_min: std.drc_min,
        drc_max: std.drc_max || std.drc_min + 5,
        dirt_max: std.dirt_max,
        ash_max: std.ash_max,
        nitrogen_max: std.nitrogen_max,
        volatile_matter_max: std.volatile_matter_max,
        pri_min: std.pri_min,
        mooney_max: std.mooney_max,
        moisture_max: std.moisture_max,
        color_lovibond_max: std.color_lovibond_max,
      })
    }
  }

  // Save
  const handleSave = async () => {
    try {
      const values = await form.validateFields()
      setSaving(true)

      const materialId = isNew ? values.material_id : editingId!
      await qcService.upsertStandard(materialId, {
        drc_standard: values.drc_standard,
        drc_min: values.drc_min,
        drc_max: values.drc_max,
        drc_warning_low: values.drc_warning_low,
        drc_warning_high: values.drc_warning_high,
        recheck_interval_days: values.recheck_interval_days,
        recheck_shortened_days: values.recheck_shortened_days,
        rubber_grade: values.rubber_grade,
        moisture_max: values.moisture_max,
        volatile_matter_max: values.volatile_matter_max,
        dirt_max: values.dirt_max,
        ash_max: values.ash_max,
        nitrogen_max: values.nitrogen_max,
        pri_min: values.pri_min,
        mooney_max: values.mooney_max,
        color_lovibond_max: values.color_lovibond_max,
        season: values.season,
      })

      message.success(isNew ? 'Đã thêm tiêu chuẩn' : 'Đã cập nhật tiêu chuẩn')
      setModalOpen(false)
      loadData()
    } catch (err: any) {
      if (err.errorFields) return // validation error
      message.error(err.message || 'Loi luu tieu chuan')
    } finally { setSaving(false) }
  }

  // Available materials (not yet configured)
  const configuredIds = new Set(standards.map(s => s.material_id))
  const availableMaterials = materials.filter(m => !configuredIds.has(m.id))

  // Table columns
  const columns = [
    {
      title: 'Vật liệu',
      key: 'material',
      render: (_: any, r: StandardRow) => <><Text strong>{r.material_name}</Text><br/><Text type="secondary" style={{ fontSize: 11 }}>{r.material_sku}</Text></>,
    },
    { title: 'Grade', dataIndex: 'rubber_grade', key: 'grade', render: (v: string) => <GradeBadge grade={v} size="small" /> },
    {
      title: 'DRC',
      key: 'drc',
      render: (_: any, r: StandardRow) => (
        <Text style={{ fontFamily: "'JetBrains Mono'", fontSize: 12 }}>
          {r.drc_standard}% ({r.drc_min}–{r.drc_max}%)
        </Text>
      ),
    },
    { title: 'PRI min', dataIndex: 'pri_min', key: 'pri', render: (v: number) => v || '—' },
    { title: 'Moisture', dataIndex: 'moisture_max', key: 'moisture', render: (v: number) => v ? `≤${v}%` : '—' },
    { title: 'Dirt', dataIndex: 'dirt_max', key: 'dirt', render: (v: number) => v ? `≤${v}%` : '—' },
    {
      title: 'Tái kiểm',
      key: 'recheck',
      render: (_: any, r: StandardRow) => <Text type="secondary">{r.recheck_interval_days}d / {r.recheck_shortened_days}d</Text>,
    },
    { title: 'Mua', dataIndex: 'season', key: 'season', render: (v: string) => v === 'all' ? '—' : <Tag>{v}</Tag> },
    {
      title: '',
      key: 'action',
      width: 60,
      render: (_: any, r: StandardRow) => <Button type="text" icon={<EditOutlined />} onClick={() => handleEdit(r)} />,
    },
  ]

  if (loading) return <div style={{ padding: 24, textAlign: 'center', paddingTop: 100 }}><Spin size="large" /></div>

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/wms/qc')}>Quay lại</Button>
      </Space>
      <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
        <Col><Title level={4} style={{ margin: 0, color: '#1B4D3E' }}><SettingOutlined style={{ marginRight: 8 }} />Tiêu chuẩn QC</Title></Col>
        <Col><Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}
          disabled={availableMaterials.length === 0}
          style={{ background: '#1B4D3E', borderColor: '#1B4D3E' }}>Thêm tiêu chuẩn</Button></Col>
      </Row>

      {/* TCVN Reference */}
      <Card title={<Space><ExperimentOutlined /> Tiêu chuẩn SVR (TCVN 3769:2016)</Space>} size="small" style={{ marginBottom: 16 }}>
        <Table
          dataSource={gradeStandards}
          rowKey="grade"
          size="small"
          pagination={false}
          columns={[
            { title: 'Grade', dataIndex: 'grade', render: (v: string) => <GradeBadge grade={v as RubberGrade} size="small" /> },
            { title: 'DRC min', dataIndex: 'drc_min', render: (v: number) => `${v}%` },
            { title: 'Dirt max', dataIndex: 'dirt_max', render: (v: number) => `${v}%` },
            { title: 'Ash max', dataIndex: 'ash_max', render: (v: number) => `${v}%` },
            { title: 'N₂ max', dataIndex: 'nitrogen_max', render: (v: number) => `${v}%` },
            { title: 'PRI min', dataIndex: 'pri_min', render: (v: number | null) => v || '—' },
            { title: 'Moisture', dataIndex: 'moisture_max', render: (v: number) => `${v}%` },
          ]}
        />
      </Card>

      {/* Standards table */}
      <Card title={`Tiêu chuẩn da cau hinh (${standards.length})`}>
        <Table dataSource={standards} columns={columns} rowKey="id" size="small" pagination={false} />
      </Card>

      {/* Edit Modal */}
      <Modal
        title={isNew ? 'Thêm tiêu chuẩn QC' : 'Sửa tiêu chuẩn QC'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSave}
        confirmLoading={saving}
        okText="Lưu"
        cancelText="Hủy"
        width={700}
        styles={{ body: { maxHeight: '70vh', overflow: 'auto' } }}
      >
        <Form form={form} layout="vertical" requiredMark="optional">
          {isNew && (
            <Form.Item name="material_id" label="Vật liệu" rules={[{ required: true, message: 'Chọn vật liệu' }]}>
              <Select placeholder="Chọn vật liệu" showSearch optionFilterProp="label"
                options={availableMaterials.map(m => ({ value: m.id, label: `${m.sku} — ${m.name}` }))} />
            </Form.Item>
          )}

          <Form.Item name="rubber_grade" label="Grade SVR">
            <Select placeholder="Chọn grade" allowClear onChange={handleGradeChange}
              options={gradeStandards.map(g => ({ value: g.grade, label: g.grade_label }))} />
          </Form.Item>

          <Divider style={{ margin: '8px 0', fontSize: 12 }}>DRC</Divider>
          <Row gutter={16}>
            <Col span={8}><Form.Item name="drc_standard" label="DRC chuẩn (%)"><InputNumber min={0} max={100} step={0.1} style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={8}><Form.Item name="drc_min" label="Min (%)"><InputNumber min={0} max={100} step={0.1} style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={8}><Form.Item name="drc_max" label="Max (%)"><InputNumber min={0} max={100} step={0.1} style={{ width: '100%' }} /></Form.Item></Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}><Form.Item name="drc_warning_low" label="Cảnh báo thap (%)"><InputNumber min={0} max={100} step={0.1} style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={12}><Form.Item name="drc_warning_high" label="Cảnh báo cao (%)"><InputNumber min={0} max={100} step={0.1} style={{ width: '100%' }} /></Form.Item></Col>
          </Row>

          <Divider style={{ margin: '8px 0', fontSize: 12 }}>Chu kỳ tái kiểm</Divider>
          <Row gutter={16}>
            <Col span={12}><Form.Item name="recheck_interval_days" label="Bình thường (ngày)"><InputNumber min={1} max={365} style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={12}><Form.Item name="recheck_shortened_days" label="Rút ngắn (ngày)"><InputNumber min={1} max={365} style={{ width: '100%' }} /></Form.Item></Col>
          </Row>

          <Divider style={{ margin: '8px 0', fontSize: 12 }}>Tiêu chuẩn SVR bo sung</Divider>
          <Row gutter={16}>
            <Col span={8}><Form.Item name="moisture_max" label="Moisture max (%)"><InputNumber min={0} max={5} step={0.01} style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={8}><Form.Item name="volatile_matter_max" label="Volatile max (%)"><InputNumber min={0} max={5} step={0.01} style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={8}><Form.Item name="dirt_max" label="Dirt max (%)"><InputNumber min={0} max={1} step={0.001} style={{ width: '100%' }} /></Form.Item></Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}><Form.Item name="ash_max" label="Ash max (%)"><InputNumber min={0} max={5} step={0.01} style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={8}><Form.Item name="nitrogen_max" label="N₂ max (%)"><InputNumber min={0} max={5} step={0.01} style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={8}><Form.Item name="pri_min" label="PRI min"><InputNumber min={0} max={100} step={1} style={{ width: '100%' }} /></Form.Item></Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}><Form.Item name="mooney_max" label="Mooney max"><InputNumber min={0} max={200} step={1} style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={8}><Form.Item name="color_lovibond_max" label="Color Lovibond max"><InputNumber min={0} max={20} step={0.1} style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={8}><Form.Item name="season" label="Mùa vụ"><Select options={[{ value: 'all', label: 'Tất cả' }, { value: 'dry', label: 'Mùa khô' }, { value: 'rainy', label: 'Mùa mưa' }]} /></Form.Item></Col>
          </Row>
        </Form>
      </Modal>
    </div>
  )
}

export default QCStandardsConfigPage
