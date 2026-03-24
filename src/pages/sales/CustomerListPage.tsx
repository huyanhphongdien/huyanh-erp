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
  message,
} from 'antd'
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table'
import {
  PlusOutlined,
  SearchOutlined,
  EyeOutlined,
  EditOutlined,
  DeleteOutlined,
  UserOutlined,
  CheckCircleOutlined,
  StarOutlined,
  CrownOutlined,
} from '@ant-design/icons'
import { salesCustomerService } from '../../services/sales/salesCustomerService'
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
} from '../../services/sales/salesTypes'
import GradeBadge from '../../components/wms/GradeBadge'

const { Title, Text } = Typography

// ============================================
// COUNTRY FLAG HELPER
// ============================================

const COUNTRY_FLAGS: Record<string, string> = {
  JP: '\u{1F1EF}\u{1F1F5}',
  CN: '\u{1F1E8}\u{1F1F3}',
  IN: '\u{1F1EE}\u{1F1F3}',
  DE: '\u{1F1E9}\u{1F1EA}',
  US: '\u{1F1FA}\u{1F1F8}',
  MY: '\u{1F1F2}\u{1F1FE}',
  KR: '\u{1F1F0}\u{1F1F7}',
  TW: '\u{1F1F9}\u{1F1FC}',
  TR: '\u{1F1F9}\u{1F1F7}',
  BR: '\u{1F1E7}\u{1F1F7}',
  IT: '\u{1F1EE}\u{1F1F9}',
  FR: '\u{1F1EB}\u{1F1F7}',
  ES: '\u{1F1EA}\u{1F1F8}',
  TH: '\u{1F1F9}\u{1F1ED}',
  ID: '\u{1F1EE}\u{1F1E9}',
  RU: '\u{1F1F7}\u{1F1FA}',
  PK: '\u{1F1F5}\u{1F1F0}',
  BD: '\u{1F1E7}\u{1F1E9}',
  EG: '\u{1F1EA}\u{1F1EC}',
}

const getCountryFlag = (code?: string): string => {
  if (!code) return ''
  return COUNTRY_FLAGS[code] || '\u{1F3F3}\u{FE0F}'
}

const getCountryLabel = (code?: string): string => {
  if (!code) return ''
  const opt = COUNTRY_OPTIONS.find((c) => c.value === code)
  return opt ? opt.label : code
}

// ============================================
// MAIN COMPONENT
// ============================================

const CustomerListPage = () => {
  const navigate = useNavigate()
  const [form] = Form.useForm()

  // State
  const [customers, setCustomers] = useState<SalesCustomer[]>([])
  const [loading, setLoading] = useState(true)
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
      console.error('Error fetching customers:', error)
      message.error('Kh\u00F4ng th\u1EC3 t\u1EA3i danh s\u00E1ch kh\u00E1ch h\u00E0ng')
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
      code: '(T\u1EF1 \u0111\u1ED9ng)',
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
        custom_specs: values.custom_specs || undefined,
      }

      if (editingCustomer) {
        await salesCustomerService.update(editingCustomer.id, payload)
        message.success('\u0110\u00E3 c\u1EADp nh\u1EADt kh\u00E1ch h\u00E0ng')
      } else {
        await salesCustomerService.create(payload)
        message.success('\u0110\u00E3 th\u00EAm kh\u00E1ch h\u00E0ng m\u1EDBi')
      }

      setModalOpen(false)
      form.resetFields()
      fetchCustomers()
      fetchStats()
    } catch (error: any) {
      if (error?.errorFields) return // validation error
      console.error('Save error:', error)
      message.error('Kh\u00F4ng th\u1EC3 l\u01B0u kh\u00E1ch h\u00E0ng')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (customer: SalesCustomer) => {
    try {
      await salesCustomerService.delete(customer.id)
      message.success(`\u0110\u00E3 x\u00F3a kh\u00E1ch h\u00E0ng "${customer.name}"`)
      fetchCustomers()
      fetchStats()
    } catch (error) {
      console.error('Delete error:', error)
      message.error('Kh\u00F4ng th\u1EC3 x\u00F3a kh\u00E1ch h\u00E0ng')
    }
  }

  // ============================================
  // TABLE COLUMNS
  // ============================================

  const columns: ColumnsType<SalesCustomer> = [
    {
      title: 'M\u00E3 KH',
      dataIndex: 'code',
      key: 'code',
      width: 110,
      render: (code: string) => (
        <Text code style={{ fontFamily: 'monospace', fontSize: 13 }}>
          {code}
        </Text>
      ),
    },
    {
      title: 'T\u00EAn kh\u00E1ch h\u00E0ng',
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
      title: 'Qu\u1ED1c gia',
      dataIndex: 'country',
      key: 'country',
      width: 140,
      render: (country?: string) =>
        country ? (
          <Space size={4}>
            <span>{getCountryFlag(country)}</span>
            <Text>{getCountryLabel(country)}</Text>
          </Space>
        ) : (
          <Text type="secondary">-</Text>
        ),
    },
    {
      title: 'Grade \u01B0u ti\u00EAn',
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
      title: 'H\u1EA1ng',
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
      title: 'Thanh to\u00E1n',
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
      title: 'Tr\u1EA1ng th\u00E1i',
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
      title: 'Thao t\u00E1c',
      key: 'actions',
      width: 130,
      fixed: 'right',
      render: (_: unknown, record: SalesCustomer) => (
        <Space size={4}>
          <Tooltip title="Xem chi ti\u1EBFt">
            <Button
              type="text"
              size="small"
              icon={<EyeOutlined />}
              onClick={(e) => {
                e.stopPropagation()
                navigate(`/sales/customers/${record.id}`)
              }}
            />
          </Tooltip>
          <Tooltip title="S\u1EEDa">
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
          <Popconfirm
            title="X\u00E1c nh\u1EADn x\u00F3a"
            description={`X\u00F3a kh\u00E1ch h\u00E0ng "${record.name}"?`}
            onConfirm={() => handleDelete(record)}
            okText="X\u00F3a"
            cancelText="H\u1EE7y"
            okButtonProps={{ danger: true }}
          >
            <Tooltip title="X\u00F3a">
              <Button
                type="text"
                size="small"
                danger
                icon={<DeleteOutlined />}
                onClick={(e) => e.stopPropagation()}
              />
            </Tooltip>
          </Popconfirm>
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
            Kh\u00E1ch h\u00E0ng
          </Title>
        </Col>
        <Col>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleOpenCreate}
            style={{ backgroundColor: '#1B4D3E', borderColor: '#1B4D3E' }}
          >
            Th\u00EAm kh\u00E1ch h\u00E0ng
          </Button>
        </Col>
      </Row>

      {/* Stats Row */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderRadius: 8 }}>
            <Statistic
              title="T\u1ED5ng KH"
              value={stats.total}
              prefix={<UserOutlined style={{ color: '#1B4D3E' }} />}
              valueStyle={{ color: '#1B4D3E' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderRadius: 8 }}>
            <Statistic
              title="\u0110ang ho\u1EA1t \u0111\u1ED9ng"
              value={stats.active}
              prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderRadius: 8 }}>
            <Statistic
              title="Premium"
              value={stats.premium}
              prefix={<StarOutlined style={{ color: '#faad14' }} />}
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderRadius: 8 }}>
            <Statistic
              title="Strategic"
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
              placeholder="T\u00ECm t\u00EAn, m\u00E3 kh\u00E1ch h\u00E0ng..."
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
                { label: 'Tr\u1EA1ng th\u00E1i: T\u1EA5t c\u1EA3', value: 'all' },
                { label: 'Ho\u1EA1t \u0111\u1ED9ng', value: 'active' },
                { label: 'Ng\u01B0ng', value: 'inactive' },
                { label: 'C\u1EA5m G\u0110', value: 'blacklisted' },
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
                { label: 'H\u1EA1ng: T\u1EA5t c\u1EA3', value: 'all' },
                { label: 'Standard', value: 'standard' },
                { label: 'Premium', value: 'premium' },
                { label: 'Strategic', value: 'strategic' },
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
              placeholder="Qu\u1ED1c gia"
              style={{ width: '100%' }}
              options={[
                { label: 'T\u1EA5t c\u1EA3 qu\u1ED1c gia', value: undefined },
                ...COUNTRY_OPTIONS.map((c) => ({
                  label: `${getCountryFlag(c.value)} ${c.label}`,
                  value: c.value,
                })),
              ]}
            />
          </Col>
        </Row>
      </Card>

      {/* Table */}
      <Card style={{ borderRadius: 8 }}>
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
            showTotal: (t) => `T\u1ED5ng ${t} kh\u00E1ch h\u00E0ng`,
            pageSizeOptions: ['10', '20', '50'],
          }}
          onChange={handleTableChange}
          scroll={{ x: 1000 }}
          onRow={(record) => ({
            onClick: () => navigate(`/sales/customers/${record.id}`),
            style: { cursor: 'pointer' },
          })}
          size="middle"
        />
      </Card>

      {/* Create / Edit Modal */}
      <Modal
        title={editingCustomer ? 'S\u1EEDa kh\u00E1ch h\u00E0ng' : 'Th\u00EAm kh\u00E1ch h\u00E0ng'}
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false)
          form.resetFields()
        }}
        onOk={handleSave}
        confirmLoading={saving}
        okText={editingCustomer ? 'C\u1EADp nh\u1EADt' : 'T\u1EA1o m\u1EDBi'}
        cancelText="H\u1EE7y"
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
                label: 'Th\u00F4ng tin',
                children: (
                  <>
                    <Row gutter={16}>
                      <Col span={8}>
                        <Form.Item
                          name="code"
                          label="M\u00E3 KH"
                        >
                          <Input disabled placeholder="T\u1EF1 \u0111\u1ED9ng" />
                        </Form.Item>
                      </Col>
                      <Col span={16}>
                        <Form.Item
                          name="name"
                          label="T\u00EAn kh\u00E1ch h\u00E0ng"
                          rules={[{ required: true, message: 'Vui l\u00F2ng nh\u1EADp t\u00EAn' }]}
                        >
                          <Input placeholder="T\u00EAn c\u00F4ng ty kh\u00E1ch h\u00E0ng" />
                        </Form.Item>
                      </Col>
                    </Row>
                    <Row gutter={16}>
                      <Col span={8}>
                        <Form.Item name="short_name" label="T\u00EAn vi\u1EBFt t\u1EAFt">
                          <Input placeholder="VD: TKC" />
                        </Form.Item>
                      </Col>
                      <Col span={8}>
                        <Form.Item name="country" label="Qu\u1ED1c gia">
                          <Select
                            placeholder="Ch\u1ECDn qu\u1ED1c gia"
                            showSearch
                            optionFilterProp="label"
                            options={COUNTRY_OPTIONS.map((c) => ({
                              label: `${getCountryFlag(c.value)} ${c.label}`,
                              value: c.value,
                            }))}
                          />
                        </Form.Item>
                      </Col>
                      <Col span={8}>
                        <Form.Item name="region" label="V\u00F9ng/Khu v\u1EF1c">
                          <Input placeholder="VD: Kanto, Guangdong..." />
                        </Form.Item>
                      </Col>
                    </Row>
                    <Row gutter={16}>
                      <Col span={8}>
                        <Form.Item name="contact_person" label="Ng\u01B0\u1EDDi li\u00EAn h\u1EC7">
                          <Input placeholder="T\u00EAn ng\u01B0\u1EDDi li\u00EAn h\u1EC7" />
                        </Form.Item>
                      </Col>
                      <Col span={8}>
                        <Form.Item
                          name="email"
                          label="Email"
                          rules={[{ type: 'email', message: 'Email kh\u00F4ng h\u1EE3p l\u1EC7' }]}
                        >
                          <Input placeholder="email@company.com" />
                        </Form.Item>
                      </Col>
                      <Col span={8}>
                        <Form.Item name="phone" label="\u0110i\u1EC7n tho\u1EA1i">
                          <Input placeholder="+81-..." />
                        </Form.Item>
                      </Col>
                    </Row>
                    <Form.Item name="address" label="\u0110\u1ECBa ch\u1EC9">
                      <Input.TextArea rows={2} placeholder="\u0110\u1ECBa ch\u1EC9 \u0111\u1EA7y \u0111\u1EE7" />
                    </Form.Item>
                    <Row gutter={16}>
                      <Col span={8}>
                        <Form.Item name="payment_terms" label="\u0110i\u1EC1u kho\u1EA3n thanh to\u00E1n">
                          <Select
                            placeholder="Ch\u1ECDn"
                            allowClear
                            options={Object.entries(PAYMENT_TERMS_LABELS).map(
                              ([value, label]) => ({ value, label })
                            )}
                          />
                        </Form.Item>
                      </Col>
                      <Col span={8}>
                        <Form.Item name="default_incoterm" label="Incoterm m\u1EB7c \u0111\u1ECBnh">
                          <Select
                            placeholder="Ch\u1ECDn"
                            options={Object.entries(INCOTERM_LABELS).map(
                              ([value, label]) => ({ value, label })
                            )}
                          />
                        </Form.Item>
                      </Col>
                      <Col span={8}>
                        <Form.Item name="default_currency" label="Ti\u1EC1n t\u1EC7">
                          <Select
                            placeholder="Ch\u1ECDn"
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
                        <Form.Item name="credit_limit" label="H\u1EA1n m\u1EE9c t\u00EDn d\u1EE5ng (USD)">
                          <Input type="number" placeholder="0" />
                        </Form.Item>
                      </Col>
                      <Col span={8}>
                        <Form.Item
                          name="tier"
                          label="H\u1EA1ng kh\u00E1ch h\u00E0ng"
                          rules={[{ required: true }]}
                        >
                          <Select
                            options={[
                              { value: 'standard', label: 'Standard - Ti\u00EAu chu\u1EA9n' },
                              { value: 'premium', label: 'Premium - Cao c\u1EA5p' },
                              { value: 'strategic', label: 'Strategic - Chi\u1EBFn l\u01B0\u1EE3c' },
                            ]}
                          />
                        </Form.Item>
                      </Col>
                      <Col span={8}>
                        <Form.Item
                          name="status"
                          label="Tr\u1EA1ng th\u00E1i"
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
                    <Form.Item name="notes" label="Ghi ch\u00FA">
                      <Input.TextArea rows={2} placeholder="Ghi ch\u00FA th\u00EAm..." />
                    </Form.Item>
                  </>
                ),
              },
              {
                key: 'quality',
                label: 'Ch\u1EA5t l\u01B0\u1EE3ng',
                children: (
                  <>
                    <Row gutter={16}>
                      <Col span={12}>
                        <Form.Item
                          name="quality_standard"
                          label="Ti\u00EAu chu\u1EA9n ch\u1EA5t l\u01B0\u1EE3ng"
                        >
                          <Select
                            placeholder="Ch\u1ECDn ti\u00EAu chu\u1EA9n"
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
                          label="Y\u00EAu c\u1EA7u m\u1EABu tr\u01B0\u1EDBc xu\u1EA5t"
                          valuePropName="checked"
                        >
                          <Switch
                            checkedChildren="C\u00F3"
                            unCheckedChildren="Kh\u00F4ng"
                          />
                        </Form.Item>
                      </Col>
                    </Row>
                    <Form.Item
                      name="preferred_grades"
                      label="Grade \u01B0u ti\u00EAn (SVR)"
                    >
                      <Select
                        mode="multiple"
                        placeholder="Ch\u1ECDn c\u00E1c grade"
                        options={SVR_GRADE_OPTIONS.map((g) => ({
                          value: g.value,
                          label: g.label,
                        }))}
                      />
                    </Form.Item>
                    <Form.Item
                      name="custom_specs"
                      label="Y\u00EAu c\u1EA7u k\u1EF9 thu\u1EADt ri\u00EAng (JSON)"
                      help='VD: {"PRI_min": 60, "dirt_max": 0.03}'
                    >
                      <Input.TextArea
                        rows={4}
                        placeholder='{"key": "value"}'
                      />
                    </Form.Item>
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
