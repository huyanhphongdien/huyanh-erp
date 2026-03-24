// ============================================================================
// FILE: src/pages/wms/materials/MaterialListPage.tsx
// MODULE: Kho Thành Phẩm (WMS) — Huy Anh Rubber ERP
// PHASE: P2 — Buoc 2.5 + 2.6 (List + Form tich hop)
// REWRITE: Tailwind -> Ant Design v6
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react'
import {
  Card,
  Table,
  Tag,
  Button,
  Space,
  Input,
  Select,
  Typography,
  Spin,
  Empty,
  Modal,
  Form,
  InputNumber,
  Progress,
  message,
  Tooltip,
} from 'antd'
import {
  PlusOutlined,
  SearchOutlined,
  CloseOutlined,
  TagOutlined,
  ExclamationCircleOutlined,
  ClockCircleOutlined,
  SaveOutlined,
  EditOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import { supabase } from '../../../lib/supabase'
import GradeBadge from '../../../components/wms/GradeBadge'

const { Title, Text } = Typography
const MONO_FONT = "'JetBrains Mono', monospace"

// ============================================================================
// TYPES
// ============================================================================

interface MaterialCategory {
  id: string
  name: string
  type: 'raw' | 'finished'
}

interface Material {
  id: string
  sku: string
  name: string
  type: 'raw' | 'finished'
  category_id?: string
  category?: MaterialCategory
  unit: string
  weight_per_unit?: number
  min_stock: number
  max_stock?: number
  shelf_life_days?: number
  description?: string
  image_url?: string
  is_active: boolean
  created_at: string
  updated_at: string
  current_stock?: number
  rubber_grade?: string
}

// ============================================================================
// CONSTANTS
// ============================================================================

const PRODUCT_FILTERS = [
  { key: 'all', label: 'Tất cả' },
  { key: 'SVR3L', label: 'SVR 3L', search: 'SVR 3L' },
  { key: 'SVR5', label: 'SVR 5', search: 'SVR 5' },
  { key: 'SVR10', label: 'SVR 10', search: 'SVR 10' },
  { key: 'SVR20', label: 'SVR 20', search: 'SVR 20' },
  { key: 'LATEX', label: 'Latex', search: 'Latex' },
] as const

const TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  finished: { label: 'Thành phẩm', color: 'green' },
  raw: { label: 'Nguyên liệu', color: 'orange' },
}

const PAGE_SIZE = 20

// ============================================================================
// MATERIAL FORM MODAL
// ============================================================================

interface FormData {
  name: string
  sku: string
  category_id: string
  unit_id: string
  weight_per_unit: number | null
  min_stock: number
  max_stock: number | null
  shelf_life_days: number | null
  description: string
}

interface LookupItem {
  id: string
  name: string
  code?: string
  symbol?: string
}

const INITIAL_FORM: FormData = {
  name: '',
  sku: '',
  category_id: '',
  unit_id: '',
  weight_per_unit: 33.33,
  min_stock: 0,
  max_stock: null,
  shelf_life_days: 365,
  description: '',
}

const MaterialFormModal: React.FC<{
  materialId: string | null
  onClose: () => void
  onSaved: () => void
}> = ({ materialId, onClose, onSaved }) => {
  const isOpen = materialId !== null
  const isCreate = materialId === 'new'

  const [form] = Form.useForm()
  const [loadingForm, setLoadingForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [categories, setCategories] = useState<LookupItem[]>([])
  const [units, setUnits] = useState<LookupItem[]>([])

  // Load lookups
  useEffect(() => {
    if (!isOpen) return
    const loadLookups = async () => {
      try {
        const [catsRes, unitsRes] = await Promise.all([
          supabase.from('material_categories').select('id, name').eq('is_active', true).order('name'),
          supabase.from('units').select('id, name, symbol').eq('is_active', true).order('name'),
        ])
        if (catsRes.data) setCategories(catsRes.data)
        if (unitsRes.data) setUnits(unitsRes.data)
      } catch (err) {
        console.error('Loi tai danh muc:', err)
      }
    }
    loadLookups()
  }, [isOpen])

  // Load material for edit
  useEffect(() => {
    if (!isOpen) return
    if (isCreate) {
      form.resetFields()
      return
    }

    const loadMaterial = async () => {
      setLoadingForm(true)
      try {
        const { data, error } = await supabase
          .from('materials')
          .select('*')
          .eq('id', materialId)
          .single()

        if (error) throw error
        if (data) {
          form.setFieldsValue({
            name: data.name || '',
            sku: data.sku || '',
            category_id: data.category_id || undefined,
            unit_id: undefined,
            weight_per_unit: data.weight_per_unit || null,
            min_stock: data.min_stock || 0,
            max_stock: data.max_stock || null,
            shelf_life_days: data.shelf_life_days || null,
            description: data.description || '',
          })
        }
      } catch (err) {
        console.error('Loi tai thanh pham:', err)
        message.error('Không thể tải thông tin sản phẩm')
      } finally {
        setLoadingForm(false)
      }
    }
    loadMaterial()
  }, [materialId, isOpen, isCreate, form])

  // Submit
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      setSaving(true)

      const payload: Record<string, unknown> = {
        name: values.name.trim(),
        sku: values.sku.trim().toUpperCase(),
        type: 'finished' as const,
        category_id: values.category_id || null,
        unit: units.find(u => u.id === values.unit_id)?.symbol || 'banh',
        weight_per_unit: values.weight_per_unit || null,
        min_stock: values.min_stock || 0,
        max_stock: values.max_stock || null,
        shelf_life_days: values.shelf_life_days || null,
        description: values.description?.trim() || null,
      }

      if (isCreate) {
        const { data: existing } = await supabase
          .from('materials')
          .select('id')
          .eq('sku', payload.sku as string)
          .maybeSingle()

        if (existing) {
          form.setFields([{ name: 'sku', errors: [`SKU "${payload.sku}" đã tồn tại`] }])
          setSaving(false)
          return
        }

        const { error } = await supabase.from('materials').insert(payload)
        if (error) throw error
        message.success(`Đã tạo ${values.name}`)
      } else {
        const { error } = await supabase.from('materials').update(payload).eq('id', materialId)
        if (error) throw error
        message.success(`Đã cập nhật ${values.name}`)
      }

      setTimeout(() => onSaved(), 300)
    } catch (err: any) {
      if (err.errorFields) return // validation error
      console.error('Loi luu:', err)
      message.error(err.message || 'Không thể lưu sản phẩm')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={isOpen}
      title={isCreate ? 'Thêm thành phẩm mới' : 'Sửa thành phẩm'}
      onCancel={onClose}
      onOk={handleSubmit}
      confirmLoading={saving}
      okText={isCreate ? 'Tạo thành phẩm' : 'Lưu thay đổi'}
      cancelText="Hủy"
      okButtonProps={{ style: { background: '#1B4D3E', borderColor: '#1B4D3E' } }}
      destroyOnClose
      width={520}
    >
      {loadingForm ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin />
        </div>
      ) : (
        <Form
          form={form}
          layout="vertical"
          initialValues={INITIAL_FORM}
        >
          <Form.Item
            name="sku"
            label="Mã SKU"
            rules={[{ required: true, message: 'Vui lòng nhập mã SKU' }]}
            extra="VD: TP-SVR10"
          >
            <Input
              placeholder="TP-SVR10"
              style={{ fontFamily: MONO_FONT }}
              onChange={e => form.setFieldValue('sku', e.target.value.toUpperCase())}
            />
          </Form.Item>

          <Form.Item
            name="name"
            label="Tên sản phẩm"
            rules={[{ required: true, message: 'Vui lòng nhập tên sản phẩm' }]}
          >
            <Input placeholder="Cao su SVR 10" />
          </Form.Item>

          <Form.Item name="category_id" label="Nhóm sản phẩm">
            <Select placeholder="— Chọn nhóm —" allowClear>
              {categories.map(c => (
                <Select.Option key={c.id} value={c.id}>{c.name}</Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item name="unit_id" label="Đơn vị tính">
            <Select placeholder="— Chọn đơn vị —" allowClear>
              {units.map(u => (
                <Select.Option key={u.id} value={u.id}>
                  {u.name}{u.symbol ? ` (${u.symbol})` : ''}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="weight_per_unit"
            label="Khối lượng / đơn vị (kg)"
          >
            <InputNumber
              placeholder="33.33"
              step={0.01}
              style={{ width: '100%' }}
            />
          </Form.Item>

          <Form.Item name="min_stock" label="Tồn tối thiểu">
            <InputNumber placeholder="0" min={0} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item name="max_stock" label="Tồn tối đa">
            <InputNumber placeholder="Không giới hạn" min={0} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item name="shelf_life_days" label="Hạn sử dụng (ngày)">
            <InputNumber placeholder="365" min={0} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item name="description" label="Mô tả">
            <Input.TextArea placeholder="Ghi chú về sản phẩm..." rows={3} />
          </Form.Item>
        </Form>
      )}
    </Modal>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const MaterialListPage: React.FC = () => {
  const [materials, setMaterials] = useState<Material[]>([])
  const [loading, setLoading] = useState(true)
  const [searchText, setSearchText] = useState('')
  const [productFilter, setProductFilter] = useState<string>('all')
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [formMaterialId, setFormMaterialId] = useState<string | null>(null)

  // Debounced search
  const [debouncedSearch, setDebouncedSearch] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchText), 300)
    return () => clearTimeout(timer)
  }, [searchText])

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const hasActiveFilter = productFilter !== 'all' || debouncedSearch.length > 0

  // Fetch data
  const fetchMaterials = useCallback(async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('materials')
        .select('*, category:material_categories(id, name, type)', { count: 'exact' })
        .eq('type', 'finished')
        .eq('is_active', true)
        .order('sku')
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)

      if (debouncedSearch) {
        query = query.or(`name.ilike.%${debouncedSearch}%,sku.ilike.%${debouncedSearch}%`)
      }

      if (productFilter !== 'all') {
        const filterConf = PRODUCT_FILTERS.find(f => f.key === productFilter)
        if (filterConf && 'search' in filterConf) {
          query = query.ilike('name', `%${filterConf.search}%`)
        }
      }

      const { data, count, error } = await query
      if (error) throw error

      const materialsWithStock: Material[] = (data || []).map(m => ({
        ...m,
        current_stock: 0,
      }))

      setMaterials(materialsWithStock)
      setTotal(count || 0)
    } catch (err) {
      console.error('Loi tai danh sach:', err)
    } finally {
      setLoading(false)
    }
  }, [debouncedSearch, productFilter, page])

  useEffect(() => {
    fetchMaterials()
  }, [fetchMaterials])

  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, productFilter])

  // Table columns
  const columns = [
    {
      title: 'SKU',
      dataIndex: 'sku',
      key: 'sku',
      width: 120,
      render: (val: string) => (
        <Text strong style={{ fontFamily: MONO_FONT, color: '#1B4D3E', fontSize: 13 }}>{val}</Text>
      ),
    },
    {
      title: 'Tên sản phẩm',
      dataIndex: 'name',
      key: 'name',
      ellipsis: true,
      render: (val: string, r: Material) => (
        <div>
          <Text strong style={{ fontSize: 14 }}>{val}</Text>
          {r.category && (
            <div>
              <Tag icon={<TagOutlined />} style={{ fontSize: 11, marginTop: 2 }}>
                {r.category.name}
              </Tag>
            </div>
          )}
        </div>
      ),
    },
    {
      title: 'Loại',
      dataIndex: 'type',
      key: 'type',
      width: 100,
      render: (val: string) => {
        const conf = TYPE_CONFIG[val] || TYPE_CONFIG.finished
        return <Tag color={conf.color}>{conf.label}</Tag>
      },
    },
    {
      title: 'Grade',
      dataIndex: 'rubber_grade',
      key: 'rubber_grade',
      width: 90,
      render: (val: string) => <GradeBadge grade={val} size="small" />,
    },
    {
      title: 'Đơn vị',
      key: 'unit_info',
      width: 100,
      render: (_: any, r: Material) => (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {r.weight_per_unit ? `${r.weight_per_unit} kg/${r.unit}` : r.unit}
        </Text>
      ),
    },
    {
      title: 'HSD',
      dataIndex: 'shelf_life_days',
      key: 'shelf_life',
      width: 80,
      render: (val: number) => val ? (
        <Space size={4}>
          <ClockCircleOutlined style={{ color: '#999', fontSize: 12 }} />
          <Text type="secondary" style={{ fontSize: 12 }}>{val} ngày</Text>
        </Space>
      ) : '—',
    },
    {
      title: 'Tồn kho',
      key: 'stock',
      width: 150,
      render: (_: any, r: Material) => {
        const current = r.current_stock || 0
        const isLow = r.min_stock > 0 && current < r.min_stock
        const ratio = r.max_stock && r.max_stock > 0 ? current / r.max_stock : r.min_stock > 0 ? current / (r.min_stock * 3) : 0.5
        const capped = Math.min(ratio, 1)

        return (
          <Space size={8}>
            <Progress
              percent={Math.max(capped * 100, 4)}
              size="small"
              showInfo={false}
              strokeColor={isLow ? '#ff4d4f' : capped > 0.7 ? '#52c41a' : '#faad14'}
              style={{ width: 60 }}
            />
            <Text strong style={{ fontFamily: MONO_FONT, color: isLow ? '#ff4d4f' : '#333', fontSize: 13 }}>
              {current.toLocaleString('vi-VN')}
            </Text>
            <Text type="secondary" style={{ fontSize: 11 }}>{r.unit}</Text>
            {isLow && <WarningOutlined style={{ color: '#ff4d4f', fontSize: 12 }} />}
          </Space>
        )
      },
    },
    {
      title: '',
      key: 'actions',
      width: 50,
      render: (_: any, r: Material) => (
        <Button
          type="text"
          size="small"
          icon={<EditOutlined />}
          onClick={(e) => { e.stopPropagation(); setFormMaterialId(r.id) }}
        />
      ),
    },
  ]

  return (
    <div style={{ minHeight: '100vh', background: '#F7F5F2' }}>
      {/* Header */}
      <div style={{ background: '#1B4D3E', padding: '16px', color: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <Title level={4} style={{ color: '#fff', margin: 0 }}>Thành phẩm</Title>
            <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>{total} sản phẩm</Text>
          </div>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setFormMaterialId('new')}
            style={{ background: '#E8A838', borderColor: '#E8A838' }}
          >
            Thêm
          </Button>
        </div>

        <Input
          prefix={<SearchOutlined style={{ color: 'rgba(255,255,255,0.4)' }} />}
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          placeholder="Tìm theo tên, mã SKU..."
          allowClear
          style={{
            background: 'rgba(255,255,255,0.1)',
            borderColor: 'rgba(255,255,255,0.1)',
            color: '#fff',
            marginBottom: 8,
          }}
        />

        <Space size={8} wrap>
          {PRODUCT_FILTERS.map(f => (
            <Button
              key={f.key}
              size="small"
              type={productFilter === f.key ? 'primary' : 'default'}
              onClick={() => setProductFilter(f.key)}
              style={productFilter === f.key
                ? { background: '#fff', color: '#1B4D3E', borderColor: '#fff' }
                : { background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)', borderColor: 'rgba(255,255,255,0.1)' }
              }
            >
              {f.label}
            </Button>
          ))}
        </Space>
      </div>

      {/* Content */}
      <div style={{ padding: 16 }}>
        <Card size="small" bodyStyle={{ padding: 0 }}>
          <Table
            dataSource={materials}
            columns={columns}
            rowKey="id"
            size="small"
            loading={loading}
            scroll={{ x: 800 }}
            pagination={{
              current: page,
              total,
              pageSize: PAGE_SIZE,
              onChange: (p) => setPage(p),
              showSizeChanger: false,
              showTotal: (t) => `${t} sản phẩm`,
              size: 'small',
            }}
            onRow={(record) => ({
              onClick: () => setFormMaterialId(record.id),
              style: { cursor: 'pointer' },
            })}
            locale={{
              emptyText: hasActiveFilter ? (
                <Empty description="Không tìm thấy sản phẩm">
                  <Button onClick={() => { setSearchText(''); setProductFilter('all') }}>
                    Xóa bộ lọc
                  </Button>
                </Empty>
              ) : (
                <Empty description="Chưa có sản phẩm nào">
                  <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormMaterialId('new')}
                    style={{ background: '#1B4D3E', borderColor: '#1B4D3E' }}>
                    Thêm sản phẩm
                  </Button>
                </Empty>
              ),
            }}
          />
        </Card>
      </div>

      {/* Material Form Modal */}
      <MaterialFormModal
        materialId={formMaterialId}
        onClose={() => setFormMaterialId(null)}
        onSaved={() => {
          setFormMaterialId(null)
          fetchMaterials()
        }}
      />
    </div>
  )
}

export default MaterialListPage
