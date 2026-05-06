export type SalesRole = 'sale' | 'production' | 'logistics' | 'accounting' | 'admin'

// ★ Phân quyền email cụ thể cho module Đơn hàng bán
const SALES_EMAIL_ROLE_MAP: Record<string, SalesRole> = {
  // Sale
  'sales@huyanhrubber.com': 'sale',
  // Production
  'trunglxh@huyanhrubber.com': 'production',
  'nhanlt@huyanhrubber.com': 'production',
  // Mua mủ NVL (raw_material) — owner stage 'raw_material', cấp quyền production để
  // edit tab Sản xuất + xem Sales module (2026-05-05)
  'tannv@huyanhrubber.com': 'production',
  // Logistics (Xuất nhập khẩu) — quyền edit Booking / Container / Shipping only
  'logistics@huyanhrubber.com': 'logistics',
  'anhlp@huyanhrubber.com': 'logistics',
  'nhungnt@huyanhrubber.com': 'logistics',  // Trương Thị Nhung — TP Logistics (2026-05-05)
  // Accounting
  'yendt@huyanhrubber.com': 'accounting',
  'phulv@huyanhrubber.com': 'accounting',
  // Admin
  'minhld@huyanhrubber.com': 'admin',
  'thuyht@huyanhrubber.com': 'admin',
  'huylv@huyanhrubber.com': 'admin',
}

export function getSalesRole(user: any): SalesRole | null {
  if (!user?.email) return null
  const email = user.email.toLowerCase()
  return SALES_EMAIL_ROLE_MAP[email] || null
}

/** Kiểm tra user có quyền truy cập module Sales không */
export function hasSalesAccess(user: any): boolean {
  return getSalesRole(user) !== null
}

export const SALES_ROLE_LABELS: Record<SalesRole, string> = {
  sale: 'Kinh doanh',
  production: 'Sản xuất',
  logistics: 'Xuất nhập khẩu',
  accounting: 'Kế toán',
  admin: 'Quản trị',
}

// Permission checks — field level
// NOTE: Logistics được treat như admin — full quyền mọi khu vực trong module Sales.
export const salesPermissions = {
  // Khách hàng
  canCreateCustomer: (role: SalesRole) => ['sale', 'logistics', 'admin'].includes(role),
  canEditCustomer: (role: SalesRole) => ['sale', 'logistics', 'admin'].includes(role),
  canViewCustomer: (role: SalesRole) => ['sale', 'logistics', 'accounting', 'admin'].includes(role),

  // Đơn hàng - tạo/sửa thông tin chung
  canCreateOrder: (role: SalesRole) => ['sale', 'logistics', 'admin'].includes(role),
  canEditOrder: (role: SalesRole) => ['sale', 'logistics', 'admin'].includes(role),
  canCancelOrder: (role: SalesRole) => ['sale', 'logistics', 'admin'].includes(role),
  canViewOrder: (_role: SalesRole) => true, // ai cũng xem được

  // Tab Sản xuất
  canEditProduction: (role: SalesRole) => ['production', 'logistics', 'admin'].includes(role),
  canViewProduction: (role: SalesRole) => ['sale', 'production', 'logistics', 'admin'].includes(role),

  // Tab Đóng gói + Logistics
  canEditBooking: (role: SalesRole) => ['logistics', 'admin'].includes(role),
  canEditContainer: (role: SalesRole) => ['logistics', 'admin'].includes(role),
  canEditBL: (role: SalesRole) => ['logistics', 'admin'].includes(role),
  canEditDHL: (role: SalesRole) => ['logistics', 'admin'].includes(role),
  canEditETD: (role: SalesRole) => ['logistics', 'admin'].includes(role),

  // Tab Chứng từ
  canCreateCOA: (role: SalesRole) => ['logistics', 'admin'].includes(role),
  canCreatePL: (role: SalesRole) => ['logistics', 'admin'].includes(role),
  canCreateInvoice: (role: SalesRole) => ['accounting', 'logistics', 'admin'].includes(role),
  canViewDocs: (role: SalesRole) => ['sale', 'logistics', 'accounting', 'admin'].includes(role),

  // Tab Tài chính (MỚI)
  canViewFinance: (role: SalesRole) => ['accounting', 'logistics', 'admin'].includes(role),
  canEditFinance: (role: SalesRole) => ['accounting', 'logistics', 'admin'].includes(role),
  canEditLC: (role: SalesRole) => ['accounting', 'logistics', 'admin'].includes(role),
  canEditPayment: (role: SalesRole) => ['accounting', 'logistics', 'admin'].includes(role),
  canEditDiscount: (role: SalesRole) => ['accounting', 'logistics', 'admin'].includes(role),
  canEditCommission: (role: SalesRole) => ['accounting', 'logistics', 'admin'].includes(role),

  // Shipment Following
  canEditShipmentLogistics: (role: SalesRole) => ['logistics', 'admin'].includes(role),
  canEditShipmentFinance: (role: SalesRole) => ['accounting', 'logistics', 'admin'].includes(role),

  // Executive Dashboard
  canViewExecutive: (role: SalesRole) => ['logistics', 'admin'].includes(role),

  // Dashboard
  canViewDashboard: (role: SalesRole) => ['sale', 'logistics', 'accounting', 'admin'].includes(role),
}

// ★ v4: Tabs cho detail panel
export function getVisibleTabs(role: SalesRole | null): string[] {
  if (!role) return ['contract']
  const tabs = ['contract'] // ai cũng thấy tab HĐ

  if (['production', 'sale', 'logistics', 'admin'].includes(role)) tabs.push('production')
  if (['logistics', 'sale', 'accounting', 'admin'].includes(role)) tabs.push('shipping')
  // tabs.push('documents') // tạm ẩn tab chứng từ
  if (salesPermissions.canViewFinance(role)) tabs.push('finance')

  return tabs
}

// ★ v4: Tab nào editable theo status + role
export type SalesOrderStatus = 'draft' | 'confirmed' | 'producing' | 'ready' | 'packing' | 'shipped' | 'delivered' | 'invoiced' | 'paid' | 'cancelled'

export function isTabEditable(role: SalesRole | null, tab: string, status: SalesOrderStatus, isLocked: boolean): boolean {
  if (!role) return false
  if (role === 'admin' || role === 'logistics') return true // Admin + Logistics full quyền mọi tab

  switch (tab) {
    case 'contract':
      // Sale sửa khi Draft + chưa khóa
      return role === 'sale' && status === 'draft' && !isLocked

    case 'production':
      // SX sửa khi Confirmed → Packing
      return role === 'production' && ['confirmed', 'producing', 'ready', 'packing'].includes(status)

    case 'shipping':
      // (đã cover ở early return)
      return false

    case 'finance':
      // KT sửa khi Confirmed → Paid (kế toán cần điền tỷ giá, đặt cọc, NH nhận
      // ngay từ lúc đơn được xác nhận, không đợi tới shipped vì khách thường
      // chuyển cọc trước khi hàng giao). Khóa khi draft/cancelled.
      return role === 'accounting' && !['draft', 'cancelled'].includes(status)

    default:
      return false
  }
}

// ★ v4: Kiểm tra field cụ thể — tỷ giá CK do KT nhập nhưng hiện ở tab LOG
export function isFieldEditableV4(role: SalesRole | null, field: string): boolean {
  if (!role) return false
  if (role === 'admin' || role === 'logistics') return true // Admin + Logistics full quyền mọi field

  // Tỷ giá CK: chỉ KT nhập
  if (field === 'discount_exchange_rate') return role === 'accounting'
  // Tỷ giá USD/VND: chỉ KT nhập
  if (field === 'exchange_rate') return role === 'accounting'

  return false
}

// Check if field is editable for role (legacy — giữ tương thích)
export function isFieldEditable(role: SalesRole | null, fieldGroup: string): boolean {
  if (!role) return false
  if (role === 'admin' || role === 'logistics') return true // Admin + Logistics full quyền
  switch (fieldGroup) {
    case 'customer': return salesPermissions.canEditCustomer(role)
    case 'order_info': return salesPermissions.canEditOrder(role)
    case 'quality': return salesPermissions.canEditOrder(role)
    case 'production': return salesPermissions.canEditProduction(role)
    case 'booking': return salesPermissions.canEditBooking(role)
    case 'container': return ['production', 'admin'].includes(role) // v4: SX quản lý container
    case 'bl_dhl': return salesPermissions.canEditBL(role)
    case 'coa_pl': return salesPermissions.canCreateCOA(role)
    case 'invoice': return salesPermissions.canCreateInvoice(role)
    case 'finance': return salesPermissions.canEditFinance(role)
    default: return false
  }
}
