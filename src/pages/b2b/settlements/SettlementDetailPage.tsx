import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Card, Descriptions, Tag, Button, Space, Typography, Row, Col, Table, Divider, Spin, Empty, Modal, Form, Input, Statistic, message, Breadcrumb, Popconfirm } from 'antd'
import { ArrowLeftOutlined, CheckCircleOutlined, CloseCircleOutlined, DollarOutlined, PrinterOutlined, EditOutlined } from '@ant-design/icons'
import { settlementService, Settlement, SettlementStatus, SETTLEMENT_STATUS_LABELS, SETTLEMENT_STATUS_COLORS, SETTLEMENT_TYPE_LABELS } from '../../../services/b2b/settlementService'
import PaymentForm from '../../../components/b2b/PaymentForm'
import { SettlementStatusTag } from '../../../components/ui/StatusTag'
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'

const { Title, Text } = Typography

const TIER_COLORS: Record<string, string> = { diamond: 'purple', gold: 'gold', silver: 'default', bronze: 'orange', new: 'cyan' }

const formatCurrency = (value: number | null): string => {
  if (!value) return '-'
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value)
}

const formatDate = (dateStr: string | null): string => {
  if (!dateStr) return '-'
  return format(new Date(dateStr), 'dd/MM/yyyy', { locale: vi })
}

const formatNumber = (value: number | null): string => {
  if (!value) return '-'
  return value.toLocaleString('vi-VN')
}

const SettlementDetailPage = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [settlement, setSettlement] = useState<Settlement | null>(null)
  const [loading, setLoading] = useState(true)
  const [approvalModalOpen, setApprovalModalOpen] = useState(false)
  const [paymentModalOpen, setPaymentModalOpen] = useState(false)
  const [approvalForm] = Form.useForm()

  const fetchSettlement = useCallback(async () => {
    if (!id) return
    try {
      setLoading(true)
      const data = await settlementService.getSettlementById(id)
      setSettlement(data)
    } catch (err) {
      message.error('Không thể tải thông tin phiếu quyết toán')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    fetchSettlement()
  }, [fetchSettlement])

  const handleSubmitForApproval = async () => {
    if (!id) return
    try {
      await settlementService.submitForApproval(id)
      message.success('Đã gửi duyệt thành công')
      fetchSettlement()
    } catch (err) {
      message.error('Gửi duyệt thất bại')
    }
  }

  const handleApprove = async () => {
    if (!id) return
    try {
      const values = await approvalForm.validateFields()
      await settlementService.approveSettlement(id, 'current-user-id', values.approval_notes)
      message.success('Đã duyệt phiếu quyết toán')
      setApprovalModalOpen(false)
      approvalForm.resetFields()
      fetchSettlement()
    } catch (err) {
      message.error('Duyệt phiếu thất bại')
    }
  }

  const handleCancel = async () => {
    if (!id) return
    try {
      await settlementService.cancelSettlement(id)
      message.success('Đã hủy phiếu quyết toán')
      fetchSettlement()
    } catch (err) {
      message.error('Hủy phiếu thất bại')
    }
  }

  const handleDelete = async () => {
    if (!id) return
    try {
      await settlementService.deleteSettlement(id)
      message.success('Đã xóa phiếu quyết toán')
      navigate('/b2b/settlements')
    } catch (err) {
      message.error('Xóa phiếu thất bại')
    }
  }

  const handlePaymentSuccess = () => {
    setPaymentModalOpen(false)
    fetchSettlement()
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Spin size="large" />
      </div>
    )
  }

  if (!settlement) {
    return (
      <Empty description="Không tìm thấy phiếu quyết toán" />
    )
  }

  const itemColumns = [
    { title: 'Loại', dataIndex: 'item_type', key: 'item_type' },
    { title: 'Mô tả', dataIndex: 'description', key: 'description' },
    { title: 'SL', dataIndex: 'quantity', key: 'quantity', render: (v: number) => formatNumber(v) },
    { title: 'Đơn giá', dataIndex: 'unit_price', key: 'unit_price', render: (v: number) => formatCurrency(v) },
    { title: 'Thành tiền', dataIndex: 'amount', key: 'amount', render: (v: number) => formatCurrency(v) },
    { title: 'Nợ/Có', dataIndex: 'is_credit', key: 'is_credit', render: (v: boolean) => v ? 'Có' : 'Nợ' },
  ]

  const advanceColumns = [
    { title: 'Ngày', dataIndex: 'date', key: 'date', render: (v: string) => formatDate(v) },
    { title: 'Số tiền', dataIndex: 'amount', key: 'amount', render: (v: number) => formatCurrency(v) },
    { title: 'Ghi chú', dataIndex: 'note', key: 'note' },
  ]

  const paymentColumns = [
    { title: 'Ngày', dataIndex: 'date', key: 'date', render: (v: string) => formatDate(v) },
    { title: 'Số tiền', dataIndex: 'amount', key: 'amount', render: (v: number) => formatCurrency(v) },
    {
      title: 'Phương thức', dataIndex: 'method', key: 'method',
      render: (v: string) => {
        const labels: Record<string, string> = { bank_transfer: 'Chuyển khoản', cash: 'Tiền mặt', check: 'Séc' }
        return labels[v] || v
      },
    },
    { title: 'Người nhận', dataIndex: 'recipient', key: 'recipient' },
    { title: 'Ngân hàng', dataIndex: 'bank', key: 'bank' },
    { title: 'Ghi chú', dataIndex: 'note', key: 'note' },
  ]

  const renderActionButtons = () => {
    const buttons: React.ReactNode[] = []

    if (settlement.status === 'draft') {
      buttons.push(
        <Button key="submit" type="primary" onClick={handleSubmitForApproval}>
          Gửi duyệt
        </Button>,
        <Popconfirm key="delete" title="Bạn có chắc muốn xóa phiếu này?" onConfirm={handleDelete} okText="Xóa" cancelText="Hủy">
          <Button danger>Xóa</Button>
        </Popconfirm>
      )
    }

    if (settlement.status === 'pending') {
      buttons.push(
        <Button key="approve" type="primary" icon={<CheckCircleOutlined />} onClick={() => setApprovalModalOpen(true)}>
          Duyệt
        </Button>
      )
    }

    if (settlement.status === 'approved') {
      buttons.push(
        <Button key="payment" type="primary" icon={<DollarOutlined />} onClick={() => setPaymentModalOpen(true)}>
          Ghi nhận thanh toán
        </Button>
      )
    }

    if (settlement.status !== 'cancelled' && settlement.status !== 'paid') {
      buttons.push(
        <Popconfirm key="cancel" title="Bạn có chắc muốn hủy phiếu này?" onConfirm={handleCancel} okText="Hủy phiếu" cancelText="Đóng">
          <Button danger icon={<CloseCircleOutlined />}>Hủy</Button>
        </Popconfirm>
      )
    }

    return buttons
  }

  return (
    <div style={{ padding: 24 }}>
      <Breadcrumb
        style={{ marginBottom: 16 }}
        items={[
          { title: 'B2B' },
          { title: <a onClick={() => navigate('/b2b/settlements')}>Quyết toán</a> },
          { title: settlement.code },
        ]}
      />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)} />
          <Title level={4} style={{ margin: 0 }}>{settlement.code}</Title>
        </Space>
        <Space>{renderActionButtons()}</Space>
      </div>

      <Row gutter={16}>
        {/* Left column */}
        <Col span={16}>
          <Card title="Thông tin quyết toán" style={{ borderRadius: 8, marginBottom: 16 }}>
            <Descriptions column={2} bordered size="small">
              <Descriptions.Item label="Mã QT">{settlement.code}</Descriptions.Item>
              <Descriptions.Item label="Loại">
                <Tag>{SETTLEMENT_TYPE_LABELS[settlement.settlement_type] || settlement.settlement_type}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Sản phẩm">{settlement.product_type || '-'}</Descriptions.Item>
              <Descriptions.Item label="KL cân">{settlement.weighed_kg ? `${formatNumber(settlement.weighed_kg)} kg` : '-'}</Descriptions.Item>
              <Descriptions.Item label="KL thành phẩm">{settlement.finished_kg ? `${formatNumber(settlement.finished_kg)} kg` : '-'}</Descriptions.Item>
              <Descriptions.Item label="DRC">{settlement.drc_percent ? `${settlement.drc_percent}%` : '-'}</Descriptions.Item>
              <Descriptions.Item label="Đơn giá duyệt">{formatCurrency(settlement.approved_price)}</Descriptions.Item>
              <Descriptions.Item label="Biển số xe">{settlement.vehicle_plates?.join(', ') || '-'}</Descriptions.Item>
              <Descriptions.Item label="Tài xế">
                {settlement.driver_name ? `${settlement.driver_name}${settlement.driver_phone ? ` - ${settlement.driver_phone}` : ''}` : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Ngày cân">
                {settlement.weigh_date_start || settlement.weigh_date_end
                  ? `${formatDate(settlement.weigh_date_start)} - ${formatDate(settlement.weigh_date_end)}`
                  : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Ngày nhập kho">{formatDate(settlement.stock_in_date)}</Descriptions.Item>
              <Descriptions.Item label="Ghi chú" span={2}>{settlement.notes || '-'}</Descriptions.Item>
            </Descriptions>
          </Card>

          <Card title="Hạng mục" style={{ borderRadius: 8, marginBottom: 16 }}>
            <Table
              dataSource={settlement.items || []}
              columns={itemColumns}
              rowKey="id"
              pagination={false}
              size="small"
            />
          </Card>

          <Card title="Tạm ứng đã trừ" style={{ borderRadius: 8, marginBottom: 16 }}>
            <Table
              dataSource={settlement.advances || []}
              columns={advanceColumns}
              rowKey="id"
              pagination={false}
              size="small"
            />
          </Card>

          <Card title="Lịch sử thanh toán" style={{ borderRadius: 8, marginBottom: 16 }}>
            <Table
              dataSource={settlement.payments || []}
              columns={paymentColumns}
              rowKey="id"
              pagination={false}
              size="small"
            />
          </Card>
        </Col>

        {/* Right column */}
        <Col span={8}>
          <Card title="Đối tác" style={{ borderRadius: 8, marginBottom: 16 }}>
            <Descriptions column={1} size="small">
              <Descriptions.Item label="Tên">{settlement.partner?.name || '-'}</Descriptions.Item>
              <Descriptions.Item label="Mã">{settlement.partner?.code || '-'}</Descriptions.Item>
              <Descriptions.Item label="Hạng">
                {settlement.partner?.tier ? (
                  <Tag color={TIER_COLORS[settlement.partner.tier] || 'default'}>
                    {settlement.partner.tier.toUpperCase()}
                  </Tag>
                ) : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="SĐT">{settlement.partner?.phone || '-'}</Descriptions.Item>
            </Descriptions>
          </Card>

          <Card title="Tổng hợp tài chính" style={{ borderRadius: 8, marginBottom: 16 }}>
            <Row gutter={[16, 16]}>
              <Col span={12}>
                <Statistic
                  title="Tổng tiền hàng"
                  value={settlement.gross_amount || 0}
                  formatter={(val) => formatCurrency(val as number)}
                  valueStyle={{ color: '#1B4D3E' }}
                />
              </Col>
              <Col span={12}>
                <Statistic
                  title="Tạm ứng"
                  value={settlement.total_advance || 0}
                  formatter={(val) => formatCurrency(val as number)}
                  valueStyle={{ color: 'orange' }}
                />
              </Col>
              <Col span={12}>
                <Statistic
                  title="Đã thanh toán"
                  value={settlement.total_paid_post || 0}
                  formatter={(val) => formatCurrency(val as number)}
                  valueStyle={{ color: 'blue' }}
                />
              </Col>
              <Col span={12}>
                <Statistic
                  title="Còn phải trả"
                  value={settlement.remaining_amount || 0}
                  formatter={(val) => formatCurrency(val as number)}
                  valueStyle={{ color: 'red', fontWeight: 'bold' }}
                />
              </Col>
            </Row>
          </Card>

          <Card title="Trạng thái" style={{ borderRadius: 8, marginBottom: 16 }}>
            <div style={{ marginBottom: 12 }}>
              <SettlementStatusTag status={settlement.status} />
            </div>
            {settlement.status === 'approved' && settlement.approved_by && (
              <Descriptions column={1} size="small">
                <Descriptions.Item label="Người duyệt">{settlement.approved_by}</Descriptions.Item>
                <Descriptions.Item label="Ngày duyệt">{formatDate(settlement.approved_at)}</Descriptions.Item>
                {settlement.approval_notes && (
                  <Descriptions.Item label="Ghi chú duyệt">{settlement.approval_notes}</Descriptions.Item>
                )}
              </Descriptions>
            )}
          </Card>
        </Col>
      </Row>

      {/* Approval Modal */}
      <Modal
        title="Duyệt phiếu quyết toán"
        open={approvalModalOpen}
        onCancel={() => {
          setApprovalModalOpen(false)
          approvalForm.resetFields()
        }}
        onOk={handleApprove}
        okText="Xác nhận duyệt"
        cancelText="Hủy"
      >
        <Form form={approvalForm} layout="vertical">
          <Form.Item name="approval_notes" label="Ghi chú duyệt">
            <Input.TextArea rows={4} placeholder="Nhập ghi chú duyệt (nếu có)" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Payment Modal */}
      <Modal
        title="Ghi nhận thanh toán"
        open={paymentModalOpen}
        onCancel={() => setPaymentModalOpen(false)}
        footer={null}
        destroyOnHidden
      >
        <PaymentForm
          settlementId={id!}
          maxAmount={settlement.remaining_amount || 0}
          createdBy="current-user-id"
          onSuccess={handlePaymentSuccess}
          onCancel={() => setPaymentModalOpen(false)}
        />
      </Modal>
    </div>
  )
}

export default SettlementDetailPage
