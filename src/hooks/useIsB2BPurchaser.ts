// ============================================================================
// useIsB2BPurchaser — Hook detect user có phải B2B Thu Mua không
// File: src/hooks/useIsB2BPurchaser.ts
// ============================================================================
//
// Email allowlist sync với Sidebar.tsx — đảm bảo single source of truth.
// Dùng cho các component cần render conditional UI (vd B2BSectionTabs ở
// WeighbridgeListPage chỉ show khi user là B2B purchaser).
// ============================================================================

import { useAuthStore } from '../stores/authStore'

const B2B_PURCHASER_EMAILS = new Set([
  'khuyennt@huyanhrubber.com',
  'duyhh@huyanhrubber.com',
  'minhld@huyanhrubber.com',
  'trunglxh@huyanhrubber.com',
])

const ADMIN_EMAILS = new Set([
  'minhld@huyanhrubber.com',
])

export function useIsB2BPurchaser(): boolean {
  const user = useAuthStore((s) => s.user)
  if (!user?.email) return false
  const email = user.email.toLowerCase()
  if (B2B_PURCHASER_EMAILS.has(email)) return true
  // Admin (minhld) cũng được — sync với Sidebar logic
  if (user.role === 'admin' || ADMIN_EMAILS.has(email)) return true
  return false
}
