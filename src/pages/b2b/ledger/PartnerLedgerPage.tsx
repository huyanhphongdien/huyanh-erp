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
import dayjs, { Dayjs } from 'dayjs'
import { DASH, fmtDate, fmtVnd, vndInputProps } from '../../../utils/format'
import { dichLoiHeThong } from '../../../utils/dichLoiHeThong'
import PageState from '../../../components/common/PageState'
import { palette } from '../../../theme/palette'
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

const entryTypeOptions = [
  { label: 'Tất cả', value: 'all' },
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
  // Lỗi tải sổ — hiện khối lỗi + Thử lại thay vì bảng trống giả (audit 17/11/2026)
  const [loadError, setLoadError] = useState<unknown>(null)

  const fetchEntries = useCallback(async () => {
    if (!partnerId) return
    setLoading(true)
    setLoadError(null)
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
      setLoadError(err)
      message.error(dichLoiHeThong(err, 'Không thể tải dữ liệu sổ cái'))
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
        // Manual adjustment → split debit/credit theo loại NV chọn.
        entry_type: (isDebit ? 'adjustment_debit' : 'adjustment_credit') as LedgerEntryType,
        description: values.description,
        entry_date: values.entry_date
          ? values.entry_date.format('YYYY-MM-DD')
          : dayjs().format('YYYY-MM-DD'),
        debit: isDebit ? values.amount : 0,
        credit: isDebit ? 0 : values.amount,
      }
      await ledgerService.createManualEntry(data)
      message.success('Tạo bút toán thành công')
      setModalOpen(false)
      form.resetFields()
      fetchEntries()
    } catch (err) {
      message.error(dichLoiHeThong(err, 'Tạo bút toán thất bại'))
    } finally {
      setSubmitting(false)
    }
  }

  const columns = [
    {
      title: 'Ngày',
      dataIndex: 'entry_date',
      key: 'entry_date',
      width: 120,
      render: (date: string) => fmtDate(date),
    },
    {
      title: 'Loại',
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
      title: 'Mã tham chiếu',
      dataIndex: 'reference_code',
      key: 'reference_code',
      width: 160,
    },
    {
      title: 'Mô tả',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
    },
    {
      title: 'Nợ',
      dataIndex: 'debit',
      key: 'debit',
      width: 140,
      align: 'right' as const,
      render: (value: number) =>
        value > 0 ? (
          <span style={{ color: palette.danger, fontWeight: 500 }}>
            {fmtVnd(value)}
          </span>
        ) : (
          DASH
        ),
    },
    {
      title: 'Có',
      dataIndex: 'credit',
      key: 'credit',
      width: 140,
      align: 'right' as const,
      render: (value: number) =>
        value > 0 ? (
          <span style={{ color: palette.success, fontWeight: 500 }}>
            {fmtVnd(value)}
          </span>
        ) : (
          DASH
        ),
    },
    {
      title: 'Số dư',
      dataIndex: 'running_balance',
      key: 'running_balance',
      width: 150,
      align: 'right' as const,
      render: (value: number) => (
        <span style={{ fontWeight: 600 }}>{fmtVnd(value)}</span>
      ),
    },
  ]

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
        <Col>
          <Space align="center" size="middle">
            <Tooltip title="Quay lại">
              <Button
                icon={<ArrowLeftOutlined />}
                onClick={() => navigate(-1)}
                type="text"
                size="large"
              />
            </Tooltip>
            <Title level={3} style={{ margin: 0 }}>
              Sổ cái đối tác
            </Title>
          </Space>
        </Col>
        <Col>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setModalOpen(true)}
          >
            Tạo bút toán
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
              placeholder={['Từ ngày', 'Đến ngày']}
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
              placeholder="Loại bút toán"
            />
          </Col>
          <Col>
            <Tooltip title="Tải lại">
              <Button icon={<ReloadOutlined />} onClick={fetchEntries} />
            </Tooltip>
          </Col>
        </Row>
      </Card>

      {/* Table */}
      <Card style={{ borderRadius: 12 }}>
        <PageState error={!loading && loadError} onRetry={fetchEntries}>
        <Table
          dataSource={entries}
          columns={columns}
          rowKey={(record) => record.id || `${record.reference_code ?? 'r'}-${record.created_at ?? ''}`}
          loading={loading}
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total,
            showSizeChanger: true,
            showTotal: (t) => `Tổng ${t.toLocaleString('vi-VN')} bút toán`,
          }}
          onChange={handleTableChange}
          scroll={{ x: 900 }}
        />
        </PageState>
      </Card>

      {/* Create Entry Modal */}
      <Modal
        title="Tạo bút toán điều chỉnh"
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
            label="Số tiền"
            name="amount"
            rules={[
              { required: true, message: 'Vui lòng nhập số tiền' },
              {
                type: 'number',
                min: 1,
                message: 'Số tiền phải lớn hơn 0',
              },
            ]}
          >
            <InputNumber
              style={{ width: '100%' }}
              {...vndInputProps}
              placeholder="Nhập số tiền"
              suffix="₫"
              min={1}
            />
          </Form.Item>

          {/* Chiều bút toán ghi rõ hệ quả — 'No'/'Co' trần từng đọc như tiếng Anh (audit 17/11/2026).
              Theo đúng chiều sổ: DEBIT = nghĩa vụ nhà máy phải trả đối tác (quyết toán duyệt, giao mủ),
              CREDIT = đã chi / khấu trừ (tạm ứng, thanh toán) — xem paymentRequestService "DEBIT (giao mủ)". */}
          <Form.Item
            label="Loại bút toán"
            name="type"
            rules={[{ required: true, message: 'Vui lòng chọn loại' }]}
            extra="Số dư = Nợ − Có. Dương: nhà máy còn phải trả đối tác · Âm: đối tác đang nợ nhà máy (vd tạm ứng vượt)."
          >
            <Radio.Group>
              <Radio value="debit">Nợ — cộng cho đối tác (nhà máy phải trả thêm)</Radio>
              <Radio value="credit">Có — trừ tiền đối tác (giảm số phải trả)</Radio>
            </Radio.Group>
          </Form.Item>

          <Form.Item
            label="Mô tả"
            name="description"
            rules={[{ required: true, message: 'Vui lòng nhập mô tả' }]}
          >
            <Input placeholder="Nhập mô tả bút toán" />
          </Form.Item>

          <Form.Item
            label="Ngày bút toán"
            name="entry_date"
            rules={[{ required: true, message: 'Vui lòng chọn ngày' }]}
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
                Huỷ
              </Button>
              <Button type="primary" htmlType="submit" loading={submitting}>
                Tạo bút toán
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default PartnerLedgerPage
