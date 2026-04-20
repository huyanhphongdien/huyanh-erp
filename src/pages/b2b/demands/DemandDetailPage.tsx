// ============================================================================
// DEMAND DETAIL PAGE — Chi tiet Nhu cau mua B2B
// File: src/pages/b2b/demands/DemandDetailPage.tsx
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useOpenDealTab } from '../../../hooks/useB2BTabs'
import {
  Card,
  Descriptions,
  Tag,
  Button,
  Space,
  Typography,
  Row,
  Col,
  Spin,
  Empty,
  Modal,
  Form,
  Input,
  Table,
  Progress,
  Popconfirm,
  Tabs,
  Badge,
  message,
  Breadcrumb,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  ArrowLeftOutlined,
  EditOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  CloudUploadOutlined,
  LockOutlined,
  FileTextOutlined,
  CommentOutlined,
  LinkOutlined,
  EyeOutlined,
} from '@ant-design/icons'
import {
  demandService,
  Demand,
  DemandOffer,
  DemandStatus,
  OfferStatus,
  DEMAND_STATUS_LABELS,
  DEMAND_STATUS_COLORS,
  DEMAND_TYPE_LABELS,
  DEMAND_TYPE_COLORS,
  OFFER_STATUS_LABELS,
  OFFER_STATUS_COLORS,
  PRIORITY_LABELS,
  PRIORITY_COLORS,
  PRODUCT_TYPE_NAMES,
} from '../../../services/b2b/demandService'
import {
  DEAL_STATUS_LABELS,
  DEAL_STATUS_COLORS,
} from '../../../services/b2b/dealService'
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'

const { Title, Text } = Typography
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
// HELPERS
// ============================================

const formatDate = (dateStr: string | null): string => {
  if (!dateStr) return '-'
  return format(new Date(dateStr), 'dd/MM/yyyy', { locale: vi })
}

const formatDateTime = (dateStr: string | null): string => {
  if (!dateStr) return '-'
  return format(new Date(dateStr), 'dd/MM/yyyy HH:mm', { locale: vi })
}

// ============================================
// MAIN COMPONENT
// ============================================

const DemandDetailPage = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const openDealTab = useOpenDealTab()

  // State
  const [demand, setDemand] = useState<Demand | null>(null)
  const [offers, setOffers] = useState<DemandOffer[]>([])
  const [linkedDeals, setLinkedDeals] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [offersLoading, setOffersLoading] = useState(false)
  const [dealsLoading, setDealsLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)

  // Modals
  const [rejectModal, setRejectModal] = useState<{ visible: boolean; offerId: string | null }>({
    visible: false,
    offerId: null,
  })
  const [rejectForm] = Form.useForm()

  // ============================================
  // DATA FETCHING
  // ============================================

  const fetchDemand = useCallback(async () => {
    if (!id) return

    try {
      setLoading(true)
      const data = await demandService.getById(id)
      setDemand(data)
    } catch (error) {
      console.error('Error fetching demand:', error)
      message.error('Không thể tải thông tin nhu cầu')
    } finally {
      setLoading(false)
    }
  }, [id])

  const fetchOffers = useCallback(async () => {
    if (!id) return

    try {
      setOffersLoading(true)
      const data = await demandService.getOffers(id)
      setOffers(data)
    } catch (error) {
      console.error('Error fetching offers:', error)
    } finally {
      setOffersLoading(false)
    }
  }, [id])

  const fetchLinkedDeals = useCallback(async () => {
    if (!id) return

    try {
      setDealsLoading(true)
      const data = await demandService.getLinkedDeals(id)
      setLinkedDeals(data)
    } catch (error) {
      console.error('Error fetching linked deals:', error)
    } finally {
      setDealsLoading(false)
    }
  }, [id])

  useEffect(() => {
    fetchDemand()
    fetchOffers()
    fetchLinkedDeals()
  }, [fetchDemand, fetchOffers, fetchLinkedDeals])

  // ============================================
  // HANDLERS
  // ============================================

  const handlePublish = async () => {
    if (!demand) return
    try {
      setActionLoading(true)
      await demandService.publish(demand.id)
      message.success('Đã đăng nhu cầu!')
      fetchDemand()
    } catch (error) {
      message.error('Không thể đăng nhu cầu')
    } finally {
      setActionLoading(false)
    }
  }

  const handleClose = async () => {
    if (!demand) return
    try {
      setActionLoading(true)
      await demandService.close(demand.id)
      message.success('Đã đóng nhu cầu!')
      fetchDemand()
    } catch (error) {
      message.error('Không thể đóng nhu cầu')
    } finally {
      setActionLoading(false)
    }
  }

  const handleCancel = async () => {
    if (!demand) return
    try {
      setActionLoading(true)
      await demandService.cancel(demand.id)
      message.success('Đã hủy nhu cầu!')
      fetchDemand()
    } catch (error) {
      message.error('Không thể hủy nhu cầu')
    } finally {
      setActionLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!demand) return
    try {
      setActionLoading(true)
      await demandService.delete(demand.id)
      message.success('Đã xóa nhu cầu!')
      navigate('/b2b/demands')
    } catch (error: any) {
      message.error(error.message || 'Không thể xóa nhu cầu')
    } finally {
      setActionLoading(false)
    }
  }

  const handleAcceptOffer = async (offer: DemandOffer) => {
    if (!demand) return

    Modal.confirm({
      title: 'Chấp nhận chào giá',
      content: (
        <div>
          <p>Chấp nhận chào giá từ <strong>{offer.partner?.name}</strong>?</p>
          <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0' }}>
            <li>Số lượng: <strong>{(offer.offered_quantity_kg / 1000).toFixed(1)} tấn</strong></li>
            <li>Giá: <strong>{offer.offered_price.toLocaleString()} đ/kg</strong></li>
            {offer.offered_drc && <li>DRC: <strong>{offer.offered_drc}%</strong></li>}
          </ul>
          <p>Hệ thống sẽ tự động tạo Deal mới từ chào giá này.</p>
        </div>
      ),
      okText: 'Chấp nhận',
      cancelText: 'Hủy',
      okButtonProps: { style: { backgroundColor: '#52c41a', borderColor: '#52c41a' } },
      onOk: async () => {
        try {
          const result = await demandService.acceptOffer(offer.id, demand.id)
          message.success(`Đã chấp nhận chào giá và tạo Deal ${result.deal.deal_number}`)
          fetchDemand()
          fetchOffers()
          fetchLinkedDeals()
        } catch (error: any) {
          message.error(error.message || 'Không thể chấp nhận chào giá')
        }
      },
    })
  }

  const handleRejectOffer = async () => {
    try {
      const values = await rejectForm.validateFields()
      if (!rejectModal.offerId) return

      await demandService.rejectOffer(rejectModal.offerId, values.reason)
      message.success('Đã từ chối chào giá')
      setRejectModal({ visible: false, offerId: null })
      rejectForm.resetFields()
      fetchOffers()
    } catch (error: any) {
      if (error.errorFields) return // validation error
      message.error(error.message || 'Không thể từ chối chào giá')
    }
  }

  // ============================================
  // OFFERS TABLE COLUMNS
  // ============================================

  const offerColumns: ColumnsType<DemandOffer> = [
    {
      title: 'Đại lý',
      key: 'partner',
      width: 180,
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Text strong>{record.partner?.name || '-'}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>{record.partner?.code}</Text>
        </Space>
      ),
    },
    {
      title: 'Tier',
      key: 'tier',
      width: 80,
      render: (_, record) =>
        record.partner?.tier ? (
          <Tag color={TIER_COLORS[record.partner.tier]}>
            {record.partner.tier.toUpperCase()}
          </Tag>
        ) : (
          '-'
        ),
    },
    {
      title: 'Mã lô',
      dataIndex: 'lot_code',
      key: 'lot_code',
      width: 100,
      render: (code: string | null, record) => code ? (
        <Space direction="vertical" size={0}>
          <Tag color="blue">{code}</Tag>
          {record.lot_description && <Text type="secondary" style={{ fontSize: 11 }}>{record.lot_description}</Text>}
        </Space>
      ) : <Text type="secondary">—</Text>,
    },
    {
      title: 'SL chào',
      dataIndex: 'offered_quantity_kg',
      key: 'offered_quantity_kg',
      width: 100,
      align: 'right',
      render: (kg: number) => <Text strong>{(kg / 1000).toFixed(1)} tấn</Text>,
    },
    {
      title: 'Giá chào',
      dataIndex: 'offered_price',
      key: 'offered_price',
      width: 120,
      align: 'right',
      render: (price: number) => (
        <Text strong style={{ color: '#1B4D3E' }}>
          {price.toLocaleString()} đ/kg
        </Text>
      ),
    },
    {
      title: 'DRC',
      dataIndex: 'offered_drc',
      key: 'offered_drc',
      width: 70,
      align: 'center',
      render: (drc: number | null) => (drc ? `${drc}%` : '-'),
    },
    {
      title: 'Ngày giao',
      dataIndex: 'offered_delivery_date',
      key: 'offered_delivery_date',
      width: 110,
      render: (date: string | null) => formatDate(date),
    },
    {
      title: 'Vùng',
      dataIndex: 'source_region',
      key: 'source_region',
      width: 100,
      render: (region: string | null) => region || '-',
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (status: OfferStatus) => (
        <Tag color={OFFER_STATUS_COLORS[status]}>
          {OFFER_STATUS_LABELS[status]}
        </Tag>
      ),
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 160,
      render: (_, record) => {
        if (record.status !== 'pending' && record.status !== 'submitted') {
          if (record.deal_id) {
            return (
              <Button
                type="link"
                size="small"
                icon={<EyeOutlined />}
                onClick={() => openDealTab({ id: record.deal_id })}
              >
                Xem Deal
              </Button>
            )
          }
          return null
        }

        return (
          <Space>
            <Button
              type="primary"
              size="small"
              icon={<CheckCircleOutlined />}
              onClick={() => handleAcceptOffer(record)}
              style={{ backgroundColor: '#52c41a', borderColor: '#52c41a' }}
            >
              Chấp nhận
            </Button>
            <Button
              danger
              size="small"
              icon={<CloseCircleOutlined />}
              onClick={() => setRejectModal({ visible: true, offerId: record.id })}
            >
              Từ chối
            </Button>
          </Space>
        )
      },
    },
  ]

  // ============================================
  // LINKED DEALS TABLE COLUMNS
  // ============================================

  const dealColumns: ColumnsType<any> = [
    {
      title: 'Mã Deal',
      dataIndex: 'deal_number',
      key: 'deal_number',
      width: 140,
      render: (text: string, record: any) => (
        <Button type="link" onClick={() => openDealTab(record)} style={{ padding: 0 }}>
          <Text strong>{text}</Text>
        </Button>
      ),
    },
    {
      title: 'Đại lý',
      key: 'partner',
      width: 160,
      render: (_: any, record: any) => record.partner?.name || '-',
    },
    {
      title: 'Số lượng',
      dataIndex: 'quantity_kg',
      key: 'quantity_kg',
      width: 100,
      align: 'right',
      render: (kg: number) => <Text strong>{(kg / 1000).toFixed(1)} tấn</Text>,
    },
    {
      title: 'Đơn giá',
      dataIndex: 'unit_price',
      key: 'unit_price',
      width: 120,
      align: 'right',
      render: (price: number) => price ? `${price.toLocaleString()} đ/kg` : '-',
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status: string) => (
        <Tag color={DEAL_STATUS_COLORS[status as keyof typeof DEAL_STATUS_COLORS] || 'default'}>
          {DEAL_STATUS_LABELS[status as keyof typeof DEAL_STATUS_LABELS] || status}
        </Tag>
      ),
    },
    {
      title: 'Ngày tạo',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 110,
      render: (date: string) => formatDate(date),
    },
  ]

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

  if (!demand) {
    return (
      <div style={{ padding: 24 }}>
        <Empty description="Không tìm thấy nhu cầu" />
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Button onClick={() => navigate('/b2b/demands')}>Quay lại</Button>
        </div>
      </div>
    )
  }

  const fillPercent = demand.quantity_kg > 0
    ? Math.round((demand.quantity_filled_kg / demand.quantity_kg) * 100)
    : 0

  // Action buttons based on status
  const renderActions = () => {
    const actions: React.ReactNode[] = []

    if (demand.status === 'draft') {
      actions.push(
        <Popconfirm
          key="publish"
          title="Đăng nhu cầu này?"
          description="Nhu cầu sẽ được hiển thị cho đại lý trên Portal"
          onConfirm={handlePublish}
          okText="Đăng"
          cancelText="Hủy"
        >
          <Button
            type="primary"
            icon={<CloudUploadOutlined />}
            loading={actionLoading}
            style={{ backgroundColor: '#1B4D3E', borderColor: '#1B4D3E' }}
          >
            Đăng
          </Button>
        </Popconfirm>
      )
      actions.push(
        <Button
          key="edit"
          icon={<EditOutlined />}
          onClick={() => navigate(`/b2b/demands/${demand.id}/edit`)}
        >
          Sửa
        </Button>
      )
      actions.push(
        <Popconfirm
          key="delete"
          title="Xóa nhu cầu này?"
          description="Hành động này không thể hoàn tác"
          onConfirm={handleDelete}
          okText="Xóa"
          cancelText="Hủy"
          okButtonProps={{ danger: true }}
        >
          <Button danger icon={<DeleteOutlined />} loading={actionLoading}>
            Xóa
          </Button>
        </Popconfirm>
      )
    }

    if (demand.status === 'published' || demand.status === 'partially_filled') {
      actions.push(
        <Popconfirm
          key="close"
          title="Đóng nhu cầu này?"
          description="Nhu cầu sẽ không hiển thị cho đại lý nữa"
          onConfirm={handleClose}
          okText="Đóng"
          cancelText="Hủy"
        >
          <Button icon={<LockOutlined />} loading={actionLoading}>
            Đóng
          </Button>
        </Popconfirm>
      )
      actions.push(
        <Button
          key="edit"
          icon={<EditOutlined />}
          onClick={() => navigate(`/b2b/demands/${demand.id}/edit`)}
        >
          Sửa
        </Button>
      )
    }

    return actions
  }

  const pendingOffersCount = offers.filter(o => o.status === 'pending' || o.status === 'submitted').length

  return (
    <div style={{ padding: 24 }}>
      {/* Breadcrumb */}
      <Breadcrumb
        style={{ marginBottom: 16 }}
        items={[
          { title: <a onClick={() => navigate('/b2b')}>B2B</a> },
          { title: <a onClick={() => navigate('/b2b/demands')}>Nhu cầu mua</a> },
          { title: demand.code },
        ]}
      />

      {/* Header Card */}
      <Card style={{ marginBottom: 24, borderRadius: 12 }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Space>
              <Button
                type="text"
                icon={<ArrowLeftOutlined />}
                onClick={() => navigate('/b2b/demands')}
              />
              <div>
                <Space align="center">
                  <Title level={4} style={{ margin: 0 }}>
                    {demand.code}
                  </Title>
                  <Tag color={DEMAND_STATUS_COLORS[demand.status]} style={{ fontSize: 14 }}>
                    {DEMAND_STATUS_LABELS[demand.status]}
                  </Tag>
                  <Tag color={PRIORITY_COLORS[demand.priority]} style={{ fontSize: 14 }}>
                    {PRIORITY_LABELS[demand.priority] || demand.priority}
                  </Tag>
                  <Tag color={DEMAND_TYPE_COLORS[demand.demand_type]}>
                    {DEMAND_TYPE_LABELS[demand.demand_type]}
                  </Tag>
                </Space>
                <div style={{ marginTop: 4 }}>
                  <Text type="secondary">
                    Tạo lúc: {formatDateTime(demand.created_at)}
                    {demand.published_at && ` | Đăng lúc: ${formatDateTime(demand.published_at)}`}
                  </Text>
                </div>
              </div>
            </Space>
          </Col>
          <Col>
            <Space>{renderActions()}</Space>
          </Col>
        </Row>

        {/* Progress bar */}
        <div style={{ marginTop: 16 }}>
          <Row align="middle" gutter={16}>
            <Col flex="auto">
              <Progress
                percent={fillPercent}
                strokeColor="#1B4D3E"
                format={() => `${(demand.quantity_filled_kg / 1000).toFixed(1)} / ${(demand.quantity_kg / 1000).toFixed(1)} tấn`}
              />
            </Col>
            <Col>
              <Text strong style={{ color: '#1B4D3E' }}>{fillPercent}%</Text>
            </Col>
          </Row>
        </div>
      </Card>

      {/* Tabs */}
      <Tabs
        defaultActiveKey="info"
        size="large"
        items={[
          {
            key: 'info',
            label: (
              <span><FileTextOutlined /> Thông tin</span>
            ),
            children: (
              <Row gutter={24}>
                <Col xs={24} lg={16}>
                  <Card
                    title="Thông tin nhu cầu"
                    style={{ marginBottom: 24, borderRadius: 12 }}
                  >
                    <Descriptions bordered column={{ xs: 1, sm: 2 }}>
                      <Descriptions.Item label="Mã">{demand.code}</Descriptions.Item>
                      <Descriptions.Item label="Loại">
                        <Tag color={DEMAND_TYPE_COLORS[demand.demand_type]}>
                          {DEMAND_TYPE_LABELS[demand.demand_type]}
                        </Tag>
                      </Descriptions.Item>
                      <Descriptions.Item label="Sản phẩm">{demand.product_name}</Descriptions.Item>
                      <Descriptions.Item label="Loại sản phẩm">
                        {PRODUCT_TYPE_NAMES[demand.product_type] || demand.product_type}
                      </Descriptions.Item>
                      <Descriptions.Item label="Số lượng yêu cầu">
                        <Text strong style={{ color: '#1B4D3E', fontSize: 16 }}>
                          {(demand.quantity_kg / 1000).toFixed(1)} tấn ({demand.quantity_kg.toLocaleString()} kg)
                        </Text>
                      </Descriptions.Item>
                      <Descriptions.Item label="Đã đủ">
                        <Text strong>
                          {(demand.quantity_filled_kg / 1000).toFixed(1)} tấn ({demand.quantity_filled_kg.toLocaleString()} kg)
                        </Text>
                      </Descriptions.Item>
                      <Descriptions.Item label="DRC yêu cầu">
                        {demand.drc_min || demand.drc_max
                          ? `${demand.drc_min || '?'}% - ${demand.drc_max || '?'}%`
                          : '-'}
                      </Descriptions.Item>
                      <Descriptions.Item label="Khoảng giá">
                        {demand.price_min || demand.price_max
                          ? `${demand.price_min?.toLocaleString() || '?'} - ${demand.price_max?.toLocaleString() || '?'} đ/kg`
                          : '-'}
                      </Descriptions.Item>
                      <Descriptions.Item label="Hạn chót">
                        {demand.deadline ? (
                          <Text
                            style={
                              new Date(demand.deadline) < new Date()
                                ? { color: '#ff4d4f', fontWeight: 600 }
                                : undefined
                            }
                          >
                            {formatDate(demand.deadline)}
                          </Text>
                        ) : (
                          '-'
                        )}
                      </Descriptions.Item>
                      <Descriptions.Item label="Ưu tiên">
                        <Tag color={PRIORITY_COLORS[demand.priority]}>
                          {PRIORITY_LABELS[demand.priority] || demand.priority}
                        </Tag>
                      </Descriptions.Item>
                      <Descriptions.Item label="Thời gian giao hàng" span={2}>
                        {demand.delivery_from && demand.delivery_to
                          ? `${formatDate(demand.delivery_from)} - ${formatDate(demand.delivery_to)}`
                          : '-'}
                      </Descriptions.Item>
                      {demand.preferred_regions && demand.preferred_regions.length > 0 && (
                        <Descriptions.Item label="Vùng ưu tiên" span={2}>
                          <Space wrap>
                            {demand.preferred_regions.map(r => (
                              <Tag key={r}>{r}</Tag>
                            ))}
                          </Space>
                        </Descriptions.Item>
                      )}

                      {/* Processing fields */}
                      {demand.demand_type === 'processing' && (
                        <>
                          {demand.processing_fee_per_ton && (
                            <Descriptions.Item label="Phí gia công">
                              {demand.processing_fee_per_ton.toLocaleString()} đ/tấn
                            </Descriptions.Item>
                          )}
                          {demand.expected_output_rate && (
                            <Descriptions.Item label="Tỷ lệ thu hồi dự kiến">
                              {demand.expected_output_rate}%
                            </Descriptions.Item>
                          )}
                          {demand.target_grade && (
                            <Descriptions.Item label="Hạng mục tiêu">
                              {demand.target_grade}
                            </Descriptions.Item>
                          )}
                        </>
                      )}

                      {demand.notes && (
                        <Descriptions.Item label="Ghi chú" span={2}>
                          {demand.notes}
                        </Descriptions.Item>
                      )}
                      {demand.internal_notes && (
                        <Descriptions.Item label="Ghi chú nội bộ" span={2}>
                          <Text style={{ color: '#faad14' }}>{demand.internal_notes}</Text>
                        </Descriptions.Item>
                      )}
                    </Descriptions>
                  </Card>
                </Col>
                <Col xs={24} lg={8}>
                  <Card title="Trạng thái" style={{ marginBottom: 24, borderRadius: 12 }}>
                    <Space direction="vertical" style={{ width: '100%' }} size={16}>
                      <div>
                        <Text type="secondary">Trạng thái</Text>
                        <div>
                          <Tag color={DEMAND_STATUS_COLORS[demand.status]} style={{ fontSize: 14 }}>
                            {DEMAND_STATUS_LABELS[demand.status]}
                          </Tag>
                        </div>
                      </div>
                      <div>
                        <Text type="secondary">Tiến độ</Text>
                        <Progress
                          percent={fillPercent}
                          strokeColor="#1B4D3E"
                          size="small"
                        />
                      </div>
                      <div>
                        <Text type="secondary">Chào giá</Text>
                        <div>
                          <Text strong style={{ fontSize: 18 }}>{demand.offers_count || 0}</Text>
                          <Text type="secondary"> chào giá</Text>
                          {(demand.pending_offers_count || 0) > 0 && (
                            <Badge
                              count={demand.pending_offers_count}
                              style={{ marginLeft: 8 }}
                            />
                          )}
                        </div>
                      </div>
                      <div>
                        <Text type="secondary">Ngày tạo</Text>
                        <div><Text>{formatDateTime(demand.created_at)}</Text></div>
                      </div>
                      {demand.published_at && (
                        <div>
                          <Text type="secondary">Ngày đăng</Text>
                          <div><Text>{formatDateTime(demand.published_at)}</Text></div>
                        </div>
                      )}
                    </Space>
                  </Card>
                </Col>
              </Row>
            ),
          },
          {
            key: 'offers',
            label: (
              <span>
                <CommentOutlined /> Chào giá
                {(demand.offers_count || 0) > 0 && (
                  <Badge
                    count={demand.offers_count}
                    style={{ marginLeft: 8, backgroundColor: pendingOffersCount > 0 ? '#ff4d4f' : '#1B4D3E' }}
                  />
                )}
              </span>
            ),
            children: (
              <Card style={{ borderRadius: 12 }}>
                <Table
                  columns={offerColumns}
                  dataSource={offers}
                  rowKey="id"
                  loading={offersLoading}
                  pagination={false}
                  scroll={{ x: 1200 }}
                  locale={{ emptyText: 'Chưa có chào giá nào' }}
                />
              </Card>
            ),
          },
          {
            key: 'deals',
            label: (
              <span>
                <LinkOutlined /> Deals liên kết
                {linkedDeals.length > 0 && (
                  <Badge count={linkedDeals.length} style={{ marginLeft: 8, backgroundColor: '#1B4D3E' }} />
                )}
              </span>
            ),
            children: (
              <Card style={{ borderRadius: 12 }}>
                <Table
                  columns={dealColumns}
                  dataSource={linkedDeals}
                  rowKey="id"
                  loading={dealsLoading}
                  pagination={false}
                  locale={{ emptyText: 'Chưa có Deal liên kết nào' }}
                />
              </Card>
            ),
          },
        ]}
      />

      {/* Reject Modal */}
      <Modal
        title="Từ chối chào giá"
        open={rejectModal.visible}
        onOk={handleRejectOffer}
        onCancel={() => {
          setRejectModal({ visible: false, offerId: null })
          rejectForm.resetFields()
        }}
        okText="Từ chối"
        okButtonProps={{ danger: true }}
        cancelText="Hủy"
      >
        <Form form={rejectForm} layout="vertical">
          <Form.Item
            name="reason"
            label="Lý do từ chối"
            rules={[{ required: true, message: 'Vui lòng nhập lý do từ chối' }]}
          >
            <TextArea rows={3} placeholder="Nhập lý do từ chối chào giá..." />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default DemandDetailPage
