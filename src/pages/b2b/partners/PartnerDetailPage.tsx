// ============================================================================
// PARTNER DETAIL PAGE — Chi tiết Đại lý với Tabs
// File: src/pages/b2b/partners/PartnerDetailPage.tsx
// Phase: E4.1.1, E4.1.2, E4.1.3, E4.1.4, E4.1.5, E4.1.6
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Card,
  Tabs,
  Descriptions,
  Table,
  Tag,
  Button,
  Space,
  Typography,
  Row,
  Col,
  Avatar,
  Badge,
  Statistic,
  Timeline,
  Divider,
  Spin,
  Empty,
  Tooltip,
  message,
  Breadcrumb,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  ArrowLeftOutlined,
  MessageOutlined,
  ShoppingOutlined,
  DollarOutlined,
  UserOutlined,
  PhoneOutlined,
  MailOutlined,
  EnvironmentOutlined,
  EditOutlined,
  PlusOutlined,
  EyeOutlined,
  CalendarOutlined,
} from '@ant-design/icons'
import {
  partnerService,
  Partner,
  PartnerStats,
  TIER_LABELS,
  TIER_COLORS,
  TIER_ICONS,
  PARTNER_STATUS_LABELS,
  PARTNER_STATUS_COLORS,
  PARTNER_TYPE_LABELS,
} from '../../../services/b2b/partnerService'
import {
  dealService,
  Deal,
  DealStatus,
  DEAL_STATUS_LABELS,
  DEAL_STATUS_COLORS,
} from '../../../services/b2b/dealService'
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'

const { Title, Text, Paragraph } = Typography
const { TabPane } = Tabs

// ============================================
// HELPER FUNCTIONS
// ============================================

const formatCurrency = (value: number | null): string => {
  if (!value) return '-'
  if (value >= 1000000000) {
    return `${(value / 1000000000).toFixed(2)} tỷ`
  }
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)} tr`
  }
  return value.toLocaleString('vi-VN')
}

const formatDate = (dateStr: string | null): string => {
  if (!dateStr) return '-'
  return format(new Date(dateStr), 'dd/MM/yyyy', { locale: vi })
}

// ============================================
// TAB: INFO
// ============================================

interface InfoTabProps {
  partner: Partner
  stats: PartnerStats | null
}

const InfoTab = ({ partner, stats }: InfoTabProps) => {
  return (
    <Row gutter={24}>
      <Col xs={24} lg={16}>
        <Card title="Thông tin chi tiết" style={{ marginBottom: 24 }}>
          <Descriptions bordered column={{ xs: 1, sm: 2 }}>
            <Descriptions.Item label="Mã đại lý">{partner.code}</Descriptions.Item>
            <Descriptions.Item label="Tên đại lý">{partner.name}</Descriptions.Item>
            <Descriptions.Item label="Loại">
              {PARTNER_TYPE_LABELS[partner.partner_type]}
            </Descriptions.Item>
            <Descriptions.Item label="Hạng">
              <Tag color={TIER_COLORS[partner.tier]}>
                {TIER_ICONS[partner.tier]} {TIER_LABELS[partner.tier]}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Trạng thái">
              <Tag color={PARTNER_STATUS_COLORS[partner.status]}>
                {PARTNER_STATUS_LABELS[partner.status]}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Ngày tạo">
              {formatDate(partner.created_at)}
            </Descriptions.Item>
            <Descriptions.Item label="Điện thoại" span={2}>
              <Space>
                <PhoneOutlined />
                {partner.phone || '-'}
              </Space>
            </Descriptions.Item>
            <Descriptions.Item label="Email" span={2}>
              <Space>
                <MailOutlined />
                {partner.email || '-'}
              </Space>
            </Descriptions.Item>
            <Descriptions.Item label="Địa chỉ" span={2}>
              <Space>
                <EnvironmentOutlined />
                {partner.address || '-'}
              </Space>
            </Descriptions.Item>
          </Descriptions>
        </Card>
      </Col>

      <Col xs={24} lg={8}>
        <Card title="Thống kê" style={{ marginBottom: 24 }}>
          <Row gutter={[16, 16]}>
            <Col span={12}>
              <Statistic
                title="Tổng giao dịch"
                value={stats?.totalDeals || 0}
                valueStyle={{ color: '#1B4D3E' }}
              />
            </Col>
            <Col span={12}>
              <Statistic
                title="Đang xử lý"
                value={stats?.dealsProcessing || 0}
                valueStyle={{ color: '#1677ff' }}
              />
            </Col>
            <Col span={12}>
              <Statistic
                title="Sản lượng"
                value={stats?.totalQuantity || 0}
                suffix="tấn"
                precision={1}
              />
            </Col>
            <Col span={12}>
              <Statistic
                title="Tin chưa đọc"
                value={stats?.unreadMessages || 0}
                valueStyle={{ color: stats?.unreadMessages ? '#ff4d4f' : undefined }}
              />
            </Col>
            <Col span={24}>
              <Divider style={{ margin: '12px 0' }} />
              <Statistic
                title="Tổng giá trị giao dịch"
                value={stats?.totalValue || 0}
                suffix="VNĐ"
                valueStyle={{ color: '#1B4D3E', fontSize: 20 }}
                formatter={(value) => formatCurrency(Number(value))}
              />
            </Col>
          </Row>
        </Card>
      </Col>
    </Row>
  )
}

// ============================================
// TAB: CHAT (E4.1.2)
// ============================================

interface ChatTabProps {
  partner: Partner
  onOpenChat: () => void
}

const ChatTab = ({ partner, onOpenChat }: ChatTabProps) => {
  return (
    <Card>
      <div style={{ textAlign: 'center', padding: '40px 0' }}>
        <Avatar
          size={80}
          style={{ backgroundColor: '#1B4D3E', marginBottom: 16 }}
        >
          {partner.name.charAt(0)}
        </Avatar>
        <Title level={4}>{partner.name}</Title>
        <Text type="secondary">{partner.code}</Text>
        <br /><br />
        <Button
          type="primary"
          size="large"
          icon={<MessageOutlined />}
          onClick={onOpenChat}
        >
          Mở phòng Chat
        </Button>
        <br /><br />
        <Text type="secondary">
          Nhấn để mở cuộc hội thoại với đại lý
        </Text>
      </div>
    </Card>
  )
}

// ============================================
// TAB: DEALS (E4.1.3)
// ============================================

interface DealsTabProps {
  partnerId: string
}

const DealsTab = ({ partnerId }: DealsTabProps) => {
  const navigate = useNavigate()
  const [deals, setDeals] = useState<Deal[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchDeals = async () => {
      try {
        setLoading(true)
        const response = await dealService.getDeals({
          partner_id: partnerId,
          pageSize: 50,
        })
        setDeals(response.data)
      } catch (error) {
        console.error('Error fetching deals:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchDeals()
  }, [partnerId])

  const columns: ColumnsType<Deal> = [
    {
      title: 'Mã Deal',
      dataIndex: 'deal_number',
      key: 'deal_number',
      render: (text, record) => (
        <Button type="link" onClick={() => navigate(`/b2b/deals/${record.id}`)}>
          {text}
        </Button>
      ),
    },
    {
      title: 'Sản phẩm',
      dataIndex: 'product_name',
      key: 'product_name',
    },
    {
      title: 'Số lượng',
      key: 'quantity',
      align: 'right',
      render: (_, record) => `${record.quantity_tons?.toFixed(1) || '-'} tấn`,
    },
    {
      title: 'Giá trị',
      dataIndex: 'total_value_vnd',
      key: 'total_value_vnd',
      align: 'right',
      render: (val) => formatCurrency(val),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      render: (status: DealStatus) => (
        <Tag color={DEAL_STATUS_COLORS[status]}>
          {DEAL_STATUS_LABELS[status]}
        </Tag>
      ),
    },
    {
      title: 'Ngày tạo',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date) => formatDate(date),
    },
    {
      title: '',
      key: 'action',
      width: 50,
      render: (_, record) => (
        <Tooltip title="Xem chi tiết">
          <Button
            type="text"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => navigate(`/b2b/deals/${record.id}`)}
          />
        </Tooltip>
      ),
    },
  ]

  return (
    <Card
      title="Danh sách giao dịch"
      extra={
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => navigate(`/b2b/deals/create?partner_id=${partnerId}`)}
        >
          Tạo Deal
        </Button>
      }
    >
      <Table
        columns={columns}
        dataSource={deals}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 10 }}
        locale={{ emptyText: <Empty description="Chưa có giao dịch nào" /> }}
      />
    </Card>
  )
}

// ============================================
// TAB: CÔNG NỢ (E4.1.4)
// ============================================

interface DebtTabProps {
  partner: Partner
}

const DebtTab = ({ partner }: DebtTabProps) => {
  // Placeholder data - sẽ được implement trong Phase E5
  const debtData = {
    totalAdvance: 0,
    totalPaid: 0,
    remaining: 0,
    transactions: [],
  }

  return (
    <Row gutter={24}>
      <Col xs={24} lg={16}>
        <Card title="Tổng quan công nợ" style={{ marginBottom: 24 }}>
          <Descriptions bordered column={{ xs: 1, sm: 3 }}>
            <Descriptions.Item label="Tổng tạm ứng">
              <Text strong style={{ color: '#1677ff', fontSize: 18 }}>
                {formatCurrency(debtData.totalAdvance)}
              </Text>
            </Descriptions.Item>
            <Descriptions.Item label="Đã thanh toán">
              <Text strong style={{ color: '#52c41a', fontSize: 18 }}>
                {formatCurrency(debtData.totalPaid)}
              </Text>
            </Descriptions.Item>
            <Descriptions.Item label="Còn lại">
              <Text strong style={{ color: '#ff4d4f', fontSize: 18 }}>
                {formatCurrency(debtData.remaining)}
              </Text>
            </Descriptions.Item>
          </Descriptions>
        </Card>

        <Card title="Lịch sử giao dịch">
          {debtData.transactions.length > 0 ? (
            <Timeline items={[]} />
          ) : (
            <Empty description="Chưa có giao dịch công nợ" />
          )}
        </Card>
      </Col>

      <Col xs={24} lg={8}>
        <Card title="Thao tác nhanh">
          <Space direction="vertical" style={{ width: '100%' }}>
            <Button block icon={<PlusOutlined />} disabled>
              Ghi nhận tạm ứng
            </Button>
            <Button block icon={<DollarOutlined />} disabled>
              Ghi nhận thanh toán
            </Button>
            <Button block icon={<CalendarOutlined />} disabled>
              Quyết toán kỳ
            </Button>
            <Divider />
            <Text type="secondary" style={{ fontSize: 12 }}>
              * Chức năng công nợ sẽ được hoàn thiện trong Phase E5
            </Text>
          </Space>
        </Card>
      </Col>
    </Row>
  )
}

// ============================================
// MAIN COMPONENT
// ============================================

const PartnerDetailPage = () => {
  const { partnerId } = useParams<{ partnerId: string }>()
  const navigate = useNavigate()

  // State
  const [partner, setPartner] = useState<Partner | null>(null)
  const [stats, setStats] = useState<PartnerStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('info')

  // ============================================
  // DATA FETCHING
  // ============================================

  const fetchPartner = useCallback(async () => {
    if (!partnerId) return

    try {
      setLoading(true)
      const [partnerData, statsData] = await Promise.all([
        partnerService.getPartnerById(partnerId),
        partnerService.getPartnerStats(partnerId),
      ])
      setPartner(partnerData)
      setStats(statsData)
    } catch (error) {
      console.error('Error fetching partner:', error)
      message.error('Không thể tải thông tin đại lý')
    } finally {
      setLoading(false)
    }
  }, [partnerId])

  useEffect(() => {
    fetchPartner()
  }, [fetchPartner])

  // ============================================
  // HANDLERS
  // ============================================

  const handleOpenChat = async () => {
    if (!partner) return

    try {
      const room = await partnerService.getChatRoom(partner.id)
      if (room) {
        navigate(`/b2b/chat/${room.id}`)
      } else {
        message.info('Chưa có phòng chat với đại lý này')
      }
    } catch (error) {
      message.error('Không thể mở chat')
    }
  }

  const handleCreateDeal = () => {
    if (!partner) return
    navigate(`/b2b/deals/create?partner_id=${partner.id}`)
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

  if (!partner) {
    return (
      <div style={{ padding: 24 }}>
        <Empty description="Không tìm thấy đại lý" />
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Button onClick={() => navigate('/b2b/partners')}>Quay lại</Button>
        </div>
      </div>
    )
  }

  const tabItems = [
    {
      key: 'info',
      label: (
        <span>
          <UserOutlined />
          Thông tin
        </span>
      ),
      children: <InfoTab partner={partner} stats={stats} />,
    },
    {
      key: 'chat',
      label: (
        <Badge count={stats?.unreadMessages} size="small" offset={[8, 0]}>
          <span>
            <MessageOutlined />
            Chat
          </span>
        </Badge>
      ),
      children: <ChatTab partner={partner} onOpenChat={handleOpenChat} />,
    },
    {
      key: 'deals',
      label: (
        <Badge count={stats?.dealsProcessing} size="small" offset={[8, 0]} color="blue">
          <span>
            <ShoppingOutlined />
            Giao dịch
          </span>
        </Badge>
      ),
      children: <DealsTab partnerId={partner.id} />,
    },
    {
      key: 'debt',
      label: (
        <span>
          <DollarOutlined />
          Công nợ
        </span>
      ),
      children: <DebtTab partner={partner} />,
    },
  ]

  return (
    <div style={{ padding: 24 }}>
      {/* Breadcrumb */}
      <Breadcrumb
        style={{ marginBottom: 16 }}
        items={[
          { title: <a onClick={() => navigate('/b2b')}>B2B</a> },
          { title: <a onClick={() => navigate('/b2b/partners')}>Đại lý</a> },
          { title: partner.name },
        ]}
      />

      {/* Header (E4.1.5, E4.1.6) */}
      <Card style={{ marginBottom: 24, borderRadius: 12 }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Space size={16}>
              <Button
                type="text"
                icon={<ArrowLeftOutlined />}
                onClick={() => navigate('/b2b/partners')}
              />
              <Badge count={stats?.unreadMessages} offset={[-5, 5]}>
                <Avatar
                  size={64}
                  style={{ backgroundColor: '#1B4D3E', fontSize: 24 }}
                >
                  {partner.name.charAt(0)}
                </Avatar>
              </Badge>
              <div>
                <Space align="center">
                  <Title level={4} style={{ margin: 0 }}>
                    {partner.name}
                  </Title>
                  <Tag color={TIER_COLORS[partner.tier]} style={{ fontSize: 12 }}>
                    {TIER_ICONS[partner.tier]} {TIER_LABELS[partner.tier]}
                  </Tag>
                  <Tag color={PARTNER_STATUS_COLORS[partner.status]}>
                    {PARTNER_STATUS_LABELS[partner.status]}
                  </Tag>
                </Space>
                <div style={{ marginTop: 4 }}>
                  <Text type="secondary">{partner.code}</Text>
                  {partner.phone && (
                    <>
                      <Divider type="vertical" />
                      <Text type="secondary">{partner.phone}</Text>
                    </>
                  )}
                </div>
              </div>
            </Space>
          </Col>
          <Col>
            <Space>
              <Button icon={<EditOutlined />}>Chỉnh sửa</Button>
              <Button icon={<MessageOutlined />} onClick={handleOpenChat}>
                Mở Chat
              </Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={handleCreateDeal}>
                Tạo Deal
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* Tabs (E4.1.1) */}
      <Card style={{ borderRadius: 12 }}>
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={tabItems}
        />
      </Card>
    </div>
  )
}

export default PartnerDetailPage