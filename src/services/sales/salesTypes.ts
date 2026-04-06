// ============================================================================
// SALES ORDER TYPES — src/services/sales/salesTypes.ts
// Module Quản lý Đơn hàng Bán quốc tế - Huy Anh Rubber ERP
// Primary color: #1B4D3E
// ============================================================================

// ===== SHARED ENUMS & TYPES =====

export type CustomerStatus = 'active' | 'inactive' | 'blacklisted'
export type CustomerTier = 'standard' | 'premium' | 'strategic'
export type PaymentTerms = 'LC_30' | 'LC_60' | 'LC_90' | 'TT_30' | 'TT_60' | 'CAD' | 'DP'
export type Incoterm = 'FOB' | 'CIF' | 'CNF' | 'DDP' | 'EXW'
export type QualityStandard = 'TCVN_3769' | 'ISO_2000' | 'CUSTOM'
export type PackingType = 'bale' | 'pallet' | 'bulk'
export type ContainerType = '20ft' | '40ft'
export type SalesCurrency = 'USD' | 'EUR' | 'JPY' | 'CNY'

export type SalesOrderStatus = 'draft' | 'confirmed' | 'producing' | 'ready' | 'packing' | 'shipped' | 'delivered' | 'invoiced' | 'paid' | 'cancelled'
export type ContainerStatus = 'planning' | 'packing' | 'sealed' | 'shipped'
export type InvoiceStatus = 'draft' | 'issued' | 'sent' | 'paid' | 'cancelled'
export type PaymentStatus = 'unpaid' | 'partial' | 'paid'

// ===== KHÁCH HÀNG QUỐC TẾ (sales_customers) =====

export interface SalesCustomer {
  id: string
  code: string
  name: string
  short_name?: string
  country?: string
  region?: string
  contact_person?: string
  email?: string
  phone?: string
  address?: string
  payment_terms?: PaymentTerms
  default_incoterm: Incoterm
  default_currency: string
  credit_limit?: number
  quality_standard: QualityStandard
  custom_specs?: Record<string, unknown>
  preferred_grades?: string[]
  requires_pre_shipment_sample: boolean
  status: CustomerStatus
  tier: CustomerTier
  notes?: string
  created_by?: string
  created_at: string
  updated_at: string

  // Computed / joined
  order_count?: number
}

export interface CreateCustomerData {
  name: string
  short_name?: string
  country?: string
  region?: string
  contact_person?: string
  email?: string
  phone?: string
  address?: string
  payment_terms?: PaymentTerms
  default_incoterm?: Incoterm
  default_currency?: string
  credit_limit?: number
  quality_standard?: QualityStandard
  custom_specs?: Record<string, unknown>
  preferred_grades?: string[]
  requires_pre_shipment_sample?: boolean
  status?: CustomerStatus
  tier?: CustomerTier
  notes?: string
}

// ===== ĐƠN HÀNG BÁN (sales_orders) =====

export interface SalesOrder {
  id: string
  code: string
  customer_id: string
  customer_po?: string
  grade: string
  quantity_tons: number
  quantity_kg?: number
  unit_price: number
  currency: string
  exchange_rate?: number
  total_value_usd?: number
  total_value_vnd?: number
  incoterm: Incoterm
  port_of_loading?: string
  port_of_destination?: string

  // Chỉ tiêu kỹ thuật
  drc_min?: number
  drc_max?: number
  moisture_max?: number
  dirt_max?: number
  ash_max?: number
  nitrogen_max?: number
  volatile_max?: number
  pri_min?: number
  mooney_max?: number
  color_lovibond_max?: number

  // Đóng gói
  packing_type: PackingType
  bale_weight_kg: number
  total_bales?: number
  shrink_wrap: boolean
  pallet_required: boolean
  marking_instructions?: string

  // Vận chuyển
  container_type?: ContainerType
  container_count?: number
  shipping_line?: string
  vessel_name?: string
  booking_reference?: string
  bl_number?: string

  // Ngày tháng
  order_date: string
  delivery_date?: string
  etd?: string
  eta?: string

  // Thanh toán
  payment_terms?: PaymentTerms
  lc_number?: string
  lc_bank?: string
  lc_expiry_date?: string

  // Trạng thái
  status: SalesOrderStatus
  production_order_id?: string
  stock_out_id?: string

  // Chứng từ
  coa_generated: boolean
  packing_list_generated: boolean
  invoice_generated: boolean
  bl_received: boolean

  // Hợp đồng (v4)
  contract_no?: string
  contract_date?: string
  commission_pct?: number
  commission_amount?: number
  bank_account?: string
  bank_swift?: string
  bales_per_container?: number
  pallets_per_container?: number
  bales_per_pallet?: number

  // Sản xuất (v4)
  ready_date?: string

  // Vận chuyển mở rộng (v4)
  voyage_number?: string
  bl_type?: string
  cutoff_date?: string
  customs_declaration_no?: string
  customs_declaration_date?: string
  customs_clearance_status?: string
  discount_date?: string
  discount_amount?: number
  discount_bank?: string
  discount_exchange_rate?: number
  dhl_number?: string

  // Tài chính (v4)
  remaining_amount?: number
  net_revenue?: number
  payment_received_date?: string
  payment_status?: string
  actual_payment_amount?: number
  bank_charges?: number
  bank_name?: string
  lc_amount?: number

  // Khóa (v4)
  is_locked?: boolean
  locked_at?: string
  locked_by?: string

  // Ghi chú
  notes?: string
  internal_notes?: string

  // Audit
  created_by?: string
  confirmed_by?: string
  confirmed_at?: string
  shipped_at?: string
  created_at: string
  updated_at: string

  // Joined
  customer?: Pick<SalesCustomer, 'id' | 'code' | 'name' | 'short_name' | 'country' | 'tier'>
}

// ===== CONTAINER TRONG ĐƠN HÀNG (sales_order_containers) =====

export interface SalesOrderContainer {
  id: string
  sales_order_id: string
  container_no?: string
  seal_no?: string
  container_type?: ContainerType
  gross_weight_kg?: number
  tare_weight_kg?: number
  net_weight_kg?: number
  bale_count?: number
  status: ContainerStatus
  packed_at?: string
  sealed_at?: string
  notes?: string
  created_at: string

  // Joined
  items?: SalesOrderContainerItem[]
}

// ===== BÀNH TRONG CONTAINER (sales_order_container_items) =====

export interface SalesOrderContainerItem {
  id: string
  container_id: string
  batch_id?: string
  batch_no?: string
  bale_from?: number
  bale_to?: number
  bale_count?: number
  weight_kg?: number
  grade?: string
  drc?: number
  created_at: string
}

// ===== HÓA ĐƠN BÁN HÀNG (sales_invoices) =====

export interface SalesInvoice {
  id: string
  code: string
  sales_order_id?: string
  customer_id: string
  subtotal?: number
  freight_charge: number
  insurance_charge: number
  total_amount?: number
  currency: string
  exchange_rate?: number
  total_vnd?: number
  payment_terms?: PaymentTerms
  due_date?: string
  paid_amount: number
  payment_status: PaymentStatus
  invoice_date?: string
  bl_number?: string
  bl_date?: string
  status: InvoiceStatus
  notes?: string
  created_by?: string
  created_at: string
  updated_at: string

  // Joined
  customer?: Pick<SalesCustomer, 'id' | 'code' | 'name' | 'short_name' | 'country'>
  sales_order?: Pick<SalesOrder, 'id' | 'code' | 'grade' | 'quantity_tons'>
}

// ===== PAGINATION =====

export interface SalesCustomerListParams {
  page?: number
  pageSize?: number
  search?: string
  status?: CustomerStatus | 'all'
  tier?: CustomerTier | 'all'
  country?: string
  sort_by?: string
  sort_order?: 'asc' | 'desc'
}

export interface SalesPaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface CustomerStats {
  total: number
  active: number
  premium: number
  strategic: number
}

// ===== CONSTANTS — Nhãn tiếng Việt =====

// -- Trạng thái đơn hàng --
export const ORDER_STATUS_LABELS: Record<SalesOrderStatus, string> = {
  draft: 'Nháp',
  confirmed: 'Đã xác nhận',
  producing: 'Đang sản xuất',
  ready: 'Sẵn sàng',
  packing: 'Đóng gói',
  shipped: 'Đã xuất',
  delivered: 'Đã giao',
  invoiced: 'Đã lập HĐ',
  paid: 'Đã thanh toán',
  cancelled: 'Đã hủy',
}

// Ant Design Tag colors — primary brand: #1B4D3E
export const ORDER_STATUS_COLORS: Record<SalesOrderStatus, string> = {
  draft: 'default',
  confirmed: 'blue',
  producing: 'orange',
  ready: 'cyan',
  packing: 'purple',
  shipped: 'geekblue',
  delivered: 'green',
  invoiced: 'gold',
  paid: 'success',
  cancelled: 'error',
}

// -- Hạng khách hàng --
export const CUSTOMER_TIER_LABELS: Record<CustomerTier, string> = {
  standard: 'Tiêu chuẩn',
  premium: 'Cao cấp',
  strategic: 'Chiến lược',
}

export const CUSTOMER_TIER_COLORS: Record<CustomerTier, string> = {
  standard: 'default',
  premium: 'gold',
  strategic: 'purple',
}

// -- Trạng thái khách hàng --
export const CUSTOMER_STATUS_LABELS: Record<CustomerStatus, string> = {
  active: 'Hoạt động',
  inactive: 'Ngừng HĐ',
  blacklisted: 'Cấm GD',
}

export const CUSTOMER_STATUS_COLORS: Record<CustomerStatus, string> = {
  active: 'green',
  inactive: 'default',
  blacklisted: 'error',
}

// -- Incoterm --
export const INCOTERM_LABELS: Record<Incoterm, string> = {
  FOB: 'FOB — Giao lên tàu',
  CIF: 'CIF — Tiền hàng, bảo hiểm, cước',
  CNF: 'CNF — Tiền hàng và cước',
  DDP: 'DDP — Giao hàng đã thông quan',
  EXW: 'EXW — Giao tại xưởng',
}

// -- Điều khoản thanh toán --
export const PAYMENT_TERMS_LABELS: Record<PaymentTerms, string> = {
  LC_30: 'L/C trả chậm 30 ngày',
  LC_60: 'L/C trả chậm 60 ngày',
  LC_90: 'L/C trả chậm 90 ngày',
  TT_30: 'T/T trả trước 30%',
  TT_60: 'T/T trả trước 60%',
  CAD: 'CAD — Nhờ thu kèm chứng từ',
  DP: 'D/P — Trả tiền đổi chứng từ',
}

// -- Điều khoản thanh toán mở rộng (dạng string key) --
export const PAYMENT_TERMS_EXTENDED_LABELS: Record<string, string> = {
  dp: 'DP (Documents against Payment)',
  dp_at_sight: 'DP trả ngay',
  tt_100: 'TT 100%',
  tt_scan: 'TT 100% via scan docs',
  tt_before_etd: 'TT 100% trước ETD',
  lc_at_sight: 'L/C trả ngay',
  lc_30_days: 'L/C 30 ngày',
  lc_90_days: 'L/C 90 ngày',
  deposit_10_dp_90: '10% cọc + 90% DP',
  deposit_20_dp_80: '20% DP + 80% CAD',
  tt_10_dp_90: '10% TT + 90% DP',
  tt_30_70: 'TT 30% + 70%',
  advance_100: 'Đặt cọc 100%',
}

// -- Trạng thái container --
export const CONTAINER_STATUS_LABELS: Record<ContainerStatus, string> = {
  planning: 'Đang lên kế hoạch',
  packing: 'Đang đóng hàng',
  sealed: 'Đã niêm phong',
  shipped: 'Đã xuất',
}

export const CONTAINER_STATUS_COLORS: Record<ContainerStatus, string> = {
  planning: 'default',
  packing: 'orange',
  sealed: 'blue',
  shipped: 'green',
}

// -- Loại đóng gói --
export const PACKING_TYPE_LABELS: Record<PackingType, string> = {
  bale: 'Bành (Bale)',
  pallet: 'Pallet',
  bulk: 'Rời (Bulk)',
}

// -- Trạng thái hóa đơn --
export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: 'Nháp',
  issued: 'Đã phát hành',
  sent: 'Đã gửi',
  paid: 'Đã thanh toán',
  cancelled: 'Đã hủy',
}

export const INVOICE_STATUS_COLORS: Record<InvoiceStatus, string> = {
  draft: 'default',
  issued: 'blue',
  sent: 'geekblue',
  paid: 'success',
  cancelled: 'error',
}

// -- Trạng thái thanh toán --
export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  unpaid: 'Chưa thanh toán',
  partial: 'Thanh toán một phần',
  paid: 'Đã thanh toán đủ',
}

export const PAYMENT_STATUS_COLORS: Record<PaymentStatus, string> = {
  unpaid: 'error',
  partial: 'warning',
  paid: 'success',
}

// -- Tiêu chuẩn chất lượng --
export const QUALITY_STANDARD_LABELS: Record<QualityStandard, string> = {
  TCVN_3769: 'TCVN 3769 — Tiêu chuẩn Việt Nam',
  ISO_2000: 'ISO 2000 — Tiêu chuẩn quốc tế',
  CUSTOM: 'Theo yêu cầu khách hàng',
}

// -- Container type --
export const CONTAINER_TYPE_LABELS: Record<ContainerType, string> = {
  '20ft': 'Container 20 feet',
  '40ft': 'Container 40 feet',
}

// ===== SELECT OPTIONS =====

// Cấp mủ SVR phổ biến (Standard Vietnamese Rubber)
export const SVR_GRADE_OPTIONS = [
  { value: 'SVR_3L', label: 'SVR 3L' },
  { value: 'SVR_L', label: 'SVR L' },
  { value: 'SVR_5', label: 'SVR 5' },
  { value: 'SVR_10', label: 'SVR 10' },
  { value: 'SVR_20', label: 'SVR 20' },
  { value: 'SVR_CV50', label: 'SVR CV50' },
  { value: 'SVR_CV60', label: 'SVR CV60' },
  { value: 'RSS_1', label: 'RSS 1' },
  { value: 'RSS_3', label: 'RSS 3' },
  { value: 'LATEX_60', label: 'Latex HA 60%' },
] as const

// Quốc gia mua mủ phổ biến
export const COUNTRY_OPTIONS = [
  { value: 'JP', label: 'Nhật Bản' },
  { value: 'CN', label: 'Trung Quốc' },
  { value: 'IN', label: 'Ấn Độ' },
  { value: 'DE', label: 'Đức' },
  { value: 'US', label: 'Hoa Kỳ' },
  { value: 'MY', label: 'Malaysia' },
  { value: 'KR', label: 'Hàn Quốc' },
  { value: 'TW', label: 'Đài Loan' },
  { value: 'TR', label: 'Thổ Nhĩ Kỳ' },
  { value: 'BR', label: 'Brazil' },
  { value: 'IT', label: 'Ý' },
  { value: 'FR', label: 'Pháp' },
  { value: 'ES', label: 'Tây Ban Nha' },
  { value: 'TH', label: 'Thái Lan' },
  { value: 'ID', label: 'Indonesia' },
  { value: 'RU', label: 'Nga' },
  { value: 'PK', label: 'Pakistan' },
  { value: 'BD', label: 'Bangladesh' },
  { value: 'EG', label: 'Ai Cập' },
  { value: 'OTHER', label: 'Khác' },
] as const

// Ngân hàng nhận tiền
export const BANK_OPTIONS = [
  { value: 'VCB', label: 'Vietcombank — NH TMCP Ngoại thương VN' },
  { value: 'BIDV', label: 'BIDV — NH Đầu tư & Phát triển VN' },
  { value: 'VTB', label: 'VietinBank — NH Công thương VN' },
  { value: 'ACB', label: 'ACB — NH Á Châu' },
  { value: 'MB', label: 'MBBank — NH Quân đội' },
  { value: 'TCB', label: 'Techcombank — NH Kỹ thương VN' },
  { value: 'SHB', label: 'SHB — NH Sài Gòn — Hà Nội' },
  { value: 'OTHER', label: 'Khác' },
] as const

// Cảng xếp hàng tại Việt Nam
export const PORT_OF_LOADING_OPTIONS = [
  { value: 'HCM_CAT_LAI', label: 'Cát Lái — TP.HCM' },
  { value: 'HCM_HIEP_PHUOC', label: 'Hiệp Phước — TP.HCM' },
  { value: 'VUNG_TAU', label: 'Cái Mép — Vũng Tàu' },
  { value: 'QUY_NHON', label: 'Quy Nhơn' },
  { value: 'DA_NANG', label: 'Đà Nẵng' },
  { value: 'HAI_PHONG', label: 'Hải Phòng' },
] as const

// (BANK_OPTIONS đã khai báo ở trên)

// -- Cấp sản phẩm mở rộng (bao gồm SVR, RSS, SBR, Compound) --
export const PRODUCT_GRADE_OPTIONS = [
  { value: 'SVR_3L', label: 'SVR 3L' },
  { value: 'SVR_5', label: 'SVR 5' },
  { value: 'SVR_10', label: 'SVR 10' },
  { value: 'SVR_20', label: 'SVR 20' },
  { value: 'SVR_CV60', label: 'SVR CV60' },
  { value: 'RSS1', label: 'RSS 1' },
  { value: 'RSS3', label: 'RSS 3' },
  { value: 'SBR1502', label: 'SBR 1502' },
  { value: 'COMPOUND', label: 'Compound' },
] as const
