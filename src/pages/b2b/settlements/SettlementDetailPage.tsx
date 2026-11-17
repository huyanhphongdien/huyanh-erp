import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Alert, Card, Descriptions, Tag, Button, Space, Typography, Row, Col, Table, Divider, Spin, Empty, Modal, Form, Input, Select, Statistic, message, Breadcrumb, Popconfirm, InputNumber } from 'antd'
import { ArrowLeftOutlined, CheckCircleOutlined, CloseCircleOutlined, DollarOutlined, PrinterOutlined, EditOutlined, SendOutlined, PlusOutlined } from '@ant-design/icons'
import { settlementService, Settlement, SettlementStatus, SETTLEMENT_STATUS_LABELS, SETTLEMENT_STATUS_COLORS, SETTLEMENT_TYPE_LABELS } from '../../../services/b2b/settlementService'
import { paymentService, PAYMENT_METHOD_LABELS } from '../../../services/b2b/paymentService'
import PaymentForm from '../../../components/b2b/PaymentForm'
import ApprovalTimeline from '../../../components/b2b/ApprovalTimeline'
import { SettlementStatusTag } from '../../../components/ui/StatusTag'
import { useAuthStore } from '../../../stores/authStore'
import { supabase } from '../../../lib/supabase'
import { TIER_LABELS, TIER_COLORS } from '../../../services/b2b/partnerService'
import { DASH, fmtDate, fmtNum, fmtVnd, vndInputProps } from '../../../utils/format'
import { dichLoiHeThong } from '../../../utils/dichLoiHeThong'
import PageState from '../../../components/common/PageState'
import EnumTag, { enumLabel } from '../../../components/common/EnumTag'

const { Title, Text } = Typography

// Loại hạng mục: gộp mã của modal "Thêm hạng mục" (dưới) + mã của SettlementItemsTable lúc tạo phiếu
// — cột "Loại" từng in thẳng mã tiếng Anh 'transport_fee'… (audit 17/11/2026).
const ITEM_TYPE_LABELS: Record<string, string> = {
  transport_fee: 'Phí vận chuyển',
  processing_fee: 'Phí gia công',
  quality_bonus: 'Thưởng chất lượng',
  quality_penalty: 'Phạt chất lượng',
  late_penalty: 'Phạt chậm giao',
  loyalty_bonus: 'Thưởng khách hàng thân thiết',
  adjustment: 'Điều chỉnh khác',
  rubber: 'Mủ cao su',
  transport: 'Vận chuyển',
  processing: 'Gia công',
  deduction: 'Khấu trừ',
  bonus: 'Thưởng',
  penalty: 'Phạt',
  other: 'Khác',
}
const ADD_ITEM_TYPES = ['transport_fee', 'processing_fee', 'quality_bonus', 'quality_penalty', 'late_penalty', 'loyalty_bonus', 'adjustment', 'other']

const SettlementDetailPage = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [settlement, setSettlement] = useState<Settlement | null>(null)
  const [loading, setLoading] = useState(true)
  const [approvalModalOpen, setApprovalModalOpen] = useState(false)
  const [rejectModalOpen, setRejectModalOpen] = useState(false)
  const [paymentModalOpen, setPaymentModalOpen] = useState(false)
  const [markPaidModalOpen, setMarkPaidModalOpen] = useState(false)
  const [approvalForm] = Form.useForm()
  const [rejectForm] = Form.useForm()
  const [markPaidForm] = Form.useForm()
  const [actionLoading, setActionLoading] = useState(false)
  const [addItemModalOpen, setAddItemModalOpen] = useState(false)
  const [addItemForm] = Form.useForm()
  const { user } = useAuthStore()
  // Lỗi tải phiếu ≠ "không tìm thấy phiếu" — trước đây mất mạng cũng hiện "Không tìm thấy" (audit 17/11/2026)
  const [loadError, setLoadError] = useState<unknown>(null)

  // Lookup employee_id of current auth user (FK target cho approved_by / rejected_by / paid_by).
  // Cache lại local để không phải query mỗi lần click.
  const getCurrentEmployeeId = useCallback(async (): Promise<string> => {
    if (user?.employee_id) return user.employee_id
    if (!user?.id) throw new Error('Chưa đăng nhập')
    const { data: emp } = await supabase
      .from('employees')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()
    if (!emp?.id) throw new Error('Tài khoản chưa liên kết với employee')
    return emp.id
  }, [user?.id, user?.employee_id])

  const fetchSettlement = useCallback(async () => {
    if (!id) return
    try {
      setLoading(true)
      setLoadError(null)
      const data = await settlementService.getSettlementById(id)
      setSettlement(data)
    } catch (err) {
      setLoadError(err)
      message.error(dichLoiHeThong(err, 'Không thể tải thông tin phiếu quyết toán'))
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
      message.error(dichLoiHeThong(err, 'Gửi duyệt thất bại'))
    }
  }

  const handleApprove = async () => {
    if (!id) return
    try {
      const values = await approvalForm.validateFields()
      const employeeId = await getCurrentEmployeeId()
      await settlementService.approveSettlement(id, employeeId, values.approval_notes)
      message.success('Đã duyệt phiếu quyết toán')
      setApprovalModalOpen(false)
      approvalForm.resetFields()
      fetchSettlement()
    } catch (err) {
      message.error(dichLoiHeThong(err, 'Duyệt phiếu thất bại'))
    }
  }

  const handleReject = async () => {
    if (!id) return
    try {
      setActionLoading(true)
      const values = await rejectForm.validateFields()
      const employeeId = await getCurrentEmployeeId()
      await settlementService.rejectSettlement(id, employeeId, values.rejected_reason)
      message.success('Đã từ chối phiếu quyết toán')
      setRejectModalOpen(false)
      rejectForm.resetFields()
      fetchSettlement()
    } catch (err: any) {
      if (err?.errorFields) return
      message.error(dichLoiHeThong(err, 'Từ chối phiếu thất bại'))
    } finally {
      setActionLoading(false)
    }
  }

  const handleMarkAsPaid = async () => {
    if (!id || !settlement) return
    try {
      setActionLoading(true)
      const values = await markPaidForm.validateFields()
      const remaining = settlement.remaining_amount || 0
      if (remaining <= 0) {
        message.warning('Phiếu đã thanh toán đủ')
        setMarkPaidModalOpen(false)
        return
      }
      // Trả hết phần còn lại = 1 đợt thanh toán (createPayment ghi công nợ + tự set 'paid')
      await paymentService.createPayment({
        settlement_id: id,
        amount: remaining,
        payment_method: values.payment_method,
        notes: values.bank_reference ? `Ref: ${values.bank_reference}` : undefined,
        created_by: user?.employee_id || '',
      })
      message.success('Đã ghi nhận thanh toán toàn bộ')
      setMarkPaidModalOpen(false)
      markPaidForm.resetFields()
      fetchSettlement()
    } catch (err: any) {
      if (err?.errorFields) return
      message.error(dichLoiHeThong(err, 'Cập nhật trạng thái thất bại'))
    } finally {
      setActionLoading(false)
    }
  }

  const handleCancel = async () => {
    if (!id) return
    try {
      await settlementService.cancelSettlement(id)
      message.success('Đã hủy phiếu quyết toán')
      fetchSettlement()
    } catch (err) {
      message.error(dichLoiHeThong(err, 'Hủy phiếu thất bại'))
    }
  }

  const handleDelete = async () => {
    if (!id) return
    try {
      await settlementService.deleteSettlement(id)
      message.success('Đã xóa phiếu quyết toán')
      navigate('/b2b/settlements')
    } catch (err) {
      message.error(dichLoiHeThong(err, 'Xóa phiếu thất bại'))
    }
  }

  const handlePaymentSuccess = () => {
    setPaymentModalOpen(false)
    fetchSettlement()
  }

  const handleAddItem = async () => {
    if (!id) return
    try {
      const values = await addItemForm.validateFields()
      const qty = Number(values.quantity) || 0
      const price = Number(values.unit_price) || 0
      const amount = Number(values.amount) || (qty * price) || 0
      setActionLoading(true)
      await settlementService.addItem(id, {
        item_type: values.item_type,
        reference_id: null,
        reference_number: null,
        reference_date: null,
        description: values.description,
        quantity: qty || null,
        unit_price: price || null,
        amount,
        is_credit: values.is_credit === 'credit',
        notes: values.notes || null,
      } as any)
      message.success('Đã thêm hạng mục')
      setAddItemModalOpen(false)
      addItemForm.resetFields()
      fetchSettlement()
    } catch (err: any) {
      if (err?.errorFields) return
      message.error(dichLoiHeThong(err, 'Không thể thêm hạng mục'))
    } finally {
      setActionLoading(false)
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Spin size="large" />
      </div>
    )
  }

  if (loadError) {
    return (
      <div style={{ padding: 24 }}>
        <PageState error={loadError} onRetry={fetchSettlement} />
      </div>
    )
  }

  if (!settlement) {
    return (
      <Empty description="Không tìm thấy phiếu quyết toán" />
    )
  }

  const itemColumns = [
    { title: 'Loại', dataIndex: 'item_type', key: 'item_type', render: (v: string) => enumLabel(ITEM_TYPE_LABELS, v) },
    { title: 'Mô tả', dataIndex: 'description', key: 'description' },
    { title: 'SL', dataIndex: 'quantity', key: 'quantity', render: (v: number) => (v ? fmtNum(v, 3) : DASH) },
    { title: 'Đơn giá', dataIndex: 'unit_price', key: 'unit_price', render: (v: number) => (v ? fmtVnd(v) : DASH) },
    { title: 'Thành tiền', dataIndex: 'amount', key: 'amount', render: (v: number) => fmtVnd(v) },
    { title: 'Nợ/Có', dataIndex: 'is_credit', key: 'is_credit', render: (v: boolean) => v ? 'Có' : 'Nợ' },
  ]

  const advanceColumns = [
    { title: 'Ngày', dataIndex: 'advance_date', key: 'advance_date', render: (v: string) => fmtDate(v) },
    { title: 'Số tiền', dataIndex: 'amount', key: 'amount', render: (v: number) => fmtVnd(v) },
    { title: 'Ghi chú', dataIndex: 'notes', key: 'notes' },
  ]

  // dataIndex theo đúng cột b2b_settlement_payments (SettlementPayment) — trước đây trỏ 'date'/'method'/
  // 'recipient'/'bank'/'note' không tồn tại nên 5/6 cột Lịch sử thanh toán luôn trống (audit 17/11/2026).
  const paymentColumns = [
    { title: 'Ngày', dataIndex: 'payment_date', key: 'payment_date', render: (v: string) => fmtDate(v) },
    { title: 'Số tiền', dataIndex: 'amount', key: 'amount', render: (v: number) => fmtVnd(v) },
    {
      title: 'Phương thức', dataIndex: 'payment_method', key: 'payment_method',
      render: (v: string) => enumLabel(PAYMENT_METHOD_LABELS, v),
    },
    { title: 'Người nhận', dataIndex: 'recipient_name', key: 'recipient_name' },
    { title: 'Ngân hàng', dataIndex: 'bank_name', key: 'bank_name' },
    { title: 'Ghi chú', dataIndex: 'notes', key: 'notes' },
  ]

  const renderActionButtons = () => {
    const buttons: React.ReactNode[] = []

    if (settlement.status === 'draft' || settlement.status === 'rejected') {
      buttons.push(
        <Popconfirm
          key="submit"
          title="Xác nhận gửi duyệt?"
          description="Phiếu sẽ được chuyển sang trạng thái chờ duyệt."
          onConfirm={handleSubmitForApproval}
          okText="Gửi duyệt"
          cancelText="Hủy"
        >
          <Button type="primary" icon={<SendOutlined />}>
            Gửi duyệt
          </Button>
        </Popconfirm>
      )
    }

    if (settlement.status === 'draft') {
      buttons.push(
        <Popconfirm key="delete" title="Bạn có chắc muốn xóa phiếu này?" description="Phiếu nháp bị xoá hẳn, không khôi phục được." onConfirm={handleDelete} okText="Xóa" cancelText="Hủy" okButtonProps={{ danger: true }}>
          <Button danger>Xóa</Button>
        </Popconfirm>
      )
    }

    if (settlement.status === 'pending_approval') {
      buttons.push(
        <Button
          key="approve"
          type="primary"
          style={{ backgroundColor: '#52c41a', borderColor: '#52c41a' }}
          icon={<CheckCircleOutlined />}
          onClick={() => setApprovalModalOpen(true)}
        >
          Duyệt
        </Button>,
        <Button
          key="reject"
          danger
          icon={<CloseCircleOutlined />}
          onClick={() => setRejectModalOpen(true)}
        >
          Từ chối
        </Button>
      )
    }

    // approved (chưa trả) hoặc partial_paid (đã trả 1 phần) → vẫn cho thanh toán tiếp
    if (settlement.status === 'approved' || settlement.status === 'partial_paid') {
      buttons.push(
        <Button key="markpaid" type="primary" icon={<DollarOutlined />} onClick={() => setMarkPaidModalOpen(true)}>
          Trả hết còn lại
        </Button>,
        <Button key="payment" icon={<DollarOutlined />} onClick={() => setPaymentModalOpen(true)}>
          Ghi nhận thanh toán
        </Button>
      )
    }

    if (settlement.status === 'paid') {
      // No action buttons - show completion in timeline
    }

    if (settlement.status !== 'cancelled' && settlement.status !== 'paid' && settlement.status !== 'rejected') {
      buttons.push(
        <Popconfirm key="cancel" title="Bạn có chắc muốn hủy phiếu này?" onConfirm={handleCancel} okText="Hủy phiếu" cancelText="Đóng" okButtonProps={{ danger: true }}>
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
                {settlement.settlement_type === 'processing' && settlement.notes && (
                  <Alert type="info" message={settlement.notes} style={{ marginTop: 8 }} />
                )}
              </Descriptions.Item>
              <Descriptions.Item label="Sản phẩm">{settlement.product_type || DASH}</Descriptions.Item>
              <Descriptions.Item label="KL cân">{settlement.weighed_kg ? `${fmtNum(settlement.weighed_kg, 3)} kg` : DASH}</Descriptions.Item>
              <Descriptions.Item label="KL thành phẩm">{settlement.finished_kg ? `${fmtNum(settlement.finished_kg, 3)} kg` : DASH}</Descriptions.Item>
              <Descriptions.Item label="DRC">{settlement.drc_percent ? `${settlement.drc_percent}%` : DASH}</Descriptions.Item>
              <Descriptions.Item label="Đơn giá duyệt">{settlement.approved_price ? fmtVnd(settlement.approved_price) : DASH}</Descriptions.Item>
              <Descriptions.Item label="Biển số xe">{settlement.vehicle_plates?.join(', ') || DASH}</Descriptions.Item>
              <Descriptions.Item label="Tài xế">
                {settlement.driver_name ? `${settlement.driver_name}${settlement.driver_phone ? ` - ${settlement.driver_phone}` : ''}` : DASH}
              </Descriptions.Item>
              <Descriptions.Item label="Ngày cân">
                {settlement.weigh_date_start || settlement.weigh_date_end
                  ? `${fmtDate(settlement.weigh_date_start)} - ${fmtDate(settlement.weigh_date_end)}`
                  : DASH}
              </Descriptions.Item>
              <Descriptions.Item label="Ngày nhập kho">{fmtDate(settlement.stock_in_date)}</Descriptions.Item>
              <Descriptions.Item label="Ghi chú" span={2}>{settlement.notes || DASH}</Descriptions.Item>
            </Descriptions>
          </Card>

          <Card
            title="Hạng mục"
            style={{ borderRadius: 8, marginBottom: 16 }}
            extra={
              (settlement.status === 'draft' || settlement.status === 'rejected') && (
                <Button
                  type="primary"
                  size="small"
                  icon={<PlusOutlined />}
                  onClick={() => setAddItemModalOpen(true)}
                >
                  Thêm hạng mục
                </Button>
              )
            }
          >
            <Table
              dataSource={settlement.items || []}
              columns={itemColumns}
              rowKey="id"
              pagination={false}
              size="small"
              locale={{ emptyText: 'Chưa có hạng mục nào' }}
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
              <Descriptions.Item label="Tên">{settlement.partner?.name || DASH}</Descriptions.Item>
              <Descriptions.Item label="Mã">{settlement.partner?.code || DASH}</Descriptions.Item>
              <Descriptions.Item label="Hạng">
                <EnumTag value={settlement.partner?.tier} labels={TIER_LABELS} colors={TIER_COLORS} />
              </Descriptions.Item>
              <Descriptions.Item label="SĐT">{settlement.partner?.phone || DASH}</Descriptions.Item>
            </Descriptions>
          </Card>

          <Card title="Tổng hợp tài chính" style={{ borderRadius: 8, marginBottom: 16 }}>
            <Row gutter={[16, 16]}>
              <Col span={12}>
                <Statistic
                  title="Tổng tiền hàng"
                  value={settlement.gross_amount || 0}
                  formatter={(val) => fmtVnd(val as number)}
                  valueStyle={{ color: '#1B4D3E' }}
                />
              </Col>
              <Col span={12}>
                <Statistic
                  title="Tạm ứng"
                  value={settlement.total_advance || 0}
                  formatter={(val) => fmtVnd(val as number)}
                  valueStyle={{ color: 'orange' }}
                />
              </Col>
              <Col span={12}>
                <Statistic
                  title="Đã thanh toán"
                  value={settlement.total_paid_post || 0}
                  formatter={(val) => fmtVnd(val as number)}
                  valueStyle={{ color: 'blue' }}
                />
              </Col>
              <Col span={12}>
                <Statistic
                  title="Còn phải trả"
                  value={settlement.remaining_amount || 0}
                  formatter={(val) => fmtVnd(val as number)}
                  valueStyle={{ color: 'red', fontWeight: 'bold' }}
                />
              </Col>
            </Row>
          </Card>

          <Card title="Trạng thái" style={{ borderRadius: 8, marginBottom: 16 }}>
            <div style={{ marginBottom: 16 }}>
              <SettlementStatusTag status={settlement.status} />
              {settlement.status === 'paid' && (
                <div style={{ marginTop: 8, padding: '8px 12px', background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 6 }}>
                  <Text style={{ color: '#52c41a' }}>Phiếu quyết toán đã hoàn tất thanh toán.</Text>
                </div>
              )}
              {settlement.status === 'rejected' && (
                <div style={{ marginTop: 8, padding: '8px 12px', background: '#fff2f0', border: '1px solid #ffccc7', borderRadius: 6 }}>
                  <Text style={{ color: '#ff4d4f' }}>Phiếu đã bị từ chối. Có thể chỉnh sửa và gửi duyệt lại.</Text>
                </div>
              )}
            </div>
          </Card>

          <Card title="Lịch sử phê duyệt" style={{ borderRadius: 8, marginBottom: 16 }}>
            <ApprovalTimeline settlement={settlement} />
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

      {/* Reject Modal */}
      <Modal
        title="Từ chối phiếu quyết toán"
        open={rejectModalOpen}
        onCancel={() => {
          setRejectModalOpen(false)
          rejectForm.resetFields()
        }}
        onOk={handleReject}
        okText="Xác nhận từ chối"
        okButtonProps={{ danger: true, loading: actionLoading }}
        cancelText="Hủy"
      >
        <Form form={rejectForm} layout="vertical">
          <Form.Item
            name="rejected_reason"
            label="Lý do từ chối"
            rules={[{ required: true, message: 'Vui lòng nhập lý do từ chối' }]}
          >
            <Input.TextArea rows={4} placeholder="Nhập lý do từ chối phiếu quyết toán" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Mark as Paid Modal */}
      <Modal
        title="Xác nhận đã thanh toán"
        open={markPaidModalOpen}
        onCancel={() => {
          setMarkPaidModalOpen(false)
          markPaidForm.resetFields()
        }}
        onOk={handleMarkAsPaid}
        okText="Xác nhận thanh toán"
        okButtonProps={{ loading: actionLoading }}
        cancelText="Hủy"
      >
        <Form form={markPaidForm} layout="vertical" initialValues={{ payment_method: 'bank_transfer' }}>
          <Form.Item
            name="payment_method"
            label="Phương thức thanh toán"
            rules={[{ required: true, message: 'Vui lòng chọn phương thức thanh toán' }]}
          >
            <Select>
              <Select.Option value="bank_transfer">Chuyển khoản ngân hàng</Select.Option>
              <Select.Option value="cash">Tiền mặt</Select.Option>
              <Select.Option value="check">Séc</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="bank_reference" label="Mã giao dịch / Số chứng từ">
            <Input placeholder="Nhập mã giao dịch ngân hàng hoặc số chứng từ" />
          </Form.Item>
          <Form.Item name="paid_by" label="Người thanh toán">
            <Input placeholder="Nhập tên người thanh toán" />
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
          createdBy={user?.employee_id || ''}
          onSuccess={handlePaymentSuccess}
          onCancel={() => setPaymentModalOpen(false)}
        />
      </Modal>

      {/* Add Item Modal — chỉ hiện khi draft/rejected */}
      <Modal
        title="Thêm hạng mục chi phí"
        open={addItemModalOpen}
        onCancel={() => {
          setAddItemModalOpen(false)
          addItemForm.resetFields()
        }}
        onOk={handleAddItem}
        okText="Thêm"
        cancelText="Hủy"
        confirmLoading={actionLoading}
      >
        <Form form={addItemForm} layout="vertical" preserve={false}>
          <Form.Item
            name="item_type"
            label="Loại hạng mục"
            rules={[{ required: true, message: 'Chọn loại' }]}
          >
            <Select
              placeholder="Chọn loại hạng mục"
              options={ADD_ITEM_TYPES.map((v) => ({ value: v, label: ITEM_TYPE_LABELS[v] }))}
            />
          </Form.Item>
          <Form.Item name="description" label="Mô tả" rules={[{ required: true, message: 'Nhập mô tả' }]}>
            <Input placeholder="VD: Phí vận chuyển Tây Ninh → Phong Điền" />
          </Form.Item>
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="quantity" label="Số lượng">
                <InputNumber style={{ width: '100%' }} min={0} placeholder="(nếu có)" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="unit_price" label="Đơn giá">
                <InputNumber<number>
                  style={{ width: '100%' }}
                  min={0}
                  placeholder="(nếu có)"
                  {...vndInputProps}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="amount"
                label="Thành tiền"
                rules={[{ required: true, message: 'Nhập thành tiền' }]}
                tooltip="Hoặc để trống nếu đã nhập SL × Đơn giá"
              >
                <InputNumber<number>
                  style={{ width: '100%' }}
                  min={0}
                  {...vndInputProps}
                />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="is_credit" label="Loại tác động" initialValue="debit" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'debit', label: 'Nợ (trừ tiền đại lý — phí, phạt)' },
                { value: 'credit', label: 'Có (cộng tiền đại lý — thưởng, discount)' },
              ]}
            />
          </Form.Item>
          <Form.Item name="notes" label="Ghi chú">
            <Input.TextArea rows={2} placeholder="Ghi chú thêm (tuỳ chọn)" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default SettlementDetailPage
