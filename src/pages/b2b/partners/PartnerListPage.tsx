// ============================================================================
// PARTNER LIST PAGE — Danh sách Đại lý với Card Grid
// File: src/pages/b2b/partners/PartnerListPage.tsx
// Phase: E4.2.1, E4.2.2, E4.2.3, E4.2.4, E4.2.5
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Card,
  Row,
  Col,
  Input,
  Select,
  Segmented,
  Avatar,
  Tag,
  Badge,
  Button,
  Space,
  Typography,
  Tooltip,
  Spin,
  Empty,
  Pagination,
  Statistic,
  message,
} from 'antd'
import {
  SearchOutlined,
  MessageOutlined,
  ShoppingOutlined,
  DollarOutlined,
  UserOutlined,
  ReloadOutlined,
  PlusOutlined,
  FilterOutlined,
} from '@ant-design/icons'
import {
  partnerService,
  Partner,
  PartnerTier,
  PartnerListParams,
  TIER_LABELS,
  TIER_COLORS,
  TIER_ICONS,
  PARTNER_STATUS_LABELS,
  PARTNER_STATUS_COLORS,
} from '../../../services/b2b/partnerService'

const { Title, Text } = Typography

// ============================================
// CONSTANTS
// ============================================

const TIER_OPTIONS = [
  { label: 'Tất cả', value: 'all' },
  { label: '💎 Kim cương', value: 'diamond' },
  { label: '🥇 Vàng', value: 'gold' },
  { label: '🥈 Bạc', value: 'silver' },
  { label: '🥉 Đồng', value: 'bronze' },
  { label: '🆕 Mới', value: 'new' },
]

// ============================================
// PARTNER CARD COMPONENT (E4.2.1)
// ============================================

interface PartnerCardProps {
  partner: Partner
  onView: () => void
  onChat: () => void
  onDeals: () => void
}

const PartnerCard = ({ partner, onView, onChat, onDeals }: PartnerCardProps) => {
  const hasUnread = (partner.unread_count || 0) > 0
  const hasDealsProcessing = (partner.deals_processing || 0) > 0

  return (
    <Card
      hoverable
      style={{ borderRadius: 12, height: '100%' }}
      bodyStyle={{ padding: 20 }}
      onClick={onView}
      actions={[
        <Tooltip title="Mở Chat" key="chat">
          <Badge count={partner.unread_count} size="small">
            <Button
              type="text"
              icon={<MessageOutlined />}
              onClick={(e) => {
                e.stopPropagation()
                onChat()
              }}
            />
          </Badge>
        </Tooltip>,
        <Tooltip title="Giao dịch" key="deals">
          <Badge count={partner.deals_processing} size="small" color="blue">
            <Button
              type="text"
              icon={<ShoppingOutlined />}
              onClick={(e) => {
                e.stopPropagation()
                onDeals()
              }}
            />
          </Badge>
        </Tooltip>,
        <Tooltip title="Công nợ" key="debt">
          <Button
            type="text"
            icon={<DollarOutlined />}
            onClick={(e) => {
              e.stopPropagation()
              // Navigate to ledger
            }}
          />
        </Tooltip>,
      ]}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: 16 }}>
        <Badge dot={hasUnread} offset={[-5, 5]}>
          <Avatar
            size={56}
            style={{
              backgroundColor: hasUnread ? '#1677ff' : '#1B4D3E',
              fontSize: 22,
            }}
          >
            {partner.name.charAt(0).toUpperCase()}
          </Avatar>
        </Badge>
        <div style={{ marginLeft: 12, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Text strong style={{ fontSize: 16 }}>{partner.name}</Text>
          </div>
          <Space size={4} style={{ marginTop: 4 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>{partner.code}</Text>
            <Tag color={TIER_COLORS[partner.tier]} style={{ fontSize: 10, margin: 0 }}>
              {TIER_ICONS[partner.tier]} {TIER_LABELS[partner.tier]}
            </Tag>
          </Space>
        </div>
      </div>

      {/* Stats */}
      <Row gutter={8}>
        <Col span={12}>
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <Text type="secondary" style={{ fontSize: 11 }}>Deals</Text>
            <br />
            <Text strong style={{ fontSize: 16, color: '#1B4D3E' }}>
              {partner.deals_count || 0}
            </Text>
          </div>
        </Col>
        <Col span={12}>
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <Text type="secondary" style={{ fontSize: 11 }}>Sản lượng</Text>
            <br />
            <Text strong style={{ fontSize: 16, color: '#1B4D3E' }}>
              {partner.total_quantity?.toFixed(1) || 0} <Text type="secondary" style={{ fontSize: 11 }}>tấn</Text>
            </Text>
          </div>
        </Col>
      </Row>

      {/* Contact */}
      {partner.phone && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #f0f0f0' }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            📞 {partner.phone}
          </Text>
        </div>
      )}
    </Card>
  )
}

// ============================================
// MAIN COMPONENT
// ============================================

const PartnerListPage = () => {
  const navigate = useNavigate()

  // State
  const [partners, setPartners] = useState<Partner[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [searchText, setSearchText] = useState('')
  const [tierFilter, setTierFilter] = useState<string>('all')
  const [pagination, setPagination] = useState({ current: 1, pageSize: 12 })

  // ============================================
  // DATA FETCHING
  // ============================================

  const fetchPartners = useCallback(async () => {
    try {
      setLoading(true)

      const params: PartnerListParams = {
        page: pagination.current,
        pageSize: pagination.pageSize,
        search: searchText || undefined,
        tier: tierFilter !== 'all' ? (tierFilter as PartnerTier) : undefined,
      }

      // Get partners with stats
      const response = await partnerService.getPartners(params)
      
      // Get stats for each partner (parallel)
      const partnersWithStats = await Promise.all(
        response.data.map(async (partner) => {
          try {
            const stats = await partnerService.getPartnerStats(partner.id)
            return {
              ...partner,
              unread_count: stats.unreadMessages,
              deals_count: stats.totalDeals,
              deals_processing: stats.dealsProcessing,
              total_quantity: stats.totalQuantity,
              total_value: stats.totalValue,
            }
          } catch {
            return partner
          }
        })
      )

      setPartners(partnersWithStats)
      setTotal(response.total)
    } catch (error) {
      console.error('Error fetching partners:', error)
      message.error('Không thể tải danh sách đại lý')
    } finally {
      setLoading(false)
    }
  }, [pagination, searchText, tierFilter])

  useEffect(() => {
    fetchPartners()
  }, [fetchPartners])

  // ============================================
  // HANDLERS
  // ============================================

  const handleSearch = (value: string) => {
    setSearchText(value)
    setPagination(prev => ({ ...prev, current: 1 }))
  }

  const handleTierChange = (value: string) => {
    setTierFilter(value)
    setPagination(prev => ({ ...prev, current: 1 }))
  }

  const handlePageChange = (page: number, pageSize: number) => {
    setPagination({ current: page, pageSize })
  }

  const handleViewPartner = (partner: Partner) => {
    navigate(`/b2b/partners/${partner.id}`)
  }

  const handleOpenChat = async (partner: Partner) => {
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

  const handleViewDeals = (partner: Partner) => {
    navigate(`/b2b/deals?partner_id=${partner.id}`)
  }

  const handleRefresh = () => {
    fetchPartners()
  }

  // ============================================
  // RENDER
  // ============================================

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Title level={3} style={{ margin: 0 }}>Quản lý Đại lý</Title>
            <Text type="secondary">Danh sách đối tác B2B</Text>
          </Col>
          <Col>
            <Space>
              <Button icon={<ReloadOutlined />} onClick={handleRefresh}>
                Làm mới
              </Button>
              <Button type="primary" icon={<PlusOutlined />}>
                Thêm Đại lý
              </Button>
            </Space>
          </Col>
        </Row>
      </div>

      {/* Filters (E4.2.5) */}
      <Card style={{ marginBottom: 24, borderRadius: 12 }}>
        <Row gutter={16} align="middle">
          <Col flex="auto">
            <Input
              placeholder="Tìm theo tên hoặc mã đại lý..."
              prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
              value={searchText}
              onChange={(e) => handleSearch(e.target.value)}
              allowClear
              style={{ maxWidth: 350 }}
            />
          </Col>
          <Col>
            <Space>
              <FilterOutlined style={{ color: '#bfbfbf' }} />
              <Segmented
                options={TIER_OPTIONS}
                value={tierFilter}
                onChange={(val) => handleTierChange(val as string)}
              />
            </Space>
          </Col>
        </Row>
      </Card>

      {/* Partner Cards Grid */}
      <Spin spinning={loading}>
        {partners.length > 0 ? (
          <>
            <Row gutter={[16, 16]}>
              {partners.map((partner) => (
                <Col xs={24} sm={12} md={8} lg={6} key={partner.id}>
                  <PartnerCard
                    partner={partner}
                    onView={() => handleViewPartner(partner)}
                    onChat={() => handleOpenChat(partner)}
                    onDeals={() => handleViewDeals(partner)}
                  />
                </Col>
              ))}
            </Row>

            {/* Pagination */}
            <div style={{ marginTop: 24, textAlign: 'center' }}>
              <Pagination
                current={pagination.current}
                pageSize={pagination.pageSize}
                total={total}
                onChange={handlePageChange}
                showSizeChanger
                showQuickJumper
                showTotal={(total) => `Tổng ${total} đại lý`}
              />
            </div>
          </>
        ) : (
          <Card style={{ borderRadius: 12 }}>
            <Empty
              description={
                searchText || tierFilter !== 'all'
                  ? 'Không tìm thấy đại lý phù hợp'
                  : 'Chưa có đại lý nào'
              }
            />
          </Card>
        )}
      </Spin>
    </div>
  )
}

export default PartnerListPage