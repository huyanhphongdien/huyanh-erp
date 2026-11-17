// ============================================================================
// SALES ORDER TYPES — src/services/sales/salesTypes.ts
// Module Quản lý Đơn hàng Bán quốc tế - Huy Anh Rubber ERP
// Primary color: #1B4D3E
// ============================================================================

import { palette } from '../../theme/palette'

// ===== SHARED ENUMS & TYPES =====

export type CustomerStatus = 'active' | 'inactive' | 'blacklisted'
export type CustomerTier = 'standard' | 'premium' | 'strategic'
export type PaymentTerms = 'LC_30' | 'LC_60' | 'LC_90' | 'TT_10' | 'TT_30' | 'TT_60' | 'TT_100' | 'CAD' | 'DP'
export type Incoterm = 'FOB' | 'CIF' | 'CNF' | 'DDP' | 'EXW'
export type QualityStandard = 'TCVN_3769' | 'ISO_2000' | 'CUSTOM'
export type PackingType = 'loose_bale' | 'sw_pallet' | 'sw_plastic_pallet' | 'sw_wooden_pallet' | 'wooden_pallet' | 'plastic_pallet' | 'metal_box'
export type ContainerType = '20ft' | '40ft'
export type SalesCurrency = 'USD' | 'EUR' | 'JPY' | 'CNY'

export type SalesOrderStatus = 'draft' | 'confirmed' | 'producing' | 'ready' | 'packing' | 'shipped' | 'delivered' | 'invoiced' | 'paid' | 'cancelled'
/**
 * Trạng thái container. PHẢI khớp CHECK `chk_so_containers_status` trên
 * public.sales_order_containers — trước 26/08/2026 kiểu này chỉ khai 4 giá trị trong khi
 * DB cho phép 7, tức kiểu đang nói dối về database: một dòng status='delivered' đọc lên
 * vẫn lọt qua mọi so sánh mà TypeScript không hề cảnh báo.
 * Thực dùng hôm nay chỉ có planning và shipped; 5 giá trị còn lại là 0 dòng.
 */
export type ContainerStatus =
  | 'planning' | 'packing' | 'packed' | 'sealed' | 'loaded' | 'shipped' | 'delivered'
export type InvoiceStatus = 'draft' | 'issued' | 'sent' | 'paid' | 'cancelled'
export type PaymentStatus = 'unpaid' | 'partial' | 'paid'

// ===== KHÁCH HÀNG QUỐC TẾ (sales_customers) =====

export interface SalesCustomer {
  id: string
  code: string
  /** FK → business_partners.id (Phase 3+). NULL nếu data legacy chưa migrate. */
  bp_id?: string | null
  /** Mã HAC-13 lấy từ BP master (join). Read-only. */
  hac13_code?: string
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
  port_of_discharge?: string
  // Bộ chứng từ xuất khẩu — cước/bảo hiểm CIF + ngày B/L + số/ngày hóa đơn
  freight_amount?: number
  insurance_amount?: number
  bl_date?: string
  invoice_no?: string
  invoice_date?: string
  shipping_marks?: string   // shipping mark riêng đơn (ghi đè hồ sơ khách)
  // Commercial Invoice — khớp mẫu gốc (ô mô tả hàng); trống → mặc định hồ sơ khách
  proforma_date?: string        // "AS PER PROFORMA INVOICE ... DATED <...>"
  item_no?: string              // ITEM NO. (mã hàng của khách)
  packing_desc?: string         // kiểu đóng gói (dòng PACKING)
  invoice_extra_lines?: string  // dòng mô tả riêng theo khách (mỗi dòng 1 mục)

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
  /** Array các giá trị KG/bành chấp nhận trong HĐ (1-2 phần tử).
   *  Multi-value = "linh động" — HĐ thương mại có thể đi 1 trong 2 quy cách. */
  bale_weights_kg?: number[]
  total_bales?: number
  shrink_wrap: boolean
  pallet_required: boolean
  marking_instructions?: string
  packing_note?: string

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
  payment_terms_note?: string
  lc_number?: string
  lc_bank?: string
  lc_expiry_date?: string
  shipment_time?: string

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
  commission_usd_per_mt?: number
  commission_amount?: number
  bank_account?: string
  bank_swift?: string
  /** v10 — auto-sync từ sales_order_contracts.form_data khi HĐ approved/signed */
  bank_full_name?: string      // Tên đầy đủ bank (English, cho L/C)
  bank_address?: string        // Địa chỉ chi nhánh bank
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
  contract_price?: number        // giá ký HĐ (so với đơn giá chốt) — dùng ở tab Tài chính
  dhl_number?: string

  // Đặt cọc
  deposit_amount?: number
  deposit_date?: string
  deposit_note?: string

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

  // Internal stage tracking (Sprint 1 D1, 2026-05-04)
  current_stage?: 'sales' | 'raw_material' | 'production' | 'qc' | 'packing' | 'logistics' | 'delivered'
  current_owner_id?: string
  stage_started_at?: string
  stage_sla_hours?: number

  // ── Họ HĐ — đơn mua tiếp theo HĐ đã ký (sales_family_parties_p1.sql, 17/11/2026) ──
  // Chưa chạy migration → các cột này VẮNG (undefined); đọc qua orderKind()/contractNoForDocs().
  /** Đơn GỐC giữ HĐ đã ký (luôn trỏ gốc, trigger làm phẳng). NULL = HĐ mới. */
  parent_order_id?: string | null
  /** Số đợt: gốc NULL (= đợt 1), đợt con ≥ 2 — trigger trg_so_family_guard cấp, client CHỈ ĐỌC. */
  continuation_seq?: number | null
  /** true: ô CONTRACT NO. trên chứng từ in số HĐ GỐC (chỉ có nghĩa khi có parent_order_id). */
  docs_cite_root?: boolean

  // ── Các bên của đơn ──
  /** NGƯỜI NHẬN HÀNG (khách cuối) của đơn này. NULL = chính người mua. KHÔNG có FK → tên đọc qua `ship_to`. */
  ship_to_customer_id?: string | null
  /** 4 cột CHỮ IN ghi đè ô Consignee/Notify (chỉ để in, không dùng thống kê/công nợ). NULL = tự suy. */
  consignee_name?: string | null
  consignee_address?: string | null
  notify_party?: string | null
  notify_address?: string | null

  // Joined
  customer?: Pick<SalesCustomer, 'id' | 'code' | 'name' | 'short_name' | 'country' | 'tier'>
  items?: SalesOrderItem[]
  current_owner?: {
    id: string
    code?: string
    full_name: string
    email?: string
  } | null
  /** Đơn gốc (embed `parent:parent_order_id(...)`) — null với HĐ mới; vắng khi chưa migration. */
  parent?: SalesOrderParentRef | null
  /** Người nhận hàng — gắn bằng salesOrderService.attachShipTo (truy vấn thứ hai, KHÔNG embed). */
  ship_to?: SalesOrderShipTo | null
}

/** Đơn GỐC của một đợt mua tiếp — đúng các cột embed `parent:parent_order_id(...)` trả về. */
export interface SalesOrderParentRef {
  id: string
  code: string
  contract_no: string | null
  contract_date: string | null
  customer_id: string
  currency: string | null
  status: SalesOrderStatus
}

/** Người nhận hàng của đơn (một hồ sơ sales_customers) — salesOrderService.attachShipTo gắn vào `ship_to`. */
export interface SalesOrderShipTo {
  id: string
  code: string | null
  name: string
  short_name: string | null
  country: string | null
  address: string | null
  /** để cảnh báo "người nhận đang ngừng giao dịch" */
  status?: CustomerStatus | null
}

// ===== SẢN PHẨM TRONG ĐƠN HÀNG (sales_order_items) =====

export interface SalesOrderItem {
  id: string
  sales_order_id: string
  grade: string
  quantity_tons: number
  unit_price: number
  currency?: string
  payment_terms?: string
  total_value_usd?: number
  quantity_kg?: number
  bale_weight_kg?: number
  /** Multi KG/bành accepted (mảng 1-2 phần tử). Linh động khi giao hàng. */
  bale_weights_kg?: number[]
  total_bales?: number
  bales_per_container?: number
  container_count?: number
  packing_type?: string
  packing_note?: string
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
  sort_order?: number
  created_at?: string
}

// ===== CONTAINER TRONG ĐƠN HÀNG (sales_order_containers) =====

export interface SalesOrderContainer {
  id: string
  sales_order_id: string
  container_no?: string | null
  seal_no?: string | null
  container_type?: ContainerType
  gross_weight_kg?: number | null
  tare_weight_kg?: number
  net_weight_kg?: number
  bale_count?: number
  pallet_count?: number | null   // số pallet trong container (cột PALLET của Weight List)
  status: ContainerStatus
  packed_at?: string
  sealed_at?: string
  notes?: string
  created_at: string

  // Chia lot / đợt giao (mỗi container thuộc 1 lot; lot = các container cùng lot_no)
  lot_no?: number | null
  lot_deadline?: string | null   // hạn giao của lot (YYYY-MM-DD)

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
  LC_30: 'L/C 30 ngày',
  LC_60: 'L/C 60 ngày',
  LC_90: 'L/C 90 ngày',
  TT_10: 'T/T 10%',
  TT_30: 'T/T 30%',
  TT_60: 'T/T 60%',
  TT_100: 'T/T 100%',
  CAD: 'CAD',
  DP: 'D/P',
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
  packed: 'Đã đóng xong',
  sealed: 'Đã niêm phong',
  loaded: 'Đã lên xe',
  shipped: 'Đã xuất',
  delivered: 'Đã giao',
}

export const CONTAINER_STATUS_COLORS: Record<ContainerStatus, string> = {
  planning: 'default',
  packing: 'orange',
  packed: 'gold',
  sealed: 'blue',
  loaded: 'cyan',
  shipped: 'green',
  delivered: 'green',
}

// -- Loại đóng gói --
/** 1 dòng lịch sử đổi trạng thái đơn hàng bán (bảng sales_order_status_log). */
export interface SalesOrderStatusLog {
  id: string
  sales_order_id: string
  from_status: string | null
  to_status: string
  changed_by_id: string | null
  changed_by_name: string | null
  reason: string | null
  source: string | null   // 'app' | 'system'
  created_at: string
}

/**
 * Hiển thị 1 đơn hàng bán theo SỐ HỢP ĐỒNG (contract_no) — Logistics/khách dùng số này.
 * Đơn chưa gán HĐ (Sale mới tạo, chưa duyệt) thì fallback về mã SO nội bộ.
 * Dùng THỐNG NHẤT mọi nơi đang hiện SO-XXXX-XXXX.
 */
export const soDisplayCode = (
  o?: { contract_no?: string | null; code?: string | null } | null,
): string => (o?.contract_no || o?.code || '—')

/**
 * Chuẩn hoá SỐ HĐ y như index DB ux_sales_orders_contract_no_norm_active: bỏ khoảng trắng 2 đầu,
 * gộp khoảng trắng liền nhau, chữ HOA. Hai số chuẩn hoá bằng nhau = TRÙNG (DB chặn với đơn chưa huỷ).
 */
export const normalizeContractNo = (s?: string | null): string =>
  (s || '').trim().replace(/\s+/g, ' ').toUpperCase()

// ===== HỌ HĐ (MUA TIẾP) + CÁC BÊN CỦA ĐƠN — sales_family_parties_p1.sql (17/11/2026) =====
// BA SỐ, MỖI SỐ MỘT VIỆC: ① code = mã nội bộ SO-… · ② contract_no = SỐ ĐƠN (soDisplayCode, gốc số mọi
// chứng từ PKL/WL/BC…) · ③ số HĐ KÝ = số đơn của ĐƠN GỐC (contractNoForDocs) — in ô CONTRACT NO., khai hải quan.

/** Loại đơn: HĐ mới (đơn gốc / đơn thường) hay đợt MUA TIẾP theo HĐ đã ký. */
export type OrderKind = 'new' | 'continuation'

/** Một bên của đơn (người mua `customer` hoặc người nhận `ship_to`) — đủ để hiện tên. */
export interface OrderPartyLike {
  id?: string
  code?: string | null
  name?: string | null
  short_name?: string | null
  country?: string | null
}

/** Nhãn loại đơn (EnumTag / Excel / tooltip). Từ ngữ: "Đợt", cố ý KHÔNG dùng "LOT/Lô" (đã mang 4 nghĩa khác). */
export const ORDER_KIND_LABELS: Record<OrderKind, string> = {
  new: 'HĐ mới',
  continuation: 'Mua tiếp',
}

/**
 * Màu nhãn loại đơn. Mua tiếp = màu THƯƠNG HIỆU (palette.js), cố ý KHÔNG dùng gold/blue/green/red của trạng thái.
 * ⚠ HĐ mới hiện CHỮ THƯỜNG, đừng vẽ Tag 'default' (dễ đọc nhầm là "Nháp").
 */
export const ORDER_KIND_COLORS: Record<OrderKind, string> = {
  new: 'default',
  continuation: palette.brand,
}

/** 'continuation' khi đơn có đơn gốc (parent_order_id), ngược lại 'new'. */
export const orderKind = (o?: { parent_order_id?: string | null } | null): OrderKind =>
  (o?.parent_order_id ? 'continuation' : 'new')

type DocsCiteInput = {
  contract_no?: string | null
  code?: string | null
  contract_date?: string | null
  parent_order_id?: string | null
  docs_cite_root?: boolean | null
  parent?: { contract_no?: string | null; contract_date?: string | null } | null
} | null | undefined

/**
 * SỐ HĐ KÝ in ô "CONTRACT NO." / "Số hợp đồng" trên chứng từ gửi khách & ngân hàng (cũng là số khai hải quan).
 * Đợt mua tiếp có docs_cite_root = true → số HĐ GỐC (đọc qua liên kết `parent`, KHÔNG đoán theo đuôi '-D<n>');
 * mọi đơn khác → soDisplayCode(o). Số CHỨNG TỪ (PKL/WL/BC…) vẫn theo soDisplayCode — đừng dùng hàm này cho số đó.
 */
export const contractNoForDocs = (o: DocsCiteInput): string =>
  o?.parent_order_id && o.docs_cite_root && o.parent?.contract_no ? o.parent.contract_no : soDisplayCode(o)

/** Ngày HĐ đi cùng contractNoForDocs ("DATED …"): đợt in số gốc → ngày HĐ GỐC; còn lại → contract_date của đơn. */
export const contractDateForDocs = (o: DocsCiteInput): string | null =>
  o?.parent_order_id && o.docs_cite_root && o.parent?.contract_no
    ? (o.parent.contract_date ?? o.contract_date ?? null)
    : (o?.contract_date ?? null)

// Đuôi pháp nhân bỏ đi khi khách trống short_name (36/66 khách, có cả HARMONYTIDE và QINGDAO JINTONG).
// Lặp tới khi hết khớp: 'QINGDAO JINTONG TRADING CO., LTD' → bỏ 'CO., LTD' → bỏ 'TRADING' → 'QINGDAO JINTONG'.
const LEGAL_SUFFIXES: RegExp[] = [
  /[\s,]+\(?\s*(PVT|PRIVATE)\s*\)?\.?\s*(LTD|LIMITED)\.?$/i,  // (PRIVATE) LIMITED · (PVT) LTD. · PVT LTD
  /[\s,]+PTE\.?,?\s*(LTD|LIMITED)\.?$/i,                       // PTE. LTD. · PTE LTD · PTE., LTD
  /[\s,]+(CO|COMPANY)\.?\s*,?\s*(LTD|LIMITED)\.?$/i,           // CO., LTD · Co Ltd · Co.,Ltd · COMPANY LIMITED
  /[\s,]+SDN\.?\s*BHD\.?$/i,
  /[\s,]+GMBH(\s*&\s*CO\.?\s*KG)?$/i,
  /[\s,]+(L\.?L\.?C\.?(-FZ)?|FZ-?LLC|FZCO|FZE)$/i,
  /[\s,]+(B\.?V\.?|S\.?L\.?|S\.?A\.?|AG|INC\.?|JSC|PLC)$/i,
  /[\s,]+(CORPORATION|CORP\.?|LIMITED|LTD\.?|COMPANY|TRADING)$/i,
]
const VN_LEGAL_PREFIX = /^(CÔNG\s+TY|CTY)\s+(TNHH(\s+MTV)?|CỔ\s+PHẦN|CP)\s+/i

/**
 * Tên NGẮN của một bên (người mua / người nhận) cho thẻ Kanban, Sổ đơn, "A → B": short_name nếu có;
 * trống thì tên đầy đủ bỏ đuôi pháp nhân ('PTE. LTD.', 'CO., LTD', 'LIMITED', 'TRADING', 'CORPORATION'…)
 * và tiền tố 'CÔNG TY TNHH/CỔ PHẦN'. Không bao giờ rút về rỗng; không có tên → '—'.
 */
export function partyShortName(c?: { short_name?: string | null; name?: string | null } | null): string {
  const s = (c?.short_name || '').replace(/\s+/g, ' ').trim()
  if (s) return s
  const full = (c?.name || '').replace(/\s+/g, ' ').trim().replace(/[\s,.;:–-]+$/, '')
  if (!full) return '—'
  const strip = (x: string): string => {
    let n = x.replace(/[\s,.;:–-]+$/, '')
    for (let guard = 0; guard < 6; guard++) {
      const before = n
      for (const re of LEGAL_SUFFIXES) n = n.replace(re, '').replace(/[\s,.;:–-]+$/, '')
      if (n === before) break
    }
    return n
  }
  let n = strip(full.replace(VN_LEGAL_PREFIX, ''))
  // Đuôi pháp nhân đứng TRƯỚC ngoặc địa danh: 'ASIMCO NVH TECHNOLOGIES CO., LTD. (ANHUI)' → 'ASIMCO NVH TECHNOLOGIES (ANHUI)'
  const paren = /^(.*\S)\s*(\([^()]*\))$/.exec(n)
  if (paren) {
    const head = strip(paren[1])
    if (head.length >= 2) n = `${head} ${paren[2]}`
  }
  return n.length >= 2 ? n : full
}

/**
 * NGƯỜI NHẬN HÀNG (khách cuối) của một đơn. ⚠ BẢN SAO luật view v_sales_order_end_customer
 * (docs/migrations/sales_family_parties_p1.sql): end_customer_id = COALESCE(ship_to_customer_id, customer_id),
 * via_intermediary = (ship_to_customer_id IS NOT NULL). SỬA MỘT NƠI PHẢI SỬA CẢ HAI.
 * `party` = hồ sơ đã nạp sẵn (o.ship_to hoặc o.customer); null nếu chưa nạp.
 * Công nợ / thanh toán / hoa hồng LUÔN theo người mua (customer_id) — hàm này chỉ để xem & thống kê tấn.
 */
export function receiverOf(o?: {
  customer_id?: string | null
  ship_to_customer_id?: string | null
  customer?: OrderPartyLike | null
  ship_to?: OrderPartyLike | null
} | null): { id: string | null; viaIntermediary: boolean; party: OrderPartyLike | null } {
  if (!o) return { id: null, viaIntermediary: false, party: null }
  if (o.ship_to_customer_id) {
    return { id: o.ship_to_customer_id, viaIntermediary: true, party: o.ship_to ?? null }
  }
  return { id: o.customer_id ?? null, viaIntermediary: false, party: o.customer ?? null }
}

export const PACKING_TYPE_LABELS: Record<PackingType, string> = {
  loose_bale: 'Loose Bale',
  sw_plastic_pallet: 'Shrink Wrapped plastic pallets',
  sw_wooden_pallet: 'Shrink Wrapped wooden pallets',
  plastic_pallet: 'Plastic Pallet',
  wooden_pallet: 'Wooden Pallet',
  metal_box: 'Metal Box',
  sw_pallet: 'SW Pallet (Shrink Wrap)', // LEGACY — đã tách thành 2 loại SW, giữ để hiển thị đơn cũ
}

// Danh sách CHO CHỌN trên dropdown (bỏ sw_pallet cũ — khách yêu cầu tách plastic/wooden).
export const PACKING_TYPE_OPTIONS: { value: PackingType; label: string }[] = [
  { value: 'loose_bale', label: 'Loose Bale' },
  { value: 'sw_plastic_pallet', label: 'Shrink Wrapped plastic pallets' },
  { value: 'sw_wooden_pallet', label: 'Shrink Wrapped wooden pallets' },
  { value: 'plastic_pallet', label: 'Plastic Pallet' },
  { value: 'wooden_pallet', label: 'Wooden Pallet' },
  { value: 'metal_box', label: 'Metal Box' },
]

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

// -- Trạng thái thanh toán (thu tiền của đơn) --
// MỘT bộ nhãn cho mọi màn bán hàng (audit 17/11/2026: Dòng tiền 'Đã TT/Một phần/Chưa TT', Sổ lô
// 'Đã thu đủ/Thu 1 phần/Chưa thu', Kanban 'Đã thu tiền/…' — 3 bộ cho cùng một trạng thái).
// Dùng chữ "thu" — đúng góc nhìn người bán, khớp "Công nợ khách · Thu tiền", "Lô đã giao chưa thu".
export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  unpaid: 'Chưa thu',
  partial: 'Thu một phần',
  paid: 'Đã thu đủ',
}

// Quy ước màu dòng tiền (CLAUDE.md): vàng = chờ · xanh dương = đang làm · xanh lá = xong · đỏ chỉ cho huỷ/từ chối
export const PAYMENT_STATUS_COLORS: Record<PaymentStatus, string> = {
  unpaid: 'gold',
  partial: 'blue',
  paid: 'green',
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

// Cấp mủ / tên hàng cho Đơn hàng bán (Standard Vietnamese Rubber + tên xuất khẩu)
// Lưu ý: value = label cho các tên EUDR/RSS3 EUDR để in NGUYÊN VĂN lên hợp đồng.
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
  // Tên hàng xuất khẩu EUDR (khách yêu cầu — tránh nhầm lẫn)
  { value: 'SVR10 EUDR', label: 'SVR10 EUDR' },
  { value: 'SVR3L EUDR', label: 'SVR3L EUDR' },
  { value: 'RSS3 EUDR', label: 'RSS3 EUDR' },
  // Tên xuất khẩu viết liền (khách yêu cầu 2026-09-11) — in NGUYÊN VĂN lên hợp đồng.
  { value: 'SVRCV60', label: 'SVRCV60' },
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
  // Thêm 17/11/2026 — nước của khách/người nhận đang có trong sales_customers (SG, LK, AE…) mà danh sách thiếu
  { value: 'SG', label: 'Singapore' },
  { value: 'LK', label: 'Sri Lanka' },
  { value: 'AE', label: 'UAE' },
  { value: 'PH', label: 'Philippines' },
  { value: 'HK', label: 'Hồng Kông' },
  { value: 'NL', label: 'Hà Lan' },
  { value: 'GB', label: 'Anh' },
  { value: 'VN', label: 'Việt Nam' },
  { value: 'OTHER', label: 'Khác' },
] as const

/**
 * Cờ quốc gia từ mã ISO-2 (regional indicator) — sinh được MỌI nước, không cần bảng tra.
 * Audit 17/11/2026: 4 bảng COUNTRY_FLAGS chép tay lệch nhau (khách Nhật/Mỹ/Đức ra 🌐 ở Dashboard).
 * Mã không hợp lệ ('OTHER', rỗng) → ''.
 */
export const countryFlag = (cc?: string | null): string => {
  const c = (cc || '').trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(c)) return ''
  return String.fromCodePoint(...[...c].map((ch) => 127397 + ch.charCodeAt(0)))
}

/** Tên nước tiếng Việt theo COUNTRY_OPTIONS; mã lạ → trả nguyên mã; rỗng → '—'. */
export const countryLabel = (cc?: string | null): string =>
  cc ? (COUNTRY_OPTIONS.find((c) => c.value === cc)?.label ?? cc) : '—'

// Ngân hàng nhận tiền
export const BANK_OPTIONS = [
  { value: 'VTB', label: 'Viettin Bank — Hue Branch' },
  { value: 'BIDV', label: 'BIDV — Hue Branch' },
  { value: 'AGRI', label: 'Agribank — Hue Branch' },
  { value: 'TPB', label: 'TP Bank — Hue Branch' },
  { value: 'EXIM', label: 'Exim Bank — Hue Branch' },
  { value: 'UOB', label: 'UOB — Ho Chi Minh City' },
  { value: 'VCB', label: 'Vietcombank — Hue Branch' },
  { value: 'OTHER', label: 'Khác' },
] as const

// Auto-fill bank details khi chọn ngân hàng (USD accounts)
export const BANK_DETAILS: Record<string, { name: string; account: string; swift: string }> = {
  VTB: { name: 'Viettin Bank, Hue Branch', account: '111002648221', swift: 'ICBVVNVX460' },
  BIDV: { name: 'BIDV, Hue Branch', account: '5510020372', swift: 'BIDVVNVX' },
  AGRI: { name: 'Agribank, Hue Branch', account: '4000201014000', swift: 'VBAAVNVX540' },
  TPB: { name: 'TP Bank, Hue Branch', account: '78468686868', swift: 'TPNVVNVX' },
  EXIM: { name: 'Exim Bank, Hue Branch', account: '100201085', swift: 'EBVIVNVXXXXX' },
  UOB: { name: 'UOB, Ho Chi Minh City', account: '1039019421', swift: 'UOVBVNVX' },
  VCB: { name: 'Vietcombank, Hue Branch', account: '0071001046372', swift: 'BFTVVNVX' },
}

// Cảng xếp hàng tại Việt Nam
export const PORT_OF_LOADING_OPTIONS = [
  { value: 'ANY_PORT_VN', label: 'Any port, Viet Nam' },
  { value: 'HCM_CAT_LAI', label: 'Cát Lái — TP.HCM' },
  { value: 'HCM_HIEP_PHUOC', label: 'Hiệp Phước — TP.HCM' },
  { value: 'VUNG_TAU', label: 'Cái Mép — Vũng Tàu' },
  { value: 'QUY_NHON', label: 'Quy Nhơn' },
  { value: 'DA_NANG', label: 'Đà Nẵng' },
  { value: 'HAI_PHONG', label: 'Hải Phòng' },
] as const

/**
 * Nhãn cảng xếp hàng cho MÀN HÌNH (đừng in thẳng mã 'HCM_CAT_LAI'). Giá trị tự gõ / mã lạ → trả nguyên văn.
 * Nhãn tiếng Anh in trên chứng từ cho khách vẫn ở PORT_LABELS (documentService) — không dùng hàm này.
 */
export const polLabel = (v?: string | null): string =>
  v ? (PORT_OF_LOADING_OPTIONS.find((o) => o.value === v)?.label ?? v) : '—'

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
