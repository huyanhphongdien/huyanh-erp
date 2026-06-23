// ============================================================================
// Quyền xem Module TÀI CHÍNH — 3 nhóm: Admin / Ban giám đốc / Phòng kế toán.
// PHẢI KHỚP hàm SQL fn_is_finance_user() trong finance_rls_roles_v1.sql
// (UI gate + DB RLS đồng bộ, tránh "thấy menu nhưng 403" hoặc ngược lại).
// ============================================================================
import type { User } from '../types'

const FINANCE_EMAILS = ['minhld@huyanhrubber.com', 'yendt@huyanhrubber.com', 'phulv@huyanhrubber.com']
const ADMIN_EMAILS = ['minhld@huyanhrubber.com']

// ⚠ TẠM THỜI (đang test): CHỈ Admin (minhld) thấy Tài chính.
// Khi test xong → đổi FINANCE_OPEN = true để mở cho Ban giám đốc + Phòng kế toán.
const FINANCE_OPEN = false

export function isFinanceUser(user?: User | null): boolean {
  if (!user) return false
  const email = (user.email || '').toLowerCase()
  const isAdmin = user.role === 'admin' || ADMIN_EMAILS.includes(email)
  if (!FINANCE_OPEN) return isAdmin          // tạm thời: chỉ Admin

  const level = user.position_level ?? 99    // BGĐ: Giám đốc/Trợ lý/Phó GĐ = level <= 3
  const code = (user.department_code || '').toUpperCase()
  const dept = String(user.department_name || '').toLowerCase()
  return isAdmin
    || FINANCE_EMAILS.includes(email)        // kế toán hiện hữu (email)
    || level <= 3                            // Ban giám đốc
    || code === 'HAP-KT'                     // Phòng Kế toán (theo mã)
    || dept.includes('kế toán')              // fallback theo tên
}
