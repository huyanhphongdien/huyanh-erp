import { supabase } from '../../lib/supabase'

export type SalesRole = 'sale' | 'production' | 'logistics' | 'accounting' | 'admin'

// Mapping phòng ban → role
const DEPT_ROLE_MAP: Record<string, SalesRole> = {
  'Ban Giám đốc': 'admin',
  'Phòng Kinh doanh': 'sale',
  'Phòng Xuất nhập khẩu': 'logistics',
  'Phòng XNK': 'logistics',
  'Phòng Kế toán': 'accounting',
  'Phòng Tài chính': 'accounting',
  'Phòng Sản xuất': 'production',
  'Phòng QC': 'production',
  'Phòng Cơ Điện': 'production',
  'Phòng R&D': 'production',
  'Phòng QLSX': 'production',
}

const ADMIN_EMAILS = ['minhld@huyanhrubber.com']

export function getSalesRole(user: any): SalesRole {
  if (!user) return 'sale'
  if (ADMIN_EMAILS.includes(user.email?.toLowerCase())) return 'admin'
  if (user.role === 'admin') return 'admin'

  const dept = user.department_name || user.department?.name || ''
  for (const [deptName, role] of Object.entries(DEPT_ROLE_MAP)) {
    if (dept.toLowerCase().includes(deptName.toLowerCase())) return role
  }
  return 'sale' // mặc định
}

export const SALES_ROLE_LABELS: Record<SalesRole, string> = {
  sale: 'Kinh doanh',
  production: 'Sản xuất',
  logistics: 'Xuất nhập khẩu',
  accounting: 'Kế toán',
  admin: 'Quản trị',
}

// Permission checks — field level
export const salesPermissions = {
  // Khách hàng
  canCreateCustomer: (role: SalesRole) => ['sale', 'admin'].includes(role),
  canEditCustomer: (role: SalesRole) => ['sale', 'admin'].includes(role),
  canViewCustomer: (role: SalesRole) => ['sale', 'accounting', 'admin'].includes(role),

  // Đơn hàng - tạo/sửa thông tin chung
  canCreateOrder: (role: SalesRole) => ['sale', 'admin'].includes(role),
  canEditOrder: (role: SalesRole) => ['sale', 'admin'].includes(role),
  canCancelOrder: (role: SalesRole) => ['sale', 'admin'].includes(role),
  canViewOrder: (_role: SalesRole) => true, // ai cũng xem được

  // Tab Sản xuất
  canEditProduction: (role: SalesRole) => ['production', 'admin'].includes(role),
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
  canCreateInvoice: (role: SalesRole) => ['accounting', 'admin'].includes(role),
  canViewDocs: (role: SalesRole) => ['sale', 'logistics', 'accounting', 'admin'].includes(role),

  // Tab Tài chính (MỚI)
  canViewFinance: (role: SalesRole) => ['accounting', 'admin'].includes(role),
  canEditFinance: (role: SalesRole) => ['accounting', 'admin'].includes(role),
  canEditLC: (role: SalesRole) => ['accounting', 'admin'].includes(role),
  canEditPayment: (role: SalesRole) => ['accounting', 'admin'].includes(role),
  canEditDiscount: (role: SalesRole) => ['accounting', 'admin'].includes(role),
  canEditCommission: (role: SalesRole) => ['accounting', 'admin'].includes(role),

  // Shipment Following
  canEditShipmentLogistics: (role: SalesRole) => ['logistics', 'admin'].includes(role),
  canEditShipmentFinance: (role: SalesRole) => ['accounting', 'admin'].includes(role),

  // Executive Dashboard
  canViewExecutive: (role: SalesRole) => role === 'admin',

  // Dashboard
  canViewDashboard: (role: SalesRole) => ['sale', 'logistics', 'accounting', 'admin'].includes(role),
}

// Check if specific tab should be visible for role
export function getVisibleTabs(role: SalesRole): string[] {
  const tabs = ['info', 'quality'] // ai cũng thấy

  if (salesPermissions.canViewProduction(role)) tabs.push('production')
  if (['logistics', 'sale', 'admin'].includes(role)) tabs.push('packing')
  if (salesPermissions.canViewDocs(role)) tabs.push('documents')
  if (salesPermissions.canViewFinance(role)) tabs.push('finance')

  return tabs
}

// Check if field is editable for role
export function isFieldEditable(role: SalesRole, fieldGroup: string): boolean {
  switch (fieldGroup) {
    case 'customer': return salesPermissions.canEditCustomer(role)
    case 'order_info': return salesPermissions.canEditOrder(role)
    case 'quality': return salesPermissions.canEditOrder(role)
    case 'production': return salesPermissions.canEditProduction(role)
    case 'booking': return salesPermissions.canEditBooking(role)
    case 'container': return salesPermissions.canEditContainer(role)
    case 'bl_dhl': return salesPermissions.canEditBL(role)
    case 'coa_pl': return salesPermissions.canCreateCOA(role)
    case 'invoice': return salesPermissions.canCreateInvoice(role)
    case 'finance': return salesPermissions.canEditFinance(role)
    default: return role === 'admin'
  }
}
