// ============================================================================
// B2B DASHBOARD PAGE — Dashboard chính cho B2B Module
// File: src/pages/b2b/B2BDashboardPage.tsx
// Phase: E3.1.1, E3.2, E3.3
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Card,
  Row,
  Col,
  Statistic,
  Space,
  Typography,
  Tag,
  List,
  Avatar,
  Button,
  Timeline,
  Table,
  Segmented,
  Spin,
  Empty,
  Tooltip,
  Badge,
  message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  TeamOutlined,
  ShoppingOutlined,
  FileTextOutlined,
  MessageOutlined,
  RiseOutlined,
  FallOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  EyeOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons'
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
  Area,
  AreaChart,
} from 'recharts'
import {
  b2bDashboardService,
  DashboardKPIs,
  MonthlyData,
  ProductMixData,
  TopDealer,
  PendingBooking,
  RecentMessage,
  ActivityItem,
} from '../../services/b2b/b2bDashboardService'
import { chatMessageService } from '../../services/b2b/chatMessageService'
import { formatDistanceToNow } from 'date-fns'
import { vi } from 'date-fns/locale'

const { Title, Text } = Typography

// ============================================
// CONSTANTS
// ============================================

const TIER_COLORS: Record<string, string> = {
  diamond: '#9333EA',
  gold: '#F59E0B',
  silver: '#6B7280',
  bronze: '#EA580C',
  new: '#06B6D4',
}

const CHART_COLORS = ['#1B4D3E', '#2D8B6E', '#E8A838', '#D4763D', '#8B5CF6', '#94A3B8']

// ============================================
// KPI CARD COMPONENT (E3.1.2)
// ============================================

interface KPICardProps {
  title: string
  value: number
  suffix?: string
  prefix?: React.ReactNode
  trend?: number
  trendLabel?: string
  loading?: boolean
  onClick?: () => void
  color?: string
}

const KPICard = ({
  title,
  value,
  suffix,
  prefix,
  trend,
  trendLabel,
  loading,
  onClick,
  color = '#1B4D3E',
}: KPICardProps) => {
  const isPositive = trend && trend > 0
  const isNegative = trend && trend < 0

  return (
    <Card
      hoverable={!!onClick}
      onClick={onClick}
      style={{
        borderRadius: 12,
        borderTop: `3px solid ${color}`,
        cursor: onClick ? 'pointer' : 'default',
      }}
      bodyStyle={{ padding: '20px 24px' }}
    >
      <Spin spinning={loading}>
        <Statistic
          title={
            <Text type="secondary" style={{ fontSize: 13 }}>
              {title}
            </Text>
          }
          value={value}
          suffix={suffix}
          prefix={prefix}
          valueStyle={{
            color,
            fontSize: 28,
            fontWeight: 600,
          }}
        />
        {trend !== undefined && (
          <div style={{ marginTop: 8 }}>
            <Space size={4}>
              {isPositive && <ArrowUpOutlined style={{ color: '#52c41a', fontSize: 12 }} />}
              {isNegative && <ArrowDownOutlined style={{ color: '#ff4d4f', fontSize: 12 }} />}
              <Text
                style={{
                  fontSize: 12,
                  color: isPositive ? '#52c41a' : isNegative ? '#ff4d4f' : '#666',
                }}
              >
                {isPositive && '+'}
                {trend}% {trendLabel || 'so với tháng trước'}
              </Text>
            </Space>
          </div>
        )}
      </Spin>
    </Card>
  )
}

// ============================================
// MAIN COMPONENT
// ============================================

const B2BDashboardPage = () => {
  const navigate = useNavigate()

  // State
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [kpis, setKpis] = useState<DashboardKPIs | null>(null)
  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([])
  const [productMix, setProductMix] = useState<ProductMixData[]>([])
  const [topDealers, setTopDealers] = useState<TopDealer[]>([])
  const [pendingBookings, setPendingBookings] = useState<PendingBooking[]>([])
  const [recentMessages, setRecentMessages] = useState<RecentMessage[]>([])
  const [activities, setActivities] = useState<ActivityItem[]>([])
  const [chartType, setChartType] = useState<'production' | 'revenue'>('production')

  // ============================================
  // DATA FETCHING
  // ============================================

  const fetchData = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true)
      else setRefreshing(true)

      const [
        kpisData,
        monthlyDataRes,
        productMixRes,
        topDealersRes,
        pendingBookingsRes,
        recentMessagesRes,
        activitiesRes,
      ] = await Promise.all([
        b2bDashboardService.getKPIs(),
        b2bDashboardService.getMonthlyProduction(6),
        b2bDashboardService.getProductMix(),
        b2bDashboardService.getTopDealers(5),
        b2bDashboardService.getPendingBookings(5),
        b2bDashboardService.getRecentUnreadMessages(5),
        b2bDashboardService.getRecentActivity(8),
      ])

      setKpis(kpisData)
      setMonthlyData(monthlyDataRes)
      setProductMix(productMixRes)
      setTopDealers(topDealersRes)
      setPendingBookings(pendingBookingsRes)
      setRecentMessages(recentMessagesRes)
      setActivities(activitiesRes)
    } catch (error) {
      console.error('Error fetching dashboard data:', error)
      message.error('Không thể tải dữ liệu dashboard')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  // Initial load
  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Auto refresh every 30s (E3.3.6)
  useEffect(() => {
    const interval = setInterval(() => {
      fetchData(false)
    }, 30000)

    return () => clearInterval(interval)
  }, [fetchData])

  // ============================================
  // HANDLERS
  // ============================================

  const handleConfirmBooking = async (booking: PendingBooking) => {
    try {
      const { deal } = await chatMessageService.confirmBooking(booking.messageId, booking.partnerId)
      message.success(`Đã xác nhận phiếu chốt mủ & tạo Deal ${deal.deal_number}`)
      fetchData(false)
    } catch (error) {
      message.error('Không thể xác nhận')
    }
  }

  const handleRefresh = () => {
    fetchData(false)
  }

  // ============================================
  // TABLE COLUMNS
  // ============================================

  const topDealersColumns: ColumnsType<TopDealer> = [
    {
      title: '#',
      key: 'rank',
      width: 40,
      render: (_, __, index) => (
        <Avatar
          size="small"
          style={{
            backgroundColor: index === 0 ? '#F59E0B' : index === 1 ? '#6B7280' : index === 2 ? '#EA580C' : '#E5E7EB',
            color: index < 3 ? '#fff' : '#666',
          }}
        >
          {index + 1}
        </Avatar>
      ),
    },
    {
      title: 'Đại lý',
      key: 'dealer',
      render: (_, record) => (
        <Space>
          <Text strong>{record.name}</Text>
          <Tag color={TIER_COLORS[record.tier]} style={{ fontSize: 10 }}>
            {record.tier.toUpperCase()}
          </Tag>
        </Space>
      ),
    },
    {
      title: 'Sản lượng',
      dataIndex: 'totalQuantity',
      key: 'totalQuantity',
      align: 'right',
      render: (val) => <Text strong>{val} tấn</Text>,
    },
    {
      title: 'Deals',
      dataIndex: 'dealCount',
      key: 'dealCount',
      align: 'center',
      render: (val) => <Badge count={val} showZero color="#1B4D3E" />,
    },
  ]

  // ============================================
  // RENDER
  // ============================================

  const formatTime = (dateStr: string) => {
    try {
      return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale: vi })
    } catch {
      return ''
    }
  }

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>B2B Dashboard</Title>
          <Text type="secondary">Tổng quan hoạt động B2B</Text>
        </div>
        <Button
          icon={<ReloadOutlined spin={refreshing} />}
          onClick={handleRefresh}
          loading={refreshing}
        >
          Làm mới
        </Button>
      </div>

      {/* KPI Cards (E3.1) */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={4}>
          <KPICard
            title="Đại lý Active"
            value={kpis?.totalActivePartners || 0}
            prefix={<TeamOutlined />}
            loading={loading}
            onClick={() => navigate('/b2b/partners')}
            color="#1B4D3E"
          />
        </Col>
        <Col xs={24} sm={12} lg={4}>
          <KPICard
            title="Deals đang xử lý"
            value={kpis?.dealsProcessing || 0}
            prefix={<ShoppingOutlined />}
            loading={loading}
            onClick={() => navigate('/b2b/deals')}
            color="#2D8B6E"
          />
        </Col>
        <Col xs={24} sm={12} lg={4}>
          <KPICard
            title="Phiếu chờ xác nhận"
            value={kpis?.pendingBookings || 0}
            prefix={<FileTextOutlined />}
            loading={loading}
            color="#E8A838"
          />
        </Col>
        <Col xs={24} sm={12} lg={4}>
          <KPICard
            title="Tin chưa đọc"
            value={kpis?.unreadMessages || 0}
            prefix={<MessageOutlined />}
            loading={loading}
            onClick={() => navigate('/b2b/chat')}
            color="#EF4444"
          />
        </Col>
        <Col xs={24} sm={12} lg={4}>
          <KPICard
            title="Sản lượng tháng"
            value={kpis?.monthlyProduction || 0}
            suffix="tấn"
            trend={kpis?.productionTrend}
            loading={loading}
            color="#8B5CF6"
          />
        </Col>
        <Col xs={24} sm={12} lg={4}>
          <KPICard
            title="Doanh thu tháng"
            value={Math.round((kpis?.monthlyRevenue || 0) / 1000000)}
            suffix="tr"
            trend={kpis?.revenueTrend}
            loading={loading}
            color="#06B6D4"
          />
        </Col>
      </Row>

      {/* Charts Row */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {/* Production/Revenue Chart (E3.2.1, E3.2.3) */}
        <Col xs={24} lg={16}>
          <Card
            title={
              <Space>
                <span>Biểu đồ 6 tháng</span>
                <Segmented
                  size="small"
                  options={[
                    { label: 'Sản lượng', value: 'production' },
                    { label: 'Doanh thu', value: 'revenue' },
                  ]}
                  value={chartType}
                  onChange={(val) => setChartType(val as 'production' | 'revenue')}
                />
              </Space>
            }
            style={{ borderRadius: 12 }}
            bodyStyle={{ padding: '16px 24px' }}
          >
            <Spin spinning={loading}>
              <ResponsiveContainer width="100%" height={280}>
                {chartType === 'production' ? (
                  <BarChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <RechartsTooltip
                      formatter={(value) => [`${value} tấn`, 'Sản lượng']}
                      contentStyle={{ borderRadius: 8 }}
                    />
                    <Bar dataKey="production" fill="#1B4D3E" radius={[4, 4, 0, 0]} />
                  </BarChart>
                ) : (
                  <AreaChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <RechartsTooltip
                      formatter={(value) => [`${value} triệu`, 'Doanh thu']}
                      contentStyle={{ borderRadius: 8 }}
                    />
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      stroke="#06B6D4"
                      fill="#06B6D4"
                      fillOpacity={0.3}
                    />
                  </AreaChart>
                )}
              </ResponsiveContainer>
            </Spin>
          </Card>
        </Col>

        {/* Product Mix PieChart (E3.2.4) */}
        <Col xs={24} lg={8}>
          <Card
            title="Cơ cấu sản phẩm"
            style={{ borderRadius: 12 }}
            bodyStyle={{ padding: '16px 24px' }}
          >
            <Spin spinning={loading}>
              {productMix.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={productMix}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      dataKey="value"
                      label={({ name, percent }) => `${name}: ${percent}%`}
                      labelLine={false}
                    >
                      {productMix.map((entry, index) => (
                        <Cell key={entry.name} fill={entry.color || CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <RechartsTooltip
                      formatter={(value, name) => [`${value} tấn`, name]}
                      contentStyle={{ borderRadius: 8 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <Empty description="Chưa có dữ liệu" style={{ padding: '60px 0' }} />
              )}
            </Spin>
          </Card>
        </Col>
      </Row>

      {/* Lists Row */}
      <Row gutter={[16, 16]}>
        {/* Pending Bookings (E3.3.1) */}
        <Col xs={24} lg={8}>
          <Card
            title={
              <Space>
                <FileTextOutlined />
                <span>Phiếu chốt chờ xác nhận</span>
                {pendingBookings.length > 0 && (
                  <Badge count={pendingBookings.length} style={{ backgroundColor: '#E8A838' }} />
                )}
              </Space>
            }
            style={{ borderRadius: 12 }}
            bodyStyle={{ padding: 0 }}
          >
            <Spin spinning={loading}>
              {pendingBookings.length > 0 ? (
                <List
                  dataSource={pendingBookings}
                  renderItem={(item) => (
                    <List.Item
                      style={{ padding: '12px 16px' }}
                      actions={[
                        <Tooltip title="Xác nhận nhanh" key="confirm">
                          <Button
                            type="primary"
                            size="small"
                            icon={<CheckCircleOutlined />}
                            onClick={() => handleConfirmBooking(item)}
                            style={{ backgroundColor: '#52c41a', borderColor: '#52c41a' }}
                          />
                        </Tooltip>,
                        <Tooltip title="Xem chi tiết" key="view">
                          <Button
                            size="small"
                            icon={<EyeOutlined />}
                            onClick={() => navigate(`/b2b/chat/${item.roomId}`)}
                          />
                        </Tooltip>,
                      ]}
                    >
                      <List.Item.Meta
                        avatar={<Avatar style={{ backgroundColor: '#E8A838' }}>📋</Avatar>}
                        title={
                          <Space>
                            <Text strong>{item.partnerName}</Text>
                            <Tag>{item.booking.quantity_tons} tấn</Tag>
                          </Space>
                        }
                        description={
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {item.booking.price_per_kg.toLocaleString()} đ/kg • {formatTime(item.sentAt)}
                          </Text>
                        }
                      />
                    </List.Item>
                  )}
                />
              ) : (
                <Empty description="Không có phiếu chờ" style={{ padding: '40px 0' }} />
              )}
            </Spin>
          </Card>
        </Col>

        {/* Recent Messages (E3.3.3) */}
        <Col xs={24} lg={8}>
          <Card
            title={
              <Space>
                <MessageOutlined />
                <span>Tin nhắn chưa đọc</span>
                {recentMessages.length > 0 && (
                  <Badge count={recentMessages.length} style={{ backgroundColor: '#EF4444' }} />
                )}
              </Space>
            }
            style={{ borderRadius: 12 }}
            bodyStyle={{ padding: 0 }}
            extra={
              <Button type="link" size="small" onClick={() => navigate('/b2b/chat')}>
                Xem tất cả
              </Button>
            }
          >
            <Spin spinning={loading}>
              {recentMessages.length > 0 ? (
                <List
                  dataSource={recentMessages}
                  renderItem={(item) => (
                    <List.Item
                      style={{ padding: '12px 16px', cursor: 'pointer' }}
                      onClick={() => navigate(`/b2b/chat/${item.roomId}`)}
                    >
                      <List.Item.Meta
                        avatar={
                          <Badge dot>
                            <Avatar style={{ backgroundColor: '#2D8B6E' }}>
                              {item.partnerName.charAt(0)}
                            </Avatar>
                          </Badge>
                        }
                        title={<Text strong>{item.partnerName}</Text>}
                        description={
                          <div>
                            <Text
                              type="secondary"
                              ellipsis
                              style={{ fontSize: 12, display: 'block', maxWidth: 180 }}
                            >
                              {item.messageType === 'booking'
                                ? '📋 Phiếu chốt mủ'
                                : item.messageType === 'image'
                                ? '📷 Hình ảnh'
                                : item.content}
                            </Text>
                            <Text type="secondary" style={{ fontSize: 11 }}>
                              {formatTime(item.sentAt)}
                            </Text>
                          </div>
                        }
                      />
                    </List.Item>
                  )}
                />
              ) : (
                <Empty description="Không có tin nhắn mới" style={{ padding: '40px 0' }} />
              )}
            </Spin>
          </Card>
        </Col>

        {/* Top Dealers (E3.3.4) */}
        <Col xs={24} lg={8}>
          <Card
            title={
              <Space>
                <TeamOutlined />
                <span>Top đại lý tháng này</span>
              </Space>
            }
            style={{ borderRadius: 12 }}
            bodyStyle={{ padding: '0 0 8px 0' }}
          >
            <Spin spinning={loading}>
              {topDealers.length > 0 ? (
                <Table
                  dataSource={topDealers}
                  columns={topDealersColumns}
                  rowKey="id"
                  pagination={false}
                  size="small"
                  showHeader={false}
                />
              ) : (
                <Empty description="Chưa có dữ liệu" style={{ padding: '40px 0' }} />
              )}
            </Spin>
          </Card>
        </Col>
      </Row>

      {/* Activity Timeline (E3.3.5) */}
      <Row style={{ marginTop: 16 }}>
        <Col xs={24}>
          <Card
            title={
              <Space>
                <ClockCircleOutlined />
                <span>Hoạt động gần đây</span>
              </Space>
            }
            style={{ borderRadius: 12 }}
          >
            <Spin spinning={loading}>
              {activities.length > 0 ? (
                <Timeline
                  items={activities.map((item) => ({
                    color: item.type === 'deal' ? 'green' : item.type === 'booking' ? 'orange' : 'blue',
                    children: (
                      <div>
                        <Space>
                          <Text strong>
                            {item.icon} {item.title}
                          </Text>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {formatTime(item.time)}
                          </Text>
                        </Space>
                        <div>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {item.description}
                          </Text>
                        </div>
                      </div>
                    ),
                  }))}
                />
              ) : (
                <Empty description="Chưa có hoạt động" />
              )}
            </Spin>
          </Card>
        </Col>
      </Row>
    </div>
  )
}

export default B2BDashboardPage