// ============================================================================
// Daily Price List Page — Admin nhập giá ngày
// Phase 34 of B2B Intake v4
// ============================================================================

import { useState, useEffect } from 'react'
import { Card, Table, Button, Form, Input, InputNumber, Modal, Select, Typography,
  Space, Tag, message, Alert, Popconfirm } from 'antd'
import { PlusOutlined, HistoryOutlined, DeleteOutlined, DollarOutlined } from '@ant-design/icons'
import {
  listCurrentAll, listPriceHistory, setNewPrice, deletePrice,
  type DailyPrice,
} from '../../../services/b2b/dailyPriceListService'
import { fmtDateTime, vndInputProps } from '../../../utils/format'
import { dichLoiHeThong } from '../../../utils/dichLoiHeThong'
import PageState from '../../../components/common/PageState'

const { Title, Text } = Typography

const RUBBER_TYPES = [
  { value: 'mu_tap', label: 'Mủ tạp' },
  { value: 'mu_nuoc', label: 'Mủ nước' },
  { value: 'mu_cao_su', label: 'Mủ cao su' },
]

/** Mã loại mủ → tên tiếng Việt (cột + tiêu đề modal từng in mã máy 'mu_tap') */
const rubberLabel = (code: string) => RUBBER_TYPES.find(rt => rt.value === code)?.label || code

export default function DailyPriceListPage() {
  const [current, setCurrent] = useState<DailyPrice[]>([])
  const [loading, setLoading] = useState(false)
  // Lỗi tải ≠ bảng trống: trước đây lỗi chỉ toast rồi cảnh báo "Chưa có giá hôm nay" giả
  const [loadError, setLoadError] = useState<unknown>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [historyModalOpen, setHistoryModalOpen] = useState(false)
  const [historyProduct, setHistoryProduct] = useState<string>('')
  const [history, setHistory] = useState<DailyPrice[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [form] = Form.useForm()

  const load = async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const all = await listCurrentAll()
      setCurrent(all)
    } catch (e: any) {
      setLoadError(e)
      message.error(dichLoiHeThong(e, 'Không tải được bảng giá'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const openModal = () => {
    form.resetFields()
    setModalOpen(true)
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      await setNewPrice({
        product_code: values.product_code,
        base_price_per_kg: values.base_price_per_kg,
        notes: values.notes,
      })
      message.success('Đã chốt giá mới — giá cũ tự hết hiệu lực')
      setModalOpen(false)
      load()
    } catch (e: any) {
      // Lỗi kiểm tra form → antd đã tô đỏ ô, không bắn thêm toast
      if (e?.errorFields) return
      message.error(dichLoiHeThong(e, 'Lưu giá thất bại'))
    }
  }

  const showHistory = async (productCode: string) => {
    setHistoryProduct(productCode)
    setHistory([])
    setHistoryModalOpen(true)
    setHistoryLoading(true)
    try {
      const h = await listPriceHistory(productCode)
      setHistory(h)
    } catch (e) {
      message.error(dichLoiHeThong(e, 'Không tải được lịch sử giá'))
    } finally {
      setHistoryLoading(false)
    }
  }

  // Bọc try/catch — trước đây xoá lỗi là im lặng (promise reject không ai bắt, không báo gì)
  const handleDelete = async (id: string) => {
    try {
      await deletePrice(id)
      message.success('Đã xoá')
      load()
    } catch (e) {
      message.error(dichLoiHeThong(e, 'Xoá giá thất bại'))
    }
  }

  // Check products chưa có giá hôm nay (chỉ khi tải THÀNH CÔNG — lỗi tải không được báo "chưa có giá")
  const productsNoPrice = loadError ? [] : RUBBER_TYPES.filter(
    rt => !current.find(c => c.product_code === rt.value)
  )

  const columns = [
    {
      title: 'Loại mủ',
      dataIndex: 'product_code',
      render: (v: string) => <Tag color="blue">{rubberLabel(v)}</Tag>,
    },
    {
      title: 'Giá nền (₫/kg)',
      dataIndex: 'base_price_per_kg',
      render: (v: number) => <strong>{v.toLocaleString('vi-VN')}</strong>,
      align: 'right' as const,
    },
    {
      title: 'Hiệu lực từ',
      dataIndex: 'effective_from',
      render: (v: string) => fmtDateTime(v),
    },
    {
      title: 'Ghi chú',
      dataIndex: 'notes',
      ellipsis: true,
    },
    {
      title: 'Thao tác',
      render: (_: any, row: DailyPrice) => (
        <Space>
          <Button size="small" icon={<HistoryOutlined />} onClick={() => showHistory(row.product_code)}>
            Lịch sử
          </Button>
          <Popconfirm
            title="Xoá giá này?"
            description="Giá bị xoá sẽ không còn áp cho phiếu cân mới."
            okText="Xoá"
            cancelText="Không"
            okButtonProps={{ danger: true }}
            onConfirm={() => handleDelete(row.id)}
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div style={{ padding: 24 }}>
      <Title level={3}><DollarOutlined /> Bảng giá ngày</Title>
      <Text type="secondary">
        Giá áp cho phiếu cân mủ lẻ và mua đứt. Nhập giá mới thì giá cũ tự hết hiệu lực.
      </Text>

      {productsNoPrice.length > 0 && (
        <Alert type="warning" showIcon style={{ marginTop: 16 }}
          message="Chưa có giá hôm nay cho:"
          description={productsNoPrice.map(p => p.label).join(' · ')} />
      )}

      <Card style={{ marginTop: 16 }}
        title="Giá hiện hành"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={openModal}>
            Nhập giá mới
          </Button>
        }>
        <PageState error={!loading && loadError} onRetry={load}>
          <Table
            loading={loading}
            dataSource={current}
            columns={columns}
            rowKey="id"
            pagination={false}
          />
        </PageState>
      </Card>

      <Modal
        open={modalOpen}
        title="Nhập giá mới (giá cũ tự hết hiệu lực)"
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        okText="Lưu"
        cancelText="Huỷ"
      >
        <Form form={form} layout="vertical">
          <Form.Item name="product_code" label="Loại sản phẩm" rules={[{ required: true, message: 'Chọn loại sản phẩm' }]}>
            <Select options={RUBBER_TYPES} placeholder="Chọn" />
          </Form.Item>
          <Form.Item name="base_price_per_kg" label="Giá nền ₫/kg"
            rules={[{ required: true, type: 'number', min: 1, message: 'Nhập giá nền lớn hơn 0' }]}>
            <InputNumber<number> min={0} step={1000}
              {...vndInputProps}
              style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="notes" label="Ghi chú">
            <Input.TextArea rows={2} placeholder="VD: giá theo SMR 20 hôm nay + biên 5%" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={historyModalOpen}
        title={`Lịch sử giá — ${rubberLabel(historyProduct)}`}
        onCancel={() => setHistoryModalOpen(false)}
        footer={null}
        width={700}
      >
        <Table size="small" dataSource={history} rowKey="id" pagination={false} loading={historyLoading}
          columns={[
            { title: 'Từ', dataIndex: 'effective_from', render: v => fmtDateTime(v) },
            { title: 'Đến', dataIndex: 'effective_to', render: v => v ? fmtDateTime(v) : <Tag>Hiện hành</Tag> },
            { title: 'Giá (₫/kg)', dataIndex: 'base_price_per_kg', render: v => v.toLocaleString('vi-VN'), align: 'right' as const },
            { title: 'Ghi chú', dataIndex: 'notes', ellipsis: true },
          ]} />
      </Modal>
    </div>
  )
}
