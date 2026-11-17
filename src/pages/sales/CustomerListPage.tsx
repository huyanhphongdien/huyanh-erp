// ============================================================================
// CUSTOMER LIST PAGE — Danh sách Khách hàng quốc tế
// File: src/pages/sales/CustomerListPage.tsx
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Card,
  Table,
  Input,
  Select,
  Button,
  Space,
  Tag,
  Typography,
  Row,
  Col,
  Tooltip,
  Statistic,
  Modal,
  Form,
  Tabs,
  Switch,
  Popconfirm,
  InputNumber,
  message,
} from 'antd'
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table'
import {
  PlusOutlined,
  SearchOutlined,
  EyeOutlined,
  EditOutlined,
  StopOutlined,
  UserOutlined,
  CheckCircleOutlined,
  StarOutlined,
  CrownOutlined,
} from '@ant-design/icons'
import { salesCustomerService, customSpecsToRows, rowsToCustomSpecs } from '../../services/sales/salesCustomerService'
import { usdInputProps } from '../../utils/format'
import { dichLoiHeThong } from '../../utils/dichLoiHeThong'
import PageState from '../../components/common/PageState'
import { CustomSpecsFormList } from './CustomerSpecsField'
import { Hac13CodeDisplay } from '../../components/master-data/Hac13CodeDisplay'
import {
  type SalesCustomer,
  type CreateCustomerData,
  type CustomerStats,
  type CustomerStatus,
  type CustomerTier,
  type PaymentTerms,
  CUSTOMER_STATUS_LABELS,
  CUSTOMER_STATUS_COLORS,
  CUSTOMER_TIER_LABELS,
  CUSTOMER_TIER_COLORS,
  PAYMENT_TERMS_LABELS,
  INCOTERM_LABELS,
  QUALITY_STANDARD_LABELS,
  SVR_GRADE_OPTIONS,
  COUNTRY_OPTIONS,
  countryFlag,
  countryLabel,
} from '../../services/sales/salesTypes'
import GradeBadge from '../../components/wms/GradeBadge'
import { useOpenTab } from '../../hooks/useOpenTab'

const { Title, Text } = Typography

// Cờ + tên nước: countryFlag / countryLabel (salesTypes) — bỏ bảng 19 nước chép tay.
const flagLabel = (code: string, label: string) => [countryFlag(code), label].filter(Boolean).join(' ')

// ============================================
// MAIN COMPONENT
// ============================================

const CustomerListPage = () => {
  const navigate = useNavigate()
  const openTab = useOpenTab()
  const [form] = Form.useForm()

  // Mở chi tiết KH thành tab
  const openCustomerTab = (record: SalesCustomer) => {
    openTab({
      key: `sales-customer-${record.id}`,
      title: record.short_name || record.name,
      componentId: 'sales-customer-detail',
      props: { customerId: record.id },
      path: `/sales/customers/${record.id}`,
    })
  }

  // State
  const [customers, setCustomers] = useState<SalesCustomer[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<unknown>(null)
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState<CustomerStats>({
    total: 0,
    active: 0,
    premium: 0,
    strategic: 0,
  })

  // Filters
  const [searchText, setSearchText] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [tierFilter, setTierFilter] = useState<string>('all')
  const [countryFilter, setCountryFilter] = useState<string | undefined>(undefined)
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10 })

  // Modal
  const [modalOpen, setModalOpen] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<SalesCustomer | null>(null)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState('info')

  // ============================================
  // DATA FETCHING
  // ============================================

  const fetchCustomers = useCallback(async () => {
    try {
      setLoading(true)
      setLoadError(null)
      const response = await salesCustomerService.getList({
        page: pagination.current,
        pageSize: pagination.pageSize,
        search: searchText || undefined,
        status: statusFilter !== 'all' ? (statusFilter as CustomerStatus) : undefined,
        tier: tierFilter !== 'all' ? (tierFilter as CustomerTier) : undefined,
        country: countryFilter || undefined,
      })
      setCustomers(response.data)
      setTotal(response.total)
    } catch (error) {
      // Lỗi tải ≠ "không có khách": khối lỗi + Thử lại thay cho bảng trống giả
      console.error('Error fetching customers:', error)
      setLoadError(error || new Error('Không thể tải danh sách khách hàng'))
    } finally {
      setLoading(false)
    }
  }, [pagination, searchText, statusFilter, tierFilter, countryFilter])

  const fetchStats = useCallback(async () => {
    try {
      const data = await salesCustomerService.getStats()
      setStats(data)
    } catch (error) {
      console.error('Error fetching stats:', error)
    }
  }, [])

  useEffect(() => {
    fetchCustomers()
  }, [fetchCustomers])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  // ============================================
  // HANDLERS
  // ============================================

  const handleSearch = (value: string) => {
    setSearchText(value)
    setPagination((prev) => ({ ...prev, current: 1 }))
  }

  const handleTableChange = (pag: TablePaginationConfig) => {
    setPagination({
      current: pag.current || 1,
      pageSize: pag.pageSize || 10,
    })
  }

  const handleOpenCreate = () => {
    setEditingCustomer(null)
    setActiveTab('info')
    form.resetFields()
    form.setFieldsValue({
      code: '(Tự động)',
      status: 'active',
      tier: 'standard',
      default_currency: 'USD',
      default_incoterm: 'FOB',
      requires_pre_shipment_sample: false,
    })
    setModalOpen(true)
  }

  const handleOpenEdit = (customer: SalesCustomer) => {
    setEditingCustomer(customer)
    setActiveTab('info')
    form.setFieldsValue({
      ...customer,
      preferred_grades: customer.preferred_grades || [],
      // jsonb → dòng "Thông số / Giá trị" (trước đây đổ object vào TextArea → "[object Object]")
      custom_specs: customSpecsToRows(customer.custom_specs),
    })
    setModalOpen(true)
  }

  const handleSave = async () => {
    try {
      const values = await form.validateFields()
      setSaving(true)

      // Build data payload
      const payload: CreateCustomerData = {
        name: values.name,
        short_name: values.short_name || undefined,
        country: values.country || undefined,
        region: values.region || undefined,
        contact_person: values.contact_person || undefined,
        email: values.email || undefined,
        phone: values.phone || undefined,
        address: values.address || undefined,
        payment_terms: values.payment_terms || undefined,
        default_incoterm: values.default_incoterm || undefined,
        default_currency: values.default_currency || undefined,
        credit_limit: values.credit_limit || undefined,
        tier: values.tier,
        status: values.status,
        notes: values.notes || undefined,
        quality_standard: values.quality_standard || undefined,
        preferred_grades: values.preferred_grades || [],
        requires_pre_shipment_sample: values.requires_pre_shipment_sample || false,
        // Danh sách dòng → object jsonb (không còn đẩy CHUỖI JSON gõ tay vào cột jsonb)
        custom_specs: rowsToCustomSpecs(values.custom_specs),
      }

      if (editingCustomer) {
        await salesCustomerService.update(editingCustomer.id, payload)
        message.success('Đã cập nhật khách hàng')
      } else {
        await salesCustomerService.create(payload)
        message.success('Đã thêm khách hàng mới')
      }

      setModalOpen(false)
      form.resetFields()
      fetchCustomers()
      fetchStats()
    } catch (error: any) {
      if (error?.errorFields) return // validation error
      console.error('Save error:', error)
      message.error(dichLoiHeThong(error, 'Không thể lưu khách hàng'))
    } finally {
      setSaving(false)
    }
  }

  // salesCustomerService.delete() KHÔNG xoá — nó chuyển khách sang "Ngừng HĐ" (giữ lịch sử đơn) và
  // từ chối khi khách còn đơn đang xử lý. Nhãn cũ "Xóa"/"Đã xóa" nói sai việc hệ thống làm.
  const handleDeactivate = async (customer: SalesCustomer) => {
    try {
      await salesCustomerService.delete(customer.id)
      message.success(`Đã chuyển "${customer.name}" sang ${CUSTOMER_STATUS_LABELS.inactive}`)
      fetchCustomers()
      fetchStats()
    } catch (error) {
      console.error('Deactivate error:', error)
      // Service đã nói rõ lý do (vd "còn 3 đơn hàng đang xử lý") — hiện nguyên văn, không thay bằng câu chung
      message.error(dichLoiHeThong(error, 'Không chuyển được sang Ngừng hoạt động'), 6)
    }
  }

  // ============================================
  // TABLE COLUMNS
  // ============================================

  const columns: ColumnsType<SalesCustomer> = [
    {
      title: 'Mã KH (HAC-13)',
      dataIndex: 'code',
      key: 'code',
      width: 200,
      render: (code: string) => (
        code && code.length === 13 && code.startsWith('8999')
          ? <Hac13CodeDisplay code={code} variant="badge" showCopy={false} />
          : <Text code style={{ fontFamily: 'monospace', fontSize: 13 }}>{code}</Text>
      ),
    },
    {
      title: 'Tên khách hàng',
      dataIndex: 'name',
      key: 'name',
      ellipsis: true,
      render: (_: string, record: SalesCustomer) => (
        <div>
          <Text strong>{record.name}</Text>
          {record.short_name && (
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {record.short_name}
              </Text>
            </div>
          )}
        </div>
      ),
    },
    {
      title: 'Quốc gia',
      dataIndex: 'country',
      key: 'country',
      width: 140,
      render: (country?: string) =>
        country ? (
          <Space size={4}>
            <span>{countryFlag(country)}</span>
            <Text>{countryLabel(country)}</Text>
          </Space>
        ) : (
          <Text type="secondary">-</Text>
        ),
    },
    {
      title: 'Grade ưu tiên',
      dataIndex: 'preferred_grades',
      key: 'preferred_grades',
      width: 200,
      render: (grades?: string[]) =>
        grades && grades.length > 0 ? (
          <Space size={[4, 4]} wrap>
            {grades.map((g) => (
              <GradeBadge key={g} grade={g} size="small" />
            ))}
          </Space>
        ) : (
          <Text type="secondary">-</Text>
        ),
    },
    {
      title: 'Hạng',
      dataIndex: 'tier',
      key: 'tier',
      width: 110,
      render: (tier: CustomerTier) => (
        <Tag color={CUSTOMER_TIER_COLORS[tier]}>
          {CUSTOMER_TIER_LABELS[tier]}
        </Tag>
      ),
    },
    {
      title: 'Thanh toán',
      dataIndex: 'payment_terms',
      key: 'payment_terms',
      width: 160,
      render: (pt?: PaymentTerms) =>
        pt ? (
          <Text style={{ fontSize: 13 }}>{PAYMENT_TERMS_LABELS[pt]}</Text>
        ) : (
          <Text type="secondary">-</Text>
        ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (status: CustomerStatus) => (
        <Tag color={CUSTOMER_STATUS_COLORS[status]}>
          {CUSTOMER_STATUS_LABELS[status]}
        </Tag>
      ),
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 130,
      fixed: 'right',
      render: (_: unknown, record: SalesCustomer) => (
        <Space size={4}>
          <Tooltip title="Xem chi tiết (tab)">
            <Button
              type="text"
              size="small"
              icon={<EyeOutlined />}
              onClick={(e) => {
                e.stopPropagation()
                openCustomerTab(record)
              }}
            />
          </Tooltip>
          <Tooltip title="Sửa">
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              onClick={(e) => {
                e.stopPropagation()
                handleOpenEdit(record)
              }}
            />
          </Tooltip>
          {/* Chỉ khách đang hoạt động — khách "Cấm GD" mà bấm thì bị hạ xuống "Ngừng HĐ" (mất cờ cấm) */}
          {record.status === 'active' && (
            <Popconfirm
              title={`Chuyển "${record.name}" sang Ngừng hoạt động?`}
              description="Khách không bị xoá: toàn bộ đơn và lịch sử giữ nguyên, chỉ không hiện trong danh sách chọn khi tạo đơn. Bật lại bằng Sửa → Trạng thái. Khách còn đơn đang xử lý thì hệ thống sẽ từ chối."
              onConfirm={(e) => { e?.stopPropagation(); handleDeactivate(record) }}
              onCancel={(e) => e?.stopPropagation()}
              okText="Ngừng hoạt động"
              cancelText="Không"
              okButtonProps={{ danger: true }}
            >
              <Tooltip title="Ngừng hoạt động">
                <Button
                  type="text"
                  size="small"
                  danger
                  icon={<StopOutlined />}
                  onClick={(e) => e.stopPropagation()}
                />
              </Tooltip>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ]

  // ============================================
  // RENDER
  // ============================================

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
        <Col>
          <Title level={3} style={{ margin: 0 }}>
            Khách hàng
          </Title>
        </Col>
        <Col>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleOpenCreate}
            style={{ backgroundColor: '#1B4D3E', borderColor: '#1B4D3E' }}
          >
            Thêm khách hàng
          </Button>
        </Col>
      </Row>

      {/* Stats Row */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderRadius: 8 }}>
            <Statistic
              title="Tổng KH"
              value={stats.total}
              prefix={<UserOutlined style={{ color: '#1B4D3E' }} />}
              valueStyle={{ color: '#1B4D3E' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderRadius: 8 }}>
            <Statistic
              title="Đang hoạt động"
              value={stats.active}
              prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderRadius: 8 }}>
            <Statistic
              title={CUSTOMER_TIER_LABELS.premium}
              value={stats.premium}
              prefix={<StarOutlined style={{ color: '#faad14' }} />}
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderRadius: 8 }}>
            <Statistic
              title={CUSTOMER_TIER_LABELS.strategic}
              value={stats.strategic}
              prefix={<CrownOutlined style={{ color: '#722ed1' }} />}
              valueStyle={{ color: '#722ed1' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Filter Bar */}
      <Card size="small" style={{ marginBottom: 16, borderRadius: 8 }}>
        <Row gutter={[12, 12]} align="middle">
          <Col xs={24} sm={8} md={7}>
            <Input.Search
              placeholder="Tìm tên, mã khách hàng..."
              allowClear
              onSearch={handleSearch}
              onChange={(e) => {
                if (!e.target.value) handleSearch('')
              }}
              prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
            />
          </Col>
          <Col xs={12} sm={5} md={4}>
            <Select
              value={statusFilter}
              onChange={(val) => {
                setStatusFilter(val)
                setPagination((prev) => ({ ...prev, current: 1 }))
              }}
              style={{ width: '100%' }}
              options={[
                { label: 'Trạng thái: Tất cả', value: 'all' },
                ...Object.entries(CUSTOMER_STATUS_LABELS).map(([value, label]) => ({ value, label })),
              ]}
            />
          </Col>
          <Col xs={12} sm={5} md={4}>
            <Select
              value={tierFilter}
              onChange={(val) => {
                setTierFilter(val)
                setPagination((prev) => ({ ...prev, current: 1 }))
              }}
              style={{ width: '100%' }}
              options={[
                { label: 'Hạng: Tất cả', value: 'all' },
                ...Object.entries(CUSTOMER_TIER_LABELS).map(([value, label]) => ({ value, label })),
              ]}
            />
          </Col>
          <Col xs={12} sm={6} md={4}>
            <Select
              value={countryFilter}
              onChange={(val) => {
                setCountryFilter(val)
                setPagination((prev) => ({ ...prev, current: 1 }))
              }}
              allowClear
              placeholder="Quốc gia"
              style={{ width: '100%' }}
              options={[
                { label: 'Tất cả quốc gia', value: undefined },
                ...COUNTRY_OPTIONS.map((c) => ({
                  label: flagLabel(c.value, c.label),
                  value: c.value,
                })),
              ]}
            />
          </Col>
        </Row>
      </Card>

      {/* Table */}
      <Card style={{ borderRadius: 8 }}>
        {loadError && !loading ? (
          <PageState error={loadError} onRetry={fetchCustomers} />
        ) : (
        <Table<SalesCustomer>
          rowKey="id"
          columns={columns}
          dataSource={customers}
          loading={loading}
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total,
            showSizeChanger: true,
            showTotal: (t) => `Tổng ${t} khách hàng`,
            pageSizeOptions: ['10', '20', '50'],
          }}
          onChange={handleTableChange}
          scroll={{ x: 1000 }}
          onRow={(record) => ({
            onClick: () => openCustomerTab(record),
            style: { cursor: 'pointer' },
          })}
          size="middle"
        />
        )}
      </Card>

      {/* Create / Edit Modal */}
      <Modal
        title={editingCustomer ? 'Sửa khách hàng' : 'Thêm khách hàng'}
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false)
          form.resetFields()
        }}
        onOk={handleSave}
        confirmLoading={saving}
        okText={editingCustomer ? 'Cập nhật' : 'Tạo mới'}
        cancelText="Hủy"
        width={720}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          size="middle"
          style={{ marginTop: 16 }}
        >
          <Tabs
            activeKey={activeTab}
            onChange={setActiveTab}
            items={[
              {
                key: 'info',
                label: 'Thông tin',
                children: (
                  <>
                    <Row gutter={16}>
                      <Col span={8}>
                        <Form.Item
                          name="code"
                          label="Mã KH"
                        >
                          <Input disabled placeholder="Tự động" />
                        </Form.Item>
                      </Col>
                      <Col span={16}>
                        <Form.Item
                          name="name"
                          label="Tên khách hàng"
                          rules={[{ required: true, message: 'Vui lòng nhập tên' }]}
                        >
                          <Input placeholder="Tên công ty khách hàng" />
                        </Form.Item>
                      </Col>
                    </Row>
                    <Row gutter={16}>
                      <Col span={8}>
                        <Form.Item name="short_name" label="Tên viết tắt">
                          <Input placeholder="VD: TKC" />
                        </Form.Item>
                      </Col>
                      <Col span={8}>
                        <Form.Item name="country" label="Quốc gia">
                          <Select
                            placeholder="Chọn quốc gia"
                            showSearch
                            optionFilterProp="label"
                            options={COUNTRY_OPTIONS.map((c) => ({
                              label: flagLabel(c.value, c.label),
                              value: c.value,
                            }))}
                          />
                        </Form.Item>
                      </Col>
                      <Col span={8}>
                        <Form.Item name="region" label="Vùng/Khu vực">
                          <Input placeholder="VD: Kanto, Guangdong..." />
                        </Form.Item>
                      </Col>
                    </Row>
                    <Row gutter={16}>
                      <Col span={8}>
                        <Form.Item name="contact_person" label="Người liên hệ">
                          <Input placeholder="Tên người liên hệ" />
                        </Form.Item>
                      </Col>
                      <Col span={8}>
                        <Form.Item
                          name="email"
                          label="Email"
                          rules={[{ type: 'email', message: 'Email không hợp lệ' }]}
                        >
                          <Input placeholder="email@company.com" />
                        </Form.Item>
                      </Col>
                      <Col span={8}>
                        <Form.Item name="phone" label="Điện thoại">
                          <Input placeholder="+81-..." />
                        </Form.Item>
                      </Col>
                    </Row>
                    <Form.Item name="address" label="Địa chỉ">
                      <Input.TextArea rows={2} placeholder="Địa chỉ đầy đủ" />
                    </Form.Item>
                    <Row gutter={16}>
                      <Col span={8}>
                        <Form.Item name="payment_terms" label="Điều khoản thanh toán">
                          <Select
                            placeholder="Chọn"
                            allowClear
                            options={Object.entries(PAYMENT_TERMS_LABELS).map(
                              ([value, label]) => ({ value, label })
                            )}
                          />
                        </Form.Item>
                      </Col>
                      <Col span={8}>
                        <Form.Item name="default_incoterm" label="Incoterm mặc định">
                          <Select
                            placeholder="Chọn"
                            options={Object.entries(INCOTERM_LABELS).map(
                              ([value, label]) => ({ value, label })
                            )}
                          />
                        </Form.Item>
                      </Col>
                      <Col span={8}>
                        <Form.Item name="default_currency" label="Tiền tệ">
                          <Select
                            placeholder="Chọn"
                            options={[
                              { value: 'USD', label: 'USD' },
                              { value: 'EUR', label: 'EUR' },
                              { value: 'JPY', label: 'JPY' },
                              { value: 'CNY', label: 'CNY' },
                            ]}
                          />
                        </Form.Item>
                      </Col>
                    </Row>
                    <Row gutter={16}>
                      <Col span={8}>
                        <Form.Item name="credit_limit" label="Hạn mức tín dụng (USD)">
                          <InputNumber {...usdInputProps} min={0} style={{ width: '100%' }} placeholder="0" />
                        </Form.Item>
                      </Col>
                      <Col span={8}>
                        <Form.Item
                          name="tier"
                          label="Hạng khách hàng"
                          rules={[{ required: true }]}
                        >
                          <Select
                            options={Object.entries(CUSTOMER_TIER_LABELS).map(
                              ([value, label]) => ({ value, label })
                            )}
                          />
                        </Form.Item>
                      </Col>
                      <Col span={8}>
                        <Form.Item
                          name="status"
                          label="Trạng thái"
                          rules={[{ required: true }]}
                        >
                          <Select
                            options={Object.entries(CUSTOMER_STATUS_LABELS).map(
                              ([value, label]) => ({ value, label })
                            )}
                          />
                        </Form.Item>
                      </Col>
                    </Row>
                    <Form.Item name="notes" label="Ghi chú">
                      <Input.TextArea rows={2} placeholder="Ghi chú thêm..." />
                    </Form.Item>
                  </>
                ),
              },
              {
                key: 'quality',
                label: 'Chất lượng',
                // Luôn render: tab chưa mở thì các ô của nó không đăng ký với Form → validateFields()
                // thiếu preferred_grades/requires_pre_shipment_sample/custom_specs → sửa khách mà không
                // mở tab này là GHI ĐÈ các trường đó thành rỗng/false.
                forceRender: true,
                children: (
                  <>
                    <Row gutter={16}>
                      <Col span={12}>
                        <Form.Item
                          name="quality_standard"
                          label="Tiêu chuẩn chất lượng"
                        >
                          <Select
                            placeholder="Chọn tiêu chuẩn"
                            allowClear
                            options={Object.entries(QUALITY_STANDARD_LABELS).map(
                              ([value, label]) => ({ value, label })
                            )}
                          />
                        </Form.Item>
                      </Col>
                      <Col span={12}>
                        <Form.Item
                          name="requires_pre_shipment_sample"
                          label="Yêu cầu mẫu trước xuất"
                          valuePropName="checked"
                        >
                          <Switch
                            checkedChildren="Có"
                            unCheckedChildren="Không"
                          />
                        </Form.Item>
                      </Col>
                    </Row>
                    <Form.Item
                      name="preferred_grades"
                      label="Grade ưu tiên (SVR)"
                    >
                      <Select
                        mode="multiple"
                        placeholder="Chọn các grade"
                        options={SVR_GRADE_OPTIONS.map((g) => ({
                          value: g.value,
                          label: g.label,
                        }))}
                      />
                    </Form.Item>
                    {/* Yêu cầu kỹ thuật riêng — từng dòng "Thông số / Giá trị" (khớp bảng ở trang chi tiết),
                        service đổi sang object jsonb. Không còn bắt sale gõ JSON tay. Dùng CHUNG với modal ở
                        trang chi tiết khách. */}
                    <CustomSpecsFormList />
                  </>
                ),
              },
            ]}
          />
        </Form>
      </Modal>
    </div>
  )
}

export default CustomerListPage
