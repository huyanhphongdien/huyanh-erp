// ============================================================================
// B2B SHARED CONSTANTS — Labels + Colors không phụ thuộc service
// File: src/types/b2b.constants.ts
//
// Tách khỏi các *Service.ts để component (DealCard, BookingCard, ...) có thể
// import mà không kéo theo supabase + query layer. Giúp portable sang repo
// b2b-portal (đại lý) khi copy component qua.
// ============================================================================

export type DealStatus = 'pending' | 'processing' | 'accepted' | 'settled' | 'cancelled'
export type DealType = 'purchase' | 'sale' | 'processing' | 'consignment'

export const DEAL_STATUS_LABELS: Record<DealStatus, string> = {
  pending: 'Chờ xử lý',
  processing: 'Đang xử lý',
  accepted: 'Đã duyệt',
  settled: 'Đã quyết toán',
  cancelled: 'Đã hủy',
}

export const DEAL_STATUS_COLORS: Record<DealStatus, string> = {
  pending: 'orange',
  processing: 'blue',
  accepted: 'green',
  settled: 'purple',
  cancelled: 'default',
}

export const DEAL_TYPE_LABELS: Record<DealType, string> = {
  purchase: 'Mua hàng',
  sale: 'Bán hàng',
  processing: 'Gia công',
  consignment: 'Ký gửi',
}

export const DEAL_TYPE_COLORS: Record<DealType, string> = {
  purchase: 'cyan',
  sale: 'green',
  processing: 'orange',
  consignment: 'purple',
}

// Label cho loại mủ — dùng ở BookingCard + DealCard
export const PRODUCT_TYPE_LABELS: Record<string, string> = {
  mu_nuoc: 'Mủ nước',
  mu_tap: 'Mủ tạp',
  mu_dong: 'Mủ đông',
  mu_chen: 'Mủ chén',
  mu_to: 'Mủ tờ',
}

// Gradient background theo status — trực quan hóa lifecycle deal
export const DEAL_STATUS_GRADIENT: Record<DealStatus, string> = {
  pending:    'linear-gradient(135deg, #f59e0b 0%, #f97316 100%)',
  processing: 'linear-gradient(135deg, #0ea5e9 0%, #6366f1 100%)',
  accepted:   'linear-gradient(135deg, #10b981 0%, #059669 100%)',
  settled:    'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
  cancelled:  'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)',
}
