// ============================================================================
// RUBBER PROCUREMENT TYPES — src/services/rubber/rubber.types.ts
// Module Thu mua Mủ Cao su - Huy Anh Rubber ERP
// Ngày: 12/02/2026 — V2 FIX theo schema thật
// Phase 3.6 — Bước 3.6.3
// ============================================================================

// ===== SHARED ENUMS & TYPES =====

export type RubberSourceType = 'vietnam' | 'lao_direct' | 'lao_agent'
export type RubberCurrency = 'VND' | 'LAK' | 'BATH' | 'KIP'
export type IntakeBatchStatus = 'draft' | 'confirmed' | 'settled'

/** DB constraint: draft | approved | closed | cancelled */
export type SettlementStatus = 'draft' | 'approved' | 'closed' | 'cancelled'

/** DB constraint: unpaid | partial | paid */
export type PaymentStatus = 'unpaid' | 'partial' | 'paid'

export type RubberSupplierType = 'tieu_dien' | 'dai_ly' | 'hop_tac_xa' | 'cong_ty' | 'nong_truong' | 'farmer'
export type PaymentMethod = 'cash' | 'bank_transfer'

// ===== NHÀ CUNG CẤP MỦ =====

export interface RubberSupplier {
  id: string
  code: string
  name: string
  phone?: string
  address?: string
  tax_code?: string
  bank_account?: string
  bank_name?: string
  contact_person?: string
  country: string
  supplier_type: RubberSupplierType
  notes?: string
  is_active: boolean
  created_at: string
  updated_at: string
}

// ===== ĐỢT NHẬP MỦ (rubber_intake_batches) =====

export interface RubberIntakeBatch {
  id: string
  source_type: RubberSourceType
  intake_date: string
  supplier_id?: string
  supplier?: RubberSupplier
  product_code?: string

  // Mủ Việt: chốt theo tấn
  settled_qty_ton?: number
  settled_price_per_ton?: number

  // Mủ Lào trực tiếp: mua theo kg
  purchase_qty_kg?: number
  unit_price?: number
  price_currency: RubberCurrency
  total_amount?: number

  // Chi tiết nhập kho (chung)
  gross_weight_kg?: number
  net_weight_kg?: number
  drc_percent?: number
  finished_product_ton?: number
  avg_unit_price?: number

  // Tham chiếu
  invoice_no?: string
  sct_ref?: string
  location_name?: string
  buyer_name?: string
  vehicle_plate?: string
  vehicle_label?: string
  exchange_rate?: number
  fund_transfer_id?: string

  notes?: string
  status: IntakeBatchStatus
  created_by?: string
  created_at: string
  updated_at: string
}

export interface RubberIntakeBatchFormData {
  source_type: RubberSourceType
  intake_date: string
  supplier_id?: string
  product_code?: string
  settled_qty_ton?: number
  settled_price_per_ton?: number
  purchase_qty_kg?: number
  unit_price?: number
  price_currency?: RubberCurrency
  total_amount?: number
  gross_weight_kg?: number
  net_weight_kg?: number
  drc_percent?: number
  finished_product_ton?: number
  avg_unit_price?: number
  invoice_no?: string
  sct_ref?: string
  location_name?: string
  buyer_name?: string
  vehicle_plate?: string
  vehicle_label?: string
  exchange_rate?: number
  fund_transfer_id?: string
  notes?: string
}

// ===== LÝ LỊCH MỦ PHIẾU (rubber_profiles) =====
// Schema thật: profile_code, intake_date, procurement_team, vehicle_plate,
//   driver_name, has_trailer, trailer_plate, origin, product_code,
//   weight_at_origin_kg, weight_at_factory_kg, weight_diff_kg, weight_diff_percent,
//   compartments, batch_ids,
//   qc_approved/by/at, accounting_approved/by/at, procurement_approved/by/at, security_approved/by/at
//   status, notes, created_by, created_at, updated_at

export interface RubberProfile {
  id: string
  profile_code: string
  intake_date: string
  procurement_team?: string

  vehicle_plate: string
  driver_name?: string
  has_trailer: boolean
  trailer_plate?: string

  origin?: string
  product_code?: string

  // Khối lượng
  weight_at_origin_kg?: number
  weight_at_factory_kg?: number
  weight_diff_kg?: number
  weight_diff_percent?: number

  // Sơ đồ khoang
  compartments?: Record<string, any>[]  // JSONB

  // DRC & KL khô
  drc_percent?: number
  net_weight_kg?: number

  // Liên kết đợt mua
  batch_ids?: string[]                  // UUID[]

  // Ký duyệt 4 cấp
  qc_approved: boolean
  qc_approved_by?: string
  qc_approved_at?: string
  accounting_approved: boolean
  accounting_approved_by?: string
  accounting_approved_at?: string
  procurement_approved: boolean
  procurement_approved_by?: string
  procurement_approved_at?: string
  security_approved: boolean
  security_approved_by?: string
  security_approved_at?: string

  status: string                        // draft | confirmed
  notes?: string
  created_by?: string
  created_at: string
  updated_at: string

  // Join
  supplier?: RubberSupplier
}

export interface RubberProfileFormData {
  intake_date?: string
  procurement_team?: string
  vehicle_plate: string
  driver_name?: string
  has_trailer?: boolean
  trailer_plate?: string
  origin?: string
  product_code?: string
  weight_at_origin_kg?: number
  weight_at_factory_kg?: number
  compartments?: Record<string, any>[]
  drc_percent?: number
  net_weight_kg?: number
  batch_ids?: string[]
  qc_approved?: boolean
  accounting_approved?: boolean
  procurement_approved?: boolean
  security_approved?: boolean
  notes?: string
}

// ===== CHUYỂN TIỀN LÀO (lao_fund_transfers) =====
// Schema thật: transfer_code, transfer_date, amount_lak, fee_lak, net_received_lak,
//   amount_bath, fee_bath, net_received_bath, transfer_method, reference_no,
//   receiver_name, notes, created_by, created_at, updated_at

export interface LaoFundTransfer {
  id: string
  transfer_code: string
  transfer_date: string
  amount_lak?: number
  fee_lak?: number
  net_received_lak?: number
  amount_bath?: number
  fee_bath?: number
  net_received_bath?: number
  transfer_method?: string
  reference_no?: string
  receiver_name?: string
  notes?: string
  created_by?: string
  created_at: string
  updated_at: string
}

export interface LaoFundTransferFormData {
  transfer_code?: string
  transfer_date: string
  amount_lak?: number
  fee_lak?: number
  amount_bath?: number
  fee_bath?: number
  transfer_method?: string
  reference_no?: string
  receiver_name?: string
  notes?: string
}

export interface LaoFundBalance {
  total_transferred_lak: number
  total_spent_lak: number
  balance_lak: number
  total_transferred_bath: number
  total_spent_bath: number
  balance_bath: number
}

// ===== XUẤT HÀNG LÀO → NHÀ MÁY (lao_shipments) =====
// Schema thật: shipment_code, shipment_date, profile_id, fund_transfer_id,
//   total_weight_kg, lot_codes, vehicle_plate,
//   loading_cost_lak, loading_cost_bath, transport_cost_vnd,
//   departed_at, arrived_at, arrived_date, status, stock_in_id, notes

export interface LaoShipment {
  id: string
  shipment_code: string
  shipment_date: string
  profile_id?: string
  profile?: RubberProfile
  fund_transfer_id?: string

  total_weight_kg?: number
  lot_codes?: string[]                  // TEXT[]
  vehicle_plate?: string

  loading_cost_lak?: number
  loading_cost_bath?: number
  transport_cost_vnd?: number

  departed_at?: string
  arrived_at?: string
  arrived_date?: string                 // DATE

  status: 'loading' | 'in_transit' | 'arrived' | 'completed'
  stock_in_id?: string                  // FK → WMS stock_in_orders
  notes?: string
  created_by?: string
  created_at: string
  updated_at: string
}

export interface LaoShipmentFormData {
  shipment_code?: string
  shipment_date: string
  profile_id?: string
  fund_transfer_id?: string
  total_weight_kg?: number
  lot_codes?: string[]
  vehicle_plate?: string
  loading_cost_lak?: number
  loading_cost_bath?: number
  transport_cost_vnd?: number
  departed_at?: string
  notes?: string
}

// ===== QUYẾT TOÁN THANH TOÁN (rubber_settlements) =====
// Schema thật: settlement_code, source_type, supplier_id, settlement_date,
//   batch_ids, weighed_kg, drc_percent, finished_product_ton, total_qty_ton,
//   unit_price, currency, exchange_rate,
//   total_amount, total_amount_vnd, paid_amount, remaining_amount,
//   payment_status, approved_by, approved_at,
//   bank_account, bank_name, payment_method,
//   notes, status, created_by, created_at, updated_at

export interface RubberSettlement {
  id: string
  settlement_code: string
  source_type: RubberSourceType
  supplier_id?: string
  supplier?: RubberSupplier
  settlement_date: string

  batch_ids?: string[]                  // UUID[]
  weighed_kg?: number
  drc_percent?: number
  finished_product_ton?: number
  total_qty_ton?: number

  unit_price?: number
  currency: RubberCurrency
  exchange_rate?: number

  total_amount?: number
  total_amount_vnd?: number
  paid_amount?: number
  remaining_amount?: number

  payment_status: PaymentStatus         // unpaid | partial | paid
  approved_by?: string
  approved_at?: string

  bank_account?: string
  bank_name?: string
  payment_method?: string

  notes?: string
  status: SettlementStatus              // draft | approved | closed | cancelled
  created_by?: string
  created_at: string
  updated_at: string

  payments?: RubberSettlementPayment[]
}

export interface RubberSettlementFormData {
  source_type: RubberSourceType
  settlement_date: string
  supplier_id?: string
  batch_ids?: string[]
  weighed_kg?: number
  drc_percent?: number
  finished_product_ton?: number
  total_qty_ton?: number
  unit_price?: number
  currency?: RubberCurrency
  exchange_rate?: number
  total_amount?: number
  total_amount_vnd?: number
  payment_method?: string
  bank_account?: string
  bank_name?: string
  notes?: string
}

// ===== THANH TOÁN TỪNG ĐỢT (rubber_settlement_payments) =====
// Schema thật: settlement_id, payment_no, payment_date, amount, currency,
//   method, cash_amount, transfer_amount, reference_no, bank_name, notes

export interface RubberSettlementPayment {
  id: string
  settlement_id: string
  settlement?: RubberSettlement
  payment_no: number
  payment_date: string
  amount: number
  currency: RubberCurrency
  method: PaymentMethod
  cash_amount?: number
  transfer_amount?: number
  reference_no?: string
  bank_name?: string
  notes?: string
  created_by?: string
  created_at: string
}

export interface RubberSettlementPaymentFormData {
  settlement_id: string
  payment_date: string
  amount: number
  currency?: RubberCurrency
  method?: PaymentMethod
  cash_amount?: number
  transfer_amount?: number
  reference_no?: string
  bank_name?: string
  notes?: string
}

// ===== PAGINATION =====

export interface RubberPaginationParams {
  page: number
  pageSize: number
  search?: string
  source_type?: RubberSourceType
  supplier_id?: string
  status?: string
  from_date?: string
  to_date?: string
  product_code?: string
  vehicle_plate?: string
  country?: string
}

export interface RubberPaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

// ===== DASHBOARD / REPORT TYPES =====

export interface RubberMonthlySummary {
  year: number
  month: number
  vn_supplier_count: number
  vn_total_settled_ton: number
  vn_total_amount_vnd: number
  lao_direct_total_kg: number
  lao_direct_total_lak: number
  lao_direct_total_bath: number
  lao_fund_balance_lak: number
  lao_fund_balance_bath: number
  lao_agent_total_kg: number
  lao_agent_total_kip: number
  lao_agent_total_vnd: number
  total_fresh_weight_kg: number
  total_intake_weight_kg: number
  total_finished_product_ton: number
  total_amount_vnd: number
}

export interface RubberSupplierReport {
  supplier_id: string
  supplier_name: string
  source_type: RubberSourceType
  batch_count: number
  total_fresh_weight_kg: number
  total_intake_weight_kg: number
  avg_drc_percent: number
  total_finished_product_ton: number
  total_amount: number
  currency: RubberCurrency
}

export interface LaoTrackingRow {
  date: string
  transfer_lak?: number
  transfer_bath?: number
  purchase_location?: string
  purchase_qty_kg?: number
  purchase_price?: number
  purchase_currency?: RubberCurrency
  purchase_amount?: number
  shipment_weight_kg?: number
  shipment_arrival_kg?: number
  stock_balance_kg?: number
  fund_balance_lak?: number
  fund_balance_bath?: number
  notes?: string
}

export interface RubberDebtSummary {
  supplier_id: string
  supplier_name: string
  source_type: RubberSourceType
  total_settled: number
  total_paid: number
  remaining_debt: number
  currency: RubberCurrency
  last_payment_date?: string
}

// ===== HELPER CONSTANTS =====

export const SOURCE_TYPE_LABELS: Record<RubberSourceType, string> = {
  vietnam: 'Mủ Việt Nam',
  lao_direct: 'Mủ Lào (Trực tiếp)',
  lao_agent: 'Mủ Lào (Đại lý)',
}

export const SOURCE_TYPE_SHORT: Record<RubberSourceType, string> = {
  vietnam: '🇻🇳 Việt',
  lao_direct: '🇱🇦 Lào TT',
  lao_agent: '🤝 Lào ĐL',
}

export const SOURCE_TYPE_COLORS: Record<RubberSourceType, string> = {
  vietnam: 'bg-red-100 text-red-700',
  lao_direct: 'bg-blue-100 text-blue-700',
  lao_agent: 'bg-amber-100 text-amber-700',
}

export const CURRENCY_LABELS: Record<RubberCurrency, string> = {
  VND: 'VND (₫)',
  LAK: 'LAK (₭)',
  BATH: 'BATH (฿)',
  KIP: 'KIP (₭)',
}

export const INTAKE_STATUS_LABELS: Record<IntakeBatchStatus, string> = {
  draft: 'Nháp',
  confirmed: 'Đã xác nhận',
  settled: 'Đã quyết toán',
}

export const INTAKE_STATUS_COLORS: Record<IntakeBatchStatus, string> = {
  draft: 'bg-gray-100 text-gray-600',
  confirmed: 'bg-blue-100 text-blue-700',
  settled: 'bg-green-100 text-green-700',
}

export const SETTLEMENT_STATUS_LABELS: Record<SettlementStatus, string> = {
  draft: 'Nháp',
  approved: 'Đã duyệt',
  closed: 'Đã đóng',
  cancelled: 'Đã huỷ',
}

export const SETTLEMENT_STATUS_COLORS: Record<SettlementStatus, string> = {
  draft: 'bg-gray-100 text-gray-600',
  approved: 'bg-blue-100 text-blue-700',
  closed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
}

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  unpaid: 'Chưa trả',
  partial: 'Trả một phần',
  paid: 'Đã trả đủ',
}

export const PAYMENT_STATUS_COLORS: Record<PaymentStatus, string> = {
  unpaid: 'bg-red-100 text-red-700',
  partial: 'bg-amber-100 text-amber-700',
  paid: 'bg-green-100 text-green-700',
}

export const SHIPMENT_STATUS_LABELS: Record<LaoShipment['status'], string> = {
  loading: 'Đang xếp hàng',
  in_transit: 'Đang vận chuyển',
  arrived: 'Đã đến NM',
  completed: 'Hoàn tất',
}

export const SHIPMENT_STATUS_COLORS: Record<LaoShipment['status'], string> = {
  loading: 'bg-yellow-100 text-yellow-700',
  in_transit: 'bg-blue-100 text-blue-700',
  arrived: 'bg-purple-100 text-purple-700',
  completed: 'bg-green-100 text-green-700',
}

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Tiền mặt',
  bank_transfer: 'Chuyển khoản',
}

export const SUPPLIER_TYPE_LABELS: Record<RubberSupplierType, string> = {
  tieu_dien: 'Tiểu điền',
  dai_ly: 'Đại lý',
  hop_tac_xa: 'Hợp tác xã',
  cong_ty: 'Công ty',
  nong_truong: 'Nông trường',
  farmer: 'Nông dân',
}