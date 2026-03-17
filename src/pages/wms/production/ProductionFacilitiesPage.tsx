// ============================================================================
// PRODUCTION FACILITIES PAGE — Ant Design CRUD
// File: src/pages/wms/production/ProductionFacilitiesPage.tsx
// Module: Kho Thành Phẩm (WMS) - Huy Anh Rubber ERP
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Card,
  Table,
  Tag,
  Button,
  Space,
  Typography,
  Row,
  Col,
  Modal,
  Form,
  Input,
  InputNumber,
  Switch,
  Alert,
  message,
} from 'antd'
import {
  ArrowLeftOutlined,
  PlusOutlined,
  ReloadOutlined,
  EditOutlined,
  DeleteOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import { supabase } from '../../../lib/supabase'
import productionService from '../../../services/wms/productionService'
import type { ProductionFacility } from '../../../services/wms/wms.types'

const { Title, Text } = Typography

// ============================================================================
// COMPONENT
// ============================================================================

const ProductionFacilitiesPage = () => {
  const navigate = useNavigate()

  const [facilities, setFacilities] = useState<ProductionFacility[]>([])
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
      // Load all facilities (including inactive)
      const { data, error: err } = await supabase
        .from('production_facilities')
        .select('*')
        .order('code', { ascending: true })
      if (err) throw err
      setFacilities((data || []) as ProductionFacility[])
    } catch (err: any) {
      setError(err.message || 'Không thể tải du lieu')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const openCreate = () => {
    setEditingId(null)
    form.resetFields()
    form.setFieldsValue({ is_active: true })
    setShowModal(true)
  }

  const openEdit = (facility: ProductionFacility) => {
    setEditingId(facility.id)
    form.setFieldsValue({
      code: facility.code,
      name: facility.name,
      description: facility.description,
      max_batch_size_kg: facility.max_batch_size_kg,
      is_active: facility.is_active,
    })
    setShowModal(true)
  }

  const handleSave = async () => {
    try {
      const values = await form.validateFields()
      setSaving(true)

      const payload = {
        code: values.code,
        name: values.name,
        description: values.description || null,
        max_batch_size_kg: values.max_batch_size_kg,
        is_active: values.is_active,
        updated_at: new Date().toISOString(),
      }

      if (editingId) {
        const { error: err } = await supabase
          .from('production_facilities')
          .update(payload)
          .eq('id', editingId)
        if (err) throw err
        message.success('Cập nhật nhà máy thành công')
      } else {
        const { error: err } = await supabase
          .from('production_facilities')
          .insert(payload)
        if (err) throw err
        message.success('Them nha may thanh cong')
      }

      setShowModal(false)
      form.resetFields()
      setEditingId(null)
      loadData()
    } catch (err: any) {
      if (err.errorFields) return
      message.error(err.message || 'Không thể lưu')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = (facility: ProductionFacility) => {
    Modal.confirm({
      title: `Xoa nha may "${facility.name}"?`,
      content: 'Hanh dong nay khong the hoan tac.',
      okText: 'Xoa',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          const { error: err } = await supabase
            .from('production_facilities')
            .delete()
            .eq('id', facility.id)
          if (err) throw err
          message.success('Đã xóa nhà máy')
          loadData()
        } catch (err: any) {
          message.error(err.message || 'Không thể xóa')
        }
      },
    })
  }

  const columns = [
    {
      title: 'Ma',
      dataIndex: 'code',
      key: 'code',
      render: (v: string) => (
        <Text strong style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13 }}>{v}</Text>
      ),
    },
    {
      title: 'Ten',
      dataIndex: 'name',
      key: 'name',
      render: (v: string) => <Text strong>{v}</Text>,
    },
    {
      title: 'Mô tả',
      dataIndex: 'description',
      key: 'description',
      render: (v: string | null) => <Text type="secondary">{v || '—'}</Text>,
    },
    {
      title: 'Max batch (kg)',
      dataIndex: 'max_batch_size_kg',
      key: 'max_batch_size_kg',
      align: 'right' as const,
      render: (v: number) => (
        <Text style={{ fontFamily: "'JetBrains Mono', monospace" }}>{v?.toLocaleString()}</Text>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'is_active',
      key: 'is_active',
      render: (v: boolean) => (
        <Tag color={v ? 'success' : 'default'}>{v ? 'Hoạt động' : 'Ngung'}</Tag>
      ),
    },
    {
      title: 'Thao tác',
      key: 'actions',
      render: (_: any, r: ProductionFacility) => (
        <Space>
          <Button type="text" icon={<EditOutlined />} onClick={() => openEdit(r)} />
          <Button type="text" danger icon={<DeleteOutlined />} onClick={() => handleDelete(r)} />
        </Space>
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
            <SettingOutlined style={{ marginRight: 8 }} />
            Nha may san xuat
          </Title>
        </Col>
        <Col>
          <Space>
            <Button icon={<ReloadOutlined />} onClick={loadData} loading={loading}>
              Làm mới
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={openCreate}
              style={{ background: '#1B4D3E', borderColor: '#1B4D3E' }}
            >
              Them nha may
            </Button>
          </Space>
        </Col>
      </Row>

      {error && (
        <Alert type="error" message={error} closable onClose={() => setError(null)} style={{ marginBottom: 16, borderRadius: 8 }} showIcon />
      )}

      <Card bodyStyle={{ padding: 0 }} style={{ borderRadius: 12 }}>
        <Table
          dataSource={facilities}
          columns={columns}
          rowKey="id"
          loading={loading}
          size="small"
          pagination={false}
        />
      </Card>

      {/* Add/Edit modal */}
      <Modal
        title={editingId ? 'Cập nhật nhà máy' : 'Them nha may'}
        open={showModal}
        onCancel={() => { setShowModal(false); setEditingId(null) }}
        onOk={handleSave}
        okText={editingId ? 'Cập nhật' : 'Them'}
        confirmLoading={saving}
        okButtonProps={{ style: { background: '#1B4D3E', borderColor: '#1B4D3E' } }}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="code" label="Mã nhà máy" rules={[{ required: true, message: 'Nhap ma nha may' }]}>
            <Input placeholder="VD: NM01" />
          </Form.Item>
          <Form.Item name="name" label="Ten nha may" rules={[{ required: true, message: 'Nhap ten nha may' }]}>
            <Input placeholder="VD: Nha may 1 - Binh Phuoc" />
          </Form.Item>
          <Form.Item name="description" label="Mô tả">
            <Input.TextArea rows={2} placeholder="Mo ta nha may..." />
          </Form.Item>
          <Form.Item name="max_batch_size_kg" label="Cong suat toi da (kg/batch)"
            rules={[{ required: true, message: 'Nhap cong suat' }]}>
            <InputNumber min={0} placeholder="0" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="is_active" label="Trạng thái" valuePropName="checked">
            <Switch checkedChildren="Hoạt động" unCheckedChildren="Ngưng" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default ProductionFacilitiesPage
