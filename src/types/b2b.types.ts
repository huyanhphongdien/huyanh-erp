// ============================================================================
// FILE: src/services/b2b/b2b.types.ts
// MODULE: B2B Platform — Huy Anh Rubber ERP
// MÔ TẢ: TypeScript interfaces cho B2B module
// ============================================================================

// ============================================================================
// ENUMS & CONSTANTS
// ============================================================================

export type PartnerTier = 'new' | 'bronze' | 'silver' | 'gold' | 'diamond'
export type PartnerStatus = 'pending' | 'verified' | 'suspended' | 'rejected'
export type PartnerType = 'dealer' | 'supplier' | 'processor'

export type RoomType = 'general' | 'deal' | 'support' | 'direct'
export type MessageType = 'text' | 'image' | 'file' | 'audio' | 'booking' | 'deal' | 'quotation' | 'system'
export type SenderType = 'factory' | 'partner' | 'system'
export type ParticipantRole = 'owner' | 'admin' | 'member'

export type BookingStatus = 'pending' | 'confirmed' | 'negotiating' | 'rejected' | 'cancelled'
// DealStatus — thống nhất với dealService.ts (đã cập nhật 18/04/2026)
//   pending    — Chờ xử lý (manual create, chưa bắt đầu)
//   processing — Đang xử lý (nhập kho, QC, tạm ứng)
//   accepted   — Đã duyệt (đủ điều kiện: weight + DRC + QC passed)
//   settled    — Đã quyết toán
//   cancelled  — Đã hủy
export type DealStatus = 'pending' | 'processing' | 'accepted' | 'settled' | 'cancelled'

// ============================================================================
// PARTNER INTERFACES
// ============================================================================

export interface Partner {
  id: string
  code: string
  name: string
  partner_type: PartnerType
  tier: PartnerTier
  status: PartnerStatus
  is_active: boolean
  
  // Contact
  phone?: string
  email?: string
  address?: string
  tax_code?: string
  
  // Stats
  total_volume_tons?: number
  total_value_vnd?: number
  
  // Audit
  created_at: string
  updated_at?: string
}

export interface PartnerUser {
  id: string
  partner_id: string
  full_name: string
  phone: string
  email?: string
  role: string
  is_active: boolean
  last_login_at?: string
  created_at: string
}

// ============================================================================
// CHAT INTERFACES
// ============================================================================

export interface ChatRoom {
  id: string
  partner_id: string
  deal_id?: string
  room_type: RoomType
  room_name?: string
  status?: string
  is_active: boolean
  
  // Stats
  message_count: number
  last_message_at?: string
  
  // Computed (từ join)
  partner?: Partner
  unread_count?: number
  last_message?: ChatMessage
  
  // Audit
  created_by?: string
  created_at: string
  updated_at?: string
}

export interface ChatMessage {
  id: string
  room_id: string
  sender_id: string
  sender_type: SenderType
  
  content: string
  message_type: MessageType
  attachments: Attachment[]
  metadata: MessageMetadata
  
  reply_to_id?: string
  reply_to?: ChatMessage
  
  // Status
  sent_at: string
  edited_at?: string
  deleted_at?: string
  read_at?: string
  
  // Computed
  sender_name?: string
  is_mine?: boolean
}

export interface Attachment {
  url: string
  path: string
  fileName: string
  fileSize: number
  fileType: string
  width?: number
  height?: number
  duration?: number  // for audio
  caption?: string
}

export interface MessageMetadata {
  // For booking messages
  code?: string
  booking_code?: string
  product_type?: string
  quantity_tons?: number
  drc_percent?: number
  price_per_kg?: number
  price_unit?: 'wet' | 'dry'
  estimated_value?: number
  delivery_date?: string
  notes?: string
  status?: BookingStatus
  counter_price?: number
  negotiation_notes?: string

  // For file/image messages
  image_url?: string
  file_url?: string
  file_name?: string
  file_size?: number
  file_type?: string

  // For message features
  pinned?: boolean
  pinned_at?: string
  pinned_by?: string
  recalled?: boolean
  recalled_at?: string
  edited?: boolean
  forwarded_from?: string
}

export interface ChatParticipant {
  id: string
  room_id: string
  user_id: string
  user_type: SenderType
  user_name?: string
  user_avatar?: string
  role: ParticipantRole
  
  is_muted: boolean
  is_blocked: boolean
  
  last_read_at?: string
  unread_count: number
  
  joined_at: string
  left_at?: string
}

// ============================================================================
// DEAL INTERFACES
// ============================================================================

export interface Deal {
  id: string
  deal_number: string
  partner_id: string
  deal_type?: string
  
  // Product
  product_name?: string
  product_code?: string
  quantity_kg: number
  unit_price?: number
  total_amount?: number
  total_value_vnd?: number
  currency: string
  
  // Pricing
  final_price?: number
  exchange_rate?: number
  processing_fee_per_ton?: number
  expected_output_rate?: number
  
  // Terms
  delivery_terms?: string
  warehouse_id?: string
  
  status: DealStatus
  
  // References
  demand_id?: string
  offer_id?: string
  
  // Computed
  partner?: Partner
  
  // Audit
  created_at: string
  updated_at?: string
}

// ============================================================================
// BOOKING (PHIẾU CHỐT MỦ) INTERFACES
// ============================================================================

export interface RubberBooking {
  id: string
  booking_number: string
  partner_id: string
  room_id?: string
  message_id?: string
  
  // Product
  product_type: string
  product_grade?: string
  estimated_quantity_tons: number
  estimated_drc?: number
  
  // Pricing
  agreed_price?: number
  price_unit: 'kg_dry' | 'kg_wet' | 'ton'
  estimated_value?: number
  
  // Delivery
  expected_delivery_date?: string
  pickup_location?: string
  
  // Status
  status: BookingStatus
  negotiation_notes?: string
  
  // Computed
  partner?: Partner
  
  // Audit
  created_by?: string
  confirmed_by?: string
  confirmed_at?: string
  created_at: string
  updated_at?: string
}

// ============================================================================
// INPUT TYPES
// ============================================================================

export interface ChatRoomInput {
  partner_id: string
  deal_id?: string
  room_type?: RoomType
  room_name?: string
}

export interface ChatMessageInput {
  room_id: string
  sender_id: string
  sender_type: SenderType
  content: string
  message_type?: MessageType
  attachments?: Attachment[]
  metadata?: MessageMetadata
  reply_to_id?: string
}

export interface BookingInput {
  partner_id: string
  room_id?: string
  product_type: string
  product_grade?: string
  quantity_tons: number
  drc_percent?: number
  price_per_kg: number
  price_unit: 'wet' | 'dry'
  delivery_date?: string
  notes?: string
}

// ============================================================================
// PAGINATION
// ============================================================================

export interface PaginationParams {
  page?: number
  pageSize?: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

// ============================================================================
// FILTER TYPES
// ============================================================================

export interface ChatRoomFilters {
  partner_id?: string
  room_type?: RoomType
  is_active?: boolean
  has_unread?: boolean
}

export interface MessageFilters {
  room_id: string
  message_type?: MessageType
  sender_type?: SenderType
  before?: string
  after?: string
}

export interface PartnerFilters {
  tier?: PartnerTier
  status?: PartnerStatus
  partner_type?: PartnerType
  search?: string
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

export type ChatUserType = 'factory' | 'partner'

export interface TypingUser {
  id: string
  name: string
  type: ChatUserType
}

// ============================================================================
// COMPOSITE TYPES
// ============================================================================

export type ChatRoomWithPartner = ChatRoom & {
  partner: Partner
  last_message_content?: string
}

export interface SendMessageParams {
  room_id: string
  content: string
  message_type?: MessageType
  metadata?: MessageMetadata
  reply_to_id?: string
}

export type ChatFilters = ChatRoomFilters

// ============================================================================
// CONFIRM DEAL MODAL — Types dùng chung ERP ↔ Portal
// ============================================================================

export interface ConfirmDealFormData {
  // === Phần 1: Thông tin Deal ===
  agreed_price: number
  agreed_quantity_tons: number
  expected_drc: number
  price_unit: 'wet' | 'dry'
  product_type: string
  deal_type?: 'purchase' | 'sale' | 'processing' | 'consignment'
  processing_fee_per_ton?: number
  expected_output_rate?: number
  pickup_location?: string
  delivery_date?: string
  deal_notes?: string

  // === Nhà máy đích (kế thừa từ booking, admin có thể override khi confirm) ===
  target_facility_id?: string
  target_facility_code?: string
  target_facility_name?: string

  // === Phần 2: Tạm ứng (optional, chỉ khi factory confirm) ===
  has_advance: boolean
  advance_amount?: number
  advance_payment_method?: 'cash' | 'bank_transfer'
  advance_receiver_name?: string
  advance_receiver_phone?: string
  advance_notes?: string
}

export interface DealCardMetadata {
  deal_id: string
  deal_number: string
  status: string
  booking_code?: string

  // Denormalized để hiển thị nhanh
  product_type: string
  quantity_kg: number
  expected_drc: number
  agreed_price: number
  price_unit: 'wet' | 'dry'
  estimated_value: number
  pickup_location?: string

  // Nhà máy đích (kế thừa từ booking lúc chốt Deal)
  target_facility_id?: string
  target_facility_code?: string
  target_facility_name?: string

  // Tài chính
  total_advanced: number
  balance_due: number

  // Live progress — cập nhật từ dealWmsService / qcService khi có event
  stock_in_count?: number
  actual_weight_kg?: number
  actual_drc?: number
  qc_status?: 'pending' | 'passed' | 'warning' | 'failed'
  final_value?: number
  settlement_id?: string
  settlement_code?: string
  cancel_reason?: string

  // Partner-side state
  // ID của advance mới nhất chưa được partner ack (để hiện nút "Đã nhận")
  pending_ack_advance_id?: string
  pending_ack_advance_number?: string
  pending_ack_advance_amount?: number
  // Active dispute info (nếu có, partner/factory đều thấy)
  active_dispute_id?: string
  active_dispute_status?: 'open' | 'investigating'
}

export interface ConfirmDealResult {
  deal: {
    id: string
    deal_number: string
    status: string
    estimated_value: number
  }
  advance?: {
    id: string
    advance_number: string
    amount: number
  }
  ledgerEntry?: {
    id: string
    credit: number
  }
}