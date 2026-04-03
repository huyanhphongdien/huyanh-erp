// ============================================================================
// DEAL DETAIL PAGE — Chi tiết Deal/Giao dịch B2B
// File: src/pages/b2b/deals/DealDetailPage.tsx
// Phase: E2.2.1, E2.2.3, E2.2.5, E2.2.6, E2.2.7
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Card,
  Descriptions,
  Tag,
  Button,
  Space,
  Typography,
  Row,
  Col,
  Timeline,
  Divider,
  Spin,
  Empty,
  Popconfirm,
  Modal,
  Form,
  InputNumber,
  Input,
  message,
  Breadcrumb,
  Statistic,
  Tabs,
  Badge,
} from 'antd'
import {
  ArrowLeftOutlined,
  EditOutlined,
  MessageOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  SyncOutlined,
  DollarOutlined,
  PrinterOutlined,
  HistoryOutlined,
  UserOutlined,
  ShoppingOutlined,
  CalendarOutlined,
  FileTextOutlined,
  InboxOutlined,
  ExperimentOutlined,
  WalletOutlined,
  ToolOutlined,
} from '@ant-design/icons'
import {
  dealService,
  Deal,
  DealStatus,
  DEAL_STATUS_LABELS,
  DEAL_STATUS_COLORS,
  DEAL_TYPE_LABELS,
} from '../../../services/b2b/dealService'
import { autoSettlementService } from '../../../services/b2b/autoSettlementService'
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'
import { PRODUCT_TYPE_LABELS } from '../../../constants/rubberProducts'
import DealWmsTab from '../../../components/b2b/DealWmsTab'
import DealQcTab from '../../../components/b2b/DealQcTab'
import DealAdvancesTab from '../../../components/b2b/DealAdvancesTab'
import DealProductionTab from '../../../components/b2b/DealProductionTab'

const { Title, Text, Paragraph } = Typography
const { TextArea } = Input

// ============================================
// CONSTANTS
// ============================================

const TIER_COLORS: Record<string, string> = {
  diamond: 'purple',
  gold: 'gold',
  silver: 'default',
  bronze: 'orange',
  new: 'cyan',
}

// ============================================
// HELPER FUNCTIONS
// ============================================

const formatCurrency = (value: number | null): string => {
  if (!value) return '-'
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(value)
}

const formatDate = (dateStr: string | null): string => {
  if (!dateStr) return '-'
  return format(new Date(dateStr), 'dd/MM/yyyy', { locale: vi })
}

const formatDateTime = (dateStr: string | null): string => {
  if (!dateStr) return '-'
  return format(new Date(dateStr), 'dd/MM/yyyy HH:mm', { locale: vi })
}

// ============================================
// STATUS ACTIONS COMPONENT
// ============================================

interface StatusActionsProps {
  deal: Deal
  onUpdateStatus: (status: DealStatus, data?: { final_price?: number; notes?: string }) => void
  onSettleDeal?: () => void
  loading?: boolean
  settleLoading?: boolean
}

const StatusActions = ({ deal, onUpdateStatus, onSettleDeal, loading, settleLoading }: StatusActionsProps) => {
  const [acceptModal, setAcceptModal] = useState(false)
  const [cancelModal, setCancelModal] = useState(false)
  const [form] = Form.useForm()

  const handleAccept = async () => {
    try {
      const values = await form.validateFields()
      onUpdateStatus('accepted', { final_price: values.final_price })
      setAcceptModal(false)
      form.resetFields()
    } catch (error) {
      // Validation error
    }
  }

  const handleCancel = async () => {
    try {
      const values = await form.validateFields()
      onUpdateStatus('cancelled', { notes: values.cancel_reason })
      setCancelModal(false)
      form.resetFields()
    } catch (error) {
      // Validation error
    }
  }

  const handleSettle = () => {
    const pricePerKg = deal.final_price || deal.unit_price || 0
    const actualWeight = deal.actual_weight_kg || 0
    const actualDrc = deal.actual_drc || 0
    const finalValue = Math.round(actualWeight * (actualDrc / 100) * pricePerKg)

    Modal.confirm({
      title: 'Tạo phiếu Quyết toán',
      content: (
        <div>
          <p>Hệ thống sẽ tự động tạo phiếu quyết toán (nháp) cho Deal <strong>{deal.deal_number}</strong> với thông tin:</p>
          <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0' }}>
            <li>Trọng lượng thực: <strong>{actualWeight.toLocaleString()} kg</strong></li>
            <li>DRC thực tế: <strong>{actualDrc}%</strong></li>
            <li>Đơn giá: <strong>{pricePerKg.toLocaleString()} đ/kg</strong></li>
            <li>Giá trị ước tính: <strong>{finalValue.toLocaleString()} VNĐ</strong></li>
          </ul>
          <p>Phiếu quyết toán sẽ ở trạng thái <strong>Nháp</strong>. Bạn có thể chỉnh sửa trước khi duyệt.</p>
        </div>
      ),
      okText: 'Tạo quyết toán',
      cancelText: 'Hủy',
      icon: <DollarOutlined style={{ color: '#722ed1' }} />,
      onOk: onSettleDeal,
    })
  }

  return (
    <>
      <Space wrap>
        {/* Pending -> Processing */}
        {deal.status === 'pending' && (
          <Popconfirm
            title="Bắt đầu xử lý deal này?"
            description="Deal sẽ chuyển sang trạng thái 'Đang xử lý'"
            onConfirm={() => onUpdateStatus('processing')}
            okText="Xác nhận"
            cancelText="Hủy"
          >
            <Button type="primary" icon={<SyncOutlined />} loading={loading}>
              Bắt đầu xử lý
            </Button>
          </Popconfirm>
        )}

        {/* Processing -> Accepted */}
        {deal.status === 'processing' && (
          <Button
            type="primary"
            icon={<CheckCircleOutlined />}
            onClick={() => setAcceptModal(true)}
            loading={loading}
            style={{ backgroundColor: '#52c41a', borderColor: '#52c41a' }}
          >
            Duyệt Deal
          </Button>
        )}

        {/* Accepted -> Auto Settlement */}
        {deal.status === 'accepted' && deal.actual_drc != null && deal.actual_drc > 0 && deal.actual_weight_kg != null && deal.actual_weight_kg > 0 && (
          <Button
            type="primary"
            icon={<DollarOutlined />}
            onClick={handleSettle}
            loading={settleLoading}
            style={{ backgroundColor: '#722ed1', borderColor: '#722ed1' }}
          >
            Quyết toán
          </Button>
        )}

        {/* Cancel button */}
        {deal.status !== 'cancelled' && deal.status !== 'settled' && (
          <Button
            danger
            icon={<CloseCircleOutlined />}
            onClick={() => setCancelModal(true)}
            loading={loading}
          >
            Hủy Deal
          </Button>
        )}
      </Space>

      {/* Accept Modal */}
      <Modal
        title="Duyệt Deal"
        open={acceptModal}
        onOk={handleAccept}
        onCancel={() => setAcceptModal(false)}
        okText="Duyệt"
        cancelText="Hủy"
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="final_price"
            label="Giá chốt cuối cùng (đ/kg)"
            initialValue={deal.unit_price}
          >
            <InputNumber
              style={{ width: '100%' }}
              min={0}
              formatter={(value) => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
              parser={(value) => value!.replace(/\$\s?|(,*)/g, '') as any}
              placeholder="Nhập giá chốt"
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* Cancel Modal */}
      <Modal
        title="Hủy Deal"
        open={cancelModal}
        onOk={handleCancel}
        onCancel={() => setCancelModal(false)}
        okText="Hủy Deal"
        okButtonProps={{ danger: true }}
        cancelText="Đóng"
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="cancel_reason"
            label="Lý do hủy"
            rules={[{ required: true, message: 'Vui lòng nhập lý do' }]}
          >
            <TextArea rows={3} placeholder="Nhập lý do hủy deal..." />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}

// ============================================
// MAIN COMPONENT
// ============================================

const DealDetailPage = () => {
  const { dealId } = useParams<{ dealId: string }>()
  const navigate = useNavigate()

  // State
  const [deal, setDeal] = useState<Deal | null>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [settleLoading, setSettleLoading] = useState(false)

  // ============================================
  // DATA FETCHING
  // ============================================

  const fetchDeal = useCallback(async () => {
    if (!dealId) return

    try {
      setLoading(true)
      const data = await dealService.getDealById(dealId)
      setDeal(data)
    } catch (error) {
      console.error('Error fetching deal:', error)
      message.error('Không thể tải thông tin giao dịch')
    } finally {
      setLoading(false)
    }
  }, [dealId])

  useEffect(() => {
    fetchDeal()
  }, [fetchDeal])

  // ============================================
  // HANDLERS
  // ============================================

  const handleUpdateStatus = async (
    status: DealStatus,
    data?: { final_price?: number; notes?: string }
  ) => {
    if (!deal) return

    try {
      setUpdating(true)

      if (status === 'accepted' && data?.final_price) {
        await dealService.acceptDeal(deal.id, data.final_price)
      } else if (status === 'cancelled' && data?.notes) {
        await dealService.cancelDeal(deal.id, data.notes)
      } else {
        await dealService.updateStatus(deal.id, status)
      }

      message.success(`Đã chuyển trạng thái sang "${DEAL_STATUS_LABELS[status]}"`)
      fetchDeal()
    } catch (error) {
      message.error('Không thể cập nhật trạng thái')
    } finally {
      setUpdating(false)
    }
  }

  const handleOpenChat = async () => {
    if (!deal) return

    try {
      const room = await dealService.getChatRoomByPartner(deal.partner_id)
      if (room) {
        navigate(`/b2b/chat/${room.id}`)
      } else {
        message.info('Chưa có phòng chat với đại lý này')
      }
    } catch (error) {
      message.error('Không thể mở chat')
    }
  }

  const handleAutoSettle = async () => {
    if (!deal) return

    try {
      setSettleLoading(true)

      // Kiểm tra settlement đã tồn tại chưa
      const existing = await autoSettlementService.getExistingSettlement(deal.id)
      if (existing) {
        message.warning('Deal này đã có phiếu quyết toán. Đang chuyển đến phiếu quyết toán...')
        navigate(`/b2b/settlements/${existing.id}`)
        return
      }

      // Tạo settlement tự động
      const result = await autoSettlementService.createAutoSettlement(deal.id)

      // Cập nhật deal status sang settled
      await dealService.updateStatus(deal.id, 'settled')

      message.success(
        `Đã tạo phiếu quyết toán ${result.settlement.code}. ` +
        `Giá trị: ${result.summary.final_value.toLocaleString()} VNĐ, ` +
        `Còn lại: ${result.summary.balance_due.toLocaleString()} VNĐ`
      )

      // Chuyển đến trang chi tiết settlement
      navigate(`/b2b/settlements/${result.settlement.id}`)
    } catch (error: any) {
      console.error('Auto settlement error:', error)
      message.error(error.message || 'Không thể tạo phiếu quyết toán')
    } finally {
      setSettleLoading(false)
    }
  }

  // ============================================
  // RENDER
  // ============================================

  if (loading) {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <Spin size="large" />
      </div>
    )
  }

  if (!deal) {
    return (
      <div style={{ padding: 24 }}>
        <Empty description="Không tìm thấy giao dịch" />
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Button onClick={() => navigate('/b2b/deals')}>Quay lại</Button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: 24 }}>
      {/* Breadcrumb */}
      <Breadcrumb
        style={{ marginBottom: 16 }}
        items={[
          { title: <a onClick={() => navigate('/b2b')}>B2B</a> },
          { title: <a onClick={() => navigate('/b2b/deals')}>Giao dịch</a> },
          { title: deal.deal_number },
        ]}
      />

      {/* Header */}
      <Card style={{ marginBottom: 24, borderRadius: 12 }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Space>
              <Button
                type="text"
                icon={<ArrowLeftOutlined />}
                onClick={() => navigate('/b2b/deals')}
              />
              <div>
                <Space align="center">
                  <Title level={4} style={{ margin: 0 }}>
                    {deal.deal_number}
                  </Title>
                  <Tag color={DEAL_STATUS_COLORS[deal.status]} style={{ fontSize: 14 }}>
                    {DEAL_STATUS_LABELS[deal.status]}
                  </Tag>
                </Space>
                <Text type="secondary">
                  Tạo lúc: {formatDateTime(deal.created_at)}
                </Text>
              </div>
            </Space>
          </Col>
          <Col>
            <Space>
              <Button icon={<MessageOutlined />} onClick={handleOpenChat}>
                Mở Chat
              </Button>
              <Button icon={<PrinterOutlined />}>In</Button>
              <StatusActions
                deal={deal}
                onUpdateStatus={handleUpdateStatus}
                onSettleDeal={handleAutoSettle}
                loading={updating}
                settleLoading={settleLoading}
              />
            </Space>
          </Col>
        </Row>
      </Card>

      <Tabs
        defaultActiveKey="info"
        size="large"
        style={{ marginBottom: 24 }}
        items={[
          {
            key: 'info',
            label: (
              <span><FileTextOutlined /> Thông tin</span>
            ),
            children: (
              <Row gutter={24}>
                {/* Left Column */}
                <Col xs={24} lg={16}>
                  {/* Deal Info */}
                  <Card
                    title={
                      <Space>
                        <FileTextOutlined />
                        <span>Thông tin giao dịch</span>
                      </Space>
                    }
                    style={{ marginBottom: 24, borderRadius: 12 }}
                  >
                    <Descriptions bordered column={{ xs: 1, sm: 2 }}>
                      <Descriptions.Item label="Mã Deal">{deal.deal_number}</Descriptions.Item>
                      <Descriptions.Item label="Loại giao dịch">
                        {deal.deal_type ? DEAL_TYPE_LABELS[deal.deal_type] : '-'}
                      </Descriptions.Item>
                      <Descriptions.Item label="Sản phẩm">{deal.product_name || '-'}</Descriptions.Item>
                      <Descriptions.Item label="Loại mủ">{deal.rubber_type ? (PRODUCT_TYPE_LABELS[deal.rubber_type] || deal.rubber_type) : (deal.product_code || '-')}</Descriptions.Item>
                      <Descriptions.Item label="Số lượng">
                        <Text strong style={{ color: '#1B4D3E', fontSize: 16 }}>
                          {deal.quantity_tons?.toFixed(2) || '-'} tấn
                        </Text>
                      </Descriptions.Item>
                      <Descriptions.Item label="DRC dự kiến">
                        {deal.expected_drc ? (
                          <Text strong style={{ color: '#1890ff' }}>{deal.expected_drc}%</Text>
                        ) : '-'}
                      </Descriptions.Item>
                      <Descriptions.Item label="Đơn giá">
                        {deal.unit_price?.toLocaleString() || '-'} đ/kg
                        {deal.price_unit && (
                          <Tag color={deal.price_unit === 'dry' ? 'orange' : 'blue'} style={{ marginLeft: 8 }}>
                            {deal.price_unit === 'dry' ? 'Giá khô' : 'Giá ướt'}
                          </Tag>
                        )}
                      </Descriptions.Item>
                      <Descriptions.Item label="Giá chốt">
                        {deal.final_price ? (
                          <Text strong style={{ color: '#52c41a' }}>
                            {deal.final_price.toLocaleString()} đ/kg
                          </Text>
                        ) : '-'}
                      </Descriptions.Item>
                      <Descriptions.Item label="Giá trị">
                        <Text strong style={{ color: '#1B4D3E', fontSize: 18 }}>
                          {formatCurrency(deal.total_value_vnd)}
                        </Text>
                      </Descriptions.Item>
                      {(deal.source_region || deal.pickup_location_name) && (
                        <Descriptions.Item label="Địa điểm bốc hàng">
                          {deal.source_region || deal.pickup_location_name}
                        </Descriptions.Item>
                      )}
                      {deal.rubber_region && (
                        <Descriptions.Item label="Vùng mủ">
                          {deal.rubber_region}
                          {deal.rubber_region_lat && deal.rubber_region_lng && (
                            <a
                              href={`https://www.google.com/maps?q=${deal.rubber_region_lat},${deal.rubber_region_lng}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ marginLeft: 8, fontSize: 12 }}
                            >
                              📍 Xem bản đồ
                            </a>
                          )}
                        </Descriptions.Item>
                      )}
                      {deal.delivery_date && (
                        <Descriptions.Item label="Ngày giao dự kiến">
                          {formatDate(deal.delivery_date)}
                        </Descriptions.Item>
                      )}
                      {deal.lot_code && (
                        <Descriptions.Item label="Mã lô">
                          <Tag color="blue" style={{ fontWeight: 600 }}>{deal.lot_code}</Tag>
                          {deal.lot_description && <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>{deal.lot_description}</Text>}
                        </Descriptions.Item>
                      )}
                      {deal.rubber_intake_id && (
                        <Descriptions.Item label="Lý lịch mủ">
                          <Button type="link" size="small" onClick={() => navigate(`/b2b/rubber-intake/${deal.rubber_intake_id}`)}>
                            Xem lý lịch mủ →
                          </Button>
                        </Descriptions.Item>
                      )}
                      <Descriptions.Item label="Điều kiện giao hàng" span={2}>
                        {deal.delivery_terms || '-'}
                      </Descriptions.Item>
                      {deal.processing_fee_per_ton && (
                        <Descriptions.Item label="Phí gia công">
                          {deal.processing_fee_per_ton.toLocaleString()} đ/tấn
                        </Descriptions.Item>
                      )}
                      {deal.expected_output_rate && (
                        <Descriptions.Item label="Tỷ lệ thu hồi">
                          {deal.expected_output_rate}%
                        </Descriptions.Item>
                      )}
                      {deal.notes && (
                        <Descriptions.Item label="Ghi chú" span={2}>
                          {deal.notes}
                        </Descriptions.Item>
                      )}
                    </Descriptions>
                  </Card>

                  {/* Timeline (E2.2.5) */}
                  <Card
                    title={
                      <Space>
                        <HistoryOutlined />
                        <span>Lịch sử thay đổi</span>
                      </Space>
                    }
                    style={{ borderRadius: 12 }}
                  >
                    <Timeline
                      items={[
                        {
                          color: 'green',
                          children: (
                            <div>
                              <Text strong>Tạo giao dịch</Text>
                              <br />
                              <Text type="secondary" style={{ fontSize: 12 }}>
                                {formatDateTime(deal.created_at)}
                              </Text>
                            </div>
                          ),
                        },
                        ...(deal.status !== 'pending'
                          ? [
                              {
                                color: 'blue',
                                children: (
                                  <div>
                                    <Text strong>Bắt đầu xử lý</Text>
                                    <br />
                                    <Text type="secondary" style={{ fontSize: 12 }}>
                                      Trạng thái: Đang xử lý
                                    </Text>
                                  </div>
                                ),
                              },
                            ]
                          : []),
                        ...(deal.status === 'accepted' || deal.status === 'settled'
                          ? [
                              {
                                color: 'green',
                                children: (
                                  <div>
                                    <Text strong>Duyệt giao dịch</Text>
                                    {deal.final_price && (
                                      <>
                                        <br />
                                        <Text type="secondary" style={{ fontSize: 12 }}>
                                          Giá chốt: {deal.final_price.toLocaleString()} đ/kg
                                        </Text>
                                      </>
                                    )}
                                  </div>
                                ),
                              },
                            ]
                          : []),
                        ...(deal.status === 'settled'
                          ? [
                              {
                                color: 'purple',
                                children: (
                                  <div>
                                    <Text strong>Quyết toán</Text>
                                    <br />
                                    <Text type="secondary" style={{ fontSize: 12 }}>
                                      Hoàn tất giao dịch
                                    </Text>
                                  </div>
                                ),
                              },
                            ]
                          : []),
                        ...(deal.status === 'cancelled'
                          ? [
                              {
                                color: 'red',
                                children: (
                                  <div>
                                    <Text strong>Hủy giao dịch</Text>
                                    {deal.notes && (
                                      <>
                                        <br />
                                        <Text type="secondary" style={{ fontSize: 12 }}>
                                          Lý do: {deal.notes}
                                        </Text>
                                      </>
                                    )}
                                  </div>
                                ),
                              },
                            ]
                          : []),
                      ]}
                    />
                  </Card>
                </Col>

                {/* Right Column */}
                <Col xs={24} lg={8}>
                  {/* Partner Info */}
                  <Card
                    title={
                      <Space>
                        <UserOutlined />
                        <span>Thông tin đại lý</span>
                      </Space>
                    }
                    style={{ marginBottom: 24, borderRadius: 12 }}
                    extra={
                      deal.partner?.tier && (
                        <Tag color={TIER_COLORS[deal.partner?.tier]}>
                          {deal.partner?.tier?.toUpperCase()}
                        </Tag>
                      )
                    }
                  >
                    <Space direction="vertical" style={{ width: '100%' }}>
                      <div>
                        <Text type="secondary">Tên đại lý</Text>
                        <br />
                        <Text strong style={{ fontSize: 16 }}>{deal.partner?.name || '-'}</Text>
                      </div>
                      <Divider style={{ margin: '12px 0' }} />
                      <div>
                        <Text type="secondary">Mã đại lý</Text>
                        <br />
                        <Text>{deal.partner?.code || '-'}</Text>
                      </div>
                      <div>
                        <Text type="secondary">Điện thoại</Text>
                        <br />
                        <Text>{deal.partner?.phone || '-'}</Text>
                      </div>
                      <div>
                        <Text type="secondary">Email</Text>
                        <br />
                        <Text>{deal.partner?.email || '-'}</Text>
                      </div>
                      <Divider style={{ margin: '12px 0' }} />
                      <Button
                        block
                        icon={<MessageOutlined />}
                        onClick={handleOpenChat}
                      >
                        Mở Chat với Đại lý
                      </Button>
                      <Button
                        block
                        type="link"
                        onClick={() => navigate(`/b2b/partners/${deal.partner_id}`)}
                      >
                        Xem hồ sơ đại lý
                      </Button>
                    </Space>
                  </Card>

                  {/* Quick Stats */}
                  <Card
                    title={
                      <Space>
                        <ShoppingOutlined />
                        <span>Tổng quan</span>
                      </Space>
                    }
                    style={{ borderRadius: 12 }}
                  >
                    {deal.deal_type === 'processing' ? (
                      <Row gutter={[16, 16]}>
                        <Col span={12}>
                          <Statistic title="Phí gia công" value={deal.processing_fee_per_ton || 0} suffix="đ/tấn"
                            formatter={v => `${Number(v).toLocaleString()}`} />
                        </Col>
                        <Col span={12}>
                          <Statistic title="Tỷ lệ thu hồi" value={deal.expected_output_rate || 80} suffix="%" />
                        </Col>
                        <Col span={24}>
                          <Divider style={{ margin: '8px 0' }} />
                          <Tag color="purple">Gia công — tính tiền theo đầu ra</Tag>
                        </Col>
                      </Row>
                    ) : (
                      <Row gutter={[16, 16]}>
                        <Col span={12}>
                          <Statistic
                            title="Số lượng"
                            value={deal.quantity_tons || 0}
                            suffix="tấn"
                            valueStyle={{ color: '#1B4D3E' }}
                          />
                        </Col>
                        <Col span={12}>
                          <Statistic
                            title="Đơn giá"
                            value={deal.unit_price || 0}
                            suffix="đ/kg"
                            formatter={(value) => `${Number(value).toLocaleString()}`}
                          />
                        </Col>
                        <Col span={24}>
                          <Divider style={{ margin: '8px 0' }} />
                          <Statistic
                            title="Tổng giá trị"
                            value={deal.total_value_vnd || 0}
                            suffix="VNĐ"
                            valueStyle={{ color: '#1B4D3E', fontSize: 24 }}
                            formatter={(value) => `${Number(value).toLocaleString()}`}
                          />
                        </Col>
                      </Row>
                    )}
                  </Card>
                </Col>
              </Row>
            ),
          },
          {
            key: 'wms',
            label: (
              <span>
                <InboxOutlined /> Nhập kho
                {deal.stock_in_count ? ` (${deal.stock_in_count})` : ''}
              </span>
            ),
            children: <DealWmsTab dealId={deal.id} />,
          },
          {
            key: 'qc',
            label: (
              <span>
                <ExperimentOutlined /> QC
                {deal.qc_status && deal.qc_status !== 'pending' && (
                  <Badge
                    status={
                      deal.qc_status === 'passed' ? 'success'
                        : deal.qc_status === 'warning' ? 'warning'
                        : deal.qc_status === 'failed' ? 'error'
                        : 'default'
                    }
                    style={{ marginLeft: 8 }}
                  />
                )}
              </span>
            ),
            children: <DealQcTab dealId={deal.id} deal={deal} />,
          },
          {
            key: 'production',
            label: (
              <span><ToolOutlined /> Sản xuất</span>
            ),
            children: <DealProductionTab dealId={deal.id} />,
          },
          {
            key: 'advances',
            label: (
              <span><WalletOutlined /> Tạm ứng</span>
            ),
            children: <DealAdvancesTab dealId={deal.id} deal={deal} />,
          },
        ]}
      />
    </div>
  )
}

export default DealDetailPage