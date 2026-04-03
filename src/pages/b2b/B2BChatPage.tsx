// ============================================================================
// B2B CHAT PAGE — Split-screen Layout (Zalo-style)
// File: src/pages/b2b/B2BChatPage.tsx
// ============================================================================
// Desktop: list bên trái (320px) + chat room bên phải
// Mobile: list hoặc room (full-page), toggle bằng state
// ============================================================================

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Search, MessageSquare, RefreshCw, Plus, ChevronLeft,
  MoreVertical, Pin, FileText, X,
} from 'lucide-react'
import {
  chatRoomService,
  type ChatRoom,
  type PartnerTier,
  TIER_LABELS,
} from '../../services/b2b/chatRoomService'
import { formatDistanceToNow } from 'date-fns'
import { vi } from 'date-fns/locale'

// ============================================================================
// TYPES & CONSTANTS
// ============================================================================

const TIER_ICONS: Record<PartnerTier, string> = {
  diamond: '💎', gold: '🥇', silver: '🥈', bronze: '🥉', new: '🆕',
}

const TIER_DOT_COLORS: Record<PartnerTier, string> = {
  diamond: 'bg-purple-500', gold: 'bg-amber-500', silver: 'bg-gray-400', bronze: 'bg-orange-500', new: 'bg-cyan-500',
}

type FilterType = 'all' | 'unread'

function formatTime(dateStr: string | null): string {
  if (!dateStr) return ''
  try { return formatDistanceToNow(new Date(dateStr), { addSuffix: false, locale: vi }) } catch { return '' }
}

function messagePreview(room: ChatRoom): string {
  if (!room.last_message) return 'Chưa có tin nhắn'
  const { message_type, content, sender_type } = room.last_message
  const pre = sender_type === 'factory' ? 'Bạn: ' : ''
  switch (message_type) {
    case 'image': return `${pre}📷 Hình ảnh`
    case 'file': return `${pre}📎 Tệp`
    case 'audio': return `${pre}🎤 Voice`
    case 'booking': return `${pre}📋 Phiếu chốt mủ`
    case 'quotation': return `${pre}💰 Báo giá`
    case 'system': return `⚙️ ${content}`
    default: return `${pre}${content?.length > 45 ? content.slice(0, 45) + '...' : content || ''}`
  }
}

// ============================================================================
// ROOM LIST SIDEBAR
// ============================================================================

function RoomListPanel({
  rooms, loading, activeRoomId, onSelect, onRefresh, searchText, setSearchText,
  filter, setFilter, totalUnread,
}: {
  rooms: ChatRoom[]; loading: boolean; activeRoomId?: string;
  onSelect: (room: ChatRoom) => void; onRefresh: () => void;
  searchText: string; setSearchText: (s: string) => void;
  filter: FilterType; setFilter: (f: FilterType) => void;
  totalUnread: number;
}) {
  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-blue-600" />
            <h2 className="text-base font-bold text-gray-900">Chat Đại lý</h2>
            {totalUnread > 0 && (
              <span className="px-1.5 py-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] text-center">{totalUnread > 99 ? '99+' : totalUnread}</span>
            )}
          </div>
          <button onClick={onRefresh} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg min-w-[44px] min-h-[44px] flex items-center justify-center">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            placeholder="Tìm đại lý..."
            className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px]"
          />
        </div>

        {/* Filter */}
        <div className="flex gap-1">
          {[{ key: 'all', label: 'Tất cả' }, { key: 'unread', label: 'Chưa đọc' }].map(f => (
            <button key={f.key} onClick={() => setFilter(f.key as FilterType)}
              className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors ${filter === f.key ? 'bg-blue-600 text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Room List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="flex items-center gap-3 animate-pulse">
                <div className="w-12 h-12 bg-gray-200 rounded-full" />
                <div className="flex-1"><div className="h-4 bg-gray-200 rounded w-3/4 mb-2" /><div className="h-3 bg-gray-100 rounded w-1/2" /></div>
              </div>
            ))}
          </div>
        ) : rooms.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <MessageSquare className="w-12 h-12 mb-3 opacity-30" />
            <p className="text-sm">Không có cuộc trò chuyện</p>
          </div>
        ) : (
          <div>
            {rooms.map(room => {
              const isActive = room.id === activeRoomId
              const name = room.partner?.name || 'Đại lý'
              const tier = room.partner?.tier || 'new'
              const unread = room.unread_count || 0
              return (
                <button key={room.id} onClick={() => onSelect(room)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors border-b border-gray-50
                    ${isActive ? 'bg-blue-50 border-l-3 border-l-blue-500' : 'hover:bg-gray-50'}
                  `}>
                  {/* Avatar */}
                  <div className="relative flex-shrink-0">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white font-bold text-lg">
                      {name.charAt(0)}
                    </div>
                    <div className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-white flex items-center justify-center text-[8px] ${TIER_DOT_COLORS[tier]}`}>
                      {TIER_ICONS[tier]}
                    </div>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className={`text-sm truncate ${unread > 0 ? 'font-bold text-gray-900' : 'font-medium text-gray-800'}`}>{name}</span>
                      <span className="text-[10px] text-gray-400 flex-shrink-0 ml-2">{formatTime(room.last_message?.sent_at || null)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className={`text-xs truncate ${unread > 0 ? 'text-gray-700 font-medium' : 'text-gray-400'}`}>
                        {messagePreview(room)}
                      </span>
                      {unread > 0 && (
                        <span className="ml-2 px-1.5 py-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] text-center flex-shrink-0">{unread}</span>
                      )}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// EMPTY STATE (no room selected)
// ============================================================================

function EmptyChat() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-gray-50 text-gray-400">
      <div className="w-24 h-24 rounded-full bg-gray-100 flex items-center justify-center mb-4">
        <MessageSquare className="w-10 h-10 text-gray-300" />
      </div>
      <h3 className="text-lg font-semibold text-gray-500 mb-1">Chọn cuộc trò chuyện</h3>
      <p className="text-sm">Chọn một đại lý từ danh sách bên trái để bắt đầu chat</p>
    </div>
  )
}

// ============================================================================
// MAIN SPLIT-SCREEN COMPONENT
// ============================================================================

export default function B2BChatPage() {
  const { roomId } = useParams<{ roomId: string }>()
  const navigate = useNavigate()

  // Room list state
  const [rooms, setRooms] = useState<ChatRoom[]>([])
  const [loading, setLoading] = useState(true)
  const [searchText, setSearchText] = useState('')
  const [filter, setFilter] = useState<FilterType>('all')
  const [totalUnread, setTotalUnread] = useState(0)

  // Mobile: show list or room
  const [mobileShowRoom, setMobileShowRoom] = useState(!!roomId)

  // Lazy-loaded room component
  const [ChatRoomComponent, setChatRoomComponent] = useState<React.ComponentType<any> | null>(null)

  // Load ChatRoomPage component lazily
  useEffect(() => {
    import('./B2BChatRoomPage').then(mod => {
      setChatRoomComponent(() => mod.default)
    })
  }, [])

  // Fetch rooms
  const fetchRooms = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true)
      const response = await chatRoomService.getRooms({ search: searchText || undefined, filter, pageSize: 50 })
      setRooms(response.data)
    } catch (e) { console.error('Error fetching rooms:', e) }
    finally { setLoading(false) }
  }, [searchText, filter])

  const fetchUnread = useCallback(async () => {
    try { setTotalUnread(await chatRoomService.getTotalUnreadCount()) } catch {}
  }, [])

  useEffect(() => { fetchRooms(); fetchUnread() }, [fetchRooms, fetchUnread])

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => fetchRooms(), 300)
    return () => clearTimeout(t)
  }, [searchText, filter, fetchRooms])

  // Realtime
  useEffect(() => {
    const msgCh = chatRoomService.subscribeToMessages(() => { fetchRooms(false); fetchUnread() })
    const roomCh = chatRoomService.subscribeToRooms(() => fetchRooms(false))
    return () => { msgCh.unsubscribe(); roomCh.unsubscribe() }
  }, [fetchRooms, fetchUnread])

  // When roomId changes from URL
  useEffect(() => {
    if (roomId) setMobileShowRoom(true)
  }, [roomId])

  const handleSelectRoom = (room: ChatRoom) => {
    navigate(`/b2b/chat/${room.id}`, { replace: true })
    setMobileShowRoom(true)
    // Mark read after a short delay
    setTimeout(() => { fetchRooms(false); fetchUnread() }, 1000)
  }

  const handleBackToList = () => {
    setMobileShowRoom(false)
    navigate('/b2b/chat', { replace: true })
    fetchRooms(false)
    fetchUnread()
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="flex h-[calc(100vh-3.5rem)] lg:h-[calc(100vh-0px)] bg-gray-50 overflow-hidden">
      {/* ═══ LEFT: Room List ═══ */}
      <div className={`
        w-full lg:w-[340px] xl:w-[380px] lg:flex-shrink-0 border-r border-gray-200
        ${mobileShowRoom ? 'hidden lg:block' : 'block'}
      `}>
        <RoomListPanel
          rooms={rooms}
          loading={loading}
          activeRoomId={roomId}
          onSelect={handleSelectRoom}
          onRefresh={() => { fetchRooms(); fetchUnread() }}
          searchText={searchText}
          setSearchText={setSearchText}
          filter={filter}
          setFilter={setFilter}
          totalUnread={totalUnread}
        />
      </div>

      {/* ═══ RIGHT: Chat Room ═══ */}
      <div className={`
        flex-1 flex flex-col min-w-0
        ${!mobileShowRoom ? 'hidden lg:flex' : 'flex'}
      `}>
        {roomId && ChatRoomComponent ? (
          <ChatRoomComponent
            key={roomId}
            embedded
            roomIdProp={roomId}
            onBack={handleBackToList}
          />
        ) : (
          <EmptyChat />
        )}
      </div>
    </div>
  )
}
