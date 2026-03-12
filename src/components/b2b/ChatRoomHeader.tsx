// ============================================================================
// FILE: src/components/b2b/ChatRoomHeader.tsx
// MODULE: B2B Platform - Huy Anh Rubber ERP
// DESCRIPTION: Header phòng chat với thông tin đối tác
// ============================================================================

import { memo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Phone,
  MoreVertical,
  User,
  FileText,
  Package,
  Clock
} from 'lucide-react';
import type { ChatRoom } from '../../services/b2b/chatRoomService';

// ============================================================================
// TYPES
// ============================================================================

interface ChatRoomHeaderProps {
  room: ChatRoom;
  onCreateBooking?: () => void;
  onViewProfile?: () => void;
}

// ============================================================================
// HELPERS
// ============================================================================

function getTierConfig(tier: string): { label: string; color: string; bgColor: string } {
  switch (tier) {
    case 'diamond':
      return { label: 'Diamond', color: 'text-purple-700', bgColor: 'bg-purple-100' };
    case 'gold':
      return { label: 'Gold', color: 'text-amber-700', bgColor: 'bg-amber-100' };
    case 'silver':
      return { label: 'Silver', color: 'text-gray-600', bgColor: 'bg-gray-200' };
    case 'bronze':
      return { label: 'Bronze', color: 'text-orange-700', bgColor: 'bg-orange-100' };
    default:
      return { label: 'Mới', color: 'text-blue-700', bgColor: 'bg-blue-100' };
  }
}

function getPartnerTypeLabel(type: string): string {
  switch (type) {
    case 'dealer':
      return 'Đại lý';
    case 'supplier':
      return 'Nhà cung cấp';
    case 'both':
      return 'Đại lý & NCC';
    default:
      return type;
  }
}

function getAvatarLetter(name: string): string {
  return name.charAt(0).toUpperCase();
}

// ============================================================================
// COMPONENT
// ============================================================================

function ChatRoomHeader({ room, onCreateBooking, onViewProfile }: ChatRoomHeaderProps) {
  const navigate = useNavigate();
  const partner = room.partner;
  const tierConfig = getTierConfig(partner?.tier || 'new');

  const handleBack = () => {
    navigate('/b2b/chat');
  };

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
      {/* Main header */}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Back button */}
        <button
          onClick={handleBack}
          className="p-2 -ml-2 hover:bg-gray-100 rounded-full transition-colors active:scale-95"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>

        {/* Avatar */}
        <div className="relative">
          <div className="w-11 h-11 bg-gradient-to-br from-primary to-secondary rounded-full flex items-center justify-center text-white font-bold text-lg">
            {getAvatarLetter(partner?.name || 'Đ')}
          </div>
          {/* Online indicator */}
          <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-green-500 border-2 border-white rounded-full" />
        </div>

        {/* Partner info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="font-semibold text-gray-900 truncate">
              {partner?.name || 'Đối tác'}
            </h1>
            <span className={`px-1.5 py-0.5 text-xs font-medium rounded ${tierConfig.bgColor} ${tierConfig.color}`}>
              {tierConfig.label}
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span>{partner?.code}</span>
            <span>•</span>
            <span>{getPartnerTypeLabel((partner as any)?.partner_type || '')}</span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1">
          {partner?.phone && (
            <a
              href={`tel:${partner.phone}`}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              title="Gọi điện"
            >
              <Phone className="w-5 h-5 text-gray-600" />
            </a>
          )}

          {/* More menu - Dropdown */}
          <div className="relative group">
            <button className="p-2 hover:bg-gray-100 rounded-full transition-colors">
              <MoreVertical className="w-5 h-5 text-gray-600" />
            </button>

            {/* Dropdown menu */}
            <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-gray-200 rounded-xl shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-20">
              <div className="py-1">
                <button
                  onClick={onViewProfile}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <User className="w-4 h-4" />
                  <span>Xem hồ sơ</span>
                </button>
                <button
                  onClick={onCreateBooking}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <Package className="w-4 h-4" />
                  <span>Tạo phiếu chốt mủ</span>
                </button>
                <button
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <FileText className="w-4 h-4" />
                  <span>Lịch sử giao dịch</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Room type indicator (nếu là deal hoặc support) */}
      {room.room_type !== 'general' && (
        <div className="px-4 pb-2">
          <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
            room.room_type === 'deal' 
              ? 'bg-blue-50 text-blue-700' 
              : 'bg-orange-50 text-orange-700'
          }`}>
            {room.room_type === 'deal' ? (
              <>
                <Package className="w-3.5 h-3.5" />
                <span>Chat theo Deal</span>
              </>
            ) : (
              <>
                <Clock className="w-3.5 h-3.5" />
                <span>Hỗ trợ</span>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}

// ============================================================================
// EXPORT
// ============================================================================

export default memo(ChatRoomHeader);