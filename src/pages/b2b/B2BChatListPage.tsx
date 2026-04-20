// ============================================================================
// B2B CHAT LIST PAGE — Danh sách phòng chat phía ERP (Factory side)
// File: src/pages/b2b/chat/B2BChatListPage.tsx
// Phase: E1.1.1
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useOpenTab } from '../../hooks/useOpenTab'
import {
  Card,
  Input,
  Segmented,
  List,
  Avatar,
  Badge,
  Tag,
  Typography,
  Space,
  Skeleton,
  Empty,
  Button,
  Tooltip,
  message,
} from 'antd'
import {
  SearchOutlined,
  MessageOutlined,
  UserOutlined,
  ReloadOutlined,
  PlusOutlined,
} from '@ant-design/icons'
import { 
  chatRoomService, 
  ChatRoom, 
  PartnerTier,
  TIER_LABELS,
  TIER_COLORS,
} from '../../services/b2b/chatRoomService'
import { formatDistanceToNow } from 'date-fns'
import { vi } from 'date-fns/locale'

const { Text, Title } = Typography

// ============================================
// TYPES
// ============================================

type FilterType = 'all' | 'unread' | PartnerTier

// ============================================
// CONSTANTS
// ============================================

const FILTER_OPTIONS = [
  { label: 'Tất cả', value: 'all' },
  { label: 'Chưa đọc', value: 'unread' },
  { label: '💎 Kim cương', value: 'diamond' },
  { label: '🥇 Vàng', value: 'gold' },
  { label: '🥈 Bạc', value: 'silver' },
]

// ============================================
// HELPER COMPONENTS
// ============================================

/** Tier Badge Component */
const TierBadge = ({ tier }: { tier: PartnerTier }) => {
  const tierConfig: Record<PartnerTier, { color: string; icon: string }> = {
    diamond: { color: 'purple', icon: '💎' },
    gold: { color: 'gold', icon: '🥇' },
    silver: { color: 'default', icon: '🥈' },
    bronze: { color: 'orange', icon: '🥉' },
    new: { color: 'cyan', icon: '🆕' },
  }

  const config = tierConfig[tier] || tierConfig.new

  return (
    <Tag color={config.color} style={{ marginRight: 0 }}>
      {config.icon} {TIER_LABELS[tier]}
    </Tag>
  )
}

/** Format thời gian tin nhắn cuối */
const formatLastMessageTime = (dateStr: string | null): string => {
  if (!dateStr) return ''
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale: vi })
  } catch {
    return ''
  }
}

/** Truncate nội dung tin nhắn */
const truncateMessage = (content: string, maxLength = 50): string => {
  if (!content) return ''
  if (content.length <= maxLength) return content
  return content.substring(0, maxLength) + '...'
}

/** Get message preview text */
const getMessagePreview = (room: ChatRoom): string => {
  if (!room.last_message) return 'Chưa có tin nhắn'
  
  const { message_type, content, sender_type } = room.last_message
  const prefix = sender_type === 'factory' ? 'Bạn: ' : ''
  
  switch (message_type) {
    case 'image':
      return `${prefix}📷 Hình ảnh`
    case 'file':
      return `${prefix}📎 Tệp đính kèm`
    case 'audio':
      return `${prefix}🎤 Tin nhắn thoại`
    case 'booking':
      return `${prefix}📋 Phiếu chốt mủ`
    case 'quotation':
      return `${prefix}💰 Báo giá`
    case 'system':
      return `⚙️ ${content}`
    default:
      return `${prefix}${truncateMessage(content)}`
  }
}

// ============================================
// CHAT ROOM ITEM COMPONENT (E1.1.3)
// ============================================

interface ChatRoomItemProps {
  room: ChatRoom
  onClick: (room: ChatRoom) => void
}

const ChatRoomItem = ({ room, onClick }: ChatRoomItemProps) => {
  const partnerName = room.partner?.name || room.room_name || 'Không xác định'
  const partnerCode = room.partner?.code || ''
  const tier = room.partner?.tier || 'new'
  const unreadCount = room.unread_count || 0
  const hasUnread = unreadCount > 0

  return (
    <List.Item
      onClick={() => onClick(room)}
      style={{ 
        cursor: 'pointer',
        padding: '12px 16px',
        backgroundColor: hasUnread ? 'rgba(22, 119, 255, 0.04)' : 'transparent',
        borderLeft: hasUnread ? '3px solid #1677ff' : '3px solid transparent',
        transition: 'all 0.2s ease',
      }}
      className="chat-room-item"
    >
      <List.Item.Meta
        avatar={
          <Badge count={unreadCount} size="small" offset={[-5, 5]}>
            <Avatar 
              size={48} 
              style={{ 
                backgroundColor: hasUnread ? '#1677ff' : '#87d068',
                fontSize: '18px',
              }}
            >
              {partnerName.charAt(0).toUpperCase()}
            </Avatar>
          </Badge>
        }
        title={
          <Space size={8} style={{ width: '100%', justifyContent: 'space-between' }}>
            <Space size={4}>
              <Text strong style={{ fontSize: '15px' }}>
                {partnerName}
              </Text>
              {partnerCode && (
                <Text type="secondary" style={{ fontSize: '12px' }}>
                  ({partnerCode})
                </Text>
              )}
            </Space>
            <TierBadge tier={tier} />
          </Space>
        }
        description={
          <Space direction="vertical" size={2} style={{ width: '100%' }}>
            <Text 
              type={hasUnread ? undefined : 'secondary'} 
              style={{ 
                fontSize: '13px',
                fontWeight: hasUnread ? 500 : 400,
              }}
              ellipsis
            >
              {getMessagePreview(room)}
            </Text>
            <Text type="secondary" style={{ fontSize: '12px' }}>
              {formatLastMessageTime(room.last_message?.sent_at || room.last_message_at)}
            </Text>
          </Space>
        }
      />
    </List.Item>
  )
}

// ============================================
// SKELETON LOADING (E1.1.7)
// ============================================

const ChatRoomSkeleton = () => (
  <List
    dataSource={[1, 2, 3, 4, 5]}
    renderItem={() => (
      <List.Item style={{ padding: '12px 16px' }}>
        <Skeleton 
          avatar={{ size: 48 }} 
          title={{ width: '60%' }} 
          paragraph={{ rows: 1, width: '80%' }} 
          active 
        />
      </List.Item>
    )}
  />
)

// ============================================
// MAIN COMPONENT
// ============================================

const B2BChatListPage = () => {
  const openTab = useOpenTab()
  
  // State
  const [rooms, setRooms] = useState<ChatRoom[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [filter, setFilter] = useState<FilterType>('all')
  const [totalUnread, setTotalUnread] = useState(0)

  // ============================================
  // DATA FETCHING
  // ============================================

  const fetchRooms = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true)
      
      const response = await chatRoomService.getRooms({
        search: searchText || undefined,
        filter: filter,
        pageSize: 50, // Lấy nhiều rooms
      })
      
      setRooms(response.data)
    } catch (error) {
      console.error('Error fetching rooms:', error)
      message.error('Không thể tải danh sách chat')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [searchText, filter])

  const fetchTotalUnread = useCallback(async () => {
    try {
      const count = await chatRoomService.getTotalUnreadCount()
      setTotalUnread(count)
    } catch (error) {
      console.error('Error fetching unread count:', error)
    }
  }, [])

  // ============================================
  // EFFECTS
  // ============================================

  // Initial load
  useEffect(() => {
    fetchRooms()
    fetchTotalUnread()
  }, [fetchRooms, fetchTotalUnread])

  // Realtime subscription (E1.1.6)
  useEffect(() => {
    // Subscribe to new messages
    const messagesChannel = chatRoomService.subscribeToMessages((payload) => {
      console.log('New message received:', payload)
      // Refresh rooms list khi có tin mới
      fetchRooms(false)
      fetchTotalUnread()
    })

    // Subscribe to room updates
    const roomsChannel = chatRoomService.subscribeToRooms((payload) => {
      console.log('Room updated:', payload)
      fetchRooms(false)
    })

    // Cleanup
    return () => {
      messagesChannel.unsubscribe()
      roomsChannel.unsubscribe()
    }
  }, [fetchRooms, fetchTotalUnread])

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchRooms()
    }, 300)

    return () => clearTimeout(timer)
  }, [searchText, filter, fetchRooms])

  // ============================================
  // HANDLERS
  // ============================================

  const handleRoomClick = (room: ChatRoom) => {
    const title = room.partner?.name
      ? `Chat: ${room.partner.name}`
      : room.room_name || 'Chat'
    openTab({
      key: `b2b-chat-${room.id}`,
      title,
      componentId: 'b2b-chat-room',
      props: { roomIdProp: room.id },
      path: `/b2b/chat/${room.id}`,
    })
  }

  const handleRefresh = () => {
    setRefreshing(true)
    fetchRooms()
    fetchTotalUnread()
  }

  const handleCreateRoom = () => {
    // TODO: Mở modal chọn partner để tạo room mới
    message.info('Tính năng đang phát triển')
  }

  // ============================================
  // RENDER
  // ============================================

  return (
    <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Space>
            <Title level={4} style={{ margin: 0 }}>
              <MessageOutlined style={{ marginRight: 8 }} />
              Chat với Đại lý
            </Title>
            {totalUnread > 0 && (
              <Badge 
                count={totalUnread} 
                style={{ backgroundColor: '#ff4d4f' }}
                overflowCount={99}
              />
            )}
          </Space>
          <Space>
            <Tooltip title="Làm mới">
              <Button 
                icon={<ReloadOutlined spin={refreshing} />} 
                onClick={handleRefresh}
              />
            </Tooltip>
            <Button 
              type="primary" 
              icon={<PlusOutlined />}
              onClick={handleCreateRoom}
            >
              Tạo cuộc trò chuyện
            </Button>
          </Space>
        </Space>
      </div>

      {/* Main Card */}
      <Card 
        bordered={false}
        style={{ 
          borderRadius: '12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        }}
        bodyStyle={{ padding: 0 }}
      >
        {/* Search & Filter */}
        <div style={{ padding: '16px', borderBottom: '1px solid #f0f0f0' }}>
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            {/* Search Input */}
            <Input
              placeholder="Tìm kiếm đại lý..."
              prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              allowClear
              size="large"
              style={{ borderRadius: '8px' }}
            />
            
            {/* Filter Segmented (E1.1.5) */}
            <Segmented
              options={FILTER_OPTIONS}
              value={filter}
              onChange={(value) => setFilter(value as FilterType)}
              block
              style={{ width: '100%' }}
            />
          </Space>
        </div>

        {/* Room List */}
        <div style={{ maxHeight: 'calc(100vh - 350px)', overflowY: 'auto' }}>
          {loading ? (
            <ChatRoomSkeleton />
          ) : rooms.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                searchText || filter !== 'all' 
                  ? 'Không tìm thấy cuộc trò chuyện nào' 
                  : 'Chưa có cuộc trò chuyện nào'
              }
              style={{ padding: '48px 0' }}
            >
              {!searchText && filter === 'all' && (
                <Button type="primary" onClick={handleCreateRoom}>
                  Bắt đầu trò chuyện
                </Button>
              )}
            </Empty>
          ) : (
            <List
              dataSource={rooms}
              renderItem={(room) => (
                <ChatRoomItem 
                  key={room.id} 
                  room={room} 
                  onClick={handleRoomClick} 
                />
              )}
              style={{ 
                // Hover effect
              }}
            />
          )}
        </div>

        {/* Footer Stats */}
        {!loading && rooms.length > 0 && (
          <div 
            style={{ 
              padding: '12px 16px', 
              borderTop: '1px solid #f0f0f0',
              backgroundColor: '#fafafa',
              borderRadius: '0 0 12px 12px',
            }}
          >
            <Space split={<span style={{ color: '#d9d9d9' }}>•</span>}>
              <Text type="secondary">
                {rooms.length} cuộc trò chuyện
              </Text>
              {totalUnread > 0 && (
                <Text type="secondary">
                  <Badge status="processing" /> {totalUnread} tin chưa đọc
                </Text>
              )}
            </Space>
          </div>
        )}
      </Card>

      {/* Custom Styles */}
      <style>{`
        .chat-room-item:hover {
          background-color: rgba(0, 0, 0, 0.02) !important;
        }
        .chat-room-item:active {
          background-color: rgba(0, 0, 0, 0.04) !important;
        }
      `}</style>
    </div>
  )
}

export default B2BChatListPage