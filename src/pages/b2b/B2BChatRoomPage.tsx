// ============================================================================
// B2B CHAT ROOM PAGE V2 — Tích hợp Upload và Voice Recorder
// File: src/pages/b2b/chat/B2BChatRoomPage.tsx
// Phase: E1.2 Complete
// ============================================================================

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Card,
  Input,
  Button,
  Avatar,
  Space,
  Typography,
  Tag,
  Dropdown,
  Modal,
  Form,
  InputNumber,
  Spin,
  Empty,
  message,
  Divider,
  Row,
  Col,
  Image,
} from 'antd'
import type { MenuProps } from 'antd'
import {
  ArrowLeftOutlined,
  SendOutlined,
  PaperClipOutlined,
  AudioOutlined,
  MoreOutlined,
  PushpinOutlined,
  EditOutlined,
  DeleteOutlined,
  RollbackOutlined,
  CopyOutlined,
  MessageOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  DollarOutlined,
  ExclamationCircleOutlined,
  LoadingOutlined,
  FileImageOutlined,
  FileOutlined,
  SoundOutlined,
  SearchOutlined,
  SmileOutlined,
  EnvironmentOutlined,
} from '@ant-design/icons'
import { 
  chatRoomService, 
  ChatRoom,
  TIER_LABELS,
} from '../../services/b2b/chatRoomService'
import {
  chatMessageService,
  ChatMessage,
  ChatAttachment,
  BookingMetadata,
  PRODUCT_TYPE_LABELS,
  BOOKING_STATUS_LABELS,
  BOOKING_STATUS_COLORS,
} from '../../services/b2b/chatMessageService'
import { dealService } from '../../services/b2b/dealService'
import { dealConfirmService } from '../../services/b2b/dealConfirmService'
import { useAuthStore } from '../../stores/authStore'
import { format, isToday, isYesterday, isSameDay } from 'date-fns'
import { vi } from 'date-fns/locale'

// Import new components
import ChatAttachmentUpload from '../../components/b2b/ChatAttachmentUpload'
import VoiceRecorder from '../../components/b2b/VoiceRecorder'
import ChatAttachmentMenu from '../../components/b2b/ChatAttachmentMenu'
import BookingFormModal from '../../components/b2b/BookingFormModal'
import ConfirmDealModal from '../../components/b2b/ConfirmDealModal'
import AddAdvanceModal from '../../components/b2b/AddAdvanceModal'
import RecordDeliveryModal from '../../components/b2b/RecordDeliveryModal'
import DealCard from '../../components/b2b/DealCard'
import EmojiPickerPopover from '../../components/b2b/EmojiPickerPopover'
import { chatAttachmentService } from '../../services/b2b/chatAttachmentService'
import { dealChatActionsService } from '../../services/b2b/dealChatActionsService'
import type { AddAdvanceFormData } from '../../components/b2b/AddAdvanceModal'
import type { RecordDeliveryFormData } from '../../components/b2b/RecordDeliveryModal'
import type { ConfirmDealFormData, DealCardMetadata } from '../../types/b2b.types'

const { Text, Title } = Typography
const { TextArea } = Input

// ============================================
// HELPER FUNCTIONS
// ============================================

const formatMessageTime = (dateStr: string): string => {
  const date = new Date(dateStr)
  return format(date, 'HH:mm', { locale: vi })
}

const formatDateDivider = (dateStr: string): string => {
  const date = new Date(dateStr)
  if (isToday(date)) return 'Hôm nay'
  if (isYesterday(date)) return 'Hôm qua'
  return format(date, 'EEEE, dd/MM/yyyy', { locale: vi })
}

const formatCurrency = (amount: number): string => {
  return amount.toLocaleString('vi-VN') + ' VNĐ'
}

const formatDuration = (seconds: number): string => {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

// ============================================
// BOOKING CARD COMPONENT (E1.3)
// ============================================

interface BookingCardProps {
  booking: BookingMetadata
  messageId: string
  isFromPartner: boolean
  onConfirm: () => void
  onReject: () => void
  onNegotiate: () => void
}

const BookingCard = ({
  booking,
  messageId,
  isFromPartner,
  onConfirm,
  onReject,
  onNegotiate
}: BookingCardProps) => {
  if (!booking) {
    return (
      <Card size="small" style={{ width: 320, borderRadius: 12 }}>
        <Text type="secondary">Không có dữ liệu phiếu chốt</Text>
      </Card>
    )
  }

  const isPending = booking.status === 'pending'
  const isNegotiating = booking.status === 'negotiating'

  return (
    <Card
      size="small"
      style={{
        width: 320,
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        borderRadius: 12,
        border: 'none',
      }}
      styles={{ body: { padding: 16 } }}
    >
      {/* Header */}
      <div style={{ marginBottom: 12 }}>
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Text strong style={{ color: '#fff', fontSize: 14 }}>
            📋 Phiếu chốt mủ
          </Text>
          <Tag color={BOOKING_STATUS_COLORS[booking.status]}>
            {BOOKING_STATUS_LABELS[booking.status]}
          </Tag>
        </Space>
        <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>
          {booking.code}
        </Text>
      </div>

      {/* Content */}
      <div 
        style={{ 
          background: 'rgba(255,255,255,0.15)', 
          borderRadius: 8, 
          padding: 12,
          marginBottom: 12,
        }}
      >
        <Row gutter={[8, 8]}>
          <Col span={12}>
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>Loại mủ</Text>
            <br />
            <Text strong style={{ color: '#fff', fontSize: 13 }}>
              {PRODUCT_TYPE_LABELS[booking.product_type] || booking.product_type}
            </Text>
          </Col>
          <Col span={12}>
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>Số lượng</Text>
            <br />
            <Text strong style={{ color: '#fff', fontSize: 13 }}>{booking.quantity_tons} tấn</Text>
          </Col>
          <Col span={12}>
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>DRC</Text>
            <br />
            <Text strong style={{ color: '#fff', fontSize: 13 }}>{booking.drc_percent}%</Text>
          </Col>
          <Col span={12}>
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>
              Đơn giá ({booking.price_unit === 'dry' ? 'khô' : 'ướt'})
            </Text>
            <br />
            <Text strong style={{ color: '#fff', fontSize: 13 }}>
              {booking.price_per_kg?.toLocaleString() || '—'} đ/kg
            </Text>
          </Col>
        </Row>

        {/* Dia diem chot hang */}
        {booking.pickup_location && (
          <div style={{
            marginTop: 8,
            padding: '6px 10px',
            background: 'rgba(255,255,255,0.12)',
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}>
            <EnvironmentOutlined style={{ color: '#60a5fa', fontSize: 14 }} />
            <div>
              <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10 }}>
                Dia diem chot
              </span>
              <br />
              <span style={{ color: '#fff', fontWeight: 600, fontSize: 13 }}>
                {booking.pickup_location}
              </span>
            </div>
          </div>
        )}

        <Divider style={{ margin: '12px 0', borderColor: 'rgba(255,255,255,0.2)' }} />

        <div style={{ textAlign: 'right' }}>
          <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>Giá trị ước tính</Text>
          <br />
          <Text strong style={{ color: '#ffd700', fontSize: 16 }}>
            {formatCurrency(booking.estimated_value)}
          </Text>
        </div>

        {isNegotiating && booking.counter_price && (
          <div style={{ marginTop: 8, padding: 8, background: 'rgba(255,255,255,0.1)', borderRadius: 4 }}>
            <Text style={{ color: '#ffd700', fontSize: 12 }}>
              💰 Giá đề xuất: {booking.counter_price?.toLocaleString()} đ/kg
            </Text>
            {booking.negotiation_notes && (
              <div>
                <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>
                  {booking.negotiation_notes}
                </Text>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Notes */}
      {booking.notes && (
        <div style={{ marginBottom: 12 }}>
          <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>
            📝 {booking.notes}
          </Text>
        </div>
      )}

      {/* Action Buttons — 2 hàng để tránh tràn */}
      {isFromPartner && (isPending || isNegotiating) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Hàng 1: Xác nhận (nổi bật) */}
          <Button
            type="primary"
            block
            icon={<CheckCircleOutlined />}
            style={{
              background: '#52c41a',
              borderColor: '#52c41a',
              borderRadius: 10,
              height: 38,
              fontWeight: 600,
            }}
            onClick={onConfirm}
          >
            Xác nhận phiếu
          </Button>
          {/* Hàng 2: Thương lượng + Từ chối */}
          <div style={{ display: 'flex', gap: 8 }}>
            <Button
              block
              icon={<DollarOutlined />}
              style={{
                flex: 1,
                borderRadius: 10,
                height: 36,
                background: 'rgba(255,255,255,0.15)',
                borderColor: 'rgba(255,255,255,0.3)',
                color: '#fff',
              }}
              onClick={onNegotiate}
            >
              Thương lượng
            </Button>
            <Button
              block
              danger
              icon={<CloseCircleOutlined />}
              style={{
                flex: 1,
                borderRadius: 10,
                height: 36,
                background: 'rgba(239,68,68,0.15)',
                borderColor: 'rgba(239,68,68,0.4)',
                color: '#ff6b6b',
              }}
              onClick={onReject}
            >
              Từ chối
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}

// ============================================
// MESSAGE BUBBLE COMPONENT
// ============================================

interface MessageBubbleProps {
  message: ChatMessage
  isOwn: boolean
  showAvatar: boolean
  onContextMenu: (message: ChatMessage, action: string) => void
  onBookingAction: (messageId: string, action: 'confirm' | 'reject' | 'negotiate') => void
  onDealAction: (dealId: string, action: 'add_advance' | 'delivery' | 'view_details') => void
}

const MessageBubble = ({
  message,
  isOwn,
  showAvatar,
  onContextMenu,
  onBookingAction,
  onDealAction,
}: MessageBubbleProps) => {
  const isRecalled = message.metadata?.recalled
  const isEdited = message.metadata?.edited
  const isPinned = message.metadata?.pinned
  const [hovered, setHovered] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  const contextMenuItems: MenuProps['items'] = [
    { key: 'reply', icon: <MessageOutlined />, label: 'Trả lời', onClick: () => onContextMenu(message, 'reply') },
    { key: 'copy', icon: <CopyOutlined />, label: 'Sao chép', onClick: () => onContextMenu(message, 'copy') },
    ...(isOwn ? [
      { key: 'edit', icon: <EditOutlined />, label: 'Chỉnh sửa', onClick: () => onContextMenu(message, 'edit') },
      { key: 'recall', icon: <RollbackOutlined />, label: 'Thu hồi', onClick: () => onContextMenu(message, 'recall') },
    ] : []),
    { key: 'pin', icon: <PushpinOutlined />, label: isPinned ? 'Bỏ ghim' : 'Ghim tin nhắn', onClick: () => onContextMenu(message, 'pin') },
    { type: 'divider' as const },
    { key: 'delete', icon: <DeleteOutlined />, label: 'Xóa', danger: true, onClick: () => onContextMenu(message, 'delete') },
  ]

  const renderContent = () => {
    if (isRecalled) {
      return <Text italic style={{ color: '#999' }}>🔄 Tin nhắn đã được thu hồi</Text>
    }

    switch (message.message_type) {
      case 'booking':
        return (
          <BookingCard
            booking={message.metadata?.booking as BookingMetadata}
            messageId={message.id}
            isFromPartner={!isOwn}
            onConfirm={() => onBookingAction(message.id, 'confirm')}
            onReject={() => onBookingAction(message.id, 'reject')}
            onNegotiate={() => onBookingAction(message.id, 'negotiate')}
          />
        )

      case 'deal':
        const dealMeta = message.metadata?.deal as DealCardMetadata
        return (
          <DealCard
            metadata={dealMeta}
            viewerType="factory"
            onAddAdvance={() => onDealAction(dealMeta?.deal_id, 'add_advance')}
            onRecordDelivery={() => onDealAction(dealMeta?.deal_id, 'delivery')}
            onViewDetails={() => onDealAction(dealMeta?.deal_id, 'view_details')}
          />
        )

      case 'image':
        return (
          <div>
            <Image.PreviewGroup>
              <Space wrap size={4}>
                {message.attachments?.map((att, idx) => (
                  <Image
                    key={idx}
                    src={att.url}
                    alt={att.fileName}
                    width={att.width && att.width > 200 ? 200 : att.width}
                    style={{ maxWidth: 280, maxHeight: 300, borderRadius: 8, cursor: 'pointer' }}
                  />
                ))}
              </Space>
            </Image.PreviewGroup>
            {message.content && (
              <Text style={{ display: 'block', marginTop: 4 }}>{message.content}</Text>
            )}
          </div>
        )

      case 'file':
        return (
          <div>
            {message.attachments?.map((att, idx) => (
              <a 
                key={idx}
                href={att.url} 
                target="_blank" 
                rel="noopener noreferrer"
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: 8,
                  padding: '8px 12px',
                  background: isOwn ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.04)',
                  borderRadius: 8,
                  marginBottom: 4,
                }}
              >
                <FileOutlined style={{ fontSize: 24, color: isOwn ? '#fff' : '#1677ff' }} />
                <div>
                  <Text strong style={{ color: isOwn ? '#fff' : 'inherit', display: 'block' }}>
                    {att.fileName}
                  </Text>
                  <Text style={{ fontSize: 12, color: isOwn ? 'rgba(255,255,255,0.7)' : '#999' }}>
                    {formatFileSize(att.fileSize)}
                  </Text>
                </div>
              </a>
            ))}
          </div>
        )

      case 'audio':
        const audioAtt = message.attachments?.[0]
        return (
          <div 
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: 8,
              padding: '8px 12px',
              background: isOwn ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.04)',
              borderRadius: 20,
            }}
          >
            <SoundOutlined style={{ fontSize: 18, color: isOwn ? '#fff' : '#1677ff' }} />
            <audio controls style={{ height: 32, flex: 1 }}>
              <source src={audioAtt?.url} />
            </audio>
            {audioAtt?.duration && (
              <Text style={{ fontSize: 11, color: isOwn ? 'rgba(255,255,255,0.7)' : '#999' }}>
                {formatDuration(audioAtt.duration)}
              </Text>
            )}
          </div>
        )

      case 'system':
        return <Text type="secondary" italic style={{ fontSize: 12 }}>⚙️ {message.content}</Text>

      default:
        return <Text style={{ whiteSpace: 'pre-wrap' }}>{message.content}</Text>
    }
  }

  if (message.sender_type === 'system') {
    return (
      <div style={{ textAlign: 'center', margin: '8px 0' }}>
        {renderContent()}
      </div>
    )
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: isOwn ? 'row-reverse' : 'row',
        alignItems: 'flex-end',
        marginBottom: 8,
        gap: 8,
      }}
    >
      {showAvatar && !isOwn ? (
        <Avatar size={32} style={{ backgroundColor: '#87d068' }}>P</Avatar>
      ) : (
        <div style={{ width: 32 }} />
      )}

      <Dropdown menu={{ items: contextMenuItems }} trigger={['contextMenu']}>
        <div
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{
            maxWidth: '70%',
            padding: (message.message_type === 'booking' || message.message_type === 'deal') ? 0 : '8px 12px',
            borderRadius: 12,
            backgroundColor: (message.message_type === 'booking' || message.message_type === 'deal')
              ? 'transparent'
              : isOwn ? '#1677ff' : '#f0f0f0',
            color: isOwn && message.message_type !== 'booking' && message.message_type !== 'deal' ? '#fff' : 'inherit',
            position: 'relative',
          }}
        >
          {isPinned && (
            <PushpinOutlined
              style={{ position: 'absolute', top: -8, right: -8, color: '#faad14', fontSize: 14 }}
            />
          )}

          {/* Always-available action menu trigger (click) — needed for image/file/touch where contextMenu doesn't work */}
          <Dropdown
            menu={{ items: contextMenuItems }}
            trigger={['click']}
            open={menuOpen}
            onOpenChange={setMenuOpen}
            placement={isOwn ? 'bottomRight' : 'bottomLeft'}
          >
            <Button
              type="text"
              size="small"
              icon={<MoreOutlined style={{ fontSize: 14, color: '#fff' }} />}
              onClick={(e) => { e.stopPropagation(); setMenuOpen(true) }}
              style={{
                position: 'absolute',
                top: 4,
                [isOwn ? 'left' : 'right']: 4,
                width: 24,
                height: 24,
                minWidth: 24,
                borderRadius: '50%',
                background: 'rgba(0,0,0,0.45)',
                opacity: hovered || menuOpen ? 1 : 0,
                transition: 'opacity 0.15s',
                padding: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 2,
              }}
            />
          </Dropdown>

          {/* Quoted reply */}
          {message.reply_to && (
            <div style={{
              padding: '6px 10px',
              marginBottom: 6,
              borderLeft: `3px solid ${isOwn ? 'rgba(255,255,255,0.5)' : '#1B4D3E'}`,
              borderRadius: 4,
              background: isOwn ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.04)',
              fontSize: 12,
            }}>
              <div style={{ fontWeight: 600, fontSize: 11, color: isOwn ? 'rgba(255,255,255,0.8)' : '#1B4D3E', marginBottom: 2 }}>
                {message.reply_to.sender_type === 'partner' ? 'Đại lý' : 'Nhà máy'}
              </div>
              <div style={{
                color: isOwn ? 'rgba(255,255,255,0.7)' : '#666',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 250,
              }}>
                {message.reply_to.content || (message.reply_to.message_type === 'image' ? '📷 Ảnh' : '📎 File')}
              </div>
            </div>
          )}

          {renderContent()}

          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 4, marginTop: 4 }}>
            {isEdited && (
              <Text type="secondary" style={{ fontSize: 10, color: isOwn ? 'rgba(255,255,255,0.7)' : undefined }}>
                (đã sửa)
              </Text>
            )}
            <Text type="secondary" style={{ fontSize: 10, color: isOwn ? 'rgba(255,255,255,0.7)' : undefined }}>
              {formatMessageTime(message.sent_at)}
            </Text>
            {isOwn && (
              (message as any).read_at
                ? <span style={{ color: '#67e8f9', fontSize: 11, fontWeight: 700 }}>✓✓</span>
                : <CheckCircleOutlined style={{ fontSize: 10, color: isOwn ? 'rgba(255,255,255,0.5)' : '#d9d9d9' }} />
            )}
          </div>
        </div>
      </Dropdown>
    </div>
  )
}

// ============================================
// MAIN COMPONENT
// ============================================

const B2BChatRoomPage = ({ embedded, onBack, roomIdProp }: { embedded?: boolean; onBack?: () => void; roomIdProp?: string } = {}) => {
  const { roomId: paramRoomId } = useParams<{ roomId: string }>()
  const roomId = roomIdProp || paramRoomId
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)

  // State
  const [room, setRoom] = useState<ChatRoom | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'reconnecting'>('connected')
  const [sending, setSending] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null)
  const [replyToMessage, setReplyToMessage] = useState<ChatMessage | null>(null)
  
  // Upload & Voice states
  const [uploadModalOpen, setUploadModalOpen] = useState(false)
  const [isRecordingVoice, setIsRecordingVoice] = useState(false)
  const [attachMenuOpen, setAttachMenuOpen] = useState(false)
  const [bookingModalOpen, setBookingModalOpen] = useState(false)
  const [bookingSubmitting, setBookingSubmitting] = useState(false)

  // Confirm Deal Modal state
  const [confirmDealModal, setConfirmDealModal] = useState<{
    visible: boolean
    booking: BookingMetadata | null
    messageId: string | null
  }>({ visible: false, booking: null, messageId: null })
  const [confirmDealLoading, setConfirmDealLoading] = useState(false)

  // Add Advance Modal state
  const [addAdvanceModal, setAddAdvanceModal] = useState<{
    visible: boolean
    deal: DealCardMetadata | null
  }>({ visible: false, deal: null })
  const [addAdvanceLoading, setAddAdvanceLoading] = useState(false)

  // Record Delivery Modal state
  const [deliveryModal, setDeliveryModal] = useState<{
    visible: boolean
    deal: DealCardMetadata | null
  }>({ visible: false, deal: null })
  const [deliveryLoading, setDeliveryLoading] = useState(false)

  // Negotiate modal
  const [negotiateModal, setNegotiateModal] = useState<{ visible: boolean; messageId: string | null }>({
    visible: false,
    messageId: null,
  })
  const [negotiateForm] = Form.useForm()

  // ============================================
  // DATA FETCHING
  // ============================================

  const fetchRoom = useCallback(async () => {
    if (!roomId) return
    try {
      const data = await chatRoomService.getById(roomId)
      setRoom(data)
    } catch (error) {
      console.error('Error fetching room:', error)
      message.error('Không thể tải thông tin phòng chat')
    }
  }, [roomId])

  const fetchMessages = useCallback(async () => {
    if (!roomId) return
    try {
      setLoading(true)
      const response = await chatMessageService.getMessages({ room_id: roomId, limit: 50 })
      // Enrich reply_to references
      const enriched = response.data.map(msg => {
        if (msg.reply_to_id) {
          const replyMsg = response.data.find(m => m.id === msg.reply_to_id)
          if (replyMsg) return { ...msg, reply_to: replyMsg }
        }
        return msg
      })
      setMessages(enriched)

      // Kiểm tra booking đã confirmed nhưng chưa có Deal → tự tạo
      // Đảm bảo Deal luôn được tạo dù user bỏ lỡ realtime event
      if (room?.partner_id && user?.employee_id) {
        for (const msg of response.data) {
          if (
            msg.message_type === 'booking' &&
            msg.sender_type === 'factory' &&
            msg.metadata?.booking?.status === 'confirmed'
          ) {
            const existingDeal = await dealService.getDealByBookingId(msg.id)
            if (!existingDeal) {
              const booking = msg.metadata.booking as BookingMetadata
              try {
                await dealConfirmService.confirmDealFromChat(
                  {
                    product_type: booking.product_type,
                    agreed_quantity_tons: booking.quantity_tons,
                    expected_drc: booking.drc_percent,
                    agreed_price: booking.price_per_kg,
                    price_unit: booking.price_unit || 'wet',
                    pickup_location: booking.pickup_location,
                    delivery_date: booking.delivery_date,
                    has_advance: false,
                  },
                  {
                    bookingMessageId: msg.id,
                    partnerId: room.partner_id,
                    roomId,
                    confirmedBy: user.employee_id,
                    confirmerType: 'factory',
                    bookingCode: booking.code,
                  },
                )
                // Reload messages to show the new DealCard
                const updated = await chatMessageService.getMessages({ room_id: roomId, limit: 50 })
                setMessages(updated.data)
                message.success(`Deal tạo tự động cho phiếu ${booking.code}`)
              } catch (err: any) {
                if (!err?.message?.includes('đã tồn tại') && !err?.message?.includes('đã được xác nhận')) {
                  console.error('Auto-create deal on load:', err)
                }
              }
              break // Chỉ tạo 1 deal mỗi lần load
            }
          }
        }
      }
    } catch (error) {
      console.error('Error fetching messages:', error)
      message.error('Không thể tải tin nhắn')
    } finally {
      setLoading(false)
    }
  }, [roomId, room?.partner_id, user?.employee_id])

  const markAsRead = useCallback(async () => {
    if (!roomId) return
    try {
      await chatMessageService.markAsRead(roomId)
    } catch (error) {
      console.error('Error marking as read:', error)
    }
  }, [roomId])

  // ============================================
  // EFFECTS
  // ============================================

  useEffect(() => {
    fetchRoom()
    fetchMessages()
    markAsRead()
  }, [fetchRoom, fetchMessages, markAsRead])

  useEffect(() => {
    if (!roomId) return

    const channel = chatMessageService.subscribeToRoom(roomId, {
      onInsert: (newMessage) => {
        setMessages((prev) => {
          // Enrich reply_to if present
          if (newMessage.reply_to_id) {
            const replyMsg = prev.find(m => m.id === newMessage.reply_to_id)
            if (replyMsg) return [...prev, { ...newMessage, reply_to: replyMsg }]
          }
          return [...prev, newMessage]
        })
        if (newMessage.sender_type === 'partner') {
          chatMessageService.markMessageAsRead(newMessage.id)
        }
      },
      onUpdate: async (updatedMessage) => {
        setMessages((prev) => prev.map((m) => (m.id === updatedMessage.id ? updatedMessage : m)))

        // Chiều ngược: Factory gửi booking → Đại lý xác nhận (từ Portal)
        // Portal hiện tại chưa có ConfirmDealModal, chỉ update status = 'confirmed'
        // ERP bắt sự kiện này → tự tạo Deal + DealCard
        if (
          updatedMessage.message_type === 'booking' &&
          updatedMessage.sender_type === 'factory' &&
          updatedMessage.metadata?.booking?.status === 'confirmed' &&
          room?.partner_id &&
          user?.employee_id &&
          roomId
        ) {
          const booking = updatedMessage.metadata.booking as BookingMetadata
          // Kiểm tra deal đã tồn tại chưa (tránh duplicate)
          const existingDeal = await dealService.getDealByBookingId(updatedMessage.id)
          if (!existingDeal) {
            try {
              const result = await dealConfirmService.confirmDealFromChat(
                {
                  product_type: booking.product_type,
                  agreed_quantity_tons: booking.quantity_tons,
                  expected_drc: booking.drc_percent,
                  agreed_price: booking.price_per_kg,
                  price_unit: booking.price_unit || 'wet',
                  pickup_location: booking.pickup_location,
                  delivery_date: booking.delivery_date,
                  has_advance: false,
                },
                {
                  bookingMessageId: updatedMessage.id,
                  partnerId: room.partner_id,
                  roomId,
                  confirmedBy: user.employee_id,
                  confirmerType: 'factory',
                  bookingCode: booking.code,
                },
              )
              message.success(`Đại lý đã xác nhận! Deal ${result.deal.deal_number} được tạo`)
            } catch (err: any) {
              // Nếu deal đã tồn tại thì bỏ qua
              if (!err?.message?.includes('đã tồn tại')) {
                console.error('Auto-create deal from partner confirmation:', err)
              }
              message.success('Đại lý đã xác nhận phiếu chốt mủ!')
            }
          } else {
            message.success('Đại lý đã xác nhận phiếu chốt mủ!')
          }
        }
      },
      onDelete: (deletedMessage) => {
        setMessages((prev) => prev.filter((m) => m.id !== deletedMessage.id))
      },
      onStatusChange: (status) => {
        setConnectionStatus((prev) => {
          // Khi vừa reconnect thành công → refetch để lấy tin nhắn bị miss
          if (prev !== 'connected' && status === 'connected') {
            fetchMessages()
          }
          return status
        })
      },
    })

    return () => { channel.unsubscribe() }
  }, [roomId, fetchMessages])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ============================================
  // HANDLERS
  // ============================================

  const handleSend = async () => {
    if (!inputValue.trim() || !roomId || !user?.employee_id) return

    try {
      setSending(true)

      if (editingMessage) {
        await chatMessageService.editMessage(editingMessage.id, inputValue.trim())
        setEditingMessage(null)
        message.success('Đã cập nhật tin nhắn')
      } else {
        await chatMessageService.sendMessage({
          room_id: roomId,
          sender_id: user.employee_id,
          content: inputValue.trim(),
          reply_to_id: replyToMessage?.id,
        })
      }

      setInputValue('')
      setReplyToMessage(null)
    } catch (error) {
      console.error('Error sending message:', error)
      message.error('Không thể gửi tin nhắn')
    } finally {
      setSending(false)
    }
  }

  const handleSendWithAttachments = async (
    attachments: ChatAttachment[], 
    messageType: 'image' | 'file'
  ) => {
    if (!roomId || !user?.employee_id) return

    try {
      setSending(true)
      await chatMessageService.sendMessage({
        room_id: roomId,
        sender_id: user.employee_id,
        content: '',
        message_type: messageType,
        attachments,
      })
      message.success(`Đã gửi ${attachments.length} tệp`)
    } catch (error) {
      console.error('Error sending attachments:', error)
      message.error('Không thể gửi tệp đính kèm')
    } finally {
      setSending(false)
    }
  }

  const handleSendVoice = async (attachment: ChatAttachment) => {
    if (!roomId || !user?.employee_id) return

    try {
      setSending(true)
      await chatMessageService.sendMessage({
        room_id: roomId,
        sender_id: user.employee_id,
        content: '',
        message_type: 'audio',
        attachments: [attachment],
      })
      message.success('Đã gửi tin nhắn thoại')
      setIsRecordingVoice(false)
    } catch (error) {
      console.error('Error sending voice:', error)
      message.error('Không thể gửi tin nhắn thoại')
    } finally {
      setSending(false)
    }
  }

  const handleContextMenu = async (msg: ChatMessage, action: string) => {
    switch (action) {
      case 'reply':
        setReplyToMessage(msg)
        setEditingMessage(null)
        break

      case 'copy':
        await navigator.clipboard.writeText(msg.content)
        message.success('Đã sao chép')
        break

      case 'edit':
        setEditingMessage(msg)
        setInputValue(msg.content)
        break

      case 'recall':
        Modal.confirm({
          title: 'Thu hồi tin nhắn?',
          icon: <ExclamationCircleOutlined />,
          content: 'Tin nhắn sẽ được thay thế bằng "Tin nhắn đã được thu hồi"',
          okText: 'Thu hồi',
          cancelText: 'Hủy',
          onOk: async () => {
            try {
              await chatMessageService.recallMessage(msg.id)
              message.success('Đã thu hồi tin nhắn')
            } catch (error) {
              message.error('Không thể thu hồi tin nhắn')
            }
          },
        })
        break

      case 'pin':
        try {
          await chatMessageService.togglePinMessage(msg.id, user?.employee_id || '')
          message.success(msg.metadata?.pinned ? 'Đã bỏ ghim' : 'Đã ghim tin nhắn')
        } catch (error) {
          message.error('Không thể ghim tin nhắn')
        }
        break

      case 'delete':
        Modal.confirm({
          title: 'Xóa tin nhắn?',
          icon: <ExclamationCircleOutlined />,
          content: 'Tin nhắn sẽ bị xóa vĩnh viễn',
          okText: 'Xóa',
          okButtonProps: { danger: true },
          cancelText: 'Hủy',
          onOk: async () => {
            try {
              await chatMessageService.deleteMessage(msg.id)
              message.success('Đã xóa tin nhắn')
            } catch (error) {
              message.error('Không thể xóa tin nhắn')
            }
          },
        })
        break
    }
  }

  const handleBookingAction = async (messageId: string, action: 'confirm' | 'reject' | 'negotiate') => {
    if (action === 'negotiate') {
      setNegotiateModal({ visible: true, messageId })
      return
    }

    if (action === 'confirm') {
      // Mở ConfirmDealModal thay vì auto-confirm
      const msg = messages.find(m => m.id === messageId)
      const booking = msg?.metadata?.booking as BookingMetadata | undefined
      if (booking) {
        setConfirmDealModal({ visible: true, booking, messageId })
      }
      return
    }

    try {
      await chatMessageService.rejectBooking(messageId)
      message.success('Đã từ chối phiếu chốt mủ')
    } catch (error) {
      message.error('Không thể cập nhật phiếu chốt mủ')
    }
  }

  // Xử lý confirm deal từ modal
  const handleConfirmDeal = async (formData: ConfirmDealFormData) => {
    if (!confirmDealModal.messageId || !room?.partner_id || !user?.employee_id || !roomId) return

    try {
      setConfirmDealLoading(true)
      const result = await dealConfirmService.confirmDealFromChat(formData, {
        bookingMessageId: confirmDealModal.messageId,
        partnerId: room.partner_id,
        roomId,
        confirmedBy: user.employee_id,
        confirmerType: 'factory',
        bookingCode: confirmDealModal.booking?.code,
        lotCode: confirmDealModal.booking?.lot_code,
        rubberRegion: confirmDealModal.booking?.rubber_region,
        rubberRegionLat: confirmDealModal.booking?.rubber_region_lat,
        rubberRegionLng: confirmDealModal.booking?.rubber_region_lng,
      })

      const successMsg = result.advance
        ? `Deal ${result.deal.deal_number} đã tạo + Tạm ứng ${result.advance.advance_number}`
        : `Deal ${result.deal.deal_number} đã tạo`
      message.success(successMsg)

      setConfirmDealModal({ visible: false, booking: null, messageId: null })

      // Refresh messages để thấy DealCard + booking updated
      fetchMessages()
    } catch (error: any) {
      message.error(error?.message || 'Không thể tạo Deal')
    } finally {
      setConfirmDealLoading(false)
    }
  }

  // Xử lý actions trên DealCard
  const handleDealAction = (dealId: string, action: 'add_advance' | 'delivery' | 'view_details') => {
    if (action === 'view_details') {
      navigate(`/b2b/deals/${dealId}`)
      return
    }

    // Tìm DealCard metadata từ messages
    const dealMsg = messages.find(m =>
      m.message_type === 'deal' && (m.metadata as any)?.deal?.deal_id === dealId
    )
    const dealMeta = (dealMsg?.metadata as any)?.deal as DealCardMetadata | undefined

    if (!dealMeta) {
      message.error('Không tìm thấy thông tin Deal')
      return
    }

    if (action === 'add_advance') {
      setAddAdvanceModal({ visible: true, deal: dealMeta })
    } else if (action === 'delivery') {
      setDeliveryModal({ visible: true, deal: dealMeta })
    }
  }

  // Xử lý ứng thêm tiền
  const handleAddAdvance = async (formData: AddAdvanceFormData) => {
    if (!addAdvanceModal.deal || !room?.partner_id || !user?.employee_id || !roomId) return

    try {
      setAddAdvanceLoading(true)
      const result = await dealChatActionsService.addAdvanceFromChat(formData, {
        dealId: addAdvanceModal.deal.deal_id,
        dealNumber: addAdvanceModal.deal.deal_number,
        partnerId: room.partner_id,
        roomId,
        actionBy: user.employee_id,
        actionByType: 'factory',
      })

      message.success(
        `Đã ứng thêm ${result.amount.toLocaleString('vi-VN')} VNĐ (${result.advance_number})`
      )
      setAddAdvanceModal({ visible: false, deal: null })
      fetchMessages()
    } catch (error: any) {
      message.error(error?.message || 'Không thể ứng thêm')
    } finally {
      setAddAdvanceLoading(false)
    }
  }

  // Xử lý ghi nhận giao hàng
  const handleRecordDelivery = async (formData: RecordDeliveryFormData) => {
    if (!deliveryModal.deal || !room?.partner_id || !user?.employee_id || !roomId) return

    try {
      setDeliveryLoading(true)
      await dealChatActionsService.recordDeliveryFromChat(formData, {
        dealId: deliveryModal.deal.deal_id,
        dealNumber: deliveryModal.deal.deal_number,
        partnerId: room.partner_id,
        roomId,
        actionBy: user.employee_id,
        actionByType: 'factory',
      })

      message.success(`Đã ghi nhận giao hàng ${formData.quantity_kg.toLocaleString('vi-VN')} kg`)
      setDeliveryModal({ visible: false, deal: null })
      fetchMessages()
    } catch (error: any) {
      message.error(error?.message || 'Không thể ghi nhận giao hàng')
    } finally {
      setDeliveryLoading(false)
    }
  }

  const handleNegotiateSubmit = async () => {
    if (!negotiateModal.messageId) return

    try {
      const values = await negotiateForm.validateFields()
      await chatMessageService.negotiateBooking(negotiateModal.messageId, values.counterPrice, values.notes)
      message.success('Đã gửi đề xuất giá')
      setNegotiateModal({ visible: false, messageId: null })
      negotiateForm.resetFields()
    } catch (error) {
      message.error('Không thể gửi đề xuất')
    }
  }

  const handleCancelEdit = () => {
    setEditingMessage(null)
    setInputValue('')
  }

  // File selected from attachment menu (image/document)
  const handleFilesFromMenu = async (files: File[], type: 'image' | 'document') => {
    if (!roomId || !user?.employee_id) return
    try {
      setSending(true)
      const attachments: ChatAttachment[] = []
      for (const file of files) {
        const result = await chatAttachmentService.uploadFile(roomId, file)
        attachments.push(result)
      }
      const messageType = type === 'image' ? 'image' : 'file'
      await chatMessageService.sendMessage({
        room_id: roomId,
        sender_id: user.employee_id,
        content: '',
        message_type: messageType,
        attachments,
      })
      message.success(`Đã gửi ${files.length} tệp`)
    } catch (error) {
      console.error('Error uploading files:', error)
      message.error('Không thể gửi tệp')
    } finally {
      setSending(false)
    }
  }

  // Booking form submit → send booking message
  const handleBookingSubmit = async (booking: BookingMetadata) => {
    if (!roomId || !user?.employee_id) return
    try {
      setBookingSubmitting(true)
      await chatMessageService.sendMessage({
        room_id: roomId,
        sender_id: user.employee_id,
        content: `📋 Phiếu chốt mủ ${booking.code}`,
        message_type: 'booking',
        metadata: { booking },
      })
      message.success('Đã gửi phiếu chốt mủ')
      setBookingModalOpen(false)
    } catch (error) {
      console.error('Error sending booking:', error)
      message.error('Không thể gửi phiếu chốt mủ')
    } finally {
      setBookingSubmitting(false)
    }
  }

  // Emoji selected → append to input
  const handleEmojiSelect = (emoji: string) => {
    setInputValue((prev) => prev + emoji)
  }

  // ============================================
  // RENDER
  // ============================================

  const renderMessages = () => {
    if (loading) {
      return (
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <Spin indicator={<LoadingOutlined style={{ fontSize: 32 }} spin />} />
        </div>
      )
    }

    if (messages.length === 0) {
      return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có tin nhắn nào" style={{ padding: '48px 0' }} />
    }

    let lastDate: string | null = null

    return messages.map((msg, idx) => {
      const currentDate = format(new Date(msg.sent_at), 'yyyy-MM-dd')
      const showDateDivider = currentDate !== lastDate
      lastDate = currentDate

      const isOwn = msg.sender_type === 'factory'
      const showAvatar = idx === 0 || 
        messages[idx - 1]?.sender_type !== msg.sender_type ||
        !isSameDay(new Date(messages[idx - 1]?.sent_at), new Date(msg.sent_at))

      return (
        <div key={msg.id}>
          {showDateDivider && (
            <div style={{ textAlign: 'center', margin: '16px 0' }}>
              <Tag color="default" style={{ fontSize: 12 }}>{formatDateDivider(msg.sent_at)}</Tag>
            </div>
          )}
          <MessageBubble
            message={msg}
            isOwn={isOwn}
            showAvatar={showAvatar}
            onContextMenu={handleContextMenu}
            onBookingAction={handleBookingAction}
            onDealAction={handleDealAction}
          />
        </div>
      )
    })
  }

  return (
    <div style={{ height: embedded ? '100%' : '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Card style={{ borderRadius: 0, borderBottom: '1px solid #f0f0f0' }} styles={{ body: { padding: '12px 16px' } }}>
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Space>
            <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => onBack ? onBack() : navigate('/b2b/chat')} />
            <Avatar size={40} style={{ backgroundColor: '#87d068' }}>
              {room?.partner?.name?.charAt(0) || 'P'}
            </Avatar>
            <div>
              <Title level={5} style={{ margin: 0 }}>{room?.partner?.name || 'Đang tải...'}</Title>
              <Space size={4}>
                {room?.partner?.code && <Text type="secondary" style={{ fontSize: 12 }}>{room?.partner?.code}</Text>}
                {room?.partner?.tier && (
                  <Tag color={
                    room?.partner?.tier === 'diamond' ? 'purple' :
                    room?.partner?.tier === 'gold' ? 'gold' :
                    room?.partner?.tier === 'silver' ? 'default' :
                    room?.partner?.tier === 'bronze' ? 'orange' : 'cyan'
                  } style={{ fontSize: 10 }}>
                    {TIER_LABELS[room?.partner?.tier]}
                  </Tag>
                )}
              </Space>
            </div>
          </Space>
          <Space size={8}>
            {connectionStatus === 'disconnected' && (
              <Tag color="red" style={{ fontSize: 11, margin: 0 }}>● Mất kết nối</Tag>
            )}
            {connectionStatus === 'reconnecting' && (
              <Tag color="orange" style={{ fontSize: 11, margin: 0 }}>● Đang kết nối lại...</Tag>
            )}
            <Dropdown
              menu={{
                items: [
                  { key: 'search', icon: <SearchOutlined />, label: 'Tìm kiếm' },
                  { key: 'pinned', icon: <PushpinOutlined />, label: 'Tin đã ghim' },
                  { key: 'files', icon: <FileOutlined />, label: 'File đã gửi' },
                ],
              }}
              trigger={['click']}
            >
              <Button type="text" icon={<MoreOutlined />} />
            </Dropdown>
          </Space>
        </Space>
      </Card>

      {/* Messages Area */}
      <div ref={messagesContainerRef} style={{ flex: 1, overflowY: 'auto', padding: '16px', backgroundColor: '#fafafa' }}>
        {renderMessages()}
        <div ref={messagesEndRef} />
      </div>

      {/* Reply indicator */}
      {replyToMessage && (
        <div style={{ padding: '8px 16px', backgroundColor: '#f0fdf4', borderTop: '1px solid #bbf7d0', borderLeft: '3px solid #1B4D3E', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <Text strong style={{ fontSize: 12, color: '#1B4D3E' }}>Trả lời {replyToMessage.sender_type === 'partner' ? 'đại lý' : 'nhà máy'}</Text>
            <Text style={{ fontSize: 12, color: '#666', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{replyToMessage.content || '(ảnh/file)'}</Text>
          </div>
          <Button type="text" size="small" onClick={() => setReplyToMessage(null)}>✕</Button>
        </div>
      )}

      {/* Edit indicator */}
      {editingMessage && (
        <div style={{ padding: '8px 16px', backgroundColor: '#e6f7ff', borderTop: '1px solid #91d5ff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Space>
            <EditOutlined style={{ color: '#1677ff' }} />
            <Text>Đang chỉnh sửa tin nhắn</Text>
          </Space>
          <Button type="text" size="small" onClick={handleCancelEdit}>Hủy</Button>
        </div>
      )}

      {/* Input Area */}
      <Card style={{ borderRadius: 0, borderTop: '1px solid #f0f0f0' }} styles={{ body: { padding: '12px 16px' } }}>
        {isRecordingVoice ? (
          <VoiceRecorder
            roomId={roomId || ''}
            onSend={handleSendVoice}
            onCancel={() => setIsRecordingVoice(false)}
          />
        ) : (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
            {/* Attachment Menu */}
            <ChatAttachmentMenu
              open={attachMenuOpen}
              onOpenChange={setAttachMenuOpen}
              onSelect={(action) => {
                if (action === 'booking') {
                  setBookingModalOpen(true)
                }
              }}
              onFilesSelected={handleFilesFromMenu}
            >
              <Button
                shape="circle"
                icon={<PaperClipOutlined />}
                size="large"
                style={{ flexShrink: 0 }}
              />
            </ChatAttachmentMenu>

            {/* Text Input */}
            <TextArea
              placeholder="Nhập tin nhắn..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onPressEnter={(e) => {
                if (!e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              autoSize={{ minRows: 1, maxRows: 4 }}
              style={{ flex: 1 }}
            />

            {/* Emoji Picker */}
            <EmojiPickerPopover onSelect={handleEmojiSelect}>
              <Button
                shape="circle"
                icon={<SmileOutlined />}
                size="large"
                style={{ flexShrink: 0 }}
              />
            </EmojiPickerPopover>

            {/* Voice / Send */}
            {inputValue.trim() ? (
              <Button
                type="primary"
                shape="circle"
                icon={<SendOutlined />}
                size="large"
                onClick={handleSend}
                loading={sending}
                style={{ flexShrink: 0 }}
              />
            ) : (
              <Button
                shape="circle"
                icon={<AudioOutlined />}
                size="large"
                onClick={() => setIsRecordingVoice(true)}
                style={{ flexShrink: 0 }}
              />
            )}
          </div>
        )}
      </Card>

      {/* Upload Modal (drag & drop advanced) */}
      <ChatAttachmentUpload
        roomId={roomId || ''}
        open={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        onUploadComplete={handleSendWithAttachments}
      />

      {/* Booking Form Modal */}
      <BookingFormModal
        open={bookingModalOpen}
        onCancel={() => setBookingModalOpen(false)}
        onSubmit={handleBookingSubmit}
        loading={bookingSubmitting}
        partnerName={room?.partner?.name}
      />

      {/* Confirm Deal Modal */}
      <ConfirmDealModal
        open={confirmDealModal.visible}
        onCancel={() => setConfirmDealModal({ visible: false, booking: null, messageId: null })}
        onConfirm={handleConfirmDeal}
        loading={confirmDealLoading}
        booking={confirmDealModal.booking}
        partnerName={room?.partner?.name}
        showAdvanceSection={true}
      />

      {/* Add Advance Modal */}
      <AddAdvanceModal
        open={addAdvanceModal.visible}
        onCancel={() => setAddAdvanceModal({ visible: false, deal: null })}
        onConfirm={handleAddAdvance}
        loading={addAdvanceLoading}
        deal={addAdvanceModal.deal}
        partnerName={room?.partner?.name}
      />

      {/* Record Delivery Modal */}
      <RecordDeliveryModal
        open={deliveryModal.visible}
        onCancel={() => setDeliveryModal({ visible: false, deal: null })}
        onConfirm={handleRecordDelivery}
        loading={deliveryLoading}
        deal={deliveryModal.deal}
        partnerName={room?.partner?.name}
      />

      {/* Negotiate Modal */}
      <Modal
        title="Thương lượng giá"
        open={negotiateModal.visible}
        onOk={handleNegotiateSubmit}
        onCancel={() => { setNegotiateModal({ visible: false, messageId: null }); negotiateForm.resetFields() }}
        okText="Gửi đề xuất"
        cancelText="Hủy"
      >
        <Form form={negotiateForm} layout="vertical">
          <Form.Item name="counterPrice" label="Giá đề xuất (đ/kg)" rules={[{ required: true, message: 'Vui lòng nhập giá đề xuất' }]}>
            <InputNumber<number>
              style={{ width: '100%' }}
              min={0}
              formatter={(value) => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
              parser={(value) => Number(value!.replace(/\$\s?|(,*)/g, '')) || 0}
              placeholder="Nhập giá đề xuất"
            />
          </Form.Item>
          <Form.Item name="notes" label="Ghi chú">
            <TextArea rows={3} placeholder="Lý do thương lượng..." />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default B2BChatRoomPage