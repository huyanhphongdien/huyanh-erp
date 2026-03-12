import React, { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Card,
  Table,
  Button,
  Space,
  Typography,
  Row,
  Col,
  Tag,
  Modal,
  Form,
  Input,
  InputNumber,
  DatePicker,
  Select,
  Radio,
  message,
  Tooltip,
} from 'antd'
import { ArrowLeftOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'
import dayjs, { Dayjs } from 'dayjs'
import {
  ledgerService,
  LedgerEntry,
  LedgerEntryType,
  ENTRY_TYPE_LABELS,
  ENTRY_TYPE_COLORS,
  LedgerCreateData,
} from '../../../services/b2b/ledgerService'
import LedgerBalanceCard from '../../../components/b2b/LedgerBalanceCard'

const { Title } = Typography
const { RangePicker } = DatePicker

const formatCurrency = (value: number) =>
  `${new Intl.NumberFormat('vi-VN').format(value)} ₫`

const entryTypeOptions = [
  { label: 'Tat ca', value: 'all' },
  ...Object.entries(ENTRY_TYPE_LABELS).map(([value, label]) => ({
    label,
    value,
  })),
]

const PartnerLedgerPage: React.FC = () => {
  const { partnerId } = useParams<{ partnerId: string }>()
  const navigate = useNavigate()
  const [form] = Form.useForm()

  const [entries, setEntries] = useState<LedgerEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20 })
  const [modalOpen, setModalOpen] = useState(false)
  const [entryTypeFilter, setEntryTypeFilter] = useState<string>('all')
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const fetchEntries = useCallback(async () => {
    if (!partnerId) return
    setLoading(true)
    try {
      const params: Record<string, any> = {
        partner_id: partnerId,
        page: pagination.current,
        page_size: pagination.pageSize,
      }
      if (entryTypeFilter !== 'all') {
        params.entry_type = entryTypeFilter
      }
      if (dateRange && dateRange[0]) {
        params.date_from = dateRange[0].format('YYYY-MM-DD')
      }
      if (dateRange && dateRange[1]) {
        params.date_to = dateRange[1].format('YYYY-MM-DD')
      }
      const res = await ledgerService.getEntries(params)
      setEntries(res.data)
      setTotal(res.total)
    } catch (err) {
      message.error('Khong the tai du lieu so cai')
    } finally {
      setLoading(false)
    }
  }, [partnerId, pagination, entryTypeFilter, dateRange])

  useEffect(() => {
    fetchEntries()
  }, [fetchEntries])

  const handleTableChange = (pag: any) => {
    setPagination({ current: pag.current, pageSize: pag.pageSize })
  }

  const handleCreateEntry = async (values: any) => {
    if (!partnerId) return
    setSubmitting(true)
    try {
      const isDebit = values.type === 'debit'
      const data: LedgerCreateData = {
        partner_id: partnerId,
        entry_type: 'adjustment' as LedgerEntryType,
        description: values.description,
        entry_date: values.entry_date
          ? values.entry_date.format('YYYY-MM-DD')
          : dayjs().format('YYYY-MM-DD'),
        debit: isDebit ? values.amount : 0,
        credit: isDebit ? 0 : values.amount,
      }
      await ledgerService.createManualEntry(data)
      message.success('Tao but toan thanh cong')
      setModalOpen(false)
      form.resetFields()
      fetchEntries()
    } catch (err) {
      message.error('Tao but toan that bai')
    } finally {
      setSubmitting(false)
    }
  }

  const columns = [
    {
      title: 'Ngay',
      dataIndex: 'entry_date',
      key: 'entry_date',
      width: 120,
      render: (date: string) => {
        try {
          return format(new Date(date), 'dd/MM/yyyy', { locale: vi })
        } catch {
          return date
        }
      },
    },
    {
      title: 'Loai',
      dataIndex: 'entry_type',
      key: 'entry_type',
      width: 140,
      render: (type: LedgerEntryType) => (
        <Tag color={ENTRY_TYPE_COLORS[type] || 'default'}>
          {ENTRY_TYPE_LABELS[type] || type}
        </Tag>
      ),
    },
    {
      title: 'Ma tham chieu',
      dataIndex: 'reference_code',
      key: 'reference_code',
      width: 160,
    },
    {
      title: 'Mo ta',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
    },
    {
      title: 'No',
      dataIndex: 'debit',
      key: 'debit',
      width: 140,
      align: 'right' as const,
      render: (value: number) =>
        value > 0 ? (
          <span style={{ color: '#f5222d', fontWeight: 500 }}>
            {formatCurrency(value)}
          </span>
        ) : (
          '-'
        ),
    },
    {
      title: 'Co',
      dataIndex: 'credit',
      key: 'credit',
      width: 140,
      align: 'right' as const,
      render: (value: number) =>
        value > 0 ? (
          <span style={{ color: '#52c41a', fontWeight: 500 }}>
            {formatCurrency(value)}
          </span>
        ) : (
          '-'
        ),
    },
    {
      title: 'So du',
      dataIndex: 'running_balance',
      key: 'running_balance',
      width: 150,
      align: 'right' as const,
      render: (value: number) => (
        <span style={{ fontWeight: 600 }}>{formatCurrency(value)}</span>
      ),
    },
  ]

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
        <Col>
          <Space align="center" size="middle">
            <Tooltip title="Quay lai">
              <Button
                icon={<ArrowLeftOutlined />}
                onClick={() => navigate(-1)}
                type="text"
                size="large"
              />
            </Tooltip>
            <Title level={3} style={{ margin: 0 }}>
              So cai doi tac
            </Title>
          </Space>
        </Col>
        <Col>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setModalOpen(true)}
          >
            Tao but toan
          </Button>
        </Col>
      </Row>

      {/* Balance Card */}
      {partnerId && (
        <div style={{ marginBottom: 24 }}>
          <LedgerBalanceCard partnerId={partnerId} />
        </div>
      )}

      {/* Filters */}
      <Card style={{ borderRadius: 12, marginBottom: 24 }}>
        <Row gutter={16} align="middle">
          <Col>
            <RangePicker
              placeholder={['Tu ngay', 'Den ngay']}
              onChange={(dates) =>
                setDateRange(dates as [Dayjs | null, Dayjs | null] | null)
              }
              format="DD/MM/YYYY"
              allowClear
            />
          </Col>
          <Col>
            <Select
              value={entryTypeFilter}
              onChange={(val) => {
                setEntryTypeFilter(val)
                setPagination((prev) => ({ ...prev, current: 1 }))
              }}
              style={{ width: 200 }}
              options={entryTypeOptions}
              placeholder="Loai but toan"
            />
          </Col>
          <Col>
            <Tooltip title="Tai lai">
              <Button icon={<ReloadOutlined />} onClick={fetchEntries} />
            </Tooltip>
          </Col>
        </Row>
      </Card>

      {/* Table */}
      <Card style={{ borderRadius: 12 }}>
        <Table
          dataSource={entries}
          columns={columns}
          rowKey={(record) => record.id || record.reference_code || Math.random().toString()}
          loading={loading}
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total,
            showSizeChanger: true,
            showTotal: (t) => `Tong ${t} but toan`,
          }}
          onChange={handleTableChange}
          scroll={{ x: 900 }}
        />
      </Card>

      {/* Create Entry Modal */}
      <Modal
        title="Tao but toan dieu chinh"
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false)
          form.resetFields()
        }}
        footer={null}
        destroyOnHidden
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleCreateEntry}
          initialValues={{
            type: 'debit',
            entry_date: dayjs(),
          }}
        >
          <Form.Item
            label="So tien"
            name="amount"
            rules={[
              { required: true, message: 'Vui long nhap so tien' },
              {
                type: 'number',
                min: 1,
                message: 'So tien phai lon hon 0',
              },
            ]}
          >
            <InputNumber
              style={{ width: '100%' }}
              formatter={(value) =>
                `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
              }
              parser={(value) => Number(value?.replace(/,/g, '') || 0) as any}
              placeholder="Nhap so tien"
              suffix="₫"
              min={1}
            />
          </Form.Item>

          <Form.Item
            label="Loai"
            name="type"
            rules={[{ required: true, message: 'Vui long chon loai' }]}
          >
            <Radio.Group>
              <Radio value="debit">No</Radio>
              <Radio value="credit">Co</Radio>
            </Radio.Group>
          </Form.Item>

          <Form.Item
            label="Mo ta"
            name="description"
            rules={[{ required: true, message: 'Vui long nhap mo ta' }]}
          >
            <Input placeholder="Nhap mo ta but toan" />
          </Form.Item>

          <Form.Item
            label="Ngay but toan"
            name="entry_date"
            rules={[{ required: true, message: 'Vui long chon ngay' }]}
          >
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button
                onClick={() => {
                  setModalOpen(false)
                  form.resetFields()
                }}
              >
                Huy
              </Button>
              <Button type="primary" htmlType="submit" loading={submitting}>
                Tao but toan
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default PartnerLedgerPage
