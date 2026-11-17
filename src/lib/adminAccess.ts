// ============================================================================
// Admin hệ thống — MỘT nguồn cho menu (Sidebar), Nhật ký hệ thống (/admin/audit-log) và Module Tài chính
// (financeAccess). Admin = role 'admin' (authStore.determineUserRole đọc user_metadata) HOẶC email trong danh sách.
// Trước 17/11/2026 danh sách email chép tay ở 3 file — thêm/bớt admin giờ chỉ sửa ĐÚNG mảng dưới.
// ⚠ Hàm SQL fn_is_finance_admin() / fn_is_finance_user() ở DB có danh sách email riêng — đổi ở đây nhớ đổi cả DB.
// File: src/lib/adminAccess.ts
// ============================================================================
import type { User } from '../types'

export const ADMIN_EMAILS: readonly string[] = ['minhld@huyanhrubber.com']

/** Admin: role 'admin' hoặc email nằm trong ADMIN_EMAILS (không phân biệt hoa thường). */
export function isAdminUser(user?: Pick<User, 'role' | 'email'> | null): boolean {
  if (!user) return false
  return user.role === 'admin' || ADMIN_EMAILS.includes((user.email || '').toLowerCase())
}
