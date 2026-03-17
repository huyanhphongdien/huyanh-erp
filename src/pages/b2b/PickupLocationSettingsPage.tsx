// ============================================================================
// PICKUP LOCATION SETTINGS PAGE — Quan ly dia diem chot hang
// File: src/pages/b2b/PickupLocationSettingsPage.tsx
// Cho phep admin nha may xem, them, sua, xoa dia diem chot hang + DRC du kien
// ============================================================================

import { useState, useMemo } from 'react'
import {
  Card,
  Table,
  Button,
  Space,
  Typography,
  Tag,
  Input,
  Modal,
  Form,
  InputNumber,
  Select,
  message,
  Popconfirm,
  Tabs,
  Statistic,
  Row,
  Col,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  SearchOutlined,
  EnvironmentOutlined,
  ExperimentOutlined,
  GlobalOutlined,
} from '@ant-design/icons'
import {
  PICKUP_LOCATIONS,
  COUNTRY_LABELS,
  COUNTRY_FLAGS,
  type PickupLocation,
} from '../../constants/pickupLocations'

const { Title, Text } = Typography

// ============================================
// TYPES
// ============================================

interface LocationFormValues {
  code: string
  value: string
  label: string
  region: string
  country: string
  default_drc: number
}

// ============================================
// COMPONENT
// ============================================

const PickupLocationSettingsPage = () => {
  const [locations, setLocations] = useState<PickupLocation[]>([...PICKUP_LOCATIONS.filter(l => l.value !== 'other')])
  const [searchText, setSearchText] = useState('')
  const [activeCountry, setActiveCountry] = useState<string>('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingLocation, setEditingLocation] = useState<PickupLocation | null>(null)
  const [form] = Form.useForm()

  // Filter locations
  const filteredLocations = useMemo(() => {
    let result = locations
    if (activeCountry !== 'all') {
      result = result.filter(l => l.country === activeCountry)
    }
    if (searchText.trim()) {
      const search = searchText.toLowerCase()
      result = result.filter(
        l =>
          l.label.toLowerCase().includes(search) ||
          l.code.toLowerCase().includes(search) ||
          l.region.toLowerCase().includes(search)
      )
    }
    return result
  }, [locations, activeCountry, searchText])

  // Stats
  const stats = useMemo(() => {
    const countries = new Set(locations.map(l => l.country))
    const avgDrc = locations.length > 0
      ? locations.reduce((sum, l) => sum + l.default_drc, 0) / locations.length
      : 0
    return {
      total: locations.length,
      countries: countries.size,
      avgDrc: avgDrc.toFixed(1),
    }
  }, [locations])

  // Open modal for add/edit
  const openModal = (location?: PickupLocation) => {
    if (location) {
      setEditingLocation(location)
      form.setFieldsValue(location)
    } else {
      setEditingLocation(null)
      form.resetFields()
    }
    setModalOpen(true)
  }

  // Handle form submit
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields() as LocationFormValues
      if (editingLocation) {
        // Update
        setLocations(prev =>
          prev.map(l => (l.value === editingLocation.value ? { ...l, ...values } : l))
        )
        message.success('Đã cập nhật địa điểm')
      } else {
        // Check duplicate
        if (locations.some(l => l.value === values.value || l.code === values.code)) {
          message.error('Mã địa điểm đã tồn tại')
          return
        }
        setLocations(prev => [...prev, values])
        message.success('Đã thêm địa điểm mới')
      }
      setModalOpen(false)
      form.resetFields()
    } catch {
      // validation error
    }
  }

  // Handle delete
  const handleDelete = (location: PickupLocation) => {
    setLocations(prev => prev.filter(l => l.value !== location.value))
    message.success('Đã xóa địa điểm')
  }

  // Country color mapping
  const countryColor: Record<string, string> = {
    vietnam: 'green',
    laos: 'blue',
    thailand: 'orange',
    cambodia: 'purple',
  }

  // Table columns
  const columns: ColumnsType<PickupLocation> = [
    {
      title: 'Ma',
      dataIndex: 'code',
      key: 'code',
      width: 120,
      render: (code: string) => <Tag style={{ fontFamily: 'monospace' }}>{code}</Tag>,
    },
    {
      title: 'Địa điểm',
      dataIndex: 'label',
      key: 'label',
      render: (label: string, record) => (
        <Space>
          <EnvironmentOutlined style={{ color: '#1890ff' }} />
          <div>
            <div style={{ fontWeight: 500 }}>{label}</div>
            <Text type="secondary" style={{ fontSize: 12 }}>{record.region}</Text>
          </div>
        </Space>
      ),
    },
    {
      title: 'Quốc gia',
      dataIndex: 'country',
      key: 'country',
      width: 150,
      render: (country: string) => (
        <Tag color={countryColor[country] || 'default'}>
          {COUNTRY_FLAGS[country] || ''} {COUNTRY_LABELS[country] || country}
        </Tag>
      ),
      filters: Object.entries(COUNTRY_LABELS)
        .filter(([key]) => key !== 'other')
        .map(([value, text]) => ({ text: `${COUNTRY_FLAGS[value] || ''} ${text}`, value })),
      onFilter: (value, record) => record.country === value,
    },
    {
      title: 'DRC du kien (%)',
      dataIndex: 'default_drc',
      key: 'default_drc',
      width: 140,
      align: 'center',
      sorter: (a, b) => a.default_drc - b.default_drc,
      render: (drc: number) => {
        let color = '#52c41a'
        if (drc < 30) color = '#faad14'
        if (drc < 28) color = '#ff4d4f'
        return (
          <Tag color={drc >= 33 ? 'green' : drc >= 30 ? 'blue' : 'orange'} style={{ fontWeight: 600 }}>
            ~{drc}%
          </Tag>
        )
      },
    },
    {
      title: '',
      key: 'actions',
      width: 100,
      align: 'center',
      render: (_: unknown, record) => (
        <Space>
          <Button
            type="text"
            icon={<EditOutlined />}
            size="small"
            onClick={() => openModal(record)}
          />
          <Popconfirm
            title="Xoa dia diem nay?"
            description="Hành động này không thể hoàn tác"
            onConfirm={() => handleDelete(record)}
            okText="Xoa"
            cancelText="Huy"
            okButtonProps={{ danger: true }}
          >
            <Button type="text" danger icon={<DeleteOutlined />} size="small" />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  // Country tabs
  const countryTabs = [
    { key: 'all', label: 'Tất cả' },
    { key: 'vietnam', label: `${COUNTRY_FLAGS.vietnam} Viet Nam` },
    { key: 'laos', label: `${COUNTRY_FLAGS.laos} Lao` },
    { key: 'thailand', label: `${COUNTRY_FLAGS.thailand} Thai Lan` },
    { key: 'cambodia', label: `${COUNTRY_FLAGS.cambodia} Campuchia` },
  ]

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <Title level={3} style={{ margin: 0 }}>
          <EnvironmentOutlined style={{ marginRight: 8 }} />
          Dia diem chot hang
        </Title>
        <Text type="secondary">
          Quan ly danh sach dia diem chot hang va DRC du kien theo vung
        </Text>
      </div>

      {/* Stats */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={8}>
          <Card size="small">
            <Statistic
              title="Tổng địa điểm"
              value={stats.total}
              prefix={<EnvironmentOutlined />}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small">
            <Statistic
              title="Quốc gia"
              value={stats.countries}
              prefix={<GlobalOutlined />}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small">
            <Statistic
              title="DRC trung bình"
              value={stats.avgDrc}
              suffix="%"
              prefix={<ExperimentOutlined />}
            />
          </Card>
        </Col>
      </Row>

      {/* Main Card */}
      <Card>
        {/* Toolbar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <Input
            placeholder="Tìm kiếm dia diem..."
            prefix={<SearchOutlined />}
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            style={{ width: 300 }}
            allowClear
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()}>
            Them dia diem
          </Button>
        </div>

        {/* Country Tabs */}
        <Tabs
          activeKey={activeCountry}
          onChange={setActiveCountry}
          items={countryTabs.map(tab => ({
            key: tab.key,
            label: tab.label,
          }))}
          style={{ marginBottom: 8 }}
        />

        {/* Table */}
        <Table
          columns={columns}
          dataSource={filteredLocations}
          rowKey="value"
          pagination={{ pageSize: 20, showTotal: (total) => `${total} dia diem` }}
          size="middle"
        />
      </Card>

      {/* Add/Edit Modal */}
      <Modal
        title={editingLocation ? 'Sửa địa điểm' : 'Thêm địa điểm mới'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => {
          setModalOpen(false)
          form.resetFields()
        }}
        okText={editingLocation ? 'Cập nhật' : 'Them'}
        cancelText="Huy"
        width={520}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="code"
                label="Mã địa điểm"
                rules={[{ required: true, message: 'Nhập mã' }]}
                tooltip="VD: VN-HUE-PD, LA-SVK, TH-UBN"
              >
                <Input placeholder="VD: VN-HUE-PD" disabled={!!editingLocation} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="value"
                label="Gia tri (value)"
                rules={[{ required: true, message: 'Nhập value' }]}
              >
                <Input placeholder="VD: phong_dien" disabled={!!editingLocation} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="label"
            label="Tên hiển thị"
            rules={[{ required: true, message: 'Nhập tên' }]}
          >
            <Input placeholder="VD: Phong Dien, Hue" />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="country"
                label="Quốc gia"
                rules={[{ required: true, message: 'Chọn quốc gia' }]}
              >
                <Select placeholder="Chọn quốc gia">
                  <Select.Option value="vietnam">{COUNTRY_FLAGS.vietnam} Viet Nam</Select.Option>
                  <Select.Option value="laos">{COUNTRY_FLAGS.laos} Lao</Select.Option>
                  <Select.Option value="thailand">{COUNTRY_FLAGS.thailand} Thai Lan</Select.Option>
                  <Select.Option value="cambodia">{COUNTRY_FLAGS.cambodia} Campuchia</Select.Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="region"
                label="Vung / Tinh"
                rules={[{ required: true, message: 'Nhập vùng' }]}
              >
                <Input placeholder="VD: hue, quang_tri" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="default_drc"
            label="DRC du kien (%)"
            rules={[
              { required: true, message: 'Nhap DRC' },
              { type: 'number', min: 1, max: 100, message: 'DRC tu 1-100%' },
            ]}
            tooltip="DRC trung binh cua vung — se tu dong dien khi dai ly chon dia diem"
          >
            <InputNumber<number>
              style={{ width: '100%' }}
              min={1}
              max={100}
              step={0.5}
              placeholder="VD: 32.0"
              suffix="%"
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default PickupLocationSettingsPage
