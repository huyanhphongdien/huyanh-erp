// ============================================================================
// FILE: src/components/b2b/ChatRoomCard.tsx
// MODULE: B2B Platform - Huy Anh Rubber ERP
// DESCRIPTION: Card hiển thị phòng chat trong danh sách
// ============================================================================

import { memo } from 'react';
import { Package, Clock, MessageSquare } from 'lucide-react';
import { useOpenChatTab } from '../../hooks/useB2BTabs';
import type { ChatRoom } from '../../services/b2b/chatRoomService';

// ============================================================================
// TYPES
// ============================================================================

interface ChatRoomCardProps {
  room: ChatRoom;
}

// ============================================================================
// HELPERS
// ============================================================================

function getTierConfig(tier: string): { label: string; color: string; bgColor: string; gradient: string } {
  switch (tier) {
    case 'diamond':
      return { 
        label: 'Diamond', 
        color: 'text-purple-700', 
        bgColor: 'bg-purple-100',
        gradient: 'from-purple-500 to-purple-600'
      };
    case 'gold':
      return { 
        label: 'Gold', 
        color: 'text-amber-700', 
        bgColor: 'bg-amber-100',
        gradient: 'from-amber-500 to-amber-600'
      };
    case 'silver':
      return { 
        label: 'Silver', 
        color: 'text-gray-600', 
        bgColor: 'bg-gray-200',
        gradient: 'from-gray-400 to-gray-500'
      };
    case 'bronze':
      return { 
        label: 'Bronze', 
        color: 'text-orange-700', 
        bgColor: 'bg-orange-100',
        gradient: 'from-orange-400 to-orange-500'
      };
    default:
      return { 
        label: 'Mới', 
        color: 'text-blue-700', 
        bgColor: 'bg-blue-100',
        gradient: 'from-blue-500 to-blue-600'
      };
  }
}

function getPartnerTypeLabel(type: string): string {
  switch (type) {
    case 'dealer':
      return 'Đại lý';
    case 'supplier':
      return 'NCC';
    case 'both':
      return 'ĐL & NCC';
    default:
      return type;
  }
}

function getAvatarLetter(name: string): string {
  return name.charAt(0).toUpperCase();
}

function formatTimeAgo(dateString: string | null): string {
  if (!dateString) return '';

  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Vừa xong';
  if (diffMins < 60) return `${diffMins} phút`;
  if (diffHours < 24) return `${diffHours} giờ`;
  if (diffDays < 7) return `${diffDays} ngày`;

  return date.toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
  });
}

function truncateMessage(message: string | null, maxLength = 50): string {
  if (!message) return 'Chưa có tin nhắn';
  if (message.length <= maxLength) return message;
  return message.substring(0, maxLength) + '...';
}

// ============================================================================
// COMPONENT
// ============================================================================

function ChatRoomCard({ room }: ChatRoomCardProps) {
  const openChatTab = useOpenChatTab();
  const partner = room.partner;
  const tierConfig = getTierConfig(partner?.tier || 'new');
  const hasUnread = (room.unread_count || 0) > 0;

  const handleClick = () => {
    openChatTab(room);
  };

  return (
    <button
      onClick={handleClick}
      className={`w-full flex items-center gap-3 p-4 bg-white hover:bg-gray-50 border-b border-gray-100 transition-colors text-left active:bg-gray-100 ${
        hasUnread ? 'bg-primary/5' : ''
      }`}
    >
      {/* Avatar */}
      <div className="relative flex-shrink-0">
        <div className={`w-14 h-14 bg-gradient-to-br ${tierConfig.gradient} rounded-full flex items-center justify-center text-white font-bold text-xl shadow-sm`}>
          {getAvatarLetter(partner?.name || 'Đ')}
        </div>
        {/* Online indicator */}
        <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-green-500 border-2 border-white rounded-full" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Header row */}
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="flex items-center gap-2 min-w-0">
            <h3 className={`font-semibold truncate ${hasUnread ? 'text-gray-900' : 'text-gray-800'}`}>
              {partner?.name || 'Đối tác'}
            </h3>
            <span className={`flex-shrink-0 px-1.5 py-0.5 text-xs font-medium rounded ${tierConfig.bgColor} ${tierConfig.color}`}>
              {tierConfig.label}
            </span>
          </div>
          <span className="flex-shrink-0 text-xs text-gray-400">
            {formatTimeAgo(room.last_message_at)}
          </span>
        </div>

        {/* Partner info row */}
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-1.5">
          <span className="font-mono">{partner?.code}</span>
          <span>•</span>
          <span>{getPartnerTypeLabel((partner as any)?.partner_type || '')}</span>
          {room.room_type === 'deal' && (
            <>
              <span>•</span>
              <span className="flex items-center gap-1 text-blue-600">
                <Package className="w-3.5 h-3.5" />
                Deal
              </span>
            </>
          )}
        </div>

        {/* Last message row */}
        <div className="flex items-center justify-between gap-2">
          <p className={`text-sm truncate ${hasUnread ? 'text-gray-900 font-medium' : 'text-gray-500'}`}>
            {truncateMessage(room.last_message?.content || null)}
          </p>

          {/* Unread badge */}
          {hasUnread && (
            <span className="flex-shrink-0 min-w-[20px] h-5 px-1.5 bg-primary text-white text-xs font-bold rounded-full flex items-center justify-center">
              {(room.unread_count || 0) > 99 ? '99+' : room.unread_count}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

// ============================================================================
// EMPTY STATE COMPONENT
// ============================================================================

export function ChatRoomListEmpty({ 
  hasFilter = false 
}: { 
  hasFilter?: boolean 
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4">
        <MessageSquare className="w-10 h-10 text-gray-400" />
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-1">
        {hasFilter ? 'Không tìm thấy kết quả' : 'Chưa có cuộc trò chuyện'}
      </h3>
      <p className="text-gray-500 text-center max-w-xs">
        {hasFilter 
          ? 'Thử thay đổi từ khóa tìm kiếm hoặc bộ lọc'
          : 'Bắt đầu chat với đối tác từ trang Chi tiết đối tác'
        }
      </p>
    </div>
  );
}

// ============================================================================
// LOADING SKELETON
// ============================================================================

export function ChatRoomCardSkeleton() {
  return (
    <div className="flex items-center gap-3 p-4 bg-white border-b border-gray-100 animate-pulse">
      {/* Avatar skeleton */}
      <div className="w-14 h-14 bg-gray-200 rounded-full flex-shrink-0" />

      {/* Content skeleton */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-2">
          <div className="h-5 w-32 bg-gray-200 rounded" />
          <div className="h-4 w-12 bg-gray-200 rounded" />
        </div>
        <div className="h-4 w-24 bg-gray-200 rounded mb-2" />
        <div className="h-4 w-48 bg-gray-200 rounded" />
      </div>
    </div>
  );
}

// ============================================================================
// EXPORT
// ============================================================================

export default memo(ChatRoomCard);