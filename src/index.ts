/**
 * Phase E1 - B2B Chat ERP Side
 * Barrel export for all components and services
 */

// ==========================================
// SERVICES
// ==========================================
export {
  chatRoomService,
  type ChatRoom,
  type PartnerTier,
  type RoomType,
  type RoomStatus,
  type ChatRoomListParams,
  TIER_LABELS,
  TIER_COLORS,
} from './services/b2b/chatRoomService';

export {
  chatMessageService,
  type ChatMessage,
  type ChatAttachment,
  type BookingMetadata,
  type MessageMetadata,
  type SendMessageData,
  type MessageType,
  type SenderType,
} from './services/b2b/chatMessageService';

export {
  chatAttachmentService,
  ALLOWED_MIME_TYPES,
} from './services/b2b/chatAttachmentService';

// ==========================================
// PAGES
// ==========================================
export { default as B2BChatListPage } from './pages/b2b/B2BChatListPage';
export { default as B2BChatRoomPage } from './pages/b2b/B2BChatRoomPage';

// ==========================================
// COMPONENTS
// ==========================================
export { default as BookingCard, type BookingCardProps, type BookingMetadata as BookingMeta } from './components/chat/BookingCard';
export { VoiceRecorder, type VoiceRecorderProps } from './components/chat/VoiceRecorder';
export { default as ChatAttachmentUpload } from './components/b2b/ChatAttachmentUpload';
export { default as VoiceRecorderB2B } from './components/b2b/VoiceRecorder';
