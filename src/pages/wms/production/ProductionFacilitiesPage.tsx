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
import PageState from '../../../components/common/PageState'
import { dichLoiHeThong } from '../../../utils/dichLoiHeThong'
import type { ProductionFacility } from '../../../services/wms/wms.types'

// ⚠ production_facilities = DÂY CHUYỀN sản xuất (seed LINE-01 "Dây chuyền 1"), KHÔNG phải bảng
//   facilities (3 nhà máy PĐ/TL/Lào) — xem multi_facility_foundation.sql. Trang này vì thế gọi là
//   "Dây chuyền sản xuất", cùng tên với menu "Dây chuyền" (audit 17/11/2026: trước có 3 tên cho 1 màn).

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
      setError(dichLoiHeThong(err, 'Không tải được danh sách dây chuyền'))
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
        message.success('Đã cập nhật dây chuyền')
      } else {
        const { error: err } = await supabase
          .from('production_facilities')
          .insert(payload)
        if (err) throw err
        message.success('Đã thêm dây chuyền')
      }

      setShowModal(false)
      form.resetFields()
      setEditingId(null)
      loadData()
    } catch (err: any) {
      if (err.errorFields) return
      message.error(dichLoiHeThong(err, 'Không lưu được dây chuyền'))
    } finally {
      setSaving(false)
    }
  }

  // Dây chuyền đã có lệnh SX (production_orders.facility_id, FK không ON DELETE) thì KHÔNG xoá được —
  // trước đây lỗi khoá ngoại Postgres hiện nguyên văn tiếng Anh. Giờ: bắt mã 23503 và mời Ngưng hoạt động.
  const ngungHoatDong = async (facility: ProductionFacility) => {
    try {
      const { error: err } = await supabase
        .from('production_facilities')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', facility.id)
      if (err) throw err
      message.success(`Đã ngưng hoạt động "${facility.name}"`)
      loadData()
    } catch (err: any) {
      message.error(dichLoiHeThong(err, 'Không ngưng hoạt động được dây chuyền'))
    }
  }

  const handleDelete = (facility: ProductionFacility) => {
    Modal.confirm({
      title: `Xoá dây chuyền "${facility.name}"?`,
      content: 'Chỉ xoá được dây chuyền CHƯA có lệnh sản xuất nào, và không hoàn tác được. Dây chuyền đã dùng thì chuyển sang Ngưng hoạt động.',
      okText: 'Xoá',
      cancelText: 'Không xoá',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          const { error: err } = await supabase
            .from('production_facilities')
            .delete()
            .eq('id', facility.id)
          if (err) throw err
          message.success('Đã xoá dây chuyền')
          loadData()
        } catch (err: any) {
          if (err?.code === '23503') {
            if (!facility.is_active) {
              message.warning(`"${facility.name}" đã có lệnh sản xuất nên không xoá được — dây chuyền đang ở trạng thái Ngưng.`)
              return
            }
            Modal.confirm({
              title: `Không xoá được "${facility.name}"`,
              content: 'Dây chuyền này đã có lệnh sản xuất nên phải giữ lại để truy xuất. Chuyển sang Ngưng hoạt động? Lệnh sản xuất mới sẽ không chọn được dây chuyền này nữa.',
              okText: 'Ngưng hoạt động',
              cancelText: 'Đóng',
              onOk: () => ngungHoatDong(facility),
            })
            return
          }
          message.error(dichLoiHeThong(err, 'Không xoá được dây chuyền'))
        }
      },
    })
  }

  const columns = [
    {
      title: 'Mã',
      dataIndex: 'code',
      key: 'code',
      render: (v: string) => (
        <Text strong style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13 }}>{v}</Text>
      ),
    },
    {
      title: 'Tên',
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
      title: 'Mẻ tối đa (kg)',
      dataIndex: 'max_batch_size_kg',
      key: 'max_batch_size_kg',
      align: 'right' as const,
      render: (v: number) => (
        <Text style={{ fontFamily: "'JetBrains Mono', monospace" }}>{v?.toLocaleString('vi-VN')}</Text>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'is_active',
      key: 'is_active',
      render: (v: boolean) => (
        <Tag color={v ? 'success' : 'default'}>{v ? 'Hoạt động' : 'Ngưng'}</Tag>
      ),
    },
    {
      title: 'Thao tác',
      key: 'actions',
      render: (_: any, r: ProductionFacility) => (
        <Space>
          <Button type="text" icon={<EditOutlined />} onClick={() => openEdit(r)} title="Sửa" />
          <Button type="text" danger icon={<DeleteOutlined />} onClick={() => handleDelete(r)} title="Xoá" />
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
            Dây chuyền sản xuất
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
            >
              Thêm dây chuyền
            </Button>
          </Space>
        </Col>
      </Row>

      <Card bodyStyle={{ padding: 0 }} style={{ borderRadius: 12 }}>
        {/* Lỗi tải → khối lỗi + Thử lại, không để bảng hiện "trống" giả */}
        {error ? (
          <PageState error={error} onRetry={loadData} />
        ) : (
        <Table
          dataSource={facilities}
          columns={columns}
          rowKey="id"
          loading={loading}
          size="small"
          pagination={false}
          locale={{ emptyText: 'Chưa có dây chuyền nào' }}
        />
        )}
      </Card>

      {/* Add/Edit modal */}
      <Modal
        title={editingId ? 'Cập nhật dây chuyền' : 'Thêm dây chuyền'}
        open={showModal}
        onCancel={() => { setShowModal(false); setEditingId(null) }}
        onOk={handleSave}
        okText={editingId ? 'Cập nhật' : 'Thêm'}
        confirmLoading={saving}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="code" label="Mã dây chuyền" rules={[{ required: true, message: 'Nhập mã dây chuyền' }]}>
            <Input placeholder="VD: LINE-01" />
          </Form.Item>
          <Form.Item name="name" label="Tên dây chuyền" rules={[{ required: true, message: 'Nhập tên dây chuyền' }]}>
            <Input placeholder="VD: Dây chuyền 1" />
          </Form.Item>
          <Form.Item name="description" label="Mô tả">
            <Input.TextArea rows={2} placeholder="Mô tả dây chuyền..." />
          </Form.Item>
          <Form.Item name="max_batch_size_kg" label="Công suất tối đa (kg/mẻ)"
            rules={[{ required: true, message: 'Nhập công suất' }]}>
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
