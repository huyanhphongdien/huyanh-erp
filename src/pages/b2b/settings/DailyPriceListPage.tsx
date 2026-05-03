// ============================================================================
// Daily Price List Page — Admin nhập giá ngày
// Phase 34 of B2B Intake v4
// ============================================================================

import { useState, useEffect } from 'react'
import { Card, Table, Button, Form, Input, InputNumber, Modal, Select, Typography,
  Space, Tag, message, Alert, Popconfirm } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, DollarOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import {
  listCurrentAll, listPriceHistory, setNewPrice, deletePrice,
  type DailyPrice,
} from '../../../services/b2b/dailyPriceListService'

const { Title, Text } = Typography

const RUBBER_TYPES = [
  { value: 'mu_tap', label: 'Mủ tạp' },
  { value: 'mu_nuoc', label: 'Mủ nước' },
  { value: 'mu_cao_su', label: 'Mủ cao su' },
]

export default function DailyPriceListPage() {
  const [current, setCurrent] = useState<DailyPrice[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [historyModalOpen, setHistoryModalOpen] = useState(false)
  const [historyProduct, setHistoryProduct] = useState<string>('')
  const [history, setHistory] = useState<DailyPrice[]>([])
  const [form] = Form.useForm()

  const load = async () => {
    setLoading(true)
    try {
      const all = await listCurrentAll()
      setCurrent(all)
    } catch (e: any) {
      message.error(e.message || 'Load failed')
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
      message.success('Đã set giá mới (giá cũ tự close)')
      setModalOpen(false)
      load()
    } catch (e: any) {
      message.error(e.message || 'Failed')
    }
  }

  const showHistory = async (productCode: string) => {
    setHistoryProduct(productCode)
    setHistoryModalOpen(true)
    const h = await listPriceHistory(productCode)
    setHistory(h)
  }

  const handleDelete = async (id: string) => {
    await deletePrice(id)
    message.success('Đã xoá')
    load()
  }

  // Check products chưa có giá hôm nay
  const productsNoPrice = RUBBER_TYPES.filter(
    rt => !current.find(c => c.product_code === rt.value)
  )

  const columns = [
    {
      title: 'Loại mủ',
      dataIndex: 'product_code',
      render: (v: string) => <Tag color="blue">{v}</Tag>,
    },
    {
      title: 'Giá nền (VNĐ/kg)',
      dataIndex: 'base_price_per_kg',
      render: (v: number) => <strong>{v.toLocaleString('vi-VN')}</strong>,
      align: 'right' as const,
    },
    {
      title: 'Hiệu lực từ',
      dataIndex: 'effective_from',
      render: (v: string) => dayjs(v).format('DD/MM/YYYY HH:mm'),
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
          <Button size="small" icon={<EditOutlined />} onClick={() => showHistory(row.product_code)}>
            Lịch sử
          </Button>
          <Popconfirm title="Xoá?" onConfirm={() => handleDelete(row.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <Title level={3}><DollarOutlined /> Bảng giá ngày (Daily Price List)</Title>
      <Text type="secondary">
        Admin set giá ngày cho flow walk-in (hộ nông dân) + outright. Giá cũ tự close khi set mới.
        tstzrange EXCLUDE chống overlap ở DB.
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
            Set giá mới
          </Button>
        }>
        <Table
          loading={loading}
          dataSource={current}
          columns={columns}
          rowKey="id"
          pagination={false}
        />
      </Card>

      <Modal
        open={modalOpen}
        title="Set giá mới (tự close giá cũ)"
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        okText="Lưu"
      >
        <Form form={form} layout="vertical">
          <Form.Item name="product_code" label="Loại sản phẩm" rules={[{ required: true }]}>
            <Select options={RUBBER_TYPES} placeholder="Chọn" />
          </Form.Item>
          <Form.Item name="base_price_per_kg" label="Giá nền VNĐ/kg"
            rules={[{ required: true, type: 'number', min: 1 }]}>
            <InputNumber<number> min={0} step={1000}
              formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
              parser={v => Number(String(v).replace(/\D/g, '')) || 0}
              style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="notes" label="Ghi chú">
            <Input.TextArea rows={2} placeholder="VD: giá theo SMR 20 hôm nay + biên 5%" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={historyModalOpen}
        title={`Lịch sử giá — ${historyProduct}`}
        onCancel={() => setHistoryModalOpen(false)}
        footer={null}
        width={700}
      >
        <Table size="small" dataSource={history} rowKey="id" pagination={false}
          columns={[
            { title: 'Từ', dataIndex: 'effective_from', render: v => dayjs(v).format('DD/MM HH:mm') },
            { title: 'Đến', dataIndex: 'effective_to', render: v => v ? dayjs(v).format('DD/MM HH:mm') : <Tag>Hiện hành</Tag> },
            { title: 'Giá', dataIndex: 'base_price_per_kg', render: v => v.toLocaleString('vi-VN'), align: 'right' as const },
            { title: 'Notes', dataIndex: 'notes', ellipsis: true },
          ]} />
      </Modal>
    </div>
  )
}
