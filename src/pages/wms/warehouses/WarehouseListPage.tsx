// ============================================================================
// FILE: src/pages/wms/warehouses/WarehouseListPage.tsx
// MODULE: Kho Thành Phẩm (WMS) — Huy Anh Rubber ERP
// PHASE: P2 — Buoc 2.7
// REWRITE: Tailwind -> Ant Design v6
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Card,
  Table,
  Tag,
  Button,
  Space,
  Typography,
  Spin,
  Empty,
  Modal,
  Form,
  Input,
  Select,
  Progress,
  message,
  Row,
  Col,
  Statistic,
} from 'antd'
import {
  ArrowLeftOutlined,
  PlusOutlined,
  EditOutlined,
  RightOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  LoadingOutlined,
  HomeOutlined,
  SaveOutlined,
} from '@ant-design/icons'
import { supabase } from '../../../lib/supabase'

const { Title, Text } = Typography
const MONO_FONT = "'JetBrains Mono', monospace"

// ===== TYPES =====
interface Warehouse {
  id: string
  code: string
  name: string
  type: 'raw' | 'finished' | 'mixed'
  address?: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

interface LocationStats {
  total: number
  empty: number
  inUse: number
  full: number
}

// ===== CONSTANTS =====
const TYPE_LABELS: Record<string, string> = {
  finished: 'Thành phẩm',
  raw: 'Nguyên liệu',
  mixed: 'Hỗn hợp',
}

const TYPE_COLORS: Record<string, string> = {
  finished: 'green',
  raw: 'cyan',
  mixed: 'orange',
}

const TYPE_ACCENT: Record<string, string> = {
  finished: '#1B4D3E',
  raw: '#2D8B6E',
  mixed: '#E8A838',
}

// ===== WAREHOUSE FORM MODAL =====
const WarehouseFormModal: React.FC<{
  warehouseId: string | null
  open: boolean
  onClose: () => void
  onSaved: (wh: Warehouse) => void
}> = ({ warehouseId, open, onClose, onSaved }) => {
  const isEditing = !!warehouseId
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)
  const [loadingEdit, setLoadingEdit] = useState(false)

  // Load existing warehouse for edit
  useEffect(() => {
    if (!warehouseId || !open) {
      form.resetFields()
      return
    }
    setLoadingEdit(true)
    ;(async () => {
      const { data } = await supabase
        .from('warehouses')
        .select('*')
        .eq('id', warehouseId)
        .single()

      if (data) {
        form.setFieldsValue({
          code: data.code,
          name: data.name,
          type: data.type,
          address: data.address || '',
        })
      }
      setLoadingEdit(false)
    })()
  }, [warehouseId, open, form])

  const handleSave = async () => {
    try {
      const values = await form.validateFields()
      setSaving(true)

      // Check uniqueness
      const { data: existing } = await supabase
        .from('warehouses')
        .select('id')
        .eq('code', values.code.trim().toUpperCase())
        .neq('id', warehouseId || '')
        .maybeSingle()
      if (existing) {
        form.setFields([{ name: 'code', errors: ['Ma kho da ton tai'] }])
        setSaving(false)
        return
      }

      const payload = {
        code: values.code.trim().toUpperCase(),
        name: values.name.trim(),
        type: values.type,
        address: values.address?.trim() || null,
      }

      let result
      if (isEditing) {
        const { data, error } = await supabase
          .from('warehouses').update(payload).eq('id', warehouseId).select().single()
        if (error) throw error
        result = data
      } else {
        const { data, error } = await supabase
          .from('warehouses').insert(payload).select().single()
        if (error) throw error
        result = data
      }
      onSaved(result)
    } catch (err: any) {
      if (err.errorFields) return
      message.error(err.message || 'Loi khi luu')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      title={
        <Space>
          <HomeOutlined style={{ color: '#1B4D3E' }} />
          {isEditing ? 'Sửa kho' : 'Them kho moi'}
        </Space>
      }
      onCancel={onClose}
      onOk={handleSave}
      confirmLoading={saving}
      okText={isEditing ? 'Lưu' : 'Thêm kho'}
      cancelText="Hủy"
      okButtonProps={{ style: { background: '#1B4D3E', borderColor: '#1B4D3E' } }}
      destroyOnClose
    >
      {loadingEdit ? (
        <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
      ) : (
        <Form form={form} layout="vertical" initialValues={{ type: 'finished' }}>
          <Form.Item name="type" label="Loại kho" rules={[{ required: true }]}>
            <Select>
              <Select.Option value="finished">Thành phẩm</Select.Option>
              <Select.Option value="raw">Nguyên liệu</Select.Option>
              <Select.Option value="mixed">Hon hop</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="code"
            label="Mã kho"
            rules={[{ required: true, message: 'Vui lòng nhập mã kho' }]}
            extra="Ma ngan, duy nhat — tu dong viet hoa"
          >
            <Input
              placeholder="VD: KHO-A"
              style={{ fontFamily: MONO_FONT }}
              onChange={e => form.setFieldValue('code', e.target.value.toUpperCase())}
            />
          </Form.Item>

          <Form.Item
            name="name"
            label="Tên kho"
            rules={[{ required: true, message: 'Vui lòng nhập tên kho' }]}
          >
            <Input placeholder="VD: Kho thanh pham A" />
          </Form.Item>

          <Form.Item name="address" label="Dia chi / Vị trí">
            <Input placeholder="VD: Khu A — Nha may Huy Anh" />
          </Form.Item>
        </Form>
      )}
    </Modal>
  )
}

// ===== MAIN COMPONENT =====
export default function WarehouseListPage() {
  const navigate = useNavigate()
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [locationStats, setLocationStats] = useState<Record<string, LocationStats>>({})
  const [loading, setLoading] = useState(true)
  const [filterType, setFilterType] = useState('all')
  const [formOpen, setFormOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)

  // ===== LOAD DATA =====
  const loadWarehouses = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('warehouses')
        .select('*')
        .order('code')

      if (error) throw error
      setWarehouses(data || [])

      if (data && data.length > 0) {
        const statsMap: Record<string, LocationStats> = {}
        for (const wh of data) {
          const { data: locs } = await supabase
            .from('warehouse_locations')
            .select('current_quantity, capacity, is_available')
            .eq('warehouse_id', wh.id)

          if (locs) {
            const total = locs.length
            const empty = locs.filter(l => l.current_quantity === 0 && l.is_available).length
            const full = locs.filter(l => l.capacity > 0 && l.current_quantity / l.capacity >= 0.8).length
            const disabled = locs.filter(l => !l.is_available).length
            statsMap[wh.id] = { total, empty, inUse: total - empty - full - disabled, full }
          } else {
            statsMap[wh.id] = { total: 0, empty: 0, inUse: 0, full: 0 }
          }
        }
        setLocationStats(statsMap)
      }
    } catch (err) {
      console.error('Load warehouses error:', err)
      message.error('Không thể tải danh sach kho')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadWarehouses() }, [loadWarehouses])

  // ===== FILTER =====
  const filtered = warehouses.filter(w =>
    filterType === 'all' || w.type === filterType
  )

  // ===== HANDLERS =====
  const handleSaved = (wh: Warehouse) => {
    if (editId) {
      setWarehouses(prev => prev.map(w => w.id === wh.id ? wh : w))
      message.success(`Đã cập nhật "${wh.name}"`)
    } else {
      setWarehouses(prev => [...prev, wh])
      message.success(`Da them "${wh.name}"`)
    }
    setFormOpen(false)
    setEditId(null)
  }

  // ===== TABLE COLUMNS =====
  const columns = [
    {
      title: 'Mã kho',
      dataIndex: 'code',
      key: 'code',
      width: 100,
      render: (val: string, r: Warehouse) => (
        <div>
          <Text strong style={{ fontFamily: MONO_FONT, color: '#1B4D3E' }}>{val}</Text>
          {!r.is_active && <Tag style={{ marginLeft: 4 }}>Ngung</Tag>}
        </div>
      ),
    },
    {
      title: 'Tên kho',
      dataIndex: 'name',
      key: 'name',
      render: (val: string, r: Warehouse) => (
        <div>
          <Text strong style={{ fontSize: 14 }}>{val}</Text>
          {r.address && <div><Text type="secondary" style={{ fontSize: 12 }}>{r.address}</Text></div>}
        </div>
      ),
    },
    {
      title: 'Loại',
      dataIndex: 'type',
      key: 'type',
      width: 100,
      render: (val: string) => (
        <Tag color={TYPE_COLORS[val] || 'default'}>{TYPE_LABELS[val] || val}</Tag>
      ),
    },
    {
      title: 'Vị trí',
      key: 'stats',
      width: 220,
      render: (_: any, r: Warehouse) => {
        const stats = locationStats[r.id] || { total: 0, empty: 0, inUse: 0, full: 0 }
        if (stats.total === 0) return <Text type="secondary" style={{ fontSize: 12 }}>Chưa có vị trí</Text>

        const usagePercent = Math.round(((stats.total - stats.empty) / stats.total) * 100)
        return (
          <div>
            <Progress
              percent={usagePercent}
              size="small"
              strokeColor={usagePercent > 80 ? '#ff4d4f' : usagePercent > 50 ? '#faad14' : '#52c41a'}
              format={p => <Text style={{ fontFamily: MONO_FONT, fontSize: 11 }}>{p}%</Text>}
              style={{ marginBottom: 4 }}
            />
            <Space size={4} wrap>
              <Tag style={{ fontSize: 10, margin: 0 }}>Tong: <b>{stats.total}</b></Tag>
              <Tag color="green" style={{ fontSize: 10, margin: 0 }}>Trong: <b>{stats.empty}</b></Tag>
              <Tag color="orange" style={{ fontSize: 10, margin: 0 }}>Dung: <b>{stats.inUse}</b></Tag>
              <Tag color="red" style={{ fontSize: 10, margin: 0 }}>Day: <b>{stats.full}</b></Tag>
            </Space>
          </div>
        )
      },
    },
    {
      title: '',
      key: 'actions',
      width: 80,
      render: (_: any, r: Warehouse) => (
        <Space>
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            onClick={(e) => { e.stopPropagation(); setEditId(r.id); setFormOpen(true) }}
          />
          <Button
            type="text"
            size="small"
            icon={<RightOutlined />}
            onClick={() => navigate(`/wms/warehouses/${r.id}/locations`)}
          />
        </Space>
      ),
    },
  ]

  // ===== RENDER =====
  return (
    <div style={{ minHeight: '100vh', background: '#F7F5F2' }}>
      {/* Header */}
      <div style={{ background: '#fff', borderBottom: '1px solid #f0f0f0', padding: '12px 16px' }}>
        <Space align="center" style={{ width: '100%', justifyContent: 'space-between' }}>
          <Space>
            <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)} />
            <div>
              <Title level={5} style={{ margin: 0 }}>Kho & Vị trí</Title>
              <Text type="secondary" style={{ fontSize: 12 }}>{warehouses.length} kho</Text>
            </div>
          </Space>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => { setEditId(null); setFormOpen(true) }}
            style={{ background: '#1B4D3E', borderColor: '#1B4D3E' }}
          >
            Them kho
          </Button>
        </Space>
      </div>

      {/* Filter chips */}
      <div style={{ padding: '12px 16px' }}>
        <Space size={8}>
          {[
            { value: 'all', label: 'Tất cả' },
            { value: 'finished', label: 'Thành phẩm' },
            { value: 'raw', label: 'Nguyên liệu' },
            { value: 'mixed', label: 'Hỗn hợp' },
          ].map(f => (
            <Button
              key={f.value}
              type={filterType === f.value ? 'primary' : 'default'}
              size="small"
              onClick={() => setFilterType(f.value)}
              style={filterType === f.value ? { background: '#1B4D3E', borderColor: '#1B4D3E' } : {}}
            >
              {f.label}
            </Button>
          ))}
        </Space>
      </div>

      {/* Content */}
      <div style={{ padding: '0 16px 24px' }}>
        <Card size="small" bodyStyle={{ padding: 0 }}>
          <Table
            dataSource={filtered}
            columns={columns}
            rowKey="id"
            size="small"
            loading={loading}
            pagination={false}
            onRow={(record) => ({
              onClick: () => navigate(`/wms/warehouses/${record.id}/locations`),
              style: {
                cursor: 'pointer',
                opacity: record.is_active ? 1 : 0.5,
                borderLeft: `4px solid ${TYPE_ACCENT[record.type] || '#d9d9d9'}`,
              },
            })}
            locale={{
              emptyText: (
                <Empty description="Chưa có kho nao">
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={() => { setEditId(null); setFormOpen(true) }}
                    style={{ background: '#1B4D3E', borderColor: '#1B4D3E' }}
                  >
                    Them kho
                  </Button>
                </Empty>
              ),
            }}
          />
        </Card>
      </div>

      {/* Warehouse Form Modal */}
      <WarehouseFormModal
        warehouseId={editId}
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditId(null) }}
        onSaved={handleSaved}
      />
    </div>
  )
}
