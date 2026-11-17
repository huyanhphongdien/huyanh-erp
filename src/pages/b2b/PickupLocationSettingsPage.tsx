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
  Alert,
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
        message.success('Đã sửa địa điểm (chỉ trong phiên này — CHƯA lưu)')
      } else {
        // Check duplicate
        if (locations.some(l => l.value === values.value || l.code === values.code)) {
          message.error('Mã địa điểm đã tồn tại')
          return
        }
        setLocations(prev => [...prev, values])
        message.success('Đã thêm địa điểm (chỉ trong phiên này — CHƯA lưu)')
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
    message.success('Đã ẩn địa điểm (chỉ trong phiên này — CHƯA lưu)')
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
      title: 'Mã',
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
      title: 'DRC dự kiến (%)',
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
          {/* Khớp toast "Đã ẩn…" + Alert đầu trang: chỉ ẩn trong phiên, chưa lưu — KHÔNG phải xoá vĩnh viễn */}
          <Popconfirm
            title="Ẩn địa điểm này khỏi danh sách?"
            description="Chỉ ẩn trong phiên đang mở, chưa lưu vào hệ thống — tải lại trang thì địa điểm hiện lại."
            onConfirm={() => handleDelete(record)}
            okText="Ẩn"
            cancelText="Huỷ"
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
    { key: 'vietnam', label: `${COUNTRY_FLAGS.vietnam} Việt Nam` },
    { key: 'laos', label: `${COUNTRY_FLAGS.laos} Lào` },
    { key: 'thailand', label: `${COUNTRY_FLAGS.thailand} Thái Lan` },
    { key: 'cambodia', label: `${COUNTRY_FLAGS.cambodia} Campuchia` },
  ]

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <Title level={3} style={{ margin: 0 }}>
          <EnvironmentOutlined style={{ marginRight: 8 }} />
          Địa điểm chốt hàng
        </Title>
        <Text type="secondary">
          Danh sách địa điểm chốt hàng và DRC dự kiến theo vùng
        </Text>
      </div>

      {/* Trang này CHƯA nối CSDL: danh sách lấy từ cấu hình cố định (constants/pickupLocations.ts);
          thêm/sửa/xoá chỉ đổi trong phiên đang mở, tải lại trang là mất. Trước đây toast báo "Đã cập nhật"
          như thể đã lưu (audit 17/11/2026). */}
      <Alert
        type="warning"
        showIcon
        style={{ marginBottom: 16 }}
        message="Danh sách này chưa được lưu vào hệ thống"
        description="Địa điểm lấy từ cấu hình cố định trong phần mềm. Thêm / sửa / xoá ở đây chỉ có tác dụng trong phiên đang mở — tải lại trang sẽ mất. Cần đổi danh sách thật thì báo bộ phận IT."
      />

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
            placeholder="Tìm kiếm địa điểm..."
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
          pagination={{ pageSize: 20, showTotal: (total) => `${total} địa điểm` }}
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
        okText={editingLocation ? 'Cập nhật' : 'Thêm'}
        cancelText="Huỷ"
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
                label="Giá trị (mã value)"
                rules={[{ required: true, message: 'Nhập giá trị' }]}
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
            <Input placeholder="VD: Phong Điền, Huế" />
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
                label="Vùng / Tỉnh"
                rules={[{ required: true, message: 'Nhập vùng' }]}
              >
                <Input placeholder="VD: hue, quang_tri" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="default_drc"
            label="DRC dự kiến (%)"
            rules={[
              { required: true, message: 'Nhập DRC' },
              { type: 'number', min: 1, max: 100, message: 'DRC từ 1–100%' },
            ]}
            tooltip="DRC trung bình của vùng — sẽ tự động điền khi đại lý chọn địa điểm"
          >
            <InputNumber<number>
              style={{ width: '100%' }}
              min={1}
              max={100}
              step={0.5}
              placeholder="VD: 32"
              suffix="%"
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default PickupLocationSettingsPage
