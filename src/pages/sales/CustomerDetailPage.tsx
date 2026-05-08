// ============================================================================
// CUSTOMER DETAIL PAGE — Chi tiết Khách hàng bán quốc tế
// File: src/pages/sales/CustomerDetailPage.tsx
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Card,
  Tabs,
  Descriptions,
  Table,
  Tag,
  Button,
  Space,
  Typography,
  Row,
  Col,
  Statistic,
  Spin,
  Empty,
  Breadcrumb,
  Modal,
  Form,
  Input,
  Select,
  InputNumber,
  Switch,
  Popconfirm,
  message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  ArrowLeftOutlined,
  EditOutlined,
  DeleteOutlined,
  PlusOutlined,
  ShoppingOutlined,
  DollarOutlined,
  BarChartOutlined,
  FileTextOutlined,
} from '@ant-design/icons'
import { salesCustomerService } from '../../services/sales/salesCustomerService'
import type {
  SalesCustomer,
  CreateCustomerData,
  SalesOrder,
  CustomerTier,
  CustomerStatus,
  QualityStandard,
  SalesOrderStatus,
  Incoterm,
  PaymentTerms,
} from '../../services/sales/salesTypes'
import {
  CUSTOMER_TIER_LABELS,
  CUSTOMER_TIER_COLORS,
  CUSTOMER_STATUS_LABELS,
  CUSTOMER_STATUS_COLORS,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_COLORS,
  QUALITY_STANDARD_LABELS,
  INCOTERM_LABELS,
  PAYMENT_TERMS_LABELS,
  SVR_GRADE_OPTIONS,
  COUNTRY_OPTIONS,
} from '../../services/sales/salesTypes'

const { Title } = Typography

// ============================================
// HELPERS
// ============================================

const formatCurrency = (value: number | null | undefined): string => {
  if (!value) return '-'
  if (value >= 1000000000) return `${(value / 1000000000).toFixed(2)} tỷ`
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)} tr`
  return new Intl.NumberFormat('vi-VN').format(value) + ' đ'
}

const formatUSD = (value: number | null | undefined): string => {
  if (!value) return '-'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
}

const formatDate = (dateStr: string | null | undefined): string => {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('vi-VN')
}

const GradeBadge = ({ grade }: { grade: string }) => (
  <Tag color="blue" style={{ marginBottom: 4 }}>{grade}</Tag>
)

// ============================================
// STATS INTERFACE (computed client-side)
// ============================================

interface CustomerDetailStats {
  totalOrders: number
  totalRevenue: number
  totalQuantity: number
  processingOrders: number
}

// ============================================
// MAIN COMPONENT
// ============================================

// Accept optional customerId prop cho tab mode — fallback useParams cho direct URL
interface CustomerDetailPageProps {
  customerId?: string
}

export default function CustomerDetailPage({ customerId: propCustomerId }: CustomerDetailPageProps = {}) {
  const { customerId: paramCustomerId } = useParams<{ customerId: string }>()
  const customerId = propCustomerId || paramCustomerId
  const navigate = useNavigate()

  const [customer, setCustomer] = useState<SalesCustomer | null>(null)
  const [orders, setOrders] = useState<SalesOrder[]>([])
  const [stats, setStats] = useState<CustomerDetailStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('info')
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm()

  // ── Load data ──
  const loadData = useCallback(async () => {
    if (!customerId) return
    setLoading(true)
    try {
      const customerData = await salesCustomerService.getById(customerId)
      setCustomer(customerData)

      // Load orders for this customer
      try {
        const ordersList = await salesCustomerService.getOrderHistory(customerId)
        setOrders(ordersList)

        // Compute stats
        setStats({
          totalOrders: ordersList.length,
          totalRevenue: ordersList.reduce((sum, o) => sum + (o.total_value_usd || 0), 0),
          totalQuantity: ordersList.reduce((sum, o) => sum + (o.quantity_tons || 0), 0),
          processingOrders: ordersList.filter(o => o.status === 'producing' || o.status === 'ready' || o.status === 'packing').length,
        })
      } catch {
        setOrders([])
        setStats({ totalOrders: 0, totalRevenue: 0, totalQuantity: 0, processingOrders: 0 })
      }
    } catch (err) {
      console.error('Lỗi tải dữ liệu khách hàng:', err)
      message.error('Không thể tải dữ liệu khách hàng')
    } finally {
      setLoading(false)
    }
  }, [customerId])

  useEffect(() => {
    loadData()
  }, [loadData])

  // ── Edit ──
  const handleEdit = () => {
    if (!customer) return
    form.setFieldsValue({
      name: customer.name,
      short_name: customer.short_name,
      country: customer.country,
      region: customer.region,
      contact_person: customer.contact_person,
      email: customer.email,
      phone: customer.phone,
      address: customer.address,
      tier: customer.tier,
      status: customer.status,
      payment_terms: customer.payment_terms,
      default_incoterm: customer.default_incoterm,
      default_currency: customer.default_currency,
      credit_limit: customer.credit_limit,
      notes: customer.notes,
      quality_standard: customer.quality_standard,
      preferred_grades: customer.preferred_grades,
      requires_pre_shipment_sample: customer.requires_pre_shipment_sample,
    })
    setEditModalOpen(true)
  }

  const handleSaveEdit = async () => {
    if (!customerId) return
    try {
      const values = await form.validateFields()
      setSaving(true)
      await salesCustomerService.update(customerId, values as Partial<CreateCustomerData>)
      message.success('Đã cập nhật khách hàng')
      setEditModalOpen(false)
      loadData()
    } catch (err) {
      console.error('Lỗi cập nhật:', err)
      message.error('Cập nhật thất bại')
    } finally {
      setSaving(false)
    }
  }

  // ── Delete ──
  const handleDelete = async () => {
    if (!customerId) return
    try {
      await salesCustomerService.delete(customerId)
      message.success('Đã xóa khách hàng')
      navigate('/sales/customers')
    } catch (err) {
      console.error('Lỗi xóa:', err)
      message.error('Xóa thất bại')
    }
  }

  // ── Order table columns ──
  const orderColumns: ColumnsType<SalesOrder> = [
    {
      title: 'Mã đơn',
      dataIndex: 'code',
      key: 'code',
      render: (code: string, record: SalesOrder) => (
        <Button type="link" onClick={() => navigate(`/sales/orders/${record.id}`)}>
          {code}
        </Button>
      ),
    },
    {
      title: 'Grade',
      dataIndex: 'grade',
      key: 'grade',
      render: (grade: string | null) => grade ? <Tag color="blue">{grade}</Tag> : '-',
    },
    {
      title: 'Số lượng (tấn)',
      dataIndex: 'quantity_tons',
      key: 'quantity_tons',
      align: 'right',
      render: (v: number | null) => v != null ? v.toFixed(2) : '-',
    },
    {
      title: 'Giá trị (USD)',
      dataIndex: 'total_value_usd',
      key: 'total_value_usd',
      align: 'right',
      render: (v: number | null) => formatUSD(v),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      render: (status: SalesOrderStatus) => (
        <Tag color={ORDER_STATUS_COLORS[status]}>
          {ORDER_STATUS_LABELS[status]}
        </Tag>
      ),
    },
    {
      title: 'Ngày đặt',
      dataIndex: 'order_date',
      key: 'order_date',
      render: (d: string) => formatDate(d),
    },
  ]

  // ── Custom specs table columns ──
  const customSpecColumns: ColumnsType<{ key: string; spec_key: string; spec_value: string }> = [
    { title: 'Thông số', dataIndex: 'spec_key', key: 'spec_key' },
    { title: 'Giá trị', dataIndex: 'spec_value', key: 'spec_value' },
  ]

  // ── Loading ──
  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Spin size="large" tip="Đang tải..." />
      </div>
    )
  }

  if (!customer) {
    return <Empty description="Không tìm thấy khách hàng" />
  }

  // ── Custom specs data ──
  const customSpecData = customer.custom_specs
    ? Object.entries(customer.custom_specs).map(([k, v]) => ({
        key: k,
        spec_key: k,
        spec_value: String(v),
      }))
    : []

  // ============================================
  // TAB ITEMS
  // ============================================

  const tabItems = [
    {
      key: 'info',
      label: 'Thông tin',
      children: (
        <Row gutter={[24, 24]}>
          <Col xs={24} lg={14}>
            <Descriptions
              bordered
              column={1}
              size="middle"
              title="Thông tin chung"
            >
              <Descriptions.Item label="Mã KH">{customer.code}</Descriptions.Item>
              <Descriptions.Item label="Tên">{customer.name}</Descriptions.Item>
              <Descriptions.Item label="Tên viết tắt">{customer.short_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="Quốc gia">
                {customer.country
                  ? (COUNTRY_OPTIONS.find(c => c.value === customer.country)?.label || customer.country)
                  : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Khu vực">{customer.region || '-'}</Descriptions.Item>
              <Descriptions.Item label="Người liên hệ">{customer.contact_person || '-'}</Descriptions.Item>
              <Descriptions.Item label="Email">{customer.email || '-'}</Descriptions.Item>
              <Descriptions.Item label="Điện thoại">{customer.phone || '-'}</Descriptions.Item>
              <Descriptions.Item label="Địa chỉ">{customer.address || '-'}</Descriptions.Item>
              <Descriptions.Item label="Hạng">
                <Tag color={CUSTOMER_TIER_COLORS[customer.tier]}>
                  {CUSTOMER_TIER_LABELS[customer.tier]}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Trạng thái">
                <Tag color={CUSTOMER_STATUS_COLORS[customer.status]}>
                  {CUSTOMER_STATUS_LABELS[customer.status]}
                </Tag>
              </Descriptions.Item>
            </Descriptions>
          </Col>
          <Col xs={24} lg={10}>
            <Card title="Thương mại" size="small">
              <Descriptions column={1} size="small">
                <Descriptions.Item label="Điều khoản TT">
                  {customer.payment_terms
                    ? PAYMENT_TERMS_LABELS[customer.payment_terms]
                    : '-'}
                </Descriptions.Item>
                <Descriptions.Item label="Incoterm mặc định">
                  {customer.default_incoterm
                    ? INCOTERM_LABELS[customer.default_incoterm]
                    : '-'}
                </Descriptions.Item>
                <Descriptions.Item label="Tiền tệ">
                  {customer.default_currency || '-'}
                </Descriptions.Item>
                <Descriptions.Item label="Hạn mức tín dụng">
                  {customer.credit_limit != null ? formatUSD(customer.credit_limit) : '-'}
                </Descriptions.Item>
                <Descriptions.Item label="Ghi chú">
                  {customer.notes || '-'}
                </Descriptions.Item>
              </Descriptions>
            </Card>
          </Col>
        </Row>
      ),
    },
    {
      key: 'quality',
      label: 'Yêu cầu chất lượng',
      children: (
        <div>
          <Card size="small" style={{ marginBottom: 16 }}>
            <Descriptions column={{ xs: 1, sm: 2 }} size="small">
              <Descriptions.Item label="Tiêu chuẩn">
                {customer.quality_standard
                  ? QUALITY_STANDARD_LABELS[customer.quality_standard]
                  : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Yêu cầu mẫu trước xuất">
                {customer.requires_pre_shipment_sample ? (
                  <Tag color="green">Có</Tag>
                ) : (
                  <Tag color="default">Không</Tag>
                )}
              </Descriptions.Item>
              <Descriptions.Item label="Grade ưu tiên" span={2}>
                {customer.preferred_grades && customer.preferred_grades.length > 0
                  ? customer.preferred_grades.map((g) => (
                      <GradeBadge key={g} grade={g} />
                    ))
                  : '-'}
              </Descriptions.Item>
            </Descriptions>
          </Card>

          {customSpecData.length > 0 && (
            <Card title="Thông số tùy chỉnh" size="small">
              <Table
                dataSource={customSpecData}
                columns={customSpecColumns}
                pagination={false}
                size="small"
              />
            </Card>
          )}
        </div>
      ),
    },
    {
      key: 'orders',
      label: 'Đơn hàng',
      children: (
        <div>
          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => navigate(`/sales/orders/new?customer_id=${customerId}`)}
            >
              Tạo đơn hàng mới
            </Button>
          </div>
          <Table
            dataSource={orders}
            columns={orderColumns}
            rowKey="id"
            pagination={{ pageSize: 10 }}
            locale={{ emptyText: <Empty description="Chưa có đơn hàng" /> }}
            size="middle"
          />
        </div>
      ),
    },
    {
      key: 'stats',
      label: 'Thống kê',
      children: (
        <Row gutter={[16, 16]}>
          <Col xs={12} sm={6}>
            <Card>
              <Statistic
                title="Tổng đơn"
                value={stats?.totalOrders || 0}
                prefix={<ShoppingOutlined />}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card>
              <Statistic
                title="Doanh thu (USD)"
                value={stats?.totalRevenue || 0}
                prefix={<DollarOutlined />}
                formatter={(v) => formatUSD(Number(v))}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card>
              <Statistic
                title="Số lượng (tấn)"
                value={stats?.totalQuantity || 0}
                precision={2}
                prefix={<BarChartOutlined />}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card>
              <Statistic
                title="Đơn đang xử lý"
                value={stats?.processingOrders || 0}
                prefix={<FileTextOutlined />}
                valueStyle={
                  (stats?.processingOrders || 0) > 0
                    ? { color: '#fa8c16' }
                    : undefined
                }
              />
            </Card>
          </Col>
        </Row>
      ),
    },
  ]

  // ============================================
  // RENDER
  // ============================================

  return (
    <div style={{ padding: '0 0 24px' }}>
      {/* ── Breadcrumb ── */}
      <Breadcrumb
        style={{ marginBottom: 16 }}
        items={[
          { title: 'Đơn hàng bán' },
          {
            title: <a onClick={() => navigate('/sales/customers')}>Khách hàng</a>,
          },
          { title: customer.name },
        ]}
      />

      {/* ── Header ── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 24,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <Space align="center" size="middle">
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/sales/customers')}
          />
          <Title level={4} style={{ margin: 0 }}>
            {customer.name}
          </Title>
          <Tag color={CUSTOMER_TIER_COLORS[customer.tier]}>
            {CUSTOMER_TIER_LABELS[customer.tier]}
          </Tag>
        </Space>
        <Space>
          <Button icon={<EditOutlined />} onClick={handleEdit}>
            Sửa
          </Button>
          <Popconfirm
            title="Xóa khách hàng?"
            description="Bạn có chắc muốn xóa khách hàng này?"
            onConfirm={handleDelete}
            okText="Xóa"
            cancelText="Hủy"
            okButtonProps={{ danger: true }}
          >
            <Button danger icon={<DeleteOutlined />}>
              Xóa
            </Button>
          </Popconfirm>
        </Space>
      </div>

      {/* ── Tabs ── */}
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={tabItems}
        size="large"
      />

      {/* ── Edit Modal ── */}
      <Modal
        title="Sửa thông tin khách hàng"
        open={editModalOpen}
        onOk={handleSaveEdit}
        onCancel={() => setEditModalOpen(false)}
        confirmLoading={saving}
        okText="Lưu"
        cancelText="Hủy"
        width={700}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="name"
                label="Tên khách hàng"
                rules={[{ required: true, message: 'Vui lòng nhập tên' }]}
              >
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="short_name" label="Tên viết tắt">
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="contact_person" label="Người liên hệ">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="email" label="Email">
                <Input type="email" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="phone" label="Điện thoại">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="country" label="Quốc gia">
                <Select allowClear showSearch optionFilterProp="label">
                  {COUNTRY_OPTIONS.map((c) => (
                    <Select.Option key={c.value} value={c.value} label={c.label}>{c.label}</Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="region" label="Khu vực">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="tier" label="Hạng">
                <Select>
                  {Object.entries(CUSTOMER_TIER_LABELS).map(([k, v]) => (
                    <Select.Option key={k} value={k}>{v}</Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="address" label="Địa chỉ">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="status" label="Trạng thái">
                <Select>
                  {Object.entries(CUSTOMER_STATUS_LABELS).map(([k, v]) => (
                    <Select.Option key={k} value={k}>{v}</Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="payment_terms" label="Điều khoản TT">
                <Select allowClear>
                  {Object.entries(PAYMENT_TERMS_LABELS).map(([k, v]) => (
                    <Select.Option key={k} value={k}>{v}</Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="default_incoterm" label="Incoterm mặc định">
                <Select allowClear>
                  {Object.entries(INCOTERM_LABELS).map(([k, v]) => (
                    <Select.Option key={k} value={k}>{v}</Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="default_currency" label="Tiền tệ">
                <Select allowClear>
                  {['USD', 'EUR', 'JPY', 'CNY'].map((c) => (
                    <Select.Option key={c} value={c}>{c}</Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="credit_limit" label="Hạn mức tín dụng (USD)">
                <InputNumber
                  style={{ width: '100%' }}
                  formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                  parser={(v) => v?.replace(/,/g, '') as any}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="quality_standard" label="Tiêu chuẩn chất lượng">
                <Select allowClear>
                  {Object.entries(QUALITY_STANDARD_LABELS).map(([k, v]) => (
                    <Select.Option key={k} value={k}>{v}</Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="preferred_grades" label="Grade ưu tiên">
                <Select mode="multiple" allowClear showSearch optionFilterProp="label">
                  {SVR_GRADE_OPTIONS.map((g) => (
                    <Select.Option key={g.value} value={g.value} label={g.label}>{g.label}</Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="requires_pre_shipment_sample"
                label="Yêu cầu mẫu trước xuất"
                valuePropName="checked"
              >
                <Switch checkedChildren="Có" unCheckedChildren="Không" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="notes" label="Ghi chú">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
